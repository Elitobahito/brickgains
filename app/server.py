#!/usr/bin/env python3
"""
BrickBaron - serveur MVP (stdlib only, aucune dépendance).
Sert la landing + l'app portefeuille, et expose /api/value?set=NNNN
qui fusionne Rebrickable + Brickset + Apify (BrickLink) avec cache 24h.

Lancer :  python3 app/server.py   puis ouvrir http://localhost:8000
"""
import json, os, time, urllib.request, urllib.parse
import sqlite3, hashlib, secrets, hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
STATIC = os.path.join(BASE, "static")
CACHE_FILE = os.path.join(BASE, "cache.json")
CACHE_TTL = 24 * 3600
PORT = int(os.environ.get("PORT", "8000"))

# --- env : .env local (dev) puis surcharge par os.environ (Render / prod) ---
ENV = {}
_envfile = os.path.join(ROOT, ".env")
if os.path.exists(_envfile):
    for l in open(_envfile):
        l = l.strip()
        if l and not l.startswith("#") and "=" in l:
            k, v = l.split("=", 1); ENV[k.strip()] = v.strip()
for k, v in os.environ.items():
    ENV[k] = v

CACHE = {}
if os.path.exists(CACHE_FILE):
    try: CACHE = json.load(open(CACHE_FILE))
    except Exception: CACHE = {}

def save_cache():
    try: json.dump(CACHE, open(CACHE_FILE, "w"))
    except Exception: pass

# ---------- DB / auth (SQLite, stdlib) ----------
DB_FILE = os.path.join(BASE, "brickgains.db")

def db():
    c = sqlite3.connect(DB_FILE)
    c.row_factory = sqlite3.Row
    return c

def db_init():
    c = db()
    c.execute("""CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        pw_hash TEXT NOT NULL,
        provider TEXT DEFAULT 'password',
        plan TEXT DEFAULT 'free',
        created TEXT DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS sessions(
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created TEXT DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS portfolio(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        set_num TEXT NOT NULL,
        paid REAL,
        condition TEXT DEFAULT 'sealed',
        added TEXT DEFAULT CURRENT_TIMESTAMP)""")
    c.commit(); c.close()

def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200000).hex()
    return f"{salt}${h}"

def verify_pw(pw, stored):
    try:
        salt, _ = stored.split("$", 1)
        return hmac.compare_digest(hash_pw(pw, salt), stored)
    except Exception:
        return False

def make_session(user_id):
    tok = secrets.token_urlsafe(32)
    c = db(); c.execute("INSERT INTO sessions(token,user_id) VALUES(?,?)", (tok, user_id)); c.commit(); c.close()
    return tok

def user_by_token(tok):
    if not tok: return None
    c = db()
    row = c.execute("""SELECT u.id,u.email,u.plan FROM sessions s JOIN users u ON u.id=s.user_id
                       WHERE s.token=?""", (tok,)).fetchone()
    c.close()
    return dict(row) if row else None

def _norm(sn):
    sn = str(sn).strip().lower().replace("lego", "").strip()
    return sn if "-" in sn else f"{sn}-1"

def rebrickable(sn):
    try:
        req = urllib.request.Request(
            f"https://rebrickable.com/api/v3/lego/sets/{sn}/",
            headers={"Authorization": f"key {ENV.get('REBRICKABLE_API_KEY','')}"})
        d = json.loads(urllib.request.urlopen(req, timeout=20).read())
        return {"name": d.get("name"), "year": d.get("year"),
                "pieces": d.get("num_parts"), "image": d.get("set_img_url")}
    except Exception: return {}

def brickset(sn):
    try:
        body = urllib.parse.urlencode({
            "apiKey": ENV.get("BRICKSET_API_KEY", ""), "userHash": "",
            "params": json.dumps({"setNumber": sn, "pageSize": 1})}).encode()
        r = json.loads(urllib.request.urlopen(
            urllib.request.Request("https://brickset.com/api/v3.asmx/getSets", data=body),
            timeout=20).read())
        if r.get("status") != "success" or not r.get("sets"): return {}
        s = r["sets"][0]; lc = s.get("LEGOCom", {}) or {}
        rrp = retired = None
        for reg in ("US", "UK", "DE", "CA"):
            b = lc.get(reg) or {}
            if b.get("retailPrice") and rrp is None: rrp = float(b["retailPrice"])
            if b.get("dateLastAvailable") and retired is None: retired = b["dateLastAvailable"][:10]
        img = (s.get("image") or {}).get("imageURL")
        return {"name": s.get("name"), "year": s.get("year"), "theme": s.get("theme"),
                "pieces": s.get("pieces"), "rrp": rrp, "retired": retired, "image_bs": img}
    except Exception: return {}

def apify_price(sn):
    try:
        tok = ENV.get("APIFY_API_TOKEN", "")
        url = f"https://api.apify.com/v2/acts/jongoose~bricklink-scraper/run-sync-get-dataset-items?token={tok}"
        body = json.dumps({"query": sn, "itemType": "S", "priceGuideDetail": True, "maxItems": 1}).encode()
        items = json.loads(urllib.request.urlopen(
            urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}),
            timeout=180).read())
        p = items[0] if items else {}
        return {"newMin": p.get("newMinPrice"), "newAvg": p.get("newAvgPrice"), "newMax": p.get("newMaxPrice"),
                "usedMin": p.get("usedMinPrice"), "usedAvg": p.get("usedAvgPrice"), "usedMax": p.get("usedMaxPrice")}
    except Exception: return {}

def get_value(raw):
    sn = _norm(raw)
    hit = CACHE.get(sn)
    if hit and time.time() - hit.get("_ts", 0) < CACHE_TTL:
        return hit
    rb, bs, pr = rebrickable(sn), brickset(sn), apify_price(sn)
    if not bs and not rb and not pr:
        return {"error": f"Set {sn} introuvable", "set": sn}
    rrp = bs.get("rrp")
    new_avg = pr.get("newAvg")
    appr = round((new_avg - rrp) / rrp * 100) if (rrp and new_avg) else None
    out = {
        "set": sn,
        "name": bs.get("name") or rb.get("name") or sn,
        "year": bs.get("year") or rb.get("year"),
        "theme": bs.get("theme"),
        "pieces": bs.get("pieces") or rb.get("pieces"),
        "image": rb.get("image") or bs.get("image_bs"),
        "rrp": rrp, "retired": bs.get("retired"),
        "newMin": pr.get("newMin"), "newAvg": new_avg, "newMax": pr.get("newMax"),
        "usedMin": pr.get("usedMin"), "usedAvg": pr.get("usedAvg"), "usedMax": pr.get("usedMax"),
        "appreciation": appr,
        "_ts": time.time(),
    }
    CACHE[sn] = out; save_cache()
    return out

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="application/json", cookie=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        if cookie: self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body if isinstance(body, bytes) else body.encode())

    def _body(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        try: return json.loads(self.rfile.read(n) or b"{}")
        except Exception: return {}

    def _cookie(self, name):
        raw = self.headers.get("Cookie", "")
        for part in raw.split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                if k == name: return v
        return None

    def _me(self):
        return user_by_token(self._cookie("bg_session"))

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/subscribe":
            try:
                data = self._body()
                email = (data.get("email") or "").strip()
                topic = (data.get("topic") or "alerts").strip()[:40]
                if "@" not in email or "." not in email:
                    return self._send(400, json.dumps({"ok": False, "error": "invalid email"}))
                with open(os.path.join(ROOT, "subscribers.csv"), "a") as f:
                    f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')},{topic},{email}\n")
                return self._send(200, json.dumps({"ok": True}))
            except Exception:
                return self._send(500, json.dumps({"ok": False}))

        if u.path == "/api/signup":
            d = self._body()
            email = (d.get("email") or "").strip().lower()
            pw = d.get("password") or ""
            if "@" not in email or "." not in email:
                return self._send(400, json.dumps({"ok": False, "error": "Enter a valid email."}))
            if len(pw) < 8:
                return self._send(400, json.dumps({"ok": False, "error": "Password must be at least 8 characters."}))
            c = db()
            if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                c.close(); return self._send(409, json.dumps({"ok": False, "error": "An account with this email already exists."}))
            cur = c.execute("INSERT INTO users(email,pw_hash) VALUES(?,?)", (email, hash_pw(pw)))
            c.commit(); uid = cur.lastrowid; c.close()
            tok = make_session(uid)
            return self._send(200, json.dumps({"ok": True, "user": {"email": email, "plan": "free"}}),
                              cookie=f"bg_session={tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000")

        if u.path == "/api/login":
            d = self._body()
            email = (d.get("email") or "").strip().lower()
            pw = d.get("password") or ""
            c = db()
            row = c.execute("SELECT id,pw_hash,plan FROM users WHERE email=?", (email,)).fetchone()
            c.close()
            if not row or not verify_pw(pw, row["pw_hash"]):
                return self._send(401, json.dumps({"ok": False, "error": "Wrong email or password."}))
            tok = make_session(row["id"])
            return self._send(200, json.dumps({"ok": True, "user": {"email": email, "plan": row["plan"]}}),
                              cookie=f"bg_session={tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000")

        if u.path == "/api/logout":
            tok = self._cookie("bg_session")
            if tok:
                c = db(); c.execute("DELETE FROM sessions WHERE token=?", (tok,)); c.commit(); c.close()
            return self._send(200, json.dumps({"ok": True}),
                              cookie="bg_session=; Path=/; HttpOnly; Max-Age=0")

        return self._send(404, "Not found", "text/plain")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/me":
            me = self._me()
            return self._send(200, json.dumps({"user": me}))
        if u.path == "/api/value":
            q = urllib.parse.parse_qs(u.query).get("set", [""])[0]
            if not q: return self._send(400, json.dumps({"error": "set manquant"}))
            return self._send(200, json.dumps(get_value(q)))
        # static
        path = u.path
        if path == "/" : path = "/index.html"
        if path == "/app": path = "/app.html"
        fp = os.path.join(STATIC, path.lstrip("/"))
        if not os.path.isfile(fp): return self._send(404, "Not found", "text/plain")
        ext = fp.rsplit(".", 1)[-1]
        ctype = {"html": "text/html", "css": "text/css", "js": "application/javascript",
                 "svg": "image/svg+xml"}.get(ext, "text/plain")
        self._send(200, open(fp, "rb").read(), ctype + ("; charset=utf-8" if ext in ("html","css","js") else ""))

if __name__ == "__main__":
    db_init()
    print(f"BrickGains en ligne -> http://localhost:{PORT}  (Ctrl+C pour arreter)")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
