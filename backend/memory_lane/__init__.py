"""Memory Lane Snapshot backend package."""
from __future__ import annotations

import logging
import os
from pathlib import Path
import sqlite3

from flask import Flask, render_template, redirect, url_for, session, request, flash, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from memory_lane.database import Database
from memory_lane.routes import register_routes


def create_app(database_path: Path | None = None) -> Flask:
    """Create the Flask application with configured services."""
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["JSON_SORT_KEYS"] = False
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    db_location = database_path or Path(os.environ.get("MEMORY_LANE_DB", "memory_lane.db"))
    
    # Use Flask's global 'g' object to manage the database connection per request
    def get_db():
        if 'db' not in g:
            g.db = Database(db_location)
            g.db.initialize()
        return g.db

    @app.teardown_appcontext
    def teardown_db(exception):
        db = g.pop('db', None)
        # Here you would close the connection if your Database class had a .close() method

    # The API routes from your other file are registered here
    with app.app_context():
        register_routes(app, get_db())

    # --- START: WEB PAGE ROUTES FOR YOUR LANDING PAGE ---

    @app.route("/landing", methods=["GET"])
    def landing_page():
        # The landing.html template will use the session to decide which buttons to show
        return render_template("landing.html")

    @app.route("/", methods=["GET"])
    def dashboard():
        # Protect this route - only accessible if logged in
        if not session.get("user_id"):
            return redirect(url_for("login_page"))
        return render_template("index.html")

    @app.route("/login", methods=["GET", "POST"])
    def login_page():
        db = get_db()
        if request.method == "POST":
            # Note: The form uses 'username' for the Walmart ID field.
            # Your database may need a method to get user by Walmart ID instead of email.
            # For now, we'll assume the user enters their email in the Walmart ID field.
            email = request.form.get("username")
            password = request.form.get("password")
            user = db.get_user_by_email(email)

            if user and check_password_hash(user["password_hash"], password):
                session.clear()
                session["user_id"] = user["id"]
                return redirect(url_for("dashboard"))
            
            flash("Invalid credentials, please try again.")
            return redirect(url_for("landing_page"))

        # For a GET request, just show the landing page (its JS will handle the modal)
        return render_template("landing.html", show_login=True)

    @app.route("/register", methods=["POST"])
    def register():
        db = get_db()
        email = request.form.get("email")
        password = request.form.get("password")
        re_pass = request.form.get("rePass")
        
        # Basic validation
        if not email or not password:
            flash("Email and password are required.")
            return redirect(url_for('landing_page'))

        if password != re_pass:
            flash("Passwords do not match.")
            return redirect(url_for('landing_page'))

        if db.get_user_by_email(email):
            flash("Email is already registered. Please log in.")
            return redirect(url_for("landing_page"))

        # Hash password and create user
        password_hash = generate_password_hash(password)
        api_token = os.urandom(24).hex()
        user_id = db.create_user(email, password_hash, api_token)

        # Log the new user in and redirect to dashboard
        session["user_id"] = user_id
        return redirect(url_for("dashboard"))

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("landing_page"))

    # --- END: WEB PAGE ROUTES ---

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_app().run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)

