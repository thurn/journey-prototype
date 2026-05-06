# Dream Journey CLI Simulator Technical Design

## Summary

This document specifies a standalone TypeScript command-line interface for
simulating the Dreamtides Dream Journey generation system. The tool is named
`journey` in examples. It is a developer-facing simulator, not a production
quest engine.

The CLI maintains minimal project-local state between invocations, simulates a
real quest context using real Dreamtides TOML data, generates precommitted Dream
Journey choices, and prints richly colored output using the AYU Mirage palette.
It supports non-interactive commands for showing pending choices, selecting an
option, inspecting simulated quest state, resetting the quest, and emitting JSON
for debugging or later test fixtures.

The tool deliberately does not implement Dream Journey effects. A selected
option is recorded in history and may advance a sequential Journey, but the
effect does not mutate essence, omens, deck contents, Dreamsigns, route state,
or battle rules. This keeps the simulator focused on Journey shape selection,
content filling, converted essence balancing, debug visibility, deterministic
replay, and CLI ergonomics.

The paired scenario appendix is part of this design and gives transcript-level
acceptance scenarios for manual review:
[Dream Journey CLI Scenario Appendix][scenario-appendix].

## Related Information

- [Dreamtides Quests: Master Design Document](quests.md) defines quest mode,
  Dreamcallers, package tides, draft pools, Dreamsign pools, essence, omens, and
  the broader site system that this CLI simulates around.
- [Dream Journey Generation](dream_journey_generation.md) defines the
  shape-first generation model, canonical Journey Shape catalog, precommitment,
  converted essence balancing, validation, repair, stage texture, and pacing
  ledger requirements.
- [Dream Journey Examples](dream_journey_examples.md) gives concrete examples
  for each canonical Journey Shape. These examples are reference behavior for
  CLI output and scenario design, but the CLI should generate structured
  manifests rather than replay fixed examples.
- [Dream Journey Brainstorm](dream_journey_brainstorm.md) lists the broad
  reward, cost, burden, trigger, duration, predicate, and shape ideas that the
  CLI's programmatic Journey catalog should cover. Custom payload, status, and
  battlefield mutation ideas remain useful design context, but they are outside
  this CLI's required catalog until they have real game data to reference.
- [Battle Rules](battle_rules.md) defines Dreamtides card, Dreamcaller,
  Dreamsign, Bane, deck, energy, and battle vocabulary used in generated effect
  text. The CLI should use this vocabulary but should not simulate battles.
- [Cards TOML](../data/cards.toml),
  [Dreamcallers TOML](../data/dreamcallers.toml), and
  [Dreamsigns TOML](../data/dreamsigns.toml) are the authoritative local content
  sources for real cards, Dreamcallers, Dreamsigns, and package-tide
  memberships.
- [AYU Colors](https://github.com/ayu-theme/ayu-colors) is the source palette
  family for colored terminal output. AYU Mirage is the default CLI theme.

## Problem And Context

Dream Journeys are Dreamtides' roguelike event system. They present one to
three root choices, and some shapes present additional bounded follow-up choices
after the player selects an option. Each option is a mechanical ability text
description, not a named event or narrative scene. The production game will use
art, hover descriptions, object popups, and animation. The CLI replaces art
with one or two small symbols and replaces rich UI affordances with structured
terminal output.

The Journey generation design is shape-first. A Journey site is not assembled
by sampling unrelated effects from a global bucket. Instead, generation chooses
a Journey Shape such as `same_cost_different_rewards`, `shop_row`,
`take_any_number`, or `push_your_luck`, fills that topology from reusable effect
entries, validates coherence, checks converted essence values, repairs invalid
fills, and freezes a manifest.

The CLI exists to make that generation system inspectable before production
quest UI and gameplay handlers exist. A developer should be able to run a
command, see a plausible Dream Journey in a real quest context, inspect why it
was generated, pick an option, and continue sampling the Journey system without
playing battles or implementing every effect.

The most important fidelity requirement is that the CLI simulate a real quest
context, even though it does not simulate quest gameplay. The generated options
must be grounded in a real Dreamcaller, real selected package tides, a real
starter deck, a real draft multiset, real card and Dreamsign pools, real
essence and omen totals, and the same broad run-stage texture used by the
Journey generator.

## Goals

- Provide a standalone TypeScript CLI named `journey`.
- Generate Dream Journey choices using the shape-first model.
- Support the full canonical V3 Journey Shape catalog from the generation
  design.
- Cover a broad programmatic reward, cost, and burden catalog, including at
  least the effect families listed in the brainstorming document.
- Use existing TOML files as authoritative sources for real cards,
  Dreamcallers, Dreamsigns, package tides, and starter cards.
- Maintain minimal project-local state between invocations.
- Auto-create a deterministic default quest when state is missing.
- Freeze pending Journey choices so `journey run` can be repeated safely.
- Keep all commands non-interactive: each command prints output and exits.
- Print debug output by default.
- Show converted essence cost, effect, and net values in readable per-option
  debug output.
- Render richly colored terminal output using AYU Mirage by default.
- Provide JSON output for the core commands that inspect or transition state.
- Let developers reset or vary the simulated quest with an explicit command.
- Detect content-version mismatch and refuse to continue until reset.

## Non-Goals

- Implement production quest gameplay.
- Implement battle simulation.
- Apply selected Dream Journey effects to quest state.
- Add a TOML authoring system for Journey-specific shapes, fill rules, effect
  catalogs, converted essence curves, tags, or weights.
- Generate narrative text, Journey names, event names, or flavor prose.
- Render real images in the terminal.
- Require automated tests for this project.
- Replace the future production Journey system, UI, or quest engine.

## Constraints And Requirements

The CLI must be deterministic under a stable seed and stable content version.
Every generated pending Journey must be reproducible from the state file and
content version. Re-running `journey run` must reprint the exact same pending
choices and debug information until the user picks an option or resets state.

The CLI must be project-local. By default, persistent simulator state lives in
`.journey/state.json` under the repository root. This file is a developer
artifact that may be inspected or deleted. The design does not require state to
follow the user across repositories.

The CLI must be non-interactive. It may print suggested next commands, but it
must not prompt for input, wait for keyboard selection, open a text UI, or keep
a process alive after printing output.

The CLI must separate Journey generation from effect application. Selecting an
option records the choice and advances the Journey flow, but it must not
mutate resources or objects described by the selected ability text.

The CLI must use actual Dreamtides content context. It cannot generate Journey
choices against mock-only cards, invented Dreamcallers, invented cards,
invented Dreamsigns, custom transfigurations, custom statuses, or custom
battlefield mutations. Every generated object reference must resolve to
existing TOML-backed content or to a rules vocabulary item that already exists
in the referenced design documents, such as essence, omens, sites, Banes, or
standard transfiguration names.

Journey-specific generation content is programmatic TypeScript content, not
TOML. Shapes, fill rules, generated payload templates, converted essence value
curves, tag profiles, weights, legality rules, and repair rules may be too
complex for TOML and should be expressed in typed code.

The normal output must not show Journey names or narrative text. Each visible
option consists of one or two placeholder symbols followed by mechanical
ability text. The debug section may mention internal shape IDs, tag IDs, score
details, validation notes, and repair notes.

The top-level normal output should not duplicate debug-only generation facts.
In particular, it should not show a standalone `Shape:` line above the options.
The selected Journey Shape belongs in the debug section.

## Proposed Design

The CLI is a manifest-first simulator. Generation produces a typed Journey
manifest that contains every user-visible option, every debug explanation, the
current Journey sequence state, the selected shape, tags, converted essence
values, placeholder symbol categories, random outcomes, validation and repair
metadata, and generation provenance. Human-readable output and JSON output are
both rendered from this same manifest.

This manifest-first boundary is the core design choice. It avoids a
transcript-first generator where text is the source of truth, and it avoids a
full quest-effect simulator where every effect must have gameplay handlers.
The manifest is structured enough for validation, replay, debugging, and later
golden-seed fixtures, but the state transition remains intentionally narrow.

### Quest Context

When no state exists, the first command that needs quest state creates a
deterministic default quest. The default quest uses a stable seed value named
`default` unless the user explicitly starts a new quest with another seed.

Quest initialization must read:

- Dreamcallers from `data/dreamcallers.toml`.
- Cards from `data/cards.toml`.
- Dreamsigns from `data/dreamsigns.toml`.
- Starter cards from cards whose rarity is `Starter`.
- Package tides from card, Dreamcaller, and Dreamsign data.

The default quest should select a real Dreamcaller deterministically. It should
then resolve selected package tides using the same package-resolution rules
described in the quest design: mandatory tides plus a legal optional subset,
draft multiset construction from non-starter cards by tide overlap, and a
Dreamsign pool from Dreamsigns overlapping the selected tides.

The default state should also include ordinary quest resource fields needed by
Journey generation and display. At minimum this includes current essence,
maximum essence, omens, completion level, deck contents, Dreamsigns, selected
tides, draft pool summary, Journey pacing ledger, unresolved hooks, history,
generator cursor, content version, and pending Journey manifest.

The default starting resource values should be stable and explicit in the
implementation. Scenario examples use `120/500` essence, `1` omen, and
completion level `0`. The exact starting values are less important than
determinism and readability, but they should be realistic enough for early-run
Journey generation.

### Journey Content Model

The CLI must implement the full canonical V3 Journey Shape catalog from the
generation design. This includes direct menu shapes, single-offer shapes,
random shapes, delayed shapes, route-shaping shapes, and sequential shapes.

Each Journey Shape definition should be typed and programmatic. It should
describe:

- Shape ID.
- Root option topology.
- Follow-up topology when the shape is sequential.
- Legal option counts.
- Supported site-tag profiles.
- Required target, reward, cost, burden, trigger, timing, and route domains.
- Information contract rules.
- Converted essence matching rules.
- Validation rules.
- Repair preferences.
- Debug metadata.

The reusable effect catalog should be broad, not a small demonstration set. It
should cover at least the families listed in the brainstorming document:

- Essence gain, loss, caps, restoration, and scaled essence effects.
- Omen gain and loss.
- Card draft, card gain, card pack, and card replacement effects.
- Chosen and random purge effects.
- Starter-card cleanup effects.
- Bane gain, Bane purge, Nightmare and other Bane burdens.
- Dreamsign gain, Dreamsign draft, Dreamsign transformation, and Dreamsign loss.
- Standard transfiguration and bounded card rewrite effects that operate on
  existing cards.
- Duplication, merge, split, and card-text mutation effects that operate on
  existing cards.
- Route edits for current and future dreamscapes.
- Triggered and delayed rewards.
- Risk, wager, random outcome, take-any-number, push-your-luck, and sequential
  offer effects.

The catalog must use real cards and Dreamsigns wherever a generated option
references a card or Dreamsign. Custom cards, custom Dreamsigns, custom
transfigurations, custom statuses, and battlefield mutations are intentionally
excluded from this CLI catalog for now. Programmatic Journey definitions may
still describe how to choose, value, and combine real objects, but they must not
invent new game objects as generated payloads.

### Converted Essence Balancing

Every generated option must have converted essence debug values. Converted
essence is a generator-only balancing currency. One essence equals one
converted essence. Non-essence costs, rewards, burdens, and uncertainties use
programmatic estimates.

Each reward, cost, and burden entry should provide:

- Base converted essence value.
- Quantity or breadth curve.
- Stage multipliers for early, mid, and late runs.
- Coarse run-state modifiers.
- Visibility, randomness, delay, and uncertainty adjustments.
- Risk premium when a probabilistic downside is involved.

The CLI does not need perfect balance. It must prevent visibly incoherent
offers and expose the balancing assumptions. For example, gaining a Nightmare
should be a serious cost, not a slightly higher essence payment. Drafting from
eight cards should be more valuable than drafting from four cards, but the
marginal value should diminish as choice breadth grows.

Validation must compare options according to the shape's topology. Shared-cost
shapes should compare reward values in a compatible band. Shared-reward shapes
should ensure increasing costs buy increasing quantity, quality, reliability,
or choice breadth. Repeatable shapes must make stop decisions meaningful by
adding escalating cost, risk, burden, or diminishing value.

Debug output should present values in readable option-numbered form. It should
not expose raw internal key names such as `option_1_net_cev` in human output.

### Generation Flow

When generation is required, the CLI builds a run context snapshot from the
quest state. The snapshot may contain only the features that Journey generation
is allowed to reason about. These include stage, deck size, starter count, Bane
count, current resources, Dreamsign count, selected tides, target availability,
recent shape history, recent tag history, unresolved hooks, and route edit
capacity.

Generation then chooses desired site tags, enumerates legal shapes, scores
them, selects from a top scoring band using deterministic weighted sampling,
fills the chosen shape, validates the result, repairs invalid fills when
needed, and freezes the final manifest.

The scoring model should stay legible. It should consider desired tag fit,
broad run need, target availability, exact-shape repetition penalty, and tag
repetition penalty. It should not attempt to solve the deck card by card.

Repair must be deterministic and visible in debug output. The preferred repair
order is to swap effect entries inside the same shape, simplify a fill style
inside the same shape, then select the next best legal shape.

### Precommitment And Pending State

The pending Journey manifest is committed state. `journey run` must not
generate a replacement while a pending Journey or pending Journey step exists.
It simply renders the frozen manifest again.

Random outcomes that matter to a pending Journey must be precommitted inside
the manifest. This includes visible pre-rolled outcomes, hidden bounded
outcomes, future delayed packages, follow-up options, and paired-return
metadata. If the player runs `journey run` repeatedly, the same outcomes remain
visible or hidden according to the manifest's presentation policy.

Sequential shapes keep the same Journey ID while advancing through steps.
Picking an option that advances a sequence records the step pick and stores the
next step menu as the pending manifest state. It does not generate a new root
Journey until the sequence completes or the user chooses a leave option that
ends the Journey.

### Command Surface

`journey run` shows the pending Journey choices. If no state exists, it creates
the default quest and generates the first Journey. If state exists and a
pending Journey exists, it reprints that pending Journey exactly. If state
exists but no pending Journey exists, it generates the next Journey and stores
it.

`journey pick N` selects option `N` from the pending Journey or pending step.
The command records the pick in history, marks effect simulation as not
applied, and then either prints the next step in the same Journey or generates
and prints the next Journey. Invalid picks are errors and leave state
unchanged.

`journey state` prints the current simulated quest state. It is the main query
surface and should include Dreamcaller, selected tides, essence, omens, deck
summary, Dreamsigns, pending Journey summary, unresolved hooks, pacing ledger
summary, and recent history. Focused flags such as `--deck`, `--dreamsigns`,
and `--json` may narrow or alter the output.

`journey new` replaces the project-local state with a new deterministic quest.
It accepts `--seed` to choose a named deterministic seed. It requires `--force`
when resetting would discard a pending unpicked Journey.

`--json` must be supported by `run`, `pick`, and `state`. JSON output returns
the same pending Journey manifest, state summary, and debug metadata used by
the human renderer. JSON output should not include terminal color escape
sequences.

`--no-debug` hides the debug section from human output. It does not alter the
stored manifest or JSON debug metadata. Debug remains enabled by default.

### Human Output

Human output should be concise, readable, and stable. The normal Journey menu
contains:

- Title `Dream Journey`.
- Quest line with Dreamcaller name and title.
- Resource line with essence, maximum essence, omens, and dreamscape or
  completion level.
- Numbered options.
- Optional debug section.
- Suggested next command.

Each option should be formatted as `1. <symbols> <ability text>`. The symbols
are placeholders for the production images representing costs and effects.
They should be chosen by cost and effect category. The symbols are not names
and should not replace mechanical text.

Ability text must be mechanical and direct. It may reference real cards,
Dreamsigns, Banes, transfigurations, sites, triggers, and durations. It must
not include event names, Journey names, character speech, or narrative prose.

The debug section should mirror option numbering. It should include generation
facts such as seed, Journey ID, stage, selected shape, selected tags, shape
scoring, validation repairs, previous pick metadata, effect simulation status,
sequence status, and per-option converted essence lines.

### Color And Terminal Behavior

The default theme is AYU Mirage. The CLI should use AYU-family colors for all
rich terminal output. Colors should be applied consistently:

- Headings and Journey title use a high-contrast accent.
- Resource names and values use distinct readable colors.
- Option numbers use a stable accent.
- Cost text and negative values use warning or error colors.
- Reward text and positive values use success or accent colors.
- Debug headings and metadata use subdued colors.
- Errors use strong error color on stderr.

The CLI should support truecolor terminals when available. It should respect
standard no-color behavior when color is disabled by environment or explicit
flag. No-color output must preserve all text content and spacing needed for
manual review.

### JSON Output

JSON output is intended for debugging, future golden-seed fixtures, and
scripted inspection. It should be deterministic and stable under the same
content version.

For `journey run` and `journey pick`, JSON should include:

- Command result status.
- State summary after the command.
- Pending Journey manifest after the command, if any.
- Previous pick metadata for `pick`.
- Debug metadata.
- Suggested next commands.

For `journey state`, JSON should include:

- Full state summary.
- Deck entries.
- Dreamsign entries.
- Selected Dreamcaller and selected tides.
- Draft pool summary.
- Pending Journey summary.
- Ledger and history summaries.
- Content version.

JSON should expose structured converted essence values rather than only the
rendered debug text. It should not require consumers to parse human output.

### State And Content Versioning

The state file must contain a content version fingerprint. The fingerprint
should represent all inputs that can affect deterministic generation or
manifest interpretation, including TOML data versions, Journey catalog version,
shape definitions, effect value curves, and renderer-relevant manifest schema
version.

When the CLI detects that existing state was created against a different
content version, it must print a colored non-zero error instructing the user to
run `journey new --force`. It must leave state unchanged. Silent migration is
not required and should not be attempted for pending Journey manifests.

The state file should be deterministic JSON so developers can inspect diffs.
The implementation may use atomic writes to avoid partial files. If the file is
malformed, the CLI should report a non-zero error and should not overwrite it
unless the user explicitly runs `journey new --force`.

### Error Handling

Invalid picks are state transition errors. If the user selects an option number
that is not available, the CLI prints an error to stderr, includes the valid
choice range, suggests `journey run` to show the pending choices, exits
non-zero, and leaves state unchanged.

Missing required TOML files, invalid TOML schemas, missing legal Dreamcallers,
or failure to build a legal default quest are setup errors. They should exit
non-zero with enough context to identify the missing or invalid input.

Resetting with `journey new` while a pending Journey exists requires `--force`.
Without `--force`, the command should exit non-zero and explain that a pending
choice would be discarded.

The CLI should distinguish command usage errors from state/content errors with
consistent exit codes. Exact numeric assignments may be chosen during
implementation, but scenario examples use exit status `2` for invalid user
input.

### Observability

The debug section is the primary observability surface. It is intentionally on
by default. It should be useful to both content designers and engine
implementers.

Debug output should answer:

- Which Journey was generated?
- Which stage and desired tags drove generation?
- Which shape was selected?
- How did selected shape scoring compare against relevant alternatives?
- Which costs and effects were assigned to each option?
- What converted essence value applies to each cost and effect?
- What net converted essence value does each option imply?
- Were repairs needed?
- Was the previous selected effect applied? The answer is always no for this
  simulator, but it should be explicit after picks.
- Did a sequence advance, complete, or generate a new Journey?

The debug section should remain human-readable. Internal IDs are acceptable
when useful, but the main information should be phrased as readable statements
and option-numbered blocks.

## Expected Behavior And Acceptance Criteria

The scenario appendix is the primary empirical acceptance source for this
design. The acceptance criteria below summarize the required behavior.

- First use of `journey run` with no state creates a deterministic default
  quest, generates one pending Journey, prints numbered options, prints debug
  output, stores state, and exits zero.
- Repeating `journey run` while a pending Journey exists reprints the same
  pending Journey exactly and leaves state unchanged.
- `journey pick N` records a valid selection, records that effect simulation
  was not applied, and either advances a sequence or generates the next Journey.
- `journey pick N` does not apply described effects to resources, deck,
  Dreamsigns, route, statuses, or battle rules.
- Sequential Journeys keep the same Journey ID while advancing steps and do not
  generate a new Journey until the sequence ends.
- Invalid picks print an error to stderr, exit non-zero, and leave state
  unchanged.
- Human output shows only numbered mechanical option text in the normal menu,
  with one or two image placeholder symbols.
- Normal output does not show a top-level `Shape:` line outside the debug
  section.
- Debug output is enabled by default, mirrors option numbering, and reports
  selected shape, tags, scoring, sequence status, repair notes when present,
  and converted essence values.
- `--no-debug` hides only the human debug section and does not alter state or
  JSON data.
- `--json` for `run`, `pick`, and `state` emits deterministic structured data
  without ANSI color escapes.
- `journey state` provides a useful query surface for Dreamcaller, selected
  tides, essence, omens, deck, Dreamsigns, pending Journey, ledger, and recent
  history.
- `journey new --seed` replaces state with a deterministic quest for that seed.
- `journey new` requires `--force` when it would discard a pending Journey.
- Content-version mismatch is a non-zero error that leaves state unchanged and
  instructs the user to run `journey new --force`.
- Colored terminal output uses AYU Mirage by default and remains readable with
  color disabled.

## Operational Considerations

This CLI is a local developer tool. It should avoid network access at runtime.
All core content should come from local TOML files and programmatic TypeScript
definitions.

Because state is project-local and generated, it can be deleted to reset the
simulator. The official reset path is still `journey new`, because that command
can enforce pending-choice protection and seed handling.

The CLI should be conservative about automatic repair and migration. It may
repair invalid generated Journey fills before freezing a manifest, but once a
manifest is frozen, later commands should either render it or reject it on
content-version mismatch. They should not rewrite a pending Journey implicitly.

Automated tests are not required for this project. The transcript scenarios in
the appendix are sufficient for manual acceptance review, and JSON output is
designed so automated golden-seed coverage can be added later without changing
the command surface.

[scenario-appendix]: 2026-05-05-dream-journey-cli-scenario-appendix.md
