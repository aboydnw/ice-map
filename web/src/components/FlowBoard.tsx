import { useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { FLOW_COLORS, formatMonthYear } from "../config";
import {
  FAMILY_LABELS,
  boardCsv,
  familiesIn,
  familyOf,
  monthsIn,
  rowTarget,
  toggleFamily,
} from "../flows";
import type { BoardCut, BoardRow, FlowFamily, FlowView } from "../flows";
import type { FacilityFlows, FlowDirection } from "../types";
import { AnimatePresence, Appear, CountUp, FadeSwap } from "../motion";

interface Props {
  facilityName: string;
  flows: FacilityFlows;
  direction: FlowDirection;
  onDirectionChange: (direction: FlowDirection) => void;
  rows: BoardRow[];
  cut: BoardCut;
  view: FlowView;
  onViewChange: (view: FlowView) => void;
  highlightedKey: string | null;
  onHighlight: (key: string | null) => void;
  /** Selects the far end of a row: a facility code or a country id. */
  onSelect?: (detloc: string) => void;
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

function Chips({
  present,
  view,
  onChange,
}: {
  present: FlowFamily[];
  view: FlowView;
  onChange: (view: FlowView) => void;
}) {
  const active = view.families.length === 0 ? present : view.families;
  return (
    <Box display="flex" flexWrap="wrap" gap="4px" mb="2">
      {present.map((family) => {
        const on = active.includes(family);
        return (
          <Box
            key={family}
            as="button"
            aria-pressed={on}
            onClick={() => onChange(toggleFamily(view, family, present))}
            display="flex"
            alignItems="center"
            gap="5px"
            px="7px"
            py="2px"
            fontSize="11px"
            fontWeight="600"
            borderRadius="999px"
            borderWidth="1px"
            borderColor={on ? "ink" : "hairline"}
            color={on ? "ink" : "inkMuted"}
            _hover={{ color: "ink" }}
            transition="color 160ms ease-out, border-color 160ms ease-out"
          >
            <Box
              width="7px"
              height="7px"
              borderRadius="full"
              bg={FLOW_COLORS[family]}
              opacity={on ? 1 : 0.35}
              transition="opacity 160ms ease-out"
            />
            {FAMILY_LABELS[family]}
          </Box>
        );
      })}
    </Box>
  );
}

function Row({
  row,
  widest,
  highlighted,
  onHighlight,
  onSelect,
}: {
  row: BoardRow;
  widest: number;
  highlighted: boolean;
  onHighlight: (key: string | null) => void;
  onSelect?: (detloc: string) => void;
}) {
  const target = onSelect ? rowTarget(row) : null;
  return (
    <Box
      as={target ? "button" : "div"}
      tabIndex={0}
      title={row.label}
      cursor={target ? "pointer" : "default"}
      onClick={target ? () => onSelect?.(target) : undefined}
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
          transition="width 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease-out"
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
  cut,
  view,
  onViewChange,
  highlightedKey,
  onHighlight,
  onSelect,
  lockDirection = false,
}: Props) {
  const [copied, setCopied] = useState(false);

  const present = familiesIn(rows);
  const { visible, hidden, coverage, matched } = cut;
  const hiddenCount = hidden.reduce((sum, row) => sum + row.count, 0);
  const widest = visible.length > 0 ? visible[0].count : 0;
  const noun = direction === "out" ? "destinations" : "origins";
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
        Stays, not people · {formatMonthYear(flows.window[0])} –{" "}
        {formatMonthYear(flows.window[1])} · source: DDP
      </Text>

      <Box display="flex" alignItems="baseline" gap="2" mb="1">
        <CountUp
          value={total}
          fontFamily="heading"
          fontSize="18px"
          fontWeight="600"
          lineHeight="1"
        />
        <Text fontSize="11px" color="inkSecondary">
          {direction === "out" ? "book-outs" : "book-ins"} across{" "}
          {rows.length.toLocaleString()}{" "}
          {direction === "out" ? "destinations" : "origins"} · about{" "}
          {Math.round(total / monthsIn(flows.window)).toLocaleString()} a month
        </Text>
      </Box>

      {present.length > 1 && (
        <Chips present={present} view={view} onChange={onViewChange} />
      )}

      <FadeSwap id={direction}>
        <Box display="flex" flexDirection="column" gap="1px">
          <AnimatePresence initial={false}>
            {visible.map((row, index) => (
              <Appear key={row.key} index={index}>
                <Row
                  row={row}
                  widest={widest}
                  highlighted={row.key === highlightedKey}
                  onHighlight={onHighlight}
                  onSelect={onSelect}
                />
              </Appear>
            ))}
          </AnimatePresence>
        </Box>
      </FadeSwap>

      {hidden.length > 0 && (
        <Box
          as="button"
          display="flex"
          width="100%"
          alignItems="baseline"
          gap="2"
          py="3px"
          px="4px"
          mx="-4px"
          mt="1px"
          borderRadius="3px"
          textAlign="left"
          _hover={{ bg: "paper" }}
          onClick={() => onViewChange({ ...view, expanded: true })}
        >
          <Text fontSize="12px" color="inkSecondary" flex="1 1 auto">
            Other · {hidden.length.toLocaleString()} more {noun} · show ▸
          </Text>
          <Text
            fontSize="12px"
            fontVariantNumeric="tabular-nums"
            color="inkSecondary"
          >
            {hiddenCount.toLocaleString()}
          </Text>
        </Box>
      )}

      <Text fontSize="11px" color="inkMuted" mt="6px">
        {visible.length.toLocaleString()} of {matched.toLocaleString()} {noun} ·{" "}
        {Math.round(coverage * 100)}% of stays
        {matched < rows.length && ` · ${rows.length - matched} filtered out`}
      </Text>

      <Box display="flex" gap="3" mt="8px">
        {view.expanded ? (
          <Box
            as="button"
            onClick={() => onViewChange({ ...view, expanded: false })}
            fontSize="11px"
            color="inkSecondary"
            textDecoration="underline"
            _hover={{ color: "ink" }}
          >
            Collapse
          </Box>
        ) : (
          hidden.length > 0 && (
            <Box
              as="button"
              onClick={() => onViewChange({ ...view, expanded: true })}
              fontSize="11px"
              color="inkSecondary"
              textDecoration="underline"
              _hover={{ color: "ink" }}
            >
              Show all flows
            </Box>
          )
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
          {flows.coverage.origin_linked_of.toLocaleString()} stays that began
          here from outside detention. ICE's arrest data covers interior arrests
          by ERO; people apprehended by CBP at the border generally do not
          appear.
        </Text>
      )}
    </Box>
  );
}
