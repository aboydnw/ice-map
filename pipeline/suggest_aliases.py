"""List master-facility candidates for each unmatched snapshot facility.

Helper for maintaining pipeline/aliases.json: prints city/state neighbors from
the facility master so a human can pick the right code. Never run automatically.
"""

import json
import pathlib

import pandas as pd

BASE = pathlib.Path(__file__).resolve().parent
report = json.loads((BASE.parent / "web" / "public" / "data" / "match_report.json").read_text())
master = pd.read_parquet(BASE / "cache" / "master.parquet")

for facility in report["unmatched_facilities"]:
    state = facility["state"]
    city = facility["city"].upper()
    candidates = master[
        (master["state"].str.upper() == state)
        & (
            master["city"].str.upper().fillna("").str.contains(city[:6])
            | master["name"].str.upper().str.contains(facility["name"].split()[0])
        )
    ]
    print(f"\n### {facility['name']} ({city}, {state}) adp={facility['adp']}")
    for row in candidates.itertuples():
        print(f"  {row.detention_facility_code}  {row.name}  [{row.city}, {row.state}]  {row.type_detailed}")
