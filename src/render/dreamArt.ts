// Renders circular dream art and dream names beneath each journey's options.
// Each non-Leave option (or reward-bearing tree branch) is matched to an image
// via the shared reward catalog's templateId, looked up against
// `docs/journey-reward-art-matches.toml`. See `docs/displaying_images_in_terminal.md`
// for the inline image protocol used in iTerm2 / WezTerm.
import { readFile, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { parse as parseToml } from "smol-toml";

import type {
  JourneyManifest,
  JourneyOption,
  JourneyTreeBranch,
} from "../journey/manifest.js";
import { REWARD_TYPE_BY_TEMPLATE_ID } from "../journey/rewardArtTypes.js";
import { drawInt, shuffleDeterministic, type DrawContext } from "../util/rng.js";

/** Default location of the art ledger TOML, relative to the project root. */
const LEDGER_RELATIVE_PATH = "docs/journey-reward-art-matches.toml";

/** Directory holding the shutterstock journey image files. */
const IMAGE_DIRECTORY = "/Users/dthurn/Documents/shutterstock/images_journeys";

/** Cell height of each rendered circular image. */
const IMAGE_HEIGHT_CELLS = 10;

/** Pixel size to resize the source image to before circular masking. */
const CIRCLE_SIZE_PIXELS = 400;

export type DreamEntry = {
  readonly imageId: string;
  readonly dreamName: string;
  readonly rewardType: string;
};

type LedgerToml = {
  readonly dreams?: readonly {
    readonly image_id?: unknown;
    readonly dream_name?: unknown;
    readonly reward_type?: unknown;
  }[];
};

/** Lazily-loaded mapping from reward_type string to the dreams that match it. */
let cachedIndex: Promise<ReadonlyMap<string, readonly DreamEntry[]>> | undefined;

/** Lazily-loaded mapping from image_id to its on-disk file path. */
let cachedImagePaths: ReadonlyMap<string, string> | undefined;

/** True only when the current terminal can safely render inline images. */
export function supportsInlineImages(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TERM?.startsWith("tmux") || env.TERM_PROGRAM === "tmux") {
    return false;
  }

  return (
    env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "WezTerm"
  );
}

/** Reset the in-memory ledger cache (test helper). */
export function _resetDreamArtCache(): void {
  cachedIndex = undefined;
  cachedImagePaths = undefined;
}

async function loadLedger(projectRoot: string): Promise<ReadonlyMap<string, readonly DreamEntry[]>> {
  const path = join(projectRoot, LEDGER_RELATIVE_PATH);
  const text = await readFile(path, "utf8");
  const parsed = parseToml(text) as LedgerToml;
  const index = new Map<string, DreamEntry[]>();

  for (const raw of parsed.dreams ?? []) {
    if (
      typeof raw.image_id !== "string" ||
      typeof raw.dream_name !== "string" ||
      typeof raw.reward_type !== "string"
    ) {
      continue;
    }

    const entry: DreamEntry = {
      imageId: raw.image_id,
      dreamName: raw.dream_name,
      rewardType: raw.reward_type,
    };
    const bucket = index.get(entry.rewardType);
    if (bucket) {
      bucket.push(entry);
    } else {
      index.set(entry.rewardType, [entry]);
    }
  }

  return index;
}

/**
 * Returns the reward_type → DreamEntry[] index, lazily loaded and cached.
 * `projectRoot` lets tests point at a fixture ledger; the cache keys off the
 * first projectRoot used in the process.
 */
export function dreamLedger(projectRoot: string): Promise<ReadonlyMap<string, readonly DreamEntry[]>> {
  if (!cachedIndex) {
    cachedIndex = loadLedger(projectRoot);
  }
  return cachedIndex;
}

function imagePathIndex(): ReadonlyMap<string, string> {
  if (cachedImagePaths) {
    return cachedImagePaths;
  }

  const map = new Map<string, string>();
  if (!existsSync(IMAGE_DIRECTORY)) {
    cachedImagePaths = map;
    return map;
  }

  for (const entry of readdirSync(IMAGE_DIRECTORY)) {
    // Filenames end in `-<digits>.<ext>`; capture the trailing numeric id.
    const match = /-(\d+)\.[A-Za-z0-9]+$/u.exec(entry);
    if (match) {
      map.set(match[1]!, join(IMAGE_DIRECTORY, entry));
    }
  }

  cachedImagePaths = map;
  return map;
}

/** Resolves an image id to an on-disk file path, or undefined if not found. */
export function resolveImagePath(imageId: string): string | undefined {
  return imagePathIndex().get(imageId);
}

export type DreamArtAssignment = {
  /** Display label, e.g. "Option 2" or "Branch level-2-take". */
  readonly label: string;
  readonly imageId: string;
  readonly dreamName: string;
  readonly rewardType: string;
  readonly imagePath?: string;
};

export type DreamArtSelection = {
  readonly assignments: readonly DreamArtAssignment[];
  readonly reviewFlags: readonly string[];
  /**
   * Messages describing options/branches that had to borrow a dream from
   * outside their chosen reward type because every dream of that reward type
   * was already taken by an earlier option in the same journey. Image
   * uniqueness within the journey is still preserved. Surfaced only under
   * `--debug` so the ledger can be expanded to cover the contention.
   */
  readonly repeatFallbacks: readonly string[];
};

type OptionLike = {
  readonly label: string;
  readonly rewardTemplateIds: readonly string[];
};

function flatOptionsToConsider(manifest: JourneyManifest): OptionLike[] {
  return manifest.options
    .filter((option: JourneyOption) => option.pickBehavior !== "leave")
    .map((option) => ({
      label: `Option ${option.number}`,
      rewardTemplateIds: option.rewardTemplateIds ?? [],
    }));
}

function isLeaveBranch(branch: JourneyTreeBranch): boolean {
  if (branch.terminal?.outcome === "leave") return true;
  const trimmed = branch.text.trim();
  if (trimmed === "Leave." || trimmed === "Leave") return true;
  const label = branch.label.trim();
  return label === "Leave" || label === "Stop";
}

function treeBranchesToConsider(manifest: JourneyManifest): OptionLike[] {
  if (!manifest.tree) return [];

  const considered: OptionLike[] = [];
  for (const node of manifest.tree.nodes) {
    for (const branch of node.branches) {
      if (isLeaveBranch(branch)) continue;
      considered.push({
        label: `Branch ${branch.id}`,
        rewardTemplateIds: branch.rewardTemplateIds ?? [],
      });
    }
  }
  return considered;
}

function drawContextFor(manifest: JourneyManifest): DrawContext {
  return {
    seed: manifest.seed,
    contentVersion: manifest.versions.contentVersion,
    rootJourneyIndex: manifest.rootJourneyIndex,
  };
}

/**
 * Picks dream art for each non-Leave option / reward-bearing tree branch in
 * `manifest`, with per-journey image uniqueness. Returns review flags for any
 * non-Leave option/branch missing reward template ids.
 */
export async function selectDreamArt(
  manifest: JourneyManifest,
  projectRoot: string,
): Promise<DreamArtSelection> {
  const considered: OptionLike[] = manifest.tree
    ? treeBranchesToConsider(manifest)
    : flatOptionsToConsider(manifest);
  if (considered.length === 0) {
    return { assignments: [], reviewFlags: [], repeatFallbacks: [] };
  }

  const ledger = await dreamLedger(projectRoot);
  const draw = drawContextFor(manifest);
  const assignments: DreamArtAssignment[] = [];
  const reviewFlags: string[] = [];
  const repeatFallbacks: string[] = [];
  const usedImageIds = new Set<string>();
  // Process options/branches in a seeded shuffled order so contention for
  // small candidate sets resolves deterministically but not always biased
  // toward option 1.
  const order = shuffleDeterministic(draw, "dreamArt:order", considered);

  for (const item of order) {
    if (item.rewardTemplateIds.length === 0) {
      reviewFlags.push(
        `Journey ${manifest.journeyId} ${item.label}: no reward template ids`,
      );
      continue;
    }

    const rewardTypes = item.rewardTemplateIds
      .map((id) => REWARD_TYPE_BY_TEMPLATE_ID[id])
      .filter((rt): rt is string => typeof rt === "string");
    if (rewardTypes.length === 0) {
      reviewFlags.push(
        `Journey ${manifest.journeyId} ${item.label}: reward template ids not in catalog (${item.rewardTemplateIds.join(", ")})`,
      );
      continue;
    }

    // If the option offers multiple reward types, pick one at random.
    const chosenRewardType = rewardTypes.length === 1
      ? rewardTypes[0]!
      : rewardTypes[drawInt(draw, `dreamArt:rewardType:${item.label}`, 0, rewardTypes.length - 1)]!;
    const allEntries = ledger.get(chosenRewardType) ?? [];
    if (allEntries.length === 0) {
      // The ledger has no dreams at all for this reward type — surface as a
      // review flag so the catalog gap can be filled.
      reviewFlags.push(
        `Journey ${manifest.journeyId} ${item.label}: no dreams in ledger for reward type "${chosenRewardType}"`,
      );
      continue;
    }

    // Prefer an unused dream of the chosen reward type so the visual matches
    // the option's reward. When every dream of that reward type has already
    // been taken in this journey, borrow an unused dream from elsewhere in
    // the ledger — image uniqueness within the journey is the stronger
    // constraint, so we never reuse an image. Record a debug message when we
    // leave the reward-type pool so the ledger can grow to cover the
    // contention.
    const sameTypeUnused = allEntries.filter(
      (entry) => !usedImageIds.has(entry.imageId),
    );
    let pool: readonly DreamEntry[];
    let borrowedAcrossTypes = false;
    if (sameTypeUnused.length > 0) {
      pool = sameTypeUnused;
    } else {
      const crossTypeUnused: DreamEntry[] = [];
      for (const entries of ledger.values()) {
        for (const entry of entries) {
          if (!usedImageIds.has(entry.imageId)) crossTypeUnused.push(entry);
        }
      }
      if (crossTypeUnused.length === 0) {
        // The ledger is fully consumed by this journey — extreme contention,
        // surface as a review flag (not debug-only) so it never goes silent.
        reviewFlags.push(
          `Journey ${manifest.journeyId} ${item.label}: ledger fully exhausted, no unused dream available`,
        );
        continue;
      }
      pool = crossTypeUnused;
      borrowedAcrossTypes = true;
    }

    const chosen = pool.length === 1
      ? pool[0]!
      : pool[drawInt(draw, `dreamArt:entry:${item.label}`, 0, pool.length - 1)]!;
    usedImageIds.add(chosen.imageId);
    if (borrowedAcrossTypes) {
      repeatFallbacks.push(
        `Journey ${manifest.journeyId} ${item.label}: borrowed dream "${chosen.dreamName}" (reward type "${chosen.rewardType}") — reward type "${chosenRewardType}" has only ${allEntries.length} dream(s) in the ledger`,
      );
    }
    assignments.push({
      label: item.label,
      imageId: chosen.imageId,
      dreamName: chosen.dreamName,
      rewardType: chosen.rewardType,
      ...(resolveImagePath(chosen.imageId)
        ? { imagePath: resolveImagePath(chosen.imageId)! }
        : {}),
    });
  }

  // Restore the original (non-shuffled) order for display so the visual
  // mapping to options/branches is unsurprising.
  const labelOrder = new Map(considered.map((item, index) => [item.label, index]));
  const ordered = [...assignments].sort(
    (left, right) =>
      (labelOrder.get(left.label) ?? 0) - (labelOrder.get(right.label) ?? 0),
  );

  return { assignments: ordered, reviewFlags, repeatFallbacks };
}

/** Crop the source image to a transparent-cornered circle PNG. */
export async function circlePng(
  inputPath: string,
  size = CIRCLE_SIZE_PIXELS,
): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  return sharp(inputPath)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** Wrap a PNG buffer in an iTerm2 inline image OSC sequence. */
export function inlineImageEscape(png: Buffer, heightCells = IMAGE_HEIGHT_CELLS): string {
  const args = `inline=1;height=${heightCells};preserveAspectRatio=1;size=${png.length}`;
  return `\x1b]1337;File=${args}:${png.toString("base64")}\x07`;
}

/**
 * Render the dream-art block for `manifest`. Returns the block to append to
 * the journey's stdout, a list of review flags for stderr, and a list of
 * debug-only repeat-fallback notices for callers that want to surface them
 * under `--debug`. The block ends with a newline when non-empty; an empty
 * block (no assignments) returns "".
 */
export async function renderDreamArt(
  manifest: JourneyManifest,
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  block: string;
  reviewFlags: readonly string[];
  repeatFallbacks: readonly string[];
}> {
  const selection = await selectDreamArt(manifest, projectRoot);
  if (selection.assignments.length === 0) {
    return {
      block: "",
      reviewFlags: selection.reviewFlags,
      repeatFallbacks: selection.repeatFallbacks,
    };
  }

  const supportsImages = supportsInlineImages(env);
  const lines: string[] = [];

  for (const assignment of selection.assignments) {
    if (supportsImages && assignment.imagePath) {
      try {
        const png = await circlePng(assignment.imagePath);
        lines.push(inlineImageEscape(png));
      } catch {
        // Image processing failed — fall back to name-only for this entry.
      }
    }
    lines.push(assignment.dreamName);
    lines.push("");
  }

  // Trim any single trailing blank line so the block has exactly one
  // terminating newline when joined.
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return {
    block: `${lines.join("\n")}\n`,
    reviewFlags: selection.reviewFlags,
    repeatFallbacks: selection.repeatFallbacks,
  };
}

/** Test helper: list every reward_type appearing in the ledger. */
export async function _ledgerRewardTypes(projectRoot: string): Promise<readonly string[]> {
  const index = await dreamLedger(projectRoot);
  return [...index.keys()];
}

/** Test helper: list every image file id found in the image directory. */
export async function _imageDirectoryIds(): Promise<readonly string[]> {
  // Re-read each call so tests can inject fixtures by pointing at temp dirs.
  if (!existsSync(IMAGE_DIRECTORY)) return [];
  const entries = await readdir(IMAGE_DIRECTORY);
  return entries
    .map((entry) => /-(\d+)\.[A-Za-z0-9]+$/u.exec(entry)?.[1])
    .filter((id): id is string => typeof id === "string");
}
