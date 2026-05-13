# `service_menu` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `service_menu`
- Stages: early, mid, late
- Seeds: `audit:service_menu:<stage>:01` through `audit:service_menu:<stage>:10`
- Command template: `npm run journey -- --seed audit:service_menu:<stage>:NN --stage <stage> --shape service_menu --debug --show-deck --no-color`

## Findings

### Generic Cost/Reward Bundles Weaken The Service Menu Identity

Severity: high

Seed: `audit:service_menu:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:service_menu:early:01 --stage early --shape service_menu --debug --show-deck --no-color`

Generated options:

1. Cost: Remove all dreamsign sites from the next 1 dreamscape you visit. Reward: Choose 1 of 2 dreamsigns to gain
2. Cost: Gain 3 'Doubt'. Reward: Draft 1 of 4 Fast cards and gain 3 copies of it
3. Cost: Lose 1 omen. Reward: Gain 145 essence

Seed: `audit:service_menu:mid:09`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:service_menu:mid:09 --stage mid --shape service_menu --debug --show-deck --no-color`

Generated options:

1. Cost: Remove the transfigurations from 2 random cards with a 'dissolve' ability. Reward: Cards with a transfiguration cost 2 less for the next 3 battles. Increase your maximum essence by 50
2. Cost: Gain 1 'Paranoia' for the next 2 battles. Reward: Choose 1 of 3 dreamsigns to gain
3. Cost: Gain 1 'Silence'. Reward: Apply a random transfiguration to each starter card

Seed: `audit:service_menu:late:10`
Stage: `late`
Replay:
`npm run journey -- --seed audit:service_menu:late:10 --stage late --shape service_menu --debug --show-deck --no-color`

Generated options:

1. Cost: Gain 2 random banes. Reward: Gain 3 random Survivors
2. Cost: Purge a chosen Dreamsign. Reward: Draft 1 of 4 Warriors and gain 2 copies of it
3. Cost: Lose 1 omen. Reward: Gain a copy of one of your dreamsigns chosen at random

Issue:
The desired service menu should feel like one vendor, workshop, shrine, or other unified offering. The sampled rows read as unrelated barter bundles assembled from broad cost and reward pools. The debug output reported `Selected payload family: adapter` for every sampled run, and every rendered row used the same `Cost: ... Reward: ...` frame, so the scene identity comes from the generic payload adapter rather than a coherent service family.

Recommendation:
Give `service_menu` shape-owned service families with a visible theme and domain for each offer, such as a Dreamsign counter, starter surgery shrine, transfiguration workshop, route broker, or Bane cleanser. Each family should render rows as discrete services from the same scene and should constrain both the price and the payload to actions that belong together.

### Some Costs Read As Player-Favorable Services

Severity: medium

Seed: `audit:service_menu:early:02`
Stage: `early`
Replay:
`npm run journey -- --seed audit:service_menu:early:02 --stage early --shape service_menu --debug --show-deck --no-color`

Generated options:

1. Cost: Transform 'Charnel Seraph' into a random card from the pool. Reward: Take any number of cards with a 'materialized' ability from 5 choices
2. Cost: Purge a chosen Dreamsign. Reward: Purge all starter cards
3. Cost: Purge a chosen card with an energy-generation ability. Reward: Gain a copy of 'Rune Stone'

Seed: `audit:service_menu:mid:03`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:service_menu:mid:03 --stage mid --shape service_menu --debug --show-deck --no-color`

Generated options:

1. Cost: Lose 55 essence. Reward: Apply a random transfiguration to each starter card
2. Cost: Lose 1 omen. Reward: Take any number of cards with a 'discard' ability from 5 choices
3. Cost: Transform a chosen dreamsign into a random dreamsign. Reward: Gain a copy of one of your dreamsigns chosen at random

Seed: `audit:service_menu:late:01`
Stage: `late`
Replay:
`npm run journey -- --seed audit:service_menu:late:01 --stage late --shape service_menu --debug --show-deck --no-color`

Generated options:

1. Cost: Gain 1 'Envy' for the next 3 battles. Reward: Gain a copy of one of your dreamsigns chosen at random
2. Cost: Draw 2 cards from your deck and purge one of them of your choice. Reward: Draft 1 of 4 cards with a 'reclaim' ability and gain 3 copies of it
3. Cost: Lose 1 omen. Reward: Gain a copy of one of your dreamsigns of your choice

Issue:
Costs should read as costs. Several sampled costs are deck or Dreamsign operations that a player may value as services: transforming a named card into a random card, transforming a chosen Dreamsign into a random Dreamsign, and drawing two cards to purge one of the player's choice. These rows create a second positive service on the cost side, making the real choice stronger and less legible than the converted essence accounting suggests.

Recommendation:
Use unambiguous payments for service-menu costs, such as essence, omens, Banes, temporary battle burdens, delayed penalties, or clearly harmful route restrictions. When card or Dreamsign surgery is intended as part of the offer, render it as the service payload and pair it with a separate visible price.

### Route Reward Uses The Wrong Article

Severity: low

Seed: `audit:service_menu:late:07`
Stage: `late`
Replay:
`npm run journey -- --seed audit:service_menu:late:07 --stage late --shape service_menu --debug --show-deck --no-color`

Generated options:

1. Cost: Gain 2 'Despair'. Reward: Choose 1 of 3 dreamsigns to gain
2. Cost: Lose 70 essence. Reward: Apply random transfigurations to 2 random cards. Add a Essence site to this dreamscape
3. Cost: Lose 1 omen. Reward: Take any number of cards with a 'reclaim' ability from 5 choices

Issue:
The second row renders `Add a Essence site to this dreamscape`. The article should agree with the site name in player-facing text.

Recommendation:
Update the route-site renderer to emit `an Essence site` for vowel-leading site names, or render the site name without an article.

## Passing Observations

- All 30 generated samples completed successfully.
- Every sampled offer produced exactly three visible service rows.
- Every row had a visible cost and reward, with positive debug net value.
- The forced-shape debug scoring line clearly identified `service_menu` as the selected forced shape and included the pre-force top scorer separately.
- Temporary negative effects included visible battle durations where applicable.
- Card, Dreamsign, Bane, essence, omen, dreamwell, and stage vocabulary was capitalized consistently in the sampled output except for the article issue above.

## Verification

Sanity command:

`npm run journey -- --seed audit:service_menu:early:01 --stage early --shape service_menu --debug --show-deck --no-color`
