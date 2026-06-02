import { useVideoConfig } from 'remotion';

export type LayoutMode = 'landscape' | 'square' | 'vertical';

export type Layout = {
  mode: LayoutMode;
  /** IDE + Browser side by side (landscape) vs stacked (square/vertical). */
  stacked: boolean;
  width: number;
  height: number;
  /** A global content scale so type/cards read well at every size. */
  scale: number;
  pad: number;
};

/**
 * One responsive layout derived from the composition's own dimensions, so the
 * exact same scene tree renders correctly at 16:9, 1:1, and 9:16 with no
 * per-format branches in the scenes themselves.
 */
export function useLayout(): Layout {
  const { width, height } = useVideoConfig();
  const ratio = width / height;
  const mode: LayoutMode =
    ratio > 1.3 ? 'landscape' : ratio < 0.85 ? 'vertical' : 'square';
  return {
    mode,
    stacked: mode !== 'landscape',
    width,
    height,
    scale: mode === 'landscape' ? 1 : mode === 'square' ? 0.92 : 1.04,
    pad: mode === 'vertical' ? 56 : 72,
  };
}
