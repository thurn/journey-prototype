import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = join(REPO_ROOT, "src");

// Shapes whose IDs must not appear in any non-shape file.
// As shapes migrate, add their IDs here and the test will enforce isolation.
const MIGRATED_SHAPE_IDS = ["shop_row", "prize_ladder", "single_offer", "heterogeneous_pair", "reward_after_trigger", "take_any_number", "same_reward_different_costs", "random_rewards", "now_vs_later", "shared_prefix_menu", "commit_now_future_payoff", "escalating_reward_chain", "push_your_luck", "random_pool_draws", "same_cost_different_rewards", "single_reward", "choose_your_loss", "alter_dreamscapes", "service_menu", "reveal_choice_menu", "single_random_outcome", "single_rule_trial", "risk_or_skip", "single_wager", "curated_reward_trio", "timed_window_menu"];

// Files allowed to mention any shape ID (legacy code path during migration).
// Shrinks toward zero as the remaining shapes migrate.
const FILES_EXEMPT_FROM_ISOLATION = new Set(
  [
    // Legacy centralized fillers; deleted shape-by-shape as plugins take over.
    "src/journey/fillers/shapeFills.ts",
    "src/journey/fillers/treeBuilders.ts",
    // Debug fixtures registry keyed by shape ID; cleanup deferred per plan.
    "src/journey/fixtures/debug/metadata.ts",
    "src/journey/fixtures/debug/random.ts",
  ].map((path) => path.replace(/\//g, sep)),
);

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      // Skip the entire shapes/ subtree — shape IDs are expected there.
      if (relative(SRC_ROOT, fullPath) === "journey/shapes") {
        continue;
      }

      results.push(...listSourceFiles(fullPath));
      continue;
    }

    if (fullPath.endsWith(".ts")) {
      results.push(fullPath);
    }
  }

  return results;
}

describe("journey shape isolation", () => {
  for (const shapeId of MIGRATED_SHAPE_IDS) {
    it(`does not reference "${shapeId}" outside its directory`, () => {
      const offenders: string[] = [];
      const pattern = `"${shapeId}"`;

      for (const file of listSourceFiles(SRC_ROOT)) {
        const relativePath = relative(REPO_ROOT, file);

        if (FILES_EXEMPT_FROM_ISOLATION.has(relativePath)) {
          continue;
        }

        const contents = readFileSync(file, "utf8");

        if (contents.includes(pattern)) {
          offenders.push(relativePath);
        }
      }

      expect(offenders).toEqual([]);
    });
  }
});

describe("paired shape directories do not cross-import", () => {
  const PAIRED = [
    { a: "random_rewards", b: "random_trades" },
  ] as const;

  for (const { a, b } of PAIRED) {
    it(`shapes/${a}/ does not reference "${b}"`, () => {
      const dir = join(SRC_ROOT, "journey", "shapes", a);
      const offenders: string[] = [];
      for (const file of listSourceFilesIn(dir)) {
        if (readFileSync(file, "utf8").includes(`"${b}"`)) {
          offenders.push(relative(REPO_ROOT, file));
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`shapes/${b}/ does not reference "${a}"`, () => {
      const dir = join(SRC_ROOT, "journey", "shapes", b);
      const offenders: string[] = [];
      for (const file of listSourceFilesIn(dir)) {
        if (readFileSync(file, "utf8").includes(`"${a}"`)) {
          offenders.push(relative(REPO_ROOT, file));
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

function listSourceFilesIn(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...listSourceFilesIn(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts")) results.push(fullPath);
  }
  return results;
}
