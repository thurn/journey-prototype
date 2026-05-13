# `paired_return` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `paired_return`
- Stages: early, mid, late
- Seeds: `audit:paired_return:<stage>:01` through `audit:paired_return:<stage>:10`
- Command template: `npm run journey -- --seed audit:paired_return:<stage>:NN --stage <stage> --shape paired_return --debug --show-deck --no-color`

## Findings

### Future-Trade Text Uses Fragmented Callback Grammar

Severity: medium

Seeds:

- `audit:paired_return:early:01`
- `audit:paired_return:late:01`

Replay:
`npm run journey -- --seed audit:paired_return:early:01 --stage early --shape paired_return --debug --show-deck --no-color`

Generated options:

1. Gain {Berries}. at the next future shop, trade it for gain 120 essence; discard the hook if the window expires.
2. Gain {Leather Satchel}. at the next Dream Journey site, trade it for duplicate a chosen card; discard the hook if the window expires.
3. Gain {Spotted Mug}. after 2 battles, trade it for add a Purge site to the current dreamscape; discard the hook if the window expires.

Issue:
The callback sentence starts with a lower-case trigger after a period, and the return clause reads as `trade it for gain`, `trade it for duplicate`, or `trade it for add`. The option still conveys the contract, but the player-facing text reads like two fragments spliced together.

Recommendation:
Render the future-trade option as one grammatical callback sentence. The trigger phrase should be sentence-cased after the initial gain sentence, and the reward clause should use an infinitive action such as `trade it to gain`, `trade it to duplicate`, or `trade it to add`.

## Passing Observations

- All 30 sampled journeys generated successfully.
- Every sample produced three visible root options and three paired-return precommit records.
- Paired-return metadata consistently linked the created hook object or ticket to the future return scene.
- Generated options avoided duplicate menus, placeholder IDs, malformed names, and `undefined`.
- Borrowed Dreamsign and borrowed card-draft samples used clear duration, return-cost, and cleanup text.
- Sampled option values stayed close enough for meaningful choice pressure; the largest observed net spread was 103 converted essence.

## Verification

Sanity replay:
`npm run journey -- --seed audit:paired_return:early:01 --stage early --shape paired_return --debug --show-deck --no-color`

The replay command succeeds and matches the command format used for the audited examples.
