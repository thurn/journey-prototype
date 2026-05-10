import { describe, expect, it } from "vitest";
import {
  expandPredicateAxes,
  type PredicateAxis,
} from "../src/journey/fillers/predicateAxes.js";
import { CARD_OPERATION_CATALOG } from "../src/journey/fillers/cardOperationCatalog.js";
import { DREAMSIGN_OPERATION_CATALOG } from "../src/journey/fillers/dreamsignOperationCatalog.js";
import { makeTestContext } from "./helpers/journey-context.js";

describe("expandPredicateAxes", () => {
  it("produces one entry per cartesian product point", () => {
    const axes: PredicateAxis[] = [
      { name: "keyword", values: ["Dissolve", "Anchor", "Echo"] as const },
      { name: "count", values: [1, 2, 3] as const },
    ];
    const expanded = expandPredicateAxes(axes);
    expect(expanded).toHaveLength(9);
    expect(expanded[0]).toEqual({ keyword: "Dissolve", count: 1 });
  });

  it("returns a single empty point when given no axes", () => {
    expect(expandPredicateAxes([])).toEqual([{}]);
  });
});

describe("card_keyword_remove migration", () => {
  it("declares a keyword axis covering at least 4 keywords", () => {
    const entry = CARD_OPERATION_CATALOG.find(
      (e) => e.key === "card_keyword_remove",
    );
    expect(entry).toBeDefined();
    const keywordAxis = entry!.predicateAxes!.find(
      (a) => a.name === "keyword",
    );
    expect(keywordAxis).toBeDefined();
    expect(keywordAxis!.values.length).toBeGreaterThanOrEqual(4);
  });

  it("expands to a concrete keyword at materialization time", () => {
    const entry = CARD_OPERATION_CATALOG.find(
      (e) => e.key === "card_keyword_remove",
    )!;
    const { drawContext } = makeTestContext({ seed: "kw-remove-1" });
    const materialized = entry.materialize!({
      entry,
      drawContext,
      label: "kw-remove",
      stage: "mid",
    });
    expect(materialized).toBeDefined();
    expect(materialized!.effect.keyword).toBeDefined();
  });
});

describe("predicate-axis migrations", () => {
  it.each([
    ["random_predicate_transfiguration", ["card_subtype", "card_count"]],
    ["dreamsign_random_select", ["orientation"]],
    ["dreamsign_draft_select", ["orientation"]],
    ["deck_card_cost_predicate_purge", ["cost_band"]],
    ["change_subtype_sigil", ["sigil_target"]],
    ["any_card_transfiguration", ["target_class"]],
  ])("entry %s declares axes %j", (key, axisNames) => {
    const entry =
      CARD_OPERATION_CATALOG.find((e) => e.key === key) ??
      DREAMSIGN_OPERATION_CATALOG.find((e) => e.key === key);
    expect(entry, `entry ${key}`).toBeDefined();
    for (const axisName of axisNames) {
      expect(
        entry!.predicateAxes?.some((a) => a.name === axisName),
        `entry ${key} missing axis ${axisName}`,
      ).toBe(true);
    }
  });
});
