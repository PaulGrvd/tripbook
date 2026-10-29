---
name: trip-setup
description: Configurer Tripbook pour un nouveau voyage — entretien avec l'utilisateur, génération de data/trip.json, lancement local, personnalisation, puis déploiement gratuit. À utiliser quand quelqu'un vient d'obtenir ce dépôt et veut l'utiliser pour son propre voyage, ou quand data/trip.json n'existe pas encore.
---

# Tripbook — configurer un nouveau voyage

Objectif : en une conversation, l'utilisateur repart avec son app de voyage installée sur son téléphone, et toi branché dessus pour la faire vivre (skill `trip`).

## 1. Entretien (une seule salve de questions)

Pose ces questions en une fois, avec des exemples ; tout a une valeur par défaut raisonnable :

1. **Destination** (pays ou ville) et **titre de l'app** (défaut : « <Destination> <année> »).
2. **Dates** : départ et retour (le jour du vol aller et le jour du vol retour).
3. **Voyageurs** : prénoms (ils signent notes et dépenses ; un jeton d'accès par prénom).
4. **Maison** : ville et fuseau (défaut : celui de l'ordinateur, `python3 -c "import time;print(time.tzname)"` ou demander). **Fuseau de la destination** (IANA, ex. `Asia/Tokyo`).
5. **Devise maison** (ex. EUR) et **devise sur place** (ex. JPY ; « la même » si identique) avec un taux approximatif (unités locales pour 1 unité maison).
6. **L'esprit du voyage** en une phrase (optionnel), et une **couleur d'accent** (optionnel, défaut vermillon).
7. **Documents déjà en main** : billets d'avion, réservations d'hôtel (PDF ou captures) à déposer dans la conversation ou dans un dossier.

Valide les codes : devises en ISO 4217 à trois lettres (EUR, USD, JPY, GBP, CHF, THB…), fuseaux IANA (`python3 -c "import zoneinfo; zoneinfo.ZoneInfo('Asia/Tokyo')"`). Un code de devise invalide s'affiche brut dans l'app, un fuseau invalide casse le plan anti-jet lag.

## 2. Générer `data/trip.json`

Pars de `data/trip.example.json` (schéma complet dans `.claude/skills/trip/reference/schema.md`) et écris `data/trip.json` :

- `trip` : tous les champs de l'entretien (`title, destination, travelers, start, end, home, homeTz, tz, currency, localCurrency, rhythm`), `alert: ""`, `version: 1`.
- `days` : **un jour par date** de `start` à `end` inclus, `id` = date ISO, `city` = « À définir » (ou la destination si une seule ville), `title` = « Jour N », premier et dernier jour taggés `["move"]`, `activities: []`, `lodging: {"bookingId": "", "note": ""}`, `transport: {"route": "", "detail": "", "booking": "none", "cost": ""}`.
- `bookings` : vols et hôtels extraits des documents fournis (sinon `[]`). Pour chaque vol, remplir `legs[]` avec les heures locales de chaque aéroport : c'est ce qui alimente le plan anti-jet lag. Ne rien inventer : un champ inconnu reste vide.
- `tasks` : 5 tâches génériques utiles (adapter à la destination) : documents d'identité / visa ou ESTA, assurance santé, moyen de paiement et change, eSIM ou forfait, copies des réservations dans l'app. `priority` adaptée, `col: "todo"`.
- `budget` : `rate` (taux donné), `items` avec les postes « Vols », « Logements », « Food », « Transports », « Activités » (montants connus ou 0), `categories` par défaut `["Logements","Food","Transports","Activités","Shopping","Autre"]`, `note: "Pour N, hors shopping."`.
- `notes`, `expenses`, `guides`, `ideas`, `sleep` : `[]`.

Vérifie avec `python3 -c "import json; json.load(open('data/trip.json'))"`.

## 3. Lancer en local et faire essayer

```bash
TRIP_TOKENS="<prénom1>:<jeton1>,<prénom2>:<jeton2>,claude:<jeton-claude>" python3 server.py
```
Jetons : `openssl rand -hex 12` chacun (ou `python3 -c "import secrets;print(secrets.token_hex(12))"`). Donne l'URL `http://127.0.0.1:8787/?token=<jeton1>` et fais un tour : Aujourd'hui, Itinéraire, Résas, Carte, Carnet. Écris un `.env` local pour le skill `trip` :

```
TRIP_URL=http://127.0.0.1:8787
TRIP_TOKEN=<jeton-claude>
TRIP_AGENT=Claude
```

Propose ensuite d'enrichir : déposer les PDF (`trip.py upload` puis `booking.file`), remplir les journées, positionner les lieux (`geo`), rédiger une fiche repères par ville (`guides`).

## 4. Personnaliser (optionnel)

`docs/PERSONNALISATION.md` : couleur d'accent (3 variables CSS dans `app/app.css` et `app/partage/index.html`), icônes (`python3 tools/make_icons.py --accent "#2f5d8a"`), police d'affichage. Le titre de l'app et les voyageurs viennent de `trip.json`, rien à changer dans le code.

## 5. Déployer

Lis `docs/DEPLOIEMENT.md` et présente les options en deux phrases chacune (gratuit : Oracle Cloud, Google Cloud, machine à la maison + Tailscale ; payant : VPS 3–5 €/mois). L'utilisateur crée le compte et la machine (tu ne peux pas le faire à sa place), te donne `utilisateur@IP`, puis :

```bash
deploy/deploy.sh ubuntu@IP            # ou --domain mon-voyage.fr, --no-push, --dry-run
```

Le script installe tout, génère les jetons, écrit le `.env` local (`TRIP_URL`, `TRIP_TOKEN`) et affiche les liens. Vérifie `curl https://<hôte>/api/health`, puis donne à chaque voyageur son lien `https://<hôte>/?token=<jeton>` et la marche à suivre : iPhone → Safari → Partager → « Sur l'écran d'accueil » ; Android → Chrome → menu → « Installer l'application ». Donne aussi le lien de partage (`/partage/?k=<TRIP_SHARE_KEY>&nom=<prénom>`) pour la famille et les amis.

Si un agent tourne aussi sur le serveur (Hermes, OpenClaw, autre) : copier `.claude/skills/trip/` dans son dossier de skills ; `trip.py` y lit `/opt/tripbook/.env` tout seul.

## 6. Terminer

Résume : URL de l'app, liens par voyageur, lien de partage, ce qui reste à remplir, et rappelle que désormais une phrase suffit (« ajoute l'hôtel de Kyoto », « on a dépensé 40 € de taxi ») : skill `trip`.
