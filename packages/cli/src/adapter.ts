import { ADAPTERS, type AdapterName, buildAdapter } from '@storagesdk/adapters';
import { type ReadOnlyStorage, Storage } from '@storagesdk/core';
import { emitError } from './output.js';

function isAdapterName(name: string): name is AdapterName {
  return (ADAPTERS as readonly string[]).includes(name);
}

export interface ResolveOptions {
  // Explicit `| undefined` so callers can spread citty's `string | undefined`
  // arg values straight through under `exactOptionalPropertyTypes`.
  adapter?: string | undefined;
  /** Scope reads through `storage.snapshots.get(id)`. */
  snapshot?: string | undefined;
  /** Scope reads through `storage.forks.get(name)`. */
  fork?: string | undefined;
}

/**
 * Pick the adapter (`--adapter` then `STORAGE_ADAPTER`) and apply any
 * snapshot/fork scoping. Fork is applied first so `--snapshot` can
 * address a snapshot inside the fork. Read commands accept the broader
 * `ReadOnlyStorage` return type since the four shared methods
 * (`download`/`head`/`list`/`url`) live there.
 */
export async function resolveAdapter(
  opts: ResolveOptions = {}
): Promise<Storage | ReadOnlyStorage> {
  const base = await resolveBaseStorage(opts.adapter);
  const forked = opts.fork ? base.forks.get(opts.fork) : base;
  return opts.snapshot ? forked.snapshots.get(opts.snapshot) : forked;
}

/**
 * Variant for write commands. Forks are writable (returns a full
 * `Storage`); snapshots aren't even an option here since they're
 * read-only. `--snapshot` isn't exposed on write commands' arg specs.
 */
export async function resolveWritableStorage(opts: {
  adapter?: string | undefined;
  fork?: string | undefined;
}): Promise<Storage> {
  const base = await resolveBaseStorage(opts.adapter);
  return opts.fork ? base.forks.get(opts.fork) : base;
}

/**
 * Variant for commands that need the base `Storage` (e.g. `snapshots`
 * and `forks` list commands operate on the storage's namespaces, not on
 * a scoped view of it).
 */
export async function resolveBaseStorage(
  adapterFlag?: string
): Promise<Storage> {
  const name = adapterFlag ?? process.env.STORAGE_ADAPTER;
  if (!name) {
    emitError(
      'No adapter selected.',
      'Pass --adapter <name> or set STORAGE_ADAPTER.'
    );
    process.exit(1);
  }
  if (!isAdapterName(name)) {
    emitError(
      `Unknown adapter '${name}'.`,
      `Available: ${[...ADAPTERS].join(', ')}`
    );
    process.exit(1);
  }
  const adapter = await buildAdapter(name);
  return new Storage({ adapter });
}
