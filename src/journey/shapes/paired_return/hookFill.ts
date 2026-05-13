import type { DreamsignContent } from "../../../content/model.js";
import type { JourneyContext } from "../../../quest/context.js";
import {
  drawInt,
  shuffleDeterministic,
  type DrawContext,
} from "../../../util/rng.js";
import { BANE_NAMES } from "../../effects.js";
import type { JourneyOption } from "../../manifest.js";
import type { JourneyShapeId } from "../../shapes.js";
import {
  valueBaneBurden,
  valueBanePurge,
  valueCardDraft,
  valueDreamsignOperation,
} from "../../value.js";
import { baneGainPayload, banePurgePayload } from "../../fillers/banePayloads.js";
import {
  boundedDuration,
  controlledScene,
  expiration,
  hookTrigger,
  hookVisibility,
} from "../../fillers/hookPayloads.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
} from "../../fillers/dreamsignPayloads.js";
import { catalogRewardCards, namedCardPayload } from "../../fillers/namedCardPayloads.js";
import { routeEditRewards } from "../../fillers/routeEditCatalog.js";
import {
  GENERIC_CARD_DRAFT_PROFILE,
  baneTarget,
  cost,
  draftCards,
  gainEssence,
  lowerFirst,
  option,
  selectedDreamsignTargets,
  target,
} from "../../fillers/shared.js";
import { battleWindowText, type HookStage } from "../../fillers/hookResolutions.js";
import { tradeTicketBody } from "./tradeTicket.js";

function normalizedHookId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function pairedReturnTradeRewardText(reward: { text: string }): string {
  return lowerFirst(reward.text).replace(/\.$/u, "");
}

function namedDreamsignGrant(
  context: JourneyContext,
  dreamsign: DreamsignContent,
  timing = "immediate",
): Record<string, unknown> {
  return namedDreamsignPayload(
    {
      kind: "dreamsign_gain",
      dreamsign,
      source: "catalog",
      extra: { timing },
    },
    context,
  );
}

function afterBattleWindowText(count: number): string {
  return count === 1 ? "after next battle" : `after ${count} battles`;
}

function sentenceStart(text: string): string {
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

function temporaryCardsText(count: number): string {
  return count === 1 ? "the temporary card" : "both temporary cards";
}
type PairedReturnFamilyId =
  | "sealed_card"
  | "sealed_dreamsign"
  | "borrowed_dreamsign"
  | "borrowed_card_draft"
  | "future_named_object_trade"
  | "return_for_resource"
  | "return_for_card_operation"
  | "return_for_route_edit";

type BorrowedDreamsignLoanProfile = {
  battleWindow: number;
  essenceCost: number;
  loanValue: number;
};

type BorrowedCardDraftLoanProfile = {
  battleWindow: number;
  takeCount: number;
  obligationValue: number;
};

const BORROWED_DREAMSIGN_LOAN_BANDS = {
  early: [
    { battleWindow: 1, essenceCost: 80, loanValue: 65 },
    { battleWindow: 2, essenceCost: 100, loanValue: 95 },
  ],
  mid: [
    { battleWindow: 2, essenceCost: 90, loanValue: 90 },
    { battleWindow: 3, essenceCost: 120, loanValue: 120 },
  ],
  late: [
    { battleWindow: 2, essenceCost: 110, loanValue: 100 },
    { battleWindow: 3, essenceCost: 140, loanValue: 130 },
  ],
} as const satisfies Record<HookStage, readonly BorrowedDreamsignLoanProfile[]>;

const BORROWED_CARD_DRAFT_LOAN_BANDS = {
  early: [
    { battleWindow: 1, takeCount: 1, obligationValue: -30 },
    { battleWindow: 2, takeCount: 2, obligationValue: -60 },
  ],
  mid: [
    { battleWindow: 2, takeCount: 1, obligationValue: -35 },
    { battleWindow: 3, takeCount: 2, obligationValue: -65 },
  ],
  late: [
    { battleWindow: 2, takeCount: 2, obligationValue: -60 },
    { battleWindow: 3, takeCount: 2, obligationValue: -70 },
  ],
} as const satisfies Record<HookStage, readonly BorrowedCardDraftLoanProfile[]>;

export function pairedReturnContract(args: {
  pairedReturnId: string;
  optionNumber: number;
  anchor: string;
  created: Record<string, unknown>;
  returnScene: Record<string, unknown>;
  futureCost?: unknown | unknown[];
  returnReward?: unknown | unknown[];
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
}): Record<string, unknown> {
  const futureCost = args.futureCost ?? [];
  const returnReward = args.returnReward ?? args.reward;
  const returnScene: Record<string, unknown> = {
    ...args.returnScene,
    referencesAnchor: args.anchor,
    futureCost,
    returnReward,
  };

  return {
    kind: "paired_return_contract",
    pairedReturnId: args.pairedReturnId,
    hookId: args.pairedReturnId,
    optionNumber: args.optionNumber,
    anchor: args.anchor,
    created: args.created,
    returnScene,
    futureCost,
    returnReward,
    trigger: String(
      (returnScene.triggerSelector as Record<string, unknown> | undefined)
        ?.label ?? "committed return",
    ).toLowerCase(),
    triggerSelector: returnScene.triggerSelector,
    trackedCondition: `Track return scene for ${args.anchor}.`,
    resolution:
      typeof returnScene.resolution === "string"
        ? returnScene.resolution
        : `Resolve ${args.anchor}.`,
    expiration: returnScene.expiration,
    duration: returnScene.duration,
    controlledScene: controlledScene("return", args.anchor),
    visibilityPolicy:
      args.visibilityPolicy ??
      hookVisibility("visible", "The return scene is shown before choosing."),
    reward: returnReward,
    hookBudgetCost: 1,
  };
}

function pairedReturnFamilies(
  drawContext: DrawContext,
  label: string,
): PairedReturnFamilyId[] {
  const rowPlans: readonly (readonly PairedReturnFamilyId[])[] = [
    ["sealed_dreamsign", "return_for_resource", "return_for_card_operation"],
    ["borrowed_dreamsign", "borrowed_dreamsign", "borrowed_card_draft"],
    ["future_named_object_trade", "future_named_object_trade", "return_for_route_edit"],
    ["sealed_card", "sealed_dreamsign", "future_named_object_trade"],
    ["return_for_resource", "return_for_card_operation", "return_for_route_edit"],
  ];

  return [
    ...shuffleDeterministic(drawContext, `${label}:row-plans`, rowPlans)[0]!,
  ];
}

type PairedReturnReward = {
  key: string;
  text: string;
  payloads: unknown[];
  targets?: unknown[];
  effect: number;
  uncertainty?: number;
};

function pairedReturnReward(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  shapeId: JourneyShapeId,
  stage: HookStage,
  rewardKind: "resource" | "card_purge" | "card_duplicate" | "dreamsign" | "route" | "bane",
): PairedReturnReward {
  const dreamsigns = selectedDreamsignTargets(context, drawContext);
  const dreamsign = dreamsigns[0] ?? context.content.dreamsigns[0]!;

  if (rewardKind === "resource") {
    const amount = shuffleDeterministic(
      drawContext,
      `${label}:return-resource-amount`,
      [90, 120, 150],
    )[0]!;

    return {
      key: `return-resource:essence-${amount}`,
      text: `gain ${amount} essence`,
      payloads: [gainEssence(amount)],
      effect: amount,
    };
  }

  if (rewardKind === "card_purge") {
    const payload = {
      kind: "card_purge",
      cardOperationKind: "purge",
      selection: "chosen_after_commitment",
      source: "deck",
      count: 1,
      timing: "return scene",
    };

    return {
      key: "return-card-operation:purge",
      text: "purge a chosen card",
      payloads: [payload],
      targets: [target("card", "a chosen card in deck", { source: "deck" })],
      effect: 90,
    };
  }

  if (rewardKind === "card_duplicate") {
    const payload = {
      kind: "card_duplicate",
      cardOperationKind: "duplicate",
      selection: "chosen_after_commitment",
      source: "deck",
      count: 1,
      copyCount: 1,
      timing: "return scene",
    };

    return {
      key: "return-card-operation:duplicate",
      text: "duplicate a chosen card",
      payloads: [payload],
      targets: [target("card", "a chosen card in deck", { source: "deck" })],
      effect: 115,
    };
  }

  if (rewardKind === "dreamsign") {
    return {
      key: `return-dreamsign:${dreamsign.id}`,
      text: `gain {${dreamsign.name}}`,
      payloads: [
        namedDreamsignPayload(
          {
            kind: "dreamsign_gain",
            dreamsign,
            source: "pool",
            extra: { timing: "return scene" },
          },
          context,
        ),
      ],
      targets: [dreamsignExactTarget(dreamsign, "pool")],
      effect: valueDreamsignOperation("gain", { tideOverlap: false }),
    };
  }

  if (rewardKind === "route") {
    const routeReward = routeEditRewards({
      drawContext,
      label: `${label}:return-route`,
      count: 1,
      operationKinds: ["add_site"],
      scopes: ["current_dreamscape"],
      polarities: ["positive"],
    })[0]!;

    return {
      key: `return-route:${routeReward.key}`,
      text: lowerFirst(routeReward.text).replace(/\.$/u, ""),
      payloads: [routeReward.payload],
      effect: routeReward.effect,
    };
  }

  if (rewardKind === "bane") {
    const baneName = shuffleDeterministic(
      drawContext,
      `${label}:return-bane`,
      BANE_NAMES,
    )[0]!;

    return {
      key: `return-bane:purge-${normalizedHookId(baneName)}`,
      text: `purge a chosen {${baneName}} obligation`,
      payloads: [
        banePurgePayload({
          baneName,
          targetContext: "manifest_obligation",
          selection: "chosen_after_commitment",
        }),
      ],
      targets: [
        baneTarget(
          `manifest-local ${baneName} obligation`,
          [baneName],
          "manifest_obligation",
        ),
      ],
      effect: valueBanePurge({
        baneName,
        targetContext: "manifest_obligation",
        selection: "chosen_after_commitment",
      }),
    };
  }

  return pairedReturnReward(context, drawContext, label, shapeId, stage, "dreamsign");
}

function returnRewardKindFor(
  family: PairedReturnFamilyId,
  optionNumber: number,
): Parameters<typeof pairedReturnReward>[5] {
  if (family === "return_for_resource") {
    return "resource";
  }

  if (family === "return_for_card_operation") {
    return optionNumber % 2 === 0 ? "card_purge" : "card_duplicate";
  }

  if (family === "return_for_route_edit") {
    return "route";
  }

  if (family === "future_named_object_trade") {
    return optionNumber % 3 === 1
      ? "resource"
      : optionNumber % 3 === 2
        ? "card_duplicate"
        : "route";
  }

  if (family === "borrowed_dreamsign") {
    return optionNumber % 2 === 0 ? "dreamsign" : "resource";
  }

  if (family === "borrowed_card_draft") {
    return "bane";
  }

  if (family === "sealed_card") {
    return "dreamsign";
  }

  return optionNumber % 3 === 1
    ? "resource"
    : optionNumber % 3 === 2
      ? "card_purge"
      : "card_duplicate";
}

export function pairedReturnHookFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: string;
  optionNumber: number;
  familyId?: PairedReturnFamilyId;
  stage?: HookStage;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const cards = catalogRewardCards(args.context, args.drawContext);
  const visibleCards = cards.filter((card) => !/\btides?\b/iu.test(card.name));
  const fallbackVisibleCard =
    args.context.content.cards.find((card) => !/\btides?\b/iu.test(card.name)) ??
    args.context.content.cards[0]!;
  const cardA =
    visibleCards[(args.optionNumber - 1) % Math.max(visibleCards.length, 1)] ??
    fallbackVisibleCard;
  const cardB = visibleCards[args.optionNumber % Math.max(visibleCards.length, 1)] ??
    visibleCards.find((card) => card.id !== cardA.id) ??
    cardA;
  const dreamsigns = [
    ...selectedDreamsignTargets(args.context, args.drawContext),
    ...shuffleDeterministic(
      args.drawContext,
      `${args.shapeId}:${args.optionNumber}:return-dreamsign-fallbacks`,
      args.context.content.dreamsigns,
    ),
  ].filter(
    (dreamsign, index, entries) =>
      entries.findIndex((entry) => entry.id === dreamsign.id) === index,
  );
  const dreamsignAt = (offset: number): DreamsignContent =>
    dreamsigns[
      (args.optionNumber - 1 + offset) % Math.max(dreamsigns.length, 1)
    ] ?? args.context.content.dreamsigns[0]!;
  const sealedDreamsign = dreamsignAt(0);
  const borrowedDreamsign = dreamsignAt(1);
  const tradeDreamsign = dreamsignAt(2);
  const receiveDreamsign = dreamsignAt(3).id === tradeDreamsign.id
    ? sealedDreamsign
    : dreamsignAt(3);
  const family = args.familyId ??
    pairedReturnFamilies(
      args.drawContext,
      `${args.shapeId}:return-family-order`,
    )[(args.optionNumber - 1) % 3]!;
  const reward = pairedReturnReward(
    args.context,
    args.drawContext,
    `${args.shapeId}:${args.optionNumber}:${family}`,
    args.shapeId,
    args.stage ?? "mid",
    returnRewardKindFor(family, args.optionNumber),
  );
  const rewardPayload = reward.payloads.length === 1
    ? reward.payloads[0]!
    : reward.payloads;
  const pairedReturnId = normalizedHookId(
    `${args.shapeId}-${args.optionNumber}-${family}-${reward.key}`,
  );
  const expectedValue = Math.max(120, reward.effect);

  if (
    family === "sealed_dreamsign" ||
    family === "return_for_resource" ||
    family === "return_for_card_operation"
  ) {
    const createdId = `${pairedReturnId}-sealed-dreamsign`;
    const recoverPayload = namedDreamsignPayload(
      {
        kind: "dreamsign_gain",
        dreamsign: sealedDreamsign,
        source: "catalog",
        extra: { timing: "return scene", recoveredSealedObject: true },
      },
      args.context,
    );
    const returnReward = [recoverPayload, ...reward.payloads];
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${sealedDreamsign.name} sealed Dreamsign`,
        created: {
          referenceKind: "sealed_object",
          referenceId: createdId,
          label: `Seal {${sealedDreamsign.name}} until the return scene.`,
          objectKind: "dreamsign",
          dreamsignId: sealedDreamsign.id,
          dreamsignName: sealedDreamsign.name,
          statusScope: "quest",
        },
        returnScene: {
          returnSceneKind: "sealed_object_return",
          triggerSelector: hookTrigger({
            triggerKind: "future_dream_journey",
            label: "at the next Dream Journey site",
            count: 1,
          }),
          referencesCreatedId: createdId,
          resolution: `Recover {${sealedDreamsign.name}} and ${reward.text}.`,
          expiration: expiration(
            "return_unchanged",
            "If no Dream Journey site appears within 2 dreamscapes, recover the sealed Dreamsign with no extra reward.",
          ),
          duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
        },
        futureCost: [],
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence: expectedValue,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Seal {${sealedDreamsign.name}}. At the next Dream Journey site, recover it and ${reward.text}; if the 2-dreamscape window expires, recover it unchanged.`,
        triggers: [precommit],
        effects: reward.payloads,
        targets: [
          dreamsignExactTarget(sealedDreamsign, "catalog"),
          ...(reward.targets ?? []),
        ],
        effect: expectedValue,
        uncertainty: reward.uncertainty ?? -10,
      }),
      precommit,
    };
  }

  if (family === "sealed_card") {
    const createdId = `${pairedReturnId}-sealed-card`;
    const transformedCard = namedCardPayload(
      {
        kind: "card_transform",
        target: cardA,
        result: cardB,
        source: "catalog",
        extra: { timing: "return scene" },
      },
      args.context,
    );
    const returnReward = [transformedCard, ...reward.payloads];
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${cardA.name} sealed card`,
        created: {
          referenceKind: "sealed_object",
          referenceId: createdId,
          label: `Seal {${cardA.name}} until the next Dream Journey site.`,
          objectKind: "card",
          cardId: cardA.id,
          cardName: cardA.name,
          statusScope: "quest",
        },
        returnScene: {
          returnSceneKind: "sealed_object_return",
          triggerSelector: hookTrigger({
            triggerKind: "future_dream_journey",
            label: "at the next Dream Journey site",
            count: 1,
          }),
          referencesCreatedId: createdId,
          resolution: `Return {${cardA.name}} as {${cardB.name}} and ${reward.text}.`,
          expiration: expiration(
            "return_unchanged",
            "If no Dream Journey site appears within 2 dreamscapes, return the sealed card unchanged.",
          ),
          duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
        },
        futureCost: [],
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence: expectedValue + 40,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Seal {${cardA.name}} until the next Dream Journey site. Return it as {${cardB.name}} and ${reward.text}, or return it unchanged if the 2-dreamscape window expires.`,
        triggers: [precommit],
        effects: reward.payloads,
        targets: [
          target("card", `${cardA.name} in catalog`, {
            source: "catalog",
            ids: [cardA.id],
            names: [cardA.name],
          }),
          target("card", `${cardB.name} in catalog`, {
            source: "catalog",
            ids: [cardB.id],
            names: [cardB.name],
          }),
          ...(reward.targets ?? []),
        ],
        effect: expectedValue + 40,
        uncertainty: reward.uncertainty ?? -10,
      }),
      precommit,
    };
  }

  if (family === "borrowed_dreamsign") {
    const loanProfiles: readonly BorrowedDreamsignLoanProfile[] =
      BORROWED_DREAMSIGN_LOAN_BANDS[args.stage ?? "mid"];
    const loanProfile = shuffleDeterministic(
      args.drawContext,
      `${pairedReturnId}:borrowed-dreamsign-loan-profile`,
      loanProfiles,
    )[0]!;
    const battleWindow = battleWindowText(loanProfile.battleWindow);
    const afterWindow = afterBattleWindowText(loanProfile.battleWindow);
    const afterWindowSentence = sentenceStart(afterWindow);
    const futureBaneName = shuffleDeterministic(
      args.drawContext,
      `${pairedReturnId}:borrowed-dreamsign-future-bane`,
      BANE_NAMES,
    )[0]!;
    const createdId = `${pairedReturnId}-borrowed-dreamsign`;
    const temporaryGrant = namedDreamsignPayload(
      {
        kind: "dreamsign_temporary_grant",
        dreamsign: borrowedDreamsign,
        source: "catalog",
        extra: { temporary: true, duration: battleWindow },
      },
      args.context,
    );
    const futureCost = args.optionNumber % 2 === 0
      ? [
          namedDreamsignPayload(
            {
              kind: "dreamsign_loss",
              dreamsign: borrowedDreamsign,
              source: "catalog",
              extra: { timing: afterWindow, temporary: true },
            },
            args.context,
          ),
          baneGainPayload({
            baneName: futureBaneName,
            targetContext: "future_burden",
            timing: afterWindow,
          }),
        ]
      : [
          namedDreamsignPayload(
            {
              kind: "dreamsign_loss",
              dreamsign: borrowedDreamsign,
              source: "catalog",
              extra: { timing: afterWindow, temporary: true },
            },
            args.context,
          ),
          cost("essence", loanProfile.essenceCost),
        ];
    const futureCostValue = args.optionNumber % 2 === 0
      ? valueBaneBurden({ baneName: futureBaneName, count: 1, delayed: true })
      : -loanProfile.essenceCost;
    const returnReward = rewardPayload;
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${borrowedDreamsign.name} borrowed Dreamsign`,
        created: {
          referenceKind: "borrowed_object",
          referenceId: createdId,
          label: `Borrow {${borrowedDreamsign.name}} for the ${battleWindow}.`,
          objectKind: "dreamsign",
          dreamsignId: borrowedDreamsign.id,
          dreamsignName: borrowedDreamsign.name,
        },
        returnScene: {
          returnSceneKind: "borrowed_object_return",
          triggerSelector: hookTrigger({
            triggerKind: "each_battle",
            label: afterWindow,
            count: loanProfile.battleWindow,
          }),
          referencesCreatedId: createdId,
          resolution: `Lose {${borrowedDreamsign.name}}, pay the return cost, then ${reward.text}.`,
          expiration: expiration(
            "pay_cost",
            `If the borrowed Dreamsign is not returned ${afterWindow}, apply the committed return cost.`,
          ),
          duration: boundedDuration("battle_count", battleWindow, loanProfile.battleWindow),
        },
        futureCost,
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence: expectedValue + futureCostValue + loanProfile.loanValue,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Borrow {${borrowedDreamsign.name}} for the ${battleWindow}. ${afterWindowSentence}, lose it, pay the return cost, then ${reward.text}.`,
        triggers: [precommit],
        effects: [temporaryGrant],
        targets: [
          dreamsignExactTarget(borrowedDreamsign, "catalog"),
          ...(reward.targets ?? []),
        ],
        effect: expectedValue + futureCostValue + loanProfile.loanValue,
        uncertainty: reward.uncertainty ?? -15,
      }),
      precommit,
    };
  }

  if (family === "borrowed_card_draft") {
    const loanProfiles: readonly BorrowedCardDraftLoanProfile[] =
      BORROWED_CARD_DRAFT_LOAN_BANDS[args.stage ?? "mid"];
    const loanProfile = shuffleDeterministic(
      args.drawContext,
      `${pairedReturnId}:borrowed-card-draft-loan-profile`,
      loanProfiles,
    )[0]!;
    const battleWindow = battleWindowText(loanProfile.battleWindow);
    const afterWindow = afterBattleWindowText(loanProfile.battleWindow);
    const afterWindowSentence = sentenceStart(afterWindow);
    const createdId = `${pairedReturnId}-borrowed-card-draft`;
    const temporaryDraft = draftCards(GENERIC_CARD_DRAFT_PROFILE, {
      takeCount: loanProfile.takeCount,
      temporary: true,
    });
    const futureCost = [{
      kind: "card_purge",
      cardOperationKind: "purge",
      selection: "temporary_drafted_cards",
      source: "temporary_manifest_grant",
      count: loanProfile.takeCount,
      timing: afterWindow,
    }];
    const returnReward = rewardPayload;
    const expectedDraftValue = valueCardDraft(temporaryDraft);
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: "borrowed temporary card draft",
        created: {
          referenceKind: "borrowed_object",
          referenceId: createdId,
          label: `Draft ${loanProfile.takeCount} temporary card${loanProfile.takeCount === 1 ? "" : "s"} for the ${battleWindow}.`,
          objectKind: "card",
          statusScope: "quest",
        },
        returnScene: {
          returnSceneKind: "borrowed_object_return",
          triggerSelector: hookTrigger({
            triggerKind: "each_battle",
            label: afterWindow,
            count: loanProfile.battleWindow,
          }),
          referencesCreatedId: createdId,
          resolution: `Purge ${temporaryCardsText(loanProfile.takeCount)}, then ${reward.text}.`,
          expiration: expiration(
            "pay_cost",
            `If ${temporaryCardsText(loanProfile.takeCount)} cannot be purged ${afterWindow}, keep the purge obligation.`,
          ),
          duration: boundedDuration("battle_count", battleWindow, loanProfile.battleWindow),
        },
        futureCost,
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence:
          expectedValue + expectedDraftValue + loanProfile.obligationValue,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Draft ${loanProfile.takeCount} of 4 cards for the ${battleWindow}. ${afterWindowSentence}, purge ${temporaryCardsText(loanProfile.takeCount)}, then ${reward.text}.`,
        triggers: [precommit],
        effects: [temporaryDraft],
        targets: [
          target("card", GENERIC_CARD_DRAFT_PROFILE.targetDescription, temporaryDraft.predicate),
          ...(reward.targets ?? []),
        ],
        effect: expectedValue + expectedDraftValue + loanProfile.obligationValue,
        uncertainty: reward.uncertainty ?? -14,
      }),
      precommit,
    };
  }

  const createdId = `${pairedReturnId}-future-trade`;
  // For `future_named_object_trade`, the anchor is normally a catalog Dreamsign
  // exchanged at the return scene. We coin-flip per option between that and a
  // manifest-local generated trade ticket (Key, Parchment, or Token) produced
  // by `tradeTicketBody`. The ticket variant tags the contract's `created` and
  // `returnScene` references with `source: "manifest_generated"` so the trade
  // anchor can be observed downstream without disturbing the catalog
  // Dreamsign reference paths the validation pipeline already exercises.
  const tradeTicketFlavours = ["Key", "Parchment", "Token"] as const;
  const useTradeTicket =
    family === "future_named_object_trade" &&
    drawInt(
      args.drawContext,
      `${args.shapeId}:${args.optionNumber}:trade-anchor-source`,
      0,
      1,
    ) === 1;
  const tradeTicket = useTradeTicket
    ? tradeTicketBody({
        drawContext: args.drawContext,
        label: `${args.shapeId}-${args.optionNumber}-${args.stage ?? "mid"}`,
        flavour:
          tradeTicketFlavours[
            drawInt(
              args.drawContext,
              `${args.shapeId}:${args.optionNumber}:trade-ticket-flavour`,
              0,
              tradeTicketFlavours.length - 1,
            )!
          ]!,
      })
    : undefined;
  const tradeTicketGeneratedObjectId = tradeTicket
    ? `generated-trade-ticket-${tradeTicket.idPart}`
    : undefined;
  const tradeRewardText = pairedReturnTradeRewardText(reward);
  const tradePayload = namedDreamsignPayload(
    {
      kind: "dreamsign_trade_hook",
      dreamsign: tradeDreamsign,
      source: "catalog",
      result: receiveDreamsign,
      resultSource: "catalog",
      extra: {
        timing: "return scene",
        obligation: tradeTicket
          ? `Trade ${tradeTicket.name} to ${tradeRewardText}`
          : `Trade ${tradeDreamsign.name} to ${tradeRewardText}`,
        giveDreamsignId: tradeDreamsign.id,
        giveDreamsignName: tradeDreamsign.name,
        receiveDreamsignId: receiveDreamsign.id,
        receiveDreamsignName: receiveDreamsign.name,
        ...(tradeTicket
          ? {
              tradeAnchorSource: "manifest_generated",
              tradeTicketKind: tradeTicket.payload.ticketKind,
              tradeTicketName: tradeTicket.name,
              tradeTicketGeneratedObjectId,
            }
          : { tradeAnchorSource: "catalog" }),
      },
    },
    args.context,
  );
  const triggerSelector = family === "return_for_route_edit"
    ? hookTrigger({
        triggerKind: "battle",
        label: "after 2 battles",
        count: 2,
      })
    : args.optionNumber % 2 === 0
      ? hookTrigger({
          triggerKind: "future_dream_journey",
          label: "at the next Dream Journey site",
          count: 1,
        })
      : hookTrigger({
          triggerKind: "future_shop",
          label: "at the next future shop",
          count: 1,
        });
  const futureCost = [tradePayload];
  const returnReward = rewardPayload;
  const anchorLabel = tradeTicket
    ? `${tradeTicket.name} trade ticket`
    : `${tradeDreamsign.name} trade hook`;
  const createdLabel = tradeTicket
    ? `Hold a {${tradeTicket.name}} as a future trade ticket.`
    : `Gain {${tradeDreamsign.name}} as a future trade hook.`;
  const resolution = tradeTicket
    ? `Trade {${tradeTicket.name}} to ${tradeRewardText}.`
    : `Trade {${tradeDreamsign.name}} to ${tradeRewardText}.`;
  const optionAnchorText = tradeTicket
    ? `Gain {${tradeTicket.name}} as a future trade ticket.`
    : `Gain {${tradeDreamsign.name}}.`;
  const optionEffects = tradeTicket && tradeTicketGeneratedObjectId
    ? [
        {
          kind: "generated_object_grant",
          generatedObjectOperationKind: "grant",
          generatedObjectId: tradeTicketGeneratedObjectId,
          generatedObjectKind: "status",
          generatedObjectName: tradeTicket.name,
          generatedObjectReferenceKind: "placeholder",
          rulesText: tradeTicket.rulesText,
          timing: "immediate",
          source: "manifest_generated",
          ticketKind: tradeTicket.payload.ticketKind,
        },
      ]
    : [
        namedDreamsignGrant(args.context, tradeDreamsign),
      ];
  const optionTargets = tradeTicket
    ? [...(reward.targets ?? [])]
    : [
        dreamsignExactTarget(tradeDreamsign, "catalog"),
        ...(reward.targets ?? []),
      ];
  const precommit = {
    ...pairedReturnContract({
      pairedReturnId,
      optionNumber: args.optionNumber,
      anchor: anchorLabel,
      created: {
        referenceKind: "trade_promise",
        referenceId: createdId,
        label: createdLabel,
        objectKind: tradeTicket ? "trade_ticket" : "dreamsign",
        dreamsignId: tradeDreamsign.id,
        dreamsignName: tradeDreamsign.name,
        ...(tradeTicket && tradeTicketGeneratedObjectId
          ? {
              source: "manifest_generated",
              ticketKind: tradeTicket.payload.ticketKind,
              ticketName: tradeTicket.name,
              tradeTicketGeneratedObjectId,
            }
          : { source: "catalog" }),
      },
      returnScene: {
        returnSceneKind: "future_trade",
        triggerSelector,
        referencesCreatedId: createdId,
        resolution,
        expiration: expiration(
          "discard_obligation",
          "If the named future site or battle window does not arrive within 2 dreamscapes, discard the trade hook.",
        ),
        duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      },
      futureCost,
      returnReward,
      reward: returnReward,
    }),
    sourceShapeId: args.shapeId,
    returnFamilyId: family,
    rewardMetadata: {
      rewardKey: reward.key,
      expectedConvertedEssence: expectedValue + 70,
    },
  };

  return {
    option: option({
      number: args.optionNumber,
      text: `${optionAnchorText} ${sentenceStart(String(triggerSelector.label))}, trade it to ${tradeRewardText}; discard the hook if the window expires.`,
      triggers: [precommit],
      effects: optionEffects,
      targets: optionTargets,
      effect: expectedValue + 70,
      uncertainty: reward.uncertainty ?? -15,
    }),
    precommit,
  };
}
