import type { JourneyOption } from "../../manifest.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { chooseLosses, type RolledLoss } from "./losses.js";

type SharedCostLossPayload = {
  readonly kind: "shared_cost_template";
  readonly templateId: string;
  readonly params: unknown;
  readonly text: string;
  readonly convertedEssence: number;
  readonly family: string;
};

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function payloadFor(loss: RolledLoss): SharedCostLossPayload {
  return {
    kind: "shared_cost_template",
    templateId: loss.template.id,
    params: loss.params,
    text: loss.text,
    convertedEssence: loss.convertedEssence,
    family: loss.family,
  };
}

function lossOption(number: number, loss: RolledLoss): JourneyOption {
  return {
    number,
    symbols: ["loss", loss.family],
    text: sentence(loss.text),
    operations: [],
    costs: [payloadFor(loss)],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: loss.convertedEssence,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: -loss.convertedEssence,
    pickBehavior: "record_and_generate_next",
  };
}

export function chooseYourLossFill(args: ShapeFillArgs): FilledJourney {
  return {
    options: chooseLosses(args.context, args.drawContext).map((loss, index) =>
      lossOption(index + 1, loss)
    ),
    precommitted: {},
  };
}
