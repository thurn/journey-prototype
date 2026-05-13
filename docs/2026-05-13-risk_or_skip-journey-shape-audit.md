# `risk_or_skip` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `risk_or_skip`
- Stages: early, mid, late
- Seeds: `audit:risk_or_skip:<stage>:01` through `audit:risk_or_skip:<stage>:10`
- Command template: `npm run journey -- --seed audit:risk_or_skip:<stage>:NN --stage <stage> --shape risk_or_skip --debug --show-deck --no-color`

## Findings

### Accept Dominates Skip By Expected Value

Severity: high

Seeds: `audit:risk_or_skip:early:01`, `audit:risk_or_skip:mid:01`, `audit:risk_or_skip:late:07`

Stages: early, mid, late

Replay:
`npm run journey -- --seed audit:risk_or_skip:early:01 --stage early --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:mid:01 --stage mid --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:late:07 --stage late --shape risk_or_skip --debug --show-deck --no-color`

Generated options:

1. `early:01`: `Gain {Red Pin}. 75% chance to gain 1 Nightmare; otherwise no downside.`
2. `mid:01`: `Gain {Carved Bone}. 75% chance to gain 1 Oblivion; otherwise no downside.`
3. `late:07`: `Gain {Dragon Egg}. 50% chance to pay 40 random essence; otherwise no downside.`
4. Each paired skip option: `Leave with no effect.`

Issue:
The accept option has positive expected net value in all 30 audited journeys. The observed nets range from +36 to +145 converted essence, while the skip option is always 0. The choice often reads as a priced reward rather than a meaningful risk-or-skip decision, because the model valuation says taking the risk is always profitable.

Recommendation:
Give the risk side enough downside variance for some offers to sit near or below 0 expected net, especially for high-odds Banes and high-odds purge outcomes. Keep some favorable offers, but include a stage-appropriate band where skipping is strategically reasonable.

### Stage Scaling Is Flat

Severity: medium

Seeds: `audit:risk_or_skip:early:06`, `audit:risk_or_skip:mid:06`, `audit:risk_or_skip:late:03`

Stages: early, mid, late

Replay:
`npm run journey -- --seed audit:risk_or_skip:early:06 --stage early --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:mid:06 --stage mid --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:late:03 --stage late --shape risk_or_skip --debug --show-deck --no-color`

Generated options:

1. `early:06`: `Gain {Storm Tome}. 25% chance to gain 1 Nightmare; otherwise no downside.`
2. `mid:06`: `Gain {Trinket Necklace}. 25% chance to gain 1 Betrayal; otherwise no downside.`
3. `late:03`: `Gain {Green Slime}. 35% chance to gain 1 Doubt; otherwise no downside.`

Issue:
The reward frame is effectively the same across stages: one named Dreamsign with a value of +145 or +165 converted essence. The downside odds also draw from the same 25, 35, 45, 50, 65, and 75 percent band at every stage. Late-stage offers therefore feel like early-stage offers presented with a larger deck and more active Dreamsigns.

Recommendation:
Use stage-sensitive reward and downside bands. Early offers can stay compact, mid offers should create sharper tradeoffs around established resources, and late offers should either increase reward stakes or attach late-relevant downsides that match a nearly complete run.

### Fixed Essence Costs Use Confusing Text

Severity: medium

Seeds: `audit:risk_or_skip:mid:02`, `audit:risk_or_skip:mid:08`, `audit:risk_or_skip:late:07`

Stages: mid, late

Replay:
`npm run journey -- --seed audit:risk_or_skip:mid:02 --stage mid --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:mid:08 --stage mid --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:late:07 --stage late --shape risk_or_skip --debug --show-deck --no-color`

Generated options:

1. `mid:02`: `Gain {Serpent Manual}. 25% chance to pay 44 random essence; otherwise no downside.`
2. `mid:08`: `Gain {Amanita}. 75% chance to pay 52 random essence; otherwise no downside.`
3. `late:07`: `Gain {Dragon Egg}. 50% chance to pay 40 random essence; otherwise no downside.`

Issue:
The phrase `pay 44 random essence` implies the amount may be random, but the generated option already names a fixed amount and the random part is whether the downside happens. This wording makes the precommitted random envelope harder to understand at the player-facing layer.

Recommendation:
Render essence downsides as `25% chance to pay 44 essence; otherwise no downside.` Keep `random` for hidden target selection such as a random card or a random Dreamsign.

### Debug Summary Hides Cost Details For Cost Envelopes

Severity: low

Seeds: `audit:risk_or_skip:early:04`, `audit:risk_or_skip:mid:08`, `audit:risk_or_skip:late:02`

Stages: early, mid, late

Replay:
`npm run journey -- --seed audit:risk_or_skip:early:04 --stage early --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:mid:08 --stage mid --shape risk_or_skip --debug --show-deck --no-color`

Replay:
`npm run journey -- --seed audit:risk_or_skip:late:02 --stage late --shape risk_or_skip --debug --show-deck --no-color`

Generated options:

1. `early:04`: `Gain {Rope Doll}. 45% chance to purge a random card; otherwise no downside.`
2. `mid:08`: `Gain {Amanita}. 75% chance to pay 52 random essence; otherwise no downside.`
3. `late:02`: `Gain {Silver Key}. 75% chance to purge a random card; otherwise no downside.`

Issue:
The debug precommitted summary prints cost envelopes as `chance to pay cost`, while Bane envelopes print the concrete Bane name and count. The concrete cost is visible in the option text, but the debug random-envelope line is less useful for auditing target legality and downside severity.

Recommendation:
Include the rendered cost payload in the precommitted random summary for `chance_to_pay_cost`, such as `75% chance to pay 52 essence` or `45% chance to purge a random card`.

### Replay Variety Relies Mostly On Dreamsign Names

Severity: low

Seeds: `audit:risk_or_skip:early:01` through `audit:risk_or_skip:late:10`

Stages: early, mid, late

Replay:
`npm run journey -- --seed audit:risk_or_skip:late:10 --stage late --shape risk_or_skip --debug --show-deck --no-color`

Generated options:

1. `late:10`: `Gain {Theater Mask}. 45% chance to gain 1 Oblivion; otherwise no downside.`
2. Pattern across the audit: `Gain {Dreamsign}. <odds>% chance to <one downside>; otherwise no downside.`

Issue:
All 30 audited offers use the same player-facing construction: gain one named Dreamsign, then accept one bounded random downside or leave. The changing Dreamsign names, Bane names, odds, and downside types create legality coverage, but repeated play reads as one template.

Recommendation:
Add a small set of shape-local reward frames that still preserve the single accept plus leave topology, such as Dreamsign gain plus omens, card draft plus omens, or a larger essence reward. Gate each frame through the same bounded-downside contract.

## Passing Observations

- All 30 requested forced journeys generated successfully.
- Every audited journey produced exactly one accept option and one skip option.
- The skip option consistently used leave behavior and had 0 converted essence.
- Each accept option exposed visible downside odds and a safe alternative in player-facing text.
- Each audited manifest included one precommitted random envelope with a risk-or-skip shape invariant.
- Random Dreamsign purge examples had active Dreamsigns available in the shown state.
- Random card purge examples had non-empty decks in the shown state.
- The shown target metadata resolved named Dreamsign rewards to exactly one catalog candidate.
- Grammar is generally clean for Bane, card purge, Dreamsign purge, and skip text.
