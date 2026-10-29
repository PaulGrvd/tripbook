# Tripbook — votre carnet de voyage, piloté par Claude

Une app mobile (PWA installable, hors ligne) pour vivre un voyage jour par jour : programme, réservations et confirmations, tâches de préparation, budget et dépenses en deux devises, carte des lieux, plan anti-jet lag, journal partagé, lien de partage pour les proches. Un serveur Python sans dépendance, un fichier JSON, et un assistant (Claude) qui remplit et met à jour le carnet à la voix de l'utilisateur.

*Tripbook is a self-hosted travel companion PWA (French UI) that Claude configures, deploys and keeps up to date for you. Hand this repository to Claude Code and follow its questions.*

## Utiliser pour son propre voyage

1. Installer [Claude Code](https://claude.com/claude-code) et cloner ce dépôt :
   ```bash
   git clone https://github.com/PaulGrvd/tripbook.git && cd tripbook && claude
   ```
2. Dire à Claude : **« Configure cette app pour mon voyage. »** Il pose quelques questions (destination, dates, voyageurs, devises), génère les données, lance l'app en local pour l'essayer, puis propose un hébergement gratuit et le fait.
3. Ensuite, une phrase suffit : « ajoute l'hôtel de Kyoto, voici le PDF », « on a dépensé 40 € de taxi », « rappelle-nous le train de 8h12 ». Les téléphones se mettent à jour en temps réel.

Pas de Claude Code ? Tout se fait aussi à la main : `CLAUDE.md` décrit le projet, `docs/DEPLOIEMENT.md` le déploiement, `.claude/skills/trip/reference/schema.md` le format des données.

## Ce que fait l'app

- **Aujourd'hui** : avant le départ, compte à rebours, alerte, tâches à cocher, échéances d'annulation gratuite ; pendant le voyage, programme horodaté du jour (vols, trains, check-in/out, activités), logement du soir (plan, appel, référence, confirmation), dépenses du jour.
- **Itinéraire** : étapes et journées ; page détail par jour, formulaires de modification.
- **Résas** : hôtels, vols, trains, activités ; référence copiable, confirmation PDF, plan, appel, date limite d'annulation (tâche critique automatique à J-3 + notification).
- **Carte** : tous les lieux du voyage (Leaflet auto-hébergé, fond Esri), une couleur par jour, « Y aller » vers Google Maps, « Ma position ».
- **Carnet** : Idées (Reels, TikTok, liens, avec vignette automatique), Budget (prévu / réel par poste, réservations comptées, dépenses en devise locale converties), Notes (journal partagé, messages de l'assistant).
- **Décalage horaire** : plan anti-jet lag jour par jour calculé à partir des vols (escales comprises), d'après Eastman & Burgess (2009) : lumière, sommeil, sieste, mélatonine, café. Toutes les heures à l'heure de la maison, avec l'heure locale en regard.
- **Lien de partage** : page publique planning + carte, sans prix ni références ; les proches commentent, les commentaires arrivent dans les Notes avec une notification.
- **Hors ligne** : lecture depuis le cache, confirmations gardées sur le téléphone, modifications mises en attente et envoyées au retour du réseau. **Notifications push** (optionnel), **export calendrier** (.ics), **sauvegardes** automatiques.

## Architecture

```
server.py                 serveur HTTP : PWA + API REST + SSE + fichiers + push     (Python 3, stdlib)
app/                      la PWA : vanilla JS, un fichier, pas de build
data/trip.json            la source de vérité (gitignoré) — data/trip.example.json en modèle
.claude/skills/trip/      skill de l'assistant : trip.py (CLI API) + schéma complet
.claude/skills/trip-setup/ skill de configuration d'un nouveau voyage
deploy/                   deploy.sh (VPS Debian/Ubuntu), systemd, Caddy, nginx, launchd
docs/                     DEPLOIEMENT.md (hébergement gratuit), PERSONNALISATION.md
```

Lancer en local :

```bash
cp data/trip.example.json data/trip.json
TRIP_TOKENS="alice:test123,claude:test456" python3 server.py
# http://127.0.0.1:8787/?token=test123
```

## Hébergement

Il faut une petite machine avec un disque persistant et HTTPS. `docs/DEPLOIEMENT.md` détaille les options gratuites (Oracle Cloud Always Free, Google Cloud e2-micro, machine à la maison + Tailscale Funnel) et un script d'installation en une commande : `deploy/deploy.sh ubuntu@IP`.

## Licence

MIT. Né de l'app faite pour un voyage au Japon ; la version générique garde la même simplicité : un fichier JSON, un serveur sans dépendance, une app sans framework.
