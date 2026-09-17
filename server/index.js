/* =========================================================================
   server/index.js — Proxy minimal vers l'API Claude (Node 20 + Express 4)
   -------------------------------------------------------------------------
   Pourquoi un serveur alors que l'application est une page statique ?
   Parce qu'une clé API placée dans du JavaScript de navigateur est lisible
   par n'importe quel visiteur. Elle reste donc ici, côté serveur, et le
   navigateur ne connaît qu'un point d'entrée sans secret.

   L'application fonctionne sans ce service : le générateur heuristique
   embarqué (assets/js/smart.js) prend le relais.
   ========================================================================= */
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT) || 8787;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const MAX_TEXT = 20000;

/* Liste blanche des mises en page : elle vient du serveur, jamais du client.
   Sans cela, un appelant pourrait injecter n'importe quelle valeur dans le
   schéma envoyé au modèle. */
const LAYOUTS = ['cover', 'list', 'numbered', 'split', 'grid', 'stats', 'steps', 'quote', 'bigtext', 'outro'];
const PALETTES = ['dark', 'light', 'accent', 'soft'];

const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

/* --- CORS : une seule origine autorisée, configurable --- */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGIN === '*' || origin === ALLOWED_ORIGIN)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* --- Limitation de débit : seau à jetons en mémoire, par IP ---
   Suffisant pour un usage interne. Pour une exposition publique, préférez
   un stockage partagé (Redis) afin que la limite survive aux redémarrages
   et tienne sur plusieurs instances. */
const buckets = new Map();
const RATE = { capacity: 10, refillPerSec: 10 / 60 };
function rateLimit(req, res, next) {
  const key = req.ip || 'anon';
  const now = Date.now() / 1000;
  const b = buckets.get(key) || { tokens: RATE.capacity, at: now };
  b.tokens = Math.min(RATE.capacity, b.tokens + (now - b.at) * RATE.refillPerSec);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return res.status(429).json({ error: 'Trop de requêtes, réessayez dans une minute.' });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  next();
}

/* --- Schéma de sortie imposé au modèle --- */
const itemSchema = {
  type: 'object',
  properties: {
    icon: { type: 'string', description: 'Classe FontAwesome 6 Free, ex. "fa-solid fa-euro-sign"' },
    title: { type: 'string' },
    sub: { type: 'string' },
  },
  required: ['icon', 'title', 'sub'],
  additionalProperties: false,
};

const carouselSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Titre court du carrousel' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          layout: { type: 'string', enum: LAYOUTS },
          palette: { type: 'string', enum: PALETTES },
          eyebrow: { type: 'string' },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          bignum: { type: 'string' },
          cta: { type: 'string' },
          note: { type: 'string' },
          items: { type: 'array', items: itemSchema },
        },
        required: ['layout', 'palette', 'eyebrow', 'title', 'subtitle', 'bignum', 'cta', 'note', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'slides'],
  additionalProperties: false,
};

const SYSTEM = `Tu es directeur artistique et rédacteur pour des carrousels de réseaux sociaux en français.

À partir d'un texte brut, tu produis un carrousel prêt à publier.

Règles de rédaction :
- Français naturel, phrases courtes, voix active. Pas de jargon marketing creux.
- Un titre de slide ne dépasse pas 60 caractères, un intitulé d'élément 45 caractères.
- Encadre de **doubles astérisques** le fragment à mettre en surbrillance : un
  seul fragment par titre, jamais le titre entier, de préférence la fin.
- Le champ "note" est une annotation manuscrite : très court, oral, avec du relief.
- N'invente aucun chiffre qui ne figure pas dans le texte source.

Règles de structure :
- Première slide : layout "cover". Dernière : layout "outro".
- Alterne les fonds (palette) pour créer du rythme : jamais trois slides de suite
  avec la même valeur.
- Choisis le layout selon le contenu : "stats" pour des chiffres clés,
  "steps" pour une méthode chronologique, "numbered" quand le titre annonce un
  décompte, "grid" pour quatre points courts et symétriques, "list" par défaut.
- "bignum" ne se remplit que pour le layout "numbered".
- Les icônes sont des classes FontAwesome 6 Free (gratuites), forme
  "fa-solid fa-<nom>", cohérentes avec le sens de l'élément.
- Laisse une chaîne vide pour tout champ non pertinent — ne le supprime pas.`;

app.get('/health', (_req, res) => res.json({ ok: true, model: MODEL }));

app.post('/api/generate', rateLimit, async (req, res) => {
  const { text, brief, maxSlides, maxItems, brand } = req.body || {};

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Le champ "text" est requis.' });
  }
  if (text.length > MAX_TEXT) {
    return res.status(413).json({ error: `Texte trop long (${text.length} caractères, maximum ${MAX_TEXT}).` });
  }

  const nSlides = Math.min(12, Math.max(2, Number(maxSlides) || 8));
  const nItems = Math.min(7, Math.max(2, Number(maxItems) || 5));
  const brandName = String((brand && brand.name) || '').slice(0, 60);
  const website = String((brand && brand.website) || '').slice(0, 80);

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: carouselSchema },
      },
      messages: [{
        role: 'user',
        content: [
          `Marque : ${brandName || '(non précisée)'}${website ? ` — ${website}` : ''}`,
          `Contrainte : ${nSlides} slides maximum, ${nItems} éléments maximum par slide.`,
          brief ? `Intention éditoriale : ${String(brief).slice(0, 400)}` : '',
          '',
          'Texte source :',
          '"""',
          text,
          '"""',
        ].filter(Boolean).join('\n'),
      }],
    });

    if (message.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'La demande a été déclinée par le modèle.' });
    }

    const raw = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Réponse du modèle illisible.' });
    }

    res.json(sanitize(data, nSlides, nItems));
  } catch (err) {
    // On distingue les erreurs réessayables des erreurs définitives : le client
    // ne doit pas relancer une requête qui échouera de la même façon.
    const status = err && err.status;
    if (status === 401 || status === 403) {
      return res.status(500).json({ error: 'Clé API absente ou invalide côté serveur.' });
    }
    if (status === 429) return res.status(429).json({ error: 'Quota Anthropic atteint, réessayez plus tard.' });
    if (status && status >= 500) return res.status(503).json({ error: 'Service Anthropic momentanément indisponible.' });
    console.error('[generate]', err && err.message);
    res.status(500).json({ error: 'Erreur interne lors de la génération.' });
  }
});

/** Dernier filet : on ne renvoie au navigateur que des valeurs conformes. */
function sanitize(data, nSlides, nItems) {
  const str = (v) => (typeof v === 'string' ? v.slice(0, 400) : '');
  const slides = Array.isArray(data.slides) ? data.slides.slice(0, nSlides) : [];
  return {
    name: str(data.name) || 'Carrousel',
    slides: slides.map((s) => ({
      layout: LAYOUTS.includes(s.layout) ? s.layout : 'list',
      palette: PALETTES.includes(s.palette) ? s.palette : 'light',
      eyebrow: str(s.eyebrow),
      title: str(s.title),
      subtitle: str(s.subtitle),
      bignum: str(s.bignum).slice(0, 4),
      cta: str(s.cta),
      note: str(s.note),
      items: (Array.isArray(s.items) ? s.items : []).slice(0, nItems).map((it) => ({
        icon: /^fa-(solid|regular|brands) fa-[a-z0-9-]+$/.test(it && it.icon) ? it.icon : 'fa-solid fa-check',
        title: str(it && it.title),
        sub: str(it && it.sub),
      })),
    })),
  };
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[dgsys-ai] prêt sur http://localhost:${PORT} — modèle ${MODEL}`);
  console.log(`[dgsys-ai] origine autorisée : ${ALLOWED_ORIGIN}`);
});

export { app, sanitize, LAYOUTS, PALETTES };
