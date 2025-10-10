from __future__ import annotations

import logging
from typing import Optional, Tuple

import requests
import trafilatura
from bs4 import BeautifulSoup
from readability import Document

DEFAULT_TIMEOUT = 12
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MemoryLane/1.0 "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def fetch_html(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=DEFAULT_TIMEOUT, allow_redirects=True)
        if resp.ok and "text/html" in (resp.headers.get("Content-Type") or ""):
            return resp.text
    except Exception as e:
        logging.warning("fetch_html failed for %s: %s", url, e)
    return None


def extract_with_trafilatura(html: str) -> tuple[Optional[str], Optional[str]]:
    try:
        text = trafilatura.extract(html, include_comments=False, include_tables=False, favor_recall=True)
        meta = trafilatura.extract_metadata(html)
        title = meta.title if meta else None
        return text, title
    except Exception:
        return None, None


def extract_with_readability(html: str) -> tuple[Optional[str], Optional[str]]:
    try:
        doc = Document(html)
        title = doc.short_title()
        article_html = doc.summary(html_partial=True)
        text = BeautifulSoup(article_html, "lxml").get_text("\n", strip=True)
        return text or None, title or None
    except Exception:
        return None, None


def extract_text(url: str, html: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
    page_html = html or fetch_html(url)
    if not page_html:
        return None, None

    text, title = extract_with_trafilatura(page_html)
    if not text:
        text, title2 = extract_with_readability(page_html)
        title = title or title2

    return text, title
