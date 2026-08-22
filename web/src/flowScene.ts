import { buildArcs, buildTrips, monthAxis } from "./flows";
import type { BoardRow, FlowArc, FlowTrip } from "./flows";
import type { FacilityFlows, FlowDirection } from "./types";

/** One pass of the animation covers the whole data window. */
export const LOOP_MS = 16_000;
export const TRAVEL_MS = 3_200;
export const CYCLE_MS = LOOP_MS + TRAVEL_MS;

const DIMMED = 0.16;
const HIGHLIGHTED = 1.7;

/**
 * Highlight and dim scale the base alpha rather than replacing it: a gate stub
 * fades to nothing at its far end, and must keep doing so when highlighted —
 * a solid line to a synthetic point would be exactly the fabricated geography
 * the rest of the design refuses.
 */
export function alphaFor(
  key: string,
  highlighted: string | null,
  base: number,
): number {
  if (!highlighted) return base;
  const scale = key === highlighted ? HIGHLIGHTED : DIMMED;
  return Math.min(255, Math.round(base * scale));
}

export interface Marker {
  position: [number, number];
  label: string;
}

/**
 * The geometry for one facility's flows. Built once per selection so the
 * animation frame only has to swap a timestamp, never rebuild attributes.
 */
export interface FlowScene {
  arcs: FlowArc[];
  trips: FlowTrip[];
  markers: Marker[];
}

export interface SceneOptions {
  flows: FacilityFlows;
  direction: FlowDirection;
  rows: BoardRow[];
  facility: [number, number];
  /** Facility codes drawn as circles; other endpoints need their own marker. */
  mappedCodes: Set<string>;
  animate: boolean;
}

export function buildFlowScene(options: SceneOptions): FlowScene {
  const { flows, direction, rows, facility } = options;
  const arcs = buildArcs(rows, facility, direction);
  const trips = options.animate
    ? buildTrips(
        arcs,
        flows[direction],
        monthAxis(flows.window),
        LOOP_MS,
        TRAVEL_MS,
      )
    : [];

  const seen = new Set<string>();
  const markers: Marker[] = [];
  rows.forEach((row) => {
    if (row.kind !== "facility" || !row.lonLat) return;
    const code = row.key.slice("transfer:".length);
    if (options.mappedCodes.has(code) || seen.has(code)) return;
    seen.add(code);
    markers.push({ position: row.lonLat, label: row.label });
  });

  return { arcs, trips, markers };
}
