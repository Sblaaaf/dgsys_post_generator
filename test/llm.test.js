/* Tests du pont vers un modèle de langage.
   Le point sensible est la lecture de la réponse : un chat renvoie rarement
   du JSON nu, et un modèle peut inventer des valeurs hors schéma. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const L = require('../assets/js/llm.js');

describe('extractJSON', () => {
  test('lit du JSON nu', () => {
    assert.deepEqual(L.extractJSON('{"a":1}'), { a: 1 });
  });

  test('lit un bloc de code balisé', () => {
    assert.deepEqual(L.extractJSON('Voici le résultat :\n```json\n{"a":1}\n```\nBonne journée !'), { a: 1 });
  });

  test('lit un bloc de code sans langage', () => {
    assert.deepEqual(L.extractJSON('```\n{"a":2}\n```'), { a: 2 });
  });

  test('récupère le JSON noyé dans du bavardage', () => {
    assert.deepEqual(L.extractJSON('Bien sûr ! {"a":3} J’espère que cela convient.'), { a: 3 });
  });

  test('refuse une réponse sans JSON', () => {
    assert.throws(() => L.extractJSON('Je ne peux pas vous aider.'), /Aucun JSON valide/);
  });

  test('refuse une réponse vide', () => {
    assert.throws(() => L.extractJSON('   '), /Rien à analyser/);
  });
});

describe('sanitize', () => {
  const base = { name: 'Test', slides: [{ layout: 'list', palette: 'light', title: 'T', items: [] }] };

  test('remplace un layout inventé par une valeur sûre', () => {
    const out = L.sanitize({ ...base, slides: [{ layout: 'carousel3000', title: 'T' }] });
    assert.equal(out.slides[0].layout, 'list');
  });

  test('remplace une palette inventée', () => {
    const out = L.sanitize({ slides: [{ layout: 'list', palette: 'neon', title: 'T' }] });
    assert.equal(out.slides[0].palette, 'light');
  });

  test('rejette une icône qui n’est pas une classe FontAwesome', () => {
    const out = L.sanitize({ slides: [{ layout: 'list', title: 'T',
      items: [{ icon: 'onerror=alert(1)', title: 'x' }] }] });
    assert.equal(out.slides[0].items[0].icon, 'fa-solid fa-check');
  });

  test('conserve une icône valide', () => {
    const out = L.sanitize({ slides: [{ layout: 'list', title: 'T',
      items: [{ icon: 'fa-solid fa-euro-sign', title: 'x' }] }] });
    assert.equal(out.slides[0].items[0].icon, 'fa-solid fa-euro-sign');
  });

  test('ignore les champs hors schéma', () => {
    const out = L.sanitize({ slides: [{ layout: 'list', title: 'T', onclick: 'alert(1)', style: 'x' }] });
    assert.deepEqual(Object.keys(out.slides[0]).sort(),
      ['bignum', 'cta', 'eyebrow', 'items', 'layout', 'note', 'palette', 'subtitle', 'title']);
  });

  test('applique les plafonds', () => {
    const many = { slides: Array.from({ length: 20 }, () => ({ layout: 'list', title: 'T',
      items: Array.from({ length: 20 }, (_, i) => ({ title: 'i' + i })) })) };
    const out = L.sanitize(many, 4, 3);
    assert.equal(out.slides.length, 4);
    out.slides.forEach((s) => assert.equal(s.items.length, 3));
  });

  test('refuse une réponse sans slides', () => {
    assert.throws(() => L.sanitize({ name: 'x', slides: [] }), /aucune slide/);
    assert.throws(() => L.sanitize(null), /Réponse inattendue/);
  });
});

describe('buildPrompt', () => {
  const prompt = L.buildPrompt({ text: 'Mon sujet', maxSlides: 5, maxItems: 3, brandName: 'DGsys', website: 'dgsys.fr' });

  test('contient le texte source et les contraintes', () => {
    assert.match(prompt, /Mon sujet/);
    assert.match(prompt, /5 slides maximum/);
    assert.match(prompt, /3 éléments maximum/);
    assert.match(prompt, /dgsys\.fr/);
  });

  test('énumère exactement les layouts acceptés par le sanitiseur', () => {
    L.LAYOUTS.forEach((l) => assert.ok(prompt.includes(l), `layout absent du prompt : ${l}`));
  });
});
