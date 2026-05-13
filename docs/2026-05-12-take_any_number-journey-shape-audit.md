# `take_any_number` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `take_any_number`
- Stages: early, mid, late
- Seeds: `audit:take_any_number:<stage>:01` through `audit:take_any_number:<stage>:10`
- Command template: `npm run journey -- --seed audit:take_any_number:<stage>:NN --stage <stage> --shape take_any_number --debug --show-deck --no-color`

## Findings

### Cache Cap Matches The Visible Reward Count

Severity: high

Seed: `audit:take_any_number:early:10`
Stage: `early`
Replay:
`npm run journey -- --seed audit:take_any_number:early:10 --stage early --shape take_any_number --debug --show-deck --no-color`

Generated options:

1. Take up to 2 rewards from this cache. Cost: Lose 1 omen. Reward: Apply Golden to all Spirit Animals
2. Take up to 2 rewards from this cache. Cost: Gain 2 'Burden' for the next 2 battles. Reward: Set essence to 50% of your maximum essence
3. Leave the cache.

Seed: `audit:take_any_number:mid:06`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:take_any_number:mid:06 --stage mid --shape take_any_number --debug --show-deck --no-color`

Generated options:

1. Take up to 2 rewards from this cache. Cost: Lose 25% of your essence. Reward: Gain a copy of one of your dreamsigns chosen at random. Shop essence costs are permanently reduced by 50%
2. Take up to 2 rewards from this cache. Cost: Gain 1 'Oblivion' for the next 3 battles. Reward: Change 4 random cards to have fast
3. Leave the cache.

Issue:
The desired cache decision should ask the player to choose a bounded subset from more visible rewards than the cap allows. The generated menu always has two claim rows and a cap of two, so the player can claim every visible reward. In the sampled outputs, both visible claim rows also carry positive debug net value, so the menu often reads as a checklist of purchases rather than a take-any-number cache.

Recommendation:
Generate more claim rows than the cap, such as three to five visible reward rows with a cap of two, or lower the cap for the two-row variant. Keep the leave row as the way to decline costly rows, and tune claim rows so the cache creates a meaningful subset decision in addition to each row's individual cost.

### Nested Take-Any-Number Rewards Obscure The Player Action

Severity: medium

Seed: `audit:take_any_number:early:04`
Stage: `early`
Replay:
`npm run journey -- --seed audit:take_any_number:early:04 --stage early --shape take_any_number --debug --show-deck --no-color`

Generated options:

1. Take up to 2 rewards from this cache. Cost: Gain 2 'Despair' for the next 2 battles. Reward: Take any number of Event cards from 5 choices
2. Take up to 2 rewards from this cache. Cost: Lose 50% of your essence. Reward: Apply a random transfiguration to each starter card
3. Leave the cache.

Seed: `audit:take_any_number:late:08`
Stage: `late`
Replay:
`npm run journey -- --seed audit:take_any_number:late:08 --stage late --shape take_any_number --debug --show-deck --no-color`

Generated options:

1. Take up to 2 rewards from this cache. Cost: Gain 1 'Despair' for the next 1 battle. Reward: Take any number of cards with a 'materialized' ability from 4 choices
2. Take up to 2 rewards from this cache. Cost: Gain 1 random bane. Reward: Gain a copy of one of your dreamsigns of your choice
3. Leave the cache.

Issue:
The outer row asks the player to take up to two rewards from the cache, while the reward text asks the player to take any number from another set of choices. This stacks two separate open-pick instructions into one option and blurs which cap controls which reward.

Recommendation:
Exclude `take_any_from_predicate_choices` from `take_any_number` reward rolls, or add a shape-owned rendering path that turns these nested rewards into a concrete, capped draft reward with explicit inner choices. The top-level cache row should describe one claimable reward package.

### Early Rewards Can Reach Late-Scale Values

Severity: high

Seed: `audit:take_any_number:early:10`
Stage: `early`
Replay:
`npm run journey -- --seed audit:take_any_number:early:10 --stage early --shape take_any_number --debug --show-deck --no-color`

Generated options:

1. Take up to 2 rewards from this cache. Cost: Lose 1 omen. Reward: Apply Golden to all Spirit Animals
2. Take up to 2 rewards from this cache. Cost: Gain 2 'Burden' for the next 2 battles. Reward: Set essence to 50% of your maximum essence
3. Leave the cache.

Debug values:

- Option 1 cost: 40 converted essence
- Option 1 effect: +1512 converted essence
- Option 1 net: +1472 converted essence

Seed: `audit:take_any_number:early:05`
Stage: `early`
Replay:
`npm run journey -- --seed audit:take_any_number:early:05 --stage early --shape take_any_number --debug --show-deck --no-color`

Generated options:

1. Take up to 2 rewards from this cache. Cost: Gain 2 random banes. Reward: Gain 120-170 essence (random roll). Duplicate 3 chosen cards
2. Take up to 2 rewards from this cache. Cost: Purge 'Shadow Droplet'. Reward: Apply a transfiguration of your choice to a chosen card
3. Leave the cache.

Debug values:

- Option 1 cost: 60 converted essence
- Option 1 effect: +277 converted essence
- Option 1 net: +217 converted essence

Issue:
The early-stage cache can roll very broad or compound reward packages whose debug value dominates the rest of the offer. `Apply Golden to all Spirit Animals` reaches +1512 converted essence in an early deck, and a compound essence-plus-duplication package reaches +277 converted essence. These rewards make the row a stage-defining event rather than one cache item among several comparable choices.

Recommendation:
Add stage-aware maximum effect and net thresholds for `take_any_number`, with a stricter early ceiling. Reroll broad deck-wide modifiers, compound meta rewards, and high-copy duplication packages when their converted essence exceeds the stage ceiling or when their value is far above the other visible claim rows.

### Debug Shape Scoring Reports A Different Shape

Severity: low

Seed: `audit:take_any_number:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:take_any_number:early:01 --stage early --shape take_any_number --debug --show-deck --no-color`

Generated options:

1. Take up to 2 rewards from this cache. Cost: Gain 2 'Envy' for the next 1 battle. Reward: Gain a copy of 'Amber Eye'
2. Take up to 2 rewards from this cache. Cost: Remove the transfiguration from 1 random card with a 'reclaim' ability. Reward: Shop essence costs are permanently reduced by 40%
3. Leave the cache.

Issue:
The debug header says `Selected shape: take_any_number`, while the scoring line says `Shape scoring: random_rewards 20.79644`. Every sampled forced-shape run reported `random_rewards` on the scoring line, which makes audit logs harder to read and can mislead reviewers who compare the selected shape against the scoring metadata.

Recommendation:
When `--shape take_any_number` forces the shape, show the selected shape's score contribution or label the scoring line as the pre-force scorer result. The debug output should make the relationship between forced shape selection and scorer metadata explicit.

## Passing Observations

- All 30 generated samples completed successfully.
- The shape consistently produced a repeatable menu with two claim rows and one leave row.
- Each claim row displayed a visible cost and reward.
- Displayed card, Dreamsign, site, Bane, essence, omen, and dreamwell vocabulary was coherent in the sampled normal output.
- Temporary negative effects included visible battle durations where applicable.

## Verification

Sanity command:

`npm run journey -- --seed audit:take_any_number:early:01 --stage early --shape take_any_number --debug --show-deck --no-color`
