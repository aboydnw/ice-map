import { domMax } from "motion/react";

/**
 * Motion's animation engine, in its own chunk. `MotionProvider` imports this
 * file lazily so the main bundle carries only the tiny `m` components.
 */
export default domMax;
