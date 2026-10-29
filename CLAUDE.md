# Tripbook — carnet de voyage (PWA + API + assistant)

App mobile installable pour suivre un voyage jour par jour : programme, réservations, tâches, budget et dépenses, carte, plan anti-jet lag, journal, lien de partage pour les proches. Toutes les données vivent dans `data/trip.json`, servi par `server.py` (Python 3 stdlib, zéro dépendance). Tu es l'assistant du voyage : tu configures l'app, tu la déploies, puis tu la fais vivre via l'API.

## Par où commencer

| Situation | Fais |
|---|---|
| `data/trip.json` n'existe pas, ou l'utilisateur veut utiliser l'app pour son voyage | Skill **`trip-setup`** (`.claude/skills/trip-setup/SKILL.md`) : entretien, génération des données, essai local, déploiement. |
| L'utilisateur parle de son voyage (hôtel, vol, tâche, dépense, note, idée) | Skill **`trip`** (`.claude/skills/trip/SKILL.md`) : `python3 .claude/skills/trip/scripts/trip.py …` contre l'API (config dans `.env`). |
| Déployer ou mettre à jour le serveur | `docs/DEPLOIEMENT.md` puis `deploy/deploy.sh utilisateur@hôte`. |
| Changer couleurs, police, icônes | `docs/PERSONNALISATION.md`. |

## Carte du dépôt

```
server.py                 serveur HTTP : PWA + API REST + SSE temps réel + fichiers + push (pywebpush optionnel)
app/                      la PWA : index.html, app.js (un seul fichier, vanilla JS), app.css, sw.js, manifest, icons/, fonts/, vendor/leaflet
app/partage/              page publique du lien de partage (planning + carte, sans prix ni références)
data/trip.json            LA source de vérité (gitignoré : données personnelles) — data/trip.example.json en modèle
data/files/               confirmations (PDF, photos), servies sur /files/<nom> avec jeton
.claude/skills/trip/      skill d'opération + scripts/trip.py (CLI API) + reference/schema.md (schéma complet)
.claude/skills/trip-setup/ skill de configuration d'un nouveau voyage
deploy/                   deploy.sh, unité systemd, Caddyfile, nginx, launchd (Mac), env.example
docs/                     DEPLOIEMENT.md (hébergement gratuit), PERSONNALISATION.md
tools/make_icons.py       génère les icônes (Pillow)
```

## Lancer en local

```bash
cp data/trip.example.json data/trip.json            # ou générer le vrai voyage (skill trip-setup)
TRIP_TOKENS="alice:test123,claude:test456" python3 server.py
# puis http://127.0.0.1:8787/?token=test123   (le jeton est mémorisé par l'app, puis retiré de l'URL)
curl -s http://127.0.0.1:8787/api/health
```

Variables : `TRIP_TOKENS` (nom:jeton,… — le nom signe notes et dépenses), `TRIP_AGENT` (ton nom, défaut Claude : tes notes déclenchent une notification push), `TRIP_PORT` (8787), `TRIP_URL` (URL publique), `TRIP_SHARE_KEY` (clé du lien de partage), `TRIP_DATA` (dossier data). Le titre de l'app, les voyageurs, les devises et les fuseaux viennent de `trip.json`, pas du code.

## Règles

- **Ne jamais inventer** une réservation, un prix, une référence : sans confirmation, créer une tâche à vérifier ou une note.
- Données : toujours via l'API (`trip.py`) quand un serveur tourne ; éditer `data/trip.json` à la main seulement s'il n'y a pas de serveur (il recharge le fichier en 1 s et ignore un JSON invalide).
- Code : stdlib Python, vanilla JS, pas de framework, pas de build. Interface en français. Modifications chirurgicales ; `app.js` est volontairement un seul fichier.
- Après une modification de `app/` : incrémenter `?v=N` dans `app/index.html` et `app/sw.js` (`VERSION` + liste `SHELL`), sinon les téléphones gardent l'ancienne version en cache.
- Sécurité : les jetons protègent l'API et les fichiers ; le serveur n'écoute que sur 127.0.0.1, c'est le reverse proxy (Caddy) qui expose en HTTPS. Ne jamais commiter `.env` ni `data/trip.json`.

## Vérifier

- `python3 -m py_compile server.py` ; `curl /api/health` ; ouvrir `/`, `/manifest.webmanifest` et `/partage/?k=…` (titre injecté, aucun `{{` résiduel).
- `python3 .claude/skills/trip/scripts/trip.py summary` avec un `.env` pointant sur le serveur.
- Dans un navigateur : Aujourd'hui, Itinéraire, Résas, Carte, Carnet › Budget (devises converties), Décalage horaire (vols avec `legs`), Réglages, page de partage. Console sans erreur.
