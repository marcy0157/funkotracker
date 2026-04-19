import sqlite3
import os

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/funkopop.db")


def get_db():
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS funko_pop (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                box_number          TEXT,
                name                TEXT NOT NULL,
                franchise           TEXT NOT NULL,
                series              TEXT,
                variant             TEXT,
                is_chase            INTEGER DEFAULT 0,
                is_vaulted          INTEGER DEFAULT 0,
                release_year        INTEGER,
                release_date        TEXT,
                exclusive_retailer  TEXT,
                exclusive_event     TEXT,
                upc                 TEXT,
                funko_item_number   TEXT,
                size                TEXT DEFAULT 'standard',
                special_feature     TEXT,
                image_url           TEXT,
                fandom_url          TEXT,
                notes               TEXT,
                created_at          TEXT DEFAULT (datetime('now')),
                updated_at          TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS my_collection (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                funko_id            INTEGER NOT NULL REFERENCES funko_pop(id) ON DELETE CASCADE,
                status              TEXT NOT NULL DEFAULT 'wishlist',
                condition           TEXT,
                purchase_price      REAL,
                purchase_date       TEXT,
                purchase_source     TEXT,
                purchase_url        TEXT,
                estimated_value     REAL,
                priority            TEXT,
                max_budget          REAL,
                notes               TEXT,
                added_at            TEXT DEFAULT (datetime('now')),
                updated_at          TEXT DEFAULT (datetime('now'))
            );

            CREATE TRIGGER IF NOT EXISTS funko_pop_updated_at
            AFTER UPDATE ON funko_pop
            BEGIN
                UPDATE funko_pop SET updated_at = datetime('now') WHERE id = NEW.id;
            END;

            CREATE TRIGGER IF NOT EXISTS my_collection_updated_at
            AFTER UPDATE ON my_collection
            BEGIN
                UPDATE my_collection SET updated_at = datetime('now') WHERE id = NEW.id;
            END;
        """)


def row_to_dict(row):
    return dict(row) if row else None


def rows_to_list(rows):
    return [dict(r) for r in rows]


# --- funko_pop CRUD ---

def get_all_funko(franchise=None, series=None, is_vaulted=None, search=None, page=1, per_page=100):
    query = "SELECT * FROM funko_pop WHERE 1=1"
    params = []
    if franchise:
        query += " AND franchise = ?"
        params.append(franchise)
    if series:
        query += " AND series = ?"
        params.append(series)
    if is_vaulted is not None:
        query += " AND is_vaulted = ?"
        params.append(1 if is_vaulted else 0)
    if search:
        query += " AND (name LIKE ? OR franchise LIKE ? OR series LIKE ? OR variant LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like, like, like])
    query += " ORDER BY franchise ASC, CAST(box_number AS INTEGER) ASC, name ASC"
    offset = (page - 1) * per_page
    query += " LIMIT ? OFFSET ?"
    params.extend([per_page, offset])
    with get_db() as conn:
        return rows_to_list(conn.execute(query, params).fetchall())


def get_funko_by_id(funko_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM funko_pop WHERE id = ?", (funko_id,)).fetchone()
        return row_to_dict(row)


def create_funko(data):
    fields = [
        "box_number", "name", "franchise", "series", "variant",
        "is_chase", "is_vaulted", "release_year", "release_date",
        "exclusive_retailer", "exclusive_event", "upc", "funko_item_number",
        "size", "special_feature", "image_url", "fandom_url", "notes"
    ]
    cols = [f for f in fields if f in data]
    placeholders = ", ".join(["?" for _ in cols])
    values = [data[c] for c in cols]
    sql = f"INSERT INTO funko_pop ({', '.join(cols)}) VALUES ({placeholders})"
    with get_db() as conn:
        cur = conn.execute(sql, values)
        new_id = cur.lastrowid
    return get_funko_by_id(new_id)


def update_funko(funko_id, data):
    fields = [
        "box_number", "name", "franchise", "series", "variant",
        "is_chase", "is_vaulted", "release_year", "release_date",
        "exclusive_retailer", "exclusive_event", "upc", "funko_item_number",
        "size", "special_feature", "image_url", "fandom_url", "notes"
    ]
    cols = [f for f in fields if f in data]
    if not cols:
        return get_funko_by_id(funko_id)
    set_clause = ", ".join([f"{c} = ?" for c in cols])
    values = [data[c] for c in cols] + [funko_id]
    with get_db() as conn:
        conn.execute(f"UPDATE funko_pop SET {set_clause} WHERE id = ?", values)
    return get_funko_by_id(funko_id)


def delete_funko(funko_id):
    with get_db() as conn:
        conn.execute("DELETE FROM funko_pop WHERE id = ?", (funko_id,))


def get_franchises():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT franchise FROM funko_pop ORDER BY franchise ASC"
        ).fetchall()
        return [r["franchise"] for r in rows]


# --- my_collection CRUD ---

def get_collection(status=None, franchise=None, search=None, page=1, per_page=100):
    query = """
        SELECT mc.id as col_id, mc.funko_id, mc.status, mc.condition, mc.purchase_price,
               mc.purchase_date, mc.purchase_source, mc.purchase_url, mc.estimated_value,
               mc.priority, mc.max_budget, mc.notes, mc.added_at, mc.updated_at,
               fp.id as id, fp.name, fp.franchise, fp.box_number, fp.series, fp.variant,
               fp.is_chase, fp.is_vaulted, fp.exclusive_retailer, fp.exclusive_event,
               fp.image_url, fp.size, fp.special_feature, fp.release_year,
               fp.fandom_url, fp.funko_item_number, fp.upc, fp.release_date
        FROM my_collection mc
        JOIN funko_pop fp ON fp.id = mc.funko_id
        WHERE 1=1
    """
    params = []
    if status:
        query += " AND mc.status = ?"
        params.append(status)
    if franchise:
        query += " AND fp.franchise = ?"
        params.append(franchise)
    if search:
        query += " AND (fp.name LIKE ? OR fp.franchise LIKE ? OR fp.series LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like, like])
    query += " ORDER BY fp.franchise ASC, CAST(fp.box_number AS INTEGER) ASC, fp.name ASC"
    offset = (page - 1) * per_page
    query += " LIMIT ? OFFSET ?"
    params.extend([per_page, offset])
    with get_db() as conn:
        return rows_to_list(conn.execute(query, params).fetchall())


def get_collection_entry(entry_id):
    with get_db() as conn:
        row = conn.execute("""
            SELECT mc.id as col_id, mc.funko_id, mc.status, mc.condition, mc.purchase_price,
                   mc.purchase_date, mc.purchase_source, mc.purchase_url, mc.estimated_value,
                   mc.priority, mc.max_budget, mc.notes, mc.added_at, mc.updated_at,
                   fp.id as id, fp.name, fp.franchise, fp.box_number, fp.series, fp.variant,
                   fp.is_chase, fp.is_vaulted, fp.exclusive_retailer, fp.exclusive_event,
                   fp.image_url, fp.size, fp.special_feature, fp.release_year,
                   fp.fandom_url, fp.funko_item_number, fp.upc, fp.release_date
            FROM my_collection mc
            JOIN funko_pop fp ON fp.id = mc.funko_id
            WHERE mc.id = ?
        """, (entry_id,)).fetchone()
        return row_to_dict(row)


def create_collection_entry(data):
    fields = [
        "funko_id", "status", "condition", "purchase_price", "purchase_date",
        "purchase_source", "purchase_url", "estimated_value", "priority",
        "max_budget", "notes"
    ]
    cols = [f for f in fields if f in data]
    placeholders = ", ".join(["?" for _ in cols])
    values = [data[c] for c in cols]
    sql = f"INSERT INTO my_collection ({', '.join(cols)}) VALUES ({placeholders})"
    with get_db() as conn:
        cur = conn.execute(sql, values)
        new_id = cur.lastrowid
    return get_collection_entry(new_id)


def update_collection_entry(entry_id, data):
    fields = [
        "status", "condition", "purchase_price", "purchase_date",
        "purchase_source", "purchase_url", "estimated_value", "priority",
        "max_budget", "notes"
    ]
    cols = [f for f in fields if f in data]
    if not cols:
        return get_collection_entry(entry_id)
    set_clause = ", ".join([f"{c} = ?" for c in cols])
    values = [data[c] for c in cols] + [entry_id]
    with get_db() as conn:
        conn.execute(f"UPDATE my_collection SET {set_clause} WHERE id = ?", values)
    return get_collection_entry(entry_id)


def delete_collection_entry(entry_id):
    with get_db() as conn:
        conn.execute("DELETE FROM my_collection WHERE id = ?", (entry_id,))


def get_stats():
    with get_db() as conn:
        total_catalog = conn.execute("SELECT COUNT(*) FROM funko_pop").fetchone()[0]

        owned = conn.execute("""
            SELECT
                COUNT(*) AS count,
                COALESCE(SUM(purchase_price), 0) AS paid,
                COALESCE(SUM(estimated_value), 0) AS value
            FROM my_collection
            WHERE status = 'owned'
        """).fetchone()

        wishlist = conn.execute("""
            SELECT
                COUNT(*) AS count,
                COALESCE(SUM(purchase_price), 0) AS paid,
                COALESCE(SUM(estimated_value), 0) AS value
            FROM my_collection
            WHERE status IN ('wishlist', 'evaluating')
        """).fetchone()

        meta = conn.execute("""
            SELECT
                SUM(CASE WHEN mc.status = 'evaluating' THEN 1 ELSE 0 END) AS totale_evaluating,
                SUM(CASE WHEN fp.is_vaulted = 1 THEN 1 ELSE 0 END)        AS totale_vaulted
            FROM my_collection mc
            JOIN funko_pop fp ON fp.id = mc.funko_id
        """).fetchone()

        return {
            "totale_catalogo": total_catalog,
            # riga owned
            "owned_count": owned["count"] or 0,
            "owned_paid":  owned["paid"]  or 0.0,
            "owned_value": owned["value"] or 0.0,
            # riga wishlist (include evaluating)
            "wishlist_count": wishlist["count"] or 0,
            "wishlist_paid":  wishlist["paid"]  or 0.0,
            "wishlist_value": wishlist["value"] or 0.0,
            # meta
            "totale_evaluating":           meta["totale_evaluating"] or 0,
            "totale_vaulted_in_collezione": meta["totale_vaulted"]   or 0,
        }
