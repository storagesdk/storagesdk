import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '@storagesdk/ai/mcp';
import { defineCommand } from 'citty';
import { resolveBaseStorage } from '../adapter.js';
import { handleStorageError } from '../errors.js';
import { parsePositiveInt } from '../validate.js';

export const mcpCommand = defineCommand({
  meta: {
    name: 'mcp',
    description:
      'Boot a stdio Model Context Protocol server that exposes the storagesdk tool roster. Stdin / stdout carry the MCP JSON-RPC protocol — do not run interactively.',
  },
  args: {
    adapter: {
      type: 'string',
      description: 'Adapter name. Falls back to STORAGE_ADAPTER env var.',
    },
    'read-only': {
      type: 'boolean',
      description:
        'Strip every mutating tool (upload, delete, copy, move, snapshot create, fork create, etc.). Use when the agent should browse but not write.',
    },
    scope: {
      type: 'string',
      description:
        'Restrict every path argument to this prefix. Paths outside the prefix surface as InvalidArgument errors to the agent.',
    },
    'url-expires-in': {
      type: 'string',
      description:
        'Lifetime (seconds) of presigned URLs the server surfaces to the agent. Default 600.',
    },
    'max-inline-bytes': {
      type: 'string',
      description:
        'Inline-text cap for `download` responses. Larger objects come back as a presigned URL the agent can hand to another tool. Default 262144 (256 KB).',
    },
  },
  async run({ args }) {
    const urlExpiresIn = parsePositiveInt(
      args['url-expires-in'],
      '--url-expires-in'
    );
    const maxInlineBytes = parsePositiveInt(
      args['max-inline-bytes'],
      '--max-inline-bytes'
    );
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const server = createMcpServer(storage, {
        readOnly: args['read-only'] ?? false,
        ...(args.scope !== undefined ? { scope: args.scope } : {}),
        ...(urlExpiresIn !== undefined ? { urlExpiresIn } : {}),
        ...(maxInlineBytes !== undefined ? { maxInlineBytes } : {}),
      });
      const transport = new StdioServerTransport();
      // Wire close detection *before* `connect()` runs. The SDK's
      // transport.onclose handler fires this server's `onclose`
      // callback, so setting it now means we catch the close even if
      // EOF arrives during `connect()`. Wiring this after `connect()`
      // (or via `process.stdin.once('end', …)`) is racy: events that
      // fired before our listener was attached don't replay.
      const closed = new Promise<void>((resolve) => {
        server.server.onclose = () => resolve();
      });
      await server.connect(transport);
      // Readiness goes to stderr only after a successful connect, so
      // hosts and operators don't see a "ready" line for a server
      // that never joined the JSON-RPC session. Stdout is reserved
      // for the protocol — never log there.
      process.stderr.write(
        `storagesdk MCP server ready (${args['read-only'] ? 'read-only' : 'read-write'}${
          args.scope ? `, scope=${args.scope}` : ''
        })\n`
      );
      await closed;
      await server.close();
    } catch (e) {
      handleStorageError(e);
    }
  },
});
