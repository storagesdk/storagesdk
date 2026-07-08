import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMesa = vi.hoisted(() => ({
  repos: { get: vi.fn() },
  bookmarks: {
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    move: vi.fn(),
  },
  changes: { create: vi.fn() },
  content: { get: vi.fn() },
}));

vi.mock('@mesadev/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mesadev/sdk')>();
  return {
    ...actual,
    Mesa: vi.fn(function Mesa() {
      return mockMesa;
    }),
  };
});

const { mesa } = await import('../../src/mesa/mesa.js');

describe('mesa bookmark mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMesa.repos.get.mockResolvedValue({
      default_bookmark: 'main',
      head_change_id: 'main-change',
    });
    mockMesa.bookmarks.get.mockImplementation(({ bookmark }) => {
      const changeIds: Record<string, string> = {
        main: 'main-change',
        work: 'work-change',
        'storagesdk/snapshots/work/snap-1': 'snap-change',
        forked: 'snap-change',
      };
      if (changeIds[bookmark] === undefined) throw new Error('missing');
      return Promise.resolve({
        name: bookmark,
        change_id: changeIds[bookmark],
      });
    });
    mockMesa.bookmarks.list.mockResolvedValue({
      bookmarks: [
        { name: 'main', change_id: 'main-change' },
        { name: 'work', change_id: 'work-change' },
        { name: 'storagesdk/snapshots/work/snap-1', change_id: 'snap-change' },
        { name: 'forked', change_id: 'snap-change' },
      ],
    });
  });

  it('excludes the active bookmark and snapshot bookmarks from forks', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(adapter.forks.list()).resolves.toEqual([
      { name: 'forked', createdAt: new Date(0) },
    ]);
  });

  it('rejects deleting the active bookmark or snapshot bookmarks as forks', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(adapter.forks.delete('work')).rejects.toMatchObject({
      code: 'InvalidArgument',
    });
    await expect(
      adapter.forks.delete('storagesdk/snapshots/work/snap-1')
    ).rejects.toMatchObject({ code: 'InvalidArgument' });
    expect(mockMesa.bookmarks.delete).not.toHaveBeenCalled();
  });

  it('rejects opening the active bookmark or snapshot bookmarks as forks', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(
      adapter.forks.get('work').upload('file.txt', 'body')
    ).rejects.toMatchObject({
      code: 'NotFound',
    });
    await expect(
      adapter.forks
        .get('storagesdk/snapshots/work/snap-1')
        .upload('file.txt', 'body')
    ).rejects.toMatchObject({ code: 'NotFound' });
    expect(mockMesa.bookmarks.move).not.toHaveBeenCalled();
  });

  it('uses snapshot name as the snapshot id', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(
      adapter.snapshots.create({ name: 'pre-migration' })
    ).resolves.toMatchObject({ id: 'pre-migration', name: 'pre-migration' });
    expect(mockMesa.bookmarks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'storagesdk/snapshots/work/pre-migration',
      })
    );
  });

  it('rejects fork names in the snapshot namespace', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(
      adapter.forks.create({ name: 'storagesdk/snapshots/work/fork' })
    ).rejects.toMatchObject({ code: 'InvalidArgument' });
    // No bookmark was created for the offending fork name. (The
    // parent-side auto-snapshot in `defineAdapter` may have created
    // and then rolled back its own bookmark; that's not what this
    // test asserts against.)
    expect(mockMesa.bookmarks.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'storagesdk/snapshots/work/fork' })
    );
  });

  it('does not infer fromSnapshot from matching change ids', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(adapter.forks.head('forked')).resolves.toEqual({
      name: 'forked',
      createdAt: new Date(0),
    });
  });

  it('maps missing fromSnapshot lookup failures to StorageError', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(
      adapter.forks.create({ name: 'forked', fromSnapshot: 'missing' })
    ).rejects.toMatchObject({ code: 'Provider' });
  });

  it('lists all depths in stable path order before slicing pages', async () => {
    mockMesa.content.get.mockResolvedValue({
      type: 'dir',
      path: '',
      entries: [
        {
          type: 'dir',
          path: 'z',
          entries: [
            {
              type: 'dir',
              path: 'z/a',
              entries: [
                { type: 'file', path: 'z/a/file.txt', size: 1, sha: 'z' },
              ],
            },
          ],
        },
        { type: 'file', path: 'a.txt', size: 1, sha: 'a' },
        { type: 'file', path: 'm.txt', size: 1, sha: 'm' },
      ],
    });

    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(adapter.list({ limit: 2 })).resolves.toMatchObject({
      items: [{ path: 'a.txt' }, { path: 'm.txt' }],
      cursor: '2',
    });
    await expect(
      adapter.list({ limit: 2, cursor: '2' })
    ).resolves.toMatchObject({
      items: [{ path: 'z/a/file.txt' }],
    });
    expect(mockMesa.content.get).toHaveBeenCalledWith(
      expect.not.objectContaining({ depth: expect.anything() })
    );
  });
});
