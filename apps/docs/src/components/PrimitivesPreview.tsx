import { useEffect, useState } from 'react';

// ── Panels ──────────────────────────────────────────────────────────────────

type PanelKey = 'parent' | 'snapshot' | 'forkA' | 'forkB';

const PANELS: readonly { key: PanelKey; label: string }[] = [
  { key: 'parent', label: 'parent · agents' },
  { key: 'snapshot', label: 'snapshot · baseline' },
  { key: 'forkA', label: 'fork · agent-a' },
  { key: 'forkB', label: 'fork · agent-b' },
];

// ── File rows ───────────────────────────────────────────────────────────────

interface FileRow {
  readonly id: number;
  readonly path: string;
  /** Version label shown on the right side of the row (`v1`, `creative`, …). */
  readonly version: string;
  readonly effect: 'none' | 'highlight';
}

// Parent always exists (it's the bucket itself). Snapshot/forks start
// as `null` ("— not created —") and become rows once their create
// call fires.
interface State {
  readonly parent: readonly FileRow[];
  readonly snapshot: readonly FileRow[] | null;
  readonly forkA: readonly FileRow[] | null;
  readonly forkB: readonly FileRow[] | null;
}

const INITIAL_STATE: State = {
  parent: [],
  snapshot: null,
  forkA: null,
  forkB: null,
};

// ── Code ────────────────────────────────────────────────────────────────────

const LINES: readonly string[] = [
  `// Live writes flow into the parent`,
  `await storage.upload('report.md', '<initial draft>');`,
  `await storage.upload('config.json', '<initial config>');`,
  ``,
  `// Freeze the state — every fork seeds from here`,
  `const snap = await storage.snapshots.create({ name: 'baseline' });`,
  ``,
  `// Two agents run in parallel, each with its own writable view`,
  `await storage.forks.create({ name: 'agent-a', fromSnapshot: snap.id });`,
  `await storage.forks.create({ name: 'agent-b', fromSnapshot: snap.id });`,
  ``,
  `// Agent A: a creative rewrite`,
  `const a = storage.forks.get('agent-a');`,
  `await a.upload('report.md', '<creative>');`,
  ``,
  `// Agent B: a more conservative pass`,
  `const b = storage.forks.get('agent-b');`,
  `await b.upload('report.md', '<precise>');`,
  `await b.upload('config.json', '<low-temp>');`,
  ``,
  `// Parent never moved — compare and merge whichever wins`,
];

// ── Steps ───────────────────────────────────────────────────────────────────

type Action =
  | {
      readonly type: 'upload';
      readonly panel: PanelKey;
      readonly path: string;
      readonly version: string;
    }
  | { readonly type: 'snapshot' }
  | { readonly type: 'fork'; readonly into: 'forkA' | 'forkB' };

interface Step {
  readonly line: number;
  readonly action: Action;
}

const STEPS: readonly Step[] = [
  {
    line: 1,
    action: {
      type: 'upload',
      panel: 'parent',
      path: 'report.md',
      version: 'v1',
    },
  },
  {
    line: 2,
    action: {
      type: 'upload',
      panel: 'parent',
      path: 'config.json',
      version: 'v1',
    },
  },
  { line: 5, action: { type: 'snapshot' } },
  { line: 8, action: { type: 'fork', into: 'forkA' } },
  { line: 9, action: { type: 'fork', into: 'forkB' } },
  {
    line: 13,
    action: {
      type: 'upload',
      panel: 'forkA',
      path: 'report.md',
      version: 'creative',
    },
  },
  {
    line: 17,
    action: {
      type: 'upload',
      panel: 'forkB',
      path: 'report.md',
      version: 'precise',
    },
  },
  {
    line: 18,
    action: {
      type: 'upload',
      panel: 'forkB',
      path: 'config.json',
      version: 'low-temp',
    },
  },
];

const STEP_INTERVAL_MS = 2200;

// ── Reducer ─────────────────────────────────────────────────────────────────

function clearAllEffects(state: State): State {
  const clearOne = (rows: readonly FileRow[] | null) =>
    rows ? rows.map((r) => ({ ...r, effect: 'none' as const })) : null;
  return {
    parent: clearOne(state.parent) ?? [],
    snapshot: clearOne(state.snapshot),
    forkA: clearOne(state.forkA),
    forkB: clearOne(state.forkB),
  };
}

function applyAction(prev: State, action: Action, mintId: () => number): State {
  const base = clearAllEffects(prev);
  switch (action.type) {
    case 'upload': {
      const panel = base[action.panel];
      if (!panel) return base;
      const existing = panel.some((r) => r.path === action.path);
      const updated = existing
        ? panel.map((r) =>
            r.path === action.path
              ? {
                  ...r,
                  version: action.version,
                  effect: 'highlight' as const,
                }
              : r
          )
        : [
            ...panel,
            {
              id: mintId(),
              path: action.path,
              version: action.version,
              effect: 'highlight' as const,
            },
          ];
      return { ...base, [action.panel]: updated };
    }
    case 'snapshot': {
      // Snapshot becomes a frozen copy of the parent's current state.
      const cloned = base.parent.map((r) => ({
        ...r,
        id: mintId(),
        effect: 'highlight' as const,
      }));
      return { ...base, snapshot: cloned };
    }
    case 'fork': {
      // Forks seed from the snapshot (which exists by this step).
      const source = base.snapshot ?? [];
      const cloned = source.map((r) => ({
        ...r,
        id: mintId(),
        effect: 'highlight' as const,
      }));
      return { ...base, [action.into]: cloned };
    }
    default:
      return base;
  }
}

// Precompute the state after each step. Stable ids → smooth React updates.
const STATES: readonly State[] = (() => {
  const list: State[] = [INITIAL_STATE];
  let counter = 0;
  const mintId = () => ++counter;
  let current: State = INITIAL_STATE;
  for (const s of STEPS) {
    current = applyAction(current, s.action, mintId);
    list.push(current);
  }
  return list;
})();

const STEP_INDEX_BY_LINE: Record<number, number> = {};
STEPS.forEach((s, i) => {
  STEP_INDEX_BY_LINE[s.line] = i;
});

// ── Component ───────────────────────────────────────────────────────────────

export default function PrimitivesPreview() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>(() => STATES[0] ?? INITIAL_STATE);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReducedMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (step >= STEPS.length) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      setStep((s) => s + 1);
      setState(STATES[step + 1] ?? INITIAL_STATE);
    }, STEP_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [playing, step, reducedMotion]);

  const activeLine = step > 0 ? STEPS[step - 1]?.line : undefined;
  const atEnd = step >= STEPS.length && !playing;

  function onStepClick(stepIdx: number) {
    setPlaying(false);
    setStep(stepIdx + 1);
    setState(STATES[stepIdx + 1] ?? INITIAL_STATE);
  }

  function togglePlayback() {
    if (atEnd) {
      setStep(0);
      setState(STATES[0] ?? INITIAL_STATE);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  return (
    <div className="primitives-preview">
      <div className="primitives-split">
        <div className="primitives-pane">
          <div className="primitives-pane-head">
            <span className="cli-preview-term-dot" />
            <span className="cli-preview-term-dot" />
            <span className="cli-preview-term-dot" />
            <span className="primitives-pane-title">
              snapshots-and-forks.ts
            </span>
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
          <div className="primitives-code-body">
            {LINES.map((line, i) => {
              const key = `l-${i}`;
              const isActive = !reducedMotion && i === activeLine;
              const stepIdx = STEP_INDEX_BY_LINE[i];
              const clickable = stepIdx !== undefined && !reducedMotion;
              const classes = `primitives-code-line${
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
        <div className="primitives-panels">
          {PANELS.map((panel) => {
            const rows = state[panel.key];
            const exists = rows !== null;
            return (
              <div
                key={panel.key}
                className={`primitives-panel${
                  exists ? '' : ' primitives-panel-empty'
                }`}
              >
                <div className="primitives-panel-head">{panel.label}</div>
                {exists ? (
                  <ul className="primitives-panel-list">
                    {rows.length === 0 && (
                      <li className="primitives-panel-blank">— empty —</li>
                    )}
                    {rows.map((r) => (
                      <li
                        key={r.id}
                        className={`primitives-file primitives-file-${r.effect}`}
                      >
                        <span className="primitives-file-path">{r.path}</span>
                        <span className="primitives-file-meta">
                          {r.version}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="primitives-panel-placeholder">
                    — not created —
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
