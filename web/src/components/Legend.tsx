import { Box, Text } from "@chakra-ui/react";
import { BUCKETS, FLOW_COLORS, radiusFor } from "../config";
import { QUANTUM } from "../flows";
import type { FacilityCollection, FacilityFlows } from "../types";

const FLOW_KEYS: { family: string; label: string }[] = [
  { family: "transfer", label: "Transfer" },
  { family: "removed", label: "Deportation" },
  { family: "arrested", label: "Arrest" },
  { family: "released", label: "Release — no destination recorded" },
];

const SIZE_STEPS = [10, 100, 1000];

interface Props {
  data: FacilityCollection;
  flows: FacilityFlows | null;
}

export function Legend({ data, flows }: Props) {
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
      {flows && (
        <Box borderTopWidth="1px" borderColor="hairline" mt="2" pt="2">
          <Text fontSize="xs" color="inkSecondary" mb="1">
            ● = {QUANTUM} stints, not people
          </Text>
          {FLOW_KEYS.map((entry) => (
            <Box
              key={entry.family}
              display="flex"
              alignItems="center"
              gap="2"
              py="1px"
            >
              <Box
                width="14px"
                height="2px"
                borderRadius="1px"
                bg={FLOW_COLORS[entry.family]}
                flexShrink={0}
              />
              <Text fontSize="11px" color="ink" lineHeight="1.25">
                {entry.label}
              </Text>
            </Box>
          ))}
          <Text fontSize="10px" color="inkMuted" mt="1" lineHeight="1.3">
            {flows.window[0]} – {flows.window[1]} · after {flows.as_of}, not yet
            reported
          </Text>
        </Box>
      )}

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
    </Box>
  );
}
