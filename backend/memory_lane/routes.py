from __future__ import annotations

from urllib.parse import urlparse
import secrets
from datetime import datetime

from flask import Blueprint, Flask, jsonify, request, session, redirect, url_for, g, send_file
from werkzeug.security import generate_password_hash, check_password_hash

from .ai_pipeline import AIPipeline
from .database import Database
from .extractor import extract_text
from .worker import EnrichmentWorker
from .pdf_export import generate_user_pdf, REPORTLAB_AVAILABLE


def register_routes(app: Flask, database: Database) -> None:
    api = Blueprint("memory_lane", __name__, url_prefix="/api")
    pipeline = AIPipeline()
    worker = EnrichmentWorker(max_workers=2)

    def _get_auth_user() -> dict | None:
        # 1) Token from Authorization header for extension/API
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1].strip()
            if token:
                return database.get_user_by_token(token)
        # 2) Session for website
        user_id = session.get("user_id")
        if user_id:
            return database.get_user_by_id(int(user_id))
        return None

    @api.before_request
    def load_current_user():
        g.current_user = _get_auth_user()

    def _require_user() -> dict:
        user = getattr(g, "current_user", None)
        if not user:
            return None
        return user

    @api.route("/capture", methods=["POST"])
    def capture_content():
        user = _require_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        payload = request.get_json(force=True, silent=True) or {}
        url = payload.get("url", "").strip()
        title = (payload.get("title") or "Untitled capture").strip()
        source = payload.get("source") or _derive_source(url)
        content_type = payload.get("contentType") or _infer_content_type(payload.get("mimeType"))
        snippet = (payload.get("content") or payload.get("selection") or "").strip()
        thumbnail = payload.get("thumbnail")
        allow_server_extract = payload.get("allowServerExtract", True)

        content = snippet
        if allow_server_extract and url:
            server_text, server_title = extract_text(url)
            if server_text:
                content = server_text
                if not title and server_title:
                    title = server_title

        # Quick minimal fields; leave enrichment to background if content is large
        quick = pipeline.process((content[:600] + "...") if len(content) > 600 else content)
        item = database.insert_item(
            user_id=int(user["id"]),
            url=url,
            title=title or "Untitled capture",
            source=source,
            content_type=content_type,
            content=content,
            summary=quick.summary,
            keywords=quick.keywords,
            emotion=quick.emotion,
            sentiment_score=quick.sentiment_score,
            thumbnail=thumbnail,
            processed=False,
        )
        item_id = item.id

        def do_enrich(item_id: int, user_id: int, text: str, title_for_prompt: str):
            try:
                enriched = pipeline.process(f"{title_for_prompt}. {text}")
                database.update_item_enrichment(
                    user_id=user_id,
                    item_id=item_id,
                    summary=enriched.summary,
                    keywords=enriched.keywords,
                    emotion=enriched.emotion,
                    sentiment_score=enriched.sentiment_score,
                    processing_error=None,
                )
            except Exception as e:
                database.update_item_enrichment(
                    user_id=user_id,
                    item_id=item_id,
                    summary=quick.summary,
                    keywords=quick.keywords,
                    emotion=quick.emotion,
                    sentiment_score=quick.sentiment_score,
                    processing_error=str(e),
                )

        # Enqueue background enrichment work
        worker.submit(do_enrich, item_id, int(user["id"]), content, title)

        return jsonify({
            "item": item.to_dict(),
            "extracted": bool(content and content != snippet),
            "queued": True
        }), 201

    @api.route("/search", methods=["GET"])
    def search_items():
        user = _require_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        query = request.args.get("q")
        emotion = request.args.get("emotion")
        limit = int(request.args.get("limit", 25))
        items = database.search_items(user_id=int(user["id"]), query=query, emotion=emotion, limit=limit)
        return jsonify({"results": [item.to_dict() for item in items]})

    @api.route("/items/<int:item_id>", methods=["GET"])
    def get_item(item_id: int):
        user = _require_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        item = database.get_item(int(user["id"]), item_id)
        if not item:
            return jsonify({"error": "Item not found"}), 404
        return jsonify({"item": item.to_dict()})

    @api.route("/timeline", methods=["GET"])
    def timeline():
        user = _require_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        limit = int(request.args.get("limit", 20))
        items = database.list_recent(user_id=int(user["id"]), limit=limit)
        return jsonify({"items": [item.to_dict() for item in items]})

    @api.route("/insights", methods=["GET"])
    def insights():
        user = _require_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        return jsonify(database.get_insights(user_id=int(user["id"])))

    @api.route("/items/<int:item_id>", methods=["DELETE"])
    def delete_item(item_id: int):
        user = _require_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        database.delete_item(int(user["id"]), item_id)
        return ("", 204)

    # Auth endpoints
    @api.route("/auth/register", methods=["POST"])
    def register():
        data = request.get_json(force=True, silent=True) or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        if not email or not password:
            return jsonify({"error": "Email and password required"}), 400
        if database.get_user_by_email(email):
            return jsonify({"error": "Email already registered"}), 409
        token = secrets.token_hex(24)
        user_id = database.create_user(email, generate_password_hash(password), token)
        session["user_id"] = int(user_id)
        return jsonify({"userId": user_id, "token": token})

    @api.route("/auth/login", methods=["POST"])
    def login():
        data = request.get_json(force=True, silent=True) or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        user = database.get_user_by_email(email)
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid credentials"}), 401
        session["user_id"] = int(user["id"])
        return jsonify({"userId": user["id"], "token": user["api_token"]})

    @api.route("/auth/logout", methods=["POST"])  # website logout; extension ignores
    def logout():
        session.clear()
        return ("", 204)

    @api.route("/auth/me", methods=["GET"])  # useful for checking current user
    def me():
        user = _get_auth_user()
        if not user:
            return jsonify({"authenticated": False}), 200
        return jsonify({
            "authenticated": True,
            "user": {
                "id": user["id"],
                "email": user["email"],
            }
        })

    @api.route("/export/pdf", methods=["GET"])
    def export_pdf():
        """Export all user data as a PDF file."""
        user = _require_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        
        if not REPORTLAB_AVAILABLE:
            return jsonify({
                "error": "PDF export is not available. Please install reportlab."
            }), 503
        
        try:
            # Get all user items (no limit)
            items = database.search_items(user_id=int(user["id"]), limit=10000)
            insights = database.get_insights(user_id=int(user["id"]))
            
            # Convert items to dicts
            items_dicts = [item.to_dict() for item in items]
            
            # Generate PDF
            pdf_bytes = generate_user_pdf(
                user_email=user["email"],
                items=items_dicts,
                insights=insights
            )
            
            # Create a response with the PDF
            import io
            pdf_buffer = io.BytesIO(pdf_bytes)
            pdf_buffer.seek(0)
            
            filename = f"memory_lane_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            
            return send_file(
                pdf_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=filename
            )
            
        except Exception as e:
            return jsonify({"error": f"Failed to generate PDF: {str(e)}"}), 500

    # Register blueprint after all routes are defined
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
