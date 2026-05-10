import { describe, expect, it } from "vitest";
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";
import { draftCards } from "../src/journey/fillers/shared.js";

describe("draftCards from deck source", () => {
  it("emits a card_draft payload with source: deck", () => {
    const draft = draftCards(
      {
        label: "any deck card",
        targetDescription: "any deck card",
        source: "deck",
        predicate: {},
      },
      { takeCount: 1 },
    );
    expect(draft.predicate.source).toBe("deck");
  });
});

describe("peek_deck_then_mutate_one", () => {
  it("is registered and produces a deck-sourced peek effect", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "peek_deck_then_mutate_one");
    expect(entry).toBeDefined();
    expect(entry!.effect).toMatchObject({ kind: "peek_then_mutate", source: "deck" });
  });
});
