import type { JourneyShapeId } from "./shapes.js";

export type JourneyManifest = {
  schemaVersion: 1;
  journeyId: string;
  seed: string;
  rootJourneyIndex: number;
  shapeId: JourneyShapeId;
};
