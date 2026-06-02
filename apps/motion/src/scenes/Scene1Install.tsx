import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CheckIcon, Logo } from '../components/icons';
import { WindowChrome } from '../components/WindowChrome';
import { useLayout } from '../lib/layout';
import { pop, ramp, typed } from '../lib/timing';
import { fonts, theme } from '../theme';

const CMD = 'npm install @storagesdk/core @storagesdk/adapters';
const OUT_LINES = [
  '+ @storagesdk/core 0.4.0',
  '+ @storagesdk/adapters 0.4.0',
  'done in 1.2s',
];

export const Scene1Install: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scale, mode } = useLayout();

  const titleIn = ramp(frame, 4, 22);
  const winIn = pop(frame, 12, 26);

  const promptChars = typed(frame, 30, CMD.length, 52, fps);
  const cmdDone = promptChars >= CMD.length;
  const outShow = cmdDone
    ? Math.floor((frame - 30 - CMD.length / 52 - 12) / 12)
    : -1;

  const big = mode === 'vertical' ? 1.1 : 1;

  return (
    <AbsoluteFill
      style={{ alignItems: 'center', justifyContent: 'center', padding: 80 }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 40 * scale,
          width: '100%',
          maxWidth: 1180 * big,
        }}
      >
        {/* brand lockup */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * 16}px)`,
          }}
        >
          <Logo size={52 * scale} color={theme.accent} />
          <div style={{ fontFamily: fonts.sans }}>
            <div
              style={{
                fontSize: 46 * scale,
                fontWeight: 700,
                color: theme.text,
                letterSpacing: -0.5,
              }}
            >
              storagesdk
            </div>
            <div
              style={{
                fontSize: 21 * scale,
                color: theme.textDim,
                marginTop: 2,
              }}
            >
              One API across every object store
            </div>
          </div>
        </div>

        {/* terminal */}
        <div
          style={{
            width: '100%',
            opacity: winIn,
            transform: `scale(${0.96 + winIn * 0.04})`,
          }}
        >
          <WindowChrome
            title="zsh — install"
            bodyStyle={{ background: theme.bgDeep }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 22 * scale,
                padding: `${30 * scale}px ${32 * scale}px ${34 * scale}px`,
                lineHeight: 1.7,
                minHeight: 220 * scale,
              }}
            >
              <div style={{ display: 'flex', whiteSpace: 'pre' }}>
                <span style={{ color: theme.accent, marginRight: 12 }}>❯</span>
                <span style={{ color: theme.text }}>
                  {CMD.slice(0, promptChars)}
                </span>
                {!cmdDone ? (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 11,
                      height: '1.1em',
                      background: theme.accentBright,
                      marginLeft: 2,
                      transform: 'translateY(0.16em)',
                    }}
                  />
                ) : null}
              </div>

              {OUT_LINES.map((line, i) => {
                const visible = outShow >= i;
                const isDone = i === OUT_LINES.length - 1;
                return (
                  <div
                    key={line}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginTop: 12 * scale,
                      color: isDone ? theme.good : theme.textDim,
                      opacity: visible ? 1 : 0,
                      transform: `translateY(${visible ? 0 : 6}px)`,
                    }}
                  >
                    {isDone ? (
                      <CheckIcon size={18 * scale} color={theme.good} />
                    ) : (
                      <span style={{ color: theme.good }}>+</span>
                    )}
                    {line}
                  </div>
                );
              })}
            </div>
          </WindowChrome>
        </div>
      </div>
    </AbsoluteFill>
  );
};
