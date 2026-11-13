import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { BunnyConfig, BunnyRegion } from './bunny.js';

export const BUNNY_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'BUNNY_STORAGE_ZONE', required: true },
  { name: 'BUNNY_STORAGE_BUCKET', required: true },
  { name: 'BUNNY_STORAGE_ACCESS_KEY', required: true },
  { name: 'BUNNY_STORAGE_REGION', required: false },
  { name: 'BUNNY_STORAGE_ENDPOINT', required: false },
  { name: 'BUNNY_PULL_ZONE', required: false },
];

export function bunnyConfigFromEnv(): BunnyConfig {
  const region = optionalEnv('BUNNY_STORAGE_REGION');
  const endpoint = optionalEnv('BUNNY_STORAGE_ENDPOINT');
  const pullZone = optionalEnv('BUNNY_PULL_ZONE');
  return {
    zone: requireEnv('BUNNY_STORAGE_ZONE'),
    bucket: requireEnv('BUNNY_STORAGE_BUCKET'),
    accessKey: requireEnv('BUNNY_STORAGE_ACCESS_KEY'),
    ...(region ? { region: region as BunnyRegion } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(pullZone ? { pullZone } : {}),
  };
}
