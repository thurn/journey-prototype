import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import { rewardSlots } from "../../fillers/shared.js";
import type { JourneyStage } from "../../manifest.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { pairedReturnHookFill } from "./hookFill.js";
import { tradeTicketBody } from "./tradeTicket.js";

const TRADE_TICKET_FLAVOURS = ["Key", "Parchment", "Token"] as const;

type TradeAnchorPayload = {
  kind: "trade_anchor";
  source: "catalog" | "manifest_generated";
  anchorLabel: string;
  ticketKind?: (typeof TRADE_TICKET_FLAVOURS)[number];
  generatedObjectId?: string;
};

type PairedReturnFillOption = {
  number: number;
  payloads: TradeAnchorPayload[];
};

export type PairedReturnFillResult = {
  options: PairedReturnFillOption[];
};

export function pairedReturnJourneyFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const rewards = rewardSlots(
    context,
    drawContext,
    "paired_return:return-rewards",
  ).filter((entry) => entry.routeEffects === undefined);
  const firstReturn = pairedReturnHookFill({
    context,
    drawContext,
    shapeId: "paired_return",
    optionNumber: 1,
    reward: rewards[0]!,
    stage,
  });
  const secondReturn = pairedReturnHookFill({
    context,
    drawContext,
    shapeId: "paired_return",
    optionNumber: 2,
    reward: rewards[1] ?? rewards[0]!,
    stage,
  });
  const thirdReturn = pairedReturnHookFill({
    context,
    drawContext,
    shapeId: "paired_return",
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

export function pairedReturnFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
}): PairedReturnFillResult {
  const catalogDreamsigns = args.context.content.dreamsigns;
  const options: PairedReturnFillOption[] = [];

  for (let optionIndex = 0; optionIndex < 3; optionIndex += 1) {
    const optionNumber = optionIndex + 1;
    const useTicket =
      drawInt(
        args.drawContext,
        `paired_return:trade-anchor-source:${optionNumber}`,
        0,
        1,
      ) === 1;

    if (useTicket) {
      const flavour =
        TRADE_TICKET_FLAVOURS[
          drawInt(
            args.drawContext,
            `paired_return:trade-ticket-flavour:${optionNumber}`,
            0,
            TRADE_TICKET_FLAVOURS.length - 1,
          )!
        ]!;
      const ticket = tradeTicketBody({
        drawContext: args.drawContext,
        label: `paired-return-${optionNumber}-${args.stage}`,
        flavour,
      });

      options.push({
        number: optionNumber,
        payloads: [
          {
            kind: "trade_anchor",
            source: "manifest_generated",
            anchorLabel: ticket.name,
            ticketKind: flavour,
            generatedObjectId: `generated-trade-ticket-${ticket.idPart}`,
          },
        ],
      });
    } else {
      const dreamsign =
        catalogDreamsigns[
          (optionNumber - 1) % Math.max(catalogDreamsigns.length, 1)
        ];
      const anchorLabel = dreamsign
        ? `${dreamsign.name} trade hook`
        : `catalog trade hook ${optionNumber}`;

      options.push({
        number: optionNumber,
        payloads: [
          {
            kind: "trade_anchor",
            source: "catalog",
            anchorLabel,
          },
        ],
      });
    }
  }

  return { options };
}
