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
}

/** One country whose consular districts can be overlaid; the picker reads these. */
export interface ConsularCountry {
  key: string;
  name: string;
  file: string;
  districts: number;
  source: string;
  source_dates: [string, string];
  built: string;
}

export interface ConsularDistrictProperties {
  id: string;
  name: string;
  city: string;
  state: string;
  county_count: number;
  states: string[];
  source_url: string;
  source_date: string;
  /** Index into CONSULAR_COLORS; neighbouring districts never share one. */
  color: number;
}

export interface ConsularDistrictFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties: ConsularDistrictProperties;
}

export interface ConsularCollection {
  type: "FeatureCollection";
  meta: ConsularCountry;
  features: ConsularDistrictFeature[];
}
