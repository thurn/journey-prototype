import type { ContentBundle } from "../content/model.js";
import type { JourneyState } from "../state/schema.js";

export type JourneyContext = {
  projectRoot: string;
  content: ContentBundle;
  state: JourneyState;
  contentVersion: string;
};

export function buildJourneyContext(args: JourneyContext): JourneyContext {
  if (args.state.contentVersion !== args.contentVersion) {
    throw new Error("Journey context contentVersion does not match state contentVersion");
  }

  return args;
}
