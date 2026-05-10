import { describe, expect, it } from "vitest";
import { DREAMSIGN_OPERATION_CATALOG } from "../src/journey/fillers/dreamsignOperationCatalog.js";

describe("transform_to_revealed_choice", () => {
  it("is registered and produces a reveal-N-choose-1 effect", () => {
    const entry = DREAMSIGN_OPERATION_CATALOG.find((e) => e.key === "transform_to_revealed_choice");
    expect(entry).toBeDefined();
    expect(entry!.effect).toMatchObject({
      kind: "dreamsign_transform",
      revealCount: 3,
      chooseCount: 1,
    });
  });
});
