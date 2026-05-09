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
import {
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
  baneBurdenSlot,
  cardDraftPredicate,
  cardDraftText,
  chosenCardText,
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
  randomVisibility,
} from "./randomPayloads.js";
import { routeEditRewards } from "./routeEditCatalog.js";
import { sameCostDifferentRewardsFill } from "../shapes/same_cost_different_rewards/fill.js";

export { sharedBaneBurdenRewardFill } from "./shared.js";

type FlatEscalatingTradeRow = {
  price: number;
  omens: number;
};

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
    case "probability_ladder": {
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
  }

  throw new Error(`Unknown Journey shape fill: ${shapeId}`);
}
