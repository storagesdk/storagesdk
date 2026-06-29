import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRepo = vi.hoisted(() => ({
  createCommit: vi.fn(),
  createTag: vi.fn(),
  getFileStream: vi.fn(),
  getCommit: vi.fn(),
  headFile: vi.fn(),
  listBranches: vi.fn(),
  listTags: vi.fn(),
  deleteBranch: vi.fn(),
}));

const mockStorage = vi.hoisted(() => ({
  findOne: vi.fn(),
}));

vi.mock('@pierre/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pierre/storage')>();
  return {
    ...actual,
    GitStorage: vi.fn(function GitStorage() {
      return mockStorage;
    }),
  };
});

const { codeStorage } = await import('../../src/code-storage/code-storage.js');

describe('code-storage fork mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const builder = {
      addFile: vi.fn(() => builder),
      deletePath: vi.fn(() => builder),
      send: vi.fn().mockResolvedValue(undefined),
    };
    mockStorage.findOne.mockResolvedValue({
      defaultBranch: 'main',
      ...mockRepo,
    });
    mockRepo.createCommit.mockReturnValue(builder);
    mockRepo.createTag.mockResolvedValue(undefined);
    mockRepo.getCommit.mockResolvedValue({
      commit: { sha: 'work-sha', date: new Date('2026-01-02T00:00:00Z') },
    });
    mockRepo.getFileStream.mockImplementation(() =>
      Promise.resolve(
        new Response('file-bytes', {
          headers: {
            'content-length': '10',
            'content-type': 'application/octet-stream',
            etag: 'etag',
            'last-modified': 'Thu, 01 Jan 2026 00:00:00 GMT',
          },
        })
      )
    );
    mockRepo.headFile.mockResolvedValue({
      status: 200,
      size: 10,
      contentType: 'application/octet-stream',
      etag: 'etag',
      lastModified: new Date('2026-01-01T00:00:00Z'),
    });
    mockRepo.listBranches.mockResolvedValue({
      branches: [
        {
          name: 'main',
          headSha: 'main-sha',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          name: 'work',
          headSha: 'work-sha',
          createdAt: '2026-01-02T00:00:00Z',
        },
        {
          name: 'forked',
          headSha: 'snap-sha',
          createdAt: '2026-01-03T00:00:00Z',
        },
      ],
    });
    mockRepo.listTags.mockResolvedValue({
      tags: [{ name: 'storagesdk/work/snap-1', sha: 'snap-sha' }],
    });
  });

  it('excludes the default and active branches from forks', async () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
      branch: 'work',
    });

    await expect(adapter.forks.list()).resolves.toEqual([
      { name: 'forked', createdAt: new Date('2026-01-03T00:00:00Z') },
    ]);
  });

  it('returns fromSnapshot when a fork points at a snapshot tag', async () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
      branch: 'work',
    });

    await expect(adapter.forks.head('forked')).resolves.toEqual({
      name: 'forked',
      fromSnapshot: 'snap-1',
      createdAt: new Date('2026-01-03T00:00:00Z'),
    });
  });

  it('rejects deleting the active branch as a fork', async () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
      branch: 'work',
    });

    await expect(adapter.forks.delete('work')).rejects.toMatchObject({
      code: 'InvalidArgument',
    });
    expect(mockRepo.deleteBranch).not.toHaveBeenCalled();
  });

  it('rejects getting the active branch as a fork', async () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
      branch: 'work',
    });

    expect(() => adapter.forks.get('work')).toThrow('work not found');
  });

  it('rejects using the default branch as a fork before repo resolution', async () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
    });
    const fork = adapter.forks.get('main');

    await expect(fork.download('file.txt')).rejects.toMatchObject({
      code: 'NotFound',
    });
    expect(mockRepo.getFileStream).not.toHaveBeenCalled();
  });

  it('uses snapshot name as the snapshot id', async () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
      branch: 'work',
    });

    await expect(
      adapter.snapshots.create({ name: 'named-snap' })
    ).resolves.toMatchObject({
      id: 'named-snap',
      name: 'named-snap',
    });
    expect(mockRepo.createTag).toHaveBeenCalledWith({
      name: 'storagesdk/work/named-snap',
      target: 'work-sha',
    });

    mockRepo.listTags.mockResolvedValueOnce({
      tags: [{ name: 'storagesdk/work/named-snap', sha: 'work-sha' }],
    });
    await expect(adapter.snapshots.head('named-snap')).resolves.toMatchObject({
      id: 'named-snap',
    });
  });

  it('returns non-fetchable URLs for live and snapshot refs', async () => {
    const adapter = codeStorage({
      name: 'example org',
      repo: 'repo/name',
      token: 'token',
      branch: 'work',
    });

    await expect(adapter.url('dir/file name.txt')).resolves.toBe(
      'code-storage://example%20org/repo%2Fname?ref=work&path=dir%2Ffile+name.txt'
    );
    await expect(
      adapter.snapshots.get('snap-1').url('dir/file name.txt')
    ).resolves.toBe(
      'code-storage://example%20org/repo%2Fname?ref=storagesdk%2Fwork%2Fsnap-1&path=dir%2Ffile+name.txt'
    );
  });

  it('supports detached adapter method calls', async () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
      branch: 'work',
    });
    const { upload, copy, move, snapshots } = adapter;
    const snapshotHead = snapshots.head;

    await expect(upload('uploaded.txt', 'bytes')).resolves.toMatchObject({
      path: 'uploaded.txt',
    });
    await expect(copy('from.txt', 'to.txt')).resolves.toBeUndefined();
    await expect(move('to.txt', 'moved.txt')).resolves.toBeUndefined();
    await expect(snapshotHead('snap-1')).resolves.toMatchObject({
      id: 'snap-1',
    });
  });
});
