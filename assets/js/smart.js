/* =========================================================================
   smart.js — Générateur heuristique : texte brut → carrousel structuré
   -------------------------------------------------------------------------
   Fonctionne 100 % hors ligne, sans clé API. C'est volontaire :
   l'IA distante (server/) est un bonus, pas une dépendance. Le module est
   écrit en UMD léger pour être testable avec `node --test`.
   ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DGSmart = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const BULLET = /^\s*(?:[-*•–—▪▸>]|\d+[.)])\s+(.*)$/;
  const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-ZÀÂÉÈÊÎÔÙÜÇ0-9])/;

  /* Attribution d'icône par mot-clé, dans l'ordre : la première règle gagne. */
  const ICON_RULES = [
    [/\b\d+\s*%|\btaux\b|pourcent/i,                        'fa-solid fa-percent'],
    [/€|\beuros?\b|co[uû]ts?|prix|marges?|rentab|budget|chiffre d.affaires/i, 'fa-solid fa-euro-sign'],
    [/stocks?|inventaire|entrep[oô]t|r[ée]ception|approvisionn/i, 'fa-solid fa-boxes-stacked'],
    [/temps|heures?|d[ée]lais?|planning|rapidit/i,          'fa-solid fa-clock'],
    [/ventes?|clients?|caisse|commandes?|panier/i,          'fa-solid fa-cart-shopping'],
    [/[ée]quipes?|collaborateurs?|salari[ée]s?|personnel|humain/i, 'fa-solid fa-users'],
    [/donn[ée]es?|data|tableau de bord|dashboard|indicateurs?|kpi|mesur|statistiq/i, 'fa-solid fa-chart-simple'],
    [/pertes?|gaspill|invendus?|d[ée]chets?|jet[ée]/i,      'fa-solid fa-triangle-exclamation'],
    [/erreurs?|probl[èe]mes?|risques?|[ée]checs?|oublis?/i, 'fa-solid fa-xmark'],
    [/farine|pain|boulang|p[âa]tiss|cuisson|fournil|four\b|p[ée]trin/i, 'fa-solid fa-wheat-awn'],
    [/production|fabrication|atelier|recettes?|nomenclatures?|fa[çc]onn/i, 'fa-solid fa-gear'],
    [/s[ée]curit|conformit|hygi[èe]ne|tra[çc]abilit|normes?/i, 'fa-solid fa-shield-halved'],
    [/croissance|augment|progress|am[ée]lior|gagn|optimis|booste/i, 'fa-solid fa-arrow-trend-up'],
    [/id[ée]es?|conseils?|astuces?|solutions?/i,            'fa-solid fa-lightbulb'],
    [/suivi|suivre|pilot|contr[ôo]l/i,                      'fa-solid fa-eye'],
  ];

  const NEGATIVE_HEADING = /probl[èe]m|pertes?|erreurs?|risques?|pourquoi|sources?|freins?|pi[èe]ges?|[ée]viter|attention|sympt[ôo]m/i;
  const STEPS_HEADING    = /[ée]tapes?|m[ée]thode|process|d[ée]marche|comment (faire|s.y prendre)|marche [àa] suivre|plan d.action/i;
  const CTA_HINT         = /^(contact|d[ée]couvrez|demandez|r[ée]servez|essayez|parlons|[ée]changeons|t[ée]l[ée]charg)/i;
  const URLISH           = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(fr|com|io|net|eu|org)\b)/i;

  /* ---------------------------------------------------------------- outils */

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const words = (s) => clean(s).split(' ').filter(Boolean);

  function pickIcon(text, negative) {
    for (const [re, ic] of ICON_RULES) if (re.test(text)) return ic;
    return negative ? 'fa-solid fa-xmark' : 'fa-solid fa-check';
  }

  /**
   * Met en surbrillance la fin d'une phrase : après la dernière virgule si
   * elle existe, sinon les derniers mots. C'est le tic graphique des
   * carrousels efficaces — on ne surligne jamais toute la phrase.
   */
  function emphasizeTail(sentence) {
    const s = clean(sentence);
    if (!s) return s;
    if (/\*\*/.test(s)) return s; // déjà balisé par l'utilisateur
    const comma = s.lastIndexOf(', ');
    if (comma > 8 && s.length - comma > 10) {
      return s.slice(0, comma + 2) + '**' + s.slice(comma + 2) + '**';
    }
    const w = words(s);
    if (w.length < 4) return s;
    const cut = Math.max(2, Math.min(6, Math.floor(w.length / 2)));
    return w.slice(0, w.length - cut).join(' ') + ' **' + w.slice(w.length - cut).join(' ') + '**';
  }

  /** Découpe "Titre (précision)" ou "Titre : précision" en {title, sub}. */
  function splitItem(raw) {
    const s = clean(raw);
    let m = s.match(/^(.{4,}?)\s*[:–—]\s+(.{2,})$/);
    if (m) return { title: clean(m[1]), sub: clean(m[2]) };
    m = s.match(/^(.{4,}?)\s*(\([^()]{2,}\))\s*$/);
    if (m) return { title: clean(m[1]), sub: clean(m[2]) };
    m = s.match(/^(.{10,}?[.!?])\s+(.{6,})$/);
    if (m) return { title: clean(m[1]).replace(/[.]$/, ''), sub: clean(m[2]) };
    return { title: s, sub: '' };
  }

  /** Un élément ressemble-t-il à un chiffre clé ? ("38 %", "12 000 €", "x3") */
  const isStatLike = (t) => /^(?:[x×]\s*\d|[^a-zA-Zà-ÿ]{0,3}\d[\d\s.,]*\s*(?:%|€|k€|x|h|min|j|ans?|pts?)?)\b/i.test(clean(t));

  /* -------------------------------------------------------------- découpe */

  function parseSections(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim());
    const sections = [];
    let cur = null;
    const blank = () => ({ heading: '', paras: [], bullets: [] });
    const flush = () => {
      if (cur && (cur.heading || cur.paras.length || cur.bullets.length)) sections.push(cur);
      cur = null;
    };

    for (const line of lines) {
      if (!line) { flush(); continue; } // une ligne vide ferme toujours la section
      const m = line.match(BULLET);
      if (m) {
        if (!cur) cur = blank();
        cur.bullets.push(clean(m[1]));
        continue;
      }
      if (cur && cur.bullets.length) flush();
      if (!cur) cur = blank();
      if (!cur.heading) cur.heading = clean(line);
      else cur.paras.push(clean(line));
    }
    flush();
    return sections;
  }

  /** Mode prose : aucun puce dans le texte → on segmente en phrases. */
  function proseToSections(text) {
    const sentences = String(text || '')
      .split(/\r?\n+/).join(' ')
      .split(SENTENCE_SPLIT)
      .map(clean)
      .filter((s) => s.length > 2);
    if (!sentences.length) return [];
    const head = sentences.shift();
    const out = [{ heading: head, paras: sentences.slice(0, 1), bullets: [] }];
    const rest = sentences.slice(1);
    for (let i = 0; i < rest.length; i += 4) {
      out.push({ heading: '', paras: [], bullets: rest.slice(i, i + 4) });
    }
    return out;
  }

  /* -------------------------------------------------------- construction */

  function sectionToSlides(sec, opts, state) {
    const maxItems = opts.maxItems || 5;
    let heading = sec.heading || '';
    let bignum = '';
    const negative = NEGATIVE_HEADING.test(heading + ' ' + sec.bullets.join(' '));

    // "3 indicateurs pour mesurer vos pertes" → chiffre géant + reste du titre
    const num = heading.match(/^(\d{1,2})\s+(.{3,})$/);
    if (num) { bignum = num[1]; heading = clean(num[2]); }

    const rawItems = sec.bullets.length ? sec.bullets : sec.paras;
    const parsed = rawItems.map((b) => {
      const it = splitItem(b);
      return { icon: pickIcon(b, negative), title: it.title, sub: it.sub };
    });

    // Une ligne courte et exclamative devient l'annotation manuscrite
    let annotation = '';
    if (parsed.length) {
      const last = parsed[parsed.length - 1];
      if (!last.sub && /!$/.test(last.title) && last.title.length < 70) {
        annotation = parsed.pop().title;
      }
    }

    // Choix du layout
    let layout = 'list';
    if (bignum) layout = 'numbered';
    else if (STEPS_HEADING.test(heading) || /^[ée]tape/i.test(parsed[0] ? parsed[0].title : '')) layout = 'steps';
    else if (parsed.length >= 2 && parsed.filter((p) => isStatLike(p.title)).length >= Math.ceil(parsed.length / 2)) layout = 'stats';
    else if (parsed.length === 4 && parsed.every((p) => p.title.length <= 38 && !p.sub)) layout = 'grid';

    // Débordement : on scinde en plusieurs slides plutôt que de tasser
    const chunks = [];
    const cap = layout === 'grid' ? 4 : layout === 'stats' ? 3 : maxItems;
    for (let i = 0; i < parsed.length; i += cap) chunks.push(parsed.slice(i, i + cap));
    if (!chunks.length) chunks.push([]);

    return chunks.map((chunk, i) => ({
      layout: i > 0 && layout === 'grid' ? 'list' : layout,
      palette: state.nextPalette(),
      title: heading ? emphasizeTail(heading) : '',
      bignum: i === 0 ? bignum : '',
      items: chunk,
      note: i === chunks.length - 1 ? annotation : '',
    }));
  }

  /**
   * Construit un carrousel complet à partir d'un texte libre.
   *
   * @param {string} text
   * @param {object} [opts]
   * @param {number} [opts.maxItems=5]   éléments max par slide
   * @param {number} [opts.maxSlides=8]  slides max (couverture et outro comprises)
   * @param {string} [opts.brandName]    nom de marque pour l'outro
   * @param {string} [opts.website]      URL affichée sur l'outro
   * @param {boolean} [opts.cover=true]  générer la couverture
   * @param {boolean} [opts.outro=true]  générer la conclusion
   * @returns {{name: string, slides: Array}}
   */
  function build(text, opts) {
    const o = Object.assign({ maxItems: 5, maxSlides: 8, cover: true, outro: true }, opts || {});
    let sections = parseSections(text);
    const hasBullets = sections.some((s) => s.bullets.length);
    if (!hasBullets) sections = proseToSections(text);
    if (!sections.length) return { name: 'Carrousel', slides: [] };

    // Extraction du CTA : une ligne isolée qui ressemble à un appel à l'action
    let cta = '';
    sections = sections.filter((sec) => {
      const solo = !sec.bullets.length && !sec.paras.length && sec.heading;
      if (solo && (CTA_HINT.test(sec.heading) || URLISH.test(sec.heading))) { cta = sec.heading; return false; }
      return true;
    });

    // La première section fournit le titre et l'accroche de couverture
    const head = sections.shift();
    const mainTitle = head.heading || 'Votre sujet';
    const hook = head.paras[0] || (head.bullets[0] || '');

    // Alternance des fonds pour créer du rythme visuel
    let tick = 0;
    const state = { nextPalette: () => (['light', 'dark', 'soft', 'dark'][tick++ % 4]) };

    const slides = [];

    if (o.cover) {
      slides.push({
        layout: 'cover', palette: 'dark',
        title: mainTitle,
        subtitle: hook ? emphasizeTail(hook) : '',
        note: '',
      });
    }

    // Si la première section portait elle-même des puces, on ne la perd pas
    if (head.bullets.length) sections.unshift({ heading: '', paras: [], bullets: head.bullets });

    const budget = Math.max(1, o.maxSlides - (o.cover ? 1 : 0) - (o.outro ? 1 : 0));
    for (const sec of sections) {
      if (slides.length - (o.cover ? 1 : 0) >= budget) break;
      sectionToSlides(sec, o, state).forEach((sl) => {
        if (slides.length - (o.cover ? 1 : 0) < budget) slides.push(sl);
      });
    }

    if (o.outro) {
      slides.push({
        layout: 'outro', palette: 'dark',
        title: emphasizeTail(cta && !URLISH.test(cta) ? cta : `Envie d'aller plus loin sur ${lower(mainTitle)} ?`),
        cta: o.website ? `Découvrez nos solutions sur\n${o.website}` : (cta || ''),
      });
    }

    return { name: mainTitle.slice(0, 60), slides };
  }

  const lower = (s) => {
    const t = clean(s).replace(/\s*\?$/, '');
    return t.charAt(0).toLowerCase() + t.slice(1);
  };

  return { build, parseSections, splitItem, pickIcon, emphasizeTail, isStatLike };
});
