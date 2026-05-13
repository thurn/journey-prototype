# `shop_row` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `shop_row`
- Stages: early, mid, late
- Seeds: `audit:shop_row:<stage>:01` through `audit:shop_row:<stage>:10`
- Command template: `npm run journey -- --seed audit:shop_row:<stage>:NN --stage <stage> --shape shop_row --debug --show-deck --no-color`

## Findings

### Late All-Target Upgrades Overwhelm The Shop Row

Severity: high

Seed: `audit:shop_row:late:02`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:shop_row:late:02 --stage late --shape shop_row --debug --show-deck --no-color`

Generated options:

1. Pay 50 essence. Take any number of cards with a 'reclaim' ability from 4 choices.
2. Pay 120 essence. Apply Golden to 2 chosen cards with an 'abandon' ability. Apply Golden to all cards with a 'materialized' ability.
3. Pay 65 essence. Duplicate 3 random cards with a 'materialized' ability.

Debug values:

1. Net: +74.80000000000001 converted essence.
2. Net: +4612 converted essence.
3. Net: +75.4 converted essence.

Seed: `audit:shop_row:late:10`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:shop_row:late:10 --stage late --shape shop_row --debug --show-deck --no-color`

Generated options:

1. Pay 120 essence. Apply Golden to all cards with a 'reclaim' ability.
2. Pay 35 essence. Increase your maximum essence by 125.
3. Pay 35 essence. Change 2 random cards to have fast.

Debug values:

1. Net: +1346.4 converted essence.
2. Net: +27.5 converted essence.
3. Net: +5 converted essence.

Issue:
The late shop can offer all-target Golden upgrades with converted value far above the other goods in the same row. The 120 essence price ceiling leaves option 2 in `late:02` more than 60 times stronger than the neighboring choices by debug value, and option 1 in `late:10` dominates the row by a similar margin. These rows make the decision obvious instead of commercial.

Recommendation:
Keep `shop_row` all-target upgrades inside the same net-value envelope as other late goods, or exclude all-predicate transfiguration rewards from this shape. If the reward remains legal, price it from the resolved target count with a cap that rejects offers whose net converted essence exceeds the row's comparison band.

### Same-Price Rows Can Contain A Dominated Transfiguration Choice

Severity: medium

Seed: `audit:shop_row:mid:01`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:shop_row:mid:01 --stage mid --shape shop_row --debug --show-deck --no-color`

Generated options:

1. Pay 25 essence. Increase your maximum essence by 75.
2. Pay 25 essence. Apply a transfiguration of your choice to a chosen card.
3. Pay 25 essence. Apply a random transfiguration to 1 chosen starter card.

Debug values:

1. Net: +12.5 converted essence.
2. Net: +35 converted essence.
3. Net: +11 converted essence.

Issue:
Option 3 has the same price as option 2 while offering less control, a narrower target class, and lower debug value. A player comparing these rows can treat option 3 as an inferior version of option 2.

Recommendation:
Add a same-row dominance check for equal-price rewards. When two offers use the same currency price, the narrower or lower-control option should receive a meaningfully lower price, a distinct tactical advantage, or be rerolled.

### Rendered Text Has Article And Singular Agreement Errors

Severity: low

Seed: `audit:shop_row:mid:02`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:shop_row:mid:02 --stage mid --shape shop_row --debug --show-deck --no-color`

Generated options:

1. Pay 25 essence. Replace a Transfiguration site in this dreamscape with a Essence site.
2. Pay 25 essence. Increase your maximum essence by 75.
3. Pay 25 essence. Shop essence costs are permanently reduced by 10%.

Seed: `audit:shop_row:early:10`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:shop_row:early:10 --stage early --shape shop_row --debug --show-deck --no-color`

Generated options:

1. Pay 15 essence. Modify 1 random cards to become Warriors.
2. Pay 35 essence. Apply Golden to 2 random cards with a 'reclaim' ability.
3. Pay 20 essence. Apply Magenta to 'Wasteland Arbitrator'.

Issue:
The row can render "a Essence site" and "1 random cards". These are visible player-facing grammar defects in otherwise understandable shop offers.

Recommendation:
Use article selection for site names and singular/plural rendering for random-card modification rewards. The `shop_row` audit path should reject generated option text with these simple agreement defects.

### Debug Metadata Should Expose The Shop Payload Family

Severity: medium

Seed: `audit:shop_row:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:shop_row:early:01 --stage early --shape shop_row --debug --show-deck --no-color`

Generated options:

1. Pay 30 essence. Create 2 duplicates of 'Marked Direwolf'.
2. Pay 20 essence. Replace a Duplication site in this dreamscape with a Dreamsign Offering site.
3. Pay 25 essence. Apply Viridian to 1 chosen card with spark 4 or more.

Debug metadata:

- Selected payload family: `adapter`
- Payload families: `none`
- Selector families: `none`
- Timing families: `none`

Seed: `audit:shop_row:late:08`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:shop_row:late:08 --stage late --shape shop_row --debug --show-deck --no-color`

Generated options:

1. Pay 35 essence. 10% higher chance to see Shop sites in future dreamscapes.
2. Pay 35 essence. Modify 2 random cards to become Spirit Animals.
3. Pay 35 essence. Add Reclaim 2 to 'Forge-Twin'.

Debug metadata:

- Selected payload family: `adapter`
- Payload families: `none`
- Selector families: `none`
- Timing families: `none`

Issue:
The forced `shop_row` debug output identifies the selected payload family as `adapter`, then reports empty reachability families. A migrated shop row should expose the commercial payload being exercised, such as card service, site service, Dreamsign purchase, or generated-object purchase. Empty family metadata makes audit and replay output harder to validate because the row's typed contract is invisible.

Recommendation:
Populate reachability family metadata for `shop_row` offers and keep the visible row tied to that family. A card-service row, site-service row, and Dreamsign-purchase row can all be legal shop rows, but replay output should make the selected family explicit.

## Passing Observations

- All 30 forced generations succeeded and reached `Repair status: accepted_immediately`.
- Each generated journey presented exactly three purchasable options with visible essence prices.
- The shown deck and active Dreamsign context rendered with content names rather than raw object IDs.
- Early and mid samples usually stayed within plausible net-value ranges when the all-target upgrade rewards were absent.

## Verification

Sanity command:

`npm run journey -- --seed audit:shop_row:early:01 --stage early --shape shop_row --debug --show-deck --no-color`

The sanity command succeeded. The replay commands in this report use the same command format as the generated samples.
