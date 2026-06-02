import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ForkGraph } from '../components/ForkGraph';
import type { ConsoleLine } from '../components/RunIde';
import { SteppedIde } from '../components/SteppedIde';
import { Caption, Workspace } from '../components/Workspace';
import { useLayout } from '../lib/layout';
import { FORK_LINES, forkFile } from '../lib/snippets';
import { ramp } from '../lib/timing';
import { theme } from '../theme';

const CODE = forkFile();

// Step timing — snapshot → fork from it → write into fork → read both back.
const SNAP = 45;
const FORK = 110;
const WRITE = 175;
const READS = 245;

export const Scene9Forks: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale, stacked } = useLayout();

  const activeLines: number[] =
    frame >= READS
      ? [FORK_LINES.readFork, FORK_LINES.readParent]
      : frame >= WRITE
        ? [FORK_LINES.forkWrite]
        : frame >= FORK
          ? [10, 11, 12, 13]
          : frame >= SNAP
            ? [FORK_LINES.snapshot]
            : [];

  const consoleLines: ConsoleLine[] = [
    {
      text: 'snapshot baseline created · snap_3f8a',
      color: theme.info,
      show: frame >= SNAP,
    },
    {
      text: 'fork experiment created  ←  snap_3f8a',
      color: theme.warn,
      show: frame >= FORK,
    },
    {
      text: "✓ wrote runs/hello.txt in fork 'experiment'",
      color: theme.good,
      show: frame >= WRITE,
    },
    {
      text: "fork.download() → 'mutated…'   ·   storage.download() → 'after'",
      color: theme.warn,
      show: frame >= READS,
    },
  ];

  const capIn = ramp(frame, 10, 18);

  return (
    <AbsoluteFill>
      <Workspace
        focus={0.5}
        ideTitle="forks.ts — agent-runs"
        browserTitle="Forks"
        ide={
          <SteppedIde
            code={CODE}
            activeLines={activeLines}
            console={consoleLines}
            scale={scale}
            scrollToLine={
              stacked ? activeLines[activeLines.length - 1] || 8 : undefined
            }
          />
        }
        browser={
          <ForkGraph
            snap={ramp(frame, SNAP + 15, 20)}
            fork={ramp(frame, FORK + 15, 20)}
            write={ramp(frame, WRITE + 15, 20)}
            reads={ramp(frame, READS + 12, 24)}
            scale={scale}
            compact={stacked}
          />
        }
      />
      <Caption opacity={capIn} accent={theme.adapters.tigris}>
        Forks — branch, mutate, and leave the parent untouched
      </Caption>
    </AbsoluteFill>
  );
};
