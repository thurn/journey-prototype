import { fillOptions as legacyFillOptions } from "../fillers/shapeFills.js";
import { validateDecisionTree } from "../validate/tree.js";
import type {
  JourneyPayloadCompatibility,
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
  JourneyTopology,
  ShapeValidator,
} from "./types.js";

export const JOURNEY_SHAPE_CATALOG_VERSION = "journey-shapes:v13";

export const commonValidationRules = [
  "root_option_count_within_bounds",
  "options_match_shape_topology",
  "option_values_are_comparable_for_shape",
  "symmetric_option_values_are_comparable",
];

export type RawJourneyShapeDefinition = Omit<
  JourneyShapeDefinition,
  | "payloadCompatibility"
  | "menuValueChecks"
  | "allowsRouteReward"
  | "allowsRouteSideEffects"
  | "compoundCoherence"
  | "requiresPrecommittedRandom"
  | "compoundAllowsRouteOnlyReward"
> & {
  readonly payloadCompatibility?: readonly JourneyPayloadCompatibility[];
  readonly menuValueChecks?: JourneyShapeDefinition["menuValueChecks"];
  readonly allowsRouteReward?: boolean;
  readonly allowsRouteSideEffects?: boolean;
  readonly compoundCoherence?: JourneyShapeDefinition["compoundCoherence"];
  readonly requiresPrecommittedRandom?: boolean;
  readonly compoundAllowsRouteOnlyReward?: boolean;
};

const DEFAULT_MENU_VALUE_CHECKS: JourneyShapeDefinition["menuValueChecks"] = {
  positiveBands: false,
  symmetricBands: false,
  escalationOrRiskExempt: false,
};

export function versionContribution(
  id: JourneyShapeId,
  topology: JourneyTopology,
) {
  return {
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    id,
    topology,
  };
}

export function freezeSerializable<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeSerializable)) as T;
  }

  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          freezeSerializable(nestedValue),
        ]),
      ),
    ) as T;
  }

  return value;
}

export function cloneSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSerializable);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneSerializable(nestedValue),
      ]),
    );
  }

  return value;
}

function compatibility(
  familyId: JourneyPayloadCompatibility["familyId"],
  variants: readonly string[],
  reason: string,
): JourneyPayloadCompatibility {
  return {
    familyId,
    variants,
    legality: variants.length > 0 ? "legal" : "unsupported",
    reason,
  };
}

function payloadCompatibilityFor(
  definition: RawJourneyShapeDefinition,
): readonly JourneyPayloadCompatibility[] {
  const { id, topology, supportedTags } = definition;
  const isDecisionTree = topology === "decision_tree";
  const isDirectMenu = topology === "direct_menu";
  const isRandomCommit = topology === "random_commit";
  const isDelayedHook = topology === "delayed_hook";
  const hasCard =
    supportedTags.includes("card") ||
    supportedTags.includes("target") ||
    supportedTags.includes("rewrite");
  const hasDreamsign = supportedTags.includes("dreamsign");
  const generatedObjectShape = [
    "same_cost_different_rewards",
    "one_target_many_operations",
    "mirrored_operations",
    "one_operation_many_targets",
  ].includes(id);

  return Object.freeze([
    compatibility(
      "adapter",
      ["current"],
      "All canonical shapes can use the typed adapter payload.",
    ),
    compatibility(
      "card",
      [
        ...(hasCard && isDirectMenu
          ? ["adapter-compatible-card-operations"]
          : []),
      ],
      hasCard
        ? "Shape can expose card targets or card-operation menu rows."
        : "Shape does not expose a legal card-target operation frame.",
    ),
    compatibility(
      "dreamsign",
      hasDreamsign && isDirectMenu
        ? ["adapter-compatible-dreamsign-operations"]
        : [],
      hasDreamsign
        ? "Shape can expose Dreamsign targets, rewards, shops, or pool edits."
        : "Shape does not expose a legal Dreamsign target or shop frame.",
    ),
    compatibility(
      "bane",
      [],
      false
        ? "Shape can frame Bane gain, purge, and transformation decisions."
        : "Shape lacks a controlled Bane-operation or loss-choice frame.",
    ),
    compatibility(
      "resource",
      [
        ...((isDirectMenu ||
          topology === "single_offer_refusal" ||
          topology === "single_reward")
          ? ["adapter-compatible-resource-operations"]
          : []),
      ],
      isDirectMenu ||
        topology === "single_offer_refusal" ||
        topology === "single_reward"
        ? "Shape can compare visible resource costs or rewards."
        : "Shape-specific payloads own resource timing through sequence or commit metadata.",
    ),
    compatibility(
      "route",
      [],
      false
        ? "Shape can expose route edits without mutating state."
        : "Shape topology is not a route-edit scene.",
    ),
    compatibility(
      "shop",
      [],
      "Shape lacks a shop row price frame.",
    ),
    compatibility(
      "dreamwell",
      [],
      false
        ? "Shape can expose bounded Dreamwell and battle-window modifiers."
        : "Shape does not provide a shared timing window for Dreamwell payloads.",
    ),
    compatibility(
      "status",
      [],
      false
        ? "Shape can expose one-time, temporary, or delayed rule mutations."
        : "Shape lacks a legal status or rule-mutation frame.",
    ),
    compatibility(
      "hook",
      [
        ...(isDelayedHook
          ? ["adapter-compatible-delayed-hooks"]
          : []),
      ],
      isDelayedHook
        ? "Shape can store visible delayed hook contracts in precommitted metadata."
        : "Shape has no delayed hook contract surface.",
    ),
    compatibility(
      "return",
      id === "paired_return" ? ["paired-return-seal-borrow-trade"] : [],
      id === "paired_return"
        ? "Shape creates a paired return hook with a specific remembered anchor."
        : "Shape does not create paired return anchors.",
    ),
    compatibility(
      "random",
      [
        ...(id === "resolved_random_series"
          ? ["reveal-roll-wager"]
          : []),
        ...((isRandomCommit ||
          [
            "probability_ladder",
          ].includes(id)) &&
        id !== "resolved_random_series"
          ? ["adapter-compatible-random-envelope"]
          : []),
      ],
      isRandomCommit ||
        [
          "probability_ladder",
        ].includes(id)
        ? "Shape exposes bounded random, reveal, odds, or wager metadata."
        : "Shape is deterministic and does not require random envelope metadata.",
    ),
    compatibility(
      "generated_object",
      generatedObjectShape ? ["adapter-compatible-generated-objects"] : [],
      generatedObjectShape
        ? "Shape can host manifest-local generated object grants or transforms."
        : "Shape topology has no legal manifest-local generated object host.",
    ),
    compatibility(
      "decision_tree",
      isDecisionTree ? ["complete-decision-tree"] : [],
      isDecisionTree
        ? "Shape owns complete multi-level tree visibility."
        : "Shape is not a decision-tree topology.",
    ),
  ]);
}

export function freezeShapeDefinition(
  definition: RawJourneyShapeDefinition,
): JourneyShapeDefinition {
  const payloadCompatibility =
    definition.payloadCompatibility ?? payloadCompatibilityFor(definition);
  const version = {
    ...(definition.versionContribution &&
    typeof definition.versionContribution === "object" &&
    !Array.isArray(definition.versionContribution)
      ? definition.versionContribution
      : { value: definition.versionContribution }),
    payloadCompatibility,
  };

  return Object.freeze({
    ...definition,
    rootOptionCount: Object.freeze({ ...definition.rootOptionCount }),
    supportedTags: Object.freeze([...definition.supportedTags]),
    payloadCompatibility: Object.freeze(
      payloadCompatibility.map(freezeSerializable),
    ) as readonly JourneyPayloadCompatibility[],
    validationRules: Object.freeze([...definition.validationRules]),
    repairPreferences: Object.freeze([...definition.repairPreferences]),
    versionContribution: freezeSerializable(version),
    menuValueChecks: Object.freeze({
      ...DEFAULT_MENU_VALUE_CHECKS,
      ...(definition.menuValueChecks ?? {}),
    }),
    allowsRouteReward: definition.allowsRouteReward ?? false,
    allowsRouteSideEffects: definition.allowsRouteSideEffects ?? false,
    compoundCoherence: definition.compoundCoherence ?? "default",
    requiresPrecommittedRandom: definition.requiresPrecommittedRandom ?? false,
    compoundAllowsRouteOnlyReward:
      definition.compoundAllowsRouteOnlyReward ?? false,
  });
}

export type DefineShapePluginInput = Omit<
  JourneyShapePlugin,
  "id" | "definition" | "fill"
> & {
  readonly definition: RawJourneyShapeDefinition;
  readonly fill?: JourneyShapePlugin["fill"];
};

export function defineShapePlugin(
  input: DefineShapePluginInput,
): JourneyShapePlugin {
  const definition = freezeShapeDefinition(input.definition);
  const plugin: JourneyShapePlugin = {
    id: definition.id,
    definition,
    scoreWeight: input.scoreWeight,
    fill:
      input.fill ??
      ((args) =>
        legacyFillOptions(definition.id, args.context, args.drawContext, args.stage)),
    ...(input.validators
      ? { validators: Object.freeze([...input.validators]) }
      : {}),
    ...(input.optionValueValidator
      ? { optionValueValidator: input.optionValueValidator }
      : {}),
    ...(input.treeValidator
      ? { treeValidator: input.treeValidator }
      : {}),
    ...(input.precommitValidator
      ? { precommitValidator: input.precommitValidator }
      : {}),
    ...(input.repair
      ? {
          repair: freezeSerializable({
            ...input.repair,
            ...(input.repair.actions
              ? { actions: [...input.repair.actions] }
              : {}),
          }),
        }
      : {}),
    ...(input.generatedObjects
      ? { generatedObjects: freezeSerializable(input.generatedObjects) }
      : {}),
    ...(input.debugPayloads
      ? { debugPayloads: freezeSerializable([...input.debugPayloads]) }
      : {}),
    ...(input.versionContribution
      ? { versionContribution: freezeSerializable(input.versionContribution) }
      : {}),
  };

  return Object.freeze(plugin);
}

export const decisionTreeValidator: ShapeValidator = {
  ruleId: "decision_tree_invariants",
  passMessage:
    "Decision-tree topology is complete and legal when applicable.",
  checkedPayloads: ({ treeChecked, checked }) =>
    treeChecked.length > 0 ? treeChecked : checked,
  validate: ({ manifest, context, generatedObjects }) =>
    validateDecisionTree(manifest, context, generatedObjects),
};
