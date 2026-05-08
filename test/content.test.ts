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
    expect(content.dreamsigns[0]).toMatchObject({
      orientation: "battle",
    });
    expect(
      content.dreamsigns.some((dreamsign) => dreamsign.orientation === "quest"),
    ).toBe(true);
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

  it.each([
    {
      name: "case-insensitive duplicate ids",
      mutate: (bundle: ContentBundle) => {
        bundle.cards.push({
          ...bundle.cards[0],
          id: "CARD-1",
          name: "Duplicate Card",
          raw: {},
        });
      },
      expected: /data\/cards\.toml cards\[2\].*duplicate id.*data\/cards\.toml cards\[1\]/,
    },
    {
      name: "invalid Dreamsign kind",
      mutate: (bundle: ContentBundle) => {
        bundle.dreamsigns[0] = {
          ...bundle.dreamsigns[0],
          kind: "omen" as DreamsignContent["kind"],
        };
      },
      expected: /data\/dreamsigns\.toml dreamsign\[1\].*invalid Dreamsign kind/,
    },
    {
      name: "invalid Dreamsign orientation",
      mutate: (bundle: ContentBundle) => {
        bundle.dreamsigns[0] = {
          ...bundle.dreamsigns[0],
          orientation: "route" as DreamsignContent["orientation"],
        };
      },
      expected: /data\/dreamsigns\.toml dreamsign\[1\].*invalid Dreamsign orientation/,
    },
    {
      name: "malformed tide array element",
      mutate: (bundle: ContentBundle) => {
        bundle.cards[0] = {
          ...bundle.cards[0],
          tides: ["test_tide", ""] as string[],
        };
      },
      expected: /data\/cards\.toml cards\[1\].*tides\[1\]/,
    },
    {
      name: "neutral Dreamsign with a tide",
      mutate: (bundle: ContentBundle) => {
        bundle.dreamsigns[0] = {
          ...bundle.dreamsigns[0],
          kind: "neutral",
          tides: ["test_tide"],
        };
      },
      expected: /data\/dreamsigns\.toml dreamsign\[1\].*neutral Dreamsign must not declare tides/,
    },
    {
      name: "non-integer cardNumber",
      mutate: (bundle: ContentBundle) => {
        bundle.cards[0] = {
          ...bundle.cards[0],
          cardNumber: 1.5,
        };
      },
      expected: /data\/cards\.toml cards\[1\].*cardNumber/,
    },
    {
      name: "invalid rawBytes",
      mutate: (bundle: ContentBundle) => {
        bundle.rawBytes = {
          ...bundle.rawBytes,
          cardsToml: "not bytes" as unknown as Uint8Array,
        };
      },
      expected: /data\/cards\.toml: missing raw TOML bytes/,
    },
  ])("rejects $name with context", ({ mutate, expected }) => {
    const dreamsign: DreamsignContent = {
      id: "neutral-1",
      name: "Neutral Sign",
      kind: "neutral",
      renderedText: "",
      tides: [],
      raw: {},
    };
    const bundle = minimalBundle(dreamsign);

    mutate(bundle);

    expect(() => validateContent(bundle)).toThrow(expected);
  });
});
