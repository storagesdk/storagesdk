---
"@storagesdk/adapters": minor
---

New `fs-cas` adapter: a content-addressed filesystem backend. Blobs are
stored once under `data/` keyed by their BLAKE2b-512 hash, so identical
content is deduplicated and snapshots, forks, `copy`, and `move` touch
metadata only. Deleting a key reclaims its blob once nothing else
references it. Import via `@storagesdk/adapters/fs-cas`.
