import { emitError } from './output.js';

/**
 * Parse a CLI flag value as a positive integer. Returns `undefined`
 * when the flag wasn't passed; exits 1 (with a friendly `emitError`
 * line) when the value isn't a positive integer. Use for `--ttl`,
 * `--max-size`, `--url-expires-in`, etc.
 */
export function parsePositiveInt(
  raw: string | undefined,
  flag: string
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    emitError(`${flag} must be a positive integer.`, `Got: ${raw}`);
    process.exit(1);
  }
  return n;
}

/**
 * Reject `--snapshot` on a write command. Snapshots are read-only, so
 * threading a write through one makes no sense — fail loudly with a
 * pointer at `--fork` (which scopes writes properly).
 */
export function rejectSnapshotFlag(snapshot?: string): void {
  if (snapshot) {
    emitError(
      '--snapshot cannot be used with write commands.',
      'Snapshots are read-only. Pass --fork to write to a fork.'
    );
    process.exit(1);
  }
}
