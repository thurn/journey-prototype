export const RENDERER_VERSION: "renderer:v1" = "renderer:v1";

export const THEME = {
  heading: [255, 204, 102],
  optionNumber: [95, 175, 255],
  resourceLabel: [115, 218, 202],
  resourceValue: [255, 238, 153],
  positive: [186, 230, 126],
  warning: [255, 173, 102],
  error: [242, 85, 97],
  debug: [112, 122, 140],
} as const satisfies Record<string, readonly [number, number, number]>;
