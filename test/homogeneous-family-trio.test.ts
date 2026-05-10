import { describe, expect, it } from "vitest";
import { symmetryContract } from "../src/journey/fillers/shared.js";

describe("homogeneous_family_trio contract", () => {
  it("constructs without typecheck failure", () => {
    const c = symmetryContract({
      contractKind: "homogeneous_family_trio",
      sharedProperty: "rewardFamily",
      variedProperty: "rewardSpecific",
      sharedFirst: true,
      optionNumbers: [1, 2, 3],
      sharedPayloadKeys: ["rewardFamily=resource"],
    });
    expect(c.contractKind).toBe("homogeneous_family_trio");
  });
});
