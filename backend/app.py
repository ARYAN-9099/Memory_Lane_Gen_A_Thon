from __future__ import annotations

import logging
import os
from pathlib import Path
import sqlite3  # added

from flask import Flask, render_template, redirect, url_for, session
from flask_cors import CORS

from memory_lane.database import Database
from memory_lane.routes import register_routes


def create_app(database_path: Path | None = None) -> Flask:
    """Create the Flask application with configured services."""
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["JSON_SORT_KEYS"] = False
    # In production set a strong secret key via env
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    db_location = database_path or Path(os.environ.get("MEMORY_LANE_DB", "memory_lane.db"))
    database = Database(db_location)
    database.initialize()

    # Seed a demo user if missing (for quick testing)
    def seed_demo_user(db_file: Path):
        try:
            from werkzeug.security import generate_password_hash
            conn = sqlite3.connect(str(db_file))
            cur = conn.cursor()
            # Ensure users table exists and has created_at with a default
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    api_token TEXT UNIQUE,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            # Add created_at if missing (best-effort migration)
            cols = [r[1] for r in cur.execute("PRAGMA table_info(users)").fetchall()]
            if "created_at" not in cols:
                try:
                    cur.execute("ALTER TABLE users ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
                except Exception:
                    pass
                cols = [r[1] for r in cur.execute("PRAGMA table_info(users)").fetchall()]

            cur.execute("SELECT id FROM users WHERE email = ?", ("demo@example.com",))
            if not cur.fetchone():
                token = os.environ.get("DEMO_USER_TOKEN") or os.urandom(16).hex()
                if "created_at" in cols:
                    cur.execute(
                        "INSERT INTO users (email, password_hash, api_token, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                        ("demo@example.com", generate_password_hash("demo1234"), token),
                    )
                else:
                    cur.execute(
                        "INSERT INTO users (email, password_hash, api_token) VALUES (?, ?, ?)",
                        ("demo@example.com", generate_password_hash("demo1234"), token),
                    )
                conn.commit()
        finally:
            try:
                conn.close()
            except Exception:
                pass

    seed_demo_user(db_location)

    CORS(app)

    register_routes(app, database)

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return {"status": "ok"}

    @app.route("/", methods=["GET"])
    def dashboard():
        # Require login: if no session, redirect to login page
        if not session.get("user_id"):
            return redirect(url_for("login_page"))
        return render_template("index.html")

    @app.route("/login", methods=["GET"])
    def login_page():
        return render_template("login.html")

    @app.route("/export", methods=["GET"])
    def export_page():
        # Require login: if no session, redirect to login page
        if not session.get("user_id"):
            return redirect(url_for("login_page"))
        return render_template("export.html")

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_app().run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
