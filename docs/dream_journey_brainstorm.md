# Dream Journeys

A Dream Journey in Dreamtides is a random effect that modifies a quest in some
way. It is the home of the most dramatic effects that can change a player's
experience within a single run, and the main place where neutral or negative
effects belong (Dreamsigns and Dreamcallers are usually only positive). Journeys
are also the primary vehicle for adding Bane cards to the player's deck and for
adding battlefield slot modifications.

A Dream Journey is the Dreamtides equivalent of an event in a game like Slay the
Spire or Monster Train. The player enters a journey site, sees options with
short ability text describing they offer, and decides which to picck.

The Dream Journey site presents the player with between 1 and 3 dreams the
player can enter, with the average being 2. Each dream has associated art in a
circular frame. Hovering over one of the dreams displays a popup with a one
sentence mechanical description of its effect, and sometimes shows additional
popups describing other relevant game objects (e.g. a dream that adds a card to
the player’s deck will show the card). Each dream has a purple button to enter
that dream. In cases where only 1 dream is displayed, the choice is forced,
there is no “skip” option. Some dreams have repeated choices, e.g. they may
prompt to pick an option multiple times for a varying reward.

Unlike in other roguelike deckbuilding games, Dreamtides journeys are
procedurally generated, meaning there are millions of possible effects, no two
quests should ever face the same choices. In order to achieve this, journeys are
built up from different constituent parts:

- Simple Effects: These are the most basic atomic elements of the dream, things
  like gaining essence or adding a card to your deck. Simple effects must be
  beneficial to the player, at least in some situations.
- Costs: These are negative effects which harm the player in some way, such as
  losing essence or gaining Bane cards. Costs and simple effects can be combined
  to give the player interesting cost/benefit choices.
- Custom Cards/Dreamsigns/Transfigurations: Dream journeys are the home of the
  most strange and purpose-designed versions of things like cards, dreamsigns,
  and transfigurations. Because these don’t need to be suitable for the main
  draft pool, they can be much more experimental.
- Compound Effects: These are more complex dream abilities which don’t strictly
  make sense as part of cost + effect procedural generation, often because they
  contain internally connected positive and negative elements.
- Conditions/Triggers: Some effects give the player a “mini quest” to complete
  within the game, and don’t provide their reward until this is achieved.
- Durations: Some costs and effects are time linked, e.g. they are temporary or
  will apply in the future. Durations allow them to apply
- Predicates: Predicates are used to modify the game objects a cost or effect
  applies to in order to vary their behavior, for example “gain a warrior card”
  uses the “warrior” predicate, but could be randomized to “gain a fast event”
  instead.
- Battlefield Slot Modifications: A unique aspect of the Dreamtides grid system
  is that the battlefield can be modified by dream journey effects, giving each
  battle unique terrain to navigate. Each slot can have up to 1 modification,
  represented by an icon.
- Statuses: Dream journeys are able to create ongoing changes to the quest
  state, which can change future gameplay dramatically
- Shapes: A journey shape is a specific meta-configuration which controls the
  set of dreams presented at a dream journey site, connecting them in some
  thematically or mechanically linked way.

When designing dreamtides procedural generation, a helpful strategy to use is to
go through the events in a game like Slay the Spire and ask “is an event like
this going to happen frequently in Dreamtides?”. The events should **feel** like
a human designer manually curated them.

# Weighted Randomness

The goal of dream journey generation is absolutely **not** to take a big pool of
effects and show them to the player uniformly at random, because this isn’t fun.
The dream journey system uses procedural generation to offer experienced that
are curated in a fun way, while still having variance between quests. This needs
to be data driven via configuration files at a core level, and the “shapes”
system below is a major component of the weighting here.

There’s a lot of aesethetic judgment in generating good events. Something like
“Draft a card from 20 choices” is a cool event because it has kind of a “wow”
factor in a way that “Draft 2 cards from 19 choices” doesn’t, even if the later
is probably actually more powerful. In a similar way “lose all your essence to
do an amazing effect” is better game design than “lose 90% of your essence”. The
system needs to capture this emotional resonance.

In similar way, aesthetics are very important in presenting costs and effects.
It’s desirable to have a good percentage of dream journeys have some internal
symmetry, such as “do one of these 3 things to this card”, or “pay the same cost
for these different effects”, or “pick one of these 3 dreamsigns but lose
maximum essence”, or “pick one of these characters with the scarlet
transfiguration”.

Picking costs and effects purely at random has a place, but it shouldn’t be the
majority. Generally when showing 3 options it’s good to have some form of
symmetry. Totally mechanically unrelated choices are good to reserve for cases
when only 2 options are shown.

# Hidden Information

Dream Journeys show a mechanical description on hover, such as “Red Dusk: Purge
3 random cards.”. Our contract with the player is that they should understand
what will happen when they pick this option, but it’s fine for the level of
information shown to vary. Text like “Purge a random card”, “Purge a chosen
card”, or “Purge Aspiring Guardian” all have very different game effects, and
most random effects can be altered by making the random selection *in advance*
(and thus showing the player the result) or making it afterwards.

Sometimes we present players with choices that are explicit in the dreams
offered themselves (e.g. we show 3 dreams, each has a known card the player will
receive) and sometimes the choices are the effect of entering a given dream
(e.g. enter this dream and you will pick one of 3 cards).

# Matching Costs and Effects

Not all costs and effects are equivalent in scope, and it’s very easy to get
“obviously stupid” results like “pay 10 essence, transfigure every card in your
deck” or “pay 500 essence to purge a chosen card”. In order to prevent this,
costs and effects are tagged with an “effect size” rating, and paired up
accordingly.

# Overlap with Dreamsigns

Dream Journeys and Dreamsigns have some overlap in what they can do. Generally,
any kind of persistent benefit which applies to the player should be represented
by a dreamsign (which may be a journey-specific custom dreamsign). Any other
kind of neutral or negative effect is represented by a “quest status effect”, a
secondary type of ongoing modification. Positive effects which *harm the
opponent* during battles are also only available via status effects, since these
generally are not fun to have as dreamsigns.

# Out of Scope

There are a few things that Dreamtides journeys do NOT do:

- Initiate battles in any way
- Trigger off of the player losing battles (dreamtides is single-elimination by
  default)
- Allow the player to have an extremely deterministic deck as a result of a
  single journey, e.g. having 15 or fewer cards or strongly controlling their
  starting hand
- Directly apply ongoing player benefits instead of using a dreamsign
- Allow more than 1 dreamcaller per battle
- Show named tides to the player to pick from, or require the player to
  understand what tides are good for their deck
- Play mini games beyond sequential button clicks, such as a matching game

# Simple Effects

Simple effects are the basic building block of dream journeys. They can
optionally be combined with a cost.

- Gain X essence
- Gain maximum essence
- Set essence to X% of your maximum essence
- Gain X-Y essence (random roll)
- Gain X omens
- Purge up to X chosen {predicate} cards
- Purge up to X chosen {predicate} card and gain a random {predicate}
  replacement
- Gain X random {predicate} cards
- Draft X {predicate} cards from Y choices
- Take any number of {predicate} cards from X choices
- Gain essence up to your maximum
- Apply a transfiguration of your choice to chosen card
- Apply {transfiguration} to X chosen {predicate} cards
- Apply {transfiguration} to {card_name}
- Apply {transfiguration} to X random {predicate} cards
- Transfigure X random starter cards
- Transfigure all starter cards
- Gain X {card_name}
- Gain {custom_card_name} (card design specifically for this journey)
- Gain a random {predicate} dreamsign
- Gain {dreamsign}
- Gain {card_name} for {duration}
- Gain {dreamsign} for {duration}
- Choose 1 of X {predicate} dreamsigns
- Gain {custom_dreamsign_name}
- Gain {mutated_dreamsign} (modified version of a certain dreamsign)
- Gain X random {predicate} dreamsigns
- Gain a card from {tide}
- Draft a card from {tide}
- Immediately perform X drafts from Y choices
- Apply a random simple effect
- Purge {starter_card}
- Purge a random starter card
- Purge a random starter card and gain a {predicate} replacement
- Purge all starter cards and replace them with new starter cards
- Choose one of two packs of cards to add to your deck
- The next X cards you draft are transfigured
- Draw X additional cards in your next Y battles
- Transfigure all cards in your deck
- Add {site} to this dreamscape
- Add a {site} to the next dreamscape you visit
- Apply a custom transfiguration to a card, outside of the normal set
- Choose a starter card to transform into {card_name}
- Transform {card_name_in_deck} into {card_name}
- Transform a {predicate} card into {card_name}
- Create X duplicates of {card_name}
- Duplicate X chosen cards
- Duplicate X random {predicate} cards
- Modify {card_name}’s text to reference {card_type} (e.g. warriors ->
  survivors)
- Change {card_name} to become a {card_type}
- Modify X random cards to become {card_types}
- Purge X bane cards from your deck
- Purge all bane cards
- Change {card_name} to have fast
- Change X random cards to have fast
- Draw X cards from your deck and duplicate one of them
- Draw X cards from your deck and transfigure one of them
- Draw X more cards in your opening hand for {duration}
- Your starting dreamwell card is {positive_dreamwell_card} for {duration}
- Shuffle X {positive_dreamwell_cards} into your dreamwell for {duration}
- Shop rerolls are free for {duration}
- The next X items you purchase from sohps are free
- Add an ability to your dreamcaller
- Once you play {cardname} X times, gain some reward
- Gain a card, once you play it X times, gain some reward
- Gain a dreamsign, once you trigger it X times, gain some reward
- Merge two cards into a combined card which plays both of them
- Split a card with multiple abilities into multiple cards with each of the
  abilities
- Make one of your events become the materialized ability of a character
- Gain the ability of a second dreamcaller as a special dreamsign
- Gain {simple effect} for {duration}, e.g. gain a dreamsign after each of the
  next 3 battles
- Change your dreamcaller
- Gain a copy of a dreamsign
- Duplicate your dreamcaller’s effect
- Remove {tide} from the draft pool
- Remove {predicate} dreamsigns from the pool, e.g. all neutral dreamsigns
- X% higher chance to see {site} in future dreamscapes
- Pick one of the 4 the best cards for your dreamcaller in the card pool
- Transfigure {dreamwell_card} in your dreamwell to have a better effect

# Costs

Costs provide some downside associated with a reward.

- Pay X essence
- Pay X omens
- Pay maximum essence
- Pay X-Y essence (random roll)
- Pay X% of your essence
- Pay all remaining essence
- Essence site rewards are reduced by X
- Essence site rewards are reduced by X%
- Battle essence rewards are reduced by X
- Battle essence rewards are reduced by X%
- Purge {card_name}
- Purge a random {predicate} card
- Purge a chosen {predicate} card
- Purge {dreamsign}
- Purge a random {predicate} dreamsign
- Purge a chosen dreamsign
- Gain X random {predicate} cards from the card pool
- Transform {card_name} into a random card from the pool
- Transform {dreamsign} into a random dreamsign from the pool
- Gain X random banes
- Gain X {bane_name}
- Gain X {bane_name} for {duration}
- Gain X additional starter cards
- Remove the transfiguration from {card_name}
- Remove the transfigurations from X random {predicate} cards
- Apply 2-3 of the above costs
- Apply a negative transfiguration to a card
- Remove an ability from {card_name}, e.g. remove reclaim or foresee
- Draw X cards from your deck and purge one of them
- Draw X fewer cards in your opening hand in battles
- Draw X fewer cards in your opening hand for {duration}
- Your opponents require X fewer points to win for {duration}
- After {duration}, purge X random cards
- Pay a cost unless you meet some specific condition, e.g. you have a named
  dreamsign
- After each battle, purge a random character
- Your starting dreamwell card is {negative_dreamwell_card} for {duration} (e.g.
  adds 1 energy)
- Shuffle X {negative_dreamwell_cards} into your dreamwell for {duration}
- Remove all shop sites from the dream atlas
- Remove all dreamsign sites from the dream atlas
- Remove your dreamcaller's ability
- Purge all duplicate cards
- X% chance to pay {cost}
- You can no longer gain essence
- You can no longer modify your deck
- Purge {site} from the current dreamscape
- Purge {site} from the next dreamscape
- Your opponents gain {dreamsign} for {duration} battles
- You can no longer transfigure cards
- Gain a dreamsign/card with X% to lose it after each battle
- Gain a reward for {duration}, but then lose it and pay {cost}
- Draft X cards, adding Y copies of each
- Apply 2-3 of the above simple effects, named
- Apply 1 of 3 of the above simple effects, at random

# Custom Cards, Dreamsigns, and Transfigurations

Dream journeys are the home of custom card designs and custom dreamsigns which
do not exist in the main draft pool. They also offer many custom
transfigurations beyond the scope of the normal colored transfiguration options.
Almost any modification to a card’s cost, character type, spark, rules etc, etc
is available for use during dream journeys. Examples:

- Appears in your opening hand
- When discarded, placed on top of your deck
- Remove predicate restrictions on targeting

# Compound Effects

A compound effect is simply one which doesn’t make sense in a “cost: effect”
format. This is typically because the effect already has a built-in cost or
downside.

- Add {x} bane cards to your deck, they transform into {powerful card} after
  {duration}
- Gain one time use effect: Banish your hand and draw 10 cards
- The next battle you win yields a dreamsign draft instead of card rewards
- Gain an inert dreamsign that transforms into {good_dreamsign} after {duration}
- X% chance to pay {cost}, otherwise gain {simple effect}
- Create a custom card for your deck, i.e. you pick the ability text and the
  game assigns a cost/spark value to it
- Gain a special dreamsign which you can trade for a very powerful effect in a
  future dream journey
- Randomize a card, e.g. randomize all its numerical values
- Gain a battle/quest tradeoff, e.g. a powerful battle effect that depletes your
  essence or adds bane cards to your deck
- Show X simple effects and apply one at random
- Apply a random simple effect from a pool of choices, not disclosed in advance
- Gain essence but lose maximum essence
- Gain {reward} if you complete some {condition}
- Purge a card and have it come back stronger later

# Conditions/Triggers

A condition or trigger is a requirement for an effect to take place

- When you win your next battle
- If you have X essence
- If you have X {predicate} cards in your deck,
- If you have X dreamsigns
- If you have a named card or named dreamsign
- Win your next battle in X turns

# Durations

A duration controls how long an effect will take place for, or how long it will
be *until* that effect takes place

- Permanent
- After X battles
- After you pay X essence
- After you add X {predicate} cards to your deck
- After you trigger {dreamsign} X times

# Predicates

A predicate specifies a certain type of card for an effect to apply to.

- Events
- Characters
- Card with X, \<X or >X cost
- Card with X, \<X or >X spark
- Neutral card
- Neutral dreamsign
- Character type (warrior, spirit animal, etc)
- Card with a given ability, e.g. with a “materialized” ability
- Fast card
- Starter card
- Dreamsign from a curated pool
- Card from a curated pool
- Specific tide
- Legendary card
- Transfigured card

# Battlefield Slot Modifications

Battlefield slot mutations are a big area of largely unexplored design space for
dreamtides. They allow dream journeys to make modifications, either positive or
negative, to future battles. Examples:

- Character here gets +3 spark / -3 spark
- When you deploy a character here draw a card
- Judgment abilities here have echo
- The character here scores +2 / -2 points during judgment

# Statuses

A status allows the dream journey to apply a persistent mutation to the quest.
These can have extreme effects, potentially even dramatically changing the game
rules. They serve cases where dreamsigns are not appropriate (see “overlap with
dreamsigns” above).

- Both players begin battles with a random second Dreamcaller’s effect.
- Both players begin each battle with 5 energy production and 5 current energy.
- Both players begin with 7 cards in hand.
- Both players draw 1 additional card during each Draw phase.
- Both players keep unspent energy between turns instead of resetting.
- Both players win battles at 15 win points instead of 25.
- Both players' characters materialize with Unstoppable.
- Dissolve every surviving deployed character on both sides after each Judgment.
- There is no paired Judgment; each turn, the player with the higher total
  deployed spark scores points equal to the difference
- Players no longer draw automatically; at the start of each turn, they look at
  the top 3 cards of their deck and choose 1 to draw
- Players draw 5 cards each turn, then shuffle their hand back into their deck
  at end of turn
- Draft sites no longer show 4 cards; they show 15 cards from all tides, and you
  pick 2
- You may freely remove cards from your deck at any time on the atlas, as long
  as you stay above 30, Drafting is replaced by opening themed card packs, then
  building a battle deck from your run pool before each fight
- You can freely duplicate cards in your deck, you must have exactly 60 cards in
  your deck
- You can just pick specific cards to add to your deck \
  The active player does not attack during Judgment; both players’ deployed
  characters attack simultaneously
- For the rest of the quest, you draft only from a refilling pool of 50 cards
  that match your dreamcaller
- Both player’s characters can directly fight each other
- Multiple characters can block on a given space
- Combat switches to magic the gathering style, you block on your opponent’s
  turn
- Characters now have separate “power” and “toughness” values
- Get rid of the dreamwell, add “lands” to all decks

# Shapes

A shape is a recipe for building a dream journey and curating the set of effects
it shows. They allow more aethstically pleasing / emotionally resonant journey
designs than what would be possible with purely random generation.

- Random allocation of simple effects, costs + simple effects, unique effects
- All cost + simple effect
- Random allocation of options with timed effects, e.g. they all apply for the
  next battle
- Three linked negative effects, like choose one of 3 cards in your deck to lose
  from among 3 options
- A single optional offering, like “pay 75 essence to purge a chosen card” or
  “gain a bane to duplicate a chosen card”. More complex effects should often be
  standalone like this.
- Two choices that operate on different axes, e.g. draft a card from 20 choices
  vs gain essence
- Mechanically linked effect pool, e.g. all transfiguration, all purge, all card
  gain, all essence
- Mechanically symmetrical effect pool, like mirrored
  purge/transfigure/duplicate options
- Three “gain a card” predicate choices, e.g. “gain a warrior”, “gain an event”,
  “gain a fast card”
- Two effect choices on the same card, e.g. Duplicate {card} or purge {card}
- Different effects where you choose the card, e.g. Transfigure a chosen card or
  purge a chosen card
- Gain a small amount of essence, or more essence with a cost
- Gain a reward up to N times. Pay some cost with an increasing magnitude each
  time.
- Gain some unknown-in-advance random outcome up to N times. Pay some fixed cost
  eah time.
- Pay essence to scale the quantity of an effect, like transfigure 1/2/3 cards,
  purge 1/2/3 cards, draft from 1/2/3 dreamsigns, gain 1/2/3 neutral cards
- Pay a cost repeatedly to grow the size of a final reward
- Pick from 3 curated draft options, like drafting from specific tides or
  specific card types
- “Shop Like” setup where all 3 options cost flat essence and are connected
  thematically, e.g. dreamsign shop, or where you can spend omens for cards,
  e.t.c.
- Purge a chosen card, gain a reward scaled based on how strong that card was
- “Push your luck” set where you can repeatedly perform some action with an
  increasing chance of a negative effect and/or increasing rewards
- Pick 3 thematically related game objects, such as a “foresee” transfiguration,
  card, or dreamsign
- Pick one of 3 {predicate} cards to apply a prismatic transfiguration to, e.g.
  upgrade one of 3 high-cost characters
- 3 of the same reward & same cost, e.g. 3 options that are all “lose
  {dreamsign} / gain {dreamsign}” for different random dreamsigns, 3 options
  that all give the same bane and give 3 thematically linked dreamsigns
- 3 options with the same cost and different effets, e.g. 3 options that all
  gain the same bane with different results
- 3 options with the same effect and different costs, e.g. 3 ways to pay for a
  legendary card
- All-gambling setup, e.g. bet X essence to win more with some probability, or
  win some reward with a given probability
- A single option where the player can take a guaranteed reward while gambling
  on whether a random cost applies, or skip entirely, e.g. gain a dreamsign with
  a 50% chance for a bane, or skip
- Pairing major quest effects with major rewards, like “you can no longer gain
  essence, transfigure all cards in your deck”
- PIck one of 3 thematically related cards or dreamsigns
- Gain a reward now or wait some {duration} to gain a better reward
- Pick from 3 variations of the same effect, like merge 2 events into one card
  vs merge 2 characters into one card
- See sequential offers for the same kind of effect, e.g. see 3 offers to sell
  your cards for essence, see 3 offers for cards to transform into other known
  cards, see sequential offers to transfigure cards
- Gain a random reward repeatedly, e.g. flip 3 coins and get a dreamsign for
  each tails
