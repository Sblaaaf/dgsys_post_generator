# DGsys — Générateur de carrousels

Un générateur de posts carrousels pour Instagram, LinkedIn et TikTok :
bibliothèque de mises en page, charte graphique paramétrable, analyse
automatique d'un texte brut, export PNG / ZIP / PDF.

L'application est une **page statique**. Pas de build, pas de framework,
pas de compte à créer. Double-cliquez `index.html` et ça fonctionne.

---

## Démarrage

```bash
git clone <url-du-depot> && cd dgsys_post_generator
```

Puis **ouvrez `index.html`** dans votre navigateur. C'est tout : pas de build,
pas de serveur, pas de compte, pas de conteneur. Les fichiers du dossier
`assets/` sont chargés en relatif, comme des `<script>` classiques — ce qui
fonctionne aussi bien en `file://` qu'en HTTP.

Seules les polices et les icônes viennent d'un CDN : prévoyez une connexion au
premier affichage, ensuite le navigateur les met en cache.

Si vous préférez un vrai serveur local (recommandé si vous utilisez la banque
d'images, certains navigateurs restreignant les requêtes réseau en `file://`) :

```bash
npm run serve      # http://localhost:8080
```

---

## Comment c'est construit

```
index.html              La page. Scripts classiques, donc utilisable en file://
assets/css/app.css      Interface + moteur de rendu des slides
assets/js/templates.js  Registre des mises en page et des palettes
assets/js/store.js      État, historique (annuler/rétablir), sauvegarde locale
assets/js/smart.js      Analyse de texte → carrousel (100 % hors ligne)
assets/js/llm.js        Pont vers un chat ou une API compatible OpenAI
assets/js/stock.js      Recherche d'images (Openverse, Pexels, Unsplash)
assets/js/dnd.js        Glisser-déposer : slides et fichiers images
assets/js/layers.js     Calques libres et calcul d'aimantation (géométrie pure)
assets/js/canvas.js     Manipulation directe des calques dans l'aperçu
assets/js/editor.js     Construction du panneau d'édition
assets/js/exporter.js   Capture et export PNG / ZIP / PDF / JSON
assets/js/app.js        Assemblage, aperçu, raccourcis
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
Ajouter, réordonner, dupliquer, masquer des slides. Le réordonnancement se fait
à la poignée (glisser-déposer) **ou** aux boutons fléchés : les deux coexistent
volontairement, le glisser-déposer natif HTML5 n'étant pas utilisable au clavier. Chaque slide a sa mise en
page, son fond, ses éléments, son image et ses réglages typographiques.

Encadrez un fragment de `**doubles astérisques**` pour le mettre en surbrillance.
Un seul fragment par titre, de préférence à la fin : c'est ce qui donne le rythme
visuel des carrousels efficaces.

### Images
Trois façons d'en mettre une : le bouton **Importer**, le bouton **Chercher**
(Openverse sans inscription, Pexels ou Unsplash avec une clé gratuite), ou
simplement **glisser un fichier sur la slide** dans l'aperçu.

Toute image choisie dans une banque est immédiatement téléchargée, redimensionnée
et convertie en `data:` URL. Ce n'est pas un détail : une image affichée depuis
une URL distante « teinte » le canvas et fait échouer l'export au pire moment.
En la convertissant tout de suite, le projet devient aussi autonome et exportable
hors ligne. Si un serveur refuse le téléchargement (CORS), l'application le dit
sur-le-champ plutôt que de vous laisser découvrir le problème à l'export.

Les clés d'API sont rangées séparément de l'état du projet : un `.json` exporté
ou partagé ne contient jamais de secret. L'option *Créditer l'auteur des photos*
incruste la mention sur la slide — c'est exigé par la licence Unsplash.

### Repères et calques libres

Le bouton **Repères** de la barre d'outils affiche la trame : marge de sécurité,
axes centraux, règle des tiers et colonnes. La marge compte plus qu'il n'y paraît —
Instagram et TikTok recouvrent les bords avec leur interface, un texte qui y traîne
devient illisible sur le téléphone.

Quand un template ne suffit pas, ajoutez un **calque libre** depuis la carte de la
slide : texte, icône, image ou forme. Vous le déplacez à la souris directement dans
l'aperçu, et il s'aimante aux bords, aux marges, aux axes centraux, aux colonnes et
**aux arêtes des autres calques** — les repères roses et violets apparaissent le
temps du déplacement.

| Geste | Effet |
|---|---|
| Glisser | Déplacer, avec aimantation |
| Poignée du coin | Redimensionner |
| `Alt` pendant le glisser | Suspendre l'aimantation |
| Flèches | Déplacer de 0,25 % |
| `Maj` + flèches | Déplacer de 2 % |
| `Suppr` | Supprimer le calque sélectionné |

Les positions sont stockées en **pourcentages**, jamais en pixels : passer du 4:5
au 9:16 ne fait pas dériver les calques. Et parce qu'un calque référence un jeton
de palette (`accent`, `surbrillance`…) plutôt qu'une couleur figée, changer de
charte le met à jour avec le reste.

Les repères, contours et poignées portent la classe `editor-only` et sont retirés
du clone avant capture : ils n'apparaissent jamais dans un fichier exporté.

### Onglet Design
Format de destination, couleurs de marque (six chartes fournies), logo, police,
pagination, filigrane.

### Onglet IA

**Générateur local (par défaut).** Collez un texte brut. L'analyseur repère les
titres, les listes, les décomptes (« 3 indicateurs pour… »), les chiffres clés,
les appels à l'action, et choisit une mise en page par section. Il attribue aussi
une icône par mot-clé. Aucune clé, aucun réseau, aucun coût.

Une ligne vide sépare deux slides ; une ligne commençant par `-` devient un point clé.

**Pont copier-coller.** L'application fabrique un prompt complet ; vous le collez
dans ChatGPT gratuit, Le Chat, Gemini ou n'importe quel chat, et vous recollez la
réponse. Le lecteur tolère le bavardage et les blocs de code — il extrait le JSON.

**Appel direct à une API.** Même format pour OpenAI, Groq, OpenRouter, et pour
**Ollama** ou **LM Studio** en local. Ces deux derniers sont gratuits, illimités
et hors ligne : c'est l'option à préférer si le budget est le critère.

> **À savoir** : il n'existe pas d'API gratuite donnant accès à ChatGPT.
> L'abonnement ChatGPT et l'API OpenAI (`platform.openai.com`) sont deux produits
> distincts, et l'API est facturée à l'usage. C'est exactement ce que le pont
> copier-coller contourne.

Dans tous les cas, la réponse du modèle est filtrée avant d'entrer dans
l'application : layout inconnu, palette inventée, classe d'icône douteuse ou
champ hors schéma sont écartés. Un modèle ne peut pas injecter n'importe quoi
dans votre carrousel.

Une clé saisie ici reste dans votre navigateur et n'est jamais exportée. Elle
demeure toutefois lisible par quiconque a accès à la page : ne publiez pas cette
application en ligne avec une clé enregistrée.

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

## Tests

```bash
npm test          # node --test test/*.test.js — aucune dépendance
```

53 tests couvrant :
- l'analyse de texte — découpage en sections, détection des chiffres clés,
  attribution d'icônes, plafonds d'éléments et de slides ;
- le rendu — échappement HTML, dimensions d'export, surbrillance ;
- le pont vers un modèle — extraction du JSON noyé dans du bavardage ou un bloc
  de code, et filtrage des valeurs hors schéma renvoyées par un modèle ;
- l'aimantation — lignes de référence, choix de la plus proche, seuils,
  redimensionnement et bornes. C'est de la géométrie pure, volontairement
  séparée du DOM pour rester testable sans navigateur.

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
- **Openverse** sert des fichiers hébergés par des tiers dont beaucoup refusent
  le téléchargement depuis un navigateur. Pexels et Unsplash sont plus fiables
  pour cet usage. En cas de refus, enregistrez l'image puis importez-la.
- **Ollama en local** doit autoriser l'origine de la page :
  `OLLAMA_ORIGINS="*" ollama serve` (ou l'origine précise en production).

## Pistes d'évolution

Par ordre de rapport valeur / effort :

1. **Rendu serveur** avec Playwright ou Satori : exports parfaits (plus de
   contournements `html2canvas`), et génération en masse par API.
2. **Bibliothèque de marques** : plusieurs chartes enregistrées, une par client.
3. **Calques partagés** : un bandeau ou une signature répété sur toutes les
   slides, modifiable en un seul endroit.
4. **Rendu vidéo** des slides (transitions) pour les Reels, via `ffmpeg.wasm`.
