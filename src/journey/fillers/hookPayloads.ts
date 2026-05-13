import type { CardContent, DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import {
  shuffleDeterministic,
  type DrawContext,
} from "../../util/rng.js";
import type { JourneyOption } from "../manifest.js";
import type { JourneyShapeId } from "../shapes.js";
import {
  type RewardSlot,
  lowerFirst,
  option,
} from "./shared.js";
import { hookCompatibility } from "./hookCompatibility.js";
import { TRIGGER_REGISTRY, type TriggerEntry } from "./hookTriggers.js";
import {
  RESOLUTION_REGISTRY,
  type HookStage,
  type ResolutionEntry,
} from "./hookResolutions.js";

type DelayedTimingSlot = {
  key: string;
  text: string;
  kind: string;
  multiplier: number;
  uncertainty: number;
};

export function hookTrigger(args: {
  triggerKind:
    | "battle"
    | "victory"
    | "each_battle"
    | "dreamscape"
    | "site_visit"
    | "named_card_play"
    | "dreamsign_trigger"
    | "card_added"
    | "essence_payment"
    | "future_shop"
    | "future_dream_journey";
  label: string;
  count?: number;
  siteType?: string;
  card?: CardContent;
  dreamsign?: DreamsignContent;
  amount?: number;
}): Record<string, unknown> {
  return {
    triggerKind: args.triggerKind,
    label: args.label,
    ...(args.count !== undefined ? { count: args.count } : {}),
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.card ? { cardId: args.card.id, cardName: args.card.name } : {}),
    ...(args.dreamsign
      ? { dreamsignId: args.dreamsign.id, dreamsignName: args.dreamsign.name }
      : {}),
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
  };
}

export function boundedDuration(
  durationKind:
    | "battle_count"
    | "dreamscape_count"
    | "shop_count"
    | "journey_count"
    | "until_trigger",
  label: string,
  count?: number,
): Record<string, unknown> {
  return {
    durationKind,
    label,
    ...(count !== undefined ? { count } : {}),
  };
}

export function expiration(
  policyKind:
    | "forfeit_reward"
    | "resolve_partial"
    | "pay_cost"
    | "return_unchanged"
    | "discard_obligation",
  label: string,
): Record<string, unknown> {
  return { policyKind, label };
}

export function hookVisibility(
  outcomeVisibility: "visible" | "hidden_until_resolution" | "debug_only",
  disclosure: string,
): Record<string, unknown> {
  return { outcomeVisibility, disclosure };
}

export function controlledScene(
  sceneKind: "reward" | "cost" | "transformation" | "trade" | "return",
  label: string,
): Record<string, unknown> {
  return { sceneKind, label };
}

export function delayedHookContract(args: {
  hookId: string;
  optionNumber: number;
  triggerSelector: Record<string, unknown>;
  trackedCondition: string;
  resolution: string;
  expiration: Record<string, unknown>;
  duration: Record<string, unknown>;
  controlledScene: Record<string, unknown>;
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
  hookBudgetCost?: number;
}): Record<string, unknown> {
  return {
    kind: "delayed_hook_contract",
    hookId: args.hookId,
    optionNumber: args.optionNumber,
    trigger: String(
      args.triggerSelector.label ?? "committed trigger",
    ).toLowerCase(),
    triggerSelector: args.triggerSelector,
    trackedCondition: args.trackedCondition,
    resolution: args.resolution,
    expiration: args.expiration,
    duration: args.duration,
    controlledScene: args.controlledScene,
    visibilityPolicy:
      args.visibilityPolicy ??
      hookVisibility(
        "visible",
        "The committed outcome is shown before choosing.",
      ),
    reward: args.reward,
    hookBudgetCost: args.hookBudgetCost ?? 0,
  };
}

function normalizedHookId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function optionRewardLabel(reward: RewardSlot): string {
  return lowerFirst(reward.text).replace(/\.$/u, "");
}

function pairedReturnTradeRewardText(reward: { text: string }): string {
  return lowerFirst(reward.text).replace(/\.$/u, "");
}

function timingTriggerSelector(timing: DelayedTimingSlot): Record<string, unknown> {
  if (timing.key === "next-battle") {
    return hookTrigger({
      triggerKind: "battle",
      label: timing.text.toLowerCase(),
      count: 1,
    });
  }

  if (timing.key === "next-victory") {
    return hookTrigger({
      triggerKind: "victory",
      label: timing.text.toLowerCase(),
      count: 1,
    });
  }

  if (timing.key === "two-dreamscapes") {
    return hookTrigger({
      triggerKind: "dreamscape",
      label: timing.text.toLowerCase(),
      count: 2,
    });
  }

  return hookTrigger({
    triggerKind: "dreamscape",
    label: timing.text.toLowerCase(),
    count: 1,
  });
}

function timingDuration(timing: DelayedTimingSlot): Record<string, unknown> {
  if (timing.key === "next-battle") {
    return boundedDuration("dreamscape_count", "within 2 dreamscapes", 2);
  }

  if (timing.key === "next-victory") {
    return boundedDuration("battle_count", "next 2 battles", 2);
  }

  if (timing.key === "two-dreamscapes") {
    return boundedDuration("dreamscape_count", "within 2 dreamscapes", 2);
  }

  return boundedDuration("dreamscape_count", "next dreamscape", 1);
}

function timingExpiration(timing: DelayedTimingSlot): Record<string, unknown> {
  if (timing.key === "next-victory") {
    return expiration(
      "forfeit_reward",
      "If the next 2 battles are not victories, discard this hook with no reward.",
    );
  }

  if (timing.key === "next-battle") {
    return expiration(
      "forfeit_reward",
      "If no battle occurs within 2 dreamscapes, discard this hook with no reward.",
    );
  }

  return expiration(
    "forfeit_reward",
    `If ${timing.text.toLowerCase()} does not resolve, discard this hook with no reward.`,
  );
}

export type ExpandedDelayedHookFill = {
  key: string;
  triggerKind: TriggerEntry["kind"];
  resolutionKind: ResolutionEntry["kind"];
  text: string;
  triggerSelector: Record<string, unknown>;
  trackedCondition: string;
  resolution: string;
  expiration: Record<string, unknown>;
  duration: Record<string, unknown>;
  controlledScene: Record<string, unknown>;
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
  effects?: unknown[];
  burdens?: unknown[];
  targets?: unknown[];
  effect: number;
  burden?: number;
  uncertainty: number;
  hookBudgetCost?: number;
};

function expandDelayedHookCandidate(
  trigger: TriggerEntry,
  resolution: ResolutionEntry,
  payload: import("./hookResolutions.js").ResolutionPayload,
): ExpandedDelayedHookFill {
  const keySuffix = payload.keySuffix ?? resolution.kind;
  return {
    key: `${trigger.kind}:${keySuffix}`,
    triggerKind: trigger.kind,
    resolutionKind: resolution.kind,
    text: payload.text,
    triggerSelector:
      payload.triggerSelector ??
      hookTrigger({
        triggerKind: trigger.kind,
        label: trigger.defaultLabel,
        count: trigger.defaultCount,
      }),
    trackedCondition:
      payload.trackedCondition ?? trigger.trackText(trigger.defaultLabel),
    resolution: payload.resolutionText,
    expiration: payload.expiration,
    duration: payload.duration,
    controlledScene: payload.controlledScene,
    visibilityPolicy: payload.visibilityPolicy,
    reward: payload.reward,
    effects: payload.effects,
    burdens: payload.burdens,
    targets: payload.targets,
    effect: payload.effect,
    burden: payload.burden,
    uncertainty: payload.uncertainty,
    hookBudgetCost: payload.hookBudgetCost,
  };
}

export function expandedDelayedHookCandidates(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage?: HookStage;
}): ExpandedDelayedHookFill[] {
  const stage = args.stage ?? "mid";
  const candidates: ExpandedDelayedHookFill[] = [];
  for (const trigger of TRIGGER_REGISTRY) {
    for (const resolution of RESOLUTION_REGISTRY) {
      if (!hookCompatibility(trigger, resolution, stage)) continue;
      const label = `${args.label}:${trigger.kind}:${resolution.kind}`;
      const payload = resolution.producesPayload({
        context: args.context,
        drawContext: args.drawContext,
        label,
        stage,
        trigger,
      });
      if (!payload) continue;
      candidates.push(expandDelayedHookCandidate(trigger, resolution, payload));
    }
  }
  return candidates;
}

export function expandedDelayedHookFills(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage?: "early" | "mid" | "late";
}): ExpandedDelayedHookFill[] {
  return shuffleDeterministic(
    args.drawContext,
    `${args.label}:expanded-hook-fills`,
    expandedDelayedHookCandidates(args),
  );
}

export function delayedHookFillFromExpanded(args: {
  shapeId: JourneyShapeId;
  optionNumber: number;
  fill: ExpandedDelayedHookFill;
  optionText?: string;
  costs?: unknown[];
  burdens?: unknown[];
  cost?: number;
  burden?: number;
  effect?: number;
  uncertainty?: number;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const precommit = {
    ...delayedHookContract({
      hookId: normalizedHookId(
        `${args.shapeId}-${args.optionNumber}-${args.fill.key}`,
      ),
      optionNumber: args.optionNumber,
      triggerSelector: args.fill.triggerSelector,
      trackedCondition: args.fill.trackedCondition,
      resolution: args.fill.resolution,
      expiration: args.fill.expiration,
      duration: args.fill.duration,
      controlledScene: args.fill.controlledScene,
      visibilityPolicy: args.fill.visibilityPolicy,
      reward: args.fill.reward,
      hookBudgetCost: args.fill.hookBudgetCost ?? 1,
    }),
    sourceShapeId: args.shapeId,
    timingKey: args.fill.key,
    rewardMetadata: {
      rewardKey: args.fill.key,
      expectedConvertedEssence: args.effect ?? args.fill.effect,
    },
  };

  return {
    option: option({
      number: args.optionNumber,
      text: args.optionText ?? args.fill.text,
      costs: args.costs ?? [],
      burdens: [...(args.burdens ?? []), ...(args.fill.burdens ?? [])],
      triggers: [precommit],
      effects: args.fill.effects ?? [],
      targets: args.fill.targets ?? [],
      cost: args.cost,
      burden: args.burden ?? args.fill.burden,
      effect: args.effect ?? args.fill.effect,
      uncertainty: args.uncertainty ?? args.fill.uncertainty,
    }),
    precommit,
  };
}

export function delayedRewardHookFill(args: {
  shapeId: string;
  optionNumber: number;
  timing: DelayedTimingSlot;
  reward: RewardSlot;
  optionText?: string;
  costs?: unknown[];
  burdens?: unknown[];
  cost?: number;
  burden?: number;
  effect?: number;
  uncertainty?: number;
  hookBudgetCost?: number;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const optionEffect = args.effect ?? Math.round(args.reward.effect * args.timing.multiplier);
  const rewardLabel = lowerFirst(args.reward.text).replace(/\.$/u, "");
  const precommit = {
    ...delayedHookContract({
      hookId: normalizedHookId(
        `${args.shapeId}-${args.optionNumber}-${args.timing.key}-${args.reward.key}`,
      ),
      optionNumber: args.optionNumber,
      triggerSelector: timingTriggerSelector(args.timing),
      trackedCondition: `Track ${args.timing.text.toLowerCase()} for option ${args.optionNumber}.`,
      resolution: `${args.timing.text}, ${rewardLabel}.`,
      expiration: timingExpiration(args.timing),
      duration: timingDuration(args.timing),
      controlledScene: controlledScene("reward", rewardLabel),
      visibilityPolicy: hookVisibility(
        "visible",
        "The delayed trigger, expiration window, and committed reward are shown before choosing.",
      ),
      reward: args.reward.effects,
      hookBudgetCost: args.hookBudgetCost ?? 1,
    }),
    sourceShapeId: args.shapeId,
    timingKey: args.timing.key,
    rewardMetadata: {
      rewardKey: args.reward.key,
      baseConvertedEssence: args.reward.effect,
      expectedConvertedEssence: optionEffect,
      timingMultiplier: args.timing.multiplier,
    },
  };

  return {
    option: option({
      number: args.optionNumber,
      text:
        args.optionText ??
        `${args.timing.text}, ${lowerFirst(args.reward.text)}`,
      costs: args.costs ?? [],
      burdens: args.burdens ?? [],
      triggers: [precommit],
      effects: args.reward.effects,
      targets: args.reward.targets ?? [],
      routeEffects: args.reward.routeEffects ?? [],
      cost: args.cost,
      burden: args.burden,
      effect: optionEffect,
      uncertainty: args.uncertainty ?? args.timing.uncertainty,
    }),
    precommit,
  };
}
