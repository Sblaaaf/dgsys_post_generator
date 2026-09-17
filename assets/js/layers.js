/* =========================================================================
   layers.js — Calques libres et aimantation
   -------------------------------------------------------------------------
   Quand un template ne suffit pas, on ajoute un calque flottant : texte,
   image, icône ou forme, positionné à la main par-dessus la composition.

   Les coordonnées sont en POURCENTAGES de la slide, jamais en pixels.
   C'est ce qui permet de changer de format (4:5 → 9:16) sans que les
   calques partent à la dérive.

   Le calcul d'aimantation est isolé de toute manipulation du DOM : c'est
   de la géométrie pure, donc testable sans navigateur.
   ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DGLayers = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const TYPES = {
    text:  { label: 'Texte',  icon: 'fa-solid fa-t' },
    icon:  { label: 'Icône',  icon: 'fa-solid fa-shapes' },
    image: { label: 'Image',  icon: 'fa-regular fa-image' },
    shape: { label: 'Forme',  icon: 'fa-solid fa-square' },
  };

  /* Jetons de couleur : un calque suit la palette de sa slide plutôt qu'une
     valeur figée, sinon changer de charte casserait tous les calques. */
  const COLOR_TOKENS = {
    fg:      { label: 'Texte principal', css: 'var(--fg)' },
    accent:  { label: 'Accent',          css: 'var(--accent)' },
    muted:   { label: 'Secondaire',      css: 'var(--muted)' },
    hl:      { label: 'Surbrillance',    css: 'var(--hl-bg)' },
    white:   { label: 'Blanc',           css: '#ffffff' },
    black:   { label: 'Noir',            css: '#111111' },
  };

  const colorCss = (token) => (COLOR_TOKENS[token] || COLOR_TOKENS.fg).css;

  let seq = 0;
  const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

  const DEFAULTS = {
    text:  { w: 46, h: 12, text: 'Votre texte', size: 40, weight: 800, color: 'fg', align: 'left', lineHeight: 1.15 },
    icon:  { w: 12, h: 12, icon: 'fa-solid fa-star', color: 'accent' },
    image: { w: 30, h: 22, src: null, radius: 0, fit: 'cover' },
    shape: { w: 34, h: 8,  color: 'accent', radius: 0, kind: 'rect' },
  };

  function makeLayer(type, over) {
    const t = TYPES[type] ? type : 'text';
    return Object.assign(
      { id: newId(), type: t, x: 12, y: 12, rot: 0, opacity: 1 },
      DEFAULTS[t],
      over || {}
    );
  }

  /* ------------------------------------------------------------------ */
  /* Aimantation                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Lignes de référence d'un axe, en pourcentages.
   * @param {'x'|'y'} axis
   * @param {{margin:number, cols:number, thirds:boolean}} opts
   * @param {Array<{x,y,w,h}>} others autres calques de la slide
   */
  function guideLines(axis, opts, others) {
    const o = opts || {};
    const lines = [
      { at: 0, kind: 'edge' },
      { at: 100, kind: 'edge' },
      { at: 50, kind: 'center' },
    ];

    const m = Number(o.margin) || 0;
    if (m > 0 && m < 50) {
      lines.push({ at: m, kind: 'margin' }, { at: 100 - m, kind: 'margin' });
    }

    if (o.thirds) {
      lines.push({ at: 100 / 3, kind: 'third' }, { at: 200 / 3, kind: 'third' });
    }

    // La grille en colonnes ne concerne que l'axe horizontal : c'est ainsi
    // qu'on raisonne en mise en page, les lignes n'ont pas d'équivalent régulier.
    const cols = Number(o.cols) || 0;
    if (axis === 'x' && cols > 1) {
      const inner = 100 - 2 * m;
      for (let i = 1; i < cols; i++) lines.push({ at: m + (inner * i) / cols, kind: 'grid' });
    }

    (others || []).forEach((r) => {
      if (axis === 'x') {
        lines.push({ at: r.x, kind: 'layer' }, { at: r.x + r.w / 2, kind: 'layer' }, { at: r.x + r.w, kind: 'layer' });
      } else {
        lines.push({ at: r.y, kind: 'layer' }, { at: r.y + r.h / 2, kind: 'layer' }, { at: r.y + r.h, kind: 'layer' });
      }
    });

    return lines;
  }

  /**
   * Cherche, pour les trois arêtes d'un axe (début, milieu, fin), la ligne de
   * référence la plus proche dans le seuil, et renvoie le décalage à appliquer.
   * @returns {{delta:number, guide:{at:number, kind:string}}|null}
   */
  function bestSnap(start, size, lines, threshold) {
    const edges = [start, start + size / 2, start + size];
    let best = null;

    for (const line of lines) {
      for (const edge of edges) {
        const d = line.at - edge;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
          best = { delta: d, guide: line };
        }
      }
    }
    return best;
  }

  /**
   * Aimante un rectangle en cours de déplacement.
   *
   * @param {{x,y,w,h}} rect position souhaitée, en %
   * @param {Array<{x,y,w,h}>} others autres calques
   * @param {{enabled:boolean, margin:number, cols:number, thirds:boolean,
   *          thresholdX:number, thresholdY:number}} opts seuils en % par axe
   * @returns {{x:number, y:number, guides:Array<{axis:'x'|'y', at:number, kind:string}>}}
   */
  function snapMove(rect, others, opts) {
    const o = opts || {};
    if (o.enabled === false) return { x: rect.x, y: rect.y, guides: [] };

    const guides = [];
    const sx = bestSnap(rect.x, rect.w, guideLines('x', o, others), o.thresholdX != null ? o.thresholdX : 1.2);
    const sy = bestSnap(rect.y, rect.h, guideLines('y', o, others), o.thresholdY != null ? o.thresholdY : 1.2);

    if (sx) guides.push({ axis: 'x', at: sx.guide.at, kind: sx.guide.kind });
    if (sy) guides.push({ axis: 'y', at: sy.guide.at, kind: sy.guide.kind });

    return {
      x: rect.x + (sx ? sx.delta : 0),
      y: rect.y + (sy ? sy.delta : 0),
      guides,
    };
  }

  /**
   * Aimante un redimensionnement par le coin bas-droit : seuls les bords
   * droit et bas bougent, l'origine reste fixe.
   */
  function snapResize(rect, others, opts) {
    const o = opts || {};
    const min = 3;
    let w = Math.max(min, rect.w);
    let h = Math.max(min, rect.h);
    if (o.enabled === false) return { w, h, guides: [] };

    const guides = [];
    const tx = o.thresholdX != null ? o.thresholdX : 1.2;
    const ty = o.thresholdY != null ? o.thresholdY : 1.2;

    const right = rect.x + w;
    const bottom = rect.y + h;
    const lx = guideLines('x', o, others).find((l) => Math.abs(l.at - right) <= tx);
    const ly = guideLines('y', o, others).find((l) => Math.abs(l.at - bottom) <= ty);

    if (lx) { w = Math.max(min, lx.at - rect.x); guides.push({ axis: 'x', at: lx.at, kind: lx.kind }); }
    if (ly) { h = Math.max(min, ly.at - rect.y); guides.push({ axis: 'y', at: ly.at, kind: ly.kind }); }

    return { w, h, guides };
  }

  /** Ramène un calque à l'intérieur du cadre, en gardant au moins un coin visible. */
  function clamp(rect) {
    return {
      x: Math.min(98, Math.max(-rect.w + 2, rect.x)),
      y: Math.min(98, Math.max(-rect.h + 2, rect.y)),
      w: Math.max(2, Math.min(200, rect.w)),
      h: Math.max(2, Math.min(200, rect.h)),
    };
  }

  return { TYPES, COLOR_TOKENS, DEFAULTS, colorCss, makeLayer, guideLines, bestSnap, snapMove, snapResize, clamp, newId };
});
