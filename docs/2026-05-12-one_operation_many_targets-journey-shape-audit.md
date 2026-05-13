# `one_operation_many_targets` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `one_operation_many_targets`
- Stages: early, mid, late
- Audit seeds: `audit:one_operation_many_targets:<stage>:01` through `audit:one_operation_many_targets:<stage>:10`
- Command template: `npm run journey -- --seed audit:one_operation_many_targets:<stage>:NN --stage <stage> --shape one_operation_many_targets --debug --show-deck --no-color`

## Current Verification

### Late Offers Use Stage-Appropriate Value

Status: verified

Seed: `audit:one_operation_many_targets:late:02`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:02 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Transform up to 2 chosen Survivors into random Survivors`
2. `* Transform up to 2 chosen cards with spark 4 or more into random cards with spark 4 or more`
3. `* Transform up to 2 chosen cards with cost 4 or more into random cards with cost 4 or more`

Observation:

Late-stage forced-shape offers use reward templates with at least 60 converted essence available across their targets. Single-target maintenance templates are stage-scoped to early and mid offers.

### Compound Reward Pairs Vary By Seed And Stage

Status: verified

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:early:09 --stage early --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Nightmare Manifest'. Gain 'Flower Petals'`
2. `* Gain 'Looming Oracle'. Gain 'White Rat'`
3. `* Gain 'Ridge Vortex Explorer'. Gain 'Pyramid Relic'`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:mid:10 --stage mid --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Celestial Reverie'. Gain 'Black Horn'`
2. `* Gain 'Fell the Mighty'. Gain 'Eyeball Plant'`
3. `* Gain 'Curio Dealer'. Gain 'Red Shard'`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:05 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Infernal Cavalier'. Gain 'Charm Staff'`
2. `* Gain 'Vortex Claimant'. Gain 'Purple Crystal'`
3. `* Gain 'Scrapyard Custodian'. Gain 'Gold Feather'`

Observation:

Compound card-plus-Dreamsign targets come from seeded card and Dreamsign pools. Card pools prefer stage-appropriate rarity bands before pairing.

### Human Output Uses Player-Facing Glyphs

Status: verified

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:early:01 --stage early --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Add Reclaim 2 to 'Wellspring'`
2. `* Add Reclaim 2 to 'Warfield Stalwart'`
3. `* Add Reclaim 2 to 'Crimson Pilgrimage'`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:mid:02 --stage mid --shape one_operation_many_targets --no-color`

Generated options:

1. `> Add a Specialty Shop site to this dreamscape`
2. `> Add a Transfiguration site to this dreamscape`
3. `> Add a Shop site to this dreamscape`

Observation:

Human output renders player-facing glyphs before the action sentence. Structured symbols remain available in JSON output.

### Singular Count Grammar Is Count-Aware

Status: verified

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:grammar:18 --stage early --shape one_operation_many_targets --no-color`

Generated options:

1. `* Modify 1 random card to become Survivors`
2. `* Modify 1 random card to become Warriors`
3. `* Modify 1 random card to become Spirit Animals`

Observation:

The random card type-change template renders singular and plural card nouns from the selected count.

## Passing Observations

- Forced-shape replay commands complete successfully.
- Each sampled offer produces exactly three root options.
- Debug metadata records a `shared_axis_rotated_attribute` symmetry contract for each sampled offer.
- Target selectors resolve to concrete cards, Dreamsigns, predicates, dreamwell cards, or site types with structured target metadata.
