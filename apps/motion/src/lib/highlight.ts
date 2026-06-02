import { syntax } from '../theme';

export type Token = { text: string; color: string };
export type Line = Token[];

const KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'const',
  'let',
  'await',
  'async',
  'new',
  'return',
  'for',
  'of',
  'if',
  'else',
  'function',
  'process',
  'env',
]);

/**
 * Tiny purpose-built tokenizer. It only has to color the handful of TS
 * snippets these scenes show, so it stays a single-pass char scanner rather
 * than pulling in a real highlighter (shiki etc.) — no async load, no bundle
 * weight, full control over the Tigris-tinted palette.
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (text: string, color: string) => {
    if (text) tokens.push({ text, color });
  };

  while (i < line.length) {
    const ch = line[i];

    // Whitespace — preserved verbatim so indentation survives.
    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
      push(line.slice(i, j), syntax.plain);
      i = j;
      continue;
    }

    // Line comment.
    if (ch === '/' && line[i + 1] === '/') {
      push(line.slice(i), syntax.comment);
      break;
    }

    // String — single or double quoted, no escapes needed for our snippets.
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j++;
      const str = line.slice(i, Math.min(j + 1, line.length));
      // Import-path strings get the "module" tint to stand out.
      const isModulePath = /@storagesdk|adapters\//.test(str);
      push(str, isModulePath ? syntax.module : syntax.string);
      i = j + 1;
      continue;
    }

    // Number.
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < line.length && /[0-9_.]/.test(line[j])) j++;
      push(line.slice(i, j), syntax.number);
      i = j;
      continue;
    }

    // Identifier / keyword.
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const next = line[j];
      let color: string = syntax.plain;
      if (KEYWORDS.has(word)) color = syntax.keyword;
      else if (next === '(')
        color = syntax.func; // call
      else if (/^[A-Z]/.test(word))
        color = syntax.type; // Storage, ClassName
      else if (line[i - 1] === '.') color = syntax.property;
      push(word, color);
      i = j;
      continue;
    }

    // Punctuation / operators.
    push(ch, syntax.punct);
    i += 1;
  }

  return tokens;
}

export function tokenize(code: string): Line[] {
  return code.split('\n').map(tokenizeLine);
}

/** Fractional 1-based line of the typing caret, for smooth viewport scroll. */
export function caretLine(code: string, reveal: number): number {
  const upto = code.slice(0, reveal);
  const full = upto.split('\n');
  const completed = full.length - 1;
  const cur = full[full.length - 1] ?? '';
  const lineLen = (code.split('\n')[completed] ?? '').length || 1;
  return completed + 1 + Math.min(1, cur.length / lineLen);
}
