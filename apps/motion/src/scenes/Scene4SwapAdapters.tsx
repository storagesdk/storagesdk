import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Code } from '../components/Code';
import { CheckIcon } from '../components/icons';
import { Caption, Workspace } from '../components/Workspace';
import { useLayout } from '../lib/layout';
import { type AdapterId, CRUD_METHOD_LINES, crudFile } from '../lib/snippets';
import { easeInOut, ramp } from '../lib/timing';
import { fonts, theme } from '../theme';

// tigris briefly (carried from the previous scene), swap through the rest, then
// settle back on S3 — the backend the next "run" scenes operate on.
const SLOTS: { id: AdapterId; len: number }[] = [
  { id: 'tigris', len: 46 },
  { id: 's3', len: 66 },
  { id: 'azure', len: 66 },
  { id: 'github', len: 66 },
  { id: 's3', len: 76 },
];

// Cross-dissolve length at the start of each slot. The previous slot has fully
// settled (t=1) by the time the next begins (t=0 → showing the same adapter at
// full opacity), so the handoff is continuous — no pop at the boundary.
const DISSOLVE = 22;

function slotAt(frame: number) {
  let acc = 0;
  for (let i = 0; i < SLOTS.length; i++) {
    const { id, len } = SLOTS[i];
    if (frame < acc + len || i === SLOTS.length - 1) {
      return { i, id, local: frame - acc };
    }
    acc += len;
  }
  return { i: 0, id: SLOTS[0].id, local: frame };
}

const ORDER: AdapterId[] = ['tigris', 's3', 'azure', 'github'];

export const Scene4SwapAdapters: React.FC = () => {
  const frame = useCurrentFrame();
  const { scale, stacked } = useLayout();
  const { id, local, i } = slotAt(frame);

  // t: 0 → fully showing the previous adapter, 1 → fully showing this one.
  const t = i === 0 ? 1 : ramp(local, 0, DISSOLVE, easeInOut);
  const prevId = i > 0 ? SLOTS[i - 1].id : id;

  return (
    <AbsoluteFill>
      <Workspace
        focus={0.92}
        ide={
          <div style={{ padding: 30, height: '100%', position: 'relative' }}>
            <CodeLayer
              id={prevId}
              opacity={1 - t}
              scale={scale}
              stacked={stacked}
            />
            <CodeLayer id={id} opacity={t} scale={scale} stacked={stacked} />
            <UnchangedPin scale={scale} />
          </div>
        }
        browser={<SwapStory active={id} prev={prevId} t={t} scale={scale} />}
      />
      <Caption opacity={ramp(frame, 8, 16)} accent={theme.accent}>
        Swap the adapter — the methods never change
      </Caption>
    </AbsoluteFill>
  );
};

/**
 * One absolutely-positioned, top-aligned code layer. Every adapter's crudFile
 * is padded to the same line count (see CRUD_METHOD_LINES), so both the import
 * block and the list/upload/delete calls sit at identical positions across
 * adapters — the cross-dissolve only changes the config block in between, and
 * nothing else moves.
 */
const CodeLayer: React.FC<{
  id: AdapterId;
  opacity: number;
  scale: number;
  stacked: boolean;
}> = ({ id, opacity, scale, stacked }) => {
  if (opacity <= 0.001) return null;
  const lines = CRUD_METHOD_LINES;
  return (
    <div style={{ position: 'absolute', inset: 30, opacity }}>
      <Code
        code={crudFile(id)}
        fontSize={25 * scale}
        highlightLines={[lines.list, lines.upload, lines.delete]}
        highlightColor="rgba(45,212,191,0.10)"
        scrollToLine={stacked ? lines.upload : undefined}
      />
    </div>
  );
};

const UnchangedPin: React.FC<{ scale: number }> = ({ scale }) => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 9);
  return (
    <div
      style={{
        position: 'absolute',
        right: 26 * scale,
        bottom: 30 * scale,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingInline: 14 * scale,
        height: 34 * scale,
        borderRadius: 999,
        background: 'rgba(125,224,166,0.12)',
        border: `1px solid ${theme.good}`,
        color: theme.good,
        fontFamily: fonts.sans,
        fontSize: 15 * scale,
        fontWeight: 600,
        opacity: 0.7 + pulse * 0.3,
      }}
    >
      <CheckIcon size={15 * scale} color={theme.good} />
      same methods
    </div>
  );
};

const LABELS: Record<AdapterId, string> = {
  tigris: 'Tigris',
  s3: 'Amazon S3',
  azure: 'Azure Blob',
  github: 'GitHub',
};

/** Browser shows the backends; a selection glides smoothly to the active one. */
const SwapStory: React.FC<{
  active: AdapterId;
  prev: AdapterId;
  t: number;
  scale: number;
}> = ({ active, prev, t, scale }) => {
  const pitch = 68 * scale; // row height + gap
  const rowH = 56 * scale;
  const fromIdx = ORDER.indexOf(prev);
  const toIdx = ORDER.indexOf(active);
  const selIdx = interpolate(t, [0, 1], [fromIdx, toIdx]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22 * scale,
        background: theme.bg,
        fontFamily: fonts.sans,
      }}
    >
      <div style={{ color: theme.textDim, fontSize: 20 * scale }}>
        Same code, running on
      </div>
      <div style={{ position: 'relative', width: '70%' }}>
        {/* gliding selection */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: selIdx * pitch,
            height: rowH,
            borderRadius: 12,
            background: 'rgba(45,212,191,0.10)',
            border: `1px solid ${theme.accent}`,
            boxShadow: `0 0 22px -6px ${theme.accentGlow}`,
          }}
        />
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 12 * scale }}
        >
          {ORDER.map((a) => {
            const lit = a === active ? t : a === prev ? 1 - t : 0;
            const c = theme.adapters[a];
            return (
              <div
                key={a}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  height: rowH,
                  paddingInline: 20,
                  borderRadius: 12,
                  opacity: 0.5 + lit * 0.5,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: c,
                    boxShadow: `0 0 ${10 * lit}px ${c}`,
                  }}
                />
                <span
                  style={{
                    fontSize: 21 * scale,
                    fontWeight: 600,
                    color: lit > 0.5 ? theme.text : theme.textDim,
                    fontFamily: fonts.mono,
                  }}
                >
                  {LABELS[a]}
                </span>
                <span style={{ marginLeft: 'auto', opacity: lit }}>
                  <CheckIcon size={20 * scale} color={c} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
