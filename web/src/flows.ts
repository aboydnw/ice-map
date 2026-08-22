import type {
  Centroids,
  FacilityFlows,
  FlowDirection,
  FlowEdge,
  FlowEndpoints,
} from "./types";

/**
 * One animated dot stands for this many stints. Fixed globally and printed in
 * the legend: a per-facility quantum would make dots uncountable across the map.
 */
export const QUANTUM = 25;

/** Map rendering stops here by default; the board's "Show all" lifts it. */
export const TOP_EDGES = 10;

export type EndpointKind = "facility" | "state" | "country" | "none";

export interface ResolvedEndpoint {
  label: string;
  lonLat: [number, number] | null;
  kind: EndpointKind;
}

export interface BoardRow extends ResolvedEndpoint {
  key: string;
  count: number;
  share: number;
}

export interface Remainder {
  destinations: number;
  count: number;
}

export interface DotSchedule {
  key: string;
  dots: number;
  /** Sub-quantum edges get a single outline dot so they are never erased. */
  hollow: boolean;
  /** Departure offsets in [0, 1), one per dot, spread across the edge's months. */
  departures: number[];
}

const FIXED_LABELS: Record<string, string> = {
  "transfer:unknown": "Another facility (not identified)",
  "transfer:no-location": "Another facility (location not published)",
  "removed:unknown": "Removed — country not recorded",
  "arrived:unlinked": "Origin not recorded in ICE arrest data",
  "released:paroled": "Released — paroled",
  "released:bonded-out": "Released — bonded out",
  "released:recognizance": "Released — order of recognizance",
  "released:supervision": "Released — order of supervision",
  "released:court": "Released — case closed by court",
  "custody:other-agency": "Handed to U.S. Marshals or another agency",
  "other:died": "Died in custody",
  "other:escaped": "Escaped",
  "other:orr": "Office of Refugee Resettlement",
  "other:title-42": "Title 42 return",
  "other:processing-change": "Processing disposition changed locally",
  "other:unknown": "Other — reason not categorized",
  "not-reported": "Not reported by ICE",
};

function unresolved(label: string): ResolvedEndpoint {
  return { label, lonLat: null, kind: "none" };
}

/**
 * Turn an edge key into something a reader can place. Keys whose destination
 * ICE does not record resolve without coordinates — the map draws those at the
 * facility rather than inventing a geography for them.
 */
export function resolveEndpoint(
  key: string,
  endpoints: FlowEndpoints,
  states: Centroids,
  countries: Centroids,
): ResolvedEndpoint {
  const fixed = FIXED_LABELS[key];
  if (fixed) return unresolved(fixed);

  const separator = key.indexOf(":");
  const family = separator === -1 ? key : key.slice(0, separator);
  const value = separator === -1 ? "" : key.slice(separator + 1);

  if (family === "transfer") {
    const facility = endpoints.facilities[value];
    return facility
      ? {
          label: facility.name,
          lonLat: [facility.lon, facility.lat],
          kind: "facility",
        }
      : unresolved(FIXED_LABELS["transfer:no-location"]);
  }
  if (family === "removed") {
    const country = countries[value];
    return country
      ? {
          label: country.name,
          lonLat: [country.lon, country.lat],
          kind: "country",
        }
      : unresolved(FIXED_LABELS["removed:unknown"]);
  }
  if (family === "arrested") {
    const state = states[value];
    return state
      ? {
          label: `Arrested in ${state.name}`,
          lonLat: [state.lon, state.lat],
          kind: "state",
        }
      : unresolved(FIXED_LABELS["arrived:unlinked"]);
  }
  return unresolved(key);
}

/**
 * Every edge as a board row, largest first. Nothing is bucketed into a
 * synthesized "other" — the caller shows a remainder line instead.
 */
export function buildBoardRows(
  flows: FacilityFlows,
  direction: FlowDirection,
  endpoints: FlowEndpoints,
  states: Centroids,
  countries: Centroids,
): BoardRow[] {
  const total = flows.totals[direction];
  return flows[direction].map((edge) => ({
    key: edge.key,
    count: edge.count,
    share: total > 0 ? edge.count / total : 0,
    ...resolveEndpoint(edge.key, endpoints, states, countries),
  }));
}

/** What the visible rows leave out, stated rather than folded into a bucket. */
export function remainderOf(rows: BoardRow[], shown: number): Remainder | null {
  const hidden = rows.slice(shown);
  if (hidden.length === 0) return null;
  return {
    destinations: hidden.length,
    count: hidden.reduce((sum, row) => sum + row.count, 0),
  };
}

/** Every month in the data window, so all edges share one animation timeline. */
export function monthAxis(window: [string, string]): string[] {
  const [startYear, startMonth] = window[0].split("-").map(Number);
  const [endYear, endMonth] = window[1].split("-").map(Number);
  const axis: string[] = [];
  for (
    let index = startYear * 12 + startMonth - 1;
    index <= endYear * 12 + endMonth - 1;
    index += 1
  ) {
    axis.push(
      `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`,
    );
  }
  return axis;
}

/**
 * Allocate whole dots across edges by cumulative rounding, so the dots on
 * screen sum to `round(total / quantum)` however the counts split. Edges that
 * round down to nothing keep one hollow dot.
 */
export function quantize(
  edges: FlowEdge[],
  axis: string[],
  quantum = QUANTUM,
): DotSchedule[] {
  const slots = new Map(axis.map((month, index) => [month, index]));
  let running = 0;
  return edges.map((edge) => {
    const before = Math.round(running / quantum);
    running += edge.count;
    const allocated = Math.round(running / quantum) - before;
    const hollow = allocated === 0;
    const dots = hollow ? 1 : allocated;
    return {
      key: edge.key,
      dots,
      hollow,
      departures: scheduleDepartures(edge, dots, slots, axis.length),
    };
  });
}

/**
 * Spread an edge's dots over the months it actually happened in, so departures
 * leave in monthly pulses instead of an evenly-spaced river.
 */
function scheduleDepartures(
  edge: FlowEdge,
  dots: number,
  slots: Map<string, number>,
  span: number,
): number[] {
  const departures: number[] = [];
  if (span > 0 && edge.count > 0) {
    let running = 0;
    for (const [month, count] of edge.months) {
      const before = Math.round((running / edge.count) * dots);
      running += count;
      const share = Math.round((running / edge.count) * dots) - before;
      const slot = slots.get(month);
      if (slot === undefined) continue;
      for (let dot = 0; dot < share; dot += 1) {
        departures.push((slot + (dot + 0.5) / share) / span);
      }
    }
  }
  // Months outside the axis leave gaps; fill them so the dot count still matches.
  for (let index = departures.length; index < dots; index += 1) {
    departures.push((index + 0.5) / dots);
  }
  return departures.slice(0, dots).sort((a, b) => a - b);
}

/** The board is the citable record, so the copied table carries its own stamp. */
export function boardCsv(
  facilityName: string,
  direction: FlowDirection,
  flows: FacilityFlows,
  rows: BoardRow[],
): string {
  const heading = direction === "out" ? "Departures" : "Arrivals";
  const stamp =
    `${facilityName} — ${heading}, ${flows.window[0]} to ${flows.window[1]} · ` +
    "stints, not people · source: ICE via Deportation Data Project";
  const lines = [stamp, "destination,stints,share_of_total"];
  for (const row of rows) {
    lines.push(`${quote(row.label)},${row.count},${row.share.toFixed(4)}`);
  }
  lines.push(
    `${quote(`Total ${heading.toLowerCase()}`)},${flows.totals[direction]},1.0000`,
  );
  return lines.join("\n");
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
