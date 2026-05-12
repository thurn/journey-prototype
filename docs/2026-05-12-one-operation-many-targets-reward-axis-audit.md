# `one_operation_many_targets` reward axis audit

Source: `src/journey/shared/rewards.ts`, `REWARDS`.

Non-numeric axis means the reward exposes a predicate, named object,
transfiguration, site type, or single chosen target object. Fixed starter,
random, all-matching, or plural/up-to-N scopes with only counts, percentages,
resource amounts, or battle windows are grouped with numeric/fixed rewards.

## Rewards With Non-Numeric Axes

- `gain_random_predicate_cards`: `Gain {count} random {predicate}`; predicate axis.
- `draft_predicate_cards_from_4`: `Draft 1 of 4 {predicate}`; predicate axis.
- `take_any_from_predicate_choices`: `Take any number of {predicate} from {choices} choices`; predicate axis.
- `gain_named_card`: `Gain {card name}`; card-name axis.
- `apply_chosen_transfiguration_to_chosen_card`: `Apply a transfiguration of your choice to a chosen card`; chosen transfiguration and card axes.
- `apply_named_transfiguration_to_chosen_predicate_cards`: `Apply {transfiguration} to {count} chosen {predicate}`; transfiguration and predicate axes.
- `apply_named_transfiguration_to_card_name`: `Apply {transfiguration} to {card name}`; transfiguration and card-name axes.
- `apply_named_transfiguration_to_random_predicate_cards`: `Apply {transfiguration} to {count} random {predicate}`; transfiguration and predicate axes.
- `change_card_to_become_type`: `Change {card name} to become a {card type}`; card-name and card-type axes.
- `modify_random_cards_to_types`: `Modify {count} random cards to become {card type}`; card-type axis.
- `purge_chosen_predicate_cards`: `Purge up to {count} chosen {predicate}`; predicate axis.
- `purge_chosen_predicate_with_replacement`: `Transform up to {count} chosen {predicate} into random {predicate}`; predicate axis.
- `purge_named_starter`: `Purge {starter card name}`; starter-card-name axis.
- `purge_random_starter_with_predicate_replacement`: `Transform a random starter card into a random {predicate}`; replacement-predicate axis.
- `transform_starter_into_named_card`: `Choose a starter card to transform into {new card name}`; new-card-name axis.
- `transform_card_in_deck_into_named`: `Transform {deck card name} into {new card name}`; deck-card-name and new-card-name axes.
- `transform_chosen_predicate_into_named`: `Transform a chosen {predicate} into {new card name}`; predicate and new-card-name axes.
- `duplicate_named_card_X`: `Create {count} duplicates of {card name}`; card-name axis.
- `duplicate_random_predicate`: `Duplicate {count} random {predicate}`; predicate axis.
- `gain_named_dreamsign`: `Gain {dreamsign name}`; dreamsign-name axis.
- `gain_copy_of_chosen_dreamsign`: `Gain a copy of one of your dreamsigns of your choice`; chosen-dreamsign axis.
- `add_site_to_dreamscape`: `Add a {site type} site to this dreamscape`; site-type axis.
- `add_site_to_next_dreamscape`: `Add a {site type} site to the next dreamscape you visit`; site-type axis.
- `set_starting_dreamwell_positive`: `Your starting dreamwell card is {dreamwell card name}`; dreamwell-card-name axis.
- `shuffle_positive_dreamwell_cards`: `Shuffle {count} {dreamwell card name} into your dreamwell`; dreamwell-card-name axis.
- `boost_site_appearance_chance`: `{percent}% higher chance to see {site type} sites in future dreamscapes`; site-type axis.
- `draft_2_predicate_cards_from_4`: `Draft 2 of 4 {predicate}`; predicate axis.
- `draft_predicate_card_with_copies`: `Draft 1 of 4 {predicate} and gain {copies} copies of it`; predicate axis.
- `draft_predicate_card_with_transfiguration`: `Draft 1 of 4 {predicate} and apply {transfiguration} to it`; predicate and transfiguration axes.
- `make_card_reclaim`: `Add Reclaim {count} to {card name}`; card-name axis.
- `opening_hand_grant_for_X_battles`: `Your opening hand contains {card name} for the next {battles} battles`; card-name axis.
- `temporary_card_copy_for_X_battles`: `Gain a temporary copy of {card name} for the next {battles} battles`; card-name axis.
- `card_cost_reduction_for_X_battles`: `{predicate} cost {amount} less for the next {battles} battles`; predicate axis.
- `apply_named_transfiguration_to_all_predicate_cards`: `Apply {transfiguration} to all {predicate}`; transfiguration and predicate axes.
- `transform_dreamsign_to_named`: `Transform a chosen dreamsign into {dreamsign name}`; dreamsign-name axis.
- `replace_site_type`: `Replace a {from site type} site in this dreamscape with a {to site type} site`; source-site-type and target-site-type axes.
- `meta_gain_2_rewards`: `{reward A}. {reward B}`; sub-reward-template axes.

## Rewards With Numeric Or Fixed Axes

- `gain_essence`: `Gain {amount} essence`; numeric amount.
- `gain_omens`: `Gain {count} omens`; numeric count.
- `set_essence_to_percent_of_max`: `Set essence to {percent}% of your maximum essence`; numeric percentage.
- `gain_essence_random_range`: `Gain {min}-{max} essence`; numeric range.
- `gain_essence_to_max`: `Gain essence up to your maximum`; fixed effect.
- `transfigure_random_starters`: `Apply random transfigurations to {count} random starter cards`; numeric count.
- `transfigure_all_starters`: `Apply a random transfiguration to each starter card`; fixed starter scope.
- `make_random_cards_fast`: `Change {count} random cards to have fast`; numeric count.
- `purge_random_starter`: `Purge a random starter card`; fixed random starter scope.
- `duplicate_chosen_cards`: `Duplicate {count} chosen cards`; numeric count.
- `draw_X_and_duplicate_chosen`: `Draw {drawCount} cards from your deck and duplicate one of them of your choice`; numeric draw count.
- `purge_X_banes`: `Purge {count} bane cards`; numeric count.
- `purge_all_banes`: `Purge all bane cards`; fixed bane scope.
- `gain_random_dreamsign`: `Gain a random dreamsign`; fixed random dreamsign scope.
- `choose_1_of_X_dreamsigns`: `Choose 1 of {choices} dreamsigns to gain`; numeric choice count.
- `gain_copy_of_random_dreamsign`: `Gain a copy of one of your dreamsigns chosen at random`; fixed random dreamsign scope.
- `next_X_shop_rerolls_free`: `Your next {count} shop rerolls are free`; numeric count.
- `increase_max_essence`: `Increase your maximum essence by {amount}`; numeric amount.
- `make_random_cards_reclaim`: `Add Reclaim {reclaim} to {count} random cards`; numeric keyword amount and count.
- `transfigure_chosen_starters`: `Apply random transfigurations to {count} chosen starter cards`; numeric count.
- `purge_chosen_starters`: `Purge up to {count} chosen starter cards`; numeric count.
- `purge_all_starters`: `Purge all starter cards`; fixed starter scope.
- `replace_starter_via_draft`: `Replace a chosen starter card with 1 of 4 drafted cards`; fixed starter replacement scope.
- `apply_random_transfigurations_to_random_cards`: `Apply random transfigurations to {count} random cards`; numeric count.
- `temporary_dreamsign_for_X_battles`: `Gain a random dreamsign for the next {battles} battles`; numeric battle window.
- `shop_essence_discount`: `Shop essence costs are permanently reduced by {percent}%`; numeric percentage.
- `shop_omen_discount`: `Your next {count} shop purchases cost 1 fewer omen`; numeric count.
