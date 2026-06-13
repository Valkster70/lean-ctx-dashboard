# Codex integration

This repository supports two surfaces:

- VS Code-compatible editors, including Antigravity, through the existing extension dashboard.
- Codex through a local MCP server at `codex/mcp-server.mjs`.

The MCP server does not replace the editor extension. It exposes the dashboard's useful lean-ctx data and controls to Codex as tools.

## Install

```powershell
cd "C:\path\to\lean-ctx-dashboard"
npm install
```

## Configure Codex

Copy `codex/config.example.toml` into either:

- `~/.codex/config.toml` for personal use across projects.
- `.codex/config.toml` inside a trusted project for repo-scoped use.

Update the paths if your clone or workspace lives somewhere else.

Minimal config:

```toml
[mcp_servers.lean_ctx_dashboard]
command = "node"
args = ["C:\\path\\to\\lean-ctx-dashboard\\codex\\mcp-server.mjs"]
cwd = "C:\\path\\to\\lean-ctx-dashboard"
enabled = true
```

Restart Codex after changing MCP configuration. In the Codex CLI TUI, use `/mcp` to confirm the server is connected.

## Tools exposed to Codex

- `lean_ctx_dashboard_snapshot` - returns dashboard stats, cost data, activity events, integration status, and knowledge facts.
- `lean_ctx_run_doctor` - runs `lean-ctx doctor --json`, or `doctor --fix --json`.
- `lean_ctx_set_read_mode` - sets `auto`, `full`, `map`, `signatures`, `task`, `aggressive`, `entropy`, or `diff`.
- `lean_ctx_compress_workspace` - runs `lean-ctx compress`.
- `lean_ctx_set_task` - sets the active lean-ctx task.
- `lean_ctx_remember` - records a knowledge fact or gotcha.
- `lean_ctx_launch_web_dashboard` - starts the existing lean-ctx web dashboard command in the background.

Most tools accept an optional `workspace` argument. If omitted, the server uses `CODEX_WORKSPACE` or the server process directory.

## Environment variables

- `CODEX_WORKSPACE` - default workspace for lean-ctx commands.
- `LEAN_CTX_BIN` - optional path to the lean-ctx executable.
- `LEAN_CTX_DATA_DIR` - optional path to lean-ctx's data directory.

## Antigravity remains unchanged

The existing extension entrypoint, webview, commands, and VSIX packaging are untouched. Antigravity can keep installing and running the dashboard as a VS Code-compatible extension, while Codex uses the MCP server.
