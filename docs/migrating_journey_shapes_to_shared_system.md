# Migrating Journey Shapes to the Shared System

This guide describes the current migration target for Journey shapes that use
the directory-backed plugin structure, shared effect data in
`src/journey/shared/`, and the shape-level standard-validation bypass used by
`random_rewards`, `random_trades`, and `one_operation_many_targets`.

Use this guide when moving an existing shape into the current structure or when
writing a shape that should own its fill algorithm directly instead of routing
through broad generator infrastructure.

The long-term destination for this project is to delete
`src/journey/fillers`, `src/journey/fixtures`, and `src/journey/validate`.
Migration work should avoid adding imports, test fixtures, helper paths, or
behavioral dependencies that make those directories harder to retire.

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
      catalogVersion: "journey-shapes:v23",
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
debug, and JSON surfaces.

## Fill Function Contract

The fill function receives `ShapeFillArgs` and returns `FilledJourney`:

```ts
export function exampleFill(args: ShapeFillArgs): FilledJourney {
  return {
    options,
    precommitted: {},
  };
}
```

Each direct-menu option should be a complete `JourneyOption`:

- stable `number`
- user-facing `text`
- `symbols`
- empty `operations`
- empty arrays for unused `costs`, `effects`, `burdens`, `targets`,
  `triggers`, and `routeEffects`
- converted essence fields
- `pickBehavior: "record_and_generate_next"`

New migrated shapes are text/CEC driven. They keep structured `operations`
empty and omit `symmetryContracts`. Debug output should rely on the
manifest, option text, option values, validation report, and semantic
fingerprint.

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

Keep shape-specific orchestration in the shape directory. Shared templates
should describe reusable effects; the shape chooses how to assemble them into
its menu topology.

## Shared Reward and Cost Audit

Before implementing a migrated shape, audit `src/journey/shared/rewards.ts`.
When the shape's menu topology includes explicit costs, audit
`src/journey/shared/costs.ts` as well. The audit should answer this question:
what is the largest number of existing rewards that will work with the target
Journey shape?

Use the existing audit documents as models:

- `docs/2026-05-12-one-operation-many-targets-reward-axis-audit.md`
- `docs/2026-05-12-one-target-many-operations-shared-rewards-audit.md`

The audit should classify shared templates by the shape axis they can support:
target, operation, predicate, named object, resource amount, duration, site
type, Dreamsign surface, or another axis that is meaningful for the shape being
migrated. Treat `src/journey/fillers` content as non-authoritative reference
material, and build the migration around the shared reward and cost templates
instead of preserving filler structure.

Migrated shapes should try to adapt existing `rewards.ts` templates to their
target topology. Defining new rewards should be unusual; prefer small,
shape-local assembly code that selects, groups, filters, or parameterizes the
shared templates already available. The default generation policy is that every
shared reward or cost is eligible whenever its own viability check passes.
Shape-specific filters should be light and should exist only to preserve the
shape's topology, avoid incoherent text, or satisfy a clear balance constraint.

CEC balancing is a secondary migration concern, but the generated options
should have roughly equivalent value once rewards and costs are combined. Use
each reward's CEC value as the positive side of the option. Costs subtract CEC
value from their paired reward, so a high-value reward can remain comparable to
other menu options when it carries an appropriate cost.

## Migration Steps

1. Inventory all references to the shape ID.

   ```bash
   rg '"<shape_id>"' src test docs
   rg '<ShapeName>|<shape_id>' src test
   ```

2. Audit `src/journey/shared/rewards.ts`, and audit
   `src/journey/shared/costs.ts` when the shape has an explicit cost axis.
   Classify existing templates by the axes the target shape can vary, and
   design the migration around the largest viable set of existing shared
   templates.

3. Create `src/journey/shapes/<shape_id>/index.ts` with a
   `defineShapePlugin()` declaration.

4. Create `fill.ts` and implement the shape's deterministic generation
   algorithm against `ShapeFillArgs`.

5. Move shape-specific helper code into the shape directory. Promote genuinely
   reusable effect data into `src/journey/shared/`.

6. Update `src/journey/shapes/registry.ts` to import the directory entry point.

7. Update generated-object policy in `src/journey/shapes/shared.ts` when the
   migrated shape should use its own fill output instead of natural generated
   object substitution.

8. Add the shape ID to `MIGRATED_SHAPE_IDS` in
   `test/journey-shape-isolation.test.ts`.

9. Update focused tests for the current validation contract. For bypassed
   shapes, assertions should expect the universal validation checks and should
   not assert failures from skipped heavy validators.

10. Run focused verification.

11. Commit and push the migration.

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
registry behavior, CLI command behavior, or renderer output:

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
- Debug output shows expected validation and option value evidence.
