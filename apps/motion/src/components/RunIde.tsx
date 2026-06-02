import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { type AdapterId, crudFile } from '../lib/snippets';
import { fonts, theme } from '../theme';
import { Code } from './Code';

export type ConsoleLine = { text: string; color?: string; show: boolean };

/**
 * IDE side for the "run a method" scenes: the same file, with one call lit up
 * and a console docked below echoing the result. Shared by list/upload/delete.
 */
export const RunIde: React.FC<{
  adapter: AdapterId;
  activeLine: number;
  running: boolean;
  console: ConsoleLine[];
  scale?: number;
  /** Set in stacked layouts to scroll the editor viewport to the active call. */
  scrollToLine?: number;
}> = ({ adapter, activeLine, running, console, scale = 1, scrollToLine }) => {
  const frame = useCurrentFrame();
  const code = crudFile(adapter);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 7);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, padding: 30, position: 'relative' }}>
        <Code
          code={code}
          fontSize={24 * scale}
          highlightLines={[activeLine]}
          highlightColor={`rgba(45,212,191,${0.1 + (running ? pulse * 0.12 : 0.06)})`}
          scrollToLine={scrollToLine}
        />
      </div>

      {/* console dock */}
      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          background: theme.bgDeep,
          padding: `${16 * scale}px ${26 * scale}px`,
          fontFamily: fonts.mono,
          fontSize: 19 * scale,
          minHeight: 120 * scale,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: theme.textFaint,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: running ? theme.warn : theme.good,
              boxShadow: running ? `0 0 10px ${theme.warn}` : 'none',
              opacity: running ? 0.5 + pulse * 0.5 : 1,
            }}
          />
          {running ? 'running…' : 'OUTPUT'}
        </div>
        <div
          style={{
            marginTop: 10 * scale,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {console.map((c, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: console lines are positional
              key={i}
              style={{
                color: c.color ?? theme.text,
                opacity: c.show ? 1 : 0,
                transform: `translateY(${c.show ? 0 : 6}px)`,
                whiteSpace: 'pre',
              }}
            >
              <span style={{ color: theme.accent }}>→ </span>
              {c.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
