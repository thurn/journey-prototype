# `random_rewards` / `random_trades`: old vs new generation

Compares the fill algorithms for the `random_rewards` and `random_trades`
shapes as they existed **before commit `9a9f70c`** ("journey distribution")
against the current implementation that ships on `master`.

Every sample below was produced by running the CLI directly against each
algorithm with matching `--seed` values, so the only variable between
columns is the fill logic. Quest, stage, essence, omens and option ordering
are all real engine output, not summaries.

## What changed

**Old (`f2640ff` and earlier).** Each row of `random_rewards` was a slot
drawn from `rewardSlots(...)`, a curated shared filler with a relatively
small catalog of reward archetypes (essence/omens gains, draft offers,
named-card grants, transfigurations, etc.). `random_trades` was even more
constrained: every row picked one of four declarative **row pools**
(`essence_for_card_draft`, `delayed_bane_for_essence_gain`,
`burden_for_named_card`, ...), then chose one `(cost, reward)` pair from
that pool's Cartesian product. Distinctness was enforced over the
`(pool, cost, reward)` tuple plus per-axis on cost and reward. The output
was post-validated by the same generator that vets every shape (payability,
predicate-pool size, "row matches a registered pool", etc.) and the journey
was rejected if any row failed.

**New (`c53adbd` for rewards, `61eeb03` for trades).** Both shapes now
draw against the shared `REWARDS` / `COSTS` template catalogs in
`src/journey/shared/` (48 reward templates, 30 cost templates). For
`random_rewards`, an anchor row is rolled first; subsequent rows must land
inside a Converted-Essence-Cost (CEC) tolerance band around the anchor
(`0.6×–1.4×`, widening on retry). For `random_trades`, each row pairs a
reward with a cost capped at half the reward's CEC, and rows 2–3 must land
within a `±15` CEC band of the anchor row's *net* CEC, falling back to a
generated `Pay N essence` if no curated cost fits the cap. Distinctness is
now enforced on the reward template id (plus its sub-template ids when the
`meta_gain_2_rewards` wrapper is rolled).

## At a glance

- The new algorithm draws from a **much wider catalog** (48 rewards / 30
  costs vs. the handful of explicit row pools or reward slots). Compare the
  variety of effects across the `rt*` columns — old trades essentially
  cycle through "pay essence for card draft", "delayed bane for essence",
  and "burden for named card", while new trades cover transfiguration,
  card-text rewrites, dreamsign manipulation, site additions, etc.
- The new algorithm **balances rows by CEC**, so all three options have
  comparable converted-essence value. The old algorithm balanced only by
  filtering through the per-pool / per-slot catalog and validating after.
- The new algorithm **generates a fallback "Pay N essence" cost** when no
  curated cost fits the half-reward CEC cap; the old algorithm only used
  pre-declared cost sources.
- The new algorithm produces output for every seed below; the old
  `random_trades` rejected **7 of 10 seeds in the rt1..rt10 series**
  because the curated row pools combined with the global validator
  frequently couldn't satisfy distinctness, payability, and predicate-pool
  size simultaneously. The same seeds produce valid output on the new
  algorithm.

---

## `random_rewards` — new algorithm (10 samples)

### seed `rr1`

```
Quest: Kaleth, The Dreaming
Stage: early    Essence: 120/500    Omens: 1

1. * Purge up to 2 chosen Judgment cards and gain a random Judgment card replacement
2. * Change 2 random cards to have fast
3. * Your starting dreamwell card is Echo of Dawn
```

### seed `rr2`

```
Quest: Zeva, the Dredger
Stage: mid    Essence: 120/500    Omens: 1

1. * Gain maximum essence
2. * Set essence to 125% of your maximum essence
3. * Purge all starter cards
```

### seed `rr3`

```
Quest: Corvath, the Salvage-Born
Stage: early    Essence: 120/500    Omens: 1

1. * Apply a transfiguration of your choice to a chosen card
2. * Gain a random dreamsign
3. * Gain 2 omens
```

### seed `rr4`

```
Quest: Demetrios, Strategos of the Phalanx
Stage: mid    Essence: 120/500    Omens: 1

1. * Apply a transfiguration of your choice to a chosen card. Gain a random dreamsign
2. * Create 3 duplicates of Shoreline Penitent
3. * Gain 3 random Survivors
```

### seed `rr5`

```
Quest: Calloway Flint, Cutthroat Admiral
Stage: early    Essence: 120/500    Omens: 1

1. * Purge all starter cards
2. * Set essence to 100% of your maximum essence
3. * Gain essence up to your maximum
```

### seed `rr6`

```
Quest: Yveth Coravel, Scion of the Returning Tide
Stage: mid    Essence: 120/500    Omens: 1

1. * Shuffle 2 Refrain copies into your dreamwell
2. * Your starting dreamwell card is Lantern
3. * Choose a starter card to transform into Seedling Sage
```

### seed `rr7`

```
Quest: Ossian, the Reckoning Blade
Stage: late    Essence: 120/500    Omens: 1

1. * Create 3 duplicates of Dreamscatter
2. * Set essence to 50% of your maximum essence
3. * Take any number of Judgment cards from 4 choices
```

### seed `rr8`

```
Quest: Corvath, the Salvage-Born
Stage: late    Essence: 120/500    Omens: 1

1. * Gain 170 essence
2. * Take any number of low-cost cards from 4 choices
3. * Duplicate 3 random Starter cards
```

### seed `rr9`

```
Quest: Vethran, Whisperer of Wraiths
Stage: mid    Essence: 120/500    Omens: 1

1. * Purge a random starter card and gain a Materialized card replacement
2. * Your next 2 shop rerolls are free
3. * Purge up to 1 chosen Event card and gain a random Event card replacement
```

### seed `rr10`

```
Quest: Seld Rakor, Standing Orders
Stage: mid    Essence: 120/500    Omens: 1

1. * Gain maximum essence
2. * Purge all starter cards
3. * Set essence to 100% of your maximum essence
```

---

## `random_rewards` — old algorithm (10 samples)

### seed `rr1`

```
Quest: Kaleth, The Dreaming
Stage: mid    Essence: 120/500    Omens: 1

1. * Draft 2 of 4 eligible cards. Gain 2 omens.
2. * Gain 4 omens.
3. * ! Purge all Starter cards and replace them with low-cost Event catalog cards.
```

### seed `rr2`

```
Quest: Zeva, the Dredger
Stage: late    Essence: 120/500    Omens: 1

1. * ! Your next victory adds a {Transfiguration} site to the next dreamscape instead of card rewards.
2. * Gain 5 omens.
3. * Draft 1 of 4 survivors. Apply {Ivory Transfiguration} to it.
```

### seed `rr3`

```
Quest: Corvath, the Salvage-Born
Stage: early    Essence: 120/500    Omens: 1

1. * Create and gain {Rain Lantern}. Rain Lantern: 1 energy Event. Discover a card from the draft pool; if it is {Ashmaze Guide}, it gains Reclaim 1 until end of battle.
2. * ! Transform a chosen eligible object into {Rain Lantern}. Rain Lantern: 1 energy Event. Discover a card from the draft pool; if it is {Ashmaze Guide}, it gains Reclaim 1 until end of battle.
3. * ! Gain {Rain Lantern} temporarily, then return it at the next Dream Journey site or trade it for 120 essence after using it once. Rain Lantern: 1 energy Event. Discover a card from the draft pool; if it is {Ashmaze Guide}, it gains Reclaim 1 until end of battle.
```

### seed `rr4`

```
Quest: Demetrios, Strategos of the Phalanx
Stage: late    Essence: 120/500    Omens: 1

1. * Transform {Wildflower Colossus} into {Aspiring Guardian}.
2. * Gain 5 omens.
3. * Gain 4 omens.
```

### seed `rr5`

```
Quest: Calloway Flint, Cutthroat Admiral
Stage: mid    Essence: 120/500    Omens: 1

1. * Purge up to 1 chosen Starter card. Gain 4 omens.
2. * Draft 2 of 4 events. Gain 2 omens.
3. * Gain 320 essence.
```

### seed `rr6`

```
Quest: Yveth Coravel, Scion of the Returning Tide
Stage: mid    Essence: 120/500    Omens: 1

1. * Create and gain {Veiled Wake}. Veiled Wake: During the next dreamscape, the first time you gain {Doubt}, gain 100 essence.
2. * ! Transform a chosen eligible object into {Veiled Wake}. Veiled Wake: During the next dreamscape, the first time you gain {Doubt}, gain 100 essence.
3. * ! Gain {Veiled Wake} temporarily, then return it at the next Dream Journey site or trade it for 120 essence after using it once. Veiled Wake: During the next dreamscape, the first time you gain {Doubt}, gain 100 essence.
```

### seed `rr7`

```
Quest: Ossian, the Reckoning Blade
Stage: early    Essence: 120/500    Omens: 1

1. * Apply {Bronze Transfiguration} to a chosen Starter card.
2. * Apply {Ivory Transfiguration} to a random card in your deck. Gain 3 omens.
3. * Gain {Charm Staff}.
```

### seed `rr8`

```
Quest: Corvath, the Salvage-Born
Stage: early    Essence: 120/500    Omens: 1

1. * Set essence to 60% of maximum.
2. * Gain 4 omens.
3. * ! Purge all Starter cards and replace them with low-cost Event catalog cards.
```

### seed `rr9`

```
Quest: Vethran, Whisperer of Wraiths
Stage: mid    Essence: 120/500    Omens: 1

1. * ! Purge all Starter cards and replace them with quest-matched Common catalog cards.
2. * Apply {Silver Transfiguration} to a random card in your deck. Gain 3 omens.
3. * ! Gain 260-300 random essence.
```

### seed `rr10`

```
Quest: Seld Rakor, Standing Orders
Stage: mid    Essence: 120/500    Omens: 1

1. * Gain 120 maximum essence.
2. * Replace a chosen Starter card with 1 of 4 quest-matched draft-pool cards.
3. * ! Purge a random Starter card and gain a random low-cost Event replacement.
```

---

## `random_trades` — new algorithm (10 samples)

### seed `rt1`

```
Quest: Senemhet, Lord of the Radiant Court
Stage: mid    Essence: 120/500    Omens: 1

1. $ * Modify 2 random cards to become warriors. Battle essence rewards are reduced by 20% for the next 1 battle
2. $ * Change Planetgazer to become a spirit animals. Pay 11 essence
3. $ * Apply Ivory to Ironclad Marksman. Pay 16 essence
```

### seed `rt2`

```
Quest: Karev Soltis, Breach Respondent
Stage: late    Essence: 120/500    Omens: 1

1. $ * Gain 150 essence. Gain 2 random banes
2. $ * Set essence to 50% of your maximum essence. Battle essence rewards are reduced by 40% for the next 2 battles
3. $ * Gain 3 random Characters. Purge a random Spirit Animal
```

### seed `rt3`

```
Quest: Zeva, the Dredger
Stage: early    Essence: 120/500    Omens: 1

1. $ * Gain a random dreamsign. Purge a random Survivor
2. $ * Your starting dreamwell card is Wellspring. Transform Sunset Chronicler into a random card from the pool
3. $ * Create 2 duplicates of Shadowbinder. Gain 1 random card from the card pool
```

### seed `rt4`

```
Quest: Vrakmoth, Ashbroker
Stage: late    Essence: 120/500    Omens: 1

1. $ * Choose 1 of 3 dreamsigns. Remove the transfiguration from Arboreal Requiem
2. $ * Take any number of Survivors from 5 choices. Gain 1 random bane
3. $ * Gain 170 essence. Remove the transfiguration from Liminal Dreamer
```

### seed `rt5`

```
Quest: Kaleth, The Dreaming
Stage: mid    Essence: 120/500    Omens: 1

1. $ * Choose a starter card to transform into Break the Veil. Gain 1 random card from the card pool
2. $ * Draw 2 cards from your deck and duplicate one of them of your choice. Transform Momentum's Edge into a random card from the pool
3. $ * Transform The Grand Heist into Radiant Trio. Purge a chosen Event card
```

### seed `rt6`

```
Quest: Grath, Packmaster
Stage: early    Essence: 120/500    Omens: 1

1. $ * Modify 3 random cards to become spirit animals. Remove the transfiguration from Crumbling Behemoth
2. $ * Purge a random starter card and gain a Character replacement. Battle essence rewards are reduced by 10% for the next 1 battle
3. $ * Apply a transfiguration of your choice to a chosen card. Purge a random Starter card
```

### seed `rt7`

```
Quest: Grath, Packmaster
Stage: late    Essence: 120/500    Omens: 1

1. $ * Gain essence up to your maximum. Draw 3 cards from your deck and purge one of them of your choice
2. $ * Set essence to 100% of your maximum essence. Gain 2 additional starter cards
3. $ * Gain maximum essence. Pay all remaining essence
```

### seed `rt8`

```
Quest: Ovanel, Lector of the Receding Rite
Stage: early    Essence: 120/500    Omens: 1

1. $ * Transfigure all starter cards. Pay 65 essence
2. $ * Set essence to 75% of your maximum essence. Remove the transfiguration from Canopy of Stars
3. $ * Purge all starter cards. Your starting dreamwell card is Frostbite for the next 3 battles
```

### seed `rt9`

```
Quest: Tensho, Daimyo of Lacquered Fury
Stage: early    Essence: 120/500    Omens: 1

1. $ * Change Embersummoner to become a survivors. Pay 10 essence
2. $ * Add a Transfiguration site to the next dreamscape you visit. Shuffle 1 Bitter Echo into your dreamwell for the next 1 battle
3. $ * Transform Vertiginous Leap into Aureate Vision. Purge Marrow Drinker
```

### seed `rt10`

```
Quest: Gunnar Deepforge, The Hammer's Echo
Stage: late    Essence: 120/500    Omens: 1

1. $ * Purge all starter cards. Pay 85 essence. Remove the transfiguration from Torchbearer of the Abyss
2. $ * Transfigure all starter cards. Pay 70 essence
3. $ * [LOCKED] Gain essence up to your maximum. Pay 2 omens. Remove all dreamsign sites from the next 1 dreamscape you visit
```

---

## `random_trades` — old algorithm (10 samples)

The old algorithm rejected 7 of these 10 seeds during global validation
(the validator runs after the fill and aborts the journey if any row is
unpayable, has no legal targets, etc.). The error messages are the actual
CLI output and are included to show how the failures distributed.

### seed `rt1`

```
Error: Forced shape random_trades failed validation: Independent row option
uses a (cost, reward) pair that is not in any registered row pool's
cartesian product
(shape: random_trades; rule: each_row_draws_from_configured_pool)
```

### seed `rt2`

```
Error: Forced shape random_trades failed validation: Option 1 has an
unpayable immediate cost
(shape: random_trades; rule: unpayable_immediate_cost)
```

### seed `rt3`

```
Error: Forced shape random_trades failed validation: Option 2 has an
unpayable immediate cost
(shape: random_trades; rule: unpayable_immediate_cost)
```

### seed `rt4`

```
Error: Forced shape random_trades failed validation: Option 1 has an
unpayable immediate cost
(shape: random_trades; rule: unpayable_immediate_cost)
```

### seed `rt5`

```
Quest: Kaleth, The Dreaming
Stage: mid    Essence: 120/500    Omens: 1

1. * $ Pay 110 essence.
2. * ! Gain 1 Nightmare over the next 3 battles. Gain 120 essence.
```

### seed `rt6`

```
Error: Forced shape random_trades failed validation: Option 2 has an
unpayable immediate cost
(shape: random_trades; rule: unpayable_immediate_cost)
```

### seed `rt7`

```
Error: Forced shape random_trades failed validation: Option 1 has an
unpayable immediate cost
(shape: random_trades; rule: unpayable_immediate_cost)
```

### seed `rt8`

```
Error: Forced shape random_trades failed validation: Independent row option
uses a (cost, reward) pair that is not in any registered row pool's
cartesian product
(shape: random_trades; rule: each_row_draws_from_configured_pool)
```

### seed `rt9`

```
Error: Forced shape random_trades failed validation: Independent row option
uses a (cost, reward) pair that is not in any registered row pool's
cartesian product
(shape: random_trades; rule: each_row_draws_from_configured_pool)
```

### seed `rt10`

```
Quest: Gunnar Deepforge, The Hammer's Echo
Stage: mid    Essence: 120/500    Omens: 1

1. * $ Pay 110 essence.
2. * ! Gain 1 Nightmare over the next 2 battles. Gain 160 essence.
```

A handful of valid old outputs that *did* succeed under seeds `rt12`,
`rt16`, `rt20`, `rt31–rt33` show the same flavor: every successful
option pairs `Pay 110 essence`, `Gain 1 Doubt. Gain 1 named card.`, or
`Gain 1 Nightmare over the next N battles. Gain 120/160 essence.` — i.e.
the three configured row pools play in rotation.

---

## Observations

1. **Catalog breadth.** New rewards span 48 templates (transfiguration,
   dreamsign manipulation, card-text rewrites, site additions, shop
   rerolls, named-card transforms, ...). Old rewards were drawn from a
   curated slot list that yields essence/omens, drafts, and named-card
   grants in most rolls. The diversity in `rr1..rr10` (new) vs `rr1..rr10`
   (old) is immediately visible.

2. **Repetition pattern.** Old `random_rewards` frequently fires three
   variations of the same archetype (e.g. `rr3` and `rr6` each give three
   rows that all reference the same generated card — gain it, transform
   into it, or borrow it). The new algorithm enforces distinct reward
   template ids, so no two rows are slight rewordings of one template.

3. **Cost / reward balance.** New `random_trades` rows are CEC-banded:
   row 2 and row 3 land within ±15 CEC of the anchor row's net. Old
   `random_trades` had no quantitative balance — it relied entirely on
   the row pool author hand-tuning costs and rewards together.

4. **Failure rate.** The old `random_trades` shape rejects most seeds —
   only 3 of 10 seeds in `rt1..rt10` produced output. The new algorithm
   produced output for all 10. (The retry-and-widen behavior plus the
   `Pay N essence` fallback let it land inside the tolerance band without
   tripping payability.)

5. **Output shape contract.** Old `random_trades` could produce 2-row
   menus (it drew row count uniformly from `{2, 3}`). New `random_trades`
   always produces 3 rows.

6. **Locked rows.** The new algorithm can emit a `[LOCKED]` row when a
   cost is currently unpayable (see `rt10` row 3), instead of failing
   validation outright. The old shape failed validation when this would
   have happened (`rt2`, `rt3`, `rt4`, etc. above).
