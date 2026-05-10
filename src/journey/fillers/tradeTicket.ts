import type { DrawContext } from "../../util/rng.js";
import type { BoundedDuration, GeneratedObjectDefinition } from "../manifest.js";

/**
 * Body for a `tradeTicketBody`-produced generated object. Mirrors the relevant
 * subset of {@link GeneratedObjectDefinition} consumed by the
 * `paired_return.future_named_object_trade` flow, plus the small
 * `idPart` / `ruleIds` fields used by `naturalGeneratedObjectDefinition`.
 */
export type TradeTicketBody = Omit<
  GeneratedObjectDefinition,
  "generatedObjectKind" | "generatedObjectId" | "name" | "validation"
> & {
  idPart: string;
  name: string;
  ruleIds: string[];
};

export type TradeTicketArgs = {
  drawContext: DrawContext;
  label: string;
  flavour: "Key" | "Parchment" | "Token";
};

function kebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function tradeTicketDuration(): BoundedDuration {
  return {
    durationKind: "until_trigger",
    count: 1,
    label: "until traded",
  };
}

/**
 * Builds a manifest-local trade-ticket generated object body. Used by
 * `paired_return.future_named_object_trade` as a generic anchor in lieu of
 * a real catalog Dreamsign.
 */
export function tradeTicketBody(args: TradeTicketArgs): TradeTicketBody {
  const idPart = `trade-ticket-${kebab(args.flavour)}`;

  return {
    idPart,
    name: `${args.flavour} of Passage`,
    objectType: "Quest Ticket",
    rulesText: `Hold this ${args.flavour} until the next eligible trade; then exchange it for the promised reward.`,
    tags: ["journey-only", "ticket", "trade"],
    references: { rules: [args.flavour, "trade"] },
    duration: tradeTicketDuration(),
    lifetime: "until_returned",
    valueEstimate: {
      convertedEssence: 90,
      confidence: "medium",
      basis: "Trade-ticket anchor for a deferred named-object exchange.",
    },
    payload: {
      ticketKind: args.flavour,
      ticketLabel: args.label,
      source: "manifest_generated",
    },
    ruleIds: [
      "stable_id",
      "duration",
      "value_estimate",
      "manifest_local",
    ],
  };
}
