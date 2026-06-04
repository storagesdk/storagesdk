import { checkSignal } from './abort.js';
import { StorageError } from './errors.js';
import type { ReadOnlyStorage, Storage } from './storage.js';
import type {
  ListOptions,
  MergeOptions,
  MergeResult,
  StorageItem,
  StorageItemMeta,
  UploadOptions,
} from './types.js';

type ListedStorage = Pick<ReadOnlyStorage, 'list'>;

interface MergePlan {
  toAdd: string[];
  toUpdate: string[];
  toDelete: string[];
  toSkip: string[];
}

export async function emulatedMerge<Raw = unknown>(
  storage: Storage<Raw>,
  name: string,
  opts?: MergeOptions
): Promise<MergeResult> {
  checkSignal(opts?.signal);
  const conflict = opts?.onConflict ?? 'source';
  const fork = storage.forks.get(name);
  const [forkObjects, parentObjects] = await Promise.all([
    listAll(fork, opts?.signal),
    listAll(storage, opts?.signal),
  ]);

  const plan: MergePlan = {
    toAdd: [],
    toUpdate: [],
    toDelete: [],
    toSkip: [],
  };

  for (const [path, forkObject] of forkObjects) {
    const parentObject = parentObjects.get(path);
    if (!parentObject) {
      plan.toAdd.push(path);
      continue;
    }
    if (
      await sameObject(
        storage,
        fork,
        path,
        parentObject,
        forkObject,
        opts?.signal
      )
    ) {
      plan.toSkip.push(path);
      continue;
    }
    if (conflict === 'destination') {
      plan.toSkip.push(path);
      continue;
    }
    if (
      conflict === 'newer' &&
      forkObject.lastModified <= parentObject.lastModified
    ) {
      plan.toSkip.push(path);
      continue;
    }
    plan.toUpdate.push(path);
  }

  if (opts?.deletions) {
    const forkInfo = await storage.forks.head(name, signalOpts(opts.signal));
    if (!forkInfo.fromSnapshot) {
      throw new StorageError({
        code: 'InvalidArgument',
        message: 'deletions: true requires a fork created with fromSnapshot',
      });
    }
    const ancestorObjects = await listAll(
      storage.snapshots.get(forkInfo.fromSnapshot),
      opts.signal
    );
    for (const path of ancestorObjects.keys()) {
      if (!forkObjects.has(path) && parentObjects.has(path)) {
        plan.toDelete.push(path);
      }
    }
  }

  for (const paths of Object.values(plan)) paths.sort();

  const result = resultFromPlan(plan);
  if (opts?.dryRun) return { ...result, plan };

  const total = plan.toAdd.length + plan.toUpdate.length + plan.toDelete.length;
  let processed = 0;
  opts?.onProgress?.({ processed, total });

  const added = new Set<string>();
  const backups = new Map<string, StorageItem>();

  try {
    for (const path of plan.toUpdate) {
      checkSignal(opts?.signal);
      backups.set(path, await storage.download(path, signalOpts(opts?.signal)));
    }
    for (const path of plan.toDelete) {
      checkSignal(opts?.signal);
      backups.set(path, await storage.download(path, signalOpts(opts?.signal)));
    }

    for (const path of plan.toAdd) {
      checkSignal(opts?.signal);
      const item = await fork.download(path, signalOpts(opts?.signal));
      checkSignal(opts?.signal);
      await storage.upload(path, item.body, uploadOpts(item, opts?.signal));
      added.add(path);
      processed++;
      opts?.onProgress?.({ processed, total });
    }

    for (const path of plan.toUpdate) {
      checkSignal(opts?.signal);
      const item = await fork.download(path, signalOpts(opts?.signal));
      checkSignal(opts?.signal);
      await storage.upload(path, item.body, uploadOpts(item, opts?.signal));
      processed++;
      opts?.onProgress?.({ processed, total });
    }

    for (const path of plan.toDelete) {
      checkSignal(opts?.signal);
      await storage.delete(path, signalOpts(opts?.signal));
      processed++;
      opts?.onProgress?.({ processed, total });
    }
  } catch (err) {
    await rollback(storage, added, backups);
    throw err;
  }

  if (opts?.deleteAfterMerge) {
    checkSignal(opts?.signal);
    await storage.forks.delete(name, signalOpts(opts?.signal));
  }

  return result;
}

async function listAll(
  storage: ListedStorage,
  signal: AbortSignal | undefined
): Promise<Map<string, StorageItemMeta>> {
  const items = new Map<string, StorageItemMeta>();
  let cursor: string | undefined;
  do {
    checkSignal(signal);
    const opts: ListOptions = {
      ...(cursor !== undefined ? { cursor } : {}),
      ...(signal ? { signal } : {}),
    };
    const page = await storage.list(opts);
    for (const item of page.items) items.set(item.path, item);
    cursor = page.cursor;
  } while (cursor !== undefined);
  return items;
}

function signalOpts(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

function uploadOpts(
  item: StorageItemMeta,
  signal: AbortSignal | undefined
): UploadOptions {
  return {
    contentType: item.contentType,
    ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
    ...(signal ? { signal } : {}),
  };
}

async function sameObject<Raw>(
  parent: Storage<Raw>,
  fork: Storage<Raw>,
  path: string,
  parentObject: StorageItemMeta,
  forkObject: StorageItemMeta,
  signal: AbortSignal | undefined
): Promise<boolean> {
  if (parentObject.etag && parentObject.etag === forkObject.etag) return true;
  if (parentObject.size !== forkObject.size) return false;

  checkSignal(signal);
  const [parentItem, forkItem] = await Promise.all([
    parent.download(path, signalOpts(signal)),
    fork.download(path, signalOpts(signal)),
  ]);
  return bytesEqual(parentItem.body, forkItem.body);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function rollback<Raw>(
  storage: Storage<Raw>,
  added: Set<string>,
  backups: Map<string, StorageItem>
): Promise<void> {
  for (const path of added) {
    await storage.delete(path).catch(() => {});
  }
  for (const [path, item] of backups) {
    await storage
      .upload(path, item.body, uploadOpts(item, undefined))
      .catch(() => {});
  }
}

function resultFromPlan(plan: MergePlan): MergeResult {
  return {
    added: plan.toAdd.length,
    updated: plan.toUpdate.length,
    deleted: plan.toDelete.length,
    skipped: plan.toSkip.length,
  };
}
