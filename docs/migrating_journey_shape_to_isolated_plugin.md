# Migrating a Journey Shape to an Isolated Plugin

Companion to `adding_journey_shape.md`. That doc covers adding a *new* shape;
this one covers moving an *existing* shape out of the centralized fillers and
validators into a self-contained plugin directory.

## Objective

> **Co-locate every line of code that exists because of this shape inside the
> shape's directory.** Nothing else.

If you deleted the shape's directory, the only thing that should break is the
registry entry that imports it. No central switch, no shared helper, no type
alias, no constant table, no validator branch — none of it survives the
deletion. That is the test of a real migration.

## "Real" vs Fake Isolation

Fake isolation is what happens when you read the migration plan as
"move shape ID strings out of central files." Once you set that as the goal,
there are dozens of cheap ways to achieve it that don't actually relocate any
code:

| Smell                                    | Real cost                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Re-export a function and call it from the shape directory | The body still lives in the central file; the shape directory is a six-line wrapper. Adding a new shape still requires editing the central file. |
| Move the shape ID lookup but leave the helper named `foo<ShapeName>Bar` in `fillers/` | The helper is shape-specific by name and by purpose; the central file still has shape-coupled code, just slightly disguised.    |
| Add the shape to a "permitted exemption" list in the isolation test | You haven't migrated the shape; you've taught the test to ignore the failure. Future you will not understand why it's exempt. |
| Replace `if (shape === "X")` with `if (definition.flagX)` and call it a day | The flag is shape-specific in everything but name. If only one shape ever sets it to `true`, you renamed the leak.              |
| Export the closure helpers from the central factory and call them from the shape directory | The closure still lives in the central file. The shape directory imports a factory that knows about every shape. Tight coupling. |

Real isolation passes a stronger test than "the isolation test is green." It
passes the **deletion test**: does removing this shape's directory leave the
codebase in a state where no other file mentions, references, or depends on
anything specific to this shape?

## Think One Level Deeper

When you start migrating a shape, the first pass usually surfaces the obvious
shape-specific code: the `case "shape_id":` branch in the central switch, and a
few helpers nearby. Stop there and you'll ship fake isolation. Push harder.

For each candidate file you migrate code *out of*, ask:

1. **Is anything left that references this shape?** Search for the shape ID,
   for shape-named types (`NamedFooThingBar`), for helper functions whose
   purpose only makes sense for this shape, for constants whose name encodes
   shape semantics. Move all of it.
2. **Are there functions used only by this shape?** A "shared" helper whose
   only caller (after this migration) is your shape is not actually shared. It
   is shape-specific code with bad naming. Move it.
3. **Are there types whose shape is named in their name?** Types like
   `NamedDreamsignShopRowSelection` are shape-coupled by definition. Move
   them; do not leave them in a generic-sounding utilities file.
4. **Does the shape file import a "factory" that needs the whole world?** If
   your shape file does `createDecisionTreeBuilders(tools)` to access two
   helpers, you've made the shape directory transitively dependent on
   every other tree-shape's logic. Refactor the factory or extract the
   primitives the shape actually needs.
5. **What does the central file import from outside?** If the central file's
   only remaining reason to exist is to expose something to your shape, the
   central file shouldn't exist. If it serves other shapes, ask whether each
   other shape still actually needs it after their migration; the next person
   to migrate will benefit from your honesty here.

The first pass is the easy 80%. The "thinking one level deeper" is the 20%
that decides whether the next person to add a shape can do so without editing
the centralized layer.

## Migration Playbook

For a single shape `X`:

### 1. Inventory the surface area

Before writing any code, map every place in the repo that mentions `X` or has
shape-specific logic for it. Use grep and follow the dependency graph:

```bash
grep -rn '"X"' src test
grep -rn '\bX[A-Z]' src   # XPlugin, XSelection, XCandidateGroup, ...
```

For each hit, decide: is this code that exists *because of X*, or is it a
generic primitive that *X happens to use*? Only the former moves.

Pay special attention to:

- The case body in `fillers/shapeFills.ts`.
- Any tree builder in `fillers/treeBuilders.ts` named `buildXTree` or similar.
- Any constant tables (`X_PROFILES`, `X_BANE_COUNTS`).
- Any helper functions whose names mention X.
- Any types whose names mention X-specific concepts.
- Any branch in `validate/values.ts`, `rootRules.ts`, `tree.ts`, `costs.ts`,
  `precommitRules.ts`.
- Any branch in `fillers/shared.ts`.
- Any debug-fixture entry that lists `["X"]`.

### 2. Plan the directory layout

```
src/journey/shapes/X/
  index.ts            # plugin definition + new metadata
  fill.ts             # the fill body (was the case in shapeFills.ts)
  validators.ts       # any shape-specific validators
  tree.ts             # if a decision-tree shape: the tree-building body
  <topic>.ts          # whatever supporting helpers the body calls
```

Tiny shapes (≈ ≤ 80 lines, no supporting files) can stay flat as `X.ts`. The
rule is "as colocated as possible," not "as many files as possible."

### 3. Move the code, do not re-export it

This is the rule the rest of the document exists to enforce.

**Wrong:**

```ts
// shapes/X/tree.ts
import { buildXTree as impl } from "../../fillers/treeBuilders.js";
export function buildXTree(...) { return impl(...); }
```

**Right:**

```ts
// shapes/X/tree.ts
// (the actual 80 lines of tree-building logic that used to live in fillers/)
import { tree, treeBranch } from "../../fillers/treeBuilders.js"; // shape-agnostic primitives
import { someXSpecificHelper } from "./helpers.js";

export function buildXTree(context, drawContext): JourneyTree {
  // ... real body, doing real work ...
}
```

The first form moves nothing. The second moves the work. Anyone reading
`shapes/X/` can see what `X` actually does without leaving the directory.

### 4. Promote shape-agnostic helpers, do not import factory closures

If your shape's body needs primitives that currently live inside a closure-
based factory in a central file, you have two options:

- **Acceptable:** the primitives are genuinely shape-agnostic. Lift them out
  of the closure into named, exported functions (or split the factory so the
  primitives are exposed without dragging the dispatch logic with them). Your
  shape imports the primitives directly.
- **Unacceptable:** the primitives are nested in a closure that also contains
  every other shape's tree builder, and you import the entire factory just to
  reach two of them. This couples your shape to every other shape via that
  factory's surface.

The fix for the unacceptable case is a refactor of the factory. Yes, it is
extra work. Skipping it is what produces the "wrapper" anti-pattern.

### 5. Promote shape-specific helpers OUT of generic-sounding files

A function named `selectFooBarRow` that lives in `fillers/fooPayloads.ts` and
is used by exactly one shape is shape-specific code wearing a hat that says
"I'm generic." After your shape's body moves, audit:

```bash
grep -rn '<helperName>' src
```

If the only callers are inside your shape's directory: the helper is
shape-specific. Move it to your shape's directory. If after moving the
generic-sounding file shrinks to nothing, delete it.

If you find some other shape still uses the helper, leave it where it is —
that's genuine sharing, even if the name is bad. (Renaming for clarity is a
follow-up.)

### 6. Migrate plugin metadata, not branches

Shape-specific `if (shape === "X")` branches in central validators are not
"hardcoded set membership" to be replaced by `if (shape in someSet)`. They
are shape-specific *behavior*. The plugin contract should grow a callback
slot (`treeValidator`, `optionValueValidator`, `precommitValidator`) and the
behavior moves into the plugin file. The central file dispatches; it does not
implement.

If the only behavior is a boolean ("this shape is exempt from rule R"),
*then* a flag on the definition is appropriate. Otherwise, use a callback.

### 7. Verify with the deletion test

Run the isolation test. Then run a stronger check by hand:

```bash
grep -rn '\bX\b\|"X"\|XPlugin\|<other shape-named identifiers>' \
  src test \
  | grep -v 'src/journey/shapes/X/'
```

If anything comes back, that's a leak. Either move it or document — in the
shape's own directory — *why* the leak is acceptable. "It's in a debug fixture
registry that's a known follow-up" is acceptable; "the test exempts it" is
not.

### 8. Run the full suite

```bash
npm run typecheck
npm test
```

Behavior must not regress. If the canonical shape definitions JSON changed
unexpectedly, your migration introduced a behavior shift; investigate before
landing.

## The Plugin Contract Is Not Sacred

The plugin contract (`JourneyShapePlugin`, `JourneyShapeDefinition`,
`defineShapePlugin`) exists to support real isolation. When a migration
reveals that the contract is too narrow to absorb shape-specific behavior
without hacks, **the right move is to widen the contract**, not to leave the
behavior in a central file.

Treat the plugin contract as a moving target that grows alongside the
migration. Every time you find a `if (shape === "X")` branch in a central
file that doesn't fit any existing plugin slot, that's a signal the contract
needs a new slot. Add it.

Concrete patterns that warrant new contract surface:

- **A shape-specific check that runs at a particular pipeline phase.** If
  central validation has `if (shape === "X") validateX(manifest)`, the
  contract probably needs a callback for that phase
  (e.g., `treeValidator`, `precommitValidator`, `optionValueValidator`). The
  central file becomes a dispatcher: `getShapePlugin(id).treeValidator?.(...)`.
- **A boolean exemption.** If multiple shapes share an exemption from a
  central rule, add a flag to the definition (e.g.,
  `compoundCoherence: "default" | "skip"`). One-shape exemptions are also
  fine as flags — what matters is that the central rule reads metadata
  instead of pattern-matching IDs.
- **A typed metadata bundle.** Shape-ID sets in central files
  (`POSITIVE_MENU_COMPARABLE_SHAPES`, `ESCALATION_OR_RISK_SHAPES`) are
  reverse-coupled metadata: the shape's classification lives away from the
  shape. Replace each set with a field on the definition that the shape
  declares for itself.
- **A new optional field on the plugin.** If only one shape needs the slot
  today, that's still fine. Optional callbacks are cheap; centralized
  branches are not.

When in doubt, lean toward *more* surface. A plugin contract with eight
optional callbacks where most shapes use two is not bloated — it's flexible.
A plugin contract with three callbacks plus a giant central switch is
bloated and tightly coupled, even if the surface area looks smaller.

The same principle applies to refactoring helper modules. If migrating a
shape requires lifting closure-bound helpers into a free-standing form (so
the shape can call them without dragging in every other shape), do the
refactor. The cost of "this central file got smaller and lost a closure"
is much lower than the cost of "every shape directory now imports a factory
that knows about every other shape."

Always update the contract types in `shapes/types.ts` and the
`defineShapePlugin` defaults in `shapes/shared.ts` together. If you add a
plugin callback, propagate it through `defineShapePlugin` so it actually
attaches to the plugin instance — a contract field that the factory drops on
the floor is a silent failure that tests *will* catch but only after a
mysterious behavior regression. (Speak from experience.)

## Red Flags in Code Review

Reject migrations that exhibit any of these:

- A shape directory whose `tree.ts` / `fill.ts` is < ~20 lines and is mostly
  imports + a forwarding call.
- A new export in a central file whose only consumer is the shape's directory.
- New entries in an isolation test exemption list.
- A type named `<ShapeName>Selection` or similar living in `fillers/` after
  the migration.
- A factory function in a central file whose return type grows a new field
  named after the shape (e.g., `buildXTree`).
- Any commit message of the form "expose X for prize_ladder migration" — if
  you needed to expose it, the body probably should have moved with it.

## When Isolation Should *Not* Be Forced

Some helpers are genuinely shape-agnostic primitives even though their names
suggest otherwise. `tree(nodes)` and `treeBranch(args)` build decision-tree
data structures regardless of which shape produced them. `cost(kind, amount)`
constructs cost payloads. These belong in shared modules; importing them from
a shape directory does not break isolation. The test is whether the function's
*body* would change if a new tree-shape were added. If yes, it's shared. If
no, it's shape-specific dressed up.

When in doubt, ask: "After this migration, if a new shape were added, would
that shape's author need to read or modify this helper?" If only its
signature is relevant — share. If they would need to understand its internals
or extend its switch statement — it's shape-specific and must move.

## Cleanup Once Every Shape Has Migrated

When the legacy `shapeFills.ts` and `treeBuilders.ts` switches have no
surviving cases, delete those files entirely and update the isolation test to
remove the exemption list. The test should then enforce, with no escape
hatches, that no shape ID appears outside its directory.

If you leave any exemption in place at that point, you have not finished the
migration; you have just renamed where the legacy lives.
