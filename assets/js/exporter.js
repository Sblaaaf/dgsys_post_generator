/* =========================================================================
   exporter.js — Capture et export des slides
   -------------------------------------------------------------------------
   Principe : on ne capture jamais la slide affichée (elle est zoomée par un
   `transform` parent, ce qui produirait une image floue). On la CLONE dans un
   conteneur hors écran, à l'échelle 1:1 de ses dimensions d'export, et c'est
   ce clone que html2canvas rastérise.
   ========================================================================= */
window.DGExport = (function () {
  'use strict';

  /* Les polices doivent être réellement chargées avant la capture, sinon
     html2canvas rastérise des glyphes de repli (carrés vides pour FontAwesome). */
  async function ensureFonts() {
    if (!document.fonts) return;
    const faces = [
      '900 40px "Font Awesome 6 Free"',
      '400 40px "Font Awesome 6 Free"',
      '900 40px Inter', '800 40px Inter', '700 40px Inter', '600 40px Inter', '400 40px Inter',
      '700 40px Caveat',
    ];
    await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
  }

  function host() {
    let el = document.getElementById('capture-host');
    if (!el) {
      el = document.createElement('div');
      el.id = 'capture-host';
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * Rastérise un élément .slide.
   * @param {HTMLElement} slideEl
   * @param {number} scale 1 = taille native (1080px), 2 = double définition
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function capture(slideEl, scale) {
    if (typeof html2canvas !== 'function') {
      throw new Error("html2canvas n'est pas chargé — vérifiez votre connexion au CDN.");
    }
    await ensureFonts();

    const h = host();
    const clone = slideEl.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.margin = '0';
    // Les décorations d'édition (repères, contours, poignées) vivent dans la
    // slide pour se positionner simplement, mais ne doivent jamais être
    // rastérisées. On les retire du clone, pas de l'original.
    clone.querySelectorAll('.editor-only').forEach((n) => n.remove());
    clone.querySelectorAll('[data-selected]').forEach((n) => n.removeAttribute('data-selected'));
    h.innerHTML = '';
    h.appendChild(clone);

    const w = clone.offsetWidth;
    const ht = clone.offsetHeight;

    try {
      return await html2canvas(clone, {
        scale: scale || 1,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        width: w,
        height: ht,
        windowWidth: w,
        windowHeight: ht,
        imageTimeout: 15000,
      });
    } finally {
      h.innerHTML = '';
    }
  }

  const canvasToBlob = (canvas, type, quality) =>
    new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Conversion impossible'))), type || 'image/png', quality));

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const slug = (s) =>
    String(s || 'carrousel').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'carrousel';

  /* ------------------------------ PNG ------------------------------ */

  async function png(slideEl, name, opts) {
    const o = opts || {};
    const canvas = await capture(slideEl, o.scale || 1);
    const type = o.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await canvasToBlob(canvas, type, 0.92);
    download(blob, `${name}.${o.format === 'jpeg' ? 'jpg' : 'png'}`);
  }

  /* ------------------------------ ZIP ------------------------------ */

  async function zip(slideEls, baseName, opts, onProgress) {
    if (typeof JSZip !== 'function') throw new Error("JSZip n'est pas chargé.");
    const o = opts || {};
    const z = new JSZip();
    const ext = o.format === 'jpeg' ? 'jpg' : 'png';
    const type = o.format === 'jpeg' ? 'image/jpeg' : 'image/png';

    for (let i = 0; i < slideEls.length; i++) {
      if (onProgress) onProgress(i + 1, slideEls.length);
      const canvas = await capture(slideEls[i], o.scale || 1);
      const blob = await canvasToBlob(canvas, type, 0.92);
      z.file(`${String(i + 1).padStart(2, '0')}-${baseName}.${ext}`, blob);
    }
    const out = await z.generateAsync({ type: 'blob' });
    download(out, `${baseName}.zip`);
  }

  /* ------------------------------ PDF ------------------------------
     LinkedIn accepte les carrousels au format PDF : une page = une slide,
     aux dimensions exactes, sans marge. */

  async function pdf(slideEls, baseName, opts, onProgress) {
    const ctor = window.jspdf && window.jspdf.jsPDF;
    if (!ctor) throw new Error("jsPDF n'est pas chargé.");
    const o = opts || {};
    let doc = null;

    for (let i = 0; i < slideEls.length; i++) {
      if (onProgress) onProgress(i + 1, slideEls.length);
      const canvas = await capture(slideEls[i], o.scale || 1);
      const w = canvas.width;
      const h = canvas.height;
      const data = canvas.toDataURL('image/jpeg', 0.92);
      if (!doc) {
        doc = new ctor({ unit: 'px', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
      } else {
        doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
      }
      doc.addImage(data, 'JPEG', 0, 0, w, h);
    }
    if (doc) doc.save(`${baseName}.pdf`);
  }

  /* ------------------------------ JSON ------------------------------ */

  function json(state, baseName) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    download(blob, `${baseName}.json`);
  }

  function readJSONFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        try { res(JSON.parse(r.result)); } catch (e) { rej(new Error('Fichier JSON illisible.')); }
      };
      r.onerror = () => rej(new Error('Lecture impossible.'));
      r.readAsText(file);
    });
  }

  /* --------------------- Import d'image redimensionné ---------------------
     On borne le côté le plus long à 1800 px : au-delà, c'est du poids inutile
     (les slides font 1080 px de large) et localStorage sature très vite. */

  function readImageFile(file, maxSide) {
    const limit = maxSide || 1800;
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('Format non reconnu.'));
      const reader = new FileReader();
      reader.onerror = () => rej(new Error('Lecture impossible.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('Image invalide.'));
        img.onload = () => {
          const ratio = Math.min(1, limit / Math.max(img.width, img.height));
          if (ratio === 1 && file.size < 900 * 1024) return res(reader.result);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * ratio);
          c.height = Math.round(img.height * ratio);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  return { capture, png, zip, pdf, json, readJSONFile, readImageFile, download, slug, ensureFonts };
})();
