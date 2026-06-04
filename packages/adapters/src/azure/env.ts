import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { AzureConfig } from './azure.js';

export const AZURE_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'AZURE_BUCKET', required: true },
  {
    name: 'AZURE_ACCOUNT_NAME',
    required: true,
    fallback: ['AZURE_STORAGE_ACCOUNT'],
  },
  {
    name: 'AZURE_ACCOUNT_KEY',
    required: true,
    fallback: ['AZURE_STORAGE_KEY'],
  },
  { name: 'AZURE_ENDPOINT', required: false },
];

export function azureConfigFromEnv(): AzureConfig {
  const endpoint = optionalEnv('AZURE_ENDPOINT');
  return {
    bucket: requireEnv('AZURE_BUCKET'),
    accountName: requireEnv('AZURE_ACCOUNT_NAME', ['AZURE_STORAGE_ACCOUNT']),
    accountKey: requireEnv('AZURE_ACCOUNT_KEY', ['AZURE_STORAGE_KEY']),
    ...(endpoint ? { endpoint } : {}),
  };
}
