import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { GcsConfig } from './gcs.js';

export const GCS_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'GCS_BUCKET', required: true },
  {
    name: 'GCS_PROJECT_ID',
    required: true,
    fallback: ['GOOGLE_CLOUD_PROJECT'],
  },
  {
    name: 'GCS_KEY_FILENAME',
    required: false,
    fallback: ['GOOGLE_APPLICATION_CREDENTIALS'],
  },
  { name: 'GCS_API_ENDPOINT', required: false },
];

export function gcsConfigFromEnv(): GcsConfig {
  const keyFilename = optionalEnv('GCS_KEY_FILENAME', [
    'GOOGLE_APPLICATION_CREDENTIALS',
  ]);
  const apiEndpoint = optionalEnv('GCS_API_ENDPOINT');
  return {
    bucket: requireEnv('GCS_BUCKET'),
    projectId: requireEnv('GCS_PROJECT_ID', ['GOOGLE_CLOUD_PROJECT']),
    ...(keyFilename ? { keyFilename } : {}),
    ...(apiEndpoint ? { apiEndpoint } : {}),
  };
}
