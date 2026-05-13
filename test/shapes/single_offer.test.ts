import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
} from "../../src/journey/manifest.js";
import { singleOfferPlugin } from "../../src/journey/shapes/single_offer/index.js";
import { validateSingleOffer } from "../../src/journey/shapes/single_offer/validators.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import { makeTestContext } from "../helpers/journey-context.js";

const auditStages: readonly JourneyStage[] = ["early", "mid", "late"];
const auditSeedNumbers = Array.from({ length: 10 }, (_entry, index) =>
  String(index + 1).padStart(2, "0"),
);
const maximumTakeNetByStage: Record<JourneyStage, number> = {
  early: 190,
  mid: 170,
  late: 180,
};
const minimumTakeNetByStage: Record<JourneyStage, number> = {
  early: 20,
  mid: -20,
  late: -40,
};

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedSingleOfferManifest(seed: string, stage: JourneyStage) {
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
    forcedShapeId: "single_offer",
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

function leaveOption(manifest: JourneyManifest): JourneyOption {
  const option = manifest.options.find((entry) =>
    entry.pickBehavior === "leave"
  );
  expect(option).toBeDefined();
  return option!;
}

function assertSingleOfferManifest(manifest: JourneyManifest) {
  expect(manifest.shapeId).toBe("single_offer");
  expect(manifest.tree).toBeUndefined();
  expect(manifest.rewardPool).toBeUndefined();
  expect(manifest.options).toHaveLength(2);
  expect(manifest.options.map((option) => option.number)).toEqual([1, 2]);
  expect(manifest.precommitted.random).toBeUndefined();
  expect(manifest.precommitted.delayed).toBeUndefined();
  expect(manifest.precommitted.routeEdits).toBeUndefined();
  expect(manifest.precommitted.sequenceMenus).toBeUndefined();

  const take = acceptOption(manifest);
  const leave = leaveOption(manifest);

  expect(take.pickBehavior).toBe("record_and_generate_next");
  expect(take.effects.length).toBeGreaterThan(0);
  expect(take.effectConvertedEssence).toBeGreaterThan(0);
  expect(
    take.costs.length > 0 ||
      take.burdens.length > 0 ||
      take.costConvertedEssence > 0 ||
      take.burdenConvertedEssence < 0,
  ).toBe(true);
  expect(take.netConvertedEssence).toBe(
    take.effectConvertedEssence -
      take.costConvertedEssence +
      take.burdenConvertedEssence +
      take.uncertaintyConvertedEssence,
  );

  expect(leave.text).toBe("Leave with no effect.");
  expect(leave.effects).toEqual([]);
  expect(leave.costs).toEqual([]);
  expect(leave.burdens).toEqual([]);
  expect(leave.triggers).toEqual([]);
  expect(leave.routeEffects).toEqual([]);
  expect(leave.costConvertedEssence).toBe(0);
  expect(leave.effectConvertedEssence).toBe(0);
  expect(leave.burdenConvertedEssence).toBe(0);
  expect(leave.uncertaintyConvertedEssence).toBe(0);
  expect(leave.netConvertedEssence).toBe(0);
}

function assertNoObscuredSingleOfferExchange(option: JourneyOption) {
  expect(option.text).not.toMatch(
    /\b(?:Draft \d|Choose 1 of|random|chosen Starter)\b/iu,
  );

  const serializedOption = JSON.stringify(option);

  expect(serializedOption).not.toContain("hidden_random");
  expect(serializedOption).not.toContain("card_draft");
  expect(serializedOption).not.toContain("dreamsign_draft");
}

function assertNoGenericPersistentProhibition(option: JourneyOption) {
  const serializedOption = JSON.stringify(option);

  expect(serializedOption).not.toContain("status_persistent_prohibition");
  expect(serializedOption).not.toContain("persistent_prohibition");
  expect(serializedOption).not.toContain("modify_deck");
  expect(serializedOption).not.toContain("transfigure_cards");
}

describe("single_offer fill", () => {
  it("uses a shape-local take-or-leave contract", () => {
    expect(singleOfferPlugin.definition).toMatchObject({
      topology: "single_offer_refusal",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["offer", "cost", "reward", "refusal", "bargain"],
      validationRules: [
        "root_option_count_within_bounds",
        "options_match_shape_topology",
        "option_values_are_comparable_for_shape",
        "symmetric_option_values_are_comparable",
        "one_take_option_and_one_refusal_option",
        "take_option_has_visible_meaningful_trade",
      ],
      repairPreferences: [
        "add_refusal_option",
        "make_trade_cost_visible",
        "rebalance_offer_value",
      ],
      payloadCompatibility: expect.arrayContaining([
        expect.objectContaining({
          familyId: "resource",
          variants: ["adapter-compatible-resource-operations"],
          legality: "legal",
        }),
        expect.objectContaining({
          familyId: "random",
          variants: [],
          legality: "unsupported",
        }),
        expect.objectContaining({
          familyId: "decision_tree",
          variants: [],
          legality: "unsupported",
        }),
      ]),
    });
    expect(
      singleOfferPlugin.validators?.map((validator) => validator.ruleId),
    ).toEqual(["single_offer_take_or_leave_contract"]);
  });

  it("is deterministic for the same draw context", () => {
    const bundle = makeTestContext({
      seed: "migration:single_offer:deterministic",
      stage: "mid",
    });
    const args = {
      context: bundle.context,
      drawContext: bundle.drawContext,
      stage: bundle.stage,
    };

    const first = singleOfferPlugin.fill(args);
    const second = singleOfferPlugin.fill(args);

    expect(first.options).toHaveLength(2);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
  });

  it("rejects malformed take-or-leave offers through the shape validator", async () => {
    const manifest = await forcedSingleOfferManifest(
      "migration:single_offer:validator",
      "mid",
    );
    const take = acceptOption(manifest);
    const leave = leaveOption(manifest);

    expect(validateSingleOffer(manifest).ok).toBe(true);

    expect(validateSingleOffer({
      ...manifest,
      options: [take, { ...leave, pickBehavior: "record_and_generate_next" }],
    }).rule).toBe("one_take_option_and_one_refusal_option");

    expect(validateSingleOffer({
      ...manifest,
      options: [
        {
          ...take,
          costs: [],
          burdens: [],
          costConvertedEssence: 0,
          burdenConvertedEssence: 0,
          netConvertedEssence: take.effectConvertedEssence,
        },
        leave,
      ],
    }).rule).toBe("take_option_has_visible_meaningful_trade");

    expect(validateSingleOffer({
      ...manifest,
      options: [
        take,
        {
          ...leave,
          effects: take.effects,
          effectConvertedEssence: take.effectConvertedEssence,
          netConvertedEssence: take.effectConvertedEssence,
        },
      ],
    }).rule).toBe("refusal_option_has_no_effect");
  });

  it("generates valid take-or-leave offers for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:single_offer:${stage}:${seedNumber}`;
        const manifest = await forcedSingleOfferManifest(seed, stage);

        assertSingleOfferManifest(manifest);
        expect(manifest.stage).toBe(stage);
        expect(manifest.debug.validation.ok, seed).toBe(true);

        const take = acceptOption(manifest);

        expect(
          take.netConvertedEssence,
          `${seed}: ${take.text}`,
        ).toBeGreaterThanOrEqual(minimumTakeNetByStage[stage]);
        expect(
          take.netConvertedEssence,
          `${seed}: ${take.text}`,
        ).toBeLessThanOrEqual(maximumTakeNetByStage[stage]);
        assertNoObscuredSingleOfferExchange(take);
        assertNoGenericPersistentProhibition(take);
      }
    }
  });

  it("renders near-cap fixed essence rewards as realizable value", async () => {
    const manifest = await forcedSingleOfferManifest(
      "audit:single_offer:mid:02",
      "mid",
    );
    const take = acceptOption(manifest);

    expect(take.text).toContain("Pay 25% of current essence (100).");
    expect(take.text).toContain("Gain 200 essence.");
    expect(take.effectConvertedEssence).toBe(200);
    expect(take.netConvertedEssence).toBe(100);
  });

  it("replays the same forced seed without changing offer structure", async () => {
    const seed = "migration:single_offer:replay";
    const first = await forcedSingleOfferManifest(seed, "mid");
    const second = await forcedSingleOfferManifest(seed, "mid");

    assertSingleOfferManifest(first);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    expect(first.references).toEqual(second.references);
    expect(first.distinctness).toEqual(second.distinctness);
  });
});
