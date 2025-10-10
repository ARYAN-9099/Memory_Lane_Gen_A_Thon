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
    user_id: int
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
    processed: bool
    processing_error: str | None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "Item":
        return cls(
            id=row["id"],
            user_id=row["user_id"],
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
            processed=bool(row["processed"]) if "processed" in row.keys() else True,
            processing_error=row["processing_error"] if "processing_error" in row.keys() else None,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "userId": self.user_id,
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
            "processed": self.processed,
            "processingError": self.processing_error,
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
                    user_id INTEGER,
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
                    created_at TEXT,
                    processed INTEGER DEFAULT 1,
                    processing_error TEXT
                )
                """
            )
            # Users table
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    api_token TEXT UNIQUE NOT NULL,
                    created_at TEXT NOT NULL
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
            # Migration: ensure user_id column exists on items
            try:
                conn.execute("ALTER TABLE items ADD COLUMN user_id INTEGER")
            except Exception:
                pass
            # Migration: ensure processed columns exist
            try:
                conn.execute("ALTER TABLE items ADD COLUMN processed INTEGER DEFAULT 1")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE items ADD COLUMN processing_error TEXT")
            except Exception:
                pass
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
        user_id: int,
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
        processed: bool = True,
        processing_error: str | None = None,
    ) -> Item:
        created_at = datetime.utcnow().isoformat()
        payload = (
            user_id,
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
            1 if processed else 0,
            processing_error,
        )
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO items (
                    user_id, url, title, source, content_type, content, summary,
                    keywords, emotion, sentiment_score, thumbnail, created_at,
                    processed, processing_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    def update_item_enrichment(
        self,
        user_id: int,
        item_id: int,
        summary: str,
        keywords: list[str],
        emotion: str,
        sentiment_score: float,
        processing_error: str | None = None,
    ) -> Item | None:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE items
                SET summary = ?, keywords = ?, emotion = ?, sentiment_score = ?,
                    processed = 1, processing_error = ?
                WHERE id = ? AND user_id = ?
                """,
                (summary, json.dumps(keywords), emotion, sentiment_score, processing_error, item_id, user_id),
            )
            # Reset tags
            cur.execute("DELETE FROM tags WHERE item_id = ?", (item_id,))
            for tag in keywords:
                cur.execute("INSERT INTO tags (item_id, tag) VALUES (?, ?)", (item_id, tag))
            conn.commit()
            row = cur.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
            return Item.from_row(row) if row else None

    def search_items(
        self,
        user_id: int,
        query: str | None = None,
        emotion: str | None = None,
        limit: int = 25,
    ) -> list[Item]:
        sql = "SELECT * FROM items WHERE user_id = ?"
        params: list[Any] = [user_id]
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
            sql += " AND " + " AND ".join(clauses)

        sql += " ORDER BY datetime(created_at) DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [Item.from_row(row) for row in rows]

    def get_item(self, user_id: int, item_id: int) -> Item | None:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM items WHERE id = ? AND user_id = ?", (item_id, user_id)).fetchone()
            return Item.from_row(row) if row else None

    def list_recent(self, user_id: int, limit: int = 10) -> list[Item]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM items WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
            return [Item.from_row(row) for row in rows]

    def get_insights(self, user_id: int) -> dict[str, Any]:
        with self._get_connection() as conn:
            total_items = conn.execute("SELECT COUNT(*) FROM items WHERE user_id = ?", (user_id,)).fetchone()[0]
            by_content_type = conn.execute(
                "SELECT content_type, COUNT(*) as count FROM items WHERE user_id = ? GROUP BY content_type",
                (user_id,),
            ).fetchall()
            by_emotion = conn.execute(
                "SELECT emotion, COUNT(*) as count FROM items WHERE user_id = ? GROUP BY emotion",
                (user_id,),
            ).fetchall()
            top_tags = conn.execute(
                """
                SELECT t.tag, COUNT(*) as count
                FROM tags t
                JOIN items i ON i.id = t.item_id
                WHERE i.user_id = ?
                GROUP BY t.tag
                ORDER BY count DESC
                LIMIT 10
                """,
                (user_id,),
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

    def delete_item(self, user_id: int, item_id: int) -> None:
        with self._get_connection() as conn:
            conn.execute("DELETE FROM items WHERE id = ? AND user_id = ?", (item_id, user_id))
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

    # User helpers
    def create_user(self, email: str, password_hash: str, api_token: str) -> int:
        created_at = datetime.utcnow().isoformat()
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO users (email, password_hash, api_token, created_at) VALUES (?, ?, ?, ?)",
                (email, password_hash, api_token, created_at),
            )
            conn.commit()
            return int(cur.lastrowid)

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            return dict(row) if row else None

    def get_user_by_token(self, token: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE api_token = ?", (token,)).fetchone()
            return dict(row) if row else None

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            return dict(row) if row else None
