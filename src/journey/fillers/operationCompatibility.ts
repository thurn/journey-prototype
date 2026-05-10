export type OperationCompatibilityTrait =
  | "needs_single_target"
  | "needs_all_matching_scope"
  | "needs_named_target"
  | "needs_drafted_target"
  | "needs_random_predicate_target"
  | "needs_deck_side"
  | "needs_named_card_path"
  | "produces_deck_mutation"
  | "produces_text_or_subtype_mutation"
  | "produces_keyword_mutation"
  | "produces_target_restriction";

export type SlotProvidedCapability =
  | "single_target"
  | "all_matching_scope"
  | "named_target"
  | "drafted_target"
  | "random_predicate_target"
  | "deck_side"
  | "named_card_path"
  | "deck_mutation_consumer"
  | "text_or_subtype_mutation_consumer"
  | "keyword_mutation_consumer"
  | "target_restriction_consumer";

export type SlotCapability = {
  readonly provides: readonly SlotProvidedCapability[];
};

const TRAIT_TO_CAPABILITY: Record<
  OperationCompatibilityTrait,
  SlotProvidedCapability
> = {
  needs_single_target: "single_target",
  needs_all_matching_scope: "all_matching_scope",
  needs_named_target: "named_target",
  needs_drafted_target: "drafted_target",
  needs_random_predicate_target: "random_predicate_target",
  needs_deck_side: "deck_side",
  needs_named_card_path: "named_card_path",
  produces_deck_mutation: "deck_mutation_consumer",
  produces_text_or_subtype_mutation: "text_or_subtype_mutation_consumer",
  produces_keyword_mutation: "keyword_mutation_consumer",
  produces_target_restriction: "target_restriction_consumer",
};

export function slotAcceptsOperation(
  slot: { readonly provides: readonly SlotProvidedCapability[] },
  entry: { readonly compatibilityTraits: readonly OperationCompatibilityTrait[] },
): boolean {
  const provides = new Set(slot.provides);

  return entry.compatibilityTraits.every((trait) =>
    provides.has(TRAIT_TO_CAPABILITY[trait]),
  );
}
