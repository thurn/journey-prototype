# Dream Journey Sequential Overhaul

## Summary

This document specifies a redesign of the Dream Journey command-line interface
simulator and the Dream Journey Shape model for multi-step Journeys.

The CLI simulator should become a stateless generator. Its primary command is
the bare `journey` command, which generates one random Journey, prints the full
mechanical offer, and exits. The command must not open an interactive picker,
store a pending choice, or require a separate reset command before producing a
new Journey. `journey pick` and `journey new` should be removed from the
documented command surface. `journey run` may remain as a compatibility alias
for the same stateless generation behavior if keeping it is low-cost, but it
must not preserve the old pending-state semantics.

True sequential Journeys should no longer be represented as interactive
follow-up menus. A generated multi-step Journey must display the complete
decision tree up front: every stop branch, continue branch, random branch,
terminal reward, terminal failure, and transition between levels must be
inspectable from the initial output. The CLI is a review and debugging tool for
generated Journey design, so it should show the entire authored structure rather
than simulate step-by-step player input.

The existing sequential shape family should be replaced. `take_any_number`
stays, but it is not a true sequential topology and does not need tree
rendering. `repeat_to_scale`, `sequential_offers`, and `escalating_search`
should be deleted as canonical shapes. `push_your_luck` should stay as a name
but be rebuilt around repeated risk of ending the Journey while chasing
mechanically connected rewards. New canonical true-sequential shapes should
cover prize ladders, probability ladders, random pool draws, and escalating
reward chains.

## Related Information

- [Dream Journey CLI Simulator Technical Design][cli-design] defines the
  current stateful simulator contract that this design replaces.
- [Dream Journey CLI Scenario Appendix][scenario-appendix] records the current
  pending-state, `pick`, and `new` acceptance scenarios that should be retired
  or rewritten when this design is implemented.
- [Dream Journey Generation][generation] defines the shape-first generation
  model, canonical shape catalog, validation, repair, value balancing, and
  stage texture rules that this design updates.
- [Dream Journey Examples][examples] provides reference examples for the new
  sequential shape catalog and should be kept in sync with this design.
- [Dream Journey Brainstorm][brainstorm] is the broad idea inventory for
  rewards, costs, burdens, triggers, predicates, and shape concepts.
- [Dreamtides Quests][quests] defines quest resources, Dreamcallers, package
  tides, draft pools, Dreamsign pools, sites, and Dream Journey context.

## Problem And Context

Dream Journeys are the roguelike event layer for Dreamtides quests. The
simulator exists so designers and implementers can inspect generated Journey
Shapes before production quest UI and full effect application exist.

The current CLI behaves like a tiny stateful quest simulator. `journey run`
creates or reprints a pending Journey, `journey pick N` records a selected
option and may advance a sequential Journey, `journey state` inspects
project-local simulator state, and `journey new` resets that state. This made
sense when the CLI was trying to simulate a player choosing through generated
Journeys one command at a time.

The intended use has changed. The simulator should now answer a simpler design
question: "What Journey would the generator produce under this context?" Each
run should produce a fresh random Journey unless the caller supplies a seed or
other debug constraint. The tool should remain deterministic when asked, but it
should not make persistence, pending choices, or interactive picking part of
the default workflow.

The current sequential shape model also conflicts with the new use case.
Interactive follow-up menus hide later choices until after a pick. That is poor
for a design-review CLI whose purpose is to evaluate generated topology. The
user needs to inspect the whole multi-step object at once, including whether
costs scale coherently, whether rewards are mechanically connected, whether
risks terminate the Journey correctly, and whether a stop branch remains
meaningful at each level.

The current canonical sequential shapes are also too broad or misclassified.
Some examples are single-choice scaling menus, not sequential structures. Some
push-your-luck examples apply deterministic costs or incidental risk rather
than capturing the core tension of repeated danger for better rewards. Some
sequential-offer and escalating-search examples are weak because they depend on
thin browsing or search metaphors rather than strong cost, reward, and branch
invariants.

## Goals

- Make the Dream Journey CLI stateless by default.
- Make bare `journey` the primary documented generation command.
- Generate a fresh Journey on each default invocation.
- Preserve deterministic manual quality assurance through explicit seed,
  stage, shape, and debug-context flags.
- Remove interactive Journey picking from the CLI.
- Remove pending Journey state from the normal command path.
- Display true sequential Journeys as complete decision trees.
- Keep normal output focused on the generated Journey.
- Expose quest context, including the generated deck, through explicit debug
  and JSON surfaces.
- Replace weak or misclassified sequential shapes with a smaller set of
  stronger canonical sequential topologies.
- Keep `take_any_number` as a non-tree repeatable menu topology.
- Preserve the shape-first generation model, value balancing, validation,
  repair, and stage texture principles.

## Non-Goals

- Implement production quest effect application.
- Simulate battles.
- Add interactive terminal prompts, text-user-interface navigation, or
  long-running CLI sessions.
- Preserve `.journey/state.json` compatibility as a gameplay or QA contract.
- Migrate old pending Journey state.
- Keep old sequential shape IDs for compatibility in generated content.
- Author final production UI copy, art behavior, or animation behavior.
- Solve all numerical balance values for every possible generated reward and
  cost.

## Command Contract

The primary command is bare `journey`. It generates one Journey from the current
local TOML content, programmatic Journey catalog, and command-line parameters.
It prints the result and exits.

The command is stateless by default. Without a seed, consecutive invocations
should normally produce different Journeys. With the same seed, stage, shape
constraint, catalog version, content version, and context parameters, the
output should be deterministic.

The old `journey new` command should be removed from the documented command
surface because there is no persistent simulator quest to reset. The old
`journey pick` command should be removed because the CLI no longer records
choices or advances an interactive sequence. `journey state` should also be
removed from the documented command surface unless implementation needs a
temporary compatibility command during transition.

`journey run` may remain as an alias for bare `journey`. If retained, it must
use the same stateless generation path and the same flags. It must not read a
pending Journey, write a pending Journey, or instruct the user to pick an
option. The alias is a compatibility convenience only; bare `journey` is the
canonical command in documentation and examples.

## Generation Parameters

The command should support explicit generation controls for QA and review.

- `--seed <seed>` fixes the generator seed for deterministic output.
- `--stage early|mid|late` fixes the Journey stage texture.
- `--shape <shape_id>` constrains generation to one canonical shape.
- `--json` emits structured output without ANSI color.
- `--no-color` disables color in human output.
- `--debug` shows generation metadata in human output.
- `--debug-context` shows the generated quest context in human output.

Debug output should not be the default human mode. The default command should
show the Journey itself. The CLI may still print a compact seed or reproduction
hint when useful, but detailed scoring, repair, and context information belongs
behind explicit debug flags or in JSON.

`--shape` is a QA control, not a bypass. A forced shape must still be filled
against a real generated context, validated, repaired when possible, and
reported as an error if the requested shape cannot be legally generated for the
current context.

`--debug-context` exists because reviewers need to know what deck and resource
state caused the generated Journey. It should include at least the selected
Dreamcaller, stage, resources, active Dreamsigns, selected package tides, deck
summary, full deck list, Bane count, starter count, and relevant card or
Dreamsign pool summaries. It should not clutter the default Journey output.

## Stateless Context Generation

Although the CLI is stateless, it still needs a quest-like context for
generation. Each invocation should construct an in-memory simulated quest
context from local TOML content and command-line parameters.

The generated context must continue to use real Dreamtides content. Dreamcaller
selection, selected package tides, starter deck, draft pool, Dreamsign pool,
card references, and Dreamsign references should come from the local content
bundle and the same package-tide rules used by the existing simulator.

When no seed is supplied, the command should choose a fresh seed and use it for
all random choices in that invocation. When a seed is supplied, all context
generation and Journey generation should be deterministic. The seed should
cover both the simulated quest context and the Journey fill so that a debug
command can reproduce the exact deck and Journey together.

The in-memory context should include the same broad fields the generator needs
today: Dreamcaller, selected package tides, resources, completion level or
stage, deck, active Dreamsigns, draft pool summary, Dreamsign pool summary,
recent history signals when supplied or simulated, unresolved hooks when
supplied or simulated, and generation cursor data. Because there is no
persistent history, default repetition and hook ledgers should be empty unless
the command later grows explicit parameters or fixture inputs for them.

Stage should be derived from `--stage` when present. If `--stage` is absent,
the command should choose `early`, `mid`, or `late` with equal weight. This
keeps default simulator runs varied while preserving exact QA control through
the explicit stage flag. The chosen stage must be visible in debug and JSON
output.

## Manifest Contract

The manifest remains the source of truth for both human and JSON rendering.
Text output must be derived from structured manifest data, not from a separate
hand-built transcript.

The manifest should no longer model "pending" Journey state as a persistence
concept. Instead, it should represent a single generated Journey result. It may
still contain a Journey ID, seed, stage, shape ID, selected tags, options,
references, precommitted outcomes, validation repairs, value breakdowns, and
debug metadata.

The manifest should replace interactive sequence state with complete tree data
for true sequential topologies. The important contract is that the manifest can
describe every branch without requiring the renderer to infer later menus from
option text.

For direct-menu and non-tree shapes, the manifest may keep a flat option list.
For true sequential shapes, the manifest should include a tree representation
with a root node, non-terminal decision nodes, outgoing branches, branch
conditions, branch actions, and terminal outcomes.

Each tree node should have a stable ID within the manifest, a level label, a
short mechanical description when useful, and outgoing branches unless it is
terminal. Each branch should identify whether it is a player choice, a random
chance, or an automatic transition. Each terminal should state how the Journey
ends and what reward, cost, burden, or failure outcome has been reached.

Branch payloads should reuse the same structured cost, effect, burden, target,
trigger, route-effect, and converted-essence fields used by ordinary options.
This lets validation, JSON, and debug output reason about tree branches without
parsing rendered text.

Precommitted randomness remains important. For random branches, the manifest
must store visible odds and a bounded outcome envelope. If a random outcome is
pre-rolled for QA or design reasons, the manifest must store the committed
outcome and the presentation policy must say whether it is visible in normal
output.

## Human Output

Normal human output should print one generated Dream Journey and exit. It
should not print next commands for `pick`, should not say a pending Journey was
stored, and should not imply state was updated.

Direct-menu shapes should continue to render as concise numbered mechanical
options with symbols where useful. Non-tree shapes must render at least two
root choices. Single-reward, random-commit, delayed-hook, and route-edit shapes
can keep their existing mechanical style only by offering multiple variants in
the same family; they must not collapse into forced one-line acceptances.

True sequential shapes should render as decision trees. The tree does not need
ASCII art. It should be a readable hierarchical listing with levels, branches,
odds, costs, rewards, transitions, and terminal outcomes. A reviewer reading
only the normal output must be able to reconstruct every possible path.

The renderer should use stable language for branch kinds:

- `Stop` for a player branch that ends or exits the sequence.
- `Continue`, `Attempt`, `Draw`, `Push`, or `Take` for the active branch,
  depending on the shape.
- `Success`, `Failure`, `Safe`, or `Hazard` for random branches.
- `Claim` for a final deterministic terminal reward.

The renderer should avoid narrative event names, character speech, and hidden
shape implementation details in normal output. Shape ID, scoring, repairs,
value calculations, and debug-context details belong in explicit debug output
or JSON.

## JSON Output

`journey --json` should emit one deterministic JSON payload for the generated
Journey. It should include the generated manifest, generated context summary,
debug metadata, content version, catalog version, command parameters, and seed.

JSON should always include the generated deck and context needed to understand
why the Journey was generated. Human output requires `--debug-context` for that
same information, but JSON is a debugging and fixture surface, so structured
context should be present by default there.

JSON should not include ANSI color. Consumers should not need to parse human
text to discover shape ID, stage, option values, tree branches, odds, or deck
contents.

## Shape Catalog

The canonical shape catalog should remove the old interactive sequential
definitions and replace them with explicit tree-compatible shapes.

`take_any_number` remains canonical but should not use the true sequential
topology. Its topology is a repeatable menu: the player can take any subset of
visible offers up to a visible cap or leave. It should render as a menu, not as
a tree.

`repeat_to_scale` should be deleted. Its examples were single-choice scaling
menus rather than true sequential structures. The useful design space is split
between `prize_ladder`, where stop rewards and continue costs scale toward a
large final prize, and `escalating_reward_chain`, where the player receives a
repeated reward at each accepted level.

`sequential_offers` should be deleted. Browsing one offer after another is too
thin as a canonical topology for this generator. Stronger cases should be
represented as `shop_row`, `same_reward_different_costs`, `prize_ladder`,
`random_pool_draws`, or another shape with clearer invariants.

`escalating_search` should be deleted. Search depth by itself is not a strong
enough invariant. The viable designs should be represented by
`probability_ladder`, `prize_ladder`, `push_your_luck`, or
`escalating_reward_chain`, depending on whether the depth is about chance,
deferred prize, failure risk, or repeated rewards.

`push_your_luck` remains canonical but must be reimplemented. Its identity is
repeatedly risking an immediate Journey-ending failure in order to access
stronger mechanically connected rewards. Deterministic escalating costs do not
belong in this shape.

## New True-Sequential Shapes

`prize_ladder` is a deterministic tree where each level offers a stop reward or
a continue cost. Stop rewards are repeated and scaled versions of the same
reward family. Continue costs are repeated and scaled versions of the same cost
family. The final reward is a large connected prize rather than a small
incremental reward.

`probability_ladder` is a repeated gamble for one fixed reward. Each level lets
the player stop or pay for a chance to gain that reward. A success ends the
Journey immediately, so the player cannot receive the fixed reward multiple
times. Variants may use escalating or fixed costs and escalating or fixed odds,
but one Journey must keep the same reward and same cost resource throughout.

`random_pool_draws` is a repeated draw from a fixed visible reward pool. Each
level lets the player stop or pay the same fixed cost for another random draw
from the same pool. The generated Journey must state whether outcomes draw with
replacement or without replacement.

`escalating_reward_chain` is a repeated reward chain. Each level lets the
player stop or take the next reward at an escalating cost. The repeated reward
class stays fixed, and an optional final level may use a much higher cost for a
stronger connected version of the same reward.

## Shape Invariants

Every true sequential shape must have a bounded number of levels. Three levels
is the default target. Four levels is acceptable for `escalating_reward_chain`
when the last level is a large connected finale. Unbounded loops are out of
scope.

Every non-terminal level must have a meaningful stop or exit branch unless the
shape intentionally reaches a forced final claim after earlier voluntary
branches. A stop branch must be a strategically coherent endpoint, not a fake
button whose only purpose is to satisfy validation.

Every continuation branch must state its cost, risk, or commitment before the
transition. If the continuation has a random result, the odds and possible
terminal states must be visible.

Cost families must remain coherent inside one generated tree. A shape that
starts by charging essence should not suddenly switch to adding a Nightmare at
the next level unless the authored variant explicitly uses a repeated compound
cost where that pattern appears consistently.

Reward families must remain coherent inside one generated tree. A
push-your-luck Dreamsign chain may move from random Dreamsign, to named
Dreamsign, to choice of Dreamsigns. It should not move from essence, to route
editing, to card deletion without a strong authored reason.

## Validation And Repair

Validation should reject true sequential manifests that cannot be understood
from the initial output. Missing levels, hidden follow-up menus, unlabeled
random branches, missing terminal outcomes, and non-terminal nodes without
outgoing branches are structural errors.

Validation should reject incoherent cost scaling. In `prize_ladder`,
`probability_ladder`, and `escalating_reward_chain`, all payable costs should
use the same resource type or the same repeated compound cost template.

Validation should reject incoherent reward scaling. Stop rewards, final prizes,
fixed gamble rewards, repeated pool rewards, and repeated chain rewards should
match the shape's required reward relationship.

Validation should reject chance structures that can award a fixed reward more
than once in `probability_ladder`. It should also reject push-your-luck trees
where failure does not end the Journey or where the player can keep pushing
after receiving a terminal take reward.

Value validation should operate on branches as well as flat options. The
generator should compute converted-essence values for costs, rewards, burdens,
uncertainty, and net value at each branch and at useful path summaries. Debug
output should make it clear which level or branch each value describes.

Repair should stay deterministic. For a failed tree fill, repair should first
adjust values or payloads within the same shape, then simplify the tree variant
inside the same shape, then choose the next legal shape if shape forcing is not
active. If `--shape` is active and no legal fill can be repaired, the command
should fail with a clear error rather than silently generating another shape.

## Implementation Surfaces

The command parser should stop treating `pick`, `new`, and `state` as primary
commands. Bare `journey` should call the same stateless generation handler as
the optional `run` alias. The handler should build an in-memory context, call
the generator once, render the manifest, and exit without reading or writing
project-local simulator state.

The state module may remain in the repository while old tests or compatibility
paths are being removed, but the new command path should not depend on
`.journey/state.json`. Content-version mismatch should be reported against
loaded content and catalog versions in debug or JSON, not by rejecting stale
local state.

The shape catalog should update the `JourneyShapeId` union, topology values,
shape definitions, validation rule names, repair preferences, version
contributions, and tests that assert the canonical catalog. The old
`sequential` topology should be replaced or narrowed so it refers only to
complete-tree shapes. `take_any_number` should move to a repeatable-menu
topology.

The manifest model should add explicit tree structures for true sequential
shapes and remove interactive pick behavior from the generated output contract.
Existing `PickBehavior`, `SequenceState`, and `sequenceMenus` concepts should
not remain as the way normal sequential Journeys are represented. They may
survive temporarily only as migration scaffolding while tests and renderers are
rewritten.

The filler layer should stop producing step-one menus for sequential shapes.
It should produce complete trees for `prize_ladder`, `probability_ladder`,
`random_pool_draws`, `push_your_luck`, and `escalating_reward_chain`. Direct
menu fillers should continue to produce flat options.

The generator should treat `--shape` as a shape-selection constraint before
weighted random shape selection. Forced shape generation still goes through
fill, validation, repair, and debug reporting.

The human renderer should add a tree renderer and remove next-command text that
mentions `journey pick`. The JSON renderer should expose the same tree data and
context data without requiring consumers to parse rendered lines.

The test suite should replace pending-state and pick-transition expectations
with stateless-generation expectations. Coverage should include bare command
generation, deterministic seeded generation, forced shape generation, JSON
context output, debug-context human output, tree rendering for each new true
sequential shape, and validation failures for malformed trees.

The first implementation does not need explicit fixture input flags for deck,
resources, active Dreamsigns, recent history, or unresolved hooks. Seeded
context generation plus `--stage`, `--shape`, `--debug-context`, and `--json`
is the required QA surface. More fixture controls can be added later if seeded
context generation is not enough to reach a specific bug.

## Compatibility Requirements

Existing `.journey/state.json` files do not need to be migrated. The new CLI
does not use them in the default path.

If compatibility commands remain temporarily, they should clearly behave as
aliases or deprecated no-ops rather than preserving the old semantics. The
implementation should avoid a split-brain state where bare `journey` is
stateless but `journey run` still reads and writes pending state.

Documentation and scenario examples that describe frozen pending Journeys,
`journey pick`, `journey new --force`, invalid pick handling, content-version
mismatch against stored state, or sequential step advancement should be
rewritten or retired when this design is implemented.

## Acceptance Criteria

- Running bare `journey` prints one generated Journey and exits successfully.
- Running bare `journey` repeatedly without a seed can produce different
  Journeys without requiring a reset command.
- Running `journey --seed qa --stage late` is deterministic under the same
  content and catalog versions.
- Running `journey --shape prize_ladder --seed qa` either prints a valid
  `prize_ladder` tree or fails with a clear validation error.
- Running `journey --json` includes the generated manifest, tree data when
  present, generated context, deck list, seed, stage, shape ID, content version,
  catalog version, and debug metadata.
- Running `journey --debug-context` prints the generated deck and relevant
  context in human-readable form.
- Normal output for true sequential shapes displays the complete decision tree
  up front.
- Normal output never instructs the user to run `journey pick`.
- `journey pick` and `journey new` are absent from documented help, or are
  clearly deprecated and not part of the normal workflow.
- The generator no longer treats `repeat_to_scale`, `sequential_offers`, or
  `escalating_search` as canonical shapes.
- `take_any_number` renders as a repeatable menu rather than a decision tree.
- `push_your_luck` validates that failed pushes end the Journey and that later
  rewards are mechanically connected to earlier rewards.

## Risks And Tradeoffs

Removing state makes the CLI less like a miniature quest simulator. That is an
intentional tradeoff. The tool becomes better at reviewing generated Journey
objects and worse at demonstrating a sequence of simulated player choices over
time.

Printing complete decision trees can make some Journeys longer. That cost is
acceptable because multi-step Journeys are the cases where hidden structure is
most dangerous. The renderer should keep branch text concise rather than hide
later levels.

Forcing shapes can expose contexts where a shape cannot be legally generated.
That is useful for QA, but it requires clear errors. Silent fallback would make
forced-shape testing untrustworthy.

Stateless context generation may reduce realism because there is no real
history ledger unless supplied by future fixture inputs. The generator should
still use realistic Dreamcaller, deck, resource, and pool context. More
advanced history fixtures can be added later without restoring pending state as
the default model.

## Appendix: Worked CLI Examples

The examples in this appendix are normative for no-color human output for the
four new true-sequential shapes. Color-enabled output may wrap the same text in
ANSI escape sequences, and debug flags may append debug sections, but the
default no-color output for these forced-shape QA commands should match the
stdout shown here exactly.

The examples intentionally do not print shape IDs, next commands, pending-state
messages, or pick instructions. The forced `--shape` flag is a QA input, not
normal user-facing output.

### Prize Ladder

Command:

```text
$ journey --seed appendix-prize --stage mid --shape prize_ladder --no-color
```

Expected stdout:

```text
Dream Journey
Quest: Vaela, Ember Among Remnants
Stage: mid    Essence: 120/500    Omens: 1

Decision Tree

Level 1
Stop: Gain 1 omen. End the Journey.
Continue: Pay 35 essence. Go to Level 2.

Level 2
Stop: Gain 2 omens. End the Journey.
Continue: Pay 70 essence. Go to Level 3.

Level 3
Stop: Gain 3 omens. End the Journey.
Claim: Pay 100 essence and choose 1 of 3 Dreamsigns. End the Journey.
```

### Probability Ladder

Command:

```text
$ journey --seed appendix-probability --stage mid --shape probability_ladder --no-color
```

Expected stdout:

```text
Dream Journey
Quest: Vaela, Ember Among Remnants
Stage: mid    Essence: 120/500    Omens: 1

Decision Tree

Level 1
Stop: Leave.
Attempt: Pay 25 essence for a 25% chance to gain a Dreamsign.
Success: Gain the Dreamsign. End the Journey.
Failure: Go to Level 2.

Level 2
Stop: Leave.
Attempt: Pay 45 essence for a 45% chance to gain a Dreamsign.
Success: Gain the Dreamsign. End the Journey.
Failure: Go to Level 3.

Level 3
Stop: Leave.
Attempt: Pay 70 essence for a 70% chance to gain a Dreamsign.
Success: Gain the Dreamsign. End the Journey.
Failure: End the Journey.
```

### Random Pool Draws

Command:

```text
$ journey --seed appendix-pool --stage mid --shape random_pool_draws --no-color
```

Expected stdout:

```text
Dream Journey
Quest: Vaela, Ember Among Remnants
Stage: mid    Essence: 120/500    Omens: 1

Pool
Randomly gain one: a Dreamsign, an event card, {Scarlet Transfiguration}, 2 omens, 75 essence, or purge a starter card. Outcomes draw with replacement.

Decision Tree

Level 1
Stop: Leave.
Draw: Pay 50 essence and gain a random reward from the pool. Go to Level 2.

Level 2
Stop: Leave.
Draw: Pay 50 essence and gain a random reward from the pool. Go to Level 3.

Level 3
Stop: Leave.
Draw: Pay 50 essence and gain a random reward from the pool. End the Journey.
```

### Escalating Reward Chain

Command:

```text
$ journey --seed appendix-chain --stage late --shape escalating_reward_chain --no-color
```

Expected stdout:

```text
Dream Journey
Quest: Vaela, Ember Among Remnants
Stage: late    Essence: 120/500    Omens: 1

Decision Tree

Level 1
Stop: Leave.
Take: Pay 10 essence and transfigure a random card. Go to Level 2.

Level 2
Stop: Leave.
Take: Pay 20 essence and transfigure a random card. Go to Level 3.

Level 3
Stop: Leave.
Take: Pay 40 essence and transfigure a random card. Go to Level 4.

Level 4
Stop: Leave.
Take: Pay all essence and transfigure all cards in your deck. End the Journey.
```

[cli-design]: 2026-05-05-dream-journey-cli-design.md
[scenario-appendix]: 2026-05-05-dream-journey-cli-scenario-appendix.md
[generation]: dream_journey_generation.md
[examples]: dream_journey_examples.md
[brainstorm]: dream_journey_brainstorm.md
[quests]: quests.md
