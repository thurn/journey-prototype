// Per-shape weights consumed by `scoreShapes` in src/journey/generate.ts. The
// final selection weight is `contextualScore * scoreWeight + tieJitter`, so
// these values are the *relative* prevalence anchors for the first journey of
// a fresh `--stage early` seed. The values form a linear decay from 10 (top)
// to 1 (bottom) across the 30 shapes in the order below — a 10:1 dynamic
// range. Weights are *not* normalized to sum to 100; the actual observed
// share for shape i is roughly `weight(i) / sum(weights) ≈ weight(i) / 158`.
//
// `random_trades` still incurs ~22% repair drift even after the fill's
// viability filter (`src/journey/shapes/random_trades/fill.ts`), and its
// cascade lands on the next-highest-scored shape (`random_rewards`). This
// table does NOT compensate for that — `random_rewards` observes slightly
// above its linear nominal and `random_trades` slightly below. Run
// `npm run shape-distribution -- --trials N` to re-measure.
//
// Mid/late-stage distributions are emergent: the existing `desiredTags`
// mechanism in generate.ts reshapes scores per stage; this table is the
// early-stage baseline.

const JOURNEY_SHAPE_SCORE_WEIGHTS: Readonly<Record<string, number>> =
  Object.freeze({
    random_rewards: 20,
    random_trades: 15,
    one_operation_many_targets: 8,
    one_target_many_operations: 8,
    same_cost_different_rewards: 8,
    same_reward_different_costs: 8,
    take_any_number: 7,
    heterogeneous_pair: 7,
    shop_row: 7.0,
    alter_dreamscapes: 6,
    single_wager: 6,
    single_random_outcome: 6,
    now_vs_later: 5,
    choose_your_loss: 5,
    commit_now_future_payoff: 5,
    random_pool_draws: 4,
    resolved_random_series: 4,
    push_your_luck: 4,
    prize_ladder: 4,
    single_reward: 3,
    single_offer: 3,
    single_rule_trial: 3,
    risk_or_skip: 2,
    flat_escalating_trade: 2,
    reveal_choice_menu: 2,
    probability_ladder: 2,
    escalating_reward_chain: 1,
    shared_prefix_menu: 1,
    reward_after_trigger: 1,
    paired_return: 1.0,
  });

export function getShapeScoreWeight(id: string): number {
  const weight = JOURNEY_SHAPE_SCORE_WEIGHTS[id];

  if (weight === undefined) {
    throw new Error(`Missing score weight for Journey shape '${id}'`);
  }

  return weight;
}

export function shapeScoreWeightIds(): readonly string[] {
  return Object.keys(JOURNEY_SHAPE_SCORE_WEIGHTS);
}
