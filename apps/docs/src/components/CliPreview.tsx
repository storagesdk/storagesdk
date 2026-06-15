import { useEffect, useRef, useState } from 'react';

interface Step {
  /** Optional preceding comment (e.g. `# install once, talk to every backend`). */
  readonly comment?: string;
  /** The command typed at the prompt. Don't include the `$`. */
  readonly command: string;
  /** Terminal output for this step. Multiline ok. */
  readonly output: string;
}

const STEPS: readonly Step[] = [
  {
    comment: '# install once, talk to every backend',
    command: 'npm install -g @storagesdk/cli',
    output: 'added 97 packages in 6s',
  },
  {
    comment: '# pick a default — every command falls back to this',
    command: 'export STORAGE_ADAPTER=tigris',
    output: '',
  },
  {
    comment: '# upload a local file — local <-> storage:// scheme',
    command: 'storage cp ./config.json storage://agents/config.json',
    output: 'Copied ./config.json -> storage://agents/config.json',
  },
  {
    comment: '# read it back, pipe to anything',
    command: 'storage cat storage://agents/config.json | jq .',
    output: `{
  "model": "claude-sonnet-4-5",
  "scope": "agent-runs/"
}`,
  },
  {
    comment: '# snapshots and forks at the prompt',
    command: 'storage snapshot create --name pre-deploy',
    output: `{"id":"1781278920123456789","name":"pre-deploy","createdAt":"2026-06-12T15:42:00Z"}`,
  },
  {
    command:
      'storage fork create experiment --from-snapshot 1781278920123456789',
    output: `{"name":"experiment","fromSnapshot":"1781278920123456789","createdAt":"2026-06-12T15:42:01Z"}`,
  },
  {
    comment: '# scope reads into a snapshot or fork',
    command: 'storage ls --snapshot 1781278920123456789 photos/',
    output: `photos/cat.jpg
photos/dog.jpg
photos/sunset.jpg`,
  },
  {
    comment: '# JSON when piped, human in a terminal',
    command: 'storage stat photos/cat.jpg | jq .size',
    output: '12345',
  },
];

// Tunables for the typing rhythm.
const CHAR_INTERVAL_MS = 22;
const OUTPUT_PAUSE_MS = 700;
const STEP_PAUSE_MS = 1400;

type Phase = 'typing' | 'output' | 'pause';

// Wrap `--flag` tokens in a span so we can give them extra visual
// left-margin via CSS. The text content is unchanged — copy/paste
// still yields the original single-space-separated command.
function renderCommand(text: string) {
  if (!text) return null;
  const parts = text.split(/(--[\w-]*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('--')) {
      const key = `f-${i}-${part}`;
      return (
        <span className="cli-preview-flag" key={key}>
          {part}
        </span>
      );
    }
    const key = `t-${i}-${part}`;
    return <span key={key}>{part}</span>;
  });
}

export default function CliPreview() {
  const [step, setStep] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('typing');
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Track prefers-reduced-motion live — devtools toggles and OS-level
  // changes should re-render this preview without needing a reload.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Typing tick — advance one character per CHAR_INTERVAL_MS.
  useEffect(() => {
    if (!playing || reducedMotion || phase !== 'typing') return;
    const command = STEPS[step]?.command ?? '';
    if (typedCount >= command.length) {
      setPhase('output');
      return;
    }
    const id = window.setTimeout(() => {
      setTypedCount((c) => c + 1);
    }, CHAR_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [playing, reducedMotion, phase, typedCount, step]);

  // Phase transitions: typing → output → pause → next step.
  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (phase === 'output') {
      const id = window.setTimeout(() => setPhase('pause'), OUTPUT_PAUSE_MS);
      return () => window.clearTimeout(id);
    }
    if (phase === 'pause') {
      // Final step: settle on the last output and stop. No replay.
      if (step === STEPS.length - 1) {
        setPlaying(false);
        return undefined;
      }
      const id = window.setTimeout(() => {
        setStep(step + 1);
        setTypedCount(0);
        setPhase('typing');
      }, STEP_PAUSE_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [playing, reducedMotion, phase, step]);

  // Auto-scroll the terminal as new output appears. `step` and `phase`
  // are the change signals — they don't appear in the body, but the
  // effect must re-run on either to follow rendered content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only deps
  useEffect(() => {
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [step, phase]);

  const togglePlayback = () => {
    // Clicking play after the final command settles restarts from the top
    // rather than no-oping, since we never auto-loop.
    const atEnd = step === STEPS.length - 1 && phase === 'pause';
    if (atEnd && !playing) {
      setStep(0);
      setTypedCount(0);
      setPhase('typing');
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };
  const onTogglePlay = togglePlayback;
  const onTerminalClick = () => {
    if (!reducedMotion) togglePlayback();
  };

  const current = STEPS[step];
  const typedCommand = current?.command.slice(0, typedCount) ?? '';
  const showCursor = !reducedMotion && phase === 'typing';
  const showOutput = phase !== 'typing';
  const previous = STEPS.slice(0, step);
  const atEnd = step === STEPS.length - 1 && phase === 'pause' && !playing;

  return (
    <div className="cli-preview">
      <div className="cli-preview-term">
        <div className="cli-preview-term-head">
          <span className="cli-preview-term-dot" />
          <span className="cli-preview-term-dot" />
          <span className="cli-preview-term-dot" />
          <span className="cli-preview-term-title">storage</span>
          {!reducedMotion && (
            <button
              type="button"
              className="cli-preview-playpause"
              onClick={onTogglePlay}
              aria-label={
                atEnd
                  ? 'Replay from the start'
                  : playing
                    ? 'Pause autoplay'
                    : 'Resume autoplay'
              }
            >
              {atEnd ? '↻ replay' : playing ? '⏸ pause' : '▶ play'}
            </button>
          )}
        </div>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: pause toggle is
            also reachable via the button above; this is a convenience
            for pointer users tapping the terminal directly */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: same */}
        <div
          className="cli-preview-term-body"
          ref={bodyRef}
          onClick={onTerminalClick}
        >
          {reducedMotion ? (
            STEPS.map((s) => (
              <div className="cli-preview-term-block" key={s.command}>
                {s.comment ? (
                  <div className="cli-preview-comment">{s.comment}</div>
                ) : null}
                <div className="cli-preview-term-line">
                  <span className="cli-preview-prompt">$</span>{' '}
                  <span>{renderCommand(s.command)}</span>
                </div>
                {s.output ? (
                  <pre className="cli-preview-term-output">{s.output}</pre>
                ) : null}
              </div>
            ))
          ) : (
            <>
              {previous.map((s) => (
                <div className="cli-preview-term-block" key={s.command}>
                  {s.comment ? (
                    <div className="cli-preview-comment">{s.comment}</div>
                  ) : null}
                  <div className="cli-preview-term-line">
                    <span className="cli-preview-prompt">$</span>{' '}
                    <span>{renderCommand(s.command)}</span>
                  </div>
                  {s.output ? (
                    <pre className="cli-preview-term-output">{s.output}</pre>
                  ) : null}
                </div>
              ))}
              {current && (
                <div className="cli-preview-term-block">
                  {current.comment ? (
                    <div className="cli-preview-comment">{current.comment}</div>
                  ) : null}
                  <div className="cli-preview-term-line">
                    <span className="cli-preview-prompt">$</span>{' '}
                    <span>{renderCommand(typedCommand)}</span>
                    {showCursor && (
                      <span className="cli-preview-cursor" aria-hidden="true" />
                    )}
                  </div>
                  {showOutput && current.output ? (
                    <pre className="cli-preview-term-output">
                      {current.output}
                    </pre>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
