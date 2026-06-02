import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { fonts, theme } from '../theme';
import { Code } from './Code';
import type { ConsoleLine } from './RunIde';

/**
 * IDE for the multi-step finale scenes: a full file with the current call lit
 * up and a console below that fills in as each step runs. Shared by the
 * snapshot and fork scenes.
 */
export const SteppedIde: React.FC<{
  code: string;
  activeLines: number[];
  console: ConsoleLine[];
  scale?: number;
  scrollToLine?: number;
  fontSize?: number;
}> = ({
  code,
  activeLines,
  console,
  scale = 1,
  scrollToLine,
  fontSize = 23,
}) => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 7);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, padding: 30, position: 'relative' }}>
        <Code
          code={code}
          fontSize={fontSize * scale}
          highlightLines={activeLines}
          highlightColor={`rgba(45,212,191,${0.12 + pulse * 0.1})`}
          scrollToLine={scrollToLine}
        />
      </div>
      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          background: theme.bgDeep,
          padding: `${16 * scale}px ${26 * scale}px`,
          fontFamily: fonts.mono,
          fontSize: 18 * scale,
          minHeight: 150 * scale,
        }}
      >
        <div style={{ color: theme.textFaint }}>OUTPUT</div>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
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
