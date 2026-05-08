import { drawInt, type DrawContext } from "../../util/rng.js";
import type {
  GeneratedObjectDefinition,
  JourneyOption,
  JourneyStage,
} from "../manifest.js";
import { BANE_NAMES } from "../effects.js";
import type { JourneyShapeId } from "../shapes.js";
import { option } from "./shared.js";

type GeneratedObjectKind = GeneratedObjectDefinition["generatedObjectKind"];
type GeneratedObjectReference = {
  id: string;
  name: string;
};

type NaturalGeneratedObjectArgs = {
  kind: GeneratedObjectKind;
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  cards?: readonly GeneratedObjectReference[];
  dreamsigns?: readonly GeneratedObjectReference[];
};

type GeneratedObjectBody = Omit<
  GeneratedObjectDefinition,
  "generatedObjectKind" | "generatedObjectId" | "name" | "validation"
> & {
  idPart: string;
  name: string;
  ruleIds: string[];
};

export function generatedObjectDuration(
  label: string,
  count: number = 3,
  durationKind: NonNullable<
    GeneratedObjectDefinition["duration"]
  >["durationKind"] = "battle_count",
): GeneratedObjectDefinition["duration"] {
  return {
    durationKind,
    count,
    label,
  };
}

function pick<T>(
  drawContext: DrawContext,
  label: string,
  entries: readonly T[],
): T {
  return entries[drawInt(drawContext, label, 0, entries.length - 1)]!;
}

function kebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function optionalReferences(
  references: GeneratedObjectDefinition["references"],
): GeneratedObjectDefinition["references"] {
  return {
    ...(references.cards && references.cards.length > 0
      ? { cards: references.cards }
      : {}),
    ...(references.dreamsigns && references.dreamsigns.length > 0
      ? { dreamsigns: references.dreamsigns }
      : {}),
    ...(references.dreamcallers && references.dreamcallers.length > 0
      ? { dreamcallers: references.dreamcallers }
      : {}),
    ...(references.banes && references.banes.length > 0
      ? { banes: references.banes }
      : {}),
    ...(references.rules && references.rules.length > 0
      ? { rules: references.rules }
      : {}),
    ...(references.generatedObjects && references.generatedObjects.length > 0
      ? { generatedObjects: references.generatedObjects }
      : {}),
  };
}

function referencedName(
  drawContext: DrawContext,
  label: string,
  entries: readonly GeneratedObjectReference[] | undefined,
): string | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  return pick(drawContext, label, entries).name;
}

const CARD_PREFIXES = ["Amber", "Hollow", "Rain", "Silver", "Thistle"] as const;
const CARD_NOUNS = ["Bell", "Compass", "Key", "Lantern", "Ribbon"] as const;
const DREAMSIGN_PREFIXES = ["Ashen", "Mirror", "Violet", "Waking"] as const;
const DREAMSIGN_NOUNS = ["Anchor", "Moon", "Prism", "Toll"] as const;
const STATUS_PREFIXES = ["Afterimage", "Borrowed", "Liminal", "Veiled"] as const;
const STATUS_NOUNS = ["Oath", "Pattern", "Promise", "Wake"] as const;
const TRANSFIGURATION_NAMES = ["Amber", "Glass", "Hollow", "Silver", "Thistle"] as const;

function naturalCardBody(args: NaturalGeneratedObjectArgs): GeneratedObjectBody {
  const anchorCard = referencedName(
    args.drawContext,
    "generated-object:card:anchor-card",
    args.cards,
  );
  const name = `${pick(args.drawContext, "generated-object:card:prefix", CARD_PREFIXES)} ${pick(args.drawContext, "generated-object:card:noun", CARD_NOUNS)}`;
  const fragment = pick(args.drawContext, "generated-object:card:rules", [
    "omen-discount",
    "discover-reclaim",
    "temporary-copy",
  ] as const);

  if (fragment === "discover-reclaim") {
    const cardText = anchorCard
      ? `Discover a card from the draft pool; if it is {${anchorCard}}, it gains Reclaim 1 until end of battle.`
      : "Discover a card from the draft pool; it gains Reclaim 1 until end of battle.";

    return {
      idPart: `discover-reclaim-${anchorCard ? kebab(anchorCard) : "draft"}`,
      name,
      objectType: "Event Card",
      rulesText: `1 energy Event. ${cardText}`,
      tags: ["journey-only", "card", "event", "discover", "reclaim"],
      references: optionalReferences({
        ...(anchorCard ? { cards: [anchorCard] } : {}),
        rules: ["Discover", "Reclaim", "battle", "card"],
      }),
      duration: generatedObjectDuration("this battle", 1),
      lifetime: "one_time",
      valueEstimate: {
        convertedEssence: 125,
        confidence: "medium",
        basis: "One-shot Discover plus a bounded Reclaim modifier.",
      },
      payload: {
        energyCost: 1,
        cardType: "Event",
        keywords: ["Discover", "Reclaim"],
        ...(anchorCard ? { referencedCard: anchorCard } : {}),
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "card_rules_text",
        "content_reference",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  if (fragment === "temporary-copy") {
    const cardText = anchorCard
      ? `Copy {${anchorCard}} as a temporary card for the next battle.`
      : "Copy a card in hand as a temporary card for the next battle.";

    return {
      idPart: `temporary-copy-${anchorCard ? kebab(anchorCard) : "hand"}`,
      name,
      objectType: "Event Card",
      rulesText: `0 energy Event. Fast. ${cardText}`,
      tags: ["journey-only", "card", "event", "fast", "temporary"],
      references: optionalReferences({
        ...(anchorCard ? { cards: [anchorCard] } : {}),
        rules: ["Fast", "Copy", "battle", "card"],
      }),
      duration: generatedObjectDuration("next battle", 1),
      lifetime: "temporary",
      valueEstimate: {
        convertedEssence: 140,
        confidence: "medium",
        basis: "Fast temporary card copy with a one-battle ceiling.",
      },
      payload: {
        energyCost: 0,
        cardType: "Event",
        keywords: ["Fast", "Copy"],
        temporary: true,
        ...(anchorCard ? { copiedCard: anchorCard } : {}),
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "card_rules_text",
        "duration",
        "content_reference",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  const omenCount = pick(args.drawContext, "generated-object:card:omen-count", [
    1,
    2,
  ] as const);
  const discount = pick(args.drawContext, "generated-object:card:discount", [
    20,
    25,
    30,
  ] as const);

  return {
    idPart: `omen-discount-${omenCount}-${discount}`,
    name,
    objectType: "Event Card",
    rulesText: `0 energy Event. Fast. Gain ${omenCount} omen${omenCount === 1 ? "" : "s"}, then the next card you draft costs ${discount} less essence.`,
    tags: ["journey-only", "card", "event", "fast", "draft"],
    references: {
      rules: ["Fast", "omens", "essence", "card"],
    },
    lifetime: "journey_only",
    valueEstimate: {
      convertedEssence: 120 + omenCount * 20 + discount,
      confidence: "medium",
      basis: "Fast zero-cost card plus omens and a bounded draft discount.",
    },
    payload: {
      energyCost: 0,
      cardType: "Event",
      keywords: ["Fast"],
      omenCount,
      draftDiscountEssence: discount,
      source: "manifest_generated",
    },
    ruleIds: [
      "stable_id",
      "card_rules_text",
      "value_estimate",
      "manifest_local",
    ],
  };
}

function naturalDreamsignBody(
  args: NaturalGeneratedObjectArgs,
): GeneratedObjectBody {
  const anchorCard = referencedName(
    args.drawContext,
    "generated-object:dreamsign:anchor-card",
    args.cards,
  );
  const anchorDreamsign = referencedName(
    args.drawContext,
    "generated-object:dreamsign:anchor-dreamsign",
    args.dreamsigns,
  );
  const name = `${pick(args.drawContext, "generated-object:dreamsign:prefix", DREAMSIGN_PREFIXES)} ${pick(args.drawContext, "generated-object:dreamsign:noun", DREAMSIGN_NOUNS)}`;
  const fragment = pick(args.drawContext, "generated-object:dreamsign:rules", [
    "duplicate-choice",
    "shop-discount",
    "omen-foresee",
  ] as const);

  if (fragment === "shop-discount") {
    const cardText = anchorCard
      ? ` If that card is {${anchorCard}}, gain 1 omen.`
      : "";

    return {
      idPart: `shop-discount-${anchorCard ? kebab(anchorCard) : "shop"}`,
      name,
      objectType: "Dreamsign",
      rulesText: `At the next Shop, the first card you buy costs 30 less essence.${cardText}`,
      tags: ["journey-only", "dreamsign", "shop", "discount"],
      references: optionalReferences({
        ...(anchorCard ? { cards: [anchorCard] } : {}),
        rules: ["Shop", "essence", "omens", "card"],
      }),
      duration: generatedObjectDuration("next Shop", 1, "shop_count"),
      lifetime: "one_time",
      valueEstimate: {
        convertedEssence: anchorCard ? 140 : 120,
        confidence: "medium",
        basis: "One-shop discount with a small named-card upside.",
      },
      payload: {
        trigger: "next Shop",
        discountEssence: 30,
        ...(anchorCard ? { bonusCard: anchorCard } : {}),
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "dreamsign_rules_text",
        "duration",
        "content_reference",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  if (fragment === "omen-foresee") {
    return {
      idPart: "omen-foresee",
      name,
      objectType: "Dreamsign",
      rulesText:
        "For the next 2 battles, the first time you gain an omen each battle, Foresee 2.",
      tags: ["journey-only", "dreamsign", "battle", "omens"],
      references: {
        rules: ["battle", "omens", "Foresee"],
      },
      duration: generatedObjectDuration("next 2 battles", 2),
      lifetime: "temporary",
      valueEstimate: {
        convertedEssence: 135,
        confidence: "medium",
        basis: "Short battle window that converts omen gains into card selection.",
      },
      payload: {
        trigger: "omen gain",
        durationBattles: 2,
        action: "Foresee 2",
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "dreamsign_rules_text",
        "duration",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  const dreamsignText = anchorDreamsign
    ? ` If it is {${anchorDreamsign}}, gain 120 essence instead.`
    : "";

  return {
    idPart: `duplicate-choice-${anchorDreamsign ? kebab(anchorDreamsign) : "any"}`,
    name,
    objectType: "Dreamsign",
    rulesText: `The next time you gain a Dreamsign, choose one: duplicate it, or gain 90 essence.${dreamsignText}`,
    tags: ["journey-only", "dreamsign", "choice"],
    references: optionalReferences({
      ...(anchorDreamsign ? { dreamsigns: [anchorDreamsign] } : {}),
      rules: ["dreamsign", "essence"],
    }),
    duration: generatedObjectDuration("until the next Dreamsign gain", 3),
    lifetime: "until_returned",
    valueEstimate: {
      convertedEssence: anchorDreamsign ? 170 : 155,
      confidence: "medium",
      basis: "Named Dreamsign choice hook with a narrow one-time trigger.",
    },
    payload: {
      trigger: "next Dreamsign gain",
      choices: ["duplicate gained Dreamsign", "gain 90 essence"],
      ...(anchorDreamsign ? { bonusDreamsign: anchorDreamsign } : {}),
      source: "manifest_generated",
    },
    ruleIds: [
      "stable_id",
      "dreamsign_rules_text",
      "duration",
      "content_reference",
      "value_estimate",
      "manifest_local",
    ],
  };
}

function naturalStatusBody(args: NaturalGeneratedObjectArgs): GeneratedObjectBody {
  const anchorCard = referencedName(
    args.drawContext,
    "generated-object:status:anchor-card",
    args.cards,
  );
  const name = `${pick(args.drawContext, "generated-object:status:prefix", STATUS_PREFIXES)} ${pick(args.drawContext, "generated-object:status:noun", STATUS_NOUNS)}`;
  const fragment = pick(args.drawContext, "generated-object:status:rules", [
    "purge-copy",
    "shop-reclaim",
    "bane-essence",
  ] as const);

  if (fragment === "shop-reclaim") {
    const cardText = anchorCard
      ? ` If it is {${anchorCard}}, it also gains Fast.`
      : "";

    return {
      idPart: `shop-reclaim-${anchorCard ? kebab(anchorCard) : "shop"}`,
      name,
      objectType: "Quest Status",
      rulesText: `Until the next Shop, the first card you buy gains Reclaim 1.${cardText}`,
      tags: ["journey-only", "status", "shop", "reclaim"],
      references: optionalReferences({
        ...(anchorCard ? { cards: [anchorCard] } : {}),
        rules: ["Shop", "Reclaim", "Fast", "card"],
      }),
      duration: generatedObjectDuration("until the next Shop", 1, "shop_count"),
      lifetime: "until_returned",
      valueEstimate: {
        convertedEssence: anchorCard ? 150 : 130,
        confidence: "medium",
        basis: "Temporary shop status that upgrades one future purchase.",
      },
      payload: {
        statusScope: "shop",
        affectedObject: "card",
        ...(anchorCard ? { bonusCard: anchorCard } : {}),
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "status_scope",
        "duration",
        "content_reference",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  if (fragment === "bane-essence") {
    const baneName = pick(
      args.drawContext,
      "generated-object:status:bane-name",
      BANE_NAMES,
    );

    return {
      idPart: `bane-essence-${kebab(baneName)}`,
      name,
      objectType: "Quest Status",
      rulesText: `During the next dreamscape, the first time you gain {${baneName}}, gain 100 essence.`,
      tags: ["journey-only", "status", "quest", "bane"],
      references: {
        banes: [baneName],
        rules: [baneName, "essence"],
      },
      duration: generatedObjectDuration(
        "next dreamscape",
        1,
        "dreamscape_count",
      ),
      lifetime: "temporary",
      valueEstimate: {
        convertedEssence: 110,
        confidence: "low",
        basis: "Conditional Bane compensation within one dreamscape.",
      },
      payload: {
        statusScope: "quest",
        trigger: "Bane gain",
        rewardEssence: 100,
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "status_scope",
        "duration",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  return {
    idPart: "purge-copy",
    name,
    objectType: "Quest Status",
    rulesText:
      "For the next 3 battles, the first card you purge each battle returns as a temporary copy for that battle.",
    tags: ["journey-only", "status", "battle", "temporary"],
    references: {
      rules: ["battle", "card", "Copy"],
    },
    duration: generatedObjectDuration("next 3 battles", 3),
    lifetime: "temporary",
    valueEstimate: {
      convertedEssence: 135,
      confidence: "medium",
      basis: "Temporary battle rule with bounded card-copy upside.",
    },
    payload: {
      statusScope: "battle",
      affectedObject: "card",
      source: "manifest_generated",
    },
    ruleIds: [
      "stable_id",
      "status_scope",
      "duration",
      "value_estimate",
      "manifest_local",
    ],
  };
}

function naturalTransfigurationBody(
  args: NaturalGeneratedObjectArgs,
): GeneratedObjectBody {
  const anchorDreamsign = referencedName(
    args.drawContext,
    "generated-object:transfiguration:anchor-dreamsign",
    args.dreamsigns,
  );
  const name = pick(
    args.drawContext,
    "generated-object:transfiguration:name",
    TRANSFIGURATION_NAMES,
  );
  const fragment = pick(args.drawContext, "generated-object:transfiguration:rules", [
    "fast-reclaim",
    "foresee-essence",
    "echo-copy",
  ] as const);

  if (fragment === "foresee-essence") {
    const dreamsignText = anchorDreamsign
      ? ` If you have {${anchorDreamsign}}, gain 1 omen.`
      : "";

    return {
      idPart: `foresee-essence-${anchorDreamsign ? kebab(anchorDreamsign) : "base"}`,
      name: `${name} Transfiguration`,
      objectType: "Transfiguration",
      rulesText: `A ${name} card gains Foresee 2. When it dissolves, gain 80 essence.${dreamsignText}`,
      tags: ["journey-only", "transfiguration", "card", "foresee"],
      references: optionalReferences({
        ...(anchorDreamsign ? { dreamsigns: [anchorDreamsign] } : {}),
        rules: ["Foresee", "Dissolve", "essence", "omens", "card", "transfiguration"],
      }),
      lifetime: "persistent",
      valueEstimate: {
        convertedEssence: anchorDreamsign ? 170 : 150,
        confidence: "medium",
        basis: "Persistent card rewrite with selection and delayed essence.",
      },
      payload: {
        generatedTransfigurationName: name,
        keywords: ["Foresee"],
        essenceOnDissolve: 80,
        ...(anchorDreamsign ? { bonusDreamsign: anchorDreamsign } : {}),
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "transfiguration_rules_text",
        "content_reference",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  if (fragment === "echo-copy") {
    return {
      idPart: "echo-copy",
      name: `${name} Transfiguration`,
      objectType: "Transfiguration",
      rulesText:
        `A ${name} card gains Echo. The first time you Copy it each battle, the copy costs 1 less energy.`,
      tags: ["journey-only", "transfiguration", "card", "copy"],
      references: {
        rules: ["Echo", "Copy", "battle", "card", "transfiguration"],
      },
      duration: generatedObjectDuration("each battle", 3),
      lifetime: "journey_only",
      valueEstimate: {
        convertedEssence: 135,
        confidence: "medium",
        basis: "Battle-limited copy synergy with a narrow cost reduction.",
      },
      payload: {
        generatedTransfigurationName: name,
        keywords: ["Echo", "Copy"],
        copyCostReduction: 1,
        source: "manifest_generated",
      },
      ruleIds: [
        "stable_id",
        "transfiguration_rules_text",
        "duration",
        "value_estimate",
        "manifest_local",
      ],
    };
  }

  const reclaim = pick(args.drawContext, "generated-object:transfiguration:reclaim", [
    1,
    2,
  ] as const);

  return {
      idPart: `fast-reclaim-${reclaim}`,
    name: `${name} Transfiguration`,
    objectType: "Transfiguration",
    rulesText: `A ${name} card gains Fast and Reclaim ${reclaim}. When it dissolves, gain 60 essence.`,
    tags: ["journey-only", "transfiguration", "card", "fast", "reclaim"],
    references: {
      rules: ["Fast", "Reclaim", "Dissolve", "essence", "card", "transfiguration"],
    },
    lifetime: "journey_only",
    valueEstimate: {
      convertedEssence: 135 + reclaim * 10,
      confidence: "medium",
      basis: "Fast and Reclaim transfiguration with a conditional essence payout.",
    },
    payload: {
      generatedTransfigurationName: name,
      keywords: ["Fast", "Reclaim"],
      reclaim,
      essenceOnDissolve: 60,
      source: "manifest_generated",
    },
    ruleIds: [
      "stable_id",
      "transfiguration_rules_text",
      "value_estimate",
      "manifest_local",
    ],
  };
}

function naturalGeneratedObjectDefinition(
  args: NaturalGeneratedObjectArgs,
): GeneratedObjectDefinition {
  const body =
    args.kind === "card"
      ? naturalCardBody(args)
      : args.kind === "dreamsign"
        ? naturalDreamsignBody(args)
        : args.kind === "status"
          ? naturalStatusBody(args)
          : naturalTransfigurationBody(args);
  const generatedObjectId = `generated-${args.kind}-${kebab(body.name)}-${body.idPart}`;

  return {
    generatedObjectKind: args.kind,
    generatedObjectId,
    name: body.name,
    objectType: body.objectType,
    rulesText: body.rulesText,
    tags: [
      ...new Set([
        ...body.tags,
        args.stage,
        `shape-${args.shapeId}`,
      ]),
    ],
    references: body.references,
    ...(body.duration ? { duration: body.duration } : {}),
    ...(body.lifetime ? { lifetime: body.lifetime } : {}),
    valueEstimate: body.valueEstimate,
    validation: {
      source: "generated_manifest_local",
      status: "validated",
      ruleIds: body.ruleIds,
      notes: [
        `natural:${args.stage}`,
        `shape:${args.shapeId}`,
        `fragment:${body.idPart}`,
      ],
    },
    payload: {
      ...body.payload,
      generatedBy: "natural_generated_object_builder",
      fragmentId: body.idPart,
      stage: args.stage,
      shapeId: args.shapeId,
    },
  };
}

export function generatedObjectDefinition(
  args: NaturalGeneratedObjectArgs,
): GeneratedObjectDefinition;
export function generatedObjectDefinition(
  args: NaturalGeneratedObjectArgs,
): GeneratedObjectDefinition {
  return naturalGeneratedObjectDefinition(args);
}

export function generatedObjectPayload(args: {
  kind:
    | "generated_object_create"
    | "generated_object_grant"
    | "generated_object_transform"
    | "generated_object_temporary_grant"
    | "generated_object_return"
    | "generated_object_trade";
  generatedObject: GeneratedObjectDefinition;
  operation: string;
  duration?: string;
  extra?: Record<string, unknown>;
}) {
  return {
    kind: args.kind,
    generatedObjectOperationKind: args.operation,
    generatedObjectId: args.generatedObject.generatedObjectId,
    generatedObjectKind: args.generatedObject.generatedObjectKind,
    generatedObjectName: args.generatedObject.name,
    generatedObjectReferenceKind: "definition",
    rulesText: args.generatedObject.rulesText,
    timing: "immediate",
    source: "manifest_generated",
    ...(args.duration ? { duration: args.duration } : {}),
    ...(args.extra ?? {}),
  };
}

export function generatedObjectOptions(
  generatedObject: GeneratedObjectDefinition,
): JourneyOption[] {
  const compactRules = `${generatedObject.name}: ${generatedObject.rulesText}`;
  const grant = generatedObjectPayload({
    kind: "generated_object_grant",
    generatedObject,
    operation: "grant",
  });
  const create = generatedObjectPayload({
    kind: "generated_object_create",
    generatedObject,
    operation: "create",
  });
  const transform = generatedObjectPayload({
    kind: "generated_object_transform",
    generatedObject,
    operation: "transform",
    extra: {
      transformIntoGeneratedObjectId: generatedObject.generatedObjectId,
    },
  });
  const temporary = generatedObjectPayload({
    kind: "generated_object_temporary_grant",
    generatedObject,
    operation: "temporary_grant",
    duration: generatedObject.duration?.label ?? "next 3 battles",
    extra: { temporary: true },
  });
  const returned = generatedObjectPayload({
    kind: "generated_object_return",
    generatedObject,
    operation: "return",
    duration: "at the next Dream Journey site",
  });
  const trade = generatedObjectPayload({
    kind: "generated_object_trade",
    generatedObject,
    operation: "trade",
    extra: { tradeFor: "120 essence" },
  });
  const value = generatedObject.valueEstimate.convertedEssence;

  return [
    option({
      number: 1,
      text: `Create and gain {${generatedObject.name}}. ${compactRules}`,
      effects: [create, grant],
      effect: value,
    }),
    option({
      number: 2,
      text: `Transform a chosen eligible object into {${generatedObject.name}}. ${compactRules}`,
      effects: [transform],
      effect: Math.max(120, value - 10),
      uncertainty: -10,
    }),
    option({
      number: 3,
      text: `Gain {${generatedObject.name}} temporarily, then return it at the next Dream Journey site or trade it for 120 essence after using it once. ${compactRules}`,
      effects: [temporary, trade],
      triggers: [returned],
      effect: Math.max(105, value - 25),
      uncertainty: -12,
    }),
  ];
}
