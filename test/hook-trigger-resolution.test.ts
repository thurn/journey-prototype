import { describe, expect, it } from "vitest";
import { TRIGGER_REGISTRY } from "../src/journey/fillers/hookTriggers.js";
import { RESOLUTION_REGISTRY } from "../src/journey/fillers/hookResolutions.js";

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

describe("RESOLUTION_REGISTRY", () => {
  it("includes the resolutions used by the existing hookPayloads file", () => {
    const expected = [
      "card_draft",
      "card_purge",
      "essence_gain",
      "named_card_grant",
      "bane_transform_to_card",
      "future_shop_discount",
      "future_shop_trade_hook",
      "named_dreamsign_grant",
      "delayed_bane_arrival",
      "status_reward_replacement",
      "future_journey_option",
      "site_visit_reward",
    ];
    for (const kind of expected) {
      expect(
        RESOLUTION_REGISTRY.find((r) => r.kind === kind),
        `missing ${kind}`,
      ).toBeDefined();
    }
  });
});
