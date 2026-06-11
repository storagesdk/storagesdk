---
'@storagesdk/cli': minor
---

Add `storage mcp` — a stdio Model Context Protocol server. Wraps `@storagesdk/ai/mcp`'s `createMcpServer` and connects it to `StdioServerTransport`, so any MCP host (Claude Desktop, Cursor, MCP Inspector, etc.) can drive storagesdk. Accepts `--read-only`, `--scope <prefix>`, `--url-expires-in <seconds>`, `--max-inline-bytes <bytes>`. stdout is reserved for JSON-RPC; the readiness line and any errors go to stderr.
