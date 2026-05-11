import { describe, expect, it } from "vitest";
import {
  POSITIVE_DREAMWELL_CARDS,
  NEGATIVE_DREAMWELL_CARDS,
  pickFromList,
} from "../../src/journey/shared/content.js";

describe("content helpers", () => {
  it("ships at least 6 positive and 6 negative dreamwell stub names", () => {
    expect(POSITIVE_DREAMWELL_CARDS.length).toBeGreaterThanOrEqual(6);
    expect(NEGATIVE_DREAMWELL_CARDS.length).toBeGreaterThanOrEqual(6);
  });

  it("pickFromList is deterministic for the same DrawContext + label", () => {
    const draw = {
      seed: "test", contentVersion: "v1", rootJourneyIndex: 0,
    };
    const first = pickFromList(draw, "label", ["a", "b", "c", "d"]);
    const second = pickFromList(draw, "label", ["a", "b", "c", "d"]);
    expect(first).toBe(second);
  });
});
