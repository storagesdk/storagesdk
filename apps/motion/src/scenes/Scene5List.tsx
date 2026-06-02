import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { RunIde } from '../components/RunIde';
import { type Row, StoreBrowser } from '../components/StoreBrowser';
import { Caption, Workspace } from '../components/Workspace';
import { SEED_ROWS } from '../lib/data';
import { useLayout } from '../lib/layout';
import { CRUD_METHOD_LINES } from '../lib/snippets';
import { ramp } from '../lib/timing';
import { theme } from '../theme';

const RUN_DONE = 48;

export const Scene5List: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale, stacked } = useLayout();
  const running = frame < RUN_DONE;
  const line = CRUD_METHOD_LINES.list;

  const rows: Row[] = SEED_ROWS.map((r, k) => {
    const start = RUN_DONE + 10 + k * 13;
    const op = ramp(frame, start, 16);
    return { ...r, opacity: op, translateY: (1 - op) * 16 };
  });

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
                text: "storage.list({ prefix: 'runs/' })",
                color: theme.textDim,
                show: frame > 8,
              },
              {
                text: 'items → 5 objects  ·  120.4 MB total',
                color: theme.good,
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
        list() — your objects, straight from the bucket
      </Caption>
    </AbsoluteFill>
  );
};
