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


def get_wifi_ssid():
    for iface in ["en0", "en1", "en2"]:
        try:
            result = subprocess.run(
                ["networksetup", "-getairportnetwork", iface],
                capture_output=True, text=True, timeout=3,
            )
            output = result.stdout.strip()
            if output.startswith("Current Wi-Fi Network:"):
                return output.split(":", 1)[1].strip()
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

    # Read office WiFi name from settings
    cur.execute("SELECT value FROM settings WHERE key = 'office_wifi_ssid'")
    row = cur.fetchone()
    office_ssid = row["value"] if row else "Corp-Network"

    # Check what's already logged for today
    cur.execute("SELECT work_type FROM attendance WHERE date = ?", (today,))
    existing   = cur.fetchone()
    today_type = existing["work_type"] if existing else None

    ssid      = get_wifi_ssid()
    at_office = bool(ssid and ssid == office_ssid)

    # Decide what to log
    work_type = None
    if at_office:
        if today_type != "office":          # Corp-Network always wins
            work_type = "office"
    elif ssid:
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
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] {today} → {work_type} (WiFi: {ssid or 'none'})")
    else:
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] {today} already logged as {today_type}, skipped")

    conn.close()


if __name__ == "__main__":
    main()
