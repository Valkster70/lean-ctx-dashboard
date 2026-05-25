# lean-ctx Dashboard

A visual sidebar dashboard for [lean-ctx](https://github.com/yvgude/lean-ctx) — the Cognitive Context Layer for AI coding agents.

Monitor your token savings, CEP scores, cache performance, session activity, and integration health directly inside VS Code, Antigravity IDE, or any VS Code-compatible editor.

## Features

### 📊 Stats Tab
- **Gain Rate Ring** — live visualization of your token compression percentage
- **CEP Score** — Context Engineering Protocol composite score (0–100)
- **ROI Indicator** — return on investment from lean-ctx tool usage
- **Token Savings** — total tokens saved across all sessions
- **Estimated USD Savings** — approximate cost savings based on model pricing
- **Cache Hits** — number of cache-served reads (13 tokens instead of ~2000)
- **Session Info** — current session files read, tool calls, commands run
- **Daily Activity Chart** — bar chart showing last 7 days of activity

### 🎛️ Controls Tab
- **Read Mode Selector** — switch between auto, full, map, signatures, task, aggressive, entropy, diff modes
- **Context Compression** — trigger `lean-ctx compress` from the UI
- **Task Assignment** — set the active task for task-mode filtering

### 🧠 Gotchas Tab
- **View gotchas** — self-correction lessons compiled for your repository
- **Record lessons** — save facts/gotchas with category and key tagging

### 🩺 Doctor Tab
- **Live health checks** — powered by `lean-ctx doctor --json`
- **Integration status** — shell hooks, daemon, MCP targets, agent rules
- **One-click repair** — run `lean-ctx doctor --fix` from the UI

### Status Bar
- Shows current gain rate: `⚡ lean-ctx: 17% saved`
- Click to open the sidebar dashboard

## Prerequisites

[lean-ctx](https://github.com/yvgude/lean-ctx) must be installed and set up:

```bash
npm install -g lean-ctx-bin
lean-ctx setup
```

## Installation

### From VSIX (Recommended)

1. Download the latest `.vsix` from [Releases](https://github.com/Valkster70/lean-ctx-dashboard/releases)
2. In VS Code / Antigravity IDE: `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
3. Select the downloaded `.vsix` file
4. Restart the editor

### From Source

```bash
git clone https://github.com/Valkster70/lean-ctx-dashboard.git
cd lean-ctx-dashboard
npm install
npm run build
npm run package
# Install the generated .vsix file
```

## How It Works

The dashboard reads data from multiple sources:

| Source | What it provides |
|--------|-----------------|
| `lean-ctx gain --json` | Token savings, gain rate, USD savings, ROI, CEP score |
| `lean-ctx token-report --json` | Current session state (files read, tool calls, cache hits) |
| `lean-ctx status --json` | Active mode, version, session info |
| `lean-ctx doctor --json` | Structured health check results |
| `~/.config/lean-ctx/stats.json` | Total commands, daily breakdown |
| `~/.config/lean-ctx/mcp-live.json` | Real-time CEP score, cache utilization |

Data refreshes automatically every 15 seconds and on tab switches.

## Configuration

The extension auto-discovers the lean-ctx data directory. If you use a custom location, set the `LEAN_CTX_DATA_DIR` environment variable.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)

## Related

- [lean-ctx](https://github.com/yvgude/lean-ctx) — The Cognitive Context Layer for AI coding agents
- [leanctx.com](https://leanctx.com) — Official documentation
