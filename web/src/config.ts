import type { Bucket } from "./types";

/** Colors validated with the dataviz palette checker (all-pairs, light surface #f7f5f2). */
export const BUCKETS: {
  key: Bucket;
  label: string;
  color: string;
  blurb: string;
}[] = [
  {
    key: "dedicated",
    label: "Dedicated ICE facility",
    color: "#2a78d6",
    blurb:
      "Facilities run for ICE, mostly by private operators (SPC, CDF, DIGSA, family, staging).",
  },
  {
    key: "county_jail",
    label: "County & local jail",
    color: "#d95926",
    blurb:
      "Local jails holding ICE detainees under intergovernmental agreements (IGSA).",
  },
  {
    key: "usms",
    label: "US Marshals facility",
    color: "#199e70",
    blurb: "Facilities ICE uses through US Marshals Service agreements.",
  },
  {
    key: "federal_prison",
    label: "Federal prison",
    color: "#4a3aa7",
    blurb: "Federal Bureau of Prisons institutions holding ICE detainees.",
  },
  {
    key: "other",
    label: "Other",
    color: "#898781",
    blurb: "Facility types not covered by the groups above.",
  },
];

export const BUCKET_COLOR = Object.fromEntries(
  BUCKETS.map((b) => [b.key, b.color]),
) as Record<Bucket, string>;

/** Circle area encodes population: radius is linear in sqrt(ADP). */
export const RADIUS_MIN = 3;
export const RADIUS_MAX = 38;
export const SQRT_ADP_MAX = 55;

export function radiusFor(adp: number): number {
  const r =
    RADIUS_MIN +
    (RADIUS_MAX - RADIUS_MIN) * (Math.sqrt(Math.max(adp, 0)) / SQRT_ADP_MAX);
  return Math.min(r, RADIUS_MAX);
}

export const STALE_AFTER_DAYS = 45;

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatMonthYear(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

/** One-hue sequential ramp for the threat-level bar (none → level 1). */
export const THREAT_COLORS = {
  none: "#cde2fb",
  level_3: "#86b6ef",
  level_2: "#3987e5",
  level_1: "#1c5cab",
};

/** Flow families read as one restrained set, distinct from the circle buckets. */
export const FLOW_COLORS: Record<string, string> = {
  transfer: "#4a3aa7",
  removed: "#b03a2e",
  arrested: "#1c7a5e",
  released: "#b07d10",
  other: "#6b6862",
};

/**
 * Channels are a neutral route, not a data value: colour belongs to the dots
 * travelling them, so a facility with mixed destinations does not turn into a
 * tangle of competing hues.
 */
export const FLOW_CHANNEL = "#b8b1a4";

export function hexRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) =>
    parseInt(hex.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

export function flowRgb(family: string): [number, number, number] {
  return hexRgb(FLOW_COLORS[family] ?? FLOW_COLORS.other);
}

export const HOTLINE = {
  label: "National Immigration Detention Hotline",
  number: "209-757-3733",
};
export const DIRECTORY_URL = "https://www.freedomforimmigrants.org/visitation";
export const DEATHS_SOURCE_URL =
  "https://github.com/uclalawbehindbars/ICE_custody_mortality";
