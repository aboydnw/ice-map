import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import type { Layer } from "@deck.gl/core";
import { FLOW_CHANNEL, flowRgb, hexRgb } from "./config";
import { DASH_MS, TRAVEL_MS, alphaFor } from "./flowScene";
import type { FlowScene, Marker } from "./flowScene";
import type { FlowArc, FlowTrip } from "./flows";

/**
 * Fresh layer instances for one frame. They share the scene's data arrays, so
 * deck.gl re-uploads attributes only when the highlight or the scene changes.
 */
export function flowLayers(
  scene: FlowScene,
  highlighted: string | null,
  currentTime: number,
): Layer[] {
  const family = new Map(scene.arcs.map((arc) => [arc.key, arc.family]));
  const layers: Layer[] = [
    // The channel is permanent: it says a route exists whether or not a dot
    // happens to be passing. Small facilities move a handful of people a year,
    // so without it their connections would be invisible most of the time.
    new PathLayer<FlowArc>({
      id: "flow-channels",
      data: scene.channels,
      getPath: (arc) => arc.path,
      getColor: (arc) =>
        arc.key === highlighted
          ? [...flowRgb(arc.family), 120]
          : [...hexRgb(FLOW_CHANNEL), alphaFor(arc.key, highlighted, 120)],
      getWidth: (arc) => (arc.key === highlighted ? 7 : 5),
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getColor: highlighted, getWidth: highlighted },
    }),
  ];

  if (scene.trips.length > 0) {
    layers.push(
      new TripsLayer<FlowTrip>({
        id: "flow-trips",
        data: scene.trips,
        getPath: (trip) => trip.path,
        getTimestamps: (trip) => trip.timestamps,
        getColor: (trip) => [
          ...flowRgb(family.get(trip.key) ?? "other"),
          alphaFor(trip.key, highlighted, trip.hollow ? 130 : 255),
        ],
        getWidth: (trip) => (trip.hollow ? 2 : 3.4),
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        // A crisp dash rather than a comet tail: these are countable units,
        // and a fading smear reads as continuous flow.
        fadeTrail: false,
        trailLength: DASH_MS,
        currentTime,
        updateTriggers: { getColor: highlighted },
      }),
    );
  }

  if (scene.gateTrips.length > 0) {
    layers.push(
      new TripsLayer<FlowTrip>({
        id: "flow-gate-trips",
        data: scene.gateTrips,
        getPath: (trip) => trip.path,
        getTimestamps: (trip) => trip.timestamps,
        getColor: (trip) => [
          ...flowRgb(family.get(trip.key) ?? "other"),
          alphaFor(trip.key, highlighted, trip.hollow ? 130 : 235),
        ],
        getWidth: (trip) => (trip.hollow ? 2 : 3.4),
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        // These leave the gate and fade: ICE records no destination, and the
        // trail dying out is the honest way to draw not knowing.
        fadeTrail: true,
        trailLength: TRAVEL_MS * 0.45,
        currentTime,
        updateTriggers: { getColor: highlighted },
      }),
    );
  }

  if (scene.markers.length > 0) {
    layers.push(
      new ScatterplotLayer<Marker>({
        id: "flow-endpoint-dots",
        data: scene.markers,
        getPosition: (marker) => marker.position,
        getRadius: 3.5,
        radiusUnits: "pixels",
        getFillColor: [26, 24, 23, 190],
        stroked: true,
        getLineColor: [253, 252, 250, 230],
        lineWidthUnits: "pixels",
        getLineWidth: 1,
      }),
      new TextLayer<Marker>({
        id: "flow-endpoint-labels",
        data: scene.markers,
        getPosition: (marker) => marker.position,
        getText: (marker) => marker.label,
        getSize: 11,
        sizeUnits: "pixels",
        getColor: [26, 24, 23, 225],
        getPixelOffset: [0, -12],
        outlineWidth: 3,
        outlineColor: [253, 252, 250, 255],
        fontSettings: { sdf: true },
        characterSet: "auto",
        maxWidth: 160,
      }),
    );
  }

  return layers;
}
