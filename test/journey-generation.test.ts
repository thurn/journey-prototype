import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import {
  DEBUG_PAYLOAD_FAMILIES,
  type DebugPayloadSelection,
} from "../src/journey/debugPayloads.js";
import {
  BANE_NAMES,
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
  costSlots,
  draftCards,
  option,
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
} from "../src/journey/fillers/dreamsignPayloads.js";
import { namedDreamsignShopRowCandidateGroups } from "../src/journey/shapes/shop_row/dreamsignSelection.js";
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
import { repairOrFallbackJourney } from "../src/journey/repair.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "../src/journey/shapes.js";
import {
  buildValidationReport,
  validateJourneyManifest,
} from "../src/journey/validate/index.js";
import { validateRouteEffects } from "../src/journey/validate/payloadContracts.js";
import {
  evaluateOptionValue,
  valueBaneGain,
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

describe.concurrent("generateNextJourney", () => {
  it("creates J-000001 and deterministic byte-stable manifest data", async () => {
    const journeyContext = await context();
    const first = generateNextJourney({ context: journeyContext });
    const second = generateNextJourney({ context: journeyContext });

    expect(first.journeyId).toBe("J-000001");
    expect(first.schemaVersion).toBe(2);
    expect(first.versions).toMatchObject({
      contentVersion: "test-content-version",
      shapeCatalogVersion: "journey-shapes:v16",
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

  it("does not substitute generated-object menus during natural generation", async () => {
    const content = await loadContent(process.cwd());
    const indexes = Array.from({ length: 24 }, (_entry, index) => index);
    const generatedCounts = (stage: "early" | "late") =>
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

    expect(generatedCounts("early")).toBe(0);
    expect(generatedCounts("late")).toBe(0);
  });

  it("builds one_target_many_operations as three operations on one target", async () => {
    const journeyContext = await context("otmo-fill-1");
    const manifest = generateNextJourney({
      context: journeyContext,
      forcedShapeId: "one_target_many_operations",
    });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({
      ok: true,
    });
    expect(manifest.generatedObjects).toEqual([]);
    const optionTexts = manifest.options.map((optionEntry) => optionEntry.text);
    expect(optionTexts).toHaveLength(3);
    expect(new Set(optionTexts).size).toBe(3);
    expect(optionTexts.every((text) => text.includes("Warriors"))).toBe(true);
    expect(manifest.debug.symmetryContracts).toEqual([
      expect.objectContaining({
        contractKind: "shared_axis_rotated_attribute",
        sharedPayloadKeys: ["predicate:warriors"],
        variedPayloadKeys: expect.arrayContaining([
          "duplicate_random_predicate",
          "apply_named_transfiguration_to_random_predicate_cards",
          "draft_2_predicate_cards_from_4",
        ]),
      }),
    ]);
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
      "transfiguration",
    ] satisfies Exclude<GeneratedObjectDefinition["generatedObjectKind"], "dreamsign" | "status">[]) {
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

  it("does not build generated Dreamsign or status definitions", async () => {
    const journeyContext = await context("generated-ds-disabled");

    expect(() =>
      buildGeneratedObjectDefinition({
        kind: "dreamsign",
        drawContext: {
          seed: "generated-ds-disabled",
          contentVersion: journeyContext.contentVersion,
          rootJourneyIndex: 0,
        },
        shapeId: "one_target_many_operations",
        stage: "late",
        cards: [],
        dreamsigns: [],
      }),
    ).toThrow("Generated Dreamsign and status definitions are not supported");

    expect(() =>
      buildGeneratedObjectDefinition({
        kind: "status",
        drawContext: {
          seed: "generated-object-disabled",
          contentVersion: journeyContext.contentVersion,
          rootJourneyIndex: 0,
        },
        shapeId: "one_target_many_operations",
        stage: "late",
        cards: [],
        dreamsigns: [],
      }),
    ).toThrow("Generated Dreamsign and status definitions are not supported");
  });

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

  it("keeps forced Bane debug fixtures valid for service_menu", async () => {
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
    const resolved = attachTargetResolutionMetadata(
      manifest,
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(validateJourneyManifest(resolved, journeyContext)).toMatchObject({
      ok: true,
    });
  });


  it("generates Thin Air and Bane Ledger Bane structures normally", async () => {
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

    expect(thinAir).toBeDefined();
    expect(baneLedger).toBeDefined();
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

  it("rejects shop hook contracts over the persistence budget", async () => {
    const journeyContext = await context("route-status-validation");
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

});
