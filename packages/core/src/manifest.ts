import type { Adapter, ReadOnlyAdapter } from './adapter.js';
import { StorageError } from './errors.js';
import type { ForkInfo, SnapshotInfo } from './types.js';

/** Filename the SDK uses for the per-location manifest. Internal — adapters
 * that need to filter or skip this file should hardcode the literal string. */
const MANIFEST_PATH = '.storagesdk.metadata.json';

/**
 * The shape of `.storagesdk.metadata.json` at the root of every SDK-managed location.
 * Top-level locations have `parent: null`; snapshot locations have a parent
 * with `snapshotId: null`; fork locations have a parent with `snapshotId`
 * set to the snapshot they were seeded from. `version` discriminates the
 * schema generation — `readManifest` rejects values it doesn't recognize
 * so future schema changes won't be misread by older readers.
 */
export interface Manifest {
  version: 1;
  parent: { location: string; snapshotId: string | null } | null;
  snapshots: SnapshotInfo[];
  forks: ForkInfo[];
}

/**
 * Fresh manifest for a newly-created location. Pass `parent` when creating a
 * snapshot or fork location; omit it for a top-level location.
 */
export function emptyManifest(parent?: Manifest['parent']): Manifest {
  return {
    version: 1,
    parent: parent ?? null,
    snapshots: [],
    forks: [],
  };
}

/**
 * Read the manifest at the adapter's root. Returns an empty manifest when the
 * file is missing — first-snapshot / first-fork callers don't have to special-
 * case the bootstrap. `createdAt` strings are revived into `Date` instances
 * during the JSON parse.
 */
export async function readManifest(
  adapter: ReadOnlyAdapter
): Promise<Manifest> {
  try {
    const item = await adapter.download(MANIFEST_PATH);
    const text = new TextDecoder().decode(item.body);
    const parsed = JSON.parse(text, (key, value) =>
      key === 'createdAt' && typeof value === 'string' ? new Date(value) : value
    ) as Partial<Manifest> | null;
    if (!parsed || parsed.version !== 1) {
      throw new StorageError({
        code: 'NotSupported',
        message: `manifest version ${parsed?.version} not supported by this SDK (expected 1)`,
      });
    }
    return {
      version: 1,
      parent: parsed.parent ?? null,
      snapshots: parsed.snapshots ?? [],
      forks: parsed.forks ?? [],
    };
  } catch (e) {
    if (e instanceof StorageError && e.code === 'NotFound') {
      return emptyManifest();
    }
    throw e;
  }
}

/** Write the manifest to the adapter's root, replacing whatever is there. */
export async function writeManifest(
  adapter: Adapter,
  manifest: Manifest
): Promise<void> {
  const body = JSON.stringify(manifest, null, 2);
  await adapter.upload(MANIFEST_PATH, body, {
    contentType: 'application/json',
  });
}

/**
 * Generates the id for a new snapshot of the given parent location, in the
 * SDK-owned naming convention `<parent>-snapshot-<25 digits>`. The trailing
 * 25 digits are a 13-digit millisecond timestamp followed by 12 random
 * digits drawn from `crypto.getRandomValues`. Pure function — no shared
 * state. Collision probability is ~5e-7 for 1000 calls in the same
 * millisecond; effectively zero for any realistic SDK call rate.
 */
export function nextSnapshotId(parentLocation: string): string {
  const ms = Date.now();
  const buf = new BigUint64Array(1);
  crypto.getRandomValues(buf);
  const random = ((buf[0] ?? 0n) % 1_000_000_000_000n)
    .toString()
    .padStart(12, '0');
  return `${parentLocation}-snapshot-${ms}${random}`;
}
