# `single_reward` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck --no-color`.

## Method

- Shape: `single_reward`
- Stages: `early`, `mid`, `late`
- Seeds: `audit:single_reward:<stage>:01` through `audit:single_reward:<stage>:10`
- Command template: `npm run journey -- --seed audit:single_reward:<stage>:NN --stage <stage> --shape single_reward --debug --show-deck --no-color`

## Findings

### Offers Present Two Competing Rewards

Severity: high

Seeds: `audit:single_reward:early:01`, `audit:single_reward:mid:02`, `audit:single_reward:late:01`

Stages: `early`, `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_reward:early:01 --stage early --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:mid:02 --stage mid --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:late:01 --stage late --shape single_reward --debug --show-deck --no-color`

Generated options:

`early:01`

1. Gain 5 omens.
2. Choose 1 of 2 Dreamsigns.

`mid:02`

1. Choose 1 of 3 Dreamsigns.
2. Draft 1 of 4 cards with multiple abilities. Gain 4 omens.

`late:01`

1. Choose 1 of 3 Dreamsigns.
2. Draft 1 of 4 cards with discard text. Gain 4 omens.

Issue:

The generated Journey behaves as a two-option reward comparison in all 30 sampled runs. Each option has `Cost: 0 converted essence`, `Burden: 0 converted essence`, `Uncertainty: 0 converted essence`, and positive net value. This makes `single_reward` read like a reward-choice shape instead of a simple deterministic boon. The player is asked to compare reward axes such as omens, essence, cards, and Dreamsigns, which creates the strategic tradeoff texture expected from multi-reward or draft-oriented shapes.

Recommendation:

`single_reward` should present one visible boon with one clear reward payload. If the UI requires two option rows, one row should be a deterministic confirmation or flavor-equivalent presentation of the same boon, not a materially different reward axis. Keep card drafting, Dreamsign selection, and resource gain as separate single-payload variants rather than pairing them against each other inside one offer.

### Hidden Choices Are Not Visible In The Journey Text

Severity: high

Seeds: `audit:single_reward:early:02`, `audit:single_reward:mid:09`, `audit:single_reward:late:03`

Stages: `early`, `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_reward:early:02 --stage early --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:mid:09 --stage mid --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:late:03 --stage late --shape single_reward --debug --show-deck --no-color`

Generated options:

`early:02`

1. Draft 1 of 4 cards with discard text. Gain 4 omens.
2. Choose 1 of 2 Dreamsigns.

`mid:09`

1. Draft 1 of 4 duplicate draft-pool cards. Gain 4 omens.
2. Choose 1 of 3 Dreamsigns.

`late:03`

1. Draft 1 of 4 energy-generation cards. Gain 4 omens.
2. Choose 1 of 3 Dreamsigns.

Issue:

The Journey text asks the player to draft cards or choose Dreamsigns but does not show the concrete candidates. `--show-deck` shows the current deck and active Dreamsigns, while debug metadata shows broad target pools and candidate counts. The player-facing offer leaves the actual draft candidates and Dreamsign candidates hidden at the decision point. A deterministic boon should communicate the reward directly, and a choice-based reward should expose the candidate set before the player chooses.

Recommendation:

For `single_reward`, prefer reward forms whose full value is visible in one line, such as gaining essence, gaining omens, or receiving a named Dreamsign. If draft or Dreamsign choice remains valid for this shape, render the actual offered cards or Dreamsigns in the Journey text or in an adjacent visible detail block.

### Cross-Axis Comparisons Make Boons Hard To Evaluate

Severity: medium

Seeds: `audit:single_reward:early:04`, `audit:single_reward:mid:10`, `audit:single_reward:late:05`

Stages: `early`, `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_reward:early:04 --stage early --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:mid:10 --stage mid --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:late:05 --stage late --shape single_reward --debug --show-deck --no-color`

Generated options:

`early:04`

1. Gain 350 essence.
2. Draft 1 of 4 low-cost characters. Gain 4 omens.

`mid:10`

1. Draft 1 of 4 Reclaim events. Gain 4 omens.
2. Gain 5 omens.

`late:05`

1. Draft 1 of 4 low-cost characters. Gain 4 omens.
2. Gain 5 omens.

Issue:

The option pairs ask the player to compare unlike rewards: essence versus cards plus omens, or one additional omen versus a card draft. The debug valuation reports all options as close positive values, but the player cannot easily verify that equivalence because the visible rewards use different currencies and the draft candidates are hidden. This is useful for a meaningful choice shape, but it is too busy for a simple deterministic boon.

Recommendation:

Keep `single_reward` on one reward axis per generated Journey. Essence rewards should compare only with essence if multiple rows are required; omen rewards should present one clear omen amount; card and Dreamsign rewards should show their exact candidates or be assigned to a choice-oriented shape.

### Stage Scaling Has Low Texture

Severity: medium

Seeds: `audit:single_reward:early:06`, `audit:single_reward:mid:10`, `audit:single_reward:late:10`

Stages: `early`, `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_reward:early:06 --stage early --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:mid:10 --stage mid --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:late:10 --stage late --shape single_reward --debug --show-deck --no-color`

Generated options:

`early:06`

1. Gain 5 omens.
2. Draft 1 of 4 Abandon cards. Gain 4 omens.

`mid:10`

1. Draft 1 of 4 Reclaim events. Gain 4 omens.
2. Gain 5 omens.

`late:10`

1. Gain 5 omens.
2. Draft 1 of 4 Reclaim events. Gain 4 omens.

Issue:

The same reward magnitudes and templates appear across early, mid, and late stages. `Gain 5 omens`, `Draft 1 of 4 ... Gain 4 omens`, and `Choose 1 of 2/3 Dreamsigns` appear throughout the sample set. Late-stage outputs do not clearly read as late-stage boons, and early-stage outputs can grant large immediate acceleration.

Recommendation:

Give `single_reward` stage-specific reward bands and templates. Early boons should be modest and legible, mid boons should support deck direction, and late boons should deliver a concise high-impact reward whose value is obvious in a near-complete run.

### Debug Output Is Useful But Exposes Adapter Construction Noise

Severity: low

Seeds: `audit:single_reward:early:01`, `audit:single_reward:mid:01`, `audit:single_reward:late:01`

Stages: `early`, `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_reward:early:01 --stage early --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:mid:01 --stage mid --shape single_reward --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_reward:late:01 --stage late --shape single_reward --debug --show-deck --no-color`

Generated options:

`early:01`

1. Gain 5 omens.
2. Choose 1 of 2 Dreamsigns.

`mid:01`

1. Draft 1 of 4 event-copying cards. Gain 4 omens.
2. Choose 1 of 2 Dreamsigns.

`late:01`

1. Choose 1 of 3 Dreamsigns.
2. Draft 1 of 4 cards with discard text. Gain 4 omens.

Issue:

The debug output provides enough value information to diagnose the shape, including cost, burden, uncertainty, net value, target pools, and repair status. It also surfaces implementation-oriented labels such as `Payload families: ... adapter`, `Component value-band: dreamsign_predicate Dreamsign predicate (0)`, and option IDs like `option:3:effect:1`. These are acceptable for internal debugging, but they make audit reading noisy and do not directly explain why a `single_reward` offer contains multiple positive reward choices.

Recommendation:

Add a compact debug line for shape contract evaluation, such as visible option count, visible reward count, and whether the shape is deterministic or comparative. This would make future audits faster and would catch this class of mismatch directly.

## Passing Observations

- The generated player-facing grammar is consistently readable. Option text uses project vocabulary such as omens, Dreamsigns, essence, cards, and draft.
- Costs and rewards are not inverted. All visible options are boons, and the debug valuation consistently reports zero burden and positive net value.
- The commands succeeded for all 30 deterministic seeds. No generation failures, placeholder names, malformed object names, or confusing capitalization appeared in the sampled player-facing text.

## Sample Coverage

Early:

- `audit:single_reward:early:01`: `Gain 5 omens.` / `Choose 1 of 2 Dreamsigns.`
- `audit:single_reward:early:02`: `Draft 1 of 4 cards with discard text. Gain 4 omens.` / `Choose 1 of 2 Dreamsigns.`
- `audit:single_reward:early:03`: `Choose 1 of 2 Dreamsigns.` / `Gain 5 omens.`
- `audit:single_reward:early:04`: `Gain 350 essence.` / `Draft 1 of 4 low-cost characters. Gain 4 omens.`
- `audit:single_reward:early:05`: `Gain 350 essence.` / `Draft 1 of 4 cards with discard text. Gain 4 omens.`
- `audit:single_reward:early:06`: `Gain 5 omens.` / `Draft 1 of 4 Abandon cards. Gain 4 omens.`
- `audit:single_reward:early:07`: `Gain 330 essence.` / `Draft 1 of 4 Abandon cards. Gain 4 omens.`
- `audit:single_reward:early:08`: `Choose 1 of 2 Dreamsigns.` / `Gain 350 essence.`
- `audit:single_reward:early:09`: `Draft 1 of 4 cards with discard text. Gain 4 omens.` / `Choose 1 of 3 Dreamsigns.`
- `audit:single_reward:early:10`: `Gain 5 omens.` / `Choose 1 of 3 Dreamsigns.`

Mid:

- `audit:single_reward:mid:01`: `Draft 1 of 4 event-copying cards. Gain 4 omens.` / `Choose 1 of 2 Dreamsigns.`
- `audit:single_reward:mid:02`: `Choose 1 of 3 Dreamsigns.` / `Draft 1 of 4 cards with multiple abilities. Gain 4 omens.`
- `audit:single_reward:mid:03`: `Choose 1 of 3 Dreamsigns.` / `Draft 1 of 4 Dissolve events. Gain 4 omens.`
- `audit:single_reward:mid:04`: `Choose 1 of 3 Dreamsigns.` / `Draft 1 of 4 cards with multiple abilities. Gain 4 omens.`
- `audit:single_reward:mid:05`: `Choose 1 of 2 Dreamsigns.` / `Draft 1 of 4 Reclaim events. Gain 4 omens.`
- `audit:single_reward:mid:06`: `Draft 1 of 4 Dissolve events. Gain 4 omens.` / `Choose 1 of 3 Dreamsigns.`
- `audit:single_reward:mid:07`: `Choose 1 of 2 Dreamsigns.` / `Draft 1 of 4 low-cost characters. Gain 4 omens.`
- `audit:single_reward:mid:08`: `Choose 1 of 3 Dreamsigns.` / `Draft 1 of 4 Abandon cards. Gain 4 omens.`
- `audit:single_reward:mid:09`: `Draft 1 of 4 duplicate draft-pool cards. Gain 4 omens.` / `Choose 1 of 3 Dreamsigns.`
- `audit:single_reward:mid:10`: `Draft 1 of 4 Reclaim events. Gain 4 omens.` / `Gain 5 omens.`

Late:

- `audit:single_reward:late:01`: `Choose 1 of 3 Dreamsigns.` / `Draft 1 of 4 cards with discard text. Gain 4 omens.`
- `audit:single_reward:late:02`: `Gain 5 omens.` / `Draft 1 of 4 cards with discard text. Gain 4 omens.`
- `audit:single_reward:late:03`: `Draft 1 of 4 energy-generation cards. Gain 4 omens.` / `Choose 1 of 3 Dreamsigns.`
- `audit:single_reward:late:04`: `Draft 1 of 4 Reclaim events. Gain 4 omens.` / `Choose 1 of 2 Dreamsigns.`
- `audit:single_reward:late:05`: `Draft 1 of 4 low-cost characters. Gain 4 omens.` / `Gain 5 omens.`
- `audit:single_reward:late:06`: `Draft 1 of 4 Abandon cards. Gain 4 omens.` / `Gain 5 omens.`
- `audit:single_reward:late:07`: `Draft 1 of 4 cards with multiple abilities. Gain 4 omens.` / `Choose 1 of 3 Dreamsigns.`
- `audit:single_reward:late:08`: `Choose 1 of 3 Dreamsigns.` / `Draft 1 of 4 Dissolve events. Gain 4 omens.`
- `audit:single_reward:late:09`: `Choose 1 of 2 Dreamsigns.` / `Gain 5 omens.`
- `audit:single_reward:late:10`: `Gain 5 omens.` / `Draft 1 of 4 Reclaim events. Gain 4 omens.`
