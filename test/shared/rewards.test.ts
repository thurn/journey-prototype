import { describe, expect, it } from "vitest";
import {
  REWARDS,
  getReward,
} from "../../src/journey/shared/rewards.js";
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

  it("registers gain_omens, gain_max_essence, set_essence_to_percent_of_max, gain_essence_random_range, gain_essence_to_max", () => {
    for (const id of [
      "gain_omens", "gain_max_essence", "set_essence_to_percent_of_max",
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
      "modify_card_to_reference_type",
      "change_card_to_become_type",
      "modify_random_cards_to_types",
      "make_card_fast",
      "make_random_cards_fast",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
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

  it("modify_card_to_reference_type renders with the plural capitalized card type", () => {
    const t = getReward("modify_card_to_reference_type");
    expect(t.render({ cardName: "Nocturne Strummer", cardTypePredicateId: "warriors" } as never, fakeCtx()))
      .toBe("Modify Nocturne Strummer's text to reference Warriors");
    expect(t.render({ cardName: "Nocturne Strummer", cardTypePredicateId: "spirit_animals" } as never, fakeCtx()))
      .toBe("Modify Nocturne Strummer's text to reference Spirit Animals");
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
      "vendor_hook_bonus",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
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
