export type Bucket =
  "dedicated" | "county_jail" | "usms" | "federal_prison" | "other";

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
