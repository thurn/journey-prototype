# Mid Stage Dream Journey Duplicate Analysis

Generated with `npm run journey -- --stage mid --count 100 --seed mid-duplicate-analysis-2026-05-08 --json`.

Definitions:

- Identical journey: same shape and same ordered visible choice text. Tree branches are counted as choices for tree-shaped Journeys.
- Visible choices: regular option text plus decision-tree branch text.
- Repeated choice: same visible choice text appearing more than once across all 100 Journeys.
- Structurally unique ignoring numeric differences: same as identical journey, but numeric literals in visible choice text are replaced with `<n>` before comparing.

Results:

- Journeys: 100
- Visible choices counted: 327
- Identical journey duplicate groups: 0
- Identical journey duplicate instances beyond first occurrence: 0
- Unique exact journeys: 100
- Distinct repeated choice texts: 41
- Repeated choice occurrences: 159
- Repeated choice instances beyond first occurrence: 118
- Unique choice texts: 209
- Structurally unique journeys ignoring numeric differences: 98
- Numeric-normalized duplicate journey groups: 2
- Numeric-normalized duplicate instances beyond first occurrence: 2

Most repeated choice texts:

- 25x: Leave.
- 14x: Gain 5 omens.
- 11x: Purge up to 1 chosen Starter card. Gain 4 omens.
- 6x: Gain 340 essence.
- 6x: Leave the cache.
- 5x: Choose 1 of 3 Dreamsigns.
- 5x: Gain 300 essence.
- 5x: Leave with no effect.
- 4x: Add Reclaim 1 to a chosen card.
- 4x: Draft 1 of 4 events. End the Journey.
- 4x: Keep the last safe reward. End the Journey.
- 4x: Reduce the cost of a chosen card by 1.
- 3x: Add "Foresee 1" to a chosen card.
- 3x: Apply {Bronze Transfiguration} to a chosen card.
- 3x: Apply {Golden Transfiguration} to a chosen card.

Numeric-normalized duplicate journey groups:

- 2x random_pool_draws: #36, #51
  Pattern: Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. End the Journey.
- 2x random_pool_draws: #52, #81
  Pattern: Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. End the Journey.

Notes:

- The 100 mid-stage samples produced no exact duplicate Journeys by visible text and shape.
- Numeric-normalized duplication was isolated to `random_pool_draws`; those repeats differ by essence amount and level number, not by visible branch structure.
- Choice-level repetition is concentrated in generic exits and common reward phrases. `Leave.`, `Gain 5 omens.`, and `Purge up to 1 chosen Starter card. Gain 4 omens.` account for 50 of the 159 repeated choice occurrences.
