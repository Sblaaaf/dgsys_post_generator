/* =========================================================================
   canvas.js — Manipulation directe des calques dans l'aperçu
   -------------------------------------------------------------------------
   Déplacement et redimensionnement à la souris, avec aimantation et repères.
   Tout est exprimé en pourcentages de la slide : la position reste correcte
   quel que soit le zoom de l'aperçu ou le format d'export.

   Les repères, le contour de sélection et les poignées portent la classe
   `editor-only` : l'exporteur les retire du clone avant capture, ils
   n'apparaissent donc jamais dans un fichier.

   Accessibilité : un calque sélectionné se déplace aussi aux flèches du
   clavier (Maj pour un pas large), et se supprime avec Suppr.
   ========================================================================= */
window.DGCanvas = (function () {
  'use strict';

  const S = window.DGStore;
  const L = window.DGLayers;

  let hooks = { onChange: () => {}, onSelect: () => {} };
  let selected = null;   // id du calque sélectionné
  let drag = null;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function init(board, h) {
    hooks = Object.assign(hooks, h || {});
    board.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
  }

  const setSelected = (id) => { selected = id; hooks.onSelect(id); };
  const getSelected = () => selected;

  /* --------------------------- Repères permanents --------------------------- */

  /**
   * Trame affichée en continu (grille, marges, tiers) : purement visuelle,
   * elle n'a pas d'incidence sur l'aimantation, qui reste toujours active
   * selon le réglage `snap`.
   */
  function renderGuideOverlay(g) {
    if (!g || !g.show) return '';
    let out = '<div class="guides editor-only" aria-hidden="true">';
    if (g.margin > 0) {
      out += `<div class="guides__safe" style="inset:${g.margin}% ${g.margin}%"></div>`;
    }
    out += '<div class="guides__line guides__line--center-x" style="left:50%"></div>';
    out += '<div class="guides__line guides__line--center-y" style="top:50%"></div>';
    if (g.thirds) {
      [100 / 3, 200 / 3].forEach((p) => {
        out += `<div class="guides__line guides__line--third" style="left:${p}%"></div>`;
        out += `<div class="guides__line guides__line--third guides__line--h" style="top:${p}%"></div>`;
      });
    }
    if (g.cols > 1) {
      const inner = 100 - 2 * (g.margin || 0);
      for (let i = 1; i < g.cols; i++) {
        out += `<div class="guides__line guides__line--grid" style="left:${(g.margin || 0) + (inner * i) / g.cols}%"></div>`;
      }
    }
    return out + '</div>';
  }

  /** Repères actifs, affichés le temps d'un déplacement. */
  function paintSnapGuides(slideEl, guides) {
    $$('.snap-guide', slideEl).forEach((n) => n.remove());
    guides.forEach((g) => {
      const d = document.createElement('div');
      d.className = `snap-guide snap-guide--${g.kind} editor-only`;
      d.setAttribute('aria-hidden', 'true');
      if (g.axis === 'x') d.style.left = g.at + '%';
      else { d.style.top = g.at + '%'; d.classList.add('snap-guide--h'); }
      slideEl.appendChild(d);
    });
  }

  /* --------------------------- Sélection et décorations --------------------------- */

  function decorate(slideEl) {
    $$('.layer', slideEl).forEach((el) => {
      const on = el.dataset.layer === selected;
      el.dataset.selected = String(on);
      $$('.layer__handle', el).forEach((n) => n.remove());
      if (on) {
        const h = document.createElement('div');
        h.className = 'layer__handle editor-only';
        h.dataset.resize = '1';
        el.appendChild(h);
      }
    });
  }

  function refresh() {
    $$('#board .slide').forEach(decorate);
  }

  /* --------------------------- Interaction --------------------------- */

  function slideIndexOf(el) {
    const frame = el.closest('.frame');
    return frame ? Array.from(frame.parentNode.children).indexOf(frame) : -1;
  }

  function onPointerDown(e) {
    const layerEl = e.target.closest('.layer');
    const slideEl = e.target.closest('.slide');
    if (!slideEl) return;

    if (!layerEl) {                       // clic dans le vide : on désélectionne
      if (selected) { setSelected(null); refresh(); }
      return;
    }

    const idx = slideIndexOf(slideEl);
    const slide = S.get().slides[idx];
    if (!slide) return;
    const layer = (slide.layers || []).find((l) => l.id === layerEl.dataset.layer);
    if (!layer) return;

    e.preventDefault();
    if (selected !== layer.id) { setSelected(layer.id); refresh(); }

    // Échelle réelle de l'aperçu : indispensable pour convertir des pixels
    // écran en pourcentages de slide.
    const rect = slideEl.getBoundingClientRect();
    const resizing = !!e.target.closest('[data-resize]');

    drag = {
      idx, slideEl, layerEl, id: layer.id, resizing,
      startX: e.clientX, startY: e.clientY,
      rect0: { x: layer.x, y: layer.y, w: layer.w, h: measuredH(layerEl, rect) },
      pxW: rect.width, pxH: rect.height,
      moved: false,
    };
    layerEl.setPointerCapture(e.pointerId);
    layerEl.addEventListener('pointermove', onPointerMove);
    layerEl.addEventListener('pointerup', onPointerUp, { once: true });
    layerEl.addEventListener('pointercancel', onPointerUp, { once: true });
  }

  /** Les calques texte et icône ont une hauteur automatique : on la mesure. */
  function measuredH(layerEl, slideRect) {
    const r = layerEl.getBoundingClientRect();
    return slideRect.height ? (r.height / slideRect.height) * 100 : 10;
  }

  function onPointerMove(e) {
    if (!drag) return;
    const dx = ((e.clientX - drag.startX) / drag.pxW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.pxH) * 100;
    if (Math.abs(dx) + Math.abs(dy) < 0.05) return;
    drag.moved = true;

    const st = S.get();
    const slide = st.slides[drag.idx];
    const others = (slide.layers || []).filter((l) => l.id !== drag.id).map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h }));

    // Alt (ou Option) suspend momentanément l'aimantation — convention
    // partagée par la plupart des éditeurs graphiques.
    const g = st.options.guides || {};
    const opts = {
      enabled: g.snap !== false && !e.altKey,
      margin: g.margin || 0,
      cols: g.cols || 0,
      thirds: !!g.thirds,
      thresholdX: (8 / drag.pxW) * 100,
      thresholdY: (8 / drag.pxH) * 100,
    };

    let next;
    if (drag.resizing) {
      const r = L.snapResize({ x: drag.rect0.x, y: drag.rect0.y, w: drag.rect0.w + dx, h: drag.rect0.h + dy }, others, opts);
      next = { x: drag.rect0.x, y: drag.rect0.y, w: r.w, h: r.h, guides: r.guides };
    } else {
      const r = L.snapMove({ x: drag.rect0.x + dx, y: drag.rect0.y + dy, w: drag.rect0.w, h: drag.rect0.h }, others, opts);
      next = { x: r.x, y: r.y, w: drag.rect0.w, h: drag.rect0.h, guides: r.guides };
    }

    const c = L.clamp(next);
    // Retour visuel immédiat sans repasser par un rendu complet : à 60 images
    // par seconde, reconstruire le DOM serait perceptible.
    drag.layerEl.style.left = c.x + '%';
    drag.layerEl.style.top = c.y + '%';
    if (drag.resizing) {
      drag.layerEl.style.width = c.w + '%';
      if (!drag.layerEl.classList.contains('layer--text') && !drag.layerEl.classList.contains('layer--icon')) {
        drag.layerEl.style.height = c.h + '%';
      }
    }
    drag.next = c;
    paintSnapGuides(drag.slideEl, next.guides);
  }

  function onPointerUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.layerEl.removeEventListener('pointermove', onPointerMove);
    $$('.snap-guide', d.slideEl).forEach((n) => n.remove());
    if (!d.moved || !d.next) return;

    S.commit((s) => {
      const l = (s.slides[d.idx].layers || []).find((x) => x.id === d.id);
      if (!l) return;
      l.x = round(d.next.x); l.y = round(d.next.y);
      if (d.resizing) { l.w = round(d.next.w); l.h = round(d.next.h); }
    });
    hooks.onChange();
  }

  const round = (n) => Math.round(n * 100) / 100;

  /* --------------------------- Clavier --------------------------- */

  function onKeyDown(e) {
    if (!selected) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;

    const st = S.get();
    let idx = -1;
    st.slides.forEach((s, i) => { if ((s.layers || []).some((l) => l.id === selected)) idx = i; });
    if (idx < 0) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      S.commit((s) => {
        s.slides[idx].layers = s.slides[idx].layers.filter((l) => l.id !== selected);
      });
      setSelected(null);
      hooks.onChange();
      return;
    }

    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    const amount = e.shiftKey ? 2 : 0.25;   // en % de la slide
    S.commit((s) => {
      const l = s.slides[idx].layers.find((x) => x.id === selected);
      if (!l) return;
      l.x = round(l.x + step[0] * amount);
      l.y = round(l.y + step[1] * amount);
    });
    hooks.onChange();
  }

  return { init, renderGuideOverlay, refresh, setSelected, getSelected };
})();
