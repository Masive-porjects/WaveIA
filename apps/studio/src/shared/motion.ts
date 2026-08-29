/**
 * Mindloop-style fade-up entrance helper.
 * Reusable across sections for consistent scroll-reveal motion.
 * Usage: <motion.div {...fadeUp(0)}>...</motion.div>
 */
export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, delay, ease: "easeOut" as const },
});

/** Shared view transition (upload <-> mastering). */
export const VIEW_TRANSITION = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -40 },
  transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
};
