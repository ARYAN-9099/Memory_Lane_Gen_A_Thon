from __future__ import annotations

import json
import sqlite3
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Generator


@dataclass
class Item:
    id: int
    url: str
    title: str
    source: str
    content_type: str
    content: str
    summary: str
    keywords: list[str]
    emotion: str
    sentiment_score: float
    thumbnail: str | None
    created_at: datetime

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "Item":
        return cls(
            id=row["id"],
            url=row["url"],
            title=row["title"],
            source=row["source"],
            content_type=row["content_type"],
            content=row["content"],
            summary=row["summary"],
            keywords=json.loads(row["keywords"] or "[]"),
            emotion=row["emotion"],
            sentiment_score=row["sentiment_score"],
            thumbnail=row["thumbnail"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "source": self.source,
            "contentType": self.content_type,
            "content": self.content,
            "summary": self.summary,
            "keywords": self.keywords,
            "emotion": self.emotion,
            "sentimentScore": self.sentiment_score,
            "thumbnail": self.thumbnail,
            "createdAt": self.created_at.isoformat(),
        }


class Database:
    """Thin wrapper around sqlite3 for storing captured items."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT,
                    title TEXT,
                    source TEXT,
                    content_type TEXT,
                    content TEXT,
                    summary TEXT,
                    keywords TEXT,
                    emotion TEXT,
                    sentiment_score REAL,
                    thumbnail TEXT,
                    created_at TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                    tag TEXT NOT NULL
                )
                """
            )
            conn.commit()

    @contextmanager
    def _get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def insert_item(
        self,
        url: str,
        title: str,
        source: str,
        content_type: str,
        content: str,
        summary: str,
        keywords: list[str],
        emotion: str,
        sentiment_score: float,
        thumbnail: str | None,
    ) -> Item:
        created_at = datetime.utcnow().isoformat()
        payload = (
            url,
            title,
            source,
            content_type,
            content,
            summary,
            json.dumps(keywords),
            emotion,
            sentiment_score,
            thumbnail,
            created_at,
        )
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO items (
                    url, title, source, content_type, content, summary,
                    keywords, emotion, sentiment_score, thumbnail, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                payload,
            )
            item_id = cursor.lastrowid
            for tag in keywords:
                cursor.execute("INSERT INTO tags (item_id, tag) VALUES (?, ?)", (item_id, tag))
            conn.commit()
            cursor.execute("SELECT * FROM items WHERE id = ?", (item_id,))
            row = cursor.fetchone()
            return Item.from_row(row)

    def search_items(
        self,
        query: str | None = None,
        emotion: str | None = None,
        limit: int = 25,
    ) -> list[Item]:
        sql = "SELECT * FROM items"
        params: list[Any] = []
        clauses: list[str] = []

        if query:
            clauses.append(
                "(title LIKE ? OR summary LIKE ? OR content LIKE ? OR keywords LIKE ?)"
            )
            like_query = f"%{query}%"
            params.extend([like_query] * 4)

        if emotion:
            clauses.append("emotion = ?")
            params.append(emotion)

        if clauses:
            sql += " WHERE " + " AND ".join(clauses)

        sql += " ORDER BY datetime(created_at) DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [Item.from_row(row) for row in rows]

    def get_item(self, item_id: int) -> Item | None:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
            return Item.from_row(row) if row else None

    def list_recent(self, limit: int = 10) -> list[Item]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM items ORDER BY datetime(created_at) DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [Item.from_row(row) for row in rows]

    def get_insights(self) -> dict[str, Any]:
        with self._get_connection() as conn:
            total_items = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
            by_content_type = conn.execute(
                "SELECT content_type, COUNT(*) as count FROM items GROUP BY content_type"
            ).fetchall()
            by_emotion = conn.execute(
                "SELECT emotion, COUNT(*) as count FROM items GROUP BY emotion"
            ).fetchall()
            top_tags = conn.execute(
                "SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC LIMIT 10"
            ).fetchall()

        return {
            "totalItems": total_items,
            "byContentType": {row["content_type"]: row["count"] for row in by_content_type},
            "byEmotion": {row["emotion"]: row["count"] for row in by_emotion},
            "topTags": [
                {"tag": row["tag"], "count": row["count"]}
                for row in top_tags
            ],
        }

    def delete_item(self, item_id: int) -> None:
        with self._get_connection() as conn:
            conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
            conn.execute("DELETE FROM tags WHERE item_id = ?", (item_id,))
            conn.commit()

    def clear_all(self) -> None:
        with self._get_connection() as conn:
            conn.execute("DELETE FROM items")
            conn.execute("DELETE FROM tags")
            conn.commit()

    def export_keywords(self) -> Counter[str]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT tag FROM tags").fetchall()
        counts: Counter[str] = Counter(row["tag"] for row in rows)
        return counts
