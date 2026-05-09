import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  CARD_DRAFT_PROFILES,
  cardDraftText,
  gainOmen,
  pickLegalCardDraftProfile,
  target,
} from "../../fillers/shared.js";
import { namedDreamsignCandidate } from "../../fillers/randomPayloads.js";
import type { JourneyStage } from "../../manifest.js";

export function namedDreamsignRiskReward(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}) {
  const named = namedDreamsignCandidate(args);

  if (named) {
    return named;
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

  return {
    key: `fallback-draft:${profile.label}`,
    text: cardDraftText(profile),
    payloads: [cardDraft, gainOmen(1)],
    targets: [target("card", profile.targetDescription, cardDraft.predicate)],
    value: 170,
    family: "card" as const,
  };
}
