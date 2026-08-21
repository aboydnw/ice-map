"""Collect ICE's official facility page, phone numbers, and photo per facility.

ice.gov blocks this datacenter, so everything is read through the Wayback
Machine. Two archived sources are combined:

- Facility detail pages (ice.gov/detain/detention-facilities/<slug>) carry the
  name, address, facility phone, field office phone, and field office name.
- The paginated list (ice.gov/detention-facilities?page=N) carries one card
  per facility with the photo; cards link to the detail slug, which is the
  join key.

Wayback's ``id_`` replay mode returns the originally captured bytes, which ICE
serves gzip-compressed, so responses are decompressed here before parsing.

Writes:

- pipeline/reference/ice_site.json  — one record per facility slug
- web/public/photos/<slug>.jpg      — resized card photo, when archived
"""

import argparse
import gzip
import html
import io
import json
import pathlib
import re
import sys
import time
from urllib.parse import urlsplit

import requests
from PIL import Image

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_JSON = REPO_ROOT / "pipeline" / "reference" / "ice_site.json"
PHOTO_DIR = REPO_ROOT / "web" / "public" / "photos"

CDX_API = "http://web.archive.org/cdx/search/cdx"
WAYBACK_RAW = "https://web.archive.org/web/{timestamp}id_/{url}"
FACILITY_PREFIX = "https://www.ice.gov/detain/detention-facilities/"
LIST_URL = "https://www.ice.gov/detention-facilities"
ICE_ORIGIN = "https://www.ice.gov"

USER_AGENT = "ice-map scraper (github.com/aboydnw/ice-map)"
REQUEST_DELAY = 0.5
MAX_ATTEMPTS = 5
PHOTO_MAX_WIDTH = 640
PHOTO_QUALITY = 70
MAX_LIST_PAGES = 20

TITLE_RE = re.compile(r"<title>(.*?)\s*\|\s*ICE</title>", re.S)
FIELD_OFFICE_RE = re.compile(
    r'field--name-field-field-office-name[^>]*>\s*(.*?)\s*</div>', re.S
)
FACILITY_PHONE_RE = re.compile(r"Facility Main Phone:\s*([^<]+)")
FIELD_OFFICE_PHONE_RE = re.compile(r"Field Office Main Phone:\s*([^<]+)")
ADDRESS_PART_RE = re.compile(
    r'<span class="(address-line1|address-line2|locality|administrative-area|postal-code)">(.*?)</span>',
    re.S,
)
CARD_RE = re.compile(r'<li class="grid">(.*?)</li>', re.S)
CARD_IMG_RE = re.compile(r'views-field-field-image-file.*?<img[^>]*src="([^"]+)"', re.S)
CARD_SLUG_RE = re.compile(r'href="/detain/detention-facilities/([^"/?#]+)')


class WaybackClient:
    """Polite HTTP client for the Wayback Machine with retry and backoff."""

    def __init__(self, delay: float = REQUEST_DELAY):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.last_request = 0.0

    def get(self, url: str, params: dict | None = None) -> requests.Response | None:
        """Fetch a URL, retrying on 429/5xx and returning None on a final 4xx."""
        for attempt in range(MAX_ATTEMPTS):
            self._pause()
            try:
                response = self.session.get(url, params=params, timeout=60)
            except requests.RequestException as exc:
                print(f"  retry {attempt + 1}: {exc}", file=sys.stderr)
                time.sleep(2**attempt)
                continue
            if response.status_code == 200:
                return response
            if response.status_code == 429 or response.status_code >= 500:
                time.sleep(2**attempt)
                continue
            return None
        return None

    def _pause(self) -> None:
        elapsed = time.monotonic() - self.last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self.last_request = time.monotonic()

    def cdx(self, url_pattern: str, **extra: str) -> list[list[str]]:
        """Query the CDX index and return rows of (original, timestamp)."""
        params = {
            "url": url_pattern,
            "output": "txt",
            "fl": "original,timestamp",
            "filter": "statuscode:200",
            **extra,
        }
        response = self.get(CDX_API, params=params)
        if response is None:
            return []
        return [line.split() for line in response.text.splitlines() if line.strip()]

    def raw(self, original_url: str, timestamp: str) -> bytes | None:
        """Fetch the originally captured bytes of a URL, decompressing gzip."""
        response = self.get(WAYBACK_RAW.format(timestamp=timestamp, url=original_url))
        if response is None:
            return None
        body = response.content
        if body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
        return body


def clean_text(value: str) -> str:
    """Strip tags, unescape entities, and collapse whitespace."""
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def slug_from_url(url: str) -> str:
    """Return the final path segment of a facility page URL."""
    return urlsplit(url).path.rstrip("/").rsplit("/", 1)[-1]


def list_facility_captures(client: WaybackClient) -> dict[str, tuple[str, str]]:
    """Map each facility slug to its latest archived (url, timestamp)."""
    rows = client.cdx("ice.gov/detain/detention-facilities/*", **{"from": "2025"})
    captures: dict[str, tuple[str, str]] = {}
    for original, timestamp in rows:
        if "?" in original or not original.startswith(FACILITY_PREFIX):
            continue
        slug = slug_from_url(original)
        if not slug:
            continue
        if slug not in captures or timestamp > captures[slug][1]:
            captures[slug] = (original, timestamp)
    return captures


def parse_facility_page(page: str) -> dict:
    """Extract name, address, phones, and field office from a facility page."""
    title = TITLE_RE.search(page)
    parts = {key: clean_text(value) for key, value in ADDRESS_PART_RE.findall(page)}
    address = " ".join(
        p for p in (parts.get("address-line1"), parts.get("address-line2")) if p
    )
    field_office = FIELD_OFFICE_RE.search(page)
    facility_phone = FACILITY_PHONE_RE.search(page)
    field_office_phone = FIELD_OFFICE_PHONE_RE.search(page)
    return {
        "name": clean_text(title.group(1)) if title else "",
        "address": address or None,
        "city": parts.get("locality") or None,
        "state": parts.get("administrative-area") or None,
        "zip": parts.get("postal-code") or None,
        "facility_phone": clean_text(facility_phone.group(1)) if facility_phone else None,
        "field_office_phone": (
            clean_text(field_office_phone.group(1)) if field_office_phone else None
        ),
        "field_office": clean_text(field_office.group(1)) if field_office else None,
    }


def latest_list_capture(client: WaybackClient, page: int) -> str | None:
    """Return the newest successful capture timestamp for a list page."""
    url = LIST_URL if page == 0 else f"{LIST_URL}?page={page}"
    rows = client.cdx(url, **{"from": "2025", "limit": "-1"})
    timestamps = [timestamp for original, timestamp in rows if original == url]
    if page == 0:
        paged = client.cdx(f"{LIST_URL}?page=0", **{"from": "2025", "limit": "-1"})
        timestamps += [timestamp for _, timestamp in paged]
    return max(timestamps) if timestamps else None


def parse_cards(page: str) -> dict[str, str]:
    """Map facility slug to photo path for every card on a list page."""
    photos: dict[str, str] = {}
    for card in CARD_RE.findall(page):
        slug = CARD_SLUG_RE.search(card)
        image = CARD_IMG_RE.search(card)
        if slug and image:
            photos[slug.group(1)] = html.unescape(image.group(1))
    return photos


def collect_card_photos(client: WaybackClient) -> tuple[dict[str, tuple[str, str]], int]:
    """Walk the archived list pages and return slug -> (image url, timestamp)."""
    photos: dict[str, tuple[str, str]] = {}
    pages_parsed = 0
    for page in range(MAX_LIST_PAGES):
        timestamp = latest_list_capture(client, page)
        if timestamp is None:
            break
        url = LIST_URL if page == 0 else f"{LIST_URL}?page={page}"
        body = client.raw(url, timestamp)
        if body is None:
            print(f"  list page {page}: capture {timestamp} unavailable", file=sys.stderr)
            continue
        cards = parse_cards(body.decode("utf-8", errors="replace"))
        if not cards:
            break
        pages_parsed += 1
        for slug, src in cards.items():
            image_url = src if src.startswith("http") else ICE_ORIGIN + src
            photos.setdefault(slug, (image_url, timestamp))
        print(f"  list page {page} @ {timestamp}: {len(cards)} cards", file=sys.stderr)
    return photos, pages_parsed


def save_photo(raw: bytes, path: pathlib.Path) -> bool:
    """Resize image bytes to the web size and write a JPEG; False if unreadable."""
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except OSError:
        return False
    image = image.convert("RGB")
    if image.width > PHOTO_MAX_WIDTH:
        height = round(image.height * PHOTO_MAX_WIDTH / image.width)
        image = image.resize((PHOTO_MAX_WIDTH, height), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "JPEG", quality=PHOTO_QUALITY, optimize=True, progressive=True)
    return True


def fetch_photo(
    client: WaybackClient, slug: str, image_url: str, timestamp: str, force: bool
) -> str | None:
    """Download and store a facility photo, returning its repo-relative path."""
    path = PHOTO_DIR / f"{slug}.jpg"
    relative = str(path.relative_to(REPO_ROOT))
    if path.exists() and not force:
        return relative
    raw = client.raw(image_url, timestamp)
    if raw is None or not save_photo(raw, path):
        return None
    return relative


def is_valid(record: dict) -> bool:
    """Keep only records with a name and a two-letter state."""
    state = record.get("state") or ""
    return bool(record.get("name")) and bool(re.fullmatch(r"[A-Z]{2}", state))


def build(force_photos: bool) -> None:
    """Run the full scrape and write the reference JSON and photos."""
    client = WaybackClient()

    print("Listing facility page captures...", file=sys.stderr)
    captures = list_facility_captures(client)
    print(f"  {len(captures)} facility slugs", file=sys.stderr)

    print("Walking list pages for photos...", file=sys.stderr)
    card_photos, pages_parsed = collect_card_photos(client)
    print(f"  {len(card_photos)} cards with photos on {pages_parsed} pages", file=sys.stderr)

    for slug in card_photos:
        captures.setdefault(slug, (FACILITY_PREFIX + slug, "2026"))

    records = []
    unavailable = []
    for slug in sorted(captures):
        url, timestamp = captures[slug]
        body = client.raw(url, timestamp)
        if body is None:
            unavailable.append(slug)
            continue
        record = {"slug": slug, "url": url}
        record.update(parse_facility_page(body.decode("utf-8", errors="replace")))
        record["photo"] = None
        record["snapshot_ts"] = timestamp
        records.append(record)
    print(f"  {len(records)} facility pages parsed, {len(unavailable)} unavailable", file=sys.stderr)

    print("Fetching photos...", file=sys.stderr)
    missing_photo = []
    for record in records:
        slug = record["slug"]
        if slug not in card_photos:
            missing_photo.append(slug)
            continue
        image_url, timestamp = card_photos[slug]
        record["photo"] = fetch_photo(client, slug, image_url, timestamp, force_photos)
        if record["photo"] is None:
            missing_photo.append(slug)

    valid = [r for r in records if is_valid(r)]
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(valid, indent=2) + "\n")

    with_photo = sum(1 for r in valid if r["photo"])
    print(
        f"Wrote {len(valid)} records ({len(records) - len(valid)} dropped by validation), "
        f"{with_photo} with photos, to {OUT_JSON.relative_to(REPO_ROOT)}",
        file=sys.stderr,
    )
    if unavailable:
        print(f"  facility pages unavailable: {', '.join(unavailable)}", file=sys.stderr)
    if missing_photo:
        print(f"  no photo: {', '.join(missing_photo)}", file=sys.stderr)


def main() -> None:
    """Parse CLI flags and run the scraper."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--force-photos",
        action="store_true",
        help="re-download photos that already exist under web/public/photos",
    )
    args = parser.parse_args()
    build(force_photos=args.force_photos)


if __name__ == "__main__":
    main()
