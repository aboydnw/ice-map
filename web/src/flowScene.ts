import { buildArcs, buildDots, quantumFor } from "./flows";
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
  code: string;
  name: string;
  position: [number, number];
  stints: number;
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
    }))
    .sort((a, b) => b.stints - a.stints);
}

export interface Marker {
  position: [number, number];
  label: string;
  /**
   * An endpoint is a place and gets a ring. An exit is where a route crosses
   * the border: it is labelled so the destination can be read without zooming
   * out, but never marked, because nothing says anyone departed from there.
   */
  kind: "endpoint" | "exit";
  /** Stacks labels of routes leaving through the same stretch of border. */
  lane: number;
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
  /** Stints per dot for this selection. */
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
    rings: options.rings,
    laneWidthDeg: options.laneWidthDeg,
  });
  const quantum = quantumFor(rows.map((row) => row.count));
  const dots = options.animate ? buildDots(arcs, LOOP_MS, quantum) : [];

  const seen = new Set<string>();
  const markers: Marker[] = [];
  rows.forEach((row) => {
    if (row.kind !== "facility" || !row.lonLat) return;
    const code = row.key.slice("transfer:".length);
    if (options.mappedCodes.has(code) || seen.has(code)) return;
    seen.add(code);
    markers.push({
      position: row.lonLat,
      label: row.label,
      kind: "endpoint",
      lane: 0,
    });
  });
  const arrow = direction === "out" ? "→" : "←";
  arcs
    .filter((arc) => arc.exit)
    .forEach((arc, index) => {
      markers.push({
        position: arc.exit as [number, number],
        label: `${arrow} ${arc.label} · ${arc.count.toLocaleString()}`,
        kind: "exit",
        lane: index,
      });
    });

  return {
    arcs,
    dots,
    markers,
    quantum,
  };
}
