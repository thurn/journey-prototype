import { describe, expect, it } from "vitest";
import { makeTestContext } from "./helpers/journey-context.js";
import { tradeTicketBody } from "../src/journey/fillers/generatedObjects.js";
import { pairedReturnFill } from "../src/journey/shapes/paired_return/index.js";
import { loadContent } from "../src/content/loadToml.js";
import { buildJourneyContext } from "../src/quest/context.js";
import { createInitialJourneyState } from "../src/quest/init.js";
import { generateNextJourney } from "../src/journey/generate.js";

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

describe("paired_return with generated trade ticket anchor (skeleton)", () => {
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

describe("paired_return production generation surfaces a trade ticket anchor", () => {
  it("produces at least one manifest_generated trade anchor across 50 seeds", async () => {
    const content = await loadContent(process.cwd());
    const contentVersion = "test-content-version";
    let sawTicketAnchor = false;
    let sawAnyFutureTrade = false;

    for (let index = 0; index < 50 && !sawTicketAnchor; index += 1) {
      const seed = `paired-return-trade-ticket:${index}`;
      const state = createInitialJourneyState({ seed, content, contentVersion });
      const journeyContext = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const manifest = generateNextJourney({
        context: journeyContext,
        forcedShapeId: "paired_return",
      });

      const contracts = (manifest.precommitted.pairedReturn ?? []) as Record<
        string,
        unknown
      >[];
      for (const contract of contracts) {
        if (contract.returnFamilyId !== "future_named_object_trade") {
          continue;
        }
        sawAnyFutureTrade = true;
        const created = contract.created as Record<string, unknown> | undefined;
        if (created && created.source === "manifest_generated") {
          expect(created.objectKind).toBe("trade_ticket");
          expect(typeof created.ticketKind).toBe("string");
          expect(typeof created.tradeTicketGeneratedObjectId).toBe("string");
          expect(String(created.tradeTicketGeneratedObjectId)).toMatch(
            /^generated-trade-ticket-/u,
          );
          sawTicketAnchor = true;
          break;
        }
      }
    }

    expect(sawAnyFutureTrade).toBe(true);
    expect(sawTicketAnchor).toBe(true);
  });
});
