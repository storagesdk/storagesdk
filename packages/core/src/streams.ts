import { StorageError } from './errors.js';

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
