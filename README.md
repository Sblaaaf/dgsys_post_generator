# DGsys — Générateur de carrousels

Un générateur de posts carrousels pour Instagram, LinkedIn et TikTok :
bibliothèque de mises en page, charte graphique paramétrable, analyse
automatique d'un texte brut, export PNG / ZIP / PDF.

L'application est une **page statique**. Pas de build, pas de framework,
pas de compte à créer. Double-cliquez `index.html` et ça fonctionne.

---

## Démarrage

### Option A — ouvrir le fichier (le plus rapide)

```bash
git clone <url-du-depot> && cd dgsys_post_generator
# puis ouvrez index.html dans votre navigateur
```

Tout fonctionne : édition, aperçu, export. Seules les polices et les icônes
sont chargées depuis un CDN, donc une connexion est nécessaire au premier
affichage.

### Option B — Docker (recommandé, et requis pour l'assistant Claude)

```bash
cp .env.example .env     # renseignez ANTHROPIC_API_KEY si vous voulez l'assistant
docker compose up
```

- Interface : <http://localhost:8080>
- Service IA : <http://localhost:8787/health>

Le service `ai` est **facultatif**. Sans clé API, le générateur heuristique
embarqué dans la page structure déjà un carrousel complet à partir d'un texte.

Variables d'environnement (voir `.env.example`) :

| Variable | Défaut | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Clé API Anthropic. Requise pour le service `ai` uniquement. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Modèle utilisé pour la génération. |
| `ALLOWED_ORIGIN` | `http://localhost:8080` | Seule origine autorisée à appeler le service (CORS). |
| `WEB_PORT` / `AI_PORT` | `8080` / `8787` | Ports exposés sur la machine hôte. |

---

## Comment c'est construit

```
index.html              La page. Scripts classiques, donc utilisable en file://
assets/css/app.css      Interface + moteur de rendu des slides
assets/js/templates.js  Registre des mises en page et des palettes
assets/js/store.js      État, historique (annuler/rétablir), sauvegarde locale
assets/js/smart.js      Analyse de texte → carrousel (100 % hors ligne)
assets/js/editor.js     Construction du panneau d'édition
assets/js/exporter.js   Capture et export PNG / ZIP / PDF / JSON
assets/js/app.js        Assemblage, aperçu, raccourcis
server/                 Proxy Claude (Node 20 + Express), optionnel
test/                   Tests unitaires (lanceur intégré de Node, zéro dépendance)
```

### La décision d'architecture qui compte

Chaque slide est construite **à ses dimensions d'export réelles** (1080×1350 px
pour un format 4:5). L'aperçu n'est qu'un `transform: scale()` appliqué par-dessus.

Conséquence : ce que vous voyez est exactement ce qui sort, au pixel près.
L'alternative classique — dessiner petit puis agrandir à l'export — produit des
décalages typographiques et des retours à la ligne différents entre l'aperçu et
le fichier final.

Toutes les tailles sont exprimées en multiples d'une unité `--u`, calculée à
partir de la plus petite dimension de la slide. Changer de format redimensionne
donc proportionnellement toute la composition, sans retoucher une seule valeur.

### Ajouter une mise en page

Une seule entrée à créer dans `assets/js/templates.js` :

```js
monLayout: {
  label: 'Mon layout',
  icon: 'fa-solid fa-star',
  hint: 'À quoi ça sert, en une phrase.',
  fields: ['title', 'note'],              // champs texte proposés dans l'éditeur
  items: { max: 5, sub: true, defaultIcon: 'fa-solid fa-check' },
  image: true,
  defaults: { palette: 'light' },
  render: (s, ctx) => `<div class="stack"><h2>${fmt(s.title)}</h2></div>${dots(ctx)}`,
},
```

Le panneau d'édition se construit automatiquement à partir de ce schéma —
il n'y a aucune interface à écrire.

---

## Utilisation

### Onglet Contenu
Ajouter, réordonner, dupliquer, masquer des slides. Chaque slide a sa mise en
page, son fond, ses éléments, son image et ses réglages typographiques.

Encadrez un fragment de `**doubles astérisques**` pour le mettre en surbrillance.
Un seul fragment par titre, de préférence à la fin : c'est ce qui donne le rythme
visuel des carrousels efficaces.

### Onglet Design
Format de destination, couleurs de marque (six chartes fournies), logo, police,
pagination, filigrane.

### Onglet IA
Collez un texte brut. L'analyseur repère les titres, les listes, les décomptes
(« 3 indicateurs pour… »), les chiffres clés, les appels à l'action, et choisit
une mise en page par section. Il attribue aussi une icône par mot-clé.

Une ligne vide sépare deux slides ; une ligne commençant par `-` devient un point clé.

### Onglet Export

| Sortie | Usage |
|---|---|
| ZIP d'images | Instagram, TikTok — une image par slide |
| PDF | LinkedIn, qui attend ce format pour les carrousels |
| JSON | Archiver, versionner ou partager un carrousel |

Le travail est sauvegardé automatiquement dans le navigateur (`localStorage`).
`Ctrl+Z` / `Ctrl+Maj+Z` pour annuler et rétablir, `Ctrl+S` pour exporter le `.json`.

Le bouton **Auto-ajuster** réduit la typographie des slides dont le contenu
déborde. Un triangle d'alerte signale ces slides dans l'aperçu.

---

## Le service IA

### Pourquoi un serveur pour une page statique

Une clé API placée dans du JavaScript de navigateur est lisible par n'importe
quel visiteur, et utilisable à vos frais. Elle reste donc côté serveur ; le
navigateur ne connaît qu'un point d'entrée sans secret.

Le service impose par ailleurs :
- une **liste blanche de mises en page** définie côté serveur, pas côté client ;
- un **schéma JSON strict** appliqué à la réponse du modèle (`output_config.format`) ;
- une **validation de sortie** avant renvoi au navigateur — le modèle ne peut pas
  injecter de classe CSS ou de valeur arbitraire ;
- une **limitation de débit** par IP et une taille de requête plafonnée.

> La limitation de débit est en mémoire : elle est remise à zéro à chaque
> redémarrage et ne se partage pas entre instances. C'est suffisant pour un
> usage interne ; pour une exposition publique, passez sur Redis.

### Appeler le service

```bash
curl -X POST http://localhost:8787/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Vos pertes en boulangerie\nElles coûtent plus que vous ne le pensez.\n\nLes sources de pertes\n- Matières premières mal utilisées\n- Erreurs de fabrication",
    "brief": "Ton pédagogique, cible artisans boulangers",
    "maxSlides": 6,
    "maxItems": 5,
    "brand": { "name": "DGsys", "website": "dgsys.fr" }
  }'
```

Le même appel en `fetch` :

```js
const res = await fetch('http://localhost:8787/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text,
    brief: 'Ton pédagogique, cible artisans boulangers',
    maxSlides: 6,
    maxItems: 5,
    brand: { name: 'DGsys', website: 'dgsys.fr' },
  }),
});
if (!res.ok) throw new Error(await res.text());
const carrousel = await res.json(); // { name, slides: [...] }
```

Réponse :

```json
{
  "name": "Vos pertes en boulangerie",
  "slides": [
    { "layout": "cover", "palette": "dark", "title": "Vos pertes en boulangerie",
      "subtitle": "Elles coûtent **plus que vous ne le pensez**", "items": [] }
  ]
}
```

---

## Tests

```bash
npm test          # node --test test/*.test.js — aucune dépendance
```

Les tests couvrent l'analyse de texte (découpage, détection des chiffres clés,
attribution d'icônes, plafonds) et le rendu (échappement HTML, dimensions
d'export, surbrillance).

---

## Limites connues

- **Export** : `html2canvas` rastérise du DOM, pas un moteur d'impression. Deux
  règles en découlent, appliquées dans le code : la couleur d'un texte sur média
  vient de la feuille de style, jamais d'un attribut `style` (la bibliothèque
  privilégie l'inline) ; et une surbrillance est un `inline-block`, car un span
  inline réparti sur plusieurs lignes est exporté comme un unique rectangle qui
  recouvre le texte voisin.
- **Stockage local** : `localStorage` plafonne autour de 5 Mo. Les images
  importées sont ramenées à 1800 px de côté, mais un carrousel très chargé peut
  saturer — l'application le signale et invite à exporter en `.json`.
- **Polices** : Inter, Caveat, Poppins, Montserrat et Space Grotesk sont chargées
  depuis Google Fonts. Pour une police sous licence, ajoutez la déclaration
  `@font-face` dans `index.html` et l'entrée correspondante dans le sélecteur.

## Pistes d'évolution

Par ordre de rapport valeur / effort :

1. **Rendu serveur** avec Playwright ou Satori : exports parfaits (plus de
   contournements `html2canvas`), et génération en masse par API.
2. **Réordonnancement par glisser-déposer** en complément des boutons actuels,
   qui restent nécessaires pour l'accessibilité clavier.
3. **Banque d'images intégrée** (Unsplash, Pexels) — attention alors aux
   restrictions CORS à l'export : les images distantes doivent être converties
   en `data:` avant capture.
4. **Bibliothèque de marques** : plusieurs chartes enregistrées, une par client.
5. **Rendu vidéo** des slides (transitions) pour les Reels, via `ffmpeg.wasm`.
