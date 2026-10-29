---
name: trip
description: Lire et modifier en temps réel le carnet de voyage Tripbook (planning jour par jour, réservations, tâches, budget, dépenses, idées, notes) via son API. À utiliser dès que l'utilisateur parle de son voyage, d'un hôtel, d'un vol, d'un train, d'une réservation, d'une tâche de préparation, d'une dépense ou d'une note de voyage. Pour créer un nouveau voyage de zéro, voir le skill trip-setup.
---

# Tripbook — opérer le carnet de voyage

Toutes les données du voyage vivent dans **un seul fichier JSON** (`data/trip.json`) servi par une API REST.
Chaque modification est poussée en temps réel aux téléphones (SSE). Tu es l'assistant du voyage : ton nom est `TRIP_AGENT` (défaut « Claude ») et tes notes signées de ce nom déclenchent une notification push.

- Helper : `python3 .claude/skills/trip/scripts/trip.py` (Python 3, stdlib) — **à privilégier** plutôt que curl.
- Configuration lue par le helper : `.env` à la racine du dépôt (`TRIP_URL`, `TRIP_TOKEN`, `TRIP_AGENT`), ou les mêmes variables d'environnement. Sans `.env`, il vise `http://127.0.0.1:8787` (serveur local).
- Si `.env` manque et qu'aucun serveur ne répond : proposer de lancer le serveur en local (`TRIP_TOKENS="moi:test,claude:test2" python3 server.py`) ou de déployer (`docs/DEPLOIEMENT.md`).

## Commandes rapides

```bash
T=.claude/skills/trip/scripts/trip.py
python3 $T summary                       # vue d'ensemble : jours, résas, échéances, tâches ouvertes, dernières notes
python3 $T get days                      # toute une collection
python3 $T get days/2027-05-04           # un élément
python3 $T get trip                      # objet trip (dates, alerte, voyageurs, devises, fuseaux)
python3 $T patch tasks/esta '{"col":"done"}'
python3 $T patch days/2027-05-04 '{"notes":"Billets du pont pris, rdv 8h"}'
python3 $T add notes '{"author":"Claude","text":"MoMA réservé le 5/5 à 10:30, réf. ABC123"}'
python3 $T add tasks '{"id":"esim","title":"Acheter une eSIM data","priority":"normal","col":"todo","deadline":"Semaine du départ"}'
python3 $T add bookings '{"id":"train-0503","type":"train","status":"confirmed","name":"TGV Lyon → CDG","from":"Lyon Part-Dieu","to":"Paris CDG","checkin":"2027-05-03","checkinTime":"07:04","checkoutTime":"09:10","car":"12","seat":"45-46","price":138,"ref":"XYZ","dayId":"2027-05-03"}'
python3 $T add bookings '{"id":"hotel-x","type":"hotel","status":"confirmed","name":"Hôtel X","city":"Brooklyn","checkin":"2027-05-03","checkout":"2027-05-07","checkinTime":"15:00","checkoutTime":"11:00","price":1120,"ref":"123","platform":"Booking.com","address":"…","phone":"…","cancelBy":"2027-04-26","geo":{"lat":40.695,"lng":-73.993}}'
python3 $T add expenses '{"date":"2027-05-04","amount":42,"currency":"USD","category":"Food","label":"Bagels"}'
python3 $T add ideas '{"url":"https://www.tiktok.com/@x/video/123","city":"Brooklyn","note":"Pizzeria vue dans un Reel"}'
python3 $T add guides '{"id":"g-brooklyn","city":"Brooklyn","title":"Brooklyn · repères","text":"Depuis JFK : AirTrain puis métro A…"}'
python3 $T delete tasks/esim
python3 $T put budget '{"rate":1.08,"note":"…","items":[{"label":"Vols","amount":980},{"label":"Logements","amount":1120}],"categories":["Logements","Food","Transports","Activités","Shopping","Autre"]}'
python3 $T upload ~/Downloads/billet.pdf   # → {"file": "billet.pdf"} à mettre dans booking.file
python3 $T notify "Train dans 40 min" "TGV 6612 · voie 7 · voiture 12"   # push sur les téléphones
python3 $T state > sauvegarde.json       # export complet
python3 $T backups | restore <nom>
```

## Modèle de données (résumé)

- `trip` : `{title, destination, travelers[], start, end, home, homeTz, tz, currency, localCurrency, rhythm, alert, alertTaskId}`. `alert` s'affiche en rouge sur l'écran Aujourd'hui avant le départ (`""` pour l'effacer) ; `alertTaskId` lie l'alerte à une tâche.
- `days[]` : id = date ISO. `date, city, title, summary, cost (devise maison, tous voyageurs), tags[] ("move", "book", "slow"), lodging{bookingId, note}, transport{route, detail, booking: none|recommended|required|done, cost}, activities[{id, title, booking: yes|maybe|no, done, geo}], weather, photos[], notes, geo{lat,lng}`.
  - Pour modifier une activité : renvoyer le tableau `activities` complet dans le PATCH.
  - **Renseigne `geo`** (WGS84 décimal) sur les activités et logements dont le lieu est connu : ils apparaissent sur la carte.
- `bookings[]` : `id, type: hotel|flight|train|activity, status: confirmed|todo, name, city, checkin, checkout, checkinTime, checkoutTime, price, currency, ref, pin, platform, room, meals, address, phone, file, notes, cancelBy, tz, geo`.
  - Trains : en plus `from, to, car, seat, track, dayId` ; affichés dans le bloc transport du jour.
  - Vols : `legs[]` = tronçons avec escales (`{flight, from, to, dep, depTime, depTz, arr, arrTime, arrTz}`, heures locales), utilisés par l'écran Décalage horaire. Mettre à jour `legs` **et** `checkin/checkinTime/checkout/checkoutTime` ensemble.
  - `cancelBy` déclenche automatiquement une tâche critique à J-3 et une notification.
- `expenses[]` : `date, amount, currency (localCurrency ou currency), category (budget.categories), label, file`. Les montants en devise locale sont convertis avec `budget.rate`.
- `budget` : `{rate, note, items[{label, amount}], categories[]}`. Garder les postes « Vols », « Logements », « Transports », « Activités » : les réservations confirmées y sont comptées.
- `guides[]` : `{id, city, title, text}` — fiche pratique en tête de l'étape dont la ville correspond. Tu es le rédacteur naturel de ces fiches.
- `ideas[]` : liens Reels/TikTok/YouTube/Maps collectés. **Quand on t'envoie un lien, ajoute-le ici** ; le serveur récupère titre et vignette si `title` est vide. Pour planifier une idée : ajouter une activité au jour (`ideaId`, `url`) et passer l'idée en `status: "planned"` + `dayId`.
- `tasks[]` : `{id, col: todo|check|done, priority: critical|booking|normal, title, desc, deadline}`.
- `notes[]` : `{id, author, text, createdAt}` — journal partagé sur l'écran d'accueil. **Signe tes notes avec ton nom (`TRIP_AGENT`)** : c'est le canal pour laisser un message aux voyageurs, et il déclenche une notification.
- `sleep[]` : nuits mesurées (optionnel, écran Décalage horaire).

Détails : `reference/schema.md`. Exemple complet : `python3 $T state`.

## Règles

1. **Ne jamais inventer** une réservation, un prix ou une référence : si l'information n'est pas confirmée, créer une tâche (`col: "check"`) ou une note plutôt qu'un booking `confirmed`.
2. Modifier avec `patch` (fusion de champs) plutôt que `put` (remplacement) — sauf pour `budget` et les listes qu'on réécrit volontairement.
3. Après une réservation (train, resto, activité) : ajouter un `booking` confirmé, passer la tâche liée en `done`, laisser une `note` signée qui résume (date, heure, réf.).
4. Toute nouvelle échéance ou risque découvert → nouvelle `task` avec `priority` adaptée.
5. Les confirmations (PDF, PNG, photos) se déposent avec `trip.py upload` puis se référencent par leur nom dans `booking.file` ou `day.photos`. Quand l'utilisateur donne un PDF de réservation : le lire, en extraire les champs, créer le booking, uploader le fichier.
6. **Notifications** (`trip.py notify`) : pour ce qui est utile *maintenant* (train qui part, check-in ouvert, échéance ce soir), pas pour chaque modification. Une note signée de ton nom notifie déjà.
7. Chaque écriture crée une sauvegarde (`trip.py backups`) ; en cas d'erreur, `trip.py restore <nom>`.
8. Le fichier `data/trip.json` peut aussi être édité directement sur le disque du serveur (rechargé en 1 s), mais l'API est plus sûre.
9. Liens utilisables dans les notifications et les notes : `/#today`, `/#tasks`, `/#itinerary`, `/#day/<id>`, `/#bookings`, `/#bk/<id>`, `/#map`, `/#jetlag`, `/#notebook/ideas|budget|notes`.
