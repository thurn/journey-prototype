---
name: journey-shape-audit
description: Audit generated Dream Journey output for a specific Journey shape. Use when asked to generate early, mid, and late examples for one shape, critique grammar and construction, evaluate game-design quality and option balance, and write a reproducible report under docs/.
---

# Journey Shape Audit

Use this skill to perform a critical audit of one Dream Journey shape's generated
options across early, mid, and late stages.

## Inputs

Determine the target shape from the user request. If the shape is not explicit
and cannot be inferred from context, ask for the shape ID.

Run from the repository root.

## Generate Examples

Generate 10 journeys for each stage: `early`, `mid`, and `late`.

Prefer one deterministic seed per journey so every problematic example can be
replayed directly:

```bash
npm run journey -- --seed audit:<shape>:early:01 --stage early --shape <shape> --debug --show-deck --no-color
npm run journey -- --seed audit:<shape>:mid:01 --stage mid --shape <shape> --debug --show-deck --no-color
npm run journey -- --seed audit:<shape>:late:01 --stage late --shape <shape> --debug --show-deck --no-color
```

Use suffixes `01` through `10` for each stage. Record the full command, seed,
stage, and generated options for every issue cited in the report.

If using `--count 10` for faster sampling, include the batch index with every
example and provide a replay command that regenerates the same batch:

```bash
npm run journey -- --seed audit:<shape>:early --stage early --shape <shape> --count 10 --debug --show-deck --no-color
```

When generation fails, record the failing command, stderr, seed, stage, and
shape as an issue.

## Analysis Standard

Read the generated options as a player would. Look beyond grammar.

Check:

- Whether each option describes a coherent in-game action.
- Whether the target, reward, cost, duration, and stage make sense together.
- Whether any option is strictly better than another option in the same offer.
- Whether power level disparities are dramatic enough to make the choice fake.
- Whether an option is too weak, too neutral, too punishing, or too swingy for
  its stage.
- Whether the offer creates a meaningful strategic or tactical decision.
- Whether any generated text exposes implementation details, placeholder names,
  malformed object names, IDs, or confusing capitalization.
- Whether wording follows project vocabulary: essence, omens, dreamwell, Banes,
  Dreamsigns, cards, sites, battles, and stages.
- Whether costs read as costs and rewards read as rewards.
- Whether temporary positive effects last long enough to matter, and temporary
  negative effects are clear and proportionate.
- Whether repeated examples reveal suspicious weighting, stale pools, invalid
  targets, or low-variety output.

Use debug metadata and the shown deck/Dreamsign context to judge legality and
game value. A card, Dreamsign, or site interaction that looks plausible in text
can still be poor design if it does not matter in the shown context.

## Report

Write one Markdown report in `docs/` named:

```text
docs/YYYY-MM-DD-<shape>-journey-shape-audit.md
```

Use the current local date. Follow the documentation style in this repository:
state desired behavior directly in each finding and recommendation.

Recommended report structure:

```markdown
# `<shape>` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `<shape>`
- Stages: early, mid, late
- Seeds: `audit:<shape>:<stage>:01` through `audit:<shape>:<stage>:10`
- Command template: `npm run journey -- --seed ...`

## Findings

### <Short Issue Title>

Severity: high|medium|low

Seed: `audit:<shape>:<stage>:NN`
Stage: `early|mid|late`
Replay:
`npm run journey -- --seed audit:<shape>:<stage>:NN --stage <stage> --shape <shape> --debug --show-deck --no-color`

Generated options:

1. ...
2. ...
3. ...

Issue:
...

Recommendation:
...

## Passing Observations

...
```

Group repeated failures into one finding with multiple seed examples. Prefer
specific recommendations over vague "tune this" language.

## Verification

After writing the report, run a quick sanity check:

```bash
npm run journey -- --seed audit:<shape>:early:01 --stage early --shape <shape> --debug --show-deck --no-color
```

Confirm the command succeeds and the report's replay commands match the command
format that was actually used.
