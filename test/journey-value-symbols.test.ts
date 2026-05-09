import { describe, expect, it } from "vitest";
import type { JourneyOption } from "../src/journey/manifest.js";
import { adaptJourneyOptionOperations } from "../src/journey/operationAdapters.js";
import { symbolsForOption } from "../src/journey/symbols.js";
import {
  evaluateOptionValue,
  semanticAllRemainingCostBand,
  semanticBatchSizeBand,
  semanticHookCounterBand,
  semanticMaxResourceEffectBand,
  semanticOperationArityBand,
  semanticPercentageCostBand,
  semanticRandomRangeBand,
  semanticRouteScopeBand,
  valueCardDraft,
  valueDreamsignDraft,
  valueEssenceGain,
  valueRandomCardGain,
  VALUE_MODEL_CONTRIBUTION,
  VALUE_MODEL_VERSION,
} from "../src/journey/value.js";

function option(overrides: Partial<JourneyOption> = {}): JourneyOption {
  const built = {
    number: 1,
    symbols: [],
    text: "Gain 20 essence.",
    costs: [],
    effects: [{ kind: "essence", amount: 20 }],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 20,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 20,
    pickBehavior: "record_and_generate_next",
    ...overrides,
  };

  return {
    ...built,
    operations: overrides.operations ?? adaptJourneyOptionOperations(built),
  };
}

describe("evaluateOptionValue", () => {
  it("returns the numeric converted essence fields from the option", () => {
    expect(
      evaluateOptionValue(
        option({
          number: 2,
          costConvertedEssence: 15,
          effectConvertedEssence: 40,
          burdenConvertedEssence: -8,
          uncertaintyConvertedEssence: -3,
          netConvertedEssence: 14,
        }),
      ),
    ).toMatchObject({
      optionNumber: 2,
      cost: 15,
      effect: 40,
      burden: -8,
      uncertainty: -3,
      net: 14,
      components: [
        {
          kind: "effect",
          operationId: "option:2:effect:1",
          value: 40,
        },
        {
          kind: "uncertainty",
          value: -3,
        },
      ],
      detail: expect.arrayContaining([
        "Cost: 15 converted essence.",
        "Effect: +40 converted essence.",
        "Burden: -8 converted essence.",
        "Uncertainty: -3 converted essence.",
        "Net: +14 converted essence.",
        "Component effect: reward reward (+40).",
        "Component uncertainty: option uncertainty (-3).",
      ]),
    });
  });

  it("exports a stable value model contribution with version and values", () => {
    expect(VALUE_MODEL_VERSION).toBe("value:v10");
    expect(VALUE_MODEL_CONTRIBUTION).toMatchObject({
      version: "value:v10",
      values: {
        essence: {
          gainUnit: 1,
          restoreToFullFallback: {
            early: 110,
            mid: 90,
            late: 60,
          },
          maxEssenceMultiplier: 2,
        },
        route: {
          removeAllValuableSites: -90,
          burdenedDreamJourneyRoute: 35,
          compoundRouteMinorReward: 30,
        },
        omens: {
          gainEach: 65,
          lossEach: -65,
        },
        cards: {
          draftBase: 18,
          draftSpecificityValues: {
            broadCardType: 0,
            subtype: 15,
            namedOrId: 40,
          },
          namedVisibleByRarity: {
            common: 75,
            uncommon: 95,
            rare: 120,
          },
        },
        dreamsigns: {
          draftBase: 300,
          draftChoiceValues: {
            choices3: 75,
          },
        },
        banes: {
          gainedByName: {
            Nightmare: -125,
            Lethargy: -170,
          },
          purgeInverseMultiplier: 0.9,
        },
        lossChoices: {
          minimumComparableMagnitude: 65,
          maximumComparableRatio: 2,
        },
        positiveMenus: {
          maximumComparableSpread: 100,
          minimumComparableRatio: 0.7,
          symmetricMaximumComparableSpread: 250,
          symmetricMinimumComparableRatio: 0.35,
        },
        objectQuality: {
          namedCardFallback: 100,
          namedDreamsignFallback: 145,
        },
      },
    });
  });

  it("keeps literal essence, typed card drafts, and Dreamsign choices in distinct value bands", () => {
    expect(valueEssenceGain(150)).toBe(150);
    expect(valueCardDraft({
      takeCount: 1,
      choiceCount: 4,
      predicate: { cardType: "Character" },
    })).toBeLessThan(75);
    expect(valueDreamsignDraft({ choiceCount: 3 })).toBeGreaterThanOrEqual(300);
    expect(valueDreamsignDraft({ choiceCount: 3 })).toBeGreaterThan(
      valueCardDraft({
        takeCount: 1,
        choiceCount: 4,
        predicate: { cardType: "Character" },
      }),
    );
  });

  it("scales card draft value by predicate specificity", () => {
    const broadCharacters = valueCardDraft({
      takeCount: 1,
      choiceCount: 4,
      predicate: { cardType: "Character" },
    });
    const warriorCharacters = valueCardDraft({
      takeCount: 1,
      choiceCount: 4,
      predicate: { cardType: "Character", subtype: "Warrior" },
    });
    const namedCards = valueCardDraft({
      takeCount: 1,
      choiceCount: 4,
      predicate: { ids: ["card-1"] },
    });

    expect(broadCharacters).toBe(25);
    expect(warriorCharacters).toBeGreaterThan(broadCharacters);
    expect(namedCards).toBeGreaterThan(warriorCharacters);
  });

  it("separates card draft breadth, take count, copy count, random gains, and temporary gains", () => {
    const oneOfFour = valueCardDraft({
      takeCount: 1,
      choiceCount: 4,
      predicate: { cardType: "Event" },
    });
    const twoOfFour = valueCardDraft({
      takeCount: 2,
      choiceCount: 4,
      predicate: { cardType: "Event" },
    });
    const copiedPick = valueCardDraft({
      takeCount: 1,
      choiceCount: 4,
      copyCount: 2,
      predicate: { cardType: "Event" },
    });
    const randomEvents = valueRandomCardGain({
      count: 2,
      predicate: { cardType: "Event" },
    });
    const temporaryRandomEvents = valueRandomCardGain({
      count: 2,
      predicate: { cardType: "Event" },
      temporary: true,
    });

    expect(twoOfFour).toBeGreaterThan(oneOfFour);
    expect(copiedPick).toBeGreaterThan(oneOfFour);
    expect(randomEvents).toBeGreaterThan(oneOfFour);
    expect(temporaryRandomEvents).toBeLessThan(randomEvents);
  });

  it("exposes semantic equivalence bands for value comparability dimensions", () => {
    expect(semanticPercentageCostBand(50)).toBe("percentage-cost:moderate");
    expect(semanticMaxResourceEffectBand(-20)).toBe("max-resource-loss:standard");
    expect(semanticAllRemainingCostBand("essence")).toBe("essence:all-remaining");
    expect(semanticRandomRangeBand(25, 125)).toBe("random-range:wide");
    expect(semanticBatchSizeBand(3)).toBe("batch-size:small");
    expect(semanticHookCounterBand(2)).toBe("hook-counter:short");
    expect(semanticRouteScopeBand("full_atlas")).toBe("route-scope:full-atlas");
    expect(semanticOperationArityBand(3)).toBe("operation-arity:menu");
  });

  it("explains named, random, generated, route, status, and compound value components", () => {
    const evaluated = evaluateOptionValue(
      option({
        text: "Gain a named card and reshape the route.",
        effects: [
          {
            kind: "card_gain",
            cardName: "Nocturne Strummer",
            componentConvertedEssence: 140,
            compoundComponentRole: "primary_reward",
          },
          {
            kind: "dreamsign_gain",
            dreamsignName: "Ginger Root",
            componentConvertedEssence: 145,
          },
          {
            kind: "generated_object_grant",
            generatedObjectId: "generated-dreamsign",
            generatedObjectKind: "dreamsign",
            generatedObjectName: "Lantern Echo",
            generatedObjectReferenceKind: "placeholder",
            componentConvertedEssence: 155,
          },
          {
            kind: "visible_pool",
            expectedConvertedEssence: 130,
            riskPremiumConvertedEssence: -12,
            worstCaseBurdenConvertedEssence: -80,
            minimum: 25,
            maximum: 125,
          },
        ],
        burdens: [
          {
            kind: "status_reward_reduction",
            statusScope: "reward",
            ruleMutationKind: "battle_reward_reduction",
            replacedRewardKind: "battle_rewards",
            polarity: "negative",
            componentConvertedEssence: -120,
          },
        ],
        routeEffects: [
          {
            kind: "route_add_site",
            routeOperationKind: "add_site",
            routeScope: "full_atlas",
            routePolarity: "positive",
            siteType: "Dream Journey",
            siteDeltaValue: 90,
          },
        ],
        effectConvertedEssence: 530,
        burdenConvertedEssence: -120,
        uncertaintyConvertedEssence: -12,
        netConvertedEssence: 398,
      }),
    );
    const componentKinds = evaluated.components.map((component) => component.kind);

    expect(componentKinds).toEqual(
      expect.arrayContaining([
        "named-card-quality",
        "named-dreamsign-quality",
        "generated-object-confidence",
        "random-envelope-risk",
        "reward-replacement",
        "compound-bundle",
        "route-scope",
        "route-polarity",
      ]),
    );
    expect(evaluated.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "named-card-quality", value: 140 }),
        expect.objectContaining({ kind: "named-dreamsign-quality", value: 145 }),
        expect.objectContaining({ kind: "compound-bundle", value: 140 }),
        expect.objectContaining({ kind: "random-envelope-risk", value: -12 }),
      ]),
    );
  });
});

describe("symbolsForOption", () => {
  it("returns stable symbols for positive, costed, risky, and leave options", () => {
    expect(symbolsForOption(option())).toEqual(["reward"]);
    expect(
      symbolsForOption(
        option({
          costs: [{ kind: "essence", amount: 10 }],
          costConvertedEssence: 10,
          netConvertedEssence: 10,
        }),
      ),
    ).toEqual(["reward", "cost"]);
    expect(
      symbolsForOption(
        option({
          burdens: [{ kind: "nightmare" }],
          burdenConvertedEssence: -80,
          netConvertedEssence: -60,
        }),
      ),
    ).toEqual(["reward", "risk"]);
    expect(
      symbolsForOption(
        option({
          costs: [{ kind: "essence", amount: 10 }],
          burdens: [{ kind: "nightmare" }],
          costConvertedEssence: 10,
          burdenConvertedEssence: -80,
          netConvertedEssence: -70,
        }),
      ),
    ).toEqual(["reward", "cost", "risk"]);
    expect(
      symbolsForOption(
        option({
          pickBehavior: "leave",
          text: "Leave.",
          effects: [],
          effectConvertedEssence: 0,
          netConvertedEssence: 0,
        }),
      ),
    ).toEqual(["leave"]);
  });

  it("does not mutate option symbols", () => {
    const source = option({ symbols: ["existing"] });

    expect(symbolsForOption(source)).toEqual(["reward"]);
    expect(source.symbols).toEqual(["existing"]);
  });
});
