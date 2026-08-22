import { buildArcs, buildTrips, monthAxis } from "./flows";
import type { BoardRow, FlowArc, FlowTrip } from "./flows";
import type { FacilityFlows, FlowDirection } from "./types";

/** One pass of the animation covers the whole data window. */
export const LOOP_MS = 16_000;
export const TRAVEL_MS = 3_200;
export const CYCLE_MS = LOOP_MS + TRAVEL_MS;

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
