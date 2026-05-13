# `one_target_many_operations` shared rewards target audit

Source: `src/journey/shared/rewards.ts`, `REWARDS`.

This audit classifies every shared reward template by the operation target it
selects or modifies. The target classes are intended as source material for a
`one_target_many_operations` reward-axis design, where one target remains fixed
and root options vary the operation applied to that target.

The shared reward table is text/CEC driven. Target classes below are inferred
from each template's parameter rolls, viability checks, and rendered text.
Templates appear in more than one section when they involve both a source target
and a destination target.

## Named Card

A named card target is a concrete card name chosen from the deck or content
pool. The target can be the card gained, the existing deck card modified, or the
destination card used by a transform.

- `gain_named_card`: gain the named card.
- `apply_named_transfiguration_to_card_name`: apply a named transfiguration to
  the named deck card.
- `change_card_to_become_type`: change the named deck card to become a rolled
  card type.
- `transform_card_in_deck_into_named`: transform the named deck card into a
  named content card.
- `duplicate_named_card_X`: create one to three duplicates of the named deck
  card.
- `make_card_reclaim`: add Reclaim to the named deck card.
- `opening_hand_grant_for_X_battles`: put the named deck card in the opening
  hand for a temporary battle window.
- `temporary_card_copy_for_X_battles`: gain a temporary copy of the named deck
  card for a temporary battle window.
- `transform_starter_into_named_card`: use the named content card as the
  replacement for a chosen starter card.
- `transform_chosen_predicate_into_named`: use the named content card as the
  replacement for a chosen predicate card.

## Chosen Card

A chosen card target is selected by the player after commitment without a
predicate constraint.

- `apply_chosen_transfiguration_to_chosen_card`: apply a transfiguration of the
  player's choice to the chosen card.
- `duplicate_chosen_cards`: duplicate one to three chosen cards.
- `draw_X_and_duplicate_chosen`: draw two to four cards, then duplicate one of
  the drawn cards of the player's choice.

## Chosen Predicate Card

A chosen predicate card target is selected by the player from cards matching a
rolled predicate. Predicates come from `src/journey/shared/predicates.ts`.

- `apply_named_transfiguration_to_chosen_predicate_cards`: apply a named
  transfiguration to one to three chosen cards matching the predicate.
- `purge_chosen_predicate_cards`: purge up to one to three chosen cards
  matching the predicate.
- `purge_chosen_predicate_with_replacement`: transform up to one to two chosen
  cards matching the predicate into random cards matching the same predicate.
- `transform_chosen_predicate_into_named`: transform a chosen card matching the
  predicate into a named content card.

## Random Predicate Card

A random predicate card target is chosen by the system from cards matching a
rolled predicate. Random gain, duplicate, and replacement templates restrict
their predicates to ability and card-type classes when that makes the reward
text meaningful.

- `gain_random_predicate_cards`: gain one to three random cards matching the
  predicate.
- `apply_named_transfiguration_to_random_predicate_cards`: apply a named
  transfiguration to one to three random cards matching the predicate.
- `duplicate_random_predicate`: duplicate one to three random cards matching
  the predicate.

## All Predicate Cards

An all-predicate target applies the same operation to every card matching a
rolled predicate, or to the predicate class as a temporary rule.

- `apply_named_transfiguration_to_all_predicate_cards`: apply a named
  transfiguration to all cards matching the predicate.
- `card_cost_reduction_for_X_battles`: cards matching the predicate cost one
  to two less for the next three battles.

## Predicate Draft Pool

A predicate draft pool target creates or exposes cards matching a rolled
predicate. These are natural targets for the "Draft 1 of 4 predicate cards and
apply operation" pattern because the selected draft card can be the shared
target for the attached operation.

- `draft_predicate_cards_from_4`: draft one of four cards matching the
  predicate.
- `draft_2_predicate_cards_from_4`: draft two of four cards matching the
  predicate.
- `take_any_from_predicate_choices`: take any number of predicate cards from
  three to five choices.
- `draft_predicate_card_with_copies`: draft one of four predicate cards and
  gain two to three copies of it.
- `draft_predicate_card_with_transfiguration`: draft one of four predicate
  cards and apply a named transfiguration to it.
- `replace_starter_via_draft`: replace a chosen starter card with one of four
  drafted cards.

## Chosen Starter Card

A chosen starter target is selected by the player from starter cards in the
deck.

- `transform_starter_into_named_card`: transform a chosen starter card into a
  named content card.
- `transfigure_chosen_starters`: apply random transfigurations to one or two
  chosen starter cards.
- `purge_chosen_starters`: purge up to one to three chosen starter cards.
- `replace_starter_via_draft`: replace a chosen starter card with one of four
  drafted cards.

## Random Starter Card

A random starter target is selected by the system from starter cards in the
deck.

- `transfigure_random_starters`: apply random transfigurations to one to three
  random starter cards.
- `purge_random_starter`: purge a random starter card.
- `purge_random_starter_with_predicate_replacement`: transform a random starter
  card into a random card matching a rolled predicate.

## All Starter Cards

An all-starter target applies to every starter card in the deck.

- `transfigure_all_starters`: apply a random transfiguration to each starter
  card.
- `purge_all_starters`: purge all starter cards.

## Random Card

A random card target is selected by the system from the deck without a
predicate constraint.

- `modify_random_cards_to_types`: modify one to three random cards to become a
  rolled card type.
- `make_random_cards_fast`: change two to four random cards to have fast.
- `make_random_cards_reclaim`: add Reclaim one to two to one to three random
  cards.
- `apply_random_transfigurations_to_random_cards`: apply random
  transfigurations to one to three random cards.

## Bane Card

A Bane target selects from Bane cards in the deck. Counted Bane purge text does
not specify random selection, so it reads as a chosen Bane-card set.

- `purge_X_banes`: purge one to three Bane cards.
- `purge_all_banes`: purge all Bane cards.

## Named Dreamsign

A named Dreamsign target is a concrete Dreamsign selected from the Dreamsign
content pool. It can be gained directly or used as the destination for a
Dreamsign transform.

- `gain_named_dreamsign`: gain the named Dreamsign.
- `transform_dreamsign_to_named`: transform a chosen active Dreamsign into the
  named Dreamsign.

## Chosen Dreamsign

A chosen Dreamsign target is selected by the player from active Dreamsigns or
from a revealed Dreamsign choice set.

- `choose_1_of_X_dreamsigns`: choose one of two to four Dreamsigns to gain.
- `gain_copy_of_chosen_dreamsign`: gain a copy of one active Dreamsign of the
  player's choice.
- `transform_dreamsign_to_named`: transform a chosen active Dreamsign into a
  named Dreamsign.

## Random Dreamsign

A random Dreamsign target is selected by the system from the Dreamsign content
pool or the player's active Dreamsigns.

- `gain_random_dreamsign`: gain a random Dreamsign.
- `gain_copy_of_random_dreamsign`: gain a copy of one active Dreamsign chosen
  at random.
- `temporary_dreamsign_for_X_battles`: gain a random Dreamsign for the next
  three battles.

## Dreamscape Site Type

A site target is a rolled site type in the current dreamscape, the next
dreamscape, or future dreamscape routing.

- `add_site_to_dreamscape`: add the rolled site type to this dreamscape.
- `add_site_to_next_dreamscape`: add the rolled site type to the next
  dreamscape visited.
- `replace_site_type`: replace one rolled site type in this dreamscape with a
  different rewardable site type.
- `boost_site_appearance_chance`: increase the future appearance chance of the
  rolled site type.

## Dreamwell Card

A Dreamwell-card target is a named positive Dreamwell card from the local
positive Dreamwell list.

- `set_starting_dreamwell_positive`: set the starting Dreamwell card to the
  named Dreamwell card.
- `shuffle_positive_dreamwell_cards`: shuffle one to three copies of the named
  Dreamwell card into the Dreamwell.

## Shop Surface

A shop target changes rerolls, purchases, or permanent shop prices rather than
cards or Dreamsigns.

- `next_X_shop_rerolls_free`: make the next one to three shop rerolls free.
- `shop_essence_discount`: permanently reduce shop essence costs by a rolled
  percentage.
- `shop_omen_discount`: make the next one to three shop purchases cost one
  fewer omen.

## Player Resource

Resource targets modify essence, omens, or maximum essence directly.

- `gain_essence`: gain a rolled amount of essence.
- `gain_omens`: gain one to three omens.
- `set_essence_to_percent_of_max`: set essence to a rolled percentage of
  maximum essence.
- `gain_essence_random_range`: gain a random essence amount from a rolled
  range.
- `gain_essence_to_max`: gain essence up to maximum essence.
- `increase_max_essence`: increase maximum essence by a rolled amount.

## Composite Reward

Composite templates contain sub-rewards. Their target class is the combination
of the selected sub-reward target classes.

- `meta_gain_2_rewards`: gain two viable non-meta rewards selected from the
  same shared reward table.
