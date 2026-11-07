import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { flowLayers } from "./flowLayers";

interface FlowOverlayModule {
  MapboxOverlay: typeof MapboxOverlay;
  flowLayers: typeof flowLayers;
}

let pending: Promise<FlowOverlayModule> | null = null;

/**
 * deck.gl is roughly 200 KB gzipped — most of it shaders and layer machinery
 * only the flows need. Loading it on the first facility selection keeps the
 * plain circle map off that bill.
 */
export function loadFlowOverlay(): Promise<FlowOverlayModule> {
  pending ??= Promise.all([import("@deck.gl/mapbox"), import("./flowLayers")])
    .then(([mapbox, layers]) => ({
      MapboxOverlay: mapbox.MapboxOverlay,
      flowLayers: layers.flowLayers,
    }))
    .catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}
