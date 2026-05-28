---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/fly` — branded alias of the Tigris adapter for Fly.io's managed Tigris buckets. Same `Adapter<TigrisRaw>` contract, same snapshot/fork semantics; the alias exists so Fly users can import a name that matches their platform.

```ts
import { fly } from '@storagesdk/adapters/fly';
const storage = new Storage({
  adapter: fly({ bucket, accessKeyId, secretAccessKey, endpoint }),
});
```
