/* =========================================================================
   llm.js — Assistance par modèle de langage, sans serveur
   -------------------------------------------------------------------------
   Deux voies, aucune obligatoire :

   1. Le pont copier-coller. L'application fabrique un prompt complet ; vous
      le collez dans l'interface web de votre choix (ChatGPT gratuit, Le Chat,
      Gemini…) et recollez la réponse ici. Aucune clé, aucun coût, aucun appel
      réseau depuis la page.

   2. Un appel direct à une API au format OpenAI. Le même format est accepté
      par OpenAI, Groq, OpenRouter, et par Ollama ou LM Studio en local —
      ces deux derniers étant gratuits, hors ligne et sans clé.

   Note importante : il n'existe pas d'API gratuite donnant accès à ChatGPT.
   L'abonnement ChatGPT et l'API OpenAI sont deux produits distincts, et
   l'API est facturée à l'usage. C'est précisément ce que la voie 1 contourne.
   ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DGLLM = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const KEY_STORE = 'dgsys.llm.config';

  /* Fournisseurs pré-réglés. `local` ne demande aucune clé : c'est la seule
     option réellement gratuite et illimitée. */
  const PROVIDERS = {
    ollama: {
      label: 'Ollama (local, gratuit)',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      needsKey: false,
      note: 'Installez Ollama puis lancez « ollama pull llama3.1 ». '
          + 'Tourne sur votre machine : aucun coût, aucune donnée envoyée.',
    },
    lmstudio: {
      label: 'LM Studio (local, gratuit)',
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      needsKey: false,
      note: 'Démarrez le serveur local depuis LM Studio, onglet « Developer ».',
    },
    openai: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      needsKey: true,
      note: 'Facturé à l’usage — indépendant de votre abonnement ChatGPT.',
    },
    groq: {
      label: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      needsKey: true,
      note: 'Palier gratuit généreux, très rapide. Clé sur console.groq.com.',
    },
    openrouter: {
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      needsKey: true,
      note: 'Donne accès à plusieurs modèles gratuits (suffixe « :free »).',
    },
  };

  const LAYOUTS = ['cover', 'list', 'numbered', 'split', 'grid', 'stats', 'steps', 'quote', 'bigtext', 'outro'];
  const PALETTES = ['dark', 'light', 'accent', 'soft'];

  /* ------------------------------ Configuration ------------------------------ */

  function loadConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
      return Object.assign({ provider: 'ollama' }, c);
    } catch (e) { return { provider: 'ollama' }; }
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(KEY_STORE, JSON.stringify(cfg)); } catch (e) { /* quota */ }
  }

  /* ------------------------------ Le prompt ------------------------------ */

  /**
   * Construit l'instruction complète, utilisable telle quelle dans n'importe
   * quelle interface de chat.
   */
  function buildPrompt(opts) {
    const o = opts || {};
    return `Tu es directeur artistique et rédacteur de carrousels pour les réseaux sociaux, en français.

À partir du texte source ci-dessous, produis un carrousel prêt à publier.
Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans bloc de code.

Structure attendue :
{
  "name": "titre court du carrousel",
  "slides": [
    {
      "layout": "un parmi ${LAYOUTS.join(' | ')}",
      "palette": "un parmi ${PALETTES.join(' | ')}",
      "eyebrow": "sur-titre court, ou chaîne vide",
      "title": "titre de la slide",
      "subtitle": "sous-titre, ou chaîne vide",
      "bignum": "chiffre géant, uniquement pour layout numbered, sinon chaîne vide",
      "cta": "appel à l'action, uniquement pour layout outro, sinon chaîne vide",
      "note": "annotation manuscrite très courte, ou chaîne vide",
      "items": [ { "icon": "fa-solid fa-check", "title": "intitulé", "sub": "précision ou chaîne vide" } ]
    }
  ]
}

Règles de rédaction :
- Phrases courtes, voix active, français naturel. Pas de jargon marketing creux.
- Un titre de slide fait 60 caractères maximum, un intitulé d'élément 45 maximum.
- Encadre de **doubles astérisques** le fragment à surligner : UN SEUL par titre,
  jamais le titre entier, de préférence à la fin.
- "note" est une annotation manuscrite : très courte, orale, avec du relief.
- N'invente aucun chiffre absent du texte source.

Règles de structure :
- Première slide : layout "cover". Dernière : layout "outro".
- Alterne les valeurs de "palette" : jamais trois slides consécutives identiques.
- Choisis le layout selon le contenu : "stats" pour des chiffres clés, "steps" pour
  une méthode chronologique, "numbered" quand le titre annonce un décompte,
  "grid" pour quatre points courts et symétriques, "list" par défaut.
- Les icônes sont des classes FontAwesome 6 Free, forme "fa-solid fa-<nom>",
  cohérentes avec le sens de l'élément.
- Tout champ non pertinent vaut la chaîne vide — ne le supprime jamais.

Contraintes : ${o.maxSlides || 8} slides maximum, ${o.maxItems || 5} éléments maximum par slide.
Marque : ${o.brandName || '(non précisée)'}${o.website ? ' — ' + o.website : ''}.
${o.brief ? 'Intention éditoriale : ' + o.brief : ''}

Texte source :
"""
${o.text || ''}
"""`;
  }

  /* ------------------------------ Lecture de la réponse ------------------------------ */

  /**
   * Extrait un objet JSON d'une réponse de chat, qui contient très souvent du
   * texte d'accompagnement ou un bloc de code malgré la consigne.
   */
  function extractJSON(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('Rien à analyser.');

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates = [];
    if (fenced) candidates.push(fenced[1]);
    candidates.push(text);
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));

    for (const c of candidates) {
      try { return JSON.parse(c.trim()); } catch (e) { /* on essaie le suivant */ }
    }
    throw new Error('Aucun JSON valide trouvé dans la réponse. Vérifiez que vous avez collé la réponse entière.');
  }

  /**
   * Filtre la sortie du modèle avant de l'injecter dans l'application.
   * Un modèle peut inventer un layout, une classe CSS ou un champ : rien de
   * ce qui n'est pas explicitement attendu ne doit passer.
   */
  function sanitize(data, maxSlides, maxItems) {
    if (!data || typeof data !== 'object') throw new Error('Réponse inattendue.');
    const str = (v) => (typeof v === 'string' ? v.slice(0, 400) : '');
    const slides = Array.isArray(data.slides) ? data.slides : [];
    if (!slides.length) throw new Error('La réponse ne contient aucune slide.');

    return {
      name: str(data.name) || 'Carrousel',
      slides: slides.slice(0, maxSlides || 12).map((s) => ({
        layout: LAYOUTS.includes(s && s.layout) ? s.layout : 'list',
        palette: PALETTES.includes(s && s.palette) ? s.palette : 'light',
        eyebrow: str(s && s.eyebrow),
        title: str(s && s.title),
        subtitle: str(s && s.subtitle),
        bignum: str(s && s.bignum).slice(0, 4),
        cta: str(s && s.cta),
        note: str(s && s.note),
        items: (Array.isArray(s && s.items) ? s.items : []).slice(0, maxItems || 7).map((it) => ({
          icon: /^fa-(solid|regular|brands) fa-[a-z0-9-]+$/.test(it && it.icon) ? it.icon : 'fa-solid fa-check',
          title: str(it && it.title),
          sub: str(it && it.sub),
        })),
      })),
    };
  }

  /* ------------------------------ Appel direct ------------------------------ */

  async function complete(cfg, prompt) {
    const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('URL de l’API manquante.');

    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

    let r;
    try {
      r = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e) {
      throw new Error(/localhost|127\.0\.0\.1/.test(base)
        ? 'Serveur local injoignable. Vérifiez qu’Ollama ou LM Studio tourne, et qu’il autorise cette origine (variable OLLAMA_ORIGINS).'
        : 'Appel impossible. Le fournisseur refuse peut-être les requêtes venant d’un navigateur (CORS) — utilisez alors le pont copier-coller.');
    }

    if (r.status === 401 || r.status === 403) throw new Error('Clé refusée par le fournisseur.');
    if (r.status === 429) throw new Error('Quota atteint. Réessayez plus tard.');
    if (!r.ok) throw new Error(`Le fournisseur a répondu ${r.status} — ${(await r.text()).slice(0, 160)}`);

    const d = await r.json();
    const content = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (!content) throw new Error('Réponse vide.');
    return content;
  }

  return { PROVIDERS, LAYOUTS, PALETTES, buildPrompt, extractJSON, sanitize, complete, loadConfig, saveConfig };
});
