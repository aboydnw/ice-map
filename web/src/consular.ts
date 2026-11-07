import { CONSULAR_COLORS } from "./config";
import type { ConsularCollection, ConsularDistrictProperties } from "./types";

export const CONSULAR_STORAGE_KEY = "ice-map.consular-country";

/** The country key remembered from a previous visit, if storage is available. */
export function readStoredCountry(): string | null {
  try {
    return localStorage.getItem(CONSULAR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeCountry(key: string | null): void {
  try {
    if (key) localStorage.setItem(CONSULAR_STORAGE_KEY, key);
    else localStorage.removeItem(CONSULAR_STORAGE_KEY);
  } catch {
    // Storage can be disabled or full; the picker still works for this visit.
  }
}

export function districtColor(index: number): string {
  return CONSULAR_COLORS[index % CONSULAR_COLORS.length];
}

/** MapLibre expression mapping a district's color index to its fill tint. */
export function fillColorExpression(): unknown[] {
  const cases = CONSULAR_COLORS.flatMap((color, index) => [index, color]);
  return ["match", ["get", "color"], ...cases, CONSULAR_COLORS[0]];
}

/** "113 counties · TX, NM" — the second line of a district tooltip. */
export function districtSummary(props: ConsularDistrictProperties): string {
  const unit = props.county_count === 1 ? "county" : "counties";
  return `${props.county_count.toLocaleString()} ${unit} · ${props.states.join(", ")}`;
}

/** Year span of the per-district sources, e.g. "2018–2026" or "2024". */
export function sourceYears(collection: ConsularCollection): string {
  const [first, last] = collection.meta.source_dates.map((d) => d.slice(0, 4));
  return first === last ? first : `${first}–${last}`;
}

export const EMPTY_DISTRICTS = {
  type: "FeatureCollection",
  features: [],
} as const;
