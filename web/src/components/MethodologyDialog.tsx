import { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

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
        ref={dialogRef}
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
        tabIndex={-1}
        outline="none"
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

        <Section title="Facility details">
          <Text fontSize="sm" color="inkSecondary">
            Threat levels, mandatory-detention counts, inspection results, and
            average length of stay come from the same ICE reports (via DDP).
            Threat levels are ICE's own classification of criminal history; "no
            threat level" means ICE records no criminal conviction. Peak
            population and days in use are computed by DDP from ICE's
            individual-level detention records for the twelve months ending
            March 10, 2026. Deaths in custody are from UCLA Law's Behind Bars
            Data Project (
            <Link
              href="https://github.com/uclalawbehindbars/ICE_custody_mortality"
              target="_blank"
              rel="noopener"
              color="#2a78d6"
              textDecoration="underline"
            >
              ICE custody mortality dataset
            </Link>
            ), matched by ICE facility code. Operators are shown only when
            Wikipedia's{" "}
            <Link
              href="https://en.wikipedia.org/wiki/List_of_immigrant_detention_sites_in_the_United_States"
              target="_blank"
              rel="noopener"
              color="#2a78d6"
              textDecoration="underline"
            >
              list of detention sites
            </Link>{" "}
            (CC BY-SA 4.0) agrees with an independent signal — OpenStreetMap
            operator tags (© OpenStreetMap contributors, ODbL), the facility's
            own name, or its federal type. Photos and official page links are
            from ice.gov; photos are U.S. government works. Any item that fails
            validation is left out for that facility rather than guessed.
          </Text>
        </Section>

        <Section title="Consular districts">
          <Text fontSize="sm" color="inkSecondary">
            The optional overlay draws the jurisdiction of each foreign
            consulate in the United States — the area whose detained nationals
            that consulate is responsible for. Governments publish these only as
            lists of counties, so the polygons are built by joining each
            consulate's published list to the U.S. Census county boundaries
            (2021 cartographic files) and merging the counties. For Mexico the
            lists come from the Secretaría de Relaciones Exteriores: each
            consulate's own circunscripción page where one is archived, the
            SRE's 2018 consular directory otherwise, with the June 2022
            redistricting applied. The build refuses to run unless every county
            in the 50 states, DC, Puerto Rico, and the U.S. Virgin Islands
            belongs to exactly one consulate, so a stale list cannot draw a
            district short. Hover a district for its consulate; the legend gives
            the range of source dates.
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
