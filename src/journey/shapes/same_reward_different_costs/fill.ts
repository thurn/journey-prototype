import { shuffleDeterministic } from "../../../util/rng.js";
import { compatibleCardOperations } from "../../fillers/cardOperationCatalog.js";
import {
  CARD_DRAFT_PROFILES,
  DREAMSIGN_POOL_TARGET_DESCRIPTION,
  GENERIC_CARD_DRAFT_PROFILE,
  baneBurdenSlot,
  cardDraftPredicate,
  cardDraftText,
  chosenCardText,
  cost,
  draftCards,
  dreamsignDraft,
  dreamsignDraftText,
  gainOmen,
  legalCardDraftProfile,
  option,
  pickLegalCardDraftProfile,
  pickSequentialVariant,
  target,
} from "../../fillers/shared.js";
import {
  valueCardDraft,
  valueDreamsignDraft,
  valueOmenGain,
  valueOmenLoss,
} from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "same_reward_different_costs";

type CostSlotEntry = {
  prefix: string;
  costs?: unknown[];
  burdens?: unknown[];
  cost?: number;
  burden?: number;
};

export function sameRewardDifferentCostsFill(
  args: ShapeFillArgs,
): FilledJourney {
  const { context, drawContext } = args;
  const payablePrice = Math.min(30, context.state.quest.resources.essence);
  const premiumPrice = Math.min(45, context.state.quest.resources.essence);
  const family = pickSequentialVariant(drawContext, `${SHAPE_LABEL}:family`, [
    "card-draft",
    "dreamsign-draft",
    "omen-cache",
    "transfiguration",
  ] as const);

  if (family === "transfiguration") {
    const transfigurationOperation = compatibleCardOperations(drawContext, {
      topology: "one_target_many_operations",
      targetClasses: ["draft_card"],
      targetModes: ["drafted_card"],
      valueBands: ["standard"],
      timings: ["immediate"],
      families: ["transfiguration"],
      context,
      stage: args.stage,
      label: `${SHAPE_LABEL}:same-reward-transfiguration`,
      count: 1,
    })[0]!;
    const targetProfile = pickLegalCardDraftProfile(
      context,
      drawContext,
      `${SHAPE_LABEL}:same-reward-transfiguration-target`,
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
      {
        selection: "chosen_after_commitment",
        cardOperationTargetMode: "drafted_card",
      },
    );
    const sharedOmenBonus = pickSequentialVariant(
      drawContext,
      `${SHAPE_LABEL}:same-reward-transfiguration-omen-bonus`,
      [3, 4, 5],
    );
    const sharedReward = {
      text: `${transfigurationOperation.renderText(chosenCardText())} Gain ${sharedOmenBonus} omens.`,
      effects: [
        transfigurationOperation.effect,
        gainOmen(sharedOmenBonus),
      ],
      effect: transfigurationOperation.value + valueOmenGain(sharedOmenBonus),
    };
    const costs: CostSlotEntry[] = [
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
        ...baneBurdenSlot(
          drawContext,
          `${SHAPE_LABEL}:same-reward-transfiguration-bane-cost`,
        ),
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
      `${SHAPE_LABEL}:dreamsign-choice-order`,
      [2, 3, 4],
    );
    const dreamsignCosts: CostSlotEntry[] = [
      {
        prefix: `Pay ${Math.min(pickSequentialVariant(drawContext, `${SHAPE_LABEL}:dreamsign-price`, [10, 15, 20]), context.state.quest.resources.essence)} essence.`,
        costs: [
          cost(
            "essence",
            Math.min(
              pickSequentialVariant(
                drawContext,
                `${SHAPE_LABEL}:dreamsign-price`,
                [10, 15, 20],
              ),
              context.state.quest.resources.essence,
            ),
          ),
        ],
        cost: Math.min(
          pickSequentialVariant(
            drawContext,
            `${SHAPE_LABEL}:dreamsign-price`,
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
        ...baneBurdenSlot(
          drawContext,
          `${SHAPE_LABEL}:dreamsign-draft-bane-cost`,
        ),
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
      `${SHAPE_LABEL}:omen-amount-order`,
      [3, 4, 5],
    );
    const omenCost =
      context.state.quest.resources.omens >= 1
        ? cost("omens", 1)
        : cost("essence", payablePrice);
    const options: (CostSlotEntry & { amount: number })[] = [
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
        ...baneBurdenSlot(drawContext, `${SHAPE_LABEL}:omen-cache-bane-cost`),
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
    `${SHAPE_LABEL}:card-profiles`,
    [
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.reclaimEvents,
      CARD_DRAFT_PROFILES.dissolveEvents,
      CARD_DRAFT_PROFILES.fastCharacters,
      CARD_DRAFT_PROFILES.discardTextCards,
      CARD_DRAFT_PROFILES.abandonCards,
      CARD_DRAFT_PROFILES.eventCopyingCards,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.legendaryCards,
      CARD_DRAFT_PROFILES.costOneCards,
      CARD_DRAFT_PROFILES.cheapCards,
      CARD_DRAFT_PROFILES.duplicateCards,
      CARD_DRAFT_PROFILES.multiAbilityCards,
      CARD_DRAFT_PROFILES.allEligibleCards,
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
