# Project Context

## Core Commands

Run from the repository root:

```bash
npm run journey -- --seed qa --no-color
npm run journey -- run --seed qa --no-color
npm run journey -- --seed qa --json
npm run journey -- --seed qa --debug --no-color
npm run journey -- --seed qa --shape prize_ladder --no-color
npm run typecheck
npm test
npm run build
```

The package is private, ESM TypeScript, and requires Node >=20. The CLI bin is `journey`, with source entry point at `src/cli.ts` and built output at `dist/cli.js`.

## Source Map

- `src/cli.ts`: Commander setup, common flags, default no-argument behavior.
- `src/commands/`: command handlers and shared command options. The current CLI registers no-argument stateless Journey generation and `run`.
- `src/state/`: `.journey/state.json` schema, reading, validation, and atomic writes.
- `src/content/`: TOML loading, content model, validation, and content-version hash.
- `src/quest/`: deterministic simulated quest context and package tide resolution.
- `src/journey/`: shape catalog, effect/filler catalog, generation, validation, repair, value scoring, symbols, and manifest types.
- `src/render/`: human terminal output, JSON payloads, errors, theme/color handling.
- `src/util/`: deterministic RNG, hashing, stable JSON, ANSI support, exit codes.
- `data/`: authoritative cards, Dreamcallers, and Dreamsigns TOML content.
- `test/`: Vitest coverage for CLI behavior, content, generation, state IO, rendering, value/symbol logic, and command risk.

## Design Docs

Read the design docs before changing behavior:

- [`../docs/2026-05-05-dream-journey-cli-design.md`](../../docs/2026-05-05-dream-journey-cli-design.md): normative CLI design, goals, constraints, command semantics, manifest-first architecture.
- [`../docs/2026-05-05-dream-journey-cli-scenario-appendix.md`](../../docs/2026-05-05-dream-journey-cli-scenario-appendix.md): manual acceptance scenarios and transcript expectations.
- [`../docs/dream_journey_generation.md`](../../docs/dream_journey_generation.md): shape-first Journey generation model, shape catalog, validation, repair, value balancing, stage texture.
- [`../docs/dream_journey_examples.md`](../../docs/dream_journey_examples.md): reference examples for canonical Journey shapes.
- [`../docs/dream_journey_brainstorm.md`](../../docs/dream_journey_brainstorm.md): effect, cost, reward, burden, trigger, and duration idea catalog.
- [`../docs/quests.md`](../../docs/quests.md): broader quest model, Dreamcallers, package tides, draft pools, Dreamsign pools, essence, and omens.
- [`../docs/battle_rules.md`](../../docs/battle_rules.md): card, Dreamcaller, Dreamsign, Bane, deck, energy, and battle vocabulary for generated text.

## QA Checklist

Use fixed seeds and explicit flags before behavior QA. The current CLI is stateless for registered commands, so no local reset command is required unless the task explicitly changes stateful command wiring.

```bash
npm run journey -- --seed qa --no-color
npm run journey -- run --seed qa --no-color
npm run journey -- --seed qa --json
npm run journey -- --seed qa --debug --no-color
npm run journey -- --seed qa --shape prize_ladder --no-color
```

Add focused variants for the changed surface:

- `--json` for manifest payload changes.
- `--debug` and `--debug-context` for debug visibility changes.
- `--shape <shape>` for affected shape families.
- invalid flags or shapes such as `npm run journey -- --shape nope --no-color` for command errors.
- repeated fixed-seed commands for deterministic replay.
- `npm run build && npm run start -- --seed qa --no-color` when packaging or bin behavior changes.

Capture enough of the observed output to prove the requested behavior works. If a scenario cannot be reached naturally, add a deterministic debug/test surface first, then validate through that surface.
