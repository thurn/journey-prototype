# `heterogeneous_pair` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `heterogeneous_pair`
- Stages: early, mid, late
- Audit seeds: `audit:heterogeneous_pair:<stage>:01` through `audit:heterogeneous_pair:<stage>:10`
- Command template: `npm run journey -- --seed audit:heterogeneous_pair:<stage>:NN --stage <stage> --shape heterogeneous_pair --debug --show-deck --no-color`

## Findings

### Option Prefixes Expose Symbol Markers

Severity: high

Seed: `audit:heterogeneous_pair:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:early:01 --stage early --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Transform 'Flashpoint Detonation' into 'Fenlight Expedition'`
2. `* Replace a chosen starter card with 1 of 4 drafted cards`

Seed: `audit:heterogeneous_pair:mid:01`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:mid:01 --stage mid --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Apply Magenta to 'Key Sifter'`
2. `> Replace a Dream Journey site in this dreamscape with a Specialty Shop site`

Seed: `audit:heterogeneous_pair:late:02`
Stage: `late`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:late:02 --stage late --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Draft 1 of 4 Warriors`
2. `> Add a Transfiguration site to this dreamscape`

Issue:

Every sampled option begins with a raw symbol marker such as `*` or `>`. These
markers read like internal notation rather than player-facing option text. The
shape asks the player to compare two different reward axes, so each option
should begin with the actual action, reward, or route effect.

Recommendation:

Render root option symbols through a player-facing presentation layer, or omit
the symbol marker from plain-text Journey output. Keep the semantic symbol data
in the manifest and debug output where it helps validation.

### Card-Focused Pairs Need Stronger Player-Visible Separation

Severity: medium

Seed: `audit:heterogeneous_pair:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:early:01 --stage early --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Transform 'Flashpoint Detonation' into 'Fenlight Expedition'`
2. `* Replace a chosen starter card with 1 of 4 drafted cards`

Seed: `audit:heterogeneous_pair:mid:06`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:mid:06 --stage mid --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Apply Scarlet to 3 chosen Warriors`
2. `* Draft 1 of 4 Warriors and apply Prismatic to it`

Seed: `audit:heterogeneous_pair:mid:04`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:mid:04 --stage mid --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Add Reclaim 2 to 'Path to Redemption'`
2. `* Replace a chosen starter card with 1 of 4 drafted cards`

Issue:

The shape definition promises two intentionally different options that operate
on different axes. Several sampled offers satisfy the internal axis symbols but
still read as two versions of deck surgery. In `mid:06`, both options are
Warrior-focused card development with transfiguration upside. In `early:01` and
`mid:04`, both rows are card replacement or card upgrade decisions. These pairs
are coherent, but the heterogeneous contrast is softer than the shape name and
definition imply.

Recommendation:

Add a player-visible diversity check after reward pairing. Treat target class,
operation family, and resulting object type as part of the separation rule, not
only the broad internal reward axis. Prefer pairings such as card cleanup versus
route, Dreamsign versus resource, shop versus deck improvement, or starter
repair versus omens.

### Late-Stage Offers Need Larger Strategic Impact

Severity: medium

Seed: `audit:heterogeneous_pair:late:07`
Stage: `late`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:late:07 --stage late --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Draw 3 cards from your deck and duplicate one of them of your choice`
2. `* Transform a chosen dreamsign into 'Serpent Manual'`

Seed: `audit:heterogeneous_pair:late:08`
Stage: `late`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:late:08 --stage late --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Petal-Seer'`
2. `* Cards with a 'judgment' ability cost 1 less for the next 3 battles`

Seed: `audit:heterogeneous_pair:late:10`
Stage: `late`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:late:10 --stage late --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Draw 3 cards from your deck and duplicate one of them of your choice`
2. `> Replace a Dreamsign Offering site in this dreamscape with a Specialty Shop site`

Issue:

Late-stage samples often pair rewards valued around 35 to 48 converted essence.
That keeps the pair internally comparable, but the resulting offer can feel
small for a late Journey. A single named-card gain, a three-battle cost discount
for one ability family, or one route replacement may have limited strategic
weight in a 35-card late deck with five active Dreamsigns.

Recommendation:

Apply a stage-aware minimum impact floor before accepting a heterogeneous pair.
For late offers, prefer durable upgrades, higher-agency drafts, multi-card
effects, meaningful Dreamsign decisions, or route changes with clear late-run
leverage.

### Dreamsign Transform Can Offer an Active Destination

Severity: low

Seed: `audit:heterogeneous_pair:mid:09`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:heterogeneous_pair:mid:09 --stage mid --shape heterogeneous_pair --debug --show-deck --no-color`

Generated options:

1. `* Draft 1 of 4 cards with a 'dissolve' ability and apply Golden to it`
2. `* Transform a chosen dreamsign into 'Purple Potion'. Your opening hand contains 'Skyline Prowler' for the next 3 battles`

Issue:

The active Dreamsigns are Purple Potion, Spider Jar, and Wolf Sigil. The second
option offers to transform a chosen Dreamsign into Purple Potion while Purple
Potion is already active. If duplicate Dreamsigns are valuable, the text should
make that outcome explicit. If the transform is intended to change the active
Dreamsign mix, the destination pool should exclude currently active
Dreamsigns.

Recommendation:

Filter named Dreamsign transform destinations against active Dreamsigns, or
render duplicate-friendly text that explains the player is gaining a second
copy of the named Dreamsign.

## Passing Observations

- All 30 forced-shape replay commands completed successfully.
- Each sampled journey produced exactly two root options.
- Every sampled option had zero converted essence cost and positive converted
  essence effect value.
- The generated pairs stayed within a close converted-essence band.
- The samples covered card gains, card improvement, starter replacement,
  Dreamsign changes, resource rewards, shop discounts, and route effects.
- No sampled option exposed placeholder IDs, malformed object names, or invalid
  capitalization outside the option symbol prefixes.

## Verification

`npm run journey -- --seed audit:heterogeneous_pair:early:01 --stage early --shape heterogeneous_pair --debug --show-deck --no-color`

The verification command completed successfully, and the replay commands in
this report match the command format used for generation.
