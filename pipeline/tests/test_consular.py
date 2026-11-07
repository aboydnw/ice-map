import pathlib
import sys

import geopandas as gpd
import pytest
import shapely

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scrapers"))
import consular


def square(x, y):
    return shapely.box(x, y, x + 1, y + 1)


def counties(rows):
    frame = gpd.GeoDataFrame(
        rows, columns=["GEOID", "STUSPS", "NAME", "NAMELSAD", "geometry"], crs=4326
    )
    frame["key"] = frame["NAME"].map(consular.fold)
    return frame


TEXAS = counties(
    [
        ("48001", "TX", "Anderson", "Anderson County", square(0, 0)),
        ("48003", "TX", "Andrews", "Andrews County", square(1, 0)),
        ("48005", "TX", "Angelina", "Angelina County", square(2, 0)),
    ]
)
VIRGINIA = counties(
    [
        ("51067", "VA", "Franklin", "Franklin County", square(0, 0)),
        ("51620", "VA", "Franklin", "Franklin city", square(1, 0)),
        ("51059", "VA", "Fairfax", "Fairfax County", square(2, 0)),
    ]
)


def test_fold_ignores_accents_case_punctuation_and_suffixes():
    assert consular.fold("Río Arriba") == consular.fold("Rio Arriba County")
    assert consular.fold("Mc Lennan") == consular.fold("McLennan")
    assert consular.fold("Kings (Brooklyn)") == consular.fold("Kings")
    assert consular.fold("Saint Johns") == consular.fold("St. Johns")
    assert consular.fold("Prince George's") == consular.fold("Prince George’s County")


def test_resolve_state_all_and_named_counties():
    assert consular.resolve_state("TX", "all", TEXAS, {}) == (["48001", "48003", "48005"], [])
    geoids, problems = consular.resolve_state("TX", ["Andrews", "Angelina"], TEXAS, {})
    assert sorted(geoids) == ["48003", "48005"]
    assert problems == []


def test_resolve_state_reports_unknown_and_ambiguous_names():
    _, problems = consular.resolve_state("TX", ["Andrews", "Nowhere"], TEXAS, {})
    assert len(problems) == 1 and "Nowhere" in problems[0]
    _, problems = consular.resolve_state("VA", ["Franklin"], VIRGINIA, {})
    assert len(problems) == 1 and "2 counties" in problems[0]
    _, problems = consular.resolve_state("ZZ", ["Anything"], TEXAS, {})
    assert problems == ["ZZ: unknown state code"]


def test_resolve_state_repeated_name_claims_both_and_aliases_claim_first():
    geoids, problems = consular.resolve_state("VA", ["Franklin", "Franklin (Independent City)"], VIRGINIA, {})
    assert sorted(geoids) == ["51067", "51620"] and problems == []
    aliases = {"VA|ciudaddefranklin": ["51620"]}
    geoids, problems = consular.resolve_state("VA", ["Franklin", "Ciudad de Franklin"], VIRGINIA, aliases)
    assert sorted(geoids) == ["51067", "51620"] and problems == []


def test_resolve_raises_on_any_unresolved_name():
    reference = {"consulates": [{"id": "x", "counties": {"TX": ["Andrews", "Typo"]}}]}
    with pytest.raises(ValueError, match="Typo"):
        consular.resolve(reference, TEXAS, {})


def test_check_partition_reports_gaps_and_overlaps():
    consular.check_partition({"a": ["48001", "48003"], "b": ["48005"]}, TEXAS)
    with pytest.raises(ValueError, match="unassigned"):
        consular.check_partition({"a": ["48001"], "b": ["48005"]}, TEXAS)
    with pytest.raises(ValueError, match="assigned twice"):
        consular.check_partition({"a": ["48001", "48003"], "b": ["48003", "48005"]}, TEXAS)


def test_check_partition_ignores_territories_outside_it():
    with_guam = counties(
        [
            ("48001", "TX", "Anderson", "Anderson County", square(0, 0)),
            ("66010", "GU", "Guam", "Guam", square(5, 5)),
        ]
    )
    consular.check_partition({"a": ["48001"]}, with_guam)


def test_color_districts_separates_neighbours():
    geometries = {"a": square(0, 0), "b": square(1, 0), "c": square(0, 1), "d": square(5, 5)}
    colors = consular.color_districts(geometries)
    assert colors["a"] != colors["b"] and colors["a"] != colors["c"]
    assert set(colors.values()) <= set(range(consular.MAX_COLORS))


@pytest.mark.parametrize("geoids", [["99999"], ["51067"], ["48001", "48001"], []])
def test_alias_rejects_invalid_or_duplicate_geoids(geoids):
    _, problems = consular.resolve_state("TX", ["Alias"], TEXAS, {"TX|alias": geoids})
    assert problems


def test_alias_rejects_repeated_source_spelling():
    geoids, problems = consular.resolve_state("TX", ["Alias", "Alias"], TEXAS, {"TX|alias": ["48001"]})
    assert geoids == ["48001"]
    assert problems and "listed 2x" in problems[0]


def test_color_exhaustion_raises_actionable_error():
    with pytest.raises(ValueError, match="needed more than"):
        consular.color_districts({str(i): square(0, 0) for i in range(consular.MAX_COLORS + 2)})


def test_color_empty_districts():
    assert consular.color_districts({}) == {}


def test_explicit_unverified_partition_still_rejects_overlap_and_gaps():
    consular.check_partition({"verified": ["48001"], "__unverified__": ["48003", "48005"]}, TEXAS)
    with pytest.raises(ValueError, match="assigned twice"):
        consular.check_partition({"verified": ["48001"], "__unverified__": ["48001", "48003", "48005"]}, TEXAS)
    with pytest.raises(ValueError, match="unassigned"):
        consular.check_partition({"verified": ["48001"], "__unverified__": ["48003"]}, TEXAS)


@pytest.mark.parametrize("country,count", [("colombia",12),("ecuador",11)])
def test_shipped_priority_artifacts(country, count):
    import json
    root = pathlib.Path(__file__).resolve().parents[2]
    ref = json.loads((root / "pipeline/reference/consular" / f"{country}.json").read_text())
    data = json.loads((root / "web/public/data/consular" / f"{country}.geojson").read_text())
    assert len(data["features"]) == count
    assert data["meta"]["coverage_note"] == ref["coverage_note"]
    assert data["meta"]["unverified_counties"] > 0
    assert data["meta"]["source_date_kind"] == "checked"
    assert len({f["id"] for f in data["features"]}) == count
    for feature in data["features"]:
        assert feature["id"] != "__unverified__"
        assert feature["properties"]["county_count"] > 0
        geometry = shapely.from_geojson(json.dumps(feature["geometry"]))
        assert geometry.is_valid and not geometry.is_empty
    if country == "colombia":
        assert all("CA" not in f["properties"]["states"] for f in data["features"])
    else:
        assert all(not {"PR", "VI"}.intersection(f["properties"]["states"]) for f in data["features"])


def test_build_country_requires_public_gap_notice(monkeypatch):
    ref = {"consulates": [{"id": "a", "counties": {"TX": ["Anderson"]}}], "unverified": {"TX": ["Andrews", "Angelina"]}}
    monkeypatch.setattr(consular, "load_reference", lambda _: ref)
    monkeypatch.setattr(consular, "load_aliases", lambda: {})
    with pytest.raises(ValueError, match="coverage_note"):
        consular.build_country({"reference": "test.json"}, TEXAS, "2026-11-07", True)
