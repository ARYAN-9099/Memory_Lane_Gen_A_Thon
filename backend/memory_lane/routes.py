from __future__ import annotations

from urllib.parse import urlparse

from flask import Blueprint, Flask, jsonify, request

from .ai_pipeline import AIPipeline
from .database import Database


def register_routes(app: Flask, database: Database) -> None:
    api = Blueprint("memory_lane", __name__, url_prefix="/api")
    pipeline = AIPipeline()

    @api.route("/capture", methods=["POST"])
    def capture_content():
        payload = request.get_json(force=True, silent=True) or {}
        url = payload.get("url", "")
        title = payload.get("title") or "Untitled capture"
        source = payload.get("source") or _derive_source(url)
        content_type = payload.get("contentType") or _infer_content_type(payload.get("mimeType"))
        content = payload.get("content") or payload.get("selection") or ""
        thumbnail = payload.get("thumbnail")

        processed = pipeline.process(f"{title}. {content}")
        item = database.insert_item(
            url=url,
            title=title,
            source=source,
            content_type=content_type,
            content=content,
            summary=processed.summary,
            keywords=processed.keywords,
            emotion=processed.emotion,
            sentiment_score=processed.sentiment_score,
            thumbnail=thumbnail,
        )
        return jsonify({"item": item.to_dict()}), 201

    @api.route("/search", methods=["GET"])
    def search_items():
        query = request.args.get("q")
        emotion = request.args.get("emotion")
        limit = int(request.args.get("limit", 25))
        items = database.search_items(query=query, emotion=emotion, limit=limit)
        return jsonify({"results": [item.to_dict() for item in items]})

    @api.route("/items/<int:item_id>", methods=["GET"])
    def get_item(item_id: int):
        item = database.get_item(item_id)
        if not item:
            return jsonify({"error": "Item not found"}), 404
        return jsonify({"item": item.to_dict()})

    @api.route("/timeline", methods=["GET"])
    def timeline():
        limit = int(request.args.get("limit", 20))
        items = database.list_recent(limit=limit)
        return jsonify({"items": [item.to_dict() for item in items]})

    @api.route("/insights", methods=["GET"])
    def insights():
        return jsonify(database.get_insights())

    @api.route("/items/<int:item_id>", methods=["DELETE"])
    def delete_item(item_id: int):
        database.delete_item(item_id)
        return ("", 204)

    app.register_blueprint(api)


def _derive_source(url: str) -> str:
    if not url:
        return "unknown"
    parsed = urlparse(url)
    hostname = parsed.hostname or "unknown"
    return hostname.lstrip("www.")


def _infer_content_type(mime_type: str | None) -> str:
    if not mime_type:
        return "web"
    if "video" in mime_type:
        return "video"
    if "image" in mime_type:
        return "image"
    if "pdf" in mime_type:
        return "document"
    return "web"
