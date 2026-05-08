import { describe, expect, it } from "vitest";
import { buildCommonOptions } from "../src/cli.js";
import type { JourneyManifest } from "../src/journey/manifest.js";
import { adaptPrecommittedOperations } from "../src/journey/operationAdapters.js";
import { createJourneyError, renderError } from "../src/render/errors.js";
import { renderJourneyHuman, renderStateHuman } from "../src/render/human.js";
import { ExitCode } from "../src/util/exitCodes.js";
import { fixtureManifest, fixtureState } from "./fixtures/render.js";

function withStreamTty<T>(
  stream: NodeJS.WriteStream,
  isTTY: boolean,
  run: () => T,
): T {
  const descriptor = Object.getOwnPropertyDescriptor(stream, "isTTY");

  Object.defineProperty(stream, "isTTY", {
    configurable: true,
    value: isTTY,
  });

  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(stream, "isTTY", descriptor);
    } else {
      delete (stream as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
  }
}

function withoutNoColor<T>(run: () => T): T {
  const previous = process.env.NO_COLOR;

  delete process.env.NO_COLOR;

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previous;
    }
  }
}

describe("review feedback regressions", () => {
  it("gates error color with stderr TTY, not stdout TTY", () => {
    const options = withoutNoColor(() =>
      withStreamTty(process.stdout, true, () =>
        withStreamTty(process.stderr, false, () => buildCommonOptions({})),
      ),
    );

    expect(options.color).toBe(true);
    expect(options.stderrColor).toBe(false);

    const rendered = renderError(
      createJourneyError("boom", ExitCode.UsageOrInput),
      options,
    );

    expect(rendered.stderr).toBe("Error: boom\n");
    expect(rendered.stderr).not.toMatch(/\u001b\[/u);
  });

  it("renders human debug option values from manifest debug details", () => {
    const output = renderJourneyHuman(fixtureState(), fixtureManifest(), {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("1. Cost: canonical cost detail.");
    expect(output).toContain("   Effect: canonical effect detail.");
    expect(output).toContain("   Net: canonical net detail.");
    expect(output).not.toContain("Pay 1 essence");
    expect(output).not.toContain("999 converted essence");
  });

  it("renders precommitted outcomes in human debug output", () => {
    const precommitted = {
      random: [
        { kind: "gain_essence", amount: 110 },
        {
          kind: "wager",
          odds: { numerator: 50, denominator: 100, percent: 50 },
          stake: { kind: "essence", amount: 30, timing: "immediate" },
          success: { kind: "gain_essence", amount: 160 },
          failure: { kind: "no_reward" },
          roll: 73,
          committedResult: "failure",
          visibilityPolicy: {
            outcomeVisibility: "pre_rolled",
            disclosure: "The wager odds, stake, success, and failure are visible; the roll is precommitted.",
            playerVisible: true,
          },
          presentation: "visible_odds_debug_roll",
        },
        {
          kind: "card_draft",
          takeCount: 1,
          choiceCount: 4,
          predicate: { source: "draftPool", subtype: "Character" },
        },
      ],
      delayed: [
        {
          trigger: "after next victory",
          reward: { kind: "gain_omens", amount: 1 },
        },
        {
          trigger: "after next battle",
          reward: [
            {
              kind: "card_draft",
              takeCount: 1,
              choiceCount: 4,
              predicate: { source: "draftPool", cardType: "Character" },
            },
            { kind: "gain_omens", amount: 1 },
          ],
        },
      ],
    };
    const manifest: JourneyManifest = {
      ...fixtureManifest(),
      precommitted: {
        ...precommitted,
        operations: adaptPrecommittedOperations(precommitted),
      },
    };

    const output = renderJourneyHuman(fixtureState(), manifest, {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("Precommitted outcomes:");
    expect(output).toContain("1. Gain 110 essence.");
    expect(output).toContain("2. 50% wager: success: Gain 160 essence. failure: Gain nothing. committed roll: failure (roll 73).");
    expect(output).toContain("3. Draft 1 of 4 cards (subtype Character; source draftPool).");
    expect(output).toContain("after next victory: Gain 1 omen.");
    expect(output).toContain("after next battle: Draft 1 of 4 cards (card type Character; source draftPool). Gain 1 omen.");
  });

  it("renders manifest-local generated object debug metadata", () => {
    const manifest: JourneyManifest = {
      ...fixtureManifest(),
      generatedObjects: [
        {
          generatedObjectKind: "card",
          generatedObjectId: "generated-card-rain-lantern",
          name: "Rain Lantern",
          objectType: "Event Card",
          rulesText: "0 energy Event. Fast. Gain 1 omen.",
          tags: ["journey-only", "card"],
          references: { rules: ["Fast", "omens"] },
          lifetime: "journey_only",
          valueEstimate: {
            convertedEssence: 150,
            confidence: "medium",
            basis: "Fixture generated card value.",
          },
          validation: {
            source: "generated_manifest_local",
            status: "validated",
            ruleIds: ["stable_id"],
          },
          payload: { source: "manifest_generated" },
        },
      ],
    };

    const output = renderJourneyHuman(fixtureState(), manifest, {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("Generated objects:");
    expect(output).toContain("generated-card-rain-lantern: Rain Lantern (card; Event Card).");
    expect(output).toContain("Rules: 0 energy Event. Fast. Gain 1 omen.");
    expect(output).toContain("Value estimate: 150 essence (medium); Fixture generated card value.");
    expect(output).toContain("References: rules=Fast,omens.");
  });

  it("keeps precommitted outcomes out of normal human output unless option copy reveals them", () => {
    const precommitted = {
      random: [{ kind: "gain_essence", amount: 110 }],
    };
    const manifest: JourneyManifest = {
      ...fixtureManifest(),
      precommitted: {
        ...precommitted,
        operations: adaptPrecommittedOperations(precommitted),
      },
    };

    const output = renderJourneyHuman(fixtureState(), manifest, {
      json: false,
      debug: false,
      color: false,
    });

    expect(output).not.toContain("Precommitted outcomes:");
  });

  it("renders state history effect simulation in human-readable text", () => {
    const state = fixtureState();

    state.history.push({
      journeyId: "J-000001",
      shapeId: "single_offer",
      selectedOptionNumber: 1,
      selectedOptionText: "Spend a spark.",
      effectSimulation: "not_applied",
    });

    const output = renderStateHuman(state, {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("J-000001 option 1: Spend a spark.");
    expect(output).toContain("Effect simulation: not applied");
    expect(output).not.toContain("not_applied");
  });

  it("does not expose tide terminology in human state labels", () => {
    const output = renderStateHuman(fixtureState(), {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("Package selection");
    expect(output).not.toContain("Selected tides");
    expect(output).not.toContain("tidal in pool");
  });
});
