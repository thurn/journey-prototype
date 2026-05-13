import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { riskOrSkipFill } from "./fill.js";
import { riskOrSkipValidator } from "./validators.js";

// Acceptable shape-ID leaks outside this directory:
// - test/journey-shapes.test.ts: registry order assertions and the
//   `risk_or_skip_envelope` validator-id smoke check (test-only).
// - test/journey-generation.test.ts: end-to-end shape behavior tests that
//   call `fillForShape("risk_or_skip", ...)` and assert on the
//   `risk_or_skip_bounded_downside` shape_invariant in produced manifests.
//   These tests target this shape by design; their references are not
//   centralized logic.

export const riskOrSkipPlugin = defineShapePlugin({
  definition: {
    id: "risk_or_skip",
    topology: "single_offer_refusal",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["risk", "reward", "random", "refusal", "temptation"],
    validationRules: [
      ...commonValidationRules,
      "accept_option_has_guaranteed_reward",
      "downside_is_random_inside_visible_envelope",
      "skip_option_has_leave_behavior",
    ],
    debugLabel: "Risk or skip",
    versionContribution: versionContribution(
      "risk_or_skip",
      "single_offer_refusal",
    ),
  },
  validators: [riskOrSkipValidator],
  fill: riskOrSkipFill,
});
