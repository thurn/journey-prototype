import { describe, expect, it } from "vitest";
import { REMOVABLE_KEYWORDS } from "../src/journey/content/keywords.js";
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";

describe("REMOVABLE_KEYWORDS", () => {
  it("contains at least Dissolve and Anchor", () => {
    expect(REMOVABLE_KEYWORDS).toContain("Dissolve");
    expect(REMOVABLE_KEYWORDS).toContain("Anchor");
  });

  it("is referenced by card_keyword_remove's keyword axis", () => {
    const entry = CARD_OPERATION_CATALOG.find((e) => e.key === "card_keyword_remove")!;
    const kwAxis = entry.predicateAxes!.find((a) => a.name === "keyword")!;
    for (const kw of kwAxis.values) {
      expect(REMOVABLE_KEYWORDS).toContain(kw);
    }
  });
});
