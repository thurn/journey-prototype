# Dream Journey CLI Simulator Design

This document is superseded by the V2 stateless simulator contract in
[Dream Journey Sequential Overhaul](2026-05-06-dream-journey-sequential-overhaul.md).
It remains as the standing CLI design summary after that overhaul.

## Summary

The `journey` CLI is a non-interactive Dream Journey generator for design review
and debugging. The primary command is bare `journey`. It loads local TOML
content, builds one in-memory quest context, generates one Journey manifest,
prints it, and exits.

The command does not store pending choices, read `.journey/state.json`, apply
Journey effects, or advance hidden follow-up menus. `journey run` is retained
only as a compatibility alias for the same stateless generation path.

## Command Surface

```text
journey [--seed <seed>] [--stage early|mid|late] [--shape <shape_id>] [--count <count>] [--json] [--debug] [--debug-context] [--no-color]
journey run [same flags]
```

Documented commands:

- `journey`: generate one Journey.
- `journey run`: compatibility alias for `journey`.

`--count <count>` generates a deterministic stateless batch. The default count
is 1. In a batch, each item uses the same quest seed and command parameters but
increments the root Journey index, producing stable Journey IDs and independent
root generation rolls without writing simulator state.

## Determinism

Without `--seed`, each invocation chooses a fresh random seed. With the same
seed, stage, shape constraint, count, catalog version, content version, and
command parameters, output is deterministic.

When `--stage` is absent, the command chooses `early`, `mid`, or `late` for the
in-memory context. When `--shape` is supplied, the generator must still fill,
validate, and repair that shape. If the forced shape cannot be generated
legally, the command fails clearly instead of silently switching shapes.

## Manifest Contract

The manifest is the source of truth for human and JSON rendering. It describes
one generated Journey and includes the journey ID, seed, stage, shape ID,
selected tags, flat options or decision-tree data, references, precommitted
outcomes, values, repairs, and debug metadata.

Flat menus remain flat. `take_any_number` is a repeatable menu with a
body-level selection header and leave option. True sequential shapes are
represented by complete tree data:

- root node ID
- level nodes
- labeled branches
- player, random, or automatic branch kinds
- visible odds where chance is involved
- costs, effects, burdens, targets, route effects, and converted essence values
- explicit terminal outcomes or transitions to later nodes

Hidden follow-up menus are not valid V2 sequential output.

## Output

Normal human output prints only the generated Journey:

- heading
- Dreamcaller
- stage and resources
- flat options, or a complete decision tree

Normal output never instructs the user to run `journey pick`, never says a
pending Journey was stored, and never implies local simulator state changed.

`--debug` adds generation metadata such as selected shape, tags, scoring,
option values, and repairs. `--debug-context` adds the generated context:
Dreamcaller, resources, package selection, deck summary and list, active
Dreamsigns, draft pool summary, and Dreamsign pool summary.

`--json` emits structured data without ANSI color. JSON includes the generated
manifest, tree data when present, generated context, deck list, seed, stage,
shape ID, content version, catalog version, command parameters, and debug
metadata.

## Shape Catalog

The canonical true-sequential tree shapes are:

- `prize_ladder`
- `probability_ladder`
- `random_pool_draws`
- `push_your_luck`
- `escalating_reward_chain`

`push_your_luck` means repeated risk of Journey-ending failure in exchange for
mechanically connected stronger rewards. `take_any_number` remains canonical as
a repeatable menu, not a decision tree.
