# Procedural Generation Failure Analysis

## Scope

This report reviews procedural generation failures in `journey`: cases where the
Dream Journey generator falls back to authored scenario recipes instead of
constructing events from reusable procedural shapes, payload families, semantic
operations, target selectors, timing contracts, and value rules.

The analysis used five parallel codebase reviews covering:

- effect and operation definitions;
- filler and payload construction;
- shape, generation, repair, and tree-building flow;
- validation and manifest contracts;
- tests and docs that may normalize hardcoded outputs.

The current generator is shape-first by design, so not every authored profile is
a failure. A curated shape or ladder profile is defensible when it preserves a
general topology and fills from reusable effect families. The failure pattern is
strongest when normal generation emits one specific mini-event, one fixed object,
or one bespoke contract while the codebase already has a broader procedural
model that should have produced the same class of event.

## Overall Assessment

The generator has a typed manifest and many structured operation adapters, but a
large part of the V3 payload surface is still represented as fixed recipes. Some
of those recipes are hidden debug payloads, which is acceptable for deterministic
QA. The more serious failures are in normal generation paths where a supposedly
procedural family selects from a small hardcoded list or emits reduced metadata
instead of using the richer hook, random, generated-object, and payload contracts.

The highest-risk production issues are:

- fixed manifest-local generated objects can appear in natural generation;
- delayed and paired-return shapes emit simple text/precommit records instead of
  full hook contracts;
- several normal shape fills embed reusable card, route, timed-window, random
  pool, and ladder payload catalogs directly inside shape-specific code;
- validators still accept or enforce magic strings, exact labels, and unknown
  random kinds, which lets hardcoded scenario contracts survive.

Debug payload menus are less concerning. They intentionally force deterministic
edge cases such as resource ranges, Bane transformations, shop hooks, Dreamwell
windows, and paired-return scenes. They should remain QA fixtures, but tests and
docs should not treat them as evidence that natural procedural generation can
compose those effects.

## Findings

### 1. Fixed Generated Objects Appear In Natural Generation

**Status:** Fixed.

The original implementation made `generatedObjectDefinition()` return exactly
one object for each generated object kind:

- `Rain Lantern` card in
  [`generatedObjects.ts`](../src/journey/fillers/generatedObjects.ts#L22);
- `Mirror Moon` Dreamsign in
  [`generatedObjects.ts`](../src/journey/fillers/generatedObjects.ts#L57);
- `Glass Transfiguration` in
  [`generatedObjects.ts`](../src/journey/fillers/generatedObjects.ts#L128).

That was fine as a debug fixture, but it was not limited to debug fixtures:
`naturalGeneratedObjectKind()` gates generated objects into normal shapes in
[`debugPayloadRouting.ts`](../src/journey/fillers/debugPayloadRouting.ts#L127),
and the builder substitutes those options in
[`builder.ts`](../src/journey/fillers/builder.ts#L185).

The result was a procedural generation failure: "generated object" often meant
"choose one canned object definition." The status example, "For the next 3
battles, the first card you purge each battle returns as a temporary copy for
that battle," is especially clear. The manifest supports generated object
kind, lifetime, duration, references, payload, and value metadata, but the rules
text and identity were static.

**Compelling justification:** Strong for forced QA payloads; weak for natural
generation. Natural generation should either build these objects from reusable
rule fragments or sample from a data-backed/generated-object catalog with enough
variation that the object is not a single authored event.

**Resolution:** Natural generation now routes manifest-local generated objects
through a deterministic reusable-fragment builder. The builder samples identity,
rules, duration, lifetime, real TOML-backed card or Dreamsign references, value
metadata, and validation notes per generated object kind, stage, shape, seed, and
content version. Forced `generated_object` debug payloads still use stable
fixture definitions so QA commands and compatibility tests remain valid.

### 2. Generic Delayed Shapes Use Text Promises Instead Of Hook Contracts

**Status:** Fixed.

The V3 contract expects delayed and return shapes to create trackable hooks, not
loose text promises. The richer hook model exists in
[`hookPayloads.ts`](../src/journey/fillers/hookPayloads.ts#L98), and the
operation adapter supports delayed hook contracts in
[`operationAdapters.ts`](../src/journey/operationAdapters.ts#L919).

Normal shape fills do not consistently use it:

- `now_vs_later` emits delayed precommits as bare
  `{ optionNumber, trigger, reward }` records in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L1048);
- `reward_after_trigger` does the same in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L1078);
- `commit_now_future_payoff` adds a minimal trigger `{ kind: timing.kind }` and
  bare delayed records in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L1439).

These paths omit trigger selectors, bounded duration, expiration policy,
controlled scene, visibility policy, and hook budget. They are structured enough
to render, but not structured enough to behave like procedural hook generation.

**Compelling justification:** Partial for simple delayed rewards, because
"after next battle, gain X" is easy to understand. Weak for the manifest-first
system, because the code already has the richer contract and V3 explicitly calls
for trackable hooks.

**Resolution:** Generic delayed reward shapes now route through a shared
delayed-hook builder. Normal `now_vs_later`, `reward_after_trigger`, and
`commit_now_future_payoff` fills create `delayed_hook_contract` payloads with
stable hook IDs, trigger selectors, bounded durations, expiration policies,
controlled reward scenes, visibility policy, hook-budget cost, and reward value
metadata. The same contract is attached to the visible option trigger and the
precommitted delayed outcome, so deterministic replay, rendering, validation,
and semantic operations all derive from the manifest contract instead of a text
promise.

### 3. Generic Paired Return Bypasses The Paired-Return Contract

**Status:** Fixed.

The normal `paired_return` fill in
[`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L1094) creates text such
as "Commit a return hook..." and precommitted metadata containing only
`optionNumber`, `anchor`, and `reward`.

The richer paired-return contract exists in
[`manifest.ts`](../src/journey/manifest.ts#L140),
[`hookPayloads.ts`](../src/journey/fillers/hookPayloads.ts#L435), and
[`operationAdapters.ts`](../src/journey/operationAdapters.ts#L998). The debug
payload can create specific sealed, borrowed, and trade return scenes, but the
generic production path does not create `pairedReturnId`, `created`, or
`returnScene`.

This is the same class as the example "Return {borrowedDreamsign.name} and pay 1
omen; if paid, gain 90 essence." The hardcoded debug scene is useful, but the
normal paired-return generator should be able to compose that class from a
return-contract payload family.

**Compelling justification:** Weak. A simplified fallback may have been
reasonable during migration, but it now bypasses the richer procedural model.

**Resolution:** Normal `paired_return` generation now routes through a reusable
paired-return fill. It composes real TOML-backed cards or Dreamsigns, created
return anchors, return scenes, expiration windows, future costs, rewards, stable
IDs, reward metadata, and visible hook policy into full
`paired_return_contract` payloads. Those same payloads are mirrored into
precommitted delayed outcomes and paired-return metadata, so renderer output,
semantic operations, validation, and deterministic replay all derive from the
typed `PairedReturnContract`. The forced `paired-return-seal-borrow-trade` debug
fixture remains available for deterministic QA of the sealed, borrowed, and
future-trade return scenes.

### 4. Normal Card Operation Shapes Embed A Private Operation Catalog

**Status:** Fixed.

Several normal shape cases contain their own hardcoded card operation lists:

- `one_target_many_operations` includes transfiguration, Fast, Reclaim, and
  temporary cost reduction in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L437);
- `one_operation_many_targets` embeds transfigure, Fast, Reclaim, duplicate, and
  cost reduction in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L682);
- the named-card debug menu separately defines gain, purge, duplicate,
  transform, replace, transfigure, text modification, type change, keyword
  changes, opening-hand placement, merge, split, temporary copy, and delayed
  transformation in
  [`namedCardPayloads.ts`](../src/journey/fillers/namedCardPayloads.ts#L127).

This duplicates a reusable "card operation payload family" across shape code and
debug payload code. It also causes narrow hardcoding such as
`Apply {Viridian Transfiguration} to {targetA.name}` in the named-card debug menu
at [`namedCardPayloads.ts`](../src/journey/fillers/namedCardPayloads.ts#L191).

**Compelling justification:** Moderate for curated shape symmetry: one-target
and one-operation shapes need coherent option sets. The better implementation
would preserve the same curation by sampling from a shared card-operation
catalog with operation eligibility, target compatibility, value metadata, and
text rendering.

**Resolution:** Normal card-operation shapes now use a shared card-operation
catalog. `one_target_many_operations` and `one_operation_many_targets` request
compatible operations by topology, target class, value band, timing, and
optional operation family, then render those catalog results into their
shape-specific option topology. This preserves the curated symmetry of those
shapes while moving reusable card operations out of
shape-local inline arrays. The named-card debug menu remains a deterministic QA
fixture for exact real-card operation coverage.

### 5. `same_reward_different_costs` Sometimes Changes The Reward

**Status:** Fixed.

The `same_reward_different_costs` transfiguration branch adds different omen
bonuses depending on the selected cost path:

- pay essence and gain 3 omens;
- lose or pay another cost and gain 4 omens;
- gain a Nightmare and gain 5 omens.

This was implemented in
[`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L129). The shape name and
contract imply one shared reward with different costs, but this branch changed
both the cost and the reward. That was not just hardcoding; it violated the
topology that shape-first generation is supposed to preserve.

**Compelling justification:** None apparent. If the intent is "different
costs scale the same reward upward," that is a different shape or should be
explicitly modeled as a value-compensated reward variant.

**Resolution:** The transfiguration branch now generates one shared
transfiguration-plus-omen reward payload first and then attaches only cost
variants. Regression coverage checks that the option effects stay identical
while the costs differ.

### 6. Timed-Window Menus Are Fixed Battle-Window Scenarios

**Status:** Fixed.

One temporary-window prototype selected from three authored arrays of effects
in [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L1144). Every option
was hardcoded around "next 3 battles" and a small set of battle/card modifiers:
opening-hand cards, turn-1 energy, event Fast, character discounts, starting
omens, event Reclaim, turn-2 card draw, fast-card Reclaim, and Dissolve energy.

V3 says timed-window menus should support battle, Dreamwell, shop, route, and
temporary object windows, with shared timing as the scene identity. The current
normal path is closer to a fixed event trio than a procedural timed-window
payload family.

**Compelling justification:** Moderate. Timed windows need curated combinations
to avoid incoherent temporary rules. That argues for a reusable timed-window
catalog, not for embedding three fixed menus inside one shape case.

**Proposed fix to remove hardcoded content:** Introduce a timed-window payload
catalog that samples scope, duration, affected object class, modifier, amount,
polarity, and value while preserving shared-timing cohesion for the menu.

**Resolution:** Normal timed-window generation now uses a reusable timed-window
payload catalog instead of shape-local fixed arrays. The builder samples a
shared window scope and duration, then fills coherent options from battle,
Dreamwell, shop, route, and temporary-object payload families where the manifest
contracts support them. Each payload carries structured window metadata for
scope, affected object class, modifier, amount, polarity, and value, and
validation now checks typed shared-window cohesion instead of requiring every
option to be a text-matched "next 3 battles" battle modifier.

### 7. Tree Builders Are Scripted Scenario Profiles

**Status:** Fixed for normal tree payload lists.

Decision-tree shapes are heavily scripted:

- random pool content and summary text are hardcoded in
  [`treeBuilders.ts`](../src/journey/fillers/treeBuilders.ts#L388);
- escalating reward chains hardcode costs, essence ladders, omen ladders,
  transfiguration ladders, Dreamsign ladders, and battle modifiers in
  [`treeBuilders.ts`](../src/journey/fillers/treeBuilders.ts#L546);
- push-your-luck profiles hardcode chance sequences and reward ladders in
  [`treeBuilders.ts`](../src/journey/fillers/treeBuilders.ts#L876).

This is suspicious because tree content duplicates or bypasses reusable reward
slots. It is less severe than the object/hook failures because complete visible
trees need tightly curated progression, and a general tree grammar would likely
produce weaker choices.

**Compelling justification:** Fairly strong for the topology and progression
profiles; weak for hardcoded payload lists. The procedural target should be
"authored ladder progression filled from reusable reward families," not "fully
general tree soup" and not "one fixed event script per tree family."

**Resolution:** Normal decision-tree builders now keep the authored topology and
progression identity, but fill visible tree payloads from reusable level-aware
families. Probability ladders, random-pool draws, escalating reward chains, and
push-your-luck trees now derive costs, odds, rewards, visible random-pool
entries, and failure burdens from shared constrained families rather than
selecting whole scripted tree profiles. The generators preserve deterministic
replay, complete visible tree shapes, value growth across levels, and
topology-specific invariants such as fixed probability-ladder rewards and
increasing push-your-luck risk.

### 8. Route Edits Are Fixed Site-Pair Scenarios

**Status:** Fixed.

Route generation hardcodes specific site edits:

- `routeEdit()` always replaces Shop with Purge in
  [`shared.ts`](../src/journey/fillers/shared.ts#L712);
- `alter_dreamscapes` samples among Shop/Purge, Draft/Transfiguration, and
  future equivalents in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L1464);
- forced route QA covers add, remove, purge, and probability adjustment in
  [`environmentPayloads.ts`](../src/journey/fillers/environmentPayloads.ts#L43).

The route payload model supports broader operation kinds, scopes, polarity, and
site-delta values. Normal generation still reaches only a small set of authored
site edits.

**Compelling justification:** Weak to moderate. Route edits must know legal site
pairs and value polarity, but those constraints should live in a route-edit
catalog or route legality model rather than fixed shape branches.

**Proposed fix to remove hardcoded content:** Replace fixed site-pair branches
with a route-edit catalog that samples operation kind, scope, source site,
destination site, polarity, timing, and site-delta value from legal route
transitions.

**Resolution:** Normal route-edit generation now uses a reusable legal
transition catalog. The catalog composes additions, removals, replacements,
purges, and probability adjustments across controlled route scopes and site
types, deriving source and destination sites, polarity, timing, probability
deltas, descriptions, and site-delta values from stage-legible site value rules.
`alter_dreamscapes` and shared route reward helpers sample catalog entries
instead of selecting from fixed Shop/Purge and Draft/Transfiguration branches,
while the forced `route/route-edits` debug payload remains a deterministic QA
fixture for exact adapter coverage.

### 9. Risk And Wager Shapes Use Parallel Hardcoded Random Contracts

**Status:** Fixed.

`risk_or_skip` and `single_wager` use bespoke precommit kinds and option stubs:

- `risk_downside_roll` in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L914);
- `wager_roll` and `{ kind: "random_reward", table: "wager" }` in
  [`shapeFills.ts`](../src/journey/fillers/shapeFills.ts#L930).

The manifest and validator already know about typed random envelope kinds such
as `wager`, `random_reward`, `chance_to_gain_bane`, and `random_range`. Shape
specific validators in
[`precommitRules.ts`](../src/journey/validate/precommitRules.ts#L166) preserve
the current magic strings instead of pushing these shapes through the same random
envelope contract.

**Compelling justification:** Partial. Shape-specific random invariants are
valid, but parallel random payload names make it easier for one-off scenarios to
survive outside the general random model.

**Proposed fix to remove hardcoded content:** Convert `risk_or_skip` and
`single_wager` to emit the same typed random envelope payloads used by the
manifest contract, with shape-specific rules expressed as envelope constraints.

**Resolution:** Normal `risk_or_skip` generation now emits constrained
`chance_to_gain_bane` or `chance_to_pay_cost` random envelopes for bounded
downsides instead of `risk_downside_roll`. Normal `single_wager` generation now
uses constrained `wager` envelopes for both visible option operations and
precommitted rolls instead of `wager_roll` plus shape-local `random_reward`
stubs. The shape validators now require those typed envelope constraints, so
the risk and wager invariants live in manifest metadata rather than magic
precommit kind strings.

### 10. Bane Handling Defaults To Nightmare In Shared Paths

**Status:** Fixed.

The effect catalog defines many Bane names in
[`effects.ts`](../src/journey/effects.ts#L90), and the Bane payload helper can
accept arbitrary Bane names in
[`banePayloads.ts`](../src/journey/fillers/banePayloads.ts#L15). Shared normal
paths still default to Nightmare:

- `bane-gain` text is `Gain {count} Nightmare` in
  [`effects.ts`](../src/journey/effects.ts#L266);
- `nightmare()` hardcodes `Nightmare` in
  [`shared.ts`](../src/journey/fillers/shared.ts#L526);
- manifest references always include only `["Nightmare"]` in
  [`shared.ts`](../src/journey/fillers/shared.ts#L559).

This is a mild procedural failure. A default Bane is useful, but references and
burden generation should reflect actual Bane payloads. Debug payloads already
show that named, delayed, temporary, replaced, and transformed Banes are possible
in structured form.

**Compelling justification:** Moderate for `Nightmare` as the default generic
Bane; weak for references that ignore actual emitted Bane names.

**Resolution:** Normal generation now uses a shared Bane burden selector for
Bane costs, risk downsides, and random-envelope hazards. The selector samples
legal Bane names from the controlled vocabulary, emits structured
`bane_gain`/`chance_to_gain_bane` payloads with that chosen name, and values the
burden with the matching Bane. Manifest Bane references are collected from the
actual emitted options, precommits, generated objects, and target selectors
instead of always listing Nightmare. `Nightmare` remains the default for generic
fallback handling and forced debug Bane fixtures keep their deterministic named
payloads.

### 11. Debug Payload Menus Are Correctly Hardcoded, But Should Not Count As Natural Generation

**Status:** Fixed.

The examples supplied in the request map closely to forced debug payload menus:

- "Gain 180 essence. Gain 2 Nightmares now and gain 1 Doubt after next battle."
  in [`banePayloads.ts`](../src/journey/fillers/banePayloads.ts#L99);
- "Pay all remaining essence... Gain a random 80-120 essence and 2 omens." in
  [`resourcePayloads.ts`](../src/journey/fillers/resourcePayloads.ts#L92);
- "Pay 20 essence. At the next shop, restore 120 essence before buying." in
  [`environmentPayloads.ts`](../src/journey/fillers/environmentPayloads.ts#L180);
- "Gain 220 essence. For the next 3 battles, the Dreamwell includes one penalty
  card." in
  [`environmentPayloads.ts`](../src/journey/fillers/environmentPayloads.ts#L279);
- "Return {borrowedDreamsign.name} and pay 1 omen; if paid, gain 90 essence." in
  [`hookPayloads.ts`](../src/journey/fillers/hookPayloads.ts#L532).

These are routed only through forced debug payload selection in
[`builder.ts`](../src/journey/fillers/builder.ts#L134). As hidden QA payloads,
hardcoding is acceptable and even useful: each menu exercises a contract that
normal generation may not reach frequently.

The failure would be treating these fixtures as proof that natural generation can
compose those feature classes. The V3 design already says debug payloads are
deterministic review surfaces, not player-facing interactions.

**Compelling justification:** Strong, as long as they stay debug-only and the
docs/tests label them as coverage fixtures rather than natural output.

**Resolution:** Forced debug payloads remain deterministic fixtures, and the
debug payload listing now labels every advertised variant as `debug_fixture`
coverage. Regression coverage separately proves that organic generation reaches
the corresponding reusable contracts without forced debug payload metadata:
normal delayed-hook shapes emit `delayed_hook_contract` outcomes, paired-return
shapes emit `paired_return_contract` outcomes, risk and wager shapes emit typed
random envelopes, generated objects come from the natural generated-object
builder, and timed-window menus sample battle, Dreamwell, shop, and temporary
object windows. Exact hardcoded debug menus are therefore treated as contract QA
fixtures, not as evidence of natural generation breadth.

### 12. Repair Logic Uses A Global Hardcoded Script And Shape-Specific Fallbacks

**Status:** Fixed.

`REPAIR_ACTIONS` is a fixed global sequence in
[`repair.ts`](../src/journey/repair.ts#L20), while shape definitions have
`repairPreferences` in [`shapes.ts`](../src/journey/shapes.ts#L49) that are not
used by the repair loop. The loop also contains shape-specific fallbacks:

- `convert_route_addition` rebuilds only `alter_dreamscapes` as itself in
  [`repair.ts`](../src/journey/repair.ts#L306);
- `replace_delayed_hook` converts delayed/return shapes directly to
  `single_reward` in [`repair.ts`](../src/journey/repair.ts#L313).

This is not an event hardcoding issue, but it can preserve or hide procedural
failures by switching away from problematic topologies instead of repairing the
general payload class.

**Compelling justification:** Deterministic repair is useful. The concern is
that the repair implementation ignores the shape catalog's declared repair
preferences and has named topology escape hatches.

**Proposed fix to remove hardcoded content:** Drive repair from each shape's
declared repair preferences and typed failure reasons, then repair payload
families before switching topology or falling back to simpler shapes.

**Resolution:** Repair planning starts from typed validation failures where the
failed contract identifies a payload family, then applies the current shape's
declared `repairPreferences` before any topology switch. Same-shape
payload-family regeneration is attempted for delayed hooks, route edits, random
envelopes, decision trees, targets, costs, and root topology problems before
fallback shapes are considered. Topology changes come from explicit shape
preferences or the generic unforced switch/fallback path. Forced-shape repair
fails with a clear error when repair requires switching shapes.

### 13. Validators Preserve Display Text And Magic Payload Kinds

**Status:** Fixed.

Validation should force general structured contracts, but several validators
still depend on exact strings or allow unknown scenario kinds:

- `validateRandomEnvelopePayload()` validates only a hardcoded set, then passes
  unknown random kinds in
  [`randomContracts.ts`](../src/journey/validate/randomContracts.ts#L123);
- probability ladder and push-your-luck validators require exact labels such as
  `Success` and `Failure` in
  [`tree.ts`](../src/journey/validate/tree.ts#L94);
- `random_pool_draws` checks whether summary text includes `replacement` instead
  of relying only on `rewardPool.replacement` in
  [`tree.ts`](../src/journey/validate/tree.ts#L192);
- sequence and take-any-number validation match display text such as `^take`,
  `no effect`, and `refuse` in
  [`precommitRules.ts`](../src/journey/validate/precommitRules.ts#L276).

These rules do not directly create hardcoded scenarios, but they make hardcoded
scenarios easier to keep because they validate current English copy and magic
payload names instead of typed semantics.

**Compelling justification:** Weak. Some renderer copy checks are valid, but
they should be separated from semantic validation and derived from the same
manifest fields.

**Proposed fix to remove hardcoded content:** Replace display-text and magic-kind
checks with validation against typed operations, selectors, timing, random
envelopes, and renderer parity assertions derived from manifest fields.

**Resolution:** Random precommit validation now rejects unknown payloads that
claim the random-envelope contract instead of passing them through as
scenario-specific envelopes; legacy debug precommit records continue to be
checked by their dedicated Dreamsign, Bane, and resource validators. Sequential tree
rules validate random branch kind, terminal outcome, reward effects, and typed
reward-pool replacement metadata rather than requiring labels such as `Success`
or `Failure` or prose that says `replacement`. Repeatable-menu and sequence
validators use pick behavior plus costs, burdens, operations, and converted
value metadata instead of matching `take`, `no effect`, or `refuse` copy. Timed
window payloads now carry a typed duration kind/count and validator checks use
that metadata, window scope, operation payload metadata, and resource-operation
types instead of parsing duration text.

### 14. Tests And Docs Sometimes Freeze Current Hardcoded Behavior

**Status:** Fixed.

Before this resolution, docs and tests included useful evidence of intended
behavior, but several places risked normalizing current limitations:

- `brainstorm_examples.md` repeatedly recorded examples as "Not possible to
  generate"; that was valid as a historical V3 gap inventory, but it could be
  misread as an acceptable end state;
- the sequential-overhaul appendix gave exact forced-shape stdout examples,
  useful for renderer regression but not procedural quality;
- `journey-generation.test.ts` asserted generated card drafts use exact
  `takeCount` and `choiceCount` values instead of contract bands;
- older delayed, future-payoff, random-pool, and tree tests asserted English
  phrases, summary text, or branch labels instead of typed manifest contracts;
- debug payload tests correctly exercise forced payload families, but those
  should remain QA coverage rather than proof of natural generation breadth.

There is also a good counterexample: tests reject old reference sequential
examples as normal production output in
[`journey-generation.test.ts`](../test/journey-generation.test.ts#L2894). That
is the right kind of guard because it prevents exact appendix scenarios from
becoming normal generated output.

**Compelling justification:** Strong for renderer and debug coverage; weak when
tests assert exact scenario quantities or phrasing that should become
procedural.

**Resolution:** Procedural regression coverage now avoids freezing exact draft
quantities, delayed-hook English phrasing, fixed future-payoff wording, random
pool summary text, and display branch labels in normal-generation tests. Those
tests assert typed manifest contracts, value bands, topology invariants,
structured replacement metadata, deterministic diversity, and feature
reachability instead. Remaining exact quantities and stdout fragments are
explicitly scoped to renderer snapshots, synthetic invalid fixtures, or forced
debug payload QA. The brainstorm examples are labeled as a historical gap
inventory rather than an acceptable end state, and the sequential-overhaul
appendix is labeled as historical renderer fixture output rather than normative
procedural generation.

## Recommended Direction

1. Treat debug payload menus as fixtures only. Keep them deterministic, but
   document and test them as contract coverage rather than natural generation.

2. Move production hardcoded operation lists into reusable payload catalogs:
   card operations, timed windows, route edits, random pools, ladder rewards,
   Bane burdens, and generated objects.

3. Upgrade generic delayed and paired-return shapes to use full hook contracts.
   The simple text/precommit form should be removed or reserved for explicit
   compatibility tests.

4. Replace fixed generated object definitions in natural generation with either
   data-backed catalogs containing multiple authored entries or compositional
   generated-object builders.

5. Tighten validation around structured contracts. Unknown random precommit
   kinds should fail unless explicitly versioned as extensions. Semantic
   validation should not depend on display text such as `Success`, `Failure`,
   `Take`, or `replacement`.

6. Keep procedural tests focused on contract invariants, feature reachability,
   generated diversity, and value bands. Preserve exact quantities and English
   copy only in explicitly labeled renderer snapshots, synthetic invalid
   fixtures, or forced debug payload QA.

## Severity Table

| Area | Production path? | Classification |
| --- | --- | --- |
| Fixed generated objects | Yes | Error |
| Generic delayed hooks | Yes | Error |
| Generic paired return | Yes | Error |
| `same_reward_different_costs` reward drift | Yes | Error |
| Card operation shape lists | Yes | Error / curated concern |
| Timed-window fixed menus | Yes | Error / curated concern |
| Tree builder scripted profiles | Yes | Mixed |
| Route edit fixed site pairs | Yes | Concern |
| Risk/wager bespoke random contracts | Yes | Concern |
| Nightmare defaults and references | Yes | Fixed |
| Debug payload edge-case menus | Forced debug only | Justified fixture |
| Repair global script/fallbacks | Yes | Concern |
| Text and magic-kind validation | Yes | Error in validation design |
| Tests/docs that freeze quantities/copy | N/A | Fixed |
