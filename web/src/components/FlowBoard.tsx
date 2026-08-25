import { useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { FLOW_COLORS, formatMonthYear } from "../config";
import { TOP_EDGES, boardCsv, familyOf, remainderOf } from "../flows";
import type { BoardRow } from "../flows";
import type { FacilityFlows, FlowDirection } from "../types";

interface Props {
  facilityName: string;
  flows: FacilityFlows;
  direction: FlowDirection;
  onDirectionChange: (direction: FlowDirection) => void;
  rows: BoardRow[];
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
  highlightedKey: string | null;
  onHighlight: (key: string | null) => void;
  /** A country has arrivals only, so its board offers no direction toggle. */
  lockDirection?: boolean;
}

const HEADINGS: Record<FlowDirection, string> = {
  out: "Departures",
  in: "Arrivals",
};

function Toggle({
  direction,
  onChange,
}: {
  direction: FlowDirection;
  onChange: (direction: FlowDirection) => void;
}) {
  return (
    <Box
      display="flex"
      borderWidth="1px"
      borderColor="hairline"
      borderRadius="5px"
      overflow="hidden"
    >
      {(["out", "in"] as FlowDirection[]).map((option) => (
        <Box
          key={option}
          as="button"
          onClick={() => onChange(option)}
          aria-pressed={direction === option}
          px="10px"
          py="3px"
          fontSize="11px"
          fontWeight="600"
          bg={direction === option ? "ink" : "transparent"}
          color={direction === option ? "panel" : "inkSecondary"}
          _hover={direction === option ? undefined : { color: "ink" }}
        >
          {HEADINGS[option]}
        </Box>
      ))}
    </Box>
  );
}

function Row({
  row,
  widest,
  highlighted,
  onHighlight,
}: {
  row: BoardRow;
  widest: number;
  highlighted: boolean;
  onHighlight: (key: string | null) => void;
}) {
  return (
    <Box
      as="button"
      display="block"
      width="100%"
      textAlign="left"
      py="3px"
      px="4px"
      mx="-4px"
      borderRadius="3px"
      bg={highlighted ? "paper" : "transparent"}
      _hover={{ bg: "paper" }}
      _focusVisible={{ bg: "paper", outline: "1px solid", outlineColor: "ink" }}
      onMouseEnter={() => onHighlight(row.key)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(row.key)}
      onBlur={() => onHighlight(null)}
    >
      <Box display="flex" alignItems="baseline" gap="2">
        <Text
          fontSize="12px"
          lineHeight="1.3"
          color={row.lonLat ? "ink" : "inkSecondary"}
          flex="1 1 auto"
          minW="0"
          truncate
        >
          {row.label}
        </Text>
        <Text
          fontSize="12px"
          fontVariantNumeric="tabular-nums"
          color="inkSecondary"
          flexShrink={0}
        >
          {row.count.toLocaleString()}
        </Text>
      </Box>
      <Box height="3px" bg="hairline" borderRadius="2px" mt="3px">
        <Box
          height="100%"
          borderRadius="2px"
          bg={FLOW_COLORS[familyOf(row.key)] ?? FLOW_COLORS.other}
          width={`${widest > 0 ? (row.count / widest) * 100 : 0}%`}
          opacity={highlighted ? 1 : 0.8}
        />
      </Box>
    </Box>
  );
}

export function FlowBoard({
  facilityName,
  flows,
  direction,
  onDirectionChange,
  rows,
  showAll,
  onShowAllChange,
  highlightedKey,
  onHighlight,
  lockDirection = false,
}: Props) {
  const [copied, setCopied] = useState(false);

  const shown = showAll ? rows.length : Math.min(TOP_EDGES, rows.length);
  const visible = rows.slice(0, shown);
  const remainder = remainderOf(rows, shown);
  const widest = rows.length > 0 ? rows[0].count : 0;
  const total = flows.totals[direction];
  const linked = flows.coverage.origin_linked;

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        boardCsv(facilityName, direction, flows, rows),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the table stays on screen either way.
    }
  }

  return (
    <Box mt="5">
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap="2"
        mb="2"
      >
        <Text
          fontSize="xs"
          textTransform="uppercase"
          letterSpacing="0.08em"
          color="inkMuted"
          fontWeight="600"
        >
          Flows
        </Text>
        {!lockDirection && (
          <Toggle direction={direction} onChange={onDirectionChange} />
        )}
      </Box>

      <Text fontSize="11px" color="inkMuted" lineHeight="1.35" mb="2">
        Stints, not people · {formatMonthYear(flows.window[0])} –{" "}
        {formatMonthYear(flows.window[1])} · source: DDP
      </Text>

      <Box display="flex" alignItems="baseline" gap="2" mb="1">
        <Text
          fontFamily="heading"
          fontSize="18px"
          fontWeight="600"
          fontVariantNumeric="tabular-nums"
          lineHeight="1"
        >
          {total.toLocaleString()}
        </Text>
        <Text fontSize="11px" color="inkSecondary">
          {direction === "out" ? "book-outs" : "book-ins"} across{" "}
          {rows.length.toLocaleString()}{" "}
          {direction === "out" ? "destinations" : "origins"}
        </Text>
      </Box>

      <Box display="flex" flexDirection="column" gap="1px">
        {visible.map((row) => (
          <Row
            key={row.key}
            row={row}
            widest={widest}
            highlighted={row.key === highlightedKey}
            onHighlight={onHighlight}
          />
        ))}
      </Box>

      {remainder && (
        <Text fontSize="11px" color="inkMuted" mt="6px">
          and {remainder.destinations.toLocaleString()} more{" "}
          {direction === "out" ? "destinations" : "origins"} ·{" "}
          {remainder.count.toLocaleString()} stints
        </Text>
      )}

      <Box display="flex" gap="3" mt="8px">
        {rows.length > TOP_EDGES && (
          <Box
            as="button"
            onClick={() => onShowAllChange(!showAll)}
            fontSize="11px"
            color="inkSecondary"
            textDecoration="underline"
            _hover={{ color: "ink" }}
          >
            {showAll ? "Show top 10" : `Show all (${rows.length})`}
          </Box>
        )}
        <Box
          as="button"
          onClick={copy}
          fontSize="11px"
          color="inkSecondary"
          textDecoration="underline"
          _hover={{ color: "ink" }}
        >
          {copied ? "Copied" : "Copy as CSV"}
        </Box>
      </Box>

      {direction === "in" && linked !== null && (
        <Text fontSize="11px" color="inkMuted" mt="8px" lineHeight="1.4">
          Origin linked for {Math.round(linked * 100)}% of the{" "}
          {flows.coverage.origin_linked_of.toLocaleString()} people booked in
          here from outside detention. ICE's arrest data covers interior arrests
          by ERO; people apprehended by CBP at the border generally do not
          appear.
        </Text>
      )}
    </Box>
  );
}
