import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { AbsoluteFill } from 'remotion';
import { Background } from './components/Background';
import { Scene1Install } from './scenes/Scene1Install';
import { Scene3Write } from './scenes/Scene3Write';
import { Scene4SwapAdapters } from './scenes/Scene4SwapAdapters';
import { Scene5List } from './scenes/Scene5List';
import { Scene6Upload } from './scenes/Scene6Upload';
import { Scene7Delete } from './scenes/Scene7Delete';
import { Scene8Snapshots } from './scenes/Scene8Snapshots';
import { Scene9Forks } from './scenes/Scene9Forks';

/**
 * Per-scene durations in frames (at 30fps). Paced for reading: each scene
 * holds well past the moment its content lands. The snapshot and fork scenes
 * get the most room — they're the SDK's headline capability.
 */
export const SCENES = [
  { Comp: Scene1Install, dur: 165 },
  { Comp: Scene3Write, dur: 310 },
  { Comp: Scene4SwapAdapters, dur: 320 },
  { Comp: Scene5List, dur: 220 },
  { Comp: Scene6Upload, dur: 210 },
  { Comp: Scene7Delete, dur: 210 },
  { Comp: Scene8Snapshots, dur: 360 },
  { Comp: Scene9Forks, dur: 380 },
] as const;

const TRANSITION = 22;

/** Total composition length, accounting for overlapping transitions. */
export const TOTAL_FRAMES =
  SCENES.reduce((n, s) => n + s.dur, 0) - (SCENES.length - 1) * TRANSITION;

export const Main: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <TransitionSeries>
      {SCENES.flatMap(({ Comp, dur }, i) => {
        const id = Comp.name;
        const seq = (
          <TransitionSeries.Sequence key={id} durationInFrames={dur}>
            <Comp />
          </TransitionSeries.Sequence>
        );
        if (i === SCENES.length - 1) return [seq];
        return [
          seq,
          <TransitionSeries.Transition
            key={`${id}-fade`}
            presentation={fade()}
            timing={linearTiming({ durationInFrames: TRANSITION })}
          />,
        ];
      })}
    </TransitionSeries>
  </AbsoluteFill>
);
