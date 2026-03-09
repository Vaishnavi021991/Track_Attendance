# Office Attendance Tracker

A simple web app to track and stay on top of your office attendance. With many companies now requiring in-office days, this tool helps you log your attendance, monitor compliance, and export records.

## Features

- **Log attendance** — Record check-in/check-out times and optional notes for each day
- **Weekly stats** — See how many days you've been in office vs. your required target
- **Compliance bar** — Visual indicator of your progress toward the weekly goal
- **Settings** — Set your agreed days per week: **2 days** (exemption) or **3 days** (standard). Company tracks 80% attendance.
- **Export** — Download your attendance history as CSV
- **Add past dates** — Log attendance for days you forgot to record

## Quick Start

1. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

2. **Run the app**

   ```bash
   python app.py
   ```

3. **Open in browser**

   Go to [http://localhost:5000](http://localhost:5000)

## Usage

- Click **Log today's attendance** to record today's check-in/check-out times
- Use **Add past date** to log attendance for previous days
- Click **Edit** or **Delete** on any row in the history table
- Use the **Settings** (gear icon) to change required days per week
- Click **Export CSV** to download your records

## Tech Stack

- Python 3 + Flask
- SQLite (local database, no setup required)
- Vanilla JavaScript + CSS

## Data

All data is stored locally in `attendance.db` in the project folder. No cloud services or accounts required.
