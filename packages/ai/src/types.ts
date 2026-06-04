import type { Storage } from '@storagesdk/core';
import type { z } from 'zod';

export type ToolAccess = 'read' | 'write';

/**
 * Canonical, resolved form of the tools options. Callers pass
 * `Partial<ToolsOptions>` to the factory; the factory fills in
 * defaults so every handler reads a populated value.
 */
export interface ToolsOptions {
  /**
   * Expose only read tools. Use when the agent should browse but not
   * mutate. Strips `upload`, `delete`, `copy`, `move`, `upload_url`,
   * and every snapshot/fork mutator. Default `false`.
   */
  readOnly: boolean;

  /**
   * Restrict every path argument to live under this prefix. Belt-and-
   * suspenders so a misbehaving model can't escape its intended
   * subtree. Strict-mode: paths outside the prefix throw `StorageError`
   * with code `InvalidArgument`. The model sees full prefixed paths.
   * Empty string disables.
   */
  scope: string;

  /**
   * Cap on inline text returned from `download`. Files larger than
   * this (or with a non-text content type) come back as a presigned
   * URL the agent can hand to another tool. Default 256 KB.
   */
  maxInlineBytes: number;

  /**
   * TTL (seconds) for presigned URLs surfaced to the agent.
   * Default 600 (10 minutes).
   */
  urlExpiresIn: number;

  /**
   * Plumbed through to every storage operation. Cancelling aborts
   * in-flight reads/writes via `StorageError({ code: 'Aborted' })`.
   * Stays optional even after resolution — absence is its meaningful
   * default.
   */
  signal?: AbortSignal;
}

export interface ToolContext {
  readonly storage: Storage;
  readonly options: ToolsOptions;
}

/**
 * Framework-agnostic tool definition. Each per-tool input type is
 * carried by `inputSchema`; the registry collapses to a uniform
 * `ToolDef` so heterogeneous tools can live in one list.
 */
export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  readonly access: ToolAccess;
  execute(input: unknown, ctx: ToolContext): Promise<unknown>;
}
