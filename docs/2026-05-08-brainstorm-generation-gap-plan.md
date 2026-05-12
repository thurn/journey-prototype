# Brainstorm Generation Gap Project Plan

## Summary

This project plan describes how to close the procedural generation gaps recorded
in [Brainstorm Examples](brainstorm_examples.md). The target outcome is that
most or all brainstorm examples are plausible outputs of the `journey` command
because the generator can compose their mechanical feature classes from reusable
Journey Shapes, payload families, target selectors, value rules, validators,
and renderer support.

The target is not to reproduce exact authored transcripts from
`brainstorm_examples.md`. The examples are coverage labels for capability
families. The generator should not hardcode rows such as "Buy {Ginger Root} for
85 essence" or "Apply {Scarlet Transfiguration} to {Aspiring Guardian}". Those
rows should become reachable because the normal generator can select named
Dreamsign purchases, shared-cost shops, Scarlet Transfiguration operations, and
named card target sets from weighted procedural pools.

The most important missing behavior is internal symmetry. Strong examples often
hold one part of the menu constant while varying another part: one operation
across three named targets, one burden across three different rewards, one
shared route source across three route destinations, one currency across three
named Dreamsigns, or one timing window across several comparable effects. This
plan therefore prioritizes reusable symmetric fill contracts over one-off
content.

## Related Information

- [Brainstorm Examples](brainstorm_examples.md) is the historical gap
  inventory and the primary coverage source for this plan.
- [Dream Journey V3 Technical Design](2026-05-07-dream-journey-v3-design.md)
  defines the semantic payload direction that this project should finish.
- [Procedural Generation Failure Analysis](2026-05-08-procedural-generation-failures.md)
  records prior hardcoding failures and the preferred direction away from fixed
  production recipes.
- [Dream Journey Generation](dream_journey_generation.md) defines the
  shape-first model, stage texture goals, value constraints, and precommitment
  contract.
- [Adding a Journey Shape](adding_journey_shape.md) explains the shape plugin
  workflow under `src/journey/shapes/`.
- [Dream Journey Brainstorm](dream_journey_brainstorm.md) provides broader
  idea catalog context beyond the audited examples.
- [Dreamtides Quests](quests.md) defines route, Dreamsign, resource, tide, and
  quest vocabulary.
- [Battle Rules](battle_rules.md) defines card, Dreamwell, battle, Bane, and
  keyword vocabulary used by Journey payloads.

## Current Architecture

The CLI is a deterministic, stateless procedural generator. The main path starts
in [src/cli.ts](../src/cli.ts), dispatches through command handlers in
[src/commands/](../src/commands/), builds a simulated quest context from
[src/quest/init.ts](../src/quest/init.ts) and
[src/quest/context.ts](../src/quest/context.ts), selects a Journey Shape in
[src/journey/generate.ts](../src/journey/generate.ts), fills it through shape
plugins in [src/journey/shapes/](../src/journey/shapes/) and shared filler code
in [src/journey/fillers/](../src/journey/fillers/), validates the manifest in
[src/journey/validate/](../src/journey/validate/), and renders human and JSON
output from [src/render/](../src/render/).

The current manifest model in [src/journey/manifest.ts](../src/journey/manifest.ts)
already contains many of the semantic surfaces needed by the brainstorm
examples: target selectors, operation roles, resource semantics, delayed hooks,
paired returns, random envelopes, generated objects, and value metadata.
However, normal generation still reaches only a narrower set of payloads than
the manifest can describe. Several richer payloads exist only as debug fixtures
under [src/journey/fixtures/debug/](../src/journey/fixtures/debug/), which is
useful for QA but does not satisfy the procedural goal.

## Project Principles

- Keep Journey Shape as the primary authored unit. New code should ask which
  topology is being filled before choosing concrete rewards or names.
- Use content-backed references for real cards and Dreamsigns from
  [data/cards.toml](../data/cards.toml) and
  [data/dreamsigns.toml](../data/dreamsigns.toml).
- Use controlled vocabularies for Banes, transfigurations, route sites,
  Dreamwell concepts, and battle keywords in
  [src/journey/effects.ts](../src/journey/effects.ts).
- Treat exact brainstorm names as ordinary candidates, not fixed requirements.
  Exact names may appear under fixed seeds, but the normal generator should be
  choosing from eligible weighted pools.
- Prefer reusable payload catalogs over shape-local arrays. Shapes should own
  topology and coherence constraints; payload catalogs should own mechanical
  breadth.
- Keep random outcomes precommitted in the manifest. Human text and JSON should
  derive from the same structured operations.
- Add validation before relying on a new payload in normal generation.
- Add debug and test reachability surfaces for feature classes that are rare in
  organic generation.
- Preserve deterministic replay for seed, content version, stage, forced shape,
  and count.

## Success Criteria

- A coverage audit can map every brainstorm example to one or more supported
  capability families, even when exact numeric amounts or exact object names
  vary.
- Organic generation reaches every major capability family in deterministic
  batches without forced debug payloads.
- Forced-shape QA can demonstrate important symmetric patterns such as one
  operation across named targets and same cost across named Dreamsign purchases.
- Debug payloads remain deterministic fixtures, but tests do not treat them as
  evidence that normal generation can compose the feature.
- Existing JSON and human renderers continue to use manifest data as the source
  of truth.
- Batch distinctness continues to reflect semantic differences, not only
  amounts or phrasing.

## Milestone 1: Build A Reachability Coverage Matrix

Create a maintained coverage matrix that turns
`docs/brainstorm_examples.md` into feature-family requirements. This should not
assert exact rows. It should record which capability classes each example needs
and which normal generator paths can currently reach those classes.

Relevant files:

- [docs/brainstorm_examples.md](brainstorm_examples.md)
- [docs/2026-05-07-dream-journey-v3-design.md](2026-05-07-dream-journey-v3-design.md)
- [test/journey-generation.test.ts](../test/journey-generation.test.ts)
- [src/journey/fillers/fingerprint.ts](../src/journey/fillers/fingerprint.ts)
- [src/journey/debugPayloads.ts](../src/journey/debugPayloads.ts)

Required work:

- Add a docs or analysis artifact listing each brainstorm example, its needed
  shape topology, payload families, selector families, timing families, and
  whether normal generation reaches those families.
- Mark exact names and exact amounts as non-normative unless they reveal a
  missing selector, cost band, or payload class.
- Add test helpers that can search generated manifests for capability families
  by structured operations rather than rendered text.
- Expose enough debug metadata to identify why a family did or did not appear
  in a deterministic batch.

Acceptance criteria:

- The matrix distinguishes "debug fixture exists" from "normal generator can
  compose this".
- At least one automated reachability test uses the matrix categories and
  checks structured manifest operations.
- No test asserts exact brainstorm transcript text as normal output.

## Milestone 2: Introduce A Fill-Plan Boundary

The filler layer currently creates option text, legacy payload records, values,
targets, and precommits together. Add an internal fill-plan boundary so shapes
can request semantic payloads first and render them second.

Relevant files:

- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/fillers/shared.ts](../src/journey/fillers/shared.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/manifest.ts](../src/journey/manifest.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add a lightweight internal type for resolved shape fills: selected payload
  specs, target selectors, concrete visible objects, costs, burdens, timings,
  random envelopes, and value estimates.
- Keep the public manifest schema stable unless a later milestone requires a
  schema bump.
- Convert one or two low-risk fills first, such as `shop_row` and
  `one_operation_many_targets`, to prove the boundary.
- Ensure renderer text still comes from manifest operations and payload
  metadata, not from new freeform strings.

Acceptance criteria:

- Converted shapes still generate identical or equivalent legal manifests under
  fixed seeds.
- The fill plan can represent a shared operation with several target selectors
  before option text is rendered.
- The adapter layer still produces typed `JourneyOperation` records for all
  converted options.

## Milestone 3: Expand Content-Backed Object Selection

Many examples need named cards and named Dreamsigns to appear naturally. Add a
shared object-selection catalog that can choose visible exact objects from
content while respecting source, eligibility, value, and current context.

Relevant files:

- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/fillers/namedCardPayloads.ts](../src/journey/fillers/namedCardPayloads.ts)
- [src/journey/fillers/dreamsignPayloads.ts](../src/journey/fillers/dreamsignPayloads.ts)
- [src/journey/fillers/generatedObjectSelection.ts](../src/journey/fillers/generatedObjectSelection.ts)
- [src/quest/init.ts](../src/quest/init.ts)
- [src/quest/packageResolution.ts](../src/quest/packageResolution.ts)
- [data/cards.toml](../data/cards.toml)
- [data/dreamsigns.toml](../data/dreamsigns.toml)

Required work:

- Provide reusable selectors for catalog cards, deck cards, draft-pool cards,
  active Dreamsigns, Dreamsign pool entries, full Dreamsign catalog entries,
  and generated objects.
- Track whether a visible named target is an exact current object, a catalog
  reward, a draft-pool candidate, or a future/generated object.
- Add weight hooks for rarity, tide overlap, Dreamsign kind, starter status,
  current deck availability, and stage.
- Preserve validation that deck operations requiring current targets only select
  objects actually present in the simulated deck.
- Avoid making the initial stateless deck artificially contain every named card.
  Catalog grants and catalog transformations should be explicit when the card
  is not in the deck.

Acceptance criteria:

- Normal generation can emit content-backed named card gains and named
  Dreamsign gains without forced debug payloads.
- Named deck operations validate against the simulated deck.
- Named catalog rewards validate against TOML content.
- JSON output includes target-resolution metadata for visible named objects.

## Milestone 4: Broaden Card Predicate Drafts And Gains

The brainstorm examples depend heavily on draft predicates and card-gain
variants that are currently missing or too narrow.

Relevant files:

- [src/journey/fillers/shared.ts](../src/journey/fillers/shared.ts)
- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/value.ts](../src/journey/value.ts)
- [src/journey/validate/targetSelectors.ts](../src/journey/validate/targetSelectors.ts)
- [src/journey/validate/options.ts](../src/journey/validate/options.ts)
- [data/cards.toml](../data/cards.toml)

Required work:

- Expand `CARD_DRAFT_PROFILES` or move it into a richer card-predicate catalog.
- Add predicates for discard text, Abandon, event-copying, energy generation,
  Legendary rarity, cost exactly 1, cost 2 or less, duplicate cards, cards with
  multiple abilities, all events, all characters, all starters, and all
  eligible cards.
- Support `takeCount` greater than 1 while keeping `choiceCount` at 4 unless a
  separate product decision changes the draft UI.
- Support drafted-card copy semantics such as "draft 1 of 4 and add 2 copies".
- Support random card gains with predicate and count metadata.
- Add values for predicate specificity, take count, copy count, random gain,
  and temporary gain.

Acceptance criteria:

- Normal manifests can include draft predicates for abilities and card text
  without relying on text parsing in tests.
- Validation rejects a predicate draft if the source pool has too few eligible
  cards.
- Value metadata distinguishes choice breadth, take count, copy count, and
  random hidden target risk.
- Validate that [Three Masks](brainstorm_examples.md#three-masks) is possible
  as a procedural draft trio over character, event, and fast-card predicates.
- Validate that [Eight Windows](brainstorm_examples.md#eight-windows) is
  possible as predicate drafts, any-number card selection, and random event
  card gain without hardcoding those rows.

## Milestone 5: Expand The Card Operation Catalog

Card-operation examples are currently blocked by a small operation catalog and
generic targets. Expand card operations so normal shapes can compose named,
chosen, random, batch, and all-card mutations.

Relevant files:

- [src/journey/fillers/cardOperationCatalog.ts](../src/journey/fillers/cardOperationCatalog.ts)
- [src/journey/fillers/namedCardPayloads.ts](../src/journey/fillers/namedCardPayloads.ts)
- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/semanticOperations.ts](../src/journey/validate/semanticOperations.ts)
- [src/journey/validate/targetSelectors.ts](../src/journey/validate/targetSelectors.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add operations for chosen purge, random purge, all-duplicate purge, starter
  replacement, named card replacement, transform to random card, transform to
  named card, duplicate count, batch duplicate, merge, split, type change,
  subtype change, keyword removal, transfiguration removal, text modification,
  target-restriction removal, opening-hand placement, materialized-ability
  conversion, all-card transfiguration, all-event transfiguration, and random
  predicate transfiguration.
- Add target compatibility metadata for chosen, exact named, random predicate,
  all matching, and drafted-card targets.
- Add operation-family filters so shapes can request coherent sets such as
  "three transfigurations for one card" or "one duplicate operation across
  three visible targets".
- Preserve special handling for standard Transfigurations while allowing
  generated or expanded transfiguration names through controlled vocabularies.

Acceptance criteria:

- `one_target_many_operations` and `one_operation_many_targets` can use the
  expanded catalog without shape-local special cases.
- Normal output can produce named card operation rows as a weighted outcome.
- Validation catches incompatible target and operation pairs before rendering.
- Validate that [Ink Reassignment](brainstorm_examples.md#ink-reassignment)
  is possible as text modification, subtype change, and event keyword rewrite
  operations chosen from the normal card-operation catalog.
- Validate that [Split Signal](brainstorm_examples.md#split-signal) is possible
  as merge, split, and materialized-ability conversion operations.

## Milestone 6: Add Starter Transformation And Replacement Families

Starter-focused examples need more than single starter cleanup. Add reusable
starter surgery families for chosen, random, all-starter, and replacement
patterns.

Relevant files:

- [src/journey/fillers/shared.ts](../src/journey/fillers/shared.ts)
- [src/journey/fillers/cardOperationCatalog.ts](../src/journey/fillers/cardOperationCatalog.ts)
- [src/journey/fillers/namedCardPayloads.ts](../src/journey/fillers/namedCardPayloads.ts)
- [src/journey/validate/options.ts](../src/journey/validate/options.ts)
- [src/journey/value.ts](../src/journey/value.ts)
- [src/quest/init.ts](../src/quest/init.ts)

Required work:

- Add payloads for purge up to 2 starters, purge a random starter, purge all
  starters, replace a starter with a named catalog card, replace a starter with
  a draft choice, replace all starters with starter-eligible cards, gain extra
  starter cards, transfigure random starters, and apply one operation to two
  chosen starters.
- Use the simulated starter deck from `createInitialJourneyState` as the
  current-state target source.
- Add value logic that treats starter cleanup differently from purging useful
  non-starter cards.
- Expose enough target metadata for debug output to show how many starter cards
  are available.

Acceptance criteria:

- Normal generation can produce a starter surgery menu without debug fixtures.
- Operations requiring multiple starters fail or repair cleanly when too few
  starters are available.
- The value model separates cleanup rewards from card-sacrifice costs.
- Validate that [Starter Door](brainstorm_examples.md#starter-door) is possible
  as chosen starter transformation, random starter replacement, and all-starter
  replacement.
- Validate that [Locksmith Counter](brainstorm_examples.md#locksmith-counter)
  is possible as a starter-focused purge, transfiguration, and replacement
  menu.

## Milestone 7: Build A Dreamsign Operation Catalog

Dreamsign examples require named gains, purchases, duplicates, transforms,
purges, pool edits, trigger counters, temporary grants, and random rewards.
Those should come from one reusable catalog rather than debug-only menus.

Relevant files:

- [src/journey/fillers/dreamsignPayloads.ts](../src/journey/fillers/dreamsignPayloads.ts)
- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/dreamsignPayloads.ts](../src/journey/validate/dreamsignPayloads.ts)
- [src/journey/value.ts](../src/journey/value.ts)
- [src/quest/packageResolution.ts](../src/quest/packageResolution.ts)

Required work:

- Create a normal Dreamsign operation catalog parallel to the card-operation
  catalog.
- Support exact named gains from catalog or pool, purchases by essence or
  omens, loss, purge, duplicate, copy gain, temporary grant, transform to named
  or random Dreamsign, pool add/remove/replace, random Dreamsign reward, trade
  hook, and trigger counter.
- Add Dreamsign predicates for neutral, tidal, quest-oriented, battle-oriented,
  selected tide overlap, pool-only, active-only, and catalog-wide.
- Decide whether "quest" and "battle" Dreamsigns can be inferred from content
  tags, rendered text, or new TOML metadata. Prefer structured TOML metadata if
  inferred text would be fragile.

Acceptance criteria:

- Normal generation can produce named Dreamsign gains and named Dreamsign
  operation menus.
- Dreamsign pool edits validate against actual pool/catalog availability.
- Tests cover active, pool, catalog, neutral, and random Dreamsign sources.
- Validate that [Dreamsign Loom](brainstorm_examples.md#dreamsign-loom) is
  possible as Dreamsign transform, duplicate, purge, and replacement-family
  operations.
- Validate that [Pool Compass](brainstorm_examples.md#pool-compass) is possible
  as Dreamsign pool editing plus chosen Dreamsign copy gain.
- Validate that [Sign Between Bells](brainstorm_examples.md#sign-between-bells)
  is possible as named, random, and predicate-filtered Dreamsign rewards.

## Milestone 8: Add Named Dreamsign Shop And Service Rows

Examples such as Curator's Shelf, Moon Market, and Omen-Fed Prism need named
Dreamsign purchases with shared currencies and coherent prices.

Relevant files:

- [src/journey/shapes/shop_row.ts](../src/journey/shapes/shop_row.ts)
- [src/journey/shapes/service_menu.ts](../src/journey/shapes/service_menu.ts)
- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/fillers/dreamsignPayloads.ts](../src/journey/fillers/dreamsignPayloads.ts)
- [src/journey/value.ts](../src/journey/value.ts)
- [src/journey/validate/costs.ts](../src/journey/validate/costs.ts)

Required work:

- Let `shop_row` request a row of named Dreamsign purchase payloads from the
  Dreamsign catalog.
- Support shared-price rows, per-row price variation, essence prices, omen
  prices, and percentage or all-remaining prices when the resource milestone
  lands.
- Add selection rules for thematically coherent rows: same kind, same tide
  overlap, similar value, or curated pool tags.
- Keep exact named examples as ordinary candidates, not forced rows.

Acceptance criteria:

- A forced `--shape shop_row` batch includes named Dreamsign shop rows without
  forced debug payloads.
- Shared-cost named shop rows validate as `same cost, different named goods`
  rather than as three unrelated offers.
- Omen-priced Dreamsign purchases are represented as structured cost
  operations.
- Validate that [Curator's Shelf](brainstorm_examples.md#curators-shelf) is
  possible as a same-price named Dreamsign shop row.
- Validate that [Moon Market](brainstorm_examples.md#moon-market) is possible
  as an omen-priced named Dreamsign shop row.

## Milestone 9: Expand Bane Payload Families

Bane examples need named quantities, temporary Banes, delayed Banes, current
Bane purge, random Bane purge, replacement, and transformation into cards or
Dreamsigns.

Relevant files:

- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/fillers/banePayloads.ts](../src/journey/fillers/banePayloads.ts)
- [src/journey/fillers/shared.ts](../src/journey/fillers/shared.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/options.ts](../src/journey/validate/options.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add normal payloads for gaining multiple copies, temporary Bane gain, delayed
  Bane gain, purge a chosen Bane, purge a random Bane, purge a named future
  Bane, replace a Bane with a non-Bane card, transform a Bane into a named card,
  and transform a Bane after a hook resolves.
- Add target-context metadata distinguishing current-state Bane targets from
  future burdens and manifest obligations.
- Update value logic for Bane name, count, temporary duration, delayed timing,
  purge target certainty, and replacement relief.
- Ensure references collect the actual Bane names from effects, burdens,
  random envelopes, delayed hooks, and generated objects.

Acceptance criteria:

- Normal generation can produce Bane purge rewards and multi-Bane burdens.
- Current-state Bane purges fail or repair when the simulated state has no
  tracked Banes.
- Random Bane purge appears as a typed random or target selector, not as text
  only.
- Validate that [Thorned Cleanup](brainstorm_examples.md#thorned-cleanup) is
  possible as starter cleanup plus chosen, random, or named Bane purge.
- Validate that [Thin Air](brainstorm_examples.md#thin-air) is possible as a
  loss-choice or compound loss menu with multi-copy Bane gain.
- Validate that [Bane Ledger](brainstorm_examples.md#bane-ledger) is possible
  as Bane burdens attached to route edits or card operations.

## Milestone 10: Expand Resource Costs And Rewards

Resource examples need broader essence and omen semantics than fixed low/high
cost slots and fixed reward bands.

Relevant files:

- [src/journey/fillers/shared.ts](../src/journey/fillers/shared.ts)
- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/manifest.ts](../src/journey/manifest.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/costs.ts](../src/journey/validate/costs.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add a reusable resource payload catalog for fixed essence gain, fixed essence
  loss, max essence gain, max essence loss, restore to maximum, set current
  essence to a percentage of maximum, spend all essence, pay maximum essence,
  pay all remaining essence, percentage essence cost, random-range cost,
  random-range reward, fixed omen cost above 1, and fixed omen reward below 5.
- Make immediate unpayable fixed costs invalid while allowing all-remaining and
  percentage costs to scale with current resources.
- Add support for resource operations in delayed hooks and shop-economy timing,
  such as restore before next shop.
- Avoid making exact amounts from brainstorm examples mandatory. Amounts should
  come from weighted bands and value constraints.

Acceptance criteria:

- Normal manifests can represent maximum, percentage, all-remaining, random
  range, and cap-change resource semantics.
- Value breakdowns include semantic value bands for these resource kinds.
- Renderer output for resource edge cases is mechanical and stable in human and
  JSON modes.
- Validate that [Lantern Budget](brainstorm_examples.md#lantern-budget) is
  possible as fixed essence gain, max essence change, and set-to-percentage
  resource operations.
- Validate that [Hollow Treasury](brainstorm_examples.md#hollow-treasury) is
  possible as maximum, all-remaining, and random-range resource costs attached
  to normal rewards.
- Validate that [Narrow Reservoir](brainstorm_examples.md#narrow-reservoir) is
  possible as max-essence loss, max-essence gain, all-essence spend, and named
  Dreamsign reward combinations.

## Milestone 11: Broaden Route And Site Effects

Route examples need more site vocabulary, more root options, route edit side
effects, and negative route costs.

Relevant files:

- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/fillers/routeEditCatalog.ts](../src/journey/fillers/routeEditCatalog.ts)
- [src/journey/shapes/alter_dreamscapes.ts](../src/journey/shapes/alter_dreamscapes.ts)
- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/validate/options.ts](../src/journey/validate/options.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Decide the controlled route vocabulary for `Essence` sites and `Dreamsign
  Draft` versus `Dreamsign Offering`. Prefer aliases only if the game design
  intends them to be the same site.
- Add route edit candidates for current-dreamscape purge, full-atlas removal,
  all-site-type removal, add current site, add next-dreamscape site, replace
  specific source to destination, and probability adjustment.
- Let `alter_dreamscapes` support three-option route menus when the selected
  route variant has a strong shared property.
- Support route edits bundled with small resource rewards, Bane burdens, or
  card operations when the shape explicitly permits compound payloads.
- Add route value rules for negative edits such as removing all shops and for
  mixed edits such as adding a Dream Journey with a Bane burden.

Acceptance criteria:

- Route examples such as three-way Draft replacement and map-folding menus are
  reachable through normal route catalogs.
- Route edits remain manifest-only and do not mutate simulated quest state.
- Validation rejects unknown site types unless they are explicitly versioned or
  aliased.
- Validate that [Current Map Ink](brainstorm_examples.md#current-map-ink) is
  possible as a three-option current-dreamscape replacement menu with one
  shared source site.
- Validate that [Map Fold](brainstorm_examples.md#map-fold) is possible as
  add-current, add-next, and future probability-adjustment route effects.
- Validate that [Atlas Locksmith](brainstorm_examples.md#atlas-locksmith) is
  possible after the route vocabulary decision for `Essence` sites.

## Milestone 12: Add Positive And Negative Battle Window Payloads

Timed battle examples need more than player-positive opening hand and energy
effects. Add a typed battle-window catalog with both-player and opponent-facing
rule mutations.

Relevant files:

- [src/journey/fillers/timedWindowPayloads.ts](../src/journey/fillers/timedWindowPayloads.ts)
- [src/journey/fillers/environmentPayloads.ts](../src/journey/fillers/environmentPayloads.ts)
- [src/journey/effects.ts](../src/journey/effects.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/values.ts](../src/journey/validate/values.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add modifiers for opening hand plus and minus, next-battle draw, each-turn
  draw, starting energy, both-player starting energy, both-player starting
  cards, opponent point threshold changes, battle point cap, character spark,
  opponent temporary Dreamsigns, temporary named Dreamsigns, and unspent energy
  carryover.
- Represent these effects as typed status or battle-window operations with
  duration, affected player, affected object class, polarity, amount, and value.
- Allow timed-window shapes to either enforce one shared scope or choose a
  "battle object window" variant that can mix card draw and temporary
  Dreamsigns under one battle duration.

Acceptance criteria:

- Normal timed-window output can include positive, negative, and mixed battle
  windows.
- Validation checks typed duration and scope metadata instead of matching
  rendered text.
- Human debug output makes both-player and opponent-facing effects explicit.
- Validate that [First Breath](brainstorm_examples.md#first-breath) is possible
  as a battle-window menu mixing opening-hand draw, next-battle draw, and
  temporary Dreamsign grant.
- Validate that [Broken Victory](brainstorm_examples.md#broken-victory) is
  possible as battle point cap, both-player starting energy, and both-player
  starting hand mutations.
- Validate that [Trial Of Windows](brainstorm_examples.md#trial-of-windows) is
  possible as both-player spark and each-turn draw battle-window effects.

## Milestone 13: Expand Dreamwell Window Payloads

Dreamwell examples need bonus cards, penalty cards, delayed cards, lowest-phase
upgrades, and negative Dreamwell effects.

Relevant files:

- [src/journey/fillers/timedWindowPayloads.ts](../src/journey/fillers/timedWindowPayloads.ts)
- [src/journey/fillers/environmentPayloads.ts](../src/journey/fillers/environmentPayloads.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/values.ts](../src/journey/validate/values.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add Dreamwell payloads for first draw plus energy, first draw less energy,
  multiple bonus cards, multiple penalty cards, delayed Dreamwell cards, lowest
  phase upgrade, ignore penalty, and future Dreamwell card replacement.
- Track count, card role, phase selector, polarity, duration, and player
  visibility.
- Support Dreamwell burdens paired with named Dreamsign or card rewards.

Acceptance criteria:

- Normal generation can produce both positive and negative Dreamwell windows.
- Dreamwell options include structured payload metadata for count and card role.
- Value scoring treats penalty Dreamwell cards as burdens, not rewards.
- Validate that [Dreamwell Switch](brainstorm_examples.md#dreamwell-switch) is
  possible as first-draw energy, bonus Dreamwell cards, and lowest-phase
  upgrade effects.
- Validate that [Bitter Dreamwell](brainstorm_examples.md#bitter-dreamwell) is
  possible as negative Dreamwell energy, penalty cards, delayed Dreamwell
  cards, and compensating rewards.

## Milestone 14: Add Shop, Economy, And Reward-Replacement Statuses

Examples need future shop rules, victory reward replacement, site reward
reduction, and persistent prohibitions.

Relevant files:

- [src/journey/fillers/environmentPayloads.ts](../src/journey/fillers/environmentPayloads.ts)
- [src/journey/fillers/timedWindowPayloads.ts](../src/journey/fillers/timedWindowPayloads.ts)
- [src/journey/fillers/hookPayloads.ts](../src/journey/fillers/hookPayloads.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/payloadContracts.ts](../src/journey/validate/payloadContracts.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add shop payloads for free rerolls, free next purchases, first purchase free,
  essence restoration before next shop, future shop trade hooks, and purchase
  counters.
- Add status payloads for next victory reward replacement, Battle reward
  reduction, Essence-site reward reduction, no longer gaining essence, no
  longer modifying deck, no longer transfiguring cards, deck-size floor, and
  exact deck-size mandate.
- Add value rules for persistent prohibitions and reward reductions when paired
  with large named rewards.
- Keep positive persistent player benefits as Dreamsigns when that is the
  natural representation; use statuses for rule mutations and prohibitions.

Acceptance criteria:

- Normal generation can create status costs and reward-replacement promises.
- Validation rejects unsupported status scopes or incoherent persistent
  prohibitions.
- JSON output distinguishes status operations from Dreamsign grants.
- Validate that [Shop Courtesy](brainstorm_examples.md#shop-courtesy) is
  possible as shop reroll, purchase, and pre-shop resource restoration
  modifiers.
- Validate that [Spoiled Victory](brainstorm_examples.md#spoiled-victory) is
  possible as next-victory reward replacement for Dreamsign, resource, or route
  rewards.
- Validate that [Sealed Hands](brainstorm_examples.md#sealed-hands) is possible
  as persistent prohibition statuses paired with large compensating rewards.

## Milestone 15: Expand Delayed Hook Triggers And Counters

Delayed examples need "after two victories", site visits, named card plays,
Dreamsign triggers, card-added counters, essence-payment counters, and delayed
transformations.

Relevant files:

- [src/journey/fillers/hookPayloads.ts](../src/journey/fillers/hookPayloads.ts)
- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/manifest.ts](../src/journey/manifest.ts)
- [src/journey/operationAdapters.ts](../src/journey/operationAdapters.ts)
- [src/journey/validate/precommitRules.ts](../src/journey/validate/precommitRules.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Extend normal timing selection beyond `next battle`, `next victory`, and
  dreamscape delays.
- Support hook triggers for battle count, victory count, each battle, site
  visit, named card play count, Dreamsign trigger count, card-added count,
  essence-payment amount, future shop, and future Dream Journey.
- Allow hook resolutions that transform a named card, transform a named
  Dreamsign, transform a Bane into a card, add a route site, duplicate a card,
  purge random cards, grant named objects, or add delayed Banes.
- Track expiration policy, duration, hook budget cost, visibility policy, and
  reward operations for every non-immediate hook.

Acceptance criteria:

- `reward_after_trigger`, `now_vs_later`, and
  `commit_now_future_payoff` can fill from the expanded trigger catalog.
- Examples like "after 2 victories" and "after visiting a Purge site" are
  reachable through normal hooks.
- Validation fails if a delayed hook lacks a trigger selector, duration,
  expiration, or controlled scene.
- Validate that [Sleeping Contract](brainstorm_examples.md#sleeping-contract)
  is possible as an immediate named reward plus an after-two-victories named
  payoff.
- Validate that [Winchime Promise](brainstorm_examples.md#winchime-promise) is
  possible as site-visit triggers with named Dreamsign rewards.
- Validate that [Promise Card](brainstorm_examples.md#promise-card) is possible
  as named card and Dreamsign trigger counters with resource or duplication
  payoffs.
- Validate that [Waking Cache](brainstorm_examples.md#waking-cache) is possible
  as named card rewards with delayed Bane obligations.

## Milestone 16: Expand Paired Return, Sealing, Borrowing, And Trading

Return examples need sealed Dreamsigns, borrowed Dreamsigns with later costs,
future trades for resources or route edits, and card or Dreamsign recovery.

Relevant files:

- [src/journey/fillers/hookPayloads.ts](../src/journey/fillers/hookPayloads.ts)
- [src/journey/fillers/dreamsignPayloads.ts](../src/journey/fillers/dreamsignPayloads.ts)
- [src/journey/fillers/namedCardPayloads.ts](../src/journey/fillers/namedCardPayloads.ts)
- [src/journey/shapes/paired_return.ts](../src/journey/shapes/paired_return.ts)
- [src/journey/validate/precommitRules.ts](../src/journey/validate/precommitRules.ts)
- [src/journey/value.ts](../src/journey/value.ts)

Required work:

- Add paired-return families for sealed Dreamsigns, sealed cards, borrowed
  Dreamsigns, borrowed temporary card drafts, future named-object trades,
  return-for-resource, return-for-card-operation, and return-for-route-edit.
- Let `paired_return` support three root options when a return family needs a
  row of symmetric sealed objects.
- Make the created object, return scene, future cost, and return reward all
  structured in the paired-return contract.
- Ensure future rewards can come from resource, card, Dreamsign, route, Bane,
  and generated-object payload catalogs.

Acceptance criteria:

- Normal generation can seal or borrow Dreamsigns, not only cards.
- Return scenes can grant resources, purge cards, duplicate cards, or add route
  sites through structured operations.
- The paired-return validator proves the return scene references the created
  anchor.
- Validate that [Returning Lantern](brainstorm_examples.md#returning-lantern)
  is possible as sealed Dreamsign rows with later recovery and varied payoffs.
- Validate that [Borrowed Crown](brainstorm_examples.md#borrowed-crown) is
  possible as temporary Dreamsign or draft grants with later loss and cost or
  Bane obligations.
- Validate that [Key Ticket](brainstorm_examples.md#key-ticket) is possible as
  future trade hooks for resource, card, and route rewards.

## Milestone 17: Expand Random, Reveal, Wheel, And Wager Families

Random examples need visible wheels, reveal-and-choose options, roll twice keep
one, random costs, random purges, and random named or predicate rewards.

Relevant files:

- [src/journey/fillers/randomPayloads.ts](../src/journey/fillers/randomPayloads.ts)
- [src/journey/fillers/treeBuilders.ts](../src/journey/fillers/treeBuilders.ts)
- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/manifest.ts](../src/journey/manifest.ts)
- [src/journey/validate/randomContracts.ts](../src/journey/validate/randomContracts.ts)
- [src/render/human.ts](../src/render/human.ts)

Required work:

- Add normal builders for `reveal_rewards`, `choose_one_revealed_reward`,
  `choose_one_random_revealed_reward`, `gain_one_random_reward`,
  `roll_twice_keep_one`, visible wheel pools, random cost, random reward,
  random range, random Bane purge, random Dreamsign purge, random card purge,
  and repeated pool draws.
- Support pools containing mixed payload families when the selected shape
  explicitly allows a wheel or cache topology.
- Add value metadata for expected value, worst-case burden, visibility, and
  risk premium.
- Make `risk_or_skip` support named Dreamsign rewards and chance bands beyond
  the current 35/50/65 list when value rules permit.

Acceptance criteria:

- Normal generation can produce reveal-choice and wheel-style root menus.
- Random envelope validation rejects unknown envelope kinds and empty pools.
- Human output reveals committed pre-rolled outcomes when the visibility policy
  says they are player-visible.
- Validate that [Covered Cups](brainstorm_examples.md#covered-cups) is possible
  as reveal, choose-revealed, choose-random-revealed, and random reward
  envelopes.
- Validate that [Bounded Wheel](brainstorm_examples.md#bounded-wheel) is
  possible as a visible random pool with mixed resource, Dreamsign, Bane, and
  burden outcomes plus roll-twice-keep-one.
- Validate that [Crooked Coin](brainstorm_examples.md#crooked-coin) is
  possible as random-cost and random-purge risk rows paired with named
  Dreamsign rewards.

## Milestone 18: Add Symmetric Compound Fill Contracts

Many examples fail because a shape can create the individual rows but cannot
hold a shared property across the rows. Add compound fill contracts for
internal symmetry.

Relevant files:

- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/fillers/shared.ts](../src/journey/fillers/shared.ts)
- [src/journey/fillers/cardOperationCatalog.ts](../src/journey/fillers/cardOperationCatalog.ts)
- [src/journey/fillers/dreamsignPayloads.ts](../src/journey/fillers/dreamsignPayloads.ts)
- [src/journey/fillers/routeEditCatalog.ts](../src/journey/fillers/routeEditCatalog.ts)
- [src/journey/shapes/](../src/journey/shapes/)

Required work:

- Add reusable contracts for shared cost plus different rewards, shared burden
  plus different rewards, shared operation plus named targets, shared target
  plus operations, shared source site plus destinations, shared timing plus
  different rewards, shared future trigger plus different outcomes, and shared
  cleanup prerequisite plus different follow-up rewards.
- Ensure these contracts choose the shared element first, then fill all rows
  with compatible payloads.
- Add weighting so highly symmetric variants appear sometimes but do not
  dominate organic generation.
- Add debug metadata identifying the shared property and varied property.

Acceptance criteria:

- A shape can naturally generate the "one operation, three vessels" pattern by
  selecting one transfiguration and three eligible named card targets.
- A shape can naturally generate rows that repeat one Bane burden with three
  different reward families.
- Tests assert symmetry by inspecting operations and targets, not by matching
  exact rendered text.
- Validate that [One Blessing, Three Vessels](brainstorm_examples.md#one-blessing-three-vessels)
  is possible as one shared operation across three visible named card targets.
- Validate that [Equal Shadow](brainstorm_examples.md#equal-shadow) is possible
  as one shared Bane burden prefix attached to Dreamsign, card draft, and route
  reward families.
- Validate that [One Card, Three Masks](brainstorm_examples.md#one-card-three-masks)
  is possible as one visible named target with three transfiguration operations.

## Milestone 19: Add New Shapes For Missing Topologies

Most examples should be handled by existing shapes plus richer payloads. Add
new shapes only where the choice topology is genuinely absent.

Relevant files:

- [docs/adding_journey_shape.md](adding_journey_shape.md)
- [src/journey/shapes/registry.ts](../src/journey/shapes/registry.ts)
- [src/journey/shapes/types.ts](../src/journey/shapes/types.ts)
- [src/journey/shapes/shared.ts](../src/journey/shapes/shared.ts)
- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [test/journey-shapes.test.ts](../test/journey-shapes.test.ts)

Candidate shapes:

- `flat_escalating_trade`: flat root rows with increasing cost and increasing
  reward, for examples such as escalating omen purchases that should not be a
  decision tree.
- `shared_prefix_menu`: every row starts with the same cost, burden, purge, or
  cleanup prerequisite and then varies the payoff.
- `reveal_choice_menu`: root choices around revealing rewards, choosing one,
  choosing one random revealed reward, or taking a random reward.
- `return_row`: several sealed or borrowed objects with parallel future return
  scenes.
- `compound_service_menu`: a workshop-style menu where each option is a small
  compatible bundle rather than one atomic reward.

Required work:

- Add a shape only after confirming existing shapes cannot express the topology
  cleanly.
- Register each shape statically in `src/journey/shapes/registry.ts`.
- Define root option bounds, supported tags, payload compatibility, validation
  rules, repair preferences, and score weight.
- Add forced-shape tests and manual QA commands for each new shape.

Acceptance criteria:

- New shapes are topology-driven, not named after brainstorm examples.
- Each new shape can fill from reusable payload catalogs.
- Existing shape IDs and CLI flags remain compatible.
- Validate that [Bottomless Bowl](brainstorm_examples.md#bottomless-bowl) is
  possible as a flat escalating trade menu when the new topology is added,
  rather than only as a decision tree.
- Validate that [Covered Cups](brainstorm_examples.md#covered-cups) is possible
  through a reveal-choice topology if that topology becomes a new shape rather
  than a random payload variant in an existing shape.

## Milestone 20: Add Compound Payload Composition And Coherence Rules

Several examples combine a cost or burden with a reward in one option, such as
route edit plus Bane, Dreamwell burden plus named Dreamsign, or card purge plus
Dreamsign gain. Add a controlled composer for these bundles.

Relevant files:

- [src/journey/fillers/shared.ts](../src/journey/fillers/shared.ts)
- [src/journey/fillers/shapeFills.ts](../src/journey/fillers/shapeFills.ts)
- [src/journey/validate/values.ts](../src/journey/validate/values.ts)
- [src/journey/validate/pipeline.ts](../src/journey/validate/pipeline.ts)
- [src/journey/value.ts](../src/journey/value.ts)
- [src/journey/symbols.ts](../src/journey/symbols.ts)

Required work:

- Add a composer that can combine one primary reward with optional cost,
  burden, route side effect, delayed side effect, or follow-up operation.
- Limit composition by shape contract, value band, polarity, and target
  compatibility.
- Prevent incoherent combinations such as negative-only buttons in positive
  reward menus, route-only rewards in non-route shapes unless explicitly
  allowed, or costs without meaningful upside.
- Add symbol logic so mixed options visibly show cost, reward, risk, route, or
  loss as appropriate.

Acceptance criteria:

- Normal generation can build mixed options without hand-authored row strings.
- Validators catch pure burden rows outside loss-choice shapes.
- Value reports show each component separately.
- Validate that [Scissor Saint](brainstorm_examples.md#scissor-saint) is
  possible as card or Dreamsign sacrifice paired with named, draft, or
  transfiguration rewards.
- Validate that [Molting Archive](brainstorm_examples.md#molting-archive) is
  possible as transform-plus-reward and random-card-gain-plus-purge compound
  options.
- Validate that [Withered Orchard](brainstorm_examples.md#withered-orchard) is
  possible as reward-reduction burdens paired with named Dreamsign, legendary
  card, or starter cleanup rewards.

## Milestone 21: Expand Value Model And Comparability Rules

The value model must compare new resource, object, random, delayed, status,
route, and compound payloads well enough to keep generated menus plausible.

Relevant files:

- [src/journey/value.ts](../src/journey/value.ts)
- [src/journey/validate/values.ts](../src/journey/validate/values.ts)
- [src/journey/fillers/fingerprint.ts](../src/journey/fillers/fingerprint.ts)
- [src/journey/symbols.ts](../src/journey/symbols.ts)

Required work:

- Add value components for named card quality, named Dreamsign quality, starter
  cleanup, non-starter sacrifice, random target uncertainty, batch/all-card
  operations, temporary duration, delayed trigger risk, status prohibitions,
  reward replacement, route scope, route polarity, random envelope risk,
  generated object confidence, and compound bundles.
- Add semantic equivalence bands for percentage costs, max-resource effects,
  all-remaining costs, random ranges, batch sizes, hook counters, route scopes,
  and operation arity.
- Add comparability validators for symmetric shapes so one row is not wildly
  outside the value band unless the shape is explicitly about escalation or
  risk.

Acceptance criteria:

- Existing value tests still pass after version bumps.
- New payloads have nonzero, explainable value metadata.
- Symmetric menus fail validation or repair when row values are incoherent.

## Milestone 22: Upgrade Validation And Repair For New Contracts

Every new payload family needs validation before normal generation depends on
it. Repair should regenerate payload families before switching topology.

Relevant files:

- [src/journey/validate/](../src/journey/validate/)
- [src/journey/repair.ts](../src/journey/repair.ts)
- [src/journey/shapes/types.ts](../src/journey/shapes/types.ts)
- [src/journey/shapes/shared.ts](../src/journey/shapes/shared.ts)
- [test/journey-generation.test.ts](../test/journey-generation.test.ts)

Required work:

- Add validators for expanded card operations, Dreamsign operations, Bane
  operations, resource semantics, route effects, battle windows, Dreamwell
  windows, shop/status rules, delayed hooks, paired returns, random envelopes,
  and generated objects.
- Ensure validators inspect typed operations and payload metadata, not rendered
  option text.
- Add typed failure reasons that repair can use to regenerate the failing
  family while preserving shape topology.
- Keep forced-shape failures explicit. A forced shape should not silently
  become another shape.

Acceptance criteria:

- Invalid synthetic manifests fail with stable rule IDs.
- Normal generation does not emit a manifest that fails final validation.
- Repair metadata explains whether a payload was regenerated, simplified, or
  forced to fail.

## Milestone 23: Extend Rendering, JSON, And Debug Output

New payload families must be readable in normal output and inspectable in JSON
and debug output.

Relevant files:

- [src/render/human.ts](../src/render/human.ts)
- [src/render/json.ts](../src/render/json.ts)
- [src/render/theme.ts](../src/render/theme.ts)
- [src/journey/debugPayloads.ts](../src/journey/debugPayloads.ts)
- [src/journey/fillers/fingerprint.ts](../src/journey/fillers/fingerprint.ts)
- [test/render-feedback.test.ts](../test/render-feedback.test.ts)

Required work:

- Add concise human rendering for new resource semantics, named object
  operations, route effects, statuses, random envelopes, delayed hooks, paired
  returns, and generated objects.
- Keep normal output mechanical. Internal shape IDs, scoring, validation rule
  IDs, and target candidate counts belong in debug output.
- Expand JSON payloads only as needed; avoid duplicate text-only contracts when
  structured operations already exist.
- Add debug sections for shared symmetry contracts, target-resolution metadata,
  generated object provenance, and feature reachability.

Acceptance criteria:

- Human output is concise and understandable for every new payload family.
- JSON output contains all structured data needed to validate the operation.
- Debug output explains why rare feature families were selected or skipped.

## Milestone 24: Add Organic Reachability, Diversity, And Regression Tests

The final milestone turns the feature work into durable coverage that prevents
the generator from drifting back toward hardcoded outputs or unreachable debug
fixtures.

Relevant files:

- [test/journey-generation.test.ts](../test/journey-generation.test.ts)
- [test/journey-shapes.test.ts](../test/journey-shapes.test.ts)
- [test/effects.test.ts](../test/effects.test.ts)
- [test/render-feedback.test.ts](../test/render-feedback.test.ts)
- [analysis/early-journey-duplicates/](../analysis/early-journey-duplicates/)
- [src/journey/fillers/fingerprint.ts](../src/journey/fillers/fingerprint.ts)

Required work:

- Add organic reachability tests for each coverage family from Milestone 1.
- Add forced-shape tests for each new symmetric fill contract and each new
  shape.
- Add invalid-fixture tests for every validator added in Milestone 22.
- Add diversity tests that count semantic fingerprints across early, mid, and
  late batches and ensure new payload families contribute meaningful identity.
- Add anti-hardcoding tests for a small set of historical exact transcripts so
  normal generation does not simply reproduce fixed brainstorm rows.

Acceptance criteria:

- The normal test suite covers critical feature families without relying on
  slow statistical luck.
- Slow audit tests can run larger deterministic batches for diversity and
  reachability.
- Debug fixtures remain labeled as fixtures and are not counted as organic
  reachability.
- The coverage matrix includes explicit reachability checks for named examples
  from this plan, with each check recording the generated seed, shape, payload
  families, and structured operations that make the example procedurally
  possible.

## Implementation Order

Milestones 1 through 3 should land first. They provide the coverage framework,
fill-plan boundary, and object selection needed by most later work.

Milestones 4 through 11 can proceed mostly independently by payload family:
card drafts, card operations, starters, Dreamsigns, shops, Banes, resources,
and route edits. These milestones should coordinate on shared value metadata and
target selectors.

Milestones 12 through 17 add temporal, environmental, return, and random
surfaces. These depend on the fill-plan boundary and should reuse the expanded
resource, object, route, Bane, and Dreamsign payload catalogs.

Milestones 18 through 20 are the main symmetry and composition layer. They
should start only after enough payload families exist to prove that the
contracts compose real variety.

Milestones 21 through 24 harden the project. Value, validation, rendering, and
tests should be added incrementally during earlier milestones, but these final
milestones make those guarantees complete across the expanded generator.

## Manual QA

For every implementation milestone, run focused automated checks plus CLI QA
from the repository root.

Minimum automated checks:

- `npm run typecheck`
- `npm test`

Minimum CLI checks:

- `npm run journey -- --seed qa --no-color`
- `npm run journey -- run --seed qa --no-color`
- `npm run journey -- --seed qa --json`
- `npm run journey -- --seed qa --debug --no-color`
- `npm run journey -- --seed qa --count 25 --json`
- `npm run journey -- --seed qa --shape <changed_shape_id> --no-color`

Add focused QA for the changed surface:

- Use `--shape shop_row` for named purchase rows.
- Use `--shape one_operation_many_targets` for shared-operation symmetry.
- Use `--shape one_target_many_operations` for shared-target symmetry.
- Use `--shape alter_dreamscapes` for route changes.
- Use `--shape timed_window_menu` for battle, Dreamwell, shop, route, and
  temporary-object windows.
- Use `--shape reward_after_trigger` and `--shape paired_return` for hook and
  return contracts.
- Use `--shape single_random_outcome`, `--shape risk_or_skip`,
  `--shape single_wager`, and any new reveal or wheel shape for random
  envelopes.

The manual QA evidence should name the command, seed, forced shape if any, and
the structured capability observed in the manifest or debug output. When a
feature is intentionally rare in organic generation, add or use a deterministic
debug/test surface to prove the contract without counting that fixture as
organic reachability.
