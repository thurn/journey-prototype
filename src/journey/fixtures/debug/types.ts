import type { DrawContext } from "../../../util/rng.js";
import type { JourneyContext } from "../../../quest/context.js";
import type {
  GeneratedObjectDefinition,
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  JourneyTree,
  PrecommittedOutcomes,
} from "../../manifest.js";
import type { JourneyShapeId } from "../../shapes.js";
import type { DebugPayloadSelection } from "./metadata.js";

export type DebugFixtureBuildArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  debugPayload: DebugPayloadSelection;
  baseFilled: {
    options: JourneyOption[];
    tree?: JourneyTree;
    rewardPool?: JourneyRewardPool;
    precommitted: PrecommittedOutcomes;
  };
};

export type DebugFixtureBuildResult = {
  options?: JourneyOption[];
  generatedObjects?: GeneratedObjectDefinition[];
  filled?: {
    options: JourneyOption[];
    tree?: JourneyTree;
    rewardPool?: JourneyRewardPool;
    precommitted: PrecommittedOutcomes;
  };
  precommitted?: PrecommittedOutcomes;
  postProcessOptions?: (options: JourneyOption[]) => JourneyOption[];
};

export type DebugFixtureBuilder = (
  args: DebugFixtureBuildArgs,
) => DebugFixtureBuildResult | undefined;

export type DebugFixtureDefinition = {
  qaId: string;
  build: DebugFixtureBuilder;
};
