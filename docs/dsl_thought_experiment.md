# Journey DSL — A Thought Experiment

> **Status:** Clean-room thought experiment. This document does **not** refer
> to, mirror, or constrain the existing `journey` tool implementation. The
> goal is to imagine a DSL whose surface area is just rich enough to express
> the *categories* of journey present in `brainstorm_examples.md`, without
> hardcoding any specific journey's contents.

---

## 1. What this DSL is (and isn't)

A **Journey** is a player-facing decision: zero or more selectable lines
("choices"), each of which is a small program of effects (sometimes gated by
a cost, sometimes triggered by a future event).

The interesting authoring problem is **not** "list every possible effect."
That list is finite and dull. The interesting problem is naming the *small
number of structural shapes* that the corpus of journeys actually inhabits,
so a generator can produce many distinct journeys per shape.

The brainstorm corpus contains hundreds of journeys but only ~6 recurring
shapes. The DSL has three layers:

1. A small, **opaque** effect vocabulary — atoms identified only by their
   structural role (family / target / parameter / magnitude). The DSL never
   names a specific transfiguration, card, pool, or numeric range.
2. A **slot model** for a single Choice — typed positions that an effect can
   occupy.
3. A **shape language** that says, for each slot, whether it is *fixed*
   across the choices of a journey, *varied independently*, *varied along a
   shared axis* (thematic linkage), or *varied along an indexed ladder*.

Almost every journey in the corpus is `shape × slot bindings`. The DSL's job
is to make those two things first-class and to make *everything else*
content-defined.

---

## 2. Core model

```
Journey   := Shape with N choices, each constructed by filling slots
Choice    := { prefix?, body, suffix?, trigger?, timebox? }
Effect    := { family, target?, parameter?, magnitude? }
Target    := descriptor of who/what the effect operates on
```

A `Choice` is a *typed record of slots*, not a free-form sequence. This is
deliberate: the symmetry layer needs to be able to say "fix the `body.target`
slot across all choices" without parsing an arbitrary effect graph.

A `Journey` is realized by a generator. The shape declares which slots are
fixed and which are varied; the generator samples bindings accordingly.

---

## 3. The opaque effect vocabulary

The DSL knows that effects exist and that they have structural pieces. It
deliberately does **not** know:

- which specific cards exist
- which specific modifiers (transfigurations, statuses, tags) exist
- which specific resources exist beyond an abstract `Resource`
- which numeric ranges are balanced for which effects

All of that is supplied by a content registry that the DSL queries through
opaque handles.

```
Effect ≔ family : Family
        , target?   : Target           -- what is operated on
        , parameter?: Parameter        -- the operation's modifier/operand
        , magnitude?: Number           -- numeric scaling, if any

Family    ≔ opaque handle into the content registry
Parameter ≔ opaque handle (the modifier set a Family permits)
Target    ≔ Specific(card_id)
          | Chosen(Predicate)
          | Random(Predicate)
          | All(Predicate)
          | Exactly(k, Predicate)
Predicate ≔ opaque handle | conjunction/disjunction of handles
```

A **Family** declares its own arity: how many of `target / parameter /
magnitude` it consumes, and what types each accepts. The registry might
contain families like `MODIFY_CARD(target, modifier)`, `ACQUIRE_CARD(target)`,
`REMOVE_CARD(target)`, `OFFER_DRAFT(predicate, k_of_n)`,
`ADJUST_RESOURCE(resource, delta)`, `EDIT_LOCATION(location, op, kind)` —
but the DSL itself does not enumerate them. It only relies on the slot
contract.

This is what lets the DSL not hardcode "Transfiguration": *modifier* is just
a parameter slot of some Family, and which modifiers exist is a content
question.

---

## 4. Choice slots

A Choice has the following typed positions:

| Slot      | Type       | Role                                                     |
|-----------|------------|----------------------------------------------------------|
| `prefix`  | Effect?    | Cost or side-effect that gates the body                  |
| `body`    | Effect     | The main effect                                          |
| `suffix`  | Effect?    | A consequence chained after the body                     |
| `trigger` | Trigger?   | When does this resolve? (now / on event / after N / …)   |
| `timebox` | TimeBox?   | For how long does it apply? (permanent / N battles / …)  |

Within `body`, `prefix`, `suffix`, the *Effect* itself decomposes into
slots: `family`, `target`, `parameter`, `magnitude`.

This nested structure is what the shape language addresses: a binding can
fix `body.family` while letting `body.parameter` vary, or fix `prefix` while
letting `body` vary, etc.

---

## 5. Variation modes

For each slot of a journey, the shape declares one of:

| Mode                       | Semantics                                                     |
|----------------------------|---------------------------------------------------------------|
| `fixed`                    | Sampled once; identical across all N choices                  |
| `free`                     | Sampled independently for each choice                         |
| `linked(axis)`             | Sampled per choice, but constrained to share an `axis` value  |
| `enumerated(set)`          | Each choice picks one element from a discrete set             |
| `ladder(generator)`        | Indexed: choice `i` gets the i-th value of a sequence         |

`linked(axis)` is the workhorse for thematic coherence. An *axis* is an
opaque grouping over the content registry — e.g. "cards belonging to the
same pool", "modifiers in the same family", "sites of the same kind". The
generator first samples the axis (once), then samples one element per choice
that lies on that axis. Whether the axis is "warriors" or "spirit animals"
or "midnight beasts" is the content registry's call, not the DSL's.

`enumerated(set)` is what fits "the operation has K discrete variants and
we want one choice per variant." Whether K=3 modifiers exist with this name
is a content fact; the DSL only requires that the *set* be queryable.

`ladder(generator)` covers escalating numerics. The generator is a free
parameter — the DSL does not encode arithmetic progressions or balance
curves.

---

## 6. Shape categories

Empirically, the corpus collapses into a handful of shapes. Each shape is
just a particular pattern of slot modes. The DSL exposes them by name.

### 6.1 `independent`

> N choices with no shared structure.

```
shape independent {
  arity: N
  all slots: free
}
```

Generates: any N-tuple of unrelated effects. The slot model still applies
per choice; only the inter-choice constraints are absent.

### 6.2 `shared_prefix`

> N choices that share something gating (a cost, a side-cost, a trigger),
> with otherwise independent bodies.

```
shape shared_prefix {
  arity: N
  prefix:  fixed
  body:    free
  others:  free
}
```

The fixed prefix can be any Effect. It does not have to be a "pay essence"
cost — a prepended side-effect (gain a Bane, gain a status), a precondition
(must be in a particular dreamscape kind), or even a trigger gate all bind
the same slot.

### 6.3 `shared_target`

> N choices that all operate on the same target (or same target descriptor),
> with otherwise independent operations.

```
shape shared_target {
  arity: N
  body.target: fixed
  body.family: free        -- constrained to families compatible with target
  body.parameter: free
}
```

The fixed target may be:

- a specific card (`Specific(c)` — same literal card across choices),
- a chosen card matching a predicate (`Chosen(p)` — the player picks once,
  then all choices apply to that card), or
- a target descriptor without commitment (`Chosen(p)` re-evaluated per
  choice but sharing `p`) — see also `shared_target_descriptor` below.

The compatibility constraint ("family must accept this target type") is
resolved by the content registry, so the DSL does not enumerate which
families work on which targets.

### 6.4 `shared_target_descriptor`

> N choices whose targets share a *predicate* but not necessarily a literal
> card.

```
shape shared_target_descriptor {
  arity: N
  body.target.predicate: fixed
  body.target.binding:   free    -- chosen vs random vs specific can vary
  body.family:           free
  body.parameter:        free
}
```

Distinct from `shared_target` because the *kind* of card is what is held
constant, not the card itself. The fixed predicate could be any handle:
"starter", "bane", "matches a quest tag", "of cost ≤ 2".

### 6.5 `family_carousel`

> N choices share an effect family; one slot of that family varies.

```
shape family_carousel {
  arity: N
  body.family: fixed
  body.target: fixed | linked(axis) | enumerated(set) | free
  body.parameter: fixed | linked(axis) | enumerated(set) | free
  prefix: fixed | none
}
```

This is the most populous category. The variation pointer is a *parameter*
of the shape: which slot is the "carousel axis"?

- Vary `parameter` with `target` fixed: "one card, three of-some-modifier"
- Vary `target` with `parameter` fixed: "one modifier, three vessels"
- Vary `target` with parameter absent: "buy three things at the same cost"
- Vary `target` with `target` linked to an axis: "buy three things from one
  thematic pool"

All of those are the same shape. The generator selects the carousel axis,
samples the fixed slots, then samples N values for the varied slot.

The set of modifiers / pools / cards available for variation is a content
question. Whether there are exactly K=3 modifiers in some family is also a
content question; if `enumerated` is used, the registry answers "give me
the discrete set for this family" and the generator picks an N-subset.

### 6.6 `family_carousel_with_target_axis`

A subcase worth naming because it appears often: the carousel varies
*target*, and the targets are themselves drawn from a shared linkage.

```
shape family_carousel_with_target_axis {
  arity: N
  body.family: fixed
  body.parameter: fixed | none
  body.target: linked(axis)        -- targets share a pool / tag / predicate
  prefix: fixed | none
}
```

This is the shape for "buy / draft / apply to N items that thematically
belong together." The DSL does not say what the theme is — only that the
targets must lie on the same axis.

### 6.7 `cost_ladder`

> N choices share an operation, with a numeric input that escalates across
> choices. Optionally the operation's *output* also escalates.

```
shape cost_ladder {
  arity: N
  prefix.magnitude: ladder(generator_in)
  body.family:      fixed
  body.target:      fixed | linked(axis) | enumerated(set)
  body.parameter:   fixed | linked(axis) | none
  body.magnitude:   ladder(generator_out) | fixed
}
```

The ladder generators are opaque. They might be linear, geometric, or
content-balanced — the DSL doesn't care. Two ladders within one shape
(input and output) may or may not be coupled.

### 6.8 `triggered_variant`

> N choices each define a delayed payoff; the trigger and/or the payoff
> varies.

```
shape triggered_variant {
  arity: N
  trigger: free | linked(axis) | fixed
  body:    free | family_carousel | …
  prefix:  fixed | none
}
```

This composes with the other shapes — `triggered_variant` over a
`family_carousel` is e.g. "after each different trigger, gain a different
card from one pool." The DSL's composition rule is: a shape may set the
mode of any slot the inner shape leaves free.

---

## 7. The generator

A shape is *not* a journey. A shape is a recipe for sampling a journey. The
generator's job, given a shape:

1. **Select binding domains.** For each `fixed` / `linked(axis)` slot,
   query the content registry for what's available, and pick one (axis or
   value) using whatever weights the calling system supplies.
2. **Sample concrete values.** For `free` slots, sample N times. For
   `linked(axis)` slots, sample N values constrained by the axis. For
   `enumerated(set)` and `ladder(gen)`, take the i-th value.
3. **Type-check.** Reject combinations the registry rejects (e.g.
   modifier doesn't apply to this family, predicate matches no cards).
4. **Assemble** the N choices into a `Journey`.

Because all of the content-specific knowledge lives in the registry, the
same shape spec can produce wildly different journeys on different content
registries — and within a single registry, a single shape spec produces a
combinatorially large family of distinct journeys.

---

## 8. The categorical reading of the brainstorm corpus

The point of this DSL is *not* that it can spit out the literal
`brainstorm_examples.md` lines. It's that every line in that document is an
instance of one of the shapes in §6, and the DSL only needs to know about
the shapes.

| Brainstorm pattern type                                   | Shape                                  |
|-----------------------------------------------------------|----------------------------------------|
| "N unrelated effects"                                     | `independent`                          |
| "N effects, same gating cost / side-effect"               | `shared_prefix`                        |
| "N effects on the same chosen card"                       | `shared_target` with `Chosen` binding  |
| "N effects all targeting the same kind of card"           | `shared_target_descriptor`             |
| "N variants of the same operation, fixed target"          | `family_carousel`, vary `parameter`    |
| "Same operation, applied to N thematically linked things" | `family_carousel_with_target_axis`     |
| "N options at escalating cost"                            | `cost_ladder`                          |
| "N delayed payoffs varying by trigger or reward"          | `triggered_variant`                    |

Every shape, parameterized by a content registry of modest size, generates
on the order of `(families × targets × modifiers × pools)` distinct
journeys. None of those journeys are written into the DSL.

---

## 9. What the DSL deliberately leaves out

- **Specific cards, modifiers, pools, sites, resources.** All opaque.
- **Numeric ranges and balance curves.** Provided by ladder generators or
  the registry's "give me a magnitude for this family" hook.
- **Compatibility tables** (which family takes which target type, which
  modifiers exist for which family). Owned by the registry.
- **Rendering.** Producing natural-language lines is downstream — the DSL
  produces a typed tree, rendering walks it.
- **Validity / playability.** A separate constraint-solving step rejects
  generated journeys that aren't realizable (no valid targets, costs the
  player can't pay, etc.).

If any of those concerns leaked into the DSL, it would cease to be a shape
language and become a content database with extra steps.

---

## 10. Why this shape

The first draft of this document defined the DSL one level lower: it knew
about Transfigurations, essence costs, named card pools. That made the
worked examples easy to write but defeated the purpose — the DSL became a
re-encoding of specific journeys instead of a generator of new ones.

The corpus's actual structure is:

- **Few shapes.** Six or seven of them describe almost everything.
- **Many slots.** Each shape has a small number of typed positions.
- **A lot of content.** Modifiers, pools, sites, cards, predicates — all
  expandable independently of the shape language.

A DSL aligned with that structure makes the shapes and slot modes
first-class, and pushes everything else behind an opaque registry. The same
DSL spec, with no edits, generates a different family of journeys on a
content patch that adds new modifiers or pools — which is what "high-level
symmetry, not specifics" actually demands.
