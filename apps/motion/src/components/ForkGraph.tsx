import type React from 'react';
import { fonts, theme } from '../theme';
import { BranchIcon, CameraIcon, CheckIcon, FileIcon } from './icons';

type Props = {
  /** 0 none · 1 snapshot · 2 fork · 3 fork write (cumulative reveal 0→1 each). */
  snap: number;
  fork: number;
  write: number;
  /** 0→1 reveal of the parent-vs-fork divergence read at the bottom. */
  reads?: number;
  scale?: number;
  /** Shrink the vertical footprint to fit the short stacked browser panel. */
  compact?: boolean;
};

/** A path→value read result, used to show parent and fork diverging. */
const ReadResult: React.FC<{
  appear: number;
  label: string;
  value: string;
  color: string;
  scale: number;
}> = ({ appear, label, value, color, scale }) => (
  <div
    style={{
      flex: 1,
      opacity: appear,
      transform: `translateY(${(1 - appear) * 14}px)`,
      borderRadius: 12,
      border: `1px solid ${color}55`,
      background: `${color}10`,
      padding: `${12 * scale}px ${14 * scale}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}
  >
    <span style={{ fontSize: 14 * scale, color, fontFamily: fonts.mono }}>
      {label}
    </span>
    <span
      style={{
        fontSize: 20 * scale,
        color: theme.text,
        fontFamily: fonts.mono,
        fontWeight: 600,
      }}
    >
      “{value}”
    </span>
  </div>
);

const Connector: React.FC<{ grow: number; color: string; height: number }> = ({
  grow,
  color,
  height,
}) => (
  <div
    style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: 34 }}
  >
    <div
      style={{
        width: 2,
        height,
        background: color,
        transformOrigin: 'top',
        transform: `scaleY(${grow})`,
        opacity: 0.6,
      }}
    />
  </div>
);

const Node: React.FC<{
  appear: number;
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tag?: string;
  tagColor?: string;
  scale: number;
  children?: React.ReactNode;
}> = ({
  appear,
  color,
  icon,
  title,
  subtitle,
  tag,
  tagColor,
  scale,
  children,
}) => (
  <div
    style={{
      opacity: appear,
      transform: `translateY(${(1 - appear) * 16}px) scale(${0.96 + appear * 0.04})`,
      borderRadius: 14,
      border: `1px solid ${color}66`,
      background: `${color}12`,
      padding: `${16 * scale}px ${18 * scale}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        style={{
          width: 38 * scale,
          height: 38 * scale,
          borderRadius: 10,
          background: `${color}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
        }}
      >
        {icon}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 21 * scale,
            color: theme.text,
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 15 * scale, color: theme.textDim }}>
          {subtitle}
        </span>
      </div>
      {tag ? (
        <span
          style={{
            marginLeft: 'auto',
            paddingInline: 12,
            height: 28 * scale,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            background: `${tagColor ?? color}1F`,
            border: `1px solid ${tagColor ?? color}66`,
            color: tagColor ?? color,
            fontSize: 14 * scale,
            fontWeight: 600,
            fontFamily: fonts.sans,
          }}
        >
          {tag}
        </span>
      ) : null}
    </div>
    {children}
  </div>
);

/** Visualizes snapshot → fork → fork-only write, the Tigris-native primitives. */
export const ForkGraph: React.FC<Props> = ({
  snap,
  fork,
  write,
  reads = 0,
  scale = 1,
  compact = false,
}) => {
  const teal = theme.adapters.tigris;
  const ns = compact ? scale * 0.84 : scale; // node scale
  const conn = compact ? 16 : 30; // connector height
  return (
    <div
      style={{
        height: '100%',
        background: theme.bg,
        padding: `${(compact ? 16 : 26) * scale}px ${30 * scale}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        justifyContent: 'center',
      }}
    >
      <Node
        appear={1}
        color={teal}
        icon={<FileIcon size={20 * ns} />}
        title="agent-runs"
        subtitle="parent bucket · live"
        tag={write > 0.5 ? 'unchanged' : 'live'}
        tagColor={theme.good}
        scale={ns}
      />

      <Connector grow={snap} color={teal} height={conn} />

      <Node
        appear={snap}
        color={theme.info}
        icon={<CameraIcon size={20 * ns} />}
        title="baseline"
        subtitle="snapshot · read-only, frozen"
        tag="frozen"
        tagColor={theme.info}
        scale={ns}
      />

      <Connector grow={fork} color={theme.info} height={conn} />

      <Node
        appear={fork}
        color={theme.warn}
        icon={<BranchIcon size={20 * ns} />}
        title="experiment"
        subtitle="fork · writable branch"
        tag="writable"
        tagColor={theme.warn}
        scale={ns}
      >
        <div
          style={{
            opacity: write,
            transform: `translateX(${(1 - write) * -12}px)`,
            marginTop: 4,
            marginLeft: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: `${9 * ns}px ${14 * ns}px`,
            borderRadius: 10,
            background: theme.panelRaised,
            border: `1px solid ${theme.borderBright}`,
            fontFamily: fonts.mono,
            fontSize: 17 * ns,
            color: theme.text,
          }}
        >
          <CheckIcon size={16 * ns} color={theme.good} />
          runs/hello.txt
          <span style={{ color: theme.textDim }}>“mutated in fork only”</span>
        </div>
      </Node>

      {reads > 0 ? (
        <div
          style={{
            marginTop: (compact ? 12 : 22) * scale,
            display: 'flex',
            flexDirection: 'column',
            gap: (compact ? 7 : 10) * scale,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              color: theme.textDim,
              fontFamily: fonts.sans,
              fontSize: 15 * scale,
              opacity: reads,
            }}
          >
            same key, read from each — they diverged
          </div>
          <div style={{ display: 'flex', gap: 14 * scale }}>
            <ReadResult
              appear={reads}
              label="storage.download()"
              value="after"
              color={theme.good}
              scale={ns}
            />
            <ReadResult
              appear={reads}
              label="fork.download()"
              value="mutated in fork only"
              color={theme.warn}
              scale={ns}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
