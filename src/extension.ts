import * as vscode from "vscode";
import { LeanCtxDashboardProvider } from "./dashboardProvider";

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log("lean-ctx dashboard extension is now active!");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "lean-ctx.showDashboard";
  context.subscriptions.push(statusBarItem);

  // Register the sidebar webview dashboard provider
  const dashboardProvider = new LeanCtxDashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "lean-ctx.sidebar",
      dashboardProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("lean-ctx.showDashboard", () => {
      vscode.commands.executeCommand("workbench.view.extension.lean-ctx");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("lean-ctx.compress", async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "lean-ctx: Compressing context...",
          cancellable: false,
        },
        async () => {
          try {
            await dashboardProvider.runCLICommand("compress");
            vscode.window.showInformationMessage(
              "Workspace context successfully compressed!"
            );
            dashboardProvider.refreshStats();
          } catch (error: any) {
            vscode.window.showErrorMessage(
              `Compression failed: ${error.message || error}`
            );
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("lean-ctx.runDoctor", async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "lean-ctx: Running diagnostics...",
          cancellable: false,
        },
        async () => {
          try {
            const result = await dashboardProvider.runCLICommand("doctor");
            vscode.window.showInformationMessage(
              "Diagnostics passed! No errors detected."
            );
            console.log(result);
          } catch (error: any) {
            vscode.window.showWarningMessage(
              `Diagnostics found issues: ${error.message || error}`
            );
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("lean-ctx.runDoctorFix", async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "lean-ctx: Running auto-repair...",
          cancellable: false,
        },
        async () => {
          try {
            await dashboardProvider.runCLICommand("doctor --fix");
            vscode.window.showInformationMessage(
              "Auto-repair completed successfully!"
            );
            dashboardProvider.refreshStats();
          } catch (error: any) {
            vscode.window.showErrorMessage(
              `Auto-repair failed: ${error.message || error}`
            );
          }
        }
      );
    })
  );

  // Set up periodic stats refresh
  updateStatusBar(dashboardProvider);
  const statsTimer = setInterval(() => {
    updateStatusBar(dashboardProvider);
    dashboardProvider.refreshStats();
  }, 15000);

  context.subscriptions.push({
    dispose: () => clearInterval(statsTimer),
  });
}

async function updateStatusBar(provider: LeanCtxDashboardProvider) {
  try {
    const gainData = await provider.getGainRate();
    if (gainData) {
      const rate = Math.round(gainData.rate);
      if (rate > 0) {
        statusBarItem.text = `$(zap) lean-ctx: ${rate}% saved`;
        statusBarItem.tooltip = `lean-ctx context optimization is active.\nTokens saved: ${gainData.saved.toLocaleString()}\nGain rate: ${gainData.rate.toFixed(1)}%`;
      } else {
        statusBarItem.text = `$(zap) lean-ctx: Active`;
        statusBarItem.tooltip = `lean-ctx is active. No savings recorded yet.\nStart using your AI agent to see savings.`;
      }
    } else {
      statusBarItem.text = "$(warning) lean-ctx: Off";
      statusBarItem.tooltip =
        "lean-ctx is not responding. Check that it's installed:\n  npm install -g lean-ctx-bin\n  lean-ctx setup";
    }
    statusBarItem.show();
  } catch {
    statusBarItem.text = "$(warning) lean-ctx: Off";
    statusBarItem.tooltip = "lean-ctx is not available.";
    statusBarItem.show();
  }
}

export function deactivate() {}
