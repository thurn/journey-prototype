import { describe, expect, it } from "vitest";
import { TRIGGER_REGISTRY } from "../src/journey/fillers/hookTriggers.js";

describe("TRIGGER_REGISTRY", () => {
  it("contains every trigger kind from the manifest", () => {
    const expected = [
      "battle",
      "victory",
      "each_battle",
      "dreamscape",
      "site_visit",
      "named_card_play",
      "dreamsign_trigger",
      "card_added",
      "essence_payment",
      "future_shop",
      "future_dream_journey",
    ];
    for (const kind of expected) {
      expect(
        TRIGGER_REGISTRY.find((t) => t.kind === kind),
        `missing ${kind}`,
      ).toBeDefined();
    }
  });
});
