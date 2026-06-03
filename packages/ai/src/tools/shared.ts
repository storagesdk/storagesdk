import type { ReadOnlyStorage, Storage } from '@storagesdk/core';
import { z } from 'zod';

/**
 * Optional fields a read tool accepts to route the read to a snapshot,
 * a fork, or a snapshot inside a fork. Spread into the tool's
 * `inputSchema`.
 */
export const snapshotAndFork = {
  snapshot: z
    .string()
    .optional()
    .describe(
      'Read from a snapshot by id. Omit to read the current live state.'
    ),
  fork: z
    .string()
    .optional()
    .describe(
      'Read from a fork by name. Combine with `snapshot` to read a snapshot of that fork.'
    ),
};

/**
 * The `ReadOnlyStorage` handle at the given fork and/or snapshot
 * coordinates. Walks `storage.forks.get(...).snapshots.get(...)` only
 * for the fields that are set; passing an empty object returns the
 * root storage as a read-only view.
 */
export function readOnlyStorageAt(
  storage: Storage,
  address: { snapshot?: string | undefined; fork?: string | undefined }
): ReadOnlyStorage {
  const forked: Storage = address.fork
    ? storage.forks.get(address.fork)
    : storage;
  return address.snapshot ? forked.snapshots.get(address.snapshot) : forked;
}

/**
 * The `Storage` handle at the given fork coordinate. Snapshots are
 * immutable so there is no equivalent navigation for them on the
 * write side.
 */
export function storageAt(
  storage: Storage,
  address: { fork?: string | undefined }
): Storage {
  return address.fork ? storage.forks.get(address.fork) : storage;
}
