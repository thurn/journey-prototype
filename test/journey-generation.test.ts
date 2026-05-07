import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import { buildConservativeJourneyForShape } from "../src/journey/fillers.js";
import { generateNextJourney } from "../src/journey/generate.js";
import type { JourneyManifest } from "../src/journey/manifest.js";
import { repairOrFallbackJourney } from "../src/journey/repair.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "../src/journey/shapes.js";
import { validateJourneyManifest } from "../src/journey/validate.js";
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
    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(first.debug.optionValues).toHaveLength(first.options.length);
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

  it("uses only a slight first-run probability skew between shapes", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });
    const scores = manifest.debug.shapeScores.map((entry) => entry.score);

    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(0.2);
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
        {
          ...manifest.options[0]!,
          ...patch,
        },
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
        ? {
            ...journeyOption,
            text: "Take cache reward 1: gain 1 omen, then choose whether to take the final reward.",
            costs: [],
            costConvertedEssence: 0,
            netConvertedEssence:
              journeyOption.effectConvertedEssence +
              journeyOption.burdenConvertedEssence +
              journeyOption.uncertaintyConvertedEssence,
          }
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
        {
          ...manifest.options[0]!,
          text: "Pay 25 essence.",
          costs: [{ kind: "essence", amount: 25, timing: "immediate" }],
          costConvertedEssence: 25,
          netConvertedEssence: -25,
        },
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
        {
          ...manifest.options[0]!,
          text: "Gain 150 essence.",
          effects: [{ kind: "gain_essence", amount: 150 }],
          effectConvertedEssence: 150,
          netConvertedEssence: 150,
        },
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
        {
          ...manifest.options[1]!,
          text: "Mechanically duplicated offer.",
          costs: manifest.options[0]!.costs,
          effects: manifest.options[0]!.effects,
          burdens: manifest.options[0]!.burdens,
          targets: manifest.options[0]!.targets,
          triggers: manifest.options[0]!.triggers,
          routeEffects: manifest.options[0]!.routeEffects,
        },
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
        delayed: manifest.precommitted.delayed,
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
        {
          ...manifest.options[0]!,
          text: "Gain 160 essence. Gain 1 Nightmare.",
          burdens: [{ kind: "bane_gain", baneName: "Nightmare", count: 1 }],
          burdenConvertedEssence: -125,
          netConvertedEssence:
            manifest.options[0]!.effectConvertedEssence -
            manifest.options[0]!.costConvertedEssence -
            125 +
            manifest.options[0]!.uncertaintyConvertedEssence,
        },
        manifest.options[1]!,
      ],
      precommitted: { random: [{ kind: "visible_downside", baneName: "Nightmare", count: 1 }] },
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
      precommitted: { random: [{ kind: "visible_downside", baneName: "Nightmare", count: 1 }] },
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
      precommitted: { random: [{ kind: "gain_essence", amount: 110 }] },
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
      result: "repaired",
    });
  });
});
