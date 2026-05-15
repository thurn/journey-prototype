# Displaying images in the terminal

How to render an image inline from the `journey` CLI (TypeScript), e.g. showing
reward or journey art as a preview.

## Mechanism

iTerm2's **Inline Images Protocol** renders image bytes inline via an OSC escape
sequence:

```
ESC ] 1337 ; File=inline=1;<args> : <base64 image data> BEL
```

The decoded bytes are drawn at full resolution. Supported by iTerm2 ≥3, WezTerm,
Konsole, Rio, and the VS Code integrated terminal.

## tmux is not supported

Inside tmux, inline images require DCS passthrough (`set -g allow-passthrough on`
in `~/.tmux.conf`), wrapping the sequence in `ESC P tmux; ... ESC \` with every
inner `ESC` doubled, staying under tmux's 1 MB sequence limit, and even then
rendering is flaky across tmux versions.

The CLI does not do any of that. When running under tmux it skips inline
rendering. Detection: `TERM` starts
with `tmux`, or `TERM_PROGRAM === 'tmux'`.

## Implementation

Dependencies: `sharp` (fast native image processing).

```ts
import sharp from 'sharp';

/** True only when we can safely emit the raw iTerm2 protocol. */
function supportsInlineImages(): boolean {
  if (process.env.TERM?.startsWith('tmux') || process.env.TERM_PROGRAM === 'tmux') {
    return false;
  }
  return process.env.TERM_PROGRAM === 'iTerm.app' || process.env.TERM_PROGRAM === 'WezTerm';
}

/** Crop to a circle (transparent corners), resized for terminal display. */
async function circlePng(inputPath: string, size = 400): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  return sharp(inputPath)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }]) // keep image only inside circle
    .png()
    .toBuffer();
}

export async function displayImage(inputPath: string, widthCells = 20): Promise<void> {
  if (!supportsInlineImages()) {
    console.log(inputPath); // fallback: print the path
    return;
  }
  const png = await circlePng(inputPath);
  const args = `inline=1;width=${widthCells};preserveAspectRatio=1;size=${png.length}`;
  process.stdout.write(`\x1b]1337;File=${args}:${png.toString('base64')}\x07\n`);
}
```

Notes:

- Output must be **PNG**, not JPG — the circle's transparent corners need an
  alpha channel.
- Resize before encoding. Source art (~1 MB JPGs) is far larger than needed for
  a terminal preview.
- `width` units in the protocol: `N` (cells), `Npx` (pixels), `N%`, or `auto`.

## Alternatives considered

- `terminal-image` (npm) — high-level wrapper. Detects iTerm2 and otherwise
  falls back to ANSI block characters, which *do* work inside tmux (they are
  just colored text) but render low-resolution. Use this instead of the
  path-printing fallback if a blocky in-tmux preview is preferable to none.
- `term-img` (npm) — lower-level, iTerm2 protocol only, throws when unsupported.
- `jimp` — pure-JS image processing, no native deps; an alternative to `sharp`
  for the circle crop.

## References

- iTerm2 Inline Images Protocol — https://iterm2.com/documentation-images.html
- iTerm2 Proprietary Escape Codes — https://iterm2.com/documentation-escape-codes.html
- tmux allow-passthrough — https://tmuxai.dev/tmux-allow-passthrough/
- terminal-image — https://www.npmjs.com/package/terminal-image
