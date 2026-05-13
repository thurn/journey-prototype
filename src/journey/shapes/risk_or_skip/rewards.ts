import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  CARD_DRAFT_PROFILES,
  cardDraftText,
  gainEssence,
  gainOmen,
  pickLegalCardDraftProfile,
  pickSequentialVariant,
  target,
} from "../../fillers/shared.js";
import {
  namedDreamsignCandidate,
  type RandomPoolCandidate,
} from "../../fillers/randomPayloads.js";
import type { JourneyStage } from "../../manifest.js";
import { valueEssenceGain } from "../../value.js";

const ESSENCE_REWARD_AMOUNTS = {
  early: [120, 140] as const,
  mid: [170, 200] as const,
  late: [240, 280] as const,
} satisfies Record<JourneyStage, readonly number[]>;

function stageRewardValue(value: number, stage: JourneyStage): number {
  switch (stage) {
    case "early":
      return Math.round((value * 0.85) / 5) * 5;
    case "mid":
      return value;
    case "late":
      return Math.round((value * 1.15) / 5) * 5;
  }
}

export function namedDreamsignRiskReward(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}) {
  const named = namedDreamsignCandidate(args);
  const candidates: RandomPoolCandidate[] = [];

  if (named) {
    candidates.push({
      ...named,
      value: stageRewardValue(named.value, args.stage),
    });
  }

  const profile = pickLegalCardDraftProfile(
    args.context,
    args.drawContext,
    `${args.label}:fallback-card-profile`,
    [CARD_DRAFT_PROFILES.events, CARD_DRAFT_PROFILES.allEligibleCards],
  );
  const cardDraft = {
    kind: "card_draft",
    takeCount: 1,
    choiceCount: 4,
    predicate: { source: "draftPool", ...profile.predicate },
  };
  const essenceAmount = pickSequentialVariant(
    args.drawContext,
    `${args.label}:essence-reward`,
    ESSENCE_REWARD_AMOUNTS[args.stage],
  );

  candidates.push({
    key: `fallback-draft:${profile.label}`,
    text: `${cardDraftText(profile)} Gain 1 omen.`,
    payloads: [cardDraft, gainOmen(1)],
    targets: [target("card", profile.targetDescription, cardDraft.predicate)],
    value: stageRewardValue(130, args.stage),
    family: "card" as const,
  });
  candidates.push({
    key: `essence-omen:${essenceAmount}`,
    text: `Gain ${essenceAmount} essence and 1 omen.`,
    payloads: [gainEssence(essenceAmount), gainOmen(1)],
    value: valueEssenceGain(essenceAmount, args.context) + 65,
    family: "resource" as const,
  });

  return pickSequentialVariant(
    args.drawContext,
    `${args.label}:reward-frame`,
    candidates,
  );
}
