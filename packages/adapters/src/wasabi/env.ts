import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { WasabiConfig } from './wasabi.js';

export const WASABI_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'WASABI_BUCKET', required: true },
  { name: 'WASABI_REGION', required: true },
  { name: 'WASABI_ACCESS_KEY_ID', required: true },
  { name: 'WASABI_SECRET_ACCESS_KEY', required: true },
  { name: 'WASABI_ENDPOINT', required: false },
];

export function wasabiConfigFromEnv(): WasabiConfig {
  const endpoint = optionalEnv('WASABI_ENDPOINT');
  return {
    bucket: requireEnv('WASABI_BUCKET'),
    region: requireEnv('WASABI_REGION'),
    accessKeyId: requireEnv('WASABI_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('WASABI_SECRET_ACCESS_KEY'),
    ...(endpoint ? { endpoint } : {}),
  };
}
