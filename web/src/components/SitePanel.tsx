import { Box, Heading, Text } from "@chakra-ui/react";
import { FlowBoard } from "./FlowBoard";
import type { BoardCut, BoardRow, FlowView } from "../flows";
import type { FacilityFlows, FlowDirection } from "../types";

export type SiteKind = "processing" | "country";

const COPY: Record<
  SiteKind,
  { eyebrow: string; stints: string; note: string; close: string }
> = {
  processing: {
    eyebrow: "Hold room or staging site",
    stints: "stints moved through, in either direction",
    note: "ICE publishes no detained population for hold rooms, field offices, or staging sites — they are excluded from the Detention Management reports the rest of this map is built from. What the individual-level records do show is who was moved through, and where they went next.",
    close: "Close site details",
  },
  country: {
    eyebrow: "Deportation destination",
    stints: "stints removed here from facilities on this map",
    note: "Each row is the facility a person was in when ICE recorded their removal to this country. Removals from facilities the map cannot place are not counted, so this is a floor, not a total.",
    close: "Close country details",
  },
};

interface Props {
  kind: SiteKind;
  name: string;
  stints: number;
  onClose: () => void;
  flows: FacilityFlows | null;
  flowRows: BoardRow[];
  flowDirection: FlowDirection;
  onFlowDirectionChange: (direction: FlowDirection) => void;
  flowCut: BoardCut;
  flowView: FlowView;
  onFlowViewChange: (view: FlowView) => void;
  highlightedFlowKey: string | null;
  onHighlightFlow: (key: string | null) => void;
}

/**
 * The panel for a hold room, field office, or staging site. These places are
 * absent from ICE's population reports, so there is no population, threat
 * breakdown, or inspection record to show — only where people came from and
 * went next, which the stint data does record.
 */
export function SitePanel({
  kind,
  name,
  stints,
  onClose,
  flows,
  flowRows,
  flowDirection,
  onFlowDirectionChange,
  flowCut,
  flowView,
  onFlowViewChange,
  highlightedFlowKey,
  onHighlightFlow,
}: Props) {
  const copy = COPY[kind];
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
            color="inkSecondary"
            fontWeight="600"
          >
            {copy.eyebrow}
          </Text>
          <Heading
            as="h2"
            fontFamily="heading"
            fontSize="2xl"
            fontWeight="600"
            lineHeight="1.15"
            mt="1"
          >
            {name}
          </Heading>
        </Box>
        <Box
          as="button"
          onClick={onClose}
          aria-label={copy.close}
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
          {stints.toLocaleString()}
        </Text>
        <Text fontSize="xs" color="inkSecondary" maxW="150px" lineHeight="1.3">
          {copy.stints}
        </Text>
      </Box>

      <Text fontSize="13px" color="inkSecondary" mt="4" lineHeight="1.45">
        {copy.note}
      </Text>

      {flows && flowRows.length > 0 ? (
        <FlowBoard
          facilityName={name}
          flows={flows}
          direction={flowDirection}
          onDirectionChange={onFlowDirectionChange}
          rows={flowRows}
          cut={flowCut}
          view={flowView}
          onViewChange={onFlowViewChange}
          highlightedKey={highlightedFlowKey}
          onHighlight={onHighlightFlow}
          lockDirection={kind === "country"}
        />
      ) : (
        <Text fontSize="xs" color="inkMuted" mt="5">
          No recorded movement through this site in the data window.
        </Text>
      )}
    </Box>
  );
}
