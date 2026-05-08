# Repeating Dream Journey Duplicate Analysis

This directory contains a reproducible duplicate-analysis workflow for a batch of stateless Dream Journey examples. The workflow generates raw Journey JSON with the CLI, then derives compact choice data, machine-readable duplicate metrics, and a Markdown report with sections such as `Most repeated choice texts`.

## Generate a Batch

Run from the repository root. Use a fresh output directory for each run because the analyzer writes fixed output filenames next to the raw JSON input.

```bash
mkdir -p analysis/early-journey-duplicates/<run-name>
npm run journey -- --stage early --count 100 --seed <seed> --json \
  > analysis/early-journey-duplicates/<run-name>/journeys.json
```

Example:

```bash
mkdir -p analysis/early-journey-duplicates/early-stage-100-rerun
npm run journey -- --stage early --count 100 --seed early-duplicate-analysis-2026-05-08 --json \
  > analysis/early-journey-duplicates/early-stage-100-rerun/journeys.json
```

Useful variations:

- Change `--stage early` to `--stage mid` or `--stage late` to analyze another forced stage.
- Change `--count 100` to another batch size.
- Change `--seed` to get a different deterministic sample.
- Add `--shape <shape_id>` only when analyzing one forced shape. Forced shape runs do not exercise normal shape selection.

## Run the Analyzer

Pass the raw JSON file to the analyzer:

```bash
node analysis/early-journey-duplicates/analyze.mjs \
  analysis/early-journey-duplicates/<run-name>/journeys.json
```

The analyzer writes these files into the same directory as `journeys.json`:

- `early-stage-100-choices.json`: compact per-Journey shape, stage, seed, and visible choice text.
- `duplicate-analysis.json`: full machine-readable metrics, repeated choice list, and numeric-normalized duplicate groups.
- `duplicate-analysis.md`: human-readable report with definitions, totals, `Most repeated choice texts`, and numeric-normalized duplicate journey groups.

Despite the `early-stage-100-*` compact filename, the analyzer reads the actual count, stage, and seed from the input payload. If you are keeping multiple stages or counts in one parent directory, prefer one subdirectory per run so filenames remain unambiguous.

## Counting Definitions

The analyzer uses visible text, not internal payload identity, for duplicate counting.

- Identical journey: same `shapeId` and same ordered visible choice text.
- Visible choices: regular `manifest.options[].text`; for decision-tree Journeys, every `manifest.tree.nodes[].branches[].text`.
- Repeated choice: same visible choice text appearing more than once across the whole batch.
- Structurally unique ignoring numeric differences: same as identical journey, but numeric literals in visible choice text are replaced with `<n>` before comparison.

Because this is text-based, two options with the same text but different hidden target metadata count as repeated choices. Conversely, two options with different wording but equivalent internal payloads do not count as repeats.

## Quick Result Extraction

After running the analyzer, use `jq` for a compact metrics view:

```bash
jq '{journeyCount,totalChoices,exact,choices,structuralIgnoringNumericDifferences}' \
  analysis/early-journey-duplicates/<run-name>/duplicate-analysis.json
```

List the most repeated choices:

```bash
jq -r '.repeatedChoices[:20][] | "\(.count)x: \(.text)"' \
  analysis/early-journey-duplicates/<run-name>/duplicate-analysis.json
```

List numeric-normalized duplicate journey groups:

```bash
jq -r '.structuralDuplicateGroups[] | "\(.count)x \(.pattern.shapeId): " + (.journeys | map("#" + (.index | tostring)) | join(", "))' \
  analysis/early-journey-duplicates/<run-name>/duplicate-analysis.json
```

## Validation Checklist

Before comparing runs, confirm:

- The raw JSON has `status: "ok"`.
- `parameters.count` matches the intended batch size.
- `parameters.stage` matches the intended forced stage.
- `.journeys | length` matches `parameters.count`.
- The Markdown report was regenerated after the raw JSON was replaced.

One command for the key checks:

```bash
jq '{status, parameters, journeyCount:(.journeys | length)}' \
  analysis/early-journey-duplicates/<run-name>/journeys.json
```
