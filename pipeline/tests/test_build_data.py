import json
import pathlib
import sys

import pandas as pd
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import build_data


def test_normalize_name_strips_punctuation_and_case():
    assert build_data.normalize_name("Berlin Fed. Corr. Inst.") == "BERLIN FED CORR INST"
    assert build_data.normalize_name("CLARK COUNTY JAIL (IN)") == "CLARK COUNTY JAIL IN"
    assert build_data.normalize_name("  Ste.  Genevieve/Jail ") == "STE GENEVIEVE JAIL"


def test_bucket_for_maps_types():
    assert build_data.bucket_for("SPC") == "dedicated"
    assert build_data.bucket_for("IGSA") == "county_jail"
    assert build_data.bucket_for("USMS IGA") == "usms"
    assert build_data.bucket_for("BOP") == "federal_prison"
    assert build_data.bucket_for("SOMETHING NEW") == "other"


def test_to_number_handles_commas_and_junk():
    series = pd.Series(["  1,747.99", "5", "", "n/a"])
    result = build_data.to_number(series)
    assert result[0] == pytest.approx(1747.99)
    assert result[1] == 5
    assert result[2:].isna().all()


def make_snapshot(rows):
    return pd.DataFrame(rows, columns=["name", "address", "city", "state"])


def test_resolve_codes_precedence():
    snapshot = make_snapshot(
        [
            ["ALIASED FACILITY", "1 Main St", "Town", "TX"],
            ["KNOWN FACILITY", "2 Oak Ave", "Town", "TX"],
            ["RENAMED FACILITY", "3 Elm Rd", "Town", "TX"],
            ["MYSTERY FACILITY", "4 Pine Ln", "Town", "TX"],
        ]
    )
    aliases = {("ALIASED FACILITY", "TX"): "AAA"}
    code_lookup = {("KNOWN FACILITY", "TX"): "BBB", ("ALIASED FACILITY", "TX"): "WRONG"}
    address_lookup = {("3 ELM RD", "TX"): "CCC"}
    resolved = build_data.resolve_codes(snapshot, aliases, code_lookup, address_lookup)
    assert list(resolved["detloc"][:3]) == ["AAA", "BBB", "CCC"]
    assert pd.isna(resolved["detloc"].iloc[3])
    assert list(resolved["match_method"]) == ["alias", "name", "address", "unmatched"]


def make_populated(count, adp_each):
    return pd.DataFrame(
        {
            "detloc": [f"CODE{i:04d}" for i in range(count)],
            "adp": [adp_each] * count,
        }
    )


def test_validate_rejects_implausible_total():
    snapshot = make_populated(10, 5)
    with pytest.raises(ValueError):
        build_data.validate(snapshot, snapshot)


def test_validate_rejects_low_match_rate():
    snapshot = make_populated(100, 500)
    matched = snapshot.head(10)
    with pytest.raises(ValueError):
        build_data.validate(matched, snapshot)


def test_validate_rejects_even_one_unmatched_source_row():
    snapshot = make_populated(100, 500)
    matched = snapshot.head(99)
    with pytest.raises(ValueError, match="1 source row was not published"):
        build_data.validate(matched, snapshot)


def test_validate_rejects_facility_code_collisions():
    snapshot = make_populated(100, 500)
    matched = snapshot.copy()
    matched.loc[1, "detloc"] = matched.loc[0, "detloc"]
    with pytest.raises(ValueError, match="facility-code collision"):
        build_data.validate(matched, snapshot)


def test_validate_rejects_negative_populations():
    snapshot = make_populated(100, 500)
    snapshot.loc[0, "adp"] = -1
    with pytest.raises(ValueError):
        build_data.validate(snapshot, snapshot)


def test_validate_accepts_current_shape():
    snapshot = make_populated(200, 300)
    build_data.validate(snapshot, snapshot)


def source_snapshot(**overrides):
    row = {
        "name": "Some Jail",
        "level_a": 1.0,
        "level_b": 2.0,
        "level_c": 3.0,
        "level_d": 4.0,
        "male_crim": 4.0,
        "male_non_crim": 3.0,
        "female_crim": 2.0,
        "female_non_crim": 1.0,
        "adp": 10.0,
    }
    row.update(overrides)
    return pd.DataFrame([row])


def test_validate_source_snapshot_rejects_missing_population_values():
    snapshot = source_snapshot(level_b=float("nan"))
    with pytest.raises(ValueError, match="missing required numeric source values.*level_b"):
        build_data.validate_source_snapshot(snapshot)


def test_validate_source_snapshot_rejects_inconsistent_population_breakdowns():
    snapshot = source_snapshot(female_non_crim=4.0)
    with pytest.raises(ValueError, match="population breakdown does not reconcile"):
        build_data.validate_source_snapshot(snapshot)


def published_feature(detloc="CODE0001", adp=10):
    return {
        "properties": {
            "detloc": detloc,
            "adp": adp,
            "male_crim": 4,
            "male_non_crim": 3,
            "female_crim": 2,
            "female_non_crim": 1,
            "guaranteed_minimum": None,
        }
    }


def test_reconcile_features_rejects_a_changed_published_number():
    matched = source_snapshot(detloc="CODE0001", guaranteed_minimum=float("nan"))
    features = [published_feature(adp=11)]
    with pytest.raises(ValueError, match="published numeric mismatch.*CODE0001.*adp"):
        build_data.reconcile_features(matched, features)


def test_reconcile_features_rejects_duplicate_published_facility_codes():
    matched = source_snapshot(detloc="CODE0001", guaranteed_minimum=float("nan"))
    features = [published_feature(), published_feature()]
    with pytest.raises(ValueError, match="duplicate published facility code"):
        build_data.reconcile_features(matched, features)


def test_reconcile_features_reports_documented_per_facility_rounding():
    first = source_snapshot(
        detloc="CODE0001",
        level_a=1.4,
        adp=10.4,
        male_crim=4.4,
        guaranteed_minimum=float("nan"),
    )
    second = first.copy()
    second.loc[0, "detloc"] = "CODE0002"
    matched = pd.concat([first, second], ignore_index=True)
    features = [published_feature("CODE0001"), published_feature("CODE0002")]

    assert build_data.reconcile_features(matched, features) == {
        "source_rows": 2,
        "published_facilities": 2,
        "source_adp_unrounded": 20.8,
        "national_adp": 21,
        "published_facility_adp_sum": 20,
        "facility_rounding_delta": -1,
    }


def test_prepare_timeseries_drops_total_row_and_sums_levels():
    raw = pd.DataFrame(
        {
            "name": ["Total", "Some Jail"],
            "level_a": ["1,000", "10"],
            "level_b": ["0", "20"],
            "level_c": ["0", ""],
            "level_d": ["0", "5"],
            "male_crim": ["0", "1"],
            "male_non_crim": ["0", "2"],
            "female_crim": ["0", "3"],
            "female_non_crim": ["0", "4"],
            "guaranteed_minimum": ["0", "100"],
        }
    )
    prepared = build_data.prepare_timeseries(raw)
    assert len(prepared) == 1
    assert prepared.iloc[0]["adp"] == 35


def test_format_inspection_date_handles_serials_and_strings():
    assert build_data.format_inspection_date(46177) == "2026-06-04"
    assert build_data.format_inspection_date("46177.0") == "2026-06-04"
    assert build_data.format_inspection_date("2025-11-03 00:00:00") == "2025-11-03"
    assert build_data.format_inspection_date(None) is None


def test_alias_file_keys_are_canonical():
    raw = json.loads((pathlib.Path(build_data.__file__).parent / "aliases.json").read_text())
    for key, code in raw.items():
        if key.startswith("_"):
            continue
        name, state = key.split("|")
        assert name == build_data.normalize_name(name)
        assert len(state) == 2
        assert code.isupper() and 5 <= len(code) <= 8
