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
      { name: 'forked', fromSnapshot: 'snap-1', createdAt: new Date(0) },
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

  it('returns fromSnapshot when a fork points at a snapshot change', async () => {
    const adapter = mesa({
      repo: 'app',
      apiKey: 'mesa_test',
      bookmark: 'work',
    });

    await expect(adapter.forks.head('forked')).resolves.toMatchObject({
      name: 'forked',
      fromSnapshot: 'snap-1',
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
});
