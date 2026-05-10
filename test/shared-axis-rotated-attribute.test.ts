import { describe, expect, it } from "vitest";
import { buildSharedAxisRotatedAttributeContract } from "../src/journey/fillers/sharedAxisRotatedAttribute.js";

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
