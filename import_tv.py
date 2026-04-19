#!/usr/bin/env python3
"""
Importa Pop! Television da Fandom wiki nel catalogo FunkoTracker.
Uso: python import_tv.py [--db /path/to/funkopop.db]
"""
import re
import json
import ssl
import sqlite3
import argparse
import urllib.request
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────
WIKI_API = (
    "https://funko.fandom.com/api.php"
    "?action=parse&page=Pop%21_Television&prop=wikitext&format=json"
)
HEADERS = {
    "User-Agent": "FunkoTracker-Importer/1.0 (personal project)",
    "Accept": "application/json",
}


# ── Fetch wikitext ───────────────────────────────────────────────────────────
def fetch_wikitext():
    print("📡 Scarico wikitext da Fandom...")
    # macOS Python 3.x spesso non ha i certificati di sistema — bypass SSL
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(WIKI_API, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        data = json.loads(resp.read().decode())
    return data["parse"]["wikitext"]["*"]


# ── Wikitext helpers ─────────────────────────────────────────────────────────
def strip_wiki(text):
    """Rimuove markup wiki: [[Link|Display]] → Display, [[Link]] → Link, ''...'' → ..."""
    if not text:
        return ""
    # [[File:...]] → stringa vuota
    text = re.sub(r'\[\[File:[^\]]*\]\]', '', text)
    # [[Link|Display]] → Display
    text = re.sub(r'\[\[([^|\]]+)\|([^\]]+)\]\]', r'\2', text)
    # [[Link]] → Link
    text = re.sub(r'\[\[([^\]]+)\]\]', r'\1', text)
    # ''testo'' → testo
    text = re.sub(r"'{2,3}", '', text)
    # Rimuove tag HTML
    text = re.sub(r'<[^>]+>', '', text)
    # Rimuove ref
    text = re.sub(r'<ref[^/]*/>', '', text)
    # Normalizza spazi
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def clean_box_number(raw):
    """#01 → '01', #01/#02 → '01', N/A → None"""
    raw = raw.strip().lstrip('#')
    if not raw or raw.lower() in ('n/a', '-', ''):
        return None
    # prende solo il primo numero se c'è /
    part = raw.split('/')[0].split(',')[0].strip()
    return part if part else None


def detect_flags(notes_raw):
    """Estrae is_chase, is_vaulted, exclusive_retailer, exclusive_event, special_feature."""
    n = notes_raw.upper() if notes_raw else ""
    result = {
        "is_chase": 0,
        "is_vaulted": 0,
        "exclusive_retailer": None,
        "exclusive_event": None,
        "special_feature": None,
    }
    # Chase
    if "CHASE" in n:
        result["is_chase"] = 1
    # Vaulted
    if "VAULT" in n:
        result["is_vaulted"] = 1

    # Exclusive events (ordine: più specifico prima)
    event_map = [
        (r'\bSDCC\b', 'SDCC'),
        (r'\bNYCC\b', 'NYCC'),
        (r'\bECCC\b', 'ECCC'),
        (r'\bC2E2\b', 'C2E2'),
        (r'\bWWE\b', None),   # skip
        (r'\bD23\b', 'D23'),
        (r'\bSXSW\b', 'SXSW'),
        (r'\bCOMIC.?CON\b', 'Comic-Con'),
    ]
    for pat, label in event_map:
        if label and re.search(pat, n):
            result["exclusive_event"] = label
            break

    # Exclusive retailer
    retailer_map = [
        (r'HOT TOPIC', 'Hot Topic'),
        (r'AMAZON', 'Amazon'),
        (r'TARGET', 'Target'),
        (r'WALMART', 'Walmart'),
        (r'GAMESTOP', 'GameStop'),
        (r'BARNES.?&?.?NOBLE|B&N|BAM!', 'Books-A-Million'),
        (r'ENTERTAINMENT EARTH|EE', 'Entertainment Earth'),
        (r'FUNKO SHOP', 'Funko Shop'),
        (r'BEST BUY', 'Best Buy'),
        (r'BOX LUNCH', 'BoxLunch'),
        (r'PX|PREVIEWS EXCLUSIVE', 'Previews Exclusive'),
        (r'GEMINI', 'Gemini Collectibles'),
        (r'SPIRIT\b', 'Spirit Halloween'),
        (r'KROGER', 'Kroger'),
        (r'FYE\b', 'FYE'),
    ]
    for pat, label in retailer_map:
        if re.search(pat, n):
            result["exclusive_retailer"] = label
            break

    # Special features
    feats = []
    feat_map = [
        (r'\bGITD\b|GLOW.IN.THE.DARK', 'Glow in the Dark'),
        (r'\bFLOCKED\b', 'Flocked'),
        (r'\bMETALLIC\b', 'Metallic'),
        (r'\bGLITTER\b', 'Glitter'),
        (r'\bCHROME\b', 'Chrome'),
        (r'\bGOLD\b', 'Gold'),
        (r'\bSILVER\b', 'Silver'),
        (r'\bDIAMOND\b', 'Diamond'),
        (r'\b6"\b|6 INCH', '6"'),
        (r'\bBLACK.?LIGHT\b', 'Black Light'),
    ]
    for pat, label in feat_map:
        if re.search(pat, n):
            feats.append(label)
    if feats:
        result["special_feature"] = ', '.join(feats[:3])

    return result


# ── Parser wikitable ─────────────────────────────────────────────────────────
def parse_table(wikitext):
    """
    Estrae righe dalla wikitable del formato Pop! Television.
    Ogni riga è un dict con i campi del DB.
    """
    entries = []

    # Isola il blocco tabella
    table_match = re.search(r'\{\|.*?\|\}', wikitext, re.DOTALL)
    if not table_match:
        print("⚠️  Tabella non trovata nel wikitext!")
        return entries

    table = table_match.group(0)

    # Splitta per riga wiki (|-) e analizza ogni blocco
    # Ogni figura ha il formato:
    # |-
    # !#NN
    # ![[Nome]]
    # |[[File:...]]
    # |2015
    # |Note/varianti
    # |''Serie''

    # Prendiamo tutte le righe dati
    # Pattern: blocco che inizia con |- e contiene !#\d
    row_blocks = re.split(r'\n\|-', table)

    for block in row_blocks:
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        if not lines:
            continue

        # Cerca il box number (riga che inizia con ! e contiene #NN)
        box_line = None
        name_line = None
        img_line = None
        year_line = None
        notes_line = None
        series_line = None

        cell_lines = []
        for line in lines:
            if line.startswith('!') or line.startswith('|'):
                cell_lines.append(line)

        # Struttura attesa: !#, !Name, |Image, |Year, |Notes, |Series
        if len(cell_lines) < 3:
            continue

        # Prima cella: box number (inizia con ! e contiene #)
        c0 = cell_lines[0].lstrip('!|').strip()
        if not re.match(r'#?\d', c0):
            continue  # non è una riga dati

        # Box number
        box_raw = c0
        box_num = clean_box_number(box_raw)

        # Nome (seconda cella !)
        c1 = cell_lines[1].lstrip('!|').strip() if len(cell_lines) > 1 else ""

        # Salta la cella Image (posizione 2): può avere File:... oppure essere vuota (|)
        # Non saltare se la cella contiene un anno (es. |2015) — significa che l'immagine manca
        offset = 2
        if offset < len(cell_lines):
            cell2 = cell_lines[offset].lstrip('|').strip()
            # È una cella immagine se: ha File: oppure è completamente vuota
            if 'File:' in cell_lines[offset] or cell2 == '':
                offset += 1

        year_raw   = cell_lines[offset].lstrip('|').strip()     if offset < len(cell_lines) else ""
        notes_raw  = cell_lines[offset+1].lstrip('|').strip()   if offset+1 < len(cell_lines) else ""
        series_raw = cell_lines[offset+2].lstrip('|').strip()   if offset+2 < len(cell_lines) else ""

        name    = strip_wiki(c1)
        series  = strip_wiki(series_raw)
        notes   = strip_wiki(notes_raw)

        # Anno
        release_year = None
        m = re.search(r'\b(20\d{2}|19\d{2})\b', year_raw)
        if m:
            release_year = int(m.group(1))

        # Franchise = la serie TV (colonna Series)
        # Se vuoto usa "Television"
        franchise = series if series and series != "N/A" else "Television"

        # Flags
        flags = detect_flags(notes_raw)

        # Variante: se c'è una parentesi con descrizione breve nel nome
        variant = None
        vm = re.search(r'\(([^)]{3,40})\)', name)
        if vm:
            variant = vm.group(1).strip()
            name = name[:vm.start()].strip()

        # Pulisci nome da numeri di box duplicati
        name = re.sub(r'^#\d+\s*', '', name).strip()

        if not name:
            continue

        entry = {
            "box_number":        box_num,
            "name":              name,
            "franchise":         franchise,
            "series":            "Pop! Television",
            "variant":           variant,
            "release_year":      release_year,
            "notes":             notes if notes and notes.lower() != "n/a" else None,
            **flags,
        }
        entries.append(entry)

    return entries


# ── DB insert ────────────────────────────────────────────────────────────────
def insert_entries(db_path, entries):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")

    fields = [
        "box_number", "name", "franchise", "series", "variant",
        "is_chase", "is_vaulted", "release_year",
        "exclusive_retailer", "exclusive_event", "special_feature",
        "notes", "size",
    ]

    inserted = 0
    skipped = 0
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    with conn:
        for e in entries:
            # Controlla duplicati: se c'è box_number usa quello, altrimenti name+franchise+anno
            if e.get("box_number"):
                existing = conn.execute(
                    "SELECT id FROM funko_pop WHERE box_number = ? AND franchise = ?",
                    (e["box_number"], e["franchise"])
                ).fetchone()
            else:
                existing = conn.execute(
                    "SELECT id FROM funko_pop WHERE name = ? AND franchise = ? AND release_year = ?",
                    (e["name"], e["franchise"], e.get("release_year"))
                ).fetchone()
            if existing:
                skipped += 1
                continue

            e["size"] = "standard"
            cols = [f for f in fields if e.get(f) is not None]
            vals = [e[f] for f in cols]
            sql = (
                f"INSERT INTO funko_pop ({', '.join(cols)}, created_at, updated_at) "
                f"VALUES ({', '.join(['?']*len(cols))}, ?, ?)"
            )
            conn.execute(sql, vals + [now, now])
            inserted += 1

    conn.close()
    return inserted, skipped


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="./data/funkopop.db", help="Path al DB SQLite")
    parser.add_argument("--dry-run", action="store_true", help="Non scrive sul DB")
    args = parser.parse_args()

    wikitext = fetch_wikitext()
    print(f"✅ Wikitext scaricato ({len(wikitext):,} caratteri)")

    entries = parse_table(wikitext)
    print(f"📋 Voci parsate: {len(entries)}")

    if not entries:
        print("❌ Nessuna voce trovata. Controlla il parser.")
        return

    # Preview delle prime 10
    print("\n── Anteprima prime 10 voci ──")
    for i, e in enumerate(entries[:10]):
        print(f"  #{e.get('box_number','?'):>4}  {e['name'][:30]:<30}  {e['franchise'][:25]}")

    print(f"\n── Anteprima ultime 5 voci ──")
    for e in entries[-5:]:
        print(f"  #{e.get('box_number','?'):>4}  {e['name'][:30]:<30}  {e['franchise'][:25]}")

    if args.dry_run:
        print("\n🔍 Dry run — nessuna scrittura sul DB.")
        return

    print(f"\n💾 Scrivo su: {args.db}")
    inserted, skipped = insert_entries(args.db, entries)
    print(f"✅ Inseriti: {inserted}  |  Saltati (duplicati): {skipped}")


if __name__ == "__main__":
    main()
