export {
  canonicalShapeDefinitions,
  getShapeDefinition,
  getShapePlugin,
  isJourneyShapeId,
  journeyShapeDefinitions,
  journeyShapePlugins,
} from "./shapes/registry.js";
export { JOURNEY_SHAPE_CATALOG_VERSION } from "./shapes/shared.js";
export type {
  FilledJourney,
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
  JourneyTopology,
  ShapeFillArgs,
  ShapeValidator,
} from "./shapes/types.js";

import { journeyShapeDefinitions } from "./shapes/registry.js";

export const JOURNEY_SHAPES = journeyShapeDefinitions();
