# Fillers and Validation Deletion Plan

## Summary

This plan deletes `src/journey/fillers` as a production dependency and keeps
only the behavior required for single-shape, non-debug Journey generation.
The target system generates a Journey by selecting one canonical shape plugin,
calling that shape's local fill implementation, assembling a manifest from the
shape result, checking essential manifest invariants, and rendering the result.

The cleanup should be biased toward deletion. Code survives only when it is
used by production generation, essential runtime correctness checks, rendering,
or shape-local generation for a registered canonical shape. Hidden debug
fixture controls, batch duplicate-avoidance fingerprints, centralized shape
fill paths, broad validation framework code, and tests whose only purpose is
to protect `fillers` or `validate` internals are deletion candidates.

## Related Information

- [`docs/dream_journey_generation.md`](dream_journey_generation.md): Describes
  shape-first Journey generation and the shape catalog model.
- [`docs/journey-shape-migration-state.md`](journey-shape-migration-state.md):
  Tracks the current migration state for shape-local generation.
- [`docs/migrating_journey_shape_to_isolated_plugin.md`](migrating_journey_shape_to_isolated_plugin.md):
  Documents the intended ownership model for shape-specific code.
- [`docs/migrating_journey_shapes_to_shared_system.md`](migrating_journey_shapes_to_shared_system.md):
  Background on the shared production generation model.
- [`src/journey/shapes/shared.ts`](../src/journey/shapes/shared.ts): Defines
  shape plugin construction and currently keeps the centralized fill fallback
  reachable.
- [`src/journey/generate.ts`](../src/journey/generate.ts): Production Journey
  selection and generation entry point.
- [`src/journey/repair.ts`](../src/journey/repair.ts): Manifest repair and
  fallback path.
- [`src/commands/journey.ts`](../src/commands/journey.ts): Stateless CLI
  command path, including batch generation behavior.
- [`src/journey/validate`](../src/journey/validate): Current broad validation
  framework targeted for deletion except for essential correctness checks.

## Problem and Context

The Journey generator has moved toward shape-local plugins. Each registered
shape provides its own `fill` implementation, and shape-specific generation
logic is expected to live with that shape. The `fillers` directory still exists
as a large mixed layer containing centralized shape fills, generic option
builders, operation catalogs, random payload builders, generated-object
helpers, semantic fingerprints, and debug fixture support.

This mixed layer makes ownership unclear. It lets shape-specific code collect
in a central location, keeps migration-era helpers reachable, and makes it hard
to tell which behavior production generation genuinely needs. The code is also
large enough that tests can pass while still preserving substantial centralized
surface area.

The cleanup target is intentionally narrow: keep production generation for one
shape at a time, with essential correctness checks and rendering. Features
whose primary purpose is hidden debug payload coverage, filler-internal unit
tests, validation-framework reporting, or batch duplicate avoidance do not
belong in the target system.

## Current Reachability Inventory

The current module graph keeps `fillers` reachable through a small number of
important edges:

- production generation imports the manifest builder and semantic fingerprint
  helper through `src/journey/fillers/index.ts`;
- repair and fallback generation import the same manifest builder;
- shape plugin construction imports the centralized `fillOptions` fallback;
- human rendering imports generated-object lifetime text from
  `fillers/generatedObjects.ts`;
- debug payload metadata and fixture overrides import `src/journey/fixtures`;
- debug fixtures import filler payload helpers, operation catalogs, and tree
  builders;
- tests import filler modules directly.

These edges should be treated as blockers to directory deletion. The desired
result is not a renamed `fillers` directory; the desired result is a smaller
production graph where each surviving behavior has a clear production owner.

The current module graph also keeps `src/journey/validate` reachable through
generation, repair, shape validators, debug reporting, and tests:

- production generation calls `validateJourneyManifest` before and after
  repair or fallback;
- repair maps validation failure rule IDs to repair actions;
- sequence advancement validates follow-up menus;
- shape-specific validators import `fail`, `ValidationResult`, tree helpers,
  random helpers, and precommit helpers;
- human debug rendering prints validation reports;
- manifest version metadata includes a validation contract version;
- tests import validation entry points and specific validation modules.

Most migrated shapes already use `bypassStandardValidation: true`, which
limits runtime checks to the cheap manifest gates. The target system should
make this ownership model universal: shape fills own coherence, shape-local
tests prove shape behavior, and runtime validation is a small set of essential
assertions rather than a broad rule framework.

## Goals

- Delete `src/journey/fillers` from the TypeScript module graph.
- Require registered shape plugins to provide explicit production fills.
- Keep shape-specific catalogs, helpers, templates, and behavior with the
  owning shape.
- Keep shared production helpers only when at least two production shapes use
  them and the helper is independent of any shape identity.
- Delete hidden debug fixture generation and the filler helpers reachable only
  through that path.
- Delete semantic fingerprint generation and batch duplicate avoidance.
- Delete as much of `src/journey/validate` as possible.
- Keep only runtime checks that are essential to production correctness.
- Delete tests whose subject is `src/journey/fillers` rather than production
  behavior.
- Preserve single-shape non-debug CLI generation, JSON rendering, human
  rendering, and deterministic replay for a fixed seed.

## Constraints and Requirements

- Documentation must describe the current target system directly. Avoid
  historical contrast phrasing in updated docs.
- Shape-specific code belongs with the owning shape.
- Shared production code must be shape-agnostic and demonstrably used by
  production generation.
- The CLI stays non-interactive.
- A fixed seed must produce deterministic output for the same command,
  content version, shape, and stage.
- Essential runtime checks must guard only correctness properties that cannot
  be trusted to TypeScript, content loading, shape-local fills, and shape-local
  tests.
- Target resolution metadata must continue to be attached for production
  operations.
- JSON and human renderers must continue to derive from the same manifest.
- Test cases must stay focused and complete in 30 seconds or less.

## Target Production Path

The production path should be small and direct:

- The command layer parses normal generation flags, content, seed, count,
  shape, and stage.
- Generation chooses one registered shape plugin.
- The selected shape plugin produces a `FilledJourney`.
- A production manifest assembler converts the shape result into a
  `JourneyManifest`.
- The manifest receives target-resolution metadata, operation adapter output,
  value information, reachability metadata when useful, and content references
  derived from actual manifest data.
- Essential runtime checks assert the manifest properties required for safe
  rendering and follow-up command behavior.
- Repair and fallback generation call the same production manifest assembler.
- Rendering consumes the manifest without requiring filler helper modules.

The manifest assembler should not know about debug payload variants, semantic
fingerprints, centralized shape fill switches, natural generated-object gates,
validation report construction, or filler-specific test fixtures.

## Deletion Criteria

A function, module, test, or type should be deleted when all of these are true:

- It is not called by non-debug production generation, essential runtime
  correctness checks, repair, or rendering.
- It is not imported by a registered shape's production fill.
- Its tests assert filler-internal catalog structure rather than user-visible
  generation behavior.
- Its behavior can be covered by shape tests or CLI generation tests if the
  behavior is still product-relevant.

A function may survive only when all of these are true:

- It has a production caller outside hidden debug fixtures.
- It is not shape-specific by name, payload selection, target family, or
  topology.
- Moving it to a neutral production module reduces duplication across current
  shape fills.
- It can be tested through production generation, validation, or rendering.

A validation function may survive only when all of these are true:

- It protects a manifest property required for safe production rendering,
  target resolution, sequence advancement, or state updates.
- The same property cannot be enforced by TypeScript, content loading,
  shape-local construction, or shape-local tests.
- The check can run without debug fixture metadata, filler catalogs, semantic
  fingerprints, validation reports, or validation contract metadata.
- The failure mode is actionable for production generation.

## Required Code Changes

### Shape Plugin Fill Ownership

`defineShapePlugin` should require an explicit `fill` implementation for every
registered shape. The centralized fallback through `fillOptions` should be
deleted. This makes accidental shape registration without shape-local
generation fail at compile time.

The shape registry should remain the only production list of canonical shape
plugins. Shape definitions, validation rules, repair preferences, and fill
logic should continue to live under each shape's ownership boundary.

### Manifest Assembly

The manifest assembler should move out of `fillers`. It should keep only the
production responsibilities needed after a shape fill returns:

- construct schema, version, seed, stage, dreamscape, shape, and selected tag
  fields;
- copy root options, tree, reward pool, precommitted outcomes, generated
  objects if a shape produced them, and symmetry contracts if a shape produced
  them;
- adapt precommitted operations and option operations;
- evaluate option values;
- attach target-resolution metadata;
- attach reachability metadata when the current product uses it;
- compute manifest references from actual manifest content.

The assembler should not create generated objects on behalf of arbitrary
shapes. If a shape needs a generated object for production behavior, the shape
should produce it directly in its fill result.

### Validation Deletion

`src/journey/validate` should be treated as disposable infrastructure. The
target runtime should keep a small production assertion layer and delete the
broad validation framework, validation reports, validation contract versioning,
and rule-specific repair planning.

The production assertion layer should check only these essential properties:

- manifest schema and required top-level fields are present for renderer and
  command safety;
- manifest content version and shape catalog version match the current
  generation context;
- Journey IDs use the stable root Journey format expected by state and
  renderer code;
- root option count matches the selected shape definition;
- every option has a stable option number, user-facing text, arrays for
  structured payload collections, converted value fields, and a supported pick
  behavior;
- target selectors that a production shape emits resolve when they are marked
  required;
- immediate costs that generation asks the player to pay are payable from the
  current quest state;
- decision-tree shapes emit complete trees with a valid root, valid branch
  transitions, visible odds for probabilistic branches, and terminal outcomes;
- sequence menus contain valid follow-up options and a legal completion or
  leave path;
- production generated objects are structurally complete when a current shape
  emits them.

Checks outside that list should be deleted unless a concrete production caller
proves they are required for safe rendering or state updates.

The following validation surfaces should be deleted:

- validation report construction and `manifest.debug.validation`;
- human debug rendering for validation reports;
- `VALIDATION_CONTRACT_VERSION` and manifest version metadata tied only to
  validation reports;
- semantic-operation parity checks between typed operations and payload arrays;
- broad typed payload contract validation for catalog families owned by
  `fillers`;
- route, status, hook, Bane, Dreamwell, shop, generated-object, and random
  catalog validators that are reachable only through deleted fillers, debug
  fixtures, or filler-focused tests;
- validation checked-payload bookkeeping used only for debug reports;
- tests whose primary subject is validation framework behavior.

Shape-specific checks should live with their owning shape or be deleted. The
current non-bypassed shapes should be handled as follows:

- decision-tree shapes keep shape-local tree assertions only when the shape
  emits a tree in production;
- `single_offer` keeps a shape-local assertion for one take option and one
  no-effect leave option;
- `paired_return` keeps a shape-local assertion only for required paired-return
  precommit metadata;
- direct-menu reward and trade shapes should set `bypassStandardValidation:
  true` when their fills own coherence.

Repair should not depend on validation rule taxonomies. Production repair can
use one of two smaller policies:

- fail forced-shape generation with the essential assertion failure;
- regenerate or use the fallback shape when unforced generation violates an
  essential assertion.

Rule-specific repair actions such as payload-family repair, route-family
repair, cost-family repair, or semantic-operation repair should be deleted
with the validation framework and fillers.

### Semantic Fingerprints and Batch Duplicate Avoidance

Semantic fingerprint code should be deleted. The manifest should not include a
distinctness fingerprint in production output, debug output, or JSON output.

Batch generation should generate `count` manifests deterministically from the
requested seed and root index without retrying based on a semantic hash. The
command should continue to validate the requested count range and produce the
requested number of manifests.

Tests that assert fingerprint presence, fingerprint differences, equivalence
bands, or duplicate-avoidance retry behavior should be deleted or rewritten to
assert production generation behavior.

### Debug Fixtures

Hidden debug payload fixture support should be deleted as a product surface.
This includes deterministic debug payload families, forced debug payload
variants, fixture override generation, fixture metadata listing, and renderer
lines that exist to explain forced debug fixture behavior.

The hidden CLI flags for debug payload selection and listing should be deleted
from command parsing and command handlers. JSON command metadata should not
include debug payload selection fields after those flags are deleted.

Production `--debug` output may still exist for normal manifests, essential
assertions, target resolution, and reachability if those surfaces remain
useful. It should not require `src/journey/fixtures`.

### Generated Objects

Generated-object production support should be kept only where a current shape
creates a generated object as part of its own fill. The natural generated-object
gate in the current builder should be deleted because registered shapes do not use
shape-level natural generated-object policy.

Renderer support for generated objects may stay if production shapes can emit
generated objects directly. The rendering helper should live outside
`fillers`. If the only production generated-object behavior is the paired
return trade-ticket body owned by `paired_return`, then that shape should own
the ticket body and any shape-local text needed to render the option.

Generated-object validation and target-resolution support can remain when the
manifest schema still permits generated objects. Those modules are not part of
`fillers` and can be evaluated separately after the directory is deleted.

### Generic Payload Helpers

The cleanup should be skeptical of generic payload helpers. Production helpers
should survive only when current shape fills import them or when the manifest
assembler requires them.

Likely production candidates are:

- operation adapter calls;
- option value evaluation;
- target-resolution metadata attachment;
- manifest reference collection from actual manifest content;
- essential runtime assertion helpers;
- small rendering helpers used by renderers for production manifest fields.

Likely deletion candidates are:

- centralized card and Dreamsign operation catalogs;
- resource, route, environment, Bane, hook, and random payload catalog helpers
  that are only reachable through fixtures, centralized fills, or
  filler-focused tests;
- generic option factories used only by centralized fills or debug
  fixtures;
- random tree builders used only by centralized fills or debug fixtures;
- predicate-axis and operation-compatibility tests that protect centralized catalogs
  instead of shape behavior.

When a shape currently needs a helper from a deletion candidate, the owning
shape should receive the smallest local helper needed for that shape's fill.
Cross-shape extraction should happen only after duplicate production logic is
visible in at least two shape-local fills.

### Tests

Tests should verify production behavior through shape fills, generation,
essential runtime assertions, rendering, and CLI commands. Tests importing
`src/journey/fillers` or broad `src/journey/validate` internals directly should
be treated as deletion candidates.

Coverage should remain for:

- each registered shape can generate a valid manifest for fixed seeds;
- forced `--shape` generation works for every registered shape;
- shape-local tests cover important invariants for the owning shape;
- normal JSON and human rendering work without filler imports;
- repair and fallback paths can build replacement manifests through the
  production manifest assembler;
- essential runtime assertions reject malformed manifests that would break
  rendering, state updates, target resolution, or sequence advancement;
- CLI `--count` returns the requested number of manifests deterministically.

Coverage can be deleted when the test only asserts:

- filler catalog entry structure;
- hidden debug payload fixture output;
- semantic fingerprint fields;
- generated-object natural gating from the current builder;
- direct helper behavior for centralized fills;
- validation reports and checked-payload bookkeeping;
- broad payload contract validation for deleted filler catalog families;
- rule-specific repair behavior tied to deleted validation rule IDs.

## Compatibility Requirements

The manifest schema should be updated deliberately if `distinctness`, debug
fingerprint fields, validation report fields, or validation contract fields are
deleted from required manifest fields. Renderers and tests should treat the
revised schema as the production contract.

Persisted state compatibility matters only for registered command paths. The
current stateless generation path should be the primary compatibility target.
Stateful command code should compile, but compatibility work should not keep
`fillers` alive for unregistered behavior.

Existing user-facing normal CLI flags should continue to work unless they are
hidden debug fixture flags. Normal `--debug` should remain useful for
production manifests if it supports repair, target resolution, or reachability
information.

## Acceptance Criteria

- A repository search for `journey/fillers`, `../fillers`,
  `../../fillers`, and `src/journey/fillers` returns no production imports
  and no filler-only tests.
- `src/journey/fillers` can be deleted from the worktree.
- `src/journey/fixtures` can be deleted when its only purpose is hidden debug
  fixture generation.
- Most of `src/journey/validate` can be deleted, with only essential runtime
  assertions and shape-local validators surviving.
- Every registered shape plugin has an explicit production fill.
- Every direct-menu shape whose fill owns coherence uses the bypassed
  ownership model or an equivalent small assertion path.
- Production generation for a forced shape does not call any hidden debug
  fixture path.
- Production generation does not calculate or render semantic fingerprints.
- Production generation does not build validation reports or rely on broad
  validation rule IDs for repair planning.
- CLI batch generation does not retry based on duplicate fingerprints.
- Tests assert shape and CLI behavior rather than filler or validation
  framework internals.
- `npm run typecheck` passes.
- The relevant Vitest suites pass.
- Manual CLI QA produces valid non-debug production Journeys.

## Manual QA

Run these commands from the repository root after the cleanup:

- `npm run typecheck`
- `npm test`
- `npm run journey -- --seed qa --no-color`
- `npm run journey -- run --seed qa --no-color`
- `npm run journey -- --seed qa --json`
- `npm run journey -- --seed qa --debug --no-color`
- `npm run journey -- --seed qa --shape probability_ladder --no-color`
- `npm run journey -- --seed qa --count 5 --json`

The expected result is that each command exits successfully, generated
manifests pass the essential runtime assertions, normal and JSON rendering
include production manifest data, debug output describes production generation
state, and batch generation returns exactly the requested number of manifests
without fingerprint or validation-report fields.
