# Repeating Dream Journey Duplicate Analysis

This directory contains a reproducible duplicate-analysis workflow for a batch of stateless Dream Journey examples. The workflow generates raw Journey JSON with the CLI, then derives compact choice data, machine-readable duplicate metrics, and a Markdown report with sections such as `Most repeated choice texts`.

Keep this top-level `repeat-analysis.md` file as workflow instructions. Write requested analysis reports into a run-specific subdirectory, such as `analysis/early-journey-duplicates/mid-stage-100/repeat-analysis.md`.

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

## Write Requested Reports

When a user asks for a concrete report, write the final human-facing report to `analysis/early-journey-duplicates/<run-name>/repeat-analysis.md`, not to this top-level instruction file. Use a run name that captures the sample, such as `mid-stage-100`.

For generated analyzer output, keep `duplicate-analysis.md` in the same run directory as supporting material. If the requested deliverable is named `repeat-analysis.md`, copy or adapt the relevant generated report into the run directory's `repeat-analysis.md`.

## Desired Report Structure

The generated Markdown report should be short, skimmable, and stable enough to compare across runs. Use this structure when regenerating `duplicate-analysis.md` or writing a companion report by hand.

1. Title

   Use a direct H1 that names the stage or sample being analyzed, such as `# Early Stage Dream Journey Duplicate Analysis`.

2. Generation command

   Include the exact `npm run journey -- ... --json` command, including `--stage`, `--count`, and `--seed`. This lets another maintainer regenerate the raw sample before interpreting the counts.

3. Definitions

   Define the comparison rules before showing results:

   - Identical journey: same shape and same ordered visible choice text.
   - Visible choices: normal option text plus decision-tree branch text.
   - Repeated choice: same visible choice text appearing more than once in the batch.
   - Structurally unique ignoring numeric differences: same journey comparison after replacing numeric literals with `<n>`.

4. Results

   Present the headline metrics as one flat bullet list:

   - Journey count.
   - Visible choice count.
   - Identical journey duplicate groups.
   - Identical journey duplicate instances beyond first occurrence.
   - Unique exact journeys.
   - Distinct repeated choice texts.
   - Repeated choice occurrences.
   - Repeated choice instances beyond first occurrence.
   - Unique choice texts.
   - Structurally unique journeys ignoring numeric differences.
   - Numeric-normalized duplicate journey groups.
   - Numeric-normalized duplicate instances beyond first occurrence.

5. Most repeated choice texts

   Include a heading named exactly `Most repeated choice texts:` and list the highest-frequency repeated choice strings in descending count order. Use the format `<count>x: <choice text>`.

6. Numeric-normalized duplicate journey groups

   Include a heading named exactly `Numeric-normalized duplicate journey groups:`. For each group, list the duplicate count, shape ID, journey indexes, and normalized pattern. If there are no groups, write `- None`.

7. Optional notes

   Add this section only when needed. Use it for known interpretation caveats, such as text-level duplicates hiding different target metadata, forced-shape sampling, or a run with validation repairs.

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
