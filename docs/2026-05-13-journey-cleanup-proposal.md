# Journey Cleanup Proposal

## Summary

The Journey codebase should continue the shape-plugin migration by deleting
migration-era subsystems and tightening the runtime API around the code that
production generation actually uses. The next cleanup pass should favor
removing indirection before reorganizing files.

The most important decisions are:

- Delete the repair and fallback subsystem.
- Delete operation adapters by requiring shape fills to emit typed operations.
- Shrink the shape plugin contract to enforced runtime behavior.
- Treat reward, cost, random-envelope, hook, and generated-object handling as
  explicit registries only where they still earn their complexity.
- Keep tests focused on production behavior, shape contracts, and rendering.

## Goals

- Make one selected shape plugin the owner of its Journey structure.
- Make emitted manifest operations typed at the source.
- Keep runtime validation small and essential.
- Keep debug and audit metadata out of the core generation path unless the CLI
  command explicitly asks for it.
- Keep shared modules shape-agnostic.
- Make adding or deleting a shape require changes in as few central files as
  possible.

## Delete Repair

`src/journey/repair.ts` should be deleted. The current repair path does not
apply shape repair actions; it generates a fallback shape and writes debug
metadata. That behavior hides broken fills, distorts shape distribution, and
keeps descriptive repair metadata alive in every plugin.

Target behavior:

- Generation validates the selected shape's manifest.
- Invalid forced-shape generation fails with a clear error.
- Invalid unforced generation fails during tests and debug runs.
- CLI resilience, if needed, is implemented as a small bounded retry policy in
  generation selection, not as manifest repair.
- Shape plugin `repairPreferences`, `repair.actions`, `fallbackRank`, and
  repair debug metadata are deleted.

## Delete Operation Adapters

`src/journey/operationAdapters.ts` should be deleted. Shape fills should emit
typed `JourneyOperation` objects directly instead of writing loosely shaped
payloads that are inferred later.

Target behavior:

- `JourneyOption.operations` is source data, not derived adapter output.
- Costs, rewards, burdens, triggers, route edits, precommits, tree branches,
  and reward pools expose typed operations at construction time.
- Value metadata is produced by the typed operation builders or by the value
  subsystem from typed operation fields.
- Random envelopes, delayed hooks, paired returns, generated objects, and route
  edits own their typed builders and validators.
- Tests assert typed operation output at the shape or operation-family boundary.

This cleanup should happen before splitting adapter code into smaller files.
Splitting the adapter layer would preserve the wrong abstraction.

## Tighten Shape Plugins

The shape plugin contract should separate runtime behavior from catalog
metadata. Fields that do not affect runtime behavior should either become real
hooks or leave the production plugin contract.

Delete or demote these fields unless a caller enforces them:

- `payloadCompatibility`
- `menuValueChecks`
- `allowsRouteReward`
- `allowsRouteSideEffects`
- `compoundCoherence`
- `requiresPrecommittedRandom`
- `compoundAllowsRouteOnlyReward`
- `bypassStandardValidation`
- `optionValueValidator`

Selection weight should live with the plugin, or in a single selection
registry registered beside the plugin. The current two-place registration model
creates avoidable drift between the shape registry and score weights.

## Delete Derived Compatibility

`payloadCompatibilityFor` should be deleted. Compatibility metadata is
descriptive, shape-ID-aware, and not used as an enforcement boundary. Runtime
capability should come from typed operations and validators. Human-readable
catalog metadata can be explicit on the plugin when it has a product consumer.

## Operation-Family Ownership

Some concepts still justify shared infrastructure, but they should be owned by
operation-family registries rather than central switches:

- resource operations
- card operations
- Dreamsign operations
- random envelopes
- delayed hooks
- paired returns
- route edits
- generated objects
- status and rule mutations

Each family should own its builders, validation, reachability classification,
value metadata, and rendering helpers. Shape plugins should import family
builders and compose them locally.

## Reward And Cost Catalogs

The shared reward and cost catalogs should shrink to common templates and
domain primitives. Shape-specific pools and weighting policy should live with
the owning shape.

Immediate candidates:

- Move random-trade cost selection and exclusions into
  `src/journey/shapes/random_trades/`.
- Split shared reward templates by domain only after deleting unused templates.
- Keep `getReward` and `getCost` compatibility exports during the migration,
  then replace broad lookup with scoped selectors where possible.

## Debug And Reachability

Reachability metadata is useful for audits, but it should be treated as a debug
or audit surface. Production manifests should carry only the metadata required
for rendering and command behavior.

Target behavior:

- Normal generation creates the manifest data needed by renderers.
- `--debug` computes reachability and operation-family evidence.
- Audit tests can call the reachability helper directly.
- Shape tests assert operation families through typed operations when possible.

## Test Cleanup

The test suite should become faster and more contract-focused:

- Consolidate forced-shape generation helpers.
- Cache real TOML content in test helpers.
- Replace broad duplicated seed sweeps with focused shape contract tests.
- Keep one subprocess CLI smoke layer and move behavior checks to handler or
  pure generation tests.
- Delete tests that only protect repair metadata, operation adapter inference,
  or compatibility catalog defaults.

## Suggested Order

1. Delete repair and fallback metadata.
2. Require typed operations from shape fills and delete operation adapters.
3. Remove derived compatibility metadata and unused plugin fields.
4. Move shape-specific reward/cost policy into shape directories.
5. Move surviving operation-family code into explicit family modules.
6. Split remaining large modules only after the deletion pass.

