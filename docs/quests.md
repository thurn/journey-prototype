# Dreamtides Quests: Master Design Document

This is the master design document for the Dreamtides "quests" system. Quests
are the meta layer in which the user navigates various encounters on a map
screen in order to improve their deck, while battles are individual card
matches. Quests are similar to "runs" in other roguelike deckbuilding games,
while battles are similar to "fights". Quests will be at least as complicated to
implement as battles, and almost every existing line of code for supporting
battles will require an equivalent for quests.

This document is the high level "vision" for quests, other documents in this
directory provide more detailed gameplay & technical breakdowns of the feature.
The document at [battle_rules](../../battle_rules/battle_rules.md) provides more
information about the actual rules of the game.

## The Golden Rule: Configuration via TOML

The rest of this document goes into detail about specific game systems. To the
maximum extent possible, though, Dreamtides gameplay is intended to be
completely configurable via TOML file changes. If a section in the plan says
"shops contain 6 items", this is implied to be configured in TOML. Whenever
reasonable, we should even allow more complex algorithmic changes via data
(dreamscape generation, draft pool rules, battle rewards, etc). When
implementing any rules engine feature, we should ask the question "could we make
this configurable?"

This rule applies to user interface behavior as well as game design: things like
particle effects, sound effects, and animations are always configured in TOML
when possible.

## Overview

Quests revolve primarily around drafting and refining a deck to bring into
future battles. Quests use two currencies: "essence" and "omens". Essence is the
main quest currency and is spent on shops and in various other ways. Omens are
used only for shop dreamsign purchases and shop rerolls. Players begin each
quest by choosing a Dreamcaller, then review their fixed starter deck and first
dreamscape. By default, quests have a maximum essence cap of 500; any essence
gained beyond this cap is lost unless the cap has been increased by an effect
such as a Dream Journey reward. Omens have no cap. Dreamtides does not use an
explicit rarity system for cards, except for certain powerful cards that are
designated as legendary cards.

In addition to deck cards, users during a quest will select a Dreamcaller to
lead their deck and may have some number of Dreamsigns:

- **Dreamcaller:** An animated 3D character who starts each battle already in
  play for both participants in a battle. Each Dreamcaller has powerful ongoing,
  triggered, or activated abilities and defines a fixed run package: mandatory
  package tides plus a selected subset of optional package tides. That package
  seeds the run's draft multiset, Dreamsign pool, and default reward bias.
- **Dreamsigns:** Cards with 2D illustrations of objects which provide more
  minor ongoing effects. Dreamsign effects can apply during battles, on the
  quest map, or both. Dreamsigns have a display tide for UI chrome, plus hidden
  package-tide memberships used for quest content generation. Dreamsigns are
  pulled from a shared run pool and are spent as soon as they are shown to the
  player.

Quests display a top-level 3D screen called the [Dream Atlas](#dream-atlas) with
a series of "dreamscapes" the user can navigate to. Each dreamscape is
associated with "sites", specific rewards available in that dreamscape.

Dreamscapes show a group of individual white icons with black circular
backgrounds for their sites. Each site icon corresponds to some specific quest
effect, and users can "visit" a site to activate the effect by clicking on the
icon. This causes the camera to zoom in on that site and then displays the
site's effect, often with a 3D animated NPC character introducing the site's
concept. Once all of the sites in a given dreamscape have been visited, the user
must navigate to the "battle" site to initiate a card battle. After completing a
battle, the user is able to select another dreamscape to navigate to, and the
process repeats. By default, quests are single elimination: if the player loses
any battle, the quest ends immediately.

## Current Quest Prototype

The current reference prototype for quest flow lives in
`scripts/quest_prototype/` as a standalone web app. It reflects the current
package-based run setup:

1. The player is offered 3 Dreamcallers.
2. Choosing a Dreamcaller resolves a fixed package once for the run.
3. The starter deck, draft multiset, Dreamsign pool, and atlas are initialized.
4. The player views the starting deck.
5. The player views the starting dreamscape and enters it directly, with no
   dreamscape choice, intermediate Dreamcaller Draft, or tide-pick screen.

The older Unity quest prototype remains useful for some layout exploration, but
it is no longer the source of truth for quest flow, tide logic, or draft pool
construction. The documents [current_prototype.md](current_prototype.md) and
[`docs/quest_prototype/quest_prototype.md`](../../quest_prototype/quest_prototype.md)
are the technical references for the live prototype behavior that this design
document should track.

## Tides

Quest content now uses the layered tide system described in
[Tides](../../tides/tides.md). Tides are gameplay packages, not a battle
resource system:

- **Structural tides** are full shells. They define the deck's main engines,
  payoffs, and finishers.
- **Support tides** are splashable reinforcement packages. They provide setup,
  smoothing, bridges, and enablers for structural shells.
- **Utility tides** are broad role packages. They provide generic curve,
  interaction, selection, refuel, and closing tools.

Cards are assigned tides by battlefield function, not by flavor or surface
terminology. A single card may belong to multiple package tides if it genuinely
supports multiple gameplay patterns.

For quests, the important consequences are:

- Dreamcallers define **mandatory package tides** and **optional package
  tides**.
- A run resolves one fixed **selected tide package** at quest start: mandatory
  tides plus a chosen optional subset.
- Draft pools, Dreamsign pools, shops, and reward generators all key off these
  package tides.
- Battles themselves use the core
  [battle rules](../../battle_rules/battle_rules.md) resource model: cards are
  paid for with **energy**, and energy production comes from the shared
  **Dreamwell** rather than from tide-specific resources.

Cards and Dreamsigns may still expose one of the seven display tides
(Bloom/Arc/Ignite/Pact/Umbra/Rime/Surge, plus Neutral) for iconography and card
chrome, but quest generation should treat those as presentation. The underlying
package tides are what drive run identity.

## Draft Pool Construction

The draft is now a fixed multiset built from the selected Dreamcaller package.
It is not a pod draft, does not use AI bot drafters, and does not deal or pass
packs.

### Package Resolution Algorithm

At quest start, choosing a Dreamcaller resolves the run's draft pool as follows:

1. Start from the full non-starter card pool.
2. Build a **mandatory-only** draft multiset using the Dreamcaller's mandatory
   package tides. A card receives copies equal to its overlap count with the
   selected tides, capped at 2 copies.
3. The mandatory-only pool must land in the `110-150` card range. Dreamcallers
   that fail this validation are not legal quest-start offers.
4. Enumerate all optional-tide subsets of size 3 and 4 from the Dreamcaller's
   optional package tides.
5. For each subset, form `selectedTides = mandatoryTides + optionalSubset`, then
   rebuild the draft multiset using the same overlap-count rule: one copy for
   one matching tide, two copies for two or more matching tides.
6. Legal draft pools are `175-225` cards. Preferred draft pools are `190-210`
   cards.
7. Choose the best candidate from the preferred range if one exists; otherwise
   choose the best legal candidate. "Best" currently means the largest pool
   size, with deterministic tie-breaking by the sorted optional-subset key.

This makes the run package concrete and replayable: Dreamcaller choice decides
which structural/support/utility packages are active, and cards that bridge
multiple selected tides naturally show up more often because they receive two
copies instead of one.

The same resolution step also builds the run's initial Dreamsign pool by taking
every Dreamsign template with any package-tide overlap against the selected
tides.

### Offer Generation

The draft state stores `remainingCopiesByCard` for the resolved multiset and
generates offers directly from that data:

- Each pick shows **4 unique cards** when at least 4 unique cards remain.
- Cards are sampled **without replacement**, weighted by their remaining copy
  counts.
- The shown offer is **spent immediately** from the pool. Unpicked cards are
  burned; they do not return to the pool later.
- The player pick adds the chosen card to the deck but does not otherwise alter
  the already-spent offer.
- The draft multiset persists across dreamscapes for the entire run.
- There are no rounds, no refresh after 10 picks, and no hidden bot picks.

This system makes the run feel like drafting through a finite, Dreamcaller-tuned
inventory rather than fighting over shared packs at a table.

### Draft Sites On The Map

Each [Draft site](#draft) on the dreamscape map provides **5 picks** from the
ongoing multiset. Early dreamscapes still provide more opportunities to draft
than late dreamscapes:

| Completion Level | Draft Sites |
| ---------------- | ----------- |
| 0, 1             | 2           |
| 2, 3             | 1           |
| 4+               | 0           |

Because the draft pool is persistent and finite, each draft site is spending
real run inventory. Offer quality will naturally shift over time as adjacent
cards and doubled bridge cards are consumed.

## Dreamscape Sites

The following dreamscape sites are planned for eventual implementation in
Dreamtides. Sites can generally be visited in any order, with the exception that
the "Battle" site must be visited last. Each site must be visited exactly once
and cannot be returned to. Dreamscapes contain between 3 and 6 total sites
(including battle and draft sites, configured in TOML) as described below in the
[Dreamscape Generation](#dreamscape-generation) section.

Many sites have an "enhanced" version with a stronger version of their ability
which can appear as described in [Enhanced Sites](#enhanced-sites) below.

Many sites are associated with an NPC, a 3D humanoid character that can play
character animations and show a speech bubble. This NPC is always the same for a
given site (e.g. all shops are the same NPC), and their behavior and dialog are
configured via TOML. For sites with an NPC, portrait mode frames the NPC at the
top of the screen with content below, while landscape mode places the NPC to one
side with content beside them.

### Battle

The Battle site is the core gameplay element of Dreamtides, and it allows users
to play a match against an AI opponent. Each battle has an assigned opponent
dreamcaller with their own deck. Opponent decks are (for now) defined statically
in TOML. Before the battle begins, the opposing dreamcaller is displayed so the
user can understand any special abilities they have. Opposing dreamsigns are
also shown. When the battle completes, the [Victory or Defeat](#victory--defeat)
screen is shown along with any associated battle rewards. Battles use the normal
Dreamwell-and-energy rules from
[`docs/battle_rules/battle_rules.md`](../../battle_rules/battle_rules.md): the
Dreamwell phase increases energy production, current energy resets to production
each turn, and playing cards only checks energy cost, not tide membership.
Quests are single elimination by default, so losing this battle ends the run.

**UI:** The camera pans in to the battle scene. The "full body" card
representation of the enemy dreamcaller animates in from a small size at the
center of the battle area. The enemy's deck is present in the center of the
scene. The dreamcaller character within the card performs a humanoid animation.
The rules text on the enemy dreamcaller is displayed, along with any enemy
dreamsigns. A "start battle" button is shown. Clicking the start battle button
causes the enemy dreamcaller to animate to their battle position in the small
dreamcaller card format (head only, no text). The user dreamcaller and user
quest deck animate to their starting positions. The enemy quest deck animates to
its starting position. An opening hand of cards is dealt to both players.

Icon: "Sword"

### Draft

The Draft site allows users to add cards to their deck via the
[Draft Pool Construction](#draft-pool-construction) system. Each draft site
provides 5 picks from the ongoing run multiset. Each pick shows 4 unique cards
sampled from the remaining pool, weighted by remaining copies. Revealed cards
are spent immediately whether or not they are chosen, so a Draft site always
burns real run inventory. There is no default skip or reroll for draft picks,
though dreamsigns and journeys may still override this.

**UI:** The cards available for the current pick are shown in multiple rows. The
available cards animate in to be selected. Clicking a card animates it to the
quest deck, and the remaining cards animate away as the next offer arrives.
After all picks at a draft site are completed, the camera automatically pulls
back to the map view. Cards are shown with an orange outline.

Icon: "Rectangle Vertical"

### Dreamcaller Selection

Dreamcaller selection is no longer a dreamscape site. It is the quest-start
screen shown before the player enters the Dream Atlas. The player is presented
with 3 Dreamcallers and chooses one to define the run.

Selecting a Dreamcaller performs all run bootstrap work immediately:

- Add the fixed starter deck.
- Resolve the Dreamcaller's mandatory and optional package tides into one legal
  selected tide package.
- Initialize the draft multiset and Dreamsign pool from that package.
- Generate the initial atlas.
- Show the starting deck.
- Show the starting dreamscape, then enter that dreamscape directly.

Dreamcallers should communicate their intended play pattern by surfacing a small
set of structural/support tides and their rules text, but there is no longer a
mid-run "wait to pick your archetype" decision or Dreamcaller-granted resource
fixing.

**UI:** Dreamcallers are shown in their full-body "card" representation, with
ability text displayed alongside their 3D models and highlighted structural and
support tides. The Dreamcaller cards animate in from a small size in the center
of the screen. Each Dreamcaller does a different humanoid animation within its
card frame. A primary action button appears below each Dreamcaller allowing it
to be selected. The selected Dreamcaller animates to the bottom left of the
screen to appear in a square frame (head only). The other cards animate back to
a small size.

Icon: "Crown"

### Specialty Shop

A specialty shop operates in a similar manner to
[Battle Rewards](#battle-rewards), showing a curated selection of powerful cards
that prefer the run's selected package tides and then tighten further around the
player's actual deck composition.

Future iterations may experiment with more novel offerings, such as:

- A curated selection of cards from *other* packages that synergize well with
  the player's deck.
- A curated offering of removal effects, card advantage effects, or other
  mechanical categories.
- Strong package-adjacent card selection (the default behavior).

**UI:** Identical UI to the regular shop site except that it features a
different NPC.

Icon: "Store Alt 2"

### Shop

The shop is the primary site in which the user can spend quest currencies. Shops
offer individual cards, dreamsigns, and rerolls for purchase, and may rarely
offer other site options such as purchasing journeys, purging cards,
transfiguring cards, duplicating cards, etc. Cards and most other shop options
cost essence. Dreamsigns cost omens rather than essence, typically around 1-3
omens. Rerolling the shop also costs omens rather than essence, typically 1
omen.

Shop cards should prefer content that overlaps the run's selected package tides,
then weight further toward the packages the player's current deck has actually
started to accumulate. If no package-adjacent content is available, the shop may
fall back to the broader card pool. Dreamsign offers are drawn from the shared
remaining Dreamsign pool for the run.

Shop base prices and the overall essence/omen economy are defined in TOML. The
shop implements a random "discount" system where one or more items can be
displayed as being on sale, for between 30% and 90% cost reduction. Things like
dreamsigns or journey effects can also modify shop prices.

**UI:** An NPC is shown who performs an animation and displays a speech bubble
with some dialog when the camera arrives at this site. Two rows of three items
each are displayed, along with a close button. The items are beside the NPC in
landscape mode and below the NPC in portrait mode. Each item has a purple button
under it showing the relevant cost to purchase that item. Cards and most shop
services show an essence cost, while dreamsigns and rerolls show an omen cost.
Clicking the button for a card or dreamsign animates it to the quest deck or
dreamsign display in the bottom right corner of the screen. The other items do
not move on purchase, leaving a gap. One of the items shown may be a "reroll"
option. When this is selected, the items do a staggered scale-down animation,
then the 6 new options perform a scale-up animation in-place. Clicking the close
button completes the site visit and pulls the camera back to the map screen. The
items remain in place visually rather than animating away, but the site cannot
be revisited.

Icon: "Store"

### Dreamsign Offering

At a dreamsign offering site, the user is presented with a single dreamsign to
gain. The offering may be rejected, but there is no reward for doing so. The
offered Dreamsign is drawn from the run's shared Dreamsign pool, which was
seeded from the selected Dreamcaller package. Revealed Dreamsigns are spent from
that pool immediately, so rejecting an offer does not return it to the run.

**UI:** The dreamsign animates to be displayed from screen center at a small
scale. A purple accept button and a gray reject button are displayed. The
dreamsign animates to the bottom right dreamsign display if accepted and
animates back to a small scale if rejected.

Icon: "Sparkles"

### Dreamsign Draft

At a dreamsign draft site, the user is presented with around three dreamsigns
and is able to select one to gain. It is again possible to select no dreamsign.
As with Dreamsign Offering, the shown Dreamsigns are drawn from the run's shared
Dreamsign pool and are spent as soon as they are shown. Skipping the site means
the revealed Dreamsigns are lost for the rest of the run.

**UI:** The three dreamsigns animate in at full size from the bottom of the
screen in a staggered animation, positioning themselves in a single row. Purple
accept buttons are shown below each one. A red close button is shown top left,
functioning in a similar way to the Shop close button. Accepting a dreamsign
animates it to the user's dreamsign display area in the bottom right of the
screen.

Icon: "Sparkles Alt"

### Dream Journey

A dream journey functions in a manner similar to a random event in other
roguelike deckbuilding games. The user is offered a selection between two
circular cards with unique art. Each card has a description, although the amount
of information revealed about the effects is variable, and some dream journeys
have highly random effects which are not disclosed in advance. This is where we
put the biggest random effects which can structurally change a quest or modify
the user's entire deck. A close button is displayed in a similar manner to the
shop screen allowing the user to reject the dream journey options.

Some dream journeys are drawn with a distinct "cost" card frame, indicating that
the journey has both a benefit and an associated cost the user must pay to
accept it. Cost-framed journeys are drawn from the same pool and appear at
ordinary Dream Journey sites alongside benefit-only journeys; the frame is
purely a visual cue that a price is attached. When a cost-framed journey is
accepted, the cost card resolves alongside the benefit, typically with its own
effect animation, sound effect, and particle effect.

All dream journeys are equally likely to appear: there is no normal rarity tier
or weighting between journey templates. The only explicit rarity-like concept in
Dreamtides is that certain powerful cards are designated as legendary cards.
Which journeys show up at a given site is determined purely by uniform random
sampling from the journey pool.

**UI:** An NPC is shown who performs an animation and displays a speech bubble
with some dialog when the camera arrives at this site. The journey cards animate
from the center of the NPC's chest at a small size and are shown side-by-side in
a similar layout to the shop screen (next to the NPC landscape, below in
portrait). A purple button is displayed under each journey card to accept it.
Clicking this button causes the not-selected journey card to animate down to a
small size and vanish. The accepted journey card animates up to appear in screen
center, then plays a dissolve animation. The effects of the journey are shown
via a custom animation (e.g. cards might fade in and then be animated to the
user's quest deck if the journey effect is "add 3 cards to your deck"). Once the
effect animation completes, the camera pulls back to the map screen. A dream
journey is a circular card image which displays its rules text on hover/long
press. For cost-framed journeys, after the benefit animation completes the cost
card animates to screen center and plays its own custom animation before the
camera pulls back.

Icon: "Moon + Star"

### Purge

A purge site allows the user to remove up to 3 cards from their deck, allowing
them to remove cards that don't fit with their overall gameplan.

**UI:** The camera pulls in to see an NPC at the site, who performs a character
animation and displays a speech bubble. After a pause, the user's quest deck
opens its browser view, showing cards, and a message instructs the user to
select cards to purge (0/3). Selected cards get a red outline. The quest deck
browser can also be opened outside of sites by clicking the quest deck in the
bottom right of the screen. A red X close button is displayed as in the normal
deck browser view. A red button with e.g. "purge 3 cards" appears at the bottom
of the screen when cards are selected. Clicking this button closes the quest
deck browser but causes the selected cards to animate to screen center. They
then play a dissolve animation and fade away. Once this animation completes, the
camera pulls back to the map screen.

Icon: "Hot"

### Essence

An essence site grants the user a fixed amount of essence, often around 200-300.
Essence is capped at 500 by default, and any amount above the current cap is
lost. Effects such as Dream Journey rewards may increase this cap.

**UI:** Unlike with other sites, the camera does not zoom in to essence sites.
Instead the button simply vanishes on click and a purple particle effect
appears, animating in a winding path to the user's essence total and then plays
a 'hit' particle effect when it reaches the bottom left essence total and
updates the quantity of essence shown.

Icon: "Diamond"

### Transfiguration

A transfiguration site shows the user 3 random cards from their deck, and they
may select one to apply a transfiguration to, modifying that card's rules text.
Each card can only receive a single transfiguration; cards that have already
been transfigured are not eligible. If multiple transfigurations are applicable
to a card, a random one is selected to suggest.

Transfigurations are named after colors, and cause the card name and any
modified rules text to display in a different color to indicate the
transfiguration. Possible transfigurations include:

- Viridian Transfiguration: Reduces the energy cost of the card by 50%, rounded
  to the nearest whole number (4->2, 3->2, 2->1, 1->0, etc). Not available for
  cards which cost 0.
- Golden Transfiguration: Improves the effect of the card by increasing or
  decreasing a number in its rules text by 1. Only available for cards with
  numbers in their text. The golden variant of each card is defined in TOML.
- Scarlet Transfiguration: Doubles the base spark of a character, or sets it to
  1 for characters with 0 spark. Only available for characters.
- Magenta Transfiguration: Increases the frequency of named card triggers,
  changing:
  - A "materialized" trigger to also happen when the card dissolves
  - A "judgment" trigger to also happen when the card is materialized
  - A "once per turn" trigger to happen any number of times per turn
- Azure Transfiguration: Appends "draw a card" to the text of an event card.
  Only available for events.
- Bronze Transfiguration: Adds "reclaim" to the text of an event card. Only
  available for events.
- Rose Transfiguration: Reduces the cost of an activated ability by 1. Only
  available for cards with activated abilities that cost energy.
- Prismatic Transfiguration: Adds all of the above transfigurations to a card
  which are available. Only available for cards which are eligible for 2 or more
  transfigurations.

**UI:** An NPC is shown who performs an animation and displays a speech bubble
with some dialog when the camera arrives at this site. 3 cards from the quest
deck animate to appear in a row via a staggered move animation (they flip to be
face-up). As with other sites, they appear beside the NPC in landscape and below
the NPC in portrait. Each card is augmented to show the transfigured version
being offered, with the card name and card text tinted to the new color. Each
card gets a purple "Transfigure" button to accept that transfiguration. When
clicked the other cards fall away, and then the selected card animates to screen
center and displays a visual effect specific to the transfiguration being
applied, then flips over and returns to the quest deck in the bottom right of
the screen. A close button is displayed to allow the user to decline a
transfiguration.

Icon: "Science"

### Duplication

A duplication site shows the user 3 random cards from their deck along with a
proposed random number of copies to create for each card between 1 and 4. The
user may pick one of the proposed options to add that many duplicates of that
card to their deck.

**UI:** An NPC is shown who performs an animation and displays a speech bubble
with some dialog when the camera arrives at this site. 3 cards from the quest
deck animate to appear in a row via a staggered move animation. A purple button
like "Duplicate x3" appears under each one. Clicking this button causes the
other cards to fall away, and then a particle effect plays and additional copies
of the card emerge from the selected card. All copies then animate to the quest
deck, and the camera pulls back to the map screen. A close button is displayed
to allow the user to decline duplication.

Icon: "Copy"

### Reward Site

A reward site is a special site for granting the user a fixed reward (a specific
card or cards, dreamsign, group of dreamsigns, etc). The distinguishing factor
of reward sites is that the reward is fixed by dreamscape generation rather than
randomly rolled when the site is visited.

**UI:** The camera pulls in on a scene showing the reward items in question,
with a purple "accept" button and a gray "decline" button. Accepting the reward
plays the standard animation for that item type, for example animating to the
quest deck, and then the camera pulls back to the map screen.

Icon: "Treasure Chest"

### Cleanse

A Cleanse site allows the user to remove up to 3 random [Banes](#banes) from
their deck or dreamsigns.

**UI:** An NPC is shown who performs an animation and displays a speech bubble
with some dialog when the camera arrives at this site. The randomly selected
cards or dreamsigns to cleanse emerge from the quest deck or dreamsign display.
A purple "cleanse" button is displayed, along with a gray "decline" button.
Selecting "cleanse" causes the bane cards to play a dissolve animation, and then
the camera pulls back to the map screen.

Icon: "Snowflake"

## Victory & Defeat

By default, quests are single elimination: if the user loses any battle, the
quest ends immediately in defeat. As described in the
[Meta Progression](meta_progression.md) document, the user may eventually unlock
an exception that allows continuing after a first loss, but that is a
meta-progression reward layered on top of the base rule.

**UI:** When a battle ends, a particle effect plays alongside a sound effect,
and the word "Victory" or "Defeat" is displayed at screen center. The text then
animates upward to reveal a summary panel showing battle rewards earned, quest
statistics, and a button to continue to the Dream Atlas (on victory) or to end
the quest (on defeat).

A Quest ends in victory if the user wins 7 battles. The 4th battle they face is
against a miniboss, and the 7th battle is against the final boss of Dreamtides.
Bosses are dreamcallers that have their own unique abilities, dreamsigns, or
custom cards in their decks. See [Boss Dreamcallers](bosses.md) for details.

### Battle Rewards

Completing a battle always grants an essence reward, which increases as the user
completes more dreamscapes. On victory, the user also gains 1-3 omens. The user
then gets a 4-card reward pick drawn from a package-adjacent reward pool. This
reward generator should prefer cards overlapping the run's selected package
tides, with a fallback to the broader pool if necessary. Battle rewards do not
consume the main draft multiset, so they are a separate way to inject
high-synergy cards into the deck. This draft pick cannot be skipped.

## Limits

Quest decks can contain a maximum of 50 cards during battles. If this limit is
exceeded, before the battle starts the user gains the ability to purge cards of
their choice to get back down under 50 cards.

Quest runs also have a maximum essence cap of 500 by default. If the player
would gain essence above their current cap, the excess is lost. This cap can be
increased by effects such as Dream Journey rewards.

Omens have no cap.

Quest decks must contain a minimum of 25 cards. If the user has not completed
enough drafts to reach this threshold, additional copies of their deck are added
during a battle until they exceed 25 (for example, a player with 9 cards in
their deck will end up with 27 cards during a battle).

Users can have a maximum of 12 dreamsigns at any time. If they would receive
another dreamsign, an overlay is shown and they must immediately purge a
dreamsign.

Users may have only 1 dreamcaller.

## Banes

Certain cards, called "banes", can be given to the user during a quest,
typically as a result of the cost side of a [Dream Journey](#dream-journey).
Bane cards generally have negative effects when drawn. Bane cards can be
[purged](#purge) as normal. Bane cards can also be removed via the
[cleanse](#cleanse) site. See [Banes](banes.md) for more information.

## Dream Atlas

The Dream Atlas is the world map players navigate after Dreamcaller selection,
starting deck review, and starting dreamscape review. It shows a 3D map of
dreamscapes represented as circular miniature "worlds," connected by dotted
lines. For later dreamscape choices, the player can hover over or long-press a
dreamscape to preview its biome and preview site, then click it again to zoom
the camera in to that dreamscape.

Each dreamscape can be in one of three states:

- **Completed**: The player has already visited this dreamscape and finished its
  battle.
- **Available**: The player can choose this dreamscape as their next
  destination.
- **Unavailable**: The player cannot choose this dreamscape yet.

The player begins at the center of the Dream Atlas, called the **Nexus**. At the
start, the run has exactly one starting dreamscape connected to the Nexus. The
player views that dreamscape and enters it directly instead of choosing between
multiple initial dreamscapes.

After the player visits a dreamscape and completes its battle, that dreamscape
becomes **Completed**. Any dreamscapes directly connected to it then also become
**Available**. The number of dreamscapes the user has completed is called the
'Completion Level' for that quest.

In other words, a dreamscape is **Available** only if it is connected to the
Nexus or to at least one **Completed** dreamscape.

Each dreamscape displays exactly one site icon on the atlas to preview one site
contained in that dreamscape. This icon is not a battle or draft site. If the
dreamscape has an enhanced site, the preview icon is that enhanced site.
Otherwise, it is the configured preview site for that dreamscape. Winning the
7th battle causes the player to win the quest.

### Dream Atlas Generation

The dream atlas is generated dynamically throughout the quest, with new
dreamscapes being added as dreamscapes are completed. The new dreamscapes are
added as 'unavailable' nodes adjacent to the newly 'available' nodes. Between 1
and 2 nodes are randomly generated and placed in this manner each time a
dreamscape is completed, creating a web of interconnected nodes. The atlas is
purely additive and is never pruned; the player will visit 7 dreamscapes in a
typical quest (or 8 with the battle-skip meta progression unlock). Initial atlas
topology is configured in TOML.

## Dreamscape Generation

Dreamscapes are generated by drawing sites from a pool, in a similar manner to
how draft picks are generated. Sites are selected when the dreamscape becomes
available. The pool for site generation changes over time, with new options
being shuffled in after each dreamscape is completed. Each completed dreamscape
shuffles in a new set of sites as defined in TOML for that completion level.
Transfiguration, Purge, and Duplication sites are more common later in the
Quest, for example.

All sites can appear a maximum of 1 time in a dreamscape, with the exception
that there can be up to 2 Draft sites (as noted below) and up to 2 Essence
sites.

Draft sites are handled differently. Dreamscapes have a deterministic number of
draft sites based on completion level.

| Completion Level | Draft Sites |
| ---------------- | ----------- |
| 0, 1             | 2           |
| 2, 3             | 1           |
| 4+               | 0           |

Battle sites are also distinct: Each dreamscape has exactly one Battle site. The
opponent dreamcaller, dreamsigns, and deck for the battle is selected from a
pool of opponents defined in TOML for a given completion level. Difficulty
scaling is configured in TOML.

### Enhanced Sites

Each dreamscape is associated with a specific "biome" which dictates the 3D
environment assets used in generation. Biomes are purely visual aside from their
enhanced site affinity. There is one biome per enhanced site type, and biome
configuration and assignment are defined in TOML. Each dreamscape biome has an
affinity for a specific site, and produces an "enhanced site" of that type when
visited. The available enhanced sites are:

- **Shop**: The reroll option is free
- **Dreamsign Offering/Dreamsign Draft**: A dreamsign draft is offered instead,
  or a draft is offered with an additional option
- **Dream Journey**: A 3rd dream journey option is provided
- **Purge**: Up to 6 cards can be removed from the deck
- **Essence**: The essence amount given is doubled
- **Transfiguration**: The player may select which card in their deck receives
  transfiguration
- **Duplication**: The player may select which card in their deck is duplicated
- **Specialty Shop**: The player may select any number of the offered cards to
  add to their deck.

## Implementation Strategy and QA

The overall implementation strategy for the Quests game mode is to rely heavily
on both *integration testing* and *manual QA*. The integration testing
philosophy should follow what we use for the battle game mode, writing tests
that operate against the real QuestView/Commands interface. Philosophically,
Dreamtides does not employ unit testing.

The manual QA strategy here is based on validating all changes against a running
instance of the Unity editor using the [abu](../../abu/abu.md) tool. *Every*
change to the Quest game mode should interact with Unity, perform the required
user interactions, and take screenshots of the new UI to check for display
issues. Testing *must* be at minimum performed once on a landscape/desktop
display resolution and once on a mobile/portrait display resolution. The device
can be configured before entering play mode via the `abu set-device` command:
`abu set-device landscape-16x10` or `abu set-device iphone-se`. We should be
interactively building a high-quality `DreamtidesSceneWalker.Quest.cs` scene
`abu` representation during development.
