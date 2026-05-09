# Brainstorm Reachability Coverage Matrix

This matrix translates [Brainstorm Examples](brainstorm_examples.md) into
capability-family requirements for the generator. Exact object names, transcript
phrasing, chance percentages, and amounts are non-normative unless they expose a
missing selector, cost band, resource amount family, or payload class.

`Normal reach` describes whether the current normal generator can compose the
listed families without `--debug-payload-*`. `Debug fixture` records whether a
forced debug payload can demonstrate nearby manifest contracts; it is evidence
for renderer and manifest support, not evidence of normal generation.

## Milestone 24 Procedural Reachability Checks

The following rows are fixed normal-generation checks used by
`test/journey-generation.test.ts`. They are not debug fixtures: each row records
the deterministic seed, stage, forced shape, payload families, and structured
operation tags that make the named example procedurally possible.

| Example | Seed | Stage | Shape | Payload-family check | Structured operation evidence |
| --- | --- | --- | --- | --- | --- |
| Three Masks | `three-masks-procedural-0` | early | `same_reward_different_costs` | `card_draft`, `card:predicate`, `immediate` | `reward:card_draft`, `target:card:predicate` |
| Curator's Shelf | `shop-test-4` | mid | `shop_row` | `dreamsign_purchase`, `resource_cost:essence`, `dreamsign:exact` | `cost:essence:fixed`, `reward:dreamsign_purchase`, `target:dreamsign:exact` |
| One Blessing, Three Vessels | `m18-one-blessing-2` | early | `one_operation_many_targets` | `card_transfigure`, `card:exact`, `symmetry:shared_operation_named_targets` | `reward:card_transfigure`, `target:card:exact` |
| Equal Shadow | `m18-equal-shadow-1` | early | `same_cost_different_rewards` | `bane_gain`, `dreamsign_gain`, `card_draft`, `route_edit:add_site`, `symmetry:shared_burden_different_rewards` | `burden:bane_gain`, `reward:dreamsign_gain`, `reward:card_draft`, `route_edit:add_site` |
| One Card, Three Masks | `m18-one-card-three-masks-0` | early | `one_target_many_operations` | `card_transfigure`, `card:exact`, `symmetry:shared_target_operations` | `reward:card_transfigure`, `target:card:exact` |
| Narrow Reservoir | `m24-resource-0` | early | `same_cost_different_rewards` | `resource_amount:random_range`, `resource_cost:essence` | `cost:essence:random_range` |
| Atlas Locksmith | `matrix-atlas-locksmith` | late | `alter_dreamscapes` | `route_edit:replace_site`, `route_edit:add_site`, `route_site:exact`, `symmetry:shared_source_site_destinations` | `route_edit:replace_site`, `route_edit:add_site`, `reward:resource`, `burden:bane_gain` |
| First Breath | `m12-timed-window-0` | mid | `timed_window_menu` | `battle_window_modifier`, `delayed:next 2 battles`, `symmetry:shared_timing_different_rewards` | `reward:battle_window_modifier` |
| Dreamwell Switch | `m13-167` | mid | `timed_window_menu` | `dreamwell_modifier`, `delayed:next 3 battles`, `symmetry:shared_timing_different_rewards` | `reward:dreamwell_modifier` |
| Shop Courtesy | `m14-shop-courtesy-5` | mid | `timed_window_menu` | `shop_economy_modifier`, `resource_amount:restore_to_maximum` | `reward:shop_economy_modifier`, `reward:resource` |
| Sealed Hands | `m14-sealed-hands-0` | late | `single_offer` | `status`, `card_transform` | `status:status_structural_constraint`, `reward:card_transform` |
| Sleeping Contract | `sleeping-contract` | early | `reward_after_trigger` | `delayed_hook`, `dreamsign_gain`, `trigger:site_visit` | `delayed_hook:site_visit`, `reward:dreamsign_gain` |
| Borrowed Crown | `organic-paired-return` | late | `paired_return` | `paired_return`, `dreamsign_temporary_grant`, `trigger:each_battle` | `paired_return:borrowed_object_return`, `reward:dreamsign_temporary_grant` |
| Covered Cups | `covered-cups-3` | mid | `single_random_outcome` | `random:reveal_rewards`, `reveal_envelope`, `random` | `random:reveal_rewards` |
| Emergency Thread | `m24-generated-16` | late | `one_target_many_operations` | `generated_object`, `generated_object:dreamsign` | `generated_object:dreamsign`, `reward:generated_object_grant` |
| Bottomless Bowl | `bottomless-bowl-flat-trade` | mid | `flat_escalating_trade` | `resource_cost:essence`, `resource`, `symmetry:flat_escalating_trade` | `cost:essence:fixed`, `reward:resource` |
| Covered Cups Reveal Menu | `covered-cups-reveal-choice-menu` | mid | `reveal_choice_menu` | `random:choose_one_revealed_reward`, `random:gain_one_random_reward`, `reveal_envelope` | `random:choose_one_revealed_reward`, `random:gain_one_random_reward` |
| Shared Prefix Menu | `shared-prefix-menu-forced` | mid | `shared_prefix_menu` | `bane_gain`, `dreamsign_gain`, `card_draft`, `route_edit:add_site`, `symmetry:shared_burden_different_rewards` | `burden:bane_gain`, `reward:dreamsign_gain`, `reward:card_draft`, `route_edit:add_site` |

| Example | Needed topology | Payload families | Selector families | Timing families | Normal reach | Debug fixture |
| --- | --- | --- | --- | --- | --- | --- |
| Violet Survey | direct trio | `card_draft`, `resource`, `bane_random_purge` | `card:predicate`, `bane:hidden_random` | `immediate` | partial: draft/resource only | bane fixture |
| Equal Shadow | same burden, different rewards | `bane_gain`, `dreamsign_gain`, `card_draft`, `route_edit:add_site` | `bane:exact`, `dreamsign:exact`, `card:predicate`, `route_site:exact` | `immediate`, `route:current_dreamscape` | no | dreamsign/route/bane separate |
| Three Doors of Glass | same reward, different costs | `resource_cost:essence`, `card_draft` | `card:predicate` | `immediate` | partial: profiles exist separately | none |
| Locksmith Counter | one target, many operations | `starter_cleanup`, `card_transfigure`, `starter_replacement` | `card:chosen_after_commitment`, `card:predicate` | `immediate` | partial: cleanup/transfigure only | card fixture |
| Curator's Shelf | shop row | `dreamsign_purchase`, `resource_cost:essence` | `dreamsign:exact` | `immediate` | no | dreamsign named shop |
| First Orchard | curated trio | `card_draft`, `dreamsign_gain`, `card_transfigure` | `card:predicate`, `dreamsign:exact`, `card:chosen_after_commitment` | `immediate` | no | card/dreamsign separate |
| Forked Remedy | heterogeneous pair | `starter_cleanup`, `bane_gain`, `card_duplicate` | `card:chosen_after_commitment`, `bane:exact` | `immediate` | no | card/bane separate |
| One Card, Three Masks | one target, many operations | `card_transfigure` | `card:exact` | `immediate` | partial: generic target only | card fixture |
| Dreamsign Loom | Dreamsign operation menu | `dreamsign_transform`, `dreamsign_duplicate`, `dreamsign_purge`, `dreamsign_draft` | `dreamsign:chosen_after_commitment`, `dreamsign:predicate` | `immediate` | no | dreamsign transform fixture |
| One Blessing, Three Vessels | one operation, many targets | `card_transfigure` | `card:exact` | `immediate` | partial: generic targets only | card fixture |
| Thin Air | choose loss | `resource_loss`, `bane_gain` | `bane:exact` | `immediate` | partial: one loss per option only | bane/resource separate |
| Priced Silence | single offer | `resource_cost:essence`, `card_purge` | `card:chosen_after_commitment` | `immediate` | partial: offer/cost only | card fixture |
| Cursed Star | risk or skip | `dreamsign_gain`, `bane_gain`, `random_envelope` | `dreamsign:exact`, `bane:exact` | `immediate`, `random` | partial: random downside only | dreamsign/bane separate |
| Veiled Cache | random pool draw | `resource_cost:essence`, `random_reward`, `bane_random_purge`, `card_draft`, `dreamsign_gain` | `dreamsign:exact`, `bane:hidden_random`, `card:predicate` | `random`, `immediate` | partial: generic pool only | random/bane/dreamsign separate |
| Sleeping Contract | delayed promise | `dreamsign_gain`, `delayed_hook` | `dreamsign:exact` | `trigger:victory`, `duration:battle_count` | partial: next-victory hook only | hook/dreamsign separate |
| Winchime Promise | delayed site trigger | `delayed_hook`, `dreamsign_gain` | `route_site:exact`, `dreamsign:exact` | `trigger:site_visit` | no | hook fixture |
| Current Map Ink | route edit menu | `route_edit:replace_site` | `route_site:exact` | `route:current_dreamscape` | partial: two options only | route fixture |
| Toll Cabinet | same cost, different rewards | `resource_cost:essence`, `starter_cleanup`, `card_transfigure`, `dreamsign_draft` | `card:chosen_after_commitment`, `dreamsign:predicate` | `immediate` | partial: families separate | none |
| Bounded Wheel | random wheel plus keep-one | `random_reward`, `bane_random_purge`, `bane_gain`, `roll_twice_keep_one`, `resource_cost:omens` | `dreamsign:exact`, `bane:hidden_random` | `random` | partial: random machinery only | random/bane separate |
| Lantern Budget | resource menu | `resource`, `resource_cap_change`, `resource_percentage` | none | `immediate` | partial: fixed gain only | resource fixture |
| Omen Ledger | resource menu with paid rewards | `resource`, `resource_cost:omens`, `card_draft`, `dreamsign_draft` | `card:predicate`, `dreamsign:predicate` | `immediate` | partial: families separate | none |
| Thorned Cleanup | cleanup trio | `starter_cleanup`, `bane_chosen_purge`, `bane_replace`, `resource` | `card:chosen_after_commitment`, `bane:chosen_after_commitment`, `bane:exact` | `immediate` | partial: starter cleanup only | bane fixture |
| Eight Windows | card predicate trio | `card_draft`, `card_gain` | `card:predicate`, `card:visible_random` | `immediate` | no | none |
| Sign Between Bells | Dreamsign trio | `dreamsign_gain`, `dreamsign_random_reward`, `dreamsign_draft` | `dreamsign:exact`, `dreamsign:hidden_random`, `dreamsign:predicate` | `immediate` | partial: draft only | dreamsign fixture |
| Green Knife | card operation trio | `card_transfigure` | `card:chosen_after_commitment`, `card:exact`, `card:predicate` | `immediate` | partial: generic transfigure only | card fixture |
| Unsorted Change | random/bulk transfigure | `card_transfigure`, `bane_gain` | `card:visible_random`, `card:predicate`, `bane:exact` | `immediate` | no | card/bane separate |
| Starter Door | starter replacement menu | `starter_replacement`, `starter_cleanup` | `card:exact`, `card:visible_random`, `card:predicate` | `immediate` | no | card fixture |
| Map Fold | route edit trio | `route_edit:add_site`, `route_edit:probability_adjustment` | `route_site:exact` | `route:current_dreamscape`, `route:future_dreamscapes` | partial: two route options | route fixture |
| Echo Table | duplicate menu | `card_duplicate` | `card:chosen_after_commitment`, `card:exact`, `card:visible_random` | `immediate` | partial: chosen duplicate only | card fixture |
| Ink Reassignment | card rewrite menu | `card_text_modification`, `card_type_change`, `card_keyword_add` | `card:exact`, `card:chosen_after_commitment` | `immediate` | partial: add Fast only | card fixture |
| Quickening Spill | card rewrite menu | `card_keyword_add`, `card_type_change` | `card:exact`, `card:visible_random` | `immediate` | partial: one-card add Fast only | card fixture |
| First Breath | timed window menu | `battle_window_modifier`, `dreamsign_temporary_grant` | `dreamsign:exact` | `duration:battle_count`, `trigger:battle` | partial: families in separate windows | dreamsign/timed fixtures |
| Dreamwell Switch | timed Dreamwell menu | `dreamwell_modifier` | none | `duration:battle_count` | partial: narrower Dreamwell payloads | dreamwell fixture |
| Shop Courtesy | shop timed menu | `shop_economy_modifier`, `resource_restore_to_maximum` | none | `duration:shop_count`, `trigger:future_shop` | partial: narrower shop payloads | shop fixture |
| Pool Compass | Dreamsign pool menu | `dreamsign_pool_edit`, `dreamsign_copy_gain` | `dreamsign:chosen_after_commitment`, `dreamsign:predicate` | `immediate` | no | dreamsign fixture |
| Promise Card | trigger counter promises | `card_gain`, `dreamsign_gain`, `delayed_hook`, `card_duplicate` | `card:exact`, `dreamsign:exact` | `trigger:named_card_play`, `trigger:dreamsign_trigger` | no | hook/card/dreamsign separate |
| Split Signal | card transformation menu | `card_merge`, `card_split`, `card_rewrite` | `card:chosen_after_commitment`, `card:predicate` | `immediate` | no | none |
| Omen-Fed Prism | mixed paid rewards | `resource_cost:omens`, `resource_cost:essence`, `resource_amount:percentage_of_current`, `card_draft`, `dreamsign_gain`, `card_transfigure` | `card:predicate`, `dreamsign:exact`, `card:chosen_after_commitment` | `immediate` | partial: payloads separate | resource/dreamsign separate |
| Hollow Treasury | resource edge costs | `resource_amount:maximum`, `resource_amount:all_remaining`, `resource_amount:random_range`, `dreamsign_gain`, `card_draft` | `dreamsign:exact`, `card:predicate` | `immediate`, `random` | no | resource fixture |
| Withered Orchard | burdened reward menu | `reward_reduction`, `dreamsign_gain`, `card_gain`, `starter_cleanup` | `dreamsign:exact`, `card:predicate`, `card:chosen_after_commitment` | `immediate` | no | status/resource separate |
| Scissor Saint | purge plus reward menu | `card_purge`, `dreamsign_gain`, `card_draft`, `dreamsign_purge`, `card_transfigure` | `card:exact`, `card:visible_random`, `dreamsign:chosen_after_commitment` | `immediate` | no | card/dreamsign separate |
| Molting Archive | transform plus reward menu | `dreamsign_transform`, `card_transform`, `dreamsign_gain`, `card_gain`, `card_purge` | `dreamsign:exact`, `card:exact`, `card:predicate` | `immediate`, `random` | no | card/dreamsign separate |
| Bane Ledger | Bane side-effect menu | `bane_gain`, `bane_temporary`, `route_edit:add_site`, `card_transfigure` | `bane:exact`, `route_site:exact`, `card:chosen_after_commitment` | `immediate`, `duration:battle_count` | no | bane/route separate |
| Starter Debt | starter/Bane/card trio | `card_gain`, `card_transfigure`, `card_draft`, `card_rewrite`, `resource` | `card:predicate`, `card:visible_random`, `card:exact` | `immediate` | no | card fixture partial |
| Stolen Verbs | keyword removal menu | `card_keyword_remove`, `card_draft`, `card_purge`, `dreamsign_gain` | `card:exact`, `card:predicate`, `dreamsign:exact` | `immediate` | no | card fixture partial |
| Narrow Gate | negative battle window menu | `battle_window_modifier`, `dreamsign_gain`, `card_gain`, `card_transfigure` | `dreamsign:exact`, `card:predicate`, `card:chosen_after_commitment` | `duration:battle_count` | no | timed/card separate |
| Tomorrow's Knife | delayed purge menu | `delayed_hook`, `card_purge`, `dreamsign_gain`, `dreamsign_random_reward` | `card:hidden_random`, `dreamsign:exact`, `dreamsign:hidden_random` | `trigger:battle`, `trigger:each_battle` | no | hook fixture partial |
| Bitter Dreamwell | negative Dreamwell menu | `dreamwell_modifier`, `dreamsign_gain`, `card_gain` | `dreamsign:exact`, `card:predicate` | `duration:battle_count` | no | dreamwell fixture partial |
| Vanishing Atlas | atlas route burden menu | `route_edit:remove_site`, `route_edit:purge_site`, `card_transfigure`, `dreamsign_gain` | `route_site:exact`, `card:predicate`, `dreamsign:exact` | `route:full_atlas`, `route:current_dreamscape` | no | route fixture partial |
| Sealed Hands | persistent prohibition menu | `status`, `dreamsign_gain`, `resource`, `card_gain` | `dreamsign:exact`, `card:predicate` | `duration:journey_count` | no | status fixture |
| Crooked Coin | random cost menu | `random_envelope`, `resource_cost:essence`, `dreamsign_gain`, `dreamsign_purge` | `dreamsign:exact`, `dreamsign:hidden_random` | `random` | partial: random cost only | random/dreamsign separate |
| Borrowed Crown | temporary grant with return cost | `dreamsign_temporary_grant`, `paired_return`, `resource_cost:essence`, `bane_gain`, `card_draft`, `card_purge` | `dreamsign:exact`, `bane:exact`, `card:predicate` | `duration:battle_count`, `trigger:battle` | partial: temporary/paired separate | return/dreamsign fixture |
| Duplicate Draft | draft copy menu | `card_draft`, `card_duplicate`, `bane_gain`, `resource_cost:essence`, `dreamsign_purge` | `card:predicate`, `bane:exact`, `dreamsign:hidden_random` | `immediate` | no | none |
| Duplicate Purge | shared purge menu | `card_purge`, `dreamsign_gain`, `card_draft`, `card_duplicate`, `card_transfigure` | `card:predicate`, `dreamsign:exact`, `card:chosen_after_commitment` | `immediate` | no | card/dreamsign separate |
| Thorn Debt | delayed Bane transform | `bane_gain`, `delayed_hook`, `bane_transform_to_card`, `resource_cost:essence`, `card_gain` | `bane:exact`, `card:exact` | `trigger:battle`, `trigger:card_added` | no | bane/hook separate |
| First Thought | opening-hand card menu | `card_opening_hand`, `card_keyword_add`, `card_rewrite` | `card:chosen_after_commitment`, `card:predicate` | `duration:battle_count`, `trigger:battle` | partial: operations separate | card fixture partial |
| Spoiled Victory | victory replacement menu | `delayed_hook`, `dreamsign_draft`, `resource`, `route_edit:add_site`, `status` | `dreamsign:predicate`, `route_site:exact` | `trigger:victory` | partial: delayed generic rewards only | status/hook separate |
| Emergency Thread | generated status menu | `generated_object:status`, `generated_object_grant`, `status` | `status:exact` | `immediate`, `duration:journey_count` | partial: generated status archetypes only | generated_object/status fixtures |
| Covered Cups | reveal menu | `reveal_envelope`, `random_reward`, `bane_gain` | `bane:exact` | `random` | partial: debug only for reveal root | random fixture |
| Root Contract | delayed Dreamsign transform | `dreamsign_gain`, `delayed_hook`, `dreamsign_transform`, `resource_cost:essence` | `dreamsign:exact` | `trigger:essence_payment`, `duration:battle_count` | no | dreamsign/hook separate |
| Gathered Kindling | delayed transfigure menu | `delayed_hook`, `card_transfigure` | `card:predicate` | `trigger:card_added` | no | hook/card separate |
| Unbarred Spellbook | target-restriction rewrite | `card_rewrite`, `bane_gain` | `card:chosen_after_commitment`, `card:predicate`, `bane:exact` | `immediate` | no | none |
| Key Ticket | future trade menu | `dreamsign_gain`, `paired_return`, `resource`, `card_gain`, `route_edit:add_site` | `dreamsign:exact`, `card:predicate`, `route_site:exact` | `trigger:future_shop`, `trigger:future_dream_journey`, `duration:battle_count` | partial: paired return narrower | return/dreamsign separate |
| Repeating Bell | Dreamsign trigger menu | `dreamsign_gain`, `delayed_hook`, `card_duplicate`, `dreamsign_transform`, `dreamsign_temporary_grant` | `dreamsign:exact`, `card:chosen_after_commitment` | `trigger:dreamsign_trigger`, `duration:battle_count` | no | hook/dreamsign separate |
| Atlas Needle | route edit plus side effect | `route_edit:replace_site`, `route_edit:add_site`, `resource`, `bane_gain` | `route_site:exact`, `bane:exact` | `route:current_dreamscape`, `immediate` | partial: route edits only | route fixture |
| Narrow Reservoir | resource edge trio | `resource`, `resource_cap_change`, `resource_loss`, `resource_amount:all_remaining`, `dreamsign_gain`, `bane_gain` | `dreamsign:exact`, `bane:exact` | `immediate` | partial: resource edge debug only | resource fixture |
| Broken Victory | battle rule window | `battle_window_modifier` | none | `duration:battle_count` | no | timed fixture partial |
| Held Breath | now vs victory later | `resource`, `delayed_hook` | none | `immediate`, `trigger:victory` | partial: now/later and victory hook separate | hook fixture |
| Bottomless Bowl | decision tree or paid trio | `resource_cost:essence`, `resource` | none | `immediate` | partial: decision tree only | decision_tree fixture |
| Dreamsign Brink | push your luck | `dreamsign_random_reward`, `dreamsign_draft`, `bane_gain`, `random_envelope` | `dreamsign:hidden_random`, `dreamsign:predicate`, `bane:exact` | `random` | partial: push tree narrower | decision_tree/random fixtures |
| Returning Lantern | paired return menu | `paired_return`, `dreamsign_gain`, `resource`, `card_purge`, `card_duplicate` | `dreamsign:exact`, `card:chosen_after_commitment` | `trigger:battle`, `duration:battle_count` | partial: paired return narrower | return fixture |
| The Unspent Hand | single timed status | `battle_window_modifier`, `status` | none | `duration:battle_count` | no | timed/status partial |
| Prismatic Debt | permanent status tradeoff | `card_transfigure`, `card_duplicate`, `status` | `card:predicate` | `duration:journey_count` | no | status/card separate |
| Moon Market | omen shop row | `dreamsign_purchase`, `resource_cost:omens` | `dreamsign:exact` | `immediate` | no | dreamsign named shop partial |
| Three Masks | direct draft trio | `card_draft` | `card:predicate` | `immediate` | partial: individual draft rows only | none |
| One Card, Three Fates | named card operation trio | `card_purge`, `card_duplicate`, `card_transfigure` | `card:exact` | `immediate` | no | card fixture partial |
| Trial Of Windows | battle window menu | `battle_window_modifier` | none | `duration:battle_count` | no | timed fixture partial |
| Atlas Locksmith | route edit trio | `route_edit:replace_site`, `route_edit:add_site` | `route_site:exact` | `route:current_dreamscape` | partial: two route options and missing Essence site | route fixture |
| Waking Cache | delayed Bane burden trio | `card_gain`, `delayed_hook`, `bane_delayed` | `card:exact`, `bane:exact` | `trigger:battle` | no | hook/bane/card separate |
