import { createHash, type Hash } from 'node:crypto';

/** The store's content hash. Blobs live at `data/<hh>/<rest>` of its hex. */
export function newContentHash(): Hash {
  return createHash('blake2b512');
}
