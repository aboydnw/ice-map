# ICE Detention Map

An interactive public-transparency map of U.S. immigration detention facilities. Each facility is drawn as a circle sized by its average daily detained population and colored by facility type, with per-facility population history back to 2019.

## Data

All data comes from the [Deportation Data Project](https://deportationdata.org) (CC0):

- **Facility identity and coordinates** — [`deportationdata/ice-detention-facilities`](https://github.com/deportationdata/ice-detention-facilities): facility master with ICE facility codes (DETLOC) and manually verified geocoding, plus a dated name→code crosswalk.
- **Populations** — [`deportationdata/ice-detention-management`](https://github.com/deportationdata/ice-detention-management): ICE's Detention Management spreadsheets parsed into a single time series (snapshots since October 2019).

The population figure is ICE's **average daily population, fiscal-year-to-date** — not a point-in-time headcount. Snapshots only include facilities holding at least one person on the pull date and exclude hold rooms and medical facilities. ICE's publication cadence became irregular in 2026, so the map displays the snapshot date prominently.

## Structure

- `pipeline/` — Python build step that downloads the source data, joins populations to the facility master, validates totals, and emits the static artifacts the site serves (`web/public/data/`).
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
