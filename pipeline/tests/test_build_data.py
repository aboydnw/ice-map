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
    return pd.DataFrame({"adp": [adp_each] * count})


def test_validate_rejects_implausible_total():
    snapshot = make_populated(10, 5)
    with pytest.raises(ValueError):
        build_data.validate(snapshot, snapshot)


def test_validate_rejects_low_match_rate():
    snapshot = make_populated(100, 500)
    matched = snapshot.head(10)
    with pytest.raises(ValueError):
        build_data.validate(matched, snapshot)


def test_validate_rejects_negative_populations():
    snapshot = make_populated(100, 500)
    snapshot.loc[0, "adp"] = -1
    with pytest.raises(ValueError):
        build_data.validate(snapshot, snapshot)


def test_validate_accepts_current_shape():
    snapshot = make_populated(200, 300)
    build_data.validate(snapshot, snapshot)


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


def test_alias_file_keys_are_canonical():
    raw = json.loads((pathlib.Path(build_data.__file__).parent / "aliases.json").read_text())
    for key, code in raw.items():
        if key.startswith("_"):
            continue
        name, state = key.split("|")
        assert name == build_data.normalize_name(name)
        assert len(state) == 2
        assert code.isupper() and 5 <= len(code) <= 8
