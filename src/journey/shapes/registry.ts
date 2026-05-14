import { alterDreamscapesPlugin } from "./alter_dreamscapes/index.js";
import { chooseYourLossPlugin } from "./choose_your_loss/index.js";
import { commitNowFuturePayoffPlugin } from "./commit_now_future_payoff/index.js";
import { escalatingRewardChainPlugin } from "./escalating_reward_chain/index.js";
import { flatEscalatingTradePlugin } from "./flat_escalating_trade/index.js";
import { heterogeneousPairPlugin } from "./heterogeneous_pair/index.js";
import { randomTradesPlugin } from "./random_trades/index.js";
import { nowVsLaterPlugin } from "./now_vs_later/index.js";
import { oneOperationManyTargetsPlugin } from "./one_operation_many_targets/index.js";
import { oneTargetManyOperationsPlugin } from "./one_target_many_operations/index.js";
import { pairedReturnPlugin } from "./paired_return/index.js";
import { pushYourLuckPlugin } from "./push_your_luck/index.js";
import { randomRewardsPlugin } from "./random_rewards/index.js";
import { randomPoolDrawsPlugin } from "./random_pool_draws/index.js";
import { rewardAfterTriggerPlugin } from "./reward_after_trigger/index.js";
import { sameCostDifferentRewardsPlugin } from "./same_cost_different_rewards/index.js";
import { sameRewardDifferentCostsPlugin } from "./same_reward_different_costs/index.js";
import { sharedPrefixMenuPlugin } from "./shared_prefix_menu/index.js";
import { shopRowPlugin } from "./shop_row/index.js";
import { singleOfferPlugin } from "./single_offer/index.js";
import { singleRandomOutcomePlugin } from "./single_random_outcome/index.js";
import { singleWagerPlugin } from "./single_wager/index.js";
import { takeAnyNumberPlugin } from "./take_any_number/index.js";
import { shapeScoreWeightIds } from "./scoreWeights.js";
import { cloneSerializable, JOURNEY_SHAPE_CATALOG_VERSION } from "./shared.js";
import type {
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
} from "./types.js";

const BUILTIN_SHAPE_PLUGINS = Object.freeze([
  randomRewardsPlugin,
  sameCostDifferentRewardsPlugin,
  sameRewardDifferentCostsPlugin,
  sharedPrefixMenuPlugin,
  shopRowPlugin,
  heterogeneousPairPlugin,
  randomTradesPlugin,
  oneTargetManyOperationsPlugin,
  oneOperationManyTargetsPlugin,
  chooseYourLossPlugin,
  singleOfferPlugin,
  singleWagerPlugin,
  nowVsLaterPlugin,
  rewardAfterTriggerPlugin,
  pairedReturnPlugin,
  takeAnyNumberPlugin,
  pushYourLuckPlugin,
  randomPoolDrawsPlugin,
  escalatingRewardChainPlugin,
  flatEscalatingTradePlugin,
  singleRandomOutcomePlugin,
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

  const weightedIds = new Set(shapeScoreWeightIds());
  for (const id of weightedIds) {
    if (!seen.has(id)) {
      throw new Error(
        `Score-weight table references unknown Journey shape '${id}'.`,
      );
    }
  }
  for (const plugin of plugins) {
    if (!weightedIds.has(plugin.id)) {
      throw new Error(
        `Journey shape '${plugin.id}' is missing from the score-weight table.`,
      );
    }
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
        validationRules: [...definition.validationRules],
        debugLabel: definition.debugLabel,
        scoreWeight: plugin.scoreWeight,
        generatedObjects: cloneSerializable(plugin.generatedObjects ?? null),
        versionContribution: cloneSerializable(
          plugin.versionContribution ?? definition.versionContribution,
        ),
      };
    }),
  };
}
