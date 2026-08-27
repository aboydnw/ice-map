import { describe, expect, it } from "vitest";
import { buildTrips } from "./flowTrips";
import type { FlowDot } from "./flows";

function dot(start: number, travel: number): FlowDot {
  return {
    key: "a",
    path: [
      [0, 0],
      [10, 0],
      [20, 0],
    ],
    start,
    travel,
    hollow: false,
  };
}

describe("buildTrips", () => {
  it("stamps each vertex with the moment the dot passes it", () => {
    const [trip] = buildTrips([dot(1000, 2000)], 16_000, 500);

    expect(trip.timestamps).toEqual([1000, 2000, 3000]);
    expect(trip.path).toEqual(dot(0, 0).path);
  });

  it("adds a copy one loop earlier only when the dot is still visible at the wrap", () => {
    const early = buildTrips([dot(1000, 2000)], 16_000, 500);
    const late = buildTrips([dot(15_000, 2000)], 16_000, 500);

    expect(early).toHaveLength(1);
    expect(late).toHaveLength(2);
    expect(late[1].timestamps).toEqual([-1000, 0, 1000]);
  });

  it("copies a dot whose trail alone would cross the wrap", () => {
    const trips = buildTrips([dot(13_000, 2000)], 16_000, 1500);

    expect(trips).toHaveLength(2);
  });

  it("skips a dot with no route to travel", () => {
    const stub: FlowDot = { ...dot(0, 1000), path: [[0, 0]] };

    expect(buildTrips([stub], 16_000)).toHaveLength(0);
  });
});
