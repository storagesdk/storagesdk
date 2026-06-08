import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { MinioConfig } from './minio.js';

export const MINIO_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'MINIO_BUCKET', required: true },
  { name: 'MINIO_ENDPOINT', required: true },
  { name: 'MINIO_ACCESS_KEY_ID', required: true },
  { name: 'MINIO_SECRET_ACCESS_KEY', required: true },
  { name: 'MINIO_REGION', required: false },
  { name: 'MINIO_FORCE_PATH_STYLE', required: false },
];

export function minioConfigFromEnv(): MinioConfig {
  const region = optionalEnv('MINIO_REGION');
  const forcePathStyle = optionalEnv('MINIO_FORCE_PATH_STYLE');
  return {
    bucket: requireEnv('MINIO_BUCKET'),
    endpoint: requireEnv('MINIO_ENDPOINT'),
    accessKeyId: requireEnv('MINIO_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('MINIO_SECRET_ACCESS_KEY'),
    ...(region ? { region } : {}),
    ...(forcePathStyle !== undefined
      ? { forcePathStyle: forcePathStyle === 'true' }
      : {}),
  };
}
