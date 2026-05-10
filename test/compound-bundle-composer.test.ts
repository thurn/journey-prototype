import { describe, expect, it } from "vitest";
import { genericBundleOption } from "../src/journey/shapes/service_menu/genericBundleOption.js";
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
