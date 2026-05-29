import type { Adapter } from '@storagesdk/core/adapter';
import { type TigrisConfig, type TigrisRaw, tigris } from '../tigris/tigris.js';

export interface FlyConfig extends TigrisConfig {}

/**
 * Fly.io adapter for storagesdk.
 *
 * Fly's managed Tigris buckets use the same API surface, so this is a
 * branded alias of the Tigris adapter.
 */
export function fly(config: FlyConfig): Adapter<TigrisRaw> {
  return tigris(config);
}
