import { describe, expect, it } from "vitest";
import { renderLifetimeText } from "../src/journey/fillers/generatedObjects.js";

describe("trigger_count lifetime", () => {
  it("renders 'dissolves after N <trigger> events'", () => {
    expect(
      renderLifetimeText({
        kind: "trigger_count",
        triggerKind: "dreamsign_trigger",
        count: 3,
      }),
    ).toBe("dissolves after 3 Dreamsign triggers");
  });
});
