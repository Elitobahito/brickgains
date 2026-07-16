#!/usr/bin/env python3
"""
BrickBaron - serveur MVP (stdlib only, aucune dépendance).
Sert la landing + l'app portefeuille, et expose /api/value?set=NNNN
qui fusionne Rebrickable + Brickset + Apify (BrickLink) avec cache 24h.

Lancer :  python3 app/server.py   puis ouvrir http://localhost:8000
"""
import json, os, time, re, urllib.request, urllib.parse
import sqlite3, hashlib, secrets, hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
STATIC = os.path.join(BASE, "static")
_STATIC_ROOT = os.path.realpath(STATIC)
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

def qx(sql, params=(), returning=False, ignore=False):
    c = _conn()
    try:
        cur = c.cursor()
        if ignore:
            sql = (sql + " ON CONFLICT DO NOTHING") if PG else sql.replace("INSERT INTO", "INSERT OR IGNORE INTO", 1)
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
    qx(f"""CREATE TABLE IF NOT EXISTS price_history(
        id {ai}, set_num TEXT NOT NULL, day TEXT NOT NULL, new_avg REAL, appreciation REAL,
        UNIQUE(set_num, day))""")
    # migration: public share link on users
    try: qx("ALTER TABLE users ADD COLUMN share_id TEXT")
    except Exception: pass

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
    return q1("""SELECT u.id,u.email,u.plan,u.share_id FROM sessions s JOIN users u ON u.id=s.user_id
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
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header("Content-Security-Policy",
            "default-src 'self'; img-src 'self' https: data:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "script-src 'self' 'unsafe-inline'; connect-src 'self'; "
            "frame-ancestors 'self'; base-uri 'self'")
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

        if u.path == "/api/snapshot":
            d = self._body()
            if d.get("key") != ENV.get("SNAPSHOT_KEY", "nope"):
                return self._send(403, json.dumps({"ok": False}))
            day = (d.get("day") or time.strftime("%Y-%m-%d"))[:10]
            n = 0
            for r in (d.get("rows") or []):
                s = str(r.get("set", "")).replace("-1", "")
                if not s: continue
                try:
                    qx("INSERT INTO price_history(set_num,day,new_avg,appreciation) VALUES(?,?,?,?)",
                       (s, day, r.get("newAvg"), r.get("appreciation")), ignore=True)
                    n += 1
                except Exception: pass
            return self._send(200, json.dumps({"ok": True, "recorded": n, "day": day}))

        if u.path.startswith("/api/portfolio"):
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            uid = me["id"]
            d = self._body()
            if u.path == "/api/portfolio/add":
                sn = str(d.get("set", "")).strip().lower().replace("lego", "").replace("-1", "").strip()
                if not sn:
                    return self._send(400, json.dumps({"ok": False, "error": "set manquant"}))
                paid = d.get("paid")
                try: paid = float(paid) if paid not in (None, "") else None
                except Exception: paid = None
                cond = "opened" if str(d.get("condition", "sealed")).lower().startswith("open") else "sealed"
                rid = qx("INSERT INTO portfolio(user_id,set_num,paid,condition) VALUES(?,?,?,?)",
                         (uid, sn, paid, cond), returning=True)
                return self._send(200, json.dumps({"ok": True, "id": rid}))
            if u.path == "/api/portfolio/remove":
                rid = d.get("id")
                qx("DELETE FROM portfolio WHERE id=? AND user_id=?", (rid, uid))
                return self._send(200, json.dumps({"ok": True}))
            if u.path == "/api/portfolio/share":
                on = bool(d.get("on", True))
                if not on:
                    qx("UPDATE users SET share_id=NULL WHERE id=?", (uid,))
                    return self._send(200, json.dumps({"ok": True, "shared": False, "share_id": None}))
                row = q1("SELECT share_id FROM users WHERE id=?", (uid,))
                sid = (row or {}).get("share_id")
                if not sid:
                    sid = secrets.token_urlsafe(8)
                    qx("UPDATE users SET share_id=? WHERE id=?", (sid, uid))
                return self._send(200, json.dumps({"ok": True, "shared": True, "share_id": sid}))
            if u.path == "/api/portfolio/import":
                raw = d.get("raw") or ""
                toks = re.split(r"[\s,;\n]+", str(raw))
                seen, n = set(), 0
                for t in toks:
                    sn = t.strip().lower().replace("lego", "").replace("-1", "").strip()
                    if not sn or sn in seen: continue
                    seen.add(sn)
                    qx("INSERT INTO portfolio(user_id,set_num,paid,condition) VALUES(?,?,?,?)",
                       (uid, sn, None, "sealed"))
                    n += 1
                    if n >= 200: break
                return self._send(200, json.dumps({"ok": True, "added": n}))
            return self._send(404, json.dumps({"ok": False}))

        return self._send(404, "Not found", "text/plain")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/me":
            me = self._me()
            return self._send(200, json.dumps({"user": me}))
        if u.path == "/api/portfolio":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            rows = []
            try:
                c = _conn()
                cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) if PG else c.cursor()
                cur.execute(_conv("SELECT id,set_num,paid,condition FROM portfolio WHERE user_id=? ORDER BY id DESC"), (me["id"],))
                rows = [dict(r) for r in cur.fetchall()]
                c.close()
            except Exception: pass
            return self._send(200, json.dumps({"ok": True, "items": rows}))
        if u.path == "/api/value":
            q = urllib.parse.parse_qs(u.query).get("set", [""])[0]
            if not q: return self._send(400, json.dumps({"error": "set manquant"}))
            return self._send(200, json.dumps(get_value(q)))
        if u.path == "/api/history":
            s = urllib.parse.parse_qs(u.query).get("set", [""])[0].replace("-1", "")
            if not s: return self._send(400, json.dumps({"error": "set manquant"}))
            rows = []
            try:
                c = _conn()
                cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) if PG else c.cursor()
                cur.execute(_conv("SELECT day,new_avg,appreciation FROM price_history WHERE set_num=? ORDER BY day"), (s,))
                rows = [dict(r) for r in cur.fetchall()]
                c.close()
            except Exception: pass
            return self._send(200, json.dumps({"set": s, "history": rows}))
        if u.path.startswith("/api/u/"):
            sid = u.path[len("/api/u/"):].strip("/")
            owner = q1("SELECT id FROM users WHERE share_id=?", (sid,)) if sid else None
            if not owner:
                return self._send(404, json.dumps({"ok": False, "error": "not found"}))
            rows = []
            try:
                c = _conn()
                cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) if PG else c.cursor()
                cur.execute(_conv("SELECT set_num,paid,condition FROM portfolio WHERE user_id=? ORDER BY id DESC"), (owner["id"],))
                rows = [dict(r) for r in cur.fetchall()]
                c.close()
            except Exception: pass
            items, tot_val, tot_paid = [], 0.0, 0.0
            for r in rows:
                d = get_value(r["set_num"])
                if not d or d.get("error"): continue
                val = (d.get("usedAvg") or d.get("newAvg")) if r.get("condition") == "opened" else d.get("newAvg")
                if val: tot_val += val
                if r.get("paid"): tot_paid += r["paid"]
                items.append({"set": d.get("set"), "name": d.get("name"), "image": d.get("image"),
                    "year": d.get("year"), "theme": d.get("theme"), "retired": d.get("retired"),
                    "condition": r.get("condition"), "value": val, "appreciation": d.get("appreciation")})
            # ROI% only (percentage, never the paid dollar amounts)
            roi = round((tot_val - tot_paid) / tot_paid * 100) if tot_paid > 0 else None
            return self._send(200, json.dumps({"ok": True, "count": len(items),
                "totalValue": round(tot_val), "roi": roi, "items": items}))
        if u.path == "/api/movers":
            try:
                return self._send(200, open(os.path.join(BASE, "movers.json")).read())
            except Exception:
                return self._send(200, json.dumps({"updated": None, "sets": []}))
        # static — locale-aware routing
        LOCS = ("fr", "de", "es", "it", "nl", "sv", "da")
        def resolve(p):
            noext = "." not in p.rsplit("/", 1)[-1]
            if p in ("", "/"): return "/index.html"
            if p in ("/pricing", "/terms", "/privacy", "/refunds", "/cookies"): return p + ".html"
            if p == "/blog": return "/blog/index.html"
            if p.startswith("/blog/") and noext: return p + ".html"
            if p == "/set": return "/set/index.html"
            if p.startswith("/set/") and noext: return p + ".html"
            return p
        path = u.path
        # global (non-localised) routes
        if path == "/app" or (path.startswith("/") and path.rstrip("/").split("/")[-1] == "app" and path.count("/") == 2):
            path = "/app.html"
        elif path.startswith("/u/") and "." not in path.rsplit("/", 1)[-1]:
            path = "/u.html"
        else:
            loc = ""
            for lg in LOCS:
                if path == "/" + lg or path.startswith("/" + lg + "/"):
                    loc = "/" + lg; path = path[len(loc):] or "/"; break
            path = (loc + resolve(path)) if loc else resolve(path)
        fp = os.path.realpath(os.path.join(STATIC, path.lstrip("/")))
        # security: confine to STATIC root (block path traversal ../ escaping the web root)
        if not (fp == _STATIC_ROOT or fp.startswith(_STATIC_ROOT + os.sep)):
            return self._send(404, "Not found", "text/plain")
        if not os.path.isfile(fp): return self._send(404, "Not found", "text/plain")
        ext = fp.rsplit(".", 1)[-1]
        ctype = {"html": "text/html", "css": "text/css", "js": "application/javascript",
                 "svg": "image/svg+xml"}.get(ext, "text/plain")
        self._send(200, open(fp, "rb").read(), ctype + ("; charset=utf-8" if ext in ("html","css","js") else ""))

if __name__ == "__main__":
    db_init()
    print(f"BrickGains en ligne -> http://localhost:{PORT}  (Ctrl+C pour arreter)")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
