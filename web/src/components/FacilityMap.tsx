import { useEffect, useRef, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import * as maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  MapLayerMouseEvent,
  MapMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  BUCKET_COLOR,
  CONSULAR_FILL_OPACITY,
  CONSULAR_OUTLINE,
  RADIUS_MAX,
  RADIUS_MIN,
  SQRT_ADP_MAX,
} from "../config";
import {
  EMPTY_DISTRICTS,
  districtColor,
  districtSummary,
  fillColorExpression,
} from "../consular";
import type {
  Bucket,
  ConsularCollection,
  ConsularDistrictProperties,
  FacilityCollection,
} from "../types";

// Vite (rolldown) does not emit maplibre's default sibling worker module in
// production builds, so point maplibre at a bundled worker chunk explicitly.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const US_BOUNDS: [[number, number], [number, number]] = [
  [-126, 23.5],
  [-65.5, 50],
];

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  detail: string;
  color: string;
  kind: "facility" | "district";
}

interface Props {
  data: FacilityCollection;
  selected: string | null;
  onSelect: (detloc: string | null) => void;
  districts: ConsularCollection | null;
}

export function FacilityMap({ data, selected, onSelect, districts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const districtsRef = useRef(districts);
  districtsRef.current = districts;
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

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

        m.on("load", () => {
          // Test hook: lets Playwright drive the map in dev and preview builds.
          (window as unknown as { __iceMap?: maplibregl.Map }).__iceMap = m;
          m.addSource("consular", {
            type: "geojson",
            data: (districtsRef.current ?? EMPTY_DISTRICTS) as never,
          });
          m.addLayer({
            id: "consular-fill",
            type: "fill",
            source: "consular",
            paint: {
              "fill-color": fillColorExpression() as ExpressionSpecification,
              "fill-opacity": CONSULAR_FILL_OPACITY,
            },
          });
          m.addLayer({
            id: "consular-line",
            type: "line",
            source: "consular",
            paint: {
              "line-color": CONSULAR_OUTLINE,
              "line-width": 1,
              "line-opacity": 0.7,
            },
          });
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
              kind: "facility",
            });
          });
          m.on("mouseleave", "facility-circles", () => {
            m.getCanvas().style.cursor = "";
            setHover(null);
          });
          // Circles win: a district tooltip only shows where no circle is
          // under the pointer, and never replaces a facility tooltip.
          m.on("mousemove", "consular-fill", (event: MapLayerMouseEvent) => {
            const feature = event.features?.[0];
            if (!feature) return;
            const circles = m.queryRenderedFeatures(event.point, {
              layers: ["facility-circles"],
            });
            if (circles.length > 0) return;
            const props = feature.properties as ConsularDistrictProperties;
            setHover({
              x: event.point.x,
              y: event.point.y,
              name: props.name,
              detail: districtSummary({
                ...props,
                states: JSON.parse(String(props.states)) as string[],
              }),
              color: districtColor(props.color),
              kind: "district",
            });
          });
          m.on("mouseleave", "consular-fill", () => {
            setHover((current) =>
              current?.kind === "district" ? null : current,
            );
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

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("consular") as
      maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData((districts ?? EMPTY_DISTRICTS) as never);
    // Test hook: lets a visual check confirm which districts are on the map.
    (window as unknown as { __iceDistricts?: number }).__iceDistricts =
      districts?.features.length ?? 0;
    setHover((current) => (current?.kind === "district" ? null : current));
  }, [districts]);

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
              borderRadius={hover.kind === "facility" ? "full" : "2px"}
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
