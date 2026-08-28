import { Box, Text } from "@chakra-ui/react";
import {
  BUCKETS,
  FLOW_CHANNEL,
  FLOW_COLORS,
  formatDate,
  formatMonthYear,
  radiusFor,
} from "../config";
import { monthsIn } from "../flows";
import { AnimatePresence, Appear } from "../motion";
import type { FacilityCollection, FacilityFlows } from "../types";

const FLOW_KEYS: { family: string; label: string }[] = [
  { family: "transfer", label: "Transfer" },
  { family: "removed", label: "Deportation" },
  { family: "arrested", label: "Arrest" },
];

const SIZE_STEPS = [10, 100, 1000];

interface Props {
  data: FacilityCollection;
  flows: FacilityFlows | null;
  /** Stays per dot for the current selection. */
  quantum: number;
}

export function Legend({ data, flows, quantum }: Props) {
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
      <AnimatePresence initial={false}>
        {flows && (
          <Appear
            key="flows"
            borderTopWidth="1px"
            borderColor="hairline"
            mt="2"
            pt="2"
          >
            <Text fontSize="xs" color="inkSecondary" mb="1">
              ● = {quantum} stays, not people
            </Text>
            <Box display="flex" alignItems="center" gap="2" py="1px" mb="1px">
              <Box
                width="14px"
                height="4px"
                borderRadius="2px"
                bg={FLOW_CHANNEL}
                flexShrink={0}
              />
              <Text fontSize="11px" color="inkSecondary" lineHeight="1.25">
                A route people are moved along
              </Text>
            </Box>

            {FLOW_KEYS.map((entry) => (
              <Box
                key={entry.family}
                display="flex"
                alignItems="center"
                gap="2"
                py="1px"
              >
                <Box
                  width="7px"
                  height="7px"
                  borderRadius="full"
                  bg={FLOW_COLORS[entry.family]}
                  flexShrink={0}
                />
                <Text fontSize="11px" color="ink" lineHeight="1.25">
                  {entry.label}
                </Text>
              </Box>
            ))}
            <Text fontSize="10px" color="inkMuted" mt="1" lineHeight="1.3">
              {formatMonthYear(flows.window[0])} –{" "}
              {formatMonthYear(flows.window[1])} · the last{" "}
              {monthsIn(flows.window)} complete months · data through{" "}
              {formatDate(flows.as_of)}
            </Text>
          </Appear>
        )}
      </AnimatePresence>

      <Box borderTopWidth="1px" borderColor="hairline" mt="2" pt="2">
        <Box display="flex" alignItems="center" gap="2" py="2px">
          <Box
            width="9px"
            height="9px"
            borderRadius="full"
            borderWidth="1.5px"
            borderColor="#5a5650"
            bg="panel"
            flexShrink={0}
            ml="1px"
          />
          <Text fontSize="xs" color="ink" lineHeight="1.25">
            Hold room or staging site
          </Text>
        </Box>
        <Text fontSize="10px" color="inkMuted" lineHeight="1.3" mt="2px">
          Where people are processed in transit. ICE reports no population for
          these; click one to see its flows.
        </Text>
        <Box display="flex" alignItems="center" gap="2" py="2px" mt="1">
          <Box
            width="9px"
            height="9px"
            borderRadius="full"
            bg="#8a857d"
            flexShrink={0}
            ml="1px"
          />
          <Text fontSize="xs" color="ink" lineHeight="1.25">
            Deportation destination
          </Text>
        </Box>
        <Text fontSize="10px" color="inkMuted" lineHeight="1.3" mt="2px">
          Click a country to see which facilities removed people there.
        </Text>
      </Box>

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
