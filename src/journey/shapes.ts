export type JourneyShapeId =
  | "random_allocation"
  | "same_cost_different_rewards"
  | "same_reward_different_costs"
  | "service_menu"
  | "shop_row"
  | "curated_reward_trio"
  | "heterogeneous_pair"
  | "one_target_many_operations"
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
  | "push_your_luck"
  | "prize_ladder"
  | "probability_ladder"
  | "random_pool_draws"
  | "escalating_reward_chain"
  | "resolved_random_series"
  | "single_random_outcome"
  | "commit_now_future_payoff"
  | "alter_dreamscapes";

export type JourneyTopology =
  | "direct_menu"
  | "single_offer_refusal"
  | "single_reward"
  | "random_commit"
  | "delayed_hook"
  | "route_edit"
  | "repeatable_menu"
  | "decision_tree";

export type JourneyShapeDefinition = {
  readonly id: JourneyShapeId;
  readonly topology: JourneyTopology;
  readonly rootOptionCount: Readonly<{ min: number; max: number }>;
  readonly supportedTags: readonly string[];
  readonly payloadCompatibility: readonly JourneyPayloadCompatibility[];
  readonly validationRules: readonly string[];
  readonly repairPreferences: readonly string[];
  readonly debugLabel: string;
  readonly versionContribution: unknown;
};

export type JourneyPayloadCompatibility = {
  readonly familyId:
    | "adapter"
    | "card"
    | "dreamsign"
    | "bane"
    | "resource"
    | "route"
    | "shop"
    | "dreamwell"
    | "status"
    | "hook"
    | "return"
    | "random"
    | "generated_object"
    | "decision_tree";
  readonly variants: readonly string[];
  readonly legality: "legal" | "unsupported";
  readonly reason: string;
};

type RawJourneyShapeDefinition = Omit<
  JourneyShapeDefinition,
  "payloadCompatibility"
> & {
  readonly payloadCompatibility?: readonly JourneyPayloadCompatibility[];
};

export const JOURNEY_SHAPE_CATALOG_VERSION = "journey-shapes:v11";

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

function compatibility(
  familyId: JourneyPayloadCompatibility["familyId"],
  variants: readonly string[],
  reason: string,
): JourneyPayloadCompatibility {
  return {
    familyId,
    variants,
    legality: variants.length > 0 ? "legal" : "unsupported",
    reason,
  };
}

function payloadCompatibilityFor(
  definition: RawJourneyShapeDefinition,
): readonly JourneyPayloadCompatibility[] {
  const { id, topology, supportedTags } = definition;
  const isDecisionTree = topology === "decision_tree";
  const isDirectMenu = topology === "direct_menu";
  const isRandomCommit = topology === "random_commit";
  const isDelayedHook = topology === "delayed_hook";
  const hasCard = supportedTags.includes("card") || supportedTags.includes("target") || supportedTags.includes("rewrite");
  const hasDreamsign = supportedTags.includes("dreamsign") || id === "shop_row" || id === "curated_reward_trio";
  const serviceFamilyShape = id === "service_menu";
  const generatedObjectShape = [
    "random_allocation",
    "same_cost_different_rewards",
    "same_reward_different_costs",
    "service_menu",
    "shop_row",
    "curated_reward_trio",
    "one_target_many_operations",
    "mirrored_operations",
    "one_operation_many_targets",
  ].includes(id);

  return Object.freeze([
    compatibility("adapter", ["current"], "All canonical shapes can use the typed adapter payload."),
    compatibility(
      "card",
      [
        ...(serviceFamilyShape ? ["named-card-operation-menu"] : []),
        ...(id === "curated_reward_trio" ? ["starter-cleanup-replacement"] : []),
        ...(hasCard && isDirectMenu ? ["adapter-compatible-card-operations"] : []),
      ],
      hasCard || serviceFamilyShape || id === "curated_reward_trio"
        ? "Shape can expose card targets or card-operation menu rows."
        : "Shape does not expose a legal card-target operation frame.",
    ),
    compatibility(
      "dreamsign",
      [
        ...(id === "shop_row" ? ["named-dreamsign-shop-row"] : []),
        ...(id === "curated_reward_trio" ? ["dreamsign-transform-duplicate-pool"] : []),
        ...(hasDreamsign && isDirectMenu ? ["adapter-compatible-dreamsign-operations"] : []),
      ],
      hasDreamsign
        ? "Shape can expose Dreamsign targets, rewards, shops, or pool edits."
        : "Shape does not expose a legal Dreamsign target or shop frame.",
    ),
    compatibility(
      "bane",
      [
        ...(serviceFamilyShape ? ["bane-gain-purge-transform"] : []),
        ...(id === "choose_your_loss" ? ["adapter-compatible-bane-losses"] : []),
      ],
      serviceFamilyShape || id === "choose_your_loss"
        ? "Shape can frame Bane gain, purge, and transformation decisions."
        : "Shape lacks a controlled Bane-operation or loss-choice frame.",
    ),
    compatibility(
      "resource",
      [
        ...(serviceFamilyShape ? ["resource-edge-cases"] : []),
        ...((isDirectMenu || topology === "single_offer_refusal" || topology === "single_reward") && !serviceFamilyShape
          ? ["adapter-compatible-resource-operations"]
          : []),
      ],
      isDirectMenu || topology === "single_offer_refusal" || topology === "single_reward"
        ? "Shape can compare visible resource costs or rewards."
        : "Shape-specific payloads own resource timing through sequence or commit metadata.",
    ),
    compatibility(
      "route",
      [
        ...(serviceFamilyShape ? ["route-edits"] : []),
        ...(id === "alter_dreamscapes" ? ["adapter-compatible-route-edits"] : []),
      ],
      id === "alter_dreamscapes" || serviceFamilyShape
        ? "Shape can expose route edits without mutating state."
        : "Shape topology is not a route-edit scene.",
    ),
    compatibility(
      "shop",
      id === "shop_row" ? ["shop-economy"] : [],
      id === "shop_row"
        ? "Shape has flat visible prices and shop-row comparison semantics."
        : "Shape lacks a shop row price frame.",
    ),
    compatibility(
      "dreamwell",
      [
        ...(serviceFamilyShape ? ["dreamwell-window"] : []),
        ...(id === "timed_window_menu" ? ["adapter-compatible-dreamwell-window"] : []),
      ],
      serviceFamilyShape || id === "timed_window_menu"
        ? "Shape can expose bounded Dreamwell and battle-window modifiers."
        : "Shape does not provide a shared timing window for Dreamwell payloads.",
    ),
    compatibility(
      "status",
      [
        ...(serviceFamilyShape ? ["status-reward-replacement"] : []),
        ...(id === "timed_window_menu" || id === "now_vs_later"
          ? ["adapter-compatible-status-rules"]
          : []),
      ],
      serviceFamilyShape || id === "timed_window_menu" || id === "now_vs_later"
        ? "Shape can expose one-time, temporary, or delayed rule mutations."
        : "Shape lacks a legal status or rule-mutation frame.",
    ),
    compatibility(
      "hook",
      [
        ...(serviceFamilyShape ? ["delayed-trigger-matrix"] : []),
        ...((isDelayedHook || id === "commit_now_future_payoff") && !serviceFamilyShape
          ? ["adapter-compatible-delayed-hooks"]
          : []),
      ],
      isDelayedHook || serviceFamilyShape || id === "commit_now_future_payoff"
        ? "Shape can store visible delayed hook contracts in precommitted metadata."
        : "Shape has no delayed hook contract surface.",
    ),
    compatibility(
      "return",
      id === "paired_return" ? ["paired-return-seal-borrow-trade"] : [],
      id === "paired_return"
        ? "Shape creates a paired return hook with a specific remembered anchor."
        : "Shape does not create paired return anchors.",
    ),
    compatibility(
      "random",
      [
        ...(id === "single_random_outcome" || id === "resolved_random_series" ? ["reveal-roll-wager"] : []),
        ...((isRandomCommit || ["risk_or_skip", "random_pool_draws", "probability_ladder", "push_your_luck"].includes(id)) &&
          id !== "single_random_outcome" &&
          id !== "resolved_random_series"
          ? ["adapter-compatible-random-envelope"]
          : []),
      ],
      isRandomCommit || ["risk_or_skip", "random_pool_draws", "probability_ladder", "push_your_luck"].includes(id)
        ? "Shape exposes bounded random, reveal, odds, or wager metadata."
        : "Shape is deterministic and does not require random envelope metadata.",
    ),
    compatibility(
      "generated_object",
      generatedObjectShape
        ? id === "curated_reward_trio"
          ? ["generated-card", "generated-dreamsign", "generated-status", "generated-transfiguration"]
          : ["adapter-compatible-generated-objects"]
        : [],
      generatedObjectShape
        ? "Shape can host manifest-local generated object grants or transforms."
        : "Shape topology has no legal manifest-local generated object host.",
    ),
    compatibility(
      "decision_tree",
      isDecisionTree ? ["complete-decision-tree"] : [],
      isDecisionTree
        ? "Shape owns complete multi-level tree visibility."
        : "Shape is not a decision-tree topology.",
    ),
  ]);
}

function freezeShapeDefinition(
  definition: RawJourneyShapeDefinition,
): JourneyShapeDefinition {
  const payloadCompatibility = definition.payloadCompatibility ?? payloadCompatibilityFor(definition);
  const version = {
    ...(definition.versionContribution &&
    typeof definition.versionContribution === "object" &&
    !Array.isArray(definition.versionContribution)
      ? definition.versionContribution
      : { value: definition.versionContribution }),
    payloadCompatibility,
  };

  return Object.freeze({
    ...definition,
    rootOptionCount: Object.freeze({ ...definition.rootOptionCount }),
    supportedTags: Object.freeze([...definition.supportedTags]),
    payloadCompatibility: Object.freeze(payloadCompatibility.map(freezeSerializable)) as readonly JourneyPayloadCompatibility[],
    validationRules: Object.freeze([...definition.validationRules]),
    repairPreferences: Object.freeze([...definition.repairPreferences]),
    versionContribution: freezeSerializable(version),
  });
}

const shapeDefinitions: readonly RawJourneyShapeDefinition[] = [
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
    rootOptionCount: { min: 2, max: 2 },
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
    rootOptionCount: { min: 2, max: 2 },
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
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["trigger", "delayed", "reward", "promise"],
    validationRules: [
      ...commonValidationRules,
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
  {
    id: "timed_window_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["timing", "window", "duration", "reward", "menu"],
    validationRules: [
      ...commonValidationRules,
      "all_options_share_temporary_window",
      "shared_timing_is_primary_scene_identity",
      "timed_window_requires_battle_window",
      "timed_window_resource_only_reward",
      "timed_window_low_impact",
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
  {
    id: "push_your_luck",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "risk", "random", "reward", "stop", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "push_failure_ends_journey",
      "push_rewards_are_mechanically_connected",
    ],
    repairPreferences: [
      "make_failure_terminal",
      "align_reward_family",
      "cap_push_levels",
    ],
    debugLabel: "Push your luck",
    versionContribution: versionContribution("push_your_luck", "decision_tree"),
  },
  {
    id: "prize_ladder",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "ladder", "cost", "reward", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "stop_rewards_scale_coherently",
      "continue_costs_share_family",
    ],
    repairPreferences: [
      "normalize_cost_family",
      "align_stop_reward_family",
      "simplify_ladder_level_count",
    ],
    debugLabel: "Prize ladder",
    versionContribution: versionContribution("prize_ladder", "decision_tree"),
  },
  {
    id: "probability_ladder",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "chance", "cost", "reward", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "fixed_reward_can_be_won_once",
      "attempt_costs_share_family",
    ],
    repairPreferences: [
      "normalize_attempt_costs",
      "make_success_terminal",
      "simplify_ladder_level_count",
    ],
    debugLabel: "Probability ladder",
    versionContribution: versionContribution("probability_ladder", "decision_tree"),
  },
  {
    id: "random_pool_draws",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "random", "pool", "reward", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "pool_is_visible",
      "draw_replacement_policy_is_visible",
    ],
    repairPreferences: [
      "restore_fixed_pool",
      "normalize_draw_cost",
      "cap_draw_count",
    ],
    debugLabel: "Random pool draws",
    versionContribution: versionContribution("random_pool_draws", "decision_tree"),
  },
  {
    id: "escalating_reward_chain",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "reward", "cost", "chain", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "chain_rewards_share_family",
      "take_costs_scale_coherently",
    ],
    repairPreferences: [
      "align_reward_family",
      "normalize_cost_scaling",
      "simplify_chain_level_count",
    ],
    debugLabel: "Escalating reward chain",
    versionContribution: versionContribution("escalating_reward_chain", "decision_tree"),
  },
  {
    id: "resolved_random_series",
    topology: "random_commit",
    rootOptionCount: { min: 2, max: 2 },
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
    rootOptionCount: { min: 2, max: 2 },
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
    id: "commit_now_future_payoff",
    topology: "delayed_hook",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: ["commitment", "delayed", "reward", "future"],
    validationRules: [
      ...commonValidationRules,
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
      payloadCompatibility: cloneSerializable(definition.payloadCompatibility),
      validationRules: [...definition.validationRules],
      repairPreferences: [...definition.repairPreferences],
      debugLabel: definition.debugLabel,
      versionContribution: cloneSerializable(definition.versionContribution),
    })),
  };
}
