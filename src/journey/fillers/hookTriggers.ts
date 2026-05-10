import type { HookTriggerSelector } from "../manifest.js";

/**
 * One entry per `HookTriggerSelector["triggerKind"]`. Captures the surface
 * vocabulary (default label / track text / trigger count) plus the small
 * metadata that the cartesian compatibility predicate (`hookCompatibility`)
 * consults when deciding whether a (trigger, resolution) pairing is sensible.
 */
export type TriggerEntry = {
  readonly kind: HookTriggerSelector["triggerKind"];
  readonly defaultLabel: string;
  readonly defaultCount: number;
  readonly trackText: (label: string) => string;
  /** Whether this trigger fires off an in-narrative event the player observes. */
  readonly producesObservableEvent: boolean;
  /** Resource (if any) typically associated with the trigger fire. */
  readonly emitsResource: "essence" | "card" | "bane" | "dreamsign" | "none";
};

export const TRIGGER_REGISTRY: readonly TriggerEntry[] = [
  {
    kind: "battle",
    defaultLabel: "after the next battle",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "none",
  },
  {
    kind: "victory",
    defaultLabel: "after the next victory",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "essence",
  },
  {
    kind: "each_battle",
    defaultLabel: "each battle",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "none",
  },
  {
    kind: "dreamscape",
    defaultLabel: "at the next dreamscape",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "none",
  },
  {
    kind: "site_visit",
    defaultLabel: "on the next site visit",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "none",
  },
  {
    kind: "named_card_play",
    defaultLabel: "the next time you play",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "card",
  },
  {
    kind: "dreamsign_trigger",
    defaultLabel: "the next Dreamsign trigger",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "dreamsign",
  },
  {
    kind: "card_added",
    defaultLabel: "the next card you add",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: true,
    emitsResource: "card",
  },
  {
    kind: "essence_payment",
    defaultLabel: "after paying essence",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: false,
    emitsResource: "essence",
  },
  {
    kind: "future_shop",
    defaultLabel: "at the next future shop",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: false,
    emitsResource: "essence",
  },
  {
    kind: "future_dream_journey",
    defaultLabel: "at the next Dream Journey site",
    defaultCount: 1,
    trackText: (label) => `Track ${label}.`,
    producesObservableEvent: false,
    emitsResource: "none",
  },
];
