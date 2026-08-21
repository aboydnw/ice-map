import { Box, Heading, Link, Text } from "@chakra-ui/react";
import { formatDate } from "../config";
import type { MatchReport } from "../types";

interface Props {
  report: MatchReport;
  onClose: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box mt="5">
      <Heading
        as="h3"
        fontFamily="heading"
        fontSize="lg"
        fontWeight="600"
        mb="1"
      >
        {title}
      </Heading>
      {children}
    </Box>
  );
}

export function MethodologyDialog({ report, onClose }: Props) {
  return (
    <Box
      position="fixed"
      inset="0"
      bg="rgba(26,24,23,0.45)"
      zIndex={20}
      display="flex"
      alignItems="center"
      justifyContent="center"
      p="4"
      onClick={onClose}
    >
      <Box
        bg="panel"
        borderRadius="8px"
        maxW="620px"
        width="100%"
        maxH="86vh"
        overflowY="auto"
        p={{ base: "5", md: "8" }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Methodology and sources"
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
        >
          <Heading as="h2" fontFamily="heading" fontSize="2xl" fontWeight="600">
            Methodology & sources
          </Heading>
          <Box
            as="button"
            onClick={onClose}
            aria-label="Close methodology"
            fontSize="lg"
            color="inkMuted"
            _hover={{ color: "ink" }}
          >
            ✕
          </Box>
        </Box>

        <Section title="What the numbers mean">
          <Text fontSize="sm" color="inkSecondary">
            Populations are ICE's{" "}
            <b>average daily population (ADP), fiscal-year-to-date</b> — the
            average number of people held each day since October 1, not a
            point-in-time headcount. Because it is a running average, it lags
            sudden changes. The current snapshot was pulled by ICE on{" "}
            {formatDate(report.pull_date)} and covers{" "}
            {report.snapshot_facilities} facilities holding a combined average
            of {report.national_adp.toLocaleString()} people per day.
          </Text>
        </Section>

        <Section title="What's not on the map">
          <Text fontSize="sm" color="inkSecondary">
            ICE's facility spreadsheet only lists facilities that held at least
            one person on the snapshot date, and excludes hold rooms and medical
            facilities. Facilities that stopped holding ICE detainees don't
            appear, even though many held people in the recent past.
          </Text>
        </Section>

        <Section title="Sources">
          <Text fontSize="sm" color="inkSecondary">
            All data comes from the{" "}
            <Link
              href="https://deportationdata.org"
              target="_blank"
              rel="noopener"
              color="#2a78d6"
              textDecoration="underline"
            >
              Deportation Data Project
            </Link>{" "}
            (CC0), which publishes ICE's{" "}
            <Link
              href="https://www.ice.gov/detain/detention-management"
              target="_blank"
              rel="noopener"
              color="#2a78d6"
              textDecoration="underline"
            >
              Detention Management reports
            </Link>{" "}
            in machine-readable form, plus a facility directory with verified
            coordinates. Facility populations are joined to verified locations
            by facility code where possible, with a human-reviewed alias table
            for renamed facilities. {report.matched} of{" "}
            {report.snapshot_facilities} facilities in the current snapshot are
            matched and mapped.
          </Text>
        </Section>

        <Section title="Publication cadence">
          <Text fontSize="sm" color="inkSecondary">
            ICE was required to publish these figures every two weeks until
            2026, when the mandate lapsed; releases have since become irregular.
            The map always states the date of the data it shows.
          </Text>
        </Section>

        <Text fontSize="xs" color="inkMuted" mt="6">
          Code and data pipeline:{" "}
          <Link
            href="https://github.com/aboydnw/ice-map"
            target="_blank"
            rel="noopener"
            textDecoration="underline"
          >
            github.com/aboydnw/ice-map
          </Link>
          . Basemap © CARTO, © OpenStreetMap contributors.
        </Text>
      </Box>
    </Box>
  );
}
