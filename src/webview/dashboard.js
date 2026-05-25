(function () {
  const vscode = acquireVsCodeApi();

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

  // Controls UI handlers
  const readModeSelect = document.getElementById("read-mode-select");
  readModeSelect.addEventListener("change", (e) => {
    vscode.postMessage({
      type: "setReadMode",
      mode: e.target.value,
    });
  });

  const btnCompress = document.getElementById("btn-compress");
  btnCompress.addEventListener("click", () => {
    vscode.postMessage({
      type: "runCLI",
      command: "compress",
    });
  });

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
