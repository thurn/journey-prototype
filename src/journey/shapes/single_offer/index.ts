import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { singleOfferFill } from "./fill.js";
import { singleOfferValidator } from "./validators.js";

export const singleOfferPlugin = defineShapePlugin({
  definition: {
    id: "single_offer",
    topology: "single_offer_refusal",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["offer", "cost", "reward", "refusal", "bargain"],
    validationRules: [
      ...commonValidationRules,
      "one_take_option_and_one_refusal_option",
      "take_option_has_visible_meaningful_trade",
    ],
    debugLabel: "Single offer",
    versionContribution: versionContribution(
      "single_offer",
      "single_offer_refusal",
    ),
  },
  validators: [singleOfferValidator],
  fill: singleOfferFill,
});
