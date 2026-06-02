import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { RunIde } from '../components/RunIde';
import { type Row, StoreBrowser } from '../components/StoreBrowser';
import { Caption, Workspace } from '../components/Workspace';
import { SEED_ROWS, UPLOADED_ROW } from '../lib/data';
import { useLayout } from '../lib/layout';
import { CRUD_METHOD_LINES } from '../lib/snippets';
import { pop, ramp } from '../lib/timing';
import { theme } from '../theme';

const RUN_DONE = 50;

export const Scene6Upload: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale, stacked } = useLayout();
  const running = frame < RUN_DONE;
  const line = CRUD_METHOD_LINES.upload;

  // The new object drops in at the top of the list after the call resolves.
  const appear = pop(frame, RUN_DONE + 6, 26);
  const newRow: Row = {
    ...UPLOADED_ROW,
    opacity: appear,
    translateY: (1 - appear) * -26,
    badge: 'new',
    highlight: ramp(frame, RUN_DONE + 6, 18) * (1 - ramp(frame, 170, 30)),
  };
  const rows: Row[] = [newRow, ...SEED_ROWS.map((r) => ({ ...r }))];

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
                text: "storage.upload('runs/hello.txt', 'Hello, storage SDK!')",
                color: theme.textDim,
                show: frame > 8,
              },
              {
                text: '✓ wrote runs/hello.txt  ·  19 B  ·  etag d41d8cd…',
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
        upload() — the new object appears instantly
      </Caption>
    </AbsoluteFill>
  );
};
