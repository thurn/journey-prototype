# `one_operation_many_targets` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `one_operation_many_targets`
- Stages: early, mid, late
- Seeds: `audit:one_operation_many_targets:<stage>:01` through `audit:one_operation_many_targets:<stage>:10`
- Command template: `npm run journey -- --seed audit:one_operation_many_targets:<stage>:NN --stage <stage> --shape one_operation_many_targets --debug --show-deck --no-color`

## Findings

### Late Offers Include Low-Impact Maintenance Rewards

Severity: medium

Seeds:

- `audit:one_operation_many_targets:late:02`
- `audit:one_operation_many_targets:late:04`
- `audit:one_operation_many_targets:late:09`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:02 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* card Modify 1 random cards to become Survivors`
2. `* card Modify 1 random cards to become Spirit Animals`
3. `* card Modify 1 random cards to become Warriors`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:04 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* card Your opening hand contains 'Nomad of Endless Paths' for the next 3 battles`
2. `* card Your opening hand contains 'Tidecaller' for the next 3 battles`
3. `* card Your opening hand contains 'Fleeting Reunion' for the next 3 battles`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:09 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* card Apply Viridian to 'Fragments of Vision'`
2. `* card Apply Viridian to 'Fathomscourge'`
3. `* card Apply Viridian to 'Key Sifter'`

Issue:

Late-stage one-operation menus can be narrow maintenance rewards. In a 35-card late deck at 400/500 essence, modifying one random card's type, applying one transfiguration, or guaranteeing one card for three battles often reads like tuning rather than a late Journey reward. The debug values for these examples are +20, +36, and +32 converted essence, which is far below late Dreamsign-copy rewards sampled in the same audit at +240 converted essence.

Recommendation:

Stage-gate or scale low-impact templates. Late versions should increase count, apply to chosen rather than random targets, affect all matching targets, add a second reward, or be limited to cards with high deck relevance. Keep single-card maintenance templates primarily in early and mid stages unless the target is proven important in the shown deck context.

### Compound Reward Pairs Repeat Across Stages

Severity: medium

Seeds:

- `audit:one_operation_many_targets:early:09`
- `audit:one_operation_many_targets:mid:10`
- `audit:one_operation_many_targets:late:05`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:early:09 --stage early --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Beacon of Tomorrow'. Gain 'Amanita'`
2. `* Gain 'Titan of Forgotten Echoes'. Gain 'Algae'`
3. `* Gain 'Scrap Reclaimer'. Gain 'Amber Eye'`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:mid:10 --stage mid --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Titan of Forgotten Echoes'. Gain 'Algae'`
2. `* Gain 'Beacon of Tomorrow'. Gain 'Amanita'`
3. `* Gain 'Scrap Reclaimer'. Gain 'Amber Eye'`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:05 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Beacon of Tomorrow'. Gain 'Amanita'`
2. `* Gain 'Scrap Reclaimer'. Gain 'Amber Eye'`
3. `* Gain 'Titan of Forgotten Echoes'. Gain 'Algae'`

Issue:

The same three card-plus-Dreamsign pairs recur in early, mid, and late samples. Only the option order changes. The offer feels stale when the same template appears again because the pair pool appears anchored to the first catalog entries rather than the quest, deck, stage, or seed.

Recommendation:

Build compound reward pairs from a seeded, context-aware pool. Shuffle eligible cards and Dreamsigns before pairing, prefer stage-appropriate card bands, and use active Dreamsigns, deck predicates, or quest tags to increase relevance. Avoid presenting the same fixed three pairs as the full target space for this shape.

### Player-Facing Lines Expose Symbol Labels

Severity: medium

Seeds:

- `audit:one_operation_many_targets:early:01`
- `audit:one_operation_many_targets:early:02`
- `audit:one_operation_many_targets:late:06`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:early:01 --stage early --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* card Add Reclaim 2 to 'Wellspring'`
2. `* card Add Reclaim 2 to 'Warfield Stalwart'`
3. `* card Add Reclaim 2 to 'Crimson Pilgrimage'`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:early:02 --stage early --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* dreamwell Shuffle 3 'Wellspring' copies into your dreamwell`
2. `* dreamwell Shuffle 3 'Echo of Dawn' copies into your dreamwell`
3. `* dreamwell Shuffle 3 'Lantern' copies into your dreamwell`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:06 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* dreamsign Gain a copy of 'Skull Codex'`
2. `* dreamsign Gain a copy of 'Skull Pendant'`
3. `* dreamsign Gain a copy of 'Spice Blossoms'`

Issue:

Every sampled option begins with a symbol label such as `card`, `dreamwell`, or `dreamsign`. These labels read like internal tags placed before the action sentence. They also make otherwise clean reward text harder to scan in a direct menu.

Recommendation:

Render symbols separately from the option sentence in the CLI output. The sentence should begin with the player action: `Add Reclaim 2 to 'Wellspring'`, `Shuffle 3 'Wellspring' copies into your dreamwell`, or `Gain a copy of 'Skull Codex'`.

### Singular Count Grammar Needs Template Handling

Severity: low

Seed: `audit:one_operation_many_targets:late:02`

Stage: `late`

Replay:

`npm run journey -- --seed audit:one_operation_many_targets:late:02 --stage late --shape one_operation_many_targets --debug --show-deck --no-color`

Generated options:

1. `* card Modify 1 random cards to become Survivors`
2. `* card Modify 1 random cards to become Spirit Animals`
3. `* card Modify 1 random cards to become Warriors`

Issue:

The template uses plural `cards` when the count is 1. This is a small grammar issue, but it is prominent because all three options repeat the same phrase.

Recommendation:

Use count-aware noun rendering for `modify_random_cards_to_types`: `Modify 1 random card...` and `Modify N random cards...`.

## Passing Observations

- All 30 forced-shape generations completed successfully.
- Each sampled offer produced exactly three root options.
- Debug metadata recorded a `shared_axis_rotated_attribute` symmetry contract for every sample.
- Target selectors resolved to concrete cards, Dreamsigns, predicates, dreamwell cards, or site types with structured target metadata.
- Early dreamwell and starter-cleanup samples were coherent for early-stage deck shaping.
