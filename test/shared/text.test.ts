import { describe, expect, it } from "vitest";
import { joinSnippets, withLockedPrefix } from "../../src/journey/shared/text.js";

describe("text helpers", () => {
  it("joinSnippets concatenates with periods and a single space", () => {
    expect(joinSnippets(["Gain 50 essence", "Lose 1 omen"])).toBe(
      "Gain 50 essence. Lose 1 omen.",
    );
  });

  it("joinSnippets handles a single snippet", () => {
    expect(joinSnippets(["Gain 50 essence"])).toBe("Gain 50 essence.");
  });

  it("joinSnippets skips empty entries", () => {
    expect(joinSnippets(["Gain 50 essence", ""])).toBe("Gain 50 essence.");
  });

  it("withLockedPrefix prepends [LOCKED]", () => {
    expect(withLockedPrefix("Pay 50 essence.", true)).toBe(
      "[LOCKED] Pay 50 essence.",
    );
    expect(withLockedPrefix("Pay 50 essence.", false)).toBe("Pay 50 essence.");
  });
});
