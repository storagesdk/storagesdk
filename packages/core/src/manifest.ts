import type { Adapter, ReadOnlyAdapter } from './adapter.js';
import { StorageError } from './errors.js';
import type { ForkInfo, SnapshotInfo } from './types.js';

/**
 * Filename the SDK uses for the per-location manifest **when adapters choose
 * to store it as a regular object**. Adapters are free to store the manifest
 * elsewhere (bucket tags, sidecar bucket, native API) — see `parseManifest` /
 * `serializeManifest` for the format-only helpers if you do.
 */
export const MANIFEST_PATH = '.storagesdk.metadata.json';

/**
 * True for keys the SDK reserves when an adapter stores its manifest as an
 * object at `MANIFEST_PATH`. Use to filter the manifest out of `list()` or
 * skip it during internal listing loops (e.g. snapshot/fork seeding copies).
 * Adapters that store the manifest elsewhere don't need this.
 */
export function isInternalKey(key: string): boolean {
  return key === MANIFEST_PATH;
}

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
 * Parse a manifest from its serialized JSON form. Revives `createdAt` strings
 * into `Date`. Throws `StorageError` if the version is unrecognized — older
 * readers won't silently mis-read a future schema. Adapters that store the
 * manifest in non-object storage (e.g. S3 bucket tags) call this directly.
 */
export function parseManifest(text: string): Manifest {
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
}

/**
 * Serialize a manifest to compact JSON. The format isn't meant to be human-
 * read; adapters that need to inspect it can pipe through `jq`. Compact
 * matters for capacity-constrained backends (e.g. S3 bucket tags cap at
 * ~12 KB of total value space).
 */
export function serializeManifest(manifest: Manifest): string {
  return JSON.stringify(manifest);
}

/**
 * Read the manifest at the adapter's root. Returns an empty manifest when the
 * file is missing — first-snapshot / first-fork callers don't have to special-
 * case the bootstrap. Convenience for adapters that store the manifest as a
 * regular object at `MANIFEST_PATH`.
 */
export async function readManifest(
  adapter: ReadOnlyAdapter
): Promise<Manifest> {
  try {
    const item = await adapter.download(MANIFEST_PATH);
    const text = new TextDecoder().decode(item.body);
    return parseManifest(text);
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
  await adapter.upload(MANIFEST_PATH, serializeManifest(manifest), {
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
