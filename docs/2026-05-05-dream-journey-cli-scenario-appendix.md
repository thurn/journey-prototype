# Dream Journey CLI Scenario Appendix

This appendix replaces the retired stateful simulator scenarios. V2 scenarios
exercise stateless generation, explicit debug surfaces, forced shape QA, JSON
fixtures, and complete decision-tree rendering.

## Scenario 1: Bare Generation

Command:

```text
journey --no-color
```

Expected behavior:

- Prints `Dream Journey`.
- Prints the generated Dreamcaller and stage/resources.
- Prints either flat options or a complete decision tree.
- Exits successfully.
- Does not create or update `.journey/state.json`.
- Does not mention `journey pick`, pending state, or next commands.

## Scenario 2: Deterministic Seeded Generation

Command:

```text
journey --seed qa --stage late --no-color
```

Expected behavior:

- Repeated invocations with the same content and catalog versions produce the
  same output.
- The visible stage is `late`.
- The manifest seed is `qa`.

## Scenario 3: Unseeded Fresh Generation

Command:

```text
journey --no-color
journey --no-color
```

Expected behavior:

- Each invocation independently constructs a context and Journey.
- Outputs may differ without requiring a reset command.
- No previous pending Journey is reused.

## Scenario 4: Forced Tree Shape

Command:

```text
journey --seed qa --stage late --shape prize_ladder --no-color
```

Expected behavior:

- Prints a `Decision Tree`.
- Includes every level and branch up front.
- Includes stop branches, continue branches, terminal rewards, and costs.
- Does not fall back to another shape.
- If the shape cannot be legally filled, exits with a clear validation error.

## Scenario 5: JSON Fixture Output

Command:

```text
journey --seed qa --stage mid --shape random_pool_draws --json
```

Expected behavior:

- Stdout is valid JSON with no ANSI escape sequences.
- Payload includes `contentVersion`, `catalogVersion`, `seed`, `stage`, and
  `shapeId`.
- Payload includes `manifest.tree` and `manifest.rewardPool`.
- Payload includes generated context, deck list, draft pool, Dreamsign pool,
  Dreamcaller, resources, command parameters, and debug metadata.
- Payload does not include `pendingJourney` or `nextCommands`.

## Scenario 6: Human Debug Context

Command:

```text
journey --seed qa --stage mid --debug-context --no-color
```

Expected behavior:

- Prints the generated Journey normally.
- Adds `Debug Context`.
- Shows Dreamcaller, resources, package selection, deck summary, deck list,
  starter count, active Dreamsigns, draft pool summary, and Dreamsign pool
  summary.
- Does not show generation scoring unless `--debug` is also supplied.

## Scenario 7: Generation Debug

Command:

```text
journey --seed qa --stage mid --debug --no-color
```

Expected behavior:

- Prints the generated Journey normally.
- Adds `Debug`.
- Shows seed, Journey ID, stage, selected shape, selected tags, shape scoring,
  option values when present, and repairs when present.

## Scenario 8: Run Alias

Command:

```text
journey run --seed qa --stage mid --no-color
```

Expected behavior:

- Behaves like `journey --seed qa --stage mid --no-color`.
- Does not read, freeze, or write pending simulator state.

## Scenario 9: Removed Commands

Command:

```text
journey --help
```

Expected behavior:

- Documents bare generation and the `run` alias.
- Does not document `pick`, `new`, or `state`.

## Scenario 10: Shape Catalog

Expected behavior:

- Canonical shapes do not include `repeat_to_scale`, `sequential_offers`, or
  `escalating_search`.
- `take_any_number` renders as a repeatable flat menu.
- `prize_ladder`, `probability_ladder`, `random_pool_draws`,
  `push_your_luck`, and `escalating_reward_chain` render complete tree
  structures.
