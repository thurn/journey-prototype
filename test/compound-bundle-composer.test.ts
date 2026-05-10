import { describe, expect, it } from "vitest";
import { genericBundleOption } from "../src/journey/shapes/service_menu/genericBundleOption.js";
import {
  COMPOUND_BUNDLE_FAMILIES,
  buildBundleFamilyOption,
} from "../src/journey/shapes/service_menu/compoundBundleFamilies.js";
import { makeTestContext } from "./helpers/journey-context.js";

describe("genericBundleOption", () => {
  it("returns a single ResolvedShapeFillOption with one cost and one reward payload", () => {
    const { context, drawContext } = makeTestContext({ seed: "bundle-1" });
    const result = genericBundleOption({
      context,
      drawContext,
      label: "test-bundle",
      stage: "mid",
      costSource: { kind: "fixed_essence", amount: 100 },
      rewardSource: { kind: "fixed_card_draft", profileId: "any_basic" },
    });
    expect(result).toBeDefined();
    expect(result!.payloads).toHaveLength(2);
    expect(result!.payloads[0]!.kind).toBe("essence_cost");
    expect(result!.payloads[1]!.kind).toBe("card_draft");
  });
});

describe("COMPOUND_BUNDLE_FAMILIES", () => {
  it("contains entries for the four legacy families with positive weights", () => {
    const ids = COMPOUND_BUNDLE_FAMILIES.map((f) => f.id).sort();
    expect(ids).toEqual([
      "mixed_service",
      "molting_archive",
      "scissor_saint",
      "withered_orchard",
    ]);
    for (const family of COMPOUND_BUNDLE_FAMILIES) {
      expect(family.weight).toBeGreaterThan(0);
    }
  });

  it("buildBundleFamilyOption produces a valid option for each family", () => {
    const { context, drawContext } = makeTestContext({ seed: "bundle-2" });
    for (const family of COMPOUND_BUNDLE_FAMILIES) {
      const option = buildBundleFamilyOption({
        context,
        drawContext,
        family,
        label: `${family.id}-test`,
        stage: "mid",
        shapeId: "service_menu",
      });
      expect(option, `family ${family.id} returned undefined`).toBeDefined();
    }
  });
});
