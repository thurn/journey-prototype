# Dreamtides Battle Rules

Dreamtides is a two-player card game in the tradition of collectible card games
like Magic: The Gathering. Players build decks of character and event cards,
then compete to score victory points through positional combat on a staggered
battlefield. Two key differences from traditional card games: the shared
Dreamwell system replaces lands for energy production, and combat is resolved
positionally on a staggered battlefield — during the Judgment phase at the start
of each turn, the active player's deployed characters attack across the four
deployed lanes while the non-active player's deployed characters block.
Unblocked attackers score points, while paired attackers and blockers compare
spark and the weaker is dissolved.

## Table of Contents

- [Objective](#objective)
- [Card Types](#card-types)
- [Zones](#zones)
- [The Dreamwell and Energy](#the-dreamwell-and-energy)
- [Turn Structure](#turn-structure)
- [Playing Cards and the Stack](#playing-cards-and-the-stack)
- [Spark and Scoring](#spark-and-scoring)
- [Keywords and Effects](#keywords-and-effects)
- [Ability Types](#ability-types)
- [Targeting](#targeting)
- [Figments](#figments)

## Objective

The first player to reach the victory point threshold wins the game. The default
threshold is 25 points, but this is configurable per battle. Most points are
scored during the Judgment phase at the start of each turn, when unblocked
attacking characters score victory points equal to their spark. If 50 turns pass
without a winner, the game ends in a draw.

## Card Types

**Character** — Permanent cards that enter the battlefield when they resolve.
Each character has a spark value used in combat during the Judgment phase.
Characters enter your reserves as reserved characters and can be deployed on
subsequent turns. Characters remain on the battlefield until removed by an
effect (Dissolve or Banish) or defeated in combat. Surviving deployed characters
remain where they are after Judgment; they do not automatically return to your
reserves. They can have triggered, activated, and static abilities. Characters
have subtypes (Mage, Warrior, Robot, etc.) that other cards can reference.

**Event** — One-shot cards that produce an effect when they resolve, then move
to the void. Events can be marked as "fast," allowing them to be played during
the opponent's turn or in response to other cards on the stack.

**Dreamcaller** — A player's identity card, an animated 3D character that starts
each battle already in play. Dreamcallers provide powerful ongoing abilities
(static, triggered, or activated) that define a player's playstyle. Each
Dreamcaller also has an Awakening number, which is the turn on which that
Dreamcaller's effects become active. For example, a Dreamcaller with Awakening 4
and "Judgment: Draw a card" would begin applying that ability starting on turn
4\. Primarily chosen during quest mode.

**Dreamsign** — A quest-layer card representing a 2D illustrated object that
provides ongoing effects. Selected during quest mode and active throughout
battles.

**Dreamwell** — Special shared cards drawn during the Dreamwell phase. Not part
of either player's deck. They produce energy and can have bonus effects.

In constructed decks, the main card types are Characters and Events.

## Zones

**Deck** — A player's shuffled draw pile. Cards are drawn from the top during
the Draw phase and by card effects.

**Hand** — Cards held by a player, hidden from the opponent. A player's hand can
hold at most 10 cards. If a draw effect would exceed this limit, the player
gains 1 energy instead of drawing.

**Stack** — A temporary zone for cards that have been played but not yet
resolved. While a card is on the stack, the opponent may respond with fast
cards. Characters move to the battlefield when they resolve; events move to the
void.

**Battlefield** — Where characters reside. Each player has a staggered
battlefield with 4 deployed lanes (`D0-D3`) in front and 5 reserve slots
(`R0-R4`) behind, for 9 total positions. Dreamtides does **not** use columns.
Because the grid is staggered, a deployed lane sits in front of one or two
reserve slots: `D0` is in front of `R0` and `R1`, `D1` is in front of `R1` and
`R2`, `D2` is in front of `R2` and `R3`, and `D3` is in front of `R3` and `R4`.
`D0` and `R0` are not a column, and `D0` and `R1` are not a column either.

- `R0` supports `D0`
- `R1` supports `D0` and `D1`
- `R2` supports `D1` and `D2`
- `R3` supports `D2` and `D3`
- `R4` supports `D3`

Only deployed characters participate directly in Judgment phase combat. A player
can have at most 9 total characters on the battlefield, and new characters
always enter the reserves as reserved characters.

**Void** — The discard pile. Events go here after resolving. Characters go here
when dissolved. Some cards can interact with cards in the void (notably via
Reclaim).

**Banished** — A permanent exile zone. Cards sent here cannot return to play
under normal circumstances.

## The Dreamwell and Energy

Energy is the resource used to play cards. Unlike traditional card games that
use land cards, Dreamtides uses the Dreamwell — a shared deck of special cards
that both players draw from, one per turn.

**How the Dreamwell works:**

- The Dreamwell is a shared deck of cards (the size varies by configuration).
  During each player's Dreamwell phase, the next card is drawn automatically (no
  player choice involved).
- Each Dreamwell card has an energy production value that permanently increases
  the player's total energy production.
- At the start of each turn, your current energy is reset to equal your total
  production. After you draw your Dreamwell card, your current energy updates to
  match your new total production. Unspent energy does not carry over between
  turns.
- Many Dreamwell cards also have bonus effects such as drawing a card, using
  Foresee, gaining a point, gaining extra energy, or milling cards to the void.

**Phases and cycling:**

- Dreamwell cards have a phase number. Phase 0 cards only appear during the
  first cycle through the deck, typically providing a larger early energy boost.
  Higher-phase cards appear in every subsequent cycle, producing less energy per
  card but with bonus effects attached.
- When the deck cycles, it is reshuffled within phase groups so that lower-phase
  cards always come first within a cycle, while cards of the same phase remain
  randomized.

For example, a phase 0 Dreamwell card might produce 2 energy with no bonus
effect, while a phase 1 card might produce 1 energy and also let you Foresee 1.

## Turn Structure

Each turn progresses through these phases in order:

1. **Judgment** — Start-of-turn trigger window and combat resolution. Judgment
   abilities trigger first. Then the active player's deployed characters attack
   and the non-active player's deployed characters block. Each deployed lane
   (`D0-D3`) is resolved independently (see Spark and Scoring).
2. **Dreamwell** — The active player draws the next Dreamwell card, permanently
   increasing their energy production. Their current energy then updates to
   match that new total. Any bonus effect on the card is applied.
3. **Draw** — The active player draws one card from their deck. (Skipped on the
   very first turn of the game.)
4. **Main** — The active player can play cards from hand, activate abilities,
   deploy or reserve characters by moving them between the battlefield's 9
   positions, and take other actions. This is the primary action phase.
5. **Ending** — The active player passes. The opponent may play fast cards
   during this window. Once the opponent also passes, end-of-turn triggers fire
   and the turn passes to the opponent.

**Game start:** Each player draws 5 cards as their opening hand.

## Playing Cards and the Stack

To play a card, the active player must have enough current energy to pay its
energy cost. Playing a card deducts the cost from current energy, moves the card
to the stack, fires "played card" triggers, and gives the opponent priority to
respond.

Cards can be played from hand during the Main phase. Fast cards can additionally
be played during the Ending phase, during the opponent's Main phase, or in
response to a card on the stack.

**Stack resolution:** Unlike Magic: The Gathering, only one pass is needed to
resolve a card (not two). Cards on the stack resolve last-in, first-out (LIFO).
Events resolve by applying their effects and moving to the void. Characters
resolve by entering the battlefield. After a card resolves, if the stack is not
empty, the card's controller receives priority.

## Spark and Scoring

Spark is the primary stat on characters. Characters have no health or toughness
— spark is their only stat. When an effect modifies a character's spark,
including support-based effects from other characters, that effective spark is
what Judgment, scoring, and other game rules use.

**Attackers and blockers:** The active player's deployed characters are the
attacking side during Judgment. The non-active player's deployed characters are
the blocking side. Combat happens only in the four deployed lanes.

- If both players have a deployed character in the same lane, they are paired
  for combat in that lane.
- If only the active player has a deployed character in a lane, that attacker is
  unblocked and can score points.
- If only the non-active player has a deployed character in a lane, nothing
  happens in that lane.

**Judgment phase resolution:** During the Judgment phase at the start of each
turn, the active player's deployed characters are the attackers and the
non-active player's deployed characters are the blockers. Each deployed lane
(`D0-D3`) is resolved independently:

- **Attacker with a blocker (paired judgment):** Compare their spark values. The
  character with lower spark is dissolved. If both have the same spark, both are
  dissolved. A paired attacker does **not** score points. Dissolved triggers
  fire after each lane is resolved.
- **Attacker with no blocker (unblocked):** The attacker scores victory points
  equal to its spark value for the attacking player.
- **Only the non-active player has a character in the lane:** Nothing happens —
  the non-active player's deployed characters are blockers, not attackers.
- **Neither player has a character in the lane:** Nothing happens.

**After Judgment:** Surviving characters stay where they are. There is no
automatic return to the reserves after combat, so a surviving deployed character
remains in that lane until it is moved or removed.

Your reserves are safe during Judgment — reserved characters do not directly
fight and do not score points, though their abilities can still affect deployed
characters they support.

**Entering reserved:** When a character enters the battlefield, it is normally
placed in your reserves and enters reserved. A reserved character cannot be
deployed. This temporary reserved status wears off after the controlling
player's next Judgment phase, before that turn's Main phase.

**Repositioning:** During the Main phase, a player can freely reposition their
characters between deployed lanes and reserve slots, and between positions on
the same row of the battlefield, subject to the reserved condition. Moving a
character onto an occupied position swaps the two characters. Characters cannot
be moved outside the Main phase, and no cards can be played during Judgment.

**Materializing new characters:** Characters normally enter the battlefield in
the reserves. If all 5 reserve slots are occupied, no additional characters that
would enter reserves can be played or materialized until a reserve slot is
freed, even if the player has open deployed lanes.

**Spark modification:** Spark may be modified by card effects before Judgment,
but once Judgment begins, no new cards can be played in response.

**Character limit:** Each player can have at most 9 characters on the
battlefield at once. If the battlefield is full, additional characters cannot be
played.

## Keywords and Effects

**Dissolve** — Destroy a target character, moving it from the battlefield to the
void. Fires the "Dissolved" trigger. Can target any character (yours or the
opponent's).

**Banish** — Permanently remove a card from the game by sending it to the
Banished zone. Several variants exist: banish from the battlefield, banish from
the void, banish until the banishing card leaves play, and banish until the next
main phase.

**Materialize** — Put a character onto the battlefield, normally into your
reserves. This is the term for a character entering play, whether from hand
(played normally), from the void (via Reclaim or effects), from the deck (via
effects), or as a token (Figments). Characters normally enter reserved and
cannot be deployed on the turn they are materialized. Materialize normally
requires an empty reserve slot.

**Supported / Supporting** — These terms describe the staggered adjacency
between the 5 reserve slots and 4 deployed lanes. A reserved character's
**supported** characters are the deployed characters in the lanes its slot
supports. A deployed character's **supporting** characters are the reserved
characters behind it. On the standard battlefield, `R0` supports `D0`, `R1`
supports `D0/D1`, `R2` supports `D1/D2`, `R3` supports `D2/D3`, and `R4`
supports `D3`; equivalently, `D0` is supported by `R0/R1`, `D1` by `R1/R2`, `D2`
by `R2/R3`, and `D3` by `R3/R4`. Support has no built-in effect by itself, but
abilities can reference these relationships.

**Prevent** — Counter a card on the stack, sending it to the void without
resolving. Prevent effects are always fast (they must be played in response to a
card on the stack).

**Abandon** — Move one of your own characters from the battlefield to the void.
Cannot be prevented and only targets your own characters. Fires the "Dissolved"
trigger. Often used as a cost for abilities.

**Kindle N** — Add N spark to your character with the highest spark value. If
there is a tie, the oldest character (earliest materialized) is chosen.

**Foresee N** — Look at the top N cards of your deck. You may reorder them in
any order and optionally send any of them to the void.

**Reclaim** — A named ability that allows you to play a card from your void
instead of from your hand. The card is played at its normal cost (or at a
specified alternate cost: Reclaim N means it costs N energy when played from the
void). When a reclaimed card would later leave the stack or battlefield, it is
banished instead of returning to the void.

**Fast** — A property on cards and abilities indicating they can be used outside
normal main phase timing: during the opponent's Main phase, during the Ending
phase, or in response to cards on the stack.

**Discover** — Look at 3 cards from your deck that match a specified criteria,
then choose one to add to your hand.

**Copy** — Create a duplicate of a card or effect. Variants include copying a
character on the battlefield or copying the next card played.

**Echo** — Copy an effect so it happens an additional time. If an effect says to
echo something, that effect is copied and resolves again.

**Gain Control** — Take control of an opponent's character, moving it to your
side of the battlefield.

**Test** — Initiate a one-on-one judgment between your character and a target
character. The two characters compare spark as in a normal paired judgment — the
character with lower spark is dissolved, and if both have the same spark, both
are dissolved. No points are scored from a test.

**Dread N** — During judgment, this character dissolves opposing characters as
though its spark were N higher. The bonus applies only to the paired spark
comparison, not to points scored if unblocked.

**Preeminence** — This character wins spark ties in judgment. If both characters
in a paired judgment have preeminence, both are dissolved as normal.

**Unbound** — This character enters deployed instead of entering your reserves,
and it does not enter reserved — it can attack or block on the turn it is
materialized.

**Unstoppable** — This character scores victory points equal to its spark even
when blocked. The paired spark comparison still occurs as normal.

**Veil X** — This character costs X additional energy for the opponent to target
with cards or abilities.

**Reserve** — Keep a character in your reserves. A reserved character cannot be
deployed, does not attack or block during the next Judgment phase, and is
treated as absent during that phase. New characters enter reserved, and if an
effect or game rule says a character becomes reserved, that restriction lasts
until after its controller's next Judgment phase, before that turn's Main phase.

**Other effect categories:** Effects also exist for drawing cards, gaining or
losing energy, gaining or losing points, modifying spark values on characters,
granting temporary abilities until end of turn, taking extra turns, triggering
additional Judgment phases, and shuffling hands and voids back into decks.

## Ability Types

**Event abilities** — Effects printed on event cards. They resolve when the
event resolves from the stack, then the event moves to the void.

**Triggered abilities** — Abilities that fire automatically when a specific game
event occurs. Three keyword triggers can appear on characters: **Materialized**
(fires when the character enters the battlefield), **Judgment** (fires during
the Judgment phase at the start of each turn), and **Dissolved** (fires when the
character is destroyed). Triggered abilities can also use descriptive conditions
like "When you play a card" or "At end of turn." A character played from hand
can satisfy both "when you play" and "Materialized" triggers, but a character
put directly onto the battlefield without being played satisfies only
"Materialized." Characters can have combined triggers such as "Materialized,
Judgment" (fires both on entry and each Judgment phase).

**Activated abilities** — Abilities with a cost that a player chooses to use,
written as "Cost: Effect" (e.g., "2 energy: Draw a card"). Can be once per turn
or unlimited use. Can be Fast for off-turn activation.

**Static abilities** — Always-on rule modifications that apply as long as the
source is on the battlefield. Examples include cost reductions, spark bonuses
for matching characters, or modifications to game rules.

**Modal abilities** — Abilities that present multiple options to choose from,
written as "Choose one:" followed by the available effects and their costs.

## Targeting

Effects target cards using ownership and type predicates. Ownership predicates
include your cards, enemy cards, any card, or another card (not the source).
Type predicates include character, event, specific subtypes, characters with a
minimum spark value, or cards with a specific energy cost.

Targeting is specified when a card is played (for stack targets) or when an
effect resolves (for pending effect targets). Players are prompted to select
valid targets from the available options.

## Figments

Figments are token characters created by card effects rather than played from a
deck. Figments enter the battlefield through "Materialize Figments" effects and
behave like regular characters — they have spark values, count toward the
character limit, and can be targeted by effects.
