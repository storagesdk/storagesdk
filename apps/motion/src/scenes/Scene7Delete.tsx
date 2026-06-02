import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { RunIde } from '../components/RunIde';
import { type Row, StoreBrowser } from '../components/StoreBrowser';
import { Caption, Workspace } from '../components/Workspace';
import { SEED_ROWS, UPLOADED_ROW } from '../lib/data';
import { useLayout } from '../lib/layout';
import { CRUD_METHOD_LINES } from '../lib/snippets';
import { ramp } from '../lib/timing';
import { theme } from '../theme';

const RUN_DONE = 50;

export const Scene7Delete: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale, stacked } = useLayout();
  const running = frame < RUN_DONE;
  const line = CRUD_METHOD_LINES.delete;

  // The uploaded row (carried from scene 6) is struck through, then collapses.
  const strike = ramp(frame, RUN_DONE + 8, 20);
  const collapse = ramp(frame, RUN_DONE + 34, 22);
  const target: Row = {
    ...UPLOADED_ROW,
    strike,
    collapse,
    highlight: (1 - strike) * 0.6,
  };
  const rows: Row[] = [target, ...SEED_ROWS.map((r) => ({ ...r }))];

  const capIn = ramp(frame, 8, 16);

  return (
    <AbsoluteFill>
      <Workspace
        focus={0.4}
        ide={
          <RunIde
            adapter="s3"
            activeLine={line}
            running={running}
            scale={scale}
            scrollToLine={stacked ? line : undefined}
            console={[
              {
                text: "storage.delete('runs/hello.txt')",
                color: theme.textDim,
                show: frame > 8,
              },
              {
                text: '✓ removed runs/hello.txt',
                color: theme.bad,
                show: frame >= RUN_DONE,
              },
            ]}
          />
        }
        browser={
          <StoreBrowser
            bucket="agent-runs"
            adapterColor={theme.adapters.s3}
            adapterLabel="Amazon S3"
            rows={rows}
            scale={scale}
          />
        }
      />
      <Caption opacity={capIn} accent={theme.adapters.s3}>
        delete() — gone from the bucket in real time
      </Caption>
    </AbsoluteFill>
  );
};
