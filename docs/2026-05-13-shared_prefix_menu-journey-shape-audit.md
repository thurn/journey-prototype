# `shared_prefix_menu` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `shared_prefix_menu`
- Stages: early, mid, late
- Seeds: `audit:shared_prefix_menu:<stage>:01` through `audit:shared_prefix_menu:<stage>:10`
- Command template: `npm run journey -- --seed audit:shared_prefix_menu:<stage>:NN --stage <stage> --shape shared_prefix_menu --debug --show-deck --no-color`

## Findings

### Late Bane-Prefix Menus Stay Early-Scale

Severity: medium

Seeds:

- `audit:shared_prefix_menu:late:01`
- `audit:shared_prefix_menu:late:05`
- `audit:shared_prefix_menu:late:10`

Replay:
`npm run journey -- --seed audit:shared_prefix_menu:late:01 --stage late --shape shared_prefix_menu --debug --show-deck --no-color`

Generated options:

1. Gain 1 Despair. Gain {Carved Bone}.
2. Gain 1 Despair. Draft 1 of 4 events.
3. Gain 1 Despair. Add a Transfiguration site to the current dreamscape.

Issue:
All 10 late samples used the Bane-prefix menu with the same one-Bane burden and 320 converted essence reward band used by early and mid samples. The options are mechanically balanced, but late journeys read like the same small template rather than a late-stage offer.

Recommendation:
Use stage-aware Bane-prefix rewards. Late shared-prefix menus should use stronger Dreamsign choices, larger card draft rewards, route rewards with explicit late-stage value, or a bonus resource attached to each payoff family.

### Bane Prefix Reads Like A Reward

Severity: medium

Seed: `audit:shared_prefix_menu:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:shared_prefix_menu:early:01 --stage early --shape shared_prefix_menu --debug --show-deck --no-color`

Generated options:

1. Gain 1 Paranoia. Gain {Charm Pouch}.
2. Gain 1 Paranoia. Draft 1 of 4 characters.
3. Gain 1 Paranoia. Add a Duplication site to the current dreamscape.

Issue:
The shared prefix is a Bane burden, but the sentence only says "Gain 1 Paranoia." In the normal renderer, the burden symbol marks the option, but the text itself can read as a neutral or positive named-resource gain. This is especially confusing next to the reward sentence that also starts with "Gain."

Recommendation:
Render the prefix as a Bane explicitly, such as "Gain 1 Paranoia Bane." The shared prefix should read as the cost before the payoff sentence.

## Passing Observations

- All 30 sampled journeys generated valid direct-menu manifests with 3 options.
- Each sampled menu preserved a clear shared prefix across all options.
- Option values are tightly balanced; most samples have exact net symmetry.
- Reward families differ cleanly across Dreamsign, card draft, route reward, resource, and starter-cleanup rows.
- The output avoids placeholder IDs, malformed names, and `undefined`.

## Verification

Sanity replay:
`npm run journey -- --seed audit:shared_prefix_menu:early:01 --stage early --shape shared_prefix_menu --debug --show-deck --no-color`

The replay command succeeds and matches the command format used for the audited examples.
