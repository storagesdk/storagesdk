/**
 * `pipeline()` to a downstream consumer (stdout, another process) can
 * reject with `ERR_STREAM_PREMATURE_CLOSE` when the consumer closes
 * before we finish writing — `storage cat foo | head` is the canonical
 * case. The transfer is fine from our side; the user's pipe just
 * terminated. Treat as clean exit.
 */
export function isPrematureClose(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}
