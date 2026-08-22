import { Box, Heading, Link, Text } from "@chakra-ui/react";
import {
  BUCKETS,
  DEATHS_SOURCE_URL,
  DIRECTORY_URL,
  HOTLINE,
  formatDate,
  formatMonthYear,
} from "../config";
import { FlowBoard } from "./FlowBoard";
import { Sparkline } from "./Sparkline";
import { ThreatBar } from "./ThreatBar";
import type { BoardRow } from "../flows";
import type { FacilityFeature, FacilityFlows, FlowDirection } from "../types";

interface Props {
  facility: FacilityFeature;
  history: [string, number][] | undefined;
  onClose: () => void;
  flows: FacilityFlows | null;
  flowRows: BoardRow[];
  flowDirection: FlowDirection;
  onFlowDirectionChange: (direction: FlowDirection) => void;
  showAllFlows: boolean;
  onShowAllFlowsChange: (showAll: boolean) => void;
  highlightedFlowKey: string | null;
  onHighlightFlow: (key: string | null) => void;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="xs"
      textTransform="uppercase"
      letterSpacing="0.08em"
      color="inkMuted"
      fontWeight="600"
      mb="2"
    >
      {children}
    </Text>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <Box
      flex="1 1 0"
      bg="paper"
      borderWidth="1px"
      borderColor="hairline"
      borderRadius="6px"
      px="10px"
      pt="10px"
      pb="8px"
    >
      <Text
        fontFamily="heading"
        fontSize="20px"
        fontWeight="600"
        lineHeight="1"
        fontVariantNumeric="tabular-nums"
      >
        {value}
      </Text>
      <Text fontSize="11px" color="inkSecondary" mt="4px" lineHeight="1.25">
        {label}
      </Text>
    </Box>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={{ display: "inline", verticalAlign: "-1px", marginLeft: "3px" }}
      aria-hidden="true"
    >
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" />
    </svg>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      color="#2a78d6"
      textDecoration="underline"
    >
      {children}
      <ExternalIcon />
    </Link>
  );
}

export function DetailPanel({
  facility,
  history,
  onClose,
  flows,
  flowRows,
  flowDirection,
  onFlowDirectionChange,
  showAllFlows,
  onShowAllFlowsChange,
  highlightedFlowKey,
  onHighlightFlow,
}: Props) {
  const p = facility.properties;
  const bucket = BUCKETS.find((b) => b.key === p.bucket);
  const inspection = p.inspection;
  const inspectionDate = inspection?.date
    ? formatDate(inspection.date)
    : inspection?.scheduled
      ? `scheduled ${inspection.scheduled}`
      : null;
  const showStay = p.alos || p.last_year;

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
      {p.photo && (
        <Box
          mx="-5"
          mt="-5"
          mb="14px"
          height="110px"
          position="relative"
          overflow="hidden"
          borderTopRadius={{ base: "10px", md: "8px" }}
        >
          <img
            src={`${import.meta.env.BASE_URL}${p.photo}`}
            alt={`${p.name}, photo published by ICE`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
          <Text
            position="absolute"
            right="8px"
            bottom="6px"
            fontSize="10px"
            color="panel"
            bg="rgba(26,24,23,0.55)"
            px="6px"
            py="2px"
            borderRadius="3px"
          >
            Photo: ICE
          </Text>
        </Box>
      )}

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
          {p.operator && (
            <Box display="flex" alignItems="center" gap="6px" mt="6px">
              <Text fontSize="13px" color="inkSecondary">
                Operated by {p.operator.name}
              </Text>
              <Text
                as="span"
                fontSize="10px"
                fontWeight="600"
                letterSpacing="0.06em"
                textTransform="uppercase"
                color="inkSecondary"
                borderWidth="1px"
                borderColor="#c9c3b9"
                borderRadius="3px"
                px="5px"
                py="1px"
              >
                {p.operator.kind}
              </Text>
            </Box>
          )}
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

      {p.threat && (
        <Box mt="5">
          <ThreatBar threat={p.threat} mandatory={p.mandatory} adp={p.adp} />
        </Box>
      )}

      <Box mt="5">
        {history && history.length > 0 ? (
          <Sparkline
            points={history}
            guaranteedMinimum={p.guaranteed_minimum}
          />
        ) : (
          <>
            <Eyebrow>Detained population</Eyebrow>
            <Text fontSize="xs" color="inkMuted">
              No history available for this facility.
            </Text>
          </>
        )}
      </Box>

      {flows && flowRows.length > 0 && (
        <FlowBoard
          facilityName={p.name}
          flows={flows}
          direction={flowDirection}
          onDirectionChange={onFlowDirectionChange}
          rows={flowRows}
          showAll={showAllFlows}
          onShowAllChange={onShowAllFlowsChange}
          highlightedKey={highlightedFlowKey}
          onHighlight={onHighlightFlow}
        />
      )}

      {showStay && (
        <Box mt="5">
          <Eyebrow>Stay &amp; use</Eyebrow>
          <Box display="flex" gap="2">
            {p.alos && (
              <Tile
                value={`${p.alos.days} days`}
                label={`avg. stay, FY${String(p.alos.fiscal_year).slice(2)}`}
              />
            )}
            {p.last_year && (
              <>
                <Tile
                  value={p.last_year.peak.toLocaleString()}
                  label={`peak, 12 mo. to ${formatMonthYear(p.last_year.window_end)}`}
                />
                <Tile
                  value={`${p.last_year.days_in_use}/365`}
                  label={`days in use, 12 mo. to ${formatMonthYear(p.last_year.window_end)}`}
                />
              </>
            )}
          </Box>
        </Box>
      )}

      {(inspection || p.deaths) && (
        <Box mt="5">
          <Eyebrow>Oversight</Eyebrow>
          {inspection && (
            <Text fontSize="13px" lineHeight="1.45">
              {inspection.self_assessment
                ? "Self-assessed by the facility (ORSA)"
                : inspection.type_code === "PRE-OCCUPANCY"
                  ? "Pre-occupancy review only — not yet inspected"
                  : `Inspected by ${inspection.body}`}
              {inspection.rating && (
                <>
                  {" · "}
                  <Text as="span" fontWeight="600">
                    {inspection.rating}
                  </Text>
                </>
              )}
              {inspectionDate && ` · ${inspectionDate}`}
              {inspection.standard &&
                ` · held to ${inspection.standard} standards`}
              {inspection.self_assessment && (
                <Text as="span" color="#9c6b1e">
                  {" "}
                  ⚠ not an independent inspection
                </Text>
              )}
            </Text>
          )}
          {p.odo_report_url && (
            <Text fontSize="13px" mt="1">
              <ExternalLink href={p.odo_report_url}>
                Inspection report (PDF)
              </ExternalLink>
            </Text>
          )}
          {p.deaths && (
            <Text
              fontSize="13px"
              mt="10px"
              color={p.deaths.count > 0 ? "#9c3b33" : "inkMuted"}
            >
              {p.deaths.count > 0 ? (
                <>
                  <Text as="span" fontWeight="600">
                    {p.deaths.count} {p.deaths.count === 1 ? "death" : "deaths"}{" "}
                    in custody
                  </Text>
                  {" since 2003"}
                  {p.deaths.last && ` · last ${formatDate(p.deaths.last)}`}
                  {" · "}
                  <Link
                    href={DEATHS_SOURCE_URL}
                    target="_blank"
                    rel="noopener"
                    color="#9c3b33"
                    textDecoration="underline"
                  >
                    UCLA Law data
                    <ExternalIcon />
                  </Link>
                </>
              ) : (
                "No reported deaths in custody since 2003"
              )}
            </Text>
          )}
        </Box>
      )}

      <Box borderTopWidth="1px" borderColor="hairline" mt="5" pt="14px">
        <Eyebrow>Resources</Eyebrow>
        <Box display="flex" flexDirection="column" gap="6px" fontSize="13px">
          {p.ice_page_url && (
            <Text fontSize="13px">
              <ExternalLink href={p.ice_page_url}>
                Official ICE facility page
              </ExternalLink>
              {p.phone && (
                <Text as="span" color="inkMuted">
                  {" "}
                  · {p.phone}
                </Text>
              )}
            </Text>
          )}
          <Text fontSize="13px">
            {HOTLINE.label}{" "}
            <Text as="span" fontWeight="600" fontVariantNumeric="tabular-nums">
              {HOTLINE.number}
            </Text>
            <Text as="span" color="inkMuted">
              {" "}
              · free from inside ICE facilities
            </Text>
          </Text>
          <Text fontSize="13px">
            <ExternalLink href={DIRECTORY_URL}>
              Visitation &amp; legal support directory
            </ExternalLink>
            <Text as="span" color="inkMuted">
              {" "}
              · Freedom for Immigrants
            </Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
