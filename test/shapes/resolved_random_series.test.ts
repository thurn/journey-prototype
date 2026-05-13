import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import type { RandomPrecommittedOutcome } from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";
import { makeTestContext } from "../helpers/journey-context.js";

const resolvedRandomSeriesPlugin = getShapePlugin("resolved_random_series");

const AUDIT_SEEDS = [
  { seed: "audit:resolved_random_series:early:03", stage: "early" },
  { seed: "audit:resolved_random_series:early:05", stage: "early" },
  { seed: "audit:resolved_random_series:early:06", stage: "early" },
  { seed: "audit:resolved_random_series:mid:01", stage: "mid" },
  { seed: "audit:resolved_random_series:mid:03", stage: "mid" },
  { seed: "audit:resolved_random_series:mid:08", stage: "mid" },
  { seed: "audit:resolved_random_series:late:01", stage: "late" },
  { seed: "audit:resolved_random_series:late:02", stage: "late" },
  { seed: "audit:resolved_random_series:late:05", stage: "late" },
  { seed: "audit:resolved_random_series:late:09", stage: "late" },
  { seed: "audit:resolved_random_series:late:10", stage: "late" },
] as const;

const UNRESOLVED_OR_CONTEXTLESS_TEMPLATE_IDS = new Set([
  "apply_chosen_transfiguration_to_chosen_card",
  "apply_named_transfiguration_to_chosen_predicate_cards",
  "gain_essence_random_range",
  "gain_random_predicate_cards",
  "gain_random_dreamsign",
  "gain_copy_of_random_dreamsign",
  "gain_copy_of_chosen_dreamsign",
  "choose_1_of_X_dreamsigns",
  "draft_predicate_cards_from_4",
  "draft_2_predicate_cards_from_4",
  "draft_predicate_card_with_copies",
  "draft_predicate_card_with_transfiguration",
  "take_any_from_predicate_choices",
  "apply_named_transfiguration_to_random_predicate_cards",
  "apply_random_transfigurations_to_random_cards",
  "duplicate_random_predicate",
  "duplicate_chosen_cards",
  "draw_X_and_duplicate_chosen",
  "modify_random_cards_to_types",
  "make_random_cards_fast",
  "make_random_cards_reclaim",
  "meta_gain_2_rewards",
  "purge_chosen_predicate_cards",
  "purge_chosen_predicate_with_replacement",
  "purge_random_starter",
  "purge_random_starter_with_predicate_replacement",
  "purge_chosen_starters",
  "replace_starter_via_draft",
  "temporary_dreamsign_for_X_battles",
  "transfigure_all_starters",
  "transfigure_chosen_starters",
  "transfigure_random_starters",
  "transform_chosen_predicate_into_named",
  "transform_dreamsign_to_named",
  "transform_starter_into_named_card",
  "replace_site_type",
]);

function fillFor(seed: string) {
  return resolvedRandomSeriesPlugin.fill(
    makeTestContext({ seed, stage: "mid" }),
  );
}

function seriesPayloads(entry: RandomPrecommittedOutcome | undefined) {
  return entry && "series" in entry && Array.isArray(entry.series)
    ? entry.series
    : [];
}

function optionSpread(fill: ReturnType<typeof fillFor>): number {
  const values = fill.options.map((option) => option.netConvertedEssence);

  return Math.max(...values) / Math.max(1, Math.min(...values));
}

async function fillForAuditSeed(
  seed: string,
  stage: "early" | "mid" | "late",
) {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({ seed, content, contentVersion });

  state.generator.rootJourneyIndex = 1;
  state.quest.resources.dreamscape =
    stage === "early" ? 0 : stage === "mid" ? 2 : 4;
  simulateQuestStateForStage({
    state,
    stage,
    drawContext: { seed, contentVersion, rootJourneyIndex: 1 },
  });

  return resolvedRandomSeriesPlugin.fill({
    context: buildJourneyContext({
      projectRoot: process.cwd(),
      content,
      state,
      contentVersion,
    }),
    drawContext: { seed, contentVersion, rootJourneyIndex: 1 },
    stage,
  });
}

describe("resolved_random_series fill", () => {
  it("uses the shape-owned validation bypass contract", () => {
    expect(resolvedRandomSeriesPlugin.definition).toMatchObject({
      topology: "random_commit",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: [],
      validationRules: [
        "manifest_schema_version",
        "manifest_version_metadata",
        "journey_id_format",
        "root_option_count_within_bounds",
      ],
    });
  });

  it("builds two resolved shared-reward series with empty option payload arrays", () => {
    const fill = fillFor("resolved-random-series-shared-rewards");

    expect(fill.options).toHaveLength(2);
    expect(fill.symmetryContracts).toBeUndefined();
    expect(fill.precommitted.random).toHaveLength(2);

    for (const option of fill.options) {
      expect(option.operations).toEqual([]);
      expect(option.costs).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.burdens).toEqual([]);
      expect(option.targets).toEqual([]);
      expect(option.triggers).toEqual([]);
      expect(option.routeEffects).toEqual([]);
      expect(option.pickBehavior).toBe("record_and_generate_next");
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
      expect(option.netConvertedEssence).toBe(option.effectConvertedEssence);
    }

    for (const [index, entry] of (fill.precommitted.random ?? []).entries()) {
      const series = seriesPayloads(entry);

      expect(entry).toMatchObject({
        kind: "resolved_random_series",
        optionNumber: index + 1,
        resolved: true,
        visibilityPolicy: {
          outcomeVisibility: "resolved",
          playerVisible: true,
        },
        expectedConvertedEssence: fill.options[index]?.effectConvertedEssence,
        riskPremiumConvertedEssence: 0,
      });
      expect(series).toHaveLength(3);
      expect(series.every((payload) =>
        typeof payload === "object" &&
        payload !== null &&
        "kind" in payload &&
        payload.kind === "shared_reward_template",
      )).toBe(true);
    }
  });

  it("is deterministic for a fixed draw context", () => {
    expect(fillFor("resolved-random-series-deterministic")).toEqual(
      fillFor("resolved-random-series-deterministic"),
    );
  });

  it("keeps deterministic early series values in a comparable band", () => {
    const fill = resolvedRandomSeriesPlugin.fill(
      makeTestContext({
        seed: "qa-resolved-random-series",
        stage: "early",
      }),
    );

    expect(optionSpread(fill)).toBeLessThanOrEqual(1.3);
    for (const entry of fill.precommitted.random ?? []) {
      for (const payload of seriesPayloads(entry)) {
        const templateId = (payload as { readonly templateId?: unknown }).templateId;

        expect(templateId).not.toBe("choose_1_of_X_dreamsigns");
        expect(templateId).not.toBe("shop_essence_discount");
      }
    }
  });

  it("keeps audit regression seeds resolved, comparable, and grammatically chained", async () => {
    for (const { seed, stage } of AUDIT_SEEDS) {
      const fill = await fillForAuditSeed(seed, stage);

      expect(optionSpread(fill), seed).toBeLessThanOrEqual(1.3);

      for (const option of fill.options) {
        expect(option.text, seed).not.toMatch(/\.\s+[^.]+,\s+then/u);
        expect(option.text, seed).not.toMatch(/\brandom\b|\brandomly\b|\brandom roll\b/i);
        expect(option.text, seed).not.toMatch(/\bChoose 1 of\b|\bDraft 1 of\b|\bTake any number\b/u);
        expect(option.text, seed).not.toContain("Replace a ");
      }

      for (const entry of fill.precommitted.random ?? []) {
        const series = seriesPayloads(entry);

        expect(series).toHaveLength(3);
        expect(series.map((payload) =>
          (payload as { readonly templateId?: unknown }).templateId,
        ), seed).toEqual(
          expect.not.arrayContaining([...UNRESOLVED_OR_CONTEXTLESS_TEMPLATE_IDS]),
        );
      }
    }
  });
});
