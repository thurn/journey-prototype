import { statusPayload } from "../../fillers/environmentPayloads.js";
import {
  DREAMSIGN_POOL_TARGET_DESCRIPTION,
  dreamsignDraft,
  dreamsignDraftText,
  lowerFirst,
  option,
  pickSequentialVariant,
  target,
} from "../../fillers/shared.js";
import { valueStatusRuleMutation } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "single_rule_trial";

export function singleRuleTrialFill(args: ShapeFillArgs): FilledJourney {
  const { drawContext } = args;
  const dreamsignChoiceCount = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:replacement-dreamsign-choice`,
    [2, 3] as const,
  );
  const dreamsignReplacement = dreamsignDraft(dreamsignChoiceCount);
  const replacementText = lowerFirst(
    dreamsignDraftText(dreamsignChoiceCount),
  ).replace(/\.$/u, "");

  return {
    options: [
      option({
        number: 1,
        text: `Your next victory yields ${replacementText} instead of card rewards.`,
        effects: [
          statusPayload({
            kind: "status_reward_replacement",
            statusName: "Spoiled Victory",
            statusScope: "reward",
            duration: "one_time",
            ruleMutationKind: "next_victory_reward_replacement",
            rewardTrigger: "next_victory",
            replacedRewardKind: "card_rewards",
            replacement: `${dreamsignChoiceCount}-choice Dreamsign draft`,
            replacementKind: "dreamsign_draft",
            replacementPayload: dreamsignReplacement,
          }),
        ],
        targets: [
          target(
            "dreamsign",
            DREAMSIGN_POOL_TARGET_DESCRIPTION,
            dreamsignReplacement.predicate,
          ),
        ],
        effect: valueStatusRuleMutation("next_victory_reward_replacement"),
        uncertainty: -8,
      }),
    ],
    precommitted: {},
  };
}
