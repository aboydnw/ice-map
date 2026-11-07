import { describe, expect, it } from "vitest";
import { CONSULAR_COLORS } from "./config";
import {
  districtColor,
  districtSummary,
  fillColorExpression,
  sourceYears,
} from "./consular";
import type { ConsularCollection, ConsularDistrictProperties } from "./types";

const props: ConsularDistrictProperties = {
  id: "albuquerque",
  name: "Consulado de México en Albuquerque",
  city: "Albuquerque",
  state: "NM",
  county_count: 71,
  states: ["NM", "TX"],
  source_url: "https://example.test",
  source_date: "2024-01-01",
  color: 2,
};

function collection(dates: [string, string]): ConsularCollection {
  return {
    type: "FeatureCollection",
    meta: {
      key: "mexico",
      name: "Mexico",
      file: "mexico.geojson",
      districts: 1,
      source: "test",
      source_dates: dates,
      built: "2026-08-22",
    },
    features: [],
  };
}

describe("fillColorExpression", () => {
  it("maps every color index and falls back to the first tint", () => {
    const expression = fillColorExpression();
    expect(expression[0]).toBe("match");
    expect(expression.slice(2, -1)).toEqual(
      CONSULAR_COLORS.flatMap((color, index) => [index, color]),
    );
    expect(expression.at(-1)).toBe(CONSULAR_COLORS[0]);
  });
});

describe("districtColor", () => {
  it("wraps indexes past the palette length", () => {
    expect(districtColor(CONSULAR_COLORS.length + 1)).toBe(CONSULAR_COLORS[1]);
  });
});

describe("districtSummary", () => {
  it("counts counties and lists states", () => {
    expect(districtSummary(props)).toBe("71 counties · NM, TX");
    expect(districtSummary({ ...props, county_count: 1, states: ["CA"] })).toBe(
      "1 county · CA",
    );
  });
});

describe("sourceYears", () => {
  it("collapses a single year and spans a range", () => {
    expect(sourceYears(collection(["2024-03-01", "2024-11-30"]))).toBe("2024");
    expect(sourceYears(collection(["2018-09-12", "2026-08-18"]))).toBe(
      "2018–2026",
    );
  });
});
