/**
 * Adapter-authoring entry point — `@storagesdk/core/adapter`.
 *
 * Re-exports everything from the consumer entry plus the adapter contract,
 * `defineAdapter`, the `Manifest` helpers, and stream utilities. Authors
 * write `import { ... } from '@storagesdk/core/adapter'` and get the full
 * authoring surface in one import.
 */

export type {
  Adapter,
  AdapterForks,
  AdapterSnapshots,
  ReadOnlyAdapter,
} from './adapter.js';
export { defineAdapter } from './adapter.js';
export * from './index.js';

export type { Manifest } from './manifest.js';
export {
  emptyManifest,
  nextSnapshotId,
  readManifest,
  writeManifest,
} from './manifest.js';

export { toWebStream } from './streams.js';
