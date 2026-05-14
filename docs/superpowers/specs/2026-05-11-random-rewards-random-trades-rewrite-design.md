# Clean-room rewrite of `random_rewards` and `random_trades`

Date: 2026-05-11

## Motivation

The current implementations of `random_rewards` and `random_trades` are entangled with the broader filler/validator system: shared helpers in `src/journey/fillers/`, shape-coupled pool registries, and validators that re-implement signatures to assert shape-specific invariants. The result is hard to reason about, hard to change, and reflects assumptions ported in from other shapes that don't actually apply here.

This spec describes a clean-room rewrite. Both shapes keep their existing IDs and registry entries, conform to the existing plugin API (with one small addition), and live entirely inside their own directories. No code is shared with the current implementations; assume all current code is wrong and do not emulate it.

The user-facing behavior:

- Both shapes always display exactly 3 journey choices.
- `random_rewards`: weighted-random selection of three rewards with similar converted essence cost (CEC).
- `random_trades`: weighted-random selection of three reward+cost pairings whose net CEC is approximately balanced across rows.
- Both shapes must not fail validation.

## Plugin API change

Add one optional field to `JourneyShapeDefinition`:

```ts
readonly bypassStandardValidation?: boolean;  // default false
```

`freezeShapeDefinition` defaults the field to `false`. `defineShapePlugin` propagates it unchanged.

In `validationRuleOutcomes` (`src/journey/validate/pipeline.ts`), after the four cheap structural checks already at the top — `manifest_schema_version`, `manifest_version_metadata`, `journey_id_format`, `root_option_count_within_bounds` — check `definition.bypassStandardValidation`. If `true`, return the accumulated rule outcomes and skip everything else. The bypass fires *before* `typedPayloadContractResult` so empty `operations`/`costs`/`effects`/`burdens`/`targets`/`triggers`/`routeEffects` arrays don't trip typed-payload contracts.

The four cheap checks remain because they enforce truly universal invariants (schema version match, ID format, option count).

This is intentionally a single coarse flag, not a fine-grained validator-by-validator opt-out. If a third shape eventually wants partial bypass, we widen the API at that point.

## Directory layout

```
src/journey/shared/                       # shared module for the two shapes
  rewards.ts                              # reward template table
  costs.ts                                # cost template table
  predicates.ts                           # predicate definitions + CEC multipliers
  content.ts                              # thin helpers over content primitives
                                          # + curated dreamwell-card lists
  text.ts                                 # placeholder rendering helper
  cec.ts                                  # converted-essence-cost math
  types.ts                                # shared Reward/Cost/Predicate types

src/journey/shapes/random_rewards/
  index.ts                                # plugin definition
  fill.ts                                 # anchor-and-tolerance algorithm

src/journey/shapes/random_trades/
  index.ts                                # plugin definition
  fill.ts                                 # reward-first-then-balance algorithm
```

`src/journey/shared/` is a peer module to `src/journey/shapes/`, not a shape itself — no plugin, no registry entry. Both shape directories import from it. The shared module is allowed to depend on existing shape-agnostic primitives in `src/journey/effects.ts` (e.g. `resolveCardTargets`, `BANE_NAMES`, `ALLOWED_TRANSFIGURATIONS`, `SITE_TYPES`) but never imports from any shape directory.

**Cross-imports between `random_rewards/` and `random_trades/` are forbidden.** Each shape directory depends only on its own files and on `src/journey/shared/`. The shape-isolation test grows a new clause that enforces this: neither shape ID may appear in the other shape's directory.

Deletion test:

- Deleting `src/journey/shared/` breaks both shape directories' imports — that's expected, it's the shared dependency.
- Deleting `src/journey/shapes/random_rewards/` breaks only its registry-entry import in `src/journey/shapes/registry.ts`. `random_trades/` continues to compile.
- Deleting `src/journey/shapes/random_trades/` breaks only its registry-entry import. `random_rewards/` continues to compile.
- Nothing in `src/journey/fillers/`, `src/journey/validate/`, etc. names either shape ID.

## Data model

### Reward / Cost template

```ts
type Reward = {
  id: string;
  weight: number;                            // selection weight; uniform = 1.0 for v1
  rollParams: (ctx, draw) => Params;         // rolls X/Y, predicate, names, etc
  cec: (params, ctx) => number;              // converted essence cost
  viable: (params, ctx) => boolean;          // strict current-state check
  render: (params, ctx) => string;           // the option text snippet
};
type Cost = Reward;                          // same shape; CEC is the cost-side
```

`Params` is per-template. Each template owns its own X/Y ranges and predicate choices; ranges live in the template, not a shared constants table.

We use `type` (not `interface`) to match codebase convention.

### Predicate

```ts
type Predicate = {
  id: string;
  multiplier: number;                        // CEC multiplier vs base
  cardPredicate?: CardTargetPredicate;       // for card-target templates
  text: { singular: string; plural: string };
};
```

Predicates from the user's list: `events`, `characters`, `warriors`, `survivors`, `spirit_animals`, `low_cost`, `high_cost`, `low_spark`, `high_spark`, `materialized`, `judgment`, `fast`, `starter`, `legendary`, `transfigured`. Starting multipliers (tunable in one place later): `characters: 1.0`, `events: 1.0`, `warriors: 1.4`, `survivors: 1.4`, `spirit_animals: 1.4`, `legendary: 1.8`, `transfigured: 1.6`, `materialized: 1.3`, `judgment: 1.3`, `fast: 1.2`, `starter: 1.0`, `low_cost: 1.2`, `high_cost: 1.3`, `low_spark: 1.2`, `high_spark: 1.3`.

### CEC computation (`cec.ts`)

Each template's `cec(params, ctx)` returns the final CEC for that rolled instance. The recommended internal decomposition for card/predicate templates:

```
cec = perItemCEC × count × predicate.multiplier × stage_multiplier
```

For `gain_essence`: `cec = X × stage_multiplier`. For `gain_random_predicate_cards` with predicate `warriors` and count `2`: `cec = CARD_CEC × 2 × 1.4 × stage_multiplier`. `CARD_CEC` is a constant representing one generic card's value (initial value: 40). `stage_multiplier` defaults to 1.0; reserved as a hook for early/mid/late tuning.

The shared `cec.ts` module exports `CARD_CEC`, `stage_multiplier`, and a `cardPoolCEC(perItem, count, predicate, stage)` helper to avoid each card-touching template re-implementing the multiplication. Resource templates compute CEC directly.

### Content access (`content.ts`)

Thin helpers over shape-agnostic content-system primitives in `src/journey/effects.ts`:

- `resolveCardTargets(content, quest, predicate)` for card pools.
- `resolveDreamsignTargets(content, quest, predicate)` for dreamsign pools.
- `BANE_NAMES`, `ALLOWED_TRANSFIGURATIONS`, `SITE_TYPES` constants.

For dreamwell cards (no first-class content found during research): a small curated list of ~6 positive and ~6 negative dreamwell card names lives inside `random_rewards/content.ts`. Documented as a stop-gap; easy to swap when dreamwell-card content lands.

If during implementation any content helper turns out to embed shape-specific assumptions, flag it and re-evaluate before adopting.

### Reward templates (covers all entries from the user's reward list)

- `gain_essence` — X drawn uniformly from {50, 55, 60, …, 195, 200} (multiples of 5 in [50, 200])
- `gain_max_essence`
- `set_essence_to_percent_of_max` — % ∈ {50, 75, 100, 125}
- `gain_essence_random_range` — (min, max) pairs
- `gain_omens` — X ∈ {1, 2, 3}
- `purge_chosen_predicate_cards` — X ∈ {1, 2, 3}
- `purge_chosen_predicate_with_replacement`
- `gain_random_predicate_cards`
- `draft_predicate_cards_from_4`
- `take_any_from_predicate_choices`
- `gain_essence_to_max`
- `apply_chosen_transfiguration_to_chosen_card`
- `apply_named_transfiguration_to_chosen_predicate_cards`
- `apply_named_transfiguration_to_card_name`
- `apply_named_transfiguration_to_random_predicate_cards`
- `transfigure_random_starters`
- `transfigure_all_starters`
- `gain_named_card`
- `gain_random_dreamsign`
- `gain_named_dreamsign`
- `choose_1_of_X_dreamsigns`
- `purge_named_starter`
- `purge_random_starter`
- `purge_random_starter_with_predicate_replacement`
- `add_site_to_dreamscape`
- `add_site_to_next_dreamscape`
- `transform_starter_into_named_card`
- `transform_card_in_deck_into_named`
- `transform_chosen_predicate_into_named`
- `duplicate_named_card_X`
- `duplicate_chosen_cards`
- `duplicate_random_predicate`
- `change_card_to_become_type`
- `modify_random_cards_to_types`
- `purge_X_banes`
- `purge_all_banes`
- `make_card_fast`
- `make_random_cards_fast`
- `draw_X_and_duplicate_chosen`
- `set_starting_dreamwell_positive`
- `shuffle_positive_dreamwell_cards`
- `next_X_shop_rerolls_free`
- `gain_copy_of_random_dreamsign`
- `gain_copy_of_chosen_dreamsign`
- `boost_site_appearance_chance`
- `meta_gain_2_rewards` (meta)

### Cost templates (covers all entries from the user's cost list)

- `pay_essence` — X drawn uniformly from {50, 55, 60, …, 195, 200} (multiples of 5 in [50, 200]); always viable; emits [LOCKED] when X > ctx.essence
- `pay_omens` — X ∈ {1, 2} (always viable; emits [LOCKED] when X > ctx.omens)
- `pay_max_essence`
- `pay_essence_random_range`
- `pay_percent_essence` — % ∈ {25, 50, 75}
- `pay_all_remaining_essence`
- `battle_reward_reduction_flat`
- `battle_reward_reduction_percent`
- `purge_named_card`
- `purge_random_predicate_card`
- `purge_chosen_predicate_card`
- `purge_named_dreamsign`
- `purge_random_dreamsign`
- `purge_chosen_dreamsign`
- `gain_random_cards_from_pool`
- `transform_card_to_random_pool`
- `transform_dreamsign_to_random`
- `gain_random_banes`
- `gain_named_banes`
- `gain_named_banes_for_X_battles`
- `gain_additional_starters`
- `remove_transfiguration_from_card`
- `remove_transfigurations_from_random_predicate`
- `draw_X_purge_chosen`
- `set_starting_dreamwell_negative`
- `shuffle_negative_dreamwell_cards`
- `remove_shop_sites_from_next_dreamscapes`
- `remove_dreamsign_sites_from_next_dreamscapes`
- `purge_all_duplicate_cards`
- `meta_pay_2_costs` (meta)

## Algorithm: `random_rewards`

```
pool = REWARDS                              # full reward template table
used = empty set                            # template ids already chosen

# Row 1
candidates = [r in pool where r.viable(rolled_params, ctx)]
r1, p1 = weighted_random(candidates, weight = r.weight)
mark r1 (and any sub-template ids if r1 is meta) used
anchor_cec = r1.cec(p1, ctx)

# Rows 2 and 3
for i in (2, 3):
  band = [tolerance_lo × anchor_cec, tolerance_hi × anchor_cec]
  while:
    candidates = [(r, p) for r in pool not in used,
                  p = r.rollParams(ctx, draw),
                  r.viable(p, ctx) and r.cec(p, ctx) in band]
    if candidates non-empty: break
    widen band by ±0.2
  pick weighted_random(candidates)
  mark used (and sub-template ids if meta)

return [row1, row2, row3] in roll order
```

**Constants** (in `fill.ts`):

- `TOLERANCE_LO_INITIAL = 0.6`
- `TOLERANCE_HI_INITIAL = 1.4`
- `TOLERANCE_WIDEN_STEP = 0.2`

**Distinctness**: the `used` set holds template ids. Once a row uses `gain_essence`, no other row may use it. Sub-picks inside a meta template (`meta_gain_2_rewards`) also consume template ids and consult `used` — the whole menu's distinctness is one flat set.

**Meta-template recursion bound**: `meta_gain_2_rewards` picks sub-rewards from non-meta templates only. No meta-inside-meta.

**Termination**: band-widening with `±0.2` step always converges because at extreme widening the entire pool re-enters. With ~50 templates and 3 rows, pool exhaustion is impossible in practice.

## Algorithm: `random_trades`

```
used = empty set

# Row 1 — anchor
r1, p1 = weighted_random(REWARDS where viable(rolled), w=weight)
mark r1 (and any sub-template ids if meta) used
r_cec = r1.cec(p1, ctx)
cap = 0.5 × r_cec

# Pick row 1's cost
cost_candidates = [(c, p) for c in COSTS, p = c.rollParams(ctx, draw),
                   c.viable(p, ctx) and c.cec(p, ctx) <= cap]
if cost_candidates non-empty:
  c1, q1 = weighted_random(cost_candidates)
else:
  # Fallback: pay-essence with rolled X in [PAY_FLOOR, floor(cap)]
  # If cap < PAY_FLOOR, the row goes cost-free.
  if cap >= PAY_FLOOR:
    X = draw_uniform(PAY_FLOOR, floor(cap))
    c1 = pay_essence with X (may [LOCKED] if X > ctx.essence)
  else:
    c1 = none (cost-free row)

net1 = r_cec - cost_cec(c1)
anchor_net = net1

# Rows 2 and 3
for i in (2, 3):
  band = [anchor_net - TOLERANCE_INITIAL, anchor_net + TOLERANCE_INITIAL]
  while:
    candidates = []
    for r in REWARDS not in used:
      p = r.rollParams(ctx, draw)
      if not r.viable(p, ctx): continue
      r_cec_i = r.cec(p, ctx)
      cap_i = 0.5 × r_cec_i
      # Pick a cost via the same procedure as row 1:
      #   1. enumerate viable cost templates with cec(p, ctx) <= cap_i
      #   2. if non-empty: weighted-random one
      #   3. else if cap_i >= PAY_FLOOR: roll pay_essence X in [PAY_FLOOR, floor(cap_i)]
      #   4. else: cost-free row
      cost = pickCostForReward(r, p, ctx, draw)
      row_net = r_cec_i - cost_cec(cost)
      if row_net in band: candidates.append((r, p, cost))
    if candidates non-empty: break
    widen band by TOLERANCE_WIDEN_STEP
  pick weighted_random(candidates)
  mark used

return [row1, row2, row3]
```

**Constants** (in `random_trades/fill.ts`):

- `TOLERANCE_INITIAL = 15`            (absolute CEC units)
- `TOLERANCE_WIDEN_STEP = 10`
- `PAY_FLOOR = 10`                   (minimum essence-fallback amount)

**[LOCKED] propagation**: the essence fallback may produce [LOCKED] rows (when `X > ctx.essence`). The CEC math still applies — [LOCKED] is text-only annotation.

**Distinctness**:

- Reward template ids are flat-set-distinct across the menu, including sub-rewards inside `meta_gain_2_rewards` rows. (Same rule as `random_rewards`.)
- Cost template ids have no distinctness constraint. `pay_essence` can appear in all three rows. `meta_pay_2_costs` is itself a cost template and is also unconstrained — it can appear in multiple rows, and its sub-costs do not consume cost-template ids the way meta-reward sub-picks consume reward-template ids.

**No-cost rows**: when `cap < PAY_FLOOR` (very small rewards), the row emerges with no cost. The user's spec allowed this.

## Viability rules

Per-template `viable(params, ctx)` predicate, evaluated *after* params are rolled. Templates that fail viability for their rolled params are dropped from that attempt's candidate pool; the algorithm re-rolls.

Notable viability checks:

| Template | viability |
|---|---|
| `gain_essence`, `gain_omens`, `gain_max_essence`, `set_essence_to_percent_of_max`, `gain_essence_random_range`, `gain_essence_to_max` | always true |
| `pay_essence`, `pay_omens` | always true (LOCKED handles affordability) |
| `pay_max_essence`, `pay_percent_essence`, `pay_all_remaining_essence`, `pay_essence_random_range`, battle reductions | always true |
| any card-pool template (random gain, draft, take-any-N, named gain, transfiguration application, modification, duplication) | `resolveCardTargets(content, quest, p.cardPredicate).length >= p.count_required` |
| starter-touching templates | `quest.deck.summary.starterCards >= 1` (or `>= X` where X is the count) |
| dreamsign templates | `quest.activeDreamsigns.length >= 1` |
| bane-purging templates | bane count satisfies the requested count |
| `gain_random_dreamsign`, `gain_named_dreamsign`, `choose_1_of_X_dreamsigns` | a sufficient eligible dreamsign pool exists |
| `meta_gain_2_rewards` | viable iff ≥2 non-meta reward templates remain viable after distinctness consumption |
| `meta_pay_2_costs` | viable iff ≥2 non-meta cost templates remain viable |

Exact state field paths (e.g. where bane state lives on `JourneyContext.state.quest`) are resolved during implementation rather than guessed here.

## [LOCKED] semantics

Applies only to flat-amount resource cost templates: `pay_essence` and `pay_omens`.

After rolling the amount X:

- If `X > ctx.state.quest.resources.{essence|omens}`: render text prefixed with `[LOCKED] ` (e.g. `[LOCKED] Pay 120 essence.`).
- Otherwise: render normally.

All other resource cost templates (`pay_max`, `pay_percent`, `pay_all_remaining`, `pay_random_range`, battle-window reductions) are never LOCKED. They roll their effective amount at execute time, not display time.

All non-resource costs follow strict viability and never produce [LOCKED]. Unviable means dropped, not locked.

Inside `meta_pay_2_costs`: the row's text is prefixed with `[LOCKED] ` iff *any* sub-cost would be LOCKED (i.e. any `pay_essence` or `pay_omens` sub-cost whose amount exceeds current resources).

[LOCKED] rows still count toward the 3-choice display and still emit CEC numbers via `costConvertedEssence` / `effectConvertedEssence` / `netConvertedEssence`. Interactivity (whether a LOCKED row can actually be picked) is out of v1 scope — v1 picks have no in-game effect anyway.

## Picked-option behavior (v1 scope)

Both shapes emit options whose `costs`, `effects`, `burdens`, `targets`, `triggers`, `routeEffects`, and `operations` arrays are empty. The renderer reads `option.text`, `option.symbols`, and the CEC numbers; downstream pick handling records the choice in history but does not apply any in-game effect.

Resolving rewards/costs into real game effects is explicitly deferred. Future work: each template grows a `applyEffects(ctx, params): EffectMutations` function, and the bypass flag is narrowed when payloads exist to validate.

## Plugin metadata

### `random_rewards/index.ts`

- `id: "random_rewards"`
- `topology: "direct_menu"`
- `rootOptionCount: { min: 3, max: 3 }`
- `bypassStandardValidation: true`
- `validationRules`: exactly `["manifest_schema_version", "manifest_version_metadata", "journey_id_format", "root_option_count_within_bounds"]` — the four cheap structural checks that still execute under bypass.
- `supportedTags`, `payloadCompatibility`, `repairPreferences`: minimal sentinel values that satisfy the type but reflect that no payload-family compatibility is exposed.
- No `validators`, `optionValueValidator`, `treeValidator`, `precommitValidator`.
- `versionContribution` includes `bypassStandardValidation: true` so canonical-shape-definitions captures the new contract.

### `random_trades/index.ts`

Same as above with `id: "random_trades"`.

Score weights table keeps existing entries unchanged.

## Test plan

### New files

**`test/shapes/random_rewards.test.ts`**:

- Determinism: same `(seed, stage, dreamscape)` → identical output, twice.
- Always exactly 3 options.
- Template distinctness across the menu (including sub-templates of meta rows).
- Row CECs within widened tolerance ceiling.
- Viability respected (empty deck / no dreamsigns / 0 banes → unrelated templates only).
- Bypass-validation: a synthetic manifest passes the full pipeline regardless of payload shape (pipeline returns only the four cheap-check pass results).
- Meta recursion bounds.

**`test/shapes/random_trades.test.ts`**:

- All of the above (3 options, distinctness across reward templates, CEC balance band, bypass-validation, meta bounds).
- Net CEC balance: rows 2/3 within widened tolerance of row 1's net CEC.
- Cost ≤ 50% reward CEC rule, or essence fallback used.
- [LOCKED] correctness for `pay_essence` and `pay_omens`; never for other resource costs.
- Costs not distinctness-constrained.
- `meta_pay_2_costs` LOCKED propagation.

### Updates to existing tests

- `test/journey-shapes.test.ts`: `rootOptionCount` assertions update to `{min: 3, max: 3}` for both shapes. Canonical snapshot regenerated.
- `test/journey-shape-isolation.test.ts`: no change required (both IDs already in `MIGRATED_SHAPE_IDS`).
- `test/journey-generation.test.ts`: forced-shape scenarios and any content-coupled assertions for these shape IDs regenerated. A grep pass during implementation surfaces non-trivial cases.

### Test budget

Aim ~300–500 lines total across the two new files. Property-style assertions over many seeds, not per-template render fixtures.

## Out of v1 scope

- Resolving rewards/costs into in-game effects on pick (text-only output for now).
- Selection-weight tuning beyond uniform (all weights = 1.0 in v1).
- Stage-multiplier tuning beyond 1.0.
- Interactive disabling of [LOCKED] rows (display-only signal in v1).
- Dreamwell-card content type as first-class data (curated list in v1).
- Score-weight retuning.
- Predicate multiplier retuning past initial guesses.
