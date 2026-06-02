/**
 * Dark, Tigris-tinted palette shared across every scene. Tigris brand reads
 * as teal/mint on near-black, so the editor chrome, browser chrome, and
 * syntax colors all sit in that family with a couple of warm accents for
 * contrast (strings, numbers).
 */
export const theme = {
  // Surfaces — near-black with a faint teal cast.
  bgDeep: '#070B0A',
  bg: '#0A100E',
  panel: '#0E1714',
  panelRaised: '#122019',
  border: '#1C2C27',
  borderBright: '#274038',

  // Text.
  text: '#DCEAE5',
  textDim: '#8AA39B',
  textFaint: '#5A6F69',

  // Tigris accent family.
  accent: '#2DD4BF', // teal-400
  accentBright: '#5EEAD4', // teal-300
  accentDeep: '#0D9488', // teal-600
  accentGlow: 'rgba(45, 212, 191, 0.35)',

  // Status.
  good: '#7DE0A6',
  warn: '#F5C77E',
  bad: '#F2867C',
  info: '#7FD7FF',

  // Per-adapter brand tints (used on the import "chip" as adapters swap).
  adapters: {
    tigris: '#2DD4BF',
    s3: '#F2A65A',
    azure: '#4FA3FF',
    github: '#C9B7FF',
  },
} as const;

/** Syntax token colors — teal-leaning with warm strings/numbers. */
export const syntax = {
  plain: theme.text,
  keyword: '#5EEAD4', // import / const / await / new / from
  type: '#FFD9A0', // Storage, capitalized identifiers
  func: '#7FD7FF', // method / function calls
  string: '#A7E8A0',
  number: '#F5C77E',
  property: '#CFE3DD',
  punct: '#6E847D',
  comment: '#566A64',
  module: '#A7E8A0', // package-name strings in import paths
} as const;

export const fonts = {
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, monospace",
} as const;
