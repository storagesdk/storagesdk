/**
 * `COMMON_ARGS` — the adapter + JSON output flags every command (other
 * than `cat`, which has no structured output) accepts.
 */
export const COMMON_ARGS = {
  adapter: {
    type: 'string',
    description: 'Adapter name. Falls back to STORAGE_ADAPTER env var.',
  },
  json: {
    type: 'boolean',
    description:
      'Force JSON output. Default is human when TTY, JSON otherwise.',
  },
} as const;

/**
 * `SCOPE_ARGS` — `--snapshot` and `--fork` modify which view of the
 * storage an object-read command (`ls`/`stat`/`cat`/`sign`) targets.
 * Both flags may be set together; fork is applied first so the snapshot
 * can address one inside the fork.
 */
export const SCOPE_ARGS = {
  snapshot: {
    type: 'string',
    description:
      'Scope the read into a snapshot by id. Composes with --fork (fork is applied first).',
  },
  fork: {
    type: 'string',
    description: 'Scope the read into a fork by name.',
  },
} as const;

/**
 * `WRITE_SCOPE_ARGS` — write commands accept `--fork` (forks are
 * writable) and declare `--snapshot` only to give it a friendly
 * rejection. Without the explicit declaration, `citty` swallows
 * `--snapshot bar` and treats `bar` as a stray positional, silently
 * misrouting writes. Use `rejectSnapshotFlag()` at the top of each
 * write command's `run` to enforce the rule.
 */
export const WRITE_SCOPE_ARGS = {
  fork: {
    type: 'string',
    description: 'Scope the write into a fork by name.',
  },
  snapshot: {
    type: 'string',
    description:
      'Rejected — snapshots are read-only. Use --fork to write to a fork.',
  },
} as const;
