import { Easing, interpolate } from 'remotion';

/** Smooth ease used for most reveals/slides. */
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * 0→1 ramp over [start, start+duration], clamped at both ends.
 * The workhorse for "animate this in starting at frame N".
 */
export function ramp(
  frame: number,
  start: number,
  duration: number,
  easing = ease
): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** A pop that overshoots slightly then settles — good for badges/cards. */
export function pop(frame: number, start: number, duration = 18): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Characters revealed by `frame`, at `cps` chars/sec given `fps`. */
export function typed(
  frame: number,
  start: number,
  total: number,
  cps: number,
  fps: number
): number {
  if (frame < start) return 0;
  const chars = ((frame - start) / fps) * cps;
  return Math.max(0, Math.min(total, Math.floor(chars)));
}
