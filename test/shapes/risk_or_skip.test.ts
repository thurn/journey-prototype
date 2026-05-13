import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
} from "../../src/journey/manifest.js";
import { riskOrSkipPlugin } from "../../src/journey/shapes/risk_or_skip/index.js";
import { validateRiskOrSkip } from "../../src/journey/shapes/risk_or_skip/validators.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";

const auditStages: readonly JourneyStage[] = ["early", "mid", "late"];
const auditSeedNumbers = Array.from({ length: 10 }, (_entry, index) =>
  String(index + 1).padStart(2, "0"),
);

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedRiskOrSkipManifest(seed: string, stage: JourneyStage) {
  const { content, contentVersion } = await contentContext();
  const state = createInitialJourneyState({ seed, content, contentVersion });
  simulateQuestStateForStage({
    state,
    stage,
    drawContext: { seed, contentVersion, rootJourneyIndex: 0 },
  });
  const context = buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });

  return generateNextJourney({
    context,
    forcedShapeId: "risk_or_skip",
    forcedStage: stage,
  });
}

function acceptOption(manifest: JourneyManifest): JourneyOption {
  const option = manifest.options.find((entry) =>
    entry.pickBehavior !== "leave"
  );

  expect(option).toBeDefined();
  return option!;
}

function skipOption(manifest: JourneyManifest): JourneyOption {
  const option = manifest.options.find((entry) =>
    entry.pickBehavior === "leave"
  );

  expect(option).toBeDefined();
  return option!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function randomEnvelope(manifest: JourneyManifest): Record<string, unknown> {
  const [envelope] = manifest.precommitted.random ?? [];

  expect(envelope).toBeDefined();
  expect(isRecord(envelope)).toBe(true);
  return envelope as Record<string, unknown>;
}

function assertRiskOrSkipManifest(manifest: JourneyManifest) {
  expect(manifest.shapeId).toBe("risk_or_skip");
  expect(manifest.options).toHaveLength(2);
  expect(manifest.precommitted.random).toHaveLength(1);
  expect(manifest.precommitted.delayed).toBeUndefined();
  expect(manifest.precommitted.routeEdits).toBeUndefined();
  expect(manifest.precommitted.sequenceMenus).toBeUndefined();

  const accept = acceptOption(manifest);
  const skip = skipOption(manifest);
  const envelope = randomEnvelope(manifest);

  expect(accept.effects.length).toBeGreaterThan(0);
  expect(accept.effectConvertedEssence).toBeGreaterThan(0);
  expect(accept.costs).toEqual([]);
  expect(accept.burdens).toEqual([]);
  expect(accept.costConvertedEssence).toBe(0);
  expect(accept.burdenConvertedEssence).toBe(0);
  expect(accept.uncertaintyConvertedEssence).toBeLessThan(0);
  expect(accept.text).toMatch(
    /\b\d+% chance to .+; otherwise no downside\.$/u,
  );
  expect(accept.text).not.toMatch(/\brandom essence\b/iu);

  expect(skip.text).toBe("Leave with no effect.");
  expect(skip.effects).toEqual([]);
  expect(skip.costs).toEqual([]);
  expect(skip.burdens).toEqual([]);
  expect(skip.netConvertedEssence).toBe(0);

  expect(["chance_to_gain_bane", "chance_to_pay_cost"]).toContain(
    envelope.kind,
  );
  expect(envelope.optionNumber).toBe(1);
  expect(envelope.odds).toMatchObject({
    denominator: 100,
    percent: expect.any(Number),
  });
  expect(["bane", "safe", "paid", "free"]).toContain(
    envelope.committedResult,
  );
  expect(envelope.constraints).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        constraintKind: "shape_invariant",
        shapeId: "risk_or_skip",
        ruleId: "risk_or_skip_bounded_downside",
      }),
    ]),
  );
}

describe("risk_or_skip fill", () => {
  it("uses a shape-local bounded random downside contract", () => {
    expect(riskOrSkipPlugin.definition).toMatchObject({
      topology: "single_offer_refusal",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["risk", "reward", "random", "refusal", "temptation"],
      validationRules: [
        "root_option_count_within_bounds",
        "options_match_shape_topology",
        "option_values_are_comparable_for_shape",
        "symmetric_option_values_are_comparable",
        "accept_option_has_guaranteed_reward",
        "downside_is_random_inside_visible_envelope",
        "skip_option_has_leave_behavior",
      ],
      repairPreferences: [
        "add_skip_option",
        "move_guaranteed_cost_to_single_offer",
        "bound_random_downside",
      ],
      requiresPrecommittedRandom: true,
      payloadCompatibility: expect.arrayContaining([
        expect.objectContaining({
          familyId: "random",
          variants: ["adapter-compatible-random-envelope"],
          legality: "legal",
        }),
        expect.objectContaining({
          familyId: "resource",
          variants: ["adapter-compatible-resource-operations"],
          legality: "legal",
        }),
        expect.objectContaining({
          familyId: "decision_tree",
          variants: [],
          legality: "unsupported",
        }),
      ]),
    });
    expect(
      riskOrSkipPlugin.validators?.map((validator) => validator.ruleId),
    ).toEqual(["risk_or_skip_envelope"]);
  });

  it("generates valid risk-or-skip offers for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:risk_or_skip:${stage}:${seedNumber}`;
        const manifest = await forcedRiskOrSkipManifest(seed, stage);

        assertRiskOrSkipManifest(manifest);
        expect(manifest.stage).toBe(stage);
      }
    }
  });

  it("replays the same forced seed without changing reward or envelope structure", async () => {
    const seed = "migration:risk_or_skip:replay";
    const first = await forcedRiskOrSkipManifest(seed, "mid");
    const second = await forcedRiskOrSkipManifest(seed, "mid");

    assertRiskOrSkipManifest(first);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    expect(first.references).toEqual(second.references);
  });

  it("samples both tempting and skippable accept values across audited seeds", async () => {
    const acceptNets: number[] = [];
    const rewardFrames = new Set<string>();

    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:risk_or_skip:${stage}:${seedNumber}`;
        const manifest = await forcedRiskOrSkipManifest(seed, stage);
        const accept = acceptOption(manifest);

        acceptNets.push(accept.netConvertedEssence);
        rewardFrames.add(accept.effects.map((effect) =>
          isRecord(effect) && typeof effect.kind === "string"
            ? effect.kind
            : "unknown"
        ).join("+"));
      }
    }

    expect(Math.max(...acceptNets)).toBeGreaterThan(0);
    expect(Math.min(...acceptNets)).toBeLessThanOrEqual(15);
    expect(rewardFrames.size).toBeGreaterThanOrEqual(3);
  });

  it("rejects guaranteed downside and missing envelope mutations", async () => {
    const manifest = await forcedRiskOrSkipManifest(
      "migration:risk_or_skip:validator",
      "mid",
    );
    const accept = acceptOption(manifest);

    expect(validateRiskOrSkip(manifest).ok).toBe(true);

    expect(validateRiskOrSkip({
      ...manifest,
      options: [
        {
          ...accept,
          costs: [{ kind: "essence", amount: 25, timing: "immediate" }],
          costConvertedEssence: 25,
          netConvertedEssence: accept.netConvertedEssence - 25,
        },
        skipOption(manifest),
      ],
    }).rule).toBe("downside_is_random_inside_visible_envelope");

    expect(validateRiskOrSkip({
      ...manifest,
      precommitted: { ...manifest.precommitted, random: [] },
    }).rule).toBe("missing_precommitted_outcomes");
  });
});
