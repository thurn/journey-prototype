# `same_reward_different_costs` shared reward and cost audit

Source: `src/journey/shared/rewards.ts`, `REWARDS`; `src/journey/shared/costs.ts`, `COSTS`.

The shape fixes one reward across all root rows and varies only the visible
cost. Any viable shared reward can supply the fixed reward text and CEC anchor.
Cost templates supply the varied axis when their rendered text reads as a cost
or burden and their CEC fits under the selected reward anchor.

## Shared Reward Axis

Every viable shared reward template can serve the fixed reward. The shape does
not need to vary a reward parameter across rows, so predicate, named object,
resource amount, duration, site type, Dreamsign, starter, transfiguration, and
compound reward templates are all eligible when their own viability checks pass.

## Cost Templates With Direct Cost Text

These templates naturally provide the row axis because each rendered text is a
visible payment, loss, purge, transformation, temporary penalty, route penalty,
or Bane burden.

- `pay_essence`: essence amount axis.
- `pay_omens`: omen count axis.
- `pay_max_essence`: maximum-essence payment.
- `pay_essence_random_range`: random essence range axis.
- `pay_percent_essence`: essence percentage axis.
- `pay_all_remaining_essence`: all-current-essence payment.
- `battle_reward_reduction_flat`: flat battle reward reduction and duration axes.
- `battle_reward_reduction_percent`: percentage battle reward reduction and duration axes.
- `purge_named_card`: named deck-card axis.
- `purge_random_predicate_card`: predicate-card axis.
- `purge_chosen_predicate_card`: chosen predicate-card axis.
- `transform_card_to_random_pool`: named deck-card transformation axis.
- `purge_all_duplicate_cards`: duplicate cleanup axis.
- `purge_named_dreamsign`: named active-Dreamsign axis.
- `purge_random_dreamsign`: random active-Dreamsign axis.
- `purge_chosen_dreamsign`: chosen active-Dreamsign axis.
- `transform_dreamsign_to_random`: chosen Dreamsign transformation axis.
- `gain_random_banes`: Bane count axis.
- `gain_named_banes`: named Bane and count axes.
- `gain_named_banes_for_X_battles`: named Bane, count, and battle-window axes.
- `set_starting_dreamwell_negative`: negative Dreamwell-card axis.
- `shuffle_negative_dreamwell_cards`: negative Dreamwell-card and count axes.
- `remove_transfiguration_from_card`: named deck-card axis.
- `remove_transfigurations_from_random_predicate`: predicate-card axis.
- `draw_X_purge_chosen`: draw count and chosen-card purge axis.
- `remove_shop_sites_from_next_dreamscapes`: dreamscape duration axis.
- `remove_dreamsign_sites_from_next_dreamscapes`: dreamscape duration axis.
- `lose_max_essence`: maximum-essence amount axis.
- `meta_pay_2_costs`: compound axis over two direct cost templates.

## Cost Text Filters

Two shared cost templates render as gains rather than payments or burdens, so
they are filtered for this shape's row text:

- `gain_random_cards_from_pool`
- `gain_additional_starters`

`meta_pay_2_costs` is eligible when both sub-costs pass the same text filter.
