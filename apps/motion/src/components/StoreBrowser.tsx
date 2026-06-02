import type React from 'react';
import { fonts, theme } from '../theme';
import { FileIcon, FolderIcon } from './icons';

export type Row = {
  path: string;
  size: string;
  modified: string;
  kind?: 'file' | 'folder';
  opacity?: number;
  translateY?: number;
  /** 0→1 strike-through + fade for a deleting row. */
  strike?: number;
  /** 0→1 height collapse so neighbours reflow up when a row is removed. */
  collapse?: number;
  badge?: 'new' | null;
  /** 0→1 soft row highlight (e.g. the row a method just touched). */
  highlight?: number;
};

type Props = {
  bucket: string;
  adapterColor: string;
  adapterLabel: string;
  rows: Row[];
  scale?: number;
};

/** A file-manager view of a bucket — the "result" side the API operates on. */
export const StoreBrowser: React.FC<Props> = ({
  bucket,
  adapterColor,
  adapterLabel,
  rows,
  scale = 1,
}) => (
  <div
    style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.sans,
      background: theme.bg,
    }}
  >
    {/* address + adapter chip */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14 * scale,
        padding: `${14 * scale}px ${22 * scale}px`,
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 40 * scale,
          paddingInline: 16,
          borderRadius: 999,
          background: theme.bgDeep,
          border: `1px solid ${theme.border}`,
          color: theme.textDim,
          fontSize: 17 * scale,
          fontFamily: fonts.mono,
        }}
      >
        <span style={{ color: theme.accent }}>storage://</span>
        <span style={{ color: theme.text }}>{bucket}</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 40 * scale,
          paddingInline: 16,
          borderRadius: 999,
          background: `${adapterColor}1A`,
          border: `1px solid ${adapterColor}55`,
          color: adapterColor,
          fontSize: 16 * scale,
          fontWeight: 600,
          fontFamily: fonts.mono,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: adapterColor,
          }}
        />
        {adapterLabel}
      </div>
    </div>

    {/* column header */}
    <div
      style={{
        display: 'flex',
        padding: `${10 * scale}px ${24 * scale}px`,
        color: theme.textFaint,
        fontSize: 14 * scale,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <span style={{ flex: 1 }}>Name</span>
      <span style={{ width: 110 * scale, textAlign: 'right' }}>Size</span>
      <span style={{ width: 150 * scale, textAlign: 'right' }}>Modified</span>
    </div>

    {/* rows */}
    <div style={{ flex: 1, minHeight: 0, paddingBlock: 6 }}>
      {rows.map((r) => {
        const op = r.opacity ?? 1;
        const strike = r.strike ?? 0;
        const collapse = r.collapse ?? 0;
        const Icon = r.kind === 'folder' ? FolderIcon : FileIcon;
        const iconColor = r.kind === 'folder' ? theme.warn : theme.textDim;
        const fullPad = 13 * scale;
        return (
          <div
            key={r.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingBlock: fullPad * (1 - collapse),
              paddingInline: 24 * scale,
              marginInline: 10,
              borderRadius: 10,
              gap: 14,
              fontSize: 19 * scale,
              color: theme.text,
              maxHeight: collapse > 0 ? `${(1 - collapse) * 70}px` : undefined,
              overflow: 'hidden',
              opacity: op * (1 - strike * 0.6) * (1 - collapse),
              transform: `translateY(${r.translateY ?? 0}px)`,
              background:
                r.highlight && r.highlight > 0
                  ? `rgba(45,212,191,${0.12 * r.highlight})`
                  : 'transparent',
            }}
          >
            <Icon size={22 * scale} color={iconColor} />
            <span
              style={{
                flex: 1,
                fontFamily: fonts.mono,
                position: 'relative',
                whiteSpace: 'nowrap',
              }}
            >
              {r.path}
              {strike > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    height: 2,
                    width: `${strike * 100}%`,
                    background: theme.bad,
                  }}
                />
              ) : null}
              {r.badge === 'new' ? (
                <span
                  style={{
                    marginLeft: 12,
                    padding: '2px 9px',
                    borderRadius: 999,
                    fontFamily: fonts.sans,
                    fontSize: 13 * scale,
                    fontWeight: 700,
                    color: theme.bgDeep,
                    background: theme.good,
                  }}
                >
                  NEW
                </span>
              ) : null}
            </span>
            <span
              style={{
                width: 110 * scale,
                textAlign: 'right',
                color: theme.textDim,
                fontFamily: fonts.mono,
                fontSize: 16 * scale,
              }}
            >
              {r.size}
            </span>
            <span
              style={{
                width: 150 * scale,
                textAlign: 'right',
                color: theme.textFaint,
                fontFamily: fonts.mono,
                fontSize: 16 * scale,
              }}
            >
              {r.modified}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);
