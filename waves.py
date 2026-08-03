#!/usr/bin/env python3
"""Lancement SEO par vagues (brickgain.com, domaine neuf).
Objectif : ne pas balancer 1358 pages set d'un coup sur un domaine sans autorite.
- wave_plan.json = plan fige (sets classes par valeur de revente, repartis en vagues datees).
- A chaque execution : les vagues dont la date <= aujourd'hui sont "released"
  -> pas de noindex + presentes dans le sitemap. Les autres -> <meta robots noindex,follow> + hors sitemap.
IDEMPOTENT et pilote par la DATE : il suffit de relancer regulierement, les vagues s'ouvrent seules.
A lancer APRES gen_setpages (qui reecrit les pages) et AVANT gen_sitemap + deploy.
"""
import os, re, json, glob, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(BASE, "app", "static")
PLAN = os.path.join(BASE, "wave_plan.json")
RELEASED = os.path.join(BASE, "released_sets.json")
NOINDEX = '<meta name="robots" content="noindex,follow">'

# --- plan des vagues (dates absolues) ---
WAVES = [
    ("2026-08-03", 150),   # V0 : top 150 par valeur (+ blog + pages coeur, deja indexables)
    ("2026-08-24", 250),   # V1 : +250  (cumul 400)
    ("2026-09-14", 350),   # V2 : +350  (cumul 750)
    ("2026-10-05", 10**9), # V3 : le reste (cumul = tout)
]

def existing_set_nums():
    nums = []
    for f in sorted(glob.glob(os.path.join(STATIC, "set", "*.html"))):
        b = os.path.basename(f)[:-5]
        if b.isdigit():
            nums.append(b)
    return nums

def build_plan():
    """Classe les sets existants par valeur de revente (newAvg) decroissante, puis decoupe en vagues."""
    val = {}
    try:
        for s in json.load(open(os.path.join(BASE, "app", "catalog.json"))).get("sets", []):
            num = str(s.get("set", "")).split("-")[0]
            v = s.get("newAvg") or s.get("usedAvg") or s.get("rrp") or 0
            if num:
                val[num] = float(v or 0)
    except Exception:
        pass
    nums = existing_set_nums()
    nums.sort(key=lambda n: val.get(n, 0), reverse=True)  # plus chers d'abord
    plan, i = [], 0
    for date, size in WAVES:
        chunk = nums[i:i + size]
        i += len(chunk)
        plan.append({"date": date, "count": len(chunk), "sets": chunk})
        if i >= len(nums):
            break
    json.dump({"waves": plan}, open(PLAN, "w"), indent=1)
    return {"waves": plan}

def load_plan():
    if not os.path.exists(PLAN):
        return build_plan()
    return json.load(open(PLAN))

def apply():
    plan = load_plan()
    today = datetime.date.today().isoformat()
    released = set()
    opened = []
    for w in plan["waves"]:
        if w["date"] <= today:
            released.update(w["sets"])
            opened.append(w["date"])
    json.dump(sorted(released, key=int), open(RELEASED, "w"))

    added = removed = 0
    for f in glob.glob(os.path.join(STATIC, "set", "*.html")):
        num = os.path.basename(f)[:-5]
        if not num.isdigit():
            continue
        s = open(f, encoding="utf-8").read()
        has = NOINDEX in s
        if num in released and has:            # ouvrir -> retirer noindex
            s = re.sub(r'\s*' + re.escape(NOINDEX), "", s)
            open(f, "w", encoding="utf-8").write(s); removed += 1
        elif num not in released and not has:  # garder ferme -> ajouter noindex apres canonical
            s2 = re.sub(r'(<link rel="canonical"[^>]*>)', r'\1' + NOINDEX, s, count=1)
            if s2 == s:  # pas de canonical -> apres <head>
                s2 = s.replace("<head>", "<head>" + NOINDEX, 1)
            open(f, "w", encoding="utf-8").write(s2); added += 1

    total = len(existing_set_nums())
    print(f"[waves] {today} | vagues ouvertes: {opened} | set pages indexables: {len(released)}/{total} "
          f"| noindex ajoutes: {added}, retires: {removed}")

if __name__ == "__main__":
    import sys
    if "--plan" in sys.argv:
        build_plan()
        print("[waves] wave_plan.json (re)genere")
    apply()
