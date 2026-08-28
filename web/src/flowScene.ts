import {
  COUNTRY_PREFIX,
  buildArcs,
  buildDots,
  quantumFor,
  selectionFor,
} from "./flows";
import type { BoardRow, FlowArc, FlowDot, RouteOptions } from "./flows";
import type { FacilityFlows, FlowDirection, FlowEndpoints } from "./types";

/**
 * The animation clock wraps here. Every route emits its dots evenly across
 * one loop, so the stream is continuous — a dot's timing says nothing about
 * when the move happened, only how many there were.
 */
export const LOOP_MS = 16_000;

const DIMMED = 0.16;
const HIGHLIGHTED = 1.7;

/** Highlight and dim scale the base alpha rather than replacing it. */
/** Share of a route over which a dot appears after departing. */
export const DOT_FADE_IN = 0.06;
/** Share of a route over which a dot is absorbed into its destination. */
export const DOT_FADE_OUT = 0.14;

/**
 * How fully a dot is drawn at `progress` along its route: it comes into being
 * over the first stretch and sinks into the far end over the last, monotonic
 * in both directions so nothing pops, bounces, or flares on arrival.
 */
export function dotPresence(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  const ease = (t: number) => t * t * (3 - 2 * t);
  if (progress < DOT_FADE_IN) return ease(progress / DOT_FADE_IN);
  if (progress > 1 - DOT_FADE_OUT) return ease((1 - progress) / DOT_FADE_OUT);
  return 1;
}

export function alphaFor(
  key: string,
  highlighted: string | null,
  base: number,
): number {
  if (!highlighted) return base;
  const scale = key === highlighted ? HIGHLIGHTED : DIMMED;
  return Math.min(255, Math.round(base * scale));
}

/** A hold room, field office, or staging site the map has no circle for. */
export interface ProcessingSite {
  /** A facility code, or a `country:` id. */
  code: string;
  name: string;
  position: [number, number];
  stints: number;
  kind: "processing" | "country";
}

/**
 * Processing sites worth drawing: those the map does not already show as a
 * facility circle. Alexandria and Florence Staging are both, so without the
 * mapped-code check they would get a ring on top of their own circle.
 */
export function processingSites(
  endpoints: FlowEndpoints,
  mappedCodes: Set<string>,
): ProcessingSite[] {
  return Object.entries(endpoints.facilities)
    .filter(
      ([code, entry]) => entry.kind === "processing" && !mappedCodes.has(code),
    )
    .map(([code, entry]) => ({
      code,
      name: entry.name,
      position: [entry.lon, entry.lat] as [number, number],
      stints: entry.stints ?? 0,
      kind: "processing" as const,
    }))
    .sort((a, b) => b.stints - a.stints);
}

/**
 * Every country with a board, so any destination can be clicked without first
 * finding a facility that sends people there.
 */
export function countrySites(endpoints: FlowEndpoints): ProcessingSite[] {
  return Object.entries(endpoints.countries ?? {})
    .map(([key, entry]) => ({
      code: `${COUNTRY_PREFIX}${key}`,
      name: entry.name,
      position: [entry.lon, entry.lat] as [number, number],
      stints: entry.stints ?? 0,
      kind: "country" as const,
    }))
    .sort((a, b) => b.stints - a.stints);
}

/**
 * A ring at the far end of a route that has no circle of its own — a hold
 * room, staging site, or country — so a route never ends at nothing. Rings
 * carry no text; the name and count come up on hover and in the board.
 */
export interface Marker {
  position: [number, number];
  label: string;
  /** What clicking selects — a country id or a facility code — if anything. */
  select: string | null;
  /** Hover text. */
  detail: string;
}

/**
 * The geometry for one facility's flows. Built once per selection (and per
 * zoom, for the lane width) so the animation frame only has to swap a
 * timestamp, never rebuild attributes.
 */
export interface FlowScene {
  /**
   * One route per row with a recorded place, drawn as a permanent channel. A
   * release has no recorded destination, so it has no route: the absence is
   * the point.
   */
  arcs: FlowArc[];
  /** Every dot, with its departure time; the renderer places them per frame. */
  dots: FlowDot[];
  markers: Marker[];
  /** Stays per dot for this selection. */
  quantum: number;
}

export interface SceneOptions extends RouteOptions {
  flows: FacilityFlows;
  direction: FlowDirection;
  rows: BoardRow[];
  facility: [number, number];
  /** Facility codes drawn as circles; other endpoints need their own marker. */
  mappedCodes: Set<string>;
  animate: boolean;
}

export function buildFlowScene(options: SceneOptions): FlowScene {
  const { direction, rows, facility } = options;
  const arcs = buildArcs(rows, facility, direction, {
    laneWidthDeg: options.laneWidthDeg,
  });
  const quantum = quantumFor(rows.map((row) => row.count));
  const dots = options.animate ? buildDots(arcs, LOOP_MS, quantum) : [];

  const seen = new Set<string>();
  const markers: Marker[] = [];
  const verb = direction === "out" ? "sent here" : "came from here";
  rows.forEach((row) => {
    if (!row.lonLat || row.kind !== "facility") return;
    const select = selectionFor(row, options.mappedCodes);
    if (select === null || seen.has(select)) return;
    seen.add(select);
    markers.push({
      position: row.lonLat,
      label: row.label,
      select,
      detail: `${row.count.toLocaleString()} stays ${verb} · click for its own flows`,
    });
  });

  return {
    arcs,
    dots,
    markers,
    quantum,
  };
}
