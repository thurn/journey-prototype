export type JourneyShapeId =
  | "random_allocation"
  | "same_cost_different_rewards"
  | "same_reward_different_costs"
  | "service_menu"
  | "shop_row"
  | "curated_reward_trio"
  | "heterogeneous_pair"
  | "one_target_many_operations"
  | "staged_assembly"
  | "mirrored_operations"
  | "one_operation_many_targets"
  | "choose_your_loss"
  | "single_reward"
  | "single_offer"
  | "risk_or_skip"
  | "single_wager"
  | "now_vs_later"
  | "reward_after_trigger"
  | "paired_return"
  | "timed_window_menu"
  | "take_any_number"
  | "take_up_to_n"
  | "repeat_to_scale"
  | "push_your_luck"
  | "resolved_random_series"
  | "single_random_outcome"
  | "sequential_offers"
  | "escalating_search"
  | "commit_now_future_payoff"
  | "alter_dreamscapes";

export type JourneyTopology =
  | "direct_menu"
  | "single_offer_refusal"
  | "single_reward"
  | "random_commit"
  | "delayed_hook"
  | "route_edit"
  | "sequential";

export type JourneyShapeDefinition = {
  readonly id: JourneyShapeId;
  readonly topology: JourneyTopology;
  readonly rootOptionCount: Readonly<{ min: number; max: number }>;
  readonly supportedTags: readonly string[];
  readonly validationRules: readonly string[];
  readonly repairPreferences: readonly string[];
  readonly debugLabel: string;
  readonly versionContribution: unknown;
};

export const JOURNEY_SHAPE_CATALOG_VERSION = "journey-shapes:v1";

const commonValidationRules = [
  "root_option_count_within_bounds",
  "options_match_shape_topology",
  "option_values_are_comparable_for_shape",
];

function versionContribution(id: JourneyShapeId, topology: JourneyTopology) {
  return {
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    id,
    topology,
  };
}

function freezeSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeSerializable));
  }

  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          freezeSerializable(nestedValue),
        ]),
      ),
    );
  }

  return value;
}

function cloneSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSerializable);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneSerializable(nestedValue),
      ]),
    );
  }

  return value;
}

function freezeShapeDefinition(
  definition: JourneyShapeDefinition,
): JourneyShapeDefinition {
  return Object.freeze({
    ...definition,
    rootOptionCount: Object.freeze({ ...definition.rootOptionCount }),
    supportedTags: Object.freeze([...definition.supportedTags]),
    validationRules: Object.freeze([...definition.validationRules]),
    repairPreferences: Object.freeze([...definition.repairPreferences]),
    versionContribution: freezeSerializable(definition.versionContribution),
  });
}

const shapeDefinitions: readonly JourneyShapeDefinition[] = [
  {
    id: "random_allocation",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 4 },
    supportedTags: ["reward", "cost", "burden", "eclectic", "menu"],
    validationRules: [
      ...commonValidationRules,
      "options_share_scene_frame_without_required_symmetry",
      "each_option_has_independent_payload",
    ],
    repairPreferences: [
      "rebalance_outlier_option_value",
      "replace_off-theme_option",
      "reduce_to_three_authored_options",
    ],
    debugLabel: "Random allocation",
    versionContribution: versionContribution("random_allocation", "direct_menu"),
  },
  {
    id: "same_cost_different_rewards",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["cost", "reward", "bargain", "menu"],
    validationRules: [
      ...commonValidationRules,
      "all_options_share_visible_cost",
      "each_option_contains_real_reward",
    ],
    repairPreferences: [
      "normalize_cost_to_shared_amount",
      "replace_pure_burden_option",
      "rebalance_reward_values",
    ],
    debugLabel: "Same cost, different rewards",
    versionContribution: versionContribution(
      "same_cost_different_rewards",
      "direct_menu",
    ),
  },
  {
    id: "same_reward_different_costs",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["reward", "cost", "ambition", "menu"],
    validationRules: [
      ...commonValidationRules,
      "all_options_share_reward_class",
      "higher_costs_are_justified_by_higher_reward_quality",
    ],
    repairPreferences: [
      "align_reward_class",
      "lower_overpriced_cost",
      "increase_underpriced_reward_quality",
    ],
    debugLabel: "Same reward, different costs",
    versionContribution: versionContribution(
      "same_reward_different_costs",
      "direct_menu",
    ),
  },
  {
    id: "service_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["service", "reward", "target", "menu"],
    validationRules: [
      ...commonValidationRules,
      "services_share_unified_vendor_frame",
      "each_service_is_desirable_in_some_run_state",
    ],
    repairPreferences: [
      "replace_low_utility_service",
      "tighten_shared_scene_frame",
      "rebalance_service_values",
    ],
    debugLabel: "Service menu",
    versionContribution: versionContribution("service_menu", "direct_menu"),
  },
  {
    id: "shop_row",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["shop", "cost", "essence", "reward", "menu"],
    validationRules: [
      ...commonValidationRules,
      "each_option_has_flat_visible_price",
      "prices_are_nonnegative_and_affordable_for_stage",
    ],
    repairPreferences: [
      "clamp_price_to_stage_band",
      "replace_unpriced_offer",
      "rebalance_shop_row_value",
    ],
    debugLabel: "Shop row",
    versionContribution: versionContribution("shop_row", "direct_menu"),
  },
  {
    id: "curated_reward_trio",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: ["reward", "curated", "card", "dreamsign", "early"],
    validationRules: [
      ...commonValidationRules,
      "exactly_three_positive_options",
      "options_have_clear_internal_order",
    ],
    repairPreferences: [
      "replace_nonpositive_option",
      "restore_three_option_trio",
      "tighten_reward_theme",
    ],
    debugLabel: "Curated reward trio",
    versionContribution: versionContribution(
      "curated_reward_trio",
      "direct_menu",
    ),
  },
  {
    id: "heterogeneous_pair",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["reward", "comparison", "two_axis", "menu"],
    validationRules: [
      ...commonValidationRules,
      "exactly_two_options",
      "options_operate_on_distinct_axes",
    ],
    repairPreferences: [
      "replace_matching_axis_option",
      "rebalance_pair_values",
      "clarify_axis_difference",
    ],
    debugLabel: "Heterogeneous pair",
    versionContribution: versionContribution(
      "heterogeneous_pair",
      "direct_menu",
    ),
  },
  {
    id: "one_target_many_operations",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["target", "operation", "card", "dreamsign", "rewrite"],
    validationRules: [
      ...commonValidationRules,
      "all_options_share_one_target",
      "operations_are_valid_for_target_class",
    ],
    repairPreferences: [
      "replace_invalid_operation_for_target",
      "choose_safer_target",
      "rebalance_operation_values",
    ],
    debugLabel: "One target, many operations",
    versionContribution: versionContribution(
      "one_target_many_operations",
      "direct_menu",
    ),
  },
  {
    id: "staged_assembly",
    topology: "sequential",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["assembly", "sequence", "card", "dreamsign", "reward"],
    validationRules: [
      ...commonValidationRules,
      "stages_build_one_final_reward",
      "component_choices_are_internally_compatible",
      "no_custom_cards_or_custom_dreamsigns",
    ],
    repairPreferences: [
      "replace_incompatible_component",
      "fall_back_to_existing_catalog_object",
      "shorten_to_two_stage_assembly",
    ],
    debugLabel: "Staged assembly",
    versionContribution: versionContribution("staged_assembly", "sequential"),
  },
  {
    id: "mirrored_operations",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["operation", "symmetry", "target", "rewrite"],
    validationRules: [
      ...commonValidationRules,
      "operations_are_tightly_parallel",
      "operations_share_target_polarity",
    ],
    repairPreferences: [
      "restore_operation_symmetry",
      "replace_polarity_mismatch",
      "rebalance_mirrored_values",
    ],
    debugLabel: "Mirrored operations",
    versionContribution: versionContribution(
      "mirrored_operations",
      "direct_menu",
    ),
  },
  {
    id: "one_operation_many_targets",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["operation", "target", "card", "dreamsign", "rewrite"],
    validationRules: [
      ...commonValidationRules,
      "all_options_share_one_operation",
      "all_targets_are_valid_for_operation",
    ],
    repairPreferences: [
      "replace_invalid_target",
      "align_operation_across_options",
      "rebalance_target_values",
    ],
    debugLabel: "One operation, many targets",
    versionContribution: versionContribution(
      "one_operation_many_targets",
      "direct_menu",
    ),
  },
  {
    id: "choose_your_loss",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["loss", "burden", "triage", "negative", "menu"],
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
  },
  {
    id: "single_reward",
    topology: "single_reward",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["reward", "boon", "cleanse", "single"],
    validationRules: [
      "root_option_count_within_bounds",
      "single_option_is_deterministic_reward",
      "option_has_no_meaningful_cost_or_refusal_tension",
    ],
    repairPreferences: [
      "remove_cost_or_burden",
      "collapse_extra_options",
      "replace_with_simple_reward",
    ],
    debugLabel: "Single reward",
    versionContribution: versionContribution("single_reward", "single_reward"),
  },
  {
    id: "single_offer",
    topology: "single_offer_refusal",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["offer", "cost", "reward", "refusal", "bargain"],
    validationRules: [
      ...commonValidationRules,
      "one_take_option_and_one_refusal_option",
      "take_option_has_visible_meaningful_trade",
    ],
    repairPreferences: [
      "add_refusal_option",
      "make_trade_cost_visible",
      "rebalance_offer_value",
    ],
    debugLabel: "Single offer",
    versionContribution: versionContribution(
      "single_offer",
      "single_offer_refusal",
    ),
  },
  {
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
    repairPreferences: [
      "add_skip_option",
      "move_guaranteed_cost_to_single_offer",
      "bound_random_downside",
    ],
    debugLabel: "Risk or skip",
    versionContribution: versionContribution(
      "risk_or_skip",
      "single_offer_refusal",
    ),
  },
  {
    id: "single_wager",
    topology: "random_commit",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["wager", "random", "cost", "reward", "commit"],
    validationRules: [
      ...commonValidationRules,
      "known_stake_is_visible_before_commit",
      "reward_outcome_is_bounded_random_envelope",
    ],
    repairPreferences: [
      "make_stake_visible",
      "bound_reward_outcomes",
      "collapse_repeated_wager_steps",
    ],
    debugLabel: "Single wager",
    versionContribution: versionContribution("single_wager", "random_commit"),
  },
  {
    id: "now_vs_later",
    topology: "delayed_hook",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["timing", "delayed", "reward", "patience"],
    validationRules: [
      ...commonValidationRules,
      "one_immediate_option_and_one_delayed_option",
      "delayed_reward_is_larger_than_immediate_reward",
    ],
    repairPreferences: [
      "increase_delayed_payoff",
      "clarify_delay_timing",
      "restore_two_option_timing_choice",
    ],
    debugLabel: "Now versus later",
    versionContribution: versionContribution("now_vs_later", "delayed_hook"),
  },
  {
    id: "reward_after_trigger",
    topology: "delayed_hook",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["trigger", "delayed", "reward", "promise"],
    validationRules: [
      "root_option_count_within_bounds",
      "future_reward_has_visible_trigger",
      "future_reward_is_stored_not_applied",
    ],
    repairPreferences: [
      "add_visible_trigger",
      "store_reward_in_precommitted_delayed_metadata",
      "replace_ambiguous_timing",
    ],
    debugLabel: "Reward after trigger",
    versionContribution: versionContribution(
      "reward_after_trigger",
      "delayed_hook",
    ),
  },
  {
    id: "paired_return",
    topology: "delayed_hook",
    rootOptionCount: { min: 1, max: 2 },
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
  {
    id: "timed_window_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["timing", "window", "duration", "reward", "menu"],
    validationRules: [
      ...commonValidationRules,
      "all_options_share_temporary_window",
      "shared_timing_is_primary_scene_identity",
    ],
    repairPreferences: [
      "align_option_timing_window",
      "replace_permanent_effect",
      "rebalance_timed_values",
    ],
    debugLabel: "Timed window menu",
    versionContribution: versionContribution(
      "timed_window_menu",
      "direct_menu",
    ),
  },
  {
    id: "take_any_number",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 5 },
    supportedTags: ["subset", "reward", "cap", "cache", "menu"],
    validationRules: [
      ...commonValidationRules,
      "visible_menu_has_bounded_subset_rule",
      "open_pick_variants_have_cap_or_limiting_structure",
    ],
    repairPreferences: [
      "add_subset_cap",
      "add_shared_burden_or_limit",
      "reduce_visible_menu_size",
    ],
    debugLabel: "Take any number",
    versionContribution: versionContribution("take_any_number", "direct_menu"),
  },
  {
    id: "take_up_to_n",
    topology: "sequential",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["sequence", "cap", "reward", "burden", "stop"],
    validationRules: [
      ...commonValidationRules,
      "sequence_has_visible_max_steps",
      "each_step_changes_stake_or_option_quality",
      "stop_option_available_after_each_pick",
    ],
    repairPreferences: [
      "add_stop_option",
      "increase_later_step_pressure",
      "lower_sequence_cap",
    ],
    debugLabel: "Take up to N",
    versionContribution: versionContribution("take_up_to_n", "sequential"),
  },
  {
    id: "repeat_to_scale",
    topology: "sequential",
    rootOptionCount: { min: 2, max: 3 },
    supportedTags: ["sequence", "scaling", "cost", "reward", "repeat"],
    validationRules: [
      ...commonValidationRules,
      "repeated_payments_scale_final_reward",
      "scaling_axis_is_deterministic_and_visible",
    ],
    repairPreferences: [
      "make_scaling_axis_visible",
      "normalize_repeat_costs",
      "cap_repeat_count",
    ],
    debugLabel: "Repeat to scale",
    versionContribution: versionContribution("repeat_to_scale", "sequential"),
  },
  {
    id: "push_your_luck",
    topology: "sequential",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["sequence", "risk", "random", "reward", "stop"],
    validationRules: [
      ...commonValidationRules,
      "continue_option_increases_uncertain_downside",
      "stop_option_preserves_current_result",
    ],
    repairPreferences: [
      "add_probabilistic_downside",
      "add_stop_option",
      "cap_luck_push_steps",
    ],
    debugLabel: "Push your luck",
    versionContribution: versionContribution("push_your_luck", "sequential"),
  },
  {
    id: "resolved_random_series",
    topology: "random_commit",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["random", "series", "reward", "commit"],
    validationRules: [
      "root_option_count_within_bounds",
      "fixed_random_series_resolves_after_one_commitment",
      "series_outcomes_are_bounded",
    ],
    repairPreferences: [
      "bound_series_length",
      "precommit_random_outcomes",
      "remove_stop_or_continue_loop",
    ],
    debugLabel: "Resolved random series",
    versionContribution: versionContribution(
      "resolved_random_series",
      "random_commit",
    ),
  },
  {
    id: "single_random_outcome",
    topology: "random_commit",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["random", "reward", "commit", "omen"],
    validationRules: [
      "root_option_count_within_bounds",
      "one_bounded_random_outcome_after_entry",
      "random_table_is_visible_or_debug_precommitted",
    ],
    repairPreferences: [
      "bound_random_table",
      "collapse_extra_random_rolls",
      "precommit_random_outcome",
    ],
    debugLabel: "Single random outcome",
    versionContribution: versionContribution(
      "single_random_outcome",
      "random_commit",
    ),
  },
  {
    id: "sequential_offers",
    topology: "sequential",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["sequence", "offer", "reward", "cost", "browse"],
    validationRules: [
      ...commonValidationRules,
      "offers_share_general_type_across_sequence",
      "sequence_menus_are_precommitted",
    ],
    repairPreferences: [
      "align_offer_type",
      "precommit_sequence_menus",
      "add_leave_or_next_option",
    ],
    debugLabel: "Sequential offers",
    versionContribution: versionContribution("sequential_offers", "sequential"),
  },
  {
    id: "escalating_search",
    topology: "sequential",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["sequence", "search", "risk", "cost", "reward"],
    validationRules: [
      ...commonValidationRules,
      "depth_is_primary_reward_axis",
      "deeper_steps_increase_risk_or_cost",
    ],
    repairPreferences: [
      "increase_deeper_layer_reward",
      "increase_deeper_layer_pressure",
      "cap_search_depth",
    ],
    debugLabel: "Escalating search",
    versionContribution: versionContribution("escalating_search", "sequential"),
  },
  {
    id: "commit_now_future_payoff",
    topology: "delayed_hook",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["commitment", "delayed", "reward", "future"],
    validationRules: [
      "root_option_count_within_bounds",
      "commitment_is_visible_immediately",
      "future_payoff_is_significant_and_precommitted",
    ],
    repairPreferences: [
      "clarify_commitment_terms",
      "increase_future_payoff",
      "store_future_payoff_metadata",
    ],
    debugLabel: "Commit now, future payoff",
    versionContribution: versionContribution(
      "commit_now_future_payoff",
      "delayed_hook",
    ),
  },
  {
    id: "alter_dreamscapes",
    topology: "route_edit",
    rootOptionCount: { min: 1, max: 3 },
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
  },
];

export const JOURNEY_SHAPES: readonly JourneyShapeDefinition[] = Object.freeze(
  shapeDefinitions.map(freezeShapeDefinition),
);

const SHAPES_BY_ID = new Map<string, JourneyShapeDefinition>(
  JOURNEY_SHAPES.map((definition) => [definition.id, definition]),
);

if (SHAPES_BY_ID.size !== JOURNEY_SHAPES.length) {
  throw new Error("Duplicate Journey shape IDs in canonical shape catalog.");
}

export function getShapeDefinition(id: JourneyShapeId): JourneyShapeDefinition {
  const definition = SHAPES_BY_ID.get(id);

  if (!definition) {
    throw new Error(`Unknown Journey shape ID: ${id}`);
  }

  return definition;
}

export function canonicalShapeDefinitions(): unknown {
  return {
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    shapes: JOURNEY_SHAPES.map((definition) => ({
      id: definition.id,
      topology: definition.topology,
      rootOptionCount: { ...definition.rootOptionCount },
      supportedTags: [...definition.supportedTags],
      validationRules: [...definition.validationRules],
      repairPreferences: [...definition.repairPreferences],
      debugLabel: definition.debugLabel,
      versionContribution: cloneSerializable(definition.versionContribution),
    })),
  };
}
