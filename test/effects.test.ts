import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import type { CardContent, ContentBundle, DreamsignContent } from "../src/content/model.js";
import {
  BANE_NAMES,
  DEFAULT_BANE_NAME,
  EFFECT_CATALOG,
  EFFECT_CATALOG_VERSION,
  isImmediateCostPayable,
  resolveBaneTargets,
  resolveCardReference,
  resolveCardTargets,
  resolveDreamcallerReference,
  resolveDreamsignReference,
  resolveDreamsignTargets,
  resolveTargetSelector,
  STANDARD_TRANSFIGURATIONS,
  validateNamedReferences,
} from "../src/journey/effects.js";
import type { GeneratedObjectDefinition, TargetSelector } from "../src/journey/manifest.js";
import type { QuestState } from "../src/state/schema.js";

const cards: CardContent[] = [
  {
    id: "starter-event",
    name: "Starter Event",
    tides: ["ember"],
    rarity: "Starter",
    cardType: "Event",
    energyCost: 0,
    spark: "",
    cardNumber: 1,
    raw: { "is-fast": false },
  },
  {
    id: "fast-character",
    name: "Fast Character",
    tides: ["ember", "void"],
    rarity: "Common",
    cardType: "Character",
    energyCost: 2,
    spark: 3,
    cardNumber: 2,
    raw: { "is-fast": true },
  },
  {
    id: "star-event",
    name: "Star Event",
    tides: ["lunar"],
    rarity: "Rare",
    cardType: "Event",
    energyCost: "*",
    spark: "*",
    cardNumber: 3,
    raw: { "is-fast": false },
  },
];

const dreamsigns: DreamsignContent[] = [
  {
    id: "tidal-sign",
    name: "Tidal Sign",
    kind: "tidal",
    renderedText: "",
    tides: ["ember"],
    raw: {},
  },
  {
    id: "neutral-sign",
    name: "Neutral Sign",
    kind: "neutral",
    renderedText: "",
    tides: [],
    raw: {},
  },
];

const content: ContentBundle = {
  cards,
  dreamcallers: [
    {
      id: "caller-1",
      name: "Caller One",
      title: "Tester",
      awakening: "5",
      mandatoryTides: ["ember"],
      optionalTides: ["void"],
      raw: {},
    },
  ],
  dreamsigns,
  rawBytes: {
    cardsToml: new Uint8Array(),
    dreamcallersToml: new Uint8Array(),
    dreamsignsToml: new Uint8Array(),
  },
};

function quest(overrides: Partial<QuestState> = {}): QuestState {
  return {
    seed: "default",
    dreamcaller: {
      id: "caller-1",
      name: "Caller One",
      title: "Tester",
      awakening: "5",
    },
    resources: {
      essence: 12,
      maxEssence: 20,
      omens: 1,
      dreamscape: 0,
    },
    selectedTides: ["ember"],
    mandatoryTides: ["ember"],
    optionalSubset: [],
    deck: {
      entries: [
        { cardId: "starter-event", copies: 1 },
        { cardId: "fast-character", copies: 1 },
      ],
      summary: {
        totalCards: 2,
        starterCards: 1,
        uniqueCards: 2,
      },
    },
    activeDreamsigns: [{ dreamsignId: "tidal-sign" }],
    dreamsignPoolIds: ["tidal-sign"],
    dreamsignPoolSummary: {
      tidalPoolCount: 1,
      neutralCatalogCount: 1,
    },
    draftPool: [{ cardId: "star-event", copies: 1 }],
    draftPoolSummary: {
      totalCopies: 1,
      uniqueCards: 1,
      oneCopyCards: 1,
      twoCopyCards: 0,
    },
    route: {
      pacingLedger: {},
      unresolvedHooks: [],
    },
    ...overrides,
  };
}

describe("EFFECT_CATALOG", () => {
  it("exports the pinned version and required mechanical families", () => {
    expect(EFFECT_CATALOG_VERSION).toBe("effects:v6");
    expect(DEFAULT_BANE_NAME).toBe("Nightmare");
    expect(BANE_NAMES).toContain("Nightmare");

    const ids = new Set(EFFECT_CATALOG.map((entry) => entry.id));

    [
      "essence-gain",
      "essence-loss",
      "essence-cap",
      "essence-cap-loss",
      "essence-restoration",
      "essence-percentage",
      "essence-all-remaining-cost",
      "essence-random-range",
      "essence-scaled",
      "omen-gain",
      "omen-loss",
      "card-draft",
      "card-gain",
      "card-pack",
      "card-replacement",
      "chosen-purge",
      "random-purge",
      "starter-cleanup",
      "bane-gain",
      "bane-purge",
      "dreamsign-gain",
      "dreamsign-draft",
      "dreamsign-transformation",
      "dreamsign-loss",
      "card-rewrite-lower-cost",
      "card-rewrite-fast",
      "card-rewrite-reclaim",
      "card-duplicate",
      "card-merge",
      "card-split",
      "card-text-mutation",
      "current-route-edit",
      "future-route-edit",
      "triggered-reward",
      "delayed-reward",
      "risk",
      "wager",
      "random-outcome",
      "take-any-number",
      "push-your-luck",
      "sequential-offer",
    ].forEach((id) => expect(ids).toContain(id));

    STANDARD_TRANSFIGURATIONS.forEach((transfiguration) => {
      expect(ids).toContain(`transfiguration-${transfiguration.toLocaleLowerCase("en-US")}`);
    });

    EFFECT_CATALOG.forEach((entry) => {
      expect(entry.textTemplate).toMatch(/[.?!]$/);
      expect(entry.versionContribution).toMatchObject({
        catalogVersion: EFFECT_CATALOG_VERSION,
        id: entry.id,
        family: entry.family,
        textTemplate: entry.textTemplate,
      });
    });
  });

  it("freezes shared catalog entries against accidental mutation", () => {
    const entry = EFFECT_CATALOG[0]!;
    const canonicalBeforeMutationAttempts = EFFECT_CATALOG.map((effect) => ({
      id: effect.id,
      family: effect.family,
      textTemplate: effect.textTemplate,
      tags: [...effect.tags],
      versionContribution: {
        ...effect.versionContribution,
        tags: [...effect.versionContribution.tags],
      },
    }));

    expect(Object.isFrozen(EFFECT_CATALOG)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.tags)).toBe(true);
    expect(Object.isFrozen(entry.versionContribution)).toBe(true);
    expect(Object.isFrozen(entry.versionContribution.tags)).toBe(true);

    expect(() => {
      (EFFECT_CATALOG as unknown[]).push(entry);
    }).toThrow(TypeError);
    expect(() => {
      (entry.tags as string[]).push("mutated");
    }).toThrow(TypeError);
    expect(() => {
      (entry.versionContribution.tags as string[]).push("mutated");
    }).toThrow(TypeError);

    expect(
      EFFECT_CATALOG.map((effect) => ({
        id: effect.id,
        family: effect.family,
        textTemplate: effect.textTemplate,
        tags: [...effect.tags],
        versionContribution: {
          ...effect.versionContribution,
          tags: [...effect.versionContribution.tags],
        },
      })),
    ).toEqual(canonicalBeforeMutationAttempts);
  });
});

describe("reference helpers", () => {
  it("resolves named local content references and reports invalid names", async () => {
    const localContent = await loadContent(process.cwd());
    const card = localContent.cards[0]!;
    const dreamsign = localContent.dreamsigns[0]!;
    const dreamcaller = localContent.dreamcallers[0]!;

    expect(resolveCardReference(localContent, card.name)?.id).toBe(card.id);
    expect(resolveDreamsignReference(localContent, dreamsign.name)?.id).toBe(dreamsign.id);
    expect(resolveDreamcallerReference(localContent, dreamcaller.name)?.id).toBe(
      dreamcaller.id,
    );

    expect(
      validateNamedReferences(localContent, {
        cards: [card.name, "Custom Card"],
        dreamsigns: [dreamsign.name, "Custom Dreamsign"],
        dreamcallers: [dreamcaller.name, "Custom Dreamcaller"],
        banes: ["Nightmare", "Custom Bane"],
        rules: ["Fast", "Custom Status"],
      }),
    ).toEqual({
      ok: false,
      errors: [
        "Unresolved card reference: Custom Card",
        "Unresolved Dreamsign reference: Custom Dreamsign",
        "Unresolved Dreamcaller reference: Custom Dreamcaller",
        "Unresolved Bane reference: Custom Bane",
        "Unresolved rules vocabulary reference: Custom Status",
      ],
    });
  });
});

describe("target resolvers", () => {
  it("filters card targets by supported predicates and current starter deck", () => {
    expect(resolveCardTargets(content, quest(), { cardType: "Character" })).toEqual([
      cards[1],
    ]);
    expect(resolveCardTargets(content, quest(), { energyCost: "*" })).toEqual([
      cards[2],
    ]);
    expect(resolveCardTargets(content, quest(), { isFast: true })).toEqual([
      cards[1],
    ]);
    expect(resolveCardTargets(content, quest(), { spark: 3 })).toEqual([cards[1]]);
    expect(resolveCardTargets(content, quest(), { tideOverlap: "selected" })).toEqual([
      cards[0],
      cards[1],
    ]);
    expect(resolveCardTargets(content, quest(), { starter: true })).toEqual([
      cards[0],
    ]);
    expect(
      resolveCardTargets(
        content,
        quest({
          deck: {
            entries: [{ cardId: "fast-character", copies: 1 }],
            summary: { totalCards: 1, starterCards: 0, uniqueCards: 1 },
          },
        }),
        { starter: true },
      ),
    ).toEqual([]);
  });

  it("keeps neutral Dreamsigns tide-less and out of tide-overlap matches", () => {
    expect(resolveDreamsignTargets(content, quest(), { kind: "neutral" })).toEqual([
      dreamsigns[1],
    ]);
    expect(
      resolveDreamsignTargets(content, quest(), { tideOverlap: "selected" }),
    ).toEqual([dreamsigns[0]]);
    expect(resolveDreamsignTargets(content, quest(), { source: "active" })).toEqual([
      dreamsigns[0],
    ]);
    expect(
      resolveDreamsignTargets(content, quest({ activeDreamsigns: [] }), {
        source: "active",
      }),
    ).toEqual([]);
  });

  it("restricts Bane targets to vocabulary and can require state presence", () => {
    expect(resolveBaneTargets({ names: ["Nightmare"] })).toEqual([
      "Nightmare",
    ]);
    expect(resolveBaneTargets({ source: "state" })).toEqual([]);

    expect(
      resolveBaneTargets(
        { source: "state" },
        { baneNames: ["Nightmare", "Nightmare", "Doubt"] },
      ),
    ).toEqual(["Nightmare", "Doubt"]);
  });

  it("checks immediate payable costs against current resources", () => {
    expect(isImmediateCostPayable(quest(), { essence: 12, omens: 1 })).toBe(true);
    expect(isImmediateCostPayable(quest(), { essence: 13 })).toBe(false);
    expect(isImmediateCostPayable(quest(), { omens: 2 })).toBe(false);
  });

  it("resolves typed target selectors with debug-friendly metadata", () => {
    const selectors: TargetSelector[] = [
      {
        selectorKind: "card",
        selection: "exact",
        referenceKind: "content",
        source: "catalog",
        names: ["Fast Character"],
        required: true,
      },
      {
        selectorKind: "dreamsign",
        selection: "exact",
        referenceKind: "content",
        source: "catalog",
        names: ["Tidal Sign"],
        required: true,
      },
      {
        selectorKind: "dreamcaller",
        selection: "exact",
        referenceKind: "content",
        source: "state",
        names: ["Caller One"],
        required: true,
      },
      {
        selectorKind: "bane",
        selection: "exact",
        referenceKind: "controlled_vocabulary",
        source: "vocabulary",
        names: ["Nightmare"],
        required: true,
      },
      {
        selectorKind: "route_site",
        selection: "exact",
        referenceKind: "controlled_vocabulary",
        scope: "next_dreamscape",
        siteType: "Shop",
        required: true,
      },
      {
        selectorKind: "status",
        selection: "chosen_after_commitment",
        referenceKind: "controlled_vocabulary",
        scope: "battle",
        statusName: "Next battle discount",
        required: true,
      },
      {
        selectorKind: "generated_object",
        selection: "exact",
        referenceKind: "placeholder",
        generatedObjectReferenceKind: "placeholder",
        generatedObjectKind: "card",
        generatedObjectId: "generated-card-1",
        name: "Lantern Made Of Rain",
        required: true,
      },
    ];

    expect(selectors.map((selector) => resolveTargetSelector(content, quest(), selector))).toEqual([
      expect.objectContaining({
        selectorKind: "card",
        selection: "exact",
        sourcePool: "catalog",
        targetOrigin: "catalog_reward",
        candidateCount: 1,
        selected: [expect.objectContaining({ id: "fast-character", name: "Fast Character", kind: "Character" })],
      }),
      expect.objectContaining({
        selectorKind: "dreamsign",
        sourcePool: "catalog",
        targetOrigin: "catalog_reward",
        candidateCount: 1,
        selected: [expect.objectContaining({ id: "tidal-sign", name: "Tidal Sign", kind: "tidal" })],
      }),
      expect.objectContaining({
        selectorKind: "dreamcaller",
        sourcePool: "state",
        targetOrigin: "state_pool",
        candidateCount: 1,
        selected: [expect.objectContaining({ id: "caller-1", name: "Caller One" })],
      }),
      expect.objectContaining({
        selectorKind: "bane",
        sourcePool: "vocabulary",
        targetOrigin: "controlled_vocabulary",
        candidateCount: 1,
        selected: [expect.objectContaining({ name: "Nightmare" })],
      }),
      expect.objectContaining({
        selectorKind: "route_site",
        sourcePool: "next_dreamscape",
        targetOrigin: "catalog_reference",
        candidateCount: 1,
        selected: [expect.objectContaining({ name: "Shop" })],
      }),
      expect.objectContaining({
        selectorKind: "status",
        sourcePool: "battle",
        targetOrigin: "catalog_reference",
        candidateCount: 1,
        selected: [expect.objectContaining({ name: "Next battle discount" })],
      }),
      expect.objectContaining({
        selectorKind: "generated_object",
        sourcePool: "manifest_placeholder",
        targetOrigin: "future_generated_object",
        candidateCount: 1,
        selected: [expect.objectContaining({ id: "generated-card-1", name: "Lantern Made Of Rain", kind: "card" })],
      }),
    ]);
  });

  it("keeps predicate, deferred, visible random, and hidden random selectors structured", () => {
    const selectorBase = {
      selectorKind: "card",
      referenceKind: "content",
      source: "deck",
      predicate: { source: "deck" },
      required: true,
    } as const;

    const resolutions = [
      resolveTargetSelector(content, quest(), { ...selectorBase, selection: "predicate" }),
      resolveTargetSelector(content, quest(), { ...selectorBase, selection: "chosen_after_commitment" }),
      resolveTargetSelector(content, quest(), { ...selectorBase, selection: "visible_random" }),
      resolveTargetSelector(content, quest(), { ...selectorBase, selection: "hidden_random" }),
    ];

    expect(resolutions.map((resolution) => resolution.selection)).toEqual([
      "predicate",
      "chosen_after_commitment",
      "visible_random",
      "hidden_random",
    ]);
    expect(resolutions[0]).toMatchObject({
      sourcePool: "deck",
      candidateCount: 2,
    });
    expect(resolutions[3]).toMatchObject({
      sourcePool: "deck",
      candidateCount: 2,
      selected: [],
    });
  });

  it("matches generated-object selectors by display name", () => {
    const generatedObject: GeneratedObjectDefinition = {
      generatedObjectKind: "card",
      generatedObjectId: "generated-card-rain-lantern",
      name: "Rain Lantern",
      objectType: "Event Card",
      rulesText: "0 energy Event. Fast. Gain 1 omen, then draw 1 card.",
      tags: ["journey-only", "card", "event"],
      references: { rules: ["Fast", "omens", "card"] },
      lifetime: "journey_only",
      valueEstimate: {
        convertedEssence: 120,
        confidence: "medium",
        basis: "Test generated object value.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: ["test"],
      },
      payload: { kind: "generated_card" },
    };
    const selectorBase = {
      selectorKind: "generated_object",
      selection: "exact",
      referenceKind: "manifest_generated",
      generatedObjectReferenceKind: "definition",
      generatedObjectKind: "card",
      required: true,
    } as const;

    expect(resolveTargetSelector(content, quest(), {
      ...selectorBase,
      name: "rain lantern",
    }, [generatedObject])).toMatchObject({
      sourcePool: "manifest_generated",
      candidateCount: 1,
      selected: [{ id: "generated-card-rain-lantern", name: "Rain Lantern", kind: "card" }],
    });
    expect(resolveTargetSelector(content, quest(), {
      ...selectorBase,
      name: "Wrong Lantern",
    }, [generatedObject])).toMatchObject({
      sourcePool: "manifest_generated",
      candidateCount: 0,
      selected: [],
      emptyReason: "no_matching_targets",
    });
  });
});
