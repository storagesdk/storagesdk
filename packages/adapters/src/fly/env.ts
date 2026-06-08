import type { AdapterEnvVar } from '../registry.js';
import { TIGRIS_ENV_VARS, tigrisConfigFromEnv } from '../tigris/env.js';
import type { FlyConfig } from './fly.js';

/**
 * Fly's Tigris-backed buckets share the Tigris client and env-var
 * convention. Reuses `TIGRIS_*` rather than inventing `FLY_*` aliases.
 */
export const FLY_ENV_VARS: readonly AdapterEnvVar[] = TIGRIS_ENV_VARS;

export function flyConfigFromEnv(): FlyConfig {
  return tigrisConfigFromEnv();
}
