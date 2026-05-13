# `prize_ladder` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `prize_ladder`
- Stages: early, mid, late
- Seeds: `audit:prize_ladder:<stage>:01` through `audit:prize_ladder:<stage>:10`
- Command template: `npm run journey -- --seed audit:prize_ladder:<stage>:NN --stage <stage> --shape prize_ladder --debug --show-deck --no-color`

## Findings

### Early Claim Paths Exceed Available Essence

Severity: high

Seeds: `audit:prize_ladder:early:01`, `audit:prize_ladder:early:02`, `audit:prize_ladder:early:08`

Stages: early

Replay:

`npm run journey -- --seed audit:prize_ladder:early:01 --stage early --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:early:02 --stage early --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:early:08 --stage early --shape prize_ladder --debug --show-deck --no-color`

Generated options:

`audit:prize_ladder:early:01`

1. Level 1 Stop: Gain 55 essence. End the Journey.
2. Level 1 Continue: Pay 30 essence. Go to Level 2.
3. Level 2 Stop: Gain 90 essence. End the Journey.
4. Level 2 Continue: Pay 70 essence. Go to Level 3.
5. Level 3 Stop: Gain 125 essence. End the Journey.
6. Level 3 Claim: Pay 120 essence and gain 205 essence. End the Journey.

`audit:prize_ladder:early:02`

1. Level 1 Stop: Draft 1 of 4 events. End the Journey.
2. Level 1 Continue: Pay 30 essence. Go to Level 2.
3. Level 2 Stop: Draft 1 of 4 events. Gain 1 omen. End the Journey.
4. Level 2 Continue: Pay 60 essence. Go to Level 3.
5. Level 3 Stop: Draft 1 of 4 events. Gain 2 omens. End the Journey.
6. Level 3 Claim: Pay 120 essence and draft 1 of 4 events. Gain 3 omens. End the Journey.

`audit:prize_ladder:early:08`

1. Level 1 Stop: Gain 1 omen. End the Journey.
2. Level 1 Continue: Pay 25 essence. Go to Level 2.
3. Level 2 Stop: Gain 2 omens. End the Journey.
4. Level 2 Continue: Pay 55 essence. Go to Level 3.
5. Level 3 Stop: Gain 3 omens. End the Journey.
6. Level 3 Claim: Pay 105 essence and gain 4 omens. End the Journey.

Issue:

Early journeys start at 120 essence. The full claim path costs 185 to 220 essence across the cited examples before the final reward resolves. The shape should offer a visible ladder whose deepest claim branch is reachable with the resources shown at journey start, or should display an explicit way to fund the later payment before the claim decision.

Recommendation:

For early `prize_ladder`, cap the cumulative continue-plus-claim cost below the starting essence budget with enough remaining margin for player confidence. A simple target is a full-path cost of 80 to 110 essence for early journeys, with larger reward jumps reserved for mid and late.

### Essence Claim Is Worse Than Same-Level Stop

Severity: high

Seeds: `audit:prize_ladder:early:05`, `audit:prize_ladder:mid:06`, `audit:prize_ladder:mid:08`

Stages: early, mid

Replay:

`npm run journey -- --seed audit:prize_ladder:early:05 --stage early --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:mid:06 --stage mid --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:mid:08 --stage mid --shape prize_ladder --debug --show-deck --no-color`

Generated options:

`audit:prize_ladder:early:05`

1. Level 1 Stop: Gain 55 essence. End the Journey.
2. Level 1 Continue: Pay 35 essence. Go to Level 2.
3. Level 2 Stop: Gain 110 essence. End the Journey.
4. Level 2 Continue: Pay 85 essence. Go to Level 3.
5. Level 3 Stop: Gain 165 essence. End the Journey.
6. Level 3 Claim: Pay 120 essence and gain 265 essence. End the Journey.

`audit:prize_ladder:mid:06`

1. Level 1 Stop: Gain 55 essence. End the Journey.
2. Level 1 Continue: Pay 35 essence. Go to Level 2.
3. Level 2 Stop: Gain 90 essence. End the Journey.
4. Level 2 Continue: Pay 65 essence. Go to Level 3.
5. Level 3 Stop: Gain 125 essence. End the Journey.
6. Level 3 Claim: Pay 125 essence and gain 175 essence. End the Journey.

`audit:prize_ladder:mid:08`

1. Level 1 Stop: Gain 45 essence. End the Journey.
2. Level 1 Continue: Pay 30 essence. Go to Level 2.
3. Level 2 Stop: Gain 90 essence. End the Journey.
4. Level 2 Continue: Pay 80 essence. Go to Level 3.
5. Level 3 Stop: Gain 135 essence. End the Journey.
6. Level 3 Claim: Pay 150 essence and gain 210 essence. End the Journey.

Issue:

At Level 3, the essence-family claim should be the premium endpoint of the ladder. In the cited examples, the final claim has lower immediate net value than the Level 3 stop: `early:05` claim nets 145 essence versus a 165 essence stop, `mid:06` claim nets 50 essence versus a 125 essence stop, and `mid:08` claim nets 60 essence versus a 135 essence stop. This makes the visible claim action a dominated option.

Recommendation:

Compute essence-family claim value after subtracting the displayed claim cost, then require the net claim value to exceed the same-level stop by a meaningful premium. The premium should also account for prior continue costs so the full ladder feels like a risked investment rather than a trap.

### Claim Premiums Are Too Small For Non-Essence Rewards

Severity: medium

Seeds: `audit:prize_ladder:late:09`, `audit:prize_ladder:mid:10`, `audit:prize_ladder:late:08`

Stages: mid, late

Replay:

`npm run journey -- --seed audit:prize_ladder:late:09 --stage late --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:mid:10 --stage mid --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:late:08 --stage late --shape prize_ladder --debug --show-deck --no-color`

Generated options:

`audit:prize_ladder:late:09`

1. Level 1 Stop: Draft 1 of 4 events. End the Journey.
2. Level 1 Continue: Pay 35 essence. Go to Level 2.
3. Level 2 Stop: Draft 1 of 4 events. Gain 1 omen. End the Journey.
4. Level 2 Continue: Pay 85 essence. Go to Level 3.
5. Level 3 Stop: Draft 1 of 4 events. Gain 2 omens. End the Journey.
6. Level 3 Claim: Pay 165 essence and draft 1 of 4 events. Gain 3 omens. End the Journey.

`audit:prize_ladder:mid:10`

1. Level 1 Stop: Choose 1 of 2 Dreamsigns. End the Journey.
2. Level 1 Continue: Pay 25 essence. Go to Level 2.
3. Level 2 Stop: Choose 1 of 2 Dreamsigns. Gain 1 omen. End the Journey.
4. Level 2 Continue: Pay 55 essence. Go to Level 3.
5. Level 3 Stop: Choose 1 of 3 Dreamsigns. Gain 2 omens. End the Journey.
6. Level 3 Claim: Pay 105 essence and choose 1 of 3 Dreamsigns. Gain 3 omens. End the Journey.

`audit:prize_ladder:late:08`

1. Level 1 Stop: Choose 1 of 2 Dreamsigns. End the Journey.
2. Level 1 Continue: Pay 25 essence. Go to Level 2.
3. Level 2 Stop: Choose 1 of 2 Dreamsigns. Gain 1 omen. End the Journey.
4. Level 2 Continue: Pay 65 essence. Go to Level 3.
5. Level 3 Stop: Choose 1 of 3 Dreamsigns. Gain 2 omens. End the Journey.
6. Level 3 Claim: Pay 135 essence and choose 1 of 3 Dreamsigns. Gain 3 omens. End the Journey.

Issue:

The non-essence claim branch often asks for 105 to 165 essence to add one omen beyond the Level 3 stop while keeping the same draft or Dreamsign choice size. The ladder should make the final claim feel like a distinct prize: a stronger draft pool, more picks, a rare object, or a larger omen jump that clearly justifies the added payment and prior continue costs.

Recommendation:

Give non-essence final claims a visible reward upgrade beyond a single extra omen. For draft rewards, increase the pick count or offer quality at the claim level. For Dreamsign rewards, expand the choice count, guarantee a higher-impact family, or pair the Dreamsign with a larger stage-appropriate resource reward.

### Costs Have Weak Stage Scaling

Severity: medium

Seeds: `audit:prize_ladder:early:07`, `audit:prize_ladder:mid:04`, `audit:prize_ladder:late:02`

Stages: early, mid, late

Replay:

`npm run journey -- --seed audit:prize_ladder:early:07 --stage early --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:mid:04 --stage mid --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:late:02 --stage late --shape prize_ladder --debug --show-deck --no-color`

Generated options:

`audit:prize_ladder:early:07`

1. Level 1 Stop: Draft 1 of 4 events. End the Journey.
2. Level 1 Continue: Pay 35 essence. Go to Level 2.
3. Level 2 Stop: Draft 1 of 4 events. Gain 1 omen. End the Journey.
4. Level 2 Continue: Pay 65 essence. Go to Level 3.
5. Level 3 Stop: Draft 1 of 4 events. Gain 2 omens. End the Journey.
6. Level 3 Claim: Pay 115 essence and draft 1 of 4 events. Gain 3 omens. End the Journey.

`audit:prize_ladder:mid:04`

1. Level 1 Stop: Draft 1 of 4 events. End the Journey.
2. Level 1 Continue: Pay 35 essence. Go to Level 2.
3. Level 2 Stop: Draft 1 of 4 events. Gain 1 omen. End the Journey.
4. Level 2 Continue: Pay 75 essence. Go to Level 3.
5. Level 3 Stop: Draft 1 of 4 events. Gain 2 omens. End the Journey.
6. Level 3 Claim: Pay 125 essence and draft 1 of 4 events. Gain 3 omens. End the Journey.

`audit:prize_ladder:late:02`

1. Level 1 Stop: Draft 1 of 4 events. End the Journey.
2. Level 1 Continue: Pay 25 essence. Go to Level 2.
3. Level 2 Stop: Draft 1 of 4 events. Gain 1 omen. End the Journey.
4. Level 2 Continue: Pay 55 essence. Go to Level 3.
5. Level 3 Stop: Draft 1 of 4 events. Gain 2 omens. End the Journey.
6. Level 3 Claim: Pay 105 essence and draft 1 of 4 events. Gain 3 omens. End the Journey.

Issue:

Late costs can roll below early and mid costs for the same reward family and same visible reward structure. Stage fit should make late ladders feel larger and more consequential than early ladders while preserving reachability from the displayed resource total.

Recommendation:

Use stage-specific bands for continue and claim costs, then validate the full-path total against the stage's starting essence. Late should usually raise both the maximum prize and the claim premium instead of producing a cheaper copy of an early ladder.

### Debug Output Obscures The Actual Hidden Choices

Severity: low

Seeds: `audit:prize_ladder:early:02`, `audit:prize_ladder:early:03`

Stages: early

Replay:

`npm run journey -- --seed audit:prize_ladder:early:02 --stage early --shape prize_ladder --debug --show-deck --no-color`

`npm run journey -- --seed audit:prize_ladder:early:03 --stage early --shape prize_ladder --debug --show-deck --no-color`

Generated options:

`audit:prize_ladder:early:02`

1. Level 1 Stop: Draft 1 of 4 events. End the Journey.
2. Level 2 Stop: Draft 1 of 4 events. Gain 1 omen. End the Journey.
3. Level 3 Stop: Draft 1 of 4 events. Gain 2 omens. End the Journey.
4. Level 3 Claim: Pay 120 essence and draft 1 of 4 events. Gain 3 omens. End the Journey.

`audit:prize_ladder:early:03`

1. Level 1 Stop: Choose 1 of 2 Dreamsigns. End the Journey.
2. Level 2 Stop: Choose 1 of 2 Dreamsigns. Gain 1 omen. End the Journey.
3. Level 3 Stop: Choose 1 of 3 Dreamsigns. Gain 2 omens. End the Journey.
4. Level 3 Claim: Pay 120 essence and choose 1 of 3 Dreamsigns. Gain 3 omens. End the Journey.

Issue:

The player-facing text correctly exposes that a draft or Dreamsign choice is hidden. The debug output lists broad candidate pools and repeated operation metadata, but it does not show the concrete 4-card event draft or the concrete 2- or 3-Dreamsign choice offered by each ladder level. Shape audits need the exact hidden options to judge reward quality, duplicate choices, and reward-family connection.

Recommendation:

When `--debug --show-deck` is active, include the resolved hidden choice set for each stop and claim node. Keep the broad candidate count as metadata, but make the exact offered choices visible near the corresponding tree node.

## Passing Observations

- Grammar is consistently readable across the 30 samples. Stop, Continue, and Claim labels are clear, and sentence casing follows Journey vocabulary.
- The tree structure is consistent: each sample presents three levels, stop branches terminate, continue branches advance one level, and the final claim terminates.
- Costs read as costs and rewards read as rewards. The visible action verbs are appropriate for essence, omen, event draft, and Dreamsign draft families.
- Reward families are stable within each sample. A ladder that starts with essence, omens, events, or Dreamsigns keeps that family through the final claim.
- Generated output does not expose placeholder IDs, malformed object names, or implementation-only names in the player-facing Journey text.

## Verification

Sanity command:

`npm run journey -- --seed audit:prize_ladder:early:01 --stage early --shape prize_ladder --debug --show-deck --no-color`

Expected result: command succeeds and uses the same replay format cited in this report.
