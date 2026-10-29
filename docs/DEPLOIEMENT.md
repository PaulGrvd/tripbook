# Déployer Tripbook (gratuitement si possible)

Ce que l'app demande à l'hébergeur, et pourquoi la plupart des offres « gratuites » ne conviennent pas :

| Besoin | Pourquoi | Conséquence |
|---|---|---|
| Un disque qui survit aux redémarrages | `data/trip.json` et les PDF de confirmation vivent sur le disque | Render (gratuit), Fly.io, Koyeb, Railway : disque effacé au redémarrage ou à la mise en veille ; essais limités |
| HTTPS | Une PWA ne s'installe sur le téléphone qu'en HTTPS | Il faut un reverse proxy avec certificat (Caddy s'en charge tout seul) |
| Connexions longues | Temps réel par SSE (`/api/events`) | Les hébergeurs qui coupent les requêtes après 30 s ne conviennent pas |
| Python 3, rien d'autre | Serveur stdlib, pas de base de données | N'importe quelle machine Linux, Mac ou Raspberry Pi suffit |

En clair : **il faut une petite machine à soi**. Quatre façons d'en avoir une, vérifiées en octobre 2026.

## Option 1 — Oracle Cloud « Always Free » (recommandé : gratuit à vie, machine dédiée)

Oracle offre en permanence une VM ARM Ampere A1 (jusqu'à 2 OCPU / 12 Go de RAM) ou deux micro-VM AMD (1 Go), avec 200 Go de disque, sans limite de durée. Une carte bancaire est demandée à l'inscription pour vérifier l'identité ; rien n'est débité tant qu'on reste dans les ressources « Always Free ».

1. Créer un compte sur [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). La **région d'origine** choisie à l'inscription est définitive : prendre la plus proche (ex. Paris, Francfort, Marseille).
2. Console → Compute → Instances → **Create instance** : image **Ubuntu 24.04** (Canonical), shape **VM.Standard.A1.Flex** (1 OCPU / 6 Go suffisent largement ; si le message « Out of host capacity » apparaît, réessayer plus tard, changer de domaine de disponibilité, ou prendre **VM.Standard.E2.1.Micro**, qui suffit aussi). Coller sa clé SSH publique (`cat ~/.ssh/id_ed25519.pub`, ou `ssh-keygen -t ed25519` pour en créer une).
3. Ouvrir les ports web dans le réseau virtuel : Networking → Virtual cloud networks → le VCN → Security lists → **Default Security List** → Add Ingress Rules : source `0.0.0.0/0`, protocole TCP, port de destination `80`, puis une seconde règle pour `443`.
4. Noter l'IP publique de l'instance. Sur la machine, les images Oracle bloquent aussi les ports via `iptables` : `deploy/deploy.sh` ouvre 80 et 443 automatiquement.
5. **Éviter la récupération pour inactivité** : Oracle peut reprendre une instance Always Free inactive 7 jours (CPU, réseau et mémoire sous 20 %). Le remède officiel est de passer le compte en **Pay As You Go** (Billing → Upgrade) : les ressources Always Free restent gratuites, rien n'est facturé pour elles, et les instances ne sont plus récupérées.
6. Déployer (voir plus bas) : `deploy/deploy.sh ubuntu@<IP>`.

L'app est alors servie en HTTPS sur `https://<IP-avec-des-tirets>.sslip.io` (ex. `203.0.113.10` → `https://203-0-113-10.sslip.io`), sans acheter de domaine.

## Option 2 — Google Cloud e2-micro (gratuit, régions américaines)

Google Cloud offre une VM `e2-micro` (1 Go) gratuite en continu avec 30 Go de disque, uniquement dans `us-west1`, `us-central1` ou `us-east1`, et 1 Go de sortie par mois. Un compte de facturation (carte) est requis. La latence depuis l'Europe est un peu plus élevée, l'app s'en accommode (cache hors ligne). Créer une VM Ubuntu 24.04, autoriser le trafic HTTP et HTTPS dans les options réseau de la VM, puis `deploy/deploy.sh <utilisateur>@<IP>`.

## Option 3 — Une machine à la maison + Tailscale Funnel (gratuit, sans carte)

Un Mac, un Raspberry Pi ou un vieux PC qui reste allumé fait très bien l'affaire : Tailscale (plan Personal gratuit) fournit une URL HTTPS stable `https://<machine>.<tailnet>.ts.net` sans domaine ni ouverture de port sur la box.

1. Installer [Tailscale](https://tailscale.com/download), se connecter, activer MagicDNS et HTTPS dans la console (DNS → HTTPS Certificates).
2. Lancer le serveur en service : Mac → `deploy/tripbook.plist` (remplacer `__DIR__` par le chemin du dépôt, mettre les jetons, copier dans `~/Library/LaunchAgents/com.tripbook.server.plist`, `launchctl load` ce fichier) ; Linux → `deploy/tripbook.service` adapté (`User`, `__DIR__`, `/usr/bin/python3`).
3. Exposer : `tailscale funnel --bg 8787`. La commande affiche l'URL publique ; la mettre dans `TRIP_URL`.

Limites : la machine doit rester allumée et connectée ; le débit de Funnel est limité (suffisant pour cette app) ; usage personnel seulement.

## Option 4 — Un petit VPS payant (3 à 5 €/mois)

Hetzner, OVH, Scaleway, Contabo, Ionos… : une instance Debian/Ubuntu avec IP publique. Même commande : `deploy/deploy.sh root@<IP>` ou `deploy/deploy.sh debian@<IP>`.

## Déployer avec `deploy/deploy.sh`

Prérequis sur l'ordinateur : `ssh`, `rsync`, `openssl`. Sur le serveur : Debian 12 ou Ubuntu 22.04/24.04, accès SSH avec `sudo` (ou root).

```bash
deploy/deploy.sh ubuntu@203.0.113.10                      # HTTPS sur 203-0-113-10.sslip.io
deploy/deploy.sh ubuntu@203.0.113.10 --domain voyage.exemple.fr   # avec un domaine (enregistrement A vers l'IP créé avant)
deploy/deploy.sh ubuntu@203.0.113.10 --no-push            # sans notifications push (pas de venv ni pip)
deploy/deploy.sh ubuntu@203.0.113.10 --dry-run            # montre ce qui serait fait
```

Le script, re-exécutable à volonté :

1. installe `python3`, `rsync` et Caddy (dépôt officiel) ;
2. copie `server.py`, `app/`, `deploy/`, le skill `trip` dans `/opt/tripbook` ; copie `data/trip.json` et `data/files/` **seulement s'ils n'existent pas encore** sur le serveur (les données vivantes ne sont jamais écrasées) ;
3. crée `/opt/tripbook/.env` s'il manque : un jeton par voyageur (lus dans `trip.json`) + un pour l'assistant, une clé de partage, `TRIP_URL` ;
4. installe `pywebpush` dans un venv pour les notifications (sauf `--no-push`) ;
5. installe et démarre le service systemd `tripbook` et écrit `/etc/caddy/Caddyfile` (HTTPS automatique, SSE activé) ;
6. ouvre 80/443 dans `iptables` si des règles de rejet existent (images Oracle) ;
7. vérifie `https://<hôte>/api/health`, affiche les liens par voyageur et le lien de partage, et écrit `.env` à la racine du dépôt (`TRIP_URL`, `TRIP_TOKEN` de l'assistant) pour que Claude opère l'API depuis l'ordinateur.

Mise à jour du code : relancer la même commande. Les jetons sont dans `/opt/tripbook/.env` sur le serveur (`ssh ... sudo cat /opt/tripbook/.env`).

## Installer sur le téléphone

- iPhone : ouvrir `https://<hôte>/?token=<jeton>` dans **Safari**, Partager → « Sur l'écran d'accueil ». Le jeton est mémorisé, l'URL nettoyée. Activer les notifications dans Réglages (icône en haut de l'écran Aujourd'hui).
- Android : ouvrir le lien dans Chrome, menu ⋮ → « Installer l'application ».
- Proches : `https://<hôte>/partage/?k=<TRIP_SHARE_KEY>&nom=<prénom>` (planning et carte, sans prix ni références ; leurs commentaires arrivent dans les Notes).

## Sauvegardes et sécurité

- Chaque écriture crée une sauvegarde serveur (50 dernières, `trip.py backups` / `restore`). Export complet à tout moment : `python3 .claude/skills/trip/scripts/trip.py state > sauvegarde.json`.
- Un jeton = une personne ; régénérer un jeton = éditer `/opt/tripbook/.env` puis `sudo systemctl restart tripbook`.
- Le serveur n'écoute que sur `127.0.0.1` ; seul Caddy est exposé. Les fichiers de l'app sont publics mais ne contiennent aucune donnée.
- Passer plus tard sur un vrai domaine : enregistrement A vers l'IP, remplacer la première ligne de `/etc/caddy/Caddyfile`, `sudo systemctl reload caddy`, mettre à jour `TRIP_URL` dans `.env` (serveur et local).
