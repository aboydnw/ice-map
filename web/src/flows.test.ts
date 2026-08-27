import { describe, expect, it } from "vitest";
import {
  alphaFor,
  buildFlowScene,
  countrySites,
  processingSites,
} from "./flowScene";
import {
  MAX_DOTS,
  QUANTUM,
  TRAVEL_MAX_MS,
  TRAVEL_MIN_MS,
  assignLanes,
  boardCsv,
  boardFile,
  buildArcs,
  buildBoardRows,
  buildDots,
  emitSchedule,
  cutBoard,
  cutoff,
  familiesIn,
  familyOf,
  fanPath,
  toggleFamily,
  MAX_LANE,
  MAX_ROUTES,
  MIN_ROUTES,
  placeDots,
  straightLine,
  monthAxis,
  quantize,
  quantumFor,
  resolveEndpoint,
  selectionFor,
  splitAtExit,
  travelFor,
} from "./flows";
import { US_RINGS } from "./usOutline";
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

describe("cutoff", () => {
  function rowsOf(counts: number[]) {
    const flows = flowsFor(
      counts.map((count, index) => edge(`transfer:R${index}`, count)),
    );
    return buildBoardRows(flows, "out", endpoints, states, countries);
  }

  it("stops once the ranked rows carry the coverage share", () => {
    expect(cutoff(rowsOf([50, 30, 10, 5, 3, 2]))).toBe(3);
    expect(cutoff(rowsOf([60, 25, 5, 4, 3]))).toBe(3);
  });

  it("never shows fewer than the minimum or more than the maximum", () => {
    expect(cutoff(rowsOf([96, 2, 1, 0]))).toBe(MIN_ROUTES);
    expect(cutoff(rowsOf([2, 1]))).toBe(2);
    expect(cutoff(rowsOf(Array.from({ length: 40 }, () => 1)))).toBe(
      MAX_ROUTES,
    );
  });

  it("keeps a tie at the boundary together", () => {
    expect(cutoff(rowsOf([50, 30, 10, 10, 10, 1]))).toBe(5);
  });
});

describe("cutBoard", () => {
  const flows = flowsFor([
    edge("transfer:JENATLA", 50),
    edge("removed:GUATEMALA", 30),
    edge("transfer:PISABEL", 12),
    edge("removed:MEXICO", 5),
    edge("released:paroled", 3),
  ]);
  const rows = buildBoardRows(flows, "out", endpoints, states, countries);

  it("shows the cut, states its coverage, and keeps the rest losslessly", () => {
    const cut = cutBoard(rows, { families: [], expanded: false });

    expect(cut.visible.map((row) => row.key)).toEqual([
      "transfer:JENATLA",
      "removed:GUATEMALA",
      "transfer:PISABEL",
    ]);
    expect(cut.hidden.map((row) => row.key)).toEqual([
      "removed:MEXICO",
      "released:paroled",
    ]);
    expect(cut.coverage).toBeCloseTo(0.92, 2);
    expect(cut.matched).toBe(5);
  });

  it("lists everything when expanded", () => {
    const cut = cutBoard(rows, { families: [], expanded: true });

    expect(cut.visible).toHaveLength(5);
    expect(cut.hidden).toEqual([]);
    expect(cut.coverage).toBe(1);
  });

  it("filters by family before cutting", () => {
    const cut = cutBoard(rows, { families: ["removed"], expanded: false });

    expect(cut.visible.map((row) => row.key)).toEqual([
      "removed:GUATEMALA",
      "removed:MEXICO",
    ]);
    expect(cut.matched).toBe(2);
    expect(cut.coverage).toBe(1);
  });

  it("lists the families a board has, in legend order", () => {
    expect(familiesIn(rows)).toEqual(["transfer", "removed", "released"]);
  });

  it("toggles chips so that all selected reads as no filter", () => {
    const present = familiesIn(rows);
    const view = { families: [], expanded: false };
    const onlyRemoved = toggleFamily(
      toggleFamily(view, "transfer", present),
      "released",
      present,
    );

    expect(toggleFamily(view, "transfer", present).families).toEqual([
      "removed",
      "released",
    ]);
    expect(onlyRemoved.families).toEqual(["removed"]);
    expect(toggleFamily(onlyRemoved, "removed", present).families).toEqual([
      "removed",
    ]);
    expect(
      toggleFamily(
        { families: ["removed", "released"], expanded: false },
        "transfer",
        present,
      ).families,
    ).toEqual([]);
  });
});

describe("quantize", () => {
  it("builds one month per step across the window", () => {
    const axis = monthAxis(["2022-10-01", "2026-03-10"]);

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
    const schedule = quantize(edges);

    expect(schedule.reduce((sum, row) => sum + row.dots, 0)).toBe(
      Math.round(total / QUANTUM),
    );
  });

  it("keeps a sub-quantum edge visible as a single hollow dot", () => {
    const schedule = quantize([edge("big", 1000), edge("tiny", 3)]);

    expect(schedule[1]).toMatchObject({ key: "tiny", dots: 1, hollow: true });
    expect(schedule[0].hollow).toBe(false);
  });
});

describe("quantumFor", () => {
  it("stays at the minimum for small selections", () => {
    expect(quantumFor([400, 120, 30])).toBe(QUANTUM);
  });

  it("grows so the busiest route never exceeds the dot cap", () => {
    const quantum = quantumFor([38_330, 6_031]);

    expect(quantum).toBeGreaterThan(QUANTUM);
    expect(Math.round(38_330 / quantum)).toBeLessThanOrEqual(MAX_DOTS);
    expect(Math.round(38_330 / quantum)).toBeGreaterThan(MAX_DOTS - 2);
  });
});

describe("emitSchedule", () => {
  it("spaces departures evenly across the loop", () => {
    const starts = emitSchedule("transfer:AAA", 4, 16_000);

    expect(starts).toHaveLength(4);
    expect(starts.every((start) => start >= 0 && start < 16_000)).toBe(true);
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index] - starts[index - 1]).toBeCloseTo(4_000, 6);
    }
  });

  it("offsets different routes so they do not fire together", () => {
    const a = emitSchedule("transfer:AAA", 4, 16_000)[0];
    const b = emitSchedule("removed:MEXICO", 4, 16_000)[0];

    expect(a).not.toBeCloseTo(b, 0);
    expect(emitSchedule("transfer:AAA", 4, 16_000)[0]).toBe(a);
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
    expect(lines[0].startsWith('"') && lines[0].endsWith('"')).toBe(true);
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

  it("gives destination-less rows no route at all", () => {
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

    expect(arcs).toHaveLength(0);
  });
});

describe("straightLine", () => {
  it("keeps both ends and runs straight between them", () => {
    const path = straightLine([-92, 31], [-90, 15], 8);

    expect(path).toHaveLength(9);
    expect(path[0]).toEqual([-92, 31]);
    expect(path[8]).toEqual([-90, 15]);
    expect(path[4]).toEqual([-91, 23]);
  });
});

describe("buildDots", () => {
  const facility: [number, number] = [-92.13, 31.68];

  it("emits one dot per quantum, each departing inside the loop", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 500),
      edge("released:paroled", 4),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const arcs = buildArcs(rows, facility, "out");
    const dots = buildDots(arcs, 16_000, QUANTUM);

    expect(dots).toHaveLength(Math.round(500 / QUANTUM));
    expect(dots.every((dot) => dot.start >= 0 && dot.start < 16_000)).toBe(
      true,
    );
    expect(dots.every((dot) => !dot.hollow)).toBe(true);
  });

  it("puts every dot on the path of the route it belongs to", () => {
    const flows = flowsFor([edge("removed:GUATEMALA", 500)]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const arcs = buildArcs(rows, facility, "out");
    const dots = buildDots(arcs, 16_000, QUANTUM);

    expect(dots.every((dot) => dot.path === arcs[0].path)).toBe(true);
    expect(dots.every((dot) => dot.travel === arcs[0].travel)).toBe(true);
  });
});

describe("travelFor", () => {
  it("takes longer to cross a longer route, within bounds", () => {
    const short = travelFor(straightLine([-92, 31], [-91, 31], 8));
    const medium = travelFor(straightLine([-92, 31], [-82, 31], 8));
    const long = travelFor(straightLine([-92, 31], [80, 20], 8));

    expect(short).toBe(TRAVEL_MIN_MS);
    expect(medium).toBeGreaterThan(short);
    expect(medium).toBeLessThan(TRAVEL_MAX_MS);
    expect(long).toBe(TRAVEL_MAX_MS);
  });
});

describe("placeDots", () => {
  const path: [number, number][] = [
    [0, 0],
    [10, 0],
    [20, 0],
  ];
  const dot = {
    key: "a",
    path,
    start: 1000,
    travel: 2000,
    hollow: false,
  };
  const loop = 10_000;

  it("shows a dot only while it is travelling", () => {
    expect(placeDots([dot], 900, loop)).toHaveLength(0);
    expect(placeDots([dot], 1000, loop)).toHaveLength(1);
    expect(placeDots([dot], 3000, loop)).toHaveLength(1);
    expect(placeDots([dot], 3100, loop)).toHaveLength(0);
  });

  it("walks the dot along its path in step with the clock", () => {
    expect(placeDots([dot], 1000, loop)[0].position).toEqual([0, 0]);
    expect(placeDots([dot], 2000, loop)[0].position[0]).toBeCloseTo(10, 6);
    expect(placeDots([dot], 3000, loop)[0].position[0]).toBeCloseTo(20, 6);
    expect(placeDots([dot], 1500, loop)[0].position[0]).toBeCloseTo(5, 6);
  });

  it("sets off again every loop, so the stream never drains", () => {
    expect(placeDots([dot], 11_500, loop)[0].position[0]).toBeCloseTo(5, 6);
    expect(placeDots([dot], 21_000, loop)[0].position[0]).toBeCloseTo(0, 6);
  });
});

describe("splitAtExit", () => {
  const texas: [number, number] = [-98.5, 29.4];

  it("cuts a route to Mexico at the land border", () => {
    const path = straightLine(texas, [-99.1, 19.4], 24);
    const split = splitAtExit(path, US_RINGS);

    expect(split).not.toBeNull();
    expect(split?.exit[1]).toBeGreaterThan(25);
    expect(split?.exit[1]).toBeLessThan(28);
    expect(split?.leg[0][0]).toBeCloseTo(texas[0], 6);
    expect(split?.leg[0][1]).toBeCloseTo(texas[1], 6);
    expect(split?.leg[split.leg.length - 1]).toEqual(split?.exit);
    expect(split?.tail[0]).toEqual(split?.exit);
    expect(split?.tail[split.tail.length - 1][1]).toBeCloseTo(19.4, 3);
  });

  it("cuts a route to Venezuela at the coast", () => {
    const georgia: [number, number] = [-83.6, 32.8];
    const split = splitAtExit(
      straightLine(georgia, [-66.6, 6.4], 24),
      US_RINGS,
    );

    expect(split).not.toBeNull();
    expect(split?.exit[1]).toBeGreaterThan(24);
    expect(split?.exit[1]).toBeLessThan(32);
    expect(split?.exit[0]).toBeGreaterThan(-84);
    expect(split?.exit[0]).toBeLessThan(-78);
  });

  it("leaves a domestic route whole", () => {
    expect(
      splitAtExit(straightLine(texas, [-118, 34], 24), US_RINGS),
    ).toBeNull();
  });

  it("keeps travel order when the far end comes first", () => {
    const path = straightLine([-99.1, 19.4], texas, 24);
    const split = splitAtExit(path, US_RINGS);

    expect(split?.tail[0][1]).toBeCloseTo(19.4, 3);
    expect(split?.leg[split.leg.length - 1][1]).toBeCloseTo(texas[1], 6);
  });
});

describe("assignLanes", () => {
  const facility: [number, number] = [-92.13, 31.68];

  function arcsTo(targets: Record<string, [number, number]>) {
    return Object.entries(targets).map(([key, target]) => ({
      key,
      label: key,
      count: 1,
      family: "transfer" as const,
      source: facility,
      target,
      path: [facility, target],
      exit: null,
      lane: 0,
      travel: 0,
    }));
  }

  it("gives neighbours their own lanes and a lone route none", () => {
    const lanes = assignLanes(
      arcsTo({
        houston: [-95.4, 29.8],
        sanAntonio: [-98.5, 29.4],
        dallas: [-96.8, 32.8],
        seattle: [-122.3, 47.6],
        austin: [-97.7, 30.3],
      }),
      facility,
    );

    expect(lanes.get("seattle")).toBe(0);
    expect(
      new Set([
        lanes.get("houston"),
        lanes.get("sanAntonio"),
        lanes.get("austin"),
      ]),
    ).toEqual(new Set([-1, 0, 1]));
    expect(lanes.get("dallas")).toBe(0);
  });

  it("folds a wide cluster back to the outermost lane", () => {
    const targets: Record<string, [number, number]> = {};
    for (let index = 0; index < 12; index += 1) {
      targets[`t${index}`] = [-95 - index * 0.05, 29.8];
    }
    const lanes = [...assignLanes(arcsTo(targets), facility).values()];

    expect(Math.max(...lanes)).toBe(MAX_LANE);
    expect(Math.min(...lanes)).toBe(-MAX_LANE);
  });

  it("gives a lone route the centre lane", () => {
    expect(assignLanes(arcsTo({ only: [-92, 32] }), facility).get("only")).toBe(
      0,
    );
  });
});

describe("fanPath", () => {
  const path = straightLine([-92, 31], [-72, 31], 40);

  it("leaves the trunk and both ends alone, and bends only the last stretch", () => {
    const fanned = fanPath(path, 0.5, false);

    expect(fanned[0]).toEqual(path[0]);
    expect(fanned[40]).toEqual(path[40]);
    for (let index = 0; index <= 32; index += 1) {
      expect(fanned[index]).toEqual(path[index]);
    }
    expect(Math.abs(fanned[37][1] - path[37][1])).toBeCloseTo(0.5, 2);
  });

  it("bends the first stretch instead when the far end comes first", () => {
    const fanned = fanPath(path, 0.5, true);

    expect(fanned[3]).not.toEqual(path[3]);
    expect(fanned[37]).toEqual(path[37]);
  });
});

describe("alphaFor", () => {
  it("leaves alpha alone when nothing is highlighted", () => {
    expect(alphaFor("a", null, 145)).toBe(145);
  });

  it("keeps a faint tail faint when highlighted", () => {
    expect(alphaFor("removed:MEXICO", "removed:MEXICO", 0)).toBe(0);
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

  it("samples a curve for a recorded destination", () => {
    const flows = flowsFor([
      edge("removed:GUATEMALA", 100, [["2023-01", 100]]),
    ]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const [geographic] = buildArcs(rows, facility, "out");

    expect(geographic.path.length).toBeGreaterThan(2);
    expect(geographic.path[0]).toEqual(facility);
  });

  it("routes only the rows that lead somewhere recorded", () => {
    const scene = sceneFor([
      edge("removed:GUATEMALA", 100, [["2023-01", 100]]),
      edge("released:paroled", 100, [["2023-01", 100]]),
      edge("not-reported", 100, [["2023-01", 100]]),
    ]);

    expect(scene.arcs.map((arc) => arc.key)).toEqual(["removed:GUATEMALA"]);
    expect(new Set(scene.dots.map((dot) => dot.key))).toEqual(
      new Set(["removed:GUATEMALA"]),
    );
  });

  it("labels a foreign route at the border but runs it to the country", () => {
    const flows = flowsFor([edge("removed:GUATEMALA", 100)]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const scene = buildFlowScene({
      flows,
      direction: "out",
      rows,
      facility,
      mappedCodes: new Set<string>(),
      animate: true,
      rings: US_RINGS,
    });
    const [arc] = scene.arcs;

    expect(arc.exit).not.toBeNull();
    expect(arc.path[arc.path.length - 1][1]).toBeCloseTo(15.78, 3);
    expect(scene.dots.every((dot) => dot.path === arc.path)).toBe(true);
    expect(scene.markers).toContainEqual(
      expect.objectContaining({ kind: "exit", label: "→ Guatemala · 100" }),
    );
  });

  it("reports the quantum the dots were counted in", () => {
    expect(sceneFor([edge("removed:GUATEMALA", 100)]).quantum).toBe(QUANTUM);
    expect(sceneFor([edge("removed:GUATEMALA", 40_000)]).quantum).toBe(
      quantumFor([40_000]),
    );
  });

  it("makes every dot ride the exact path its channel draws", () => {
    const scene = sceneFor([
      edge("removed:GUATEMALA", 500, [["2023-01", 500]]),
    ]);
    const channel = scene.arcs[0];

    expect(scene.dots.length).toBeGreaterThan(1);
    expect(scene.dots.every((dot) => dot.path === channel.path)).toBe(true);
  });
});

describe("country selections", () => {
  it("maps a country id to its board file the way the pipeline names it", () => {
    expect(boardFile("country:EL SALVADOR")).toBe("country/EL_SALVADOR.json");
    expect(boardFile("country:COTE D'IVOIRE")).toBe(
      "country/COTE_D_IVOIRE.json",
    );
    expect(boardFile("JENATLA")).toBe("JENATLA.json");
  });

  it("selects countries and unmapped facilities, nothing else", () => {
    const flows = flowsFor(
      [edge("removed:GUATEMALA", 5), edge("transfer:JENATLA", 5)],
      [edge("arrested:TEXAS", 5)],
    );
    const out = buildBoardRows(flows, "out", endpoints, states, countries);
    const [arrest] = buildBoardRows(flows, "in", endpoints, states, countries);

    expect(selectionFor(out[0], new Set())).toBe("country:GUATEMALA");
    expect(selectionFor(out[1], new Set())).toBe("JENATLA");
    expect(selectionFor(out[1], new Set(["JENATLA"]))).toBeNull();
    expect(selectionFor(arrest, new Set())).toBeNull();
  });

  it("leaves countries to the permanent layer and labels a selected one", () => {
    const facility: [number, number] = [-92.13, 31.68];
    const flows = flowsFor([edge("removed:GUATEMALA", 100)]);
    const rows = buildBoardRows(flows, "out", endpoints, states, countries);
    const fromFacility = buildFlowScene({
      flows,
      direction: "out",
      rows,
      facility,
      mappedCodes: new Set(["JENATLA"]),
      animate: false,
      rings: US_RINGS,
    });
    const exit = fromFacility.markers.find((m) => m.kind === "exit");

    expect(fromFacility.markers.some((m) => m.kind === "endpoint")).toBe(false);
    expect(exit?.select).toBe("country:GUATEMALA");

    const asCountry = flowsFor([], [edge("transfer:JENATLA", 100)]);
    const fromCountry = buildFlowScene({
      flows: asCountry,
      direction: "in",
      rows: buildBoardRows(asCountry, "in", endpoints, states, countries),
      facility: [-90.23, 15.78],
      mappedCodes: new Set(["JENATLA"]),
      animate: false,
      rings: US_RINGS,
      originLabel: "Guatemala",
    });

    expect(fromCountry.markers).toEqual([
      expect.objectContaining({
        label: "Guatemala",
        kind: "origin",
        select: null,
      }),
    ]);
    expect(fromCountry.arcs[0].exit).toBeNull();
  });
});

describe("processingSites", () => {
  const table: FlowEndpoints = {
    as_of: "2026-08-05",
    facilities: {
      DALHOLD: {
        name: "Dallas F.O. Hold",
        lon: -96.8,
        lat: 32.8,
        kind: "processing",
        stints: 38592,
      },
      AEXSTAGE: {
        name: "Alexandria Staging Facility",
        lon: -92.5,
        lat: 31.3,
        kind: "processing",
        stints: 157470,
      },
      JAILXX: {
        name: "Some County Jail",
        lon: -90,
        lat: 35,
        kind: "detention",
        stints: 400,
      },
    },
  };

  it("returns only processing sites, busiest first", () => {
    const sites = processingSites(table, new Set());

    expect(sites.map((site) => site.code)).toEqual(["AEXSTAGE", "DALHOLD"]);
    expect(sites[0].position).toEqual([-92.5, 31.3]);
  });

  it("skips sites the map already draws as a facility circle", () => {
    const sites = processingSites(table, new Set(["AEXSTAGE"]));

    expect(sites.map((site) => site.code)).toEqual(["DALHOLD"]);
  });

  it("lists every country with a board as a selectable grey site", () => {
    const sites = countrySites({
      ...table,
      countries: {
        GUATEMALA: { name: "Guatemala", lon: -90.23, lat: 15.78, stints: 50 },
        MEXICO: { name: "Mexico", lon: -102.55, lat: 23.63, stints: 900 },
      },
    });

    expect(sites.map((site) => site.code)).toEqual([
      "country:MEXICO",
      "country:GUATEMALA",
    ]);
    expect(sites[0]).toMatchObject({ kind: "country", name: "Mexico" });
    expect(countrySites(table)).toEqual([]);
  });
});
