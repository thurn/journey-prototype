import { createHash } from "node:crypto";
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
const runSlowTests = process.env.JOURNEY_SLOW_TESTS === "1";
const slowIt = runSlowTests ? it : it.skip;

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

async function fileSha(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

type DistinctnessBatchPayload = {
  journeys: {
    manifest: {
      distinctness: {
        value: string;
        components: string[];
        explanation: {
          payloadFamilies: string[];
          curatedVariantIds: string[];
        } & Record<string, unknown>;
        equivalenceBands: unknown[];
      };
      debug: {
        semanticFingerprint: { value: string };
      };
    };
  }[];
};

function expectDistinctnessBatch(
  payload: DistinctnessBatchPayload,
  stage: "early" | "mid" | "late",
  count: number,
): void {
  const fingerprints = payload.journeys.map((entry) =>
    entry.manifest.distinctness.value
  );
  const firstDistinctness = payload.journeys[0]!.manifest.distinctness;
  const payloadFamilies = new Set(payload.journeys.flatMap((entry) =>
    entry.manifest.distinctness.explanation.payloadFamilies
  ));
  const curatedVariantIds = new Set(payload.journeys.flatMap((entry) =>
    entry.manifest.distinctness.explanation.curatedVariantIds
  ));

  expect(payload.journeys).toHaveLength(count);
  expect(new Set(fingerprints).size, stage).toBe(count);
  expect(payloadFamilies.size, stage).toBeGreaterThan(1);
  expect(curatedVariantIds.size, stage).toBeGreaterThan(1);
  expect([...payloadFamilies], stage).not.toEqual(["adapter"]);
  expect([...curatedVariantIds], stage).not.toEqual(["adapter/current"]);
  expect(payload.journeys.every((entry) =>
    entry.manifest.distinctness.value ===
      entry.manifest.debug.semanticFingerprint.value
  )).toBe(true);
  expect(firstDistinctness.components).toEqual(expect.arrayContaining([
    `stage:${stage}`,
    expect.stringMatching(/^shape:/u),
    expect.stringMatching(/^topology:/u),
    expect.stringMatching(/^payloadFamilies:/u),
    expect.stringMatching(/^operationVerbs:/u),
    expect.stringMatching(/^targetClasses:/u),
    expect.stringMatching(/^timingClasses:/u),
    expect.stringMatching(/^visibilityPolicies:/u),
    expect.stringMatching(/^majorRewardFamilies:/u),
    expect.stringMatching(/^motifs:/u),
    expect.stringMatching(/^curatedVariantIds:/u),
  ]));
  expect(firstDistinctness.explanation).toMatchObject({
    shapeId: expect.any(String),
    topology: expect.any(String),
    stage,
    payloadFamilies: expect.any(Array),
    operationVerbs: expect.any(Array),
    targetClasses: expect.any(Array),
    namedObjectIdentities: expect.any(Array),
    generatedObjectArchetypes: expect.any(Array),
    timingClasses: expect.any(Array),
    triggerClasses: expect.any(Array),
    routeScopes: expect.any(Array),
    statusScopes: expect.any(Array),
    randomEnvelopeTypes: expect.any(Array),
    revealEnvelopeTypes: expect.any(Array),
    visibilityPolicies: expect.any(Array),
    majorCostFamilies: expect.any(Array),
    majorRewardFamilies: expect.any(Array),
    majorBurdenFamilies: expect.any(Array),
    motifs: expect.any(Array),
    curatedVariantIds: expect.any(Array),
    semanticValueBands: expect.any(Array),
  });
  expect(firstDistinctness.equivalenceBands).toEqual(expect.arrayContaining([
    expect.objectContaining({
      field: expect.stringMatching(/^(essence_amount|omen_count|chance_percentage|duration_count|choice_count)$/u),
      band: expect.any(String),
      description: expect.any(String),
    }),
  ]));
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

  it("emits meaningful distinctness fingerprints for each fixed stage batch", async () => {
    await withTempState(async ({ statePath, options }) => {
      const stages = ["early", "mid", "late"] as const;
      const count = 4;
      const results = [];

      for (const stage of stages) {
        results.push(await handleJourney(options({
          json: true,
          seed: "variety",
          stage,
          count,
        })));
      }

      for (const [index, result] of results.entries()) {
        expect(result.exitCode).toBe(ExitCode.Success);
        expect(result.stderr).toBe("");
        expect(result.stdout).not.toMatch(ANSI_PATTERN);

        expectDistinctnessBatch(JSON.parse(result.stdout), stages[index]!, count);
      }

      for (const [index, stage] of stages.entries()) {
        const replay = await handleJourney(options({
          json: true,
          seed: "variety",
          stage,
          count,
        }));

        expect(replay.exitCode).toBe(ExitCode.Success);
        expect(replay.stdout).toBe(results[index]!.stdout);
      }

      const normal = await handleJourney(options({
        seed: "variety",
        stage: "early",
        count: 1,
      }));

      expect(normal.exitCode).toBe(ExitCode.Success);
      expect(normal.stdout).not.toContain("Semantic fingerprint");
      expect(normal.stdout).not.toContain("Fingerprint components");
      await expectMissingState(statePath);
    });
  });

  slowIt("emits 100 unique meaningful distinctness fingerprints for each fixed stage batch", async () => {
    await withTempState(async ({ statePath, options }) => {
      const stages = ["early", "mid", "late"] as const;
      const results = [];

      for (const stage of stages) {
        results.push(await handleJourney(options({
          json: true,
          seed: "variety",
          stage,
          count: 100,
        })));
      }

      for (const [index, result] of results.entries()) {
        expect(result.exitCode).toBe(ExitCode.Success);
        expect(result.stderr).toBe("");
        expect(result.stdout).not.toMatch(ANSI_PATTERN);

        expectDistinctnessBatch(JSON.parse(result.stdout), stages[index]!, 100);
      }

      for (const [index, stage] of stages.entries()) {
        const replay = await handleJourney(options({
          json: true,
          seed: "variety",
          stage,
          count: 100,
        }));

        expect(replay.exitCode).toBe(ExitCode.Success);
        expect(replay.stdout).toBe(results[index]!.stdout);
      }

      const normal = await handleJourney(options({
        seed: "variety",
        stage: "early",
        count: 1,
      }));

      expect(normal.exitCode).toBe(ExitCode.Success);
      expect(normal.stdout).not.toContain("Semantic fingerprint");
      expect(normal.stdout).not.toContain("Fingerprint components");
      await expectMissingState(statePath);
    });
  }, 360_000);

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
        catalogVersion: "journey-shapes:v12",
        seed: "qa",
        stage: "mid",
        shapeId: "random_pool_draws",
        manifest: {
          schemaVersion: 2,
          shapeId: "random_pool_draws",
          versions: {
            contentVersion: expect.any(String),
            shapeCatalogVersion: "journey-shapes:v12",
            effectCatalogVersion: "effects:v6",
            valueModelVersion: "value:v8",
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
      const variants = payload.payloads.families.flatMap(
        (family: { variants: { coverageKind: string; qaId: string }[] }) =>
          family.variants,
      );
      const qaIds = variants.map((variant: { qaId: string }) =>
        variant.qaId
      );

      expect(
        variants.every(
          (variant: { coverageKind: string }) =>
            variant.coverageKind === "debug_fixture",
        ),
      ).toBe(true);

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

  it("keeps forced debug fixture builders out of production filler exports", async () => {
    const productionModules = {
      card: await import("../src/journey/fillers/namedCardPayloads.js"),
      dreamsign: await import("../src/journey/fillers/dreamsignPayloads.js"),
      environment: await import("../src/journey/fillers/environmentPayloads.js"),
      bane: await import("../src/journey/fillers/banePayloads.js"),
      hook: await import("../src/journey/fillers/hookPayloads.js"),
      random: await import("../src/journey/fillers/randomPayloads.js"),
    };
    const fixtureOnlyExports = [
      "resourceEdgeCaseOptions",
      "namedCardOperationOptions",
      "starterCleanupReplacementOptions",
      "namedDreamsignShopRowOptions",
      "dreamsignTransformDuplicatePoolOptions",
      "baneGainPurgeTransformOptions",
      "routeEditOptions",
      "shopEconomyOptions",
      "dreamwellWindowOptions",
      "statusRewardReplacementOptions",
      "delayedTriggerMatrixOptions",
      "pairedReturnSealBorrowTradeOptions",
      "randomRevealRollWagerFill",
    ];

    for (const [moduleName, moduleExports] of Object.entries(
      productionModules,
    )) {
      for (const exportName of fixtureOnlyExports) {
        expect(
          moduleExports,
          `${moduleName} should not export ${exportName}`,
        ).not.toHaveProperty(exportName);
      }
    }
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

  it("forced generated-object payloads do not mutate TOML content or simulator state", async () => {
    const contentFiles = ["data/cards.toml", "data/dreamsigns.toml", "data/dreamcallers.toml"];
    const before = Object.fromEntries(await Promise.all(
      contentFiles.map(async (path) => [path, await fileSha(path)] as const),
    ));

    await withTempState(async ({ statePath, options }) => {
      for (const variant of [
        "generated-card",
        "generated-dreamsign",
        "generated-status",
        "generated-transfiguration",
      ]) {
        const result = await handleJourney(options({
          json: true,
          seed: variant,
          stage: "late",
          debugPayloadFamily: "generated_object",
          debugPayloadVariant: variant,
        }));

        expect(result.exitCode).toBe(ExitCode.Success);
        expect(result.stderr).toBe("");

        const payload = JSON.parse(result.stdout);

        expect(payload.manifest.generatedObjects).toHaveLength(1);
        expect(payload.manifest.debug.validation.ok).toBe(true);
      }

      await expectMissingState(statePath);
    });

    const after = Object.fromEntries(await Promise.all(
      contentFiles.map(async (path) => [path, await fileSha(path)] as const),
    ));

    expect(after).toEqual(before);
  });

  it("forces complete decision-tree payloads with visible typed tree metadata", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({
        json: true,
        seed: "tree-complete",
        stage: "late",
        debugPayloadFamily: "decision_tree",
        debugPayloadVariant: "complete-decision-tree",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");

      const payload = JSON.parse(result.stdout);
      const manifest = payload.manifest;
      const branches = manifest.tree.nodes.flatMap((node: { branches: unknown[] }) => node.branches);
      const completeTreePrecommit = manifest.precommitted.random.find((entry: { kind: string }) =>
        entry.kind === "complete_decision_tree"
      );

      expect(manifest.shapeId).toBe("push_your_luck");
      expect(manifest.rewardPool.operations.length).toBeGreaterThan(0);
      expect(branches.some((branch: { odds?: unknown }) => branch.odds)).toBe(true);
      expect(branches.some((branch: { terminal?: { outcome?: string } }) =>
        branch.terminal?.outcome === "failure"
      )).toBe(true);
      expect(branches.some((branch: { label?: string }) => branch.label === "Stop")).toBe(true);
      expect(completeTreePrecommit).toMatchObject({
        kind: "complete_decision_tree",
        motif: "push_your_luck",
        visibilityPolicy: {
          outcomeVisibility: "visible",
          playerVisible: true,
        },
      });
      expect(manifest.precommitted.operations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          operationKind: "random_envelope",
          envelopeKind: "complete_decision_tree",
          visibility: "precommitted",
        }),
      ]));
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
        entry.operations.find((operation) => operation.rewardKind === "dreamsign_purchase")
      );
      const prices = optionsJson.map((entry) =>
        entry.operations.find((operation) =>
          operation.operationKind === "cost"
        )
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
      expect(prices).toEqual([
        expect.objectContaining({ resource: "essence", amount: 20 }),
        expect.objectContaining({ resource: "omens", amount: 1 }),
        expect.objectContaining({ resource: "essence", amount: 45 }),
      ]);

      for (const reward of dreamsignRewards) {
        expect(reward).toMatchObject({
          operationKind: "reward",
          role: "reward",
          rewardKind: "dreamsign_purchase",
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
      expect(human.stdout).toContain("Pay 1 omen.");
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

  it("changes semantic fingerprints when forced Dreamsign selections differ", async () => {
    await withTempState(async ({ options }) => {
      const overrides = {
        stage: "mid" as const,
        shape: "shop_row",
        debugPayloadFamily: "dreamsign",
        debugPayloadVariant: "named-dreamsign-shop-row",
        json: true,
      };
      const first = await handleJourney(options({ ...overrides, seed: "parity-dreamsign" }));
      const second = await handleJourney(options({ ...overrides, seed: "another-dreamsign" }));

      expect(first.exitCode).toBe(ExitCode.Success);
      expect(second.exitCode).toBe(ExitCode.Success);

      const firstPayload = JSON.parse(first.stdout);
      const secondPayload = JSON.parse(second.stdout);
      const dreamsignNames = (payload: {
        manifest: {
          options: {
            operations: { rewardKind?: string; payload?: { dreamsignName?: string } }[];
          }[];
        };
      }) =>
        payload.manifest.options.map((entry) =>
          entry.operations.find((operation) => operation.rewardKind === "dreamsign_purchase")
            ?.payload?.dreamsignName
        );

      expect(dreamsignNames(firstPayload)).toEqual([
        "Belladonna",
        "Brown Acorn",
        "Pyramid Relic",
      ]);
      expect(dreamsignNames(secondPayload)).toEqual([
        "Ice Crystals",
        "Dead Rat",
        "Clam Shell",
      ]);
      expect(firstPayload.manifest.debug.semanticFingerprint.value).not.toBe(
        secondPayload.manifest.debug.semanticFingerprint.value,
      );
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
      const constrained = await handleJourney(options({
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
      expect(constrained.exitCode).toBe(ExitCode.SetupOrSchema);
      expect(constrained.stderr).toContain("Debug payload 'dreamsign/dreamsign-transform-duplicate-pool' does not support shape 'single_reward'");
      expect(constrained.stderr).toContain("Supported shapes: curated_reward_trio");
      expect(constrained.stderr).not.toContain(" at ");
    });
  });

  it("emits typed Dreamsign transform, duplicate, temporary, pool, random, trigger, and trade payloads", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        json: true,
        seed: "dreamsign-transform",
        stage: "mid",
        debugPayloadFamily: "dreamsign",
        debugPayloadVariant: "dreamsign-transform-duplicate-pool",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);

      const payload = JSON.parse(result.stdout);
      const rewardKinds = payload.manifest.options.flatMap((entry: {
        operations: { rewardKind?: string }[];
      }) => entry.operations.map((operation) => operation.rewardKind).filter(Boolean));

      expect(payload.manifest.shapeId).toBe("curated_reward_trio");
      expect(payload.manifest.debug.debugPayload).toMatchObject({
        qaId: "dreamsign/dreamsign-transform-duplicate-pool",
        source: "forced",
      });
      expect(rewardKinds).toEqual(expect.arrayContaining([
        "dreamsign_gain",
        "dreamsign_purge",
        "dreamsign_loss",
        "dreamsign_transform",
        "dreamsign_duplicate",
        "dreamsign_temporary_grant",
        "dreamsign_copy_gain",
        "dreamsign_pool_edit",
        "dreamsign_trade_hook",
        "dreamsign_trigger_counter",
        "dreamsign_random_reward",
      ]));
      expect(payload.manifest.precommitted.operations).toEqual(expect.arrayContaining([
        expect.objectContaining({ operationKind: "random_envelope", role: "random" }),
        expect.objectContaining({ operationKind: "delayed_hook", role: "delayed_hook" }),
      ]));
      expect(payload.manifest.debug.validation).toMatchObject({ ok: true, failed: 0 });
    });
  });
});
