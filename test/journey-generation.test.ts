import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import type { DebugPayloadSelection } from "../src/journey/debugPayloads.js";
import { attachTargetResolutionMetadata } from "../src/journey/effects.js";
import { buildConservativeJourneyForShape } from "../src/journey/fillers.js";
import { generateNextJourney } from "../src/journey/generate.js";
import type { JourneyManifest } from "../src/journey/manifest.js";
import {
  adaptJourneyOptionOperations,
  adaptPrecommittedOperations,
} from "../src/journey/operationAdapters.js";
import { repairOrFallbackJourney } from "../src/journey/repair.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "../src/journey/shapes.js";
import { buildValidationReport, validateJourneyManifest } from "../src/journey/validate.js";
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

const runDiversityAudit = process.env.JOURNEY_DIVERSITY_AUDIT === "1";
const diversityAuditIt = runDiversityAudit ? it : it.skip;

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

  state.quest.resources.dreamscape = stage === "early" ? 1 : stage === "mid" ? 2 : 4;

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

function fillForShape(shapeId: JourneyShapeId, journeyContext: Awaited<ReturnType<typeof context>>) {
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
      .filter(([key]) => ![
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
      ].includes(key))
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, entry]) => [key, normalizeMechanical(entry)]),
  );
}

function randomPrecommitForOption(manifest: JourneyManifest, optionNumber: number): unknown {
  const random = manifest.precommitted.random;

  if (!Array.isArray(random)) {
    return undefined;
  }

  return random.find((entry) =>
    typeof entry === "object" &&
      entry !== null &&
      "optionNumber" in entry &&
      entry.optionNumber === optionNumber
  ) ?? random[optionNumber - 1];
}

function exactVisibleSignature(manifest: JourneyManifest): string {
  return stableStringify({
    shape: manifest.shapeId,
    options: manifest.options.map((option) => option.text),
    rewardPool: manifest.rewardPool?.summary,
    tree: manifest.tree?.nodes.map((node) =>
      node.branches.map((branch) => branch.text)
    ),
  });
}

function mechanicalSignature(manifest: JourneyManifest): string {
  return stableStringify(normalizeMechanical({
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
      }))
    ),
  }));
}

function structuralSignature(manifest: JourneyManifest): string {
  return stableStringify(normalizeMechanical({
    shape: manifest.shapeId,
    options: manifest.options.map((option) => ({
      costKinds: option.costs.map((entry) =>
        typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
      ),
      effectKinds: option.effects.map((entry) =>
        typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
      ),
      burdenKinds: option.burdens.map((entry) =>
        typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
      ),
      targetKinds: option.targets.map((entry) =>
        typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
      ),
      triggerKinds: option.triggers.map((entry) =>
        typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
      ),
      routeKinds: option.routeEffects.map((entry) =>
        typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
      ),
      pickBehavior: option.pickBehavior,
    })),
    tree: manifest.tree?.nodes.map((node) =>
      node.branches.map((branch) => ({
        label: branch.label,
        kind: branch.kind,
        costKinds: branch.costs.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
        ),
        effectKinds: branch.effects.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
        ),
        burdenKinds: branch.burdens.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
        ),
        targetKinds: branch.targets.map((entry) =>
          typeof entry === "object" && entry !== null && "kind" in entry ? entry.kind : "unknown"
        ),
        hasOdds: branch.odds ? true : false,
        next: branch.nextNodeId ? true : false,
        terminal: branch.terminal?.outcome,
      }))
    ),
  }));
}

function payloadCount(value: {
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  burdens?: readonly unknown[];
  targets?: readonly unknown[];
  triggers?: readonly unknown[];
  routeEffects?: readonly unknown[];
}): number {
  return (value.costs?.length ?? 0) +
    (value.effects?.length ?? 0) +
    (value.burdens?.length ?? 0) +
    (value.targets?.length ?? 0) +
    (value.triggers?.length ?? 0) +
    (value.routeEffects?.length ?? 0);
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

function refreshOptionOperations(option: JourneyManifest["options"][number]): JourneyManifest["options"][number] {
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

function forcedDreamsignOperationManifest(journeyContext: Awaited<ReturnType<typeof context>>) {
  const dreamsignPayload = {
    familyId: "dreamsign",
    variantId: "dreamsign-transform-duplicate-pool",
    qaId: "dreamsign/dreamsign-transform-duplicate-pool",
    description: "Dreamsign transform, duplicate, pool, random, trigger, and trade payload coverage.",
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
    expect(weightedChoice(drawContext, "choice", [
      { item: "low", weight: 1 },
      { item: "high", weight: 10 },
    ])).toBe(weightedChoice(drawContext, "choice", [
      { item: "low", weight: 1 },
      { item: "high", weight: 10 },
    ]));
    expect(shuffleDeterministic(drawContext, "shuffle", items)).toEqual(
      shuffleDeterministic(drawContext, "shuffle", items),
    );
    expect(items).toEqual(["a", "b", "c", "d"]);
    expect(deterministicTieJitter(drawContext, "tie", 2)).toBeGreaterThanOrEqual(-2);
    expect(deterministicTieJitter(drawContext, "tie", 2)).toBeLessThanOrEqual(2);
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
      shapeCatalogVersion: "journey-shapes:v9",
      effectCatalogVersion: "effects:v3",
      valueModelVersion: "value:v6",
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
    expect(validateJourneyManifest(first, journeyContext)).toEqual({ ok: true });
  });

  it("keeps generated references resolvable and normal text mechanical", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
    for (const option of manifest.options) {
      expect(option.text).not.toContain("Shape:");
      expect(option.text).not.toContain("Dream Journey");
    }
  });

  it("keeps every canonical shape eligible for a fresh first Journey", async () => {
    const journeyContext = await context();
    const expectedShapeIds = new Set(JOURNEY_SHAPES.map((shape) => shape.id));
    const seenShapeIds = new Set<JourneyShapeId>();

    for (let index = 0; index < 1000 && seenShapeIds.size < expectedShapeIds.size; index += 1) {
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
      expect(Math.min(...manifest.debug.shapeScores.map((entry) => entry.score))).toBeGreaterThan(0);
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

    expect(scores.one_operation_many_targets).toBeGreaterThan(scores.escalating_reward_chain);
    expect(scores.curated_reward_trio).toBeGreaterThan(scores.single_offer);
    expect(scores.same_cost_different_rewards).toBeGreaterThan(scores.probability_ladder);
    expect(Math.min(...manifest.debug.shapeScores.map((entry) => entry.score))).toBeGreaterThan(0);
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

    expect(() => generateNextJourney({
      context: journeyContext,
      forcedShapeId: "single_reward",
      forcedStage: "mid",
      forcedDebugPayload: constrainedPayload,
    })).toThrow(
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
          supportedStages: variant.expectedKind === "status" ? ["mid", "late"] : ["late"],
        } satisfies DebugPayloadSelection,
      });
      const definition = manifest.generatedObjects[0]!;
      const operations = manifest.options.flatMap((option) => option.operations);

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
      expect(operations.map((operation) => operation.targetSelector?.selectorKind)).toContain("generated_object");
      expect(operations.map((operation) => operation.targetResolution?.sourcePool)).toContain("manifest_generated");
      expect(manifest.precommitted.delayed).toHaveLength(1);
      expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
    }
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
      journeyOption.operations.flatMap((operation) => operation.value?.bands ?? [])
    );
    const valueBandComponents = manifest.debug.optionValues.flatMap((entry) =>
      entry.components.filter((component) => component.kind === "value-band")
    );

    expect(operationBands.map((band) => band.id)).toEqual(expect.arrayContaining([
      "maximum",
      "percentage",
      "all_remaining",
      "random_range",
      "cap_change",
      "multi_omen",
    ]));
    expect(operationBands.map((band) => band.label)).toEqual(expect.arrayContaining([
      "all-remaining",
      "random-range",
      "cap-change",
      "multi-omen",
    ]));
    expect(valueBandComponents.map((component) => component.label)).toEqual(expect.arrayContaining([
      expect.stringContaining("maximum"),
      expect.stringContaining("percentage"),
      expect.stringContaining("all_remaining"),
      expect.stringContaining("random_range"),
      expect.stringContaining("cap_change"),
      expect.stringContaining("multi_omen"),
    ]));
    expect(manifest.shapeId).toBe("service_menu");
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
    expect(manifest.options.flatMap((option) => option.operations)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationKind: "reward",
        resourceSemantics: expect.objectContaining({ amountKind: "restore_to_maximum" }),
      }),
      expect.objectContaining({
        operationKind: "cost",
        resourceSemantics: expect.objectContaining({ amountKind: "all_remaining" }),
      }),
      expect.objectContaining({
        operationKind: "burden",
        burdenKind: "reward_reduction",
      }),
    ]));
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

    expect(percentageOfCurrentCost).toEqual(expect.objectContaining({
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
    }));
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
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationKind: "burden",
        burdenKind: "bane_gain",
        targetSelector: expect.objectContaining({ selectorKind: "bane", source: "vocabulary" }),
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
        payload: expect.objectContaining({ baneTargetContext: "manifest_obligation" }),
      }),
      expect.objectContaining({
        operationKind: "reward",
        rewardKind: "bane_transform_to_card",
      }),
    ]));
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
    const manifest = JSON.parse(JSON.stringify(generateNextJourney({
      context: journeyContext,
      forcedStage: "mid",
      forcedDebugPayload: banePayload,
    }))) as JourneyManifest;
    const purgeOption = manifest.options.find((option) =>
      option.operations.some((operation) =>
        operation.operationKind === "reward" && operation.rewardKind === "bane_chosen_purge"
      )
    )!;

    purgeOption.effects = [{
      kind: "bane_chosen_purge",
      baneName: "Nightmare",
      count: 1,
      baneTargetContext: "current_state",
      selection: "chosen_after_commitment",
      timing: "immediate",
    }];
    purgeOption.operations = adaptJourneyOptionOperations(purgeOption);

    const resolved = attachTargetResolutionMetadata(manifest, journeyContext.content, journeyContext.state.quest);

    expect(validateJourneyManifest(resolved, journeyContext)).toMatchObject({
      ok: false,
      rule: "bane_current_state_target_unavailable",
    });
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

    const [routeManifest, shopManifest, dreamwellManifest, statusManifest] = variants.map((forcedDebugPayload) =>
      generateNextJourney({
        context: journeyContext,
        forcedStage: forcedDebugPayload.familyId === "status" ? "late" : "mid",
        forcedDebugPayload,
      })
    );

    expect(routeManifest!.debug.validation.ok).toBe(true);
    expect(routeManifest!.options.flatMap((option) => option.operations.map((operation) =>
      operation.operationKind === "route_edit" ? operation.editKind : undefined
    ))).toEqual(expect.arrayContaining([
      "add_site",
      "remove_site",
      "replace_site",
      "purge_site",
      "probability_adjustment",
    ]));
    expect(routeManifest!.precommitted.routeEdits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        routeOperationKind: "probability_adjustment",
        routeScope: "future_dreamscapes",
        routePolarity: "positive",
        siteDeltaValue: expect.any(Number),
      }),
    ]));

    expect(shopManifest!.debug.validation.ok).toBe(true);
    expect(shopManifest!.options.flatMap((option) => option.operations.map((operation) => operation.payload))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ economyOperationKind: "reroll_discount", shopScope: "current_shop", duration: "current shop" }),
        expect.objectContaining({
          economyOperationKind: "future_shop_trade_hook",
          shopScope: "future_shops",
          duration: "next 2 future shops",
          hookBudgetCost: 1,
        }),
      ]),
    );
    const shopEconomyOperations = shopManifest!.options.flatMap((option) =>
      option.operations.filter((operation) =>
        operation.operationKind === "reward" && operation.rewardKind === "shop_economy_modifier"
      )
    );
    expect(shopEconomyOperations.length).toBeGreaterThan(0);
    for (const operation of shopEconomyOperations) {
      expect(operation.resourceSemantics, operation.operationId).toBeUndefined();
    }

    expect(dreamwellManifest!.debug.validation.ok).toBe(true);
    expect(dreamwellManifest!.options.flatMap((option) => option.operations.map((operation) => operation.payload))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dreamwellOperationKind: "first_draw_energy", dreamwellScope: "next_battle", duration: "next battle" }),
        expect.objectContaining({ dreamwellOperationKind: "penalty_card", cardRole: "penalty", duration: "next 3 battles" }),
      ]),
    );
    expect(dreamwellManifest!.options.flatMap((option) => option.operations)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationKind: "reward",
        rewardKind: "dreamwell_modifier",
      }),
      expect.objectContaining({
        operationKind: "burden",
        burdenKind: "dreamwell_modifier",
      }),
    ]));
    for (const operation of dreamwellManifest!.options.flatMap((option) => option.operations)) {
      if (
        (operation.operationKind === "reward" && operation.rewardKind === "dreamwell_modifier") ||
        (operation.operationKind === "burden" && operation.burdenKind === "dreamwell_modifier")
      ) {
        expect(operation.resourceSemantics, operation.operationId).toBeUndefined();
      }
    }

    expect(statusManifest!.debug.validation.ok).toBe(true);
    expect(statusManifest!.options.flatMap((option) => option.operations)).toEqual(
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
    expect(statusManifest!.precommitted.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationKind: "delayed_hook",
        rewardOperations: expect.arrayContaining([
          expect.objectContaining({
            operationKind: "status",
            visibility: "precommitted",
            payload: expect.objectContaining({ ruleMutationKind: "dreamwell_rule" }),
          }),
        ]),
      }),
    ]));
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

    expect(validateJourneyManifest(invalidRouteManifest, journeyContext)).toMatchObject({
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

    expect(validateJourneyManifest(invalidStatusManifest, journeyContext)).toMatchObject({
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

    expect(validateJourneyManifest(invalidShopRuleManifest, journeyContext)).toMatchObject({
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

    expect(validateJourneyManifest(invalidProhibitionManifest, journeyContext)).toMatchObject({
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

    expect(validateJourneyManifest(shopManifest, saturatedHookContext)).toMatchObject({
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
    const hookOperations = manifest.precommitted.operations?.filter((operation) =>
      operation.operationKind === "delayed_hook" && operation.role === "delayed_hook"
    ) ?? [];
    const triggerKinds = hookOperations.map((operation) =>
      operation.operationKind === "delayed_hook" ? operation.triggerSelector?.triggerKind : undefined
    );
    const hookBudget = manifest.options.flatMap((option) => option.triggers)
      .reduce((sum, trigger) =>
        typeof trigger === "object" &&
          trigger !== null &&
          !Array.isArray(trigger) &&
          typeof (trigger as { hookBudgetCost?: unknown }).hookBudgetCost === "number"
          ? sum + ((trigger as { hookBudgetCost: number }).hookBudgetCost)
          : sum, 0);

    expect(manifest.shapeId).toBe("service_menu");
    expect(manifest.debug.validation).toMatchObject({ ok: true, failed: 0 });
    expect(triggerKinds).toEqual(expect.arrayContaining([
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
    ]));
    expect(hookBudget).toBeLessThanOrEqual(3);
    expect(hookOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        trackedCondition: expect.any(String),
        resolution: expect.any(String),
        expiration: expect.objectContaining({ policyKind: expect.any(String) }),
        duration: expect.objectContaining({ durationKind: expect.any(String) }),
        controlledScene: expect.objectContaining({ sceneKind: expect.any(String) }),
        visibilityPolicy: expect.objectContaining({ disclosure: expect.any(String) }),
        rewardOperations: expect.any(Array),
      }),
    ]));
    expect(generatedOptionText(manifest).join("\n")).toMatch(/Track .*Resolve .*expir/iu);
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
    const pairedOperations = manifest.precommitted.operations?.filter((operation) =>
      operation.operationKind === "paired_return"
    ) ?? [];

    expect(manifest.shapeId).toBe("paired_return");
    expect(manifest.debug.validation).toMatchObject({ ok: true, failed: 0 });
    expect(manifest.precommitted.pairedReturn).toHaveLength(3);
    expect(pairedOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        contract: expect.objectContaining({
          created: expect.objectContaining({ referenceKind: "sealed_object" }),
          returnScene: expect.objectContaining({ returnSceneKind: "sealed_object_return" }),
        }),
      }),
      expect.objectContaining({
        contract: expect.objectContaining({
          created: expect.objectContaining({ referenceKind: "borrowed_object" }),
          returnScene: expect.objectContaining({ returnSceneKind: "borrowed_object_return" }),
        }),
      }),
      expect.objectContaining({
        contract: expect.objectContaining({
          created: expect.objectContaining({ referenceKind: "trade_promise" }),
          returnScene: expect.objectContaining({ returnSceneKind: "future_trade" }),
        }),
      }),
    ]));
    expect(manifest.precommitted.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationKind: "delayed_hook",
        triggerSelector: expect.objectContaining({ triggerKind: "future_dream_journey" }),
        controlledScene: expect.objectContaining({ sceneKind: "return" }),
      }),
    ]));
    expect(generatedOptionText(manifest).join("\n")).toMatch(/Seal .*return .*expires|Borrow .*Return/iu);
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
        ...((hookManifest.precommitted.delayed?.[0] as Record<string, unknown>).triggerSelector as Record<string, unknown>),
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

    expect(validateJourneyManifest(invalidHookManifest, journeyContext)).toMatchObject({
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
      ...(returnManifest.precommitted.pairedReturn?.[0] as Record<string, unknown>),
      returnScene: {
        ...((returnManifest.precommitted.pairedReturn?.[0] as Record<string, unknown>).returnScene as Record<string, unknown>),
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

    expect(validateJourneyManifest(invalidReturnManifest, journeyContext)).toMatchObject({
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
      ...(returnManifest.precommitted.pairedReturn?.[0] as Record<string, unknown>),
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

    expect(validateJourneyManifest(invalidReturnManifest, journeyContext)).toMatchObject({
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

    for (let index = 0; index < 24 && seen.size < requiredRewardKinds.size; index += 1) {
      const journeyContext = await context(`named-card:${index}`);
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "mid",
        forcedDebugPayload: cardPayload,
      });
      const rewardOperations = manifest.options.flatMap((option) =>
        option.operations.filter((operation) => operation.operationKind === "reward")
      );

      expect(manifest.shapeId).toBe("service_menu");
      expect(manifest.debug.debugPayload).toMatchObject({
        familyId: "card",
        variantId: "named-card-operation-menu",
        qaId: "card/named-card-operation-menu",
        source: "forced",
      });
      expect(validateJourneyManifest(manifest, journeyContext), `named-card:${index}`).toEqual({ ok: true });

      for (const operation of rewardOperations) {
        expect(operation.targetResolution, operation.rewardKind).toMatchObject({
          selectorKind: "card",
          candidateCount: expect.any(Number),
        });
        expect(operation.targetResolution?.candidateCount, operation.rewardKind).toBeGreaterThan(0);
        expect(operation.targetResolution?.selected[0]?.name, operation.rewardKind).toEqual(expect.any(String));
        expect(operation.value?.convertedEssence, operation.rewardKind).toEqual(expect.any(Number));
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
      option.operations.filter((operation) => operation.operationKind === "reward")
    );
    const cardRewardOperations = rewardOperations.filter((operation) => operation.rewardKind !== "resource");
    const starterIds = new Set(journeyContext.state.quest.deck.entries.map((entry) => entry.cardId));
    const draftReplacement = cardRewardOperations.find((operation) =>
      operation.rewardKind === "starter_replacement" &&
        operation.payload.replacementMode === "draft"
    );
    const cleanupOption = manifest.options.find((option) => option.text.includes("Gain 2 omens."))!;

    expect(manifest.shapeId).toBe("curated_reward_trio");
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
    expect(cardRewardOperations.map((operation) => operation.rewardKind)).toEqual(expect.arrayContaining([
      "starter_cleanup",
      "starter_replacement",
    ]));
    expect(draftReplacement?.payload).toMatchObject({
      takeCount: 1,
      choiceCount: 4,
      predicate: expect.objectContaining({ source: "draftPool" }),
    });
    expect(cleanupOption.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "starter_cleanup" }),
      expect.objectContaining({ kind: "gain_omens", amount: 2 }),
    ]));
    expect(cleanupOption.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationKind: "reward",
        rewardKind: "resource",
        legacyKind: "gain_omens",
        payload: expect.objectContaining({ amount: 2 }),
      }),
    ]));

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

  it("rejects unavailable deck-affecting named card operations with a stable rule", async () => {
    const journeyContext = await context("named-card-invalid");
    const unavailable = journeyContext.content.cards.find((card) => card.rarity !== "Starter")!;
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
      option.operations.some((operation) =>
        operation.operationKind === "reward" &&
          operation.rewardKind !== "card_gain"
      )
    );
    const targetOption = manifest.options[targetOptionIndex]!;
    const invalidOperationIndex = targetOption.operations.findIndex((operation) =>
      operation.operationKind === "reward" &&
        operation.rewardKind !== "card_gain"
    );
    const invalidOperation = targetOption.operations[invalidOperationIndex]!;
    const invalid: JourneyManifest = attachTargetResolutionMetadata({
      ...manifest,
      options: manifest.options.map((option, optionIndex) =>
        optionIndex === targetOptionIndex
          ? {
              ...option,
              operations: option.operations.map((operation, operationIndex) =>
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
                  : operation
              ),
            }
          : option
      ),
    }, journeyContext.content, journeyContext.state.quest);

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "named_card_target_unavailable",
    });
  });

  it("rejects unavailable deck-affecting named card operations even when the selector source is catalog", async () => {
    const journeyContext = await context("named-card-catalog-invalid");
    const unavailable = journeyContext.content.cards.find((card) => card.rarity !== "Starter")!;
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
      option.operations.some((operation) =>
        operation.operationKind === "reward" &&
          operation.rewardKind !== "card_gain"
      )
    );
    const targetOption = manifest.options[targetOptionIndex]!;
    const invalidOperationIndex = targetOption.operations.findIndex((operation) =>
      operation.operationKind === "reward" &&
        operation.rewardKind !== "card_gain"
    );
    const invalidOperation = targetOption.operations[invalidOperationIndex]!;
    const invalid: JourneyManifest = attachTargetResolutionMetadata({
      ...manifest,
      options: manifest.options.map((option, optionIndex) =>
        optionIndex === targetOptionIndex
          ? {
              ...option,
              operations: option.operations.map((operation, operationIndex) =>
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
                  : operation
              ),
            }
          : option
      ),
    }, journeyContext.content, journeyContext.state.quest);

    expect(invalid.options[targetOptionIndex]!.operations[invalidOperationIndex]!.targetResolution).toMatchObject({
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

      expect(validateJourneyManifest(manifest, journeyContext), shape.id).toEqual({
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
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
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
      expect(validateJourneyManifest(manifest, journeyContext), shapeId).toEqual({ ok: true });
    }
  });

  it("keeps semantic operation roles specific for route, delayed, random, and reward-pool payloads", async () => {
    const journeyContext = await context();
    const routeManifest = fillForShape("alter_dreamscapes", journeyContext);
    const delayedManifest = fillForShape("reward_after_trigger", journeyContext);
    const randomManifest = fillForShape("random_pool_draws", journeyContext);

    expect(routeManifest.options.flatMap((option) => option.operations)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationKind: "route_edit",
          role: "route_edit",
        }),
      ]),
    );
    expect(delayedManifest.options.flatMap((option) => option.operations)).toEqual(
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
          branch.operations.some((operation) => operation.operationId.includes(":terminal:")),
          branch.id,
        ).toBe(false);

        for (const terminalOperation of branch.terminal?.operations ?? []) {
          expect(branchOperationIds.has(terminalOperation.operationId), branch.id).toBe(false);
        }
      }
    }
  });

  it("exposes typed reward operations for delayed precommitted hooks", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const delayedOperations = manifest.precommitted.operations?.filter((operation) =>
      operation.operationKind === "delayed_hook" && operation.role === "delayed_hook"
    ) ?? [];

    expect(delayedOperations.length).toBeGreaterThan(0);

    for (const operation of delayedOperations) {
      expect(operation.rewardOperations?.length, operation.operationId).toBeGreaterThan(0);
      expect(operation.payload.rewardOperations, operation.operationId).toEqual(operation.rewardOperations);
      expect(operation.payload.reward, operation.operationId).toBeUndefined();
      expect(operation.rewardOperations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operationKind: "reward",
            role: "reward",
            visibility: "precommitted",
          }),
        ]),
      );
    }
  });

  diversityAuditIt("varies every forced shape across deterministic seed batches", async () => {
    const content = await loadContent(process.cwd());
    const treeShapeIds = new Set(
      JOURNEY_SHAPES
        .filter((shape) => shape.topology === "decision_tree")
        .map((shape) => shape.id),
    );

    for (const shape of JOURNEY_SHAPES) {
      const exact = new Set<string>();
      const mechanical = new Set<string>();

      for (let index = 0; index < 20; index += 1) {
        const journeyContext = contextFromContent(content, `forced:${shape.id}:${index}`);
        const manifest = generateNextJourney({
          context: journeyContext,
          forcedShapeId: shape.id,
          forcedStage: "early",
        });

        expect(validateJourneyManifest(manifest, journeyContext), `${shape.id}:${index}`).toEqual({ ok: true });
        exact.add(exactVisibleSignature(manifest));
        mechanical.add(mechanicalSignature(manifest));
      }

      expect(exact.size, shape.id).toBeGreaterThanOrEqual(treeShapeIds.has(shape.id) ? 10 : 8);
      expect(mechanical.size, shape.id).toBeGreaterThanOrEqual(treeShapeIds.has(shape.id) ? 6 : 5);
    }
  }, 180000);

  diversityAuditIt("keeps stage batches mechanically diverse across deterministic seeds", async () => {
    const content = await loadContent(process.cwd());
    const thresholds = {
      early: { exact: 85, mechanical: 65, structural: 65, largest: 3 },
      mid: { exact: 75, mechanical: 55, structural: 55, largest: 3 },
      late: { exact: 75, mechanical: 55, structural: 55, largest: 3 },
    } as const;

    for (const stage of ["early", "mid", "late"] as const) {
      const manifests = Array.from({ length: 100 }, (_, index) => {
        const journeyContext = contextFromContent(content, `audit:${stage}:${index}`, stage);
        const manifest = generateNextJourney({
          context: journeyContext,
          forcedStage: stage,
        });

        expect(validateJourneyManifest(manifest, journeyContext), `${stage}:${index}`).toEqual({ ok: true });
        return manifest;
      });
      const exact = manifests.map(exactVisibleSignature);
      const mechanical = manifests.map(mechanicalSignature);
      const structural = manifests.map(structuralSignature);

      expect(new Set(exact).size, `${stage}:exact`).toBeGreaterThanOrEqual(thresholds[stage].exact);
      expect(new Set(mechanical).size, `${stage}:mechanical`).toBeGreaterThanOrEqual(thresholds[stage].mechanical);
      expect(new Set(structural).size, `${stage}:structural`).toBeGreaterThanOrEqual(thresholds[stage].structural);
      expect(largestGroupSize(exact), `${stage}:largest exact duplicate group`).toBeLessThanOrEqual(thresholds[stage].largest);
    }
  }, 180000);

  it("keeps a small early batch mechanically varied without running the full audit", async () => {
    const content = await loadContent(process.cwd());
    const manifests = Array.from({ length: 8 }, (_, index) => {
      const journeyContext = contextFromContent(content, `smoke:early:${index}`, "early");
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedStage: "early",
      });

      expect(validateJourneyManifest(manifest, journeyContext), `smoke:early:${index}`).toEqual({ ok: true });
      return manifest;
    });

    expect(new Set(manifests.map(exactVisibleSignature)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(manifests.map(mechanicalSignature)).size).toBeGreaterThanOrEqual(6);
    expect(largestGroupSize(manifests.map(exactVisibleSignature))).toBeLessThanOrEqual(2);
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
      expect(manifest.options.map((option) => option.number), shapeId).toEqual([1, 2, 3]);
      expect(validateJourneyManifest(manifest, journeyContext), shapeId).toEqual({ ok: true });
    }
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
      const expectedOptionCount = shapeId === "commit_now_future_payoff" ? 3 : 2;

      expect(manifest.options, shapeId).toHaveLength(expectedOptionCount);
      expect(manifest.options.map((option) => option.number), shapeId).toEqual(
        Array.from({ length: expectedOptionCount }, (_, index) => index + 1),
      );
      expect(manifest.precommitted.delayed, shapeId).toBeDefined();
      expect(validateJourneyManifest(manifest, journeyContext), shapeId).toEqual({ ok: true });
    }
  });

  it("values next-battle Dreamsign rewards as near-term premium rewards", async () => {
    const journeyContext = await context("random:3aa6092e-d433-4819-b86c-ccf61b9f51cd");
    const manifest = fillForShape("reward_after_trigger", journeyContext);

    expect(manifest.options).toHaveLength(2);
    expect(manifest.options.every((option) =>
      /^(?:After next battle|After next victory), /u.test(option.text)
    )).toBe(true);
    expect(manifest.precommitted.delayed).toHaveLength(2);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
  });

  it("fills commit-now future payoffs as three comparable visible commitments", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("commit_now_future_payoff", journeyContext);

    expect(manifest.options.map((option) => option.text)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/now\. At the next dreamscape,/u),
      ]),
    );
    expect(manifest.precommitted.delayed?.map((entry) =>
      typeof entry === "object" && entry !== null && "optionNumber" in entry
        ? entry.optionNumber
        : null,
    )).toEqual([1, 2, 3]);

    const nets = manifest.options.map((option) => option.netConvertedEssence);

    expect(Math.max(...nets) - Math.min(...nets)).toBeLessThanOrEqual(75);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
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
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
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
        expect.arrayContaining([expect.stringMatching(/(?:selected-tide|\btidal\b|\btides?\b)/iu)]),
      );
    }
  });

  it("keeps internal draft and Dreamsign pool sources out of generated ability text", async () => {
    const journeyContext = await context();

    for (const shape of JOURNEY_SHAPES) {
      const manifest = fillForShape(shape.id, journeyContext);
      const targetDescriptions = manifest.options.flatMap((option) =>
        option.targets
          .filter((target): target is { description: string } =>
            typeof target === "object" &&
            target !== null &&
            "description" in target &&
            typeof target.description === "string",
          )
          .map((target) => target.description),
      );

      expect(generatedOptionText(manifest), shape.id).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/from the (?:card|Dreamsign) pool/iu)]),
      );
      expect(targetDescriptions, shape.id).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/from the (?:card|Dreamsign) pool/iu)]),
      );
    }
  });

  it("balances the common positive reward menu while keeping broad four-card drafts modest", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("curated_reward_trio", journeyContext);
    const draftEffect = manifest.options.flatMap((option) => option.effects).find((effect): effect is {
      kind: "card_draft";
      takeCount: number;
      choiceCount: number;
      predicate?: Record<string, unknown>;
    } =>
      typeof effect === "object" &&
        effect !== null &&
        "kind" in effect &&
        effect.kind === "card_draft"
    );
    const dreamsignEffect = manifest.options.flatMap((option) => option.effects).find((effect): effect is {
      kind: "dreamsign_draft";
      choiceCount: number;
    } =>
      typeof effect === "object" &&
        effect !== null &&
        "kind" in effect &&
        effect.kind === "dreamsign_draft"
    );

    expect(manifest.options).toHaveLength(3);
    expect(draftEffect).toEqual(expect.objectContaining({ takeCount: 1, choiceCount: 4 }));
    if (dreamsignEffect) {
      expect(dreamsignEffect.choiceCount).toBeGreaterThanOrEqual(2);
      expect(dreamsignEffect.choiceCount).toBeLessThanOrEqual(3);
    }
    expect(Math.min(...manifest.options.map((option) => option.effectConvertedEssence))).toBeGreaterThanOrEqual(295);
    expect(
      Math.max(...manifest.options.map((option) => option.netConvertedEssence)) -
        Math.min(...manifest.options.map((option) => option.netConvertedEssence)),
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

      for (const seed of ["positive-a", "positive-b", "positive-c", "positive-d", "positive-e"]) {
        const journeyContext = await context(`${shapeId}:${seed}`);
        const manifest = fillForShape(shapeId, journeyContext);

        expect(validateJourneyManifest(manifest, journeyContext), `${shapeId}:${seed}`).toEqual({ ok: true });
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
        ...Object.values(manifest.precommitted.sequenceMenus ?? {}).flatMap((options) =>
          options.flatMap((option) => option.effects)
        ),
        ...(manifest.tree?.nodes.flatMap((node) =>
          node.branches.flatMap((branch) => [
            ...branch.effects,
            ...(branch.terminal?.effects ?? []),
          ])
        ) ?? []),
        ...(manifest.precommitted.random ?? []),
        ...(manifest.rewardPool?.rewards ?? []),
      ];
      const cardDrafts = allEffects.filter((effect): effect is {
        kind: "card_draft";
        takeCount: number;
        choiceCount: number;
        predicate?: Record<string, unknown>;
      } =>
        typeof effect === "object" &&
        effect !== null &&
        "kind" in effect &&
        effect.kind === "card_draft"
      );

      for (const draft of cardDrafts) {
        expect(draft.takeCount, shape.id).toBe(1);
        expect(draft.choiceCount, shape.id).toBe(4);
        expect(draft.predicate, shape.id).toEqual(
          expect.objectContaining({ source: "draftPool" }),
        );
        expect(
          Boolean(draft.predicate?.cardType) ||
            Boolean(draft.predicate?.subtype) ||
            Boolean(draft.predicate?.isFast) ||
            Boolean(draft.predicate?.renderedTextIncludes),
          shape.id,
        ).toBe(true);
      }
    }
  });

  it("fills timed window menus with broad multi-battle combat effects", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("timed_window_menu", journeyContext);

    expect(manifest.options).toHaveLength(3);
    expect(manifest.options.every((option) => option.text.startsWith("For the next 3 battles,"))).toBe(true);
    expect(Math.min(...manifest.options.map((option) => option.netConvertedEssence))).toBeGreaterThanOrEqual(150);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
  });

  it.each([
    [
      "timed_window_requires_battle_window",
      {
        text: "For the next battle, add Fast to a chosen card.",
        effects: [{ kind: "card_rewrite", keyword: "Fast", duration: "next battle" }],
        effectConvertedEssence: 70,
        netConvertedEssence: 65,
      },
    ],
    [
      "timed_window_resource_only_reward",
      {
        text: "For the next 3 battles, gain 1 omen.",
        effects: [
          { kind: "battle_window_modifier", duration: "next 3 battles", modifier: "reward_timing" },
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
        effects: [{ kind: "card_rewrite", keyword: "Fast", duration: "next 3 battles" }],
        effectConvertedEssence: 80,
        netConvertedEssence: 80,
      },
    ],
  ])("rejects weak timed window menus for %s", async (rule, patch) => {
    const journeyContext = await context();
    const manifest = fillForShape("timed_window_menu", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [
        refreshOptionOperations({
          ...manifest.options[0]!,
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

  it("does not emit a higher-cost duplicate card draft reward when typed draft predicates fall back", async () => {
    const journeyContext = await context("random:f3c7440a-d810-4c24-a0da-3fa0a45a0882");
    const manifest = fillForShape("same_reward_different_costs", journeyContext);

    expect(manifest.options.map((option) => option.text)).toHaveLength(3);
    expect(new Set(manifest.options.map((option) => option.text)).size).toBe(3);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
  });

  it("keeps choose-your-loss essence payments comparable to non-essence losses", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("choose_your_loss", journeyContext);

    expect(manifest.options.every((option) => option.netConvertedEssence < 0)).toBe(true);
    expect(
      Math.max(...manifest.options.map((option) => Math.abs(option.netConvertedEssence))) /
        Math.min(...manifest.options.map((option) => Math.abs(option.netConvertedEssence))),
    ).toBeLessThanOrEqual(2);
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
  });

  it("does not throw with an empty Dreamsign pool", async () => {
    const journeyContext = await contextWithEmptyDreamsignPool();
    const manifest = generateNextJourney({ context: journeyContext });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });

    const heterogeneous = fillForShape("heterogeneous_pair", journeyContext);

    expect(validateJourneyManifest(heterogeneous, journeyContext)).toEqual({ ok: true });
  });

  it("renders take-any-number as a repeatable flat menu", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("take_any_number", journeyContext);

    expect(manifest.tree).toBeUndefined();
    expect(manifest.sequence).toBeUndefined();
    expect(manifest.options.map((option) => option.number)).toEqual([1, 2, 3]);
    expect(manifest.options.at(-1)?.pickBehavior).toBe("leave");
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
  });

  it("requires take-any-number rewards to carry a real limiting structure", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("take_any_number", journeyContext);
    const unlimitedOptions = manifest.options.map((journeyOption) =>
      journeyOption.number === 1
        ? refreshOptionOperations({
            ...journeyOption,
            text: "Take cache reward 1: gain 1 omen, then choose whether to take the final reward.",
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
      expect(manifest.tree?.nodes[0]?.branches.some((branch) => branch.terminal), shapeId).toBe(true);
      expect(validateJourneyManifest(manifest, journeyContext), shapeId).toEqual({ ok: true });
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
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
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

      for (const seed of ["sequential-a", "sequential-b", "sequential-c", "sequential-d"]) {
        const journeyContext = await context(seed);
        const manifest = fillForShape(shapeId, journeyContext);

        expect(validateJourneyManifest(manifest, journeyContext), `${shapeId}:${seed}`).toEqual({ ok: true });
        outputs.add(generatedOptionText(manifest).join("\n"));
      }

      expect(outputs.size, shapeId).toBeGreaterThan(1);
    }
  }, 15000);

  it("does not emit the reference examples as production sequential trees", async () => {
    const probabilityContext = await context("reference-probability");
    const probabilityText = generatedOptionText(fillForShape("probability_ladder", probabilityContext));

    expect(probabilityText).not.toContain("Pay 25 essence for a 25% chance to gain a Dreamsign.");
    expect(probabilityText).not.toContain("Pay 45 essence for a 45% chance to gain a Dreamsign.");
    expect(probabilityText).not.toContain("Pay 70 essence for a 70% chance to gain a Dreamsign.");

    const chainContext = await context("reference-chain");
    const chainText = generatedOptionText(fillForShape("escalating_reward_chain", chainContext));

    expect(chainText).not.toContain("Pay 10 essence and transfigure a random card. Go to Level 2.");
    expect(chainText).not.toContain("Pay 20 essence and transfigure a random card. Go to Level 3.");
    expect(chainText).not.toContain("Pay 40 essence and transfigure a random card. Go to Level 4.");
    expect(chainText).not.toContain("Pay all essence and transfigure all cards in your deck. End the Journey.");
  });

  it("rejects probability ladders whose success branch can award the fixed reward more than once", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("probability_ladder", journeyContext);
    const invalid = structuredClone(manifest);
    const successBranch = invalid.tree?.nodes[0]?.branches.find((branch) =>
      branch.label === "Success"
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
    const deckCardIds = new Set(journeyContext.state.quest.deck.entries.map((entry) => entry.cardId));
    const nonDeckCard = journeyContext.content.cards.find((card) => !deckCardIds.has(card.id))!;
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
            : journeyOption
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
              operations: randomPool.rewardPool.operations.map((operation, index) =>
                index === 0
                  ? {
                      ...operation,
                      targetSelector: {
                        selectorKind: "card",
                        selection: "predicate",
                        referenceKind: "content",
                        source: "deck",
                        predicate: { source: "deck", names: [nonDeckCard.name] },
                        required: true,
                      },
                    }
                  : operation
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
      expectValidationReportMatchesValidator(invalid, invalid === delayed ? delayedContext : journeyContext);
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

  it("rejects unresolved named card and Dreamsign references", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });
    const invalid: JourneyManifest = {
      ...manifest,
      references: {
        ...manifest.references,
        cardIds: [...manifest.references.cardIds, "not-a-real-card"],
        dreamsignIds: [...manifest.references.dreamsignIds, "not-a-real-dreamsign"],
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
            : effect
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
    const outsidePoolDreamsign = journeyContext.content.dreamsigns.find((dreamsign) =>
      !poolIds.has(dreamsign.id)
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
            : effect
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
    const outsidePoolDreamsign = journeyContext.content.dreamsigns.find((dreamsign) =>
      !poolIds.has(dreamsign.id)
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
            : effect
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
            effects: [{ kind: "dreamsign_gain", dreamsignName: dreamsign.name }],
          }),
        ],
      },
      journeyContext.content,
      journeyContext.state.quest,
    );

    expect(validateJourneyManifest(withNamedSelectors, journeyContext)).toEqual({ ok: true });
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
            selected: [expect.objectContaining({ id: card.id, name: card.name })],
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
            selected: [expect.objectContaining({ id: dreamsign.id, name: dreamsign.name })],
          }),
        }),
      ]),
    );
  });

  it("reports empty required target pools with stable debug metadata", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const deckCardIds = new Set(journeyContext.state.quest.deck.entries.map((entry) => entry.cardId));
    const nonDeckCard = journeyContext.content.cards.find((card) => !deckCardIds.has(card.id))!;
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

    expect(validateJourneyManifest(generatedSelectorManifest, journeyContext)).toEqual({ ok: true });
    expect(generatedSelectorManifest.options[0]?.operations.map((operation) => operation.targetSelector)).toEqual([
      expect.objectContaining({ selectorKind: "generated_object", generatedObjectReferenceKind: "placeholder" }),
      expect.objectContaining({ selectorKind: "bane", names: ["Nightmare"] }),
    ]);
    expect(routeManifest.options.flatMap((option) => option.operations)).toEqual(
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

  it("rejects malformed option entries instead of throwing", async () => {
    const journeyContext = await contextWithEmptyDreamsignPool();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [manifest.options[0]!, undefined as unknown as JourneyManifest["options"][number]],
    };

    expect(() => validateJourneyManifest(invalid, journeyContext)).not.toThrow();
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "invalid_option",
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

    expect(manifest.precommitted.random).toHaveLength(manifest.options.length);
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("shows wager odds in root option copy while keeping the committed roll in metadata", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_wager", journeyContext);

    expect(manifest.options[0]?.text).toMatch(/^Pay \d+ essence\. \d+% chance to .+ otherwise gain nothing\.$/u);
    expect(manifest.options[1]?.text).toMatch(/^Pay \d+ essence\. \d+% chance to .+ otherwise gain nothing\.$/u);
    expect(manifest.precommitted.random?.[0]).toMatchObject({
      kind: "wager_roll",
      optionNumber: 1,
      odds: { percent: expect.any(Number) },
      success: expect.anything(),
      failure: { kind: "no_reward" },
      committedResult: expect.stringMatching(/^(success|failure)$/u),
      presentation: "visible_odds_debug_roll",
    });
    expect(manifest.precommitted.random?.[1]).toMatchObject({
      kind: "wager_roll",
      optionNumber: 2,
      odds: { percent: expect.any(Number) },
      success: expect.anything(),
      failure: { kind: "no_reward" },
      committedResult: expect.stringMatching(/^(success|failure)$/u),
      presentation: "visible_odds_debug_roll",
    });
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
  });

  it("models risk-or-skip downside as a bounded chance envelope", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("risk_or_skip", journeyContext);

    expect(manifest.options[0]?.text).toMatch(/\d+% chance to .+; otherwise no downside\.$/u);
    expect(manifest.options[0]?.effects.length).toBeGreaterThan(0);
    expect(manifest.options[0]?.burdens).toEqual([]);
    expect(manifest.precommitted.random?.[0]).toMatchObject({
      kind: "risk_downside_roll",
      optionNumber: 1,
      odds: { percent: expect.any(Number) },
      downside: expect.anything(),
      safe: { kind: "no_downside" },
      committedResult: expect.stringMatching(/^(downside|safe)$/u),
      presentation: "visible_odds_debug_roll",
    });
    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
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

  it("reveals committed non-wager random reward values in root option copy", async () => {
    const journeyContext = await context();

    expect(fillForShape("single_random_outcome", journeyContext).options.map((option) => option.text)).toEqual([
      expect.stringMatching(/^Gain the precommitted reward: .+\.$/u),
      expect.stringMatching(/^Gain the precommitted reward: .+\.$/u),
    ]);
    expect(fillForShape("resolved_random_series", journeyContext).options.map((option) => option.text)).toEqual([
      expect.stringMatching(/^Resolve the precommitted rewards: .+\.$/u),
      expect.stringMatching(/^Resolve the precommitted rewards: .+\.$/u),
    ]);
  });

  it("forces deterministic reveal, roll, range, pool, push, and wager payload envelopes", async () => {
    const journeyContext = await context("random-reveal-roll-wager");
    const randomPayload = {
      familyId: "random",
      variantId: "reveal-roll-wager",
      qaId: "random/reveal-roll-wager",
      description: "Reveal, roll, and wager payload coverage.",
      supportedShapes: ["single_random_outcome", "single_wager", "random_pool_draws", "resolved_random_series"],
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
    expect(validateJourneyManifest(first, journeyContext)).toEqual({ ok: true });
    expect(first.debug.debugPayload).toMatchObject({
      qaId: "random/reveal-roll-wager",
      source: "forced",
    });
    expect(kinds).toEqual(expect.arrayContaining([
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
    ]));
    expect(first.options.map((option) => option.text).join(" ")).toMatch(/\d+% chance/u);
    expect(first.options.map((option) => option.text).join(" ")).toMatch(/\d+-\d+ random essence/u);
    expect(first.precommitted.operations).toEqual(expect.arrayContaining([
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
            outcomeVisibility: expect.stringMatching(/^(visible|hidden_until_resolution|delayed|pre_rolled|resolved)$/u),
            disclosure: expect.any(String),
          }),
        }),
      }),
    ]));
  });

  it("rejects incoherent random envelope metadata with stable rule IDs", async () => {
    const journeyContext = await context("random-envelope-invalid");
    const randomPayload = {
      familyId: "random",
      variantId: "reveal-roll-wager",
      qaId: "random/reveal-roll-wager",
      description: "Reveal, roll, and wager payload coverage.",
      supportedShapes: ["single_random_outcome", "single_wager", "random_pool_draws", "resolved_random_series"],
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
          entry.kind === kind ? updater(entry) : entry
        ),
      }),
    });

    expect(validateJourneyManifest(withRandom((entry) => ({
      ...entry,
      odds: { numerator: 0, denominator: 100, percent: 0 },
    }), "wager"), journeyContext)).toMatchObject({
      ok: false,
      rule: "invalid_random_odds",
    });
    expect(validateJourneyManifest(withRandom((entry) => ({
      ...entry,
      rewards: [],
    }), "visible_pool"), journeyContext)).toMatchObject({
      ok: false,
      rule: "empty_random_pool",
    });
    expect(validateJourneyManifest(withRandom((entry) => {
      const { visibilityPolicy: _visibilityPolicy, ...rest } = entry;

      return rest;
    }, "gain_one_random_reward"), journeyContext)).toMatchObject({
      ok: false,
      rule: "hidden_outcome_disclosure",
    });
    expect(validateJourneyManifest(withRandom((entry) => ({
      ...entry,
      minimum: 9,
      maximum: 3,
      committedAmount: 5,
    }), "random_range"), journeyContext)).toMatchObject({
      ok: false,
      rule: "incoherent_random_range_bounds",
    });
    expect(validateJourneyManifest(withRandom((entry) => {
      const { committedAmount: _committedAmount, ...rest } = entry;

      return rest;
    }, "random_range"), journeyContext)).toMatchObject({
      ok: false,
      rule: "incoherent_random_range_bounds",
    });
    expect(validateJourneyManifest(withRandom((entry) => ({
      ...entry,
      minimum: 1,
      maximum: 3,
      committedAmount: 9,
    }), "random_range"), journeyContext)).toMatchObject({
      ok: false,
      rule: "incoherent_random_range_bounds",
    });
    expect(validateJourneyManifest(withRandom((entry) => ({
      ...entry,
      rolls: [3, 7],
      keptRoll: 99,
    }), "roll_twice_keep_one"), journeyContext)).toMatchObject({
      ok: false,
      rule: "invalid_roll_twice_payload",
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
        random: [{ kind: "gain_essence", amount: 110 }],
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

  it("keeps route edits manifest-only and requires committed route metadata", async () => {
    const journeyContext = await context();
    const routeBefore = stableStringify(journeyContext.state.quest.route);
    const manifest = fillForShape("alter_dreamscapes", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {},
    };

    expect(stableStringify(journeyContext.state.quest.route)).toBe(routeBefore);
    expect(manifest.options.flatMap((option) => option.routeEffects)).toHaveLength(2);
    expect(manifest.precommitted.routeEdits).toEqual(
      manifest.options.flatMap((option) => option.routeEffects),
    );
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it.each([
    "Journey name: The Glass Orchard. Gain 45 essence.",
    "Event name: The Glass Orchard. Gain 45 essence.",
    "The Glass Orchard: Gain 45 essence.",
  ])("rejects normal output text requiring narrative names: %s", async (text) => {
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
  });

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
    const repairedAgain = repairOrFallbackJourney(invalid, journeyContext, failed);

    expect(validateJourneyManifest(repaired, journeyContext)).toEqual({ ok: true });
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
});
