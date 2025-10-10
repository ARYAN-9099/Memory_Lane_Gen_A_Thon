# Memory Lane Snapshot

Memory Lane Snapshot is a hackathon-ready prototype that pairs a Chrome extension with a Flask backend to capture, enrich, and search the content you come across online. It turns snippets, pages, and highlights into a personal, per-user AI-tagged memory library that you can revisit by keyword, emotion, or timeline.

## Features

 - **Automatic capture** on page load (with SPA navigation support) plus one-click capture from the popup or context menu.
 - **Per-user authentication** with website session login and extension Bearer tokens; your data is scoped to your account.
 - **Lightweight AI pipeline** for summaries, keyword extraction, and sentiment-driven emotion tags (local by default; bring your own LLM optionally).
 - **Search & timeline API + web dashboard** so you can browse captures from the browser.
 - **Server-side content extraction** from URLs with client-side fallback when needed for more complete text.
 - **SQLite storage** with quick stats for recent activity and top topics.
 - **Privacy-first defaults**: processing runs locally on your machine.

## Project Structure

```
backend/         Flask API, AI processing pipeline, and web dashboard
extension/       Chrome extension (Manifest v3)
```

## Prerequisites

- Python 3.10+
- Google Chrome 114+
- (Optional) Node.js 18+ if you plan to build extra tooling or dashboards

## Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The API and dashboard run on `http://localhost:5000`. Endpoints include:

- `POST /api/capture` — store a new item (used by the extension).
- `GET /api/search` — query the library with `q=` and optional `emotion=` filter.
- `GET /api/timeline` — list the latest captured items.
- `GET /api/insights` — aggregate stats for dashboards.
- `GET /api/health` — quick health check for monitors.

Alternatively, you can use the preconfigured VS Code task:

```powershell
# From the repo root in VS Code, open the Command Palette and run "Tasks: Run Task" → "Run Flask backend"
```

### Authentication

This app supports per-user data scoping. There are two auth paths:

- Website session login (cookies):
	- Visit `http://localhost:5000/login` and register or log in.
	- Once logged in, visiting `http://localhost:5000/` renders the dashboard for your account.

- Extension Bearer token:
	- In the popup, enter your email/password and click Login. The extension stores the token and sends it as `Authorization: Bearer <token>` for API calls.

Demo credentials are seeded for convenience:

- Email: `demo@example.com`
- Password: `demo1234`

You can also create your own account via `POST /api/auth/register` with `{ email, password }`.

### Server-side extraction and fallback

To improve capture quality and reduce extension overhead, the extension sends URL + small metadata. The backend fetches the page and extracts text using Trafilatura with a readability fallback. If server extraction can’t obtain enough text, the extension retries with a client-side visible-text capture.

Environment variables:

- `SECRET_KEY` — Flask session secret (set a strong value in production).
- `MEMORY_LANE_DB` — Path to the SQLite DB file (defaults to `memory_lane.db` in the backend folder).
- `DEMO_USER_TOKEN` — Optional fixed API token for the demo user.
- `GEMINI_API_KEY` — Optional if you wire up Gemini in `memory_lane/ai_pipeline.py`.

## Chrome Extension Setup

1. In Chrome, open `chrome://extensions/` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `extension` folder in this project.
3. Keep the Flask backend running while using the extension.
4. Navigate the web—content is automatically captured (deduped per URL for ~1 minute).
5. Optionally click the Memory Lane icon to search or manually capture.
6. Right-click any page or selection and choose **Save to Memory Lane Snapshot** for ad-hoc saves.

Login from the popup to enable per-user capture and search. If you’re using a non-default backend port or host, update `BACKEND_URL` inside `extension/background.js`.

## AI Pipeline Overview

The backend relies on local heuristics so you can demo without cloud credentials:

- **Summaries**: First one or two sentences (trimmed to 400 chars).
- **Keywords**: Frequency-based extraction filtered by a lightweight stopword list.
- **Emotion labels**: Derived from VADER sentiment scores mapped to human-friendly buckets.

Swap in hosted LLMs or vector databases by extending or replacing `backend/memory_lane/ai_pipeline.py`. If using Gemini, ensure calls use `generate_content` and return `response.text.strip()`.

## Extending the Prototype

- Add a lightweight web dashboard (React, Vue, or Svelte) that consumes the existing API.
- Replace the heuristic pipeline with OpenAI, Azure AI, or Hugging Face models.
- Persist embeddings with a vector store (e.g., Chroma, Pinecone) for semantic search.
- Sync across devices by wiring up authentication and remote storage.
- Generate shareable “memory snapshots” reports (PDF/HTML) from `/api/timeline` data.

Optional next steps already supported by the codebase design:

- Decouple slow enrichment (e.g., heavy taggers) with a background worker and processed flags to avoid blocking `POST /api/capture`.

## Testing the Flow

1. Start the Flask API.
2. Load the extension and open an article.
3. Click **Capture** in the popup.
4. Use the popup search bar to find the capture by keyword or emotion.
5. Open `http://localhost:5000/` to explore the dashboard and confirm timelines/insights update.
6. Check the API responses via `curl http://localhost:5000/api/timeline` if you need raw JSON.

## Troubleshooting

- If captures fail, confirm the Flask server is running and CORS is enabled (already configured).
 - Update `BACKEND_URL` inside `extension/background.js` if the server runs on a different origin.
 - If you can’t log in from the extension, check the backend port and that the token is being sent in requests.
 - Delete `backend/memory_lane.db` (or the path set by `MEMORY_LANE_DB`) to reset; the database recreates automatically.
 - To temporarily pause auto-capture, toggle the extension off in `chrome://extensions` or remove the `content_scripts` section from `manifest.json` during demos.

If you hit extraction issues, ensure the following Python packages are installed as per `backend/requirements.txt`: `trafilatura`, `readability-lxml`, `beautifulsoup4`, `lxml`.

Happy hacking!
