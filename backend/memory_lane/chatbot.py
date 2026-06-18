from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv

from .database import Database

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_model = None

try:
    if GEMINI_API_KEY:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        generation_config = {
            "temperature": 0.2,
            "top_p": 0.95,
            "max_output_tokens": 512,
        }
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ]
        try:
            gemini_model = genai.GenerativeModel(
                model_name="gemini-3.1-flash-lite-preview",
                generation_config=generation_config,
                safety_settings=safety_settings,
            )
        except Exception:
            gemini_model = None
except Exception:
    gemini_model = None


def _format_chat_memory_block(item: Any, index: int) -> str:
    keywords = ", ".join(item.keywords[:6]) if item.keywords else "none"
    summary = (item.summary or "").strip() or "No summary available."
    content = (item.content or "").strip()
    snippet_source = content if content else summary
    if len(snippet_source) > 900:
        snippet_source = snippet_source[:900].rstrip() + "..."

    return (
        f"Memory {index}\n"
        f"Time: {item.created_at.isoformat()}\n"
        f"Title: {item.title or 'Untitled capture'}\n"
        f"Source: {item.source or 'unknown'}\n"
        f"URL: {item.url or 'unknown'}\n"
        f"Emotion: {item.emotion or 'unknown'}\n"
        f"Sentiment: {item.sentiment_score:.2f}\n"
        f"Keywords: {keywords}\n"
        f"Summary: {summary}\n"
        f"Snippet: {snippet_source}"
    )


def generate_chat_reply(user_message: str, database: Database, user_id: int) -> str:
    if not gemini_model:
        return ""

    try:
        memories = database.fetch_chat_context_items(user_id, query=user_message, limit=8, use_semantic=True)
        ctx_items = [_format_chat_memory_block(item, idx) for idx, item in enumerate(memories[:8], start=1)]
        context_block = "\n\n---\n\n".join(ctx_items) if ctx_items else "(no stored memories available)"

        prompt = (
            "You are a concise assistant with access to a user's personal memory history. "
            "Use the provided memories below to answer the question. "
            "If the user asks when they visited a site, answer with the best matching time and the URL from the memory context. "
            "If there are several matches, list the most relevant ones. "
            "If the answer is not present, say so plainly and do not guess.\n\n"
            "User memories (most relevant first):\n" + context_block + "\n\n"
            "User question: " + user_message + "\nAssistant:"
        )

        response = gemini_model.generate_content(prompt)
        if hasattr(response, "text"):
            return (response.text or "").strip()
        return str(response).strip()
    except Exception as e:
        print(f"Gemini generation (with context) failed: {e}")
        return ""


def chatbot_configured() -> bool:
    return gemini_model is not None