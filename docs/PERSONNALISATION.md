# Personnaliser l'app

Tout ce qui est propre au voyage (titre, voyageurs, dates, devises, fuseaux) vient de `data/trip.json` : le serveur injecte le titre dans la page, le manifest (icône sur l'écran d'accueil) et la page de partage. Il n'y a rien à changer dans le code pour un nouveau voyage. Ce qui suit est optionnel.

## Couleur d'accent

Le thème est « papier & vermillon » : fond crème, encre sombre, accent rouge. Pour changer l'accent, modifier les trois variables `--red`, `--red-deep`, `--red-tint` dans les trois blocs `:root` de `app/app.css` (clair, sombre auto, sombre forcé) et dans le `:root` de `app/partage/index.html`. Exemple bleu ardoise :

```css
--red:#2f5d8a; --red-deep:#1f4263; --red-tint:#dde7f0;   /* clair */
--red:#7fa7d1; --red-deep:#2f5d8a; --red-tint:#1b2a3a;   /* sombre */
```

Puis `--accent` dans les blocs sombres (`--accent:#c2422c`) vers la même teinte, et `theme_color` / `background_color` dans `app/manifest.webmanifest` et les deux `<meta name="theme-color">` de `app/index.html` si le fond change.

## Icônes

```bash
python3 tools/make_icons.py                          # crème / vermillon
python3 tools/make_icons.py --accent "#2f5d8a"       # accent bleu
python3 tools/make_icons.py --bg "#101418" --accent "#f2c94c"
```

Génère `app/icons/icon-180.png` (iOS), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (Android). Dépendance : Pillow (`pip install pillow`). Pour une icône dessinée à la main, remplacer ces quatre fichiers en gardant les noms et tailles.

## Police d'affichage

Les titres utilisent Fraunces (serif, auto-hébergée dans `app/fonts/`, disponible hors ligne) ; le texte utilise DM Sans. Pour changer la police des titres :

1. Télécharger les fichiers woff2 (latin et latin-ext) depuis Google Fonts (l'API CSS `https://fonts.googleapis.com/css2?family=<Nom>:wght@600;700` donne les URL) dans `app/fonts/`.
2. Remplacer les deux `@font-face` Fraunces en tête de `app/app.css` et de `app/partage/index.html`, et la variable `--display`.
3. Mettre à jour la liste `SHELL` de `app/sw.js` (fichiers gardés hors ligne).

## Après toute modification de `app/`

Incrémenter la version de cache : `?v=N` sur `app.css` et `app.js` dans `app/index.html`, et dans `app/sw.js` la constante `VERSION` ainsi que les `?v=N` de la liste `SHELL`. Sans cela, les téléphones qui ont déjà installé l'app gardent l'ancienne version.

## Textes

L'interface est en français, écrite directement dans `app/app.js` (onglets dans `app/index.html`, page de partage dans `app/partage/index.html`). Les libellés des postes budgétaires et des catégories de dépenses sont des données (`budget.items`, `budget.categories`), modifiables dans l'app ou via l'API.
