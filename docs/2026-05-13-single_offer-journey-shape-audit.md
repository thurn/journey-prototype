# `single_offer` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck --no-color`.

## Method

- Shape: `single_offer`
- Stages: `early`, `mid`, `late`
- Seeds: `audit:single_offer:<stage>:01` through `audit:single_offer:<stage>:10`
- Command template: `npm run journey -- --seed audit:single_offer:<stage>:NN --stage <stage> --shape single_offer --debug --show-deck --no-color`

## Findings

### Leave Is Usually A Non-Choice

Severity: high

Seeds: `audit:single_offer:early:01`, `audit:single_offer:mid:03`, `audit:single_offer:mid:08`, `audit:single_offer:late:05`

Stages: `early`, `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_offer:early:01 --stage early --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:mid:03 --stage mid --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:mid:08 --stage mid --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:late:05 --stage late --shape single_offer --debug --show-deck --no-color`

Generated options:

`early:01`

1. Pay 60 essence. Draft 2 of 4 cards costing 2 or less. Gain 2 omens. Debug net: `+260`.
2. Leave with no effect. Debug net: `0`.

`mid:03`

1. Pay 25 essence. Apply `{Viridian Transfiguration}` to a random card in your deck. Gain 3 omens. Debug net: `+295`.
2. Leave with no effect. Debug net: `0`.

`mid:08`

1. Gain 1 Envy for next 3 battles. Choose 1 of 3 Dreamsigns. Debug net: `+345`.
2. Leave with no effect. Debug net: `0`.

`late:05`

1. Pay 60 essence. Gain 140 maximum essence. Debug net: `+260`.
2. Leave with no effect. Debug net: `0`.

Issue:

`single_offer` should create a clean take-or-leave exchange where the take branch has an obvious upside and a real reason to decline. In the sampled runs, the take branch usually has a large positive debug net while the leave branch is always exactly zero. The cost or burden rarely creates visible pressure. This makes leave read as a misclick guard instead of a strategic option.

Recommendation:

Select offers by a target take value band rather than the first non-negative offer. For this shape, the take branch should sit near an explicit tension point: meaningful reward with a cost, burden, timing delay, or opportunity loss that can plausibly beat the reward for some decks. Add a validation or scoring rule that rejects take branches whose net value is far above leave without a visible compensating reason.

### Late Offers Can Attach Sweeping Persistent Prohibitions

Severity: high

Seeds: `audit:single_offer:late:03`, `audit:single_offer:late:04`, `audit:single_offer:late:07`

Stage: `late`

Replay:
`npm run journey -- --seed audit:single_offer:late:03 --stage late --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:late:04 --stage late --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:late:07 --stage late --shape single_offer --debug --show-deck --no-color`

Generated options:

`late:03`

1. Take: block card transfiguration for the quest. Gain 300 essence. Debug net: `0`.
2. Leave with no effect. Debug net: `0`.

`late:04`

1. Take: block essence gain for the quest. Restore essence to maximum. Debug net: `+130`.
2. Leave with no effect. Debug net: `0`.

`late:07`

1. Take: block deck modification for the quest. Set essence to 65% of maximum. Debug net: `+165`.
2. Leave with no effect. Debug net: `0`.

Issue:

Persistent rule prohibitions are too broad for a single deterministic exchange unless the offer makes the future cost concrete. These late samples trade one immediate resource movement for a quest-wide restriction on core systems. The debug values price the branches as neutral or positive, but the player cannot estimate the future loss from the visible line, especially with a 35-card late deck and five active Dreamsigns.

Recommendation:

Use persistent prohibitions only when the Journey text exposes the scope and expected consequence of the restriction. Prefer bounded durations, named upcoming hooks, or a late-stage reward large enough to justify the rule mutation. For `single_offer`, a persistent prohibition should require a dedicated balance band and should not be selected as a generic cost slot.

### Hidden Choice Sets Obscure The Exchange

Severity: high

Seeds: `audit:single_offer:early:01`, `audit:single_offer:early:02`, `audit:single_offer:mid:06`, `audit:single_offer:mid:08`

Stages: `early`, `mid`

Replay:
`npm run journey -- --seed audit:single_offer:early:01 --stage early --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:early:02 --stage early --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:mid:06 --stage mid --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:mid:08 --stage mid --shape single_offer --debug --show-deck --no-color`

Generated options:

`early:01`

1. Pay 60 essence. Draft 2 of 4 cards costing 2 or less. Gain 2 omens.
2. Leave with no effect.

`early:02`

1. Pay all remaining essence (120). Apply `{Prismatic Transfiguration}` to a chosen Starter card.
2. Leave with no effect.

`mid:06`

1. Pay 40% of current essence (160). Replace a chosen Starter card with 1 of 4 low-cost draft-pool cards.
2. Leave with no effect.

`mid:08`

1. Gain 1 Envy for next 3 battles. Choose 1 of 3 Dreamsigns.
2. Leave with no effect.

Issue:

A single-offer exchange should let the player evaluate the take branch before committing. These outputs hide the actual draft cards, Dreamsign choices, or eligible Starter targets. The debug section exposes broad candidate pools and counts, but the player-facing Journey does not show the concrete exchange. The take branch is therefore deterministic in structure but not deterministic in visible value.

Recommendation:

Render the actual offered cards, Dreamsigns, and eligible targets for `single_offer` when the take branch depends on a choice set. If the candidates cannot be displayed compactly, route those rewards to a choice-oriented shape and keep `single_offer` to visible fixed rewards, named targets, and fully specified costs.

### Resource Text Can Overstate Realizable Value

Severity: medium

Seeds: `audit:single_offer:mid:02`, `audit:single_offer:late:09`

Stages: `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_offer:mid:02 --stage mid --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:late:09 --stage late --shape single_offer --debug --show-deck --no-color`

Generated options:

`mid:02`

1. Pay 25 essence. Gain 320 essence. Debug effect: `+100`; debug net: `+75`; shown state: `Essence: 400/500`.
2. Leave with no effect.

`late:09`

1. Lose 1 omen. Restore essence to maximum. Debug effect: `+320`; maximum-restore component: `+100`; shown state: `Essence: 400/500`.
2. Leave with no effect.

Issue:

The visible resource text and debug valuation use different mental models near the essence cap. `mid:02` says the player gains 320 essence, while the shown cap allows only 100 usable essence after paying 25. `late:09` renders as a restore-to-maximum exchange, while the debug effect line still reports a larger fixed reward value. This makes the cost/reward balance harder to verify from the text and from debug output.

Recommendation:

When current essence and maximum essence are known, render capped essence gains as the amount the player can actually receive. Debug output should separate raw reward magnitude from capped realized value so the audit trail explains why the net value differs from the player-facing number.

### Stage Identity Is Weak

Severity: medium

Seeds: `audit:single_offer:early:09`, `audit:single_offer:mid:10`, `audit:single_offer:late:10`

Stages: `early`, `mid`, `late`

Replay:
`npm run journey -- --seed audit:single_offer:early:09 --stage early --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:mid:10 --stage mid --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:late:10 --stage late --shape single_offer --debug --show-deck --no-color`

Generated options:

`early:09`

1. Pay 25% of current essence (30). Gain 4 omens. Debug net: `+290`.
2. Leave with no effect.

`mid:10`

1. Gain 1 Lethargy for next 3 battles. Gain 220 essence. Debug net: `+270`.
2. Leave with no effect.

`late:10`

1. Gain 1 Betrayal. Gain 5 omens. Debug net: `+180`.
2. Leave with no effect.

Issue:

The sample set uses similar resource, omen, Bane, cleanup, and draft templates across all stages. Early offers can grant very large acceleration, while late offers can still read as simple currency trades. The stage label changes the deck size and active Dreamsign count, but the offer texture often feels like the same generator at different progression points.

Recommendation:

Give `single_offer` stage-specific offer bands. Early offers should be compact and modest, mid offers should support deck direction with visible targets, and late offers should have higher stakes with costs that are legible in a near-complete run. Stage selection should affect both magnitude and template family.

### Debug Output Is Difficult To Reconcile With Player Text

Severity: medium

Seeds: `audit:single_offer:early:01`, `audit:single_offer:early:08`, `audit:single_offer:mid:08`

Stages: `early`, `mid`

Replay:
`npm run journey -- --seed audit:single_offer:early:01 --stage early --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:early:08 --stage early --shape single_offer --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:single_offer:mid:08 --stage mid --shape single_offer --debug --show-deck --no-color`

Generated options:

`early:01`

1. Pay 60 essence. Draft 2 of 4 cards costing 2 or less. Gain 2 omens.
2. Leave with no effect.

`early:08`

1. Lose 40 maximum essence. Purge up to 2 chosen Starter cards.
2. Leave with no effect.

`mid:08`

1. Gain 1 Envy for next 3 battles. Choose 1 of 3 Dreamsigns.
2. Leave with no effect.

Issue:

The debug section often reports generic `+320` or `+375` effect values for very different player-facing rewards, while target metadata lists broad source pools rather than the actual offered candidates. For example, `early:01` displays a draft of 4 cards, but debug target metadata lists 80 draft-pool candidates. This makes the audit trail less useful when checking whether the generated offer is legal, balanced, and readable.

Recommendation:

Add debug fields for resolved visible candidates and realized reward values. For choice rewards, show the exact candidate set that the player will see. For cleanup and replacement rewards, show the selected eligible targets, source pool size, and realized valuation components in the same terms used by the Journey text.

## Passing Observations

- All 30 deterministic commands completed successfully and rendered a two-option take-or-leave topology.
- Grammar is generally readable, with clear cost markers for essence and warning markers for Bane or rule-burden offers.
- The leave branch consistently uses the same plain text and pick behavior, which makes the topology easy to recognize.
- Debug output includes seed, stage, shape, semantic fingerprint, reachability mode, operation roles, timing families, and converted value totals for both branches.

## Verification

Sanity command:

`npm run journey -- --seed audit:single_offer:early:01 --stage early --shape single_offer --debug --show-deck --no-color`

Expected result: command succeeds and matches the replay command format used above.
