import { describe, expect, it } from 'vitest';
import { StorageError } from '../src/errors.js';
import { normalizePath, normalizePrefix } from '../src/paths.js';

describe('normalizePath', () => {
  it('returns clean paths unchanged', () => {
    expect(normalizePath('photo.jpg')).toBe('photo.jpg');
    expect(normalizePath('photos/2024/img.jpg')).toBe('photos/2024/img.jpg');
  });

  it('strips a single leading slash', () => {
    expect(normalizePath('/photo.jpg')).toBe('photo.jpg');
  });

  it('strips multiple leading slashes', () => {
    expect(normalizePath('///photo.jpg')).toBe('photo.jpg');
  });

  it('preserves trailing content unchanged', () => {
    expect(normalizePath('/photos/2024/img.jpg')).toBe('photos/2024/img.jpg');
    expect(normalizePath('photos/')).toBe('photos/');
  });

  it('rejects empty paths', () => {
    expect(() => normalizePath('')).toThrow(StorageError);
  });

  it('rejects paths that are only slashes', () => {
    expect(() => normalizePath('/')).toThrow(StorageError);
    expect(() => normalizePath('///')).toThrow(StorageError);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(() => normalizePath(undefined)).toThrow(StorageError);
    // @ts-expect-error testing runtime guard
    expect(() => normalizePath(123)).toThrow(StorageError);
  });

  it('throws StorageError with InvalidArgument code', () => {
    try {
      normalizePath('');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(StorageError);
      expect((e as StorageError).code).toBe('InvalidArgument');
    }
  });
});

describe('normalizePrefix', () => {
  it('strips leading slashes', () => {
    expect(normalizePrefix('/photos/')).toBe('photos/');
    expect(normalizePrefix('///photos/')).toBe('photos/');
  });

  it('returns clean prefixes unchanged', () => {
    expect(normalizePrefix('photos/')).toBe('photos/');
    expect(normalizePrefix('photos/2024/')).toBe('photos/2024/');
  });

  it('allows empty results (unlike normalizePath)', () => {
    expect(normalizePrefix('')).toBe('');
    expect(normalizePrefix('/')).toBe('');
    expect(normalizePrefix('///')).toBe('');
  });

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(() => normalizePrefix(123)).toThrow(StorageError);
  });
});
