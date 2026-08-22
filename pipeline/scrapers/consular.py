"""Build consular-district polygons from hand-validated county lists.

Foreign consulates in the United States publish their jurisdictions as lists
of counties, never as geometry. ``pipeline/reference/consular/<country>.json``
transcribes those lists with a source URL and date per consulate; this script
turns them into one dissolved polygon per consulate by joining the names to
the Census cartographic county boundaries.

Two rules keep the output honest:

- Every county name must resolve to exactly the Census rows it describes, or
  the build fails. A district is never drawn short because of a typo.
- The districts must partition the country: every county in the 50 states,
  DC, Puerto Rico, and the U.S. Virgin Islands belongs to exactly one
  consulate. Gaps and overlaps fail the build, which is what catches a stale
  source that still lists a county its neighbour has since taken over.

Run manually when a country's lists change (they change every few years, not
weekly). Needs ``geopandas`` on top of the pipeline requirements.

Writes:

- web/public/data/consular/<country>.geojson — one feature per consulate
- web/public/data/consular/index.json        — the country list the picker reads
"""

import argparse
import json
import pathlib
import re
import sys
import unicodedata
from collections import Counter

import geopandas as gpd
import requests
import shapely

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
REFERENCE_DIR = REPO_ROOT / "pipeline" / "reference" / "consular"
CACHE_DIR = REPO_ROOT / "pipeline" / "cache"
OUT_DIR = REPO_ROOT / "web" / "public" / "data" / "consular"

# The 2021 vintage is the last with Connecticut's eight counties; from 2022
# the Census files carry its nine planning regions, which no consulate list
# uses. Alaska's 2019 borough changes are already in.
CENSUS_URL = "https://www2.census.gov/geo/tiger/GENZ2021/shp/cb_2021_us_county_5m.zip"
CENSUS_ZIP = CACHE_DIR / "cb_2021_us_county_5m.zip"

COUNTRIES = [
    {"key": "mexico", "name": "Mexico", "reference": "mexico.json"},
]

# Territories without a listed consular jurisdiction are outside the partition.
OUTSIDE_PARTITION = {"AS", "GU", "MP"}

COORDINATE_PRECISION = 1e-4
MAX_COLORS = 6

SUFFIXES = (
    "county", "parish", "borough", "census area", "city and borough",
    "municipality", "municipio", "city", "independent city",
)


def fold(name: str) -> str:
    """Accent-, case-, punctuation-, and suffix-insensitive key for a county name."""
    text = unicodedata.normalize("NFD", str(name))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").lower()
    text = re.sub(r"\(.*?\)", " ", text)
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^(saint|ste|st) ", "st ", text)
    for suffix in sorted(SUFFIXES, key=len, reverse=True):
        if text.endswith(" " + suffix):
            text = text[: -len(suffix) - 1].strip()
            break
    return text.replace(" ", "")


def download_census() -> pathlib.Path:
    if CENSUS_ZIP.exists():
        return CENSUS_ZIP
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with requests.get(CENSUS_URL, timeout=300, stream=True) as response:
        response.raise_for_status()
        partial = CENSUS_ZIP.with_suffix(".partial")
        with partial.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 20):
                handle.write(chunk)
        partial.replace(CENSUS_ZIP)
    return CENSUS_ZIP


def load_counties() -> gpd.GeoDataFrame:
    """Census counties with a folded name key, in WGS84."""
    counties = gpd.read_file(f"zip://{download_census()}")
    counties = counties.to_crs(4326)
    counties["key"] = counties["NAME"].map(fold)
    return counties[["GEOID", "STUSPS", "NAME", "NAMELSAD", "key", "geometry"]]


def load_reference(filename: str) -> dict:
    return json.loads((REFERENCE_DIR / filename).read_text())


def load_aliases() -> dict[str, list[str]]:
    """Source spellings that do not fold onto a Census name, keyed ``ST|folded``."""
    raw = load_reference("county_aliases.json")
    return {key: value for key, value in raw.items() if not key.startswith("_")}


def resolve_state(
    state: str, spec, counties: gpd.GeoDataFrame, aliases: dict
) -> tuple[list[str], list[str]]:
    """Return (GEOIDs, problems) for one state entry of a consulate."""
    in_state = counties[counties["STUSPS"] == state]
    if in_state.empty:
        return [], [f"{state}: unknown state code"]
    if spec == "all":
        return sorted(in_state["GEOID"]), []
    by_key: dict[str, list[str]] = {}
    for row in in_state.itertuples():
        by_key.setdefault(row.key, []).append(row.GEOID)
    wanted = Counter(fold(name) for name in spec)
    spelled = {fold(name): name for name in spec}
    geoids: list[str] = []
    problems: list[str] = []
    # Aliases claim their counties first so that, e.g., "Ciudad de Baltimore"
    # takes Baltimore city and a plain "Baltimore" is left the county.
    for key in [k for k in wanted if f"{state}|{k}" in aliases]:
        geoids.extend(aliases[f"{state}|{key}"] * wanted.pop(key))
    for key, count in wanted.items():
        found = [g for g in by_key.get(key, []) if g not in geoids]
        if not found:
            problems.append(f"{state}: '{spelled[key]}' matches no county")
        elif len(found) != count:
            problems.append(
                f"{state}: '{spelled[key]}' listed {count}x but matches {len(found)} counties"
            )
        else:
            geoids.extend(found)
    return geoids, problems


def resolve(reference: dict, counties: gpd.GeoDataFrame, aliases: dict) -> dict[str, list[str]]:
    """Map consulate id -> GEOIDs, raising on any unresolved name."""
    assignments: dict[str, list[str]] = {}
    problems: list[str] = []
    for consulate in reference["consulates"]:
        geoids: list[str] = []
        for state, spec in consulate["counties"].items():
            found, issues = resolve_state(state, spec, counties, aliases)
            geoids.extend(found)
            problems.extend(f"{consulate['id']} {issue}" for issue in issues)
        assignments[consulate["id"]] = geoids
    if problems:
        raise ValueError("unresolved county names:\n  " + "\n  ".join(problems))
    return assignments


def check_partition(assignments: dict[str, list[str]], counties: gpd.GeoDataFrame) -> None:
    """Every county in the partition belongs to exactly one consulate."""
    universe = counties[~counties["STUSPS"].isin(OUTSIDE_PARTITION)]
    label = dict(zip(universe["GEOID"], universe["STUSPS"] + " " + universe["NAMELSAD"]))
    owners: dict[str, list[str]] = {}
    for consulate, geoids in assignments.items():
        for geoid in geoids:
            owners.setdefault(geoid, []).append(consulate)
    overlaps = {g: o for g, o in owners.items() if len(o) > 1}
    gaps = sorted(set(label) - set(owners))
    problems = []
    if overlaps:
        lines = [f"{label.get(g, g)}: {', '.join(o)}" for g, o in sorted(overlaps.items())]
        problems.append(f"{len(overlaps)} counties assigned twice:\n  " + "\n  ".join(lines))
    if gaps:
        lines = [label[g] for g in gaps]
        problems.append(f"{len(gaps)} counties unassigned:\n  " + "\n  ".join(lines))
    if problems:
        raise ValueError("\n".join(problems))


def color_districts(geometries: dict[str, shapely.Geometry]) -> dict[str, int]:
    """Greedy graph coloring so touching districts never share a fill."""
    ids = list(geometries)
    tree = shapely.STRtree([geometries[i] for i in ids])
    neighbours: dict[str, set[str]] = {i: set() for i in ids}
    for a, b in tree.query([geometries[i] for i in ids], predicate="intersects").T:
        if a != b:
            neighbours[ids[a]].add(ids[b])
    colors: dict[str, int] = {}
    for district in sorted(ids, key=lambda i: -len(neighbours[i])):
        used = {colors[n] for n in neighbours[district] if n in colors}
        colors[district] = next(c for c in range(MAX_COLORS + 1) if c not in used)
    if max(colors.values()) >= MAX_COLORS:
        raise ValueError(f"needed more than {MAX_COLORS} colors")
    return colors


def build_features(reference: dict, assignments: dict, counties: gpd.GeoDataFrame) -> list[dict]:
    by_geoid = counties.set_index("GEOID")["geometry"]
    geometries = {
        consulate["id"]: shapely.unary_union(by_geoid.loc[assignments[consulate["id"]]].values)
        for consulate in reference["consulates"]
    }
    colors = color_districts(geometries)
    features = []
    for consulate in reference["consulates"]:
        geometry = shapely.set_precision(geometries[consulate["id"]], COORDINATE_PRECISION)
        features.append(
            {
                "type": "Feature",
                "id": consulate["id"],
                "geometry": json.loads(shapely.to_geojson(geometry)),
                "properties": {
                    "id": consulate["id"],
                    "name": consulate["name"],
                    "city": consulate["city"],
                    "state": consulate["state"],
                    "county_count": len(assignments[consulate["id"]]),
                    "states": sorted(consulate["counties"]),
                    "source_url": consulate["source_url"],
                    "source_date": consulate["source_date"],
                    "color": colors[consulate["id"]],
                },
            }
        )
    return features


def build_country(country: dict, counties: gpd.GeoDataFrame, built: str, check_only: bool) -> dict:
    """Validate one country's lists and, unless checking only, write its GeoJSON."""
    reference = load_reference(country["reference"])
    assignments = resolve(reference, counties, load_aliases())
    check_partition(assignments, counties)
    dates = sorted(c["source_date"] for c in reference["consulates"])
    entry = {
        "key": country["key"],
        "name": country["name"],
        "file": f"{country['key']}.geojson",
        "districts": len(reference["consulates"]),
        "source": reference["source"],
        "source_dates": [dates[0], dates[-1]],
        "built": built,
    }
    if check_only:
        return entry
    features = build_features(reference, assignments, counties)
    collection = {"type": "FeatureCollection", "meta": entry, "features": features}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / entry["file"]).write_text(json.dumps(collection, separators=(",", ":")))
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="validate the lists without writing geometry")
    parser.add_argument("--built", default=None, help="build date to stamp (default: today, UTC)")
    args = parser.parse_args()
    built = args.built or __import__("datetime").datetime.now(__import__("datetime").UTC).date().isoformat()

    counties = load_counties()
    index = []
    for country in COUNTRIES:
        entry = build_country(country, counties, built, args.check)
        index.append(entry)
        print(f"{country['name']}: {entry['districts']} districts, sources {entry['source_dates'][0]} – {entry['source_dates'][1]}")
    if not args.check:
        (OUT_DIR / "index.json").write_text(json.dumps(index, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
