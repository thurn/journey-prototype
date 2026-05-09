import type { JourneyContext } from "../../quest/context.js";
import {
  drawInt,
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../../util/rng.js";
import { decisionTreeForShape, odds } from "./treeBuilders.js";
import {
  cardOperationTargetModeForClass,
  compatibleCardOperations,
  renderChosenCardOperationText,
  type CardOperationTargetClass,
} from "./cardOperationCatalog.js";
import {
  compatibleDreamsignOperations,
  renderChosenDreamsignOperationText,
} from "./dreamsignOperationCatalog.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
  selectContentBackedDreamsign,
} from "./dreamsignPayloads.js";
import {
  cardExactTarget,
  contentBackedCardCandidates,
} from "./namedCardPayloads.js";
import type {
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  JourneySymmetryContractDebug,
  JourneyTree,
  PrecommittedOutcomes,
} from "../manifest.js";
import { type JourneyShapeId } from "../shapes.js";
import { BANE_NAMES, type BaneName } from "../effects.js";
import {
  valueBaneBurden,
  valueBaneGain,
  valueCardDraft,
  valueDreamsignDraft,
  valueDreamsignOperation,
  valueOmenGain,
  valueOmenLoss,
  valueStarterCleanup,
} from "../value.js";
import {
  CARD_DRAFT_PROFILES,
  CARD_POOL_TARGET_DESCRIPTION,
  DREAMSIGN_POOL_TARGET_DESCRIPTION,
  GENERIC_CARD_DRAFT_PROFILE,
  baneBurden,
  baneBurdenSlot,
  baneNameText,
  cardDraftPredicate,
  cardDraftText,
  chosenCardText,
  commonPositiveOptions,
  comparableEssenceLossAmount,
  compoundPayloadMenuFill,
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
  option,
  optionFromResolvedShapeFill,
  pickLegalCardDraftProfile,
  pickSequentialVariant,
  renumberOptions,
  type ResolvedShapeFill,
  rewardSlotOption,
  rewardSlots,
  starterCleanup,
  starterSurgeryRewardSlots,
  symmetryContract,
  target,
  timingSlots,
  treeBuilderTools,
} from "./shared.js";
import {
  delayedHookFillFromExpanded,
  delayedRewardHookFill,
  expandedDelayedHookFills,
  pairedReturnHookFill,
} from "./hookPayloads.js";
import {
  namedDreamsignRiskReward,
  randomBaneChanceEnvelope,
  randomRiskCostEnvelope,
  randomVisibility,
  revealChoiceMenuOptions,
  revealChoiceOptions,
  wheelRootOptions,
} from "./randomPayloads.js";
import { routeEditMenuRewards, routeEditRewards } from "./routeEditCatalog.js";
import { timedWindowMenuFill } from "./timedWindowPayloads.js";

type FlatEscalatingTradeRow = {
  price: number;
  omens: number;
};

const CHOOSE_YOUR_LOSS_BANE_COUNTS = {
  early: [1],
  mid: [1, 2],
  late: [1, 2, 2],
} as const satisfies Record<JourneyStage, readonly number[]>;

function chooseYourLossBaneCandidates(
  count: number,
  includeOmenLoss: boolean,
): readonly BaneName[] {
  if (count === 1 && !includeOmenLoss) {
    return BANE_NAMES;
  }

  const maximumSingleBaneMagnitude = count === 1 ? 130 : 110;
  const standardBanes = BANE_NAMES.filter(
    (baneName) =>
      Math.abs(valueBaneGain(baneName, 1)) <= maximumSingleBaneMagnitude,
  );

  return standardBanes.length > 0 ? standardBanes : BANE_NAMES;
}

const FLAT_ESCALATING_TRADE_PROFILES = {
  early: [
    [
      { price: 15, omens: 1 },
      { price: 35, omens: 2 },
      { price: 60, omens: 3 },
    ],
    [
      { price: 20, omens: 1 },
      { price: 40, omens: 2 },
      { price: 70, omens: 3 },
    ],
  ],
  mid: [
    [
      { price: 20, omens: 1 },
      { price: 45, omens: 2 },
      { price: 80, omens: 3 },
    ],
    [
      { price: 25, omens: 1 },
      { price: 55, omens: 2 },
      { price: 90, omens: 3 },
    ],
  ],
  late: [
    [
      { price: 30, omens: 1 },
      { price: 60, omens: 2 },
      { price: 95, omens: 3 },
    ],
    [
      { price: 35, omens: 1 },
      { price: 70, omens: 2 },
      { price: 110, omens: 3 },
    ],
  ],
} as const satisfies Record<JourneyStage, readonly (readonly FlatEscalatingTradeRow[])[]>;

function namedDeckCardTargetEntries(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  count: number;
}): {
  targetClass: CardOperationTargetClass;
  text: string;
  target: ReturnType<typeof cardExactTarget>;
  key: string;
}[] {
  const candidates = contentBackedCardCandidates({
    context: args.context,
    stage: "mid",
    sources: ["deck"],
    includeStarters: true,
  });
  const uniqueByCardId = candidates.filter(
    (candidate, index, entries) =>
      entries.findIndex((entry) => entry.card.id === candidate.card.id) === index,
  );

  return shuffleDeterministic(
    args.drawContext,
    `${args.label}:named-deck-targets`,
    uniqueByCardId,
  )
    .slice(0, args.count)
    .map((candidate) => ({
      targetClass: "deck_card",
      text: `{${candidate.card.name}}`,
      target: cardExactTarget(
        candidate.card,
        "deck",
        `${candidate.card.name} in current deck`,
      ),
      key: candidate.card.id,
    }));
}

export function sharedBaneBurdenRewardFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}): {
  options: JourneyOption[];
  symmetryContracts: JourneySymmetryContractDebug[];
} | undefined {
  const sharedBane = baneBurdenSlot(args.drawContext, `${args.label}:shared-bane`, 1);
  const dreamsign = selectContentBackedDreamsign({
    context: args.context,
    drawContext: args.drawContext,
    label: `${args.label}:dreamsign`,
    stage: args.stage,
    sources: ["pool", "catalog"],
  });

  if (!dreamsign) {
    return undefined;
  }

  const draftProfile = pickLegalCardDraftProfile(
    args.context,
    args.drawContext,
    `${args.label}:card-draft`,
    [
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.allEligibleCards,
    ],
  );
  const cardDraft = draftCards(draftProfile);
  const routeReward = routeEditRewards({
    drawContext: args.drawContext,
    label: `${args.label}:route`,
    count: 1,
    operationKinds: ["add_site"],
    scopes: ["current_dreamscape"],
    polarities: ["positive"],
  })[0]!;
  const dreamsignPayload = namedDreamsignPayload(
    {
      kind: "dreamsign_gain",
      dreamsign: dreamsign.dreamsign,
      source: dreamsign.source,
      extra: {
        targetOrigin: dreamsign.targetOrigin,
        selectionWeight: dreamsign.weight,
        weightHooks: dreamsign.weightHooks,
      },
    },
    args.context,
  );
  const rewards = [
    {
      key: `named-dreamsign:${dreamsign.dreamsign.id}`,
      text: `Gain {${dreamsign.dreamsign.name}}.`,
      effects: [dreamsignPayload],
      targets: [dreamsignExactTarget(dreamsign.dreamsign, dreamsign.source)],
      routeEffects: [],
      effect: Math.max(320, valueDreamsignOperation("gain", {
        tideOverlap: dreamsign.weightHooks.tideOverlap > 0,
      })),
    },
    {
      key: `card-draft:${draftProfile.label}`,
      text: cardDraftText(draftProfile),
      effects: [cardDraft],
      targets: [
        target("card", draftProfile.targetDescription, cardDraft.predicate),
      ],
      routeEffects: [],
      effect: Math.max(320, valueCardDraft(cardDraft)),
    },
    {
      key: routeReward.key,
      text: routeReward.text,
      effects: [],
      targets: [],
      routeEffects: [routeReward.payload],
      effect: Math.max(320, routeReward.effect),
    },
  ];
  const options = rewards.map((reward, index) =>
    option({
      number: index + 1,
      text: `${sharedBane.prefix} ${reward.text}`,
      burdens: sharedBane.burdens,
      effects: reward.effects,
      targets: reward.targets,
      routeEffects: reward.routeEffects,
      burden: sharedBane.burden,
      effect: reward.effect,
    })
  );

  return {
    options,
    symmetryContracts: [
      symmetryContract({
        contractKind: "shared_burden_different_rewards",
        sharedProperty: `${sharedBane.baneName} Bane burden`,
        variedProperty: "Dreamsign, card draft, and route reward families",
        sharedFirst: true,
        optionNumbers: options.map((entry) => entry.number),
        sharedPayloadKeys: [sharedBane.key],
        variedPayloadKeys: rewards.map((reward) => reward.key),
        weight: 1,
      }),
    ],
  };
}

export function sharedStarterCleanupRewardFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}): {
  options: JourneyOption[];
  symmetryContracts: JourneySymmetryContractDebug[];
} | undefined {
  if (args.context.state.quest.deck.summary.starterCards < 1) {
    return undefined;
  }

  const cleanup = starterCleanup(1);
  const cleanupTarget = target("card", "Starter cards in deck", {
    source: "deck",
    starter: true,
  });
  const rewards = rewardSlots(
    args.context,
    args.drawContext,
    `${args.label}:followups`,
    args.stage,
  )
    .filter((reward) =>
      reward.routeEffects === undefined &&
      !reward.key.startsWith("starter-cleanup")
    )
    .slice(0, 3);

  if (rewards.length < 3) {
    return undefined;
  }

  const options = rewards.map((reward, index) =>
    option({
      number: index + 1,
      text: `Purge up to 1 chosen Starter card. ${reward.text}`,
      effects: [cleanup, ...reward.effects],
      targets: [cleanupTarget, ...(reward.targets ?? [])],
      triggers: reward.triggers ?? [],
      burden: 0,
      effect: valueStarterCleanup({ count: 1, stage: args.stage }) + reward.effect,
      uncertainty: reward.uncertainty,
    })
  );

  return {
    options,
    symmetryContracts: [
      symmetryContract({
        contractKind: "shared_cleanup_followup_rewards",
        sharedProperty: "starter cleanup prerequisite",
        variedProperty: "follow-up reward family",
        sharedFirst: true,
        optionNumbers: options.map((entry) => entry.number),
        sharedPayloadKeys: ["starter-cleanup:chosen-up-to-1"],
        variedPayloadKeys: rewards.map((reward) => reward.key),
        weight: 1,
      }),
    ],
  };
}

export function fillOptions(
  shapeId: JourneyShapeId,
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): {
  options: JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  precommitted: PrecommittedOutcomes;
  symmetryContracts?: JourneySymmetryContractDebug[];
} {
  const payablePrice = Math.min(30, context.state.quest.resources.essence);
  const premiumPrice = Math.min(45, context.state.quest.resources.essence);

  switch (shapeId) {
    case "same_cost_different_rewards": {
      const contractVariant = weightedChoice(
        drawContext,
        `${shapeId}:symmetric-contract`,
        [
          { item: "shared_cost", weight: 4 },
          { item: "shared_bane_burden", weight: 1 },
        ] as const,
      );

      if (contractVariant === "shared_bane_burden") {
        const sharedBaneFill = sharedBaneBurdenRewardFill({
          context,
          drawContext,
          label: shapeId,
          stage,
        });

        if (sharedBaneFill) {
          return {
            options: sharedBaneFill.options,
            precommitted: {
              routeEdits: sharedBaneFill.options.flatMap(
                (journeyOption) => journeyOption.routeEffects,
              ),
            },
            symmetryContracts: sharedBaneFill.symmetryContracts,
          };
        }
      }

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
        symmetryContracts: [
          symmetryContract({
            contractKind: "shared_cost_different_rewards",
            sharedProperty: sharedCost.key,
            variedProperty: "reward family",
            sharedFirst: true,
            optionNumbers: [1, 2, 3],
            sharedPayloadKeys: [sharedCost.key],
            variedPayloadKeys: rewards.slice(0, 3).map((reward) => reward.key),
            weight: 4,
          }),
        ],
      };
    }
    case "service_menu": {
      const starterRewards = starterSurgeryRewardSlots(
        context,
        drawContext,
        `${shapeId}:starter-services`,
        stage,
      ).filter((reward) => reward.effect >= 140);
      const serviceFamily = weightedChoice(
        drawContext,
        `${shapeId}:service-family`,
        [
          { item: "compound_payload", weight: 2 },
          { item: "starter_cleanup_prefix", weight: 1 },
          { item: "starter_surgery", weight: 2 },
          { item: "general", weight: 5 },
        ] as const,
      );
      const compoundFill = serviceFamily === "compound_payload"
        ? compoundPayloadMenuFill({
            context,
            drawContext,
            label: `${shapeId}:compound`,
            shapeId,
            stage,
          })
        : undefined;
      const cleanupPrefixFill = serviceFamily === "starter_cleanup_prefix"
        ? sharedStarterCleanupRewardFill({
            context,
            drawContext,
            label: shapeId,
            stage,
          })
        : undefined;

      if (compoundFill) {
        return {
          options: compoundFill.options.map((fill) =>
            optionFromResolvedShapeFill(fill),
          ),
          precommitted: {
            routeEdits: compoundFill.options.flatMap((fill) =>
              fill.routeEffects ?? []
            ),
          },
        };
      }

      if (cleanupPrefixFill) {
        return {
          options: cleanupPrefixFill.options,
          precommitted: {},
          symmetryContracts: cleanupPrefixFill.symmetryContracts,
        };
      }

      const rewards =
        serviceFamily === "starter_surgery" && starterRewards.length >= 3
          ? starterRewards
          : rewardSlots(context, drawContext, `${shapeId}:services`).filter(
              (reward) => reward.effect >= 140,
            );

      return {
        options: rewards
          .slice(0, 3)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {},
      };
    }
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
    case "one_target_many_operations": {
      const focus = weightedChoice(
        drawContext,
        `${shapeId}:focus`,
        [
          { item: "card", weight: 4 },
          { item: "named_card", weight: 1 },
          {
            item: "dreamsign",
            weight: context.state.quest.dreamsignPoolIds.length > 0 ? 2 : 0,
          },
        ] as const,
      );

      if (focus === "dreamsign" && context.state.quest.dreamsignPoolIds.length > 0) {
        const sharedTarget = target(
          "dreamsign",
          DREAMSIGN_POOL_TARGET_DESCRIPTION,
          { source: "pool", tideOverlap: "selected" },
          {
            selection: "chosen_after_commitment",
            dreamsignOperationTargetMode: "chosen",
          },
        );
        const operations = compatibleDreamsignOperations(drawContext, {
          topology: "one_target_many_operations",
          targetSources: ["pool"],
          targetModes: ["chosen"],
          families: ["transform", "duplicate", "purge", "pool_edit"],
          context,
          stage,
          label: `${shapeId}:dreamsign-operations`,
          count: 3,
        });

        return {
          options: operations.map((operation, index) =>
            option({
              number: index + 1,
              text: renderChosenDreamsignOperationText(operation),
              costs: operation.costs ?? [],
              effects: [operation.effect],
              targets: [sharedTarget, ...operation.targets],
              cost: operation.cost,
              effect: 320,
            }),
          ),
          precommitted: {},
        };
      }

      if (focus === "named_card") {
        const sharedTargetEntry = namedDeckCardTargetEntries({
          context,
          drawContext,
          label: shapeId,
          count: 1,
        })[0];

        if (sharedTargetEntry) {
          const operations = compatibleCardOperations(drawContext, {
            topology: "one_target_many_operations",
            targetClasses: ["deck_card"],
            targetModes: ["exact_named"],
            families: ["transfiguration"],
            valueBands: ["standard"],
            timings: ["immediate"],
            context,
            stage,
            label: `${shapeId}:named-target-transfigurations`,
            count: 3,
          });

          return {
            options: operations.map((operation, index) =>
              option({
                number: index + 1,
                text: operation.renderText(sharedTargetEntry.text),
                effects: [operation.effect],
                targets: [sharedTargetEntry.target],
                effect: 140,
                uncertainty: operation.uncertainty,
              }),
            ),
            precommitted: {},
            symmetryContracts: [
              symmetryContract({
                contractKind: "shared_target_operations",
                sharedProperty: sharedTargetEntry.key,
                variedProperty: "transfiguration operation",
                sharedFirst: true,
                optionNumbers: [1, 2, 3],
                sharedPayloadKeys: [sharedTargetEntry.key],
                variedPayloadKeys: operations.map((operation) => operation.key),
                weight: 1,
              }),
            ],
          };
        }
      }

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
        {
          selection: "chosen_after_commitment",
          cardOperationTargetMode: "drafted_card",
        },
      );
      const operations = compatibleCardOperations(drawContext, {
        topology: "one_target_many_operations",
        targetClasses: ["draft_card"],
        targetModes: ["drafted_card"],
        valueBands: ["standard", "temporary"],
        timings: ["immediate", "battle_window"],
        context,
        stage,
        label: `${shapeId}:operations`,
        count: 3,
      });
      const cardOperationBane = baneBurdenSlot(
        drawContext,
        `${shapeId}:card-operation-bane`,
      );

      return {
        options: operations.map((operation, index) => {
          const burden = index === 2 ? cardOperationBane : undefined;

          return option({
            number: index + 1,
            text: `${burden ? `${burden.prefix} ` : ""}${renderChosenCardOperationText(operation)}`,
            effects: [operation.effect],
            burdens: burden?.burdens ?? [],
            targets: [sharedTarget],
            effect: operation.value,
            burden: burden?.burden,
            uncertainty: operation.uncertainty,
          });
        }),
        precommitted: {},
      };
    }
    case "probability_ladder":
    case "random_pool_draws":
    case "push_your_luck": {
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
          CARD_DRAFT_PROFILES.discardTextCards,
          CARD_DRAFT_PROFILES.abandonCards,
          CARD_DRAFT_PROFILES.eventCopyingCards,
          CARD_DRAFT_PROFILES.energyGenerationCards,
          CARD_DRAFT_PROFILES.multiAbilityCards,
        ],
      );
      const mirror = pickSequentialVariant(drawContext, `${shapeId}:mirror`, [
        "transfiguration",
        "rewrite",
        "draft",
        "dreamsign",
      ] as const);

      if (mirror === "dreamsign" && context.state.quest.dreamsignPoolIds.length > 0) {
        const operations = compatibleDreamsignOperations(drawContext, {
          topology: "mirrored_operations",
          targetSources: ["pool", "catalog"],
          targetModes: ["exact_named"],
          families: [
            "gain",
            "copy_gain",
            "pool_edit",
            "random_reward",
            "trigger_counter",
          ],
          context,
          stage,
          label: `${shapeId}:dreamsign-operations`,
          count: 3,
        });

        return {
          options: operations.map((operation, index) =>
            option({
              number: index + 1,
              text: renderChosenDreamsignOperationText(operation),
              costs: operation.costs ?? [],
              effects: [operation.effect],
              targets: operation.targets,
              cost: operation.cost,
              effect: 320,
            }),
          ),
          precommitted: {},
        };
      }

      if (mirror === "rewrite") {
        const sharedTarget = target(
          "card",
          targetProfile.targetDescription,
          cardDraftPredicate(targetProfile),
          {
            selection: "chosen_after_commitment",
            cardOperationTargetMode: "drafted_card",
          },
        );
        const operations = compatibleCardOperations(drawContext, {
          topology: "mirrored_operations",
          targetClasses: ["draft_card"],
          targetModes: ["drafted_card"],
          families: ["keyword", "cost", "text"],
          valueBands: ["standard"],
          timings: ["immediate"],
          context,
          stage,
          label: `${shapeId}:rewrite-operations`,
          count: 3,
        });

        return {
          options: operations.map((operation, index) =>
            option({
              number: index + 1,
              text: renderChosenCardOperationText(operation),
              effects: [operation.effect],
              targets: [sharedTarget],
              effect: operation.value,
              uncertainty: operation.uncertainty,
            }),
          ),
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

      const operations = compatibleCardOperations(drawContext, {
        topology: "mirrored_operations",
        targetClasses: ["draft_card"],
        targetModes: ["drafted_card"],
        families: ["transfiguration"],
        valueBands: ["standard"],
        timings: ["immediate"],
        context,
        stage,
        label: `${shapeId}:transfiguration-operations`,
        count: 3,
      });

      return {
        options: operations.map((operation, index) =>
          option({
            number: index + 1,
            text: renderChosenCardOperationText(operation),
            effects: [operation.effect],
            targets: [
              target(
                "card",
                targetProfile.targetDescription,
                cardDraftPredicate(targetProfile),
                {
                  selection: "chosen_after_commitment",
                  cardOperationTargetMode: "drafted_card",
                },
              ),
            ],
            effect: operation.value,
          }),
        ),
        precommitted: {},
      };
    }
    case "one_operation_many_targets": {
      const targetContract = weightedChoice(
        drawContext,
        `${shapeId}:target-contract`,
        [
          { item: "generic_target_classes", weight: 4 },
          { item: "named_card_targets", weight: 1 },
        ] as const,
      );

      if (targetContract === "named_card_targets") {
        const targetEntries = namedDeckCardTargetEntries({
          context,
          drawContext,
          label: shapeId,
          count: 3,
        });

        if (targetEntries.length >= 3) {
          const operation = compatibleCardOperations(drawContext, {
            topology: "one_operation_many_targets",
            targetClasses: ["deck_card"],
            targetModes: ["exact_named"],
            families: ["transfiguration"],
            valueBands: ["standard"],
            timings: ["immediate"],
            context,
            stage,
            label: `${shapeId}:named-target-operation`,
            count: 1,
          })[0]!;

          return {
            options: targetEntries.map((entry, index) =>
              option({
                number: index + 1,
                text: operation.renderText(entry.text),
                effects: [operation.effect],
                targets: [entry.target],
                effect: operation.value,
                uncertainty: operation.uncertainty,
              }),
            ),
            precommitted: {},
            symmetryContracts: [
              symmetryContract({
                contractKind: "shared_operation_named_targets",
                sharedProperty: operation.key,
                variedProperty: "visible named card target",
                sharedFirst: true,
                optionNumbers: [1, 2, 3],
                sharedPayloadKeys: [operation.key],
                variedPayloadKeys: targetEntries.map((entry) => entry.key),
                weight: 1,
              }),
            ],
          };
        }
      }

      const targetEntries = shuffleDeterministic(
        drawContext,
        `${shapeId}:target-order`,
        [
          {
            targetClass: "draft_card",
            text: chosenCardText(),
            target: target("card", CARD_POOL_TARGET_DESCRIPTION, {
              source: "draftPool",
              tideOverlap: "selected",
            }, {
              selection: "chosen_after_commitment",
              cardOperationTargetMode: "drafted_card",
            }),
          },
          {
            targetClass: "starter_card",
            text: "a chosen Starter card",
            target: target("card", "Starter cards in deck", {
              source: "deck",
              starter: true,
            }, {
              selection: "chosen_after_commitment",
              cardOperationTargetMode: "chosen",
            }),
          },
          {
            targetClass: "deck_card",
            text: "a chosen card in your deck",
            target: target("card", "cards in deck", { source: "deck" }, {
              selection: "chosen_after_commitment",
              cardOperationTargetMode: "chosen",
            }),
          },
        ] satisfies {
          targetClass: CardOperationTargetClass;
          text: string;
          target: ReturnType<typeof target>;
        }[],
      );
      const requestedTargetClasses = targetEntries.map(
        (entry) => entry.targetClass,
      );
      const operation = compatibleCardOperations(drawContext, {
        topology: "one_operation_many_targets",
        targetClasses: requestedTargetClasses,
        targetModes: requestedTargetClasses.map(cardOperationTargetModeForClass),
        valueBands: ["standard", "premium"],
        timings: ["immediate"],
        context,
        stage,
        label: `${shapeId}:operation`,
        count: 1,
      })[0]!;
      const targetFill = {
        fillKind: "one_operation_many_targets",
        sharedPayloadSpecs: [
          {
            role: "reward",
            key: operation.key,
            family: operation.family,
            payloads: [operation.effect],
          },
        ],
        options: targetEntries.map((entry, index) => ({
          number: index + 1,
          textParts: [
            {
              source: "operation_payload",
              text: operation.renderText(entry.text),
            },
          ],
          payloadSpecs: [
            {
              role: "reward",
              key: operation.key,
              family: operation.family,
              payloads: [operation.effect],
            },
            {
              role: "target",
              payloads: [entry.target],
            },
          ],
          effects: [operation.effect],
          targetSelectors: [entry.target],
          timings: [
            {
              key: operation.timing,
              label: operation.timing,
            },
          ],
          valueEstimate: {
            effect: operation.value,
            uncertainty: operation.uncertainty,
          },
        })),
      } satisfies ResolvedShapeFill;

      return {
        options: targetFill.options.map((fill) =>
          optionFromResolvedShapeFill(fill),
        ),
        precommitted: {},
        symmetryContracts: [
          symmetryContract({
            contractKind: "shared_operation_named_targets",
            sharedProperty: operation.key,
            variedProperty: "target selector class",
            sharedFirst: true,
            optionNumbers: targetFill.options.map((fill) => fill.number),
            sharedPayloadKeys: [operation.key],
            variedPayloadKeys: targetEntries.map((entry) => entry.targetClass),
            weight: 4,
          }),
        ],
      };
    }
    case "choose_your_loss": {
      const includeOmenLoss = context.state.quest.resources.omens >= 1;
      const baneCount = pickSequentialVariant(
        drawContext,
        `${shapeId}:bane-count`,
        CHOOSE_YOUR_LOSS_BANE_COUNTS[stage],
      );
      const baneName = pickSequentialVariant(
        drawContext,
        `${shapeId}:bane-name`,
        chooseYourLossBaneCandidates(baneCount, includeOmenLoss),
      );
      const omenLoss = valueOmenLoss(1);
      const baneLoss = valueBaneBurden({ baneName, count: baneCount });
      const essenceLoss = comparableEssenceLossAmount(
        [
          ...(includeOmenLoss ? [omenLoss] : []),
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

      if (includeOmenLoss && baneCount === 1) {
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
          text: `Gain ${baneNameText(baneName, baneCount)}.`,
          burdens: [baneBurden(baneName, baneCount)],
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
    case "risk_or_skip": {
      const reward = namedDreamsignRiskReward({
        context,
        drawContext,
        label: `${shapeId}:risk-reward`,
        stage,
      });
      const downsideChancePercent = pickSequentialVariant(
        drawContext,
        `${shapeId}:downside-chance`,
        [25, 35, 45, 50, 65, 75],
      );
      const downsideKind = pickSequentialVariant(
        drawContext,
        `${shapeId}:downside-kind`,
        ["bane", "random_cost"] as const,
      );
      const riskConstraint = {
        constraintKind: "shape_invariant" as const,
        shapeId,
        ruleId: "risk_or_skip_bounded_downside" as const,
        label: "The accept option has one bounded random downside and the leave option stays safe.",
      };
      const downside = downsideKind === "bane"
        ? randomBaneChanceEnvelope({
            drawContext,
            label: `${shapeId}:risk-bane`,
            optionNumber: 1,
            chancePercent: downsideChancePercent,
          })
        : randomRiskCostEnvelope({
            context,
            drawContext,
            label: `${shapeId}:risk-cost`,
            optionNumber: 1,
            chancePercent: downsideChancePercent,
          });
      const riskEnvelope = {
        ...downside.envelope,
        constraints: [riskConstraint],
      };

      return {
        options: [
          option({
            number: 1,
            text: `${reward.text} ${downsideChancePercent}% chance to ${downside.text}; otherwise no downside.`,
            effects: reward.payloads,
            targets: reward.targets ?? [],
            effect: reward.value,
            uncertainty: downside.value,
          }),
          option({
            number: 2,
            text: "Leave with no effect.",
            pickBehavior: "leave",
          }),
        ],
        precommitted: {
          random: [riskEnvelope],
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
      const wagerConstraint = {
        constraintKind: "shape_invariant" as const,
        shapeId,
        ruleId: "single_wager_known_stake" as const,
        label: "The stake, odds, success reward, and failure outcome are visible before commitment.",
      };
      const firstWagerEnvelope = {
        kind: "wager" as const,
        optionNumber: 1,
        odds: odds(firstSuccessPercent),
        stake: cost("essence", payablePrice),
        success: firstSuccessReward,
        failure: { kind: "no_reward" },
        roll: firstRoll,
        committedResult: firstCommittedResult,
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "The wager odds, stake, success, and failure are visible; the roll is precommitted.",
          true,
        ),
        expectedConvertedEssence:
          Math.round(firstReward.effect * (firstSuccessPercent / 100)) -
          payablePrice,
        riskPremiumConvertedEssence: -12,
        constraints: [wagerConstraint],
        presentation: "visible_odds_debug_roll",
      };
      const secondWagerEnvelope = {
        kind: "wager" as const,
        optionNumber: 2,
        odds: odds(secondSuccessPercent),
        stake: cost("essence", secondPrice),
        success: secondSuccessReward,
        failure: { kind: "no_reward" },
        roll: secondRoll,
        committedResult: secondCommittedResult,
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "The wager odds, stake, success, and failure are visible; the roll is precommitted.",
          true,
        ),
        expectedConvertedEssence:
          Math.round(secondReward.effect * (secondSuccessPercent / 100)) -
          secondPrice,
        riskPremiumConvertedEssence: -16,
        constraints: [wagerConstraint],
        presentation: "visible_odds_debug_roll",
      };

      return {
        options: [
          option({
            number: 1,
            text: `Pay ${payablePrice} essence. ${firstSuccessPercent}% chance to ${lowerFirst(firstReward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
            costs: [cost("essence", payablePrice)],
            effects: [
              {
                kind: "wager",
                odds: odds(firstSuccessPercent),
                stake: cost("essence", payablePrice),
                success: firstSuccessReward,
                failure: { kind: "no_reward" },
                visibilityPolicy: randomVisibility(
                  "visible",
                  "The wager odds, stake, success, and failure are visible before choosing.",
                  true,
                ),
                constraints: [wagerConstraint],
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
                kind: "wager",
                odds: odds(secondSuccessPercent),
                stake: cost("essence", secondPrice),
                success: secondSuccessReward,
                failure: { kind: "no_reward" },
                visibilityPolicy: randomVisibility(
                  "visible",
                  "The wager odds, stake, success, and failure are visible before choosing.",
                  true,
                ),
                constraints: [wagerConstraint],
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
          random: [firstWagerEnvelope, secondWagerEnvelope],
        },
      };
    }
    case "paired_return": {
      const rewards = rewardSlots(
        context,
        drawContext,
        `${shapeId}:return-rewards`,
      ).filter((entry) => entry.routeEffects === undefined);
      const firstReturn = pairedReturnHookFill({
        context,
        drawContext,
        shapeId,
        optionNumber: 1,
        reward: rewards[0]!,
        stage,
      });
      const secondReturn = pairedReturnHookFill({
        context,
        drawContext,
        shapeId,
        optionNumber: 2,
        reward: rewards[1] ?? rewards[0]!,
        stage,
      });
      const thirdReturn = pairedReturnHookFill({
        context,
        drawContext,
        shapeId,
        optionNumber: 3,
        reward: rewards[2] ?? rewards[1] ?? rewards[0]!,
        stage,
      });

      return {
        options: [firstReturn.option, secondReturn.option, thirdReturn.option],
        precommitted: {
          delayed: [
            firstReturn.precommit,
            secondReturn.precommit,
            thirdReturn.precommit,
          ],
          pairedReturn: [
            firstReturn.precommit,
            secondReturn.precommit,
            thirdReturn.precommit,
          ],
        },
      };
    }
    case "flat_escalating_trade": {
      const tradeProfiles: readonly (readonly FlatEscalatingTradeRow[])[] =
        FLAT_ESCALATING_TRADE_PROFILES[stage];
      const tradeRows = shuffleDeterministic(
        drawContext,
        `${shapeId}:trade-profile:${stage}`,
        tradeProfiles,
      )[0]!;

      return {
        options: tradeRows.map((row, index) => {
          const { price, omens } = row;

          return option({
            number: index + 1,
            text: `Pay ${price} essence. Gain ${omens} ${omens === 1 ? "omen" : "omens"}.`,
            costs: [{ ...cost("essence", price), escalationTier: `tier_${index + 1}` }],
            effects: [{ ...gainOmen(omens), escalationTier: `tier_${index + 1}` }],
            cost: price,
            effect: valueOmenGain(omens),
          });
        }),
        precommitted: {},
        symmetryContracts: [
          symmetryContract({
            contractKind: "flat_escalating_trade",
            sharedProperty: "essence-for-omens trade family",
            variedProperty: "strictly increasing price and omen reward",
            sharedFirst: true,
            optionNumbers: [1, 2, 3],
            sharedPayloadKeys: ["resource-cost:essence", "resource-reward:omens"],
            variedPayloadKeys: tradeRows.map((row) =>
              `essence:${row.price}->omens:${row.omens}`
            ),
            weight: 3,
          }),
        ],
      };
    }
    case "timed_window_menu": {
      const timedWindow = timedWindowMenuFill({ context, drawContext, shapeId });

      return {
        options: timedWindow.options,
        precommitted: timedWindow.routeEdits.length > 0
          ? { routeEdits: timedWindow.routeEdits }
          : {},
        symmetryContracts: timedWindow.symmetryContracts,
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
      const family = pickSequentialVariant(
        drawContext,
        `${shapeId}:random-family`,
        ["reveal_choice", "visible_wheel"] as const,
      );

      if (family === "visible_wheel") {
        const wheel = wheelRootOptions({
          context,
          drawContext,
          label: `${shapeId}:wheel`,
          stage,
        });

        return {
          options: wheel.options,
          rewardPool: wheel.rewardPool,
          precommitted: {
            random: wheel.precommitted,
          },
        };
      }

      const reveal = revealChoiceOptions({
        context,
        drawContext,
        label: `${shapeId}:reveal`,
        stage,
      });

      return {
        options: reveal.options,
        precommitted: {
          random: reveal.precommitted,
        },
      };
    }
    case "reveal_choice_menu": {
      const reveal = revealChoiceMenuOptions({
        context,
        drawContext,
        label: `${shapeId}:reveal`,
        stage,
      });

      return {
        options: reveal.options,
        precommitted: {
          random: reveal.precommitted,
        },
      };
    }
    case "alter_dreamscapes": {
      const routeMenu = routeEditMenuRewards({
        drawContext,
        label: `${shapeId}:routes`,
      });
      const routeBane = baneBurdenSlot(
        drawContext,
        `${shapeId}:route-bane`,
        1,
      );
      const companionCardOperation = compatibleCardOperations(drawContext, {
        topology: "one_operation_many_targets",
        targetClasses: ["deck_card"],
        targetModes: [cardOperationTargetModeForClass("deck_card")],
        valueBands: ["standard"],
        timings: ["immediate"],
        context,
        stage,
        label: `${shapeId}:route-card-operation`,
        count: 1,
      })[0]!;
      const companionCardTarget = target(
        "card",
        chosenCardText(),
        { source: "deck" },
        {
          selection: "chosen_after_commitment",
          cardOperationTargetMode: "chosen",
        },
      );
      const routeOptions = routeMenu.rewards.map((reward, index) => {
        const effects: unknown[] = [];
        const targets: unknown[] = [];
        let text = reward.text;
        let effect = reward.effect;
        let burden = 0;
        let burdens: unknown[] = [];

        if (reward.companion === "small_essence_reward") {
          const amount = 45;

          text = `${text} Gain ${amount} essence.`;
          effects.push(gainEssence(amount));
          effect += amount;
        } else if (reward.companion === "small_omen_reward") {
          const amount = 1;

          text = `${text} Gain ${amount} omen.`;
          effects.push(gainOmen(amount));
          effect += valueOmenGain(amount);
        } else if (reward.companion === "bane_burden") {
          const compensation = Math.max(
            45,
            Math.min(
              90,
              Math.round(Math.abs(routeBane.burden) * 0.7 / 5) * 5,
            ),
          );

          text = `${routeBane.prefix} ${text}`;
          text = `${text} Gain ${compensation} essence.`;
          effects.push(gainEssence(compensation));
          effect += compensation;
          burdens = routeBane.burdens;
          burden = routeBane.burden;
        } else if (reward.companion === "card_operation") {
          text = `${text} ${renderChosenCardOperationText(companionCardOperation)}`;
          effects.push(companionCardOperation.effect);
          targets.push(companionCardTarget);
          effect += companionCardOperation.value;
        }

        return option({
          number: index + 1,
          text,
          effects,
          burdens,
          targets,
          routeEffects: [reward.payload],
          burden,
          effect,
          uncertainty: reward.companion === "card_operation"
            ? companionCardOperation.uncertainty
            : undefined,
        });
      });

      return {
        options: routeOptions,
        precommitted: {
          routeEdits: routeOptions
            .flatMap((reward) => reward.routeEffects ?? []),
        },
        symmetryContracts: [
          symmetryContract({
            contractKind: "shared_source_site_destinations",
            sharedProperty: routeMenu.sharedProperty,
            variedProperty: "route destination or companion payload",
            sharedFirst: true,
            optionNumbers: routeOptions.map((entry) => entry.number),
            sharedPayloadKeys: [routeMenu.variantId],
            variedPayloadKeys: routeMenu.rewards.map((reward) => reward.key),
            weight: 1,
          }),
        ],
      };
    }
  }

  throw new Error(`Unknown Journey shape fill: ${shapeId}`);
}
