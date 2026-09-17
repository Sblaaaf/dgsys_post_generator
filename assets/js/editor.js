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

    const list = el('<div id="slide-list"></div>');
    st.slides.forEach((slide, i) => list.appendChild(slideCard(slide, i, st)));
    root.appendChild(list);

    // Le glisser-déposer double les boutons monter/descendre, il ne les remplace
    // pas : le DnD natif HTML5 est inaccessible au clavier.
    window.DGDnd.initList(list, {
      itemSelector: '.slide-card',
      onMove: (from, to) => {
        S.commit((s) => { s.slides.splice(to, 0, s.slides.splice(from, 1)[0]); });
        onStructure();
      },
    });

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
          <span class="slide-card__handle" data-drag-handle draggable="true"
                title="Glisser pour réordonner" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></span>
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

  /** Section repliable. `<details>` natif : accessible, sans une ligne de JS. */
  function section(title, icon, open, content) {
    const d = el(`
      <details class="sect" ${open ? 'open' : ''}>
        <summary><i class="${esc(icon)}" aria-hidden="true"></i> ${esc(title)}</summary>
        <div class="sect__body"></div>
      </details>`);
    $('.sect__body', d).appendChild(content);
    return d;
  }

  function buildBody(body, slide, def, st) {
    const vis = el(`
      <label class="switch sect-top">
        <input type="checkbox" ${slide.visible ? 'checked' : ''}> Inclure cette slide dans l’export
      </label>`);
    $('input', vis).addEventListener('change', (e) => {
      S.commit((s) => { find(s, slide.id).visible = e.target.checked; });
      onStructure();
    });
    body.appendChild(vis);

    // --- Contenu ---
    const content = el('<div></div>');
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
      // Point d'annulation à la sortie du champ, pas à chaque caractère :
      // Ctrl+Z annule une phrase, pas une lettre.
      input.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
      content.appendChild(f);
    });
    if (def.items) content.appendChild(itemsEditor(slide, def));
    body.appendChild(section('Contenu', 'fa-solid fa-pen', true, content));

    // --- Mise en page ---
    body.appendChild(section('Mise en page', 'fa-solid fa-table-cells', false, layoutEditor(slide, def, st)));

    // --- Image ---
    if (def.image) body.appendChild(section('Image', 'fa-regular fa-image', false, imageEditor(slide)));

    // --- Calques ---
    const nLayers = (slide.layers || []).length;
    body.appendChild(section(`Calques libres${nLayers ? ` (${nLayers})` : ''}`, 'fa-solid fa-layer-group', nLayers > 0, layersEditor(slide)));

    // --- Typographie ---
    body.appendChild(section('Typographie', 'fa-solid fa-font', false, typoEditor(slide)));
  }

  /** Mise en page : gabarit, fond, variante et blocs détachés. */
  function layoutEditor(slide, def, st) {
    const wrap = el(`
      <div>
        <div class="row">
          <div class="field"><label>Gabarit</label><select data-k="layout"></select></div>
          <div class="field"><label>Fond</label><select data-k="palette"></select></div>
        </div>
        <div class="field">
          <label>Disposition</label>
          <select data-k="variant">
            <option value="auto">Automatique (suit le format)</option>
            <option value="stack">Empilée — titre au-dessus</option>
            <option value="split">Deux colonnes — titre à gauche</option>
          </select>
          <p class="hint" data-variant-note></p>
        </div>
        <div data-zones></div>
      </div>`);

    const layoutSel = wrap.querySelector('[data-k="layout"]');
    Object.keys(T.LAYOUTS).forEach((k) => layoutSel.add(new Option(T.LAYOUTS[k].label, k, false, k === slide.layout)));
    layoutSel.addEventListener('change', (e) => {
      S.commit((s) => {
        const sl = find(s, slide.id);
        sl.layout = e.target.value;
        const d = T.LAYOUTS[e.target.value];
        if (d.defaults) Object.assign(sl, S.deepMerge({ palette: sl.palette, image: sl.image }, d.defaults));
        if (d.items && !sl.items.length) {
          sl.items.push(S.makeItem({ icon: d.items.defaultIcon || 'fa-solid fa-check', title: 'Point clé 1' }));
        }
      });
      onStructure();
    });

    const palSel = wrap.querySelector('[data-k="palette"]');
    Object.keys(T.PALETTES).forEach((k) => palSel.add(new Option(T.PALETTE_LABELS[k], k, false, k === slide.palette)));
    palSel.addEventListener('change', (e) => {
      S.commit((s) => { find(s, slide.id).palette = e.target.value; });
      onPreview();
    });

    const varSel = wrap.querySelector('[data-k="variant"]');
    varSel.value = slide.variant || 'auto';
    const wide = st.format.w / st.format.h >= 1.3;
    $('[data-variant-note]', wrap).textContent = wide
      ? 'Ce format est paysage : en automatique, la slide passe en deux colonnes.'
      : 'Ce format est portrait : en automatique, la slide reste empilée.';
    varSel.addEventListener('change', () => {
      S.commit((s) => { find(s, slide.id).variant = varSel.value; });
      onPreview();
    });

    // --- Blocs détachés ---
    const zones = slide.zones || {};
    const keys = Object.keys(zones);
    const zbox = $('[data-zones]', wrap);
    zbox.appendChild(el(`
      <p class="hint" style="margin-top:12px">
        Les blocs du gabarit (titre, contenu, annotation, logo) se déplacent
        <b>directement dans l’aperçu</b> : glissez-en un et il se détache de la
        mise en page. Vous pouvez le remettre en place ci-dessous.
      </p>`));

    if (!keys.length) {
      zbox.appendChild(el('<p class="hint">Aucun bloc détaché : le gabarit décide de tout.</p>'));
    } else {
      keys.forEach((k) => {
        const row = el(`
          <div class="layer-row">
            <i class="type fa-solid fa-up-down-left-right"></i>
            <span>${esc(T.ZONE_LABELS[k] || k)} — libre</span>
            <button class="btn btn--ghost" data-reset title="Remettre dans la mise en page">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
          </div>`);
        $('[data-reset]', row).addEventListener('click', () => {
          S.commit((s) => { delete find(s, slide.id).zones[k]; });
          window.DGCanvas.setSelected(null);
          onStructure();
        });
        zbox.appendChild(row);
      });
      const all = el('<button class="btn btn--block" style="margin-top:6px"><i class="fa-solid fa-rotate-left"></i> Tout remettre en place</button>');
      all.addEventListener('click', () => {
        S.commit((s) => { find(s, slide.id).zones = {}; });
        window.DGCanvas.setSelected(null);
        onStructure();
      });
      zbox.appendChild(all);
    }

    return wrap;
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

      $('.item-row__icon', row).addEventListener('click', () => {
        window.DGIconPicker.open(item.icon, (cls) => {
          S.commit((s) => { find(s, slide.id).items[i].icon = cls; });
          onStructure();
        });
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

  /* ---------- Éditeur d'image ---------- */

  function imageEditor(slide) {
    const img = slide.image || {};
    const credit = img.credit;
    const wrap = el(`
      <div>
        <div class="section-title"><i class="fa-regular fa-image"></i> Image</div>
        <div class="btn-grid" style="margin-bottom:10px">
          <label class="upload">
            <input type="file" accept="image/*" aria-label="Importer une image">
            <span class="upload__ui" style="padding:10px"><i class="fa-solid fa-arrow-up-from-bracket"></i> Importer</span>
          </label>
          <button class="btn" data-search><i class="fa-solid fa-magnifying-glass"></i> Chercher</button>
        </div>
        <p class="hint" style="margin-top:-4px">Vous pouvez aussi glisser un fichier directement sur la slide dans l’aperçu.</p>
        ${img.src ? `
          <div class="img-preview">
            <img src="${esc(img.src)}" alt="">
            <div class="img-preview__meta">
              ${credit && credit.author
                ? `<span>© ${esc(credit.author)}${credit.source ? ' · ' + esc(credit.source) : ''}</span>`
                : '<span>Image importée</span>'}
              <button class="btn btn--ghost btn--danger" data-clear aria-label="Retirer l’image"><i class="fa-regular fa-trash-can"></i></button>
            </div>
          </div>` : ''}
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
        S.commit((s) => { const im = find(s, slide.id).image; im.src = src; im.credit = null; });
        onStructure();
      } catch (err) {
        window.DGToast(err.message, 'error');
      }
    });

    $('[data-search]', wrap).addEventListener('click', (e) => {
      const open = $('.stock', wrap);
      if (open) { open.remove(); return; }
      e.target.closest('div').insertAdjacentElement('afterend', stockPanel(slide));
    });

    const clearBtn = $('[data-clear]', wrap);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      S.commit((s) => { const im = find(s, slide.id).image; im.src = null; im.credit = null; });
      onStructure();
    });

    const ranges = wrap.querySelectorAll('input[type="range"]');
    const bindRange = (input, key) => {
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

  /* ---------- Recherche dans une banque d'images ---------- */

  function stockPanel(slide) {
    const K = window.DGStock;
    const box = el(`
      <div class="stock">
        <div class="row">
          <div class="field" style="margin-bottom:8px">
            <label>Banque</label>
            <select data-src></select>
          </div>
          <div class="field" style="margin-bottom:8px">
            <label>Recherche</label>
            <input type="text" data-q placeholder="boulangerie, pain, atelier…">
          </div>
        </div>
        <div data-keyfield></div>
        <p class="hint" data-note style="margin-bottom:8px"></p>
        <button class="btn btn--accent btn--block" data-go><i class="fa-solid fa-magnifying-glass"></i> Chercher</button>
        <p class="hint" data-status style="margin-top:8px"></p>
        <div class="stock-grid" data-grid></div>
        <button class="btn btn--block" data-more style="margin-top:8px;display:none">Charger plus de résultats</button>
      </div>`);

    const srcSel = $('[data-src]', box);
    Object.keys(K.SOURCES).forEach((k) => srcSel.add(new Option(K.SOURCES[k].label, k)));

    const keyField = $('[data-keyfield]', box);
    const note = $('[data-note]', box);
    const status = $('[data-status]', box);
    const grid = $('[data-grid]', box);
    const more = $('[data-more]', box);
    let page = 1;

    function refreshSource() {
      const src = srcSel.value;
      const def = K.SOURCES[src];
      note.innerHTML = esc(def.note) + ` <a href="${esc(def.signup)}" target="_blank" rel="noopener">En savoir plus</a>`;
      keyField.innerHTML = '';
      if (def.needsKey) {
        const f = el(`
          <div class="field" style="margin-bottom:8px">
            <label>Clé ${esc(def.label)}</label>
            <input type="password" placeholder="Collez votre clé" value="${esc(K.getKey(src))}" autocomplete="off">
            <p class="hint">Stockée dans ce navigateur uniquement, et jamais incluse dans un projet exporté.</p>
          </div>`);
        $('input', f).addEventListener('change', (e) => K.setKey(src, e.target.value.trim()));
        keyField.appendChild(f);
      }
    }
    srcSel.addEventListener('change', () => { refreshSource(); grid.innerHTML = ''; more.style.display = 'none'; });
    refreshSource();

    async function run(append) {
      const q = $('[data-q]', box).value;
      if (!q.trim()) return window.DGToast('Saisissez un mot-clé.', 'error');
      page = append ? page + 1 : 1;
      status.textContent = 'Recherche…';
      if (!append) grid.innerHTML = '';
      try {
        const results = await K.search(srcSel.value, q, page);
        status.textContent = results.length ? '' : 'Aucun résultat.';
        more.style.display = results.length ? 'block' : 'none';
        results.forEach((r) => grid.appendChild(thumb(r, slide)));
      } catch (err) {
        status.textContent = '';
        window.DGToast(err.message, 'error');
      }
    }
    $('[data-go]', box).addEventListener('click', () => run(false));
    $('[data-q]', box).addEventListener('keydown', (e) => { if (e.key === 'Enter') run(false); });
    more.addEventListener('click', () => run(true));

    return box;
  }

  function thumb(result, slide) {
    const b = el(`
      <button type="button" class="stock-thumb" title="${esc((result.credit && result.credit.author) || '')}">
        <img src="${esc(result.thumb)}" alt="" loading="lazy">
      </button>`);
    b.addEventListener('click', async () => {
      b.dataset.busy = 'true';
      window.DGToast('Téléchargement de l’image…');
      try {
        // Conversion immédiate en data: URL — sans cela le canvas serait
        // « teinté » et l'export échouerait au moment le plus gênant.
        const src = await window.DGStock.fetchAsDataURL(result.full);
        S.commit((s) => {
          const im = find(s, slide.id).image;
          im.src = src;
          im.credit = result.credit || null;
        });
        onStructure();
        window.DGToast('Image appliquée.');
      } catch (err) {
        window.DGToast(err.message, 'error');
      } finally {
        b.removeAttribute('data-busy');
      }
    });
    return b;
  }

  /* ---------- Calques libres ---------- */

  function layersEditor(slide) {
    const L = window.DGLayers;
    const layers = slide.layers || [];
    const wrap = el(`
      <div>
        <div class="section-title"><i class="fa-solid fa-layer-group"></i> Calques libres
          <span style="margin-left:auto;font-weight:600;text-transform:none;letter-spacing:0">${layers.length}</span>
        </div>
        <p class="hint" style="margin-top:-4px;margin-bottom:10px">
          À superposer au template quand il ne suffit pas. Déplacez-les à la souris
          dans l’aperçu : ils s’aimantent aux bords, aux centres et aux autres calques.
          <b>Alt</b> suspend l’aimantation, les flèches déplacent au clavier.
        </p>
        <div data-list></div>
        <div class="btn-grid" data-add></div>
        <div data-props></div>
      </div>`);

    const list = $('[data-list]', wrap);
    layers.forEach((l) => {
      const active = window.DGCanvas.isSelected('layer', l.id);
      const row = el(`
        <div class="layer-row" data-active="${active}">
          <i class="type ${esc(L.TYPES[l.type].icon)}"></i>
          <span>${esc(label(l))}</span>
          <button class="btn btn--ghost" data-up aria-label="Placer devant"><i class="fa-solid fa-arrow-up"></i></button>
          <button class="btn btn--ghost btn--danger" data-del aria-label="Supprimer le calque"><i class="fa-regular fa-trash-can"></i></button>
        </div>`);
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        window.DGCanvas.setSelected(active ? null : { kind: 'layer', key: l.id });
        onStructure();
      });
      $('[data-up]', row).addEventListener('click', () => {
        S.commit((s) => {
          const arr = find(s, slide.id).layers;
          const i = arr.findIndex((x) => x.id === l.id);
          if (i >= 0 && i < arr.length - 1) arr.push(arr.splice(i, 1)[0]);
        });
        onStructure();
      });
      $('[data-del]', row).addEventListener('click', () => {
        S.commit((s) => {
          const sl = find(s, slide.id);
          sl.layers = sl.layers.filter((x) => x.id !== l.id);
        });
        if (window.DGCanvas.isSelected('layer', l.id)) window.DGCanvas.setSelected(null);
        onStructure();
      });
      list.appendChild(row);
    });

    const add = $('[data-add]', wrap);
    Object.keys(L.TYPES).forEach((t) => {
      const b = el(`<button class="btn"><i class="${esc(L.TYPES[t].icon)}"></i> ${esc(L.TYPES[t].label)}</button>`);
      b.addEventListener('click', () => {
        const nl = L.makeLayer(t, { x: 12, y: 60 });
        S.commit((s) => { find(s, slide.id).layers.push(nl); });
        window.DGCanvas.setSelected({ kind: 'layer', key: nl.id });
        onStructure();
      });
      add.appendChild(b);
    });

    const sel = layers.find((l) => window.DGCanvas.isSelected('layer', l.id));
    if (sel) $('[data-props]', wrap).appendChild(layerProps(slide, sel));

    return wrap;
  }

  function label(l) {
    if (l.type === 'text') return (l.text || 'Texte').replace(/\*\*/g, '').slice(0, 30);
    if (l.type === 'icon') return (l.icon || '').replace('fa-solid fa-', '');
    if (l.type === 'image') return l.src ? 'Image' : 'Image (vide)';
    return l.kind === 'circle' ? 'Cercle' : 'Rectangle';
  }

  /** Réglages du calque sélectionné. */
  function layerProps(slide, layer) {
    const L = window.DGLayers;
    const box = el(`<div class="stock" style="margin-top:10px"><div class="field-label">Calque sélectionné</div></div>`);

    const bind = (node, key, cast) => {
      node.addEventListener('input', () => {
        S.commit((s) => {
          const l = find(s, slide.id).layers.find((x) => x.id === layer.id);
          if (l) l[key] = cast ? cast(node.value) : node.value;
        }, { silent: true });
        onPreview();
      });
      node.addEventListener('change', () => S.commit(() => {}, { reason: 'checkpoint' }));
    };

    if (layer.type === 'text') {
      const f = el(`<div class="field"><label>Contenu</label><textarea rows="2"></textarea></div>`);
      $('textarea', f).value = layer.text || '';
      bind($('textarea', f), 'text');
      box.appendChild(f);

      const g = el(`
        <div class="row">
          <div class="field"><label>Taille</label>
            <div class="range"><input type="range" min="16" max="160" step="2" value="${Number(layer.size) || 40}"><output>${Number(layer.size) || 40}</output></div>
          </div>
          <div class="field"><label>Graisse</label>
            <select>
              <option value="400">Regular</option><option value="600">Semi-bold</option>
              <option value="800">Extra-bold</option><option value="900">Black</option>
            </select>
          </div>
        </div>`);
      const r = $('input[type="range"]', g);
      r.addEventListener('input', () => { r.nextElementSibling.textContent = r.value; });
      bind(r, 'size', Number);
      const w = $('select', g);
      w.value = String(layer.weight || 800);
      bind(w, 'weight', Number);
      box.appendChild(g);

      const a = el(`<div class="field"><label>Alignement</label><select>
        <option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option>
      </select></div>`);
      $('select', a).value = layer.align || 'left';
      bind($('select', a), 'align');
      box.appendChild(a);
    }

    if (layer.type === 'icon') {
      const f = el(`
        <div class="field">
          <label>Icône</label>
          <button class="btn btn--block" data-pick><i class="${esc(layer.icon || 'fa-solid fa-star')}"></i> Choisir une icône</button>
        </div>`);
      $('[data-pick]', f).addEventListener('click', () => {
        window.DGIconPicker.open(layer.icon, (cls) => {
          S.commit((s) => {
            const l = find(s, slide.id).layers.find((x) => x.id === layer.id);
            if (l) l.icon = cls;
          });
          onStructure();
        });
      });
      box.appendChild(f);
    }

    if (layer.type === 'image') {
      const f = el(`
        <label class="upload field" style="display:block">
          <input type="file" accept="image/*" aria-label="Image du calque">
          <span class="upload__ui" style="padding:9px"><i class="fa-solid fa-arrow-up-from-bracket"></i> ${layer.src ? 'Remplacer' : 'Choisir une image'}</span>
        </label>`);
      $('input', f).addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const src = await window.DGExport.readImageFile(file, 1200);
          S.commit((s) => {
            const l = find(s, slide.id).layers.find((x) => x.id === layer.id);
            if (l) l.src = src;
          });
          onStructure();
        } catch (err) { window.DGToast(err.message, 'error'); }
      });
      box.appendChild(f);
    }

    if (layer.type === 'shape') {
      const f = el(`<div class="field"><label>Forme</label><select>
        <option value="rect">Rectangle</option><option value="circle">Cercle</option>
      </select></div>`);
      $('select', f).value = layer.kind || 'rect';
      bind($('select', f), 'kind');
      box.appendChild(f);
    }

    if (layer.type !== 'image') {
      const c = el(`<div class="field"><label>Couleur</label><select></select></div>`);
      const csel = $('select', c);
      Object.keys(L.COLOR_TOKENS).forEach((k) => csel.add(new Option(L.COLOR_TOKENS[k].label, k, false, k === layer.color)));
      bind(csel, 'color');
      box.appendChild(c);
    }

    const geo = el(`
      <div class="row">
        <div class="field"><label>Rotation</label>
          <div class="range"><input type="range" min="-30" max="30" step="1" value="${Number(layer.rot) || 0}"><output>${Number(layer.rot) || 0}°</output></div>
        </div>
        <div class="field"><label>Opacité</label>
          <div class="range"><input type="range" min="0.1" max="1" step="0.05" value="${layer.opacity != null ? layer.opacity : 1}"><output>${Math.round((layer.opacity != null ? layer.opacity : 1) * 100)} %</output></div>
        </div>
      </div>`);
    const [rot, op] = geo.querySelectorAll('input[type="range"]');
    rot.addEventListener('input', () => { rot.nextElementSibling.textContent = rot.value + '°'; });
    bind(rot, 'rot', Number);
    op.addEventListener('input', () => { op.nextElementSibling.textContent = Math.round(op.value * 100) + ' %'; });
    bind(op, 'opacity', Number);
    box.appendChild(geo);

    return box;
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
          <label>Baseline</label>
          <input type="text" data-k="baseline" value="${esc(st.brand.baseline || '')}"
                 placeholder="Des solutions de gestion adaptées aux…">
          <p class="hint">Apparaît dans le bandeau de marque, à activer dans les options.</p>
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
        <label class="switch field"><input type="checkbox" data-k="credits" ${st.options.credits ? 'checked' : ''}> Créditer l’auteur des photos sur la slide <span style="font-weight:600">(exigé par Unsplash)</span></label>
        <label class="switch field"><input type="checkbox" data-k="brandBar" ${st.options.brandBar ? 'checked' : ''}> Bandeau de marque en bas de slide <span style="font-weight:600">(logo + baseline)</span></label>
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
