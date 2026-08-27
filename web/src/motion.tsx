import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Box, Text } from "@chakra-ui/react";
import type { BoxProps, TextProps } from "@chakra-ui/react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  m,
  useReducedMotion,
} from "motion/react";
import type { MotionProps } from "motion/react";

/**
 * The house motion tokens. Every animated thing in the app picks from these,
 * so the whole interface moves like it was made by one hand. Durations are
 * seconds because that is what Motion takes.
 */
const loadFeatures = () =>
  import("./motionFeatures").then((module) => module.default);

/** The house ease as a function of normalised time; a quintic ease-out. */
export function easeOut(t: number): number {
  return 1 - (1 - t) ** 5;
}

export const MOTION = {
  duration: {
    /** Hover and toggle states; anything that should feel instant. */
    micro: 0.16,
    /** Content appearing or changing in place. */
    base: 0.24,
    /** Panels, sheets, and numbers settling. */
    slow: 0.36,
  },
  /** One ease-out for everything that enters or settles: quick, then gentle. */
  ease: [0.22, 1, 0.36, 1] as const,
  /** Stagger between siblings in a list, per item. */
  stagger: 0.028,
  /** How far a panel travels as it enters, in px. */
  slide: 18,
};

/**
 * Wrap the app once. Loads Motion's animation features lazily (the `m`
 * components below stay tiny until then) and honours the OS reduced-motion
 * setting for every one of them.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

export { AnimatePresence };

/**
 * A Chakra Box that Motion can animate. Chakra's `transition` prop (a CSS
 * shorthand) and Motion's `transition` prop (timing for animate/exit) share
 * a name, so the Chakra one is dropped: Motion owns timing on these elements.
 */
const MotionBox = m.create(Box) as unknown as ComponentType<
  Omit<BoxProps, "transition" | "style"> &
    Pick<MotionProps, "initial" | "animate" | "exit" | "transition" | "layout">
>;

/**
 * A side panel that slides and fades in when it mounts and out when it
 * leaves. Mount it inside an `AnimatePresence` with a stable `key` so the
 * exit plays; keep the key the same across selections so only the contents
 * change, not the panel.
 */
export function SlidePanel({ children, ...box }: Omit<BoxProps, "transition">) {
  return (
    <MotionBox
      initial={{ opacity: 0, x: MOTION.slide }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: MOTION.slide }}
      transition={{ duration: MOTION.duration.slow, ease: MOTION.ease }}
      {...box}
    >
      {children}
    </MotionBox>
  );
}

/**
 * A number that rolls to its new value instead of jumping. Tabular figures so
 * the text does not jitter as digits change. Jumps straight to the value when
 * the viewer prefers reduced motion.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  ...text
}: { value: number; format?: (n: number) => string } & TextProps) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (reduced || from === value) {
      setShown(value);
      return;
    }
    const began = performance.now();
    const length = MOTION.duration.slow * 1000;
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - began) / length);
      setShown(from + (value - from) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return (
    <Text as="span" fontVariantNumeric="tabular-nums" {...text}>
      {format(shown)}
    </Text>
  );
}

/**
 * Cross-fades between contents when `id` changes — switching a board from
 * departures to arrivals, a tab, a selected item's details. The old content
 * finishes leaving before the new one arrives, so the two never overlap.
 */
export function FadeSwap({
  id,
  children,
  ...box
}: { id: string | number; children: ReactNode } & Omit<
  BoxProps,
  "transition"
>) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <MotionBox
        key={id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: MOTION.duration.base, ease: MOTION.ease }}
        {...box}
      >
        {children}
      </MotionBox>
    </AnimatePresence>
  );
}

/**
 * One item of a list that fades and rises into place, staggered by its
 * `index` so a list reads as arriving rather than snapping in. Also animates
 * to its new position when siblings are added or removed.
 */
export function Appear({
  index = 0,
  children,
  ...box
}: { index?: number; children: ReactNode } & Omit<BoxProps, "transition">) {
  return (
    <MotionBox
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: MOTION.duration.base,
        ease: MOTION.ease,
        delay: Math.min(index, 12) * MOTION.stagger,
      }}
      {...box}
    >
      {children}
    </MotionBox>
  );
}
