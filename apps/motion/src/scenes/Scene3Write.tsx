import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Code } from '../components/Code';
import { GlobeIcon } from '../components/icons';
import { Caption, Workspace } from '../components/Workspace';
import { caretLine } from '../lib/highlight';
import { useLayout } from '../lib/layout';
import { crudFile } from '../lib/snippets';
import { ramp, typed } from '../lib/timing';
import { theme } from '../theme';

const CODE = crudFile('tigris');

/** Type the Tigris adapter import, the Storage construction, then list/upload/delete. */
export const Scene3Write: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scale, stacked } = useLayout();

  // First scene to show the workspace, so it slides in here.
  const enter = ramp(frame, 0, 26);
  const reveal = typed(frame, 24, CODE.length, 38, fps);
  const capIn = ramp(frame, 30, 16);

  return (
    <AbsoluteFill>
      <Workspace
        enter={enter}
        focus={0.92}
        ide={
          <div style={{ padding: 30, height: '100%' }}>
            <Code
              code={CODE}
              reveal={reveal}
              fontSize={25 * scale}
              scrollToLine={stacked ? caretLine(CODE, reveal) : undefined}
            />
          </div>
        }
        browser={<DimStore />}
      />
      <Caption opacity={capIn}>
        Import an adapter, then call list, upload, delete and more
      </Caption>
    </AbsoluteFill>
  );
};

const DimStore: React.FC = () => (
  <div
    style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.border,
      background: theme.bg,
    }}
  >
    <GlobeIcon size={64} color={theme.border} />
  </div>
);
