import { describe, expect, it } from "vitest";
import { validateJourneyManifest } from "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";

async function shopRowManifest(seed: string, stage: "early" | "mid" | "late" = "mid") {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion,
  });

  simulateQuestStateForStage({
    state,
    stage,
    drawContext: {
      seed,
      contentVersion,
      rootJourneyIndex: 0,
    },
  });

  const context = buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });

  return {
    context,
    manifest: generateNextJourney({
      context,
      forcedShapeId: "shop_row",
      forcedStage: stage,
    }),
  };
}

describe("shop_row fill", () => {
  it("builds deterministic priced reward rows from shared templates", async () => {
    const first = await shopRowManifest("shop-row-shared");
    const second = await shopRowManifest("shop-row-shared");

    expect(first.manifest.options).toHaveLength(3);
    expect(first.manifest.generatedObjects).toEqual([]);
    expect(first.manifest.options.map((option) => option.text)).toEqual(
      second.manifest.options.map((option) => option.text),
    );
    expect(new Set(first.manifest.options.map((option) => option.text)).size).toBe(3);

    for (const option of first.manifest.options) {
      expect(option.text).toMatch(/^Pay \d+ essence\. /u);
      expect(option.operations).toEqual([
        expect.objectContaining({
          operationKind: "cost",
          role: "cost",
          resource: "essence",
          amount: expect.any(Number),
        }),
        expect.objectContaining({
          role: expect.stringMatching(/^(reward|route_edit)$/u),
          value: { convertedEssence: option.effectConvertedEssence },
          payload: expect.objectContaining({
            templateId: expect.any(String),
          }),
        }),
      ]);
      expect(option.costs).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.costConvertedEssence).toBeGreaterThan(0);
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
      expect(option.netConvertedEssence).toBe(
        option.effectConvertedEssence - option.costConvertedEssence,
      );
    }

    expect(validateJourneyManifest(first.manifest, first.context)).toEqual({
      ok: true,
    });
  });

  it("keeps all-predicate transfiguration upgrades out of shop rows", async () => {
    const seeds = [
      "audit:shop_row:late:02",
      "audit:shop_row:late:10",
    ];

    for (const seed of seeds) {
      const { manifest } = await shopRowManifest(seed, "late");
      const rewardTemplateIds = manifest.options.flatMap((option) =>
        option.operations.map((operation) => operation.payload.templateId),
      );

      expect(rewardTemplateIds).not.toContain("apply_named_transfiguration_to_all_predicate_cards");
      expect(manifest.options.map((option) => option.text).join("\n"))
        .not.toMatch(/Apply Golden to all/u);
    }
  });

  it("prices equal-row dominated transfiguration choices below their broader comparison", async () => {
    const { manifest } = await shopRowManifest("audit:shop_row:mid:01", "mid");
    const priceFor = (text: string) => Number(/^Pay (\d+) essence\./u.exec(text)?.[1] ?? 0);
    const broad = manifest.options.find((option) =>
      option.text.includes("Apply a transfiguration of your choice to a chosen card")
    );
    const narrow = manifest.options.find((option) =>
      option.text.includes("Apply a random transfiguration to 1 chosen starter card")
    );

    expect(broad).toBeDefined();
    expect(narrow).toBeDefined();
    expect(priceFor(narrow!.text)).toBeLessThan(priceFor(broad!.text));
  });

  it("renders shop-row offer text without simple article or singular agreement defects", async () => {
    const manifests = await Promise.all([
      shopRowManifest("audit:shop_row:mid:02", "mid"),
      shopRowManifest("audit:shop_row:early:10", "early"),
    ]);
    const text = manifests
      .flatMap(({ manifest }) => manifest.options.map((option) => option.text))
      .join("\n");

    expect(text).not.toContain("a Essence site");
    expect(text).not.toContain("1 random cards");
  });

  it("exposes commercial shop payload families through reachability metadata", async () => {
    const { manifest } = await shopRowManifest("audit:shop_row:early:01", "early");
    const payloadFamilies = manifest.debug.reachability?.payloadFamilies ?? [];

    expect(payloadFamilies).toEqual(expect.arrayContaining([
      "resource_cost",
      "resource_cost:essence",
    ]));
    expect(payloadFamilies.some((family) =>
      !family.startsWith("resource_cost") && !family.startsWith("resource_amount")
    )).toBe(true);
    expect(manifest.debug.reachability?.evidence.some((entry) =>
      entry.path.startsWith("options.") && entry.category === "payload"
    )).toBe(true);
  });
});
