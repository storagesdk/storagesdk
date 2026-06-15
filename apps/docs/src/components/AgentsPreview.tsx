import { useEffect, useRef, useState } from 'react';

// ── Wiring tabs (left pane) ─────────────────────────────────────────────────

interface RuntimeTab {
  readonly key: string;
  readonly short: string;
  readonly filename: string;
  readonly lines: readonly string[];
}

const TABS: readonly RuntimeTab[] = [
  {
    key: 'vercel',
    short: 'Vercel AI SDK',
    filename: 'agent.ts',
    lines: [
      `import { tools } from '@storagesdk/ai/vercel';`,
      `import { generateText } from 'ai';`,
      ``,
      `const result = await generateText({`,
      `  model: anthropic('claude-sonnet-4-5'),`,
      `  tools: tools(storage, { scope: 'kb/' }),`,
      `  prompt: 'Update kb/auth/ for the new SSO flow. Fork it so the originals stay.',`,
      `});`,
    ],
  },
  {
    key: 'mastra',
    short: 'Mastra',
    filename: 'agent.ts',
    lines: [
      `import { Agent } from '@mastra/core/agent';`,
      `import { tools } from '@storagesdk/ai/mastra';`,
      ``,
      `const agent = new Agent({`,
      `  name: 'docs-editor',`,
      `  instructions: 'Snapshot before any risky edit.',`,
      `  model: 'anthropic/claude-sonnet-4-5',`,
      `  tools: tools(storage),`,
      `});`,
      ``,
      `await agent.generate(`,
      `  'Update kb/auth/ for the new SSO flow. Fork it so the originals stay.'`,
      `);`,
    ],
  },
  {
    key: 'mcp',
    short: 'MCP server',
    filename: '~  shell',
    lines: [
      `# Boot the MCP server — any host that speaks the protocol`,
      `# (Claude Desktop, Cursor, MCP Inspector, …) can call in.`,
      `storage mcp --adapter tigris --scope kb/`,
      ``,
      `# Or wire it into Claude Code`,
      `claude mcp add storagesdk -- storage mcp --adapter tigris`,
    ],
  },
];

const DEFAULT_TAB: RuntimeTab = TABS[0] ?? {
  key: 'vercel',
  short: 'Vercel AI SDK',
  filename: 'agent.ts',
  lines: [],
};

// ── Chat transcript (right pane) ────────────────────────────────────────────

type Message =
  | { readonly kind: 'user'; readonly text: string }
  | { readonly kind: 'assistant'; readonly text: string }
  | {
      readonly kind: 'tool';
      readonly name: string;
      readonly args: string;
      readonly result: string;
    };

const MESSAGES: readonly Message[] = [
  {
    kind: 'user',
    text: 'Update kb/auth/sso.md and kb/auth/login.md for the new SSO flow. Fork it so the originals stay put.',
  },
  {
    kind: 'assistant',
    text: "I'll fork the bucket, then read and rewrite each doc in the fork.",
  },
  {
    kind: 'tool',
    name: 'fork_create',
    args: "{ name: 'sso-update' }",
    result: "{ name: 'sso-update' }",
  },
  {
    kind: 'tool',
    name: 'download',
    args: "{ path: 'kb/auth/sso.md', as: 'text' }",
    result: '"# SSO\\n\\nLog in via OAuth…"',
  },
  {
    kind: 'tool',
    name: 'upload',
    args: "{ path: 'kb/auth/sso.md', body: '…', fork: 'sso-update' }",
    result: 'ok · 2.1 KB',
  },
  {
    kind: 'tool',
    name: 'download',
    args: "{ path: 'kb/auth/login.md', as: 'text' }",
    result: '"# Login\\n\\nUse SSO to sign in…"',
  },
  {
    kind: 'tool',
    name: 'upload',
    args: "{ path: 'kb/auth/login.md', body: '…', fork: 'sso-update' }",
    result: 'ok · 1.6 KB',
  },
  {
    kind: 'assistant',
    text: 'Done. Rewrote both docs in fork `sso-update`. Originals are untouched — diff against the parent and merge when ready.',
  },
];

const STEP_INTERVAL_MS = 2200;

export default function AgentsPreview() {
  const [tabKey, setTabKey] = useState<string>(DEFAULT_TAB.key);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (step >= MESSAGES.length) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      setStep((s) => s + 1);
    }, STEP_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [playing, step, reducedMotion]);

  // Keep the latest message in view as the chat grows. `step` is the
  // trigger — not read in the effect body, just the dependency.
  // `reducedMotion` is the other trigger: when it flips on, we render
  // every message at once and need to jump-scroll to the bottom so the
  // tail messages aren't hidden above the scroll fold.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only deps
  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [step, reducedMotion]);

  const tab = TABS.find((t) => t.key === tabKey) ?? DEFAULT_TAB;
  const visibleCount = reducedMotion ? MESSAGES.length : step;
  const visible = MESSAGES.slice(0, visibleCount);
  const atEnd = step >= MESSAGES.length && !playing;

  function onSelectTab(key: string) {
    if (key === tabKey) return;
    setTabKey(key);
  }

  function onMessageClick(idx: number) {
    setPlaying(false);
    setStep(idx + 1);
  }

  function togglePlayback() {
    if (atEnd) {
      setStep(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  const isShell = tab.key === 'mcp';

  return (
    <div className="agents-preview">
      <div className="agents-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tabKey}
            className={`agents-tab${t.key === tabKey ? ' active' : ''}`}
            onClick={() => onSelectTab(t.key)}
          >
            {t.short}
          </button>
        ))}
      </div>
      <div className="agents-split">
        <div className="agents-pane">
          <div className="agents-pane-head">
            <span className="cli-preview-term-dot" />
            <span className="cli-preview-term-dot" />
            <span className="cli-preview-term-dot" />
            <span className="agents-pane-title">{tab.filename}</span>
          </div>
          <div className={`agents-code${isShell ? ' agents-code-shell' : ''}`}>
            {tab.lines.map((line, i) => {
              const key = `${tab.key}-${i}`;
              return (
                <div key={key} className="agents-code-line">
                  {line || ' '}
                </div>
              );
            })}
          </div>
        </div>
        <div className="agents-pane">
          <div className="agents-pane-head">
            <span className="agents-pane-title">agent · scope: kb/</span>
            {!reducedMotion && (
              <button
                type="button"
                className="cli-preview-playpause"
                onClick={togglePlayback}
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
          <div className="agents-chat" ref={chatRef}>
            {visible.length === 0 && (
              <div className="agents-chat-empty">— waiting for prompt —</div>
            )}
            {visible.map((m, i) => {
              const key = `m-${i}`;
              const isLast = !reducedMotion && i === visible.length - 1;
              const cls = `agents-msg agents-msg-${m.kind}${
                isLast ? ' agents-msg-just' : ''
              }`;
              return (
                <button
                  type="button"
                  key={key}
                  className={cls}
                  onClick={() => onMessageClick(i)}
                >
                  {m.kind === 'user' && (
                    <>
                      <span className="agents-msg-label">You</span>
                      <span className="agents-msg-body">{m.text}</span>
                    </>
                  )}
                  {m.kind === 'assistant' && (
                    <>
                      <span className="agents-msg-label">Assistant</span>
                      <span className="agents-msg-body">{m.text}</span>
                    </>
                  )}
                  {m.kind === 'tool' && (
                    <>
                      <span className="agents-msg-label">Tool</span>
                      <span className="agents-msg-tool-name">{m.name}</span>
                      <span className="agents-msg-tool-args">{m.args}</span>
                      <span className="agents-msg-tool-result">{m.result}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
