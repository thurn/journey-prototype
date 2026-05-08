# Early Stage Dream Journey Duplicate Analysis

Generated with `npm run journey -- --stage early --count 100 --seed early-duplicate-analysis-2026-05-08 --json`.

Definitions:

- Identical journey: same shape and same ordered visible choice text. Tree branches are counted as choices for tree-shaped Journeys.
- Repeated choice: same visible choice text appearing more than once across all 100 Journeys.
- Structurally unique ignoring numeric differences: same as identical journey, but numeric literals in visible choice text are replaced with `<n>` before comparing.

Results:

- Journeys: 100
- Visible choices counted: 351
- Identical journey duplicate groups: 0
- Identical journey duplicate instances beyond first occurrence: 0
- Unique exact journeys: 100
- Distinct repeated choice texts: 40
- Repeated choice occurrences: 180
- Repeated choice instances beyond first occurrence: 140
- Unique choice texts: 211
- Structurally unique journeys ignoring numeric differences: 98
- Numeric-normalized duplicate journey groups: 2
- Numeric-normalized duplicate instances beyond first occurrence: 2

Most repeated choice texts:

- 37x: Leave.
- 11x: Purge up to 1 chosen Starter card. Gain 4 omens.
- 9x: Gain 5 omens.
- 8x: Leave with no effect.
- 6x: Choose 1 of 2 Dreamsigns.
- 6x: Draft 1 of 4 events. Gain 4 omens.
- 5x: Gain 320 essence.
- 5x: Reduce the cost of a chosen card by 1.
- 4x: Apply {Viridian Transfiguration} to a chosen card.
- 4x: Choose 1 of 3 Dreamsigns. End the Journey.
- 4x: Draft 1 of 4 Reclaim events. Gain 4 omens.
- 4x: End the Journey.
- 4x: Gain 110 essence. End the Journey.
- 4x: Gain 300 essence.
- 4x: Go to Level 2.

Numeric-normalized duplicate journey groups:

- 2x random_pool_draws: #48, #60
  Pattern: Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. Go to Level <n>. | Leave. | Pay <n> essence and gain a random reward from the pool. End the Journey.
- 2x probability_ladder: #13, #51
  Pattern: Leave. | Pay <n> essence for a <n>% chance to gain <n> essence. | Gain <n> essence. End the Journey. | Go to Level <n>. | Leave. | Pay <n> essence for a <n>% chance to gain <n> essence. | Gain <n> essence. End the Journey. | Go to Level <n>. | Leave. | Pay <n> essence for a <n>% chance to gain <n> essence. | Gain <n> essence. End the Journey. | End the Journey.

