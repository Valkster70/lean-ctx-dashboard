const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("release package excludes personal agent context", () => {
  const ignore = read(".vscodeignore");
  assert.match(ignore, /^\.agent-mem\/\*\*$/m);
  assert.match(ignore, /^\.brainsync\/\*\*$/m);
});

test("extension avoids shell-backed command execution", () => {
  const provider = read("src/dashboardProvider.ts");
  assert.match(provider, /execFile/);
  assert.doesNotMatch(provider, /from "child_process";\s*\n.*\bexec\b/);
  assert.doesNotMatch(provider, /case "runCLI"/);
});

test("webview ships its font locally", () => {
  const css = read("src/webview/dashboard.css");
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.match(read("src/dashboardProvider.ts"), /inter-latin-400-normal\.woff2/);
});

test("all adapters expose the canonical full dashboard", () => {
  const provider = read("src/dashboardProvider.ts");
  const extension = read("src/extension.ts");
  const mcp = read("codex/mcp-server.mjs");
  assert.match(provider, /dashboard --vscode/);
  assert.match(extension, /lean-ctx\.openFullDashboard/);
  assert.match(mcp, /lean_ctx_open_full_dashboard/);
});
