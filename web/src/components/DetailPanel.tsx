import { Box, Heading, Text } from "@chakra-ui/react";
import { BUCKETS, formatDate } from "../config";
import { Sparkline } from "./Sparkline";
import type { FacilityFeature } from "../types";

interface Props {
  facility: FacilityFeature;
  history: [string, number][] | undefined;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box
      display="flex"
      justifyContent="space-between"
      gap="4"
      py="6px"
      borderBottomWidth="1px"
      borderColor="hairline"
    >
      <Text fontSize="sm" color="inkSecondary">
        {label}
      </Text>
      <Text
        fontSize="sm"
        color="ink"
        textAlign="right"
        fontVariantNumeric="tabular-nums"
      >
        {value}
      </Text>
    </Box>
  );
}

export function DetailPanel({ facility, history, onClose }: Props) {
  const p = facility.properties;
  const bucket = BUCKETS.find((b) => b.key === p.bucket);
  const criminal = p.male_crim + p.female_crim;
  const nonCriminal = p.male_non_crim + p.female_non_crim;

  return (
    <Box
      position="absolute"
      top={{ base: "unset", md: "12px" }}
      bottom={{ base: "0", md: "12px" }}
      right={{ base: "0", md: "12px" }}
      left={{ base: "0", md: "unset" }}
      width={{ base: "100%", md: "370px" }}
      maxH={{ base: "62%", md: "unset" }}
      bg="panel"
      borderWidth="1px"
      borderColor="hairline"
      borderRadius={{ base: "10px 10px 0 0", md: "8px" }}
      boxShadow="0 4px 24px rgba(26,24,23,0.16)"
      overflowY="auto"
      zIndex={6}
      p="5"
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
        gap="3"
      >
        <Box>
          <Text
            fontSize="xs"
            textTransform="uppercase"
            letterSpacing="0.08em"
            color={bucket?.color ?? "inkMuted"}
            fontWeight="600"
          >
            {bucket?.label ?? p.type_detailed} · {p.type_detailed}
          </Text>
          <Heading
            as="h2"
            fontFamily="heading"
            fontSize="2xl"
            fontWeight="600"
            lineHeight="1.15"
            mt="1"
          >
            {p.name}
          </Heading>
          <Text fontSize="sm" color="inkSecondary" mt="1">
            {p.address}
          </Text>
        </Box>
        <Box
          as="button"
          onClick={onClose}
          aria-label="Close facility details"
          fontSize="lg"
          lineHeight="1"
          color="inkMuted"
          _hover={{ color: "ink" }}
          px="1"
        >
          ✕
        </Box>
      </Box>

      <Box display="flex" alignItems="baseline" gap="2" mt="4">
        <Text
          fontFamily="heading"
          fontSize="4xl"
          fontWeight="600"
          lineHeight="1"
          fontVariantNumeric="tabular-nums"
        >
          {p.adp.toLocaleString()}
        </Text>
        <Text fontSize="xs" color="inkSecondary" maxW="140px" lineHeight="1.3">
          avg. daily population, FY to date
        </Text>
      </Box>

      <Box mt="4">
        <Row
          label="No criminal conviction"
          value={nonCriminal.toLocaleString()}
        />
        <Row label="Criminal conviction" value={criminal.toLocaleString()} />
        {p.male_female && <Row label="Holds" value={p.male_female} />}
        {p.guaranteed_minimum != null && p.guaranteed_minimum > 0 && (
          <Row
            label="Guaranteed minimum beds"
            value={p.guaranteed_minimum.toLocaleString()}
          />
        )}
        {p.inspection_rating && (
          <Row
            label="Last inspection"
            value={`${p.inspection_rating}${
              p.inspection_date ? ` · ${formatDate(p.inspection_date)}` : ""
            }`}
          />
        )}
        {p.field_office && (
          <Row label="ICE field office" value={p.field_office} />
        )}
      </Box>

      <Box mt="5">
        <Text
          fontSize="xs"
          textTransform="uppercase"
          letterSpacing="0.08em"
          color="inkMuted"
          fontWeight="600"
          mb="2"
        >
          Population since 2019
        </Text>
        {history ? (
          <Sparkline points={history} />
        ) : (
          <Text fontSize="xs" color="inkMuted">
            No history available for this facility.
          </Text>
        )}
      </Box>
    </Box>
  );
}
