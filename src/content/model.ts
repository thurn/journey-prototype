export type TideId = string;

export type CardContent = {
  id: string;
  name: string;
  tides: TideId[];
  rarity: string;
  cardType: string;
  energyCost: number | "*";
  spark: number | "" | "*";
  cardNumber: number;
  raw: Record<string, unknown>;
};

export type DreamcallerContent = {
  id: string;
  name: string;
  title: string;
  awakening: string;
  mandatoryTides: TideId[];
  optionalTides: TideId[];
  raw: Record<string, unknown>;
};

export type DreamsignContent = {
  id: string;
  name: string;
  kind: "tidal" | "neutral";
  orientation?: "quest" | "battle";
  renderedText: string;
  tides: TideId[];
  raw: Record<string, unknown>;
};

export type ContentBundle = {
  cards: CardContent[];
  dreamcallers: DreamcallerContent[];
  dreamsigns: DreamsignContent[];
  rawBytes: {
    cardsToml: Uint8Array;
    dreamcallersToml: Uint8Array;
    dreamsignsToml: Uint8Array;
  };
};
