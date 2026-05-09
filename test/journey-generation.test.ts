import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import {
  DEBUG_PAYLOAD_FAMILIES,
  type DebugPayloadSelection,
} from "../src/journey/debugPayloads.js";
import {
  attachTargetResolutionMetadata,
  resolveDreamsignTargets,
} from "../src/journey/effects.js";
import { buildConservativeJourneyForShape } from "../src/journey/fillers/index.js";
import {
  CARD_OPERATION_DEBUG_CATALOG,
  compatibleCardOperations,
} from "../src/journey/fillers/cardOperationCatalog.js";
import {
  DREAMSIGN_OPERATION_DEBUG_CATALOG,
  DREAMSIGN_PREDICATE_PROFILES,
  compatibleDreamsignOperations,
  renderChosenDreamsignOperationText,
  type DreamsignOperationFamily,
} from "../src/journey/fillers/dreamsignOperationCatalog.js";
import {
  CARD_DRAFT_PROFILES,
  cardDraftText,
  compoundPayloadMenuFill,
  draftCards,
  option,
  optionFromResolvedShapeFill,
  randomCardGain,
  starterSurgeryRewardSlots,
  target,
} from "../src/journey/fillers/shared.js";
import { generatedObjectDefinition as buildGeneratedObjectDefinition } from "../src/journey/fillers/generatedObjects.js";
import {
  cardExactTarget,
  contentBackedCardCandidates,
} from "../src/journey/fillers/namedCardPayloads.js";
import {
  contentBackedDreamsignCandidates,
  dreamsignExactTarget,
  namedDreamsignShopRowCandidateGroups,
} from "../src/journey/fillers/dreamsignPayloads.js";
import {
  routeEditCatalog,
  routeEditMenuRewards,
  type RouteEditMenuVariantId,
} from "../src/journey/fillers/routeEditCatalog.js";
import { generateNextJourney } from "../src/journey/generate.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOperation,
  JourneyStage,
} from "../src/journey/manifest.js";
import {
  adaptJourneyOptionOperations,
  adaptPrecommittedOperations,
} from "../src/journey/operationAdapters.js";
import { repairOrFallbackJourney } from "../src/journey/repair.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "../src/journey/shapes.js";
import {
  buildValidationReport,
  validateJourneyManifest,
} from "../src/journey/validate/index.js";
import { validateRouteEffects } from "../src/journey/validate/payloadContracts.js";
import {
  evaluateOptionValue,
  valueStarterCleanup,
  valueUsefulNonStarterCardSacrifice,
} from "../src/journey/value.js";
import { validateGeneratedObjectDefinitions } from "../src/journey/validate/metadataReferences.js";
import { buildJourneyContext } from "../src/quest/context.js";
import { createInitialJourneyState } from "../src/quest/init.js";
import {
  deterministicTieJitter,
  drawInt,
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../src/util/rng.js";
import { stableStringify } from "../src/util/stableJson.js";
import {
  batchReachabilityFamilies,
  findReachabilityEvidence,
  reachabilityFor,
  type ReachabilityFamilyRequirement,
} from "./helpers/journeyReachability.js";

const runDiversityAudit = process.env.JOURNEY_DIVERSITY_AUDIT === "1";
const diversityAuditIt = runDiversityAudit ? it : it.skip;
const runSlowTests = process.env.JOURNEY_SLOW_TESTS === "1";
const slowIt = runSlowTests ? it : it.skip;

async function context(seed = "default") {
  const content = await loadContent(process.cwd());
  const contentVersion = "test-content-version";
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion,
  });

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

async function contextWithEmptyDreamsignPool(seed = "s17") {
  const content = await loadContent(process.cwd());
  const contentVersion = "test-content-version";
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion,
  });

  state.quest.dreamsignPoolIds = [];
  state.quest.dreamsignPoolSummary = {
    tidalPoolCount: 0,
    neutralCatalogCount: 0,
  };

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

function contextFromContent(
  content: Awaited<ReturnType<typeof loadContent>>,
  seed: string,
  stage: "early" | "mid" | "late" = "early",
) {
  const contentVersion = "test-content-version";
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion,
  });

  state.quest.resources.dreamscape =
    stage === "early" ? 1 : stage === "mid" ? 2 : 4;

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

function fillForShape(
  shapeId: JourneyShapeId,
  journeyContext: Awaited<ReturnType<typeof context>>,
) {
  return buildConservativeJourneyForShape({
    context: journeyContext,
    drawContext: {
      seed: journeyContext.state.quest.seed,
      contentVersion: journeyContext.contentVersion,
      rootJourneyIndex: journeyContext.state.generator.rootJourneyIndex,
    },
    journeyId: "J-000001",
    shapeId,
    stage: "early",
    selectedTags: ["cleanup", "dreamsign", "reward"],
    shapeScores: JOURNEY_SHAPES.map((shape, index) => ({
      shapeId: shape.id,
      score: 100 - index,
    })),
  });
}

function fillForShapeAtStage(
  shapeId: JourneyShapeId,
  journeyContext: Awaited<ReturnType<typeof context>>,
  stage: JourneyStage,
) {
  return buildConservativeJourneyForShape({
    context: journeyContext,
    drawContext: {
      seed: journeyContext.state.quest.seed,
      contentVersion: journeyContext.contentVersion,
      rootJourneyIndex: journeyContext.state.generator.rootJourneyIndex,
    },
    journeyId: "J-000001",
    shapeId,
    stage,
    selectedTags:
      stage === "late"
        ? ["convert", "gamble", "reward", "route", "sacrifice"]
        : ["build", "cleanup", "immediate", "reward"],
    shapeScores: JOURNEY_SHAPES.map((shape, index) => ({
      shapeId: shape.id,
      score: 100 - index,
    })),
  });
}

function compoundManifestForFamily(
  family: "scissor_saint" | "molting_archive" | "withered_orchard" | "mixed_service",
  journeyContext: Awaited<ReturnType<typeof context>>,
) {
  const drawContext = {
    seed: journeyContext.state.quest.seed,
    contentVersion: journeyContext.contentVersion,
    rootJourneyIndex: journeyContext.state.generator.rootJourneyIndex,
  };
  const fill = compoundPayloadMenuFill({
    context: journeyContext,
    drawContext,
    label: `test:${family}`,
    family,
    shapeId: "service_menu",
    stage: "early",
  });

  if (!fill) {
    throw new Error(`Unable to compose compound payload family ${family}`);
  }

  const base = fillForShape("service_menu", journeyContext);
  const precommitted = refreshPrecommittedOperations({
    routeEdits: fill.options.flatMap((option) => option.routeEffects ?? []),
  });

  return {
    ...base,
    options: fill.options.map(optionFromResolvedShapeFill),
    precommitted,
  };
}

async function findValidForcedShapeManifest(
  shapeId: JourneyShapeId,
  seedPrefix: string,
  predicate: (manifest: JourneyManifest) => boolean,
  attempts = 120,
): Promise<{
  manifest: JourneyManifest;
  journeyContext: Awaited<ReturnType<typeof context>>;
}> {
  for (let index = 0; index < attempts; index += 1) {
    const journeyContext = await context(`${seedPrefix}-${index}`);
    const manifest = fillForShape(shapeId, journeyContext);

    if (
      validateJourneyManifest(manifest, journeyContext).ok &&
      predicate(manifest)
    ) {
      return { manifest, journeyContext };
    }
  }

  throw new Error(`No valid ${shapeId} manifest matched ${seedPrefix}`);
}

function generatedObjectDefinition(
  overrides: Partial<GeneratedObjectDefinition> = {},
): GeneratedObjectDefinition {
  return {
    generatedObjectKind: "card",
    generatedObjectId: "generated-card-test-lantern",
    name: "Test Lantern",
    objectType: "Event Card",
    rulesText: "0 energy Event. Fast. Gain 1 omen, then draw 1 card.",
    tags: ["journey-only", "card", "event"],
    references: { rules: ["Fast", "omens", "card"] },
    lifetime: "journey_only",
    valueEstimate: {
      convertedEssence: 120,
      confidence: "medium",
      basis: "Test manifest-local generated object value.",
    },
    validation: {
      source: "generated_manifest_local",
      status: "validated",
      ruleIds: ["test_generated_object"],
    },
    payload: { kind: "generated_card" },
    ...overrides,
  } as GeneratedObjectDefinition;
}

function generatedObjectOperation(
  generatedObject: GeneratedObjectDefinition,
): JourneyOperation {
  return {
    operationId: `test:generated-object:${generatedObject.generatedObjectId}`,
    operationKind: "generated_object",
    role: "generated_object",
    visibility: "debug",
    generatedObject,
    payload: {
      source: "operation_local_definition",
    },
  };
}

function generatedOptionText(manifest: JourneyManifest): string[] {
  const text = manifest.options.map((option) => option.text);

  if (manifest.rewardPool) {
    text.push(manifest.rewardPool.summary);
  }

  for (const menu of Object.values(manifest.precommitted.sequenceMenus ?? {})) {
    text.push(...menu.map((option) => option.text));
  }

  for (const node of manifest.tree?.nodes ?? []) {
    text.push(...node.branches.map((branch) => branch.text));
  }

  return text;
}

function structuredOperationTags(manifest: JourneyManifest): string[] {
  const operations = [
    ...manifest.options.flatMap((option) => option.operations),
    ...(manifest.rewardPool?.operations ?? []),
    ...(manifest.precommitted.operations ?? []),
    ...(manifest.tree?.nodes.flatMap((node) =>
      node.branches.flatMap((branch) => [
        ...branch.operations,
        ...(branch.terminal?.operations ?? []),
      ])
    ) ?? []),
  ];
  const tags = operations.map((operation) => {
    switch (operation.operationKind) {
      case "cost":
        return `cost:${operation.resource}:${operation.resourceSemantics?.amountKind ?? "fixed"}`;
      case "reward":
        return `reward:${operation.rewardKind}`;
      case "burden":
        return `burden:${operation.burdenKind}`;
      case "route_edit":
        return `route_edit:${operation.editKind}`;
      case "delayed_hook":
        return `delayed_hook:${operation.hookKind ?? operation.triggerSelector?.triggerKind ?? "contract"}`;
      case "paired_return":
        return `paired_return:${operation.contract?.returnScene.returnSceneKind ?? "contract"}`;
      case "random_envelope":
      case "reveal_envelope":
        return `random:${operation.envelopeKind ?? operation.operationKind}`;
      case "status":
        return `status:${operation.statusKind}`;
      case "generated_object":
        return `generated_object:${operation.generatedObject.generatedObjectKind}`;
      case "target":
        return `target:${operation.targetSelector.selectorKind}:${operation.targetSelector.selection}`;
      case "validation_requirement":
        return `validation:${operation.requirementKind}`;
    }
  });

  tags.push(
    ...manifest.generatedObjects.map(
      (generatedObject) =>
        `generated_object:${generatedObject.generatedObjectKind}`,
    ),
  );

  return [...new Set(tags)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function normalizeMechanical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeMechanical);
  }

  if (typeof value === "number") {
    return "#";
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            "text",
            "description",
            "amount",
            "count",
            "choiceCount",
            "takeCount",
            "costConvertedEssence",
            "effectConvertedEssence",
            "burdenConvertedEssence",
            "uncertaintyConvertedEssence",
            "netConvertedEssence",
          ].includes(key),
      )
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, entry]) => [key, normalizeMechanical(entry)]),
  );
}

function randomPrecommitForOption(
  manifest: JourneyManifest,
  optionNumber: number,
): unknown {
  const random = manifest.precommitted.random;

  if (!Array.isArray(random)) {
    return undefined;
  }

  return (
    random.find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "optionNumber" in entry &&
        entry.optionNumber === optionNumber,
    ) ?? random[optionNumber - 1]
  );
}

function exactVisibleSignature(manifest: JourneyManifest): string {
  return stableStringify({
    shape: manifest.shapeId,
    options: manifest.options.map((option) => option.text),
    rewardPool: manifest.rewardPool?.summary,
    tree: manifest.tree?.nodes.map((node) =>
      node.branches.map((branch) => branch.text),
    ),
  });
}

function mechanicalSignature(manifest: JourneyManifest): string {
  return stableStringify(
    normalizeMechanical({
      shape: manifest.shapeId,
      options: manifest.options.map((option) => ({
        costs: option.costs,
        effects: option.effects,
        burdens: option.burdens,
        targets: option.targets,
        triggers: option.triggers,
        routeEffects: option.routeEffects,
        pickBehavior: option.pickBehavior,
        randomPrecommit: randomPrecommitForOption(manifest, option.number),
      })),
      rewardPool: manifest.rewardPool?.rewards,
      tree: manifest.tree?.nodes.map((node) =>
        node.branches.map((branch) => ({
          label: branch.label,
          kind: branch.kind,
          costs: branch.costs,
          effects: branch.effects,
          burdens: branch.burdens,
          targets: branch.targets,
          triggers: branch.triggers,
          routeEffects: branch.routeEffects,
          odds: branch.odds ? true : false,
          next: branch.nextNodeId ? true : false,
          terminal: branch.terminal?.outcome,
        })),
      ),
    }),
  );
}

function structuralSignature(manifest: JourneyManifest): string {
  return stableStringify(
    normalizeMechanical({
      shape: manifest.shapeId,
      options: manifest.options.map((option) => ({
        costKinds: option.costs.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry
            ? entry.kind
            : "unknown",
        ),
        effectKinds: option.effects.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry
            ? entry.kind
            : "unknown",
        ),
        burdenKinds: option.burdens.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry
            ? entry.kind
            : "unknown",
        ),
        targetKinds: option.targets.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry
            ? entry.kind
            : "unknown",
        ),
        triggerKinds: option.triggers.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry
            ? entry.kind
            : "unknown",
        ),
        routeKinds: option.routeEffects.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry
            ? entry.kind
            : "unknown",
        ),
        pickBehavior: option.pickBehavior,
      })),
      tree: manifest.tree?.nodes.map((node) =>
        node.branches.map((branch) => ({
          label: branch.label,
          kind: branch.kind,
          costKinds: branch.costs.map((entry) =>
            typeof entry === "object" && entry !== null && "kind" in entry
              ? entry.kind
              : "unknown",
          ),
          effectKinds: branch.effects.map((entry) =>
            typeof entry === "object" && entry !== null && "kind" in entry
              ? entry.kind
              : "unknown",
          ),
          burdenKinds: branch.burdens.map((entry) =>
            typeof entry === "object" && entry !== null && "kind" in entry
              ? entry.kind
              : "unknown",
          ),
          targetKinds: branch.targets.map((entry) =>
            typeof entry === "object" && entry !== null && "kind" in entry
              ? entry.kind
              : "unknown",
          ),
          hasOdds: branch.odds ? true : false,
          next: branch.nextNodeId ? true : false,
          terminal: branch.terminal?.outcome,
        })),
      ),
    }),
  );
}

function payloadCount(value: {
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  burdens?: readonly unknown[];
  targets?: readonly unknown[];
  triggers?: readonly unknown[];
  routeEffects?: readonly unknown[];
}): number {
  return (
    (value.costs?.length ?? 0) +
    (value.effects?.length ?? 0) +
    (value.burdens?.length ?? 0) +
    (value.targets?.length ?? 0) +
    (value.triggers?.length ?? 0) +
    (value.routeEffects?.length ?? 0)
  );
}

function expectTypedOperations(
  operations: readonly unknown[] | undefined,
  label: string,
  legacyPayloadCount: number,
) {
  if (legacyPayloadCount === 0) {
    return;
  }

  expect(operations?.length, label).toBeGreaterThan(0);
  for (const operation of operations ?? []) {
    expect(operation, label).toEqual(
      expect.objectContaining({
        operationKind: expect.any(String),
        role: expect.any(String),
        visibility: expect.any(String),
        payload: expect.any(Object),
      }),
    );
  }
}

function expectManifestPayloadsHaveTypedOperations(manifest: JourneyManifest) {
  for (const option of manifest.options) {
    expectTypedOperations(
      option.operations,
      `option ${option.number}`,
      payloadCount(option),
    );
  }

  for (const node of manifest.tree?.nodes ?? []) {
    for (const branch of node.branches) {
      expectTypedOperations(
        branch.operations,
        `branch ${branch.id}`,
        payloadCount(branch),
      );

      if (branch.terminal) {
        expectTypedOperations(
          branch.terminal.operations,
          `branch ${branch.id} terminal`,
          payloadCount(branch.terminal),
        );
      }
    }
  }

  if (manifest.rewardPool) {
    expectTypedOperations(
      manifest.rewardPool.operations,
      "reward pool",
      manifest.rewardPool.rewards.length,
    );
  }

  expectTypedOperations(
    manifest.precommitted.operations,
    "precommitted outcomes",
    (manifest.precommitted.random?.length ?? 0) +
      (manifest.precommitted.delayed?.length ?? 0) +
      (manifest.precommitted.pairedReturn?.length ?? 0) +
      (manifest.precommitted.routeEdits?.length ?? 0),
  );
}

function refreshOptionOperations(
  option: JourneyManifest["options"][number],
): JourneyManifest["options"][number] {
  return {
    ...option,
    operations: adaptJourneyOptionOperations(option),
  };
}

function refreshPrecommittedOperations(
  precommitted: Omit<JourneyManifest["precommitted"], "operations">,
): JourneyManifest["precommitted"] {
  return {
    ...precommitted,
    operations: adaptPrecommittedOperations(precommitted),
  };
}

function expectValidationReportMatchesValidator(
  manifest: JourneyManifest,
  journeyContext: Awaited<ReturnType<typeof context>>,
) {
  const result = validateJourneyManifest(manifest, journeyContext);
  const report = buildValidationReport(manifest, journeyContext);

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected invalid manifest");
  }

  expect(report.ok).toBe(false);
  expect(report.firstFailure).toMatchObject({
    ruleId: result.rule,
    message: result.message,
  });
  expect(report.rules).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ruleId: result.rule,
        status: "fail",
        message: result.message,
      }),
    ]),
  );
}

function forcedDreamsignOperationManifest(
  journeyContext: Awaited<ReturnType<typeof context>>,
) {
  const dreamsignPayload = {
    familyId: "dreamsign",
    variantId: "dreamsign-transform-duplicate-pool",
    qaId: "dreamsign/dreamsign-transform-duplicate-pool",
    description:
      "Dreamsign transform, duplicate, pool, random, trigger, and trade payload coverage.",
    supportedShapes: ["curated_reward_trio"],
    supportedStages: "all",
  } satisfies DebugPayloadSelection;

  return generateNextJourney({
    context: journeyContext,
    forcedStage: "mid",
    forcedDebugPayload: dreamsignPayload,
  });
}

function largestGroupSize(signatures: readonly string[]): number {
  const counts = new Map<string, number>();

  for (const signature of signatures) {
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }

  return Math.max(...counts.values());
}

describe("deterministic RNG helpers", () => {
  it("draws stable labeled values without mutating inputs", () => {
    const drawContext: DrawContext = {
      seed: "seed-a",
      contentVersion: "content-a",
      rootJourneyIndex: 1,
    };
    const items = ["a", "b", "c", "d"];

    expect(drawInt(drawContext, "amount", 1, 10)).toBe(
      drawInt(drawContext, "amount", 1, 10),
    );
    expect(drawInt(drawContext, "amount", 1, 10)).not.toBe(
      drawInt({ ...drawContext, rootJourneyIndex: 2 }, "amount", 1, 10),
    );
    expect(
      weightedChoice(drawContext, "choice", [
        { item: "low", weight: 1 },
        { item: "high", weight: 10 },
      ]),
    ).toBe(
      weightedChoice(drawContext, "choice", [
        { item: "low", weight: 1 },
        { item: "high", weight: 10 },
      ]),
    );
    expect(shuffleDeterministic(drawContext, "shuffle", items)).toEqual(
      shuffleDeterministic(drawContext, "shuffle", items),
    );
    expect(items).toEqual(["a", "b", "c", "d"]);
    expect(
      deterministicTieJitter(drawContext, "tie", 2),
    ).toBeGreaterThanOrEqual(-2);
    expect(deterministicTieJitter(drawContext, "tie", 2)).toBeLessThanOrEqual(
      2,
    );
  });
});

describe("generateNextJourney", () => {
  it("creates J-000001 and deterministic byte-stable manifest data", async () => {
    const journeyContext = await context();
    const first = generateNextJourney({ context: journeyContext });
    const second = generateNextJourney({ context: journeyContext });

    expect(first.journeyId).toBe("J-000001");
    expect(first.schemaVersion).toBe(2);
    expect(first.versions).toMatchObject({
      contentVersion: "test-content-version",
      shapeCatalogVersion: "journey-shapes:v13",
      effectCatalogVersion: "effects:v7",
      valueModelVersion: "value:v10",
      rendererVersion: "renderer:v1",
      manifestContractVersion: "manifest:v2",
      validationContractVersion: "validation:v1",
    });
    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(first.debug.optionValues).toHaveLength(first.options.length);
    expect(first.debug.validation).toMatchObject({
      ok: true,
      failed: 0,
      rules: expect.arrayContaining([
        expect.objectContaining({
          ruleId: "semantic_operations",
          severity: "error",
          status: "pass",
          checked: expect.arrayContaining([
            expect.objectContaining({
              scope: "option",
              payloadFamily: "adapter",
              shapeId: first.shapeId,
            }),
          ]),
        }),
      ]),
    });
    expect(first.debug.repair).toMatchObject({
      status: "accepted_immediately",
      forcedShape: false,
      finalShapeId: first.shapeId,
    });
    expect(validateJourneyManifest(first, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("keeps generated references resolvable and normal text mechanical", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    for (const option of manifest.options) {
      expect(option.text).not.toContain("Shape:");
      expect(option.text).not.toContain("Dream Journey");
    }
  });

  it("keeps every canonical shape eligible for a fresh first Journey", async () => {
    const journeyContext = await context();
    const expectedShapeIds = new Set(JOURNEY_SHAPES.map((shape) => shape.id));
    const seenShapeIds = new Set<JourneyShapeId>();

    for (
      let index = 0;
      index < 1000 && seenShapeIds.size < expectedShapeIds.size;
      index += 1
    ) {
      const seededState = structuredClone(journeyContext.state);

      seededState.quest.seed = `shape-coverage:${index}`;
      seededState.generator = {
        rootJourneyIndex: 1,
        lastJourneyId: null,
        cursors: {},
      };
      seededState.pendingJourney = null;
      seededState.history = [];

      const manifest = generateNextJourney({
        context: {
          ...journeyContext,
          state: seededState,
        },
      });

      seenShapeIds.add(manifest.shapeId);
      expect(manifest.debug.shapeScores).toHaveLength(JOURNEY_SHAPES.length);
      expect(
        Math.min(...manifest.debug.shapeScores.map((entry) => entry.score)),
      ).toBeGreaterThan(0);
    }

    expect([...seenShapeIds].sort()).toEqual([...expectedShapeIds].sort());
  });

  it("weights high-variety shapes above low-template shapes", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "early",
    });
    const scores = Object.fromEntries(
      manifest.debug.shapeScores.map((entry) => [entry.shapeId, entry.score]),
    );

    expect(scores.one_operation_many_targets).toBeGreaterThan(
      scores.escalating_reward_chain,
    );
    expect(scores.curated_reward_trio).toBeGreaterThan(scores.single_offer);
    expect(scores.same_cost_different_rewards).toBeGreaterThan(
      scores.probability_ladder,
    );
    expect(
      Math.min(...manifest.debug.shapeScores.map((entry) => entry.score)),
    ).toBeGreaterThan(0);
  });

  it("rejects forced debug payloads against the actual selected shape", async () => {
    const journeyContext = await context();
    const constrainedPayload = {
      familyId: "future",
      variantId: "shop-only",
      qaId: "future/shop-only",
      description: "Synthetic constrained payload for compatibility coverage.",
      supportedShapes: ["shop_row"],
      supportedStages: "all",
    } satisfies DebugPayloadSelection;

    expect(() =>
      generateNextJourney({
        context: journeyContext,
        forcedShapeId: "single_reward",
        forcedStage: "mid",
        forcedDebugPayload: constrainedPayload,
      }),
    ).toThrow(
      "Debug payload 'future/shop-only' does not support shape 'single_reward'. Supported shapes: shop_row.",
    );
  });

  it("forces manifest-local generated object definitions and references", async () => {
    const journeyContext = await context("generated-objects");
    const variants = [
      {
        familyId: "generated_object",
        variantId: "generated-card",
        qaId: "generated_object/generated-card",
        description: "Generated card coverage.",
        expectedKind: "card",
      },
      {
        familyId: "generated_object",
        variantId: "generated-dreamsign",
        qaId: "generated_object/generated-dreamsign",
        description: "Generated Dreamsign coverage.",
        expectedKind: "dreamsign",
      },
      {
        familyId: "generated_object",
        variantId: "generated-status",
        qaId: "generated_object/generated-status",
        description: "Generated status coverage.",
        expectedKind: "status",
      },
      {
        familyId: "generated_object",
        variantId: "generated-transfiguration",
        qaId: "generated_object/generated-transfiguration",
        description: "Generated transfiguration coverage.",
        expectedKind: "transfiguration",
      },
    ] as const;

    for (const variant of variants) {
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "late",
        forcedDebugPayload: {
          familyId: variant.familyId,
          variantId: variant.variantId,
          qaId: variant.qaId,
          description: variant.description,
          supportedShapes: ["curated_reward_trio"],
          supportedStages:
            variant.expectedKind === "status" ? ["mid", "late"] : ["late"],
        } satisfies DebugPayloadSelection,
      });
      const definition = manifest.generatedObjects[0]!;
      const operations = manifest.options.flatMap(
        (option) => option.operations,
      );

      expect(manifest.shapeId).toBe("curated_reward_trio");
      expect(manifest.debug.validation.ok).toBe(true);
      expect(definition).toMatchObject({
        generatedObjectKind: variant.expectedKind,
        validation: {
          source: "generated_manifest_local",
          status: "validated",
        },
      });
      expect(definition.generatedObjectId).toMatch(/^generated-/u);
      expect(definition.rulesText.length).toBeGreaterThan(20);
      expect(definition.tags).toContain("journey-only");
      expect(definition.valueEstimate.convertedEssence).toBeGreaterThan(0);
      expect(
        operations.map((operation) => operation.targetSelector?.selectorKind),
      ).toContain("generated_object");
      expect(
        operations.map((operation) => operation.targetResolution?.sourcePool),
      ).toContain("manifest_generated");
      expect(manifest.precommitted.delayed).toHaveLength(1);
      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });
    }
  });

  it("selects generated objects naturally rarely, with late high-weirdness weighting", async () => {
    const content = await loadContent(process.cwd());
    const indexes = [0, 10, 16];
    const countGenerated = (stage: "early" | "late") =>
      indexes.map((index) => {
        const journeyContext = contextFromContent(
          content,
          `natural-generated-${stage}-${index}`,
          stage,
        );
        const manifest = buildConservativeJourneyForShape({
          context: journeyContext,
          drawContext: {
            seed: journeyContext.state.quest.seed,
            contentVersion: journeyContext.contentVersion,
            rootJourneyIndex: journeyContext.state.generator.rootJourneyIndex,
          },
          journeyId: "J-000001",
          shapeId: "one_target_many_operations",
          stage,
          selectedTags:
            stage === "late"
              ? ["convert", "gamble", "reward", "route", "sacrifice"]
              : ["build", "cleanup", "immediate", "reward"],
          shapeScores: JOURNEY_SHAPES.map((shape, shapeIndex) => ({
            shapeId: shape.id,
            score: 100 - shapeIndex,
          })),
        });

        expect(
          validateJourneyManifest(manifest, journeyContext),
          `${stage}:${index}`,
        ).toEqual({
          ok: true,
        });

        return manifest;
      }).filter((manifest) => manifest.generatedObjects.length > 0).length;

    const earlyGenerated = countGenerated("early");
    const lateGenerated = countGenerated("late");

    expect(earlyGenerated).toBeGreaterThan(0);
    expect(earlyGenerated).toBeLessThanOrEqual(1);
    expect(lateGenerated).toBeGreaterThan(earlyGenerated);
    expect(lateGenerated).toBeLessThanOrEqual(3);
  });

  it("builds natural generated objects from deterministic reusable fragments", async () => {
    const journeyContext = await context("natural-generated-object-fragments");
    const cards = journeyContext.content.cards
      .slice(0, 16)
      .map((card) => ({ id: card.id, name: card.name }));
    const dreamsigns = journeyContext.content.dreamsigns
      .slice(0, 16)
      .map((dreamsign) => ({ id: dreamsign.id, name: dreamsign.name }));

    for (const kind of [
      "card",
      "dreamsign",
      "status",
      "transfiguration",
    ] satisfies GeneratedObjectDefinition["generatedObjectKind"][]) {
      const definitions = Array.from({ length: 48 }, (_, index) =>
        buildGeneratedObjectDefinition({
          kind,
          drawContext: {
            seed: `natural-generated-${kind}-${index}`,
            contentVersion: journeyContext.contentVersion,
            rootJourneyIndex: 0,
          },
          shapeId: "one_target_many_operations",
          stage: "late",
          cards,
          dreamsigns,
        }),
      );
      const referenceSignatures = new Set(
        definitions.map((definition) => stableStringify(definition.references)),
      );

      expect(new Set(definitions.map((definition) => definition.name)).size).toBeGreaterThan(1);
      expect(new Set(definitions.map((definition) => definition.rulesText)).size).toBeGreaterThan(1);
      expect(new Set(definitions.map((definition) => definition.lifetime)).size).toBeGreaterThan(1);
      expect(new Set(definitions.map((definition) => definition.duration?.label ?? "none")).size).toBeGreaterThan(1);
      expect(new Set(definitions.map((definition) => definition.valueEstimate.convertedEssence)).size).toBeGreaterThan(1);
      expect(referenceSignatures.size).toBeGreaterThan(1);

      for (const definition of definitions) {
        expect(definition.generatedObjectId).toMatch(/^generated-[a-z]+-[a-z0-9-]+$/u);
        expect(definition.tags).toContain("journey-only");
        expect(definition.tags).toContain("shape-one_target_many_operations");
        expect(definition.payload.generatedBy).toBe("natural_generated_object_builder");
        expect(
          validateGeneratedObjectDefinitions(
            { generatedObjects: [definition] } as JourneyManifest,
            journeyContext,
          ),
        ).toEqual({ ok: true });
      }
    }
  });

  slowIt("samples generated-object natural selection rates across a wider deterministic batch", async () => {
    const content = await loadContent(process.cwd());
    const countGenerated = (stage: "early" | "late") =>
      Array.from({ length: 80 }, (_, index) => {
        const journeyContext = contextFromContent(
          content,
          `natural-generated-${stage}-${index}`,
          stage,
        );
        const manifest = buildConservativeJourneyForShape({
          context: journeyContext,
          drawContext: {
            seed: journeyContext.state.quest.seed,
            contentVersion: journeyContext.contentVersion,
            rootJourneyIndex: journeyContext.state.generator.rootJourneyIndex,
          },
          journeyId: "J-000001",
          shapeId: "one_target_many_operations",
          stage,
          selectedTags:
            stage === "late"
              ? ["convert", "gamble", "reward", "route", "sacrifice"]
              : ["build", "cleanup", "immediate", "reward"],
          shapeScores: JOURNEY_SHAPES.map((shape, shapeIndex) => ({
            shapeId: shape.id,
            score: 100 - shapeIndex,
          })),
        });

        expect(
          validateJourneyManifest(manifest, journeyContext),
          `${stage}:${index}`,
        ).toEqual({
          ok: true,
        });

        return manifest;
      }).filter((manifest) => manifest.generatedObjects.length > 0).length;

    const earlyGenerated = countGenerated("early");
    const lateGenerated = countGenerated("late");

    expect(earlyGenerated).toBeGreaterThan(0);
    expect(earlyGenerated).toBeLessThan(10);
    expect(lateGenerated).toBeGreaterThan(earlyGenerated);
    expect(lateGenerated).toBeLessThan(30);
  }, 180000);

  it("exposes resource edge-case value-band semantics in operations and value debug", async () => {
    const journeyContext = await context("value-resource");
    const resourcePayload = {
      familyId: "resource",
      variantId: "resource-edge-cases",
      qaId: "resource/resource-edge-cases",
      description: "Resource edge cases for value-band coverage.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: resourcePayload,
    });
    const operationBands = manifest.options.flatMap((journeyOption) =>
      journeyOption.operations.flatMap(
        (operation) => operation.value?.bands ?? [],
      ),
    );
    const valueBandComponents = manifest.debug.optionValues.flatMap((entry) =>
      entry.components.filter((component) =>
        component.kind === "value-band" ||
        component.kind === "random-envelope-risk"
      ),
    );

    expect(operationBands.map((band) => band.id)).toEqual(
      expect.arrayContaining([
        "maximum",
        "percentage",
        "all_remaining",
        "random_range",
        "cap_change",
        "multi_omen",
      ]),
    );
    expect(operationBands.map((band) => band.label)).toEqual(
      expect.arrayContaining([
        "all-remaining",
        "random-range",
        "cap-change",
        "multi-omen",
      ]),
    );
    expect(valueBandComponents.map((component) => component.label)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("maximum"),
        expect.stringContaining("percentage"),
        expect.stringContaining("all_remaining"),
        expect.stringContaining("random_range"),
        expect.stringContaining("cap_change"),
        expect.stringContaining("multi_omen"),
      ]),
    );
    expect(manifest.distinctness.equivalenceBands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "percentage_cost" }),
        expect.objectContaining({ field: "max_resource_effect" }),
        expect.objectContaining({ field: "all_remaining_cost" }),
        expect.objectContaining({ field: "random_range" }),
      ]),
    );
    expect(manifest.shapeId).toBe("service_menu");
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(manifest.options.flatMap((option) => option.operations)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          resourceSemantics: expect.objectContaining({
            amountKind: "restore_to_maximum",
          }),
        }),
        expect.objectContaining({
          operationKind: "cost",
          resourceSemantics: expect.objectContaining({
            amountKind: "all_remaining",
          }),
        }),
        expect.objectContaining({
          operationKind: "burden",
          burdenKind: "reward_reduction",
        }),
      ]),
    );
  });

  it("serializes percentage-of-current essence costs with current-resource amount semantics", async () => {
    const journeyContext = await context("bane-resource");
    const resourcePayload = {
      familyId: "resource",
      variantId: "resource-edge-cases",
      qaId: "resource/resource-edge-cases",
      description: "Resource edge cases for value-band coverage.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: resourcePayload,
    });
    const percentageOfCurrentCost = manifest.options[1]?.operations[0];

    expect(percentageOfCurrentCost).toEqual(
      expect.objectContaining({
        operationKind: "cost",
        payload: expect.objectContaining({
          basis: "current",
          percentage: 10,
          resourceAmountKind: "percentage_of_current",
        }),
        resourceSemantics: expect.objectContaining({
          basis: "current",
          percentage: 10,
          amountKind: "percentage_of_current",
        }),
      }),
    );
  });

  it("reaches Milestone 10 resource families through normal generation", async () => {
    const content = await loadContent(process.cwd());
    const normalManifest = (
      shapeId: JourneyShapeId,
      seed: string,
      stage: JourneyStage = "late",
      adjust?: (journeyContext: ReturnType<typeof contextFromContent>) => void,
    ): JourneyManifest | null => {
      const journeyContext = contextFromContent(content, seed, stage);

      adjust?.(journeyContext);

      const manifest = fillForShapeAtStage(shapeId, journeyContext, stage);
      const validation = validateJourneyManifest(manifest, journeyContext);

      expect(manifest.debug.debugPayload, `${shapeId}:${seed}`).toBeUndefined();

      return validation.ok ? manifest : null;
    };
    const collectValid = (
      shapeId: JourneyShapeId,
      prefix: string,
      count: number,
      stage: JourneyStage = "late",
      adjust?: (journeyContext: ReturnType<typeof contextFromContent>) => void,
    ): JourneyManifest[] => {
      const manifests: JourneyManifest[] = [];

      for (let index = 0; index < count * 3 && manifests.length < count; index += 1) {
        const manifest = normalManifest(shapeId, `${prefix}-${index}`, stage, adjust);

        if (manifest) {
          manifests.push(manifest);
        }
      }

      expect(manifests.length, `${shapeId}:${prefix}`).toBe(count);

      return manifests;
    };
    const serviceManifests = collectValid("service_menu", "m10-service", 40);
    const costedManifests = collectValid(
      "same_cost_different_rewards",
      "m10-costed",
      40,
      "early",
    );
    const singleOfferManifests = collectValid("single_offer", "m10-single", 30, "early");
    const namedDreamsignManifests = collectValid(
      "curated_reward_trio",
      "m10-dreamsign",
      30,
    );
    const multiOmenCostManifests = collectValid(
      "same_cost_different_rewards",
      "m10-multi-omen",
      20,
      "early",
      (journeyContext) => {
        journeyContext.state.quest.resources.omens = 3;
      },
    );
    const operations = [
      ...serviceManifests,
      ...costedManifests,
      ...singleOfferManifests,
      ...namedDreamsignManifests,
      ...multiOmenCostManifests,
    ].flatMap((manifest) =>
      manifest.options.flatMap((journeyOption) => journeyOption.operations),
    );

    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          payload: expect.objectContaining({ kind: "gain_essence" }),
          resourceSemantics: expect.objectContaining({ amountKind: "fixed" }),
        }),
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "resource_cap_change",
          resourceSemantics: expect.objectContaining({ amountKind: "cap_change" }),
          payload: expect.objectContaining({ capDelta: expect.any(Number) }),
        }),
        expect.objectContaining({
          operationKind: "reward",
          resourceSemantics: expect.objectContaining({ amountKind: "percentage_of_maximum" }),
          payload: expect.objectContaining({ resourceSetMode: "set_current_to_percentage" }),
        }),
        expect.objectContaining({
          operationKind: "burden",
          burdenKind: "resource_loss",
          resourceSemantics: expect.objectContaining({ amountKind: "cap_change" }),
          payload: expect.objectContaining({ capDelta: expect.any(Number) }),
        }),
        expect.objectContaining({
          operationKind: "cost",
          resourceSemantics: expect.objectContaining({ amountKind: "maximum" }),
        }),
        expect.objectContaining({
          operationKind: "cost",
          resourceSemantics: expect.objectContaining({ amountKind: "all_remaining" }),
        }),
        expect.objectContaining({
          operationKind: "cost",
          resourceSemantics: expect.objectContaining({ amountKind: "random_range" }),
        }),
        expect.objectContaining({
          operationKind: "cost",
          resource: "omens",
          amount: expect.any(Number),
          value: expect.objectContaining({
            bands: expect.arrayContaining([
              expect.objectContaining({ id: "multi_omen" }),
            ]),
          }),
        }),
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "dreamsign_gain",
          targetSelector: expect.objectContaining({
            selectorKind: "dreamsign",
            selection: "exact",
          }),
        }),
      ]),
    );

    const capLoss = operations.find((operation) =>
      operation.operationKind === "burden" &&
      operation.resourceSemantics?.amountKind === "cap_change" &&
      typeof operation.payload.capDelta === "number" &&
      operation.payload.capDelta < 0
    );
    const capGain = operations.find((operation) =>
      operation.operationKind === "reward" &&
      operation.resourceSemantics?.amountKind === "cap_change" &&
      typeof operation.payload.capDelta === "number" &&
      operation.payload.capDelta > 0
    );
    const randomRangeCostWithReward = costedManifests.some((manifest) =>
      manifest.options.some((journeyOption) =>
        journeyOption.operations.some((operation) =>
          operation.operationKind === "cost" &&
          operation.resourceSemantics?.amountKind === "random_range"
        ) &&
        journeyOption.operations.some((operation) => operation.role === "reward")
      ),
    );

    expect(capLoss).toBeDefined();
    expect(capGain).toBeDefined();
    expect(randomRangeCostWithReward).toBe(true);
  }, 180000);

  it("carries resource operations through delayed hooks and pre-shop timing", async () => {
    const content = await loadContent(process.cwd());
    const delayedManifests: JourneyManifest[] = [];

    for (let index = 0; index < 120 && delayedManifests.length < 50; index += 1) {
      const journeyContext = contextFromContent(
        content,
        `m10-delayed-resource-${index}`,
        "late",
      );
      const manifest = fillForShapeAtStage("reward_after_trigger", journeyContext, "late");
      const validation = validateJourneyManifest(manifest, journeyContext);

      if (validation.ok) {
        delayedManifests.push(manifest);
      }
    }

    expect(delayedManifests.length).toBe(50);

    const shopManifests: JourneyManifest[] = [];

    for (let index = 0; index < 90 && shopManifests.length < 30; index += 1) {
      const journeyContext = contextFromContent(
        content,
        `twscope-${index}`,
        "mid",
      );
      const manifest = fillForShapeAtStage("timed_window_menu", journeyContext, "mid");
      const validation = validateJourneyManifest(manifest, journeyContext);

      if (validation.ok) {
        shopManifests.push(manifest);
      }
    }

    expect(shopManifests.length).toBe(30);
    const delayedRewardOperations = delayedManifests.flatMap((manifest) =>
      (manifest.precommitted.operations ?? []).flatMap((operation) =>
        operation.operationKind === "delayed_hook"
          ? operation.rewardOperations ?? []
          : []
      ),
    );
    const shopOperations = shopManifests.flatMap((manifest) =>
      manifest.options.flatMap((journeyOption) => journeyOption.operations),
    );

    expect(delayedRewardOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "reward",
          resourceSemantics: expect.objectContaining({
            amountKind: expect.stringMatching(/^(fixed|restore_to_maximum|percentage_of_maximum|random_range|cap_change)$/u),
          }),
        }),
      ]),
    );
    expect(shopOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "shop_economy_modifier",
          payload: expect.objectContaining({
            economyOperationKind: "next_shop_essence_restore",
          }),
        }),
        expect.objectContaining({
          operationKind: "reward",
          resourceSemantics: expect.objectContaining({
            amountKind: "restore_to_maximum",
          }),
          timing: expect.objectContaining({
            timingKind: "delayed",
            trigger: "before next shop",
          }),
        }),
      ]),
    );
  }, 180000);

  it("forces Bane gain, purge, replacement, and transform payloads without requiring persistent Bane state", async () => {
    const journeyContext = await context("bane-resource");
    const banePayload = {
      familyId: "bane",
      variantId: "bane-gain-purge-transform",
      qaId: "bane/bane-gain-purge-transform",
      description: "Bane gain, purge, and transform coverage.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: banePayload,
    });
    const operations = manifest.options.flatMap((option) => option.operations);

    expect(manifest.shapeId).toBe("service_menu");
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "burden",
          burdenKind: "bane_gain",
          targetSelector: expect.objectContaining({
            selectorKind: "bane",
            source: "future_burden",
          }),
        }),
        expect.objectContaining({
          operationKind: "burden",
          burdenKind: "bane_delayed",
        }),
        expect.objectContaining({
          operationKind: "burden",
          burdenKind: "bane_temporary",
        }),
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "bane_chosen_purge",
          payload: expect.objectContaining({
            baneTargetContext: "manifest_obligation",
          }),
        }),
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "bane_transform_to_card",
        }),
      ]),
    );
  });

  it("rejects current-state Bane purge when no tracked Bane context exists", async () => {
    const journeyContext = await context("bane-invalid");
    const banePayload = {
      familyId: "bane",
      variantId: "bane-gain-purge-transform",
      qaId: "bane/bane-gain-purge-transform",
      description: "Bane gain, purge, and transform coverage.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = JSON.parse(
      JSON.stringify(
        generateNextJourney({
          context: journeyContext,
          forcedStage: "mid",
          forcedDebugPayload: banePayload,
        }),
      ),
    ) as JourneyManifest;
    const purgeOption = manifest.options.find((option) =>
      option.operations.some(
        (operation) =>
          operation.operationKind === "reward" &&
          operation.rewardKind === "bane_chosen_purge",
      ),
    )!;

    purgeOption.effects = [
      {
        kind: "bane_chosen_purge",
        baneName: "Nightmare",
        count: 1,
        baneTargetContext: "current_state",
        selection: "chosen_after_commitment",
        timing: "immediate",
      },
    ];
    purgeOption.operations = adaptJourneyOptionOperations(purgeOption);

    const resolved = attachTargetResolutionMetadata(
      manifest,
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(validateJourneyManifest(resolved, journeyContext)).toMatchObject({
      ok: false,
      rule: "bane_current_state_target_unavailable",
    });
  });

  it("generates normal Bane purge rewards, target contexts, and multi-copy Bane burdens", async () => {
    const findManifest = async (
      shapeId: JourneyShapeId,
      predicate: (manifest: JourneyManifest) => boolean,
    ) => {
      for (let index = 0; index < 160; index += 1) {
        const journeyContext = await context(`m9-bane-normal-${shapeId}-${index}`);
        const manifest = generateNextJourney({
          context: journeyContext,
          forcedStage: "mid",
          forcedShapeId: shapeId,
        });

        expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
          ok: true,
        });

        if (predicate(manifest)) {
          return manifest;
        }
      }

      return undefined;
    };
    const operations = (manifest: JourneyManifest): JourneyOperation[] => [
      ...manifest.options.flatMap((journeyOption) => journeyOption.operations),
      ...(manifest.precommitted.operations ?? []),
    ];
    const purgeManifest = await findManifest("service_menu", (manifest) =>
      operations(manifest).some(
        (operation) =>
          operation.operationKind === "reward" &&
          (
            operation.rewardKind === "bane_chosen_purge" ||
            operation.rewardKind === "bane_random_purge" ||
            operation.rewardKind === "bane_purge"
          ) &&
          operation.targetSelector?.selectorKind === "bane" &&
          (
            operation.targetSelector.source === "manifest_obligation" ||
            operation.targetSelector.source === "future_burden"
          ) &&
          (
            operation.targetResolution?.targetOrigin === "manifest_obligation" ||
            operation.targetResolution?.targetOrigin === "future_burden"
          ),
      )
    );
    const randomPurgeManifest = await findManifest("service_menu", (manifest) =>
      operations(manifest).some(
        (operation) =>
          operation.operationKind === "reward" &&
          operation.rewardKind === "bane_random_purge" &&
          operation.targetSelector?.selectorKind === "bane" &&
          operation.targetSelector.selection === "visible_random",
      )
    );
    const multiBaneManifest = await findManifest("choose_your_loss", (manifest) =>
      operations(manifest).some(
        (operation) =>
          operation.operationKind === "burden" &&
          operation.burdenKind === "bane_gain" &&
          typeof operation.payload.count === "number" &&
          operation.payload.count > 1,
      )
    );
    const temporaryBaneManifest = await findManifest("same_cost_different_rewards", (manifest) =>
      operations(manifest).some(
        (operation) =>
          operation.operationKind === "burden" &&
          operation.burdenKind === "bane_temporary",
      )
    );
    const delayedBaneManifest = await findManifest("same_cost_different_rewards", (manifest) =>
      operations(manifest).some(
        (operation) =>
          operation.operationKind === "burden" &&
          operation.burdenKind === "bane_delayed",
      )
    );

    expect(purgeManifest).toBeDefined();
    expect(randomPurgeManifest).toBeDefined();
    expect(multiBaneManifest).toBeDefined();
    expect(temporaryBaneManifest).toBeDefined();
    expect(delayedBaneManifest).toBeDefined();
  });

  it("generates Thorned Cleanup, Thin Air, and Bane Ledger Bane structures normally", async () => {
    const findManifest = async (
      shapeId: JourneyShapeId,
      predicate: (manifest: JourneyManifest) => boolean,
    ) => {
      for (let index = 0; index < 160; index += 1) {
        const journeyContext = await context(`m9-bane-examples-${shapeId}-${index}`);
        const manifest = generateNextJourney({
          context: journeyContext,
          forcedStage: "mid",
          forcedShapeId: shapeId,
        });

        expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
          ok: true,
        });

        if (predicate(manifest)) {
          return manifest;
        }
      }

      return undefined;
    };
    const thornedCleanup = await findManifest("service_menu", (manifest) =>
      manifest.options.some((journeyOption) =>
        journeyOption.operations.some(
          (operation) =>
            operation.operationKind === "reward" &&
            operation.rewardKind === "starter_cleanup",
        ) &&
        journeyOption.operations.some(
          (operation) =>
            operation.operationKind === "reward" &&
            (
              operation.rewardKind === "bane_chosen_purge" ||
              operation.rewardKind === "bane_random_purge" ||
              operation.rewardKind === "bane_purge"
            ),
        )
      )
    );
    const thinAir = await findManifest("choose_your_loss", (manifest) =>
      manifest.options.some((journeyOption) =>
        journeyOption.operations.some(
          (operation) =>
            operation.operationKind === "burden" &&
            operation.burdenKind === "bane_gain" &&
            typeof operation.payload.count === "number" &&
            operation.payload.count > 1,
        )
      )
    );
    const baneLedger = await findManifest("alter_dreamscapes", (manifest) =>
      manifest.options.some((journeyOption) =>
        journeyOption.routeEffects.length > 0 &&
        journeyOption.operations.some(
          (operation) =>
            operation.operationKind === "burden" &&
            operation.burdenKind === "bane_gain",
        )
      )
    );

    expect(thornedCleanup).toBeDefined();
    expect(thinAir).toBeDefined();
    expect(baneLedger).toBeDefined();
  });

  it("can precommit a Bane-to-card transform behind a normal delayed hook", async () => {
    for (let index = 0; index < 220; index += 1) {
      const journeyContext = await context(`m9-bane-delayed-transform-${index}`);
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "late",
        forcedShapeId: "reward_after_trigger",
      });
      const hasDelayedBaneTransform = (manifest.precommitted.operations ?? []).some(
        (operation) =>
          operation.operationKind === "delayed_hook" &&
          operation.rewardOperations?.some(
            (rewardOperation) =>
              rewardOperation.operationKind === "reward" &&
              rewardOperation.rewardKind === "bane_transform_to_card",
          ),
      );

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      if (hasDelayedBaneTransform) {
        expect(manifest.references.baneNames.length).toBeGreaterThan(0);
        return;
      }
    }

    expect.fail("Expected a normal delayed hook to precommit a Bane transform");
  });

  it("forces route, shop, Dreamwell, and status payload families with structured scope and duration", async () => {
    const journeyContext = await context("route-shop-dreamwell-status");
    const variants = [
      {
        familyId: "route",
        variantId: "route-edits",
        qaId: "route/route-edits",
        description: "Route operation QA.",
        supportedShapes: ["service_menu"],
        supportedStages: ["mid", "late"],
      },
      {
        familyId: "shop",
        variantId: "shop-economy",
        qaId: "shop/shop-economy",
        description: "Shop economy QA.",
        supportedShapes: ["shop_row"],
        supportedStages: ["mid", "late"],
      },
      {
        familyId: "dreamwell",
        variantId: "dreamwell-window",
        qaId: "dreamwell/dreamwell-window",
        description: "Dreamwell window QA.",
        supportedShapes: ["service_menu"],
        supportedStages: ["mid", "late"],
      },
      {
        familyId: "status",
        variantId: "status-reward-replacement",
        qaId: "status/status-reward-replacement",
        description: "Status reward replacement QA.",
        supportedShapes: ["service_menu"],
        supportedStages: ["late"],
      },
    ] satisfies DebugPayloadSelection[];

    const [routeManifest, shopManifest, dreamwellManifest, statusManifest] =
      variants.map((forcedDebugPayload) =>
        generateNextJourney({
          context: journeyContext,
          forcedStage:
            forcedDebugPayload.familyId === "status" ? "late" : "mid",
          forcedDebugPayload,
        }),
      );

    expect(routeManifest!.debug.validation.ok).toBe(true);
    expect(
      routeManifest!.options.flatMap((option) =>
        option.operations.map((operation) =>
          operation.operationKind === "route_edit"
            ? operation.editKind
            : undefined,
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        "add_site",
        "remove_site",
        "replace_site",
        "purge_site",
        "probability_adjustment",
      ]),
    );
    expect(routeManifest!.precommitted.routeEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeOperationKind: "probability_adjustment",
          routeScope: "future_dreamscapes",
          routePolarity: "positive",
          siteDeltaValue: expect.any(Number),
        }),
      ]),
    );

    expect(shopManifest!.debug.validation.ok).toBe(true);
    expect(
      shopManifest!.options.flatMap((option) =>
        option.operations.map((operation) => operation.payload),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          economyOperationKind: "reroll_discount",
          shopScope: "current_shop",
          duration: "current shop",
        }),
        expect.objectContaining({
          economyOperationKind: "future_shop_trade_hook",
          shopScope: "future_shops",
          duration: "next 2 future shops",
          hookBudgetCost: 1,
        }),
      ]),
    );
    const shopEconomyOperations = shopManifest!.options.flatMap((option) =>
      option.operations.filter(
        (operation) =>
          operation.operationKind === "reward" &&
          operation.rewardKind === "shop_economy_modifier",
      ),
    );
    expect(shopEconomyOperations.length).toBeGreaterThan(0);
    for (const operation of shopEconomyOperations) {
      expect(
        operation.resourceSemantics,
        operation.operationId,
      ).toBeUndefined();
    }

    expect(dreamwellManifest!.debug.validation.ok).toBe(true);
    expect(
      dreamwellManifest!.options.flatMap((option) =>
        option.operations.map((operation) => operation.payload),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dreamwellOperationKind: "first_draw_energy",
          dreamwellScope: "next_battle",
          duration: "next battle",
        }),
        expect.objectContaining({
          dreamwellOperationKind: "penalty_card",
          cardRole: "penalty",
          duration: "next 3 battles",
        }),
      ]),
    );
    expect(
      dreamwellManifest!.options.flatMap((option) => option.operations),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "dreamwell_modifier",
        }),
        expect.objectContaining({
          operationKind: "burden",
          burdenKind: "dreamwell_modifier",
        }),
      ]),
    );
    for (const operation of dreamwellManifest!.options.flatMap(
      (option) => option.operations,
    )) {
      if (
        (operation.operationKind === "reward" &&
          operation.rewardKind === "dreamwell_modifier") ||
        (operation.operationKind === "burden" &&
          operation.burdenKind === "dreamwell_modifier")
      ) {
        expect(
          operation.resourceSemantics,
          operation.operationId,
        ).toBeUndefined();
      }
    }

    expect(statusManifest!.debug.validation.ok).toBe(true);
    expect(
      statusManifest!.options.flatMap((option) => option.operations),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "status",
          payload: expect.objectContaining({
            ruleMutationKind: "reward_replacement",
            statusScope: "reward",
            duration: "one_time",
          }),
        }),
        expect.objectContaining({
          operationKind: "status",
          payload: expect.objectContaining({
            ruleMutationKind: "dreamwell_rule",
            statusScope: "dreamwell",
            dreamwellRuleKind: "first_draw_energy",
          }),
        }),
        expect.objectContaining({
          operationKind: "status",
          payload: expect.objectContaining({
            ruleMutationKind: "shop_rule",
            statusScope: "shop",
            cappedAction: "reroll",
            rerollOmenCap: 1,
          }),
        }),
        expect.objectContaining({
          operationKind: "status",
          payload: expect.objectContaining({
            ruleMutationKind: "deck_size_constraint",
            statusScope: "quest",
            exactDeckSize: 30,
            prohibitionKind: "deck_cut_floor",
            prohibitedAction: "voluntary_deck_cut",
            deckCutFloor: 30,
          }),
        }),
      ]),
    );
    expect(statusManifest!.precommitted.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "delayed_hook",
          rewardOperations: expect.arrayContaining([
            expect.objectContaining({
              operationKind: "status",
              visibility: "precommitted",
              payload: expect.objectContaining({
                ruleMutationKind: "dreamwell_rule",
              }),
            }),
          ]),
        }),
      ]),
    );
  });

  it("generates Shop Courtesy as reroll, purchase, and pre-shop resource modifiers in normal timed windows", async () => {
    const seen = {
      freeRerolls: false,
      freePurchase: false,
      preShopRestore: false,
    };

    for (let index = 0; index < 30; index += 1) {
      const journeyContext = await context(`m14-shop-courtesy-${index}`);
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "mid",
        forcedShapeId: "timed_window_menu",
      });

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      for (const operation of manifest.options.flatMap((journeyOption) =>
        journeyOption.operations
      )) {
        if (
          operation.operationKind !== "reward" ||
          operation.rewardKind !== "shop_economy_modifier"
        ) {
          continue;
        }

        const payload = operation.payload;
        seen.freeRerolls ||= payload.economyOperationKind === "free_rerolls";
        seen.freePurchase ||= payload.economyOperationKind === "free_next_purchases" ||
          payload.economyOperationKind === "first_purchase_free";
        seen.preShopRestore ||=
          payload.economyOperationKind === "next_shop_essence_restore" &&
          manifest.options.some((option) =>
            option.operations.some(
              (nested) =>
                nested.operationKind === "reward" &&
                nested.rewardKind === "resource" &&
                nested.payload.kind === "resource_restore_to_maximum" &&
                nested.payload.shopEconomyTiming === "before_next_shop",
            )
          );
      }

      if (seen.freeRerolls && seen.freePurchase && seen.preShopRestore) {
        return;
      }
    }

    expect(seen).toEqual({
      freeRerolls: true,
      freePurchase: true,
      preShopRestore: true,
    });
  });

  it("generates Spoiled Victory as next-victory reward replacement statuses without granting the replacement immediately", async () => {
    const seen = new Set<string>();

    for (let index = 0; index < 20; index += 1) {
      const journeyContext = await context(`m14-spoiled-victory-${index}`);
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "late",
        forcedShapeId: "random_allocation",
      });

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      for (const optionEntry of manifest.options) {
        const statusOperations = optionEntry.operations.filter(
          (operation) =>
            operation.operationKind === "status" &&
            operation.payload.ruleMutationKind ===
              "next_victory_reward_replacement",
        );

        for (const operation of statusOperations) {
          seen.add(String(operation.payload.replacementKind));
          expect(operation.payload).toMatchObject({
            statusScope: "reward",
            duration: "one_time",
            rewardTrigger: "next_victory",
            replacedRewardKind: "card_rewards",
          });
          expect(
            optionEntry.operations.some(
              (nested) =>
                nested.operationKind === "reward" &&
                (nested.rewardKind === "dreamsign_draft" ||
                  nested.rewardKind === "resource"),
            ),
          ).toBe(false);
          expect(
            optionEntry.operations.some(
              (nested) => nested.operationKind === "route_edit",
            ),
          ).toBe(false);
        }
      }

      if (
        seen.has("dreamsign_draft") &&
        seen.has("resource") &&
        seen.has("route_reward")
      ) {
        return;
      }
    }

    expect([...seen].sort()).toEqual([
      "dreamsign_draft",
      "resource",
      "route_reward",
    ]);
  });

  it("generates Sealed Hands as persistent prohibition status costs paired with compensating rewards", async () => {
    const seen = new Set<string>();

    for (let index = 0; index < 40; index += 1) {
      const journeyContext = await context(`m14-sealed-hands-${index}`);
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "late",
        forcedShapeId: "single_offer",
      });

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      for (const optionEntry of manifest.options) {
        const prohibition = optionEntry.operations.find(
          (operation) =>
            operation.operationKind === "status" &&
            operation.role === "burden" &&
            operation.payload.ruleMutationKind === "persistent_prohibition",
        );

        if (!prohibition) {
          continue;
        }

        seen.add(String(prohibition.payload.prohibitionKind));
        expect(prohibition.payload).toMatchObject({
          statusScope: "quest",
          duration: "persistent",
          polarity: "negative",
        });
        expect(
          optionEntry.operations.some(
            (operation) =>
              operation.role === "reward" &&
              (operation.operationKind === "reward" ||
                operation.operationKind === "route_edit" ||
                operation.operationKind === "status"),
          ),
        ).toBe(true);
        expect(optionEntry.effectConvertedEssence).toBeGreaterThanOrEqual(300);
      }

      if (
        seen.has("resource_gain") &&
        seen.has("deck_modification") &&
        seen.has("card_transfiguration")
      ) {
        return;
      }
    }

    expect([...seen].sort()).toEqual([
      "card_transfiguration",
      "deck_modification",
      "resource_gain",
    ]);
  });

  it("rejects incoherent route and status payload contracts with stable rule IDs", async () => {
    const journeyContext = await context("route-status-validation");
    const routePayload = {
      familyId: "route",
      variantId: "route-edits",
      qaId: "route/route-edits",
      description: "Route operation QA.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const statusPayload = {
      familyId: "status",
      variantId: "status-reward-replacement",
      qaId: "status/status-reward-replacement",
      description: "Status reward replacement QA.",
      supportedShapes: ["service_menu"],
      supportedStages: ["late"],
    } satisfies DebugPayloadSelection;
    const routeManifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: routePayload,
    });
    const invalidRouteEffect = {
      ...(routeManifest.options[1]!.routeEffects[0] as Record<string, unknown>),
      siteType: "Unknown Site",
    };
    const invalidRouteManifest: JourneyManifest = {
      ...routeManifest,
      options: [
        routeManifest.options[0]!,
        refreshOptionOperations({
          ...routeManifest.options[1]!,
          routeEffects: [invalidRouteEffect],
        }),
        ...routeManifest.options.slice(2),
      ],
      precommitted: refreshPrecommittedOperations({
        ...routeManifest.precommitted,
        routeEdits: [invalidRouteEffect],
      }),
    };

    expect(
      validateJourneyManifest(invalidRouteManifest, journeyContext),
    ).toMatchObject({
      ok: false,
      rule: "invalid_route_site_type",
    });

    const statusManifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: statusPayload,
    });
    const invalidStatusEffect = {
      ...(statusManifest.options[0]!.effects[0] as Record<string, unknown>),
      statusScope: "unsupported_scope",
    };
    const invalidStatusManifest: JourneyManifest = {
      ...statusManifest,
      options: [
        refreshOptionOperations({
          ...statusManifest.options[0]!,
          effects: [invalidStatusEffect],
        }),
        ...statusManifest.options.slice(1),
      ],
    };

    expect(
      validateJourneyManifest(invalidStatusManifest, journeyContext),
    ).toMatchObject({
      ok: false,
      rule: "unsupported_status_scope",
    });

    const invalidShopRule = {
      ...(statusManifest.options[2]!.effects[0] as Record<string, unknown>),
    };
    delete invalidShopRule.rerollOmenCap;
    const invalidShopRuleManifest: JourneyManifest = {
      ...statusManifest,
      options: [
        ...statusManifest.options.slice(0, 2),
        refreshOptionOperations({
          ...statusManifest.options[2]!,
          effects: [invalidShopRule],
        }),
        statusManifest.options[3]!,
      ],
    };

    expect(
      validateJourneyManifest(invalidShopRuleManifest, journeyContext),
    ).toMatchObject({
      ok: false,
      rule: "incoherent_rule_mutation",
    });

    const invalidProhibition = {
      ...(statusManifest.options[3]!.effects[0] as Record<string, unknown>),
      deckCutFloor: 29,
    };
    const invalidProhibitionManifest: JourneyManifest = {
      ...statusManifest,
      options: [
        ...statusManifest.options.slice(0, 3),
        refreshOptionOperations({
          ...statusManifest.options[3]!,
          effects: [invalidProhibition],
        }),
      ],
    };

    expect(
      validateJourneyManifest(invalidProhibitionManifest, journeyContext),
    ).toMatchObject({
      ok: false,
      rule: "incoherent_rule_mutation",
    });

    const invalidPersistentProhibition = {
      ...(statusManifest.options[0]!.effects[0] as Record<string, unknown>),
      kind: "status_persistent_prohibition",
      statusName: "Broken Seal",
      statusScope: "battle",
      duration: "next_battle",
      ruleMutationKind: "persistent_prohibition",
      polarity: "negative",
      prohibitionKind: "resource_gain",
      prohibitedAction: "gain_essence",
      resource: "essence",
    };
    const invalidPersistentProhibitionManifest: JourneyManifest = {
      ...statusManifest,
      options: [
        refreshOptionOperations({
          ...statusManifest.options[0]!,
          effects: [invalidPersistentProhibition],
        }),
        ...statusManifest.options.slice(1),
      ],
    };

    expect(
      validateJourneyManifest(
        invalidPersistentProhibitionManifest,
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "incoherent_rule_mutation",
    });

    const saturatedHookContext = await context("shop-hook-budget");
    saturatedHookContext.state.quest.route.unresolvedHooks = ["a", "b", "c"];
    const shopManifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: {
        familyId: "shop",
        variantId: "shop-economy",
        qaId: "shop/shop-economy",
        description: "Shop economy QA.",
        supportedShapes: ["shop_row"],
        supportedStages: ["mid", "late"],
      },
    });

    expect(
      validateJourneyManifest(shopManifest, saturatedHookContext),
    ).toMatchObject({
      ok: false,
      rule: "delayed_hook_over_persistence_budget",
    });
  });

  it("forces delayed hook trigger matrices with typed bounded contracts", async () => {
    const journeyContext = await context("hook-matrix");
    const hookPayload = {
      familyId: "hook",
      variantId: "delayed-trigger-matrix",
      qaId: "hook/delayed-trigger-matrix",
      description: "Delayed hook matrix QA.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: hookPayload,
    });
    const hookOperations =
      manifest.precommitted.operations?.filter(
        (operation) =>
          operation.operationKind === "delayed_hook" &&
          operation.role === "delayed_hook",
      ) ?? [];
    const triggerKinds = hookOperations.map((operation) =>
      operation.operationKind === "delayed_hook"
        ? operation.triggerSelector?.triggerKind
        : undefined,
    );
    const hookBudget = manifest.options
      .flatMap((option) => option.triggers)
      .reduce(
        (sum, trigger) =>
          typeof trigger === "object" &&
          trigger !== null &&
          !Array.isArray(trigger) &&
          typeof (trigger as { hookBudgetCost?: unknown }).hookBudgetCost ===
            "number"
            ? sum + (trigger as { hookBudgetCost: number }).hookBudgetCost
            : sum,
        0,
      );

    expect(manifest.shapeId).toBe("service_menu");
    expect(manifest.debug.validation).toMatchObject({ ok: true, failed: 0 });
    expect(triggerKinds).toEqual(
      expect.arrayContaining([
        "battle",
        "victory",
        "each_battle",
        "site_visit",
        "named_card_play",
        "dreamsign_trigger",
        "card_added",
        "essence_payment",
        "future_shop",
        "future_dream_journey",
      ]),
    );
    expect(hookBudget).toBeLessThanOrEqual(3);
    expect(hookOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trackedCondition: expect.any(String),
          resolution: expect.any(String),
          expiration: expect.objectContaining({
            policyKind: expect.any(String),
          }),
          duration: expect.objectContaining({
            durationKind: expect.any(String),
          }),
          controlledScene: expect.objectContaining({
            sceneKind: expect.any(String),
          }),
          visibilityPolicy: expect.objectContaining({
            disclosure: expect.any(String),
          }),
          rewardOperations: expect.any(Array),
        }),
      ]),
    );
    expect(generatedOptionText(manifest).join("\n")).toMatch(
      /Track .*Resolve .*expir/iu,
    );
  });

  it("forces paired return, seal, borrow, and trade scenes with typed return contracts", async () => {
    const journeyContext = await context("return-matrix");
    const returnPayload = {
      familyId: "return",
      variantId: "paired-return-seal-borrow-trade",
      qaId: "return/paired-return-seal-borrow-trade",
      description: "Paired return QA.",
      supportedShapes: ["paired_return"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: returnPayload,
    });
    const pairedOperations =
      manifest.precommitted.operations?.filter(
        (operation) => operation.operationKind === "paired_return",
      ) ?? [];

    expect(manifest.shapeId).toBe("paired_return");
    expect(manifest.debug.validation).toMatchObject({ ok: true, failed: 0 });
    expect(manifest.precommitted.pairedReturn).toHaveLength(3);
    expect(pairedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contract: expect.objectContaining({
            created: expect.objectContaining({
              referenceKind: "sealed_object",
            }),
            returnScene: expect.objectContaining({
              returnSceneKind: "sealed_object_return",
            }),
          }),
        }),
        expect.objectContaining({
          contract: expect.objectContaining({
            created: expect.objectContaining({
              referenceKind: "borrowed_object",
            }),
            returnScene: expect.objectContaining({
              returnSceneKind: "borrowed_object_return",
            }),
          }),
        }),
        expect.objectContaining({
          contract: expect.objectContaining({
            created: expect.objectContaining({
              referenceKind: "trade_promise",
            }),
            returnScene: expect.objectContaining({
              returnSceneKind: "future_trade",
            }),
          }),
        }),
      ]),
    );
    expect(manifest.precommitted.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "delayed_hook",
          triggerSelector: expect.objectContaining({
            triggerKind: "future_dream_journey",
          }),
          controlledScene: expect.objectContaining({ sceneKind: "return" }),
        }),
      ]),
    );
    expect(generatedOptionText(manifest).join("\n")).toMatch(
      /Seal .*return .*expires|Borrow .*Return/iu,
    );
  });

  it("rejects invalid hook trigger and paired-return references", async () => {
    const journeyContext = await context("invalid-hook-return");
    const hookPayload = {
      familyId: "hook",
      variantId: "delayed-trigger-matrix",
      qaId: "hook/delayed-trigger-matrix",
      description: "Delayed hook matrix QA.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const hookManifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: hookPayload,
    });
    const invalidHook = {
      ...(hookManifest.precommitted.delayed?.[0] as Record<string, unknown>),
      triggerSelector: {
        ...((hookManifest.precommitted.delayed?.[0] as Record<string, unknown>)
          .triggerSelector as Record<string, unknown>),
        triggerKind: "unsupported_trigger",
      },
    };
    const invalidHookManifest: JourneyManifest = {
      ...hookManifest,
      precommitted: refreshPrecommittedOperations({
        ...hookManifest.precommitted,
        delayed: [
          invalidHook,
          ...(hookManifest.precommitted.delayed ?? []).slice(1),
        ],
      }),
    };

    expect(
      validateJourneyManifest(invalidHookManifest, journeyContext),
    ).toMatchObject({
      ok: false,
      rule: "invalid_hook_trigger",
    });

    const returnPayload = {
      familyId: "return",
      variantId: "paired-return-seal-borrow-trade",
      qaId: "return/paired-return-seal-borrow-trade",
      description: "Paired return QA.",
      supportedShapes: ["paired_return"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const returnManifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: returnPayload,
    });
    const invalidReturn = {
      ...(returnManifest.precommitted.pairedReturn?.[0] as Record<
        string,
        unknown
      >),
      returnScene: {
        ...((
          returnManifest.precommitted.pairedReturn?.[0] as Record<
            string,
            unknown
          >
        ).returnScene as Record<string, unknown>),
        referencesCreatedId: "missing-created-reference",
      },
    };
    const invalidReturnManifest: JourneyManifest = {
      ...returnManifest,
      precommitted: refreshPrecommittedOperations({
        ...returnManifest.precommitted,
        pairedReturn: [
          invalidReturn,
          ...(returnManifest.precommitted.pairedReturn ?? []).slice(1),
        ],
      }),
    };

    expect(
      validateJourneyManifest(invalidReturnManifest, journeyContext),
    ).toMatchObject({
      ok: false,
      rule: "invalid_paired_return_reference",
    });
  });

  it("rejects paired-return delayed mirrors that diverge from returnScene", async () => {
    const journeyContext = await context("invalid-return-mirror");
    const returnPayload = {
      familyId: "return",
      variantId: "paired-return-seal-borrow-trade",
      qaId: "return/paired-return-seal-borrow-trade",
      description: "Paired return QA.",
      supportedShapes: ["paired_return"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const returnManifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: returnPayload,
    });
    const invalidReturn = {
      ...(returnManifest.precommitted.pairedReturn?.[0] as Record<
        string,
        unknown
      >),
      duration: {
        durationKind: "battle_count",
        label: "next 1 battle",
        count: 1,
      },
    };
    const invalidReturnManifest: JourneyManifest = {
      ...returnManifest,
      precommitted: refreshPrecommittedOperations({
        ...returnManifest.precommitted,
        pairedReturn: [
          invalidReturn,
          ...(returnManifest.precommitted.pairedReturn ?? []).slice(1),
        ],
      }),
    };

    expect(
      validateJourneyManifest(invalidReturnManifest, journeyContext),
    ).toMatchObject({
      ok: false,
      rule: "invalid_paired_return_contract",
      debug: { field: "duration" },
    });
  });

  it("forces named card operation menus with typed real-card operation payloads", async () => {
    const requiredRewardKinds = new Set([
      "card_gain",
      "card_purge",
      "card_duplicate",
      "card_transform",
      "card_replace",
      "card_transfigure",
      "card_text_modification",
      "card_type_change",
      "card_keyword_add",
      "card_keyword_remove",
      "card_opening_hand",
      "card_merge",
      "card_split",
      "card_temporary_copy",
      "card_delayed_transformation",
    ]);
    const seen = new Set<string>();
    const cardPayload = {
      familyId: "card",
      variantId: "named-card-operation-menu",
      qaId: "card/named-card-operation-menu",
      description: "Named card operation menu coverage.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;

    for (
      let index = 0;
      index < 24 && seen.size < requiredRewardKinds.size;
      index += 1
    ) {
      const journeyContext = await context(`named-card:${index}`);
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "mid",
        forcedDebugPayload: cardPayload,
      });
      const rewardOperations = manifest.options.flatMap((option) =>
        option.operations.filter(
          (operation) => operation.operationKind === "reward",
        ),
      );

      expect(manifest.shapeId).toBe("service_menu");
      expect(manifest.debug.debugPayload).toMatchObject({
        familyId: "card",
        variantId: "named-card-operation-menu",
        qaId: "card/named-card-operation-menu",
        source: "forced",
      });
      expect(
        validateJourneyManifest(manifest, journeyContext),
        `named-card:${index}`,
      ).toEqual({ ok: true });

      for (const operation of rewardOperations) {
        expect(operation.targetResolution, operation.rewardKind).toMatchObject({
          selectorKind: "card",
          candidateCount: expect.any(Number),
        });
        expect(
          operation.targetResolution?.candidateCount,
          operation.rewardKind,
        ).toBeGreaterThan(0);
        expect(
          operation.targetResolution?.selected[0]?.name,
          operation.rewardKind,
        ).toEqual(expect.any(String));
        expect(operation.value?.convertedEssence, operation.rewardKind).toEqual(
          expect.any(Number),
        );
        seen.add(operation.rewardKind);
      }
    }

    expect(seen).toEqual(requiredRewardKinds);
  });

  it("forces starter cleanup and replacement against real starter deck cards", async () => {
    const journeyContext = await context("starter-cleanup");
    const cardPayload = {
      familyId: "card",
      variantId: "starter-cleanup-replacement",
      qaId: "card/starter-cleanup-replacement",
      description: "Starter cleanup and replacement coverage.",
      supportedShapes: ["curated_reward_trio"],
      supportedStages: ["early"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "early",
      forcedDebugPayload: cardPayload,
    });
    const rewardOperations = manifest.options.flatMap((option) =>
      option.operations.filter(
        (operation) => operation.operationKind === "reward",
      ),
    );
    const cardRewardOperations = rewardOperations.filter(
      (operation) => operation.rewardKind !== "resource",
    );
    const starterIds = new Set(
      journeyContext.state.quest.deck.entries.map((entry) => entry.cardId),
    );
    const draftReplacement = cardRewardOperations.find(
      (operation) =>
        operation.rewardKind === "starter_replacement" &&
        operation.payload.replacementMode === "draft",
    );
    const cleanupOption = manifest.options.find((option) =>
      option.text.includes("Gain 2 omens."),
    )!;

    expect(manifest.shapeId).toBe("curated_reward_trio");
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(
      cardRewardOperations.map((operation) => operation.rewardKind),
    ).toEqual(
      expect.arrayContaining(["starter_cleanup", "starter_replacement"]),
    );
    expect(draftReplacement?.payload).toMatchObject({
      takeCount: 1,
      choiceCount: 4,
      predicate: expect.objectContaining({ source: "draftPool" }),
    });
    expect(cleanupOption.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "starter_cleanup" }),
        expect.objectContaining({ kind: "gain_omens", amount: 2 }),
      ]),
    );
    expect(cleanupOption.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "resource",
          legacyKind: "gain_omens",
          payload: expect.objectContaining({ amount: 2 }),
        }),
      ]),
    );

    for (const operation of cardRewardOperations) {
      expect(operation.targetResolution).toMatchObject({
        selectorKind: "card",
        sourcePool: "deck",
        candidateCount: 1,
      });
      expect(starterIds.has(String(operation.payload.targetCardId))).toBe(true);
      if (operation.rewardKind === "starter_cleanup") {
        expect(cleanupOption.effectConvertedEssence).toBeGreaterThan(0);
      } else {
        expect(operation.value?.convertedEssence).toEqual(expect.any(Number));
      }
    }
  });

  it("can produce a normal starter surgery service menu with starter target metadata", async () => {
    const found: JourneyManifest[] = [];

    for (let index = 0; index < 80 && found.length === 0; index += 1) {
      const journeyContext = await context(`normal-starter-surgery:${index}`);
      const manifest = fillForShapeAtStage("service_menu", journeyContext, "early");
      const starterOptions = manifest.options.filter((option) =>
        option.operations.some(
          (operation) =>
            operation.operationKind === "reward" &&
            operation.payload.starterTarget === true,
        ),
      );

      expect(manifest.debug.debugPayload).toBeUndefined();
      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      if (starterOptions.length === 3) {
        found.push(manifest);
      }
    }

    expect(found).toHaveLength(1);

    const starterMetadata = found[0]!.options.flatMap((option) =>
      option.operations.flatMap((operation) =>
        operation.targetResolution?.selectorKind === "card" &&
        operation.targetResolution.sourcePool === "deck" &&
        operation.targetResolution.candidateCount > 1
          ? [operation.targetResolution]
          : [],
      ),
    );

    expect(starterMetadata.length).toBeGreaterThan(0);
    expect(starterMetadata[0]?.candidateCount).toBeGreaterThan(1);
  });

  it("validates Starter Door and Locksmith Counter starter surgery families", async () => {
    const journeyContext = await context("starter-door-locksmith");
    const drawContext: DrawContext = {
      seed: "starter-door-locksmith",
      contentVersion: journeyContext.contentVersion,
      rootJourneyIndex: journeyContext.state.generator.rootJourneyIndex,
    };
    const slots = starterSurgeryRewardSlots(
      journeyContext,
      drawContext,
      "starter-door-locksmith",
      "early",
    );
    const aspiringGuardian = journeyContext.content.cards.find(
      (card) => card.name === "Aspiring Guardian",
    );
    const byKey = new Map(slots.map((slot) => [slot.key, slot]));

    expect(aspiringGuardian).toBeDefined();
    expect(slots.some((slot) => slot.key.startsWith("starter-replacement-named"))).toBe(true);
    expect(byKey.get("starter-cleanup-random")).toBeDefined();
    expect(byKey.get("starter-replacement-random")).toBeDefined();
    expect(byKey.get("starter-replacement-all")).toBeDefined();
    expect(byKey.get("starter-cleanup-up-to-two")).toBeDefined();
    expect(byKey.get("starter-random-transfiguration")).toBeDefined();
    expect(byKey.get("starter-replacement-draft")).toBeDefined();

    const starterDoorShapes = [
      "starter-door-named-transform",
      "starter-replacement-random",
      "starter-replacement-all",
    ];
    const locksmithShapes = [
      "starter-cleanup-up-to-two",
      "starter-random-transfiguration",
      "starter-replacement-draft",
    ];

    expect(
      slots.some(
        (slot) =>
          slot.key.startsWith("starter-door-named-transform") &&
          slot.effects.some(
            (effect) =>
              typeof effect === "object" &&
              effect !== null &&
              "resultCardId" in effect &&
              effect.resultCardId === aspiringGuardian?.id,
          ),
      ) ||
        slots.some((slot) =>
          slot.effects.some(
            (effect) =>
              typeof effect === "object" &&
              effect !== null &&
              "resultPredicate" in effect &&
              JSON.stringify(effect.resultPredicate).includes("Common"),
          ),
        ),
    ).toBe(true);

    expect(
      starterDoorShapes.every((shape) =>
        slots.some((slot) => slot.key.startsWith(shape)),
      ),
    ).toBe(true);
    expect(
      locksmithShapes.every((shape) =>
        slots.some((slot) => slot.key.startsWith(shape)),
      ),
    ).toBe(true);
  });

  it("varies starter replacement profiles across starter surgery rewards", async () => {
    const content = await loadContent(process.cwd());
    const contentVersion = "test-content-version";
    const predicates = new Set<string>();

    for (let index = 0; index < 8; index += 1) {
      const seed = `starter-replacement-profile:${index}`;
      const state = createInitialJourneyState({
        seed,
        content,
        contentVersion,
      });
      const journeyContext = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const drawContext: DrawContext = {
        seed,
        contentVersion,
        rootJourneyIndex: state.generator.rootJourneyIndex,
      };

      for (const slot of starterSurgeryRewardSlots(
        journeyContext,
        drawContext,
        seed,
        "early",
      )) {
        for (const effect of slot.effects) {
          if (
            typeof effect === "object" &&
            effect !== null &&
            "kind" in effect &&
            effect.kind === "starter_replacement" &&
            "resultPredicate" in effect
          ) {
            predicates.add(stableStringify(effect.resultPredicate));
          }
        }
      }
    }

    const serialized = [...predicates];

    expect(predicates.size).toBeGreaterThanOrEqual(4);
    expect(serialized.some((predicate) => predicate.includes("cardType"))).toBe(
      true,
    );
    expect(
      serialized.some((predicate) => predicate.includes("tideOverlap")),
    ).toBe(true);
    expect(serialized.some((predicate) => predicate.includes("draftPool"))).toBe(
      true,
    );
  });

  it("fails and repairs multi-starter operations when too few starters are available", async () => {
    const journeyContext = await context("starter-too-few");
    journeyContext.state.quest.deck.entries = journeyContext.state.quest.deck.entries.slice(0, 1);
    journeyContext.state.quest.deck.summary = {
      totalCards: 1,
      starterCards: 1,
      uniqueCards: 1,
    };
    const base = fillForShapeAtStage("service_menu", journeyContext, "early");
    const invalidOption = refreshOptionOperations({
      ...base.options[0]!,
      text: "Apply {Viridian Transfiguration} to 2 chosen Starter cards.",
      effects: [
        {
          kind: "card_transfigure",
          transfigurationName: "Viridian",
          targetCount: 2,
          minRequiredTargets: 2,
          selection: "chosen_after_commitment",
          transfigurationScope: "two_chosen_starters",
          starterTarget: true,
          predicate: { source: "deck", starter: true },
        },
      ],
      targets: [
        target("card", "Starter cards in deck", {
          source: "deck",
          starter: true,
        }),
      ],
    });
    const invalid: JourneyManifest = {
      ...base,
      options: [invalidOption, ...base.options.slice(1)],
    };
    const failed = validateJourneyManifest(invalid, journeyContext);

    expect(failed).toMatchObject({
      ok: false,
      rule: "starter_target_pool_too_small",
    });

    const repaired = repairOrFallbackJourney(invalid, journeyContext, failed);

    expect(validateJourneyManifest(repaired, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("separates starter cleanup value from useful non-Starter card sacrifice", async () => {
    expect(valueStarterCleanup({ count: 1, stage: "early" })).toBeGreaterThan(0);
    expect(valueUsefulNonStarterCardSacrifice(1)).toBeLessThan(0);
  });

  it("rejects unavailable deck-affecting named card operations with a stable rule", async () => {
    const journeyContext = await context("named-card-invalid");
    const unavailable = journeyContext.content.cards.find(
      (card) => card.rarity !== "Starter",
    )!;
    const cardPayload = {
      familyId: "card",
      variantId: "named-card-operation-menu",
      qaId: "card/named-card-operation-menu",
      description: "Named card operation menu coverage.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: cardPayload,
    });
    const targetOptionIndex = manifest.options.findIndex((option) =>
      option.operations.some(
        (operation) =>
          operation.operationKind === "reward" &&
          operation.rewardKind !== "card_gain",
      ),
    );
    const targetOption = manifest.options[targetOptionIndex]!;
    const invalidOperationIndex = targetOption.operations.findIndex(
      (operation) =>
        operation.operationKind === "reward" &&
        operation.rewardKind !== "card_gain",
    );
    const invalidOperation = targetOption.operations[invalidOperationIndex]!;
    const invalid: JourneyManifest = attachTargetResolutionMetadata(
      {
        ...manifest,
        options: manifest.options.map((option, optionIndex) =>
          optionIndex === targetOptionIndex
            ? {
                ...option,
                operations: option.operations.map(
                  (operation, operationIndex) =>
                    operationIndex === invalidOperationIndex
                      ? {
                          ...invalidOperation,
                          payload: {
                            ...invalidOperation.payload,
                            source: "deck",
                            targetCardId: unavailable.id,
                            targetCardName: unavailable.name,
                          },
                          targetSelector: {
                            selectorKind: "card",
                            selection: "exact",
                            referenceKind: "content",
                            source: "deck",
                            ids: [unavailable.id],
                            names: [unavailable.name],
                            required: true,
                          },
                        }
                      : operation,
                ),
              }
            : option,
        ),
      },
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "named_card_target_unavailable",
    });
  });

  it("rejects unavailable deck-affecting named card operations even when the selector source is catalog", async () => {
    const journeyContext = await context("named-card-catalog-invalid");
    const unavailable = journeyContext.content.cards.find(
      (card) => card.rarity !== "Starter",
    )!;
    const cardPayload = {
      familyId: "card",
      variantId: "named-card-operation-menu",
      qaId: "card/named-card-operation-menu",
      description: "Named card operation menu coverage.",
      supportedShapes: ["service_menu"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: cardPayload,
    });
    const targetOptionIndex = manifest.options.findIndex((option) =>
      option.operations.some(
        (operation) =>
          operation.operationKind === "reward" &&
          operation.rewardKind !== "card_gain",
      ),
    );
    const targetOption = manifest.options[targetOptionIndex]!;
    const invalidOperationIndex = targetOption.operations.findIndex(
      (operation) =>
        operation.operationKind === "reward" &&
        operation.rewardKind !== "card_gain",
    );
    const invalidOperation = targetOption.operations[invalidOperationIndex]!;
    const invalid: JourneyManifest = attachTargetResolutionMetadata(
      {
        ...manifest,
        options: manifest.options.map((option, optionIndex) =>
          optionIndex === targetOptionIndex
            ? {
                ...option,
                operations: option.operations.map(
                  (operation, operationIndex) =>
                    operationIndex === invalidOperationIndex
                      ? {
                          ...invalidOperation,
                          payload: {
                            ...invalidOperation.payload,
                            source: "catalog",
                            targetCardId: unavailable.id,
                            targetCardName: unavailable.name,
                          },
                          targetSelector: {
                            selectorKind: "card",
                            selection: "exact",
                            referenceKind: "content",
                            source: "catalog",
                            ids: [unavailable.id],
                            names: [unavailable.name],
                            required: true,
                          },
                        }
                      : operation,
                ),
              }
            : option,
        ),
      },
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(
      invalid.options[targetOptionIndex]!.operations[invalidOperationIndex]!
        .targetResolution,
    ).toMatchObject({
      sourcePool: "catalog",
      candidateCount: 1,
    });
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "named_card_target_unavailable",
      debug: {
        targetResolution: expect.objectContaining({
          sourcePool: "deck",
          candidateCount: 0,
        }),
      },
    });
  });

  it("has a legal conservative filler path for every canonical shape", async () => {
    const journeyContext = await context();

    for (const shape of JOURNEY_SHAPES) {
      const manifest = fillForShape(shape.id, journeyContext);

      expect(
        validateJourneyManifest(manifest, journeyContext),
        shape.id,
      ).toEqual({
        ok: true,
      });
    }
  });

  it("adapts current root option payloads into typed semantic operations", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });

    expectManifestPayloadsHaveTypedOperations(manifest);
    expect(manifest.options.flatMap((option) => option.operations)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          role: "reward",
          visibility: "visible",
        }),
      ]),
    );
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("adapts tree, random, route, delayed, wager, and repeatable payload surfaces", async () => {
    const journeyContext = await context();
    const shapeIds: JourneyShapeId[] = [
      "prize_ladder",
      "random_pool_draws",
      "alter_dreamscapes",
      "reward_after_trigger",
      "single_wager",
      "take_any_number",
    ];

    for (const shapeId of shapeIds) {
      const manifest = fillForShape(shapeId, journeyContext);

      expectManifestPayloadsHaveTypedOperations(manifest);
      expect(
        validateJourneyManifest(manifest, journeyContext),
        shapeId,
      ).toEqual({ ok: true });
    }
  });

  it("keeps semantic operation roles specific for route, delayed, random, and reward-pool payloads", async () => {
    const journeyContext = await context();
    const routeManifest = fillForShape("alter_dreamscapes", journeyContext);
    const delayedManifest = fillForShape(
      "reward_after_trigger",
      journeyContext,
    );
    const randomManifest = fillForShape("random_pool_draws", journeyContext);

    expect(
      routeManifest.options.flatMap((option) => option.operations),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "route_edit",
          role: "route_edit",
        }),
      ]),
    );
    expect(
      delayedManifest.options.flatMap((option) => option.operations),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "delayed_hook",
          role: "trigger",
        }),
      ]),
    );
    expect(randomManifest.precommitted.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "random_envelope",
          role: "random",
          visibility: "precommitted",
        }),
      ]),
    );
    expect(randomManifest.rewardPool?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          role: "reward",
          visibility: "precommitted",
        }),
      ]),
    );
  });

  it("keeps tree branch operations separate from terminal operations", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("random_pool_draws", journeyContext);

    for (const node of manifest.tree?.nodes ?? []) {
      for (const branch of node.branches) {
        const branchOperationIds = new Set(
          branch.operations.map((operation) => operation.operationId),
        );

        expect(
          branch.operations.some((operation) =>
            operation.operationId.includes(":terminal:"),
          ),
          branch.id,
        ).toBe(false);

        for (const terminalOperation of branch.terminal?.operations ?? []) {
          expect(
            branchOperationIds.has(terminalOperation.operationId),
            branch.id,
          ).toBe(false);
        }
      }
    }
  });

  it("exposes typed reward operations for delayed precommitted hooks", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const delayedOperations =
      manifest.precommitted.operations?.filter(
        (operation) =>
          operation.operationKind === "delayed_hook" &&
          operation.role === "delayed_hook",
      ) ?? [];

    expect(delayedOperations.length).toBeGreaterThan(0);

    for (const operation of delayedOperations) {
      expect(
        operation.rewardOperations?.length,
        operation.operationId,
      ).toBeGreaterThan(0);
      expect(operation.payload.rewardOperations, operation.operationId).toEqual(
        operation.rewardOperations,
      );
      expect(operation.payload.reward, operation.operationId).toBeUndefined();
      expect(operation.rewardOperations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operationKind: expect.stringMatching(/^(reward|burden|route_edit|status)$/u),
            visibility: "precommitted",
          }),
        ]),
      );
    }
  });

  diversityAuditIt(
    "varies every forced shape across deterministic seed batches",
    async () => {
      const content = await loadContent(process.cwd());
      const treeShapeIds = new Set(
        JOURNEY_SHAPES.filter(
          (shape) => shape.topology === "decision_tree",
        ).map((shape) => shape.id),
      );

      for (const shape of JOURNEY_SHAPES) {
        const exact = new Set<string>();
        const mechanical = new Set<string>();

        for (let index = 0; index < 20; index += 1) {
          const journeyContext = contextFromContent(
            content,
            `forced:${shape.id}:${index}`,
          );
          const manifest = generateNextJourney({
            context: journeyContext,
            forcedShapeId: shape.id,
            forcedStage: "early",
          });

          expect(
            validateJourneyManifest(manifest, journeyContext),
            `${shape.id}:${index}`,
          ).toEqual({ ok: true });
          exact.add(exactVisibleSignature(manifest));
          mechanical.add(mechanicalSignature(manifest));
        }

        expect(exact.size, shape.id).toBeGreaterThanOrEqual(
          treeShapeIds.has(shape.id) ? 10 : 8,
        );
        expect(mechanical.size, shape.id).toBeGreaterThanOrEqual(
          treeShapeIds.has(shape.id) ? 6 : 5,
        );
      }
    },
    180000,
  );

  diversityAuditIt(
    "keeps stage batches mechanically diverse across deterministic seeds",
    async () => {
      const content = await loadContent(process.cwd());
      const thresholds = {
        early: { exact: 85, mechanical: 65, structural: 65, largest: 3 },
        mid: { exact: 75, mechanical: 55, structural: 55, largest: 3 },
        late: { exact: 75, mechanical: 55, structural: 55, largest: 3 },
      } as const;

      for (const stage of ["early", "mid", "late"] as const) {
        const manifests = Array.from({ length: 100 }, (_, index) => {
          const journeyContext = contextFromContent(
            content,
            `audit:${stage}:${index}`,
            stage,
          );
          const manifest = generateNextJourney({
            context: journeyContext,
            forcedStage: stage,
          });

          expect(
            validateJourneyManifest(manifest, journeyContext),
            `${stage}:${index}`,
          ).toEqual({ ok: true });
          return manifest;
        });
        const exact = manifests.map(exactVisibleSignature);
        const mechanical = manifests.map(mechanicalSignature);
        const structural = manifests.map(structuralSignature);

        expect(new Set(exact).size, `${stage}:exact`).toBeGreaterThanOrEqual(
          thresholds[stage].exact,
        );
        expect(
          new Set(mechanical).size,
          `${stage}:mechanical`,
        ).toBeGreaterThanOrEqual(thresholds[stage].mechanical);
        expect(
          new Set(structural).size,
          `${stage}:structural`,
        ).toBeGreaterThanOrEqual(thresholds[stage].structural);
        expect(
          largestGroupSize(exact),
          `${stage}:largest exact duplicate group`,
        ).toBeLessThanOrEqual(thresholds[stage].largest);
      }
    },
    180000,
  );

  it("keeps a small early batch mechanically varied without running the full audit", async () => {
    const content = await loadContent(process.cwd());
    const manifests = Array.from({ length: 8 }, (_, index) => {
      const journeyContext = contextFromContent(
        content,
        `smoke:early:${index}`,
        "early",
      );
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "early",
      });

      expect(
        validateJourneyManifest(manifest, journeyContext),
        `smoke:early:${index}`,
      ).toEqual({ ok: true });
      return manifest;
    });

    expect(
      new Set(manifests.map(exactVisibleSignature)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(
      new Set(manifests.map(mechanicalSignature)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(
      largestGroupSize(manifests.map(exactVisibleSignature)),
    ).toBeLessThanOrEqual(2);
  });

  it("fills linked root menus to three choices in the default run context", async () => {
    const journeyContext = await context();
    const linkedMenuShapeIds: JourneyShapeId[] = [
      "same_reward_different_costs",
      "shop_row",
      "one_target_many_operations",
      "mirrored_operations",
      "one_operation_many_targets",
    ];

    for (const shapeId of linkedMenuShapeIds) {
      const manifest = fillForShape(shapeId, journeyContext);

      expect(manifest.options, shapeId).toHaveLength(3);
      expect(
        manifest.options.map((option) => option.number),
        shapeId,
      ).toEqual([1, 2, 3]);
      expect(
        validateJourneyManifest(manifest, journeyContext),
        shapeId,
      ).toEqual({ ok: true });
    }
  });

  it("adapts fill-planned shop rows into typed cost and reward operations", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("shop_row", journeyContext);

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(
      manifest.options.map((journeyOption) => {
        const costOperation = journeyOption.operations.find(
          (operation) => operation.operationKind === "cost",
        );
        const rewardOperation = journeyOption.operations.find(
          (operation) => operation.operationKind === "reward",
        );

        expect(costOperation).toBeDefined();
        expect(rewardOperation).toBeDefined();

        return costOperation?.operationKind === "cost"
          ? {
              resource: costOperation.resource,
              amount: costOperation.amount,
            }
          : undefined;
      }),
    ).toEqual([
      { resource: "omens", amount: 1 },
      { resource: "omens", amount: 1 },
      { resource: "omens", amount: 1 },
    ]);
  });

  it("fills shared-cost named Dreamsign shop rows without forced debug payloads", async () => {
    const journeyContext = await context("shop-test-4");
    const manifest = fillForShapeAtStage("shop_row", journeyContext, "mid");
    const report = buildValidationReport(manifest, journeyContext);
    const costOperations = manifest.options.map((journeyOption) =>
      journeyOption.operations.find((operation) =>
        operation.operationKind === "cost"
      )
    );
    const dreamsignPurchases = manifest.options.map((journeyOption) =>
      journeyOption.operations.find((operation) =>
        operation.operationKind === "reward" &&
        operation.rewardKind === "dreamsign_purchase"
      )
    );

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(manifest.debug.debugPayload).toBeUndefined();
    expect(costOperations).toEqual([
      expect.objectContaining({ resource: "essence", amount: 45 }),
      expect.objectContaining({ resource: "essence", amount: 45 }),
      expect.objectContaining({ resource: "essence", amount: 45 }),
    ]);
    expect(dreamsignPurchases.map((operation) => operation?.payload.dreamsignName))
      .toHaveLength(3);
    expect(new Set(dreamsignPurchases.map((operation) => operation?.payload.dreamsignName)).size)
      .toBe(3);
    expect(report.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "same_cost_different_named_goods",
          status: "pass",
        }),
      ]),
    );
  });

  it("represents omen-priced named Dreamsign purchases as structured costs", async () => {
    const journeyContext = await context("default");
    journeyContext.state.quest.resources.omens = 2;
    const manifest = fillForShapeAtStage("shop_row", journeyContext, "mid");

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(
      manifest.options.map((journeyOption) =>
        journeyOption.operations.find((operation) =>
          operation.operationKind === "cost"
        )
      ),
    ).toEqual([
      expect.objectContaining({ resource: "omens", amount: 2 }),
      expect.objectContaining({ resource: "omens", amount: 2 }),
      expect.objectContaining({ resource: "omens", amount: 2 }),
    ]);
    expect(
      manifest.options.map((journeyOption) =>
        journeyOption.operations.find((operation) =>
          operation.operationKind === "reward" &&
          operation.rewardKind === "dreamsign_purchase"
        )?.payload
      ),
    ).toEqual([
      expect.objectContaining({
        purchaseCurrency: "omens",
        purchaseAmount: 2,
      }),
      expect.objectContaining({
        purchaseCurrency: "omens",
        purchaseAmount: 2,
      }),
      expect.objectContaining({
        purchaseCurrency: "omens",
        purchaseAmount: 2,
      }),
    ]);
  });

  it("keeps Curator's Shelf and Moon Market names as ordinary coherent shop-row candidates", async () => {
    const journeyContext = await context();
    const groups = namedDreamsignShopRowCandidateGroups({
      context: journeyContext,
      stage: "mid",
      sources: ["catalog"],
    });
    const groupContains = (names: readonly string[]) =>
      groups.some((group) => {
        const groupNames = new Set(
          group.candidates.map((candidate) => candidate.dreamsign.name),
        );

        return names.every((name) => groupNames.has(name));
      });

    expect(
      groupContains(["Ginger Root", "Cloud Lens", "Leather Satchel"]),
    ).toBe(true);
    expect(
      groupContains(["Witch Hat", "Black Cat", "Skull Dagger"]),
    ).toBe(true);
  });

  it("adapts a shared operation fill plan across several target selectors", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("one_operation_many_targets", journeyContext);
    const rewardPayloads = manifest.options.map((journeyOption) => {
      const rewardOperation = journeyOption.operations.find(
        (operation) => operation.operationKind === "reward",
      );

      expect(rewardOperation).toBeDefined();
      return stableStringify(rewardOperation?.payload);
    });
    const targetDescriptions = manifest.options.map((journeyOption) => {
      const targetOperation = journeyOption.operations.find(
        (operation) => operation.operationKind === "target",
      );

      expect(targetOperation).toBeDefined();
      return targetOperation?.operationKind === "target"
        ? targetOperation.targetSelector.description
        : undefined;
    });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(new Set(rewardPayloads).size).toBe(1);
    expect(new Set(targetDescriptions).size).toBe(3);
  });

  it("validates One Blessing, Three Vessels as one transfiguration across visible named card targets", async () => {
    const { manifest, journeyContext } = await findValidForcedShapeManifest(
      "one_operation_many_targets",
      "m18-one-blessing",
      (candidate) =>
        candidate.debug.symmetryContracts?.some(
          (contract) =>
            contract.contractKind === "shared_operation_named_targets" &&
            contract.variedProperty === "visible named card target",
        ) === true,
    );
    const rewardOperations = manifest.options.map((journeyOption) =>
      journeyOption.operations.find((operation) =>
        operation.operationKind === "reward"
      )
    );
    const targetOperations = manifest.options.map((journeyOption) =>
      journeyOption.operations.find((operation) =>
        operation.operationKind === "target"
      )
    );
    const transfigurations = rewardOperations.map((operation) =>
      operation?.operationKind === "reward"
        ? (operation.payload as Record<string, unknown>).transfigurationName
        : undefined
    );
    const targetNames = targetOperations.flatMap((operation) =>
      operation?.operationKind === "target"
        ? operation.targetSelector.selectorKind === "card"
          ? operation.targetSelector.names ?? []
          : []
        : []
    );

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(new Set(transfigurations).size).toBe(1);
    expect(transfigurations[0]).toEqual(expect.any(String));
    expect(targetNames).toHaveLength(3);
    expect(new Set(targetNames).size).toBe(3);
  });

  it("validates Equal Shadow as one shared Bane burden over Dreamsign, card draft, and route rewards", async () => {
    const { manifest, journeyContext } = await findValidForcedShapeManifest(
      "same_cost_different_rewards",
      "m18-equal-shadow",
      (candidate) =>
        candidate.debug.symmetryContracts?.some(
          (contract) =>
            contract.contractKind === "shared_burden_different_rewards",
        ) === true,
    );
    const burdenNames = manifest.options.flatMap((journeyOption) =>
      journeyOption.operations.flatMap((operation) =>
        operation.operationKind === "burden" &&
          operation.burdenKind === "bane_gain"
          ? operation.targetSelector?.selectorKind === "bane"
            ? operation.targetSelector.names ?? []
            : []
          : []
      )
    );
    const rewardKinds = new Set(
      manifest.options.flatMap((journeyOption) =>
        journeyOption.operations.flatMap((operation) =>
          operation.operationKind === "reward" ? [operation.rewardKind] : []
        )
      ),
    );
    const routeEditKinds = new Set(
      manifest.options.flatMap((journeyOption) =>
        journeyOption.operations.flatMap((operation) =>
          operation.operationKind === "route_edit" ? [operation.editKind] : []
        )
      ),
    );

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(burdenNames).toHaveLength(3);
    expect(new Set(burdenNames).size).toBe(1);
    expect([...rewardKinds]).toEqual(
      expect.arrayContaining(["dreamsign_gain", "card_draft"]),
    );
    expect(routeEditKinds).toContain("add_site");
  });

  it("validates One Card, Three Masks as one visible named target with three transfiguration operations", async () => {
    const { manifest, journeyContext } = await findValidForcedShapeManifest(
      "one_target_many_operations",
      "m18-one-card-three-masks",
      (candidate) =>
        candidate.debug.symmetryContracts?.some(
          (contract) =>
            contract.contractKind === "shared_target_operations" &&
            contract.variedProperty === "transfiguration operation",
        ) === true,
    );
    const rewardOperations = manifest.options.map((journeyOption) =>
      journeyOption.operations.find((operation) =>
        operation.operationKind === "reward"
      )
    );
    const targetNames = manifest.options.flatMap((journeyOption) =>
      journeyOption.operations.flatMap((operation) =>
        operation.operationKind === "target" &&
          operation.targetSelector.selectorKind === "card"
          ? operation.targetSelector.names ?? []
          : []
      )
    );
    const transfigurations = rewardOperations.map((operation) =>
      operation?.operationKind === "reward"
        ? (operation.payload as Record<string, unknown>).transfigurationName
        : undefined
    );

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(targetNames).toHaveLength(3);
    expect(new Set(targetNames).size).toBe(1);
    expect(new Set(transfigurations).size).toBe(3);
    expect(transfigurations).toEqual(
      expect.arrayContaining([
        expect.any(String),
        expect.any(String),
        expect.any(String),
      ]),
    );
  });

  it("builds Scissor Saint as card and Dreamsign sacrifices paired with normal rewards", async () => {
    const journeyContext = await context("m20-scissor");
    const manifest = compoundManifestForFamily("scissor_saint", journeyContext);
    const operationKinds = manifest.options.map((journeyOption) =>
      journeyOption.operations.map((operation) =>
        operation.operationKind === "reward"
          ? operation.rewardKind
          : operation.operationKind === "burden"
            ? operation.burdenKind
            : operation.operationKind
      )
    );

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(operationKinds).toEqual([
      expect.arrayContaining(["card_sacrifice", "dreamsign_gain"]),
      expect.arrayContaining(["card_sacrifice", "card_draft"]),
      expect.arrayContaining(["dreamsign_sacrifice", "transfiguration"]),
    ]);
    expect(manifest.options.every((journeyOption) =>
      journeyOption.symbols.includes("reward") &&
      journeyOption.symbols.includes("risk")
    )).toBe(true);
  });

  it("builds Molting Archive as transform-plus-reward and random-card-gain-plus-purge compounds", async () => {
    const journeyContext = await context("m20-molting");
    const manifest = compoundManifestForFamily("molting_archive", journeyContext);
    const options = manifest.options.map((journeyOption) => ({
      rewards: journeyOption.operations.flatMap((operation) =>
        operation.operationKind === "reward" ? [operation.rewardKind] : []
      ),
      burdens: journeyOption.operations.flatMap((operation) =>
        operation.operationKind === "burden" ? [operation.burdenKind] : []
      ),
    }));

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(options[0]!.rewards).toEqual(
      expect.arrayContaining(["dreamsign_transform", "resource"]),
    );
    expect(options[1]!.rewards).toEqual(
      expect.arrayContaining(["dreamsign_gain", "card_transform"]),
    );
    expect(options[2]).toMatchObject({
      rewards: expect.arrayContaining(["card_gain"]),
      burdens: expect.arrayContaining(["card_sacrifice"]),
    });
  });

  it("builds Withered Orchard as reward-reduction burdens paired with Dreamsign, Legendary card, and starter cleanup rewards", async () => {
    const journeyContext = await context("m20-withered");
    const manifest = compoundManifestForFamily("withered_orchard", journeyContext);
    const valueBreakdown = evaluateOptionValue(manifest.options[0]!, journeyContext);

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(
      manifest.options.map((journeyOption) =>
        journeyOption.operations.map((operation) =>
          operation.operationKind === "reward"
            ? operation.rewardKind
            : operation.operationKind === "status"
              ? `${operation.role}:${operation.statusKind}`
              : operation.operationKind
        )
      ),
    ).toEqual([
      expect.arrayContaining(["burden:status_reward_reduction", "dreamsign_gain"]),
      expect.arrayContaining(["burden:status_reward_reduction", "card_gain"]),
      expect.arrayContaining(["burden:status_reward_reduction", "starter_cleanup"]),
    ]);
    expect(valueBreakdown.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "burden", value: -120 }),
        expect.objectContaining({ kind: "effect", value: 320 }),
      ]),
    );
  });

  it("builds mixed service compounds with cost, route, and follow-up pairings", async () => {
    const journeyContext = await context("m20-mixed-service");
    const manifest = compoundManifestForFamily("mixed_service", journeyContext);
    const operationKinds = manifest.options.map((journeyOption) =>
      journeyOption.operations.map((operation) =>
        operation.operationKind === "reward"
          ? operation.rewardKind
          : operation.operationKind === "cost"
            ? operation.operationKind
            : operation.operationKind === "route_edit"
              ? operation.operationKind
              : operation.operationKind
      )
    );

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(operationKinds).toEqual([
      expect.arrayContaining(["cost", "dreamsign_gain"]),
      expect.arrayContaining(["dreamsign_gain", "route_edit"]),
      expect.arrayContaining(["dreamsign_gain", "resource"]),
    ]);
  });

  it("serves normal card-operation shapes from topology-compatible catalog entries", async () => {
    const drawContext: DrawContext = {
      seed: "card-operation-catalog",
      contentVersion: "test-content-version",
      rootJourneyIndex: 0,
    };
    const oneTargetOperations = compatibleCardOperations(drawContext, {
      topology: "one_target_many_operations",
      targetClasses: ["draft_card"],
      valueBands: ["standard", "temporary"],
      timings: ["immediate", "battle_window"],
      label: "test:one-target",
      count: 3,
    });
    const mirroredRewriteOperations = compatibleCardOperations(drawContext, {
      topology: "mirrored_operations",
      targetClasses: ["draft_card"],
      families: ["keyword", "cost", "text"],
      valueBands: ["standard"],
      timings: ["immediate"],
      label: "test:mirrored-rewrite",
      count: 4,
    });
    const oneOperationOperations = compatibleCardOperations(drawContext, {
      topology: "one_operation_many_targets",
      targetClasses: ["draft_card", "starter_card", "deck_card"],
      targetModes: ["drafted_card", "chosen"],
      valueBands: ["standard", "premium"],
      timings: ["immediate"],
      label: "test:one-operation",
      count: 3,
    });
    const duplicateAcrossVisibleTargets = compatibleCardOperations(drawContext, {
      topology: "one_operation_many_targets",
      targetClasses: ["draft_card", "starter_card", "deck_card"],
      targetModes: ["drafted_card", "chosen"],
      families: ["duplicate"],
      valueBands: ["premium"],
      timings: ["immediate"],
      label: "test:one-duplicate-many-targets",
      count: 1,
    });

    expect(oneTargetOperations).toHaveLength(3);
    expect(
      mirroredRewriteOperations.map((operation) => operation.family),
    ).toEqual(expect.arrayContaining(["keyword", "cost", "text"]));
    expect(
      new Set(oneOperationOperations.map((operation) => operation.key)).size,
    ).toBe(3);
    expect(
      oneTargetOperations.every((operation) =>
        ["standard", "temporary"].includes(operation.valueBand),
      ),
    ).toBe(true);
    expect(
      oneOperationOperations.every(
        (operation) => operation.timing === "immediate",
      ),
    ).toBe(true);
    expect(duplicateAcrossVisibleTargets[0]).toMatchObject({
      family: "duplicate",
      targetModes: expect.arrayContaining(["drafted_card", "chosen"]),
    });
  });

  it("covers milestone card-operation families and brainstorm examples through the normal catalog", async () => {
    const operations = CARD_OPERATION_DEBUG_CATALOG.operations;
    const byKey = new Map(operations.map((operation) => [operation.key, operation]));

    [
      "chosen-purge",
      "random-purge",
      "all-duplicate-purge",
      "starter-replacement-draft",
      "starter-replacement-named",
      "starter-replacement-all",
      "starter-replacement-random",
      "random-starter-purge",
      "all-starter-purge",
      "named-card-replacement",
      "transform-to-random-card",
      "transform-to-named-card",
      "duplicate-count-two",
      "batch-duplicate",
      "merge",
      "split",
      "change-type-event",
      "change-subtype-sigil",
      "remove-dissolve",
      "remove-transfiguration",
      "ink-reassignment-text",
      "remove-target-restriction",
      "opening-hand-window",
      "materialized-ability-conversion",
      "all-card-transfiguration",
      "all-event-transfiguration",
      "random-predicate-transfiguration",
      "random-starter-transfiguration",
      "two-chosen-starter-transfiguration",
    ].forEach((key) => expect(byKey.has(key), key).toBe(true));

    expect(CARD_OPERATION_DEBUG_CATALOG.targetModes).toEqual(
      expect.arrayContaining([
        "chosen",
        "exact_named",
        "random_predicate",
        "all_matching",
        "drafted_card",
      ]),
    );

    expect(byKey.get("ink-reassignment-text")).toMatchObject({
      family: "text",
      effect: expect.objectContaining({ rewriteMode: "ink_reassignment" }),
    });
    expect(byKey.get("change-subtype-sigil")).toMatchObject({
      family: "subtype",
      effect: expect.objectContaining({ newSubtype: "Sigil" }),
    });
    expect(byKey.get("event-keyword-rewrite")).toMatchObject({
      family: "keyword",
      effect: expect.objectContaining({ rewriteMode: "event_keyword_rewrite" }),
    });
    expect(byKey.get("merge")).toMatchObject({ family: "merge_split" });
    expect(byKey.get("split")).toMatchObject({ family: "merge_split" });
    expect(byKey.get("materialized-ability-conversion")).toMatchObject({
      family: "materialized_ability",
      effect: expect.objectContaining({ materializedAbilityConversion: true }),
    });
    expect(CARD_OPERATION_DEBUG_CATALOG.allowedTransfigurations).toEqual(
      expect.arrayContaining(["Viridian", "Scarlet", "Silver", "Umbral", "Glass"]),
    );
  });

  it("serves Dreamsign operation menus from a normal topology-compatible catalog", async () => {
    const journeyContext = await context("dreamsign-operation-catalog");
    const activeDreamsignId = journeyContext.state.quest.dreamsignPoolIds[0]!;
    journeyContext.state.quest.activeDreamsigns = [{ dreamsignId: activeDreamsignId }];
    const drawContext: DrawContext = {
      seed: "dreamsign-operation-catalog",
      contentVersion: "test-content-version",
      rootJourneyIndex: 0,
    };
    const activeOperations = compatibleDreamsignOperations(drawContext, {
      topology: "one_target_many_operations",
      targetSources: ["active"],
      families: ["loss", "purge", "duplicate", "transform", "trigger_counter"],
      context: journeyContext,
      stage: "mid",
      label: "test:dreamsign-active",
      count: 6,
    });
    const poolOperations = compatibleDreamsignOperations(drawContext, {
      topology: "mirrored_operations",
      targetSources: ["pool"],
      families: ["pool_edit", "copy_gain", "trade_hook", "random_reward"],
      context: journeyContext,
      stage: "mid",
      label: "test:dreamsign-pool",
      count: 4,
    });
    const catalogOperations = compatibleDreamsignOperations(drawContext, {
      topology: "direct_menu",
      targetSources: ["catalog"],
      families: ["gain", "purchase", "temporary_grant", "random_reward"],
      context: journeyContext,
      stage: "mid",
      label: "test:dreamsign-catalog",
      count: 5,
    });

    expect(activeOperations.map((operation) => operation.family)).toEqual(
      expect.arrayContaining(["loss", "purge", "duplicate", "transform"]),
    );
    expect(poolOperations.map((operation) => operation.family)).toEqual(
      expect.arrayContaining(["pool_edit", "copy_gain", "trade_hook", "random_reward"]),
    );
    expect(catalogOperations.map((operation) => operation.family)).toEqual(
      expect.arrayContaining(["gain", "purchase", "temporary_grant", "random_reward"]),
    );
    expect(
      [...activeOperations, ...poolOperations, ...catalogOperations].every(
        (operation) =>
          operation.effect.dreamsignOperationFamily === operation.family &&
          Array.isArray(operation.effect.dreamsignOperationTargetModes),
      ),
    ).toBe(true);
  });

  it("covers milestone Dreamsign families and structured predicates through the normal catalog", async () => {
    const operations = DREAMSIGN_OPERATION_DEBUG_CATALOG.operations;
    const byKey = new Map(operations.map((operation) => [operation.key, operation]));
    const predicateKeys = DREAMSIGN_OPERATION_DEBUG_CATALOG.predicates.map(
      (predicate) => predicate.key,
    );

    [
      "exact-named-gain",
      "purchase-with-essence",
      "purchase-with-omen",
      "lose-active",
      "purge",
      "duplicate",
      "copy-gain",
      "temporary-grant",
      "transform-to-named",
      "transform-to-random",
      "pool-add",
      "pool-remove",
      "pool-replace",
      "random-pool-reward",
      "random-neutral-reward",
      "trade-hook",
      "trigger-counter",
    ].forEach((key) => expect(byKey.has(key), key).toBe(true));

    expect(predicateKeys).toEqual(
      expect.arrayContaining([
        "neutral",
        "tidal",
        "quest-oriented",
        "battle-oriented",
        "selected-tide-overlap",
        "pool-only",
        "active-only",
        "catalog-wide",
      ]),
    );
  });

  it("resolves Dreamsign predicates for active, pool, catalog, neutral, and orientation sources", async () => {
    const journeyContext = await context("dreamsign-predicate-sources");
    const activeDreamsignId = journeyContext.state.quest.dreamsignPoolIds[0]!;
    journeyContext.state.quest.activeDreamsigns = [{ dreamsignId: activeDreamsignId }];
    const resolved = Object.fromEntries(
      DREAMSIGN_PREDICATE_PROFILES.map((profile) => [
        profile.key,
        resolveDreamsignTargets(
          journeyContext.content,
          journeyContext.state.quest,
          profile.predicate,
        ),
      ]),
    );

    expect(resolved["active-only"]).toHaveLength(1);
    expect(resolved["pool-only"]!.length).toBeGreaterThan(0);
    expect(resolved["catalog-wide"]!.length).toBe(journeyContext.content.dreamsigns.length);
    expect(
      resolved.neutral!.every((dreamsign) => dreamsign.kind === "neutral"),
    ).toBe(true);
    expect(
      resolved["quest-oriented"]!.every((dreamsign) => dreamsign.orientation === "quest"),
    ).toBe(true);
    expect(
      resolved["battle-oriented"]!.every((dreamsign) => dreamsign.orientation === "battle"),
    ).toBe(true);
    expect(resolved["quest-oriented"]!.length).toBeGreaterThan(0);
    expect(resolved["battle-oriented"]!.length).toBeGreaterThan(0);
  });

  it("can produce named Dreamsign operation menus through normal generation", async () => {
    const seen = new Set<string>();

    for (
      let index = 0;
      index < 60 &&
        !["transform", "duplicate", "pool_edit"].every((family) => seen.has(family));
      index += 1
    ) {
      const journeyContext = await context(`normal-dreamsign-operation:${index}`);
      let manifest: JourneyManifest;

      try {
        manifest = generateNextJourney({
          context: journeyContext,
          forcedShapeId: index % 2 === 0
            ? "one_target_many_operations"
            : "mirrored_operations",
          forcedStage: "mid",
        });
      } catch {
        continue;
      }

      expect(manifest.debug.debugPayload).toBeUndefined();
      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      for (const operation of manifest.options.flatMap((option) => option.operations)) {
        if (
          operation.operationKind === "reward" &&
          typeof operation.payload?.dreamsignOperationFamily === "string"
        ) {
          seen.add(operation.payload.dreamsignOperationFamily);
        }
      }
    }

    expect(Array.from(seen)).toEqual(
      expect.arrayContaining(["transform", "duplicate", "pool_edit"]),
    );
  });

  it("validates Dreamsign Loom, Pool Compass, and Sign Between Bells capability families", async () => {
    const journeyContext = await context("dreamsign-brainstorm-coverage");
    const activeDreamsignId = journeyContext.state.quest.dreamsignPoolIds[0]!;
    journeyContext.state.quest.activeDreamsigns = [{ dreamsignId: activeDreamsignId }];
    const drawContext: DrawContext = {
      seed: "dreamsign-brainstorm-coverage",
      contentVersion: "test-content-version",
      rootJourneyIndex: 0,
    };
    const dreamsignOperation = (
      family: DreamsignOperationFamily,
      label: string,
    ) => compatibleDreamsignOperations(drawContext, {
      topology: "direct_menu",
      targetSources: ["pool", "catalog", "active"],
      families: [family],
      context: journeyContext,
      stage: "mid",
      label,
      count: 1,
    })[0]!;
    const loom = [
      dreamsignOperation("transform", "test:dreamsign-loom:transform"),
      dreamsignOperation("duplicate", "test:dreamsign-loom:duplicate"),
      dreamsignOperation("purge", "test:dreamsign-loom:purge"),
      dreamsignOperation("pool_edit", "test:dreamsign-loom:pool-edit"),
    ];
    const compass = [
      dreamsignOperation("pool_edit", "test:pool-compass:pool-edit"),
      dreamsignOperation("copy_gain", "test:pool-compass:copy-gain"),
    ];
    const bells = [
      dreamsignOperation("gain", "test:sign-between-bells:named"),
      dreamsignOperation("random_reward", "test:sign-between-bells:random"),
      dreamsignOperation("random_reward", "test:sign-between-bells:predicate"),
    ];
    const groupedOptions = [loom, compass, bells].map((operations, index) =>
      option({
        number: index + 1,
        text: operations.map(renderChosenDreamsignOperationText).join(" "),
        costs: operations.flatMap((operation) => operation.costs ?? []),
        effects: operations.map((operation) => operation.effect),
        targets: operations.flatMap((operation) => operation.targets),
        cost: operations.reduce((total, operation) => total + (operation.cost ?? 0), 0),
        effect: 320,
        uncertainty: operations.reduce(
          (total, operation) => total + (operation.uncertainty ?? 0),
          0,
        ),
      }),
    );
    const manifest = {
      ...fillForShape("mirrored_operations", journeyContext),
      options: groupedOptions,
      precommitted: refreshPrecommittedOperations({
        random: [{ kind: "dreamsign_random_reward", source: "catalog" }],
      }),
    };
    const families = groupedOptions.flatMap((journeyOption) =>
      journeyOption.operations.flatMap((operation) =>
        typeof operation.payload?.dreamsignOperationFamily === "string"
          ? [operation.payload.dreamsignOperationFamily]
          : [],
      ),
    );
    const randomReward = groupedOptions
      .flatMap((journeyOption) => journeyOption.operations)
      .find((operation) => operation.rewardKind === "dreamsign_random_reward");

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(families).toEqual(
      expect.arrayContaining([
        "transform",
        "duplicate",
        "purge",
        "pool_edit",
        "copy_gain",
        "gain",
        "random_reward",
      ]),
    );
    expect(randomReward).toMatchObject({
      targetSelector: expect.objectContaining({
        selectorKind: "dreamsign",
        selection: "hidden_random",
      }),
    });
  });

  it("rejects incompatible card-operation target modes before rendering", async () => {
    const journeyContext = await context("card-operation-target-compatibility");
    const manifest = fillForShape("one_operation_many_targets", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.map((option, index) =>
        index === 0
          ? refreshOptionOperations({
              ...option,
              targets: option.targets.map((targetRecord) =>
                typeof targetRecord === "object" && targetRecord !== null
                  ? {
                      ...targetRecord,
                      cardOperationTargetMode: "random_predicate",
                    }
                  : targetRecord,
              ),
            })
          : option,
      ),
    };

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "card_operation_target_compatibility",
    });
  });

  it("can produce named card operation rows through normal generation", async () => {
    const seen = new Set<string>();

    for (let index = 0; index < 40 && seen.size === 0; index += 1) {
      const journeyContext = await context(`normal-named-card-operation:${index}`);
      const manifest = fillForShapeAtStage(
        "curated_reward_trio",
        journeyContext,
        "mid",
      );

      expect(manifest.debug.debugPayload).toBeUndefined();
      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      manifest.options
        .flatMap((option) => option.operations)
        .filter(
          (operation) =>
            operation.operationKind === "reward" &&
            ["card_transform", "card_replace", "card_duplicate"].includes(
              operation.rewardKind,
            ) &&
            operation.payload.cardOperationTargetMode === "exact_named",
        )
        .forEach((operation) => seen.add(operation.rewardKind));
    }

    expect(seen.size).toBeGreaterThan(0);
  });

  it("keeps delayed-hook shapes as real root choices", async () => {
    const journeyContext = await context();
    const delayedChoiceShapeIds: JourneyShapeId[] = [
      "now_vs_later",
      "reward_after_trigger",
      "paired_return",
      "commit_now_future_payoff",
    ];

    for (const shapeId of delayedChoiceShapeIds) {
      const manifest = fillForShape(shapeId, journeyContext);
      const expectedOptionCount =
        shapeId === "commit_now_future_payoff" || shapeId === "paired_return"
          ? 3
          : 2;

      expect(manifest.options, shapeId).toHaveLength(expectedOptionCount);
      expect(
        manifest.options.map((option) => option.number),
        shapeId,
      ).toEqual(
        Array.from({ length: expectedOptionCount }, (_, index) => index + 1),
      );
      expect(manifest.precommitted.delayed, shapeId).toBeDefined();
      expect(
        validateJourneyManifest(manifest, journeyContext),
        shapeId,
      ).toEqual({ ok: true });
    }
  });

  it("fills generic delayed reward shapes with typed trackable hook contracts", async () => {
    const journeyContext = await context("generic-delayed-hooks");
    const delayedShapeIds: JourneyShapeId[] = [
      "now_vs_later",
      "reward_after_trigger",
      "commit_now_future_payoff",
    ];

    for (const shapeId of delayedShapeIds) {
      const manifest = fillForShape(shapeId, journeyContext);
      const delayedPrecommits = manifest.precommitted.delayed ?? [];
      const optionHookIds = new Set(
        manifest.options
          .flatMap((option) => option.triggers)
          .map((trigger) =>
            typeof trigger === "object" &&
            trigger !== null &&
            !Array.isArray(trigger) &&
            "hookId" in trigger
              ? trigger.hookId
              : undefined,
          )
          .filter((hookId): hookId is string => typeof hookId === "string"),
      );
      const delayedOperations =
        manifest.precommitted.operations?.filter(
          (operation) =>
            operation.operationKind === "delayed_hook" &&
            operation.role === "delayed_hook",
        ) ?? [];

      expect(delayedPrecommits.length, shapeId).toBeGreaterThan(0);
      expect(delayedOperations, shapeId).toHaveLength(delayedPrecommits.length);

      for (const precommit of delayedPrecommits) {
        expect(precommit, shapeId).toMatchObject({
          kind: "delayed_hook_contract",
          hookId: expect.any(String),
          optionNumber: expect.any(Number),
          triggerSelector: expect.objectContaining({
            triggerKind: expect.any(String),
            label: expect.any(String),
          }),
          trackedCondition: expect.any(String),
          resolution: expect.any(String),
          expiration: expect.objectContaining({
            policyKind: expect.any(String),
            label: expect.any(String),
          }),
          duration: expect.objectContaining({
            durationKind: expect.any(String),
            label: expect.any(String),
          }),
          controlledScene: expect.objectContaining({
            sceneKind: expect.stringMatching(/^(reward|cost|transformation|trade|return)$/u),
            label: expect.any(String),
          }),
          visibilityPolicy: expect.objectContaining({
            outcomeVisibility: "visible",
            disclosure: expect.any(String),
          }),
          hookBudgetCost: 1,
          rewardMetadata: expect.objectContaining({
            rewardKey: expect.any(String),
            expectedConvertedEssence: expect.any(Number),
          }),
        });
        expect(
          optionHookIds.has((precommit as { hookId: string }).hookId),
          shapeId,
        ).toBe(true);
      }

      for (const operation of delayedOperations) {
        expect(operation, shapeId).toMatchObject({
          triggerSelector: expect.objectContaining({
            triggerKind: expect.any(String),
          }),
          duration: expect.objectContaining({
            durationKind: expect.any(String),
          }),
          expiration: expect.objectContaining({
            policyKind: expect.any(String),
          }),
          controlledScene: expect.objectContaining({
            sceneKind: expect.stringMatching(/^(reward|cost|transformation|trade|return)$/u),
          }),
          visibilityPolicy: expect.objectContaining({
            outcomeVisibility: "visible",
          }),
          hookBudgetCost: 1,
          rewardOperations: expect.any(Array),
        });
      }

      expect(validateJourneyManifest(manifest, journeyContext), shapeId).toEqual({
        ok: true,
      });
    }
  });

  it("fills generic paired-return choices with typed return contracts", async () => {
    const journeyContext = await context("generic-paired-return");
    const manifest = fillForShape("paired_return", journeyContext);
    const pairedPrecommits = manifest.precommitted.pairedReturn ?? [];
    const delayedPrecommits = manifest.precommitted.delayed ?? [];
    const optionHookIds = new Set(
      manifest.options
        .flatMap((option) => option.triggers)
        .map((trigger) =>
          typeof trigger === "object" &&
          trigger !== null &&
          !Array.isArray(trigger) &&
          "hookId" in trigger
            ? trigger.hookId
            : undefined,
        )
        .filter((hookId): hookId is string => typeof hookId === "string"),
    );
    const pairedOperations =
      manifest.precommitted.operations?.filter(
        (operation) => operation.operationKind === "paired_return",
      ) ?? [];
    const delayedOperations =
      manifest.precommitted.operations?.filter(
        (operation) =>
          operation.operationKind === "delayed_hook" &&
          operation.payload.kind === "paired_return_contract",
      ) ?? [];

    expect(pairedPrecommits).toHaveLength(3);
    expect(delayedPrecommits).toHaveLength(3);
    expect(pairedOperations).toHaveLength(3);
    expect(delayedOperations).toHaveLength(3);

    for (const precommit of pairedPrecommits) {
      expect(precommit).toMatchObject({
        kind: "paired_return_contract",
        pairedReturnId: expect.any(String),
        hookId: expect.any(String),
        optionNumber: expect.any(Number),
        anchor: expect.any(String),
        created: expect.objectContaining({
          referenceKind: expect.stringMatching(
            /^(sealed_object|borrowed_object|trade_promise)$/u,
          ),
          referenceId: expect.any(String),
          label: expect.any(String),
        }),
        returnScene: expect.objectContaining({
          returnSceneKind: expect.stringMatching(
            /^(sealed_object_return|borrowed_object_return|future_trade)$/u,
          ),
          triggerSelector: expect.objectContaining({
            triggerKind: expect.any(String),
            label: expect.any(String),
          }),
          referencesCreatedId: expect.any(String),
          referencesAnchor: expect.any(String),
          resolution: expect.any(String),
          expiration: expect.objectContaining({
            policyKind: expect.any(String),
            label: expect.any(String),
          }),
          duration: expect.objectContaining({
            durationKind: expect.any(String),
            label: expect.any(String),
          }),
          futureCost: expect.anything(),
          returnReward: expect.anything(),
        }),
        futureCost: expect.anything(),
        returnReward: expect.anything(),
        visibilityPolicy: expect.objectContaining({
          outcomeVisibility: "visible",
        }),
        hookBudgetCost: 1,
        sourceShapeId: "paired_return",
        returnFamilyId: expect.any(String),
        rewardMetadata: expect.objectContaining({
          rewardKey: expect.any(String),
          expectedConvertedEssence: expect.any(Number),
        }),
      });
      expect(
        (
          precommit as {
            returnScene: {
              referencesCreatedId: string;
              referencesAnchor: string;
            };
            created: { referenceId: string };
            anchor: string;
          }
        ).returnScene.referencesCreatedId,
      ).toBe(
        (precommit as { created: { referenceId: string } }).created.referenceId,
      );
      expect(
        (
          precommit as {
            returnScene: { referencesAnchor: string };
            anchor: string;
          }
        ).returnScene.referencesAnchor,
      ).toBe((precommit as { anchor: string }).anchor);
      expect(optionHookIds.has((precommit as { hookId: string }).hookId)).toBe(
        true,
      );
    }

    expect(pairedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contract: expect.objectContaining({
            pairedReturnId: expect.any(String),
            created: expect.any(Object),
            returnScene: expect.any(Object),
            visibilityPolicy: expect.any(Object),
          }),
        }),
      ]),
    );
    expect(delayedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          triggerSelector: expect.objectContaining({
            triggerKind: expect.any(String),
          }),
          controlledScene: expect.objectContaining({
            sceneKind: "return",
          }),
          rewardOperations: expect.any(Array),
        }),
      ]),
    );
    expect(
      new Set(
        pairedPrecommits.map((precommit) =>
          String((precommit as { returnFamilyId: string }).returnFamilyId),
        ),
      ).size,
    ).toBeGreaterThan(1);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("reaches paired-return sealing, borrowing, and future trade families organically", async () => {
    const content = await loadContent(process.cwd());
    const manifests = Array.from({ length: 48 }, (_, index) => {
      const journeyContext = contextFromContent(
        content,
        `organic-paired-return-m16-${index}`,
        "late",
      );
      const manifest = fillForShapeAtStage("paired_return", journeyContext, "late");

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      return manifest;
    });
    const contracts = manifests.flatMap((manifest) =>
      manifest.precommitted.pairedReturn ?? []
    ) as Record<string, unknown>[];
    const familyIds = new Set(
      contracts
        .map((contract) => contract.returnFamilyId)
        .filter((familyId): familyId is string => typeof familyId === "string"),
    );
    const payloadKinds = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.flatMap(payloadKinds);
      }

      if (typeof value !== "object" || value === null) {
        return [];
      }

      const record = value as Record<string, unknown>;
      return [
        typeof record.kind === "string" ? record.kind : undefined,
        ...Object.values(record).flatMap(payloadKinds),
      ].filter((kind): kind is string => kind !== undefined);
    };
    const returnRewardKinds = new Set(
      contracts.flatMap((contract) => payloadKinds(contract.returnReward)),
    );
    const futureCostKinds = new Set(
      contracts.flatMap((contract) => payloadKinds(contract.futureCost)),
    );
    const sealedDreamsignRow = manifests.some((manifest) => {
      const row = (manifest.precommitted.pairedReturn ?? []) as Record<string, unknown>[];

      return row.length === 3 &&
        row.every((contract) => {
          const created = contract.created as Record<string, unknown>;
          const returnScene = contract.returnScene as Record<string, unknown>;

          return created.referenceKind === "sealed_object" &&
            created.objectKind === "dreamsign" &&
            returnScene.returnSceneKind === "sealed_object_return" &&
            returnScene.referencesCreatedId === created.referenceId &&
            returnScene.referencesAnchor === contract.anchor;
        }) &&
        row.some((contract) => payloadKinds(contract.returnReward).includes("gain_essence")) &&
        row.some((contract) =>
          payloadKinds(contract.returnReward).some((kind) =>
            kind === "card_purge" || kind === "card_duplicate"
          )
        );
    });
    const borrowedDreamsignContract = contracts.find((contract) => {
      const created = contract.created as Record<string, unknown>;

      return contract.returnFamilyId === "borrowed_dreamsign" &&
        created.referenceKind === "borrowed_object" &&
        created.objectKind === "dreamsign";
    });
    const borrowedDraftContract = contracts.find((contract) =>
      contract.returnFamilyId === "borrowed_card_draft" &&
      payloadKinds(contract.futureCost).includes("card_purge")
    );
    const futureTradeRewards = contracts.filter((contract) =>
      contract.returnFamilyId === "future_named_object_trade"
    );
    const futureTradeRewardKinds = new Set(
      futureTradeRewards.flatMap((contract) =>
        payloadKinds(contract.returnReward)
      ),
    );

    expect(Array.from(familyIds)).toEqual(
      expect.arrayContaining([
        "sealed_dreamsign",
        "sealed_card",
        "borrowed_dreamsign",
        "borrowed_card_draft",
        "future_named_object_trade",
        "return_for_resource",
        "return_for_card_operation",
        "return_for_route_edit",
      ]),
    );
    expect(Array.from(returnRewardKinds)).toEqual(
      expect.arrayContaining([
        "gain_essence",
        "card_purge",
        "card_duplicate",
        "dreamsign_gain",
        "route_add_site",
        "bane_chosen_purge",
        "generated_object_grant",
      ]),
    );
    expect(Array.from(futureCostKinds)).toEqual(
      expect.arrayContaining([
        "dreamsign_loss",
        "bane_gain",
        "card_purge",
        "dreamsign_trade_hook",
      ]),
    );
    expect(sealedDreamsignRow).toBe(true);
    expect(payloadKinds(borrowedDreamsignContract?.futureCost)).toEqual(
      expect.arrayContaining(["dreamsign_loss"]),
    );
    expect(payloadKinds(borrowedDraftContract?.futureCost)).toEqual(
      expect.arrayContaining(["card_purge"]),
    );
    expect(Array.from(futureTradeRewardKinds)).toEqual(
      expect.arrayContaining(["gain_essence", "card_duplicate", "route_add_site"]),
    );
  });

  it("values near-term triggered rewards through typed hook contracts", async () => {
    const journeyContext = await context(
      "random:3aa6092e-d433-4819-b86c-ccf61b9f51cd",
    );
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const delayedPrecommits = manifest.precommitted.delayed ?? [];

    expect(manifest.options).toHaveLength(2);
    expect(delayedPrecommits).toHaveLength(2);
    for (const option of manifest.options) {
      expect(option.triggers).toEqual([
        expect.objectContaining({
          kind: "delayed_hook_contract",
          triggerSelector: expect.objectContaining({
            triggerKind: expect.stringMatching(
              /^(battle|victory|each_battle|dreamscape|site_visit|named_card_play|dreamsign_trigger|card_added|essence_payment|future_shop|future_dream_journey)$/u,
            ),
          }),
          rewardMetadata: expect.objectContaining({
            expectedConvertedEssence: expect.any(Number),
          }),
        }),
      ]);
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
    }
    expect(delayedPrecommits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          duration: expect.objectContaining({ durationKind: expect.any(String) }),
          expiration: expect.objectContaining({ policyKind: expect.any(String) }),
          visibilityPolicy: expect.objectContaining({
            outcomeVisibility: "visible",
          }),
        }),
      ]),
    );
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("fills commit-now future payoffs as three comparable visible commitments", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("commit_now_future_payoff", journeyContext);

    expect(manifest.options.every((option) => option.triggers.length === 1)).toBe(
      true,
    );
    expect(
      manifest.precommitted.operations?.some((operation) =>
        operation.rewardOperations?.some((rewardOperation) =>
          rewardOperation.operationKind === "burden" ||
          rewardOperation.operationKind === "route_edit" ||
          rewardOperation.operationKind === "status" ||
          rewardOperation.operationKind === "reward"
        )
      ),
    ).toBe(true);
    expect(manifest.options.flatMap((option) => option.triggers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "delayed_hook_contract",
          triggerSelector: expect.objectContaining({
            triggerKind: expect.stringMatching(
              /^(battle|victory|each_battle|dreamscape|site_visit|named_card_play|dreamsign_trigger|card_added|essence_payment|future_shop|future_dream_journey)$/u,
            ),
          }),
          controlledScene: expect.objectContaining({
            sceneKind: expect.stringMatching(/^(reward|cost|transformation|trade|return)$/u),
          }),
        }),
      ]),
    );
    expect(
      manifest.precommitted.delayed?.map((entry) =>
        typeof entry === "object" && entry !== null && "optionNumber" in entry
          ? entry.optionNumber
          : null,
      ),
    ).toEqual([1, 2, 3]);

    const nets = manifest.options.map((option) => option.netConvertedEssence);

    expect(Math.max(...nets) - Math.min(...nets)).toBeLessThanOrEqual(75);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("keeps now-versus-later rewards comparable while making the delayed choice distinct", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("now_vs_later", journeyContext);

    expect(manifest.options[0]?.triggers).toEqual([]);
    expect(manifest.options[1]?.triggers).toHaveLength(1);
    expect(manifest.options[1]?.netConvertedEssence).toBeGreaterThan(
      manifest.options[0]?.netConvertedEssence ?? 0,
    );
    expect(manifest.precommitted.delayed).toHaveLength(1);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("reaches the expanded delayed hook trigger catalog through normal delayed shapes", async () => {
    const content = await loadContent(process.cwd());
    const seen = new Set<string>();
    const shapeIds: JourneyShapeId[] = [
      "now_vs_later",
      "reward_after_trigger",
      "commit_now_future_payoff",
    ];

    for (let index = 0; index < 60; index += 1) {
      const journeyContext = contextFromContent(content, `s${index}`);

      for (const shapeId of shapeIds) {
        const manifest = fillForShape(shapeId, journeyContext);

        for (const delayed of manifest.precommitted.delayed ?? []) {
          const triggerKind =
            typeof delayed === "object" &&
            delayed !== null &&
            "triggerSelector" in delayed &&
            typeof delayed.triggerSelector === "object" &&
            delayed.triggerSelector !== null &&
            "triggerKind" in delayed.triggerSelector
              ? delayed.triggerSelector.triggerKind
              : undefined;

          if (typeof triggerKind === "string") {
            seen.add(triggerKind);
          }
        }

        expect(validateJourneyManifest(manifest, journeyContext), shapeId).toEqual({
          ok: true,
        });
      }
    }

    expect(seen).toEqual(
      new Set([
        "battle",
        "victory",
        "each_battle",
        "dreamscape",
        "site_visit",
        "named_card_play",
        "dreamsign_trigger",
        "card_added",
        "essence_payment",
        "future_shop",
        "future_dream_journey",
      ]),
    );
  });

  it("validates now-versus-later as an immediate named reward plus after-two-victories named payoff", async () => {
    const journeyContext = await context("sleeping-contract");
    const manifest = fillForShape("now_vs_later", journeyContext);
    const delayedOperation = manifest.precommitted.operations?.find(
      (operation) => operation.operationKind === "delayed_hook",
    );

    expect(manifest.options[0]?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "dreamsign_gain",
          targetSelector: expect.objectContaining({
            names: [expect.any(String)],
          }),
        }),
      ]),
    );
    expect(delayedOperation).toMatchObject({
      triggerSelector: expect.objectContaining({
        triggerKind: "victory",
        count: 2,
      }),
      rewardOperations: expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reward",
          rewardKind: "dreamsign_gain",
          targetSelector: expect.objectContaining({
            names: [expect.any(String)],
          }),
        }),
      ]),
    });
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("validates site-visit delayed hooks with named Dreamsign rewards", async () => {
    const journeyContext = await context("s0");
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const delayedOperations = manifest.precommitted.operations?.filter(
      (operation) => operation.operationKind === "delayed_hook",
    ) ?? [];
    const siteVisitOperations = delayedOperations.filter((operation) =>
      operation.triggerSelector?.triggerKind === "site_visit"
    );

    expect(siteVisitOperations).toHaveLength(2);
    expect(
      new Set(
        siteVisitOperations.map((operation) =>
          operation.triggerSelector?.siteType
        ),
      ).size,
    ).toBe(2);
    expect(siteVisitOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          triggerSelector: expect.objectContaining({
            triggerKind: "site_visit",
            siteType: expect.any(String),
          }),
          rewardOperations: expect.arrayContaining([
            expect.objectContaining({
              rewardKind: "dreamsign_gain",
              targetSelector: expect.objectContaining({
                names: [expect.any(String)],
              }),
            }),
          ]),
        }),
        expect.objectContaining({
          triggerSelector: expect.objectContaining({
            triggerKind: "site_visit",
            siteType: expect.any(String),
          }),
          rewardOperations: expect.arrayContaining([
            expect.objectContaining({
              rewardKind: "dreamsign_gain",
              targetSelector: expect.objectContaining({
                names: [expect.any(String)],
              }),
            }),
          ]),
        }),
      ]),
    );
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("validates Promise Card as named card and Dreamsign counters with payoff operations", async () => {
    const found = {
      namedCardPlay: false,
      dreamsignTrigger: false,
    };

    for (let index = 0; index < 80; index += 1) {
      const journeyContext = await context(`counter-hook-${index}`);
      const manifest = fillForShape("reward_after_trigger", journeyContext);
      const delayedOperations = manifest.precommitted.operations?.filter(
        (operation) => operation.operationKind === "delayed_hook",
      ) ?? [];

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      found.namedCardPlay ||= delayedOperations.some((operation) =>
        operation.triggerSelector?.triggerKind === "named_card_play" &&
        operation.rewardOperations?.some((rewardOperation) =>
          rewardOperation.rewardKind === "resource" &&
          rewardOperation.resourceSemantics?.resource === "essence"
        )
      );
      found.dreamsignTrigger ||= delayedOperations.some((operation) =>
        operation.triggerSelector?.triggerKind === "dreamsign_trigger" &&
        operation.rewardOperations?.some((rewardOperation) =>
          rewardOperation.rewardKind === "resource" &&
          rewardOperation.resourceSemantics?.resource === "omens"
        )
      );

      if (found.namedCardPlay && found.dreamsignTrigger) {
        break;
      }
    }

    expect(found).toEqual({
      namedCardPlay: true,
      dreamsignTrigger: true,
    });
  });

  it("validates named card rewards with delayed Bane obligations", async () => {
    const journeyContext = await context("waking-cache");
    const manifest = fillForShape("commit_now_future_payoff", journeyContext);

    const cardGainTargets = manifest.options.flatMap((option) =>
      option.operations.flatMap((operation) =>
        operation.operationKind === "reward" &&
        operation.rewardKind === "card_gain" &&
        operation.targetSelector
          ? [operation.targetSelector]
          : []
      )
    );
    const delayedBaneOperations =
      manifest.precommitted.operations?.filter((operation) =>
        operation.rewardOperations?.some((rewardOperation) =>
          rewardOperation.operationKind === "burden" &&
          rewardOperation.burdenKind === "bane_delayed"
        )
      ) ?? [];
    const triggerKinds = new Set(
      delayedBaneOperations.map((operation) =>
        operation.triggerSelector?.triggerKind
      ),
    );
    const delayedBaneNames = delayedBaneOperations.flatMap((operation) =>
      operation.rewardOperations?.flatMap((rewardOperation) =>
        rewardOperation.operationKind === "burden" &&
        rewardOperation.burdenKind === "bane_delayed" &&
        rewardOperation.targetSelector?.names?.[0]
          ? [String(rewardOperation.targetSelector.names[0])]
          : []
      ) ?? []
    );

    expect(cardGainTargets).toHaveLength(3);
    expect(
      new Set(cardGainTargets.flatMap((selector) => selector.names ?? [])).size,
    ).toBe(3);
    expect(delayedBaneOperations).toHaveLength(3);
    expect(triggerKinds.size).toBe(1);
    expect([...triggerKinds][0]).toEqual(
      expect.stringMatching(/^(battle|victory|dreamscape)$/u),
    );
    expect(new Set(delayedBaneNames).size).toBe(3);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("rejects a non-tree delayed hook that collapses to one root option", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.slice(0, 1),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "root_option_count_within_bounds",
    });
  });

  it("never exposes tide terminology in generated ability text", async () => {
    const journeyContext = await context();

    for (const shape of JOURNEY_SHAPES) {
      const manifest = fillForShape(shape.id, journeyContext);

      expect(generatedOptionText(manifest), shape.id).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/(?:selected-tide|\btidal\b|\btides?\b)/iu),
        ]),
      );
    }
  });

  it("keeps internal draft and Dreamsign pool sources out of generated ability text", async () => {
    const journeyContext = await context();

    for (const shape of JOURNEY_SHAPES) {
      const manifest = fillForShape(shape.id, journeyContext);
      const targetDescriptions = manifest.options.flatMap((option) =>
        option.targets
          .filter(
            (target): target is { description: string } =>
              typeof target === "object" &&
              target !== null &&
              "description" in target &&
              typeof target.description === "string",
          )
          .map((target) => target.description),
      );

      expect(generatedOptionText(manifest), shape.id).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/from the (?:card|Dreamsign) pool/iu),
        ]),
      );
      expect(targetDescriptions, shape.id).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/from the (?:card|Dreamsign) pool/iu),
        ]),
      );
    }
  });

  it("balances the common positive reward menu while keeping card drafts in modest contract bands", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("curated_reward_trio", journeyContext);
    const draftEffects = manifest.options
      .flatMap((option) => option.effects)
      .filter(
        (
          effect,
        ): effect is {
          kind: "card_draft";
          takeCount: number;
          choiceCount: number;
          predicate?: Record<string, unknown>;
        } =>
          typeof effect === "object" &&
          effect !== null &&
          "kind" in effect &&
          effect.kind === "card_draft",
      );
    const dreamsignEffect = manifest.options
      .flatMap((option) => option.effects)
      .find(
        (
          effect,
        ): effect is {
          kind: "dreamsign_draft";
          choiceCount: number;
        } =>
          typeof effect === "object" &&
          effect !== null &&
          "kind" in effect &&
          effect.kind === "dreamsign_draft",
      );

    expect(manifest.options).toHaveLength(3);
    expect(draftEffects.length).toBeGreaterThan(0);
    for (const draftEffect of draftEffects) {
      expect(draftEffect.takeCount).toBeGreaterThanOrEqual(1);
      expect(draftEffect.choiceCount).toBeGreaterThanOrEqual(
        draftEffect.takeCount,
      );
      expect(draftEffect.choiceCount).toBeGreaterThanOrEqual(3);
      expect(draftEffect.choiceCount).toBeLessThanOrEqual(6);
      expect(draftEffect.takeCount).toBeLessThanOrEqual(2);
    }
    if (dreamsignEffect) {
      expect(dreamsignEffect.choiceCount).toBeGreaterThanOrEqual(2);
      expect(dreamsignEffect.choiceCount).toBeLessThanOrEqual(3);
    }
    expect(
      Math.min(
        ...manifest.options.map((option) => option.effectConvertedEssence),
      ),
    ).toBeGreaterThanOrEqual(295);
    expect(
      Math.max(
        ...manifest.options.map((option) => option.netConvertedEssence),
      ) -
        Math.min(
          ...manifest.options.map((option) => option.netConvertedEssence),
        ),
    ).toBeLessThanOrEqual(100);
  });

  it("varies positive menu filler slots across seeds while preserving deterministic replay", async () => {
    const positiveMenuShapeIds: JourneyShapeId[] = [
      "random_allocation",
      "curated_reward_trio",
      "heterogeneous_pair",
      "single_reward",
    ];

    for (const shapeId of positiveMenuShapeIds) {
      const stableContext = await context(`positive-stable:${shapeId}`);

      expect(stableStringify(fillForShape(shapeId, stableContext))).toBe(
        stableStringify(fillForShape(shapeId, stableContext)),
      );

      const outputs = new Set<string>();

      for (const seed of [
        "positive-a",
        "positive-b",
        "positive-c",
        "positive-d",
        "positive-e",
      ]) {
        const journeyContext = await context(`${shapeId}:${seed}`);
        const manifest = fillForShape(shapeId, journeyContext);

        expect(
          validateJourneyManifest(manifest, journeyContext),
          `${shapeId}:${seed}`,
        ).toEqual({ ok: true });
        outputs.add(generatedOptionText(manifest).join("\n"));
      }

      expect(outputs.size, shapeId).toBeGreaterThan(1);
    }
  }, 15000);

  it("keeps generated card drafts at four choices with visible card predicates", async () => {
    const journeyContext = await context();

    for (const shape of JOURNEY_SHAPES) {
      const manifest = fillForShape(shape.id, journeyContext);
      const allEffects = [
        ...manifest.options.flatMap((option) => option.effects),
        ...Object.values(manifest.precommitted.sequenceMenus ?? {}).flatMap(
          (options) => options.flatMap((option) => option.effects),
        ),
        ...(manifest.tree?.nodes.flatMap((node) =>
          node.branches.flatMap((branch) => [
            ...branch.effects,
            ...(branch.terminal?.effects ?? []),
          ]),
        ) ?? []),
        ...(manifest.precommitted.random ?? []),
        ...(manifest.rewardPool?.rewards ?? []),
      ];
      const cardDrafts = allEffects.filter(
        (
          effect,
        ): effect is {
          kind: "card_draft";
          takeCount: number;
          choiceCount: number;
          predicate?: Record<string, unknown>;
        } =>
          typeof effect === "object" &&
          effect !== null &&
          "kind" in effect &&
          effect.kind === "card_draft",
      );

      for (const draft of cardDrafts) {
        expect(draft.takeCount, shape.id).toBeGreaterThanOrEqual(1);
        expect(draft.takeCount, shape.id).toBeLessThanOrEqual(2);
        expect(draft.choiceCount, shape.id).toBe(4);
        expect(draft.choiceCount, shape.id).toBeGreaterThanOrEqual(draft.takeCount);
        expect(draft.predicate, shape.id).toEqual(
          expect.objectContaining({ source: "draftPool" }),
        );
        expect(
          Boolean(draft.predicate?.cardType) ||
            Boolean(draft.predicate?.subtype) ||
            Boolean(draft.predicate?.isFast) ||
            Boolean(draft.predicate?.renderedTextIncludes) ||
            Boolean(draft.predicate?.rarity) ||
            Boolean(draft.predicate?.energyCost) ||
            Boolean(draft.predicate?.maxEnergyCost) ||
            Boolean(draft.predicate?.minCopies) ||
            Boolean(draft.predicate?.hasMultipleAbilities) ||
            Object.keys(draft.predicate ?? {}).length === 1,
          shape.id,
        ).toBe(true);
      }
    }
  });

  it("rejects card predicate drafts when the source pool cannot fill the visible choices", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_reward", journeyContext);
    const impossibleDraft = draftCards(CARD_DRAFT_PROFILES.legendaryCards);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
          text: cardDraftText(CARD_DRAFT_PROFILES.legendaryCards),
          effects: [
            {
              ...impossibleDraft,
              choiceCount: 999,
              predicate: {
                source: "draftPool",
              },
            },
          ],
          targets: [],
        }),
        ...manifest.options.slice(1),
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "card_draft_predicate_pool_too_small",
    });
  });

  it("attaches structured card draft value metadata for breadth, take count, copies, and predicate specificity", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_reward", journeyContext);
    const copiedDraft = draftCards(CARD_DRAFT_PROFILES.discardTextCards, {
      copyCount: 2,
    });
    const optionWithDraft = refreshOptionOperations({
      ...manifest.options[0]!,
      text: cardDraftText(CARD_DRAFT_PROFILES.discardTextCards, 1, 2),
      effects: [copiedDraft],
      targets: [
        target(
          "card",
          CARD_DRAFT_PROFILES.discardTextCards.targetDescription,
          copiedDraft.predicate,
        ),
      ],
    });
    const draftOperation = optionWithDraft.operations.find(
      (operation) =>
        operation.operationKind === "reward" &&
        operation.rewardKind === "card_draft",
    );

    expect(draftOperation?.value?.bands?.map((band) => band.id)).toEqual(
      expect.arrayContaining([
        "choice_breadth",
        "take_count",
        "copy_count",
        "predicate_specificity",
      ]),
    );
  });

  it("attaches structured random card gain metadata for hidden target risk and count", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_reward", journeyContext);
    const randomGain = randomCardGain(CARD_DRAFT_PROFILES.events, 2);
    const optionWithGain = refreshOptionOperations({
      ...manifest.options[0]!,
      text: "Gain 2 random events.",
      effects: [randomGain],
      targets: [
        target("card", CARD_DRAFT_PROFILES.events.targetDescription, randomGain.predicate),
      ],
      uncertaintyConvertedEssence: -10,
    });
    const gainOperation = optionWithGain.operations.find(
      (operation) =>
        operation.operationKind === "reward" &&
        operation.rewardKind === "card_gain",
    );

    expect(gainOperation?.targetSelector).toMatchObject({
      selectorKind: "card",
      selection: "hidden_random",
      source: "catalog",
      predicate: expect.objectContaining({
        cardType: "Event",
        source: "catalog",
      }),
    });
    expect(gainOperation?.value?.bands?.map((band) => band.id)).toEqual(
      expect.arrayContaining([
        "random_hidden_target",
      ]),
    );
    expect(gainOperation?.value?.uncertaintyConvertedEssence).toBeLessThan(0);
  });

  it("can procedurally build Three Masks as a draft trio over character, event, and fast-card predicates", async () => {
    const content = await loadContent(process.cwd());
    const evidence = Array.from({ length: 160 }, (_, index) => {
      const journeyContext = contextFromContent(
        content,
        `three-masks-procedural-${index}`,
      );
      const manifest = fillForShape("same_reward_different_costs", journeyContext);
      const predicates = manifest.options
        .flatMap((journeyOption) => journeyOption.operations)
        .filter(
          (operation) =>
            operation.operationKind === "reward" &&
            operation.rewardKind === "card_draft",
        )
        .map((operation) => operation.payload.predicate as Record<string, unknown> | undefined)
        .filter((predicate): predicate is Record<string, unknown> => Boolean(predicate));
      const hasCharacter = predicates.some((predicate) => predicate.cardType === "Character");
      const hasEvent = predicates.some((predicate) => predicate.cardType === "Event");
      const hasFast = predicates.some((predicate) => predicate.isFast === true);

      return { manifest, journeyContext, hasCharacter, hasEvent, hasFast };
    }).find((entry) => entry.hasCharacter && entry.hasEvent && entry.hasFast);

    expect(evidence).toBeDefined();
    expect(evidence?.manifest.debug.debugPayload).toBeUndefined();
    expect(validateJourneyManifest(evidence!.manifest, evidence!.journeyContext)).toEqual({
      ok: true,
    });
  });

  it("can procedurally build Eight Windows as take-any-number predicate drafts plus random event card gain", async () => {
    const content = await loadContent(process.cwd());
    let evidence:
      | {
        manifest: JourneyManifest;
        journeyContext: ReturnType<typeof contextFromContent>;
        hasPredicateDraft: boolean;
        hasRandomEventGain: boolean;
      }
      | undefined;

    for (let index = 0; index < 200; index += 1) {
      const journeyContext = contextFromContent(
        content,
        `eight-windows-procedural-${index}`,
      );
      const manifest = fillForShape("take_any_number", journeyContext);
      const rewardOperations = manifest.options.flatMap((journeyOption) =>
        journeyOption.operations.filter(
          (operation) => operation.operationKind === "reward",
        ),
      );
      const hasPredicateDraft = rewardOperations.some(
        (operation) =>
          operation.rewardKind === "card_draft" &&
          typeof operation.payload.predicate === "object" &&
          operation.payload.predicate !== null &&
          "renderedTextIncludes" in operation.payload.predicate,
      );
      const hasRandomEventGain = rewardOperations.some(
        (operation) =>
          operation.rewardKind === "card_gain" &&
          operation.targetSelector?.selection === "hidden_random" &&
          typeof operation.payload.predicate === "object" &&
          operation.payload.predicate !== null &&
          (operation.payload.predicate as Record<string, unknown>).cardType === "Event" &&
          operation.payload.count === 2,
      );

      if (hasPredicateDraft && hasRandomEventGain) {
        evidence = {
          manifest,
          journeyContext,
          hasPredicateDraft,
          hasRandomEventGain,
        };
        break;
      }
    }

    expect(evidence).toBeDefined();
    expect(evidence?.manifest.shapeId).toBe("take_any_number");
    expect(evidence?.manifest.options.at(-1)?.pickBehavior).toBe("leave");
    expect(validateJourneyManifest(evidence!.manifest, evidence!.journeyContext)).toEqual({
      ok: true,
    });
  });

  it("fills timed window menus from a shared procedural temporary-window catalog", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("timed_window_menu", journeyContext);
    const records = manifest.options.flatMap((option) => [
      ...option.effects,
      ...option.routeEffects,
      ...option.operations.map((operation) => operation.payload),
    ]) as Record<string, unknown>[];
    const windows = records
      .filter(
        (record) =>
          typeof record.timedWindowScope === "string" &&
          typeof record.timedWindowDuration === "object" &&
          record.timedWindowDuration !== null,
      )
      .map((record) => {
        const duration = record.timedWindowDuration as Record<string, unknown>;

        return `${record.timedWindowScope}:${duration.durationKind}:${duration.count}`;
      });

    expect(manifest.options).toHaveLength(3);
    expect(new Set(windows)).toHaveLength(1);
    expect(
      records.some(
        (record) =>
          typeof record.affectedObjectClass === "string" &&
          typeof record.affectedPlayer === "string" &&
          typeof record.windowModifier === "string" &&
          typeof record.amount === "number" &&
          typeof record.windowValue === "number" &&
          record.polarity === "positive",
      ),
    ).toBe(true);
    expect(
      Math.min(...manifest.options.map((option) => option.netConvertedEssence)),
    ).toBeGreaterThanOrEqual(120);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("samples timed window menu scopes beyond the old fixed battle trio", async () => {
    const scopes = new Set<string>();
    const durations = new Set<string>();

    for (const seed of Array.from({ length: 24 }, (_, index) => `timed-${index}`)) {
      const journeyContext = await context(seed);
      const manifest = fillForShape("timed_window_menu", journeyContext);
      const records = manifest.options.flatMap((option) => [
        ...option.effects,
        ...option.routeEffects,
        ...option.operations.map((operation) => operation.payload),
      ]) as Record<string, unknown>[];

      for (const record of records) {
        if (
          typeof record.timedWindowScope === "string" &&
          typeof record.timedWindowDuration === "object" &&
          record.timedWindowDuration !== null
        ) {
          scopes.add(record.timedWindowScope);
          const duration = record.timedWindowDuration as Record<string, unknown>;
          durations.add(`${duration.durationKind}:${duration.count}`);
        }
      }

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });
    }

    expect([...scopes]).toEqual(
      expect.arrayContaining([
        "battle",
        "battle_object",
        "dreamwell",
        "shop",
        "route",
        "temporary_object",
      ]),
    );
    expect(durations.size).toBeGreaterThan(2);
  });

  it.each([
    [
      "timed_window_requires_temporary_window",
      {
        text: "For the next battle, add Fast to a chosen card.",
        effects: [
          { kind: "card_rewrite", keyword: "Fast", duration: "next battle" },
        ],
        effectConvertedEssence: 70,
        netConvertedEssence: 65,
      },
    ],
    [
      "timed_window_resource_only_reward",
      {
        text: "For the next 3 battles, gain 1 omen.",
        effects: [
          {
            kind: "battle_window_modifier",
            duration: "next 3 battles",
            modifier: "reward_timing",
            timedWindowScope: "battle",
            timedWindowDuration: {
              durationKind: "battle_count",
              count: 3,
            },
            affectedPlayer: "you",
            affectedObjectClass: "battle_rewards",
            windowModifier: "reward_timing",
            amount: 1,
            polarity: "positive",
            windowValue: 160,
          },
          { kind: "gain_omens", amount: 1 },
        ],
        effectConvertedEssence: 170,
        netConvertedEssence: 160,
      },
    ],
    [
      "timed_window_low_impact",
      {
        text: "For the next 3 battles, add Fast to a chosen card.",
        effects: [
          {
            kind: "card_rewrite",
            keyword: "Fast",
            duration: "next 3 battles",
            timedWindowScope: "battle",
            timedWindowDuration: {
              durationKind: "battle_count",
              count: 3,
            },
            affectedPlayer: "you",
            affectedObjectClass: "event_cards",
            windowModifier: "add_keyword_fast",
            amount: 1,
            polarity: "positive",
            windowValue: 80,
          },
        ],
        effectConvertedEssence: 80,
        netConvertedEssence: 80,
      },
    ],
  ])("rejects explicitly constructed weak timed window fixtures for %s", async (rule, patch) => {
    const journeyContext = await context();
    const manifest = fillForShape("timed_window_menu", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
          routeEffects: [],
          ...patch,
        }),
        ...manifest.options.slice(1),
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule,
    });
  });

  it("reaches Milestone 12 battle-window payload families through normal timed-window fills", async () => {
    const content = await loadContent(process.cwd());
    const evidence = {
      firstBreath: undefined as JourneyManifest | undefined,
      brokenVictory: undefined as JourneyManifest | undefined,
      trialOfWindows: undefined as JourneyManifest | undefined,
    };
    const seen = {
      positive: false,
      negative: false,
      mixed: false,
      bothPlayers: false,
      opponent: false,
      openingPlus: false,
      openingMinus: false,
      nextBattleDraw: false,
      eachTurnDraw: false,
      startingEnergy: false,
      bothPlayerStartingEnergy: false,
      bothPlayerStartingCards: false,
      opponentPointThreshold: false,
      battlePointCap: false,
      characterSpark: false,
      opponentTemporaryDreamsign: false,
      temporaryNamedDreamsign: false,
      energyCarryover: false,
    };

    for (let index = 0; index < 180; index += 1) {
      const journeyContext = contextFromContent(content, `m12-timed-window-${index}`, "mid");
      const manifest = fillForShapeAtStage("timed_window_menu", journeyContext, "mid");
      const validation = validateJourneyManifest(manifest, journeyContext);

      expect(manifest.debug.debugPayload, `m12-timed-window-${index}`).toBeUndefined();

      if (!validation.ok) {
        continue;
      }

      const payloads = manifest.options.flatMap((option) =>
        option.operations.map((operation) => operation.payload)
      ) as Record<string, unknown>[];

      for (const payload of payloads) {
        seen.positive ||= payload.polarity === "positive";
        seen.negative ||= payload.polarity === "negative";
        seen.mixed ||= payload.polarity === "mixed";
        seen.bothPlayers ||= payload.affectedPlayer === "both_players";
        seen.opponent ||= payload.affectedPlayer === "opponent";
        seen.openingPlus ||= payload.battleWindowOperationKind === "opening_hand_cards" &&
          payload.windowModifier === "extra_cards" &&
          payload.affectedPlayer === "you";
        seen.openingMinus ||= payload.battleWindowOperationKind === "opening_hand_cards" &&
          payload.windowModifier === "fewer_cards";
        seen.nextBattleDraw ||= payload.battleWindowOperationKind === "next_battle_draw";
        seen.eachTurnDraw ||= payload.battleWindowOperationKind === "each_turn_draw";
        seen.startingEnergy ||= payload.battleWindowOperationKind === "starting_energy" &&
          payload.windowModifier === "extra_energy" &&
          payload.affectedPlayer === "you";
        seen.bothPlayerStartingEnergy ||= payload.battleWindowOperationKind === "starting_energy" &&
          payload.windowModifier === "set_starting_energy" &&
          payload.affectedPlayer === "both_players";
        seen.bothPlayerStartingCards ||= payload.battleWindowOperationKind === "starting_cards" &&
          payload.affectedPlayer === "both_players";
        seen.opponentPointThreshold ||= payload.battleWindowOperationKind === "opponent_point_threshold";
        seen.battlePointCap ||= payload.battleWindowOperationKind === "battle_point_cap";
        seen.characterSpark ||= payload.battleWindowOperationKind === "character_spark";
        seen.opponentTemporaryDreamsign ||= payload.battleWindowOperationKind === "temporary_dreamsign" &&
          payload.affectedPlayer === "opponent";
        seen.temporaryNamedDreamsign ||= payload.battleWindowOperationKind === "temporary_dreamsign" &&
          payload.affectedPlayer === "you" &&
          typeof payload.dreamsignName === "string";
        seen.energyCarryover ||= payload.battleWindowOperationKind === "energy_carryover";
      }

      const hasFirstBreath = payloads.some((payload) =>
        payload.battleWindowOperationKind === "opening_hand_cards" &&
        payload.windowModifier === "extra_cards"
      ) && payloads.some((payload) =>
        payload.battleWindowOperationKind === "next_battle_draw"
      ) && payloads.some((payload) =>
        payload.battleWindowOperationKind === "temporary_dreamsign" &&
        payload.affectedPlayer === "you" &&
        typeof payload.dreamsignName === "string"
      );
      const hasBrokenVictory = payloads.some((payload) =>
        payload.battleWindowOperationKind === "battle_point_cap"
      ) && payloads.some((payload) =>
        payload.battleWindowOperationKind === "starting_energy" &&
        payload.affectedPlayer === "both_players"
      ) && payloads.some((payload) =>
        payload.battleWindowOperationKind === "starting_cards" &&
        payload.affectedPlayer === "both_players"
      );
      const hasTrialOfWindows = payloads.some((payload) =>
        payload.battleWindowOperationKind === "character_spark" &&
        payload.affectedPlayer === "both_players"
      ) && payloads.some((payload) =>
        payload.battleWindowOperationKind === "each_turn_draw" &&
        payload.affectedPlayer === "both_players"
      );

      evidence.firstBreath = evidence.firstBreath ?? (hasFirstBreath ? manifest : undefined);
      evidence.brokenVictory = evidence.brokenVictory ?? (hasBrokenVictory ? manifest : undefined);
      evidence.trialOfWindows = evidence.trialOfWindows ?? (hasTrialOfWindows ? manifest : undefined);
    }

    expect(seen).toEqual({
      positive: true,
      negative: true,
      mixed: true,
      bothPlayers: true,
      opponent: true,
      openingPlus: true,
      openingMinus: true,
      nextBattleDraw: true,
      eachTurnDraw: true,
      startingEnergy: true,
      bothPlayerStartingEnergy: true,
      bothPlayerStartingCards: true,
      opponentPointThreshold: true,
      battlePointCap: true,
      characterSpark: true,
      opponentTemporaryDreamsign: true,
      temporaryNamedDreamsign: true,
      energyCarryover: true,
    });
    expect(evidence.firstBreath).toBeDefined();
    expect(evidence.brokenVictory).toBeDefined();
    expect(evidence.trialOfWindows).toBeDefined();
  });

  it("reaches Milestone 13 Dreamwell window payload families through normal timed-window fills", async () => {
    const content = await loadContent(process.cwd());
    const normalDreamwellManifest = (seed: string) => {
      const journeyContext = contextFromContent(content, seed, "mid");
      const manifest = fillForShapeAtStage("timed_window_menu", journeyContext, "mid");

      expect(manifest.debug.debugPayload, seed).toBeUndefined();
      expect(validateJourneyManifest(manifest, journeyContext), seed).toEqual({
        ok: true,
      });

      return manifest;
    };
    const switchManifest = normalDreamwellManifest("m13-167");
    const bitterManifest = normalDreamwellManifest("m13-768");
    const replacementManifest = normalDreamwellManifest("m13-757");
    const ignorePenaltyManifest = normalDreamwellManifest("m13-760");
    const payloads = [
      ...switchManifest.options,
      ...bitterManifest.options,
      ...replacementManifest.options,
      ...ignorePenaltyManifest.options,
    ].flatMap((option) => option.operations.map((operation) => operation.payload));
    const operations = [
      ...switchManifest.options,
      ...bitterManifest.options,
      ...replacementManifest.options,
      ...ignorePenaltyManifest.options,
    ].flatMap((option) => option.operations);
    const hasDreamwellPayload = (
      operationKind: string,
      predicate: (payload: Record<string, unknown>) => boolean = () => true,
    ) =>
      payloads.some(
        (payload) =>
          payload.kind === "dreamwell_modifier" &&
          payload.dreamwellOperationKind === operationKind &&
          predicate(payload),
      );

    expect(hasDreamwellPayload("first_draw_energy", (payload) =>
      payload.amount === 1 &&
      payload.count === 1 &&
      payload.phaseSelector === "first_draw" &&
      payload.polarity === "positive"
    )).toBe(true);
    expect(hasDreamwellPayload("bonus_cards", (payload) =>
      payload.count === 2 &&
      payload.cardRole === "bonus" &&
      payload.phaseSelector === "any_phase"
    )).toBe(true);
    expect(hasDreamwellPayload("upgrade_lowest_phase_card", (payload) =>
      payload.cardRole === "upgrade" &&
      payload.phaseSelector === "lowest_phase"
    )).toBe(true);
    expect(hasDreamwellPayload("ignore_first_penalty", (payload) =>
      payload.cardRole === "penalty" &&
      payload.phaseSelector === "penalty_card"
    )).toBe(true);
    expect(hasDreamwellPayload("future_card_replacement", (payload) =>
      payload.cardRole === "replacement" &&
      payload.replacement === "penalty_to_bonus" &&
      payload.dreamwellScope === "future_dreamwell"
    )).toBe(true);
    expect(hasDreamwellPayload("first_draw_less_energy", (payload) =>
      payload.amount === -1 &&
      payload.polarity === "negative" &&
      payload.playerVisibility === "visible_to_both_players"
    )).toBe(true);
    expect(hasDreamwellPayload("penalty_cards", (payload) =>
      payload.count === 3 &&
      payload.cardRole === "penalty" &&
      payload.polarity === "negative"
    )).toBe(true);
    expect(hasDreamwellPayload("delayed_penalty_cards", (payload) =>
      payload.cardRole === "delayed" &&
      payload.dreamwellScope === "future_dreamwell" &&
      payload.polarity === "negative"
    )).toBe(true);

    expect(
      operations.filter(
        (operation) =>
          operation.operationKind === "burden" &&
          operation.burdenKind === "dreamwell_modifier",
      ).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      operations.some(
        (operation) =>
          operation.operationKind === "reward" &&
          (operation.rewardKind === "dreamsign_gain" ||
            operation.rewardKind === "card_gain"),
      ),
    ).toBe(true);
    expect(
      operations.some((operation) =>
        operation.payload.kind === "dreamwell_modifier" &&
        Array.isArray(operation.value?.bands) &&
        operation.value.bands.some((band) => band.id === "dreamwell_count") &&
        operation.value.bands.some((band) => band.id === "dreamwell_card_role")
      ),
    ).toBe(true);
    expect(
      bitterManifest.options.every((option) =>
        option.burdenConvertedEssence < 0 &&
        option.operations.some(
          (operation) =>
            operation.operationKind === "burden" &&
            operation.burdenKind === "dreamwell_modifier",
        )
      ),
    ).toBe(true);
  });

  it("does not emit a higher-cost duplicate card draft reward when typed draft predicates fall back", async () => {
    const journeyContext = await context(
      "random:f3c7440a-d810-4c24-a0da-3fa0a45a0882",
    );
    const manifest = fillForShape(
      "same_reward_different_costs",
      journeyContext,
    );

    expect(manifest.options.map((option) => option.text)).toHaveLength(3);
    expect(new Set(manifest.options.map((option) => option.text)).size).toBe(3);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("keeps transfiguration same-reward menus to one shared reward payload", async () => {
    const journeyContext = await context("transfig-unit-5");
    const manifest = fillForShape(
      "same_reward_different_costs",
      journeyContext,
    );

    expect(manifest.options.map((option) => option.text).join("\n")).toContain(
      "Transfiguration",
    );
    expect(
      new Set(manifest.options.map((option) => stableStringify(option.effects)))
        .size,
    ).toBe(1);
    expect(
      new Set(
        manifest.options.map((option) =>
          stableStringify({
            burdens: option.burdens,
            costs: option.costs,
          }),
        ),
      ).size,
    ).toBe(3);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("keeps choose-your-loss essence payments comparable to non-essence losses", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("choose_your_loss", journeyContext);

    expect(
      manifest.options.every((option) => option.netConvertedEssence < 0),
    ).toBe(true);
    expect(
      Math.max(
        ...manifest.options.map((option) =>
          Math.abs(option.netConvertedEssence),
        ),
      ) /
        Math.min(
          ...manifest.options.map((option) =>
            Math.abs(option.netConvertedEssence),
          ),
        ),
    ).toBeLessThanOrEqual(2);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("does not throw with an empty Dreamsign pool", async () => {
    const journeyContext = await contextWithEmptyDreamsignPool();
    const manifest = generateNextJourney({ context: journeyContext });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });

    const heterogeneous = fillForShape("heterogeneous_pair", journeyContext);

    expect(validateJourneyManifest(heterogeneous, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("renders take-any-number as a repeatable flat menu", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("take_any_number", journeyContext);

    expect(manifest.tree).toBeUndefined();
    expect(manifest.sequence).toBeUndefined();
    expect(manifest.options.map((option) => option.number)).toEqual([1, 2, 3]);
    expect(manifest.options.at(-1)?.pickBehavior).toBe("leave");
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("requires take-any-number rewards to carry a real limiting structure", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("take_any_number", journeyContext);
    const unlimitedOptions = manifest.options.map((journeyOption) =>
      journeyOption.number === 1
        ? refreshOptionOperations({
            ...journeyOption,
            text: "Claim cache reward 1: gain 1 omen, then choose whether to claim the final reward.",
            costs: [],
            costConvertedEssence: 0,
            netConvertedEssence:
              journeyOption.effectConvertedEssence +
              journeyOption.burdenConvertedEssence +
              journeyOption.uncertaintyConvertedEssence,
          })
        : journeyOption,
    );
    const invalid: JourneyManifest = {
      ...manifest,
      options: unlimitedOptions,
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "open_pick_without_limiting_structure",
    });
  });

  it("validates sequential tree semantics without depending on branch display labels", async () => {
    const journeyContext = await context();
    const probability = fillForShape("probability_ladder", journeyContext);
    const relabeledProbability: JourneyManifest = {
      ...probability,
      tree: {
        ...probability.tree!,
        nodes: probability.tree!.nodes.map((node) => ({
          ...node,
          branches: node.branches.map((branch) => ({
            ...branch,
            label: branch.terminal?.outcome === "claim" ? "Win" : branch.label,
          })),
        })),
      },
    };

    expect(validateJourneyManifest(relabeledProbability, journeyContext)).toEqual({
      ok: true,
    });

    const push = fillForShape("push_your_luck", journeyContext);
    const relabeledPush: JourneyManifest = {
      ...push,
      tree: {
        ...push.tree!,
        nodes: push.tree!.nodes.map((node) => ({
          ...node,
          branches: node.branches.map((branch) => ({
            ...branch,
            label: branch.terminal?.outcome === "failure" ? "Bust" : branch.label,
          })),
        })),
      },
    };

    expect(validateJourneyManifest(relabeledPush, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("fills complete tree data for every true sequential shape", async () => {
    const journeyContext = await context();
    const treeShapeIds: JourneyShapeId[] = [
      "prize_ladder",
      "probability_ladder",
      "random_pool_draws",
      "push_your_luck",
      "escalating_reward_chain",
    ];

    for (const shapeId of treeShapeIds) {
      const manifest = fillForShape(shapeId, journeyContext);

      expect(manifest.options, shapeId).toEqual([]);
      expect(manifest.tree?.nodes.length, shapeId).toBeGreaterThanOrEqual(3);
      expect(
        manifest.tree?.nodes[0]?.branches.some((branch) => branch.terminal),
        shapeId,
      ).toBe(true);
      expect(
        validateJourneyManifest(manifest, journeyContext),
        shapeId,
      ).toEqual({ ok: true });
    }
  });

  it("precommits push-your-luck failures as a typed random envelope", async () => {
    const journeyContext = await context("push-choice-envelope");
    const manifest = fillForShape("push_your_luck", journeyContext);
    const random = manifest.precommitted.random ?? [];

    expect(random.some((entry) => entry.kind === "push_failure")).toBe(false);
    expect(random).toEqual([
      expect.objectContaining({
        kind: "push_choice",
        bounded: true,
        odds: expect.objectContaining({
          numerator: expect.any(Number),
          denominator: 100,
          percent: expect.any(Number),
        }),
        hazard: expect.objectContaining({
          branches: expect.any(Array),
        }),
        visibilityPolicy: expect.objectContaining({
          outcomeVisibility: "visible",
          playerVisible: true,
          disclosure: expect.any(String),
        }),
      }),
    ]);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("varies true sequential shape content by seed", async () => {
    const treeShapeIds: JourneyShapeId[] = [
      "prize_ladder",
      "probability_ladder",
      "random_pool_draws",
      "push_your_luck",
      "escalating_reward_chain",
    ];

    for (const shapeId of treeShapeIds) {
      const outputs = new Set<string>();

      for (const seed of [
        "sequential-a",
        "sequential-b",
        "sequential-c",
        "sequential-d",
      ]) {
        const journeyContext = await context(seed);
        const manifest = fillForShape(shapeId, journeyContext);

        expect(
          validateJourneyManifest(manifest, journeyContext),
          `${shapeId}:${seed}`,
        ).toEqual({ ok: true });
        outputs.add(generatedOptionText(manifest).join("\n"));
      }

      expect(outputs.size, shapeId).toBeGreaterThan(1);
    }
  }, 15000);

  it("keeps tree topology authored while filling rewards, costs, and odds from progressive families", async () => {
    const journeyContext = await context("tree-family-progressions");

    const prize = fillForShape("prize_ladder", journeyContext);
    const prizeCosts = prize.tree!.nodes.map((node) =>
      node.branches.find((branch) => branch.costs.length > 0)!
        .costConvertedEssence,
    );
    const prizeStopValues = prize.tree!.nodes.map((node) =>
      node.branches.find((branch) => branch.terminal?.outcome === "end")!
        .effectConvertedEssence,
    );

    expect(prizeCosts[1]).toBeGreaterThanOrEqual(prizeCosts[0]!);
    expect(prizeCosts[2]).toBeGreaterThanOrEqual(prizeCosts[1]!);
    expect(prizeStopValues[1]).toBeGreaterThanOrEqual(prizeStopValues[0]!);
    expect(prizeStopValues[2]).toBeGreaterThanOrEqual(prizeStopValues[1]!);

    const probability = fillForShape("probability_ladder", journeyContext);
    const probabilityAttempts = probability.tree!.nodes.map((node) =>
      node.branches.find(
        (branch) => branch.costs.length > 0 && branch.odds !== undefined,
      )!,
    );

    expect(
      probabilityAttempts.map((branch) => branch.costConvertedEssence),
    ).toEqual([...probabilityAttempts.map((branch) => branch.costConvertedEssence)].sort((a, b) => a - b));
    expect(probabilityAttempts.map((branch) => branch.odds!.percent)).toEqual(
      [...probabilityAttempts.map((branch) => branch.odds!.percent)].sort((a, b) => a - b),
    );

    const chain = fillForShape("escalating_reward_chain", journeyContext);
    const takeValues = chain.tree!.nodes.map((node) =>
      node.branches.find((branch) => branch.costs.length > 0)!
        .effectConvertedEssence,
    );

    expect(takeValues[1]).toBeGreaterThanOrEqual(takeValues[0]!);
    expect(takeValues[2]).toBeGreaterThanOrEqual(takeValues[1]!);

    const push = fillForShape("push_your_luck", journeyContext);
    const pushBranches = push.tree!.nodes.map((node) =>
      node.branches.find(
        (branch) => branch.odds !== undefined && branch.effects.length > 0,
      )!,
    );

    expect(pushBranches.map((branch) => branch.odds!.percent)).toEqual(
      [...pushBranches.map((branch) => branch.odds!.percent)].sort((a, b) => b - a),
    );
    expect(pushBranches[1]!.effectConvertedEssence).toBeGreaterThanOrEqual(
      pushBranches[0]!.effectConvertedEssence,
    );
    expect(pushBranches[2]!.effectConvertedEssence).toBeGreaterThanOrEqual(
      pushBranches[1]!.effectConvertedEssence,
    );
  });

  it("builds random-pool tree rewards from reusable payload families instead of fixed menus", async () => {
    const summaries = new Set<string>();
    const payloadSignatures = new Set<string>();

    for (const seed of [
      "tree-pool-a",
      "tree-pool-b",
      "tree-pool-c",
      "tree-pool-d",
      "tree-pool-e",
    ]) {
      const journeyContext = await context(seed);
      const manifest = fillForShape("random_pool_draws", journeyContext);

      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });
      expect(manifest.rewardPool?.replacement).toBe("with_replacement");
      expect(manifest.rewardPool?.rewards.length).toBeGreaterThanOrEqual(5);

      summaries.add(manifest.rewardPool!.summary);
      payloadSignatures.add(
        manifest.rewardPool!.rewards
          .map((reward) =>
            typeof reward === "object" && reward !== null && "kind" in reward
              ? String(reward.kind)
              : "unknown",
          )
          .join("|"),
      );
    }

    expect(summaries.size).toBeGreaterThan(2);
    expect(payloadSignatures.size).toBeGreaterThan(2);
    expect([...summaries]).not.toContain(
      "Randomly gain one: 40 essence, 90 essence, 1 omen, 2 omens, or draft 1 of 4 events. Outcomes draw with replacement.",
    );
  });

  it("validates random-pool replacement from typed pool metadata instead of summary text", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("random_pool_draws", journeyContext);
    const hiddenSummary: JourneyManifest = {
      ...manifest,
      rewardPool: {
        ...manifest.rewardPool!,
        summary: "Randomly gain one reward from the visible pool.",
      },
    };

    expect(hiddenSummary.rewardPool?.summary).not.toContain("replacement");
    expect(validateJourneyManifest(hiddenSummary, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("does not emit the reference examples as production sequential trees", async () => {
    const probabilityContext = await context("reference-probability");
    const probabilityText = generatedOptionText(
      fillForShape("probability_ladder", probabilityContext),
    );

    expect(probabilityText).not.toContain(
      "Pay 25 essence for a 25% chance to gain a Dreamsign.",
    );
    expect(probabilityText).not.toContain(
      "Pay 45 essence for a 45% chance to gain a Dreamsign.",
    );
    expect(probabilityText).not.toContain(
      "Pay 70 essence for a 70% chance to gain a Dreamsign.",
    );

    const chainContext = await context("reference-chain");
    const chainText = generatedOptionText(
      fillForShape("escalating_reward_chain", chainContext),
    );

    expect(chainText).not.toContain(
      "Pay 10 essence and transfigure a random card. Go to Level 2.",
    );
    expect(chainText).not.toContain(
      "Pay 20 essence and transfigure a random card. Go to Level 3.",
    );
    expect(chainText).not.toContain(
      "Pay 40 essence and transfigure a random card. Go to Level 4.",
    );
    expect(chainText).not.toContain(
      "Pay all essence and transfigure all cards in your deck. End the Journey.",
    );
  });

  it("rejects probability ladders whose success branch can award the fixed reward more than once", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("probability_ladder", journeyContext);
    const invalid = structuredClone(manifest);
    const successBranch = invalid.tree?.nodes[0]?.branches.find(
      (branch) =>
        branch.kind === "random_chance" &&
        branch.terminal?.outcome === "claim",
    );

    expect(successBranch).toBeDefined();
    delete successBranch!.terminal;
    successBranch!.nextNodeId = "level-2";
    successBranch!.text = "Gain the Dreamsign. Go to Level 2.";

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "fixed_reward_can_be_won_once",
    });
  });
});

describe("validateJourneyManifest", () => {
  it("derives structured failures from the same ordered validator pipeline", async () => {
    const journeyContext = await context();
    const takeAnyNumber = fillForShape("take_any_number", journeyContext);
    const singleWager = fillForShape("single_wager", journeyContext);
    const delayedContext = await context();
    delayedContext.state.quest.route.unresolvedHooks = ["a", "b", "c", "d"];
    const delayed = fillForShape("reward_after_trigger", delayedContext);
    const randomPool = fillForShape("random_pool_draws", journeyContext);
    const deckCardIds = new Set(
      journeyContext.state.quest.deck.entries.map((entry) => entry.cardId),
    );
    const nonDeckCard = journeyContext.content.cards.find(
      (card) => !deckCardIds.has(card.id),
    )!;
    const structuredValue = fillForShape("single_reward", journeyContext);
    const cases = [
      {
        ...takeAnyNumber,
        options: takeAnyNumber.options.map((journeyOption) =>
          journeyOption.number === 1
            ? refreshOptionOperations({
                ...journeyOption,
                text: "Take cache reward 1: gain 1 omen, then choose whether to take the final reward.",
                costs: [],
                burdens: [],
                uncertaintyConvertedEssence: 0,
                costConvertedEssence: 0,
                burdenConvertedEssence: 0,
                netConvertedEssence: journeyOption.effectConvertedEssence,
              })
            : journeyOption,
        ),
      },
      {
        ...singleWager,
        precommitted: refreshPrecommittedOperations({
          random: [{ kind: "gain_essence", amount: 110 }],
        }),
      },
      delayed,
      {
        ...randomPool,
        rewardPool: randomPool.rewardPool
          ? {
              ...randomPool.rewardPool,
              operations: randomPool.rewardPool.operations.map(
                (operation, index) =>
                  index === 0
                    ? {
                        ...operation,
                        targetSelector: {
                          selectorKind: "card",
                          selection: "predicate",
                          referenceKind: "content",
                          source: "deck",
                          predicate: {
                            source: "deck",
                            names: [nonDeckCard.name],
                          },
                          required: true,
                        },
                      }
                    : operation,
              ),
            }
          : randomPool.rewardPool,
      },
      {
        ...structuredValue,
        precommitted: refreshPrecommittedOperations({
          delayed: [{ kind: "status", statusName: "Illegal Status" }],
        }),
      },
    ] satisfies JourneyManifest[];

    for (const invalid of cases) {
      expectValidationReportMatchesValidator(
        invalid,
        invalid === delayed ? delayedContext : journeyContext,
      );
    }
  });

  it("rejects stale manifest version metadata", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });
    const invalid: JourneyManifest = {
      ...manifest,
      versions: {
        ...manifest.versions,
        contentVersion: "stale-content-version",
      },
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "manifest_version_metadata",
    });
  });

  it("rejects invalid typed operation contracts with stable rule IDs", async () => {
    const journeyContext = await context("typed-operation-contracts");
    const base = fillForShape("single_reward", journeyContext);
    const dreamsign = journeyContext.content.dreamsigns[0]!;
    const otherDreamsign = journeyContext.content.dreamsigns[1]!;
    const generatedObject = generatedObjectDefinition();
    const operationManifest = (operation: JourneyOperation): JourneyManifest => ({
      ...base,
      options: base.options.map((option, index) =>
        index === 0
          ? {
              ...option,
              operations: [operation],
            }
          : option,
      ),
    });
    const cases: [JourneyOperation, string][] = [
      [
        {
          operationId: "test:resource:bad-percentage",
          operationKind: "reward",
          role: "reward",
          rewardKind: "resource",
          visibility: "visible",
          resourceSemantics: {
            resource: "essence",
            amountKind: "percentage_of_current",
            percentage: 125,
          },
          payload: { kind: "resource_percentage" },
        },
        "invalid_resource_percentage",
      ],
      [
        {
          operationId: "test:resource:bad-kind",
          operationKind: "reward",
          role: "reward",
          rewardKind: "resource",
          visibility: "visible",
          resourceSemantics: {
            resource: "spark" as "essence",
            amountKind: "fixed",
            amount: 1,
          },
          payload: { kind: "gain_spark" },
        },
        "invalid_resource_semantics",
      ],
      [
        {
          operationId: "test:resource:bad-fixed",
          operationKind: "reward",
          role: "reward",
          rewardKind: "resource",
          visibility: "visible",
          resourceSemantics: {
            resource: "essence",
            amountKind: "fixed",
            amount: -1,
          },
          payload: { kind: "gain_essence" },
        },
        "invalid_resource_amount",
      ],
      [
        {
          operationId: "test:resource:bad-cap",
          operationKind: "reward",
          role: "reward",
          rewardKind: "resource_cap_change",
          visibility: "visible",
          resourceSemantics: {
            resource: "maxEssence",
            amountKind: "cap_change",
            capDelta: 0,
          },
          payload: { kind: "resource_cap_change", capDelta: 0 },
        },
        "invalid_resource_cap_change",
      ],
      [
        {
          operationId: "test:resource:cost-mismatch",
          operationKind: "cost",
          role: "cost",
          visibility: "visible",
          resource: "essence",
          amount: 10,
          resourceSemantics: {
            resource: "essence",
            amountKind: "fixed",
            amount: 20,
          },
          payload: { kind: "essence", amount: 10 },
        },
        "incoherent_resource_cost_semantics",
      ],
      [
        {
          operationId: "test:card:bad-duplicate",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_duplicate",
          visibility: "visible",
          payload: { kind: "card_duplicate", copyCount: 0 },
        },
        "card_duplicate_count_invalid",
      ],
      [
        {
          operationId: "test:card:missing-result",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_transform",
          visibility: "visible",
          payload: { kind: "card_transform", resultSelection: "exact" },
        },
        "card_operation_result_missing",
      ],
      [
        {
          operationId: "test:card:bad-keyword",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_keyword_add",
          visibility: "visible",
          payload: { kind: "card_keyword_add" },
        },
        "card_keyword_operation_invalid",
      ],
      [
        {
          operationId: "test:card:bad-type-change",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_type_change",
          visibility: "visible",
          payload: { kind: "card_type_change" },
        },
        "card_type_change_invalid",
      ],
      [
        {
          operationId: "test:card:bad-text-change",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_text_modification",
          visibility: "visible",
          payload: { kind: "card_text_modification" },
        },
        "card_text_operation_invalid",
      ],
      [
        {
          operationId: "test:card:bad-temporary",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_temporary_copy",
          visibility: "visible",
          payload: { kind: "card_temporary_copy" },
        },
        "card_temporary_window_missing",
      ],
      [
        {
          operationId: "test:card:bad-merge",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_merge",
          visibility: "visible",
          payload: { kind: "card_merge" },
        },
        "card_merge_mode_missing",
      ],
      [
        {
          operationId: "test:card:bad-split",
          operationKind: "reward",
          role: "reward",
          rewardKind: "card_split",
          visibility: "visible",
          payload: { kind: "card_split" },
        },
        "card_split_mode_missing",
      ],
      [
        {
          operationId: "test:dreamsign:bad-copy",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_duplicate",
          visibility: "visible",
          payload: {
            kind: "dreamsign_duplicate",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
            copyCount: 0,
          },
        },
        "dreamsign_copy_count_invalid",
      ],
      [
        {
          operationId: "test:dreamsign:missing-target",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_gain",
          visibility: "visible",
          payload: { kind: "dreamsign_gain" },
        },
        "dreamsign_target_unavailable",
      ],
      [
        {
          operationId: "test:dreamsign:missing-transform-result",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_transform",
          visibility: "visible",
          payload: {
            kind: "dreamsign_transform",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
            newDreamsignId: "not-a-real-dreamsign",
            newDreamsignName: "Not A Real Dreamsign",
          },
        },
        "dreamsign_transform_destination_unavailable",
      ],
      [
        {
          operationId: "test:dreamsign:same-transform-result",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_transform",
          visibility: "visible",
          payload: {
            kind: "dreamsign_transform",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
            newDreamsignId: dreamsign.id,
            newDreamsignName: dreamsign.name,
          },
        },
        "dreamsign_transform_same_target",
      ],
      [
        {
          operationId: "test:dreamsign:temporary-missing-duration",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_temporary_grant",
          visibility: "visible",
          payload: {
            kind: "dreamsign_temporary_grant",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
          },
        },
        "dreamsign_temporary_duration_missing",
      ],
      [
        {
          operationId: "test:dreamsign:bad-pool-operation",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_pool_edit",
          visibility: "visible",
          payload: {
            kind: "dreamsign_pool_edit",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
            resultDreamsignId: otherDreamsign.id,
            resultDreamsignName: otherDreamsign.name,
            poolOperation: "shuffle",
          },
        },
        "dreamsign_pool_edit_operation_invalid",
      ],
      [
        {
          operationId: "test:dreamsign:bad-trigger-counter",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_trigger_counter",
          visibility: "visible",
          payload: {
            kind: "dreamsign_trigger_counter",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
            trigger: "on battle start",
            count: 0,
          },
        },
        "dreamsign_trigger_counter_invalid",
      ],
      [
        {
          operationId: "test:dreamsign:missing-random-pool",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_random_reward",
          visibility: "visible",
          payload: {
            kind: "dreamsign_random_reward",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
          },
        },
        "dreamsign_random_reward_pool_missing",
      ],
      [
        {
          operationId: "test:dreamsign:missing-trade-obligation",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_trade_hook",
          visibility: "visible",
          payload: {
            kind: "dreamsign_trade_hook",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
          },
        },
        "dreamsign_trade_hook_obligation_missing",
      ],
      [
        {
          operationId: "test:bane:bad-count",
          operationKind: "burden",
          role: "burden",
          burdenKind: "bane_gain",
          visibility: "visible",
          payload: { kind: "bane_gain", baneName: "Dread", count: 0 },
        },
        "bane_count_invalid",
      ],
      [
        {
          operationId: "test:bane:missing-name",
          operationKind: "burden",
          role: "burden",
          burdenKind: "bane_gain",
          visibility: "visible",
          payload: { kind: "bane_gain", baneName: "", count: 1 },
        },
        "bane_name_missing",
      ],
      [
        {
          operationId: "test:bane:missing-duration",
          operationKind: "burden",
          role: "burden",
          burdenKind: "bane_temporary",
          visibility: "visible",
          payload: { kind: "bane_temporary", baneName: "Dread", count: 1 },
        },
        "bane_temporary_duration_missing",
      ],
      [
        {
          operationId: "test:bane:missing-delayed-timing",
          operationKind: "burden",
          role: "burden",
          burdenKind: "bane_delayed",
          visibility: "visible",
          payload: { kind: "bane_delayed", baneName: "Dread", count: 1 },
        },
        "bane_delayed_timing_missing",
      ],
      [
        {
          operationId: "test:bane:missing-replacement",
          operationKind: "reward",
          role: "reward",
          rewardKind: "bane_replace",
          visibility: "visible",
          payload: { kind: "bane_replace", baneName: "Dread", count: 1 },
        },
        "bane_replacement_missing",
      ],
      [
        {
          operationId: "test:bane:missing-transform-result",
          operationKind: "reward",
          role: "reward",
          rewardKind: "bane_transform_to_card",
          visibility: "visible",
          payload: { kind: "bane_transform_to_card", baneName: "Dread" },
        },
        "bane_transform_result_missing",
      ],
      [
        {
          operationId: "test:battle-window:bad-player",
          operationKind: "reward",
          role: "reward",
          rewardKind: "battle_window_modifier",
          visibility: "visible",
          payload: {
            kind: "battle_window_modifier",
            battleWindowOperationKind: "energy",
            affectedPlayer: "everyone",
            polarity: "positive",
            duration: "next battle",
          },
        },
        "battle_window_player_invalid",
      ],
      [
        {
          operationId: "test:battle-window:missing-operation",
          operationKind: "reward",
          role: "reward",
          rewardKind: "battle_window_modifier",
          visibility: "visible",
          payload: {
            kind: "battle_window_modifier",
            affectedPlayer: "you",
            polarity: "positive",
            duration: "next battle",
          },
        },
        "battle_window_operation_missing",
      ],
      [
        {
          operationId: "test:battle-window:bad-polarity",
          operationKind: "reward",
          role: "reward",
          rewardKind: "battle_window_modifier",
          visibility: "visible",
          payload: {
            kind: "battle_window_modifier",
            battleWindowOperationKind: "starting_energy",
            affectedPlayer: "you",
            polarity: "maybe",
            duration: "next battle",
          },
        },
        "battle_window_polarity_invalid",
      ],
      [
        {
          operationId: "test:battle-window:missing-duration",
          operationKind: "reward",
          role: "reward",
          rewardKind: "battle_window_modifier",
          visibility: "visible",
          payload: {
            kind: "battle_window_modifier",
            battleWindowOperationKind: "starting_energy",
            affectedPlayer: "you",
            polarity: "positive",
          },
        },
        "battle_window_duration_missing",
      ],
      [
        {
          operationId: "test:dreamwell:bad-count",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamwell_modifier",
          visibility: "visible",
          payload: {
            kind: "dreamwell_modifier",
            dreamwellScope: "battle_window",
            dreamwellOperationKind: "bonus_card_count",
            count: 0,
            cardRole: "bonus",
            phaseSelector: "first_draw",
            playerVisibility: "visible",
          },
        },
        "dreamwell_count_invalid",
      ],
      [
        {
          operationId: "test:dreamwell:bad-scope",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamwell_modifier",
          visibility: "visible",
          payload: {
            kind: "dreamwell_modifier",
            dreamwellScope: "forever",
            dreamwellOperationKind: "bonus_card_count",
          },
        },
        "dreamwell_scope_invalid",
      ],
      [
        {
          operationId: "test:dreamwell:missing-operation",
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamwell_modifier",
          visibility: "visible",
          payload: {
            kind: "dreamwell_modifier",
            dreamwellScope: "battle_window",
          },
        },
        "dreamwell_operation_missing",
      ],
      [
        {
          operationId: "test:shop:bad-price",
          operationKind: "reward",
          role: "reward",
          rewardKind: "shop_economy_modifier",
          visibility: "visible",
          payload: {
            kind: "shop_economy_modifier",
            shopOperationKind: "price_multiplier",
            priceMultiplier: -1,
          },
        },
        "shop_price_modifier_invalid",
      ],
      [
        {
          operationId: "test:shop:missing-operation",
          operationKind: "reward",
          role: "reward",
          rewardKind: "shop_economy_modifier",
          visibility: "visible",
          payload: { kind: "shop_economy_modifier" },
        },
        "shop_operation_missing",
      ],
      [
        {
          operationId: "test:shop:bad-reroll-cap",
          operationKind: "reward",
          role: "reward",
          rewardKind: "shop_economy_modifier",
          visibility: "visible",
          payload: {
            kind: "shop_economy_modifier",
            shopRuleKind: "reroll_cap",
            rerollOmenCap: -1,
          },
        },
        "shop_reroll_cap_invalid",
      ],
      [
        {
          operationId: "test:status:bad-duration",
          operationKind: "status",
          role: "burden",
          statusKind: "status_reward_reduction",
          visibility: "visible",
          payload: {
            kind: "status_reward_reduction",
            statusScope: "reward",
            duration: "",
            ruleMutationKind: "battle_reward_reduction",
          },
        },
        "invalid_status_duration",
      ],
      [
        {
          operationId: "test:hook:bad-budget",
          operationKind: "delayed_hook",
          role: "delayed_hook",
          visibility: "precommitted",
          hookKind: "battle",
          triggerSelector: {
            triggerKind: "battle",
            label: "after a battle",
          },
          duration: {
            durationKind: "battle_count",
            label: "next battle",
            count: 1,
          },
          expiration: {
            policyKind: "forfeit_reward",
            label: "expires",
          },
          controlledScene: {
            sceneKind: "reward",
            label: "reward",
          },
          visibilityPolicy: {
            outcomeVisibility: "visible",
            disclosure: "Visible delayed reward.",
          },
          hookBudgetCost: 2,
          payload: {
            kind: "delayed_hook_contract",
            triggerSelector: {
              triggerKind: "battle",
              label: "after a battle",
            },
            trackedCondition: "Track a battle.",
            resolution: "Resolve the reward.",
            expiration: {
              policyKind: "forfeit_reward",
              label: "expires",
            },
            duration: {
              durationKind: "battle_count",
              label: "next battle",
              count: 1,
            },
            controlledScene: {
              sceneKind: "reward",
              label: "reward",
            },
            visibilityPolicy: {
              outcomeVisibility: "visible",
              disclosure: "Visible delayed reward.",
            },
            hookBudgetCost: 2,
            reward: { kind: "gain_essence", amount: 40 },
          },
        },
        "invalid_hook_budget",
      ],
      [
        {
          ...generatedObjectOperation(generatedObject),
          payload: {
            generatedObjectId: "different-generated-object",
            generatedObjectKind: generatedObject.generatedObjectKind,
          },
        },
        "generated_object_operation_mismatch",
      ],
    ];

    for (const [operation, rule] of cases) {
      expect(validateJourneyManifest(operationManifest(operation), journeyContext), rule)
        .toMatchObject({
          ok: false,
          rule,
        });
    }
  });

  it("rejects unresolved named card and Dreamsign references", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });
    const invalid: JourneyManifest = {
      ...manifest,
      references: {
        ...manifest.references,
        cardIds: [...manifest.references.cardIds, "not-a-real-card"],
        dreamsignIds: [
          ...manifest.references.dreamsignIds,
          "not-a-real-dreamsign",
        ],
      },
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "unresolved_reference",
    });
  });

  it("rejects Dreamsign pool edits with unresolved source predicates", async () => {
    const journeyContext = await context("dreamsign-pool-edit-invalid");
    const manifest = forcedDreamsignOperationManifest(journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.map((option) => ({
        ...option,
        effects: option.effects.map((effect) =>
          typeof effect === "object" &&
          effect !== null &&
          !Array.isArray(effect) &&
          "kind" in effect &&
          effect.kind === "dreamsign_pool_edit"
            ? { ...effect, source: "active" }
            : effect,
        ),
      })),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "dreamsign_target_unavailable",
    });
  });

  it("rejects random Dreamsign rewards with IDs outside the current pool", async () => {
    const journeyContext = await context("dreamsign-random-invalid");
    const manifest = forcedDreamsignOperationManifest(journeyContext);
    const poolIds = new Set(journeyContext.state.quest.dreamsignPoolIds);
    const outsidePoolDreamsign = journeyContext.content.dreamsigns.find(
      (dreamsign) => !poolIds.has(dreamsign.id),
    )!;
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.map((option) => ({
        ...option,
        effects: option.effects.map((effect) =>
          typeof effect === "object" &&
          effect !== null &&
          !Array.isArray(effect) &&
          "kind" in effect &&
          effect.kind === "dreamsign_random_reward"
            ? { ...effect, rewardPoolDreamsignIds: [outsidePoolDreamsign.id] }
            : effect,
        ),
      })),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "dreamsign_random_reward_pool_unavailable",
    });
  });

  it("rejects Dreamsign trade hooks with give references outside the source", async () => {
    const journeyContext = await context("dreamsign-trade-invalid");
    const manifest = forcedDreamsignOperationManifest(journeyContext);
    const poolIds = new Set(journeyContext.state.quest.dreamsignPoolIds);
    const outsidePoolDreamsign = journeyContext.content.dreamsigns.find(
      (dreamsign) => !poolIds.has(dreamsign.id),
    )!;
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.map((option) => ({
        ...option,
        effects: option.effects.map((effect) =>
          typeof effect === "object" &&
          effect !== null &&
          !Array.isArray(effect) &&
          "kind" in effect &&
          effect.kind === "dreamsign_trade_hook"
            ? {
                ...effect,
                giveDreamsignId: outsidePoolDreamsign.id,
                giveDreamsignName: outsidePoolDreamsign.name,
              }
            : effect,
        ),
      })),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "dreamsign_trade_hook_give_unavailable",
    });
  });

  it("resolves named card and Dreamsign selectors into JSON/debug metadata", async () => {
    const journeyContext = await context();
    const card = journeyContext.content.cards[0]!;
    const dreamsign = journeyContext.content.dreamsigns[0]!;
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const withNamedSelectors: JourneyManifest = attachTargetResolutionMetadata(
      {
        ...manifest,
        options: [
          refreshOptionOperations({
            ...manifest.options[0]!,
            text: `Gain {${card.name}}.`,
            effects: [{ kind: "card_gain", cardName: card.name }],
          }),
          refreshOptionOperations({
            ...manifest.options[1]!,
            text: `Gain {${dreamsign.name}}.`,
            effects: [
              { kind: "dreamsign_gain", dreamsignName: dreamsign.name },
            ],
          }),
        ],
      },
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(validateJourneyManifest(withNamedSelectors, journeyContext)).toEqual(
      { ok: true },
    );
    expect(withNamedSelectors.options[0]?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetSelector: expect.objectContaining({
            selectorKind: "card",
            selection: "exact",
            names: [card.name],
          }),
          targetResolution: expect.objectContaining({
            sourcePool: "catalog",
            candidateCount: 1,
            selected: [
              expect.objectContaining({ id: card.id, name: card.name }),
            ],
          }),
        }),
      ]),
    );
    expect(withNamedSelectors.options[1]?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetSelector: expect.objectContaining({
            selectorKind: "dreamsign",
            selection: "exact",
            names: [dreamsign.name],
          }),
          targetResolution: expect.objectContaining({
            sourcePool: "catalog",
            candidateCount: 1,
            selected: [
              expect.objectContaining({
                id: dreamsign.id,
                name: dreamsign.name,
              }),
            ],
          }),
        }),
      ]),
    );
  });

  it("exposes content-backed target origins for current, catalog, pool, and generated named objects", async () => {
    const journeyContext = await context();
    const deckCard = journeyContext.content.cards.find((card) =>
      journeyContext.state.quest.deck.entries.some((entry) => entry.cardId === card.id)
    )!;
    const catalogCard = journeyContext.content.cards.find(
      (card) => card.rarity !== "Starter" &&
        !journeyContext.state.quest.deck.entries.some((entry) => entry.cardId === card.id),
    )!;
    const poolDreamsign = journeyContext.content.dreamsigns.find((dreamsign) =>
      journeyContext.state.quest.dreamsignPoolIds.includes(dreamsign.id)
    )!;
    const generatedDefinition = generatedObjectDefinition();
    const manifest = attachTargetResolutionMetadata(
      {
        ...fillForShape("heterogeneous_pair", journeyContext),
        generatedObjects: [generatedDefinition],
        options: [
          refreshOptionOperations({
            ...fillForShape("heterogeneous_pair", journeyContext).options[0]!,
            targets: [
              cardExactTarget(deckCard, "deck"),
              cardExactTarget(catalogCard, "catalog"),
              dreamsignExactTarget(poolDreamsign, "pool"),
            ],
          }),
          {
            ...fillForShape("heterogeneous_pair", journeyContext).options[1]!,
            operations: [
              {
                operationId: "test:generated-origin",
                operationKind: "target",
                role: "target",
                visibility: "visible",
                targetSelector: {
                  selectorKind: "generated_object",
                  selection: "exact",
                  referenceKind: "manifest_generated",
                  generatedObjectReferenceKind: "definition",
                  generatedObjectKind: generatedDefinition.generatedObjectKind,
                  generatedObjectId: generatedDefinition.generatedObjectId,
                  name: generatedDefinition.name,
                  required: true,
                },
                payload: {},
              },
            ],
          },
        ],
      },
      journeyContext.content,
      journeyContext.state.quest,
    );
    const resolutions = manifest.options.flatMap((option) =>
      option.operations.flatMap((operation) =>
        operation.targetResolution ? [operation.targetResolution] : []
      )
    );

    expect(resolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePool: "deck",
          targetOrigin: "current_object",
          selected: [
            expect.objectContaining({
              name: deckCard.name,
              targetOrigin: "current_object",
            }),
          ],
        }),
        expect.objectContaining({
          sourcePool: "catalog",
          targetOrigin: "catalog_reward",
          selected: [
            expect.objectContaining({
              name: catalogCard.name,
              targetOrigin: "catalog_reward",
            }),
          ],
        }),
        expect.objectContaining({
          sourcePool: "pool",
          targetOrigin: "dreamsign_pool_candidate",
          selected: [
            expect.objectContaining({
              name: poolDreamsign.name,
              targetOrigin: "dreamsign_pool_candidate",
            }),
          ],
        }),
        expect.objectContaining({
          sourcePool: "manifest_generated",
          targetOrigin: "future_generated_object",
          selected: [
            expect.objectContaining({
              name: generatedDefinition.name,
              targetOrigin: "future_generated_object",
            }),
          ],
        }),
      ]),
    );
  });

  it("provides reusable weighted selectors for content-backed cards and Dreamsigns", async () => {
    const journeyContext = await context("content-backed-selectors");
    const cards = contentBackedCardCandidates({
      context: journeyContext,
      stage: "mid",
      sources: ["deck", "draftPool", "catalog"],
      includeStarters: true,
    });
    const dreamsigns = contentBackedDreamsignCandidates({
      context: journeyContext,
      stage: "mid",
      sources: ["active", "pool", "catalog"],
    });

    expect(cards.map((candidate) => candidate.targetOrigin)).toEqual(
      expect.arrayContaining([
        "current_object",
        "draft_pool_candidate",
        "catalog_reward",
      ]),
    );
    expect(
      cards.every((candidate) =>
        candidate.weight > 0 &&
        typeof candidate.weightHooks.rarity === "number" &&
        typeof candidate.weightHooks.tideOverlap === "number" &&
        typeof candidate.weightHooks.starterStatus === "number" &&
        typeof candidate.weightHooks.currentDeckAvailability === "number" &&
        typeof candidate.weightHooks.stage === "number"
      ),
    ).toBe(true);
    expect(dreamsigns.map((candidate) => candidate.targetOrigin)).toEqual(
      expect.arrayContaining([
        "dreamsign_pool_candidate",
        "catalog_reward",
      ]),
    );
    expect(
      dreamsigns.every((candidate) =>
        candidate.weight > 0 &&
        typeof candidate.weightHooks.kind === "number" &&
        typeof candidate.weightHooks.tideOverlap === "number" &&
        typeof candidate.weightHooks.currentAvailability === "number" &&
        typeof candidate.weightHooks.stage === "number"
      ),
    ).toBe(true);
  });

  it("emits normal content-backed named card and Dreamsign gains without debug payloads", async () => {
    const found = new Set<string>();
    const evidence: Record<string, JourneyOperation | undefined> = {};

    for (let index = 0; index < 80 && found.size < 2; index += 1) {
      const journeyContext = await context(`normal-named-gain:${index}`);
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedShapeId: "curated_reward_trio",
        forcedStage: "mid",
      });

      expect(manifest.debug.debugPayload).toBeUndefined();
      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
        ok: true,
      });

      for (const operation of manifest.options.flatMap((option) => option.operations)) {
        if (
          operation.operationKind === "reward" &&
          operation.rewardKind === "card_gain" &&
          operation.targetResolution?.targetOrigin &&
          operation.targetSelector?.selectorKind === "card" &&
          operation.targetSelector.selection === "exact"
        ) {
          found.add("card");
          evidence.card = operation;
        }

        if (
          operation.operationKind === "reward" &&
          operation.rewardKind === "dreamsign_gain" &&
          operation.targetResolution?.targetOrigin
        ) {
          found.add("dreamsign");
          evidence.dreamsign = operation;
        }
      }
    }

    expect(evidence.card).toMatchObject({
      rewardKind: "card_gain",
      targetResolution: expect.objectContaining({
        selectorKind: "card",
        candidateCount: 1,
        targetOrigin: expect.stringMatching(/catalog_reward|draft_pool_candidate/u),
      }),
    });
    expect(evidence.dreamsign).toMatchObject({
      rewardKind: "dreamsign_gain",
      targetResolution: expect.objectContaining({
        selectorKind: "dreamsign",
        candidateCount: 1,
        targetOrigin: expect.stringMatching(/catalog_reward|dreamsign_pool_candidate/u),
      }),
    });
  });

  it("reports empty required target pools with stable debug metadata", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const deckCardIds = new Set(
      journeyContext.state.quest.deck.entries.map((entry) => entry.cardId),
    );
    const nonDeckCard = journeyContext.content.cards.find(
      (card) => !deckCardIds.has(card.id),
    )!;
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
          targets: [
            {
              kind: "card",
              description: "impossible deck cards",
              predicate: { source: "deck", names: [nonDeckCard.name] },
              required: true,
            },
          ],
        }),
        ...manifest.options.slice(1),
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "zero_legal_required_targets",
      debug: {
        targetResolution: {
          selectorKind: "card",
          sourcePool: "deck",
          candidateCount: 0,
          selected: [],
          emptyReason: "empty_deck_or_no_matching_targets",
        },
      },
    });
  });

  it("keeps generated-object, Bane, route, deferred, and random selectors structured in generated JSON", async () => {
    const journeyContext = await context();
    const randomManifest = generateNextJourney({
      context: journeyContext,
      forcedShapeId: "single_random_outcome",
    });
    const routeManifest = generateNextJourney({
      context: journeyContext,
      forcedShapeId: "alter_dreamscapes",
    });
    const baseManifest = fillForShape("heterogeneous_pair", journeyContext);
    const generatedSelectorManifest = attachTargetResolutionMetadata(
      {
        ...baseManifest,
        options: [
          {
            ...baseManifest.options[0]!,
            operations: [
              {
                operationId: "test:generated-placeholder",
                operationKind: "target",
                role: "target",
                visibility: "debug",
                targetSelector: {
                  selectorKind: "generated_object",
                  selection: "exact",
                  referenceKind: "placeholder",
                  generatedObjectReferenceKind: "placeholder",
                  generatedObjectKind: "card",
                  generatedObjectId: "generated-card-placeholder",
                  name: "Generated Card Placeholder",
                  required: true,
                },
                payload: {},
              },
              {
                operationId: "test:bane",
                operationKind: "target",
                role: "target",
                visibility: "debug",
                targetSelector: {
                  selectorKind: "bane",
                  selection: "exact",
                  referenceKind: "controlled_vocabulary",
                  source: "vocabulary",
                  names: ["Nightmare"],
                  required: true,
                },
                payload: {},
              },
            ],
          },
          ...baseManifest.options.slice(1),
        ],
      },
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(
      validateJourneyManifest(generatedSelectorManifest, journeyContext),
    ).toEqual({ ok: true });
    expect(
      generatedSelectorManifest.options[0]?.operations.map(
        (operation) => operation.targetSelector,
      ),
    ).toEqual([
      expect.objectContaining({
        selectorKind: "generated_object",
        generatedObjectReferenceKind: "placeholder",
      }),
      expect.objectContaining({ selectorKind: "bane", names: ["Nightmare"] }),
    ]);
    expect(
      routeManifest.options.flatMap((option) => option.operations),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetSelector: expect.objectContaining({
            selectorKind: "route_site",
            selection: "exact",
          }),
          targetResolution: expect.objectContaining({
            selectorKind: "route_site",
            candidateCount: expect.any(Number),
          }),
        }),
      ]),
    );
    expect(randomManifest.precommitted.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "random_envelope",
          timing: expect.objectContaining({ timingKind: "random" }),
          visibility: "precommitted",
        }),
      ]),
    );
  });

  it("validates generated-object selectors against operation-local definitions", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const localDefinition = generatedObjectDefinition({
      generatedObjectId: "generated-card-operation-local",
      name: "Operation Local Lantern",
    });
    const withLocalDefinition = attachTargetResolutionMetadata(
      {
        ...manifest,
        generatedObjects: [],
        options: [
          {
            ...manifest.options[0]!,
            operations: [
              generatedObjectOperation(localDefinition),
              {
                operationId: "test:target-operation-local",
                operationKind: "target",
                role: "target",
                visibility: "debug",
                targetSelector: {
                  selectorKind: "generated_object",
                  selection: "exact",
                  referenceKind: "manifest_generated",
                  generatedObjectReferenceKind: "definition",
                  generatedObjectKind: "card",
                  generatedObjectId: "generated-card-operation-local",
                  name: "Operation Local Lantern",
                  required: true,
                },
                payload: {},
              },
            ],
          },
          ...manifest.options.slice(1),
        ],
      },
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(
      validateJourneyManifest(withLocalDefinition, journeyContext),
    ).toEqual({ ok: true });
    expect(
      withLocalDefinition.options[0]?.operations[1]?.targetResolution,
    ).toMatchObject({
      selectorKind: "generated_object",
      sourcePool: "manifest_generated",
      candidateCount: 1,
      selected: [
        {
          id: "generated-card-operation-local",
          name: "Operation Local Lantern",
          kind: "card",
        },
      ],
    });
  });

  it("rejects bad generated-object IDs and names in required selectors", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const definition = generatedObjectDefinition();
    const withSelector = (
      selector: NonNullable<JourneyOperation["targetSelector"]>,
    ): JourneyManifest => ({
      ...manifest,
      generatedObjects: [definition],
      options: [
        {
          ...manifest.options[0]!,
          operations: [
            {
              operationId: "test:bad-generated-object-selector",
              operationKind: "target",
              role: "target",
              visibility: "debug",
              targetSelector: selector,
              payload: {},
            },
          ],
        },
        ...manifest.options.slice(1),
      ],
    });

    const badId = withSelector({
      selectorKind: "generated_object",
      selection: "exact",
      referenceKind: "manifest_generated",
      generatedObjectReferenceKind: "definition",
      generatedObjectKind: "card",
      generatedObjectId: "generated-card-missing",
      required: true,
    });
    const badName = withSelector({
      selectorKind: "generated_object",
      selection: "exact",
      referenceKind: "manifest_generated",
      generatedObjectReferenceKind: "definition",
      generatedObjectKind: "card",
      generatedObjectId: definition.generatedObjectId,
      name: "Wrong Lantern",
      required: true,
    });

    expect(validateJourneyManifest(badId, journeyContext)).toMatchObject({
      ok: false,
      rule: "zero_legal_required_targets",
    });
    expect(validateJourneyManifest(badName, journeyContext)).toMatchObject({
      ok: false,
      rule: "zero_legal_required_targets",
    });
  });

  it("rejects duplicate generated-object IDs across manifest and operation-local definitions", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const definition = generatedObjectDefinition();
    const invalid: JourneyManifest = {
      ...manifest,
      generatedObjects: [definition],
      options: [
        {
          ...manifest.options[0]!,
          operations: [
            generatedObjectOperation(
              generatedObjectDefinition({
                generatedObjectId: definition.generatedObjectId,
                name: "Duplicate Test Lantern",
              }),
            ),
          ],
        },
        ...manifest.options.slice(1),
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "duplicate_generated_object_id",
    });
  });

  it("rejects malformed option entries instead of throwing", async () => {
    const journeyContext = await contextWithEmptyDreamsignPool();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        manifest.options[0]!,
        undefined as unknown as JourneyManifest["options"][number],
      ],
    };

    expect(() =>
      validateJourneyManifest(invalid, journeyContext),
    ).not.toThrow();
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "invalid_option",
    });
  });

  it("rejects malformed generated object collections instead of throwing", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      generatedObjects:
        undefined as unknown as JourneyManifest["generatedObjects"],
    };

    expect(() =>
      validateJourneyManifest(invalid, journeyContext),
    ).not.toThrow();
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "invalid_generated_object_definition",
    });
  });

  it("rejects choose-your-loss menus with trivial losses beside severe losses", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("choose_your_loss", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
          text: "Pay 25 essence.",
          costs: [{ kind: "essence", amount: 25, timing: "immediate" }],
          costConvertedEssence: 25,
          netConvertedEssence: -25,
        }),
        ...manifest.options.slice(1),
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "loss_not_comparable",
    });
  });

  it("rejects positive menus with disparate root option values", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
          text: "Gain 150 essence.",
          effects: [{ kind: "gain_essence", amount: 150 }],
          effectConvertedEssence: 150,
          netConvertedEssence: 150,
        }),
        {
          ...manifest.options[1]!,
          text: "Choose 1 of 3 Dreamsigns.",
          effectConvertedEssence: 375,
          netConvertedEssence: 375,
        },
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "option_values_are_comparable_for_shape",
    });
  });

  it("rejects incoherent row values in symmetric menus", async () => {
    const journeyContext = await context("m21-symmetric-values");
    const manifest = fillForShape("shared_prefix_menu", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.map((option, index) => ({
        ...option,
        effectConvertedEssence: index === 0 ? 120 : 360,
        netConvertedEssence: index === 0 ? 120 : 360,
      })),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "symmetric_option_values_are_comparable",
    });
    expect(repairOrFallbackJourney(invalid, journeyContext, {
      ok: false,
      rule: "symmetric_option_values_are_comparable",
      message: "symmetric rows are outside the comparable band",
    }).debug.repair.action).not.toBe("accepted");
  });

  it("keeps explicit escalation shapes exempt from symmetric value bands", async () => {
    const journeyContext = await context("m21-escalating-values");
    const manifest = fillForShapeAtStage("flat_escalating_trade", journeyContext, "mid");

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("rejects pure burden rows outside loss-choice shapes", async () => {
    const journeyContext = await context("m20-pure-burden");
    const manifest = fillForShape("service_menu", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
          text: "Gain 1 {Nightmare}.",
          costs: [],
          effects: [],
          burdens: [{ kind: "bane_gain", baneName: "Nightmare", count: 1 }],
          targets: [],
          routeEffects: [],
          costConvertedEssence: 0,
          effectConvertedEssence: 0,
          burdenConvertedEssence: -125,
          uncertaintyConvertedEssence: 0,
          netConvertedEssence: -125,
        }),
        ...manifest.options.slice(1),
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "pure_burden_positive_scene",
    });
  });

  it("rejects duplicate mechanical root options inside one menu", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("one_target_many_operations", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        manifest.options[0]!,
        refreshOptionOperations({
          ...manifest.options[1]!,
          text: "Mechanically duplicated offer.",
          costs: manifest.options[0]!.costs,
          effects: manifest.options[0]!.effects,
          burdens: manifest.options[0]!.burdens,
          targets: manifest.options[0]!.targets,
          triggers: manifest.options[0]!.triggers,
          routeEffects: manifest.options[0]!.routeEffects,
        }),
        ...manifest.options.slice(2),
      ],
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "duplicate_root_option_mechanics",
    });
  });

  it("requires paired-return precommitted metadata", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("paired_return", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {
        ...refreshPrecommittedOperations({
          delayed: manifest.precommitted.delayed,
        }),
      },
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("requires random outcomes to be precommitted", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_random_outcome", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {},
    };

    expect(manifest.precommitted.random?.length).toBeGreaterThanOrEqual(manifest.options.length);
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("shows wager odds in root option copy while keeping the committed roll in metadata", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_wager", journeyContext);

    expect(manifest.options[0]?.text).toMatch(
      /^Pay \d+ essence\. \d+% chance to .+ otherwise gain nothing\.$/u,
    );
    expect(manifest.options[1]?.text).toMatch(
      /^Pay \d+ essence\. \d+% chance to .+ otherwise gain nothing\.$/u,
    );
    expect(manifest.precommitted.random?.[0]).toMatchObject({
      kind: "wager",
      optionNumber: 1,
      odds: { percent: expect.any(Number) },
      stake: expect.anything(),
      success: expect.anything(),
      failure: { kind: "no_reward" },
      roll: expect.any(Number),
      committedResult: expect.stringMatching(/^(success|failure)$/u),
      constraints: [
        expect.objectContaining({
          constraintKind: "shape_invariant",
          shapeId: "single_wager",
          ruleId: "single_wager_known_stake",
        }),
      ],
      presentation: expect.any(String),
    });
    expect(manifest.precommitted.random?.[1]).toMatchObject({
      kind: "wager",
      optionNumber: 2,
      odds: { percent: expect.any(Number) },
      stake: expect.anything(),
      success: expect.anything(),
      failure: { kind: "no_reward" },
      roll: expect.any(Number),
      committedResult: expect.stringMatching(/^(success|failure)$/u),
      constraints: [
        expect.objectContaining({
          constraintKind: "shape_invariant",
          shapeId: "single_wager",
          ruleId: "single_wager_known_stake",
        }),
      ],
      presentation: "visible_odds_debug_roll",
    });
    expect(manifest.options.flatMap((option) => option.effects)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "wager" }),
      ]),
    );
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("models risk-or-skip downside as a bounded chance envelope", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("risk_or_skip", journeyContext);

    expect(manifest.options[0]?.text).toMatch(
      /\d+% chance to .+; otherwise no downside\.$/u,
    );
    expect(manifest.options[0]?.effects.length).toBeGreaterThan(0);
    expect(manifest.options[0]?.burdens).toEqual([]);
    const riskEnvelope = manifest.precommitted.random?.[0];
    expect(riskEnvelope).toMatchObject({
      optionNumber: 1,
      odds: { percent: expect.any(Number) },
      kind: expect.stringMatching(/^(chance_to_gain_bane|chance_to_pay_cost)$/u),
      committedResult: expect.stringMatching(/^(bane|safe|paid|free)$/u),
      presentation: expect.any(String),
    });
    expect(riskEnvelope?.constraints).toEqual([
      expect.objectContaining({
        constraintKind: "shape_invariant",
        shapeId: "risk_or_skip",
        ruleId: "risk_or_skip_bounded_downside",
      }),
    ]);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("derives manifest Bane references from normal generated Bane payloads", async () => {
    const riskContext = await context("risk");
    const riskManifest = fillForShape("risk_or_skip", riskContext);
    const riskEnvelope = riskManifest.precommitted.random?.[0] as
      | { kind?: string; baneName?: string }
      | undefined;

    expect(riskEnvelope).toMatchObject({
      kind: "chance_to_gain_bane",
      baneName: expect.any(String),
    });
    expect(riskEnvelope?.baneName).not.toBe("Nightmare");
    expect(riskManifest.references.baneNames).toEqual([
      riskEnvelope?.baneName,
    ]);
    expect(riskManifest.options[0]?.text).toContain(
      String(riskEnvelope?.baneName),
    );

    const costContext = await context("qa");
    const costManifest = fillForShape(
      "same_reward_different_costs",
      costContext,
    );
    const burdenNames = costManifest.options.flatMap((journeyOption) =>
      journeyOption.burdens
        .filter(
          (burden): burden is { baneName: string } =>
            typeof burden === "object" &&
            burden !== null &&
            "baneName" in burden,
        )
        .map((burden) => burden.baneName),
    );

    expect(burdenNames).toHaveLength(1);
    expect(burdenNames[0]).not.toBe("Nightmare");
    expect(costManifest.references.baneNames).toEqual(burdenNames);
    expect(validateJourneyManifest(costManifest, costContext)).toEqual({
      ok: true,
    });
  });

  it("rejects risk-or-skip accept options with guaranteed downside payloads", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("risk_or_skip", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
          text: "Gain 160 essence. Gain 1 Nightmare.",
          burdens: [{ kind: "bane_gain", baneName: "Nightmare", count: 1 }],
          burdenConvertedEssence: -125,
          netConvertedEssence:
            manifest.options[0]!.effectConvertedEssence -
            manifest.options[0]!.costConvertedEssence -
            125 +
            manifest.options[0]!.uncertaintyConvertedEssence,
        }),
        manifest.options[1]!,
      ],
      precommitted: refreshPrecommittedOperations({
        random: [{ kind: "visible_downside", baneName: "Nightmare", count: 1 }],
      }),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "downside_is_random_inside_visible_envelope",
    });
  });

  it("rejects risk-or-skip metadata that lacks a safe downside roll", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("risk_or_skip", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: refreshPrecommittedOperations({
        random: [{ kind: "visible_downside", baneName: "Nightmare", count: 1 }],
      }),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "downside_is_random_inside_visible_envelope",
    });
  });

  it("reveals committed non-wager random values in root option copy", async () => {
    const journeyContext = await context();

    expect(
      fillForShape("single_random_outcome", journeyContext).options.map(
        (option) => option.text,
      ),
    ).toEqual([
      expect.stringMatching(/Reveal|Spin the visible wheel|Roll twice/u),
      expect.stringMatching(/precommitted|kept|random reward/u),
    ]);
    expect(
      fillForShape("resolved_random_series", journeyContext).options.map(
        (option) => option.text,
      ),
    ).toEqual([
      expect.stringMatching(/^Resolve the precommitted rewards: .+\.$/u),
      expect.stringMatching(/^Resolve the precommitted rewards: .+\.$/u),
    ]);
  });

  it("builds Covered Cups reveal-choice envelopes through normal generation", async () => {
    const content = await loadContent(process.cwd());
    const matches = Array.from({ length: 24 }, (_, index) => {
      const journeyContext = contextFromContent(content, `covered-cups-${index}`, "mid");
      const manifest = fillForShapeAtStage(
        "single_random_outcome",
        journeyContext,
        "mid",
      );
      const kinds = manifest.precommitted.random?.map((entry) => entry.kind) ?? [];

      expect(validateJourneyManifest(manifest, journeyContext), `covered-cups-${index}`).toEqual({
        ok: true,
      });

      return {
        manifest,
        kinds,
      };
    });
    const reveal = matches.find(({ kinds }) =>
      [
        "reveal_rewards",
        "choose_one_revealed_reward",
        "choose_one_random_revealed_reward",
        "gain_one_random_reward",
      ].every((kind) => kinds.includes(kind))
    );

    expect(reveal).toBeDefined();
    expect(reveal?.manifest.options.map((option) => option.text).join(" ")).toMatch(
      /Reveal \d+ rewards/u,
    );
    expect(reveal?.manifest.precommitted.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reveal_envelope",
          envelopeKind: "reveal_rewards",
          value: expect.objectContaining({
            expectedConvertedEssence: expect.any(Number),
            worstCaseBurdenConvertedEssence: expect.any(Number),
            riskPremiumConvertedEssence: expect.any(Number),
          }),
        }),
      ]),
    );
  });

  it("builds Covered Cups as a reveal-choice root menu when forced", async () => {
    const journeyContext = await context("covered-cups-reveal-choice-menu");
    const manifest = fillForShapeAtStage(
      "reveal_choice_menu",
      journeyContext,
      "mid",
    );
    const kinds = manifest.precommitted.random?.map((entry) => entry.kind) ?? [];

    expect(manifest.shapeId).toBe("reveal_choice_menu");
    expect(manifest.options).toHaveLength(3);
    expect(manifest.tree).toBeUndefined();
    expect(manifest.options.map((option) => option.text)).toEqual([
      expect.stringMatching(/^Reveal [2-4] rewards/u),
      expect.stringMatching(/^Reveal [4-6] rewards.+gain [12] \{.+\}/u),
      expect.stringMatching(/^Gain one random reward/u),
    ]);
    expect(manifest.options[1]?.burdens).toEqual([
      expect.objectContaining({ kind: "bane_gain", baneName: expect.any(String) }),
    ]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "visible_pool",
        "reveal_rewards",
        "choose_one_revealed_reward",
        "choose_one_random_revealed_reward",
        "gain_one_random_reward",
      ]),
    );
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("builds Bottomless Bowl as a flat escalating trade menu", async () => {
    const journeyContext = await context("bottomless-bowl-flat-trade");
    const manifest = fillForShapeAtStage(
      "flat_escalating_trade",
      journeyContext,
      "mid",
    );

    expect(manifest.shapeId).toBe("flat_escalating_trade");
    expect(manifest.tree).toBeUndefined();
    expect(manifest.options.map((option) => option.text)).toEqual([
      "Pay 20 essence. Gain 1 omen.",
      "Pay 45 essence. Gain 2 omens.",
      "Pay 80 essence. Gain 3 omens.",
    ]);
    expect(manifest.options.map((option) => option.costConvertedEssence)).toEqual([
      20,
      45,
      80,
    ]);
    expect(manifest.options.map((option) => option.effectConvertedEssence)).toEqual([
      65,
      130,
      195,
    ]);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("builds shared-prefix menus without reusing the same-cost shape", async () => {
    const journeyContext = await context("shared-prefix-menu-forced");
    const manifest = fillForShapeAtStage("shared_prefix_menu", journeyContext, "mid");

    expect(manifest.shapeId).toBe("shared_prefix_menu");
    expect(manifest.options).toHaveLength(3);
    expect(manifest.tree).toBeUndefined();
    expect(manifest.debug.symmetryContracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sharedFirst: true,
          contractKind: expect.stringMatching(
            /^(shared_burden_different_rewards|shared_cleanup_followup_rewards)$/u,
          ),
        }),
      ]),
    );
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
  });

  it("builds Bounded Wheel as a visible mixed pool with roll-twice keep-one", async () => {
    const content = await loadContent(process.cwd());
    const matches = Array.from({ length: 24 }, (_, index) => {
      const journeyContext = contextFromContent(content, `bounded-wheel-${index}`, "mid");
      const manifest = fillForShapeAtStage(
        "single_random_outcome",
        journeyContext,
        "mid",
      );

      expect(validateJourneyManifest(manifest, journeyContext), `bounded-wheel-${index}`).toEqual({
        ok: true,
      });

      return manifest;
    });
    const wheel = matches.find((manifest) =>
      (manifest.precommitted.random ?? []).some((entry) => entry.kind === "roll_twice_keep_one")
    );
    const rewardKinds = new Set(
      wheel?.rewardPool?.operations.map((operation) =>
        operation.operationKind === "reward"
          ? operation.rewardKind
          : operation.operationKind === "burden"
            ? operation.burdenKind
            : operation.operationKind
      ) ?? [],
    );

    expect(wheel).toBeDefined();
    expect(wheel?.precommitted.random).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "visible_pool" }),
        expect.objectContaining({ kind: "gain_one_random_reward" }),
        expect.objectContaining({ kind: "roll_twice_keep_one" }),
      ]),
    );
    expect([...rewardKinds]).toEqual(
      expect.arrayContaining([
        "resource",
        "dreamsign_gain",
        "bane_random_purge",
        "bane_gain",
      ]),
    );
    expect(wheel?.options.map((option) => option.text).join(" ")).toMatch(
      /committed outcome|Roll twice/u,
    );
  });

  it("builds Crooked Coin risk rows with named Dreamsign rewards and random costs or purges", async () => {
    const content = await loadContent(process.cwd());
    const manifests = Array.from({ length: 80 }, (_, index) => {
      const journeyContext = contextFromContent(content, `crooked-coin-${index}`, "mid");
      const manifest = fillForShapeAtStage("risk_or_skip", journeyContext, "mid");

      expect(validateJourneyManifest(manifest, journeyContext), `crooked-coin-${index}`).toEqual({
        ok: true,
      });

      return manifest;
    });
    const namedDreamsignRisk = manifests.find((manifest) =>
      manifest.options[0]?.operations.some(
        (operation) =>
          operation.operationKind === "reward" &&
          operation.rewardKind === "dreamsign_gain" &&
          operation.targetSelector?.selectorKind === "dreamsign" &&
          operation.targetSelector.selection === "exact",
      )
    );
    const chanceBands = new Set(
      manifests.flatMap((manifest) =>
        (manifest.precommitted.random ?? []).flatMap((entry) =>
          entry.odds?.percent ?? []
        )
      ),
    );
    const randomCostRisk = manifests.find((manifest) =>
      (manifest.precommitted.random ?? []).some(
        (entry) =>
          entry.kind === "chance_to_pay_cost" &&
          typeof entry.presentation === "string" &&
          entry.presentation === "random_essence_cost",
      )
    );
    const randomPurgeRisk = manifests.find((manifest) =>
      (manifest.precommitted.random ?? []).some(
        (entry) =>
          entry.kind === "chance_to_pay_cost" &&
          typeof entry.presentation === "string" &&
          (entry.presentation === "random_dreamsign_purge" ||
            entry.presentation === "random_card_purge"),
      )
    );

    expect(namedDreamsignRisk).toBeDefined();
    expect([...chanceBands].some((percent) => ![35, 50, 65].includes(percent))).toBe(true);
    expect(randomCostRisk).toBeDefined();
    expect(randomPurgeRisk).toBeDefined();
  });

  it("keeps every advertised debug payload variant forceable", async () => {
    const content = await loadContent(process.cwd());
    const contentVersion = "test-content-version";

    for (const family of DEBUG_PAYLOAD_FAMILIES) {
      for (const variant of family.variants) {
        if (variant.availability !== "available") {
          continue;
        }

        const supportedShapes =
          variant.supportedShapes === "all"
            ? JOURNEY_SHAPES.map((shape) => shape.id)
            : variant.supportedShapes;
        const forcedStage: JourneyStage =
          variant.supportedStages === "all"
            ? "mid"
            : variant.supportedStages[0]!;
        const forcedDebugPayload = {
          familyId: family.id,
          variantId: variant.id,
          qaId: variant.qaId,
          description: variant.description,
          supportedShapes: variant.supportedShapes,
          supportedStages: variant.supportedStages,
        } satisfies DebugPayloadSelection;

        const shapeId = supportedShapes[0]!;
        const state = createInitialJourneyState({
          seed: `debug-payload-variant:${variant.qaId}:${shapeId}`,
          content,
          contentVersion,
        });
        const journeyContext = buildJourneyContext({
          projectRoot: process.cwd(),
          content,
          state,
          contentVersion,
        });
        const manifest = generateNextJourney({
          context: journeyContext,
          forcedShapeId: shapeId,
          forcedStage,
          forcedDebugPayload,
        });

        expect(
          validateJourneyManifest(manifest, journeyContext),
          `${variant.qaId}:${shapeId}`,
        ).toEqual({ ok: true });
        expect(
          manifest.debug.debugPayload,
          `${variant.qaId}:${shapeId}`,
        ).toMatchObject({
          qaId: variant.qaId,
          source: "forced",
        });
      }
    }
  });

  it("keeps forced debug fixtures distinct from organic feature coverage", async () => {
    const content = await loadContent(process.cwd());
    const normalManifest = (
      shapeId: JourneyShapeId,
      seed: string,
      stage: JourneyStage = "mid",
    ) => {
      const journeyContext = contextFromContent(content, seed, stage);
      const manifest = fillForShapeAtStage(shapeId, journeyContext, stage);

      expect(manifest.debug.debugPayload, `${shapeId}:${seed}`).toBeUndefined();
      expect(validateJourneyManifest(manifest, journeyContext), `${shapeId}:${seed}`).toEqual({
        ok: true,
      });

      return manifest;
    };
    const delayed = normalManifest(
      "reward_after_trigger",
      "organic-delayed-hook",
    );
    const paired = normalManifest("paired_return", "organic-paired-return", "late");
    const risk = normalManifest("risk_or_skip", "organic-risk-envelope");
    const wager = normalManifest("single_wager", "organic-wager-envelope");
    const generated = normalManifest(
      "one_target_many_operations",
      "natural-generated-late-0",
      "late",
    );
    const timedPayloads = Array.from({ length: 20 }, (_, index) =>
      normalManifest("timed_window_menu", `organic-timed-window-${index}`),
    ).flatMap((manifest) =>
      manifest.options.flatMap((option) => [
        ...option.effects,
        ...(option.routeEffects ?? []),
      ]),
    );
    const timedScopes = new Set(
      timedPayloads
        .map((payload) =>
          typeof payload === "object" &&
          payload !== null &&
          "timedWindowScope" in payload
            ? payload.timedWindowScope
            : undefined,
        )
        .filter((scope): scope is string => typeof scope === "string"),
    );

    expect(delayed.precommitted.delayed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "delayed_hook_contract",
          sourceShapeId: "reward_after_trigger",
          rewardMetadata: expect.any(Object),
        }),
      ]),
    );
    expect(paired.precommitted.pairedReturn).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "paired_return_contract",
          sourceShapeId: "paired_return",
          created: expect.any(Object),
          returnScene: expect.any(Object),
        }),
      ]),
    );
    expect(risk.precommitted.random?.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(chance_to_gain_bane|chance_to_pay_cost)$/u),
      ]),
    );
    expect(wager.precommitted.random?.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["wager"]),
    );
    expect(generated.generatedObjects[0]?.payload).toMatchObject({
      source: "manifest_generated",
      generatedBy: "natural_generated_object_builder",
    });
    expect(Array.from(timedScopes)).toEqual(
      expect.arrayContaining(["battle", "dreamwell", "shop", "temporary_object"]),
    );
  });

  it("checks brainstorm reachability matrix families through structured manifest operations", async () => {
    const content = await loadContent(process.cwd());
    const normalManifest = (
      shapeId: JourneyShapeId,
      seed: string,
      stage: JourneyStage = "early",
    ) => {
      const journeyContext = contextFromContent(content, seed, stage);
      const manifest = fillForShapeAtStage(shapeId, journeyContext, stage);

      expect(manifest.debug.debugPayload, `${shapeId}:${seed}`).toBeUndefined();
      expect(validateJourneyManifest(manifest, journeyContext), `${shapeId}:${seed}`).toEqual({
        ok: true,
      });

      return manifest;
    };
    const reachabilityRecords = [
      {
        example: "Three Masks",
        seed: "three-masks-procedural-0",
        shapeId: "same_reward_different_costs",
        stage: "early",
        requirement: {
          payloadFamilies: ["card_draft"],
          selectorFamilies: ["card:predicate"],
          timingFamilies: ["immediate"],
        },
        operationEvidence: ["reward:card_draft", "target:card:predicate"],
      },
      {
        example: "Curator's Shelf",
        seed: "shop-test-4",
        shapeId: "shop_row",
        stage: "mid",
        requirement: {
          payloadFamilies: ["dreamsign_purchase", "resource_cost:essence"],
          selectorFamilies: ["dreamsign:exact"],
          timingFamilies: ["immediate"],
        },
        operationEvidence: [
          "cost:essence:fixed",
          "reward:dreamsign_purchase",
          "target:dreamsign:exact",
        ],
      },
      {
        example: "One Blessing, Three Vessels",
        seed: "m18-one-blessing-2",
        shapeId: "one_operation_many_targets",
        stage: "early",
        requirement: {
          payloadFamilies: ["card_transfigure"],
          selectorFamilies: ["card:exact"],
          timingFamilies: ["immediate"],
        },
        operationEvidence: ["reward:card_transfigure", "target:card:exact"],
        symmetryContracts: ["shared_operation_named_targets"],
      },
      {
        example: "Equal Shadow",
        seed: "m18-equal-shadow-1",
        shapeId: "same_cost_different_rewards",
        stage: "early",
        requirement: {
          payloadFamilies: ["bane_gain", "card_draft", "dreamsign_gain", "route_edit:add_site"],
          selectorFamilies: ["bane:exact", "card:predicate", "dreamsign:exact", "route_site:exact"],
          timingFamilies: ["immediate", "route:current_dreamscape"],
        },
        operationEvidence: [
          "burden:bane_gain",
          "reward:card_draft",
          "reward:dreamsign_gain",
          "route_edit:add_site",
        ],
        symmetryContracts: ["shared_burden_different_rewards"],
      },
      {
        example: "One Card, Three Masks",
        seed: "m18-one-card-three-masks-0",
        shapeId: "one_target_many_operations",
        stage: "early",
        requirement: {
          payloadFamilies: ["card_transfigure"],
          selectorFamilies: ["card:exact"],
          timingFamilies: ["immediate"],
        },
        operationEvidence: ["reward:card_transfigure", "target:card:exact"],
        symmetryContracts: ["shared_target_operations"],
      },
      {
        example: "Narrow Reservoir",
        seed: "m24-resource-0",
        shapeId: "same_cost_different_rewards",
        stage: "early",
        requirement: {
          payloadFamilies: ["resource_amount:random_range", "resource_cost:essence"],
          timingFamilies: ["immediate"],
        },
        operationEvidence: ["cost:essence:random_range"],
      },
      {
        example: "Atlas Locksmith",
        seed: "matrix-atlas-locksmith",
        shapeId: "alter_dreamscapes",
        stage: "late",
        requirement: {
          payloadFamilies: ["bane_gain", "resource", "route_edit:add_site", "route_edit:replace_site"],
          selectorFamilies: ["route_site:exact"],
          timingFamilies: ["route:current_dreamscape"],
        },
        operationEvidence: [
          "burden:bane_gain",
          "reward:resource",
          "route_edit:add_site",
          "route_edit:replace_site",
        ],
        symmetryContracts: ["shared_source_site_destinations"],
      },
      {
        example: "First Breath",
        seed: "m12-timed-window-0",
        shapeId: "timed_window_menu",
        stage: "mid",
        requirement: {
          payloadFamilies: ["battle_window_modifier"],
          timingFamilies: ["delayed:next 2 battles"],
        },
        operationEvidence: ["reward:battle_window_modifier"],
        symmetryContracts: ["shared_timing_different_rewards"],
      },
      {
        example: "Dreamwell Switch",
        seed: "m13-167",
        shapeId: "timed_window_menu",
        stage: "mid",
        requirement: {
          payloadFamilies: ["dreamwell_modifier"],
          timingFamilies: ["delayed:next 3 battles"],
        },
        operationEvidence: ["reward:dreamwell_modifier"],
        symmetryContracts: ["shared_timing_different_rewards"],
      },
      {
        example: "Shop Courtesy",
        seed: "m14-shop-courtesy-5",
        shapeId: "timed_window_menu",
        stage: "mid",
        requirement: {
          payloadFamilies: ["shop_economy_modifier", "resource_amount:restore_to_maximum"],
          timingFamilies: ["delayed"],
        },
        operationEvidence: [
          "reward:resource",
          "reward:shop_economy_modifier",
        ],
      },
      {
        example: "Sealed Hands",
        seed: "m14-sealed-hands-0",
        shapeId: "single_offer",
        stage: "late",
        requirement: {
          payloadFamilies: ["card_transform", "status"],
          timingFamilies: ["immediate"],
        },
        operationEvidence: ["reward:card_transform", "status:status_structural_constraint"],
      },
      {
        example: "Sleeping Contract",
        seed: "sleeping-contract",
        shapeId: "reward_after_trigger",
        stage: "early",
        requirement: {
          payloadFamilies: ["delayed_hook", "dreamsign_gain"],
          selectorFamilies: ["dreamsign:exact"],
          timingFamilies: ["trigger:site_visit"],
        },
        operationEvidence: ["delayed_hook:site_visit", "reward:dreamsign_gain"],
      },
      {
        example: "Borrowed Crown",
        seed: "organic-paired-return",
        shapeId: "paired_return",
        stage: "late",
        requirement: {
          payloadFamilies: ["paired_return", "dreamsign_temporary_grant"],
          selectorFamilies: ["dreamsign:exact"],
          timingFamilies: ["trigger:each_battle"],
        },
        operationEvidence: [
          "paired_return:borrowed_object_return",
          "reward:dreamsign_temporary_grant",
        ],
      },
      {
        example: "Covered Cups",
        seed: "covered-cups-3",
        shapeId: "single_random_outcome",
        stage: "mid",
        requirement: {
          payloadFamilies: ["random:reveal_rewards", "reveal_envelope"],
          timingFamilies: ["random"],
        },
        operationEvidence: ["random:reveal_rewards"],
      },
      {
        example: "Emergency Thread",
        seed: "m24-generated-16",
        shapeId: "one_target_many_operations",
        stage: "late",
        requirement: {
          payloadFamilies: ["generated_object", "generated_object:dreamsign"],
        },
        operationEvidence: [
          "generated_object:dreamsign",
          "reward:generated_object_grant",
        ],
      },
      {
        example: "Bottomless Bowl",
        seed: "bottomless-bowl-flat-trade",
        shapeId: "flat_escalating_trade",
        stage: "mid",
        requirement: {
          payloadFamilies: ["resource_cost:essence", "resource"],
          timingFamilies: ["immediate"],
        },
        operationEvidence: ["cost:essence:fixed", "reward:resource"],
        symmetryContracts: ["flat_escalating_trade"],
      },
      {
        example: "Covered Cups Reveal Menu",
        seed: "covered-cups-reveal-choice-menu",
        shapeId: "reveal_choice_menu",
        stage: "mid",
        requirement: {
          payloadFamilies: ["random:choose_one_revealed_reward", "random:gain_one_random_reward", "reveal_envelope"],
          timingFamilies: ["random"],
        },
        operationEvidence: [
          "random:choose_one_revealed_reward",
          "random:gain_one_random_reward",
        ],
      },
      {
        example: "Shared Prefix Menu",
        seed: "shared-prefix-menu-forced",
        shapeId: "shared_prefix_menu",
        stage: "mid",
        requirement: {
          payloadFamilies: ["bane_gain", "card_draft", "dreamsign_gain", "route_edit:add_site"],
          selectorFamilies: ["bane:exact", "card:predicate", "dreamsign:exact", "route_site:exact"],
        },
        operationEvidence: [
          "burden:bane_gain",
          "reward:card_draft",
          "reward:dreamsign_gain",
          "route_edit:add_site",
        ],
        symmetryContracts: ["shared_burden_different_rewards"],
      },
    ] satisfies readonly {
      example: string;
      seed: string;
      shapeId: JourneyShapeId;
      stage: JourneyStage;
      requirement: ReachabilityFamilyRequirement;
      operationEvidence: readonly string[];
      symmetryContracts?: readonly string[];
    }[];
    const normalBatch = reachabilityRecords.map((record) =>
      normalManifest(record.shapeId, record.seed, record.stage)
    );

    for (const [index, matrixRow] of reachabilityRecords.entries()) {
      const manifest = normalBatch[index]!;
      const operationTags = structuredOperationTags(manifest);

      expect(manifest.shapeId, matrixRow.example).toBe(matrixRow.shapeId);
      expect(
        findReachabilityEvidence([manifest], matrixRow.requirement).length,
        matrixRow.example,
      ).toBeGreaterThan(0);
      expect(operationTags, matrixRow.example).toEqual(
        expect.arrayContaining(matrixRow.operationEvidence),
      );
      expect(
        reachabilityFor(manifest).evidence.length,
        matrixRow.example,
      ).toBeGreaterThan(0);
      expect(reachabilityFor(manifest).generatorMode, matrixRow.example).toBe(
        "normal_generation",
      );
      expect(
        manifest.debug.symmetryContracts?.map((contract) => contract.contractKind) ?? [],
        matrixRow.example,
      ).toEqual(expect.arrayContaining(matrixRow.symmetryContracts ?? []));
    }

    const requiredPayloadFamilies = [
      "bane_gain",
      "battle_window_modifier",
      "card_draft",
      "card_transfigure",
      "delayed_hook",
      "dreamsign_gain",
      "dreamsign_purchase",
      "dreamwell_modifier",
      "generated_object",
      "paired_return",
      "random:reveal_rewards",
      "resource",
      "resource_amount:random_range",
      "route_edit:add_site",
      "route_edit:replace_site",
      "shop_economy_modifier",
      "status",
    ];
    const batchFamilies = batchReachabilityFamilies(normalBatch);

    expect(batchFamilies.payloadFamilies).toEqual(
      expect.arrayContaining(requiredPayloadFamilies),
    );
    expect(batchFamilies.selectorFamilies).toEqual(
      expect.arrayContaining([
        "bane:exact",
        "card:exact",
        "card:predicate",
        "dreamsign:exact",
        "route_site:exact",
      ]),
    );
  });

  it("counts staged semantic fingerprints and requires expanded payload identity", async () => {
    const content = await loadContent(process.cwd());
    const stages = ["early", "mid", "late"] as const;

    for (const stage of stages) {
      const manifests = Array.from({ length: 16 }, (_, index) => {
        const journeyContext = contextFromContent(
          content,
          `m24-diversity-${stage}-${index}`,
          stage,
        );
        const manifest = generateNextJourney({
          context: journeyContext,
          forcedStage: stage,
        });

        expect(validateJourneyManifest(manifest, journeyContext), `${stage}:${index}`).toEqual({
          ok: true,
        });
        return manifest;
      });
      const fingerprints = manifests.map((manifest) => manifest.distinctness.value);
      const payloadFamilies = new Set(
        manifests.flatMap((manifest) =>
          manifest.distinctness.explanation.payloadFamilies
        ),
      );
      const curatedVariantIds = new Set(
        manifests.flatMap((manifest) =>
          manifest.distinctness.explanation.curatedVariantIds
        ),
      );

      expect(new Set(fingerprints).size, stage).toBeGreaterThanOrEqual(14);
      expect(payloadFamilies.size, stage).toBeGreaterThanOrEqual(7);
      expect(curatedVariantIds.size, stage).toBeGreaterThanOrEqual(12);
      expect([...payloadFamilies], stage).toEqual(
        expect.arrayContaining(["bane", "card", "dreamsign", "hook", "random", "resource"]),
      );
      expect([...curatedVariantIds], stage).not.toEqual(["adapter/current"]);
      expect(
        manifests.every((manifest) =>
          manifest.distinctness.value === manifest.debug.semanticFingerprint.value
        ),
        stage,
      ).toBe(true);
    }
  });

  it("does not reproduce historical brainstorm transcript rows in normal batches", async () => {
    const content = await loadContent(process.cwd());
    const forbiddenRows = [
      "Buy {Ginger Root} for 85 essence.",
      "Buy {Cloud Lens} for 85 essence.",
      "Buy {Leather Satchel} for 85 essence.",
      "Pay all essence and transfigure all cards in your deck. End the Journey.",
      "Seal {Ginger Root}. Later, recover it and gain 120 essence.",
    ];
    const generatedRows = ["early", "mid", "late"].flatMap((stage) =>
      Array.from({ length: 24 }, (_, index) => {
        const journeyContext = contextFromContent(
          content,
          `m24-anti-hardcoding-${stage}-${index}`,
          stage as JourneyStage,
        );
        const manifest = generateNextJourney({
          context: journeyContext,
          forcedStage: stage as JourneyStage,
        });

        expect(validateJourneyManifest(manifest, journeyContext), `${stage}:${index}`).toEqual({
          ok: true,
        });
        expect(manifest.debug.debugPayload).toBeUndefined();
        return generatedOptionText(manifest);
      }).flat()
    );

    for (const forbiddenRow of forbiddenRows) {
      expect(generatedRows, forbiddenRow).not.toContain(forbiddenRow);
    }
  });

  it("checks new shapes and symmetric fill contracts through forced normal generation", async () => {
    const forcedRecords = [
      {
        shapeId: "flat_escalating_trade",
        seed: "bottomless-bowl-flat-trade",
        expectedContract: "flat_escalating_trade",
        expectedTags: ["cost:essence:fixed", "reward:resource"],
      },
      {
        shapeId: "reveal_choice_menu",
        seed: "covered-cups-reveal-choice-menu",
        expectedTags: [
          "random:choose_one_revealed_reward",
          "random:gain_one_random_reward",
        ],
      },
      {
        shapeId: "shared_prefix_menu",
        seed: "shared-prefix-menu-forced",
        expectedContract: "shared_burden_different_rewards",
        expectedTags: ["burden:bane_gain", "route_edit:add_site"],
      },
      {
        shapeId: "timed_window_menu",
        seed: "m13-167",
        expectedContract: "shared_timing_different_rewards",
        expectedTags: ["reward:dreamwell_modifier"],
      },
      {
        shapeId: "alter_dreamscapes",
        seed: "matrix-atlas-locksmith",
        expectedContract: "shared_source_site_destinations",
        expectedTags: ["route_edit:add_site", "route_edit:replace_site"],
      },
      {
        shapeId: "commit_now_future_payoff",
        seed: "m24-forced-shape-contracts",
        expectedContract: "shared_future_trigger_outcomes",
        expectedTags: ["reward:card_gain"],
      },
    ] satisfies readonly {
      shapeId: JourneyShapeId;
      seed: string;
      expectedContract?: string;
      expectedTags: readonly string[];
    }[];

    for (const record of forcedRecords) {
      const journeyContext = await context(record.seed);
      const manifest = fillForShapeAtStage(record.shapeId, journeyContext, "mid");

      expect(validateJourneyManifest(manifest, journeyContext), record.shapeId).toEqual({
        ok: true,
      });
      expect(manifest.debug.debugPayload, record.shapeId).toBeUndefined();
      expect(structuredOperationTags(manifest), record.shapeId).toEqual(
        expect.arrayContaining(record.expectedTags),
      );
      if (record.expectedContract) {
        expect(
          manifest.debug.symmetryContracts?.map((contract) => contract.contractKind) ?? [],
          record.shapeId,
        ).toContain(record.expectedContract);
      }
    }
  });

  it("marks debug fixture reachability separately from normal generation", async () => {
    const journeyContext = await context("matrix-debug-fixture");
    const forcedDebugPayload = {
      familyId: "dreamsign",
      variantId: "named-dreamsign-shop-row",
      qaId: "dreamsign/named-dreamsign-shop-row",
      coverageKind: "debug_fixture",
      description: "Named Dreamsign purchase rows for reachability matrix coverage.",
      supportedShapes: ["shop_row"],
      supportedStages: ["mid", "late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedShapeId: "shop_row",
      forcedStage: "mid",
      forcedDebugPayload,
    });
    const reachability = reachabilityFor(manifest);

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(reachability).toMatchObject({
      generatorMode: "forced_debug_fixture",
      evidenceSource: "structured_manifest_operations",
      shapeTopology: "direct_menu",
      debugFixture: {
        qaId: "dreamsign/named-dreamsign-shop-row",
        coverageKind: "debug_fixture",
      },
    });
    expect(reachability.payloadFamilies).toEqual(
      expect.arrayContaining(["dreamsign_purchase", "resource_cost"]),
    );
    expect(reachability.selectorFamilies).toEqual(
      expect.arrayContaining(["dreamsign:exact"]),
    );
  });

  slowIt("keeps every advertised debug payload shape forceable", async () => {
    const content = await loadContent(process.cwd());
    const contentVersion = "test-content-version";

    for (const family of DEBUG_PAYLOAD_FAMILIES) {
      for (const variant of family.variants) {
        if (variant.availability !== "available") {
          continue;
        }

        const supportedShapes =
          variant.supportedShapes === "all"
            ? JOURNEY_SHAPES.map((shape) => shape.id)
            : variant.supportedShapes;
        const forcedStage: JourneyStage =
          variant.supportedStages === "all"
            ? "mid"
            : variant.supportedStages[0]!;
        const forcedDebugPayload = {
          familyId: family.id,
          variantId: variant.id,
          qaId: variant.qaId,
          description: variant.description,
          supportedShapes: variant.supportedShapes,
          supportedStages: variant.supportedStages,
        } satisfies DebugPayloadSelection;

        for (const shapeId of supportedShapes) {
          const state = createInitialJourneyState({
            seed: `debug-payload-matrix:${variant.qaId}:${shapeId}`,
            content,
            contentVersion,
          });
          const journeyContext = buildJourneyContext({
            projectRoot: process.cwd(),
            content,
            state,
            contentVersion,
          });
          const manifest = generateNextJourney({
            context: journeyContext,
            forcedShapeId: shapeId,
            forcedStage,
            forcedDebugPayload,
          });

          expect(
            validateJourneyManifest(manifest, journeyContext),
            `${variant.qaId}:${shapeId}`,
          ).toEqual({ ok: true });
          expect(
            manifest.debug.debugPayload,
            `${variant.qaId}:${shapeId}`,
          ).toMatchObject({
            qaId: variant.qaId,
            source: "forced",
          });
        }
      }
    }
  }, 180000);

  it("forces deterministic reveal, roll, range, pool, push, and wager payload envelopes", async () => {
    const journeyContext = await context("random-reveal-roll-wager");
    const randomPayload = {
      familyId: "random",
      variantId: "reveal-roll-wager",
      qaId: "random/reveal-roll-wager",
      description: "Reveal, roll, and wager payload coverage.",
      supportedShapes: ["single_random_outcome", "resolved_random_series"],
      supportedStages: ["late"],
    } satisfies DebugPayloadSelection;
    const first = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: randomPayload,
    });
    const second = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: randomPayload,
    });
    const kinds = first.precommitted.random?.map((entry) => entry.kind) ?? [];

    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(validateJourneyManifest(first, journeyContext)).toEqual({
      ok: true,
    });
    expect(first.debug.debugPayload).toMatchObject({
      qaId: "random/reveal-roll-wager",
      source: "forced",
    });
    expect(kinds).toEqual(
      expect.arrayContaining([
        "visible_pool",
        "random_cost",
        "random_reward",
        "chance_to_gain_bane",
        "chance_to_pay_cost",
        "reveal_rewards",
        "choose_one_revealed_reward",
        "choose_one_random_revealed_reward",
        "gain_one_random_reward",
        "roll_twice_keep_one",
        "repeated_pool_draws",
        "random_range",
        "wager",
        "probability_ladder",
        "push_choice",
        "resolved_random_series",
      ]),
    );
    expect(first.options.map((option) => option.text).join(" ")).toMatch(
      /\d+% chance/u,
    );
    expect(first.options.map((option) => option.text).join(" ")).toMatch(
      /\d+-\d+ random essence/u,
    );
    expect(first.precommitted.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "reveal_envelope",
          role: "random",
          value: expect.objectContaining({
            expectedConvertedEssence: expect.any(Number),
            riskPremiumConvertedEssence: expect.any(Number),
          }),
        }),
        expect.objectContaining({
          operationKind: "random_envelope",
          role: "random",
          payload: expect.objectContaining({
            visibilityPolicy: expect.objectContaining({
              outcomeVisibility: expect.stringMatching(
                /^(visible|hidden_until_resolution|delayed|pre_rolled|resolved)$/u,
              ),
              disclosure: expect.any(String),
            }),
          }),
        }),
      ]),
    );
  });

  it("rejects incoherent random envelope metadata with stable rule IDs", async () => {
    const journeyContext = await context("random-envelope-invalid");
    const randomPayload = {
      familyId: "random",
      variantId: "reveal-roll-wager",
      qaId: "random/reveal-roll-wager",
      description: "Reveal, roll, and wager payload coverage.",
      supportedShapes: ["single_random_outcome", "resolved_random_series"],
      supportedStages: ["late"],
    } satisfies DebugPayloadSelection;
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedStage: "late",
      forcedDebugPayload: randomPayload,
    });

    const withRandom = (
      updater: (entry: Record<string, unknown>) => Record<string, unknown>,
      kind: string,
    ): JourneyManifest => ({
      ...manifest,
      precommitted: refreshPrecommittedOperations({
        random: (manifest.precommitted.random ?? []).map((entry) =>
          entry.kind === kind ? updater(entry) : entry,
        ),
      }),
    });

    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            odds: { numerator: 0, denominator: 100, percent: 0 },
          }),
          "wager",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "invalid_random_odds",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            rewards: [],
          }),
          "visible_pool",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "empty_random_pool",
    });
    expect(
      validateJourneyManifest(
        withRandom((entry) => {
          const { visibilityPolicy: _visibilityPolicy, ...rest } = entry;

          return rest;
        }, "gain_one_random_reward"),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "hidden_outcome_disclosure",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            visibilityPolicy: {
              outcomeVisibility: "secret_forever",
              disclosure: "Unknown.",
              playerVisible: false,
            },
          }),
          "gain_one_random_reward",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "invalid_random_visibility",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            replacement: "invented_replacement",
          }),
          "visible_pool",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "invalid_random_replacement_policy",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            revealCount: 999,
          }),
          "reveal_rewards",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "incoherent_reveal_count",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            constraints: [
              {
                constraintKind: "shape_invariant",
                shapeId: "single_random_outcome",
              },
            ],
          }),
          "roll_twice_keep_one",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "invalid_random_envelope_constraint",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            minimum: 9,
            maximum: 3,
            committedAmount: 5,
          }),
          "random_range",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "incoherent_random_range_bounds",
    });
    expect(
      validateJourneyManifest(
        withRandom((entry) => {
          const { committedAmount: _committedAmount, ...rest } = entry;

          return rest;
        }, "random_range"),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "incoherent_random_range_bounds",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            minimum: 1,
            maximum: 3,
            committedAmount: 9,
          }),
          "random_range",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "incoherent_random_range_bounds",
    });
    expect(
      validateJourneyManifest(
        withRandom(
          (entry) => ({
            ...entry,
            rolls: [3, 7],
            keptRoll: 99,
          }),
          "roll_twice_keep_one",
        ),
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "invalid_roll_twice_payload",
    });
    expect(
      validateJourneyManifest(
        {
          ...manifest,
          precommitted: refreshPrecommittedOperations({
            ...manifest.precommitted,
            random: [
              ...(manifest.precommitted.random ?? []),
              {
                kind: "magic_scenario_roll",
                visibilityPolicy: {
                  outcomeVisibility: "visible",
                  disclosure: "Unknown magic scenario.",
                  playerVisible: true,
                },
              },
            ],
          }),
        },
        journeyContext,
      ),
    ).toMatchObject({
      ok: false,
      rule: "unknown_random_envelope_kind",
    });
  });

  it("rejects deterministic reward metadata masquerading as a wager", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_wager", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        {
          ...manifest.options[0]!,
          text: "Pay 30 essence. Gain the precommitted reward: 110 essence.",
        },
        manifest.options[1]!,
      ],
      precommitted: refreshPrecommittedOperations({
        random: [
          {
            kind: "wager",
            stake: { kind: "essence", amount: 30 },
            success: { kind: "gain_essence", amount: 110 },
            failure: { kind: "no_reward" },
            odds: {
              numerator: 50,
              denominator: 100,
              percent: 50,
            },
            visibilityPolicy: {
              outcomeVisibility: "visible",
              disclosure: "The wager outcome is visible.",
              playerVisible: true,
            },
          },
        ],
      }),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "reward_outcome_is_bounded_random_envelope",
    });
  });

  it("requires delayed hook outcomes to be precommitted", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {},
    };

    expect(manifest.precommitted.delayed).toHaveLength(manifest.options.length);
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("rejects delayed hook contracts missing selector, duration, expiration, or controlled scene metadata", async () => {
    const journeyContext = await context("delayed-hook-required-fields");
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const fields = [
      ["triggerSelector", "invalid_hook_trigger"],
      ["duration", "invalid_hook_duration"],
      ["expiration", "invalid_hook_expiration"],
      ["controlledScene", "invalid_hook_resolution"],
    ] as const;

    for (const [field, rule] of fields) {
      const invalidHook = {
        ...(manifest.precommitted.delayed?.[0] as Record<string, unknown>),
      };
      delete invalidHook[field];
      const invalid: JourneyManifest = {
        ...manifest,
        precommitted: refreshPrecommittedOperations({
          ...manifest.precommitted,
          delayed: [
            invalidHook,
            ...(manifest.precommitted.delayed ?? []).slice(1),
          ],
        }),
      };

      expect(validateJourneyManifest(invalid, journeyContext), field).toMatchObject({
        ok: false,
        rule,
      });
    }
  });

  it("keeps route edits manifest-only and requires committed route metadata", async () => {
    const journeyContext = await context();
    const routeBefore = stableStringify(journeyContext.state.quest.route);
    const manifest = fillForShape("alter_dreamscapes", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {},
    };

    expect(stableStringify(journeyContext.state.quest.route)).toBe(routeBefore);
    expect(
      manifest.options.flatMap((option) => option.routeEffects),
    ).toHaveLength(3);
    expect(manifest.precommitted.routeEdits).toEqual(
      manifest.options.flatMap((option) => option.routeEffects),
    );
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("fills normal route edits from a reusable legal transition catalog", async () => {
    const catalog = routeEditCatalog();
    const catalogPayloads = catalog.map((entry) => entry.payload);

    expect(new Set(catalogPayloads.map((payload) => payload.routeOperationKind))).toEqual(
      new Set([
        "add_site",
        "remove_site",
        "replace_site",
        "purge_site",
        "probability_adjustment",
      ]),
    );
    expect(new Set(catalogPayloads.map((payload) => payload.routePolarity))).toEqual(
      new Set(["positive", "negative", "neutral"]),
    );

    const manifests = await Promise.all(
      Array.from({ length: 12 }, async (_, index) =>
        fillForShape("alter_dreamscapes", await context(`route-catalog-${index}`))
      ),
    );
    const normalPayloads = manifests.flatMap((manifest) =>
      manifest.precommitted.routeEdits ?? []
    ) as Record<string, unknown>[];
    const normalOperations = new Set(
      normalPayloads.map((payload) => payload.routeOperationKind),
    );
    const normalScopes = new Set(
      normalPayloads.map((payload) => payload.routeScope),
    );
    const normalSites = new Set(
      normalPayloads.flatMap((payload) =>
        [payload.siteType, payload.fromSite, payload.toSite].filter(
          (entry): entry is string => typeof entry === "string",
        )
      ),
    );

    expect(normalPayloads).toHaveLength(36);
    expect(normalOperations.size).toBeGreaterThanOrEqual(3);
    expect(normalScopes.size).toBeGreaterThanOrEqual(2);
    expect(normalSites.size).toBeGreaterThanOrEqual(5);
    expect(
      normalPayloads.every(
        (payload) =>
          typeof payload.siteDeltaValue === "number" &&
          typeof payload.timing === "string" &&
          typeof payload.description === "string",
      ),
    ).toBe(true);
  });

  it("builds broader three-option route menus from controlled route variants", async () => {
    const drawContext = {
      seed: "route-menu-variants",
      contentVersion: "test-content-version",
      rootJourneyIndex: 0,
    };
    const payloadsFor = (variantId: RouteEditMenuVariantId) =>
      routeEditMenuRewards({
        drawContext,
        label: `route-menu:${variantId}`,
        variantId,
      }).rewards.map((reward) => reward.payload);
    const currentMapInk = payloadsFor("shared-current-draft-replacement");
    const mapFold = payloadsFor("map-fold");
    const atlasLocksmith = payloadsFor("atlas-locksmith");
    const atlasNeedle = routeEditMenuRewards({
      drawContext,
      label: "route-menu:atlas-needle",
      variantId: "atlas-needle",
    });
    const negativeSitePruning = payloadsFor("negative-site-pruning");

    for (const payloadGroup of [
      currentMapInk,
      mapFold,
      atlasLocksmith,
      atlasNeedle.rewards.map((reward) => reward.payload),
      negativeSitePruning,
    ]) {
      expect(validateRouteEffects(payloadGroup)).toEqual({ ok: true });
    }

    expect(currentMapInk).toHaveLength(3);
    expect(
      currentMapInk.every((payload) =>
        payload.routeOperationKind === "replace_site" &&
        payload.routeScope === "current_dreamscape" &&
        payload.fromSite === "Draft" &&
        payload.toSite !== "Draft"
      ),
    ).toBe(true);
    expect(new Set(currentMapInk.map((payload) => payload.toSite)).size).toBe(3);
    expect(mapFold).toHaveLength(3);
    expect(new Set(mapFold.map((payload) => payload.routeScope))).toEqual(
      new Set([
        "current_dreamscape",
        "next_dreamscape",
        "future_dreamscapes",
      ]),
    );
    expect(mapFold.every((payload) => payload.routePolarity === "positive")).toBe(
      true,
    );
    expect(
      mapFold.every((payload) =>
        ["add_site", "replace_site", "probability_adjustment"].includes(
          String(payload.routeOperationKind),
        )
      ),
    ).toBe(true);
    expect(atlasLocksmith).toHaveLength(3);
    expect(
      atlasLocksmith.every(
        (payload) =>
          payload.routeScope === "current_dreamscape" &&
          payload.routePolarity === "positive" &&
          ["add_site", "replace_site"].includes(
            String(payload.routeOperationKind),
          ),
      ),
    ).toBe(true);
    expect(atlasNeedle.sharedProperty).toBe("compound current_dreamscape route edits");
    expect(atlasNeedle.rewards.map((reward) => reward.companion)).toEqual([
      undefined,
      "small_omen_reward",
      "bane_burden",
    ]);
    expect(
      atlasNeedle.rewards.every(
        (reward) =>
          reward.payload.routeScope === "current_dreamscape" &&
          reward.payload.routePolarity === "positive",
      ),
    ).toBe(true);
    expect(negativeSitePruning).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeOperationKind: "remove_site",
          routeScope: "full_atlas",
          allMatchingSiteType: true,
          routePolarity: "negative",
        }),
        expect.objectContaining({
          routeOperationKind: expect.stringMatching(/^(purge_site|remove_site)$/u),
          routeScope: "current_dreamscape",
          routePolarity: "negative",
        }),
      ]),
    );
  });

  it.each([
    "Journey name: The Glass Orchard. Gain 45 essence.",
    "Event name: The Glass Orchard. Gain 45 essence.",
    "The Glass Orchard: Gain 45 essence.",
  ])(
    "rejects normal output text requiring narrative names: %s",
    async (text) => {
      const journeyContext = await context();
      const manifest = fillForShape("single_reward", journeyContext);
      const invalid: JourneyManifest = {
        ...manifest,
        options: manifest.options.map((option) => ({ ...option, text })),
      };

      expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
        ok: false,
        rule: "normal_output_narrative_name",
      });
    },
  );

  it.each([
    "Draft 1 of 6 selected-tide cards.",
    "Draft 1 of 6 selected tide cards.",
    "Choose one of 3 tidal Dreamsigns.",
    "Apply Bronze to a chosen matching tide card.",
    "Apply Bronze to a chosen card from matching tides.",
  ])("rejects normal output text referencing tides: %s", async (text) => {
    const journeyContext = await context();
    const manifest = fillForShape("single_reward", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.map((option) => ({ ...option, text })),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "normal_output_tide_reference",
    });
  });

  it.each([
    ["normal_output_shape_line", "Shape: leaked implementation detail."],
    ["normal_output_narrative_name", "The Glass Orchard: Gain 1 omen."],
    ["normal_output_tide_reference", "Choose one of 3 tidal Dreamsigns."],
  ])("rejects invalid normal tree branch text for %s", async (rule, text) => {
    const journeyContext = await context();
    const manifest = fillForShape("prize_ladder", journeyContext);
    const invalid = structuredClone(manifest);

    invalid.tree!.nodes[0]!.branches[0]!.text = text;

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule,
    });
  });
});

describe("repairOrFallbackJourney", () => {
  it("records deterministic repairs when validation fails", async () => {
    const journeyContext = await context();
    const base = fillForShape("single_offer", journeyContext);
    const invalid: JourneyManifest = {
      ...base,
      options: base.options.map((option) =>
        option.number === 1
          ? {
              ...option,
              costs: [{ kind: "essence", amount: 9999, timing: "immediate" }],
              costConvertedEssence: 9999,
              netConvertedEssence:
                option.effectConvertedEssence -
                9999 +
                option.burdenConvertedEssence +
                option.uncertaintyConvertedEssence,
            }
          : option,
      ),
    };
    const failed = validateJourneyManifest(invalid, journeyContext);

    expect(failed).toMatchObject({
      ok: false,
      rule: "unpayable_immediate_cost",
    });

    const repaired = repairOrFallbackJourney(invalid, journeyContext, failed);
    const repairedAgain = repairOrFallbackJourney(
      invalid,
      journeyContext,
      failed,
    );

    expect(validateJourneyManifest(repaired, journeyContext)).toEqual({
      ok: true,
    });
    expect(stableStringify(repaired)).toBe(stableStringify(repairedAgain));
    expect(repaired.debug.repairs.length).toBeGreaterThan(0);
    expect(repaired.debug.repairs.at(-1)).toMatchObject({
      failedRule: "unpayable_immediate_cost",
      actionCategory: "adjusted",
      result: "repaired",
    });
    expect(repaired.debug.validation.ok).toBe(true);
    expect(repaired.debug.repair).toMatchObject({
      status: "adjusted",
      finalShapeId: repaired.shapeId,
    });
  });

  it("repairs delayed payload families before switching topology", async () => {
    const journeyContext = await context();
    const base = fillForShape("now_vs_later", journeyContext);
    const invalid: JourneyManifest = {
      ...base,
      precommitted: {
        ...base.precommitted,
        delayed: [],
      },
    };
    const failed = validateJourneyManifest(invalid, journeyContext);

    expect(failed).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });

    const repaired = repairOrFallbackJourney(invalid, journeyContext, failed);

    expect(validateJourneyManifest(repaired, journeyContext)).toEqual({
      ok: true,
    });
    expect(repaired.shapeId).toBe("now_vs_later");
    expect(repaired.debug.repairs[0]).toMatchObject({
      action: "repair_delayed_hook_payload_family",
      result: "repaired",
    });
    expect(repaired.debug.repairs.map((entry) => entry.action)).not.toContain(
      "replace_delayed_hook",
    );
  });

  it("uses shape repair preferences when there is no typed failure-specific repair", async () => {
    const journeyContext = await context();
    const base = fillForShape("curated_reward_trio", journeyContext);
    const invalid: JourneyManifest = {
      ...base,
      options: base.options.map((option) => ({
        ...option,
        effects: [],
        effectConvertedEssence: 0,
        burdenConvertedEssence: -80,
        netConvertedEssence: -80,
      })),
    };
    const failed = validateJourneyManifest(invalid, journeyContext);

    expect(failed).toMatchObject({
      ok: false,
      rule: "negative_only_positive_scene",
    });

    const repaired = repairOrFallbackJourney(invalid, journeyContext, failed);

    expect(validateJourneyManifest(repaired, journeyContext)).toEqual({
      ok: true,
    });
    expect(repaired.shapeId).toBe("curated_reward_trio");
    expect(repaired.debug.repairs[0]).toMatchObject({
      action: "replace_nonpositive_option",
      result: "repaired",
    });
  });

  it("records whether typed payload failures regenerated, simplified, or forced failure metadata", async () => {
    const journeyContext = await context("typed-repair-metadata");
    const base = fillForShape("timed_window_menu", journeyContext);
    const invalidPayload: JourneyOperation = {
      operationId: "test:dreamwell:bad-count",
      operationKind: "reward",
      role: "reward",
      rewardKind: "dreamwell_modifier",
      visibility: "visible",
      payload: {
        kind: "dreamwell_modifier",
        dreamwellScope: "battle_window",
        dreamwellOperationKind: "bonus_card_count",
        count: 0,
        cardRole: "bonus",
        phaseSelector: "first_draw",
        playerVisibility: "visible",
      },
    };
    const invalid: JourneyManifest = {
      ...base,
      options: base.options.map((option, index) =>
        index === 0
          ? {
              ...option,
              operations: [invalidPayload],
            }
          : option,
      ),
    };
    const failed = validateJourneyManifest(invalid, journeyContext);

    expect(failed).toMatchObject({
      ok: false,
      rule: "dreamwell_count_invalid",
    });

    const repaired = repairOrFallbackJourney(invalid, journeyContext, failed);

    expect(validateJourneyManifest(repaired, journeyContext)).toEqual({
      ok: true,
    });
    expect(repaired.shapeId).toBe("timed_window_menu");
    expect(repaired.debug.repairs[0]).toMatchObject({
      action: "repair_timed_window_payload_family",
      actionCategory: "replaced",
      result: "repaired",
    });
    expect(repaired.debug.repair).toMatchObject({
      status: "replaced",
      disposition: "payload_regenerated",
      action: "repair_timed_window_payload_family",
    });

    const forced = repairOrFallbackJourney(invalid, journeyContext, failed, {
      forcedShape: true,
    });

    expect(forced.shapeId).toBe("timed_window_menu");
    expect(forced.debug.repair).toMatchObject({
      forcedShape: true,
      finalShapeId: "timed_window_menu",
    });

    const delayedContext = await context("typed-repair-forced-failure");
    delayedContext.state.quest.route.unresolvedHooks = ["a", "b", "c", "d"];
    const impossibleShape = fillForShape("reward_after_trigger", delayedContext);
    const impossibleFailure = validateJourneyManifest(
      impossibleShape,
      delayedContext,
    );

    expect(impossibleFailure).toMatchObject({
      ok: false,
      rule: "delayed_hook_over_persistence_budget",
    });
    const forcedFailed = repairOrFallbackJourney(
      impossibleShape,
      delayedContext,
      impossibleFailure,
      { forcedShape: true },
    );

    expect(forcedFailed.shapeId).toBe("reward_after_trigger");
    expect(forcedFailed.debug.repair).toMatchObject({
      status: "forced_shape_failed",
      disposition: "forced_to_fail",
      finalShapeId: "reward_after_trigger",
    });
  });
});
