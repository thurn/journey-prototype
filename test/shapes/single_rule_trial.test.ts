import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
} from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import { singleRuleTrialPlugin } from "../../src/journey/shapes/single_rule_trial/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import {
  makeTestContext,
  runShapeValidators,
} from "../helpers/journey-context.js";

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

async function forcedSingleRuleTrialManifest(
  seed: string,
  stage: JourneyStage,
) {
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
    forcedShapeId: "single_rule_trial",
    forcedStage: stage,
  });
}

function statusRuleEffect(option: JourneyOption): Record<string, unknown> {
  const statusEffect = option.effects.find(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { kind?: unknown }).kind === "string" &&
      ((entry as { kind: string }).kind).startsWith("status_") &&
      typeof (entry as { ruleMutationKind?: unknown }).ruleMutationKind ===
        "string",
  ) as Record<string, unknown> | undefined;

  expect(statusEffect).toBeDefined();
  return statusEffect!;
}

function assertSingleRuleTrialOption(option: JourneyOption) {
  expect(option.costs).toEqual([]);
  expect(option.burdens).toEqual([]);
  expect(option.triggers).toEqual([]);
  expect(option.routeEffects).toEqual([]);
  expect(option.costConvertedEssence).toBe(0);
  expect(option.burdenConvertedEssence).toBe(0);
  expect(option.pickBehavior).toBe("record_and_generate_next");
  expect(option.effectConvertedEssence).toBeGreaterThan(0);
  expect(option.netConvertedEssence).toBe(
    option.effectConvertedEssence + option.uncertaintyConvertedEssence,
  );
  expect(option.text).not.toMatch(/\byields choose\b/iu);

  const statusEffect = statusRuleEffect(option);

  expect(statusEffect.statusName).toEqual(expect.any(String));
  expect(statusEffect.statusScope).toEqual(expect.any(String));
  expect(statusEffect.duration).toEqual(expect.any(String));
  expect(statusEffect.ruleMutationKind).toEqual(expect.any(String));
}

function statusKind(option: JourneyOption): string {
  const kind = statusRuleEffect(option).kind;

  expect(typeof kind).toBe("string");
  return kind as string;
}

function ruleMutationKind(option: JourneyOption): string {
  const kind = statusRuleEffect(option).ruleMutationKind;

  expect(typeof kind).toBe("string");
  return kind as string;
}

function assertRewardReplacementOption(option: JourneyOption) {
  const statusEffect = statusRuleEffect(option);

  expect(statusEffect.kind).toBe("status_reward_replacement");
  expect(statusEffect.statusName).toBe("Spoiled Victory");
  expect(statusEffect.ruleMutationKind).toBe("next_victory_reward_replacement");
  expect(statusEffect.replacedRewardKind).toBe("card_rewards");
  expect(["dreamsign_draft", "resource"]).toContain(
    statusEffect.replacementKind,
  );
}

function assertSingleRuleTrialManifest(manifest: JourneyManifest) {
  expect(manifest.shapeId).toBe("single_rule_trial");
  expect(manifest.tree).toBeUndefined();
  expect(manifest.rewardPool).toBeUndefined();
  expect(manifest.options).toHaveLength(1);
  expect(manifest.options.map((option) => option.number)).toEqual([1]);
  expect(manifest.precommitted.random).toBeUndefined();
  expect(manifest.precommitted.delayed).toBeUndefined();
  expect(manifest.precommitted.routeEdits).toBeUndefined();
  expect(manifest.precommitted.sequenceMenus).toBeUndefined();
  assertSingleRuleTrialOption(manifest.options[0]!);
}

describe("single_rule_trial plugin", () => {
  it("declares rootOptionCount min and max of 1", () => {
    const plugin = getShapePlugin("single_rule_trial");
    expect(plugin).toBeDefined();
    expect(plugin!.definition.rootOptionCount).toEqual({ min: 1, max: 1 });
  });
});

describe("singleRuleTrialFill", () => {
  it("uses a shape-local rule mutation contract", () => {
    expect(singleRuleTrialPlugin.definition).toMatchObject({
      topology: "single_rule_trial",
      rootOptionCount: { min: 1, max: 1 },
      supportedTags: ["status", "rule", "trial", "single"],
      validationRules: [
        "root_option_count_within_bounds",
        "single_option_applies_a_rule_status",
        "single_option_has_no_meaningful_cost_or_choice",
      ],
      repairPreferences: [
        "remove_extra_options",
        "remove_cost_or_burden",
        "promote_status_to_visible_effect",
      ],
      payloadCompatibility: expect.arrayContaining([
        expect.objectContaining({
          familyId: "status",
          variants: ["adapter-compatible-status-rule-mutation"],
          legality: "legal",
        }),
        expect.objectContaining({
          familyId: "resource",
          variants: [],
          legality: "unsupported",
        }),
        expect.objectContaining({
          familyId: "decision_tree",
          variants: [],
          legality: "unsupported",
        }),
      ]),
      menuValueChecks: {
        positiveBands: false,
        symmetricBands: false,
        escalationOrRiskExempt: true,
      },
    });
  });

  it("produces exactly one status rule option with no cost", () => {
    const { context, drawContext, stage } = makeTestContext({
      seed: "single-rule-1",
    });
    const filled = singleRuleTrialPlugin.fill({ context, drawContext, stage });

    expect(filled).toBeDefined();
    expect(filled.options.length).toBe(1);

    const [only] = filled.options;
    expect(only).toBeDefined();
    assertSingleRuleTrialOption(only!);
  });

  it("is deterministic for the same draw context", () => {
    const bundle = makeTestContext({
      seed: "migration:single_rule_trial:deterministic",
      stage: "mid",
    });
    const args = {
      context: bundle.context,
      drawContext: bundle.drawContext,
      stage: bundle.stage,
    };

    const first = singleRuleTrialPlugin.fill(args);
    const second = singleRuleTrialPlugin.fill(args);

    expect(first.options).toHaveLength(1);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    assertSingleRuleTrialOption(first.options[0]!);
  });

  it("generates valid single rule trials for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:single_rule_trial:${stage}:${seedNumber}`;
        const manifest = await forcedSingleRuleTrialManifest(seed, stage);

        assertSingleRuleTrialManifest(manifest);
        expect(manifest.stage).toBe(stage);
      }
    }
  });

  it("varies rule mutations across audited stage seeds", async () => {
    const sampledRules = new Set<string>();
    const sampledTexts = new Set<string>();

    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:single_rule_trial:${stage}:${seedNumber}`;
        const manifest = await forcedSingleRuleTrialManifest(seed, stage);
        const [option] = manifest.options;

        expect(option).toBeDefined();
        sampledRules.add(`${statusKind(option!)}:${ruleMutationKind(option!)}`);
        sampledTexts.add(option!.text);
      }
    }

    expect(sampledRules.size).toBeGreaterThanOrEqual(4);
    expect(sampledTexts.size).toBeGreaterThanOrEqual(6);
  });

  it("renders reward replacement trials with clean draft grammar", async () => {
    let replacementOption: JourneyOption | undefined;

    for (const seedNumber of auditSeedNumbers) {
      const seed = `audit:single_rule_trial:early:${seedNumber}`;
      const manifest = await forcedSingleRuleTrialManifest(seed, "early");
      const [option] = manifest.options;

      if (option && statusKind(option) === "status_reward_replacement") {
        replacementOption = option;
        break;
      }
    }

    expect(replacementOption).toBeDefined();
    assertRewardReplacementOption(replacementOption!);
    expect(replacementOption!.text).toMatch(
      /^Your next victory yields (?:a \d-Dreamsign draft|\d+ essence) instead of card rewards\.$/u,
    );
  });

  it("replays the same forced seed without changing rule structure", async () => {
    const seed = "migration:single_rule_trial:replay";
    const first = await forcedSingleRuleTrialManifest(seed, "mid");
    const second = await forcedSingleRuleTrialManifest(seed, "mid");

    assertSingleRuleTrialManifest(first);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    expect(first.references).toEqual(second.references);
  });
});

const TEST_CONTENT_VERSION = "test-content-version";

/**
 * Builds a minimal `single_rule_trial` manifest whose only option declares a
 * non-zero cost and no status effect, so it triggers both shape validators.
 * The helper deliberately fills only the fields the validators inspect.
 */
function synthesizeSingleRuleTrialManifestWithCost(): JourneyManifest {
  return {
    schemaVersion: 2,
    versions: {
      contentVersion: TEST_CONTENT_VERSION,
      shapeCatalogVersion: "journey-shapes:test",
      effectCatalogVersion: "effects:test",
      valueModelVersion: "value:test",
      rendererVersion: "renderer:test",
      manifestContractVersion: "manifest:test",
    },
    journeyId: "J-000003",
    seed: "synth-single-rule-cost",
    rootJourneyIndex: 1,
    shapeId: "single_rule_trial",
    stage: "mid",
    dreamscape: 0,
    selectedTags: [],
    options: [
      {
        number: 1,
        symbols: [],
        text: "Pay 25 essence.",
        operations: [],
        costs: [{ kind: "essence", amount: 25, timing: "immediate" }],
        effects: [],
        burdens: [],
        targets: [],
        triggers: [],
        routeEffects: [],
        costConvertedEssence: 25,
        effectConvertedEssence: 0,
        burdenConvertedEssence: 0,
        uncertaintyConvertedEssence: 0,
        netConvertedEssence: -25,
        pickBehavior: "record_and_generate_next",
      },
    ],
    generatedObjects: [],
    precommitted: {},
    debug: {
      shapeScores: [],
      selectedShapeId: "single_rule_trial",
      selectedTags: [],
      optionValues: [],
      repairs: [],
      repair: {
        status: "accepted_immediately",
        forcedShape: false,
        finalShapeId: "single_rule_trial",
      },
    },
    references: {
      cardIds: [],
      dreamsignIds: [],
      dreamcallerIds: [],
      baneNames: [],
    },
  } as unknown as JourneyManifest;
}

describe("single_rule_trial validators", () => {
  it("rejects manifests whose single option has a cost and no status effect", () => {
    const manifest = synthesizeSingleRuleTrialManifestWithCost();
    const result = runShapeValidators("single_rule_trial", manifest);
    const ruleIds = result.failures.map((f) => f.ruleId);
    expect(ruleIds).toContain("single_option_applies_a_rule_status");
    expect(ruleIds).toContain("single_option_has_no_meaningful_cost_or_choice");
  });
});
