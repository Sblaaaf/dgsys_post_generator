/* =========================================================================
   editor.js — Construction du panneau d'édition
   -------------------------------------------------------------------------
   Règle de performance / d'ergonomie : on ne reconstruit JAMAIS la sidebar
   pendant la frappe (le champ perdrait le focus). Une saisie ne rafraîchit
   que l'aperçu ; seuls les changements structurels (ajout, suppression,
   déplacement, changement de layout) redessinent le panneau.
   ========================================================================= */
window.DGEditor = (function () {
  'use strict';

  const S = window.DGStore;
  const T = window.DGTemplates;
  let onPreview = () => {};
  let onStructure = () => {};
  let openId = null;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = T.esc;

  function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  const FIELD_META = {
    eyebrow:  { label: 'Sur-titre', type: 'text', ph: 'ÉTUDE · 2026' },
    title:    { label: 'Titre', type: 'area', rows: 2, ph: 'Votre titre…' },
    subtitle: { label: 'Sous-titre', type: 'area', rows: 2, ph: 'Précision ou auteur…' },
    bignum:   { label: 'Chiffre géant', type: 'text', ph: '3' },
    cta:      { label: 'Appel à l’action', type: 'area', rows: 2, ph: 'Découvrez nos solutions sur…' },
    note:     { label: 'Annotation manuscrite', type: 'area', rows: 2, ph: 'Un petit mot à la main…' },
  };

  /* ------------------------------------------------------------------ */
  /* Panneau CONTENU                                                     */
  /* ------------------------------------------------------------------ */

  function renderContent(root) {
    const st = S.get();
    root.innerHTML = '';

    root.appendChild(el(`
      <div class="callout">
        <b>Astuce :</b> encadrez un mot de <code>**doubles astérisques**</code> pour le mettre
        en surbrillance. Les retours à la ligne sont conservés.
      </div>`));

    if (!st.slides.length) {
      root.appendChild(el(`
        <div class="empty">
          <i class="fa-regular fa-images"></i>
          Aucune slide.<br>Ajoutez-en une ci-dessous, ou partez d’un texte dans l’onglet <b>IA</b>.
        </div>`));
    }

    st.slides.forEach((slide, i) => root.appendChild(slideCard(slide, i, st)));

    const adder = el(`
      <div class="field" style="margin-top:14px">
        <label for="add-layout">Ajouter une slide</label>
        <div class="row">
          <select id="add-layout"></select>
          <button class="btn btn--primary" style="flex:0 0 auto" data-add>
            <i class="fa-solid fa-plus"></i> Ajouter
          </button>
        </div>
        <p class="hint" data-hint></p>
      </div>`);
    const sel = $('select', adder);
    Object.keys(T.LAYOUTS).forEach((k) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = T.LAYOUTS[k].label;
      sel.appendChild(o);
    });
    const hint = $('[data-hint]', adder);
    const refreshHint = () => { hint.textContent = T.LAYOUTS[sel.value].hint; };
    sel.addEventListener('change', refreshHint);
    refreshHint();
    $('[data-add]', adder).addEventListener('click', () => {
      const def = T.LAYOUTS[sel.value];
      S.commit((s) => {
        const sl = S.makeSlide(sel.value, def.defaults);
        sl.title = 'Nouveau titre';
        if (def.items) {
          const n = Math.min(3, def.items.max);
          for (let k = 0; k < n; k++) sl.items.push(S.makeItem({ icon: def.items.defaultIcon || 'fa-solid fa-check', title: 'Point clé ' + (k + 1) }));
        }
        openId = sl.id;
        s.slides.push(sl);
      });
      onStructure();
    });
    root.appendChild(adder);
  }

  function slideCard(slide, index, st) {
    const def = T.LAYOUTS[slide.layout] || T.LAYOUTS.list;
    const card = el(`
      <div class="slide-card" data-open="${slide.id === openId}" data-hidden="${!slide.visible}">
        <div class="slide-card__head">
          <button class="slide-card__grab" aria-expanded="${slide.id === openId}">
            <span class="slide-card__idx">${index + 1}</span>
            <span class="slide-card__name">${esc((slide.title || def.label).replace(/\*\*/g, '')) || def.label}</span>
          </button>
          <button class="btn btn--ghost" data-op="up" title="Monter" aria-label="Monter la slide ${index + 1}"><i class="fa-solid fa-chevron-up"></i></button>
          <button class="btn btn--ghost" data-op="down" title="Descendre" aria-label="Descendre la slide ${index + 1}"><i class="fa-solid fa-chevron-down"></i></button>
          <button class="btn btn--ghost" data-op="dup" title="Dupliquer" aria-label="Dupliquer la slide ${index + 1}"><i class="fa-regular fa-clone"></i></button>
          <button class="btn btn--ghost btn--danger" data-op="del" title="Supprimer" aria-label="Supprimer la slide ${index + 1}"><i class="fa-regular fa-trash-can"></i></button>
        </div>
        <div class="slide-card__body"></div>
      </div>`);

    $('.slide-card__grab', card).addEventListener('click', () => {
      openId = openId === slide.id ? null : slide.id;
      onStructure();
    });

    card.querySelectorAll('[data-op]').forEach((b) => {
      b.addEventListener('click', () => {
        const op = b.dataset.op;
        if (op === 'del' && !confirm('Supprimer cette slide ?')) return;
        S.commit((s) => {
          const i = s.slides.findIndex((x) => x.id === slide.id);
          if (i < 0) return;
          if (op === 'up' && i > 0) s.slides.splice(i - 1, 0, s.slides.splice(i, 1)[0]);
          if (op === 'down' && i < s.slides.length - 1) s.slides.splice(i + 1, 0, s.slides.splice(i, 1)[0]);
          if (op === 'del') s.slides.splice(i, 1);
          if (op === 'dup') {
            const copy = JSON.parse(JSON.stringify(s.slides[i]));
            copy.id = S.newId();
            s.slides.splice(i + 1, 0, copy);
            openId = copy.id;
          }
        });
        onStructure();
      });
    });

    if (slide.id === openId) buildBody($('.slide-card__body', card), slide, def, st);
    return card;
  }

  /* ---------- Corps d'une carte ---------- */

  function buildBody(body, slide, def, st) {
    // Ligne 1 : visibilité + layout + palette
    const head = el(`
      <div>
        <label class="switch" style="margin-bottom:12px">
          <input type="checkbox" ${slide.visible ? 'checked' : ''}> Inclure cette slide dans l’export
        </label>
        <div class="row">
          <div class="field"><label>Mise en page</label><select data-k="layout"></select></div>
          <div class="field"><label>Fond</label><select data-k="palette"></select></div>
        </div>
      </div>`);

    $('.switch input', head).addEventListener('change', (e) => {
      S.commit((s) => { find(s, slide.id).visible = e.target.checked; });
      onStructure();
    });

    const layoutSel = head.querySelector('[data-k="layout"]');
    Object.keys(T.LAYOUTS).forEach((k) => layoutSel.add(new Option(T.LAYOUTS[k].label, k, false, k === slide.layout)));
    layoutSel.addEventListener('change', (e) => {
      S.commit((s) => {
        const sl = find(s, slide.id);
        sl.layout = e.target.value;
        const d = T.LAYOUTS[e.target.value];
        // On applique les réglages par défaut du nouveau layout sans écraser le texte
        if (d.defaults) Object.assign(sl, S.deepMerge({ palette: sl.palette, image: sl.image }, d.defaults));
        if (d.items && !sl.items.length) {
          sl.items.push(S.makeItem({ icon: d.items.defaultIcon || 'fa-solid fa-check', title: 'Point clé 1' }));
        }
      });
      onStructure();
    });

    const palSel = head.querySelector('[data-k="palette"]');
    Object.keys(T.PALETTES).forEach((k) => palSel.add(new Option(T.PALETTE_LABELS[k], k, false, k === slide.palette)));
    palSel.addEventListener('change', (e) => {
      S.commit((s) => { find(s, slide.id).palette = e.target.value; }, { silent: false });
      onPreview();
    });
    body.appendChild(head);

    // Champs texte
    def.fields.forEach((key) => {
      const m = FIELD_META[key];
      if (!m) return;
      const f = el(`
        <div class="field">
          <label>${m.label}</label>
          ${m.type === 'area'
            ? `<textarea rows="${m.rows || 2}" placeholder="${esc(m.ph)}"></textarea>`
            : `<input type="text" placeholder="${esc(m.ph)}">`}
        </div>`);
      const input = f.querySelector('textarea, input');
      input.value = slide[key] || '';
      input.addEventListener('input', () => {
        S.commit((s) => { find(s, slide.id)[key] = input.value; }, { silent: true });
        onPreview();
      });
      // Un point d'annulation est posé quand l'utilisateur quitte le champ,
      // pas à chaque caractère : Ctrl+Z annule une phrase, pas une lettre.
      input.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
      body.appendChild(f);
    });

    // Liste d'éléments
    if (def.items) body.appendChild(itemsEditor(slide, def));

    // Image
    if (def.image) body.appendChild(imageEditor(slide));

    // Typographie fine
    body.appendChild(typoEditor(slide));
  }

  function find(s, id) { return s.slides.find((x) => x.id === id); }

  /* ---------- Éditeur de liste ---------- */

  function itemsEditor(slide, def) {
    const labels = def.items.labels || { title: 'Intitulé', sub: 'Précision' };
    const wrap = el(`
      <div>
        <div class="section-title"><i class="fa-solid fa-list"></i> Éléments
          <span style="margin-left:auto;font-weight:600;text-transform:none;letter-spacing:0">
            ${slide.items.length}/${def.items.max}
          </span>
        </div>
        <div class="items-editor"></div>
        <button class="btn btn--block" style="margin-top:8px" data-add-item>
          <i class="fa-solid fa-plus"></i> Ajouter un élément
        </button>
      </div>`);
    const list = $('.items-editor', wrap);

    slide.items.forEach((item, i) => {
      const row = el(`
        <div class="item-row">
          <div class="item-row__top">
            <button class="item-row__icon" title="Changer l’icône" aria-label="Changer l’icône de l’élément ${i + 1}">
              <i class="${esc(item.icon || 'fa-solid fa-check')}"></i>
            </button>
            <input type="text" placeholder="${esc(labels.title)}">
            <button class="btn btn--ghost btn--danger" data-del aria-label="Supprimer l’élément ${i + 1}"><i class="fa-regular fa-trash-can"></i></button>
          </div>
          <input type="text" placeholder="${esc(labels.sub)} (optionnel)">
        </div>`);

      const [tInput, sInput] = row.querySelectorAll('input');
      tInput.value = item.title || '';
      sInput.value = item.sub || '';
      const bind = (input, key) => {
        input.addEventListener('input', () => {
          S.commit((s) => { find(s, slide.id).items[i][key] = input.value; }, { silent: true });
          onPreview();
        });
        input.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
      };
      bind(tInput, 'title');
      bind(sInput, 'sub');

      $('[data-del]', row).addEventListener('click', () => {
        S.commit((s) => { find(s, slide.id).items.splice(i, 1); });
        onStructure();
      });

      const iconBtn = $('.item-row__icon', row);
      iconBtn.addEventListener('click', () => {
        const existing = $('.icon-picker', row);
        if (existing) return existing.remove();
        row.appendChild(iconPicker(item.icon, (cls) => {
          S.commit((s) => { find(s, slide.id).items[i].icon = cls; });
          onStructure();
        }));
      });

      list.appendChild(row);
    });

    const addBtn = $('[data-add-item]', wrap);
    if (slide.items.length >= def.items.max) addBtn.disabled = true;
    addBtn.addEventListener('click', () => {
      S.commit((s) => {
        find(s, slide.id).items.push(S.makeItem({ icon: def.items.defaultIcon || 'fa-solid fa-check' }));
      });
      onStructure();
    });

    return wrap;
  }

  /* ---------- Sélecteur d'icônes ---------- */

  function iconPicker(current, pick) {
    const box = el(`
      <div class="icon-picker">
        <input type="text" placeholder="Filtrer (ex. « euro ») ou coller une classe FontAwesome" value="${esc(current || '')}">
        <div class="icon-grid"></div>
      </div>`);
    const input = $('input', box);
    const grid = $('.icon-grid', box);

    const paint = (filter) => {
      grid.innerHTML = '';
      const q = (filter || '').toLowerCase().trim();
      S.ICONS.filter((c) => !q || c.includes(q)).slice(0, 64).forEach((c) => {
        const b = el(`<button type="button" title="${esc(c)}"><i class="${esc(c)}"></i></button>`);
        b.addEventListener('click', () => pick(c));
        grid.appendChild(b);
      });
    };
    paint('');
    input.addEventListener('input', () => paint(input.value));
    // Coller une classe complète l'applique directement
    input.addEventListener('change', () => {
      if (/^fa-(solid|regular|brands)\s+fa-[a-z0-9-]+$/.test(input.value.trim())) pick(input.value.trim());
    });
    return box;
  }

  /* ---------- Éditeur d'image ---------- */

  function imageEditor(slide) {
    const img = slide.image || {};
    const wrap = el(`
      <div>
        <div class="section-title"><i class="fa-regular fa-image"></i> Image</div>
        <label class="upload field">
          <input type="file" accept="image/*" aria-label="Importer une image">
          <span class="upload__ui"><i class="fa-solid fa-arrow-up-from-bracket"></i>
            ${img.src ? 'Remplacer l’image' : 'Importer une image'}</span>
        </label>
        ${img.src ? '<button class="btn btn--block btn--danger" data-clear style="margin-bottom:12px"><i class="fa-regular fa-trash-can"></i> Retirer l’image</button>' : ''}
        <div class="field">
          <label>Voile de lisibilité <span style="font-weight:600;text-transform:none">— assombrit pour que le texte reste lisible</span></label>
          <div class="range">
            <input type="range" min="0" max="0.95" step="0.05" value="${img.overlay != null ? img.overlay : 0.6}" ${img.gradient ? 'disabled' : ''}>
            <output>${Math.round((img.overlay != null ? img.overlay : 0.6) * 100)} %</output>
          </div>
        </div>
        <label class="switch field"><input type="checkbox" ${img.gradient ? 'checked' : ''}> Dégradé par le bas (au lieu d’un voile uniforme)</label>
        <div class="row">
          <div class="field">
            <label>Cadrage</label>
            <select data-k="pos">
              <option value="center">Centré</option>
              <option value="top">Haut</option>
              <option value="bottom">Bas</option>
              <option value="left">Gauche</option>
              <option value="right">Droite</option>
            </select>
          </div>
          <div class="field">
            <label>Zoom</label>
            <div class="range">
              <input type="range" min="1" max="2" step="0.05" value="${img.zoom || 1}">
              <output>${Math.round((img.zoom || 1) * 100)} %</output>
            </div>
          </div>
        </div>
      </div>`);

    $('input[type="file"]', wrap).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const src = await window.DGExport.readImageFile(file);
        S.commit((s) => { find(s, slide.id).image.src = src; });
        onStructure();
      } catch (err) {
        window.DGToast(err.message, 'error');
      }
    });

    const clearBtn = $('[data-clear]', wrap);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      S.commit((s) => { find(s, slide.id).image.src = null; });
      onStructure();
    });

    const ranges = wrap.querySelectorAll('input[type="range"]');
    const bindRange = (input, key, suffix) => {
      const out = input.nextElementSibling;
      input.addEventListener('input', () => {
        out.textContent = Math.round(parseFloat(input.value) * 100) + ' %';
        S.commit((s) => { find(s, slide.id).image[key] = parseFloat(input.value); }, { silent: true });
        onPreview();
      });
      input.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
    };
    bindRange(ranges[0], 'overlay');
    bindRange(ranges[1], 'zoom');

    $('.switch input', wrap).addEventListener('change', (e) => {
      S.commit((s) => { find(s, slide.id).image.gradient = e.target.checked; });
      onStructure();
    });

    const posSel = wrap.querySelector('[data-k="pos"]');
    posSel.value = img.pos || 'center';
    posSel.addEventListener('change', () => {
      S.commit((s) => { find(s, slide.id).image.pos = posSel.value; });
      onPreview();
    });

    return wrap;
  }

  /* ---------- Typographie ---------- */

  function typoEditor(slide) {
    const st = slide.style || {};
    const wrap = el(`
      <div>
        <div class="section-title"><i class="fa-solid fa-font"></i> Typographie</div>
        <div class="field">
          <label>Taille du titre</label>
          <div class="range">
            <input type="range" min="0.6" max="1.5" step="0.05" value="${st.titleScale || 1}" data-k="titleScale">
            <output>${Math.round((st.titleScale || 1) * 100)} %</output>
          </div>
        </div>
        <div class="field">
          <label>Taille du corps</label>
          <div class="range">
            <input type="range" min="0.7" max="1.4" step="0.05" value="${st.bodyScale || 1}" data-k="bodyScale">
            <output>${Math.round((st.bodyScale || 1) * 100)} %</output>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Graisse du titre</label>
            <select data-k="titleWeight">
              <option value="600">Semi-bold 600</option>
              <option value="700">Bold 700</option>
              <option value="800">Extra-bold 800</option>
              <option value="900">Black 900</option>
            </select>
          </div>
          <div class="field">
            <label>Alignement</label>
            <select data-k="align">
              <option value="left">Gauche</option>
              <option value="center">Centré</option>
              <option value="right">Droite</option>
            </select>
          </div>
        </div>
      </div>`);

    wrap.querySelectorAll('input[type="range"]').forEach((input) => {
      const out = input.nextElementSibling;
      input.addEventListener('input', () => {
        out.textContent = Math.round(parseFloat(input.value) * 100) + ' %';
        S.commit((s) => { find(s, slide.id).style[input.dataset.k] = parseFloat(input.value); }, { silent: true });
        onPreview();
      });
      input.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
    });

    wrap.querySelectorAll('select').forEach((sel) => {
      sel.value = String(st[sel.dataset.k] || (sel.dataset.k === 'titleWeight' ? 900 : 'left'));
      sel.addEventListener('change', () => {
        S.commit((s) => {
          find(s, slide.id).style[sel.dataset.k] = sel.dataset.k === 'titleWeight' ? Number(sel.value) : sel.value;
        });
        onPreview();
      });
    });

    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Panneau DESIGN                                                      */
  /* ------------------------------------------------------------------ */

  function renderDesign(root) {
    const st = S.get();
    root.innerHTML = '';

    const fmt = el(`
      <div>
        <div class="section-title"><i class="fa-solid fa-crop-simple"></i> Format</div>
        <div class="field">
          <label>Support de destination</label>
          <select data-k="format"></select>
          <p class="hint">Les dimensions sont appliquées en pixels réels : l’export est identique à l’aperçu.</p>
        </div>
      </div>`);
    const fs = fmt.querySelector('[data-k="format"]');
    Object.keys(S.FORMATS).forEach((k) => {
      const f = S.FORMATS[k];
      fs.add(new Option(`${f.label} — ${f.w}×${f.h}`, k, false, k === st.formatKey));
    });
    fs.addEventListener('change', () => {
      S.commit((s) => { s.formatKey = fs.value; s.format = S.FORMATS[fs.value]; });
      onStructure();
    });
    root.appendChild(fmt);

    // --- Marque ---
    const brand = el(`
      <div>
        <div class="section-title"><i class="fa-solid fa-palette"></i> Marque</div>
        <div class="row">
          <div class="field"><label>Nom</label><input type="text" data-k="name" value="${esc(st.brand.name)}"></div>
          <div class="field"><label>Site / mention</label><input type="text" data-k="website" value="${esc(st.brand.website)}"></div>
        </div>
        <div class="field">
          <label>Logo</label>
          <label class="upload" style="display:block;margin-bottom:8px">
            <input type="file" accept="image/*" aria-label="Importer un logo">
            <span class="upload__ui"><i class="fa-solid fa-arrow-up-from-bracket"></i>
              ${st.brand.logoSrc ? 'Remplacer le logo' : 'Importer un logo (PNG transparent conseillé)'}</span>
          </label>
          <select data-k="logoMode">
            <option value="text">Nom seul</option>
            <option value="image">Logo seul</option>
            <option value="both">Logo + nom</option>
            <option value="none">Aucun</option>
          </select>
        </div>
        <div class="field">
          <label>Police</label>
          <select data-k="font">
            <option value="Inter">Inter</option>
            <option value="Poppins">Poppins</option>
            <option value="Montserrat">Montserrat</option>
            <option value="Space Grotesk">Space Grotesk</option>
          </select>
          <p class="hint">Les 4 familles sont préchargées. Pour une police propriétaire, ajoutez-la dans <code>index.html</code>.</p>
        </div>
      </div>`);

    brand.querySelectorAll('input[type="text"]').forEach((input) => {
      input.addEventListener('input', () => {
        S.commit((s) => { s.brand[input.dataset.k] = input.value; }, { silent: true });
        onPreview();
      });
      input.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
    });
    $('input[type="file"]', brand).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const src = await window.DGExport.readImageFile(file, 600);
        S.commit((s) => { s.brand.logoSrc = src; if (s.brand.logoMode === 'text') s.brand.logoMode = 'image'; });
        onStructure();
      } catch (err) { window.DGToast(err.message, 'error'); }
    });
    brand.querySelectorAll('select').forEach((sel) => {
      sel.value = st.brand[sel.dataset.k];
      sel.addEventListener('change', () => {
        S.commit((s) => { s.brand[sel.dataset.k] = sel.value; });
        onPreview();
      });
    });
    root.appendChild(brand);

    // --- Couleurs ---
    const COLOR_LABELS = {
      primary: 'Principale', accent: 'Accent', light: 'Clair',
      muted: 'Texte secondaire', paper: 'Fond clair', ink: 'Texte foncé',
    };
    const colors = el(`
      <div>
        <div class="section-title"><i class="fa-solid fa-droplet"></i> Couleurs</div>
        <div class="field">
          <label>Chartes prêtes à l’emploi</label>
          <div class="presets"></div>
        </div>
        <div class="swatches"></div>
        <p class="hint" style="margin-top:10px">
          Vérifiez toujours le contraste texte/fond : visez un ratio ≥ 4,5:1 (WCAG AA)
          pour rester lisible sur un écran de téléphone en plein soleil.
        </p>
      </div>`);

    const presets = $('.presets', colors);
    Object.keys(S.BRAND_PRESETS).forEach((k) => {
      const p = S.BRAND_PRESETS[k];
      const b = el(`<button class="preset" type="button">
        <span style="background:${p.colors.primary}"></span><span style="background:${p.colors.accent}"></span>${esc(p.label)}
      </button>`);
      b.addEventListener('click', () => {
        S.commit((s) => { s.brand.colors = Object.assign({}, p.colors); });
        onStructure();
      });
      presets.appendChild(b);
    });

    const sw = $('.swatches', colors);
    Object.keys(COLOR_LABELS).forEach((k) => {
      const row = el(`<label class="swatch">
        <input type="color" value="${esc(st.brand.colors[k])}"> ${COLOR_LABELS[k]}
      </label>`);
      const input = $('input', row);
      input.addEventListener('input', () => {
        S.commit((s) => { s.brand.colors[k] = input.value; }, { silent: true });
        onPreview();
      });
      input.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
      sw.appendChild(row);
    });
    root.appendChild(colors);

    // --- Options ---
    const opts = el(`
      <div>
        <div class="section-title"><i class="fa-solid fa-sliders"></i> Options</div>
        <label class="switch field"><input type="checkbox" data-k="dots" ${st.options.dots ? 'checked' : ''}> Afficher la pagination (les points)</label>
        <label class="switch field"><input type="checkbox" data-k="watermark" ${st.options.watermark ? 'checked' : ''}> Afficher le site en filigrane sur chaque slide</label>
        <div class="field">
          <label>Texte des surbrillances</label>
          <select data-sel="hlContrast">
            <option value="auto">Automatique — contraste garanti (recommandé)</option>
            <option value="white">Toujours blanc — fidèle à la charte</option>
          </select>
          <p class="hint" data-contrast></p>
        </div>
      </div>`);
    opts.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', () => {
        S.commit((s) => { s.options[input.dataset.k] = input.checked; });
        onPreview();
      });
    });

    // Diagnostic de contraste : on affiche le ratio réel, à charge au graphiste
    // d'arbitrer entre fidélité de charte et lisibilité sur mobile.
    const hlSel = opts.querySelector('[data-sel="hlContrast"]');
    const hlHint = opts.querySelector('[data-contrast]');
    const refreshContrast = () => {
      const c = S.get().brand.colors;
      const ratio = T.contrast(c.accent, '#ffffff');
      const ok = ratio >= 3;
      hlHint.innerHTML = `Blanc sur votre accent : <b>${ratio.toFixed(2)}:1</b>. `
        + (ok
          ? 'Au-dessus du seuil WCAG AA pour les grands textes (3:1).'
          : '<b style="color:var(--app-danger)">Sous le seuil WCAG AA (3:1)</b> — le mode automatique choisira une couleur sombre.');
    };
    hlSel.value = st.options.hlContrast || 'auto';
    hlSel.addEventListener('change', () => {
      S.commit((s) => { s.options.hlContrast = hlSel.value; });
      onPreview();
    });
    refreshContrast();
    root.appendChild(opts);
  }

  return {
    init(hooks) { onPreview = hooks.onPreview; onStructure = hooks.onStructure; },
    renderContent, renderDesign,
    get openId() { return openId; },
    set openId(v) { openId = v; },
  };
})();
