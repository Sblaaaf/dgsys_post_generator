/* =========================================================================
   templates.js — Registre des mises en page
   -------------------------------------------------------------------------
   Chaque layout déclare :
     - `fields`  : les champs texte que l'éditeur doit afficher
     - `items`   : la configuration de la liste d'éléments (ou false)
     - `image`   : true si le layout accepte une image
     - `render`  : (slide, ctx) => string HTML
   Ajouter un template = ajouter une entrée ici. Rien d'autre à toucher :
   l'éditeur se construit automatiquement à partir de ce schéma.
   ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DGTemplates = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ---------- Utilitaires de texte ---------- */

  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /**
   * Met en forme un texte utilisateur :
   *   **mot**  → surbrillance
   *   retour à la ligne → <br>
   * L'échappement est fait AVANT d'injecter les balises : aucune balise
   * saisie par l'utilisateur ne peut être interprétée (pas d'XSS via l'éditeur,
   * ce qui compte dès qu'on partage un JSON de projet).
   */
  const fmt = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>')
      .replace(/\n/g, '<br>');

  const icon = (cls) => `<i class="${esc(cls || 'fa-solid fa-check')}" aria-hidden="true"></i>`;

  /* ---------- Fragments réutilisables ---------- */

  function bg(slide) {
    if (!slide.image || !slide.image.src) return '';
    const st = [
      `background-image:url('${String(slide.image.src).replace(/'/g, "\\'")}')`,
      `--img-pos:${esc(slide.image.pos || 'center')}`,
      `--img-zoom:${Number(slide.image.zoom) || 1}`,
    ].join(';');
    const veilCls = slide.image.gradient ? 'veil veil--grad' : 'veil';
    const veilStyle = slide.image.gradient ? '' : `style="--veil:${slide.image.overlay != null ? slide.image.overlay : 0.6}"`;
    return `<div class="bgimg" style="${st}"></div><div class="${veilCls}" ${veilStyle}></div>`;
  }

  function logo(state, small) {
    const b = state.brand || {};
    if (b.logoMode === 'none') return '';
    const img = b.logoSrc ? `<img src="${esc(b.logoSrc)}" alt="${esc(b.name || 'logo')}">` : '';
    const txt = b.logoMode !== 'image' && b.name ? `<b>${esc(b.name)}</b>` : '';
    if (!img && !txt) return '';
    return `<div class="logo${small ? ' logo--sm' : ''}">${img}${txt}</div>`;
  }

  function dots(ctx) {
    if (!ctx.state.options.dots || ctx.total < 2) return '';
    let out = '';
    for (let i = 0; i < ctx.total; i++) out += `<i class="${i === ctx.index ? 'on' : ''}"></i>`;
    return `<div class="dots" aria-hidden="true">${out}</div>`;
  }

  function note(slide, right) {
    if (!slide.note) return '';
    return `<div class="note${right ? ' note--right' : ''}">${fmt(slide.note)}</div>`;
  }

  function eyebrow(slide) {
    return slide.eyebrow ? `<div class="eyebrow">${esc(slide.eyebrow)}</div>` : '';
  }

  function items(slide, opts) {
    const o = opts || {};
    const list = (slide.items || []).filter((it) => it && (it.title || it.sub));
    if (!list.length) return '';
    const cls = o.plain ? 'ico ico--plain' : o.square ? 'ico ico--square' : 'ico';
    const rows = list.map((it) => `
      <div class="item${o.mid ? ' item--mid' : ''}">
        <div class="${cls}">${icon(it.icon)}</div>
        <div class="it">
          ${it.title ? `<b>${fmt(it.title)}</b>` : ''}
          ${it.sub ? `<span>${fmt(it.sub)}</span>` : ''}
        </div>
      </div>`).join('');
    return `<div class="items">${rows}</div>`;
  }

  /* ---------- Les layouts ---------- */

  const LAYOUTS = {

    cover: {
      label: 'Couverture',
      icon: 'fa-solid fa-star',
      hint: 'Accroche plein cadre avec image de fond et logo.',
      fields: ['eyebrow', 'title', 'subtitle', 'note'],
      items: false,
      image: true,
      defaults: { palette: 'dark', image: { overlay: 0.62, gradient: false } },
      render: (s, ctx) => `
        ${bg(s)}
        <div class="stack">
          ${logo(ctx.state)}
          <div class="grow"></div>
          ${eyebrow(s)}
          <h1>${fmt(s.title)}</h1>
          ${s.subtitle ? `<p class="lead" style="margin-top:calc(26 * var(--u))">${fmt(s.subtitle)}</p>` : ''}
          ${s.note ? `<div style="margin-top:calc(30 * var(--u))">${note(s)}</div>` : ''}
        </div>
        ${dots(ctx)}`,
    },

    list: {
      label: 'Liste à icônes',
      icon: 'fa-solid fa-list-check',
      hint: 'Titre + points clés. Le classique qui fonctionne toujours.',
      fields: ['eyebrow', 'title', 'note'],
      items: { max: 7, sub: true, defaultIcon: 'fa-solid fa-check' },
      image: false,
      defaults: { palette: 'light' },
      render: (s, ctx) => `
        <div class="stack">
          ${eyebrow(s)}
          <h2 style="margin-bottom:calc(48 * var(--u))">${fmt(s.title)}</h2>
          ${items(s, { square: s.style.iconShape === 'square' })}
          <div class="grow"></div>
          ${note(s, true)}
        </div>
        ${dots(ctx)}`,
    },

    numbered: {
      label: 'Chiffre géant',
      icon: 'fa-solid fa-3',
      hint: 'Un gros chiffre accroche l’œil : "3 indicateurs pour…".',
      fields: ['bignum', 'title', 'note'],
      items: { max: 5, sub: true, defaultIcon: 'fa-solid fa-chart-simple' },
      image: false,
      defaults: { palette: 'dark' },
      render: (s, ctx) => `
        <div class="stack">
          <div class="numrow">
            <div class="bignum">${esc(s.bignum)}</div>
            <h2>${fmt(s.title)}</h2>
          </div>
          ${items(s, { plain: true, mid: true })}
          <div class="grow"></div>
          ${note(s)}
        </div>
        ${dots(ctx)}`,
    },

    split: {
      label: 'Image + liste',
      icon: 'fa-solid fa-table-columns',
      hint: 'Photo en haut avec titre incrusté, points clés en dessous.',
      fields: ['title', 'note'],
      items: { max: 5, sub: true, defaultIcon: 'fa-solid fa-check' },
      image: true,
      defaults: { palette: 'light', image: { overlay: 0.25, gradient: true } },
      flush: true,
      render: (s, ctx) => `
        <div class="half-top${s.image && s.image.src ? '' : ' half-top--solid'}">
          ${bg(s)}
          <h2 class="on-media">${fmt(s.title)}</h2>
        </div>
        <div class="half-bottom">
          ${items(s, { mid: true })}
          <div class="grow"></div>
          ${note(s, true)}
        </div>
        ${dots(ctx)}`,
    },

    grid: {
      label: 'Grille de cartes',
      icon: 'fa-solid fa-table-cells-large',
      hint: '4 blocs équilibrés — parfait pour des bénéfices ou des piliers.',
      fields: ['eyebrow', 'title', 'note'],
      items: { max: 4, sub: true, defaultIcon: 'fa-solid fa-bolt' },
      image: false,
      defaults: { palette: 'dark' },
      render: (s, ctx) => {
        const list = (s.items || []).filter((it) => it && (it.title || it.sub)).slice(0, 4);
        const cards = list.map((it) => `
          <div class="card">
            <div class="ico">${icon(it.icon)}</div>
            <div class="it">
              ${it.title ? `<b>${fmt(it.title)}</b>` : ''}
              ${it.sub ? `<span>${fmt(it.sub)}</span>` : ''}
            </div>
          </div>`).join('');
        return `
          <div class="stack">
            ${eyebrow(s)}
            <h2 style="margin-bottom:calc(44 * var(--u))">${fmt(s.title)}</h2>
            <div class="grid2">${cards}</div>
            <div class="grow"></div>
            ${note(s, true)}
          </div>
          ${dots(ctx)}`;
      },
    },

    stats: {
      label: 'Chiffres clés',
      icon: 'fa-solid fa-percent',
      hint: 'Des KPI en très gros. Titre de l’élément = la valeur.',
      fields: ['eyebrow', 'title', 'note'],
      items: { max: 3, sub: true, defaultIcon: '', labels: { title: 'Valeur', sub: 'Libellé' } },
      image: false,
      defaults: { palette: 'light' },
      render: (s, ctx) => {
        const list = (s.items || []).filter((it) => it && (it.title || it.sub)).slice(0, 3);
        const rows = list.map((it) => `
          <div class="stat">
            <b>${fmt(it.title)}</b>
            ${it.sub ? `<span>${fmt(it.sub)}</span>` : ''}
          </div>`).join('');
        return `
          <div class="stack">
            ${eyebrow(s)}
            ${s.title ? `<h2 style="margin-bottom:calc(52 * var(--u))">${fmt(s.title)}</h2>` : ''}
            <div class="stats">${rows}</div>
            <div class="grow"></div>
            ${note(s, true)}
          </div>
          ${dots(ctx)}`;
      },
    },

    steps: {
      label: 'Étapes numérotées',
      icon: 'fa-solid fa-list-ol',
      hint: 'Une méthode en 3-4 temps : 01, 02, 03…',
      fields: ['eyebrow', 'title', 'note'],
      items: { max: 5, sub: true, defaultIcon: '' },
      image: false,
      defaults: { palette: 'dark' },
      render: (s, ctx) => {
        const list = (s.items || []).filter((it) => it && (it.title || it.sub));
        const rows = list.map((it, i) => `
          <div class="step">
            <i>${String(i + 1).padStart(2, '0')}</i>
            <div class="it">
              ${it.title ? `<b>${fmt(it.title)}</b>` : ''}
              ${it.sub ? `<span>${fmt(it.sub)}</span>` : ''}
            </div>
          </div>`).join('');
        return `
          <div class="stack">
            ${eyebrow(s)}
            <h2 style="margin-bottom:calc(48 * var(--u))">${fmt(s.title)}</h2>
            <div class="items">${rows}</div>
            <div class="grow"></div>
            ${note(s)}
          </div>
          ${dots(ctx)}`;
      },
    },

    quote: {
      label: 'Citation',
      icon: 'fa-solid fa-quote-left',
      hint: 'Verbatim client ou punchline signée.',
      fields: ['title', 'subtitle'],
      items: false,
      image: true,
      defaults: { palette: 'accent', image: { overlay: 0.78, gradient: false } },
      render: (s, ctx) => `
        ${bg(s)}
        <div class="stack">
          <div class="qmark">${icon('fa-solid fa-quote-left')}</div>
          <h2>${fmt(s.title)}</h2>
          ${s.subtitle ? `<div class="who">${fmt(s.subtitle)}</div>` : ''}
        </div>
        ${dots(ctx)}`,
    },

    bigtext: {
      label: 'Phrase choc',
      icon: 'fa-solid fa-bullhorn',
      hint: 'Une seule idée, plein cadre. À utiliser avec parcimonie.',
      fields: ['eyebrow', 'title', 'note'],
      items: false,
      image: true,
      defaults: { palette: 'accent', image: { overlay: 0.72, gradient: false } },
      render: (s, ctx) => `
        ${bg(s)}
        <div class="stack">
          ${eyebrow(s)}
          <h2>${fmt(s.title)}</h2>
          ${s.note ? `<div style="margin-top:calc(40 * var(--u))">${note(s)}</div>` : ''}
        </div>
        ${dots(ctx)}`,
    },

    outro: {
      label: 'Conclusion / CTA',
      icon: 'fa-solid fa-flag-checkered',
      hint: 'Dernière slide : message final, logo et appel à l’action.',
      fields: ['title', 'cta'],
      items: false,
      image: true,
      defaults: { palette: 'dark', image: { overlay: 0.7, gradient: false } },
      flush: true,
      render: (s, ctx) => `
        <div class="half-top${s.image && s.image.src ? '' : ' half-top--solid'}">
          ${bg(s)}
          <h2 class="on-media">${fmt(s.title)}</h2>
        </div>
        <div class="half-bottom">
          <div class="diag"></div>
          ${logo(ctx.state)}
          ${s.cta ? `<div class="cta">${fmt(s.cta)}</div>` : ''}
        </div>
        ${dots(ctx)}`,
    },
  };

  /* ---------- Lisibilité automatique ----------
     Une surbrillance blanche sur un accent clair (jaune, orange pâle) tombe
     sous 3:1 et devient illisible. Plutôt que d'imposer une couleur, on
     choisit celle des deux qui contraste le mieux avec le fond.
     Formule de luminance relative et de ratio : WCAG 2.1, §1.4.3. */

  function toRgb(hex) {
    const h = String(hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return Number.isNaN(n) || full.length !== 6
      ? [0, 0, 0]
      : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function luminance(hex) {
    return toRgb(hex)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
      .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
  }

  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }

  /** Renvoie, entre le blanc et `dark`, la couleur la plus lisible sur `bg`. */
  function readableOn(bg, dark) {
    return contrast(bg, '#ffffff') >= contrast(bg, dark) ? '#ffffff' : dark;
  }

  /* ---------- Palettes ---------- */
  /* Chaque palette mappe les couleurs de marque vers les variables du rendu.
     c = {primary, accent, light, muted, paper, ink}
     o = options d'état ; `hlContrast: 'white'` force le blanc sur les
     surbrillances, au prix du contraste — certaines chartes l'assument. */
  const PALETTES = {
    dark: (c, o) => ({
      '--bg': c.primary, '--fg': '#ffffff', '--accent': c.accent, '--muted': c.light,
      '--hl-bg': c.accent, '--hl-fg': readableOn(c.accent, c.primary),
      '--icon-bg': 'rgba(255,255,255,.14)', '--icon-fg': '#ffffff', '--icon-plain': '#ffffff',
      '--panel': c.primary, '--panel-fg': '#ffffff',
      '--card-bg': 'rgba(255,255,255,.10)', '--card-fg': '#ffffff',
      '--on-accent': readableOn(c.accent, c.primary), '--veil-color': c.primary,
    }),
    light: (c, o) => ({
      '--bg': c.paper, '--fg': c.ink, '--accent': c.accent, '--muted': c.muted,
      '--hl-bg': c.accent, '--hl-fg': readableOn(c.accent, c.ink),
      '--icon-bg': c.primary, '--icon-fg': readableOn(c.primary, c.ink), '--icon-plain': c.primary,
      '--panel': c.paper, '--panel-fg': c.ink,
      '--card-bg': c.light, '--card-fg': c.ink,
      '--on-accent': readableOn(c.accent, c.primary), '--veil-color': c.primary,
    }),
    accent: (c, o) => ({
      '--bg': c.accent, '--fg': '#ffffff', '--accent': '#ffffff', '--muted': 'rgba(255,255,255,.8)',
      '--hl-bg': c.primary, '--hl-fg': readableOn(c.primary, c.ink),
      '--icon-bg': 'rgba(255,255,255,.2)', '--icon-fg': '#ffffff', '--icon-plain': '#ffffff',
      '--panel': c.primary, '--panel-fg': '#ffffff',
      '--card-bg': 'rgba(255,255,255,.16)', '--card-fg': '#ffffff',
      '--on-accent': readableOn(c.accent, c.primary), '--veil-color': c.accent,
    }),
    soft: (c, o) => ({
      '--bg': c.light, '--fg': c.primary, '--accent': c.accent, '--muted': c.muted,
      '--hl-bg': c.primary, '--hl-fg': readableOn(c.primary, c.paper),
      '--icon-bg': c.primary, '--icon-fg': readableOn(c.primary, c.paper), '--icon-plain': c.primary,
      '--panel': c.light, '--panel-fg': c.primary,
      '--card-bg': c.paper, '--card-fg': c.primary,
      '--on-accent': readableOn(c.accent, c.primary), '--veil-color': c.primary,
    }),
  };

  const PALETTE_LABELS = { dark: 'Fond foncé', light: 'Fond clair', accent: 'Fond accent', soft: 'Fond doux' };

  /**
   * Produit le HTML complet d'une slide (élément .slide), styles inline compris.
   * @param {object} slide
   * @param {{state: object, index: number, total: number}} ctx
   * @returns {string}
   */
  function renderSlide(slide, ctx) {
    const def = LAYOUTS[slide.layout] || LAYOUTS.list;
    const fmtDef = ctx.state.format;
    const opts = ctx.state.options || {};
    const pal = (PALETTES[slide.palette] || PALETTES.light)(ctx.state.brand.colors, opts);
    if (opts.hlContrast === 'white') {
      pal['--hl-fg'] = '#ffffff';
      pal['--on-accent'] = '#ffffff';
    }

    const vars = Object.keys(pal).map((k) => `${k}:${pal[k]}`).join(';');
    const st = slide.style || {};
    const extra = [
      `--w:${fmtDef.w}`, `--h:${fmtDef.h}`,
      `--ts:${st.titleScale || 1}`, `--bs:${st.bodyScale || 1}`,
      `--tw:${st.titleWeight || 900}`,
      `--align:${st.align || 'left'}`,
      `--brand-font:'${ctx.state.brand.font || 'Inter'}'`,
    ].join(';');

    const mark = ctx.state.options.watermark && ctx.state.brand.website
      ? `<div class="mark">${esc(ctx.state.brand.website)}</div>` : '';

    return `<div class="slide slide--${esc(slide.layout)}${def.flush ? ' slide--flush' : ''}" `
      + `style="${vars};${extra}" data-id="${esc(slide.id)}" role="img" `
      + `aria-label="${esc((slide.title || def.label).replace(/\*\*/g, ''))}">`
      + def.render(slide, ctx) + mark + '</div>';
  }

  return { LAYOUTS, PALETTES, PALETTE_LABELS, renderSlide, esc, fmt, contrast, readableOn };
});
