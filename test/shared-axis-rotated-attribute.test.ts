import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import { buildSharedAxisRotatedAttributeContract } from "../src/journey/fillers/sharedAxisRotatedAttribute.js";
import { generateNextJourney } from "../src/journey/generate.js";
import { createInitialJourneyState } from "../src/quest/init.js";
import { buildJourneyContext } from "../src/quest/context.js";

describe("shared_axis_rotated_attribute contract", () => {
  it("emits the contract when shared axis is constant and rotated axis is distinct", () => {
    const contract = buildSharedAxisRotatedAttributeContract({
      options: [
        { number: 1, sharedValue: "starter_card", rotatedValue: "purge" },
        { number: 2, sharedValue: "starter_card", rotatedValue: "transfigure" },
        { number: 3, sharedValue: "starter_card", rotatedValue: "duplicate" },
      ],
      sharedAxis: { kind: "target_class", value: "starter_card" },
      rotatedAxis: { kind: "operation_family" },
    });
    expect(contract).toBeDefined();
    expect(contract!.contractKind).toBe("shared_axis_rotated_attribute");
  });

  it("returns undefined when the shared axis is not constant", () => {
    const contract = buildSharedAxisRotatedAttributeContract({
      options: [
        { number: 1, sharedValue: "starter_card", rotatedValue: "purge" },
        { number: 2, sharedValue: "deck_card", rotatedValue: "transfigure" },
      ],
      sharedAxis: { kind: "target_class", value: "starter_card" },
      rotatedAxis: { kind: "operation_family" },
    });
    expect(contract).toBeUndefined();
  });

  it("returns undefined when the rotated axis is not distinct", () => {
    const contract = buildSharedAxisRotatedAttributeContract({
      options: [
        { number: 1, sharedValue: "starter_card", rotatedValue: "purge" },
        { number: 2, sharedValue: "starter_card", rotatedValue: "purge" },
      ],
      sharedAxis: { kind: "target_class", value: "starter_card" },
      rotatedAxis: { kind: "operation_family" },
    });
    expect(contract).toBeUndefined();
  });
});

describe("shared_axis_rotated_attribute coverage", () => {
  it("at least one of 50 seeds emits the new kind in place of an old shared_* kind", async () => {
    const content = await loadContent(process.cwd());
    const contentVersion = "test-content-version";
    let seenNew = 0;
    let seenOld = 0;
    for (let i = 0; i < 50; i += 1) {
      const seed = `sarac:${i}`;
      const state = createInitialJourneyState({
        seed,
        content,
        contentVersion,
      });
      const ctx = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const m = generateNextJourney({ context: ctx });
      const contracts = m.debug.symmetryContracts ?? [];
      if (
        contracts.some(
          (c) => c.contractKind === "shared_axis_rotated_attribute",
        )
      ) {
        seenNew += 1;
      }
      if (
        contracts.some(
          (c) =>
            (c.contractKind as string) === "shared_target_operations" ||
            (c.contractKind as string) === "shared_operation_named_targets",
        )
      ) {
        seenOld += 1;
      }
    }
    expect(seenNew).toBeGreaterThan(0);
    expect(seenOld).toBe(0);
  });
});
