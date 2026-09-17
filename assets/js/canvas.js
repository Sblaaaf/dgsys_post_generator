/* =========================================================================
   canvas.js — Manipulation directe dans l'aperçu
   -------------------------------------------------------------------------
   Deux familles d'objets se manipulent de la même façon :

   - les CALQUES, ajoutés par-dessus le template, toujours en position libre ;
   - les ZONES du template (titre, contenu, annotation, logo), qui suivent la
     mise en page tant qu'on n'y touche pas. Les glisser les « détache » :
     elles prennent alors une position propre, et un bouton permet de les
     ré-ancrer.

   Tout est en pourcentages de la slide, jamais en pixels : l'aperçu est zoomé
   et le format d'export variable.

   Les repères, contours et poignées portent `editor-only` — l'exporteur les
   retire du clone avant capture.
   ========================================================================= */
window.DGCanvas = (function () {
  'use strict';

  const S = window.DGStore;
  const L = window.DGLayers;

  let hooks = { onChange: () => {}, onSelect: () => {} };
  let selected = null;   // { kind: 'layer'|'zone', key: string } ou null
  let drag = null;

  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function init(board, h) {
    hooks = Object.assign(hooks, h || {});
    board.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
  }

  const getSelected = () => selected;
  const isSelected = (kind, key) => !!selected && selected.kind === kind && selected.key === key;

  function setSelected(sel) {
    selected = sel && sel.key ? sel : null;
    hooks.onSelect(selected);
  }

  /* ---------------------------- Repères ---------------------------- */

  function renderGuideOverlay(g) {
    if (!g || !g.show) return '';
    let out = '<div class="guides editor-only" aria-hidden="true">';
    if (g.margin > 0) out += `<div class="guides__safe" style="inset:${g.margin}% ${g.margin}%"></div>`;
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

  /* ---------------------------- Décorations ---------------------------- */

  function decorate(slideEl) {
    $$('.layer, .zone', slideEl).forEach((el) => {
      const kind = el.classList.contains('layer') ? 'layer' : 'zone';
      const key = kind === 'layer' ? el.dataset.layer : el.dataset.zone;
      const on = isSelected(kind, key);
      el.dataset.selected = String(on);
      $$('.layer__handle, .zone__handle', el).forEach((n) => n.remove());
      // Le redimensionnement n'a de sens qu'une fois l'objet détaché du flux.
      const resizable = kind === 'layer' || el.classList.contains('zone--free');
      if (on && resizable) {
        const h = document.createElement('div');
        h.className = (kind === 'layer' ? 'layer__handle' : 'zone__handle') + ' editor-only';
        h.dataset.resize = '1';
        el.appendChild(h);
      }
    });
  }

  const refresh = () => $$('#board .slide').forEach(decorate);

  /* ---------------------------- Géométrie ---------------------------- */

  const slideIndexOf = (el) => {
    const frame = el.closest('.frame');
    return frame ? Array.from(frame.parentNode.children).indexOf(frame) : -1;
  };

  /** Rectangle d'un élément en % de la slide, mesuré à l'écran. */
  function measure(el, slideRect) {
    const r = el.getBoundingClientRect();
    return {
      x: ((r.left - slideRect.left) / slideRect.width) * 100,
      y: ((r.top - slideRect.top) / slideRect.height) * 100,
      w: (r.width / slideRect.width) * 100,
      h: (r.height / slideRect.height) * 100,
    };
  }

  /** Rectangles des autres objets de la slide, pour l'aimantation. */
  function siblings(slideEl, slideRect, skipEl) {
    return $$('.layer, .zone', slideEl)
      .filter((n) => n !== skipEl && !n.contains(skipEl) && !skipEl.contains(n))
      .map((n) => measure(n, slideRect));
  }

  /* ---------------------------- Interaction ---------------------------- */

  function onPointerDown(e) {
    const slideEl = e.target.closest('.slide');
    if (!slideEl) return;

    const el = e.target.closest('.layer') || e.target.closest('.zone');
    if (!el) {
      if (selected) { setSelected(null); refresh(); }
      return;
    }

    const kind = el.classList.contains('layer') ? 'layer' : 'zone';
    const key = kind === 'layer' ? el.dataset.layer : el.dataset.zone;
    const idx = slideIndexOf(slideEl);
    if (idx < 0 || !S.get().slides[idx]) return;

    e.preventDefault();
    if (!isSelected(kind, key)) { setSelected({ kind, key }); refresh(); }

    const slideRect = slideEl.getBoundingClientRect();
    const free = kind === 'layer' || el.classList.contains('zone--free');

    drag = {
      idx, kind, key, el, slideEl,
      resizing: !!e.target.closest('[data-resize]'),
      // Une zone encore dans le flux ne réagit pas à `left`/`top` : on la
      // déplace visuellement par `transform`, et c'est le commit final qui
      // la détache réellement.
      useTransform: !free,
      startX: e.clientX, startY: e.clientY,
      rect0: measure(el, slideRect),
      others: siblings(slideEl, slideRect, el),
      pxW: slideRect.width, pxH: slideRect.height,
      localPerPx: S.get().format.w / slideRect.width,
      moved: false,
    };

    el.setPointerCapture(e.pointerId);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp, { once: true });
    el.addEventListener('pointercancel', onPointerUp, { once: true });
  }

  function onPointerMove(e) {
    if (!drag) return;
    const dx = ((e.clientX - drag.startX) / drag.pxW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.pxH) * 100;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 0.15) return;
    drag.moved = true;

    const st = S.get();
    const g = st.options.guides || {};
    const opts = {
      // Alt suspend l'aimantation le temps du geste : convention des
      // éditeurs graphiques, plus pratique qu'un réglage à décocher.
      enabled: g.snap !== false && !e.altKey,
      margin: g.margin || 0,
      cols: g.cols || 0,
      thirds: !!g.thirds,
      thresholdX: (8 / drag.pxW) * 100,
      thresholdY: (8 / drag.pxH) * 100,
    };

    const r0 = drag.rect0;
    let next;
    if (drag.resizing) {
      const r = L.snapResize({ x: r0.x, y: r0.y, w: r0.w + dx, h: r0.h + dy }, drag.others, opts);
      next = { x: r0.x, y: r0.y, w: r.w, h: r.h, guides: r.guides };
    } else {
      const r = L.snapMove({ x: r0.x + dx, y: r0.y + dy, w: r0.w, h: r0.h }, drag.others, opts);
      next = { x: r.x, y: r.y, w: r0.w, h: r0.h, guides: r.guides };
    }

    const c = L.clamp(next);
    if (drag.useTransform) {
      const lx = ((c.x - r0.x) / 100) * st.format.w;
      const ly = ((c.y - r0.y) / 100) * st.format.h;
      drag.el.style.transform = `translate(${lx}px, ${ly}px)`;
    } else {
      drag.el.style.left = c.x + '%';
      drag.el.style.top = c.y + '%';
      if (drag.resizing) {
        drag.el.style.width = c.w + '%';
        const isBox = drag.kind === 'layer'
          && !drag.el.classList.contains('layer--text') && !drag.el.classList.contains('layer--icon');
        if (isBox) drag.el.style.height = c.h + '%';
      }
    }
    drag.next = c;
    paintSnapGuides(drag.slideEl, next.guides);
  }

  function onPointerUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.el.removeEventListener('pointermove', onPointerMove);
    $$('.snap-guide', d.slideEl).forEach((n) => n.remove());
    if (!d.moved || !d.next) { d.el.style.transform = ''; return; }

    S.commit((s) => {
      const slide = s.slides[d.idx];
      if (!slide) return;
      if (d.kind === 'layer') {
        const l = (slide.layers || []).find((x) => x.id === d.key);
        if (!l) return;
        l.x = round(d.next.x); l.y = round(d.next.y);
        if (d.resizing) { l.w = round(d.next.w); l.h = round(d.next.h); }
      } else {
        const prev = slide.zones[d.key];
        slide.zones[d.key] = {
          x: round(d.next.x),
          y: round(d.next.y),
          w: round(d.resizing ? d.next.w : (prev ? prev.w : d.rect0.w)),
        };
      }
    });
    hooks.onChange();
  }

  const round = (n) => Math.round(n * 100) / 100;

  /* ---------------------------- Clavier ---------------------------- */

  function onKeyDown(e) {
    if (!selected) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;

    const st = S.get();
    let idx = -1;
    st.slides.forEach((s, i) => {
      if (selected.kind === 'layer'
        ? (s.layers || []).some((l) => l.id === selected.key)
        : Object.prototype.hasOwnProperty.call(s.zones || {}, selected.key)) idx = i;
    });
    if (idx < 0) return;   // zone encore ancrée : rien à déplacer au clavier

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      S.commit((s) => {
        if (selected.kind === 'layer') {
          s.slides[idx].layers = s.slides[idx].layers.filter((l) => l.id !== selected.key);
        } else {
          delete s.slides[idx].zones[selected.key];   // supprimer une zone = la ré-ancrer
        }
      });
      setSelected(null);
      hooks.onChange();
      return;
    }

    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    const amount = e.shiftKey ? 2 : 0.25;
    S.commit((s) => {
      const t = selected.kind === 'layer'
        ? s.slides[idx].layers.find((x) => x.id === selected.key)
        : s.slides[idx].zones[selected.key];
      if (!t) return;
      t.x = round(t.x + step[0] * amount);
      t.y = round(t.y + step[1] * amount);
    });
    hooks.onChange();
  }

  return { init, renderGuideOverlay, refresh, setSelected, getSelected, isSelected };
})();
