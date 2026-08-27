import type {
  Centroids,
  FacilityFlows,
  FlowDirection,
  FlowEdge,
  FlowEndpoints,
} from "./types";

/** No dot ever stands for fewer stints than this, so small routes stay countable. */
export const QUANTUM = 25;

/** Selection ids for destination countries, as distinct from facility codes. */
export const COUNTRY_PREFIX = "country:";

export function isCountry(selection: string | null): boolean {
  return selection !== null && selection.startsWith(COUNTRY_PREFIX);
}

/** The country key inside a `country:` selection id. */
export function countryKey(selection: string): string {
  return selection.slice(COUNTRY_PREFIX.length);
}

/** Mirrors the pipeline's `country_slug`, so both sides name the same file. */
export function countrySlug(key: string): string {
  return key
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The board file for a selection id: a facility code or a `country:` id. */
export function boardFile(selection: string): string {
  return isCountry(selection)
    ? `country/${countrySlug(countryKey(selection))}.json`
    : `${selection}.json`;
}

/**
 * What clicking a row's far end should select: the country's board, or a
 * facility the circle map does not have (processing sites). Null when the
 * far end is a mapped circle, a state, or nowhere.
 */
export function selectionFor(
  row: BoardRow,
  mappedCodes: Set<string>,
): string | null {
  const value = row.key.slice(row.key.indexOf(":") + 1);
  if (row.kind === "country") return COUNTRY_PREFIX + value;
  if (row.kind === "facility" && !mappedCodes.has(value)) return value;
  return null;
}

/** What a board row leads to when clicked: the far facility or country, if any. */
export function rowTarget(row: BoardRow): string | null {
  const value = row.key.slice(row.key.indexOf(":") + 1);
  if (row.kind === "country") return COUNTRY_PREFIX + value;
  if (row.kind === "facility") return value;
  return null;
}

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

export interface DotSchedule {
  key: string;
  dots: number;
  /** Sub-quantum edges get a single outline dot so they are never erased. */
  hollow: boolean;
}

const FIXED_LABELS: Record<string, string> = {
  "transfer:unknown": "Another facility (not identified)",
  "transfer:no-location": "Another facility (location not published)",
  "transfer:same-facility": "Re-booked at this facility",
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

/** The board and the animation describe this many complete months. */
export const RECENT_MONTHS = 12;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The last month that is complete on `asOf`, as YYYY-MM. */
export function lastCompleteMonth(asOf: string): string {
  const [year, month, day] = asOf.split("-").map(Number);
  if (day >= daysIn(year, month)) return monthKey(year, month);
  return month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
}

/** Whole months spanned by a window, inclusive of both ends. */
export function monthsIn(window: [string, string]): number {
  const [startYear, startMonth] = window[0].split("-").map(Number);
  const [endYear, endMonth] = window[1].split("-").map(Number);
  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
}

/**
 * A facility's flows over its last `months` complete months. The board is a
 * picture of recent movement, not a ledger of everything since 2022, and the
 * animation's dot count follows the same figures, so the two always agree.
 * Coverage is recomputed from the rows: every first arrival is either linked
 * to an arrest or explicitly unlinked.
 */
export function recentFlows(
  flows: FacilityFlows,
  months = RECENT_MONTHS,
): FacilityFlows {
  const end = lastCompleteMonth(flows.as_of);
  const [endYear, endMonth] = end.split("-").map(Number);
  const startIndex = endYear * 12 + endMonth - 1 - (months - 1);
  const start = monthKey(Math.floor(startIndex / 12), (startIndex % 12) + 1);
  const trim = (edges: FlowEdge[]): FlowEdge[] =>
    edges
      .map((edge) => {
        const kept = edge.months.filter(
          ([month]) => month >= start && month <= end,
        );
        return {
          key: edge.key,
          count: kept.reduce((sum, [, count]) => sum + count, 0),
          months: kept,
        };
      })
      .filter((edge) => edge.count > 0)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const inRows = trim(flows.in);
  const outRows = trim(flows.out);
  const sum = (edges: FlowEdge[]) =>
    edges.reduce((total, edge) => total + edge.count, 0);
  const first = sum(
    inRows.filter(
      (edge) =>
        edge.key.startsWith("arrested:") || edge.key === "arrived:unlinked",
    ),
  );
  const linked = sum(inRows.filter((edge) => edge.key.startsWith("arrested:")));
  return {
    ...flows,
    window: [
      `${start}-01`,
      `${end}-${String(daysIn(endYear, endMonth)).padStart(2, "0")}`,
    ],
    totals: { in: sum(inRows), out: sum(outRows) },
    coverage: {
      origin_linked:
        first > 0 ? Math.round((linked / first) * 1000) / 1000 : null,
      origin_linked_of: first,
    },
    in: inRows,
    out: outRows,
  };
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

/**
 * A board opens showing routes until they cover this share of the direction's
 * stints, bounded so a dominant route still has company and a diffuse board
 * still fits on a map. Chosen from the data: the median board needs 4 routes
 * to reach 80%, the p90 needs 17.
 */
export const COVERAGE_SHARE = 0.8;
export const MIN_ROUTES = 3;
export const MAX_ROUTES = 15;

export const FAMILY_LABELS: Record<FlowFamily, string> = {
  transfer: "Transfers",
  removed: "Deportations",
  arrested: "Arrests",
  released: "Releases",
  other: "Other",
};

const FAMILY_ORDER: FlowFamily[] = [
  "transfer",
  "removed",
  "arrested",
  "released",
  "other",
];

/** What the reader has asked the board to show. */
export interface FlowView {
  /** Families to keep; empty means all of them. */
  families: FlowFamily[];
  /** Whether the "Other" remainder is listed and drawn. */
  expanded: boolean;
}

export const DEFAULT_VIEW: FlowView = { families: [], expanded: false };

export interface BoardCut {
  /** Rows the board lists and the map draws. */
  visible: BoardRow[];
  /** The lossless remainder, listed only when expanded. */
  hidden: BoardRow[];
  /** Share of the filtered stints the visible rows carry. */
  coverage: number;
  /** Rows after the family filter, before the cut. */
  matched: number;
}

/** Families present on a board, in legend order. */
export function familiesIn(rows: BoardRow[]): FlowFamily[] {
  const present = new Set(rows.map((row) => familyOf(row.key)));
  return FAMILY_ORDER.filter((family) => present.has(family));
}

/**
 * How many ranked rows it takes to reach the coverage share, bounded to
 * [MIN_ROUTES, MAX_ROUTES]; a tie at the share boundary is kept together
 * unless the maximum cuts it.
 */
export function cutoff(rows: BoardRow[]): number {
  if (rows.length <= MIN_ROUTES) return rows.length;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let reached = rows.length;
  let running = 0;
  for (let index = 0; index < rows.length; index += 1) {
    running += rows[index].count;
    if (running >= total * COVERAGE_SHARE) {
      reached = index + 1;
      break;
    }
  }
  while (
    reached < rows.length &&
    rows[reached].count === rows[reached - 1].count
  ) {
    reached += 1;
  }
  return Math.min(Math.max(reached, MIN_ROUTES), MAX_ROUTES, rows.length);
}

/** Apply the reader's view to ranked rows: filter by family, then cut. */
export function cutBoard(rows: BoardRow[], view: FlowView): BoardCut {
  const kept =
    view.families.length === 0
      ? rows
      : rows.filter((row) => view.families.includes(familyOf(row.key)));
  const shown = view.expanded ? kept.length : cutoff(kept);
  const visible = kept.slice(0, shown);
  const hidden = kept.slice(shown);
  const total = kept.reduce((sum, row) => sum + row.count, 0);
  const carried = visible.reduce((sum, row) => sum + row.count, 0);
  return {
    visible,
    hidden,
    coverage: total > 0 ? carried / total : 1,
    matched: kept.length,
  };
}

/** Toggle one family chip; selecting every family is the same as none. */
export function toggleFamily(
  view: FlowView,
  family: FlowFamily,
  present: FlowFamily[],
): FlowView {
  const active = view.families.length === 0 ? present : view.families;
  const next = active.includes(family)
    ? active.filter((candidate) => candidate !== family)
    : [...active, family];
  if (next.length === 0) return { ...view, families: [family] };
  const all = present.every((candidate) => next.includes(candidate));
  return { ...view, families: all ? [] : next };
}

/** Routes closer in bearing than this share a trunk and fan apart at the end. */
export const LANE_ANGLE = 12;
/** Beyond this many lanes either side the fan folds back on itself. */
export const MAX_LANE = 3;

export interface FlowArc {
  key: string;
  label: string;
  count: number;
  family: FlowFamily;
  source: [number, number];
  target: [number, number];
  /** The route the dots ride, from source to target. */
  path: [number, number][];
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
  /** How far along its route the dot is, 0 at departure and 1 on arrival. */
  progress: number;
}

/** Samples per route; enough for the lane fan to read as a curve. */
const PATH_STEPS = 48;

export interface RouteOptions {
  /** Lane spacing in degrees at the current zoom; 0 disables the fan. */
  laneWidthDeg?: number;
}

/**
 * Routes for the rows with a recorded place at the far end. A release has no
 * destination in ICE's data, so it gets no route at all: it stays on the board
 * and off the map, rather than being drawn to a place it never went. Routes
 * sharing a bearing are fanned into lanes so neighbours stay distinguishable.
 */
export function buildArcs(
  rows: BoardRow[],
  facility: [number, number],
  direction: FlowDirection,
  options: RouteOptions = {},
): FlowArc[] {
  const laneWidth = options.laneWidthDeg ?? 0;
  const arcs: FlowArc[] = [];
  for (const row of rows) {
    const far = row.lonLat;
    if (!far) continue;
    const source = direction === "out" ? facility : far;
    const target = direction === "out" ? far : facility;
    const path = straightLine(source, target, PATH_STEPS);
    arcs.push({
      key: row.key,
      label: row.label,
      count: row.count,
      family: familyOf(row.key),
      source,
      target,
      path,
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

/**
 * Evenly spaced points on the straight line between two coordinates, ends
 * included. Straight, not a great circle: a curve implied a flight path the
 * data never records, and over the map's extent the difference is only the
 * bend. Sampled so the lane fan has vertices to bend.
 */
export function straightLine(
  from: [number, number],
  to: [number, number],
  steps: number,
): [number, number][] {
  const points: [number, number][] = [];
  for (let step = 0; step <= steps; step += 1) {
    const fraction = step / steps;
    points.push([
      from[0] + (to[0] - from[0]) * fraction,
      from[1] + (to[1] - from[1]) * fraction,
    ]);
  }
  return points;
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
      const lane = index - (cluster.length - 1) / 2;
      lanes.set(member.key, Math.max(-MAX_LANE, Math.min(MAX_LANE, lane)));
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

/** Each stage of the fan (ramp in, hold, fold back) runs this many lane widths. */
export const FAN_STAGE = 8;
/** The fan never occupies more than this share of a route. */
export const FAN_SHARE = 0.25;

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function segmentLength(a: [number, number], b: [number, number]): number {
  const scale = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((b[0] - a[0]) * scale, b[1] - a[1]);
}

/**
 * Push the far end of a route sideways by `offsetDeg`, ramping in, holding,
 * and folding back so the dot still lands on its destination. The stages are
 * measured in lane widths, not as a share of the route, so the fold-back
 * meets the destination at the same gentle angle on a short hop as on a
 * cross-country route and at every zoom. A route too short to fit the fan
 * gets a proportionally smaller offset rather than a hook.
 */
export function fanPath(
  path: [number, number][],
  offsetDeg: number,
  farEndFirst: boolean,
): [number, number][] {
  const last = path.length - 1;
  if (last < 1 || offsetDeg === 0) return path;
  const along = [0];
  for (let index = 1; index <= last; index += 1) {
    along.push(along[index - 1] + segmentLength(path[index - 1], path[index]));
  }
  const total = along[last];
  if (total === 0) return path;
  let amount = offsetDeg;
  let stage = Math.abs(offsetDeg) * FAN_STAGE;
  const room = FAN_SHARE * total;
  if (3 * stage > room) {
    const scale = room / (3 * stage);
    amount *= scale;
    stage *= scale;
  }
  return path.map((point, index) => {
    const toFarEnd = farEndFirst ? along[index] : total - along[index];
    let weight = 0;
    if (toFarEnd <= stage) weight = smoothstep(toFarEnd / stage);
    else if (toFarEnd <= 2 * stage) weight = 1;
    else if (toFarEnd <= 3 * stage)
      weight = smoothstep((3 * stage - toFarEnd) / stage);
    if (weight === 0) return point;
    const before = path[Math.max(index - 1, 0)];
    const after = path[Math.min(index + 1, last)];
    const scale = Math.cos((point[1] * Math.PI) / 180);
    const dx = (after[0] - before[0]) * scale;
    const dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    const shift = amount * weight;
    return [
      point[0] + ((-dy / length) * shift) / scale,
      point[1] + (dx / length) * shift,
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
      progress,
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
    "stays, not people · source: ICE via Deportation Data Project";
  const lines = [quote(stamp), "destination,stays,share_of_total"];
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
