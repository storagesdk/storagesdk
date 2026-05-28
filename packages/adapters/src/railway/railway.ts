import type { Adapter } from '@storagesdk/core/adapter';
import { type TigrisConfig, type TigrisRaw, tigris } from '../tigris/tigris.js';

export interface RailwayConfig extends TigrisConfig {}

/**
 * Railway adapter for storagesdk.
 *
 * Railway Buckets run on Tigris; this adapter is a branded alias of the
 * Tigris adapter with the same behavior and feature set.
 */
export function railway(config: RailwayConfig): Adapter<TigrisRaw> {
  return tigris(config);
}
