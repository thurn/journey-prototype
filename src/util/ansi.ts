export type ColorMode = "auto" | "always" | "never";

export function supportsColor(stream: NodeJS.WriteStream, mode: ColorMode): boolean {
  if (mode === "never") {
    return false;
  }

  if (mode === "always") {
    return true;
  }

  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  return stream.isTTY === true;
}

export function ansiTruecolor(
  text: string,
  rgb: readonly [number, number, number],
  enabled: boolean,
): string {
  if (!enabled) {
    return text;
  }

  const [red, green, blue] = rgb;

  return `\u001b[38;2;${red};${green};${blue}m${text}\u001b[0m`;
}
