#!/usr/bin/env python3
"""Génère sitemap.xml multilingue avec alternates hreflang.
Regroupe les 8 locales d'une même page logique en 1 <url> + xhtml:link alternates.
Exclut app.html (noindex) et u.html (noindex, pages perso)."""
import os, glob, html, time, json, re

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(BASE, "app", "static")
SITE = "https://brickgain.com"
LOCS = ["en"]  # EN-only (brickgain.com)
DIR = {"en": "", "fr": "/fr", "de": "/de", "es": "/es", "it": "/it", "nl": "/nl", "sv": "/sv", "da": "/da"}

def _slug(name):
    s = str(name).lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s[:60].rstrip("-")) or "set"

# num -> slug (set pages canonical URL includes the name slug)
SLUG = {}
try:
    for s in json.load(open(os.path.join(BASE, "app", "catalog.json"))).get("sets", []):
        num = str(s.get("set", "")).replace("-1", "")
        if num: SLUG[num] = _slug(s.get("name", ""))
except Exception:
    pass

def loc_of(rel):
    p = rel.split("/", 1)
    if p[0] in DIR and p[0] != "en":
        return p[0], (p[1] if len(p) > 1 else "")
    return "en", rel

def canon_path(inner):
    """inner = path within a locale, e.g. 'index.html','pricing.html','set/10276.html','blog/x.html'."""
    if inner in ("index.html", ""): return "/"
    if inner.endswith("/index.html"): return "/" + inner[:-len("/index.html")]
    if inner.endswith(".html"):
        stem = inner[:-5]
        m = re.fullmatch(r"set/(\d+)", stem)   # set pages carry the name slug in the canonical URL
        if m and m.group(1) in SLUG:
            return "/set/%s-%s" % (m.group(1), SLUG[m.group(1)])
        return "/" + stem
    return "/" + inner

# lancement par vagues : ne lister que les set pages "released" (released_sets.json).
# fichier absent -> tout est release (retrocompat).
RELEASED = None
try:
    RELEASED = set(json.load(open(os.path.join(BASE, "released_sets.json"))))
except Exception:
    RELEASED = None

# collect: canon_path -> set(locales that have it)
pages = {}
for f in glob.glob(STATIC + "/**/*.html", recursive=True):
    rel = os.path.relpath(f, STATIC)
    base = os.path.basename(rel)
    if base in ("app.html", "u.html", "404.html", "admin.html"): continue
    # set page non encore ouverte -> hors sitemap
    if rel.startswith("set/") and base[:-5].isdigit() and RELEASED is not None and base[:-5] not in RELEASED:
        continue
    lg, inner = loc_of(rel)
    cp = canon_path(inner)
    pages.setdefault(cp, set()).add(lg)

def url_for(lg, cp):
    d = DIR[lg]
    if cp == "/": return SITE + (d or "/")
    return SITE + d + cp

today = time.strftime("%Y-%m-%d")
out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
n = 0
for cp in sorted(pages):
    locs = [lg for lg in LOCS if lg in pages[cp]]
    # priority: home 1.0, set index/pricing 0.9, set pages 0.8, blog 0.6, legal 0.3
    if cp == "/": prio = "1.0"
    elif cp in ("/set", "/pricing"): prio = "0.9"
    elif cp.startswith("/set/"): prio = "0.8"
    elif cp == "/blog" or cp.startswith("/blog/"): prio = "0.6"
    elif cp in ("/terms", "/privacy", "/refunds", "/cookies"): prio = "0.3"
    else: prio = "0.7"
    alts = "".join(
        f'<xhtml:link rel="alternate" hreflang="{lg}" href="{html.escape(url_for(lg, cp))}"/>'
        for lg in locs)
    if "en" in locs:
        alts += f'<xhtml:link rel="alternate" hreflang="x-default" href="{html.escape(url_for("en", cp))}"/>'
    for lg in locs:
        out.append(f'<url><loc>{html.escape(url_for(lg, cp))}</loc>{alts}'
                   f'<lastmod>{today}</lastmod><priority>{prio}</priority></url>')
        n += 1
out.append('</urlset>')
open(os.path.join(STATIC, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(out))
print(f"✅ sitemap.xml: {n} URLs across {len(pages)} logical pages, {len(LOCS)} locales")
