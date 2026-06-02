import type React from 'react';
import { useLayout } from '../lib/layout';
import { fonts, theme } from '../theme';
import { CodeIcon, GlobeIcon } from './icons';
import { WindowChrome } from './WindowChrome';

type Props = {
  ide: React.ReactNode;
  browser: React.ReactNode;
  ideTitle?: string;
  browserTitle?: string;
  /** 0→1 entrance of the two panels (slide/scale in). */
  enter?: number;
  /** Emphasis 0→1: IDE forward (1) vs balanced (0.5) vs browser forward (0). */
  focus?: number;
};

/**
 * The persistent IDE+Browser stage. Identical layout constants across every
 * scene that uses it, so cutting between scenes reads as one continuous shot.
 */
export const Workspace: React.FC<Props> = ({
  ide,
  browser,
  ideTitle = 'index.ts — agent-runs',
  browserTitle = 'Object Browser',
  enter = 1,
  focus = 0.5,
}) => {
  const { stacked, pad, scale } = useLayout();
  const ideFocus = 0.55 + (focus - 0.5) * 0.45; // dim the unfocused panel slightly
  const browserFocus = 0.55 + (0.5 - focus) * 0.45;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        gap: stacked ? pad * 0.5 : pad * 0.7,
        padding: pad,
        opacity: enter,
      }}
    >
      <div
        style={{
          flex: stacked ? 1.15 : 1.25,
          minHeight: 0,
          minWidth: 0,
          transform: `translate${stacked ? 'Y' : 'X'}(${(1 - enter) * -40}px)`,
          opacity: 0.55 + ideFocus * 0.45,
        }}
      >
        <WindowChrome
          title={ideTitle}
          icon={<CodeIcon size={18 * scale} />}
          style={{ height: '100%' }}
          bodyStyle={{ background: theme.bg }}
        >
          {ide}
        </WindowChrome>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          transform: `translate${stacked ? 'Y' : 'X'}(${(1 - enter) * 40}px)`,
          opacity: 0.55 + browserFocus * 0.45,
        }}
      >
        <WindowChrome
          title={browserTitle}
          icon={<GlobeIcon size={18 * scale} />}
          style={{ height: '100%' }}
        >
          {browser}
        </WindowChrome>
      </div>
    </div>
  );
};

/** A small floating label used to narrate what's happening on screen. */
export const Caption: React.FC<{
  children: React.ReactNode;
  opacity?: number;
  accent?: string;
}> = ({ children, opacity = 1, accent = theme.accent }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 44,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      paddingInline: 26,
      height: 56,
      borderRadius: 999,
      background: 'rgba(8,14,12,0.82)',
      border: `1px solid ${accent}55`,
      backdropFilter: 'blur(6px)',
      color: theme.text,
      fontFamily: fonts.sans,
      fontSize: 24,
      fontWeight: 500,
      opacity,
      boxShadow: `0 18px 50px -20px ${accent}66`,
    }}
  >
    <span
      style={{ width: 10, height: 10, borderRadius: 999, background: accent }}
    />
    {children}
  </div>
);
