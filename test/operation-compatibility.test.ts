import { describe, expect, it } from "vitest";
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";
import {
  slotAcceptsOperation,
  type OperationCompatibilityTrait,
  type SlotCapability,
} from "../src/journey/fillers/operationCompatibility.js";

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
