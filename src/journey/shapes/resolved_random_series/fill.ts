import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyContext } from "../../../quest/context.js";
import type {
  JourneyOption,
  JourneyStage,
  RandomPrecommittedOutcome,
} from "../../manifest.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SERIES_LENGTH = 3;
const OPTION_COUNT = 2;
const MIN_REWARD_CEC = 15;
const MAX_SERIES_SPREAD_RATIO = 1.3;
const ROLL_ATTEMPTS = 128;
const MAX_REWARD_CEC_BY_STAGE = {
  early: 130,
  mid: 280,
  late: 520,
} as const;
const RESOLVED_SERIES_EXCLUDED_TEMPLATE_IDS = new Set([
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
const EARLY_EXCLUDED_TEMPLATE_IDS = new Set([
  "choose_1_of_X_dreamsigns",
  "draft_2_predicate_cards_from_4",
  "draft_predicate_card_with_copies",
  "draft_predicate_card_with_transfiguration",
  "gain_copy_of_chosen_dreamsign",
  "gain_copy_of_random_dreamsign",
  "gain_essence_to_max",
  "increase_max_essence",
  "set_essence_to_percent_of_max",
  "shop_essence_discount",
  "transform_dreamsign_to_named",
]);

type SharedRewardSeriesPayload = {
  readonly kind: "shared_reward_template";
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

type SeriesReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly text: string;
  readonly payload: SharedRewardSeriesPayload;
  readonly convertedEssence: number;
  readonly weight: number;
};

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function stripTerminalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
}

function templateSubIds(templateId: string, params: TemplateParams): readonly string[] {
  if (templateId === "meta_gain_2_rewards") {
    return (params as { readonly subIds?: readonly string[] }).subIds ?? [];
  }

  return [];
}

function consumedTemplateIds(reward: SeriesReward): readonly string[] {
  return [
    reward.template.id,
    ...templateSubIds(reward.template.id, reward.params),
  ];
}

function materializeReward(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly stage: JourneyStage;
  readonly template: Reward;
  readonly attempt: number;
}): SeriesReward | undefined {
  if (args.template.weight <= 0 || RESOLVED_SERIES_EXCLUDED_TEMPLATE_IDS.has(args.template.id)) {
    return undefined;
  }

  if (args.stage === "early" && EARLY_EXCLUDED_TEMPLATE_IDS.has(args.template.id)) {
    return undefined;
  }

  const params = args.template.rollParams(args.context, {
    ...args.drawContext,
    selectionAttempt:
      (args.drawContext.selectionAttempt ?? 0) * 1000 +
      args.attempt * 100 +
      args.template.id.length,
  }) as TemplateParams;

  if (!args.template.viable(params as never, args.context)) {
    return undefined;
  }

  const convertedEssence = args.template.cec(params as never, args.context);
  if (
    convertedEssence < MIN_REWARD_CEC ||
    convertedEssence > MAX_REWARD_CEC_BY_STAGE[args.stage]
  ) {
    return undefined;
  }

  const text = args.template.render(params as never, args.context);

  return {
    template: args.template,
    params,
    text,
    payload: {
      kind: "shared_reward_template",
      templateId: args.template.id,
      params,
      text,
      convertedEssence,
    },
    convertedEssence,
    weight: args.template.weight,
  };
}

function targetsStarterSet(reward: SeriesReward): boolean {
  if (reward.template.id === "purge_named_starter") {
    return true;
  }

  const predicateId = (reward.params as { readonly predicateId?: unknown }).predicateId;

  return predicateId === "starter";
}

function consumesAllStarters(reward: SeriesReward): boolean {
  return reward.template.id === "purge_all_starters";
}

function keepsTargetsLiveInOrder(series: readonly SeriesReward[]): boolean {
  let startersAvailable = true;

  for (const reward of series) {
    if (!startersAvailable && targetsStarterSet(reward)) {
      return false;
    }

    if (consumesAllStarters(reward)) {
      startersAvailable = false;
    }
  }

  return true;
}

function candidateRewards(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly stage: JourneyStage;
}): SeriesReward[] {
  const candidates: SeriesReward[] = [];
  const seenKeys = new Set<string>();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const template of REWARDS) {
      const reward = materializeReward({
        context: args.context,
        drawContext: args.drawContext,
        stage: args.stage,
        template,
        attempt,
      });
      if (!reward) {
        continue;
      }

      const key = [reward.template.id, ...templateSubIds(reward.template.id, reward.params)].join(":");
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      candidates.push(reward);
    }
  }

  return candidates;
}

function selectSeries(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly stage: JourneyStage;
  readonly optionNumber: number;
  readonly usedTemplateIds: Set<string>;
}): readonly SeriesReward[] {
  const available = candidateRewards(args).filter((candidate) =>
    consumedTemplateIds(candidate).every((id) => !args.usedTemplateIds.has(id)),
  );
  const selected: SeriesReward[] = [];

  while (selected.length < SERIES_LENGTH) {
    const viable = available.filter((candidate) =>
      consumedTemplateIds(candidate).every((id) => !args.usedTemplateIds.has(id)) &&
      consumedTemplateIds(candidate).every((id) =>
        selected.every((entry) => !consumedTemplateIds(entry).includes(id)),
      ),
    );

    if (viable.length === 0) {
      throw new Error("resolved_random_series fill could not roll enough viable shared rewards");
    }

    const picked = weightedChoice(
      args.drawContext,
      `resolved_random_series:option-${args.optionNumber}:reward-${selected.length + 1}`,
      viable.map((candidate) => ({
        item: candidate,
        weight: candidate.weight,
      })),
    );

    selected.push(picked);
    available.splice(available.indexOf(picked), 1);
  }

  for (const reward of selected) {
    for (const id of consumedTemplateIds(reward)) {
      args.usedTemplateIds.add(id);
    }
  }

  return selected;
}

function seriesText(series: readonly SeriesReward[]): string {
  return `Resolve the shown reward series: ${series
    .map((reward) => stripTerminalPeriod(lowerFirst(reward.text)))
    .join(", then ")}.`;
}

function seriesConvertedEssence(series: readonly SeriesReward[]): number {
  return Math.round(
    series.reduce((total, reward) => total + reward.convertedEssence, 0),
  );
}

function optionFor(number: number, series: readonly SeriesReward[]): JourneyOption {
  const convertedEssence = seriesConvertedEssence(series);

  return {
    number,
    symbols: ["random", "reward", "series"],
    text: seriesText(series),
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: convertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: convertedEssence,
    pickBehavior: "record_and_generate_next",
  };
}

function precommittedSeries(
  optionNumber: number,
  series: readonly SeriesReward[],
): RandomPrecommittedOutcome {
  return {
    kind: "resolved_random_series",
    optionNumber,
    series: series.map((reward) => reward.payload),
    resolved: true,
    visibilityPolicy: {
      outcomeVisibility: "resolved",
      disclosure:
        "The full reward series is resolved and shown before choosing.",
      playerVisible: true,
    },
    expectedConvertedEssence: seriesConvertedEssence(series),
    riskPremiumConvertedEssence: 0,
    worstCaseBurdenConvertedEssence: 0,
    presentation: "resolved_random_series",
  };
}

function seriesSpreadRatio(rows: readonly (readonly SeriesReward[])[]): number {
  const values = rows.map(seriesConvertedEssence).filter((value) => value > 0);
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(...values) / Math.max(1, Math.min(...values));
}

function selectSeriesRows(args: ShapeFillArgs): readonly (readonly SeriesReward[])[] {
  let bestRows: readonly (readonly SeriesReward[])[] | undefined;
  let bestSpread = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < ROLL_ATTEMPTS; attempt += 1) {
    const drawContext = {
      ...args.drawContext,
      selectionAttempt: ((args.drawContext.selectionAttempt ?? 0) * 1000) + attempt,
    };
    const usedTemplateIds = new Set<string>();
    const rows = Array.from({ length: OPTION_COUNT }, (_, index) =>
      selectSeries({
        context: args.context,
        drawContext,
        stage: args.stage,
        optionNumber: index + 1,
        usedTemplateIds,
      }),
    );

    if (!rows.every(keepsTargetsLiveInOrder)) {
      continue;
    }

    const spread = seriesSpreadRatio(rows);

    if (spread < bestSpread) {
      bestRows = rows;
      bestSpread = spread;
    }
    if (spread <= MAX_SERIES_SPREAD_RATIO) {
      return rows;
    }
  }

  if (!bestRows) {
    throw new Error("resolved_random_series fill could not roll balanced shared reward series");
  }

  return bestRows;
}

export function resolvedRandomSeriesFill(args: ShapeFillArgs): FilledJourney {
  const seriesRows = selectSeriesRows(args);
  const precommitted = {
    random: seriesRows.map((series, index) =>
      precommittedSeries(index + 1, series)
    ),
  };

  return {
    options: seriesRows.map((series, index) => optionFor(index + 1, series)),
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
