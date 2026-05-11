#!/usr/bin/env tsx
// Monte Carlo measurement of `manifest.shapeId` for the first journey of a
// fresh seed. Output is a Markdown table sorted by observed probability, with
// each shape's row tagged against its score-weight table entry so drift from
// the nominal weight is visible at a glance.
//
// Usage:
//   tsx scripts/shape-distribution.ts [--trials N] [--stage early|mid|late]
//                                     [--json] [--seed-prefix STR]
//
// Defaults: --trials 1000, --stage early.
// Standard error at p=0.05 is ≈sqrt(p(1-p)/n); at n=1000 that's ≈0.7pp, at
// n=3000 it's ≈0.4pp. Bump --trials if you need tighter bands.

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildContext, loadContentContext } from "../src/commands/shared.js";
import { generateNextJourney } from "../src/journey/generate.js";
import { createInitialJourneyState } from "../src/quest/init.js";
import { journeyShapePlugins } from "../src/journey/shapes/registry.js";
import type { JourneyStage } from "../src/journey/manifest.js";

type Args = {
  trials: number;
  stage: JourneyStage;
  json: boolean;
  seedPrefix: string;
};

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    trials: 1000,
    stage: "early",
    json: false,
    seedPrefix: "random",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return v;
    };
    switch (arg) {
      case "--trials":
      case "-n": {
        const n = parseInt(next(), 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error(`--trials must be a positive integer`);
        }
        args.trials = n;
        break;
      }
      case "--stage": {
        const s = next();
        if (s !== "early" && s !== "mid" && s !== "late") {
          throw new Error(`--stage must be one of early|mid|late`);
        }
        args.stage = s;
        break;
      }
      case "--seed-prefix":
        args.seedPrefix = next();
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  process.stdout.write(
    [
      "shape-distribution — Monte Carlo of first-journey shape selection.",
      "",
      "Usage:",
      "  tsx scripts/shape-distribution.ts [--trials N] [--stage early|mid|late]",
      "                                    [--json] [--seed-prefix STR]",
      "",
      "Options:",
      "  --trials, -n N      Number of trials (default 1000)",
      "  --stage S           Forced stage: early|mid|late (default early)",
      "  --seed-prefix STR   Seed prefix; full seed is `${prefix}:${uuid}` (default random)",
      "  --json              Emit JSON instead of a Markdown table",
      "  --help, -h          Show this message",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(here, "..");
  process.chdir(projectRoot);

  const args = parseArgs(process.argv.slice(2));
  const loaded = await loadContentContext(projectRoot);
  const tally = new Map<string, number>();
  const weights = new Map<string, number>(
    journeyShapePlugins().map((p) => [p.id, p.scoreWeight]),
  );
  const start = Date.now();

  for (let i = 0; i < args.trials; i += 1) {
    const seed = `${args.seedPrefix}:${randomUUID()}`;
    const state = createInitialJourneyState({
      seed,
      content: loaded.content,
      contentVersion: loaded.contentVersion,
    });
    const context = buildContext(
      {
        projectRoot,
        json: false,
        debug: false,
        debugContext: false,
        color: false,
        stderrColor: false,
        statePath: "/dev/null",
        debugListPayloads: false,
      } as any,
      loaded,
      state,
    );
    const manifest = generateNextJourney({
      context,
      forcedStage: args.stage,
    });
    tally.set(manifest.shapeId, (tally.get(manifest.shapeId) ?? 0) + 1);

    if (!args.json && (i + 1) % 200 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      process.stderr.write(`  ${i + 1}/${args.trials} (${elapsed}s)\n`);
    }
  }

  const total = Array.from(tally.values()).reduce((a, b) => a + b, 0);
  const sortedTotalWeight = Array.from(weights.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const rows = Array.from(tally.entries())
    .map(([id, count]) => {
      const w = weights.get(id) ?? 0;
      const target = (w / sortedTotalWeight) * 100;
      return {
        id,
        count,
        observed: (count / total) * 100,
        weight: w,
        target,
      };
    })
    .sort((a, b) => b.observed - a.observed);

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          trials: total,
          stage: args.stage,
          elapsedSeconds: Number(elapsed),
          rows,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const header = [
    `Monte Carlo: ${total} trials, stage=${args.stage}, ${elapsed}s`,
    ``,
    `| Shape | Count | Observed | Weight | Nominal share |`,
    `|---|---:|---:|---:|---:|`,
  ];
  process.stdout.write(header.join("\n") + "\n");
  for (const row of rows) {
    process.stdout.write(
      `| ${row.id} | ${row.count} | ${row.observed.toFixed(2)}% | ${row.weight} | ${row.target.toFixed(2)}% |\n`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
