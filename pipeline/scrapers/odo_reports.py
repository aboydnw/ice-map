"""Scrape the ICE Office of Detention Oversight (ODO) facility inspection index.

ice.gov blocks direct requests from some hosts, so this reads the most recent
successful Wayback Machine capture of
https://www.ice.gov/foia/odo-facility-inspections instead. Every PDF link on
the page becomes one record. Link text looks like
"2026 Buffalo (Batavia) SPC, Batavia, NY - Jun. 3-5, 2026" and is parsed into
facility, city, state, month and an approximate ISO date. Records whose text
cannot be parsed are kept with null fields rather than dropped.

Run: python3 pipeline/scrapers/odo_reports.py [--spot-check N]

Writes pipeline/reference/odo_reports.json, newest first. With --spot-check,
also queries the Wayback CDX API for N PDF URLs from the two most recent years
and reports how many are archived.
"""

import argparse
import datetime
import json
import pathlib
import re
import sys
import time
from html.parser import HTMLParser

import requests

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT_PATH = REPO_ROOT / "pipeline" / "reference" / "odo_reports.json"

INDEX_URL = "https://www.ice.gov/foia/odo-facility-inspections"
CDX_URL = "https://web.archive.org/cdx/search/cdx"
WAYBACK_RAW = "https://web.archive.org/web/{ts}id_/{url}"

USER_AGENT = "ice-map-odo-scraper/1.0 (+https://github.com/aboydnw/ice-map)"
REQUEST_PAUSE_SECONDS = 0.5
MAX_ATTEMPTS = 5
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}
MONTH_ABBREV = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTH_TOKEN = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"

DATE_TAIL_RE = re.compile(rf"\s+[-–—]\s*(?P<tail>{MONTH_TOKEN}[a-z]*[.,]?\s*\d.*)$", re.IGNORECASE)
LEADING_YEAR_RE = re.compile(r"^(?:FY\s*)?(?P<year>(?:19|20)\d{2})\s+(?P<rest>.+)$")
FIRST_YEAR_RE = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
MONTH_DAY_RE = re.compile(rf"(?P<month>{MONTH_TOKEN})[a-z]*[.,]?\s*(?P<day>\d{{1,2}})?", re.IGNORECASE)
FILENAME_YEAR_RE = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")

PLACE_PATTERNS = [
    re.compile(r"^(?P<facility>.+?),\s*(?P<city>[^,]+?),\s*(?P<state>[A-Z][A-Za-z])\.?$"),
    re.compile(r"^(?P<facility>.+?)\s+[-–—]\s+(?P<city>[^,]+?),\s*(?P<state>[A-Z][A-Za-z])\.?$"),
    re.compile(r"^(?P<facility>.+?),\s*(?P<city>[^,]+?)\s+(?P<state>[A-Z]{2})\.?$"),
    re.compile(r"^(?P<facility>.+?),\s*(?P<state>[A-Z][A-Za-z])\.?$"),
]


class PdfLinkCollector(HTMLParser):
    """Collect (href, text) pairs for every anchor whose href ends in .pdf."""

    def __init__(self):
        super().__init__()
        self.links = []
        self._href = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href") or ""
        if href.lower().split("?")[0].endswith(".pdf"):
            self._href = href
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, "".join(self._text)))
            self._href = None
            self._text = []


def fetch(session: requests.Session, url: str, params: dict | None = None) -> requests.Response:
    """GET with a polite pause and exponential backoff on transient failures."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            response = session.get(url, params=params, timeout=60)
            if response.status_code not in RETRYABLE_STATUSES:
                response.raise_for_status()
                return response
            reason = f"HTTP {response.status_code}"
        except requests.RequestException as exc:
            reason = str(exc)
        if attempt == MAX_ATTEMPTS:
            raise RuntimeError(f"gave up on {url}: {reason}")
        wait = 2**attempt
        print(f"  retry {attempt}/{MAX_ATTEMPTS} for {url} after {reason}; sleeping {wait}s", file=sys.stderr)
        time.sleep(wait)
    raise AssertionError("unreachable")


def cdx_captures(session: requests.Session, url: str, from_year: int | None = None) -> list[tuple[str, str]]:
    """Return (timestamp, statuscode) pairs for every Wayback capture of url."""
    params = {"url": url, "output": "txt", "fl": "timestamp,statuscode"}
    if from_year:
        params["from"] = str(from_year)
    body = fetch(session, CDX_URL, params=params).text
    captures = []
    for line in body.splitlines():
        parts = line.split()
        if len(parts) == 2:
            captures.append((parts[0], parts[1]))
    return captures


def latest_ok_capture(session: requests.Session, url: str, from_year: int) -> str:
    """Timestamp of the most recent HTTP 200 capture of url."""
    ok = [ts for ts, status in cdx_captures(session, url, from_year) if status == "200"]
    if not ok:
        raise RuntimeError(f"no 200 captures of {url} since {from_year}")
    return max(ok)


def normalize_pdf_url(href: str) -> str:
    """Strip Wayback prefixes and force the canonical https ice.gov host."""
    match = re.search(r"https?://(?:www\.)?ice\.gov/.*$", href)
    if match:
        return "https://www.ice.gov/" + match.group(0).split("ice.gov/", 1)[1]
    if href.startswith("/"):
        return "https://www.ice.gov" + href
    return href


def clean_text(text: str) -> str:
    """Collapse whitespace, including non-breaking spaces, in link text."""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def parse_place(head: str) -> dict:
    """Split 'Facility, City, ST' into its parts, tolerating missing pieces."""
    head = head.strip(" ,")
    for pattern in PLACE_PATTERNS:
        match = pattern.match(head)
        if match:
            groups = match.groupdict()
            return {
                "facility_text": groups["facility"].strip(" ,-–"),
                "city": (groups.get("city") or "").strip() or None,
                "state": groups["state"].upper(),
            }
    return {"facility_text": head or None, "city": None, "state": None}


def parse_date(tail: str, fallback_year: int | None) -> tuple[str | None, str | None]:
    """Return (month abbreviation, approximate ISO date) from a date tail."""
    match = MONTH_DAY_RE.search(tail)
    if not match:
        return None, None
    month_number = MONTHS[match.group("month").lower()]
    month = MONTH_ABBREV[month_number - 1]
    year_match = FIRST_YEAR_RE.search(tail)
    year = int(year_match.group(1)) if year_match else fallback_year
    if year is None:
        return month, None
    day = int(match.group("day")) if match.group("day") else 1
    try:
        return month, datetime.date(year, month_number, day).isoformat()
    except ValueError:
        return month, datetime.date(year, month_number, 1).isoformat()


def parse_entry(text: str, pdf_url: str) -> dict:
    """Parse one index link into the record schema, using nulls where parsing fails."""
    record = {
        "year": None,
        "facility_text": None,
        "city": None,
        "state": None,
        "month": None,
        "date_iso_approx": None,
        "pdf_url": pdf_url,
        "link_text": text,
    }
    head, tail = text, None
    date_match = DATE_TAIL_RE.search(text)
    if date_match:
        tail = date_match.group("tail")
        head = text[: date_match.start()]
    year_match = LEADING_YEAR_RE.match(head)
    if year_match:
        record["year"] = int(year_match.group("year"))
        head = year_match.group("rest")
    else:
        filename_year = FILENAME_YEAR_RE.search(pdf_url.rsplit("/", 1)[-1])
        if filename_year:
            record["year"] = int(filename_year.group(1))
    record.update(parse_place(head.strip()))
    if tail:
        record["month"], record["date_iso_approx"] = parse_date(tail, record["year"])
    return record


def scrape(session: requests.Session, from_year: int = 2025) -> list[dict]:
    """Fetch the latest archived index page and return parsed records, newest first."""
    ts = latest_ok_capture(session, INDEX_URL, from_year)
    print(f"using Wayback capture {ts}", file=sys.stderr)
    html = fetch(session, WAYBACK_RAW.format(ts=ts, url=INDEX_URL)).text
    collector = PdfLinkCollector()
    collector.feed(html)
    records = []
    seen = set()
    for href, text in collector.links:
        pdf_url = normalize_pdf_url(href)
        if pdf_url in seen:
            continue
        seen.add(pdf_url)
        record = parse_entry(clean_text(text), pdf_url)
        record["index_snapshot_ts"] = ts
        records.append(record)
    records.sort(key=lambda r: (r["year"] or 0, r["date_iso_approx"] or "", r["link_text"]), reverse=True)
    return records


def spot_check_archive(session: requests.Session, records: list[dict], count: int) -> list[tuple[str, bool]]:
    """Check whether the newest `count` PDFs have any Wayback capture."""
    years = sorted({r["year"] for r in records if r["year"]}, reverse=True)[:2]
    candidates = [r for r in records if r["year"] in years][:count]
    results = []
    for record in candidates:
        captures = cdx_captures(session, record["pdf_url"])
        archived = any(status == "200" for _, status in captures)
        results.append((record["pdf_url"], archived))
    return results


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spot-check", type=int, default=0, metavar="N", help="verify N recent PDFs are archived")
    parser.add_argument("--from-year", type=int, default=2025, help="earliest index capture year to consider")
    args = parser.parse_args()

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    records = scrape(session, args.from_year)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n")

    failures = sum(1 for r in records if r["state"] is None or r["month"] is None)
    by_year = {}
    for record in records:
        by_year[record["year"]] = by_year.get(record["year"], 0) + 1
    print(f"wrote {len(records)} records to {OUT_PATH}")
    print(f"records missing state or month: {failures}")
    print("per-year counts:", json.dumps(dict(sorted(by_year.items(), key=lambda kv: str(kv[0])))))

    if args.spot_check:
        results = spot_check_archive(session, records, args.spot_check)
        archived = sum(1 for _, ok in results if ok)
        print(f"archive spot-check: {archived}/{len(results)} recent PDFs have a Wayback capture")
        for url, ok in results:
            print(f"  {'archived' if ok else 'MISSING '}  {url}")


if __name__ == "__main__":
    main()
