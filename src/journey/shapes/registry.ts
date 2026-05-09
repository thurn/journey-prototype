import { alterDreamscapesPlugin } from "./alter_dreamscapes.js";
import { chooseYourLossPlugin } from "./choose_your_loss.js";
import { commitNowFuturePayoffPlugin } from "./commit_now_future_payoff.js";
import { curatedRewardTrioPlugin } from "./curated_reward_trio.js";
import { escalatingRewardChainPlugin } from "./escalating_reward_chain.js";
import { flatEscalatingTradePlugin } from "./flat_escalating_trade.js";
import { heterogeneousPairPlugin } from "./heterogeneous_pair/index.js";
import { mirroredOperationsPlugin } from "./mirrored_operations.js";
import { nowVsLaterPlugin } from "./now_vs_later.js";
import { oneOperationManyTargetsPlugin } from "./one_operation_many_targets.js";
import { oneTargetManyOperationsPlugin } from "./one_target_many_operations.js";
import { pairedReturnPlugin } from "./paired_return.js";
import { prizeLadderPlugin } from "./prize_ladder/index.js";
import { probabilityLadderPlugin } from "./probability_ladder.js";
import { pushYourLuckPlugin } from "./push_your_luck.js";
import { randomAllocationPlugin } from "./random_allocation.js";
import { randomPoolDrawsPlugin } from "./random_pool_draws.js";
import { resolvedRandomSeriesPlugin } from "./resolved_random_series.js";
import { rewardAfterTriggerPlugin } from "./reward_after_trigger.js";
import { riskOrSkipPlugin } from "./risk_or_skip.js";
import { sameCostDifferentRewardsPlugin } from "./same_cost_different_rewards.js";
import { sameRewardDifferentCostsPlugin } from "./same_reward_different_costs.js";
import { serviceMenuPlugin } from "./service_menu.js";
import { sharedPrefixMenuPlugin } from "./shared_prefix_menu.js";
import { shopRowPlugin } from "./shop_row/index.js";
import { singleOfferPlugin } from "./single_offer/index.js";
import { singleRandomOutcomePlugin } from "./single_random_outcome.js";
import { singleRewardPlugin } from "./single_reward.js";
import { singleWagerPlugin } from "./single_wager.js";
import { takeAnyNumberPlugin } from "./take_any_number.js";
import { timedWindowMenuPlugin } from "./timed_window_menu.js";
import { revealChoiceMenuPlugin } from "./reveal_choice_menu.js";
import { cloneSerializable, JOURNEY_SHAPE_CATALOG_VERSION } from "./shared.js";
import type {
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
} from "./types.js";

const BUILTIN_SHAPE_PLUGINS = Object.freeze([
  randomAllocationPlugin,
  sameCostDifferentRewardsPlugin,
  sameRewardDifferentCostsPlugin,
  sharedPrefixMenuPlugin,
  serviceMenuPlugin,
  shopRowPlugin,
  curatedRewardTrioPlugin,
  heterogeneousPairPlugin,
  oneTargetManyOperationsPlugin,
  mirroredOperationsPlugin,
  oneOperationManyTargetsPlugin,
  chooseYourLossPlugin,
  singleRewardPlugin,
  singleOfferPlugin,
  riskOrSkipPlugin,
  singleWagerPlugin,
  nowVsLaterPlugin,
  rewardAfterTriggerPlugin,
  pairedReturnPlugin,
  timedWindowMenuPlugin,
  takeAnyNumberPlugin,
  pushYourLuckPlugin,
  prizeLadderPlugin,
  probabilityLadderPlugin,
  randomPoolDrawsPlugin,
  escalatingRewardChainPlugin,
  flatEscalatingTradePlugin,
  resolvedRandomSeriesPlugin,
  singleRandomOutcomePlugin,
  revealChoiceMenuPlugin,
  commitNowFuturePayoffPlugin,
  alterDreamscapesPlugin,
] satisfies readonly JourneyShapePlugin[]);

function validatePlugins(
  plugins: readonly JourneyShapePlugin[],
): readonly JourneyShapePlugin[] {
  const seen = new Set<string>();

  for (const plugin of plugins) {
    if (seen.has(plugin.id)) {
      throw new Error(`Duplicate Journey shape IDs in plugin registry: ${plugin.id}`);
    }

    if (plugin.id !== plugin.definition.id) {
      throw new Error(
        `Journey shape plugin '${plugin.id}' definition ID does not match '${plugin.definition.id}'.`,
      );
    }

    seen.add(plugin.id);
  }

  return plugins;
}

const PLUGINS = validatePlugins(BUILTIN_SHAPE_PLUGINS);
const DEFINITIONS = Object.freeze(
  PLUGINS.map((plugin) => plugin.definition),
);
const PLUGINS_BY_ID = new Map<string, JourneyShapePlugin>(
  PLUGINS.map((plugin) => [plugin.id, plugin]),
);

export function journeyShapePlugins(): readonly JourneyShapePlugin[] {
  return PLUGINS;
}

export function journeyShapeDefinitions(): readonly JourneyShapeDefinition[] {
  return DEFINITIONS;
}

export function getShapePlugin(id: string): JourneyShapePlugin {
  const plugin = PLUGINS_BY_ID.get(id);

  if (!plugin) {
    throw new Error(`Unknown Journey shape ID: ${id}`);
  }

  return plugin;
}

export function getShapeDefinition(id: string): JourneyShapeDefinition {
  return getShapePlugin(id).definition;
}

export function isJourneyShapeId(id: string): id is JourneyShapeId {
  return PLUGINS_BY_ID.has(id);
}

export function fallbackShapeIds(): readonly JourneyShapeId[] {
  return PLUGINS.filter((plugin) => plugin.repair?.fallbackRank !== undefined)
    .map((plugin) => ({
      id: plugin.id,
      fallbackRank: plugin.repair?.fallbackRank ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => {
      const rankComparison = left.fallbackRank - right.fallbackRank;

      if (rankComparison !== 0) {
        return rankComparison;
      }

      return left.id.localeCompare(right.id, "en-US");
    })
    .map((entry) => entry.id);
}

export function canonicalShapeDefinitions(): unknown {
  return {
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    shapes: PLUGINS.map((plugin) => {
      const definition = plugin.definition;

      return {
        id: definition.id,
        topology: definition.topology,
        rootOptionCount: { ...definition.rootOptionCount },
        supportedTags: [...definition.supportedTags],
        payloadCompatibility: cloneSerializable(
          definition.payloadCompatibility,
        ),
        validationRules: [...definition.validationRules],
        repairPreferences: [...definition.repairPreferences],
        debugLabel: definition.debugLabel,
        scoreWeight: plugin.scoreWeight,
        repair: cloneSerializable(plugin.repair ?? null),
        generatedObjects: cloneSerializable(plugin.generatedObjects ?? null),
        debugPayloads: cloneSerializable(plugin.debugPayloads ?? null),
        versionContribution: cloneSerializable(
          plugin.versionContribution ?? definition.versionContribution,
        ),
      };
    }),
  };
}
