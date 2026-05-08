import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const pairedReturnPlugin = defineShapePlugin({
  definition: {
      id: "paired_return",
      topology: "delayed_hook",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["callback", "delayed", "memory", "reward", "choice"],
      validationRules: [
        ...commonValidationRules,
        "seed_scene_creates_specific_return_hook",
        "return_metadata_references_seed_choice_or_object",
      ],
      repairPreferences: [
        "store_paired_return_metadata",
        "clarify_callback_anchor",
        "fall_back_to_reward_after_trigger",
      ],
      debugLabel: "Paired return",
      versionContribution: versionContribution("paired_return", "delayed_hook"),
    },
  scoreWeight: 1,
  repair: { actions: [{ action: "store_paired_return_metadata", kind: "repair_payload_family" }, { action: "clarify_callback_anchor", kind: "repair_payload_family" }, { action: "fall_back_to_reward_after_trigger", kind: "switch_to_shape", targetShapeId: "reward_after_trigger" }] },
});
