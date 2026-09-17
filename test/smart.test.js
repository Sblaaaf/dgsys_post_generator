/* Tests du générateur heuristique.
   Lancer :  node --test test/
   Aucune dépendance : on utilise le lanceur intégré de Node 20+. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const S = require('../assets/js/smart.js');
const T = require('../assets/js/templates.js');
const Store = require('../assets/js/store.js');

const SOURCE = `Vos pertes en boulangerie
Elles vous coûtent souvent bien plus que ce que vous imaginez.

Quelles sont les principales sources de pertes ?
- Matières premières mal utilisées (farine, beurre, oeufs...)
- Erreurs de fabrication (dosage, cuisson, façonnage...)
- Écarts de stock (réception, inventaire...)
- Des petites pertes qui additionnées, pèsent lourd !

3 indicateurs pour mesurer vos pertes
- Écart de consommation : quantité réelle consommée moins prévue
- Taux de pertes : quantité perdue / quantité produite x 100

Découvrez nos solutions sur dgsys.fr`;

describe('splitItem', () => {
  test('sépare une parenthèse finale en précision', () => {
    assert.deepEqual(S.splitItem('Écarts de stock (réception, inventaire...)'),
      { title: 'Écarts de stock', sub: '(réception, inventaire...)' });
  });

  test('sépare sur un deux-points', () => {
    assert.deepEqual(S.splitItem('Taux de pertes : quantité perdue / produite'),
      { title: 'Taux de pertes', sub: 'quantité perdue / produite' });
  });

  test('laisse intact un intitulé simple', () => {
    assert.deepEqual(S.splitItem('Surproduction'), { title: 'Surproduction', sub: '' });
  });
});

describe('pickIcon', () => {
  test('associe une icône au champ lexical', () => {
    assert.equal(S.pickIcon('Coût des pertes', false), 'fa-solid fa-euro-sign');
    assert.equal(S.pickIcon('Taux de 12 %', false), 'fa-solid fa-percent');
    assert.equal(S.pickIcon('Écarts de stock', false), 'fa-solid fa-boxes-stacked');
  });

  test('retombe sur une croix en contexte négatif, une coche sinon', () => {
    assert.equal(S.pickIcon('Quelque chose de neutre', true), 'fa-solid fa-xmark');
    assert.equal(S.pickIcon('Quelque chose de neutre', false), 'fa-solid fa-check');
  });
});

describe('emphasizeTail', () => {
  test('surligne après la dernière virgule', () => {
    assert.equal(S.emphasizeTail('Des petites pertes, qui pèsent lourd'),
      'Des petites pertes, **qui pèsent lourd**');
  });

  test('ne double jamais un balisage existant', () => {
    assert.equal(S.emphasizeTail('Déjà **balisé** ici'), 'Déjà **balisé** ici');
  });

  test('laisse une phrase trop courte intacte', () => {
    assert.equal(S.emphasizeTail('Trois mots seulement'), 'Trois mots seulement');
  });
});

describe('isStatLike', () => {
  test('reconnaît un chiffre clé', () => {
    for (const v of ['12 %', '8 400 €', 'x3', '2 h']) assert.ok(S.isStatLike(v), v);
  });
  test('rejette du texte courant', () => {
    assert.equal(S.isStatLike('Écart de consommation'), false);
  });
});

describe('build', () => {
  const res = S.build(SOURCE, { website: 'dgsys.fr' });

  test('encadre le carrousel d’une couverture et d’une conclusion', () => {
    assert.equal(res.slides[0].layout, 'cover');
    assert.equal(res.slides[res.slides.length - 1].layout, 'outro');
  });

  test('détecte le décompte et le transforme en chiffre géant', () => {
    const numbered = res.slides.find((s) => s.layout === 'numbered');
    assert.ok(numbered, 'une slide "numbered" est attendue');
    assert.equal(numbered.bignum, '3');
    assert.ok(!numbered.title.startsWith('3'), 'le chiffre ne doit pas rester dans le titre');
  });

  test('promeut la ligne exclamative en annotation manuscrite', () => {
    const withNote = res.slides.find((s) => s.note);
    assert.ok(withNote, 'une annotation est attendue');
    assert.match(withNote.note, /pèsent lourd !$/);
    assert.ok(!withNote.items.some((i) => /pèsent lourd/.test(i.title)),
      'l’annotation ne doit pas rester dans la liste');
  });

  test('sort l’appel à l’action de la liste des slides de contenu', () => {
    const bodies = res.slides.slice(1, -1);
    assert.ok(!bodies.some((s) => /dgsys\.fr/.test(s.title || '')));
  });

  test('respecte le plafond d’éléments par slide', () => {
    const r = S.build(SOURCE, { maxItems: 2 });
    r.slides.forEach((s) => assert.ok((s.items || []).length <= 2, s.layout));
  });

  test('respecte le plafond de slides', () => {
    const r = S.build(SOURCE, { maxSlides: 3 });
    assert.ok(r.slides.length <= 3, `${r.slides.length} slides`);
  });

  test('gère un texte en prose, sans aucune puce', () => {
    const r = S.build('Un titre net. Une accroche qui pose le sujet. Un premier argument. Un second argument.');
    assert.ok(r.slides.length >= 2);
    assert.equal(r.slides[0].layout, 'cover');
  });

  test('ne casse pas sur une entrée vide', () => {
    assert.deepEqual(S.build('').slides, []);
    assert.deepEqual(S.build('   \n\n ').slides, []);
  });
});

describe('rendu', () => {
  test('chaque slide générée produit du HTML avec tous les layouts connus', () => {
    const st = Store.normalize({});
    const res = S.build(SOURCE, { website: 'dgsys.fr' });
    res.slides.forEach((raw, i) => {
      const def = T.LAYOUTS[raw.layout];
      assert.ok(def, `layout inconnu : ${raw.layout}`);
      const slide = Store.makeSlide(raw.layout, Store.deepMerge(def.defaults || {}, raw));
      slide.items = (raw.items || []).map((it) => Store.makeItem(it));
      const html = T.renderSlide(slide, { state: st, index: i, total: res.slides.length });
      assert.match(html, /^<div class="slide slide--/);
      assert.ok(html.includes('--w:1080'), 'les dimensions d’export doivent être inscrites');
    });
  });

  test('le texte utilisateur est échappé : pas d’injection HTML possible', () => {
    const st = Store.normalize({});
    const slide = Store.makeSlide('list', { title: '<img src=x onerror=alert(1)>', items: [] });
    const html = T.renderSlide(slide, { state: st, index: 0, total: 1 });
    assert.ok(!html.includes('<img'), 'la balise doit être neutralisée');
    assert.ok(html.includes('&lt;img'), 'elle doit apparaître échappée');
  });

  test('la syntaxe **surbrillance** devient un span dédié', () => {
    assert.equal(T.fmt('avant **milieu** après'), 'avant <span class="hl">milieu</span> après');
  });
});
