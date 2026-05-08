> Historical gap inventory: these authored examples record whether one exact
> transcript was reachable by the CLI at the time of the audit. They are not an
> acceptance target for current generation, and their quantities, phrasing,
> object names, and "not generated" notes should not be used to freeze the
> procedural surface. Use them as source material for future payload families
> and validate current behavior through manifest contracts, reachability, value
> bands, and diversity checks.

## Violet Survey

- Draft 1 of 4 cards.
- Gain 80 essence.
- Purge a random Bane.

### Generation analysis

Not possible to generate as a normal Journey today. `src/journey/fillers/shared.ts` can emit card drafts and essence rewards through `rewardSlots()`/`commonPositiveOptions()`, but normal reward amounts are fixed bands like 300/320/340, 330/350/400, or 90/110/130, not 80. More importantly, Bane purge payloads exist only as catalog/manifest concepts (`src/journey/effects.ts`) and debug fixtures (`src/journey/fixtures/debug/bane.ts`); the normal `fillOptions()` paths in `src/journey/fillers/shapeFills.ts` gain Banes as burdens but do not purge a random Bane.

## Equal Shadow

- Gain 1 {Nightmare}. Gain {Ginger Root}.
- Gain 1 {Nightmare}. Draft 1 of 4 cards.
- Gain 1 {Nightmare}. Add a {Purge} site to the current dreamscape.

### Generation analysis

Not possible to generate semantically as a normal Journey. `baneBurdenSlot()`/`choose_your_loss` in `src/journey/fillers/shared.ts` and `src/journey/fillers/shapeFills.ts` can create a `Nightmare` burden, and `data/dreamsigns.toml` contains `Ginger Root`, while `routeEditCatalog.ts` can add or replace a `Purge` site. The blocker is the repeated "Gain 1 {Nightmare}" prefix combined with three unrelated reward families: no normal shape composes the same Bane burden with a named Dreamsign grant, a card draft, and a route add in one internally symmetric menu; that would need a new filler or debug-only authored payload.

## Three Doors of Glass

- Pay 35 essence. Draft 1 of 4 spirit animals.
- Pay 70 essence. Draft 1 of 4 warriors.
- Pay 110 essence. Draft 1 of 4 survivors.

### Generation analysis

Not possible with the current normal generator. `CARD_DRAFT_PROFILES` in `src/journey/fillers/shared.ts` defines `spiritAnimals`, `warriors`, and `survivors`, and the data has enough matching cards, but normal paid card-draft shapes do not use those three profiles as a parallel root menu. `same_reward_different_costs` in `src/journey/fillers/shapeFills.ts` uses prices like 20/30/45 and profiles such as low-cost characters, characters, events, Reclaim/Dissolve events, or fast characters, while decision-tree costs in `src/journey/fillers/treeBuilders.ts` are tree branches rather than three root options with distinct subtype drafts.

## Locksmith Counter

- Purge a chosen starter card.
- Apply {Viridian Transfiguration} to a chosen starter card.
- Replace a chosen starter card with 1 of 4 events.

### Generation analysis

Only partly reachable, so this exact Journey is not possible as normal generation. Starter cleanup is common (`starterCleanup()` in `src/journey/fillers/shared.ts`), and `one_operation_many_targets` can apply a randomly selected operation such as `{Viridian Transfiguration}` to "a chosen Starter card" via `compatibleCardOperations()` in `src/journey/fillers/cardOperationCatalog.ts`. The blocker is the coordinated one-target/many-operations shape over starter cards plus "replace a chosen starter card with 1 of 4 events"; starter replacement with a draft exists only in the debug `starterCleanupReplacementOptions()` fixture in `src/journey/fixtures/debug/card.ts`, not in normal `fillOptions()`.

## Curator's Shelf

- Buy {Ginger Root} for 85 essence.
- Buy {Cloud Lens} for 85 essence.
- Buy {Leather Satchel} for 85 essence.

### Generation analysis

Not possible as written. The three names are real Dreamsigns in `data/dreamsigns.toml`, and `shop_row` in `src/journey/fillers/shapeFills.ts` can produce a flat shop menu, but it prices options at 15/20/25 essence and draws generic `rewardSlots()` rather than exact named Dreamsign purchases. With a minor essence-value and text change, the closest normal equivalent is a shop row offering Dreamsign drafts or other rewards; exact same-price named Dreamsign buys would require named-Dreamsign shop logic outside the current normal filler.

## First Orchard

- Draft 1 of 4 cards with an "abandon" ability.
- Gain {Glow Pouch}.
- Apply {Viridian Transfiguration} to a chosen starter card.

### Generation analysis

Not possible to generate as written. `rewardSlots` in `src/journey/fillers/shared.ts` can draft by broad card profiles and `CARD_DRAFT_CHOICE_COUNT`, but it does not build an "abandon ability" predicate, and it only offers Dreamsign drafts rather than gaining a named catalog Dreamsign such as {Glow Pouch}. `cardOperationCatalog.ts` can apply Viridian to a starter-card target through the one-operation-many-targets catalog, but `shapeFills.ts` has no shape that combines that with the named Dreamsign gain and abandon-filtered draft in one Journey.

## Forked Remedy

- Purge 2 chosen starter cards.
- Gain 1 {Nightmare}. Duplicate a chosen card.

### Generation analysis

Not possible to generate as written. The canonical starter cleanup fillers in `src/journey/fillers/shared.ts` call `starterCleanup(1)`, while `choose_your_loss` in `src/journey/fillers/shapeFills.ts` can gain a Bane such as Nightmare but does not attach a card duplicate effect. `cardOperationCatalog.ts` has a duplicate operation, yet it is only a standalone one-operation-many-targets operation, not a burdened option paired with Bane gain.

## One Card, Three Masks

- Apply {Viridian Transfiguration} to {Glimpse of What Was}.
- Apply {Bronze Transfiguration} to {Glimpse of What Was}.
- Apply {Golden Transfiguration} to {Glimpse of What Was}.

### Generation analysis

Not possible to generate with that named target. `one_target_many_operations` in `src/journey/fillers/shapeFills.ts` can choose three operations from `cardOperationCatalog.ts`, including Viridian, Bronze, and Golden transfigurations, but its shared target is a generic draft-card selector rendered by `renderChosenCardOperationText`, not the specific starter {Glimpse of What Was}. Getting exactly those three transfigurations together would also be a random catalog-order outcome rather than an enforced symmetry.

## Dreamsign Loom

- Transform a chosen Dreamsign into 1 of 3 Dreamsigns.
- Duplicate a chosen Dreamsign.
- Purge a chosen Dreamsign. Gain 2 omens and choose 1 of 2 Dreamsigns.

### Generation analysis

Not possible to generate as written in the normal generator. `src/journey/fillers/shared.ts` can create `dreamsignDraft(2)` or `dreamsignDraft(3)`, but the canonical `shapeFills.ts` reward slots do not expose Dreamsign transform, duplicate, or purge operations. There is a QA-only `dreamsign-transform-duplicate-pool` debug fixture in `src/journey/fixtures/debug/dreamsign.ts`, but its named options bundle transform/purge/duplicate, temporary gain/copy, and pool edits rather than these three generic choices.

## One Blessing, Three Vessels

- Apply {Scarlet Transfiguration} to {Aspiring Guardian}.
- Apply {Scarlet Transfiguration} to {Tranquil Duelist}.
- Apply {Scarlet Transfiguration} to {Nocturne Strummer}.

### Generation analysis

Not possible to generate as written. `one_operation_many_targets` in `src/journey/fillers/shapeFills.ts` can apply one `cardOperationCatalog.ts` operation such as Scarlet Transfiguration across three target classes, but the rendered options are generic targets like a chosen card, a chosen Starter card, and a chosen card in deck. The real card names exist in `data/cards.toml`, yet current target resolution metadata in `src/journey/effects.ts` does not rewrite those generic operation rows into exactly {Aspiring Guardian}, {Tranquil Duelist}, and {Nocturne Strummer}; matching that repeated named-object pattern would require a special named-card fixture or new filler.

## Thin Air

- Lose 120 essence.
- Lose 2 omens.
- Gain 2 copies of {Despair}.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/shapeFills.ts` only builds `choose_your_loss` as separate alternatives such as paying essence, losing 1 omen, or gaining 1 Bane, while `src/quest/init.ts` starts the stateless command at 1 omen and `baneBurdenSlot` in `src/journey/fillers/shared.ts` defaults Bane gains to count 1. `Despair` is in `BANE_NAMES` in `src/journey/effects.ts`, but the current natural generator cannot combine these losses into one option or gain two copies of it.

## Priced Silence

- Pay 90 essence. Purge a chosen card.
- Leave.

### Generation analysis

Not possible to generate semantically. `single_offer` in `src/journey/fillers/shapeFills.ts` can pair one `costSlots` entry with one `rewardSlots` reward and a leave option, but `costSlots` in `src/journey/fillers/shared.ts` tops normal essence costs at 55 and the natural reward slots only purge Starter cards as `starterCleanup` with extra omens. A lower essence price alone would not make this exact offer reachable because the generator has no generic "purge a chosen card" reward slot.

## Cursed Star

- Gain {Witch Hat}. 45% chance to gain 1 {Nightmare}.
- Leave.

### Generation analysis

Not possible to generate semantically. `Witch Hat` exists as a Dreamsign in `data/dreamsigns.toml` and `Nightmare` is the default Bane in `src/journey/effects.ts`, but `risk_or_skip` in `src/journey/fillers/shapeFills.ts` only puts the random downside on generic `rewardSlots` rewards, not exact existing Dreamsign grants. Its downside odds are also selected from 35, 50, or 65 percent, so 45 percent would require a probability-list change even if the reward side were supported.

## Veiled Cache

- Pay 60 essence. Roll for 160 essence, 2 omens, or {Tarot Card}.
- Pay 60 essence. Roll for a random Bane purge, draft 1 of 4 cards, or {Curved Blade}.

### Generation analysis

Not possible to generate semantically. `random_pool_draws` in `src/journey/fillers/treeBuilders.ts` can charge for a visible random reward pool, but its price comes from 35, 45, or 55 essence and `randomPoolRewardCandidates` only adds essence, omens, card drafts, transfigurations, battle windows, Starter cleanup, and Dreamsign drafts. `Tarot Card` and `Curved Blade` are real Dreamsigns in `data/dreamsigns.toml`, yet the natural random pool does not grant exact named Dreamsigns or random Bane purges; with a minor price change, only the generic pay-for-random-pool shape would be reachable.

## Sleeping Contract

- Gain {Dead Rat}.
- After 2 victories, gain {Essence Vial}.

### Generation analysis

Not possible to generate semantically. `Dead Rat` and `Essence Vial` are real Dreamsigns in `data/dreamsigns.toml`, but the natural generator's exact Dreamsign references come through resolver-driven temporary, borrow, or trade hooks rather than direct permanent grants. `reward_after_trigger` in `src/journey/fillers/shapeFills.ts` filters `timingSlots` to next battle or next victory, and `timingTriggerSelector` in `src/journey/fillers/hookPayloads.ts` records next-victory hooks with count 1, so an "after 2 victories" exact named Dreamsign payoff is outside current reach.

## Winchime Promise

- After you visit a {Purge} site, gain {Dragon Egg}.
- After you visit a {Transfiguration} site, gain {Eye Amulet}.

### Generation analysis

Not possible as a current generated Journey. `data/dreamsigns.toml` contains both `{Dragon Egg}` and `{Eye Amulet}`, but the natural delayed hook path in `src/journey/fillers/hookPayloads.ts` only builds next-battle, next-victory, and dreamscape timings through `timingTriggerSelector`, not Purge or Transfiguration site visits. The debug hook matrix in `src/journey/fixtures/debug/hook.ts` has a `site_visit` example, but it is fixed to a Shop discount rather than exact named Dreamsign grants.

## Current Map Ink

- Replace a {Draft} site with a {Purge} site in the current dreamscape.
- Replace a {Draft} site with a {Transfiguration} site in the current dreamscape.
- Replace a {Draft} site with a {Dreamsign Offering} site in the current dreamscape.

### Generation analysis

Not possible as this complete three-option menu. `src/journey/fillers/routeEditCatalog.ts` can build individual current-dreamscape `replace_site` candidates from `Draft` to high-agency sites, and `SITE_TYPES` in `src/journey/effects.ts` includes all three target site types. But `alter_dreamscapes` in `src/journey/fillers/shapeFills.ts` emits only two route options, while `rewardSlots` contributes at most one `routeReplacementReward`, so the all-Draft three-way symmetry is outside the current filler shapes.

## Toll Cabinet

- Pay 25 essence. Purge a chosen starter card.
- Pay 25 essence. Apply {Viridian Transfiguration} to a chosen card.
- Pay 25 essence. Choose 1 of 3 Dreamsigns.

### Generation analysis

Not possible exactly. `costSlots` and `shop_row` in `src/journey/fillers/shapeFills.ts` can produce 25-essence costs, `rewardSlots` can produce starter cleanup and Dreamsign drafts, and `src/journey/fillers/cardOperationCatalog.ts` can render `Apply {Viridian Transfiguration} to a chosen card.` But no current shape combines those three exact effects behind the same 25-essence toll: starter cleanup from `rewardSlots` also grants 4 omens, chosen-card Viridian appears as an uncoupled card operation, and Dreamsign choice counts are selected independently.

## Bounded Wheel

- Roll for 150 essence, {Flash Powder}, a random Bane purge, or 1 {Nightmare}.
- Pay 1 omen. Roll twice and keep one result.

### Generation analysis

Not possible as written. Random machinery exists in `src/journey/fixtures/debug/random.ts` and `src/journey/fillers/treeBuilders.ts` for visible pools, `roll_twice_keep_one`, Bane chances, and random reward draws, but those pools are assembled from `rewardSlots` or `treeRewardFamily`, not from an exact named `{Flash Powder}`, a Bane purge, and a Nightmare burden together. `{Flash Powder}` exists in `data/dreamsigns.toml` and could be selected by named Dreamsign debug fixtures, but not as a wheel outcome; the roll-twice option is also tied to an essence stake in `randomRevealRollWagerFill`, not a 1-omen payment.

## Lantern Budget

- Gain 90 essence.
- Gain 35 maximum essence.
- Set essence to 60% of your maximum essence.

### Generation analysis

Not possible as a current generated Journey. `sequentialReward` in `src/journey/fillers/shared.ts` can emit `gain 90 essence`, and `resourceEdgeCaseOptions` in `src/journey/fixtures/debug/resource.ts` proves the manifest can carry cap and percentage resource semantics. However, that fixture is fixed to `Gain 25 maximum essence` and `Gain 25% of maximum` after a percentage cost, and no filler or operation sets essence to exactly 60% of maximum; the +35 cap option would be a minor constant change, but the set-to-percent behavior needs new generator support.

## Omen Ledger

- Gain 2 omens.
- Pay 1 omen. Draft 1 of 4 fast cards.
- Pay 2 omens. Choose 1 of 3 Dreamsigns.

### Generation analysis

Not possible to generate as a complete Journey. `src/journey/fillers/shapeFills.ts` and `src/journey/fillers/shared.ts` can draft 1 of 4 fast characters and can make Dreamsign drafts, but `costSlots` only offers a 1-omen loss and `rewardSlots` uses a fixed 5-omen gain; there is no current filler that composes a 2-omen gain, a 1-omen fast-card draft, and a 2-omen Dreamsign draft in one menu. With a minor value/text change, the Dreamsign line could be close to the existing `same_reward_different_costs` Dreamsign branch, but the 2-omen cost is outside the current cost catalog.

## Thorned Cleanup

- Purge up to 2 chosen starter cards.
- Purge a chosen Bane and gain a random non-Bane replacement.
- Purge {Nightmare}. Gain 70 essence.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/treeBuilders.ts` can produce "purge up to 2 chosen Starter cards" in the `starter_cleanup` reward family, and `src/journey/fixtures/debug/bane.ts` has Bane purge/replace/transform fixtures, but the current Bane fixture replaces Banes with other Banes or transforms a manifest Bane into a named card, not a chosen Bane into a random non-Bane replacement. `{Nightmare}` is available as a controlled Bane name in `BANE_NAMES` and also appears as a card in `data/cards.toml`, but no filler produces "Purge {Nightmare}. Gain 70 essence."

## Eight Windows

- Draft 1 of 4 cards with a "discard" ability.
- Take any number of warrior cards from 5 choices.
- Gain 2 random event cards.

### Generation analysis

Not possible to generate with the current command. `src/journey/fillers/shared.ts` supports fixed card-draft profiles and a fixed `CARD_DRAFT_CHOICE_COUNT` of 4, but there is no profile for cards whose rules text contains "discard"; `data/cards.toml` has many such cards, yet the filler catalog does not expose that predicate. `src/journey/fillers/shapeFills.ts` has a `take_any_number` shape, but it takes up to 2 rewards from a cache rather than any number of Warrior cards from 5 choices, and neither it nor `src/journey/fillers/treeBuilders.ts` generates "gain 2 random event cards."

## Sign Between Bells

- Gain {Rainbow Horn}.
- Gain a random quest Dreamsign.
- Choose 1 of 3 battle Dreamsigns.

### Generation analysis

Not possible to generate semantically. `data/dreamsigns.toml` contains `{Rainbow Horn}`, and `src/journey/fixtures/debug/dreamsign.ts` can create named Dreamsign shop rows, so that specific name could appear only by deterministic candidate ordering for a seed/debug payload rather than by an explicit named request. The current content model and resolvers in `src/journey/effects.ts` distinguish Dreamsigns by `kind` and tide predicates, not "quest" or "battle" categories, although a plain "Choose 1 of 3 Dreamsigns" is reachable through `dreamsignDraftText` in `src/journey/fillers/shared.ts`.

## Green Knife

- Apply a transfiguration of your choice to a chosen card.
- Apply {Viridian Transfiguration} to 2 chosen starter cards.
- Apply {Golden Transfiguration} to {Ethereal Trailblazer}.

### Generation analysis

Not possible as a complete Journey. `src/journey/fillers/cardOperationCatalog.ts` includes Viridian and Golden Transfiguration operations, and `data/cards.toml` contains `{Ethereal Trailblazer}`, but default card-operation fillers target predicates such as a chosen card, Starter card, or deck card rather than that exact non-starter named card. `src/journey/fixtures/debug/card.ts` can apply Viridian to one named starter, while `src/journey/fillers/treeBuilders.ts` can apply a transfiguration to up to 2 chosen cards, but no current path applies Viridian to 2 chosen starter cards or offers an arbitrary transfiguration choice inside a single option.

## Unsorted Change

- Apply {Scarlet Transfiguration} to 2 random character cards.
- Transfigure 3 random starter cards.
- Transfigure all cards in your deck. Gain 1 {Nightmare}.

### Generation analysis

This is not possible for the current generator as written. `src/journey/fillers/cardOperationCatalog.ts` and `src/journey/fillers/shared.ts` can apply standard transfigurations to a chosen card, a drafted card, or one random card in deck, while `src/journey/fillers/treeBuilders.ts` can scale to up to 2 chosen cards in tree rewards, but none of those paths target 2 random character cards, 3 random starter cards, or all cards in deck. `{Nightmare}` is a legal bane via `BANE_NAMES`/`DEFAULT_BANE_NAME` in `src/journey/effects.ts`, but the current fillers only attach bane gain through loss/risk/tree burdens, not to a full-deck transfiguration option.

## Starter Door

- Choose a starter card to transform into {Aspiring Guardian}.
- Purge a random starter card and gain a random low-cost replacement.
- Purge all starter cards and replace them with new starter cards.

### Generation analysis

This full journey is not possible to generate. The debug/card path in `src/journey/fixtures/debug/card.ts` can build starter cleanup and replacement options, and `data/cards.toml` contains `{Aspiring Guardian}` as a low-cost Common card, so a one-starter replacement into that named card could happen only if the deterministic content pick selects it. However, natural filler cleanup in `src/journey/fillers/shared.ts` only purges up to 1 chosen Starter card, tree cleanup in `src/journey/fillers/treeBuilders.ts` caps at 2 chosen Starters, and no current path purges all starters or replaces the whole starter set.

## Map Fold

- Add a {Dreamsign Offering} site to this dreamscape.
- Add a {Transfiguration} site to the next dreamscape you visit.
- Increase future {Shop} site chance by 30%.

### Generation analysis

This is semantically close but not reachable as a complete three-option journey. `src/journey/fillers/routeEditCatalog.ts` includes `Dreamsign Offering`, `Transfiguration`, and `Shop` as route sites, supports add-site and probability-adjustment payloads, and can roll a 30% probability delta. The production `alter_dreamscapes` fill in `src/journey/fillers/shapeFills.ts` requests only 2 positive route rewards, while the route debug fixture in `src/journey/fixtures/debug/environment.ts` has fixed examples that do not match this exact set, so these three rows would require catalog luck plus a shape/root-count change.

## Echo Table

- Duplicate a chosen card.
- Create 2 duplicates of {Moonlit Voyage}.
- Draw 4 cards from your deck and duplicate one of them.

### Generation analysis

This full journey is not possible for the current generator. `src/journey/fillers/cardOperationCatalog.ts` can produce `Duplicate a chosen card` for `one_operation_many_targets`, and the named-card debug fixture can create 2 copies of a named deck target, but `src/quest/init.ts` builds the stateless deck only from Starter-rarity cards while `{Moonlit Voyage}` is a Common Event in `data/cards.toml`. No filler or debug fixture combines drawing 4 cards with duplicating one, so the third row is outside the current semantic operation set.

## Ink Reassignment

- Modify {Moonlit Voyage}'s text to reference characters.
- Change {Nocturne Strummer} to become a warrior.
- Make a chosen event Fast.

### Generation analysis

This full journey is not possible, though the last option is within reach. `src/journey/fillers/cardOperationCatalog.ts` can add Fast to a chosen card, and `src/journey/fillers/shared.ts` can make an Event draft-card target legal, so a chosen-event Fast rewrite can be generated by random shape/target selection. The named-card debug fixture in `src/journey/fixtures/debug/card.ts` has fixed text modification (`Add "Foresee 1"`) and type-change (`newCardType: "Event"`) payloads, but it does not rewrite text to reference characters or change a card subtype to Warrior; `{Moonlit Voyage}` and `{Nocturne Strummer}` are real cards in `data/cards.toml`, but the current operations cannot make those exact semantic edits.

## Quickening Spill

- Change {Beacon of Tomorrow} to have Fast.
- Change 2 random cards to have Fast.
- Modify 3 random cards to become events.

### Generation analysis

Not possible to generate as a complete current Journey. `src/journey/fillers/cardOperationCatalog.ts` can emit `add-fast`, and debug-only `namedCardOperationOptions` in `src/journey/fixtures/debug/card.ts` can add Fast or make one named deck card an Event, but the normal shape fills do not target exact catalog card names like {Beacon of Tomorrow} or batch-change 2-3 random cards this way. `data/cards.toml` has Beacon of Tomorrow as a non-Fast Event, but the generated-object and target-resolution paths do not create this specific named rewrite.

## First Breath

- Draw 1 additional card in your opening hand for 3 battles.
- Draw 2 additional cards in your next battle.
- Gain {Hair Lock} for 2 battles.

### Generation analysis

Not possible to generate as this three-option Journey, though pieces are reachable. `battleWindowOptions` in `src/journey/fillers/timedWindowPayloads.ts` can produce extra opening-hand cards and turn-2 draw inside a shared battle window, and `temporaryObjectWindowOptions` can temporarily grant a selected Dreamsign such as Hair Lock from `data/dreamsigns.toml`. Those are different timed-window scopes, so `timedWindowMenuFill` cannot combine them in one menu; a specific {Hair Lock} temporary grant would also only happen by random pool/selection.

## Dreamwell Switch

- Your first Dreamwell draw produces +1 energy for 3 battles.
- Shuffle 2 bonus Dreamwell cards into your Dreamwell for 2 battles.
- Upgrade your lowest-phase Dreamwell card for 3 battles.

### Generation analysis

Not possible as written. `dreamwellWindowOptions` in `src/journey/fillers/timedWindowPayloads.ts` can emit first-draw energy, one additional positive Dreamwell card, or upgrading the first Dreamwell card drawn, all under a shared 2/3/4-battle window. It cannot add 2 bonus Dreamwell cards or target the lowest-phase Dreamwell card; the closest output would require semantic changes to those option payloads.

## Shop Courtesy

- Shop rerolls are free for 2 dreamscapes.
- The next 2 items you purchase from shops are free.
- Gain essence up to your maximum before the next shop.

### Generation analysis

Not possible to generate as a normal Journey. `shopWindowOptions` in `src/journey/fillers/timedWindowPayloads.ts` only discounts rerolls by 1 omen and discounts the first purchase by a fixed essence amount over future shops, while `shopEconomyOptions` in `src/journey/fixtures/debug/environment.ts` has debug-only one-purchase/free and fixed-essence restore variants. The effect catalog has `essence-restoration` in `src/journey/effects.ts`, but the normal reward slots emit fixed essence gains rather than "restore to maximum before next shop."

## Pool Compass

- Remove neutral Dreamsigns from the pool.
- Gain a copy of a chosen Dreamsign.

### Generation analysis

Not possible to generate semantically. `buildDreamsignPool` in `src/quest/packageResolution.ts` only puts tidal Dreamsigns that overlap selected tides into `dreamsignPoolIds`, while neutral Dreamsigns remain counted separately in `neutralCatalogCount`, so there are no neutral pool entries to remove. Normal fills use `dreamsignDraft`/`dreamsignDraftText` in `src/journey/fillers/shared.ts`; copy or pool-edit Dreamsign operations exist only in debug fixture code such as `dreamsignTransformDuplicatePoolOptions`.

## Promise Card

- Gain {Moonlit Voyage}. Once you play it 4 times, gain 120 essence.
- Gain {Ginger Root}. Once it triggers 3 times, gain 2 omens.
- Once you play {Aspiring Guardian} 5 times, duplicate it.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/shapeFills.ts` builds `reward_after_trigger` from `timingSlots(...)` as next-battle or next-victory delayed rewards, and `delayedRewardHookFill` in `src/journey/fillers/hookPayloads.ts` does not attach named-card-play or Dreamsign-trigger counters in the natural filler path. The names exist in `data/cards.toml` and `data/dreamsigns.toml`, but the current reward fillers use predicate drafts, Dreamsign drafts, and selected references rather than granting those exact objects with repeated trigger thresholds.

## Split Signal

- Merge 2 chosen cards into a combined card.
- Split a chosen card with multiple abilities into separate cards.
- Make a chosen event become the materialized ability of a character.

### Generation analysis

Not possible to generate semantically. The card-operation path in `src/journey/fillers/cardOperationCatalog.ts` can apply standard transfigurations, keywords, cost changes, duplication, temporary copies, and opening-hand windows, but it has no merge, split, or materialized-ability operation. The menu shapes in `src/journey/fillers/shapeFills.ts` can point those operations at chosen cards, but the underlying catalog cannot express these three transformations.

## Omen-Fed Prism

- Pay 2 omens. Draft 1 of 4 dissolve events.
- Pay 60 essence. Gain {Spice Blossoms}.
- Pay 20% of your essence. Apply {Viridian Transfiguration} to a chosen card.

### Generation analysis

Not possible as a complete generated Journey. `CARD_DRAFT_PROFILES.dissolveEvents` in `src/journey/fillers/shared.ts` can support a "Draft 1 of 4 Dissolve events" reward, and `src/journey/fillers/cardOperationCatalog.ts` can apply `{Viridian Transfiguration}` to a chosen card, but natural costs come from fixed `costSlots(...)`, one-omen loss, or small fixed transfiguration prices, not 2 omens, 60 essence, or percentage essence. `{Spice Blossoms}` exists in `data/dreamsigns.toml`, but natural Dreamsign rewards are `dreamsignDraft(...)` choices rather than a named Dreamsign grant; the first and third options would be close only with minor cost-model changes.

## Hollow Treasury

- Pay maximum essence. Gain {Pyramid Relic}.
- Pay all remaining essence. Gain {Gold Key} and 2 omens.
- Pay 40-100 essence at random. Draft 1 of 4 event copying cards.

### Generation analysis

Not possible to generate semantically. `RESOURCE_EDGE_CASE_VALUE_BANDS` in `src/journey/fillers/shared.ts` names maximum, all-remaining, and random-range concepts, but the natural fillers actually price options through `costSlots(...)`, shop prices, and tree cost progressions rather than those edge-case costs. `{Pyramid Relic}` and `{Gold Key}` exist in `data/dreamsigns.toml`, but the generator does not naturally grant exact named Dreamsigns here, and its card draft profiles include event, Dissolve, Reclaim, and Materialized filters rather than "event copying cards."

## Withered Orchard

- Battle essence rewards are reduced by 25%. Gain {Green Beetle}.
- Essence site rewards are reduced by 40. Gain a legendary card.
- Essence site rewards are reduced by 20%. Purge a chosen starter card.

### Generation analysis

Not possible to generate semantically. The natural timed/status surfaces in `src/journey/fillers/timedWindowPayloads.ts` and `src/journey/fillers/generatedObjects.ts` create positive battle, Dreamwell, shop, route, or generated-status effects, while `statusPayload(...)` in `src/journey/fillers/environmentPayloads.ts` is not used by a natural filler to reduce Battle or Essence-site rewards. `{Green Beetle}` is real content in `data/dreamsigns.toml`, and starter cleanup exists via `starterCleanup(...)` in `src/journey/fillers/shared.ts`, but named Dreamsign grants, legendary-card gains, and site-reward reduction costs are outside the current generator's semantic reach.

## Scissor Saint

- Purge {Nocturne Strummer}. Gain {Charm Bracelet}.
- Purge a random character. Draft 1 of 4 survivors.
- Purge a chosen Dreamsign. Apply {Golden Transfiguration} to a chosen card.

### Generation analysis

Not possible to generate as a complete journey. `src/journey/fillers/shared.ts` can make starter cleanup and `src/journey/fillers/cardOperationCatalog.ts` can apply standard transfigurations such as Golden, but the normal fillers do not combine named starter purges with named Dreamsign gains. `src/journey/fixtures/debug/card.ts` and `src/journey/fixtures/debug/dreamsign.ts` have some named card/Dreamsign fixtures, yet they are separate debug payload families and do not provide random character purge or chosen-Dreamsign purge plus card transfiguration in one offer.

## Molting Archive

- Transform {Black Cat} into a random Dreamsign. Gain 90 essence.
- Transform {Glimpse of What Was} into a random card. Gain {Ginger Root}.
- Gain 3 random energy generation cards. Purge a chosen card.

### Generation analysis

Not possible to generate. `src/journey/fixtures/debug/dreamsign.ts` can transform a named pool Dreamsign into another named catalog Dreamsign, and `src/journey/fixtures/debug/card.ts` can transform starter cards into named reward cards, but neither path produces a random target result with an added named Dreamsign reward. The 90 essence amount exists in `sequentialReward` in `src/journey/fillers/shared.ts`, but the generator has no filler for gaining three random energy-generation cards or pairing that with a chosen card purge.

## Bane Ledger

- Gain 1 {Nightmare}. Add a {Dreamsign Offering} to the current dreamscape.
- Gain 1 {Despair} for 3 battles. Apply {Scarlet Transfiguration} to a chosen card.

### Generation analysis

Not possible to generate as written. `src/journey/fillers/shared.ts` and `src/journey/fillers/shapeFills.ts` can add Bane burdens, and `src/journey/fillers/routeEditCatalog.ts` can add or replace route sites including Dreamsign Offering, but current shape fillers do not combine a Bane gain with an add-site route edit in one option. Scarlet transfiguration is reachable through `CARD_OPERATION_CATALOG`, while a three-battle Bane is only represented by the debug Bane fixture as temporary Paranoia in `src/journey/fixtures/debug/bane.ts`; Despair with that duration would require a small fixture/value change.

## Starter Debt

- Gain 3 additional starter cards. Gain {Worm Apple}.
- Apply {Fractured Transfiguration} to a random starter card. Draft 1 of 4 events.
- Remove the transfiguration from {Nocturne Strummer}. Gain 2 omens.

### Generation analysis

Not possible to generate. Starter support in `src/journey/fillers/shared.ts` and `src/journey/fixtures/debug/card.ts` is cleanup, replacement, duplication, or transfiguration of existing starter cards, not gaining three additional starter cards. `Fractured Transfiguration` is outside both `STANDARD_TRANSFIGURATIONS` in `src/journey/effects.ts` and the generated transfiguration name set in `src/journey/fillers/generatedObjects.ts`, and there is no operation for removing a transfiguration from a named card.

## Stolen Verbs

- Remove Reclaim from {Moonlit Voyage}. Gain {Cauldron}.
- Remove Foresee from {Synaptic Sentinel}. Draft 2 of 4 fast cards.
- Draw 5 cards from your deck and purge one. Gain {Dragon Egg}.

### Generation analysis

Not possible to generate. The normal operation catalog in `src/journey/fillers/cardOperationCatalog.ts` adds Fast, Reclaim, or Foresee but does not remove keywords, and the debug named-card fixture only hardcodes removing Dissolve rather than Reclaim or Foresee. `draftCards` in `src/journey/fillers/shared.ts` always uses take 1 of 4, with fast support limited to the fast-character profile, and there is no generated Journey effect for drawing five cards from the deck and purging one; named Dreamsign gains like Cauldron or Dragon Egg can only appear through fixed named-Dreamsign payloads, by seed/content-pool chance.

## Narrow Gate

- Draw 1 fewer card in your opening hand for 4 battles. Gain {Root Staff}.
- Your opponents require 3 fewer points to win for 3 battles. Gain a legendary card.
- Your opponents gain {Curved Blade} for 2 battles. Apply {Golden Transfiguration} to a chosen card.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/timedWindowPayloads.ts` can create positive opening-hand windows, but not fewer opening-hand cards or opponent win-threshold changes, and `src/journey/fillers/shared.ts` only offers generic card drafts/Dreamsign drafts rather than direct named Dreamsign grants like {Root Staff} or {Curved Blade}. `src/journey/fillers/cardOperationCatalog.ts` can apply {Golden Transfiguration} to a chosen card, so that fragment is reachable, but the surrounding opponent and legendary-card effects are not.

## Tomorrow's Knife

- After 2 battles, purge 2 random cards. Gain {Skull Pendant}.
- After each battle, purge a random character. Gain a random Dreamsign.

### Generation analysis

Not possible to generate semantically. The effect catalog in `src/journey/effects.ts` defines random purge vocabulary, but the normal fillers in `src/journey/fillers/shared.ts` and `src/journey/fillers/treeBuilders.ts` only emit chosen Starter cleanup, not delayed random purges of arbitrary cards or characters. The Dreamsign path is also generic `dreamsign_draft` from `dreamsignDraft()` rather than a random Dreamsign or a direct named {Skull Pendant} grant.

## Bitter Dreamwell

- Your first Dreamwell draw produces 1 less energy for 3 battles. Gain {Twisted Herbs}.
- Shuffle 3 penalty Dreamwell cards into your Dreamwell for 2 battles. Gain a legendary card.
- Shuffle 1 delayed Dreamwell card into your Dreamwell for 5 battles. Gain {Algae}.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/timedWindowPayloads.ts` and `dreamwellPayload()` in `src/journey/fillers/environmentPayloads.ts` support positive Dreamwell windows such as additional first-draw energy, positive cards, upgrades, or ignoring a penalty, but not negative first-draw energy, three penalty cards, or five-battle delayed Dreamwell cards. {Twisted Herbs} and {Algae} exist in `data/dreamsigns.toml`, but normal rewards use generic Dreamsign drafts and do not directly grant those named Dreamsigns.

## Vanishing Atlas

- Remove all shop sites from the Dream Atlas. Gain {Bestiary}.
- Remove all Dreamsign sites from the Dream Atlas. Transfigure all events in
  your deck.
- Purge {Draft} from the current dreamscape. Gain {Dreamsign Offering}.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/routeEditCatalog.ts` supports bounded route edits for controlled site types, but normal route rewards in `firstRouteEditReward()` and `alter_dreamscapes` choose positive edits, not removing all Shop or Dreamsign sites from the full atlas, and `purge_site` is only generated for future/full-atlas scopes. `src/journey/fillers/cardOperationCatalog.ts` can transfigure a chosen target, but it cannot transfigure all Event cards in the deck, and {Bestiary} is a named Dreamsign from `data/dreamsigns.toml` rather than a direct grant.

## Sealed Hands

- You can no longer gain essence. Gain {Golden Acorn} and 4 omens.
- You can no longer modify your deck. Gain {Amanita}.
- You can no longer transfigure cards. Gain 4 legendary cards.

### Generation analysis

Not possible to generate semantically. `statusPayload()` in `src/journey/fillers/environmentPayloads.ts` can represent narrow rule mutations such as shop, Dreamwell, battle, or deck-cut constraints, but no normal filler creates persistent prohibitions on gaining essence, modifying the deck, or transfiguring cards. `src/journey/fillers/shared.ts` can grant omens and generic drafts, but it does not directly grant named Dreamsigns like {Golden Acorn} or {Amanita}, and the card draft profiles do not request Legendary rarity despite Legendary cards existing in `data/cards.toml`.

## Crooked Coin

- 50% chance to pay 120 essence. Gain {Clover}.
- 25% chance to purge a random Dreamsign. Gain {Brown Acorn}.

### Generation analysis

Not currently generatable. `src/journey/fillers/shapeFills.ts` can make random costs through `risk_or_skip` and `single_wager`, but their chance bands and costs are fixed around 35/50/65% or wager odds, and `rewardSlots` only drafts Dreamsigns rather than directly granting exact `{Clover}` or `{Brown Acorn}` from `data/dreamsigns.toml`. A specific named Dreamsign could be referenced by selected-pool logic only in other shapes such as `pairedReturnHookFill`, so this two-option random-cost/random-purge symmetry would require new filler logic rather than just a seed.

## Borrowed Crown

- Gain {Green Amulet} for 3 battles. Then lose it and pay 100 essence.
- Gain {Wolf Sigil} for 2 battles. Then lose it and gain 1 {Nightmare}.
- Draft 2 of 4 cards for 2 battles. Then purge both cards.

### Generation analysis

Not currently generatable. `src/journey/fillers/timedWindowPayloads.ts` can temporarily grant a selected Dreamsign, and `src/journey/fillers/hookPayloads.ts` has a `paired_return` borrowed-Dreamsign contract for 2 battles, but those paths do not create a three-option menu with later loss plus essence or Bane penalties. `draftCards` in `src/journey/fillers/shared.ts` is hard-coded to take 1 of 4 cards, so the temporary "Draft 2 of 4 cards, then purge both" option is outside the current generator.

## Duplicate Draft

- Draft 1 of 4 cards, adding 2 copies. Gain 1 {Nightmare}.
- Draft 1 of 4 cards, adding 2 copies of each. Pay 120 essence.
- Draft 1 of 4 cards, adding 2 copies of each. Purge a random Dreamsign.

### Generation analysis

Not currently generatable. The draft primitive in `src/journey/fillers/shared.ts` creates `card_draft` with `takeCount: 1` and `choiceCount: 4`, while duplication is a separate `card_duplicate` operation in `src/journey/fillers/cardOperationCatalog.ts` that targets an existing chosen card. The current fillers do not attach "add 2 copies" to the drafted card, and the 120 essence payment is above the normal direct cost bands in `costSlots`.

## Duplicate Purge

- Purge all duplicate cards. Gain {Cauldron}.
- Purge all duplicate cards. Draft 1 of 4 events and duplicate it.
- Purge all duplicate cards. Apply {Golden Transfiguration} to a chosen card.

### Generation analysis

Not currently generatable. `src/journey/effects.ts` includes purge effects for chosen, random, and Starter cards, and `src/journey/fillers/shared.ts` exposes `starterCleanup`, but there is no semantic operation for "purge all duplicate cards." The reward pieces are individually nearby (`rewardSlots` can draft events or apply `{Golden Transfiguration}`), but the shared duplicate-purge prerequisite and exact `{Cauldron}` grant are not produced by the current content-backed fillers.

## Thorn Debt

- Gain 2 {Nightmare}. After 2 battles, transform them into {Wildflower Colossus}.
- Gain 1 {Oblivion}. After you add 3 event cards, transform it into {Avatar of Oblivion}.
- Pay 100 essence. Gain {Wildflower Colossus} now.

### Generation analysis

Not currently generatable. `src/journey/effects.ts` and `src/journey/operationAdapters.ts` recognize Bane names and `bane_transform_to_card`, and `src/journey/fixtures/debug/bane.ts` exercises Bane transform payloads, but the normal generator does not build delayed Bane-to-specific-card transformations. `hookTrigger` in `src/journey/fillers/hookPayloads.ts` can represent `card_added`, yet the production `delayedRewardHookFill` only wraps reward slots, not "after adding 3 event cards, transform Oblivion into {Avatar of Oblivion}"; the exact named cards exist in `data/cards.toml` but are not reachable through this option pattern.

## First Thought

- Choose a cost 1 card. It appears in your opening hand for 3 battles.
- Choose a starter card. It appears in your opening hand for 3 battles and costs 1 less.
- Choose a Fast card. It appears in your opening hand next battle and gains Reclaim.

### Generation analysis

Not possible to generate semantically as a complete Journey. `src/journey/fillers/cardOperationCatalog.ts` has separate `opening-hand-window`, `reduce-cost-window`, and `add-reclaim` operations, and `src/journey/fillers/shapeFills.ts` applies them either as one operation over many targets or many operations over one target. It cannot combine opening-hand placement with cost reduction or Reclaim in a single option, and `CARD_DRAFT_PROFILES` in `src/journey/fillers/shared.ts` has low-cost and Fast predicates but not this exact cost-1/starter/Fast three-row contract.

## Spoiled Victory

- Your next victory yields a Dreamsign draft instead of card rewards.
- Your next victory yields 220 essence instead of card rewards.
- Your next victory adds a {Transfiguration} site to the next dreamscape instead of card rewards.

### Generation analysis

Not possible to generate semantically as written. `reward_after_trigger` in `src/journey/fillers/shapeFills.ts` can create "After next victory" rewards through `delayedRewardHookFill`, and `rewardSlots` can include Dreamsign drafts, essence, and route edits, but that shape filters out route effects and does not model replacing victory card rewards. The status replacement debug path in `src/journey/fixtures/debug/environment.ts` only replaces a no-reward result with `120 essence`, so the 220-essence and Transfiguration-site replacement clauses are outside the current generator; the essence amount would also need a catalog value change.

## Emergency Thread

- Gain the one-time {Open Thread} status: banish your hand and draw 10 cards.
- Gain the one-time {Cinder Thread} status: dissolve 2 cards in hand and gain 3 energy.
- Gain the one-time {Sleeping Thread} status: end your turn and draw 5 cards next turn.

### Generation analysis

Not possible to generate semantically. `statusPayload` in `src/journey/fillers/environmentPayloads.ts` supports typed status scopes and rule mutation kinds, while natural generated statuses in `src/journey/fillers/generatedObjects.ts` are limited to purge-copy, shop-Reclaim, and Bane-essence fragments. The current status catalogs do not create named `{Open Thread}`, `{Cinder Thread}`, or `{Sleeping Thread}` objects, nor do they model hand banish/draw-10, hand dissolve for energy, or ending the turn for next-turn draw.

## Covered Cups

- Reveal 3 rewards. Choose one revealed reward.
- Reveal 5 rewards. Choose one random revealed reward and gain 1 {Nightmare}.
- Gain 1 random reward.

### Generation analysis

Partially reachable, but not as this three-option Journey. `src/journey/fixtures/debug/random.ts` builds typed `reveal_rewards`, `choose_one_revealed_reward`, `choose_one_random_revealed_reward`, and `gain_one_random_reward` envelopes, and `src/render/human.ts` can render those operation kinds. However the current debug fill exposes them inside a combined random-reveal option, while normal `random_pool_draws` in `src/journey/fillers/treeBuilders.ts` is a decision tree around a visible pool; neither path emits this exact root bullet list, and reveal-5 plus guaranteed `{Nightmare}` is not in the current random catalog.

## Root Contract

- Gain {Dead Rat}. After you pay 120 essence, transform it into {Mandrake Root}.
- Pay 80 essence. Gain {Root Staff}.
- Gain {Candle}. After 3 battles, transform it into {Golden Acorn}.

### Generation analysis

Not possible to generate semantically as a complete Journey, even though all five names exist as Dreamsign content in `data/dreamsigns.toml`. The named Dreamsign debug catalog in `src/journey/fixtures/debug/dreamsign.ts` can transform, gain, copy, temporarily grant, or trade catalog-backed Dreamsigns, and `src/journey/fixtures/debug/hook.ts` has an `essence_payment` trigger, but no builder combines these into "pay 120 essence to transform this named Dreamsign" or "after 3 battles transform this named Dreamsign." Exact named-object pairings such as `{Dead Rat}` to `{Mandrake Root}` would only occur by random content selection if a compatible pattern existed, and the required delayed transformation pattern does not.

## Gathered Kindling

- After you add 3 event cards, apply {Azure Transfiguration} to all event cards.
- After you add 2 character cards, apply {Scarlet Transfiguration} to a chosen character.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/cardOperationCatalog.ts` and `src/journey/effects.ts` only expose the standard Transfigurations Bronze/Scarlet/Viridian/Golden/Prismatic, while `src/journey/fillers/generatedObjects.ts` can generate Amber/Glass/Hollow/Silver/Thistle Transfigurations, so `{Azure Transfiguration}` is outside both catalogs. The generator can draft cards and apply one Transfiguration to a drafted, chosen, or random card in `src/journey/fillers/shared.ts` and `src/journey/fillers/shapeFills.ts`, but it does not create "after you add N cards" hooks or apply a Transfiguration to all event cards.

## Unbarred Spellbook

- Remove target restrictions from a chosen event.
- Gain 1 {Nightmare}. Permanently remove target restrictions from a chosen event.
- Remove target restrictions from all cost 2 or less events.

### Generation analysis

Not possible to generate semantically. The operation vocabulary in `src/journey/effects.ts` and `src/journey/manifest.ts` supports card rewrites such as keywords, cost changes, duplicate/copy, and text additions, but there is no "target restriction" operation or payload. `src/journey/fillers/cardOperationCatalog.ts` can add Fast/Reclaim/Foresee, reduce cost, duplicate, or create temporary copies, so even the Nightmare burden option cannot pair with this missing event-text rewrite.

## Key Ticket

- Gain {Gold Key}. At a future Shop, trade it for 250 essence.
- Gain {Parchment}. At a future {Dream Journey}, trade it for a legendary card.
- Gain {Opal}. After 2 battles, trade it to add a {Dreamsign Draft} site.

### Generation analysis

Not possible as written. `data/dreamsigns.toml` contains Gold Key, Parchment, and Opal, and `src/journey/fillers/hookPayloads.ts` can make paired-return or future-shop Dreamsign promises when those names enter the selected Dreamsign pool by random chance. However, those hooks trade Dreamsigns for other Dreamsigns plus generic rewards, not for 250 essence, a Legendary-rarity card, or a route edit; `src/journey/fillers/routeEditCatalog.ts` also has no `Dreamsign Draft` route site, only `Dreamsign Offering` and `Dream Journey`.

## Repeating Bell

- Gain {Bell}. After it triggers 3 times, duplicate a chosen event.
- Gain {Hourglass}. After it triggers 5 times, transform it into {Butterfly Wings}.
- Gain {Belladonna}. It triggers twice per battle for 2 battles, then dissolves.

### Generation analysis

Not possible to generate semantically. Bell, Hourglass, Butterfly Wings, and Belladonna exist in `data/dreamsigns.toml`, so exact named references could only appear if content resolvers in `src/journey/effects.ts` select those Dreamsigns from the current pool by chance. The natural fillers in `src/journey/fillers/hookPayloads.ts` and `src/journey/fillers/shapeFills.ts` support delayed rewards, paired returns, temporary Dreamsign grants, and card duplication, but they do not count a named Dreamsign's own triggers three or five times, transform one exact Dreamsign into another, or apply a twice-per-battle temporary trigger rule that then dissolves.

## Atlas Needle

- Replace a {Draft} site with a {Dreamsign Draft} site.
- Replace a {Shop} site with a {Purge} site and gain 1 omen.
- Add a {Dream Journey} site to the current dreamscape. Gain 1 {Nightmare}.

### Generation analysis

Not possible as a complete journey. `src/journey/fillers/routeEditCatalog.ts` can randomly create route edits such as replacing Shop with Purge or adding Dream Journey to the current dreamscape, and `src/journey/fillers/timedWindowPayloads.ts` has a temporary Shop-to-Purge replacement. But the route site enum in `routeEditCatalog.ts` has no `Dreamsign Draft` site, and the route-edit fillers do not bundle those route changes with omen rewards or Nightmare burdens; adding those resource/bane side effects would require a new combined payload or value adjustment.

## Narrow Reservoir

- Gain 220 essence. Lose 80 maximum essence.
- Increase maximum essence by 120. Gain 1 {Nightmare}.
- Spend all essence. Gain {Essence Vial}.

### Generation analysis

Not possible to generate semantically with the current command. `src/journey/effects.ts` has an `essence-cap` template for increasing max essence, but no max-essence loss effect, and `src/journey/fillers/shared.ts` `costSlots` only emits fixed payable essence or omen costs, not "spend all essence"; `data/dreamsigns.toml` does contain {Essence Vial}, but normal content resolvers only draft or temporarily grant selected Dreamsigns rather than making this exact named permanent grant. The 220 essence value would also need a minor value-band change, since `rewardSlots` uses 300/320/340 and sequential rewards use 90/110/130.

## Broken Victory

- For 3 battles, battles end at 15 points.
- For 3 battles, both players start battles with 5 energy.
- For 3 battles, both players begin battles with 7 cards.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/timedWindowPayloads.ts` and the `battle_window` family in `src/journey/fillers/treeBuilders.ts` can make "next 3 battles" modifiers, but their cataloged effects are extra opening-hand cards, turn-1 energy, Event Fast/Reclaim, and similar player-side modifiers. There is no effect or operation for changing battle-end points, setting both players to 5 starting energy, or setting both players to 7 starting cards.

## Held Breath

- Gain 80 essence now.
- After your next victory, gain 170 essence.

### Generation analysis

Close, but not currently generatable as written. `src/journey/fillers/shapeFills.ts` has `now_vs_later` for an immediate reward against a larger delayed reward, but that shape only chooses next-dreamscape or two-dreamscape timing; `reward_after_trigger` can use `after_next_victory`, but both options are delayed hooks rather than a now-vs-later pair. The essence numbers would also need a minor value modification, since the built-in immediate essence path is 100 or the larger `rewardSlots` amounts.

## Bottomless Bowl

- Pay 20 essence. Gain 1 omen.
- Pay 45 essence. Gain 2 omens.
- Pay 80 essence. Gain 3 omens.

### Generation analysis

Possible only as a decision-tree pattern, and only by random chance. `src/journey/fillers/treeBuilders.ts` `buildEscalatingRewardChainTree` can pick the omen reward family from `treeRewardFamily`, and its standard essence-cost progression plus `costShift` can line up as 20, 45, and 80 while `omenProgression` yields 1/2/3. The rendered command output would still be a `Decision Tree` with stop/take branches from `src/render/human.ts`, not three flat root options.

## Dreamsign Brink

- Gain a random Dreamsign.
- Push once: 35% chance to lose the offer; otherwise choose 1 of 3 Dreamsigns.
- Push twice: 60% chance to gain {Despair}; otherwise gain 2 Dreamsigns.

### Generation analysis

Not possible to generate semantically. `src/journey/fillers/treeBuilders.ts` `buildPushYourLuckTree` can choose a Dreamsign-draft reward family and can randomly choose {Despair} as the single failure Bane, but its push chances come from `chanceProgression` and its Dreamsign rewards are "choose 1" drafts rather than random Dreamsign gains or gaining 2 Dreamsigns. If {Despair} appears, it is a shared failure Bane for the whole push tree by random seed, not a named second-push-only pattern.

## Returning Lantern

- Seal {Ginger Root}. Later, recover it and gain 120 essence.
- Seal {Cloud Lens}. Later, recover it and purge a chosen card.
- Seal {Leather Satchel}. Later, recover it and duplicate a chosen card.

### Generation analysis

Not possible to generate as written. `pairedReturnHookFill` in `src/journey/fillers/hookPayloads.ts` can create remembered return hooks, but its sealed-object branch seals catalog cards, while Dreamsign handling is a borrowed/trade pattern rather than three sealed Dreamsigns that later recover for different rewards. The exact Dreamsign names exist in `data/dreamsigns.toml`, so those objects could be referenced by chance elsewhere, but this three-option sealed/recovered pattern is outside the current filler logic and `paired_return` only emits two root options.

## The Unspent Hand

- For 3 battles, players keep unspent energy between turns.

### Generation analysis

Not possible to generate as written. `timedWindowMenuFill` and `battleWindowOptions` in `src/journey/fillers/timedWindowPayloads.ts` can produce next-3-battles modifiers, but the catalog is limited to event Fast, opening hand cards, turn-1 energy, first Event Reclaim, and turn-2 cards. `data/dreamsigns.toml` does contain a Dreamsign whose rules conserve energy between turns, but the journey generator would need to grant or reference that object rather than create this standalone players-wide rule.

## Prismatic Debt

- Transfigure every eligible card; you can no longer gain essence.
- Duplicate cards freely; your deck must contain exactly 60 cards.

### Generation analysis

Not possible to generate as written. `CARD_OPERATION_CATALOG` in `src/journey/fillers/cardOperationCatalog.ts` supports transfiguring or duplicating chosen targets, but not every eligible card or unrestricted duplication. The status/debug payloads can express some persistent rules and a deck-size floor, but `statusRewardReplacementOptions` in `src/journey/fixtures/debug/environment.ts` uses an exact 30-card requirement and there is no current operation for "can no longer gain essence" or an exact 60-card deck mandate.

## Moon Market

- Buy {Witch Hat} for 2 omens.
- Buy {Black Cat} for 2 omens.
- Buy {Skull Dagger} for 2 omens.

### Generation analysis

Not possible to generate exactly. The named objects exist in `data/dreamsigns.toml`, and the `dreamsign/named-dreamsign-shop-row` debug payload can create named Dreamsign purchase rows through `namedDreamsignShopRowOptions` in `src/journey/fixtures/debug/dreamsign.ts`; getting this exact trio would only happen by deterministic shuffle/seed chance. The blocker is price semantics: that fixture hard-codes essence, 1 omen, essence, while normal `shop_row` in `src/journey/fillers/shapeFills.ts` uses 15/20/25 essence, so 2 omens on all three rows would need a cost-slot/value change.

## Three Masks

- Draft 1 of 4 characters.
- Draft 1 of 4 events.
- Draft 1 of 4 fast cards.

### Generation analysis

Not possible to generate as a complete three-row menu. `cardDraftText`, `CARD_DRAFT_CHOICE_COUNT`, and `CARD_DRAFT_PROFILES` in `src/journey/fillers/shared.ts` can produce "Draft 1 of 4 characters" and "Draft 1 of 4 events", with a narrower "fast characters" profile rather than fast cards. The current reward-slot menus in `rewardSlots` only expose up to two card-draft reward slots in a generated menu and mix in omens/transfigurations, so this exact symmetric trio is outside the current generator except for individual rows appearing separately by chance.

## One Card, Three Fates

- Purge {Sign of Arrival}.
- Duplicate {Glimpse of Infinity}.
- Apply {Golden Transfiguration} to {Worlds Await}.

### Generation analysis

Not possible to generate semantically with the current production filler. The card-operation shapes in `src/journey/fillers/shapeFills.ts` use `one_target_many_operations` for one generic chosen-card target or `one_operation_many_targets` for one shared operation, while `src/journey/fillers/cardOperationCatalog.ts` only exposes duplicate for the one-operation-many-targets topology. The named cards exist in `data/cards.toml`, but production rendering does not select this three-card named pattern; exact named starter-card/debug fixtures in `src/journey/fixtures/debug/card.ts` are separate QA payloads and still do not line up with these names and operations.

## Trial Of Windows

- For 3 battles, both players' characters enter with +1 spark.
- For 3 battles, both players draw 1 extra card each turn.

### Generation analysis

Not possible to generate as written. `src/journey/fillers/timedWindowPayloads.ts` can create shared battle windows for 2, 3, or 4 battles via `timedWindowMenuFill`, but the battle entries are Event Fast, opening-hand draw, turn-1 energy, Event Reclaim, or turn-2 draw. There is no filler or effect catalog entry for both players' characters entering with spark or for both players drawing an extra card every turn.

## Atlas Locksmith

- Replace a {Draft} site with a {Purge} site.
- Replace an {Essence} site with a {Transfiguration} site.
- Add a {Dreamsign Offering} site to the current dreamscape.

### Generation analysis

Not possible to generate exactly, though two of the route ideas are in reach by chance. `src/journey/fillers/routeEditCatalog.ts` can produce `replace_site` from `Draft` to `Purge` and `add_site` for `Dreamsign Offering` in `current_dreamscape`, and `src/journey/fillers/shapeFills.ts` wires those through `alter_dreamscapes`. The current site catalog omits `Essence` entirely, and the production `alter_dreamscapes` fill requests only two route rewards, so this three-option locksmith pattern cannot be produced without extending the route site/value catalog and fill count.

## Waking Cache

- Gain {Beacon of Tomorrow}. Add {Despair} after your next battle.
- Gain {Scrap Reclaimer}. Add {Nightmare} after your next battle.
- Gain {Evacuation Enforcer}. Add {Oblivion} after your next battle.

### Generation analysis

Not possible to generate semantically. The named cards exist in `data/cards.toml` and the Bane names are allowed by `BANE_NAMES` in `src/journey/effects.ts`, but production reward slots in `src/journey/fillers/shared.ts` draft cards or grant resources rather than naming these three card gains. Delayed hooks in `src/journey/fillers/hookPayloads.ts` and `reward_after_trigger` in `src/journey/fillers/shapeFills.ts` store future rewards, while Bane burdens from `baneBurdenSlot` are immediate costs/burdens, not "add this Bane after next battle" paired with a named card reward.
