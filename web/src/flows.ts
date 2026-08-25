import type {
  Centroids,
  FacilityFlows,
  FlowDirection,
  FlowEndpoints,
} from "./types";

/** No dot ever stands for fewer stints than this, so small routes stay countable. */
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

/** The busiest route in a selection gets this many dots; the rest scale down. */
export const MAX_DOTS = 80;

/**
 * Stints per dot for one selection: the fixed minimum unless the busiest
 * route would overflow `MAX_DOTS`. Printed in the legend, since it can change
 * from one facility to the next.
 */
export function quantumFor(
  counts: number[],
  maxDots = MAX_DOTS,
  minimum = QUANTUM,
): number {
  const largest = Math.max(0, ...counts);
  return Math.max(minimum, Math.ceil(largest / maxDots));
}

/**
 * Allocate whole dots across edges by cumulative rounding, so the dots on
 * screen sum to `round(total / quantum)` however the counts split. Edges that
 * round down to nothing keep one hollow dot.
 */
export function quantize(
  edges: { key: string; count: number }[],
  quantum = QUANTUM,
): DotSchedule[] {
  let running = 0;
  return edges.map((edge) => {
    const before = Math.round(running / quantum);
    running += edge.count;
    const allocated = Math.round(running / quantum) - before;
    const hollow = allocated === 0;
    return { key: edge.key, dots: hollow ? 1 : allocated, hollow };
  });
}

function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Evenly spaced departures across the loop, phase-shifted by the edge key so
 * ten routes do not all fire on the same beat.
 */
export function emitSchedule(
  key: string,
  dots: number,
  loop: number,
): number[] {
  const phase = (hashOf(key) % 1000) / 1000;
  return Array.from(
    { length: dots },
    (_, index) => ((index + phase) / dots) * loop,
  );
}

export type FlowFamily =
  "transfer" | "removed" | "arrested" | "released" | "other";

const FAMILIES: Record<string, FlowFamily> = {
  transfer: "transfer",
  removed: "removed",
  arrested: "arrested",
  arrived: "arrested",
  released: "released",
};

export function familyOf(key: string): FlowFamily {
  const separator = key.indexOf(":");
  return FAMILIES[separator === -1 ? key : key.slice(0, separator)] ?? "other";
}

/** Routes closer in bearing than this share a trunk and fan apart at the end. */
export const LANE_ANGLE = 12;

export interface FlowArc {
  key: string;
  label: string;
  count: number;
  family: FlowFamily;
  source: [number, number];
  target: [number, number];
  /**
   * The route the dots ride. For a route that leaves the country this is only
   * the leg inside it; the rest is `tail`.
   */
  path: [number, number][];
  /**
   * Where the route crosses the border, when it does. The destination label
   * sits here so it can be read without zooming out; the route itself runs
   * on to the country. Never drawn as a marker.
   */
  exit: [number, number] | null;
  /** Lateral lane within a bearing cluster; 0 when the route has the corridor to itself. */
  lane: number;
  /** How long a dot takes to cross `path`, in ms. */
  travel: number;
}

export interface FlowDot {
  key: string;
  path: [number, number][];
  /** Offset within the loop at which this dot sets off, in ms. */
  start: number;
  travel: number;
  hollow: boolean;
}

/** A dot resolved to a map position for one animation frame. */
export interface PlacedDot {
  key: string;
  position: [number, number];
  hollow: boolean;
}

/** Great-circle samples per route; enough for the lane fan to read as a curve. */
const PATH_STEPS = 48;

export interface RouteOptions {
  /** Border rings; a route crossing out of them gets its label at the crossing. */
  rings?: [number, number][][];
  /** Lane spacing in degrees at the current zoom; 0 disables the fan. */
  laneWidthDeg?: number;
}

/**
 * Routes for the rows with a recorded place at the far end. A release has no
 * destination in ICE's data, so it gets no route at all: it stays on the board
 * and off the map, rather than being drawn to a place it never went. Routes
 * that leave the country are labelled at the border, and routes sharing a
 * bearing are fanned into lanes so neighbours stay distinguishable.
 */
export function buildArcs(
  rows: BoardRow[],
  facility: [number, number],
  direction: FlowDirection,
  options: RouteOptions = {},
): FlowArc[] {
  const rings = options.rings ?? [];
  const laneWidth = options.laneWidthDeg ?? 0;
  const arcs: FlowArc[] = [];
  for (const row of rows) {
    const far = row.lonLat;
    if (!far) continue;
    const source = direction === "out" ? facility : far;
    const target = direction === "out" ? far : facility;
    const path = greatCircle(source, target, PATH_STEPS);
    const split = rings.length === 0 ? null : splitAtExit(path, rings);
    arcs.push({
      key: row.key,
      label: row.label,
      count: row.count,
      family: familyOf(row.key),
      source,
      target,
      path,
      exit: split?.exit ?? null,
      lane: 0,
      travel: travelFor(path),
    });
  }
  const lanes = assignLanes(arcs, facility);
  for (const arc of arcs) {
    const lane = lanes.get(arc.key) ?? 0;
    arc.lane = lane;
    if (lane !== 0 && laneWidth > 0) {
      arc.path = fanPath(arc.path, lane * laneWidth, direction === "in");
    }
  }
  return arcs;
}

/** Points along the great circle between two coordinates, ends included. */
export function greatCircle(
  from: [number, number],
  to: [number, number],
  steps: number,
): [number, number][] {
  const toRad = Math.PI / 180;
  const [lon1, lat1] = [from[0] * toRad, from[1] * toRad];
  const [lon2, lat2] = [to[0] * toRad, to[1] * toRad];
  const delta =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    );
  if (delta === 0) return [from, to];
  const points: [number, number][] = [];
  for (let step = 0; step <= steps; step += 1) {
    const fraction = step / steps;
    const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
    const b = Math.sin(fraction * delta) / Math.sin(delta);
    const x =
      a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y =
      a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    points.push([
      Math.atan2(y, x) / toRad,
      Math.atan2(z, Math.sqrt(x * x + y * y)) / toRad,
    ]);
  }
  return points;
}

/** Ray-cast point-in-polygon across every ring. */
export function pointInRings(
  point: [number, number],
  rings: [number, number][][],
): boolean {
  const [x, y] = point;
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

export interface ExitSplit {
  /** The part of the route inside the rings, in travel order. */
  leg: [number, number][];
  /** The part outside, in travel order. */
  tail: [number, number][];
  exit: [number, number];
}

/**
 * Cut a route where it leaves the rings, walking from whichever end is
 * inside. Null when the route never crosses — both ends inside, or neither.
 */
export function splitAtExit(
  path: [number, number][],
  rings: [number, number][][],
): ExitSplit | null {
  const startInside = pointInRings(path[0], rings);
  const endInside = pointInRings(path[path.length - 1], rings);
  if (startInside === endInside) return null;
  const ordered = startInside ? path : [...path].reverse();
  let index = 0;
  while (
    index + 1 < ordered.length &&
    pointInRings(ordered[index + 1], rings)
  ) {
    index += 1;
  }
  let inside = ordered[index];
  let outside = ordered[index + 1];
  for (let step = 0; step < 20; step += 1) {
    const mid: [number, number] = [
      (inside[0] + outside[0]) / 2,
      (inside[1] + outside[1]) / 2,
    ];
    if (pointInRings(mid, rings)) inside = mid;
    else outside = mid;
  }
  const exit: [number, number] = [
    (inside[0] + outside[0]) / 2,
    (inside[1] + outside[1]) / 2,
  ];
  const within = [...ordered.slice(0, index + 1), exit];
  const beyond = [exit, ...ordered.slice(index + 1)];
  return startInside
    ? { leg: within, tail: beyond, exit }
    : { leg: within.reverse(), tail: beyond.reverse(), exit };
}

function bearingFrom(from: [number, number], to: [number, number]): number {
  const scale = Math.cos((from[1] * Math.PI) / 180);
  const degrees =
    (Math.atan2((to[0] - from[0]) * scale, to[1] - from[1]) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/**
 * Group routes by the direction they leave the facility and give each member
 * of a group its own lane, centred on the trunk. Lane order follows bearing,
 * so the same facility always fans the same way.
 */
export function assignLanes(
  arcs: FlowArc[],
  facility: [number, number],
): Map<string, number> {
  const routed = arcs
    .map((arc) => ({
      key: arc.key,
      bearing: bearingFrom(
        facility,
        arc.source === facility ? arc.target : arc.source,
      ),
    }))
    .sort((a, b) => a.bearing - b.bearing);
  const lanes = new Map<string, number>();
  let cluster: typeof routed = [];
  const flush = () => {
    cluster.forEach((member, index) => {
      lanes.set(member.key, index - (cluster.length - 1) / 2);
    });
    cluster = [];
  };
  for (const route of routed) {
    const previous = cluster[cluster.length - 1];
    if (previous && route.bearing - previous.bearing > LANE_ANGLE) flush();
    cluster.push(route);
  }
  flush();
  return lanes;
}

const FAN_START = 0.8;
const FAN_FULL = 0.9;
const FAN_HOLD = 0.96;

/**
 * Push the far end of a route sideways by `offsetDeg`, ramping in over the
 * last stretch and folding back so the dot still lands on its destination.
 */
export function fanPath(
  path: [number, number][],
  offsetDeg: number,
  farEndFirst: boolean,
): [number, number][] {
  const last = path.length - 1;
  if (last < 1) return path;
  return path.map((point, index) => {
    const along = farEndFirst ? 1 - index / last : index / last;
    let weight = 0;
    if (along >= FAN_FULL && along <= FAN_HOLD) weight = 1;
    else if (along > FAN_START && along < FAN_FULL) {
      weight = (along - FAN_START) / (FAN_FULL - FAN_START);
    } else if (along > FAN_HOLD && along < 1) {
      weight = (1 - along) / (1 - FAN_HOLD);
    }
    if (weight === 0) return point;
    const before = path[Math.max(index - 1, 0)];
    const after = path[Math.min(index + 1, last)];
    const scale = Math.cos((point[1] * Math.PI) / 180);
    const dx = (after[0] - before[0]) * scale;
    const dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    const amount = offsetDeg * weight;
    return [
      point[0] + ((-dy / length) * amount) / scale,
      point[1] + (dx / length) * amount,
    ];
  });
}

/** Milliseconds per degree of route; longer roads take longer to cross. */
export const MS_PER_DEGREE = 1_100;
export const TRAVEL_MIN_MS = 9_000;
export const TRAVEL_MAX_MS = 16_000;

/** Crossing time proportional to the route's length, within sane bounds. */
export function travelFor(path: [number, number][]): number {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    const [x0, y0] = path[index - 1];
    const [x1, y1] = path[index];
    const scale = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
    length += Math.hypot((x1 - x0) * scale, y1 - y0);
  }
  return Math.min(
    TRAVEL_MAX_MS,
    Math.max(TRAVEL_MIN_MS, Math.round(length * MS_PER_DEGREE)),
  );
}

/**
 * One dot per quantum, released onto its route at a steady rate. When a dot
 * left is not encoded; how many there are is.
 */
export function buildDots(
  arcs: FlowArc[],
  loop: number,
  quantum: number,
): FlowDot[] {
  const schedules = quantize(arcs, quantum);
  const dots: FlowDot[] = [];
  arcs.forEach((arc, index) => {
    const schedule = schedules[index];
    for (const start of emitSchedule(arc.key, schedule.dots, loop)) {
      dots.push({
        key: arc.key,
        path: arc.path,
        start,
        travel: arc.travel,
        hollow: schedule.hollow,
      });
    }
  });
  return dots;
}

/**
 * Where every in-flight dot sits at `currentTime`. The clock wraps every
 * `loop` ms, so the stream never drains. Pure, so the animation's arithmetic
 * is testable without a GL context — the renderer only paints what this
 * returns.
 */
export function placeDots(
  dots: FlowDot[],
  currentTime: number,
  loop: number,
): PlacedDot[] {
  const placed: PlacedDot[] = [];
  for (const dot of dots) {
    const elapsed = (((currentTime - dot.start) % loop) + loop) % loop;
    const progress = elapsed / dot.travel;
    if (progress > 1) continue;
    const steps = dot.path.length - 1;
    const exact = progress * steps;
    const index = Math.min(Math.floor(exact), steps - 1);
    const within = exact - index;
    const from = dot.path[index];
    const to = dot.path[index + 1];
    placed.push({
      key: dot.key,
      position: [
        from[0] + (to[0] - from[0]) * within,
        from[1] + (to[1] - from[1]) * within,
      ],
      hollow: dot.hollow,
    });
  }
  return placed;
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
