import type { Row } from '../components/StoreBrowser';

/** Seed contents of the `agent-runs` bucket the run-scenes operate on. */
export const SEED_ROWS: Omit<
  Row,
  'opacity' | 'translateY' | 'strike' | 'badge'
>[] = [
  {
    path: 'runs/2026-05-29.json',
    size: '4.2 KB',
    modified: 'May 29',
    kind: 'file',
  },
  {
    path: 'runs/2026-05-31.json',
    size: '3.8 KB',
    modified: 'May 31',
    kind: 'file',
  },
  {
    path: 'runs/2026-06-01.json',
    size: '5.1 KB',
    modified: 'Jun 1',
    kind: 'file',
  },
  {
    path: 'models/checkpoint.bin',
    size: '248 MB',
    modified: 'Jun 1',
    kind: 'file',
  },
  { path: 'index.json', size: '1.1 KB', modified: 'Jun 1', kind: 'file' },
];

export const UPLOADED_ROW: Omit<
  Row,
  'opacity' | 'translateY' | 'strike' | 'badge'
> = {
  path: 'runs/hello.txt',
  size: '19 B',
  modified: 'now',
  kind: 'file',
};
