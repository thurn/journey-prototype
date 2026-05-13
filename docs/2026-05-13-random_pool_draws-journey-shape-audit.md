# `random_pool_draws` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `random_pool_draws`
- Stages: early, mid, late
- Seeds: `audit:random_pool_draws:<stage>:01` through `audit:random_pool_draws:<stage>:10`
- Command template: `npm run journey -- --seed audit:random_pool_draws:<stage>:NN --stage <stage> --shape random_pool_draws --debug --show-deck --no-color`

## Findings

### Draw Costs Make Stop A Weak Choice

Severity: high

Seed: `audit:random_pool_draws:early:07`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:early:07 --stage early --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: replace a Dream Journey site in this dreamscape with a Transfiguration site, transform a chosen card with spark 4 or more into 'Sunken Radiance', shop essence costs are permanently reduced by 50%, take any number of cards with a 'dissolve' ability from 5 choices, duplicate 1 random card with a 'reclaim' ability. Outcomes draw with replacement.
2. Draw: Pay 30 essence and gain one random reward from the visible pool with replacement. Go to Level 2.
3. Draw: Pay 30 essence and gain one random reward from the visible pool with replacement. Go to Level 3.
4. Draw: Pay 30 essence and gain one random reward from the visible pool with replacement. End the Journey.

Seed: `audit:random_pool_draws:mid:10`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:mid:10 --stage mid --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: modify 2 random cards to become Survivors, apply random transfigurations to 3 random starter cards, purge up to 3 chosen starter cards, take any number of Fast cards from 4 choices, set essence to 125% of your maximum essence, add Reclaim 2 to 'Miraculous Arrival'. Outcomes draw with replacement.
2. Draw: Pay 40 essence and gain one random reward from the visible pool with replacement. Go to Level 2.
3. Draw: Pay 40 essence and gain one random reward from the visible pool with replacement. Go to Level 3.
4. Draw: Pay 40 essence and gain one random reward from the visible pool with replacement. Go to Level 4.
5. Draw: Pay 40 essence and gain one random reward from the visible pool with replacement. End the Journey.

Seed: `audit:random_pool_draws:late:09`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:late:09 --stage late --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: duplicate 1 chosen card, gain 155 essence, increase your maximum essence by 125, draw 4 cards from your deck and duplicate one of them of your choice, add Reclaim 2 to 1 random card, transform a chosen Dreamsign into 'Theater Mask'. Outcomes draw without replacement.
2. Draw: Pay 30 essence and gain one random reward from the visible pool without replacement. Go to Level 2.
3. Draw: Pay 30 essence and gain one random reward from the visible pool without replacement. Go to Level 3.
4. Draw: Pay 30 essence and gain one random reward from the visible pool without replacement. End the Journey.

Issue:
The draw action often costs 25 to 40 essence while the visible pool contains permanent shop discounts, maximum essence increases, multiple duplicates, omens, or large essence grants. The stop branch reads like a concession instead of a meaningful branch, especially when the same low cost is offered across every level.

Recommendation:
Price each draw against the strongest reward in the current pool and the expected value of additional draws. Escalating costs, capped high-impact rewards, or a visible bust/burden outcome would make the repeated stop/draw tree produce an actual risk decision.

### Early Pools Include Late-Scale Rewards

Severity: high

Seed: `audit:random_pool_draws:early:07`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:early:07 --stage early --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: replace a Dream Journey site in this dreamscape with a Transfiguration site, transform a chosen card with spark 4 or more into 'Sunken Radiance', shop essence costs are permanently reduced by 50%, take any number of cards with a 'dissolve' ability from 5 choices, duplicate 1 random card with a 'reclaim' ability. Outcomes draw with replacement.
2. Draw: Pay 30 essence and gain one random reward from the visible pool with replacement.

Seed: `audit:random_pool_draws:early:10`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:early:10 --stage early --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: apply Magenta to 2 chosen cards with a 'judgment' ability, increase your maximum essence by 125, transform a chosen Dreamsign into 'Garlic Bulb', duplicate 2 chosen cards, replace a chosen starter card with 1 of 4 drafted cards. Outcomes draw without replacement.
2. Draw: Pay 30 essence and gain one random reward from the visible pool without replacement.

Seed: `audit:random_pool_draws:early:03`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:early:03 --stage early --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: draft 1 of 4 Spirit Animals and apply Viridian to it, duplicate 3 random cards with a 'reclaim' ability, apply Golden to 3 random cards with an 'abandon' ability, gain a copy of 'Poison Bottle', increase your maximum essence by 75. Outcomes draw with replacement.
2. Draw: Pay 50 essence and gain one random reward from the visible pool with replacement.

Issue:
Early samples can offer campaign-shaping rewards at the start of a run: permanent shop essence discounts, +125 maximum essence, two chosen duplicates, or three random Golden applications. The 120/500 essence early state makes these rewards feel like major progression breaks rather than early-stage gambles.

Recommendation:
Give `random_pool_draws` stage-owned reward bands. Early pools should favor starter cleanup, modest essence, small drafts, and single-card upgrades; late pools should carry permanent economy and multi-card duplication effects.

### Visible Pool Reads As A Run-On Sentence

Severity: medium

Seed: `audit:random_pool_draws:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:early:01 --stage early --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: your opening hand contains 'Keeper of Forgotten Light' for the next 3 battles, gain 'Voodoo Doll'. Apply random transfigurations to 2 chosen starter cards, draw 4 cards from your deck and duplicate one of them of your choice, add a Dreamsign Draft site to this dreamscape, apply random transfigurations to 2 random cards. Outcomes draw without replacement.
2. Draw: Pay 35 essence and gain one random reward from the visible pool without replacement.

Seed: `audit:random_pool_draws:mid:08`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:mid:08 --stage mid --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: your next 3 shop rerolls are free, apply Viridian to 'Final Witness'. Modify 2 random cards to become Spirit Animals, gain a random Dreamsign, add Reclaim 1 to 2 random cards, apply a transfiguration of your choice to a chosen card, add Reclaim 2 to 'Ghost Line'. Outcomes draw with replacement.
2. Draw: Pay 25 essence and gain one random reward from the visible pool with replacement.

Seed: `audit:random_pool_draws:late:05`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:late:05 --stage late --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: increase your maximum essence by 100, modify 2 random cards to become Spirit Animals, create 1 duplicate of 'Flickerveil Adept', replace a Dreamsign Draft site in this dreamscape with a Purge site. Gain 1 omen, gain 90-170 essence (random roll), add an Essence site to the next dreamscape you visit. Outcomes draw without replacement.
2. Draw: Pay 30 essence and gain one random reward from the visible pool without replacement.

Issue:
The player-facing pool is technically visible, but it is presented as one long sentence with commas and occasional sentence breaks. The replacement policy is clear, but individual outcomes are hard to count, compare, and remember across multiple levels.

Recommendation:
Render the pool as numbered outcomes under the Pool heading, followed by one separate replacement-policy line. Keep each outcome in one sentence so the player can scan the remaining pool after each draw.

### Some Outcomes Need Hidden Or Unshown State

Severity: medium

Seed: `audit:random_pool_draws:late:08`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:late:08 --stage late --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: your starting dreamwell card is 'Harmony', duplicate 1 chosen card, add Reclaim 3 to 'Autumn's Bounty', replace a Transfiguration site in this dreamscape with a Specialty Shop site, increase your maximum essence by 100, gain a copy of one of your Dreamsigns of your choice. Outcomes draw with replacement.
2. Draw: Pay 35 essence and gain one random reward from the visible pool with replacement.

Seed: `audit:random_pool_draws:late:10`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:late:10 --stage late --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: gain 1 omen, your next 3 shop rerolls are free, replace an Essence site in this dreamscape with a Duplication site, purge up to 3 chosen Characters, gain 75 essence, gain 1 random card with an event-copying ability. Outcomes draw without replacement.
2. Draw: Pay 25 essence and gain one random reward from the visible pool without replacement.

Seed: `audit:random_pool_draws:late:03`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:late:03 --stage late --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: gain a random Dreamsign, your opening hand contains 'Silent Observer' for the next 3 battles, add a Specialty Shop site to the next dreamscape you visit, purge all bane cards, draft 1 of 4 Characters, duplicate 3 random Event cards. Outcomes draw without replacement.
2. Draw: Pay 30 essence and gain one random reward from the visible pool without replacement.

Issue:
Several pool entries rely on conditions the offer view does not establish: a Transfiguration or Essence site in the current dreamscape, Bane cards in the deck, eligible Characters or Events, or a matching card subtype. When these outcomes are part of a random pool, the player cannot tell whether a draw will produce a full reward, a partial reward, or a dead result.

Recommendation:
Filter random-pool rewards against the shown deck and dreamscape state, or render the fallback rule in the outcome text. Site replacement rewards should name the eligible target if one exists; Bane and subtype rewards should appear only when the current deck has legal targets.

### Nested Random Rewards Blur The Payoff

Severity: medium

Seed: `audit:random_pool_draws:early:08`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:early:08 --stage early --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: transform up to 2 chosen Event cards into random Event cards. Gain 40-120 essence (random roll), apply random transfigurations to 3 random starter cards, gain 2 random Spirit Animals, gain 'Pyrestone Avatar', transform 'Marked Direwolf' into 'Simulacra'. Outcomes draw without replacement.
2. Draw: Pay 35 essence and gain one random reward from the visible pool without replacement.

Seed: `audit:random_pool_draws:mid:04`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:mid:04 --stage mid --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: apply random transfigurations to 3 random cards, transform 'Ebonwing' into 'Summons of the Bonded', gain 30-90 essence (random roll), your next 2 shop purchases cost 1 fewer omen, apply a random transfiguration to each starter card, gain 1 omen. Outcomes draw without replacement.
2. Draw: Pay 30 essence and gain one random reward from the visible pool without replacement.

Seed: `audit:random_pool_draws:late:07`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:late:07 --stage late --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Pool: Randomly gain one: gain 1 omen, choose 1 of 3 Dreamsigns to gain, purge up to 3 chosen cards with an 'abandon' ability, add a Dreamsign Draft site to this dreamscape, gain 50-140 essence (random roll), purge 2 bane cards. Outcomes draw with replacement.
2. Draw: Pay 40 essence and gain one random reward from the visible pool with replacement.

Issue:
The shape already asks the player to pay for an unknown reward. Several entries then add another random layer inside the reward: random essence ranges, random transfigurations, random card types, and random Dreamsigns. This makes the payoff difficult to evaluate even when the pool is visible.

Recommendation:
Prefer concrete outcomes inside `random_pool_draws`. When a nested random effect is important, show its exact range or category as the outcome's main risk and avoid combining several nested random operations in the same pool.

### Debug Pre-Roll Text Is Not Reproducible From The Output

Severity: low

Seed: `audit:random_pool_draws:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:early:01 --stage early --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Debug: Repeated pool draws: 3 draws from random-pool-draws; pre rolled: The draw sequence is committed in metadata for deterministic replay..
2. Pool: Randomly gain one: your opening hand contains 'Keeper of Forgotten Light' for the next 3 battles, gain 'Voodoo Doll'. Apply random transfigurations to 2 chosen starter cards, draw 4 cards from your deck and duplicate one of them of your choice, add a Dreamsign Draft site to this dreamscape, apply random transfigurations to 2 random cards. Outcomes draw without replacement.

Seed: `audit:random_pool_draws:mid:01`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:random_pool_draws:mid:01 --stage mid --shape random_pool_draws --debug --show-deck --no-color`

Generated options:

1. Debug: Repeated pool draws: 4 draws from random-pool-draws; pre rolled: The draw sequence is committed in metadata for deterministic replay..
2. Pool: Randomly gain one: gain 1 random card with an energy-generation ability, purge up to 2 chosen starter cards, replace a chosen starter card with 1 of 4 drafted cards, gain a copy of one of your Dreamsigns of your choice, draft 1 of 4 cards with a 'judgment' ability, apply random transfigurations to 2 random starter cards. Outcomes draw with replacement.

Issue:
Debug output states that a pre-rolled draw sequence exists, but the displayed debug text gives only a prose placeholder and a doubled period. For an audit workflow, the sequence cannot be inspected from the command output even though the report can replay the seed.

Recommendation:
Show the committed draw order in debug output, using pool indexes or short outcome labels. Keep the player-facing Journey hidden as appropriate, but make `--debug` expose the deterministic sequence it references.

## Passing Observations

- All 30 generated journeys succeeded with the requested forced shape, stage, seed pattern, `--debug`, and `--show-deck`.
- Every sample rendered a repeated stop/draw decision tree with three or four paid draw levels.
- The replacement policy always appeared in the player-facing Pool text and matched the repeated Draw text.
- The samples had good surface variety across card rewards, Dreamsign rewards, site effects, deck cleanup, essence, and temporary battle effects.
