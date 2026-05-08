import type { DreamsignContent } from "../../../content/model.js";
import type { JourneyContext } from "../../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../../util/rng.js";
import { resolveDreamsignTargets } from "../../effects.js";
import type { JourneyOption } from "../../manifest.js";
import { DREAMSIGN_VALUE_CONSTANTS, valueOmenLoss } from "../../value.js";
import {
  BATTLE_WINDOW_DURATION,
  cost,
  option,
  selectedDreamsignTargets,
  target,
} from "../../fillers/shared.js";

export function namedDreamsignShopRowOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const poolIds = new Set(context.state.quest.dreamsignPoolIds);
  const primary = selectedDreamsignTargets(context, drawContext);
  const fallback = shuffleDeterministic(
    drawContext,
    "named-dreamsign-shop-row:fallback",
    context.content.dreamsigns,
  );
  const candidates = [...primary, ...fallback]
    .filter(
      (dreamsign, index, entries) =>
        entries.findIndex((entry) => entry.id === dreamsign.id) === index,
    )
    .slice(0, 3);
  const priceSlots = [
    {
      text: "essence",
      costs: [
        cost("essence", Math.min(20, context.state.quest.resources.essence)),
      ],
      cost: Math.min(20, context.state.quest.resources.essence),
    },
    {
      text: "omens",
      costs: [cost("omens", Math.min(1, context.state.quest.resources.omens))],
      cost: Math.abs(
        valueOmenLoss(Math.min(1, context.state.quest.resources.omens)),
      ),
    },
    {
      text: "essence",
      costs: [
        cost("essence", Math.min(45, context.state.quest.resources.essence)),
      ],
      cost: Math.min(45, context.state.quest.resources.essence),
    },
  ];

  return candidates.map((dreamsign: DreamsignContent, index) => {
    const source = poolIds.has(dreamsign.id) ? "pool" : "catalog";
    const sourcePoolSize =
      source === "pool"
        ? context.state.quest.dreamsignPoolIds.length
        : context.content.dreamsigns.length;
    const effect = {
      kind: "dreamsign_purchase",
      dreamsignId: dreamsign.id,
      dreamsignName: dreamsign.name,
      source,
      sourcePoolSize,
      timing: "immediate",
    };
    const price = priceSlots[index]!;
    const priceText =
      price.text === "omens"
        ? `Pay ${(price.costs[0] as { amount: number }).amount} omen.`
        : `Pay ${(price.costs[0] as { amount: number }).amount} essence.`;

    return option({
      number: index + 1,
      text: `${priceText} Gain {${dreamsign.name}} immediately.`,
      costs: price.costs,
      effects: [effect],
      targets: [
        target("dreamsign", `${dreamsign.name} in Dreamsign ${source}`, {
          source,
          ids: [dreamsign.id],
          names: [dreamsign.name],
        }),
      ],
      cost: price.cost,
      effect:
        DREAMSIGN_VALUE_CONSTANTS.namedGain + (source === "pool" ? 20 : 0),
    });
  });
}

export function sourcePoolSizeForDreamsignSource(
  context: JourneyContext,
  source: "catalog" | "active" | "pool",
): number {
  switch (source) {
    case "active":
      return context.state.quest.activeDreamsigns.length;
    case "pool":
      return context.state.quest.dreamsignPoolIds.length;
    case "catalog":
      return context.content.dreamsigns.length;
  }
}

export function namedDreamsignPayload(
  args: {
    kind: string;
    dreamsign: DreamsignContent;
    source?: "catalog" | "active" | "pool";
    result?: DreamsignContent;
    resultSource?: "catalog" | "active" | "pool";
    extra?: Record<string, unknown>;
  },
  context: JourneyContext,
): Record<string, unknown> {
  const source = args.source ?? "pool";

  return {
    kind: args.kind,
    dreamsignOperationKind: args.kind.replace(/^dreamsign_/u, ""),
    dreamsignId: args.dreamsign.id,
    dreamsignName: args.dreamsign.name,
    source,
    sourcePoolSize: sourcePoolSizeForDreamsignSource(context, source),
    timing: "immediate",
    ...(args.result
      ? {
          newDreamsignId: args.result.id,
          newDreamsignName: args.result.name,
          resultDreamsignId: args.result.id,
          resultDreamsignName: args.result.name,
          resultSource: args.resultSource ?? "catalog",
        }
      : {}),
    ...(args.extra ?? {}),
  };
}

export function dreamsignExactTarget(
  dreamsign: DreamsignContent,
  source: "catalog" | "active" | "pool",
) {
  return target("dreamsign", `${dreamsign.name} in Dreamsign ${source}`, {
    source,
    ids: [dreamsign.id],
    names: [dreamsign.name],
  });
}

export function dreamsignTransformDuplicatePoolOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const pool = selectedDreamsignTargets(context, drawContext);
  const catalog = shuffleDeterministic(
    drawContext,
    "dreamsign-transform:catalog",
    context.content.dreamsigns,
  );
  const neutral = shuffleDeterministic(
    drawContext,
    "dreamsign-transform:neutral",
    resolveDreamsignTargets(context.content, context.state.quest, {
      source: "catalog",
      kind: "neutral",
    }),
  );
  const selectedTidal = shuffleDeterministic(
    drawContext,
    "dreamsign-transform:selected-tidal",
    resolveDreamsignTargets(context.content, context.state.quest, {
      source: "catalog",
      kind: "tidal",
      tideOverlap: "selected",
    }),
  );
  const sourceA = pool[0] ?? catalog[0]!;
  const sourceB =
    pool.find((dreamsign) => dreamsign.id !== sourceA.id) ??
    catalog[1] ??
    sourceA;
  const sourceC =
    pool.find(
      (dreamsign) => dreamsign.id !== sourceA.id && dreamsign.id !== sourceB.id,
    ) ??
    catalog[2] ??
    sourceA;
  const resultA =
    selectedTidal.find((dreamsign) => dreamsign.id !== sourceA.id) ??
    catalog.find((dreamsign) => dreamsign.id !== sourceA.id) ??
    sourceB;
  const resultB =
    neutral.find((dreamsign) => dreamsign.id !== sourceB.id) ??
    catalog.find((dreamsign) => dreamsign.id !== sourceB.id) ??
    sourceA;
  const resultC =
    catalog.find(
      (dreamsign) =>
        dreamsign.id !== sourceA.id &&
        dreamsign.id !== sourceB.id &&
        dreamsign.id !== sourceC.id,
    ) ?? resultA;
  const poolIds = pool.slice(0, 4).map((dreamsign) => dreamsign.id);
  const transform = namedDreamsignPayload(
    {
      kind: "dreamsign_transform",
      dreamsign: sourceA,
      source: "pool",
      result: resultA,
      resultSource: "catalog",
    },
    context,
  );
  const purge = namedDreamsignPayload(
    {
      kind: "dreamsign_purge",
      dreamsign: sourceA,
      source: "pool",
    },
    context,
  );
  const duplicate = namedDreamsignPayload(
    {
      kind: "dreamsign_duplicate",
      dreamsign: sourceB,
      source: "pool",
      extra: { copyCount: 2 },
    },
    context,
  );
  const gain = namedDreamsignPayload(
    {
      kind: "dreamsign_gain",
      dreamsign: resultB,
      source: "catalog",
    },
    context,
  );
  const copyGain = namedDreamsignPayload(
    {
      kind: "dreamsign_copy_gain",
      dreamsign: sourceB,
      source: "pool",
      extra: { copyCount: 1 },
    },
    context,
  );
  const temporary = namedDreamsignPayload(
    {
      kind: "dreamsign_temporary_grant",
      dreamsign: resultB,
      source: "catalog",
      extra: { temporary: true, duration: BATTLE_WINDOW_DURATION },
    },
    context,
  );
  const poolEdit = namedDreamsignPayload(
    {
      kind: "dreamsign_pool_edit",
      dreamsign: sourceC,
      source: "pool",
      result: resultC,
      resultSource: "catalog",
      extra: { poolOperation: "replace" },
    },
    context,
  );
  const triggerCounter = namedDreamsignPayload(
    {
      kind: "dreamsign_trigger_counter",
      dreamsign: sourceA,
      source: "pool",
      extra: { trigger: "after next victory", count: 2 },
    },
    context,
  );
  const randomReward = namedDreamsignPayload(
    {
      kind: "dreamsign_random_reward",
      dreamsign: resultA,
      source: "catalog",
      extra: {
        selection: "visible_random",
        rewardPoolDreamsignIds:
          poolIds.length > 0 ? poolIds : [sourceA.id, sourceB.id],
        odds: {
          numerator: 1,
          denominator: Math.max(1, poolIds.length),
          percent: Math.round(100 / Math.max(1, poolIds.length)),
        },
      },
    },
    context,
  );
  const tradeHook = namedDreamsignPayload(
    {
      kind: "dreamsign_trade_hook",
      dreamsign: sourceB,
      source: "pool",
      result: resultB,
      resultSource: "catalog",
      extra: {
        timing: "after next battle",
        obligation: `Trade ${sourceB.name} for ${resultB.name}`,
        giveDreamsignId: sourceB.id,
        giveDreamsignName: sourceB.name,
        receiveDreamsignId: resultB.id,
        receiveDreamsignName: resultB.name,
      },
    },
    context,
  );
  const loss = namedDreamsignPayload(
    {
      kind: "dreamsign_loss",
      dreamsign: sourceB,
      source: "pool",
      extra: { timing: "after next battle", reason: "trade obligation" },
    },
    context,
  );

  return [
    option({
      number: 1,
      text: `Transform {${sourceA.name}} into {${resultA.name}}, purging the old sign. Add another copy of {${sourceB.name}}.`,
      effects: [transform, purge, duplicate],
      targets: [
        dreamsignExactTarget(sourceA, "pool"),
        dreamsignExactTarget(sourceB, "pool"),
        dreamsignExactTarget(resultA, "catalog"),
      ],
      effect:
        DREAMSIGN_VALUE_CONSTANTS.namedGain +
        DREAMSIGN_VALUE_CONSTANTS.selectedTideMatchBonus,
    }),
    option({
      number: 2,
      text: `Gain {${resultB.name}} as a temporary Dreamsign for the next 3 battles. Copy {${sourceB.name}} once.`,
      effects: [gain, temporary, copyGain],
      targets: [
        dreamsignExactTarget(resultB, "catalog"),
        dreamsignExactTarget(sourceB, "pool"),
      ],
      effect: DREAMSIGN_VALUE_CONSTANTS.namedGain + 35,
      uncertainty: -10,
    }),
    option({
      number: 3,
      text: `Replace {${sourceC.name}} in your Dreamsign pool with {${resultC.name}}. After next battle, trade away {${sourceB.name}} for {${resultB.name}}. Count the next 2 {${sourceA.name}} triggers; one random pool Dreamsign may also appear.`,
      effects: [poolEdit, tradeHook, loss, triggerCounter, randomReward],
      targets: [
        dreamsignExactTarget(sourceC, "pool"),
        dreamsignExactTarget(resultC, "catalog"),
        dreamsignExactTarget(sourceB, "pool"),
        dreamsignExactTarget(sourceA, "pool"),
      ],
      effect: DREAMSIGN_VALUE_CONSTANTS.namedGain + 55,
      uncertainty: -12,
    }),
  ];
}
