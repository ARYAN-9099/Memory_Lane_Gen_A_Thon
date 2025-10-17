# 🧠 Memory Lane Snapshot

A working prototype that pairs a Chrome Extension (Manifest v3) with a Flask backend to capture web pages you visit, enrich them locally with fast heuristics, and search your personal library by keyword, emotion, or timeline.

![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-DB-003B57?logo=sqlite&logoColor=white)

---

## What’s implemented

- Auto-capture: content script sends URL, title, meta description, and OG image on page load and SPA navigation; background deduplicates per URL for ~60s
- One-click capture via context menu and popup actions
- Per-user auth: website session for dashboard, plus extension Bearer token stored in `chrome.storage.local`
- Server-side extraction: requests + Trafilatura with readability fallback; client-side full-text retry if server extract is too thin
- Local enrichment: VADER sentiment, heuristic keywords, quick summary (Gemini optional); background worker updates entries asynchronously
- Search API: title/summary/tag search with optional emotion filter; optional semantic tag expansion if `sentence-transformers` is installed
- Timeline and insights: recent items, content-type and emotion counts, and top tags; dashboard UI in `templates/index.html`
- PDF export: `/api/export/pdf` generates a full report when `reportlab` is installed
- Health check: `/api/health`

---

## Project layout

```text
backend/
  app.py                  # Flask app factory; seeds demo user; routes + pages
  requirements.txt        # Python dependencies (optional deps guarded at runtime)
  memory_lane/
    ai_pipeline.py        # Summaries, keywords, sentiment → emotion (optional Gemini/Ollama)
    database.py           # SQLite schema, items/tags/users, search (semantic optional)
    extractor.py          # HTML fetch + Trafilatura → Readability fallback
    pdf_export.py         # reportlab-based PDF export (optional)
    routes.py             # /api endpoints (auth, capture/search/timeline/insights/export/chat)
    worker.py             # ThreadPoolExecutor for background enrichment
  static/css/app.css      # Dashboard styles
  static/js/app.js        # Dashboard behavior
  templates/index.html    # Dashboard SPA
  templates/login.html    # Login/register page

extension/
  manifest.json           # MV3 manifest
  background.js           # Auth, capture orchestration, network calls, context menu
  content.js              # Auto-capture + SPA navigation detection
  popup.html / .css / .js # Popup UI
```

---

## Setup (backend)

```powershell
cd backend
python -m venv .venv
\.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Runs at [http://localhost:5000](http://localhost:5000)

- Dashboard: `GET /` (requires login)
- Login page: `GET /login`

Seeded demo user for local testing:

- Email: `demo@example.com`
- Password: `demo1234`

---

## Setup (Chrome extension)

1. Open `chrome://extensions/` → enable Developer mode
2. Load unpacked → select the `extension/` folder
3. Ensure the backend is running on [http://localhost:5000](http://localhost:5000)
4. In the popup, log in to receive and store your Bearer token

Notes

- The extension posts to `http://localhost:5000` by default; to use a different origin, change `BACKEND_URL` in `extension/background.js`
- Auto-capture excludes some hosts (e.g., localhost, Gmail, Chrome Web Store) and deduplicates per URL for ~60 seconds

---

## API (implemented)

Base URL: `http://localhost:5000`

- `GET /api/health` → `{ status: "ok" }`
- `POST /api/auth/register` → `{ userId, token }`
- `POST /api/auth/login` → `{ userId, token }`
- `POST /api/auth/logout` → 204 (clears website session)
- `GET /api/auth/me` → `{ authenticated: bool, user?: { id, email } }`

Content

- `POST /api/capture`
  - Body: `{ url?, title?, source?, contentType?, content?, selection?, thumbnail?, allowServerExtract? }`
  - Returns: `{ item, extracted: boolean, queued: true }`
- `GET /api/items/{id}` → `{ item }`
- `DELETE /api/items/{id}` → 204

Search & browse

- `GET /api/search?q=...&emotion=...&semantic=true|false&limit=25`
  - `semantic=true` uses sentence-transformers if available; otherwise falls back to normal search
- `GET /api/timeline?limit=20` → `{ items: [...] }`
- `GET /api/insights` → totals, by content type/emotion, top tags
- `GET /api/processing-status` → `{ processing: bool, count }`

Export

- `GET /api/export/pdf` → PDF download (requires `reportlab`)

Chat (optional)

- `POST /api/chat` → `{ reply }` when `GEMINI_API_KEY` is set; otherwise `503` with an error message

Auth headers (extension)

- `Authorization: Bearer <token>` stored via `chrome.storage.local`

---

## Configuration

Environment variables

- `SECRET_KEY` → Flask session secret (dev default provided)
- `MEMORY_LANE_DB` → Path to SQLite DB (default `memory_lane.db` in `backend/`)
- `DEMO_USER_TOKEN` → Optional fixed token for the demo user
- `GEMINI_API_KEY` → Optional; enables Gemini-based summaries and chatbot

Extraction behavior

- The extension sends URL + small metadata
- The server fetches and extracts text (Trafilatura → Readability)
- If extraction is insufficient, the extension retries with visible text from the page

Semantic search

- Install `sentence-transformers` and `numpy` to enable semantic tag expansion
- Controlled by `?semantic=true` on `/api/search`

PDF export

- Install `reportlab` to enable `/api/export/pdf`

---

## Quick test

Semantic search smoke test (optional):

```powershell
cd backend
\.\.venv\Scripts\activate
pip install sentence-transformers numpy
python test_semantic_search.py
```

---

## Tech stack

- Backend: Flask, SQLite, requests, Trafilatura, Readability, VADER Sentiment
- Optional: sentence-transformers (semantic search), reportlab (PDF export), Google Generative AI (Gemini), Ollama (local LLM)
- Frontend: Chrome Extension (MV3), vanilla JS/HTML/CSS; dashboard templates and static assets in `backend/static` and `backend/templates`

---

## Team

- Aryan Mane
- Chataniya Dhanai
- Shubham Kumar Das
