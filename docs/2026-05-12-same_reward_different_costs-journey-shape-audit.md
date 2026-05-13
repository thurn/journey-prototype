# `same_reward_different_costs` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `same_reward_different_costs`
- Stages: early, mid, late
- Audit seeds: `audit:same_reward_different_costs:<stage>:01` through `audit:same_reward_different_costs:<stage>:10`
- Command template: `npm run journey -- --seed audit:same_reward_different_costs:<stage>:NN --stage <stage> --shape same_reward_different_costs --debug --show-deck --no-color`

## Findings

### Locked Omen Costs Consume Offer Rows

Severity: medium

Seed: `audit:same_reward_different_costs:early:06`
Stage: `early`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:early:06 --stage early --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `[LOCKED] Cost: Lose 2 omens. Reward: Apply Prismatic to all Fast cards`
2. `Cost: Remove the transfigurations from 1 random Starter cards. Reward: Apply Prismatic to all Fast cards`
3. `Cost: Gain 1 random bane. Reward: Apply Prismatic to all Fast cards`

Seed: `audit:same_reward_different_costs:mid:10`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:mid:10 --stage mid --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `Cost: Draw 4 cards from your deck and purge one of them of your choice. Reward: Draft 2 of 4 cards with cost 2 or less. Add a Transfiguration site to this dreamscape`
2. `[LOCKED] Cost: Lose 2 omens. Reward: Draft 2 of 4 cards with cost 2 or less. Add a Transfiguration site to this dreamscape`
3. `Cost: Gain 2 'Silence' for the next 2 battles. Reward: Draft 2 of 4 cards with cost 2 or less. Add a Transfiguration site to this dreamscape`

Seed: `audit:same_reward_different_costs:late:04`
Stage: `late`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:late:04 --stage late --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `Cost: Transform a chosen Dreamsign into a random Dreamsign. Reward: Gain 3 omens`
2. `Cost: Gain 1 random bane. Reward: Gain 3 omens`
3. `[LOCKED] Cost: Lose 2 omens. Reward: Gain 3 omens`

Issue:

Nine of the thirty sampled journeys include a locked `Lose 2 omens` row while
the quest has 1 omen. This shape depends on comparing several ways to pay for
one reward, so a locked row materially reduces the choice. The late example is
especially awkward because the locked row pays 2 omens to gain 3 omens, a
resource-conversion line that would be strategically legible if the quest could
afford it.

Recommendation:

For forced `same_reward_different_costs` offers, reroll unaffordable omen costs
or scale the omen count to the current quest resources. Keep locked rows for
rare preview-style offers where the locked state is itself the point of the
journey.

### Same-Resource Costs Create Dominated Rows

Severity: high

Seed: `audit:same_reward_different_costs:early:10`
Stage: `early`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:early:10 --stage early --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `Cost: Lose 1 omen. Reward: Gain a copy of one of your Dreamsigns of your choice`
2. `Cost: Lose 50% of your essence. Reward: Gain a copy of one of your Dreamsigns of your choice`
3. `Cost: Lose 95 essence. Reward: Gain a copy of one of your Dreamsigns of your choice`

Issue:

The quest has 120 essence. Option 2 costs 60 essence, option 3 costs 95
essence, and both options give the same reward. The fixed-amount essence row is
strictly worse than the percentage essence row for this generated state. The
same offer also has only one active Dreamsign, Golden Acorn, so "of your
choice" resolves to a single possible copy.

Recommendation:

When two rows charge the same resource for the same reward, compare the resolved
costs against the current quest state and keep only non-dominated payments. For
active-Dreamsign copy rewards, require at least two active Dreamsigns for
"of your choice" text or render the exact Dreamsign copy when the pool has one
member.

### Broad Transfiguration Rewards Dwarf Cost Differences

Severity: medium

Seed: `audit:same_reward_different_costs:early:06`
Stage: `early`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:early:06 --stage early --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `[LOCKED] Cost: Lose 2 omens. Reward: Apply Prismatic to all Fast cards`
2. `Cost: Remove the transfigurations from 1 random Starter cards. Reward: Apply Prismatic to all Fast cards`
3. `Cost: Gain 1 random bane. Reward: Apply Prismatic to all Fast cards`

Seed: `audit:same_reward_different_costs:mid:06`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:mid:06 --stage mid --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `Cost: Lose maximum essence. Reward: Apply Scarlet to all Warriors`
2. `Cost: Purge 'Sanctum Approach'. Reward: Apply Scarlet to all Warriors`
3. `Cost: Lose 1 omen. Reward: Apply Scarlet to all Warriors`

Seed: `audit:same_reward_different_costs:late:05`
Stage: `late`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:late:05 --stage late --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `Cost: Gain 3 'Betrayal'. Reward: Apply Prismatic to all cards with cost 4 or more`
2. `Cost: Remove the transfiguration from 'Sandglider'. Reward: Apply Prismatic to all cards with cost 4 or more`
3. `Cost: Lose all remaining essence. Reward: Apply Prismatic to all cards with cost 4 or more`

Issue:

The debug values rate the shared reward at +2102.4 converted essence in the
early sample, +2520 in the mid sample, and +7238.4 in the late sample. Those
values are far above normal resource totals, so the visible decision collapses
toward whichever cost the player can tolerate. In late:05, losing all 400
current essence is still presented beside a very small hidden/card-state cost
because the reward value overwhelms the axis.

Recommendation:

Cap broad all-predicate transfiguration rewards by stage and by matching target
count, or reserve them for high-cost offers where every row carries a similarly
severe cost. For this shape, keep the cost spread meaningful relative to the
reward value so the player is comparing real sacrifices rather than selecting
the least painful row for an enormous fixed prize.

### Cost Grammar Undercuts Player-Facing Quality

Severity: low

Seed: `audit:same_reward_different_costs:early:06`
Stage: `early`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:early:06 --stage early --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `[LOCKED] Cost: Lose 2 omens. Reward: Apply Prismatic to all Fast cards`
2. `Cost: Remove the transfigurations from 1 random Starter cards. Reward: Apply Prismatic to all Fast cards`
3. `Cost: Gain 1 random bane. Reward: Apply Prismatic to all Fast cards`

Seed: `audit:same_reward_different_costs:mid:05`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:same_reward_different_costs:mid:05 --stage mid --shape same_reward_different_costs --debug --show-deck --no-color`

Generated options:

1. `Cost: Lose 1 omen. Reward: Gain 190 essence`
2. `Cost: Remove the transfigurations from 1 random Event cards. Reward: Gain 190 essence`
3. `Cost: Gain 1 'Oblivion'. Reward: Gain 190 essence`

Issue:

The cost renderer uses plural nouns after a count of 1: "1 random Starter
cards" and "1 random Event cards." The rest of the row is understandable, but
the grammar draws attention away from the strategic comparison.

Recommendation:

Render singular card-type predicates when the count is exactly 1. Use "1 random
Starter card" and "1 random Event card" for these cost templates.

## Passing Observations

- All 30 forced-shape replay commands completed successfully.
- Each sampled journey produced exactly three root options.
- Every sampled option used the expected `Cost: ... Reward: ...` shape.
- Each sampled offer kept one shared reward across all three options.
- The sampled rows covered omen payments, essence payments, Bane costs,
  Dreamwell penalties, card purges, card transforms, Dreamsign transforms,
  route restrictions, and transfiguration-removal costs.

## Verification

`npm run journey -- --seed audit:same_reward_different_costs:early:01 --stage early --shape same_reward_different_costs --debug --show-deck --no-color`

The verification command completed successfully, and the replay commands in
this report match the command format used for generation.
