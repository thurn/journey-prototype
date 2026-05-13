# `timed_window_menu` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `timed_window_menu`
- Stages: early, mid, late
- Seeds: `audit:timed_window_menu:<stage>:01` through `audit:timed_window_menu:<stage>:10`
- Command template: `npm run journey -- --seed audit:timed_window_menu:<stage>:NN --stage <stage> --shape timed_window_menu --debug --show-deck --no-color`

## Findings

### Window Text Repeats Inside The Same Option

Severity: high

Seed: `audit:timed_window_menu:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:early:01 --stage early --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 battles, event cards cost 2 less for the next 3 battles.
2. * For the next 3 battles, gain a random Dreamsign for the next 3 battles.
3. * For the next 3 battles, your opening hand contains 'Runebound Champion' for the next 3 battles.

Seed: `audit:timed_window_menu:early:04`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:early:04 --stage early --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. For the next 2 dreamscapes, 30% higher chance to see Dreamsign Offering sites in the next 2 dreamscapes you visit.
2. For the next 2 dreamscapes, add a Dreamsign Draft site to one upcoming dreamscape if possible.
3. For the next 2 dreamscapes, replace an Essence site in one upcoming dreamscape with a Purge site.

Seed: `audit:timed_window_menu:late:04`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:late:04 --stage late --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 4 battles, cards with a 'materialized' ability cost 2 less for the next 4 battles.
2. * For the next 4 battles, gain a random Dreamsign for the next 4 battles. During that window, battle essence rewards are reduced by 10% for the next 4 battles.
3. * For the next 4 battles, gain a temporary copy of 'Toll of Passage' for the next 4 battles.

Issue:
The shape's central contract is a shared temporary window, but the rendered options often say the same duration twice. Rows such as `For the next 3 battles, ... for the next 3 battles` read like two separate timers instead of one windowed benefit. The burden clause in the late example repeats the timer a third time, making the penalty harder to connect to the chosen row.

Recommendation:
Render the shared window once as the menu frame, then render each row as the effect within that frame. For example: `For the next 3 battles, choose one:` followed by `Event cards cost 2 less`, `Gain a temporary random Dreamsign`, and `Your opening hand contains 'Runebound Champion'`.

### Net-Value Outliers Create Solved Choices

Severity: medium

Seed: `audit:timed_window_menu:mid:06`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:mid:06 --stage mid --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. For the next 2 dreamscapes, 40% higher chance to see Dreamsign Draft sites in the next 2 dreamscapes you visit. Debug net: +156.25.
2. For the next 2 dreamscapes, replace a Dream Journey site in one upcoming dreamscape with a Dreamsign Draft site. Debug net: +35.
3. For the next 2 dreamscapes, add a Shop site to one upcoming dreamscape if possible. Debug net: +75.

Seed: `audit:timed_window_menu:late:07`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:late:07 --stage late --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 4 battles, cards with a 'discard' ability cost 2 less for the next 4 battles. Debug net: +115.19999999999999.
2. * For the next 4 battles, your opening hand contains 'Stolen Genesis' for the next 4 battles. During that window, battle essence rewards are reduced by 10% for the next 4 battles. Debug net: +28.
3. * For the next 4 battles, gain a temporary copy of 'Feeding the Flames' for the next 4 battles. Debug net: +40.

Seed: `audit:timed_window_menu:mid:03`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:mid:03 --stage mid --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. For the next 3 dreamscapes, replace a Duplication site in one upcoming dreamscape with a Dreamsign Draft site. Debug net: +35.
2. For the next 3 dreamscapes, add a Shop site to one upcoming dreamscape if possible. Debug net: +75.
3. For the next 3 dreamscapes, 30% higher chance to see Duplication sites in the next 3 dreamscapes you visit. Debug net: +125.

Issue:
Several menus contain one row worth two to five times the other choices by debug valuation. Because every sampled row has zero cost, zero uncertainty, and usually zero burden, the dominant row is not balanced by a visible drawback. A player can often choose the largest timed boost rather than evaluate different tactical needs.

Recommendation:
Keep same-menu timed-window rows in a narrower net-value band, or add visible constraints to premium rows. Route-probability boosts, multi-battle card discounts, and burdened opening-hand guarantees should be priced against each other after the shared window multiplier is applied.

### Route Windows Have Weak Target And Scope Clarity

Severity: medium

Seed: `audit:timed_window_menu:early:07`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:early:07 --stage early --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. For the next 2 dreamscapes, add a Specialty Shop site to one upcoming dreamscape if possible.
2. For the next 2 dreamscapes, add a Transfiguration site to one route if possible.
3. For the next 2 dreamscapes, 50% higher chance to see Dreamsign Offering sites in the next 2 dreamscapes you visit.

Seed: `audit:timed_window_menu:late:03`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:late:03 --stage late --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. For the next 3 dreamscapes, add a Shop site to one upcoming dreamscape if possible.
2. For the next 3 dreamscapes, replace a Duplication site in one upcoming dreamscape with a Transfiguration site.
3. For the next 3 dreamscapes, 50% higher chance to see Essence sites in the next 3 dreamscapes you visit.

Seed: `audit:timed_window_menu:mid:08`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:mid:08 --stage mid --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. For the next 2 dreamscapes, add a Dreamsign Draft site to one route if possible.
2. For the next 2 dreamscapes, 30% higher chance to see Essence sites in the next 2 dreamscapes you visit.
3. For the next 2 dreamscapes, add a Dreamsign Offering site to one upcoming dreamscape if possible.

Issue:
Route effects mix `one route`, `one upcoming dreamscape`, and probability increases inside the same timed window without showing the available route slots or site pool. The `if possible` clause makes some options read conditional, but the player-facing text gives no way to judge the chance that the option does work. Replacement rows also require knowing whether the named source site exists in the next dreamscapes.

Recommendation:
Expose the target scope for route-window effects in player terms. Rows should state whether they modify the next generated route, one route chosen by the player, or the first eligible upcoming dreamscape. Conditional rows should show the condition that makes them apply.

### Repeated Families Limit Replayability

Severity: medium

Seed: `audit:timed_window_menu:early:03`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:early:03 --stage early --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 shops, your next 3 shop purchases cost 1 fewer omen.
2. * For the next 3 shops, shop essence costs are reduced by 40%.
3. * For the next 3 shops, your next 3 shop rerolls are free.

Seed: `audit:timed_window_menu:early:05`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:early:05 --stage early --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 shops, your next 3 shop rerolls are free.
2. * For the next 3 shops, your next 3 shop purchases cost 1 fewer omen.
3. * For the next 3 shops, shop essence costs are reduced by 40%.

Seed: `audit:timed_window_menu:late:01`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:late:01 --stage late --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 shops, your next 3 shop rerolls are free.
2. * For the next 3 shops, shop essence costs are reduced by 40%.
3. * For the next 3 shops, your next 3 shop purchases cost 1 fewer omen.

Seed: `audit:timed_window_menu:late:05`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:late:05 --stage late --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 shops, your next 3 shop rerolls are free.
2. * For the next 3 shops, shop essence costs are reduced by 40%.
3. * For the next 3 shops, your next 3 shop purchases cost 1 fewer omen.

Issue:
The shop-window family repeats the same three choices across early and late samples, often only changing row order. Battle-window samples also repeatedly combine a temporary Dreamsign, a dreamwell insertion, and a starting-card override. The shape currently feels like a small set of fixed menus instead of a reusable timed-window generator.

Recommendation:
Add more shape-owned timed-window families and more row-level variation inside each family. Stage should influence both the menu family and the available row mix, so early, mid, and late runs create different decisions instead of the same row trio with different seeds.

### Dreamsign Duration Wording Is Inconsistent

Severity: low

Seed: `audit:timed_window_menu:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:early:01 --stage early --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 battles, event cards cost 2 less for the next 3 battles.
2. * For the next 3 battles, gain a random Dreamsign for the next 3 battles.
3. * For the next 3 battles, your opening hand contains 'Runebound Champion' for the next 3 battles.

Seed: `audit:timed_window_menu:mid:01`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:mid:01 --stage mid --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 battles, gain a random Dreamsign as a temporary Dreamsign.
2. * For the next 3 battles, shuffle 3 copies of 'Insight' into your dreamwell.
3. * For the next 3 battles, your starting dreamwell card is 'Insight'.

Seed: `audit:timed_window_menu:late:10`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:timed_window_menu:late:10 --stage late --shape timed_window_menu --debug --show-deck --no-color`

Generated options:

1. * For the next 3 battles, cards with a 'judgment' ability cost 1 less for the next 3 battles.
2. * For the next 3 battles, your opening hand contains 'Veinwalker' for the next 3 battles. During that window, battle essence rewards are reduced by 10% for the next 3 battles.
3. * For the next 3 battles, gain a random Dreamsign for the next 3 battles.

Issue:
Some rows say `gain a random Dreamsign for the next N battles`, while others say `gain a random Dreamsign as a temporary Dreamsign`. Both appear to describe a temporary Dreamsign, but they use different terms and one repeats the duration. This creates avoidable uncertainty about whether the Dreamsign is permanent, temporary, or tied to the menu window.

Recommendation:
Use one player-facing phrase for timed Dreamsign grants, such as `Gain a temporary random Dreamsign`, under the shared window heading.

## Passing Observations

- All 30 generated samples completed successfully.
- Every sampled offer produced exactly three visible options.
- Every sampled option shared a timing frame with the rest of its menu.
- Stage, essence, omens, deck, and active Dreamsign context rendered for every sample.
- Route, shop, and battle windows all appeared in the sampled output, giving the shape multiple strategic domains.

## Verification

Sanity command:

`npm run journey -- --seed audit:timed_window_menu:early:01 --stage early --shape timed_window_menu --debug --show-deck --no-color`
