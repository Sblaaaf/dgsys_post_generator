/* =========================================================================
   dnd.js — Glisser-déposer
   -------------------------------------------------------------------------
   Deux usages :
   1. Réordonner les slides en tirant la poignée d'une carte.
   2. Déposer un fichier image directement sur une slide de l'aperçu.

   Le glisser-déposer natif HTML5 n'est pas utilisable au clavier : les
   boutons monter/descendre restent donc en place. Ce n'est pas une
   redondance, c'est la seule façon de rendre le réordonnancement
   accessible (WCAG 2.1.1, « Clavier »).
   ========================================================================= */
window.DGDnd = (function () {
  'use strict';

  /* --------------------- Réordonnancement des slides --------------------- */

  /**
   * @param {HTMLElement} list conteneur direct des cartes
   * @param {{itemSelector: string, onMove: (fromIndex:number, toIndex:number) => void}} opts
   */
  function initList(list, opts) {
    const sel = opts.itemSelector;
    let dragged = null;
    let marker = null;

    const cards = () => Array.from(list.querySelectorAll(sel));

    function showMarker(before) {
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'drop-marker';
        marker.setAttribute('aria-hidden', 'true');
      }
      if (before) list.insertBefore(marker, before);
      else list.appendChild(marker);
    }

    function clearMarker() {
      if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
    }

    list.addEventListener('dragstart', (e) => {
      const handle = e.target.closest('[data-drag-handle]');
      if (!handle) { e.preventDefault(); return; }
      dragged = handle.closest(sel);
      if (!dragged) return;
      dragged.dataset.dragging = 'true';
      e.dataTransfer.effectAllowed = 'move';
      // Firefox exige une donnée pour amorcer le glisser.
      e.dataTransfer.setData('text/plain', 'slide');
      e.dataTransfer.setDragImage(dragged, 20, 20);
    });

    list.addEventListener('dragover', (e) => {
      if (!dragged) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const after = cards().find((c) => {
        if (c === dragged) return false;
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      showMarker(after || null);
    });

    list.addEventListener('dragleave', (e) => {
      if (!list.contains(e.relatedTarget)) clearMarker();
    });

    list.addEventListener('drop', (e) => {
      if (!dragged) return;
      e.preventDefault();
      const all = cards();
      const from = all.indexOf(dragged);
      // Position d'insertion = index du repère parmi les cartes restantes
      let to = 0;
      const nodes = Array.from(list.children).filter((n) => n.matches(sel) || n === marker);
      to = nodes.indexOf(marker);
      if (to < 0) to = all.length;
      else if (to > from) to -= 1; // la carte tirée quitte sa place
      clearMarker();
      dragged.removeAttribute('data-dragging');
      const el = dragged;
      dragged = null;
      if (from >= 0 && to >= 0 && from !== to) opts.onMove(from, to);
      else el.removeAttribute('data-dragging');
    });

    list.addEventListener('dragend', () => {
      clearMarker();
      if (dragged) dragged.removeAttribute('data-dragging');
      dragged = null;
    });
  }

  /* --------------------- Dépôt d'images sur l'aperçu --------------------- */

  const hasFiles = (e) =>
    e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

  /**
   * @param {HTMLElement} board
   * @param {{frameSelector: string, onDrop: (frame: HTMLElement, file: File) => void}} opts
   */
  function initDropZone(board, opts) {
    let depth = 0;

    board.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      const frame = e.target.closest(opts.frameSelector);
      if (frame) frame.dataset.dropTarget = 'true';
    });

    board.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      board.querySelectorAll('[data-drop-target]').forEach((f) => f.removeAttribute('data-drop-target'));
      const frame = e.target.closest(opts.frameSelector);
      if (frame) frame.dataset.dropTarget = 'true';
    });

    board.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) board.querySelectorAll('[data-drop-target]').forEach((f) => f.removeAttribute('data-drop-target'));
    });

    board.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      board.querySelectorAll('[data-drop-target]').forEach((f) => f.removeAttribute('data-drop-target'));
      const frame = e.target.closest(opts.frameSelector);
      const file = Array.from(e.dataTransfer.files || []).find((f) => /^image\//.test(f.type));
      if (frame && file) opts.onDrop(frame, file);
      else if (!file) window.DGToast('Déposez un fichier image (JPG, PNG, WebP).', 'error');
    });
  }

  return { initList, initDropZone };
})();
