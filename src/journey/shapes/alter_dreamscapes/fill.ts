import type { JourneyOption } from "../../manifest.js";
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

function routeTiming(scope: RouteScope): string {
  switch (scope) {
    case "current_dreamscape":
      return "this dreamscape";
    case "next_dreamscape":
      return "the next dreamscape";
    case "future_dreamscapes":
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
}): Record<string, unknown> {
  return {
    kind: `route_${args.operation}`,
    routeOperationKind: args.operation,
    routeScope: args.routeScope,
    routePolarity: "positive",
    siteDeltaValue: args.siteDeltaValue,
    timing: routeTiming(args.routeScope),
    source: "shared_reward_template",
    templateId: args.templateId,
    description: args.description,
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.fromSite ? { fromSite: args.fromSite } : {}),
    ...(args.toSite ? { toSite: args.toSite } : {}),
    ...(args.probabilityDeltaPercent !== undefined
      ? { probabilityDeltaPercent: args.probabilityDeltaPercent }
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

      return routeEffectPayload({
        templateId,
        operation: "probability_adjustment",
        routeScope: "future_dreamscapes",
        siteDeltaValue: cec,
        siteType,
        probabilityDeltaPercent: numberParam(params, "percent"),
        description: text,
      });
    }
  }
}

function rollRouteReward(
  args: ShapeFillArgs,
  templateId: RouteRewardId,
  index: number,
): RolledRouteReward {
  const template = getReward(templateId);
  const params = template.rollParams(args.context, {
    ...args.drawContext,
    sequenceStep: (args.drawContext.sequenceStep ?? 0) * 10 + index + 1,
  });

  if (!template.viable(params as never, args.context)) {
    throw new Error(`alter_dreamscapes reward '${templateId}' is not viable`);
  }

  const cec = template.cec(params as never, args.context);
  const text = template.render(params as never, args.context);

  return {
    template,
    params,
    cec,
    text,
    routeEffect: routeEffectFor(templateId, params, cec, text),
  };
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
  const rewards = selectedTemplateIds.map((templateId, index) =>
    rollRouteReward(args, templateId, index)
  );
  const options = rewards.map((reward, index) => optionFor(index + 1, reward));

  return {
    options,
    precommitted: {
      routeEdits: options.flatMap((option) => option.routeEffects),
    },
  };
}
