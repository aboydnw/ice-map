import type { FlowDot } from "./flows";

/** How long a moving mark trails behind its head, in ms of travel. */
export const TRAIL_MS = 1_200;

/**
 * One dot expressed as a timed path for deck.gl's TripsLayer: the same
 * vertices as its route, each stamped with the moment the dot passes it.
 */
export interface FlowTrip {
  key: string;
  path: [number, number][];
  timestamps: number[];
  hollow: boolean;
}

/**
 * Turn scheduled dots into trips the GPU can place from `currentTime` alone.
 * The animation clock wraps every `loop` ms, and TripsLayer does not, so a
 * dot still in flight (or still trailing) when the clock wraps gets a second
 * copy shifted one loop earlier. Between them the two cover every instant.
 */
export function buildTrips(
  dots: FlowDot[],
  loop: number,
  trail = TRAIL_MS,
): FlowTrip[] {
  const trips: FlowTrip[] = [];
  for (const dot of dots) {
    const steps = dot.path.length - 1;
    if (steps < 1) continue;
    const timestamps = dot.path.map(
      (_, index) => dot.start + (index / steps) * dot.travel,
    );
    trips.push({
      key: dot.key,
      path: dot.path,
      timestamps,
      hollow: dot.hollow,
    });
    if (dot.start + dot.travel + trail > loop) {
      trips.push({
        key: dot.key,
        path: dot.path,
        timestamps: timestamps.map((time) => time - loop),
        hollow: dot.hollow,
      });
    }
  }
  return trips;
}
