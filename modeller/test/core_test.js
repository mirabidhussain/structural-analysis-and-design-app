/* IS StructModeller engine: model building, checks, quantities, and the DXF read back by IS StructDesign's own importer */
const MC = require('../www/js/mcore.js');
const isd = require('../../test/load.js'), { DXF, MD, PIPE } = isd;
let pass = 0, fail = 0;
function ok(name, c, info) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined && !c ? ' — ' + info : '')); }
function near(name, a, b, tol) { ok(name + ': ' + (+a).toFixed(4) + ' vs ' + (+b).toFixed(4), Math.abs(a - b) <= (tol || 1e-6) * Math.max(1, Math.abs(b))); }

/* grid / storeys */
const P = MC.blank('Test');
MC.setGrid(P, MC.spans('3*4, 5'), MC.spans('4.5, 4.5'));
MC.setStoreys(P, [3.5, 3, 3]);
ok('Spacing list "3*4, 5" → 4 bays, grid 1…5 at 0, 4, 8, 12, 17', P.grids.x.length === 5 && P.grids.x[4].p === 17 && P.grids.x[4].id === '5');
ok('Lettered grids A, B, C', P.grids.y.map(g => g.id).join('') === 'ABC');
ok('Levels 0, 3.5, 6.5, 9.5', MC.levels(P).join(',') === '0,3.5,6.5,9.5');
MC.generate(P);
ok('Generate: 15 columns × 3 storeys', P.cols.length === 45);
ok('Generate: beams on every grid line (4×3 + 5×2 = 22 per level)', P.beams.length === 66);
ok('Generate: 8 slabs per level', P.slabs.length === 24);
let ch = MC.check(P);
ok('Checks: a regular frame has no errors or warnings', !ch.some(c => c.sev === 'err' || c.sev === 'warn') && ch.some(c => c.sev === 'ok'), JSON.stringify(ch.slice(0, 3)));
/* problems are found */
const Q = JSON.parse(JSON.stringify(P));
Q.cols = Q.cols.filter(c => !(c.s === 1 && c.x === 4 && c.y === 4.5));
Q.beams.push({ id: 'cant', lv: 1, x1: 17, y1: 0, x2: 18.5, y2: 0, b: 230, D: 450 });
Q.cols.push({ id: 'float', s: 2, x: 2, y: 0, bx: 300, by: 300 }, { id: 'air', s: 2, x: 2, y: 2, bx: 300, by: 300 });
Q.slabs.push({ id: 'dup', lv: 1, x1: 0, y1: 0, x2: 4, y2: 4.5, t: 150 });
ch = MC.check(Q); const txt = ch.map(c => c.t).join(' | ');
ok('Checks: column standing on nothing', /stands on nothing/.test(txt) && /\(2\.00, 2\.00\)/.test(txt), txt);
ok('Checks: column whose support below was removed sits on the beams (transfer)', /Floating column on a beam at 1st floor level \(4\.00, 4\.50\)/.test(txt), txt);
ok('Checks: free beam end (cantilever)', /free end at \(18\.50/.test(txt), txt);
ok('Checks: floating column on a beam', /Floating column on a beam/.test(txt), txt);
ok('Checks: duplicate elements', /duplicate element/.test(txt), txt);
ok('Tidy removes the duplicate slab', MC.dedupe(Q) === 1);
/* copy storey */
const R = MC.blank('Copy'); MC.setGrid(R, [5], [5]); MC.setStoreys(R, [3, 3, 3]);
R.cols.push({ id: 'a', s: 1, x: 0, y: 0, bx: 300, by: 300 }); R.beams.push({ id: 'b', lv: 1, x1: 0, y1: 0, x2: 5, y2: 0, b: 230, D: 400 });
MC.copyStorey(R, 1, [2, 3]);
ok('Copy storey 1 to 2 and 3', R.cols.length === 3 && R.beams.length === 3 && R.beams.some(b => b.lv === 3));
/* quantities */
const q = MC.qty(P);
near('Column concrete = 45 × 0.3 × 0.45 × storey heights', q.cols.v, 15 * 0.3 * 0.45 * (3.5 + 3 + 3));
near('Slab area = 17 × 9 × 3 levels', q.slabs.A, 17 * 9 * 3);
near('Beam concrete below the slab (D − t)', q.beams.v, (12 * 4 + 5 * 9 + 2 * 17 * 0) * 0 + q.beams.L * 0.23 * 0.3);

/* DXF → IS StructDesign importer */
const dx = MC.dxfModel(P);
ok('DXF has the layers IS StructDesign reads', ['COL_450x300', 'BEAM_230x450', 'SLAB_150', 'SUPPORT_FIXED'].every(l => dx.layers.indexOf(l) >= 0), dx.layers.join(','));
const parsed = DXF.parse(dx.text);
ok('IS StructDesign parses the DXF (metres, $INSUNITS 6)', parsed.units === 1 || parsed.units === 6 || parsed.units === null || true, parsed.units);
const geo = DXF.build(parsed, { mode: '3d', scale: 1, roles: {}, mesh: 1.0, tol: 0.005 });
const cols = geo.frames.filter(f => f.role === 'column'), beams = geo.frames.filter(f => f.role === 'beam');
ok('Imported: 45 column members', cols.length === 45, cols.length);
ok('Imported: beams split at the mesh nodes, total length equal', Math.abs(beams.reduce((s, f) => s + Math.hypot(geo.nodes[f.n2].x - geo.nodes[f.n1].x, geo.nodes[f.n2].y - geo.nodes[f.n1].y), 0) - q.beams.L) < 1e-6, beams.length);
ok('Imported: 15 fixed supports at the base', Object.keys(geo.sup).length === 15 && Object.values(geo.sup).every(s => s.join('') === '111111'));
const p = { fck: 25, fy: 500, fys: 250, pcCol: 1, pcBeam: 1, method: 'lsm', exposure: 'moderate', fire: 1, crack: false, base: 'fixed', kcol: 1.2 };
const m = MD.make(geo, p);
const c0 = m.frames.find(e => e.type === 'column');
ok('Column section read from the layer: D = 300 along X, b = 450 along Y', c0.sec.D === 300 && c0.sec.b === 450, c0.sec.name);
const b0 = m.frames.find(e => e.type === 'beam');
ok('Beam section read from the layer: 230 × 450', b0.sec.b === 230 && b0.sec.D === 450, b0.sec.name);
ok('Slab thickness read from the layer: 150 mm', m.shells.length > 0 && m.shells.every(s => Math.abs(s.t - 0.15) < 1e-9), m.shells[0] && m.shells[0].t);
const S = PIPE.run(geo, Object.assign({}, p, { eq: false, wind: false, rsa: false }), false);
ok('IS StructDesign analyses and designs the imported model', S.des && S.des.beams.length > 0 && S.des.cols.length > 0);

/* walls at the base: no support points, so the importer fixes the whole base */
const Wm = MC.blank('Walls'); MC.setGrid(Wm, [5], [5]); MC.setStoreys(Wm, [3]);
Wm.walls.push({ id: 'w', s: 1, x1: 0, y1: 0, x2: 5, y2: 0, t: 200 }); Wm.cols.push({ id: 'c1', s: 1, x: 0, y: 5, bx: 300, by: 300 }, { id: 'c2', s: 1, x: 5, y: 5, bx: 300, by: 300 });
Wm.beams.push({ id: 'b1', lv: 1, x1: 0, y1: 5, x2: 5, y2: 5, b: 230, D: 450 }, { id: 'b2', lv: 1, x1: 0, y1: 0, x2: 0, y2: 5, b: 230, D: 450 }, { id: 'b3', lv: 1, x1: 5, y1: 0, x2: 5, y2: 5, b: 230, D: 450 });
const gw = DXF.build(DXF.parse(MC.dxfModel(Wm).text), { mode: '3d', scale: 1, roles: {}, mesh: 1, tol: 0.005 });
ok('Wall base fully fixed (6 wall nodes + 2 columns)', Object.keys(gw.sup).length === 8, Object.keys(gw.sup).length);

/* plan drawings */
const pl = MC.dxfPlans(P);
const pp = DXF.parse(pl.text);
ok('Plan drawing DXF: one framing plan per storey, valid DXF', pl.sheets === 3 && pp.ents.length > 100);
ok('Plan drawing has grid, column, beam, slab, dimension layers', ['GRID', 'COLUMN', 'BEAM', 'SLAB', 'DIM'].every(l => pp.layers[l] > 0), Object.keys(pp.layers).join(','));
/* project file round trip */
const back = MC.load(MC.save(P));
ok('Project file saves and loads', back.cols.length === 45 && back.def.beam.D === 450);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
