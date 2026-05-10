import { describe, expect, it } from "vitest";
import { makeTestContext } from "./helpers/journey-context.js";
import { tradeTicketBody } from "../src/journey/fillers/generatedObjects.js";
import { pairedReturnFill } from "../src/journey/shapes/paired_return.js";

describe("tradeTicketBody", () => {
  it.each(["Key", "Parchment", "Token"] as const)(
    "produces a %s anchor",
    (flavour) => {
      const { drawContext } = makeTestContext({ seed: `tt-${flavour}` });
      const body = tradeTicketBody({
        drawContext,
        label: "tt-test",
        flavour,
      });
      expect(body.objectType).toBe("Quest Ticket");
      expect(body.name).toContain(flavour);
    },
  );
});

describe("paired_return with generated trade ticket anchor", () => {
  it("can use a tradeTicketBody as the anchor instead of a catalog Dreamsign", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "pr-tt-1" });
    let sawTicketAnchor = false;
    for (let i = 0; i < 50; i += 1) {
      const fill = pairedReturnFill({
        context,
        drawContext: { ...drawContext, sequenceStep: i },
        stage,
      });
      const anchor = fill?.options?.[0]?.payloads.find(
        (p: { kind: string }) => p.kind === "trade_anchor",
      );
      if (anchor && (anchor as { source?: string }).source === "manifest_generated") {
        sawTicketAnchor = true;
        break;
      }
    }
    expect(sawTicketAnchor).toBe(true);
  });
});
