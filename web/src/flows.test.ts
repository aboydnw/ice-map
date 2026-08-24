import { describe, expect, it } from "vitest";
import { alphaFor, buildFlowScene } from "./flowScene";
import {
  GATE_RADIUS,
  QUANTUM,
  boardCsv,
  buildArcs,
  buildBoardRows,
  buildTrips,
  familyOf,
  greatCircle,
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
    expect(schedule[0].departures.every((time) => time >= 0 && time < 1)).toBe(
      true,
    );
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

describe("familyOf", () => {
  it("groups keys by what happened, not by their exact value", () => {
    expect(familyOf("transfer:JENATLA")).toBe("transfer");
    expect(familyOf("removed:GUATEMALA")).toBe("removed");
    expect(familyOf("arrested:TEXAS")).toBe("arrested");
    expect(familyOf("arrived:unlinked")).toBe("arrested");
    expect(familyOf("released:paroled")).toBe("released");
    expect(familyOf("not-reported")).toBe("other");
    expect(familyOf("custody:other-agency")).toBe("other");
  });
});

describe("buildArcs", () => {
  const facility: [number, number] = [-92.13, 31.68];

  it("draws an out arc from the facility and an in arc towards it", () => {
    const flows = flowsFor(
      [edge("removed:GUATEMALA", 10)],
      [edge("arrested:TEXAS", 10)],
    );
    const [outArc] = buildArcs(
      buildBoardRows(flows, "out", endpoints, states, countries),
      facility,
      "out",
    );
    const [inArc] = buildArcs(
      buildBoardRows(flows, "in", endpoints, states, countries),
      facility,
      "in",
    );

    expect(outArc.source).toEqual(facility);
    expect(outArc.target).toEqual([-90.23, 15.78]);
    expect(inArc.source).toEqual([-97.56, 31.05]);
    expect(inArc.target).toEqual(facility);
  });

  it("fans destination-less rows around the facility instead of placing them", () => {
    const flows = flowsFor([
      edge("released:paroled", 10),
      edge("released:bonded-out", 8),
      edge("not-reported", 4),
    ]);
    const arcs = buildArcs(
      buildBoardRows(flows, "out", endpoints, states, countries),
      facility,
      "out",
    );

    expect(arcs.every((arc) => arc.gate)).toBe(true);
    for (const arc of arcs) {
      const dx = arc.target[0] - facility[0];
      const dy = arc.target[1] - facility[1];
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(GATE_RADIUS + 1e-9);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(0);
    }
    const targets = new Set(arcs.map((arc) => arc.target.join()));
    expect(targets.size).toBe(3);
  });
});

describe("greatCircle", () => {
  it("keeps both ends and bends between them", () => {
    const path = greatCircle([-92, 31], [-90.23, 15.78], 8);

    expect(path).toHaveLength(9);
    expect(path[0][0]).toBeCloseTo(-92, 4);
    expect(path[0][1]).toBeCloseTo(31, 4);
    expect(path[8][0]).toBeCloseTo(-90.23, 4);
    expect(path[8][1]).toBeCloseTo(15.78, 4);
  });

  it("degenerates safely when both ends are the same point", () => {
    expect(greatCircle([-92, 31], [-92, 31], 8)).toEqual([
      [-92, 31],
      [-92, 31],
    ]);
  });
});

describe("buildTrips", () => {
  const axis = monthAxis(["2022-10-01", "2026-03-10"]);
  const facility: [number, number] = [-92.13, 31.68];

  it("emits one trip per dot, each finishing within the cycle", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 500, [["2023-01", 500]]),
      edge("released:paroled", 4, [["2023-02", 4]]),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const arcs = buildArcs(rows, facility, "out");
    const trips = buildTrips(arcs, flows.out, axis, 16_000, 3_200);

    expect(trips).toHaveLength(Math.round(500 / QUANTUM) + 1);
    expect(
      trips.every((trip) => trip.timestamps.length === trip.path.length),
    ).toBe(true);
    expect(
      trips.every((trip) =>
        trip.timestamps.every(
          (time, index) => index === 0 || time > trip.timestamps[index - 1],
        ),
      ),
    ).toBe(true);
    expect(
      trips.every(
        (trip) => trip.timestamps[trip.timestamps.length - 1] <= 16_000 + 3_200,
      ),
    ).toBe(true);
    expect(trips.filter((trip) => trip.hollow)).toHaveLength(1);
  });

  it("reuses one path per edge so deck.gl sees stable geometry", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 500, [["2023-01", 500]]),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const trips = buildTrips(
      buildArcs(rows, facility, "out"),
      flows.out,
      axis,
      16_000,
      3_200,
    );

    expect(trips.every((trip) => trip.path === trips[0].path)).toBe(true);
  });
});

describe("alphaFor", () => {
  it("leaves alpha alone when nothing is highlighted", () => {
    expect(alphaFor("a", null, 145)).toBe(145);
  });

  it("keeps a highlighted gate stub fading to nothing", () => {
    expect(alphaFor("released:paroled", "released:paroled", 0)).toBe(0);
  });

  it("lifts the highlighted row and dims the rest, never past opaque", () => {
    expect(alphaFor("a", "a", 145)).toBeGreaterThan(145);
    expect(alphaFor("a", "a", 235)).toBe(255);
    expect(alphaFor("b", "a", 145)).toBeLessThan(145);
  });
});

describe("routes and channels", () => {
  const facility: [number, number] = [-92.13, 31.68];

  function sceneFor(out: FlowEdge[]) {
    const flows = flowsFor(out);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    return buildFlowScene({
      flows,
      direction: "out",
      rows,
      facility,
      mappedCodes: new Set<string>(),
      animate: true,
    });
  }

  it("samples a curve for a recorded destination and a stub for a gate", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 100, [["2023-01", 100]]),
      edge("released:paroled", 100, [["2023-01", 100]]),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const [geographic, gate] = buildArcs(rows, facility, "out");

    expect(geographic.path.length).toBeGreaterThan(2);
    expect(geographic.path[0]).toEqual(facility);
    expect(gate.path).toHaveLength(2);
    expect(gate.path[0]).toEqual(facility);
  });

  it("gives a channel only to routes that lead somewhere recorded", () => {
    const scene = sceneFor([
      edge("removed:GUATEMALA", 100, [["2023-01", 100]]),
      edge("released:paroled", 100, [["2023-01", 100]]),
      edge("not-reported", 100, [["2023-01", 100]]),
    ]);

    expect(scene.arcs).toHaveLength(3);
    expect(scene.channels.map((arc) => arc.key)).toEqual(["removed:GUATEMALA"]);
    expect(scene.channels.every((arc) => !arc.gate)).toBe(true);
  });

  it("routes destination-less dots to the fading gate layer", () => {
    const scene = sceneFor([
      edge("removed:GUATEMALA", 100, [["2023-01", 100]]),
      edge("released:paroled", 100, [["2023-01", 100]]),
    ]);

    expect(new Set(scene.trips.map((trip) => trip.key))).toEqual(
      new Set(["removed:GUATEMALA"]),
    );
    expect(new Set(scene.gateTrips.map((trip) => trip.key))).toEqual(
      new Set(["released:paroled"]),
    );
  });

  it("makes every dot ride the exact path its channel draws", () => {
    const scene = sceneFor([
      edge("removed:GUATEMALA", 500, [["2023-01", 500]]),
    ]);
    const channel = scene.channels[0];

    expect(scene.trips.length).toBeGreaterThan(1);
    expect(scene.trips.every((trip) => trip.path === channel.path)).toBe(true);
  });
});
