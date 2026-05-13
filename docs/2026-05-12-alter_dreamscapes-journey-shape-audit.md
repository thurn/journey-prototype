# `alter_dreamscapes` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `alter_dreamscapes`
- Stages: early, mid, late
- Audit seeds: `audit:alter_dreamscapes:<stage>:01` through `audit:alter_dreamscapes:<stage>:10`
- Command template: `npm run journey -- --seed audit:alter_dreamscapes:<stage>:NN --stage <stage> --shape alter_dreamscapes --debug --show-deck --no-color`

## Findings

### Option Prefixes Expose Symbol Markers

Severity: high

Seed: `audit:alter_dreamscapes:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:early:01 --stage early --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> Add a Transfiguration site to the next dreamscape you visit`
2. `> Add a Specialty Shop site to this dreamscape`
3. `> Replace a Dream Journey site in this dreamscape with a Transfiguration site`

Seed: `audit:alter_dreamscapes:mid:04`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:mid:04 --stage mid --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> Add a Shop site to this dreamscape`
2. `> Add a Dreamsign Offering site to the next dreamscape you visit`
3. `> Replace a Shop site in this dreamscape with a Specialty Shop site`

Seed: `audit:alter_dreamscapes:late:08`
Stage: `late`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:late:08 --stage late --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> 50% higher chance to see Duplication sites in future dreamscapes`
2. `> Add a Transfiguration site to the next dreamscape you visit`
3. `> Replace a Dreamsign Offering site in this dreamscape with an Essence site`

Issue:

Every sampled option begins with the raw route symbol marker `>`. This reads as
debug notation in the player-facing Journey text. The shape is a route-edit
menu, so the route concept is already clear from the action text.

Recommendation:

Render root option symbols through a player-facing presentation layer, or omit
the symbol marker from plain-text Journey output. Keep the semantic symbol data
in the manifest and debug output.

### Same-Site Add Choices Create Dominated Timing Decisions

Severity: medium

Seed: `audit:alter_dreamscapes:mid:09`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:mid:09 --stage mid --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> Add a Dreamsign Draft site to the next dreamscape you visit`
2. `> Add a Dreamsign Draft site to this dreamscape`
3. `> 10% higher chance to see Shop sites in future dreamscapes`

Seed: `audit:alter_dreamscapes:late:01`
Stage: `late`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:late:01 --stage late --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> Add a Dreamsign Draft site to this dreamscape`
2. `> Add a Dreamsign Draft site to the next dreamscape you visit`
3. `> Replace a Dreamsign Offering site in this dreamscape with a Shop site`

Issue:

When the same site type appears in both an immediate add and a next-dreamscape
add, the immediate option is stronger and clearer. In both examples the player
is choosing timing for the same reward with no visible cost, and debug values
score the current-dreamscape version at `+100` converted essence versus `+75`
for the next-dreamscape version.

Recommendation:

Keep same-site add choices out of the same offer, or add a visible tradeoff that
makes delayed timing strategically distinct. For this shape, prefer three route
edits that differ by site type, scope, and tactical purpose.

### Replacement Rows Are Too Weak Beside Other Zero-Cost Route Rewards

Severity: medium

Seed: `audit:alter_dreamscapes:early:02`
Stage: `early`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:early:02 --stage early --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> 10% higher chance to see Shop sites in future dreamscapes`
2. `> Replace a Dreamsign Draft site in this dreamscape with an Essence site`
3. `> Add a Specialty Shop site to this dreamscape`

Seed: `audit:alter_dreamscapes:mid:10`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:mid:10 --stage mid --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> Replace a Dreamsign Draft site in this dreamscape with a Duplication site`
2. `> Add a Shop site to this dreamscape`
3. `> 40% higher chance to see Duplication sites in future dreamscapes`

Seed: `audit:alter_dreamscapes:late:08`
Stage: `late`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:late:08 --stage late --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> 50% higher chance to see Duplication sites in future dreamscapes`
2. `> Add a Transfiguration site to the next dreamscape you visit`
3. `> Replace a Dreamsign Offering site in this dreamscape with an Essence site`

Issue:

Replacement rows are consistently valued at `+35` converted essence, while
current-dreamscape adds are `+100`, next-dreamscape adds are `+75`, and sampled
future site boosts reach `+156.25` or `+187.5`. The result is a zero-cost menu
where replacement rows often read as the low-impact fallback rather than a
credible route-shaping choice.

Recommendation:

Apply a value-band check for `alter_dreamscapes` offers, or reserve replacement
rows for cases where the destination site is a clear upgrade over the source
site. A replacement option should have enough contextual value to compete with
adding a site outright.

### Future Site Boosts Need Explicit Duration

Severity: medium

Seed: `audit:alter_dreamscapes:early:06`
Stage: `early`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:early:06 --stage early --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> Add a Purge site to the next dreamscape you visit`
2. `> 40% higher chance to see Duplication sites in future dreamscapes`
3. `> Add a Dreamsign Offering site to this dreamscape`

Seed: `audit:alter_dreamscapes:late:04`
Stage: `late`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:late:04 --stage late --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> Add a Duplication site to this dreamscape`
2. `> Replace a Purge site in this dreamscape with an Essence site`
3. `> 50% higher chance to see Duplication sites in future dreamscapes`

Seed: `audit:alter_dreamscapes:late:10`
Stage: `late`
Replay:
`npm run journey -- --seed audit:alter_dreamscapes:late:10 --stage late --shape alter_dreamscapes --debug --show-deck --no-color`

Generated options:

1. `> 20% higher chance to see Essence sites in future dreamscapes`
2. `> Replace an Essence site in this dreamscape with a Shop site`
3. `> Add a Specialty Shop site to the next dreamscape you visit`

Issue:

Future site boosts state a percentage and site type, but they do not say how
long the boost lasts. "Future dreamscapes" can read as a permanent atlas rule,
while the intended strategic decision needs a concrete duration window. The
debug metadata also reports `timing=route:future_dreamscapes` without a
duration count.

Recommendation:

Render a concrete duration, such as the next N dreamscapes, and include matching
duration metadata in the route effect. Tune boost values against that explicit
window so high-percent boosts remain comparable with immediate site additions.

## Passing Observations

- All 30 forced-shape replay commands completed successfully.
- Each sampled journey produced exactly three root options.
- Every sampled option was a coherent route-edit action involving a site add,
  site replacement, or site appearance boost.
- No sampled option exposed placeholder IDs, malformed object names, or invalid
  capitalization.
- Site names used project vocabulary consistently: Dreamsign Draft, Dreamsign
  Offering, Specialty Shop, Transfiguration, Duplication, Purge, Essence, Shop,
  and Dream Journey.

## Verification

`npm run journey -- --seed audit:alter_dreamscapes:early:01 --stage early --shape alter_dreamscapes --debug --show-deck --no-color`

The verification command completed successfully, and the replay commands in
this report match the command format used for generation.
