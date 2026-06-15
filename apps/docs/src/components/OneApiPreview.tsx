import { useEffect, useState } from 'react';

interface AdapterTab {
  /** Stable key for routing tab → snippet. */
  readonly key: string;
  /** Short label shown on the tab button. */
  readonly short: string;
  /** Adapter factory name (`tigris`, `s3`, …). Used in the import + init lines. */
  readonly factory: string;
  /** Package subpath. */
  readonly importPath: string;
  /** Inline config literal — kept short on purpose so it stays on one line. */
  readonly initArgs: string;
  /** What we print in the file-panel header (e.g. `Tigris · agents`). */
  readonly bucketLabel: string;
}

const TABS: readonly AdapterTab[] = [
  {
    key: 'tigris',
    short: 'Tigris',
    factory: 'tigris',
    importPath: '@storagesdk/adapters/tigris',
    initArgs: "{ bucket: 'agents' }",
    bucketLabel: 'Tigris · agents',
  },
  {
    key: 's3',
    short: 'S3',
    factory: 's3',
    importPath: '@storagesdk/adapters/s3',
    initArgs: "{ bucket: 'agents', region: 'us-east-1' }",
    bucketLabel: 'S3 · agents',
  },
  {
    key: 'r2',
    short: 'R2',
    factory: 'r2',
    importPath: '@storagesdk/adapters/r2',
    initArgs: "{ bucket: 'agents', accountId }",
    bucketLabel: 'R2 · agents',
  },
  {
    key: 'gcs',
    short: 'GCS',
    factory: 'gcs',
    importPath: '@storagesdk/adapters/gcs',
    initArgs: "{ bucket: 'agents', projectId }",
    bucketLabel: 'GCS · agents',
  },
  {
    key: 'azure',
    short: 'Azure',
    factory: 'azure',
    importPath: '@storagesdk/adapters/azure',
    initArgs: "{ container: 'agents', accountName }",
    bucketLabel: 'Azure · agents',
  },
  {
    key: 'vercel',
    short: 'Vercel',
    factory: 'vercel',
    importPath: '@storagesdk/adapters/vercel',
    initArgs: "{ prefix: 'agents/' }",
    bucketLabel: 'Vercel · agents/',
  },
  {
    key: 'github',
    short: 'GitHub',
    factory: 'github',
    importPath: '@storagesdk/adapters/github',
    initArgs: "{ owner: 'me', repo: 'agents' }",
    bucketLabel: 'GitHub · me/agents',
  },
  {
    key: 'fs',
    short: 'FS',
    factory: 'fs',
    importPath: '@storagesdk/adapters/fs',
    initArgs: "{ root: './data' }",
    bucketLabel: 'FS · ./data',
  },
];

function buildLines(tab: AdapterTab): readonly string[] {
  return [
    `import { Storage } from '@storagesdk/core';`,
    `import { ${tab.factory} } from '${tab.importPath}';`,
    ``,
    `const storage = new Storage({`,
    `  adapter: ${tab.factory}(${tab.initArgs}),`,
    `});`,
    ``,
    `await storage.list({ prefix: '' });`,
    `await storage.upload('report.md', body);`,
    `await storage.upload('setup.json', body);`,
    ``,
    `await storage.head('report.md');`,
    `await storage.download('report.md', { as: 'text' });`,
    `await storage.copy('setup.json', 'setup-v2.json');`,
    `await storage.move('setup-v2.json', 'archive/setup.json');`,
    `await storage.delete('report.md');`,
  ];
}

type Action =
  | { type: 'add'; path: string; size: string }
  | { type: 'head'; path: string; meta: string }
  | { type: 'list' }
  | { type: 'download'; path: string }
  | { type: 'copy'; from: string; to: string }
  | { type: 'move'; from: string; to: string }
  | { type: 'delete'; path: string };

type Effect = 'none' | 'highlight' | 'download' | 'fade';

interface FileRow {
  /** Stable id so React can animate moves smoothly when path changes. */
  readonly id: number;
  readonly path: string;
  readonly size: string;
  readonly effect: Effect;
  /** Inline metadata shown by `head` (e.g. `application/pdf`). */
  readonly meta?: string;
}

interface Step {
  /** 0-based index into the rendered code lines — highlights this row while the step is active. */
  readonly line: number;
  readonly action: Action;
}

const STEPS: readonly Step[] = [
  { line: 7, action: { type: 'list' } },
  { line: 8, action: { type: 'add', path: 'report.md', size: '2 KB' } },
  { line: 9, action: { type: 'add', path: 'setup.json', size: '600 B' } },
  {
    line: 11,
    action: { type: 'head', path: 'report.md', meta: 'text/markdown' },
  },
  { line: 12, action: { type: 'download', path: 'report.md' } },
  {
    line: 13,
    action: { type: 'copy', from: 'setup.json', to: 'setup-v2.json' },
  },
  {
    line: 14,
    action: { type: 'move', from: 'setup-v2.json', to: 'archive/setup.json' },
  },
  { line: 15, action: { type: 'delete', path: 'report.md' } },
];

const STEP_INTERVAL_MS = 2000;

// Files that already live in the bucket when the demo starts. They
// don't appear in the panel until the first `list` call surfaces them
// — before that, the panel sits empty.
const PREEXISTING: readonly Omit<FileRow, 'effect'>[] = [
  { id: 1, path: 'prompts.md', size: '8 KB' },
  { id: 2, path: 'config.json', size: '1.2 KB' },
  { id: 3, path: 'notes.md', size: '3 KB' },
];
const INITIAL_ID_HIGH_WATER = 3;

const DEFAULT_TAB: AdapterTab = TABS[0] ?? {
  key: 'tigris',
  short: 'Tigris',
  factory: 'tigris',
  importPath: '@storagesdk/adapters/tigris',
  initArgs: "{ bucket: 'agents' }",
  bucketLabel: 'Tigris · agents',
};

function clearEffects(rows: readonly FileRow[]): FileRow[] {
  return rows.map((r) => ({ ...r, effect: 'none' as const, meta: undefined }));
}

function applyAction(
  rows: readonly FileRow[],
  action: Action,
  mintId: () => number
): FileRow[] {
  switch (action.type) {
    case 'add':
      return [
        ...clearEffects(rows),
        {
          id: mintId(),
          path: action.path,
          size: action.size,
          effect: 'highlight',
        },
      ];
    case 'head':
      return rows.map((r) =>
        r.path === action.path
          ? { ...r, effect: 'highlight', meta: action.meta }
          : { ...r, effect: 'none' as const, meta: undefined }
      );
    case 'list':
      // First `list` reveals what was already in the bucket. Subsequent
      // ones just re-highlight the current row set.
      if (rows.length === 0) {
        return PREEXISTING.map((f) => ({ ...f, effect: 'highlight' as const }));
      }
      return rows.map((r) => ({
        ...r,
        effect: 'highlight' as const,
        meta: undefined,
      }));
    case 'download':
      return rows.map((r) =>
        r.path === action.path
          ? { ...r, effect: 'download' as const, meta: undefined }
          : { ...r, effect: 'none' as const, meta: undefined }
      );
    case 'copy': {
      const source = rows.find((r) => r.path === action.from);
      return [
        ...clearEffects(rows),
        {
          id: mintId(),
          path: action.to,
          size: source?.size ?? '0 B',
          effect: 'highlight',
        },
      ];
    }
    case 'move':
      return rows.map((r) =>
        r.path === action.from
          ? {
              ...r,
              path: action.to,
              effect: 'highlight' as const,
              meta: undefined,
            }
          : { ...r, effect: 'none' as const, meta: undefined }
      );
    case 'delete':
      return rows.map((r) =>
        r.path === action.path
          ? { ...r, effect: 'fade' as const, meta: undefined }
          : { ...r, effect: 'none' as const, meta: undefined }
      );
    default:
      return [...rows];
  }
}

// Precompute the file-panel state after every step. With this, the
// animation tick and the click-to-jump handler both just index into a
// fixed array — no re-running applyAction at render time, and row ids
// stay stable across jumps so React can animate moves smoothly.
const STATES: readonly (readonly FileRow[])[] = (() => {
  const list: FileRow[][] = [[]];
  let counter = INITIAL_ID_HIGH_WATER;
  const mintId = () => ++counter;
  let current: FileRow[] = [];
  for (const s of STEPS) {
    current = applyAction(current, s.action, mintId);
    list.push(current);
  }
  return list;
})();

// Reverse map: code-line index → STEPS index. Used to make exactly the
// lines that map to a step clickable.
const STEP_INDEX_BY_LINE: Record<number, number> = {};
STEPS.forEach((s, i) => {
  STEP_INDEX_BY_LINE[s.line] = i;
});

export default function OneApiPreview() {
  const [tabKey, setTabKey] = useState<string>(DEFAULT_TAB.key);
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<readonly FileRow[]>(() => STATES[0] ?? []);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Each tick advances the step AND rotates the adapter tab, so the
  // import / bucket label keeps changing while the same call sequence
  // plays out — the visual is "same verbs, backend swapping under them".
  // Adapter wraps around; step doesn't — when the sequence finishes,
  // playback stops and the ↻ replay button reappears.
  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (step >= STEPS.length) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      setFiles(STATES[step + 1] ?? STATES[STATES.length - 1] ?? []);
      setStep((s) => s + 1);
      setTabKey((prev) => {
        const idx = TABS.findIndex((t) => t.key === prev);
        const next = TABS[(idx + 1) % TABS.length];
        return next?.key ?? prev;
      });
    }, STEP_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [playing, step, reducedMotion]);

  const tab = TABS.find((t) => t.key === tabKey) ?? DEFAULT_TAB;
  const lines = buildLines(tab);
  // The currently-highlighted code line is the one we *just* executed.
  const activeLine = step > 0 ? STEPS[step - 1]?.line : undefined;
  const atEnd = step >= STEPS.length && !playing;
  // With prefers-reduced-motion the autoplay timer never runs, so the
  // `files` state would sit at the empty initial. Render the final
  // step's state instead so the panel isn't blank.
  const displayFiles = reducedMotion
    ? (STATES[STATES.length - 1] ?? files)
    : files;

  function onSelectTab(key: string) {
    if (key === tabKey) return;
    setTabKey(key);
  }

  function onStepClick(stepIdx: number) {
    setPlaying(false);
    setStep(stepIdx + 1);
    setFiles(STATES[stepIdx + 1] ?? []);
  }

  function togglePlayback() {
    if (atEnd) {
      // Replay the full cycle from the first adapter.
      setTabKey(DEFAULT_TAB.key);
      setStep(0);
      setFiles(STATES[0] ?? []);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  return (
    <div className="one-api-preview">
      <div className="one-api-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tabKey}
            className={`one-api-tab${t.key === tabKey ? ' active' : ''}`}
            onClick={() => onSelectTab(t.key)}
          >
            {t.short}
          </button>
        ))}
        <a className="one-api-tab one-api-tab-more" href="/adapters">
          More →
        </a>
      </div>
      <div className="one-api-split">
        <div className="one-api-pane">
          <div className="one-api-pane-head">
            <span className="cli-preview-term-dot" />
            <span className="cli-preview-term-dot" />
            <span className="cli-preview-term-dot" />
            <span className="one-api-pane-title">storage.ts</span>
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
          <div className="one-api-code-body">
            {lines.map((line, i) => {
              const key = `${tab.key}-${i}`;
              const isActive = !reducedMotion && i === activeLine;
              const stepIdx = STEP_INDEX_BY_LINE[i];
              const clickable = stepIdx !== undefined && !reducedMotion;
              const classes = `one-api-code-line${
                isActive ? ' active' : ''
              }${clickable ? ' clickable' : ''}`;
              if (!clickable) {
                return (
                  <div key={key} className={classes}>
                    {line || ' '}
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  key={key}
                  className={classes}
                  onClick={() => onStepClick(stepIdx)}
                >
                  {line || ' '}
                </button>
              );
            })}
          </div>
        </div>
        <div className="one-api-pane">
          <div className="one-api-pane-head">
            <span className="one-api-bucket">{tab.bucketLabel}</span>
            <span className="one-api-count">
              {displayFiles.filter((f) => f.effect !== 'fade').length} files
            </span>
          </div>
          <ul className="one-api-files">
            {displayFiles.length === 0 && (
              <li className="one-api-files-empty">— empty —</li>
            )}
            {displayFiles.map((f) => (
              <li
                key={f.id}
                className={`one-api-file one-api-file-${f.effect}`}
              >
                <span className="one-api-file-path">{f.path}</span>
                <span className="one-api-file-meta">
                  {f.meta ?? f.size}
                  {f.effect === 'download' ? ' · ↓' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
