import { describe, expect, it } from "vitest";
import type { JourneyOption } from "../src/journey/manifest.js";
import { symbolsForOption } from "../src/journey/symbols.js";
import {
  evaluateOptionValue,
  valueCardDraft,
  valueDreamsignDraft,
  valueEssenceGain,
  VALUE_MODEL_CONTRIBUTION,
  VALUE_MODEL_VERSION,
} from "../src/journey/value.js";

function option(overrides: Partial<JourneyOption> = {}): JourneyOption {
  return {
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
    ).toEqual({
      optionNumber: 2,
      cost: 15,
      effect: 40,
      burden: -8,
      uncertainty: -3,
      net: 14,
      detail: [
        "Cost: 15 converted essence.",
        "Effect: +40 converted essence.",
        "Burden: -8 converted essence.",
        "Uncertainty: -3 converted essence.",
        "Net: +14 converted essence.",
      ],
    });
  });

  it("exports a stable value model contribution with version and values", () => {
    expect(VALUE_MODEL_VERSION).toBe("value:v4");
    expect(VALUE_MODEL_CONTRIBUTION).toMatchObject({
      version: "value:v4",
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
        omens: {
          gainEach: 65,
          lossEach: -65,
        },
        cards: {
          draftBase: 32,
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
