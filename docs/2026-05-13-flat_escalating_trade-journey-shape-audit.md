# `flat_escalating_trade` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `flat_escalating_trade`
- Stages: early, mid, late
- Seeds: `audit:flat_escalating_trade:<stage>:01` through `audit:flat_escalating_trade:<stage>:10`
- Command template: `npm run journey -- --seed audit:flat_escalating_trade:<stage>:NN --stage <stage> --shape flat_escalating_trade --debug --show-deck --no-color`

## Findings

### Highest Trade Is Consistently The Best Converted Value

Severity: high

Seeds: `audit:flat_escalating_trade:early:01`, `audit:flat_escalating_trade:mid:01`, `audit:flat_escalating_trade:late:01`

Stages: early, mid, late

Replay:

`npm run journey -- --seed audit:flat_escalating_trade:early:01 --stage early --shape flat_escalating_trade --debug --show-deck --no-color`

`npm run journey -- --seed audit:flat_escalating_trade:mid:01 --stage mid --shape flat_escalating_trade --debug --show-deck --no-color`

`npm run journey -- --seed audit:flat_escalating_trade:late:01 --stage late --shape flat_escalating_trade --debug --show-deck --no-color`

Generated options:

`audit:flat_escalating_trade:early:01`

1. Pay 20 essence. Gain 1 omen.
2. Pay 40 essence. Gain 2 omens.
3. Pay 70 essence. Gain 3 omens.

Debug values: option nets are +45, +90, and +125 converted essence.

`audit:flat_escalating_trade:mid:01`

1. Pay 20 essence. Gain 1 omen.
2. Pay 45 essence. Gain 2 omens.
3. Pay 80 essence. Gain 3 omens.

Debug values: option nets are +45, +85, and +115 converted essence.

`audit:flat_escalating_trade:late:01`

1. Pay 30 essence. Gain 1 omen.
2. Pay 60 essence. Gain 2 omens.
3. Pay 95 essence. Gain 3 omens.

Debug values: option nets are +35, +70, and +100 converted essence.

Issue:

Every sampled offer uses the same immediate reward family and gives the largest trade the highest converted net value. A player who can afford option 3 receives the best total value, so the menu often asks how much upside the player can buy rather than presenting a tense escalating trade. Early examples start with 120 essence and can afford all three options. Mid and late examples start with 400 essence and can also afford all three options.

Recommendation:

Make each tier express a distinct strategic posture. For example, option 1 can be the efficient small purchase, option 2 can be the balanced purchase, and option 3 can be the expensive burst purchase with lower efficiency but higher ceiling. The value model should allow strictly increasing reward size while keeping converted net value close enough that each tier has a credible use case.

### Late-Stage Costs Are Mild Relative To The Visible Essence Bank

Severity: medium

Seeds: `audit:flat_escalating_trade:early:04`, `audit:flat_escalating_trade:mid:03`, `audit:flat_escalating_trade:late:02`

Stages: early, mid, late

Replay:

`npm run journey -- --seed audit:flat_escalating_trade:early:04 --stage early --shape flat_escalating_trade --debug --show-deck --no-color`

`npm run journey -- --seed audit:flat_escalating_trade:mid:03 --stage mid --shape flat_escalating_trade --debug --show-deck --no-color`

`npm run journey -- --seed audit:flat_escalating_trade:late:02 --stage late --shape flat_escalating_trade --debug --show-deck --no-color`

Generated options:

`audit:flat_escalating_trade:early:04`

1. Pay 15 essence. Gain 1 omen.
2. Pay 35 essence. Gain 2 omens.
3. Pay 60 essence. Gain 3 omens.

`audit:flat_escalating_trade:mid:03`

1. Pay 25 essence. Gain 1 omen.
2. Pay 55 essence. Gain 2 omens.
3. Pay 90 essence. Gain 3 omens.

`audit:flat_escalating_trade:late:02`

1. Pay 35 essence. Gain 1 omen.
2. Pay 70 essence. Gain 2 omens.
3. Pay 110 essence. Gain 3 omens.

Issue:

The stage labels increase, but the cost pressure weakens after early play. The early option 3 examples cost 60 to 70 essence out of 120 visible essence, or 50% to 58% of the bank. Late option 3 examples cost 95 to 110 essence out of 400 visible essence, or 24% to 28% of the bank. A late escalating trade should feel like a larger commitment than an early one, especially when the reward remains capped at 3 omens.

Recommendation:

Scale late and mid prices against the simulated stage economy, or scale reward size alongside cost. If late journeys continue to start at 400 essence, the largest late trade should ask for a meaningfully larger share of that bank or should offer a late-stage reward package that changes the decision beyond buying the same three-omen ceiling.

### Output Variety Is Very Narrow

Severity: medium

Seeds: `audit:flat_escalating_trade:early:01` through `audit:flat_escalating_trade:early:10`, `audit:flat_escalating_trade:mid:01` through `audit:flat_escalating_trade:mid:10`, `audit:flat_escalating_trade:late:01` through `audit:flat_escalating_trade:late:10`

Stages: early, mid, late

Replay:

`npm run journey -- --seed audit:flat_escalating_trade:early:01 --stage early --shape flat_escalating_trade --debug --show-deck --no-color`

`npm run journey -- --seed audit:flat_escalating_trade:mid:01 --stage mid --shape flat_escalating_trade --debug --show-deck --no-color`

`npm run journey -- --seed audit:flat_escalating_trade:late:01 --stage late --shape flat_escalating_trade --debug --show-deck --no-color`

Generated options:

Across the 30 sampled journeys, each stage used only two numeric profiles:

- Early: `15/35/60` for 1/2/3 omens or `20/40/70` for 1/2/3 omens.
- Mid: `20/45/80` for 1/2/3 omens or `25/55/90` for 1/2/3 omens.
- Late: `30/60/95` for 1/2/3 omens or `35/70/110` for 1/2/3 omens.

Issue:

The text and reward family are identical in every sample, and the numeric profiles repeat heavily. This is easy to understand, but replayability is thin: once a player has seen the shape, future instances read as the same shop row with slightly different prices. The debug output also shows every sample using `Selected payload family: adapter`, which matches the narrow surface area seen in the generated options.

Recommendation:

Add more shape-local trade profiles or shape-local reward variants while keeping the flat escalating contract intact. Useful variants include essence-for-omens, essence-for-dreamwell progress, larger late-stage omen bundles, or stage-specific mixed rewards where the higher tier changes both amount and texture.

## Passing Observations

- All 30 generated journeys completed successfully with the forced shape, requested stage, `--debug`, `--show-deck`, and `--no-color`.
- The grammar is clean in every sample: singular `omen` and plural `omens` are rendered correctly, punctuation is consistent, and the text does not expose IDs, placeholders, malformed names, or implementation terms.
- The construction matches the shape contract. Each journey is a flat three-option direct menu, each option has one visible immediate essence cost, each option grants omens immediately, costs strictly increase, rewards strictly increase, and the debug symmetry contract records the shared essence-for-omens family.
- The options are legal in the shown contexts. Every sampled option is payable from the visible essence total for that stage, including the largest early option.
- The shape is readable at a glance. Costs read as costs, rewards read as rewards, and the menu does not require hidden timing, random resolution, or target-specific context to understand the action.
