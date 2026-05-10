import { symmetryContract } from "./shared.js";
import type { JourneySymmetryContractDebug } from "../manifest.js";

export type SharedAxisRotatedAttributeArgs = {
  readonly options: readonly {
    readonly number: number;
    readonly sharedValue: string;
    readonly rotatedValue: string;
  }[];
  readonly sharedAxis: { readonly kind: string; readonly value: string };
  readonly rotatedAxis: { readonly kind: string };
  readonly weight?: number;
};

export function buildSharedAxisRotatedAttributeContract(
  args: SharedAxisRotatedAttributeArgs,
): JourneySymmetryContractDebug | undefined {
  const { options, sharedAxis, rotatedAxis, weight } = args;
  if (options.length < 2) return undefined;
  if (!options.every((o) => o.sharedValue === sharedAxis.value)) return undefined;
  const rotatedSet = new Set(options.map((o) => o.rotatedValue));
  if (rotatedSet.size !== options.length) return undefined;
  return symmetryContract({
    contractKind: "shared_axis_rotated_attribute",
    sharedProperty: `${sharedAxis.kind}=${sharedAxis.value}`,
    variedProperty: rotatedAxis.kind,
    sharedFirst: true,
    optionNumbers: options.map((o) => o.number),
    sharedPayloadKeys: [`${sharedAxis.kind}=${sharedAxis.value}`],
    variedPayloadKeys: options.map((o) => `${rotatedAxis.kind}=${o.rotatedValue}`),
    ...(weight !== undefined ? { weight } : {}),
  });
}
