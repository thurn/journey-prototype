import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleJourney } from "../src/commands/journey.js";
import type { CommonCommandOptions } from "../src/commands/options.js";
import { handleRun } from "../src/commands/run.js";
import { readJourneyState } from "../src/state/state.js";
import { ExitCode } from "../src/util/exitCodes.js";

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/u;

type TempStateContext = {
  statePath: string;
  options: (overrides?: Partial<CommonCommandOptions>) => CommonCommandOptions;
};

async function withTempState<T>(
  run: (context: TempStateContext) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "journey-risk-"));
  const statePath = join(directory, ".journey", "state.json");

  try {
    return await run({
      statePath,
      options: (overrides = {}) => ({
        json: false,
        debug: false,
        debugContext: false,
        color: false,
        stderrColor: false,
        projectRoot: process.cwd(),
        statePath,
        debugListPayloads: false,
        ...overrides,
      }),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function expectMissingState(statePath: string): Promise<void> {
  await expect(readFile(statePath)).rejects.toThrow();
  await expect(readJourneyState(statePath)).resolves.toEqual({ kind: "missing" });
}

describe("stateless command risk transitions", () => {
  it("bare journey generates without creating local simulator state", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({ seed: "qa", stage: "late" }));

      expect(result).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(result.stdout).toContain("Dream Journey");
      expect(result.stdout).not.toContain("journey pick");
      await expectMissingState(statePath);
    });
  });

  it("run is a stateless alias and does not read existing state", async () => {
    await withTempState(async ({ statePath, options }) => {
      const first = await handleRun(options({ seed: "qa", stage: "mid" }));
      const second = await handleRun(options({ seed: "qa", stage: "mid" }));

      expect(first.exitCode).toBe(ExitCode.Success);
      expect(second.exitCode).toBe(ExitCode.Success);
      expect(first.stdout).toBe(second.stdout);
      await expectMissingState(statePath);
    });
  });

  it("batch generation increments root indexes without writing simulator state", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({
        json: true,
        seed: "qa",
        stage: "early",
        count: 4,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");

      const payload = JSON.parse(result.stdout);

      expect(payload.journeys.map((entry: { manifest: { journeyId: string } }) =>
        entry.manifest.journeyId
      )).toEqual(["J-000001", "J-000002", "J-000003", "J-000004"]);
      expect(payload.journeys.every((entry: { stage: string }) =>
        entry.stage === "early"
      )).toBe(true);
      await expectMissingState(statePath);
    });
  });

  it("seeded stage and forced shape produce a complete tree", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "late",
        shape: "prize_ladder",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Decision Tree");
      expect(result.stdout).toContain("Level 1");
      expect(result.stdout).toContain("Claim:");
      await expectMissingState(statePath);
    });
  });

  it("JSON contains manifest, context, tree data, and no ANSI", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        json: true,
        seed: "qa",
        stage: "mid",
        shape: "random_pool_draws",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toMatch(ANSI_PATTERN);

      const payload = JSON.parse(result.stdout);

      expect(payload).toMatchObject({
        status: "ok",
        contentVersion: expect.any(String),
        catalogVersion: "journey-shapes:v9",
        seed: "qa",
        stage: "mid",
        shapeId: "random_pool_draws",
        manifest: {
          schemaVersion: 2,
          shapeId: "random_pool_draws",
          versions: {
            contentVersion: expect.any(String),
            shapeCatalogVersion: "journey-shapes:v9",
            effectCatalogVersion: "effects:v2",
            valueModelVersion: "value:v5",
            rendererVersion: "renderer:v1",
            manifestContractVersion: "manifest:v2",
            validationContractVersion: "validation:v1",
          },
          tree: expect.any(Object),
          rewardPool: expect.any(Object),
        },
        context: {
          deck: expect.any(Object),
          draftPool: expect.any(Array),
          dreamsignPoolIds: expect.any(Array),
        },
      });
      expect(payload.manifest.versions.contentVersion).toBe(payload.contentVersion);
      expect(payload.manifest.versions.shapeCatalogVersion).toBe(payload.catalogVersion);
    });
  });

  it("--debug-context adds human context without enabling generation debug", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "mid",
        debugContext: true,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stdout).toContain("Debug Context");
      expect(result.stdout).toContain("Deck list:");
      expect(result.stdout).not.toContain("Selected shape:");
    });
  });

  it("--debug adds generation metadata explicitly", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "mid",
        debug: true,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stdout).toContain("Debug");
      expect(result.stdout).toContain("Selected shape:");
    });
  });

  it("forced wager output shows odds and debugs the committed roll", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "early",
        shape: "single_wager",
        debug: true,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).toMatch(/Pay \d+ essence\. \d+% chance to .+ otherwise gain nothing\./u);
      expect(result.stdout).toContain("Precommitted outcomes:");
      expect(result.stdout).toMatch(/1\. \d+% wager:/u);
      expect(result.stdout).toContain("committed roll:");
    });
  });

  it("lists deterministic debug payload families without generating a Journey", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({
        json: true,
        debugListPayloads: true,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toMatch(ANSI_PATTERN);

      const payload = JSON.parse(result.stdout);
      const qaIds = payload.payloads.families.flatMap((family: { variants: { qaId: string }[] }) =>
        family.variants.map((variant) => variant.qaId)
      );

      expect(payload).toMatchObject({
        status: "ok",
        command: "debug-list-payloads",
      });
      expect(payload).not.toHaveProperty("manifest");
      expect(qaIds).toEqual(expect.arrayContaining([
        "adapter/current",
        "card/named-card-operation-menu",
        "card/starter-cleanup-replacement",
        "dreamsign/named-dreamsign-shop-row",
        "dreamsign/dreamsign-transform-duplicate-pool",
        "bane/bane-gain-purge-transform",
        "resource/resource-edge-cases",
        "route/route-edits",
        "shop/shop-economy",
        "dreamwell/dreamwell-window",
        "status/status-reward-replacement",
        "hook/delayed-trigger-matrix",
        "return/paired-return-seal-borrow-trade",
        "random/reveal-roll-wager",
        "generated_object/generated-card",
        "generated_object/generated-dreamsign",
        "generated_object/generated-status",
        "generated_object/generated-transfiguration",
        "decision_tree/complete-decision-tree",
      ]));
      await expectMissingState(statePath);
    });
  });

  it("forces the current adapter payload with shape, stage, count, and JSON", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({
        json: true,
        seed: "qa",
        stage: "mid",
        shape: "shop_row",
        count: 3,
        debugPayloadFamily: "adapter",
        debugPayloadVariant: "current",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");

      const payload = JSON.parse(result.stdout);

      expect(payload).toMatchObject({
        status: "ok",
        command: "journey",
        count: 3,
        parameters: {
          debugPayloadFamily: "adapter",
          debugPayloadVariant: "current",
          shape: "shop_row",
          stage: "mid",
        },
      });
      expect(payload.journeys).toHaveLength(3);
      for (const entry of payload.journeys) {
        expect(entry.stage).toBe("mid");
        expect(entry.shapeId).toBe("shop_row");
        expect(entry.manifest.debug.debugPayload).toMatchObject({
          familyId: "adapter",
          variantId: "current",
          qaId: "adapter/current",
          source: "forced",
        });
        expect(entry.manifest.options.every((option: { operations: unknown[] }) =>
          option.operations.length > 0
        )).toBe(true);
      }
      await expectMissingState(statePath);
    });
  });

  it("prints forced adapter payload metadata in debug human output", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "late",
        shape: "single_reward",
        debug: true,
        debugPayloadFamily: "adapter",
        debugPayloadVariant: "current",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Debug payload: adapter/current");
      expect(result.stdout).toContain("Payload source: forced");
      expect(result.stdout).not.toMatch(ANSI_PATTERN);
    });
  });

  it("keeps named Dreamsign human, JSON, and debug output in parity", async () => {
    await withTempState(async ({ options }) => {
      const overrides = {
        seed: "parity-dreamsign",
        stage: "mid" as const,
        shape: "shop_row",
        debugPayloadFamily: "dreamsign",
        debugPayloadVariant: "named-dreamsign-shop-row",
      };
      const human = await handleJourney(options(overrides));
      const json = await handleJourney(options({ ...overrides, json: true }));
      const debug = await handleJourney(options({ ...overrides, debug: true }));
      const debugContext = await handleJourney(options({ ...overrides, debugContext: true }));

      expect(human.exitCode).toBe(ExitCode.Success);
      expect(json.exitCode).toBe(ExitCode.Success);
      expect(debug.exitCode).toBe(ExitCode.Success);
      expect(debugContext.exitCode).toBe(ExitCode.Success);
      expect(human.stdout).not.toMatch(ANSI_PATTERN);
      expect(json.stdout).not.toMatch(ANSI_PATTERN);

      const payload = JSON.parse(json.stdout);
      const optionsJson = payload.manifest.options as {
        text: string;
        operations: {
          operationKind: string;
          resource?: string;
          amount?: number;
          rewardKind?: string;
          visibility: string;
          timing?: { timingKind: string; label?: string };
          payload?: { dreamsignName?: string; sourcePoolSize?: number };
          targetResolution?: {
            selectorKind: string;
            sourcePool: string;
            candidateCount: number;
            selected: { name: string }[];
          };
          value?: { convertedEssence?: number };
        }[];
      }[];
      const dreamsignRewards = optionsJson.map((entry) =>
        entry.operations.find((operation) => operation.rewardKind === "dreamsign_gain")
      );
      const prices = optionsJson.map((entry) =>
        entry.operations.find((operation) =>
          operation.operationKind === "cost" && operation.resource === "essence"
        )?.amount
      );

      expect(payload.manifest.debug.debugPayload).toMatchObject({
        familyId: "dreamsign",
        variantId: "named-dreamsign-shop-row",
        qaId: "dreamsign/named-dreamsign-shop-row",
        source: "forced",
      });
      expect(payload.manifest.debug.semanticFingerprint).toMatchObject({
        algorithm: "semantic-fingerprint:v1",
        value: expect.any(String),
        components: expect.arrayContaining(["shape:shop_row", "stage:mid"]),
      });
      expect(prices).toEqual([20, 30, 45]);

      for (const reward of dreamsignRewards) {
        expect(reward).toMatchObject({
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_gain",
          visibility: "visible",
          timing: {
            timingKind: "immediate",
            label: "immediate",
          },
          targetResolution: {
            selectorKind: "dreamsign",
            sourcePool: "pool",
            candidateCount: 1,
          },
          value: {
            convertedEssence: expect.any(Number),
          },
        });
        const name = reward?.payload?.dreamsignName;

        expect(name).toEqual(expect.any(String));
        expect(reward?.payload?.sourcePoolSize).toBeGreaterThan(1);
        expect(human.stdout).toContain(`{${name}}`);
        expect(human.stdout).toContain("immediately");
        expect(debug.stdout).toContain(`selected=${name}`);
      }

      expect(human.stdout).toContain("Pay 20 essence.");
      expect(human.stdout).not.toContain("shop_row");
      expect(human.stdout).not.toContain("dreamsign/named-dreamsign-shop-row");
      expect(human.stdout).not.toContain("selectorKind");
      expect(human.stdout).not.toContain("Semantic fingerprint");
      expect(debug.stdout).toContain("Debug payload: dreamsign/named-dreamsign-shop-row");
      expect(debug.stdout).toContain("Forced QA controls: family=dreamsign; variant=named-dreamsign-shop-row");
      expect(debug.stdout).toContain("Target: dreamsign/pool candidates=1");
      expect(debug.stdout).toContain("Source pool size:");
      expect(debug.stdout).toContain("Validation:");
      expect(debug.stdout).toContain("Repair status: accepted_immediately");
      expect(debug.stdout).toContain("Semantic fingerprint:");
      expect(debugContext.stdout).toContain("Debug Context");
      expect(debugContext.stdout).not.toContain("Selected payload family:");
      expect(debugContext.stdout).not.toContain("Operations:");
      expect(debugContext.stdout).not.toContain("Semantic fingerprint:");
    });
  });

  it("rejects unknown, reserved, and constrained debug payload selections clearly", async () => {
    await withTempState(async ({ options }) => {
      const unknownFamily = await handleJourney(options({
        json: true,
        seed: "qa",
        debugPayloadFamily: "nope",
      }));
      const unknownVariant = await handleJourney(options({
        json: true,
        seed: "qa",
        debugPayloadFamily: "card",
        debugPayloadVariant: "nope",
      }));
      const reserved = await handleJourney(options({
        json: true,
        seed: "qa",
        stage: "early",
        shape: "single_reward",
        debugPayloadFamily: "dreamsign",
        debugPayloadVariant: "dreamsign-transform-duplicate-pool",
      }));

      expect(unknownFamily.exitCode).toBe(ExitCode.SetupOrSchema);
      expect(unknownFamily.stderr).toContain("Unknown debug payload family 'nope'");
      expect(unknownFamily.stderr).not.toContain(" at ");
      expect(unknownVariant.exitCode).toBe(ExitCode.SetupOrSchema);
      expect(unknownVariant.stderr).toContain("Unknown debug payload variant 'nope' for family 'card'");
      expect(unknownVariant.stderr).not.toContain(" at ");
      expect(reserved.exitCode).toBe(ExitCode.SetupOrSchema);
      expect(reserved.stderr).toContain("Debug payload 'dreamsign/dreamsign-transform-duplicate-pool' is reserved but unimplemented");
      expect(reserved.stderr).toContain("Supported shapes: all canonical shapes");
      expect(reserved.stderr).toContain("Supported stages: mid, late");
      expect(reserved.stderr).not.toContain(" at ");
    });
  });
});
