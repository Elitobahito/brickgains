#!/usr/bin/env python3
"""
BrickBaron - serveur MVP (stdlib only, aucune dépendance).
Sert la landing + l'app portefeuille, et expose /api/value?set=NNNN
qui fusionne Rebrickable + Brickset + Apify (BrickLink) avec cache 24h.

Lancer :  python3 app/server.py   puis ouvrir http://localhost:8000
"""
import json, os, time, re, urllib.request, urllib.parse, urllib.error, html
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

def qa(sql, params=()):
    c = _conn()
    try:
        cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) if PG else c.cursor()
        cur.execute(_conv(sql), params)
        return [dict(r) for r in cur.fetchall()]
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

def track_view(day, path, new_visitor):
    """Compteur de trafic interne (privé, sans cookie pub) -> alimente /admin."""
    try:
        if PG:
            qx("INSERT INTO traffic(day,path,hits) VALUES(?,?,1) ON CONFLICT(day,path) DO UPDATE SET hits=traffic.hits+1", (day, path))
        else:
            qx("INSERT INTO traffic(day,path,hits) VALUES(?,?,1) ON CONFLICT(day,path) DO UPDATE SET hits=hits+1", (day, path))
        if new_visitor:
            if PG:
                qx("INSERT INTO traffic_days(day,uniques) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET uniques=traffic_days.uniques+1", (day,))
            else:
                qx("INSERT INTO traffic_days(day,uniques) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET uniques=uniques+1", (day,))
    except Exception: pass

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
    qx("""CREATE TABLE IF NOT EXISTS traffic(
        day TEXT NOT NULL, path TEXT NOT NULL, hits INTEGER DEFAULT 0,
        UNIQUE(day, path))""")
    qx("""CREATE TABLE IF NOT EXISTS traffic_days(
        day TEXT PRIMARY KEY, uniques INTEGER DEFAULT 0)""")
    # migration: public share link on users
    try: qx("ALTER TABLE users ADD COLUMN share_id TEXT")
    except Exception: pass
    # migration: stripe customer id on users
    try: qx("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT")
    except Exception: pass
    # migration: email price-alert opt-in
    try: qx("ALTER TABLE users ADD COLUMN alert_email INTEGER DEFAULT 0")
    except Exception: pass
    # migration: multi-copy quantity (Investor)
    try: qx("ALTER TABLE portfolio ADD COLUMN qty INTEGER DEFAULT 1")
    except Exception: pass
    # server-side watchlist (with optional buy target)
    qx(f"""CREATE TABLE IF NOT EXISTS watchlist(
        id {ai}, user_id INTEGER NOT NULL, set_num TEXT NOT NULL,
        target REAL, created {ts}, UNIQUE(user_id, set_num))""")

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
# --- daily free-check counter (in-memory, per IP+day) for user-initiated value checks ---
CHECKS = {}
def check_bump(ip):
    day = time.strftime("%Y-%m-%d")
    key = ip + "|" + day
    if len(CHECKS) > 5000:
        for k in [k for k in CHECKS if not k.endswith(day)]: CHECKS.pop(k, None)
    n = CHECKS.get(key, 0)
    return n
def check_inc(ip):
    key = ip + "|" + time.strftime("%Y-%m-%d")
    CHECKS[key] = CHECKS.get(key, 0) + 1
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
    return q1("""SELECT u.id,u.email,u.plan,u.share_id,u.alert_email FROM sessions s JOIN users u ON u.id=s.user_id
                 WHERE s.token=?""", (tok,))

def _norm(sn):
    sn = str(sn).strip().lower().replace("lego", "").strip()
    return sn if "-" in sn else f"{sn}-1"

# ---------- Stripe (raw API, no SDK) ----------
STRIPE_SK = ENV.get("STRIPE_SECRET_KEY", "")
STRIPE_WHSEC = ENV.get("STRIPE_WEBHOOK_SECRET", "")
PRICE_IDS = {"pro": ENV.get("STRIPE_PRICE_PRO", ""), "investor": ENV.get("STRIPE_PRICE_INVESTOR", "")}
ANNUAL_PRICE_IDS = {"pro": ENV.get("STRIPE_PRICE_PRO_ANNUAL", ""), "investor": ENV.get("STRIPE_PRICE_INVESTOR_ANNUAL", "")}
STRIPE_PORTAL_CONFIG = ENV.get("STRIPE_PORTAL_CONFIG", "")
SITE_URL = ENV.get("SITE_URL", "https://brickgains.com")

# Free-plan limits (enforced server-side)
FREE_SETS_CAP = 10          # max sets a free account can track
FREE_CHECKS_PER_DAY = 3     # user-initiated value checks per day (anon/free)
PAID_PLANS = ("pro", "investor")

# --- internal admin (founders only) ---
ADMIN_KEY = ENV.get("ADMIN_KEY", "")
ADMIN_TOKEN = hashlib.sha256(("bgadmin1:" + ADMIN_KEY).encode()).hexdigest() if ADMIN_KEY else ""
PLAN_PRICE = {"pro": 4.99, "investor": 12.99}  # for MRR estimate

def _count_lines(fname):
    try:
        with open(os.path.join(ROOT, fname)) as f:
            return sum(1 for _ in f)
    except Exception:
        return 0

def stripe_api(path, data=None):
    req = urllib.request.Request("https://api.stripe.com/v1/" + path,
        data=(urllib.parse.urlencode(data, doseq=True).encode() if data is not None else None))
    req.add_header("Authorization", "Bearer " + STRIPE_SK)
    if data is not None:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return {"error": json.loads(e.read() or b"{}").get("error", {"message": "stripe error"})}
        except Exception: return {"error": {"message": "stripe error"}}
    except Exception as ex:
        return {"error": {"message": str(ex)}}

def stripe_verify(payload, sig_header):
    if not STRIPE_WHSEC or not sig_header:
        return False
    try:
        parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
        t, v1 = parts.get("t"), parts.get("v1")
        if not t or not v1:
            return False
        signed = t.encode() + b"." + payload
        expected = hmac.new(STRIPE_WHSEC.encode(), signed, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, v1)
    except Exception:
        return False

def set_user_plan(uid, plan):
    if uid:
        try: qx("UPDATE users SET plan=? WHERE id=?", (plan, int(uid)))
        except Exception: pass

# ---------- Email (Resend) ----------
RESEND_API_KEY = ENV.get("RESEND_API_KEY", "")
# Until brickgains.com is verified in Resend, sending is limited to the account owner.
EMAIL_FROM = ENV.get("EMAIL_FROM", "BrickGains <no-reply@brickgains.com>")
REPLY_TO_DEFAULT = ENV.get("REPLY_TO", "contact@brickgains.com")  # replies to no-reply mails land here
SUPPORT_NOTIFY = ENV.get("SUPPORT_NOTIFY", "")  # where contact-form messages are forwarded

def send_email(to, subject, html, reply_to=None):
    if not RESEND_API_KEY or not to:
        return {"error": "email not configured"}
    payload = {"from": EMAIL_FROM, "to": [to] if isinstance(to, str) else to,
               "subject": subject, "html": html}
    rt = reply_to or REPLY_TO_DEFAULT
    if rt:
        payload["reply_to"] = rt
    req = urllib.request.Request("https://api.resend.com/emails",
        data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return {"error": json.loads(e.read() or b"{}")}
        except Exception: return {"error": "send failed"}
    except Exception as ex:
        return {"error": str(ex)}

def email_shell(title, body_html, cta_label=None, cta_url=None):
    cta = (f'<a href="{cta_url}" style="display:inline-block;background:#E3000B;color:#fff;font-weight:700;'
           f'text-decoration:none;padding:12px 22px;border-radius:10px;margin-top:8px">{cta_label}</a>') if cta_label and cta_url else ""
    return (f'<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#141414">'
            f'<div style="font-weight:800;font-size:22px;color:#E3000B;padding:8px 0 16px">BrickGains</div>'
            f'<div style="background:#fff;border:2px solid #141414;border-radius:14px;padding:24px">'
            f'<h1 style="font-size:20px;margin:0 0 12px">{title}</h1>{body_html}{cta}</div>'
            f'<div style="color:#8a877e;font-size:12px;padding:14px 4px">BrickGains by Mint Technology LLC. '
            f'You receive this because you have a BrickGains account.</div></div>')

ALERT_PCT = float(ENV.get("ALERT_PCT", "8"))  # min |%| move vs previous snapshot to trigger an alert

def _catalog_names():
    """set_num (sans -1) -> nom, depuis catalog.json."""
    out = {}
    for p in (os.path.join(BASE, "catalog.json"), os.path.join(BASE, "static", "..", "catalog.json")):
        try:
            for s in json.load(open(p)).get("sets", []):
                out[str(s.get("set", "")).replace("-1", "")] = s.get("name") or ""
            if out: break
        except Exception: pass
    return out

def send_price_alerts(day, rows):
    """Après un snapshot: détecte les sets qui ont bougé >= ALERT_PCT vs le snapshot
    précédent, puis envoie un email digest aux users opt-in qui suivent ces sets."""
    try:
        movers = {}
        for r in (rows or []):
            sn = str(r.get("set", "")).replace("-1", "")
            new = r.get("newAvg")
            if not sn or new in (None, ""): continue
            prev = q1("SELECT new_avg FROM price_history WHERE set_num=? AND day<? ORDER BY day DESC LIMIT 1", (sn, day))
            if not prev or not prev.get("new_avg"): continue
            try:
                pa = float(prev["new_avg"]); nn = float(new)
            except Exception: continue
            if pa <= 0: continue
            pct = (nn - pa) / pa * 100.0
            if abs(pct) >= ALERT_PCT:
                movers[sn] = {"new": nn, "pct": pct}
        if not movers:
            return {"movers": 0, "emails": 0}
        names = _catalog_names()
        users = qa("SELECT id,email FROM users WHERE alert_email=1")
        sent = 0
        for us in users:
            uid, email = us["id"], us["email"]
            prows = qa("SELECT set_num FROM portfolio WHERE user_id=?", (uid,))
            mine = []
            for pr in prows:
                psn = str(pr["set_num"]).replace("-1", "")
                if psn in movers:
                    mine.append((psn, movers[psn]))
            if not mine: continue
            mine.sort(key=lambda x: abs(x[1]["pct"]), reverse=True)
            items = ""
            for sn, m in mine:
                nm = names.get(sn, "LEGO " + sn) or ("LEGO " + sn)
                arrow = "▲" if m["pct"] >= 0 else "▼"
                color = "#0a8f3c" if m["pct"] >= 0 else "#c8102e"
                items += (f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee">'
                          f'<b>{nm}</b> <span style="color:#8a877e">#{sn}</span></td>'
                          f'<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">'
                          f'${round(m["new"]):,} <b style="color:{color}">{arrow} {m["pct"]:+.0f}%</b></td></tr>')
            body = (f'<p style="margin:0 0 14px">Prices moved on {len(mine)} set(s) in your portfolio:</p>'
                    f'<table style="width:100%;border-collapse:collapse;font-size:15px">{items}</table>')
            res = send_email(email, f"BrickGains alert - {len(mine)} set(s) moved",
                             email_shell("Your portfolio moved", body, "Open dashboard", SITE_URL + "/app"))
            if not (isinstance(res, dict) and res.get("error")):
                sent += 1
        return {"movers": len(movers), "emails": sent}
    except Exception as e:
        return {"error": str(e)}

def send_target_alerts(day, rows):
    """Alerte prix-cible : quand un set suivi atteint (<=) le prix cible fixé par un
    user opt-in, on l'e-mail. Renvoie le nombre d'emails envoyés."""
    try:
        price = {}
        for r in (rows or []):
            sn = str(r.get("set", "")).replace("-1", "")
            v = r.get("newAvg")
            if sn and v not in (None, ""):
                try: price[sn] = float(v)
                except Exception: pass
        if not price: return {"emails": 0}
        names = _catalog_names(); sent = 0
        hits = qa("""SELECT w.user_id AS uid, u.email AS email, w.set_num AS set_num, w.target AS target
                     FROM watchlist w JOIN users u ON u.id=w.user_id
                     WHERE w.target IS NOT NULL AND u.alert_email=1""")
        for h in hits:
            sn = str(h["set_num"]).replace("-1", ""); tgt = float(h["target"] or 0)
            cur = price.get(sn)
            if cur is None or tgt <= 0 or cur > tgt: continue
            nm = names.get(sn, "LEGO " + sn) or ("LEGO " + sn)
            body = (f'<p style="margin:0 0 12px"><b>{nm}</b> (#{sn}) just hit your target price.</p>'
                    f'<p style="font-size:15px;margin:0">Current value: <b>${round(cur):,}</b> · your target: ${round(tgt):,}</p>')
            res = send_email(h["email"], f"Price target hit - {nm}",
                             email_shell("A set hit your target price", body, "View set", SITE_URL + "/set/" + sn))
            if not (isinstance(res, dict) and res.get("error")):
                sent += 1
        return {"emails": sent}
    except Exception as e:
        return {"error": str(e)}

def send_weekly_digest():
    """Digest hebdo : à chaque user opt-in, la valeur de son portefeuille + variation vs
    le snapshot précédent. Renvoie le nombre d'emails envoyés."""
    try:
        users = qa("SELECT id,email FROM users WHERE alert_email=1")
        names = _catalog_names(); sent = 0
        for us in users:
            uid, email = us["id"], us["email"]
            pts = qa("""SELECT ph.day AS day, SUM(ph.new_avg) AS value, COUNT(*) AS sets
                        FROM price_history ph JOIN portfolio p ON p.set_num=ph.set_num
                        WHERE p.user_id=? GROUP BY ph.day ORDER BY ph.day""", (uid,))
            if not pts: continue
            now = float(pts[-1]["value"] or 0)
            prev = float(pts[-2]["value"]) if len(pts) >= 2 else None
            nsets = int(pts[-1]["sets"] or 0)
            if now <= 0: continue
            if prev is not None and prev > 0:
                chg = now - prev; pctv = chg / prev * 100.0
                color = "#0a8f3c" if chg >= 0 else "#c8102e"
                arrow = "▲" if chg >= 0 else "▼"
                move = (f'<p style="font-size:15px;margin:0 0 6px">This week: '
                        f'<b style="color:{color}">{arrow} {pctv:+.1f}%</b> '
                        f'({"+"if chg>=0 else "-"}${abs(round(chg)):,})</p>')
            else:
                move = '<p style="font-size:15px;margin:0 0 6px;color:#8a877e">Your first weekly snapshot - we\'ll show week-over-week changes from next week.</p>'
            body = (f'<p style="margin:0 0 10px">Your BrickGains portfolio ({nsets} set{"s" if nsets!=1 else ""}) is worth:</p>'
                    f'<div style="font-size:34px;font-weight:800;color:#141414;margin:0 0 8px">${round(now):,}</div>'
                    f'{move}')
            res = send_email(email, "Your weekly BrickGains portfolio update",
                             email_shell("Weekly portfolio update", body, "Open dashboard", SITE_URL + "/app"))
            if not (isinstance(res, dict) and res.get("error")):
                sent += 1
        return {"users": len(users), "emails": sent}
    except Exception as e:
        return {"error": str(e)}

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

    def _is_admin(self):
        return bool(ADMIN_TOKEN) and self._cookie("bg_admin") == ADMIN_TOKEN

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
                if topic == "discount-10":
                    try:
                        send_email(email, "Your BrickGains 10% code 🎁", email_shell(
                            "Here is your 10% discount",
                            "<p style='font-weight:500;line-height:1.6'>Use this code at checkout for <b>10% off your first month</b> of any BrickGains plan:</p>"
                            "<div style='font-family:monospace;font-weight:800;font-size:22px;background:#FFCF00;border:2px solid #141414;border-radius:10px;padding:12px;text-align:center;margin:8px 0'>BRICK10</div>",
                            "See plans", SITE_URL + "/pricing"))
                    except Exception: pass
                return self._send(200, json.dumps({"ok": True}))
            except Exception:
                return self._send(500, json.dumps({"ok": False}))

        if u.path == "/api/signup":
            if not rate_ok("auth:" + self._ip(), 6, 900):
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
            try:
                send_email(email, "Welcome to BrickGains 🧱", email_shell(
                    "Welcome to BrickGains!",
                    "<p style='font-weight:500;line-height:1.6'>Your free account is ready. Add your LEGO sets and instantly see what they are really worth, "
                    "track your ROI, and watch the sets you want to buy. Real BrickLink prices, updated daily.</p>",
                    "Open my portfolio", SITE_URL + "/app"))
            except Exception: pass
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

        if u.path == "/api/change-password":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            if not rate_ok("pw:" + self._ip(), 8, 900):
                return self._send(429, json.dumps({"ok": False, "error": "Too many attempts. Try again later."}))
            d = self._body()
            cur = d.get("current") or ""
            new = d.get("new_password") or ""
            if len(new) < 8:
                return self._send(400, json.dumps({"ok": False, "error": "New password must be at least 8 characters."}))
            row = q1("SELECT pw_hash FROM users WHERE id=?", (me["id"],))
            if not row or not verify_pw(cur, row["pw_hash"]):
                return self._send(403, json.dumps({"ok": False, "error": "Current password is incorrect."}))
            qx("UPDATE users SET pw_hash=? WHERE id=?", (hash_pw(new), me["id"]))
            return self._send(200, json.dumps({"ok": True}))

        if u.path == "/api/alert-prefs":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            d = self._body()
            on = 1 if d.get("on") else 0
            if on and me.get("plan") not in PAID_PLANS:
                return self._send(403, json.dumps({"ok": False, "locked": True,
                    "error": "Email price alerts are a Pro feature. Upgrade to enable them."}))
            qx("UPDATE users SET alert_email=? WHERE id=?", (on, me["id"]))
            return self._send(200, json.dumps({"ok": True, "alert_email": on}))

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
            alerts = {"emails": 0}; targets = {"emails": 0}
            if d.get("alerts", True):
                alerts = send_price_alerts(day, d.get("rows") or [])
                targets = send_target_alerts(day, d.get("rows") or [])
            return self._send(200, json.dumps({"ok": True, "recorded": n, "day": day, "alerts": alerts, "targets": targets}))

        if u.path == "/api/digest":
            d = self._body()
            if d.get("key") != ENV.get("SNAPSHOT_KEY", "nope"):
                return self._send(403, json.dumps({"ok": False}))
            return self._send(200, json.dumps({"ok": True, "digest": send_weekly_digest()}))

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
                if (me.get("plan") or "free") == "free":
                    cnt = q1("SELECT count(*) AS n FROM portfolio WHERE user_id=?", (uid,))
                    if cnt and int(cnt["n"]) >= FREE_SETS_CAP:
                        return self._send(403, json.dumps({"ok": False, "limit": True,
                            "error": "Free plan tracks up to %d sets. Upgrade to Pro for unlimited." % FREE_SETS_CAP}))
                paid = d.get("paid")
                try: paid = float(paid) if paid not in (None, "") else None
                except Exception: paid = None
                cond = "opened" if str(d.get("condition", "sealed")).lower().startswith("open") else "sealed"
                qty = 1
                if me.get("plan") == "investor":
                    try: qty = max(1, min(99, int(d.get("qty") or 1)))
                    except Exception: qty = 1
                rid = qx("INSERT INTO portfolio(user_id,set_num,paid,condition,qty) VALUES(?,?,?,?,?)",
                         (uid, sn, paid, cond, qty), returning=True)
                return self._send(200, json.dumps({"ok": True, "id": rid}))
            if u.path == "/api/portfolio/qty":
                if me.get("plan") != "investor":
                    return self._send(403, json.dumps({"ok": False, "locked": True,
                        "error": "Multi-copy tracking is an Investor feature."}))
                rid = d.get("id")
                try: qty = max(1, min(99, int(d.get("qty") or 1)))
                except Exception: qty = 1
                qx("UPDATE portfolio SET qty=? WHERE id=? AND user_id=?", (qty, rid, uid))
                return self._send(200, json.dumps({"ok": True, "qty": qty}))
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
                is_free = (me.get("plan") or "free") == "free"
                cap = 200
                if is_free:
                    cur = q1("SELECT count(*) AS n FROM portfolio WHERE user_id=?", (uid,))
                    cap = max(0, FREE_SETS_CAP - (int(cur["n"]) if cur else 0))
                seen, n = set(), 0
                hit_limit = False
                for t in toks:
                    sn = t.strip().lower().replace("lego", "").replace("-1", "").strip()
                    if not sn or sn in seen: continue
                    if n >= cap:
                        hit_limit = is_free
                        break
                    seen.add(sn)
                    qx("INSERT INTO portfolio(user_id,set_num,paid,condition) VALUES(?,?,?,?)",
                       (uid, sn, None, "sealed"))
                    n += 1
                    if n >= 200: break
                res = {"ok": True, "added": n}
                if hit_limit:
                    res["limit"] = True
                    res["error"] = "Free plan tracks up to %d sets. Upgrade to Pro for unlimited." % FREE_SETS_CAP
                return self._send(200, json.dumps(res))
            return self._send(404, json.dumps({"ok": False}))

        if u.path.startswith("/api/watchlist"):
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            uid = me["id"]; d = self._body()
            if u.path == "/api/watchlist/add":
                sn = str(d.get("set", "")).strip().lower().replace("lego", "").replace("-1", "").strip()
                if not sn:
                    return self._send(400, json.dumps({"ok": False, "error": "set manquant"}))
                tgt = d.get("target")
                try: tgt = float(tgt) if tgt not in (None, "") else None
                except Exception: tgt = None
                if PG:
                    qx("INSERT INTO watchlist(user_id,set_num,target) VALUES(?,?,?) ON CONFLICT(user_id,set_num) DO UPDATE SET target=?",
                       (uid, sn, tgt, tgt))
                else:
                    qx("INSERT INTO watchlist(user_id,set_num,target) VALUES(?,?,?) ON CONFLICT(user_id,set_num) DO UPDATE SET target=?",
                       (uid, sn, tgt, tgt))
                return self._send(200, json.dumps({"ok": True}))
            if u.path == "/api/watchlist/remove":
                sn = str(d.get("set", "")).strip().lower().replace("-1", "").strip()
                qx("DELETE FROM watchlist WHERE user_id=? AND set_num=?", (uid, sn))
                return self._send(200, json.dumps({"ok": True}))
            return self._send(404, json.dumps({"ok": False}))

        if u.path == "/api/checkout":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            d = self._body()
            plan = (d.get("plan") or "").strip().lower()
            billing = (d.get("billing") or "monthly").strip().lower()
            price = (ANNUAL_PRICE_IDS.get(plan) if billing == "annual" else PRICE_IDS.get(plan))
            if not price:  # fallback to monthly if annual price missing
                price = PRICE_IDS.get(plan); billing = "monthly"
            if not price:
                return self._send(400, json.dumps({"ok": False, "error": "invalid plan"}))
            if not STRIPE_SK:
                return self._send(500, json.dumps({"ok": False, "error": "billing not configured"}))
            params = {
                "mode": "subscription",
                "line_items[0][price]": price,
                "line_items[0][quantity]": 1,
                "success_url": SITE_URL + "/app?upgraded=1",
                "cancel_url": SITE_URL + "/pricing?canceled=1",
                "client_reference_id": str(me["id"]),
                "customer_email": me["email"],
                "allow_promotion_codes": "true",
                "metadata[user_id]": str(me["id"]),
                "metadata[plan]": plan,
                "metadata[billing]": billing,
                "subscription_data[metadata][user_id]": str(me["id"]),
                "subscription_data[metadata][plan]": plan,
            }
            sess = stripe_api("checkout/sessions", params)
            if sess.get("error") or not sess.get("url"):
                msg = (sess.get("error") or {}).get("message", "checkout failed")
                return self._send(502, json.dumps({"ok": False, "error": msg}))
            return self._send(200, json.dumps({"ok": True, "url": sess["url"]}))

        if u.path == "/api/billing-portal":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            row = q1("SELECT stripe_customer_id FROM users WHERE id=?", (me["id"],))
            cust = row.get("stripe_customer_id") if row else None
            if not cust:
                return self._send(400, json.dumps({"ok": False, "error": "no active subscription"}))
            params = {"customer": cust, "return_url": SITE_URL + "/app"}
            if STRIPE_PORTAL_CONFIG:
                params["configuration"] = STRIPE_PORTAL_CONFIG
            sess = stripe_api("billing_portal/sessions", params)
            if sess.get("error") or not sess.get("url"):
                msg = (sess.get("error") or {}).get("message", "portal failed")
                return self._send(502, json.dumps({"ok": False, "error": msg}))
            return self._send(200, json.dumps({"ok": True, "url": sess["url"]}))

        if u.path == "/api/contact":
            if not rate_ok("contact:" + self._ip(), 6, 900):
                return self._send(429, json.dumps({"ok": False, "error": "Too many messages. Try again later."}))
            d = self._body()
            name = (d.get("name") or "").strip()[:120]
            email = (d.get("email") or "").strip()[:160]
            message = (d.get("message") or "").strip()[:4000]
            if "@" not in email or "." not in email or len(message) < 5:
                return self._send(400, json.dumps({"ok": False, "error": "Please enter a valid email and message."}))
            try:
                with open(os.path.join(ROOT, "contacts.csv"), "a") as f:
                    safe = message.replace("\n", " ").replace("\r", " ")
                    f.write(f'{time.strftime("%Y-%m-%d %H:%M:%S")}\t{name}\t{email}\t{safe}\n')
                if SUPPORT_NOTIFY:
                    try:
                        send_email(SUPPORT_NOTIFY, f"New contact message from {name or email}",
                            email_shell("New contact message",
                                f"<p style='font-weight:500;line-height:1.6'><b>From:</b> {html.escape(name)} &lt;{html.escape(email)}&gt;</p>"
                                f"<p style='font-weight:500;line-height:1.6;white-space:pre-wrap'>{html.escape(message)}</p>"),
                            reply_to=email)
                    except Exception: pass
            except Exception:
                return self._send(500, json.dumps({"ok": False}))
            return self._send(200, json.dumps({"ok": True}))

        if u.path == "/api/stripe/webhook":
            n = int(self.headers.get("Content-Length", "0") or 0)
            if n <= 0 or n > 1000000:
                return self._send(400, json.dumps({"ok": False}))
            payload = self.rfile.read(n)
            if not stripe_verify(payload, self.headers.get("Stripe-Signature", "")):
                return self._send(400, json.dumps({"ok": False, "error": "bad signature"}))
            try: evt = json.loads(payload)
            except Exception: return self._send(400, json.dumps({"ok": False}))
            typ = evt.get("type", "")
            obj = (evt.get("data") or {}).get("object") or {}
            meta = obj.get("metadata") or {}
            if typ == "checkout.session.completed":
                uid = obj.get("client_reference_id") or meta.get("user_id")
                plan = meta.get("plan") or "pro"
                set_user_plan(uid, plan)
                cust = obj.get("customer")
                if uid and cust:
                    try: qx("UPDATE users SET stripe_customer_id=? WHERE id=?", (cust, int(uid)))
                    except Exception: pass
                # notify founder of the new order
                try:
                    if SUPPORT_NOTIFY:
                        cust_email = (obj.get("customer_details") or {}).get("email") or obj.get("customer_email") or "?"
                        amount = (obj.get("amount_total") or 0) / 100.0
                        cur = (obj.get("currency") or "usd").upper()
                        bill = meta.get("billing") or "monthly"
                        send_email(SUPPORT_NOTIFY, f"💰 New BrickGains order: {plan} ({bill})",
                            email_shell("New subscription 🎉",
                                f"<p style='font-weight:500;line-height:1.6'><b>Plan:</b> {html.escape(plan)} ({html.escape(bill)})<br>"
                                f"<b>Amount:</b> {amount:.2f} {cur}<br>"
                                f"<b>Customer:</b> {html.escape(str(cust_email))}</p>",
                                "Open admin", SITE_URL + "/elitobahito"))
                except Exception: pass
            elif typ == "customer.subscription.updated":
                uid = meta.get("user_id")
                status = obj.get("status", "")
                plan = meta.get("plan") or "pro"
                set_user_plan(uid, plan if status in ("active", "trialing") else "free")
            elif typ == "customer.subscription.deleted":
                set_user_plan(meta.get("user_id"), "free")
            return self._send(200, json.dumps({"ok": True}))

        if u.path == "/api/admin/login":
            if not rate_ok("admin:" + self._ip(), 8, 900):
                return self._send(429, json.dumps({"ok": False, "error": "Too many attempts."}))
            d = self._body()
            if not ADMIN_KEY or (d.get("key") or "") != ADMIN_KEY:
                return self._send(403, json.dumps({"ok": False, "error": "Wrong password."}))
            sec = "; Secure" if self._https() else ""
            cookie = f"bg_admin={ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Lax{sec}; Max-Age=604800"
            return self._send(200, json.dumps({"ok": True}), cookie=cookie)

        if u.path == "/api/admin/delete-user":
            if not self._is_admin():
                return self._send(401, json.dumps({"ok": False, "error": "admin login required"}))
            d = self._body()
            email = (d.get("email") or "").strip().lower()
            if not email:
                return self._send(400, json.dumps({"ok": False, "error": "email requis"}))
            row = q1("SELECT id FROM users WHERE lower(email)=?", (email,))
            if not row:
                return self._send(404, json.dumps({"ok": False, "error": "introuvable"}))
            uid = row["id"]
            qx("DELETE FROM portfolio WHERE user_id=?", (uid,))
            qx("DELETE FROM sessions WHERE user_id=?", (uid,))
            qx("DELETE FROM users WHERE id=?", (uid,))
            return self._send(200, json.dumps({"ok": True, "deleted": email}))

        return self._send(404, "Not found", "text/plain")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/me":
            me = self._me()
            return self._send(200, json.dumps({"user": me}))

        if u.path == "/api/admin/stats":
            if not self._is_admin():
                return self._send(401, json.dumps({"ok": False, "error": "admin login required"}))
            s = {"ok": True}
            try:
                # users + plans
                c = _conn()
                cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) if PG else c.cursor()
                cur.execute("SELECT plan, count(*) AS n FROM users GROUP BY plan")
                plans = {}
                for r in cur.fetchall():
                    r = dict(r); plans[r["plan"] or "free"] = int(r["n"])
                s["plans"] = plans
                s["users_total"] = sum(plans.values())
                s["users_paid"] = plans.get("pro", 0) + plans.get("investor", 0)
                s["mrr_est"] = round(plans.get("pro", 0) * PLAN_PRICE["pro"] + plans.get("investor", 0) * PLAN_PRICE["investor"], 2)
                cur.execute(_conv("SELECT email, plan, created FROM users ORDER BY created DESC LIMIT 25"))
                s["recent"] = [dict(r) if PG else {"email": r[0], "plan": r[1], "created": str(r[2])} for r in cur.fetchall()]
                cur.execute("SELECT count(*) AS n FROM portfolio")
                row = cur.fetchone(); s["portfolio_entries"] = int((dict(row)["n"] if PG else row[0]))
                c.close()
            except Exception as e:
                s["db_error"] = str(e)
            # content
            s["newsletter_subs"] = _count_lines("subscribers.csv")
            s["contact_msgs"] = _count_lines("contacts.csv")
            try:
                s["catalog_sets"] = len(json.load(open(os.path.join(BASE, "static", "..", "catalog.json"))).get("sets", []))
            except Exception:
                try: s["catalog_sets"] = len(json.load(open(os.path.join(BASE, "catalog.json"))).get("sets", []))
                except Exception: s["catalog_sets"] = 0
            # stripe live
            try:
                sub = stripe_api("subscriptions?status=active&limit=100&expand[]=data.items.data.price")
                data = sub.get("data") if isinstance(sub, dict) else None
                if isinstance(data, list):
                    mrr = 0.0
                    for su in data:
                        for it in (su.get("items", {}).get("data", []) or []):
                            pr = it.get("price", {}) or {}
                            amt = (pr.get("unit_amount") or 0) / 100.0
                            mrr += amt * (it.get("quantity", 1) or 1)
                    s["stripe_active_subs"] = len(data)
                    s["stripe_mrr"] = round(mrr, 2)
                else:
                    s["stripe_error"] = (sub.get("error") if isinstance(sub, dict) else "no data")
            except Exception as e:
                s["stripe_error"] = str(e)
            # traffic (compteur interne)
            try:
                since7 = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 7 * 86400))
                daily = qa("SELECT day, SUM(hits) AS views FROM traffic GROUP BY day ORDER BY day DESC LIMIT 14")
                uq = {r["day"]: r["uniques"] for r in qa("SELECT day, uniques FROM traffic_days ORDER BY day DESC LIMIT 14")}
                for r in daily:
                    r["views"] = int(r["views"] or 0); r["uniques"] = int(uq.get(r["day"], 0))
                s["traffic"] = daily
                s["views_7d"] = sum(r["views"] for r in daily if r["day"] >= since7)
                s["visitors_7d"] = sum(r["uniques"] for r in daily if r["day"] >= since7)
                s["top_pages"] = qa("SELECT path, SUM(hits) AS hits FROM traffic WHERE day>=? GROUP BY path ORDER BY hits DESC LIMIT 12", (since7,))
                for r in s["top_pages"]: r["hits"] = int(r["hits"] or 0)
            except Exception as e:
                s["traffic_error"] = str(e)
            return self._send(200, json.dumps(s, default=str))
        if u.path == "/api/portfolio":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            rows = []
            try:
                c = _conn()
                cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) if PG else c.cursor()
                cur.execute(_conv("SELECT id,set_num,paid,condition,qty FROM portfolio WHERE user_id=? ORDER BY id DESC"), (me["id"],))
                rows = [dict(r) for r in cur.fetchall()]
                c.close()
            except Exception: pass
            return self._send(200, json.dumps({"ok": True, "items": rows}))
        if u.path == "/api/watchlist":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            try:
                rows = qa("SELECT set_num, target FROM watchlist WHERE user_id=? ORDER BY id DESC", (me["id"],))
            except Exception:
                rows = []
            return self._send(200, json.dumps({"ok": True, "items": rows}))
        if u.path == "/api/portfolio/history":
            me = self._me()
            if not me:
                return self._send(401, json.dumps({"ok": False, "error": "login required"}))
            if me.get("plan") not in PAID_PLANS:
                return self._send(403, json.dumps({"ok": False, "locked": True,
                    "error": "Portfolio value history is a Pro feature."}))
            try:
                rows = qa("""SELECT ph.day AS day, SUM(ph.new_avg) AS value, COUNT(*) AS sets
                             FROM price_history ph JOIN portfolio p ON p.set_num=ph.set_num
                             WHERE p.user_id=? GROUP BY ph.day ORDER BY ph.day""", (me["id"],))
                for r in rows:
                    r["value"] = round(float(r["value"] or 0), 2); r["sets"] = int(r["sets"] or 0)
            except Exception as e:
                return self._send(200, json.dumps({"ok": True, "points": [], "err": str(e)}))
            return self._send(200, json.dumps({"ok": True, "points": rows}))
        if u.path == "/api/value":
            qs = urllib.parse.parse_qs(u.query)
            q = qs.get("set", [""])[0]
            if not q: return self._send(400, json.dumps({"error": "set manquant"}))
            # user-initiated checks (u=1) are limited per day for anon/free users
            if qs.get("u", [""])[0] == "1":
                me = self._me()
                paid = bool(me and (me.get("plan") in PAID_PLANS))
                if not paid:
                    ip = self._ip()
                    if check_bump(ip) >= FREE_CHECKS_PER_DAY:
                        return self._send(429, json.dumps({"limit": True,
                            "error": "You have used your %d free checks for today. Subscribe for unlimited." % FREE_CHECKS_PER_DAY}))
                    check_inc(ip)
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
            me = self._me()
            if not (me and me.get("plan") in PAID_PLANS):
                return self._send(403, json.dumps({"ok": False, "locked": True,
                    "error": "Market Movers is a Pro feature. Upgrade to unlock gainers & laggards."}))
            try:
                return self._send(200, open(os.path.join(BASE, "movers.json")).read())
            except Exception:
                return self._send(200, json.dumps({"updated": None, "sets": []}))
        # static — locale-aware routing
        LOCS = ("fr", "de", "es", "it", "nl", "sv", "da")
        def resolve(p):
            if len(p) > 1 and p.endswith("/"): p = p.rstrip("/")  # /admin/ -> /admin, /pricing/ -> /pricing
            noext = "." not in p.rsplit("/", 1)[-1]
            if p in ("", "/"): return "/index.html"
            if p in ("/pricing", "/terms", "/privacy", "/refunds", "/cookies", "/contact"): return p + ".html"
            if p == "/elitobahito": return "/admin.html"
            if p == "/blog": return "/blog/index.html"
            if p.startswith("/blog/") and noext: return p + ".html"
            if p == "/set": return "/set/index.html"
            if p.startswith("/set/") and noext:
                tok = p[len("/set/"):]
                mnum = re.match(r"^(\d+)", tok)   # /set/<num>-<slug> -> serve <num>.html
                return ("/set/" + mnum.group(1) + ".html") if mnum else (p + ".html")
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
        cookie = None
        if ext == "html" and "admin" not in fp:
            try:
                day = time.strftime("%Y-%m-%d")
                seen = self._cookie("bg_v")
                new_v = (seen != day)
                track_view(day, u.path[:120], new_v)
                if new_v:
                    cookie = "bg_v=%s; Path=/; Max-Age=63072000; SameSite=Lax" % day
            except Exception: cookie = None
        self._send(200, open(fp, "rb").read(),
                   ctype + ("; charset=utf-8" if ext in ("html","css","js") else ""), cookie=cookie)

if __name__ == "__main__":
    db_init()
    print(f"BrickGains en ligne -> http://localhost:{PORT}  (Ctrl+C pour arreter)")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
