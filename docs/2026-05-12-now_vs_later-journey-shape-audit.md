# `now_vs_later` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `now_vs_later`
- Stages: early, mid, late
- Audit seeds: `audit:now_vs_later:early`, `audit:now_vs_later:mid`, and `audit:now_vs_later:late`
- Command template: `npm run journey -- --seed audit:now_vs_later:<stage> --stage <stage> --shape now_vs_later --count 10 --debug --show-deck --no-color`
- Batch indices: `J-000001` through `J-000010` in each generated batch

## Findings

### Delayed Site Rewards Target The Current Dreamscape

Severity: high

Seed: `audit:now_vs_later:early`
Stage: `early`
Batch index: `J-000006`
Replay:
`npm run journey -- --seed audit:now_vs_later:early --stage early --shape now_vs_later --count 10 --debug --show-deck --no-color`

Generated options:

1. `Take a modest reward now: choose a starter card to transform into 'Blooming Path Wanderer'.`
2. `Wait until the next dreamscape for a richer reward: add a Dreamsign Draft site to this dreamscape.`

Seed: `audit:now_vs_later:mid`
Stage: `mid`
Batch index: `J-000004`
Replay:
`npm run journey -- --seed audit:now_vs_later:mid --stage mid --shape now_vs_later --count 10 --debug --show-deck --no-color`

Generated options:

1. `Take a modest reward now: add Reclaim 1 to 2 random cards.`
2. `Wait for two dreamscapes for a richer reward: add a Purge site to this dreamscape.`

Issue:

The delayed option resolves after a future dreamscape trigger, but the reward text targets `this dreamscape`. The player has already committed to waiting, so the target dreamscape should be the resolving dreamscape or a visible future route slot. As written, the option asks the player to wait for a future trigger and then modifies the current scene.

Recommendation:

Filter delayed rewards to payloads whose target remains valid at the trigger time, or render route rewards with an explicit future target such as `the resolving dreamscape` or `the next dreamscape you visit`. Keep current-dreamscape site insertion on immediate rows or on shapes whose effect applies during the presented scene.

### Broad Mass-Upgrades Dwarf The Immediate Choice

Severity: high

Seed: `audit:now_vs_later:early`
Stage: `early`
Batch index: `J-000010`
Replay:
`npm run journey -- --seed audit:now_vs_later:early --stage early --shape now_vs_later --count 10 --debug --show-deck --no-color`

Generated options:

1. `Take a modest reward now: gain a copy of 'Crow'.`
2. `Wait until the next dreamscape for a richer reward: apply Prismatic to all Event cards.`

Debug values:

1. Net: `+240` converted essence
2. Net: `+4200` converted essence

Seed: `audit:now_vs_later:mid`
Stage: `mid`
Batch index: `J-000001`
Replay:
`npm run journey -- --seed audit:now_vs_later:mid --stage mid --shape now_vs_later --count 10 --debug --show-deck --no-color`

Generated options:

1. `Take a modest reward now: transform a chosen card with a 'judgment' ability into 'Bloomweaver'.`
2. `Wait until the next dreamscape for a richer reward: apply Golden to all cards with a 'materialized' ability.`

Debug values:

1. Net: `+62.400000000000006` converted essence
2. Net: `+4648.8` converted essence

Seed: `audit:now_vs_later:mid`
Stage: `mid`
Batch index: `J-000003`
Replay:
`npm run journey -- --seed audit:now_vs_later:mid --stage mid --shape now_vs_later --count 10 --debug --show-deck --no-color`

Generated options:

1. `Take a modest reward now: gain 150-210 essence (random roll).`
2. `Wait until your next victory for a richer reward: apply Prismatic to all cards with an 'abandon' ability.`

Debug values:

1. Net: `+180` converted essence
2. Net: `+2246.4` converted essence

Issue:

The delayed row should be richer, but a one-dreamscape or next-victory wait with no explicit cost becomes a near-forced pick when the payoff is worth 12 to 75 times the immediate row. These offers turn the shape from an immediacy-versus-patience decision into a choice between a normal reward and a run-defining mass upgrade.

Recommendation:

Cap broad `all cards with ...` transfiguration rewards inside `now_vs_later`, require a visible affected-card count, or pair them with longer and riskier triggers. Keep the delayed row in a value band where impatience, route pressure, and battle risk can plausibly compete with the larger payoff.

### Future-Window Rewards Blur The Immediate Row

Severity: medium

Seed: `audit:now_vs_later:late`
Stage: `late`
Batch index: `J-000009`
Replay:
`npm run journey -- --seed audit:now_vs_later:late --stage late --shape now_vs_later --count 10 --debug --show-deck --no-color`

Generated options:

1. `Take a modest reward now: your next 3 shop purchases cost 1 fewer omen.`
2. `Wait until the next dreamscape for a richer reward: draft 1 of 4 cards with a 'dissolve' ability and gain 2 copies of it.`

Seed: `audit:now_vs_later:late`
Stage: `late`
Batch index: `J-000005`
Replay:
`npm run journey -- --seed audit:now_vs_later:late --stage late --shape now_vs_later --count 10 --debug --show-deck --no-color`

Generated options:

1. `Take a modest reward now: your opening hand contains 'Lantern Keeper' for the next 3 battles.`
2. `Wait until the next dreamscape for a richer reward: choose 1 of 3 Dreamsigns to gain.`

Issue:

The immediate row sometimes grants a future-window promise rather than a reward the player receives immediately. These effects can still be useful, but the row reads like another delayed contract and weakens the shape's central contrast between cashing out now and waiting for a larger payoff.

Recommendation:

Prefer immediate rows that resolve at selection time: essence, card grants, Dreamsign grants, card transforms, purges, or site changes that apply to the current scene. Use future-window shop and battle effects in timed-window shapes or render them with clear immediate activation language when they appear here.

## Passing Observations

- All three forced-shape generation batches completed successfully.
- Each sampled journey produced exactly two root options.
- Every delayed option created a visible precommitted hook with trigger, duration, expiration, controlled reward, and hook budget metadata.
- The delayed row consistently carried a higher debug net value than the immediate row.
- The sampled outputs covered dreamscape triggers, victory triggers, card rewards, Dreamsign rewards, essence rewards, route rewards, shop effects, and card-modification effects.

## Verification

`npm run journey -- --seed audit:now_vs_later:early:01 --stage early --shape now_vs_later --debug --show-deck --no-color`

The verification command completed successfully, and the replay commands in this report match the batch command format used for generation.
