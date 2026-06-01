import { Fragment, useMemo, useState } from 'react';

const TS_KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'const',
  'let',
  'var',
  'function',
  'async',
  'await',
  'return',
  'if',
  'else',
  'for',
  'of',
  'in',
  'new',
  'class',
  'extends',
  'implements',
  'interface',
  'type',
  'as',
  'default',
  'true',
  'false',
  'null',
  'undefined',
  'void',
  'this',
  'throw',
  'try',
  'catch',
  'finally',
  'while',
  'do',
  'break',
  'continue',
  'switch',
  'case',
  'yield',
]);

type Token = { cls: string | null; text: string };

// Crude but effective tokenizer for short JS/TS snippets. Sufficient for
// landing-page code blocks; not a real parser.
function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  const push = (cls: string | null, text: string) => out.push({ cls, text });
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      push('c', src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '/' && next === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j === -1 ? n : j + 2;
      push('c', src.slice(i, end));
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      push('s', src.slice(i, j));
      i = j;
      continue;
    }
    if (ch && /[0-9]/.test(ch)) {
      let j = i;
      // `charAt` returns '' past EOF, which the regex won't match — same
      // behavior as the bounded `src[j]!` access without the assertion.
      while (j < n && /[0-9_xXa-fA-F.eE+-]/.test(src.charAt(j))) j++;
      while (j > i + 1 && /[+\-eE.]$/.test(src.charAt(j - 1))) j--;
      push('n', src.slice(i, j));
      i = j;
      continue;
    }
    if (ch && /[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src.charAt(j))) j++;
      const word = src.slice(i, j);
      if (TS_KEYWORDS.has(word)) push('k', word);
      else if (/^[A-Z]/.test(word)) push('t', word);
      else if (src[j] === '(') push('f', word);
      else push(null, word);
      i = j;
      continue;
    }
    if (ch && /[{}()[\];,.:?<>=+\-*/%!&|^~]/.test(ch)) {
      push('p', ch);
      i++;
      continue;
    }
    push(null, ch ?? '');
    i++;
  }
  return out;
}

function HighlightedCode({ src }: { src: string }) {
  const tokens = useMemo(() => tokenize(src), [src]);
  return (
    <pre>
      <code>
        {tokens.map((t, i) => {
          // Deterministic per-render order on a stable input; composite
          // key keeps biome quiet without paying for a uuid.
          const key = `${i}:${t.cls ?? '_'}:${t.text}`;
          return t.cls ? (
            <span key={key} className={`tok-${t.cls}`}>
              {t.text}
            </span>
          ) : (
            <Fragment key={key}>{t.text}</Fragment>
          );
        })}
      </code>
    </pre>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

interface CodeBlockProps {
  filename?: string;
  tabs?: string[];
  snippets: string | string[];
  defaultTab?: number;
  copyable?: boolean;
  height?: string | number;
}

export default function CodeBlock({
  filename,
  tabs,
  snippets,
  defaultTab = 0,
  copyable = true,
  height,
}: CodeBlockProps) {
  const [active, setActive] = useState(defaultTab);
  const [copied, setCopied] = useState(false);
  const list = Array.isArray(snippets) ? snippets : [snippets];
  const current = list[active] || '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable in some sandboxes; leave copied=false */
    }
  };

  return (
    <div className="code">
      <div className="code-head">
        {filename ? (
          <span className="code-filename">
            <span className="code-filename-dot" />
            {filename}
          </span>
        ) : null}
        {tabs ? (
          <div className="code-tabs" role="tablist">
            {tabs.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={i === active}
                className="code-tab"
                onClick={() => setActive(i)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {copyable ? (
          <button
            type="button"
            className={`code-copy${copied ? ' copied' : ''}`}
            onClick={copy}
            aria-label="Copy code"
          >
            <span className="code-copy-feedback">{copied ? 'copied' : ''}</span>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        ) : null}
      </div>
      <div
        className="code-body"
        style={height ? { maxHeight: height, overflowY: 'auto' } : undefined}
      >
        <HighlightedCode src={current} />
      </div>
    </div>
  );
}
