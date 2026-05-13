import type { JourneyContext } from "../../../quest/context.js";
import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import { COSTS } from "../../shared/costs.js";
import type { Cost, TemplateParams } from "../../shared/types.js";

const SHAPE_ID = "choose_your_loss";
const LOSS_OPTION_COUNT = 3;
const MINIMUM_LOSS_CEC = 40;
const MAXIMUM_LOSS_RATIO = 2.25;
const MAXIMUM_FALLBACK_LOSS_RATIO = 3.5;

const EXCLUDED_COST_IDS = new Set([
  "gain_random_cards_from_pool",
  "gain_additional_starters",
  "meta_pay_2_costs",
  "pay_max_essence",
  "purge_all_duplicate_cards",
  "remove_transfiguration_from_card",
  "remove_transfigurations_from_random_predicate",
]);

const COST_FAMILIES: Record<string, string> = {
  pay_essence: "resource",
  pay_omens: "resource",
  pay_max_essence: "resource",
  pay_essence_random_range: "resource",
  pay_percent_essence: "resource",
  pay_all_remaining_essence: "resource",
  battle_reward_reduction_flat: "resource_window",
  battle_reward_reduction_percent: "resource_window",
  purge_named_card: "deck",
  purge_random_predicate_card: "deck",
  purge_chosen_predicate_card: "deck",
  transform_card_to_random_pool: "deck",
  purge_all_duplicate_cards: "deck",
  purge_named_dreamsign: "dreamsign",
  purge_random_dreamsign: "dreamsign",
  purge_chosen_dreamsign: "dreamsign",
  transform_dreamsign_to_random: "dreamsign",
  gain_random_banes: "bane",
  gain_named_banes: "bane",
  gain_named_banes_for_X_battles: "bane",
  set_starting_dreamwell_negative: "dreamwell",
  shuffle_negative_dreamwell_cards: "dreamwell",
  remove_transfiguration_from_card: "transfiguration",
  remove_transfigurations_from_random_predicate: "transfiguration",
  draw_X_purge_chosen: "deck",
  remove_shop_sites_from_next_dreamscapes: "route",
  remove_dreamsign_sites_from_next_dreamscapes: "route",
  lose_max_essence: "resource",
};

export type RolledLoss = {
  readonly template: Cost;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
  readonly family: string;
};

function drawFor(
  drawContext: DrawContext,
  template: Cost,
  attempt: number,
): DrawContext {
  return {
    ...drawContext,
    selectionAttempt:
      ((drawContext.selectionAttempt ?? 0) * 1000) +
      attempt * 100 +
      template.id.length,
  };
}

function costIsUsableForLoss(template: Cost): boolean {
  return !EXCLUDED_COST_IDS.has(template.id) && COST_FAMILIES[template.id] !== undefined;
}

function renderLossText(template: Cost, params: TemplateParams, context: JourneyContext): string {
  const rendered = template.render(params as never, context);

  if (template.id !== "purge_named_dreamsign" || rendered.startsWith("[LOCKED] ")) {
    return rendered;
  }

  return rendered.replace(/^Purge /u, "Purge Dreamsign ");
}

function materializeLoss(
  context: JourneyContext,
  drawContext: DrawContext,
  template: Cost,
  attempt: number,
): RolledLoss | undefined {
  if (!costIsUsableForLoss(template)) {
    return undefined;
  }

  const params = template.rollParams(context, drawFor(drawContext, template, attempt));

  if (!template.viable(params as never, context)) {
    return undefined;
  }

  const text = renderLossText(template, params, context);

  if (text.startsWith("[LOCKED] ")) {
    return undefined;
  }

  const convertedEssence = template.cec(params as never, context);

  if (convertedEssence < MINIMUM_LOSS_CEC) {
    return undefined;
  }

  return {
    template,
    params,
    text,
    convertedEssence,
    family: COST_FAMILIES[template.id]!,
  };
}

function lossPool(
  context: JourneyContext,
  drawContext: DrawContext,
): readonly RolledLoss[] {
  const losses: RolledLoss[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const template of COSTS) {
      const loss = materializeLoss(context, drawContext, template, attempt);

      if (loss) {
        losses.push(loss);
      }
    }
  }

  return losses;
}

function withinRatio(
  candidate: RolledLoss,
  anchor: RolledLoss,
  maximumRatio: number,
): boolean {
  const lower = anchor.convertedEssence / maximumRatio;
  const upper = anchor.convertedEssence * maximumRatio;

  return candidate.convertedEssence >= lower && candidate.convertedEssence <= upper;
}

function candidateKey(loss: RolledLoss): string {
  return `${loss.template.id}:${JSON.stringify(loss.params)}`;
}

function uniqueLosses(losses: readonly RolledLoss[]): readonly RolledLoss[] {
  const seen = new Set<string>();
  const unique: RolledLoss[] = [];

  for (const loss of losses) {
    const key = candidateKey(loss);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(loss);
  }

  return unique;
}

function pickNextLoss(
  drawContext: DrawContext,
  row: number,
  candidates: readonly RolledLoss[],
  selected: readonly RolledLoss[],
): RolledLoss {
  const usedKeys = new Set(selected.map(candidateKey));
  const usedFamilies = new Set(selected.map((loss) => loss.family));
  const unused = candidates.filter((loss) => !usedKeys.has(candidateKey(loss)));
  const newFamily = unused.filter((loss) => !usedFamilies.has(loss.family));
  const pool = newFamily.length > 0 ? newFamily : unused;

  if (pool.length === 0) {
    throw new Error(`${SHAPE_ID} fill could not select distinct loss row ${row}`);
  }

  return weightedChoice(
    {
      ...drawContext,
      sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + row,
    },
    `${SHAPE_ID}:loss:${row}`,
    pool.map((loss) => ({
      item: loss,
      weight: loss.template.weight,
    })),
  );
}

export function chooseLosses(
  context: JourneyContext,
  drawContext: DrawContext,
): readonly RolledLoss[] {
  const allLosses = uniqueLosses(lossPool(context, drawContext));

  if (allLosses.length < LOSS_OPTION_COUNT) {
    throw new Error(`${SHAPE_ID} fill requires at least ${LOSS_OPTION_COUNT} viable shared costs`);
  }

  const anchor = weightedChoice(
    drawContext,
    `${SHAPE_ID}:anchor-loss`,
    allLosses.map((loss) => ({
      item: loss,
      weight: loss.template.weight,
    })),
  );
  const comparable = allLosses.filter((loss) =>
    withinRatio(loss, anchor, MAXIMUM_LOSS_RATIO)
  );
  const fallback = allLosses.filter((loss) =>
    withinRatio(loss, anchor, MAXIMUM_FALLBACK_LOSS_RATIO)
  );
  const candidates = comparable.length >= LOSS_OPTION_COUNT
    ? comparable
    : fallback.length >= LOSS_OPTION_COUNT ? fallback : allLosses;
  const selected: RolledLoss[] = [anchor];

  while (selected.length < LOSS_OPTION_COUNT) {
    selected.push(
      pickNextLoss(drawContext, selected.length + 1, candidates, selected),
    );
  }

  return selected;
}
