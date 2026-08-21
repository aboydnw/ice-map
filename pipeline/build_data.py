"""Build the static data artifacts served by the map frontend.

Downloads three CC0 datasets from the Deportation Data Project, joins the
latest ICE Detention Management snapshot to the verified facility master,
validates the result, and writes:

- web/public/data/facilities.geojson  — latest snapshot, one point per facility
- web/public/data/history.json        — per-facility population time series
- web/public/data/match_report.json   — join coverage and unmatched facilities
"""

import json
import pathlib
import re
import sys

import pandas as pd
import requests

import enrich

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / "pipeline" / "cache"
OUT_DIR = REPO_ROOT / "web" / "public" / "data"

LFS_BASE = "https://media.githubusercontent.com/media/deportationdata"
SOURCES = {
    "master": f"{LFS_BASE}/ice-detention-facilities/main/data/facilities-augmented.parquet",
    "crosswalk": f"{LFS_BASE}/ice-detention-facilities/main/data/facilities-name-state-match.parquet",
    "timeseries": f"{LFS_BASE}/ice-detention-management/main/data/facilities.parquet",
    "alos": f"{LFS_BASE}/ice-detention-management/main/data/facility-alos.parquet",
}
DEATHS_URL = (
    "https://raw.githubusercontent.com/uclalawbehindbars/ICE_custody_mortality/main/"
    "Data/Processed/ice_deaths_validated.csv"
)

TYPE_BUCKETS = {
    "SPC": "dedicated",
    "CDF": "dedicated",
    "DIGSA": "dedicated",
    "FAMILY": "dedicated",
    "STAGING": "dedicated",
    "MOC": "dedicated",
    "IGSA": "county_jail",
    "STATE": "county_jail",
    "USMS IGA": "usms",
    "USMS CDF": "usms",
    "BOP": "federal_prison",
    "DOD": "federal_prison",
}

LEVEL_COLUMNS = ["level_a", "level_b", "level_c", "level_d"]
BREAKDOWN_COLUMNS = ["male_crim", "male_non_crim", "female_crim", "female_non_crim"]

MIN_PLAUSIBLE_TOTAL = 10_000
MAX_PLAUSIBLE_TOTAL = 200_000
MIN_MATCH_RATE = 0.7


def normalize_name(value: str) -> str:
    """Uppercase, collapse whitespace, and drop punctuation for join keys."""
    value = re.sub(r"[^A-Z0-9 ]", " ", str(value).upper())
    return re.sub(r"\s+", " ", value).strip()


def bucket_for(type_detailed: str) -> str:
    return TYPE_BUCKETS.get(str(type_detailed).strip().upper(), "other")


def to_number(series: pd.Series) -> pd.Series:
    cleaned = series.astype(str).str.replace(",", "", regex=False).str.strip()
    return pd.to_numeric(cleaned, errors="coerce")


def download_sources() -> dict[str, pathlib.Path]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    paths = {}
    for key, url in SOURCES.items():
        path = CACHE_DIR / f"{key}.parquet"
        response = requests.get(url, timeout=120)
        response.raise_for_status()
        path.write_bytes(response.content)
        paths[key] = path
    deaths_path = CACHE_DIR / "deaths.csv"
    response = requests.get(DEATHS_URL, timeout=120)
    response.raise_for_status()
    deaths_path.write_bytes(response.content)
    paths["deaths"] = deaths_path
    return paths


class Enrichment:
    """Reference lookups shared across facilities, plus coverage counters."""

    def __init__(self, alos_path, deaths_path):
        self.alos = enrich.load_alos(alos_path)
        self.deaths = enrich.load_deaths(deaths_path)
        self.ice_site = enrich.load_json("ice_site.json")
        self.ice_site_aliases = {
            k: v for k, v in (enrich.load_json("ice_site_aliases.json") or {}).items() if not k.startswith("_")
        }
        self.odo = enrich.load_json("odo_reports.json")
        self.operators = enrich.load_json("operators_candidates.json")
        raw_types = enrich.load_json("operator_types.json") or {}
        self.operator_types = {enrich.normalize(k): v for k, v in raw_types.items() if not k.startswith("_")}
        self.coverage = {}

    def count(self, key, value):
        self.coverage[key] = self.coverage.get(key, 0) + (1 if value is not None else 0)
        return value

    def properties(self, row, group, info, adp, detloc):
        city = str(row.get("city") or "")
        state = str(row.get("state") or "").upper()
        name = str(row["name"])
        site = self.count("ice_page", enrich.match_ice_site(self.ice_site, self.ice_site_aliases, [name, str(info["name"])], city, state))
        odo = self.count("odo_report", enrich.match_odo_report(self.odo, name, city, state))
        photo = site.get("photo") if site else None
        if photo and not (REPO_ROOT / photo).exists():
            photo = None
        return {
            "threat": self.count("threat", enrich.threat_levels(group, adp)),
            "mandatory": self.count("mandatory", enrich.mandatory_detention(group, adp)),
            "alos": self.count("alos", enrich.length_of_stay(self.alos, name)),
            "last_year": self.count("last_year", enrich.last_year_use(info, adp)),
            "inspection": self.count("inspection", enrich.inspection(row)),
            "deaths": self.count("deaths", enrich.deaths(self.deaths, detloc)),
            "operator": self.count(
                "operator",
                enrich.verify_operator(
                    self.operators, self.operator_types, name, city, state,
                    str(row.get("type_detailed") or "").upper(),
                    float(info["latitude"]), float(info["longitude"]),
                ),
            ),
            "odo_report_url": odo.get("pdf_url") if odo else None,
            "ice_page_url": site.get("url") if site else None,
            "phone": site.get("facility_phone") if site else None,
            "photo": self.count("photo", photo.replace("web/public/", "") if photo else None),
        }


def build_code_lookup(crosswalk: pd.DataFrame, master: pd.DataFrame) -> dict:
    """Map (normalized name, state) -> facility code, most recent mapping wins."""
    lookup = {}
    ordered = crosswalk.sort_values("date")
    for row in ordered.itertuples():
        key = (normalize_name(row.name), str(row.state).strip().upper())
        lookup[key] = row.detention_facility_code
    for row in master.itertuples():
        key = (normalize_name(row.name), str(row.state).strip().upper())
        lookup.setdefault(key, row.detention_facility_code)
    return lookup


def build_address_lookup(master: pd.DataFrame) -> dict:
    lookup = {}
    for row in master.itertuples():
        key = (normalize_name(row.address), str(row.state).strip().upper())
        lookup.setdefault(key, row.detention_facility_code)
    return lookup


def load_aliases() -> dict:
    """Human-reviewed name overrides, keyed (normalized name, state) -> code."""
    raw = json.loads((pathlib.Path(__file__).parent / "aliases.json").read_text())
    return {
        tuple(key.split("|")): code for key, code in raw.items() if not key.startswith("_")
    }


def resolve_codes(
    snapshot: pd.DataFrame, aliases: dict, code_lookup: dict, address_lookup: dict
) -> pd.DataFrame:
    """Attach a facility code and match method to each snapshot row."""
    codes, methods = [], []
    for row in snapshot.itertuples():
        state = str(row.state).strip().upper()
        name_key = (normalize_name(row.name), state)
        address_key = (normalize_name(row.address), state)
        if name_key in aliases:
            codes.append(aliases[name_key])
            methods.append("alias")
        elif name_key in code_lookup:
            codes.append(code_lookup[name_key])
            methods.append("name")
        elif address_key in address_lookup:
            codes.append(address_lookup[address_key])
            methods.append("address")
        else:
            codes.append(None)
            methods.append("unmatched")
    out = snapshot.copy()
    out["detloc"] = codes
    out["match_method"] = methods
    return out


def validate(matched: pd.DataFrame, snapshot: pd.DataFrame) -> None:
    total = snapshot["adp"].sum()
    if not MIN_PLAUSIBLE_TOTAL <= total <= MAX_PLAUSIBLE_TOTAL:
        raise ValueError(f"implausible national total ADP: {total:,.0f}")
    match_rate = len(matched) / len(snapshot)
    if match_rate < MIN_MATCH_RATE:
        raise ValueError(f"match rate {match_rate:.0%} below threshold {MIN_MATCH_RATE:.0%}")
    if (snapshot["adp"] < 0).any():
        raise ValueError("negative population values in snapshot")


def coalesce(row, *columns):
    for column in columns:
        value = row.get(column)
        if pd.notna(value) and str(value).strip():
            return value
    return None


EXCEL_EPOCH = pd.Timestamp("1899-12-30")
ACRONYMS = {"ICE", "US", "USP", "FCI", "FDC", "MDC", "CCA", "SPC", "IPC", "NWIPC", "CLIPC", "MCF", "CCNO"}


def format_inspection_date(value) -> str | None:
    """ICE spreadsheets mix ISO datetimes with raw Excel day serials."""
    if value is None:
        return None
    text = str(value).strip()
    if re.fullmatch(r"\d{4,6}(\.0)?", text):
        return str((EXCEL_EPOCH + pd.Timedelta(days=float(text))).date())
    return text[:10]


def display_name(name: str) -> str:
    """Title-case all-caps names, preserving known acronyms; keep mixed case as-is."""
    if name != name.upper():
        return name
    return " ".join(
        word if word.strip("().,") in ACRONYMS else word.title() for word in name.split(" ")
    )


def build_features(matched: pd.DataFrame, master: pd.DataFrame, enrichment: Enrichment) -> list[dict]:
    master_by_code = master.set_index("detention_facility_code")
    features = []
    for detloc, group in matched.groupby("detloc"):
        row = group.iloc[0]
        info = master_by_code.loc[detloc]
        if isinstance(info, pd.DataFrame):
            info = info.iloc[0]
        adp = group["adp"].sum()
        inspection_rating = coalesce(row, "last_inspection_rating_final", "last_final_rating")
        inspection_date = coalesce(row, "last_inspection_date", "last_inspection_end_date")
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(float(info["longitude"]), 5), round(float(info["latitude"]), 5)],
                },
                "properties": {
                    "detloc": detloc,
                    "name": display_name(str(info["name"])),
                    "address": str(info["address_full"]),
                    "bucket": bucket_for(row["type_detailed"]),
                    "type_detailed": row["type_detailed"],
                    "adp": round(float(adp)),
                    "male_crim": round(float(group["male_crim"].sum())),
                    "male_non_crim": round(float(group["male_non_crim"].sum())),
                    "female_crim": round(float(group["female_crim"].sum())),
                    "female_non_crim": round(float(group["female_non_crim"].sum())),
                    "male_female": coalesce(row, "male_female"),
                    "guaranteed_minimum": round(float(row["guaranteed_minimum"]))
                    if pd.notna(row["guaranteed_minimum"])
                    else None,
                    "inspection_rating": inspection_rating,
                    "inspection_date": format_inspection_date(inspection_date),
                    "field_office": coalesce(info, "field_office"),
                    "aor": coalesce(row, "aor"),
                    "match_method": row["match_method"],
                    **enrichment.properties(row, group, info, adp, detloc),
                },
            }
        )
    features.sort(key=lambda f: f["properties"]["detloc"])
    return features


def build_history(
    timeseries: pd.DataFrame, aliases: dict, code_lookup: dict, address_lookup: dict, codes: set
) -> tuple[dict, dict]:
    resolved = resolve_codes(timeseries, aliases, code_lookup, address_lookup)
    usable = resolved["detloc"].isin(codes)
    coverage = {
        "rows_resolved": int(usable.sum()),
        "rows_total": len(resolved),
        "adp_share_resolved": round(
            float(resolved.loc[usable, "adp"].sum() / resolved["adp"].sum()), 3
        ),
    }
    resolved = resolved[usable]
    grouped = (
        resolved.groupby(["detloc", "pull_date"])["adp"].sum().round().astype(int).reset_index()
    )
    history = {}
    for detloc, group in grouped.groupby("detloc"):
        ordered = group.sort_values("pull_date")
        history[detloc] = [
            [str(date)[:10], int(adp)] for date, adp in zip(ordered["pull_date"], ordered["adp"])
        ]
    return dict(sorted(history.items())), coverage


def prepare_timeseries(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.copy()
    for column in LEVEL_COLUMNS + BREAKDOWN_COLUMNS + ["guaranteed_minimum"]:
        df[column] = to_number(df[column])
    df["adp"] = df[LEVEL_COLUMNS].sum(axis=1)
    df = df[df["name"].notna()]
    df = df[df["name"].astype(str).str.strip().str.upper() != "TOTAL"]
    return df


def main() -> int:
    paths = download_sources()
    master = pd.read_parquet(paths["master"])
    crosswalk = pd.read_parquet(paths["crosswalk"])
    timeseries = prepare_timeseries(pd.read_parquet(paths["timeseries"]))

    master = master[master["latitude"].notna() & master["longitude"].notna()]
    aliases = load_aliases()
    code_lookup = build_code_lookup(crosswalk, master)
    address_lookup = build_address_lookup(master)
    known_codes = set(master["detention_facility_code"])

    latest_date = timeseries["pull_date"].max()
    snapshot = timeseries[timeseries["pull_date"] == latest_date]
    resolved = resolve_codes(snapshot, aliases, code_lookup, address_lookup)
    matched = resolved[resolved["detloc"].isin(known_codes)]
    unmatched = resolved[~resolved["detloc"].isin(known_codes)]

    validate(matched, snapshot)

    enrichment = Enrichment(paths["alos"], paths["deaths"])
    features = build_features(matched, master, enrichment)
    history, history_coverage = build_history(
        timeseries, aliases, code_lookup, address_lookup, set(matched["detloc"])
    )

    pull_date = str(latest_date)[:10]
    report = {
        "pull_date": pull_date,
        "snapshot_facilities": len(snapshot),
        "matched": len(matched),
        "unmatched": len(unmatched),
        "match_methods": resolved["match_method"].value_counts().to_dict(),
        "national_adp": round(float(snapshot["adp"].sum())),
        "unmatched_adp": round(float(unmatched["adp"].sum())),
        "history_coverage": history_coverage,
        "enrichment_coverage": enrichment.coverage,
        "unmatched_facilities": [
            {
                "name": str(row["name"]),
                "city": str(row["city"]),
                "state": str(row["state"]),
                "adp": round(float(row["adp"])),
            }
            for _, row in unmatched.sort_values("adp", ascending=False).iterrows()
        ],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = {"type": "FeatureCollection", "meta": {"pull_date": pull_date}, "features": features}
    (OUT_DIR / "facilities.geojson").write_text(json.dumps(geojson, separators=(",", ":")))
    (OUT_DIR / "history.json").write_text(json.dumps(history, separators=(",", ":")))
    (OUT_DIR / "match_report.json").write_text(json.dumps(report, indent=2))

    print(
        f"snapshot {pull_date}: {len(matched)}/{len(snapshot)} facilities matched, "
        f"national ADP {report['national_adp']:,}, unmatched ADP {report['unmatched_adp']:,}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
