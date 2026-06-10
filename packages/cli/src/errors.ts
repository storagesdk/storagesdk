import { StorageError } from '@storagesdk/core';
import { emitError } from './output.js';

const HINTS: Record<string, string> = {
  NotFound: 'Check the path and that it exists in the selected adapter.',
  Unauthorized: 'Check the adapter env vars (see `storage adapters <name>`).',
  InvalidArgument: 'Check the command arguments.',
  Conflict: 'The target already exists or conflicts with another resource.',
  NotSupported: 'This adapter does not support the operation.',
};

/**
 * Funnel for command bodies. `StorageError` becomes a clean stderr
 * message + a per-code hint; anything else is re-thrown so the user
 * sees the raw stack (likely a CLI bug). Exits the process so each
 * command can just `await run(args).catch(handleStorageError)`.
 */
export function handleStorageError(error: unknown): never {
  if (error instanceof StorageError) {
    emitError(error.message, HINTS[error.code]);
    process.exit(1);
  }
  throw error;
}
