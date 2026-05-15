# Journey Tool: Technical Description

## Summary

The `journey` tool is a stateless command-line generator that produces a
single Dream Journey offer per invocation. A Dream Journey is a decision
moment from a fictional deck-building roguelike: the player faces some
combination of options, costs, rewards, banes, route edits, and probabilistic
outcomes, then picks (or declines) one of them. The tool exists to support
game design review and debugging by producing reproducible Dream Journeys on
demand without running the full game.

The tool is implemented in TypeScript on Node 20+, distributed as the
`journey` binary via the project's `package.json` `bin` field. It loads
content from local TOML files, builds an in-memory quest context, runs a
pluggable shape-based generator, validates the result, and renders it as
either human-readable terminal output (with optional inline dream art images)
or stable JSON. There is no persistent simulator: every run is independent
unless an explicit `--seed` is supplied.

This document describes the tool as it exists today: its CLI surface, content
model, shape plugin system, generation pipeline, value model, manifest
contract, rendering subsystem, determinism strategy, and supporting
infrastructure.

## Domain Vocabulary

The system is steeped in game-specific vocabulary. The terms below recur
throughout the rest of the document; readers without game context should
treat this section as a glossary.

- **Dreamcaller**: the player's character archetype. Each Dreamcaller fixes
  a small set of mandatory tides and offers a larger menu of optional
  tides; selecting from those tides assembles a legal deck.
- **Tide**: a cost-line identifier that links Dreamcallers, cards, and
  tidal dreamsigns into a synergy group. A quest's selected tides determine
  which cards and dreamsigns are eligible.
- **Card**: a playable record (Character or Event) with an energy cost, a
  spark stat, a rarity, and a set of tides.
- **Dreamsign**: a passive effect record. Tidal dreamsigns synergize with
  specific tides; neutral dreamsigns are always eligible.
- **Deck**: the player's current set of cards and copies. The deck is
  seeded with starter-rarity cards and grows by drafting from a pool.
- **Draft pool**: the immutable set of post-starter cards eligible for the
  quest, derived from the selected tides.
- **Essence / Omens**: the two principal player resources. Essence
  represents progression points; omens are a smaller secondary currency.
- **Bane**: a named debuff that penalizes the quest (for example,
  Nightmare, Despair, Doubt). Banes are imposed as costs or burdens.
- **Route**: the abstract progression structure of a quest; route edits
  modify the upcoming path.
- **Stage**: the quest's progression phase, one of `early`, `mid`, or
  `late`. Stage influences resource targets, deck size, and shape weighting.
- **Dream Journey** (or simply "journey"): one decision moment offered to
  the player. The tool emits exactly one journey per invocation.
- **Journey Shape** (or just "shape"): the structural template behind a
  journey, such as a three-option flat menu, a take-or-leave offer, or a
  push-your-luck decision tree.
- **Manifest**: the in-memory and on-disk record describing a generated
  journey. It is the output contract every renderer consumes.
- **Converted essence (CEC)**: the universal scalar unit used to score
  costs, rewards, burdens, and uncertainty. Every value in the system
  ultimately reduces to a CEC number.
- **Precommitted outcomes**: random or delayed parts of a journey whose
  rolls are locked at generation time so the manifest fully describes both
  the visible surface and the hidden resolution.

## Related Information

The repository carries several in-tree design documents that elaborate on
specific subsystems. Several are dated and were written against earlier
versions of the system; treat them as historical context rather than as
descriptions of current behavior. Where this document and an older doc
disagree, this document reflects the code as of the current revision.

- `docs/2026-05-14-dream-art-terminal-rendering.md`: current. The dream art
  renderer design, including iTerm2 OSC 1337 inline image handling.
- `docs/banes.md`: current. The canonical bane vocabulary used by the
  effect catalog. Effectively evergreen game-domain reference.
- `docs/journey-reward-art-matches.toml`: current. The reward art ledger
  consumed by the dream art renderer.
- `docs/2026-05-07-dream-journey-v3-design.md`: partially current. A
  forward-looking design proposal ("V3") whose core architectural direction
  has been implemented (rich payloads, named targets, delayed hooks, random
  envelopes, generated objects, manifest-as-contract), but whose detailed
  acceptance criteria and feature-coverage tables are aspirational and may
  not match the shipped code in every particular. Useful as background on
  why the current architecture looks the way it does.
- `docs/2026-05-06-dream-journey-sequential-overhaul.md`: outdated. The
  "V2" overhaul proposal that introduced the stateless contract. Useful
  for history; the V3 doc and this document supersede its specifics.
- `docs/2026-05-05-dream-journey-cli-design.md`: outdated. The original
  CLI design doc; self-declares as superseded by V2 and is further
  superseded by V3 and by this document.
- `docs/adding_journey_shape.md`: partially outdated. The plugin-author
  checklist still reflects the intent of `defineShapePlugin`, but the
  document references a `repair.actions` field that no longer exists in
  the shape plugin types. Current shapes use validators rather than
  repair actions, and the generator does not retry on validation failure.
- `docs/2026-05-12-*-journey-shape-audit.md`,
  `docs/2026-05-13-*-journey-shape-audit.md`, and related audit notes:
  point-in-time audits. Each captures one shape's intended semantics as
  of its filing date. They remain useful as design intent but may not
  reflect later tuning to weights, predicates, or value bands.
- `docs/2026-05-10-early-stage-shape-distribution.md` and similar
  distribution snapshots: outdated. The document itself notes the score
  weight catalog has moved past the version it measured; rerun
  `scripts/shape-distribution.ts` for current numbers.
- `docs/2026-05-08-*`, `docs/2026-05-09-*`, `docs/2026-05-11-*`,
  `docs/2026-05-13-fillers-deletion-plan.md`, and
  `docs/2026-05-13-journey-cleanup-proposal.md`: historical. Project
  plans, cleanup proposals, and old-vs-new comparisons from earlier
  iterations. Useful for archaeology, not as descriptions of current
  behavior.

The project root contains `AGENTS.md` and `CLAUDE.md`, which encode binding
project conventions (commit-and-push expectations, documentation style rules,
the 30-second-per-test budget, and the rule that shape-specific code must not
live in `src/journey/shared/`).

## Project Layout

The repository is a small TypeScript monorepo with one runtime entry point:

- `src/cli.ts` is the binary entry; `dist/cli.js` is the built artifact.
- `src/commands/` houses command handlers and the shared command option type.
- `src/quest/` builds the in-memory quest context (Dreamcaller, package,
  deck, dreamsign pool, banes, route).
- `src/content/` loads, validates, and version-stamps the TOML content under
  `data/`.
- `src/journey/` is the heart of the system: shape registry, generation,
  assembly, operations, effects, validation, value model, and manifest
  schema.
- `src/journey/shapes/<shape_id>/` holds one directory per shape plugin.
- `src/journey/shared/` holds cross-shape helpers (rewards, costs,
  predicates, content access, text rendering, value bands). By project
  policy, no shape-specific code lives here.
- `src/render/` renders manifests as human terminal output, JSON, or inline
  dream art.
- `src/state/` defines and atomically persists `JourneyState` to
  `.journey/state.json` (used by the still-unwired stateful commands).
- `src/util/` contains low-level helpers: deterministic RNG, hashing, stable
  JSON serialization, ANSI color detection, exit code enum.
- `data/` holds three canonical TOML files: `cards.toml`, `dreamcallers.toml`,
  `dreamsigns.toml`.
- `docs/` contains design documents, audits, and the reward art ledger.
- `test/` contains the Vitest suite, with per-shape tests under `test/shapes/`
  and shared helpers under `test/shared/` and `test/helpers/`.
- `scripts/shape-distribution.ts` runs a Monte Carlo over the generator to
  surface shape-frequency drift against the score weight table.

## CLI Surface

The CLI is built on Commander. Two commands are wired:

- `journey` (the bare default) generates one stateless Dream Journey.
- `journey run` is a compatibility alias for the bare command.

Three additional handlers exist in source (`pick`, `new`, `state`) and are
fully implemented but are not registered with the Commander program. They are
holdovers from the earlier stateful design and are dormant in the current
build.

Every command accepts the same generation flag set, added by
`addGenerationFlags(command)` in `src/cli.ts`:

- `--json` switches output to stable JSON and unconditionally disables color.
- `--no-color` forces ANSI color off. Without this, color is enabled only
  when the stream is a TTY and `NO_COLOR` is not set.
- `--debug` prints generation metadata (selected shape, tags, scoring,
  per-option values, repairs).
- `--verbose` expands `--debug` to include full operation value bands.
- `--debug-context` prints the generated quest context: Dreamcaller,
  resources, package, deck summary, dreamsign pool, banes, draft pool.
- `--show-deck` prints the deck card list and active dreamsigns.
- `--seed <seed>` provides a deterministic seed; absent, a fresh
  `random:<UUID>` seed is generated per invocation.
- `--stage <stage>` forces `early`, `mid`, or `late`.
- `--shape <shape_id>` forces a canonical Journey Shape and is validated by
  a Commander `preAction` hook against `isJourneyShapeId`.
- `--count <count>` (1 to 1000, default 1) emits a stateless batch sharing
  the same seed but using a per-item `rootJourneyIndex`.

Public types and entry points:

- `buildProgram(): Command` constructs the Commander program.
- `main(argv?: string[]): Promise<void>` is the async runner that drives
  `parseAsync` and translates Commander errors into exit codes.
- `buildCommonOptions(raw: RawCommonOptions): CommonCommandOptions`
  normalizes flags into a typed options bag carrying `projectRoot`,
  `statePath`, and the resolved `color` and `stderrColor` flags.
- Command handlers return `CommandResult = { stdout, stderr, exitCode }`,
  which `writeResult` flushes to the process streams.

Exit codes are centralized in `src/util/exitCodes.ts`:

- `Success = 0`
- `InternalError = 1` (uncaught exceptions)
- `UsageOrInput = 2` (Commander parse failures, invalid `--shape`, etc.)
- `StateOrContent = 3` (malformed state file or content version mismatch)
- `SetupOrSchema = 4` (content load failures)

Color decisions are gated twice. The CLI builder decides whether color is
permitted, based on `--no-color`, `--json`, and TTY detection
(`supportsColor` in `src/util/ansi.ts`, which honors `NO_COLOR` and the
stream's `isTTY`). The renderer further suppresses color whenever `--json`
is in effect, regardless of the color flag.

## Content Model

The content layer is intentionally simple: three TOML files in `data/` are
read at startup, validated against a fixed schema, and reduced to a typed
`ContentBundle`.

`data/cards.toml` holds roughly 594 cards. A card is a record with `id`,
`name`, `tides` (cost-line associations), `rarity` (`Starter`, `Uncommon`,
`Rare`), `cardType` (`Character` or `Event`), `energyCost` (numeric or
literal `*` for variable cost), `spark` (a numeric stat or empty), and a
sort-order `cardNumber`. The raw TOML record is retained alongside the
parsed shape.

`data/dreamcallers.toml` holds 32 Dreamcallers. A Dreamcaller is the
player's character archetype: `id`, `name`, `title`, an `awakening` activation
number, a small set of `mandatoryTides` (the tides every legal deck must
include for that Dreamcaller), and a larger set of `optionalTides` (offered
to the player; three or four must be chosen to assemble a legal deck).

`data/dreamsigns.toml` holds 154 Dreamsigns. A Dreamsign is a passive effect
record with `id`, `name`, `kind` (`tidal` for synergy-bound effects or
`neutral` for universal effects), an optional `orientation` (`quest` or
`battle` scope), and a `renderedText` description. Tidal dreamsigns declare
the tides they synergize with; neutral dreamsigns do not.

Content loading lives in `src/content/`:

- `loadToml.ts` parses the three TOML files via `smol-toml`.
- `model.ts` defines the runtime `Card`, `Dreamcaller`, `Dreamsign`, and
  `ContentBundle` types.
- `validate.ts` enforces schema invariants: unique case-insensitive ids,
  required fields, well-formed enum values, and tidal/neutral consistency
  for dreamsigns.
- `version.ts` exports `computeContentVersion(bundle): string`, which hashes
  the raw TOML bytes together with every catalog version contributed by the
  rest of the system (shape catalog, effect catalog, value model, renderer,
  manifest contract). The result is a composite version string carrying a
  16-character SHA-256 suffix.

Catalog version constants are explicit and intentionally bumped when schema
or semantics change: `JOURNEY_SHAPE_CATALOG_VERSION` (`journey-shapes:vN`),
`EFFECT_CATALOG_VERSION` (`effects:vN`), `VALUE_MODEL_VERSION` (`value:vN`),
and a renderer version. Any of these moving invalidates state files saved
under an old version.

## Quest Context and Stages

A `QuestContext` (`src/quest/context.ts`) bundles the project root, the
loaded `ContentBundle`, the live `JourneyState`, and the `contentVersion`
fingerprint. `buildJourneyContext` cross-checks the state's recorded
version against the bundle's computed version, refusing to operate on a
stale state.

A `JourneyState` (`src/state/schema.ts`) carries:

- `schemaVersion: 1` and `contentVersion`.
- A `QuestState` with `seed`, resources (`essence`, `maxEssence`, `omens`,
  `dreamscape`), a `deck` (entries plus aggregate summary), `activeDreamsigns`,
  `banes`, the `draftPool`, the `dreamsignPoolIds`, and a `route` with a
  `pacingLedger`.
- A `GeneratorState` tracking `rootJourneyIndex` and cursor state.
- A `pendingJourney` slot (always null in the stateless path) and a
  `history` of prior pick entries.

Three concepts shape every quest: **tides**, **packages**, and **stages**.

A *tide* is a cost-line identifier shared between Dreamcallers, cards, and
tidal dreamsigns. A Dreamcaller's mandatory and selected optional tides
together determine which cards and tidal dreamsigns are eligible for that
quest.

A *package* (`src/quest/packageResolution.ts`) is the deck-building outcome
of picking optional tides on top of a Dreamcaller's mandatory tides. The
resolver enumerates all 3-and-4-element subsets of the offered optionals
and chooses the one that produces a legal-size draft pool (175 to 225 total
card copies, preferring the 190 to 210 band). Mandatory tides alone must
yield 110 to 150 copies as a precondition. Ties are broken lexicographically
on sorted tide names. `selectDreamcallerForSeed` uses a SHA-256 of the seed
to pick one legal Dreamcaller deterministically.

A *stage* (`early`, `mid`, `late`) classifies how far along the quest is.
`src/quest/init.ts` defines per-stage targets:

- `early`: ~120 essence, 10 starters kept, 10 additional cards drafted, 1
  active dreamsign, 0 banes.
- `mid`: ~400 essence, 5 starters kept, 25 additional cards, 3 active
  dreamsigns, 0 banes.
- `late`: ~400 essence, 0 starters kept, 35 additional cards, 5 active
  dreamsigns, 2 banes.

`simulateQuestStateForStage(stage, seed, contentVersion, ...)` applies these
targets using stable labels through the deterministic RNG (`stage-simulation:
starter-purge`, `stage-simulation:draft`, etc.), producing a reproducible
context for the chosen stage.

The journey command itself either accepts `--stage` and uses it directly or
draws a stage from the seed via `stageForInvocation`, which calls
`drawInt({ seed, contentVersion, rootJourneyIndex }, "stateless:stage", ...)`.

## Journey Shape Plugin System

A *Journey Shape* is a plugin that describes one structural pattern for a
decision point. Each shape declares its topology, its option contract, the
fill function that builds a concrete manifest fragment from a context, and
the validators that police the fragment afterward.

All shape types are exported from `src/journey/shapes/types.ts`. The key
types are:

- `JourneyShapeId`: a string-literal union of every shape id.
- `JourneyTopology`: one of `direct_menu`, `single_offer_refusal`,
  `random_commit`, `delayed_hook`, `repeatable_menu`, `decision_tree`.
- `JourneyShapeDefinition`: declarative metadata, including the id,
  topology, supported tags, root option count bounds, and the list of
  validation rule ids the shape promises to satisfy.
- `JourneyShapePlugin`: the runtime object combining the definition with
  `scoreWeight`, the `fill` function, optional `validators`, optional
  `treeValidator` (for decision-tree shapes), and optional
  `precommitValidator`.
- `ShapeFillArgs`: the input to `fill`, carrying the `JourneyContext`, a
  `DrawContext` (the RNG capsule), the resolved `stage`, and a shape-specific
  `shapeArgs` bag.
- `FilledJourney`: the output of `fill`, containing `options[]`, optional
  `tree`, optional `rewardPool`, optional `sequence`, optional
  `presentation`, optional `generatedObjects`, the `precommitted` bundle
  for random and delayed outcomes, and any `symmetryContracts` for debug.
- `ShapeValidator`: a post-fill predicate identified by `ruleId`, returning a
  typed `ValidationResult` with either `ok: true` or `ok: false` with rule
  id and message.

Plugins are registered through `defineShapePlugin` in
`src/journey/shapes/shared.ts`, which freezes the definition, looks up the
shape's score weight, and returns an immutable plugin object. The full
registry lives in `src/journey/shapes/registry.ts`. Registration enforces
two integrity checks: shape ids must be unique, and every id appearing in
the score-weight table must have a corresponding plugin.

The active plugin set covers roughly twenty-one shapes, grouped by topology:

- **Direct menus** (flat-option simultaneous choices): `random_rewards`,
  `random_trades`, `one_operation_many_targets`, `one_target_many_operations`,
  `same_cost_different_rewards`, `same_reward_different_costs`,
  `heterogeneous_pair`, `choose_your_loss`, `alter_dreamscapes`,
  `flat_escalating_trade`.
- **Repeatable menus**: `shop_row` and `take_any_number`.
- **Single-offer refusal**: `single_offer`, the canonical take-or-leave.
- **Random commit**: `single_wager`, `single_random_outcome`.
- **Delayed hook**: `now_vs_later`, `commit_now_future_payoff`,
  `reward_after_trigger`.
- **Decision tree**: `random_pool_draws`, `push_your_luck`,
  `escalating_reward_chain`.

Three additional directories (`probability_ladder`, `resolved_random_series`,
`single_rule_trial`) exist under `src/journey/shapes/` but are not registered
in the current build.

Shape score weights live in `src/journey/shapes/scoreWeights.ts`. They are
the per-shape base prevalence multipliers used during shape selection. The
shape catalog version (`JOURNEY_SHAPE_CATALOG_VERSION`, currently
`journey-shapes:vN`) is contributed to the manifest's `versions` block and
into the content version hash, so a shape catalog bump invalidates saved
states.

The standard validation rules every plugin inherits include
`root_option_count_within_bounds`, `options_match_shape_topology`,
`option_values_are_comparable_for_shape`, and
`symmetric_option_values_are_comparable`. Per-shape plugins layer
shape-specific rules on top. For example, the `single_offer` validator
checks that the journey exposes exactly one meaningful take option (with a
guaranteed reward and a visible cost or burden) and one no-effect leave
option. The `push_your_luck` tree validator confirms every node has exactly
two branches labelled Leave and Attempt, that the leave option has no
costs, and that probabilities rise by ten, twenty, and twenty-five
percentage points step over step.

## Generation Pipeline

The generation entry point is `generateNextJourney(input: GenerationInput):
JourneyManifest` in `src/journey/generate.ts`. `GenerationInput` carries the
`JourneyContext`, an optional `previousPick` history entry, an optional
`forcedShapeId`, and an optional `forcedStage`. The function never mutates
the context; it returns a fresh, frozen `JourneyManifest` or throws.

The pipeline has six phases:

1. **Stage resolution**: if a forced stage is supplied, use it; otherwise
   map the context's `dreamscape` resource onto an `early`, `mid`, or `late`
   stage.

2. **Tag derivation**: `desiredTagsFor(context, stage)` produces the
   contextual tag set the run wants to satisfy. Tags include direction
   markers like `build`, `cleanup`, `reward`, and `immediate`, plus signals
   derived from current essence percentage, the count of starters in the
   deck, the number of active dreamsigns, and the bane load.

3. **Shape scoring**: `scoreShapes(context, stage, tags, history)` walks
   every registered plugin and computes a score from a base of one plus
   tag-overlap, broad-run-fit, target-availability, repetition penalty for
   exact prior shapes, and tag-repetition penalty for shapes whose tags
   overlap recent history. The resulting score is multiplied by the
   plugin's `scoreWeight`. A small deterministic tie-breaking jitter is
   added so ties resolve stably. The jitter is itself derived from the
  RNG, so byte-stable seeds still produce byte-stable selections.

4. **Shape selection**: with `--shape`, the forced plugin is used directly.
   Otherwise, the highest-scoring plugin wins, with the jitter providing the
   tiebreaker.

5. **Assembly**: `buildJourneyForShape(plugin, context, drawContext, stage)`
   in `src/journey/assembly.ts` calls the plugin's `fill`, then combines
   the returned `FilledJourney` with shape-agnostic metadata to produce a
   draft manifest. Card and dreamsign target selectors are resolved into
   concrete reference lists by `attachTargetResolutionMetadata`, which
   evaluates predicates against the live quest context.

6. **Validation**: `validateJourneyManifest(manifest, context)` runs the
   shape's validators, then the inherited tree and precommit validators,
   then global validators (random odds, envelope kinds, decision tree
   shape, generated objects, sequence menus, references). The first failure
   throws a typed error with the failing rule id and a human-readable
   message. There is no retry loop: the generator runs once and either
   succeeds or fails hard. When a shape is forced and fails, the error
   surfaces the rule that broke; when no shape is forced, the failure is
   still a hard error rather than a re-roll. This makes generator
   regressions visible immediately rather than masked by silent fallback.

The pipeline distinguishes three responsibilities:

- *Generation* (`generate.ts`) chooses what to build (stage, tags, shape) and
  decides when to fail.
- *Assembly* (`assembly.ts`) calls the chosen shape's fill function and
  attaches cross-cutting metadata to the resulting fragment.
- *Operation building* (`operationBuilders.ts`) transforms shape-supplied
  cost, reward, burden, route-edit, and trigger payloads into typed
  `JourneyOperation` records, classifying them by `operationKind`, `role`,
  `visibility`, `timing`, and `value`.

## The Value Model

Every cost, reward, burden, and uncertain outcome is converted into a single
scalar called *converted essence* (CEC). This is the project's universal
unit of comparison: a reward worth ten CEC is intended to be a meaningful
gain at any stage; a cost of forty CEC is intended to be expensive.

The value model lives in `src/journey/value.ts` and exposes a
`VALUE_MODEL_VERSION` (currently `value:v10`) that participates in the
content version hash. The file defines numeric constants for every effect
family (essence, omens, cards, dreamsigns, banes, transfigurations, routes,
shop and dreamwell modifiers) and stage multipliers that adjust those base
values for `early`, `mid`, and `late`.

Per-effect scoring functions translate a runtime payload into CEC. For
example, `valueEssenceGain(amount, stage)` multiplies the amount by the
stage's essence multiplier; `valueCardDraft(takeCount, choiceCount,
predicate, stage)` sums a base draft value, a copies bonus, a breadth
factor for the choice count, and a predicate-specificity adjustment.
Dreamsign scoring chooses a base by family (gain, draft, transform, pool
edit) and applies modifiers.

`evaluateOptionValue(option, context, stage)` aggregates an option's
operations into a `ValueBreakdown` with four CEC components:

- `costConvertedEssence`: the player-paid cost in essence units.
- `effectConvertedEssence`: the player-gained reward in essence units.
- `burdenConvertedEssence`: imposed downsides such as bane gains.
- `uncertaintyConvertedEssence`: the spread introduced by random outcomes.

The breakdown also exposes a `net` value used for symbol assignment.

`symbolsForOption(option)` (`src/journey/symbols.ts`) tags each option with
up to three of `reward`, `cost`, `risk`, `route`, `leave`, `loss`, or
`neutral`. The renderer turns those symbols into glyphs preceding the
option text so a reader can scan the visual shape of a journey before
reading any words.

`src/journey/rewardArtTypes.ts` exposes `rewardTypeForTemplateId(templateId)`,
a mapping from shared reward catalog ids onto canonical reward type strings.
The dream art ledger keys on those reward type strings, so this module is
the bridge between mechanical rewards and their narrative dream art.

## Effects, Operations, and Precommitted Outcomes

`src/journey/effects.ts` is the *effect catalog*: a frozen registry of
named effect templates with text templates, families, tags, and value
hooks. Effects describe what could happen, not what does happen. The
catalog includes essence and omen changes, card draft and gain and purge
operations, dreamsign manipulation, transfiguration (named permanent
mutations like Viridian, Golden, Scarlet, Azure, Bronze, Magenta, Rose,
and Prismatic, each with eligibility filters), route edits, shop and
dreamwell adjustments, status rules, and bane operations. Catalog version
`EFFECT_CATALOG_VERSION` participates in the content version hash.

Reward and cost *templates* are richer wrappers around effects. They live
in `src/journey/shared/rewards.ts` and `src/journey/shared/costs.ts` and
add metadata such as predicates, render functions, and CEC computations.
The shared content layer also defines a set of reusable predicates in
`src/journey/shared/predicates.ts` (roughly eighteen: events, characters,
warriors, survivors, low-cost, legendary, and so on).

A *predicate* is a serializable filter over cards or dreamsigns. Reward
templates use predicates to gate target choice ("draft three random cards
with cost two or less"). Predicates also drive viability checks: if a
predicate has no live targets in the current context, the corresponding
reward is not selected.

`src/journey/operationBuilders.ts` converts the shape-fill output into
concrete `JourneyOperation` records. Each operation carries:

- `operationKind`: one of about forty kinds (essence gain, card draft, bane
  gain, route edit, transfiguration, status, random envelope, delayed hook,
  generated object, etc.).
- `role`: cost, reward, burden, target, trigger, route edit, random,
  delayed hook, validation requirement, or generated object.
- `visibility`: `visible`, `debug`, or `precommitted` (sealed future
  outcomes).
- `timing`: immediate, delayed (with trigger), route (with scope), or
  random.
- `payload`: the effect-specific data.
- `value`: an `OperationValueMetadata` band with the CEC contribution,
  expected value, uncertainty, and worst-case burden.
- `targetResolution`: the post-resolution metadata from
  `attachTargetResolutionMetadata`, recording which concrete targets the
  selector matched.

*Precommitted outcomes* (`PrecommittedOutcomes` in `manifest.ts`) seal the
random parts of a journey at generation time so that downstream renderers,
state tools, and tests can reason about a fully-resolved manifest. The
bundle contains:

- `random`: typed envelopes for each random outcome (visible-pool,
  random-cost, random-reward, wager, complete-decision-tree, push-your-luck
  attempt chain) with the committed rolls.
- `delayed`: trigger-based resolutions queued for later.
- `routeEdits`: future route modifications.
- `sequenceMenus`: prebuilt next-step menus for sequential shapes, keyed by
  step label (`step2`, `step3`, ...).
- `operations`: the manifest-level operation records produced during
  assembly.

Locking randomness at generation time keeps the manifest fully shareable: a
JSON dump is enough to reproduce both the displayed surface and the hidden
outcome a player would see if they picked any path.

## The Manifest Contract

The `JourneyManifest` (in `src/journey/manifest.ts`) is the central output
contract. Renderers, validators, and downstream tools consume it directly.

A manifest carries:

- `schemaVersion: 2`.
- `versions`: a record of all catalog and contract versions
  (`contentVersion`, `shapeCatalogVersion`, `effectCatalogVersion`,
  `valueModelVersion`, `rendererVersion`, `manifestContractVersion`).
- `journeyId`: a zero-padded sequential id like `J-000001`.
- `seed`, `rootJourneyIndex`, `shapeId`, `stage`, `dreamscape`.
- `selectedTags`: the resolved desired-tag list used during scoring.
- `options`: an array of `JourneyOption`. For flat menus this is the full
  visible surface; for decision trees it is empty.
- `presentation`: optional UI metadata (a `flatMenuHeader`,
  `treeBranchFormat`, a `treeFooter`, and a `treeRewardPoolDisplay`).
- `tree`: a `JourneyTree` with a `rootNodeId` and recursive nodes for
  decision-tree shapes.
- `rewardPool`: an optional visible pool of rewards (used by pool-draw
  shapes).
- `sequence`: optional sequence metadata with the current step and status.
- `precommitted`: the locked random and delayed outcomes described above.
- `generatedObjects`: ad hoc cards, dreamsigns, statuses, or transfigurations
  generated specifically for this journey.
- `debug`: an inspection bag with per-option `valueBreakdown`, the full
  shape-score table, optional symmetry contracts, and the previous pick.
- `references`: a flat list of referenced card ids, dreamsign ids, bane
  names, and Dreamcaller ids, used by renderers to look up display names.

A `JourneyOption` has a number, the assigned symbols, a rendered text
string, a `pickBehavior` (a discriminator that distinguishes meaningful
picks from leave options and refusals), a list of `rewardTemplateIds` (used
by the dream art matcher), and the four CEC totals for cost, effect,
burden, and uncertainty. It also carries the full operation list when
operations are scoped to the option.

A `JourneyTree` carries the tree topology. Each node has a level label, an
optional description, and labelled branches. Each branch is one of three
kinds: a player branch (a normal selectable choice), a random branch (a
chance gate with visible odds), or an automatic branch (a forced
transition). Branches carry their own costs, effects, burdens, route edits,
and either an explicit terminal outcome or a transition to a later node.

## Decision Tree Journeys

Most Journey Shapes are flat menus: the player sees a small list of options
and picks one. Three shapes are different: `push_your_luck`,
`escalating_reward_chain`, and `random_pool_draws` are *decision trees*, in
which the journey unfolds across several sequential steps and each step's
available choices depend on what happened at the previous step.

### The tree data model

When a shape produces a tree, the manifest's `options` array is empty and
its `tree` field is populated. A `JourneyTree` has a `rootNodeId` and a
flat list of `nodes`. Each `JourneyTreeNode` carries an `id`, a
`levelLabel` shown to the player (`Attempt 1`, `Step 2`), an optional
descriptive blurb, and an array of `branches`.

A `JourneyTreeBranch` is one outgoing edge. It carries an `id` and a
player-facing `label`; a `kind` (`player_choice`, `random_chance`, or
`automatic_transition`); the same operation, cost, effect, burden,
target, trigger, and route shape that a flat option carries with the
same CEC totals; optional `odds` (numerator, denominator, percent) for
random branches; optional `rewardTemplateIds` for dream art matching; and
either a `nextNodeId` linking forward or a `terminal` record that ends
the journey.

A `JourneyTreeTerminal` has text and one of four `outcome` values: `end`
(neutral conclusion), `claim` (player walks away with accumulated
rewards), `failure` (penalty state, typical for push-your-luck busts), or
`leave` (player declined to push further). Terminals carry their own
operations and reward template ids so renderers can show the consequences
of stopping at that endpoint.

### Branch kinds

The three branch kinds describe how the next step would unfold in real
gameplay. A `player_choice` branch is a decision the player makes; the
shape contract requires that each player-choice node expose either a
continue/leave pair (as in `push_your_luck`) or a small fixed menu of
mechanically distinct branches. A `random_chance` branch is one possible
outcome of a die roll; odds across the sibling random branches of a node
sum to one. An `automatic_transition` branch is a forced step that
advances without prompting the player, used for narrative beats,
mandatory consequences, or step-counter advancement.

A typical `push_your_luck` node mixes a Leave terminal (claims rewards so
far) with an Attempt branch that transitions to a random node whose
success branch grants another reward and links forward while the failure
branch terminates the journey in the bust outcome. Success probabilities
rise step over step by ten, twenty, then twenty-five percentage points.
`escalating_reward_chain` chains player branches: each step is a
take-or-stop choice that pays an escalating cost for an escalating reward
before transitioning. `random_pool_draws` mixes random branches that draw
from a visible pool declared in the manifest's `rewardPool` field.

### Prototype rendering: flatten the whole tree

In real gameplay, only the current node's branches would be visible. After
the player picks (or after a random roll resolves), the next node would
be revealed, and so on, with the player learning the shape of the journey
incrementally. The earlier nodes would be visible only in retrospect, and
later nodes would be hidden behind the choices not yet made.

The `journey` tool is a non-interactive design-review prototype. It does
not pause for input, advance through nodes one at a time, or hide future
state. Its job is to print a complete, inspectable description of one
generated journey on standard output and exit. To do that with a tree, the
human renderer walks the tree top-down and prints every node and every
branch in a single pass. The output reads like a flattened transcript:

- A `Decision Tree` heading announces that this is a sequential journey.
- For each node, the renderer prints the `levelLabel`, the optional
  description, and then each branch in order. Branches are formatted as
  numbered lines (`treeBranchFormat: "numbered"`) or labelled lines
  (`treeBranchFormat: "labeled"`) according to the manifest's
  `presentation` block.
- Random branches show their odds inline so a reviewer can see the
  probability surface without inferring it.
- Terminal branches show the outcome label and the consequences attached
  to that endpoint.
- An optional `treeFooter` may close the section with shape-specific
  guidance (for example, a reminder of how Leave terminates the chain).
- If the shape has a `rewardPool`, its summary is rendered as a section
  above the tree unless `presentation.treeRewardPoolDisplay` is `hidden`.

This rendering deliberately exposes information a player would not see
all at once: the outcome of every random branch, the cost and reward at
every future step, and the contents of every terminal. That exposure is a
design-review feature, not a leak, because the tool's user is a designer
reviewing the entire decision space at a glance. A real game runtime
built on the same manifest would render the same data very differently:
it would show only the root node's branches, wait for a player choice or
roll an internal die for a random node, advance to the linked
`nextNodeId`, and render that node's branches.

### Why precommitting outcomes is necessary

Because the prototype prints the whole tree before any choice is made,
random branch outcomes must be known at print time: a designer needs to
see what each random branch actually resolves to (not just its odds) to
evaluate fairness and pacing, and the output must be deterministic.

The generator therefore rolls every random branch at generation time and
stores the rolls in `precommitted.random`. The `complete_decision_tree`
envelope records, per node, the ids of stop, failure, and reward
branches selected by the precommit roll. The visible odds on each branch
remain accurate; the precommitted outcomes simply pin which branch the
rolls landed on for this seed.

A future interactive runtime can use the same manifest in either of two
modes: replay the precommitted outcomes exactly (useful for testing and
reproducibility), or ignore them and roll its own dice against the
advertised odds (useful for live play). The branch `nextNodeId` and
`terminal` fields are the navigational contract both modes rely on; the
precommitted bundle is the optional deterministic override.

## Rendering

Renderers transform a manifest into terminal output or JSON. They live in
`src/render/`.

The human renderer is `renderJourneyHuman(state, manifest, options,
content?)` in `src/render/human.ts`. It assembles the output in a fixed
section order:

1. Optional debug sections, gated by `--debug`, `--debug-context`, and
   `--show-deck`.
2. The main heading line (`Dream Journey`, gold-colored).
3. The Dreamcaller line (`Quest: <name>, <title>`).
4. The stage and resources line with stage, current/max essence, and omens.
5. A blank line.
6. The journey body. For tree shapes, this is an optional reward pool
   summary, a `Decision Tree` heading, and per-node rendering of level
   labels, descriptions, and branches. For flat shapes, this is the optional
   flat menu header followed by numbered option lines (each prefixed with
   its symbol glyphs).

Color choices live in `src/render/theme.ts`, which assigns 24-bit truecolor
RGB triples to semantic keys (`heading`, `optionNumber`, `resourceLabel`,
`resourceValue`, `positive`, `warning`, `error`, `debug`). The renderer's
`color(text, key, options)` helper applies the theme only when
`options.color` is true and `--json` is not in effect. Cost/effect coloring
on options uses `optionTone(option)`, which picks `positive`, `warning`, or
`resourceValue` based on net CEC.

Debug output adds rich diagnostics. `debugLines` prints seed, journey id,
stage, the selected shape, the active tags, the sequence status, the
previous pick, and the top shape score. Precommitted outcomes, operations,
generated objects, and option-value breakdowns each have their own helper
that prints labelled sections. `--verbose` expands the operation block to
include the full value metadata band.

The JSON renderer is `renderCommandJson(payload)` in `src/render/json.ts`.
It uses `stableStringify` so identical manifests produce byte-identical
JSON. `manifestJson(manifest)` exposes the manifest in a flat,
downstream-friendly form: top-level versions, the option array with
operations and CEC summaries, the tree, the reward pool, the precommitted
bundle, debug, references, generated objects, selected tags, the sequence,
and the presentation block. `stateSummaryJson(state)` exposes the live
quest state for the dormant `state` and `new` commands.

Error rendering is `renderError(error, options)` in `src/render/errors.ts`.
It extracts a typed exit code (defaulting to `InternalError`), prefixes the
message with `Error:`, optionally colors it red when stderr supports color,
and returns a `CommandResult` with empty stdout.

The *dream art* renderer in `src/render/dreamArt.ts` is the most novel
output layer. Each option (and each reward-bearing tree branch) can be
augmented with a circular preview image and a two-word dream name displayed
beneath it. Dream art is sourced from `docs/journey-reward-art-matches.toml`,
a curated ledger that indexes dream entries (`imageId`, `dreamName`) under
their `rewardType`.

The matcher (`renderDreamArt(manifest, projectRoot, env?)`) walks the
manifest's options and branches, maps each one to a reward type via
`REWARD_TYPE_BY_TEMPLATE_ID`, and assigns one unique dream entry per
journey. Allocation is deterministic and seeded so the same manifest always
picks the same dreams. Three precedence rules apply: prefer an unused dream
of the matching reward type, otherwise borrow an unused dream from a
different type (and emit a debug `repeatFallback`), otherwise fall back to a
repeated dream and emit a review flag.

Terminal rendering uses the iTerm2 OSC 1337 inline image escape. The
renderer detects support via `supportsInlineImages(env)`, which accepts
iTerm2 and WezTerm and refuses tmux and generic terminals. PNG generation
goes through `sharp`: each image is loaded, resized to 400 pixels, masked
with an SVG circle, and re-encoded. When inline images are unsupported, the
renderer prints only the dream name. The return value is a
`{ block, reviewFlags, repeatFallbacks }` triple; the block appends to
stdout, while flags and fallbacks are routed to stderr for human review.

The dream art design document at
`docs/2026-05-14-dream-art-terminal-rendering.md` elaborates the matching
and fallback rules and is the canonical reference when changes touch the
ledger or the renderer.

## Determinism and the RNG

Determinism is the project's central correctness property: every invocation
with the same seed, content version, stage, shape constraint, count, and
command parameters must produce byte-identical output. The RNG is the
mechanism that delivers this property.

`src/util/rng.ts` is a hash-derived RNG built on Node's `crypto.createHash`.
It does not seed a streaming PRNG; instead, every roll is a fresh SHA-256
over a `DrawContext` plus a `label`, with the first thirteen hex digits
divided by 2^52 to produce a uniform float in `[0, 1)`.

`DrawContext` carries:

- `seed`: the command-supplied or `random:<UUID>` seed.
- `contentVersion`: the composite version fingerprint.
- `rootJourneyIndex`: the 1-based index for batched runs.
- Optional `sequenceStep` for sequential shapes.
- Optional `selectionAttempt` for repair scenarios.

The hash input is a null-byte-joined string of `seed:<seed>`,
`content:<version>`, `root:<index>`, `step:<step or "root">`,
`attempt:<attempt>`, and `label:<label>`. Because the label is appended,
every callsite can derive an independent sub-RNG simply by passing a
distinct label string (for example, `dreamArt:order`,
`stateless:stage`, `push_your_luck:attempt:0`). Sub-system isolation is
therefore strict by construction: two systems that pick different labels
cannot collide unless they intentionally share a label.

Public RNG helpers:

- `drawUnit(context, label): number` produces a float in `[0, 1)`.
- `drawInt(context, label, min, max): number` is a uniform integer.
- `weightedChoice(context, label, choices)` picks an element by its weight.
- `shuffleDeterministic(context, label, items)` Fisher-Yates shuffles.
- `deterministicTieJitter(context, label, magnitude)` returns a stable
  small offset for tie-breaking.

`randomSeed()` in the journey command generates `random:<UUID>` whenever
`--seed` is omitted; the seed is then echoed in the manifest so users can
re-run any output exactly. `--count` simply increments `rootJourneyIndex`
across iterations, so a batch produces independent but reproducible
journeys.

The content version embeds catalog versions, shape definitions, raw TOML
bytes, and manifest schema versions. Bumping any of those changes the
content version, which changes every hash input, which deliberately breaks
seed reproducibility across content revisions. State files store the
content version they were created under and refuse to load on mismatch.

`src/util/stableJson.ts` is the second pillar of determinism. It produces
canonical JSON by sorting object keys with `localeCompare("en-US")`,
detecting cycles, rejecting `undefined` and `bigint`, and normalizing
non-finite numbers to `null`. The renderer uses it for JSON output, the
content versioner uses it when hashing shape definitions, and the state
writer uses it when persisting state so that two semantically identical
states produce identical bytes.

## State, Atomic Writes, and Content Versioning

Although the active command path is stateless and never reads or writes
`.journey/state.json`, the repository maintains a complete state file
format for the dormant pick, new, and state commands. The state machinery
described in this section therefore exists only along those unwired code
paths today.

`src/state/schema.ts` defines `JourneyState` and its sub-records: the quest
state, the resources, the deck and its summary, the active dreamsign and
bane lists, the draft pool, the dreamsign pool ids, the route's pacing
ledger, and the history of pick entries.

`src/state/state.ts` exposes load and save functions:
`readJourneyState(path): JourneyState | null` and
`writeJourneyStateAtomic(path, state)`. The atomic writer serializes the
state via `stableStringify`, then delegates to `src/state/atomicWrite.ts`,
which writes to a temp path (`<path>.<pid>.<counter>.tmp`) and renames it
over the destination. Rename is atomic on POSIX filesystems, so observers
either see the previous state or the new state, never a torn write. The
writer cleans up the temp file if the rename fails.

`src/content/version.ts` computes the version string consumed by every
state and manifest. The version is recomputed at startup, compared to the
state file's stored version, and treated as an unrecoverable failure if
they disagree.

## The Reward Art Ledger

The reward art ledger is `docs/journey-reward-art-matches.toml`. Each entry
declares one dream: an `imageId` (the path-based key used by the renderer
to load the PNG), a two-word `dreamName`, and a `rewardType` matching one
of the canonical reward types declared in `src/journey/rewardArtTypes.ts`.

`rewardTypeForTemplateId(templateId)` maps shared reward template ids onto
those reward type strings. The renderer loads the ledger once
(`loadDreamLedger`), indexes entries by reward type, and caches the result.
During `renderDreamArt`, each option's primary reward type drives a search
for an unused dream of that type. When that pool is exhausted, the matcher
borrows from other types in a deterministic order; when the entire ledger
is exhausted in a single manifest, the matcher emits a `reviewFlags` entry
to alert maintainers that the ledger needs expansion.

Recent commits in the project history (`Borrow ledger dreams for reward-less
options instead of flagging them`, `Borrow a cross-type dream instead of
repeating an image`, `Fall back to a repeated dream when the ledger pool is
exhausted`) reflect ongoing tuning of this allocator's fallback chain.

## Testing and Tooling

Tests are written in Vitest and live under `test/`. The configuration in
`vitest.config.ts` allows up to eight parallel workers and grants a
generous test timeout, but the project's `AGENTS.md` enforces a 30-second
budget per test by convention.

Top-level test files cover cross-cutting invariants:

- `cli.test.ts` exercises the CLI program surface and command registration.
- `journey-shapes.test.ts` verifies shape catalog integrity, deterministic
  registration order, and version constants.
- `journey-shape-isolation.test.ts` enforces that no shape-specific symbol
  leaks outside its plugin directory or `src/journey/shared/`.
- `journey-value-symbols.test.ts` covers the value model and symbol
  assignment.
- `content.test.ts` and `content-version.test.ts` cover TOML loading and the
  content version hash.
- `state-io.test.ts` covers state serialization and the atomic writer.
- `render-feedback.test.ts` and `dream-art.test.ts` cover the human and
  dream art renderers.
- `effects.test.ts`, `quest.test.ts`, `command-risk.test.ts`, and
  `automatic-leave.test.ts` cover effect resolution, quest setup, command
  safety, and refusal flows.

`test/shapes/` contains one focused test file per active shape, asserting
shape-specific contract details. `test/shared/` holds tests for the
shared content layer (rewards, costs, predicates, text helpers).
`test/helpers/journey-context.ts` and `test/fixtures/` build the
deterministic state, render, and context fixtures the rest of the suite
shares.

`scripts/shape-distribution.ts` is a developer-facing Monte Carlo tool. It
runs many invocations of the generator over a chosen stage and prints a
table comparing observed shape frequencies against the score-weight table.
Its output is the canonical way to spot drift between intended and actual
shape prevalence after weight or scoring changes.

The `analysis/` directory holds archival analyses (for example,
`analysis/early-journey-duplicates/`) rather than active code. These are
one-off observability artifacts kept for historical context.

## Manual QA

This section describes how to verify the tool end-to-end without relying
on automated tests.

Run the bare default command with no arguments to confirm the happy path:
`pnpm journey` (or the installed `journey` binary). The output should be a
single journey, with a Dream Journey heading, a Dreamcaller line, a stage
and resources line, and either a numbered flat menu of options or a
decision tree. Each option line should have a number, one to three symbol
glyphs, and a rendered text describing the trade.

Re-run with the same `--seed` value and confirm the output is identical
across runs. Add `--count 5` and confirm five blocks are produced, each
with a distinct journey id but the same seed.

Force every active stage via `--stage early`, `--stage mid`, and `--stage
late` and confirm the resource line reflects the stage's essence targets
and that the deck summaries (under `--debug-context`) reflect the per-stage
starter and draft card counts.

Force every active shape via `--shape <id>` for each registered shape and
confirm that the generated journey adheres to the documented topology:
flat menus produce numbered options without a tree, single-offer produces
two options where option two is a no-effect leave, decision trees produce
a `Decision Tree` heading with labelled branches, and push-your-luck shows
attempt-by-attempt odds.

Add `--json` and confirm the output is well-formed JSON, contains all
documented top-level fields, and is byte-stable across repeated invocations
with the same seed (a `diff` of two runs should be empty).

Add `--debug` and `--verbose` and confirm the debug block shows the
selected shape, the desired tags, the shape score table, per-option CEC
breakdowns, and (with `--verbose`) full operation value bands.

Add `--debug-context` and confirm the context block shows the Dreamcaller,
its awakening value, the resources, deck and dreamsign summaries, banes,
and the draft pool summary. Add `--show-deck` and confirm the deck list
and active dreamsigns are printed in sorted order.

Run in a terminal that does not support color (for instance, redirect to a
pipe) and confirm output is uncolored. Run in iTerm2 and confirm dream art
images render beneath each option. Run in tmux or a generic terminal and
confirm only the dream names are printed, with no escape leakage. Force an
unsupported terminal by setting `TERM=dumb` and confirm graceful fallback.

Edit one of the content TOML files (for example, change a card name in
`data/cards.toml`) and re-run with the same seed. Confirm the output is
different from the prior run, demonstrating that content version changes
flow through the RNG.

Pass an invalid `--shape unknown_shape` and confirm exit code `2` and a
clear error message. Pass `--count 0` or `--count 1001` and confirm
validation rejects the value with the same exit code.

Run `pnpm test` and confirm all tests pass. Run
`pnpm tsx scripts/shape-distribution.ts --stage early --trials 1000` and
confirm the printed frequencies are within roughly one percentage point of
the configured weights. Run `pnpm typecheck` and confirm the project type
checks cleanly.
