// src/journey/shared/types.ts
import type { CardTargetPredicate } from "../effects.js";
import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";

export type TemplateParams = Record<string, unknown>;

export type Reward<P extends TemplateParams = TemplateParams> = {
  readonly id: string;
  readonly weight: number;
  readonly rollParams: (ctx: JourneyContext, draw: DrawContext) => P;
  readonly cec: (params: P, ctx: JourneyContext) => number;
  readonly viable: (params: P, ctx: JourneyContext) => boolean;
  readonly render: (params: P, ctx: JourneyContext) => string;
};

export type Cost<P extends TemplateParams = TemplateParams> = Reward<P>;

export type Predicate = {
  readonly id: string;
  readonly multiplier: number;
  readonly cardPredicate?: CardTargetPredicate;
  readonly text: { readonly singular: string; readonly plural: string };
};
