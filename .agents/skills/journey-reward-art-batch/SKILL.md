---
name: journey-reward-art-batch
description: Run Journey reward art matching across all Journey images with parallel subagents, enforce reward assignment caps, avoid repetitive dream-name words, and write image/reward assignments to a TOML file.
---

# Journey Reward Art Batch

Use this skill to orchestrate `journey-reward-art-match` across the full Journey
art image set. The final output is a TOML file of image IDs, two-word dream
names, and matched reward types.

Run from the repository root.

## Output

Default output file:

```text
docs/journey-reward-art-matches.toml
```

Schema:

```toml
[[dreams]]
image_id = "2300388049"
dream_name = "Ember Aftermath"
reward_type = "Gain X essence."
```

Each per-image result file under `/tmp/journey-reward-art-batch/results/` must
contain exactly one `[[dreams]]` table, no extra fields, and an `image_id` that
matches the filename stem. Dream names use title case and exactly two words.
Reward text must be copied exactly from `docs/rewards.md` without the leading
percentage.

## Assignment Caps

Reward counts include existing assignments in
`docs/journey-reward-art-matches.toml` plus pending per-image result files under
`/tmp/journey-reward-art-batch/results/`.

Cap rules:

- Before every reward has at least 2 assignments, no reward may exceed 3
  assignments.
- After every reward has at least 2 assignments, the cap becomes 5.
- Rewards whose frequency in `docs/rewards.md` is higher than 2% have cap 7
  after the transition.

There is no active preference for unassigned or under-2 rewards beyond those
caps. Agents may pick any matching reward that is under the current cap.

The transition is evaluated against the aggregate assignment set at validation
and join time. `join` is the authoritative final gate; parallel cap races may
require post-drain correction of one or more per-image result files before the
TOML can be joined.

## Helper Script

Use the bundled state helper instead of hand-counting:

```bash
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py init
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py status
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py blocked-rewards
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py check-reward "Gain X essence."
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py check-name "Ember Aftermath"
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py validate-result /tmp/journey-reward-art-batch/results/2300388049.toml
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py join
```

Use `reset-inflight` only when starting a fresh run and no subagents from a
previous run are still active.

## Setup

Initialize the state directory:

```bash
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py init
```

If this is a fresh run:

```bash
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py reset-inflight
```

Check current reward counts and overused words:

```bash
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py status
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py word-report
```

## Parallel Launch

Use rolling parallelism. Default to 12 concurrent subagents unless the user
requests another number.

Request work:

```bash
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py next 12
```

The command prints image IDs, `WAITING`, or `DONE`.

Launch one subagent per image ID. Give each subagent the Image Agent Prompt
below with the image ID filled in. Agents are running in the same repository but
are not alone in the workspace; they must not edit shared files. Each agent owns
only its per-image result file in `/tmp/journey-reward-art-batch/results/`.

When an agent completes:

1. Validate its result file.
2. If validation passes, release the image ID from inflight.
3. If validation fails because of a cap race, duplicate image, invalid reward,
   or overused name, release the image ID and launch a correction agent for the
   same image. Tell the correction agent the failed reward/name to avoid.
4. Request one replacement ID for each passed result and launch replacements.

Commands:

```bash
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py validate-result /tmp/journey-reward-art-batch/results/<image_id>.toml
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py release <image_id>
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py next <count>
```

When `next` returns `DONE`, stop launching replacements and let active agents
drain.

## Image Agent Prompt

```text
You are matching one Journey image to one Dream Journey reward.

Image ID: {IMAGE_ID}

Read `.agents/skills/journey-reward-art-match/SKILL.md` and follow it.
Use `docs/journey-reward-art-matches.toml` and
`/tmp/journey-reward-art-batch/results/` as the assignment ledger context.
Open and inspect the actual image for this ID; do not match from filename or
JSON description alone.

You are not alone in the workspace. Do not edit shared files. You own only:
`/tmp/journey-reward-art-batch/results/{IMAGE_ID}.toml`

Before selecting a reward, inspect current batch constraints:

python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py blocked-rewards
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py status

Do not select a reward printed by `blocked-rewards`. After choosing a reward,
check it exactly:

python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py check-reward "<reward type>"

If it prints FAIL, choose another matching reward.

Before finalizing a two-word dream name, check it:

python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py check-name "<Dream Name>"

If it prints FAIL, choose another name. If it prints WARN, prefer a fresh name
unless the warned word is uniquely appropriate for the art.

Write exactly this TOML schema to your owned result file:

[[dreams]]
image_id = "{IMAGE_ID}"
dream_name = "<Two Word Name>"
reward_type = "<exact reward type copied from docs/rewards.md without percentage>"

The file must contain exactly one `[[dreams]]` table and no extra fields.

Validate your file before finishing:

python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py validate-result /tmp/journey-reward-art-batch/results/{IMAGE_ID}.toml

If validation fails, fix the file or choose a different reward/name and validate
again.

Final response: print only
{IMAGE_ID} | <Dream Name> | <reward type>
```

## Join Results

After all agents have drained:

```bash
python3 .agents/skills/journey-reward-art-batch/scripts/batch_state.py join
```

This validates all existing and pending assignments, writes
`docs/journey-reward-art-matches.toml`, clears joined per-image result files, and
clears inflight state.

If join fails, fix the cited per-image result files and rerun `join`.

## Context Control

Keep orchestration output compact:

- Do not print subagent reasoning.
- Keep one short line per completed image.
- Use the helper script for counts instead of pasting reward ledgers into chat.
- Do not accumulate assignment details in the conversation; per-image result
  files and the joined TOML are the source of truth.
