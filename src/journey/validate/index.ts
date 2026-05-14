import { RENDERER_VERSION } from "../../render/theme.js";
import type { JourneyContext } from "../../quest/context.js";
import { EFFECT_CATALOG_VERSION, generatedObjectResolverPool } from "../effects.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOption,
} from "../manifest.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "../manifest.js";
import {
  JOURNEY_SHAPE_CATALOG_VERSION,
  getShapePlugin,
} from "../shapes.js";
import { VALUE_MODEL_VERSION } from "../value.js";
import { fail, type ValidationResult } from "./result.js";

const PICK_BEHAVIORS = new Set([
  "record_and_generate_next",
  "advance_sequence",
  "complete_sequence",
  "leave",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionArraysArePresent(option: JourneyOption): boolean {
  return Array.isArray(option.symbols) &&
    Array.isArray(option.operations) &&
    Array.isArray(option.costs) &&
    Array.isArray(option.effects) &&
    Array.isArray(option.burdens) &&
    Array.isArray(option.targets) &&
    Array.isArray(option.triggers) &&
    Array.isArray(option.routeEffects);
}

function validateVersions(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  const expected = {
    contentVersion: context.contentVersion,
    shapeCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    effectCatalogVersion: EFFECT_CATALOG_VERSION,
    valueModelVersion: VALUE_MODEL_VERSION,
    rendererVersion: RENDERER_VERSION,
    manifestContractVersion: MANIFEST_CONTRACT_VERSION,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (manifest.versions[key as keyof typeof expected] !== value) {
      return fail(
        "manifest_version_metadata",
        `Manifest ${key} must be ${value}`,
      );
    }
  }

  return { ok: true };
}

function validateRootOptions(manifest: JourneyManifest): ValidationResult {
  for (const option of manifest.options) {
    if (!Number.isInteger(option.number) || option.number < 1) {
      return fail("invalid_option", "Every option must have a stable option number");
    }

    if (typeof option.text !== "string" || option.text.trim().length === 0) {
      return fail("invalid_option", `Option ${option.number} must have user-facing text`);
    }

    if (!optionArraysArePresent(option)) {
      return fail("invalid_option", `Option ${option.number} must expose structured payload arrays`);
    }

    if (
      typeof option.costConvertedEssence !== "number" ||
      typeof option.effectConvertedEssence !== "number" ||
      typeof option.burdenConvertedEssence !== "number" ||
      typeof option.uncertaintyConvertedEssence !== "number" ||
      typeof option.netConvertedEssence !== "number"
    ) {
      return fail("invalid_option", `Option ${option.number} must expose converted value fields`);
    }

    if (!PICK_BEHAVIORS.has(option.pickBehavior)) {
      return fail("invalid_option", `Option ${option.number} has unsupported pick behavior`);
    }
  }

  return { ok: true };
}

function validateRequiredTargets(manifest: JourneyManifest): ValidationResult {
  const operations = [
    ...manifest.options.flatMap((option) => option.operations),
    ...(manifest.rewardPool?.operations ?? []),
    ...(manifest.precommitted.operations ?? []),
    ...(manifest.tree?.nodes.flatMap((node) =>
      node.branches.flatMap((branch) => [
        ...branch.operations,
        ...(branch.terminal?.operations ?? []),
      ]),
    ) ?? []),
  ];

  for (const operation of operations) {
    if (!isRecord(operation)) {
      continue;
    }

    const selector = operation.targetSelector;
    const selectorRecord: Record<string, unknown> | undefined =
      isRecord(selector) ? selector : undefined;
    if (
      !selectorRecord ||
      selectorRecord.required !== true ||
      selectorRecord.selectorKind === "none"
    ) {
      continue;
    }

    const resolution = operation.targetResolution;
    if (
      !isRecord(resolution) ||
      typeof resolution.candidateCount !== "number" ||
      resolution.candidateCount < 1
    ) {
      return fail(
        "unresolved_target_selector",
        `Required ${String(selectorRecord.selectorKind)} target selector did not resolve`,
      );
    }
  }

  return { ok: true };
}

function validateImmediateCosts(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  for (const option of manifest.options) {
    for (const cost of option.costs) {
      if (!isRecord(cost) || typeof cost.amount !== "number") {
        continue;
      }

      if (cost.kind === "essence" && cost.amount > context.state.quest.resources.essence) {
        return fail("unpayable_immediate_cost", `Option ${option.number} costs more essence than the quest has`);
      }

      if (cost.kind === "omens" && cost.amount > context.state.quest.resources.omens) {
        return fail("unpayable_immediate_cost", `Option ${option.number} costs more omens than the quest has`);
      }
    }
  }

  return { ok: true };
}

function validateTree(manifest: JourneyManifest): ValidationResult {
  if (!manifest.tree) {
    return { ok: true };
  }

  const nodeIds = new Set(manifest.tree.nodes.map((node) => node.id));
  if (!nodeIds.has(manifest.tree.rootNodeId)) {
    return fail("decision_tree_invariants", "Decision tree root node must exist");
  }

  for (const node of manifest.tree.nodes) {
    const hasRandomOutcomes = node.branches.some((branch) =>
      branch.kind === "random_chance"
    );

    if (node.branches.length === 0) {
      return fail("decision_tree_invariants", `Decision tree node ${node.id} must have branches`);
    }

    for (const branch of node.branches) {
      if (branch.kind === "random_chance" && !branch.odds) {
        return fail("decision_tree_invariants", `Random branch ${branch.id} must show odds`);
      }

      if (
        !branch.nextNodeId &&
        !branch.terminal &&
        !(branch.kind === "player_choice" && branch.odds && hasRandomOutcomes)
      ) {
        return fail("decision_tree_invariants", `Branch ${branch.id} must transition or terminate`);
      }

      if (branch.nextNodeId && !nodeIds.has(branch.nextNodeId)) {
        return fail("decision_tree_invariants", `Branch ${branch.id} points to a missing node`);
      }
    }
  }

  return { ok: true };
}

function validateSequenceMenus(manifest: JourneyManifest): ValidationResult {
  if (!manifest.sequence || manifest.sequence.status !== "active") {
    return { ok: true };
  }

  const maxSteps = manifest.sequence.maxSteps ?? manifest.sequence.step;
  for (let step = manifest.sequence.step + 1; step <= maxSteps; step += 1) {
    const menu = manifest.precommitted.sequenceMenus?.[`step${step}`];
    if (!menu || menu.length === 0) {
      return fail("sequence_menu", `Missing sequence menu for step ${step}`);
    }

    const hasExit = menu.some((option) =>
      option.pickBehavior === "advance_sequence" ||
      option.pickBehavior === "complete_sequence" ||
      option.pickBehavior === "leave"
    );
    if (!hasExit) {
      return fail("sequence_menu", `Sequence menu for step ${step} has no legal continuation or exit`);
    }
  }

  return { ok: true };
}

function validateGeneratedObjects(
  generatedObjects: readonly GeneratedObjectDefinition[],
): ValidationResult {
  const seen = new Set<string>();

  for (const generatedObject of generatedObjects) {
    if (seen.has(generatedObject.generatedObjectId)) {
      return fail("invalid_generated_object_definition", `Duplicate generated object ${generatedObject.generatedObjectId}`);
    }
    seen.add(generatedObject.generatedObjectId);

    if (
      typeof generatedObject.generatedObjectId !== "string" ||
      typeof generatedObject.name !== "string" ||
      typeof generatedObject.objectType !== "string" ||
      typeof generatedObject.rulesText !== "string" ||
      !Array.isArray(generatedObject.tags) ||
      !isRecord(generatedObject.references) ||
      !isRecord(generatedObject.valueEstimate) ||
      !isRecord(generatedObject.validation) ||
      !isRecord(generatedObject.payload)
    ) {
      return fail("invalid_generated_object_definition", `Generated object ${generatedObject.generatedObjectId} is incomplete`);
    }
  }

  return { ok: true };
}

export function validateJourneyManifest(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    return fail("manifest_schema_version", `Manifest schema version must be ${MANIFEST_SCHEMA_VERSION}`);
  }

  const versionResult = validateVersions(manifest, context);
  if (!versionResult.ok) return versionResult;

  if (!/^J-\d{6}$/u.test(manifest.journeyId)) {
    return fail("journey_id_format", "Root Journey IDs must use J-000001 formatting");
  }

  const plugin = getShapePlugin(manifest.shapeId);
  const { min, max } = plugin.definition.rootOptionCount;
  const boundedRootOptionCount = manifest.options.filter((option) =>
    option.pickBehavior !== "leave"
  ).length;
  if (boundedRootOptionCount < min || boundedRootOptionCount > max) {
    return fail("root_option_count_within_bounds", `Root option count must be between ${min} and ${max}`);
  }

  const generatedObjects = generatedObjectResolverPool(manifest);
  const checks = [
    validateRootOptions(manifest),
    validateRequiredTargets(manifest),
    validateImmediateCosts(manifest, context),
    validateTree(manifest),
    validateSequenceMenus(manifest),
    validateGeneratedObjects(generatedObjects),
    ...(plugin.validators ?? []).map((validator) =>
      validator.validate({
        manifest,
        context,
        definition: plugin.definition,
        generatedObjects,
      }),
    ),
    plugin.treeValidator?.(manifest, context, generatedObjects) ?? { ok: true },
    plugin.precommitValidator?.(manifest) ?? { ok: true },
  ];

  return checks.find((result) => !result.ok) ?? { ok: true };
}

export type { ValidationResult } from "./result.js";
