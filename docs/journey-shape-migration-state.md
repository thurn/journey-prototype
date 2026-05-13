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
| 3 | `heterogeneous_pair` | 7 | Complete | Complete | Complete | Complete | Complete |
| 4 | `shop_row` | 7.0 | Complete | Complete | Complete | Complete | Complete |
| 5 | `alter_dreamscapes` | 6 | Complete | Complete | Complete | Complete | Complete |
| 6 | `single_wager` | 6 | Complete | Complete | Complete | Complete | Complete |
| 7 | `single_random_outcome` | 6 | Complete | Complete | Complete | Complete | Complete |
| 8 | `now_vs_later` | 5 | Complete | Complete | Complete | Complete | Complete |
| 9 | `choose_your_loss` | 5 | Complete | Complete | Complete | Complete | Complete |
| 10 | `commit_now_future_payoff` | 5 | Complete | Complete | Complete | Complete | Complete |
| 11 | `timed_window_menu` | 5 | Complete | Complete | Complete | Complete | Complete |
| 12 | `random_pool_draws` | 4 | Complete | Complete | In progress | Pending | Current |
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

- `random_pool_draws` is the active shape.
- `take_any_number` completed migration commit `a0b65c4`, audit commit `2c2161c`, and fix commit `c6637f4`.
- `service_menu` completed migration commit `49187f8`, audit commit `5753e50`, and fix commit `f7502ea`.
- `heterogeneous_pair` completed migration commit `ea18545`, audit commit `c2cf5b7`, and fix commit `afb3ac7`.
- `shop_row` completed migration commit `ee5f59a`, audit commit `aa3c0cf`, and fix commit `e912755`.
- `alter_dreamscapes` completed migration commit `4ced08f`, audit commit `f0ba652`, and fix commit `50c3736`.
- `single_wager` completed migration commit `70a274d`, audit commit `d884f8e`, and fix commit `00c3a7a`.
- `single_random_outcome` completed migration commit `8305b41`, audit commit `7e3bb8d`, and fix commit `2135ba3`.
- `now_vs_later` completed migration commit `6003bee`, audit commit `04917a9`, and fix commit `3c0c79e`.
- `choose_your_loss` completed migration commit `21bfec1`, audit commit `ae9c2a8`, and fix commit `793b996`.
- `commit_now_future_payoff` completed migration commit `8a0dcb5`, audit commit `a80eb5d`, and fix commit `eec82ad`.
- `timed_window_menu` completed migration commit `ad24ec5`, audit commit `25a297a`, and fix commit `07f32cb`.
- `random_pool_draws` completed migration commits `f8a7ebd` and `5466d75`, and audit commit `66da12a`.
- The active migration target keeps shape-specific code in `src/journey/shapes/random_pool_draws/`.
- Shared reward data comes from `src/journey/shared/rewards.ts`.
- Shared cost data comes from `src/journey/shared/costs.ts` when the shape needs an explicit cost axis.
