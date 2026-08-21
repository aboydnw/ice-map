import { useEffect, useRef, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import * as maplibregl from "maplibre-gl";
import type { MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// Vite (rolldown) does not emit maplibre's default sibling worker module in
// production builds, so point maplibre at a bundled worker chunk explicitly.
maplibregl.setWorkerUrl(maplibreWorkerUrl);
import { BUCKET_COLOR, RADIUS_MAX, RADIUS_MIN, SQRT_ADP_MAX } from "../config";
import type { FacilityCollection } from "../types";

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const US_BOUNDS: [[number, number], [number, number]] = [
  [-126, 23.5],
  [-65.5, 50],
];

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  adp: number;
  color: string;
}

interface Props {
  data: FacilityCollection;
  selected: string | null;
  onSelect: (detloc: string | null) => void;
}

export function FacilityMap({ data, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!document.createElement("canvas").getContext("webgl2")) {
      setMapFailed(true);
      return;
    }
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASEMAP,
        bounds: US_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        minZoom: 2.8,
        attributionControl: { compact: true },
      });
    } catch {
      setMapFailed(true);
      return;
    }
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;

    map.on("load", () => {
      // Test hook: lets Playwright drive the map in dev and preview builds.
      (window as unknown as { __iceMap?: maplibregl.Map }).__iceMap = map;
      map.addSource("facilities", { type: "geojson", data: data as never });
      map.addLayer({
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
            "#898781",
          ],
          "circle-opacity": 0.78,
          "circle-stroke-color": "#fdfcfa",
          "circle-stroke-width": 1.2,
        },
      });
      map.addLayer({
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

      map.on("mousemove", "facility-circles", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        map.getCanvas().style.cursor = "pointer";
        const props = feature.properties as {
          name: string;
          adp: number;
          bucket: string;
        };
        setHover({
          x: event.point.x,
          y: event.point.y,
          name: props.name,
          adp: props.adp,
          color: BUCKET_COLOR[props.bucket] ?? "#898781",
        });
      });
      map.on("mouseleave", "facility-circles", () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
      map.on("click", "facility-circles", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (feature)
          onSelectRef.current(
            (feature.properties as { detloc: string }).detloc,
          );
      });
      map.on("click", (event: MapMouseEvent) => {
        const hits = map.queryRenderedFeatures(event.point, {
          layers: ["facility-circles"],
        });
        if (hits.length === 0) onSelectRef.current(null);
      });
    });

    return () => {
      mapRef.current = null;
      try {
        map.remove();
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
          This map needs WebGL, which your browser doesn't support or has
          disabled. The underlying data is available at
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
            {hover.adp.toLocaleString()} avg. daily population
          </Text>
        </Box>
      )}
    </Box>
  );
}
