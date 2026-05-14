import { describe, expect, it } from 'vitest';
import { StorageError } from '../src/errors.js';

describe('StorageError', () => {
  it('carries the normalized code', () => {
    const err = new StorageError({ code: 'NotFound' });
    expect(err.code).toBe('NotFound');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StorageError);
    expect(err.name).toBe('StorageError');
  });

  it('uses the code as default message', () => {
    const err = new StorageError({ code: 'NotFound' });
    expect(err.message).toBe('NotFound');
  });

  it('uses an explicit message when provided', () => {
    const err = new StorageError({ code: 'NotFound', message: 'photo.jpg' });
    expect(err.message).toBe('photo.jpg');
  });

  it('attaches the original error as cause', () => {
    const native = new Error('upstream');
    const err = new StorageError({ code: 'Provider', cause: native });
    expect(err.cause).toBe(native);
  });

  it('supports the documented codes', () => {
    const codes = [
      'NotFound',
      'NotSupported',
      'Conflict',
      'Unauthorized',
      'InvalidArgument',
      'Provider',
    ] as const;
    for (const code of codes) {
      const err = new StorageError({ code });
      expect(err.code).toBe(code);
    }
  });
});
