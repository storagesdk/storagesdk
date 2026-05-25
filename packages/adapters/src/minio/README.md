# @storagesdk/adapters/minio

[MinIO](https://min.io/) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
```

```ts
import { Storage } from '@storagesdk/core';
import { minio } from '@storagesdk/adapters/minio';

const storage = new Storage({
  adapter: minio({
    bucket: 'photos',
    endpoint: 'http://localhost:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  }),
});
```

## Configuration

```ts
minio({
  bucket: string;             // bucket the adapter operates on (must already exist)
  endpoint: string;           // MinIO endpoint URL (required, no default)
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;            // optional; defaults to 'us-east-1'
  forcePathStyle?: boolean;   // optional; defaults to true
})
```

## Local docker compose

A typical local setup:

```yaml
# docker-compose.yml
services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio-data:/data
volumes:
  minio-data:
```

```sh
docker compose up -d minio
aws --endpoint-url http://localhost:9000 --no-sign-request s3 mb s3://photos
```

```ts
const storage = new Storage({
  adapter: minio({
    bucket: 'photos',
    endpoint: 'http://localhost:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  }),
});
```

## Escape hatch

```ts
const storage = new Storage({ adapter: minio({ /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```
