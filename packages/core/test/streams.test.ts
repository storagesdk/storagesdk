import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { StorageError } from '../src/errors.js';
import { toWebStream } from '../src/streams.js';

async function readAll(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    total += result.value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

describe('toWebStream', () => {
  it('passes a Web ReadableStream through', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'));
        controller.close();
      },
    });
    const result = toWebStream(source);
    expect(result).toBe(source);
    const bytes = await readAll(result);
    expect(new TextDecoder().decode(bytes)).toBe('hello');
  });

  it('converts a string', async () => {
    const bytes = await readAll(toWebStream('hello'));
    expect(new TextDecoder().decode(bytes)).toBe('hello');
  });

  it('converts a Uint8Array', async () => {
    const input = new TextEncoder().encode('bytes');
    const bytes = await readAll(toWebStream(input));
    expect(new TextDecoder().decode(bytes)).toBe('bytes');
  });

  it('converts an ArrayBuffer', async () => {
    const input = new TextEncoder().encode('buffer').buffer;
    const bytes = await readAll(toWebStream(input));
    expect(new TextDecoder().decode(bytes)).toBe('buffer');
  });

  it('converts a Blob', async () => {
    const blob = new Blob([new TextEncoder().encode('blob')]);
    const bytes = await readAll(toWebStream(blob));
    expect(new TextDecoder().decode(bytes)).toBe('blob');
  });

  it('converts a Node Readable', async () => {
    const readable = Readable.from(['node-', 'stream']);
    const bytes = await readAll(toWebStream(readable));
    expect(new TextDecoder().decode(bytes)).toBe('node-stream');
  });

  it('throws StorageError on unsupported input', () => {
    expect(() => toWebStream({ unknown: true })).toThrow(StorageError);
    expect(() => toWebStream(123)).toThrow(StorageError);
  });
});
