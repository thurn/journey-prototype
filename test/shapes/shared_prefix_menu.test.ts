import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";

const sharedPrefixMenuPlugin = getShapePlugin("shared_prefix_menu");
const auditStages: readonly JourneyStage[] = ["early", "mid", "late"];
const auditSeedNumbers = Array.from({ length: 10 }, (_entry, index) =>
  String(index + 1).padStart(2, "0"),
);

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedSharedPrefixMenuManifest(
  seed: string,
  stage: JourneyStage,
) {
  const { content, contentVersion } = await contentContext();
  const state = createInitialJourneyState({ seed, content, contentVersion });
  simulateQuestStateForStage({
    state,
    stage,
    drawContext: { seed, contentVersion, rootJourneyIndex: 0 },
  });
  const context = buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });

  return generateNextJourney({
    context,
    forcedShapeId: "shared_prefix_menu",
    forcedStage: stage,
  });
}

function hasBaneBurden(option: { burdens: readonly unknown[] }): boolean {
  return option.burdens.some((burden) =>
    typeof burden === "object" &&
    burden !== null &&
    "kind" in burden &&
    burden.kind === "bane_gain"
  );
}

describe("shared_prefix_menu fill", () => {
  it("uses a shape-local shared-prefix direct-menu contract", () => {
    expect(sharedPrefixMenuPlugin.definition).toMatchObject({
      topology: "direct_menu",
      rootOptionCount: { min: 3, max: 3 },
      supportedTags: ["burden", "cleanup", "card", "reward", "prefix", "menu"],
      validationRules: expect.arrayContaining([
        "all_rows_share_visible_prefix",
        "prefix_resolves_before_varied_payoff",
        "each_option_contains_distinct_payoff_family",
      ]),
    });
    expect(sharedPrefixMenuPlugin.fill).toEqual(expect.any(Function));
  });

  it("generates valid shared-prefix menus for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:shared_prefix_menu:${stage}:${seedNumber}`;
        const manifest = await forcedSharedPrefixMenuManifest(seed, stage);
        const options = manifest.options.filter((option) =>
          option.pickBehavior !== "leave"
        );

        expect(manifest.shapeId, seed).toBe("shared_prefix_menu");
        expect(options, seed).toHaveLength(3);

        const prefixSentences = options.map((option) =>
          option.text.split(".")[0],
        );
        expect(new Set(prefixSentences).size, seed).toBe(1);

        for (const option of options) {
          expect(option.text, seed).not.toMatch(/\s,|,\s*,/u);
          expect(option.text, seed).not.toMatch(/\bundefined\b/i);
          if (hasBaneBurden(option)) {
            expect(option.text, seed).toMatch(/^Gain \d+ .+ Bane\./u);
          }
        }
      }
    }
  });

  it("adds a late-stage bonus to Bane-prefix menus", async () => {
    const manifest = await forcedSharedPrefixMenuManifest(
      "audit:shared_prefix_menu:late:01",
      "late",
    );
    const options = manifest.options.filter((option) =>
      option.pickBehavior !== "leave"
    );

    expect(options.every(hasBaneBurden)).toBe(true);
    for (const option of options) {
      if (option.routeEffects.length === 0) {
        expect(option.text).toContain("Gain 2 omens.");
        expect(option.effectConvertedEssence).toBeGreaterThan(320);
      }
    }
  });
});
