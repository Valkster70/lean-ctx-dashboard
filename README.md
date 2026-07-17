# Lean Context Dashboard

A VS Code extension that surfaces agent/LLM context state in one dashboard panel.

## Who it's for

Anyone working with non-trivial LLM-driven coding sessions who wants visibility into what the agent currently knows about the workspace — useful when context windows are deep or many files are in play.

## Run it locally

```bash
git clone https://github.com/Valkster70/lean-ctx-dashboard.git
cd lean-ctx-dashboard
npm install
```

Use `npm run build` to bundle via esbuild, `npm run watch` during development, and `npm test` before opening a pull request. To load the extension in development, open the folder in VS Code and press `F5` to launch an Extension Development Host with the dashboard attached. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full workflow.

## Install a packaged build

```bash
npm run package
code --install-extension lean-ctx-dashboard-*.vsix --force
```

Open the **lean-ctx** activity-bar view, or run **lean-ctx: Open Dashboard UI** from the Command Palette.

For the full Antigravity-style experience, run **lean-ctx: Open Full Dashboard**. This opens the canonical `lean-ctx dashboard --vscode` surface. The same surface is available to Codex and OpenCode through `lean_ctx_open_full_dashboard` and to browser-based clients through `lean_ctx_launch_web_dashboard`.

## Privacy

The extension reads lean-ctx's local metrics and configuration files to show workspace statistics. It does not send that data to a remote service. Personal agent-context folders such as `.agent-mem/` and `.brainsync/` are intentionally excluded from source control and release packages.

## Project layout

- `src/` — extension source
- `codex/` — bundled prompt/codex assets
- `media/` — extension icon (`icon.png`, `icon.svg`)
- `docs/` — design notes (see [`docs/codex.md`](./docs/codex.md))
- `esbuild.js` — build config

## Live demo

No live demo is published. Run locally per the instructions above.

## License

[MIT](./LICENSE)
