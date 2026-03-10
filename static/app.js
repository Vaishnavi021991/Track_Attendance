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
  async getForecast() {
    const res = await fetch("/api/forecast");
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

function fmtWeekLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
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
  loadWeeklyGraphAndCumulative();
  loadForecast();
}

// ── Stats ──────────────────────────────────────────────────────────────────

async function loadStats() {
  const s = await API.getStats();

  document.getElementById("officeDays").textContent = s.office_days_this_week;
  document.getElementById("requiredDays").textContent = s.required_per_week;
  document.getElementById("remoteDays").textContent = s.remote_days_this_week;
  document.getElementById("leaveDays").textContent = s.leave_days_this_week;

  const typeLabels = { office: "Office", remote: "Remote", leave: "Leave" };
  const badge = document.getElementById("todayBadge");
  badge.textContent = "Today: " + (typeLabels[s.today_type] || "—");
  badge.className = "today-pill" + (s.today_type ? ` pill-${s.today_type}` : "");

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

  // Chart: office-only bars, 5 days = 100% height
  const maxDays = 5;
  const chart = document.getElementById("weeklyChart");
  chart.innerHTML = "";
  weeks.slice(-14).forEach((w) => {
    const group = document.createElement("div");
    group.className = "bar-group";

    const barRow = document.createElement("div");
    barRow.className = "bar-group-row";

    const bar = document.createElement("div");
    bar.className = `bar bar-office${w.pct < minPct ? " warn" : ""}`;
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.height = `${clamp(Math.round((w.office / maxDays) * 100), 0, 120)}%`;
    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = w.office || "";
    bar.title = `Week of ${fmtWeekLabel(w.ws)}\nOffice: ${w.office}/${required}  Remote: ${w.remote}  Leave: ${w.leave}`;
    bar.appendChild(fill);
    bar.appendChild(label);
    barRow.appendChild(bar);
    group.appendChild(barRow);

    const weekLabel = document.createElement("div");
    weekLabel.className = "bar-week";
    weekLabel.textContent = fmtWeekLabel(w.ws);
    group.appendChild(weekLabel);
    chart.appendChild(group);
  });
}


// ── Settings ───────────────────────────────────────────────────────────────

const settingsModal = document.getElementById("settingsModal");
const settingsForm = document.getElementById("settingsForm");

document.getElementById("settingsBtn").onclick = async () => {
  const s = await API.getSettings();
  document.getElementById("requiredDaysInput").value = s.required_days_per_week || 2;
  document.getElementById("officeIpInput").value = s.office_ip_prefix || "10.10.";
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
  const officeIp = document.getElementById("officeIpInput").value.trim();
  await API.updateSettings({ required_days_per_week: required, office_ip_prefix: officeIp });
  settingsModal.classList.remove("open");
  reload();
  loadWifiStatus();
};

settingsModal.onclick = (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove("open");
};

// ── Forecast ───────────────────────────────────────────────────────────────

async function loadForecast() {
  const f = await API.getForecast();
  const card     = document.getElementById("forecastCard");
  const headline = document.getElementById("forecastHeadline");
  const badge    = document.getElementById("forecastBadge");
  const fill     = document.getElementById("forecastFill");
  const sub      = document.getElementById("forecastSub");

  const progress = Math.min(100, Math.round((f.office_in_period / f.min_target) * 100));
  fill.style.width = `${progress}%`;

  if (f.target_achieved) {
    card.className = "forecast-card forecast-success";
    headline.textContent = `You've hit the 80% target — well done!`;
    badge.textContent = "Achieved ✓";
    badge.className = "forecast-badge badge-success";
    sub.textContent = `${f.office_in_period} of ${f.min_target} required office days logged (${f.total_weeks} weeks, ${f.total_required} total required)`;
  } else if (!f.still_achievable) {
    card.className = "forecast-card forecast-danger";
    headline.textContent = `Need ${f.days_still_needed} more office days — target at risk`;
    badge.textContent = "At risk";
    badge.className = "forecast-badge badge-danger";
    sub.textContent = `${f.office_in_period} / ${f.min_target} days logged · only ${f.remaining_weeks} week${f.remaining_weeks === 1 ? "" : "s"} left`;
  } else {
    card.className = "forecast-card forecast-normal";
    headline.textContent = `${f.days_still_needed} more office day${f.days_still_needed === 1 ? "" : "s"} needed by Jun 30`;
    badge.textContent = "On track";
    badge.className = "forecast-badge badge-normal";
    sub.textContent = `${f.office_in_period} / ${f.min_target} days logged · ${f.remaining_weeks} week${f.remaining_weeks === 1 ? "" : "s"} remaining`;
  }
}

// ── WiFi status indicator ──────────────────────────────────────────────────

async function loadWifiStatus() {
  const el = document.getElementById("wifiStatus");
  try {
    const w = await API.getWifi();
    if (!w.ip) {
      el.textContent = "No network detected";
      el.className = "wifi-status wifi-unknown";
    } else if (w.at_office) {
      el.textContent = `At office · ${w.ip}`;
      el.className = "wifi-status wifi-office";
    } else {
      el.textContent = `At home · ${w.ip}`;
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
    const checkIn = currentTimeStr();

    if (wifi.at_office) {
      // Corp-Network always wins — office overrides remote or leave
      if (!stats.today_logged || stats.today_type !== "office") {
        await API.saveAttendance({ date: todayStr(), work_type: "office", check_in: checkIn, check_out: "", notes: "" });
        showToast(`Office day logged · Check-in: ${checkIn}`);
        reload();
      }
    } else if (wifi.ip) {
      // On some other network: log as remote
      if (!stats.today_logged) {
        await API.saveAttendance({ date: todayStr(), work_type: "remote", check_in: checkIn, check_out: "", notes: "" });
        showToast(`Remote day logged · ${wifi.ip}`);
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
  await loadWeeklyGraphAndCumulative();
  await loadForecast();
  await autoLogIfNeeded();
  await loadWifiStatus();
}

init();
