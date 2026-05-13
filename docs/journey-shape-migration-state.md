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
| 12 | `random_pool_draws` | 4 | Complete | Complete | Complete | Complete | Complete |
| 13 | `resolved_random_series` | 4 | Complete | Complete | Complete | Complete | Complete |
| 14 | `push_your_luck` | 4 | Complete | Complete | Complete | Complete | Complete |
| 15 | `prize_ladder` | 4 | Complete | Complete | Complete | Complete | Complete |
| 16 | `single_reward` | 3 | Complete | Complete | Complete | Complete | Complete |
| 17 | `single_offer` | 3 | Complete | Complete | Complete | Complete | Complete |
| 18 | `single_rule_trial` | 3 | Complete | Complete | Complete | Complete | Complete |
| 19 | `risk_or_skip` | 2 | Complete | Complete | Complete | Complete | Complete |
| 20 | `flat_escalating_trade` | 2 | Complete | Complete | Complete | Complete | Complete |
| 21 | `reveal_choice_menu` | 2 | Complete | Complete | Complete | Complete | Complete |
| 22 | `probability_ladder` | 2 | Complete | Complete | Complete | Complete | Complete |
| 23 | `escalating_reward_chain` | 1 | Complete | Complete | Complete | Complete | Complete |
| 24 | `shared_prefix_menu` | 1 | Complete | Complete | Complete | Complete | Complete |
| 25 | `reward_after_trigger` | 1 | Complete | Complete | Complete | Complete | Complete |
| 26 | `paired_return` | 1.0 | Complete | Complete | Complete | Complete | Complete |

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

- The queue phase columns track directory-backed migration, audit, fix, and
  verification passes. The completion audit table tracks shared-system
  dependency cleanup for the target end state.
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
- `random_pool_draws` completed migration commits `f8a7ebd` and `5466d75`, audit commit `66da12a`, and fix commit `68ef48c`.
- `resolved_random_series` completed migration commits `9496e74` and `2b4b002`, audit commit `a42356e`, and fix commit `21d11de`.
- `push_your_luck` completed migration commit `7e64afc`, audit commit `4078956`, and fix commit `514a28b`.
- `prize_ladder` completed migration commit `9cdf1b7`, audit commit `ff3505c`, and fix commit `07b853b`.
- `single_reward` completed migration commit `b088331`, audit commit `455f4da`, and fix commit `6a3caaf`.
- `single_offer` completed migration commit `e50cefb`, audit commit `7a01663`, and fix commit `e84877e`.
- `single_rule_trial` completed migration commit `19cd77d`, audit commit `d39cd6e`, and fix commit `7c022a0`.
- `risk_or_skip` completed migration commit `9ddb42d`, audit commit `7c2dd50`, and fix commit `4ca9d0b`.
- `flat_escalating_trade` completed migration commit `4f193ff`, audit commit `059f334`, and fix commit `1177ba3`.
- `reveal_choice_menu` completed migration commit `b872093`, audit commit `0843b8e`, and fix commit `6ebc12e`.
- `probability_ladder` completed migration commit `69cdfb7`, audit commit `e5090e8`, and fix commit `adaa912`.
- `escalating_reward_chain` completed migration commit `216c863`, audit commit `e7cf2e8`, and fix commit `5f261bd`.
- `shared_prefix_menu` completed migration commit `6c00aa2`, audit commit `b8d1014`, and fix commit `d026c29`.
- `reward_after_trigger` completed migration commit `67b8c1c`, audit commit `90a630f`, and fix commit `d90844d`.
- `paired_return` completed migration commit `5265c18`, audit commit `c84da7f`, fix commit `9bf8ac3`, colocation commit `3966ddf`, and dependency cleanup commit `58ae214`.
- Migrated shape fills live in `src/journey/shapes/<shape>/`.
- Shared reward data comes from `src/journey/shared/rewards.ts`.
- Shared cost data comes from `src/journey/shared/costs.ts` when the shape needs an explicit cost axis.

## Completion Audit Follow-Up

The queue phase columns track the three requested migration passes for each
shape. The final shared-system audit tracks remaining dependency cleanup for
the target end state.

| Shape | Filler dependency cleanup | Shared reward axis |
| --- | --- | --- |
| `alter_dreamscapes` | Complete | Complete |
| `choose_your_loss` | Complete | Cost-axis shape |
| `commit_now_future_payoff` | Complete | Complete |
| `escalating_reward_chain` | Needed | Needed |
| `flat_escalating_trade` | Complete | Complete |
| `heterogeneous_pair` | Complete | Complete |
| `now_vs_later` | Complete | Complete |
| `one_operation_many_targets` | Complete | Shape-local shared reward adapter |
| `one_target_many_operations` | Complete | Shape-local shared reward adapter |
| `paired_return` | Needed | Needed |
| `prize_ladder` | Complete | Complete |
| `probability_ladder` | Needed | Needed |
| `push_your_luck` | Complete | Complete |
| `random_pool_draws` | Complete | Complete |
| `reveal_choice_menu` | Needed | Needed |
| `resolved_random_series` | Complete | Complete |
| `reward_after_trigger` | Needed | Needed |
| `risk_or_skip` | Needed | Needed |
| `shared_prefix_menu` | Needed | Needed |
| `service_menu` | Complete | Complete |
| `shop_row` | Complete | Complete |
| `single_offer` | Complete | Complete |
| `single_random_outcome` | Complete | Complete |
| `single_reward` | Complete | Complete |
| `single_rule_trial` | Complete | Complete |
| `single_wager` | Complete | Complete |
| `take_any_number` | Complete | Complete |
| `timed_window_menu` | Complete | Complete |

Generic typed-contract plumbing still carries shape IDs for structured
manifest kinds such as `probability_ladder`, `paired_return`, and
`flat_escalating_trade`. Debug fixture metadata also carries shape filters for
renderer fixtures.
