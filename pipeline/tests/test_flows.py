import json
import pathlib
import sys

import pandas as pd
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import flows

IN_WINDOW = pd.Timestamp("2024-01-10", tz="UTC")


def stint(stay, facility, book_in, book_out, reason, country=None, person="P1"):
    return {
        "stay_ID": stay,
        "unique_identifier": person,
        "book_in_date_time": pd.Timestamp(book_in, tz="UTC"),
        "book_out_date_time": pd.Timestamp(book_out, tz="UTC") if book_out else pd.NaT,
        "detention_facility_code": facility,
        "detention_release_reason": reason,
        "departure_country": country,
        "duplicate_drop_row": False,
    }


def arrest(person, when, state):
    return {
        "unique_identifier": person,
        "apprehension_date_time": pd.Timestamp(when, tz="UTC"),
        "apprehension_state_filled_in": state,
        "duplicate_drop_row": False,
    }


def facility(code, lon, lat, name=None, type_detailed="IGSA"):
    return {
        "detention_facility_code": code,
        "name": name or code,
        "longitude": lon,
        "latitude": lat,
        "type_detailed": type_detailed,
    }


def typed(rows, columns, timestamps):
    """Build a fixture frame with the dtypes the real parquet files carry."""
    frame = pd.DataFrame(rows, columns=columns)
    for column in columns:
        if column in timestamps:
            frame[column] = pd.to_datetime(frame[column], utc=True)
        elif column == "duplicate_drop_row":
            frame[column] = frame[column].astype("boolean")
        else:
            frame[column] = frame[column].astype("string")
    return frame


def run(tmp_path, stints, arrests, master, mapped_codes):
    stints_path = tmp_path / "stints.parquet"
    arrests_path = tmp_path / "arrests.parquet"
    typed(stints, flows.STINT_COLUMNS, {"book_in_date_time", "book_out_date_time"}).to_parquet(
        stints_path
    )
    typed(arrests, flows.ARREST_COLUMNS, {"apprehension_date_time"}).to_parquet(arrests_path)
    report = flows.build(
        stints_path, arrests_path, pd.DataFrame(master), set(mapped_codes), tmp_path
    )
    written = {
        path.stem: json.loads(path.read_text())
        for path in (tmp_path / "flows").glob("*.json")
    }
    return report, written


def keys(payload, direction):
    return {row["key"]: row["count"] for row in payload[direction]}


def test_classify_out_covers_every_reason_family():
    assert flows.classify_out("Transferred", "JENATLA", None) == "transfer:JENATLA"
    assert flows.classify_out("Removed", None, "GUATEMALA") == "removed:GUATEMALA"
    assert flows.classify_out("Voluntary departure", None, "MEXICO") == "removed:MEXICO"
    assert flows.classify_out("Voluntary Return", None, "MEXICO") == "removed:MEXICO"
    assert flows.classify_out("Paroled - Humanitarian", None, None) == "released:paroled"
    assert flows.classify_out("Bonded Out - IJ", None, None) == "released:bonded-out"
    assert flows.classify_out("Order of recognizance", None, None) == "released:recognizance"
    assert flows.classify_out("Order of Supervision - Humanitarian", None, None) == "released:supervision"
    assert flows.classify_out("Relief Granted by IJ", None, None) == "released:court"
    assert flows.classify_out("Proceedings Terminated", None, None) == "released:court"
    assert (
        flows.classify_out("U.S. Marshals or other agency (explain in Detention Comments)", None, None)
        == "custody:other-agency"
    )
    assert flows.classify_out("ORR - Office of Refugee Resettlement", None, None) == "other:orr"
    assert flows.classify_out("Died", None, None) == "other:died"
    assert flows.classify_out("Escaped", None, None) == "other:escaped"
    assert flows.classify_out("Title 42 Return", None, None) == "other:title-42"
    assert (
        flows.classify_out("Processing Disposition Changed Locally", None, None)
        == "other:processing-change"
    )
    assert flows.classify_out("Beamed Up", None, None) == "other:unknown"


@pytest.mark.parametrize("blank", [None, "", "   ", float("nan")])
def test_classify_out_treats_blank_reasons_as_not_reported(blank):
    assert flows.classify_out(blank, "JENATLA", "MEXICO") == "not-reported"


def test_classify_out_falls_back_when_the_endpoint_is_missing():
    assert flows.classify_out("Transferred", None, None) == "transfer:unknown"
    assert flows.classify_out("Removed", None, "") == "removed:unknown"


def test_three_stint_stay_chains_transfers_between_its_facilities(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-02", "2024-01-05", "Transferred"),
        stint("S1", "BBB", "2024-01-05", "2024-01-09", "Transferred"),
        stint("S1", "CCC", "2024-01-09", "2024-01-20", "Removed", "GUATEMALA"),
    ]
    arrests = [arrest("P1", "2024-01-01", "TEXAS")]
    master = [facility("AAA", -97.0, 31.0), facility("BBB", -92.0, 31.0), facility("CCC", -85.0, 33.0)]
    _, written = run(tmp_path, stints, arrests, master, ["AAA", "BBB", "CCC"])

    assert keys(written["AAA"], "in") == {"arrested:TEXAS": 1}
    assert keys(written["AAA"], "out") == {"transfer:BBB": 1}
    assert keys(written["BBB"], "in") == {"transfer:AAA": 1}
    assert keys(written["BBB"], "out") == {"transfer:CCC": 1}
    assert keys(written["CCC"], "in") == {"transfer:BBB": 1}
    assert keys(written["CCC"], "out") == {"removed:GUATEMALA": 1}


def test_transfer_with_no_following_stint_becomes_unknown(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-02", "2024-01-05", "Transferred"),
        stint("S1", "BBB", "2024-01-05", "2024-01-09", "Transferred"),
    ]
    master = [facility("AAA", -97.0, 31.0), facility("BBB", -92.0, 31.0)]
    _, written = run(tmp_path, stints, [], master, ["AAA", "BBB"])

    assert keys(written["BBB"], "out") == {"transfer:unknown": 1}


def test_open_stint_has_an_in_edge_but_no_out_edge(tmp_path):
    stints = [stint("S1", "AAA", "2024-01-02", None, None)]
    master = [facility("AAA", -97.0, 31.0)]
    _, written = run(tmp_path, stints, [], master, ["AAA"])

    assert written["AAA"]["totals"] == {"in": 1, "out": 0}


def test_edge_counts_sum_to_book_ins_and_book_outs(tmp_path):
    reasons = [
        ("Transferred", None),
        ("Removed", "MEXICO"),
        ("Paroled", None),
        ("Order of supervision", None),
        (None, None),
        ("Died", None),
        ("U.S. Marshals or other agency", None),
    ]
    stints, arrests = [], []
    for index, (reason, country) in enumerate(reasons):
        day = 2 + index
        person = f"P{index}"
        stints.append(
            stint(f"S{index}", "AAA", f"2024-01-{day:02d}", f"2024-02-{day:02d}", reason, country, person)
        )
        if reason == "Transferred":
            stints.append(
                stint(f"S{index}", "BBB", f"2024-02-{day:02d}", f"2024-03-{day:02d}", "Removed", "PERU", person)
            )
        if index % 2 == 0:
            arrests.append(arrest(person, f"2024-01-{day:02d}", "TEXAS"))
    master = [facility("AAA", -97.0, 31.0), facility("BBB", -92.0, 31.0)]
    _, written = run(tmp_path, stints, arrests, master, ["AAA", "BBB"])

    for payload in written.values():
        if "detloc" not in payload:
            continue
        assert sum(row["count"] for row in payload["in"]) == payload["totals"]["in"]
        assert sum(row["count"] for row in payload["out"]) == payload["totals"]["out"]
    assert written["AAA"]["totals"] == {"in": len(reasons), "out": len(reasons)}
    assert written["BBB"]["totals"] == {"in": 1, "out": 1}


def test_arrest_link_window_excludes_stale_arrests_and_prefers_the_nearest(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-20", "2024-02-01", "Removed", "MEXICO", "STALE"),
        stint("S2", "AAA", "2024-01-20", "2024-02-01", "Removed", "MEXICO", "RECENT"),
        stint("S3", "AAA", "2024-01-20", "2024-02-01", "Removed", "MEXICO", "TWO"),
    ]
    arrests = [
        arrest("STALE", "2024-01-09", "TEXAS"),
        arrest("RECENT", "2024-01-16", "ARIZONA"),
        arrest("TWO", "2024-01-12", "FLORIDA"),
        arrest("TWO", "2024-01-19", "NEVADA"),
    ]
    master = [facility("AAA", -97.0, 31.0)]
    _, written = run(tmp_path, stints, arrests, master, ["AAA"])

    assert keys(written["AAA"], "in") == {
        "arrived:unlinked": 1,
        "arrested:ARIZONA": 1,
        "arrested:NEVADA": 1,
    }
    assert written["AAA"]["coverage"] == {"origin_linked": 0.667, "origin_linked_of": 3}


def test_arrest_after_book_in_is_linked_only_inside_the_window(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-20", "2024-02-01", "Removed", "MEXICO", "SOON"),
        stint("S2", "AAA", "2024-01-20", "2024-02-01", "Removed", "MEXICO", "LATE"),
    ]
    arrests = [arrest("SOON", "2024-01-24", "UTAH"), arrest("LATE", "2024-01-27", "UTAH")]
    master = [facility("AAA", -97.0, 31.0)]
    _, written = run(tmp_path, stints, arrests, master, ["AAA"])

    assert keys(written["AAA"], "in") == {"arrested:UTAH": 1, "arrived:unlinked": 1}


def test_endpoint_outside_the_bounding_box_collapses_to_no_location(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-02", "2024-01-05", "Transferred", person="P1"),
        stint("S1", "OFFMAP", "2024-01-05", "2024-01-09", "Removed", "MEXICO", person="P1"),
        stint("S2", "AAA", "2024-01-03", "2024-01-06", "Transferred", person="P2"),
        stint("S2", "NOCOORD", "2024-01-06", "2024-01-10", "Removed", "MEXICO", person="P2"),
    ]
    master = [
        facility("AAA", -97.0, 31.0),
        facility("OFFMAP", 12.5, 48.1),
        facility("NOCOORD", None, None),
    ]
    report, written = run(tmp_path, stints, arrests=[], master=master, mapped_codes=["AAA"])

    assert keys(written["AAA"], "out") == {"transfer:no-location": 2}
    assert "OFFMAP" not in written["endpoints"]["facilities"]
    assert "NOCOORD" not in written["endpoints"]["facilities"]
    assert report["endpoints"]["referenced"] == 2
    assert report["endpoints"]["with_coordinates"] == 0
    assert report["endpoints"]["coordinate_share"] == 0.0


def test_departure_country_outside_the_centroid_table_is_reported_as_unknown(tmp_path):
    stints = [stint("S1", "AAA", "2024-01-02", "2024-01-05", "Removed", "ATLANTIS")]
    master = [facility("AAA", -97.0, 31.0)]
    report, written = run(tmp_path, stints, [], master, ["AAA"])

    assert keys(written["AAA"], "out") == {"removed:unknown": 1}
    assert report["unmapped_departure_countries"] == {"ATLANTIS": 1}


def test_stints_outside_the_data_window_are_excluded(tmp_path):
    stints = [
        stint("S1", "AAA", "2022-09-01", "2022-09-20", "Removed", "MEXICO", "OLD"),
        stint("S2", "AAA", "2022-09-25", "2022-10-05", "Removed", "MEXICO", "STRADDLE"),
        stint("S3", "AAA", "2024-01-02", "2024-01-20", "Removed", "MEXICO", "INSIDE"),
    ]
    master = [facility("AAA", -97.0, 31.0)]
    _, written = run(tmp_path, stints, [], master, ["AAA"])

    assert written["AAA"]["totals"] == {"in": 1, "out": 2}


def test_duplicate_rows_are_dropped(tmp_path):
    rows = [stint("S1", "AAA", "2024-01-02", "2024-01-05", "Removed", "MEXICO")]
    duplicate = dict(rows[0], duplicate_drop_row=True)
    master = [facility("AAA", -97.0, 31.0)]
    _, written = run(tmp_path, rows + [duplicate], [], master, ["AAA"])

    assert written["AAA"]["totals"] == {"in": 1, "out": 1}


def test_data_through_ignores_the_files_stub_tail():
    days = pd.date_range("2024-01-01", periods=40, freq="D", tz="UTC")
    timestamps = pd.Series(days.repeat([100] * 39 + [2]))
    assert flows.data_through(timestamps) == pd.Timestamp("2024-02-08", tz="UTC")


def test_in_bounds_accepts_the_americas_and_the_pacific_territories():
    assert flows.in_bounds(-97.0, 31.0)
    assert flows.in_bounds(144.79, 13.45)
    assert not flows.in_bounds(12.5, 48.1)
    assert not flows.in_bounds(-97.0, 80.0)


def test_hold_rooms_and_staging_sites_are_marked_as_processing(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-02", "2024-01-05", "Transferred", person="P1"),
        stint("S1", "HOLDRM", "2024-01-05", "2024-01-09", "Removed", "MEXICO", person="P1"),
        stint("S2", "AAA", "2024-01-03", "2024-01-06", "Transferred", person="P2"),
        stint("S2", "BBB", "2024-01-06", "2024-01-10", "Removed", "MEXICO", person="P2"),
    ]
    master = [
        facility("AAA", -97.0, 31.0),
        facility("HOLDRM", -96.0, 32.0, type_detailed="HOLD"),
        facility("BBB", -95.0, 33.0, type_detailed="IGSA"),
    ]
    report, written = run(tmp_path, stints, [], master, ["AAA"])
    endpoints = written["endpoints"]["facilities"]

    assert endpoints["HOLDRM"]["kind"] == "processing"
    assert endpoints["BBB"]["kind"] == "detention"
    assert endpoints["HOLDRM"]["stints"] == 1
    assert report["endpoints"]["processing_sites"] == 1
    assert report["endpoints"]["off_map_endpoints"] == 2


def test_processing_sites_get_their_own_board(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-02", "2024-01-05", "Transferred", person="P1"),
        stint("S1", "HOLDRM", "2024-01-05", "2024-01-09", "Removed", "MEXICO", person="P1"),
    ]
    master = [
        facility("AAA", -97.0, 31.0),
        facility("HOLDRM", -96.0, 32.0, type_detailed="HOLD"),
    ]
    report, written = run(tmp_path, stints, [], master, ["AAA"])

    assert set(written) >= {"AAA", "HOLDRM"}
    assert keys(written["HOLDRM"], "in") == {"transfer:AAA": 1}
    assert keys(written["HOLDRM"], "out") == {"removed:MEXICO": 1}
    assert written["HOLDRM"]["totals"] == {"in": 1, "out": 1}
    assert report["endpoints"]["processing_boards_written"] == 1


def test_report_metrics_cover_only_facilities_on_the_map(tmp_path):
    stints = [
        stint("S1", "AAA", "2024-01-02", "2024-01-05", "Removed", "MEXICO", person="P1"),
        stint("S2", "HOLDRM", "2024-01-02", "2024-01-05", "Removed", "MEXICO", person="P2"),
    ]
    master = [
        facility("AAA", -97.0, 31.0),
        facility("HOLDRM", -96.0, 32.0, type_detailed="HOLD"),
    ]
    report, written = run(tmp_path, stints, [], master, ["AAA"])

    assert "HOLDRM" in written
    assert report["book_outs_in_window"] == 1
    assert report["book_ins_in_window"] == 1
