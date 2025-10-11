from __future__ import annotations

import json
import sqlite3
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Generator

# Try to import sentence-transformers for semantic search
try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    SEMANTIC_SEARCH_AVAILABLE = True
    # Initialize model lazily
    _semantic_model = None
    # Cache for tag embeddings to speed up repeated searches
    _tag_embeddings_cache = {}
except ImportError:
    SEMANTIC_SEARCH_AVAILABLE = False
    _semantic_model = None
    _tag_embeddings_cache = {}


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
        created_at = datetime.now().isoformat()
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

    def _get_semantic_model(self):
        """Lazy load semantic model."""
        global _semantic_model
        if SEMANTIC_SEARCH_AVAILABLE and _semantic_model is None:
            try:
                _semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
            except Exception:
                pass
        return _semantic_model

    def _find_similar_tags(self, query: str, user_id: int, threshold: float = 0.5) -> set[str]:
        """Find tags semantically similar to the query using sentence embeddings."""
        if not SEMANTIC_SEARCH_AVAILABLE:
            return set()
        
        try:
            model = self._get_semantic_model()
            if model is None:
                return set()
            
            # Create cache key
            cache_key = f"user_{user_id}"
            
            # Check if we have cached embeddings for this user
            if cache_key not in _tag_embeddings_cache:
                # Get all unique tags for this user
                with self._get_connection() as conn:
                    rows = conn.execute(
                        """
                        SELECT DISTINCT t.tag 
                        FROM tags t 
                        JOIN items i ON t.item_id = i.id 
                        WHERE i.user_id = ?
                        """,
                        (user_id,)
                    ).fetchall()
                
                if not rows:
                    return set()
                
                all_tags = [row['tag'] for row in rows]
                
                # Encode and cache
                tag_embeddings = model.encode(all_tags)
                _tag_embeddings_cache[cache_key] = {
                    'tags': all_tags,
                    'embeddings': tag_embeddings
                }
            
            # Get cached data
            cached = _tag_embeddings_cache[cache_key]
            all_tags = cached['tags']
            tag_embeddings = cached['embeddings']
            
            # Encode query
            query_embedding = model.encode([query])[0]
            
            # Calculate cosine similarities
            similarities = np.dot(tag_embeddings, query_embedding) / (
                np.linalg.norm(tag_embeddings, axis=1) * np.linalg.norm(query_embedding)
            )
            
            # Get tags above threshold
            similar_tags = set()
            for tag, similarity in zip(all_tags, similarities):
                if similarity >= threshold:
                    similar_tags.add(tag.lower())
            
            return similar_tags
        except Exception as e:
            print(f"Semantic search error: {e}")
            return set()

    # In memory_lane/database.py

    def search_items(
        self,
        user_id: int,
        query: str | None = None,
        emotion: str | None = None,
        limit: int = 25,
        use_semantic: bool = False,
    ) -> tuple[list[Item], bool]:
        """Search items using a proper JOIN on the tags table with optional semantic tag matching.
        
        Args:
            user_id: The user's ID
            query: Search query string
            emotion: Filter by emotion
            limit: Maximum number of results
            use_semantic: Whether to use semantic search (default: False for speed)
        
        Returns:
            tuple: (list of items, whether semantic search was used)
        """
        
        # Start with the base query joining items and tags
        # We use DISTINCT to avoid getting duplicate items if they match multiple tags
        sql_parts = [
            "SELECT DISTINCT i.* FROM items i",
            "LEFT JOIN tags t ON i.id = t.item_id",
            "WHERE i.user_id = ?"
        ]
        params: list[Any] = [user_id]
        semantic_used = False

        if query:
            query_lower = query.lower()
            
            # Only use semantic search if explicitly requested
            if use_semantic:
                # Find semantically similar tags
                similar_tags = self._find_similar_tags(query, user_id, threshold=0.5)
                
                if similar_tags:
                    semantic_used = True
                    # Build condition for semantic tags
                    tag_conditions = " OR ".join(["LOWER(t.tag) = ?" for _ in similar_tags])
                    sql_parts.append(
                        f"AND (LOWER(i.title) LIKE ? OR LOWER(i.summary) LIKE ? OR LOWER(t.tag) LIKE ? OR ({tag_conditions}))"
                    )
                    like_query = f"%{query_lower}%"
                    params.extend([like_query, like_query, like_query])
                    params.extend(list(similar_tags))
                else:
                    # Fallback to regular search if no similar tags found
                    sql_parts.append(
                        "AND (LOWER(i.title) LIKE ? OR LOWER(i.summary) LIKE ? OR LOWER(t.tag) LIKE ?)"
                    )
                    like_query = f"%{query_lower}%"
                    params.extend([like_query, like_query, like_query])
            else:
                # Regular search without semantic matching (faster)
                sql_parts.append(
                    "AND (LOWER(i.title) LIKE ? OR LOWER(i.summary) LIKE ? OR LOWER(t.tag) LIKE ?)"
                )
                like_query = f"%{query_lower}%"
                params.extend([like_query, like_query, like_query])

        if emotion:
            emotion_lower = emotion.lower()
            sql_parts.append("AND LOWER(i.emotion) = ?")
            params.append(emotion_lower)

        sql_parts.append("ORDER BY datetime(i.created_at) DESC LIMIT ?")
        params.append(limit)

        final_sql = " ".join(sql_parts)

        with self._get_connection() as conn:
            rows = conn.execute(final_sql, params).fetchall()
            return [Item.from_row(row) for row in rows], semantic_used

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
        created_at = datetime.now().isoformat()
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
