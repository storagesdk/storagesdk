import { StorageError } from './errors.js';
import type { BodyInput } from './types.js';

interface NodeReadableLike {
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  destroy(err?: Error): unknown;
  pipe: unknown;
}

function isNodeReadable(x: unknown): x is NodeReadableLike {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { pipe?: unknown }).pipe === 'function' &&
    typeof (x as { on?: unknown }).on === 'function'
  );
}

function singleChunkStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export function toWebStream(input: unknown): ReadableStream<Uint8Array> {
  if (input instanceof ReadableStream) {
    return input as ReadableStream<Uint8Array>;
  }

  if (input instanceof Blob) {
    return input.stream() as ReadableStream<Uint8Array>;
  }

  if (input instanceof Uint8Array) {
    return singleChunkStream(input);
  }

  if (input instanceof ArrayBuffer) {
    return singleChunkStream(new Uint8Array(input));
  }

  if (typeof input === 'string') {
    return singleChunkStream(new TextEncoder().encode(input));
  }

  if (isNodeReadable(input)) {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        input.on('data', (chunk) => {
          if (typeof chunk === 'string') {
            controller.enqueue(encoder.encode(chunk));
          } else {
            controller.enqueue(chunk);
          }
        });
        input.on('end', () => controller.close());
        input.on('error', (err) => controller.error(err));
      },
      cancel(reason) {
        input.destroy(reason instanceof Error ? reason : undefined);
      },
    });
  }

  throw new StorageError({
    code: 'InvalidArgument',
    message: 'toWebStream: unsupported input type',
  });
}

/**
 * Read a Web `ReadableStream<Uint8Array>` to completion and return a single
 * contiguous `Uint8Array`. Adapter helper for backends that hand back streamed
 * download bodies but whose consumers want bytes (e.g. the contract's
 * `StorageItem.body`).
 */
export async function readStreamToBytes(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Reduce a `BodyInput` (the union accepted by `upload`) to a single
 * contiguous `Uint8Array`. Adapter helper for backends whose SDK takes
 * bytes rather than a stream — e.g. the FS adapter writes the buffer
 * directly to disk; the Azure and GCS SDKs accept it via `uploadData` /
 * `save`. Streams are drained via `readStreamToBytes`.
 *
 * No defensive copy when the input is already a `Uint8Array`. Callers
 * that need to retain ownership of the input should copy first.
 */
export async function bodyToBytes(body: BodyInput): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ReadableStream) return readStreamToBytes(body);
  throw new StorageError({
    code: 'InvalidArgument',
    message: 'unsupported body type',
  });
}
