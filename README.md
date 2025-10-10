# Memory Lane Snapshot

Memory Lane Snapshot is a hackathon-ready prototype that pairs a Chrome extension with a Flask backend to capture, enrich, and search the content you come across online. It turns snippets, pages, and highlights into a personal, AI-tagged memory library that you can revisit by keyword, emotion, or timeline.

## Features

 - **Automatic capture** on page load (with SPA navigation support) plus one-click capture from the popup or context menu.
- **Lightweight AI pipeline** for summaries, keyword extraction, and sentiment-driven emotion tags.
- **Search & timeline API + web dashboard** so you can browse captures from the browser.
- **SQLite storage** with quick stats for recent activity and top topics.
- **Privacy first defaults**: processing runs locally on your machine.

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

## Chrome Extension Setup

1. In Chrome, open `chrome://extensions/` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `extension` folder in this project.
3. Keep the Flask backend running while using the extension.
4. Navigate the web—content is automatically captured (deduped per URL for ~1 minute).
5. Optionally click the Memory Lane icon to search or manually capture.
6. Right-click any page or selection and choose **Save to Memory Lane Snapshot** for ad-hoc saves.

## AI Pipeline Overview

The backend relies on local heuristics so you can demo without cloud credentials:

- **Summaries**: First one or two sentences (trimmed to 400 chars).
- **Keywords**: Frequency-based extraction filtered by a lightweight stopword list.
- **Emotion labels**: Derived from VADER sentiment scores mapped to human-friendly buckets.

Swap in hosted LLMs or vector databases by replacing `memory_lane/ai_pipeline.py` if you have access during the hackathon.

## Extending the Prototype

- Add a lightweight web dashboard (React, Vue, or Svelte) that consumes the existing API.
- Replace the heuristic pipeline with OpenAI, Azure AI, or Hugging Face models.
- Persist embeddings with a vector store (e.g., Chroma, Pinecone) for semantic search.
- Sync across devices by wiring up authentication and remote storage.
- Generate shareable “memory snapshots” reports (PDF/HTML) from `/api/timeline` data.

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
- Delete `memory_lane.db` to reset the library; the database recreates automatically.
 - To temporarily pause auto-capture, toggle the extension off in `chrome://extensions` or remove the `content_scripts` section from `manifest.json` during demos.

Happy hacking!
