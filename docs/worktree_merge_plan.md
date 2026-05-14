# Sequential merge plan for 23 completed shape-migration worktrees

## Background

30 worktrees under `.claude/worktrees/agent-*` were spawned to migrate one
journey shape each per `docs/migrating_journey_shape_to_isolated_plugin.md`.
All 30 subagents were terminated mid-run by a quota limit (none completed
naturally). Inspection of the work product shows:

- **23 worktrees** have a clean migration: typecheck passes, isolation test
  passes after adding the shape ID to `MIGRATED_SHAPE_IDS`, and `grep` finds
  no remaining references in non-exempt central files.
- **7 worktrees** still leak shape IDs into central files
  (`probability_ladder`, `one_operation_many_targets`, `resolved_random_series`,
  `paired_return`, `one_target_many_operations`, `flat_escalating_trade`).
  Those need additional work — likely widening
  `JourneyShapePlugin` or extracting `dreamsignOperationCatalog` /
  `cardOperationCatalog` ownership — and are out of scope for this merge plan.

## What every worktree changes

Universal:
- New directory `src/journey/shapes/<shape>/` (at minimum `index.ts` +
  `fill.ts`, sometimes `tree.ts`, `validators.ts`, helper files).
- `src/journey/shapes/<shape>.ts` deleted (legacy single-file plugin).
- `src/journey/shapes/registry.ts` — one import line changes from
  `"./<shape>.js"` to `"./<shape>/index.js"`. The plugin array is unchanged.
- `src/journey/fillers/shapeFills.ts` — the shape's `case` body is removed.

Per-worktree extras vary; see the conflict matrix below.

## Conflict matrix (the 23 mergeable worktrees)

`shared` is the diff size against master's `src/journey/shapes/shared.ts`.

| Shape | shared.ts | Other central files |
| --- | --- | --- |
| single_offer | 0 | — |
| heterogeneous_pair | 0 | — |
| reward_after_trigger | 0 | — |
| same_reward_different_costs | 2 | — |
| now_vs_later | 8 | — |
| commit_now_future_payoff | 9 | — |
| curated_reward_trio | 42 | — |
| random_allocation | 2 | test only |
| shared_prefix_menu | 8 | test only |
| escalating_reward_chain | 0 | fillers/treeBuilders.ts, test |
| push_your_luck | 4 | fillers/treeBuilders.ts |
| random_pool_draws | 4 | fillers/treeBuilders.ts |
| same_cost_different_rewards | 0 | fillers/shared.ts, test |
| choose_your_loss | 6 | fillers/shared.ts, test |
| alter_dreamscapes | 13 | fillers/shared.ts, types.ts |
| single_reward | 0 | fillers/shared.ts, repair.ts, test/journey-generation.test.ts |
| reveal_choice_menu | 0 | fillers/randomPayloads.ts, test |
| single_random_outcome | 7 | fillers/randomPayloads.ts |
| risk_or_skip | 18 | fillers/randomPayloads.ts, validate/precommitRules.ts |
| single_wager | 13 | validate/precommitRules.ts |
| timed_window_menu | 27 | DELETES fillers/timedWindowPayloads.ts, validate/values.ts |
| take_any_number | 0 | test only |

### Pairwise conflict surfaces

- `src/journey/fillers/shapeFills.ts` — every merge touches it. Each removes
  a different `case "X":` block, so most automatic 3-way merges succeed; manual
  resolution is mechanical when they don't.
- `src/journey/shapes/registry.ts` — every merge changes one import line.
  Conflicts only when adjacent imports change in the same merge.
- `src/journey/shapes/shared.ts` — 16 of 23 worktrees touch it. The pattern
  is *removing references to "this shape"* from generic helpers. **These edits
  frequently overlap on the same lines**. This is the primary real conflict to
  plan around.
- `src/journey/fillers/treeBuilders.ts` — 3 worktrees, each removes a different
  `build*Tree` closure. Low overlap risk.
- `src/journey/fillers/shared.ts` — 5 worktrees. Each removes shape-specific
  branches. Moderate overlap risk.
- `src/journey/fillers/randomPayloads.ts` — 3 worktrees, each removes
  shape-specific helpers. Low overlap risk.
- `src/journey/validate/precommitRules.ts` — 2 worktrees. Possible.
- `test/journey-shape-isolation.test.ts` — 7 worktrees already added their
  shape to `MIGRATED_SHAPE_IDS`; 16 did not. Universal conflict on line 11.

## Phase 0: pre-merge inline edits

Run these once before merging anything. They make every subsequent merge
shorter and reduce the test-file conflict surface to a single location.

### 0.1 Add missing `MIGRATED_SHAPE_IDS` entries

For each of the 16 worktrees that finished the code migration but skipped
the test-registration step, patch line 11 of
`test/journey-shape-isolation.test.ts` to include the shape ID. Script:

```bash
for shape in single_offer heterogeneous_pair alter_dreamscapes push_your_luck \
             now_vs_later timed_window_menu single_wager \
             same_reward_different_costs commit_now_future_payoff \
             random_pool_draws risk_or_skip curated_reward_trio \
             reward_after_trigger single_reward single_random_outcome; do
  for w in .claude/worktrees/agent-*/; do
    [ -d "${w}src/journey/shapes/$shape" ] || continue
    test_file="${w}test/journey-shape-isolation.test.ts"
    grep -q "\"$shape\"" "$test_file" && continue
    sed -i.bak "s|\"shop_row\", \"prize_ladder\"|\"shop_row\", \"prize_ladder\", \"$shape\"|" "$test_file"
    rm -f "$test_file.bak"
    (cd "$w" && ./node_modules/.bin/vitest run test/journey-shape-isolation.test.ts >/dev/null 2>&1) \
      && echo "$shape OK" || echo "$shape FAIL — revert"
  done
done
```

### 0.2 Commit each worktree's working tree to its branch

The worktrees currently hold only uncommitted changes. To merge, each branch
needs a real commit. From each worktree directory:

```bash
git add -A && git commit -m "Migrate <shape> to isolated plugin" --no-verify
```

(Use `--no-verify` only if the pre-commit hook trips on the in-flight migration
state — investigate first.) This can be batched once per worktree:

```bash
for w in .claude/worktrees/agent-*/; do
  shape=$(ls -d "${w}src/journey/shapes/"*/ | grep -v 'prize_ladder\|shop_row' \
            | head -1 | xargs -I{} basename {})
  (cd "$w" && git add -A && git commit -m "Migrate $shape to isolated plugin")
done
```

## Phase 1: merge in dependency-aware tiers

The principle is to **minimize cumulative conflict surface** by grouping
worktrees that share a non-universal file into the same tier and merging the
smallest-diff shape first within each tier. After every merge: rebase the
remaining worktree branches onto the new master before merging the next one
(see "Per-merge procedure" below).

### Tier 1 — zero-overlap warmups (4 merges)

Only universal files. Should auto-merge cleanly except for the
`MIGRATED_SHAPE_IDS` line.

1. `single_offer`
2. `heterogeneous_pair`
3. `reward_after_trigger`
4. `take_any_number`

### Tier 2 — small `shapes/shared.ts` only (5 merges)

Each only touches the universal trio + a small `shared.ts` diff. Order by
diff size so each subsequent rebase has the smallest possible conflict.

5. `same_reward_different_costs` (shared=2)
6. `random_allocation` (shared=2)
7. `now_vs_later` (shared=8)
8. `shared_prefix_menu` (shared=8)
9. `commit_now_future_payoff` (shared=9)

### Tier 3 — `fillers/treeBuilders.ts` cluster (3 merges)

Merge these consecutively so the treeBuilders.ts conflict is fresh in each
rebase.

10. `escalating_reward_chain` (shared=0)
11. `push_your_luck` (shared=4)
12. `random_pool_draws` (shared=4)

### Tier 4 — `fillers/shared.ts` cluster (5 merges)

Highest-risk tier because both `shapes/shared.ts` and `fillers/shared.ts`
collisions are likely. Merge smallest first.

13. `same_cost_different_rewards` (shapes/shared=0, fillers/shared.ts)
14. `single_reward` (shapes/shared=0, fillers/shared.ts, repair.ts, journey-generation test)
15. `choose_your_loss` (shapes/shared=6, fillers/shared.ts)
16. `alter_dreamscapes` (shapes/shared=13, fillers/shared.ts, types.ts)
### Tier 5 — `fillers/randomPayloads.ts` cluster (3 merges)

18. `reveal_choice_menu` (shared=0, randomPayloads only)
19. `single_random_outcome` (shared=7, randomPayloads only)
20. `risk_or_skip` (shared=18, randomPayloads + precommitRules)

### Tier 6 — solo specialized (3 merges)

21. `single_wager` (validate/precommitRules.ts — pairs with risk_or_skip in T5)
22. `curated_reward_trio` (large shapes/shared.ts diff, no other file overlap)
23. `timed_window_menu` (deletes timedWindowPayloads.ts wholesale; touches
    validate/values.ts; shapes/shared=27)

`timed_window_menu` is last because it deletes a whole file. Doing it after
everything else means there's no risk of another worktree's import to
`timedWindowPayloads.ts` going stale mid-sequence (none do today, but the
position is the safest).

## Per-merge procedure

For each shape in the order above:

```bash
# 1. Rebase the worktree branch onto current master to localize conflicts.
git -C .claude/worktrees/agent-XXX fetch origin
git -C .claude/worktrees/agent-XXX rebase master

# Conflict resolution checklist during rebase:
# - shapeFills.ts: keep both removals (union of cases removed)
# - registry.ts: keep both import-path edits
# - shapes/shared.ts: keep both removals (every removal in this set is
#   "delete a reference to a shape that has now migrated"). When two
#   worktrees rewrite the same line (e.g. dropping two predicates from one
#   `||` chain), keep the smaller residue.
# - test/journey-shape-isolation.test.ts: union the MIGRATED_SHAPE_IDS list

# 2. Verify in the worktree before merging.
(cd .claude/worktrees/agent-XXX && \
  ./node_modules/.bin/tsc -p tsconfig.json --noEmit && \
  ./node_modules/.bin/vitest run test/journey-shape-isolation.test.ts && \
  ./node_modules/.bin/vitest run)

# 3. Fast-forward (or no-ff) merge into master.
git merge worktree-agent-XXX --no-ff -m "Migrate <shape> to isolated plugin"

# 4. Run the full suite on master to catch behavior regressions.
npm test
```

If `npm test` regresses on master after a merge, the most likely cause is
that the merged plugin's `fill.ts` produces a different manifest than the
old `case` did — investigate the case body that was removed from
`shapeFills.ts` and reconcile.

## Suggested inline edits to make merging easier

These are optional but cheap and would noticeably reduce conflict resolution
work.

1. **Normalize `shapes/shared.ts` removals.** Before any merging, write a
   single commit on master that converts the imperative `id === "X"` chains
   in `shared.ts` into a metadata-driven lookup (`SHAPE_FAMILY_TAGS[id]`).
   Each migrating worktree's removal becomes "drop one entry from a const
   table" instead of "rewrite a multi-clause boolean expression." This
   eliminates the most likely real conflict in the entire plan, at the cost
   of one focused refactor commit before Tier 1.

3. **Add a `tsx scripts/verify-migration.ts <shape>` helper** that runs the
   typecheck, the isolation test (with the shape patched in), the deletion
   grep, and the npm test in one go. Useful as a per-merge smoke test and as
   the verification step the original subagents never finished.

## After all 23 merges

The 7 remaining worktrees (`probability_ladder`, `paired_return`, etc.)
need real migration work, not just merging — their fillers reference
`dreamsignOperationCatalog` / `cardOperationCatalog` / `manifest.ts` shape
unions that the current plugin contract does not absorb. Plan that work
separately following §6 of `migrating_journey_shape_to_isolated_plugin.md`
(widen the contract, then move the code).

Once those are done and merged, delete the legacy
`src/journey/fillers/shapeFills.ts` and `treeBuilders.ts` and remove their
entries from `FILES_EXEMPT_FROM_ISOLATION` in the isolation test, per the
"Cleanup" section of the migration doc.
