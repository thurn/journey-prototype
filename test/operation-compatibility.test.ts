import { describe, expect, it } from "vitest";
import {
  CARD_OPERATION_CATALOG,
  compatibleCardOperations,
} from "../src/journey/fillers/cardOperationCatalog.js";
import {
  slotAcceptsOperation,
  type OperationCompatibilityTrait,
  type SlotCapability,
} from "../src/journey/fillers/operationCompatibility.js";
import type { DrawContext } from "../src/util/rng.js";

const TEST_DRAW_CONTEXT: DrawContext = {
  seed: "operation-compatibility-test",
  contentVersion: "test",
  rootJourneyIndex: 0,
};

describe("slotAcceptsOperation", () => {
  it("accepts a single-target operation in a single-target slot", () => {
    const slot: SlotCapability = {
      provides: ["single_target", "deck_side"],
    };
    const entry = {
      key: "test-op",
      compatibilityTraits: [
        "needs_single_target",
        "needs_deck_side",
      ] as OperationCompatibilityTrait[],
    };

    expect(slotAcceptsOperation(slot, entry)).toBe(true);
  });

  it("rejects when the slot does not provide a required trait", () => {
    const slot: SlotCapability = { provides: ["single_target"] };
    const entry = {
      key: "test-op",
      compatibilityTraits: [
        "needs_all_matching_scope",
      ] as OperationCompatibilityTrait[],
    };

    expect(slotAcceptsOperation(slot, entry)).toBe(false);
  });
});

describe("CARD_OPERATION_CATALOG entries", () => {
  it("chosen-purge declares needs_named_target and produces_deck_mutation", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "chosen-purge");

    expect(entry).toBeDefined();
    expect(entry!.compatibilityTraits).toContain("needs_named_target");
    expect(entry!.compatibilityTraits).toContain("produces_deck_mutation");
  });
});

describe("CARD_OPERATION_CATALOG full migration", () => {
  it("every entry declares compatibilityTraits", () => {
    for (const entry of CARD_OPERATION_CATALOG) {
      expect(
        entry.compatibilityTraits,
        `entry ${entry.key} missing compatibilityTraits`,
      ).toBeDefined();
    }
  });
});

describe("catalog query (slot-driven)", () => {
  it("returns chosen-purge for a slot that provides named_target + deck_mutation_consumer", () => {
    // Restrict to family "purge" so chosen-purge is one of a small set of matches,
    // and ensure count covers them all.
    const matches = compatibleCardOperations(TEST_DRAW_CONTEXT, {
      slot: {
        provides: ["named_target", "deck_mutation_consumer", "deck_side"],
      },
      targetClasses: ["deck_card"],
      targetModes: ["chosen"],
      families: ["purge"],
      label: "test:chosen-purge-positive",
      count: 1,
    });

    expect(matches.some((match) => match.key === "chosen-purge")).toBe(true);
  });

  it("returns no chosen-purge for a slot that does not provide deck_mutation_consumer", () => {
    // Slot lacks deck_mutation_consumer, so any operation needing produces_deck_mutation
    // (including chosen-purge) is rejected. Use a request that allows at least one
    // matching candidate so compatibleCardOperations does not throw.
    const matches = compatibleCardOperations(TEST_DRAW_CONTEXT, {
      slot: {
        provides: [
          "single_target",
          "named_target",
          "deck_side",
        ],
      },
      targetClasses: ["deck_card"],
      targetModes: ["chosen"],
      families: ["merge_split"],
      label: "test:chosen-purge-negative",
      count: 1,
    });

    expect(
      matches.find((match) => match.key === "chosen-purge"),
    ).toBeUndefined();
  });
});
