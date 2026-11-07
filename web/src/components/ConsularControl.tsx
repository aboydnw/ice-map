import { useState } from "react";
import { Box, Text, chakra } from "@chakra-ui/react";
import { districtSummary, sourceYears } from "../consular";
import type { ConsularCollection, ConsularCountry } from "../types";

const Select = chakra("select");
const selectStyle = {
  width: "100%",
  minH: "44px",
  fontSize: "sm",
  color: "ink",
  bg: "paper",
  borderWidth: "1px",
  borderColor: "hairline",
  borderRadius: "4px",
  px: "2",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "ink",
    outlineOffset: "2px",
  },
} as const;

interface Props {
  countries: ConsularCountry[];
  selectedCountry: string | null;
  onCountryChange: (key: string | null) => void;
  districts: ConsularCollection | null;
  status: "idle" | "loading" | "ready" | "error";
  onRetry: () => void;
}

export function ConsularControl({
  countries,
  selectedCountry,
  onCountryChange,
  districts,
  status,
  onRetry,
}: Props) {
  const [districtId, setDistrictId] = useState("");
  const district = districts?.features.find(
    (feature) => feature.id === districtId,
  )?.properties;
  if (!countries.length) return null;
  return (
    <Box mb="2">
      <chakra.label htmlFor="consular-country" fontSize="xs" fontWeight="bold">
        Consular districts
      </chakra.label>
      <Select
        id="consular-country"
        value={selectedCountry ?? ""}
        onChange={(event) => {
          setDistrictId("");
          onCountryChange(event.target.value || null);
        }}
        {...selectStyle}
        mt="1"
      >
        <option value="">Off</option>
        {countries.map((country) => (
          <option key={country.key} value={country.key}>
            {country.name}
          </option>
        ))}
      </Select>
      <Box role="status" aria-live="polite" fontSize="xs" mt="1">
        {status === "loading" && "Loading district boundaries…"}
        {status === "error" && (
          <>
            <Text>
              Districts could not load. The facility map is still available.
            </Text>
            <chakra.button
              type="button"
              onClick={onRetry}
              minH="44px"
              textDecoration="underline"
              fontWeight="bold"
            >
              Retry districts
            </chakra.button>
          </>
        )}
      </Box>
      {districts && (
        <Box mt="2">
          <Text fontSize="xs" color="inkSecondary">
            {districts.meta.districts} districts · colors separate
            jurisdictions, not risk.
          </Text>
          {districts.meta.coverage_note && (
            <Text fontSize="xs" mt="2" role="note">
              {districts.meta.coverage_note}
            </Text>
          )}
          <details>
            <summary
              style={{
                cursor: "pointer",
                minHeight: 44,
                alignContent: "center",
                fontSize: 13,
              }}
            >
              Find a consulate
            </summary>
            <chakra.label
              htmlFor="consular-district"
              fontSize="xs"
              display="block"
              mt="2"
            >
              Consulate
            </chakra.label>
            <Select
              id="consular-district"
              aria-label="Find a consulate"
              value={districtId}
              onChange={(event) => setDistrictId(event.target.value)}
              {...selectStyle}
              mt="1"
            >
              <option value="">Choose a consulate</option>
              {[...districts.features]
                .sort((a, b) =>
                  a.properties.name.localeCompare(b.properties.name),
                )
                .map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.properties.city}, {feature.properties.state}
                  </option>
                ))}
            </Select>
            {district && (
              <Box mt="2" fontSize="xs" aria-live="polite">
                <Text fontWeight="bold">{district.name}</Text>
                <Text>{districtSummary(district)}</Text>
                <chakra.a
                  href={district.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  display="inline-block"
                  py="2"
                  textDecoration="underline"
                >
                  Jurisdiction source (opens new tab)
                </chakra.a>
                <Text color="inkSecondary">
                  {districts.meta.source_date_kind === "checked"
                    ? "Source checked"
                    : "Source date"}
                  : {district.source_date}
                </Text>
              </Box>
            )}
          </details>
          <Text fontSize="xs" color="inkSecondary" mt="2">
            Sources{" "}
            {districts.meta.source_date_kind === "checked" ? "checked " : ""}
            {sourceYears(districts)}. County-level approximation; confirm
            jurisdiction with the consulate.
          </Text>
        </Box>
      )}
    </Box>
  );
}
