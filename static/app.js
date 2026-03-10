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

function march1Str() {
  const y = new Date().getFullYear();
  return `${y}-03-01`;
}

function firstMondayOnOrAfter(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = (8 - day) % 7; // Mon => 0, Tue => 6, Sun => 1
  d.setDate(d.getDate() + offsetToMonday);
  return d.toISOString().slice(0, 10);
}

function startOfWeekStr(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7; // Mon=0..Sun=6
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

async function loadStats() {
  const s = await API.getStats();
  document.getElementById("daysThisWeek").textContent = s.days_this_week;
  document.getElementById("requiredDays").textContent = s.required_per_week;
  document.getElementById("totalDays").textContent = s.total_days;
  const todayCard = document.getElementById("todayCard");
  const todayStatus = document.getElementById("todayStatus");
  if (s.today_logged) {
    todayStatus.textContent = "✓ Logged";
    todayCard.classList.add("stat-primary");
  } else {
    todayStatus.textContent = "Not logged";
    todayCard.classList.remove("stat-primary");
  }

  const pct = Math.min(
    100,
    Math.round((s.days_this_week / s.required_per_week) * 100)
  );
  const fill = document.getElementById("complianceFill");
  const bar = document.getElementById("complianceBar");
  const text = document.getElementById("complianceText");
  fill.style.width = `${pct}%`;
  text.textContent = `${pct}% of weekly target (minimum 80%)`;
  bar.classList.remove("warning", "danger", "success");
  if (pct >= 100) bar.classList.add("success");
  else if (pct >= 50) bar.classList.add("warning");
  else bar.classList.add("danger");
}

async function loadWeeklyGraphAndCumulative() {
  const s = await API.getStats();
  const required = Number(s.required_per_week || 2);
  const minPct = 80;

  const start = PERIOD_START;
  const end = todayStr() < PERIOD_END ? todayStr() : PERIOD_END;
  const rows = await API.getAttendance(start, end);
  const attendedDates = new Set(rows.map((r) => r.date));
  const rowsByDate = new Map(rows.map((r) => [r.date, r]));

  // Cumulative compliance by completed weeks only:
  // - By end of this week => includes 2 weeks (last + this)
  // - By end of next week => includes 3 weeks, etc.
  const thisWeekStart = startOfWeekStr(end);
  const thisWeekEnd = addDaysStr(thisWeekStart, 6);
  const lastCompletedWeekEnd = end >= thisWeekEnd ? thisWeekEnd : addDaysStr(thisWeekStart, -1);

  let completedWeeks = 0;
  let attendedInCompletedWeeks = 0;

  if (lastCompletedWeekEnd >= start) {
    for (let ws = start; ws <= startOfWeekStr(lastCompletedWeekEnd); ws = addDaysStr(ws, 7)) {
      completedWeeks += 1;
      for (let i = 0; i < 7; i++) {
        const d = addDaysStr(ws, i);
        if (d > lastCompletedWeekEnd) break;
        if (attendedDates.has(d)) attendedInCompletedWeeks += 1;
      }
    }
  }

  const requiredTotal = completedWeeks * required;
  const cumulativePct = requiredTotal > 0 ? Math.round((attendedInCompletedWeeks / requiredTotal) * 100) : 0;

  document.getElementById("cumulativePct").textContent = `${clamp(cumulativePct, 0, 999)}%`;
  document.getElementById("cumulativeLabel").textContent = `Cumulative (${completedWeeks} week${completedWeeks === 1 ? "" : "s"})`;
  document.getElementById("cumulativeDetail").textContent = `${attendedInCompletedWeeks}/${requiredTotal} (min ${minPct}%)`;

  const cumulativeCard = document.getElementById("cumulativeCard");
  cumulativeCard.classList.remove("stat-primary");
  cumulativeCard.style.borderColor = "";
  if (requiredTotal > 0 && cumulativePct >= minPct) cumulativeCard.classList.add("stat-primary");
  else if (requiredTotal > 0) cumulativeCard.style.borderColor = "var(--warning)";

  const weekStart = startOfWeekStr(start);
  const endWeekStart = startOfWeekStr(end);

  const weeks = [];
  for (let ws = weekStart; ws <= endWeekStart; ws = addDaysStr(ws, 7)) {
    const we = addDaysStr(ws, 6);
    let attended = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDaysStr(ws, i);
      if (d < start || d > end) continue;
      if (attendedDates.has(d)) attended += 1;
    }
    const pct = required > 0 ? Math.round((attended / required) * 100) : 0;
    weeks.push({ ws, we, attended, pct });
  }

  // Scale: 5 days = 100% height for each bar
  const maxDays = 5;
  const chart = document.getElementById("weeklyChart");
  chart.innerHTML = "";
  weeks.slice(-14).forEach((w) => {
    const group = document.createElement("div");
    group.className = "bar-group";
    const officePct = Math.round((w.attended / maxDays) * 100);

    const barRow = document.createElement("div");
    barRow.className = "bar-group-row";
    const bar = document.createElement("div");
    bar.className = "bar bar-office" + (w.pct < minPct ? " warn" : "");
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.height = `${clamp(officePct, 0, 120)}%`;
    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = w.attended;
    bar.title = `Week ${w.ws} to ${w.we}\n${w.attended}/${required} days`;
    bar.appendChild(fill);
    bar.appendChild(label);
    barRow.appendChild(bar);
    group.appendChild(barRow);
    const weekLabel = document.createElement("div");
    weekLabel.className = "bar-week";
    weekLabel.textContent = w.ws.slice(5);
    group.appendChild(weekLabel);
    chart.appendChild(group);
  });
}

async function loadAttendance() {
  const rows = await API.getAttendance();
  const tbody = document.getElementById("attendanceBody");
  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">No attendance logged yet. Click "Log today\'s attendance" to start.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.check_in || "—"}</td>
      <td>${r.check_out || "—"}</td>
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
        loadAttendance();
        loadStats();
      }
    };
  });
}

const logModal = document.getElementById("logModal");
const logForm = document.getElementById("logForm");
const modalTitle = document.getElementById("modalTitle");

async function openLogModal(date, existing) {
  const datePickerGroup = document.getElementById("datePickerGroup");
  const dateInput = document.getElementById("logDateInput");
  const isPastDate = date === null && !existing;

  if (isPastDate) {
    datePickerGroup.style.display = "block";
    dateInput.required = true;
    dateInput.value = "";
    document.getElementById("logDate").value = "";
    modalTitle.textContent = "Add past date";
  } else {
    datePickerGroup.style.display = "none";
    dateInput.required = false;
    const d = date || todayStr();
    document.getElementById("logDate").value = d;
    modalTitle.textContent = d === todayStr() ? "Log today's attendance" : `Log attendance for ${formatDate(d)}`;
  }

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

logForm.onsubmit = async (e) => {
  e.preventDefault();
  const date = document.getElementById("logDate").value || document.getElementById("logDateInput").value;
  if (!date) {
    alert("Please select a date");
    return;
  }
  const check_in = document.getElementById("logCheckIn").value;
  const check_out = document.getElementById("logCheckOut").value;
  const notes = document.getElementById("logNotes").value;
  try {
    await API.saveAttendance({ date, check_in, check_out, notes });
    closeLogModal();
    loadAttendance();
    loadStats();
    loadWeeklyGraphAndCumulative();
  } catch (err) {
    alert(err.message);
  }
};

document.getElementById("cancelLog").onclick = closeLogModal;
document.getElementById("logTodayBtn").onclick = () => openLogModal();

document.getElementById("addPastDateBtn").onclick = () => openLogModal(null);

document.getElementById("logDateInput").onchange = function () {
  document.getElementById("logDate").value = this.value;
};

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
  loadStats();
  loadWeeklyGraphAndCumulative();
  loadWifiStatus();
};

logModal.onclick = (e) => {
  if (e.target === logModal) closeLogModal();
};
settingsModal.onclick = (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove("open");
};

async function loadWifiStatus() {
  const el = document.getElementById("wifiStatus");
  try {
    const w = await API.getWifi();
    if (!w.office_ssid) {
      el.textContent = "Set office WiFi in settings";
      el.className = "wifi-status wifi-unknown";
    } else if (!w.ssid) {
      el.textContent = "WiFi not detected";
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

async function init() {
  await loadStats();
  await loadAttendance();
  await loadWeeklyGraphAndCumulative();
  await loadWifiStatus();
}

init();
