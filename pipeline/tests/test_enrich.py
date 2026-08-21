import pathlib
import sys

import pandas as pd
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import enrich


def group_with(**columns):
    return pd.DataFrame({key: [value] for key, value in columns.items()})


def test_threat_levels_reconcile_with_adp():
    group = group_with(
        ice_threat_level_1=241.3, ice_threat_level_2=90.1, ice_threat_level_3=90.6, no_ice_threat_level=751.8
    )
    assert enrich.threat_levels(group, 1173.8) == {"level_1": 241, "level_2": 90, "level_3": 91, "none": 752}


def test_threat_levels_rejects_mismatch_and_negatives():
    group = group_with(
        ice_threat_level_1=100, ice_threat_level_2=0, ice_threat_level_3=0, no_ice_threat_level=100
    )
    assert enrich.threat_levels(group, 300) is None
    negative = group_with(
        ice_threat_level_1=-1, ice_threat_level_2=0, ice_threat_level_3=0, no_ice_threat_level=101
    )
    assert enrich.threat_levels(negative, 100) is None


def test_mandatory_detention_bounds():
    assert enrich.mandatory_detention(group_with(mandatory=724.4), 1174) == 724
    assert enrich.mandatory_detention(group_with(mandatory=1300), 1174) is None
    assert enrich.mandatory_detention(group_with(mandatory=float("nan")), 1174) is None


def test_parse_inspection_date_variants():
    assert enrich.parse_inspection_date(46177) == ("2026-06-04", None)
    assert enrich.parse_inspection_date("2025-11-03 00:00:00") == ("2025-11-03", None)
    assert enrich.parse_inspection_date("Scheduled FY26") == (None, "FY26")
    assert enrich.parse_inspection_date("1999-01-01") == (None, None)
    assert enrich.parse_inspection_date("garbage") == (None, None)


def test_inspection_requires_known_type():
    row = pd.Series(
        {
            "last_inspection_type": "ORSA",
            "last_final_rating": "Pass",
            "last_inspection_end_date": 46000,
            "last_inspection_standard": "NDS 2019",
        }
    )
    result = enrich.inspection(row)
    assert result["self_assessment"] is True
    assert result["standard"] == "NDS 2019"
    assert enrich.inspection(pd.Series({"last_inspection_type": "MYSTERY"})) is None


def test_alos_drops_ambiguous_names(tmp_path):
    df = pd.DataFrame(
        {
            "name": ["CLARK COUNTY JAIL", "CLARK COUNTY JAIL", "UNIQUE JAIL", "HUGE JAIL"],
            "alos": [10.2, 12.0, 24.6, 5000],
            "alos_fiscal_year": [2026, 2026, 2026, 2026],
            "pull_date": pd.to_datetime(["2026-07-09"] * 4),
        }
    )
    path = tmp_path / "alos.parquet"
    df.to_parquet(path)
    lookup = enrich.load_alos(path)
    assert enrich.length_of_stay(lookup, "Unique Jail") == {"days": 25, "fiscal_year": 2026}
    assert enrich.length_of_stay(lookup, "Clark County Jail") is None
    assert enrich.length_of_stay(lookup, "Huge Jail") is None


def test_last_year_use_bounds():
    ok = pd.Series({"days_with_detentions_daily_last_year": 365, "max_daily_population_last_year": 1595})
    assert enrich.last_year_use(ok, 1174)["peak"] == 1595
    bad = pd.Series({"days_with_detentions_daily_last_year": 400, "max_daily_population_last_year": 10})
    assert enrich.last_year_use(bad, 5) is None
    conflicting = pd.Series({"days_with_detentions_daily_last_year": 24, "max_daily_population_last_year": 9})
    assert enrich.last_year_use(conflicting, 1076) is None


def test_deaths_counts_and_last_date(tmp_path):
    path = tmp_path / "deaths.csv"
    path.write_text(
        "name,dod,detention_center_id\nA,2024-10-27,CSCNWWA\nB,2018-11-18,CSCNWWA\nC,bad-date,CSCNWWA\nD,2020-01-01,OTHER\n"
    )
    df = enrich.load_deaths(path)
    assert enrich.deaths(df, "CSCNWWA") == {"count": 2, "last": "2024-10-27"}
    assert enrich.deaths(df, "NOPE") == {"count": 0, "last": None}


def test_match_odo_report_prefers_newest_same_city():
    records = [
        {"facility_text": "Northwest ICE Processing Center", "city": "Tacoma", "state": "WA", "date_iso_approx": "2024-06-01", "pdf_url": "old"},
        {"facility_text": "Northwest ICE Processing Center", "city": "Tacoma", "state": "WA", "date_iso_approx": "2026-06-01", "pdf_url": "new"},
        {"facility_text": "Northwest Ohio CCNO", "city": "Stryker", "state": "OH", "date_iso_approx": "2026-07-01", "pdf_url": "ohio"},
    ]
    match = enrich.match_odo_report(records, "NORTHWEST ICE PROCESSING CENTER", "TACOMA", "WA")
    assert match["pdf_url"] == "new"
    assert enrich.match_odo_report(records, "JOE CORLEY PROCESSING CENTER", "CONROE", "TX") is None


def test_verify_operator_needs_independent_signal():
    candidates = {
        "wikipedia": {"rows": [
            {"name": "Northwest ICE Processing Center", "city": "Tacoma, WA", "state": "WA", "management": "GEO Group"},
            {"name": "Clark County Jail", "city": "Jeffersonville", "state": "IN", "management": "Clark County Sheriff"},
            {"name": "Mystery Center", "city": "Nowhere", "state": "TX", "management": "GEO Group"},
        ]},
        "osm": {"rows": [{"name": "NWIPC", "operator": "The GEO Group", "lat": 47.2502, "lon": -122.4227}]},
    }
    types = {
        "GEO GROUP": {"type": "private", "display": "GEO Group"},
        "CLARK COUNTY SHERIFF": {"type": "public", "display": "Clark County Sheriff"},
    }
    tacoma = enrich.verify_operator(candidates, types, "NORTHWEST ICE PROCESSING CENTER", "TACOMA", "WA", "CDF", 47.2502, -122.4227)
    assert tacoma == {"name": "GEO Group", "kind": "private", "sources": ["wikipedia", "osm"]}
    clark = enrich.verify_operator(candidates, types, "CLARK COUNTY JAIL (IN)", "JEFFERSONVILLE", "IN", "USMS IGA", 38.3, -85.7)
    assert clark["kind"] == "public" and "name" in clark["sources"]
    assert enrich.verify_operator(candidates, types, "MYSTERY CENTER", "NOWHERE", "TX", "CDF", 30.0, -97.0) is None


def test_derive_local_operator_from_generic_county_value():
    assert enrich.derive_local_operator("CLARK COUNTY JAIL (IN)", "County (Sheriff)", "USMS IGA") == {
        "name": "Clark County Sheriff",
        "kind": "public",
        "sources": ["wikipedia", "name"],
    }
    assert enrich.derive_local_operator("ST CLAIR COUNTY JAIL", "County", "IGSA")["name"] == "St Clair County"
    assert enrich.derive_local_operator("RICHWOOD CORRECTIONAL CENTER", "County (Sheriff)", "IGSA") is None
    assert enrich.derive_local_operator("ADELANTO ICE PROCESSING CENTER", "County (Sheriff)", "CDF") is None


def test_match_ice_site_rules():
    records = [
        {"slug": "camp-east-montana", "name": "ERO El Paso Camp East Montana", "city": "El Paso", "state": "TX"},
        {"slug": "el-paso-spc", "name": "El Paso Service Processing Center", "city": "El Paso", "state": "TX"},
        {"slug": "tacoma", "name": "Northwest ICE Processing Center (NWIPC)", "city": "Tacoma", "state": "WA"},
        {"slug": "folkston-annex", "name": "Folkston ICE Processing Center (Annex)", "city": "Folkston", "state": "GA"},
        {"slug": "folkston-dray", "name": "Folkston D Ray ICE Processing Center", "city": "Folkston", "state": "GA"},
        {"slug": "florence-spc", "name": "Florence Service Processing Center", "city": "Florence", "state": "AZ"},
        {"slug": "florence-cc", "name": "Central Arizona Florence Correctional Center", "city": "Florence", "state": "AZ"},
    ]
    aliases = {"DILLEY PROCESSING SINGLE ADULT FEMALE|TX": "dilley"}
    match = enrich.match_ice_site
    assert match(records, aliases, ["EL PASO SERVICE PROCESSING CENTER", "El Paso Service Processing Center"], "EL PASO", "TX")["slug"] == "el-paso-spc"
    assert match(records, aliases, ["NORTHWEST ICE PROCESSING CENTER", "Northwest ICE Processing Center (NWIPC)"], "TACOMA", "WA")["slug"] == "tacoma"
    assert match(records, aliases, ["FOLKSTON ANNEX IPC", "Folkston ICE Processing Center (Annex)"], "FOLKSTON", "GA")["slug"] == "folkston-annex"
    assert match(records, aliases, ["FLORENCE STAGING FACILITY", "Florence Staging Facility"], "FLORENCE", "AZ") is None
    assert match(records, aliases, ["CCA, FLORENCE CORRECTIONAL CENTER", "Central Arizona Florence Correctional Center"], "FLORENCE", "AZ")["slug"] == "florence-cc"
    assert match(records, aliases, ["DILLEY PROCESSING SINGLE ADULT FEMALE", "Dilley Processing Single Female"], "DILLEY", "TX") is None


def test_parse_inspection_date_rejects_out_of_range_serial():
    assert enrich.parse_inspection_date("999999") == (None, None)


def test_inspection_rating_falls_back_past_nan():
    row = pd.Series(
        {
            "last_inspection_type": "ODO",
            "last_final_rating": pd.NA,
            "last_inspection_rating_final": "Pass",
            "last_inspection_end_date": float("nan"),
            "last_inspection_date": "2025-03-01",
        }
    )
    result = enrich.inspection(row)
    assert result["rating"] == "Pass"
    assert result["date"] == "2025-03-01"


def test_match_ice_site_skips_archived_pages():
    records = [{"slug": "deyton", "name": "Robert A. Deyton Detention Facility", "city": "Lovejoy", "state": "GA", "archived": True}]
    assert enrich.match_ice_site(records, {}, ["ROBERT A DEYTON DETENTION FACILITY"], "LOVEJOY", "GA") is None


def test_load_json_requires_reference_file():
    with pytest.raises(FileNotFoundError):
        enrich.load_json("definitely-missing.json")
