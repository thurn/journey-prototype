import { describe, expect, it } from "vitest";
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
