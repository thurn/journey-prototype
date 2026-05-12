# Migrating Journey Shapes to the Shared System

This guide describes the current migration target for Journey shapes that use
the directory-backed plugin structure, shared effect data in
`src/journey/shared/`, and the shape-level standard-validation bypass used by
`random_rewards`, `random_trades`, and `one_operation_many_targets`.

Use this guide when moving an existing shape into the current structure or when
writing a shape that should own its fill algorithm directly instead of routing
through broad generator infrastructure.

## Target Structure

A migrated shape lives in its own directory:

```text
src/journey/shapes/<shape_id>/
  index.ts
  fill.ts
  validators.ts       # optional
  tree.ts             # optional for decision-tree shapes
  *.ts                # optional shape-local helpers
```

`index.ts` declares the plugin. `fill.ts` owns the shape algorithm. Shape-local
helpers stay in the shape directory. Data and behavior that are useful to more
than one migrated shape belong in `src/journey/shared/`.

The registry imports the directory entry point:

```ts
import { examplePlugin } from "./example/index.js";
```

The shape directory should be deletable with only its registry import breaking.
Shared modules may keep general-purpose reward, cost, predicate, content,
target, and text helpers, but they should not know about the shape registry or
import from shape directories.

## Plugin Definition

Shapes that own their fill output and intentionally bypass the standard
validation pipeline use this definition shape:

```ts
import { defineShapePlugin } from "../shared.js";
import { exampleFill } from "./fill.js";

export const examplePlugin = defineShapePlugin({
  definition: {
    id: "example",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    payloadCompatibility: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Example",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "example",
      topology: "direct_menu",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    bypassStandardValidation: true,
  },
  fill: exampleFill,
});
```

The validation bypass keeps the universal checks active:

- manifest schema version
- manifest version metadata
- Journey ID format
- root option count

Use a bypassed shape only when the fill algorithm itself owns the shape's
coherence. Keep the output deterministic and complete enough for renderer,
debug, reachability, and JSON surfaces.

## Fill Function Contract

The fill function receives `ShapeFillArgs` and returns `FilledJourney`:

```ts
export function exampleFill(args: ShapeFillArgs): FilledJourney {
  return {
    options,
    precommitted: {},
    symmetryContracts,
  };
}
```

Each direct-menu option should be a complete `JourneyOption`:

- stable `number`
- user-facing `text`
- `symbols`
- structured `operations` when the shape participates in debug/reachability
- empty arrays for unused `costs`, `effects`, `burdens`, `targets`,
  `triggers`, and `routeEffects`
- converted essence fields
- `pickBehavior: "record_and_generate_next"`

For bypassed shapes, `operations` can be empty when the shape is purely
text/CEC driven, as in `random_rewards`. Use lightweight operations when
reachability, debug output, target resolution, or brainstorm matrix coverage
needs structured evidence, as in `one_operation_many_targets`.

## Shared Data

Put reusable effect data in `src/journey/shared/`:

- `rewards.ts` for reward templates and reusable reward-like effects
- `costs.ts` for cost templates
- `predicates.ts` for target predicates and multipliers
- `content.ts` for thin helpers over content and quest state
- `cec.ts` for converted essence math
- `text.ts` for small rendering helpers
- `types.ts` for shared template types

Shared templates should own:

- an `id`
- selection `weight`
- deterministic parameter rolling
- viability checks
- CEC calculation
- text rendering
- optional operation metadata builders

Keep shape-specific orchestration in the shape directory. Shared templates
should describe reusable effects; the shape chooses how to assemble them into
its menu topology.

## Migration Steps

1. Inventory all references to the shape ID.

   ```bash
   rg '"<shape_id>"' src test docs
   rg '<ShapeName>|<shape_id>' src test
   ```

2. Create `src/journey/shapes/<shape_id>/index.ts` with a
   `defineShapePlugin()` declaration.

3. Create `fill.ts` and implement the shape's deterministic generation
   algorithm against `ShapeFillArgs`.

4. Move shape-specific helper code into the shape directory. Promote genuinely
   reusable effect data into `src/journey/shared/`.

5. Update `src/journey/shapes/registry.ts` to import the directory entry point.

6. Update generated-object policy in `src/journey/shapes/shared.ts` when the
   migrated shape should use its own fill output instead of natural generated
   object substitution.

7. Add the shape ID to `MIGRATED_SHAPE_IDS` in
   `test/journey-shape-isolation.test.ts`.

8. Update focused tests for the current validation contract. For bypassed
   shapes, assertions should expect the universal validation checks and should
   not assert failures from skipped heavy validators.

9. Run focused verification.

10. Commit and push the migration.

## Tests and QA

Slow tests are not required for these migrations. Use focused checks that cover
the touched surface:

```bash
npm run typecheck
npx vitest run test/journey-shapes.test.ts test/journey-shape-isolation.test.ts
npx vitest run test/journey-generation.test.ts --testNamePattern "<shape_id>|<known coverage row>"
npm run journey -- --seed qa --shape <shape_id> --no-color
npm run journey -- --seed qa --shape <shape_id> --json
npm run journey -- --seed qa --shape <shape_id> --debug --no-color
```

Run broader tests when a migration touches shared reward/cost templates,
registry behavior, CLI command behavior, renderer output, or reachability
metadata:

```bash
npx vitest run test/shared/rewards.test.ts
npx vitest run test/shapes/random_rewards.test.ts test/shapes/random_trades.test.ts
npm test
```

For docs-only edits, automated tests are usually unnecessary. Check formatting
with:

```bash
git diff --check
```

## Debug and Reachability

Use structured operations when the shape should appear in reachability evidence
or debug output. A minimal useful pattern is:

- one `reward`, `cost`, `route_edit`, `status`, or similar operation for the
  consequence
- one `target` operation when a visible target varies by option
- `value.convertedEssence` on consequence operations
- `targetSelector` for target resolution metadata
- stable `operationId` values based on shape ID and option number

Use `symmetryContracts` when the menu has a meaningful shared axis:

```ts
{
  contractKind: "shared_axis_rotated_attribute",
  sharedProperty: "operation=apply_transfiguration:Scarlet",
  variedProperty: "visible_named_card_target",
  sharedFirst: true,
  optionNumbers: [1, 2, 3],
  sharedPayloadKeys: ["operation=apply_transfiguration:Scarlet"],
  variedPayloadKeys: [
    "visible_named_card_target=card:...",
    "visible_named_card_target=card:...",
    "visible_named_card_target=card:...",
  ],
}
```

This keeps debug output, semantic fingerprints, and brainstorm reachability
aligned with the shape's actual menu topology.

## Review Checklist

Before committing, verify:

- The shape plugin has its own directory and explicit `fill`.
- `bypassStandardValidation` is set only when the fill owns coherence.
- The validation rule list contains the universal rules for bypassed shapes.
- `rootOptionCount` matches the fill's actual menu size.
- Shared templates are reusable and shape orchestration stays shape-local.
- The registry imports the directory entry point.
- The isolation test includes the migrated shape ID.
- Forced CLI output renders the migrated shape with a fixed seed.
- JSON output parses and includes expected options.
- Debug output shows expected validation, operations, and symmetry evidence.
