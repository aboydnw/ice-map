import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import * as maplibregl from "maplibre-gl";
import type {
  MapLayerMouseEvent,
  MapMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import { BUCKET_COLOR, RADIUS_MAX, RADIUS_MIN, SQRT_ADP_MAX } from "../config";
import { loadFlowOverlay } from "../flowOverlay";
import { LOOP_MS, buildFlowScene, processingSites } from "../flowScene";
import type { Marker, ProcessingSite } from "../flowScene";
import { countryKey, isCountry } from "../flows";
import type { BoardRow } from "../flows";
import { US_RINGS } from "../usOutline";
import type {
  Bucket,
  FacilityCollection,
  FlowDirection,
  FlowEndpoints,
} from "../types";
import type { FlowData } from "../useFlows";

// Vite (rolldown) does not emit maplibre's default sibling worker module in
// production builds, so point maplibre at a bundled worker chunk explicitly.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const US_BOUNDS: [[number, number], [number, number]] = [
  [-126, 23.5],
  [-65.5, 50],
];
/** Spacing between fanned lanes on screen. */
const LANE_PX = 7;
/** Web Mercator, 512px tiles: degrees of longitude per pixel at a zoom. */
function degreesPerPixel(zoom: number): number {
  return 360 / (512 * 2 ** zoom);
}

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  detail: string;
  color: string;
}

interface Props {
  data: FacilityCollection;
  selected: string | null;
  onSelect: (detloc: string | null) => void;
  flows: FlowData | null;
  flowRows: BoardRow[];
  direction: FlowDirection;
  highlightedKey: string | null;
  endpoints: FlowEndpoints | null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function FacilityMap({
  data,
  selected,
  onSelect,
  flows,
  flowRows,
  direction,
  highlightedKey,
  endpoints,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const animatedKeyRef = useRef<string | null>(null);
  const fittedRef = useRef<string | null>(null);
  const clockStartRef = useRef(0);
  const [zoom, setZoom] = useState(3);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  const mappedCodes = useMemo(
    () => new Set(data.features.map((feature) => feature.properties.detloc)),
    [data],
  );
  const facilityLonLat = useMemo(() => {
    const feature = data.features.find(
      (candidate) => candidate.properties.detloc === selected,
    );
    if (feature) return feature.geometry.coordinates;
    if (selected && isCountry(selected)) {
      const country = flows?.countries[countryKey(selected)];
      return country ? ([country.lon, country.lat] as [number, number]) : null;
    }
    const site = selected ? endpoints?.facilities[selected] : undefined;
    return site ? ([site.lon, site.lat] as [number, number]) : null;
  }, [data, selected, endpoints, flows]);
  const originLabel =
    selected && isCountry(selected)
      ? flows?.countries[countryKey(selected)]?.name
      : undefined;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.createElement("canvas").getContext("webgl2")) {
      setMapFailed(true);
      return;
    }

    let map: maplibregl.Map | null = null;
    let cancelled = false;

    // Fetching the style ourselves makes a basemap outage a deterministic
    // failure state instead of a silently blank map.
    fetch(BASEMAP)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((style: StyleSpecification) => {
        if (cancelled) return;
        const m = new maplibregl.Map({
          container,
          style,
          bounds: US_BOUNDS,
          fitBoundsOptions: { padding: 24 },
          minZoom: 2.8,
          attributionControl: { compact: true },
        });
        map = m;
        mapRef.current = m;
        m.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right",
        );
        setZoom(m.getZoom());
        m.on("zoomend", () => setZoom(m.getZoom()));

        m.on("load", () => {
          // Test hook: lets Playwright drive the map in dev and preview builds.
          (window as unknown as { __iceMap?: maplibregl.Map }).__iceMap = m;
          m.addSource("facilities", { type: "geojson", data: data as never });
          m.addLayer({
            id: "facility-circles",
            type: "circle",
            source: "facilities",
            layout: {
              "circle-sort-key": ["*", -1, ["get", "adp"]],
            },
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["sqrt", ["get", "adp"]],
                0,
                RADIUS_MIN,
                SQRT_ADP_MAX,
                RADIUS_MAX,
              ],
              "circle-color": [
                "match",
                ["get", "bucket"],
                "dedicated",
                BUCKET_COLOR.dedicated,
                "county_jail",
                BUCKET_COLOR.county_jail,
                "usms",
                BUCKET_COLOR.usms,
                "federal_prison",
                BUCKET_COLOR.federal_prison,
                BUCKET_COLOR.other,
              ],
              "circle-opacity": 0.78,
              "circle-stroke-color": "#fdfcfa",
              "circle-stroke-width": 1.2,
            },
          });
          m.addLayer({
            id: "facility-selected",
            type: "circle",
            source: "facilities",
            filter: ["==", ["get", "detloc"], ""],
            paint: {
              "circle-radius": [
                "+",
                2,
                [
                  "interpolate",
                  ["linear"],
                  ["sqrt", ["get", "adp"]],
                  0,
                  RADIUS_MIN,
                  SQRT_ADP_MAX,
                  RADIUS_MAX,
                ],
              ],
              "circle-color": "rgba(0,0,0,0)",
              "circle-stroke-color": "#1a1817",
              "circle-stroke-width": 2,
            },
          });

          m.on("mousemove", "facility-circles", (event: MapLayerMouseEvent) => {
            const feature = event.features?.[0];
            if (!feature) return;
            m.getCanvas().style.cursor = "pointer";
            const props = feature.properties as {
              name: string;
              adp: number;
              bucket: Bucket;
            };
            setHover({
              x: event.point.x,
              y: event.point.y,
              name: props.name,
              detail: `${props.adp.toLocaleString()} avg. daily population`,
              color: BUCKET_COLOR[props.bucket] ?? BUCKET_COLOR.other,
            });
          });
          m.on("mouseleave", "facility-circles", () => {
            m.getCanvas().style.cursor = "";
            setHover(null);
          });
          m.on("click", "facility-circles", (event: MapLayerMouseEvent) => {
            const feature = event.features?.[0];
            if (feature)
              onSelectRef.current(
                (feature.properties as { detloc: string }).detloc,
              );
          });
          m.on("click", (event: MapMouseEvent) => {
            const hits = m.queryRenderedFeatures(event.point, {
              layers: ["facility-circles"],
            });
            if (hits.length === 0) onSelectRef.current(null);
          });
        });
      })
      .catch(() => {
        if (!cancelled) setMapFailed(true);
      });

    return () => {
      cancelled = true;
      mapRef.current = null;
      overlayRef.current = null;
      try {
        map?.remove();
      } catch {
        // A map that failed to initialize (e.g. no WebGL) can throw on removal.
      }
    };
    // The map is created once; `data` is static for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("facility-selected")) return;
    map.setFilter("facility-selected", [
      "==",
      ["get", "detloc"],
      selected ?? "",
    ]);
  }, [selected]);

  const processing = useMemo(
    () => (endpoints ? processingSites(endpoints, mappedCodes) : []),
    [endpoints, mappedCodes],
  );

  const handleSiteHover = useCallback(
    (site: ProcessingSite | null, x: number, y: number) => {
      setHover(
        site
          ? {
              x,
              y,
              name: site.name,
              detail: `${site.stints.toLocaleString()} stints passed through · no population reported`,
              color: "#5a5650",
            }
          : null,
      );
    },
    [],
  );

  const handleMarkerHover = useCallback(
    (marker: Marker | null, x: number, y: number) => {
      setHover(
        marker
          ? {
              x,
              y,
              name: marker.label,
              detail: marker.detail,
              color: "#5a5650",
            }
          : null,
      );
    },
    [],
  );

  const scene = useMemo(() => {
    if (!flows || !facilityLonLat || flowRows.length === 0) return null;
    return buildFlowScene({
      flows: flows.flows,
      direction,
      rows: flowRows,
      facility: facilityLonLat,
      mappedCodes,
      animate: !prefersReducedMotion(),
      rings: US_RINGS,
      laneWidthDeg: LANE_PX * degreesPerPixel(zoom),
      originLabel,
    });
  }, [
    flows,
    facilityLonLat,
    flowRows,
    direction,
    mappedCodes,
    zoom,
    originLabel,
  ]);

  // A country's centroid is usually off-screen when it is clicked, so bring
  // it and its origins into view once per selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !scene || !selected || !isCountry(selected)) return;
    if (fittedRef.current === selected) return;
    fittedRef.current = selected;
    const points = scene.arcs.flatMap((arc) => [arc.source, arc.target]);
    const lons = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 6, duration: 900 },
    );
  }, [scene, selected]);

  useEffect(() => {
    const wanted = Boolean(scene) || processing.length > 0;
    if (!wanted) {
      overlayRef.current?.setProps({ layers: [] });
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    let frame = 0;
    loadFlowOverlay()
      .then(({ MapboxOverlay, flowLayers }) => {
        if (cancelled) return;
        if (!overlayRef.current) {
          // Overlaid, not interleaved: deck.gl's interleaved path routes every
          // layer through resolveLayerGroups, which returns silently unless
          // maplibre's private style._loaded is set — a failure that draws
          // nothing and reports nothing. Its own canvas needs no such privates,
          // and flows belong above the circles anyway.
          overlayRef.current = new MapboxOverlay({
            interleaved: false,
            layers: [],
          });
          // top-left so deck's absolutely-positioned container lines up with
          // the map origin rather than a right-anchored control corner.
          map.addControl(overlayRef.current, "top-left");
        }
        const overlay = overlayRef.current;
        // Test hook, alongside __iceMap: lets a visual check confirm what the
        // overlay was actually handed without reading pixels.
        (
          window as unknown as { __iceFlows?: Record<string, number> }
        ).__iceFlows = {
          channels: scene?.arcs.length ?? 0,
          dots: scene?.dots.length ?? 0,
          markers: scene?.markers.length ?? 0,
          processing: processing.length,
        };
        const paint = (currentTime: number) =>
          overlay.setProps({
            layers: flowLayers({
              scene,
              processing,
              highlighted: highlightedKey,
              currentTime,
              selectedSite: selected,
              onHoverSite: handleSiteHover,
              onHoverMarker: handleMarkerHover,
              onSelectSite: (code: string) => onSelectRef.current(code),
            }),
          });
        if (!scene || scene.dots.length === 0) {
          paint(0);
          return;
        }
        // Highlighting and zooming both rebuild the scene; keying the clock on
        // the selection means neither rewinds the animation.
        const animatedKey = `${selected ?? ""}|${direction}`;
        if (animatedKeyRef.current !== animatedKey) {
          animatedKeyRef.current = animatedKey;
          clockStartRef.current = performance.now();
        }
        // Runs only while a facility is selected, and is torn down on
        // deselect, on unmount, and whenever the scene changes.
        const tick = () => {
          paint((performance.now() - clockStartRef.current) % LOOP_MS);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch((error) => {
        // Data absence is silent by design; a broken renderer is not.
        console.error("Facility flows failed to render", error);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    scene,
    highlightedKey,
    processing,
    handleSiteHover,
    handleMarkerHover,
    selected,
    direction,
  ]);

  if (mapFailed) {
    return (
      <Box
        display="flex"
        height="100%"
        alignItems="center"
        justifyContent="center"
        p="6"
      >
        <Text color="inkSecondary" maxW="420px" textAlign="center">
          The map couldn't load — your browser may not support WebGL, or the
          basemap service is unreachable. The underlying data is available at
          github.com/aboydnw/ice-map.
        </Text>
      </Box>
    );
  }

  return (
    <Box position="relative" width="100%" height="100%">
      <Box ref={containerRef} width="100%" height="100%" />
      {hover && (
        <Box
          position="absolute"
          left={`${hover.x + 14}px`}
          top={`${hover.y + 14}px`}
          bg="panel"
          borderWidth="1px"
          borderColor="hairline"
          borderRadius="4px"
          boxShadow="0 2px 10px rgba(26,24,23,0.12)"
          px="3"
          py="2"
          pointerEvents="none"
          maxW="260px"
          zIndex={5}
        >
          <Box display="flex" alignItems="baseline" gap="2">
            <Box
              as="span"
              width="9px"
              height="9px"
              borderRadius="full"
              bg={hover.color}
              flexShrink={0}
              transform="translateY(-1px)"
            />
            <Text fontSize="sm" fontWeight="600" lineHeight="short">
              {hover.name}
            </Text>
          </Box>
          <Text fontSize="xs" color="inkSecondary" mt="1">
            {hover.detail}
          </Text>
        </Box>
      )}
    </Box>
  );
}
