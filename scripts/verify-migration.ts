#!/usr/bin/env tsx
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const shape = process.argv[2];

if (!shape) {
  console.error("usage: tsx scripts/verify-migration.ts <shape_id>");
  process.exit(2);
}

const cwd = process.cwd();
const shapeDir = join(cwd, "src/journey/shapes", shape);
const isolationTest = join(cwd, "test/journey-shape-isolation.test.ts");

if (!existsSync(shapeDir)) {
  console.error(`Missing ${shapeDir} — shape not migrated to its own directory.`);
  process.exit(1);
}

const originalTest = readFileSync(isolationTest, "utf8");
let patchedTest = originalTest;

if (!originalTest.includes(`"${shape}"`)) {
  patchedTest = originalTest.replace(
    /(const MIGRATED_SHAPE_IDS = \[)([^\]]+)(\])/,
    (_, head, body, tail) => {
      const trimmed = body.trimEnd();
      const sep = trimmed.endsWith(",") ? "" : ",";
      return `${head}${trimmed}${sep} "${shape}"${tail}`;
    },
  );

  if (patchedTest === originalTest) {
    console.error("Could not patch MIGRATED_SHAPE_IDS in isolation test.");
    process.exit(1);
  }

  writeFileSync(isolationTest, patchedTest);
}

const restore = () => {
  if (patchedTest !== originalTest) writeFileSync(isolationTest, originalTest);
};

let exitCode = 0;
const step = (label: string, cmd: string, args: readonly string[]) => {
  if (exitCode !== 0) return;
  process.stdout.write(`\n[verify] ${label}\n`);
  const r = spawnSync(cmd, [...args], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[verify] ${label} failed (exit ${r.status})`);
    exitCode = r.status ?? 1;
  }
};

const VITEST = "./node_modules/.bin/vitest";
const TSC = "./node_modules/.bin/tsc";

step("typecheck", TSC, ["-p", "tsconfig.json", "--noEmit"]);
step("isolation test", VITEST, ["run", "test/journey-shape-isolation.test.ts"]);

if (exitCode === 0) {
  process.stdout.write(`\n[verify] grep for "${shape}" in non-exempt files\n`);
  try {
    const matches = execSync(
      `git grep -nF '"${shape}"' -- ':!src/journey/shapes/' ':!test/' ':!src/journey/fillers/shapeFills.ts' ':!src/journey/fillers/treeBuilders.ts' ':!src/journey/fixtures/debug/'`,
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    if (matches.trim()) {
      console.error(`[verify] grep found leaks:\n${matches}`);
      exitCode = 1;
    } else {
      console.log("[verify] grep clean");
    }
  } catch (e: any) {
    if (e.status === 1) {
      console.log("[verify] grep clean");
    } else {
      console.error(`[verify] grep failed: ${e.message}`);
      exitCode = e.status ?? 1;
    }
  }
}

step("npm test", "npm", ["test", "--silent"]);

restore();
process.exit(exitCode);
