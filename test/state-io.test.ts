import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { JourneyState } from "../src/state/schema.js";
import {
  parseJourneyState,
  readJourneyState,
  writeJourneyStateAtomic,
} from "../src/state/state.js";
import { stableStringify } from "../src/util/stableJson.js";
import { minimalState } from "./fixtures/state.js";

describe("stableStringify", () => {
  it("sorts object keys at every depth and appends a trailing newline", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n',
    );
  });

  it("preserves array order", () => {
    expect(stableStringify({ items: [{ b: 1, a: 2 }, 3] })).toBe(
      '{\n  "items": [\n    {\n      "a": 2,\n      "b": 1\n    },\n    3\n  ]\n}\n',
    );
  });
});

describe("state IO", () => {
  it("writes state with stable JSON through the state writer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "journey-state-"));
    const statePath = join(directory, ".journey", "state.json");
    const state = minimalState();

    await writeJourneyStateAtomic(statePath, state);

    expect(await readFile(statePath, "utf8")).toBe(stableStringify(state));
  });

  it("distinguishes missing, malformed, and loaded state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "journey-state-"));
    const missingPath = join(directory, "missing.json");

    await expect(readJourneyState(missingPath)).resolves.toEqual({
      kind: "missing",
    });

    const malformedPath = join(directory, "malformed.json");
    await writeFile(malformedPath, "{not json", "utf8");

    const malformed = await readJourneyState(malformedPath);
    expect(malformed.kind).toBe("malformed");
    expect(malformed).toMatchObject({
      rawBytes: expect.any(Uint8Array),
      error: expect.any(Error),
    });

    const loadedPath = join(directory, "loaded.json");
    const state = minimalState();
    await writeFile(loadedPath, stableStringify(state), "utf8");

    const loaded = await readJourneyState(loadedPath);
    expect(loaded.kind).toBe("loaded");

    if (loaded.kind === "loaded") {
      expect(loaded.state).toEqual(state);
      expect(Buffer.from(loaded.rawBytes).toString("utf8")).toBe(
        stableStringify(state),
      );
    }
  });

  it("rejects persisted state that fails the runtime schema", () => {
    const state = minimalState({
      contentVersion: "" as JourneyState["contentVersion"],
    });

    expect(() =>
      parseJourneyState(new TextEncoder().encode(stableStringify(state))),
    ).toThrow(/contentVersion/);
  });

  it("rejects persisted pending V2 manifests without required version metadata", () => {
    const state = minimalState({
      pendingJourney: {
        schemaVersion: 2,
        journeyId: "journey-1",
        seed: "default",
        rootJourneyIndex: 1,
        shapeId: "threshold-choice",
      } as JourneyState["pendingJourney"],
    });

    expect(() =>
      parseJourneyState(new TextEncoder().encode(stableStringify(state))),
    ).toThrow(/pendingJourney\.versions/);
  });
});
