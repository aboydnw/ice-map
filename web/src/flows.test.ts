import { describe, expect, it } from "vitest";
import {
  QUANTUM,
  boardCsv,
  buildBoardRows,
  monthAxis,
  quantize,
  remainderOf,
  resolveEndpoint,
} from "./flows";
import type {
  Centroids,
  FacilityFlows,
  FlowEdge,
  FlowEndpoints,
} from "./types";

const endpoints: FlowEndpoints = {
  as_of: "2026-03-10",
  facilities: {
    JENATLA: {
      name: "Jena/Lasalle ICE Processing Center",
      lon: -92.13,
      lat: 31.68,
    },
  },
};
const states: Centroids = {
  TEXAS: { name: "Texas", lon: -97.56, lat: 31.05 },
};
const countries: Centroids = {
  GUATEMALA: { name: "Guatemala", lon: -90.23, lat: 15.78 },
};

function edge(
  key: string,
  count: number,
  months: [string, number][] = [],
): FlowEdge {
  return { key, count, months };
}

function flowsFor(out: FlowEdge[], into: FlowEdge[] = []): FacilityFlows {
  return {
    detloc: "AAA",
    as_of: "2026-03-10",
    window: ["2022-10-01", "2026-03-10"],
    totals: {
      out: out.reduce((sum, row) => sum + row.count, 0),
      in: into.reduce((sum, row) => sum + row.count, 0),
    },
    coverage: { origin_linked: 0.765, origin_linked_of: 1000 },
    in: into,
    out,
  };
}

describe("resolveEndpoint", () => {
  it("places a transfer at its facility", () => {
    expect(
      resolveEndpoint("transfer:JENATLA", endpoints, states, countries),
    ).toEqual({
      label: "Jena/Lasalle ICE Processing Center",
      lonLat: [-92.13, 31.68],
      kind: "facility",
    });
  });

  it("places a removal at its country and an arrest at its state", () => {
    expect(
      resolveEndpoint("removed:GUATEMALA", endpoints, states, countries),
    ).toEqual({
      label: "Guatemala",
      lonLat: [-90.23, 15.78],
      kind: "country",
    });
    expect(
      resolveEndpoint("arrested:TEXAS", endpoints, states, countries),
    ).toEqual({
      label: "Arrested in Texas",
      lonLat: [-97.56, 31.05],
      kind: "state",
    });
  });

  it("gives releases and redactions no geography", () => {
    for (const key of [
      "released:paroled",
      "not-reported",
      "custody:other-agency",
    ]) {
      const resolved = resolveEndpoint(key, endpoints, states, countries);
      expect(resolved.lonLat).toBeNull();
      expect(resolved.kind).toBe("none");
    }
    expect(
      resolveEndpoint("released:bonded-out", endpoints, states, countries)
        .label,
    ).toBe("Released — bonded out");
  });

  it("falls back rather than inventing a location for an unknown endpoint", () => {
    expect(
      resolveEndpoint("transfer:no-location", endpoints, states, countries),
    ).toEqual({
      label: "Another facility (location not published)",
      lonLat: null,
      kind: "none",
    });
    expect(
      resolveEndpoint("transfer:MYSTERY", endpoints, states, countries).lonLat,
    ).toBeNull();
    expect(
      resolveEndpoint("removed:ATLANTIS", endpoints, states, countries).label,
    ).toBe("Removed — country not recorded");
    expect(
      resolveEndpoint("arrested:NARNIA", endpoints, states, countries).label,
    ).toBe("Origin not recorded in ICE arrest data");
  });
});

describe("buildBoardRows", () => {
  it("keeps the pipeline's order and computes each row's share", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 60),
      edge("transfer:JENATLA", 30),
      edge("released:paroled", 10),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);

    expect(rows.map((row) => row.key)).toEqual([
      "removed:GUATEMALA",
      "transfer:JENATLA",
      "released:paroled",
    ]);
    expect(rows.map((row) => row.share)).toEqual([0.6, 0.3, 0.1]);
    expect(rows[0].label).toBe("Guatemala");
  });

  it("does not synthesize an other bucket", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 1),
      edge("released:paroled", 1),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);

    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.key === "other")).toBe(false);
  });
});

describe("remainderOf", () => {
  it("counts exactly what the visible rows leave out", () => {
    const flows = flowsFor([
      edge("a", 50),
      edge("b", 30),
      edge("c", 12),
      edge("d", 8),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);

    expect(remainderOf(rows, 2)).toEqual({ destinations: 2, count: 20 });
    expect(remainderOf(rows, 4)).toBeNull();
    expect(remainderOf(rows, 10)).toBeNull();
  });
});

describe("quantize", () => {
  const axis = monthAxis(["2022-10-01", "2026-03-10"]);

  it("builds one month per step across the window", () => {
    expect(axis).toHaveLength(42);
    expect(axis[0]).toBe("2022-10");
    expect(axis[41]).toBe("2026-03");
  });

  it("allocates dots so they sum to the total divided by the quantum", () => {
    const edges = [
      edge("a", 1013),
      edge("b", 487),
      edge("c", 260),
      edge("d", 41),
    ];
    const total = edges.reduce((sum, row) => sum + row.count, 0);
    const schedule = quantize(edges, axis);

    expect(schedule.reduce((sum, row) => sum + row.dots, 0)).toBe(
      Math.round(total / QUANTUM),
    );
    expect(schedule.every((row) => row.departures.length === row.dots)).toBe(
      true,
    );
  });

  it("keeps a sub-quantum edge visible as a single hollow dot", () => {
    const schedule = quantize([edge("big", 1000), edge("tiny", 3)], axis);

    expect(schedule[1]).toMatchObject({ key: "tiny", dots: 1, hollow: true });
    expect(schedule[0].hollow).toBe(false);
  });

  it("schedules departures inside the months the stints actually happened", () => {
    const schedule = quantize(
      [
        edge("a", 100, [
          ["2022-10", 50],
          ["2026-03", 50],
        ]),
      ],
      axis,
      QUANTUM,
    );
    const [first, ...rest] = schedule[0].departures;

    expect(schedule[0].dots).toBe(4);
    expect(first).toBeLessThan(1 / 42);
    expect(rest[rest.length - 1]).toBeGreaterThan(41 / 42);
    expect(schedule[0].departures.every((time) => time >= 0 && time < 1)).toBe(
      true,
    );
  });

  it("still emits the right number of dots when a month is off the axis", () => {
    const schedule = quantize([edge("a", 100, [["2019-01", 100]])], axis);

    expect(schedule[0].departures).toHaveLength(schedule[0].dots);
  });
});

describe("boardCsv", () => {
  it("leads with the stamp and ends with the total", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 60),
      edge("released:paroled", 40),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const lines = boardCsv("Jena", "out", flows, rows).split("\n");

    expect(lines[0]).toContain("2022-10-01 to 2026-03-10");
    expect(lines[0]).toContain("stints, not people");
    expect(lines[1]).toBe("destination,stints,share_of_total");
    expect(lines[2]).toBe('"Guatemala",60,0.6000');
    expect(lines[4]).toBe('"Total departures",100,1.0000');
  });

  it("escapes quotes in labels", () => {
    const flows = flowsFor([edge("transfer:MYSTERY", 1)]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    rows[0].label = 'The "Annex"';

    expect(boardCsv("X", "out", flows, rows).split("\n")[2]).toBe(
      '"The ""Annex""",1,1.0000',
    );
  });
});
