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

The exact build/dev scripts live in `package.json` (typical: `npm run build` to bundle via esbuild, `npm run dev` for watch mode). To load as a VS Code extension: open the folder in VS Code, press `F5` to launch an Extension Development Host with the dashboard attached. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full dev workflow.

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