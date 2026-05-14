import { beforeEach, describe, expect, it } from 'vitest';
import { StorageError } from '../src/errors.js';
import { type ReadOnlyStorage, Storage } from '../src/storage.js';
import type { StorageItem } from '../src/types.js';
import { inMemoryAdapter } from './in-memory-adapter.js';

const bodyText = (item: StorageItem) => new TextDecoder().decode(item.body);

describe('snapshot read access', () => {
  let storage: Storage;
  let snapId: string;
  let reader: ReadOnlyStorage;

  beforeEach(async () => {
    storage = new Storage({ adapter: inMemoryAdapter() });
    await storage.upload('photos/a.jpg', 'a');
    await storage.upload('photos/b.jpg', 'b');
    await storage.upload('videos/c.mp4', 'c');
    const info = await storage.snapshots.create({ name: 'baseline' });
    snapId = info.id;
    await storage.delete('photos/a.jpg');
    await storage.upload('photos/b.jpg', 'b-changed');
    reader = storage.snapshots.get(snapId);
  });

  it('reads frozen content', async () => {
    expect(bodyText(await reader.download('photos/a.jpg'))).toBe('a');
    expect(bodyText(await reader.download('photos/b.jpg'))).toBe('b');
  });

  it('exposes raw bytes on the StorageItem', async () => {
    const item = await reader.download('photos/a.jpg');
    expect(item.body.byteLength).toBe(1);
  });

  it('head returns metadata for snapshot content', async () => {
    const item = await reader.head('photos/a.jpg');
    expect(item.size).toBe(1);
  });

  it('list shows snapshot keys, not live keys', async () => {
    const { items } = await reader.list({ prefix: 'photos/' });
    expect(items.map((i: { path: string }) => i.path).sort()).toEqual([
      'photos/a.jpg',
      'photos/b.jpg',
    ]);
  });

  it('url returns a snapshot-scoped URL', async () => {
    const u = await reader.url('photos/a.jpg');
    expect(u).toContain('snapshot=');
  });

  it('reader does not expose write methods', () => {
    expect('upload' in reader).toBe(false);
    expect('delete' in reader).toBe(false);
    expect('forks' in reader).toBe(false);
    expect('snapshots' in reader).toBe(false);
  });

  it('throws NotFound for keys not in the snapshot', async () => {
    await expect(reader.download('missing.jpg')).rejects.toBeInstanceOf(
      StorageError
    );
  });

  it('normalizes paths at the snapshot layer', async () => {
    expect(bodyText(await reader.download('/photos/a.jpg'))).toBe('a');
  });

  it('supports download as: text', async () => {
    expect(await reader.download('photos/a.jpg', { as: 'text' })).toBe('a');
  });
});
