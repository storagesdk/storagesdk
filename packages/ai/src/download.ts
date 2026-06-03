import type { ReadOnlyStorage, StorageItemMeta } from '@storagesdk/core';

export type DownloadResult =
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly meta: StorageItemMeta;
    }
  | {
      readonly kind: 'url';
      readonly url: string;
      readonly size: number;
      readonly contentType: string;
      readonly etag: string;
      readonly reason: 'binary' | 'too-large';
      /**
       * Echoed back when the caller requested a byte range and the
       * fallback URL was returned for the full object. Fetch the URL
       * with `Range: bytes=<offset>-<offset+length-1>` to honor the
       * original slice.
       */
      readonly range?: { offset: number; length: number };
    };

export interface DownloadDecideOptions {
  readonly maxInlineBytes: number;
  readonly urlExpiresIn: number;
  readonly range?: { offset: number; length: number };
  readonly signal?: AbortSignal;
}

/**
 * Resolve a download request to either inline text (small text content)
 * or a presigned URL (binary, large, or `url` is the safer carrier).
 * Peeks at metadata first via `head` so we never pull a multi-MB body
 * just to discover we should have returned a URL.
 */
export async function downloadDecide(
  reader: ReadOnlyStorage,
  path: string,
  opts: DownloadDecideOptions
): Promise<DownloadResult> {
  const meta = await reader.head(
    path,
    opts.signal ? { signal: opts.signal } : undefined
  );

  const sliceLength = opts.range?.length;
  const effectiveSize = sliceLength ?? meta.size;
  const tooLarge = effectiveSize > opts.maxInlineBytes;
  const isText = isTextContentType(meta.contentType);

  if (!isText || tooLarge) {
    const url = await reader.url(path, {
      expiresIn: opts.urlExpiresIn,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    return {
      kind: 'url',
      url,
      size: meta.size,
      contentType: meta.contentType,
      etag: meta.etag,
      reason: tooLarge ? 'too-large' : 'binary',
      ...(opts.range ? { range: opts.range } : {}),
    };
  }

  const text = await reader.download(path, {
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.range ? { range: opts.range } : {}),
    as: 'text',
  });
  return { kind: 'text', text, meta };
}

function isTextContentType(contentType: string): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  if (lower.startsWith('text/')) return true;
  if (lower.startsWith('application/json')) return true;
  if (lower.startsWith('application/xml')) return true;
  if (lower.startsWith('application/yaml')) return true;
  if (lower.startsWith('application/x-yaml')) return true;
  if (lower.startsWith('application/javascript')) return true;
  if (lower.startsWith('application/typescript')) return true;
  return false;
}
