export type Bucket =
  "dedicated" | "county_jail" | "usms" | "federal_prison" | "other";

export interface ThreatLevels {
  level_1: number;
  level_2: number;
  level_3: number;
  none: number;
}

export interface Inspection {
  body: string;
  type_code: string;
  self_assessment: boolean;
  rating: string | null;
  date: string | null;
  scheduled: string | null;
  standard: string | null;
}

export interface Operator {
  name: string;
  kind: "private" | "public";
  sources: string[];
}

export interface FacilityProperties {
  detloc: string;
  name: string;
  address: string;
  bucket: Bucket;
  type_detailed: string;
  adp: number;
  male_crim: number;
  male_non_crim: number;
  female_crim: number;
  female_non_crim: number;
  male_female: string | null;
  guaranteed_minimum: number | null;
  inspection_rating: string | null;
  inspection_date: string | null;
  field_office: string | null;
  aor: string | null;
  match_method: string;
  threat: ThreatLevels | null;
  mandatory: number | null;
  alos: { days: number; fiscal_year: number } | null;
  last_year: { peak: number; days_in_use: number; window_end: string } | null;
  inspection: Inspection | null;
  deaths: { count: number; last: string | null } | null;
  operator: Operator | null;
  odo_report_url: string | null;
  ice_page_url: string | null;
  phone: string | null;
  photo: string | null;
}

export interface FacilityFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: FacilityProperties;
}

export interface FacilityCollection {
  type: "FeatureCollection";
  meta: { pull_date: string };
  features: FacilityFeature[];
}

export type History = Record<string, [string, number][]>;

export interface MatchReport {
  pull_date: string;
  snapshot_facilities: number;
  matched: number;
  unmatched: number;
  national_adp: number;
  flows?: {
    window_start: string;
    as_of: string;
    arrest_link_rate: {
      national: number | null;
      median_facility: number | null;
    };
  };
}

export type FlowDirection = "in" | "out";

/** One destination or origin for a facility, with a monthly breakdown. */
export interface FlowEdge {
  key: string;
  count: number;
  months: [string, number][];
}

export interface FacilityFlows {
  /** `country:<KEY>` for a destination-country board. */
  detloc: string;
  kind?: "facility" | "country";
  as_of: string;
  window: [string, string];
  totals: Record<FlowDirection, number>;
  coverage: { origin_linked: number | null; origin_linked_of: number };
  in: FlowEdge[];
  out: FlowEdge[];
}

export interface Centroid {
  name: string;
  lon: number;
  lat: number;
  /**
   * Endpoints only. "processing" is a hold room, field office, or staging
   * site: somewhere people pass through, with no reported population.
   */
  kind?: "processing" | "detention";
  /** Endpoints only: stints that moved through here, in either direction. */
  stints?: number;
}

export interface FlowEndpoints {
  as_of: string;
  facilities: Record<string, Centroid>;
  /** Removal destinations that have a board, with the stints sent there. */
  countries?: Record<string, Centroid>;
}

/** Centroid tables keyed by ICE's own spellings, as written by the pipeline. */
export type Centroids = Record<string, Centroid>;
