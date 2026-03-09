# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Setup
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run
python app.py        # starts Flask dev server on http://localhost:5000
```

No test suite or linter is configured.

## Architecture

Single-file Flask backend (`app.py`) + vanilla JS frontend. No build step required.

**Backend (`app.py`)**
- SQLite database at `attendance.db` (auto-created on first run via `init_db()`)
- Two tables: `attendance` (records with date, work_type, check_in, check_out, notes) and `settings` (key/value pairs)
- All dates are strings in `YYYY-MM-DD` format; timezone is hardcoded to `Australia/Sydney` for week boundary calculations
- `work_type` field accepts `"office"` or `"remote"` only

**REST API**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/attendance` | List records; optional `?start=` / `?end=` filters |
| POST | `/api/attendance` | Upsert a record (conflict on `date`) |
| DELETE | `/api/attendance/<date>` | Remove a record |
| GET | `/api/stats` | Weekly + cumulative stats (Sydney time) |
| GET/POST | `/api/settings` | Read/write settings |
| GET | `/api/export` | Download CSV |

**Frontend (`static/app.js`, `static/style.css`, `templates/index.html`)**
- No framework — all DOM manipulation is vanilla JS
- `API` object wraps all fetch calls
- On load, `init()` calls `loadStats()`, `loadAttendance()`, and `loadWeeklyGraphAndCumulative()` in sequence
- Weekly chart counts from the first Monday on/after March 1 of the current year
- Compliance tracking: 80% of `required_days_per_week` (default 2) is the minimum threshold
