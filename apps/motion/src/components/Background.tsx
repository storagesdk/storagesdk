import { AbsoluteFill } from 'remotion';
import { theme } from '../theme';

/** Shared deep-space gradient with a faint teal grid. Mounted under every scene. */
export const Background: React.FC = () => (
  <AbsoluteFill style={{ background: theme.bgDeep }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 50% -10%, ${theme.panel} 0%, ${theme.bgDeep} 55%)`,
      }}
    />
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
        opacity: 0.18,
        maskImage:
          'radial-gradient(80% 70% at 50% 40%, black 30%, transparent 80%)',
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(50% 40% at 80% 100%, ${theme.accentGlow} 0%, transparent 70%)`,
        opacity: 0.5,
      }}
    />
  </AbsoluteFill>
);
