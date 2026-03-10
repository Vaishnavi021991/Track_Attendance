const PERIOD_START = "2026-03-02"; // First Monday of the FY tracking period
const PERIOD_END   = "2026-06-30"; // End of financial year tracking period

const API = {
  async getAttendance(start, end) {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const res = await fetch(`/api/attendance?${params}`);
    return res.json();
  },
  async saveAttendance(data) {
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
    return res.json();
  },
  async deleteAttendance(date) {
    await fetch(`/api/attendance/${date}`, { method: "DELETE" });
  },
  async getStats() {
    const res = await fetch("/api/stats");
    return res.json();
  },
  async getSettings() {
    const res = await fetch("/api/settings");
    return res.json();
  },
  async getWifi() {
    const res = await fetch("/api/wifi");
    return res.json();
  },
  async updateSettings(data) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
};

function formatDate(str) {
  const d = new Date(str + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function startOfWeekStr(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const mondayOffset = (day + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

function addDaysStr(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4000);
}

function reload() {
  loadStats();
  loadAttendance();
  loadWeeklyGraphAndCumulative();
}

// ── Stats ──────────────────────────────────────────────────────────────────

async function loadStats() {
  const s = await API.getStats();

  document.getElementById("officeDays").textContent = s.office_days_this_week;
  document.getElementById("requiredDays").textContent = s.required_per_week;
  document.getElementById("remoteDays").textContent = s.remote_days_this_week;
  document.getElementById("leaveDays").textContent = s.leave_days_this_week;

  const todayCard = document.getElementById("todayCard");
  const todayStatus = document.getElementById("todayStatus");
  const typeLabels = { office: "Office", remote: "Remote", leave: "Leave" };
  todayStatus.textContent = typeLabels[s.today_type] || "—";
  todayCard.className = "stat-card" + (s.today_type ? ` today-${s.today_type}` : "");

  // Compliance bar: office days only vs required
  const pct = Math.min(100, Math.round((s.office_days_this_week / s.required_per_week) * 100));
  const fill = document.getElementById("complianceFill");
  const bar = document.getElementById("complianceBar");
  const text = document.getElementById("complianceText");
  fill.style.width = `${pct}%`;
  text.textContent = `${pct}% office attendance this week (min 80%)`;
  bar.classList.remove("warning", "danger", "success");
  if (pct >= 80) bar.classList.add("success");
  else if (pct >= 50) bar.classList.add("warning");
  else bar.classList.add("danger");
}

// ── Weekly chart + cumulative ──────────────────────────────────────────────

async function loadWeeklyGraphAndCumulative() {
  const s = await API.getStats();
  const required = Number(s.required_per_week || 2);
  const minPct = 80;

  const start = PERIOD_START;
  const end = todayStr() < PERIOD_END ? todayStr() : PERIOD_END;
  const rows = await API.getAttendance(start, end);
  const rowsByDate = new Map(rows.map((r) => [r.date, r]));

  // Cumulative compliance: office days only, completed weeks only
  const thisWeekStart = startOfWeekStr(end);
  const thisWeekEnd = addDaysStr(thisWeekStart, 6);
  const lastCompletedWeekEnd = end >= thisWeekEnd ? thisWeekEnd : addDaysStr(thisWeekStart, -1);

  let completedWeeks = 0;
  let officeInCompletedWeeks = 0;

  if (lastCompletedWeekEnd >= start) {
    for (let ws = start; ws <= startOfWeekStr(lastCompletedWeekEnd); ws = addDaysStr(ws, 7)) {
      completedWeeks += 1;
      for (let i = 0; i < 7; i++) {
        const d = addDaysStr(ws, i);
        if (d > lastCompletedWeekEnd) break;
        const r = rowsByDate.get(d);
        if (r && r.work_type === "office") officeInCompletedWeeks += 1;
      }
    }
  }

  const requiredTotal = completedWeeks * required;
  const cumulativePct = requiredTotal > 0 ? Math.round((officeInCompletedWeeks / requiredTotal) * 100) : 0;

  document.getElementById("cumulativePct").textContent = `${clamp(cumulativePct, 0, 999)}%`;
  document.getElementById("cumulativeLabel").textContent = `Cumulative (${completedWeeks} wk${completedWeeks === 1 ? "" : "s"})`;
  document.getElementById("cumulativeDetail").textContent = `${officeInCompletedWeeks}/${requiredTotal} office days (min ${minPct}%)`;

  const cumulativeCard = document.getElementById("cumulativeCard");
  cumulativeCard.classList.remove("stat-primary");
  cumulativeCard.style.borderColor = "";
  if (requiredTotal > 0 && cumulativePct >= minPct) cumulativeCard.classList.add("stat-primary");
  else if (requiredTotal > 0) cumulativeCard.style.borderColor = "var(--warning)";

  // Build per-week data
  const weekStart = startOfWeekStr(start);
  const endWeekStart = startOfWeekStr(end);
  const weeks = [];
  for (let ws = weekStart; ws <= endWeekStart; ws = addDaysStr(ws, 7)) {
    const we = addDaysStr(ws, 6);
    let office = 0, remote = 0, leave = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDaysStr(ws, i);
      if (d < start || d > end) continue;
      const r = rowsByDate.get(d);
      if (!r) continue;
      if (r.work_type === "office") office++;
      else if (r.work_type === "remote") remote++;
      else if (r.work_type === "leave") leave++;
    }
    const pct = required > 0 ? Math.round((office / required) * 100) : 0;
    weeks.push({ ws, we, office, remote, leave, pct });
  }

  // Chart: office bar + remote bar side by side, 5 days = 100% height
  const maxDays = 5;
  const chart = document.getElementById("weeklyChart");
  chart.innerHTML = "";
  weeks.slice(-14).forEach((w) => {
    const group = document.createElement("div");
    group.className = "bar-group";

    const barRow = document.createElement("div");
    barRow.className = "bar-group-row";

    const makeBar = (type, count) => {
      const bar = document.createElement("div");
      bar.className = `bar bar-${type}${type === "office" && w.pct < minPct ? " warn" : ""}`;
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.height = `${clamp(Math.round((count / maxDays) * 100), 0, 120)}%`;
      const label = document.createElement("div");
      label.className = "bar-label";
      label.textContent = count || "";
      bar.title = `Week ${w.ws}\nOffice: ${w.office}  Remote: ${w.remote}  Leave: ${w.leave}\nOffice target: ${w.office}/${required}`;
      bar.appendChild(fill);
      bar.appendChild(label);
      return bar;
    };

    barRow.appendChild(makeBar("office", w.office));
    barRow.appendChild(makeBar("remote", w.remote));
    group.appendChild(barRow);

    const weekLabel = document.createElement("div");
    weekLabel.className = "bar-week";
    weekLabel.textContent = w.ws.slice(5);
    group.appendChild(weekLabel);
    chart.appendChild(group);
  });
}

// ── Attendance table ───────────────────────────────────────────────────────

async function loadAttendance() {
  const rows = await API.getAttendance();
  const tbody = document.getElementById("attendanceBody");
  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-state">No attendance logged yet. Open the app at work or home — it auto-logs based on WiFi.</td></tr>';
    return;
  }

  const typeBadge = (wt) => {
    const labels = { office: "Office", remote: "Remote", leave: "Leave" };
    return `<span class="type-badge type-${wt}">${labels[wt] || wt}</span>`;
  };

  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${typeBadge(r.work_type)}</td>
      <td>${r.check_in || "—"}</td>
      <td>${r.notes || "—"}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-sm edit-btn" data-date="${r.date}">Edit</button>
        <button class="btn btn-ghost btn-sm delete-btn" data-date="${r.date}">Delete</button>
      </td>
    </tr>
  `
    )
    .join("");

  tbody.querySelectorAll(".edit-btn").forEach((b) => {
    const row = rows.find((r) => r.date === b.dataset.date);
    b.onclick = () => openLogModal(b.dataset.date, row);
  });
  tbody.querySelectorAll(".delete-btn").forEach((b) => {
    b.onclick = async () => {
      if (confirm("Delete this record?")) {
        await API.deleteAttendance(b.dataset.date);
        reload();
      }
    };
  });
}

// ── Log modal (past dates + edits only) ───────────────────────────────────

const logModal = document.getElementById("logModal");
const logForm = document.getElementById("logForm");
const modalTitle = document.getElementById("modalTitle");

function toggleLeaveFields(isLeave) {
  document.getElementById("checkInGroup").style.display = isLeave ? "none" : "";
  document.getElementById("checkOutGroup").style.display = isLeave ? "none" : "";
}

async function openLogModal(date, existing) {
  const datePickerGroup = document.getElementById("datePickerGroup");
  const dateInput = document.getElementById("logDateInput");
  const isPastDate = !date && !existing;

  if (isPastDate) {
    datePickerGroup.style.display = "block";
    dateInput.required = true;
    dateInput.value = "";
    document.getElementById("logDate").value = "";
    modalTitle.textContent = "Add past date";
  } else {
    datePickerGroup.style.display = "none";
    dateInput.required = false;
    document.getElementById("logDate").value = date;
    modalTitle.textContent = `Edit ${formatDate(date)}`;
  }

  const wt = existing?.work_type || "office";
  document.getElementById("logWorkType").value = wt;
  toggleLeaveFields(wt === "leave");
  document.getElementById("logCheckIn").value = existing?.check_in || "";
  document.getElementById("logCheckOut").value = existing?.check_out || "";
  document.getElementById("logNotes").value = existing?.notes || "";
  logModal.classList.add("open");
}

function closeLogModal() {
  logModal.classList.remove("open");
  document.getElementById("datePickerGroup").style.display = "none";
  document.getElementById("logDateInput").required = false;
}

document.getElementById("logWorkType").onchange = function () {
  toggleLeaveFields(this.value === "leave");
};

logForm.onsubmit = async (e) => {
  e.preventDefault();
  const date = document.getElementById("logDate").value || document.getElementById("logDateInput").value;
  if (!date) { alert("Please select a date"); return; }
  const work_type = document.getElementById("logWorkType").value || "office";
  const check_in = work_type === "leave" ? "" : document.getElementById("logCheckIn").value;
  const check_out = work_type === "leave" ? "" : document.getElementById("logCheckOut").value;
  const notes = document.getElementById("logNotes").value;
  try {
    await API.saveAttendance({ date, work_type, check_in, check_out, notes });
    closeLogModal();
    reload();
  } catch (err) {
    alert(err.message);
  }
};

document.getElementById("cancelLog").onclick = closeLogModal;
document.getElementById("addPastDateBtn").onclick = () => openLogModal(null, null);
document.getElementById("logDateInput").onchange = function () {
  document.getElementById("logDate").value = this.value;
};

logModal.onclick = (e) => { if (e.target === logModal) closeLogModal(); };

// ── Mark today as leave ────────────────────────────────────────────────────

document.getElementById("markLeaveBtn").onclick = async () => {
  if (!confirm("Mark today as leave?")) return;
  await API.saveAttendance({ date: todayStr(), work_type: "leave", check_in: "", check_out: "", notes: "" });
  showToast("Today marked as leave");
  reload();
  loadWifiStatus();
};

// ── Settings ───────────────────────────────────────────────────────────────

const settingsModal = document.getElementById("settingsModal");
const settingsForm = document.getElementById("settingsForm");

document.getElementById("settingsBtn").onclick = async () => {
  const s = await API.getSettings();
  document.getElementById("requiredDaysInput").value = s.required_days_per_week || 2;
  document.getElementById("officeWifiInput").value = s.office_wifi_ssid || "";
  settingsModal.classList.add("open");
};

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.onclick = () => {
    document.getElementById("requiredDaysInput").value = btn.dataset.days;
  };
});

document.getElementById("closeSettings").onclick = () =>
  settingsModal.classList.remove("open");

settingsForm.onsubmit = async (e) => {
  e.preventDefault();
  const required = document.getElementById("requiredDaysInput").value;
  const officeWifi = document.getElementById("officeWifiInput").value.trim();
  await API.updateSettings({ required_days_per_week: required, office_wifi_ssid: officeWifi });
  settingsModal.classList.remove("open");
  reload();
  loadWifiStatus();
};

settingsModal.onclick = (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove("open");
};

// ── WiFi status indicator ──────────────────────────────────────────────────

async function loadWifiStatus() {
  const el = document.getElementById("wifiStatus");
  try {
    const w = await API.getWifi();
    if (!w.ssid) {
      el.textContent = "No WiFi detected";
      el.className = "wifi-status wifi-unknown";
    } else if (w.at_office) {
      el.textContent = `At office · ${w.ssid}`;
      el.className = "wifi-status wifi-office";
    } else {
      el.textContent = `At home · ${w.ssid}`;
      el.className = "wifi-status wifi-home";
    }
  } catch {
    el.textContent = "";
  }
}

// ── Auto-log based on WiFi ─────────────────────────────────────────────────
// Weekdays only. Office WiFi → log/upgrade to office. Other WiFi → log as remote.
// Never overwrites a leave record. Never runs on weekends.

async function autoLogIfNeeded() {
  try {
    const dow = new Date().getDay();
    if (dow === 0 || dow === 6) return; // skip weekends

    const [wifi, stats] = await Promise.all([API.getWifi(), API.getStats()]);
    // Never overwrite a leave record
    if (stats.today_type === "leave") return;

    const checkIn = currentTimeStr();

    if (wifi.at_office) {
      // On Corp-Network: log or upgrade remote → office
      if (!stats.today_logged || stats.today_type === "remote") {
        await API.saveAttendance({ date: todayStr(), work_type: "office", check_in: checkIn, check_out: "", notes: "" });
        showToast(`Office day logged · Check-in: ${checkIn}`);
        reload();
      }
    } else if (wifi.ssid) {
      // On some other network: log as remote
      if (!stats.today_logged) {
        await API.saveAttendance({ date: todayStr(), work_type: "remote", check_in: checkIn, check_out: "", notes: "" });
        showToast(`Remote day logged · ${wifi.ssid}`);
        reload();
      }
    } else {
      // No network detected on a weekday: log as leave
      if (!stats.today_logged) {
        await API.saveAttendance({ date: todayStr(), work_type: "leave", check_in: "", check_out: "", notes: "" });
        showToast("No network detected — logged as leave");
        reload();
      }
    }
  } catch {
    // silently skip if wifi check fails
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  await loadStats();
  await loadAttendance();
  await loadWeeklyGraphAndCumulative();
  await autoLogIfNeeded();
  await loadWifiStatus();
}

init();
