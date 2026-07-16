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

# ---------- DB / auth (Postgres in prod via DATABASE_URL, SQLite locally) ----------
DB_FILE = os.path.join(BASE, "brickgains.db")
DATABASE_URL = os.environ.get("DATABASE_URL")
PG = bool(DATABASE_URL)
if PG:
    import psycopg2, psycopg2.extras

def _conn():
    if PG:
        return psycopg2.connect(DATABASE_URL, sslmode="require")
    c = sqlite3.connect(DB_FILE); c.row_factory = sqlite3.Row
    return c

def _conv(sql):
    return sql.replace("?", "%s") if PG else sql

def q1(sql, params=()):
    c = _conn()
    try:
        cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) if PG else c.cursor()
        cur.execute(_conv(sql), params); r = cur.fetchone()
        return dict(r) if r else None
    finally: c.close()

def qx(sql, params=(), returning=False):
    c = _conn()
    try:
        cur = c.cursor()
        if returning and PG: sql = sql + " RETURNING id"
        cur.execute(_conv(sql), params)
        val = (cur.fetchone()[0] if PG else cur.lastrowid) if returning else None
        c.commit(); return val
    finally: c.close()

def db_init():
    ai = "SERIAL PRIMARY KEY" if PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
    ts = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP" if PG else "TEXT DEFAULT CURRENT_TIMESTAMP"
    qx(f"""CREATE TABLE IF NOT EXISTS users(
        id {ai}, email TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL,
        provider TEXT DEFAULT 'password', plan TEXT DEFAULT 'free', created {ts})""")
    qx(f"""CREATE TABLE IF NOT EXISTS sessions(
        token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created {ts})""")
    qx(f"""CREATE TABLE IF NOT EXISTS portfolio(
        id {ai}, user_id INTEGER NOT NULL, set_num TEXT NOT NULL,
        paid REAL, condition TEXT DEFAULT 'sealed', added {ts})""")

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

# --- rate limiter (in-memory, per IP) ---
RATE = {}
def rate_ok(key, limit, window):
    now = time.time()
    q = RATE.setdefault(key, [])
    while q and q[0] < now - window: q.pop(0)
    if len(q) >= limit: return False
    q.append(now); return True

def make_session(user_id):
    tok = secrets.token_urlsafe(32)
    qx("DELETE FROM sessions WHERE created < " + ("now() - interval '30 days'" if PG else "datetime('now','-30 days')"))
    qx("INSERT INTO sessions(token,user_id) VALUES(?,?)", (tok, user_id))
    return tok

def user_by_token(tok):
    if not tok: return None
    return q1("""SELECT u.id,u.email,u.plan FROM sessions s JOIN users u ON u.id=s.user_id
                 WHERE s.token=?""", (tok,))

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
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        if cookie: self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body if isinstance(body, bytes) else body.encode())

    def _ip(self):
        xff = self.headers.get("X-Forwarded-For", "")
        return (xff.split(",")[0].strip() if xff else self.client_address[0]) or "?"

    def _https(self):
        return self.headers.get("X-Forwarded-Proto", "") == "https"

    def _sess_cookie(self, tok, clear=False):
        sec = "; Secure" if self._https() else ""
        if clear:
            return f"bg_session=; Path=/; HttpOnly; SameSite=Lax{sec}; Max-Age=0"
        return f"bg_session={tok}; Path=/; HttpOnly; SameSite=Lax{sec}; Max-Age=2592000"

    def _body(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n > 100000: return {}
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
            if not rate_ok("auth:" + self._ip(), 12, 900):
                return self._send(429, json.dumps({"ok": False, "error": "Too many attempts. Please try again in a few minutes."}))
            d = self._body()
            email = (d.get("email") or "").strip().lower()
            pw = d.get("password") or ""
            if "@" not in email or "." not in email:
                return self._send(400, json.dumps({"ok": False, "error": "Enter a valid email."}))
            if len(pw) < 8:
                return self._send(400, json.dumps({"ok": False, "error": "Password must be at least 8 characters."}))
            if q1("SELECT 1 AS x FROM users WHERE email=?", (email,)):
                return self._send(409, json.dumps({"ok": False, "error": "An account with this email already exists."}))
            uid = qx("INSERT INTO users(email,pw_hash) VALUES(?,?)", (email, hash_pw(pw)), returning=True)
            tok = make_session(uid)
            return self._send(200, json.dumps({"ok": True, "user": {"email": email, "plan": "free"}}),
                              cookie=self._sess_cookie(tok))

        if u.path == "/api/login":
            if not rate_ok("auth:" + self._ip(), 12, 900):
                return self._send(429, json.dumps({"ok": False, "error": "Too many attempts. Please try again in a few minutes."}))
            d = self._body()
            email = (d.get("email") or "").strip().lower()
            pw = d.get("password") or ""
            row = q1("SELECT id,pw_hash,plan FROM users WHERE email=?", (email,))
            if not row or not verify_pw(pw, row["pw_hash"]):
                return self._send(401, json.dumps({"ok": False, "error": "Wrong email or password."}))
            tok = make_session(row["id"])
            return self._send(200, json.dumps({"ok": True, "user": {"email": email, "plan": row["plan"]}}),
                              cookie=self._sess_cookie(tok))

        if u.path == "/api/logout":
            tok = self._cookie("bg_session")
            if tok:
                qx("DELETE FROM sessions WHERE token=?", (tok,))
            return self._send(200, json.dumps({"ok": True}), cookie=self._sess_cookie("", clear=True))

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
        if u.path == "/api/movers":
            try:
                return self._send(200, open(os.path.join(BASE, "movers.json")).read())
            except Exception:
                return self._send(200, json.dumps({"updated": None, "sets": []}))
        # static
        path = u.path
        if path == "/" : path = "/index.html"
        if path == "/app": path = "/app.html"
        if path in ("/pricing","/terms","/privacy","/refunds","/cookies"): path += ".html"
        if path == "/blog": path = "/blog/index.html"
        elif path.startswith("/blog/") and "." not in path.rsplit("/", 1)[-1]: path += ".html"
        if path == "/set": path = "/set/index.html"
        elif path.startswith("/set/") and "." not in path.rsplit("/", 1)[-1]: path += ".html"
        # --- French locale ---
        if path in ("/fr", "/fr/"): path = "/fr/index.html"
        elif path in ("/fr/pricing","/fr/terms","/fr/privacy","/fr/refunds","/fr/cookies"): path += ".html"
        elif path == "/fr/blog": path = "/fr/blog/index.html"
        elif path.startswith("/fr/blog/") and "." not in path.rsplit("/", 1)[-1]: path += ".html"
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
