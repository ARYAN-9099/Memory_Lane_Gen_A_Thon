from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import google.generativeai as genai


def main() -> int:
    root = Path(__file__).resolve().parent
    load_dotenv(root / "backend" / ".env")
    load_dotenv()

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is missing")
        return 1

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-3.1-flash-lite-preview")

    try:
        response = model.generate_content("Reply with exactly one word: OK")
        text = getattr(response, "text", "").strip()
        print("Gemini check passed")
        print(text or "(empty response)")
        return 0
    except Exception as exc:
        print(f"Gemini check failed: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())