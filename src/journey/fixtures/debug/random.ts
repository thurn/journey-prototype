import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import { odds } from "../../fillers/treeBuilders.js";
import type {
  JourneyOption,
  PrecommittedOutcomes,
  RandomOutcomeVisibility,
  RandomPrecommittedOutcome,
} from "../../manifest.js";
import {
  baneBurden,
  baneBurdenSlot,
  baneNameText,
  cost,
  gainEssence,
  lowerFirst,
  option,
  pickSequentialVariant,
  rewardSlots,
} from "../../fillers/shared.js";

export function randomVisibility(
  outcomeVisibility: RandomOutcomeVisibility,
  disclosure: string,
  playerVisible: boolean,
  revealTiming?: string,
) {
  return {
    outcomeVisibility,
    disclosure,
    playerVisible,
    ...(revealTiming ? { revealTiming } : {}),
  };
}

export function randomRevealRollWagerFill(
  context: JourneyContext,
  drawContext: DrawContext,
): { options: JourneyOption[]; precommitted: PrecommittedOutcomes } {
  const rewards = rewardSlots(
    context,
    drawContext,
    "random-reveal-roll-wager:rewards",
  )
    .filter((entry) => entry.routeEffects === undefined)
    .slice(0, 5);
  const firstReward = rewards[0]!;
  const secondReward = rewards[1] ?? firstReward;
  const thirdReward = rewards[2] ?? firstReward;
  const fourthReward = rewards[3] ?? secondReward;
  const fifthReward = rewards[4] ?? thirdReward;
  const visibleRewards = [firstReward, secondReward, thirdReward, fourthReward];
  const expectedVisibleReward = Math.round(
    visibleRewards.reduce((total, reward) => total + reward.effect, 0) /
      visibleRewards.length,
  );
  const revealCount = 3;
  const randomIndex = drawInt(
    drawContext,
    "random-reveal-roll-wager:random-reward-index",
    0,
    visibleRewards.length - 1,
  );
  const repeatedDrawIndexes = [
    drawInt(
      drawContext,
      "random-reveal-roll-wager:draw-1",
      0,
      visibleRewards.length - 1,
    ),
    drawInt(
      drawContext,
      "random-reveal-roll-wager:draw-2",
      0,
      visibleRewards.length - 1,
    ),
  ];
  const firstRoll = drawInt(
    drawContext,
    "random-reveal-roll-wager:roll-twice:first",
    1,
    100,
  );
  const secondRoll = drawInt(
    drawContext,
    "random-reveal-roll-wager:roll-twice:second",
    1,
    100,
  );
  const keptRoll = Math.max(firstRoll, secondRoll);
  const wagerPercent = pickSequentialVariant(
    drawContext,
    "random-reveal-roll-wager:wager-odds",
    [45, 55, 65],
  );
  const wagerRoll = drawInt(
    drawContext,
    "random-reveal-roll-wager:wager-roll",
    1,
    100,
  );
  const stake = Math.min(45, context.state.quest.resources.essence);
  const rangeMinimum = pickSequentialVariant(
    drawContext,
    "random-reveal-roll-wager:range-min",
    [35, 45, 55],
  );
  const rangeMaximum =
    rangeMinimum +
    pickSequentialVariant(
      drawContext,
      "random-reveal-roll-wager:range-width",
      [40, 55, 70],
    );
  const committedRangeAmount = drawInt(
    drawContext,
    "random-reveal-roll-wager:range-roll",
    rangeMinimum,
    rangeMaximum,
  );
  const banePercent = pickSequentialVariant(
    drawContext,
    "random-reveal-roll-wager:bane-odds",
    [25, 35, 45],
  );
  const baneRoll = drawInt(
    drawContext,
    "random-reveal-roll-wager:bane-roll",
    1,
    100,
  );
  const baneDownside = baneBurdenSlot(
    drawContext,
    "random-reveal-roll-wager:bane-downside",
  );
  const costPercent = pickSequentialVariant(
    drawContext,
    "random-reveal-roll-wager:cost-odds",
    [30, 40, 50],
  );
  const costRoll = drawInt(
    drawContext,
    "random-reveal-roll-wager:cost-roll",
    1,
    100,
  );
  const randomCostAmount = drawInt(
    drawContext,
    "random-reveal-roll-wager:cost-amount",
    10,
    Math.max(10, stake),
  );
  const series = [firstReward, thirdReward, fifthReward];

  const visiblePoolSummary = visibleRewards
    .map((reward) => lowerFirst(reward.text).replace(/\.$/u, ""))
    .join("; ");
  const wagerSuccessText = lowerFirst(secondReward.text).replace(/\.$/u, "");

  const random: RandomPrecommittedOutcome[] = [
    {
      kind: "visible_pool",
      optionNumber: 1,
      poolId: "reveal-roll-wager-visible-pool",
      summary: `Visible pool: ${visiblePoolSummary}.`,
      rewards: visibleRewards.map((reward) => reward.effects).flat(),
      replacement: "with_replacement",
      visibilityPolicy: randomVisibility(
        "visible",
        "The full reward pool and replacement policy are visible before choosing.",
        true,
      ),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -8,
    },
    {
      kind: "random_reward",
      optionNumber: 1,
      reward: thirdReward.effects,
      committedReward: thirdReward.effects,
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "A random reward is pre-rolled from the visible pool and committed in metadata.",
        true,
      ),
      expectedConvertedEssence: thirdReward.effect,
      riskPremiumConvertedEssence: -8,
    },
    {
      kind: "reveal_rewards",
      optionNumber: 1,
      revealCount,
      rewards: visibleRewards
        .slice(0, revealCount)
        .map((reward) => reward.effects)
        .flat(),
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The revealed rewards are pre-rolled and shown in the option text.",
        true,
      ),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -5,
    },
    {
      kind: "choose_one_revealed_reward",
      optionNumber: 1,
      revealCount,
      rewards: visibleRewards
        .slice(0, revealCount)
        .map((reward) => reward.effects)
        .flat(),
      visibilityPolicy: randomVisibility(
        "visible",
        "The player chooses one of the revealed rewards.",
        true,
      ),
      expectedConvertedEssence: Math.max(
        ...visibleRewards.slice(0, revealCount).map((reward) => reward.effect),
      ),
      riskPremiumConvertedEssence: 0,
    },
    {
      kind: "choose_one_random_revealed_reward",
      optionNumber: 1,
      revealCount,
      rewards: visibleRewards
        .slice(0, revealCount)
        .map((reward) => reward.effects)
        .flat(),
      committedReward: visibleRewards[randomIndex]!.effects,
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "A reward is selected at random from the revealed set and committed in metadata.",
        true,
      ),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -10,
    },
    {
      kind: "gain_one_random_reward",
      optionNumber: 1,
      poolId: "reveal-roll-wager-visible-pool",
      rewards: visibleRewards.map((reward) => reward.effects).flat(),
      committedReward: visibleRewards[randomIndex]!.effects,
      visibilityPolicy: randomVisibility(
        "hidden_until_resolution",
        "The pool is visible, but the selected reward stays hidden until resolution.",
        false,
        "after entry",
      ),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -14,
    },
    {
      kind: "roll_twice_keep_one",
      optionNumber: 2,
      rolls: [firstRoll, secondRoll],
      keptRoll,
      outcomes: [gainEssence(rangeMinimum), gainEssence(rangeMaximum)],
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "Both rolls are committed in metadata; the better roll is kept.",
        true,
      ),
      expectedConvertedEssence: Math.round((rangeMinimum + rangeMaximum) / 2),
      riskPremiumConvertedEssence: -6,
    },
    {
      kind: "repeated_pool_draws",
      optionNumber: 1,
      poolId: "reveal-roll-wager-visible-pool",
      drawCount: repeatedDrawIndexes.length,
      rewards: visibleRewards.map((reward) => reward.effects).flat(),
      committedDraws: repeatedDrawIndexes.map(
        (index) => visibleRewards[index]!.effects,
      ),
      replacement: "with_replacement",
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "Repeated draws use the visible pool with replacement and are committed in metadata.",
        true,
      ),
      expectedConvertedEssence:
        expectedVisibleReward * repeatedDrawIndexes.length,
      riskPremiumConvertedEssence: -12,
    },
    {
      kind: "random_range",
      optionNumber: 2,
      resource: "essence",
      minimum: rangeMinimum,
      maximum: rangeMaximum,
      committedAmount: committedRangeAmount,
      visibilityPolicy: randomVisibility(
        "visible",
        "The random resource range is visible before choosing.",
        true,
      ),
      expectedConvertedEssence: Math.round((rangeMinimum + rangeMaximum) / 2),
      riskPremiumConvertedEssence: -5,
    },
    {
      kind: "random_cost",
      optionNumber: 2,
      odds: odds(costPercent),
      cost: cost("essence", randomCostAmount),
      committedCost:
        costRoll <= costPercent
          ? cost("essence", randomCostAmount)
          : { kind: "no_cost" },
      visibilityPolicy: randomVisibility(
        "delayed",
        "The chance to pay a random cost is visible; the committed result is delayed.",
        true,
        "after entry",
      ),
      expectedConvertedEssence: -Math.round(
        randomCostAmount * (costPercent / 100),
      ),
      riskPremiumConvertedEssence: -10,
    },
    {
      kind: "chance_to_pay_cost",
      optionNumber: 2,
      odds: odds(costPercent),
      cost: cost("essence", randomCostAmount),
      committedResult: costRoll <= costPercent ? "paid" : "free",
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The chance to pay the cost is visible and the roll is precommitted.",
        true,
      ),
      expectedConvertedEssence: -Math.round(
        randomCostAmount * (costPercent / 100),
      ),
      riskPremiumConvertedEssence: -10,
    },
    {
      kind: "chance_to_gain_bane",
      optionNumber: 2,
      odds: odds(banePercent),
      baneName: baneDownside.baneName,
      count: 1,
      committedResult: baneRoll <= banePercent ? "bane" : "safe",
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The Bane chance is visible and the roll is precommitted.",
        true,
      ),
      expectedConvertedEssence: Math.round(
        baneDownside.burden * (banePercent / 100),
      ),
      riskPremiumConvertedEssence: -15,
    },
    {
      kind: "wager",
      optionNumber: 2,
      odds: odds(wagerPercent),
      stake: cost("essence", stake),
      success: secondReward.effects,
      failure: { kind: "no_reward" },
      roll: wagerRoll,
      committedResult: wagerRoll <= wagerPercent ? "success" : "failure",
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The wager odds, stake, success, and failure are visible; the roll is precommitted.",
        true,
      ),
      expectedConvertedEssence:
        Math.round(secondReward.effect * (wagerPercent / 100)) - stake,
      riskPremiumConvertedEssence: -18,
    },
    {
      kind: "probability_ladder",
      optionNumber: 2,
      bounded: true,
      levels: [
        { level: 1, odds: odds(35), reward: firstReward.effects },
        { level: 2, odds: odds(55), reward: thirdReward.effects },
      ],
      visibilityPolicy: randomVisibility(
        "visible",
        "Probability ladder levels expose bounded odds before commitment.",
        true,
      ),
      expectedConvertedEssence: Math.round(
        firstReward.effect * 0.35 + thirdReward.effect * 0.55,
      ),
      riskPremiumConvertedEssence: -12,
    },
    {
      kind: "push_choice",
      optionNumber: 2,
      bounded: true,
      odds: odds(65),
      hazard: baneBurden(baneDownside.baneName, 1),
      committedResult:
        drawInt(drawContext, "random-reveal-roll-wager:push-roll", 1, 100) <= 65
          ? "success"
          : "failure",
      visibilityPolicy: randomVisibility(
        "visible",
        "Push choice hazard and success chance are visible before choosing.",
        true,
      ),
      expectedConvertedEssence: Math.round(fourthReward.effect * 0.65),
      riskPremiumConvertedEssence: -20,
    },
    {
      kind: "resolved_random_series",
      optionNumber: 1,
      series: series.map((reward) => reward.effects).flat(),
      resolved: true,
      visibilityPolicy: randomVisibility(
        "resolved",
        "The random series is fully resolved and committed in order.",
        true,
      ),
      expectedConvertedEssence: Math.round(
        series.reduce((total, reward) => total + reward.effect, 0) /
          series.length,
      ),
      riskPremiumConvertedEssence: -4,
    },
  ];

  return {
    options: [
      option({
        number: 1,
        text: `Reveal ${revealCount} rewards from a visible pool (${visiblePoolSummary}); choose one revealed reward, choose one random revealed reward, gain one hidden random reward, or resolve a two-draw series from that pool.`,
        effects: [
          {
            kind: "random_reward",
            table: "visible_reveal_pool",
            poolId: "reveal-roll-wager-visible-pool",
            revealCount,
            replacement: "with_replacement",
          },
        ],
        effect: 180,
        uncertainty: -20,
      }),
      option({
        number: 2,
        text: `Pay ${stake} essence. Roll twice and keep the better committed roll (${firstRoll}, ${secondRoll}); gain ${rangeMinimum}-${rangeMaximum} random essence; ${wagerPercent}% chance to ${wagerSuccessText}; ${banePercent}% chance to gain ${baneNameText(baneDownside.baneName, 1)}; ${costPercent}% chance to pay ${randomCostAmount} extra essence.`,
        costs: [cost("essence", stake)],
        effects: [
          {
            kind: "wager",
            odds: odds(wagerPercent),
            stake: cost("essence", stake),
            success: secondReward.effects,
            failure: { kind: "no_reward" },
            visibilityPolicy: randomVisibility(
              "visible",
              "The wager odds, stake, success, and failure are visible before choosing.",
              true,
            ),
          },
          {
            kind: "resource_random_range",
            resource: "essence",
            amount: committedRangeAmount,
            minimum: rangeMinimum,
            maximum: rangeMaximum,
            extra: { resourceAmountKind: "random_range" },
          },
        ],
        cost: stake,
        effect: stake + 200,
        uncertainty: -40,
      }),
    ],
    precommitted: { random },
  };
}
