import { describe, expect, it } from "vitest";
import {
  rewardFamilyTag,
  symmetryContract,
} from "../src/journey/fillers/shared.js";

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

describe("rewardFamilyTag", () => {
  it("classifies known reward keys", () => {
    expect(rewardFamilyTag("essence")).toBe("resource");
    expect(rewardFamilyTag("omens")).toBe("resource");
    expect(rewardFamilyTag("resource:fixed-essence-gain:300")).toBe("resource");
    expect(rewardFamilyTag("draft:characters")).toBe("draft");
    expect(rewardFamilyTag("multi-draft:events")).toBe("draft");
    expect(rewardFamilyTag("named-card:abc")).toBe("draft");
    expect(rewardFamilyTag("dreamsign-draft")).toBe("dreamsign");
    expect(rewardFamilyTag("named-dreamsign:foo")).toBe("dreamsign");
    expect(rewardFamilyTag("starter-cleanup")).toBe("starter");
  });
});
