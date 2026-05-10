import { describe, expect, it } from "vitest";
import { getShapePlugin } from "../src/journey/shapes.js";
import { singleRuleTrialFill } from "../src/journey/shapes/single_rule_trial/fill.js";
import type { JourneyManifest } from "../src/journey/manifest.js";
import {
  makeTestContext,
  runShapeValidators,
} from "./helpers/journey-context.js";

describe("single_rule_trial plugin", () => {
  it("declares rootOptionCount min and max of 1", () => {
    const plugin = getShapePlugin("single_rule_trial");
    expect(plugin).toBeDefined();
    expect(plugin!.definition.rootOptionCount).toEqual({ min: 1, max: 1 });
  });
});

describe("singleRuleTrialFill", () => {
  it("produces exactly one option whose status_reward_replacement effect carries no cost", () => {
    const { context, drawContext, stage } = makeTestContext({
      seed: "single-rule-1",
    });
    const filled = singleRuleTrialFill({ context, drawContext, stage });

    expect(filled).toBeDefined();
    expect(filled.options.length).toBe(1);

    const [only] = filled.options;
    expect(only).toBeDefined();
    expect(only!.costs).toEqual([]);
    expect(only!.burdens).toEqual([]);
    expect(only!.costConvertedEssence).toBe(0);
    expect(only!.burdenConvertedEssence).toBe(0);
    expect(only!.pickBehavior).toBe("record_and_generate_next");

    const statusEffect = only!.effects.find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { kind?: unknown }).kind === "status_reward_replacement",
    ) as Record<string, unknown> | undefined;
    expect(statusEffect).toBeDefined();
    expect(statusEffect!.statusName).toBe("Spoiled Victory");
    expect(statusEffect!.statusScope).toBe("reward");
    expect(statusEffect!.duration).toBe("one_time");
    expect(statusEffect!.ruleMutationKind).toBe(
      "next_victory_reward_replacement",
    );
    expect(statusEffect!.rewardTrigger).toBe("next_victory");
    expect(statusEffect!.replacedRewardKind).toBe("card_rewards");
    expect(statusEffect!.replacementKind).toBe("dreamsign_draft");
    expect(statusEffect!.replacementPayload).toMatchObject({
      kind: "dreamsign_draft",
    });
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
      validationContractVersion: "validation:test",
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
      semanticFingerprint: {
        algorithm: "semantic-fingerprint:v1",
        value: "synth",
        components: [],
      },
      validation: { ok: true, passed: 0, failed: 0, rules: [] },
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
