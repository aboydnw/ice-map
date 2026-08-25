import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import { FLOW_CHANNEL, flowRgb, hexRgb } from "./config";
import { LOOP_MS, alphaFor } from "./flowScene";
import type { FlowScene, Marker, ProcessingSite } from "./flowScene";
import { placeDots } from "./flows";
import type { FlowArc, PlacedDot } from "./flows";

export interface FlowFrame {
  /** Null when no facility is selected; processing sites can still be shown. */
  scene: FlowScene | null;
  processing: ProcessingSite[];
  highlighted: string | null;
  currentTime: number;
  selectedSite: string | null;
  onHoverSite: (site: ProcessingSite | null, x: number, y: number) => void;
  onHoverMarker: (marker: Marker | null, x: number, y: number) => void;
  /** Selects a processing-site code or a `country:` id. */
  onSelectSite: (id: string) => void;
}

/**
 * Fresh layer instances for one frame. They share the scene's data arrays, so
 * deck.gl re-uploads attributes only when the highlight or the scene changes.
 */
export function flowLayers(frame: FlowFrame): Layer[] {
  const { scene, highlighted, currentTime } = frame;
  const layers: Layer[] = [];

  if (frame.processing.length > 0) {
    layers.push(
      new ScatterplotLayer<ProcessingSite>({
        id: "flow-processing",
        data: frame.processing,
        getPosition: (site) => site.position,
        // A fixed radius, deliberately: these places report no population, so
        // sizing them would invent a number the data does not have.
        getRadius: (site) => (site.code === frame.selectedSite ? 7 : 5),
        radiusUnits: "pixels",
        filled: true,
        // Countries are filled grey so they never pass for a hold room.
        getFillColor: (site) =>
          site.kind === "country" ? [138, 133, 125, 225] : [253, 252, 250, 225],
        stroked: true,
        getLineColor: (site) =>
          site.code === frame.selectedSite
            ? [26, 24, 23, 255]
            : [90, 86, 80, 220],
        lineWidthUnits: "pixels",
        getLineWidth: (site) => (site.code === frame.selectedSite ? 2.4 : 1.5),
        pickable: true,
        onHover: (info) =>
          frame.onHoverSite(
            (info.object as ProcessingSite) ?? null,
            info.x,
            info.y,
          ),
        onClick: (info) => {
          const site = info.object as ProcessingSite | undefined;
          if (site) frame.onSelectSite(site.code);
          return Boolean(site);
        },
        updateTriggers: {
          getRadius: frame.selectedSite,
          getLineColor: frame.selectedSite,
          getLineWidth: frame.selectedSite,
        },
      }),
    );
  }

  if (!scene) return layers;

  const family = new Map(scene.arcs.map((arc) => [arc.key, arc.family]));
  layers.push(
    // The channel is permanent: it says a route exists whether or not a dot
    // happens to be passing. Small facilities move a handful of people a year,
    // so without it their connections would be invisible most of the time.
    new PathLayer<FlowArc>({
      id: "flow-channels",
      data: scene.arcs,
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
  );

  if (scene.dots.length > 0) {
    // Round dots at a fixed pixel radius. TripsLayer was drawing trails whose
    // on-screen length scaled with the route, so a long route smeared into a
    // streak; a dot is the same countable mark everywhere.
    const placed = placeDots(scene.dots, currentTime, LOOP_MS);
    layers.push(
      new ScatterplotLayer<PlacedDot>({
        id: "flow-dots",
        data: placed,
        getPosition: (dot) => dot.position,
        getRadius: (dot) => (dot.hollow ? 2.4 : 3.2),
        radiusUnits: "pixels",
        filled: true,
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 1.2,
        // A sub-quantum dot is drawn as an outline so it is never mistaken for
        // a full unit.
        getFillColor: (dot) => [
          ...flowRgb(family.get(dot.key) ?? "other"),
          dot.hollow ? 0 : alphaFor(dot.key, highlighted, 255),
        ],
        getLineColor: (dot) => [
          ...flowRgb(family.get(dot.key) ?? "other"),
          alphaFor(dot.key, highlighted, dot.hollow ? 220 : 255),
        ],
        updateTriggers: {
          getFillColor: highlighted,
          getLineColor: highlighted,
        },
      }),
    );
  }

  const endpoints = scene.markers.filter(
    (marker) => marker.kind === "endpoint",
  );
  if (endpoints.length > 0) {
    layers.push(
      new ScatterplotLayer<Marker>({
        id: "flow-endpoint-dots",
        data: endpoints,
        getPosition: (marker) => marker.position,
        getRadius: 6,
        radiusUnits: "pixels",
        // A ring, not a disc: these places have no reported population, so
        // they must not read as a sized facility circle.
        filled: true,
        getFillColor: [253, 252, 250, 210],
        stroked: true,
        getLineColor: [90, 86, 80, 230],
        lineWidthUnits: "pixels",
        getLineWidth: 1.6,
        pickable: true,
        onHover: (info) =>
          frame.onHoverMarker((info.object as Marker) ?? null, info.x, info.y),
        onClick: (info) => {
          const marker = info.object as Marker | undefined;
          if (marker?.select) frame.onSelectSite(marker.select);
          return Boolean(marker?.select);
        },
      }),
    );
  }

  if (scene.markers.length > 0) {
    layers.push(
      new TextLayer<Marker>({
        id: "flow-endpoint-labels",
        data: scene.markers,
        getPosition: (marker) => marker.position,
        getText: (marker) => marker.label,
        getSize: 11,
        sizeUnits: "pixels",
        getColor: [26, 24, 23, 225],
        getPixelOffset: (marker) => [0, -12 - marker.lane * 13],
        outlineWidth: 3,
        outlineColor: [253, 252, 250, 255],
        fontSettings: { sdf: true },
        characterSet: "auto",
        maxWidth: 160,
        pickable: true,
        onHover: (info) =>
          frame.onHoverMarker((info.object as Marker) ?? null, info.x, info.y),
        onClick: (info) => {
          const marker = info.object as Marker | undefined;
          if (marker?.select) frame.onSelectSite(marker.select);
          return Boolean(marker?.select);
        },
      }),
    );
  }

  return layers;
}
