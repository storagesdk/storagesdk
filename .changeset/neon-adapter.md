---
"@storagesdk/adapters": minor
---

Add Neon Object Storage adapter

Introduces `@storagesdk/adapters/neon`, an S3-compatible adapter for Neon Object Storage. The S3 adapter now accepts an optional `requestChecksumCalculation` config option, which Neon sets to `'WHEN_REQUIRED'` to keep presigned PUT URLs usable with AWS SDK checksum defaults.
