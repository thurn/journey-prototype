# `same_cost_different_rewards` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `same_cost_different_rewards`
- Stages: early, mid, late
- Audit seeds: `audit:same_cost_different_rewards:<stage>:01` through `audit:same_cost_different_rewards:<stage>:10`
- Command template: `npm run journey -- --seed audit:same_cost_different_rewards:<stage>:NN --stage <stage> --shape same_cost_different_rewards --debug --show-deck --no-color`

## Findings

### Option Prefixes Expose Symbol Markers

Severity: high

Seed: `audit:same_cost_different_rewards:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:same_cost_different_rewards:early:01 --stage early --shape same_cost_different_rewards --debug --show-deck --no-color`

Generated options:

1. `$ * Purge 'Conduit of Ashes'. Gain a copy of one of your dreamsigns chosen at random`
2. `$ * Purge 'Conduit of Ashes'. Choose 1 of 2 dreamsigns to gain`
3. `$ * Purge 'Conduit of Ashes'. Apply a random transfiguration to each starter card`

Seed: `audit:same_cost_different_rewards:late:03`
Stage: `late`
Replay:
`npm run journey -- --seed audit:same_cost_different_rewards:late:03 --stage late --shape same_cost_different_rewards --debug --show-deck --no-color`

Generated options:

1. `$ * Lose 1 omen. Draft 1 of 4 Survivors and gain 2 copies of it`
2. `$ * Lose 1 omen. Gain a copy of one of your dreamsigns chosen at random`
3. `$ * Lose 1 omen. Draft 1 of 4 cards with cost 4 or more and apply Prismatic to it`

Issue:

Every sampled option begins with `$ *`, which reads like an internal symbol
sequence instead of a player-facing cost and reward presentation. The shape's
central promise is a shared cost with different rewards, so the visible text
should make the shared cost easy to compare.

Recommendation:

Render each option with one clear cost clause and one reward clause. For
example, use a stable player-facing pattern such as `Purge 'Conduit of Ashes':
Gain ...` or `Cost: Purge 'Conduit of Ashes'. Reward: Gain ...`. Capitalize
Dreamsign consistently in generated reward text.

### Random Dreamsign Copies Compete With Higher-Agency Dreamsign Rewards

Severity: high

Seed: `audit:same_cost_different_rewards:mid:06`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:same_cost_different_rewards:mid:06 --stage mid --shape same_cost_different_rewards --debug --show-deck --no-color`

Generated options:

1. `$ * Lose 25 maximum essence. Gain a copy of one of your dreamsigns chosen at random`
2. `$ * Lose 25 maximum essence. Choose 1 of 4 dreamsigns to gain`
3. `$ * Lose 25 maximum essence. Gain a copy of one of your dreamsigns of your choice`

Issue:

The active Dreamsigns are Amanita, Charm Bracelet, and Twisted Herbs. Option 1
and option 3 use the same active-Dreamsign pool, but option 3 lets the player
choose the copy. With the same cost, the random copy is a dominated offer
unless the random row carries a stronger reward, a lower cost, or a distinct
strategic upside.

Recommendation:

Prevent same-offer pairings where a random active-Dreamsign copy and a chosen
active-Dreamsign copy share the same cost. Treat player agency as part of the
reward axis when selecting rows, and require the lower-agency variant to receive
an explicit compensating benefit.

### Permanent Economy Discounts Are Undervalued

Severity: medium

Seed: `audit:same_cost_different_rewards:late:07`
Stage: `late`
Replay:
`npm run journey -- --seed audit:same_cost_different_rewards:late:07 --stage late --shape same_cost_different_rewards --debug --show-deck --no-color`

Generated options:

1. `$ * Transform 'Dawnblade Wanderer' into a random card from the pool. Add a Transfiguration site to the next dreamscape you visit`
2. `$ * Transform 'Dawnblade Wanderer' into a random card from the pool. Shop essence costs are permanently reduced by 50%`
3. `$ * Transform 'Dawnblade Wanderer' into a random card from the pool. Cards with a 'reclaim' ability cost 1 less for the next 3 battles`

Seed: `audit:same_cost_different_rewards:late:09`
Stage: `late`
Replay:
`npm run journey -- --seed audit:same_cost_different_rewards:late:09 --stage late --shape same_cost_different_rewards --debug --show-deck --no-color`

Generated options:

1. `$ * Battle essence rewards are reduced by 10% for the next 2 battles. Purge up to 2 chosen cards with cost 4 or more`
2. `$ * Battle essence rewards are reduced by 10% for the next 2 battles. Replace a Dream Journey site in this dreamscape with a Transfiguration site`
3. `$ * Battle essence rewards are reduced by 10% for the next 2 battles. Shop essence costs are permanently reduced by 30%`

Issue:

Permanent shop discounts can dominate late-stage route and temporary card-cost
effects because they improve every future purchase. The debug values rate a
50% permanent shop discount below adding a single future Transfiguration site,
and rate a 30% permanent shop discount below a one-site replacement. A player
who expects more shop interactions will usually see the permanent discount as
the durable strategic pick.

Recommendation:

Value permanent shop discounts with stage-aware assumptions about remaining
dreamscapes and likely shop visits. Keep permanent economy rewards in the same
offer only when the other rows have similarly durable impact or when the cost
meaningfully constrains future use of the discount.

### Reward Bands Allow Fake Same-Cost Choices

Severity: medium

Seed: `audit:same_cost_different_rewards:mid:03`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:same_cost_different_rewards:mid:03 --stage mid --shape same_cost_different_rewards --debug --show-deck --no-color`

Generated options:

1. `$ * Gain 2 'Oblivion'. Gain a copy of one of your dreamsigns chosen at random`
2. `$ * Gain 2 'Oblivion'. Gain 90-150 essence (random roll)`
3. `$ * Gain 2 'Oblivion'. Add Reclaim 2 to 3 random cards`

Seed: `audit:same_cost_different_rewards:late:03`
Stage: `late`
Replay:
`npm run journey -- --seed audit:same_cost_different_rewards:late:03 --stage late --shape same_cost_different_rewards --debug --show-deck --no-color`

Generated options:

1. `$ * Lose 1 omen. Draft 1 of 4 Survivors and gain 2 copies of it`
2. `$ * Lose 1 omen. Gain a copy of one of your dreamsigns chosen at random`
3. `$ * Lose 1 omen. Draft 1 of 4 cards with cost 4 or more and apply Prismatic to it`

Issue:

The sampled offers sometimes pair rewards with substantially different debug
values under severe shared costs. In `mid:03`, the random Dreamsign copy is
valued at 200 converted essence while the other rewards are valued at 120. In
`late:03`, the random Dreamsign copy is valued at 200 while the Prismatic draft
is valued at 93.6. Same-cost offers can vary reward texture, but a severe cost
such as gaining two Oblivion or losing an omen makes large value gaps feel like
the choice has a correct answer.

Recommendation:

Constrain same-cost rows to a tighter net-value band when the shared cost is
severe, permanent, or omen-based. Include random and draft uncertainty in the
banding rule so that high-variance rewards are compared by expected practical
impact, not only by nominal converted essence.

## Passing Observations

- All 30 forced-shape replay commands completed successfully.
- Each sampled journey produced exactly three root options.
- Debug output assigned the same converted cost to all three options within
  each offer.
- Named card costs and Dreamsign costs resolved against the shown deck or
  active Dreamsign context in the cited examples.
- The sampled offers covered resource costs, maximum-essence costs, omen costs,
  named-card transforms, Dreamsign transforms, Banes, Dreamwell cards, shops,
  and site routing.

## Verification

`npm run journey -- --seed audit:same_cost_different_rewards:early:01 --stage early --shape same_cost_different_rewards --debug --show-deck --no-color`

The verification command completed successfully, and the replay commands in
this report match the command format used for generation.
