# `probability_ladder` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `probability_ladder`
- Stages: early, mid, late
- Seeds: `audit:probability_ladder:<stage>:01` through `audit:probability_ladder:<stage>:10`
- Command template: `npm run journey -- --seed audit:probability_ladder:<stage>:NN --stage <stage> --shape probability_ladder --debug --show-deck --no-color`

## Findings

### Stop Dominates Many Attempts

Severity: high

Seeds:

- `audit:probability_ladder:early:06`
- `audit:probability_ladder:mid:09`
- `audit:probability_ladder:late:06`

Replay:
`npm run journey -- --seed audit:probability_ladder:early:06 --stage early --shape probability_ladder --debug --show-deck --no-color`

Generated options:

1. Level 1: Pay 25 essence for a 30% chance to draft 1 of 4 events.
2. Level 2: Pay 60 essence for a 45% chance to draft 1 of 4 events.
3. Level 3: Pay 110 essence for a 60% chance to draft 1 of 4 events.

Issue:
The Stop branch has zero cost and is often stronger than attempting the visible wager. Across the 30 sampled journeys, 21 journeys contain at least one attempt with negative expected value against Stop, and 7 journeys have negative expected value at every level. For `early:06`, each level pays an escalating essence cost for the same low-value event draft reward, making every attempt a poor choice.

Recommendation:
Set each level's attempt cost against the reward value and displayed odds so every visible attempt is competitive with Stop. Low-value reward families should receive stage-appropriate bonuses or lower attempt costs before entering this shape.

### Reward Value Does Not Escalate With Level

Severity: medium

Seed: `audit:probability_ladder:mid:01`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:probability_ladder:mid:01 --stage mid --shape probability_ladder --debug --show-deck --no-color`

Generated options:

1. Level 1: Pay 25 essence for a 25% chance to gain 90 essence.
2. Level 2: Pay 55 essence for a 45% chance to gain 90 essence.
3. Level 3: Pay 85 essence for a 65% chance to gain 90 essence.
4. Level 4: Pay 120 essence for an 85% chance to gain 90 essence.

Issue:
Each later level asks for more essence and gives better odds, but the success reward stays fixed. This makes the ladder feel like repeated access to the same prize rather than an escalating probability ladder. In the cited example, the final level asks the player to pay 120 essence for a chance to gain 90 essence, so the highest-odds moment has the weakest practical appeal.

Recommendation:
Scale either the reward or an attached bonus by level. The final level should have the clearest payoff premium, especially when the player reaches it through prior failed attempts.

### Late Journeys Use Early-Scale Rewards

Severity: medium

Seeds:

- `audit:probability_ladder:late:04`
- `audit:probability_ladder:late:08`
- `audit:probability_ladder:late:01`

Replay:
`npm run journey -- --seed audit:probability_ladder:late:04 --stage late --shape probability_ladder --debug --show-deck --no-color`

Generated options:

1. Level 1: Pay 25 essence for a 35% chance to draft 1 of 4 events.
2. Level 2: Pay 55 essence for a 55% chance to draft 1 of 4 events.
3. Level 3: Pay 100 essence for a 75% chance to draft 1 of 4 events.

Issue:
Late-stage samples frequently offer rewards that read like early-stage rewards. `late:04` and `late:08` offer only an event draft, and `late:01` offers 2 omens. These rewards can be mechanically legal, but they do not create a strong late-stage reason to spend escalating essence on a chance branch.

Recommendation:
Use stage-specific reward bands for this shape. Late ladders should use premium reward profiles, compound rewards, or larger resource payouts when the structure asks the player to risk repeated essence payments.

## Passing Observations

- All 30 sampled journeys generated valid decision-tree manifests.
- The shape consistently shows Stop, Attempt, Success, and Failure branches at each level.
- Random odds are visible in player-facing text and in the precommitted random envelope.
- Success branches terminate the Journey cleanly and failure branches advance or end as expected.
- No sampled output exposed placeholder IDs, malformed object names, or `undefined`.

## Verification

Sanity replay:
`npm run journey -- --seed audit:probability_ladder:early:01 --stage early --shape probability_ladder --debug --show-deck --no-color`

The replay command succeeds and matches the command format used for the audited examples.
