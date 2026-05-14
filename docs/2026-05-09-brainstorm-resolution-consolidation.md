# Brainstorm Resolution Consolidation

This proposal consolidates a previous pass of per-example "Suggested resolution" entries.
Almost every one is a bespoke band-aid for the example in front of it: a new
named compound family for one specific cost+reward pair, a new shape that only
fires for one brainstorm, a new catalog entry that hardcodes one transfiguration
on one card type.

This is not a sustainable way to grow a procedural generator. The brainstorm
examples are *samples* of a distribution, not a target list. Overfitting the
generator to each sample produces an exploding catalog with poor coverage of
the surrounding space.

This proposal consolidates those resolutions into a small number of
cross-cutting structural changes, then notes the residual aesthetic-symmetry
needs and the genuinely missing primitives.

## Five cross-cutting structural fixes

### 1. Generic "any cost/burden + any reward" composer

Per-example suggestions that collapse into this:
`bane_burden_card_operation`, `bane_purge_plus_essence`,
`transfig-with-bane-burden`, `card_op_reward`, `card_op_with_bane_burden`,
`starter_debt`, `premium_card_op_with_prohibition`,
`delayed predicate purge + immediate named reward`, `bane_ledger`,
`costedCardOperationOffer`, the Vanishing Atlas companion expansion, the Atlas
Locksmith bane companion, and Sealed Hands' `sealedHandsCompoundFill`.

All of these ask for the same thing: inside a single option, pair one element
from a `burdens/costs` pool with one element from a `rewards` pool. Today
`compoundPayloadMenuFill` only dispatches to four hand-crafted families
(`scissor_saint`, `molting_archive`, `withered_orchard`, `mixed_service`), so
every new pairing requires a new fill function.

**Fix:** introduce one generic `genericBundleOption` composer parameterized by
(cost-or-burden source, reward source, optional renderer). The four existing
families become parameterizations of it. New compound rows then require a
configuration entry, not a new fill function.

**Estimated coverage:** ~40% of the "Not generatable" verdicts.

### 2. "Each row independent" menu shape

Per-example suggestions that collapse into this:
`different_cost_different_reward` (Omen-Fed Prism),
`independent_resource_trades` (Narrow Reservoir), `paired_paid_wheels` (Veiled
Cache), `heterogeneous_named_card_operations` (One Card Three Fates),
`escalating_omen_cost_menu` (Omen Ledger), `prohibition_pact_pair`, `risk_menu`
(Crooked Coin), `oneshot_status_menu` (Emergency Thread).

The shape catalog is built around "shared X / varied Y" axioms. Whenever a
brainstorm has *no* shared axis — every row carries an independently chosen
cost AND an independently chosen reward — no shape fits.
`same_cost_different_rewards`, `same_reward_different_costs`, and
`shared_prefix_menu` all force one shared element.

**Fix:** introduce one generic `independent_rows_menu` shape (rootOptionCount
2-3) where each row independently draws from configured pools. The bespoke
shapes above become configurations: which pools each row draws from, and which
distinctness contracts apply.

**Estimated coverage:** another large chunk of "Not generatable" verdicts —
specifically the heterogeneous-menu cases.

### 3. Catalog compatibility traits, not topology allow-lists

Per-example suggestions that collapse into "lift the topology gate":
`chosen-purge` only on three shapes (Priced Silence), `merge_split` and
`materialized_ability` topology lock (Split Signal), `all-event-transfiguration`
blocked from `alter_dreamscapes` (Vanishing Atlas), `all-card-transfiguration`
blocked from compound use (Prismatic Debt), `all-duplicate-purge` topology
gate (Duplicate Purge), text/subtype/keyword families restricted from
named-card paths (Ink Reassignment), `target_restriction` family gating
(Unbarred Spellbook).

The `topologies` field on operation entries was intended as a coherence check
but became a hard wall. Every brainstorm that wants operation X in shape Y
outside its current topology list becomes a "not generatable."

**Fix:** replace per-entry topology allow-lists with declarative compatibility
traits (e.g., "needs single-target", "requires `all_matching` scope", "produces
deck-side mutation"). Shapes ask the catalog "what fits this slot" rather than
the catalog hardcoding "what shapes I belong in." Coherence becomes a property
of the slot, not a per-entry whitelist.

**Estimated coverage:** the cheapest fix — most of these are a few-line removal
plus a slot-trait definition.

### 4. Trigger × resolution registry for delayed hooks

Per-example suggestions that collapse into "wire trigger A to resolution B":
`bane_transform_to_card` only fires at `future_shop` (Thorn Debt), `card_added`
count=1 + named-card only (Gathered Kindling, Thorn Debt), random purge hooks
have no immediate-reward slot (Tomorrow's Knife), counter triggers don't
compose into 3-row menus (Promise Card), `next-victory` excluded from
`now_vs_later` essence path (Held Breath), `dreamsign_trigger` only emits omen
rewards (Repeating Bell), Key Ticket's anchor type coupled to Dreamsign
catalog.

The hook system has triggers and resolutions defined independently in code but
composed by hand-written tables. Every new trigger × resolution combination
requires a new explicit row.

**Fix:** make `expandedDelayedHookCandidates` a cartesian product over a
trigger registry × resolution registry, gated by a small compatibility
predicate, instead of an enumerated list. Adding a trigger or a resolution
unlocks all valid combinations automatically.

### 5. Predicate axes on operation entries

Per-example suggestions that collapse into "parameterize the predicate":
random-predicate transfig hardcoded to `{Glass, Event, count 1}` (Unsorted
Change), only Dissolve in `card_keyword_remove` (Stolen Verbs), no orientation
predicates on Dreamsign random/draft (Sign Between Bells), no "cards costing N
or less" deck-side predicate (Unbarred Spellbook), only `change-subtype-sigil`
(Ink Reassignment), no "any card" version of generated transfiguration (Green
Knife).

Whenever a brainstorm picks a slightly different predicate slice — a different
keyword, a different orientation, a different cost band — there is no entry,
because entries are written per-tuple instead of per-family.

**Fix:** card-op and Dreamsign-op entries should declare `predicateAxes`
(e.g., `{ keyword: any of REMOVABLE_KEYWORDS, count: 1-3 }`) and be expanded
at generation time, instead of one entry per concrete predicate combination.

## Suggested order of work

1. **#1 (generic bundle composer)** — single highest-leverage change; unblocks
   ~40% of the "Not generatable" verdicts on its own.
2. **#2 (independent-rows menu)** — unblocks another large chunk.
3. **#3 (compatibility traits)** — cheapest; removes a class of bugs as a
   side effect.
4. **#4 (trigger × resolution registry)** — smaller scope but kills the
   hook-wiring overfitting outright.
5. **#5 (predicate axes)** — smaller scope; kills the predicate-overfitting
   suggestions.

## Follow-up: aesthetic symmetry contracts

The five fixes above address *reachability*. They do not directly address the
"Generatable but symmetric pattern is coincidence-only" verdicts — cases where
the individual rows can all appear, but no contract enforces them appearing
together as a coherent trio (e.g. a journey of three transfiguration choices,
three resource-only rewards, three dreamsign-themed rewards).

These are real and worth keeping, but the per-example resolutions in the
analysis doc still overfit. A handful of generic contract families covers
all of them:

### A. Family-homogeneous trio contract

"All N rows draw from the same family." Covers:
- Lantern Budget (`resource_only_trio`)
- Sign Between Bells (`dreamsign_reward_trio`)
- Spoiled Victory (`next_victory_replacement_trio`)
- Three Masks (all-draft trio)
- Toll Cabinet (shared-cost service trio: cleanup + transfig + dreamsign-draft)

Implementation: a single `homogeneous_family_trio` contract parameterized by
which family pool the rows draw from. Existing reward-menu shapes
(`curated_reward_trio`, `same_cost_different_rewards`) gain an
optional family-restriction filter; the contract records the chosen family
so it surfaces in symmetry tagging.

### B. Shared-axis-with-rotated-attribute contract

"All N rows share family X, but rotate attribute Y across distinct values."
Covers:
- Locksmith Counter (shared starter target / varied operations)
- Dreamsign Loom (varied dreamsign operation families)
- Unbarred Spellbook (shared operation family / rotated target modes)
- Key Ticket (shared trade-ticket pattern / rotated reward kinds + triggers)

Implementation: extend the existing symmetry-contract registry with a
parameterized `shared_X_varied_Y` contract. Both X and Y are declarative
references into the catalog (family, target mode, trigger family, reward
kind). Today these contracts each get hand-written; this would let one
contract object describe any shared-axis-with-rotation pattern.

### C. Distinct-everything contract

"All N rows must vary across two or more axes simultaneously." Covers:
- Bane Ledger (distinct Banes per row, distinct rewards per row)
- The "no shared element" cases enabled by structural fix #2

Implementation: pairs naturally with structural fix #2 — the
`independent_rows_menu` shape needs this contract to enforce that the rows
are not all the same.

These three contract patterns replace ~10 of the bespoke
"`*_trio`" / "`*_pact`" contracts proposed in the analysis doc.

## Genuinely missing primitives

A small residue of brainstorm gaps is *neither* compositional nor symmetric —
they need new content primitives that simply do not exist yet. Listed in
priority order:

- **Transfiguration removal** operation (Starter Debt). Already mentioned in
  Milestone 5 as required work; not implemented.
- **Generalized keyword removal** (Stolen Verbs). The catalog has
  `Dissolve`-removal only; needs a `REMOVABLE_KEYWORDS` family. (Naturally
  falls out of fix #5.)
- **Deck-source draft / peek-N-then-mutate** (Echo Table, Stolen Verbs).
  Today `draftCards` only sources from `pool` / `catalog`; no path to "draw N
  from your deck and \<mutate\> one of them."
- **Reveal-and-choose Dreamsign transform** (Dreamsign Loom).
  `transform-to-revealed-choice` does not exist; current entries are either
  "transform to one named result" or "transform to a hidden roll."
- **Single-row no-choice trial topology** (The Unspent Hand). All shapes
  enforce `rootOptionCount.min >= 2`. A single-rule application has no shape
  home.
- **Generated trade tickets** (Key Ticket). Generic ticket-style anchors
  (Key, Parchment, Token) for `paired_return`'s `future_named_object_trade`;
  today the anchor must be a real catalog Dreamsign.
- **`expires/dissolves after N triggers` lifetime semantics** (Repeating
  Bell). No payload describes object lifetime in trigger units.
- **In-battle one-shot status archetype** (Emergency Thread). Status payload
  fixtures need hand/energy/turn manipulation coverage.

Each of these should be a small focused addition rather than a per-example
shape or compound family.

## What this proposal supersedes

Adopted as written, this consolidation supersedes the per-example "Suggested
resolution" entries from the reachability pass. Reachability verdicts remain
useful as bookkeeping; resolutions should point into the five structural fixes,
three symmetry contracts, and the residual primitive list above.

This also implies a revision to the milestone structure in
[the Brainstorm Generation Gap
Plan](2026-05-08-brainstorm-generation-gap-plan.md): many of its milestones
(M5/M6/M9/M10/M11/M14/M15/M18/M19/M20) are framed around enumerating per-case
content additions. Reframing them around the five structural fixes above
would shrink the plan and make milestone completion meaningful (a milestone
delivers a *mechanism*, not a list of unrelated content tweaks).
