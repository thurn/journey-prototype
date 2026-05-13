# `same_cost_different_rewards` shared reward and cost audit

Source: `src/journey/shared/rewards.ts`, `REWARDS`, and
`src/journey/shared/costs.ts`, `COSTS`.

The shape varies the reward axis while all rows share one visible cost. Every
viable reward template with positive converted essence can support the varied
reward axis because the shared cost is rendered as row text and subtracted from
each option's net value. Distinctness is enforced by template ID, including
sub-template IDs for meta rewards.

## Reward Axis Coverage

- Resource amount rewards: `gain_essence`, `gain_omens`,
  `set_essence_to_percent_of_max`, `gain_essence_random_range`,
  `gain_essence_to_max`, and `increase_max_essence`.
- Card predicate rewards: `gain_random_predicate_cards`,
  `draft_predicate_cards_from_4`, `take_any_from_predicate_choices`,
  `apply_named_transfiguration_to_chosen_predicate_cards`,
  `apply_named_transfiguration_to_random_predicate_cards`,
  `purge_chosen_predicate_cards`,
  `purge_chosen_predicate_with_replacement`,
  `transform_chosen_predicate_into_named`, `duplicate_random_predicate`,
  `draft_2_predicate_cards_from_4`, `draft_predicate_card_with_copies`,
  `draft_predicate_card_with_transfiguration`,
  `card_cost_reduction_for_X_battles`,
  and `apply_named_transfiguration_to_all_predicate_cards`.
- Named card rewards: `gain_named_card`,
  `apply_named_transfiguration_to_card_name`, `change_card_to_become_type`,
  `transform_card_in_deck_into_named`, `duplicate_named_card_X`,
  `make_card_reclaim`, `opening_hand_grant_for_X_battles`,
  and `temporary_card_copy_for_X_battles`.
- Starter rewards: `transfigure_random_starters`,
  `transfigure_all_starters`, `purge_named_starter`,
  `purge_random_starter`, `purge_random_starter_with_predicate_replacement`,
  `transform_starter_into_named_card`, `transfigure_chosen_starters`,
  `purge_chosen_starters`, `purge_all_starters`, and
  `replace_starter_via_draft`.
- Dreamsign rewards: `gain_random_dreamsign`, `gain_named_dreamsign`,
  `choose_1_of_X_dreamsigns`, `gain_copy_of_random_dreamsign`,
  `gain_copy_of_chosen_dreamsign`, `transform_dreamsign_to_named`, and
  `temporary_dreamsign_for_X_battles`.
- Route, shop, and Dreamwell rewards: `add_site_to_dreamscape`,
  `add_site_to_next_dreamscape`, `set_starting_dreamwell_positive`,
  `shuffle_positive_dreamwell_cards`, `next_X_shop_rerolls_free`,
  `replace_site_type`, `shop_essence_discount`, `shop_omen_discount`, and
  `boost_site_appearance_chance`.
- Bane cleanup and compound rewards: `purge_X_banes`, `purge_all_banes`,
  and `meta_gain_2_rewards`.

## Cost Axis Coverage

The shared cost axis can use viable cost templates whose converted essence fits
under the selected reward band cap and whose rendered text reads coherently as a
visible shared cost before each reward.

- Resource costs: `pay_essence`, `pay_omens`, `pay_max_essence`,
  `pay_essence_random_range`, `pay_percent_essence`,
  `pay_all_remaining_essence`, and `lose_max_essence`.
- Card costs: `purge_named_card`, `purge_random_predicate_card`,
  `purge_chosen_predicate_card`, `transform_card_to_random_pool`,
  `purge_all_duplicate_cards`, `remove_transfiguration_from_card`,
  `remove_transfigurations_from_random_predicate`, and
  `draw_X_purge_chosen`.
- Dreamsign costs: `purge_named_dreamsign`, `purge_random_dreamsign`,
  `purge_chosen_dreamsign`, and `transform_dreamsign_to_random`.
- Bane costs: `gain_random_banes`, `gain_named_banes`, and
  `gain_named_banes_for_X_battles`.
- Dreamwell, route, and battle-window costs:
  `battle_reward_reduction_flat`, `battle_reward_reduction_percent`,
  `set_starting_dreamwell_negative`, `shuffle_negative_dreamwell_cards`,
  `remove_shop_sites_from_next_dreamscapes`, and
  `remove_dreamsign_sites_from_next_dreamscapes`.
- Compound costs: `meta_pay_2_costs`.

## Migration Design

The fill algorithm rolls three distinct rewards from `REWARDS`, keeps later
rows within a widening converted-essence band around the first row, and then
rolls one shared viable cost from `COSTS`. The shared cost is capped to a
fraction of the lowest selected reward value so all options remain comparable
after subtraction.

The shape keeps structured operation, cost, effect, burden, target, trigger,
and route-effect arrays empty. Manifest output is carried by option text,
symbols, and converted-essence fields, with validation limited to the universal
manifest and root-option checks.
