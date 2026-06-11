import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Storage } from '@storagesdk/core';
import type { z } from 'zod';
import pkg from '../../package.json' with { type: 'json' };
import { normalizeScope } from '../scope.js';
import { selectTools } from '../tools/index.js';
import type { ToolContext, ToolsOptions } from '../types.js';

const DEFAULT_MAX_INLINE_BYTES = 256 * 1024;
const DEFAULT_URL_EXPIRES_IN = 600;
const SERVER_NAME = '@storagesdk/mcp';

/**
 * Build a Model Context Protocol server that exposes the storagesdk tool
 * roster. The caller owns the transport — connect it to
 * `StdioServerTransport` for shell consumption (this is what
 * `@storagesdk/cli`'s `mcp` command does) or to any other MCP transport
 * for long-running servers.
 *
 * ```ts
 * import { createMcpServer } from '@storagesdk/ai/mcp';
 * import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
 *
 * const server = createMcpServer(storage, { readOnly: false });
 * await server.connect(new StdioServerTransport());
 * ```
 *
 * The returned object is the SDK's `McpServer` — `connect()`, `close()`,
 * and the underlying `.server` are all available for consumers that need
 * lower-level access.
 */
export function createMcpServer(
  storage: Storage,
  opts?: Partial<ToolsOptions>
): McpServer {
  const options: ToolsOptions = {
    readOnly: opts?.readOnly ?? false,
    scope: normalizeScope(opts?.scope),
    maxInlineBytes: opts?.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
    urlExpiresIn: opts?.urlExpiresIn ?? DEFAULT_URL_EXPIRES_IN,
    ...(opts?.signal ? { signal: opts.signal } : {}),
  };
  const ctx: ToolContext = { storage, options };

  const server = new McpServer({
    name: SERVER_NAME,
    version: pkg.version,
  });

  for (const def of selectTools(options)) {
    // Every tool's `inputSchema` is a `z.object({...})` — pull the raw
    // shape for `registerTool`, which wants `ZodRawShape`. The MCP SDK
    // converts that to JSON Schema for `tools/list` internally.
    const shape = (def.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: shape },
      async (input: unknown) => {
        try {
          const result = await def.execute(input, ctx);
          return {
            content: [
              {
                type: 'text',
                text:
                  typeof result === 'string' ? result : JSON.stringify(result),
              },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: err instanceof Error ? err.message : String(err),
              },
            ],
          };
        }
      }
    );
  }

  return server;
}
