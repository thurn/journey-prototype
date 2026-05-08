export {
  canonicalShapeDefinitions,
  fallbackShapeIds,
  getShapeDefinition,
  getShapePlugin,
  isJourneyShapeId,
  journeyShapeDefinitions,
  journeyShapePlugins,
} from "./shapes/registry.js";
export { JOURNEY_SHAPE_CATALOG_VERSION } from "./shapes/shared.js";
export type {
  FilledJourney,
  JourneyPayloadCompatibility,
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
  JourneyTopology,
  ShapeDebugPayloadCompatibility,
  ShapeFillArgs,
  ShapeRepairAction,
  ShapeRepairActionKind,
  ShapeValidator,
} from "./shapes/types.js";

import { journeyShapeDefinitions } from "./shapes/registry.js";

export const JOURNEY_SHAPES = journeyShapeDefinitions();
