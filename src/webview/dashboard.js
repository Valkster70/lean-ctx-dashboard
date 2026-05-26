(function () {
  const vscode = acquireVsCodeApi();

  // Spend Tab State
  let activeSpendTab = "tools";
  let lastCostData = { tools: {}, agents: {} };

  // Tab switching
  const tabs = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");

      if (targetId === "tab-stats" || targetId === "tab-gotchas" || targetId === "tab-doctor") {
        vscode.postMessage({ type: "refresh" });
      }
    });
  });

  // Spend tabs switcher
  const spendTabTools = document.getElementById("spend-tab-tools");
  const spendTabAgents = document.getElementById("spend-tab-agents");
  if (spendTabTools && spendTabAgents) {
    spendTabTools.addEventListener("click", () => {
      activeSpendTab = "tools";
      spendTabTools.classList.add("active");
      spendTabAgents.classList.remove("active");
      renderCostBreakdown();
    });
    spendTabAgents.addEventListener("click", () => {
      activeSpendTab = "agents";
      spendTabAgents.classList.add("active");
      spendTabTools.classList.remove("active");
      renderCostBreakdown();
    });
  }

  // Controls UI handlers
  const strategyData = {
    auto: {
      savings: "40% - 70% saved",
      desc: "Dynamically analyzes request context size, project structure, and file type to automatically select the most optimal compression strategy.",
      bestFor: "General development and multi-file changes where context demands fluctuate.",
      preview: "[ Prompt Request ]\\n       ↓\\n[ Auto-selection Agent ]\\n  ↙   ↓   ↘\\n[map] [diff] [signatures] (selects best mode)"
    },
    full: {
      savings: "0% saved",
      desc: "Sends the entire file content verbatim. No compression is applied, meaning the agent receives the complete context including all details.",
      bestFor: "Small files or when the agent needs full context to write implementation details.",
      preview: "┌──────────────────────────┐\\n│ // Full File Content     │\\n│ class User { ... }       │\\n│ function process() { ... }│\\n└──────────────────────────┘"
    },
    map: {
      savings: "70% - 90% saved",
      desc: "Builds a semantic dependency map of the file, listing parent/child imports, class signatures, and referenced modules without method bodies.",
      bestFor: "Initial codebase exploration, tracing dependencies, and high-level architectural planning.",
      preview: "class UserService {\\n  ├── UserRepo (Dependency)\\n  ├── EmailService (Dependency)\\n  └── getUserProfile(id) -> User\\n}"
    },
    signatures: {
      savings: "60% - 80% saved",
      desc: "Uses tree-sitter AST parsing to strip away function and method bodies, keeping only class interfaces, method names, parameters, and type signatures.",
      bestFor: "Learning file APIs, calling public methods, and referencing type definitions.",
      preview: "class AuthManager {\\n  constructor(config);\\n  login(username, password): Promise<Session>;\\n  logout(sessionId): void;\\n}"
    },
    task: {
      savings: "50% - 80% saved",
      desc: "Filters file content based on the active task description, keeping only the lines of code directly related to the task context and omitting unrelated functions.",
      bestFor: "Targeted refactoring and editing large files with localized changes.",
      preview: "[ Active Task: Reset password ]\\n...\\n[ Lines 140-155: resetPassword() ] <Keep>\\n...\\n[ Lines 200-250: auditLog() ] <Stripped>"
    },
    aggressive: {
      savings: "50% - 70% saved",
      desc: "Strips out all documentation comments, inline comments, blank lines, and unnecessary syntax keywords to compress the text footprint of the code.",
      bestFor: "Maximizing context space when working with highly-commented libraries or legacy code.",
      preview: "// Comment (Stripped)\\n- function add(a, b) {\\n-   // Add two numbers (Stripped)\\n-   return a + b;\\n- }\\n+ function add(a,b){return a+b;}"
    },
    entropy: {
      savings: "40% - 60% saved",
      desc: "Analyzes the information entropy (Shannon entropy) of code blocks. It removes repetitive boilerplate/repetitive sequences and keeps high-information logic.",
      bestFor: "Working with highly repetitive boilerplate, data structures, or config files.",
      preview: "[ Boilerplate Get/Set ]  →  (Stripped)\\n[ Complex Logic ]        →  <Retained>\\n[ Data Declarations ]    →  (Compressed)"
    },
    diff: {
      savings: "85% - 98% saved",
      desc: "Presents only the modified lines and minimal surrounding git diff context. Unchanged portions of the file are omitted completely.",
      bestFor: "Reviewing code changes, writing unit tests for modified logic, and incremental edits.",
      preview: "@@ -12,4 +12,4 @@\\n class User {\\n-  isAdmin = false;\\n+  role = 'user';\\n }"
    }
  };

  function updateStrategyExplainer(mode) {
    const explainer = document.getElementById("strategy-explainer");
    const badge = document.getElementById("explainer-badge");
    const savings = document.getElementById("explainer-savings");
    const desc = document.getElementById("explainer-desc");
    const bestFor = document.getElementById("explainer-best-for");
    const preview = document.getElementById("explainer-preview");

    if (!explainer || !badge || !savings || !desc || !bestFor || !preview) return;

    const data = strategyData[mode];
    if (!data) {
      explainer.style.display = "none";
      return;
    }

    badge.textContent = mode;
    savings.textContent = data.savings;
    desc.textContent = data.desc;
    bestFor.textContent = data.bestFor;
    preview.textContent = data.preview;
    explainer.style.display = "block";
  }

  const readModeSelect = document.getElementById("read-mode-select");
  readModeSelect.addEventListener("change", (e) => {
    const mode = e.target.value;
    vscode.postMessage({
      type: "setReadMode",
      mode: mode,
    });
    updateStrategyExplainer(mode);
  });

  const btnCompress = document.getElementById("btn-compress");
  btnCompress.addEventListener("click", () => {
    vscode.postMessage({
      type: "runCLI",
      command: "compress",
    });
  });

  const btnLaunchWeb = document.getElementById("btn-launch-web");
  const headerBtnLaunchWeb = document.getElementById("header-btn-launch-web");
  const launchAction = () => {
    vscode.postMessage({
      type: "launchWebDashboard",
    });
  };
  if (btnLaunchWeb) btnLaunchWeb.addEventListener("click", launchAction);
  if (headerBtnLaunchWeb) headerBtnLaunchWeb.addEventListener("click", launchAction);

  const btnSetTask = document.getElementById("btn-set-task");
  const taskInput = document.getElementById("task-input");
  btnSetTask.addEventListener("click", () => {
    const task = taskInput.value.trim();
    if (!task) return;
    vscode.postMessage({
      type: "runCLI",
      command: `session task "${task}"`,
    });
    taskInput.value = "";
  });

  // Activity Feed UI handlers
  const btnRefreshActivity = document.getElementById("btn-refresh-activity");
  if (btnRefreshActivity) {
    btnRefreshActivity.addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });
  }

  // Gotchas UI handlers
  const btnRefreshGotchas = document.getElementById("btn-refresh-gotchas");
  btnRefreshGotchas.addEventListener("click", () => {
    vscode.postMessage({ type: "refresh" });
  });

  const gotchasListElement = document.getElementById("gotchas-list");
  if (gotchasListElement) {
    gotchasListElement.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".delete-fact-btn");
      if (deleteBtn) {
        const category = deleteBtn.getAttribute("data-category");
        const key = deleteBtn.getAttribute("data-key");
        if (category && key) {
          vscode.postMessage({
            type: "removeKnowledge",
            category,
            key
          });
        }
      }
    });
  }

  const btnClearTaskStats = document.getElementById("btn-clear-task-stats");
  if (btnClearTaskStats) {
    btnClearTaskStats.addEventListener("click", () => {
      vscode.postMessage({ type: "clearTask" });
    });
  }

  const btnSaveFact = document.getElementById("btn-save-fact");
  const newFactVal = document.getElementById("new-fact-val");
  const newFactCategory = document.getElementById("new-fact-category");
  const newFactKey = document.getElementById("new-fact-key");

  btnSaveFact.addEventListener("click", () => {
    const val = newFactVal.value.trim();
    const cat = newFactCategory.value.trim() || "general";
    const key = newFactKey.value.trim() || "fact-" + Date.now();

    if (!val) return;

    vscode.postMessage({
      type: "runCLI",
      command: `knowledge remember "${val}" --category ${cat} --key ${key}`,
    });

    newFactVal.value = "";
    newFactCategory.value = "";
    newFactKey.value = "";
  });

  // Doctor UI handlers
  const btnDoctor = document.getElementById("btn-doctor");
  btnDoctor.addEventListener("click", () => {
    vscode.postMessage({
      type: "runCLI",
      command: "doctor",
    });
  });

  const btnDoctorFix = document.getElementById("btn-doctor-fix");
  btnDoctorFix.addEventListener("click", () => {
    vscode.postMessage({
      type: "runCLI",
      command: "doctor --fix",
    });
  });

  // Helper: animate progress ring
  function setProgress(percent) {
    const ringFill = document.getElementById("savings-ring-fill");
    if (!ringFill) return;
    const radius = ringFill.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;

    ringFill.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - (percent / 100) * circumference;
    ringFill.style.strokeDashoffset = offset;
  }

  // Helper: format numbers with K/M suffixes
  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toLocaleString();
  }

  // Helper: format USD
  function formatUsd(amount) {
    if (amount >= 1) return "$" + amount.toFixed(2);
    if (amount >= 0.01) return "$" + amount.toFixed(3);
    if (amount > 0) return "$" + amount.toFixed(4);
    return "$0.00";
  }

  // Render daily activity chart
  function renderDailyChart(daily) {
    const container = document.getElementById("daily-chart");
    if (!daily || daily.length === 0) {
      container.innerHTML = '<div class="empty-list-item">No daily data yet.</div>';
      return;
    }

    // Show last 7 days
    const recent = daily.slice(-7);
    const maxTokens = Math.max(...recent.map((d) => d.output_tokens || d.commands || 1));

    let html = '<div class="daily-bars">';
    for (const day of recent) {
      const tokens = day.output_tokens || day.commands || 0;
      const heightPct = maxTokens > 0 ? Math.max(4, (tokens / maxTokens) * 100) : 4;
      const date = day.date || "";
      const shortDate = date.slice(5); // "MM-DD"
      const cmds = day.commands || 0;
      const saved = day.input_tokens || 0;

      html += `
        <div class="daily-bar-group" title="${date}: ${cmds} commands, ${saved} input tokens">
          <div class="daily-bar" style="height: ${heightPct}%"></div>
          <span class="daily-label">${shortDate}</span>
        </div>
      `;
    }
    html += "</div>";
    container.innerHTML = html;
  }

  // Render doctor checks
  function renderDoctorChecks(checks) {
    const list = document.getElementById("doctor-checks-list");
    if (!checks || checks.length === 0) {
      list.innerHTML = `
        <li class="check-item">
          <span class="status-icon">⚠️</span>
          <div class="check-details">
            <span class="check-title">No doctor data</span>
            <span class="check-desc">Click "Run Diagnosis" to check health.</span>
          </div>
        </li>
      `;
      return;
    }

    let html = "";
    for (const check of checks) {
      const icon =
        check.status === "pass" ? "✅" :
        check.status === "warn" ? "⚠️" :
        check.status === "fail" ? "❌" : "⏳";

      html += `
        <li class="check-item">
          <span class="status-icon">${icon}</span>
          <div class="check-details">
            <span class="check-title">${escapeHtml(check.name)}</span>
            <span class="check-desc">${escapeHtml(check.desc)}</span>
          </div>
        </li>
      `;
    }
    list.innerHTML = html;
  }

  function renderIntegrations(mcpTargets, rulesTargets) {
    const card = document.getElementById("integrations-card");
    const grid = document.getElementById("integrations-grid");
    if (!card || !grid) return;

    if ((!mcpTargets || mcpTargets.length === 0) && (!rulesTargets || rulesTargets.length === 0)) {
      card.style.display = "none";
      return;
    }

    card.style.display = "block";
    grid.innerHTML = "";

    const items = [];
    if (mcpTargets) {
      mcpTargets.forEach(t => {
        items.push({
          name: t.name,
          type: "MCP Tool",
          state: t.state,
          isMcp: true
        });
      });
    }
    if (rulesTargets) {
      rulesTargets.forEach(t => {
        items.push({
          name: t.name,
          type: "Rules Hook",
          state: t.state,
          isMcp: false
        });
      });
    }

    items.sort((a, b) => {
      const aConfigured = a.state === "configured" || a.state === "up_to_date";
      const bConfigured = b.state === "configured" || b.state === "up_to_date";
      if (aConfigured && !bConfigured) return -1;
      if (!aConfigured && bConfigured) return 1;
      return a.name.localeCompare(b.name);
    });

    items.forEach(item => {
      const isOk = item.state === "configured" || item.state === "up_to_date";
      const dotClass = isOk ? "status-dot ok" : "status-dot warn";
      const stateLabel = isOk ? (item.isMcp ? "Configured" : "Active") : "Not Hooked";
      
      const div = document.createElement("div");
      div.className = "integration-item";
      div.innerHTML = `
        <div class="integration-header">
          <span class="${dotClass}" title="${item.state}"></span>
          <span class="integration-name">${escapeHtml(item.name)}</span>
        </div>
        <div class="integration-meta">
          <span class="integration-type-badge">${escapeHtml(item.type)}</span>
          <span class="integration-state-label">${escapeHtml(stateLabel)}</span>
        </div>
      `;
      grid.appendChild(div);
    });
  }

  function renderActivityFeed(events) {
    const list = document.getElementById("activity-list");
    if (!list) return;

    if (!events || events.length === 0) {
      list.innerHTML = '<li class="empty-list-item">No recent activity detected.</li>';
      return;
    }

    let html = "";
    for (const ev of events) {
      const kind = ev.kind || {};
      const type = kind.type || "Unknown";
      const timestamp = ev.timestamp || "";
      const shortTime = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "";

      let icon = "⚡";
      let itemClass = "activity-item";
      let summary = "";
      let subtext = "";

      switch (type) {
        case "ToolCall":
          icon = "🛠️";
          itemClass += " tool-call";
          summary = `Called ${kind.tool || "tool"}`;
          subtext = `
            <span class="activity-badge">${kind.mode || "default"}</span>
            <span>Orig: ${formatNumber(kind.tokens_original || 0)}</span>
            <span>Saved: ${formatNumber(kind.tokens_saved || 0)}</span>
            ${kind.duration_ms ? `<span>${kind.duration_ms}ms</span>` : ""}
          `;
          break;

        case "Compression":
          icon = "🗜️";
          itemClass += " compression";
          const pathParts = (kind.path || "").split("/");
          const filename = pathParts[pathParts.length - 1] || "file";
          const linesRemoved = kind.removed_line_count || 0;
          summary = `Compressed ${filename}`;
          subtext = `
            <span class="activity-badge">${kind.strategy || "auto"}</span>
            <span>Removed ${linesRemoved} lines</span>
            <span>Lines: ${kind.before_lines || 0} → ${kind.after_lines || 0}</span>
          `;
          break;

        case "KnowledgeUpdate":
          icon = "🧠";
          itemClass += " knowledge";
          const actionWord = kind.action === "remember" ? "Learned" : kind.action || "Updated";
          summary = `${actionWord} ${kind.category || "fact"}:${kind.key || ""}`;
          subtext = `<span>Category: ${kind.category}</span>`;
          break;

        case "AgentAction":
          icon = "🤖";
          itemClass += " agent-action";
          const agentAct = kind.action || "action";
          summary = `Agent ${agentAct}`;
          subtext = `<span>ID: ${kind.agent_id ? kind.agent_id.substring(0, 10) + "..." : "unknown"}</span>`;
          break;

        default:
          summary = `Event: ${type}`;
          subtext = `<span>Details: ${JSON.stringify(kind)}</span>`;
          break;
      }

      html += `
        <li class="${itemClass}">
          <div class="activity-icon-wrapper">${icon}</div>
          <div class="activity-details">
            <div class="activity-summary">${escapeHtml(summary)}</div>
            <div class="activity-subtext">${subtext}</div>
          </div>
          <div class="activity-time">${shortTime}</div>
        </li>
      `;
    }
    list.innerHTML = html;
  }

  function renderCostBreakdown() {
    const list = document.getElementById("spend-list");
    const card = document.getElementById("spend-card");
    if (!list || !card) return;

    const hasTools = lastCostData.tools && Object.keys(lastCostData.tools).length > 0;
    const hasAgents = lastCostData.agents && Object.keys(lastCostData.agents).length > 0;

    if (!hasTools && !hasAgents) {
      card.style.display = "none";
      return;
    }

    card.style.display = "block";
    list.innerHTML = "";

    if (activeSpendTab === "tools") {
      const tools = Object.values(lastCostData.tools || {});
      if (tools.length === 0) {
        list.innerHTML = '<li class="empty-list-item">No tool spend recorded yet.</li>';
        return;
      }
      // Sort by cost descending, then name
      tools.sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0) || a.tool_name.localeCompare(b.tool_name));

      tools.forEach(t => {
        const li = document.createElement("li");
        li.className = "spend-item";
        const icon = "🛠️";
        const costStr = formatUsd(t.cost_usd || 0);
        const calls = t.total_calls || 0;
        const input = t.total_input_tokens || 0;
        const output = t.total_output_tokens || 0;
        const cached = t.total_cached_tokens || 0;

        li.innerHTML = `
          <div class="spend-icon-wrapper">${icon}</div>
          <div class="spend-details">
            <div class="spend-name" title="${escapeHtml(t.tool_name)}">${escapeHtml(t.tool_name)}</div>
            <div class="spend-subtext">
              <span class="spend-badge">${calls} calls</span>
              <span>In: ${formatNumber(input)}</span>
              <span>Out: ${formatNumber(output)}</span>
              ${cached > 0 ? `<span class="spend-badge">Cached: ${formatNumber(cached)}</span>` : ""}
            </div>
          </div>
          <div class="spend-cost">${costStr}</div>
        `;
        list.appendChild(li);
      });
    } else {
      const agents = Object.values(lastCostData.agents || {});
      if (agents.length === 0) {
        list.innerHTML = '<li class="empty-list-item">No agent spend recorded yet.</li>';
        return;
      }
      // Sort by cost descending
      agents.sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0));

      agents.forEach(ag => {
        const li = document.createElement("li");
        li.className = "spend-item";
        const icon = "🤖";
        const costStr = formatUsd(ag.cost_usd || 0);
        const model = ag.model_key || ag.pricing_match || "Unknown Model";
        const calls = ag.total_calls || 0;
        const input = ag.total_input_tokens || 0;
        const output = ag.total_output_tokens || 0;

        // Simplify long agent IDs
        let shortId = ag.agent_id || "Agent";
        if (shortId.startsWith("mcp-")) {
          const parts = shortId.split("-");
          if (parts.length >= 3) {
            shortId = `${parts[0]}-${parts[1]}`;
          }
        }

        li.innerHTML = `
          <div class="spend-icon-wrapper">${icon}</div>
          <div class="spend-details">
            <div class="spend-name" title="${escapeHtml(ag.agent_id)}">${escapeHtml(shortId)}</div>
            <div class="spend-subtext">
              <span class="spend-badge" title="${escapeHtml(model)}">${escapeHtml(model)}</span>
              <span>Calls: ${calls}</span>
              <span>Tokens: ${formatNumber(input + output)}</span>
            </div>
          </div>
          <div class="spend-cost">${costStr}</div>
        `;
        list.appendChild(li);
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // Receive messages from extension host
  window.addEventListener("message", (event) => {
    const msg = event.data;

    switch (msg.type) {
      case "updateStats": {
        const gain = msg.gainSummary || {};
        const session = msg.session || {};
        const mcpLive = msg.mcpLive || {};
        const daily = msg.daily || [];
        const gotchas = msg.gotchas || [];
        const doctorChecks = msg.doctorChecks || [];
        const isActive = msg.isActive;
        const version = msg.version || "";
        const sessionTaskDescription = msg.sessionTaskDescription || "";
        const mcpTargets = msg.mcpTargets || [];
        const rulesTargets = msg.rulesTargets || [];
        const knowledgeFacts = msg.knowledgeFacts || [];

        // --- Header ---
        const badge = document.getElementById("status-badge");
        if (isActive) {
          badge.textContent = "Active";
          badge.className = "status-badge active";
        } else {
          badge.textContent = "Inactive";
          badge.className = "status-badge inactive";
        }

        const versionBadge = document.getElementById("version-badge");
        if (version) {
          versionBadge.textContent = "v" + version;
        }

        // --- Active Task Focus ---
        const taskCard = document.getElementById("task-card");
        const taskDescVal = document.getElementById("task-desc-val");
        if (taskCard && taskDescVal) {
          if (sessionTaskDescription) {
            taskDescVal.textContent = sessionTaskDescription;
            taskCard.style.display = "block";
          } else {
            taskCard.style.display = "none";
          }
        }

        // --- Read mode ---
        const currentMode = msg.currentMode || "auto";
        readModeSelect.value = currentMode;
        updateStrategyExplainer(currentMode);

        // --- Savings ring (from gain data) ---
        const gainPct = Math.round(gain.gainRatePct || 0);
        document.getElementById("savings-pct").textContent = `${gainPct}%`;
        setProgress(gainPct);

        // --- CEP Score ---
        const cepScore = mcpLive.cepScore || gain.score?.total || 0;
        const cepEl = document.getElementById("cep-score");
        cepEl.textContent = cepScore > 0 ? cepScore + "/100" : "—";

        // --- ROI ---
        const roiEl = document.getElementById("roi-value");
        const roi = gain.roi || 0;
        roiEl.textContent = roi > 0 ? roi.toFixed(1) + "x" : "—";

        // --- Metric cards ---
        document.getElementById("val-saved-tokens").textContent = formatNumber(gain.tokensSaved || 0);
        document.getElementById("val-saved-usd").textContent = formatUsd(gain.avoidedUsd || 0);

        // Cache hits: combine session + MCP live data
        const totalCacheHits = (session.cacheHits || 0) + (mcpLive.cacheUtilization || 0);
        document.getElementById("val-cache-hits").textContent = formatNumber(totalCacheHits);

        document.getElementById("val-total-cmds").textContent = formatNumber(gain.totalCommands || 0);

        // --- Session info ---
        document.getElementById("session-files").textContent = session.filesRead || 0;
        document.getElementById("session-tools").textContent = session.toolCalls || 0;
        document.getElementById("session-cmds").textContent = session.commandsRun || 0;
        document.getElementById("session-reads").textContent = mcpLive.totalReads || 0;

        // --- Daily chart ---
        renderDailyChart(daily);

        // --- Gotchas & Knowledge list ---
        const gotchasList = document.getElementById("gotchas-list");
        gotchasList.innerHTML = "";
        if (knowledgeFacts.length === 0 && gotchas.length === 0) {
          gotchasList.innerHTML = '<li class="empty-list-item">No gotchas or recorded lessons yet.</li>';
        } else {
          // Render manual facts with delete buttons
          knowledgeFacts.forEach((fact) => {
            const li = document.createElement("li");
            li.className = "knowledge-item";
            li.innerHTML = `
              <div class="knowledge-header">
                <div>
                  <span class="category-badge">[${escapeHtml(fact.category)}]</span>
                  <span class="key-label">${escapeHtml(fact.key)}</span>
                </div>
                <button class="delete-fact-btn" data-category="${escapeHtml(fact.category)}" data-key="${escapeHtml(fact.key)}" title="Forget Fact">🗑️</button>
              </div>
              <div class="knowledge-value">${escapeHtml(fact.value)}</div>
            `;
            gotchasList.appendChild(li);
          });

          // Render auto-detected gotchas
          gotchas.forEach((gotcha) => {
            const li = document.createElement("li");
            li.className = "auto-gotcha-item";
            li.innerHTML = `
              <div class="knowledge-header">
                <div>
                  <span class="category-badge auto">[auto]</span>
                  <span class="key-label">Gotcha</span>
                </div>
              </div>
              <div class="knowledge-value">${escapeHtml(gotcha)}</div>
            `;
            gotchasList.appendChild(li);
          });
        }

        // --- Doctor checks & Integrations Grid ---
        renderDoctorChecks(doctorChecks);
        renderIntegrations(mcpTargets, rulesTargets);

        // --- Live Activity Feed ---
        const activityEvents = msg.activityEvents || [];
        renderActivityFeed(activityEvents);

        // --- Cost & Spend Breakdown ---
        lastCostData = msg.costAttribution || { tools: {}, agents: {} };
        renderCostBreakdown();

        break;
      }

      case "error":
        console.error("lean-ctx webview error:", msg.message);
        break;
    }
  });

  // Initial load request
  vscode.postMessage({ type: "refresh" });
})();
