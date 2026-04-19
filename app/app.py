import os
import base64
import functools
from flask import Flask, request, jsonify, render_template, Response
from dotenv import load_dotenv
import database as db

load_dotenv()

app = Flask(__name__)

AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "changeme")


def require_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Basic "):
            return Response("Unauthorized", 401, {"WWW-Authenticate": 'Basic realm="FunkoTracker"'})
        try:
            decoded = base64.b64decode(auth[6:]).decode("utf-8")
            username, password = decoded.split(":", 1)
        except Exception:
            return Response("Unauthorized", 401, {"WWW-Authenticate": 'Basic realm="FunkoTracker"'})
        if username != AUTH_USERNAME or password != AUTH_PASSWORD:
            return Response("Unauthorized", 401, {"WWW-Authenticate": 'Basic realm="FunkoTracker"'})
        return f(*args, **kwargs)
    return decorated


def err(msg, code):
    return jsonify({"error": msg}), code


# --- Main page ---

@app.route("/")
@require_auth
def index():
    return render_template("index.html")


# --- Funko Pop catalog ---

@app.route("/api/funko", methods=["GET"])
@require_auth
def list_funko():
    franchise = request.args.get("franchise")
    series = request.args.get("series")
    is_vaulted = request.args.get("is_vaulted")
    if is_vaulted is not None:
        is_vaulted = is_vaulted.lower() in ("1", "true")
    search = request.args.get("search")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 100))
    items = db.get_all_funko(franchise, series, is_vaulted, search, page, per_page)
    return jsonify(items)


@app.route("/api/funko/franchises", methods=["GET"])
@require_auth
def list_funko_franchises():
    return jsonify(db.get_franchises())


@app.route("/api/funko/<int:funko_id>", methods=["GET"])
@require_auth
def get_funko(funko_id):
    item = db.get_funko_by_id(funko_id)
    if not item:
        return err("Not found", 404)
    return jsonify(item)


@app.route("/api/funko", methods=["POST"])
@require_auth
def create_funko():
    data = request.get_json()
    if not data:
        return err("No data provided", 400)
    if not data.get("name") or not data.get("franchise"):
        return err("name and franchise are required", 400)
    item = db.create_funko(data)
    return jsonify(item), 201


@app.route("/api/funko/<int:funko_id>", methods=["PUT"])
@require_auth
def update_funko(funko_id):
    if not db.get_funko_by_id(funko_id):
        return err("Not found", 404)
    data = request.get_json()
    if not data:
        return err("No data provided", 400)
    item = db.update_funko(funko_id, data)
    return jsonify(item)


@app.route("/api/funko/<int:funko_id>", methods=["DELETE"])
@require_auth
def delete_funko(funko_id):
    if not db.get_funko_by_id(funko_id):
        return err("Not found", 404)
    db.delete_funko(funko_id)
    return jsonify({"ok": True})


# --- Collection ---

@app.route("/api/collection", methods=["GET"])
@require_auth
def list_collection():
    status = request.args.get("status")
    franchise = request.args.get("franchise")
    search = request.args.get("search")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 100))
    items = db.get_collection(status, franchise, search, page, per_page)
    return jsonify(items)


@app.route("/api/collection/<int:entry_id>", methods=["GET"])
@require_auth
def get_collection_entry(entry_id):
    item = db.get_collection_entry(entry_id)
    if not item:
        return err("Not found", 404)
    return jsonify(item)


@app.route("/api/collection", methods=["POST"])
@require_auth
def create_collection_entry():
    data = request.get_json()
    if not data:
        return err("No data provided", 400)
    if not data.get("funko_id"):
        return err("funko_id is required", 400)
    if not db.get_funko_by_id(data["funko_id"]):
        return err("funko_id not found", 404)
    item = db.create_collection_entry(data)
    return jsonify(item), 201


@app.route("/api/collection/<int:entry_id>", methods=["PUT"])
@require_auth
def update_collection_entry(entry_id):
    if not db.get_collection_entry(entry_id):
        return err("Not found", 404)
    data = request.get_json()
    if not data:
        return err("No data provided", 400)
    item = db.update_collection_entry(entry_id, data)
    return jsonify(item)


@app.route("/api/collection/<int:entry_id>", methods=["DELETE"])
@require_auth
def delete_collection_entry(entry_id):
    if not db.get_collection_entry(entry_id):
        return err("Not found", 404)
    db.delete_collection_entry(entry_id)
    return jsonify({"ok": True})


# --- Stats & Franchises ---

@app.route("/api/stats", methods=["GET"])
@require_auth
def get_stats():
    return jsonify(db.get_stats())


@app.route("/api/franchises", methods=["GET"])
@require_auth
def get_franchises():
    return jsonify(db.get_franchises())


if __name__ == "__main__":
    db.init_db()
    app.run(debug=True)
else:
    db.init_db()
