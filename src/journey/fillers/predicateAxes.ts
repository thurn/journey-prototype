import { drawInt, type DrawContext } from "../../util/rng.js";

export type PredicateAxis<TName extends string = string, TValue = unknown> = {
  readonly name: TName;
  readonly values: readonly TValue[];
};

export function expandPredicateAxes(
  axes: readonly PredicateAxis[],
): readonly Record<string, unknown>[] {
  if (axes.length === 0) return [{}];
  const [head, ...rest] = axes;
  const tail = expandPredicateAxes(rest);
  const out: Record<string, unknown>[] = [];
  for (const value of head!.values) {
    for (const tailEntry of tail) {
      out.push({ [head!.name]: value, ...tailEntry });
    }
  }
  return out;
}

export function pickAxisPoint(
  drawContext: DrawContext,
  axes: readonly PredicateAxis[],
): Record<string, unknown> {
  const point: Record<string, unknown> = {};
  for (const axis of axes) {
    const index = drawInt(
      drawContext,
      `predicate-axis:${axis.name}`,
      0,
      axis.values.length - 1,
    );
    point[axis.name] = axis.values[index];
  }
  return point;
}
