/**
 * Output detection: human-readable when stdout is a TTY, JSON when
 * piped. Both can be overridden by an explicit `json` flag on the
 * command.
 */
export type OutputMode = 'human' | 'json';

export function resolveOutputMode(jsonFlag?: boolean): OutputMode {
  if (jsonFlag === true) return 'json';
  if (jsonFlag === false) return 'human';
  return process.stdout.isTTY ? 'human' : 'json';
}

/**
 * Print a value in the requested mode. Pure passthrough — formatting
 * decisions live in the caller (each command knows its own shape).
 */
export function emit(mode: OutputMode, human: string, json: unknown): void {
  if (mode === 'json') {
    process.stdout.write(`${JSON.stringify(json)}\n`);
  } else {
    process.stdout.write(`${human}\n`);
  }
}

/**
 * Print an error to stderr. Always human-readable; JSON-mode errors
 * still go to stderr because piped consumers expect successful output
 * on stdout, errors elsewhere.
 */
export function emitError(message: string, hint?: string): void {
  process.stderr.write(`✗ ${message}\n`);
  if (hint) {
    process.stderr.write(`  ${hint}\n`);
  }
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

/**
 * Emit a success confirmation for a write command. Human-readable goes
 * to **stderr** so it doesn't pollute stdout (which `cp` may use for
 * downloaded bytes); JSON-mode structured output goes to stdout for
 * piping into `jq`. Callers should skip this entirely when stdout is
 * the data destination (e.g. `cp storage://… -`).
 */
export function emitWriteSuccess(
  mode: OutputMode,
  human: string,
  json: unknown
): void {
  if (mode === 'json') {
    process.stdout.write(`${JSON.stringify(json)}\n`);
  } else {
    process.stderr.write(`${human}\n`);
  }
}
