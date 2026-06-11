---
'@storagesdk/ai': minor
---

Add `@storagesdk/ai/mcp` — a Model Context Protocol server subpath. `createMcpServer(storage, options)` returns an MCP `McpServer` with every storagesdk tool registered (`download`, `upload`, `head`, `list`, `url`, `delete`, `copy`, `move`, `upload_url`, `download_range`, plus the snapshot/fork roster). The caller owns the transport — connect to `StdioServerTransport`, an in-memory transport for tests, or any other MCP-supported transport. Server name/version are sourced from this package's `package.json`; identifier is `@storagesdk/mcp`.
