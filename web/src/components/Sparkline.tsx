import { useMemo, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { formatDate, formatMonthYear } from "../config";

const WIDTH = 330;
const HEIGHT = 110;
const PAD = { top: 16, right: 8, bottom: 6, left: 8 };

interface Props {
  points: [string, number][];
  guaranteedMinimum: number | null;
}

export function Sparkline({ points, guaranteedMinimum }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const times = points.map(([date]) =>
      new Date(`${date}T00:00:00`).getTime(),
    );
    const values = points.map(([, value]) => value);
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const vMax = Math.max(...values, guaranteedMinimum ?? 0, 1) * 1.04;
    const x = (t: number) =>
      PAD.left +
      ((t - t0) / Math.max(t1 - t0, 1)) * (WIDTH - PAD.left - PAD.right);
    const y = (v: number) =>
      HEIGHT - PAD.bottom - (v / vMax) * (HEIGHT - PAD.top - PAD.bottom);
    const coords = times.map((t, i) => [x(t), y(values[i])] as const);
    const path = coords
      .map(
        ([px, py], i) =>
          `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`,
      )
      .join(" ");
    const gmY = guaranteedMinimum ? y(guaranteedMinimum) : null;
    return { coords, path, gmY };
  }, [points, guaranteedMinimum]);

  if (points.length < 2) {
    return (
      <Text fontSize="xs" color="inkMuted">
        Only one snapshot available for this facility.
      </Text>
    );
  }

  const { coords, path, gmY } = geometry;
  const lastIndex = points.length - 1;
  const active = hoverIndex ?? lastIndex;
  const [ax, ay] = coords[active];

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    let bestDist = Infinity;
    coords.forEach(([cx], i) => {
      const d = Math.abs(cx - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverIndex(best);
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    const current = hoverIndex ?? lastIndex;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight")
      next = Math.min(lastIndex, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = lastIndex;
    if (next !== null) {
      event.preventDefault();
      setHoverIndex(next);
    }
  }

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="baseline"
        mb="2"
      >
        <Text
          fontSize="xs"
          textTransform="uppercase"
          letterSpacing="0.08em"
          color="inkMuted"
          fontWeight="600"
        >
          Detained population
        </Text>
        <Text fontSize="xs" color="inkSecondary" aria-live="polite">
          <Text
            as="span"
            fontWeight="600"
            color="ink"
            fontVariantNumeric="tabular-nums"
          >
            {points[active][1].toLocaleString()}
          </Text>{" "}
          · {formatDate(points[active][0])}
        </Text>
      </Box>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Average daily population over time. Use left and right arrow keys to step through snapshots; the value and date appear above the chart."
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        style={{ display: "block", cursor: "crosshair" }}
      >
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={HEIGHT - PAD.bottom}
          y2={HEIGHT - PAD.bottom}
          stroke="#c3c2b7"
          strokeWidth="1"
        />
        {gmY !== null && (
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={gmY}
            y2={gmY}
            stroke="#898781"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke="#2a78d6"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <line
          x1={ax}
          x2={ax}
          y1={PAD.top - 4}
          y2={HEIGHT - PAD.bottom}
          stroke="#898781"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <circle
          cx={ax}
          cy={ay}
          r="3.5"
          fill="#2a78d6"
          stroke="#fdfcfa"
          strokeWidth="1.5"
        />
      </svg>
      <Box display="flex" justifyContent="space-between" mt="2px">
        <Text fontSize="11px" color="inkMuted">
          {formatMonthYear(points[0][0])}
        </Text>
        <Text fontSize="11px" color="inkMuted">
          {formatShortDate(points[lastIndex][0])}
        </Text>
      </Box>
      {guaranteedMinimum && (
        <Box display="flex" alignItems="center" gap="6px" mt="6px">
          <Box
            as="span"
            width="18px"
            borderTopWidth="1px"
            borderTopStyle="dashed"
            borderColor="#898781"
            aria-hidden="true"
          />
          <Text fontSize="11px" color="inkSecondary">
            Guaranteed minimum: {guaranteedMinimum.toLocaleString()} beds ICE
            pays for whether or not they are used
          </Text>
        </Box>
      )}
    </Box>
  );
}

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
