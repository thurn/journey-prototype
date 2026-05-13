# `choose_your_loss` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `choose_your_loss`
- Stages: early, mid, late
- Seeds: `audit:choose_your_loss:<stage>:01` through `audit:choose_your_loss:<stage>:10`
- Command template: `npm run journey -- --seed audit:choose_your_loss:<stage>:NN --stage <stage> --shape choose_your_loss --debug --show-deck --no-color`

## Findings

### Mid seed can fail during loss selection

Severity: high

Seed: `audit:choose_your_loss:mid:05`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:mid:05 --stage mid --shape choose_your_loss --debug --show-deck --no-color`

Generated output:

```text
Error: choose_your_loss fill could not select distinct loss row 3
```

Issue:
This seed exits with code 4 before producing a journey. A deterministic forced-shape run should always produce three loss options or select a documented fallback path.

Recommendation:
When the comparable loss pool leaves fewer than three distinct candidate keys, expand the pool before row selection or deduplicate the candidate pool before the row loop decides whether a third row is available. Add coverage for `audit:choose_your_loss:mid:05` and the full `01` through `10` audit seed range.

### Duplicate-card purge can be an inert loss

Severity: medium

Seed: `audit:choose_your_loss:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:early:01 --stage early --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Gain 3 random banes.
2. Purge all duplicate cards from your deck.
3. Lose 75 essence.

Seed: `audit:choose_your_loss:early:10`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:early:10 --stage early --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Lose 70 essence.
2. Gain 2 random banes.
3. Purge all duplicate cards from your deck.

Seed: `audit:choose_your_loss:late:05`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:late:05 --stage late --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Lose 135 essence.
2. Battle essence rewards are reduced by 30 for the next 3 battles.
3. Purge all duplicate cards from your deck.

Issue:
Each shown deck contains unique card names, so "Purge all duplicate cards from your deck" has no visible target. In a choose-your-loss menu, an inert deck cleanup option becomes the easy pick beside essence loss, Banes, or reduced battle rewards. The debug valuation still prices the row as a real loss.

Recommendation:
Use `purge_all_duplicate_cards` in this shape only when the current deck contains duplicate card names and purging them is intended to be a drawback in this ruleset. Otherwise, exclude this cost from `choose_your_loss` or replace it with a deck loss that always has a visible target.

### Transfiguration removal targets are not visible in the shown deck

Severity: medium

Seed: `audit:choose_your_loss:early:03`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:early:03 --stage early --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Lose 1 omen.
2. Gain 3 'Doubt'.
3. Remove the transfigurations from 2 random cards with cost 2 or less.

Seed: `audit:choose_your_loss:early:07`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:early:07 --stage early --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Remove the transfigurations from 3 random cards with cost 2 or less.
2. Gain 2 'Paranoia' for the next 3 battles.
3. Lose all remaining essence.

Seed: `audit:choose_your_loss:mid:10`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:mid:10 --stage mid --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Gain 3 'Lethargy'.
2. Lose 100 maximum essence.
3. Remove the transfigurations from 3 random Fast cards.

Seed: `audit:choose_your_loss:late:10`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:late:10 --stage late --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Lose 1 omen.
2. Gain 2 'Burden' for the next 2 battles.
3. Remove the transfigurations from 3 random cards with a 'reclaim' ability.

Issue:
The shown decks list plain card names and do not identify any cards as transfigured. A player reading these offers cannot confirm that the transfiguration-removal row has a valid target or a meaningful downside. These rows often sit beside permanent resource loss or Banes, making the menu feel solved rather than balanced.

Recommendation:
Gate transfiguration-removal losses on the current deck state containing enough visible transfigured cards that match the selected predicate. If the generated journey output intentionally omits transfiguration markers from `--show-deck`, include enough target context in debug output to verify the loss as material.

### Maximum-essence loss lacks an amount

Severity: medium

Seed: `audit:choose_your_loss:mid:03`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:mid:03 --stage mid --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Lose all remaining essence.
2. Purge a random Dreamsign.
3. Lose maximum essence.

Issue:
The third row reads as "Lose maximum essence" while debug values it at 500 converted essence. The player-facing text does not specify whether this means losing all maximum essence, losing some maximum essence, or reducing the maximum essence cap by a known amount. The same shape also generates clearer rows such as "Lose 75 maximum essence" and "Lose 100 maximum essence".

Recommendation:
Render this loss with a concrete amount or use the existing amount-bearing maximum-essence loss template. A player should be able to compare maximum-essence loss against current essence loss and Dreamsign loss from the menu text alone.

### Named Dreamsign purge reads like a named-card purge

Severity: low

Seed: `audit:choose_your_loss:mid:01`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:mid:01 --stage mid --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Lose 60 essence.
2. Your starting dreamwell card is 'Choking Ash' for the next 3 battles.
3. Purge 'Herb Mortar'.

Seed: `audit:choose_your_loss:late:02`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:choose_your_loss:late:02 --stage late --shape choose_your_loss --debug --show-deck --no-color`

Generated options:

1. Lose 100 essence.
2. Purge 'Cloud Lens'.
3. Remove all dreamsign sites from the next 2 dreamscapes you visit.

Issue:
The named Dreamsign purge template renders as `Purge '<name>'`, which matches the named-card purge wording. The active Dreamsign list makes the target recoverable in debug output, but the Dream Journey menu itself does not label the target type.

Recommendation:
Render named Dreamsign losses with the Dreamsign noun, such as `Purge Dreamsign '<name>'`, so the menu remains clear without relying on deck and Dreamsign context.

## Passing Observations

- Successful runs consistently produced a three-row direct menu with negative-only options.
- Most essence, omen, Bane, route-site, and dreamwell-card losses read as coherent costs.
- Stage scaling generally kept essence losses inside comparable bands within each successful menu.

## Verification

Verification command:

`npm run journey -- --seed audit:choose_your_loss:early:01 --stage early --shape choose_your_loss --debug --show-deck --no-color`

Result: succeeded with exit code 0.
