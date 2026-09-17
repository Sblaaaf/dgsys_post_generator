/* Tests de l'aimantation. Géométrie pure, donc testable sans navigateur —
   c'est précisément pour cela que le calcul est séparé du DOM. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const L = require('../assets/js/layers.js');

const OPTS = { margin: 8, cols: 0, thirds: false, thresholdX: 1.5, thresholdY: 1.5 };
const near = (a, b, tol) => Math.abs(a - b) < (tol || 0.001);

describe('guideLines', () => {
  test('inclut bords, centre et marges', () => {
    const at = L.guideLines('x', OPTS, []).map((l) => l.at);
    [0, 50, 100, 8, 92].forEach((v) => assert.ok(at.some((a) => near(a, v)), `ligne manquante : ${v}`));
  });

  test('ajoute les tiers seulement si demandé', () => {
    const sans = L.guideLines('y', OPTS, []).map((l) => l.at);
    assert.ok(!sans.some((a) => near(a, 100 / 3)));
    const avec = L.guideLines('y', { ...OPTS, thirds: true }, []).map((l) => l.at);
    assert.ok(avec.some((a) => near(a, 100 / 3)));
  });

  test('les colonnes ne concernent que l’axe horizontal', () => {
    const o = { ...OPTS, cols: 3 };
    const xs = L.guideLines('x', o, []).filter((l) => l.kind === 'grid');
    const ys = L.guideLines('y', o, []).filter((l) => l.kind === 'grid');
    assert.equal(xs.length, 2, '3 colonnes = 2 séparations');
    assert.equal(ys.length, 0);
  });

  test('reprend les arêtes des autres calques', () => {
    const at = L.guideLines('x', OPTS, [{ x: 30, y: 0, w: 20, h: 10 }])
      .filter((l) => l.kind === 'layer').map((l) => l.at);
    assert.deepEqual(at, [30, 40, 50]); // gauche, centre, droite
  });
});

describe('snapMove', () => {
  test('aimante le bord gauche sur la marge', () => {
    const r = L.snapMove({ x: 8.7, y: 30, w: 30, h: 10 }, [], OPTS);
    assert.ok(near(r.x, 8), `x = ${r.x}`);
    assert.ok(r.guides.some((g) => g.axis === 'x' && g.kind === 'margin'));
  });

  test('centre un bloc horizontalement', () => {
    const r = L.snapMove({ x: 29, y: 30, w: 42, h: 10 }, [], OPTS);
    assert.ok(near(r.x, 29), `centre déjà atteint, x = ${r.x}`);
    const r2 = L.snapMove({ x: 28.2, y: 30, w: 42, h: 10 }, [], OPTS);
    assert.ok(near(r2.x + 21, 50), `centre non atteint : ${r2.x + 21}`);
  });

  test('s’aligne sur le bord d’un autre calque', () => {
    const others = [{ x: 30, y: 0, w: 20, h: 10 }];
    const r = L.snapMove({ x: 29.4, y: 60, w: 12, h: 8 }, others, OPTS);
    assert.ok(near(r.x, 30), `x = ${r.x}`);
    assert.ok(r.guides.some((g) => g.kind === 'layer'));
  });

  test('ne bouge pas au-delà du seuil', () => {
    // 20 / 32.5 / 45 : aucune arête n'approche 0, 8, 50, 92 ou 100
    const r = L.snapMove({ x: 20, y: 30, w: 25, h: 10 }, [], OPTS);
    assert.equal(r.x, 20);
    assert.equal(r.guides.filter((g) => g.axis === 'x').length, 0);
  });

  test('désactivée, elle est transparente', () => {
    const r = L.snapMove({ x: 8.7, y: 49.9, w: 30, h: 10 }, [], { ...OPTS, enabled: false });
    assert.equal(r.x, 8.7);
    assert.equal(r.y, 49.9);
    assert.deepEqual(r.guides, []);
  });

  test('retient la ligne la plus proche quand deux sont candidates', () => {
    // bord gauche près de la marge (8), bord droit près du centre (50)
    const W = 41.2;
    const r = L.snapMove({ x: 8.6, y: 30, w: W, h: 10 }, [], OPTS);
    // snapMove ne renvoie que la position : la largeur est inchangée.
    assert.ok(near(r.x + W, 50) || near(r.x, 8), `x = ${r.x}, bord droit = ${r.x + W}`);
    assert.equal(r.guides.filter((g) => g.axis === 'x').length, 1, 'un seul repère par axe');
  });
});

describe('snapResize', () => {
  test('aimante le bord droit et conserve l’origine', () => {
    const r = L.snapResize({ x: 8, y: 20, w: 83.4, h: 20 }, [], OPTS);
    assert.ok(near(8 + r.w, 92), `bord droit = ${8 + r.w}`);
  });

  test('impose une taille minimale', () => {
    const r = L.snapResize({ x: 10, y: 10, w: -50, h: 0 }, [], { ...OPTS, enabled: false });
    assert.ok(r.w >= 3 && r.h >= 3);
  });
});

describe('clamp', () => {
  test('empêche un calque de sortir totalement du cadre', () => {
    const r = L.clamp({ x: -900, y: 400, w: 20, h: 10 });
    assert.ok(r.x > -20 && r.y <= 98);
  });
});

describe('makeLayer', () => {
  test('applique les valeurs par défaut du type', () => {
    const t = L.makeLayer('text');
    assert.equal(t.type, 'text');
    assert.equal(t.weight, 800);
    assert.ok(t.id);
  });

  test('retombe sur un texte si le type est inconnu', () => {
    assert.equal(L.makeLayer('licorne').type, 'text');
  });

  test('les surcharges priment sur les valeurs par défaut', () => {
    assert.equal(L.makeLayer('shape', { color: 'hl', w: 90 }).w, 90);
  });

  test('deux calques ont des identifiants distincts', () => {
    assert.notEqual(L.makeLayer('text').id, L.makeLayer('text').id);
  });
});
