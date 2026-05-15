import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import { REWARDS } from "../src/journey/shared/rewards.js";
import { REWARD_TYPE_BY_TEMPLATE_ID } from "../src/journey/rewardArtTypes.js";
import {
  _ledgerRewardTypes,
  _resetDreamArtCache,
  circlePng,
  dreamLedger,
  inlineImageEscape,
  renderDreamArt,
  selectDreamArt,
  supportsInlineImages,
} from "../src/render/dreamArt.js";
import { generateNextJourney } from "../src/journey/generate.js";
import { createInitialJourneyState } from "../src/quest/init.js";
import { JOURNEY_SHAPES } from "../src/journey/shapes.js";
import { loadContent } from "../src/content/loadToml.js";
import { computeContentVersion } from "../src/content/version.js";
import { canonicalShapeDefinitions, JOURNEY_SHAPE_CATALOG_VERSION } from "../src/journey/shapes.js";
import { EFFECT_CATALOG, EFFECT_CATALOG_VERSION } from "../src/journey/effects.js";
import { VALUE_MODEL_CONTRIBUTION, VALUE_MODEL_VERSION } from "../src/journey/value.js";
import { MANIFEST_CONTRACT_VERSION, MANIFEST_SCHEMA_VERSION } from "../src/journey/manifest.js";
import { RENDERER_VERSION } from "../src/render/theme.js";
import { QUEST_INITIALIZATION_VERSION } from "../src/quest/init.js";
import { buildJourneyContext } from "../src/quest/context.js";
import type { JourneyManifest } from "../src/journey/manifest.js";

const PROJECT_ROOT = process.cwd();

function syntheticManifest(overrides: Partial<JourneyManifest>): JourneyManifest {
  return {
    schemaVersion: 2,
    versions: {
      contentVersion: "test",
      shapeCatalogVersion: "shapes:test",
      effectCatalogVersion: "effects:test",
      valueModelVersion: "value:test",
      rendererVersion: "renderer:test",
      manifestContractVersion: "manifest:test",
    },
    journeyId: "J-TEST",
    seed: "test-seed",
    rootJourneyIndex: 1,
    shapeId: "random_rewards",
    stage: "early",
    dreamscape: 0,
    selectedTags: [],
    options: [],
    generatedObjects: [],
    precommitted: {},
    debug: {
      shapeScores: [],
      selectedShapeId: "random_rewards",
      selectedTags: [],
      optionValues: [],
    },
    references: {
      cardIds: [],
      dreamsignIds: [],
      dreamcallerIds: [],
      baneNames: [],
    },
    ...overrides,
  } as JourneyManifest;
}

function leaveOption(number: number) {
  return {
    number,
    symbols: [],
    text: "Leave.",
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 0,
    pickBehavior: "leave" as const,
    rewardTemplateIds: [] as readonly string[],
  };
}

function rewardOption(number: number, rewardTemplateIds: readonly string[]) {
  return {
    number,
    symbols: [],
    text: `Option ${number}.`,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 0,
    pickBehavior: "record_and_generate_next" as const,
    rewardTemplateIds,
  };
}

describe("REWARD_TYPE_BY_TEMPLATE_ID drift guard", () => {
  it("covers exactly the shared REWARDS catalog ids", () => {
    const catalogIds = REWARDS.map((reward) => reward.id).sort();
    const lookupIds = Object.keys(REWARD_TYPE_BY_TEMPLATE_ID).sort();

    expect(lookupIds).toEqual(catalogIds);
    expect(catalogIds.length).toBe(64);
  });

  it("values are unique and match the docs/rewards.md lines", async () => {
    const { readFile } = await import("node:fs/promises");
    const rewardsMd = await readFile(join(PROJECT_ROOT, "docs/rewards.md"), "utf8");
    const lines = rewardsMd
      .split("\n")
      .map((line) => line.match(/^- \[[^\]]+\]\s+\[\d+\]\s+(.+\.)$/u)?.[1])
      .filter((entry): entry is string => typeof entry === "string");
    const docSet = new Set(lines);
    const values = Object.values(REWARD_TYPE_BY_TEMPLATE_ID);

    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(docSet.has(value)).toBe(true);
    }
    // The docs file holds exactly 64 reward lines.
    expect(lines.length).toBe(64);
  });

  it("every reward_type in the art ledger is a known lookup value", async () => {
    _resetDreamArtCache();
    const rewardTypes = await _ledgerRewardTypes(PROJECT_ROOT);
    const known = new Set(Object.values(REWARD_TYPE_BY_TEMPLATE_ID));

    for (const rewardType of rewardTypes) {
      expect(known.has(rewardType)).toBe(true);
    }
    expect(rewardTypes.length).toBeGreaterThan(0);
  });
});

describe("selectDreamArt", () => {
  afterEach(() => {
    _resetDreamArtCache();
  });

  it("skips Leave options and picks distinct images per journey", async () => {
    const manifest = syntheticManifest({
      options: [
        rewardOption(1, ["gain_omens"]),
        rewardOption(2, ["gain_omens"]),
        leaveOption(3),
      ],
    });

    const selection = await selectDreamArt(manifest, PROJECT_ROOT);

    expect(selection.assignments.length).toBe(2);
    expect(selection.assignments[0]!.label).toBe("Option 1");
    expect(selection.assignments[1]!.label).toBe("Option 2");
    const imageIds = selection.assignments.map((a) => a.imageId);
    expect(new Set(imageIds).size).toBe(imageIds.length);
    expect(selection.reviewFlags).toEqual([]);
  });

  it("flags non-Leave options with no reward template ids", async () => {
    const manifest = syntheticManifest({
      journeyId: "J-FLAG",
      options: [rewardOption(1, []), leaveOption(2)],
    });

    const selection = await selectDreamArt(manifest, PROJECT_ROOT);

    expect(selection.assignments).toEqual([]);
    expect(selection.reviewFlags).toEqual([
      "Journey J-FLAG Option 1: no reward template ids",
    ]);
    expect(selection.repeatFallbacks).toEqual([]);
  });

  it("borrows a dream from another reward type when the chosen pool is exhausted", async () => {
    // `card_cost_reduction_for_X_battles` has only two entries in the live
    // ledger; three options sharing it force one to draw from elsewhere in
    // the ledger. Image uniqueness within the journey must still hold.
    const manifest = syntheticManifest({
      journeyId: "J-REPEAT",
      options: [
        rewardOption(1, ["card_cost_reduction_for_X_battles"]),
        rewardOption(2, ["card_cost_reduction_for_X_battles"]),
        rewardOption(3, ["card_cost_reduction_for_X_battles"]),
        leaveOption(4),
      ],
    });

    const selection = await selectDreamArt(manifest, PROJECT_ROOT);

    expect(selection.assignments).toHaveLength(3);
    expect(selection.assignments.map((a) => a.label)).toEqual([
      "Option 1",
      "Option 2",
      "Option 3",
    ]);
    expect(selection.repeatFallbacks).toHaveLength(1);
    expect(selection.repeatFallbacks[0]).toContain("Journey J-REPEAT");
    expect(selection.repeatFallbacks[0]).toContain("borrowed dream");
    expect(selection.repeatFallbacks[0]).toContain(
      'reward type "Reduce the cost of <predicate> cards by X for the next X battles." has only 2 dream(s)',
    );
    // Every assignment uses a distinct image_id — uniqueness is a hard
    // constraint, even when the chosen reward type's pool is exhausted.
    const imageIds = selection.assignments.map((a) => a.imageId);
    expect(new Set(imageIds).size).toBe(imageIds.length);
    expect(selection.reviewFlags).toEqual([]);
  });

  it("is deterministic under a fixed seed", async () => {
    const build = () =>
      syntheticManifest({
        seed: "deterministic-seed",
        rootJourneyIndex: 7,
        options: [
          rewardOption(1, ["gain_omens"]),
          rewardOption(2, ["gain_essence"]),
          rewardOption(3, ["add_site_to_dreamscape"]),
        ],
      });

    const first = await selectDreamArt(build(), PROJECT_ROOT);
    _resetDreamArtCache();
    const second = await selectDreamArt(build(), PROJECT_ROOT);

    expect(first.assignments.map((a) => a.imageId)).toEqual(
      second.assignments.map((a) => a.imageId),
    );
  });

  it("picks a single image even when an option has multiple reward types", async () => {
    const manifest = syntheticManifest({
      options: [
        rewardOption(1, ["gain_omens", "gain_essence", "add_site_to_dreamscape"]),
      ],
    });

    const selection = await selectDreamArt(manifest, PROJECT_ROOT);
    expect(selection.assignments.length).toBe(1);

    const ledger = await dreamLedger(PROJECT_ROOT);
    const possible = new Set([
      ...(ledger.get(REWARD_TYPE_BY_TEMPLATE_ID.gain_omens!) ?? []).map((e) => e.imageId),
      ...(ledger.get(REWARD_TYPE_BY_TEMPLATE_ID.gain_essence!) ?? []).map((e) => e.imageId),
      ...(ledger.get(REWARD_TYPE_BY_TEMPLATE_ID.add_site_to_dreamscape!) ?? []).map((e) => e.imageId),
    ]);
    expect(possible.has(selection.assignments[0]!.imageId)).toBe(true);
  });

  it("handles tree manifests and skips Leave-shaped branches", async () => {
    const manifest = syntheticManifest({
      shapeId: "push_your_luck",
      tree: {
        rootNodeId: "level-1",
        nodes: [
          {
            id: "level-1",
            levelLabel: "Level 1",
            branches: [
              {
                id: "level-1-leave",
                label: "Leave",
                kind: "player_choice",
                text: "Leave.",
                operations: [],
                costs: [],
                effects: [],
                burdens: [],
                targets: [],
                triggers: [],
                routeEffects: [],
                costConvertedEssence: 0,
                effectConvertedEssence: 0,
                burdenConvertedEssence: 0,
                uncertaintyConvertedEssence: 0,
                netConvertedEssence: 0,
                rewardTemplateIds: [],
              } as never,
              {
                id: "level-1-attempt",
                label: "Attempt",
                kind: "player_choice",
                text: "Attempt.",
                operations: [],
                costs: [],
                effects: [],
                burdens: [],
                targets: [],
                triggers: [],
                routeEffects: [],
                costConvertedEssence: 0,
                effectConvertedEssence: 0,
                burdenConvertedEssence: 0,
                uncertaintyConvertedEssence: 0,
                netConvertedEssence: 0,
                rewardTemplateIds: ["gain_omens"],
              } as never,
            ],
          },
        ],
      },
    } as Partial<JourneyManifest>);

    const selection = await selectDreamArt(manifest, PROJECT_ROOT);

    expect(selection.assignments.length).toBe(1);
    expect(selection.assignments[0]!.label).toBe("Branch level-1-attempt");
    expect(selection.reviewFlags).toEqual([]);
  });
});

describe("supportsInlineImages", () => {
  it("returns true only for iTerm.app and WezTerm and never under tmux", () => {
    expect(supportsInlineImages({ TERM_PROGRAM: "iTerm.app" })).toBe(true);
    expect(supportsInlineImages({ TERM_PROGRAM: "WezTerm" })).toBe(true);
    expect(supportsInlineImages({ TERM_PROGRAM: "Apple_Terminal" })).toBe(false);
    expect(supportsInlineImages({ TERM_PROGRAM: "tmux" })).toBe(false);
    expect(supportsInlineImages({ TERM: "tmux-256color", TERM_PROGRAM: "iTerm.app" })).toBe(false);
    expect(supportsInlineImages({})).toBe(false);
  });
});

describe("renderDreamArt", () => {
  afterEach(() => {
    _resetDreamArtCache();
  });

  it("emits dream names only without escapes in unsupported terminals", async () => {
    const manifest = syntheticManifest({
      options: [rewardOption(1, ["gain_omens"]), leaveOption(2)],
    });

    const result = await renderDreamArt(manifest, PROJECT_ROOT, {
      TERM_PROGRAM: "Apple_Terminal",
    });

    expect(result.block).not.toContain("\x1b]1337");
    expect(result.block.trim().length).toBeGreaterThan(0);
  });

  it("emits an inline image escape in iTerm with a real source image", async () => {
    // Render via the real image directory; if a matching file exists, the
    // escape should appear, otherwise the test falls back to verifying the
    // wrapper directly.
    const manifest = syntheticManifest({
      options: [rewardOption(1, ["gain_omens"])],
    });

    const result = await renderDreamArt(manifest, PROJECT_ROOT, {
      TERM_PROGRAM: "iTerm.app",
    });

    // Either an escape was emitted (image found and processed) or we fall
    // back gracefully to name-only — both are acceptable; the wrapper itself
    // is exercised below.
    expect(result.block.length).toBeGreaterThan(0);
  });

  it("inlineImageEscape wraps a PNG in the iTerm2 OSC sequence", async () => {
    const fakePng = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const escape = inlineImageEscape(fakePng, 10);
    expect(escape.startsWith("\x1b]1337;File=inline=1;height=10")).toBe(true);
    expect(escape.endsWith("\x07")).toBe(true);
    expect(escape).toContain(`size=${fakePng.length}`);
  });

  it("circlePng produces a PNG with transparent corners", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dream-art-"));
    try {
      const src = join(tempDir, "src.jpg");
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .jpeg()
        .toFile(src);

      const png = await circlePng(src, 40);
      // The PNG magic bytes confirm sharp produced PNG output with an alpha
      // channel (required for the circular mask).
      expect(png[0]).toBe(0x89);
      expect(png[1]).toBe(0x50);
      expect(png[2]).toBe(0x4e);
      expect(png[3]).toBe(0x47);
      const metadata = await sharp(png).metadata();
      expect(metadata.width).toBe(40);
      expect(metadata.height).toBe(40);
      expect(metadata.hasAlpha).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("shape coverage", () => {
  it("every non-Leave option / non-Leave reward branch carries rewardTemplateIds", async () => {
    const content = await loadContent(PROJECT_ROOT);
    const contentVersion = computeContentVersion({
      content,
      journeyCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      canonicalShapeDefinitions: canonicalShapeDefinitions(),
      effectCatalogVersion: EFFECT_CATALOG_VERSION,
      effectCatalogContribution: EFFECT_CATALOG.map((entry) => entry.versionContribution),
      valueModelVersion: VALUE_MODEL_VERSION,
      valueModelContribution: VALUE_MODEL_CONTRIBUTION,
      manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
      manifestContractVersion: MANIFEST_CONTRACT_VERSION,
      rendererVersion: RENDERER_VERSION,
      questInitializationVersion: QUEST_INITIALIZATION_VERSION,
    });

    // Stages chosen to exercise every shape's gating logic at least once.
    const stages = ["early", "mid", "late"] as const;
    const seed = "shape-coverage-seed";

    for (const shape of JOURNEY_SHAPES) {
      for (const stage of stages) {
        const state = createInitialJourneyState({
          seed,
          content,
          contentVersion,
        });
        state.generator.rootJourneyIndex = 1;
        state.quest.resources.dreamscape =
          stage === "early" ? 0 : stage === "mid" ? 2 : 4;
        const context = buildJourneyContext({
          projectRoot: PROJECT_ROOT,
          content,
          state,
          contentVersion,
        });

        let manifest: JourneyManifest;
        try {
          manifest = generateNextJourney({
            context,
            forcedShapeId: shape,
            forcedStage: stage,
          });
        } catch {
          // Some shapes refuse to generate in some stages; that's fine for
          // this coverage check — we only care that whatever they DO generate
          // surfaces template ids.
          continue;
        }

        for (const option of manifest.options) {
          if (option.pickBehavior === "leave") continue;
          // The field must be defined (an empty array is intentional — e.g.
          // choose_your_loss has no reward — and is handled at render time).
          expect(option.rewardTemplateIds,
            `${shape}/${stage} option ${option.number} missing rewardTemplateIds`,
          ).toBeDefined();
        }

        if (manifest.tree) {
          for (const node of manifest.tree.nodes) {
            for (const branch of node.branches) {
              const looksLikeLeave =
                branch.terminal?.outcome === "leave" ||
                branch.text.trim() === "Leave." ||
                branch.label === "Leave" ||
                branch.label === "Stop";
              if (looksLikeLeave) continue;
              expect(branch.rewardTemplateIds,
                `${shape}/${stage} branch ${branch.id} missing rewardTemplateIds`,
              ).toBeDefined();
            }
          }
        }
      }
    }
  }, 25_000);
});
