# Journey Shape Migration State

Current queue for the directory-backed Journey Shapes migration.

Each queued shape follows this sequence:

1. Migration subagent targets the shape.
2. Audit subagent runs the journey-shape-audit workflow for the shape.
3. Fix subagent resolves the audit findings.

## Queue

| Order | Shape | Weight | Migration | Audit | Fix | Verification | Status |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 | `take_any_number` | 7 | Complete | Complete | Complete | Complete | Complete |
| 2 | `service_menu` | 7 | Complete | Complete | Complete | Complete | Complete |
| 3 | `heterogeneous_pair` | 7 | Complete | Complete | In progress | Pending | Current |
| 4 | `shop_row` | 7.0 | Pending | Pending | Pending | Pending | Queued |
| 5 | `alter_dreamscapes` | 6 | Pending | Pending | Pending | Pending | Queued |
| 6 | `single_wager` | 6 | Pending | Pending | Pending | Pending | Queued |
| 7 | `single_random_outcome` | 6 | Pending | Pending | Pending | Pending | Queued |
| 8 | `now_vs_later` | 5 | Pending | Pending | Pending | Pending | Queued |
| 9 | `choose_your_loss` | 5 | Pending | Pending | Pending | Pending | Queued |
| 10 | `commit_now_future_payoff` | 5 | Pending | Pending | Pending | Pending | Queued |
| 11 | `timed_window_menu` | 5 | Pending | Pending | Pending | Pending | Queued |
| 12 | `random_pool_draws` | 4 | Pending | Pending | Pending | Pending | Queued |
| 13 | `resolved_random_series` | 4 | Pending | Pending | Pending | Pending | Queued |
| 14 | `push_your_luck` | 4 | Pending | Pending | Pending | Pending | Queued |
| 15 | `prize_ladder` | 4 | Pending | Pending | Pending | Pending | Queued |
| 16 | `single_reward` | 3 | Pending | Pending | Pending | Pending | Queued |
| 17 | `single_offer` | 3 | Pending | Pending | Pending | Pending | Queued |
| 18 | `single_rule_trial` | 3 | Pending | Pending | Pending | Pending | Queued |
| 19 | `risk_or_skip` | 2 | Pending | Pending | Pending | Pending | Queued |
| 20 | `flat_escalating_trade` | 2 | Pending | Pending | Pending | Pending | Queued |
| 21 | `reveal_choice_menu` | 2 | Pending | Pending | Pending | Pending | Queued |
| 22 | `probability_ladder` | 2 | Pending | Pending | Pending | Pending | Queued |
| 23 | `escalating_reward_chain` | 1 | Pending | Pending | Pending | Pending | Queued |
| 24 | `shared_prefix_menu` | 1 | Pending | Pending | Pending | Pending | Queued |
| 25 | `reward_after_trigger` | 1 | Pending | Pending | Pending | Pending | Queued |
| 26 | `paired_return` | 1.0 | Pending | Pending | Pending | Pending | Queued |

## Reference Shapes

These shapes are reference implementations for the migration target:

| Shape | Weight |
| --- | ---: |
| `random_rewards` | 20 |
| `random_trades` | 15 |
| `one_operation_many_targets` | 8 |
| `one_target_many_operations` | 8 |
| `same_cost_different_rewards` | 8 |
| `same_reward_different_costs` | 8 |

## Current Notes

- `heterogeneous_pair` is the active shape.
- `take_any_number` completed migration commit `a0b65c4`, audit commit `2c2161c`, and fix commit `c6637f4`.
- `service_menu` completed migration commit `49187f8`, audit commit `5753e50`, and fix commit `f7502ea`.
- `heterogeneous_pair` completed migration commit `ea18545` and audit commit `c2cf5b7`.
- The active migration target keeps shape-specific code in `src/journey/shapes/heterogeneous_pair/`.
- Shared reward data comes from `src/journey/shared/rewards.ts`.
- Shared cost data comes from `src/journey/shared/costs.ts` when the shape needs an explicit cost axis.
