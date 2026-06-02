import type React from 'react';
import { tokenize } from '../lib/highlight';
import { fonts, theme } from '../theme';

type Props = {
  code: string;
  /** How many characters are visible (typing). Omit to show all. */
  reveal?: number;
  fontSize?: number;
  lineHeight?: number;
  showCaret?: boolean;
  /** 1-based line numbers to highlight (a soft band behind the line). */
  highlightLines?: number[];
  highlightColor?: string;
  startLineNumber?: number;
  /**
   * When set, the code is clipped to its container and scrolled so this
   * (1-based, fractional) line stays in view — an editor viewport for the
   * short stacked layouts where the whole file can't fit at once.
   */
  scrollToLine?: number;
};

const CONTEXT_LINES = 4;

/**
 * Renders tokenized TS with an optional character-count reveal. Reveal walks
 * the doc left-to-right, top-to-bottom; the caret sits at the reveal point.
 */
export const Code: React.FC<Props> = ({
  code,
  reveal,
  fontSize = 26,
  lineHeight = 1.55,
  showCaret = true,
  highlightLines = [],
  highlightColor = 'rgba(45, 212, 191, 0.10)',
  startLineNumber = 1,
  scrollToLine,
}) => {
  const lines = tokenize(code);
  const total = code.length;
  const shown = reveal === undefined ? total : Math.min(reveal, total);
  const hl = new Set(highlightLines);

  let consumed = 0; // chars consumed by previous lines (incl. newlines)
  const caretActive = reveal !== undefined && shown < total;

  const lineHeightPx = fontSize * lineHeight;
  const scrolled = scrollToLine !== undefined;
  const offset = scrolled
    ? Math.max(0, (scrollToLine - CONTEXT_LINES) * lineHeightPx)
    : 0;

  const inner = (
    <div
      style={{
        fontFamily: fonts.mono,
        fontSize,
        lineHeight,
        color: theme.text,
        fontVariantLigatures: 'none',
        fontFeatureSettings: '"liga" 0',
        transform: `translateY(${-offset}px)`,
      }}
    >
      {lines.map((tokens, li) => {
        const lineStart = consumed;
        const rawLine = code.split('\n')[li] ?? '';
        const lineEnd = lineStart + rawLine.length;
        consumed = lineEnd + 1; // +1 for the newline

        const lineVisible = Math.max(
          0,
          Math.min(rawLine.length, shown - lineStart)
        );
        const lineFullyHidden = shown <= lineStart;
        const caretOnThisLine =
          caretActive && shown >= lineStart && shown <= lineEnd;

        let rendered = 0;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: source lines are positional and stable
            key={li}
            style={{
              display: 'flex',
              position: 'relative',
              whiteSpace: 'pre',
              background: hl.has(li + 1) ? highlightColor : 'transparent',
              borderLeft: hl.has(li + 1)
                ? `2px solid ${theme.accent}`
                : '2px solid transparent',
              paddingLeft: 14,
              borderRadius: 4,
            }}
          >
            <span
              style={{
                width: 34,
                marginLeft: -14,
                marginRight: 22,
                textAlign: 'right',
                color: theme.textFaint,
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              {li + startLineNumber}
            </span>
            <span>
              {tokens.map((tok, ti) => {
                if (lineFullyHidden) return null;
                const remaining = lineVisible - rendered;
                if (remaining <= 0) return null;
                const text =
                  remaining >= tok.text.length
                    ? tok.text
                    : tok.text.slice(0, remaining);
                rendered += text.length;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: token order within a line is stable
                    key={ti}
                    style={{ color: tok.color }}
                  >
                    {text}
                  </span>
                );
              })}
              {caretOnThisLine && showCaret ? <Caret /> : null}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (!scrolled) return inner;

  // Editor viewport: clip to the container and fade the top/bottom edges so
  // the scroll reads as a real editor window rather than a hard cut.
  return (
    <div
      style={{
        height: '100%',
        overflow: 'hidden',
        maskImage:
          'linear-gradient(180deg, transparent 0, black 36px, black calc(100% - 36px), transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(180deg, transparent 0, black 36px, black calc(100% - 36px), transparent 100%)',
      }}
    >
      {inner}
    </div>
  );
};

const Caret: React.FC = () => (
  <span
    style={{
      display: 'inline-block',
      width: 2,
      height: '1.05em',
      marginLeft: 1,
      transform: 'translateY(0.18em)',
      background: theme.accentBright,
      boxShadow: `0 0 8px ${theme.accentGlow}`,
    }}
  />
);
