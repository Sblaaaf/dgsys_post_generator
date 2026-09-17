/* =========================================================================
   store.js — État applicatif, historique, persistance
   -------------------------------------------------------------------------
   Un seul objet `state` décrit intégralement un carrousel. Il est
   sérialisable en JSON : c'est ce qu'on exporte, importe et sauvegarde.
   Toute mutation passe par commit() → historique + autosave + notification.
   ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DGStore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'dgsys.carousel.v1';
  const SCHEMA_VERSION = 1;

  /* ---------- Formats d'export ---------- */
  const FORMATS = {
    'ig-portrait':  { label: 'Instagram / LinkedIn portrait (4:5)', w: 1080, h: 1350 },
    'ig-square':    { label: 'Carré (1:1)',                         w: 1080, h: 1080 },
    'story':        { label: 'Story / Reels / TikTok (9:16)',        w: 1080, h: 1920 },
    'li-landscape': { label: 'LinkedIn paysage (16:9)',              w: 1920, h: 1080 },
    'pinterest':    { label: 'Pinterest (2:3)',                      w: 1000, h: 1500 },
  };

  /* ---------- Chartes prêtes à l'emploi ---------- */
  const BRAND_PRESETS = {
    dgsys:   { label: 'DGsys',      colors: { primary: '#26366C', accent: '#1DAFE9', light: '#E1E4FA', muted: '#7484BE', paper: '#FFFFFF', ink: '#26366C' } },
    forest:  { label: 'Forêt',      colors: { primary: '#14352A', accent: '#4CC38A', light: '#DFF3E9', muted: '#6E8C80', paper: '#FFFFFF', ink: '#14352A' } },
    sunset:  { label: 'Coucher',    colors: { primary: '#2B1B3D', accent: '#FF7A4D', light: '#FCE6DC', muted: '#8A7699', paper: '#FFF9F6', ink: '#2B1B3D' } },
    mono:    { label: 'Monochrome', colors: { primary: '#111111', accent: '#FFD400', light: '#EFEFEF', muted: '#777777', paper: '#FFFFFF', ink: '#111111' } },
    ocean:   { label: 'Océan',      colors: { primary: '#063045', accent: '#00B3C7', light: '#D9F1F5', muted: '#5C8496', paper: '#F7FDFE', ink: '#063045' } },
  };

  /* ---------- Icônes proposées (FontAwesome 6 Free — usage gratuit) ---------- */
  const ICONS = [
    'fa-solid fa-check', 'fa-solid fa-xmark', 'fa-solid fa-star', 'fa-solid fa-bolt',
    'fa-solid fa-percent', 'fa-solid fa-euro-sign', 'fa-solid fa-chart-simple', 'fa-solid fa-chart-line',
    'fa-solid fa-clock', 'fa-solid fa-calendar-days', 'fa-solid fa-boxes-stacked', 'fa-solid fa-truck',
    'fa-solid fa-wheat-awn', 'fa-solid fa-bread-slice', 'fa-solid fa-utensils', 'fa-solid fa-temperature-half',
    'fa-solid fa-users', 'fa-solid fa-user-tie', 'fa-solid fa-handshake', 'fa-solid fa-comments',
    'fa-solid fa-lightbulb', 'fa-solid fa-rocket', 'fa-solid fa-bullseye', 'fa-solid fa-trophy',
    'fa-solid fa-gear', 'fa-solid fa-sliders', 'fa-solid fa-wrench', 'fa-solid fa-screwdriver-wrench',
    'fa-solid fa-mobile-screen', 'fa-solid fa-laptop', 'fa-solid fa-cloud', 'fa-solid fa-database',
    'fa-solid fa-lock', 'fa-solid fa-shield-halved', 'fa-solid fa-eye', 'fa-solid fa-magnifying-glass',
    'fa-solid fa-triangle-exclamation', 'fa-solid fa-circle-info', 'fa-solid fa-thumbs-up', 'fa-solid fa-heart',
    'fa-solid fa-arrow-trend-up', 'fa-solid fa-arrow-trend-down', 'fa-solid fa-arrow-right', 'fa-solid fa-arrow-turn-down',
    'fa-solid fa-recycle', 'fa-solid fa-leaf', 'fa-solid fa-seedling', 'fa-solid fa-scale-balanced',
    'fa-solid fa-file-invoice', 'fa-solid fa-receipt', 'fa-solid fa-cart-shopping', 'fa-solid fa-store',
    'fa-solid fa-warehouse', 'fa-solid fa-clipboard-check', 'fa-solid fa-list-check', 'fa-solid fa-table-list',
  ];

  let uid = 0;
  const newId = () => `s${Date.now().toString(36)}${(uid++).toString(36)}`;

  /* ---------- Fabriques ---------- */

  function makeItem(over) {
    return Object.assign({ icon: 'fa-solid fa-check', title: '', sub: '' }, over || {});
  }

  function makeSlide(layout, over) {
    const base = {
      id: newId(),
      layout: layout || 'list',
      visible: true,
      palette: 'light',
      eyebrow: '',
      title: '',
      subtitle: '',
      bignum: '',
      cta: '',
      note: '',
      items: [],
      image: { src: null, overlay: 0.6, pos: 'center', zoom: 1, gradient: false, credit: null },
      style: { titleScale: 1, bodyScale: 1, titleWeight: 900, align: 'left', iconShape: 'circle' },
    };
    return deepMerge(base, over || {});
  }

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      name: 'Nouveau carrousel',
      format: FORMATS['ig-portrait'],
      formatKey: 'ig-portrait',
      brand: {
        name: 'DGsys',
        website: 'dgsys.fr',
        font: 'Inter',
        logoSrc: null,
        logoMode: 'text', // 'text' | 'image' | 'both' | 'none'
        colors: Object.assign({}, BRAND_PRESETS.dgsys.colors),
      },
      options: { dots: true, watermark: false, hlContrast: 'auto', credits: false },
      slides: [],
    };
  }

  /* ---------- Fusion profonde (sans prototype pollution) ---------- */
  function deepMerge(target, src) {
    const out = Array.isArray(target) ? target.slice() : Object.assign({}, target);
    Object.keys(src || {}).forEach((k) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = deepMerge(out[k], v);
      } else if (v !== undefined) {
        out[k] = Array.isArray(v) ? v.slice() : v;
      }
    });
    return out;
  }

  /* ---------- Normalisation d'un état importé ---------- */
  function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const st = deepMerge(base, raw);
    st.version = SCHEMA_VERSION;
    if (!FORMATS[st.formatKey]) st.formatKey = 'ig-portrait';
    st.format = FORMATS[st.formatKey];
    st.slides = (Array.isArray(raw.slides) ? raw.slides : []).map((s) => makeSlide(s.layout, s));
    st.slides.forEach((s) => {
      s.items = (Array.isArray(s.items) ? s.items : []).map((it) => makeItem(it));
      if (!s.id) s.id = newId();
    });
    return st;
  }

  /* ---------- Le store ---------- */

  const listeners = [];
  let state = defaultState();
  let past = [];
  let future = [];
  let saveTimer = null;

  const snapshot = () => JSON.parse(JSON.stringify(state));

  function emit(reason) {
    listeners.forEach((fn) => fn(state, reason));
  }

  /**
   * Applique une mutation et enregistre un point d'annulation.
   * @param {(s: object) => void} mutator
   * @param {{reason?: string, silent?: boolean}} [opts] - `silent` = pas de point d'annulation
   */
  function commit(mutator, opts) {
    const o = opts || {};
    if (!o.silent) {
      past.push(JSON.stringify(state));
      if (past.length > 60) past.shift();
      future.length = 0;
    }
    mutator(state);
    scheduleSave();
    emit(o.reason || 'change');
  }

  function undo() {
    if (!past.length) return false;
    future.push(JSON.stringify(state));
    state = normalize(JSON.parse(past.pop()));
    scheduleSave();
    emit('history');
    return true;
  }

  function redo() {
    if (!future.length) return false;
    past.push(JSON.stringify(state));
    state = normalize(JSON.parse(future.pop()));
    scheduleSave();
    emit('history');
    return true;
  }

  function replace(raw, reason) {
    past.push(JSON.stringify(state));
    future.length = 0;
    state = normalize(raw);
    scheduleSave();
    emit(reason || 'replace');
  }

  /* ---------- Persistance locale ----------
     localStorage plafonne autour de 5 Mo. Les images sont déjà redimensionnées
     à l'import, mais un carrousel très chargé peut dépasser : on échoue alors
     proprement au lieu de casser l'application. */
  function scheduleSave() {
    if (typeof localStorage === 'undefined') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        emit('save-failed');
      }
    }, 400);
  }

  function load() {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      state = normalize(JSON.parse(raw));
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    FORMATS, BRAND_PRESETS, ICONS, STORAGE_KEY,
    makeSlide, makeItem, defaultState, normalize, deepMerge, newId,
    get: () => state,
    snapshot,
    commit, undo, redo, replace, load,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe: (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
  };
});
