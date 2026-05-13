import type { JourneyOption } from "../../manifest.js";
import { JOURNEY_REWARDABLE_SITE_TYPES } from "../../shared/content.js";
import { getReward } from "../../shared/rewards.js";
import type { Reward, TemplateParams } from "../../shared/types.js";
import { shuffleDeterministic } from "../../../util/rng.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

type RouteRewardId =
  | "add_site_to_dreamscape"
  | "add_site_to_next_dreamscape"
  | "replace_site_type"
  | "boost_site_appearance_chance";

type RouteScope = "current_dreamscape" | "next_dreamscape" | "future_dreamscapes";
type RouteOperationKind = "add_site" | "replace_site" | "probability_adjustment";

type RolledRouteReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly cec: number;
  readonly text: string;
  readonly routeEffect: Record<string, unknown>;
};

const SITE_UPGRADE_RANK: Readonly<Record<string, number>> = Object.freeze({
  "Dream Journey": 0,
  "Dreamsign Offering": 1,
  "Shop": 1,
  "Essence": 2,
  "Specialty Shop": 2,
  "Transfiguration": 2,
  "Purge": 3,
  "Dreamsign Draft": 3,
  "Duplication": 4,
});

const REPLACEMENT_MIN_UPGRADE_RANKS = 2;
const REPLACEMENT_BASE_CEC = 75;
const REPLACEMENT_CEC_PER_UPGRADE_RANK = 15;
const FUTURE_SITE_BOOST_DREAMSCAPES = 3;

const ROUTE_REWARD_IDS: readonly RouteRewardId[] = [
  "add_site_to_dreamscape",
  "add_site_to_next_dreamscape",
  "replace_site_type",
  "boost_site_appearance_chance",
];

function stringParam(params: TemplateParams, key: string): string {
  const value = params[key];

  if (typeof value !== "string") {
    throw new Error(`alter_dreamscapes reward params missing string '${key}'`);
  }

  return value;
}

function numberParam(params: TemplateParams, key: string): number {
  const value = params[key];

  if (typeof value !== "number") {
    throw new Error(`alter_dreamscapes reward params missing number '${key}'`);
  }

  return value;
}

function routeTiming(scope: RouteScope, durationDreamscapes?: number): string {
  switch (scope) {
    case "current_dreamscape":
      return "this dreamscape";
    case "next_dreamscape":
      return "the next dreamscape";
    case "future_dreamscapes":
      if (durationDreamscapes !== undefined) {
        return `the next ${durationDreamscapes} dreamscape${durationDreamscapes === 1 ? "" : "s"}`;
      }
      return "future dreamscapes";
  }
}

function routeEffectPayload(args: {
  readonly templateId: RouteRewardId;
  readonly operation: RouteOperationKind;
  readonly routeScope: RouteScope;
  readonly siteDeltaValue: number;
  readonly description: string;
  readonly siteType?: string;
  readonly fromSite?: string;
  readonly toSite?: string;
  readonly probabilityDeltaPercent?: number;
  readonly durationDreamscapes?: number;
}): Record<string, unknown> {
  return {
    kind: `route_${args.operation}`,
    routeOperationKind: args.operation,
    routeScope: args.routeScope,
    routePolarity: "positive",
    siteDeltaValue: args.siteDeltaValue,
    timing: routeTiming(args.routeScope, args.durationDreamscapes),
    source: "shared_reward_template",
    templateId: args.templateId,
    description: args.description,
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.fromSite ? { fromSite: args.fromSite } : {}),
    ...(args.toSite ? { toSite: args.toSite } : {}),
    ...(args.probabilityDeltaPercent !== undefined
      ? { probabilityDeltaPercent: args.probabilityDeltaPercent }
      : {}),
    ...(args.durationDreamscapes !== undefined
      ? {
        durationDreamscapes: args.durationDreamscapes,
        duration: { unit: "dreamscape", count: args.durationDreamscapes },
      }
      : {}),
  };
}

function routeEffectFor(
  templateId: RouteRewardId,
  params: TemplateParams,
  cec: number,
  text: string,
): Record<string, unknown> {
  switch (templateId) {
    case "add_site_to_dreamscape": {
      const siteType = stringParam(params, "siteType");

      return routeEffectPayload({
        templateId,
        operation: "add_site",
        routeScope: "current_dreamscape",
        siteDeltaValue: cec,
        siteType,
        description: text,
      });
    }

    case "add_site_to_next_dreamscape": {
      const siteType = stringParam(params, "siteType");

      return routeEffectPayload({
        templateId,
        operation: "add_site",
        routeScope: "next_dreamscape",
        siteDeltaValue: cec,
        siteType,
        description: text,
      });
    }

    case "replace_site_type": {
      const fromSite = stringParam(params, "fromType");
      const toSite = stringParam(params, "toType");

      return routeEffectPayload({
        templateId,
        operation: "replace_site",
        routeScope: "current_dreamscape",
        siteDeltaValue: cec,
        fromSite,
        toSite,
        description: text,
      });
    }

    case "boost_site_appearance_chance": {
      const siteType = stringParam(params, "siteType");
      const durationDreamscapes = numberParam(params, "dreamscapes");

      return routeEffectPayload({
        templateId,
        operation: "probability_adjustment",
        routeScope: "future_dreamscapes",
        siteDeltaValue: cec,
        siteType,
        probabilityDeltaPercent: numberParam(params, "percent"),
        durationDreamscapes,
        description: text,
      });
    }
  }
}

function isAddSiteTemplate(templateId: RouteRewardId): boolean {
  return templateId === "add_site_to_dreamscape" || templateId === "add_site_to_next_dreamscape";
}

function isClearReplacementUpgrade(fromType: string, toType: string): boolean {
  const fromRank = SITE_UPGRADE_RANK[fromType];
  const toRank = SITE_UPGRADE_RANK[toType];

  return fromRank !== undefined &&
    toRank !== undefined &&
    toRank - fromRank >= REPLACEMENT_MIN_UPGRADE_RANKS;
}

function replacementUpgradePairs(): readonly { readonly fromType: string; readonly toType: string }[] {
  return Object.keys(SITE_UPGRADE_RANK).flatMap((fromType) =>
    JOURNEY_REWARDABLE_SITE_TYPES
      .filter((toType) => isClearReplacementUpgrade(fromType, toType))
      .map((toType) => ({ fromType, toType }))
  );
}

function normalizeReplacementParams(args: ShapeFillArgs, params: TemplateParams, index: number): TemplateParams {
  const fromType = stringParam(params, "fromType");
  const toType = stringParam(params, "toType");

  if (isClearReplacementUpgrade(fromType, toType)) {
    return params;
  }

  const pair = shuffleDeterministic(
    args.drawContext,
    `alter_dreamscapes:replacement-upgrade:${index}`,
    replacementUpgradePairs(),
  )[0];

  if (!pair) {
    return params;
  }

  return { ...params, fromType: pair.fromType, toType: pair.toType };
}

function normalizeBoostParams(params: TemplateParams): TemplateParams {
  return {
    ...params,
    dreamscapes: typeof params.dreamscapes === "number"
      ? params.dreamscapes
      : FUTURE_SITE_BOOST_DREAMSCAPES,
  };
}

function normalizedRouteParams(
  args: ShapeFillArgs,
  templateId: RouteRewardId,
  params: TemplateParams,
  index: number,
): TemplateParams {
  switch (templateId) {
    case "replace_site_type":
      return normalizeReplacementParams(args, params, index);
    case "boost_site_appearance_chance":
      return normalizeBoostParams(params);
    default:
      return params;
  }
}

function replacementUpgradeCec(params: TemplateParams, fallback: number): number {
  const fromRank = SITE_UPGRADE_RANK[stringParam(params, "fromType")];
  const toRank = SITE_UPGRADE_RANK[stringParam(params, "toType")];

  if (fromRank === undefined || toRank === undefined) {
    return fallback;
  }

  const upgradeRanks = toRank - fromRank;

  if (upgradeRanks < REPLACEMENT_MIN_UPGRADE_RANKS) {
    return fallback;
  }

  return REPLACEMENT_BASE_CEC + upgradeRanks * REPLACEMENT_CEC_PER_UPGRADE_RANK;
}

function routeRewardCec(
  template: Reward,
  templateId: RouteRewardId,
  params: TemplateParams,
  args: ShapeFillArgs,
): number {
  const templateCec = template.cec(params as never, args.context);

  return templateId === "replace_site_type"
    ? replacementUpgradeCec(params, templateCec)
    : templateCec;
}

function rollRouteReward(
  args: ShapeFillArgs,
  templateId: RouteRewardId,
  index: number,
  attempt = 0,
): RolledRouteReward {
  const template = getReward(templateId);
  const rolledParams = template.rollParams(args.context, {
    ...args.drawContext,
    sequenceStep: (args.drawContext.sequenceStep ?? 0) * 10 + index + 1 + attempt * 1000,
  });
  const params = normalizedRouteParams(args, templateId, rolledParams, index);

  if (!template.viable(params as never, args.context)) {
    throw new Error(`alter_dreamscapes reward '${templateId}' is not viable`);
  }

  const cec = routeRewardCec(template, templateId, params, args);
  const text = template.render(params as never, args.context);

  return {
    template,
    params,
    cec,
    text,
    routeEffect: routeEffectFor(templateId, params, cec, text),
  };
}

function addSiteType(reward: RolledRouteReward): string | undefined {
  return isAddSiteTemplate(reward.template.id as RouteRewardId)
    ? stringParam(reward.params, "siteType")
    : undefined;
}

function hasSameSiteAdd(reward: RolledRouteReward, previous: readonly RolledRouteReward[]): boolean {
  const siteType = addSiteType(reward);

  return siteType !== undefined &&
    previous.some((other) => addSiteType(other) === siteType);
}

function rollDistinctRouteReward(
  args: ShapeFillArgs,
  templateId: RouteRewardId,
  index: number,
  previous: readonly RolledRouteReward[],
): RolledRouteReward {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reward = rollRouteReward(args, templateId, index, attempt);

    if (!hasSameSiteAdd(reward, previous)) {
      return reward;
    }
  }

  const fallback = rollRouteReward(args, templateId, index, 20);
  const fallbackSiteType = addSiteType(fallback);

  if (fallbackSiteType === undefined || !hasSameSiteAdd(fallback, previous)) {
    return fallback;
  }

  const siteType = shuffleDeterministic(
    args.drawContext,
    `alter_dreamscapes:add-site-distinct:${index}`,
    JOURNEY_REWARDABLE_SITE_TYPES,
  ).find((candidate) => candidate !== fallbackSiteType && !previous.some((other) => addSiteType(other) === candidate));

  if (!siteType) {
    return fallback;
  }

  const params = { ...fallback.params, siteType };
  const cec = routeRewardCec(fallback.template, templateId, params, args);
  const text = fallback.template.render(params as never, args.context);

  return {
    ...fallback,
    params,
    cec,
    text,
    routeEffect: routeEffectFor(templateId, params, cec, text),
  };
}

function rollRouteRewards(
  args: ShapeFillArgs,
  templateIds: readonly RouteRewardId[],
): readonly RolledRouteReward[] {
  return templateIds.reduce<RolledRouteReward[]>((rewards, templateId, index) => {
    rewards.push(rollDistinctRouteReward(args, templateId, index, rewards));
    return rewards;
  }, []);
}

function optionFor(number: number, reward: RolledRouteReward): JourneyOption {
  return {
    number,
    symbols: ["route", "dreamscape", "reward"],
    text: reward.text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [reward.routeEffect],
    costConvertedEssence: 0,
    effectConvertedEssence: reward.cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: reward.cec,
    pickBehavior: "record_and_generate_next",
  };
}

export function alterDreamscapesFill(args: ShapeFillArgs): FilledJourney {
  const selectedTemplateIds = shuffleDeterministic(
    args.drawContext,
    "alter_dreamscapes:route-rewards",
    ROUTE_REWARD_IDS,
  ).slice(0, 3);
  const rewards = rollRouteRewards(args, selectedTemplateIds);
  const options = rewards.map((reward, index) => optionFor(index + 1, reward));

  return {
    options,
    precommitted: {
      routeEdits: options.flatMap((option) => option.routeEffects),
    },
  };
}
