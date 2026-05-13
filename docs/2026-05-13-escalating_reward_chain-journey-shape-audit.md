# `escalating_reward_chain` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `escalating_reward_chain`
- Stages: early, mid, late
- Seeds: `audit:escalating_reward_chain:<stage>:01` through `audit:escalating_reward_chain:<stage>:10`
- Command template: `npm run journey -- --seed audit:escalating_reward_chain:<stage>:NN --stage <stage> --shape escalating_reward_chain --debug --show-deck --no-color`

## Findings

### Chain Rewards Can Decline

Severity: high

Seeds:

- `audit:escalating_reward_chain:early:03`
- `audit:escalating_reward_chain:early:04`
- `audit:escalating_reward_chain:mid:07`

Replay:
`npm run journey -- --seed audit:escalating_reward_chain:early:03 --stage early --shape escalating_reward_chain --debug --show-deck --no-color`

Generated options:

1. Level 1: Pay 35 essence and apply {Prismatic Transfiguration} to a chosen card.
2. Level 2: Pay 60 essence and apply {Bronze Transfiguration} to a chosen card.
3. Level 3: Pay 90 essence and remove a transfiguration from a chosen card.

Issue:
The chain can ask for higher costs while the reward quality drops. The cited example starts with a premium Transfiguration, then offers a weaker Transfiguration, then ends on a removal. `mid:07` has the same shape in battle-window rewards: the first level creates a temporary copy for the next 3 battles, the second level changes opening-hand behavior, and the final level returns to a temporary copy while costing 100 essence.

Recommendation:
Build each chain from a reward ladder that is monotonic by converted value and by player-facing quality. Transfiguration and battle-window chains should use an ordered profile where later levels are visibly stronger.

### Stop Dominates Some Take Branches

Severity: high

Seeds:

- `audit:escalating_reward_chain:early:04`
- `audit:escalating_reward_chain:mid:04`
- `audit:escalating_reward_chain:mid:06`

Replay:
`npm run journey -- --seed audit:escalating_reward_chain:mid:04 --stage mid --shape escalating_reward_chain --debug --show-deck --no-color`

Generated options:

1. Level 1: Pay 40 essence and draft 1 of 4 events.
2. Level 2: Pay 65 essence and draft 1 of 4 events. Gain 1 omen.
3. Level 3: Pay 105 essence and draft 1 of 4 events. Gain 2 omens.

Issue:
Across the 30 sampled journeys, 8 of 90 Take branches are nonpositive against Stop, and 13 of 90 are worth 10 converted essence or less. In the cited `mid:04` sample, Level 1 is negative because it charges 40 essence for a 25-value event draft. These branches make Stop the practical choice in a shape that should reward continuing the chain.

Recommendation:
Derive each Take cost from the reward value at that level and enforce a positive net floor. Low-value draft rewards should receive a bonus or lower cost before the chain is emitted.

### Late Chains Use Small Rewards

Severity: medium

Seeds:

- `audit:escalating_reward_chain:late:01`
- `audit:escalating_reward_chain:late:02`
- `audit:escalating_reward_chain:late:04`

Replay:
`npm run journey -- --seed audit:escalating_reward_chain:late:01 --stage late --shape escalating_reward_chain --debug --show-deck --no-color`

Generated options:

1. Level 1: Pay 20 essence and draft 1 of 4 events.
2. Level 2: Pay 45 essence and draft 1 of 4 events. Gain 1 omen.
3. Level 3: Pay 75 essence and draft 1 of 4 events. Gain 2 omens.

Issue:
Late-stage chains frequently offer event drafts with small omen bonuses or 1-to-3 omen chains. The text is legal, but it reads below late-stage stakes, especially when the player is being asked to spend escalating essence across a multi-level tree.

Recommendation:
Use late-stage reward profiles with stronger bonuses, premium card operations, larger resource payouts, or higher Dreamsign choice counts. The final late-stage Take branch should feel like a meaningful capstone.

## Passing Observations

- All 30 sampled journeys generated complete decision-tree manifests.
- Each sampled tree uses clear Stop and Take branches.
- Successful Take branches advance or terminate according to the level.
- The output avoids placeholder IDs, malformed names, and `undefined`.

## Verification

Sanity replay:
`npm run journey -- --seed audit:escalating_reward_chain:early:01 --stage early --shape escalating_reward_chain --debug --show-deck --no-color`

The replay command succeeds and matches the command format used for the audited examples.
