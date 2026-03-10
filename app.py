"""
Office Attendance Tracker
A simple system to track and stay on top of your office attendance.
"""
import sqlite3
import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

# Use Sydney time for "today" and week boundaries
TIMEZONE = ZoneInfo("Australia/Sydney")

from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = Path(__file__).parent / "attendance.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            work_type TEXT NOT NULL DEFAULT 'office',
            check_in TEXT,
            check_out TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO settings (key, value) VALUES
            ('required_days_per_week', '2'),
            ('office_wifi_ssid', 'Corp-Network');
    """)
    # Migrate office_wifi_ssid from old values
    conn.execute(
        "UPDATE settings SET value = 'Corp-Network' WHERE key = 'office_wifi_ssid' AND value IN ('', 'ts Corp Network')"
    )
    # Add work_type column for existing DBs (SQLite has no IF NOT EXISTS for columns)
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pragma_table_info('attendance') WHERE name='work_type'")
    if cur.fetchone() is None:
        conn.execute("ALTER TABLE attendance ADD COLUMN work_type TEXT NOT NULL DEFAULT 'office'")
    conn.commit()
    conn.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/attendance", methods=["GET"])
def get_attendance():
    """Get attendance records, optionally filtered by date range."""
    start = request.args.get("start")
    end = request.args.get("end")
    conn = get_db()
    cur = conn.cursor()
    if start and end:
        cur.execute(
            "SELECT * FROM attendance WHERE date BETWEEN ? AND ? ORDER BY date DESC",
            (start, end),
        )
    elif start:
        cur.execute(
            "SELECT * FROM attendance WHERE date >= ? ORDER BY date DESC",
            (start,),
        )
    elif end:
        cur.execute(
            "SELECT * FROM attendance WHERE date <= ? ORDER BY date DESC",
            (end,),
        )
    else:
        cur.execute("SELECT * FROM attendance ORDER BY date DESC LIMIT 180")
    rows = cur.fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/attendance", methods=["POST"])
def add_attendance():
    """Add or update an attendance record."""
    data = request.get_json()
    date = data.get("date")
    work_type = (data.get("work_type") or "office").strip().lower()
    if work_type not in ("office", "remote", "leave"):
        work_type = "office"
    check_in = data.get("check_in", "")
    check_out = data.get("check_out", "")
    notes = data.get("notes", "")
    if not date:
        return jsonify({"error": "Date is required"}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO attendance (date, work_type, check_in, check_out, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            work_type = excluded.work_type,
            check_in = excluded.check_in,
            check_out = excluded.check_out,
            notes = excluded.notes
        """,
        (date, work_type, check_in, check_out, notes),
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/attendance/<date_str>", methods=["DELETE"])
def delete_attendance(date_str):
    """Delete an attendance record."""
    conn = get_db()
    conn.execute("DELETE FROM attendance WHERE date = ?", (date_str,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


def _now_sydney():
    return datetime.now(TIMEZONE)


@app.route("/api/stats")
def get_stats():
    """Get attendance statistics for the current week (Sydney time)."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'required_days_per_week'")
    row = cur.fetchone()
    required = int(row["value"]) if row else 2

    now = _now_sydney()
    today = now.strftime("%Y-%m-%d")
    week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    week_end = (now + timedelta(days=6 - now.weekday())).strftime("%Y-%m-%d")

    cur.execute(
        "SELECT COUNT(*) as count FROM attendance WHERE date BETWEEN ? AND ? AND work_type = 'office'",
        (week_start, week_end),
    )
    office_days_this_week = cur.fetchone()["count"]

    cur.execute(
        "SELECT COUNT(*) as count FROM attendance WHERE date BETWEEN ? AND ? AND work_type = 'remote'",
        (week_start, week_end),
    )
    remote_days_this_week = cur.fetchone()["count"]

    cur.execute(
        "SELECT COUNT(*) as count FROM attendance WHERE date BETWEEN ? AND ? AND work_type = 'leave'",
        (week_start, week_end),
    )
    leave_days_this_week = cur.fetchone()["count"]

    cur.execute("SELECT work_type FROM attendance WHERE date = ?", (today,))
    today_row = cur.fetchone()
    today_logged = today_row is not None
    today_type = today_row["work_type"] if today_row else None

    conn.close()

    return jsonify(
        {
            "office_days_this_week": office_days_this_week,
            "remote_days_this_week": remote_days_this_week,
            "leave_days_this_week": leave_days_this_week,
            "required_per_week": required,
            "today_logged": today_logged,
            "today_type": today_type,
            "week_start": week_start,
            "week_end": week_end,
        }
    )


@app.route("/api/settings", methods=["GET"])
def get_settings():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings")
    rows = cur.fetchall()
    conn.close()
    return jsonify({r["key"]: r["value"] for r in rows})


@app.route("/api/settings", methods=["POST"])
def update_settings():
    data = request.get_json()
    conn = get_db()
    for key, value in data.items():
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, str(value)),
        )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/wifi")
def get_wifi():
    """Detect current WiFi SSID and whether it matches the configured office network."""
    ssid = None
    for iface in ["en0", "en1", "en2"]:
        try:
            result = subprocess.run(
                ["networksetup", "-getairportnetwork", iface],
                capture_output=True, text=True, timeout=3
            )
            output = result.stdout.strip()
            if output.startswith("Current Wi-Fi Network:"):
                ssid = output.split(":", 1)[1].strip()
                break
        except Exception:
            continue

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'office_wifi_ssid'")
    row = cur.fetchone()
    office_ssid = row["value"] if row else ""
    conn.close()

    at_office = bool(ssid and office_ssid and ssid == office_ssid)
    return jsonify({"ssid": ssid, "office_ssid": office_ssid, "at_office": at_office})


@app.route("/api/export")
def export_csv():
    """Export attendance as CSV."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT date, work_type, check_in, check_out, notes FROM attendance ORDER BY date")
    rows = cur.fetchall()
    conn.close()
    lines = ["date,work_type,check_in,check_out,notes"]
    for r in rows:
        lines.append(f"{r['date']},{r['work_type'] or 'office'},{r['check_in'] or ''},{r['check_out'] or ''},{r['notes'] or ''}")
    return "\n".join(lines), 200, {"Content-Type": "text/csv", "Content-Disposition": "attachment; filename=attendance.csv"}


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
