import type { Transition, Variants } from 'framer-motion';

export function springy(prefersReducedMotion: boolean): Transition {
  if (prefersReducedMotion) return { duration: 0 };
  return { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
