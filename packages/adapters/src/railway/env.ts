import type { AdapterEnvVar } from '../registry.js';
import { TIGRIS_ENV_VARS, tigrisConfigFromEnv } from '../tigris/env.js';
import type { RailwayConfig } from './railway.js';

/**
 * Railway Buckets are Tigris-backed; same env-var convention. Reuses
 * `TIGRIS_*` rather than inventing `RAILWAY_*` aliases.
 */
export const RAILWAY_ENV_VARS: readonly AdapterEnvVar[] = TIGRIS_ENV_VARS;

export function railwayConfigFromEnv(): RailwayConfig {
  return tigrisConfigFromEnv();
}
