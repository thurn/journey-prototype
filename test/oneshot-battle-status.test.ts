import { describe, expect, it } from "vitest";
import { naturalStatusBody } from "../src/journey/fillers/generatedObjects.js";
import { makeTestContext } from "./helpers/journey-context.js";

describe("oneshot-battle-rule status archetype", () => {
  it("is one of the archetypes pickable by naturalStatusBody", () => {
    const seenFragments = new Set<string>();
    const seenFlavours = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const { drawContext } = makeTestContext({ seed: `oneshot:${i}` });
      const body = naturalStatusBody({
        kind: "status",
        drawContext,
        shapeId: "independent_rows_menu",
        stage: "mid",
        cards: [],
      });
      seenFragments.add(body.idPart.split("-")[0]!);
      if (body.idPart.startsWith("oneshot-battle-")) {
        const flavour = body.idPart.replace(/^oneshot-battle-/u, "");
        seenFlavours.add(flavour);
      }
    }
    expect(seenFragments.has("oneshot")).toBe(true);
    expect(seenFlavours.size).toBeGreaterThanOrEqual(3);
  });

  it("produces a one-sentence rule about hand/energy/turn when forced", () => {
    // Force selection of the new archetype by seed-hunting.
    let bodyFound: ReturnType<typeof naturalStatusBody> | undefined;
    for (let i = 0; i < 200; i += 1) {
      const { drawContext } = makeTestContext({ seed: `oneshot-flavour:${i}` });
      const body = naturalStatusBody({
        kind: "status",
        drawContext,
        shapeId: "independent_rows_menu",
        stage: "mid",
        cards: [],
      });
      if (body.idPart.startsWith("oneshot-battle-")) {
        bodyFound = body;
        break;
      }
    }
    expect(bodyFound).toBeDefined();
    expect(bodyFound!.rulesText.toLowerCase()).toMatch(/hand|energy|turn/);
  });
});
