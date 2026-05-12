// src/journey/shapes/mirrored_operations/fill.ts
import type { JourneyContext } from "../../../quest/context.js";
import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption } from "../../manifest.js";
import { getReward } from "../../shared/rewards.js";
import type { Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

type MirrorGroup = {
  readonly id: string;
  readonly symbols: readonly string[];
  readonly rewardIds: readonly string[];
};

type RolledReward = {
  readonly template: Reward;
  readonly params: unknown;
  readonly cec: number;
};

const MIRROR_GROUPS: readonly MirrorGroup[] = Object.freeze([
  {
    id: "starter_rewrite",
    symbols: ["rewrite", "target"],
    rewardIds: [
      "transfigure_random_starters",
      "transfigure_all_starters",
      "purge_named_starter",
      "purge_random_starter",
      "purge_random_starter_with_predicate_replacement",
      "transform_starter_into_named_card",
      "transfigure_chosen_starters",
      "purge_chosen_starters",
      "purge_all_starters",
      "replace_starter_via_draft",
    ],
  },
  {
    id: "deck_rewrite",
    symbols: ["rewrite", "target"],
    rewardIds: [
      "apply_chosen_transfiguration_to_chosen_card",
      "apply_named_transfiguration_to_card_name",
      "change_card_to_become_type",
      "make_card_reclaim",
      "duplicate_named_card_X",
      "duplicate_chosen_cards",
      "draw_X_and_duplicate_chosen",
      "transform_card_in_deck_into_named",
      "temporary_card_copy_for_X_battles",
    ],
  },
  {
    id: "predicate_rewrite",
    symbols: ["rewrite", "target"],
    rewardIds: [
      "apply_named_transfiguration_to_chosen_predicate_cards",
      "purge_chosen_predicate_cards",
      "purge_chosen_predicate_with_replacement",
      "transform_chosen_predicate_into_named",
      "duplicate_random_predicate",
      "apply_named_transfiguration_to_all_predicate_cards",
      "apply_random_transfigurations_to_random_cards",
    ],
  },
  {
    id: "dreamsign_rewrite",
    symbols: ["dreamsign", "rewrite"],
    rewardIds: [
      "gain_named_dreamsign",
      "choose_1_of_X_dreamsigns",
      "gain_copy_of_random_dreamsign",
      "gain_copy_of_chosen_dreamsign",
      "transform_dreamsign_to_named",
      "temporary_dreamsign_for_X_battles",
    ],
  },
]);

function emptyOption(
  number: number,
  text: string,
  symbols: readonly string[],
  cec: number,
): JourneyOption {
  return {
    number,
    symbols: [...symbols],
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: cec,
    pickBehavior: "record_and_generate_next",
  };
}

function rollReward(
  ctx: JourneyContext,
  draw: DrawContext,
  template: Reward,
  groupIndex: number,
  rewardIndex: number,
): RolledReward | undefined {
  const params = template.rollParams(ctx, {
    ...draw,
    sequenceStep: (draw.sequenceStep ?? 0) * 100 + groupIndex,
    selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + rewardIndex,
  });
  if (!template.viable(params as never, ctx)) return undefined;
  const cec = template.cec(params as never, ctx);
  if (cec <= 0) return undefined;
  return { template, params, cec };
}

function rolledGroup(
  ctx: JourneyContext,
  draw: DrawContext,
  group: MirrorGroup,
  groupIndex: number,
): { group: MirrorGroup; rewards: readonly RolledReward[] } | undefined {
  const rewards = group.rewardIds.flatMap((id, rewardIndex) => {
    const rolled = rollReward(ctx, draw, getReward(id), groupIndex, rewardIndex);
    return rolled ? [rolled] : [];
  });

  if (rewards.length < 3) return undefined;
  return { group, rewards };
}

function pickRows(
  draw: DrawContext,
  groupId: string,
  rewards: readonly RolledReward[],
): readonly RolledReward[] {
  const picked: RolledReward[] = [];
  const remaining = [...rewards];

  for (let rowIndex = 1; rowIndex <= 3; rowIndex += 1) {
    const next = weightedChoice(
      {
        ...draw,
        sequenceStep: (draw.sequenceStep ?? 0) * 100 + rowIndex,
      },
      `mo:${groupId}:row${rowIndex}`,
      remaining.map((reward) => ({
        item: reward,
        weight: reward.template.weight,
      })),
    );
    picked.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  return picked;
}

export function mirroredOperationsFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const viableGroups = MIRROR_GROUPS.flatMap((group, groupIndex) => {
    const rolled = rolledGroup(context, drawContext, group, groupIndex);
    return rolled ? [rolled] : [];
  });

  if (viableGroups.length === 0) {
    throw new Error("mirrored_operations fill could not find three viable mirrored operations");
  }

  const selected = weightedChoice(
    drawContext,
    "mo:group",
    viableGroups.map((entry) => ({
      item: entry,
      weight: entry.rewards.reduce((total, reward) => total + reward.template.weight, 0),
    })),
  );
  const rows = pickRows(drawContext, selected.group.id, selected.rewards);

  return {
    options: rows.map((row, index) =>
      emptyOption(
        index + 1,
        row.template.render(row.params as never, context),
        selected.group.symbols,
        row.cec,
      )
    ),
    precommitted: {},
  };
}
