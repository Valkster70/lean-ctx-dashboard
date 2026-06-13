#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const READ_MODES = ["auto", "full", "map", "signatures", "task", "aggressive", "entropy", "diff"];

function dataDir() {
  return process.env.LEAN_CTX_DATA_DIR || path.join(os.homedir(), ".config", "lean-ctx");
}

function workspace(args = {}) {
  return args.workspace || process.env.CODEX_WORKSPACE || process.cwd();
}

function leanCtxBin() {
  if (process.env.LEAN_CTX_BIN) return process.env.LEAN_CTX_BIN;
  if (process.platform !== "win32") return "lean-ctx";

  const appData = process.env.APPDATA || "";
  const userProfile = process.env.USERPROFILE || "";
  const candidates = [
    path.join(appData, "npm", "lean-ctx.cmd"),
    path.join(appData, "npm", "lean-ctx.exe"),
    path.join(appData, "npm", "node_modules", "lean-ctx-bin", "bin", "lean-ctx.exe"),
    path.join(userProfile, "AppData", "Roaming", "npm", "lean-ctx.cmd"),
    path.join(userProfile, "AppData", "Roaming", "npm", "node_modules", "lean-ctx-bin", "bin", "lean-ctx.exe"),
    path.join(userProfile, ".local", "bin", "lean-ctx.exe"),
  ];
  return candidates.find((candidate) => candidate && fsSync.existsSync(candidate)) || "lean-ctx";
}

function commandEnv(cwd) {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const currentPath = process.env.PATH || process.env.Path || "";
  const extras =
    process.platform === "win32"
      ? [
          process.env.APPDATA && path.join(process.env.APPDATA, "npm"),
          process.env.USERPROFILE && path.join(process.env.USERPROFILE, "AppData", "Roaming", "npm"),
          process.env.USERPROFILE && path.join(process.env.USERPROFILE, ".local", "bin"),
          "C:\\Program Files\\nodejs",
        ]
      : [
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          process.env.HOME && path.join(process.env.HOME, ".local", "bin"),
          process.env.HOME && path.join(process.env.HOME, ".npm-global", "bin"),
        ];
  const pathValue = [currentPath, ...extras.filter(Boolean)].join(delimiter);
  return { ...process.env, CODEX_WORKSPACE: cwd, PATH: pathValue, Path: pathValue };
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readEvents(limit) {
  try {
    const lines = (await fs.readFile(path.join(dataDir(), "events.jsonl"), "utf8")).trim().split(/\r?\n/);
    const events = [];
    for (let i = lines.length - 1; i >= 0 && events.length < limit; i -= 1) {
      try {
        events.push(JSON.parse(lines[i]));
      } catch {
        // Ignore partial JSONL rows.
      }
    }
    return events;
  } catch {
    return [];
  }
}

async function runLeanCtx(args, opts = {}) {
  const cwd = workspace(opts);
  const command = leanCtxBin();
  const result = await execFileAsync(command, args, {
    cwd,
    timeout: opts.timeoutMs || 15000,
    windowsHide: true,
    env: commandEnv(cwd),
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
  });
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

async function runLeanCtxJson(args, opts) {
  const result = await runLeanCtx(args, opts);
  return JSON.parse(result.stdout || "{}");
}

function text(value) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  };
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function snapshot(args = {}) {
  const cwd = workspace(args);
  const dir = dataDir();
  const eventLimit = args.eventLimit || 15;
  const [stats, live, costs, events, gain, report, status, knowledge] = await Promise.all([
    readJson(path.join(dir, "stats.json"), {}),
    readJson(path.join(dir, "mcp-live.json"), {}),
    readJson(path.join(dir, "cost_attribution.json"), {}),
    readEvents(eventLimit),
    runLeanCtxJson(["gain", "--json"], { workspace: cwd }).catch((error) => ({ error: error.message })),
    runLeanCtxJson(["token-report", "--json"], { workspace: cwd }).catch((error) => ({ error: error.message })),
    runLeanCtxJson(["status", "--json"], { workspace: cwd }).catch((error) => ({ error: error.message })),
    runLeanCtxJson(["knowledge", "export", "--format", "json"], { workspace: cwd }).catch((error) => ({ error: error.message })),
  ]);

  const gainSummary = gain.summary || {};
  const session = report.session || {};
  const cep = report.cep || stats.cep || {};

  return {
    workspace: cwd,
    dataDir: dir,
    active: !status.error,
    version: status.version || report.version || "",
    mode: status.mode || status.read_mode || "auto",
    gain: {
      tokensSaved: num(gainSummary.tokens_saved),
      gainRatePct: num(gainSummary.gain_rate_pct),
      avoidedUsd: num(gainSummary.avoided_usd),
      totalCommands: num(gainSummary.total_commands || stats.total_commands),
      toolSpendUsd: num(gainSummary.tool_spend_usd),
      roi: num(gainSummary.roi),
      score: gainSummary.score || {},
      error: gain.error,
    },
    session: {
      id: session.id || "",
      startedAt: session.started_at || "",
      toolCalls: num(session.tool_calls),
      tokensSaved: num(session.tokens_saved),
      cacheHits: num(session.cache_hits),
      filesRead: num(session.files_read),
      commandsRun: num(session.commands_run),
      error: report.error,
    },
    cep: {
      sessions: num(cep.sessions),
      totalCacheHits: num(cep.total_cache_hits),
      totalCacheReads: num(cep.total_cache_reads),
      tokensOriginal: num(cep.total_tokens_original),
      tokensCompressed: num(cep.total_tokens_compressed),
    },
    mcpLive: {
      cepScore: num(live.cep_score),
      cacheUtilization: num(live.cache_utilization),
      compressionRate: num(live.compression_rate),
      filesCached: num(live.files_cached),
      totalReads: num(live.total_reads),
      toolCalls: num(live.tool_calls),
    },
    daily: stats.daily || [],
    costAttribution: { tools: costs.tools || {}, agents: costs.agents || {} },
    integrations: {
      mcpTargets: status.mcp_targets || [],
      rulesTargets: status.rules_targets || [],
      error: status.error,
    },
    knowledgeFacts: knowledge.facts || [],
    activityEvents: events,
  };
}

const server = new McpServer(
  { name: "lean-ctx-dashboard", version: "1.1.0" },
  {
    instructions:
      "Use these tools to inspect and control lean-ctx from Codex. Prefer lean_ctx_dashboard_snapshot before changing settings.",
  }
);

server.registerTool(
  "lean_ctx_dashboard_snapshot",
  {
    title: "Get lean-ctx dashboard snapshot",
    description: "Returns dashboard stats, health, cost, activity, and knowledge data.",
    inputSchema: {
      workspace: z.string().optional(),
      eventLimit: z.number().int().min(1).max(100).optional(),
    },
  },
  async (args) => text(await snapshot(args))
);

server.registerTool(
  "lean_ctx_run_doctor",
  {
    title: "Run lean-ctx doctor",
    description: "Runs lean-ctx doctor and returns JSON health data when available.",
    inputSchema: { workspace: z.string().optional(), fix: z.boolean().optional() },
  },
  async (args) => {
    const result = await runLeanCtx(args.fix ? ["doctor", "--fix", "--json"] : ["doctor", "--json"], {
      workspace: args.workspace,
      timeoutMs: 30000,
    });
    try {
      return text(JSON.parse(result.stdout));
    } catch {
      return text(result.stdout || result.stderr);
    }
  }
);

server.registerTool(
  "lean_ctx_set_read_mode",
  {
    title: "Set lean-ctx read mode",
    description: "Sets lean-ctx read mode for future context reads.",
    inputSchema: { mode: z.enum(READ_MODES), workspace: z.string().optional() },
  },
  async (args) => text((await runLeanCtx(["config", "--set", `read_mode=${args.mode}`], args)).stdout)
);

server.registerTool(
  "lean_ctx_compress_workspace",
  {
    title: "Compress lean-ctx workspace context",
    description: "Runs lean-ctx compress in the selected workspace.",
    inputSchema: { workspace: z.string().optional() },
  },
  async (args) => text((await runLeanCtx(["compress"], { ...args, timeoutMs: 30000 })).stdout || "Compression completed.")
);

server.registerTool(
  "lean_ctx_set_task",
  {
    title: "Set lean-ctx active task",
    description: "Sets the active lean-ctx task for task-mode filtering.",
    inputSchema: { task: z.string().min(1), workspace: z.string().optional() },
  },
  async (args) => text((await runLeanCtx(["session", "task", args.task], args)).stdout || `Task set: ${args.task}`)
);

server.registerTool(
  "lean_ctx_remember",
  {
    title: "Remember a lean-ctx lesson",
    description: "Records a fact or gotcha in lean-ctx knowledge.",
    inputSchema: {
      value: z.string().min(1),
      category: z.string().optional(),
      key: z.string().optional(),
      workspace: z.string().optional(),
    },
  },
  async (args) => {
    const category = args.category || "general";
    const key = args.key || `fact-${Date.now()}`;
    const result = await runLeanCtx(["knowledge", "remember", args.value, "--category", category, "--key", key], args);
    return text(result.stdout || `Remembered [${category}] ${key}`);
  }
);

server.registerTool(
  "lean_ctx_launch_web_dashboard",
  {
    title: "Launch lean-ctx web dashboard",
    description: "Starts lean-ctx dashboard as a detached local process.",
    inputSchema: { workspace: z.string().optional() },
  },
  async (args) => {
    const cwd = workspace(args);
    const command = leanCtxBin();
    const child = spawn(command, ["dashboard"], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: commandEnv(cwd),
      shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
    });
    child.unref();
    return text("Started lean-ctx dashboard in the background.");
  }
);

await server.connect(new StdioServerTransport());
console.error("lean-ctx Dashboard MCP server running on stdio");
