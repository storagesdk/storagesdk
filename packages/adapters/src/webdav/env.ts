import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { WebdavConfig } from './webdav.js';

export const WEBDAV_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'WEBDAV_URL', required: true },
  { name: 'WEBDAV_ROOT', required: true },
  { name: 'WEBDAV_FOLDER', required: true },
  { name: 'WEBDAV_USERNAME', required: false },
  { name: 'WEBDAV_PASSWORD', required: false },
  { name: 'WEBDAV_TOKEN', required: false },
  { name: 'WEBDAV_AUTH_TYPE', required: false },
];

export function webdavConfigFromEnv(): WebdavConfig {
  const username = optionalEnv('WEBDAV_USERNAME');
  const password = optionalEnv('WEBDAV_PASSWORD');
  const token = optionalEnv('WEBDAV_TOKEN');
  const authType = optionalEnv('WEBDAV_AUTH_TYPE');
  const validAuth =
    authType === 'basic' ||
    authType === 'digest' ||
    authType === 'token' ||
    authType === 'none';
  return {
    baseUrl: requireEnv('WEBDAV_URL'),
    root: requireEnv('WEBDAV_ROOT'),
    folder: requireEnv('WEBDAV_FOLDER'),
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(token ? { token } : {}),
    ...(validAuth ? { authType } : {}),
  };
}
