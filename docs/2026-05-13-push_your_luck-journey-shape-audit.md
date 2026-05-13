# `push_your_luck` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `push_your_luck`
- Stages: early, mid, late
- Seeds: `audit:push_your_luck:<stage>:01` through `audit:push_your_luck:<stage>:10`
- Command template: `npm run journey -- --seed audit:push_your_luck:<stage>:NN --stage <stage> --shape push_your_luck --debug --show-deck --no-color`

## Findings

### Forced Generation Can Fail Validation

Severity: high

Seed: `audit:push_your_luck:early:10`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:10 --stage early --shape push_your_luck --debug --show-deck --no-color`

Seed: `audit:push_your_luck:mid:03`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:mid:03 --stage mid --shape push_your_luck --debug --show-deck --no-color`

Seed: `audit:push_your_luck:mid:04`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:mid:04 --stage mid --shape push_your_luck --debug --show-deck --no-color`

Seed: `audit:push_your_luck:mid:06`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:mid:06 --stage mid --shape push_your_luck --debug --show-deck --no-color`

Seed: `audit:push_your_luck:late:09`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:late:09 --stage late --shape push_your_luck --debug --show-deck --no-color`

Generated output:

```text
Error: Forced shape push_your_luck failed validation: Push-your-luck rewards must stay mechanically connected across levels (shape: push_your_luck; payload: adapter/current; target: none; rule: push_rewards_must_connect)
```

Issue:
Five of the thirty deterministic forced-shape runs exit with code 4 before producing a Journey. A forced `push_your_luck` run should either select connected rewards before validation or fall back to a connected reward family that can render a complete decision tree.

Recommendation:
Constrain the adapter candidate set before level construction so every selected level belongs to one mechanically connected reward progression. Add regression coverage for the failing seeds and for the full `01` through `10` audit range across early, mid, and late stages.

### Deeper Pushes Can Offer Lower-Quality Rewards

Severity: high

Seed: `audit:push_your_luck:early:07`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:07 --stage early --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 80% chance to apply `{Golden Transfiguration}` to a chosen card. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 60% chance to apply `{Magenta Transfiguration}` to a chosen card. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 40% chance to apply `{Bronze Transfiguration}` to a chosen card. End the Journey.

Seed: `audit:push_your_luck:early:08`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:08 --stage early --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 75% chance to apply `{Prismatic Transfiguration}` to a chosen card. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 60% chance to apply `{Viridian Transfiguration}` to a chosen card. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 45% chance to apply `{Bronze Transfiguration}` to a chosen card. End the Journey.

Seed: `audit:push_your_luck:late:02`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:late:02 --stage late --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 75% chance to apply `{Bronze Transfiguration}` to a chosen card. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 60% chance to remove a Transfiguration from a chosen card. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 45% chance to apply `{Golden Transfiguration}` to a chosen card. End the Journey.

Issue:
The chance of success decreases on each deeper push, but the reward quality can stay flat, move downward, or switch into a cleanup effect whose value depends on hidden deck state. The player should see a clear reason to accept worse odds. In these examples, stopping after Level 1 is often the rational choice because later pushes add risk without a visibly better reward.

Recommendation:
Order level rewards by expected value after applying the success odds. Transfiguration lines should progress toward stronger or more numerous upgrades at deeper levels, and cleanup effects such as Transfiguration removal should appear only when the shown state makes their value clear.

### Banking And Failure Semantics Are Ambiguous

Severity: high

Seed: `audit:push_your_luck:early:02`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:02 --stage early --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Stop: Leave.
2. Level 1 Push: Risk immediate failure for a 80% chance to gain 1 omen. Go to Level 2.
3. Level 1 Failure: Gain 1 Despair. End the Journey.
4. Level 2 Stop: Keep the last safe reward. End the Journey.
5. Level 2 Push: Risk immediate failure for a 60% chance to gain 2 omens. Go to Level 3.
6. Level 2 Failure: Gain 1 Despair. End the Journey.
7. Level 3 Stop: Keep the last safe reward. End the Journey.
8. Level 3 Push: Risk immediate failure for a 40% chance to gain 3 omens. End the Journey.
9. Level 3 Failure: Gain 1 Despair. End the Journey.

Issue:
The tree does not state whether a failed deeper push loses previously earned safe rewards, keeps previously earned rewards and adds the Bane, or replaces the last safe reward with the failure outcome. `Keep the last safe reward` also leaves unclear whether the player keeps only the most recent successful reward or the accumulated rewards from all successful pushes.

Recommendation:
Render each stop and failure branch with explicit banking rules. For example, stop branches should state the banked total, and failure branches should state whether banked rewards are kept, lost, or replaced.

### Late Runs Use Early-Scale Reward Bands

Severity: medium

Seed: `audit:push_your_luck:early:03`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:03 --stage early --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 85% chance to gain 1 omen. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 70% chance to gain 2 omens. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 55% chance to gain 3 omens. End the Journey.

Seed: `audit:push_your_luck:late:03`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:late:03 --stage late --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 85% chance to gain 1 omen. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 65% chance to gain 2 omens. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 45% chance to gain 3 omens. End the Journey.

Seed: `audit:push_your_luck:mid:10`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:mid:10 --stage mid --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 80% chance to draft 1 of 4 events. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 65% chance to draft 1 of 4 events. Gain 1 omen. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 50% chance to draft 1 of 4 events. Gain 2 omens. End the Journey.

Seed: `audit:push_your_luck:late:10`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:late:10 --stage late --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 80% chance to draft 1 of 4 events. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 65% chance to draft 1 of 4 events. Gain 1 omen. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 50% chance to draft 1 of 4 events. Gain 2 omens. End the Journey.

Issue:
Late samples often use the same reward counts and odds bands as early or mid samples. The late stage should create higher-pressure offers with late-appropriate rewards, costs, or stakes. The sampled late trees feel like the same generator at a later label rather than a stage-specific decision.

Recommendation:
Apply stage-specific reward and hazard bands after the shape selects a connected reward family. Late trees should either raise the upside, raise the failure stakes, or present a distinct late-game reward family.

### Hidden Choices Make Rewards Hard To Evaluate

Severity: medium

Seed: `audit:push_your_luck:early:06`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:06 --stage early --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 85% chance to choose 1 of 2 Dreamsigns. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 65% chance to choose 1 of 2 Dreamsigns. Gain 1 omen. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 45% chance to choose 1 of 3 Dreamsigns. Gain 2 omens. End the Journey.

Seed: `audit:push_your_luck:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:01 --stage early --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Level 1 Push: Risk immediate failure for a 80% chance to draft 1 of 4 events. Go to Level 2.
2. Level 2 Push: Risk immediate failure for a 60% chance to draft 1 of 4 events. Gain 1 omen. Go to Level 3.
3. Level 3 Push: Risk immediate failure for a 40% chance to draft 1 of 4 events. Gain 2 omens. End the Journey.

Issue:
The visible tree hides the Dreamsign choices and event draft pool. The debug output shows source families and candidate counts, but the player-facing offer does not show whether the deeper choice set is better, broader, or strategically relevant to the current deck.

Recommendation:
For choice-based push rewards, include enough preview information to evaluate the risk. Dreamsign choices should show the offered Dreamsigns or a meaningful category, and event drafts should show their pool or rarity tier.

### Success Wording Uses The Wrong Article Before Percentages

Severity: low

Seed: `audit:push_your_luck:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:push_your_luck:early:01 --stage early --shape push_your_luck --debug --show-deck --no-color`

Generated options:

1. Risk immediate failure for a 80% chance to draft 1 of 4 events.
2. Risk immediate failure for a 60% chance to draft 1 of 4 events. Gain 1 omen.
3. Risk immediate failure for a 40% chance to draft 1 of 4 events. Gain 2 omens.

Issue:
The text uses `a 80%`, `a 60%`, and similar percentage phrases. These should read as `an 80%`, `a 60%`, or avoid the article entirely.

Recommendation:
Render push odds as `Risk immediate failure for an 80% chance...` when the percentage begins with a vowel sound, or use `Risk immediate failure: 80% chance to...` for all percentages.

## Passing Observations

- Successful runs consistently render a three-level decision tree with visible success odds on every push branch.
- Failure branches consistently display a Bane and an immediate terminal state.
- Omen and essence reward families generally scale upward by level when those families are selected.
- Debug output includes the selected shape, seed, stage, shown deck, active Dreamsigns, operation families, target resolution metadata, and random envelope notes needed to replay and inspect each sample.

## Verification

Verification command:

`npm run journey -- --seed audit:push_your_luck:early:01 --stage early --shape push_your_luck --debug --show-deck --no-color`

Result: succeeded with exit code 0.
