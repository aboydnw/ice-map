import { Box, Text, chakra } from "@chakra-ui/react";
import { BUCKETS, formatDate, radiusFor } from "../config";
import { sourceYears } from "../consular";
import type {
  ConsularCollection,
  ConsularCountry,
  FacilityCollection,
} from "../types";

const SIZE_STEPS = [10, 100, 1000];

const CountrySelect = chakra("select");

interface Props {
  data: FacilityCollection;
  countries: ConsularCountry[];
  selectedCountry: string | null;
  onCountryChange: (key: string | null) => void;
  districts: ConsularCollection | null;
}

export function Legend({
  data,
  countries,
  selectedCountry,
  onCountryChange,
  districts,
}: Props) {
  const counts = new Map<string, number>();
  for (const feature of data.features) {
    counts.set(
      feature.properties.bucket,
      (counts.get(feature.properties.bucket) ?? 0) + 1,
    );
  }
  const maxR = radiusFor(SIZE_STEPS[SIZE_STEPS.length - 1]);
  const svgH = maxR * 2 + 18;

  return (
    <Box
      position="absolute"
      bottom={{ base: "unset", md: "26px" }}
      top={{ base: "10px", md: "unset" }}
      left="10px"
      bg="panel"
      borderWidth="1px"
      borderColor="hairline"
      borderRadius="6px"
      boxShadow="0 2px 12px rgba(26,24,23,0.10)"
      px="4"
      py="3"
      zIndex={4}
      maxW={{ base: "210px", md: "240px" }}
    >
      {BUCKETS.filter(
        (bucket) => bucket.key !== "other" || (counts.get("other") ?? 0) > 0,
      ).map((bucket) => (
        <Box
          key={bucket.key}
          display="flex"
          alignItems="center"
          gap="2"
          py="2px"
        >
          <Box
            width="10px"
            height="10px"
            borderRadius="full"
            bg={bucket.color}
            flexShrink={0}
          />
          <Text fontSize="xs" color="ink">
            {bucket.label}
          </Text>
          <Text
            fontSize="xs"
            color="inkMuted"
            ml="auto"
            fontVariantNumeric="tabular-nums"
          >
            {counts.get(bucket.key) ?? 0}
          </Text>
        </Box>
      ))}

      <Box borderTopWidth="1px" borderColor="hairline" mt="2" pt="2">
        <Text fontSize="xs" color="inkSecondary" mb="1">
          Circle size = avg. daily population
        </Text>
        <svg
          width="100%"
          height={svgH}
          role="img"
          aria-label="Circle size reference: 10, 100, and 1,000 people"
        >
          {SIZE_STEPS.map((step, i) => {
            const r = radiusFor(step);
            const cx = 24 + i * 62;
            return (
              <g key={step}>
                <circle
                  cx={cx}
                  cy={maxR + 2}
                  r={r}
                  fill="none"
                  stroke="#898781"
                  strokeWidth="1.2"
                />
                <text
                  x={cx}
                  y={maxR * 2 + 14}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#52514e"
                  fontFamily="inherit"
                >
                  {step.toLocaleString()}
                </text>
              </g>
            );
          })}
        </svg>
      </Box>

      {countries.length > 0 && (
        <Box borderTopWidth="1px" borderColor="hairline" mt="2" pt="2">
          <Box
            as="label"
            display="flex"
            alignItems="center"
            gap="2"
            fontSize="xs"
            color="inkSecondary"
          >
            <Text as="span" whiteSpace="nowrap">
              Consular districts
            </Text>
            <CountrySelect
              aria-label="Consular districts overlay"
              value={selectedCountry ?? ""}
              onChange={(event) => onCountryChange(event.target.value || null)}
              ml="auto"
              fontSize="xs"
              color="ink"
              bg="paper"
              borderWidth="1px"
              borderColor="hairline"
              borderRadius="4px"
              px="1"
              py="2px"
              maxW="110px"
            >
              <option value="">None</option>
              {countries.map((country) => (
                <option key={country.key} value={country.key}>
                  {country.name}
                </option>
              ))}
            </CountrySelect>
          </Box>
          {districts && (
            <Text fontSize="10px" color="inkMuted" mt="1" lineHeight="1.3">
              {districts.meta.districts} jurisdictions as published by{" "}
              {districts.meta.source}, sources {sourceYears(districts)} · built{" "}
              {formatDate(districts.meta.built)}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
