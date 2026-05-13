import { describe, expect, it } from "vitest";
import {
  rewardFamilyTag,
  symmetryContract,
} from "../src/journey/fillers/shared.js";
import { serviceMenuFill } from "../src/journey/shapes/service_menu/fill.js";
import { makeTestContext } from "./helpers/journey-context.js";

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

describe("service_menu with familyRestriction", () => {
  it("emits a homogeneous_family_trio contract when familyRestriction is set", () => {
    let emittedContract = false;
    let succeeded = false;

    for (let seedIndex = 0; seedIndex < 30; seedIndex += 1) {
      const { context, drawContext, stage } = makeTestContext({
        seed: `hft-svc-resource-${seedIndex}`,
      });
      const filled = serviceMenuFill({
        context,
        drawContext,
        stage,
        shapeArgs: { familyRestriction: "resource" },
      });
      if (filled.options.length !== 3) {
        continue;
      }
      succeeded = true;
      emittedContract =
        emittedContract ||
        (filled.symmetryContracts ?? []).some(
          (c) => c.contractKind === "homogeneous_family_trio",
        );
      if (emittedContract) break;
    }

    expect(succeeded).toBe(true);
    expect(emittedContract).toBe(true);
  });

  it("does not emit the contract when familyRestriction is unset", () => {
    let sawContract = false;
    for (let seedIndex = 0; seedIndex < 5; seedIndex += 1) {
      const { context, drawContext, stage } = makeTestContext({
        seed: `hft-svc-no-restriction-${seedIndex}`,
      });
      const filled = serviceMenuFill({ context, drawContext, stage });
      if (
        (filled.symmetryContracts ?? []).some(
          (c) => c.contractKind === "homogeneous_family_trio",
        )
      ) {
        sawContract = true;
        break;
      }
    }
    expect(sawContract).toBe(false);
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
