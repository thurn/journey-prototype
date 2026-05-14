# Dream Journey CLI Scenario Appendix

This appendix replaces the retired stateful simulator scenarios. V3 scenarios
exercise stateless generation, explicit debug surfaces, deterministic payload
QA, forced shape QA, JSON fixtures, 100-count variety batches, and complete
decision-tree rendering.

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
journey --seed qa --stage late --shape probability_ladder --no-color
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
- Payload includes manifest schema version 2 metadata, validation rule results,
  repair metadata when repair was attempted, generated object definitions when
  present, and the semantic distinctness fingerprint.
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
  option values when present, validation rule outcomes, semantic fingerprint
  components and equivalence bands, debug payload selection when forced, and
  repairs when present.

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
- `probability_ladder`, `random_pool_draws`, `push_your_luck`, and
  `escalating_reward_chain` render complete tree structures.

## Scenario 11: Deterministic Payload QA Surface

Command:

```text
journey --debug-list-payloads --json
journey --seed qa --stage mid --shape shop_row --debug-payload-family dreamsign --debug-payload-variant named-dreamsign-shop-row --json
```

Expected behavior:

- The payload list exposes supported families, variant IDs, supported shapes,
  supported stages, availability, and descriptions.
- Supported QA IDs include adapter/current, named card operations, named
  Dreamsign shops and transformations, Bane/resource edge cases, route/shop/
  Dreamwell/status payloads, hooks, paired returns, random reveal/roll/wager
  envelopes, generated objects, and complete decision trees.
- Forced payload commands are deterministic and either generate a legal
  manifest or fail with an error that names the incompatible family, variant,
  shape, or stage.
- Forced payload commands remain a supported QA/debug surface, not interactive
  gameplay and not persistent state mutation.

## Scenario 12: V3 Semantic JSON And Debug Parity

Command:

```text
journey --seed parity --stage late --debug-payload-family generated_object --debug-payload-variant generated-card --json
journey --seed parity --stage late --debug-payload-family generated_object --debug-payload-variant generated-card --debug --no-color
journey --seed parity --stage late --debug-context --no-color
```

Expected behavior:

- JSON and debug output are derived from the same manifest.
- Visible options, tree branches, terminals, reward pools, and precommitted
  outcomes carry typed operations with target selectors, timing, visibility,
  value metadata, and validation metadata where applicable.
- Manifest-local generated objects include IDs, kind, rules text, references,
  lifetime or duration, value estimate, validation metadata, and payload data.
- `--debug-context` remains limited to simulated quest context unless
  `--debug` is also supplied; it does not print shape scores, validation rule
  internals, repair details, or fingerprint components by itself.

## Scenario 13: Stage Variety And Replay

Command:

```text
journey --seed variety --stage early --count 100 --json
journey --seed variety --stage mid --count 100 --json
journey --seed variety --stage late --count 100 --json
```

Expected behavior:

- Each batch emits exactly 100 manifests.
- Repeating the same command with the same content version produces byte-stable
  JSON.
- Each stage batch has 100 unique semantic fingerprints.
- Fingerprints include meaningful design identity such as shape, topology,
  payload family, operation verbs, targets, named objects, generated object
  archetypes, timing, triggers, route/status scope, random envelope, visibility,
  major cost/reward/burden families, motif, and curated variant ID.
- Trivial amount changes contribute only through documented equivalence bands.

## Scenario 14: Built CLI And Invalid Shape Compatibility

Command:

```text
npm run build
npm run start -- --seed built-cli --no-color
journey --shape nope --no-color
```

Expected behavior:

- The built CLI renders the same V3-compatible human output style as
  `npm run journey`.
- Invalid shape commands exit nonzero, name the invalid shape, and do not print
  stack traces.
- The command surface remains non-interactive and does not document or restore
  stateful `new`, `pick`, or `state` flows.
