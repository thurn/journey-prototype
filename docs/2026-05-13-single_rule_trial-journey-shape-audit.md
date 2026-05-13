# `single_rule_trial` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `single_rule_trial`
- Stages: early, mid, late
- Seeds: `audit:single_rule_trial:<stage>:01` through `audit:single_rule_trial:<stage>:10`
- Command template: `npm run journey -- --seed audit:single_rule_trial:<stage>:NN --stage <stage> --shape single_rule_trial --debug --show-deck --no-color`

## Findings

### The Shape Collapses To One Trial

Severity: high

Seed: `audit:single_rule_trial:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:early:01 --stage early --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 3 Dreamsigns instead of card rewards.`

Seed: `audit:single_rule_trial:mid:06`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:mid:06 --stage mid --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 2 Dreamsigns instead of card rewards.`

Seed: `audit:single_rule_trial:late:01`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:late:01 --stage late --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 3 Dreamsigns instead of card rewards.`

Issue:

All 30 forced samples apply the same `Spoiled Victory` rule mutation. The only player-visible variation is whether the next victory grants a 2-choice or 3-choice Dreamsign draft instead of card rewards. The sampled pool candidates and quest/deck context vary, while the generated trial is independent of that context from the player's point of view.

This makes replayability very low for a shape that appears across all stages. It also makes the single-option topology feel like a fixed tutorial rule rather than a generated Journey scene.

Recommendation:

Give `single_rule_trial` a shape-local catalog of rule mutations that preserves the one-option contract while varying the actual trial. Examples that fit the topology include next Dreamwell reward replacement, next Bane cleanup rule, next shop discount rule, next battle-start rule, next site-entry rule, or next victory reward conversion. Each variant should carry its own legal target selector, value band, and stage gating so the forced shape can produce multiple meaningful trials without adding extra options.

### Player-Facing Text Has A Grammar Break

Severity: medium

Seed: `audit:single_rule_trial:early:03`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:early:03 --stage early --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 2 Dreamsigns instead of card rewards.`

Seed: `audit:single_rule_trial:late:05`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:late:05 --stage late --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 2 Dreamsigns instead of card rewards.`

Issue:

The phrase `yields choose 1 of 2 Dreamsigns` and the matching 3-choice form read as two verbs joined directly. The option is understandable after parsing, but it is not clean player-facing rules text. The leading `* !` icon cluster also makes the line visually noisy for a single mandatory status.

Recommendation:

Render the rule as a complete reward object, such as `Your next victory yields a choice of 2 Dreamsigns instead of card rewards.` or `Your next victory yields a 2-Dreamsign draft instead of card rewards.` If the icons remain useful, keep their order and spacing consistent with other visible status effects so the rule text starts cleanly after the prefix.

### Stage Fit Uses One Flat Value Band

Severity: medium

Seed: `audit:single_rule_trial:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:early:01 --stage early --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 3 Dreamsigns instead of card rewards.`

Seed: `audit:single_rule_trial:mid:01`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:mid:01 --stage mid --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 3 Dreamsigns instead of card rewards.`

Seed: `audit:single_rule_trial:late:01`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:single_rule_trial:late:01 --stage late --shape single_rule_trial --debug --show-deck --no-color`

Generated options:

1. `* ! Your next victory yields choose 1 of 3 Dreamsigns instead of card rewards.`

Issue:

The debug valuation is identical across stages: cost 0, effect +320, uncertainty -8, net +312. The same immediate status appears at early essence 120/500, mid essence 400/500, and late essence 400/500. Early runs with one active Dreamsign and late runs with five active Dreamsigns receive the same trial and value model.

The stage tags also diverge from the visible result. Late samples select tags such as `convert`, `gamble`, `route`, and `sacrifice`, while the output is a fixed reward replacement independent of route, gamble, or sacrifice play.

Recommendation:

Gate or scale rule-mutation variants by stage. Early trials should teach or lightly redirect the next reward. Mid trials can offer stronger refinement or economy rules. Late trials should justify their slot with higher-impact or more specialized rules that reference late-stage context, such as current Dreamsign count, card reward quality, route pressure, or victory timing.

## Passing Observations

- All 30 forced-shape replay commands completed successfully.
- Every sampled manifest used the expected `single_rule_trial` topology with exactly one root option.
- The generated option carried a visible status rule mutation with `rewardTrigger: next_victory`, `replacedRewardKind: card_rewards`, `replacementKind: dreamsign_draft`, and one-time duration metadata.
- Target resolution succeeded in every sampled run. The Dreamsign pool candidate count was always larger than the requested draft count, ranging from 26 to 62 candidates in the samples.
- The shape-specific validators accepted the generated manifests immediately; no repair path changed a sampled output.

## Verification

Sanity replay command:

`npm run journey -- --seed audit:single_rule_trial:early:01 --stage early --shape single_rule_trial --debug --show-deck --no-color`
