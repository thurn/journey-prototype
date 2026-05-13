# `single_random_outcome` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `single_random_outcome`
- Stages: early, mid, late
- Audit seeds: `audit:single_random_outcome:<stage>:01` through `audit:single_random_outcome:<stage>:10`
- Command template: `npm run journey -- --seed audit:single_random_outcome:<stage>:NN --stage <stage> --shape single_random_outcome --debug --show-deck --no-color`

## Findings

### Player-Facing Text Exposes Random Metadata Labels

Severity: medium

Seed: `audit:single_random_outcome:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_random_outcome:early:01 --stage early --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Lose 60 essence. Spin the visible wheel; committed outcome: transform 'Ringwatcher' into 'Skyborne Jellyfish'.`
2. `Roll twice and keep one (38, 64; kept 64). Gain 60-120 random essence.`

Seed: `audit:single_random_outcome:early:02`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_random_outcome:early:02 --stage early --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Reveal 3 rewards (your next 2 shop rerolls are free; gain essence up to your maximum; replace a chosen starter card with 1 of 4 drafted cards). Choose one revealed reward.`
2. `Reveal 4 rewards. Choose one random revealed reward (precommitted: replace a chosen starter card with 1 of 4 drafted cards) or gain one random reward from the visible pool.`

Seed: `audit:single_random_outcome:late:10`
Stage: `late`
Replay:
`npm run journey -- --seed audit:single_random_outcome:late:10 --stage late --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Reveal 5 rewards (10% higher chance to see Dreamsign Offering sites in the next 3 dreamscapes you visit; draw 4 cards from your deck and duplicate one of them of your choice; your next 3 shop rerolls are free; add a Duplication site to this dreamscape; gain a copy of one of your Dreamsigns chosen at random). Choose one revealed reward.`
2. `Reveal 6 rewards. Choose one random revealed reward (precommitted: gain a copy of one of your Dreamsigns chosen at random) or gain one random reward from the visible pool.`

Issue:

The root option copy uses engine-oriented labels such as `committed outcome` and
`precommitted`. Those terms describe manifest state instead of an in-game
choice. The player needs to know what is visible before choosing, what is
random, and what reward will resolve, without seeing storage or validation
vocabulary.

Recommendation:

Render visible fixed outcomes as player-facing facts, such as "The wheel shows:
..." or "The revealed random reward is: ...". Keep `precommitted` and
`committed outcome` in debug output and structured metadata.

### Reveal Choice Usually Makes The Random Row Inferior

Severity: high

Seed: `audit:single_random_outcome:early:02`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_random_outcome:early:02 --stage early --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Reveal 3 rewards (your next 2 shop rerolls are free; gain essence up to your maximum; replace a chosen starter card with 1 of 4 drafted cards). Choose one revealed reward.`
2. `Reveal 4 rewards. Choose one random revealed reward (precommitted: replace a chosen starter card with 1 of 4 drafted cards) or gain one random reward from the visible pool.`

Seed: `audit:single_random_outcome:mid:06`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:single_random_outcome:mid:06 --stage mid --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Reveal 4 rewards (gain 70 essence. Choose 1 of 3 Dreamsigns to gain; transform 'Meadowlight Charger' into 'Cloaked Sentinel'; apply Scarlet to 'Blightmaw'; replace a chosen starter card with 1 of 4 drafted cards). Choose one revealed reward.`
2. `Reveal 6 rewards. Choose one random revealed reward (precommitted: gain 70 essence. Choose 1 of 3 Dreamsigns to gain) or gain one random reward from the visible pool.`

Seed: `audit:single_random_outcome:late:06`
Stage: `late`
Replay:
`npm run journey -- --seed audit:single_random_outcome:late:06 --stage late --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Reveal 5 rewards (gain 1 omen; your next 3 shop purchases cost 1 fewer omen; gain a copy of one of your Dreamsigns of your choice; apply Prismatic to all Warriors; draft 1 of 4 cards with an energy-generation ability). Choose one revealed reward.`
2. `Reveal 5 rewards. Choose one random revealed reward (precommitted: apply Prismatic to all Warriors) or gain one random reward from the visible pool.`

Issue:

The reveal family gives option 1 a free player-selected reward from a revealed
set, while option 2 gives a random reward from the same visible pool. In the
sampled reveal offers, option 1 always has the stronger debug net value. The
gap is often large: early:02 is `+370` versus `+129`, mid:06 is about `+267`
versus `+67`, and late:06 is `+2510` versus `+577`. With equal costs and lower
uncertainty, option 1 reads as the clear pick instead of a strategic choice.

Recommendation:

Give the random reveal row a concrete advantage that can compete with player
selection: a larger reward count, an extra payout, a lower-cost bundle with a
cost on option 1, or a different random pool with enough expected value to
justify giving up selection.

### Wheel Offers Often Present A Free Positive Row Beside A Paid Weak Row

Severity: high

Seed: `audit:single_random_outcome:early:03`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_random_outcome:early:03 --stage early --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Lose 60 essence. Spin the visible wheel; committed outcome: modify 3 random cards to become Warriors.`
2. `Roll twice and keep one (79, 55; kept 79). Gain 80-120 random essence.`

Seed: `audit:single_random_outcome:mid:04`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:single_random_outcome:mid:04 --stage mid --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Lose 60 essence. Spin the visible wheel; committed outcome: cards with spark 1 or less cost 1 less for the next 3 battles.`
2. `Roll twice and keep one (27, 70; kept 70). Gain 80-140 random essence.`

Seed: `audit:single_random_outcome:late:05`
Stage: `late`
Replay:
`npm run journey -- --seed audit:single_random_outcome:late:05 --stage late --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Lose 60 essence. Spin the visible wheel; committed outcome: shop essence costs are permanently reduced by 10%.`
2. `Roll twice and keep one (27, 76; kept 76). Gain 80-140 random essence.`

Issue:

The wheel family frequently pairs a 60-essence paid visible-wheel row with a
free random-essence row. The paid row often has negative debug net value while
the free row is strongly positive: early:03 is `-21` versus `+90`, mid:04 is
`-24` versus `+100`, and late:05 is `-36` versus `+100`. These offers make the
paid wheel row look like a trap, especially when the paid row resolves to a
modest or context-dependent reward.

Recommendation:

Balance the wheel row after the entry price is applied. Either reduce or scale
the entry cost around the selected reward, give the paid wheel a second draw or
choice benefit, or require the free essence row to pay an equivalent risk or
cost when the visible wheel result is weak.

### Roll-Twice Text Shows Rolls That Do Not Explain The Reward

Severity: medium

Seed: `audit:single_random_outcome:early:04`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_random_outcome:early:04 --stage early --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Lose 60 essence. Spin the visible wheel; committed outcome: transform a random starter card into a random Warrior.`
2. `Roll twice and keep one (59, 59; kept 59). Gain 40-80 random essence.`

Seed: `audit:single_random_outcome:mid:04`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:single_random_outcome:mid:04 --stage mid --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Lose 60 essence. Spin the visible wheel; committed outcome: cards with spark 1 or less cost 1 less for the next 3 battles.`
2. `Roll twice and keep one (27, 70; kept 70). Gain 80-140 random essence.`

Seed: `audit:single_random_outcome:late:05`
Stage: `late`
Replay:
`npm run journey -- --seed audit:single_random_outcome:late:05 --stage late --shape single_random_outcome --debug --show-deck --no-color`

Generated options:

1. `Lose 60 essence. Spin the visible wheel; committed outcome: shop essence costs are permanently reduced by 10%.`
2. `Roll twice and keep one (27, 76; kept 76). Gain 80-140 random essence.`

Issue:

The option displays two d100-style rolls and a kept value, then separately
offers a random essence range. Debug metadata shows the committed essence amount
is rolled independently from the shown kept value: early:04 keeps `59` with a
committed amount of `71`, mid:04 keeps `70` with a committed amount of `88`, and
late:05 keeps `76` with a committed amount of `98`. The player-facing text
suggests the kept roll determines the reward, but the shown reward remains a
separate random range.

Recommendation:

Tie the kept roll directly to the displayed reward, or change the copy to show
the actual committed essence result. A concise row such as "Gain the better of
two essence rolls: 88 essence" would make the random contract clear.

## Passing Observations

- All 30 forced-shape replay commands completed successfully.
- Each sampled journey produced exactly two root options.
- Each sampled journey included structured random or reveal metadata in debug
  output.
- The visible-wheel family consistently included a visible reward pool, a
  selected wheel reward, a roll-twice envelope, a random essence range, and
  repeated pool draw metadata.
- The reveal-choice family consistently included a visible reward pool, reveal
  metadata for option 1, choose-one metadata for option 1, random-revealed
  metadata for option 2, and hidden random-pool metadata for option 2.

## Verification

`npm run journey -- --seed audit:single_random_outcome:early:01 --stage early --shape single_random_outcome --debug --show-deck --no-color`

The verification command completed successfully, and the replay commands in
this report match the command format used for generation.
