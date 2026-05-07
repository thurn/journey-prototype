---
name: jr
description: Edit, debug, validate, or review the local Dream Journey TypeScript/NPM CLI in the journeys repository. Use when Codex is changing CLI commands, Journey generation, manifest/state handling, TOML-backed content loading, terminal/JSON rendering, tests, docs, or any behavior exercised through `npm run journey`.
---

# Edit Dream Journey CLI

## Overview

Work as a project-aware maintainer for the Dream Journey CLI. Read the project map before changing code, preserve the simulator's manifest-first design, and treat manual CLI QA as mandatory evidence that the change actually works.

Start by reading [Project Context](references/project-context.md). Then open only the linked docs or source files needed for the user's request.

## Workflow

1. Identify the behavioral surface: command parsing, state transition, generator, content model, renderer, or docs/tests.
2. Read the relevant design doc before editing behavior. The design and scenario appendix are normative for CLI semantics.
3. Inspect nearby source and tests before patching. Follow existing TypeScript style and keep changes scoped.
4. Implement the change with deterministic behavior in mind. Preserve non-interactive commands, project-local `.journey/state.json`, and the separation between selecting an option and applying effects.
5. Run appropriate automated checks. At minimum, prefer `npm run typecheck` plus the relevant Vitest suite; run `npm test` when the change crosses module boundaries.
6. Manually QA the actual CLI through `npm run journey -- ...` after automated checks pass.
7. Report the exact QA commands and observed result in the final answer.

## Manual QA Requirement

Manual QA is required for every behavior change, even when automated tests pass. "This is hard to reproduce" is not a valid reason to skip QA.

Use deterministic seeds and explicit flags so QA can be repeated. The current CLI registers stateless default generation plus the `run` subcommand; do not use legacy `new`, `pick`, or `state` commands unless the task explicitly restores or wires those commands.

```bash
npm run journey -- --seed qa --no-color
npm run journey -- run --seed qa --no-color
npm run journey -- --seed qa --json
npm run journey -- --seed qa --debug --no-color
npm run journey -- --seed qa --shape prize_ladder --no-color
```

Match QA to the changed surface:

- Rendering changes: inspect normal output, `--no-color`, and JSON if affected.
- Command/state changes: verify exit status and stdout/stderr behavior; verify state persistence, malformed or missing state, and content-version mismatch only when the stateful command path is actually registered or under active change.
- Generator changes: validate at least one fixed seed, deterministic replay for the same seed, JSON manifest fields, debug explanations, and any affected shape family with `--shape`.
- Content loading changes: run a CLI command against real `data/*.toml` and verify failures are readable when content is invalid.

Automated tests are useful but are not a substitute for manual CLI QA. Do not mark the work complete until the CLI has been exercised in the terminal and the observed behavior matches the request.

## Debug Surfaces

When a state is hard to reach, create or improve a debug surface that makes it reachable, then use that surface for QA. Do not stop at "hard to reproduce."

Acceptable debug surfaces include deterministic seed controls, JSON/debug output, focused manifest/state dumps, fixtureable state constructors, narrow CLI flags, or test utilities that make the target scenario reproducible. Keep them project-appropriate: non-interactive, deterministic, scoped, and consistent with existing command patterns. Remove throwaway scaffolding before finishing unless it is intentionally part of the product or test surface.

If the user-visible path cannot be validated directly, validate the nearest user-visible behavior and the new debug surface itself. The final answer must say what was validated and why that covers the requested state.

## Project Rules

- Keep the CLI non-interactive: commands print and exit.
- Preserve deterministic replay for stable seeds and content versions.
- Do not apply selected Dream Journey effects to quest resources or objects unless the design changes explicitly require it.
- Use real TOML-backed Dreamtides content for generated object references.
- Keep normal output mechanical; internal shape IDs and scoring belong in debug output.
- Prefer structured manifest/state changes over text parsing.
- Keep terminal output and JSON rendering derived from the same manifest/state source of truth.

## References

- [Project Context](references/project-context.md): repo map, doc links, commands, and QA checklist.
