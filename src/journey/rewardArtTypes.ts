/**
 * Maps each shared reward catalog id ("templateId", see
 * `src/journey/shared/rewards.ts`) to the exact reward type string from
 * `docs/rewards.md`. The reward art ledger
 * (`docs/journey-reward-art-matches.toml`) keys its dream entries by these same
 * reward type strings, so this table is the bridge from a generated reward to
 * its matching dream art.
 *
 * A drift guard test asserts these keys exactly equal the `REWARDS` catalog ids
 * and these values exactly equal the lines in `docs/rewards.md`.
 */
export const REWARD_TYPE_BY_TEMPLATE_ID: Readonly<Record<string, string>> =
  Object.freeze({
    gain_essence: "Gain X essence.",
    gain_omens: "Gain X omens.",
    set_essence_to_percent_of_max: "Set essence to X% of maximum essence.",
    gain_essence_random_range: "Gain X-Y essence from a random roll.",
    gain_essence_to_max: "Gain essence up to maximum.",
    gain_random_predicate_cards: "Gain X random <predicate> cards.",
    draft_predicate_cards_from_4: "Draft 1 of 4 <predicate> cards.",
    take_any_from_predicate_choices:
      "Take any number of <predicate> cards from X choices.",
    gain_named_card: "Gain <card>.",
    apply_chosen_transfiguration_to_chosen_card:
      "Apply a transfiguration of your choice to a chosen card.",
    apply_named_transfiguration_to_chosen_predicate_cards:
      "Apply <transfiguration> to X chosen <predicate> cards.",
    apply_named_transfiguration_to_card_name:
      "Apply <transfiguration> to <card>.",
    apply_named_transfiguration_to_random_predicate_cards:
      "Apply <transfiguration> to X random <predicate> cards.",
    transfigure_random_starters:
      "Apply random transfigurations to X random starter cards.",
    transfigure_all_starters:
      "Apply a random transfiguration to each starter card.",
    change_card_to_become_type: "Change <card> to become <card type>.",
    modify_random_cards_to_types:
      "Modify X random cards to become <card type>.",
    make_random_cards_fast: "Change X random cards to have <keyword>.",
    purge_chosen_predicate_cards: "Purge up to X chosen <predicate> cards.",
    purge_chosen_predicate_with_replacement:
      "Transform up to X chosen <predicate> cards into random <predicate> cards.",
    purge_named_starter: "Purge <starter card>.",
    purge_random_starter: "Purge a random starter card.",
    purge_random_starter_with_predicate_replacement:
      "Transform a random starter card into a random <predicate> card.",
    transform_starter_into_named_card:
      "Choose a starter card to transform into <card>.",
    transform_card_in_deck_into_named: "Transform <card> into <card>.",
    transform_chosen_predicate_into_named:
      "Transform a chosen <predicate> card into <card>.",
    duplicate_named_card_X: "Create X duplicates of <card>.",
    duplicate_chosen_cards: "Duplicate X chosen cards.",
    duplicate_random_predicate: "Duplicate X random <predicate> cards.",
    draw_X_and_duplicate_chosen:
      "Draw X cards from your deck and duplicate one chosen drawn card.",
    purge_X_banes: "Purge X bane cards.",
    purge_all_banes: "Purge all bane cards.",
    gain_random_dreamsign: "Gain a random Dreamsign.",
    gain_named_dreamsign: "Gain <Dreamsign>.",
    choose_1_of_X_dreamsigns: "Choose 1 of X Dreamsigns to gain.",
    gain_copy_of_random_dreamsign: "Gain a copy of a random active Dreamsign.",
    gain_copy_of_chosen_dreamsign: "Gain a copy of a chosen active Dreamsign.",
    add_site_to_dreamscape: "Add a <site> site to this dreamscape.",
    add_site_to_next_dreamscape: "Add a <site> site to the next dreamscape.",
    set_starting_dreamwell_positive:
      "Set the starting dreamwell card to <dreamwell card>.",
    shuffle_positive_dreamwell_cards:
      "Shuffle X copies of <dreamwell card> into the dreamwell.",
    next_X_shop_rerolls_free: "Make the next X shop rerolls free.",
    boost_site_appearance_chance:
      "Increase the chance to see <site> sites by X% for X dreamscapes.",
    increase_max_essence: "Increase maximum essence by X.",
    draft_2_predicate_cards_from_4: "Draft 2 of 4 <predicate> cards.",
    draft_predicate_card_with_copies:
      "Draft 1 of 4 <predicate> cards and gain X copies of it.",
    draft_predicate_card_with_transfiguration:
      "Draft 1 of 4 <predicate> cards and apply <transfiguration> to it.",
    make_card_reclaim: "Add Reclaim X to <card>.",
    make_random_cards_reclaim: "Add Reclaim X to X random cards.",
    opening_hand_grant_for_X_battles:
      "Have <card> in your opening hand for the next X battles.",
    temporary_card_copy_for_X_battles:
      "Gain a temporary copy of <card> for the next X battles.",
    card_cost_reduction_for_X_battles:
      "Reduce the cost of <predicate> cards by X for the next X battles.",
    apply_named_transfiguration_to_all_predicate_cards:
      "Apply <transfiguration> to all <predicate> cards.",
    transfigure_chosen_starters:
      "Apply random transfigurations to X chosen starter cards.",
    purge_chosen_starters: "Purge up to X chosen starter cards.",
    purge_all_starters: "Purge all starter cards.",
    replace_starter_via_draft:
      "Replace a chosen starter card with 1 of 4 drafted cards.",
    apply_random_transfigurations_to_random_cards:
      "Apply random transfigurations to X random cards.",
    transform_dreamsign_to_named:
      "Transform a chosen Dreamsign into <Dreamsign>.",
    temporary_dreamsign_for_X_battles:
      "Gain a random Dreamsign for the next X battles.",
    replace_site_type:
      "Replace a <site> site in this dreamscape with a <site> site.",
    shop_essence_discount: "Permanently reduce shop essence costs by X%.",
    shop_omen_discount: "Make the next X shop purchases cost 1 fewer omen.",
    meta_gain_2_rewards: "Gain two rewards from the reward catalog.",
  });

/** Reward type string for a templateId, or undefined when the id is unknown. */
export function rewardTypeForTemplateId(
  templateId: string,
): string | undefined {
  return REWARD_TYPE_BY_TEMPLATE_ID[templateId];
}
