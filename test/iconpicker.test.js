/* Tests de la recherche d'icônes.
   Le catalogue réel est chargé depuis assets/data/icons.js : ces tests valident
   donc aussi que le fichier généré par tools/build-icons.py est exploitable. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const P = require('../assets/js/iconpicker.js');

// Le catalogue s'attache à `window` : on l'évalue dans un contexte minimal.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'assets', 'data', 'icons.js'), 'utf8'),
  sandbox
);
const DATA = sandbox.window.DGIconData;
const names = (rows) => rows.map((r) => r[0]);

describe('catalogue', () => {
  test('est chargé et volumineux', () => {
    assert.ok(DATA.icons.length > 1500, `${DATA.icons.length} icônes`);
    assert.ok(Object.keys(DATA.categories).length > 20);
  });

  test('chaque ligne a la forme attendue', () => {
    for (const row of DATA.icons.slice(0, 200)) {
      assert.equal(row.length, 4);
      assert.match(row[0], /^[a-z0-9-]+$/);
      assert.match(row[1], /^[srb]+$/);
    }
  });

  test('ne contient que des icônes de la version gratuite', () => {
    assert.ok(DATA.icons.every((r) => r[1].length > 0));
  });
});

describe('filter', () => {
  test('place le nom exact en tête', () => {
    assert.equal(names(P.filter(DATA.icons, 'check', 's', ''))[0], 'check');
  });

  test('trouve par synonyme anglais', () => {
    assert.ok(names(P.filter(DATA.icons, 'tick', 's', '')).includes('check'));
  });

  test('filtre par style', () => {
    const brands = P.filter(DATA.icons, 'facebook', 'b', '');
    assert.ok(brands.length > 0);
    assert.ok(brands.every((r) => r[1].includes('b')));
    // Une marque n'existe pas en Solid
    assert.equal(P.filter(DATA.icons, 'facebook', 's', '').length, 0);
  });

  test('filtre par catégorie', () => {
    const cat = Object.keys(DATA.categories)[0];
    const rows = P.filter(DATA.icons, '', 's', cat);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r[3].split(',').includes(cat)));
  });

  test('sans terme, renvoie tout le style demandé', () => {
    const all = P.filter(DATA.icons, '', 's', '');
    assert.ok(all.length > 1000);
  });

  test('ne renvoie rien pour un terme absurde', () => {
    assert.equal(P.filter(DATA.icons, 'zzzzznotanicon', 's', '').length, 0);
  });
});

describe('alias français', () => {
  test('« pain » donne du pain avant de la peinture', () => {
    const res = names(P.filter(DATA.icons, 'pain', 's', ''));
    assert.ok(res.includes('bread-slice'), 'bread-slice attendu');
    assert.ok(res.indexOf('bread-slice') < res.indexOf('paintbrush'),
      'le résultat français doit primer sur la collision anglaise');
  });

  test('traduit les termes métier courants', () => {
    const cases = { stock: 'warehouse', horloge: 'clock', poubelle: 'trash-can', ampoule: 'lightbulb' };
    for (const [fr, en] of Object.entries(cases)) {
      assert.ok(names(P.filter(DATA.icons, fr, 's', '')).includes(en), `${fr} → ${en}`);
    }
  });

  test('gère les accents', () => {
    assert.ok(names(P.filter(DATA.icons, 'coût', 's', '')).includes('euro-sign'));
    assert.ok(names(P.filter(DATA.icons, 'déchet', 's', '')).includes('recycle'));
  });

  test('needlesFor ajoute la traduction au terme saisi', () => {
    assert.deepEqual(P.needlesFor('horloge'), ['horloge', 'clock']);
    assert.deepEqual(P.needlesFor('gear'), ['gear']);
    assert.deepEqual(P.needlesFor('  '), []);
  });
});
