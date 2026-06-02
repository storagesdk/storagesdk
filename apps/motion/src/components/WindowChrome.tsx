import type React from 'react';
import { fonts, theme } from '../theme';

type Props = {
  title: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
};

/** macOS-style window with traffic lights + a title bar. Shared by IDE & browser. */
export const WindowChrome: React.FC<Props> = ({
  title,
  icon,
  accent = theme.accent,
  children,
  style,
  bodyStyle,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      background: theme.panel,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow:
        '0 40px 90px -30px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.02) inset',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        height: 52,
        paddingInline: 20,
        background: theme.panelRaised,
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 9 }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
          <div
            key={c}
            style={{ width: 13, height: 13, borderRadius: 999, background: c }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          marginLeft: 8,
          color: theme.textDim,
          fontFamily: fonts.sans,
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        {icon ? (
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
        ) : null}
        {title}
      </div>
    </div>
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        ...bodyStyle,
      }}
    >
      {children}
    </div>
  </div>
);
