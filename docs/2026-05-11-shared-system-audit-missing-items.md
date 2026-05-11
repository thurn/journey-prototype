

- Missing reward: increase maximum essence (old `resource_cap_change` positive).
  New has `gain_essence_to_max` and `set_essence_to_percent_of_max` but nothing
  that raises the cap itself.
- Missing reward: draft 2 of 4 from a predicate pool. New
  `draft_predicate_cards_from_4` only supports 1 of 4.
- Missing reward: draft 1 of 4 then gain 2 copies (`card_draft_copy`).
- Missing reward: draft 1 of 4 + apply transfiguration immediately
  (`card_draft_with_transfiguration`).
- Missing reward: add `Reclaim N` to a card. New only grants `Fast`
  (`make_card_fast` / `make_random_cards_fast`).
- Missing reward: battle-window grants — opening-hand grant, temporary copy for
  next N battles, cost reduction for next N battles. The whole "temporary,
  expires after N battles" pattern is gone from the reward side.
- Missing reward: transfigure all cards of a predicate (e.g. "all Warriors") and
  transfigure all events. New `apply_named_transfiguration_to_*` only supports
  `count` 1–3 random/chosen.
- Missing reward: transfigure 1–2 chosen starters. New has
  `transfigure_random_starters` and `transfigure_all_starters` only.
- Missing reward: purge up to N chosen starters. `purge_named_starter` only
  handles a single named starter, not "chosen up to N."
- Missing reward: purge all starters without replacement. Only
  `purge_all_starters_replace` (with replacement) exists.
- Missing reward: replace chosen starter via a 4-card draft
  (`starter_replacement (draft)`).
- Missing reward: apply N random transfigurations to N random deck cards. New
  always names the transfiguration on the reward side.
- Missing reward: transfigure-on-draft (apply transfiguration to a
  freshly-drafted card).
- Missing reward: transform a chosen dreamsign into a specific named dreamsign.
  New only has the random direction, and only as a cost
  (`transform_dreamsign_to_random`).
- Missing reward: temporary dreamsign grant ("for next N battles").
- Missing reward: replace site (one type → another).
- Missing reward: shop essence discount, shop omen discount, vendor hook bonus.
  Only `next_X_shop_rerolls_free` survives.
- Missing cost: lose maximum essence (`resource_cap_change` negative).
- Missing cost: all status burdens — prohibitions on deck modification, on
  transfiguration, on essence gain, on deck cut; structural constraints (exact
  deck size, minimum deck size, dreamwell rule, omen reroll cap). Only the
  battle reward reduction variants survive (`battle_reward_reduction_flat`,
  `battle_reward_reduction_percent`).
- Missing predicate: discard-text cards (old `discardTextCards` profile,
  `renderedTextIncludes: "discard"`).
- Missing predicate: Abandon cards.
- Missing predicate: event-copying cards (`renderedTextIncludes: ["copy",
  "event"]`).
- Missing predicate: energy-generation cards (`renderedTextIncludes: ["Gain",
  "●"]`).
- Missing predicate: Dissolve / Dissolved cards.
- Missing predicate: Reclaim cards.
- Transfigurations: new imports the full `ALLOWED_TRANSFIGURATIONS` from
  `effects.ts`, so the 9-name vocabulary is preserved — but the application
  surface (chosen vs. random; all-of-predicate; named to predicate, etc.) is
  narrower.
