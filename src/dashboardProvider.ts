import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execFile } from "child_process";
import * as util from "util";

const execFilePromise = util.promisify(execFile);

// Create an OutputChannel for diagnostic logs
const outputChannel = vscode.window.createOutputChannel("lean-ctx Dashboard");

/**
 * Resolves the lean-ctx data directory.
 * Checks LEAN_CTX_DATA_DIR env first, then falls back to ~/.config/lean-ctx
 */
function getDataDir(): string {
  if (process.env.LEAN_CTX_DATA_DIR) {
    return process.env.LEAN_CTX_DATA_DIR;
  }
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(homeDir, ".config", "lean-ctx");
}

/**
 * Safely read and parse a JSON file. Returns null on any error.
 */
async function readJsonFile(filePath: string): Promise<any | null> {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Safely read and parse events.jsonl from bottom-up (newest first).
 */
async function readEventsJsonl(filePath: string, limit = 15): Promise<any[]> {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = await fs.promises.readFile(filePath, "utf8");
    const lines = content.trim().split("\n");
    const events: any[] = [];
    for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Generates options for execPromise, ensuring standard Node/npm paths are in PATH.
 */
function getExecOptions(timeoutMs: number, cwd?: string): any {
  const options: any = { timeout: timeoutMs };
  if (cwd) {
    options.cwd = cwd;
  }

  // Clone environment
  const env = { ...process.env };

  // Resolve PATH
  let pathVal = env.PATH || env.Path || "";
  const pathDelimiter = process.platform === "win32" ? ";" : ":";
  const paths = pathVal.split(pathDelimiter).filter(Boolean);

  // Standard paths to append if not present
  const standardPaths: string[] = [];
  if (process.platform === "win32") {
    if (env.APPDATA) {
      standardPaths.push(path.join(env.APPDATA, "npm"));
    }
    if (env.USERPROFILE) {
      standardPaths.push(path.join(env.USERPROFILE, "AppData", "Roaming", "npm"));
      standardPaths.push(path.join(env.USERPROFILE, "scoop", "shims"));
      standardPaths.push(path.join(env.USERPROFILE, ".local", "bin"));
    }
    standardPaths.push("C:\\Program Files\\nodejs");
    standardPaths.push("C:\\Program Files (x86)\\nodejs");
  } else {
    const home = env.HOME || "";
    if (home) {
      standardPaths.push(path.join(home, ".local", "bin"));
      standardPaths.push(path.join(home, ".npm-global", "bin"));
      standardPaths.push(path.join(home, ".config", "yarn", "global", "node_modules", ".bin"));
    }
    standardPaths.push("/usr/local/bin");
    standardPaths.push("/usr/bin");
    standardPaths.push("/bin");
    standardPaths.push("/usr/sbin");
    standardPaths.push("/sbin");
  }

  for (const p of standardPaths) {
    if (p && !paths.includes(p)) {
      paths.push(p);
    }
  }

  const newPath = paths.join(pathDelimiter);
  env.PATH = newPath;
  env.Path = newPath;
  options.env = env;

  return options;
}

let cachedCommand: string | null = null;

/**
 * Resolves the full path/command to lean-ctx.
 * On Windows, if 'lean-ctx' is not in the PATH of the process,
 * it attempts to locate it in the standard npm global directory.
 */
async function getLeanCtxCommand(): Promise<string> {
  if (cachedCommand) return cachedCommand;
  try {
    const options = getExecOptions(2000);
    await execFilePromise("lean-ctx", ["--version"], {
      ...options,
      shell: process.platform === "win32",
    });
    cachedCommand = "lean-ctx";
    return cachedCommand;
  } catch (err: any) {
    outputChannel.appendLine(`[Info] "lean-ctx --version" failed on default PATH: ${err.message || err}`);
    if (process.platform === "win32" && process.env.APPDATA) {
      const globalNpmCmd = path.join(process.env.APPDATA, "npm", "lean-ctx.cmd");
      if (fs.existsSync(globalNpmCmd)) {
        cachedCommand = globalNpmCmd;
        outputChannel.appendLine(`[Info] Found global lean-ctxCmd path: ${cachedCommand}`);
        return cachedCommand;
      }
      const globalNpm = path.join(process.env.APPDATA, "npm", "lean-ctx");
      if (fs.existsSync(globalNpm)) {
        cachedCommand = globalNpm;
        outputChannel.appendLine(`[Info] Found global lean-ctx path: ${cachedCommand}`);
        return cachedCommand;
      }
    }
    outputChannel.appendLine(`[Warning] Could not find lean-ctx globally. Falling back to "lean-ctx".`);
    cachedCommand = "lean-ctx";
    return cachedCommand;
  }
}

async function runLeanCtx(args: string[], timeoutMs: number, cwd?: string) {
  const command = await getLeanCtxCommand();
  return execFilePromise(command, args, {
    ...getExecOptions(timeoutMs, cwd),
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
  });
}

/**
 * Safely execute a lean-ctx CLI command and parse JSON output.
 * Returns null on any error (command not found, non-zero exit, bad JSON).
 */
async function execLeanCtxJson(args: string[], cwd?: string): Promise<any | null> {
  try {
    const { stdout } = await runLeanCtx(args, 10000, cwd);
    return JSON.parse(stdout.toString());
  } catch (err: any) {
    outputChannel.appendLine(`[Error] execLeanCtxJson failed for: "${args.join(" ")}"`);
    if (err.message) {
      outputChannel.appendLine(`Message: ${err.message}`);
    }
    if (err.stderr) {
      outputChannel.appendLine(`Stderr: ${err.stderr}`);
    }
    return null;
  }
}

export class LeanCtxDashboardProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  // Cached CLI-derived values to enable fast-path updates
  private _lastVersion: string = "";
  private _lastIsActive: boolean = false;
  private _lastCurrentMode: string = "auto";
  private _lastSessionTaskDescription: string = "";
  private _lastMcpTargets: any[] = [];
  private _lastRulesTargets: any[] = [];
  private _lastKnowledgeFacts: any[] = [];
  private _lastOverlays: any[] = [];
  private _lastGainSummary: any = {};
  private _lastSession: any = {};
  private _lastCep: any = {};
  private _lastGotchas: string[] = [];
  private _lastDoctorChecks: any[] = [];

  // File watchers and timeouts
  private _watcher?: fs.FSWatcher;
  private _workspaceWatcher?: fs.FSWatcher;
  private _debouncedRefreshTimeout?: NodeJS.Timeout;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Set up message listener
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "refresh":
          this.refreshStats(true);
          break;
        case "setReadMode":
          await this.setReadMode(data.mode);
          break;
        case "compress":
          await this.executeCLICommand(["compress"]);
          break;
        case "setTask":
          await this.setTask(data.task);
          break;
        case "rememberKnowledge":
          await this.rememberKnowledge(data.value, data.category, data.key);
          break;
        case "runDoctor":
          await this.executeCLICommand(["doctor"]);
          break;
        case "runDoctorFix":
          await this.executeCLICommand(["doctor", "--fix"]);
          break;
        case "removeKnowledge":
          await this.removeKnowledge(data.category, data.key);
          break;
        case "importTemplatePack":
          await this.importTemplatePack(data.packId);
          break;
        case "clearTask":
          await this.clearTask();
          break;
        case "launchWebDashboard":
          await this.openFullDashboard();
          break;
        case "openFullDashboard":
          await this.openFullDashboard();
          break;
        case "addOverlay":
          await this.addOverlay(data.target, data.mode);
          break;
        case "removeOverlay":
          await this.removeOverlay(data.target);
          break;
        case "addActiveFileOverlay":
          await this.addActiveFileOverlay(data.mode);
          break;
        case "requestActiveFile":
          this.sendActiveFileToPreview();
          break;
        case "runPreview":
          await this.runPreview(data.target, data.mode);
          break;
      }
    });

    // Start watching events and state files
    this._setupFileWatcher();

    // Clean up when webview is disposed
    webviewView.onDidDispose(() => {
      this._disposeFileWatcher();
    });

    // Initial load of stats (full CLI fetch)
    this.refreshStats(true);
  }

  /**
   * Set up file watchers on key lean-ctx files to enable instant, real-time streaming updates.
   */
  private _setupFileWatcher() {
    this._disposeFileWatcher();

    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        outputChannel.appendLine(`[Warning] Failed to create data directory for watching: ${err}`);
        return;
      }
    }

    try {
      let watcherTimeout: NodeJS.Timeout | null = null;
      outputChannel.appendLine(`[Info] Starting configuration directory watcher on: ${dataDir}`);
      
      this._watcher = fs.watch(dataDir, (_, filename) => {
        // Watch key fast-read files
        const keyFiles = ["events.jsonl", "mcp-live.json", "stats.json", "cost_attribution.json"];
        if (filename && !keyFiles.includes(filename)) return;

        // Throttling/Debouncing watcher triggers to avoid duplicate reads during simultaneous writes
        if (watcherTimeout) clearTimeout(watcherTimeout);
        watcherTimeout = setTimeout(async () => {
          outputChannel.appendLine(`[Info] State file changed: ${filename}. Triggering fast refresh.`);
          
          // Trigger fast-path refresh immediately
          await this.refreshStats(false);

          // Schedule/Debounce full CLI refresh after 1500ms of quiet time
          if (this._debouncedRefreshTimeout) clearTimeout(this._debouncedRefreshTimeout);
          this._debouncedRefreshTimeout = setTimeout(async () => {
            outputChannel.appendLine(`[Info] Quiet period elapsed. Triggering full CLI stats refresh.`);
            await this.refreshStats(true);
          }, 1500);

        }, 50); // 50ms batch window
      });
    } catch (err: any) {
      outputChannel.appendLine(`[Warning] Failed to start config directory watcher: ${err.message || err}`);
    }

    // Also watch workspace overlays file if active workspace exists
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspacePath) {
      const workspaceLeanCtxDir = path.join(workspacePath, ".lean-ctx");
      if (fs.existsSync(workspaceLeanCtxDir)) {
        try {
          let workspaceWatcherTimeout: NodeJS.Timeout | null = null;
          outputChannel.appendLine(`[Info] Starting workspace overlays watcher on: ${workspaceLeanCtxDir}`);
          
          this._workspaceWatcher = fs.watch(workspaceLeanCtxDir, (_, filename) => {
            if (filename === "overlays.json") {
              if (workspaceWatcherTimeout) clearTimeout(workspaceWatcherTimeout);
              workspaceWatcherTimeout = setTimeout(async () => {
                outputChannel.appendLine(`[Info] Overlays file changed. Triggering fast refresh.`);
                await this.refreshStats(false);
              }, 50);
            }
          });
        } catch (err: any) {
          outputChannel.appendLine(`[Warning] Failed to start workspace overlays watcher: ${err.message || err}`);
        }
      }
    }
  }

  /**
   * Stop and clear all active file watchers and debouncing timers.
   */
  private _disposeFileWatcher() {
    if (this._watcher) {
      try {
        this._watcher.close();
      } catch {}
      this._watcher = undefined;
    }
    if (this._workspaceWatcher) {
      try {
        this._workspaceWatcher.close();
      } catch {}
      this._workspaceWatcher = undefined;
    }
    if (this._debouncedRefreshTimeout) {
      clearTimeout(this._debouncedRefreshTimeout);
      this._debouncedRefreshTimeout = undefined;
    }
  }

  public async refreshStats(forceFull = true) {
    if (!this._view) return;

    try {
      const dataDir = getDataDir();
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const overlaysPath = workspacePath ? path.join(workspacePath, ".lean-ctx", "overlays.json") : "";

      let stats: any = null;
      let mcpLive: any = null;
      let costAttribution: any = null;
      let events: any[] = [];
      let overlaysData: any = null;

      // Slower CLI command data sources
      let gain: any = null;
      let tokenReport: any = null;
      let statusData: any = null;
      let knowledgeData: any = null;

      if (forceFull) {
        // Full path: Gather all data sources in parallel (including slower CLI processes)
        const [statsVal, mcpLiveVal, costAttributionVal, eventsVal, gainVal, tokenReportVal, statusDataVal, knowledgeDataVal, overlaysDataVal] =
          await Promise.all([
            readJsonFile(path.join(dataDir, "stats.json")),
            readJsonFile(path.join(dataDir, "mcp-live.json")),
            readJsonFile(path.join(dataDir, "cost_attribution.json")),
            readEventsJsonl(path.join(dataDir, "events.jsonl")),
            execLeanCtxJson(["gain", "--json"], workspacePath),
            execLeanCtxJson(["token-report", "--json"], workspacePath),
            execLeanCtxJson(["status", "--json"], workspacePath),
            execLeanCtxJson(["knowledge", "export", "--format", "json"], workspacePath),
            overlaysPath ? readJsonFile(overlaysPath) : Promise.resolve(null),
          ]);

        stats = statsVal;
        mcpLive = mcpLiveVal;
        costAttribution = costAttributionVal;
        events = eventsVal;
        overlaysData = overlaysDataVal;

        gain = gainVal;
        tokenReport = tokenReportVal;
        statusData = statusDataVal;
        knowledgeData = knowledgeDataVal;

        // Update cached CLI-derived values
        this._lastVersion = statusData?.version || tokenReport?.version || "";
        this._lastIsActive = !!statusData;
        this._lastCurrentMode = statusData?.mode || statusData?.read_mode || "auto";
        this._lastMcpTargets = statusData?.mcp_targets || [];
        this._lastRulesTargets = statusData?.rules_targets || [];
        this._lastKnowledgeFacts = knowledgeData?.facts || [];
        this._lastOverlays = overlaysData?.overlays || [];
        this._lastGainSummary = gain?.summary || {};
        this._lastSession = tokenReport?.session || {};
        this._lastCep = tokenReport?.cep || stats?.cep || {};
        this._lastDoctorChecks = this._parseDoctorResults(statusData);

        // Fetch gotchas (text output, not JSON)
        try {
          const { stdout } = await runLeanCtx(["gotchas", "list"], 5000, workspacePath);
          this._lastGotchas = stdout.toString()
            .split("\n")
            .map((line: string) => line.trim())
            .filter(
              (line: string) =>
                line.length > 0 &&
                !line.startsWith("Gotchas:") &&
                !line.startsWith("---") &&
                !line.startsWith("No gotchas")
            );
        } catch (err: any) {
          outputChannel.appendLine(`[Warning] Failed to fetch gotchas: ${err.message || err}`);
        }

        // Extract active task from session file
        try {
          const latestSessionInfo = await readJsonFile(path.join(dataDir, "sessions", "latest.json"));
          if (latestSessionInfo && latestSessionInfo.id) {
            const sessionData = await readJsonFile(path.join(dataDir, "sessions", `${latestSessionInfo.id}.json`));
            this._lastSessionTaskDescription = sessionData?.task?.description || "";
          } else {
            this._lastSessionTaskDescription = "";
          }
        } catch (err) {
          outputChannel.appendLine(`[Warning] Failed to read session file: ${err}`);
        }
      } else {
        // Fast-path: Only read files (very fast, no CLI processes spawned)
        const [statsVal, mcpLiveVal, costAttributionVal, eventsVal, overlaysDataVal] =
          await Promise.all([
            readJsonFile(path.join(dataDir, "stats.json")),
            readJsonFile(path.join(dataDir, "mcp-live.json")),
            readJsonFile(path.join(dataDir, "cost_attribution.json")),
            readEventsJsonl(path.join(dataDir, "events.jsonl")),
            overlaysPath ? readJsonFile(overlaysPath) : Promise.resolve(null),
          ]);

        stats = statsVal;
        mcpLive = mcpLiveVal;
        costAttribution = costAttributionVal;
        events = eventsVal;
        overlaysData = overlaysDataVal;

        if (overlaysData) {
          this._lastOverlays = overlaysData.overlays || [];
        }
      }

      // Fetch from cached / merged state
      const version = this._lastVersion;
      const isActive = this._lastIsActive;
      const currentMode = this._lastCurrentMode;
      const sessionTaskDescription = this._lastSessionTaskDescription;
      const mcpTargets = this._lastMcpTargets;
      const rulesTargets = this._lastRulesTargets;
      const knowledgeFacts = this._lastKnowledgeFacts;
      const overlays = this._lastOverlays;
      const gotchas = this._lastGotchas;
      const doctorChecks = this._lastDoctorChecks;

      // Extract gain summary (fallback to cached CLI info)
      const gainSummary = {
        tokensSaved: this._lastGainSummary.tokens_saved || 0,
        gainRatePct: this._lastGainSummary.gain_rate_pct || 0,
        avoidedUsd: this._lastGainSummary.avoided_usd || 0,
        totalCommands: this._lastGainSummary.total_commands || stats?.total_commands || 0,
        toolSpendUsd: this._lastGainSummary.tool_spend_usd || 0,
        roi: this._lastGainSummary.roi || 0,
        score: this._lastGainSummary.score || {},
      };

      // Extract session (fallback to cached CLI info)
      const session = {
        id: this._lastSession.id || "",
        startedAt: this._lastSession.started_at || "",
        toolCalls: this._lastSession.tool_calls || 0,
        tokensSaved: this._lastSession.tokens_saved || 0,
        cacheHits: this._lastSession.cache_hits || 0,
        filesRead: this._lastSession.files_read || 0,
        commandsRun: this._lastSession.commands_run || 0,
      };

      // Extract CEP data (fallback to cached CLI info or fast stats.json)
      const cep = {
        sessions: this._lastCep.sessions || 0,
        totalCacheHits: this._lastCep.total_cache_hits || 0,
        totalCacheReads: this._lastCep.total_cache_reads || 0,
        tokensOriginal: this._lastCep.total_tokens_original || 0,
        tokensCompressed: this._lastCep.total_tokens_compressed || 0,
      };

      // Send the complete data payload to webview
      this._view.webview.postMessage({
        type: "updateStats",
        version,
        isActive,
        currentMode,
        sessionTaskDescription,
        mcpTargets,
        rulesTargets,
        knowledgeFacts: knowledgeFacts || [],
        overlays: overlays || [],
        gainSummary,
        session,
        cep,
        mcpLive: {
          cepScore: mcpLive?.cep_score || 0,
          cacheUtilization: mcpLive?.cache_utilization || 0,
          compressionRate: mcpLive?.compression_rate || 0,
          filesCached: mcpLive?.files_cached || 0,
          totalReads: mcpLive?.total_reads || 0,
          toolCalls: mcpLive?.tool_calls || 0,
        },
        daily: stats?.daily || [],
        costUsd: costAttribution?.tools
          ? Object.values(costAttribution.tools as Record<string, any>).reduce(
              (sum: number, t: any) => sum + (t.cost_usd || 0),
              0
            )
          : 0,
        costAttribution: {
          tools: costAttribution?.tools || {},
          agents: costAttribution?.agents || {},
        },
        gotchas,
        doctorChecks,
        activityEvents: events || [],
      });
    } catch (e: any) {
      this._view.webview.postMessage({
        type: "error",
        message: e.message || "Failed to retrieve statistics",
      });
    }
  }

  /**
   * Parse the `lean-ctx doctor --json` output into an array of check results.
   * Falls back to basic checks if doctor command fails.
   */
  private _parseDoctorResults(doctorData: any): any[] {
    if (!doctorData) {
      return [
        { name: "lean-ctx Binary", status: "unknown", desc: "Could not run doctor command" },
        { name: "Shell Hook", status: "unknown", desc: "Could not determine" },
        { name: "MCP Config", status: "unknown", desc: "Could not determine" },
      ];
    }

    const checks: any[] = [];

    // Doctor output has setup_report.steps[], each with name, ok, items[], warnings[], errors[]
    const setupReport = doctorData.setup_report || doctorData;
    const steps = setupReport?.steps || [];

    for (const step of steps) {
      const name = this._formatStepName(step.name);
      const ok = step.ok;
      const items = step.items || [];
      const warnings = step.warnings || [];

      let desc = "";
      if (items.length > 0) {
        const summaryItems = items
          .filter((i: any) => i.status !== "not_detected")
          .slice(0, 3);
        desc = summaryItems
          .map((i: any) => `${i.name}: ${i.status}`)
          .join(", ");
        if (items.length > summaryItems.length) {
          desc += ` (+${items.length - summaryItems.length} more)`;
        }
      }
      if (warnings.length > 0) {
        desc = warnings[0];
      }

      checks.push({
        name,
        status: ok ? "pass" : "fail",
        desc: desc || (ok ? "All checks passed" : "Issues found"),
      });
    }

    // Also add top-level doctor_compact info
    if (doctorData.doctor_compact_passed !== undefined) {
      checks.push({
        name: "Overall Health",
        status: doctorData.doctor_compact_passed >= doctorData.doctor_compact_total ? "pass" : "warn",
        desc: `${doctorData.doctor_compact_passed}/${doctorData.doctor_compact_total} checks passed`,
      });
    }

    // Add MCP targets summary
    const mcpTargets = doctorData.mcp_targets || [];
    const configuredTargets = mcpTargets.filter((t: any) => t.state === "configured");
    if (mcpTargets.length > 0) {
      checks.push({
        name: "MCP Targets",
        status: configuredTargets.length > 0 ? "pass" : "fail",
        desc: `${configuredTargets.length}/${mcpTargets.length} configured (${configuredTargets.map((t: any) => t.name).slice(0, 4).join(", ")}${configuredTargets.length > 4 ? "..." : ""})`,
      });
    }

    return checks;
  }

  private _formatStepName(name: string): string {
    const map: Record<string, string> = {
      shell_hook: "Shell Hook",
      daemon: "Background Daemon",
      editors: "Editor Detection",
      agent_rules: "Agent Rules",
      skill_files: "Skill Files",
      agent_hooks: "Agent Hooks",
      proxy: "Proxy",
      doctor_compact: "Doctor",
    };
    return map[name] || name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private async setReadMode(mode: string) {
    const validModes = new Set(["auto", "full", "map", "signatures", "task", "aggressive", "entropy", "diff"]);
    if (!validModes.has(mode)) {
      vscode.window.showErrorMessage("Unsupported lean-ctx read mode.");
      return;
    }
    try {
      await this.runCLICommand(["config", "--set", `read_mode=${mode}`]);
      vscode.window.showInformationMessage(`lean-ctx read mode set to: ${mode}`);
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to set read mode: ${error.message || error}`
      );
    }
  }

  private async setTask(task: unknown) {
    if (typeof task !== "string" || !task.trim()) return;
    try {
      await this.runCLICommand(["session", "task", task.trim()]);
      vscode.window.showInformationMessage("lean-ctx task updated.");
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to set task: ${error.message || error}`);
    }
  }

  private async rememberKnowledge(value: unknown, category: unknown, key: unknown) {
    if (typeof value !== "string" || !value.trim()) return;
    const safeCategory = typeof category === "string" && category.trim() ? category.trim() : "general";
    const safeKey = typeof key === "string" && key.trim() ? key.trim() : `fact-${Date.now()}`;
    try {
      await this.runCLICommand(["knowledge", "remember", value.trim(), "--category", safeCategory, "--key", safeKey]);
      vscode.window.showInformationMessage("Knowledge saved.");
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to save knowledge: ${error.message || error}`);
    }
  }

  private async importTemplatePack(packId: string) {
    const packs: Record<string, { val: string; key: string; cat: string }[]> = {
      compose: [
        {
          val: "Always specify unique keys in LazyColumn/LazyRow items to prevent unnecessary recompositions.",
          cat: "compose",
          key: "lazy-keys"
        },
        {
          val: "Avoid reading mutableStateOf directly in layout or draw phases; wrap in lambda or use derivedStateOf to defer reading.",
          cat: "compose",
          key: "state-read"
        },
        {
          val: "Use rememberUpdatedState for callbacks in LaunchedEffect to avoid capturing stale state without restarting the effect.",
          cat: "compose",
          key: "effect-callbacks"
        }
      ],
      vscode: [
        {
          val: "Always push disposables to context.subscriptions to prevent memory leaks on extension deactivation.",
          cat: "vscode",
          key: "disposal-leak"
        },
        {
          val: "Avoid using any types in typescript; use unknown with type guards to maintain type safety.",
          cat: "vscode",
          key: "strict-types"
        },
        {
          val: "Use try-finally when editing workspace edits or opening documents to ensure locks/state are released.",
          cat: "vscode",
          key: "workspace-locks"
        }
      ],
      security: [
        {
          val: "Never concatenate strings for SQL queries; use parameterized queries or knex/prisma bindings.",
          cat: "security",
          key: "sql-injection"
        },
        {
          val: "Do not use innerHTML to insert user input; use textContent or dompurify to prevent XSS.",
          cat: "security",
          key: "xss-innerhtml"
        },
        {
          val: "Set secure and httpOnly flags on sensitive cookies to mitigate session hijacking.",
          cat: "security",
          key: "secure-cookies"
        }
      ]
    };

    const pack = packs[packId];
    if (!pack) {
      vscode.window.showErrorMessage(`Unknown templates pack: ${packId}`);
      return;
    }

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Importing ${packId} templates...`,
        cancellable: false
      }, async () => {
        await Promise.all(
          pack.map(fact =>
            this.runCLICommand(["knowledge", "remember", fact.val, "--category", fact.cat, "--key", fact.key])
          )
        );
        vscode.window.showInformationMessage(`Successfully imported [${packId}] gotchas template pack.`);
        await this.refreshStats(true);
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to import template pack: ${error.message || error}`);
    }
  }

  private async executeCLICommand(args: string[]) {
    try {
      await this.runCLICommand(args);
      vscode.window.showInformationMessage(
        `lean-ctx command executed: ${args.join(" ")}`
      );
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `lean-ctx execution failed: ${error.message || error}`
      );
    }
  }

  private async removeKnowledge(category: string, key: string) {
    try {
      await this.runCLICommand(["knowledge", "remove", "--category", category, "--key", key]);
      vscode.window.showInformationMessage(`Fact [${category}] ${key} removed.`);
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to remove fact: ${error.message || error}`
      );
    }
  }

  private async clearTask() {
    try {
      await this.runCLICommand(["session", "reset"]);
      vscode.window.showInformationMessage(`lean-ctx session/task reset.`);
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to clear task: ${error.message || error}`
      );
    }
  }

  private async addOverlay(target: string, mode: string) {
    try {
      if (!target) return;
      if (mode === "pin") {
        await this.runCLICommand(["control", "pin", target]);
      } else if (mode === "exclude") {
        await this.runCLICommand(["control", "exclude", target]);
      } else {
        await this.runCLICommand(["control", "set_view", target, "--value", mode]);
      }
      vscode.window.showInformationMessage(`Overlay set for ${target}: ${mode}`);
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to set overlay: ${error.message || error}`
      );
    }
  }

  private async removeOverlay(target: string) {
    try {
      if (!target) return;
      await this.runCLICommand(["control", "reset", target]);
      vscode.window.showInformationMessage(`Overlay reset for ${target}`);
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to reset overlay: ${error.message || error}`
      );
    }
  }

  private async addActiveFileOverlay(mode: string) {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showWarningMessage("No active editor found to overlay.");
        return;
      }
      const fsPath = activeEditor.document.uri.fsPath;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }
      const workspacePath = workspaceFolder.uri.fsPath;
      let relativePath = path.relative(workspacePath, fsPath);
      relativePath = relativePath.replace(/\\/g, "/");

      await this.addOverlay(relativePath, mode);
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to add active file overlay: ${error.message || error}`
      );
    }
  }

  private sendActiveFileToPreview() {
    if (!this._view) return;
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage("No active editor open.");
      return;
    }
    const fsPath = activeEditor.document.uri.fsPath;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showWarningMessage("No workspace folder open.");
      return;
    }
    const workspacePath = workspaceFolder.uri.fsPath;
    let relativePath = path.relative(workspacePath, fsPath);
    relativePath = relativePath.replace(/\\/g, "/");

    this._view.webview.postMessage({
      type: "activeFileForPreview",
      path: relativePath
    });
  }

  private async runPreview(target: string, mode: string) {
    if (!this._view) return;
    try {
      if (!target) {
        throw new Error("No target file specified.");
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error("No workspace folder open.");
      }
      const workspacePath = workspaceFolder.uri.fsPath;
      
      let relativePath = target.replace(/\\/g, "/");
      if (relativePath.startsWith("file:")) {
        relativePath = relativePath.substring(5);
      }
      
      const fullPath = path.resolve(workspacePath, relativePath);
      
      const relativeToWorkspace = path.relative(workspacePath, fullPath);
      if (relativeToWorkspace.startsWith("..") || path.isAbsolute(relativeToWorkspace)) {
        throw new Error("Target file must be within the active workspace.");
      }
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${relativePath}`);
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        throw new Error(`Target is a directory: ${relativePath}`);
      }

      const originalContent = await fs.promises.readFile(fullPath, "utf8");
      
      const { stdout } = await runLeanCtx(["read", relativePath, "-m", mode], 15000, workspacePath);
      const compressedContent = stdout.toString();
      
      this._view.webview.postMessage({
        type: "updatePreview",
        target: relativePath,
        mode,
        originalContent,
        compressedContent,
        stats: {
          originalBytes: originalContent.length,
          originalLines: originalContent.split("\n").length,
          compressedBytes: compressedContent.length,
          compressedLines: compressedContent.split("\n").length
        }
      });
    } catch (error: any) {
      this._view.webview.postMessage({
        type: "previewError",
        message: error.message || "Failed to generate preview."
      });
    }
  }

  public async launchWebDashboard() {
    return this.openFullDashboard();
  }

  public async openFullDashboard() {
    try {
      let terminal = vscode.window.terminals.find(
        (t) => t.name === "lean-ctx full dashboard"
      );
      if (!terminal) {
        terminal = vscode.window.createTerminal("lean-ctx full dashboard");
        const baseCmd = await getLeanCtxCommand();
        terminal.sendText(`${baseCmd} dashboard --vscode`);
      }
      terminal.show();
      vscode.window.showInformationMessage("Opening the full lean-ctx dashboard...");
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to launch web dashboard: ${error.message || error}`
      );
    }
  }

  public async runCLICommand(args: string[]): Promise<string> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    try {
      const { stdout } = await runLeanCtx(args, 15000, workspacePath);
      return stdout.toString();
    } catch (err: any) {
      outputChannel.appendLine(`[Error] runCLICommand failed for: "${args.join(" ")}"`);
      if (err.message) {
        outputChannel.appendLine(`Message: ${err.message}`);
      }
      if (err.stderr) {
        outputChannel.appendLine(`Stderr: ${err.stderr}`);
      }
      throw err;
    }
  }

  /**
   * Get gain rate for the status bar (called from extension.ts).
   */
  public async getGainRate(): Promise<{ rate: number; saved: number } | null> {
    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const gain = await execLeanCtxJson(["gain", "--json"], workspacePath);
      if (gain?.summary) {
        return {
          rate: gain.summary.gain_rate_pct || 0,
          saved: gain.summary.tokens_saved || 0,
        };
      }
    } catch {}
    return null;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "webview", "dashboard.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "webview", "dashboard.js")
    );
    const fontUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "fonts", "inter-latin-400-normal.woff2")
    );

    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "src",
      "webview",
      "dashboard.html"
    );
    let htmlContent = "";
    if (fs.existsSync(htmlPath)) {
      htmlContent = fs.readFileSync(htmlPath, "utf8");
      htmlContent = htmlContent.replace("${cssUri}", cssUri.toString());
      htmlContent = htmlContent.replace("${jsUri}", jsUri.toString());
      htmlContent = htmlContent.replace("${fontUri}", fontUri.toString());
    } else {
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <p>HTML Dashboard source file not found.</p>
        </body>
        </html>
      `;
    }

    return htmlContent;
  }
}
