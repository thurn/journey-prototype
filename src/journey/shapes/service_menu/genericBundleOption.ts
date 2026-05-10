import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyStage } from "../../manifest.js";
import {
  CARD_DRAFT_PROFILES,
  GENERIC_CARD_DRAFT_PROFILE,
  cardDraftText,
  cost,
  draftCards,
  type CardDraftProfile,
} from "../../fillers/shared.js";
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
 * Declarative descriptor for the cost half of a generic bundle option.
 *
 * Subsequent tasks (1.2 / 1.4) will extend this union as they translate the
 * existing `scissorSaintCompoundFill`, `moltingArchiveCompoundFill`,
 * `witheredOrchardCompoundFill`, and `mixedServiceCompoundFill` selection
 * logic into source records (e.g. `{ kind: "burden_pool", ... }`,
 * `{ kind: "delayed_bane", ... }`).
 */
export type BundleCostSource =
  | { readonly kind: "fixed_essence"; readonly amount: number };

/**
 * Declarative descriptor for the reward half of a generic bundle option.
 *
 * Subsequent tasks will extend this union with `named_card_grant`,
 * `card_operation`, and other reward kinds as the four legacy fill functions
 * are translated into registry entries.
 */
export type BundleRewardSource =
  | {
      readonly kind: "fixed_card_draft";
      readonly profileId: BundleCardDraftProfileId;
      readonly takeCount?: number;
      readonly copyCount?: number;
    };

export type BundleOptionPayload =
  | {
      readonly kind: "essence_cost";
      readonly amount: number;
      readonly cost: ReturnType<typeof cost>;
    }
  | {
      readonly kind: "card_draft";
      readonly profileId: BundleCardDraftProfileId;
      readonly draft: ReturnType<typeof draftCards>;
    };

/**
 * The intermediate option shape produced by `genericBundleOption`. Task 1.2
 * (`buildBundleFamilyOption`) will adapt this into a `ResolvedShapeFillOption`
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

function resolveCardDraftProfile(
  profileId: BundleCardDraftProfileId,
): CardDraftProfile {
  if (profileId === "any_basic") {
    return GENERIC_CARD_DRAFT_PROFILE;
  }

  return CARD_DRAFT_PROFILES[profileId];
}

function buildCostPayload(
  source: BundleCostSource,
): { payload: BundleOptionPayload; renderText: string } | undefined {
  switch (source.kind) {
    case "fixed_essence": {
      const payload: BundleOptionPayload = {
        kind: "essence_cost",
        amount: source.amount,
        cost: cost("essence", source.amount),
      };

      return {
        payload,
        renderText: `Pay ${source.amount} essence`,
      };
    }
    default:
      return undefined;
  }
}

function buildRewardPayload(
  source: BundleRewardSource,
): { payload: BundleOptionPayload; renderText: string } | undefined {
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
    default:
      return undefined;
  }
}

/**
 * Composes a single bundled option from one cost source and one reward
 * source. Returns `undefined` when either source kind is not yet supported,
 * which lets callers gracefully skip families whose source kinds will be
 * implemented in later tasks.
 */
export function genericBundleOption(
  args: GenericBundleOptionArgs,
): GenericBundleOption | undefined {
  const costPart = buildCostPayload(args.costSource);
  const rewardPart = buildRewardPayload(args.rewardSource);

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
