# Dream art in the journey terminal output

**Date:** 2026-05-14

The `journey` CLI prints a circular "dream" preview image and a two-word dream
name beneath each non-Leave Journey option and each reward-bearing decision-tree
branch. Each piece of art is matched to its option by the option's reward
template id, looked up against the assignment ledger in
`docs/journey-reward-art-matches.toml`.

## Rendering

Inline images use the iTerm2 OSC 1337 protocol (also honoured by WezTerm). Each
image is resized and circle-masked with `sharp`, then emitted at a height of
~10 terminal cells. Images stack as separate rows because reliable side-by-side
placement isn't supported by the protocol (see
`docs/displaying_images_in_terminal.md`).

Under tmux or in any terminal that isn't iTerm2 / WezTerm, the block falls back
to printing the dream names only — no escape bytes are emitted.

`--json` output is unchanged except that each option's JSON now includes
`rewardTemplateIds`, exposing the same template-id list the renderer uses for
matching.

## Matching

Each Journey reward maps to one of the 64 entries in the shared reward catalog
(`src/journey/shared/rewards.ts`). The catalog's `Reward.id` is surfaced on
every option / tree branch as `rewardTemplateIds: readonly string[]`.
`src/journey/rewardArtTypes.ts` then maps each id to the exact reward type
string from `docs/rewards.md`, which keys the ledger.

When an option offers multiple reward types, one is picked at random (seeded
from the manifest seed). When multiple ledger dreams match the chosen reward
type, one is picked at random. The renderer prefers unused dreams within a
single Journey to keep each option's art distinct. When the ledger pool for a
chosen reward type is fully consumed by earlier options in the same Journey,
the renderer falls back to the full pool (allowing a repeat) so every option
still gets an image; each such fallback is recorded as a
`Dream art: ledger pool exhausted (debug)` line, surfaced on stderr in red
only when `--debug` is set, so the ledger can be expanded to cover the
contention.

Costs do not affect art matching. Any non-Leave option or non-Leave branch
without reward template ids, with ids unknown to the catalog, or whose chosen
reward type has zero ledger entries, is reported on stderr as a
`Dream art: cases to investigate` list, naming the journey and option/branch
for review.

## Relevant files

- `src/render/dreamArt.ts` — ledger loading, image resolution, seeded
  selection, terminal detection, sharp circle crop, iTerm2 escape rendering,
  and the `renderDreamArt(manifest, projectRoot)` entry point.
- `src/journey/rewardArtTypes.ts` — frozen `templateId → reward_type` lookup
  for all 64 catalog rewards.
- `src/journey/manifest.ts` — `rewardTemplateIds?: readonly string[]` on
  `JourneyOption`, `JourneyTreeBranch`, and `JourneyTreeTerminal`.
- `src/render/json.ts` — surfaces `rewardTemplateIds` in the option JSON.
- `src/commands/journey.ts`, `src/commands/pick.ts` — append the dream-art
  block to the human-readable output and route review flags to stderr.
- `src/journey/shapes/*/{fill,tree}.ts` — every shape populates
  `rewardTemplateIds` (canonical catalog id for `one_operation_many_targets`,
  `[]` for shapes whose options grant no reward).
- `test/dream-art.test.ts` — drift guard for the lookup table, ledger
  coverage check, `selectDreamArt` behaviour (uniqueness, Leave exclusion,
  determinism, multi-reward picking, review flags), terminal detection,
  `circlePng` / `inlineImageEscape` sanity, and a shape-coverage sweep
  asserting every non-Leave option/branch defines `rewardTemplateIds`.
- `docs/displaying_images_in_terminal.md` — protocol notes the renderer
  follows.
- `docs/journey-reward-art-matches.toml` — the assignment ledger that maps
  `image_id` to `dream_name` and `reward_type`.
- `docs/rewards.md` — the canonical reward-type strings the ledger and lookup
  table reference verbatim.
