import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import * as util from "util";

const execPromise = util.promisify(exec);

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
    await execPromise("lean-ctx --version", options);
    cachedCommand = "lean-ctx";
    return cachedCommand;
  } catch (err: any) {
    outputChannel.appendLine(`[Info] "lean-ctx --version" failed on default PATH: ${err.message || err}`);
    if (process.platform === "win32" && process.env.APPDATA) {
      const globalNpmCmd = path.join(process.env.APPDATA, "npm", "lean-ctx.cmd");
      if (fs.existsSync(globalNpmCmd)) {
        cachedCommand = `"${globalNpmCmd}"`;
        outputChannel.appendLine(`[Info] Found global lean-ctxCmd path: ${cachedCommand}`);
        return cachedCommand;
      }
      const globalNpm = path.join(process.env.APPDATA, "npm", "lean-ctx");
      if (fs.existsSync(globalNpm)) {
        cachedCommand = `"${globalNpm}"`;
        outputChannel.appendLine(`[Info] Found global lean-ctx path: ${cachedCommand}`);
        return cachedCommand;
      }
    }
    outputChannel.appendLine(`[Warning] Could not find lean-ctx globally. Falling back to "lean-ctx".`);
    cachedCommand = "lean-ctx";
    return cachedCommand;
  }
}

/**
 * Safely execute a lean-ctx CLI command and parse JSON output.
 * Returns null on any error (command not found, non-zero exit, bad JSON).
 */
async function execLeanCtxJson(command: string, cwd?: string): Promise<any | null> {
  const baseCmd = await getLeanCtxCommand();
  const fullCommand = `${baseCmd} ${command}`;
  try {
    const options = getExecOptions(10000, cwd);
    const { stdout } = await execPromise(fullCommand, options);
    return JSON.parse(stdout.toString());
  } catch (err: any) {
    outputChannel.appendLine(`[Error] execLeanCtxJson failed for: "${fullCommand}"`);
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
          this.refreshStats();
          break;
        case "setReadMode":
          await this.setReadMode(data.mode);
          break;
        case "runCLI":
          await this.executeCLICommand(data.command);
          break;
        case "removeKnowledge":
          await this.removeKnowledge(data.category, data.key);
          break;
        case "clearTask":
          await this.clearTask();
          break;
      }
    });

    // Initial load of stats
    this.refreshStats();
  }

  public async refreshStats() {
    if (!this._view) return;

    try {
      const dataDir = getDataDir();
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      // Gather all data sources in parallel for speed
      const [stats, mcpLive, costAttribution, gain, tokenReport, statusData, knowledgeData] =
        await Promise.all([
          // File reads (fast, no process spawn)
          readJsonFile(path.join(dataDir, "stats.json")),
          readJsonFile(path.join(dataDir, "mcp-live.json")),
          readJsonFile(path.join(dataDir, "cost_attribution.json")),
          // CLI commands (slower, but give authoritative data)
          execLeanCtxJson("gain --json", workspacePath),
          execLeanCtxJson("token-report --json", workspacePath),
          execLeanCtxJson("status --json", workspacePath),
          execLeanCtxJson("knowledge export --format json", workspacePath),
        ]);

      // Extract version from status or token-report
      const version = statusData?.version || tokenReport?.version || "";

      // Extract current mode from status
      let currentMode = "auto";
      if (statusData) {
        // status --json returns the full status report; mode might be nested
        // The setup_report and session info are inside. We look for mode in the session or top level.
        currentMode = statusData.mode || statusData.read_mode || "auto";
      }

      // Determine active/inactive status
      let isActive = false;
      if (statusData) {
        // If we got a response from status --json, lean-ctx is installed and working
        isActive = true;
      }

      // Extract gain summary (the key data source for savings)
      const gainSummary = gain?.summary || {};

      // Extract session from token-report
      const session = tokenReport?.session || {};

      // Extract CEP data from token-report or stats
      const cep = tokenReport?.cep || stats?.cep || {};

      // Extract active task from session file
      let sessionTaskDescription = "";
      try {
        const latestSessionInfo = await readJsonFile(path.join(dataDir, "sessions", "latest.json"));
        if (latestSessionInfo && latestSessionInfo.id) {
          const sessionData = await readJsonFile(path.join(dataDir, "sessions", `${latestSessionInfo.id}.json`));
          sessionTaskDescription = sessionData?.task?.description || "";
        }
      } catch (err) {
        outputChannel.appendLine(`[Warning] Failed to read session file: ${err}`);
      }

      // Extract targets from status report
      const mcpTargets = statusData?.mcp_targets || [];
      const rulesTargets = statusData?.rules_targets || [];

      // Fetch gotchas (text output, not JSON)
      let gotchas: string[] = [];
      try {
        const baseCmd = await getLeanCtxCommand();
        const fullCommand = `${baseCmd} gotchas list`;
        const options = getExecOptions(5000, workspacePath);
        const { stdout } = await execPromise(fullCommand, options);
        gotchas = stdout.toString()
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

      // Parse doctor results into structured checks
      const doctorChecks = this._parseDoctorResults(statusData);

      // Send the complete data payload to webview
      this._view.webview.postMessage({
        type: "updateStats",
        version,
        isActive,
        currentMode,
        sessionTaskDescription,
        mcpTargets,
        rulesTargets,
        knowledgeFacts: knowledgeData?.facts || [],
        // Gain data (primary source for savings metrics)
        gainSummary: {
          tokensSaved: gainSummary.tokens_saved || 0,
          gainRatePct: gainSummary.gain_rate_pct || 0,
          avoidedUsd: gainSummary.avoided_usd || 0,
          totalCommands: gainSummary.total_commands || stats?.total_commands || 0,
          toolSpendUsd: gainSummary.tool_spend_usd || 0,
          roi: gainSummary.roi || 0,
          score: gainSummary.score || {},
        },
        // Session data
        session: {
          id: session.id || "",
          startedAt: session.started_at || "",
          toolCalls: session.tool_calls || 0,
          tokensSaved: session.tokens_saved || 0,
          cacheHits: session.cache_hits || 0,
          filesRead: session.files_read || 0,
          commandsRun: session.commands_run || 0,
        },
        // CEP scores
        cep: {
          sessions: cep.sessions || 0,
          totalCacheHits: cep.total_cache_hits || 0,
          totalCacheReads: cep.total_cache_reads || 0,
          tokensOriginal: cep.total_tokens_original || 0,
          tokensCompressed: cep.total_tokens_compressed || 0,
        },
        // MCP live data
        mcpLive: {
          cepScore: mcpLive?.cep_score || 0,
          cacheUtilization: mcpLive?.cache_utilization || 0,
          compressionRate: mcpLive?.compression_rate || 0,
          filesCached: mcpLive?.files_cached || 0,
          totalReads: mcpLive?.total_reads || 0,
          toolCalls: mcpLive?.tool_calls || 0,
        },
        // Daily breakdown from stats
        daily: stats?.daily || [],
        // Cost attribution
        costUsd: costAttribution?.tools
          ? Object.values(costAttribution.tools as Record<string, any>).reduce(
              (sum: number, t: any) => sum + (t.cost_usd || 0),
              0
            )
          : 0,
        // Gotchas
        gotchas,
        // Doctor checks
        doctorChecks,
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
    try {
      await this.runCLICommand(`config --set read_mode=${mode}`);
      vscode.window.showInformationMessage(`lean-ctx read mode set to: ${mode}`);
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to set read mode: ${error.message || error}`
      );
    }
  }

  private async executeCLICommand(command: string) {
    try {
      await this.runCLICommand(command);
      vscode.window.showInformationMessage(
        `lean-ctx command executed: ${command}`
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
      await this.runCLICommand(`knowledge remove --category ${category} --key ${key}`);
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
      await this.runCLICommand("session reset");
      vscode.window.showInformationMessage(`lean-ctx session/task reset.`);
      this.refreshStats();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to clear task: ${error.message || error}`
      );
    }
  }

  public async runCLICommand(command: string): Promise<string> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const baseCmd = await getLeanCtxCommand();
    const fullCommand = `${baseCmd} ${command}`;
    try {
      const options = getExecOptions(15000, workspacePath);
      const { stdout } = await execPromise(fullCommand, options);
      return stdout.toString();
    } catch (err: any) {
      outputChannel.appendLine(`[Error] runCLICommand failed for: "${fullCommand}"`);
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
      const gain = await execLeanCtxJson("gain --json", workspacePath);
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
