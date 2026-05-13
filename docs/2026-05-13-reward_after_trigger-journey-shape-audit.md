# `reward_after_trigger` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `reward_after_trigger`
- Stages: early, mid, late
- Seeds: `audit:reward_after_trigger:<stage>:01` through `audit:reward_after_trigger:<stage>:10`
- Command template: `npm run journey -- --seed audit:reward_after_trigger:<stage>:NN --stage <stage> --shape reward_after_trigger --debug --show-deck --no-color`

## Findings

### A Forced Seed Fails Validation

Severity: high

Seed: `audit:reward_after_trigger:late:07`
Stage: `late`
Replay:
`npm run journey -- --seed audit:reward_after_trigger:late:07 --stage late --shape reward_after_trigger --debug --show-deck --no-color`

Generated output:

```text
Error: Forced shape reward_after_trigger failed validation: Card-play and card-addition hooks require a named card reference (shape: reward_after_trigger; payload: adapter/current; target: none; rule: invalid_hook_trigger)
```

Issue:
The shape can select a delayed hook whose trigger requires a named card reference while the trigger selector has no named target. The generator rejects the manifest, so the shape cannot produce a Journey for this seed.

Recommendation:
Filter expanded delayed-hook candidates before pair selection. Named-card play and card-added triggers should only be eligible when the trigger selector carries a card ID or card name.

### Site-Visit Pair Can Duplicate Both Options

Severity: high

Seeds:

- `audit:reward_after_trigger:early:03`
- `audit:reward_after_trigger:early:06`
- `audit:reward_after_trigger:late:02`

Replay:
`npm run journey -- --seed audit:reward_after_trigger:early:03 --stage early --shape reward_after_trigger --debug --show-deck --no-color`

Generated options:

1. After you visit a {Purge} site, gain {Eyeball Plant}.
2. After you visit a {Purge} site, gain {Eyeball Plant}.

Issue:
The menu can present two identical delayed rewards. The shared trigger and identical payoff remove the decision entirely.

Recommendation:
Deduplicate selected hook candidates by player-facing text or by trigger-plus-resolution key before building the two options. When the preferred hook family has fewer than two distinct hooks, fill the pair from the broader legal candidate pool.

## Passing Observations

- Successful samples produce visible trigger text and matching precommitted delayed metadata.
- Delayed rewards use clear expiration and duration metadata in debug output.
- Most counter-pair samples produce distinct delayed reward options.
- Successful output avoids placeholder IDs, malformed names, and `undefined`.

## Verification

Sanity replay:
`npm run journey -- --seed audit:reward_after_trigger:early:01 --stage early --shape reward_after_trigger --debug --show-deck --no-color`

The replay command succeeds and matches the command format used for the audited examples.
