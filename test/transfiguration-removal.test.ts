import { describe, expect, it } from "vitest";
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";

describe("transfiguration_removal", () => {
  it("is registered with traits needs_named_target and produces_deck_mutation", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "transfiguration_removal");
    expect(entry).toBeDefined();
    expect(entry!.compatibilityTraits).toContain("needs_named_target");
    expect(entry!.compatibilityTraits).toContain("produces_deck_mutation");
  });

  it("renders a removal sentence", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "transfiguration_removal")!;
    expect(entry.renderText("a chosen card").toLowerCase()).toContain("remove");
    expect(entry.renderText("a chosen card").toLowerCase()).toContain("transfiguration");
  });
});
