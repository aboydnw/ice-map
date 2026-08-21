"""Per-facility enrichment with validation.

Every function returns a validated value or ``None``; the frontend renders
nothing for ``None``. Coverage is tracked so omissions stay visible in the
match report.
"""

import datetime as dt
import json
import pathlib
import re

import pandas as pd

REFERENCE_DIR = pathlib.Path(__file__).resolve().parent / "reference"

THREAT_COLUMNS = {
    "level_1": "ice_threat_level_1",
    "level_2": "ice_threat_level_2",
    "level_3": "ice_threat_level_3",
    "none": "no_ice_threat_level",
}
THREAT_TOLERANCE = 0.02
MANDATORY_TOLERANCE = 1.02

INSPECTION_BODIES = {
    "ODO": "ICE's Office of Detention Oversight",
    "ODO OASIP": "ICE's Office of Detention Oversight",
    "ORSA": "facility self-assessment (ORSA)",
    "PRE-OCCUPANCY": "pre-occupancy review",
}
INSPECTION_STANDARDS = {"NDS 2000", "NDS 2019", "NDS 2025", "PBNDS 2008", "PBNDS 2011", "FPBDS", "FRS"}
EXCEL_EPOCH = pd.Timestamp("1899-12-30")

# DDP's individual-level detention data (source of peak / days-in-use) ends here.
INDIVIDUAL_DATA_THROUGH = "2026-03-10"

STOPWORDS = {
    "ICE", "PROCESSING", "CENTER", "CTR", "DETENTION", "FACILITY", "COUNTY", "CO", "JAIL",
    "CORRECTIONAL", "CORRECTIONS", "CORR", "THE", "OF", "AND", "SPC", "IPC", "CDF", "DET",
    "INSTITUTION", "INST", "FEDERAL", "FED", "FCI", "USP", "CENTRE", "SERVICE", "REGIONAL",
    "ANNEX", "MAIN", "UNIT", "SHERIFF", "SHERIFFS", "OFFICE", "DEPARTMENT", "DEPT", "CITY",
    "TOWN", "PARISH", "STATE", "PRISON", "COMPLEX", "ADULT", "SECURE", "CAMP",
}


def normalize(value) -> str:
    """Uppercase, strip punctuation, collapse whitespace."""
    value = re.sub(r"[^A-Z0-9 ]", " ", str(value or "").upper())
    return re.sub(r"\s+", " ", value).strip()


def significant_tokens(value) -> set:
    return {t for t in normalize(value).split() if t not in STOPWORDS and len(t) > 1}


def column_sum(group: pd.DataFrame, column: str):
    """Sum a column, treating an absent or all-missing column as missing (not zero)."""
    if column not in group or group[column].isna().all():
        return None
    return positive_number(group[column].sum())


def positive_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(number) or number < 0:
        return None
    return number


def threat_levels(group: pd.DataFrame, adp: float):
    """ICE threat-level breakdown; must reconcile with ADP within tolerance."""
    values = {}
    for key, column in THREAT_COLUMNS.items():
        number = column_sum(group, column)
        if number is None:
            return None
        values[key] = number
    total = sum(values.values())
    if adp <= 0 or abs(total - adp) / adp > THREAT_TOLERANCE:
        return None
    return {key: round(number) for key, number in values.items()}


def mandatory_detention(group: pd.DataFrame, adp: float):
    number = column_sum(group, "mandatory")
    if number is None or adp <= 0 or number > adp * MANDATORY_TOLERANCE:
        return None
    return round(number)


def parse_inspection_date(value):
    """Return (iso_date, scheduled_label); ICE mixes serials, datetimes, and 'Scheduled FY26'."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None, None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "nat", "none"}:
        return None, None
    scheduled = re.fullmatch(r"(?i)scheduled\s*(FY\s*\d{2,4})", text)
    if scheduled:
        return None, scheduled.group(1).replace(" ", "").upper()
    if re.fullmatch(r"\d{4,6}(\.0)?", text):
        date = (EXCEL_EPOCH + pd.Timedelta(days=float(text))).date()
    else:
        try:
            date = pd.Timestamp(text).date()
        except (ValueError, TypeError):
            return None, None
    if not 2008 <= date.year <= dt.date.today().year + 1:
        return None, None
    return date.isoformat(), None


def inspection(row: pd.Series):
    """Plain-language inspection summary; omitted when the inspection type is unknown."""
    type_code = str(row.get("last_inspection_type") or "").strip().upper()
    body = INSPECTION_BODIES.get(type_code)
    if not body:
        return None
    rating = row.get("last_final_rating") or row.get("last_inspection_rating_final")
    rating = str(rating).strip() if pd.notna(rating) and str(rating).strip() else None
    date_iso, scheduled = parse_inspection_date(
        row.get("last_inspection_end_date") if pd.notna(row.get("last_inspection_end_date")) else row.get("last_inspection_date")
    )
    standard = str(row.get("last_inspection_standard") or "").strip().upper()
    return {
        "body": body,
        "type_code": type_code,
        "self_assessment": type_code == "ORSA",
        "rating": rating,
        "date": date_iso,
        "scheduled": scheduled,
        "standard": standard if standard in INSPECTION_STANDARDS else None,
    }


def load_alos(path: pathlib.Path) -> dict:
    """Latest-pull ALOS keyed by normalized name; ambiguous names are dropped."""
    df = pd.read_parquet(path)
    latest = df[df["pull_date"] == df["pull_date"].max()].copy()
    latest["key"] = latest["name"].map(normalize)
    counts = latest["key"].value_counts()
    lookup = {}
    for record in latest.itertuples():
        if counts[record.key] != 1:
            continue
        days = positive_number(record.alos)
        if days is None or not 0 < days < 1000:
            continue
        lookup[record.key] = {"days": round(days), "fiscal_year": int(record.alos_fiscal_year)}
    return lookup


def length_of_stay(alos_lookup: dict, spreadsheet_name: str):
    return alos_lookup.get(normalize(spreadsheet_name))


def last_year_use(master_row: pd.Series):
    days = positive_number(master_row.get("days_with_detentions_daily_last_year"))
    peak = positive_number(master_row.get("max_daily_population_last_year"))
    if days is None or peak is None or not 0 < days <= 366 or peak < 1:
        return None
    return {"peak": round(peak), "days_in_use": round(days), "window_end": INDIVIDUAL_DATA_THROUGH}


def load_deaths(path: pathlib.Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str)
    df["dod_parsed"] = pd.to_datetime(df["dod"], errors="coerce")
    return df[df["detention_center_id"].notna() & df["dod_parsed"].notna()]


def deaths(deaths_df: pd.DataFrame, detloc: str):
    rows = deaths_df[deaths_df["detention_center_id"] == detloc]
    if rows.empty:
        return {"count": 0, "last": None}
    return {"count": int(len(rows)), "last": rows["dod_parsed"].max().date().isoformat()}


def load_json(name: str):
    path = REFERENCE_DIR / name
    return json.loads(path.read_text()) if path.exists() else None


def match_ice_site(records, name: str, city: str, state: str):
    """Official ICE page/photo: same state and either the same name or same city plus a shared token."""
    if not records:
        return None
    tokens = significant_tokens(name)
    for record in records:
        if str(record.get("state", "")).upper() != state:
            continue
        same_name = normalize(record.get("name")) == normalize(name)
        same_city = normalize(record.get("city")) == normalize(city)
        overlap = tokens & significant_tokens(record.get("name"))
        if same_name or (same_city and overlap):
            return record
    return None


def match_odo_report(records, name: str, city: str, state: str):
    """Newest ODO report whose text shares the state and enough facility tokens."""
    if not records:
        return None
    tokens = significant_tokens(name)
    best = None
    for record in records:
        if str(record.get("state") or "").upper() != state:
            continue
        overlap = tokens & significant_tokens(record.get("facility_text"))
        same_city = normalize(record.get("city")) == normalize(city) and bool(overlap)
        if not (same_city or len(overlap) >= 2):
            continue
        key = record.get("date_iso_approx") or ""
        if best is None or key > (best.get("date_iso_approx") or ""):
            best = record
    return best


def verify_operator(candidates, types, name, city, state, type_detailed, lat, lon):
    """Two-source rule: Wikipedia management plus an independent signal."""
    if not candidates or not types:
        return None
    tokens = significant_tokens(name)
    wiki = None
    for row in candidates.get("wikipedia", {}).get("rows", []):
        if str(row.get("state", "")).upper() != state:
            continue
        overlap = tokens & significant_tokens(row.get("name"))
        same_city = normalize(row.get("city")) == normalize(city)
        if (same_city and overlap) or len(overlap) >= 2:
            wiki = row
            break
    if not wiki or not wiki.get("management"):
        return None
    entity = types.get(normalize(wiki["management"]))
    if not entity:
        return None
    if "generic" in str(entity.get("notes", "")).lower():
        return derive_local_operator(name, wiki["management"], type_detailed)
    signals = []
    entity_tokens = significant_tokens(entity["display"]) | significant_tokens(wiki["management"])
    if entity_tokens & tokens:
        signals.append("name")
    if type_detailed == "BOP" and "PRISONS" in entity_tokens:
        signals.append("type")
    for feature in candidates.get("osm", {}).get("rows", []):
        try:
            d_lat = abs(float(feature["lat"]) - lat)
            d_lon = abs(float(feature["lon"]) - lon)
        except (TypeError, ValueError, KeyError):
            continue
        if d_lat < 0.02 and d_lon < 0.025 and significant_tokens(feature.get("operator")) & entity_tokens:
            signals.append("osm")
            break
    if not signals:
        return None
    return {"name": entity["display"], "kind": entity["type"], "sources": ["wikipedia", *signals]}


LOCAL_JAIL_TYPES = {"IGSA", "USMS IGA", "STATE"}


def derive_local_operator(name: str, management: str, type_detailed: str):
    """Name the county/city behind Wikipedia's generic 'County (Sheriff)'-style values."""
    if type_detailed not in LOCAL_JAIL_TYPES:
        return None
    label = normalize(management)
    unit = "PARISH" if "PARISH" in normalize(name) else "COUNTY" if "COUNTY" in normalize(name) else None
    if unit is None or not label.startswith(("COUNTY", "CITY")):
        return None
    if label.startswith("CITY"):
        return None
    match = re.match(r"^(.*?\b" + unit + r")\b", normalize(name))
    if not match or len(match.group(1).split()) > 4:
        return None
    place = " ".join(word.title() for word in match.group(1).split())
    if "SHERIFF" in label:
        display = f"{place} Sheriff"
    elif "CORRECTIONS" in label:
        display = f"{place} Corrections"
    else:
        display = place
    return {"name": display, "kind": "public", "sources": ["wikipedia", "name"]}
