// ---- State ----
var TOKEN = getToken();
var currentUser = null;
var currentAction = null;

// ---- Guard ----
(function () {
  currentUser = checkAuth("admin");
  if (!currentUser) return;
  refreshExportCount();
})();

// ---- Clock ----
function updateClock() {
  var now = new Date();
  document.getElementById("top-time").textContent = now.toLocaleTimeString(
    "en-IN",
    { hour: "2-digit", minute: "2-digit", second: "2-digit" },
  );
}
updateClock();
setInterval(updateClock, 1000);

// ---- Nav ----
var PAGE_NAMES = [
  "overview",
  "usergrid",
  "data",
  "backup",
  "undo",
  "maintenance",
  "settings",
  "security",
  "advanced",
];
function nav(page) {
  document.querySelectorAll(".pg").forEach(function (el) {
    el.classList.remove("act");
  });
  var pg = document.getElementById("pg-" + page);
  if (pg) pg.classList.add("act");
  document.querySelectorAll(".sb-item").forEach(function (el) {
    el.classList.remove("act");
  });
  var idx = PAGE_NAMES.indexOf(page);
  var items = document.querySelectorAll(".sb-item");
  if (idx >= 0 && items[idx]) items[idx].classList.add("act");
  if (page === "overview") {
    loadOverview();
    loadHealth();
  }
  if (page === "data") refreshExportCount();
  if (page === "backup") loadBackupPage();
  if (page === "undo") loadUndoPage();
  if (page === "maintenance") loadMaintenance();
  if (page === "settings") loadAllSettings();
  if (page === "security") loadAllSettings();
}

// ---- Overview ----
function loadOverview() {
  // Show maintenance banner from DB
  apiCall("GET", "/settings/maintenance")
    .then(function (maint) {
      var banner = document.getElementById("maint-banner");
      if (banner) {
        if (maint && maint.active) banner.classList.remove("hidden");
        else banner.classList.add("hidden");
      }
    })
    .catch(function () {});
  var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
  var h = { Authorization: "Bearer " + tok };
  // Fetch real DB stats from server
  if (!tok) {
    var descNoTok = document.getElementById("ov-storage-desc");
    if (descNoTok) descNoTok.textContent = "Not logged in via API — please log out and log back in.";
    logLine("No auth token — log out and log in again to use API features", "warn");
    return;
  }
  fetch("/api/system/dbstats", { headers: h })
    .then(function (r) {
      if (r.status === 401)
        throw new Error("Unauthorized  — token invalid or expired");
      return r.json();
    })
    .then(function (d) {
      if (d.error) {
        logLine("DB stats error: " + d.error, "danger");
        var descErr = document.getElementById("ov-storage-desc");
        if (descErr) descErr.textContent = "Error: " + d.error;
        return;
      }
      // Top cards (optional - only present in some layouts)
      var oDs = document.getElementById("ov-data-size");
      if (oDs) oDs.textContent = (d.dataSize || "—") + " MB";
      var oSs = document.getElementById("ov-storage-size");
      if (oSs) oSs.textContent = (d.storageSize || "—") + " MB";
      var oIs = document.getElementById("ov-index-size");
      if (oIs) oIs.textContent = (d.indexSize || "—") + " MB";
      var oTd = document.getElementById("ov-total-docs");
      if (oTd) oTd.textContent = d.totalDocs || "—";
      // Storage bar (optional - only present in some layouts)
      var bar = document.getElementById("ov-storage-bar");
      var desc = document.getElementById("ov-storage-desc");
      var usedLbl = document.getElementById("ov-used-label");
      var freeLbl = document.getElementById("ov-free-label");
      var totalLbl = document.getElementById("ov-total-label");
      if (bar) {
        var used = parseFloat(d.storageSize);
        var total = d.fsTotalSize ? parseFloat(d.fsTotalSize) : null;
        var free = total ? total - parseFloat(d.fsUsedSize || used) : null;
        var pct = total
          ? Math.min(100, (parseFloat(d.fsUsedSize || used) / total) * 100).toFixed(1)
          : null;
        if (total) {
          bar.style.width = pct + "%";
          bar.style.background =
            pct > 80
              ? "linear-gradient(90deg,#dc2626,#ef4444)"
              : pct > 60
                ? "linear-gradient(90deg,#d97706,#fbbf24)"
                : "linear-gradient(90deg,#2e7d32,#66bb6a)";
          if (desc) desc.textContent = "Disk: " + pct + "% used of " + total + " MB total";
          if (usedLbl) usedLbl.textContent = "Used: " + parseFloat(d.fsUsedSize).toFixed(0) + " MB";
          if (freeLbl) freeLbl.textContent = "Free: " + free.toFixed(0) + " MB";
          if (totalLbl) totalLbl.textContent = "Total: " + total + " MB";
        } else {
          // Atlas free tier — show data size vs 512MB limit
          var limit = 512;
          var usedMB = parseFloat(d.storageSize);
          var pctUsed = Math.min(100, (usedMB / limit) * 100).toFixed(1);
          bar.style.width = pctUsed + "%";
          bar.style.background =
            pctUsed > 80
              ? "linear-gradient(90deg,#dc2626,#ef4444)"
              : pctUsed > 60
                ? "linear-gradient(90deg,#d97706,#fbbf24)"
                : "linear-gradient(90deg,#2e7d32,#66bb6a)";
          if (desc) desc.textContent = "Atlas Free Tier — " + pctUsed + "% of 512 MB used";
          if (usedLbl) usedLbl.textContent = "Used: " + usedMB.toFixed(2) + " MB";
          if (freeLbl) freeLbl.textContent = "Free: " + (limit - usedMB).toFixed(2) + " MB";
          if (totalLbl) totalLbl.textContent = "Total: " + limit + " MB (Atlas Free Tier)";
        }
      }
      // Collection breakdown grid
      var grid = document.getElementById("collection-grid");
      if (grid && d.collStats) {
        grid.innerHTML = d.collStats
          .map(function (c) {
            return (
              '<div style="background:#f8fafc;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px;">' +
              '<div><div style="font-size:11px;color:var(--tmu);font-weight:600;text-transform:capitalize;">' +
              c.name +
              "</div>" +
              '<div style="font-size:20px;font-weight:800;color:var(--td);">' +
              c.count +
              "</div></div></div>"
            );
          })
          .join("");
      }
      logLine(
        "DB stats loaded  — " +
          d.totalDocs +
          " docs, " +
          d.dataSize +
          " MB data",
        "success",
      );
    })
    .catch(function (err) {
      logLine(
        "Failed to load DB stats: " + (err.message || "network error"),
        "danger",
      );
      var descCatch = document.getElementById("ov-storage-desc");
      if (descCatch) descCatch.textContent = "Could not fetch storage info — check server connection";
    });
}
// ---- Log terminal ----
function logLine(msg, type) {
  type = type || "info";
  var el = document.getElementById("sys-log");
  if (!el) return;
  var line = document.createElement("div");
  line.className = "terminal-line " + type;
  var ts = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  line.innerHTML = '<span class="terminal-prompt">[' + ts + "]</span> " + msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
// ---- Settings ----
// ---- MAINTENANCE (fully DB-backed) ----
var _maintData = null;
function loadMaintenance() {
  // Reset UI to loading state
  document.getElementById("ms-active-val").textContent = "Fetching…";
  document.getElementById("ms-active-val").style.color = "var(--tdi)";
  document.getElementById("ms-roles-val").textContent = "…";
  document.getElementById("ms-end-val").textContent = "…";
  document.getElementById("ms-started-val").textContent = "…";
  document.getElementById("ms-msg-val").textContent = "…";
  var tb = document.getElementById("maint-toggle-main-btn");
  tb.disabled = true;
  tb.textContent = "Loading…";
  document.getElementById("maint-log-list").innerHTML =
    '<div style="text-align:center;padding:20px;color:var(--tdi);font-size:13px;">⏱️ Loading logs from database…</div>';
  apiCall("GET", "/settings/maintenance")
    .then(function (d) {
      if (!d || d.error) {
        showToast("⚠️ " + (d && d.error ? d.error : "Load failed"));
        return;
      }
      _maintData = d;
      renderMaintUI(d);
      // Start expiry polling if already active with an end time
      if (d.active && d.endTime) {
        if (Date.now() >= new Date(d.endTime).getTime()) {
          showExpiryDialog(); // already expired — show immediately
        } else {
          startExpiryPolling();
        }
      }
    })
    .catch(function (e) {
      showToast("❌ Failed to load: " + e.message);
      document.getElementById("ms-active-val").textContent = "Error";
      document.getElementById("ms-active-val").style.color = "#dc2626";
      tb.textContent = "Retry";
      tb.disabled = false;
    });
  loadMaintLogs();
  loadServerLogs();
}
function renderMaintUI(d) {
  if (!d) return;
  var isActive = !!d.active;
  var affected = d.affectedRoles || [];
  // — — Status Banner
  var banner = document.getElementById("maint-status-banner");
  var bannerIcon = document.getElementById("maint-banner-icon");
  var bannerTitle = document.getElementById("maint-banner-title");
  var bannerSub = document.getElementById("maint-banner-sub");
  var toggleBtn = document.getElementById("maint-toggle-main-btn");
  toggleBtn.disabled = false;
  if (isActive) {
    banner.style.background = "linear-gradient(135deg,#fff3cd,#fff8e1)";
    banner.style.borderColor = "#f59e0b";
    bannerIcon.textContent = "🛠️";
    bannerTitle.textContent = "Maintenance Mode is ACTIVE";
    var rLabels = affectedRoleLabels(affected);
    bannerSub.textContent =
      (rLabels.length
        ? rLabels.join(", ") + " are blocked."
        : "No roles blocked.") + " Admins retain full access.";
    toggleBtn.textContent = "ℹ️ Disable Maintenance";
    toggleBtn.style.background = "#dc2626";
    toggleBtn.style.color = "#fff";
    var tb = document.getElementById("maint-banner");
    if (tb) tb.classList.remove("hidden");
  } else {
    banner.style.background = "linear-gradient(135deg,#f0fdf4,#ecfdf5)";
    banner.style.borderColor = "#4ade80";
    bannerIcon.textContent = "🛠️";
    bannerTitle.textContent = "System is Online  — All users can log in";
    bannerSub.textContent =
      "Configure roles, end time and message below, then enable.";
    toggleBtn.textContent = "⚠️ Enable Maintenance";
    toggleBtn.style.background = "#f59e0b";
    toggleBtn.style.color = "#fff";
    var tb2 = document.getElementById("maint-banner");
    if (tb2) tb2.classList.add("hidden");
  }
  // — — Form fields
  ["teacher", "student", "subadmin"].forEach(function (r) {
    var cb = document.getElementById("maint-role-" + r);
    if (cb) cb.checked = affected.includes(r);
    updateRoleChip(r);
  });
  // End time — convert UTC — local datetime-local value
  if (d.endTime) {
    var dt = new Date(d.endTime);
    document.getElementById("maint-end-time").value = new Date(
      dt.getTime() - dt.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    document.getElementById("maint-end-time").style.borderColor = "#e2e8f0";
  } else {
    document.getElementById("maint-end-time").value = "";
  }
  document.getElementById("maint-msg").value = d.message || "";
  // — — State card
  var activeEl = document.getElementById("ms-active-val");
  activeEl.textContent = isActive ? "⚠️ ENABLED" : "⚠️ Disabled";
  activeEl.style.color = isActive ? "#dc2626" : "#16a34a";
  var rLabels2 = affectedRoleLabels(affected);
  document.getElementById("ms-roles-val").textContent = rLabels2.length
    ? rLabels2.join(", ")
    : "None selected";
  document.getElementById("ms-end-val").textContent = d.endTime
    ? fmtDateTime(d.endTime)
    : "⚠️ Not set";
  document.getElementById("ms-started-val").textContent = d.startedAt
    ? fmtDateTime(d.startedAt)
    : isActive
      ? "Now"
      : "ℹ️ ";
  document.getElementById("ms-msg-val").textContent = d.message || "ℹ️ ";
  // — — Role access table
  renderRoleTable(isActive, affected);
}
function affectedRoleLabels(affected) {
  var map = {
    teacher: "Teachers",
    student: "Students",
    subadmin: "Sub-Admins",
  };
  return (affected || []).map(function (r) {
    return map[r] || r;
  });
}
function fmtDateTime(str) {
  try {
    return new Date(str).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
    });
  } catch (e) {
    return str;
  }
}
function updateRoleChip(role) {
  var cb = document.getElementById("maint-role-" + role);
  var lbl = document.getElementById("role-lbl-" + role);
  var chip = document.getElementById("role-chip-" + role);
  if (!cb || !lbl || !chip) return;
  if (cb.checked) {
    lbl.style.background = "#fff7ed";
    lbl.style.borderColor = "#f59e0b";
    chip.textContent = "Will be blocked";
    chip.style.background = "#fef3c7";
    chip.style.color = "#92400e";
  } else {
    lbl.style.background = "#f8fafc";
    lbl.style.borderColor = "#e2e8f0";
    chip.textContent = "Not blocked";
    chip.style.background = "#f3f4f6";
    chip.style.color = "#6b7280";
  }
}
function getSelectedRoles() {
  return ["teacher", "student", "subadmin"].filter(function (r) {
    var cb = document.getElementById("maint-role-" + r);
    return cb && cb.checked;
  });
}
function saveMaintConfig() {
  var roles = getSelectedRoles();
  var msg = (document.getElementById("maint-msg").value || "").trim();
  var endVal = document.getElementById("maint-end-time").value;
  var endEl = document.getElementById("maint-end-time");
  // Validate required fields
  if (!msg) {
    showToast("⚠️ Message is required.");
    return;
  }
  if (!endVal) {
    endEl.style.borderColor = "#dc2626";
    showToast("⚠️ End date & time is required  — shown as countdown to users.");
    endEl.focus();
    return;
  }
  endEl.style.borderColor = "#e2e8f0";
  var endISO = new Date(endVal).toISOString();
  var payload = {
    value: {
      active: _maintData ? !!_maintData.active : false,
      message: msg,
      affectedRoles: roles,
      endTime: endISO,
      startedAt:
        _maintData && _maintData.startedAt ? _maintData.startedAt : null,
    },
  };
  apiCall("PUT", "/settings/maintenance", { value: payload })
    .then(function (d) {
      if (d && d.error) {
        showToast("❌ " + d.error);
        return;
      }
      _maintData = d;
      renderMaintUI(d);
      showToast("✅ Configuration saved to database");
      logLine(
        "Maintenance config saved  — roles: [" +
          roles.join(", ") +
          "] end: " +
          fmtDateTime(endISO),
        "success",
      );
      loadMaintLogs();
    })
    .catch(function (e) {
      showToast("❌ Save failed: " + e.message);
    });
}
function doToggleMaintenance() {
  if (!_maintData) {
    showToast("⚠️ Settings not loaded yet.");
    return;
  }
  var roles = getSelectedRoles();
  var msg =
    (document.getElementById("maint-msg").value || "").trim() ||
    "System is under maintenance. Please try again later.";
  var endVal = document.getElementById("maint-end-time").value;
  var endEl = document.getElementById("maint-end-time");
  var nowActive = !_maintData.active;
  // Validate before enabling
  if (nowActive) {
    if (roles.length === 0) {
      showToast("⚠️ Select at least one role to block.");
      return;
    }
    if (!endVal) {
      endEl.style.borderColor = "#dc2626";
      showToast(
        "⚠️ End date & time is required to show countdown on maintenance page.",
      );
      endEl.focus();
      return;
    }
  }
  endEl.style.borderColor = "#e2e8f0";
  var endISO = endVal ? new Date(endVal).toISOString() : null;
  var payload = {
    value: {
      active: nowActive,
      message: msg,
      affectedRoles: roles,
      endTime: endISO,
      startedAt: nowActive ? new Date().toISOString() : null,
    },
  };
  var toggleBtn = document.getElementById("maint-toggle-main-btn");
  toggleBtn.disabled = true;
  toggleBtn.textContent = nowActive ? "Enabling…" : "Disabling…";
  apiCall("PUT", "/settings/maintenance", { value: payload })
    .then(function (d) {
      if (d && d.error) {
        showToast("❌ " + d.error);
        toggleBtn.disabled = false;
        return;
      }
      _maintData = d;
      renderMaintUI(d);
      var msg2 = nowActive
        ? "⚠️ Maintenance ENABLED  — " +
          affectedRoleLabels(roles).join(", ") +
          " redirected to maintenance page"
        : "✅ Maintenance DISABLED  — All users can now log in";
      showToast(msg2);
      logLine(
        nowActive ? "MAINTENANCE ENABLED" : "MAINTENANCE DISABLED",
        nowActive ? "warn" : "success",
      );
      loadMaintLogs();
      loadServerLogs();
      // Start expiry polling when enabled; stop when disabled
      if (nowActive && d.endTime) {
        startExpiryPolling();
      } else if (!nowActive && _expiryPollInterval) {
        clearInterval(_expiryPollInterval);
        _expiryPollInterval = null;
        document.getElementById("maint-expiry-modal").classList.remove("open");
      }
    })
    .catch(function (e) {
      showToast("❌ Toggle failed: " + e.message);
      toggleBtn.disabled = false;
    });
}
function setMaintPreset(hours) {
  var end = new Date(Date.now() + hours * 3600000);
  document.getElementById("maint-end-time").value = new Date(
    end.getTime() - end.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  document.getElementById("maint-end-time").style.borderColor = "#e2e8f0";
  showToast("⏱️ End time set: +" + hours + " hr" + (hours > 1 ? "s" : ""));
}
function selectAllRoles() {
  ["teacher", "student", "subadmin"].forEach(function (r) {
    var cb = document.getElementById("maint-role-" + r);
    if (cb) cb.checked = true;
    updateRoleChip(r);
  });
}
function clearAllRoles() {
  ["teacher", "student", "subadmin"].forEach(function (r) {
    var cb = document.getElementById("maint-role-" + r);
    if (cb) cb.checked = false;
    updateRoleChip(r);
  });
}
function teachersOnly() {
  clearAllRoles();
  var cb = document.getElementById("maint-role-teacher");
  if (cb) cb.checked = true;
  updateRoleChip("teacher");
}
function studentsOnly() {
  clearAllRoles();
  var cb = document.getElementById("maint-role-student");
  if (cb) cb.checked = true;
  updateRoleChip("student");
}
function renderRoleTable(maintActive, affected) {
  affected = affected || [];
  // When maintenance is OFF nobody is blocked regardless of checkbox state
  var roles = [
    {
      role: "Admin",
      icon: "🛠️",
      blocked: false,
      note: "Always has full access",
    },
    {
      role: "Teacher",
      icon: "🧑‍🏫",
      blocked: maintActive && affected.includes("teacher"),
      note:
        maintActive && affected.includes("teacher")
          ? "Blocked  — shown maintenance page"
          : "Full access",
    },
    {
      role: "Student",
      icon: "🎓",
      blocked: maintActive && affected.includes("student"),
      note:
        maintActive && affected.includes("student")
          ? "Blocked  — shown maintenance page"
          : "Full access",
    },
    {
      role: "Sub-Admin",
      icon: "⚠️ — =+",
      blocked: maintActive && affected.includes("subadmin"),
      note:
        maintActive && affected.includes("subadmin")
          ? "Blocked  — shown maintenance page"
          : "Full access",
    },
  ];
  document.getElementById("role-access-table").innerHTML = roles
    .map(function (r) {
      var color = r.blocked ? "#dc2626" : "#16a34a";
      var bg = r.blocked ? "#fef2f2" : "#f0fdf4";
      var status = r.blocked ? "⚠️ Blocked" : "ℹ️ OK";
      return (
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:' +
        bg +
        ';border-radius:10px;">' +
        '<div style="display:flex;align-items:center;gap:9px;">' +
        '<span style="font-size:17px;">' +
        r.icon +
        "</span>" +
        '<div><div style="font-weight:600;font-size:12.5px;color:' +
        color +
        ';">' +
        r.role +
        "</div>" +
        '<div style="font-size:10.5px;color:var(--tmu);">' +
        r.note +
        "</div></div></div>" +
        '<span style="font-size:11.5px;font-weight:700;color:' +
        color +
        ';">' +
        status +
        "</span>" +
        "</div>"
      );
    })
    .join("");
}
// ---- — — Maintenance Activity Log (from DB) ----
function loadMaintLogs() {
  var el = document.getElementById("maint-log-list");
  el.innerHTML =
    '<div style="text-align:center;padding:16px;color:var(--tdi);font-size:12px;">⏱️ Loading from database…</div>';
  apiCall("GET", "/logs?category=maintenance&limit=50")
    .then(function (res) {
      var logs = (res && res.logs) || [];
      if (!logs || !logs.length) {
        el.innerHTML =
          '<div style="text-align:center;padding:24px;color:var(--tdi);font-size:13px;">⚠️ No maintenance events logged yet. Enable/disable maintenance to create logs.</div>';
        return;
      }
      el.innerHTML = logs
        .map(function (l) {
          var isEnable = l.action && l.action.toLowerCase().includes("enabl");
          var isDisable = l.action && l.action.toLowerCase().includes("disabl");
          var dotColor = isEnable
            ? "#f59e0b"
            : isDisable
              ? "#22c55e"
              : "#3b82f6";
          var sev = l.severity || "info";
          var sevColor =
            sev === "warning"
              ? "#f59e0b"
              : sev === "critical"
                ? "#dc2626"
                : "#16a34a";
          return (
            '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--brl);">' +
            '<div style="width:8px;height:8px;border-radius:50%;background:' +
            dotColor +
            ';flex-shrink:0;margin-top:5px;"></div>' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12.5px;font-weight:700;color:var(--td);">' +
            (l.action || "ℹ️ ") +
            "</div>" +
            '<div style="font-size:11px;color:var(--tmu);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            (l.userName || "") +
            (l.details ? " - " + l.details : "") +
            "</div></div>" +
            '<div style="font-size:10px;color:var(--tdi);white-space:nowrap;padding-top:2px;">' +
            fmtDateTime(l.time) +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    })
    .catch(function (e) {
      el.innerHTML =
        '<div style="padding:16px;color:#dc2626;font-size:12px;"> — Failed to load logs: ' +
        e.message +
        "</div>";
    });
}
// ---- — — Server Logs (live Node.js output) ----
var _srvLogPollInterval = null;
var _srvLogSince = null;
function loadServerLogs() {
  var url =
    "/api/system/serverlogs" +
    (_srvLogSince ? "?since=" + encodeURIComponent(_srvLogSince) : "");
  apiCall("GET", url)
    .then(function (d) {
      if (!d) return;
      // Update meta
      document.getElementById("srv-uptime").textContent = formatUptime(
        d.uptime,
      );
      document.getElementById("srv-mem").textContent = d.memMB + " MB";
      document.getElementById("srv-node").textContent = d.nodeVersion || "ℹ️ ";
      document.getElementById("srv-env").textContent = d.env || "ℹ️ ";
      if (d.logs && d.logs.length) {
        var terminal = document.getElementById("srv-log-terminal");
        var wasBottom =
          terminal.scrollHeight - terminal.scrollTop <=
          terminal.clientHeight + 20;
        // Append new lines
        var frag = d.logs
          .map(function (l) {
            var cls =
              l.level === "error"
                ? "danger"
                : l.level === "warn"
                  ? "warn"
                  : "success";
            // Colour specific patterns
            if (
              l.text.includes("✅ ") ||
              l.text.includes("connected") ||
              l.text.includes("seeded")
            )
              cls = "success";
            if (
              l.text.includes("❌ ") ||
              l.text.includes("error") ||
              l.text.includes("Error")
            )
              cls = "danger";
            if (
              l.text.includes("⚠️") ||
              l.text.includes("warn") ||
              l.text.includes("MAINT")
            )
              cls = "warn";
            if (l.text.includes("🛠️") || l.text.includes("ℹ️")) cls = "info";
            var ts = new Date(l.time).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            return (
              '<div class="terminal-line ' +
              cls +
              '"><span class="terminal-prompt">[' +
              ts +
              "]</span>" +
              escHtml(l.text) +
              "</div>"
            );
          })
          .join("");
        // On first load, replace; on poll, append
        if (!_srvLogSince) {
          terminal.innerHTML =
            frag || '<div class="terminal-line info">No logs yet.</div>';
        } else {
          terminal.insertAdjacentHTML("beforeend", frag);
          // Keep max 300 lines in DOM
          var lines = terminal.querySelectorAll(".terminal-line");
          if (lines.length > 300)
            for (var i = 0; i < lines.length - 300; i++) lines[i].remove();
        }
        // Track since timestamp
        _srvLogSince = d.logs[d.logs.length - 1].time;
        // Auto-scroll if was at bottom
        if (wasBottom) terminal.scrollTop = terminal.scrollHeight;
      }
    })
    .catch(function (e) {
      if (!_srvLogSince) {
        document.getElementById("srv-log-terminal").innerHTML =
          '<div class="terminal-line danger">Failed to load server logs: ' +
          e.message +
          "</div>";
      }
    });
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function formatUptime(secs) {
  if (!secs) return "ℹ️ ";
  var h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60),
    s = secs % 60;
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + s + "s";
  return s + "s";
}
function toggleServerLogPoll() {
  var btn = document.getElementById("srvlog-poll-btn");
  if (_srvLogPollInterval) {
    clearInterval(_srvLogPollInterval);
    _srvLogPollInterval = null;
    btn.textContent = "ℹ️ Auto";
    btn.style.background = "";
    showToast("Auto-refresh stopped");
  } else {
    _srvLogPollInterval = setInterval(loadServerLogs, 3000);
    btn.textContent = "G+ Stop";
    btn.style.background = "#fef3c7";
    showToast("Auto-refresh every 3s");
    loadServerLogs();
  }
}

// ---- Maintenance Expiry Polling ----
var _expiryPollInterval = null;
var _expiryDialogDismissed = false;
function dismissExpiryDialog() {
  _expiryDialogDismissed = true;
  document.getElementById("maint-expiry-modal").classList.remove("open");
  showToast("⚠️ Dismissed  — maintenance still active");
}
function extendMaintenance(hours) {
  if (!_maintData) return;
  var newEnd = new Date(Date.now() + hours * 3600000).toISOString();
  var payload = {
    value: {
      active: true,
      message: _maintData.message || "",
      affectedRoles: _maintData.affectedRoles || [],
      endTime: newEnd,
      startedAt: _maintData.startedAt || new Date().toISOString(),
    },
  };
  apiCall("PUT", "/settings/maintenance", { value: payload })
    .then(function (d) {
      if (d && d.error) {
        showToast("❌ " + d.error);
        return;
      }
      _maintData = d;
      renderMaintUI(d);
      document.getElementById("maint-expiry-modal").classList.remove("open");
      showToast(
        "⏱️ Extended +" +
          hours +
          " hr" +
          (hours > 1 ? "s" : "") +
          "  — ends " +
          fmtDateTime(newEnd),
      );
      logLine(
        "Maintenance EXTENDED +" +
          hours +
          "h  — new end: " +
          fmtDateTime(newEnd),
        "warn",
      );
      loadMaintLogs();
      startExpiryPolling(); // restart for the new end time
    })
    .catch(function (e) {
      showToast("❌ Extend failed: " + e.message);
    });
}
function disableMaintenanceFromExpiry() {
  if (!_maintData) return;
  var payload = {
    value: {
      active: false,
      message: _maintData.message || "",
      affectedRoles: _maintData.affectedRoles || [],
      endTime: null,
      startedAt: null,
    },
  };
  apiCall("PUT", "/settings/maintenance", { value: payload })
    .then(function (d) {
      if (d && d.error) {
        showToast("❌ " + d.error);
        return;
      }
      _maintData = d;
      renderMaintUI(d);
      document.getElementById("maint-expiry-modal").classList.remove("open");
      showToast("✅ Maintenance DISABLED  — System is back online");
      logLine("Maintenance DISABLED after expiry", "success");
      loadMaintLogs();
    })
    .catch(function (e) {
      showToast("ℹ️ " + e.message);
    });
}
// Legacy stubs
function toggleMaintenance() {
  doToggleMaintenance();
}
function saveMaintMsg() {
  saveMaintConfig();
}
function updateMaintLabel() {}
function clearMaintEndTime() {
  document.getElementById("maint-end-time").value = "";
  document.getElementById("maint-end-time").style.borderColor = "#e2e8f0";
}

// ---- Toggle label sync ----
function syncLabel(checkbox, labelId) {
  var lbl = document.getElementById(labelId);
  lbl.textContent = checkbox.checked ? "ON" : "OFF";
  lbl.className = "toggle-state " + (checkbox.checked ? "on" : "off");
}
// Wire security toggles
["sec-forcepw", "sec-strongpw", "sec-timeout"].forEach(function (id) {
  var el = document.getElementById(id);
  if (el)
    el.addEventListener("change", function () {
      syncLabel(this, id + "-label");
    });
});

// ---- Save settings (writes to MongoDB) ----
function saveSettings(section) {
  var payload = {};
  if (section === "institution") {
    payload = {
      name: document.getElementById("inst-name").value,
      short: document.getElementById("inst-short").value,
      addr: document.getElementById("inst-addr").value,
      email: document.getElementById("inst-email").value,
      phone: document.getElementById("inst-phone").value,
    };
  } else if (section === "academic") {
    payload = {
      year: document.getElementById("acad-year").value,
      sem: document.getElementById("acad-sem").value,
      start: document.getElementById("acad-start").value,
      end: document.getElementById("acad-end").value,
      minAtt: document.getElementById("acad-minatt").value,
      wdays: document.getElementById("acad-wdays").value,
    };
  } else if (section === "security") {
    payload = {
      forcePw: document.getElementById("sec-forcepw").checked,
      strongPw: document.getElementById("sec-strongpw").checked,
      timeout: document.getElementById("sec-timeout").checked,
      timeoutMin: document.getElementById("sec-timeout-mins").value,
      maxLogin: document.getElementById("sec-maxlogin").value,
    };
  }
  showToast("⏱️ Saving to MongoDB…");
  apiCall("PUT", "/settings/" + section, { value: payload })
    .then(function (d) {
      if (d && d.error) {
        showToast("❌ Save failed: " + d.error);
        return;
      }
      logLine("Settings saved to DB: " + section, "success");
      showToast(
        "ℹ️ " +
          section.charAt(0).toUpperCase() +
          section.slice(1) +
          " settings saved to MongoDB",
      );
    })
    .catch(function (e) {
      showToast("❌ Network error  — settings NOT saved: " + (e.message || ""));
      logLine(
        "Settings save failed: " +
          section +
          "  — " +
          (e.message || "network error"),
        "danger",
      );
    });
}

// ---- Load settings (DB-backed) ----
function applySettingsToForm(s) {
  var inst = s.institution || {};
  var acad = s.academic || {};
  var sec = s.security || {};
  function val(id, v) {
    var el = document.getElementById(id);
    if (el && v !== undefined && v !== null && v !== "") el.value = v;
  }
  function chk(id, v) {
    var el = document.getElementById(id);
    if (el && v !== undefined) {
      el.checked = !!v;
      syncLabel(el, id + "-label");
    }
  }
  val("inst-name", inst.name);
  val("inst-short", inst.short);
  val("inst-addr", inst.addr);
  val("inst-email", inst.email);
  val("inst-phone", inst.phone);
  val("acad-year", acad.year);
  val("acad-sem", acad.sem);
  val("acad-start", acad.start);
  val("acad-end", acad.end);
  val("acad-minatt", acad.minAtt);
  val("acad-wdays", acad.wdays);
  chk("sec-forcepw", sec.forcePw);
  chk("sec-strongpw", sec.strongPw);
  chk("sec-timeout", sec.timeout);
  val("sec-timeout-mins", sec.timeoutMin);
  val("sec-maxlogin", sec.maxLogin);
}
function showLoadingOverlay(show) {
  var el = document.getElementById("page-loading-overlay");
  if (!el) return;
  if (show) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}
function loadAllSettings() {
  showLoadingOverlay(true);
  // Set placeholder text while loading
  [
    "inst-name",
    "inst-short",
    "inst-addr",
    "inst-email",
    "inst-phone",
    "acad-year",
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.placeholder = "Loading from DB…";
  });
  apiCall("GET", "/settings")
    .then(function (d) {
      if (d && !d.error) {
        applySettingsToForm(d);
        logLine("Settings loaded from MongoDB", "success");
      } else {
        logLine("Settings could not be loaded: " + (d && d.error ? d.error : "unknown error"), "danger");
        showToast("❌ Could not load settings from database");
      }
    })
    .catch(function (e) {
      logLine("Settings load failed: " + (e.message || "network error"), "danger");
      showToast("❌ Could not reach the server to load settings");
    })
    .finally(function () {
      showLoadingOverlay(false);
    });
}

// ---- Admin password reset ----
function resetAdminPassword() {
  var nw = document.getElementById("admin-pw-new").value.trim();
  var conf = document.getElementById("admin-pw-conf").value.trim();
  if (!nw || !conf) {
    showToast("⚠️ Please fill both fields", "warn");
    return;
  }
  if (nw.length < 6) {
    showToast("⚠️ Password must be at least 6 characters", "warn");
    return;
  }
  if (nw !== conf) {
    showToast("⚠️ Passwords do not match", "warn");
    return;
  }
  apiCall("POST", "/auth/change-password", {
    currentPassword: prompt("Enter your current admin password:"),
    newPassword: nw,
  })
    .then(function (d) {
      if (d.error) {
        showToast("❌ " + d.error, "danger");
        return;
      }
      document.getElementById("admin-pw-new").value = "";
      document.getElementById("admin-pw-conf").value = "";
      logLine("Admin password reset successfully", "success");
      showToast("✅ Admin password updated successfully");
    })
    .catch(function () {
      showToast("❌ Server error", "danger");
    });
}

// ---- Confirm modal ----
var ACTIONS = {
  teachers: {
    icon: "⚠️",
    title: "Delete All Teachers?",
    body: "This will permanently delete ALL teacher accounts and their subject assignments. Admin account is NOT affected.",
    btn: "Delete Teachers",
    cls: "btn-danger",
  },
  students: {
    icon: "⚠️",
    title: "Delete All Students?",
    body: "This will permanently delete ALL student records, their login accounts, and attendance data.",
    btn: "Delete Students",
    cls: "btn-danger",
  },
  attendance: {
    icon: "⚠️",
    title: "Clear Attendance?",
    body: "This will permanently delete ALL attendance records. Students and teachers are kept.",
    btn: "Clear Attendance",
    cls: "btn-warn",
  },
  logs: {
    icon: "⚠️",
    title: "Clear Activity Logs?",
    body: "This will permanently delete ALL system logs and login history.",
    btn: "Clear Logs",
    cls: "btn-warn",
  },
  clearall: {
    icon: "⚠️",
    title: "Clear Entire Database?",
    body: "This will wipe ALL data: students, teachers, departments, classes, subjects, attendance, notifications, and logs. Your admin account will be preserved. This is IRREVERSIBLE.",
    btn: "Wipe Database",
    cls: "btn-danger",
  },
  resetSettings: {
    icon: "⚠️",
    title: "Reset All Settings?",
    body: "All settings will be restored to factory defaults. Data is NOT affected.",
    btn: "Reset Settings",
    cls: "btn-warn",
  },
};
function openConfirm(action) {
  currentAction = action;
  var cfg = ACTIONS[action] || {};
  document.getElementById("m-icon").textContent = cfg.icon || "⚠️";
  document.getElementById("m-title").textContent = cfg.title || "Are you sure?";
  document.getElementById("m-body").textContent =
    cfg.body || "This cannot be undone.";
  document.getElementById("m-input").value = "";
  document.getElementById("m-progress").style.display = "none";
  var btn = document.getElementById("m-confirm-btn");
  btn.textContent = cfg.btn || "Confirm";
  btn.className = "btn " + (cfg.cls || "btn-danger");
  document.getElementById("confirm-modal").classList.add("open");
}
function closeConfirm() {
  document.getElementById("confirm-modal").classList.remove("open");
  currentAction = null;
}
function executeAction() {
  var input = document.getElementById("m-input").value.trim().toUpperCase();
  if (input !== "CONFIRM") {
    showToast("⚠️ Type CONFIRM to proceed", "warn");
    return;
  }
  document.getElementById("m-confirm-btn").disabled = true;
  showProgress("Processing…", 10);
  if (
    currentAction === "__custom__" &&
    typeof window._customConfirmFn === "function"
  ) {
    window._customConfirmFn();
    return;
  }
  if (currentAction === "resetSettings") {
    var defaults = {
      institution: { name: "", short: "", addr: "", email: "", phone: "" },
      academic: {
        year: "",
        sem: "I",
        start: "",
        end: "",
        minAtt: "75",
        wdays: "6",
      },
      security: {
        forcePw: true,
        strongPw: false,
        timeout: false,
        timeoutMin: "60",
        maxLogin: "5",
      },
    };
    showProgress("Resetting institution settings…", 20);
    apiCall("PUT", "/settings/institution", { value: defaults.institution })
      .then(function () {
        showProgress("Resetting academic settings…", 50);
        return apiCall("PUT", "/settings/academic", { value: defaults.academic });
      })
      .then(function () {
        showProgress("Resetting security settings…", 80);
        return apiCall("PUT", "/settings/security", { value: defaults.security });
      })
      .then(function () {
        applySettingsToForm(defaults);
        closeConfirm();
        logLine("All settings reset to factory defaults in MongoDB", "warn");
        showToast("✅ Settings reset to factory defaults");
      })
      .catch(function (e) {
        closeConfirm();
        showToast("❌ Reset failed: " + (e.message || "network error"));
      });
    return;
  }
  var steps = getDeleteSteps(currentAction);
  runSteps(steps, 0);
}
function getDeleteSteps(action) {
  if (action === "teachers") {
    return [
      {
        label: "Fetching teachers…",
        fn: function () {
          return apiCall("GET", "/teachers");
        },
      },
      {
        label: "Deleting teacher records…",
        fn: function () {
          // DELETE /teachers/:id cascades to remove the shadow user
          // account and that teacher's assignments server-side.
          return apiCall("GET", "/teachers").then(function (teachers) {
            return Promise.all(
              (teachers || []).map(function (t) {
                return apiCall("DELETE", "/teachers/" + t._id);
              }),
            );
          });
        },
      },
    ];
  }
  if (action === "students") {
    return [
      {
        label: "Fetching students…",
        fn: function () {
          return apiCall("GET", "/students");
        },
      },
      {
        label: "Deleting student records…",
        fn: function (prev) {
          return apiCall("GET", "/students").then(function (students) {
            return Promise.all(
              (students || []).map(function (s) {
                return apiCall("DELETE", "/students/" + s._id);
              }),
            );
          });
        },
      },
    ];
  }
  if (action === "attendance") {
    return [
      {
        label: "Fetching attendance records…",
        fn: function () {
          return apiCall("GET", "/attendance");
        },
      },
      {
        label: "Deleting attendance data…",
        fn: function () {
          return apiCall("GET", "/attendance").then(function (records) {
            return Promise.all(
              (records || []).map(function (r) {
                return fetch("/api/attendance/" + r._id, {
                  method: "DELETE",
                  headers: { Authorization: "Bearer " + TOKEN },
                }).then(function (x) {
                  return x.json();
                });
              }),
            );
          });
        },
      },
    ];
  }
  if (action === "logs") {
    return [
      {
        label: "Clearing logs from MongoDB…",
        fn: function () {
          return apiCall("DELETE", "/logs/all");
        },
      },
    ];
  }
  if (action === "clearall") {
    return [
      {
        label: "Removing all students…",
        fn: function () {
          return apiCall("GET", "/students").then(function (s) {
            return Promise.all(
              (s || []).map(function (x) {
                return apiCall("DELETE", "/students/" + x._id);
              }),
            );
          });
        },
      },
      {
        label: "Removing all teachers…",
        fn: function () {
          return apiCall("GET", "/teachers").then(function (t) {
            return Promise.all(
              (t || []).map(function (x) {
                return apiCall("DELETE", "/teachers/" + x._id);
              }),
            );
          });
        },
      },
      {
        label: "Removing all assignments…",
        fn: function () {
          return apiCall("GET", "/assignments").then(function (a) {
            return Promise.all(
              (a || []).map(function (x) {
                return apiCall("DELETE", "/assignments/" + x._id);
              }),
            );
          });
        },
      },
      {
        label: "Removing departments…",
        fn: function () {
          return apiCall("GET", "/depts").then(function (d) {
            return Promise.all(
              (d || []).map(function (x) {
                return apiCall("DELETE", "/depts/" + x._id);
              }),
            );
          });
        },
      },
      {
        label: "Removing classes…",
        fn: function () {
          return apiCall("GET", "/classes").then(function (c) {
            return Promise.all(
              (c || []).map(function (x) {
                return apiCall("DELETE", "/classes/" + x._id);
              }),
            );
          });
        },
      },
      {
        label: "Removing subjects…",
        fn: function () {
          return apiCall("GET", "/subjects").then(function (s) {
            return Promise.all(
              (s || []).map(function (x) {
                return apiCall("DELETE", "/subjects/" + x._id);
              }),
            );
          });
        },
      },
    ];
  }
  return [];
}
function runSteps(steps, idx) {
  // Server-side UndoLog snapshots are saved automatically by delete API endpoints.
  if (idx >= steps.length) {
    showProgress("Done!", 100);
    setTimeout(function () {
      closeConfirm();
      logLine(currentAction + " operation completed  — ", "success");
      showToast("✅ Operation completed successfully");
      loadOverview();
      document.getElementById("m-confirm-btn").disabled = false;
    }, 600);
    return;
  }
  var step = steps[idx];
  var pct = Math.round(((idx + 1) / steps.length) * 90);
  showProgress(step.label, pct);
  logLine(step.label, "info");
  step
    .fn()
    .then(function (result) {
      runSteps(steps, idx + 1);
    })
    .catch(function (err) {
      logLine(
        "Error: " + (err && err.message ? err.message : "Unknown error"),
        "danger",
      );
      showToast("❌ Error during operation. Check logs.", "danger");
      closeConfirm();
      document.getElementById("m-confirm-btn").disabled = false;
    });
}
function showProgress(label, pct) {
  document.getElementById("m-progress").style.display = "block";
  document.getElementById("m-progress-fill").style.width = pct + "%";
  document.getElementById("m-progress-label").textContent = label;
}
// ---- — — Export Data (secure, password-protected) ----
function refreshExportCount() {
  var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
  fetch("/api/students/count", { headers: { Authorization: "Bearer " + tok } })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      var el = document.getElementById("export-student-count");
      if (el)
        el.textContent =
          (d.count !== undefined ? d.count : "ℹ️ ") + " students";
    })
    .catch(function () {});
}
function exportDataSecure(type) {
  var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
  var resultBox = document.getElementById("export-result-box");
  var detailsEl = document.getElementById("export-result-details");
  var pwEl = document.getElementById("export-password-display");
  if (resultBox) resultBox.style.display = "none";
  showToast("⏱️ Preparing export…");
  fetch("/api/system/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tok,
    },
    body: JSON.stringify({ type: type }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d.error) {
        showToast("❌ Export failed: " + d.error, "danger");
        return;
      }
      var blob = new Blob([JSON.stringify(d.payload, null, 2)], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download =
        "eams_export_" +
        type +
        "_" +
        new Date().toISOString().split("T")[0] +
        ".json";
      a.click();
      URL.revokeObjectURL(url);
      if (resultBox) resultBox.style.display = "block";
      if (pwEl) pwEl.textContent = d.exportPassword || "ℹ️ ";
      if (detailsEl)
        detailsEl.textContent =
          "Type: " +
          type +
          "  |  Total students: " +
          d.totalStudents +
          "  |  Exported: " +
          new Date().toLocaleString("en-IN") +
          "  |  Password mailed to admin (wire exportMail() to activate).";
      logLine(
        "Export " + type + " done  — password: " + d.exportPassword,
        "success",
      );
      showToast("✅ Export ready  — check your downloads");
    })
    .catch(function (err) {
      showToast("❌ Export error: " + (err.message || "network"), "danger");
    });
}
// Legacy alias (keep in case anything still calls exportData)
function exportData(type) {
  exportDataSecure(type);
}

// ---- Server utilities ----
function pingServer() {
  var start = Date.now();
  fetch("/api/dashboard/summary", {
    headers: { Authorization: "Bearer " + TOKEN },
  })
    .then(function (r) {
      var ms = Date.now() - start;
      document.getElementById("ping-result").innerHTML =
        "⚠️ Server responded in <strong>" + ms + "ms</strong>";
      logLine("Ping: " + ms + "ms", "success");
    })
    .catch(function () {
      document.getElementById("ping-result").textContent =
        "⚠️ Server not responding";
      logLine("Ping failed  — server offline?", "danger");
    });
}
function checkDB() {
  apiCall("GET", "/dashboard/summary")
    .then(function (d) {
      if (d.students !== undefined) {
        document.getElementById("ping-result").textContent =
          "⚠️ MongoDB connected  — " +
          d.students +
          " students, " +
          d.teachers +
          " teachers";
        logLine("DB check: Connected  — ", "success");
      } else {
        document.getElementById("ping-result").textContent =
          "⚠️ DB response unexpected";
      }
    })
    .catch(function () {
      document.getElementById("ping-result").textContent =
        "⚠️ DB connection failed";
      logLine("DB check: Failed", "danger");
    });
}
// ---- Toast ----
// ---- — — Health stats (for Overview live strip) ----
function loadHealth() {
  var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
  var url =
    _errorsMode === "week"
      ? "/api/system/health?errMode=week"
      : "/api/system/health?errLimit=20";
  fetch(url, {
    headers: { Authorization: "Bearer " + tok },
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      var dbDot = document.getElementById("hc-db-dot");
      var dbVal = document.getElementById("hc-db-val");
      if (dbDot)
        dbDot.className = "health-dot " + (d.dbConnected ? "green" : "red");
      if (dbVal) dbVal.textContent = d.dbStatus || "ℹ️ ";
      var up = document.getElementById("hc-uptime");
      if (up) {
        var s = d.serverUptime || 0;
        up.textContent =
          (Math.floor(s / 3600) ? Math.floor(s / 3600) + "h " : "") +
          (Math.floor((s % 3600) / 60)
            ? Math.floor((s % 3600) / 60) + "m "
            : "") +
          (s % 60) +
          "s";
      }
      var errDot = document.getElementById("hc-err-dot");
      var errVal = document.getElementById("hc-err-val");
      if (errDot)
        errDot.className =
          "health-dot " +
          (d.errorCount > 0 ? "red" : d.warnCount > 0 ? "amber" : "green");
      if (errVal)
        errVal.textContent =
          d.errorCount + " errors / " + d.warnCount + " warnings";
      var mem = document.getElementById("hc-mem");
      if (mem) mem.textContent = d.memoryMB + " MB";
      // Recent errors card
      var card = document.getElementById("health-errors-card");
      var list = document.getElementById("health-errors-list");
      if (card && list && d.recentErrors && d.recentErrors.length) {
        var errList = d.recentErrors.slice();
        if (_errorsMode === "week") {
          var weekAgo = Date.now() - 7 * 86400 * 1000;
          var filtered = errList.filter(function (e) {
            return new Date(e.time).getTime() >= weekAgo;
          });
          if (filtered.length) errList = filtered;
        }
        card.style.display = "block";
        list.innerHTML = errList
          .sort(function (a, b) {
            return new Date(b.time) - new Date(a.time);
          })
          .map(function (e) {
            var col =
              e.severity === "critical"
                ? "#dc2626"
                : e.severity === "warning"
                  ? "#d97706"
                  : "#64748b";
            var dt = new Date(e.time);
            var day = dt.toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            var tim =
              String(dt.getHours()).padStart(2, "0") +
              ":" +
              String(dt.getMinutes()).padStart(2, "0") +
              ":" +
              String(dt.getSeconds()).padStart(2, "0");
            var meta =
              day +
              " " +
              tim +
              (e.userName ? " - " + e.userName : "") +
              (e.ip ? " - " + e.ip : "");
            return `
<div class="error-log" style="--log-color:${col}">
<span class="error-severity">[${e.severity.toUpperCase()}]</span>
<div class="error-content">
<div class="error-title">${e.action} — ${e.details}</div>
<div class="error-meta">${meta}</div>
</div>
<button class="error-delete" onclick="deleteSingleErrorLog('${e._id}', this)" title="Delete">✖</button>
</div>
`;
          })
          .join("");
      } else if (card) {
        card.style.display = "none";
      }
      logLine(
        "Health: DB=" +
          d.dbStatus +
          " Errors=" +
          d.errorCount +
          " Mem=" +
          d.memoryMB +
          "MB",
        "success",
      );
    })
    .catch(function (err) {
      var dbVal = document.getElementById("hc-db-val");
      if (dbVal) dbVal.textContent = "Unreachable";
      var dbDot = document.getElementById("hc-db-dot");
      if (dbDot) dbDot.className = "health-dot red";
      logLine(
        "Health check failed: " + (err.message || "network error"),
        "danger",
      );
    });
}

var _errorsMode = "week";
function setErrorsMode(mode) {
  _errorsMode = mode;
  var bWeek = document.getElementById("err-btn-week");
  var bN = document.getElementById("err-btn-n");
  if (bWeek) {
    bWeek.style.background = mode === "week" ? "var(--gD)" : "var(--gLt)";
    bWeek.style.color = mode === "week" ? "#fff" : "var(--gD)";
    bWeek.style.border = mode === "week" ? "none" : "1px solid var(--gLr)";
  }
  if (bN) {
    bN.style.background = mode === "n" ? "var(--gD)" : "var(--gLt)";
    bN.style.color = mode === "n" ? "#fff" : "var(--gD)";
    bN.style.border = mode === "n" ? "none" : "1px solid var(--gLr)";
  }
  loadHealth();
}

function deleteSingleErrorLog(id, btn) {
  if (!id) return;
  var row = btn ? btn.closest(".error-log") : null;
  if (row) row.style.opacity = "0.4";
  apiCall("DELETE", "/logs/" + id)
    .then(function () {
      if (row) row.remove();
      showToast("Log entry deleted");
      loadHealth();
    })
    .catch(function (err) {
      if (row) row.style.opacity = "1";
      showToast("Delete failed: " + (err.message || "error"));
    });
}
// ---- — — Clear all error/warning logs (from overview card) ----
function clearErrorLogs() {
  openConfirmEx({
    icon: "🛠️",
    title: "Clear All Error Logs?",
    body: "This will permanently delete all warning, error, and critical log entries. System and info logs are preserved.",
    btn: "Clear Logs",
    cls: "btn-danger",
    onConfirm: function () {
      showProgress("Fetching error log IDs…", 20);
      // Fetch all warning/critical/error logs then delete each by ID
      apiCall("GET", "/logs?severity=warning&limit=100")
        .then(function (warnRes) {
          return apiCall("GET", "/logs?severity=critical&limit=100").then(
            function (critRes) {
              return apiCall("GET", "/logs?severity=error&limit=100").then(
                function (errRes) {
                  var all = ((warnRes && warnRes.logs) || [])
                    .concat((critRes && critRes.logs) || [])
                    .concat((errRes && errRes.logs) || []);
                  showProgress("Deleting " + all.length + " log entries…", 40);
                  return Promise.all(
                    all.map(function (l) {
                      return apiCall("DELETE", "/logs/" + l._id);
                    }),
                  );
                },
              );
            },
          );
        })
        .then(function () {
          closeConfirm();
          logLine("All error/warning logs cleared", "warn");
          showToast("⚠️ Error logs cleared");
          loadHealth();
        })
        .catch(function (e) {
          closeConfirm();
          showToast("❌ Clear failed: " + (e.message || "network"));
        });
    },
  });
}
function deleteSingleErrorLog(id, btn) {
  if (btn) btn.disabled = true;
  apiCall("DELETE", "/logs/" + id)
    .then(function (d) {
      if (d && d.deleted) {
        showToast("⚠️ Log entry deleted");
        loadHealth();
      } else {
        showToast("❌ Delete failed");
        if (btn) btn.disabled = false;
      }
    })
    .catch(function () {
      showToast("❌ Delete failed");
      if (btn) btn.disabled = false;
    });
}
// Extended confirm — supports custom onConfirm callback
function openConfirmEx(cfg) {
  currentAction = "__custom__";
  window._customConfirmFn = cfg.onConfirm;
  document.getElementById("m-icon").textContent = cfg.icon || "⚠️";
  document.getElementById("m-title").textContent = cfg.title || "Are you sure?";
  document.getElementById("m-body").textContent =
    cfg.body || "This cannot be undone.";
  document.getElementById("m-input").value = "";
  document.getElementById("m-progress").style.display = "none";
  var btn = document.getElementById("m-confirm-btn");
  btn.textContent = cfg.btn || "Confirm";
  btn.className = "btn " + (cfg.cls || "btn-danger");
  btn.disabled = false;
  document.getElementById("confirm-modal").classList.add("open");
}

// ---- Backup page ----
function loadBackupPage() {
  var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
  fetch("/api/system/backup/history", {
    headers: { Authorization: "Bearer " + tok },
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (logs) {
      var list = document.getElementById("bk-history-list");
      if (!list) return;
      if (!logs.length) {
        list.innerHTML =
          '<div style="color:var(--tmu);font-size:13px;text-align:center;padding:20px 0;">No backup history yet.</div>';
        return;
      }
      var last = logs[0];
      var ld = document.getElementById("bk-last-date");
      if (ld) ld.textContent = new Date(last.time).toLocaleDateString("en-IN");
      var lb = document.getElementById("bk-last-by");
      if (lb) lb.textContent = last.userName || "ℹ️ ";
      var ldocs = document.getElementById("bk-last-docs");
      if (ldocs)
        ldocs.textContent = (last.details || "ℹ️ ").split(" docs")[0] || "ℹ️ ";
      list.innerHTML = logs
        .map(function (l) {
          return (
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">' +
            '<div><div style="font-weight:600;font-size:13px;color:var(--td);">⚠️ ' +
            (l.details || "Full backup") +
            "</div>" +
            '<div style="font-size:11px;color:var(--tmu);">' +
            new Date(l.time).toLocaleString("en-IN") +
            " - " +
            l.userName +
            "</div></div>" +
            '<span style="font-size:11px;font-weight:600;color:#16a34a;"> — Completed</span></div>'
          );
        })
        .join("");
    })
    .catch(function () {
      var list = document.getElementById("bk-history-list");
      if (list)
        list.innerHTML =
          '<div style="color:#dc2626;font-size:13px;text-align:center;padding:20px 0;">Failed to load history.</div>';
    });
}
function createBackup() {
  var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
  var btn = document.getElementById("bk-create-btn");
  var progWrap = document.getElementById("bk-progress-wrap");
  var progFill = document.getElementById("bk-progress-fill");
  var progLabel = document.getElementById("bk-progress-label");
  var resultBox = document.getElementById("bk-result-box");
  var resultDet = document.getElementById("bk-result-details");
  var pwEl = document.getElementById("bk-password-display");
  if (btn) btn.disabled = true;
  if (resultBox) resultBox.style.display = "none";
  if (progWrap) progWrap.style.display = "block";
  var pct = 0;
  var stages = [
    "Connecting to database…",
    "Fetching students…",
    "Fetching teachers…",
    "Fetching departments & classes…",
    "Fetching attendance records…",
    "Compressing payload…",
    "Uploading to Google Drive (stub)…",
    "Mailing password (stub)…",
  ];
  var fakeTimer = setInterval(function () {
    pct = Math.min(pct + 4, 85);
    if (progFill) progFill.style.width = pct + "%";
    if (progLabel)
      progLabel.textContent =
        stages[Math.min(Math.floor(pct / 12), stages.length - 1)];
  }, 400);
  fetch("/api/system/backup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tok,
    },
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      clearInterval(fakeTimer);
      if (progFill) progFill.style.width = "100%";
      if (d.error) {
        if (progLabel) progLabel.textContent = "Error: " + d.error;
        showToast("❌ Backup failed: " + d.error, "danger");
        if (btn) btn.disabled = false;
        return;
      }
      setTimeout(function () {
        if (progWrap) progWrap.style.display = "none";
        if (resultBox) resultBox.style.display = "block";
        if (pwEl) pwEl.textContent = d.backupPassword || "ℹ️ ";
        var cols = d.collections || {};
        if (resultDet)
          resultDet.innerHTML =
            "Total docs: <strong>" +
            d.totalDocs +
            "</strong>" +
            " | Students: " +
            cols.students +
            " | Teachers: " +
            cols.teachers +
            " | Departments: " +
            cols.departments +
            " | Classes: " +
            cols.classes +
            "<br><em>GDrive upload: wire uploadToGDrive() - Password mail: wire sendMail() to activate</em>";
        logLine(
          "Backup created  — " +
            d.totalDocs +
            " docs | pw: " +
            d.backupPassword,
          "success",
        );
        showToast("✅ Backup created  — " + d.totalDocs + " docs");
        loadBackupPage();
      }, 500);
      if (btn) btn.disabled = false;
    })
    .catch(function (err) {
      clearInterval(fakeTimer);
      if (progLabel) progLabel.textContent = "Backup failed  — check server";
      showToast("❌ Backup error: " + (err.message || "network"), "danger");
      if (btn) btn.disabled = false;
    });
}

// ---- Undo page ----
var _undoData = [];
var _undoFilter = "all";
function loadUndoPage() {
  var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
  var list = document.getElementById("undo-list");
  if (list)
    list.innerHTML =
      '<div style="color:var(--tmu);font-size:13px;text-align:center;padding:30px 0;">Loading…</div>';
  fetch("/api/undo", { headers: { Authorization: "Bearer " + tok } })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      _undoData = data || [];
      renderUndoList();
    })
    .catch(function () {
      if (list)
        list.innerHTML =
          '<div style="color:#dc2626;font-size:13px;text-align:center;padding:20px 0;">Failed to load undo entries.</div>';
    });
}
function filterUndo(col, btn) {
  _undoFilter = col;
  document.querySelectorAll(".undo-filter-btn").forEach(function (b) {
    b.classList.remove("act");
  });
  if (btn) btn.classList.add("act");
  renderUndoList();
}
function renderUndoList() {
  var list = document.getElementById("undo-list");
  if (!list) return;
  var items =
    _undoFilter === "all"
      ? _undoData
      : _undoData.filter(function (x) {
          return x.collectionName === _undoFilter;
        });
  if (!items.length) {
    list.innerHTML =
      '<div style="color:var(--tmu);font-size:13px;text-align:center;padding:30px 0;">No restorable deletions' +
      (_undoFilter !== "all" ? " for " + _undoFilter : "") +
      ".</div>";
    return;
  }
  var colIcons = {
    departments: "🧑‍🏫",
    classes: "🎓",
    subjects: "🛠️",
    students: "🎓",
    teachers: "🧑‍🏫",
  };
  var now = Date.now();
  list.innerHTML = items
    .map(function (e) {
      var daysLeft = Math.ceil(
        (new Date(e.expiresAt).getTime() - now) / 86400000,
      );
      var urgency =
        daysLeft <= 2 ? "#dc2626" : daysLeft <= 5 ? "#d97706" : "#16a34a";
      return (
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#fff;border-radius:10px;border:1.5px solid #e2e8f0;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '<span style="font-size:20px;">' +
        (colIcons[e.collectionName] || "🛠️") +
        "</span>" +
        '<div><div style="font-weight:600;font-size:13px;color:var(--td);">' +
        e.label +
        "</div>" +
        '<div style="font-size:11px;color:var(--tmu);">' +
        e.collectionName +
        " - deleted by " +
        (e.deletedBy || "admin") +
        " - " +
        new Date(e.createdAt).toLocaleString("en-IN") +
        "</div></div></div>" +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:11px;font-weight:700;color:' +
        urgency +
        ';">' +
        daysLeft +
        "d left</span>" +
        "<button onclick=\"doUndo('" +
        e._id +
        '\', this)" class="btn btn-pri btn-sm">✅ Restore</button>' +
        "<button onclick=\"dismissUndo('" +
        e._id +
        '\', this)" class="btn btn-out btn-sm" style="color:#dc2626;border-color:#fca5a5;">✖</button>' +
        "</div></div>"
      );
    })
    .join("");
}
function doUndo(id, btn) {
  openConfirmEx({
    icon: "✅",
    title: "Restore Record?",
    body: "This will re-insert the deleted record back into the database with a fresh ID. All fields will be restored.",
    btn: "✅ Restore",
    cls: "btn-pri",
    onConfirm: function () {
      if (btn) btn.disabled = true;
      showProgress("Restoring record…", 30);
      var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
      fetch("/api/undo/" + id, {
        method: "POST",
        headers: { Authorization: "Bearer " + tok },
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          showProgress("Done!", 100);
          setTimeout(function () {
            closeConfirm();
            if (d.error) {
              showToast("❌ Restore failed: " + d.error);
              if (btn) btn.disabled = false;
              return;
            }
            showToast("✅ Restored: " + d.label);
            logLine("Undo restore: " + d.label, "success");
            loadUndoPage();
          }, 400);
        })
        .catch(function (err) {
          closeConfirm();
          showToast("❌ Error: " + (err.message || "network"));
          if (btn) btn.disabled = false;
        });
    },
  });
}
function dismissUndo(id, btn) {
  openConfirmEx({
    icon: "🛠️",
    title: "Discard Undo Entry?",
    body: "This will permanently delete the undo entry. The record cannot be recovered once discarded.",
    btn: "⚠️ Discard",
    cls: "btn-danger",
    onConfirm: function () {
      showProgress("Discarding entry…", 50);
      var tok = sessionStorage.getItem("eams_token") || TOKEN || "";
      fetch("/api/undo/" + id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + tok },
      })
        .then(function () {
          showProgress("Done!", 100);
          setTimeout(function () {
            closeConfirm();
            showToast("⚠️ Undo entry discarded");
            loadUndoPage();
          }, 400);
        })
        .catch(function () {
          closeConfirm();
          showToast("❌ Failed to discard");
        });
    },
  });
}
// ---- — — Legacy saveBackup stub (runSteps calls this — no-op now) ----
function saveBackup(label, data) {
  /* superseded by server-side UndoLog */
}
function loadBackups() {
  /* legacy no-op */
}

// -- User Grid --------------------------------------------
var _ugRole = "student";
var _ugData = null;
function ugSetRole(role, btn) {
  _ugRole = role;

  document.querySelectorAll(".ug-tab").forEach(function (b) {
    b.classList.remove("act");
  });

  if (btn) btn.classList.add("act");

  document.getElementById("ug-class-filter").style.display =
    role === "student" || role === "attendance" ? "" : "none";

  ugApplyFilters();
}
function ugApplyFilters() {
  var tok = getToken();

  var path =
    (window.location.origin || "") +
    "/api/" +
    (_ugRole === "attendance"
      ? "attendance"
      : _ugRole === "admin"
        ? "users?role=admin"
        : _ugRole + "s");

  var clsFilter = document.getElementById("ug-class-filter");

  var deptFilter = document.getElementById("ug-dept-filter");

  var search = document.getElementById("ug-search").value.toLowerCase();

  fetch(path, { headers: { Authorization: "Bearer " + tok } })
    .then(function (r) {
      return r.json();
    })

    .then(function (data) {
      _ugData = data;

      if (_ugRole === "student" || _ugRole === "teacher") {
        var classes = [
          ...new Set(
            data.map(function (d) {
              return d.class || d.department || "";
            }),
          ),
        ]
          .filter(Boolean)
          .sort();

        if (clsFilter)
          clsFilter.innerHTML =
            '<option value="">All ' +
            (_ugRole === "student" ? "Classes" : "Classes/Depts") +
            "</option>" +
            classes
              .map(function (c) {
                return '<option value="' + c + '">' + c + "</option>";
              })
              .join("");
      }

      renderUGTable(data);

      document.getElementById("ug-status").textContent =
        data.length + " record(s)";
    })
    .catch(function () {
      showToast("Error loading " + _ugRole + " data", "danger");
    });
}
function renderUGTable(data) {
  var clsF = document.getElementById("ug-class-filter");

  var deptF = document.getElementById("ug-dept-filter");

  var search = document.getElementById("ug-search").value.toLowerCase();

  var filtered = data;

  if (clsF && clsF.value)
    filtered = filtered.filter(function (d) {
      return (d.class || d.department || "") === clsF.value;
    });

  if (deptF && deptF.value)
    filtered = filtered.filter(function (d) {
      return (d.department || d.dept || "") === deptF.value;
    });

  if (search)
    filtered = filtered.filter(function (d) {
      return (
        (d.name + " " + d.regNo + " " + d.username + " " + d.regdNo)
          .toLowerCase()
          .indexOf(search) >= 0
      );
    });

  var thead = document.getElementById("ug-thead");

  var tbody = document.getElementById("ug-tbody");

  var empty = document.getElementById("ug-empty");

  if (!thead || !tbody) return;

  if (_ugRole === "attendance") {
    thead.innerHTML =
      "<tr><th>Student</th><th>Date</th><th>Status</th><th>Class</th><th>Actions</th></tr>";

    tbody.innerHTML = filtered
      .map(function (a) {
        return (
          "<tr><td>" +
          (a.studentName || "") +
          "</td><td>" +
          (a.date ? new Date(a.date).toLocaleDateString() : "") +
          "</td><td>" +
          (a.status || "") +
          "</td><td>" +
          (a.class || "") +
          '</td><td><button class="btn btn-sm btn-danger" onclick="deleteAttendance(\'' +
          a._id +
          "')\">Delete</button></td></tr>"
        );
      })
      .join("");
  } else {
    var cols =
      _ugRole === "admin"
        ? ["Username", "Name", "Role", "Actions"]
        : [
            "Reg No",
            "Name",
            _ugRole === "student" ? "Class" : "Department",
            _ugRole === "student" ? "Year" : "Subjects",
            "Actions",
          ];

    thead.innerHTML =
      "<tr>" +
      cols
        .map(function (c) {
          return "<th>" + c + "</th>";
        })
        .join("") +
      "</tr>";

    tbody.innerHTML = filtered
      .map(function (d) {
        var actions =
          '<button class="btn btn-sm btn-out" onclick="ugEditUser(\'' +
          (d._id || d.id) +
          "')\">Edit</button>";

        actions +=
          " <button class=\"btn btn-sm btn-danger\" onclick=\"if(confirm('Delete?'))ugDeleteUser('" +
          (d._id || d.id) +
          "')\">Delete</button>";

        if (_ugRole === "student")
          actions +=
            ' <button class="btn btn-sm btn-out" onclick="window.open(\'student.html?id=' +
            (d._id || d.id) +
            "','_blank')\">View</button>";

        if (_ugRole === "teacher")
          actions +=
            ' <button class="btn btn-sm btn-out" onclick="window.open(\'teacher.html?id=' +
            (d._id || d.id) +
            "','_blank')\">View</button>";

        if (_ugRole === "admin")
          return (
            "<tr><td>" +
            (d.username || "") +
            "</td><td>" +
            (d.name || "") +
            "</td><td>" +
            (d.role || "") +
            "</td><td>" +
            actions +
            "</td></tr>"
          );

        return (
          "<tr><td>" +
          (d.regNo || d.regdNo || "") +
          "</td><td>" +
          (d.name || "") +
          "</td><td>" +
          (d.class || d.department || "") +
          "</td><td>" +
          (d.year || d.department || "") +
          "</td><td>" +
          actions +
          "</td></tr>"
        );
      })
      .join("");
  }

  if (empty) empty.style.display = filtered.length ? "none" : "block";
}
function ugRefresh() {
  ugApplyFilters();
}
function ugSaveAll() {
  showToast("Save all not yet implemented", "warning");
}
function ugCloseEdit() {
  document.getElementById("ug-edit-modal").style.display = "none";
}
function ugSaveEdit() {
  showToast("Save not yet implemented", "warning");
  ugCloseEdit();
}
function ugEditUser(id) {
  showToast("Edit mode — feature in development", "info");
}
function ugDeleteUser(id) {
  var tok = getToken();

  var path =
    "/api/" + (_ugRole === "admin" ? "users/" + id : _ugRole + "s/" + id);

  fetch(path, { method: "DELETE", headers: { Authorization: "Bearer " + tok } })
    .then(function (r) {
      if (r.ok) {
        showToast("Deleted successfully");
        ugApplyFilters();
      } else {
        r.json().then(function (d) {
          showToast(d.error || "Delete failed", "danger");
        });
      }
    })
    .catch(function () {
      showToast("Network error", "danger");
    });
}

// -- Modals / Clear Storage ------------------------------
function openClearStorageModal() {
  openModal("m-clear-storage");
}
function confirmClearStorage() {
  var checked = document.querySelectorAll(
    "#m-clear-storage input[type=checkbox]:checked",
  );

  if (checked.length === 0) {
    showToast("⚠️ Select at least one item");
    return;
  }

  var clearedToken = false;
  checked.forEach(function (c) {
    if (c.value === "eams_token") clearedToken = true;
    sessionStorage.removeItem(c.value);
  });

  closeModalBg("m-clear-storage");

  if (clearedToken) {
    showToast("✅ Session cleared — logging out");
    setTimeout(function () {
      window.location.href = "index.html";
    }, 600);
  } else {
    showToast("✅ Cleared " + checked.length + " item(s)");
  }
}
function openAttendanceDateModal() {
  openModal("m-attendance-date");
}
function confirmAttendanceDelete(mode) {
  var tok = getToken();

  if (mode === "all") {
    if (!confirm("Delete ALL attendance records?")) return;

    fetch("/api/attendance/all", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + tok },
    })
      .then(function (r) {
        if (r.ok) {
          showToast("All attendance records cleared");
          closeModalBg("m-attendance-date");
        } else {
          r.json().then(function (d) {
            showToast(d.error || "Failed", "danger");
          });
        }
      })
      .catch(function () {
        showToast("Network error", "danger");
      });
  } else {
    var from = document.getElementById("att-del-from")?.value;

    var to = document.getElementById("att-del-to")?.value;

    if (!from || !to) {
      showToast("Select date range");
      return;
    }

    fetch("/api/attendance/clear", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + tok,
      },
      body: JSON.stringify({ from: from, to: to }),
    })
      .then(function (r) {
        if (r.ok) {
          showToast("Attendance records cleared");
          closeModalBg("m-attendance-date");
        } else {
          r.json().then(function (d) {
            showToast(d.error || "Failed", "danger");
          });
        }
      })
      .catch(function () {
        showToast("Network error", "danger");
      });
  }
}

function deleteAttendance(id) {
  var tok = getToken();

  if (!confirm("Delete this attendance record?")) return;

  fetch("/api/attendance/" + id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + tok },
  })
    .then(function (r) {
      if (r.ok) {
        showToast("Deleted");
        ugApplyFilters();
      } else {
        showToast("Delete failed", "danger");
      }
    })
    .catch(function () {
      showToast("Network error", "danger");
    });
}

// -- Special Password --------------------------------------
function toggleSppwEye() {
  var inp = document.getElementById("sppw-input");

  if (inp) inp.type = inp.type === "password" ? "text" : "password";
}
function verifySpecialPw() {
  var pw = document.getElementById("sppw-input")?.value;

  var onSuccess = document.getElementById("sppw-on-success")?.value || "";

  if (!pw) {
    showToast("Enter your password");
    return;
  }

  var tok = getToken();

  fetch("/api/auth/verify-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tok,
    },
    body: JSON.stringify({ password: pw }),
  })
    .then(function (r) {
      return r.json();
    })

    .then(function (d) {
      if (d.verified) {
        showToast("✅ Verified");
        closeModalBg("m-special-pw");
        if (onSuccess && typeof window[onSuccess] === "function")
          window[onSuccess]();
      } else {
        showToast("❌ " + (d.error || "Wrong password"), "danger");
      }
    })
    .catch(function () {
      showToast("Network error", "danger");
    });
}

// -- Loader step advancement --------------------------------
var _loaderStep = 0;
function advanceLoaderStep(msg) {
  _loaderStep++;

  if (_loaderStep > 4) return;

  var next = document.getElementById("lstep-" + _loaderStep);

  if (next) next.classList.add("active");

  var msgEl = document.getElementById("loader-msg");

  if (msg && msgEl) msgEl.textContent = msg;
}

// -- Init ---------------------------------------------------
(function () {
  advanceLoaderStep("Checking authorization…");

  updateClock();

  setInterval(updateClock, 1000);

  setTimeout(function () {
    advanceLoaderStep("Loading system data…");

    nav("overview");
  }, 100);

  setTimeout(function () {
    advanceLoaderStep("Finalizing…");
  }, 800);

  setTimeout(function () {
    var loader = document.getElementById("page-loader");

    if (loader) {
      loader.classList.add("loader-fade");

      setTimeout(function () {
        loader.style.display = "none";
      }, 360);
    }
  }, 2000);
})();
// -- Errors mode toggling ---------------------------------
var _errorsMode = "n";
var _errorsN = 20;
function setErrorsMode(mode) {
  _errorsMode = mode;

  document
    .getElementById("err-btn-week")
    ?.classList.toggle("active", mode === "week");

  document
    .getElementById("err-btn-n")
    ?.classList.toggle("active", mode === "n");

  loadHealth();
}

// -- Delete All Adder -------------------------------------
function openDeleteAdderModal() {
  document.querySelectorAll(".adder-chk").forEach(function (c) {
    c.checked = false;
  });

  openModal("m-delete-adder");
}

function confirmDeleteAdder() {
  var selected = Array.from(
    document.querySelectorAll(".adder-chk:checked"),
  ).map(function (c) {
    return c.value;
  });

  if (selected.length === 0) {
    showToast("Select at least one collection");
    return;
  }

  if (
    !confirm(
      "Permanently delete: " + selected.join(", ") + "? This cannot be undone.",
    )
  )
    return;

  var tok = getToken();

  fetch("/api/system/delete-adder", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + tok,
    },

    body: JSON.stringify({ collections: selected }),
  })
    .then(function (r) {
      return r.json();
    })

    .then(function (d) {
      if (d.success) {
        showToast("✅ Deleted: " + d.deleted + " records");
        closeModalBg("m-delete-adder");
      } else {
        showToast(d.error || "Delete failed", "danger");
      }
    })
    .catch(function () {
      showToast("Network error", "danger");
    });
}

// -- Clear Storage select-all ------------------------------
function toggleClearAll(el) {
  document.querySelectorAll(".clr-chk").forEach(function (c) {
    c.checked = el.checked;
  });
}

// -- Navigation helpers ------------------------------
function goBack() {
  window.location.href = "admin.html";
}