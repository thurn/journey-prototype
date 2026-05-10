import { describe, expect, it } from "vitest";
import { TRIGGER_REGISTRY } from "../src/journey/fillers/hookTriggers.js";
import { RESOLUTION_REGISTRY } from "../src/journey/fillers/hookResolutions.js";
import { hookCompatibility } from "../src/journey/fillers/hookCompatibility.js";
import { expandedDelayedHookCandidates } from "../src/journey/fillers/hookPayloads.js";
import { loadContent } from "../src/content/loadToml.js";
import { buildJourneyContext } from "../src/quest/context.js";
import { createInitialJourneyState } from "../src/quest/init.js";

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

describe("hookCompatibility", () => {
  it("permits future_shop x future_shop_discount", () => {
    expect(
      hookCompatibility(
        TRIGGER_REGISTRY.find((t) => t.kind === "future_shop")!,
        RESOLUTION_REGISTRY.find((r) => r.kind === "future_shop_discount")!,
        "mid",
      ),
    ).toBe(true);
  });

  it("rejects essence_payment x future_journey_option (no shared semantic context)", () => {
    expect(
      hookCompatibility(
        TRIGGER_REGISTRY.find((t) => t.kind === "essence_payment")!,
        RESOLUTION_REGISTRY.find((r) => r.kind === "future_journey_option")!,
        "mid",
      ),
    ).toBe(false);
  });

  it("permits the cartesian product to grow when both registries grow", () => {
    const total = TRIGGER_REGISTRY.length * RESOLUTION_REGISTRY.length;
    let permitted = 0;
    for (const t of TRIGGER_REGISTRY) {
      for (const r of RESOLUTION_REGISTRY) {
        if (hookCompatibility(t, r, "mid")) permitted += 1;
      }
    }
    expect(permitted).toBeGreaterThan(20);
    expect(permitted).toBeLessThan(total);
  });
});

describe("expandedDelayedHookCandidates (cartesian)", () => {
  async function buildContext(seed: string) {
    const content = await loadContent(process.cwd());
    const contentVersion = "test-content-version";
    const state = createInitialJourneyState({
      seed,
      content,
      contentVersion,
    });
    const context = buildJourneyContext({
      projectRoot: process.cwd(),
      content,
      state,
      contentVersion,
    });
    const drawContext = {
      seed,
      contentVersion,
      rootJourneyIndex: 1,
    };
    return { context, drawContext };
  }

  it("produces at least 20 candidates from the registries", async () => {
    const { context, drawContext } = await buildContext("hook-cart-1");
    const out = expandedDelayedHookCandidates({
      context,
      drawContext,
      label: "test",
      stage: "mid",
    });
    expect(out.length).toBeGreaterThanOrEqual(20);
  });

  it("includes a card_added x bane_transform_to_card composition", async () => {
    const { context, drawContext } = await buildContext("hook-cart-2");
    const out = expandedDelayedHookCandidates({
      context,
      drawContext,
      label: "test",
      stage: "mid",
    });
    expect(
      out.some(
        (c) =>
          c.triggerKind === "card_added" &&
          c.resolutionKind === "bane_transform_to_card",
      ),
    ).toBe(true);
  });
});
