## Violet Survey

- Draft 1 of 4 cards.
- Gain 80 essence.
- Purge a random Bane.

### Journey Command Generation Analysis

Not possible to generate. `fillers.ts` can emit generic card drafts and `Gain 80 essence.` appears in the prize-ladder stop profile, but no filler emits `Purge a random Bane`; the only Bane purge effect template is chosen-Bane cleanup, and validation requires tracked Banes in state.

## Equal Shadow

- Gain 1 {Nightmare}. Gain {Ginger Root}.
- Gain 1 {Nightmare}. Draft 1 of 4 cards.
- Gain 1 {Nightmare}. Add a {Purge} site to the current dreamscape.

### Journey Command Generation Analysis

Not possible to generate. `costSlots()` can make each option start with `Gain 1 Nightmare.`, and rewards can include `Draft 1 of 4 cards.` or a route replacement to a Purge site by random seed/chance, but the generator does not emit named Dreamsign gains such as `{Ginger Root}`; `data/dreamsigns.toml` contains Ginger Root, while journey options only use generic Dreamsign drafts.

## Three Doors of Glass

- Pay 35 essence. Draft 1 of 4 spirit animals.
- Pay 70 essence. Draft 1 of 4 warriors.
- Pay 110 essence. Draft 1 of 4 survivors.

### Journey Command Generation Analysis

Not possible to generate. The card draft profiles for spirit animals, warriors, and survivors exist, but active root fillers do not produce this exact escalating paid trio: `same_reward_different_costs` uses 20/30/45 essence, while the escalating chain uses one repeated profile and smaller cost ladders. A minor essence-value change alone would not cover the profile ordering.

## Locksmith Counter

- Purge a chosen starter card.
- Apply {Viridian Transfiguration} to a chosen starter card.
- Replace a chosen starter card with 1 of 4 events.

### Journey Command Generation Analysis

Not possible to generate. The code supports starter cleanup, Viridian as a standard transfiguration, and event drafts, but no filler combines three operations on a chosen Starter target this way; `one_target_many_operations` targets eligible draft cards, and there is no generated option that replaces a chosen starter card with an event draft.

## Curator's Shelf

- Buy {Ginger Root} for 85 essence.
- Buy {Cloud Lens} for 85 essence.
- Buy {Leather Satchel} for 85 essence.

### Journey Command Generation Analysis

Not possible to generate. Those three Dreamsign names exist in `data/dreamsigns.toml`, but `shop_row` builds `Pay 15/20/25 essence.` options from generic reward slots and never emits `Buy {DreamsignName}` text or named Dreamsign rewards; a seed can only affect reward/order selection, not make these names appear.

## First Orchard

- Draft 1 of 4 cards with an "abandon" ability.
- Gain {Glow Pouch}.
- Apply {Viridian Transfiguration} to a chosen starter card.

### Journey Command Generation Analysis

Not possible to generate. `cardDraftText` can print "Draft 1 of 4 ..." for fixed profiles, but the filler profiles do not include an Abandon predicate; Dreamsign rewards print only `Choose 1 of N Dreamsigns`, so `{Glow Pouch}` from `data/dreamsigns.toml` cannot appear as a named gain; Viridian-to-starter is possible by seed in `one_operation_many_targets`, but not enough to make the whole example.

## Forked Remedy

- Purge 2 chosen starter cards.
- Gain 1 {Nightmare}. Duplicate a chosen card.

### Journey Command Generation Analysis

Not possible to generate. The generator can create `starterCleanup(2)` only inside the escalating chain text with an added omen reward, and it can create `Gain 1 Nightmare.` as a cost prefix or `Duplicate a chosen card.` as a separate `one_operation_many_targets` option, but no filler combines Nightmare gain with card duplication.

## One Card, Three Masks

- Apply {Viridian Transfiguration} to {Glimpse of What Was}.
- Apply {Bronze Transfiguration} to {Glimpse of What Was}.
- Apply {Golden Transfiguration} to {Glimpse of What Was}.

### Journey Command Generation Analysis

Not possible to generate. `mirrored_operations` can emit the three-mask structure, but its transfiguration order is fixed as Bronze, Viridian, Golden and the target text is `a chosen card`; although `{Glimpse of What Was}` exists in `data/cards.toml`, generated Journey option text does not name that target.

## Dreamsign Loom

- Transform a chosen Dreamsign into 1 of 3 Dreamsigns.
- Duplicate a chosen Dreamsign.
- Purge a chosen Dreamsign. Gain 2 omens and choose 1 of 2 Dreamsigns.

### Journey Command Generation Analysis

Not possible to generate. `effects.ts` defines Dreamsign transformation vocabulary, but `fillers.ts` only generates Dreamsign draft rewards such as `Choose 1 of 2 Dreamsigns` or `Choose 1 of 3 Dreamsigns and gain 2 omens`; there are no generated Dreamsign transform, duplicate, or purge operations.

## One Blessing, Three Vessels

- Apply {Scarlet Transfiguration} to {Aspiring Guardian}.
- Apply {Scarlet Transfiguration} to {Tranquil Duelist}.
- Apply {Scarlet Transfiguration} to {Nocturne Strummer}.

### Journey Command Generation Analysis

Not possible to generate. The named cards exist in `data/cards.toml`, and Scarlet is in the standard transfiguration vocabulary, but `one_operation_many_targets` chooses from Bronze, Viridian, Prismatic, and Golden and renders generic targets; other Scarlet uses target a drafted or random card rather than three specific named vessels.

## Thin Air

- Lose 120 essence.
- Lose 2 omens.
- Gain 2 copies of {Despair}.

### Journey Command Generation Analysis

Not possible to generate. `choose_your_loss` can offer `Pay {essenceLoss} essence.`, `Lose 1 omen.`, and `Gain 1 {baneName}.`; its bane list can pick Despair, but the code never emits `Lose 2 omens` or 2 copies of a Bane, and the comparable essence loss for Despair/omen choices would be around 90 rather than 120.

## Priced Silence

- Pay 90 essence. Purge a chosen card.
- Leave.

### Journey Command Generation Analysis

Not possible to generate. Refusal shapes can emit a leave option, but generator costs are clamped to available slots such as 15/20/25, 35/45/55, 30, or 50 essence in `fillOptions()` and tree builders; purge rewards are `Purge up to ... chosen Starter card`, not an unrestricted chosen card, and no generated offer pairs that with a 90 essence price.

## Cursed Star

- Gain {Witch Hat}. 45% chance to gain 1 {Nightmare}.
- Leave.

### Journey Command Generation Analysis

Not possible to generate. `risk_or_skip` can create a reward with a 35/50/65% downside chance and `Leave with no effect.`, and Nightmare is a supported Bane, but reward text never names a specific Dreamsign: Dreamsign rewards are generic `Choose 1 of N Dreamsigns` drafts from the pool even though `Witch Hat` exists in `data/dreamsigns.toml`.

## Veiled Cache

- Pay 60 essence. Roll for 160 essence, 2 omens, or {Tarot Card}.
- Pay 60 essence. Roll for a random Bane purge, draft 1 of 4 cards, or {Curved Blade}.

### Journey Command Generation Analysis

Not possible to generate. The implemented random shapes use fixed visible pools or precommitted reward text such as `Randomly gain one...` and prices like 35/45/55 or 30/50 essence; they do not render `Roll for` option text from the catalog template, do not use 60 essence costs, and never name specific Dreamsign outcomes like Tarot Card or Curved Blade.

## Sleeping Contract

- Gain {Dead Rat}.
- After 2 victories, gain {Essence Vial}.

### Journey Command Generation Analysis

Not possible to generate. Delayed shapes can use `After next victory`, `After next battle`, `At the next dreamscape`, or `In 2 dreamscapes`, but `timingSlots()` has no `After 2 victories` text; also, Dreamsign rewards are generated as generic drafts rather than specific names such as Dead Rat or Essence Vial.

## Winchime Promise

- After you visit a {Purge} site, gain {Dragon Egg}.
- After you visit a {Transfiguration} site, gain {Eye Amulet}.

### Journey Command Generation Analysis

Not possible to generate. `data/dreamsigns.toml` contains both Dragon Egg and Eye Amulet, but `src/journey/fillers.ts` only emits generic Dreamsign drafts from `dreamsignDraftText()` and delayed triggers from `timingSlots()` such as after next battle/victory/dreamscape; no filler grants a named Dreamsign after visiting a Purge or Transfiguration site.

## Current Map Ink

- Replace a {Draft} site with a {Purge} site in the current dreamscape.
- Replace a {Draft} site with a {Transfiguration} site in the current dreamscape.
- Replace a {Draft} site with a {Dreamsign Offering} site in the current dreamscape.

### Journey Command Generation Analysis

Not possible to generate. The `alter_dreamscapes` filler can emit current Draft to Transfiguration, future Draft to Dreamsign Offering, and Shop to Purge replacements, but it slices the shuffled route rewards to two options and has no current Draft to Purge or current Dreamsign Offering option without modifying the route replacement definitions.

## Toll Cabinet

- Pay 25 essence. Purge a chosen starter card.
- Pay 25 essence. Apply {Viridian Transfiguration} to a chosen card.
- Pay 25 essence. Choose 1 of 3 Dreamsigns.

### Journey Command Generation Analysis

Not possible to generate. A shared 25 essence cost can occur by chance in `same_cost_different_rewards`, and Viridian plus `Choose 1 of 3 Dreamsigns.` are legal filler outputs, but starter cleanup is authored as `Purge up to 1 chosen Starter card. Gain 4 omens.` and the shared-cost reward slots apply Transfigurations to a random deck card or drafted card, not a chosen card.

## Bounded Wheel

- Roll for 150 essence, {Flash Powder}, a random Bane purge, or 1 {Nightmare}.
- Pay 1 omen. Roll twice and keep one result.

### Journey Command Generation Analysis

Not possible to generate. Flash Powder exists in `data/dreamsigns.toml`, but no filler grants named Dreamsigns; random pools in `src/journey/fillers.ts` use fixed essence values like 40, 60, 75, and 90, generic Dreamsign drafts, starter cleanup, or Transfigurations, and there is no generated Bane purge or "roll twice and keep one" option.

## Lantern Budget

- Gain 90 essence.
- Gain 35 maximum essence.
- Set essence to 60% of your maximum essence.

### Journey Command Generation Analysis

Not possible to generate. The command can emit `Gain 90 essence.` through random-pool summaries, but `src/journey/fillers.ts` never authors the `essence-cap` catalog effect from `src/journey/effects.ts`, and there is no filler or effect for setting current essence to a percentage of maximum essence.

## Omen Ledger

- Gain 2 omens.
- Pay 1 omen. Draft 1 of 4 fast cards.
- Pay 2 omens. Choose 1 of 3 Dreamsigns.

### Journey Command Generation Analysis

Not possible to generate. `fillers.ts` can emit omen rewards and a "Lose 1 omen." cost, but root options never cost 2 omens and the card-draft templates use fixed labels such as "fast characters" with 4 choices, so this exact option set would require text/effect changes rather than a seed.

## Thorned Cleanup

- Purge up to 2 chosen starter cards.
- Purge a chosen Bane and gain a random non-Bane replacement.
- Purge {Nightmare}. Gain 70 essence.

### Journey Command Generation Analysis

Not possible to generate. The generator has starter cleanup templates, but the only 2-starter version also adds 2 omens, and no filler emits Bane-purge or non-Bane replacement options; `Nightmare` exists in the Bane vocabulary/data, but the command only generates it as a burden, not a named purge target.

## Eight Windows

- Draft 1 of 4 cards with a "discard" ability.
- Take any number of warrior cards from 5 choices.
- Gain 2 random event cards.

### Journey Command Generation Analysis

Not possible to generate. Card draft choice count is fixed at 4 and legal profiles include labels like warriors/events plus Reclaim, Dissolve, Fast, and Materialized filters, not a discard-ability filter; the `take_any_number` shape offers up to 2 rewards from a cache, not any number of warrior cards from 5 choices.

## Sign Between Bells

- Gain {Rainbow Horn}.
- Gain a random quest Dreamsign.
- Choose 1 of 3 battle Dreamsigns.

### Journey Command Generation Analysis

Not possible to generate. `Rainbow Horn` is present in `data/dreamsigns.toml`, but generated option text does not name specific Dreamsigns; it emits generic Dreamsign drafts from the pool, and Dreamsign data/code use kinds such as tidal or neutral rather than quest or battle.

## Green Knife

- Apply a transfiguration of your choice to a chosen card.
- Apply {Viridian Transfiguration} to 2 chosen starter cards.
- Apply {Golden Transfiguration} to {Ethereal Trailblazer}.

### Journey Command Generation Analysis

Not possible to generate. The transfiguration shapes can randomly offer fixed names such as Bronze, Viridian, and Golden, and a seed can produce that internal order by chance, but option text targets "a chosen card" or "a chosen Starter card"; `Ethereal Trailblazer` exists in `data/cards.toml`, yet the command does not generate named card targets in option text.

## Unsorted Change

- Apply {Scarlet Transfiguration} to 2 random character cards.
- Transfigure 3 random starter cards.
- Transfigure all cards in your deck. Gain 1 {Nightmare}.

### Journey Command Generation Analysis

Not possible to generate. `STANDARD_TRANSFIGURATIONS` includes Scarlet and fillers can emit `Apply {Scarlet Transfiguration} to a chosen card` or random/deck transfiguration rewards by seed, but no filler targets 2 random character cards, 3 random starter cards, or all cards in your deck with a Nightmare burden.

## Starter Door

- Choose a starter card to transform into {Aspiring Guardian}.
- Purge a random starter card and gain a random low-cost replacement.
- Purge all starter cards and replace them with new starter cards.

### Journey Command Generation Analysis

Not possible to generate. `data/cards.toml` contains {Aspiring Guardian}, and fillers can purge chosen Starter cards, but `fillers.ts` emits generic drafts/cleanup rather than named card replacement text, random Starter purge, or replacing all Starter cards.

## Map Fold

- Add a {Dreamsign Offering} site to this dreamscape.
- Add a {Transfiguration} site to the next dreamscape you visit.
- Increase future {Shop} site chance by 30%.

### Journey Command Generation Analysis

Not possible to generate. `SITE_TYPES` includes Dreamsign Offering, Transfiguration, and Shop, and `alter_dreamscapes` can replace Draft/Shop sites with Dreamsign Offering or Transfiguration by random seed, but it emits replacement route edits, only two root options, and no future Shop chance modifier.

## Echo Table

- Duplicate a chosen card.
- Create 2 duplicates of {Moonlit Voyage}.
- Draw 4 cards from your deck and duplicate one of them.

### Journey Command Generation Analysis

Not possible to generate. `one_operation_many_targets` can randomly choose the duplicate operation and emit `Duplicate a chosen card`, but named card duplication is not emitted; {Moonlit Voyage} exists in TOML but fillers do not generate specific card names in option text, and there is no draw-4-then-duplicate template.

## Ink Reassignment

- Modify {Moonlit Voyage}'s text to reference characters.
- Change {Nocturne Strummer} to become a warrior.
- Make a chosen event Fast.

### Journey Command Generation Analysis

Not possible to generate. Fillers can emit `Add Fast to a chosen card` with an Event target predicate by seed, and both named cards exist in TOML, but generated option text does not name {Moonlit Voyage} or {Nocturne Strummer}, does not rewrite arbitrary rules text, and cannot change a card subtype to warrior.

## Quickening Spill

- Change {Beacon of Tomorrow} to have Fast.
- Change 2 random cards to have Fast.
- Modify 3 random cards to become events.

### Journey Command Generation Analysis

Not possible to generate. `data/cards.toml` contains {Beacon of Tomorrow}, and `src/journey/fillers.ts` can emit `Add Fast to a chosen card.` or make all event cards Fast for the next 3 battles, but fillers do not put named card targets in option text, do not target exactly 2 random cards for Fast, and do not rewrite cards into Events.

## First Breath

- Draw 1 additional card in your opening hand for 3 battles.
- Draw 2 additional cards in your next battle.
- Gain {Hair Lock} for 2 battles.

### Journey Command Generation Analysis

Not possible to generate. `src/journey/fillers.ts` can generate the +1 opening-hand battle-window modifier for the next 3 battles, but it has no +2 cards in the next battle effect and does not generate named Dreamsign gain text such as {Hair Lock}, even though that name exists in `data/dreamsigns.toml`.

## Dreamwell Switch

- Your first Dreamwell draw produces +1 energy for 3 battles.
- Shuffle 2 bonus Dreamwell cards into your Dreamwell for 2 battles.
- Upgrade your lowest-phase Dreamwell card for 3 battles.

### Journey Command Generation Analysis

Not possible to generate. The actual filler effects cover card drafts, essence, omens, Dreamsign choices, transfigurations, route edits, and a small set of battle-window modifiers; there is no Dreamwell effect vocabulary or option text in `src/journey/fillers.ts`.

## Shop Courtesy

- Shop rerolls are free for 2 dreamscapes.
- The next 2 items you purchase from shops are free.
- Gain essence up to your maximum before the next shop.

### Journey Command Generation Analysis

Not possible to generate. The `shop_row` filler in `src/journey/fillers.ts` generates paid offers like `Pay 15/20/25 essence`, and route effects can replace Shop sites, but the command does not emit free shop rerolls, free future purchases, or a next-shop essence restoration trigger.

## Pool Compass

- Remove neutral Dreamsigns from the pool.
- Gain a copy of a chosen Dreamsign.

### Journey Command Generation Analysis

Not possible to generate. `src/journey/fillers.ts` can generate generic Dreamsign draft choices from the pool, while `src/journey/effects.ts` can resolve Dreamsign predicates including `kind = "neutral"` from `data/dreamsigns.toml`; no filler removes neutral Dreamsigns from the pool or gains a copy of a chosen Dreamsign.

## Promise Card

- Gain {Moonlit Voyage}. Once you play it 4 times, gain 120 essence.
- Gain {Ginger Root}. Once it triggers 3 times, gain 2 omens.
- Once you play {Aspiring Guardian} 5 times, duplicate it.

### Journey Command Generation Analysis

Not possible to generate. The data contains Moonlit Voyage, Ginger Root, and Aspiring Guardian, but `src/journey/fillers.ts` emits generic card/Dreamsign drafts and delayed triggers like "After next battle" or "After next victory"; it does not generate named gains or "play/trigger it N times" promises.

## Split Signal

- Merge 2 chosen cards into a combined card.
- Split a chosen card with multiple abilities into separate cards.
- Make a chosen event become the materialized ability of a character.

### Journey Command Generation Analysis

Not possible to generate. The operation shapes in `src/journey/fillers.ts` can apply standard Transfigurations, add Fast/Reclaim, reduce cost, or duplicate a target, but there is no merge operation, ability-splitting operation, or event-to-Materialized rewrite.

## Omen-Fed Prism

- Pay 2 omens. Draft 1 of 4 dissolve events.
- Pay 60 essence. Gain {Spice Blossoms}.
- Pay 20% of your essence. Apply {Viridian Transfiguration} to a chosen card.

### Journey Command Generation Analysis

Not possible to generate. The filler can randomly choose dissolve-event drafts and Viridian Transfiguration, and Spice Blossoms exists in `data/dreamsigns.toml`, but generated omen costs are 1 omen, percentage essence costs are not emitted, and Dreamsign rewards are generic "Choose 1 of N Dreamsigns" rather than a specific named gain.

## Hollow Treasury

- Pay maximum essence. Gain {Pyramid Relic}.
- Pay all remaining essence. Gain {Gold Key} and 2 omens.
- Pay 40-100 essence at random. Draft 1 of 4 event copying cards.

### Journey Command Generation Analysis

Not possible to generate. Pyramid Relic and Gold Key exist in `data/dreamsigns.toml`, but `src/journey/fillers.ts` generates fixed essence prices or visible odds, not "maximum/all remaining/random 40-100" costs, and it only drafts generic event profiles rather than named Dreamsign gains or an event-copying card profile.

## Withered Orchard

- Battle essence rewards are reduced by 25%. Gain {Green Beetle}.
- Essence site rewards are reduced by 40. Gain a legendary card.
- Essence site rewards are reduced by 20%. Purge a chosen starter card.

### Journey Command Generation Analysis

Not possible to generate. Green Beetle exists in `data/dreamsigns.toml`, and starter cleanup can be generated when starters remain, but the filler catalog has no battle/site essence reward reduction burdens, no named Green Beetle gain, and no legendary-rarity draft or gain option.

## Scissor Saint

- Purge {Nocturne Strummer}. Gain {Charm Bracelet}.
- Purge a random character. Draft 1 of 4 survivors.
- Purge a chosen Dreamsign. Apply {Golden Transfiguration} to a chosen card.

### Journey Command Generation Analysis

Not possible to generate. `fillers.ts` can draft 1 of 4 survivors and apply standard transfigurations like Golden to a chosen card, with seed-dependent option order, but it has no named card purge, named Dreamsign gain, random character purge, or chosen Dreamsign purge option text; `{Nocturne Strummer}` and `{Charm Bracelet}` exist in `data/*.toml` but are not emitted in those templates.

## Molting Archive

- Transform {Black Cat} into a random Dreamsign. Gain 90 essence.
- Transform {Glimpse of What Was} into a random card. Gain {Ginger Root}.
- Gain 3 random energy generation cards. Purge a chosen card.

### Journey Command Generation Analysis

Not possible to generate. The effect catalog defines Dreamsign transformation, and `Black Cat`, `Glimpse of What Was`, and `Ginger Root` exist in content data, but the actual filler builders never emit named transform text, named Dreamsign gains, random energy-generation card gains, or generic chosen-card purges; 90 essence can appear only as a resource reward by random seed/chance in sequential reward contexts.

## Bane Ledger

- Gain 1 {Nightmare}. Add a {Dreamsign Offering} to the current dreamscape.
- Gain 1 {Despair} for 3 battles. Apply {Scarlet Transfiguration} to a chosen card.

### Journey Command Generation Analysis

Not possible to generate. `fillers.ts` can emit `Gain 1 Nightmare.`, choose Despair as a bane name in some risk/loss shapes, and apply Scarlet Transfiguration by seed/chance, but route effects replace existing sites rather than add a Dreamsign Offering, and bane gains are not generated with a 3-battle duration.

## Starter Debt

- Gain 3 additional starter cards. Gain {Worm Apple}.
- Apply {Fractured Transfiguration} to a random starter card. Draft 1 of 4 events.
- Remove the transfiguration from {Nocturne Strummer}. Gain 2 omens.

### Journey Command Generation Analysis

Not possible to generate. The generator can draft 1 of 4 events and gain 2 omens in some templates, but it cannot add starter cards, emit named Dreamsign gain text for `{Worm Apple}`, use `Fractured` because `STANDARD_TRANSFIGURATIONS` only includes Viridian, Golden, Scarlet, Bronze, and Prismatic, target a random starter card, or remove an existing transfiguration from a named card.

## Stolen Verbs

- Remove Reclaim from {Moonlit Voyage}. Gain {Cauldron}.
- Remove Foresee from {Synaptic Sentinel}. Draft 2 of 4 fast cards.
- Draw 5 cards from your deck and purge one. Gain {Dragon Egg}.

### Journey Command Generation Analysis

Not possible to generate. `fillers.ts` only adds battle keywords such as Fast or Reclaim and never removes Reclaim or Foresee, `cardDraftText` always drafts 1 of 4 rather than 2 of 4, and named Dreamsign gains for `{Cauldron}` or `{Dragon Egg}` are not emitted even though those names exist in `data/dreamsigns.toml`.

## Narrow Gate

- Draw 1 fewer card in your opening hand for 4 battles. Gain {Root Staff}.
- Your opponents require 3 fewer points to win for 3 battles. Gain a legendary card.
- Your opponents gain {Curved Blade} for 2 battles. Apply {Golden Transfiguration} to a chosen card.

### Journey Command Generation Analysis

Not possible to generate. `fillOptions` can emit positive battle windows like drawing 1 extra opening-hand card for the next 3 battles and Golden Transfiguration, but it has no opponent-point or opponent-Dreamsign burdens, no 4-battle negative opening-hand window, and Dreamsign rewards are generic drafts rather than named gains like Root Staff or Curved Blade despite those names existing in `data/dreamsigns.toml`.

## Tomorrow's Knife

- After 2 battles, purge 2 random cards. Gain {Skull Pendant}.
- After each battle, purge a random character. Gain a random Dreamsign.

### Journey Command Generation Analysis

Not possible to generate. The delayed triggers in `timingSlots` are next battle, next victory, next dreamscape, or 2 dreamscapes, and the emitted purge effects are chosen Starter cleanup rather than random card or character purges; Skull Pendant is a real Dreamsign name in data, but the filler does not output named Dreamsign gains.

## Bitter Dreamwell

- Your first Dreamwell draw produces 1 less energy for 3 battles. Gain {Twisted Herbs}.
- Shuffle 3 penalty Dreamwell cards into your Dreamwell for 2 battles. Gain a legendary card.
- Shuffle 1 delayed Dreamwell card into your Dreamwell for 5 battles. Gain {Algae}.

### Journey Command Generation Analysis

Not possible to generate. The Journey effects and filler code have no Dreamwell draw, penalty Dreamwell card, or delayed Dreamwell card mechanics; Twisted Herbs and Algae exist in `data/dreamsigns.toml`, but the command only generates generic Dreamsign drafts, not those specific names.

## Vanishing Atlas

- Remove all shop sites from the Dream Atlas. Gain {Bestiary}.
- Remove all Dreamsign sites from the Dream Atlas. Transfigure all events in
  your deck.
- Purge {Draft} from the current dreamscape. Gain {Dreamsign Offering}.

### Journey Command Generation Analysis

Not possible to generate. `alter_dreamscapes` only replaces individual Draft or Shop sites with Purge, Dreamsign Offering, or Transfiguration sites, and validation restricts route effects to site replacements; it cannot remove all sites, purge a site, transfigure all events, or gain named objects like Bestiary or Dreamsign Offering.

## Sealed Hands

- You can no longer gain essence. Gain {Golden Acorn} and 4 omens.
- You can no longer modify your deck. Gain {Amanita}.
- You can no longer transfigure cards. Gain 4 legendary cards.

### Journey Command Generation Analysis

Not possible to generate. The generated option families include costs, drafts, omens, transfigurations, route replacements, and timed bonuses, but no permanent prohibitions on essence, deck modification, or transfiguration; Golden Acorn and Amanita are data Dreamsigns yet not emitted as named gains, and legendary cards are only a card rarity in data, not a generated Journey reward.

## Crooked Coin

- 50% chance to pay 120 essence. Gain {Clover}.
- 25% chance to purge a random Dreamsign. Gain {Brown Acorn}.

### Journey Command Generation Analysis

Not possible to generate. The random option fillers use bounded generic reward text such as `Pay N essence. X% chance to ...; otherwise gain nothing.` or decision-tree branches, and `rewardSlots`/`dreamsignDraftText` only emit generic `Choose 1 of N Dreamsigns.` text, not named Dreamsign gains like {Clover} or {Brown Acorn}; the 120 essence price also does not match the direct wager costs without an essence-value change.

## Borrowed Crown

- Gain {Green Amulet} for 3 battles. Then lose it and pay 100 essence.
- Gain {Wolf Sigil} for 2 battles. Then lose it and gain 1 {Nightmare}.
- Draft 2 of 4 cards for 2 battles. Then purge both cards.

### Journey Command Generation Analysis

Not possible to generate. The fillers can create next-3-battle window modifiers and delayed rewards, but they do not generate temporary named Dreamsign gain/loss text; `draftCards` fixes `takeCount: 1`, so `Draft 2 of 4 cards`, holding them for 2 battles, and purging both is outside the implemented option effects.

## Duplicate Draft

- Draft 1 of 4 cards, adding 2 copies. Gain 1 {Nightmare}.
- Draft 1 of 4 cards, adding 2 copies of each. Pay 120 essence.
- Draft 1 of 4 cards, adding 2 copies of each. Purge a random Dreamsign.

### Journey Command Generation Analysis

Not possible to generate. The card draft filler always creates a normal `Draft 1 of 4 ...` effect, while duplication appears only as a separate chosen-card operation in `one_operation_many_targets`; no filler combines a draft with adding two copies, random Dreamsign purging, or this 120 essence payment.

## Duplicate Purge

- Purge all duplicate cards. Gain {Cauldron}.
- Purge all duplicate cards. Draft 1 of 4 events and duplicate it.
- Purge all duplicate cards. Apply {Golden Transfiguration} to a chosen card.

### Journey Command Generation Analysis

Not possible to generate. The generator has starter cleanup and chosen/random card operations, but no `purge all duplicate cards` effect; {Golden Transfiguration} can appear by seed/chance from the standard transfiguration set, but not attached to duplicate purging, and named Dreamsign gain text like {Cauldron} is not emitted.

## Thorn Debt

- Gain 2 {Nightmare}. After 2 battles, transform them into {Wildflower Colossus}.
- Gain 1 {Oblivion}. After you add 3 event cards, transform it into {Avatar of Oblivion}.
- Pay 100 essence. Gain {Wildflower Colossus} now.

### Journey Command Generation Analysis

Not possible to generate. Fillers can add `Gain 1 Nightmare.` as a burden and can delay generic rewards to next battle/victory/dreamscape timings, but they do not generate `Gain 2 Nightmare`, `Gain 1 Oblivion`, bane-to-card transforms, named card gains, or the trigger `After you add 3 event cards`; the named cards exist in data but are not selected into option text by the journey fillers.

## First Thought

- Choose a cost 1 card. It appears in your opening hand for 3 battles.
- Choose a starter card. It appears in your opening hand for 3 battles and costs 1 less.
- Choose a Fast card. It appears in your opening hand next battle and gains Reclaim.

### Journey Command Generation Analysis

Not possible to generate. `fillOptions` can generate timed-window opening-hand modifiers and card rewrites such as cost reduction or Reclaim, but there is no effect or filler path that makes a chosen cost-1, Starter, or Fast card appear in the opening hand; the available opening-hand text is global battle-window text, not per-card targeting.

## Spoiled Victory

- Your next victory yields a Dreamsign draft instead of card rewards.
- Your next victory yields 220 essence instead of card rewards.
- Your next victory adds a {Transfiguration} site to the next dreamscape instead of card rewards.

### Journey Command Generation Analysis

Not possible to generate. `reward_after_trigger` and `paired_return` can attach rewards to `After next victory`, and `alter_dreamscapes` can replace a Draft site in the next dreamscape with a Transfiguration site, but route edits are filtered out of those delayed-reward shapes; essence rewards also come from fixed amounts such as 90/110/130 or 300/320/340, not 220.

## Emergency Thread

- Gain the one-time {Open Thread} status: banish your hand and draw 10 cards.
- Gain the one-time {Cinder Thread} status: dissolve 2 cards in hand and gain 3 energy.
- Gain the one-time {Sleeping Thread} status: end your turn and draw 5 cards next turn.

### Journey Command Generation Analysis

Not possible to generate. `validateJourneyManifest` rejects objects whose kind or type is `status`, and the fillers do not define one-time status rewards or any `{Open Thread}`, `{Cinder Thread}`, or `{Sleeping Thread}` TOML-backed game objects.

## Covered Cups

- Reveal 3 rewards. Choose one revealed reward.
- Reveal 5 rewards. Choose one random revealed reward and gain 1 {Nightmare}.
- Gain 1 random reward.

### Journey Command Generation Analysis

Not possible to generate. Random Journey shapes use precommitted rewards, visible-pool draws, or fixed reward slots; `fillOptions` has no reveal-N-then-choose mechanic, and the random-pool draw text is a paid sequence branch rather than a direct `Gain 1 random reward` option.

## Root Contract

- Gain {Dead Rat}. After you pay 120 essence, transform it into {Mandrake Root}.
- Pay 80 essence. Gain {Root Staff}.
- Gain {Candle}. After 3 battles, transform it into {Golden Acorn}.

### Journey Command Generation Analysis

Not possible to generate. The named Dreamsigns exist in `data/dreamsigns.toml`, but the Journey fillers only emit generic Dreamsign drafts like `Choose 1 of N Dreamsigns`; they do not emit named Dreamsign gains or named Dreamsign transformations, and generated essence costs are fixed bands such as 15/20/25, 35/45/55, or sequential ladder prices rather than this contract structure.

## Gathered Kindling

- After you add 3 event cards, apply {Azure Transfiguration} to all event cards.
- After you add 2 character cards, apply {Scarlet Transfiguration} to a chosen character.

### Journey Command Generation Analysis

Not possible to generate. `src/journey/effects.ts` limits standard transfigurations to Viridian, Golden, Scarlet, Bronze, and Prismatic, so {Azure Transfiguration} is not in the actual effect vocabulary; `src/journey/fillers.ts` can apply those transfigurations to chosen/random/drafted cards, but it does not generate "after you add N cards" trigger counters or all-event-card transfiguration text.

## Unbarred Spellbook

- Remove target restrictions from a chosen event.
- Gain 1 {Nightmare}. Permanently remove target restrictions from a chosen event.
- Remove target restrictions from all cost 2 or less events.

### Journey Command Generation Analysis

Not possible to generate. The actual filler/effect catalog has card rewrite operations like Fast, Reclaim, lower cost, duplicate, and text mutation, plus Nightmare as a bane, but `src/journey/fillers.ts` and `src/journey/effects.ts` do not define any "target restrictions" operation or permanent restriction-removal option.

## Key Ticket

- Gain {Gold Key}. At a future Shop, trade it for 250 essence.
- Gain {Parchment}. At a future {Dream Journey}, trade it for a legendary card.
- Gain {Opal}. After 2 battles, trade it to add a {Dreamsign Draft} site.

### Journey Command Generation Analysis

Not possible to generate. {Gold Key}, {Parchment}, and {Opal} are real Dreamsign names in `data/dreamsigns.toml`, but `src/journey/fillers.ts` generates Dreamsign draft choices rather than specific named Dreamsign gains or later trade hooks; `src/journey/effects.ts` also has site types for Dream Journey and Dreamsign Offering, not Dreamsign Draft, and route additions are rejected by route validation.

## Repeating Bell

- Gain {Bell}. After it triggers 3 times, duplicate a chosen event.
- Gain {Hourglass}. After it triggers 5 times, transform it into {Butterfly Wings}.
- Gain {Belladonna}. It triggers twice per battle for 2 battles, then dissolves.

### Journey Command Generation Analysis

Not possible to generate. {Bell}, {Hourglass}, {Butterfly Wings}, and {Belladonna} exist in `data/dreamsigns.toml`, but the journey fillers do not emit specific named Dreamsign gain options, trigger-count timers, Dreamsign transformation text, or temporary Dreamsign dissolution; duplication exists only as a card operation in `one_operation_many_targets`, without the Bell-style trigger condition.

## Atlas Needle

- Replace a {Draft} site with a {Dreamsign Draft} site.
- Replace a {Shop} site with a {Purge} site and gain 1 omen.
- Add a {Dream Journey} site to the current dreamscape. Gain 1 {Nightmare}.

### Journey Command Generation Analysis

Not possible to generate. `alter_dreamscapes` in `src/journey/fillers.ts` can randomly produce route replacements such as Shop to Purge or Draft to Dreamsign Offering/Transfiguration, with the exact internal order depending on seed, but it does not add the extra omen, `src/journey/effects.ts` has no Dreamsign Draft site type, and route additions are explicitly invalidated by `src/journey/validate.ts`.

## Narrow Reservoir

- Gain 220 essence. Lose 80 maximum essence.
- Increase maximum essence by 120. Gain 1 {Nightmare}.
- Spend all essence. Gain {Essence Vial}.

### Journey Command Generation Analysis

Not possible to generate. `fillOptions` can generate essence gains and `Nightmare` burdens, and `data/dreamsigns.toml` contains `Essence Vial`, but the fillers do not emit maximum-essence loss, spend-all-essence costs, or named Dreamsign gains; Dreamsign rewards are generic drafts.

## Broken Victory

- For 3 battles, battles end at 15 points.
- For 3 battles, both players start battles with 5 energy.
- For 3 battles, both players begin battles with 7 cards.

### Journey Command Generation Analysis

Not possible to generate. The `timed_window_menu` filler only emits next-3-battles modifiers such as Fast events, opening-hand +1 card, turn-1 +1 energy, starting omens, Reclaim, turn-2 cards, discounts, or dissolve energy; it does not generate battle point caps or symmetric both-player hand/energy rules.

## Held Breath

- Gain 80 essence now.
- After your next victory, gain 170 essence.

### Journey Command Generation Analysis

Not possible to generate. `now_vs_later` can pair an immediate reward with a delayed reward, but its essence-now option is hardcoded to 100 and its delay is next dreamscape or two dreamscapes; `reward_after_trigger` can use after-next-victory timing but only as delayed options, not this immediate-vs-victory pair.

## Bottomless Bowl

- Pay 20 essence. Gain 1 omen.
- Pay 45 essence. Gain 2 omens.
- Pay 80 essence. Gain 3 omens.

### Journey Command Generation Analysis

Not possible to generate. The closest code path is the `escalating_reward_chain` omen profile, which emits paid omen tiers, but its generated costs are `[20, 40, 70]` plus a 0/5/10 seed-selected shift and its final reward is 4 omens; this would need minor changes to the omen profile values.

## Dreamsign Brink

- Gain a random Dreamsign.
- Push once: 35% chance to lose the offer; otherwise choose 1 of 3 Dreamsigns.
- Push twice: 60% chance to gain {Despair}; otherwise gain 2 Dreamsigns.

### Journey Command Generation Analysis

Not possible to generate. `push_your_luck` can randomly choose `Despair` as its failure bane and can produce 35% failure odds by seed, but its reward profiles never use Dreamsign rewards; generated Dreamsign text elsewhere is generic draft text such as `Choose 1 of N Dreamsigns`, not specific gain-2-Dreamsign or named-object outcomes.

## Returning Lantern

- Seal {Ginger Root}. Later, recover it and gain 120 essence.
- Seal {Cloud Lens}. Later, recover it and purge a chosen card.
- Seal {Leather Satchel}. Later, recover it and duplicate a chosen card.

### Journey Command Generation Analysis

Not possible to generate. `commit_now_future_payoff` can create delayed "now / At the next dreamscape" options, but `fillOptions` never emits a Seal/recover operation, and dreamsign names such as Ginger Root, Cloud Lens, and Leather Satchel only exist in `data/dreamsigns.toml`, not as named option text in these delayed rewards.

## The Unspent Hand

- For 3 battles, players keep unspent energy between turns.

### Journey Command Generation Analysis

Not possible to generate. `timed_window_menu` can emit three-battle battle modifiers, but its hard-coded modifiers are extra cards, turn-1 energy, starting omens, discounts, Reclaim/Fast rewrites, and first-Dissolve energy; there is no effect for preserving unspent energy between turns.

## Prismatic Debt

- Transfigure every eligible card; you can no longer gain essence.
- Duplicate cards freely; your deck must contain exactly 60 cards.

### Journey Command Generation Analysis

Not possible to generate. The generator can apply `{Prismatic Transfiguration}` to a chosen, random, drafted, or up-to-2 chosen card and can duplicate a chosen card, but `fillOptions` has no global "every eligible card" transfiguration, no "no longer gain essence" rule, and no exact deck-size constraint.

## Moon Market

- Buy {Witch Hat} for 2 omens.
- Buy {Black Cat} for 2 omens.
- Buy {Skull Dagger} for 2 omens.

### Journey Command Generation Analysis

Not possible to generate. `shop_row` prices options as `Pay 15/20/25 essence` and uses generic reward slots; Witch Hat, Black Cat, and Skull Dagger are Dreamsign names in `data/dreamsigns.toml`, but the generated option text only offers generic `Choose 1 of N Dreamsigns`, not specific named purchases for omens.

## Three Masks

- Draft 1 of 4 characters.
- Draft 1 of 4 events.
- Draft 1 of 4 fast cards.

### Journey Command Generation Analysis

Could be generated. The `same_reward_different_costs` card-draft branch can choose profiles for characters, events, and fast characters, all rendered by `cardDraftText` as `Draft 1 of 4 ...`; that exact trio and order would depend on random seed/chance, and the actual options also include essence costs plus omen bonuses on later entries unless those reward/cost values were minorly adjusted.

## One Card, Three Fates

- Purge {Sign of Arrival}.
- Duplicate {Glimpse of Infinity}.
- Apply {Golden Transfiguration} to {Worlds Await}.

### Journey Command Generation Analysis

Not possible to generate. The operation fillers can apply a standard transfiguration to "a chosen card" and can duplicate only as one shared operation across generic targets, while purge is limited to "Purge up to 1 chosen Starter card"; the actual option text does not emit specific card names like {Sign of Arrival}, {Glimpse of Infinity}, or {Worlds Await}.

## Trial Of Windows

- For 3 battles, both players' characters enter with +1 spark.
- For 3 battles, both players draw 1 extra card each turn.

### Journey Command Generation Analysis

Not possible to generate. The timed-window menu can emit "For the next 3 battles" options, but its hard-coded effects are player-local modifiers such as opening-hand cards, turn-1 energy, starting omens, temporary card cost/reclaim changes, and Dissolve energy; it has no both-player, character-entering spark, or every-turn draw modifier.

## Atlas Locksmith

- Replace a {Draft} site with a {Purge} site.
- Replace an {Essence} site with a {Transfiguration} site.
- Add a {Dreamsign Offering} site to the current dreamscape.

### Journey Command Generation Analysis

Not possible to generate. The route-edit filler only returns two options and shuffles among Shop-to-Purge, Draft-to-Dreamsign Offering, and Draft-to-Transfiguration replacements for current or next dreamscape; {Essence} is not in the generated site-type list, and there is no add-site route edit.

## Waking Cache

- Gain {Beacon of Tomorrow}. Add {Despair} after your next battle.
- Gain {Scrap Reclaimer}. Add {Nightmare} after your next battle.
- Gain {Evacuation Enforcer}. Add {Oblivion} after your next battle.

### Journey Command Generation Analysis

Not possible to generate. Those card names exist in TOML content, and Despair/Nightmare/Oblivion are bane names, but reward fillers generate drafts, essence, omens, Dreamsign choices, transfigurations, or route edits rather than "Gain {specific card}"; future hooks delay rewards to next battle/dreamscape and cost slots only add immediate Nightmare, not delayed named banes.

