/* =========================================================================
   stock.js — Recherche d'images dans des banques libres
   -------------------------------------------------------------------------
   Contrainte majeure : une image affichée depuis une URL distante « teinte »
   le canvas et rend l'export impossible (toDataURL lève une SecurityError).
   Toute image choisie est donc immédiatement téléchargée, redimensionnée et
   convertie en data: URL. Elle devient partie intégrante du projet — ce qui
   rend aussi l'export reproductible hors ligne.

   Les clés d'API sont rangées à part de l'état du projet : un .json exporté
   ou partagé ne doit jamais contenir de secret.
   ========================================================================= */
window.DGStock = (function () {
  'use strict';

  const KEY_STORE = 'dgsys.stock.keys';

  const SOURCES = {
    openverse: {
      label: 'Openverse',
      needsKey: false,
      note: 'Sans inscription. Images sous licence libre (Wikimedia, Flickr…). '
          + 'Les fichiers venant de serveurs tiers ne sont pas toujours téléchargeables '
          + 'depuis un navigateur : le cas échéant, l’application le signale.',
      signup: 'https://openverse.org',
    },
    pexels: {
      label: 'Pexels',
      needsKey: true,
      note: 'Clé gratuite en 2 minutes. Photos libres de droits, téléchargement fiable.',
      signup: 'https://www.pexels.com/api/',
    },
    unsplash: {
      label: 'Unsplash',
      needsKey: true,
      note: 'Clé gratuite (« Access Key » d’une application demo). '
          + 'L’attribution du photographe est exigée par leur licence.',
      signup: 'https://unsplash.com/developers',
    },
  };

  /* ---------------------------- Clés ---------------------------- */

  function keys() {
    try { return JSON.parse(localStorage.getItem(KEY_STORE) || '{}'); }
    catch (e) { return {}; }
  }
  function getKey(source) { return keys()[source] || ''; }
  function setKey(source, value) {
    const k = keys();
    if (value) k[source] = value; else delete k[source];
    try { localStorage.setItem(KEY_STORE, JSON.stringify(k)); } catch (e) { /* quota */ }
  }

  /* ---------------------------- Recherche ---------------------------- */

  async function json(url, headers) {
    const r = await fetch(url, { headers: headers || {} });
    if (r.status === 401 || r.status === 403) throw new Error('Clé refusée par la banque d’images.');
    if (r.status === 429) throw new Error('Quota atteint pour cette banque, réessayez plus tard.');
    if (!r.ok) throw new Error(`La banque d’images a répondu ${r.status}.`);
    return r.json();
  }

  const PER_PAGE = 24;

  /**
   * @param {'openverse'|'pexels'|'unsplash'} source
   * @param {string} query
   * @param {number} page 1-indexé
   * @returns {Promise<Array<{thumb, full, w, h, credit}>>}
   */
  async function search(source, query, page) {
    const q = encodeURIComponent(String(query || '').trim());
    if (!q) return [];
    const p = Math.max(1, Number(page) || 1);

    if (source === 'pexels') {
      const key = getKey('pexels');
      if (!key) throw new Error('Renseignez votre clé Pexels.');
      const d = await json(
        `https://api.pexels.com/v1/search?query=${q}&per_page=${PER_PAGE}&page=${p}&orientation=portrait`,
        { Authorization: key });
      return (d.photos || []).map((ph) => ({
        thumb: ph.src.medium,
        full: ph.src.large2x || ph.src.large,
        w: ph.width, h: ph.height,
        credit: { author: ph.photographer, url: ph.url, source: 'Pexels' },
      }));
    }

    if (source === 'unsplash') {
      const key = getKey('unsplash');
      if (!key) throw new Error('Renseignez votre Access Key Unsplash.');
      const d = await json(
        `https://api.unsplash.com/search/photos?query=${q}&per_page=${PER_PAGE}&page=${p}&orientation=portrait`,
        { Authorization: `Client-ID ${key}` });
      return (d.results || []).map((ph) => ({
        thumb: ph.urls.small,
        full: ph.urls.regular,
        w: ph.width, h: ph.height,
        credit: { author: ph.user && ph.user.name, url: ph.links && ph.links.html, source: 'Unsplash' },
      }));
    }

    // Openverse : pas de clé, mais les fichiers sont hébergés par des tiers
    const d = await json(
      `https://api.openverse.org/v1/images/?q=${q}&page_size=${PER_PAGE}&page=${p}&license_type=all-cc&mature=false`);
    return (d.results || []).map((im) => ({
      thumb: im.thumbnail || im.url,
      full: im.url,
      w: im.width, h: im.height,
      credit: { author: im.creator || 'Auteur inconnu', url: im.foreign_landing_url, source: `Openverse · ${im.license || 'CC'}` },
    }));
  }

  /* ---------------------------- Téléchargement ---------------------------- */

  /**
   * Télécharge une image distante et la convertit en data: URL redimensionnée.
   * Un échec ici est presque toujours un refus CORS du serveur d'origine :
   * l'image s'afficherait, mais l'export planterait plus tard. Mieux vaut
   * échouer maintenant, avec un message actionnable.
   */
  async function fetchAsDataURL(url, maxSide) {
    let blob;
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      blob = await r.blob();
    } catch (e) {
      throw new Error(
        'Ce serveur refuse le téléchargement depuis un navigateur (CORS). '
        + 'Enregistrez l’image manuellement, puis importez-la avec « Importer une image ».');
    }
    if (!/^image\//.test(blob.type)) throw new Error('Le fichier reçu n’est pas une image.');
    return window.DGExport.readImageFile(blob, maxSide || 1800);
  }

  return { SOURCES, search, fetchAsDataURL, getKey, setKey };
})();
