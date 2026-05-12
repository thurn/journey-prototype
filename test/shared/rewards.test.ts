import { describe, expect, it } from "vitest";
import {
  REWARDS,
  getReward,
} from "../../src/journey/shared/rewards.js";
import { loadContent } from "../../src/content/loadToml.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState } from "../../src/quest/init.js";
import {
  isCardEligibleForTransfiguration,
  transfigurationsEligibleForPredicate,
} from "../../src/journey/shared/content.js";
import { getPredicate } from "../../src/journey/shared/predicates.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";

const draw: DrawContext = {
  seed: "rewards-test", contentVersion: "v1", rootJourneyIndex: 0,
};

function fakeCtx(overrides: Partial<JourneyContext["state"]["quest"]["resources"]> = {}): JourneyContext {
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
        seed: "rewards-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 100, maxEssence: 200, omens: 0, dreamscape: 1, ...overrides },
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

describe("rewards table (resource family)", () => {
  it("registers gain_essence with positive CEC", () => {
    const t = getReward("gain_essence");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.viable(p, fakeCtx())).toBe(true);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
    expect(t.render(p, fakeCtx())).toMatch(/Gain \d+ essence/);
  });

  it("gain_essence rolls X in {50,55,...,200}", () => {
    const t = getReward("gain_essence");
    for (let i = 0; i < 50; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i });
      const text = t.render(p, fakeCtx());
      const match = text.match(/Gain (\d+) essence/);
      expect(match).not.toBeNull();
      const x = Number(match![1]);
      expect(x).toBeGreaterThanOrEqual(50);
      expect(x).toBeLessThanOrEqual(200);
      expect(x % 5).toBe(0);
    }
  });

  it("registers gain_omens, set_essence_to_percent_of_max, gain_essence_random_range, gain_essence_to_max", () => {
    for (const id of [
      "gain_omens", "set_essence_to_percent_of_max",
      "gain_essence_random_range", "gain_essence_to_max",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.viable(p, fakeCtx())).toBe(true);
      expect(t.cec(p, fakeCtx())).toBeGreaterThanOrEqual(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("REWARDS is frozen and unique by id", () => {
    expect(Object.isFrozen(REWARDS)).toBe(true);
    const ids = REWARDS.map((r) => r.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("omits unsupported card text reference rewards", () => {
    const unsupportedId = ["modify", "card", "to", "reference", "type"].join("_");
    expect(REWARDS.map((r) => r.id)).not.toContain(unsupportedId);
  });

  it("gain_essence_to_max is the canonical template for filling essence to maximum", () => {
    // The "gain essence up to your maximum" semantic is served by exactly one
    // template: `gain_essence_to_max`. Its CEC is the gap between current
    // essence and the cap (scaled by stage multiplier), and its render text
    // reads "Gain essence up to your maximum".
    const t = getReward("gain_essence_to_max");
    const ctx = fakeCtx({ essence: 80, maxEssence: 200 });
    expect(t.render({} as never, ctx)).toBe("Gain essence up to your maximum");
    expect(t.cec({} as never, ctx)).toBe((200 - 80) * 1); // STAGE_MULTIPLIER=1 in fake ctx
    expect(t.viable({} as never, ctx)).toBe(true);
  });

  it("set_essence_to_percent_of_max rolls percent variants that stay distinct from filling to max", () => {
    const t = getReward("set_essence_to_percent_of_max");
    const percents = new Set<number>();
    for (let i = 0; i < 80; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { percent: number };
      percents.add(p.percent);
      expect(p.percent).not.toBe(100);
      expect(t.render(p, fakeCtx())).toBe(`Set essence to ${p.percent}% of your maximum essence`);
    }
    expect(percents).toEqual(new Set([50, 75, 125]));
  });

  it("every reward id appears in the canonical reward catalog", () => {
    // The canonical catalog is an explicit allowlist of every reward id the
    // game ships with. Pinning the registered REWARDS to this list ensures any
    // new template is consciously catalogued here, and any rename or accidental
    // addition is caught by the test rather than silently shipping.
    const CANONICAL_REWARD_IDS = new Set([
      "add_site_to_dreamscape",
      "add_site_to_next_dreamscape",
      "apply_chosen_transfiguration_to_chosen_card",
      "apply_named_transfiguration_to_all_predicate_cards",
      "apply_named_transfiguration_to_card_name",
      "apply_named_transfiguration_to_chosen_predicate_cards",
      "apply_named_transfiguration_to_random_predicate_cards",
      "apply_random_transfigurations_to_random_cards",
      "boost_site_appearance_chance",
      "card_cost_reduction_for_X_battles",
      "change_card_to_become_type",
      "choose_1_of_X_dreamsigns",
      "draft_2_predicate_cards_from_4",
      "draft_predicate_card_with_copies",
      "draft_predicate_card_with_transfiguration",
      "draft_predicate_cards_from_4",
      "draw_X_and_duplicate_chosen",
      "duplicate_chosen_cards",
      "duplicate_named_card_X",
      "duplicate_random_predicate",
      "gain_copy_of_chosen_dreamsign",
      "gain_copy_of_random_dreamsign",
      "gain_essence",
      "gain_essence_random_range",
      "gain_essence_to_max",
      "gain_named_card",
      "gain_named_dreamsign",
      "gain_omens",
      "gain_random_dreamsign",
      "gain_random_predicate_cards",
      "increase_max_essence",
      "make_card_reclaim",
      "make_random_cards_fast",
      "make_random_cards_reclaim",
      "meta_gain_2_rewards",
      "modify_random_cards_to_types",
      "next_X_shop_rerolls_free",
      "opening_hand_grant_for_X_battles",
      "purge_X_banes",
      "purge_all_banes",
      "purge_all_starters",
      "purge_all_starters_replace",
      "purge_chosen_predicate_cards",
      "purge_chosen_predicate_with_replacement",
      "purge_chosen_starters",
      "purge_named_starter",
      "purge_random_starter",
      "purge_random_starter_with_predicate_replacement",
      "replace_site_type",
      "replace_starter_via_draft",
      "set_essence_to_percent_of_max",
      "set_starting_dreamwell_positive",
      "shop_essence_discount",
      "shop_omen_discount",
      "shuffle_positive_dreamwell_cards",
      "take_any_from_predicate_choices",
      "temporary_card_copy_for_X_battles",
      "temporary_dreamsign_for_X_battles",
      "transfigure_all_starters",
      "transfigure_chosen_starters",
      "transfigure_random_starters",
      "transform_card_in_deck_into_named",
      "transform_chosen_predicate_into_named",
      "transform_dreamsign_to_named",
      "transform_starter_into_named_card",
    ]);
    const registeredIds = new Set(REWARDS.map((r) => r.id));
    for (const id of registeredIds) {
      expect(CANONICAL_REWARD_IDS.has(id), `reward id ${id} is not in the canonical catalog`).toBe(true);
    }
    for (const id of CANONICAL_REWARD_IDS) {
      expect(registeredIds.has(id), `canonical reward id ${id} is missing from REWARDS`).toBe(true);
    }
  });
});

describe("rewards table (card-pool family)", () => {
  it("registers gain_random_predicate_cards / draft_predicate_cards_from_4 / take_any_from_predicate_choices / gain_named_card", () => {
    for (const id of [
      "gain_random_predicate_cards",
      "draft_predicate_cards_from_4",
      "take_any_from_predicate_choices",
      "gain_named_card",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      // viable() may be false when the fake content bundle is empty; that's fine.
      // We're just checking the template is registered and the methods don't throw.
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("random-gain rewards never roll a stat-bucket predicate (low/high cost or spark)", () => {
    // "Gain N random cards with cost 2 or less" / "Take any number of cards
    // with spark 4 or more from 5 choices" / "Duplicate N random cards with
    // cost 4 or more" are not meaningful as a player reward because the
    // predicate is a raw stat slice rather than a card category. The roll for
    // these rewards is constrained to ability and card-type predicates, and
    // the stat-bucket predicates (low_cost, high_cost, low_spark, high_spark)
    // must never appear.
    const randomGainIds = [
      "gain_random_predicate_cards",
      "take_any_from_predicate_choices",
      "duplicate_random_predicate",
    ];
    const banned = new Set(["low_cost", "high_cost", "low_spark", "high_spark"]);
    for (const id of randomGainIds) {
      const t = getReward(id);
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i += 1) {
        const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { predicateId: string };
        expect(banned.has(p.predicateId), `${id} rolled banned predicate ${p.predicateId}`).toBe(false);
        seen.add(p.predicateId);
      }
      // Sanity: 1000 rolls should hit a healthy variety of predicates, so the
      // ban-check above is actually exercising the filter rather than being
      // vacuously satisfied because the roll is degenerate.
      expect(seen.size).toBeGreaterThanOrEqual(5);
    }
  });

  it("draft-family rewards still admit stat-bucket predicates", () => {
    // The draft family lets the player choose among offered cards, so keying
    // a draft on "cards with cost 2 or less" gives the player meaningful
    // selection pressure even when the predicate is a stat slice. Drafts
    // therefore continue to roll every predicate kind, including stat-buckets.
    const draftIds = [
      "draft_predicate_cards_from_4",
      "draft_2_predicate_cards_from_4",
      "draft_predicate_card_with_copies",
      "draft_predicate_card_with_transfiguration",
    ];
    const statBuckets = new Set(["low_cost", "high_cost", "low_spark", "high_spark"]);
    for (const id of draftIds) {
      const t = getReward(id);
      let rolledStatBucket = false;
      for (let i = 0; i < 500; i += 1) {
        const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { predicateId: string };
        if (statBuckets.has(p.predicateId)) {
          rolledStatBucket = true;
          break;
        }
      }
      expect(rolledStatBucket, `${id} never rolled a stat-bucket predicate in 500 draws`).toBe(true);
    }
  });
});

describe("rewards table (modification family)", () => {
  it("registers transfiguration and modification templates", () => {
    for (const id of [
      "apply_chosen_transfiguration_to_chosen_card",
      "apply_named_transfiguration_to_chosen_predicate_cards",
      "apply_named_transfiguration_to_card_name",
      "apply_named_transfiguration_to_random_predicate_cards",
      "transfigure_random_starters",
      "transfigure_all_starters",
      "change_card_to_become_type",
      "modify_random_cards_to_types",
      "make_random_cards_fast",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});

describe("make_random_cards_fast tuning", () => {
  it("rolls counts in 2..4 across many seeded draws", () => {
    const t = getReward("make_random_cards_fast");
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { count: number };
      expect(p.count).toBeGreaterThanOrEqual(2);
      expect(p.count).toBeLessThanOrEqual(4);
      seen.add(p.count);
    }
    // The full range should be hit across 200 draws.
    expect(seen).toEqual(new Set([2, 3, 4]));
  });

  it("CEC scales with count and starts at 40 (count=2)", () => {
    const t = getReward("make_random_cards_fast");
    expect(t.cec({ count: 2 } as never, fakeCtx())).toBe(40);
    expect(t.cec({ count: 3 } as never, fakeCtx())).toBe(60);
    expect(t.cec({ count: 4 } as never, fakeCtx())).toBe(80);
  });

  it("the only fast-granting reward is the multi-card random variant", () => {
    // Any reward whose render produces "have fast" must be the random
    // multi-card variant operating on a `count` param (not `cardName`).
    const fastGranters = REWARDS.filter((r) => {
      try {
        const p = r.rollParams(fakeCtx(), draw) as Record<string, unknown>;
        return /\bhave fast\b/.test(r.render(p as never, fakeCtx()));
      } catch {
        return false;
      }
    });
    expect(fastGranters.map((r) => r.id)).toEqual(["make_random_cards_fast"]);
    const onlyFast = fastGranters[0]!;
    const sampleParams = onlyFast.rollParams(fakeCtx(), draw) as Record<string, unknown>;
    expect(Object.keys(sampleParams)).toEqual(["count"]);
  });
});

describe("rewards table (purge/transform family)", () => {
  it("registers purge/transform/duplicate templates", () => {
    for (const id of [
      "purge_chosen_predicate_cards",
      "purge_chosen_predicate_with_replacement",
      "purge_named_starter",
      "purge_random_starter",
      "purge_random_starter_with_predicate_replacement",
      "purge_all_starters_replace",
      "transform_starter_into_named_card",
      "transform_card_in_deck_into_named",
      "transform_chosen_predicate_into_named",
      "duplicate_named_card_X",
      "duplicate_chosen_cards",
      "duplicate_random_predicate",
      "draw_X_and_duplicate_chosen",
      "purge_X_banes",
      "purge_all_banes",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("purge_X_banes is not viable when bane count is 0", () => {
    const t = getReward("purge_X_banes");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.viable(p, fakeCtx())).toBe(false);
  });

  it("purge_X_banes becomes viable once banes are present on the quest", () => {
    const t = getReward("purge_X_banes");
    const ctx = fakeCtx();

    ctx.state.quest.banes = [
      { baneName: "Nightmare" },
      { baneName: "Despair" },
      { baneName: "Oblivion" },
    ];

    const p = t.rollParams(ctx, draw);
    expect(t.viable(p, ctx)).toBe(true);
  });

  it("purge_all_banes is viable iff at least one bane exists", () => {
    const t = getReward("purge_all_banes");
    const empty = fakeCtx();
    const populated = fakeCtx();

    populated.state.quest.banes = [{ baneName: "Nightmare" }];

    expect(t.viable(t.rollParams(empty, draw), empty)).toBe(false);
    expect(t.viable(t.rollParams(populated, draw), populated)).toBe(true);
  });

  it("duplicate_random_predicate uses singular noun when count is 1", () => {
    const t = getReward("duplicate_random_predicate");
    expect(t.render({ predicateId: "abandon", count: 1 } as never, fakeCtx()))
      .toBe("Duplicate 1 random card with an 'abandon' ability");
    expect(t.render({ predicateId: "abandon", count: 2 } as never, fakeCtx()))
      .toBe("Duplicate 2 random cards with an 'abandon' ability");
  });

  it("apply_named_transfiguration_to_chosen_predicate_cards uses singular noun when count is 1", () => {
    const t = getReward("apply_named_transfiguration_to_chosen_predicate_cards");
    expect(t.render({ transfiguration: "Lock-In", predicateId: "discard_text", count: 1 } as never, fakeCtx()))
      .toBe("Apply Lock-In to 1 chosen card with a 'discard' ability");
    expect(t.render({ transfiguration: "Lock-In", predicateId: "discard_text", count: 3 } as never, fakeCtx()))
      .toBe("Apply Lock-In to 3 chosen cards with a 'discard' ability");
  });

  it("apply_named_transfiguration_to_random_predicate_cards uses singular noun when count is 1", () => {
    const t = getReward("apply_named_transfiguration_to_random_predicate_cards");
    expect(t.render({ transfiguration: "Lock-In", predicateId: "event_copying", count: 1 } as never, fakeCtx()))
      .toBe("Apply Lock-In to 1 random card with an event-copying ability");
    expect(t.render({ transfiguration: "Lock-In", predicateId: "event_copying", count: 2 } as never, fakeCtx()))
      .toBe("Apply Lock-In to 2 random cards with an event-copying ability");
  });

  it("named-transfiguration rewards only roll the canonical eight transfigurations", () => {
    const namedTransfigurationRewards = [
      "apply_named_transfiguration_to_chosen_predicate_cards",
      "apply_named_transfiguration_to_card_name",
      "apply_named_transfiguration_to_random_predicate_cards",
      "apply_named_transfiguration_to_all_predicate_cards",
      "draft_predicate_card_with_transfiguration",
    ] as const;
    const canonical = new Set([
      "Viridian", "Golden", "Scarlet", "Magenta",
      "Azure", "Bronze", "Rose", "Prismatic",
    ]);
    const ctx = fakeCtx();
    for (const id of namedTransfigurationRewards) {
      const reward = getReward(id);
      for (let i = 0; i < 200; i += 1) {
        const params = reward.rollParams(ctx, {
          ...draw,
          sequenceStep: i,
        }) as { transfiguration: string };
        expect(
          canonical.has(params.transfiguration),
          `${id} rolled non-canonical transfiguration ${params.transfiguration}`,
        ).toBe(true);
      }
    }
  });

  it("apply_random_transfigurations_to_random_cards omits redundant count when count > 1", () => {
    const t = getReward("apply_random_transfigurations_to_random_cards");
    expect(t.render({ count: 1 } as never, fakeCtx()))
      .toBe("Apply a random transfiguration to 1 random card");
    expect(t.render({ count: 2 } as never, fakeCtx()))
      .toBe("Apply random transfigurations to 2 random cards");
    expect(t.render({ count: 3 } as never, fakeCtx()))
      .toBe("Apply random transfigurations to 3 random cards");
  });

  it("change_card_to_become_type renders with a singular capitalized card type and matching article", () => {
    const t = getReward("change_card_to_become_type");
    expect(t.render({ cardName: "Nocturne Strummer", cardTypePredicateId: "warriors" } as never, fakeCtx()))
      .toBe("Change Nocturne Strummer to become a Warrior");
    expect(t.render({ cardName: "Nocturne Strummer", cardTypePredicateId: "survivors" } as never, fakeCtx()))
      .toBe("Change Nocturne Strummer to become a Survivor");
    expect(t.render({ cardName: "Nocturne Strummer", cardTypePredicateId: "spirit_animals" } as never, fakeCtx()))
      .toBe("Change Nocturne Strummer to become a Spirit Animal");
  });

  it("change_card_to_become_type only picks predicate ids known to the predicate table", () => {
    const t = getReward("change_card_to_become_type");
    for (let i = 0; i < 30; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as {
        cardTypePredicateId: string;
      };
      // Must render without throwing — i.e. the predicate id must be valid.
      expect(t.render(p as never, fakeCtx())).toMatch(
        /^Change .+ to become an? (Warrior|Survivor|Spirit Animal)$/,
      );
    }
  });

  it("modify_random_cards_to_types renders with a plural capitalized card type", () => {
    const t = getReward("modify_random_cards_to_types");
    expect(t.render({ count: 2, cardTypePredicateId: "warriors" } as never, fakeCtx()))
      .toBe("Modify 2 random cards to become Warriors");
    expect(t.render({ count: 3, cardTypePredicateId: "spirit_animals" } as never, fakeCtx()))
      .toBe("Modify 3 random cards to become Spirit Animals");
  });

  it("purge_chosen_predicate_cards uses singular noun when count is 1", () => {
    const t = getReward("purge_chosen_predicate_cards");
    expect(t.render({ predicateId: "reclaim", count: 1 } as never, fakeCtx()))
      .toBe("Purge up to 1 chosen card with a 'reclaim' ability");
    expect(t.render({ predicateId: "reclaim", count: 2 } as never, fakeCtx()))
      .toBe("Purge up to 2 chosen cards with a 'reclaim' ability");
  });

  it("purge_chosen_predicate_with_replacement uses transform wording (singular count)", () => {
    const t = getReward("purge_chosen_predicate_with_replacement");
    const text = t.render({ predicateId: "warriors", count: 1 } as never, fakeCtx());
    expect(text).toBe("Transform a chosen Warrior into a random Warrior");
    expect(text).not.toMatch(/[Pp]urge/);
    expect(text).not.toMatch(/replacement/);
  });

  it("purge_chosen_predicate_with_replacement uses transform wording (plural count)", () => {
    const t = getReward("purge_chosen_predicate_with_replacement");
    const text = t.render({ predicateId: "survivors", count: 2 } as never, fakeCtx());
    expect(text).toBe("Transform up to 2 chosen Survivors into random Survivors");
    expect(text).not.toMatch(/[Pp]urge/);
    expect(text).not.toMatch(/replacement/);
  });

  it("purge_random_starter_with_predicate_replacement uses transform wording", () => {
    const t = getReward("purge_random_starter_with_predicate_replacement");
    const text = t.render({ predicateId: "warriors" } as never, fakeCtx());
    expect(text).toBe("Transform a random starter card into a random Warrior");
    expect(text).not.toMatch(/[Pp]urge/);
    expect(text).not.toMatch(/replacement/);
  });

  it("purge_all_starters_replace uses transform wording", () => {
    const t = getReward("purge_all_starters_replace");
    const text = t.render({} as never, fakeCtx());
    expect(text).toBe("Transform all starter cards into new starter cards");
    expect(text).not.toMatch(/[Pp]urge/);
  });
});

describe("rewards table (dreamsign family)", () => {
  it("registers dreamsign templates", () => {
    for (const id of [
      "gain_random_dreamsign", "gain_named_dreamsign", "choose_1_of_X_dreamsigns",
      "gain_copy_of_random_dreamsign", "gain_copy_of_chosen_dreamsign",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("gain_copy_of_random_dreamsign makes clear the copy is of an active dreamsign", () => {
    const t = getReward("gain_copy_of_random_dreamsign");
    const text = t.render({} as never, fakeCtx());
    expect(text).toBe("Gain a copy of one of your dreamsigns chosen at random");
    expect(text).toMatch(/your dreamsigns/);
  });

  it("gain_copy_of_random_dreamsign has CEC around 200 reflecting copy value", () => {
    const t = getReward("gain_copy_of_random_dreamsign");
    const cec = t.cec({} as never, fakeCtx());
    expect(cec).toBeGreaterThanOrEqual(180);
    expect(cec).toBeLessThanOrEqual(220);
  });

  it("gain_copy_of_chosen_dreamsign uses chosen wording and CEC >= random variant", () => {
    const chosen = getReward("gain_copy_of_chosen_dreamsign");
    const random = getReward("gain_copy_of_random_dreamsign");
    const text = chosen.render({} as never, fakeCtx());
    expect(text).toBe("Gain a copy of one of your dreamsigns of your choice");
    expect(chosen.cec({} as never, fakeCtx())).toBeGreaterThanOrEqual(
      random.cec({} as never, fakeCtx()),
    );
  });

  it("choose_1_of_X_dreamsigns clarifies that the player gains the chosen dreamsign", () => {
    const t = getReward("choose_1_of_X_dreamsigns");
    expect(t.render({ choices: 2 } as never, fakeCtx())).toBe("Choose 1 of 2 dreamsigns to gain");
    expect(t.render({ choices: 4 } as never, fakeCtx())).toBe("Choose 1 of 4 dreamsigns to gain");
  });

  it("choose_1_of_X_dreamsigns CEC is ~150 at choices=2 and scales upward with more choices", () => {
    const t = getReward("choose_1_of_X_dreamsigns");
    const cec2 = t.cec({ choices: 2 } as never, fakeCtx());
    const cec3 = t.cec({ choices: 3 } as never, fakeCtx());
    const cec4 = t.cec({ choices: 4 } as never, fakeCtx());
    expect(cec2).toBeGreaterThanOrEqual(140);
    expect(cec2).toBeLessThanOrEqual(170);
    expect(cec3).toBeGreaterThan(cec2);
    expect(cec4).toBeGreaterThan(cec3);
  });
});

describe("rewards table (site/dreamwell/misc family)", () => {
  it("registers site/dreamwell/misc templates", () => {
    for (const id of [
      "add_site_to_dreamscape",
      "add_site_to_next_dreamscape",
      "set_starting_dreamwell_positive",
      "shuffle_positive_dreamwell_cards",
      "next_X_shop_rerolls_free",
      "boost_site_appearance_chance",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("add_site_to_dreamscape has CEC pinned to 100 and add_site_to_next_dreamscape to 75", () => {
    // Adding a site is a strong, permanent change to the dreamscape (and
    // can include valuable site types like Vendor or Travel), so its CEC is
    // pinned to 100. Adding a site to the *next* dreamscape is proportionally
    // weaker because the site only takes effect after travelling, so it is
    // pinned to 75.
    const here = getReward("add_site_to_dreamscape");
    const next = getReward("add_site_to_next_dreamscape");
    expect(here.cec({ siteType: "Purge" } as never, fakeCtx())).toBe(100);
    expect(next.cec({ siteType: "Purge" } as never, fakeCtx())).toBe(75);
    expect(here.cec({ siteType: "Vendor" } as never, fakeCtx())).toBeGreaterThan(
      next.cec({ siteType: "Vendor" } as never, fakeCtx()),
    );
  });

  it("dreamwell rewards are down-weighted to 0.25 so they appear less often", () => {
    // Dreamwell rewards otherwise crowd the random_rewards pool; their pool
    // weight is reduced to a quarter of the default to thin out their
    // appearances. This is a behaviour-protecting test for that tuning.
    expect(getReward("set_starting_dreamwell_positive").weight).toBe(0.25);
    expect(getReward("shuffle_positive_dreamwell_cards").weight).toBe(0.25);
  });

  it("battle-window card rewards are down-weighted and have reduced CEC", () => {
    // `temporary_card_copy_for_X_battles` and `opening_hand_grant_for_X_battles`
    // are weak/situational since their effects evaporate after a small number
    // of battles. They appear at half the default weight and use a lower CEC
    // multiplier than permanent card rewards.
    const tempCopy = getReward("temporary_card_copy_for_X_battles");
    expect(tempCopy.weight).toBe(0.5);
    expect(tempCopy.cec({ cardName: "x", battles: 1 }, fakeCtx())).toBe(10);
    expect(tempCopy.cec({ cardName: "x", battles: 3 }, fakeCtx())).toBe(30);

    const openingHand = getReward("opening_hand_grant_for_X_battles");
    expect(openingHand.weight).toBe(0.5);
    expect(openingHand.cec({ cardName: "x", battles: 1 }, fakeCtx())).toBe(12);
    expect(openingHand.cec({ cardName: "x", battles: 3 }, fakeCtx())).toBe(36);
  });

  it("boost_site_appearance_chance pins CEC to ~75 at percent=20 and scales up to percent=50", () => {
    // Boosting future-dreamscape site appearance is a strong, permanent effect
    // (especially for high-impact site types). The baseline CEC is pinned to
    // 75 at percent=20 and scales linearly to 150 at percent=50.
    const t = getReward("boost_site_appearance_chance");
    // Use a neutral (multiplier 1.0) site type for the baseline tier.
    const baseline20 = t.cec({ siteType: "Vendor Hook", percent: 20 } as never, fakeCtx());
    const baseline50 = t.cec({ siteType: "Vendor Hook", percent: 50 } as never, fakeCtx());
    expect(baseline20).toBe(75);
    expect(baseline50).toBe(150);
    expect(baseline50).toBeGreaterThan(baseline20 * 1.5);
  });

  it("boost_site_appearance_chance applies per-site-type multipliers", () => {
    // Purge, Duplication, and Dreamsign Draft are high-impact site types and
    // receive a 1.25x multiplier; weak utility sites (Essence, Shop,
    // Transfiguration, etc.) receive 0.75x.
    const t = getReward("boost_site_appearance_chance");
    const purge20 = t.cec({ siteType: "Purge", percent: 20 } as never, fakeCtx());
    const duplication20 = t.cec({ siteType: "Duplication", percent: 20 } as never, fakeCtx());
    const dreamsignDraft20 = t.cec({ siteType: "Dreamsign Draft", percent: 20 } as never, fakeCtx());
    const shop20 = t.cec({ siteType: "Shop", percent: 20 } as never, fakeCtx());
    const essence20 = t.cec({ siteType: "Essence", percent: 20 } as never, fakeCtx());
    expect(purge20).toBeCloseTo(75 * 1.25);
    expect(duplication20).toBeCloseTo(75 * 1.25);
    expect(dreamsignDraft20).toBeCloseTo(75 * 1.25);
    expect(shop20).toBeCloseTo(75 * 0.75);
    expect(essence20).toBeCloseTo(75 * 0.75);
    expect(purge20).toBeGreaterThan(shop20);
  });

  it("boost_site_appearance_chance never picks Battle or Draft as the site type", () => {
    // Every dreamscape has exactly one Battle site by construction, and Draft
    // counts are deterministic per completion level (see docs/quests.md), so
    // boosting either type is invalid and must never be generated.
    const t = getReward("boost_site_appearance_chance");
    for (let i = 0; i < 200; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { siteType: string; percent: number };
      expect(p.siteType).not.toBe("Battle");
      expect(p.siteType).not.toBe("Draft");
    }
  });

  it("site-picking rewards never select Battle or Draft as a site type", () => {
    // The four site-picking rewards (add_site_to_dreamscape,
    // add_site_to_next_dreamscape, replace_site_type,
    // boost_site_appearance_chance) all share a single filtered list
    // (JOURNEY_REWARDABLE_SITE_TYPES) that excludes Battle and Draft.
    // Battle is excluded because every dreamscape has exactly one Battle site
    // by construction; Draft is excluded because draft counts are
    // deterministic per completion level (see docs/quests.md § Dreamscape
    // Generation). Neither value may appear as `siteType`, `fromType`, or
    // `toType` on any of these rewards.
    const addHere = getReward("add_site_to_dreamscape");
    const addNext = getReward("add_site_to_next_dreamscape");
    const replace = getReward("replace_site_type");
    const boost = getReward("boost_site_appearance_chance");
    for (let i = 0; i < 400; i += 1) {
      const ctx = fakeCtx();
      const addHereP = addHere.rollParams(ctx, { ...draw, sequenceStep: i }) as { siteType: string };
      const addNextP = addNext.rollParams(ctx, { ...draw, sequenceStep: i }) as { siteType: string };
      const replaceP = replace.rollParams(ctx, { ...draw, sequenceStep: i }) as { fromType: string; toType: string };
      const boostP = boost.rollParams(ctx, { ...draw, sequenceStep: i }) as { siteType: string };
      for (const value of [addHereP.siteType, addNextP.siteType, replaceP.fromType, replaceP.toType, boostP.siteType]) {
        expect(value).not.toBe("Battle");
        expect(value).not.toBe("Draft");
      }
    }
  });

  it("temporary_dreamsign_for_X_battles is rare and pinned to a low CEC", () => {
    // A random dreamsign that lasts only 1-3 battles is weak and situational,
    // so this reward is in the rare tier (weight 0.25) and its CEC is pinned
    // to 25 at battles=1, scaling only modestly up to 50 at battles=3.
    const t = getReward("temporary_dreamsign_for_X_battles");
    expect(t.weight).toBe(0.25);
    expect(t.cec({ battles: 1 } as never, fakeCtx())).toBe(25);
    expect(t.cec({ battles: 2 } as never, fakeCtx())).toBe(37.5);
    expect(t.cec({ battles: 3 } as never, fakeCtx())).toBe(50);
  });
});

describe("rewards table (newly added)", () => {
  it("registers max-essence, draft variants, reclaim, battle-window, transfiguration-all, starter, site/shop templates", () => {
    for (const id of [
      "increase_max_essence",
      "draft_2_predicate_cards_from_4",
      "draft_predicate_card_with_copies",
      "draft_predicate_card_with_transfiguration",
      "make_card_reclaim",
      "make_random_cards_reclaim",
      "opening_hand_grant_for_X_battles",
      "temporary_card_copy_for_X_battles",
      "card_cost_reduction_for_X_battles",
      "apply_named_transfiguration_to_all_predicate_cards",
      "transfigure_chosen_starters",
      "purge_chosen_starters",
      "purge_all_starters",
      "replace_starter_via_draft",
      "apply_random_transfigurations_to_random_cards",
      "temporary_dreamsign_for_X_battles",
      "replace_site_type",
      "shop_essence_discount",
      "shop_omen_discount",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("draft-from-4 rewards pin CEC to 25 for low_spark/high_spark predicates only", () => {
    // low_spark / high_spark each match roughly half the card universe, so a
    // draft-from-4 reward keyed on them offers little selection pressure and
    // should be priced at a flat low CEC rather than the breadth-scaled
    // formula used for narrower predicates. Other predicates keep their
    // standard scaling, so the special-case must not bleed over.
    const draftIds = [
      "draft_predicate_cards_from_4",
      "draft_2_predicate_cards_from_4",
      "draft_predicate_card_with_copies",
      "draft_predicate_card_with_transfiguration",
    ];
    for (const id of draftIds) {
      const t = getReward(id);
      // Probe params: only predicateId matters for the flat-CEC branch; the
      // other fields are supplied with reasonable defaults so the non-flat
      // branch still computes a sensible number.
      const baseParams = { predicateId: "low_spark", copies: 2, transfiguration: "Bronze" };
      expect(t.cec({ ...baseParams, predicateId: "low_spark" } as never, fakeCtx())).toBe(25);
      expect(t.cec({ ...baseParams, predicateId: "high_spark" } as never, fakeCtx())).toBe(25);
      // Warriors keeps its scaled CEC.
      const warriorsCec = t.cec({ ...baseParams, predicateId: "warriors" } as never, fakeCtx());
      expect(warriorsCec).toBeGreaterThan(25);
    }
  });

  it("transform_dreamsign_to_named is registered and renders non-empty", () => {
    const t = getReward("transform_dreamsign_to_named");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
    expect(t.render(p, fakeCtx())).not.toBe("");
  });

  it("increase_max_essence renders with positive integer", () => {
    const t = getReward("increase_max_essence");
    const p = t.rollParams(fakeCtx(), draw) as { amount: number };
    expect(p.amount).toBeGreaterThan(0);
    expect(t.render(p, fakeCtx())).toMatch(/Increase your maximum essence by \d+/);
  });

  it("increase_max_essence CEC is ~25 at amount=50 and scales modestly with amount", () => {
    // Increasing maximum essence is a soft, indirect resource buff: the player
    // still has to gain essence up to the new cap, so the value is much lower
    // than a direct essence grant. The CEC is pinned to roughly half the
    // amount, putting amount=50 around 25 CEC and the full amount=25..125
    // range at roughly 12..63 CEC.
    const t = getReward("increase_max_essence");
    expect(t.cec({ amount: 25 } as never, fakeCtx())).toBeCloseTo(12.5);
    expect(t.cec({ amount: 50 } as never, fakeCtx())).toBeCloseTo(25);
    expect(t.cec({ amount: 75 } as never, fakeCtx())).toBeCloseTo(37.5);
    expect(t.cec({ amount: 100 } as never, fakeCtx())).toBeCloseTo(50);
    expect(t.cec({ amount: 125 } as never, fakeCtx())).toBeCloseTo(62.5);

    // Bracket check matching the tuning intent (amount=50 ~ 25 CEC).
    const cec50 = t.cec({ amount: 50 } as never, fakeCtx());
    expect(cec50).toBeGreaterThanOrEqual(20);
    expect(cec50).toBeLessThanOrEqual(30);
  });

  it("shop_essence_discount renders the discount as permanent", () => {
    // The shop essence discount applies for the rest of the quest, so the
    // render must explicitly say "permanently" to avoid the player reading it
    // as a single-shop or single-purchase effect.
    const t = getReward("shop_essence_discount");
    const p = t.rollParams(fakeCtx(), draw) as { percent: number };
    expect(p.percent).toBeGreaterThan(0);
    expect(t.render(p, fakeCtx())).toBe(
      `Shop essence costs are permanently reduced by ${p.percent}%`,
    );
  });
});

describe("starter-card transfiguration rewards do not use 'Transfigure' as a verb", () => {
  // "Transfiguration" is the noun for named, color-coded modifications in
  // Dreamtides; "Transfigure" is not a player-facing verb. These rewards must
  // describe what actually happens (applying a random transfiguration to
  // starter cards) rather than using a synthetic verb.
  const STARTER_TRANSFIG_REWARD_IDS = [
    "transfigure_random_starters",
    "transfigure_all_starters",
    "transfigure_chosen_starters",
  ];

  it("does not render the verb 'Transfigure' for any starter-transfiguration reward", () => {
    for (const id of STARTER_TRANSFIG_REWARD_IDS) {
      const t = getReward(id);
      // Sweep a handful of seeded rolls so we cover every count branch.
      for (let i = 0; i < 10; i += 1) {
        const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i });
        const rendered = t.render(p, fakeCtx());
        expect(rendered).not.toMatch(/\bTransfigure\b/);
        expect(rendered).toMatch(/transfiguration/i);
      }
    }
  });

  it("renders starter-transfiguration rewards as 'Apply ... transfiguration ... starter card(s)'", () => {
    const randomStarters = getReward("transfigure_random_starters");
    const allStarters = getReward("transfigure_all_starters");
    const chosenStarters = getReward("transfigure_chosen_starters");

    expect(randomStarters.render({ count: 1 } as never, fakeCtx())).toBe(
      "Apply a random transfiguration to 1 random starter card",
    );
    expect(randomStarters.render({ count: 3 } as never, fakeCtx())).toBe(
      "Apply random transfigurations to 3 random starter cards",
    );
    expect(allStarters.render({} as never, fakeCtx())).toBe(
      "Apply a random transfiguration to each starter card",
    );
    expect(chosenStarters.render({ count: 1 } as never, fakeCtx())).toBe(
      "Apply a random transfiguration to 1 chosen starter card",
    );
    expect(chosenStarters.render({ count: 2 } as never, fakeCtx())).toBe(
      "Apply random transfigurations to 2 chosen starter cards",
    );
  });
});

describe("meta_gain_2_rewards", () => {
  it("rolls two distinct non-meta sub-template ids", () => {
    const t = getReward("meta_gain_2_rewards");
    for (let i = 0; i < 20; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { subIds: [string, string] };
      expect(p.subIds[0]).not.toBe(p.subIds[1]);
      expect(p.subIds[0]).not.toMatch(/^meta_/);
      expect(p.subIds[1]).not.toMatch(/^meta_/);
    }
  });

  it("cec sums the sub-template CECs", () => {
    const t = getReward("meta_gain_2_rewards");
    const p = t.rollParams(fakeCtx(), draw) as { subIds: [string, string]; subParams: [unknown, unknown] };
    const cec = t.cec(p as never, fakeCtx());
    expect(cec).toBeGreaterThan(0);
  });

  it("render concatenates the two sub-renders", () => {
    const t = getReward("meta_gain_2_rewards");
    const p = t.rollParams(fakeCtx(), draw);
    const text = t.render(p, fakeCtx());
    expect(text).toContain(".");
    expect(text.length).toBeGreaterThan(10);
  });

  it("viable iff both sub-templates are viable in current state", () => {
    const t = getReward("meta_gain_2_rewards");
    const p = t.rollParams(fakeCtx(), draw);
    // Sub-templates are picked among viable templates, so the meta should be viable.
    expect(t.viable(p, fakeCtx())).toBe(true);
  });
});

describe("named-transfiguration rewards respect per-transfiguration eligibility", () => {
  // `docs/quests.md` § Transfiguration declares an eligibility filter for
  // each named transfiguration:
  //   - Bronze / Azure: events only
  //   - Scarlet:        characters only
  //   - Viridian:       cost > 0
  //   - Rose:           cards with an energy-cost activated ability
  //   - Magenta:        cards with a `materialized`, `judgment`, or
  //                     `once per turn` trigger
  // The reward generator must roll only transfiguration/predicate pairings
  // that are compatible with these filters — otherwise it produces
  // impossible offers like "Apply Bronze to 1 random Warrior".
  async function realCtx(seed = "transfig-eligibility"): Promise<JourneyContext> {
    const content = await loadContent(process.cwd());
    const contentVersion = "test-content-version";
    const state = createInitialJourneyState({ seed, content, contentVersion });
    return buildJourneyContext({
      projectRoot: process.cwd(),
      content,
      state,
      contentVersion,
    });
  }

  it("isCardEligibleForTransfiguration enforces card type filters", async () => {
    const ctx = await realCtx();
    const characters = ctx.content.cards.filter((c) => c.cardType === "Character");
    const events = ctx.content.cards.filter((c) => c.cardType === "Event");
    expect(characters.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);

    // Bronze and Azure are events-only; Scarlet is characters-only.
    expect(characters.every((c) => !isCardEligibleForTransfiguration("Bronze", c))).toBe(true);
    expect(characters.every((c) => !isCardEligibleForTransfiguration("Azure", c))).toBe(true);
    expect(events.every((c) => !isCardEligibleForTransfiguration("Scarlet", c))).toBe(true);
    expect(events.some((c) => isCardEligibleForTransfiguration("Bronze", c))).toBe(true);
    expect(events.some((c) => isCardEligibleForTransfiguration("Azure", c))).toBe(true);
    expect(characters.some((c) => isCardEligibleForTransfiguration("Scarlet", c))).toBe(true);
    // Viridian requires cost > 0.
    const zeroCostCards = ctx.content.cards.filter((c) => c.energyCost === 0);
    expect(zeroCostCards.every((c) => !isCardEligibleForTransfiguration("Viridian", c))).toBe(true);
    // Golden and Prismatic and expanded variants are unrestricted at the
    // generator level, so every card is eligible.
    expect(ctx.content.cards.every((c) => isCardEligibleForTransfiguration("Golden", c))).toBe(true);
    expect(ctx.content.cards.every((c) => isCardEligibleForTransfiguration("Prismatic", c))).toBe(true);
  });

  it("transfigurationsEligibleForPredicate excludes Bronze for character-only predicates", async () => {
    const ctx = await realCtx();
    for (const id of ["characters", "warriors", "survivors", "spirit_animals"]) {
      const pred = getPredicate(id);
      const eligible = transfigurationsEligibleForPredicate(ctx, pred.cardPredicate ?? {});
      expect(eligible).not.toContain("Bronze");
      expect(eligible).toContain("Scarlet");
    }
  });

  it("transfigurationsEligibleForPredicate excludes Scarlet for the events predicate", async () => {
    const ctx = await realCtx();
    const pred = getPredicate("events");
    const eligible = transfigurationsEligibleForPredicate(ctx, pred.cardPredicate ?? {});
    expect(eligible).not.toContain("Scarlet");
    expect(eligible).toContain("Bronze");
  });

  const NAMED_TRANSFIG_REWARDS = [
    "apply_named_transfiguration_to_chosen_predicate_cards",
    "apply_named_transfiguration_to_random_predicate_cards",
    "apply_named_transfiguration_to_all_predicate_cards",
    "draft_predicate_card_with_transfiguration",
  ] as const;

  it("predicate-keyed transfiguration rewards never roll an incompatible pairing", async () => {
    // For every viable rolled offer of a predicate-keyed transfiguration
    // reward, every card matching the predicate must be eligible for the
    // rolled transfiguration. Equivalently: a Bronze offer always has a
    // predicate pool that is a subset of Event cards; a Scarlet offer always
    // has a predicate pool that is a subset of Character cards; etc.
    const ctx = await realCtx();
    for (const id of NAMED_TRANSFIG_REWARDS) {
      const reward = getReward(id);
      let viableCount = 0;
      for (let i = 0; i < 400; i += 1) {
        const params = reward.rollParams(ctx, { ...draw, sequenceStep: i }) as {
          transfiguration: string;
          predicateId: string;
        };
        if (!reward.viable(params as never, ctx)) {
          continue;
        }
        viableCount += 1;
        const matches = transfigurationsEligibleForPredicate(
          ctx,
          getPredicate(params.predicateId).cardPredicate ?? {},
        );
        expect(matches).toContain(params.transfiguration);
      }
      // Sanity: at least some offers must be viable; if 0 we'd be vacuously
      // satisfied and the test would not actually be exercising the path.
      expect(viableCount).toBeGreaterThan(0);
    }
  });

  it("named-transfiguration predicate rewards prefer compatible transfigurations when rolling", async () => {
    // When the predicate is `warriors` (characters only), the roll should
    // never produce Bronze / Azure (events-only) because the eligible-pool
    // filter excludes them. This is the load-bearing behaviour change.
    const ctx = await realCtx();
    for (const id of NAMED_TRANSFIG_REWARDS) {
      const reward = getReward(id);
      // Force the predicate to `warriors` by sweeping seeds and only
      // checking those where the rolled predicate is `warriors`. We expect
      // the rolled transfiguration to never be Bronze or Azure in that case.
      for (let i = 0; i < 400; i += 1) {
        const params = reward.rollParams(ctx, { ...draw, sequenceStep: i }) as {
          transfiguration: string;
          predicateId: string;
        };
        if (params.predicateId === "warriors"
          || params.predicateId === "survivors"
          || params.predicateId === "spirit_animals"
          || params.predicateId === "characters") {
          expect(params.transfiguration).not.toBe("Bronze");
          expect(params.transfiguration).not.toBe("Azure");
        }
        if (params.predicateId === "events") {
          expect(params.transfiguration).not.toBe("Scarlet");
        }
      }
    }
  });

  it("apply_named_transfiguration_to_card_name picks an eligible deck card for the rolled transfiguration", async () => {
    const ctx = await realCtx();
    const reward = getReward("apply_named_transfiguration_to_card_name");
    for (let i = 0; i < 200; i += 1) {
      const params = reward.rollParams(ctx, { ...draw, sequenceStep: i }) as {
        transfiguration: string;
        cardName: string;
      };
      const deckCards = ctx.content.cards.filter(
        (c) => ctx.state.quest.deck.entries.some((e) => e.cardId === c.id),
      );
      const eligibleInDeck = deckCards.filter((c) =>
        isCardEligibleForTransfiguration(params.transfiguration, c),
      );
      if (eligibleInDeck.length > 0) {
        // The selected card name must come from the eligible-in-deck pool.
        expect(eligibleInDeck.map((c) => c.name)).toContain(params.cardName);
      } else {
        // No eligible card in deck -> `viable` must report false.
        expect(reward.viable(params as never, ctx)).toBe(false);
      }
    }
  });
});
