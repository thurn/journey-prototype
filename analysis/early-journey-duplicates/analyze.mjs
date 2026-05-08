import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2] ?? 'analysis/early-journey-duplicates/early-stage-100.json';
const outputDir = path.dirname(inputPath);

const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const journeys = payload.journeys ?? [];

function normalizeNumbers(text) {
  return text.replace(/\b\d+(?:\.\d+)?\b/g, '<n>');
}

function visibleChoices(journey) {
  const manifest = journey.manifest;
  if (manifest.options?.length > 0) {
    return manifest.options.map((option) => ({
      source: 'option',
      text: option.text,
    }));
  }

  if (manifest.tree?.nodes?.length > 0) {
    return manifest.tree.nodes.flatMap((node) =>
      node.branches.map((branch) => ({
        level: node.levelLabel,
        source: 'tree_branch',
        text: branch.text,
      })),
    );
  }

  return [];
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function duplicateGroups(counts) {
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([aText, aCount], [bText, bCount]) => bCount - aCount || aText.localeCompare(bText));
}

const compactJourneys = journeys.map((journey) => ({
  index: journey.index,
  seed: journey.seed,
  shapeId: journey.shapeId,
  stage: journey.stage,
  choices: visibleChoices(journey).map((choice) => choice.text),
}));

const exactJourneyKeys = countBy(
  compactJourneys.map((journey) =>
    JSON.stringify({
      choices: journey.choices,
      shapeId: journey.shapeId,
    }),
  ),
);

const structuralJourneyKeys = countBy(
  compactJourneys.map((journey) =>
    JSON.stringify({
      choices: journey.choices.map(normalizeNumbers),
      shapeId: journey.shapeId,
    }),
  ),
);

const choiceTexts = compactJourneys.flatMap((journey) => journey.choices);
const choiceCounts = countBy(choiceTexts);
const repeatedChoices = duplicateGroups(choiceCounts).map(([text, count]) => ({ count, text }));
const structuralDuplicateGroups = duplicateGroups(structuralJourneyKeys).map(([key, count]) => {
  const pattern = JSON.parse(key);
  const matchingJourneys = compactJourneys
    .filter(
      (journey) =>
        JSON.stringify({
          choices: journey.choices.map(normalizeNumbers),
          shapeId: journey.shapeId,
        }) === key,
    )
    .map((journey) => ({
      choices: journey.choices,
      index: journey.index,
      shapeId: journey.shapeId,
    }));

  return {
    count,
    journeys: matchingJourneys,
    pattern,
  };
});

const repeatedChoiceOccurrences = repeatedChoices.reduce((sum, choice) => sum + choice.count, 0);

const report = {
  input: inputPath,
  parameters: payload.parameters,
  journeyCount: journeys.length,
  totalChoices: choiceTexts.length,
  exact: {
    duplicateJourneyGroups: duplicateGroups(exactJourneyKeys).length,
    duplicateJourneyInstancesBeyondFirst: journeys.length - exactJourneyKeys.size,
    uniqueJourneys: exactJourneyKeys.size,
  },
  choices: {
    repeatedChoiceGroups: repeatedChoices.length,
    repeatedChoiceOccurrences,
    repeatedChoiceInstancesBeyondFirst: choiceTexts.length - choiceCounts.size,
    totalChoices: choiceTexts.length,
    uniqueChoiceTexts: choiceCounts.size,
  },
  structuralIgnoringNumericDifferences: {
    duplicateJourneyGroups: structuralDuplicateGroups.length,
    duplicateJourneyInstancesBeyondFirst: journeys.length - structuralJourneyKeys.size,
    uniqueJourneys: structuralJourneyKeys.size,
  },
  repeatedChoices,
  structuralDuplicateGroups,
};

fs.writeFileSync(
  path.join(outputDir, 'early-stage-100-choices.json'),
  `${JSON.stringify(compactJourneys, null, 2)}\n`,
);
fs.writeFileSync(path.join(outputDir, 'duplicate-analysis.json'), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  '# Early Stage Dream Journey Duplicate Analysis',
  '',
  `Generated with \`npm run journey -- --stage early --count 100 --seed ${payload.parameters?.seed} --json\`.`,
  '',
  'Definitions:',
  '',
  '- Identical journey: same shape and same ordered visible choice text. Tree branches are counted as choices for tree-shaped Journeys.',
  '- Repeated choice: same visible choice text appearing more than once across all 100 Journeys.',
  '- Structurally unique ignoring numeric differences: same as identical journey, but numeric literals in visible choice text are replaced with `<n>` before comparing.',
  '',
  'Results:',
  '',
  `- Journeys: ${report.journeyCount}`,
  `- Visible choices counted: ${report.totalChoices}`,
  `- Identical journey duplicate groups: ${report.exact.duplicateJourneyGroups}`,
  `- Identical journey duplicate instances beyond first occurrence: ${report.exact.duplicateJourneyInstancesBeyondFirst}`,
  `- Unique exact journeys: ${report.exact.uniqueJourneys}`,
  `- Distinct repeated choice texts: ${report.choices.repeatedChoiceGroups}`,
  `- Repeated choice occurrences: ${report.choices.repeatedChoiceOccurrences}`,
  `- Repeated choice instances beyond first occurrence: ${report.choices.repeatedChoiceInstancesBeyondFirst}`,
  `- Unique choice texts: ${report.choices.uniqueChoiceTexts}`,
  `- Structurally unique journeys ignoring numeric differences: ${report.structuralIgnoringNumericDifferences.uniqueJourneys}`,
  `- Numeric-normalized duplicate journey groups: ${report.structuralIgnoringNumericDifferences.duplicateJourneyGroups}`,
  `- Numeric-normalized duplicate instances beyond first occurrence: ${report.structuralIgnoringNumericDifferences.duplicateJourneyInstancesBeyondFirst}`,
  '',
  'Most repeated choice texts:',
  '',
  ...report.repeatedChoices
    .slice(0, 15)
    .map((choice) => `- ${choice.count}x: ${choice.text}`),
  '',
  'Numeric-normalized duplicate journey groups:',
  '',
  ...report.structuralDuplicateGroups.flatMap((group) => [
    `- ${group.count}x ${group.pattern.shapeId}: ${group.journeys
      .map((journey) => `#${journey.index}`)
      .join(', ')}`,
    `  Pattern: ${group.pattern.choices.join(' | ')}`,
  ]),
  '',
];

fs.writeFileSync(path.join(outputDir, 'duplicate-analysis.md'), `${markdown.join('\n')}\n`);

console.log(JSON.stringify(report, null, 2));
