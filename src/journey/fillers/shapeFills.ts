import type { JourneyContext } from "../../quest/context.js";
import {
  drawInt,
  shuffleDeterministic,
  type DrawContext,
} from "../../util/rng.js";
import { decisionTreeForShape, odds } from "./treeBuilders.js";
import type {
  JourneyOption,
  JourneyRewardPool,
  JourneyTree,
  PrecommittedOutcomes,
} from "../manifest.js";
import { type JourneyShapeId } from "../shapes.js";
import {
  valueBaneGain,
  valueCardDraft,
  valueDreamsignDraft,
  valueOmenGain,
  valueOmenLoss,
} from "../value.js";
import {
  BATTLE_WINDOW_DURATION,
  CARD_DRAFT_PROFILES,
  CARD_POOL_TARGET_DESCRIPTION,
  DREAMSIGN_POOL_TARGET_DESCRIPTION,
  GENERIC_CARD_DRAFT_PROFILE,
  cardDraftPredicate,
  cardDraftText,
  chosenCardText,
  commonPositiveOptions,
  comparableEssenceLossAmount,
  cost,
  costSlots,
  costedRewardOption,
  delayedRewardOption,
  draftCards,
  dreamsignDraft,
  dreamsignDraftText,
  gainEssence,
  gainOmen,
  legalCardDraftProfile,
  lowerFirst,
  nightmare,
  option,
  pickLegalCardDraftProfile,
  pickSequentialVariant,
  renumberOptions,
  rewardSlotOption,
  rewardSlots,
  routeReplacementReward,
  target,
  timingSlots,
  treeBuilderTools,
} from "./shared.js";
import { delayedRewardHookFill } from "./hookPayloads.js";

export function fillOptions(
  shapeId: JourneyShapeId,
  context: JourneyContext,
  drawContext: DrawContext,
): {
  options: JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  precommitted: PrecommittedOutcomes;
} {
  const payablePrice = Math.min(30, context.state.quest.resources.essence);
  const premiumPrice = Math.min(45, context.state.quest.resources.essence);

  switch (shapeId) {
    case "random_allocation":
      return {
        options: rewardSlots(context, drawContext, `${shapeId}:rewards`)
          .slice(0, 3)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {},
      };
    case "same_cost_different_rewards": {
      const sharedCost = costSlots(
        context,
        drawContext,
        `${shapeId}:shared-cost`,
      )[0]!;
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:rewards`,
      ).filter((reward) => reward.routeEffects === undefined);

      return {
        options: rewards
          .slice(0, 3)
          .map((reward, index) =>
            costedRewardOption(index + 1, sharedCost, reward),
          ),
        precommitted: {},
      };
    }
    case "same_reward_different_costs": {
      const family = pickSequentialVariant(drawContext, `${shapeId}:family`, [
        "card-draft",
        "dreamsign-draft",
        "omen-cache",
        "transfiguration",
      ] as const);

      if (family === "transfiguration") {
        const transfiguration = pickSequentialVariant(
          drawContext,
          `${shapeId}:same-reward-transfiguration`,
          ["Bronze", "Scarlet", "Viridian", "Golden", "Prismatic"],
        );
        const targetProfile = pickLegalCardDraftProfile(
          context,
          drawContext,
          `${shapeId}:same-reward-transfiguration-target`,
          [
            CARD_DRAFT_PROFILES.characters,
            CARD_DRAFT_PROFILES.events,
            CARD_DRAFT_PROFILES.fastCharacters,
            CARD_DRAFT_PROFILES.lowCostCharacters,
          ],
        );
        const targetRecord = target(
          "card",
          targetProfile.targetDescription,
          cardDraftPredicate(targetProfile),
        );
        const sharedOmenBonus = pickSequentialVariant(
          drawContext,
          `${shapeId}:same-reward-transfiguration-omen-bonus`,
          [3, 4, 5],
        );
        const sharedReward = {
          text: `Apply {${transfiguration} Transfiguration} to ${chosenCardText()}. Gain ${sharedOmenBonus} omens.`,
          effects: [
            {
              kind: "transfiguration",
              transfigurationName: transfiguration,
            },
            gainOmen(sharedOmenBonus),
          ],
          effect: 100 + valueOmenGain(sharedOmenBonus),
        };
        const costs = [
          {
            prefix: `Pay ${Math.min(15, context.state.quest.resources.essence)} essence.`,
            costs: [
              cost(
                "essence",
                Math.min(15, context.state.quest.resources.essence),
              ),
            ],
            cost: Math.min(15, context.state.quest.resources.essence),
          },
          context.state.quest.resources.omens >= 1
            ? {
                prefix: "Lose 1 omen.",
                costs: [cost("omens", 1)],
                cost: Math.abs(valueOmenLoss(1)),
              }
            : {
                prefix: `Pay ${payablePrice} essence.`,
                costs: [cost("essence", payablePrice)],
                cost: payablePrice,
              },
          {
            prefix: "Gain 1 Nightmare.",
            burdens: [nightmare(1)],
            burden: valueBaneGain("Nightmare", 1),
          },
        ];

        return {
          options: costs.map((entry, index) =>
            option({
              number: index + 1,
              text: `${entry.prefix} ${sharedReward.text}`,
              costs: entry.costs ?? [],
              burdens: entry.burdens ?? [],
              effects: sharedReward.effects,
              targets: [targetRecord],
              cost: entry.cost,
              burden: entry.burden,
              effect: sharedReward.effect,
            }),
          ),
          precommitted: {},
        };
      }

      if (
        family === "dreamsign-draft" &&
        context.state.quest.dreamsignPoolIds.length > 0
      ) {
        const choiceCounts = shuffleDeterministic(
          drawContext,
          `${shapeId}:dreamsign-choice-order`,
          [2, 3, 4],
        );
        const dreamsignCosts = [
          {
            prefix: `Pay ${Math.min(pickSequentialVariant(drawContext, `${shapeId}:dreamsign-price`, [10, 15, 20]), context.state.quest.resources.essence)} essence.`,
            costs: [
              cost(
                "essence",
                Math.min(
                  pickSequentialVariant(
                    drawContext,
                    `${shapeId}:dreamsign-price`,
                    [10, 15, 20],
                  ),
                  context.state.quest.resources.essence,
                ),
              ),
            ],
            cost: Math.min(
              pickSequentialVariant(
                drawContext,
                `${shapeId}:dreamsign-price`,
                [10, 15, 20],
              ),
              context.state.quest.resources.essence,
            ),
          },
          context.state.quest.resources.omens >= 1
            ? {
                prefix: "Lose 1 omen.",
                costs: [cost("omens", 1)],
                cost: Math.abs(valueOmenLoss(1)),
              }
            : {
                prefix: `Pay ${payablePrice} essence.`,
                costs: [cost("essence", payablePrice)],
                cost: payablePrice,
              },
          {
            prefix: "Gain 1 Nightmare.",
            burdens: [nightmare(1)],
            burden: valueBaneGain("Nightmare", 1),
          },
        ];

        return {
          options: choiceCounts.map((choiceCount, index) => {
            const reward = dreamsignDraft(choiceCount);
            const dreamsignCost = dreamsignCosts[index]!;

            return option({
              number: index + 1,
              text: `${dreamsignCost.prefix} ${dreamsignDraftText(choiceCount)}`,
              costs: dreamsignCost.costs ?? [],
              burdens: dreamsignCost.burdens ?? [],
              effects: [reward],
              targets: [
                target(
                  "dreamsign",
                  DREAMSIGN_POOL_TARGET_DESCRIPTION,
                  reward.predicate,
                ),
              ],
              cost: dreamsignCost.cost,
              burden: dreamsignCost.burden,
              effect: valueDreamsignDraft(reward, context) + index * 30,
            });
          }),
          precommitted: {},
        };
      }

      if (family === "omen-cache") {
        const amounts = shuffleDeterministic(
          drawContext,
          `${shapeId}:omen-amount-order`,
          [3, 4, 5],
        );
        const omenCost =
          context.state.quest.resources.omens >= 1
            ? cost("omens", 1)
            : cost("essence", payablePrice);
        const options = [
          {
            prefix: `Pay ${Math.min(10, context.state.quest.resources.essence)} essence.`,
            costs: [
              cost(
                "essence",
                Math.min(10, context.state.quest.resources.essence),
              ),
            ],
            cost: Math.min(10, context.state.quest.resources.essence),
            amount: amounts[0]!,
          },
          {
            prefix:
              context.state.quest.resources.omens >= 1
                ? "Lose 1 omen."
                : `Pay ${payablePrice} essence.`,
            costs: [omenCost],
            cost:
              context.state.quest.resources.omens >= 1
                ? Math.abs(valueOmenLoss(1))
                : payablePrice,
            amount: amounts[1]!,
          },
          {
            prefix: "Gain 1 Nightmare.",
            burdens: [nightmare(1)],
            burden: valueBaneGain("Nightmare", 1),
            amount: amounts[2]!,
          },
        ];

        return {
          options: options.map((entry, index) =>
            option({
              number: index + 1,
              text: `${entry.prefix} Gain ${entry.amount} omens.`,
              costs: entry.costs ?? [],
              burdens: entry.burdens ?? [],
              effects: [gainOmen(entry.amount)],
              cost: entry.cost,
              burden: entry.burden,
              effect: valueOmenGain(entry.amount),
            }),
          ),
          precommitted: {},
        };
      }

      const profiles = shuffleDeterministic(
        drawContext,
        `${shapeId}:card-profiles`,
        [
          CARD_DRAFT_PROFILES.lowCostCharacters,
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.reclaimEvents,
          CARD_DRAFT_PROFILES.dissolveEvents,
          CARD_DRAFT_PROFILES.fastCharacters,
        ],
      ).map((profile, index, shuffled) =>
        legalCardDraftProfile(context, shuffled.slice(index, index + 1)),
      );
      const prices = [
        Math.min(20, context.state.quest.resources.essence),
        payablePrice,
        premiumPrice,
      ];

      return {
        options: [0, 1, 2].map((index) => {
          const profile = profiles[index] ?? GENERIC_CARD_DRAFT_PROFILE;
          const cardDraft = draftCards(profile);

          return option({
            number: index + 1,
            text: `Pay ${prices[index]!} essence. ${cardDraftText(profile)}${index === 0 ? "" : ` Gain ${index} ${index === 1 ? "omen" : "omens"}.`}`,
            costs: [cost("essence", prices[index]!)],
            effects: index === 0 ? [cardDraft] : [cardDraft, gainOmen(index)],
            targets: [
              target("card", profile.targetDescription, cardDraft.predicate),
            ],
            cost: prices[index]!,
            effect:
              valueCardDraft(cardDraft) +
              (index === 0 ? 0 : valueOmenGain(index)),
          });
        }),
        precommitted: {},
      };
    }
    case "service_menu":
      return {
        options: rewardSlots(context, drawContext, `${shapeId}:services`)
          .filter((reward) => reward.effect >= 140)
          .slice(0, 3)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {},
      };
    case "shop_row":
      return {
        options: rewardSlots(context, drawContext, `${shapeId}:goods`)
          .filter((reward) => reward.routeEffects === undefined)
          .slice(0, 3)
          .map((reward, index) =>
            costedRewardOption(
              index + 1,
              {
                key: "shop-price",
                prefix: `Pay ${[15, 20, 25][index]!} essence.`,
                costs: [cost("essence", [15, 20, 25][index]!)],
                cost: [15, 20, 25][index]!,
              },
              reward,
            ),
          ),
        precommitted: {},
      };
    case "curated_reward_trio": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:positive-menu`,
      ).filter((reward) => reward.effect >= 170);
      const draftReward = rewards.find((reward) =>
        reward.key.startsWith("draft"),
      );
      const orderedRewards = [
        ...(draftReward ? [draftReward] : []),
        ...rewards.filter((reward) => reward.key !== draftReward?.key),
      ];

      return {
        options: orderedRewards
          .slice(0, 3)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {},
      };
    }
    case "heterogeneous_pair": {
      const positiveOptions = shuffleDeterministic(
        drawContext,
        `${shapeId}:positive-pair`,
        rewardSlots(context, drawContext, `${shapeId}:positive-menu`)
          .filter((reward) => reward.effect >= 150)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
      );
      const options = positiveOptions.slice(0, 2);

      return {
        options: renumberOptions(options),
        precommitted: {},
      };
    }
    case "one_target_many_operations": {
      const targetProfile = pickLegalCardDraftProfile(
        context,
        drawContext,
        `${shapeId}:target-profile`,
        [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.lowCostCharacters,
          CARD_DRAFT_PROFILES.reclaimEvents,
          CARD_DRAFT_PROFILES.fastCharacters,
        ],
      );
      const sharedTarget = target(
        "card",
        targetProfile.targetDescription,
        cardDraftPredicate(targetProfile),
      );
      const transfiguration = pickSequentialVariant(
        drawContext,
        `${shapeId}:transfiguration`,
        ["Bronze", "Viridian", "Prismatic", "Golden"],
      );
      const operations = shuffleDeterministic(
        drawContext,
        `${shapeId}:operations`,
        [
          {
            text: `Apply {${transfiguration} Transfiguration} to ${chosenCardText()}.`,
            effects: [
              { kind: "transfiguration", transfigurationName: transfiguration },
            ],
            effect: 100,
          },
          {
            text: `Add Fast to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Fast" }],
            effect: 95,
          },
          {
            text: `Add Reclaim 1 to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Reclaim", amount: 1 }],
            effect: 95,
          },
          {
            text: `Reduce the cost of ${chosenCardText()} by 1 for the next 3 battles.`,
            effects: [
              {
                kind: "card_rewrite",
                field: "energy_cost",
                amount: -1,
                duration: BATTLE_WINDOW_DURATION,
              },
            ],
            effect: 105,
            uncertainty: -10,
          },
        ],
      ).slice(0, 3);

      return {
        options: operations.map((operation, index) =>
          option({
            number: index + 1,
            text: operation.text,
            effects: operation.effects,
            targets: [sharedTarget],
            effect: operation.effect,
            uncertainty: operation.uncertainty,
          }),
        ),
        precommitted: {},
      };
    }
    case "take_any_number": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:cache-rewards`,
      ).filter((reward) => reward.routeEffects === undefined);
      const costSlot = costSlots(
        context,
        drawContext,
        `${shapeId}:cache-costs`,
      ).find((entry) => entry.costs && entry.costs.length > 0)!;
      const burdenSlot = costSlots(
        context,
        drawContext,
        `${shapeId}:cache-burdens`,
      ).find((entry) => entry.burdens && entry.burdens.length > 0)!;

      return {
        options: [
          option({
            number: 1,
            text: `Take up to 2 rewards from this cache. ${costSlot.prefix} ${rewards[0]!.text}`,
            costs: costSlot.costs ?? [],
            effects: rewards[0]!.effects,
            targets: rewards[0]!.targets ?? [],
            cost: costSlot.cost,
            effect: rewards[0]!.effect,
          }),
          option({
            number: 2,
            text: `Take up to 2 rewards from this cache. ${burdenSlot.prefix} ${(rewards[1] ?? rewards[0])!.text}`,
            burdens: burdenSlot.burdens ?? [],
            effects: (rewards[1] ?? rewards[0])!.effects,
            targets: (rewards[1] ?? rewards[0])!.targets ?? [],
            burden: burdenSlot.burden,
            effect: (rewards[1] ?? rewards[0])!.effect,
          }),
          option({
            number: 3,
            text: "Leave the cache.",
            pickBehavior: "leave",
          }),
        ],
        precommitted: {},
      };
    }
    case "prize_ladder":
    case "probability_ladder":
    case "random_pool_draws":
    case "push_your_luck":
    case "escalating_reward_chain": {
      const filled = decisionTreeForShape(
        shapeId,
        context,
        drawContext,
        treeBuilderTools,
      );

      return {
        options: [],
        ...filled,
      };
    }
    case "mirrored_operations": {
      const targetProfile = pickLegalCardDraftProfile(
        context,
        drawContext,
        `${shapeId}:target-profile`,
        [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.lowCostCharacters,
          CARD_DRAFT_PROFILES.dissolveEvents,
        ],
      );
      const mirror = pickSequentialVariant(drawContext, `${shapeId}:mirror`, [
        "transfiguration",
        "rewrite",
        "draft",
      ] as const);

      if (mirror === "rewrite") {
        const sharedTarget = target(
          "card",
          targetProfile.targetDescription,
          cardDraftPredicate(targetProfile),
        );

        return {
          options: [
            option({
              number: 1,
              text: `Add Fast to ${chosenCardText()}.`,
              effects: [{ kind: "card_rewrite", keyword: "Fast" }],
              targets: [sharedTarget],
              effect: 95,
            }),
            option({
              number: 2,
              text: `Add Reclaim 1 to ${chosenCardText()}.`,
              effects: [
                { kind: "card_rewrite", keyword: "Reclaim", amount: 1 },
              ],
              targets: [sharedTarget],
              effect: 95,
            }),
            option({
              number: 3,
              text: `Reduce the cost of ${chosenCardText()} by 1.`,
              effects: [
                { kind: "card_rewrite", field: "energy_cost", amount: -1 },
              ],
              targets: [sharedTarget],
              effect: 95,
            }),
          ],
          precommitted: {},
        };
      }

      if (mirror === "draft") {
        const draftRewards = rewardSlots(
          context,
          drawContext,
          `${shapeId}:draft-mirror`,
        ).filter((reward) => reward.key.startsWith("draft"));
        const fallbackRewards = rewardSlots(
          context,
          drawContext,
          `${shapeId}:draft-mirror:fallback`,
        ).filter((reward) => reward.routeEffects === undefined);

        return {
          options: [...draftRewards, ...fallbackRewards]
            .filter(
              (reward, index, rewards) =>
                rewards.findIndex(
                  (candidate) => candidate.key === reward.key,
                ) === index,
            )
            .slice(0, 3)
            .map((reward, index) => rewardSlotOption(index + 1, reward)),
          precommitted: {},
        };
      }

      return {
        options: ["Bronze", "Viridian", "Golden"].map(
          (transfiguration, index) =>
            option({
              number: index + 1,
              text: `Apply {${transfiguration} Transfiguration} to ${chosenCardText()}.`,
              effects: [
                {
                  kind: "transfiguration",
                  transfigurationName: transfiguration,
                },
              ],
              targets: [
                target(
                  "card",
                  targetProfile.targetDescription,
                  cardDraftPredicate(targetProfile),
                ),
              ],
              effect: 100,
            }),
        ),
        precommitted: {},
      };
    }
    case "one_operation_many_targets": {
      const transfiguration = pickSequentialVariant(
        drawContext,
        `${shapeId}:transfiguration`,
        ["Bronze", "Viridian", "Prismatic", "Golden"],
      );
      const operation = pickSequentialVariant(
        drawContext,
        `${shapeId}:operation`,
        [
          {
            text: (targetText: string) =>
              `Apply {${transfiguration} Transfiguration} to ${targetText}.`,
            effect: {
              kind: "transfiguration",
              transfigurationName: transfiguration,
            },
            value: 100,
          },
          {
            text: (targetText: string) => `Add Fast to ${targetText}.`,
            effect: { kind: "card_rewrite", keyword: "Fast" },
            value: 95,
          },
          {
            text: (targetText: string) => `Add Reclaim 1 to ${targetText}.`,
            effect: { kind: "card_rewrite", keyword: "Reclaim", amount: 1 },
            value: 95,
          },
          {
            text: (targetText: string) => `Duplicate ${targetText}.`,
            effect: { kind: "card_duplicate" },
            value: 105,
          },
          {
            text: (targetText: string) =>
              `Reduce the cost of ${targetText} by 1.`,
            effect: { kind: "card_rewrite", field: "energy_cost", amount: -1 },
            value: 95,
          },
        ],
      );
      const targetEntries = shuffleDeterministic(
        drawContext,
        `${shapeId}:target-order`,
        [
          {
            text: chosenCardText(),
            target: target("card", CARD_POOL_TARGET_DESCRIPTION, {
              source: "draftPool",
              tideOverlap: "selected",
            }),
          },
          {
            text: "a chosen Starter card",
            target: target("card", "Starter cards in deck", {
              source: "deck",
              starter: true,
            }),
          },
          {
            text: "a chosen card in your deck",
            target: target("card", "cards in deck", { source: "deck" }),
          },
        ],
      );

      return {
        options: targetEntries.map((entry, index) =>
          option({
            number: index + 1,
            text: operation.text(entry.text),
            effects: [operation.effect],
            targets: [entry.target],
            effect: operation.value,
          }),
        ),
        precommitted: {},
      };
    }
    case "choose_your_loss": {
      const baneName = pickSequentialVariant(
        drawContext,
        `${shapeId}:bane-name`,
        ["Nightmare", "Despair", "Envy", "Silence", "Paranoia"] as const,
      );
      const omenLoss = valueOmenLoss(1);
      const baneLoss = valueBaneGain(baneName, 1);
      const essenceLoss = comparableEssenceLossAmount(
        [
          ...(context.state.quest.resources.omens >= 1 ? [omenLoss] : []),
          baneLoss,
        ],
        context.state.quest.resources.essence,
      );
      const options: JourneyOption[] = [];

      if (essenceLoss !== null) {
        options.push(
          option({
            number: options.length + 1,
            text: `Pay ${essenceLoss} essence.`,
            costs: [cost("essence", essenceLoss)],
            cost: essenceLoss,
          }),
        );
      }

      if (context.state.quest.resources.omens >= 1) {
        options.push(
          option({
            number: options.length + 1,
            text: "Lose 1 omen.",
            costs: [cost("omens", 1)],
            cost: Math.abs(omenLoss),
          }),
        );
      }

      options.push(
        option({
          number: options.length + 1,
          text: `Gain 1 ${baneName}.`,
          burdens: [{ kind: "bane_gain", baneName, count: 1 }],
          burden: baneLoss,
        }),
      );

      return {
        options: renumberOptions(
          shuffleDeterministic(drawContext, `${shapeId}:loss-order`, options),
        ),
        precommitted: {},
      };
    }
    case "single_reward":
      return {
        options: renumberOptions(
          shuffleDeterministic(
            drawContext,
            `${shapeId}:single-reward-options`,
            commonPositiveOptions(
              context,
              drawContext,
              `${shapeId}:positive-menu`,
            ),
          ).slice(0, 2),
        ),
        precommitted: {},
      };
    case "single_offer": {
      const reward = rewardSlots(
        context,
        drawContext,
        `${shapeId}:offer-reward`,
      ).filter((entry) => entry.routeEffects === undefined)[0]!;
      const costSlot = costSlots(
        context,
        drawContext,
        `${shapeId}:offer-cost`,
      )[0]!;

      return {
        options: [
          costedRewardOption(1, costSlot, reward),
          option({
            number: 2,
            text: "Leave with no effect.",
            pickBehavior: "leave",
          }),
        ],
        precommitted: {},
      };
    }
    case "risk_or_skip": {
      const reward = rewardSlots(
        context,
        drawContext,
        `${shapeId}:risk-reward`,
      ).filter((entry) => entry.routeEffects === undefined)[0]!;
      const downsideChancePercent = pickSequentialVariant(
        drawContext,
        `${shapeId}:downside-chance`,
        [35, 50, 65],
      );
      const downsideKind = pickSequentialVariant(
        drawContext,
        `${shapeId}:downside-kind`,
        ["nightmare", "omen", "essence"] as const,
      );
      const roll = drawInt(drawContext, "risk-or-skip-downside-roll:1", 1, 100);
      const downside =
        downsideKind === "omen" && context.state.quest.resources.omens >= 1
          ? { kind: "omen_loss", amount: 1 }
          : downsideKind === "essence"
            ? {
                kind: "essence_loss",
                amount: Math.min(60, context.state.quest.resources.essence),
              }
            : nightmare(1);
      const downsideValue =
        downsideKind === "omen" && context.state.quest.resources.omens >= 1
          ? valueOmenLoss(1)
          : downsideKind === "essence"
            ? -Math.min(60, context.state.quest.resources.essence)
            : valueBaneGain("Nightmare", 1);

      return {
        options: [
          option({
            number: 1,
            text: `${reward.text} ${downsideChancePercent}% chance to ${
              downsideKind === "omen" &&
              context.state.quest.resources.omens >= 1
                ? "lose 1 omen"
                : downsideKind === "essence"
                  ? `lose ${Math.min(60, context.state.quest.resources.essence)} essence`
                  : "gain 1 Nightmare"
            }; otherwise no downside.`,
            effects: reward.effects,
            targets: reward.targets ?? [],
            effect: reward.effect,
            uncertainty: Math.round(
              downsideValue * (downsideChancePercent / 100),
            ),
          }),
          option({
            number: 2,
            text: "Leave with no effect.",
            pickBehavior: "leave",
          }),
        ],
        precommitted: {
          random: [
            {
              kind: "risk_downside_roll",
              optionNumber: 1,
              odds: odds(downsideChancePercent),
              downside,
              safe: { kind: "no_downside" },
              committedResult:
                roll <= downsideChancePercent ? "downside" : "safe",
              presentation: "visible_odds_debug_roll",
            },
          ],
        },
      };
    }
    case "single_wager": {
      const wagerRewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:wager-rewards`,
      ).filter((entry) => entry.routeEffects === undefined);
      const firstReward = wagerRewards[0]!;
      const secondReward = wagerRewards[1] ?? wagerRewards[0]!;
      const firstSuccessPercent = pickSequentialVariant(
        drawContext,
        `${shapeId}:first-odds`,
        [45, 50, 55],
      );
      const firstSuccessReward = firstReward.effects;
      const firstRoll = drawInt(drawContext, "single-wager-roll:1", 1, 100);
      const firstCommittedResult =
        firstRoll <= firstSuccessPercent ? "success" : "failure";
      const secondPrice = Math.min(50, context.state.quest.resources.essence);
      const secondSuccessPercent = pickSequentialVariant(
        drawContext,
        `${shapeId}:second-odds`,
        [60, 65, 70],
      );
      const secondSuccessReward = secondReward.effects;
      const secondRoll = drawInt(drawContext, "single-wager-roll:2", 1, 100);
      const secondCommittedResult =
        secondRoll <= secondSuccessPercent ? "success" : "failure";

      return {
        options: [
          option({
            number: 1,
            text: `Pay ${payablePrice} essence. ${firstSuccessPercent}% chance to ${lowerFirst(firstReward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
            costs: [cost("essence", payablePrice)],
            effects: [
              {
                kind: "random_reward",
                table: "wager",
                odds: odds(firstSuccessPercent),
              },
            ],
            cost: payablePrice,
            effect: Math.round(
              firstReward.effect * (firstSuccessPercent / 100),
            ),
            uncertainty: -12,
          }),
          option({
            number: 2,
            text: `Pay ${secondPrice} essence. ${secondSuccessPercent}% chance to ${lowerFirst(secondReward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
            costs: [cost("essence", secondPrice)],
            effects: [
              {
                kind: "random_reward",
                table: "wager",
                odds: odds(secondSuccessPercent),
              },
            ],
            cost: secondPrice,
            effect: Math.round(
              secondReward.effect * (secondSuccessPercent / 100),
            ),
            uncertainty: -16,
          }),
        ],
        precommitted: {
          random: [
            {
              kind: "wager_roll",
              optionNumber: 1,
              odds: odds(firstSuccessPercent),
              success: firstSuccessReward,
              failure: { kind: "no_reward" },
              roll: firstRoll,
              committedResult: firstCommittedResult,
              presentation: "visible_odds_debug_roll",
            },
            {
              kind: "wager_roll",
              optionNumber: 2,
              odds: odds(secondSuccessPercent),
              success: secondSuccessReward,
              failure: { kind: "no_reward" },
              roll: secondRoll,
              committedResult: secondCommittedResult,
              presentation: "visible_odds_debug_roll",
            },
          ],
        },
      };
    }
    case "now_vs_later": {
      const reward = rewardSlots(
        context,
        drawContext,
        `${shapeId}:reward`,
      ).filter((entry) => entry.routeEffects === undefined)[0]!;
      const immediateReward = {
        ...reward,
        text: reward.key === "essence" ? "Gain 100 essence." : reward.text,
        effects: reward.key === "essence" ? [gainEssence(100)] : reward.effects,
        effect:
          reward.key === "essence"
            ? 100
            : Math.max(120, Math.round(reward.effect * 0.65)),
      };
      const timing = timingSlots(drawContext, `${shapeId}:timing`).find(
        (entry) =>
          entry.key === "two-dreamscapes" || entry.key === "next-dreamscape",
      )!;
      const delayedReward = {
        ...reward,
        effect: Math.round(
          reward.effect * (timing.key === "two-dreamscapes" ? 2.6 : 1.45),
        ),
      };
      const delayedHook = delayedRewardHookFill({
        shapeId,
        optionNumber: 2,
        timing,
        reward: delayedReward,
      });

      return {
        options: [rewardSlotOption(1, immediateReward), delayedHook.option],
        precommitted: {
          delayed: [delayedHook.precommit],
        },
      };
    }
    case "reward_after_trigger": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:trigger-rewards`,
      ).filter((entry) => entry.routeEffects === undefined);
      const timings = timingSlots(drawContext, `${shapeId}:timing`).filter(
        (entry) => entry.key === "next-battle" || entry.key === "next-victory",
      );
      const firstTiming = timings[0]!;
      const secondTiming = timings[1] ?? timings[0]!;
      const firstHook = delayedRewardHookFill({
        shapeId,
        optionNumber: 1,
        timing: firstTiming,
        reward: rewards[0]!,
      });
      const secondHook = delayedRewardHookFill({
        shapeId,
        optionNumber: 2,
        timing: secondTiming,
        reward: rewards[1] ?? rewards[0]!,
      });

      return {
        options: [firstHook.option, secondHook.option],
        precommitted: {
          delayed: [firstHook.precommit, secondHook.precommit],
        },
      };
    }
    case "paired_return": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:return-rewards`,
      ).filter((entry) => entry.routeEffects === undefined);
      const timing = timingSlots(drawContext, `${shapeId}:timing`).find(
        (entry) =>
          entry.key === "next-victory" || entry.key === "next-dreamscape",
      )!;

      return {
        options: [
          {
            ...delayedRewardOption(1, timing, rewards[0]!),
            text: `Commit a return hook. ${timing.text}, ${lowerFirst(rewards[0]!.text)}`,
          },
          {
            ...delayedRewardOption(2, timing, rewards[1] ?? rewards[0]!),
            text: `Commit a return hook. ${timing.text}, ${lowerFirst((rewards[1] ?? rewards[0]!).text)}`,
          },
        ],
        precommitted: {
          delayed: [
            {
              optionNumber: 1,
              trigger: timing.text.toLowerCase(),
              reward: rewards[0]!.effects,
            },
            {
              optionNumber: 2,
              trigger: timing.text.toLowerCase(),
              reward: (rewards[1] ?? rewards[0]!).effects,
            },
          ],
          pairedReturn: [
            {
              optionNumber: 1,
              anchor: `${rewards[0]!.key} return`,
              reward: rewards[0]!.effects,
            },
            {
              optionNumber: 2,
              anchor: `${(rewards[1] ?? rewards[0]!).key} return`,
              reward: (rewards[1] ?? rewards[0]!).effects,
            },
          ],
        },
      };
    }
    case "timed_window_menu": {
      const profile: { text: string; effects: unknown[]; effect: number }[] =
        pickSequentialVariant(drawContext, `${shapeId}:window-profile`, [
          [
            {
              text: "For the next 3 battles, all event cards in your deck have Fast.",
              effects: [
                {
                  kind: "card_rewrite",
                  keyword: "Fast",
                  duration: BATTLE_WINDOW_DURATION,
                  scope: "all_matching_cards_in_deck",
                  predicate: { cardType: "Event" },
                },
              ],
              effect: 175,
            },
            {
              text: "For the next 3 battles, draw 1 extra card in your opening hand.",
              effects: [
                {
                  kind: "battle_window_modifier",
                  duration: BATTLE_WINDOW_DURATION,
                  modifier: "opening_hand_cards",
                  amount: 1,
                },
              ],
              effect: 165,
            },
            {
              text: "For the next 3 battles, gain 1 extra energy on turn 1.",
              effects: [
                {
                  kind: "battle_window_modifier",
                  duration: BATTLE_WINDOW_DURATION,
                  modifier: "turn_1_energy",
                  amount: 1,
                },
              ],
              effect: 170,
            },
          ],
          [
            {
              text: "For the next 3 battles, all character cards in your deck cost 1 less on turn 1.",
              effects: [
                {
                  kind: "battle_window_modifier",
                  duration: BATTLE_WINDOW_DURATION,
                  modifier: "turn_1_character_discount",
                  amount: 1,
                },
              ],
              effect: 170,
            },
            {
              text: "For the next 3 battles, start each battle with 1 omen.",
              effects: [
                {
                  kind: "battle_window_modifier",
                  duration: BATTLE_WINDOW_DURATION,
                  modifier: "starting_omens",
                  amount: 1,
                },
              ],
              effect: 165,
            },
            {
              text: "For the next 3 battles, the first event you play each battle has Reclaim 1.",
              effects: [
                {
                  kind: "battle_window_modifier",
                  duration: BATTLE_WINDOW_DURATION,
                  modifier: "first_event_reclaim",
                  amount: 1,
                },
              ],
              effect: 175,
            },
          ],
          [
            {
              text: "For the next 3 battles, draw 1 extra card on turn 2.",
              effects: [
                {
                  kind: "battle_window_modifier",
                  duration: BATTLE_WINDOW_DURATION,
                  modifier: "turn_2_cards",
                  amount: 1,
                },
              ],
              effect: 160,
            },
            {
              text: "For the next 3 battles, all fast cards in your deck have Reclaim 1.",
              effects: [
                {
                  kind: "card_rewrite",
                  keyword: "Reclaim",
                  amount: 1,
                  duration: BATTLE_WINDOW_DURATION,
                  scope: "all_matching_cards_in_deck",
                  predicate: { isFast: true },
                },
              ],
              effect: 170,
            },
            {
              text: "For the next 3 battles, gain 1 extra energy the first time you Dissolve each battle.",
              effects: [
                {
                  kind: "battle_window_modifier",
                  duration: BATTLE_WINDOW_DURATION,
                  modifier: "first_dissolve_energy",
                  amount: 1,
                },
              ],
              effect: 175,
            },
          ],
        ]);

      return {
        options: shuffleDeterministic(
          drawContext,
          `${shapeId}:window-order`,
          profile,
        ).map((entry, index) =>
          option({
            number: index + 1,
            text: entry.text,
            effects: entry.effects,
            effect: entry.effect,
            uncertainty: -10,
          }),
        ),
        precommitted: {},
      };
    }
    case "resolved_random_series": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:series-rewards`,
      ).filter((entry) => entry.routeEffects === undefined);
      const firstSeries = rewards.slice(0, 3);
      const secondSeries = rewards.slice(2, 5);

      return {
        options: [
          option({
            number: 1,
            text: `Resolve the precommitted rewards: ${rewards
              .slice(0, 3)
              .map((reward) => lowerFirst(reward.text).replace(/\.$/u, ""))
              .join(", then ")}.`,
            effects: [{ kind: "random_series", count: 3 }],
            effect: Math.round(
              rewards
                .slice(0, 3)
                .reduce((total, reward) => total + reward.effect, 0) / 3,
            ),
            uncertainty: -12,
          }),
          option({
            number: 2,
            text: `Resolve the precommitted rewards: ${rewards
              .slice(2, 5)
              .map((reward) => lowerFirst(reward.text).replace(/\.$/u, ""))
              .join(", then ")}.`,
            effects: [{ kind: "random_series", count: 3 }],
            effect: Math.round(
              rewards
                .slice(2, 5)
                .reduce((total, reward) => total + reward.effect, 0) / 3,
            ),
            uncertainty: -12,
          }),
        ],
        precommitted: {
          random: [
            {
              kind: "resolved_random_series",
              optionNumber: 1,
              series: firstSeries.flatMap((reward) => reward.effects),
              resolved: true,
              visibilityPolicy: {
                outcomeVisibility: "resolved",
                disclosure:
                  "The random reward series is resolved and shown before choosing.",
                playerVisible: true,
              },
              expectedConvertedEssence: Math.round(
                firstSeries.reduce(
                  (total, reward) => total + reward.effect,
                  0,
                ) / firstSeries.length,
              ),
              riskPremiumConvertedEssence: -4,
            },
            {
              kind: "resolved_random_series",
              optionNumber: 2,
              series: secondSeries.flatMap((reward) => reward.effects),
              resolved: true,
              visibilityPolicy: {
                outcomeVisibility: "resolved",
                disclosure:
                  "The random reward series is resolved and shown before choosing.",
                playerVisible: true,
              },
              expectedConvertedEssence: Math.round(
                secondSeries.reduce(
                  (total, reward) => total + reward.effect,
                  0,
                ) / secondSeries.length,
              ),
              riskPremiumConvertedEssence: -4,
            },
          ],
        },
      };
    }
    case "single_random_outcome": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:random-rewards`,
      )
        .filter((entry) => entry.routeEffects === undefined)
        .slice(0, 2);

      return {
        options: rewards.map((reward, index) =>
          option({
            number: index + 1,
            text: `Gain the precommitted reward: ${lowerFirst(reward.text)}`,
            effects: [{ kind: "random_reward", table: "precommitted" }],
            effect: reward.effect,
            uncertainty: -12,
          }),
        ),
        precommitted: {
          random: rewards.map((reward, index) => ({
            kind: "random_reward",
            optionNumber: index + 1,
            reward: reward.effects,
            committedReward: reward.effects,
            visibilityPolicy: {
              outcomeVisibility: "pre_rolled",
              disclosure:
                "The random reward is pre-rolled and revealed in root option copy.",
              playerVisible: true,
            },
            expectedConvertedEssence: reward.effect,
            riskPremiumConvertedEssence: -8,
          })),
        },
      };
    }
    case "commit_now_future_payoff": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:future-rewards`,
      ).filter((entry) => entry.routeEffects === undefined);
      const timing = timingSlots(drawContext, `${shapeId}:timing`).find(
        (entry) => entry.key === "next-dreamscape",
      )!;
      const commitments = [
        costSlots(context, drawContext, `${shapeId}:commitment:1`).find(
          (entry) => entry.key === "low-essence",
        )!,
        costSlots(context, drawContext, `${shapeId}:commitment:2`).find(
          (entry) => entry.key === "nightmare",
        )!,
        costSlots(context, drawContext, `${shapeId}:commitment:3`).find(
          (entry) => entry.key === "high-essence",
        )!,
      ];
      const futureRewards = rewards.slice(0, 3).map((reward, index) => {
        const commitment = commitments[index]!;

        return {
          ...reward,
          effect: Math.round(
            175 +
              (commitment.cost ?? 0) -
              (commitment.burden ?? 0) -
              timing.uncertainty +
              index * 10,
          ),
        };
      });
      const futureHooks = futureRewards.map((reward, index) =>
        delayedRewardHookFill({
          shapeId,
          optionNumber: index + 1,
          timing,
          reward,
          optionText: `${commitments[index]!.prefix.replace(/\.$/u, "")} now. ${timing.text}, ${lowerFirst(reward.text)}`,
          costs: commitments[index]!.costs ?? [],
          burdens: commitments[index]!.burdens ?? [],
          cost: commitments[index]!.cost,
          burden: commitments[index]!.burden,
          effect: reward.effect,
          uncertainty: timing.uncertainty,
        })
      );

      return {
        options: futureHooks.map((entry) => entry.option),
        precommitted: {
          delayed: futureHooks.map((entry) => entry.precommit),
        },
      };
    }
    case "alter_dreamscapes": {
      const routeRewards = shuffleDeterministic(
        drawContext,
        `${shapeId}:routes`,
        [
          routeReplacementReward(false),
          routeReplacementReward(true),
          {
            ...routeReplacementReward(false),
            key: "current-transfiguration-route",
            text: "Replace a Draft site in the current dreamscape with a Transfiguration site.",
            routeEffects: [
              {
                kind: "current_route_replacement",
                fromSite: "Draft",
                toSite: "Transfiguration",
                timing: "current dreamscape",
                source: "simulated_manifest_only",
              },
            ],
            effect: 300,
          },
          {
            ...routeReplacementReward(true),
            key: "future-transfiguration-route",
            text: "Replace a Draft site in the next dreamscape with a Transfiguration site.",
            routeEffects: [
              {
                kind: "future_route_replacement",
                fromSite: "Draft",
                toSite: "Transfiguration",
                timing: "next dreamscape",
                source: "simulated_manifest_only",
              },
            ],
            effect: 305,
          },
        ],
      );

      return {
        options: routeRewards
          .slice(0, 2)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {
          routeEdits: routeRewards
            .slice(0, 2)
            .flatMap((reward) => reward.routeEffects ?? []),
        },
      };
    }
  }
}
