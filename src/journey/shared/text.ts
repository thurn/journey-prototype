export function joinSnippets(snippets: readonly string[]): string {
  return snippets
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(".") ? s : `${s}.`))
    .join(" ");
}

export function withLockedPrefix(text: string, locked: boolean): string {
  return locked ? `[LOCKED] ${text}` : text;
}
