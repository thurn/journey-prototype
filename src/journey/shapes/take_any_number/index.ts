import { isRecord } from "../../validate/guards.js";
import { fail } from "../../validate/result.js";
import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { takeAnyNumberFill } from "./fill.js";

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
  repair: {
    actions: [
      { action: "add_leave_option", kind: "repair_payload_family" },
      { action: "add_shared_burden_or_limit", kind: "repair_payload_family" },
      { action: "lower_take_cap", kind: "repair_payload_family" },
    ],
  },
  fill: takeAnyNumberFill,
  precommitValidator: (manifest) => {
    const sequenceMenus = manifest.precommitted.sequenceMenus;

    if (!isRecord(sequenceMenus)) {
      return { ok: true };
    }

    for (const [path, menu] of Object.entries(sequenceMenus)) {
      if (!Array.isArray(menu)) {
        continue;
      }

      for (const entry of menu) {
        if (
          !isRecord(entry) ||
          entry.pickBehavior === "leave" ||
          entry.pickBehavior === "complete_sequence"
        ) {
          continue;
        }

        const hasLimitingStructure =
          (Array.isArray(entry.costs) && entry.costs.length > 0) ||
          (Array.isArray(entry.burdens) && entry.burdens.length > 0) ||
          (typeof entry.uncertaintyConvertedEssence === "number" &&
            entry.uncertaintyConvertedEssence < 0);

        if (!hasLimitingStructure) {
          return fail(
            "open_pick_without_limiting_structure",
            `${path} has a take option without a cost, burden, or risk`,
          );
        }
      }
    }

    return { ok: true };
  },
});
