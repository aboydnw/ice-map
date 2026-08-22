import { useEffect, useMemo, useState } from "react";
import { Box, Heading, Spinner, Text } from "@chakra-ui/react";
import { DetailPanel } from "./components/DetailPanel";
import { FacilityMap } from "./components/FacilityMap";
import { Legend } from "./components/Legend";
import { MethodologyDialog } from "./components/MethodologyDialog";
import { STALE_AFTER_DAYS, formatDate } from "./config";
import { useConsular } from "./useConsular";
import type { FacilityCollection, History, MatchReport } from "./types";

interface Loaded {
  facilities: FacilityCollection;
  history: History;
  report: MatchReport;
}

export default function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const consular = useConsular();

  useEffect(() => {
    Promise.all(
      ["facilities.geojson", "history.json", "match_report.json"].map((file) =>
        fetch(`${import.meta.env.BASE_URL}data/${file}`).then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        }),
      ),
    )
      .then(([facilities, history, report]) =>
        setData({ facilities, history, report }),
      )
      .catch(() => setError(true));
  }, []);

  const staleDays = useMemo(() => {
    if (!data) return 0;
    const pulled = new Date(`${data.report.pull_date}T00:00:00`).getTime();
    return Math.floor((Date.now() - pulled) / 86_400_000);
  }, [data]);

  if (error) {
    return (
      <Box
        display="flex"
        height="100%"
        alignItems="center"
        justifyContent="center"
        p="6"
      >
        <Text color="inkSecondary">
          The map data failed to load. Please try again later.
        </Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box
        display="flex"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner size="lg" color="inkMuted" />
      </Box>
    );
  }

  const selectedFeature = selected
    ? data.facilities.features.find((f) => f.properties.detloc === selected)
    : null;

  return (
    <Box display="flex" flexDirection="column" height="100%">
      <Box
        as="header"
        display="flex"
        alignItems={{ base: "flex-start", md: "baseline" }}
        flexDirection={{ base: "column", md: "row" }}
        gap={{ base: "1", md: "6" }}
        px={{ base: "4", md: "6" }}
        py="3"
        borderBottomWidth="1px"
        borderColor="hairline"
        bg="panel"
      >
        <Box display="flex" alignItems="baseline" gap="3">
          <Heading
            as="h1"
            fontFamily="heading"
            fontSize={{ base: "xl", md: "2xl" }}
            fontWeight="600"
          >
            ICE Detention Map
          </Heading>
          <Text
            fontSize="sm"
            color="inkSecondary"
            display={{ base: "none", lg: "block" }}
          >
            Where people are held in U.S. immigration detention
          </Text>
        </Box>
        <Box
          display="flex"
          alignItems="baseline"
          gap="4"
          ml={{ base: "0", md: "auto" }}
        >
          <Box display="flex" alignItems="baseline" gap="2">
            <Text
              fontFamily="heading"
              fontSize={{ base: "lg", md: "xl" }}
              fontWeight="600"
              fontVariantNumeric="tabular-nums"
            >
              {data.report.national_adp.toLocaleString()}
            </Text>
            <Text fontSize="xs" color="inkSecondary">
              people per day, on average
            </Text>
          </Box>
          <Text fontSize="xs" color="inkMuted">
            Data as of {formatDate(data.report.pull_date)}
          </Text>
        </Box>
      </Box>

      {staleDays > STALE_AFTER_DAYS && (
        <Box bg="#f6e8cf" px={{ base: "4", md: "6" }} py="2">
          <Text fontSize="xs" color="#5c4a1e">
            ⚠ ICE has not published newer figures since{" "}
            {formatDate(data.report.pull_date)} — {staleDays} days ago.
            Publication became irregular after the biweekly reporting mandate
            lapsed in 2026.
          </Text>
        </Box>
      )}

      <Box position="relative" flex="1" minH="0">
        <FacilityMap
          data={data.facilities}
          selected={selected}
          onSelect={setSelected}
          districts={consular.districts}
        />
        <Legend
          data={data.facilities}
          countries={consular.countries}
          selectedCountry={consular.selected}
          onCountryChange={consular.select}
          districts={consular.districts}
        />
        {selectedFeature && (
          <DetailPanel
            facility={selectedFeature}
            history={data.history[selectedFeature.properties.detloc]}
            onClose={() => setSelected(null)}
          />
        )}
      </Box>

      <Box
        as="footer"
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        gap="1"
        px={{ base: "4", md: "6" }}
        py="6px"
        borderTopWidth="1px"
        borderColor="hairline"
        bg="panel"
      >
        <Text fontSize="xs" color="inkMuted">
          {data.report.matched} of {data.report.snapshot_facilities} facilities
          mapped · Data: Deportation Data Project (CC0), from ICE Detention
          Management reports ·
        </Text>
        <Box
          as="button"
          onClick={() => setShowMethodology(true)}
          fontSize="xs"
          color="inkSecondary"
          textDecoration="underline"
          _hover={{ color: "ink" }}
        >
          Methodology & sources
        </Box>
      </Box>

      {showMethodology && (
        <MethodologyDialog
          report={data.report}
          onClose={() => setShowMethodology(false)}
        />
      )}
    </Box>
  );
}
