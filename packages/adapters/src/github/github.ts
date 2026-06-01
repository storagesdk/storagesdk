import { Octokit } from '@octokit/rest';
import {
  type Adapter,
  type BodyInput,
  bodyToBytes,
  checkSignal,
  type DownloadOptions,
  defineAdapter,
  type ForkInfo,
  type ForkOptions,
  type ListOptions,
  type ListResult,
  type ReadOnlyAdapter,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
  type UrlOptions,
} from '@storagesdk/core/adapter';
import { asStorageError } from './errors.js';

/** Reason a commit is being made. Surfaced to `commitMessage` so callers
 *  can branch on it when building a custom message. */
export type GithubCommitOp = 'upload' | 'delete' | 'copy' | 'move';

/**
 * Adapter config for GitHub. Provider-native shape — no `bucket` field;
 * a repo (`owner`/`repo`) plus a working `branch` is the storage model.
 * Snapshots are tags, forks are branches.
 */
export interface GithubConfig {
  owner: string;
  repo: string;
  /** Working branch. Defaults to the repo's default branch, fetched
   *  lazily on the first operation. */
  branch?: string;
  /** Personal access token / GitHub App token. Falls back to the
   *  `GITHUB_TOKEN` env var. Required for writes and private repos. */
  token?: string;
  /** Override the GitHub REST base URL (GitHub Enterprise). */
  baseUrl?: string;
  /**
   * Compose the commit message for a write op. Defaults to a terse
   * `storagesdk: <op> <path>` line.
   */
  commitMessage?: (op: GithubCommitOp, paths: string[]) => string;
}

export type GithubRaw = Octokit;

const DEFAULT_COMMIT_MESSAGE = (
  op: GithubCommitOp,
  paths: string[]
): string => {
  if (op === 'move' || op === 'copy') {
    return `storagesdk: ${op} ${paths[0]} -> ${paths[1]}`;
  }
  return `storagesdk: ${op} ${paths[0]}`;
};

/**
 * Adapter for a GitHub repository. Snapshots and forks are first-class
 * via git refs: every snapshot is a tag, every fork is a branch. Object
 * ops go through the Contents API (≤ 1 MB per file in v1; larger files
 * surface as `InvalidArgument`).
 *
 * `storage.raw` is the underlying `Octokit` instance — reach for it
 * when you need an API the adapter doesn't surface (releases, PRs,
 * issues, the search API, GraphQL, etc.).
 */
export function github(config: GithubConfig): Adapter<GithubRaw> {
  const token =
    config.token ??
    (typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined);
  const octokit = new Octokit({
    ...(token !== undefined ? { auth: token } : {}),
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    log: {
      debug: noop,
      info: noop,
      warn: noop,
      error: filterOctokitClientErrors,
    },
  });
  return impl(config, octokit, config.branch);
}

const noop = (): void => {};

/** Octokit options bag that threads an `AbortSignal` through every
 *  request — hoisted so each adapter instance reuses the same closure. */
const req = (
  signal: AbortSignal | undefined
): { request: { signal: AbortSignal } } | Record<string, never> =>
  signal ? { request: { signal } } : {};

/** Matches the status code in Octokit's `request-log` plugin error
 *  messages, e.g. `… - 404 with id …`. Pre-compiled once at module load
 *  rather than per `github()` call. */
const OCTOKIT_ERROR_STATUS_RE = / - (\d{3}) with id /;

/** Drops 4xx lines that the adapter induces on purpose (existence
 *  probes, post-write consistency retries, conflict retries) and lets
 *  5xx + anything unparseable through to the real logger. */
const filterOctokitClientErrors = (msg: string): void => {
  const m = OCTOKIT_ERROR_STATUS_RE.exec(msg);
  if (m && Number(m[1]) < 500) return;
  console.error(msg);
};

/** Tag-name prefix that scopes a snapshot to its owning branch and
 *  marks it as SDK-managed. Repo-level release tags (e.g. `v0.1`) are
 *  excluded by the prefix check; snapshots created on one branch don't
 *  leak into another branch's snapshot list. */
const SNAPSHOT_TAG_NAMESPACE = 'storagesdk';

const snapshotTagName = (branch: string, id: string): string =>
  `${SNAPSHOT_TAG_NAMESPACE}/${branch}/${id}`;

const snapshotTagListPrefix = (branch: string): string =>
  `${SNAPSHOT_TAG_NAMESPACE}/${branch}/`;

/** Raw-content host derived from the REST `baseUrl`. Public github.com
 *  uses the dedicated `raw.githubusercontent.com` CDN; GHE serves raw
 *  bytes off the same host as the REST API at `/raw`, so we strip the
 *  `/api/v3` suffix from `baseUrl` and append `/raw`. */
function rawContentHost(baseUrl: string | undefined): string {
  if (baseUrl === undefined) return 'https://raw.githubusercontent.com';
  return `${baseUrl.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '')}/raw`;
}

/** Encode a slash-delimited path per-segment. `encodeURI` leaves `?`,
 *  `#`, `;`, `&` alone because it expects a *URL* not a path component
 *  — so a file named `q?x.txt` would parse as a query string. */
function encodeFilePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Inner factory. Splits adapter construction from credential setup so
 * `snapshots.get` / `forks.get` can rebuild scoped to a different ref
 * (tag or branch) without re-instantiating Octokit.
 */
function impl(
  config: GithubConfig,
  octokit: Octokit,
  initialBranch: string | undefined
): Adapter<GithubRaw> {
  const { owner, repo } = config;
  let cachedBranch: string | undefined = initialBranch;
  const commitMessage = config.commitMessage ?? DEFAULT_COMMIT_MESSAGE;
  const rawBase = rawContentHost(config.baseUrl);

  // GitHub's `listTags` and `listBranches` lag behind ref writes by a
  // few seconds. Track names we just deleted OR just created in this
  // adapter instance so the user-visible state stays consistent with
  // the operations they just ran. Each create observation in `list`
  // clears the matching `createdX` entry to keep memory bounded.
  const deletedSnapshots = new Set<string>();
  const deletedForks = new Set<string>();
  const createdSnapshots = new Set<string>();
  const createdForks = new Set<string>();
  let cachedDefaultBranch: string | undefined;

  /** Resolve the working ref, fetching the default branch if needed. */
  const resolveBranch = async (signal?: AbortSignal): Promise<string> => {
    if (cachedBranch !== undefined) return cachedBranch;
    try {
      const { data } = await octokit.repos.get({
        owner,
        repo,
        ...req(signal),
      });
      cachedBranch = data.default_branch;
      cachedDefaultBranch = data.default_branch;
      return cachedBranch;
    } catch (err) {
      throw asStorageError(err);
    }
  };

  /** The repo's actual default branch — distinct from the adapter's
   *  working branch, which may be a fork. Used by `forks.delete` to
   *  refuse destroying the default branch from a fork-scoped adapter. */
  const resolveDefaultBranch = async (
    signal: AbortSignal | undefined
  ): Promise<string> => {
    if (cachedDefaultBranch !== undefined) return cachedDefaultBranch;
    try {
      const { data } = await octokit.repos.get({
        owner,
        repo,
        ...req(signal),
      });
      cachedDefaultBranch = data.default_branch;
      if (cachedBranch === undefined) cachedBranch = data.default_branch;
      return cachedDefaultBranch;
    } catch (err) {
      throw asStorageError(err);
    }
  };

  /** Fetch the SHA of an existing file at `path` on the working branch,
   *  or `undefined` if it doesn't exist. */
  const getExistingSha = async (
    path: string,
    signal: AbortSignal | undefined
  ): Promise<string | undefined> => {
    const branch = await resolveBranch(signal);
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
        ...req(signal),
      });
      if (Array.isArray(data)) return undefined; // directory, not a file
      return 'sha' in data ? data.sha : undefined;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) return undefined;
      throw asStorageError(err);
    }
  };

  /**
   * Write a file via `createOrUpdateFileContents`, handling the two
   * write-time race conditions GitHub exposes:
   *
   *  - 422 "sha required" — the file already exists; we didn't pass
   *    `sha`. Fetch it and retry.
   *  - 409 "branch HEAD moved" — branch HEAD advanced between our SHA
   *    read and our write. Sleep briefly, re-fetch SHA, retry.
   *
   * Skips the speculative SHA pre-fetch when `knownSha` is undefined —
   * cuts API calls in half for first-time uploads.
   */
  const writeFile = async (
    path: string,
    bytes: Uint8Array<ArrayBuffer>,
    message: string,
    knownSha: string | undefined,
    branch: string,
    signal: AbortSignal | undefined
  ): Promise<{ contentSha: string }> => {
    const content = bufferToBase64(bytes);
    const attempt = async (
      sha: string | undefined
    ): Promise<{ contentSha: string }> => {
      const { data } = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        branch,
        message,
        content,
        ...(sha !== undefined ? { sha } : {}),
        ...req(signal),
      });
      return { contentSha: data.content?.sha ?? '' };
    };
    let sha = knownSha;
    let did422 = false;
    let did409 = false;
    // Each recovery (re-fetch SHA on 422, sleep-and-re-fetch on 409)
    // fires at most once. Any 422 → 409 or 409 → 422 ordering eventually
    // resolves; anything past that surfaces normally.
    while (true) {
      try {
        return await attempt(sha);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 422 && sha === undefined && !did422) {
          sha = await getExistingSha(path, signal);
          did422 = true;
          continue;
        }
        if (status === 409 && !did409) {
          await sleep(750);
          sha = await getExistingSha(path, signal);
          did409 = true;
          continue;
        }
        throw err;
      }
    }
  };

  /** Most recent commit date for `path` on `ref`. Parallel-callable to
   *  the main fetch so the round-trip cost is hidden under it.
   *
   *  `commitRef` must be a form `listCommits` accepts — bare branch
   *  name, bare tag name, or commit SHA. The `tags/<id>` prefix used by
   *  Contents is silently rejected here. */
  const getPathMtime = async (
    path: string,
    commitRef: string,
    signal: AbortSignal | undefined
  ): Promise<Date> => {
    try {
      const { data } = await octokit.repos.listCommits({
        owner,
        repo,
        path,
        sha: commitRef,
        per_page: 1,
        ...req(signal),
      });
      const date =
        data[0]?.commit?.committer?.date ?? data[0]?.commit?.author?.date;
      return date ? new Date(date) : new Date(0);
    } catch {
      return new Date(0);
    }
  };

  /** Poll the Contents API until `path` reads back with the expected
   *  SHA (or budget is spent). Used after `upload` so the SDK's
   *  "subsequent reads return the just-written bytes" contract holds
   *  despite GitHub's read-replica lag — without this, an immediate
   *  `download` can briefly serve the pre-write blob. */
  const waitForWrite = async (
    path: string,
    branch: string,
    expectedSha: string,
    signal: AbortSignal | undefined
  ): Promise<void> => {
    if (expectedSha === '') return; // nothing to compare against
    const backoffsMs = [200, 400, 800, 1200];
    for (const delay of backoffsMs) {
      try {
        const { data } = await octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
          ...req(signal),
        });
        if (!Array.isArray(data) && 'sha' in data && data.sha === expectedSha) {
          return;
        }
      } catch {
        // Transient 404 / 5xx during the lag window — keep polling.
      }
      await sleep(delay);
    }
  };

  /** Poll the Contents API until `path` reads as 404 (or budget is
   *  spent). Used after `delete` so the SDK's "subsequent reads are
   *  NotFound" contract holds despite GitHub's read-replica lag. */
  const waitForGone = async (
    path: string,
    branch: string,
    signal: AbortSignal | undefined
  ): Promise<void> => {
    const backoffsMs = [200, 400, 800, 1200, 1800];
    for (const delay of backoffsMs) {
      try {
        await octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
          ...req(signal),
        });
      } catch (err) {
        if ((err as { status?: number }).status === 404) return;
        // Any other error means we can't confirm — give up rather than
        // turn delete into a hang.
        return;
      }
      await sleep(delay);
    }
  };

  /** GitHub's Contents API can return a stale 404 for a few hundred ms
   *  after a write. Retry once with a short backoff before surfacing
   *  NotFound. Anything other than 404 throws immediately. */
  const getContentWithRetry = async (
    params: { path: string; ref: string },
    signal: AbortSignal | undefined
  ): Promise<Awaited<ReturnType<typeof octokit.repos.getContent>>> => {
    try {
      return await octokit.repos.getContent({
        owner,
        repo,
        path: params.path,
        ref: params.ref,
        ...req(signal),
      });
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
      await sleep(750);
      return await octokit.repos.getContent({
        owner,
        repo,
        path: params.path,
        ref: params.ref,
        ...req(signal),
      });
    }
  };

  async function downloadAt(
    path: string,
    ref: string,
    opts: DownloadOptions | undefined,
    signal: AbortSignal | undefined
  ): Promise<StorageItem> {
    try {
      const [contentRes, mtime] = await Promise.all([
        getContentWithRetry({ path, ref }, signal),
        getPathMtime(path, toCommitRef(ref), signal),
      ]);
      const data = contentRes.data;
      if (Array.isArray(data) || !('content' in data) || data.type !== 'file') {
        throw new StorageError({
          code: 'NotFound',
          message: `github adapter: ${path} is not a file`,
        });
      }
      // Contents API omits inline `content` (sends `encoding: 'none'` +
      // a `download_url`) for blobs over 1 MB. Mirror the upload-side
      // cap rather than silently returning empty bytes.
      if (data.encoding !== 'base64') {
        throw new StorageError({
          code: 'InvalidArgument',
          message: `github adapter: ${path} is larger than 1 MB (${data.size} bytes) and cannot be read via the Contents API. Use storage.raw for the Git Data API.`,
        });
      }
      let body = base64ToBytes(data.content);
      if (opts?.range) {
        const { offset, length } = opts.range;
        body = sliceBytes(body, offset, offset + length);
      }
      return {
        path,
        size: body.byteLength,
        contentType: 'application/octet-stream',
        etag: data.sha,
        lastModified: mtime,
        body,
      };
    } catch (err) {
      throw asStorageError(err);
    }
  }

  async function headAt(
    path: string,
    ref: string,
    signal: AbortSignal | undefined
  ): Promise<StorageItemMeta> {
    try {
      const [contentRes, mtime] = await Promise.all([
        getContentWithRetry({ path, ref }, signal),
        getPathMtime(path, toCommitRef(ref), signal),
      ]);
      const data = contentRes.data;
      if (Array.isArray(data) || data.type !== 'file') {
        throw new StorageError({
          code: 'NotFound',
          message: `github adapter: ${path} is not a file`,
        });
      }
      return {
        path,
        size: data.size,
        contentType: 'application/octet-stream',
        etag: data.sha,
        lastModified: mtime,
      };
    } catch (err) {
      throw asStorageError(err);
    }
  }

  async function listAt(
    ref: string,
    opts: ListOptions,
    signal: AbortSignal | undefined
  ): Promise<ListResult> {
    const recursive = !opts.delimiter;
    try {
      // `git/trees/{ref}` auto-resolves a branch / tag / commit name
      // to its tree — one round-trip instead of getRef → getCommit →
      // getTree.
      const { data: tree } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: refAsApiRef(ref),
        ...(recursive ? { recursive: '1' } : {}),
        ...req(signal),
      });
      // The git/trees endpoint caps at ~100k entries / 7 MB. A partial
      // response is worse than no response — callers act on it as if it
      // were complete.
      if (tree.truncated) {
        throw new StorageError({
          code: 'InvalidArgument',
          message: `github adapter: tree at ref '${ref}' is too large to list in one call. Use storage.raw with the Git Data API to walk subtrees.`,
        });
      }
      let items = tree.tree
        .filter((node) => node.type === 'blob' && node.path !== undefined)
        .map<StorageItemMeta>((node) => ({
          path: node.path as string,
          size: node.size ?? 0,
          contentType: 'application/octet-stream',
          etag: node.sha ?? '',
          lastModified: new Date(0),
        }));
      if (opts.prefix) {
        const p = opts.prefix;
        items = items.filter((it) => it.path.startsWith(p));
      }
      // Manual cursor pagination — GitHub returns the whole tree in one
      // call; we slice client-side.
      const offset = opts.cursor !== undefined ? Number(opts.cursor) : 0;
      const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
      const limit = opts.limit ?? items.length;
      const page = items.slice(start, start + limit);
      const nextOffset = start + page.length;
      return {
        items: page,
        ...(nextOffset < items.length ? { cursor: String(nextOffset) } : {}),
      };
    } catch (err) {
      throw asStorageError(err);
    }
  }

  /** Copy a blob from `from` to `to` on `branch`. Extracted from the
   *  `copy` adapter method so `move` can call it directly without
   *  relying on `this` binding inside the `defineAdapter` literal. */
  const copyAt = async (
    from: string,
    to: string,
    branch: string,
    signal: AbortSignal | undefined,
    message: string
  ): Promise<void> => {
    const item = await downloadAt(from, branch, {}, signal);
    let contentSha: string;
    try {
      const res = await writeFile(
        to,
        item.body,
        message,
        undefined,
        branch,
        signal
      );
      contentSha = res.contentSha;
    } catch (err) {
      throw asStorageError(err);
    }
    await waitForWrite(to, branch, contentSha, signal);
  };

  /** Delete a blob from `branch`, swallowing missing-key as a no-op,
   *  retrying through GitHub's 409 + stale-404 race windows, and waiting
   *  for the Contents read replica to reflect the delete. Extracted so
   *  `move` can call it without `this` binding. */
  const deleteAt = async (
    path: string,
    branch: string,
    signal: AbortSignal | undefined,
    message: string
  ): Promise<void> => {
    let existingSha = await getExistingSha(path, signal);
    if (existingSha === undefined) {
      // Match S3 / fs semantics: deleting a missing key is a no-op.
      return;
    }
    const attempt = (sha: string) =>
      octokit.repos.deleteFile({
        owner,
        repo,
        path,
        branch,
        message,
        sha,
        ...req(signal),
      });
    try {
      await attempt(existingSha);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 409) throw asStorageError(err);
      // Branch HEAD moved between SHA read and delete. Re-read and retry.
      // The Contents API can briefly return a stale 404 right after a
      // write to the same path; double-probe before treating "gone" as
      // success, matching the read-side retry in `getContentWithRetry`.
      await sleep(750);
      existingSha = await getExistingSha(path, signal);
      if (existingSha === undefined) {
        await sleep(750);
        existingSha = await getExistingSha(path, signal);
        if (existingSha === undefined) return;
      }
      try {
        await attempt(existingSha);
      } catch (err2) {
        throw asStorageError(err2);
      }
    }
    // The Contents API serves reads from a separate replica that lags
    // the write API by a few hundred ms — a `head`/`download` right
    // after this returns can otherwise see the just-deleted blob. Poll
    // until reads agree the path is gone so the SDK contract
    // (`delete` ⇒ subsequent reads are `NotFound`) holds on GitHub.
    await waitForGone(path, branch, signal);
  };

  async function deriveFromSnapshot(
    forkBranch: string,
    signal: AbortSignal | undefined
  ): Promise<string | undefined> {
    const liveBranch = await resolveBranch(signal);
    try {
      const { data } = await octokit.repos.compareCommits({
        owner,
        repo,
        base: liveBranch,
        head: forkBranch,
        per_page: 1,
        ...req(signal),
      });
      const baseSha = data.merge_base_commit.sha;
      const prefix = snapshotTagListPrefix(liveBranch);
      // Walk tag pages until we hit a SHA match on a tag in the live
      // branch's snapshot namespace — repos with hundreds of tags
      // shouldn't require loading them all into memory just to map one
      // base commit back to its name. Tags outside our prefix are
      // release tags / user tags and are correctly ignored.
      const iterator = octokit.paginate.iterator(octokit.repos.listTags, {
        owner,
        repo,
        per_page: 100,
        ...req(signal),
      });
      for await (const { data: tags } of iterator) {
        const tag = tags.find(
          (t) => t.commit.sha === baseSha && t.name.startsWith(prefix)
        );
        if (tag) return tag.name.slice(prefix.length);
      }
      return undefined;
    } catch {
      // Best-effort — surfacing undefined matches "the fork has no
      // known source snapshot".
      return undefined;
    }
  }

  function snapshotReader(snapshotId: string): ReadOnlyAdapter {
    const refFor = async (signal: AbortSignal | undefined): Promise<string> => {
      const branch = await resolveBranch(signal);
      return `tags/${snapshotTagName(branch, snapshotId)}`;
    };
    return {
      async download(path, opts): Promise<StorageItem> {
        checkSignal(opts?.signal);
        return downloadAt(path, await refFor(opts?.signal), opts, opts?.signal);
      },
      async head(path, opts): Promise<StorageItemMeta> {
        checkSignal(opts?.signal);
        return headAt(path, await refFor(opts?.signal), opts?.signal);
      },
      async list(opts): Promise<ListResult> {
        checkSignal(opts?.signal);
        return listAt(await refFor(opts?.signal), opts ?? {}, opts?.signal);
      },
      async url(path, opts): Promise<string> {
        checkSignal(opts?.signal);
        const branch = await resolveBranch(opts?.signal);
        // Tag names contain slashes, so we need the explicit `refs/tags/`
        // form — bare tag name in the path would be parsed as a directory.
        return `${rawBase}/${owner}/${repo}/refs/tags/${snapshotTagName(branch, snapshotId)}/${encodeFilePath(path)}`;
      },
    };
  }

  return defineAdapter<GithubRaw>({
    name: 'github',
    raw: octokit,

    async upload(
      path: string,
      body: BodyInput,
      opts?: UploadOptions
    ): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      const bytes = ensureArrayBufferBacked(await bodyToBytes(body));
      if (bytes.byteLength > 1024 * 1024) {
        throw new StorageError({
          code: 'InvalidArgument',
          message: `github adapter: files larger than 1 MB are not supported via the Contents API (got ${bytes.byteLength} bytes). Use storage.raw for the Git Data API.`,
        });
      }
      try {
        const { contentSha } = await writeFile(
          path,
          bytes,
          commitMessage('upload', [path]),
          undefined,
          branch,
          opts?.signal
        );
        await waitForWrite(path, branch, contentSha, opts?.signal);
        // Intentionally omit `metadata` from the response: git stores
        // file content + path, not arbitrary metadata, and `head` /
        // `download` will never surface it again.
        return {
          path,
          size: bytes.byteLength,
          contentType: opts?.contentType ?? 'application/octet-stream',
          etag: contentSha,
          lastModified: new Date(),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async download(path, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      return downloadAt(path, branch, opts, opts?.signal);
    },

    async head(path, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      return headAt(path, branch, opts?.signal);
    },

    async list(opts): Promise<ListResult> {
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      return listAt(branch, opts ?? {}, opts?.signal);
    },

    async delete(path, opts): Promise<void> {
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      await deleteAt(
        path,
        branch,
        opts?.signal,
        commitMessage('delete', [path])
      );
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      await copyAt(
        from,
        to,
        branch,
        opts?.signal,
        commitMessage('copy', [from, to])
      );
    },

    async move(from, to, opts): Promise<void> {
      // copy + delete. Not atomic — failure mid-way may leave both keys
      // present. Matches the documented contract. Calls the closure
      // helpers directly rather than `this.copy` / `this.delete` so the
      // method works regardless of how the adapter is invoked.
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      const message = commitMessage('move', [from, to]);
      await copyAt(from, to, branch, opts?.signal, message);
      await deleteAt(from, branch, opts?.signal, message);
    },

    async url(path, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      const branch = await resolveBranch(opts?.signal);
      // Explicit `refs/heads/` disambiguates branch names that contain
      // `/` (e.g. `feature/foo`); the parser is greedy on the ref form.
      return `${rawBase}/${owner}/${repo}/refs/heads/${branch}/${encodeFilePath(path)}`;
    },

    async uploadUrl(): Promise<never> {
      throw new StorageError({
        code: 'NotSupported',
        message:
          'github adapter: uploadUrl is not supported (GitHub has no presigned upload URL).',
      });
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const branch = await resolveBranch(opts?.signal);
        const name = opts?.name ?? generateSnapshotName();
        let headSha: string;
        try {
          const { data } = await octokit.git.getRef({
            owner,
            repo,
            ref: `heads/${branch}`,
            ...req(opts?.signal),
          });
          headSha = data.object.sha;
        } catch (err) {
          throw asStorageError(err);
        }
        const tagName = snapshotTagName(branch, name);
        try {
          await octokit.git.createRef({
            owner,
            repo,
            ref: `refs/tags/${tagName}`,
            sha: headSha,
            ...req(opts?.signal),
          });
        } catch (err) {
          throw asStorageError(err);
        }
        // Recreating a name we just deleted must not stay hidden by the
        // delete-lag filter; mirror the create side so `list` shows it
        // before `listTags` catches up.
        deletedSnapshots.delete(name);
        createdSnapshots.add(name);
        return { id: name, name, createdAt: new Date() };
      },

      async list(): Promise<SnapshotInfo[]> {
        try {
          const branch = await resolveBranch();
          const prefix = snapshotTagListPrefix(branch);
          const data = await octokit.paginate(octokit.repos.listTags, {
            owner,
            repo,
            per_page: 100,
          });
          // Listing tags doesn't include creation time cheaply; surface
          // epoch and let callers fetch the tagged commit if needed.
          const apiIds = data
            .filter((t) => t.name.startsWith(prefix))
            .map((t) => t.name.slice(prefix.length));
          // Drop create-tracking for anything the API now confirms —
          // keeps the set bounded over the adapter's lifetime.
          for (const id of apiIds) createdSnapshots.delete(id);
          const seen = new Set(apiIds);
          const merged = [
            ...apiIds,
            ...[...createdSnapshots].filter((id) => !seen.has(id)),
          ];
          return merged
            .filter((id) => !deletedSnapshots.has(id))
            .map((id) => ({ id, name: id, createdAt: new Date(0) }));
        } catch (err) {
          throw asStorageError(err);
        }
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        if (deletedSnapshots.has(id)) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} was deleted from this storage instance`,
          });
        }
        const branch = await resolveBranch(opts?.signal);
        try {
          await octokit.git.getRef({
            owner,
            repo,
            ref: `tags/${snapshotTagName(branch, id)}`,
            ...req(opts?.signal),
          });
        } catch (err) {
          // Mirror the `list` symmetry: if we just created this id and
          // GitHub's ref API hasn't caught up, treat it as existing.
          if (
            (err as { status?: number }).status === 404 &&
            createdSnapshots.has(id)
          ) {
            return { id, name: id, createdAt: new Date(0) };
          }
          throw asStorageError(err);
        }
        return { id, name: id, createdAt: new Date(0) };
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        const branch = await resolveBranch(opts?.signal);
        try {
          await octokit.git.deleteRef({
            owner,
            repo,
            ref: `tags/${snapshotTagName(branch, id)}`,
            ...req(opts?.signal),
          });
        } catch (err) {
          // Match `delete(path)` / fs / s3: removing a missing snapshot
          // is a no-op, not an error.
          if ((err as { status?: number }).status !== 404) {
            throw asStorageError(err);
          }
        }
        deletedSnapshots.add(id);
        createdSnapshots.delete(id);
      },

      get(id): ReadOnlyAdapter {
        if (deletedSnapshots.has(id)) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} was deleted from this storage instance`,
          });
        }
        return snapshotReader(id);
      },
    },

    forks: {
      async create(opts: ForkOptions): Promise<ForkInfo> {
        checkSignal(opts.signal);
        const branch = await resolveBranch(opts.signal);
        const seedRef = opts.fromSnapshot
          ? `tags/${snapshotTagName(branch, opts.fromSnapshot)}`
          : `heads/${branch}`;
        let seedSha: string;
        try {
          const { data } = await octokit.git.getRef({
            owner,
            repo,
            ref: seedRef,
            ...req(opts.signal),
          });
          seedSha = data.object.sha;
        } catch (err) {
          throw asStorageError(err);
        }
        try {
          await octokit.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${opts.name}`,
            sha: seedSha,
            ...req(opts.signal),
          });
        } catch (err) {
          throw asStorageError(err);
        }
        deletedForks.delete(opts.name);
        createdForks.add(opts.name);
        return {
          name: opts.name,
          createdAt: new Date(),
          ...(opts.fromSnapshot !== undefined
            ? { fromSnapshot: opts.fromSnapshot }
            : {}),
        };
      },

      async list(): Promise<ForkInfo[]> {
        const liveBranch = await resolveBranch();
        try {
          const data = await octokit.paginate(octokit.repos.listBranches, {
            owner,
            repo,
            per_page: 100,
          });
          const apiNames = data
            .filter((b) => b.name !== liveBranch)
            .map((b) => b.name);
          for (const name of apiNames) createdForks.delete(name);
          const seen = new Set(apiNames);
          const merged = [
            ...apiNames,
            ...[...createdForks].filter(
              (name) => !seen.has(name) && name !== liveBranch
            ),
          ];
          return merged
            .filter((name) => !deletedForks.has(name))
            .map((name) => ({ name, createdAt: new Date(0) }));
        } catch (err) {
          throw asStorageError(err);
        }
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        if (deletedForks.has(name)) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} was deleted from this storage instance`,
          });
        }
        const liveBranch = await resolveBranch(opts?.signal);
        if (name === liveBranch) {
          // The working branch is not a fork from this adapter's view —
          // mirror what `list` excludes.
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found (working branch, not a fork)`,
          });
        }
        try {
          await octokit.git.getRef({
            owner,
            repo,
            ref: `heads/${name}`,
            ...req(opts?.signal),
          });
        } catch (err) {
          // Mirror the `list` symmetry: if we just created this fork
          // and GitHub's ref API hasn't caught up, treat it as existing.
          // `fromSnapshot` is unknown to us during this lag window, so
          // we omit it rather than fabricate one — same shape as a fork
          // created without `fromSnapshot`.
          if (
            (err as { status?: number }).status === 404 &&
            createdForks.has(name)
          ) {
            return { name, createdAt: new Date(0) };
          }
          throw asStorageError(err);
        }
        // Derive `fromSnapshot` natively: the branch's divergence point
        // from the live branch IS the commit it was forked from. If any
        // SDK snapshot tag points at that commit, treat the tag's name
        // as the snapshot id. Two extra API calls — `forks.list` skips
        // this to keep enumeration cheap.
        //
        // Known v1 false positives (git's data model has no way to fix
        // these without out-of-band metadata, which the SDK avoids):
        //
        //  - Fork created from live HEAD (no `fromSnapshot`) but a tag
        //    happens to point at that same commit — surfaces the tag.
        //  - Multiple snapshots pointing at the same commit — the
        //    walker returns the first match in `listTags` order, which
        //    may not be the id passed to `forks.create`.
        //
        // For an authoritative round-trip use the `fromSnapshot` echo
        // from `forks.create` directly rather than re-fetching via
        // `forks.head`.
        const fromSnapshot = await deriveFromSnapshot(name, opts?.signal);
        return {
          name,
          createdAt: new Date(0),
          ...(fromSnapshot !== undefined ? { fromSnapshot } : {}),
        };
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        const liveBranch = await resolveBranch(opts?.signal);
        const defaultBranch = await resolveDefaultBranch(opts?.signal);
        if (name === liveBranch || name === defaultBranch) {
          // Refuse to nuke the working branch (mirrors `list` semantics)
          // or the repo's default branch (almost always protected and
          // certainly never something a `forks.delete` caller intends).
          throw new StorageError({
            code: 'InvalidArgument',
            message: `cannot delete branch ${name} via forks.delete — it is ${
              name === defaultBranch
                ? 'the repo default branch'
                : 'the working branch'
            }`,
          });
        }
        try {
          await octokit.git.deleteRef({
            owner,
            repo,
            ref: `heads/${name}`,
            ...req(opts?.signal),
          });
        } catch (err) {
          // Idempotent on missing — match the object / snapshot delete
          // contract.
          if ((err as { status?: number }).status !== 404) {
            throw asStorageError(err);
          }
        }
        deletedForks.add(name);
        createdForks.delete(name);
      },

      get(name): Adapter<GithubRaw> {
        if (deletedForks.has(name)) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} was deleted from this storage instance`,
          });
        }
        // Synchronous — can only compare against an already-resolved
        // working branch. If `config.branch` was omitted and no async
        // op has run yet, `cachedBranch` is undefined and this guard
        // misses, so `forks.get(<defaultBranchName>)` returns an
        // adapter scoped to that branch. That adapter behaves
        // identically to one constructed by passing `branch:
        // <defaultBranchName>` directly — same uploads, same lists,
        // same `forks.delete` protection — so the lapse is a UX
        // inconsistency (the call throws once `cachedBranch` is later
        // resolved) rather than a safety risk. Pre-warming the branch
        // would force an API call on every adapter construction, which
        // the documented lazy-resolution contract avoids.
        if (cachedBranch !== undefined && name === cachedBranch) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found (working branch, not a fork)`,
          });
        }
        return impl(config, octokit, name);
      },
    },
  });
}

function refAsApiRef(branchOrTag: string): string {
  return branchOrTag.startsWith('tags/') || branchOrTag.startsWith('heads/')
    ? branchOrTag
    : `heads/${branchOrTag}`;
}

/** `listCommits` `sha` expects a bare branch, tag, or commit SHA — not
 *  the `tags/<id>` / `heads/<id>` prefixed form that Contents accepts. */
function toCommitRef(ref: string): string {
  if (ref.startsWith('tags/')) return ref.slice('tags/'.length);
  if (ref.startsWith('heads/')) return ref.slice('heads/'.length);
  return ref;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateSnapshotName(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `storagesdk-snap-${stamp}-${rand}`;
}

/**
 * `bodyToBytes` returns `Uint8Array<ArrayBufferLike>` (covering the
 * SharedArrayBuffer case). `StorageItem.body` requires the strict
 * `Uint8Array<ArrayBuffer>`. Copy into a fresh ArrayBuffer when we get
 * the looser shape so the return type satisfies the contract.
 */
function ensureArrayBufferBacked(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  if (u8.buffer instanceof ArrayBuffer) {
    return u8 as Uint8Array<ArrayBuffer>;
  }
  const out = new Uint8Array(new ArrayBuffer(u8.byteLength));
  out.set(u8);
  return out;
}

function sliceBytes(
  u8: Uint8Array<ArrayBuffer>,
  start: number,
  end: number
): Uint8Array<ArrayBuffer> {
  const len = Math.max(0, Math.min(end, u8.byteLength) - start);
  const out = new Uint8Array(new ArrayBuffer(len));
  out.set(u8.subarray(start, start + len));
  return out;
}

function bufferToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    const out = new Uint8Array(new ArrayBuffer(buf.byteLength));
    out.set(buf);
    return out;
  }
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
