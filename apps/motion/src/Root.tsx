import { Composition } from 'remotion';
import { Main, TOTAL_FRAMES } from './Main';

const FPS = 30;

/**
 * Landscape (16:9) is the focus for now — the landing-page hero. The scenes
 * already lay out responsively via `useLayout()`, so the Square (1:1) and
 * Vertical (9:16) compositions below can be re-enabled for social once the
 * landscape cut is locked.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Landscape"
      component={Main}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
    {/*
    <Composition
      id="Square"
      component={Main}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1080}
    />
    <Composition
      id="Vertical"
      component={Main}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
    />
    */}
  </>
);
