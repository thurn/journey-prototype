import type { JourneyContext } from "../../../quest/context.js";
import {
  weightedChoice,
  type DrawContext,
} from "../../../util/rng.js";
import type { ResolvedShapeFill } from "../../fillers/shared.js";
import type { JourneyStage } from "../../manifest.js";
import type { JourneyShapeId } from "../../shapes.js";
import {
  COMPOUND_BUNDLE_FAMILIES,
  buildBundleFamilyOption,
  type CompoundBundleFamily,
} from "./compoundBundleFamilies.js";

/**
 * Selects one of the registered compound bundle families (by weight, or by
 * the caller-supplied family identifier) and delegates to
 * `buildBundleFamilyOption` to produce a single fill option from the
 * declarative cost/reward sources for that family. New families are added by
 * appending entries to `COMPOUND_BUNDLE_FAMILIES`; no edits to this dispatch
 * are required.
 */
export function compoundPayloadMenuFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  family?: CompoundBundleFamily["id"];
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): ResolvedShapeFill | undefined {
  const family = args.family
    ? COMPOUND_BUNDLE_FAMILIES.find((f) => f.id === args.family)
    : weightedChoice(
        args.drawContext,
        `${args.label}:compound-family`,
        COMPOUND_BUNDLE_FAMILIES.map((f) => ({ item: f, weight: f.weight })),
      );
  if (!family) return undefined;

  const option = buildBundleFamilyOption({
    context: args.context,
    drawContext: args.drawContext,
    family,
    label: args.label,
    stage: args.stage,
    shapeId: args.shapeId,
  });
  if (!option) return undefined;

  return { fillKind: family.fillKind, options: [option] };
}
