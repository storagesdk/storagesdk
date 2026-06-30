import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { CodeStorageConfig } from './code-storage.js';

export const CODE_STORAGE_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'CODE_STORAGE_NAME', required: true },
  { name: 'CODE_STORAGE_REPO', required: true },
  { name: 'CODE_STORAGE_KEY', required: false },
  { name: 'CODE_STORAGE_TOKEN', required: false },
  { name: 'CODE_STORAGE_BRANCH', required: false },
  { name: 'CODE_STORAGE_API_BASE_URL', required: false },
  { name: 'CODE_STORAGE_STORAGE_BASE_URL', required: false },
  { name: 'CODE_STORAGE_DEFAULT_TTL', required: false },
  { name: 'CODE_STORAGE_AUTHOR_NAME', required: false },
  { name: 'CODE_STORAGE_AUTHOR_EMAIL', required: false },
];

export function codeStorageConfigFromEnv(): CodeStorageConfig {
  const key = optionalEnv('CODE_STORAGE_KEY');
  const token = optionalEnv('CODE_STORAGE_TOKEN');
  const branch = optionalEnv('CODE_STORAGE_BRANCH');
  const apiBaseUrl = optionalEnv('CODE_STORAGE_API_BASE_URL');
  const storageBaseUrl = optionalEnv('CODE_STORAGE_STORAGE_BASE_URL');
  const defaultTTL = optionalEnv('CODE_STORAGE_DEFAULT_TTL');
  const authorName = optionalEnv('CODE_STORAGE_AUTHOR_NAME');
  const authorEmail = optionalEnv('CODE_STORAGE_AUTHOR_EMAIL');

  return {
    name: requireEnv('CODE_STORAGE_NAME'),
    repo: requireEnv('CODE_STORAGE_REPO'),
    ...(key !== undefined ? { key } : {}),
    ...(token !== undefined ? { token } : {}),
    ...(branch !== undefined ? { branch } : {}),
    ...(apiBaseUrl !== undefined ? { apiBaseUrl } : {}),
    ...(storageBaseUrl !== undefined ? { storageBaseUrl } : {}),
    ...(defaultTTL !== undefined ? { defaultTTL: Number(defaultTTL) } : {}),
    ...(authorName !== undefined && authorEmail !== undefined
      ? { author: { name: authorName, email: authorEmail } }
      : {}),
  };
}
