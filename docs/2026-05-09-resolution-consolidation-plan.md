# Resolution Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ~40 bespoke per-example "resolution" entries in the procedural Journey generator with a small number of cross-cutting structural mechanisms, three reusable symmetry-contract patterns, and eight focused content primitives.

**Architecture:** Five orthogonal generator changes (a generic compound composer, an independent-rows menu shape, slot-driven compatibility traits, a cartesian trigger × resolution registry, and predicate-axis expansion on operation entries) cover the bulk of currently unreachable brainstorm shapes. Three parameterized symmetry contracts cover the residual aesthetic-coherence cases. Eight new primitives fill the remaining gaps that are neither compositional nor symmetric.

**Tech Stack:** TypeScript (strict), Node (tsx for dev), vitest (`npm test`), `tsc --noEmit` for typecheck. Code lives under `src/journey/`; tests live under `test/*.test.ts`. Files are `snake_case`, identifiers are `camelCase`. Each Journey shape is an isolated plugin under `src/journey/shapes/<id>/` and is registered in `src/journey/shapes/registry.ts`. A shape-isolation test (`test/journey-shape-isolation.test.ts`) enforces that nothing outside a shape's directory references that shape's id.

---

## Background: subsystems this plan touches

A reader new to the codebase needs to know about the following five pieces. All file paths are absolute under the project root.

1. **Compound payload menu** — `src/journey/shapes/service_menu/compoundPayloads.ts`. Function `compoundPayloadMenuFill` (line 1232) picks one of four hard-coded "families" (`scissor_saint`, `molting_archive`, `withered_orchard`, `mixed_service`) via weighted choice and dispatches to a per-family fill function.
2. **Shape registry** — `src/journey/shapes/registry.ts`. `BUILTIN_SHAPE_PLUGINS` is a frozen array of plugin objects, each defined via `defineShapePlugin({...})` in `src/journey/shapes/<id>/index.ts`. Adding a shape means: create the directory, define the plugin, add the import + array entry. `JourneyShapeDefinition` lives at `src/journey/shapes/types.ts:55-71`.
3. **Card and Dreamsign operation catalogs** — `src/journey/fillers/cardOperationCatalog.ts` and `src/journey/fillers/dreamsignOperationCatalog.ts`. Each entry has the shape `MaterializedCardOperation & { topologies, targetClasses, contextFree?, materialize? }` (cardOperationCatalog.ts:83-90). Today, `topologies` is a per-entry allow-list of which shape topologies the operation may appear in.
4. **Delayed-hook payloads** — `src/journey/fillers/hookPayloads.ts`. Function `expandedDelayedHookCandidates` (line 750) returns ~12 hand-picked candidate hook fills for the `delayed_hook` topology. Triggers are an enum at `src/journey/manifest.ts:145-166` (`HookTriggerSelector.triggerKind`); resolutions are reward-kind strings used inline.
5. **Symmetry contracts** — `JourneySymmetryContractDebug` at `src/journey/manifest.ts:898-916` is a discriminated record describing how a fill's options relate. Helper `symmetryContract()` at `src/journey/fillers/shared.ts:265-278`. Each shape's fill function constructs zero or more contracts and returns them on `FilledJourney.symmetryContracts`.

Other touched subsystems: `naturalStatusBody` at `src/journey/fillers/generatedObjects.ts:411-533` (three archetypes for natural status objects); `draftCards` at `src/journey/fillers/shared.ts:645-661`; the test entry points `test/journey-generation.test.ts`, `test/journey-shapes.test.ts`, and `test/journey-shape-isolation.test.ts`.

---

## Conventions used by every phase

- **TDD.** Every task starts with a failing test, then minimal code, then commit.
- **Commands.**
  - Targeted test: `npm test -- <pathOrName>` (vitest pattern match).
  - Full suite: `npm test`.
  - Typecheck only: `npm run typecheck`.
  - Smoke a generator seed: `npm run journey -- --seed qa`.
- **Commit cadence.** One commit per task. Detailed descriptions per `AGENTS.md`.
- **No edits outside the listed files** for any task. If a task says "modify X", only X (plus its test) changes.
- **Shape-isolation.** When a phase adds a new shape, its directory must contain everything specific to it. The deletion check `grep -rn '"<shape_id>"' src test | grep -v shapes/<shape_id>` should return nothing.
- **No deprecated-shim retention.** When a refactor replaces an internal function with a more general one, delete the old function in the same commit. Do NOT leave the old function as a thin wrapper "for backward compatibility" — internal callers can be updated.
- **Test helpers.** Several tasks reference test helpers like `makeTestContext({ seed })`, `runShapeValidators(shapeId, manifest)`, `synthesizeIdenticalRowsManifest()`, `synthesizeDistinctEverythingTrioWithDuplicates()`, `forceArchetype(fn, archetypeId, drawContext)`, and `validateManifest(manifest)`. Before writing the first test in any phase, search `test/helpers/` and `test/fixtures/` for an equivalent helper. If one exists, use it; if not, add a minimal helper to `test/helpers/journey-context.ts` (or create the file) in the same task as the first test that needs it, and commit the helper with the test.

---

# Phase 1 — Generic bundle composer (Structural Fix #1)

**Motivation.** Today every new "single option containing one cost/burden + one reward" pairing requires writing a new fill function and threading it into `compoundPayloadMenuFill`. Roughly 40% of the currently-unreachable Journey patterns boil down to "I want to bundle X (cost or burden) with Y (reward) inside one option." The four existing families (`scissor_saint`, `molting_archive`, `withered_orchard`, `mixed_service`) are all instances of this same operation with different pool selections.

**Scope.** Introduce a single composer `genericBundleOption({ context, drawContext, label, costSource, rewardSource, renderer? })` that produces one `ResolvedShapeFillOption`. Refactor the four existing family fill functions to delegate to it. Replace the per-family weighted dispatch in `compoundPayloadMenuFill` with iteration over a configuration registry (`COMPOUND_BUNDLE_FAMILIES`) where each family is one record describing its cost source, reward source, weight, and `fillKind`.

**Files:**
- Create: `src/journey/shapes/service_menu/genericBundleOption.ts`
- Create: `src/journey/shapes/service_menu/compoundBundleFamilies.ts`
- Modify: `src/journey/shapes/service_menu/compoundPayloads.ts` (refactor four family handlers + dispatch)
- Test: `test/compound-bundle-composer.test.ts`

### Task 1.1: Add `BundleSource` types and `genericBundleOption` skeleton

- [ ] **Step 1: Write the failing test**

```typescript
// test/compound-bundle-composer.test.ts
import { describe, expect, it } from "vitest";
import { genericBundleOption } from "../src/journey/shapes/service_menu/genericBundleOption.js";
import { makeTestContext } from "./helpers/journey-context.js";

describe("genericBundleOption", () => {
  it("returns a single ResolvedShapeFillOption with one cost and one reward payload", () => {
    const { context, drawContext } = makeTestContext({ seed: "bundle-1" });
    const result = genericBundleOption({
      context,
      drawContext,
      label: "test-bundle",
      stage: "mid",
      costSource: { kind: "fixed_essence", amount: 100 },
      rewardSource: { kind: "fixed_card_draft", profileId: "any_basic" },
    });
    expect(result).toBeDefined();
    expect(result!.payloads).toHaveLength(2);
    expect(result!.payloads[0]!.kind).toBe("essence_cost");
    expect(result!.payloads[1]!.kind).toBe("card_draft");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- compound-bundle-composer`
Expected: FAIL — `genericBundleOption` not exported.

- [ ] **Step 3: Implement minimal `genericBundleOption`**

Create `src/journey/shapes/service_menu/genericBundleOption.ts` with a `BundleCostSource` discriminated union (`"fixed_essence" | "burden_pool" | "delayed_bane" | ...`), a `BundleRewardSource` discriminated union (`"fixed_card_draft" | "named_card_grant" | "card_operation" | ...`), and a `genericBundleOption` function that pattern-matches each source kind and produces the corresponding payload via existing helpers (`baneBurden`, `draftCards`, etc.). The function returns `{ key, label, payloads: [costPayload, rewardPayload], renderText }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- compound-bundle-composer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/service_menu/genericBundleOption.ts test/compound-bundle-composer.test.ts
git commit -m "Add genericBundleOption composer that pairs one cost source with one reward source

Introduces a single function that takes declarative cost and reward source
descriptors and produces one bundled option payload. This is the foundation
for replacing the four bespoke compound-family fill functions with one
parameterized composer."
```

### Task 1.2: Move scissor_saint, molting_archive, withered_orchard, mixed_service into a config registry

- [ ] **Step 1: Write the failing test**

```typescript
// test/compound-bundle-composer.test.ts (add)
import {
  COMPOUND_BUNDLE_FAMILIES,
  buildBundleFamilyOption,
} from "../src/journey/shapes/service_menu/compoundBundleFamilies.js";

describe("COMPOUND_BUNDLE_FAMILIES", () => {
  it("contains entries for the four legacy families with positive weights", () => {
    const ids = COMPOUND_BUNDLE_FAMILIES.map((f) => f.id).sort();
    expect(ids).toEqual([
      "mixed_service",
      "molting_archive",
      "scissor_saint",
      "withered_orchard",
    ]);
    for (const family of COMPOUND_BUNDLE_FAMILIES) {
      expect(family.weight).toBeGreaterThan(0);
    }
  });

  it("buildBundleFamilyOption produces a valid option for each family", () => {
    const { context, drawContext } = makeTestContext({ seed: "bundle-2" });
    for (const family of COMPOUND_BUNDLE_FAMILIES) {
      const option = buildBundleFamilyOption({
        context,
        drawContext,
        family,
        label: `${family.id}-test`,
        stage: "mid",
        shapeId: "service_menu",
      });
      expect(option, `family ${family.id} returned undefined`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- compound-bundle-composer`
Expected: FAIL — `COMPOUND_BUNDLE_FAMILIES` not defined.

- [ ] **Step 3: Implement the registry**

Create `src/journey/shapes/service_menu/compoundBundleFamilies.ts`. Define:

```typescript
export type CompoundBundleFamily = {
  readonly id: "scissor_saint" | "molting_archive" | "withered_orchard" | "mixed_service";
  readonly weight: number;
  readonly fillKind: `compound_payload:${CompoundBundleFamily["id"]}`;
  readonly costSource: BundleCostSource;
  readonly rewardSource: BundleRewardSource;
};

export const COMPOUND_BUNDLE_FAMILIES: readonly CompoundBundleFamily[] = [
  { id: "scissor_saint",   weight: 3, fillKind: "compound_payload:scissor_saint",   costSource: { /* extracted from existing scissorSaintCompoundFill */ }, rewardSource: { /* same */ } },
  { id: "molting_archive", weight: 3, fillKind: "compound_payload:molting_archive", costSource: { /* ... */ }, rewardSource: { /* ... */ } },
  { id: "withered_orchard",weight: 3, fillKind: "compound_payload:withered_orchard",costSource: { /* ... */ }, rewardSource: { /* ... */ } },
  { id: "mixed_service",   weight: 1, fillKind: "compound_payload:mixed_service",   costSource: { /* ... */ }, rewardSource: { /* ... */ } },
];

export function buildBundleFamilyOption(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  family: CompoundBundleFamily;
  label: string;
  stage: JourneyStage;
  shapeId: JourneyShapeId;
}): ResolvedShapeFillOption | undefined {
  return genericBundleOption({
    context: args.context,
    drawContext: args.drawContext,
    label: args.label,
    stage: args.stage,
    costSource: args.family.costSource,
    rewardSource: args.family.rewardSource,
  });
}
```

To populate each family's `costSource` and `rewardSource`, read the existing `scissorSaintCompoundFill`, `moltingArchiveCompoundFill`, `witheredOrchardCompoundFill`, and `mixedServiceCompoundFill` in `src/journey/shapes/service_menu/compoundPayloads.ts` and translate each one's selection logic into the declarative source records. If a family currently uses logic that has no equivalent source kind, extend `BundleCostSource` / `BundleRewardSource` in `genericBundleOption.ts` to add it (e.g. `{ kind: "burden_pool", pool: "withered_orchard_burdens" }`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- compound-bundle-composer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/service_menu/compoundBundleFamilies.ts test/compound-bundle-composer.test.ts
git commit -m "Express scissor_saint, molting_archive, withered_orchard, mixed_service as data

Each of the four compound families is now a record in COMPOUND_BUNDLE_FAMILIES
describing its cost source, reward source, weight, and fillKind. Adding a new
family requires a registry entry rather than a new fill function."
```

### Task 1.3: Replace the per-family dispatch in `compoundPayloadMenuFill`

- [ ] **Step 1: Write the failing test**

```typescript
// test/compound-bundle-composer.test.ts (add)
import { compoundPayloadMenuFill } from "../src/journey/shapes/service_menu/compoundPayloads.js";

describe("compoundPayloadMenuFill (registry-driven)", () => {
  it("never dispatches to per-family fill functions", () => {
    // Static assertion via grep is also done in the deletion check; here
    // we assert behaviour: every fill it returns has a fillKind matching one
    // of the registry entries.
    const allowed = new Set(COMPOUND_BUNDLE_FAMILIES.map((f) => f.fillKind));
    const { context, drawContext } = makeTestContext({ seed: "bundle-3" });
    for (let i = 0; i < 25; i += 1) {
      const fill = compoundPayloadMenuFill({
        context,
        drawContext: drawContext.fork(`iter-${i}`),
        label: `iter-${i}`,
        shapeId: "service_menu",
        stage: "mid",
      });
      if (fill !== undefined) {
        expect(allowed.has(fill.fillKind)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- compound-bundle-composer`
Expected: PASS or FAIL depending on whether dispatch already matches; the assertion exists to prevent regression once we delete the per-family functions.

- [ ] **Step 3: Replace dispatch and delete the four legacy fill functions**

In `src/journey/shapes/service_menu/compoundPayloads.ts`, replace the body of `compoundPayloadMenuFill` (currently lines 1232-1268) with:

```typescript
export function compoundPayloadMenuFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  family?: CompoundBundleFamily["id"];
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): ResolvedShapeFill | undefined {
  const family = args.family
    ? COMPOUND_BUNDLE_FAMILIES.find((f) => f.id === args.family)
    : weightedChoice(
        args.drawContext,
        `${args.label}:compound-family`,
        COMPOUND_BUNDLE_FAMILIES.map((f) => ({ item: f, weight: f.weight })),
      );
  if (!family) return undefined;

  const option = buildBundleFamilyOption({
    context: args.context,
    drawContext: args.drawContext,
    family,
    label: args.label,
    stage: args.stage,
    shapeId: args.shapeId,
  });
  if (!option) return undefined;

  return { fillKind: family.fillKind, options: [option] };
}
```

Delete `scissorSaintCompoundFill`, `moltingArchiveCompoundFill`, `witheredOrchardCompoundFill`, `mixedServiceCompoundFill`, and any per-family helpers used only by them.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, including the existing snapshot/coverage tests in `test/journey-generation.test.ts`. If a generation test that previously asserted exact essence amounts or exact card names breaks because the new composer makes slightly different deterministic choices for the same seed, the test must be updated to assert behaviour ("the option contains one cost and one reward of the expected families") rather than exact strings — do NOT re-introduce the old fill functions to make a brittle test pass.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/service_menu/compoundPayloads.ts
git commit -m "Drive compound payload dispatch from COMPOUND_BUNDLE_FAMILIES

compoundPayloadMenuFill now iterates the registry to pick a family by weight
and delegates to genericBundleOption. The four bespoke per-family fill
functions are deleted; new families are added by appending to the registry."
```

### Task 1.4: Add a fifth registry-only family to prove extensibility

- [ ] **Step 1: Write the failing test**

```typescript
// test/compound-bundle-composer.test.ts (add)
describe("registry extensibility", () => {
  it("supports a fifth family added by configuration only", () => {
    const ids = COMPOUND_BUNDLE_FAMILIES.map((f) => f.id);
    expect(ids).toContain("bane_purge_plus_essence");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- compound-bundle-composer`
Expected: FAIL.

- [ ] **Step 3: Add `bane_purge_plus_essence` to the registry**

Append a new entry to `COMPOUND_BUNDLE_FAMILIES` in `src/journey/shapes/service_menu/compoundBundleFamilies.ts`:

```typescript
{
  id: "bane_purge_plus_essence",
  weight: 2,
  fillKind: "compound_payload:bane_purge_plus_essence",
  costSource: { kind: "delayed_bane", baneCount: 1, timing: "next_2_battles" },
  rewardSource: { kind: "fixed_essence_gain", amount: 150 },
},
```

Update the `id` and `fillKind` union types to include `"bane_purge_plus_essence"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/service_menu/compoundBundleFamilies.ts
git commit -m "Add bane_purge_plus_essence as the first registry-only compound family

Demonstrates that a new pairing now requires only a registry entry rather
than a new fill function."
```

**Phase 1 acceptance criteria:**
- `compoundPayloadMenuFill` does not contain a switch over family ids; dispatch is driven by `COMPOUND_BUNDLE_FAMILIES`.
- All four original families plus one new family are present in the registry; full test suite passes.
- The four legacy `*CompoundFill` functions are deleted from the codebase (`grep -rn 'scissorSaintCompoundFill\|moltingArchiveCompoundFill\|witheredOrchardCompoundFill\|mixedServiceCompoundFill' src test` returns nothing).

---

# Phase 2 — Independent-rows menu shape (Structural Fix #2)

**Motivation.** The shape catalog is built around "shared X / varied Y" axioms (`same_cost_different_rewards`, `same_reward_different_costs`, `shared_prefix_menu` all force one shared element). When a brainstorm has *no* shared axis — every row carries an independently chosen cost AND an independently chosen reward — no shape fits, and the brainstorm becomes "not generatable."

**Scope.** Add a new isolated shape plugin `independent_rows_menu` under `src/journey/shapes/independent_rows_menu/` whose `rootOptionCount` is `{ min: 2, max: 3 }` and whose fill function draws each row independently from configured pools. Register it in `src/journey/shapes/registry.ts`. Add the corresponding plugin tests.

**Files:**
- Create: `src/journey/shapes/independent_rows_menu/index.ts`
- Create: `src/journey/shapes/independent_rows_menu/fill.ts`
- Create: `src/journey/shapes/independent_rows_menu/validators.ts`
- Modify: `src/journey/shapes/registry.ts`
- Test: `test/independent-rows-menu.test.ts`

### Task 2.1: Define the plugin and register it

- [ ] **Step 1: Write the failing test**

```typescript
// test/independent-rows-menu.test.ts
import { describe, expect, it } from "vitest";
import { getShapePlugin } from "../src/journey/shapes/registry.js";

describe("independent_rows_menu plugin", () => {
  it("is registered with rootOptionCount 2-3", () => {
    const plugin = getShapePlugin("independent_rows_menu");
    expect(plugin).toBeDefined();
    expect(plugin!.definition.rootOptionCount).toEqual({ min: 2, max: 3 });
    expect(plugin!.definition.topology).toBe("direct_menu");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- independent-rows-menu`
Expected: FAIL — plugin not registered.

- [ ] **Step 3: Define the plugin skeleton**

Create `src/journey/shapes/independent_rows_menu/index.ts` modeled on `src/journey/shapes/same_cost_different_rewards/index.ts`. Set `id: "independent_rows_menu"`, `topology: "direct_menu"`, `rootOptionCount: { min: 2, max: 3 }`, `supportedTags: ["menu", "heterogeneous"]`. For `payloadCompatibility`, mark `adapter`, `card`, `dreamsign`, `bane`, `resource`, and `generated_object` as `legal`; the rest as `unsupported`. Set `validationRules` to include `commonValidationRules` plus `"each_row_draws_from_configured_pool"` and `"rows_are_pairwise_distinct_on_at_least_one_axis"`. Set `repairPreferences: ["resample_distinct_row", "swap_pool_assignment"]`. Set `compoundCoherence: "skip"` and `requiresPrecommittedRandom: false`.

Create `src/journey/shapes/independent_rows_menu/fill.ts` with a stub:

```typescript
import type { FilledJourney, ShapeFillArgs } from "../types.js";

export function independentRowsMenuFill(_args: ShapeFillArgs): FilledJourney | undefined {
  return undefined;
}
```

Create `src/journey/shapes/independent_rows_menu/validators.ts` with an empty `validators` array (typed `readonly ShapeValidator[]`) — full validators come in Task 2.3.

In `src/journey/shapes/registry.ts`: add `import { independentRowsMenuPlugin } from "./independent_rows_menu/index.js";` (alphabetically) and append to `BUILTIN_SHAPE_PLUGINS` array near the other direct-menu plugins.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- independent-rows-menu && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/independent_rows_menu/ src/journey/shapes/registry.ts test/independent-rows-menu.test.ts
git commit -m "Scaffold independent_rows_menu shape plugin

A direct_menu topology shape with rootOptionCount 2-3 intended to host menus
where every row carries an independently chosen cost and reward (no shared
axis). Fill is stubbed; configuration registry and validators land in
follow-up commits."
```

### Task 2.2: Implement the row-pool configuration registry and fill function

- [ ] **Step 1: Write the failing test**

```typescript
// test/independent-rows-menu.test.ts (add)
import { independentRowsMenuFill } from "../src/journey/shapes/independent_rows_menu/fill.js";
import { ROW_POOL_CONFIGURATIONS } from "../src/journey/shapes/independent_rows_menu/rowPools.js";

describe("independentRowsMenuFill", () => {
  it("produces 2 or 3 options where each option's payloads come from a registered pool", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "indep-1" });
    const filled = independentRowsMenuFill({ context, drawContext, stage });
    expect(filled).toBeDefined();
    expect(filled!.options.length).toBeGreaterThanOrEqual(2);
    expect(filled!.options.length).toBeLessThanOrEqual(3);
    for (const opt of filled!.options) {
      expect(opt.payloads.length).toBeGreaterThan(0);
    }
  });

  it("two options never produce identical (cost, reward) tuples", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "indep-2" });
    const filled = independentRowsMenuFill({ context, drawContext, stage })!;
    const tuples = filled.options.map((o) =>
      o.payloads.map((p) => `${p.kind}:${JSON.stringify(p)}`).join("|"),
    );
    expect(new Set(tuples).size).toBe(tuples.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- independent-rows-menu`
Expected: FAIL — fill returns undefined.

- [ ] **Step 3: Implement the fill function with a row-pool registry**

Create `src/journey/shapes/independent_rows_menu/rowPools.ts`:

```typescript
import type { BundleCostSource, BundleRewardSource } from "../service_menu/genericBundleOption.js";

export type RowPool = {
  readonly id: string;
  readonly weight: number;
  readonly costSources: readonly BundleCostSource[];
  readonly rewardSources: readonly BundleRewardSource[];
};

export const ROW_POOL_CONFIGURATIONS: readonly RowPool[] = [
  {
    id: "essence_for_card_draft",
    weight: 3,
    costSources: [
      { kind: "fixed_essence", amount: 80 },
      { kind: "fixed_essence", amount: 110 },
      { kind: "fixed_essence", amount: 140 },
    ],
    rewardSources: [
      { kind: "fixed_card_draft", profileId: "any_basic" },
      { kind: "fixed_card_draft", profileId: "premium" },
    ],
  },
  {
    id: "delayed_bane_for_essence_gain",
    weight: 2,
    costSources: [
      { kind: "delayed_bane", baneCount: 1, timing: "next_2_battles" },
      { kind: "delayed_bane", baneCount: 1, timing: "next_3_battles" },
    ],
    rewardSources: [
      { kind: "fixed_essence_gain", amount: 120 },
      { kind: "fixed_essence_gain", amount: 160 },
    ],
  },
  {
    id: "burden_for_named_card",
    weight: 2,
    costSources: [
      { kind: "burden_pool", pool: "scissor_saint_burdens" },
      { kind: "burden_pool", pool: "withered_orchard_burdens" },
    ],
    rewardSources: [
      { kind: "named_card_grant", profileId: "any_basic" },
      { kind: "named_card_grant", profileId: "premium" },
    ],
  },
];
```

Implement `src/journey/shapes/independent_rows_menu/fill.ts`:

```typescript
import { weightedChoice, pickN } from "../../util/rng.js";
import { genericBundleOption } from "../service_menu/genericBundleOption.js";
import { ROW_POOL_CONFIGURATIONS } from "./rowPools.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

export function independentRowsMenuFill(args: ShapeFillArgs): FilledJourney | undefined {
  const rowCount = args.drawContext.choose("indep:row-count", [2, 3]);
  const options = [];
  const seenSignatures = new Set<string>();
  for (let i = 0; i < rowCount; i += 1) {
    const pool = weightedChoice(
      args.drawContext,
      `indep:pool:${i}`,
      ROW_POOL_CONFIGURATIONS.map((p) => ({ item: p, weight: p.weight })),
    );
    const cost = pool.costSources[args.drawContext.index(`indep:cost:${i}`, pool.costSources.length)]!;
    const reward = pool.rewardSources[args.drawContext.index(`indep:reward:${i}`, pool.rewardSources.length)]!;
    const opt = genericBundleOption({
      context: args.context,
      drawContext: args.drawContext.fork(`indep:opt:${i}`),
      label: `indep-${i}`,
      stage: args.stage,
      costSource: cost,
      rewardSource: reward,
    });
    if (!opt) return undefined;
    const sig = JSON.stringify([cost, reward]);
    if (seenSignatures.has(sig)) return undefined;
    seenSignatures.add(sig);
    options.push({ ...opt, number: i + 1 });
  }
  return { options, precommitted: {} };
}
```

(`weightedChoice`, `pickN`, and `drawContext.choose` / `.index` / `.fork` are existing helpers in `src/journey/util/rng.js`. If a helper does not exist with that exact name, use the equivalent existing API — this plan does not invent new RNG primitives.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- independent-rows-menu`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/independent_rows_menu/
git commit -m "Implement independent_rows_menu fill with a row-pool registry

Each row independently selects a pool from ROW_POOL_CONFIGURATIONS, then
picks a cost source and reward source from that pool. The fill rejects
itself if it would produce two identical rows; the validator (next commit)
enforces this stronger over the assembled manifest."
```

### Task 2.3: Add the row-pool validators

- [ ] **Step 1: Write the failing test**

```typescript
// test/independent-rows-menu.test.ts (add)
describe("independent_rows_menu validators", () => {
  it("rejects manifests where every row uses the identical pool entry", () => {
    // Use a synthetic manifest constructed via test helpers that forces
    // identical rows; the validator should fail.
    const manifest = synthesizeIdenticalRowsManifest();
    const result = runShapeValidators("independent_rows_menu", manifest);
    expect(result.failures.map((f) => f.ruleId)).toContain(
      "rows_are_pairwise_distinct_on_at_least_one_axis",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- independent-rows-menu`
Expected: FAIL — validator not implemented.

- [ ] **Step 3: Implement the validators**

In `src/journey/shapes/independent_rows_menu/validators.ts`, define two `ShapeValidator` records (matching the type at `src/journey/shapes/types.ts:115-120`):

- `each_row_draws_from_configured_pool` — confirms each option's `(costSource, rewardSource)` pair is one of the `(costSources[i], rewardSources[j])` cartesian products of one of the registered pools.
- `rows_are_pairwise_distinct_on_at_least_one_axis` — confirms no two options share both their cost source signature and their reward source signature.

Wire the validators array into the plugin's `validators` field in `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/independent_rows_menu/
git commit -m "Add validators for independent_rows_menu

Validators enforce that each row's cost/reward pair belongs to a registered
pool and that no two rows are identical on all axes. The latter is a
generator-level guard against degenerate fills that survive the fill-time
distinctness check (e.g. via repair)."
```

### Task 2.4: Generation-coverage assertion

- [ ] **Step 1: Write the failing test**

```typescript
// test/journey-generation.test.ts (add inside the existing concurrent describe)
it("generates at least one independent_rows_menu over a 100-seed sweep", () => {
  let seen = 0;
  for (let i = 0; i < 100; i += 1) {
    const manifest = generateNextJourney({ seed: `indep-coverage:${i}` });
    if (manifest.shapeId === "independent_rows_menu") seen += 1;
  }
  expect(seen).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- journey-generation`
Expected: PASS or FAIL depending on the registry's shape-selection weights. If FAIL, raise the plugin's `scoreWeight` in `index.ts` until coverage clears the threshold (start at 0.5, raise in 0.1 increments, do not exceed 1.0 — this shape is heterogeneous and should not dominate).

- [ ] **Step 3: Tune `scoreWeight` if needed**

In `src/journey/shapes/independent_rows_menu/index.ts`, set `scoreWeight: 0.6` (or whichever value brings coverage above zero without exceeding 1.0).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/independent_rows_menu/index.ts test/journey-generation.test.ts
git commit -m "Tune independent_rows_menu scoreWeight so it appears in seed sweeps

Adds a 100-seed coverage assertion that verifies the new shape actually
gets selected by the procedural generator. scoreWeight was raised to the
minimum value that satisfies the assertion."
```

**Phase 2 acceptance criteria:**
- `independent_rows_menu` is registered and selectable; it generates without error for 100 consecutive seeds.
- Deletion check passes: `grep -rn '"independent_rows_menu"' src test | grep -v shapes/independent_rows_menu | grep -v registry.ts | grep -v independent-rows-menu.test.ts | grep -v journey-generation.test.ts` returns nothing.
- Both validators fail on synthetic counter-examples.

---

# Phase 3 — Compatibility traits replace topology allow-lists (Structural Fix #3)

**Motivation.** The `topologies` field on `CardOperationCatalogEntry` (and its Dreamsign-op analogue) was meant as a coherence check but became a hard wall: every brainstorm that wants operation X to appear in a shape with topology Y outside X's allow-list becomes "not generatable." The right model is: each operation declares the *capabilities* it needs from a slot (e.g. "single-target", "all-matching scope", "produces deck-side mutation"), and each shape slot declares the capabilities it provides. Compatibility is computed at materialization time.

**Scope.** Add a `compatibilityTraits` field to `CardOperationCatalogEntry` and its Dreamsign analogue. Define a `SlotCapability` record on the shape side. Implement a `slotAcceptsOperation(slot, entry)` predicate. Migrate operation entries from `topologies` allow-lists to traits, deleting the `topologies` field in the same commit per entry. Update the catalog query path (`requestCardOperations` or equivalent) to use the new predicate.

**Files:**
- Modify: `src/journey/fillers/cardOperationCatalog.ts`
- Modify: `src/journey/fillers/dreamsignOperationCatalog.ts`
- Create: `src/journey/fillers/operationCompatibility.ts`
- Modify: each shape's fill function that requests card or Dreamsign operations (audit by grepping for `topology:` in shape `fill.ts` files)
- Test: `test/operation-compatibility.test.ts`

### Task 3.1: Define `OperationCompatibilityTrait` and `SlotCapability` types

- [ ] **Step 1: Write the failing test**

```typescript
// test/operation-compatibility.test.ts
import { describe, expect, it } from "vitest";
import {
  slotAcceptsOperation,
  type SlotCapability,
  type OperationCompatibilityTrait,
} from "../src/journey/fillers/operationCompatibility.js";

describe("slotAcceptsOperation", () => {
  it("accepts a single-target operation in a single-target slot", () => {
    const slot: SlotCapability = { provides: ["single_target", "deck_side"] };
    const entry = {
      key: "test-op",
      compatibilityTraits: ["needs_single_target", "needs_deck_side"] as OperationCompatibilityTrait[],
    };
    expect(slotAcceptsOperation(slot, entry)).toBe(true);
  });

  it("rejects when the slot does not provide a required trait", () => {
    const slot: SlotCapability = { provides: ["single_target"] };
    const entry = {
      key: "test-op",
      compatibilityTraits: ["needs_all_matching_scope"] as OperationCompatibilityTrait[],
    };
    expect(slotAcceptsOperation(slot, entry)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- operation-compatibility`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `operationCompatibility.ts`**

```typescript
// src/journey/fillers/operationCompatibility.ts
export type OperationCompatibilityTrait =
  | "needs_single_target"
  | "needs_all_matching_scope"
  | "needs_named_target"
  | "needs_drafted_target"
  | "needs_random_predicate_target"
  | "needs_deck_side"
  | "needs_named_card_path"
  | "produces_deck_mutation"
  | "produces_text_or_subtype_mutation"
  | "produces_keyword_mutation"
  | "produces_target_restriction";

export type SlotCapability = {
  readonly provides: readonly OperationCompatibilityTrait extends infer T
    ? T extends `needs_${infer Tail}`
      ? Tail
      : never
    : never[];
};

// Or, more simply, a parallel union of trait NAMES (without the needs_/produces_ prefix):
export type SlotProvidedCapability =
  | "single_target"
  | "all_matching_scope"
  | "named_target"
  | "drafted_target"
  | "random_predicate_target"
  | "deck_side"
  | "named_card_path"
  | "deck_mutation_consumer"
  | "text_or_subtype_mutation_consumer"
  | "keyword_mutation_consumer"
  | "target_restriction_consumer";

const TRAIT_TO_CAPABILITY: Record<OperationCompatibilityTrait, SlotProvidedCapability> = {
  needs_single_target: "single_target",
  needs_all_matching_scope: "all_matching_scope",
  needs_named_target: "named_target",
  needs_drafted_target: "drafted_target",
  needs_random_predicate_target: "random_predicate_target",
  needs_deck_side: "deck_side",
  needs_named_card_path: "named_card_path",
  produces_deck_mutation: "deck_mutation_consumer",
  produces_text_or_subtype_mutation: "text_or_subtype_mutation_consumer",
  produces_keyword_mutation: "keyword_mutation_consumer",
  produces_target_restriction: "target_restriction_consumer",
};

export function slotAcceptsOperation(
  slot: { readonly provides: readonly SlotProvidedCapability[] },
  entry: { readonly compatibilityTraits: readonly OperationCompatibilityTrait[] },
): boolean {
  const provides = new Set(slot.provides);
  return entry.compatibilityTraits.every((t) => provides.has(TRAIT_TO_CAPABILITY[t]));
}
```

(Adjust the `SlotCapability` type per whichever final form you prefer — the test only asserts that the `provides` array drives acceptance.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- operation-compatibility`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/operationCompatibility.ts test/operation-compatibility.test.ts
git commit -m "Introduce OperationCompatibilityTrait and slotAcceptsOperation

A slot declares which capabilities it provides; an operation declares which
it needs (or produces). Acceptance is the subset relation. This is the
foundation for replacing the per-entry topologies allow-list with
slot-driven compatibility."
```

### Task 3.2: Add `compatibilityTraits` field to catalog entry types and populate it for one entry

- [ ] **Step 1: Write the failing test**

```typescript
// test/operation-compatibility.test.ts (add)
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";

describe("CARD_OPERATION_CATALOG entries", () => {
  it("chosen-purge declares needs_named_target and produces_deck_mutation", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "chosen-purge");
    expect(entry).toBeDefined();
    expect(entry!.compatibilityTraits).toContain("needs_named_target");
    expect(entry!.compatibilityTraits).toContain("produces_deck_mutation");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- operation-compatibility`
Expected: FAIL — `compatibilityTraits` not on entry.

- [ ] **Step 3: Add field and populate `chosen-purge`**

In `src/journey/fillers/cardOperationCatalog.ts:83-90`, change `CardOperationCatalogEntry` to:

```typescript
type CardOperationCatalogEntry = MaterializedCardOperation & {
  topologies: readonly CardOperationTopology[]; // deprecated; remove in Task 3.4
  compatibilityTraits: readonly OperationCompatibilityTrait[];
  targetClasses: readonly CardOperationTargetClass[];
  contextFree?: boolean;
  materialize?: (args: CardOperationMaterializerArgs) => MaterializedCardOperation | undefined;
};
```

If `CARD_OPERATION_CATALOG` is exported, ensure it stays exported so the test can read it; if today it is not exported, add an `export` keyword.

Add `compatibilityTraits: ["needs_named_target", "produces_deck_mutation"]` to the `chosen-purge` entry around line 452.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- operation-compatibility && npm run typecheck`
Expected: typecheck FAILS because every other entry now lacks the required `compatibilityTraits` field.

- [ ] **Step 5: Make the field optional during migration**

Change the type to `compatibilityTraits?: readonly OperationCompatibilityTrait[];`. Re-run typecheck — should now PASS. Commit:

```bash
git add src/journey/fillers/cardOperationCatalog.ts src/journey/fillers/operationCompatibility.ts test/operation-compatibility.test.ts
git commit -m "Add compatibilityTraits field to CardOperationCatalogEntry

Field is optional during the migration window. Populated for chosen-purge
as the first migrated entry; remaining entries are migrated in subsequent
commits, after which the field becomes required and topologies is dropped."
```

### Task 3.3: Migrate every card-operation entry to declare `compatibilityTraits`

- [ ] **Step 1: Write the failing test**

```typescript
// test/operation-compatibility.test.ts (add)
describe("CARD_OPERATION_CATALOG full migration", () => {
  it("every entry declares compatibilityTraits", () => {
    for (const entry of CARD_OPERATION_CATALOG) {
      expect(entry.compatibilityTraits, `entry ${entry.key} missing compatibilityTraits`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- operation-compatibility`
Expected: FAIL.

- [ ] **Step 3: Migrate each entry**

For every `CARD_OPERATION_CATALOG` entry in `src/journey/fillers/cardOperationCatalog.ts`, add a `compatibilityTraits` array derived from its current `topologies` and `family`. Mapping rules:

| Existing signal | Trait to add |
|-----------------|--------------|
| `targetModes` includes `"chosen"` or `"exact_named"` only | `needs_named_target` |
| `targetModes` includes `"all_matching"` | `needs_all_matching_scope` |
| `targetModes` includes `"random_predicate"` | `needs_random_predicate_target` |
| `targetModes` includes `"drafted_card"` | `needs_drafted_target` |
| `targetClasses` includes `"deck_card"` or `"starter_card"` | `needs_deck_side` |
| `family === "purge" \|\| family === "transfiguration"` | `produces_deck_mutation` |
| `family === "card_text_change"` (or equivalent subtype-mutation family) | `produces_text_or_subtype_mutation` |
| `family === "card_keyword_remove"` (or similar) | `produces_keyword_mutation` |
| Operation imposes a target restriction (rule-of-thumb: family includes `"target_restriction"` or operation key starts with `"restrict-"`) | `produces_target_restriction` |

If an operation could appear with multiple target modes today, add the union of relevant traits — at materialization time the slot will pick the matching subset.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/cardOperationCatalog.ts
git commit -m "Populate compatibilityTraits for every card operation catalog entry

Trait set derived from existing targetModes/targetClasses/family signals.
After this commit the field can become required and the topologies
allow-list can be removed (next commit)."
```

### Task 3.4: Switch the catalog query path to slot capabilities and remove `topologies`

- [ ] **Step 1: Write the failing test**

```typescript
// test/operation-compatibility.test.ts (add)
describe("catalog query (slot-driven)", () => {
  it("returns chosen-purge for a slot that provides named_target + deck_mutation_consumer", () => {
    const matches = queryCardOperations({
      slot: { provides: ["named_target", "deck_mutation_consumer", "deck_side"] },
      label: "test",
      count: 1,
    });
    expect(matches.some((m) => m.key === "chosen-purge")).toBe(true);
  });

  it("returns no result for a slot that provides only single_target when chosen-purge needs deck_mutation_consumer", () => {
    const matches = queryCardOperations({
      slot: { provides: ["single_target"] },
      label: "test",
      count: 1,
    });
    expect(matches.find((m) => m.key === "chosen-purge")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- operation-compatibility`
Expected: FAIL — `queryCardOperations` does not have a `slot` parameter.

- [ ] **Step 3: Update the query path**

Audit `src/journey/fillers/cardOperationCatalog.ts` for the function that currently filters by `topology` (look for usages of `entry.topologies.includes(...)` — typically inside a `requestCardOperations` or `pickCardOperations` function). Replace its filter clause with `slotAcceptsOperation(args.slot, entry)`. Add a `slot: SlotCapability` parameter to the request type. Update every caller (search shape `fill.ts` files for the old signature) to pass an explicit `slot` derived from the shape's payload-compatibility metadata.

For each shape that currently passes a `topology` to the catalog, replace with the corresponding slot capability set:
- `one_target_many_operations` → `provides: ["single_target", "named_target", "deck_side", "deck_mutation_consumer", "text_or_subtype_mutation_consumer", "keyword_mutation_consumer"]`
- `one_operation_many_targets` → `provides: ["single_target", "all_matching_scope", "deck_side", "deck_mutation_consumer"]`
- `alter_dreamscapes` → `provides: ["all_matching_scope", "deck_side", "deck_mutation_consumer", "text_or_subtype_mutation_consumer"]` (note: this one previously *blocked* `all-event-transfiguration` via topologies; the new slot DOES accept it)
- (Audit each shape's existing topology assignment and convert.)

After the conversion, **delete** the `topologies` field from every entry in `CARD_OPERATION_CATALOG` and from `CardOperationCatalogEntry`. Make `compatibilityTraits` required. Delete the `CardOperationTopology` type if nothing references it.

- [ ] **Step 4: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS. If a generation test breaks because previously-blocked operations now appear in shapes that did not have them before (e.g. `all-event-transfiguration` now showing up in `alter_dreamscapes`), update the test's expectations rather than re-introducing the topology gate.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/cardOperationCatalog.ts src/journey/fillers/operationCompatibility.ts src/journey/shapes test/operation-compatibility.test.ts
git commit -m "Replace topologies allow-list with slot-driven compatibility traits

CardOperationCatalogEntry no longer carries a topologies field; instead each
entry declares the capabilities it needs from a slot, and each shape
declares which capabilities it provides. The CardOperationTopology type
and its allow-list filter are removed."
```

### Task 3.5: Repeat the migration for the Dreamsign operation catalog

- [ ] **Step 1: Write a failing test**

Mirror Task 3.3's "every entry declares `compatibilityTraits`" test against `DREAMSIGN_OPERATION_CATALOG` from `src/journey/fillers/dreamsignOperationCatalog.ts`.

- [ ] **Step 2-5: Repeat tasks 3.1–3.4 on the Dreamsign catalog.**

The migration is mechanically identical: add the field, populate from existing `topologies`, replace the query-path filter, delete the `topologies` field. Commit each phase the same way. (The trait names defined in `operationCompatibility.ts` already cover Dreamsign needs — Dreamsigns produce text/subtype and keyword mutations using the same trait names.)

**Phase 3 acceptance criteria:**
- `CardOperationTopology` and `DreamsignOperationTopology` types are deleted.
- No call site filters operations by topology; all queries pass a `SlotCapability`.
- Brainstorm scenarios that previously failed because of topology gates (`chosen-purge` outside its three shapes, `all-event-transfiguration` in `alter_dreamscapes`, `all-card-transfiguration` inside compound use, `all-duplicate-purge` outside its allow-list) now generate at least one fill on a 100-seed sweep.

---

# Phase 4 — Trigger × resolution registry for delayed hooks (Structural Fix #4)

**Motivation.** `expandedDelayedHookCandidates` at `src/journey/fillers/hookPayloads.ts:750` is currently a hand-coded list of ~12 specific (trigger, resolution) compositions. Every new pairing requires a new explicit entry. Triggers and resolutions are independently meaningful concepts; the right model is to define each independently and generate their compositions automatically, gated by a small compatibility predicate.

**Scope.** Define a `TRIGGER_REGISTRY` (one entry per trigger kind) and a `RESOLUTION_REGISTRY` (one entry per reward-emission kind). Define a `hookCompatibility(trigger, resolution): boolean` predicate. Replace the body of `expandedDelayedHookCandidates` with a cartesian product over the two registries, filtered by the predicate, with each surviving pair instantiated through a small set of payload constructors.

**Files:**
- Create: `src/journey/fillers/hookTriggers.ts`
- Create: `src/journey/fillers/hookResolutions.ts`
- Create: `src/journey/fillers/hookCompatibility.ts`
- Modify: `src/journey/fillers/hookPayloads.ts`
- Test: `test/hook-trigger-resolution.test.ts`

### Task 4.1: Extract the trigger registry

- [ ] **Step 1: Write the failing test**

```typescript
// test/hook-trigger-resolution.test.ts
import { describe, expect, it } from "vitest";
import { TRIGGER_REGISTRY } from "../src/journey/fillers/hookTriggers.js";

describe("TRIGGER_REGISTRY", () => {
  it("contains every trigger kind from the manifest", () => {
    const expected = [
      "battle", "victory", "each_battle", "dreamscape", "site_visit",
      "named_card_play", "dreamsign_trigger", "card_added",
      "essence_payment", "future_shop", "future_dream_journey",
    ];
    for (const kind of expected) {
      expect(TRIGGER_REGISTRY.find((t) => t.kind === kind), `missing ${kind}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hook-trigger-resolution`
Expected: FAIL.

- [ ] **Step 3: Create the registry**

```typescript
// src/journey/fillers/hookTriggers.ts
import type { HookTriggerSelector } from "../manifest.js";

export type TriggerEntry = {
  readonly kind: HookTriggerSelector["triggerKind"];
  readonly defaultLabel: string;
  readonly defaultCount: number;
  readonly trackText: (label: string) => string;
  readonly producesObservableEvent: boolean; // used by compatibility predicate
  readonly emitsResource: "essence" | "card" | "bane" | "dreamsign" | "none";
};

export const TRIGGER_REGISTRY: readonly TriggerEntry[] = [
  { kind: "battle",              defaultLabel: "after the next battle",      defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "none" },
  { kind: "victory",             defaultLabel: "after the next victory",     defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "essence" },
  { kind: "each_battle",         defaultLabel: "each battle",                defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "none" },
  { kind: "dreamscape",          defaultLabel: "after the next dreamscape",  defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "none" },
  { kind: "site_visit",          defaultLabel: "on the next site visit",     defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "none" },
  { kind: "named_card_play",     defaultLabel: "the next time you play",     defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "card" },
  { kind: "dreamsign_trigger",   defaultLabel: "the next Dreamsign trigger", defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "dreamsign" },
  { kind: "card_added",          defaultLabel: "the next card you add",      defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: true,  emitsResource: "card" },
  { kind: "essence_payment",     defaultLabel: "after paying essence",       defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: false, emitsResource: "essence" },
  { kind: "future_shop",         defaultLabel: "at the next Shop",           defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: false, emitsResource: "essence" },
  { kind: "future_dream_journey",defaultLabel: "on the next Dream Journey",  defaultCount: 1, trackText: (l) => `Track ${l}.`,        producesObservableEvent: false, emitsResource: "none" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hook-trigger-resolution`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/hookTriggers.ts test/hook-trigger-resolution.test.ts
git commit -m "Extract delayed-hook trigger entries into TRIGGER_REGISTRY

Each trigger declares its default label/count, the text it adds to a
manifest's tracked-condition section, and small metadata used by the
compatibility predicate (producesObservableEvent, emitsResource). One
entry per HookTriggerSelector.triggerKind."
```

### Task 4.2: Extract the resolution registry

- [ ] **Step 1: Write the failing test**

```typescript
// test/hook-trigger-resolution.test.ts (add)
import { RESOLUTION_REGISTRY } from "../src/journey/fillers/hookResolutions.js";

describe("RESOLUTION_REGISTRY", () => {
  it("includes the resolutions used by the existing hookPayloads file", () => {
    const expected = [
      "card_draft", "card_purge", "essence_gain", "named_card_grant",
      "bane_transform_to_card", "future_shop_discount", "future_shop_trade_hook",
      "named_dreamsign_grant", "delayed_bane_arrival", "status_reward_replacement",
      "future_journey_option", "site_visit_reward",
    ];
    for (const kind of expected) {
      expect(RESOLUTION_REGISTRY.find((r) => r.kind === kind), `missing ${kind}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hook-trigger-resolution`
Expected: FAIL.

- [ ] **Step 3: Create the registry**

```typescript
// src/journey/fillers/hookResolutions.ts
export type ResolutionEntry = {
  readonly kind: string; // narrow to a union of the listed strings
  readonly producesPayload: (args: ResolutionPayloadArgs) => Payload | undefined;
  readonly requiresResource: "essence" | "card" | "bane" | "dreamsign" | "none";
  readonly compatibleStages: readonly HookStage[];
  readonly weight: number;
};

export const RESOLUTION_REGISTRY: readonly ResolutionEntry[] = [
  // One entry per the strings listed in the test, with producesPayload
  // factored out from the inline blocks currently in
  // expandedDelayedHookCandidates. Each function takes (context, drawContext,
  // label, stage) and returns the same payload shape that the existing
  // inline code returns.
];
```

For each kind, copy the inline body from `expandedDelayedHookCandidates` (e.g. the `victory:two:named-dreamsign` block at line 848) into the entry's `producesPayload` function, parameterized by `(context, drawContext, label, stage)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hook-trigger-resolution`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/hookResolutions.ts test/hook-trigger-resolution.test.ts
git commit -m "Extract delayed-hook resolutions into RESOLUTION_REGISTRY

Each resolution kind is one record with a producesPayload function (lifted
from the inline body of expandedDelayedHookCandidates), its required
resource type, and its stage compatibility. The cartesian iteration in
hookPayloads.ts (next commit) consumes these."
```

### Task 4.3: Implement `hookCompatibility` predicate

- [ ] **Step 1: Write the failing test**

```typescript
// test/hook-trigger-resolution.test.ts (add)
import { hookCompatibility } from "../src/journey/fillers/hookCompatibility.js";

describe("hookCompatibility", () => {
  it("permits future_shop × future_shop_discount", () => {
    expect(hookCompatibility(
      TRIGGER_REGISTRY.find((t) => t.kind === "future_shop")!,
      RESOLUTION_REGISTRY.find((r) => r.kind === "future_shop_discount")!,
      "mid",
    )).toBe(true);
  });

  it("rejects essence_payment × future_journey_option (no shared semantic context)", () => {
    expect(hookCompatibility(
      TRIGGER_REGISTRY.find((t) => t.kind === "essence_payment")!,
      RESOLUTION_REGISTRY.find((r) => r.kind === "future_journey_option")!,
      "mid",
    )).toBe(false);
  });

  it("permits the cartesian product to grow when both registries grow", () => {
    const total = TRIGGER_REGISTRY.length * RESOLUTION_REGISTRY.length;
    let permitted = 0;
    for (const t of TRIGGER_REGISTRY) {
      for (const r of RESOLUTION_REGISTRY) {
        if (hookCompatibility(t, r, "mid")) permitted += 1;
      }
    }
    expect(permitted).toBeGreaterThan(20);
    expect(permitted).toBeLessThan(total);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hook-trigger-resolution`
Expected: FAIL.

- [ ] **Step 3: Implement the predicate**

```typescript
// src/journey/fillers/hookCompatibility.ts
import type { TriggerEntry } from "./hookTriggers.js";
import type { ResolutionEntry } from "./hookResolutions.js";
import type { HookStage } from "./hookPayloads.js";

export function hookCompatibility(
  trigger: TriggerEntry,
  resolution: ResolutionEntry,
  stage: HookStage,
): boolean {
  if (!resolution.compatibleStages.includes(stage)) return false;
  // Resource alignment: a resolution that requires "essence" needs a trigger
  // that emits "essence" or "none" (the latter is permissive).
  if (resolution.requiresResource !== "none" && trigger.emitsResource !== "none") {
    if (resolution.requiresResource !== trigger.emitsResource) return false;
  }
  // Shop-targeted resolutions only fire after a shop-related trigger.
  if (resolution.kind.startsWith("future_shop") && trigger.kind !== "future_shop") {
    return false;
  }
  // Dream-journey-option resolutions only fire after a dream-journey-related trigger.
  if (resolution.kind === "future_journey_option" && trigger.kind !== "future_dream_journey") {
    return false;
  }
  return true;
}
```

(Refine the predicate based on what the existing enumerated list permits — the current enumerated list IS the ground truth of which pairings make sense. Iterate the predicate until every existing pairing is permitted and every nonsensical pairing is rejected.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hook-trigger-resolution`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/hookCompatibility.ts test/hook-trigger-resolution.test.ts
git commit -m "Implement hookCompatibility predicate over (trigger, resolution, stage)

Captures the alignment rules implicit in the current enumerated list:
resource matching, shop-vs-dream-journey scoping, stage compatibility.
The cartesian product gated by this predicate replaces the enumerated
list in the next commit."
```

### Task 4.4: Replace `expandedDelayedHookCandidates` body with the cartesian product

- [ ] **Step 1: Write the failing test**

```typescript
// test/hook-trigger-resolution.test.ts (add)
import { expandedDelayedHookCandidates } from "../src/journey/fillers/hookPayloads.js";

describe("expandedDelayedHookCandidates (cartesian)", () => {
  it("produces at least 20 candidates from the registries", () => {
    const { context, drawContext } = makeTestContext({ seed: "hook-cart-1" });
    const out = expandedDelayedHookCandidates({
      context, drawContext, label: "test", stage: "mid",
    });
    expect(out.length).toBeGreaterThanOrEqual(20);
  });

  it("includes a card_added × bane_transform_to_card composition", () => {
    const { context, drawContext } = makeTestContext({ seed: "hook-cart-2" });
    const out = expandedDelayedHookCandidates({
      context, drawContext, label: "test", stage: "mid",
    });
    expect(out.some((c) =>
      c.triggerKind === "card_added" && c.resolutionKind === "bane_transform_to_card"
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hook-trigger-resolution`
Expected: FAIL — current implementation only emits ~12 candidates and the specific composition is not in the enumerated list.

- [ ] **Step 3: Replace the body**

In `src/journey/fillers/hookPayloads.ts`, replace the body of `expandedDelayedHookCandidates` (currently lines 750–end, around 488 lines of code) with:

```typescript
function expandedDelayedHookCandidates(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage?: HookStage;
}): ExpandedDelayedHookFill[] {
  const stage = args.stage ?? "mid";
  const candidates: ExpandedDelayedHookFill[] = [];
  for (const trigger of TRIGGER_REGISTRY) {
    for (const resolution of RESOLUTION_REGISTRY) {
      if (!hookCompatibility(trigger, resolution, stage)) continue;
      const payload = resolution.producesPayload({
        context: args.context,
        drawContext: args.drawContext.fork(`${args.label}:${trigger.kind}:${resolution.kind}`),
        label: args.label,
        stage,
        trigger,
      });
      if (!payload) continue;
      candidates.push({
        key: `${trigger.kind}:${resolution.kind}`,
        triggerKind: trigger.kind,
        resolutionKind: resolution.kind,
        text: payload.text,
        triggerSelector: hookTrigger({
          triggerKind: trigger.kind,
          label: trigger.defaultLabel,
          count: trigger.defaultCount,
        }),
        trackedCondition: trigger.trackText(trigger.defaultLabel),
        resolution: payload.resolutionText,
        expiration: payload.expiration,
        // ...whatever ExpandedDelayedHookFill requires
      });
    }
  }
  return candidates;
}
```

Add `triggerKind` and `resolutionKind` fields to the `ExpandedDelayedHookFill` type so consumers can introspect compositions. Delete the constants (`DELAYED_BANE_TIMING_PROFILES`, `RANDOM_PURGE_HOOK_BANDS`, `NAMED_CARD_DUPLICATE_HOOK_BANDS`, `ESSENCE_PAYMENT_DREAMSIGN_TRANSFORM_BANDS`, `FUTURE_SHOP_DISCOUNT_HOOK_BANDS`, `FUTURE_JOURNEY_OPTION_HOOK_BANDS`, `SITE_VISIT_HOOK_SITES`) only if they are no longer referenced after the bands move into `RESOLUTION_REGISTRY`'s `producesPayload` functions.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, but the diff in `journey-generation.test.ts` may be substantial because more hook candidates are now reachable. Update brittle assertions to match the new behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/hookPayloads.ts
git commit -m "Drive expandedDelayedHookCandidates from the trigger × resolution cartesian

Adding a trigger or a resolution now unlocks every compatible pairing
automatically. The previous ~12 enumerated candidates are equivalent to
the cartesian product gated by hookCompatibility, plus pairings that the
enumerated list omitted (e.g. card_added × bane_transform_to_card)."
```

**Phase 4 acceptance criteria:**
- `expandedDelayedHookCandidates`'s body is < 30 lines and contains a nested loop, no inline payload construction.
- Adding one new trigger or one new resolution + the relevant compatibility tweak produces at least one new candidate without further code changes.
- All `delayed_hook` shapes still generate without error on a 100-seed sweep.

---

# Phase 5 — Predicate axes on operation entries (Structural Fix #5)

**Depends on:** Phase 3 (the `materialize` function added here populates `compatibilityTraits` from Phase 3 — sequencing matters).

**Motivation.** Card-op and Dreamsign-op entries are written one-per-tuple instead of one-per-family. When a brainstorm picks a slightly different predicate slice — a different keyword, a different orientation, a different cost band — there is no entry, because no one wrote one. The fix is to declare predicate axes on the entry and expand them at generation time.

**Scope.** Add a `predicateAxes` field to entries that vary along an axis. Implement a `materializePredicateAxes(entry, drawContext)` step that produces concrete one-tuple entries by selecting one value per axis. Migrate ~6 known overfit entries to use axes (random-predicate transfig hardcoded to `{Glass, Event, count 1}`, `Dissolve`-only `card_keyword_remove`, no-orientation Dreamsign random/draft, no cost-band predicate, `change-subtype-sigil`, "any card" generated transfiguration).

**Files:**
- Modify: `src/journey/fillers/cardOperationCatalog.ts`
- Modify: `src/journey/fillers/dreamsignOperationCatalog.ts`
- Create: `src/journey/fillers/predicateAxes.ts`
- Test: `test/predicate-axes.test.ts`

### Task 5.1: Define `PredicateAxis` types

- [ ] **Step 1: Write the failing test**

```typescript
// test/predicate-axes.test.ts
import { describe, expect, it } from "vitest";
import {
  expandPredicateAxes,
  type PredicateAxis,
} from "../src/journey/fillers/predicateAxes.js";

describe("expandPredicateAxes", () => {
  it("produces one entry per cartesian product point", () => {
    const axes: PredicateAxis[] = [
      { name: "keyword", values: ["Dissolve", "Anchor", "Echo"] as const },
      { name: "count", values: [1, 2, 3] as const },
    ];
    const expanded = expandPredicateAxes(axes);
    expect(expanded).toHaveLength(9);
    expect(expanded[0]).toEqual({ keyword: "Dissolve", count: 1 });
  });

  it("returns a single empty point when given no axes", () => {
    expect(expandPredicateAxes([])).toEqual([{}]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- predicate-axes`
Expected: FAIL.

- [ ] **Step 3: Implement `predicateAxes.ts`**

```typescript
// src/journey/fillers/predicateAxes.ts
export type PredicateAxis<TName extends string = string, TValue = unknown> = {
  readonly name: TName;
  readonly values: readonly TValue[];
};

export function expandPredicateAxes(
  axes: readonly PredicateAxis[],
): readonly Record<string, unknown>[] {
  if (axes.length === 0) return [{}];
  const [head, ...rest] = axes;
  const tail = expandPredicateAxes(rest);
  const out: Record<string, unknown>[] = [];
  for (const value of head!.values) {
    for (const tailEntry of tail) {
      out.push({ [head!.name]: value, ...tailEntry });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- predicate-axes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/predicateAxes.ts test/predicate-axes.test.ts
git commit -m "Add expandPredicateAxes helper

A predicate axis is a (name, values) pair; expanding a list of axes
produces the cartesian product as one record per point. This is the
substrate for the per-family entry expansion in the catalogs."
```

### Task 5.2: Migrate `card_keyword_remove` to use axes

- [ ] **Step 1: Write the failing test**

```typescript
// test/predicate-axes.test.ts (add)
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";

describe("card_keyword_remove migration", () => {
  it("declares a keyword axis covering at least 4 keywords", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "card_keyword_remove");
    expect(entry).toBeDefined();
    const keywordAxis = entry!.predicateAxes!.find((a) => a.name === "keyword");
    expect(keywordAxis).toBeDefined();
    expect(keywordAxis!.values.length).toBeGreaterThanOrEqual(4);
  });

  it("expands to a concrete keyword at materialization time", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "card_keyword_remove")!;
    const { drawContext } = makeTestContext({ seed: "kw-remove-1" });
    const materialized = entry.materialize!({
      entry, drawContext, label: "kw-remove", stage: "mid",
    });
    expect(materialized).toBeDefined();
    expect(materialized!.effect.keyword).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- predicate-axes`
Expected: FAIL.

- [ ] **Step 3: Migrate the entry**

Find the `card_keyword_remove` entry in `cardOperationCatalog.ts`. Add:

```typescript
predicateAxes: [
  { name: "keyword", values: ["Dissolve", "Anchor", "Echo", "Bind", "Recall"] as const },
],
materialize: (args) => {
  const point = pickAxisPoint(args.drawContext, args.entry.predicateAxes!);
  return {
    ...args.entry,
    key: `${args.entry.key}:${point.keyword}`,
    effect: { ...args.entry.effect, keyword: point.keyword },
    renderText: (target) => `Remove ${point.keyword} from ${target}.`,
  };
},
```

Add a `pickAxisPoint(drawContext, axes)` helper to `predicateAxes.ts`:

```typescript
export function pickAxisPoint(
  drawContext: DrawContext,
  axes: readonly PredicateAxis[],
): Record<string, unknown> {
  const point: Record<string, unknown> = {};
  for (const axis of axes) {
    point[axis.name] = axis.values[
      drawContext.index(`predicate-axis:${axis.name}`, axis.values.length)
    ];
  }
  return point;
}
```

Add `predicateAxes?: readonly PredicateAxis[]` to `CardOperationCatalogEntry`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/cardOperationCatalog.ts src/journey/fillers/predicateAxes.ts test/predicate-axes.test.ts
git commit -m "Migrate card_keyword_remove to a keyword predicate axis

The entry now declares a keyword axis with five removable keywords.
materialize() picks one keyword per draw via pickAxisPoint and produces
a concrete entry with that keyword in its effect and renderText. This
removes the Dissolve-only overfit."
```

### Task 5.3: Migrate the remaining 5 overfit entries

- [ ] **Step 1: Write the failing test**

```typescript
// test/predicate-axes.test.ts (add)
describe("predicate-axis migrations", () => {
  it.each([
    ["random_predicate_transfiguration", ["card_subtype", "card_count"]],
    ["dreamsign_random_select",          ["orientation"]],
    ["dreamsign_draft_select",           ["orientation"]],
    ["deck_card_cost_predicate_purge",   ["cost_band"]],
    ["change_subtype_sigil",             ["sigil_target"]],
    ["any_card_transfiguration",         ["target_class"]],
  ])("entry %s declares axes %j", (key, axisNames) => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === key)
      ?? DREAMSIGN_OPERATION_CATALOG.find((e) => e.key === key);
    expect(entry, `entry ${key}`).toBeDefined();
    for (const axisName of axisNames) {
      expect(
        entry!.predicateAxes?.some((a) => a.name === axisName),
        `entry ${key} missing axis ${axisName}`,
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- predicate-axes`
Expected: FAIL.

- [ ] **Step 3: Migrate each entry**

For each of the six entries listed in the test, repeat the Task 5.2 pattern: add `predicateAxes`, add a `materialize` function that picks an axis point and produces a concrete entry. If the entry does not yet exist (e.g. `any_card_transfiguration` when only `glass_event_transfiguration` exists today), introduce it as a new entry with the axes spanning its predecessors plus the new dimensions called out in the brainstorm — *do not* preserve the old single-tuple entry as a separate row.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/cardOperationCatalog.ts src/journey/fillers/dreamsignOperationCatalog.ts test/predicate-axes.test.ts
git commit -m "Migrate five additional overfit operation entries to predicate axes

Replaces hardcoded predicate tuples for random-predicate transfiguration,
Dreamsign random/draft (orientation), deck-side cost-band predicates,
change-subtype-sigil, and any-card transfiguration. Each entry now spans
its family rather than a single hand-written tuple."
```

**Phase 5 acceptance criteria:**
- The six entries above all carry `predicateAxes`.
- Generating 100 seeds against each migrated entry produces materializations spanning at least two distinct points along every axis.
- No remaining catalog entry has a hardcoded `keyword`, `orientation`, `cost_band`, `sigil_target`, or `target_class` field that should obviously be parameterized — any such case spotted during the migration becomes a follow-up task in this phase rather than a future one.

---

# Phase 6 — Symmetry contract A: family-homogeneous trio

**Motivation.** A handful of brainstorm scenarios want all rows in a trio to draw from the same family (resource-only rewards, Dreamsign-only rewards, draft-only rewards, etc.). Today this is enforced by writing a bespoke contract per family. One parameterized contract covers all of them.

**Scope.** Extend `JourneySymmetryContractDebug` with a new `homogeneous_family_trio` discriminated kind. Add an optional `familyRestriction` parameter to the existing `curated_reward_trio`, `service_menu`, and `same_cost_different_rewards` shapes; when set, the fill function restricts every row's pool selection to that family and emits the contract.

**Files:**
- Modify: `src/journey/manifest.ts` (extend the `JourneySymmetryContractDebug` union)
- Modify: `src/journey/shapes/curated_reward_trio/fill.ts`
- Modify: `src/journey/shapes/service_menu/fill.ts` (or wherever its options assemble)
- Modify: `src/journey/shapes/same_cost_different_rewards/fill.ts`
- Test: `test/homogeneous-family-trio.test.ts`

### Task 6.1: Add the contract kind to the manifest type

- [ ] **Step 1: Write the failing test**

```typescript
// test/homogeneous-family-trio.test.ts
import { describe, expect, it } from "vitest";
import { symmetryContract } from "../src/journey/fillers/shared.js";

describe("homogeneous_family_trio contract", () => {
  it("constructs without typecheck failure", () => {
    const c = symmetryContract({
      contractKind: "homogeneous_family_trio",
      sharedProperty: "rewardFamily",
      variedProperty: "rewardSpecific",
      sharedFirst: true,
      optionNumbers: [1, 2, 3],
      sharedPayloadKeys: ["rewardFamily=resource"],
    });
    expect(c.contractKind).toBe("homogeneous_family_trio");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- homogeneous-family-trio && npm run typecheck`
Expected: typecheck FAIL — `"homogeneous_family_trio"` is not a member of the union.

- [ ] **Step 3: Extend the type**

In `src/journey/manifest.ts:898-916`, add `| "homogeneous_family_trio"` to the `contractKind` union.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- homogeneous-family-trio && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/manifest.ts test/homogeneous-family-trio.test.ts
git commit -m "Add homogeneous_family_trio to JourneySymmetryContractDebug union

Reserves the contract kind. Shape integrations land in subsequent commits."
```

### Task 6.2: Wire the contract into `curated_reward_trio` (with optional `familyRestriction`)

- [ ] **Step 1: Write the failing test**

```typescript
// test/homogeneous-family-trio.test.ts (add)
import { curatedRewardTrioFill } from "../src/journey/shapes/curated_reward_trio/fill.js";

describe("curated_reward_trio with familyRestriction", () => {
  it("emits a homogeneous_family_trio contract when familyRestriction is set", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "hft-1" });
    const filled = curatedRewardTrioFill({
      context, drawContext, stage,
      shapeArgs: { familyRestriction: "resource" },
    });
    expect(filled).toBeDefined();
    expect(filled!.symmetryContracts?.some((c) =>
      c.contractKind === "homogeneous_family_trio"
    )).toBe(true);
    for (const opt of filled!.options) {
      const families = opt.payloads.map((p) => p.familyTag);
      expect(families.every((f) => f === "resource")).toBe(true);
    }
  });

  it("does not emit the contract when familyRestriction is unset", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "hft-2" });
    const filled = curatedRewardTrioFill({ context, drawContext, stage });
    expect(filled!.symmetryContracts?.every((c) =>
      c.contractKind !== "homogeneous_family_trio"
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- homogeneous-family-trio`
Expected: FAIL.

- [ ] **Step 3: Implement `familyRestriction`**

In `src/journey/shapes/curated_reward_trio/fill.ts`, accept an optional `shapeArgs.familyRestriction` parameter (extend the `ShapeFillArgs` shape with a `shapeArgs` field if not already present, or thread it via existing config). When set, restrict each row's reward pool to entries whose `familyTag` matches. After assembling options, append a `symmetryContract({ contractKind: "homogeneous_family_trio", sharedProperty: "rewardFamily", variedProperty: "rewardSpecific", sharedFirst: true, optionNumbers: filled.options.map((o) => o.number), sharedPayloadKeys: [\`rewardFamily=${familyRestriction}\`] })` to `symmetryContracts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- homogeneous-family-trio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/curated_reward_trio/
git commit -m "Wire homogeneous_family_trio contract into curated_reward_trio

When the optional familyRestriction is set, every row's reward pool is
filtered to that family and a homogeneous_family_trio contract is emitted.
The contract surfaces in symmetry tagging so consumers can detect this
intentional pattern."
```

### Task 6.3: Wire `familyRestriction` into `service_menu` and `same_cost_different_rewards`

- [ ] **Step 1-5:** Repeat Task 6.2 for `src/journey/shapes/service_menu/fill.ts` and `src/journey/shapes/same_cost_different_rewards/fill.ts`. Each gets the same parameter and the same emit-contract step. One commit per shape.

**Phase 6 acceptance criteria:**
- All three shapes accept `familyRestriction` and emit the contract when set.
- A 100-seed sweep produces at least one `homogeneous_family_trio`-tagged manifest in each of the three shapes when restriction is enabled.
- No bespoke `*_reward_trio` contract types are introduced.

---

# Phase 7 — Symmetry contract B: shared-axis-with-rotated-attribute

**Motivation.** Several brainstorm scenarios share family X across all rows but rotate attribute Y across distinct values (shared starter target / varied operations, shared trade-ticket pattern / rotated reward kinds, etc.). One parameterized contract covers all of them.

**Scope.** Add a `shared_axis_rotated_attribute` discriminated kind. Both X and Y are declarative references into the catalog (family, target mode, trigger family, reward kind). Provide a helper that consumes a list of options and verifies the rotation property before emitting the contract.

**Files:**
- Modify: `src/journey/manifest.ts`
- Create: `src/journey/fillers/sharedAxisRotatedAttribute.ts`
- Modify: shape fills that previously used hand-written `shared_X` contracts (`shared_target_operations`, `shared_operation_named_targets`, etc. listed in the existing union) — these become wrappers around the new generic contract or are deleted in favour of it where feasible
- Test: `test/shared-axis-rotated-attribute.test.ts`

### Task 7.1: Add the contract kind and the helper

- [ ] **Step 1: Write the failing test**

```typescript
// test/shared-axis-rotated-attribute.test.ts
import { describe, expect, it } from "vitest";
import {
  buildSharedAxisRotatedAttributeContract,
} from "../src/journey/fillers/sharedAxisRotatedAttribute.js";

describe("shared_axis_rotated_attribute contract", () => {
  it("emits the contract when shared axis is constant and rotated axis is distinct", () => {
    const contract = buildSharedAxisRotatedAttributeContract({
      options: [
        { number: 1, sharedValue: "starter_card", rotatedValue: "purge" },
        { number: 2, sharedValue: "starter_card", rotatedValue: "transfigure" },
        { number: 3, sharedValue: "starter_card", rotatedValue: "duplicate" },
      ],
      sharedAxis: { kind: "target_class", value: "starter_card" },
      rotatedAxis: { kind: "operation_family" },
    });
    expect(contract).toBeDefined();
    expect(contract!.contractKind).toBe("shared_axis_rotated_attribute");
  });

  it("returns undefined when the shared axis is not constant", () => {
    const contract = buildSharedAxisRotatedAttributeContract({
      options: [
        { number: 1, sharedValue: "starter_card", rotatedValue: "purge" },
        { number: 2, sharedValue: "deck_card", rotatedValue: "transfigure" },
      ],
      sharedAxis: { kind: "target_class", value: "starter_card" },
      rotatedAxis: { kind: "operation_family" },
    });
    expect(contract).toBeUndefined();
  });

  it("returns undefined when the rotated axis is not distinct", () => {
    const contract = buildSharedAxisRotatedAttributeContract({
      options: [
        { number: 1, sharedValue: "starter_card", rotatedValue: "purge" },
        { number: 2, sharedValue: "starter_card", rotatedValue: "purge" },
      ],
      sharedAxis: { kind: "target_class", value: "starter_card" },
      rotatedAxis: { kind: "operation_family" },
    });
    expect(contract).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared-axis-rotated-attribute`
Expected: FAIL.

- [ ] **Step 3: Add type and implement the helper**

In `src/journey/manifest.ts:898-916`, add `| "shared_axis_rotated_attribute"` to the `contractKind` union.

Create `src/journey/fillers/sharedAxisRotatedAttribute.ts`:

```typescript
import { symmetryContract } from "./shared.js";
import type { JourneySymmetryContractDebug } from "../manifest.js";

export type SharedAxisRotatedAttributeArgs = {
  readonly options: readonly { readonly number: number; readonly sharedValue: string; readonly rotatedValue: string }[];
  readonly sharedAxis: { readonly kind: string; readonly value: string };
  readonly rotatedAxis: { readonly kind: string };
};

export function buildSharedAxisRotatedAttributeContract(
  args: SharedAxisRotatedAttributeArgs,
): JourneySymmetryContractDebug | undefined {
  const { options, sharedAxis, rotatedAxis } = args;
  if (options.length < 2) return undefined;
  if (!options.every((o) => o.sharedValue === sharedAxis.value)) return undefined;
  const rotatedSet = new Set(options.map((o) => o.rotatedValue));
  if (rotatedSet.size !== options.length) return undefined;
  return symmetryContract({
    contractKind: "shared_axis_rotated_attribute",
    sharedProperty: `${sharedAxis.kind}=${sharedAxis.value}`,
    variedProperty: rotatedAxis.kind,
    sharedFirst: true,
    optionNumbers: options.map((o) => o.number),
    sharedPayloadKeys: [`${sharedAxis.kind}=${sharedAxis.value}`],
    variedPayloadKeys: options.map((o) => `${rotatedAxis.kind}=${o.rotatedValue}`),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared-axis-rotated-attribute`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/manifest.ts src/journey/fillers/sharedAxisRotatedAttribute.ts test/shared-axis-rotated-attribute.test.ts
git commit -m "Add shared_axis_rotated_attribute contract and builder

A parameterized contract describing shapes where every row shares family X
but rotates attribute Y. The builder verifies both conditions before
emitting; if not satisfied it returns undefined and the caller does not
add the contract to the manifest."
```

### Task 7.2: Migrate the existing shared-axis contracts to the new builder

- [ ] **Step 1: Write the failing test**

```typescript
// test/shared-axis-rotated-attribute.test.ts (add)
import { generateNextJourney } from "../src/journey/generate.js";

describe("shared_axis_rotated_attribute coverage", () => {
  it("at least one of 50 seeds emits the new kind in place of an old shared_* kind", () => {
    let seenNew = 0;
    let seenOld = 0;
    for (let i = 0; i < 50; i += 1) {
      const m = generateNextJourney({ seed: `sarac:${i}` });
      const contracts = m.symmetryContracts ?? [];
      if (contracts.some((c) => c.contractKind === "shared_axis_rotated_attribute")) seenNew += 1;
      if (contracts.some((c) =>
        c.contractKind === "shared_target_operations" ||
        c.contractKind === "shared_operation_named_targets"
      )) seenOld += 1;
    }
    expect(seenNew).toBeGreaterThan(0);
    expect(seenOld).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared-axis-rotated-attribute`
Expected: FAIL — old contracts still present.

- [ ] **Step 3: Migrate every callsite that constructs `shared_target_operations` or `shared_operation_named_targets`**

Grep `src/journey/shapes/` for `contractKind: "shared_target_operations"` and `contractKind: "shared_operation_named_targets"`. Replace each occurrence with a call to `buildSharedAxisRotatedAttributeContract(...)` with appropriate `sharedAxis` and `rotatedAxis` parameters.

In `src/journey/manifest.ts:898-916`, **remove** `"shared_target_operations"` and `"shared_operation_named_targets"` from the `contractKind` union (keep the other shared_* kinds for now — only these two are subsumed by the new generic contract).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes src/journey/manifest.ts
git commit -m "Replace shared_target_operations and shared_operation_named_targets with the generic contract

Both bespoke contract kinds described shared-axis-with-rotated-attribute
patterns; both call sites now invoke buildSharedAxisRotatedAttributeContract.
The two strings are dropped from the contractKind union."
```

**Phase 7 acceptance criteria:**
- `shared_target_operations` and `shared_operation_named_targets` are removed from the union; no remaining call site references them.
- A 50-seed sweep produces at least one `shared_axis_rotated_attribute` contract.

---

# Phase 8 — Symmetry contract C: distinct-everything

**Motivation.** Some brainstorm scenarios require all rows to vary across two or more axes simultaneously (Bane Ledger: distinct Banes per row, distinct rewards per row). This pairs naturally with Phase 2's `independent_rows_menu` shape — the shape needs a contract to enforce the rows are not all the same.

**Scope.** Add a `distinct_everything_trio` contract kind. Wire its emission into `independent_rows_menu`'s fill (Phase 2 task 2.2 already enforces this at draw time; this phase makes it visible in the manifest). Add a validator that any manifest claiming this contract really has pairwise distinct values along every declared axis.

**Files:**
- Modify: `src/journey/manifest.ts`
- Modify: `src/journey/shapes/independent_rows_menu/fill.ts`
- Modify: `src/journey/shapes/independent_rows_menu/validators.ts`
- Test: `test/distinct-everything.test.ts`

### Task 8.1: Add the contract kind and emit from `independent_rows_menu`

- [ ] **Step 1: Write the failing test**

```typescript
// test/distinct-everything.test.ts
import { describe, expect, it } from "vitest";
import { independentRowsMenuFill } from "../src/journey/shapes/independent_rows_menu/fill.js";

describe("distinct_everything_trio", () => {
  it("is emitted by every successful independent_rows_menu fill", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "de-1" });
    const filled = independentRowsMenuFill({ context, drawContext, stage })!;
    expect(filled.symmetryContracts?.some((c) =>
      c.contractKind === "distinct_everything_trio"
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- distinct-everything`
Expected: FAIL.

- [ ] **Step 3: Add the kind and the emission**

In `src/journey/manifest.ts:898-916`, add `| "distinct_everything_trio"` to the `contractKind` union.

In `src/journey/shapes/independent_rows_menu/fill.ts`, after assembling `options`, append:

```typescript
const contract = symmetryContract({
  contractKind: "distinct_everything_trio",
  sharedProperty: "none",
  variedProperty: "cost+reward",
  sharedFirst: false,
  optionNumbers: options.map((o) => o.number),
  variedPayloadKeys: options.flatMap((o) =>
    o.payloads.map((p) => `${p.kind}=${stableSignature(p)}`),
  ),
});
return { options, precommitted: {}, symmetryContracts: [contract] };
```

(`stableSignature` is a small helper that JSON-stringifies a payload's identity-relevant keys; if no equivalent helper exists, add one in `src/journey/fillers/shared.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- distinct-everything`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/manifest.ts src/journey/shapes/independent_rows_menu/
git commit -m "Emit distinct_everything_trio contract from independent_rows_menu

Every successful fill now appends the contract describing the row-level
variance the shape guarantees. Validator (next commit) enforces this
property over the assembled manifest."
```

### Task 8.2: Add a manifest-level validator for the contract

- [ ] **Step 1: Write the failing test**

```typescript
// test/distinct-everything.test.ts (add)
describe("distinct_everything_trio validator", () => {
  it("rejects a manifest claiming the contract but containing duplicate rows", () => {
    const manifest = synthesizeDistinctEverythingTrioWithDuplicates();
    const result = validateManifest(manifest);
    expect(result.failures.map((f) => f.ruleId)).toContain(
      "distinct_everything_trio_axes_are_pairwise_distinct",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- distinct-everything`
Expected: FAIL.

- [ ] **Step 3: Implement the validator**

Add a validator to `src/journey/shapes/independent_rows_menu/validators.ts`:

```typescript
{
  ruleId: "distinct_everything_trio_axes_are_pairwise_distinct",
  passMessage: "All rows differ on every payload axis declared by the contract.",
  checkedPayloads: ({ manifest }) => /* every option's payload */,
  validate: ({ manifest }) => {
    const contract = (manifest.symmetryContracts ?? []).find((c) =>
      c.contractKind === "distinct_everything_trio"
    );
    if (!contract) return { passed: true };
    const seen = new Set<string>();
    for (const key of contract.variedPayloadKeys ?? []) {
      if (seen.has(key)) return {
        passed: false,
        failures: [{
          ruleId: "distinct_everything_trio_axes_are_pairwise_distinct",
          message: `Duplicate axis value: ${key}`,
        }],
      };
      seen.add(key);
    }
    return { passed: true };
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/independent_rows_menu/validators.ts
git commit -m "Add distinct_everything_trio validator

Verifies that any manifest claiming the contract actually has pairwise
distinct values across every declared axis. Catches repair- and edit-
introduced duplicates that would silently violate the claim."
```

**Phase 8 acceptance criteria:**
- Every `independent_rows_menu` manifest emits the contract; the validator passes for legitimate fills and fails for synthetic duplicates.
- No bespoke `*_pact` or `*_ledger` contract kinds are introduced.

---

# Phase 9 — Primitive: Transfiguration removal operation

**Motivation.** Removing a transfiguration from a card is a primitive that several brainstorm scenarios assume but the catalog does not provide.

**Scope.** Add a new entry `transfiguration_removal` to `CARD_OPERATION_CATALOG` with appropriate `compatibilityTraits` and `effect`. Wire the visual / text output through existing transfiguration helpers.

**Files:**
- Modify: `src/journey/fillers/cardOperationCatalog.ts`
- Test: `test/transfiguration-removal.test.ts`

### Task 9.1: Add the entry

- [ ] **Step 1: Write the failing test**

```typescript
// test/transfiguration-removal.test.ts
import { describe, expect, it } from "vitest";
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";

describe("transfiguration_removal", () => {
  it("is registered with traits needs_named_target and produces_deck_mutation", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "transfiguration_removal");
    expect(entry).toBeDefined();
    expect(entry!.compatibilityTraits).toContain("needs_named_target");
    expect(entry!.compatibilityTraits).toContain("produces_deck_mutation");
  });

  it("renders a removal sentence", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "transfiguration_removal")!;
    expect(entry.renderText("a chosen card")).toContain("remove");
    expect(entry.renderText("a chosen card").toLowerCase()).toContain("transfiguration");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transfiguration-removal`
Expected: FAIL.

- [ ] **Step 3: Add the entry**

```typescript
// in src/journey/fillers/cardOperationCatalog.ts, alongside other transfiguration entries:
{
  key: "transfiguration_removal",
  family: "transfiguration",
  targetModes: ["chosen", "exact_named"] as const,
  targetClasses: ["deck_card", "starter_card"] as const,
  valueBand: "standard",
  timing: "immediate",
  renderText: (target: string) => `Remove a transfiguration from ${target}.`,
  effect: { kind: "remove_transfiguration" },
  value: 70,
  compatibilityTraits: ["needs_named_target", "needs_deck_side", "produces_deck_mutation"],
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/cardOperationCatalog.ts test/transfiguration-removal.test.ts
git commit -m "Add transfiguration_removal card operation

A new transfiguration-family entry that removes a transfiguration from a
chosen or named card. Works in any slot that provides named_target,
deck_side, and deck_mutation_consumer."
```

**Phase 9 acceptance criteria:**
- `transfiguration_removal` is selectable by any shape whose slot provides the three required capabilities.

---

# Phase 10 — Primitive: Generalized keyword removal

**Motivation.** Phase 5 already migrated `card_keyword_remove` to a keyword axis; this phase formalizes the underlying `REMOVABLE_KEYWORDS` list as a shared content constant.

**Scope.** Define `REMOVABLE_KEYWORDS` in a content file and reference it from the `card_keyword_remove` entry's predicate axis. (If Phase 5 already inlined the literal list into the entry, replace the inline list with the named export.)

**Files:**
- Create or modify: `src/journey/content/keywords.ts`
- Modify: `src/journey/fillers/cardOperationCatalog.ts`
- Test: `test/removable-keywords.test.ts`

### Task 10.1: Define and reference `REMOVABLE_KEYWORDS`

- [ ] **Step 1: Write the failing test**

```typescript
// test/removable-keywords.test.ts
import { describe, expect, it } from "vitest";
import { REMOVABLE_KEYWORDS } from "../src/journey/content/keywords.js";
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";

describe("REMOVABLE_KEYWORDS", () => {
  it("contains at least Dissolve and Anchor", () => {
    expect(REMOVABLE_KEYWORDS).toContain("Dissolve");
    expect(REMOVABLE_KEYWORDS).toContain("Anchor");
  });

  it("is referenced by card_keyword_remove's keyword axis", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "card_keyword_remove")!;
    const kwAxis = entry.predicateAxes!.find((a) => a.name === "keyword")!;
    for (const kw of kwAxis.values) {
      expect(REMOVABLE_KEYWORDS).toContain(kw);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- removable-keywords`
Expected: FAIL.

- [ ] **Step 3: Define the constant and reference it**

Create or extend `src/journey/content/keywords.ts`:

```typescript
export const REMOVABLE_KEYWORDS = [
  "Dissolve",
  "Anchor",
  "Echo",
  "Bind",
  "Recall",
] as const;
export type RemovableKeyword = typeof REMOVABLE_KEYWORDS[number];
```

In `cardOperationCatalog.ts`, change the `keyword` axis on `card_keyword_remove` to `{ name: "keyword", values: REMOVABLE_KEYWORDS }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/content/keywords.ts src/journey/fillers/cardOperationCatalog.ts test/removable-keywords.test.ts
git commit -m "Extract REMOVABLE_KEYWORDS as a named content constant

Replaces the inline keyword list on card_keyword_remove's predicate axis
with a named exported tuple. Future content additions to the keyword
removal family edit one place."
```

**Phase 10 acceptance criteria:**
- The `REMOVABLE_KEYWORDS` constant exists and is the single source of truth for which keywords the keyword-remove operation supports.

---

# Phase 11 — Primitive: Deck-source draft / peek-N-then-mutate

**Motivation.** `draftCards` only sources from `pool` / `catalog`; there is no path to "draw N from your deck and mutate one of them." Several brainstorm scenarios assume this primitive.

**Scope.** Extend `CardDraftProfile` with a `source: "deck" | "pool" | "catalog"` field (default "pool"). Update `draftCards` and `cardDraftPredicate` to honour the new source. Add a new card-operation entry `peek_deck_then_mutate_one` that uses it.

**Files:**
- Modify: `src/journey/fillers/shared.ts` (`CardDraftProfile`, `draftCards`, `cardDraftPredicate`)
- Modify: `src/journey/fillers/cardOperationCatalog.ts`
- Test: `test/deck-source-draft.test.ts`

### Task 11.1: Add `source: "deck"` support to `CardDraftProfile`

- [ ] **Step 1: Write the failing test**

```typescript
// test/deck-source-draft.test.ts
import { describe, expect, it } from "vitest";
import { draftCards } from "../src/journey/fillers/shared.js";

describe("draftCards from deck source", () => {
  it("emits a card_draft payload with source: deck", () => {
    const draft = draftCards(
      { label: "any deck card", source: "deck", predicate: { source: "deck" } },
      { takeCount: 1 },
    );
    expect(draft.predicate.source).toBe("deck");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deck-source-draft && npm run typecheck`
Expected: FAIL — `source` is not a valid `CardDraftProfile` field.

- [ ] **Step 3: Add `source` field**

Find `CardDraftProfile` in `src/journey/fillers/shared.ts`. Add `readonly source?: "deck" | "pool" | "catalog";` (default "pool" if unset). Update `cardDraftPredicate(profile)` to include `source: profile.source ?? "pool"` in its returned predicate. Update `draftCards`'s payload to honour the field.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- deck-source-draft`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/shared.ts test/deck-source-draft.test.ts
git commit -m "Add source field to CardDraftProfile and propagate through draftCards

A draft profile can now declare its source as deck, pool, or catalog. The
default remains pool so existing call sites are unaffected. Deck-sourced
drafts will be exercised by the peek_deck_then_mutate_one operation."
```

### Task 11.2: Add `peek_deck_then_mutate_one` operation

- [ ] **Step 1: Write the failing test**

```typescript
// test/deck-source-draft.test.ts (add)
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";

describe("peek_deck_then_mutate_one", () => {
  it("is registered and produces a deck-sourced peek effect", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "peek_deck_then_mutate_one");
    expect(entry).toBeDefined();
    expect(entry!.effect).toMatchObject({ kind: "peek_then_mutate", source: "deck" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deck-source-draft`
Expected: FAIL.

- [ ] **Step 3: Add the entry**

Append to `CARD_OPERATION_CATALOG`:

```typescript
{
  key: "peek_deck_then_mutate_one",
  family: "transfiguration",
  targetModes: ["drafted_card"] as const,
  targetClasses: ["deck_card"] as const,
  valueBand: "standard",
  timing: "immediate",
  renderText: () => `Look at 3 cards from your deck; transfigure 1 of them.`,
  effect: { kind: "peek_then_mutate", source: "deck", peekCount: 3, mutationKind: "transfiguration" },
  value: 110,
  compatibilityTraits: ["needs_drafted_target", "needs_deck_side", "produces_deck_mutation"],
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/cardOperationCatalog.ts
git commit -m "Add peek_deck_then_mutate_one card operation

Looks at 3 cards from the deck and transfigures 1 of them. Uses the new
source: deck draft profile and the standard transfiguration family."
```

**Phase 11 acceptance criteria:**
- `CardDraftProfile.source: "deck"` round-trips through `draftCards`.
- `peek_deck_then_mutate_one` is selectable by any slot providing the three required capabilities.

---

# Phase 12 — Primitive: Reveal-and-choose Dreamsign transform

**Motivation.** Current Dreamsign transform entries either name a single result or roll a hidden one. Some brainstorm scenarios want "reveal N options, choose one." This is a missing entry, not a missing mechanism.

**Scope.** Add `transform_to_revealed_choice` to `DREAMSIGN_OPERATION_CATALOG`.

**Files:**
- Modify: `src/journey/fillers/dreamsignOperationCatalog.ts`
- Test: `test/transform-to-revealed-choice.test.ts`

### Task 12.1: Add the entry

- [ ] **Step 1: Write the failing test**

```typescript
// test/transform-to-revealed-choice.test.ts
import { describe, expect, it } from "vitest";
import { DREAMSIGN_OPERATION_CATALOG } from "../src/journey/fillers/dreamsignOperationCatalog.js";

describe("transform_to_revealed_choice", () => {
  it("is registered and produces a reveal-N-choose-1 effect", () => {
    const entry = DREAMSIGN_OPERATION_CATALOG.find((e) => e.key === "transform_to_revealed_choice");
    expect(entry).toBeDefined();
    expect(entry!.effect).toMatchObject({
      kind: "transform_dreamsign",
      revealCount: 3,
      chooseCount: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transform-to-revealed-choice`
Expected: FAIL.

- [ ] **Step 3: Add the entry**

```typescript
// src/journey/fillers/dreamsignOperationCatalog.ts (append)
{
  key: "transform_to_revealed_choice",
  family: "transform",
  targetModes: ["chosen", "exact_named"] as const,
  targetClasses: ["dreamsign_in_play"] as const,
  valueBand: "premium",
  timing: "immediate",
  renderText: (target: string) => `Reveal 3 Dreamsigns; transform ${target} into 1 of them.`,
  effect: { kind: "transform_dreamsign", revealCount: 3, chooseCount: 1 },
  value: 130,
  compatibilityTraits: ["needs_named_target", "produces_deck_mutation"],
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/dreamsignOperationCatalog.ts test/transform-to-revealed-choice.test.ts
git commit -m "Add transform_to_revealed_choice Dreamsign operation

A premium-band transform that reveals 3 Dreamsigns and lets the player
choose one. Fills the gap between named-result transforms and hidden-roll
transforms."
```

**Phase 12 acceptance criteria:**
- The new entry is selectable by Dreamsign-target shapes.

---

# Phase 13 — Primitive: Single-row no-choice trial topology

**Motivation.** All shapes enforce `rootOptionCount.min >= 2`. A single-rule application (e.g. "for the next battle, this rule applies") has no shape home today.

**Scope.** Add a new isolated shape plugin `single_rule_trial` with `rootOptionCount: { min: 1, max: 1 }` and a permissive payload-compatibility surface. Verify that the generation-time invariants on `rootOptionCount.min` accept a value of 1 (audit `src/journey/generate.ts` and `src/journey/repair.ts` for hardcoded `>= 2` checks; relax any that prevent legitimate single-row shapes).

**Files:**
- Create: `src/journey/shapes/single_rule_trial/index.ts`
- Create: `src/journey/shapes/single_rule_trial/fill.ts`
- Create: `src/journey/shapes/single_rule_trial/validators.ts`
- Modify: `src/journey/shapes/registry.ts`
- Modify: any file with a hardcoded `>= 2` invariant on `rootOptionCount` (audit)
- Test: `test/single-rule-trial.test.ts`

### Task 13.1: Audit and relax hardcoded `>= 2` invariants

- [ ] **Step 1: Search for hardcoded floors**

Run: `grep -rn 'rootOptionCount.*\(>=\|>\) *[12]' src` to find candidate guards. Inspect each hit and decide whether the constraint is essential ("a menu must have at least 2 options to be a menu") or accidental ("we never had a single-row shape so we wrote `>= 2` defensively"). Make notes — do not modify yet.

- [ ] **Step 2: Write the failing test**

```typescript
// test/single-rule-trial.test.ts
import { describe, expect, it } from "vitest";
import { getShapePlugin } from "../src/journey/shapes/registry.js";

describe("single_rule_trial plugin", () => {
  it("declares rootOptionCount min and max of 1", () => {
    const plugin = getShapePlugin("single_rule_trial");
    expect(plugin).toBeDefined();
    expect(plugin!.definition.rootOptionCount).toEqual({ min: 1, max: 1 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- single-rule-trial`
Expected: FAIL.

- [ ] **Step 4: Scaffold the plugin and relax invariants**

Create the plugin directory with the standard files (mirroring the structure of `src/journey/shapes/single_reward/`). Set `topology: "single_offer_refusal"` if that's the closest existing topology, otherwise add a new `JourneyTopology` value `"single_rule_trial"` to the union at `src/journey/shapes/types.ts:18-26`. Set `rootOptionCount: { min: 1, max: 1 }`.

For each accidental `>= 2` guard found in Step 1, replace with a guard that reads the shape's own `rootOptionCount.min` (or remove the guard if the shape definition is the right source of truth).

Register the plugin in `src/journey/shapes/registry.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journey/shapes/single_rule_trial/ src/journey/shapes/registry.ts src/journey/shapes/types.ts src/journey/generate.ts src/journey/repair.ts
git commit -m "Add single_rule_trial shape and relax hardcoded rootOptionCount floors

A shape plugin with rootOptionCount min and max of 1, intended for single-
rule application scenarios with no choice. Audited generate.ts and
repair.ts for hardcoded '>= 2' floors and replaced accidental ones with
shape-defined floors."
```

**Phase 13 acceptance criteria:**
- `single_rule_trial` is registered and selectable; a 100-seed sweep produces at least one instance.
- No accidental `rootOptionCount >= 2` guards remain in `src/journey/generate.ts` or `src/journey/repair.ts`.

---

# Phase 14 — Primitive: Generated trade tickets

**Motivation.** `paired_return`'s `future_named_object_trade` requires the anchor to be a real catalog Dreamsign. Some brainstorm scenarios want a generic ticket-style anchor (Key, Parchment, Token) that is a generated object rather than a permanent catalog entry.

**Scope.** Add a new generated-object archetype `trade_ticket` with three flavours (Key, Parchment, Token). Make `future_named_object_trade` accept a generated trade ticket anchor in addition to a catalog Dreamsign.

**Files:**
- Modify: `src/journey/fillers/generatedObjects.ts`
- Modify: `src/journey/shapes/paired_return.ts` (or its fill if extracted)
- Test: `test/trade-tickets.test.ts`

### Task 14.1: Add `tradeTicketBody` archetype

- [ ] **Step 1: Write the failing test**

```typescript
// test/trade-tickets.test.ts
import { describe, expect, it } from "vitest";
import { tradeTicketBody } from "../src/journey/fillers/generatedObjects.js";

describe("tradeTicketBody", () => {
  it.each(["Key", "Parchment", "Token"])("produces a %s anchor", (flavour) => {
    const { drawContext } = makeTestContext({ seed: `tt-${flavour}` });
    const body = tradeTicketBody({
      drawContext, label: "tt-test", flavour: flavour as "Key" | "Parchment" | "Token",
    });
    expect(body.objectType).toBe("Quest Ticket");
    expect(body.name).toContain(flavour);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- trade-tickets`
Expected: FAIL.

- [ ] **Step 3: Implement `tradeTicketBody`**

In `src/journey/fillers/generatedObjects.ts`, add (next to `naturalStatusBody` at line 411):

```typescript
type TradeTicketArgs = {
  drawContext: DrawContext;
  label: string;
  flavour: "Key" | "Parchment" | "Token";
};

export function tradeTicketBody(args: TradeTicketArgs): GeneratedObjectBody {
  const idPart = `trade-ticket-${kebab(args.flavour)}`;
  return {
    idPart,
    name: `${args.flavour} of Passage`,
    objectType: "Quest Ticket",
    rulesText: `Hold this ${args.flavour} until the next eligible trade; then exchange it for the promised reward.`,
    tags: ["journey-only", "ticket", "trade"],
    references: { rules: [args.flavour, "trade"] },
    duration: generatedObjectDuration("until traded", 1, "trade_count"),
    lifetime: "until_returned",
    valueEstimate: {
      convertedEssence: 90,
      confidence: "medium",
      basis: "Trade-ticket anchor for a deferred named-object exchange.",
    },
    payload: {
      ticketKind: args.flavour,
      source: "manifest_generated",
    },
    ruleIds: [
      "stable_id",
      "duration",
      "value_estimate",
      "manifest_local",
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- trade-tickets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/generatedObjects.ts test/trade-tickets.test.ts
git commit -m "Add tradeTicketBody archetype with Key, Parchment, Token flavours

A new generated-object archetype that produces a ticket-shaped anchor for
deferred trades. Each flavour is a manifest-local generated object with
'until traded' lifetime semantics."
```

### Task 14.2: Make `future_named_object_trade` accept a generated trade ticket

- [ ] **Step 1: Write the failing test**

```typescript
// test/trade-tickets.test.ts (add)
import { pairedReturnFill } from "../src/journey/shapes/paired_return.js";

describe("paired_return with generated trade ticket anchor", () => {
  it("can use a tradeTicketBody as the anchor instead of a catalog Dreamsign", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "pr-tt-1" });
    let sawTicketAnchor = false;
    for (let i = 0; i < 50; i += 1) {
      const fill = pairedReturnFill({
        context, drawContext: drawContext.fork(`iter-${i}`), stage,
      });
      const anchor = fill?.options?.[0]?.payloads.find((p) => p.kind === "trade_anchor");
      if (anchor && (anchor as any).source === "manifest_generated") {
        sawTicketAnchor = true;
        break;
      }
    }
    expect(sawTicketAnchor).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- trade-tickets`
Expected: FAIL.

- [ ] **Step 3: Update `pairedReturnFill`**

In `src/journey/shapes/paired_return.ts`, find where the trade anchor is selected. Add a coin-flip between "catalog Dreamsign" and "tradeTicketBody". When the latter is chosen, register the body as a manifest-local generated object and reference it from the anchor payload.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/paired_return.ts
git commit -m "Allow paired_return to use a generated trade ticket as anchor

future_named_object_trade no longer requires a catalog Dreamsign; it can
also use a manifest-local Key, Parchment, or Token generated by
tradeTicketBody. Selection is a uniform coin flip."
```

**Phase 14 acceptance criteria:**
- `tradeTicketBody` is exported and produces three distinct flavours.
- A 50-seed sweep of `paired_return` produces at least one manifest with a generated ticket anchor.

---

# Phase 15 — Primitive: `expires after N triggers` lifetime semantics

**Motivation.** No payload describes object lifetime in trigger units (e.g. "this status dissolves after 3 dreamsign triggers"). Adding this lifetime kind unblocks a small family of brainstorm scenarios.

**Scope.** Add a new `lifetime` kind `{ kind: "trigger_count", triggerSelector, count }` to the generated-object payload union and to the relevant rendering helpers.

**Files:**
- Modify: `src/journey/fillers/generatedObjects.ts` (add to the lifetime union)
- Modify: any payload renderer that switches on `lifetime` (audit)
- Test: `test/trigger-count-lifetime.test.ts`

### Task 15.1: Add the lifetime kind

- [ ] **Step 1: Write the failing test**

```typescript
// test/trigger-count-lifetime.test.ts
import { describe, expect, it } from "vitest";
import { renderLifetimeText } from "../src/journey/fillers/generatedObjects.js";

describe("trigger_count lifetime", () => {
  it("renders 'dissolves after N <trigger> events'", () => {
    expect(renderLifetimeText({
      kind: "trigger_count",
      triggerKind: "dreamsign_trigger",
      count: 3,
    })).toBe("dissolves after 3 Dreamsign triggers");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- trigger-count-lifetime`
Expected: FAIL.

- [ ] **Step 3: Add the kind**

Find the lifetime union in `generatedObjects.ts` (look for `lifetime: "until_returned" | "temporary"` and similar). Extend it to include `| { kind: "trigger_count"; triggerKind: HookTriggerSelector["triggerKind"]; count: number }`. Add a `renderLifetimeText` helper and exhaustive switch over the kinds.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run typecheck`
Expected: PASS. (Typecheck will fail at every consumer of the lifetime field that has an exhaustive switch — extend each switch to handle the new kind. Renderers should produce a sensible fallback.)

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/generatedObjects.ts
git commit -m "Add trigger_count lifetime kind for generated objects

A new lifetime kind that expresses 'dissolves after N <trigger> events'.
Every exhaustive switch over the lifetime union is extended to handle the
new kind."
```

**Phase 15 acceptance criteria:**
- `trigger_count` is a member of the lifetime union; renderers produce sensible text.
- At least one generated-object archetype can use the new lifetime (wire one up via Phase 16's status archetype if convenient, or in a follow-up).

---

# Phase 16 — Primitive: In-battle one-shot status archetype

**Motivation.** `naturalStatusBody` at `src/journey/fillers/generatedObjects.ts:411-533` has three archetypes (`shop-reclaim`, `bane-essence`, `purge-copy`) — none of which cover hand/energy/turn manipulations. Brainstorm scenarios with one-shot in-battle effects (e.g. "this turn, +2 energy") have no archetype to pick.

**Scope.** Add a fourth archetype `oneshot-battle-rule` to the `pick(...)` array. Implement its body with three flavours: hand size, energy, and turn-end behaviour.

**Files:**
- Modify: `src/journey/fillers/generatedObjects.ts`
- Test: `test/oneshot-battle-status.test.ts`

### Task 16.1: Add the archetype

- [ ] **Step 1: Write the failing test**

```typescript
// test/oneshot-battle-status.test.ts
import { describe, expect, it } from "vitest";
import { naturalStatusBody } from "../src/journey/fillers/generatedObjects.js";

describe("oneshot-battle-rule status archetype", () => {
  it("is one of the archetypes pickable by naturalStatusBody", () => {
    const seenFragments = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const { drawContext } = makeTestContext({ seed: `oneshot:${i}` });
      const body = naturalStatusBody({
        drawContext, cards: [], label: "test",
      });
      seenFragments.add(body.idPart.split("-")[0]!);
    }
    expect(seenFragments.has("oneshot")).toBe(true);
  });

  it("produces a one-sentence rule about hand/energy/turn", () => {
    const { drawContext } = makeTestContext({ seed: "oneshot-flavour" });
    // Force selection of the new archetype by stubbing pick (or by seed-hunting).
    const body = forceArchetype(naturalStatusBody, "oneshot-battle-rule", drawContext);
    expect(body.rulesText.toLowerCase()).toMatch(/hand|energy|turn/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- oneshot-battle-status`
Expected: FAIL.

- [ ] **Step 3: Add the archetype**

In `src/journey/fillers/generatedObjects.ts:418-422`, change the `pick(...)` array to include `"oneshot-battle-rule"`:

```typescript
const fragment = pick(args.drawContext, "generated-object:status:rules", [
  "purge-copy",
  "shop-reclaim",
  "bane-essence",
  "oneshot-battle-rule",
] as const);
```

After the existing `if (fragment === "bane-essence")` block (around line 463-505), add an `if (fragment === "oneshot-battle-rule")` block. Inside, pick a sub-flavour:

```typescript
if (fragment === "oneshot-battle-rule") {
  const flavour = pick(args.drawContext, "generated-object:status:oneshot-flavour", [
    "hand_size", "energy", "turn_end",
  ] as const);
  const rulesText = (
    flavour === "hand_size" ? `In your next battle, your starting hand size is +2.` :
    flavour === "energy"    ? `In your next battle, gain 1 extra energy on turn 1.` :
                              `In your next battle, your turn does not end automatically.`
  );
  return {
    idPart: `oneshot-battle-${flavour}`,
    name,
    objectType: "Quest Status",
    rulesText,
    tags: ["journey-only", "status", "battle", "oneshot"],
    references: { rules: ["battle", flavour === "energy" ? "energy" : flavour === "hand_size" ? "hand size" : "turn"] },
    duration: generatedObjectDuration("next battle", 1, "battle_count"),
    lifetime: "temporary",
    valueEstimate: {
      convertedEssence: 95,
      confidence: "medium",
      basis: "One-shot battle rule with bounded scope.",
    },
    payload: {
      statusScope: "battle",
      affectedObject: "battle_rule",
      flavour,
      source: "manifest_generated",
    },
    ruleIds: [
      "stable_id",
      "status_scope",
      "duration",
      "value_estimate",
      "manifest_local",
    ],
  };
}
```

The existing `purge-copy` block at line 507 becomes the fall-through default; no change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journey/fillers/generatedObjects.ts test/oneshot-battle-status.test.ts
git commit -m "Add oneshot-battle-rule archetype to naturalStatusBody

A fourth status archetype with three sub-flavours (hand size, energy,
turn-end) covering brainstorm scenarios that need an in-battle one-shot
status. The three existing archetypes are unchanged."
```

**Phase 16 acceptance criteria:**
- A 100-seed `naturalStatusBody` sweep produces at least one `oneshot-battle-rule` body.
- All three sub-flavours appear across a 100-seed sweep.

---

# Final verification

After all phases land:

- [ ] **Run the full suite under audit mode**

Run: `npm test`
Expected: PASS. This runs the Vitest suite.

- [ ] **Verify no shape-isolation leaks**

Run: `grep -rn '"independent_rows_menu"\|"single_rule_trial"' src test | grep -v 'shapes/independent_rows_menu\|shapes/single_rule_trial\|registry.ts\|independent-rows-menu.test.ts\|single-rule-trial.test.ts\|journey-generation.test.ts'`
Expected: empty.

- [ ] **Verify the deprecated symbols are gone**

Run:
```bash
grep -rn 'topologies:' src/journey/fillers/cardOperationCatalog.ts src/journey/fillers/dreamsignOperationCatalog.ts
grep -rn 'CardOperationTopology\|DreamsignOperationTopology' src
grep -rn 'scissorSaintCompoundFill\|moltingArchiveCompoundFill\|witheredOrchardCompoundFill\|mixedServiceCompoundFill' src test
grep -rn 'shared_target_operations\|shared_operation_named_targets' src
```
Expected: all empty.

- [ ] **Smoke a generator seed with default settings**

Run: `npm run journey -- --seed qa`
Expected: produces a manifest with no errors.

- [ ] **Final commit**

If any documentation in `docs/` references shapes or operations that have changed, update those references in a single dedicated commit:

```bash
git add docs/
git commit -m "Update docs to reflect resolution-consolidation changes"
```
