# Schéma complet de data/trip.json

```jsonc
{
  "version": 12,                      // incrémenté par le serveur à chaque écriture
  "updatedAt": "2027-03-01T13:00:00+00:00",
  "trip": {
    "title": "New York 2027",         // nom de l'app (icône, onglet, notifications, page de partage)
    "destination": "New York",        // pays ou ville, affiché dans les en-têtes
    "travelers": ["Alice", "Bob"],    // prénoms ; deploy.sh crée un jeton par prénom
    "start": "2027-05-03", "end": "2027-05-07",
    "home": "Lyon", "homeTz": "Europe/Paris",   // maison : toutes les heures du plan anti-jet lag sont à cette heure
    "tz": "America/New_York",         // fuseau de la destination (IANA)
    "currency": "EUR",                // devise maison : budget, prix des réservations (code ISO 4217)
    "localCurrency": "USD",           // devise sur place ("" si c'est la même) ; les dépenses saisies en locale sont converties avec budget.rate
    "rhythm": "Texte libre : l'esprit du voyage",
    "alert": "Texte affiché en rouge sur l'accueil avant le départ ('' pour masquer)",
    "alertTaskId": "esta"             // optionnel : l'alerte disparaît quand cette tâche passe en done
  },
  "days": [{
    "id": "2027-05-04", "date": "2027-05-04", "city": "Brooklyn",
    "title": "Brooklyn Heights et le pont", "summary": "Deux lignes sur la journée.",
    "cost": 90,                         // estimation en devise maison, pour tous les voyageurs
    "tags": ["move", "book"],           // move = transfert, book = résa requise, slow = journée lente
    "lodging": {"bookingId": "hotel-brooklyn", "note": "Check-in 15:00"},
    "transport": {"route": "Métro A", "detail": "...", "booking": "none|recommended|required|done", "cost": "≈ 6 $ pour 2"},
    "geo": {"lat": 40.6962, "lng": -73.9969},   // optionnel : centre du lieu sur la carte (onglet Carte)
    "activities": [{"id": "a1", "title": "Pont de Brooklyn", "booking": "yes|maybe|no", "done": false, "geo": {"lat": 40.7061, "lng": -73.9969}}],
    "weather": "☀️ 18° · pluie le soir",  // texte libre, optionnel
    "photos": ["jour-2027-05-04-1.jpg"],  // noms de fichiers dans data/files/, optionnel
    "notes": "Texte libre du jour"
  }],
  "bookings": [{
    "id": "hotel-brooklyn", "type": "hotel",          // hotel | flight | train | activity
    "status": "confirmed",                            // confirmed | todo (à réserver)
    "name": "Hôtel exemple · Brooklyn Heights", "city": "Brooklyn",
    "checkin": "2027-05-03", "checkout": "2027-05-07", "checkinTime": "15:00", "checkoutTime": "11:00",
    "price": 1120, "currency": "EUR",                 // en devise maison de préférence
    "ref": "1234.567.890", "pin": "0000", "platform": "Booking.com",
    "room": "Chambre double", "meals": "Petit-déjeuner inclus",
    "address": "10 Example Street, Brooklyn", "phone": "+1 212 555 0100",
    "file": "hotel-brooklyn.pdf",                     // confirmation dans data/files/ (trip.py upload)
    "cancelBy": "2027-04-26",                         // date limite d'annulation gratuite → tâche critique automatique à J-3 + notification
    "geo": {"lat": 40.695, "lng": -73.993},           // épingle logement sur la carte
    "tz": "America/New_York",                         // fuseau des heures (défaut trip.tz)
    "notes": "..."
  }],
  "tasks": [{"id": "esta", "col": "todo", "priority": "critical", "title": "...", "desc": "...", "deadline": "Avant le 20 avril"}],
                                       // col : todo | check (à vérifier) | done ; priority : critical | booking | normal
  "budget": {
    "note": "Pour 2, hors shopping.",
    "rate": 1.08,                       // unités de localCurrency pour 1 unité de currency (1 € = 1,08 $)
    "items": [{"label": "Vols", "amount": 980}, {"label": "Logements", "amount": 1120}],   // prévu = somme des items
    "categories": ["Logements", "Food", "Transports", "Activités", "Shopping", "Autre"]      // catégories des dépenses
  },
  "expenses": [{"id": "e1", "date": "2027-05-04", "amount": 42, "currency": "USD", "category": "Food", "label": "Bagels", "author": "Alice", "file": "recu-1.jpg", "createdAt": "..."}],
  "guides": [{"id": "g-manhattan", "city": "Manhattan", "title": "Manhattan · repères", "text": "Fiche pratique affichée en tête de l'étape dont la ville correspond"}],
  "ideas": [{"id": "i1", "url": "https://www.tiktok.com/...", "title": "", "thumb": "", "platform": "tiktok|instagram|youtube|maps|web", "city": "Brooklyn", "note": "", "author": "Bob", "status": "idea|planned|done", "dayId": "", "createdAt": "..."}],
  "notes": [{"id": "n1", "author": "Claude", "text": "...", "createdAt": "..."}],
                                       // notes du lien de partage : "via": "partage" (+ "dayId" optionnel), author = prénom du visiteur
  "sleep": []                          // nuits mesurées (optionnel, voir ci-dessous)
}
```

## Postes budgétaires et réservations

Les réservations confirmées avec un prix comptent comme dépensées dans leur poste : vol → « Vols », logement → « Logements », train → « Transports », activité → « Activités ». Garder ces libellés dans `budget.items` pour que le rapprochement fonctionne ; un poste absent apparaît comme ligne supplémentaire.

## bookings[].legs — tronçons d'un vol (escales)

```jsonc
"legs": [
  {"flight": "TK1316", "from": "Bilbao", "to": "Istanbul", "dep": "2026-11-03", "depTime": "11:55", "depTz": "Europe/Madrid", "arr": "2026-11-03", "arrTime": "18:05", "arrTz": "Europe/Istanbul"},
  {"flight": "TK198", "from": "Istanbul", "to": "Tokyo", "dep": "2026-11-04", "depTime": "02:30", "depTz": "Europe/Istanbul", "arr": "2026-11-04", "arrTime": "19:45", "arrTz": "Asia/Tokyo"}
]
```
Heures locales de chaque aéroport. L'écran Décalage horaire s'en sert pour savoir si l'on est au sol, dans l'avion ou à l'escale. Sans `legs`, le vol est un seul tronçon `checkin/checkinTime` (fuseau maison) → `checkout/checkoutTime` (fuseau destination). Le premier vol est l'aller, le dernier le retour. Si un vol change, mettre à jour `legs` **et** `checkin/checkinTime/checkout/checkoutTime`.

## sleep[] — nuits mesurées (optionnel)

```jsonc
{ "id": "2027-05-05", "date": "2027-05-05",            // date du réveil
  "start": "2027-05-05T03:50:00Z", "end": "2027-05-05T10:20:00Z",   // ISO UTC
  "minutes": 390, "score": 72, "source": "montre" }
```
Écriture idempotente : `PUT /api/sleep/<date>`. L'écran Décalage horaire prend alors l'horaire habituel mesuré (médiane des 21 nuits avant le plan, ≥ 5 nuits) et affiche les nuits réelles. Jamais exposé par le lien de partage. Un script qui lit une montre connectée (Garmin, Oura, export Apple Santé…) peut alimenter cette collection.

## API REST (toutes les routes sous /api, auth `Authorization: Bearer <jeton>` ou `?token=`)

| Méthode | Route | Effet |
|---|---|---|
| GET | /health | sans auth : `{ok, version, updatedAt, push}` |
| GET | /me | nom lié au jeton, clé push |
| GET | /state | tout le JSON |
| PUT | /state | remplace tout (envoyer `version` courant : 409 si périmé) |
| GET | /events | flux SSE (`event: change` à chaque écriture) |
| GET/PATCH/PUT | /trip, /budget | objet simple (PATCH = fusion) |
| GET/POST/PUT | /days, /bookings, /tasks, /notes, /expenses, /guides, /ideas, /sleep | collection (POST ajoute, id généré si absent ; PUT remplace le tableau) |
| GET/PATCH/PUT/DELETE | /days/{id} … | un élément (PATCH = fusion superficielle ; PUT crée si absent) |
| GET | /files · /files/<nom> | liste / téléchargement des confirmations |
| PUT | /upload/<nom> | dépôt d'un fichier (corps = octets, 15 Mo max) → `{file, url}` |
| GET | /calendar.ics | export calendrier des réservations confirmées |
| GET/POST | /backups · /backups/<nom>/restore | sauvegardes automatiques (50 dernières) |
| GET, POST/DELETE, POST | /push/vapid, /push/subscribe, /push/send | notifications push (pywebpush requis côté serveur) |
| GET, POST | /share?k=… · /share/comments?k=… | lien de partage public (planning sans prix ni références, commentaires) |

Les fichiers de confirmation sont servis sur `/files/<nom>?token=…`.
