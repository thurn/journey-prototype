import { describe, expect, it } from "vitest";
import { COSTS, RANDOM_TRADE_COSTS, getCost } from "../../src/journey/shared/costs.js";
import { REWARDS } from "../../src/journey/shared/rewards.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";

const draw: DrawContext = {
  seed: "costs-test", contentVersion: "v1", rootJourneyIndex: 0,
};

function fakeCtx(essence = 100, omens = 1): JourneyContext {
  return {
    projectRoot: "",
    contentVersion: "v1",
    content: { cards: [], dreamcallers: [], dreamsigns: [], rawBytes: {} as never },
    state: {
      schemaVersion: 1,
      contentVersion: "v1",
      generator: { rootJourneyIndex: 0, lastJourneyId: null, cursors: {} },
      pendingJourney: null,
      history: [],
      quest: {
        seed: "costs-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence, maxEssence: 200, omens, dreamscape: 1 },
        selectedTides: [], mandatoryTides: [], optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [], banes: [], dreamsignPoolIds: [],
        dreamsignPoolSummary: { tidalPoolCount: 0, neutralCatalogCount: 0 },
        draftPool: [],
        draftPoolSummary: { totalCopies: 0, uniqueCards: 0, oneCopyCards: 0, twoCopyCards: 0 },
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

describe("costs table (resource family)", () => {
  it("registers pay_essence", () => {
    const t = getCost("pay_essence");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.viable(p, fakeCtx())).toBe(true);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
  });

  it("renders pay_essence as a loss", () => {
    const t = getCost("pay_essence");
    expect(t.render({ x: 25 }, fakeCtx())).toBe("Lose 25 essence");
  });

  it("renders pay_omens as a loss", () => {
    const t = getCost("pay_omens");
    expect(t.render({ x: 1 }, fakeCtx(100, 1))).toBe("Lose 1 omen");
    expect(t.render({ x: 2 }, fakeCtx(100, 2))).toBe("Lose 2 omens");
  });

  it("renders variable essence templates as losses", () => {
    expect(getCost("pay_max_essence").render({}, fakeCtx())).toBe("Lose maximum essence");
    expect(getCost("pay_essence_random_range").render({ min: 30, max: 80 }, fakeCtx())).toBe(
      "Lose 30-80 essence (random roll)",
    );
    expect(getCost("pay_percent_essence").render({ percent: 25 }, fakeCtx())).toBe(
      "Lose 25% of your essence",
    );
    expect(getCost("pay_all_remaining_essence").render({}, fakeCtx())).toBe(
      "Lose all remaining essence",
    );
  });

  it("pay_essence emits [LOCKED] when X > current essence", () => {
    const t = getCost("pay_essence");
    // Force a large X by trying many seeds and find one >= 100
    let foundLocked = false;
    for (let i = 0; i < 50; i += 1) {
      const p = t.rollParams(fakeCtx(50), { ...draw, sequenceStep: i }) as { x: number };
      const text = t.render(p, fakeCtx(50));
      if (p.x > 50 && text.startsWith("[LOCKED] ")) {
        foundLocked = true;
        break;
      }
    }
    expect(foundLocked).toBe(true);
  });

  it("pay_essence does NOT emit [LOCKED] when X <= current essence", () => {
    const t = getCost("pay_essence");
    for (let i = 0; i < 50; i += 1) {
      const p = t.rollParams(fakeCtx(500), { ...draw, sequenceStep: i }) as { x: number };
      const text = t.render(p, fakeCtx(500));
      expect(text.startsWith("[LOCKED]")).toBe(false);
    }
  });

  it("pay_omens emits [LOCKED] when X > current omens", () => {
    const t = getCost("pay_omens");
    let foundLocked = false;
    for (let i = 0; i < 20; i += 1) {
      const p = t.rollParams(fakeCtx(100, 0), { ...draw, sequenceStep: i }) as { x: number };
      const text = t.render(p, fakeCtx(100, 0));
      if (p.x > 0 && text.startsWith("[LOCKED] ")) {
        foundLocked = true;
        break;
      }
    }
    expect(foundLocked).toBe(true);
  });

  it("registers other resource costs without LOCKED", () => {
    for (const id of [
      "pay_max_essence", "pay_essence_random_range", "pay_percent_essence",
      "pay_all_remaining_essence", "battle_reward_reduction_flat",
      "battle_reward_reduction_percent",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.viable(p, fakeCtx())).toBe(true);
      expect(t.render(p, fakeCtx()).startsWith("[LOCKED]")).toBe(false);
    }
  });

  it("renders battle essence reward reductions with grammatical battle counts", () => {
    expect(getCost("battle_reward_reduction_flat").render({ amount: 20, battles: 1 }, fakeCtx())).toBe(
      "Battle essence rewards are reduced by 20 for the next battle",
    );
    expect(getCost("battle_reward_reduction_flat").render({ amount: 20, battles: 2 }, fakeCtx())).toBe(
      "Battle essence rewards are reduced by 20 for the next 2 battles",
    );
    expect(getCost("battle_reward_reduction_percent").render({ percent: 20, battles: 1 }, fakeCtx())).toBe(
      "Battle essence rewards are reduced by 20% for the next battle",
    );
    expect(getCost("battle_reward_reduction_percent").render({ percent: 20, battles: 2 }, fakeCtx())).toBe(
      "Battle essence rewards are reduced by 20% for the next 2 battles",
    );
  });

  it("weights battle essence reward reductions as rare random trade costs", () => {
    expect(getCost("battle_reward_reduction_flat").weight).toBe(0.25);
    expect(getCost("battle_reward_reduction_percent").weight).toBe(0.25);
  });

  it("COSTS is frozen and unique", () => {
    expect(Object.isFrozen(COSTS)).toBe(true);
    const ids = COSTS.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("random trade costs keep random card purge costs and exclude chosen card purge costs", () => {
    const ids = new Set(RANDOM_TRADE_COSTS.map((c) => c.id));

    expect(ids.has("purge_random_predicate_card")).toBe(true);
    expect(ids.has("purge_chosen_predicate_card")).toBe(false);
    expect(ids.has("draw_X_purge_chosen")).toBe(false);
  });

  it("keeps chosen-card purge rewards available as benefits", () => {
    const rewardIds = new Set(REWARDS.map((r) => r.id));

    expect(rewardIds.has("purge_chosen_predicate_cards")).toBe(true);
    expect(rewardIds.has("purge_chosen_predicate_with_replacement")).toBe(true);
    expect(rewardIds.has("purge_chosen_starters")).toBe(true);
  });

  it("weights resource exchange costs above minor cost templates", () => {
    const minorWeight = getCost("pay_max_essence").weight;

    expect(getCost("pay_essence").weight).toBeGreaterThan(minorWeight);
    expect(getCost("pay_omens").weight).toBeGreaterThan(minorWeight);
  });
});

describe("costs table (card family)", () => {
  it("registers card-purge / transform templates", () => {
    for (const id of [
      "purge_named_card", "purge_random_predicate_card", "purge_chosen_predicate_card",
      "gain_random_cards_from_pool", "transform_card_to_random_pool",
      "purge_all_duplicate_cards",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThanOrEqual(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});

describe("costs table (dreamsign family)", () => {
  it("registers dreamsign cost templates", () => {
    for (const id of [
      "purge_named_dreamsign", "purge_random_dreamsign",
      "purge_chosen_dreamsign", "transform_dreamsign_to_random",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("renders named Dreamsign purge costs with active content names", () => {
    const ctx = fakeCtx();
    ctx.content.dreamsigns = [
      {
        id: "tidal-sign",
        name: "Tidal Sign",
        kind: "tidal",
        renderedText: "",
        tides: [],
        raw: {},
      },
    ];
    ctx.state.quest.activeDreamsigns = [{ dreamsignId: "tidal-sign" }];
    const t = getCost("purge_named_dreamsign");
    const p = t.rollParams(ctx, draw);

    expect(t.render(p, ctx)).toBe("Purge 'Tidal Sign'");
  });

  it("renders named Dreamsign purge costs with a readable missing-content fallback", () => {
    const ctx = fakeCtx();
    ctx.state.quest.activeDreamsigns = [{ dreamsignId: "missing-sign" }];
    const t = getCost("purge_named_dreamsign");
    const p = t.rollParams(ctx, draw);

    expect(t.render(p, ctx)).toBe("Purge 'Unknown Dreamsign'");
  });

  it("prices random Dreamsign purge as a severe random trade cost", () => {
    const randomTradeCostIds = new Set(RANDOM_TRADE_COSTS.map((c) => c.id));
    const randomPurge = getCost("purge_random_dreamsign");

    expect(randomTradeCostIds.has("purge_random_dreamsign")).toBe(true);
    expect(randomPurge.cec({}, fakeCtx())).toBe(200);
  });
});

describe("costs table (bane/dreamwell/starter family)", () => {
  it("registers bane/dreamwell/starter cost templates", () => {
    for (const id of [
      "gain_random_banes", "gain_named_banes", "gain_named_banes_for_X_battles",
      "gain_additional_starters",
      "set_starting_dreamwell_negative", "shuffle_negative_dreamwell_cards",
      "remove_transfiguration_from_card", "remove_transfigurations_from_random_predicate",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("weights Bane-gain costs above minor cost templates", () => {
    const minorWeight = getCost("gain_additional_starters").weight;

    expect(getCost("gain_random_banes").weight).toBeGreaterThan(minorWeight);
    expect(getCost("gain_named_banes").weight).toBeGreaterThan(minorWeight);
    expect(getCost("gain_named_banes_for_X_battles").weight).toBeGreaterThan(minorWeight);
  });

  it("temporary Bane costs can roll a one-battle duration", () => {
    const t = getCost("gain_named_banes_for_X_battles");
    const seen = new Set<number>();

    for (let i = 0; i < 200; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { battles: number };
      seen.add(p.battles);
    }

    expect(seen.has(1)).toBe(true);
  });

  it("renders additional starter card costs as random starter cards", () => {
    expect(getCost("gain_additional_starters").render({ count: 1 }, fakeCtx())).toBe(
      "Gain a random starter card",
    );
    expect(getCost("gain_additional_starters").render({ count: 2 }, fakeCtx())).toBe(
      "Gain 2 random starter cards",
    );
  });

  it("weights negative dreamwell shuffle costs as rare random trade costs", () => {
    expect(getCost("shuffle_negative_dreamwell_cards").weight).toBe(0.25);
  });
});

describe("costs table (misc family)", () => {
  it("registers misc cost templates", () => {
    for (const id of [
      "draw_X_purge_chosen",
      "remove_shop_sites_from_next_dreamscapes",
      "remove_dreamsign_sites_from_next_dreamscapes",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});

describe("costs table (status-burden family)", () => {
  it("registers lose_max_essence", () => {
    const t = getCost("lose_max_essence");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
    expect(t.render(p, fakeCtx())).not.toBe("");
  });

  it("lose_max_essence is not viable when amount > max essence", () => {
    const t = getCost("lose_max_essence");
    const ctx = fakeCtx();
    ctx.state.quest.resources.maxEssence = 10;
    const p = t.rollParams(ctx, draw) as { amount: number };
    expect(t.viable(p, ctx)).toBe(false);
  });
});

describe("meta_pay_2_costs", () => {
  it("rolls two non-meta sub-template ids", () => {
    const t = getCost("meta_pay_2_costs");
    for (let i = 0; i < 20; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { subIds: [string, string] };
      expect(p.subIds[0]).not.toMatch(/^meta_/);
      expect(p.subIds[1]).not.toMatch(/^meta_/);
    }
  });

  it("cec sums the sub-template CECs", () => {
    const t = getCost("meta_pay_2_costs");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
  });

  it("render prefixes [LOCKED] iff any sub-cost would lock", () => {
    const t = getCost("meta_pay_2_costs");
    let foundLocked = false;
    for (let i = 0; i < 80; i += 1) {
      const ctx = fakeCtx(50, 0);
      const p = t.rollParams(ctx, { ...draw, sequenceStep: i }) as {
        subIds: readonly [string, string];
        subParams: readonly [Record<string, unknown>, Record<string, unknown>];
      };
      const txt = t.render(p, ctx);
      // Probe each sub-cost to see if it would lock independently
      const subATxt = getCost(p.subIds[0]).render(p.subParams[0] as never, ctx);
      const subBTxt = getCost(p.subIds[1]).render(p.subParams[1] as never, ctx);
      const subLocked = subATxt.startsWith("[LOCKED]") || subBTxt.startsWith("[LOCKED]");
      expect(txt.startsWith("[LOCKED] ")).toBe(subLocked);
      if (subLocked) foundLocked = true;
    }
    expect(foundLocked).toBe(true);
  });
});
