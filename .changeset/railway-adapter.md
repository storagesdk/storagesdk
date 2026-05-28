---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/railway` — branded alias of the Tigris adapter for [Railway Buckets](https://docs.railway.com/storage-buckets). Same `Adapter<TigrisRaw>` contract, same snapshot/fork semantics; the alias exists so Railway users can import a name that matches their platform.

```ts
import { railway } from '@storagesdk/adapters/railway';
const storage = new Storage({
  adapter: railway({ bucket, accessKeyId, secretAccessKey, endpoint }),
});
```
