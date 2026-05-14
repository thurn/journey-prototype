import type { JourneyContext } from "../../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../../util/rng.js";
import type { JourneyStage, JourneyTree, JourneyTreeBranch } from "../../manifest.js";
import {
  buildTreeBranchOperations,
  buildTreeTerminalOperations,
} from "../../operationBuilders.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";

type EscalatingReward = {
  readonly text: string;
  readonly effects: readonly unknown[];
  readonly effect: number;
};

type EscalatingRewardTemplateId =
  | "gain_essence"
  | "gain_omens"
  | "increase_max_essence"
  | "duplicate_chosen_cards"
  | "make_random_cards_reclaim"
  | "choose_1_of_X_dreamsigns";

type EscalatingRewardProfile = {
  readonly rewardId: EscalatingRewardTemplateId;
  readonly sharedProperty: string;
  readonly variedProperty: string;
  readonly rows: readonly [
    TemplateParams,
    TemplateParams,
    TemplateParams,
  ];
};

type TreeBranchArgs = {
  id: string;
  label: string;
  text: string;
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  cost?: number;
  effect?: number;
  nextNodeId?: string;
  terminal?: {
    readonly text: string;
    readonly outcome: NonNullable<JourneyTreeBranch["terminal"]>["outcome"];
    readonly costs?: readonly unknown[];
    readonly effects?: readonly unknown[];
    readonly burdens?: readonly unknown[];
    readonly targets?: readonly unknown[];
    readonly routeEffects?: readonly unknown[];
  };
};

const COSTS: Record<JourneyStage, readonly [number, number, number]> = {
  early: [10, 25, 45],
  mid: [35, 80, 145],
  late: [45, 95, 165],
};

const OMEN_COUNTS: Record<JourneyStage, readonly [number, number, number]> = {
  early: [1, 2, 3],
  mid: [2, 4, 6],
  late: [3, 6, 9],
};

const REWARD_PROFILES = {
  early: [
    rewardProfile(
      "gain_essence",
      "essence reward family",
      "strictly increasing essence amount",
      [{ x: 45 }, { x: 90 }, { x: 150 }],
    ),
    rewardProfile(
      "gain_omens",
      "omen reward family",
      "strictly increasing omen count",
      omenRows(OMEN_COUNTS.early),
    ),
    rewardProfile(
      "increase_max_essence",
      "maximum-essence reward family",
      "strictly increasing maximum-essence amount",
      [{ amount: 70 }, { amount: 140 }, { amount: 240 }],
    ),
    rewardProfile(
      "duplicate_chosen_cards",
      "chosen-card duplication reward family",
      "strictly increasing duplicate count",
      [{ count: 1 }, { count: 2 }, { count: 3 }],
    ),
    rewardProfile(
      "make_random_cards_reclaim",
      "random-card Reclaim reward family",
      "strictly increasing random-card count with fixed Reclaim amount",
      [
        { count: 1, reclaim: 2 },
        { count: 2, reclaim: 2 },
        { count: 3, reclaim: 2 },
      ],
    ),
    rewardProfile(
      "choose_1_of_X_dreamsigns",
      "Dreamsign choice reward family",
      "strictly increasing Dreamsign choice count",
      [{ choices: 2 }, { choices: 3 }, { choices: 4 }],
    ),
  ],
  mid: [
    rewardProfile(
      "gain_essence",
      "essence reward family",
      "strictly increasing essence amount",
      [{ x: 90 }, { x: 175 }, { x: 300 }],
    ),
    rewardProfile(
      "gain_omens",
      "omen reward family",
      "strictly increasing omen count",
      omenRows(OMEN_COUNTS.mid),
    ),
    rewardProfile(
      "increase_max_essence",
      "maximum-essence reward family",
      "strictly increasing maximum-essence amount",
      [{ amount: 110 }, { amount: 210 }, { amount: 340 }],
    ),
    rewardProfile(
      "duplicate_chosen_cards",
      "chosen-card duplication reward family",
      "strictly increasing duplicate count",
      [{ count: 2 }, { count: 3 }, { count: 4 }],
    ),
    rewardProfile(
      "make_random_cards_reclaim",
      "random-card Reclaim reward family",
      "strictly increasing random-card count with fixed Reclaim amount",
      [
        { count: 2, reclaim: 2 },
        { count: 4, reclaim: 2 },
        { count: 6, reclaim: 2 },
      ],
    ),
    rewardProfile(
      "choose_1_of_X_dreamsigns",
      "Dreamsign choice reward family",
      "strictly increasing Dreamsign choice count",
      [{ choices: 2 }, { choices: 3 }, { choices: 4 }],
    ),
  ],
  late: [
    rewardProfile(
      "gain_essence",
      "essence reward family",
      "strictly increasing essence amount",
      [{ x: 130 }, { x: 250 }, { x: 430 }],
    ),
    rewardProfile(
      "gain_omens",
      "omen reward family",
      "strictly increasing omen count",
      omenRows(OMEN_COUNTS.late),
    ),
    rewardProfile(
      "increase_max_essence",
      "maximum-essence reward family",
      "strictly increasing maximum-essence amount",
      [{ amount: 140 }, { amount: 260 }, { amount: 380 }],
    ),
    rewardProfile(
      "duplicate_chosen_cards",
      "chosen-card duplication reward family",
      "strictly increasing duplicate count",
      [{ count: 2 }, { count: 4 }, { count: 5 }],
    ),
    rewardProfile(
      "make_random_cards_reclaim",
      "random-card Reclaim reward family",
      "strictly increasing random-card count with fixed Reclaim amount",
      [
        { count: 3, reclaim: 2 },
        { count: 5, reclaim: 2 },
        { count: 8, reclaim: 2 },
      ],
    ),
    rewardProfile(
      "choose_1_of_X_dreamsigns",
      "Dreamsign choice reward family",
      "strictly increasing Dreamsign choice count",
      [{ choices: 2 }, { choices: 3 }, { choices: 4 }],
    ),
  ],
} as const satisfies Record<JourneyStage, readonly EscalatingRewardProfile[]>;

function omenRows(
  counts: readonly [number, number, number],
): readonly [TemplateParams, TemplateParams, TemplateParams] {
  return [
    { x: counts[0] },
    { x: counts[1] },
    { x: counts[2] },
  ];
}

function rewardProfile(
  rewardId: EscalatingRewardTemplateId,
  sharedProperty: string,
  variedProperty: string,
  rows: readonly [
    TemplateParams,
    TemplateParams,
    TemplateParams,
  ],
): EscalatingRewardProfile {
  return {
    rewardId,
    sharedProperty,
    variedProperty,
    rows,
  };
}

function treeBranch(args: TreeBranchArgs): JourneyTreeBranch {
  const costs = [...(args.costs ?? [])];
  const effects = [...(args.effects ?? [])];
  const terminal = args.terminal
    ? {
        text: args.terminal.text,
        outcome: args.terminal.outcome,
        operations: [],
        costs,
        effects,
        burdens: [],
        targets: [],
        routeEffects: [],
      }
    : undefined;
  const branch = {
    id: args.id,
    label: args.label,
    kind: "player_choice" as const,
    text: args.text,
    operations: [],
    costs,
    effects,
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: args.cost ?? 0,
    effectConvertedEssence: args.effect ?? 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: (args.effect ?? 0) - (args.cost ?? 0),
    ...(args.nextNodeId ? { nextNodeId: args.nextNodeId } : {}),
    ...(terminal ? { terminal } : {}),
  };

  return {
    ...branch,
    operations: buildTreeBranchOperations(branch),
    ...(branch.terminal
      ? {
          terminal: {
            ...branch.terminal,
            operations: buildTreeTerminalOperations(
              branch.terminal,
              `tree:${branch.id}:terminal`,
            ),
          },
        }
      : {}),
  };
}

function tree(nodes: JourneyTree["nodes"]): JourneyTree {
  return {
    rootNodeId: nodes[0]?.id ?? "level-1",
    nodes,
  };
}

function cost(amount: number): Record<string, unknown> {
  return {
    kind: "essence",
    amount,
    timing: "immediate",
  };
}

function sharedRewardPayload(
  context: JourneyContext,
  profile: EscalatingRewardProfile,
  params: TemplateParams,
  escalationTier: string,
): EscalatingReward {
  const templateId = profile.rewardId;
  const template = getReward(templateId);
  const text = template.render(params, context);
  const convertedEssence = template.cec(params, context);

  return {
    text: `${text.charAt(0).toLowerCase()}${text.slice(1)}.`,
    effects: [
      {
        kind: "shared_reward_template",
        templateId,
        params,
        text,
        convertedEssence,
        rewardFamily: templateId,
        rewardFamilyLabel: profile.sharedProperty,
        rewardEscalationAxis: profile.variedProperty,
        escalationTier,
      },
    ],
    effect: convertedEssence,
  };
}

function profileIsViable(
  profile: EscalatingRewardProfile,
  context: JourneyContext,
): boolean {
  const reward = getReward(profile.rewardId);

  return profile.rows.every((params) =>
    reward.viable(params, context)
  );
}

function rewardsFor(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): readonly EscalatingReward[] {
  const profiles = REWARD_PROFILES[stage];
  const viableProfiles = profiles.filter((profile) =>
    profileIsViable(profile, context)
  );
  const selectedProfile = shuffleDeterministic(
    drawContext,
    `escalating-chain:reward-profile:${stage}`,
    viableProfiles.length > 0 ? viableProfiles : profiles,
  )[0]!;

  return selectedProfile.rows.map((params, index) =>
    sharedRewardPayload(
      context,
      selectedProfile,
      params,
      `tier_${index + 1}`,
    )
  );
}

export function buildEscalatingRewardChainTree(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): JourneyTree {
  const rewards = rewardsFor(context, drawContext, stage);
  const costs = COSTS[stage];

  return tree(
    rewards.map((reward, index) => {
      const level = index + 1;
      const price = costs[index]!;
      const isFinal = level === rewards.length;
      const takeCost = cost(price);

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: "Leave.",
            terminal: {
              text: "Leave.",
              outcome: "leave",
              costs: [],
              effects: [],
              burdens: [],
              targets: [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-take`,
            label: "Take",
            text: `Pay ${price} essence and ${reward.text} ${isFinal ? "End the Journey." : `Go to Level ${level + 1}.`}`,
            costs: [takeCost],
            effects: reward.effects,
            cost: price,
            effect: reward.effect,
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [takeCost],
                    effects: reward.effects,
                    burdens: [],
                    targets: [],
                    routeEffects: [],
                  },
                }
              : { nextNodeId: `level-${level + 1}` }),
          }),
        ],
      };
    }),
  );
}
