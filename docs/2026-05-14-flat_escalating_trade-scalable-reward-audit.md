# `flat_escalating_trade` Scalable Reward Audit

Source: `src/journey/shared/rewards.ts`, `REWARDS`.

The shape uses a shape-local adapter in `src/journey/shapes/flat_escalating_trade/`
to select one scalable reward family per menu. Each generated menu keeps one
reward family across all three rows, uses strictly increasing essence costs, and
uses strictly increasing reward value across the same numeric axis.

## Selected Shape Families

These shared rewards have a clear numeric axis, coherent escalation text, and
converted values that can be priced as a three-row essence trade at early, mid,
and late stages.

- `gain_omens`: omen count scales directly.
- `increase_max_essence`: maximum-essence amount scales directly.
- `duplicate_chosen_cards`: chosen-card duplicate count scales directly.
- `make_random_cards_reclaim`: random-card count and Reclaim value scale as a
  numeric card-modification package.

## Additional Numerically Scalable Rewards

These shared rewards expose numeric axes that can support future
`flat_escalating_trade` profiles when their target pools, wording, and value
bands are tuned for three payable rows.

- `gain_essence`: essence amount.
- `gain_essence_random_range`: random essence range.
- `set_essence_to_percent_of_max`: maximum-essence percentage.
- `gain_random_predicate_cards`: random card count within a fixed predicate.
- `take_any_from_predicate_choices`: choice count within a fixed predicate.
- `apply_named_transfiguration_to_chosen_predicate_cards`: chosen-card count
  with fixed transfiguration and predicate.
- `apply_named_transfiguration_to_random_predicate_cards`: random-card count
  with fixed transfiguration and predicate.
- `transfigure_random_starters`: starter count.
- `modify_random_cards_to_types`: random-card count with fixed destination
  card type.
- `make_random_cards_fast`: random-card count.
- `purge_chosen_predicate_cards`: chosen-card count within a fixed predicate.
- `purge_chosen_predicate_with_replacement`: chosen-card count within a fixed
  predicate.
- `duplicate_named_card_X`: duplicate count for a fixed named card.
- `duplicate_random_predicate`: duplicate count within a fixed predicate.
- `draw_X_and_duplicate_chosen`: draw count.
- `purge_X_banes`: Bane count.
- `choose_1_of_X_dreamsigns`: Dreamsign choice count.
- `shuffle_positive_dreamwell_cards`: Dreamwell card count for a fixed card.
- `next_X_shop_rerolls_free`: reroll count.
- `draft_2_predicate_cards_from_4`: draft pick count within a fixed predicate.
- `draft_predicate_card_with_copies`: copy count within a fixed predicate.
- `make_card_reclaim`: Reclaim amount for a fixed named card.
- `opening_hand_grant_for_X_battles`: battle duration for a fixed named card.
- `temporary_card_copy_for_X_battles`: battle duration for a fixed named card.
- `card_cost_reduction_for_X_battles`: discount amount and battle duration
  within a fixed predicate.
- `transfigure_chosen_starters`: starter count.
- `purge_chosen_starters`: starter count.
- `apply_random_transfigurations_to_random_cards`: random-card count.
- `temporary_dreamsign_for_X_battles`: battle duration.
- `shop_essence_discount`: discount percentage.
- `shop_omen_discount`: purchase count.
- `boost_site_appearance_chance`: appearance percentage for a fixed site type.

## Fixed Or Contextual Rewards

These shared rewards are useful in other shapes, but their primary axis is a
named object, fixed scope, route edit, all-matching pool, or compound package.
They are better suited to shapes that compare targets, reveal objects, or roll
heterogeneous rows.

- `gain_essence_to_max`
- `draft_predicate_cards_from_4`
- `gain_named_card`
- `apply_chosen_transfiguration_to_chosen_card`
- `apply_named_transfiguration_to_card_name`
- `transfigure_all_starters`
- `change_card_to_become_type`
- `purge_named_starter`
- `purge_random_starter`
- `purge_random_starter_with_predicate_replacement`
- `transform_starter_into_named_card`
- `transform_card_in_deck_into_named`
- `transform_chosen_predicate_into_named`
- `purge_all_banes`
- `gain_random_dreamsign`
- `gain_named_dreamsign`
- `gain_copy_of_random_dreamsign`
- `gain_copy_of_chosen_dreamsign`
- `add_site_to_dreamscape`
- `add_site_to_next_dreamscape`
- `set_starting_dreamwell_positive`
- `draft_predicate_card_with_transfiguration`
- `apply_named_transfiguration_to_all_predicate_cards`
- `purge_all_starters`
- `replace_starter_via_draft`
- `transform_dreamsign_to_named`
- `replace_site_type`
- `meta_gain_2_rewards`
