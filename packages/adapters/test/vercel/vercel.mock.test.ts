import { beforeEach, describe, expect, it, vi } from 'vitest';

const put = vi.hoisted(() => vi.fn());

vi.mock('@vercel/blob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercel/blob')>();
  return { ...actual, put };
});

const { Storage } = await import('@storagesdk/core');
const { vercel } = await import('../../src/vercel/vercel.js');

describe('vercel upload multipart', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({});
  });

  const storage = () =>
    new Storage({ adapter: vercel({ bucket: 'b', token: 't' }) });

  it('passes multipart: true to put for multipart uploads', async () => {
    await storage().upload('big.bin', new Uint8Array(8), { multipart: true });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[2]).toMatchObject({ multipart: true });
  });

  it('leaves multipart off for single-PUT uploads', async () => {
    await storage().upload('small.bin', new Uint8Array(8));
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[2]).not.toHaveProperty('multipart');
  });
});
