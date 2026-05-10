export const REMOVABLE_KEYWORDS = [
  "Dissolve",
  "Anchor",
  "Echo",
  "Banish",
  "Kindle",
  "Discover",
] as const;
export type RemovableKeyword = (typeof REMOVABLE_KEYWORDS)[number];
