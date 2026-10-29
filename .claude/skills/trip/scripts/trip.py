#!/usr/bin/env python3
"""CLI minimal pour l'API du carnet de voyage Tripbook (stdlib uniquement).

Usage :
  trip.py summary
  trip.py state
  trip.py get <coll|coll/id|trip|budget>
  trip.py add <coll> '<json>'
  trip.py patch <coll/id|trip|budget> '<json>'
  trip.py put <coll/id|trip|budget|coll> '<json>'
  trip.py delete <coll/id>
  trip.py notify "Titre" "Corps du message" [/#tasks]     notification push sur les téléphones
  trip.py upload <fichier local>                          dépose dans data/files (→ booking.file, day.photos)
  trip.py backups | restore <nom>
Collections : days, bookings (hotel|flight|train|activity), tasks, notes, expenses, guides, ideas (liens Reels/TikTok), sleep (nuits mesurées)
Config : variables d'environnement TRIP_URL (défaut http://127.0.0.1:8787), TRIP_TOKEN, TRIP_AGENT,
         sinon le fichier .env à la racine du dépôt (ou /opt/tripbook/.env sur le serveur).
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))


def _env():
    """Variables TRIP_* : environnement, puis .env en remontant depuis ce script (racine du dépôt), puis /opt/tripbook/.env."""
    found = {}
    cands = [os.path.join(HERE, *([".."] * i), ".env") for i in range(0, 5)] + ["/opt/tripbook/.env"]
    for f in cands:
        try:
            with open(f, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    found.setdefault(k.strip(), v.split(" #")[0].strip().strip('"').strip("'"))
            break
        except OSError:
            continue
    for k in ("TRIP_URL", "TRIP_TOKEN", "TRIP_TOKENS", "TRIP_AGENT"):
        if os.environ.get(k):
            found[k] = os.environ[k]
    return found


ENV = _env()
AGENT = ENV.get("TRIP_AGENT", "Claude")


def _base():
    u = (ENV.get("TRIP_URL") or "http://127.0.0.1:8787").rstrip("/")
    return u if u.endswith("/api") else u + "/api"


def _token():
    if ENV.get("TRIP_TOKEN"):
        return ENV["TRIP_TOKEN"]
    # .env du serveur : TRIP_TOKENS=nom:jeton,… → jeton de l'assistant
    for pair in ENV.get("TRIP_TOKENS", "").split(","):
        if ":" in pair:
            name, tok = pair.split(":", 1)
            if name.strip().lower() == AGENT.lower():
                return tok.strip()
    return ""


BASE = _base()
TOKEN = _token()


def call(method, path, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + "/" + path.strip("/"), data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")
        sys.exit("HTTP %s: %s" % (e.code, msg[:500]))


def upload(path):
    name = os.path.basename(path)
    data = open(path, "rb").read()
    req = urllib.request.Request(BASE + "/upload/" + urllib.parse.quote(name), data=data, method="PUT")
    req.add_header("Content-Type", "application/octet-stream")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def out(x):
    print(json.dumps(x, ensure_ascii=False, indent=1))


def summary():
    s = call("GET", "state")
    t = s.get("trip", {})
    print("%s · %s → %s · version %s (maj %s)" % (t.get("title"), t.get("start"), t.get("end"), s.get("version"), s.get("updatedAt")))
    if t.get("alert"):
        print("ALERTE : " + t["alert"])
    print("\nJOURS")
    for d in s.get("days", []):
        lodge = next((b for b in s.get("bookings", []) if b.get("id") == (d.get("lodging") or {}).get("bookingId")), None)
        print(" %s  %-18s %-40s  %s" % (d.get("date"), d.get("city", "")[:18], d.get("title", "")[:40],
              ("logement: " + lodge["name"][:28] + (" ✓" if lodge.get("status") == "confirmed" else " ✗ à réserver")) if lodge else ""))
    print("\nRÉSERVATIONS")
    for b in s.get("bookings", []):
        print(" [%s] %-8s %s → %s  %-38s %s" % ("✓" if b.get("status") == "confirmed" else " ", b.get("type"), b.get("checkin"), b.get("checkout") or "", b.get("name", "")[:38], ("%s %s" % (b["price"], b.get("currency") or t.get("currency") or "")) if b.get("price") is not None else ""))
    print("\nÉCHÉANCES D'ANNULATION")
    for b in s.get("bookings", []):
        if b.get("cancelBy"):
            print(" %s  %s" % (b["cancelBy"], b.get("name", "")))
    print("\nDÉPENSES : %d saisies" % len(s.get("expenses", [])))
    ideas = [i for i in s.get("ideas", []) if i.get("status") != "done"]
    print("\nIDÉES À FAIRE : %d (%d à placer)" % (len(ideas), len([i for i in ideas if not i.get("city")])))
    print("\nTÂCHES OUVERTES")
    for x in s.get("tasks", []):
        if x.get("col") != "done":
            print(" [%s] (%s) %s — %s" % (x.get("col"), x.get("priority"), x.get("title"), x.get("deadline", "")))
    print("\nNOTES (5 dernières)")
    for n in s.get("notes", [])[-5:]:
        print(" %s · %s : %s" % (n.get("createdAt", "")[:16], n.get("author"), n.get("text")))


def main(a):
    if not a or a[0] in ("-h", "--help"):
        print(__doc__); return
    cmd = a[0]
    if cmd == "summary":
        return summary()
    if cmd == "state":
        return out(call("GET", "state"))
    if cmd == "get":
        return out(call("GET", a[1]))
    if cmd == "delete":
        return out(call("DELETE", a[1]))
    if cmd == "notify":
        return out(call("POST", "push/send", {"title": a[1], "body": a[2] if len(a) > 2 else "", "url": a[3] if len(a) > 3 else "/"}))
    if cmd == "upload":
        return out(upload(a[1]))
    if cmd == "backups":
        return out(call("GET", "backups"))
    if cmd == "restore":
        return out(call("POST", "backups/" + a[1] + "/restore"))
    if cmd in ("add", "patch", "put"):
        body = json.loads(a[2]) if len(a) > 2 else json.load(sys.stdin)
        method = {"add": "POST", "patch": "PATCH", "put": "PUT"}[cmd]
        return out(call(method, a[1], body))
    sys.exit("commande inconnue : " + cmd)


if __name__ == "__main__":
    main(sys.argv[1:])
