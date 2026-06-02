import type React from 'react';
import { fonts, theme } from '../theme';
import { CameraIcon, CheckIcon } from './icons';

type Props = {
  /** 0→1 reveal of each beat. */
  before: number;
  snap: number;
  after: number;
  reads: number;
  scale?: number;
  /** Shrink the vertical footprint to fit the short stacked browser panel. */
  compact?: boolean;
};

const EventRow: React.FC<{
  appear: number;
  color: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  value?: { text: string; color: string };
  scale: number;
}> = ({ appear, color, icon, label, value, scale }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      opacity: appear,
      transform: `translateX(${(1 - appear) * -16}px)`,
    }}
  >
    <span
      style={{
        width: 40 * scale,
        height: 40 * scale,
        borderRadius: 10,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
    <span
      style={{
        color: theme.text,
        fontFamily: fonts.sans,
        fontSize: 19 * scale,
      }}
    >
      {label}
    </span>
    {value ? (
      <span
        style={{
          marginLeft: 'auto',
          fontFamily: fonts.mono,
          fontSize: 18 * scale,
          color: value.color,
          background: `${value.color}1A`,
          border: `1px solid ${value.color}44`,
          padding: '4px 12px',
          borderRadius: 8,
        }}
      >
        “{value.text}”
      </span>
    ) : null}
  </div>
);

const ValueCard: React.FC<{
  appear: number;
  label: string;
  sub: string;
  color: string;
  value: string;
  frozen?: boolean;
  scale: number;
}> = ({ appear, label, sub, color, value, frozen, scale }) => (
  <div
    style={{
      flex: 1,
      opacity: appear,
      transform: `translateY(${(1 - appear) * 18}px)`,
      borderRadius: 14,
      border: `1px solid ${color}66`,
      background: `${color}10`,
      padding: `${16 * scale}px ${18 * scale}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{ width: 10, height: 10, borderRadius: 999, background: color }}
      />
      <span
        style={{
          color: theme.text,
          fontWeight: 700,
          fontSize: 18 * scale,
          fontFamily: fonts.sans,
        }}
      >
        {label}
      </span>
      {frozen ? (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 13 * scale,
            fontWeight: 600,
            color,
            border: `1px solid ${color}66`,
            borderRadius: 999,
            padding: '2px 10px',
          }}
        >
          frozen
        </span>
      ) : null}
    </div>
    <div
      style={{
        color: theme.textDim,
        fontSize: 14 * scale,
        fontFamily: fonts.mono,
      }}
    >
      {sub}
    </div>
    <div
      style={{
        marginTop: 4,
        fontFamily: fonts.mono,
        fontSize: 23 * scale,
        color,
        fontWeight: 600,
      }}
    >
      “{value}”
    </div>
  </div>
);

/** runs/hello.txt is written, snapshotted, then overwritten — the snapshot keeps the old bytes. */
export const SnapshotStory: React.FC<Props> = ({
  before,
  snap,
  after,
  reads,
  scale = 1,
  compact = false,
}) => {
  const s = compact ? scale * 0.86 : scale;
  return (
    <div
      style={{
        height: '100%',
        background: theme.bg,
        padding: `${(compact ? 18 : 28) * scale}px ${30 * scale}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: (compact ? 14 : 22) * scale,
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: (compact ? 11 : 16) * scale,
        }}
      >
        <EventRow
          appear={before}
          color={theme.textDim}
          icon={<CheckIcon size={18 * s} color={theme.textDim} />}
          label={
            <>
              wrote <code>runs/hello.txt</code>
            </>
          }
          value={{ text: 'before', color: theme.textDim }}
          scale={s}
        />
        <EventRow
          appear={snap}
          color={theme.info}
          icon={<CameraIcon size={20 * s} color={theme.info} />}
          label={
            <>
              snapshot <b>baseline</b> captured
            </>
          }
          scale={s}
        />
        <EventRow
          appear={after}
          color={theme.good}
          icon={<CheckIcon size={18 * s} color={theme.good} />}
          label={
            <>
              overwrote <code>runs/hello.txt</code>
            </>
          }
          value={{ text: 'after', color: theme.good }}
          scale={s}
        />
      </div>

      <div style={{ height: 1, background: theme.border, opacity: reads }} />

      <div style={{ display: 'flex', gap: 16 * scale }}>
        <ValueCard
          appear={reads}
          label="Live read"
          sub="storage.download(…)"
          color={theme.good}
          value="after"
          scale={s}
        />
        <ValueCard
          appear={reads}
          label="Snapshot read"
          sub="snapshots.get(snap.id)"
          color={theme.info}
          value="before"
          frozen
          scale={s}
        />
      </div>

      <div
        style={{
          opacity: reads,
          textAlign: 'center',
          color: theme.textDim,
          fontFamily: fonts.sans,
          fontSize: 16 * s,
        }}
      >
        same key, same instant — the snapshot still returns the frozen bytes
      </div>
    </div>
  );
};
