#!/usr/bin/env python3
"""Tripbook — serveur PWA + API JSON + temps réel (SSE) + push. Stdlib (pywebpush optionnel pour le push).

Variables d'environnement :
  TRIP_TOKENS  "alice:xxx,bob:yyy,claude:zzz"  (nom:jeton) — recommandé ; le nom signe notes et dépenses
  TRIP_TOKEN   jeton unique (compat.) — associé au nom "Voyageur"
  TRIP_AGENT   nom de l'assistant (défaut "Claude") : ses notes déclenchent une notification push
  TRIP_HOST    défaut 127.0.0.1      TRIP_PORT  défaut 8787
  TRIP_DATA    dossier data/ (trip.json, files/, backups/, push.json, vapid/)
  TRIP_URL     URL publique (pour les liens des notifications et le contact VAPID)
  TRIP_SHARE_KEY  clé du lien de partage /partage/?k=<clé>&nom=<prénom> (vide = partage désactivé)
"""
import json, os, sys, hmac, time, threading, queue, uuid, mimetypes, posixpath, re, shutil, base64, html as htmlmod, urllib.request
from datetime import datetime, timezone, date, timedelta
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs, unquote, quote

ROOT = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(ROOT, "app")
DATA_DIR = os.environ.get("TRIP_DATA", os.path.join(ROOT, "data"))
DATA_FILE = os.path.join(DATA_DIR, "trip.json")
FILES_DIR = os.path.join(DATA_DIR, "files")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
PUSH_FILE = os.path.join(DATA_DIR, "push.json")
VAPID_DIR = os.path.join(DATA_DIR, "vapid")
HOST = os.environ.get("TRIP_HOST", "127.0.0.1")
PORT = int(os.environ.get("TRIP_PORT", "8787"))
PUBLIC_URL = os.environ.get("TRIP_URL", "").rstrip("/")
SHARE_KEY = os.environ.get("TRIP_SHARE_KEY", "").strip()
AGENT = os.environ.get("TRIP_AGENT", "Claude").strip() or "Claude"
DEFAULT_TITLE = "Carnet de voyage"
TEMPLATED = {os.path.join(APP_DIR, "index.html"), os.path.join(APP_DIR, "manifest.webmanifest"), os.path.join(APP_DIR, "partage", "index.html")}
COLLECTIONS = ("days", "bookings", "tasks", "notes", "expenses", "guides", "ideas", "sleep")
OBJECTS = ("trip", "budget")
MAX_BACKUPS = 50
MAX_UPLOAD = 15 * 1024 * 1024


def parse_tokens():
    toks = {}
    for pair in os.environ.get("TRIP_TOKENS", "").split(","):
        if ":" in pair:
            name, tok = pair.split(":", 1)
            if tok.strip():
                toks[tok.strip()] = name.strip().capitalize()
    single = os.environ.get("TRIP_TOKEN", "").strip()
    if single and single not in toks:
        toks[single] = "Voyageur"
    return toks


TOKENS = parse_tokens()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- push (optionnel)
try:
    from pywebpush import webpush, WebPushException  # type: ignore
    from py_vapid import Vapid  # type: ignore
    from cryptography.hazmat.primitives import serialization  # type: ignore
    PUSH_OK = True
except Exception:
    PUSH_OK = False


class Push:
    def __init__(self):
        self.lock = threading.Lock()
        self.subs = []
        self.public_key = ""
        self.key_path = os.path.join(VAPID_DIR, "private_key.pem")
        if os.path.isfile(PUSH_FILE):
            try:
                self.subs = json.load(open(PUSH_FILE, encoding="utf-8"))
            except Exception:
                self.subs = []
        if PUSH_OK:
            os.makedirs(VAPID_DIR, exist_ok=True)
            if not os.path.isfile(self.key_path):
                v = Vapid(); v.generate_keys(); v.save_key(self.key_path)
            v = Vapid.from_file(self.key_path)
            raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
            self.public_key = base64.urlsafe_b64encode(raw).decode().rstrip("=")

    def save(self):
        tmp = PUSH_FILE + ".tmp"
        json.dump(self.subs, open(tmp, "w", encoding="utf-8"))
        os.replace(tmp, PUSH_FILE)

    def subscribe(self, sub, who):
        with self.lock:
            self.subs = [s for s in self.subs if s.get("endpoint") != sub.get("endpoint")]
            self.subs.append({"endpoint": sub.get("endpoint"), "keys": sub.get("keys"), "who": who, "createdAt": now_iso()})
            self.save()

    def unsubscribe(self, endpoint):
        with self.lock:
            self.subs = [s for s in self.subs if s.get("endpoint") != endpoint]
            self.save()

    def send(self, title, body, url="/", tag="tripbook"):
        if not PUSH_OK or not self.subs:
            return 0
        payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag}, ensure_ascii=False)
        claims = {"sub": PUBLIC_URL or "mailto:tripbook@example.invalid"}
        dead = []
        for s in list(self.subs):
            try:
                webpush(subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]}, data=payload,
                        vapid_private_key=self.key_path, vapid_claims=dict(claims), ttl=3600)
            except WebPushException as e:
                code = getattr(getattr(e, "response", None), "status_code", 0)
                if code in (404, 410):
                    dead.append(s["endpoint"])
                print("[push] échec", code, str(e)[:120], flush=True)
            except Exception as e:
                print("[push] erreur", repr(e)[:160], flush=True)
        for ep in dead:
            self.unsubscribe(ep)
        return len(self.subs)

    def send_async(self, *a, **k):
        threading.Thread(target=self.send, args=a, kwargs=k, daemon=True).start()


# ---------------------------------------------------------------- store
class Store:
    def __init__(self):
        self.lock = threading.RLock()
        self.clients = []
        self.data = {}
        self.mtime = 0.0
        self.load()
        threading.Thread(target=self.watch, daemon=True).start()
        threading.Thread(target=self.maintenance, daemon=True).start()

    def load(self):
        with self.lock:
            with open(DATA_FILE, encoding="utf-8") as f:
                self.data = json.load(f)
            for c in COLLECTIONS:
                self.data.setdefault(c, [])
            self.mtime = os.stat(DATA_FILE).st_mtime

    def backup(self):
        try:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            name = "trip-%s.json" % datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
            shutil.copyfile(DATA_FILE, os.path.join(BACKUP_DIR, name))
            names = sorted(n for n in os.listdir(BACKUP_DIR) if n.startswith("trip-"))
            for old in names[:-MAX_BACKUPS]:
                os.remove(os.path.join(BACKUP_DIR, old))
        except Exception as e:
            print("[backup] échec", e, flush=True)

    def save(self, source):
        with self.lock:
            self.backup()
            self.data["version"] = int(self.data.get("version", 0)) + 1
            self.data["updatedAt"] = now_iso()
            if isinstance(self.data.get("days"), list):
                self.data["days"].sort(key=lambda d: str(d.get("date", "")))
            tmp = DATA_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=1)
            os.replace(tmp, DATA_FILE)
            self.mtime = os.stat(DATA_FILE).st_mtime
            self.broadcast({"type": "change", "version": self.data["version"], "source": source})

    def broadcast(self, evt):
        for q in list(self.clients):
            try:
                q.put_nowait(evt)
            except queue.Full:
                pass

    def watch(self):
        while True:
            time.sleep(1)
            try:
                m = os.stat(DATA_FILE).st_mtime
            except OSError:
                continue
            if m != self.mtime:
                try:
                    self.load()
                    self.save("file")
                    print("[watch] trip.json rechargé depuis le disque", flush=True)
                except Exception as e:
                    self.mtime = m
                    print("[watch] trip.json ignoré :", e, flush=True)

    def maintenance(self):
        """Toutes les heures : échéances d'annulation → tâche critique à J-3."""
        while True:
            try:
                self.cancel_deadlines()
            except Exception as e:
                print("[maintenance]", e, flush=True)
            time.sleep(3600)

    def cancel_deadlines(self):
        today = date.today()
        changed = False
        with self.lock:
            for b in self.data.get("bookings", []):
                cb = b.get("cancelBy")
                if not cb or b.get("status") != "confirmed":
                    continue
                try:
                    d = date.fromisoformat(cb[:10])
                except ValueError:
                    continue
                left = (d - today).days
                tid = "cancel-" + str(b.get("id"))
                if 0 <= left <= 3 and self.find("tasks", tid)[1] is None:
                    self.data["tasks"].append({"id": tid, "col": "todo", "priority": "critical",
                                               "title": "Annulation gratuite %s : dernier jour le %s" % (b.get("name", ""), d.strftime("%d/%m")),
                                               "desc": "Après cette date la réservation devient payante. Vérifier que tout est bon ou annuler avant.",
                                               "deadline": "J-%d" % left})
                    changed = True
            if changed:
                self.save("maintenance")
                push.send_async("Échéance d'annulation", "Une réservation arrive à sa date limite d'annulation gratuite.", "/#tasks")

    def find(self, coll, item_id):
        for i, it in enumerate(self.data.get(coll, [])):
            if str(it.get("id")) == item_id:
                return i, it
        return -1, None


store = None
push = None

# ---------------------------------------------------------------- aperçu d'un lien (Reels, TikTok, YouTube…)
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"


def http_get(url, timeout=6):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "fr,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(400000).decode("utf-8", "replace")


def platform_of(url):
    h = urlsplit(url).netloc.lower()
    if "tiktok" in h: return "tiktok"
    if "instagram" in h: return "instagram"
    if "youtube" in h or "youtu.be" in h: return "youtube"
    if "google" in h and "maps" in url: return "maps"
    return "web"


def unfurl(url):
    out = {"url": url, "platform": platform_of(url), "title": "", "thumb": "", "author": ""}
    try:
        if out["platform"] == "tiktok":
            o = json.loads(http_get("https://www.tiktok.com/oembed?url=" + quote(url, safe="")))
            out.update(title=o.get("title", ""), thumb=o.get("thumbnail_url", ""), author=o.get("author_name", ""))
        elif out["platform"] == "youtube":
            o = json.loads(http_get("https://www.youtube.com/oembed?format=json&url=" + quote(url, safe="")))
            out.update(title=o.get("title", ""), thumb=o.get("thumbnail_url", ""), author=o.get("author_name", ""))
        else:
            page = http_get(url)
            def meta(prop):
                m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']*)["\']' % re.escape(prop), page, re.I) or \
                    re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']%s["\']' % re.escape(prop), page, re.I)
                return htmlmod.unescape(m.group(1)) if m else ""
            out.update(title=meta("og:title") or meta("twitter:title") or (re.search(r"<title>(.*?)</title>", page, re.I | re.S) or [None, ""])[1].strip(), thumb=meta("og:image") or meta("twitter:image"), author=meta("og:site_name"))
            if out["platform"] == "instagram" and ("Instagram" == out["title"] or "login" in out["title"].lower()):
                out["title"] = ""   # page de connexion : rien d'utile
    except Exception as e:
        out["error"] = str(e)[:120]
    return out


# ---------------------------------------------------------------- iCalendar
def ics_escape(s):
    return str(s or "").replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def ics_time(d, t):
    m = re.match(r"^(\d{1,2}):(\d{2})", str(t or ""))
    if not m:
        return None
    return "%sT%02d%02d00" % (d.replace("-", ""), int(m.group(1)), int(m.group(2)))


def trip_title(data):
    return str((data.get("trip") or {}).get("title") or DEFAULT_TITLE)


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "voyage"


def build_ics(data):
    title = trip_title(data)
    out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tripbook//%s//FR" % ics_escape(title), "CALSCALE:GREGORIAN", "X-WR-CALNAME:%s" % ics_escape(title)]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for b in data.get("bookings", []):
        if b.get("status") != "confirmed" or not b.get("checkin"):
            continue
        tz = b.get("tz") or (data.get("trip") or {}).get("tz") or "UTC"
        lines = ["BEGIN:VEVENT", "UID:%s@tripbook" % b.get("id"), "DTSTAMP:%s" % stamp]
        desc = " · ".join(x for x in [b.get("ref") and "Réf. " + b["ref"], b.get("pin") and "PIN " + b["pin"], b.get("room"), b.get("phone"), b.get("notes")] if x)
        if b.get("type") == "hotel":
            end = b.get("checkout") or b.get("checkin")
            lines += ["DTSTART;VALUE=DATE:%s" % b["checkin"].replace("-", ""), "DTEND;VALUE=DATE:%s" % end.replace("-", ""),
                      "SUMMARY:%s" % ics_escape("🏨 " + b.get("name", "")),
                      "DESCRIPTION:%s" % ics_escape("Check-in %s · check-out %s\n%s" % (b.get("checkinTime", ""), b.get("checkoutTime", ""), desc))]
        else:
            st = ics_time(b["checkin"], b.get("checkinTime"))
            en = ics_time(b.get("checkout") or b["checkin"], b.get("checkoutTime")) or st
            if not st:
                continue
            icon = "✈ " if b.get("type") == "flight" else "🚄 "
            route = (b.get("from") and b.get("to")) and "%s → %s" % (b["from"], b["to"]) or b.get("address", "")
            lines += ["DTSTART;TZID=%s:%s" % (tz, st), "DTEND;TZID=%s:%s" % (tz, en),
                      "SUMMARY:%s" % ics_escape(icon + b.get("name", "")),
                      "DESCRIPTION:%s" % ics_escape("\n".join(x for x in [route, b.get("car") and "Voiture %s · siège %s" % (b["car"], b.get("seat", "")), b.get("track") and "Voie " + b["track"], desc] if x))]
        if b.get("address"):
            lines.append("LOCATION:%s" % ics_escape(b["address"]))
        lines.append("END:VEVENT")
        out += lines
    out.append("END:VCALENDAR")
    return "\r\n".join(out) + "\r\n"


# ---------------------------------------------------------------- HTTP
# ---------------------------------------------------------------- partage public (sans budget, références ni notes privées)
def share_comment(n):
    return {k: n.get(k) for k in ("id", "author", "text", "dayId", "createdAt") if n.get(k)}


def share_plan(data):
    bks = {b.get("id"): b for b in data.get("bookings", [])}
    geo = lambda o: o.get("geo") if isinstance(o.get("geo"), dict) else None
    days = []
    for d in data.get("days", []):
        b = bks.get((d.get("lodging") or {}).get("bookingId"))
        acts = [{"title": a.get("title", ""), "geo": geo(a)} for a in d.get("activities", [])]
        acts += [{"title": x.get("name", ""), "time": x.get("checkinTime", ""), "geo": geo(x)} for x in bks.values()
                 if x.get("type") == "activity" and x.get("checkin") == d.get("date")]
        days.append({"id": d.get("id"), "date": d.get("date"), "city": d.get("city", ""), "title": d.get("title", ""),
                     "summary": d.get("summary", ""), "route": (d.get("transport") or {}).get("route", ""), "geo": geo(d),
                     "lodging": {"name": b.get("name", ""), "geo": geo(b)} if b and b.get("type") == "hotel" else None,
                     "activities": acts})
    t = data.get("trip", {})
    return {"trip": {k: t.get(k) for k in ("title", "travelers", "start", "end")}, "days": days,
            "comments": [share_comment(n) for n in data.get("notes", []) if n.get("via") == "partage"]}


class Handler(BaseHTTPRequestHandler):
    server_version = "Tripbook/1.0"

    def log_message(self, fmt, *args):
        if "/api/events" in (args[0] if args else ""):
            return
        sys.stdout.write("%s %s\n" % (self.address_string(), fmt % args)); sys.stdout.flush()

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_text(self, code, text, ctype, filename=None):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if filename:
            self.send_header("Content-Disposition", 'attachment; filename="%s"' % filename)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def read_json(self):
        raw = self.read_body()
        return json.loads(raw.decode("utf-8")) if raw else {}

    def who(self, query):
        """Retourne le nom associé au jeton, None si refusé, 'Invité' si aucun jeton configuré."""
        if not TOKENS:
            return "Invité"
        auth = self.headers.get("Authorization", "")
        tok = auth[7:].strip() if auth.startswith("Bearer ") else query.get("token", [""])[0]
        return TOKENS.get(tok)

    def send_file(self, path, download_name=None):
        if not os.path.isfile(path):
            return self.send_json(404, {"error": "not found"})
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if path.endswith(".webmanifest"):
            ctype = "application/manifest+json"
        if path.endswith(".js"):
            ctype = "text/javascript"
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or "json" in ctype else ""))
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-cache")
        if download_name:
            self.send_header("Content-Disposition", 'inline; filename="%s"' % download_name)
        self.end_headers()
        if self.command == "HEAD":
            return
        with open(path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def send_template(self, path):
        """index.html, manifest, page de partage : titre et voyageurs injectés depuis trip.json."""
        with store.lock:
            t = store.data.get("trip") or {}
            title = str(t.get("title") or DEFAULT_TITLE)
            travelers = " & ".join(str(x) for x in (t.get("travelers") or []) if x)
        full = title + (" · " + travelers if travelers else "")
        is_json = path.endswith(".webmanifest")
        esc = (lambda v: json.dumps(v, ensure_ascii=False)[1:-1]) if is_json else (lambda v: htmlmod.escape(v, quote=True))
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for k, v in (("TITLE_FULL", full), ("TITLE", title), ("TRAVELERS", travelers), ("PUBLIC_URL", PUBLIC_URL)):
            text = text.replace("{{%s}}" % k, esc(v))
        ctype = "application/manifest+json; charset=utf-8" if is_json else "text/html; charset=utf-8"
        return self.send_text(200, text, ctype)

    def route(self):
        u = urlsplit(self.path)
        path = posixpath.normpath(unquote(u.path))
        query = parse_qs(u.query)
        parts = [p for p in path.split("/") if p]
        try:
            if parts[:1] == ["api"]:
                return self.api(parts[1:], query)
            if parts[:1] == ["files"]:
                if not self.who(query):
                    return self.send_json(401, {"error": "unauthorized"})
                full = os.path.normpath(os.path.join(FILES_DIR, "/".join(parts[1:])))
                if not full.startswith(FILES_DIR + os.sep):
                    return self.send_json(403, {"error": "forbidden"})
                return self.send_file(full, os.path.basename(full))
            if self.command not in ("GET", "HEAD"):
                return self.send_json(405, {"error": "method not allowed"})
            rel = "/".join(parts) or "index.html"
            full = os.path.normpath(os.path.join(APP_DIR, rel))
            if not full.startswith(APP_DIR + os.sep):
                return self.send_json(403, {"error": "forbidden"})
            if os.path.isdir(full):
                full = os.path.join(full, "index.html")
            if not os.path.isfile(full):
                full = os.path.join(APP_DIR, "index.html")
            if full in TEMPLATED:
                return self.send_template(full)
            return self.send_file(full)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except json.JSONDecodeError as e:
            return self.send_json(400, {"error": "invalid JSON: %s" % e})
        except Exception as e:
            print("[error]", repr(e), flush=True)
            return self.send_json(500, {"error": str(e)})

    def api(self, parts, query):
        if parts == ["health"]:
            return self.send_json(200, {"ok": True, "version": store.data.get("version"), "updatedAt": store.data.get("updatedAt"), "push": PUSH_OK})
        if parts[:1] == ["share"]:
            return self.share(parts[1:], query)
        who = self.who(query)
        if not who:
            return self.send_json(401, {"error": "unauthorized"})
        m = self.command
        if parts == ["events"]:
            return self.sse()
        if parts == ["me"]:
            return self.send_json(200, {"name": who, "push": PUSH_OK, "vapid": push.public_key})
        if parts == ["unfurl"]:
            url = query.get("url", [""])[0]
            if not re.match(r"^https?://", url):
                return self.send_json(400, {"error": "url attendue"})
            return self.send_json(200, unfurl(url))
        if parts == ["calendar.ics"]:
            return self.send_text(200, build_ics(store.data), "text/calendar; charset=utf-8", slug(trip_title(store.data)) + ".ics")
        if parts == ["state"]:
            if m in ("GET", "HEAD"):
                with store.lock:
                    return self.send_json(200, store.data)
            if m == "PUT":
                body = self.read_json()
                with store.lock:
                    cur = int(store.data.get("version", 0))
                    if "version" in body and int(body["version"]) != cur:
                        return self.send_json(409, {"error": "version conflict", "version": cur, "state": store.data})
                    store.data = body
                    for c in COLLECTIONS:
                        store.data.setdefault(c, [])
                    store.save("api:" + who)
                    return self.send_json(200, {"ok": True, "version": store.data["version"]})
            return self.send_json(405, {"error": "method not allowed"})
        if parts == ["files"] and m == "GET":
            names = sorted(os.listdir(FILES_DIR)) if os.path.isdir(FILES_DIR) else []
            return self.send_json(200, [n for n in names if not n.startswith(".")])
        # --- upload : PUT /api/upload/<nom>  (corps = octets du fichier)
        if len(parts) == 2 and parts[0] == "upload" and m in ("PUT", "POST"):
            name = re.sub(r"[^\w.\-() ]+", "_", os.path.basename(parts[1]))[:120] or "fichier"
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_UPLOAD:
                return self.send_json(413, {"error": "taille invalide (max 15 Mo)"})
            os.makedirs(FILES_DIR, exist_ok=True)
            base, ext = os.path.splitext(name)
            final, k = name, 1
            while os.path.exists(os.path.join(FILES_DIR, final)):
                final = "%s-%d%s" % (base, k, ext); k += 1
            with open(os.path.join(FILES_DIR, final), "wb") as f:
                remaining = n
                while remaining > 0:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        break
                    f.write(chunk); remaining -= len(chunk)
            return self.send_json(201, {"file": final, "url": "files/" + final})
        # --- sauvegardes
        if parts[:1] == ["backups"]:
            names = sorted((n for n in os.listdir(BACKUP_DIR) if n.startswith("trip-")), reverse=True) if os.path.isdir(BACKUP_DIR) else []
            if len(parts) == 1 and m == "GET":
                return self.send_json(200, [{"name": n, "size": os.path.getsize(os.path.join(BACKUP_DIR, n))} for n in names])
            if len(parts) == 3 and parts[2] == "restore" and m == "POST":
                if parts[1] not in names:
                    return self.send_json(404, {"error": "not found"})
                with store.lock:
                    data = json.load(open(os.path.join(BACKUP_DIR, parts[1]), encoding="utf-8"))
                    store.data = data
                    for c in COLLECTIONS:
                        store.data.setdefault(c, [])
                    store.save("restore:" + who)
                    return self.send_json(200, {"ok": True, "version": store.data["version"]})
            return self.send_json(405, {"error": "method not allowed"})
        # --- push
        if parts[:1] == ["push"]:
            if parts[1:] == ["vapid"]:
                return self.send_json(200, {"enabled": PUSH_OK, "key": push.public_key, "count": len(push.subs)})
            if parts[1:] == ["subscribe"] and m == "POST":
                body = self.read_json()
                if not body.get("endpoint"):
                    return self.send_json(400, {"error": "subscription attendue"})
                push.subscribe(body, who)
                return self.send_json(201, {"ok": True, "count": len(push.subs)})
            if parts[1:] == ["subscribe"] and m == "DELETE":
                body = self.read_json()
                push.unsubscribe(body.get("endpoint", ""))
                return self.send_json(200, {"ok": True})
            if parts[1:] == ["send"] and m == "POST":
                body = self.read_json()
                if not PUSH_OK:
                    return self.send_json(501, {"error": "pywebpush non installé sur le serveur"})
                n = push.send(body.get("title") or trip_title(store.data), body.get("body") or "", body.get("url") or "/", body.get("tag") or "tripbook")
                return self.send_json(200, {"ok": True, "sent": n})
            return self.send_json(404, {"error": "unknown endpoint"})
        # --- objets simples
        if len(parts) >= 1 and parts[0] in OBJECTS:
            key = parts[0]
            if m == "GET":
                return self.send_json(200, store.data.get(key, {}))
            if m in ("PATCH", "PUT"):
                body = self.read_json()
                with store.lock:
                    if m == "PUT":
                        store.data[key] = body
                    else:
                        store.data.setdefault(key, {}).update(body)
                    store.save("api:" + who)
                    return self.send_json(200, store.data[key])
            return self.send_json(405, {"error": "method not allowed"})
        # --- collections
        if len(parts) >= 1 and parts[0] in COLLECTIONS:
            coll = parts[0]
            with store.lock:
                store.data.setdefault(coll, [])
                if len(parts) == 1:
                    if m == "GET":
                        return self.send_json(200, store.data[coll])
                    if m == "POST":
                        body = self.read_json()
                        if not isinstance(body, dict):
                            return self.send_json(400, {"error": "object expected"})
                        body.setdefault("id", uuid.uuid4().hex[:8])
                        body["id"] = str(body["id"])
                        if store.find(coll, body["id"])[1] is not None:
                            return self.send_json(409, {"error": "id already exists"})
                        if coll in ("notes", "expenses", "ideas"):
                            body.setdefault("createdAt", now_iso())
                            body.setdefault("author", who)
                        if coll == "ideas" and body.get("url") and not body.get("title"):
                            u = unfurl(body["url"])
                            body.update({k: v for k, v in u.items() if k in ("title", "thumb", "platform") and v and not body.get(k)})
                            if u.get("author") and not body.get("creator"):
                                body["creator"] = u["author"]
                        store.data[coll].append(body)
                        store.save("api:" + who)
                        if coll == "notes" and str(body.get("author", "")).lower() == AGENT.lower():
                            push.send_async("Note de %s" % AGENT, str(body.get("text", ""))[:180], "/#now", "note")
                        return self.send_json(201, body)
                    if m == "PUT":
                        body = self.read_json()
                        if not isinstance(body, list):
                            return self.send_json(400, {"error": "array expected"})
                        store.data[coll] = body
                        store.save("api:" + who)
                        return self.send_json(200, body)
                    return self.send_json(405, {"error": "method not allowed"})
                item_id = parts[1]
                idx, item = store.find(coll, item_id)
                if m == "GET":
                    return self.send_json(200, item) if item else self.send_json(404, {"error": "not found"})
                if m in ("PATCH", "PUT"):
                    body = self.read_json()
                    if m == "PUT":
                        body["id"] = item_id
                        if item is None:
                            store.data[coll].append(body)
                        else:
                            store.data[coll][idx] = body
                        item = body
                    else:
                        if item is None:
                            return self.send_json(404, {"error": "not found"})
                        body.pop("id", None)
                        item.update(body)
                    store.save("api:" + who)
                    return self.send_json(200, item)
                if m == "DELETE":
                    if item is None:
                        return self.send_json(404, {"error": "not found"})
                    del store.data[coll][idx]
                    store.save("api:" + who)
                    return self.send_json(200, {"ok": True})
                return self.send_json(405, {"error": "method not allowed"})
        return self.send_json(404, {"error": "unknown endpoint"})

    def share(self, parts, query):
        """Lien de partage : planning sans budget + commentaires, rangés dans notes (via: "partage")."""
        if not SHARE_KEY or not hmac.compare_digest(query.get("k", [""])[0].encode(), SHARE_KEY.encode()):
            return self.send_json(404, {"error": "lien invalide"})
        if parts == [] and self.command == "GET":
            with store.lock:
                return self.send_json(200, share_plan(store.data))
        if parts == ["comments"] and self.command == "POST":
            body = self.read_json()
            name, text = str(body.get("name") or "").strip()[:40], str(body.get("text") or "").strip()
            if not name or not text or len(text) > 2000:
                return self.send_json(400, {"error": "prénom et commentaire (2000 caractères max) requis"})
            with store.lock:
                day = next((d for d in store.data["days"] if d.get("id") == body.get("dayId")), None)
                n = {"id": uuid.uuid4().hex[:8], "author": name, "text": text, "via": "partage", "createdAt": now_iso()}
                if day:
                    n["dayId"] = day["id"]
                store.data["notes"].append(n)
                store.save("partage:" + name)
            push.send_async("%s a commenté%s" % (name, " · " + day.get("title", "") if day else ""), text[:160], url="/#notebook/notes", tag="partage")
            return self.send_json(201, share_comment(n))
        return self.send_json(404, {"error": "unknown endpoint"})

    def sse(self):
        q = queue.Queue(maxsize=100)
        store.clients.append(q)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Accel-Buffering", "no")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(("event: hello\ndata: %s\n\n" % json.dumps({"version": store.data.get("version")})).encode())
            self.wfile.flush()
            while True:
                try:
                    evt = q.get(timeout=20)
                    self.wfile.write(("event: change\ndata: %s\n\n" % json.dumps(evt)).encode())
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            if q in store.clients:
                store.clients.remove(q)

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = route


def main():
    global store, push
    if not os.path.isfile(DATA_FILE):
        sys.exit("Fichier introuvable : %s\nPour configurer un voyage : skill trip-setup (voir CLAUDE.md). Pour essayer : cp data/trip.example.json data/trip.json" % DATA_FILE)
    os.makedirs(FILES_DIR, exist_ok=True)
    if not TOKENS:
        print("!! aucun jeton (TRIP_TOKENS / TRIP_TOKEN) : API ouverte à tous (mode dev)", flush=True)
    push = Push()
    store = Store()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    httpd.daemon_threads = True
    print("%s — http://%s:%d  (data: %s, push: %s, agent: %s, jetons: %s)" % (trip_title(store.data), HOST, PORT, DATA_FILE, "oui" if PUSH_OK else "non", AGENT, ", ".join(sorted(set(TOKENS.values())))), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
