/* =========================================================================
   app.js — Assemblage : aperçu, onglets, IA, export, raccourcis
   ========================================================================= */
(function () {
  'use strict';

  const S = window.DGStore;
  const T = window.DGTemplates;
  const E = window.DGEditor;
  const X = window.DGExport;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let previewWidth = 330;
  let exportOpts = { scale: 1, format: 'png' };

  /* ------------------------------ Toast ------------------------------ */
  let toastTimer = null;
  window.DGToast = function (msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.dataset.kind = kind || 'info';
    t.dataset.show = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.dataset.show = 'false'; }, kind === 'error' ? 5200 : 2600);
  };

  /* --------------------------- Aperçu --------------------------- */

  function visibleSlides() {
    return S.get().slides.filter((s) => s.visible);
  }

  function renderPreview() {
    const st = S.get();
    const board = $('#board');
    const vis = visibleSlides();
    board.innerHTML = '';

    if (!st.slides.length) {
      board.appendChild(document.createRange().createContextualFragment(`
        <div class="empty" style="margin:auto">
          <i class="fa-regular fa-lightbulb"></i>
          <p style="max-width:380px;line-height:1.6">
            Collez votre texte dans l’onglet <b>IA</b> et laissez le générateur
            proposer une première structure — vous ajusterez ensuite.
          </p>
        </div>`));
      updateToolbar();
      return;
    }

    const scale = previewWidth / st.format.w;

    st.slides.forEach((slide, absIdx) => {
      const idx = vis.indexOf(slide);
      const html = T.renderSlide(slide, { state: st, index: idx < 0 ? 0 : idx, total: vis.length });

      const frame = document.createElement('div');
      frame.className = 'frame';
      frame.dataset.hidden = String(!slide.visible);

      const label = document.createElement('div');
      label.className = 'frame__label';
      label.innerHTML = `<b>${absIdx + 1}</b> · ${T.esc(T.LAYOUTS[slide.layout].label)}`;

      const dl = document.createElement('button');
      dl.className = 'btn btn--ghost';
      dl.title = 'Exporter cette slide en image';
      dl.setAttribute('aria-label', `Exporter la slide ${absIdx + 1}`);
      dl.innerHTML = '<i class="fa-solid fa-download"></i>';
      dl.addEventListener('click', () => exportOne(frame, absIdx));
      label.appendChild(dl);

      const stage = document.createElement('div');
      stage.className = 'stage';
      stage.style.width = Math.round(st.format.w * scale) + 'px';
      stage.style.height = Math.round(st.format.h * scale) + 'px';
      stage.innerHTML = html;
      const slideEl = $('.slide', stage);
      slideEl.style.transform = `scale(${scale})`;
      slideEl.insertAdjacentHTML('beforeend', window.DGCanvas.renderGuideOverlay(st.options.guides));

      frame.appendChild(label);
      frame.appendChild(stage);
      board.appendChild(frame);

      // Signalement de débordement : le contenu dépasse le cadre
      requestAnimationFrame(() => {
        if (isOverflowing($('.slide', stage))) {
          label.insertAdjacentHTML('beforeend',
            '<span title="Le contenu dépasse du cadre" style="color:#d9435e"><i class="fa-solid fa-triangle-exclamation"></i></span>');
        }
      });
    });

    window.DGCanvas.refresh();
    updateToolbar();
  }

  function isOverflowing(slideEl) {
    if (!slideEl) return false;
    // Tolérance de 1,5 % : le padding des surbrillances fait dépasser de quelques
    // pixels sans conséquence visuelle. On n'alerte que sur un vrai débordement.
    return $$('.stack, .half-bottom', slideEl).some(
      (n) => n.scrollHeight > n.clientHeight + Math.max(8, n.clientHeight * 0.015));
  }

  /** Réduit la typo des slides qui débordent, par paliers de 5 %. */
  function autoFit() {
    const st = S.get();
    let fixed = 0;
    $$('#board .stage').forEach((stage, i) => {
      const slide = st.slides[i];
      const node = $('.slide', stage);
      let guard = 12;
      while (isOverflowing(node) && guard-- > 0) {
        const ts = Math.max(0.6, (parseFloat(node.style.getPropertyValue('--ts')) || 1) - 0.05);
        const bs = Math.max(0.7, (parseFloat(node.style.getPropertyValue('--bs')) || 1) - 0.04);
        node.style.setProperty('--ts', ts);
        node.style.setProperty('--bs', bs);
        if (guard === 11) fixed++;
        S.commit((s) => { s.slides[i].style.titleScale = ts; s.slides[i].style.bodyScale = bs; }, { silent: true });
      }
    });
    S.commit(() => {}, { reason: 'autofit' });
    window.DGToast(fixed ? `${fixed} slide(s) ajustée(s).` : 'Aucun débordement détecté.');
    renderAll();
  }

  function updateToolbar() {
    const st = S.get();
    $('#undo').disabled = !S.canUndo();
    $('#redo').disabled = !S.canRedo();
    $('#count').textContent = `${visibleSlides().length} slide(s) · ${st.format.w}×${st.format.h}`;
  }

  /* --------------------------- Onglets --------------------------- */

  function switchTab(id) {
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    $$('.panel').forEach((p) => { p.dataset.active = String(p.id === 'panel-' + id); });
    if (id === 'design') E.renderDesign($('#panel-design'));
    if (id === 'ai') renderAI($('#panel-ai'));
    if (id === 'export') renderExport($('#panel-export'));
  }

  function renderAll() {
    E.renderContent($('#panel-content'));
    if ($('#panel-design').dataset.active === 'true') E.renderDesign($('#panel-design'));
    if ($('#panel-export').dataset.active === 'true') renderExport($('#panel-export'));
    renderPreview();
  }

  /* --------------------------- Panneau IA --------------------------- */

  function renderAI(root) {
    if (root.dataset.built === 'true') return;
    root.dataset.built = 'true';
    const L = window.DGLLM;

    root.innerHTML = `
      <div class="callout">
        Collez un texte brut — un brouillon de post, des notes, un plan.
        L’analyseur détecte titres, listes, chiffres et appels à l’action,
        puis choisit une mise en page par section. <b>Tout se passe dans votre navigateur.</b>
      </div>

      <div class="field">
        <label for="ai-text">Votre contenu</label>
        <textarea id="ai-text" rows="12" placeholder="Titre du sujet
Une phrase d'accroche qui pose le problème.

Quelles sont les principales sources de pertes ?
- Matières premières mal utilisées (farine, beurre…)
- Erreurs de fabrication (dosage, cuisson…)

3 indicateurs pour mesurer vos pertes
- Écart de consommation : réel moins prévu
- Taux de pertes : perdu / produit x 100

Découvrez nos solutions sur dgsys.fr"></textarea>
        <p class="hint">Une ligne vide sépare deux slides. Une ligne commençant par « - » devient un point clé.</p>
      </div>

      <div class="row">
        <div class="field">
          <label for="ai-items">Points max / slide</label>
          <input type="number" id="ai-items" min="2" max="7" value="5">
        </div>
        <div class="field">
          <label for="ai-slides">Slides max</label>
          <input type="number" id="ai-slides" min="2" max="12" value="8">
        </div>
      </div>
      <label class="switch field"><input type="checkbox" id="ai-cover" checked> Générer une couverture</label>
      <label class="switch field"><input type="checkbox" id="ai-outro" checked> Générer une slide de conclusion</label>
      <label class="switch field"><input type="checkbox" id="ai-replace" checked> Remplacer le carrousel actuel (sinon, ajouter à la suite)</label>

      <button class="btn btn--accent btn--block" id="ai-run" style="margin-top:6px">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Générer le carrousel
      </button>

      <div class="section-title"><i class="fa-solid fa-arrow-right-arrow-left"></i> Passer par un chat (gratuit)</div>
      <div class="callout">
        L’application prépare le prompt, vous le collez dans <b>ChatGPT, Le Chat, Gemini</b>
        ou n’importe quel chat, et vous recollez la réponse ici.
        Aucune clé, aucun coût, aucun appel réseau depuis cette page.
      </div>
      <div class="field">
        <label for="ai-brief">Intention éditoriale (facultatif)</label>
        <input type="text" id="ai-brief" placeholder="Ton pédagogique, cible : artisans boulangers">
      </div>
      <div class="btn-grid">
        <button class="btn btn--primary" id="ai-copy"><i class="fa-regular fa-copy"></i> Copier le prompt</button>
        <button class="btn" id="ai-show"><i class="fa-regular fa-eye"></i> Le voir</button>
      </div>
      <div class="field" style="margin-top:12px">
        <label for="ai-paste">Réponse du chat</label>
        <textarea id="ai-paste" rows="5" placeholder="Collez ici la réponse JSON du chat…"></textarea>
      </div>
      <button class="btn btn--block" id="ai-apply"><i class="fa-solid fa-check"></i> Appliquer la réponse</button>

      <div class="section-title"><i class="fa-solid fa-plug"></i> Appel direct à une API (optionnel)</div>
      <div class="callout callout--warn">
        Il n’existe pas d’API gratuite donnant accès à ChatGPT : l’abonnement et
        l’API OpenAI sont deux produits distincts, et l’API est facturée à l’usage.
        Pour du gratuit et illimité, choisissez <b>Ollama</b> ou <b>LM Studio</b> —
        le modèle tourne alors sur votre machine.
      </div>
      <div class="field">
        <label for="ai-provider">Fournisseur</label>
        <select id="ai-provider"></select>
        <p class="hint" id="ai-provider-note"></p>
      </div>
      <div class="row">
        <div class="field"><label for="ai-base">URL de l’API</label><input type="text" id="ai-base"></div>
        <div class="field"><label for="ai-model">Modèle</label><input type="text" id="ai-model"></div>
      </div>
      <div class="field" id="ai-key-field">
        <label for="ai-key">Clé</label>
        <input type="password" id="ai-key" autocomplete="off" placeholder="Collez votre clé">
        <p class="hint">
          Stockée dans ce navigateur uniquement, jamais incluse dans un projet exporté.
          Une clé placée dans une page web reste lisible par quiconque y a accès :
          ne publiez pas cette page en ligne avec une clé enregistrée.
        </p>
      </div>
      <button class="btn btn--block" id="ai-call"><i class="fa-solid fa-paper-plane"></i> Générer via l’API</button>
      <p class="hint" id="ai-status" style="margin-top:8px"></p>`;

    const opts = () => {
      const st = S.get();
      return {
        text: $('#ai-text', root).value,
        brief: $('#ai-brief', root).value,
        maxItems: Number($('#ai-items', root).value) || 5,
        maxSlides: Number($('#ai-slides', root).value) || 8,
        cover: $('#ai-cover', root).checked,
        outro: $('#ai-outro', root).checked,
        website: st.brand.website,
        brandName: st.brand.name,
      };
    };

    // --- Générateur local ---
    $('#ai-run', root).addEventListener('click', () => {
      const o = opts();
      if (!o.text.trim()) return window.DGToast('Le texte est vide.', 'error');
      applyGenerated(window.DGSmart.build(o.text, o), $('#ai-replace', root).checked);
    });

    // --- Pont copier-coller ---
    $('#ai-copy', root).addEventListener('click', async () => {
      const o = opts();
      if (!o.text.trim()) return window.DGToast('Le texte est vide.', 'error');
      const prompt = L.buildPrompt(o);
      try {
        await navigator.clipboard.writeText(prompt);
        window.DGToast('Prompt copié — collez-le dans votre chat.');
      } catch (e) {
        // clipboard indisponible (http non sécurisé, file://) : repli manuel
        showPrompt(prompt);
        window.DGToast('Copie automatique refusée par le navigateur : sélectionnez le texte affiché.', 'error');
      }
    });

    $('#ai-show', root).addEventListener('click', () => showPrompt(L.buildPrompt(opts())));

    function showPrompt(text) {
      let box = $('#ai-prompt-box', root);
      if (box) { box.remove(); return; }
      box = el(`<div class="field" id="ai-prompt-box" style="margin-top:10px">
        <label>Prompt à copier</label><textarea rows="8" readonly></textarea></div>`);
      $('textarea', box).value = text;
      $('#ai-show', root).closest('.btn-grid').insertAdjacentElement('afterend', box);
      $('textarea', box).select();
    }

    $('#ai-apply', root).addEventListener('click', () => {
      const raw = $('#ai-paste', root).value;
      const o = opts();
      try {
        const data = L.sanitize(L.extractJSON(raw), o.maxSlides, o.maxItems);
        applyGenerated(data, $('#ai-replace', root).checked);
      } catch (err) {
        window.DGToast(err.message, 'error');
      }
    });

    // --- Appel direct ---
    const provSel = $('#ai-provider', root);
    Object.keys(L.PROVIDERS).forEach((k) => provSel.add(new Option(L.PROVIDERS[k].label, k)));
    const cfg = L.loadConfig();

    function fillProvider(key, useSaved) {
      const p = L.PROVIDERS[key];
      $('#ai-provider-note', root).textContent = p.note;
      $('#ai-base', root).value = useSaved && cfg.baseUrl ? cfg.baseUrl : p.baseUrl;
      $('#ai-model', root).value = useSaved && cfg.model ? cfg.model : p.model;
      $('#ai-key', root).value = useSaved ? (cfg.apiKey || '') : '';
      $('#ai-key-field', root).style.display = p.needsKey ? '' : 'none';
    }
    provSel.value = L.PROVIDERS[cfg.provider] ? cfg.provider : 'ollama';
    fillProvider(provSel.value, true);
    provSel.addEventListener('change', () => fillProvider(provSel.value, false));

    $('#ai-call', root).addEventListener('click', async () => {
      const o = opts();
      if (!o.text.trim()) return window.DGToast('Le texte est vide.', 'error');
      const conf = {
        provider: provSel.value,
        baseUrl: $('#ai-base', root).value.trim(),
        model: $('#ai-model', root).value.trim(),
        apiKey: $('#ai-key', root).value.trim(),
      };
      L.saveConfig(conf);

      const btn = $('#ai-call', root);
      const status = $('#ai-status', root);
      btn.disabled = true;
      status.textContent = 'Génération en cours…';
      try {
        const content = await L.complete(conf, L.buildPrompt(o));
        const data = L.sanitize(L.extractJSON(content), o.maxSlides, o.maxItems);
        applyGenerated(data, $('#ai-replace', root).checked);
        status.textContent = '';
      } catch (err) {
        status.textContent = '';
        window.DGToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  /** Fusionne le résultat du générateur dans l'état, en complétant les valeurs par défaut. */
  function applyGenerated(res, replace) {
    if (!res.slides || !res.slides.length) return window.DGToast('Aucune slide n’a pu être déduite.', 'error');
    S.commit((s) => {
      const built = res.slides.map((raw) => {
        const def = T.LAYOUTS[raw.layout] || T.LAYOUTS.list;
        const sl = S.makeSlide(raw.layout, S.deepMerge(def.defaults || {}, raw));
        sl.items = (raw.items || []).map((it) => S.makeItem(it));
        return sl;
      });
      if (replace) { s.slides = built; if (res.name) s.name = res.name; }
      else s.slides = s.slides.concat(built);
    });
    E.openId = null;
    switchTab('content');
    renderAll();
    const nameInput = $('#doc-name');
    if (nameInput) nameInput.value = S.get().name;
    window.DGToast(`${res.slides.length} slides générées.`);
  }

  /* --------------------------- Panneau Export --------------------------- */

  function renderExport(root) {
    const st = S.get();
    root.innerHTML = `
      <div class="section-title"><i class="fa-solid fa-image"></i> Qualité</div>
      <div class="row">
        <div class="field">
          <label for="ex-scale">Définition</label>
          <select id="ex-scale">
            <option value="1">1× — ${st.format.w}×${st.format.h} px</option>
            <option value="2">2× — ${st.format.w * 2}×${st.format.h * 2} px (retina)</option>
          </select>
        </div>
        <div class="field">
          <label for="ex-format">Format d’image</label>
          <select id="ex-format">
            <option value="png">PNG (net, plus lourd)</option>
            <option value="jpeg">JPEG (léger, photos)</option>
          </select>
        </div>
      </div>
      <p class="hint" style="margin-top:-6px">Instagram et LinkedIn ré-encodent de toute façon : le 1× suffit dans 90 % des cas.</p>

      <div class="section-title"><i class="fa-solid fa-download"></i> Exporter</div>
      <div class="btn-grid">
        <button class="btn btn--primary" id="ex-zip"><i class="fa-regular fa-file-zipper"></i> Images (ZIP)</button>
        <button class="btn btn--primary" id="ex-pdf"><i class="fa-regular fa-file-pdf"></i> PDF (LinkedIn)</button>
      </div>
      <p class="hint">Le PDF est le format attendu par LinkedIn pour un carrousel : une page = une slide.</p>

      <div class="section-title"><i class="fa-solid fa-floppy-disk"></i> Projet</div>
      <div class="btn-grid">
        <button class="btn" id="ex-json"><i class="fa-solid fa-file-arrow-down"></i> Sauvegarder (.json)</button>
        <label class="upload">
          <input type="file" accept="application/json,.json" id="ex-import" aria-label="Importer un projet">
          <span class="upload__ui" style="padding:10px"><i class="fa-solid fa-file-arrow-up"></i> Ouvrir un .json</span>
        </label>
      </div>
      <p class="hint">Votre travail est sauvegardé automatiquement dans ce navigateur. Le fichier .json sert à archiver, partager ou versionner un carrousel.</p>

      <button class="btn btn--block btn--danger" id="ex-reset" style="margin-top:16px">
        <i class="fa-solid fa-rotate-left"></i> Repartir de zéro
      </button>`;

    const sc = $('#ex-scale', root); sc.value = String(exportOpts.scale);
    const fo = $('#ex-format', root); fo.value = exportOpts.format;
    sc.addEventListener('change', () => { exportOpts.scale = Number(sc.value); });
    fo.addEventListener('change', () => { exportOpts.format = fo.value; });

    $('#ex-zip', root).addEventListener('click', () => exportAll('zip'));
    $('#ex-pdf', root).addEventListener('click', () => exportAll('pdf'));
    $('#ex-json', root).addEventListener('click', () => X.json(S.get(), X.slug(S.get().name)));

    $('#ex-import', root).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const data = await X.readJSONFile(file);
        S.replace(data, 'import');
        E.openId = null;
        renderAll();
        window.DGToast('Projet chargé.');
      } catch (err) { window.DGToast(err.message, 'error'); }
    });

    $('#ex-reset', root).addEventListener('click', () => {
      if (!confirm('Effacer le carrousel en cours ? (le fichier .json exporté, lui, est conservé)')) return;
      S.replace(S.defaultState(), 'reset');
      seedDemo();
      E.openId = null;
      renderAll();
    });
  }

  /* --------------------------- Exécution des exports --------------------------- */

  function slideNodes() {
    const st = S.get();
    return $$('#board .frame')
      .map((f, i) => ({ node: $('.slide', f), slide: st.slides[i] }))
      .filter((x) => x.node && x.slide && x.slide.visible)
      .map((x) => x.node);
  }

  async function exportOne(frame, absIdx) {
    const node = $('.slide', frame);
    try {
      window.DGToast('Rendu en cours…');
      await X.png(node, `${String(absIdx + 1).padStart(2, '0')}-${X.slug(S.get().name)}`, exportOpts);
      window.DGToast('Image exportée.');
    } catch (err) { window.DGToast(err.message, 'error'); }
  }

  async function exportAll(kind) {
    const nodes = slideNodes();
    if (!nodes.length) return window.DGToast('Aucune slide visible à exporter.', 'error');
    const name = X.slug(S.get().name);
    const progress = (i, n) => window.DGToast(`Rendu ${i}/${n}…`);
    try {
      if (kind === 'zip') await X.zip(nodes, name, exportOpts, progress);
      else await X.pdf(nodes, name, exportOpts, progress);
      window.DGToast('Export terminé.');
    } catch (err) {
      window.DGToast(err.message, 'error');
    }
  }

  /* --------------------------- Démo de départ --------------------------- */

  const DEMO = `Vos pertes en boulangerie
Elles vous coûtent souvent bien plus que ce que vous imaginez.

Quelles sont les principales sources de pertes ?
- Matières premières mal utilisées (farine, beurre, oeufs…)
- Erreurs de fabrication (dosage, cuisson, façonnage…)
- Écarts de stock (réception, inventaire…)
- Surproduction (par rapport à la demande…)
- Produits invendus (en fin de journée…)
- Des petites pertes qui additionnées, pèsent lourd !

3 indicateurs pour mesurer vos pertes
- Écart de consommation : quantité réelle consommée moins prévue
- Taux de pertes : quantité perdue / quantité produite x 100
- Coût des pertes : quantité perdue x coût unitaire

De la donnée à l'action
- Suivre vos ventes en temps réel
- Gérer vos stocks et dates de péremption
- Comparer le réel au théorique via les nomenclatures
- Piloter avec des tableaux de bord

Découvrez nos solutions sur dgsys.fr`;

  function seedDemo() {
    const res = window.DGSmart.build(DEMO, { maxItems: 5, maxSlides: 7, website: 'dgsys.fr' });
    S.commit((s) => {
      s.name = res.name;
      s.slides = res.slides.map((raw) => {
        const def = T.LAYOUTS[raw.layout] || T.LAYOUTS.list;
        const sl = S.makeSlide(raw.layout, S.deepMerge(def.defaults || {}, raw));
        sl.items = (raw.items || []).map((it) => S.makeItem(it));
        return sl;
      });
    }, { silent: true });
  }

  /* --------------------------- Démarrage --------------------------- */

  function boot() {
    E.init({ onPreview: renderPreview, onStructure: renderAll });

    if (!S.load() || !S.get().slides.length) seedDemo();

    $$('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    const nameInput = $('#doc-name');
    nameInput.value = S.get().name;
    nameInput.addEventListener('input', () => {
      S.commit((s) => { s.name = nameInput.value; }, { silent: true });
    });

    $('#undo').addEventListener('click', () => { if (S.undo()) { E.openId = null; renderAll(); } });
    $('#redo').addEventListener('click', () => { if (S.redo()) { E.openId = null; renderAll(); } });
    $('#autofit').addEventListener('click', autoFit);

    // Manipulation directe des calques dans l'aperçu
    window.DGCanvas.init($('#board'), {
      onChange: renderPreview,
      onSelect: () => { if ($('#panel-content').dataset.active === 'true') E.renderContent($('#panel-content')); },
    });

    // Réglages des repères
    const g = () => S.get().options.guides;
    const gToggle = $('#guides-toggle');
    const gPanel = $('#guides-panel');
    const syncGuides = () => {
      const v = g();
      gToggle.setAttribute('aria-pressed', String(!!v.show));
      $('#g-margin').value = v.margin;
      $('#g-margin-out').textContent = v.margin + ' %';
      $('#g-cols').value = v.cols;
      $('#g-thirds').checked = !!v.thirds;
      $('#g-snap').checked = v.snap !== false;
    };
    gToggle.addEventListener('click', () => {
      S.commit((s) => { s.options.guides.show = !s.options.guides.show; });
      syncGuides();
      renderPreview();
    });
    $('#guides-more').addEventListener('click', () => {
      gPanel.hidden = !gPanel.hidden;
    });
    $('#g-margin').addEventListener('input', (e) => {
      $('#g-margin-out').textContent = e.target.value + ' %';
      S.commit((s) => { s.options.guides.margin = Number(e.target.value); }, { silent: true });
      renderPreview();
    });
    $('#g-cols').addEventListener('change', (e) => {
      S.commit((s) => { s.options.guides.cols = Number(e.target.value); });
      renderPreview();
    });
    $('#g-thirds').addEventListener('change', (e) => {
      S.commit((s) => { s.options.guides.thirds = e.target.checked; });
      renderPreview();
    });
    $('#g-snap').addEventListener('change', (e) => {
      S.commit((s) => { s.options.guides.snap = e.target.checked; });
    });
    syncGuides();

    // Dépôt d'un fichier image directement sur une slide de l'aperçu
    window.DGDnd.initDropZone($('#board'), {
      frameSelector: '.frame',
      onDrop: async (frame, file) => {
        const idx = Array.from($('#board').children).indexOf(frame);
        const st = S.get();
        const slide = st.slides[idx];
        if (!slide) return;
        if (!T.LAYOUTS[slide.layout].image) {
          return window.DGToast(
            `La mise en page « ${T.LAYOUTS[slide.layout].label} » n’accepte pas d’image.`, 'error');
        }
        try {
          const src = await X.readImageFile(file);
          S.commit((s) => { const im = s.slides[idx].image; im.src = src; im.credit = null; });
          renderAll();
          window.DGToast('Image appliquée.');
        } catch (err) {
          window.DGToast(err.message, 'error');
        }
      },
    });

    const zoom = $('#zoom');
    zoom.value = previewWidth;
    zoom.addEventListener('input', () => { previewWidth = Number(zoom.value); renderPreview(); });

    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (typing && !e.shiftKey) return; // laisser l'annulation native du champ
        e.preventDefault();
        if (e.shiftKey ? S.redo() : S.undo()) { E.openId = null; renderAll(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        X.json(S.get(), X.slug(S.get().name));
      }
    });

    S.subscribe((st, reason) => {
      if (reason === 'save-failed') {
        window.DGToast('Sauvegarde locale saturée : exportez votre projet en .json.', 'error');
      }
    });

    renderAll();
    // Préchargement des polices : évite un premier export aux glyphes manquants
    X.ensureFonts().catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
