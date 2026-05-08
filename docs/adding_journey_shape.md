# Adding a Journey Shape

Journey shapes are source-local TypeScript plugins under `src/journey/shapes/`.
They are intentionally static imports, not runtime-discovered packages, so the
NodeNext build remains deterministic and typecheckable.

## Normal Checklist

1. Add a shape module in `src/journey/shapes/`.
   - Export one `JourneyShapePlugin`.
   - Prefer `defineShapePlugin()` from `src/journey/shapes/shared.ts`.
   - Set `definition`, `scoreWeight`, `repair.actions`, and any
     `generatedObjects` or `validators` metadata.
   - Provide a custom `fill(args)` when the shape is not reusing an existing
     filler primitive.
2. Add the plugin import and registry entry in
   `src/journey/shapes/registry.ts`.
   - Registry order is canonical generation/debug/content-version order.
   - Duplicate IDs fail during module initialization.
3. Add focused tests or fixtures.
   - Registry metadata belongs in `test/journey-shapes.test.ts`.
   - Generation behavior belongs in `test/journey-generation.test.ts`.
   - Validation behavior should target the shape validator rule that owns the
     invariant.
4. Run:
   - `npm run typecheck`
   - `npm test`
   - `npm run journey -- --seed qa --no-color`
   - `npm run journey -- run --seed qa --no-color`
   - `npm run journey -- --seed qa --json`
   - `npm run journey -- --seed qa --debug --no-color`
   - `npm run journey -- --seed qa --shape <new_shape_id> --no-color`

## Plugin Responsibilities

A shape plugin owns:

- `id`
- `definition`
- `scoreWeight`
- `fill(args)`
- optional shape-specific `validators`
- optional structured `repair.actions`
- optional fallback rank
- optional generated-object policy
- optional debug-payload compatibility metadata
- optional version contribution

Shared systems still own manifest schema, content loading, deterministic
selection, operation adapters, target resolution, renderer output, generic
validation, debug fixture implementations, and content-version hashing.

## Boundaries

Adding a shape that uses existing manifest primitives should require one shape
module, one registry entry, and tests.

A shape that introduces a new operation kind still needs shared manifest,
operation adapter, validation, and renderer work.

A shape that introduces a new output layout still needs renderer changes.

Runtime external shape plugins are out of scope for this architecture.
