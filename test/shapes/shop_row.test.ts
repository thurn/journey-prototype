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

function priceFor(text: string): number {
  return Number(/^Pay (\d+) essence\./u.exec(text)?.[1] ?? 0);
}

function transfigurationDominanceProfile(templateId: string):
  | { readonly control: number; readonly scope: number }
  | undefined {
  switch (templateId) {
    case "apply_chosen_transfiguration_to_chosen_card":
      return { control: 5, scope: 5 };
    case "apply_named_transfiguration_to_chosen_predicate_cards":
      return { control: 4, scope: 3 };
    case "transfigure_chosen_starters":
      return { control: 3, scope: 1 };
    case "apply_named_transfiguration_to_random_predicate_cards":
      return { control: 2, scope: 3 };
    case "apply_random_transfigurations_to_random_cards":
      return { control: 1, scope: 4 };
    case "transfigure_random_starters":
      return { control: 1, scope: 1 };
    default:
      return undefined;
  }
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

  it("keeps dominated transfiguration choices below their broader comparison", async () => {
    const seeds = [
      "audit:shop_row:mid:01",
      "audit:shop_row:mid:02",
      "audit:shop_row:mid:03",
      "audit:shop_row:late:02",
      "audit:shop_row:late:10",
    ];

    for (const seed of seeds) {
      const { manifest } = await shopRowManifest(
        seed,
        seed.includes(":late:") ? "late" : "mid",
      );
      const rows = manifest.options.flatMap((option) => {
        const rewardOperation = option.operations.find((operation) =>
          operation.role === "reward"
        );
        const templateId = String(rewardOperation?.payload.templateId ?? "");
        const profile = transfigurationDominanceProfile(templateId);

        return profile === undefined
          ? []
          : [{
              effectCec: option.effectConvertedEssence,
              price: priceFor(option.text),
              profile,
              text: option.text,
            }];
      });

      for (const candidate of rows) {
        for (const other of rows) {
          if (candidate === other) continue;
          const dominated =
            other.profile.control > candidate.profile.control &&
            other.profile.scope >= candidate.profile.scope &&
            other.effectCec >= candidate.effectCec;
          if (!dominated) continue;

          expect(candidate.price, candidate.text).toBeLessThan(other.price);
        }
      }
    }
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

});
