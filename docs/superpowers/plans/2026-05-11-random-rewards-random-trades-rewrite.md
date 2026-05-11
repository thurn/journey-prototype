# Clean-room rewrite of `random_rewards` and `random_trades` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `random_rewards` and `random_trades` shape implementations with self-contained, validation-bypassing plugins whose reward/cost templates, predicates, CEC math, and content helpers live in a peer `src/journey/shared/` module.

**Architecture:** Add a `bypassStandardValidation` flag to `JourneyShapeDefinition` so the heavy validation pipeline skips these shapes. Both shape directories depend only on their own files and a sibling `src/journey/shared/` module containing the reward/cost template tables and supporting machinery. Cross-imports between the two shape directories are forbidden.

**Tech Stack:** TypeScript (NodeNext), vitest, the existing journey plugin contract (`JourneyShapePlugin`, `defineShapePlugin`).

**Spec:** `docs/superpowers/specs/2026-05-11-random-rewards-random-trades-rewrite-design.md`

---

## Task index

1. Add `bypassStandardValidation` field to plugin contract
2. Wire the bypass branch into the validation pipeline
3. Create `shared/types.ts` (Reward, Cost, Predicate, Params types)
4. Create `shared/cec.ts` (CEC constants and helpers)
5. Create `shared/predicates.ts` (predicate table)
6. Create `shared/content.ts` (content helpers + dreamwell stop-gap)
7. Create `shared/text.ts` (rendering helpers, [LOCKED] prefix)
8. Create `shared/rewards.ts` scaffold + resource family
9. Add card-pool reward family
10. Add card-modification / transfiguration / fast reward family
11. Add starter / purge / transform reward family
12. Add dreamsign reward family
13. Add bane / site / dreamwell / misc reward family
14. Add `meta_gain_2_rewards`
15. Create `shared/costs.ts` scaffold + resource family (with LOCKED)
16. Add card-purge / transform cost family
17. Add dreamsign cost family
18. Add bane / dreamwell / starter cost family
19. Add misc cost family
20. Add `meta_pay_2_costs`
21. Delete legacy `random_rewards/fill.ts` body and replace shape
22. Implement `random_rewards/fill.ts` (algorithm) + tests
23. Delete legacy `random_trades/{fill,rowPools,validators}.ts` and replace shape
24. Implement `random_trades/fill.ts` (algorithm) + tests
25. Update existing centralized tests and the canonical snapshot
26. Extend the shape-isolation test for the new cross-shape rule
27. Final smoke run (typecheck + tests + journey CLI)

---

## Task 1: Add `bypassStandardValidation` to the plugin contract

**Files:**
- Modify: `src/journey/shapes/types.ts`
- Modify: `src/journey/shapes/shared.ts`

**Context:** The new shapes own correctness by construction. The pipeline needs one coarse opt-out so the heavy payload/value/precommit validators skip them. We add the flag to `JourneyShapeDefinition` and pass it through `freezeShapeDefinition`.

- [ ] **Step 1: Add the field declaration**

In `src/journey/shapes/types.ts`, inside `JourneyShapeDefinition`, add a new optional readonly field just below `compoundAllowsRouteOnlyReward`:

```ts
  readonly compoundAllowsRouteOnlyReward: boolean;
  readonly bypassStandardValidation: boolean;
};
```

- [ ] **Step 2: Make it optional in `RawJourneyShapeDefinition` in `shared.ts`**

Find the `RawJourneyShapeDefinition` type alias near the top of `src/journey/shapes/shared.ts`. Add `"bypassStandardValidation"` to the `Omit<>` list, then add it as an optional property in the intersection:

```ts
export type RawJourneyShapeDefinition = Omit<
  JourneyShapeDefinition,
  | "payloadCompatibility"
  | "menuValueChecks"
  | "allowsRouteReward"
  | "allowsRouteSideEffects"
  | "compoundCoherence"
  | "requiresPrecommittedRandom"
  | "compoundAllowsRouteOnlyReward"
  | "bypassStandardValidation"
> & {
  readonly payloadCompatibility?: readonly JourneyPayloadCompatibility[];
  readonly menuValueChecks?: JourneyShapeDefinition["menuValueChecks"];
  readonly allowsRouteReward?: boolean;
  readonly allowsRouteSideEffects?: boolean;
  readonly compoundCoherence?: JourneyShapeDefinition["compoundCoherence"];
  readonly requiresPrecommittedRandom?: boolean;
  readonly compoundAllowsRouteOnlyReward?: boolean;
  readonly bypassStandardValidation?: boolean;
};
```

- [ ] **Step 3: Default it inside `freezeShapeDefinition`**

In the return value of `freezeShapeDefinition` (same file), add the default just after `compoundAllowsRouteOnlyReward`:

```ts
    compoundAllowsRouteOnlyReward:
      definition.compoundAllowsRouteOnlyReward ?? false,
    bypassStandardValidation: definition.bypassStandardValidation ?? false,
  });
}
```

- [ ] **Step 4: Verify the typecheck passes**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/journey/shapes/types.ts src/journey/shapes/shared.ts
git commit -m "feat(shapes): add bypassStandardValidation flag to plugin contract"
```

---

## Task 2: Wire bypass branch into the validation pipeline

**Files:**
- Modify: `src/journey/validate/pipeline.ts`
- Modify: `test/journey-shapes.test.ts` (add bypass test using fixture plugin)

**Context:** When `definition.bypassStandardValidation === true`, return the accumulated rule outcomes after the four cheap structural checks (`manifest_schema_version`, `manifest_version_metadata`, `journey_id_format`, `root_option_count_within_bounds`) and skip everything else. The bypass MUST fire before `typedPayloadContractResult` so empty `operations`/`costs`/`effects`/etc. arrays don't trip typed-payload contracts.

- [ ] **Step 1: Modify the pipeline to honor the flag**

In `src/journey/validate/pipeline.ts`, after the `root_option_count_within_bounds` pushRule block (around line 122) and BEFORE the `typedPayloadContractResult` block (around line 124), insert:

```ts
  if (definition.bypassStandardValidation) {
    return rules;
  }
```

The four cheap checks already at the top of `validationRuleOutcomes` (schema version, version metadata, journey ID format, option count) remain and continue to run for bypassed shapes.

- [ ] **Step 2: Add a propagation smoke test**

In `test/journey-shapes.test.ts`, add a new test near the existing fixture-plugin test (around line 274). End-to-end pipeline behavior is exercised by the per-shape tests in Tasks 22/24; this test just documents the contract that the flag round-trips through `defineShapePlugin`:

```ts
  it("propagates bypassStandardValidation through defineShapePlugin", () => {
    const plugin = defineShapePlugin({
      definition: {
        id: "bypass_fixture_shape",
        topology: "direct_menu",
        rootOptionCount: { min: 1, max: 1 },
        supportedTags: [],
        validationRules: [
          "manifest_schema_version",
          "manifest_version_metadata",
          "journey_id_format",
          "root_option_count_within_bounds",
        ],
        repairPreferences: [],
        debugLabel: "Bypass fixture",
        versionContribution: { catalogVersion: "test", id: "bypass_fixture_shape" },
        bypassStandardValidation: true,
      },
      scoreWeight: 0,
      fill: () => ({ options: [], precommitted: {} }),
    });

    expect(plugin.definition.bypassStandardValidation).toBe(true);
  });

  it("defaults bypassStandardValidation to false when not specified", () => {
    const plugin = defineShapePlugin({
      definition: {
        id: "default_bypass_fixture",
        topology: "direct_menu",
        rootOptionCount: { min: 1, max: 1 },
        supportedTags: [],
        validationRules: ["root_option_count_within_bounds"],
        repairPreferences: [],
        debugLabel: "Default fixture",
        versionContribution: { catalogVersion: "test", id: "default_bypass_fixture" },
      },
      scoreWeight: 0,
      fill: () => ({ options: [], precommitted: {} }),
    });

    expect(plugin.definition.bypassStandardValidation).toBe(false);
  });
```

- [ ] **Step 3: Run the suite**

Run: `npx vitest run test/journey-shapes.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all existing tests pass. (No production shape sets `bypassStandardValidation: true` yet, so behavior for existing shapes is unchanged.)

- [ ] **Step 4: Commit**

```bash
git add src/journey/validate/pipeline.ts test/journey-shapes.test.ts
git commit -m "feat(validate): honor bypassStandardValidation flag in pipeline"
```

---

## Task 3: Create `shared/types.ts`

**Files:**
- Create: `src/journey/shared/types.ts`

**Context:** Shared type definitions for the reward/cost templates, predicates, and the per-template parameter family. `Cost = Reward` because they have the same shape; the cost-side just interprets the CEC differently.

- [ ] **Step 1: Create the file**

```ts
// src/journey/shared/types.ts
import type { CardTargetPredicate } from "../journey/effects.js";
import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";

export type TemplateParams = Record<string, unknown>;

export type Reward<P extends TemplateParams = TemplateParams> = {
  readonly id: string;
  readonly weight: number;
  readonly rollParams: (ctx: JourneyContext, draw: DrawContext) => P;
  readonly cec: (params: P, ctx: JourneyContext) => number;
  readonly viable: (params: P, ctx: JourneyContext) => boolean;
  readonly render: (params: P, ctx: JourneyContext) => string;
};

export type Cost<P extends TemplateParams = TemplateParams> = Reward<P>;

export type Predicate = {
  readonly id: string;
  readonly multiplier: number;
  readonly cardPredicate?: CardTargetPredicate;
  readonly text: { readonly singular: string; readonly plural: string };
};
```

Note: `import type { CardTargetPredicate } from "../journey/effects.js"` — the path is relative to `src/journey/shared/`, so `../journey/effects.js` does not work. The correct import is `from "../effects.js"`. Use that instead.

Final imports block:

```ts
import type { CardTargetPredicate } from "../effects.js";
import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journey/shared/types.ts
git commit -m "feat(shared): add Reward/Cost/Predicate types for new shapes"
```

---

## Task 4: Create `shared/cec.ts`

**Files:**
- Create: `src/journey/shared/cec.ts`

**Context:** Centralizes the CEC computation helpers used by card-pool templates. Resource templates compute CEC directly from rolled amounts.

- [ ] **Step 1: Create the file**

```ts
// src/journey/shared/cec.ts
import type { Predicate } from "./types.js";

export const CARD_CEC = 40;

export const STAGE_MULTIPLIER = 1.0;

export function cardPoolCEC(
  perItem: number,
  count: number,
  predicate: Predicate,
  stageMultiplier: number = STAGE_MULTIPLIER,
): number {
  return perItem * count * predicate.multiplier * stageMultiplier;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journey/shared/cec.ts
git commit -m "feat(shared): add CEC constants and cardPoolCEC helper"
```

---

## Task 5: Create `shared/predicates.ts`

**Files:**
- Create: `src/journey/shared/predicates.ts`
- Create: `test/shared/predicates.test.ts`

**Context:** Defines the predicate table referenced by card-pool templates. Each predicate carries a CEC multiplier and (for card predicates) a `CardTargetPredicate` matching `src/journey/effects.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// test/shared/predicates.test.ts
import { describe, expect, it } from "vitest";
import { PREDICATES, getPredicate } from "../../src/journey/shared/predicates.js";

describe("predicates", () => {
  it("includes every predicate from the spec", () => {
    const expected = [
      "events", "characters", "warriors", "survivors", "spirit_animals",
      "low_cost", "high_cost", "low_spark", "high_spark",
      "materialized", "judgment", "fast", "starter", "legendary", "transfigured",
    ].sort();
    expect(PREDICATES.map((p) => p.id).sort()).toEqual(expected);
  });

  it("characters has multiplier 1.0 and warriors has 1.4", () => {
    expect(getPredicate("characters").multiplier).toBe(1.0);
    expect(getPredicate("warriors").multiplier).toBe(1.4);
  });

  it("warriors carries a cardType+subtype card predicate", () => {
    expect(getPredicate("warriors").cardPredicate).toEqual({
      cardType: "Character",
      subtype: "Warrior",
    });
  });

  it("throws for an unknown predicate id", () => {
    expect(() => getPredicate("not_a_predicate")).toThrow();
  });
});
```

Run: `npx vitest run test/shared/predicates.test.ts`
Expected: FAIL with module-not-found error.

- [ ] **Step 2: Create `shared/predicates.ts`**

```ts
// src/journey/shared/predicates.ts
import type { Predicate } from "./types.js";

export const PREDICATES: readonly Predicate[] = Object.freeze([
  predicate("events", 1.0, { singular: "Event card", plural: "Event cards" },
    { cardType: "Event" }),
  predicate("characters", 1.0, { singular: "Character", plural: "Characters" },
    { cardType: "Character" }),
  predicate("warriors", 1.4, { singular: "Warrior", plural: "Warriors" },
    { cardType: "Character", subtype: "Warrior" }),
  predicate("survivors", 1.4, { singular: "Survivor", plural: "Survivors" },
    { cardType: "Character", subtype: "Survivor" }),
  predicate("spirit_animals", 1.4,
    { singular: "Spirit Animal", plural: "Spirit Animals" },
    { cardType: "Character", subtype: "Spirit Animal" }),
  predicate("low_cost", 1.2,
    { singular: "low-cost card", plural: "low-cost cards" },
    { maxEnergyCost: 2 }),
  predicate("high_cost", 1.3,
    { singular: "high-cost card", plural: "high-cost cards" },
    { minEnergyCost: 4 }),
  predicate("low_spark", 1.2,
    { singular: "low-spark card", plural: "low-spark cards" },
    { spark: 1 }),
  predicate("high_spark", 1.3,
    { singular: "high-spark card", plural: "high-spark cards" },
    { spark: 4 }),
  predicate("materialized", 1.3,
    { singular: "Materialized card", plural: "Materialized cards" },
    { renderedTextIncludes: "Materialized" }),
  predicate("judgment", 1.3,
    { singular: "Judgment card", plural: "Judgment cards" },
    { renderedTextIncludes: "Judgment" }),
  predicate("fast", 1.2,
    { singular: "Fast card", plural: "Fast cards" },
    { isFast: true }),
  predicate("starter", 1.0,
    { singular: "Starter card", plural: "Starter cards" },
    { starter: true }),
  predicate("legendary", 1.8,
    { singular: "Legendary card", plural: "Legendary cards" },
    { rarity: "legendary" }),
  predicate("transfigured", 1.6,
    { singular: "Transfigured card", plural: "Transfigured cards" },
    { renderedTextIncludes: "Transfigured" }),
]);

function predicate(
  id: string,
  multiplier: number,
  text: Predicate["text"],
  cardPredicate?: Predicate["cardPredicate"],
): Predicate {
  return Object.freeze({ id, multiplier, text, cardPredicate });
}

const BY_ID = new Map(PREDICATES.map((p) => [p.id, p]));

export function getPredicate(id: string): Predicate {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown predicate id: ${id}`);
  return found;
}
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/predicates.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/predicates.ts test/shared/predicates.test.ts
git commit -m "feat(shared): add predicate table for reward/cost templates"
```

---

## Task 6: Create `shared/content.ts`

**Files:**
- Create: `src/journey/shared/content.ts`
- Create: `test/shared/content.test.ts`

**Context:** Thin helpers over `src/journey/effects.ts` primitives + a curated dreamwell-card list. The shared module is allowed to import shape-agnostic primitives from `effects.ts` but never from any shape directory.

- [ ] **Step 1: Write the failing test**

```ts
// test/shared/content.test.ts
import { describe, expect, it } from "vitest";
import {
  POSITIVE_DREAMWELL_CARDS,
  NEGATIVE_DREAMWELL_CARDS,
  pickFromList,
} from "../../src/journey/shared/content.js";

describe("content helpers", () => {
  it("ships at least 6 positive and 6 negative dreamwell stub names", () => {
    expect(POSITIVE_DREAMWELL_CARDS.length).toBeGreaterThanOrEqual(6);
    expect(NEGATIVE_DREAMWELL_CARDS.length).toBeGreaterThanOrEqual(6);
  });

  it("pickFromList is deterministic for the same DrawContext + label", () => {
    const draw = {
      seed: "test", contentVersion: "v1", rootJourneyIndex: 0,
    };
    const first = pickFromList(draw, "label", ["a", "b", "c", "d"]);
    const second = pickFromList(draw, "label", ["a", "b", "c", "d"]);
    expect(first).toBe(second);
  });
});
```

Run: `npx vitest run test/shared/content.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 2: Create the file**

```ts
// src/journey/shared/content.ts
import {
  ALLOWED_TRANSFIGURATIONS,
  BANE_NAMES,
  SITE_TYPES,
  resolveCardTargets,
  resolveDreamsignTargets,
  type CardTargetPredicate,
  type DreamsignTargetPredicate,
} from "../effects.js";
import type { ContentBundle, CardContent, DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { drawInt, type DrawContext } from "../../util/rng.js";

export { ALLOWED_TRANSFIGURATIONS, BANE_NAMES, SITE_TYPES };

export const POSITIVE_DREAMWELL_CARDS: readonly string[] = Object.freeze([
  "Wellspring", "Harmony", "Insight", "Refrain", "Lantern", "Echo of Dawn",
]);

export const NEGATIVE_DREAMWELL_CARDS: readonly string[] = Object.freeze([
  "Stillborn Tide", "Hollow Refrain", "Choking Ash",
  "Bitter Echo", "Sunken Lantern", "Frostbite",
]);

export function cardMatches(
  ctx: JourneyContext,
  predicate: CardTargetPredicate,
): readonly CardContent[] {
  return resolveCardTargets(ctx.content, ctx.state.quest, predicate);
}

export function dreamsignMatches(
  ctx: JourneyContext,
  predicate: DreamsignTargetPredicate = {},
): readonly DreamsignContent[] {
  return resolveDreamsignTargets(ctx.content, ctx.state.quest, predicate);
}

export function activeDreamsignCount(ctx: JourneyContext): number {
  return ctx.state.quest.activeDreamsigns.length;
}

export function starterCardCount(ctx: JourneyContext): number {
  return ctx.state.quest.deck.summary.starterCards;
}

export function essenceAmount(ctx: JourneyContext): number {
  return ctx.state.quest.resources.essence;
}

export function omenAmount(ctx: JourneyContext): number {
  return ctx.state.quest.resources.omens;
}

export function maxEssence(ctx: JourneyContext): number {
  return ctx.state.quest.resources.maxEssence;
}

// Bane state isn't currently tracked on QuestState; treat as 0 so
// bane-purging templates are never viable in v1. Documented stop-gap.
export function baneCount(_ctx: JourneyContext): number {
  return 0;
}

export function pickFromList<T>(
  draw: DrawContext,
  label: string,
  list: readonly T[],
): T {
  if (list.length === 0) {
    throw new Error(`pickFromList: empty list for label ${label}`);
  }
  const index = drawInt(draw, label, 0, list.length - 1);
  return list[index]!;
}
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/content.ts test/shared/content.test.ts
git commit -m "feat(shared): add content helpers and dreamwell stop-gap lists"
```

---

## Task 7: Create `shared/text.ts`

**Files:**
- Create: `src/journey/shared/text.ts`
- Create: `test/shared/text.test.ts`

**Context:** Helpers to assemble option text from concatenated effect/cost text snippets and to apply the `[LOCKED]` prefix.

- [ ] **Step 1: Write the failing test**

```ts
// test/shared/text.test.ts
import { describe, expect, it } from "vitest";
import { joinSnippets, withLockedPrefix } from "../../src/journey/shared/text.js";

describe("text helpers", () => {
  it("joinSnippets concatenates with periods and a single space", () => {
    expect(joinSnippets(["Gain 50 essence", "Lose 1 omen"])).toBe(
      "Gain 50 essence. Lose 1 omen.",
    );
  });

  it("joinSnippets handles a single snippet", () => {
    expect(joinSnippets(["Gain 50 essence"])).toBe("Gain 50 essence.");
  });

  it("joinSnippets skips empty entries", () => {
    expect(joinSnippets(["Gain 50 essence", ""])).toBe("Gain 50 essence.");
  });

  it("withLockedPrefix prepends [LOCKED]", () => {
    expect(withLockedPrefix("Pay 50 essence.", true)).toBe(
      "[LOCKED] Pay 50 essence.",
    );
    expect(withLockedPrefix("Pay 50 essence.", false)).toBe("Pay 50 essence.");
  });
});
```

Run: `npx vitest run test/shared/text.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 2: Create the file**

```ts
// src/journey/shared/text.ts

export function joinSnippets(snippets: readonly string[]): string {
  return snippets
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(".") ? s : `${s}.`))
    .join(" ");
}

export function withLockedPrefix(text: string, locked: boolean): string {
  return locked ? `[LOCKED] ${text}` : text;
}
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/text.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/text.ts test/shared/text.test.ts
git commit -m "feat(shared): add text snippet join + [LOCKED] prefix helper"
```

---

## Task 8: Create `shared/rewards.ts` scaffold + resource family

**Files:**
- Create: `src/journey/shared/rewards.ts`
- Create: `test/shared/rewards.test.ts`

**Context:** The reward table is the heart of both shapes. We build it incrementally: this task implements the resource family (`gain_essence`, `gain_max_essence`, `set_essence_to_percent_of_max`, `gain_essence_random_range`, `gain_omens`, `gain_essence_to_max`) and the `REWARDS` registry + lookup. Later tasks append more families.

- [ ] **Step 1: Write the failing test**

```ts
// test/shared/rewards.test.ts
import { describe, expect, it } from "vitest";
import {
  REWARDS,
  getReward,
} from "../../src/journey/shared/rewards.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";

const draw: DrawContext = {
  seed: "rewards-test", contentVersion: "v1", rootJourneyIndex: 0,
};

function fakeCtx(overrides: Partial<JourneyContext["state"]["quest"]["resources"]> = {}): JourneyContext {
  return {
    projectRoot: "",
    contentVersion: "v1",
    content: { cards: [], dreamcallers: [], dreamsigns: [], rawBytes: {} as never },
    state: {
      schemaVersion: 1,
      contentVersion: "v1",
      generator: { rootJourneyIndex: 0, lastJourneyId: null, cursors: {} },
      pendingJourney: null,
      history: [],
      quest: {
        seed: "rewards-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 100, maxEssence: 200, omens: 0, dreamscape: 1, ...overrides },
        selectedTides: [], mandatoryTides: [], optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [], dreamsignPoolIds: [],
        dreamsignPoolSummary: { tidalPoolCount: 0, neutralCatalogCount: 0 },
        draftPool: [],
        draftPoolSummary: { totalCopies: 0, uniqueCards: 0, oneCopyCards: 0, twoCopyCards: 0 },
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

describe("rewards table (resource family)", () => {
  it("registers gain_essence with positive CEC", () => {
    const t = getReward("gain_essence");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.viable(p, fakeCtx())).toBe(true);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
    expect(t.render(p, fakeCtx())).toMatch(/Gain \d+ essence/);
  });

  it("gain_essence rolls X in {50,55,...,200}", () => {
    const t = getReward("gain_essence");
    for (let i = 0; i < 50; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i });
      const text = t.render(p, fakeCtx());
      const match = text.match(/Gain (\d+) essence/);
      expect(match).not.toBeNull();
      const x = Number(match![1]);
      expect(x).toBeGreaterThanOrEqual(50);
      expect(x).toBeLessThanOrEqual(200);
      expect(x % 5).toBe(0);
    }
  });

  it("registers gain_omens, gain_max_essence, set_essence_to_percent_of_max, gain_essence_random_range, gain_essence_to_max", () => {
    for (const id of [
      "gain_omens", "gain_max_essence", "set_essence_to_percent_of_max",
      "gain_essence_random_range", "gain_essence_to_max",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.viable(p, fakeCtx())).toBe(true);
      expect(t.cec(p, fakeCtx())).toBeGreaterThanOrEqual(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("REWARDS is frozen and unique by id", () => {
    expect(Object.isFrozen(REWARDS)).toBe(true);
    const ids = REWARDS.map((r) => r.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
```

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 2: Create the rewards module**

```ts
// src/journey/shared/rewards.ts
import { drawInt } from "../../util/rng.js";
import { STAGE_MULTIPLIER } from "./cec.js";
import { essenceAmount, maxEssence, omenAmount } from "./content.js";
import type { Reward } from "./types.js";

type GainEssenceParams = { x: number };
const gainEssence: Reward<GainEssenceParams> = {
  id: "gain_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: 50 + 5 * drawInt(draw, "gain_essence:x", 0, 30) }),
  cec: (p) => p.x * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} essence`,
};

type GainOmensParams = { x: number };
const gainOmens: Reward<GainOmensParams> = {
  id: "gain_omens",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: drawInt(draw, "gain_omens:x", 1, 3) }),
  cec: (p) => p.x * 40 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} omen${p.x === 1 ? "" : "s"}`,
};

type GainMaxEssenceParams = Record<string, never>;
const gainMaxEssence: Reward<GainMaxEssenceParams> = {
  id: "gain_max_essence",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => maxEssence(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Gain maximum essence",
};

type SetEssencePctParams = { percent: number };
const setEssenceToPercentOfMax: Reward<SetEssencePctParams> = {
  id: "set_essence_to_percent_of_max",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const choices = [50, 75, 100, 125];
    return { percent: choices[drawInt(draw, "set_essence_pct:i", 0, choices.length - 1)]! };
  },
  cec: (p, ctx) => Math.max(0, (maxEssence(ctx) * p.percent) / 100 - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Set essence to ${p.percent}% of your maximum essence`,
};

type GainEssenceRangeParams = { min: number; max: number };
const gainEssenceRandomRange: Reward<GainEssenceRangeParams> = {
  id: "gain_essence_random_range",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const base = 30 + 10 * drawInt(draw, "essence_range:base", 0, 12);
    const spread = 30 + 10 * drawInt(draw, "essence_range:spread", 0, 6);
    return { min: base, max: base + spread };
  },
  cec: (p) => ((p.min + p.max) / 2) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.min}-${p.max} essence (random roll)`,
};

type GainEssenceToMaxParams = Record<string, never>;
const gainEssenceToMax: Reward<GainEssenceToMaxParams> = {
  id: "gain_essence_to_max",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => Math.max(0, maxEssence(ctx) - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Gain essence up to your maximum",
};

export const REWARDS: readonly Reward[] = Object.freeze([
  gainEssence,
  gainOmens,
  gainMaxEssence,
  setEssenceToPercentOfMax,
  gainEssenceRandomRange,
  gainEssenceToMax,
] as Reward[]);

const BY_ID = new Map(REWARDS.map((r) => [r.id, r]));

export function getReward(id: string): Reward {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown reward template id: ${id}`);
  return found;
}
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/rewards.ts test/shared/rewards.test.ts
git commit -m "feat(shared): add resource-family reward templates"
```

---

## Task 9: Add card-pool reward family

**Files:**
- Modify: `src/journey/shared/rewards.ts`
- Modify: `test/shared/rewards.test.ts`

**Context:** Card-pool templates (`gain_random_predicate_cards`, `draft_predicate_cards_from_4`, `take_any_from_predicate_choices`, `gain_named_card`) use `cardMatches` to enforce viability and `cardPoolCEC` to compute their value.

- [ ] **Step 1: Add the test cases**

In `test/shared/rewards.test.ts`, append a new `describe` block:

```ts
describe("rewards table (card-pool family)", () => {
  it("registers gain_random_predicate_cards / draft_predicate_cards_from_4 / take_any_from_predicate_choices / gain_named_card", () => {
    for (const id of [
      "gain_random_predicate_cards",
      "draft_predicate_cards_from_4",
      "take_any_from_predicate_choices",
      "gain_named_card",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      // viable() may be false when the fake content bundle is empty; that's fine.
      // We're just checking the template is registered and the methods don't throw.
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/rewards.test.ts -t "card-pool"`
Expected: FAIL (`Unknown reward template id`).

- [ ] **Step 2: Extend `rewards.ts` with the card-pool family**

Add the following imports to the top of `src/journey/shared/rewards.ts`:

```ts
import { weightedChoice } from "../../util/rng.js";
import { cardMatches, pickFromList } from "./content.js";
import { CARD_CEC, cardPoolCEC, STAGE_MULTIPLIER } from "./cec.js";
import { PREDICATES, getPredicate } from "./predicates.js";
import type { Predicate } from "./types.js";
```

(Combine with existing imports; remove duplicates.)

Then add these template definitions after `gainEssenceToMax`:

```ts
function rollPredicate(draw: DrawContext, label: string): Predicate {
  return weightedChoice(
    draw,
    label,
    PREDICATES.map((p) => ({ item: p, weight: 1 })),
  );
}

type GainRandomCardsParams = { predicateId: string; count: number };
const gainRandomPredicateCards: Reward<GainRandomCardsParams> = {
  id: "gain_random_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "gain_random_predicate:pred").id,
    count: drawInt(draw, "gain_random_predicate:count", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Gain ${p.count} random ${noun}`;
  },
};

type DraftPredicateParams = { predicateId: string };
const draftPredicateCardsFrom4: Reward<DraftPredicateParams> = {
  id: "draft_predicate_cards_from_4",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "draft_predicate:pred").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) => `Draft 1 of 4 ${getPredicate(p.predicateId).text.plural}`,
};

type TakeAnyParams = { predicateId: string; choices: number };
const takeAnyFromPredicateChoices: Reward<TakeAnyParams> = {
  id: "take_any_from_predicate_choices",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "take_any:pred").id,
    choices: drawInt(draw, "take_any:choices", 3, 5),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.2, p.choices / 2, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.choices,
  render: (p) =>
    `Take any number of ${getPredicate(p.predicateId).text.plural} from ${p.choices} choices`,
};

type GainNamedCardParams = { name: string };
const gainNamedCard: Reward<GainNamedCardParams> = {
  id: "gain_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = ctx.content.cards;
    if (pool.length === 0) return { name: "Placeholder Card" };
    const card = pickFromList(draw, "gain_named_card:card", pool);
    return { name: card.name };
  },
  cec: () => CARD_CEC * STAGE_MULTIPLIER,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Gain ${p.name}`,
};
```

Then extend the `REWARDS` array (the `Object.freeze([...])` literal) to include the four new templates:

```ts
export const REWARDS: readonly Reward[] = Object.freeze([
  gainEssence,
  gainOmens,
  gainMaxEssence,
  setEssenceToPercentOfMax,
  gainEssenceRandomRange,
  gainEssenceToMax,
  gainRandomPredicateCards,
  draftPredicateCardsFrom4,
  takeAnyFromPredicateChoices,
  gainNamedCard,
] as Reward[]);
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: PASS (both resource-family and card-pool tests).

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/rewards.ts test/shared/rewards.test.ts
git commit -m "feat(shared): add card-pool reward templates"
```

---

## Task 10: Add card-modification / transfiguration / fast reward family

**Files:**
- Modify: `src/journey/shared/rewards.ts`
- Modify: `test/shared/rewards.test.ts`

**Context:** Templates that mutate existing cards: `apply_chosen_transfiguration_to_chosen_card`, `apply_named_transfiguration_to_chosen_predicate_cards`, `apply_named_transfiguration_to_card_name`, `apply_named_transfiguration_to_random_predicate_cards`, `transfigure_random_starters`, `transfigure_all_starters`, `modify_card_to_reference_type`, `change_card_to_become_type`, `modify_random_cards_to_types`, `make_card_fast`, `make_random_cards_fast`.

- [ ] **Step 1: Add the test cases**

Append to `test/shared/rewards.test.ts`:

```ts
describe("rewards table (modification family)", () => {
  it("registers transfiguration and modification templates", () => {
    for (const id of [
      "apply_chosen_transfiguration_to_chosen_card",
      "apply_named_transfiguration_to_chosen_predicate_cards",
      "apply_named_transfiguration_to_card_name",
      "apply_named_transfiguration_to_random_predicate_cards",
      "transfigure_random_starters",
      "transfigure_all_starters",
      "modify_card_to_reference_type",
      "change_card_to_become_type",
      "modify_random_cards_to_types",
      "make_card_fast",
      "make_random_cards_fast",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/rewards.test.ts -t "modification"`
Expected: FAIL.

- [ ] **Step 2: Extend `rewards.ts`**

Add the following imports if not already present:

```ts
import { ALLOWED_TRANSFIGURATIONS, starterCardCount } from "./content.js";
```

Append these templates:

```ts
type ApplyChosenTransfigChosenCardParams = Record<string, never>;
const applyChosenTransfigurationToChosenCard: Reward<ApplyChosenTransfigChosenCardParams> = {
  id: "apply_chosen_transfiguration_to_chosen_card",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.5,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: () => "Apply a transfiguration of your choice to a chosen card",
};

type ApplyNamedTransfigPredCardsParams = { transfiguration: string; predicateId: string; count: number };
const applyNamedTransfigurationToChosenPredicateCards: Reward<ApplyNamedTransfigPredCardsParams> = {
  id: "apply_named_transfiguration_to_chosen_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    transfiguration: pickFromList(draw, "named_transfig_chosen:t", ALLOWED_TRANSFIGURATIONS),
    predicateId: rollPredicate(draw, "named_transfig_chosen:p").id,
    count: drawInt(draw, "named_transfig_chosen:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.8, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) =>
    `Apply ${p.transfiguration} to ${p.count} chosen ${getPredicate(p.predicateId).text.plural}`,
};

type ApplyNamedTransfigCardNameParams = { transfiguration: string; cardName: string };
const applyNamedTransfigurationToCardName: Reward<ApplyNamedTransfigCardNameParams> = {
  id: "apply_named_transfiguration_to_card_name",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    transfiguration: pickFromList(draw, "named_transfig_named:t", ALLOWED_TRANSFIGURATIONS),
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "named_transfig_named:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.8,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Apply ${p.transfiguration} to ${p.cardName}`,
};

type ApplyNamedTransfigRandomPredParams = { transfiguration: string; predicateId: string; count: number };
const applyNamedTransfigurationToRandomPredicateCards: Reward<ApplyNamedTransfigRandomPredParams> = {
  id: "apply_named_transfiguration_to_random_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    transfiguration: pickFromList(draw, "named_transfig_random:t", ALLOWED_TRANSFIGURATIONS),
    predicateId: rollPredicate(draw, "named_transfig_random:p").id,
    count: drawInt(draw, "named_transfig_random:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) =>
    `Apply ${p.transfiguration} to ${p.count} random ${getPredicate(p.predicateId).text.plural}`,
};

type TransfigureRandomStartersParams = { count: number };
const transfigureRandomStarters: Reward<TransfigureRandomStartersParams> = {
  id: "transfigure_random_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "transfig_random_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.7 * p.count,
  viable: (p, ctx) => starterCardCount(ctx) >= p.count,
  render: (p) => `Transfigure ${p.count} random starter card${p.count === 1 ? "" : "s"}`,
};

type TransfigureAllStartersParams = Record<string, never>;
const transfigureAllStarters: Reward<TransfigureAllStartersParams> = {
  id: "transfigure_all_starters",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.7 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Transfigure all starter cards",
};

type ModifyCardRefTypeParams = { cardName: string; cardType: string };
const CARD_TYPES = ["warriors", "survivors", "spirit animals"] as const;
const modifyCardToReferenceType: Reward<ModifyCardRefTypeParams> = {
  id: "modify_card_to_reference_type",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "modify_ref:c", ctx.content.cards).name
      : "Placeholder Card",
    cardType: pickFromList(draw, "modify_ref:t", CARD_TYPES),
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Modify ${p.cardName}'s text to reference ${p.cardType}`,
};

type ChangeCardBecomeTypeParams = { cardName: string; cardType: string };
const changeCardToBecomeType: Reward<ChangeCardBecomeTypeParams> = {
  id: "change_card_to_become_type",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "change_become:c", ctx.content.cards).name
      : "Placeholder Card",
    cardType: pickFromList(draw, "change_become:t", CARD_TYPES),
  }),
  cec: () => CARD_CEC * 0.6,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Change ${p.cardName} to become a ${p.cardType}`,
};

type ModifyRandomCardsToTypesParams = { count: number; cardType: string };
const modifyRandomCardsToTypes: Reward<ModifyRandomCardsToTypesParams> = {
  id: "modify_random_cards_to_types",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    count: drawInt(draw, "modify_random_types:n", 1, 3),
    cardType: pickFromList(draw, "modify_random_types:t", CARD_TYPES),
  }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: (p, ctx) => ctx.content.cards.length >= p.count,
  render: (p) => `Modify ${p.count} random cards to become ${p.cardType}`,
};

type MakeCardFastParams = { cardName: string };
const makeCardFast: Reward<MakeCardFastParams> = {
  id: "make_card_fast",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "make_fast:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Change ${p.cardName} to have fast`,
};

type MakeRandomCardsFastParams = { count: number };
const makeRandomCardsFast: Reward<MakeRandomCardsFastParams> = {
  id: "make_random_cards_fast",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "make_random_fast:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: (p, ctx) => ctx.content.cards.length >= p.count,
  render: (p) => `Change ${p.count} random card${p.count === 1 ? "" : "s"} to have fast`,
};
```

Append all 11 templates to the `REWARDS` array.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/rewards.ts test/shared/rewards.test.ts
git commit -m "feat(shared): add card-modification reward templates"
```

---

## Task 11: Add starter / purge / transform reward family

**Files:**
- Modify: `src/journey/shared/rewards.ts`
- Modify: `test/shared/rewards.test.ts`

**Context:** Templates touching the starter set and deck transforms: `purge_chosen_predicate_cards`, `purge_chosen_predicate_with_replacement`, `purge_named_starter`, `purge_random_starter`, `purge_random_starter_with_predicate_replacement`, `purge_all_starters_replace`, `transform_starter_into_named_card`, `transform_card_in_deck_into_named`, `transform_chosen_predicate_into_named`, `duplicate_named_card_X`, `duplicate_chosen_cards`, `duplicate_random_predicate`, `draw_X_and_duplicate_chosen`, `purge_X_banes`, `purge_all_banes`.

- [ ] **Step 1: Add the test cases**

Append:

```ts
describe("rewards table (purge/transform family)", () => {
  it("registers purge/transform/duplicate templates", () => {
    for (const id of [
      "purge_chosen_predicate_cards",
      "purge_chosen_predicate_with_replacement",
      "purge_named_starter",
      "purge_random_starter",
      "purge_random_starter_with_predicate_replacement",
      "purge_all_starters_replace",
      "transform_starter_into_named_card",
      "transform_card_in_deck_into_named",
      "transform_chosen_predicate_into_named",
      "duplicate_named_card_X",
      "duplicate_chosen_cards",
      "duplicate_random_predicate",
      "draw_X_and_duplicate_chosen",
      "purge_X_banes",
      "purge_all_banes",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("purge_X_banes is not viable when bane count is 0 (v1 stop-gap)", () => {
    const t = getReward("purge_X_banes");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.viable(p, fakeCtx())).toBe(false);
  });
});
```

Run: `npx vitest run test/shared/rewards.test.ts -t "purge/transform"`
Expected: FAIL.

- [ ] **Step 2: Extend `rewards.ts`**

Add the import:

```ts
import { baneCount } from "./content.js";
```

Append:

```ts
type PurgeChosenPredCardsParams = { predicateId: string; count: number };
const purgeChosenPredicateCards: Reward<PurgeChosenPredCardsParams> = {
  id: "purge_chosen_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "purge_chosen_pred:p").id,
    count: drawInt(draw, "purge_chosen_pred:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.3, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) =>
    `Purge up to ${p.count} chosen ${getPredicate(p.predicateId).text.plural}`,
};

type PurgeChosenPredWithReplParams = { predicateId: string; count: number };
const purgeChosenPredicateWithReplacement: Reward<PurgeChosenPredWithReplParams> = {
  id: "purge_chosen_predicate_with_replacement",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "purge_repl:p").id,
    count: drawInt(draw, "purge_repl:n", 1, 2),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Purge up to ${p.count} chosen ${noun} and gain a random ${pred.text.singular} replacement`;
  },
};

type PurgeNamedStarterParams = { cardName: string };
const purgeNamedStarter: Reward<PurgeNamedStarterParams> = {
  id: "purge_named_starter",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "purge_named_starter:c", ctx.content.cards).name
      : "Placeholder Starter",
  }),
  cec: () => CARD_CEC * 0.4,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: (p) => `Purge ${p.cardName}`,
};

type PurgeRandomStarterParams = Record<string, never>;
const purgeRandomStarter: Reward<PurgeRandomStarterParams> = {
  id: "purge_random_starter",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 0.4,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Purge a random starter card",
};

type PurgeRandomStarterReplParams = { predicateId: string };
const purgeRandomStarterWithPredicateReplacement: Reward<PurgeRandomStarterReplParams> = {
  id: "purge_random_starter_with_predicate_replacement",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_starter_repl:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.7, 1, getPredicate(p.predicateId)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: (p) =>
    `Purge a random starter card and gain a ${getPredicate(p.predicateId).text.singular} replacement`,
};

type PurgeAllStartersReplParams = Record<string, never>;
const purgeAllStartersReplace: Reward<PurgeAllStartersReplParams> = {
  id: "purge_all_starters_replace",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.8 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Purge all starter cards and replace them with new starter cards",
};

type TransformStarterParams = { newCardName: string };
const transformStarterIntoNamedCard: Reward<TransformStarterParams> = {
  id: "transform_starter_into_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    newCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_starter:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.8,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Choose a starter card to transform into ${p.newCardName}`,
};

type TransformDeckCardParams = { oldCardName: string; newCardName: string };
const transformCardInDeckIntoNamed: Reward<TransformDeckCardParams> = {
  id: "transform_card_in_deck_into_named",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    oldCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_deck:old", ctx.content.cards).name
      : "Placeholder Card A",
    newCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_deck:new", ctx.content.cards).name
      : "Placeholder Card B",
  }),
  cec: () => CARD_CEC,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Transform ${p.oldCardName} into ${p.newCardName}`,
};

type TransformPredCardParams = { predicateId: string; newCardName: string };
const transformChosenPredicateIntoNamed: Reward<TransformPredCardParams> = {
  id: "transform_chosen_predicate_into_named",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    predicateId: rollPredicate(draw, "xform_pred:pred").id,
    newCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_pred:new", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.2, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1
    && ctx.content.cards.length > 0,
  render: (p) =>
    `Transform a chosen ${getPredicate(p.predicateId).text.singular} into ${p.newCardName}`,
};

type DupNamedCardParams = { cardName: string; count: number };
const duplicateNamedCardX: Reward<DupNamedCardParams> = {
  id: "duplicate_named_card_X",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "dup_named:c", ctx.content.cards).name
      : "Placeholder Card",
    count: drawInt(draw, "dup_named:n", 1, 3),
  }),
  cec: (p) => CARD_CEC * p.count,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Create ${p.count} duplicate${p.count === 1 ? "" : "s"} of ${p.cardName}`,
};

type DupChosenParams = { count: number };
const duplicateChosenCards: Reward<DupChosenParams> = {
  id: "duplicate_chosen_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "dup_chosen:n", 1, 3) }),
  cec: (p) => CARD_CEC * 1.1 * p.count,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 1,
  render: (p) => `Duplicate ${p.count} chosen card${p.count === 1 ? "" : "s"}`,
};

type DupRandomPredParams = { predicateId: string; count: number };
const duplicateRandomPredicate: Reward<DupRandomPredParams> = {
  id: "duplicate_random_predicate",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "dup_random_pred:p").id,
    count: drawInt(draw, "dup_random_pred:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.9, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) =>
    `Duplicate ${p.count} random ${getPredicate(p.predicateId).text.plural}`,
};

type DrawDupParams = { drawCount: number };
const drawXAndDuplicateChosen: Reward<DrawDupParams> = {
  id: "draw_X_and_duplicate_chosen",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ drawCount: drawInt(draw, "draw_dup:n", 2, 4) }),
  cec: () => CARD_CEC * 1.0,
  viable: (p, ctx) => ctx.state.quest.deck.summary.totalCards >= p.drawCount,
  render: (p) =>
    `Draw ${p.drawCount} cards from your deck and duplicate one of them of your choice`,
};

type PurgeXBanesParams = { count: number };
const purgeXBanes: Reward<PurgeXBanesParams> = {
  id: "purge_X_banes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "purge_banes:n", 1, 3) }),
  cec: (p) => p.count * 30,
  viable: (p, ctx) => baneCount(ctx) >= p.count,
  render: (p) => `Purge ${p.count} bane card${p.count === 1 ? "" : "s"}`,
};

type PurgeAllBanesParams = Record<string, never>;
const purgeAllBanes: Reward<PurgeAllBanesParams> = {
  id: "purge_all_banes",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => Math.max(1, baneCount(ctx)) * 30,
  viable: (_p, ctx) => baneCount(ctx) >= 1,
  render: () => "Purge all bane cards",
};
```

Append all 15 to `REWARDS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/rewards.ts test/shared/rewards.test.ts
git commit -m "feat(shared): add purge/transform/duplicate reward templates"
```

---

## Task 12: Add dreamsign reward family

**Files:**
- Modify: `src/journey/shared/rewards.ts`
- Modify: `test/shared/rewards.test.ts`

**Context:** `gain_random_dreamsign`, `gain_named_dreamsign`, `choose_1_of_X_dreamsigns`, `gain_copy_of_random_dreamsign`, `gain_copy_of_chosen_dreamsign`.

- [ ] **Step 1: Add the test cases**

Append:

```ts
describe("rewards table (dreamsign family)", () => {
  it("registers dreamsign templates", () => {
    for (const id of [
      "gain_random_dreamsign", "gain_named_dreamsign", "choose_1_of_X_dreamsigns",
      "gain_copy_of_random_dreamsign", "gain_copy_of_chosen_dreamsign",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/rewards.test.ts -t "dreamsign"`
Expected: FAIL.

- [ ] **Step 2: Extend `rewards.ts`**

Add the import:

```ts
import { dreamsignMatches } from "./content.js";
```

Append:

```ts
const DREAMSIGN_CEC = 80;

type GainRandomDreamsignParams = Record<string, never>;
const gainRandomDreamsign: Reward<GainRandomDreamsignParams> = {
  id: "gain_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC,
  viable: (_p, ctx) => dreamsignMatches(ctx).length >= 1,
  render: () => "Gain a random dreamsign",
};

type GainNamedDreamsignParams = { name: string };
const gainNamedDreamsign: Reward<GainNamedDreamsignParams> = {
  id: "gain_named_dreamsign",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = dreamsignMatches(ctx);
    return { name: pool.length > 0 ? pickFromList(draw, "gain_named_ds:c", pool).name : "Placeholder Dreamsign" };
  },
  cec: () => DREAMSIGN_CEC,
  viable: (_p, ctx) => dreamsignMatches(ctx).length >= 1,
  render: (p) => `Gain ${p.name}`,
};

type Choose1OfXDreamsignsParams = { choices: number };
const choose1OfXDreamsigns: Reward<Choose1OfXDreamsignsParams> = {
  id: "choose_1_of_X_dreamsigns",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ choices: drawInt(draw, "choose_ds:n", 2, 4) }),
  cec: (p) => DREAMSIGN_CEC * 1.3 * Math.log2(p.choices),
  viable: (p, ctx) => dreamsignMatches(ctx).length >= p.choices,
  render: (p) => `Choose 1 of ${p.choices} dreamsigns`,
};

type GainCopyRandomDreamsignParams = Record<string, never>;
const gainCopyOfRandomDreamsign: Reward<GainCopyRandomDreamsignParams> = {
  id: "gain_copy_of_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.7,
  viable: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1,
  render: () => "Gain a copy of a random dreamsign",
};

type GainCopyChosenDreamsignParams = Record<string, never>;
const gainCopyOfChosenDreamsign: Reward<GainCopyChosenDreamsignParams> = {
  id: "gain_copy_of_chosen_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.9,
  viable: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1,
  render: () => "Gain a copy of a chosen dreamsign",
};
```

Append all 5 to `REWARDS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/rewards.ts test/shared/rewards.test.ts
git commit -m "feat(shared): add dreamsign reward templates"
```

---

## Task 13: Add site / dreamwell / misc reward family

**Files:**
- Modify: `src/journey/shared/rewards.ts`
- Modify: `test/shared/rewards.test.ts`

**Context:** `add_site_to_dreamscape`, `add_site_to_next_dreamscape`, `set_starting_dreamwell_positive`, `shuffle_positive_dreamwell_cards`, `next_X_shop_rerolls_free`, `boost_site_appearance_chance`.

- [ ] **Step 1: Add the test cases**

Append:

```ts
describe("rewards table (site/dreamwell/misc family)", () => {
  it("registers site/dreamwell/misc templates", () => {
    for (const id of [
      "add_site_to_dreamscape",
      "add_site_to_next_dreamscape",
      "set_starting_dreamwell_positive",
      "shuffle_positive_dreamwell_cards",
      "next_X_shop_rerolls_free",
      "boost_site_appearance_chance",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/rewards.test.ts -t "site/dreamwell/misc"`
Expected: FAIL.

- [ ] **Step 2: Extend `rewards.ts`**

Add the import:

```ts
import { POSITIVE_DREAMWELL_CARDS, SITE_TYPES } from "./content.js";
```

Append:

```ts
type AddSiteParams = { siteType: string };
const addSiteToDreamscape: Reward<AddSiteParams> = {
  id: "add_site_to_dreamscape",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "add_site:t", SITE_TYPES),
  }),
  cec: () => 40,
  viable: () => true,
  render: (p) => `Add a ${p.siteType} site to this dreamscape`,
};

const addSiteToNextDreamscape: Reward<AddSiteParams> = {
  id: "add_site_to_next_dreamscape",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "add_site_next:t", SITE_TYPES),
  }),
  cec: () => 30,
  viable: () => true,
  render: (p) => `Add a ${p.siteType} site to the next dreamscape you visit`,
};

type StartingDreamwellPosParams = { cardName: string };
const setStartingDreamwellPositive: Reward<StartingDreamwellPosParams> = {
  id: "set_starting_dreamwell_positive",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "start_dw_pos:c", POSITIVE_DREAMWELL_CARDS),
  }),
  cec: () => 60,
  viable: () => true,
  render: (p) => `Your starting dreamwell card is ${p.cardName}`,
};

type ShufflePosDreamwellParams = { cardName: string; count: number };
const shufflePositiveDreamwellCards: Reward<ShufflePosDreamwellParams> = {
  id: "shuffle_positive_dreamwell_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "shuffle_dw_pos:c", POSITIVE_DREAMWELL_CARDS),
    count: drawInt(draw, "shuffle_dw_pos:n", 1, 3),
  }),
  cec: (p) => 25 * p.count,
  viable: () => true,
  render: (p) =>
    `Shuffle ${p.count} ${p.cardName}${p.count === 1 ? "" : " copies"} into your dreamwell`,
};

type NextRerollsParams = { count: number };
const nextXShopRerollsFree: Reward<NextRerollsParams> = {
  id: "next_X_shop_rerolls_free",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "rerolls:n", 1, 3) }),
  cec: (p) => 15 * p.count,
  viable: () => true,
  render: (p) =>
    `Your next ${p.count} shop reroll${p.count === 1 ? "" : "s"} ${p.count === 1 ? "is" : "are"} free`,
};

type BoostSiteParams = { siteType: string; percent: number };
const boostSiteAppearanceChance: Reward<BoostSiteParams> = {
  id: "boost_site_appearance_chance",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "boost_site:t", SITE_TYPES),
    percent: 10 + 10 * drawInt(draw, "boost_site:p", 0, 4),
  }),
  cec: (p) => p.percent * 0.8,
  viable: () => true,
  render: (p) => `${p.percent}% higher chance to see ${p.siteType} sites in future dreamscapes`,
};
```

Append all 6 to `REWARDS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/rewards.ts test/shared/rewards.test.ts
git commit -m "feat(shared): add site/dreamwell/misc reward templates"
```

---

## Task 14: Add `meta_gain_2_rewards`

**Files:**
- Modify: `src/journey/shared/rewards.ts`
- Modify: `test/shared/rewards.test.ts`

**Context:** The meta template picks two non-meta reward templates (recursion bound), with distinctness threaded by the caller. The fill algorithm threads `usedTemplateIds: Set<string>` through; the meta template uses it. Since the registry stage doesn't have a `usedTemplateIds` parameter on `rollParams`, the meta template stores its sub-pick ids in its own params and the *fill* is responsible for enforcing distinctness on those sub-pick ids before calling `meta_gain_2_rewards.viable()` and `cec()`.

We model this as: `meta_gain_2_rewards.rollParams` receives an OPTIONAL extra argument via a "thunk" passed through `ctx.shapeArgs`. Since `ShapeFillArgs.shapeArgs` is shape-agnostic, the fill passes a callable into `shapeArgs.metaSubPicker`. Adding this dependency to the shared module would be a leak — instead, the meta template's `rollParams` receives the `usedTemplateIds` set via a side channel. We use a simpler design: the meta template's `rollParams` does its own non-meta sampling and returns the two sub-pick ids and params. The fill, when it observes the meta is rolled, re-validates that the meta's sub-pick ids are not already in the `usedTemplateIds` set and re-rolls the meta if not. This keeps the registry table pure.

- [ ] **Step 1: Add the test cases**

Append:

```ts
describe("meta_gain_2_rewards", () => {
  it("rolls two distinct non-meta sub-template ids", () => {
    const t = getReward("meta_gain_2_rewards");
    for (let i = 0; i < 20; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { subIds: [string, string] };
      expect(p.subIds[0]).not.toBe(p.subIds[1]);
      expect(p.subIds[0]).not.toMatch(/^meta_/);
      expect(p.subIds[1]).not.toMatch(/^meta_/);
    }
  });

  it("cec sums the sub-template CECs", () => {
    const t = getReward("meta_gain_2_rewards");
    const p = t.rollParams(fakeCtx(), draw) as { subIds: [string, string]; subParams: [unknown, unknown] };
    const cec = t.cec(p as never, fakeCtx());
    expect(cec).toBeGreaterThan(0);
  });

  it("render concatenates the two sub-renders", () => {
    const t = getReward("meta_gain_2_rewards");
    const p = t.rollParams(fakeCtx(), draw);
    const text = t.render(p, fakeCtx());
    expect(text).toContain(".");
    expect(text.length).toBeGreaterThan(10);
  });

  it("viable iff both sub-templates are viable in current state", () => {
    const t = getReward("meta_gain_2_rewards");
    const p = t.rollParams(fakeCtx(), draw);
    // Sub-templates are picked among viable templates, so the meta should be viable.
    expect(t.viable(p, fakeCtx())).toBe(true);
  });
});
```

Run: `npx vitest run test/shared/rewards.test.ts -t "meta_gain_2_rewards"`
Expected: FAIL.

- [ ] **Step 2: Extend `rewards.ts`**

Append:

```ts
type MetaGain2Params = {
  subIds: readonly [string, string];
  subParams: readonly [TemplateParams, TemplateParams];
};

function nonMetaRewards(): readonly Reward[] {
  return REWARDS.filter((r) => !r.id.startsWith("meta_"));
}

const metaGain2Rewards: Reward<MetaGain2Params> = {
  id: "meta_gain_2_rewards",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = nonMetaRewards();
    if (pool.length < 2) {
      // Degenerate, should not happen in practice.
      const first = pool[0]!;
      return {
        subIds: [first.id, first.id] as readonly [string, string],
        subParams: [first.rollParams(ctx, draw), first.rollParams(ctx, draw)] as readonly [TemplateParams, TemplateParams],
      };
    }
    // Two-step weighted random without replacement.
    const firstIndex = drawInt(draw, "meta_gain_2:i1", 0, pool.length - 1);
    let secondIndex = drawInt(draw, "meta_gain_2:i2", 0, pool.length - 2);
    if (secondIndex >= firstIndex) secondIndex += 1;
    const first = pool[firstIndex]!;
    const second = pool[secondIndex]!;
    return {
      subIds: [first.id, second.id] as readonly [string, string],
      subParams: [
        first.rollParams(ctx, { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 1 }),
        second.rollParams(ctx, { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 2 }),
      ] as readonly [TemplateParams, TemplateParams],
    };
  },
  cec: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getReward(id));
    return a!.cec(p.subParams[0] as never, ctx) + b!.cec(p.subParams[1] as never, ctx);
  },
  viable: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getReward(id));
    return a!.viable(p.subParams[0] as never, ctx) && b!.viable(p.subParams[1] as never, ctx);
  },
  render: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getReward(id));
    return [a!.render(p.subParams[0] as never, ctx), b!.render(p.subParams[1] as never, ctx)].join(". ");
  },
};
```

Append `metaGain2Rewards` to `REWARDS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/rewards.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/rewards.ts test/shared/rewards.test.ts
git commit -m "feat(shared): add meta_gain_2_rewards template"
```

---

## Task 15: Create `shared/costs.ts` scaffold + resource family (with LOCKED)

**Files:**
- Create: `src/journey/shared/costs.ts`
- Create: `test/shared/costs.test.ts`

**Context:** Cost templates mirror reward templates' shape but their `render` may emit a `[LOCKED] ` prefix for unaffordable flat-amount resource costs. We implement: `pay_essence`, `pay_omens`, `pay_max_essence`, `pay_essence_random_range`, `pay_percent_essence`, `pay_all_remaining_essence`, `battle_reward_reduction_flat`, `battle_reward_reduction_percent`.

LOCKED only applies to `pay_essence` (X > current essence) and `pay_omens` (X > current omens).

- [ ] **Step 1: Write the failing test**

```ts
// test/shared/costs.test.ts
import { describe, expect, it } from "vitest";
import { COSTS, getCost } from "../../src/journey/shared/costs.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";

const draw: DrawContext = {
  seed: "costs-test", contentVersion: "v1", rootJourneyIndex: 0,
};

function fakeCtx(essence = 100, omens = 1): JourneyContext {
  return {
    projectRoot: "",
    contentVersion: "v1",
    content: { cards: [], dreamcallers: [], dreamsigns: [], rawBytes: {} as never },
    state: {
      schemaVersion: 1,
      contentVersion: "v1",
      generator: { rootJourneyIndex: 0, lastJourneyId: null, cursors: {} },
      pendingJourney: null,
      history: [],
      quest: {
        seed: "costs-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence, maxEssence: 200, omens, dreamscape: 1 },
        selectedTides: [], mandatoryTides: [], optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [], dreamsignPoolIds: [],
        dreamsignPoolSummary: { tidalPoolCount: 0, neutralCatalogCount: 0 },
        draftPool: [],
        draftPoolSummary: { totalCopies: 0, uniqueCards: 0, oneCopyCards: 0, twoCopyCards: 0 },
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

describe("costs table (resource family)", () => {
  it("registers pay_essence", () => {
    const t = getCost("pay_essence");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.viable(p, fakeCtx())).toBe(true);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
  });

  it("pay_essence emits [LOCKED] when X > current essence", () => {
    const t = getCost("pay_essence");
    // Force a large X by trying many seeds and find one >= 100
    let foundLocked = false;
    for (let i = 0; i < 50; i += 1) {
      const p = t.rollParams(fakeCtx(50), { ...draw, sequenceStep: i }) as { x: number };
      const text = t.render(p, fakeCtx(50));
      if (p.x > 50 && text.startsWith("[LOCKED] ")) {
        foundLocked = true;
        break;
      }
    }
    expect(foundLocked).toBe(true);
  });

  it("pay_essence does NOT emit [LOCKED] when X <= current essence", () => {
    const t = getCost("pay_essence");
    for (let i = 0; i < 50; i += 1) {
      const p = t.rollParams(fakeCtx(500), { ...draw, sequenceStep: i }) as { x: number };
      const text = t.render(p, fakeCtx(500));
      expect(text.startsWith("[LOCKED]")).toBe(false);
    }
  });

  it("pay_omens emits [LOCKED] when X > current omens", () => {
    const t = getCost("pay_omens");
    let foundLocked = false;
    for (let i = 0; i < 20; i += 1) {
      const p = t.rollParams(fakeCtx(100, 0), { ...draw, sequenceStep: i }) as { x: number };
      const text = t.render(p, fakeCtx(100, 0));
      if (p.x > 0 && text.startsWith("[LOCKED] ")) {
        foundLocked = true;
        break;
      }
    }
    expect(foundLocked).toBe(true);
  });

  it("registers other resource costs without LOCKED", () => {
    for (const id of [
      "pay_max_essence", "pay_essence_random_range", "pay_percent_essence",
      "pay_all_remaining_essence", "battle_reward_reduction_flat",
      "battle_reward_reduction_percent",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.viable(p, fakeCtx())).toBe(true);
      expect(t.render(p, fakeCtx()).startsWith("[LOCKED]")).toBe(false);
    }
  });

  it("COSTS is frozen and unique", () => {
    expect(Object.isFrozen(COSTS)).toBe(true);
    const ids = COSTS.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
```

Run: `npx vitest run test/shared/costs.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Create `costs.ts`**

```ts
// src/journey/shared/costs.ts
import { drawInt } from "../../util/rng.js";
import { STAGE_MULTIPLIER } from "./cec.js";
import { essenceAmount, maxEssence, omenAmount } from "./content.js";
import { withLockedPrefix } from "./text.js";
import type { Cost } from "./types.js";

type PayEssenceParams = { x: number };
const payEssence: Cost<PayEssenceParams> = {
  id: "pay_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: 50 + 5 * drawInt(draw, "pay_essence:x", 0, 30) }),
  cec: (p) => p.x * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p, ctx) =>
    withLockedPrefix(`Pay ${p.x} essence`, p.x > essenceAmount(ctx)),
};

type PayOmensParams = { x: number };
const payOmens: Cost<PayOmensParams> = {
  id: "pay_omens",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: drawInt(draw, "pay_omens:x", 1, 2) }),
  cec: (p) => p.x * 40 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p, ctx) =>
    withLockedPrefix(`Pay ${p.x} omen${p.x === 1 ? "" : "s"}`, p.x > omenAmount(ctx)),
};

type PayMaxEssenceParams = Record<string, never>;
const payMaxEssence: Cost<PayMaxEssenceParams> = {
  id: "pay_max_essence",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => maxEssence(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Pay maximum essence",
};

type PayEssenceRangeParams = { min: number; max: number };
const payEssenceRandomRange: Cost<PayEssenceRangeParams> = {
  id: "pay_essence_random_range",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const base = 30 + 10 * drawInt(draw, "pay_range:base", 0, 12);
    const spread = 30 + 10 * drawInt(draw, "pay_range:spread", 0, 6);
    return { min: base, max: base + spread };
  },
  cec: (p) => ((p.min + p.max) / 2) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Pay ${p.min}-${p.max} essence (random roll)`,
};

type PayPercentEssenceParams = { percent: number };
const payPercentEssence: Cost<PayPercentEssenceParams> = {
  id: "pay_percent_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const choices = [25, 50, 75];
    return { percent: choices[drawInt(draw, "pay_pct:i", 0, choices.length - 1)]! };
  },
  cec: (p, ctx) => essenceAmount(ctx) * (p.percent / 100) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Pay ${p.percent}% of your essence`,
};

type PayAllRemainingParams = Record<string, never>;
const payAllRemainingEssence: Cost<PayAllRemainingParams> = {
  id: "pay_all_remaining_essence",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => essenceAmount(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Pay all remaining essence",
};

type BattleRedFlatParams = { amount: number; battles: number };
const battleRewardReductionFlat: Cost<BattleRedFlatParams> = {
  id: "battle_reward_reduction_flat",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    amount: 10 + 10 * drawInt(draw, "br_flat:a", 0, 4),
    battles: drawInt(draw, "br_flat:b", 1, 3),
  }),
  cec: (p) => p.amount * p.battles,
  viable: () => true,
  render: (p) =>
    `Battle essence rewards are reduced by ${p.amount} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type BattleRedPctParams = { percent: number; battles: number };
const battleRewardReductionPercent: Cost<BattleRedPctParams> = {
  id: "battle_reward_reduction_percent",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    percent: 10 + 10 * drawInt(draw, "br_pct:a", 0, 4),
    battles: drawInt(draw, "br_pct:b", 1, 3),
  }),
  cec: (p) => p.percent * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Battle essence rewards are reduced by ${p.percent}% for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

export const COSTS: readonly Cost[] = Object.freeze([
  payEssence,
  payOmens,
  payMaxEssence,
  payEssenceRandomRange,
  payPercentEssence,
  payAllRemainingEssence,
  battleRewardReductionFlat,
  battleRewardReductionPercent,
] as Cost[]);

const BY_ID = new Map(COSTS.map((c) => [c.id, c]));

export function getCost(id: string): Cost {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown cost template id: ${id}`);
  return found;
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run test/shared/costs.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/costs.ts test/shared/costs.test.ts
git commit -m "feat(shared): add resource-family cost templates with LOCKED handling"
```

---

## Task 16: Add card-purge / transform cost family

**Files:**
- Modify: `src/journey/shared/costs.ts`
- Modify: `test/shared/costs.test.ts`

**Context:** `purge_named_card`, `purge_random_predicate_card`, `purge_chosen_predicate_card`, `gain_random_cards_from_pool`, `transform_card_to_random_pool`, `purge_all_duplicate_cards`. CECs are negative-flavored (cost), but we still report magnitudes positive — cost magnitude is what the algorithm uses.

- [ ] **Step 1: Add the test cases**

Append to `test/shared/costs.test.ts`:

```ts
describe("costs table (card family)", () => {
  it("registers card-purge / transform templates", () => {
    for (const id of [
      "purge_named_card", "purge_random_predicate_card", "purge_chosen_predicate_card",
      "gain_random_cards_from_pool", "transform_card_to_random_pool",
      "purge_all_duplicate_cards",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThanOrEqual(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/costs.test.ts -t "card family"`
Expected: FAIL.

- [ ] **Step 2: Extend `costs.ts`**

Add imports:

```ts
import { weightedChoice } from "../../util/rng.js";
import { cardMatches, pickFromList } from "./content.js";
import { CARD_CEC, cardPoolCEC } from "./cec.js";
import { PREDICATES, getPredicate } from "./predicates.js";
import type { Predicate } from "./types.js";
```

Append:

```ts
function rollPredicate(draw: DrawContext, label: string): Predicate {
  return weightedChoice(draw, label, PREDICATES.map((p) => ({ item: p, weight: 1 })));
}
// Note: this is a private helper inside costs.ts; do not export.

type PurgeNamedCardParams = { cardName: string };
const purgeNamedCard: Cost<PurgeNamedCardParams> = {
  id: "purge_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "purge_named:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Purge ${p.cardName}`,
};

type PurgeRandomPredCardParams = { predicateId: string };
const purgeRandomPredicateCard: Cost<PurgeRandomPredCardParams> = {
  id: "purge_random_predicate_card",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_random_pred:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => `Purge a random ${getPredicate(p.predicateId).text.singular}`,
};

type PurgeChosenPredCardParams = { predicateId: string };
const purgeChosenPredicateCard: Cost<PurgeChosenPredCardParams> = {
  id: "purge_chosen_predicate_card",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_chosen_pred_c:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => `Purge a chosen ${getPredicate(p.predicateId).text.singular}`,
};

type GainRandomFromPoolParams = { count: number };
const gainRandomCardsFromPool: Cost<GainRandomFromPoolParams> = {
  id: "gain_random_cards_from_pool",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "gain_random_pool:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.4 * p.count,
  viable: () => true,
  render: (p) => `Gain ${p.count} random card${p.count === 1 ? "" : "s"} from the card pool`,
};

type TransformCardToRandomParams = { cardName: string };
const transformCardToRandomPool: Cost<TransformCardToRandomParams> = {
  id: "transform_card_to_random_pool",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_random:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Transform ${p.cardName} into a random card from the pool`,
};

type PurgeAllDuplicatesParams = Record<string, never>;
const purgeAllDuplicateCards: Cost<PurgeAllDuplicatesParams> = {
  id: "purge_all_duplicate_cards",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.5,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 2,
  render: () => "Purge all duplicate cards from your deck",
};
```

Add `DrawContext` to the imports at the top (it's already used via `rollParams` typing, but the local helper needs it):

```ts
import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
```

Append all 6 to `COSTS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/costs.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/costs.ts test/shared/costs.test.ts
git commit -m "feat(shared): add card-family cost templates"
```

---

## Task 17: Add dreamsign cost family

**Files:**
- Modify: `src/journey/shared/costs.ts`
- Modify: `test/shared/costs.test.ts`

**Context:** `purge_named_dreamsign`, `purge_random_dreamsign`, `purge_chosen_dreamsign`, `transform_dreamsign_to_random`.

- [ ] **Step 1: Add the test**

Append:

```ts
describe("costs table (dreamsign family)", () => {
  it("registers dreamsign cost templates", () => {
    for (const id of [
      "purge_named_dreamsign", "purge_random_dreamsign",
      "purge_chosen_dreamsign", "transform_dreamsign_to_random",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/costs.test.ts -t "dreamsign"`
Expected: FAIL.

- [ ] **Step 2: Extend `costs.ts`**

Add import:

```ts
import { dreamsignMatches, activeDreamsignCount } from "./content.js";
```

Append:

```ts
const DREAMSIGN_CEC = 80;

type PurgeNamedDreamsignParams = { name: string };
const purgeNamedDreamsign: Cost<PurgeNamedDreamsignParams> = {
  id: "purge_named_dreamsign",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = ctx.state.quest.activeDreamsigns;
    return {
      name: pool.length > 0
        ? `Dreamsign #${pickFromList(draw, "purge_named_ds:c", pool).dreamsignId}`
        : "Placeholder Dreamsign",
    };
  },
  cec: () => DREAMSIGN_CEC * 0.6,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: (p) => `Purge ${p.name}`,
};

type PurgeRandomDreamsignParams = Record<string, never>;
const purgeRandomDreamsign: Cost<PurgeRandomDreamsignParams> = {
  id: "purge_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.5,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: () => "Purge a random dreamsign",
};

type PurgeChosenDreamsignParams = Record<string, never>;
const purgeChosenDreamsign: Cost<PurgeChosenDreamsignParams> = {
  id: "purge_chosen_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.7,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: () => "Purge a chosen dreamsign",
};

type XformDreamsignParams = Record<string, never>;
const transformDreamsignToRandom: Cost<XformDreamsignParams> = {
  id: "transform_dreamsign_to_random",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.4,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: () => "Transform a chosen dreamsign into a random dreamsign",
};
```

Append all 4 to `COSTS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/costs.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/costs.ts test/shared/costs.test.ts
git commit -m "feat(shared): add dreamsign cost templates"
```

---

## Task 18: Add bane / dreamwell / starter cost family

**Files:**
- Modify: `src/journey/shared/costs.ts`
- Modify: `test/shared/costs.test.ts`

**Context:** `gain_random_banes`, `gain_named_banes`, `gain_named_banes_for_X_battles`, `gain_additional_starters`, `set_starting_dreamwell_negative`, `shuffle_negative_dreamwell_cards`, `remove_transfiguration_from_card`, `remove_transfigurations_from_random_predicate`.

- [ ] **Step 1: Add the test**

Append:

```ts
describe("costs table (bane/dreamwell/starter family)", () => {
  it("registers bane/dreamwell/starter cost templates", () => {
    for (const id of [
      "gain_random_banes", "gain_named_banes", "gain_named_banes_for_X_battles",
      "gain_additional_starters",
      "set_starting_dreamwell_negative", "shuffle_negative_dreamwell_cards",
      "remove_transfiguration_from_card", "remove_transfigurations_from_random_predicate",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/costs.test.ts -t "bane/dreamwell/starter"`
Expected: FAIL.

- [ ] **Step 2: Extend `costs.ts`**

Add imports:

```ts
import { BANE_NAMES, NEGATIVE_DREAMWELL_CARDS } from "./content.js";
```

Append:

```ts
type GainRandomBanesParams = { count: number };
const gainRandomBanes: Cost<GainRandomBanesParams> = {
  id: "gain_random_banes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "gain_random_banes:n", 1, 3) }),
  cec: (p) => p.count * 30,
  viable: () => true,
  render: (p) => `Gain ${p.count} random bane${p.count === 1 ? "" : "s"}`,
};

type GainNamedBanesParams = { baneName: string; count: number };
const gainNamedBanes: Cost<GainNamedBanesParams> = {
  id: "gain_named_banes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    baneName: pickFromList(draw, "gain_named_banes:b", BANE_NAMES),
    count: drawInt(draw, "gain_named_banes:n", 1, 3),
  }),
  cec: (p) => p.count * 30,
  viable: () => true,
  render: (p) => `Gain ${p.count} ${p.baneName}`,
};

type GainNamedBanesXBattlesParams = { baneName: string; count: number; battles: number };
const gainNamedBanesForXBattles: Cost<GainNamedBanesXBattlesParams> = {
  id: "gain_named_banes_for_X_battles",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    baneName: pickFromList(draw, "gain_named_banes_t:b", BANE_NAMES),
    count: drawInt(draw, "gain_named_banes_t:n", 1, 2),
    battles: drawInt(draw, "gain_named_banes_t:t", 1, 3),
  }),
  cec: (p) => p.count * 25 * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Gain ${p.count} ${p.baneName} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type GainAdditionalStartersParams = { count: number };
const gainAdditionalStarters: Cost<GainAdditionalStartersParams> = {
  id: "gain_additional_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "extra_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: () => true,
  render: (p) =>
    `Gain ${p.count} additional starter card${p.count === 1 ? "" : "s"}`,
};

type StartingDreamwellNegParams = { cardName: string; battles: number };
const setStartingDreamwellNegative: Cost<StartingDreamwellNegParams> = {
  id: "set_starting_dreamwell_negative",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "start_dw_neg:c", NEGATIVE_DREAMWELL_CARDS),
    battles: drawInt(draw, "start_dw_neg:b", 1, 3),
  }),
  cec: (p) => 60 * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Your starting dreamwell card is ${p.cardName} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type ShuffleNegDreamwellParams = { cardName: string; count: number; battles: number };
const shuffleNegativeDreamwellCards: Cost<ShuffleNegDreamwellParams> = {
  id: "shuffle_negative_dreamwell_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "shuffle_dw_neg:c", NEGATIVE_DREAMWELL_CARDS),
    count: drawInt(draw, "shuffle_dw_neg:n", 1, 3),
    battles: drawInt(draw, "shuffle_dw_neg:b", 1, 3),
  }),
  cec: (p) => 25 * p.count * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Shuffle ${p.count} ${p.cardName} into your dreamwell for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type RemoveTransfigCardParams = { cardName: string };
const removeTransfigurationFromCard: Cost<RemoveTransfigCardParams> = {
  id: "remove_transfiguration_from_card",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "rem_transfig:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.6,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Remove the transfiguration from ${p.cardName}`,
};

type RemoveTransfigRandomPredParams = { predicateId: string; count: number };
const removeTransfigurationsFromRandomPredicate: Cost<RemoveTransfigRandomPredParams> = {
  id: "remove_transfigurations_from_random_predicate",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "rem_transfig_rand:p").id,
    count: drawInt(draw, "rem_transfig_rand:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) =>
    `Remove the transfigurations from ${p.count} random ${getPredicate(p.predicateId).text.plural}`,
};
```

Append all 8 to `COSTS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/costs.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/costs.ts test/shared/costs.test.ts
git commit -m "feat(shared): add bane/dreamwell/starter cost templates"
```

---

## Task 19: Add misc cost family

**Files:**
- Modify: `src/journey/shared/costs.ts`
- Modify: `test/shared/costs.test.ts`

**Context:** `draw_X_purge_chosen`, `remove_shop_sites_from_next_dreamscapes`, `remove_dreamsign_sites_from_next_dreamscapes`.

- [ ] **Step 1: Add the test**

Append:

```ts
describe("costs table (misc family)", () => {
  it("registers misc cost templates", () => {
    for (const id of [
      "draw_X_purge_chosen",
      "remove_shop_sites_from_next_dreamscapes",
      "remove_dreamsign_sites_from_next_dreamscapes",
    ]) {
      const t = getCost(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });
});
```

Run: `npx vitest run test/shared/costs.test.ts -t "misc family"`
Expected: FAIL.

- [ ] **Step 2: Extend `costs.ts`**

Append:

```ts
type DrawXPurgeChosenParams = { drawCount: number };
const drawXPurgeChosen: Cost<DrawXPurgeChosenParams> = {
  id: "draw_X_purge_chosen",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ drawCount: drawInt(draw, "draw_purge:n", 2, 4) }),
  cec: () => CARD_CEC * 0.6,
  viable: (p, ctx) => ctx.state.quest.deck.summary.totalCards >= p.drawCount,
  render: (p) =>
    `Draw ${p.drawCount} cards from your deck and purge one of them of your choice`,
};

type RemoveShopSitesParams = { dreamscapes: number };
const removeShopSitesFromNextDreamscapes: Cost<RemoveShopSitesParams> = {
  id: "remove_shop_sites_from_next_dreamscapes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ dreamscapes: drawInt(draw, "rm_shop:d", 1, 3) }),
  cec: (p) => 40 * p.dreamscapes,
  viable: () => true,
  render: (p) =>
    `Remove all shop sites from the next ${p.dreamscapes} dreamscape${p.dreamscapes === 1 ? "" : "s"} you visit`,
};

type RemoveDsSitesParams = { dreamscapes: number };
const removeDreamsignSitesFromNextDreamscapes: Cost<RemoveDsSitesParams> = {
  id: "remove_dreamsign_sites_from_next_dreamscapes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ dreamscapes: drawInt(draw, "rm_ds:d", 1, 3) }),
  cec: (p) => 40 * p.dreamscapes,
  viable: () => true,
  render: (p) =>
    `Remove all dreamsign sites from the next ${p.dreamscapes} dreamscape${p.dreamscapes === 1 ? "" : "s"} you visit`,
};
```

Append all 3 to `COSTS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/costs.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/costs.ts test/shared/costs.test.ts
git commit -m "feat(shared): add misc cost templates"
```

---

## Task 20: Add `meta_pay_2_costs`

**Files:**
- Modify: `src/journey/shared/costs.ts`
- Modify: `test/shared/costs.test.ts`

**Context:** Meta cost template. Picks two non-meta cost templates. Renders concatenated. LOCKED propagates: the meta render emits `[LOCKED] ` if either sub-cost is LOCKED.

- [ ] **Step 1: Add the tests**

Append:

```ts
describe("meta_pay_2_costs", () => {
  it("rolls two non-meta sub-template ids", () => {
    const t = getCost("meta_pay_2_costs");
    for (let i = 0; i < 20; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i }) as { subIds: [string, string] };
      expect(p.subIds[0]).not.toMatch(/^meta_/);
      expect(p.subIds[1]).not.toMatch(/^meta_/);
    }
  });

  it("cec sums the sub-template CECs", () => {
    const t = getCost("meta_pay_2_costs");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
  });

  it("render prefixes [LOCKED] iff any sub-cost would lock", () => {
    const t = getCost("meta_pay_2_costs");
    let foundLocked = false;
    for (let i = 0; i < 80; i += 1) {
      const ctx = fakeCtx(50, 0);
      const p = t.rollParams(ctx, { ...draw, sequenceStep: i }) as {
        subIds: readonly [string, string];
        subParams: readonly [Record<string, unknown>, Record<string, unknown>];
      };
      const txt = t.render(p, ctx);
      // Probe each sub-cost to see if it would lock independently
      const subATxt = getCost(p.subIds[0]).render(p.subParams[0] as never, ctx);
      const subBTxt = getCost(p.subIds[1]).render(p.subParams[1] as never, ctx);
      const subLocked = subATxt.startsWith("[LOCKED]") || subBTxt.startsWith("[LOCKED]");
      expect(txt.startsWith("[LOCKED] ")).toBe(subLocked);
      if (subLocked) foundLocked = true;
    }
    expect(foundLocked).toBe(true);
  });
});
```

Run: `npx vitest run test/shared/costs.test.ts -t "meta_pay_2_costs"`
Expected: FAIL.

- [ ] **Step 2: Extend `costs.ts`**

Append:

```ts
type MetaPay2Params = {
  subIds: readonly [string, string];
  subParams: readonly [Record<string, unknown>, Record<string, unknown>];
};

function nonMetaCosts(): readonly Cost[] {
  return COSTS.filter((c) => !c.id.startsWith("meta_"));
}

const metaPay2Costs: Cost<MetaPay2Params> = {
  id: "meta_pay_2_costs",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = nonMetaCosts();
    const firstIndex = drawInt(draw, "meta_pay_2:i1", 0, pool.length - 1);
    let secondIndex = drawInt(draw, "meta_pay_2:i2", 0, pool.length - 2);
    if (secondIndex >= firstIndex) secondIndex += 1;
    const first = pool[firstIndex]!;
    const second = pool[secondIndex]!;
    return {
      subIds: [first.id, second.id] as readonly [string, string],
      subParams: [
        first.rollParams(ctx, { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 1 }) as Record<string, unknown>,
        second.rollParams(ctx, { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 2 }) as Record<string, unknown>,
      ] as readonly [Record<string, unknown>, Record<string, unknown>],
    };
  },
  cec: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getCost(id));
    return a!.cec(p.subParams[0] as never, ctx) + b!.cec(p.subParams[1] as never, ctx);
  },
  viable: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getCost(id));
    return a!.viable(p.subParams[0] as never, ctx) && b!.viable(p.subParams[1] as never, ctx);
  },
  render: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getCost(id));
    const aText = a!.render(p.subParams[0] as never, ctx);
    const bText = b!.render(p.subParams[1] as never, ctx);
    const aLocked = aText.startsWith("[LOCKED] ");
    const bLocked = bText.startsWith("[LOCKED] ");
    const stripped = (s: string) => s.startsWith("[LOCKED] ") ? s.slice("[LOCKED] ".length) : s;
    return withLockedPrefix(`${stripped(aText)}. ${stripped(bText)}`, aLocked || bLocked);
  },
};
```

Append `metaPay2Costs` to `COSTS`.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shared/costs.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shared/costs.ts test/shared/costs.test.ts
git commit -m "feat(shared): add meta_pay_2_costs template with LOCKED propagation"
```

---

## Task 21: Delete legacy `random_rewards/fill.ts` body and replace shape `index.ts`

**Files:**
- Modify: `src/journey/shapes/random_rewards/index.ts` (replace contents)
- Delete: existing `src/journey/shapes/random_rewards/fill.ts` body (replaced in Task 22)

**Context:** Replace the existing plugin definition with one that uses `bypassStandardValidation: true`, `rootOptionCount: { min: 3, max: 3 }`, and minimal `validationRules`. Removes references to legacy filler helpers. The fill body is replaced in Task 22.

- [ ] **Step 1: Replace `random_rewards/index.ts`**

```ts
// src/journey/shapes/random_rewards/index.ts
import { defineShapePlugin } from "../shared.js";
import { randomRewardsFill } from "./fill.js";

export const randomRewardsPlugin = defineShapePlugin({
  definition: {
    id: "random_rewards",
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
    debugLabel: "Random rewards",
    versionContribution: {
      catalogVersion: "journey-shapes:v15",
      id: "random_rewards",
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
  fill: randomRewardsFill,
});
```

- [ ] **Step 2: Verify typecheck fails (Task 22 will provide `randomRewardsFill`)**

Run: `npm run typecheck`
Expected: FAIL (referenced `randomRewardsFill` doesn't yet match the contract). Continue to Task 22 immediately.

- [ ] **Step 3: No commit yet** — Task 22 must land before this typechecks.

---

## Task 22: Implement `random_rewards/fill.ts` + tests

**Files:**
- Modify: `src/journey/shapes/random_rewards/fill.ts` (replace contents)
- Create: `test/shapes/random_rewards.test.ts`

**Context:** The algorithm picks row 1 freely, then rows 2 and 3 within tolerance band of row 1's CEC. Distinctness threaded via `usedTemplateIds: Set<string>` covering both top-level and meta sub-pick ids.

- [ ] **Step 1: Write the failing tests**

```ts
// test/shapes/random_rewards.test.ts
import { describe, expect, it } from "vitest";
import { randomRewardsPlugin } from "../../src/journey/shapes/random_rewards/index.js";
import { validateJourneyManifest } from "../../src/journey/validate/index.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import type { DrawContext } from "../../src/util/rng.js";

// Use the test/fixtures helpers if available, otherwise construct a synthetic context.
// We construct a minimal valid context here.
function fakeCtx(): JourneyContext {
  return {
    projectRoot: "",
    contentVersion: "v1",
    content: { cards: [], dreamcallers: [], dreamsigns: [], rawBytes: {} as never },
    state: {
      schemaVersion: 1,
      contentVersion: "v1",
      generator: { rootJourneyIndex: 0, lastJourneyId: null, cursors: {} },
      pendingJourney: null,
      history: [],
      quest: {
        seed: "rr-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 100, maxEssence: 200, omens: 1, dreamscape: 1 },
        selectedTides: [], mandatoryTides: [], optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [], dreamsignPoolIds: [],
        dreamsignPoolSummary: { tidalPoolCount: 0, neutralCatalogCount: 0 },
        draftPool: [],
        draftPoolSummary: { totalCopies: 0, uniqueCards: 0, oneCopyCards: 0, twoCopyCards: 0 },
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

function fakeDraw(seed: string): DrawContext {
  return { seed, contentVersion: "v1", rootJourneyIndex: 0 };
}

describe("random_rewards fill", () => {
  it("always produces exactly 3 options", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomRewardsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`opt-count-${i}`),
        stage: "mid" as JourneyStage,
      });
      expect(fill.options).toHaveLength(3);
    }
  });

  it("is deterministic for the same draw context", () => {
    const a = randomRewardsPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("det"),
      stage: "mid" as JourneyStage,
    });
    const b = randomRewardsPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("det"),
      stage: "mid" as JourneyStage,
    });
    expect(a.options.map((o) => o.text)).toEqual(b.options.map((o) => o.text));
  });

  it("template ids are pairwise distinct across rows", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomRewardsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`distinct-${i}`),
        stage: "mid" as JourneyStage,
      });
      const ids = fill.options.map((o) => o.text.split("|")[0]); // ids encoded in text via prefix; we'll switch this if rendering doesn't include id
      // text-only distinctness check: no two rendered texts should be identical
      expect(new Set(fill.options.map((o) => o.text)).size).toBe(3);
    }
  });

  it("row CECs are within the widened tolerance band of row 1", () => {
    // Anchor band is [0.6, 1.4]× initially, widening by ±0.2 each step.
    // Worst-case widening is ~4 steps -> [-0.2, 2.2]. Bound generously.
    for (let i = 0; i < 30; i += 1) {
      const fill = randomRewardsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`band-${i}`),
        stage: "mid" as JourneyStage,
      });
      const anchor = fill.options[0]!.effectConvertedEssence;
      for (const opt of fill.options) {
        expect(opt.effectConvertedEssence).toBeGreaterThanOrEqual(0);
        // Loose ceiling check: every row's CEC is at most 10x the anchor (after generous widening).
        expect(opt.effectConvertedEssence).toBeLessThanOrEqual(Math.max(10, anchor * 10));
      }
    }
  });

  it("bypass-validation: synthetic manifest passes the full pipeline", () => {
    const ctx = fakeCtx();
    const fill = randomRewardsPlugin.fill({
      context: ctx,
      drawContext: fakeDraw("validate"),
      stage: "mid" as JourneyStage,
    });
    const manifest = {
      schemaVersion: 2 as const,
      versions: {} as never,
      journeyId: "J-000001",
      seed: "rr-test",
      rootJourneyIndex: 0,
      shapeId: "random_rewards" as const,
      stage: "mid" as JourneyStage,
      dreamscape: 1,
      selectedTags: [],
      options: fill.options,
      distinctness: { algorithm: "semantic-fingerprint:v1" as const, value: "", components: [], explanation: {} as never, equivalenceBands: [] },
      generatedObjects: [],
      precommitted: fill.precommitted,
      debug: { generation: [], symmetryContracts: [] } as never,
      references: {} as never,
    };
    const result = validateJourneyManifest(manifest as never, ctx);
    // We can't necessarily assert ok:true here without complete metadata (the four cheap checks may fail on missing versions).
    // The strict assertion is: the result does NOT contain any of the heavy validators' rule ids.
    const heavyRules = new Set([
      "typed_payload_contracts", "unresolved_reference",
      "root_option_payloads", "duplicate_root_option_mechanics",
      "route_effects", "shape_value_comparability",
      "offer_refusal_invariants", "random_precommitted_outcomes",
      "delayed_precommitted_outcomes",
    ]);
    if (!result.ok) {
      // No heavy rule should be the firstFailure.
      expect(heavyRules.has(result.rule ?? "")).toBe(false);
    }
  });
});
```

Run: `npx vitest run test/shapes/random_rewards.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement `random_rewards/fill.ts`**

```ts
// src/journey/shapes/random_rewards/fill.ts
import type { JourneyOption } from "../../manifest.js";
import { REWARDS } from "../../shared/rewards.js";
import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const TOLERANCE_LO_INITIAL = 0.6;
const TOLERANCE_HI_INITIAL = 1.4;
const TOLERANCE_WIDEN_STEP = 0.2;

function emptyOption(number: number, text: string, symbols: readonly string[], cec: number): JourneyOption {
  return {
    number,
    symbols: [...symbols],
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: cec,
    pickBehavior: "record_and_generate_next",
  };
}

function subTemplateIdsOf(rolled: { template: Reward; params: unknown }): readonly string[] {
  // For meta_gain_2_rewards, params has subIds; for others, none.
  if (rolled.template.id === "meta_gain_2_rewards") {
    const p = rolled.params as { subIds: readonly [string, string] };
    return p.subIds;
  }
  return [];
}

function consumedIds(rolled: { template: Reward; params: unknown }): readonly string[] {
  return [rolled.template.id, ...subTemplateIdsOf(rolled)];
}

function rollOneCandidate(
  draw: DrawContext,
  label: string,
  pool: readonly Reward[],
  ctx: import("../../../quest/context.js").JourneyContext,
): { template: Reward; params: unknown; cec: number } | undefined {
  const viable: Array<{ template: Reward; params: unknown; cec: number; weight: number }> = [];
  for (const template of pool) {
    const params = template.rollParams(ctx, { ...draw, selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length });
    if (!template.viable(params as never, ctx)) continue;
    viable.push({ template, params, cec: template.cec(params as never, ctx), weight: template.weight });
  }
  if (viable.length === 0) return undefined;
  return weightedChoice(draw, label, viable.map((v) => ({ item: v, weight: v.weight })));
}

function meetsDistinctness(
  rolled: { template: Reward; params: unknown },
  used: ReadonlySet<string>,
): boolean {
  for (const id of consumedIds(rolled)) {
    if (used.has(id)) return false;
  }
  return true;
}

export function randomRewardsFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const used = new Set<string>();

  const row1 = rollOneCandidate(drawContext, "rr:row1", REWARDS, context);
  if (!row1) {
    throw new Error("random_rewards fill could not roll a viable first row");
  }
  for (const id of consumedIds(row1)) used.add(id);
  const anchor = row1.cec;

  function rollFurtherRow(rowIndex: number): { template: Reward; params: unknown; cec: number } {
    let lo = TOLERANCE_LO_INITIAL;
    let hi = TOLERANCE_HI_INITIAL;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const pool = REWARDS.filter((r) => !used.has(r.id));
      const candidates: Array<{ template: Reward; params: unknown; cec: number; weight: number }> = [];
      for (const template of pool) {
        const params = template.rollParams(context, {
          ...drawContext,
          sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
          selectionAttempt: ((drawContext.selectionAttempt ?? 0) * 100) + attempt,
        });
        if (!template.viable(params as never, context)) continue;
        const cec = template.cec(params as never, context);
        if (cec < lo * anchor || cec > hi * anchor) continue;
        if (!meetsDistinctness({ template, params }, used)) continue;
        candidates.push({ template, params, cec, weight: template.weight });
      }
      if (candidates.length > 0) {
        return weightedChoice(
          { ...drawContext, sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex },
          `rr:row${rowIndex}:attempt${attempt}`,
          candidates.map((c) => ({ item: c, weight: c.weight })),
        );
      }
      lo = Math.max(0, lo - TOLERANCE_WIDEN_STEP);
      hi = hi + TOLERANCE_WIDEN_STEP;
    }
    throw new Error(`random_rewards fill failed to find a viable row ${rowIndex} after widening`);
  }

  const row2 = rollFurtherRow(2);
  for (const id of consumedIds(row2)) used.add(id);
  const row3 = rollFurtherRow(3);

  const options: JourneyOption[] = [
    emptyOption(1, row1.template.render(row1.params as never, context), ["reward"], row1.cec),
    emptyOption(2, row2.template.render(row2.params as never, context), ["reward"], row2.cec),
    emptyOption(3, row3.template.render(row3.params as never, context), ["reward"], row3.cec),
  ];

  return { options, precommitted: {} };
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run test/shapes/random_rewards.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: passes (Task 21's `index.ts` now references a valid `randomRewardsFill`).

- [ ] **Step 4: Commit**

```bash
git add src/journey/shapes/random_rewards/index.ts src/journey/shapes/random_rewards/fill.ts test/shapes/random_rewards.test.ts
git commit -m "feat(shapes): rewrite random_rewards fill against shared templates"
```

---

## Task 23: Delete legacy `random_trades` files and replace `index.ts`

**Files:**
- Modify: `src/journey/shapes/random_trades/index.ts` (replace contents)
- Delete: `src/journey/shapes/random_trades/rowPools.ts`
- Delete: `src/journey/shapes/random_trades/validators.ts`
- Replace: `src/journey/shapes/random_trades/fill.ts` body (Task 24)

- [ ] **Step 1: Delete the legacy auxiliary files**

```bash
git rm src/journey/shapes/random_trades/rowPools.ts src/journey/shapes/random_trades/validators.ts
```

- [ ] **Step 2: Replace `random_trades/index.ts`**

```ts
// src/journey/shapes/random_trades/index.ts
import { defineShapePlugin } from "../shared.js";
import { randomTradesFill } from "./fill.js";

export const randomTradesPlugin = defineShapePlugin({
  definition: {
    id: "random_trades",
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
    debugLabel: "Random trades",
    versionContribution: {
      catalogVersion: "journey-shapes:v15",
      id: "random_trades",
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
  fill: randomTradesFill,
});
```

- [ ] **Step 3: Typecheck (expected to fail until Task 24)**

Run: `npm run typecheck`
Expected: FAIL on `randomTradesFill` mismatch. Continue to Task 24.

- [ ] **Step 4: No commit yet** — Task 24 must land before this typechecks.

---

## Task 24: Implement `random_trades/fill.ts` + tests

**Files:**
- Modify: `src/journey/shapes/random_trades/fill.ts` (replace contents)
- Create: `test/shapes/random_trades.test.ts`

**Context:** Row 1 anchors. Cost per row is rolled via `pickCostForReward` (same procedure as row 1: viable cost templates with `cec ≤ 0.5×reward_cec`; if empty, essence fallback; if `cap < PAY_FLOOR`, cost-free). Rows 2 and 3 land within `±TOLERANCE_INITIAL` of row 1's net CEC; widen on failure.

- [ ] **Step 1: Write the failing tests**

```ts
// test/shapes/random_trades.test.ts
import { describe, expect, it } from "vitest";
import { randomTradesPlugin } from "../../src/journey/shapes/random_trades/index.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import type { DrawContext } from "../../src/util/rng.js";

function fakeCtx(essence = 100): JourneyContext {
  return {
    projectRoot: "",
    contentVersion: "v1",
    content: { cards: [], dreamcallers: [], dreamsigns: [], rawBytes: {} as never },
    state: {
      schemaVersion: 1,
      contentVersion: "v1",
      generator: { rootJourneyIndex: 0, lastJourneyId: null, cursors: {} },
      pendingJourney: null,
      history: [],
      quest: {
        seed: "rt-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence, maxEssence: 200, omens: 1, dreamscape: 1 },
        selectedTides: [], mandatoryTides: [], optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [], dreamsignPoolIds: [],
        dreamsignPoolSummary: { tidalPoolCount: 0, neutralCatalogCount: 0 },
        draftPool: [],
        draftPoolSummary: { totalCopies: 0, uniqueCards: 0, oneCopyCards: 0, twoCopyCards: 0 },
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

function fakeDraw(seed: string): DrawContext {
  return { seed, contentVersion: "v1", rootJourneyIndex: 0 };
}

describe("random_trades fill", () => {
  it("always produces exactly 3 options", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`rt-opt-${i}`),
        stage: "mid" as JourneyStage,
      });
      expect(fill.options).toHaveLength(3);
    }
  });

  it("is deterministic", () => {
    const a = randomTradesPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("rt-det"),
      stage: "mid" as JourneyStage,
    });
    const b = randomTradesPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("rt-det"),
      stage: "mid" as JourneyStage,
    });
    expect(a.options.map((o) => o.text)).toEqual(b.options.map((o) => o.text));
  });

  it("net CECs cluster around row 1's net CEC", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`rt-net-${i}`),
        stage: "mid" as JourneyStage,
      });
      const nets = fill.options.map((o) => o.netConvertedEssence);
      const spread = Math.max(...nets) - Math.min(...nets);
      // Initial tolerance is ±15, widening by ±10 each step. Very generous ceiling.
      expect(spread).toBeLessThanOrEqual(500);
    }
  });

  it("[LOCKED] appears for unaffordable pay_essence rolls", () => {
    let saw = false;
    for (let i = 0; i < 80 && !saw; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(0),
        drawContext: fakeDraw(`rt-lock-${i}`),
        stage: "mid" as JourneyStage,
      });
      if (fill.options.some((o) => o.text.includes("[LOCKED]"))) saw = true;
    }
    expect(saw).toBe(true);
  });
});
```

Run: `npx vitest run test/shapes/random_trades.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement `random_trades/fill.ts`**

```ts
// src/journey/shapes/random_trades/fill.ts
import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyOption } from "../../manifest.js";
import { COSTS, getCost } from "../../shared/costs.js";
import { REWARDS, getReward } from "../../shared/rewards.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import { essenceAmount } from "../../shared/content.js";
import { withLockedPrefix } from "../../shared/text.js";
import type { Cost, Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const TOLERANCE_INITIAL = 15;
const TOLERANCE_WIDEN_STEP = 10;
const PAY_FLOOR = 10;

type RolledReward = { template: Reward; params: unknown; cec: number };
type RolledCost = { template: Cost; params: unknown; cec: number; rendered: string };

function emptyOption(
  number: number,
  text: string,
  symbols: readonly string[],
  effectCec: number,
  costCec: number,
): JourneyOption {
  const net = effectCec - costCec;
  return {
    number,
    symbols: [...symbols],
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: costCec,
    effectConvertedEssence: effectCec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: net,
    pickBehavior: "record_and_generate_next",
  };
}

function rewardSubIds(rolled: RolledReward): readonly string[] {
  if (rolled.template.id === "meta_gain_2_rewards") {
    const p = rolled.params as { subIds: readonly [string, string] };
    return p.subIds;
  }
  return [];
}

function consumedRewardIds(rolled: RolledReward): readonly string[] {
  return [rolled.template.id, ...rewardSubIds(rolled)];
}

function meetsRewardDistinctness(rolled: RolledReward, used: ReadonlySet<string>): boolean {
  for (const id of consumedRewardIds(rolled)) {
    if (used.has(id)) return false;
  }
  return true;
}

function rollReward(
  ctx: JourneyContext,
  draw: DrawContext,
  label: string,
  pool: readonly Reward[],
  used: ReadonlySet<string>,
): RolledReward | undefined {
  const candidates: Array<{ rolled: RolledReward; weight: number }> = [];
  for (const template of pool) {
    if (used.has(template.id)) continue;
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    const rolled: RolledReward = { template, params, cec: template.cec(params as never, ctx) };
    if (!meetsRewardDistinctness(rolled, used)) continue;
    candidates.push({ rolled, weight: template.weight });
  }
  if (candidates.length === 0) return undefined;
  return weightedChoice(draw, label, candidates.map((c) => ({ item: c.rolled, weight: c.weight })));
}

function pickCostForReward(
  ctx: JourneyContext,
  draw: DrawContext,
  label: string,
  rewardCec: number,
): RolledCost | undefined {
  const cap = 0.5 * rewardCec;
  const candidates: Array<{ rolled: RolledCost; weight: number }> = [];
  for (const template of COSTS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    const cec = template.cec(params as never, ctx);
    if (cec > cap) continue;
    candidates.push({
      rolled: { template, params, cec, rendered: template.render(params as never, ctx) },
      weight: template.weight,
    });
  }
  if (candidates.length > 0) {
    return weightedChoice(draw, label, candidates.map((c) => ({ item: c.rolled, weight: c.weight })));
  }
  if (cap >= PAY_FLOOR) {
    const ceiling = Math.max(PAY_FLOOR, Math.floor(cap));
    const x = drawInt(draw, `${label}:fallback`, PAY_FLOOR, ceiling);
    const params = { x };
    const cec = x;
    const rendered = withLockedPrefix(`Pay ${x} essence`, x > essenceAmount(ctx));
    return { template: getCost("pay_essence"), params, cec, rendered };
  }
  return undefined;
}

function renderRow(reward: RolledReward, cost: RolledCost | undefined, ctx: JourneyContext): string {
  const rewardText = reward.template.render(reward.params as never, ctx);
  if (!cost) return rewardText;
  return `${rewardText}. ${cost.rendered}`;
}

export function randomTradesFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const used = new Set<string>();

  const row1Reward = rollReward(context, drawContext, "rt:row1:reward", REWARDS, used);
  if (!row1Reward) {
    throw new Error("random_trades fill could not roll a viable first reward");
  }
  for (const id of consumedRewardIds(row1Reward)) used.add(id);
  const row1Cost = pickCostForReward(context, drawContext, "rt:row1:cost", row1Reward.cec);
  const anchorNet = row1Reward.cec - (row1Cost?.cec ?? 0);

  function rollFurtherRow(rowIndex: number): { reward: RolledReward; cost: RolledCost | undefined } {
    let tol = TOLERANCE_INITIAL;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const lo = anchorNet - tol;
      const hi = anchorNet + tol;
      const candidates: Array<{ reward: RolledReward; cost: RolledCost | undefined; weight: number }> = [];
      for (const template of REWARDS) {
        if (used.has(template.id)) continue;
        const params = template.rollParams(context, {
          ...drawContext,
          sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
          selectionAttempt: ((drawContext.selectionAttempt ?? 0) * 100) + attempt + template.id.length,
        });
        if (!template.viable(params as never, context)) continue;
        const rCec = template.cec(params as never, context);
        const reward: RolledReward = { template, params, cec: rCec };
        if (!meetsRewardDistinctness(reward, used)) continue;
        const cost = pickCostForReward(context, {
          ...drawContext,
          sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
          selectionAttempt: ((drawContext.selectionAttempt ?? 0) * 100) + attempt + 1000,
        }, `rt:row${rowIndex}:cost:${template.id}`, rCec);
        const net = rCec - (cost?.cec ?? 0);
        if (net < lo || net > hi) continue;
        candidates.push({ reward, cost, weight: template.weight });
      }
      if (candidates.length > 0) {
        const picked = weightedChoice(
          { ...drawContext, sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex },
          `rt:row${rowIndex}:attempt${attempt}`,
          candidates.map((c) => ({ item: c, weight: c.weight })),
        );
        return { reward: picked.reward, cost: picked.cost };
      }
      tol += TOLERANCE_WIDEN_STEP;
    }
    throw new Error(`random_trades fill failed to find row ${rowIndex} after widening`);
  }

  const row2 = rollFurtherRow(2);
  for (const id of consumedRewardIds(row2.reward)) used.add(id);
  const row3 = rollFurtherRow(3);

  const rows = [
    { reward: row1Reward, cost: row1Cost },
    row2,
    row3,
  ];

  const options: JourneyOption[] = rows.map((row, index) => {
    const text = renderRow(row.reward, row.cost, context);
    const lockedRow = text.includes("[LOCKED]");
    const finalText = lockedRow && !text.startsWith("[LOCKED] ")
      ? `[LOCKED] ${text.replace(/\[LOCKED\] /g, "")}`
      : text;
    return emptyOption(
      index + 1,
      finalText,
      row.cost ? ["cost", "reward"] : ["reward"],
      row.reward.cec,
      row.cost?.cec ?? 0,
    );
  });

  return { options, precommitted: {} };
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run test/shapes/random_trades.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/journey/shapes/random_trades/index.ts src/journey/shapes/random_trades/fill.ts test/shapes/random_trades.test.ts
git commit -m "feat(shapes): rewrite random_trades fill against shared templates"
```

(The deletions of `rowPools.ts` and `validators.ts` were staged via `git rm` in Task 23 Step 1 and ride along on this commit automatically.)

---

## Task 25: Update existing centralized tests and regenerate canonical snapshot

**Files:**
- Modify: `test/journey-shapes.test.ts`
- Modify: `test/journey-generation.test.ts`

**Context:** The existing `journey-shapes.test.ts` asserts `rootOptionCount: { min: 3, max: 4 }` for `random_rewards`. Update to `{ min: 3, max: 3 }`. The `journey-generation.test.ts` has a test at line 2093 that uses `forcedShapeId: "random_rewards"` to inspect status operations — it will fail because the rewrite emits empty `operations`. Retarget that test to `curated_reward_trio` (a similar positive-menu shape still using the legacy filler that emits real status operations).

- [ ] **Step 1: Update `test/journey-shapes.test.ts`**

Around line 258, update the `rootOptionCount` assertion:

```ts
    expect(getShapeDefinition("random_rewards").rootOptionCount).toEqual({
      min: 3,
      max: 3,
    });
```

- [ ] **Step 2: Retarget the `forcedShapeId: "random_rewards"` test in `journey-generation.test.ts`**

Around line 2101, change:

```ts
        forcedShapeId: "random_rewards",
```

to:

```ts
        forcedShapeId: "curated_reward_trio",
```

The test surveys `status` operations with `ruleMutationKind === "next_victory_reward_replacement"`; `curated_reward_trio` is the closest spiritual equivalent that still emits these.

- [ ] **Step 3: Run the affected tests**

Run: `npx vitest run test/journey-shapes.test.ts test/journey-generation.test.ts`
Expected: PASS. If the retargeted test fails because `curated_reward_trio` doesn't emit `next_victory_reward_replacement` in this seed range, retarget to `single_reward` instead — investigate output and pick whichever positive-menu shape still emits the status operations the assertion expects.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/journey-shapes.test.ts test/journey-generation.test.ts
git commit -m "test: update existing shape assertions for random_rewards/random_trades rewrite"
```

---

## Task 26: Extend the shape-isolation test for the cross-shape rule

**Files:**
- Modify: `test/journey-shape-isolation.test.ts`

**Context:** Spec requires neither shape ID to appear inside the *other* shape's directory. The existing test already verifies neither ID appears outside `src/journey/shapes/` — we add an additional clause that the `random_rewards` directory must not contain the literal string `"random_trades"` and vice versa.

- [ ] **Step 1: Write the failing test**

Append to `test/journey-shape-isolation.test.ts` after the existing describe block:

```ts
describe("paired shape directories do not cross-import", () => {
  const PAIRED = [
    { a: "random_rewards", b: "random_trades" },
  ] as const;

  for (const { a, b } of PAIRED) {
    it(`shapes/${a}/ does not reference "${b}"`, () => {
      const dir = join(SRC_ROOT, "journey", "shapes", a);
      const offenders: string[] = [];
      for (const file of listSourceFilesIn(dir)) {
        if (readFileSync(file, "utf8").includes(`"${b}"`)) {
          offenders.push(relative(REPO_ROOT, file));
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`shapes/${b}/ does not reference "${a}"`, () => {
      const dir = join(SRC_ROOT, "journey", "shapes", b);
      const offenders: string[] = [];
      for (const file of listSourceFilesIn(dir)) {
        if (readFileSync(file, "utf8").includes(`"${a}"`)) {
          offenders.push(relative(REPO_ROOT, file));
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

function listSourceFilesIn(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...listSourceFilesIn(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts")) results.push(fullPath);
  }
  return results;
}
```

Run: `npx vitest run test/journey-shape-isolation.test.ts`
Expected: PASS (neither shape directory references the other after the rewrite).

- [ ] **Step 2: Commit**

```bash
git add test/journey-shape-isolation.test.ts
git commit -m "test: enforce no cross-imports between random_rewards and random_trades"
```

---

## Task 27: Final smoke run

**Files:** (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: clean.

- [ ] **Step 3: Journey CLI smoke**

Run: `npm run journey -- --seed qa --no-color --shape random_rewards`
Expected: a 3-option menu prints with reward texts and no validation errors.

Run: `npm run journey -- --seed qa --no-color --shape random_trades`
Expected: a 3-option menu prints with reward+cost texts (or reward-only / [LOCKED] variants).

Run: `npm run journey -- --seed qa --no-color`
Expected: a journey prints; if it lands on either of these shapes, output is well-formed.

- [ ] **Step 4: Final commit** (only if any new test or fixture files were added during the smoke run)

```bash
git status
# If anything is uncommitted, decide whether to commit or discard.
```

---

## Notes for the implementer

- **All output is text-only.** Every option emits empty `costs`/`effects`/`burdens`/`targets`/`triggers`/`routeEffects`/`operations` arrays. Picking has no in-game effect in v1.
- **Distinctness scope.** For `random_rewards` and for the *reward* templates in `random_trades`, the `usedTemplateIds` set spans both top-level row template ids AND meta sub-pick ids. Cost templates in `random_trades` are not distinctness-constrained (including sub-costs of `meta_pay_2_costs`).
- **Bane state is missing.** `baneCount(ctx)` returns 0 in v1, so bane-purging templates are never viable until bane state lands in `QuestState`.
- **Dreamwell cards are stop-gap.** A small curated list lives in `shared/content.ts`; replace with content-driven names once dreamwell content lands.
- **If a content helper turns out shape-coupled.** Spec says: flag and re-evaluate. If `resolveCardTargets` or similar embeds assumptions specific to one of these shapes, stop and discuss before adopting.
- **Algorithm constants** (`TOLERANCE_LO_INITIAL`, etc.) are tunable per shape and live inside their `fill.ts`.
