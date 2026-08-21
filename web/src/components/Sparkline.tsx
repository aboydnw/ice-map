import { useMemo, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { formatDate } from "../config";

const WIDTH = 320;
const HEIGHT = 96;
const PAD = { top: 14, right: 8, bottom: 16, left: 8 };

interface Props {
  points: [string, number][];
}

export function Sparkline({ points }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const times = points.map(([date]) =>
      new Date(`${date}T00:00:00`).getTime(),
    );
    const values = points.map(([, value]) => value);
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const vMax = Math.max(...values, 1);
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
    const peakIndex = values.indexOf(Math.max(...values));
    return { coords, path, peakIndex, times };
  }, [points]);

  if (points.length < 2) {
    return (
      <Text fontSize="xs" color="inkMuted">
        Only one snapshot available for this facility.
      </Text>
    );
  }

  const { coords, path, peakIndex } = geometry;
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

  return (
    <Box>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Average daily population over time"
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
        <path
          d={path}
          fill="none"
          stroke="#2a78d6"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {peakIndex !== active && (
          <circle
            cx={coords[peakIndex][0]}
            cy={coords[peakIndex][1]}
            r="2.5"
            fill="#2a78d6"
          />
        )}
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
      <Box display="flex" justifyContent="space-between" mt="1">
        <Text fontSize="xs" color="inkSecondary">
          {formatDate(points[active][0])}
        </Text>
        <Text
          fontSize="xs"
          fontWeight="600"
          color="ink"
          fontVariantNumeric="tabular-nums"
        >
          {points[active][1].toLocaleString()}
        </Text>
      </Box>
      <Box display="flex" justifyContent="space-between">
        <Text fontSize="10px" color="inkMuted">
          {formatDate(points[0][0])} – {formatDate(points[lastIndex][0])}
        </Text>
        <Text fontSize="10px" color="inkMuted">
          peak {points[peakIndex][1].toLocaleString()}
        </Text>
      </Box>
    </Box>
  );
}
