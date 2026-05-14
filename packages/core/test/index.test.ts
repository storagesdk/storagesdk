import { describe, expect, it } from 'vitest';
import { version } from '../src/index.js';

describe('@storagesdk/core', () => {
  it('exports a version placeholder', () => {
    expect(version).toBe('0.0.0');
  });
});
