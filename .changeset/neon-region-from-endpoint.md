---
'@storagesdk/adapters': patch
---

Neon adapter: read the region from the branch endpoint hostname when `region` is omitted, instead of always defaulting to `us-east-2`. Neon Object Storage now runs in `us-east-2`, `us-east-1`, `eu-central-1`, and `ap-southeast-1`.
