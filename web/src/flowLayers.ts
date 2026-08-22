import { ArcLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import type { Layer } from "@deck.gl/core";
import { flowRgb } from "./config";
import { TRAVEL_MS, alphaFor } from "./flowScene";
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
    new ArcLayer<FlowArc>({
      id: "flow-arcs",
      data: scene.arcs,
      greatCircle: true,
      getSourcePosition: (arc) => arc.source,
      getTargetPosition: (arc) => arc.target,
      getSourceColor: (arc) => [
        ...flowRgb(arc.family),
        alphaFor(arc.key, highlighted, 80),
      ],
      getTargetColor: (arc) => [
        ...flowRgb(arc.family),
        alphaFor(arc.key, highlighted, arc.gate ? 0 : 145),
      ],
      getWidth: (arc) => (arc.key === highlighted ? 2.4 : 1.1),
      widthUnits: "pixels",
      updateTriggers: {
        getSourceColor: highlighted,
        getTargetColor: highlighted,
        getWidth: highlighted,
      },
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
          alphaFor(trip.key, highlighted, trip.hollow ? 110 : 235),
        ],
        getWidth: (trip) => (trip.hollow ? 1.3 : 2.4),
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        fadeTrail: true,
        trailLength: TRAVEL_MS * 0.3,
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
