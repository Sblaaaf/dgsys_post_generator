/* =========================================================================
   iconpicker.js — Sélecteur d'icônes visuel
   -------------------------------------------------------------------------
   Une modale qui affiche les 1881 icônes de FontAwesome Free, cherchables par
   nom, synonyme ou catégorie, et filtrables par style. On ne va plus chercher
   une classe sur le site de FontAwesome : on clique sur ce qu'on voit.

   Le catalogue (159 Ko) est chargé à la première ouverture seulement — il
   n'a rien à faire dans le coût de démarrage de l'application.
   ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DGIconPicker = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const STYLE_LABELS = { s: 'Solid', r: 'Regular', b: 'Brands' };

  /* Les métadonnées FontAwesome sont en anglais : « pain » y renvoie des
     pinceaux (paint), pas de la boulangerie. Ce dictionnaire traduit les
     termes que l'on tape spontanément en français. */
  const ALIASES = {
    pain: 'bread', baguette: 'bread', boulangerie: 'bread wheat', farine: 'wheat',
    ble: 'wheat', blé: 'wheat', gateau: 'cake', gâteau: 'cake', cuisson: 'fire oven',
    four: 'fire', cafe: 'mug coffee', café: 'mug coffee', couteau: 'utensils',
    horloge: 'clock', heure: 'clock', temps: 'clock', calendrier: 'calendar',
    argent: 'money euro', euro: 'euro', prix: 'tag money', cout: 'euro', coût: 'euro',
    facture: 'file-invoice receipt', panier: 'cart', magasin: 'store', boutique: 'store',
    caisse: 'cash-register', vente: 'cart', client: 'user', utilisateur: 'user',
    equipe: 'users', équipe: 'users', personne: 'user',
    graphique: 'chart', courbe: 'chart-line', statistique: 'chart', mesure: 'ruler',
    tableau: 'table', donnee: 'database chart', donnée: 'database chart',
    camion: 'truck', livraison: 'truck', stock: 'boxes warehouse', carton: 'box',
    entrepot: 'warehouse', entrepôt: 'warehouse', balance: 'scale',
    fleche: 'arrow', flèche: 'arrow', croix: 'xmark', coche: 'check', valide: 'check',
    poubelle: 'trash', dechet: 'trash recycle', déchet: 'trash recycle',
    recyclage: 'recycle', feuille: 'leaf', plante: 'seedling',
    ampoule: 'lightbulb', idee: 'lightbulb', idée: 'lightbulb', fusee: 'rocket',
    fusée: 'rocket', cible: 'bullseye', trophee: 'trophy', trophée: 'trophy',
    cadenas: 'lock', securite: 'shield lock', sécurité: 'shield lock',
    oeil: 'eye', loupe: 'magnifying-glass', recherche: 'magnifying-glass',
    engrenage: 'gear', reglage: 'sliders gear', réglage: 'sliders gear',
    telephone: 'phone mobile', téléphone: 'phone mobile', ordinateur: 'laptop desktop',
    enveloppe: 'envelope', courrier: 'envelope', message: 'comment',
    coeur: 'heart', cœur: 'heart', etoile: 'star', étoile: 'star',
    alerte: 'triangle-exclamation', attention: 'triangle-exclamation',
    question: 'circle-question', info: 'circle-info',
    maison: 'house', batiment: 'building', bâtiment: 'building',
    document: 'file', dossier: 'folder', imprimer: 'print',
  };
  const STYLE_CLASS = { s: 'fa-solid', r: 'fa-regular', b: 'fa-brands' };
  const PAGE = 120;

  let loading = null;
  let modal = null;
  let state = { q: '', style: 's', cat: '', shown: PAGE, onPick: null, current: '' };

  /* ---------------------------- Chargement ---------------------------- */

  function loadCatalog() {
    if (window.DGIconData) return Promise.resolve(window.DGIconData);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      // Chemin relatif : fonctionne aussi bien en file:// qu'en HTTP.
      s.src = 'assets/data/icons.js';
      s.onload = () => (window.DGIconData ? resolve(window.DGIconData) : reject(new Error('Catalogue illisible.')));
      s.onerror = () => reject(new Error('Catalogue d’icônes introuvable (assets/data/icons.js).'));
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ---------------------------- Recherche ---------------------------- */

  /**
   * @param {Array} rows [nom, styles, termes, catégories]
   * @returns {Array} lignes correspondant aux filtres, nom exact d'abord
   */
  /** Mots à chercher : le terme saisi, plus sa traduction éventuelle. */
  function needlesFor(q) {
    const raw = String(q || '').trim().toLowerCase();
    if (!raw) return [];
    const list = [raw];
    const alias = ALIASES[raw];
    if (alias) alias.split(' ').forEach((w) => list.push(w));
    return list;
  }

  function filter(rows, q, style, cat) {
    const needles = needlesFor(q);
    const out = [];

    for (const row of rows) {
      if (style && row[1].indexOf(style) < 0) continue;
      if (cat && row[3].split(',').indexOf(cat) < 0) continue;
      if (!needles.length) { out.push([row, 3]); continue; }

      // Rang : 0 = nom exact, 1 = début de nom, 2 = nom contenant, 3 = synonyme
      let rank = -1;
      for (const n of needles) {
        let r = -1;
        if (row[0] === n) r = 0;
        else if (row[0].startsWith(n)) r = 1;
        else if (row[0].indexOf(n) >= 0) r = 2;
        else if (row[2].indexOf(n) >= 0) r = 3;
        if (r >= 0 && (rank < 0 || r < rank)) rank = r;
      }
      if (rank >= 0) out.push([row, rank]);
    }

    return out.sort((a, b) => a[1] - b[1] || (a[0][0] < b[0][0] ? -1 : 1)).map((x) => x[0]);
  }

  /* ---------------------------- Interface ---------------------------- */

  function open(current, onPick) {
    state = { q: '', style: 's', cat: '', shown: PAGE, onPick, current: current || '' };

    // Si l'icône courante est en Regular ou Brands, on ouvre sur ce style
    const m = /^fa-(solid|regular|brands)\s/.exec(state.current);
    if (m) state.style = m[1][0];

    build();
    loadCatalog().then(paint).catch((e) => {
      const g = modal.querySelector('[data-grid]');
      g.innerHTML = `<p class="hint" style="grid-column:1/-1">${e.message}</p>`;
    });
  }

  function close() {
    if (!modal) return;
    modal.remove();
    modal = null;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }

  function build() {
    close();
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Choisir une icône');
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <header class="modal__head">
          <h2>Choisir une icône</h2>
          <button class="btn btn--ghost" data-close aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        </header>

        <div class="modal__tools">
          <div class="search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" data-q placeholder="Chercher : euro, pain, horloge, graphique…" autocomplete="off">
          </div>
          <div class="seg" role="group" aria-label="Style d’icône" data-styles></div>
          <select data-cat aria-label="Catégorie"><option value="">Toutes les catégories</option></select>
        </div>

        <p class="modal__count" data-count></p>
        <div class="icon-wall" data-grid></div>
        <footer class="modal__foot">
          <button class="btn" data-more>Afficher plus</button>
          <span class="hint" data-current></span>
        </footer>
      </div>`;

    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);
    modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

    const seg = modal.querySelector('[data-styles]');
    Object.keys(STYLE_LABELS).forEach((k) => {
      const b = document.createElement('button');
      b.className = 'seg__btn';
      b.type = 'button';
      b.textContent = STYLE_LABELS[k];
      b.setAttribute('aria-pressed', String(k === state.style));
      b.addEventListener('click', () => {
        state.style = k;
        state.shown = PAGE;
        seg.querySelectorAll('.seg__btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        paint();
      });
      seg.appendChild(b);
    });

    const q = modal.querySelector('[data-q]');
    let t = null;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = q.value; state.shown = PAGE; paint(); }, 120);
    });
    q.focus();

    modal.querySelector('[data-cat]').addEventListener('change', (e) => {
      state.cat = e.target.value;
      state.shown = PAGE;
      paint();
    });

    modal.querySelector('[data-more]').addEventListener('click', () => {
      state.shown += PAGE * 2;
      paint();
    });

    modal.querySelector('[data-current]').textContent = state.current
      ? `Actuelle : ${state.current}` : '';
  }

  function paint() {
    const data = window.DGIconData;
    if (!data || !modal) return;

    const cat = modal.querySelector('[data-cat]');
    if (cat.options.length === 1) {
      Object.keys(data.categories)
        .sort((a, b) => data.categories[a].localeCompare(data.categories[b]))
        .forEach((k) => cat.add(new Option(data.categories[k], k)));
    }

    const rows = filter(data.icons, state.q, state.style, state.cat);
    const grid = modal.querySelector('[data-grid]');
    const slice = rows.slice(0, state.shown);

    grid.innerHTML = '';
    if (!rows.length) {
      grid.innerHTML = '<p class="hint" style="grid-column:1/-1;padding:20px 0">'
        + 'Aucune icône pour ces filtres. Essayez un autre style — beaucoup d’icônes '
        + 'n’existent qu’en Solid dans la version gratuite.</p>';
    }

    const frag = document.createDocumentFragment();
    slice.forEach((row) => {
      const cls = `${STYLE_CLASS[state.style]} fa-${row[0]}`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-cell';
      b.title = row[0] + (row[2] ? ` — ${row[2]}` : '');
      b.setAttribute('aria-label', row[0]);
      if (cls === state.current) b.dataset.current = 'true';
      b.innerHTML = `<i class="${cls}" aria-hidden="true"></i><span>${row[0]}</span>`;
      b.addEventListener('click', () => {
        if (state.onPick) state.onPick(cls);
        close();
      });
      frag.appendChild(b);
    });
    grid.appendChild(frag);

    modal.querySelector('[data-count]').textContent =
      `${rows.length} icône${rows.length > 1 ? 's' : ''}${rows.length > slice.length ? ` · ${slice.length} affichées` : ''}`;
    modal.querySelector('[data-more]').style.display = rows.length > slice.length ? '' : 'none';
  }

  return { open, close, filter, needlesFor, ALIASES, loadCatalog };
});
