# `single_wager` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `single_wager`
- Stages: early, mid, late
- Audit seeds: `audit:single_wager:<stage>:01` through `audit:single_wager:<stage>:10`
- Command template: `npm run journey -- --seed audit:single_wager:<stage>:NN --stage <stage> --shape single_wager --debug --show-deck --no-color`

## Findings

### Wager Sentence Frame Breaks Reward Grammar

Severity: medium

Seed: `audit:single_wager:early:03`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_wager:early:03 --stage early --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 50% chance to 10% higher chance to see Shop sites in the next 3 dreamscapes you visit; otherwise gain nothing.`
2. `Pay 50 essence. 60% chance to apply a transfiguration of your choice to a chosen card; otherwise gain nothing.`

Seed: `audit:single_wager:early:04`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_wager:early:04 --stage early --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 55% chance to cards with spark 1 or less cost 2 less for the next 3 battles; otherwise gain nothing.`
2. `Pay 50 essence. 65% chance to transform a chosen card with a 'dissolve' ability into a random card with a 'dissolve' ability; otherwise gain nothing.`

Seed: `audit:single_wager:mid:10`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:single_wager:mid:10 --stage mid --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 55% chance to your next 1 shop purchase costs 1 fewer omen; otherwise gain nothing.`
2. `Pay 50 essence. 70% chance to choose 1 of 3 dreamsigns to gain; otherwise gain nothing.`

Seed: `audit:single_wager:late:09`
Stage: `late`
Replay:
`npm run journey -- --seed audit:single_wager:late:09 --stage late --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 45% chance to shop essence costs are permanently reduced by 20%; otherwise gain nothing.`
2. `Pay 50 essence. 70% chance to take any number of Event cards from 3 choices; otherwise gain nothing.`

Issue:

The wager renderer forces every reward into the phrase "chance to ...". Rewards
that begin with a noun phrase, a percentage phrase, or a finite clause produce
awkward text. Dreamsign rewards also appear with lowercase "dreamsigns" in
player-facing text.

Recommendation:

Render wager outcomes with a frame that accepts both action phrases and state
phrases, such as "On success: ...; on failure: gain nothing." Keep project
vocabulary capitalization in the rendered reward text, including Dreamsign.

### Reward Pairing Creates Overwhelming Value Gaps

Severity: high

Seed: `audit:single_wager:mid:07`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:single_wager:mid:07 --stage mid --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 45% chance to change 'Final Witness' to become a Spirit Animal; otherwise gain nothing.`
2. `Pay 50 essence. 60% chance to apply Golden to all cards with an energy-generation ability; otherwise gain nothing.`

Seed: `audit:single_wager:late:08`
Stage: `late`
Replay:
`npm run journey -- --seed audit:single_wager:late:08 --stage late --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 55% chance to transform 'Light of Emergence' into 'Mourning Rite'; otherwise gain nothing.`
2. `Pay 50 essence. 60% chance to apply Prismatic to all cards with a 'materialized' ability; otherwise gain nothing.`

Seed: `audit:single_wager:early:08`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_wager:early:08 --stage early --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 50% chance to transform a chosen dreamsign into 'Spotted Mug'; otherwise gain nothing.`
2. `Pay 50 essence. 65% chance to gain essence up to your maximum; otherwise gain nothing.`

Issue:

The fixed wager structure raises the second stake by 20 essence and gives the
second option higher odds, while rewards are selected independently from a broad
pool. The mid:07 debug values are net `-31` for option 1 and `+1469` for option
2. The late:08 debug values are net `-20` for option 1 and `+2723` for option
2. The early:08 debug values are net `-18` for option 1 and `+181` for option
2. These spreads make the choice read as a reward lottery instead of a wager
decision.

Recommendation:

Pair the two wager rewards by expected value band after applying odds and stake.
Reserve broad all-target transfiguration rewards and full-refill resource
rewards for comparably strong opposing rows, or scale the stake and odds around
the rolled reward value.

### Entire Offers Can Be Negative Expected Value

Severity: medium

Seed: `audit:single_wager:early:02`
Stage: `early`
Replay:
`npm run journey -- --seed audit:single_wager:early:02 --stage early --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 55% chance to draft 1 of 4 cards with spark 1 or less and gain 3 copies of it; otherwise gain nothing.`
2. `Pay 50 essence. 65% chance to modify 2 random cards to become Spirit Animals; otherwise gain nothing.`

Seed: `audit:single_wager:mid:09`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:single_wager:mid:09 --stage mid --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 55% chance to change 'Curio Dealer' to become a Warrior; otherwise gain nothing.`
2. `Pay 50 essence. 65% chance to apply Azure to 'Flashpoint Detonation'; otherwise gain nothing.`

Seed: `audit:single_wager:late:04`
Stage: `late`
Replay:
`npm run journey -- --seed audit:single_wager:late:04 --stage late --shape single_wager --debug --show-deck --no-color`

Generated options:

1. `Pay 30 essence. 50% chance to change 'Overload Vagrant' to become a Warrior; otherwise gain nothing.`
2. `Pay 50 essence. 70% chance to apply Prismatic to 1 chosen Event card; otherwise gain nothing.`

Issue:

Several offers present two rows with negative debug net values. Early:02 is
`-28` and `-40`, mid:09 is `-29` and `-45`, and late:04 is `-30` and `-44`.
With two required wager choices and no visible skip row, both decisions ask the
player to pay essence for a poor expected outcome.

Recommendation:

Require forced `single_wager` offers to include at least one positive or
near-neutral expected-value row after stake, odds, and uncertainty are applied.
When the shape intentionally presents a bad bet, include a clearly priced safer
alternative or a skip-style row in the topology.

## Passing Observations

- All 30 forced-shape replay commands completed successfully.
- Each sampled journey produced exactly two root options.
- Each sampled option used an essence stake, visible odds, a visible success
  reward, and a visible failure of gaining nothing.
- Every sampled journey included precommitted random wager metadata in debug
  output, including odds, stake, success reward, failure outcome, roll, and
  committed result.
- Stake sizing stayed consistent in the sampled contexts: 30 essence for option
  1 and 50 essence for option 2.

## Verification

`npm run journey -- --seed audit:single_wager:early:01 --stage early --shape single_wager --debug --show-deck --no-color`

The verification command completed successfully, and the replay commands in
this report match the command format used for generation.
