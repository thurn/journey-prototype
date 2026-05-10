import { describe, expect, it } from "vitest";
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
