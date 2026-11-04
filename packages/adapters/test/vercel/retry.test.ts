import { StorageError } from '@storagesdk/core';
import { BlobNotFoundError, BlobServiceRateLimited } from '@vercel/blob';
import { describe, expect, it, vi } from 'vitest';
import { withRateLimitRetry } from '../../src/vercel/retry.js';

const wait = vi.fn(async (_ms: number, _signal?: AbortSignal) => {});

describe('withRateLimitRetry', () => {
  it('waits retryAfter seconds, then succeeds', async () => {
    wait.mockClear();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new BlobServiceRateLimited(60))
      .mockResolvedValue('ok');
    await expect(withRateLimitRetry(fn, undefined, wait)).resolves.toBe('ok');
    expect(wait).toHaveBeenCalledWith(60_000, undefined);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('backs off 2 s, then 4 s, when no retry-after is given', async () => {
    wait.mockClear();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new BlobServiceRateLimited())
      .mockRejectedValueOnce(new BlobServiceRateLimited())
      .mockResolvedValue('ok');
    await expect(withRateLimitRetry(fn, undefined, wait)).resolves.toBe('ok');
    expect(wait.mock.calls[0]?.[0]).toBe(2000);
    expect(wait.mock.calls[1]?.[0]).toBe(4000);
  });

  it('rethrows non-rate-limit errors without retrying', async () => {
    wait.mockClear();
    const err = new BlobNotFoundError();
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRateLimitRetry(fn, undefined, wait)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('gives up after 6 attempts', async () => {
    wait.mockClear();
    const err = new BlobServiceRateLimited(1);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRateLimitRetry(fn, undefined, wait)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(6);
    expect(wait).toHaveBeenCalledTimes(5);
  });

  it('stops retrying once the signal aborts', async () => {
    const controller = new AbortController();
    const abortingWait = vi.fn(async (_ms: number, _signal?: AbortSignal) => {
      controller.abort();
    });
    const fn = vi.fn().mockRejectedValue(new BlobServiceRateLimited(1));
    await expect(
      withRateLimitRetry(fn, controller.signal, abortingWait)
    ).rejects.toBeInstanceOf(StorageError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
