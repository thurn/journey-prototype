# Dream Journey V3 Technical Design

## Summary

V3 of the `journey` tool expands the Dream Journey generator from a curated
shape sampler into a comprehensive simulator for the Journey design space
described by the brainstorm catalog. The goal is to support the full range of
examples in the requirement source while preserving the current stateless,
manifest-first, deterministic command-line workflow.

The current implementation already has the right architectural center: it
selects a Journey Shape, fills it with structured payloads, validates the
manifest, and renders human and JSON output from the same source of truth. V3
keeps that model. The required change is that the fillable payload surface must
become much richer and more semantic. The generator must be able to name real
cards and Dreamsigns, target exact or predicate-selected objects, represent
delayed hooks, model temporary and persistent quest status, express route edits,
support reveal and random mechanics, and validate all of those behaviors without
parsing rendered option text.

The most important acceptance criterion is variety. For any supported quest
stage, a deterministic batch of 100 generated Journeys must contain 100
meaningfully distinct Journeys. "Distinct" does not mean that two outputs differ
only by an essence amount, chance percentage, or target quantity. It means their
shape, payload families, named objects, targets, timings, and strategic
tradeoffs produce different design decisions for a reviewer and different
choices for a player.

V3 is not a rewrite of the CLI into a game engine. It is still a non-interactive
design-review tool. It should not resolve battles, apply picks to real quest
state, or require the reviewer to step through hidden menus. It must produce
complete, inspectable Journey manifests that future production game code can
use as an effect contract.

## Related Information

- [Brainstorm Examples](brainstorm_examples.md) is the primary V3 requirements
  source. Every example in that document should become generatable, either
  exactly or as a clearly equivalent instantiation of the same feature class.
- [Dream Journey Generation](dream_journey_generation.md) defines the
  shape-first model, canonical shape catalog, validation philosophy, value
  balancing, and stage texture principles that V3 preserves.
- [Dream Journey Brainstorm](dream_journey_brainstorm.md) contains the broad
  catalog of simple effects, costs, compound effects, triggers, durations,
  predicates, statuses, battlefield mutations, and shape ideas behind the V3
  feature surface.
- [Sequential Overhaul](2026-05-06-dream-journey-sequential-overhaul.md)
  defines the stateless CLI contract and complete-tree rendering model that
  V3 must preserve.
- [Dream Journey CLI Simulator Design](2026-05-05-dream-journey-cli-design.md)
  remains the current CLI behavior summary after the stateless overhaul.
- [Dream Journey Examples](dream_journey_examples.md) provides reference shape
  examples that should remain valid while V3 broadens the payload surface.
- [Dreamtides Quests](quests.md) defines quest resources, Dreamcallers, package
  tides, draft pools, Dreamsign pools, essence, omens, sites, and atlas context.
- [Battle Rules](battle_rules.md) defines card, Dreamcaller, Dreamsign, Bane,
  battle, Dreamwell, energy, spark, point, and keyword vocabulary used by many
  V3 effects.

## Problem And Context

The existing generator can produce many valid Journeys, but the brainstorm
examples show that it cannot yet express much of the intended design space.
Most failures are not caused by missing random seeds. They are caused by missing
capabilities in the payload model, authoring catalog, validation layer, or
renderer.

Repeated failure classes include:

- named card rewards, losses, transformations, and mutations are not generated;
- named Dreamsign purchases, gains, losses, transformations, and temporary
  grants are not generated;
- Dreamsign pool edits and Dreamsign operation menus are not generated;
- Bane purge, Bane replacement, named Bane quantities, and temporary Banes are
  not broadly represented;
- route effects mostly replace sites and cannot add, remove, purge, or adjust
  future site probabilities;
- current and future dreamscape wording is narrower than the brainstorm
  examples require;
- trigger and duration vocabulary is too small;
- draft predicates are too narrow and most draft counts are fixed;
- essence and omen costs are limited to a few fixed bands;
- percentage, random-range, all-remaining, maximum, and spend-all costs are not
  represented;
- temporary battle modifiers are limited to a small set of positive windows;
- Dreamwell, shop, victory-replacement, opening-hand, and both-player battle
  rules are missing;
- status rewards and one-time status effects are rejected;
- custom Journey-only cards, Dreamsigns, and transfigurations are rejected;
- compound effects such as sealing, trading, delayed transformation, and
  reward-after-use counters have no structured representation;
- reveal, roll, wheel, push, keep-one, and random-series presentation patterns
  are incomplete;
- validation forbids several surfaces that V3 explicitly needs to support;
- output variety is driven mostly by shape choice and numeric fills, not by a
  large semantic space of payload families.

The design challenge is to add all of this without collapsing the tool into a
text generator. V3 must still preserve existing guarantees: structured
manifests, deterministic replay, content-backed references, shape-first
generation, readable terminal output, JSON parity, and validation before
rendering.

## Goals

- Support all feature classes represented in `docs/brainstorm_examples.md`.
- Preserve every existing Journey Shape and all current valid behavior.
- Preserve the stateless CLI generation contract.
- Preserve deterministic replay for stable seeds, stages, shape constraints,
  content versions, and catalog versions.
- Keep the manifest as the source of truth for human and JSON rendering.
- Represent effects, costs, targets, timings, statuses, route edits, random
  envelopes, and references as structured data.
- Use real TOML-backed cards, Dreamcallers, and Dreamsigns whenever an option
  names an existing object.
- Support Journey-specific custom objects only through structured generated
  object manifests, not through freeform text.
- Keep normal output mechanical and concise.
- Keep debug output rich enough to explain shape selection, fill selection,
  distinctness, validation, repairs, and value scoring.
- Expand validation so it can prove new payloads are legal instead of rejecting
  them categorically.
- Expand value scoring so costs and rewards across new surfaces are comparable.
- Guarantee meaningful variety in 100-Journey batches for early, mid, and late
  stages.

## Non-Goals

- V3 does not make the CLI interactive.
- V3 does not restore pending Journey state or `pick`-driven progression as the
  main simulator workflow.
- V3 does not simulate battles.
- V3 does not apply selected Journey effects to a persistent quest save.
- V3 does not require production UI, art, animation, or hover-card behavior.
- V3 does not require final numeric balance to be perfect.
- V3 does not use rendered text as the authoritative effect contract.
- V3 does not require designers to understand tides in normal Journey output.
- V3 does not replace the existing shape-first architecture with a global bag of
  unrelated effects.

## Existing Behavior To Preserve

The primary command remains a stateless generator. A normal invocation generates
one Journey from local content and exits. `journey run` may continue as a
compatibility alias if it uses the same stateless path.

Existing flags remain compatible:

- `--seed` fixes deterministic generation;
- `--stage` fixes early, mid, or late stage texture;
- `--shape` constrains generation to one canonical shape;
- `--count` generates deterministic batches;
- `--json` emits structured output without ANSI color;
- `--debug` exposes generation metadata;
- `--debug-context` exposes the simulated quest context;
- `--no-color` disables ANSI color in human output.

Existing shapes remain valid. V3 may add shape-specific variants and richer fill
rules, but it must not remove shape IDs that current tests and docs rely on
unless a separate compatibility decision explicitly changes that contract.

Existing manifest fields may evolve through a schema version bump, but the
manifest remains the shared contract for validation, human rendering, JSON
rendering, debug output, and golden-seed inspection.

Existing content loading remains TOML-backed. Cards, Dreamcallers, and
Dreamsigns from local content continue to define the authoritative object
universe for named references.

## V3 Architectural Direction

V3 keeps the current high-level pipeline:

- build a deterministic simulated quest context;
- choose desired stage texture and site tags;
- score legal Journey Shapes;
- select a shape through weighted randomness;
- fill the shape with structured payloads;
- validate and repair the manifest;
- render human and JSON output from the manifest.

The main V3 change is the introduction of a semantic payload model between
shape selection and rendering. Today many fills are authored as narrow templates
that directly produce option text plus loosely typed arrays. V3 should instead
author structured effect intents first, then render them. Text remains a view of
the manifest, not the primary artifact.

The semantic payload model should cover:

- object references;
- target selectors;
- operations;
- costs;
- burdens;
- rewards;
- temporary effects;
- persistent statuses;
- delayed hooks;
- route edits;
- random envelopes;
- reveal envelopes;
- generated custom objects;
- value metadata;
- visibility policy;
- validation requirements.

This model must be compact enough for designers to review in JSON, but rich
enough that validators can answer real legality questions. For example, a
Journey that says "Purge {Nocturne Strummer}. Gain {Charm Bracelet}." should
not be represented as just text. It should reference the card object, mark the
purge as a cost or sacrifice against a deck target, reference the Dreamsign
object, classify the gain as a reward, and include value estimates for the
trade.

## Core Domain Concepts

### Journey Shape

A Journey Shape remains the authored choice topology. It defines how options
relate to one another: shared cost, shared reward class, one target with many
operations, one operation across targets, take-any-number cache, complete
decision tree, route edit menu, delayed promise, wager, random outcome, or
another canonical topology.

V3 should not create a new shape for every brainstorm example. Most examples
are existing shapes filled with richer payloads. New shapes should be rare and
reserved for genuinely new topology that cannot be described by current shape
contracts or shape-specific fill rules.

A shape must not hardcode one showcase version of its topology. For example,
`one_operation_many_targets` must not know that it offers only Bronze,
Viridian, Prismatic, and Golden transfigurations, or that its targets are always
generic text. The shape should say "choose one operation family and apply it
across several legal targets" while the payload catalog supplies every legal
operation, transfiguration, target selector, named-object policy, and rendering
policy that can satisfy that topology.

Shape-specific rules may restrict payloads for coherence, safety, value, or
presentation. They may not restrict payloads merely because the original
implementation happened to support only a narrow example. If Scarlet
Transfiguration is a legal transfiguration payload, and named card targets are
legal for the selected operation family, a shape that compares transfiguration
targets must be able to use them unless a documented validation rule excludes
that exact combination.

### Payload Family

A payload family is a reusable semantic category that can fill many shapes.
Examples include named Dreamsign gain, chosen card purge, random Bane purge,
route addition, temporary battle status, Dreamwell mutation, shop discount,
triggered card reward, and generated one-time status.

Payload families are not root scenes. A shop row can buy named Dreamsigns. A
timed-window menu can grant temporary Dreamsigns. A reward-after-trigger shape
can transform Banes into cards. The family describes what happens; the shape
describes how the player chooses.

### Object Reference

An object reference points to a known card, Dreamsign, Dreamcaller,
transfiguration, Bane, site type, status, or generated object. References must
be structured and validated.

Existing cards, Dreamcallers, and Dreamsigns should resolve against TOML
content. Standard Banes, site types, battle keywords, and transfigurations
should resolve against controlled vocabularies. Custom Journey-only objects
should resolve against generated object definitions embedded in the manifest.

### Target Selector

A target selector describes the set of legal objects an operation can affect.
It may name exact objects, reference a source such as deck or pool, use
predicates, or describe a random selection. The selector must also state whether
the exact target is visible before commitment, pre-rolled and visible, chosen
after commitment, or hidden within a bounded envelope.

Selectors must cover card predicates, Dreamsign predicates, Bane predicates,
site predicates, battle-zone predicates, Dreamwell-card predicates, status
predicates, and generated object predicates.

### Operation

An operation is a typed action over a target or resource. Examples include gain,
pay, lose, purge, transform, duplicate, draft, modify, add keyword, remove
keyword, rewrite type, merge, split, seal, recover, trade, apply
transfiguration, change route, adjust pool, and add status.

Operations must carry polarity. The same verb can be a reward, cost, burden, or
neutral structural change depending on target and context. Purging a Bane is a
reward. Purging a strong named card is usually a cost. Purging a duplicate
starter can be cleanup. The manifest should not force validators to infer this
from text alone.

### Timing And Trigger

Timing says when an operation applies. Trigger says what event causes it to
apply. V3 must support immediate effects, fixed future windows, battle counts,
victory counts, dreamscape visits, site visits, shop visits, object trigger
counts, card-play counts, card-add counts, essence-payment counts, and
return-scene hooks.

Every non-immediate operation must state what is tracked, when it expires, and
what happens if the trigger never resolves before the quest ends.

### Status

A status is a quest-scoped or battle-window rule mutation that is not naturally
represented as a Dreamsign. V3 must support statuses because the brainstorm
examples include one-time effects, temporary battle rule changes, permanent
prohibitions, both-player battle modifications, shop rules, Dreamwell rules,
and future reward hooks.

Statuses must be structured, visible, and bounded by validation. A status may be
positive, negative, neutral, or mixed. A positive persistent player benefit
should still prefer a Dreamsign when that representation is natural.

### Random Envelope

A random envelope describes a bounded random outcome. It must define the visible
pool, odds or weighting disclosure, replacement behavior, precommitment policy,
result count, failure behavior, and value treatment.

V3 random envelopes must support one-shot rolls, random costs, random rewards,
random target selection, reveal-then-choose, reveal-then-random, roll twice and
keep one, repeated pool draws, and resolved random series.

### Generated Object

A generated object is a Journey-specific card, Dreamsign, status, or
transfiguration that does not exist in TOML content. V3 should allow these only
when represented as manifest data with a stable ID, display name, type, rules
text, references, tags, value estimate, and validation result.

Generated objects should be rare and weighted toward late, structural,
high-weirdness, or custom-object shapes. They should not be used when a real
TOML-backed object can satisfy the design.

## Feature Coverage Requirements

### Named Card Effects

V3 must generate options that name specific cards from the content bundle.
Supported operations include gaining, purging, duplicating, transforming,
replacing, transfiguring, modifying text, changing type, adding keywords,
removing keywords, appearing in the opening hand, merging, splitting, and
creating temporary or duplicated copies.

Named card selection must use real eligibility checks. A card named in a deck
operation must exist in the simulated deck unless the option explicitly grants
or drafts it first. A card named as a draft or reward may come from the draft
pool, full catalog, a curated pool, or a generated object definition, depending
on the payload family.

### Card Predicate Effects

V3 must support broad and narrow card predicates from the brainstorm catalog:
starter, Bane, character, event, warrior, survivor, spirit animal, legendary,
fast, Reclaim, Foresee, Dissolve, Abandon, Materialized, energy-generation,
event-copying, low-cost, cost-one, transfigured, duplicate, multiple-ability,
and selected tide overlap for internal filtering.

Normal output should describe predicates in player-facing mechanical language.
It should not expose internal tide calculations or implementation-only tags.

### Draft And Gain Variants

Card draft screens should continue to show exactly four candidate cards. This
is a product and user-interface decision for V3, not a current implementation
accident. The generator should not produce card draft text such as "Draft 1 of
5 cards" or "Draft 1 of 12 cards," even when a brainstorm example uses a wider
choice count.

Within that fixed four-card draft surface, V3 may still vary the card
predicate, take count, copy behavior, timing, cost, burden, and follow-up
effect. It may support drafting more than one card from the four-card screen,
adding multiple copies of the selected card, gaining random cards, gaining
legendary cards, gaining named cards, gaining temporary cards, and gaining
cards with delayed costs or future transformations.

The value model must treat take count, copy count, predicate quality, and
timing as separate from choice breadth. "Draft 2 of 4 cards" is not just a
minor variant of "Draft 1 of 4 cards." Adding two copies of the chosen card is
another distinct payload family and should count as meaningful variety.

### Dreamsign Effects

V3 must generate named Dreamsign gains, purchases, losses, purges, duplicates,
transformations, temporary grants, copy gains, pool edits, trigger counters,
trade hooks, and random Dreamsign rewards.

The generator must distinguish between active Dreamsigns, Dreamsigns in the
pool, Dreamsigns in the full catalog, named custom Dreamsigns, and random
Dreamsign outcomes. It must also support Dreamsign predicates such as neutral,
tidal, quest-oriented, battle-oriented, curated pool, and selected tide overlap.

Named Dreamsign shop rows are a core V3 requirement. Examples such as buying
three named Dreamsigns for essence or omens should be generated as ordinary
shop-row fills, not special-cased one-off text.

### Bane Effects

V3 must support named Bane gain, multiple Bane copies, temporary Banes, delayed
Banes, Bane purge, random Bane purge, chosen Bane purge, Bane replacement,
Bane-to-card transformation, and Bane burdens attached to route, card, and
Dreamsign rewards.

Validation must know whether the simulated quest state has tracked Banes when a
chosen or random Bane purge requires an existing target. It should also allow
offers that name a Bane as a future burden or generated object without requiring
that Bane to already exist in the deck.

### Resource Costs And Rewards

V3 must support fixed essence, maximum essence, essence cap gain and loss,
restore to maximum, set current essence to a percentage of maximum, spend all
essence, pay maximum essence, pay all remaining essence, random essence ranges,
percentage essence costs, fixed omen costs, multi-omen costs, omen rewards, and
resource reward reductions.

The value model must understand resource availability. An unpayable immediate
cost is invalid, but a cost such as "pay all remaining essence" is always
payable and should scale with current context.

### Route And Atlas Effects

V3 must support replacing, adding, removing, purging, and probability-adjusting
sites in current, next, future, and full-atlas scopes. Site types must include
all player-facing site names used by the examples, including Dreamsign Draft if
that label remains distinct from Dreamsign Offering.

Route effects must carry route polarity and site-delta value. Adding a site is
not automatically positive. Removing all shop sites is a major persistent cost.
Adding a Dream Journey site with a Bane burden is a mixed structural offer.
Replacing a Draft site with a Purge site in the current dreamscape is usually
more concrete and easier to value than a vague future edit.

### Timed Battle And Dreamwell Effects

V3 must support timed battle effects involving opening hand size, per-turn draw,
starting energy, energy production, score thresholds, opponent Dreamsigns,
character spark, both-player rule changes, temporary card or Dreamsign grants,
and delayed loss after a window.

V3 must also support Dreamwell effects: changing first Dreamwell draws, adding
positive or penalty Dreamwell cards, upgrading Dreamwell cards, delaying
Dreamwell cards, and applying battle-window durations to those changes.

These effects should be represented as statuses or battle-window payloads, not
as freeform text.

### Shop And Economy Effects

V3 must support shop reroll discounts, free future purchases, next-shop essence
restoration, future shop trade hooks, purchase counters, and site-specific
economy modifiers.

Shop effects must state their scope clearly: current shop, next shop, future
shops for a number of dreamscapes, next N purchases, or permanent quest status.

### Delayed Hooks And Mini-Quests

V3 must support triggers such as after two victories, after two battles, after
each battle, after visiting a Purge site, after visiting a Transfiguration site,
after adding N event cards, after adding N character cards, after playing a
named card N times, after triggering a Dreamsign N times, after paying N
essence, at a future Shop, and at a future Dream Journey.

Every hook must be represented as a structured tracked condition with a reward,
cost, transformation, trade, or return-scene payload. The CLI does not need to
simulate hook resolution, but the manifest must be complete enough for future
quest code to do so.

### Statuses And Rule Mutations

V3 must support one-time statuses, temporary battle statuses, persistent quest
statuses, prohibitions, both-player battle rules, reward replacement, and
structural constraints.

Examples include one-time hand banish and draw effects, battle point caps,
players keeping unspent energy, players starting with fixed energy, no longer
gaining essence, no longer modifying the deck, no longer transfiguring cards,
victory rewards changing into Dreamsign drafts, and exact deck-size
constraints.

Validation must reject incoherent or unsupported statuses, but it must no
longer reject all statuses categorically.

### Custom Objects

V3 must allow Journey-specific custom cards, Dreamsigns, statuses, and
transfigurations when the example requires them. The generated object must be
fully specified in the manifest. It must have stable identity, player-facing
rules text, object type, tags, value estimate, references, duration or lifetime,
and validation metadata.

Generated custom objects should be treated as content for that manifest only.
They contribute to catalog versioning and distinctness, but they do not mutate
the source TOML files.

### Random, Reveal, And Wager Mechanics

V3 must support rolls for visible pools, random costs, random rewards, chance
to gain a Bane, chance to pay a cost, reveal N rewards, choose one revealed
reward, choose one random revealed reward, gain one random reward, roll twice
and keep one, and random ranges.

The manifest must distinguish expected value from risk premium. A 25% chance to
purge a random Dreamsign is not just one quarter of a deterministic purge cost
from the player's perspective.

### Sealing, Trading, Borrowing, And Returning

V3 must support sealing an object, later recovering it, borrowing temporary
objects, delayed loss and payment, trading named objects at future sites, and
paired-return callbacks.

These effects should use delayed hook and paired-return infrastructure rather
than bespoke text. A future return scene should know which exact object or
promise was created by the earlier Journey.

## Manifest Requirements

V3 should introduce a new manifest schema version. The schema should be
backward-compatible at the command level, but it does not need to preserve every
internal field shape from the current manifest.

The manifest must include:

- the Journey identity, seed, root index, stage, shape, and catalog versions;
- the simulated context summary needed for debugging;
- root options or complete tree data;
- structured operations for every cost, reward, burden, status, route edit, and
  hook;
- object references and generated object definitions;
- target selectors and visibility policy;
- random and reveal envelopes;
- value breakdowns and risk adjustments;
- validation results and repair metadata;
- distinctness fingerprints for batch validation;
- references used by human and JSON renderers.

Rendered option text should be derivable from structured operations. It may
contain curated wording, but the renderer should not be the only place that
knows an operation is a cost, burden, target, or delayed hook.

Decision-tree data remains complete up front. Sequential Journeys must expose
all levels, branches, odds, stop options, failure terminals, and rewards in the
manifest.

## Authoring Model

V3 should replace hand-authored option templates with a small set of authored
contracts that compose into a manifest. The important change is not that every
effect becomes generic. The important change is that shapes, payloads, targets,
and curated variants each own one clear responsibility.

The current filler layer mixes several responsibilities in one place: it chooses
a shape, picks a narrow hardcoded reward list, chooses targets, creates text,
assigns approximate values, and emits loosely typed manifest arrays. V3 should
split that into four authored concepts: shape contracts, payload specs, target
selectors, and curated variants. Generation then produces a typed fill plan
before rendering any text.

A shape contract describes only the choice topology. It should answer questions
such as:

- how many root options or tree branches are required;
- whether options share a cost, reward, target, operation, timing, or motif;
- which payload families are eligible;
- which target-source and visibility policies are allowed;
- which value ranges must be comparable;
- which information must be visible before commitment.

A shape contract should not name Scarlet, Golden, Ginger Root, Nocturne
Strummer, or any other concrete object unless that object is part of a separate
curated variant selected by the generator. `one_operation_many_targets`, for
example, should request one operation family and several legal targets. It
should not contain a local list of four transfigurations or a local phrase such
as "a chosen card" that prevents named targets from appearing.

A payload spec describes one reusable mechanical operation or operation family.
Examples include applying a transfiguration, gaining a named Dreamsign,
purging a chosen card, transforming a Bane into a card, adding a route site,
creating a status, or resolving a random envelope. A payload spec should own:

- operation verb and polarity;
- legal target kinds and arity;
- legal timing and trigger policies;
- legal visibility policies;
- value rules and risk adjustments;
- rendering fragments;
- required validation rules;
- distinctness fields.

The payload catalog owns breadth. If the game supports Scarlet
Transfiguration, named card targets, chosen card targets, random card targets,
and three visible target options, those capabilities should be represented once
in payload and selector data. Every shape that accepts a compatible
transfiguration operation should then be able to use them.

A target selector describes how concrete objects are chosen. It should support
exact names, deck objects, draft-pool objects, active Dreamsigns, Dreamsign-pool
objects, Bane vocabulary entries, generated objects, and predicate-selected
sets. It should also state whether targets are named in the root option,
chosen after commitment, random after commitment, or pre-rolled and visible.

A curated variant binds several compatible specs together when independent
sampling would produce weak design. Variants are appropriate for named
Dreamsign shop rows, starter-card locksmith menus, Bane-to-card contracts,
Dreamwell windows, sealed-object returns, and other compound motifs. A variant
should still use reusable payload specs and selectors. It may say "select three
thematically compatible named Dreamsigns and price them with the same currency."
It should not be a shape-local branch that directly emits Ginger Root, Cloud
Lens, and Leather Satchel as special-case text.

Generation should produce a fill plan before rendering. A fill plan is the
resolved answer to the shape contract: selected shape, selected variant if any,
selected payload specs, selected target selectors, concrete named objects when
visible, costs, timings, random envelopes, value estimates, and validation
requirements. The renderer then turns the fill plan into option text, and the
manifest stores the same structured operations the renderer used.

This model produces the desired output without hardcoding examples. For a
"one blessing, three vessels" Journey, the selected shape is
`one_operation_many_targets`. The fill plan chooses the transfiguration
operation family, chooses Scarlet from the legal transfiguration payloads,
chooses three visible named card targets from a legal card selector, validates
that each target exists, and renders three parallel options. Nothing in the
shape needs to know those specific card names.

For a named Dreamsign shop row, the selected shape is `shop_row`. A shop-row
variant requests purchasable named Dreamsign rewards, one shared currency, and
comparable prices. The target selector chooses visible Dreamsign objects from
the content bundle, the cost spec prices each offer, validation checks that the
objects resolve, and rendering emits the row as purchases. The same shape can
also sell cards, services, or generated objects when another compatible variant
is selected.

For a delayed Bane contract, the selected shape may be `reward_after_trigger`,
`single_offer`, or `commit_now_future_payoff`. The variant binds a Bane gain, a
tracked trigger, and a later transformation or reward. The trigger spec owns
how "after two battles" or "after adding three event cards" is represented, and
the payload specs own the immediate Bane and delayed payoff. The shape only
enforces that the promise is visible and trackable.

This separation gives implementers a concrete rule for future work: when a
missing brainstorm example is caused by an operation, target, object, timing, or
visibility gap, add or generalize the payload spec or selector. Change the
shape only when the option topology itself is wrong.

## Shape Fill Requirements

Each shape must define its legal payload families, root option count,
symmetry requirements, value bounds, stage weights, and distinctness fields.

Shape fill rules must be declarative capability filters. They can require
"same operation across multiple targets," "all options are named visible
targets," "all options use one transfiguration family," or "all targets are
cards in the simulated deck." They should not enumerate one-off operation names,
card names, Dreamsign names, or target phrases inside the shape unless that
enumeration is itself a reusable curated variant with validation and value
metadata.

Shared-cost shapes must enforce a visibly shared cost while allowing richer
cost kinds than fixed essence. The shared cost may be a named Bane, percentage
essence, omen payment, temporary status, or object sacrifice if every option
uses the same cost contract.

Shared-reward shapes must enforce an escalating or comparable reward class. The
reward may vary by quality, quantity, reliability, timing, target specificity,
or visibility, but the player should understand the shared ambition.

Service menus must support mixed operations over cards, Dreamsigns, routes,
resources, and statuses when the services share a coherent scene frame.

Shop rows must support essence, omen, object, and special-currency prices.
Named card and Dreamsign purchases should be first-class shop-row fills.

One-target and one-operation shapes must support named targets, chosen targets,
random targets, visible pre-rolled targets, and target predicates.

One-operation shapes must also support the full legal operation family selected
for the scene. If the chosen operation family is transfiguration, every
transfiguration payload that is legal for the target class should be reachable.
If the chosen operation family is purge, duplicate, transform, rewrite, merge,
or split, the same rule applies. Missing examples should usually be fixed by
expanding payload family eligibility, not by adding another narrow branch to the
shape.

Timed-window menus must support battle, Dreamwell, shop, route, and temporary
object windows. The shared timing is the scene identity.

Random and wager shapes must use structured random envelopes and disclose
enough information for the player to evaluate risk.

Delayed and return shapes must create trackable hooks rather than simple text
promises.

Route shapes must support current, next, future, and atlas-wide effects while
enforcing route polarity and visibility rules.

## Value And Balance Model

V3 needs a broader essence-equivalent model. The model does not need perfect
balance, but it must prevent nonsensical trades and keep generated choices
reviewable.

Every payload family should provide:

- base value;
- quantity scaling;
- stage multipliers;
- target-quality modifiers;
- visibility modifiers;
- randomness adjustments;
- duration scaling;
- persistence scaling;
- risk premium;
- context requirements;
- hard invalidity conditions.

Named objects require object-aware value estimates. The model may start with
coarse rarity, type, cost, spark, keyword, and Dreamsign-kind heuristics, but it
must not value every named object identically.

Compound effects should expose total value and component value. For example,
"Gain {Dead Rat}. After 2 victories, gain {Essence Vial}." is not just two
independent Dreamsign gains; it is an immediate object plus a delayed promise.

Negative persistent statuses need strong value penalties. Permanent
prohibitions such as no longer gaining essence are run-defining costs and should
appear only in high-stakes shapes with major compensation.

Random outcomes should be valued using expected value plus risk premium. Hidden
or delayed outcomes should receive additional uncertainty adjustments.

## Validation Requirements

V3 validation must move from "reject unsupported category" to "prove supported
category is coherent." It should reject unsupported status kinds or invalid
custom objects, but not all statuses or custom objects by default.

Validation must check:

- all named references resolve;
- generated objects are complete;
- required targets exist;
- shape restrictions are capability contracts, not hardcoded example lists;
- chosen targets use legal predicates;
- immediate costs are payable;
- delayed costs define trigger and failure behavior;
- status scopes are legal;
- route effects reference legal site types and scopes;
- random envelopes expose required odds or pool descriptions;
- hidden important outcomes are not used;
- shape-specific option counts and symmetry rules hold;
- positive scenes do not contain negative-only root options;
- choose-your-loss options are all meaningful losses;
- value ranges are comparable for the shape;
- route additions are not treated as free positive rewards without context;
- persistent hooks fit within a bounded hook budget;
- normal output avoids implementation-only language;
- JSON output contains all information rendered in human output.

Validation should also emit machine-readable rule IDs that tests and debug
output can use. Repairs may adjust magnitude, replace a payload, narrow a
target, swap a shape-compatible variant, or fall back to another legal fill. A
repair must not silently change the shape when the user forced `--shape`.

## Variety And Distinctness

The V3 generator must explicitly track meaningful distinctness. This should be
separate from the ordinary Journey ID and from rendered text.

A distinctness fingerprint should include:

- shape ID;
- topology class;
- payload families;
- operation verbs;
- target classes;
- named object identities;
- generated object archetypes;
- timing and trigger classes;
- route scopes;
- status scopes;
- random envelope type;
- visibility policy;
- major cost family;
- major reward family;
- major burden family;
- selected motif or curated variant ID.

The fingerprint should intentionally ignore or down-rank trivial numeric
changes. Essence amount, omen count, percentage chance, duration count, and
choice count can contribute only when they cross semantic bands, such as
low-cost versus all-remaining, next battle versus five battles, or one card
versus all cards.

For each stage, `journey --stage <stage> --count 100 --seed <seed>` should
produce 100 unique meaningful fingerprints. If a forced shape is used, the same
standard does not need to hold for every shape individually, but forced-shape
batches should still show broad payload variety where the shape has enough
legal fills.

Debug and JSON output should expose the fingerprint and the reason two outputs
would be considered equivalent. This makes the acceptance criterion testable
without relying on subjective visual inspection alone.

## Stage Texture

V3 should preserve stage-aware generation while broadening possible payloads.

Early Journeys should emphasize building, cleanup, immediate resources,
starter-card decisions, named low-risk Dreamsigns, basic route improvements,
and legible small bargains. Weird effects can appear early, but they should not
dominate.

Mid Journeys should emphasize refinement, Dreamsign operations, card rewrites,
delayed hooks, shop economy, Dreamwell windows, moderate risks, and route
planning.

Late Journeys should emphasize conversion, structural commitments, custom
objects, severe costs, permanent statuses, global route changes, large
resource swings, high-stakes wagers, and build-defining transformations.

Stage texture should change which payload families and motifs are likely. It
should not merely scale numbers upward.

## Rendering Requirements

Normal human output remains concise and mechanical. It should show the Journey
itself, not implementation internals.

Rendered text must support named references with braces where that is the
existing convention, clear timing clauses, visible costs, visible odds, and
complete tree branches. It must avoid shape names, internal tags, tide names,
debug IDs, and hidden scoring details.

Referenced objects should be listed in JSON and debug metadata so a future UI
can provide hover cards. The CLI does not need to render full object popups in
normal output.

When an option contains a generated custom object, normal output should show
the object name and compact rules text if needed to make the option
understandable. JSON should include the full generated object definition.

Decision trees must remain complete in normal output. There should be no hidden
follow-up menu that only appears after a pick.

## JSON And Debug Requirements

JSON output must be a faithful structured representation of the same Journey
shown in human output. It should include complete operations, generated
objects, statuses, hooks, random envelopes, route edits, value breakdowns,
fingerprints, validation metadata, and context summaries.

Debug output should explain why a Journey was possible:

- chosen stage texture;
- desired tags;
- shape scores;
- selected shape;
- selected payload families;
- target pool sizes;
- named object selection source;
- value estimates;
- risk adjustments;
- repairs;
- validation rule results;
- distinctness fingerprint.

Debug output may be verbose. Normal output should remain focused.

## Compatibility And Migration

V3 should preserve command behavior before changing internals. Existing tests
for stateless generation, deterministic seeds, shape forcing, no-color output,
JSON rendering, and content loading should continue to pass after expected
schema updates.

Manifest schema changes should be versioned. Renderers should read the V3
manifest directly. Compatibility adapters may exist for tests or older fixtures,
but new generation should use the V3 schema.

Existing shapes should keep their IDs. Existing generated examples may change
because the payload catalog and distinctness requirements are broader, but a
forced shape should still produce a legal Journey or a clear error.

Current validators that reject custom content, statuses, battlefield mutation,
or unsupported route additions must be replaced with allowlisted structured
validation for the V3 payload model.

The content version should include source TOML content. The catalog version
should include shape definitions, payload family definitions, generated object
recipes, value rules, validation rules, and rendering rules that affect output.

## Testing Requirements

V3 requires automated tests at several levels.

Content tests should prove named references resolve across cards, Dreamcallers,
Dreamsigns, Banes, site types, transfigurations, statuses, and generated
objects.

Payload tests should cover each feature family from the brainstorm examples:
named cards, named Dreamsigns, Banes, resources, route edits, timings, hooks,
statuses, Dreamwell effects, shop effects, random envelopes, reveal envelopes,
custom objects, and card rewrites.

Shape tests should force each shape and verify that V3 payloads satisfy
shape-specific invariants.

Renderer tests should prove human and JSON output are derived from the same
manifest and include all required information.

Validation tests should cover both legal and illegal examples for each new
payload family.

Value tests should cover broad equivalence and rejection of nonsensical trades.

Batch-variety tests should run 100-Journey generation for early, mid, and late
stages and assert 100 meaningful fingerprints per stage.

Golden-seed tests should pin a small number of representative high-complexity
Journeys, including a named Dreamsign shop row, a delayed hook, a route edit, a
status, a custom object, and a complete decision tree.

## Manual QA Requirements

Comprehensive manual QA is mandatory for this project. Automated tests can
prove contracts and prevent regressions, but they are not enough for a
procedural design-review CLI whose primary output is human-readable generated
Journey text.

Every V3 feature change should be validated through the actual `journey`
command before it is considered complete. Manual QA should use deterministic
seeds so failures can be reproduced, and it should cover normal output, JSON
output, debug output, debug-context output, no-color output, stage constraints,
shape constraints, and representative batch generation.

Manual QA must inspect both mechanical correctness and design quality. The
reviewer should confirm that generated options are understandable, shape
relationships are visible, named references are real, costs and rewards are
strategically plausible, random envelopes disclose enough information, decision
trees are complete, and ordinary output does not expose internal implementation
language.

Manual QA for a payload family should force or otherwise reach at least one
Journey that uses that family. If a feature is hard to reach naturally, the tool
should provide an intentional deterministic debug surface rather than relying on
chance. Throwaway local scaffolding should not remain in the product unless it
becomes a documented QA surface.

Manual QA for V3 variety should include 100-Journey batches for early, mid, and
late stages. The reviewer should inspect the distinctness report or debug
fingerprints and spot-check the rendered output to confirm that distinctness is
semantic rather than numeric.

Manual QA evidence should be recorded with the exact commands, seeds, stages,
shape constraints, and observed pass or failure notes. A V3 change that cannot
be manually exercised through the CLI is incomplete unless the missing CLI
surface is itself the explicitly identified blocker.

## Operational Considerations

The generator should fail clearly when no legal fill exists. A validation
failure should identify the rule, shape, payload family, and target selection
that caused the failure.

Batch generation should remain fast enough for routine design review. If V3
payload enumeration becomes expensive, the implementation should cache resolved
target pools and value estimates within one command invocation.

Debug output should make content-authoring problems obvious. Missing named
objects, empty target pools, unsupported status scopes, invalid site types, and
unbalanced payloads should produce actionable errors.

The generator should avoid excessive hook saturation. Delayed hooks, statuses,
and paired returns are memorable partly because they are not everywhere. The
simulated context should track a hook budget even when the CLI is stateless, so
single generated Journeys do not contain too many persistent obligations.

## Risks And Tradeoffs

The biggest risk is overgeneralization. A fully generic operation system could
generate legal but incoherent scenes. V3 mitigates this by keeping Journey
Shapes primary and adding curated variants for compound ideas.

The second risk is value false confidence. Essence-equivalent scoring will not
capture every strategic nuance. V3 should use value to reject obvious mistakes
and compare broad magnitudes, not to claim perfect balance.

The third risk is custom-object sprawl. Generated cards, Dreamsigns, statuses,
and transfigurations can make the output hard to review. V3 should keep them
structured, validated, weighted down by default, and visible in debug output.

The fourth risk is validation brittleness. If validators are too strict, rich
payloads will be impossible to generate. If they are too loose, text-only
mistakes will slip through. V3 should prefer allowlisted typed contracts over
blanket category bans.

The fifth risk is variety theater. A generator can appear varied while mostly
changing quantities. The distinctness fingerprint is required to prevent this.

## Acceptance Criteria

V3 is complete when the `journey` tool can generate examples covering every
feature class represented in `docs/brainstorm_examples.md`.

V3 is complete when existing stateless CLI behavior still works with seed,
stage, shape, count, JSON, debug, debug-context, and no-color controls.

V3 is complete when every generated Journey validates through structured
manifest rules before rendering.

V3 is complete when normal output contains no hidden implementation-only
language and JSON contains the full structured contract behind that output.

V3 is complete when early, mid, and late 100-Journey batches each contain 100
meaningfully distinct fingerprints.

V3 is complete when forced-shape QA can generate at least one legal Journey for
every canonical shape under at least one deterministic context, or else reports
a clear legality error explaining the missing context requirement.

V3 is complete when the generator can produce, at minimum, the following
representative Journey classes:

- named Dreamsign shop rows with essence and omen prices;
- named card operation menus;
- starter-card cleanup and replacement scenes;
- Dreamsign transform, duplicate, purge, and copy scenes;
- Bane gain, Bane purge, temporary Bane, and Bane transformation scenes;
- resource offers involving maximum, percentage, random-range, and
  all-remaining essence;
- route additions, removals, replacements, purges, and future probability
  changes;
- timed battle and Dreamwell windows;
- shop-economy windows and future trades;
- delayed hooks based on battles, victories, site visits, plays, triggers,
  additions, and essence payment;
- one-time, temporary, and persistent statuses;
- custom Journey-only objects;
- reveal, roll, random-pool, wager, and keep-one mechanics;
- seal, recover, borrow, trade, and paired-return mechanics;
- complete decision-tree Journeys using richer V3 payloads.
