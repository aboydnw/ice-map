import { useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { THREAT_COLORS } from "../config";
import type { ThreatLevels } from "../types";

const SEGMENTS: { key: keyof ThreatLevels; label: string }[] = [
  { key: "none", label: "no criminal-history threat level" },
  { key: "level_3", label: "ICE threat level 3 (least serious)" },
  { key: "level_2", label: "ICE threat level 2" },
  { key: "level_1", label: "ICE threat level 1 (most serious)" },
];

interface Props {
  threat: ThreatLevels;
  mandatory: number | null;
  adp: number;
}

export function ThreatBar({ threat, mandatory, adp }: Props) {
  const [active, setActive] = useState<keyof ThreatLevels | null>(null);
  const total = SEGMENTS.reduce((sum, s) => sum + threat[s.key], 0);
  const shown = active ?? "none";
  const pct = (key: keyof ThreatLevels) =>
    total > 0 ? Math.round((threat[key] / total) * 100) : 0;
  const mandatoryPct =
    mandatory !== null && adp > 0 ? Math.round((mandatory / adp) * 100) : null;

  return (
    <Box>
      <Text
        fontSize="xs"
        textTransform="uppercase"
        letterSpacing="0.08em"
        color="inkMuted"
        fontWeight="600"
        mb="2"
      >
        Who is held here
      </Text>
      <Box
        display="flex"
        gap="2px"
        borderRadius="3px"
        overflow="hidden"
        role="img"
        aria-label={SEGMENTS.map((s) => `${pct(s.key)}% ${s.label}`).join(", ")}
        onMouseLeave={() => setActive(null)}
      >
        {SEGMENTS.map((segment) => (
          <Box
            key={segment.key}
            height="14px"
            width={`${total > 0 ? (threat[segment.key] / total) * 100 : 0}%`}
            bg={THREAT_COLORS[segment.key]}
            opacity={active && active !== segment.key ? 0.45 : 1}
            cursor="pointer"
            onMouseEnter={() => setActive(segment.key)}
            onClick={() => setActive(segment.key)}
          />
        ))}
      </Box>
      <Text fontSize="13px" color="ink" mt="6px" aria-live="polite">
        {pct(shown)}% {SEGMENTS.find((s) => s.key === shown)?.label} ·{" "}
        {threat[shown].toLocaleString()} people
      </Text>
      {mandatoryPct !== null && (
        <Text fontSize="13px" color="inkSecondary" mt="2px">
          {mandatoryPct}% held without bond eligibility (mandatory detention)
        </Text>
      )}
    </Box>
  );
}
