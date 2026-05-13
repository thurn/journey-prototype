import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption } from "../../manifest.js";
import { COSTS, getCost } from "../../shared/costs.js";
import { REWARDS, getReward } from "../../shared/rewards.js";
import type { Cost, Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "timed_window_menu";
const OPTION_COUNT = 3;
const ROLL_ATTEMPTS = 24;
const MIN_REWARD_CEC = 35;
const MAX_MENU_NET_SPREAD_RATIO = 2.35;
const MAX_REWARD_CEC_BY_STAGE = {
  early: 220,
  mid: 320,
  late: 460,
} as const;
const MAX_BURDEN_RATIO = 0.45;

type TimedWindowScope = "battle" | "dreamwell" | "shop" | "route";

const TIMED_WINDOW_SCOPES: readonly TimedWindowScope[] = [
  "battle",
  "dreamwell",
  "shop",
  "route",
];

type TimedWindow = {
  readonly scope: TimedWindowScope;
  readonly durationKind: "battle_count" | "shop_count" | "dreamscape_count";
  readonly count: number;
  readonly phrase: string;
  readonly label: string;
};

type RolledReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly cec: number;
  readonly text: string;
  readonly family: string;
};

type RolledBurden = {
  readonly template: Cost;
  readonly params: TemplateParams;
  readonly cec: number;
  readonly text: string;
};

type TimedOption = {
  readonly reward: RolledReward;
  readonly burden?: RolledBurden;
};

type RewardFamily = {
  readonly id: string;
  readonly rewardIds: readonly string[];
  readonly burdenIds: readonly string[];
};

const REWARD_FAMILIES: Record<TimedWindowScope, RewardFamily> = Object.freeze({
  battle: {
    id: "battle",
    rewardIds: [
      "opening_hand_grant_for_X_battles",
      "temporary_card_copy_for_X_battles",
      "card_cost_reduction_for_X_battles",
      "temporary_dreamsign_for_X_battles",
    ],
    burdenIds: [
      "battle_reward_reduction_flat",
      "battle_reward_reduction_percent",
      "gain_named_banes_for_X_battles",
    ],
  },
  dreamwell: {
    id: "dreamwell",
    rewardIds: [
      "set_starting_dreamwell_positive",
      "shuffle_positive_dreamwell_cards",
      "temporary_dreamsign_for_X_battles",
    ],
    burdenIds: [
      "set_starting_dreamwell_negative",
      "shuffle_negative_dreamwell_cards",
    ],
  },
  shop: {
    id: "shop",
    rewardIds: [
      "next_X_shop_rerolls_free",
      "shop_omen_discount",
      "shop_essence_discount",
      "gain_omens",
      "gain_essence",
    ],
    burdenIds: [],
  },
  route: {
    id: "route",
    rewardIds: [
      "add_site_to_dreamscape",
      "add_site_to_next_dreamscape",
      "replace_site_type",
      "boost_site_appearance_chance",
    ],
    burdenIds: [
      "remove_shop_sites_from_next_dreamscapes",
      "remove_dreamsign_sites_from_next_dreamscapes",
    ],
  },
});

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function numberParam(params: TemplateParams, key: string): number | undefined {
  const value = params[key];
  return typeof value === "number" ? value : undefined;
}

function stringParam(params: TemplateParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function timingWindowPayload(window: TimedWindow): Record<string, unknown> {
  return {
    scope: window.scope,
    label: window.label,
    duration: {
      durationKind: window.durationKind,
      count: window.count,
    },
  };
}

function sharedRewardPayload(
  reward: RolledReward,
  window: TimedWindow,
): Record<string, unknown> {
  return {
    kind: "shared_reward_template",
    templateId: reward.template.id,
    params: reward.params,
    text: reward.text,
    timingWindow: timingWindowPayload(window),
    expectedConvertedEssence: reward.cec,
    family: reward.family,
  };
}

function sharedBurdenPayload(
  burden: RolledBurden,
  window: TimedWindow,
): Record<string, unknown> {
  return {
    kind: "shared_cost_template",
    templateId: burden.template.id,
    params: burden.params,
    text: burden.text,
    timingWindow: timingWindowPayload(window),
    convertedEssence: burden.cec,
    family: "timed_window_burden",
  };
}

function withWindowParams(
  templateId: string,
  params: TemplateParams,
  window: TimedWindow,
): TemplateParams {
  const next = { ...params };

  if (window.durationKind === "battle_count" && "battles" in next) {
    next.battles = window.count;
  }
  if (window.durationKind === "shop_count" && "count" in next) {
    next.count = window.count;
  }
  if (window.durationKind === "dreamscape_count" && "dreamscapes" in next) {
    next.dreamscapes = window.count;
  }

  if (
    templateId === "boost_site_appearance_chance" &&
    window.durationKind === "dreamscape_count"
  ) {
    next.dreamscapes = window.count;
  }

  return next;
}

function renderReward(
  template: Reward,
  params: TemplateParams,
  context: ShapeFillArgs["context"],
  window: TimedWindow,
): string {
  const rendered = template.render(params as never, context);
  const battles = numberParam(params, "battles");
  const count = numberParam(params, "count");
  const percent = numberParam(params, "percent");
  const siteType = stringParam(params, "siteType");
  const cardName = stringParam(params, "cardName");

  if (template.id === "opening_hand_grant_for_X_battles" && cardName) {
    return `Your opening hand contains '${cardName}'`;
  }

  if (template.id === "temporary_card_copy_for_X_battles" && cardName) {
    return `Gain a temporary copy of '${cardName}'`;
  }

  if (template.id === "temporary_dreamsign_for_X_battles") {
    return "Gain a temporary random Dreamsign";
  }

  if (template.id === "card_cost_reduction_for_X_battles") {
    return rendered.replace(
      new RegExp(` for the next ${battles ?? window.count} battles?$`, "u"),
      "",
    );
  }

  if (window.scope === "shop" && template.id === "gain_omens") {
    const omens = numberParam(params, "x") ?? 1;
    return `Gain ${omens} omen${omens === 1 ? "" : "s"} before your first purchase in the window`;
  }

  if (window.scope === "shop" && template.id === "gain_essence") {
    const essence = numberParam(params, "x") ?? 50;
    return `Gain ${essence} essence before your first purchase in the window`;
  }

  const normalized = rendered
    .replace(
      /\bShuffle (\d+) ('[^']+') copies into your dreamwell/gu,
      (_match, count: string, cardName: string) =>
        `Shuffle ${count} copies of ${cardName} into your dreamwell`,
    );

  if (template.id === "shop_essence_discount") {
    return `Shop essence costs are reduced by ${percent ?? 20}%`;
  }

  if (template.id === "add_site_to_dreamscape") {
    return normalized.replace(
      "to this dreamscape",
      "to the first generated route with an open site slot",
    );
  }

  if (template.id === "add_site_to_next_dreamscape") {
    return normalized.replace(
      "to the next dreamscape you visit",
      "to the next generated route with an open site slot",
    );
  }

  if (template.id === "replace_site_type") {
    return normalized.replace(
      "in this dreamscape",
      "in the first eligible upcoming dreamscape",
    );
  }

  if (template.id === "boost_site_appearance_chance" && siteType && percent) {
    return `Increase ${siteType} site appearance by ${percent}% in each dreamscape in the window`;
  }

  if (template.id === "shuffle_positive_dreamwell_cards" && cardName && count) {
    return `Shuffle ${count} ${count === 1 ? "copy" : "copies"} of '${cardName}' into your dreamwell`;
  }

  return normalized;
}

function timedRewardCec(
  templateId: string,
  params: TemplateParams,
  window: TimedWindow,
  rawCec: number,
): number {
  if (window.scope === "route") {
    if (templateId === "replace_site_type") return Math.max(rawCec, 55);
    if (templateId === "add_site_to_next_dreamscape") return 70;
    if (templateId === "add_site_to_dreamscape") return 85;
    if (templateId === "boost_site_appearance_chance") {
      const percent = numberParam(params, "percent") ?? 20;
      return Math.min(95, Math.max(55, percent * 1.7));
    }
  }

  if (window.scope === "shop") {
    if (templateId === "next_X_shop_rerolls_free") return Math.max(rawCec, 45);
    if (templateId === "shop_essence_discount") {
      const percent = numberParam(params, "percent") ?? 20;
      return Math.max(45, Math.min(90, percent * 1.5));
    }
    if (templateId === "gain_omens") return Math.min(90, Math.max(45, rawCec * 0.75));
    if (templateId === "gain_essence") return Math.min(95, Math.max(45, rawCec * 0.55));
  }

  if (window.scope === "battle") {
    if (templateId === "card_cost_reduction_for_X_battles") return Math.min(rawCec, 95);
    if (templateId === "temporary_dreamsign_for_X_battles") return Math.max(rawCec, 45);
  }

  return rawCec;
}

function rollRewardCandidates(
  args: ShapeFillArgs,
  window: TimedWindow,
  draw: DrawContext,
): RolledReward[] {
  const family = REWARD_FAMILIES[window.scope];
  const candidates: RolledReward[] = [];

  for (const templateId of family.rewardIds) {
    const template = getReward(templateId);
    const baseParams = template.rollParams(args.context, {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    const params = withWindowParams(template.id, baseParams, window);

    if (!template.viable(params as never, args.context)) continue;
    const cec = timedRewardCec(
      template.id,
      params,
      window,
      template.cec(params as never, args.context),
    );
    if (cec < MIN_REWARD_CEC) continue;
    if (cec > MAX_REWARD_CEC_BY_STAGE[args.stage]) continue;

    candidates.push({
      template,
      params,
      cec,
      text: renderReward(template, params, args.context, window),
      family: family.id,
    });
  }

  return candidates;
}

function rollBurdenCandidates(
  args: ShapeFillArgs,
  window: TimedWindow,
  draw: DrawContext,
  reward: RolledReward,
): RolledBurden[] {
  const family = REWARD_FAMILIES[window.scope];
  const candidates: RolledBurden[] = [];

  for (const templateId of family.burdenIds) {
    const template = getCost(templateId);
    const baseParams = template.rollParams(args.context, {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    const params = withWindowParams(template.id, baseParams, window);

    if (!template.viable(params as never, args.context)) continue;
    const cec = template.cec(params as never, args.context);
    if (cec <= 0 || cec > reward.cec * MAX_BURDEN_RATIO) continue;
    const text = renderBurden(template, params, args.context);
    if (text.includes("[LOCKED]")) continue;

    candidates.push({ template, params, cec, text });
  }

  return candidates;
}

function renderBurden(
  template: Cost,
  params: TemplateParams,
  context: ShapeFillArgs["context"],
): string {
  const text = template.render(params as never, context);

  switch (template.id) {
    case "battle_reward_reduction_flat":
      return text.replace(/ for the next \d+ battles?$/u, "");
    case "battle_reward_reduction_percent":
      return text.replace(/ for the next \d+ battles?$/u, "");
    case "gain_named_banes_for_X_battles":
      return text.replace(/ for the next \d+ battles?$/u, " during the window");
    case "set_starting_dreamwell_negative":
      return text.replace(/ for the next \d+ battles?$/u, "");
    case "shuffle_negative_dreamwell_cards":
      return text.replace(/ for the next \d+ battles?$/u, "");
    case "remove_shop_sites_from_next_dreamscapes":
      return "Remove shop sites from dreamscapes in the window";
    case "remove_dreamsign_sites_from_next_dreamscapes":
      return "Remove Dreamsign sites from dreamscapes in the window";
    default:
      return text;
  }
}

function menuNetSpreadRatio(options: readonly TimedOption[]): number {
  const values = options
    .map((option) => option.reward.cec - (option.burden?.cec ?? 0))
    .filter((value) => value > 0);

  if (values.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...values) / Math.max(1, Math.min(...values));
}

function timedWindow(draw: DrawContext, requestedScope: unknown): TimedWindow {
  const scope = typeof requestedScope === "string" &&
      TIMED_WINDOW_SCOPES.includes(requestedScope as TimedWindowScope)
    ? requestedScope as TimedWindowScope
    : weightedChoice(
      draw,
      `${SHAPE_ID}:window-scope`,
      TIMED_WINDOW_SCOPES.map((item) => ({ item, weight: 1 })),
    );

  if (scope === "shop") {
    const count = drawInt(draw, `${SHAPE_ID}:shop-window-count`, 2, 3);

    return {
      scope,
      durationKind: "shop_count",
      count,
      phrase: `For the next ${count} shops`,
      label: `next ${count} shops`,
    };
  }

  if (scope === "route") {
    const count = drawInt(draw, `${SHAPE_ID}:route-window-count`, 2, 3);

    return {
      scope,
      durationKind: "dreamscape_count",
      count,
      phrase: `For the next ${count} dreamscapes`,
      label: `next ${count} dreamscapes`,
    };
  }

  const count = drawInt(
    draw,
    `${SHAPE_ID}:battle-window-count`,
    scope === "dreamwell" ? 3 : 2,
    scope === "dreamwell" ? 5 : 4,
  );

  return {
    scope,
    durationKind: "battle_count",
    count,
    phrase: `For the next ${count} battles`,
    label: `next ${count} battles`,
  };
}

function pickTimedOptions(args: ShapeFillArgs, window: TimedWindow): readonly TimedOption[] {
  for (let attempt = 0; attempt < ROLL_ATTEMPTS; attempt += 1) {
    const attemptDraw = {
      ...args.drawContext,
      selectionAttempt: ((args.drawContext.selectionAttempt ?? 0) * 1000) + attempt,
    };
    const usedRewardIds = new Set<string>();
    const usedBurdenIds = new Set<string>();
    const options: TimedOption[] = [];
    const rewardCandidates = rollRewardCandidates(args, window, attemptDraw);

    for (let index = 0; index < OPTION_COUNT; index += 1) {
      const availableRewards = rewardCandidates.filter((reward) =>
        !usedRewardIds.has(reward.template.id)
      );
      if (availableRewards.length === 0) break;
      const rowDraw = {
        ...attemptDraw,
        sequenceStep: (attemptDraw.sequenceStep ?? 0) * 100 + index,
      };
      const reward = weightedChoice(
        rowDraw,
        `${SHAPE_ID}:reward:${window.scope}:${attempt}:${index}`,
        availableRewards.map((candidate) => ({
          item: candidate,
          weight: candidate.template.weight,
        })),
      );
      const burdenCandidates = rollBurdenCandidates(args, window, rowDraw, reward)
        .filter((burden) => !usedBurdenIds.has(burden.template.id));
      const burden = burdenCandidates.length > 0 && index % 2 === 1
        ? weightedChoice(
          rowDraw,
          `${SHAPE_ID}:burden:${window.scope}:${attempt}:${index}`,
          burdenCandidates.map((candidate) => ({
            item: candidate,
            weight: candidate.template.weight,
          })),
        )
        : undefined;

      options.push({ reward, burden });
      usedRewardIds.add(reward.template.id);
      if (burden) usedBurdenIds.add(burden.template.id);
    }

    if (
      options.length === OPTION_COUNT &&
      menuNetSpreadRatio(options) <= MAX_MENU_NET_SPREAD_RATIO
    ) {
      return options;
    }
  }

  throw new Error(`timed_window_menu fill could not roll ${OPTION_COUNT} window options`);
}

function fallbackWindowScopes(primary: TimedWindowScope): readonly TimedWindowScope[] {
  return [
    primary,
    ...TIMED_WINDOW_SCOPES.filter((scope) => scope !== primary),
  ];
}

function optionText(window: TimedWindow, row: TimedOption): string {
  const reward = lowerFirst(row.reward.text).replace(/\.$/u, "");

  if (!row.burden) {
    return sentence(`${window.phrase}, ${reward}`);
  }

  return sentence(
    `${window.phrase}, ${reward}. During that window, ${lowerFirst(row.burden.text).replace(/\.$/u, "")}`,
  );
}

function timedOption(
  number: number,
  window: TimedWindow,
  row: TimedOption,
): JourneyOption {
  const burdenCec = row.burden?.cec ?? 0;

  return {
    number,
    symbols: ["timing", window.scope, "reward"],
    text: optionText(window, row),
    operations: [],
    costs: [],
    effects: [sharedRewardPayload(row.reward, window)],
    burdens: row.burden ? [sharedBurdenPayload(row.burden, window)] : [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: row.reward.cec,
    burdenConvertedEssence: burdenCec,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: row.reward.cec - burdenCec,
    pickBehavior: "record_and_generate_next",
  };
}

function catalogueHasTemplates(): boolean {
  return REWARDS.length > 0 && COSTS.length > 0;
}

export function timedWindowMenuFillImpl(args: ShapeFillArgs): FilledJourney {
  if (!catalogueHasTemplates()) {
    throw new Error("timed_window_menu fill requires shared reward and cost templates");
  }

  const primaryWindow = timedWindow(args.drawContext, args.shapeArgs?.windowScope);
  let window = primaryWindow;
  let rows: readonly TimedOption[] | undefined;

  for (const scope of fallbackWindowScopes(primaryWindow.scope)) {
    const candidateWindow = scope === primaryWindow.scope
      ? primaryWindow
      : timedWindow(args.drawContext, scope);

    try {
      rows = pickTimedOptions(args, candidateWindow);
      window = candidateWindow;
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("could not roll")) {
        throw error;
      }
    }
  }

  if (!rows) {
    throw new Error(`timed_window_menu fill could not roll ${OPTION_COUNT} window options`);
  }

  return {
    options: rows.map((row, index) => timedOption(index + 1, window, row)),
    precommitted: {},
  };
}
