import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { SpacesConfig } from './spaces.js';

export const SPACES_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'SPACES_BUCKET', required: true },
  { name: 'SPACES_REGION', required: true },
  { name: 'SPACES_ACCESS_KEY_ID', required: true },
  { name: 'SPACES_SECRET_ACCESS_KEY', required: true },
  { name: 'SPACES_ENDPOINT', required: false },
];

export function spacesConfigFromEnv(): SpacesConfig {
  const endpoint = optionalEnv('SPACES_ENDPOINT');
  return {
    bucket: requireEnv('SPACES_BUCKET'),
    region: requireEnv('SPACES_REGION'),
    accessKeyId: requireEnv('SPACES_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('SPACES_SECRET_ACCESS_KEY'),
    ...(endpoint ? { endpoint } : {}),
  };
}
