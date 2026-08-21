"""Collect candidate facility-operator data from two independent sources.

Neither source is joined to the other or to the DDP facility master here; the
rows are saved side by side so the pipeline can verify them later.

- Wikipedia, "List of immigrant detention sites in the United States"
  (CC BY-SA 4.0). The FY2026 "ICE Detention Facilities in FY26" wikitable is
  parsed from raw wikitext fetched through the MediaWiki API.
- OpenStreetMap via the Overpass API (ODbL). US prisons and detention sites
  that carry an ``operator`` tag, plus any element whose operator names ICE or
  a major private detention contractor.

Writes pipeline/reference/operators_candidates.json.

Usage: python3 pipeline/scrapers/operators.py
"""

import collections
import datetime
import json
import pathlib
import re

import requests

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT_PATH = REPO_ROOT / "pipeline" / "reference" / "operators_candidates.json"

USER_AGENT = "ice-map-pipeline/0.1 (https://github.com/aboydnw/ice-map; anthony.n.boyd@gmail.com)"

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_PAGE = "List_of_immigrant_detention_sites_in_the_United_States"
WIKI_TABLE_CAPTION = "ICE Detention Facilities in FY26"
WIKI_COLUMNS = {
    "Facility Name": "name",
    "Status (year)": "status",
    "City": "city",
    "State": "state",
    "Facility Type": "facility_type",
    "Authority": "authority",
    "Management": "management",
    "Average Daily Population": "adp",
    "Minimum Capacity": "min_capacity",
    "Demographics": "demographics",
}
WIKI_NUMERIC_COLUMNS = {"adp", "min_capacity"}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_QUERY = r"""
[out:json][timeout:180];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr["amenity"="prison"]["operator"](area.us);
  nwr["amenity"="detention"]["operator"](area.us);
  nwr["prison"]["operator"](area.us);
  nwr["operator"~"Immigration (and|&) Customs Enforcement|^ICE$|^ICE[ ]*[-(]"](area.us);
  nwr["operator"~"GEO Group|CoreCivic|Corrections Corporation of America|LaSalle (Correction|Management)|Management (&|and) Training Corp|\\bAkima\\b|\\bAhtna\\b|\\bAmentum\\b",i](area.us);
);
out center tags;
"""
OSM_DETENTION_OPERATOR = re.compile(
    r"Immigration (and|&) Customs Enforcement|^ICE$|^ICE\s*[-(]"
    r"|(?i:GEO Group|CoreCivic|Corrections Corporation of America|LaSalle (Correction|Management)"
    r"|Management (&|and) Training Corp|\bAkima\b|\bAhtna\b|\bAmentum\b)"
)
OSM_TAGS = ["name", "operator", "operator:wikidata", "wikidata", "brand", "amenity"]

US_STATES = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
    "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE",
    "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI", "IDAHO": "ID",
    "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS",
    "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS",
    "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
    "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
    "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT",
    "VERMONT": "VT", "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI", "WYOMING": "WY", "DISTRICT OF COLUMBIA": "DC",
    "WASHINGTON, D.C.": "DC", "WASHINGTON D.C.": "DC", "PUERTO RICO": "PR",
    "GUAM": "GU", "NORTHERN MARIANA ISLANDS": "MP", "U.S. VIRGIN ISLANDS": "VI",
    "VIRGIN ISLANDS": "VI", "AMERICAN SAMOA": "AS",
}


def today() -> str:
    return datetime.date.today().isoformat()


def fetch_wikitext(page: str) -> tuple[str, int]:
    """Return the current wikitext and revision id of a Wikipedia page."""
    params = {
        "action": "parse",
        "page": page,
        "prop": "wikitext|revid",
        "format": "json",
    }
    response = requests.get(WIKI_API, params=params, headers={"User-Agent": USER_AGENT}, timeout=60)
    response.raise_for_status()
    parsed = response.json()["parse"]
    return parsed["wikitext"]["*"], parsed["revid"]


def strip_markup(cell: str) -> str:
    """Reduce a wikitext table cell to plain text."""
    text = re.sub(r"<ref[^>/]*/>", "", cell)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.DOTALL)
    while "{{" in text:
        stripped = re.sub(r"\{\{[^{}]*\}\}", "", text)
        if stripped == text:
            break
        text = stripped
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[https?://\S+\s*([^\]]*)\]", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("'''", "").replace("''", "").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def find_table(wikitext: str, caption: str) -> str:
    """Return the body of the first wikitable whose caption contains the text."""
    for match in re.finditer(r"\{\|.*?\n\|\}", wikitext, flags=re.DOTALL):
        table = match.group(0)
        caption_match = re.search(r"^\|\+(.*)$", table, flags=re.MULTILINE)
        if caption_match and caption in caption_match.group(1):
            return table
    raise ValueError(f"No wikitable with caption containing {caption!r}")


def split_cells(line: str, marker: str) -> list[str]:
    """Split a header or data line into cells, dropping per-cell attributes."""
    separator = "!!" if marker == "!" else "||"
    cells = []
    for cell in line[1:].split(separator):
        if re.match(r"^\s*[A-Za-z]+=[^|]*\|(?!\|)", cell):
            cell = cell.split("|", 1)[1]
        cells.append(cell)
    return cells


def parse_wikitable(table: str) -> tuple[list[str], list[list[str]]]:
    """Parse a simple wikitable into header labels and raw row cells."""
    headers: list[str] = []
    rows: list[list[str]] = []
    current: list[str] = []
    for line in table.split("\n")[1:]:
        if line.startswith("|}"):
            break
        if line.startswith("|+"):
            continue
        if line.startswith("|-"):
            if current:
                rows.append(current)
            current = []
        elif line.startswith("!"):
            headers.extend(strip_markup(c) for c in split_cells(line, "!"))
        elif line.startswith("|"):
            current.extend(split_cells(line, "|"))
        elif current:
            current[-1] += "\n" + line
    if current:
        rows.append(current)
    return headers, rows


def normalize_state(value: str) -> str:
    """Map a state name or code to its 2-letter postal code."""
    text = value.strip()
    if re.fullmatch(r"[A-Za-z]{2}", text):
        return text.upper()
    return US_STATES.get(text.upper(), text)


def to_int(value: str) -> int | None:
    digits = value.replace(",", "").strip()
    return int(digits) if re.fullmatch(r"\d+", digits) else None


def wikipedia_rows(table: str) -> list[dict]:
    """Convert the FY26 facility wikitable into normalized row dicts."""
    headers, raw_rows = parse_wikitable(table)
    keys = [WIKI_COLUMNS.get(h, re.sub(r"[^a-z0-9]+", "_", h.lower()).strip("_")) for h in headers]
    rows = []
    for raw in raw_rows:
        cells = [strip_markup(c) for c in raw]
        cells += [""] * (len(keys) - len(cells))
        row = dict(zip(keys, cells))
        if not row.get("name"):
            continue
        row["state"] = normalize_state(row.get("state", ""))
        for key in WIKI_NUMERIC_COLUMNS:
            if key in row:
                row[key] = to_int(row[key])
        rows.append(row)
    return rows


def collect_wikipedia() -> dict:
    """Fetch and parse the Wikipedia FY26 facility table."""
    wikitext, revid = fetch_wikitext(WIKI_PAGE)
    table = find_table(wikitext, WIKI_TABLE_CAPTION)
    return {
        "page": WIKI_PAGE,
        "revision_id": revid,
        "retrieved": today(),
        "license": "CC BY-SA 4.0",
        "url": f"https://en.wikipedia.org/wiki/{WIKI_PAGE}",
        "tables_parsed": [WIKI_TABLE_CAPTION],
        "rows": wikipedia_rows(table),
    }


def fetch_overpass(query: str) -> list[dict]:
    """Run an Overpass QL query and return its elements."""
    response = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": USER_AGENT},
        timeout=300,
    )
    response.raise_for_status()
    return response.json()["elements"]


def is_detention_element(tags: dict) -> bool:
    """Keep prisons/detention sites, or named non-amenity features run by a known detention operator."""
    if tags.get("amenity") in {"prison", "detention"} or "prison" in tags:
        return True
    if "amenity" in tags or not tags.get("name"):
        return False
    return bool(OSM_DETENTION_OPERATOR.search(tags.get("operator", "")))


def osm_row(element: dict) -> dict:
    tags = element.get("tags", {})
    center = element.get("center", element)
    row = {tag.replace(":", "_"): tags.get(tag) for tag in OSM_TAGS}
    row.update(
        {
            "lat": center.get("lat"),
            "lon": center.get("lon"),
            "osm_id": element["id"],
            "osm_type": element["type"],
        }
    )
    return row


def collect_osm() -> dict:
    """Fetch US detention-related OSM elements that carry an operator tag."""
    elements = fetch_overpass(OVERPASS_QUERY)
    rows = [osm_row(e) for e in elements if is_detention_element(e.get("tags", {}))]
    rows.sort(key=lambda r: (r["osm_type"], r["osm_id"]))
    return {
        "retrieved": today(),
        "license": "ODbL",
        "attribution": "© OpenStreetMap contributors",
        "query": OVERPASS_QUERY.strip(),
        "rows": rows,
    }


def summarize(data: dict) -> None:
    wiki = data["wikipedia"]["rows"]
    osm = data["osm"]["rows"]
    print(f"wikipedia: {len(wiki)} rows (revision {data['wikipedia']['revision_id']})")
    for value, count in collections.Counter(r.get("management") or "" for r in wiki).most_common():
        print(f"  {count:4d}  {value or '(blank)'}")
    print(f"osm: {len(osm)} rows")
    for value, count in collections.Counter(r.get("operator") for r in osm).most_common(15):
        print(f"  {count:4d}  {value}")


def main() -> None:
    data = {"wikipedia": collect_wikipedia(), "osm": collect_osm()}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    summarize(data)
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
