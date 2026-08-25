"""Aggregate detention stints into per-facility flow edges.

Every stint has exactly one way in and one way out, so the edges built here sum
back to each facility's book-ins and book-outs inside the data window. Edge keys
are opaque strings the frontend resolves against ``endpoints.json``,
``states.json``, and ``countries.json``:

- ``transfer:{code}``      another detention facility
- ``transfer:unknown``     released as "Transferred" with no following stint
- ``transfer:no-location`` a known facility whose coordinates are not published
- ``removed:{country}``    deported, voluntary departure, or voluntary return
- ``arrested:{state}``     first stint of a stay, linked to an ICE arrest record
- ``arrived:unlinked``     first stint of a stay with no usable arrest record
- ``released:{group}``     released into the community; no destination recorded
- ``custody:other-agency`` handed to the U.S. Marshals or another agency
- ``other:{reason}``       died, escaped, and other rare dispositions
- ``not-reported``         release reason redacted by ICE
"""

import json
import pathlib

import pandas as pd
import pyarrow.parquet
import pyarrow.types

import enrich

REFERENCE_DIR = pathlib.Path(__file__).resolve().parent / "reference"

WINDOW_START = "2022-10-01"

STINT_COLUMNS = [
    "stay_ID",
    "unique_identifier",
    "book_in_date_time",
    "book_out_date_time",
    "detention_facility_code",
    "detention_release_reason",
    "departure_country",
    "duplicate_drop_row",
]
ARREST_COLUMNS = [
    "unique_identifier",
    "apprehension_date_time",
    "apprehension_state_filled_in",
    "duplicate_drop_row",
]
# Repeated-value columns; dictionary encoding keeps the 253 MB stints file from
# expanding into gigabytes of Python strings.
DICTIONARY_COLUMNS = [
    "detention_facility_code",
    "detention_release_reason",
    "departure_country",
    "apprehension_state_filled_in",
]

# The last day in the file is usually a stub of a few late-arriving rows rather
# than a full day of reporting; anything below this share of a normal day's
# volume is treated as incomplete.
FULL_DAY_SHARE = 0.2

# DDP's own linkage rule, widened to the plan's window: an arrest counts as the
# origin of a stay if it happened up to 10 days before or 5 days after book-in.
ARREST_WINDOW_BEFORE = pd.Timedelta(days=10)
ARREST_WINDOW_AFTER = pd.Timedelta(days=5)

# Hold rooms, field offices, and staging sites are processing points rather than
# places people are detained. ICE's population reports exclude them by design, so
# they never get a circle on the map even though a quarter of all movement runs
# through them.
PROCESSING_TYPES = {"HOLD", "STAGING"}

# ICE detains people in the Americas and in the Pacific territories; a facility
# plotted anywhere else is a bad coordinate, not a location we should draw.
ENDPOINT_BOXES = [
    (-180.0, 5.0, -52.0, 72.0),
    (130.0, -20.0, 180.0, 25.0),
]

TRANSFER_TEMPLATE = "transfer:{next}"
REMOVAL_TEMPLATE = "removed:{country}"
UNKNOWN_TRANSFER = "transfer:unknown"
NO_LOCATION_TRANSFER = "transfer:no-location"
UNLINKED_ARRIVAL = "arrived:unlinked"
NOT_REPORTED = "not-reported"

RELEASE_PREFIXES = {
    "PAROLED": "released:paroled",
    "BONDED OUT": "released:bonded-out",
    "ORDER OF RECOGNIZANCE": "released:recognizance",
    "ORDER OF SUPERVISION": "released:supervision",
}
COURT_CLOSURES = {
    "RELIEF GRANTED BY IJ",
    "PROCEEDINGS TERMINATED",
    "WITHDRAWAL",
    "COURT ORDERED",
}
REMOVAL_REASONS = {"REMOVED", "VOLUNTARY DEPARTURE", "VOLUNTARY RETURN"}
OTHER_REASONS = {
    "DIED": "other:died",
    "ESCAPED": "other:escaped",
    "TITLE 42 RETURN": "other:title-42",
    "PROCESSING DISPOSITION CHANGED LOCALLY": "other:processing-change",
}


def is_blank(value) -> bool:
    """True for ``None``, float NaN, and empty or whitespace-only strings."""
    if value is None:
        return True
    if isinstance(value, float) and value != value:
        return True
    return not str(value).strip()


def clean(value) -> str:
    return "" if is_blank(value) else str(value).strip()


def out_template(reason) -> str:
    """Map a release reason to an edge key, or to a template needing one more field."""
    text = clean(reason).upper()
    if not text:
        return NOT_REPORTED
    if text == "TRANSFERRED":
        return TRANSFER_TEMPLATE
    if text in REMOVAL_REASONS:
        return REMOVAL_TEMPLATE
    for prefix, key in RELEASE_PREFIXES.items():
        if text.startswith(prefix):
            return key
    if text in COURT_CLOSURES:
        return "released:court"
    if text.startswith("U.S. MARSHALS"):
        return "custody:other-agency"
    if text.startswith("ORR"):
        return "other:orr"
    if text in OTHER_REASONS:
        return OTHER_REASONS[text]
    return "other:unknown"


def classify_out(reason, next_facility, departure_country) -> str:
    """The out-edge key for one stint."""
    template = out_template(reason)
    if template == TRANSFER_TEMPLATE:
        return f"transfer:{clean(next_facility) or 'unknown'}"
    if template == REMOVAL_TEMPLATE:
        return f"removed:{clean(departure_country).upper() or 'unknown'}"
    return template


def read_columns(path, columns: list[str]) -> pd.DataFrame:
    """Read a column subset, dictionary-encoding the low-cardinality string columns."""
    table = pyarrow.parquet.read_table(path, columns=columns)
    for name in DICTIONARY_COLUMNS:
        index = table.schema.get_field_index(name)
        if index >= 0 and pyarrow.types.is_string(table.schema.field(index).type):
            table = table.set_column(index, name, table.column(index).dictionary_encode())
    return table.to_pandas()


def data_through(timestamps: pd.Series) -> pd.Timestamp:
    """The last day with a full slate of reporting, ignoring the file's stub tail."""
    daily = timestamps.dt.floor("D").value_counts().sort_index()
    typical = daily.tail(30).median()
    return daily[daily >= typical * FULL_DAY_SHARE].index.max()


def load_reference(name: str) -> dict:
    """Read a centroid table, dropping the underscore-prefixed provenance note."""
    raw = json.loads((REFERENCE_DIR / name).read_text())
    return {key: value for key, value in raw.items() if not key.startswith("_")}


def in_bounds(lon: float, lat: float) -> bool:
    return any(
        lon_min <= lon <= lon_max and lat_min <= lat <= lat_max
        for lon_min, lat_min, lon_max, lat_max in ENDPOINT_BOXES
    )


def build_edges(stints: pd.DataFrame, countries: dict) -> pd.DataFrame:
    """One row per stint, carrying its facility, in-edge key, and out-edge key.

    In-edge keys for the first stint of a stay are left empty here; they come
    from the arrest join in :func:`link_arrests`.
    """
    frame = stints[~stints["duplicate_drop_row"].fillna(False)].copy()
    for column in ("book_in_date_time", "book_out_date_time"):
        frame[column] = pd.to_datetime(frame[column], utc=True, errors="coerce")
    frame = frame[frame["book_in_date_time"].notna()]
    frame = frame.sort_values(["stay_ID", "book_in_date_time"], kind="stable")

    # A stint with no stay ID is its own stay: comparing against a missing
    # neighbour yields NA, which is emphatically not "same stay".
    stay = frame["stay_ID"]
    same_stay_before = (stay.eq(stay.shift(1)) & stay.notna()).fillna(False).astype(bool)
    same_stay_after = (stay.eq(stay.shift(-1)) & stay.notna()).fillna(False).astype(bool)
    codes = frame["detention_facility_code"].astype("object")
    frame["prev_fac"] = codes.shift(1).where(same_stay_before)
    frame["next_fac"] = codes.shift(-1).where(same_stay_after)
    frame["is_first"] = ~same_stay_before

    reasons = frame["detention_release_reason"].astype("object").fillna("")
    templates = reasons.map({value: out_template(value) for value in reasons.unique()})

    out_key = templates.copy()
    transfers = templates == TRANSFER_TEMPLATE
    out_key[transfers] = "transfer:" + frame.loc[transfers, "next_fac"].fillna("unknown")

    removals = templates == REMOVAL_TEMPLATE
    country = frame.loc[removals, "departure_country"].astype("object").fillna("").str.strip().str.upper()
    frame["unmapped_country"] = country.where(~country.isin(countries) & (country != ""))
    out_key[removals] = "removed:" + country.where(country.isin(countries), "unknown")
    frame["out_key"] = out_key

    frame["in_key"] = ""
    chained = ~frame["is_first"]
    frame.loc[chained, "in_key"] = "transfer:" + frame.loc[chained, "prev_fac"].fillna("unknown")

    # A stint that is still open at the end of the data has no out edge.
    frame.loc[frame["book_out_date_time"].isna(), "out_key"] = None
    return frame.drop(
        columns=[
            "stay_ID",
            "prev_fac",
            "next_fac",
            "detention_release_reason",
            "departure_country",
            "duplicate_drop_row",
        ]
    )


def link_arrests(edges: pd.DataFrame, arrests: pd.DataFrame, states: dict) -> pd.DataFrame:
    """Fill in-edge keys for the first stint of each stay from ICE arrest records.

    ICE's arrest table covers ERO interior arrests only, so most stays that begin
    at a border facility have no match and stay ``arrived:unlinked``.
    """
    first = edges[edges["is_first"]]
    candidates = arrests[~arrests["duplicate_drop_row"].fillna(False)].copy()
    candidates["apprehension_date_time"] = pd.to_datetime(
        candidates["apprehension_date_time"], utc=True, errors="coerce"
    )
    candidates = candidates[
        candidates["apprehension_date_time"].notna()
        & candidates["unique_identifier"].notna()
        & candidates["apprehension_state_filled_in"].isin(states)
    ]

    joined = first[["unique_identifier", "book_in_date_time"]].reset_index().merge(
        candidates[["unique_identifier", "apprehension_date_time", "apprehension_state_filled_in"]],
        on="unique_identifier",
        how="inner",
    )
    delta = joined["apprehension_date_time"] - joined["book_in_date_time"]
    joined = joined[(delta >= -ARREST_WINDOW_BEFORE) & (delta <= ARREST_WINDOW_AFTER)]
    joined["distance"] = delta[joined.index].abs()
    nearest = joined.sort_values(["index", "distance"], kind="stable").drop_duplicates("index")

    linked = pd.Series(
        ("arrested:" + nearest["apprehension_state_filled_in"].astype("object")).to_numpy(),
        index=nearest["index"].to_numpy(),
    )
    edges.loc[edges["is_first"], "in_key"] = UNLINKED_ARRIVAL
    edges.loc[linked.index, "in_key"] = linked
    return edges


def build_endpoints(master: pd.DataFrame, referenced_codes: set, volume: dict) -> dict:
    """Name, coordinates, kind, and traffic for every facility code an edge points at."""
    endpoints = {}
    for row in master.itertuples():
        code = row.detention_facility_code
        if code not in referenced_codes:
            continue
        if pd.isna(row.longitude) or pd.isna(row.latitude):
            continue
        lon, lat = float(row.longitude), float(row.latitude)
        if not in_bounds(lon, lat):
            continue
        kind = (
            "processing"
            if str(row.type_detailed).strip().upper() in PROCESSING_TYPES
            else "detention"
        )
        endpoints.setdefault(
            code,
            {
                "name": enrich.display_name(str(row.name)),
                "lon": round(lon, 5),
                "lat": round(lat, 5),
                "kind": kind,
                "stints": int(volume.get(code, 0)),
            },
        )
    return endpoints


def collapse_unlocated(keys: pd.Series, located: set) -> pd.Series:
    """Rewrite transfers to facilities we cannot plot onto one shared key."""
    transfers = keys.str.startswith("transfer:", na=False)
    codes = keys.where(transfers).str.slice(len("transfer:"))
    unlocated = transfers & ~codes.isin(located) & (codes != "unknown")
    return keys.mask(unlocated, NO_LOCATION_TRANSFER)


def aggregate(frame: pd.DataFrame, key_column: str, month_column: str) -> list[dict]:
    """Counts per edge key, with a monthly breakdown, sorted by count then key."""
    months = frame[month_column].dt.strftime("%Y-%m")
    grouped = frame.groupby([frame[key_column], months], sort=False).size()
    rows = {}
    for (key, month), count in grouped.items():
        entry = rows.setdefault(key, {"key": key, "count": 0, "months": []})
        entry["count"] += int(count)
        entry["months"].append([month, int(count)])
    for entry in rows.values():
        entry["months"].sort()
    return sorted(rows.values(), key=lambda entry: (-entry["count"], entry["key"]))


def processing_codes(master: pd.DataFrame) -> set:
    """Hold rooms and staging sites we can plot, which never reach the ADP snapshot."""
    codes = set()
    for row in master.itertuples():
        if str(row.type_detailed).strip().upper() not in PROCESSING_TYPES:
            continue
        if pd.isna(row.longitude) or pd.isna(row.latitude):
            continue
        if in_bounds(float(row.longitude), float(row.latitude)):
            codes.add(row.detention_facility_code)
    return codes


def build(stints_path, arrests_path, master: pd.DataFrame, mapped_codes: set, out_dir) -> dict:
    """Write per-facility flow files and return the match-report block."""
    countries = load_reference("countries.json")
    states = load_reference("states.json")

    stints = read_columns(stints_path, STINT_COLUMNS)
    edges = build_edges(stints, countries)
    del stints
    edges = link_arrests(edges, read_columns(arrests_path, ARREST_COLUMNS), states)

    window_start = pd.Timestamp(WINDOW_START, tz="UTC")
    activity = pd.concat([edges["book_in_date_time"], edges["book_out_date_time"].dropna()])
    window_end = data_through(activity) + pd.Timedelta(days=1)
    as_of = str((window_end - pd.Timedelta(days=1)).date())

    # Processing sites get their own board too: they are not on the population
    # map, but people are moved through them and that movement is countable.
    sites = processing_codes(master)
    written_codes = set(mapped_codes) | sites
    at_mapped = edges["detention_facility_code"].isin(mapped_codes)
    at_written = edges["detention_facility_code"].isin(written_codes)
    in_window = edges["book_in_date_time"].between(window_start, window_end, inclusive="left")
    out_window = edges["book_out_date_time"].between(window_start, window_end, inclusive="left")
    arrivals = edges[at_written & in_window]
    departures = edges[at_written & edges["out_key"].notna() & out_window]

    referenced, volume = set(), {}
    for keys in (arrivals["in_key"], departures["out_key"]):
        codes = keys[keys.str.startswith("transfer:", na=False)].str.slice(len("transfer:"))
        referenced |= set(codes.unique()) - {"unknown"}
        for code, count in codes.value_counts().items():
            volume[code] = volume.get(code, 0) + int(count)
    endpoints = build_endpoints(master, referenced, volume)
    located = set(endpoints)

    arrivals = arrivals.assign(in_key=collapse_unlocated(arrivals["in_key"], located))
    departures = departures.assign(out_key=collapse_unlocated(departures["out_key"], located))

    # A facility that drops out of the snapshot would otherwise leave its file
    # behind, and the frontend would serve those stale counts forever.
    flows_dir = pathlib.Path(out_dir) / "flows"
    flows_dir.mkdir(parents=True, exist_ok=True)
    for stale in flows_dir.glob("*.json"):
        stale.unlink()
    (flows_dir / "endpoints.json").write_text(
        json.dumps({"as_of": as_of, "facilities": endpoints}, separators=(",", ":"))
    )
    for name in ("states.json", "countries.json"):
        (flows_dir / name).write_text(json.dumps(load_reference(name), separators=(",", ":")))

    arrivals_by_facility = dict(tuple(arrivals.groupby("detention_facility_code", observed=True)))
    departures_by_facility = dict(tuple(departures.groupby("detention_facility_code", observed=True)))

    written_facilities, coverage_rates = [], []
    for detloc in sorted(written_codes):
        facility_in = arrivals_by_facility.get(detloc)
        facility_out = departures_by_facility.get(detloc)
        if facility_in is None and facility_out is None:
            continue
        in_rows = aggregate(facility_in, "in_key", "book_in_date_time") if facility_in is not None else []
        out_rows = aggregate(facility_out, "out_key", "book_out_date_time") if facility_out is not None else []
        first_arrivals = int(facility_in["is_first"].sum()) if facility_in is not None else 0
        linked = (
            int(facility_in["in_key"].str.startswith("arrested:").sum())
            if facility_in is not None
            else 0
        )
        if first_arrivals and detloc in mapped_codes:
            coverage_rates.append(linked / first_arrivals)
        payload = {
            "detloc": detloc,
            "as_of": as_of,
            "window": [WINDOW_START, as_of],
            "totals": {
                "in": sum(row["count"] for row in in_rows),
                "out": sum(row["count"] for row in out_rows),
            },
            "coverage": {
                "origin_linked": round(linked / first_arrivals, 3) if first_arrivals else None,
                "origin_linked_of": first_arrivals,
            },
            "in": in_rows,
            "out": out_rows,
        }
        (flows_dir / f"{detloc}.json").write_text(json.dumps(payload, separators=(",", ":")))
        written_facilities.append(detloc)

    mapped_arrivals = arrivals[arrivals["detention_facility_code"].isin(mapped_codes)]
    mapped_departures = departures[departures["detention_facility_code"].isin(mapped_codes)]
    out_families = mapped_departures["out_key"].str.split(":").str[0]
    total_out = len(mapped_departures)
    total_first = int(mapped_arrivals["is_first"].sum())
    unmapped = mapped_departures["unmapped_country"].dropna()
    return {
        "as_of": as_of,
        "window_start": WINDOW_START,
        "facilities_written": len(written_facilities),
        "stints_at_mapped_facilities": int(at_mapped.sum()),
        "book_ins_in_window": len(mapped_arrivals),
        "book_outs_in_window": total_out,
        "out_families": {
            str(family): int(count) for family, count in out_families.value_counts().items()
        },
        "unknown_shares": {
            "transfer_unknown": _share(mapped_departures["out_key"].eq(UNKNOWN_TRANSFER).sum(), total_out),
            "transfer_no_location": _share(
                mapped_departures["out_key"].eq(NO_LOCATION_TRANSFER).sum(), total_out
            ),
            "removed_unknown": _share(mapped_departures["out_key"].eq("removed:unknown").sum(), total_out),
            "not_reported": _share(mapped_departures["out_key"].eq(NOT_REPORTED).sum(), total_out),
        },
        "endpoints": {
            "referenced": len(referenced),
            "with_coordinates": len(endpoints),
            "coordinate_share": _share(len(endpoints), len(referenced)),
            "processing_boards_written": len(sites & set(written_facilities)),
            "processing_sites": sum(
                1 for entry in endpoints.values() if entry["kind"] == "processing"
            ),
            "stints_via_processing_sites": sum(
                entry["stints"] for entry in endpoints.values() if entry["kind"] == "processing"
            ),
            "off_map_endpoints": sum(1 for code in endpoints if code not in mapped_codes),
        },
        "arrest_link_rate": {
            "national": _share(
                mapped_arrivals["in_key"].str.startswith("arrested:").sum(), total_first
            ),
            "median_facility": round(pd.Series(coverage_rates).median(), 3) if coverage_rates else None,
            "facilities_measured": len(coverage_rates),
        },
        "unmapped_departure_countries": {
            str(name): int(count) for name, count in unmapped.value_counts().head(20).items()
        },
    }


def _share(part, whole) -> float | None:
    return round(float(part) / whole, 4) if whole else None
