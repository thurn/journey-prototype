import type { JourneyContext } from "../../quest/context.js";
import { drawInt, type DrawContext } from "../../util/rng.js";
import { tradeTicketBody } from "../fillers/tradeTicket.js";
import type { JourneyStage } from "../manifest.js";
import { hasPrecommitted } from "../validate/precommitRules.js";
import { fail } from "../validate/result.js";
import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

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

/**
 * Builds a `paired_return` fill skeleton focused on the trade-anchor selection
 * for the `future_named_object_trade` family.
 *
 * For each option, a uniform coin flip decides whether the trade anchor is a
 * catalog Dreamsign or a manifest-local generated trade ticket produced by
 * {@link tradeTicketBody}. The result exposes the chosen anchor through a
 * `trade_anchor` payload on each option so callers can introspect it.
 *
 * NOTE: this helper is a *companion* introspection skeleton; it is not the
 * production `paired_return` fill. The production fill lives in
 * `legacyFillOptions` (see `shapeFills.ts`) and delegates per-option to
 * `pairedReturnHookFill`, which performs an equivalent ticket coin-flip on the
 * `future_named_object_trade` branch.
 */
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

export const pairedReturnPlugin = defineShapePlugin({
  definition: {
      id: "paired_return",
      topology: "delayed_hook",
      rootOptionCount: { min: 2, max: 3 },
      supportedTags: ["callback", "delayed", "memory", "reward", "choice"],
      validationRules: [
        ...commonValidationRules,
        "seed_scene_creates_specific_return_hook",
        "return_metadata_references_seed_choice_or_object",
      ],
      repairPreferences: [
        "store_paired_return_metadata",
        "clarify_callback_anchor",
        "fall_back_to_reward_after_trigger",
      ],
      debugLabel: "Paired return",
      versionContribution: versionContribution("paired_return", "delayed_hook"),
    },
  repair: { actions: [{ action: "store_paired_return_metadata", kind: "repair_payload_family" }, { action: "clarify_callback_anchor", kind: "repair_payload_family" }, { action: "fall_back_to_reward_after_trigger", kind: "switch_to_shape", targetShapeId: "reward_after_trigger" }] },
  precommitValidator: (manifest) => {
    if (!hasPrecommitted(manifest.precommitted.pairedReturn)) {
      return fail("missing_precommitted_outcomes", "Paired return shapes require precommitted return metadata");
    }

    return { ok: true };
  },
});
