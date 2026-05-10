import { describe, expect, it } from "vitest";
import { tradeTicketBody } from "../src/journey/fillers/generatedObjects.js";
import { makeTestContext } from "./helpers/journey-context.js";

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
