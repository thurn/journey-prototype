import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { escalatingRewardChainFill } from "./fill.js";

export const escalatingRewardChainPlugin = defineShapePlugin({
  definition: {
    id: "escalating_reward_chain",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "reward", "cost", "chain", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "chain_rewards_share_family",
      "take_costs_scale_coherently",
    ],
    debugLabel: "Escalating reward chain",
    versionContribution: versionContribution(
      "escalating_reward_chain",
      "decision_tree",
    ),
  },
  validators: [decisionTreeValidator],
  fill: escalatingRewardChainFill,
});
