import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { chooseYourLossFill } from "./fill.js";
import { validateChooseYourLossValues } from "./validators.js";

export const chooseYourLossPlugin = defineShapePlugin({
  definition: {
    id: "choose_your_loss",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["loss", "burden", "triage", "negative", "menu"],
    payloadCompatibility: [
      {
        familyId: "adapter",
        variants: ["current"],
        legality: "legal",
        reason: "All canonical shapes can use the typed adapter payload.",
      },
      {
        familyId: "card",
        variants: [],
        legality: "unsupported",
        reason: "Shape does not expose a legal card-target operation frame.",
      },
      {
        familyId: "dreamsign",
        variants: [],
        legality: "unsupported",
        reason:
          "Shape does not expose a legal Dreamsign target or shop frame.",
      },
      {
        familyId: "bane",
        variants: ["adapter-compatible-bane-losses"],
        legality: "legal",
        reason:
          "Shape can frame Bane gain, purge, and transformation decisions.",
      },
      {
        familyId: "resource",
        variants: ["adapter-compatible-resource-operations"],
        legality: "legal",
        reason: "Shape can compare visible resource costs or rewards.",
      },
      {
        familyId: "route",
        variants: [],
        legality: "unsupported",
        reason: "Shape topology is not a route-edit scene.",
      },
      {
        familyId: "shop",
        variants: [],
        legality: "unsupported",
        reason: "Shape lacks a shop row price frame.",
      },
      {
        familyId: "dreamwell",
        variants: [],
        legality: "unsupported",
        reason:
          "Shape does not provide a shared timing window for Dreamwell payloads.",
      },
      {
        familyId: "status",
        variants: [],
        legality: "unsupported",
        reason: "Shape lacks a legal status or rule-mutation frame.",
      },
      {
        familyId: "hook",
        variants: [],
        legality: "unsupported",
        reason: "Shape has no delayed hook contract surface.",
      },
      {
        familyId: "return",
        variants: [],
        legality: "unsupported",
        reason: "Shape does not create paired return anchors.",
      },
      {
        familyId: "random",
        variants: [],
        legality: "unsupported",
        reason:
          "Shape is deterministic and does not require random envelope metadata.",
      },
      {
        familyId: "generated_object",
        variants: [],
        legality: "unsupported",
        reason:
          "Shape topology has no legal manifest-local generated object host.",
      },
      {
        familyId: "decision_tree",
        variants: [],
        legality: "unsupported",
        reason: "Shape is not a decision-tree topology.",
      },
    ],
    validationRules: [
      ...commonValidationRules,
      "all_options_are_negative_outcomes",
      "losses_are_comparable_damage_control_choices",
    ],
    repairPreferences: [
      "replace_positive_option_with_loss",
      "normalize_loss_severity",
      "remove_unrelated_reward_payload",
    ],
    debugLabel: "Choose your loss",
    versionContribution: versionContribution("choose_your_loss", "direct_menu"),
    compoundCoherence: "skip",
  },
  scoreWeight: 0.85,
  repair: {
    actions: [
      {
        action: "replace_positive_option_with_loss",
        kind: "repair_payload_family",
      },
      { action: "normalize_loss_severity", kind: "repair_payload_family" },
      {
        action: "remove_unrelated_reward_payload",
        kind: "repair_payload_family",
      },
    ],
  },
  optionValueValidator: (nets) => validateChooseYourLossValues(nets),
  fill: chooseYourLossFill,
});
