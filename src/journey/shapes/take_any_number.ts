import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const takeAnyNumberPlugin = defineShapePlugin({
  definition: {
      id: "take_any_number",
      topology: "repeatable_menu",
      rootOptionCount: { min: 3, max: 4 },
      supportedTags: ["repeatable", "subset", "cap", "reward", "burden", "stop"],
      validationRules: [
        ...commonValidationRules,
        "repeatable_menu_has_visible_cap",
        "each_take_has_cap_or_limiting_structure",
        "leave_option_is_available",
      ],
      repairPreferences: [
        "add_leave_option",
        "add_shared_burden_or_limit",
        "lower_take_cap",
      ],
      debugLabel: "Take any number",
      versionContribution: versionContribution("take_any_number", "repeatable_menu"),
    },
  scoreWeight: 1.25,
  repair: { actions: [{ action: "add_leave_option", kind: "repair_payload_family" }, { action: "add_shared_burden_or_limit", kind: "repair_payload_family" }, { action: "lower_take_cap", kind: "repair_payload_family" }] },
});
