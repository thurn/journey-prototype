import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const alterDreamscapesPlugin = defineShapePlugin({
  definition: {
      id: "alter_dreamscapes",
      topology: "route_edit",
      rootOptionCount: { min: 2, max: 3 },
      supportedTags: ["route", "dreamscape", "timing", "structural"],
      validationRules: [
        ...commonValidationRules,
        "route_edits_are_described_without_mutating_state",
        "future_route_edits_have_explicit_timing",
      ],
      repairPreferences: [
        "prefer_current_dreamscape_edit",
        "make_future_site_visible_or_committed",
        "store_route_edit_metadata",
      ],
      debugLabel: "Alter dreamscapes",
      versionContribution: versionContribution("alter_dreamscapes", "route_edit"),
      allowsRouteReward: true,
      allowsRouteSideEffects: true,
    },
  scoreWeight: 0.6,
  repair: { actions: [{ action: "prefer_current_dreamscape_edit", kind: "repair_payload_family" }, { action: "make_future_site_visible_or_committed", kind: "reveal_hidden_target_or_outcome" }, { action: "store_route_edit_metadata", kind: "repair_payload_family" }] },
});
