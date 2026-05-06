# Dream Journey CLI Scenario Appendix

This appendix belongs to
[Dream Journey CLI Simulator Technical Design][design].
It gives transcript-level scenarios for reviewing the expected behavior of the
standalone TypeScript `journey` CLI.

The exact generated Journey text in these scenarios is illustrative but
normative for output shape, command semantics, state effects, and error
handling. Implementations may generate different valid Journey content for a
given seed only if the generator's committed seed, catalog, and content version
define that different output consistently.

## How To Use This Appendix

Review each scenario as a manual acceptance record. For each scenario, verify:

- Preconditions are clear.
- The command is non-interactive.
- Stdout and stderr are separated.
- Exit status is explicit.
- State effects are explicit.
- Debug output is readable and option-numbered.
- Normal option output contains only placeholder symbols and mechanical text.
- No selected Dream Journey effect is applied to quest resources or objects.

## Scenario Index

1. Frozen first Journey.
2. Pick a root option and receive the next Journey.
3. Sequential Journey advances after a pick.
4. Invalid pick leaves state unchanged.
5. State query shows simulated quest context.
6. JSON output for pending Journey.
7. `--no-debug` hides debug output only.
8. Reset requires `--force` when a pending Journey exists.
9. New seeded quest replaces state with `--force`.
10. Content-version mismatch refuses to continue.

## Scenario 1: Frozen First Journey

Preconditions:

`/Users/dthurn/journeys/.journey/state.json` does not exist.

Action 1:

```text
$ journey run
```

Stdout:

```text
Dream Journey
Quest: Vaela, Ember Among Remnants
Essence: 120/500    Omens: 1    Dreamscape: 0

1. ! ◇ Gain 1 Nightmare. Draft 1 of 10 cards.
2. ! ☾ Gain 1 Nightmare. Gain Golden Acorn.
3. ! ✂ Gain 1 Nightmare. Purge 3 chosen starter cards.

Debug
Seed: default
Journey: J-000001
Stage: early
Selected shape: same_cost_different_rewards
Selected tags: build, reward, immediate, risk
Shape scoring: same_cost_different_rewards 0.91

1. Cost: Gain 1 Nightmare = 140 converted essence.
   Effect: Draft 1 of 10 cards = 150 converted essence.
   Net: +10 converted essence.

2. Cost: Gain 1 Nightmare = 140 converted essence.
   Effect: Gain Golden Acorn = 145 converted essence.
   Net: +5 converted essence.

3. Cost: Gain 1 Nightmare = 140 converted essence.
   Effect: Purge 3 chosen starter cards = 155 converted essence.
   Net: +15 converted essence.

Run `journey pick 1`, `journey pick 2`, or `journey pick 3`.
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
creates .journey/state.json
stores quest state
stores pending journey J-000001 exactly as printed
does not append a pick history entry
```

Action 2:

```text
$ journey run
```

Stdout:

```text
Dream Journey
Quest: Vaela, Ember Among Remnants
Essence: 120/500    Omens: 1    Dreamscape: 0

1. ! ◇ Gain 1 Nightmare. Draft 1 of 10 cards.
2. ! ☾ Gain 1 Nightmare. Gain Golden Acorn.
3. ! ✂ Gain 1 Nightmare. Purge 3 chosen starter cards.

Debug
Seed: default
Journey: J-000001
Stage: early
Selected shape: same_cost_different_rewards
Selected tags: build, reward, immediate, risk
Shape scoring: same_cost_different_rewards 0.91

1. Cost: Gain 1 Nightmare = 140 converted essence.
   Effect: Draft 1 of 10 cards = 150 converted essence.
   Net: +10 converted essence.

2. Cost: Gain 1 Nightmare = 140 converted essence.
   Effect: Gain Golden Acorn = 145 converted essence.
   Net: +5 converted essence.

3. Cost: Gain 1 Nightmare = 140 converted essence.
   Effect: Purge 3 chosen starter cards = 155 converted essence.
   Net: +15 converted essence.

Run `journey pick 1`, `journey pick 2`, or `journey pick 3`.
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
leaves .journey/state.json unchanged
does not advance the seed
does not regenerate journey J-000001
does not append a history entry
```

Related acceptance criteria:

- First `run` auto-creates a deterministic default quest.
- Repeated `run` reprints a frozen pending Journey.
- Normal output does not show a top-level `Shape:` line.
- Debug output includes selected shape and converted essence values.

## Scenario 2: Pick A Root Option And Receive The Next Journey

Preconditions:

`.journey/state.json` exists and contains pending Journey `J-000001` with the
three options from Scenario 1. Debug output is enabled.

Action:

```text
$ journey pick 2
```

Stdout:

```text
Selected 2. ! ☾ Gain 1 Nightmare. Gain Golden Acorn.

Dream Journey
Quest: Vaela, Ember Among Remnants
Essence: 120/500    Omens: 1    Dreamscape: 0

1. ◆ ✂ Pay 70 essence. Purge a chosen card.
2. ◆ ✦ Pay 70 essence. Transfigure a chosen starter card.

Debug
Seed: default
Previous journey: J-000001
Previous shape: same_cost_different_rewards
Recorded pick: 2
Effect simulation: not applied

Journey: J-000002
Stage: early
Selected shape: heterogeneous_pair
Selected tags: cleanup, refine, immediate
Shape scoring: heterogeneous_pair 0.86

1. Cost: Pay 70 essence = 70 converted essence.
   Effect: Purge a chosen card = 85 converted essence.
   Net: +15 converted essence.

2. Cost: Pay 70 essence = 70 converted essence.
   Effect: Transfigure a chosen starter card = 80 converted essence.
   Net: +10 converted essence.

Run `journey pick 1` or `journey pick 2`.
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
appends a history entry for J-000001 option 2
does not add Nightmare to the deck
does not add Golden Acorn to Dreamsigns
does not change essence or omens
stores pending journey J-000002 exactly as printed
advances the deterministic generator cursor
```

Related acceptance criteria:

- `pick` records history.
- `pick` does not apply effects.
- `pick` generates and stores the next Journey after a completed root choice.
- Debug output reports the previous pick and new Journey.

## Scenario 3: Sequential Journey Advances After A Pick

Preconditions:

`.journey/state.json` contains pending Journey `J-000014`, a
`take_any_number` Journey at step 1 of 2. Debug output is enabled.

Action:

```text
$ journey pick 1
```

Stdout:

```text
Selected 1. * Take cache reward 1: pay 15 essence. Gain 1 omen, then choose whether to take the final reward.

Dream Journey
Quest: Vaela, Ember Among Remnants
Essence: 120/500    Omens: 1    Dreamscape: 0

1. * Take final cache reward: purge up to 1 chosen Starter card and gain 1 Nightmare.
2. * End the sequence and keep all committed step rewards.

Debug
Seed: default
Journey: J-000014
Selected shape: take_any_number
Recorded step: 1 of 2
Recorded pick: 1
Effect simulation: not applied
Sequence status: advanced to step 2 of 2

1. Cost: none = 0 converted essence.
   Effect: purge up to 1 chosen Starter card = 85 converted essence.
   Burden: gain 1 Nightmare = -125 converted essence.
   Net: -40 converted essence.

2. Cost: none = 0 converted essence.
   Effect: gain 25 essence = 25 converted essence.
   Net: +25 converted essence.

Run `journey pick 1` or `journey pick 2`.
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
appends a history entry for J-000014 step 1 option 1
does not add 35 essence
keeps J-000014 as the pending journey
stores the step 2 menu exactly as printed
does not generate a new Journey yet
advances only the sequence cursor inside J-000014
```

Related acceptance criteria:

- Sequential Journeys keep the same Journey ID across steps.
- The follow-up menu is printed immediately after `pick`.
- The selected effect is recorded but not applied.

## Scenario 4: Invalid Pick Leaves State Unchanged

Preconditions:

`.journey/state.json` contains pending Journey `J-000002` with 2 options.
Debug output is enabled.

Action:

```text
$ journey pick 3
```

Stdout:

```text
```

Stderr:

```text
Error: option 3 is not available for Journey J-000002.

Valid choices are 1 or 2.
Run `journey run` to show the pending choices again.
```

Exit status: `2`

State effect:

```text
leaves .journey/state.json unchanged
does not append a history entry
does not advance the generator cursor
does not generate a new Journey
```

Related acceptance criteria:

- Invalid picks are non-zero errors.
- Invalid picks do not mutate state.
- Error output tells the user how to recover.

## Scenario 5: State Query Shows Simulated Quest Context

Preconditions:

`.journey/state.json` exists after Scenario 2. Pending Journey `J-000002` is
stored. Debug output is not relevant for `journey state` unless the
implementation chooses to show a small debug metadata section.

Action:

```text
$ journey state
```

Stdout:

```text
Quest State
Seed: default
Dreamcaller: Vaela, Ember Among Remnants
Awakening: 5

Resources
Essence: 120/500
Omens: 1
Dreamscape: 0

Selected tides
survivor_dissolve, void_recursion, reclaim_characters, cheap_curve,
finishers, judgment_bodies

Deck
10 cards
Starter cards: 10
Banes: 0
Transfigured cards: 0

Dreamsigns
0 active
Pool: 42 available

Pending Journey
Journey: J-000002
Options: 2
Run `journey run` to show the pending choices.

Recent history
J-000001 option 2: Gain 1 Nightmare. Gain Golden Acorn.
Effect simulation: not applied
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
leaves .journey/state.json unchanged
```

Related acceptance criteria:

- `journey state` is the main query surface.
- State query shows Dreamcaller, resources, tides, deck, Dreamsigns, pending
  Journey, and recent history.
- Query commands do not mutate state.

## Scenario 6: JSON Output For Pending Journey

Preconditions:

`.journey/state.json` contains pending Journey `J-000002` from Scenario 2.

Action:

```text
$ journey run --json
```

Stdout:

```json
{
  "status": "ok",
  "command": "run",
  "state": {
    "seed": "default",
    "dreamcaller": {
      "name": "Vaela",
      "title": "Ember Among Remnants"
    },
    "resources": {
      "essence": 120,
      "maxEssence": 500,
      "omens": 1,
      "dreamscape": 0
    }
  },
  "pendingJourney": {
    "id": "J-000002",
    "stage": "early",
    "selectedShape": "heterogeneous_pair",
    "selectedTags": ["cleanup", "refine", "immediate"],
    "options": [
      {
        "number": 1,
        "symbols": ["◆", "✂"],
        "text": "Pay 70 essence. Purge a chosen card.",
        "costConvertedEssence": 70,
        "effectConvertedEssence": 85,
        "netConvertedEssence": 15
      },
      {
        "number": 2,
        "symbols": ["◆", "✦"],
        "text": "Pay 70 essence. Transfigure a chosen starter card.",
        "costConvertedEssence": 70,
        "effectConvertedEssence": 80,
        "netConvertedEssence": 10
      }
    ]
  },
  "debug": {
    "enabledByDefault": true,
    "shapeScoring": [
      {
        "shape": "heterogeneous_pair",
        "score": 0.86
      }
    ],
    "repairs": []
  },
  "nextCommands": ["journey pick 1", "journey pick 2"]
}
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
leaves .journey/state.json unchanged
does not include ANSI color escapes in JSON
```

Related acceptance criteria:

- `run --json` exposes the same manifest used by the human renderer.
- JSON contains structured converted essence values.
- JSON output is deterministic and color-free.

## Scenario 7: `--no-debug` Hides Debug Output Only

Preconditions:

`.journey/state.json` contains pending Journey `J-000002` from Scenario 2.

Action:

```text
$ journey run --no-debug
```

Stdout:

```text
Dream Journey
Quest: Vaela, Ember Among Remnants
Essence: 120/500    Omens: 1    Dreamscape: 0

1. ◆ ✂ Pay 70 essence. Purge a chosen card.
2. ◆ ✦ Pay 70 essence. Transfigure a chosen starter card.

Run `journey pick 1` or `journey pick 2`.
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
leaves .journey/state.json unchanged
does not remove debug metadata from the stored manifest
```

Related acceptance criteria:

- Debug output is default but suppressible.
- `--no-debug` affects only human rendering.
- Normal option output remains unchanged.

## Scenario 8: Reset Requires `--force` When Pending Journey Exists

Preconditions:

`.journey/state.json` contains pending Journey `J-000002`.

Action:

```text
$ journey new --seed ash
```

Stdout:

```text
```

Stderr:

```text
Error: a pending Journey would be discarded.

Pending Journey: J-000002
Run `journey new --seed ash --force` to replace this quest state.
```

Exit status: `2`

State effect:

```text
leaves .journey/state.json unchanged
does not create a new quest
does not change the seed
```

Related acceptance criteria:

- `journey new` protects pending choices.
- Reset is explicit and deterministic.

## Scenario 9: New Seeded Quest Replaces State With `--force`

Preconditions:

`.journey/state.json` contains pending Journey `J-000002`.

Action:

```text
$ journey new --seed ash --force
```

Stdout:

```text
Created new Dream Journey quest.
Seed: ash
Dreamcaller: Demetrios, Strategos of the Phalanx
Essence: 120/500    Omens: 1    Dreamscape: 0

Run `journey run` to generate the first Journey.
```

Stderr:

```text
```

Exit status: `0`

State effect:

```text
replaces .journey/state.json
sets seed to ash
clears pending journey
clears pick history
initializes a deterministic quest context for seed ash
```

Related acceptance criteria:

- `journey new --seed` can vary the simulated quest.
- `--force` allows intentional replacement of pending state.
- New state is deterministic for the given seed.

## Scenario 10: Content-Version Mismatch Refuses To Continue

Preconditions:

`.journey/state.json` exists and contains content fingerprint
`journey-catalog:v1,data:old`. The current local TOML data and programmatic
Journey catalog produce fingerprint `journey-catalog:v2,data:current`.

Action:

```text
$ journey run
```

Stdout:

```text
```

Stderr:

```text
Error: local Journey state was created for a different content version.

State content version: journey-catalog:v1,data:old
Current content version: journey-catalog:v2,data:current

Run `journey new --force` to discard the old simulator state.
```

Exit status: `3`

State effect:

```text
leaves .journey/state.json unchanged
does not migrate state
does not render the stale pending Journey
does not generate a new Journey
```

Related acceptance criteria:

- Content-version mismatches are non-zero errors.
- The CLI does not silently migrate pending Journey manifests.
- The user receives a clear reset command.

[design]: 2026-05-05-dream-journey-cli-design.md
