import type { JourneyContext } from "../../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption } from "../../manifest.js";
import { buildJourneyOptionOperations } from "../../operationBuilders.js";
import type { JourneyShapeId } from "../../shapes.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";
import { tradeTicketBody } from "./tradeTicket.js";

type PairedReturnFamilyId =
  | "future_named_object_trade"
  | "return_for_resource"
  | "return_for_card_operation"
  | "return_for_route_edit";

type MaterializedReturnReward = {
  readonly templateId: "gain_essence" | "gain_omens" | "add_site_to_next_dreamscape";
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

const FAMILY_BY_OPTION: readonly PairedReturnFamilyId[] = [
  "future_named_object_trade",
  "return_for_resource",
  "return_for_route_edit",
];

function normalizedHookId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function materializeReward(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly optionNumber: number;
}): MaterializedReturnReward {
  const templateIds = shuffleDeterministic(
    args.drawContext,
    `paired_return:${args.optionNumber}:reward-order`,
    ["gain_essence", "gain_omens", "add_site_to_next_dreamscape"] as const,
  );
  const templateId = templateIds[(args.optionNumber - 1) % templateIds.length]!;
  const template = getReward(templateId);
  const params = template.rollParams(args.context, {
    ...args.drawContext,
    selectionAttempt:
      (args.drawContext.selectionAttempt ?? 0) * 100 + args.optionNumber,
  }) as TemplateParams;
  const text = template.render(params as never, args.context);
  const convertedEssence = template.cec(params as never, args.context);

  return {
    templateId,
    params,
    text,
    convertedEssence,
  };
}

function rewardPayload(reward: MaterializedReturnReward): Record<string, unknown> {
  return {
    kind: "shared_reward_template",
    templateId: reward.templateId,
    params: reward.params,
    text: reward.text,
    timing: "return_scene",
    convertedEssence: reward.convertedEssence,
  };
}

function createdAnchor(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly optionNumber: number;
  readonly familyId: PairedReturnFamilyId;
}) {
  if (args.familyId === "future_named_object_trade" || args.optionNumber === 1) {
    const ticket = tradeTicketBody({
      drawContext: args.drawContext,
      label: `paired-return-${args.optionNumber}`,
      flavour: args.optionNumber === 1 ? "Key" : "Token",
    });
    const generatedObjectId = `generated-trade-ticket-${ticket.idPart}`;

    return {
      anchor: ticket.name,
      created: {
        referenceKind: "trade_promise",
        referenceId: generatedObjectId,
        label: `Remember {${ticket.name}}.`,
        objectKind: "trade_ticket",
        source: "manifest_generated",
        ticketName: ticket.name,
        ticketKind: ticket.name.includes("Key")
          ? "Key"
          : ticket.name.includes("Parchment")
            ? "Parchment"
            : "Token",
        tradeTicketGeneratedObjectId: generatedObjectId,
      },
    };
  }

  const dreamsign = args.context.content.dreamsigns[
    (args.optionNumber - 1) % Math.max(args.context.content.dreamsigns.length, 1)
  ];
  const anchor = dreamsign
    ? `${dreamsign.name} trade hook`
    : `catalog trade hook ${args.optionNumber}`;

  return {
    anchor,
    created: {
      referenceKind: "trade_promise",
      referenceId: normalizedHookId(anchor),
      label: `Remember {${anchor}}.`,
      objectKind: "promise",
      source: "catalog",
    },
  };
}

function pairedReturnContract(args: {
  readonly shapeId: JourneyShapeId;
  readonly optionNumber: number;
  readonly familyId: PairedReturnFamilyId;
  readonly anchor: string;
  readonly created: Record<string, unknown>;
  readonly reward: MaterializedReturnReward;
}): Record<string, unknown> {
  const reward = rewardPayload(args.reward);
  const rewardText = lowerFirst(args.reward.text).replace(/\.$/u, "");
  const triggerSelector = {
    triggerKind: "dreamscape",
    label: "the next dreamscape",
    count: 1,
  };
  const returnScene = {
    returnSceneKind: "future_trade",
    triggerSelector,
    referencesCreatedId: String(args.created.referenceId),
    referencesAnchor: args.anchor,
    resolution: `Trade {${args.anchor}} for a reward: ${rewardText}.`,
    expiration: {
      policyKind: "forfeit_reward",
      label: "If the next dreamscape does not resolve, discard this return scene.",
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next dreamscape",
      count: 1,
    },
    returnReward: [reward],
  };

  return {
    kind: "paired_return_contract",
    pairedReturnId: normalizedHookId(`${args.shapeId}-${args.optionNumber}-${args.anchor}`),
    hookId: normalizedHookId(`${args.shapeId}-${args.optionNumber}-${args.anchor}`),
    optionNumber: args.optionNumber,
    returnFamilyId: args.familyId,
    anchor: args.anchor,
    created: args.created,
    returnScene,
    futureCost: [],
    returnReward: [reward],
    trigger: "the next dreamscape",
    triggerSelector,
    trackedCondition: `Track return scene for {${args.anchor}}.`,
    resolution: returnScene.resolution,
    expiration: returnScene.expiration,
    duration: returnScene.duration,
    controlledScene: {
      sceneKind: "return",
      label: args.anchor,
    },
    visibilityPolicy: {
      outcomeVisibility: "visible",
      disclosure: "The return scene is shown before choosing.",
    },
    reward: [reward],
    hookBudgetCost: 1,
  };
}

function optionFor(args: {
  readonly optionNumber: number;
  readonly anchor: string;
  readonly created: Record<string, unknown>;
  readonly reward: MaterializedReturnReward;
  readonly precommit: Record<string, unknown>;
}): JourneyOption {
  const rewardText = lowerFirst(args.reward.text).replace(/\.$/u, "");
  const built = {
    number: args.optionNumber,
    symbols: ["paired-return", "trade", "reward"],
    text: `Create {${args.anchor}}. At the next dreamscape, trade it for a reward: ${rewardText}.`,
    operations: [],
    costs: [],
    effects: [rewardPayload(args.reward)],
    burdens: [],
    targets: [],
    triggers: [args.precommit],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: args.reward.convertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: -10,
    netConvertedEssence: args.reward.convertedEssence - 10,
    pickBehavior: "record_and_generate_next" as const,
  };

  return {
    ...built,
    operations: buildJourneyOptionOperations(built),
  };
}

export function pairedReturnHookFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: string;
  optionNumber: number;
  stage?: unknown;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const familyId = FAMILY_BY_OPTION[(args.optionNumber - 1) % FAMILY_BY_OPTION.length]!;
  const reward = materializeReward({
    context: args.context,
    drawContext: args.drawContext,
    optionNumber: args.optionNumber,
  });
  const { anchor, created } = createdAnchor({
    context: args.context,
    drawContext: args.drawContext,
    optionNumber: args.optionNumber,
    familyId,
  });
  const precommit = pairedReturnContract({
    shapeId: args.shapeId as JourneyShapeId,
    optionNumber: args.optionNumber,
    familyId,
    anchor,
    created,
    reward,
  });

  return {
    option: optionFor({
      optionNumber: args.optionNumber,
      anchor,
      created,
      reward,
      precommit,
    }),
    precommit,
  };
}
