from __future__ import annotations

import logging
import os
from pathlib import Path

from flask import Flask, render_template
from flask_cors import CORS

from memory_lane.database import Database
from memory_lane.routes import register_routes


def create_app(database_path: Path | None = None) -> Flask:
    """Create the Flask application with configured services."""
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["JSON_SORT_KEYS"] = False

    db_location = database_path or Path(os.environ.get("MEMORY_LANE_DB", "memory_lane.db"))
    database = Database(db_location)
    database.initialize()

    CORS(app)

    register_routes(app, database)

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return {"status": "ok"}

    @app.route("/", methods=["GET"])
    def dashboard():
        return render_template("index.html")

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_app().run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
