#!/opt/homebrew/bin/python3
"""
Standalone attendance auto-logger.
Runs via cron on weekdays — checks WiFi and writes directly to the DB.
No browser or Flask server needed for logging to work.
"""
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TIMEZONE = ZoneInfo("Australia/Sydney")
DB_PATH  = Path(__file__).parent / "attendance.db"


def get_current_ip():
    for iface in ["en0", "en1", "en12", "en2"]:
        try:
            result = subprocess.run(
                ["ipconfig", "getifaddr", iface],
                capture_output=True, text=True, timeout=3,
            )
            ip = result.stdout.strip()
            if ip and not ip.startswith("127."):
                return ip
        except Exception:
            continue
    return None


def main():
    now = datetime.now(TIMEZONE)

    # Weekdays only (Mon=0 … Fri=4)
    if now.weekday() >= 5:
        return

    today    = now.strftime("%Y-%m-%d")
    check_in = now.strftime("%H:%M")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur  = conn.cursor()

    # Read office IP prefix from settings
    cur.execute("SELECT value FROM settings WHERE key = 'office_ip_prefix'")
    row = cur.fetchone()
    office_ip_prefix = row["value"] if row else "10.10."

    # Check what's already logged for today
    cur.execute("SELECT work_type FROM attendance WHERE date = ?", (today,))
    existing   = cur.fetchone()
    today_type = existing["work_type"] if existing else None

    ip        = get_current_ip()
    at_office = bool(ip and ip.startswith(office_ip_prefix))

    # Decide what to log
    work_type = None
    if at_office:
        if today_type != "office":          # Office IP always wins
            work_type = "office"
    elif ip:
        if not today_type:                  # Other network → remote (once)
            work_type = "remote"
    else:
        if not today_type:                  # No network → leave (once)
            work_type = "leave"

    if work_type:
        ci = check_in if work_type != "leave" else ""
        conn.execute(
            """
            INSERT INTO attendance (date, work_type, check_in, check_out, notes)
            VALUES (?, ?, ?, '', '')
            ON CONFLICT(date) DO UPDATE SET
                work_type = excluded.work_type,
                check_in  = excluded.check_in,
                check_out = '',
                notes     = ''
            """,
            (today, work_type, ci),
        )
        conn.commit()
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] {today} → {work_type} (IP: {ip or 'none'})")
    else:
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] {today} already logged as {today_type}, skipped")

    conn.close()


if __name__ == "__main__":
    main()
