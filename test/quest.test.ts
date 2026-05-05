import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import {
  resolvePackageForDreamcaller,
  selectDreamcallerForSeed,
} from "../src/quest/packageResolution.js";
import { createInitialJourneyState } from "../src/quest/init.js";

const VAELA_ID = "60BD584B-5BC8-4EE7-8A98-CBB304EB71AB";
const DRUSUS_ID = "BDD3A3A7-242C-4D2B-8071-EBE56891A340";

describe("quest initialization", () => {
  it("creates the default Vaela initial state from current TOML content", async () => {
    const content = await loadContent(process.cwd());
    const state = createInitialJourneyState({
      seed: "default",
      content,
      contentVersion: "test-content-version",
    });

    expect(state.schemaVersion).toBe(1);
    expect(state.contentVersion).toBe("test-content-version");
    expect(state.quest.dreamcaller).toMatchObject({
      id: VAELA_ID,
      name: "Vaela",
      title: "Ember Among Remnants",
    });
    expect(state.quest.mandatoryTides).toEqual([
      "survivor_dissolve",
      "void_recursion",
      "reclaim_characters",
    ]);
    expect(state.quest.optionalSubset).toEqual([
      "void_setup",
      "cheap_curve",
      "character_tutors",
      "judgment_bodies",
    ]);
    expect(state.quest.selectedTides).toEqual([
      "survivor_dissolve",
      "void_recursion",
      "reclaim_characters",
      "void_setup",
      "cheap_curve",
      "character_tutors",
      "judgment_bodies",
    ]);
    expect(state.quest.draftPoolSummary).toEqual({
      totalCopies: 210,
      uniqueCards: 172,
      oneCopyCards: 134,
      twoCopyCards: 38,
    });
    expect(state.quest.dreamsignPoolSummary).toEqual({
      tidalPoolCount: 26,
      neutralCatalogCount: 48,
    });
    expect(state.quest.dreamsignPoolIds).toHaveLength(26);
    expect(state.quest.resources).toEqual({
      essence: 120,
      maxEssence: 500,
      omens: 1,
      dreamscape: 0,
    });
    expect(state.quest.activeDreamsigns).toEqual([]);
    expect(state.quest.route).toEqual({
      pacingLedger: {},
      unresolvedHooks: [],
    });
    expect(state.pendingJourney).toBeNull();
    expect(state.history).toEqual([]);
    expect(state.generator).toEqual({
      rootJourneyIndex: 1,
      lastJourneyId: null,
      cursors: {},
    });
  });

  it("builds the starter deck from Starter cards sorted by cardNumber", async () => {
    const content = await loadContent(process.cwd());
    const state = createInitialJourneyState({
      seed: "default",
      content,
      contentVersion: "test-content-version",
    });
    const cardById = new Map(content.cards.map((card) => [card.id, card]));

    expect(state.quest.deck.summary).toEqual({
      totalCards: 10,
      starterCards: 10,
      uniqueCards: 10,
    });
    expect(state.quest.deck.entries.map((entry) => entry.copies)).toEqual(
      Array.from({ length: 10 }, () => 1),
    );
    expect(
      state.quest.deck.entries.map((entry) => cardById.get(entry.cardId)?.cardNumber),
    ).toEqual([711, 712, 713, 714, 715, 716, 717, 718, 719, 720]);
  });

  it("excludes illegal Dreamcallers from non-default seed selection", async () => {
    const content = await loadContent(process.cwd());
    const vaela = content.dreamcallers.find((dreamcaller) => dreamcaller.id === VAELA_ID);
    const drusus = content.dreamcallers.find((dreamcaller) => dreamcaller.id === DRUSUS_ID);

    expect(vaela).toBeDefined();
    expect(drusus).toBeDefined();
    expect(() => resolvePackageForDreamcaller(drusus!, content)).toThrow(
      /not legal/,
    );

    const reducedContent = {
      ...content,
      dreamcallers: [drusus!, vaela!],
    };

    expect(selectDreamcallerForSeed("non-default-seed", reducedContent).id).toBe(
      VAELA_ID,
    );
  });
});
