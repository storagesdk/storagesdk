import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { S3Config } from './s3.js';

export const S3_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'S3_BUCKET', required: true },
  {
    name: 'S3_ACCESS_KEY_ID',
    required: false,
    fallback: ['AWS_ACCESS_KEY_ID'],
  },
  {
    name: 'S3_SECRET_ACCESS_KEY',
    required: false,
    fallback: ['AWS_SECRET_ACCESS_KEY'],
  },
  { name: 'S3_REGION', required: false, fallback: ['AWS_REGION'] },
  { name: 'S3_ENDPOINT', required: false },
  { name: 'S3_FORCE_PATH_STYLE', required: false },
];

export function s3ConfigFromEnv(): S3Config {
  const accessKeyId = optionalEnv('S3_ACCESS_KEY_ID', ['AWS_ACCESS_KEY_ID']);
  const secretAccessKey = optionalEnv('S3_SECRET_ACCESS_KEY', [
    'AWS_SECRET_ACCESS_KEY',
  ]);
  if (accessKeyId && !secretAccessKey) {
    throw new Error(
      'S3_ACCESS_KEY_ID set but S3_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY) missing'
    );
  }
  if (!accessKeyId && secretAccessKey) {
    throw new Error(
      'S3_SECRET_ACCESS_KEY set but S3_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID) missing'
    );
  }
  const region = optionalEnv('S3_REGION', ['AWS_REGION']);
  const endpoint = optionalEnv('S3_ENDPOINT');
  return {
    bucket: requireEnv('S3_BUCKET'),
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(optionalEnv('S3_FORCE_PATH_STYLE') === 'true'
      ? { forcePathStyle: true }
      : {}),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  };
}
