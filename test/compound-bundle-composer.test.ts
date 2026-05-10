import { describe, expect, it } from "vitest";
import { genericBundleOption } from "../src/journey/shapes/service_menu/genericBundleOption.js";
import {
  COMPOUND_BUNDLE_FAMILIES,
  buildBundleFamilyOption,
} from "../src/journey/shapes/service_menu/compoundBundleFamilies.js";
import { compoundPayloadMenuFill } from "../src/journey/shapes/service_menu/compoundPayloads.js";
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
  it("contains entries for the four legacy families plus the registry-only fifth, all with positive weights", () => {
    const ids = COMPOUND_BUNDLE_FAMILIES.map((f) => f.id).sort();
    expect(ids).toEqual([
      "bane_purge_plus_essence",
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

describe("registry extensibility", () => {
  it("supports a fifth family added by configuration only", () => {
    const ids = COMPOUND_BUNDLE_FAMILIES.map((f) => f.id);
    expect(ids).toContain("bane_purge_plus_essence");
  });
});

describe("compoundPayloadMenuFill (registry-driven)", () => {
  it("never dispatches to per-family fill functions", () => {
    // Static assertion via grep is also done in the deletion check; here
    // we assert behaviour: every fill it returns has a fillKind matching one
    // of the registry entries.
    const allowed = new Set(COMPOUND_BUNDLE_FAMILIES.map((f) => f.fillKind));
    const { context, drawContext } = makeTestContext({ seed: "bundle-3" });
    let nonUndefinedCount = 0;
    for (let i = 0; i < 25; i += 1) {
      const fill = compoundPayloadMenuFill({
        context,
        drawContext: { ...drawContext, sequenceStep: i },
        label: `iter-${i}`,
        shapeId: "service_menu",
        stage: "mid",
      });
      if (fill !== undefined) {
        nonUndefinedCount += 1;
        expect(allowed.has(fill.fillKind)).toBe(true);
      }
    }
    expect(nonUndefinedCount).toBeGreaterThan(15);
  });
});
