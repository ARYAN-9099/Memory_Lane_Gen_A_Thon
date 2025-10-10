from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import os
import requests
import google.generativeai as genai
from dotenv import load_dotenv
load_dotenv()  # take environment variables from .env file

gemini_api_key = os.getenv("GEMINI_API_KEY")

#section to configure gemini api

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




_SENTENCE_PATTERN = re.compile(r"(?<=[.!?]) +")
_WORD_PATTERN = re.compile(r"[A-Za-z][A-Za-z\-']+")
_STOPWORDS = {
    "the",
    "and",
    "with",
    "that",
    "have",
    "this",
    "from",
    "your",
    "about",
    "would",
    "there",
    "could",
    "which",
    "their",
    "what",
    "when",
    "where",
    "were",
    "been",
    "into",
    "also",
    "more",
    "than",
    "because",
    "other",
    "while",
    "just",
    "like",
    "some",
    "very",
    "such",
    "those",
    "over",
    "each",
    "make",
    "made",
    "after",
    "before",
    "through",
    "them",
    "they",
    "will",
    "between",
    "might",
    "were",
    "them",
    "when",
    "there",
    "been",
    "than",
    "also",
    "only",
    "even",
    "other",
    "does",
    "every",
    "across",
}
_EMOTION_THRESHOLDS = {
    "excited": 0.6,
    "happy": 0.2,
    "neutral": -0.1,
    "thoughtful": -0.3,
}


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
            response = model.generate_content(
                f"Summarize the following text in one or two sentences. Output only the summary:\n\n{text}"
            )
            summary = response.text.strip() if response.text else ""
            return summary or (text[:150] + "..." if len(text) > 150 else text)

        except Exception as e:
            print(f"Error occurred while summarizing text: {e}")
            return text[:147] + "..." if len(text) > 150 else text

    def extract_keywords(self, text: str, limit: int = 8) -> list[str]:
        words = [w.lower() for w in _WORD_PATTERN.findall(text)]
        filtered = [w for w in words if w not in _STOPWORDS and len(w) > 2]
        if not filtered:
            return words[:limit]
        counts = Counter(filtered)
        ranked = [word for word, _ in counts.most_common(limit)]
        return ranked

    def analyse_sentiment(self, text: str) -> tuple[str, float]:
        scores = self._sentiment.polarity_scores(text or "")
        compound = scores.get("compound", 0.0)
        emotion = self._map_emotion(compound)
        return emotion, compound

    def process(self, text: str) -> ProcessedContent:
        summary = self.summarise(text)
        keywords = self.extract_keywords(text)
        emotion, score = self.analyse_sentiment(text)
        return ProcessedContent(summary, keywords, emotion, score)

    def _map_emotion(self, compound: float) -> str:
        for emotion, threshold in _EMOTION_THRESHOLDS.items():
            if compound >= threshold:
                return emotion
        return "reflective"
