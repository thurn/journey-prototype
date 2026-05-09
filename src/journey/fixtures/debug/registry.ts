import type {
  GeneratedObjectDefinition,
  JourneyOption,
  PrecommittedOutcomes,
  RandomPrecommittedOutcome,
} from "../../manifest.js";
import { baneGainPurgeTransformOptions } from "./bane.js";
import { generatedObjectOptions } from "../../fillers/generatedObjects.js";
import { debugGeneratedObjectDefinition } from "./generatedObjects.js";
import {
  dreamsignTransformDuplicatePoolOptions,
  namedDreamsignShopRowOptions,
} from "./dreamsign.js";
import {
  dreamwellWindowOptions,
  routeEditOptions,
  shopEconomyOptions,
  statusRewardReplacementOptions,
} from "./environment.js";
import {
  delayedTriggerMatrixOptions,
  pairedReturnSealBorrowTradeOptions,
} from "./hook.js";
import {
  namedCardOperationOptions,
  starterCleanupReplacementOptions,
} from "./card.js";
import { randomRevealRollWagerFill } from "./random.js";
import { resourceEdgeCaseOptions } from "./resource.js";
import { withCompleteDecisionTreePayload } from "./decisionTree.js";
import {
  forcedTimedPayloadPrecommits,
  withResourceEdgeCaseValueBands,
} from "./valueBands.js";
import {
  debugGeneratedObjectVariant,
  isDebugBaneGainPurgeTransformPayload,
  isDebugCompleteDecisionTreePayload,
  isDebugDelayedTriggerMatrixPayload,
  isDebugDreamsignTransformDuplicatePoolPayload,
  isDebugDreamwellWindowPayload,
  isDebugNamedCardOperationMenuPayload,
  isDebugNamedDreamsignShopRowPayload,
  isDebugPairedReturnSealBorrowTradePayload,
  isDebugRandomRevealRollWagerPayload,
  isDebugResourceEdgeCasePayload,
  isDebugRouteEditsPayload,
  isDebugShopEconomyPayload,
  isDebugStarterCleanupReplacementPayload,
  isDebugStatusRewardReplacementPayload,
} from "./routing.js";
import type {
  DebugFixtureBuildArgs,
  DebugFixtureBuildResult,
} from "./types.js";

type RandomRevealRollWagerFill =
  | ReturnType<typeof randomRevealRollWagerFill>
  | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadKindIs(kind: string) {
  return (payload: unknown): payload is Record<string, unknown> =>
    isRecord(payload) && payload.kind === kind;
}

function stringProperty(
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = payload[key];

  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function collectCardDelayedPrecommits(
  args: DebugFixtureBuildArgs,
  options: readonly JourneyOption[],
): unknown[] {
  if (!isDebugNamedCardOperationMenuPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("card_delayed_transformation"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        trigger: stringProperty(effect, "trigger", "after next victory"),
        reward: effect,
      })),
  );
}

function collectDreamsignDelayedPrecommits(
  args: DebugFixtureBuildArgs,
  options: readonly JourneyOption[],
): unknown[] {
  if (!isDebugDreamsignTransformDuplicatePoolPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("dreamsign_trade_hook"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        trigger: stringProperty(effect, "timing", "after next battle"),
        reward: effect,
      })),
  );
}

function collectDreamsignRandomPrecommits(
  args: DebugFixtureBuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  if (!isDebugDreamsignTransformDuplicatePoolPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("dreamsign_random_reward"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        kind: "dreamsign_random_reward",
        rewardPoolDreamsignIds: effect.rewardPoolDreamsignIds,
        selectedDreamsignId: effect.dreamsignId,
        selectedDreamsignName: effect.dreamsignName,
        odds: effect.odds,
      })),
  );
}

function collectBaneRandomPrecommits(
  args: DebugFixtureBuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  if (!isDebugBaneGainPurgeTransformPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("bane_random_purge"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        kind: "bane_random_purge",
        baneName: effect.baneName,
        baneTargetContext: effect.baneTargetContext,
        committedResult: "purged",
      })),
  );
}

function collectResourceRandomPrecommits(
  args: DebugFixtureBuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  if (!isDebugResourceEdgeCasePayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("resource_random_range"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        kind: "resource_random_range",
        resource: effect.resource,
        minimum: effect.minimum,
        maximum: effect.maximum,
        committedAmount: effect.amount,
      })),
  );
}

function selectBasePrecommitted(
  args: DebugFixtureBuildArgs,
  randomRevealRollWager: RandomRevealRollWagerFill,
): PrecommittedOutcomes {
  if (isDebugPairedReturnSealBorrowTradePayload(args.debugPayload)) {
    return {};
  }

  if (randomRevealRollWager) {
    return randomRevealRollWager.precommitted;
  }

  return args.baseFilled.precommitted;
}

function collectDelayedPrecommits(args: {
  build: DebugFixtureBuildArgs;
  generatedKind: GeneratedObjectDefinition["generatedObjectKind"] | undefined;
  options: readonly JourneyOption[];
}): unknown[] {
  const delayed = [
    ...collectCardDelayedPrecommits(args.build, args.options),
    ...collectDreamsignDelayedPrecommits(args.build, args.options),
    ...forcedTimedPayloadPrecommits(args.build.debugPayload, args.options),
  ];

  if (args.generatedKind) {
    delayed.push(
      ...args.options.flatMap((journeyOption) => journeyOption.triggers),
    );
  }

  if (
    isDebugDelayedTriggerMatrixPayload(args.build.debugPayload) ||
    isDebugPairedReturnSealBorrowTradePayload(args.build.debugPayload)
  ) {
    delayed.push(
      ...args.options.flatMap((journeyOption) => journeyOption.triggers),
    );
  }

  return delayed;
}

function collectRandomPrecommits(
  args: DebugFixtureBuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  return [
    ...collectDreamsignRandomPrecommits(args, options),
    ...collectBaneRandomPrecommits(args, options),
    ...collectResourceRandomPrecommits(args, options),
  ];
}

function addDelayedPrecommits(
  basePrecommitted: PrecommittedOutcomes,
  delayedPrecommits: readonly unknown[],
): PrecommittedOutcomes {
  if (delayedPrecommits.length === 0) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    delayed: [...(basePrecommitted.delayed ?? []), ...delayedPrecommits],
  };
}

function addRandomPrecommits(
  basePrecommitted: PrecommittedOutcomes,
  randomPrecommits: readonly RandomPrecommittedOutcome[],
): PrecommittedOutcomes {
  if (randomPrecommits.length === 0) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    random: [...(basePrecommitted.random ?? []), ...randomPrecommits],
  };
}

function addRouteEdits(
  basePrecommitted: PrecommittedOutcomes,
  options: readonly JourneyOption[],
): PrecommittedOutcomes {
  const optionRouteEffects = options.flatMap(
    (journeyOption) => journeyOption.routeEffects,
  );

  if (
    optionRouteEffects.length === 0 ||
    (basePrecommitted.routeEdits !== undefined &&
      basePrecommitted.routeEdits.length > 0)
  ) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    routeEdits: optionRouteEffects,
  };
}

function addPairedReturnPrecommits(
  args: DebugFixtureBuildArgs,
  basePrecommitted: PrecommittedOutcomes,
  options: readonly JourneyOption[],
): PrecommittedOutcomes {
  if (!isDebugPairedReturnSealBorrowTradePayload(args.debugPayload)) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    pairedReturn: [
      ...(basePrecommitted.pairedReturn ?? []),
      ...options.flatMap((journeyOption) => journeyOption.triggers),
    ],
  };
}

function buildPrecommittedOutcomes(args: {
  build: DebugFixtureBuildArgs;
  generatedKind: GeneratedObjectDefinition["generatedObjectKind"] | undefined;
  options: readonly JourneyOption[];
  randomRevealRollWager: RandomRevealRollWagerFill;
}): PrecommittedOutcomes {
  const basePrecommitted = selectBasePrecommitted(
    args.build,
    args.randomRevealRollWager,
  );
  const withDelayedPrecommits = addDelayedPrecommits(
    basePrecommitted,
    collectDelayedPrecommits({
      build: args.build,
      generatedKind: args.generatedKind,
      options: args.options,
    }),
  );
  const withRandomPrecommits = addRandomPrecommits(
    withDelayedPrecommits,
    collectRandomPrecommits(args.build, args.options),
  );
  const withRouteEdits = addRouteEdits(withRandomPrecommits, args.options);

  return addPairedReturnPrecommits(args.build, withRouteEdits, args.options);
}

function fixtureOptions(args: DebugFixtureBuildArgs): {
  options?: JourneyOption[];
  generatedKind?: GeneratedObjectDefinition["generatedObjectKind"];
  generatedObjects?: GeneratedObjectDefinition[];
  randomRevealRollWager?: RandomRevealRollWagerFill;
} {
  if (isDebugNamedCardOperationMenuPayload(args.debugPayload)) {
    return { options: namedCardOperationOptions(args.context, args.drawContext) };
  }

  if (isDebugStarterCleanupReplacementPayload(args.debugPayload)) {
    return {
      options: starterCleanupReplacementOptions(args.context, args.drawContext),
    };
  }

  if (isDebugNamedDreamsignShopRowPayload(args.debugPayload)) {
    return {
      options: namedDreamsignShopRowOptions(args.context, args.drawContext),
    };
  }

  if (isDebugDreamsignTransformDuplicatePoolPayload(args.debugPayload)) {
    return {
      options: dreamsignTransformDuplicatePoolOptions(
        args.context,
        args.drawContext,
      ),
    };
  }

  if (isDebugBaneGainPurgeTransformPayload(args.debugPayload)) {
    return {
      options: baneGainPurgeTransformOptions(args.context, args.drawContext),
    };
  }

  if (isDebugResourceEdgeCasePayload(args.debugPayload)) {
    return { options: resourceEdgeCaseOptions(args.context) };
  }

  if (isDebugRouteEditsPayload(args.debugPayload)) {
    return { options: routeEditOptions() };
  }

  if (isDebugShopEconomyPayload(args.debugPayload)) {
    return { options: shopEconomyOptions() };
  }

  if (isDebugDreamwellWindowPayload(args.debugPayload)) {
    return { options: dreamwellWindowOptions() };
  }

  if (isDebugStatusRewardReplacementPayload(args.debugPayload)) {
    return { options: statusRewardReplacementOptions() };
  }

  if (isDebugDelayedTriggerMatrixPayload(args.debugPayload)) {
    return {
      options: delayedTriggerMatrixOptions(args.context, args.drawContext),
    };
  }

  if (isDebugPairedReturnSealBorrowTradePayload(args.debugPayload)) {
    return {
      options: pairedReturnSealBorrowTradeOptions(
        args.context,
        args.drawContext,
      ),
    };
  }

  const generatedKind = debugGeneratedObjectVariant(args.debugPayload);
  if (generatedKind) {
    const generatedObject = debugGeneratedObjectDefinition(generatedKind);

    return {
      generatedKind,
      generatedObjects: [generatedObject],
      options: generatedObjectOptions(generatedObject),
    };
  }

  if (isDebugRandomRevealRollWagerPayload(args.debugPayload)) {
    const randomRevealRollWager = randomRevealRollWagerFill(
      args.context,
      args.drawContext,
    );

    return {
      randomRevealRollWager,
      options: randomRevealRollWager.options,
    };
  }

  return {};
}

export function buildDebugFixtureOverride(
  args: DebugFixtureBuildArgs,
): DebugFixtureBuildResult | undefined {
  if (args.debugPayload.qaId === "adapter/current") {
    return undefined;
  }

  const filled = isDebugCompleteDecisionTreePayload(args.debugPayload)
    ? withCompleteDecisionTreePayload(args.shapeId, args.baseFilled)
    : args.baseFilled;
  const optionResult = fixtureOptions({ ...args, baseFilled: filled });

  if (!optionResult.options) {
    return { filled };
  }

  const options = isDebugResourceEdgeCasePayload(args.debugPayload)
    ? withResourceEdgeCaseValueBands(optionResult.options)
    : optionResult.options;

  return {
    filled,
    options,
    generatedObjects: optionResult.generatedObjects,
    precommitted: buildPrecommittedOutcomes({
      build: { ...args, baseFilled: filled },
      generatedKind: optionResult.generatedKind,
      options,
      randomRevealRollWager: optionResult.randomRevealRollWager,
    }),
  };
}
