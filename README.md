# ICE Detention Map

An interactive public-transparency map of U.S. immigration detention facilities. Each facility is drawn as a circle sized by its average daily detained population and colored by facility type, with per-facility population history back to 2019.

## Data

All data comes from the [Deportation Data Project](https://deportationdata.org) (CC0):

- **Facility identity and coordinates** — [`deportationdata/ice-detention-facilities`](https://github.com/deportationdata/ice-detention-facilities): facility master with ICE facility codes (DETLOC) and manually verified geocoding, plus a dated name→code crosswalk.
- **Populations** — [`deportationdata/ice-detention-management`](https://github.com/deportationdata/ice-detention-management): ICE's Detention Management spreadsheets parsed into a single time series (snapshots since October 2019).

The population figure is ICE's **average daily population, fiscal-year-to-date** — not a point-in-time headcount. Snapshots only include facilities holding at least one person on the pull date and exclude hold rooms and medical facilities. ICE's publication cadence became irregular in 2026, so the map displays the snapshot date prominently.

### Consular districts

An optional overlay draws the jurisdiction of each foreign consulate in the United States — the area whose detained nationals that consulate is responsible for — with a country picker in the legend. Governments publish these only as lists of counties, so the polygons are built: each consulate's published list is joined to the Census cartographic county boundaries (`cb_2021_us_county_5m`) and dissolved. The lists live in `pipeline/reference/consular/<country>.json` with a source URL and date per consulate; `pipeline/scrapers/consular.py` refuses to build unless every name resolves and every county in the 50 states, DC, Puerto Rico, and the U.S. Virgin Islands belongs to exactly one consulate, so a stale list cannot draw a district short. It is run by hand when a country's lists change (it needs `geopandas`) and writes `web/public/data/consular/`.

Mexico is the only country shipped so far. Its lists come from the Secretaría de Relaciones Exteriores: each consulate's own `consulmex.sre.gob.mx` circunscripción page where one is archived, otherwise the per-consulate PDFs of the SRE's [consular network directory](https://www.gob.mx/sre/documentos/red-consular-de-mexico-en-los-estados-unidos-de-america) (2018), with the June 2022 redistricting ([Comunicado 198](https://www.gob.mx/sre/prensa/comunicado-no-198)) and the consulates opened since (Oklahoma City, New Brunswick) applied. Counties are atomic: where a consulate's jurisdiction covers part of a county (Nogales in Pima County, Yuma up to Lukeville), the whole county stays with the consulate of its seat.

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
