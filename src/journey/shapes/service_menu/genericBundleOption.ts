import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyStage } from "../../manifest.js";
import {
  CARD_DRAFT_PROFILES,
  GENERIC_CARD_DRAFT_PROFILE,
  baneBurden,
  cardDraftText,
  cost,
  costSlots,
  draftCards,
  gainEssence,
  pickSequentialVariant,
  randomCardGain,
  randomCardGainText,
  starterCleanup,
  type CardDraftProfile,
} from "../../fillers/shared.js";
import { statusPayload } from "../../fillers/environmentPayloads.js";
import { DEFAULT_BANE_NAME, type BaneName } from "../../effects.js";
import type { DrawContext } from "../../../util/rng.js";

/**
 * Identifier for a card draft profile, expressed at the bundle composer's
 * abstraction layer. This is a coarser vocabulary than the keys of
 * `CARD_DRAFT_PROFILES`; the composer maps each id to a concrete
 * `CardDraftProfile` (or, when no specific profile is requested, the generic
 * "any eligible card" profile).
 *
 * `any_basic` is the catch-all profile used when a family does not constrain
 * the draft pool further. New profile ids should be added here as families
 * surface them in subsequent tasks.
 */
export type BundleCardDraftProfileId =
  | "any_basic"
  | keyof typeof CARD_DRAFT_PROFILES;

/**
 * Trigger axis for the `reward_reduction_burden` cost source. Battles and
 * essence sites use distinct status archetypes; the union keeps this explicit
 * so that the renderer can choose appropriate copy and the value model can
 * pick the matching rule mutation kind.
 */
export type BundleRewardReductionTrigger = "battle" | "essence_site";

/**
 * Identifier for a flavor pool used by the `burden_pool` cost source. The
 * composer maps each pool id onto a deterministic Bane name and a flavor
 * label so that independent rows can advertise distinct burden archetypes
 * (e.g. `scissor_saint_burdens` versus `withered_orchard_burdens`) without
 * each row having to specify its bane name explicitly.
 */
export type BundleBurdenPoolId =
  | "scissor_saint_burdens"
  | "withered_orchard_burdens"
  | "molting_archive_burdens";

/**
 * Timing window for the `delayed_bane` cost source. Values match the
 * `next_N_battles` literals already used by `statusPayload.duration`, the
 * shared "battle window" vocabulary surfaced by `REWARD_REDUCTION_DURATIONS`,
 * and the snake_case duration tokens consumed elsewhere in the project.
 *
 * The composer maps each value to a human label (e.g. `next 2 battles`) for
 * the bundle render text and to a `baneBurden` `timing` string for the
 * downstream payload.
 */
export type BundleDelayedBaneTiming =
  | "next_2_battles"
  | "next_3_battles"
  | "next_4_battles";

/**
 * Declarative descriptor for the cost half of a generic bundle option.
 *
 * Each kind names a self-contained selection strategy. `fixed_essence`
 * encodes a constant essence cost; the remaining kinds reproduce the cost
 * shapes used by the four legacy compound families:
 *
 * - `card_purge_random` matches `cardSacrificeComponent`: purge either a
 *   random Character (when `randomCharacter` is true) or any random deck card.
 * - `reward_reduction_burden` matches `rewardReductionBurdenComponent`: emit a
 *   status that reduces battle or essence-site rewards for a sequenced
 *   duration; amount and duration are picked deterministically from the
 *   `drawContext` at build time.
 * - `low_essence_cost_slot` matches the `mixed_service` shared cost: pick the
 *   `low-essence` slot from `costSlots(...)`.
 * - `delayed_bane` adds a Bane obligation that resolves later, modeled on
 *   the legacy `delayedBaneHook`/`baneBurden` pattern. The timing window is
 *   one of the snake_case `next_N_battles` literals shared with
 *   `statusPayload.duration`.
 */
export type BundleCostSource =
  | { readonly kind: "fixed_essence"; readonly amount: number }
  | { readonly kind: "card_purge_random"; readonly randomCharacter?: boolean }
  | {
      readonly kind: "reward_reduction_burden";
      readonly trigger: BundleRewardReductionTrigger;
    }
  | { readonly kind: "low_essence_cost_slot" }
  | {
      readonly kind: "delayed_bane";
      readonly baneCount: number;
      readonly timing: BundleDelayedBaneTiming;
      readonly baneName?: BaneName;
    }
  | {
      readonly kind: "burden_pool";
      readonly pool: BundleBurdenPoolId;
    };

/**
 * Declarative descriptor for the reward half of a generic bundle option.
 *
 * - `fixed_card_draft` matches `cardDraftRewardComponent` / generic drafts:
 *   draft 1-of-N from a profile.
 * - `random_card_gain` matches `randomCardGainRewardComponent`: hidden-random
 *   gain from a profile.
 * - `starter_cleanup` matches `starterCleanupRewardComponent`: purge up to N
 *   chosen Starter cards from the deck.
 * - `essence_gain` matches `resourceRewardFollowUp`: gain a flat amount of
 *   essence (used by `mixed_service`).
 */
export type BundleRewardSource =
  | {
      readonly kind: "fixed_card_draft";
      readonly profileId: BundleCardDraftProfileId;
      readonly takeCount?: number;
      readonly copyCount?: number;
    }
  | {
      readonly kind: "random_card_gain";
      readonly profileId: BundleCardDraftProfileId;
      readonly count: number;
    }
  | { readonly kind: "starter_cleanup"; readonly count: number }
  | { readonly kind: "essence_gain"; readonly amount: number }
  | {
      readonly kind: "named_card_grant";
      readonly profileId: BundleCardDraftProfileId;
      readonly count?: number;
    };

export type BundleOptionPayload =
  | {
      readonly kind: "essence_cost";
      readonly cost: ReturnType<typeof cost>;
    }
  | {
      readonly kind: "card_draft";
      readonly profileId: BundleCardDraftProfileId;
      readonly draft: ReturnType<typeof draftCards>;
    }
  | {
      readonly kind: "card_purge";
      readonly randomCharacter: boolean;
      readonly burden: Record<string, unknown>;
      readonly target: Record<string, unknown>;
    }
  | {
      readonly kind: "reward_reduction";
      readonly trigger: BundleRewardReductionTrigger;
      readonly amount: number;
      readonly burden: Record<string, unknown>;
    }
  | {
      readonly kind: "resource_cost_slot";
      readonly slotKey: string;
      readonly costs: readonly unknown[];
    }
  | {
      readonly kind: "random_card_gain";
      readonly profileId: BundleCardDraftProfileId;
      readonly count: number;
      readonly gain: ReturnType<typeof randomCardGain>;
    }
  | {
      readonly kind: "starter_cleanup";
      readonly count: number;
      readonly effect: ReturnType<typeof starterCleanup>;
    }
  | {
      readonly kind: "essence_gain";
      readonly amount: number;
      readonly effect: ReturnType<typeof gainEssence>;
    }
  | {
      readonly kind: "delayed_bane_cost";
      readonly baneName: BaneName;
      readonly baneCount: number;
      readonly timing: BundleDelayedBaneTiming;
      readonly timingLabel: string;
      readonly burdenText: string;
      readonly burden: Record<string, unknown>;
    }
  | {
      readonly kind: "burden_pool_cost";
      readonly pool: BundleBurdenPoolId;
      readonly baneName: BaneName;
      readonly burden: Record<string, unknown>;
      readonly burdenText: string;
    }
  | {
      readonly kind: "named_card_grant";
      readonly profileId: BundleCardDraftProfileId;
      readonly count: number;
      readonly gain: ReturnType<typeof randomCardGain>;
    };

/**
 * The intermediate option shape produced by `genericBundleOption`. Task 1.2
 * (`buildBundleFamilyOption`) adapts this into a `ResolvedShapeFillOption`
 * for use by `compoundPayloadMenuFill`; keeping the composer's output
 * declarative makes it easier to inspect and to compose alternative renderers.
 */
export type GenericBundleOption = {
  readonly key: string;
  readonly label: string;
  readonly payloads: readonly BundleOptionPayload[];
  readonly renderText: string;
};

export type GenericBundleOptionArgs = {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly label: string;
  readonly stage: JourneyStage;
  readonly costSource: BundleCostSource;
  readonly rewardSource: BundleRewardSource;
};

type RewardReductionStatusDuration = Parameters<
  typeof statusPayload
>[0]["duration"];

type RewardReductionDuration = {
  readonly label: string;
  readonly statusDuration: RewardReductionStatusDuration;
};

const REWARD_REDUCTION_DURATIONS: Record<
  BundleRewardReductionTrigger,
  readonly RewardReductionDuration[]
> = {
  battle: [
    { label: "next 2 battles", statusDuration: "next_2_battles" },
    { label: "next 3 battles", statusDuration: "next_3_battles" },
    { label: "next 4 battles", statusDuration: "next_4_battles" },
  ],
  essence_site: [
    { label: "next 2 dreamscapes", statusDuration: "next_2_dreamscapes" },
    { label: "next 3 dreamscapes", statusDuration: "next_3_dreamscapes" },
    { label: "next 4 dreamscapes", statusDuration: "next_4_dreamscapes" },
  ],
};

const REWARD_REDUCTION_AMOUNTS: Record<
  BundleRewardReductionTrigger,
  readonly number[]
> = {
  battle: [1, 1, 2],
  essence_site: [20, 30, 40],
};

const DELAYED_BANE_TIMING_LABELS: Record<BundleDelayedBaneTiming, string> = {
  next_2_battles: "next 2 battles",
  next_3_battles: "next 3 battles",
  next_4_battles: "next 4 battles",
};

/**
 * Static mapping from a burden-pool id to the Bane name that pool advertises.
 * Each entry pairs a flavor label (used to differentiate independent rows
 * during fill) with a concrete `BaneName` so the resulting payload reads as
 * a normal Bane gain.
 */
const BURDEN_POOL_BANE_NAMES: Record<BundleBurdenPoolId, BaneName> = {
  scissor_saint_burdens: "Doubt",
  withered_orchard_burdens: "Despair",
  molting_archive_burdens: "Oblivion",
};

function resolveCardDraftProfile(
  profileId: BundleCardDraftProfileId,
): CardDraftProfile {
  if (profileId === "any_basic") {
    return GENERIC_CARD_DRAFT_PROFILE;
  }

  return CARD_DRAFT_PROFILES[profileId];
}

type CostPartArgs = {
  readonly source: BundleCostSource;
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly label: string;
};

type RewardPartArgs = {
  readonly source: BundleRewardSource;
  readonly stage: JourneyStage;
};

function buildCostPayload(
  args: CostPartArgs,
): { payload: BundleOptionPayload; renderText: string } | undefined {
  const { source } = args;
  switch (source.kind) {
    case "fixed_essence": {
      const payload: BundleOptionPayload = {
        kind: "essence_cost",
        cost: cost("essence", source.amount),
      };

      return {
        payload,
        renderText: `Pay ${source.amount} essence`,
      };
    }
    case "card_purge_random": {
      const randomCharacter = source.randomCharacter === true;
      const burden: Record<string, unknown> = {
        kind: "card_purge",
        purgeMode: "random",
        selection: "hidden_random",
        predicate: {
          source: "deck",
          ...(randomCharacter ? { cardType: "Character" } : {}),
        },
        cardOperationFamily: "purge",
        compoundComponentRole: "burden",
      };
      const target: Record<string, unknown> = {
        kind: "card",
        description: randomCharacter
          ? "random Character cards in deck"
          : "random cards in deck",
        predicate: {
          source: "deck",
          ...(randomCharacter ? { cardType: "Character" } : {}),
        },
        selection: "hidden_random",
        required: true,
      };

      return {
        payload: {
          kind: "card_purge",
          randomCharacter,
          burden,
          target,
        },
        renderText: randomCharacter
          ? "Purge a random character"
          : "Purge a random card",
      };
    }
    case "reward_reduction_burden": {
      const amounts = REWARD_REDUCTION_AMOUNTS[source.trigger];
      const durations = REWARD_REDUCTION_DURATIONS[source.trigger];
      const amount = pickSequentialVariant(
        args.drawContext,
        `${args.label}:reward-reduction:${source.trigger}:amount`,
        amounts,
      );
      const duration = pickSequentialVariant(
        args.drawContext,
        `${args.label}:reward-reduction:${source.trigger}:duration`,
        durations,
      );
      const isBattle = source.trigger === "battle";
      const burden = statusPayload({
        kind: "status_reward_reduction",
        statusName: isBattle ? "Withered Orchard" : "Dry Orchard",
        statusScope: "reward",
        duration: duration.statusDuration,
        ruleMutationKind: isBattle
          ? "battle_reward_reduction"
          : "essence_site_reward_reduction",
        polarity: "negative",
        rewardTrigger: source.trigger,
        replacedRewardKind: isBattle
          ? "battle_rewards"
          : "essence_site_rewards",
        resource: isBattle ? undefined : "essence",
        amount,
      });
      const renderText = isBattle
        ? `For the ${duration.label}, Battle rewards offer ${amount} fewer card choice${amount === 1 ? "" : "s"}.`
        : `For the ${duration.label}, Essence sites yield ${amount} less essence.`;

      return {
        payload: {
          kind: "reward_reduction",
          trigger: source.trigger,
          amount,
          burden: burden as Record<string, unknown>,
        },
        renderText,
      };
    }
    case "low_essence_cost_slot": {
      const slots = costSlots(args.context, args.drawContext, args.label);
      const slot = slots.find((entry) => entry.key === "low-essence")
        ?? slots.find((entry) => (entry.cost ?? 0) > 0);

      if (!slot) {
        return undefined;
      }

      return {
        payload: {
          kind: "resource_cost_slot",
          slotKey: slot.key,
          costs: slot.costs ?? [],
        },
        renderText: slot.prefix,
      };
    }
    case "delayed_bane": {
      const baneName = source.baneName ?? DEFAULT_BANE_NAME;
      const timingLabel = DELAYED_BANE_TIMING_LABELS[source.timing];
      const burden = baneBurden(baneName, source.baneCount, {
        timing: timingLabel,
        duration: timingLabel,
      });
      const noun = source.baneCount === 1 ? baneName : `${baneName}s`;
      const burdenText = `Gain ${source.baneCount} ${noun} over the ${timingLabel}.`;

      return {
        payload: {
          kind: "delayed_bane_cost",
          baneName,
          baneCount: source.baneCount,
          timing: source.timing,
          timingLabel,
          burdenText,
          burden: burden as Record<string, unknown>,
        },
        renderText: burdenText.slice(0, -1),
      };
    }
    case "burden_pool": {
      const baneName = BURDEN_POOL_BANE_NAMES[source.pool];
      const burden = baneBurden(baneName, 1);
      const burdenText = `Gain 1 ${baneName}.`;

      return {
        payload: {
          kind: "burden_pool_cost",
          pool: source.pool,
          baneName,
          burden: burden as Record<string, unknown>,
          burdenText,
        },
        renderText: burdenText.slice(0, -1),
      };
    }
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function buildRewardPayload(
  args: RewardPartArgs,
): { payload: BundleOptionPayload; renderText: string } | undefined {
  const { source } = args;
  switch (source.kind) {
    case "fixed_card_draft": {
      const profile = resolveCardDraftProfile(source.profileId);
      const draft = draftCards(profile, {
        takeCount: source.takeCount,
        copyCount: source.copyCount,
      });
      const payload: BundleOptionPayload = {
        kind: "card_draft",
        profileId: source.profileId,
        draft,
      };

      return {
        payload,
        renderText: cardDraftText(
          profile,
          source.takeCount ?? 1,
          source.copyCount ?? 1,
        ),
      };
    }
    case "random_card_gain": {
      const profile = resolveCardDraftProfile(source.profileId);
      const gain = randomCardGain(profile, source.count);

      return {
        payload: {
          kind: "random_card_gain",
          profileId: source.profileId,
          count: source.count,
          gain,
        },
        renderText: randomCardGainText(profile, source.count),
      };
    }
    case "starter_cleanup": {
      const effect = starterCleanup(source.count);

      return {
        payload: {
          kind: "starter_cleanup",
          count: source.count,
          effect,
        },
        renderText: source.count === 1
          ? "Purge up to 1 chosen Starter card."
          : `Purge up to ${source.count} chosen Starter cards.`,
      };
    }
    case "essence_gain": {
      const effect = gainEssence(source.amount);

      return {
        payload: {
          kind: "essence_gain",
          amount: source.amount,
          effect,
        },
        renderText: `Gain ${source.amount} essence.`,
      };
    }
    case "named_card_grant": {
      const profile = resolveCardDraftProfile(source.profileId);
      const count = source.count ?? 1;
      // The "named" card is selected by the recipient at runtime from the
      // profile's pool; at composer time we surface the grant using the same
      // hidden-random `card_gain` payload shape used by `random_card_gain`,
      // which is the closest existing primitive for "pick a card matching
      // this profile" without a content lookup.
      const gain = randomCardGain(profile, count);

      return {
        payload: {
          kind: "named_card_grant",
          profileId: source.profileId,
          count,
          gain,
        },
        renderText: count === 1
          ? `Gain a named ${profile.label} card.`
          : `Gain ${count} named ${profile.label} cards.`,
      };
    }
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

/**
 * Composes a single bundled option from one cost source and one reward
 * source. Returns `undefined` when either source kind is not yet supported
 * or fails to produce a payload (e.g. a cost slot is unavailable).
 */
export function genericBundleOption(
  args: GenericBundleOptionArgs,
): GenericBundleOption | undefined {
  const costPart = buildCostPayload({
    source: args.costSource,
    context: args.context,
    drawContext: args.drawContext,
    label: args.label,
  });
  const rewardPart = buildRewardPayload({
    source: args.rewardSource,
    stage: args.stage,
  });

  if (costPart === undefined || rewardPart === undefined) {
    return undefined;
  }

  const renderText = `${costPart.renderText}; ${rewardPart.renderText}`;

  return {
    key: `${args.label}:${args.costSource.kind}:${args.rewardSource.kind}`,
    label: args.label,
    payloads: [costPart.payload, rewardPart.payload],
    renderText,
  };
}
