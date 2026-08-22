# ICE Detention Map

An interactive public-transparency map of U.S. immigration detention facilities. Each facility is drawn as a circle sized by its average daily detained population and colored by facility type, with per-facility population history back to 2019.

## Data

All data comes from the [Deportation Data Project](https://deportationdata.org) (CC0):

- **Facility identity and coordinates** — [`deportationdata/ice-detention-facilities`](https://github.com/deportationdata/ice-detention-facilities): facility master with ICE facility codes (DETLOC) and manually verified geocoding, plus a dated name→code crosswalk.
- **Populations** — [`deportationdata/ice-detention-management`](https://github.com/deportationdata/ice-detention-management): ICE's Detention Management spreadsheets parsed into a single time series (snapshots since October 2019).
- **Flows** — [`deportationdata/ice`](https://github.com/deportationdata/ice): individual-level detention stints and ICE arrests, since October 2022. These records lag the population figures; the window the current build covers is `flows.window_start` → `flows.as_of` in `web/public/data/match_report.json`.

The population figure is ICE's **average daily population, fiscal-year-to-date** — not a point-in-time headcount. Snapshots only include facilities holding at least one person on the pull date and exclude hold rooms and medical facilities. ICE's publication cadence became irregular in 2026, so the map displays the snapshot date prominently.

### Flows

Selecting a facility draws where the people held there came from and where they went next. Every stint has exactly one way in and one way out, so the board in the panel always sums to that facility's book-ins and book-outs inside the data window — the map is a view of the board, not a separate calculation. Counts are **stints, not people**: someone moved three times appears three times.

Departures come from ICE's own release reason: a transfer to the next facility in the stay, a removal to a named country, or a release into the community. **Releases have no destination in ICE's data**, so they are drawn leaving the gate and stopping rather than travelling somewhere invented. Arrivals are transfers from another facility, or an ICE arrest matched to the same person within 10 days before or 5 days after book-in. That match only reaches ICE's *interior* arrests by ERO — people apprehended by CBP at the border are absent from the arrest data, so the link rate is low nationally and high at interior facilities — `flows.arrest_link_rate` in the match report carries the current national and median-facility figures (28% and 76% as of the March 2026 data). Each board states its own coverage, and the unlinked remainder is always an explicit row.

State and country centroids are committed under `pipeline/reference/`; a departure country or apprehension state missing from those tables degrades to an explicit "not recorded" row and is listed in the match report rather than guessed. See `pipeline/flows.py` and the `flows` block in `web/public/data/match_report.json`.

### Facility detail sources

The detail panel adds, per facility: ICE threat-level classification, mandatory-detention share, average length of stay, inspection results, peak population and days in use (all from the same DDP-processed ICE data); deaths in custody from [UCLA Law's Behind Bars Data Project](https://github.com/uclalawbehindbars/ICE_custody_mortality) (matched by ICE facility code); operators verified across [Wikipedia](https://en.wikipedia.org/wiki/List_of_immigrant_detention_sites_in_the_United_States) (CC BY-SA 4.0) and [OpenStreetMap](https://www.openstreetmap.org) (ODbL) or the facility's own name; and ICE's official facility pages, photos, and ODO inspection reports. Every value passes a validation rule or is omitted for that facility — see `pipeline/enrich.py` and the `enrichment_coverage` block in `web/public/data/match_report.json`.

External reference data lives in `pipeline/reference/` and is refreshed manually with the scripts in `pipeline/scrapers/` (they read ice.gov through the Wayback Machine, since ice.gov blocks datacenter traffic). The weekly refresh workflow only re-pulls DDP and UCLA data.

## Structure

- `pipeline/` — Python build step that downloads the source data, joins populations to the facility master, validates totals, enriches each facility, and emits the static artifacts the site serves (`web/public/data/`). `scrapers/` and `reference/` hold the manually refreshed external data.
- `web/` — Vite + React + TypeScript + Chakra UI + MapLibre GL frontend. Static site, no backend.
- `.github/workflows/refresh-data.yml` — scheduled data refresh that opens a PR when new ICE data lands.

## Development

```bash
# Pipeline
cd pipeline
pip install -r requirements.txt
python build_data.py

# Frontend
cd web
yarn
yarn dev
```
