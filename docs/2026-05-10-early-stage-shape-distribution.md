# Early-Stage Journey Shape Distribution

> **Note (2026-05-10):** The per-shape `scoreWeight` values were retuned
> after this measurement. Numbers below reflect catalog `journey-shapes:v14`;
> the current catalog is `v15` with weights driven by
> `src/journey/shapes/scoreWeights.ts`. Re-run the Monte Carlo to refresh.

Empirical distribution of `manifest.shapeId` from 3000 fresh-seed runs of
`npm run journey -- --stage early` (the `--debug` flag only changes
rendering — it does not influence shape selection). Sampling error is
roughly ±0.5pp per row.

## How these numbers were computed

Monte Carlo sampling rather than closed-form analysis:

1. **Entry-point analysis.** `src/commands/journey.ts` calls
   `randomSeed()` (a fresh `random:<uuid>`) on every invocation, so the
   per-invocation distribution is exactly the distribution over seeds.
   `--debug` only changes the human renderer; `--stage early` forces the
   stage branch and resets `dreamscape` to 0 in
   `dreamscapeForStage("early")`. No other side effects on selection.
2. **Why not closed-form?** Shape selection is a `weightedChoice` over
   scores from `scoreShapes` in `src/journey/generate.ts:220-252`. With
   no history (first journey) the repetition penalties are 0 and
   `P(shape) ≈ score / Σscores` is tractable. But that ignores two real
   effects: the `±0.02` tie jitter in
   `deterministicTieJitter` (small) and the `repairOrFallbackJourney`
   path (`src/journey/repair.ts`), which can swap the shape when
   validation fails. The latter is non-trivial and is the most likely
   reason `independent_rows_menu` shows up at 0.73% rather than the ~3%
   its raw score would suggest.
3. **Sampling harness.** A throwaway `tsx` script imported
   `loadContentContext`, `createInitialJourneyState`, `buildContext`,
   and `generateNextJourney` directly. For each trial it built a fresh
   state with `dreamscape = 0` and `rootJourneyIndex = 1`, then called
   `generateNextJourney({ context, forcedStage: "early" })` and tallied
   `manifest.shapeId`. Running in-process avoided the ~0.9s/invocation
   CLI startup cost.
4. **Trial count.** 3000 trials, 0 failures. Standard error for a
   probability `p` is `sqrt(p(1-p)/n)` — at `p=0.05`, `n=3000`, that's
   ≈0.4pp, hence the ±0.5pp guidance above. Rare shapes (`<2%`) carry a
   relatively larger fractional error.
5. **What this distribution does *not* cover.** Only the first root
   journey of a stateless run. Subsequent picks would activate the
   exact-shape and tag repetition penalties; without `--stage`, the
   stage itself is drawn first, conditioning everything below.

| Shape | Count | Probability |
|---|---:|---:|
| one_operation_many_targets | 207 | 6.90% |
| one_target_many_operations | 188 | 6.27% |
| take_any_number | 146 | 4.87% |
| curated_reward_trio | 137 | 4.57% |
| random_rewards | 129 | 4.30% |
| shop_row | 114 | 3.80% |
| heterogeneous_pair | 114 | 3.80% |
| same_cost_different_rewards | 114 | 3.80% |
| commit_now_future_payoff | 112 | 3.73% |
| same_reward_different_costs | 109 | 3.63% |
| reward_after_trigger | 95 | 3.17% |
| single_wager | 78 | 2.60% |
| single_random_outcome | 77 | 2.57% |
| now_vs_later | 73 | 2.43% |
| flat_escalating_trade | 71 | 2.37% |
| alter_dreamscapes | 67 | 2.23% |
| choose_your_loss | 62 | 2.07% |
| random_pool_draws | 58 | 1.93% |
| push_your_luck | 57 | 1.90% |
| single_offer | 52 | 1.73% |
| escalating_reward_chain | 51 | 1.70% |
| random_trades | 22 | 0.73% |

## Notes on the weighting

Selection is a `weightedChoice` over per-shape scores computed in
`src/journey/generate.ts:220-252`. The score for each shape is:

```
contextualScore = 1
  + 0.08 * overlapFraction(shape.supportedTags, desiredTags)
  + 0.06 * broadRunNeedFit(shape, context)
  + 0.04 * targetAvailability(shape, context)
  - 0.10 * exactShapeRepetitionPenalty
  - 0.05 * tagRepetitionPenalty

score = max(0.5, contextualScore * plugin.scoreWeight + tieJitter(±0.02))
```

For the first journey of a fresh stateless run there is no history, so
both repetition penalties are 0.

Early-stage `desiredTags`, given the initial state in
`src/quest/init.ts` (essence=120 < 0.25·maxEssence, no active dreamsigns,
starter cards present), is:

```
{ broad, build, cleanup, dreamsign, immediate, reward, resource }
```

Observations:

- The `--debug` flag only affects rendering; it does not influence
  shape selection, so the table applies to every form of the command.
- Sampling error is roughly ±0.5pp per row at n=3000 (larger in
  fractional terms for rare shapes).
- `plugin.scoreWeight` dominates. The two highest-weighted shapes
  (`one_operation_many_targets`, `one_target_many_operations`, both 1.4)
  lead the table; `curated_reward_trio` and `random_allocation` (both
  1.35) follow.
- Tag bonuses are small (≤0.08), so they only nudge ordering between
  similarly-weighted shapes.
- `independent_rows_menu` underperforms its raw weight (1.0 → expected
  ~3% by score alone, observed 0.73%). It tags neither `reward` nor any
  need-fit signal, and the gap suggests it gets demoted during the
  repair/fallback path in `src/journey/repair.ts`.
- With `--stage early` forced, dreamscape is reset to 0 and the stage
  draw is skipped; without `--stage`, the stage itself is also drawn
  at random and these probabilities only apply conditional on `early`.
