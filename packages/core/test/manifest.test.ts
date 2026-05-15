import { beforeEach, describe, expect, it } from 'vitest';
import type { Adapter } from '../src/adapter.js';
import {
  emptyManifest,
  nextSnapshotId,
  readManifest,
  writeManifest,
} from '../src/manifest.js';
import { inMemoryAdapter } from './in-memory-adapter.js';

describe('emptyManifest', () => {
  it('defaults parent to null, arrays to empty, version to 1', () => {
    expect(emptyManifest()).toEqual({
      version: 1,
      parent: null,
      snapshots: [],
      forks: [],
    });
  });

  it('attaches a snapshot-parent when given one', () => {
    const meta = emptyManifest({ location: 'photos', snapshotId: null });
    expect(meta.parent).toEqual({ location: 'photos', snapshotId: null });
    expect(meta.snapshots).toEqual([]);
    expect(meta.forks).toEqual([]);
    expect(meta.version).toBe(1);
  });

  it('attaches a fork-parent when given one', () => {
    const meta = emptyManifest({
      location: 'photos',
      snapshotId: 'photos-snapshot-1',
    });
    expect(meta.parent).toEqual({
      location: 'photos',
      snapshotId: 'photos-snapshot-1',
    });
  });
});

describe('readManifest / writeManifest', () => {
  let adapter: Adapter;

  beforeEach(() => {
    adapter = inMemoryAdapter();
  });

  it('returns the empty default when .storagesdk.metadata.json is missing', async () => {
    expect(await readManifest(adapter)).toEqual(emptyManifest());
  });

  it('roundtrips a written manifest', async () => {
    const meta = emptyManifest({ location: 'photos', snapshotId: null });
    meta.snapshots.push({
      id: 'photos-snapshot-1',
      name: 'baseline',
      createdAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    meta.forks.push({
      name: 'photos-exp',
      fromSnapshot: 'photos-snapshot-1',
      createdAt: new Date('2026-05-14T11:00:00.000Z'),
    });

    await writeManifest(adapter, meta);
    expect(await readManifest(adapter)).toEqual(meta);
  });

  it('hydrates createdAt fields back to Date instances', async () => {
    const meta = emptyManifest();
    meta.snapshots.push({
      id: 'photos-snapshot-1',
      createdAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    await writeManifest(adapter, meta);

    const read = await readManifest(adapter);
    expect(read.snapshots[0]?.createdAt).toBeInstanceOf(Date);
    expect(read.snapshots[0]?.createdAt.toISOString()).toBe(
      '2026-05-14T10:00:00.000Z'
    );
  });

  it('preserves optional snapshot name only when present', async () => {
    const meta = emptyManifest();
    meta.snapshots.push({
      id: 'photos-snapshot-1',
      createdAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    await writeManifest(adapter, meta);

    const read = await readManifest(adapter);
    expect('name' in (read.snapshots[0] ?? {})).toBe(false);
  });

  it('writes to the SDK-owned filename', async () => {
    await writeManifest(adapter, emptyManifest());
    const meta = await adapter.head('.storagesdk.metadata.json');
    expect(meta.contentType).toBe('application/json');
  });

  it('writes a version field', async () => {
    await writeManifest(adapter, emptyManifest());
    const item = await adapter.download('.storagesdk.metadata.json');
    const parsed = JSON.parse(new TextDecoder().decode(item.body)) as {
      version: number;
    };
    expect(parsed.version).toBe(1);
  });

  it('throws NotSupported when reading an unknown version', async () => {
    const body = JSON.stringify({ version: 2, snapshots: [], forks: [] });
    await adapter.upload('.storagesdk.metadata.json', body, {
      contentType: 'application/json',
    });
    await expect(readManifest(adapter)).rejects.toMatchObject({
      code: 'NotSupported',
    });
  });

  it('throws NotSupported when the version field is missing', async () => {
    const body = JSON.stringify({ snapshots: [], forks: [] });
    await adapter.upload('.storagesdk.metadata.json', body, {
      contentType: 'application/json',
    });
    await expect(readManifest(adapter)).rejects.toMatchObject({
      code: 'NotSupported',
    });
  });
});

describe('nextSnapshotId', () => {
  it('uses the SDK-owned naming convention', () => {
    const id = nextSnapshotId('photos');
    expect(id).toMatch(/^photos-snapshot-\d{25}$/);
  });

  it('embeds the parent location verbatim', () => {
    expect(nextSnapshotId('my-bucket')).toMatch(/^my-bucket-snapshot-/);
    expect(nextSnapshotId('photos/2024')).toMatch(/^photos\/2024-snapshot-/);
  });

  it('embeds a current-time millisecond component', () => {
    const before = Date.now();
    const id = nextSnapshotId('photos');
    const after = Date.now();
    const match = id.match(/^photos-snapshot-(\d{13})\d{12}$/);
    expect(match).not.toBeNull();
    const ms = Number(match?.[1]);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it('returns unique ids across rapid calls', () => {
    const ids = Array.from({ length: 1000 }, () => nextSnapshotId('x'));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
