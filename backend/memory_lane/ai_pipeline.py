from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import os
import google.generativeai as genai
import ast
import re

from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env file

gemini_api_key = os.getenv("GEMINI_API_KEY")

# Configure Gemini only if key present
model = None
if gemini_api_key:
    try:
        genai.configure(api_key=gemini_api_key)
        generation_config = {
            "temperature": 0.7,
            "top_p": 0.95,
            "top_k": 1,
            "max_output_tokens": 8192,
        }
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ]
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            generation_config=generation_config,
            safety_settings=safety_settings,
        )
    except Exception:
        model = None

# Try to import ollama, but allow absence
try:
    import ollama  # type: ignore
    OLLAMA_AVAILABLE = True
except Exception:
    ollama = None  # type: ignore
    OLLAMA_AVAILABLE = False


@dataclass
class ProcessedContent:
    summary: str
    keywords: list[str]
    emotion: str
    sentiment_score: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary,
            "keywords": self.keywords,
            "emotion": self.emotion,
            "sentimentScore": self.sentiment_score,
        }


class AIPipeline:
    """Lightweight, offline-friendly heuristics for tagging captured content."""

    def __init__(self) -> None:
        self._sentiment = SentimentIntensityAnalyzer()

    def summarise(self, text: str) -> str:
        try:
            if model is None:
                # Fallback: simple heuristic if no Gemini key
                return (text[:150] + "...") if len(text) > 150 else text
            response = model.generate_content(
                f"Summarize the following text in one or two sentences. Output only the summary:\n\n{text}"
            )
            summary = response.text.strip() if getattr(response, "text", "") else ""
            return summary or ((text[:150] + "...") if len(text) > 150 else text)
        except Exception as e:
            print(f"Error occurred while summarizing text: {e}")
            return (text[:147] + "...") if len(text) > 150 else text

    @staticmethod
    def get_tags_and_emotion(text: str):
        """
        Returns either a Python list like ['tag1','tag2','tag3','emotion'] or a raw string to parse.
        """
        if not OLLAMA_AVAILABLE:
            return ""
        try:
            resp = ollama.chat(
                model="llama3",
                messages=[{"role": "user", "content": (
                    "Given the following text, return a Python list with 3 single-word tags that best describe the text, "
                    "and 1 emotion word (choose from: happy, sad, angry, surprised, neutral, funny, shocking, helpful). "
                    "Format exactly as a Python list: ['tag1', 'tag2', 'tag3', 'emotion'].\n\n"
                    f"Text: {text}"
                )}],
            )
            content = (resp or {}).get("message", {}).get("content", "").strip()
            # Try to parse as a Python list first
            try:
                parsed = ast.literal_eval(content)
                if isinstance(parsed, list) and len(parsed) == 4:
                    return parsed
            except Exception:
                pass
            return content  # raw string fallback
        except Exception as e:
            # Ollama not installed/model not pulled/etc.
            print(f"Ollama tagger error: {e}")
            return ""

    @staticmethod
    def get_list(result) -> list[str] | None:
        # Accept either raw string "[...]" or textual content that includes brackets
        if isinstance(result, list):
            return [str(x).strip().strip("'\"") for x in result]
        if not isinstance(result, str):
            return None
        start = result.find("[")
        end = result.find("]", start)
        if start != -1 and end != -1:
            list_content = result[start + 1 : end]
            items = [item.strip().strip("'\"") for item in list_content.split(",")]
            return items
        return None

    def _basic_keywords(self, text: str, limit: int = 8) -> list[str]:
        word_pattern = re.compile(r"[A-Za-z][A-Za-z\-']+")
        stopwords = {
            "the","and","with","that","have","this","from","your","about","would","there","could",
            "which","their","what","when","where","were","been","into","also","more","than","because",
            "other","while","just","like","some","very","such","those","over","each","make","made",
            "after","before","through","them","they","will","between","might","only","even","does","every",
            "across","for","you","are","but","not","can","use","using","used","how","why","who","whom",
        }
        words = [w.lower() for w in word_pattern.findall(text or "")]
        filtered = [w for w in words if w not in stopwords and len(w) > 2]
        if not filtered:
            return words[:limit]
        counts = Counter(filtered)
        return [w for w, _ in counts.most_common(limit)]

    def extract_keywords_and_emotion(self, text: str, limit: int = 8):
        raw = self.get_tags_and_emotion(text)
        parsed = self.get_list(raw)
        if isinstance(parsed, list) and len(parsed) >= 4:
            keywords = [k for k in parsed[:3] if k][:limit]
            emotion = parsed[3] or ""
            return keywords, emotion
        # Fallback: heuristic keywords, emotion unknown for now
        return self._basic_keywords(text, limit=limit), ""

    def analyse_sentiment(self, text: str) -> float:
        scores = self._sentiment.polarity_scores(text or "")
        return float(scores.get("compound", 0.0))

    def process(self, text: str) -> ProcessedContent:
        summary = self.summarise(text)
        score = self.analyse_sentiment(text)
        keywords, emotion = self.extract_keywords_and_emotion(text)
        if not emotion:
            # Map sentiment score to one of the requested set: happy/sad/angry/surprised/neutral/funny/shocking/helpful
            if score >= 0.5:
                emotion = "happy"
            elif score <= -0.5:
                emotion = "sad"
            else:
                emotion = "neutral"
        return ProcessedContent(summary, keywords, emotion, score)
