import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import type { ContentBundle, DreamsignContent } from "../src/content/model.js";
import { validateContent } from "../src/content/validate.js";

function minimalBundle(
  dreamsign: DreamsignContent,
): ContentBundle {
  return {
    cards: [
      {
        id: "card-1",
        name: "Test Card",
        tides: ["test_tide"],
        rarity: "Starter",
        cardType: "Event",
        energyCost: "*",
        spark: "",
        cardNumber: 1,
        raw: {},
      },
    ],
    dreamcallers: [
      {
        id: "dreamcaller-1",
        name: "Test Caller",
        title: "Tester",
        awakening: "5",
        mandatoryTides: ["test_tide"],
        optionalTides: ["optional_tide"],
        raw: {},
      },
    ],
    dreamsigns: [dreamsign],
    rawBytes: {
      cardsToml: new Uint8Array(),
      dreamcallersToml: new Uint8Array(),
      dreamsignsToml: new Uint8Array(),
    },
  };
}

describe("loadContent", () => {
  it("loads and normalizes current TOML content", async () => {
    const content = await loadContent(process.cwd());

    expect(content.cards).toHaveLength(594);
    expect(content.cards.filter((card) => card.rarity === "Starter")).toHaveLength(
      10,
    );
    expect(content.dreamcallers).toHaveLength(32);
    expect(content.dreamsigns).toHaveLength(154);

    expect(content.cards[0]).toMatchObject({
      cardType: "Character",
      energyCost: 6,
      spark: 4,
      cardNumber: 1,
    });
    expect(content.dreamcallers[0]?.awakening).toBe("5");
    expect(content.dreamcallers[0]?.mandatoryTides.length).toBeGreaterThan(0);
    expect(
      content.dreamsigns.find((dreamsign) => dreamsign.kind === "neutral")?.tides,
    ).toEqual([]);
  });
});

describe("validateContent", () => {
  it("accepts neutral Dreamsigns without tides and normalizes them to empty arrays", () => {
    const dreamsign = {
      id: "neutral-1",
      name: "Neutral Sign",
      kind: "neutral",
      renderedText: "",
      raw: {},
    } as DreamsignContent;

    validateContent(minimalBundle(dreamsign));

    expect(dreamsign.tides).toEqual([]);
  });

  it("rejects tidal Dreamsigns without non-empty tides", () => {
    const dreamsign: DreamsignContent = {
      id: "tidal-1",
      name: "Tidal Sign",
      kind: "tidal",
      renderedText: "",
      tides: [],
      raw: {},
    };

    expect(() => validateContent(minimalBundle(dreamsign))).toThrow(
      /data\/dreamsigns\.toml dreamsign\[1\].*tides/,
    );
  });

  it("rejects missing required fields with row context", () => {
    const dreamsign: DreamsignContent = {
      id: "neutral-1",
      name: "Neutral Sign",
      kind: "neutral",
      renderedText: "",
      tides: [],
      raw: {},
    };
    const bundle = minimalBundle(dreamsign);
    bundle.cards[0] = {
      ...bundle.cards[0],
      name: undefined as unknown as string,
    };

    expect(() => validateContent(bundle)).toThrow(
      /data\/cards\.toml cards\[1\].*name/,
    );
  });
});
