import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { ConsoleLine } from '../components/RunIde';
import { SnapshotStory } from '../components/SnapshotStory';
import { SteppedIde } from '../components/SteppedIde';
import { Caption, Workspace } from '../components/Workspace';
import { useLayout } from '../lib/layout';
import { SNAPSHOT_LINES, snapshotFile } from '../lib/snippets';
import { ramp } from '../lib/timing';
import { theme } from '../theme';

const CODE = snapshotFile();

// Step timing — write 'before' → snapshot → overwrite 'after' → read both.
const WRITE_BEFORE = 40;
const SNAP = 100;
const WRITE_AFTER = 160;
const READS = 225;

export const Scene8Snapshots: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale, stacked } = useLayout();

  const activeLines: number[] =
    frame >= READS
      ? [SNAPSHOT_LINES.readFrozen, SNAPSHOT_LINES.readLive]
      : frame >= WRITE_AFTER
        ? [SNAPSHOT_LINES.writeAfter]
        : frame >= SNAP
          ? [SNAPSHOT_LINES.snapshot]
          : frame >= WRITE_BEFORE
            ? [SNAPSHOT_LINES.writeBefore]
            : [];

  const consoleLines: ConsoleLine[] = [
    {
      text: "✓ runs/hello.txt = 'before'",
      color: theme.textDim,
      show: frame >= WRITE_BEFORE,
    },
    {
      text: 'snapshot baseline created · snap_3f8a',
      color: theme.info,
      show: frame >= SNAP,
    },
    {
      text: "✓ runs/hello.txt = 'after'  (live overwrite)",
      color: theme.good,
      show: frame >= WRITE_AFTER,
    },
    {
      text: "frozen.download() → 'before'   ·   storage.download() → 'after'",
      color: theme.info,
      show: frame >= READS,
    },
  ];

  const capIn = ramp(frame, 10, 18);

  return (
    <AbsoluteFill>
      <Workspace
        focus={0.5}
        ideTitle="snapshots.ts — agent-runs"
        browserTitle="Snapshots"
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
          <SnapshotStory
            before={ramp(frame, WRITE_BEFORE + 18, 20)}
            snap={ramp(frame, SNAP + 15, 20)}
            after={ramp(frame, WRITE_AFTER + 15, 20)}
            reads={ramp(frame, READS + 12, 24)}
            scale={scale}
            compact={stacked}
          />
        }
      />
      <Caption opacity={capIn} accent={theme.info}>
        Snapshots — read frozen state after a live overwrite
      </Caption>
    </AbsoluteFill>
  );
};
