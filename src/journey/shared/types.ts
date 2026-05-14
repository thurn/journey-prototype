// src/journey/shared/types.ts
import type { CardTargetPredicate } from "../effects.js";
import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";

export type TemplateParams = Record<string, unknown>;

export type Reward<P extends TemplateParams = TemplateParams> = {
  readonly id: string;
  readonly weight: number;
  rollParams(ctx: JourneyContext, draw: DrawContext): P;
  cec(params: P, ctx: JourneyContext): number;
  viable(params: P, ctx: JourneyContext): boolean;
  render(params: P, ctx: JourneyContext): string;
};

export type Cost<P extends TemplateParams = TemplateParams> = Reward<P>;

// Predicate categories. Random-gain rewards (e.g. "Gain N random <plural>")
// restrict themselves to `ability` and `card-type` predicates because grants
// keyed off raw cost/spark buckets ("Gain 3 random cards with cost 2 or less")
// are not meaningful as a player reward; drafts may still target every kind.
export type PredicateKind = "ability" | "card-type" | "stat-bucket";

export type Predicate = {
  readonly id: string;
  readonly kind: PredicateKind;
  readonly multiplier: number;
  readonly cardPredicate?: CardTargetPredicate;
  readonly text: { readonly singular: string; readonly plural: string };
};
