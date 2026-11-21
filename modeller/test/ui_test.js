/* IS StructModeller browser test (Playwright + Chrome): setup → generate → draw → edit → checks → export, and the exported DXF imports into IS StructDesign */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const isd = require('../../test/load.js'), { DXF, MD } = isd;
let pass = 0, fail = 0;
function ok(n, c, info) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && info !== undefined ? ' — ' + info : '')); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '../../dist-modeller/index.html')); await pg.evaluate(() => localStorage.clear()); await pg.reload();
  ok('Opens with the sample building', await pg.evaluate(() => ISM.P.cols.length === 64 && ISM.P.storeys.length === 4));
  /* setup: a new 3 × 2 bay, 3-storey frame */
  await pg.fill('#sGx', '2*5, 4'); await pg.fill('#sGy', '4.5, 4'); await pg.fill('#sHs', '3.5, 2*3');
  pg.once('dialog', d => d.accept()); await pg.click('#bGen'); await pg.waitForTimeout(200);
  let st = await pg.evaluate(() => ({ c: ISM.P.cols.length, b: ISM.P.beams.length, s: ISM.P.slabs.length, tab: document.querySelector('#tabs .on').dataset.t }));
  ok('Generate: 12 columns × 3, 17 beams × 3, 6 slabs × 3, opens the plan', st.c === 36 && st.b === 51 && st.s === 18 && st.tab === 'plan', JSON.stringify(st));
  /* delete a beam by tapping it, add it back with the beam tool */
  const tap = async (x, y) => { const p = await pg.evaluate(([x, y]) => ISM.W2S(x, y), [x, y]); const r = await pg.$eval('#pc', c => { const q = c.getBoundingClientRect(); return [q.left, q.top]; }); await pg.mouse.click(r[0] + p[0], r[1] + p[1]); await pg.waitForTimeout(60); };
  await pg.click('[data-tool=del]'); await tap(2.5, 0);
  ok('Delete tool removes the beam tapped', await pg.evaluate(() => ISM.P.beams.filter(b => b.lv === 1).length === 16));
  await pg.click('[data-tool=beam]'); await tap(0.03, 0.02); await tap(5.02, -0.03); await pg.click('#pFin');
  st = await pg.evaluate(() => ISM.P.beams.filter(b => b.lv === 1 && b.y1 === 0 && b.y2 === 0 && Math.min(b.x1, b.x2) === 0 && Math.max(b.x1, b.x2) === 5).length);
  ok('Beam tool: two taps near grid points snap to A-1 and A-2', st === 1, st);
  /* a cantilever column-free beam end is reported */
  await pg.click('[data-tool=beam]'); await tap(14, 0); await tap(15.5, 0); await pg.click('#pFin');
  /* add a wall and a column off-grid */
  await pg.click('[data-tool=wall]'); await tap(0, 4.5); await tap(0, 8.5);
  await pg.click('[data-tool=col]'); await tap(7.5, 2.25);
  st = await pg.evaluate(() => ({ w: ISM.P.walls.length, c: ISM.P.cols.filter(c => c.s === 1 && c.x === 7.5 && c.y === 2.25).length }));
  ok('Wall tool and off-grid column (snapped to 50 mm)', st.w === 1 && st.c === 1, JSON.stringify(st));
  /* select and edit a column */
  await pg.click('[data-tool=sel]'); await tap(5, 4.5); await pg.waitForSelector('#eBx');
  await pg.fill('#eBx', '400'); await pg.fill('#eBy', '600'); await pg.click('#eAll');
  st = await pg.evaluate(() => ISM.P.cols.filter(c => c.s === 1 && c.bx === 400 && c.by === 600).length);
  ok('Select a column, "Apply to all alike" resizes the storey\'s 13 columns of that size (12 on grid + 1 added)', st === 13, st);
  /* undo / redo */
  await pg.click('#bUndo'); const u = await pg.evaluate(() => ISM.P.cols.filter(c => c.bx === 400).length); await pg.click('#bRedo'); const r2 = await pg.evaluate(() => ISM.P.cols.filter(c => c.bx === 400).length);
  ok('Undo and redo', u === 0 && r2 === 13, u + '/' + r2);
  /* copy storey 1 to 2–3 */
  pg.once('dialog', d => d.accept('2-3')); await pg.click('#aCopy'); await pg.waitForTimeout(100);
  st = await pg.evaluate(() => ({ c: ISM.P.cols.filter(c => c.bx === 400).length, w: ISM.P.walls.length }));
  ok('Copy storey to 2–3 carries the edits up', st.c === 39 && st.w === 3, JSON.stringify(st));
  /* checks */
  await pg.click('[data-t=checks]'); const ct = await pg.textContent('#chkList');
  ok('Checks list the cantilever beam end and the off-grid column above nothing', /free end at \(15\.50/.test(ct), ct.slice(0, 200));
  /* 3D and quantities render */
  await pg.click('[data-t=v3d]'); await pg.waitForTimeout(150);
  const px = await pg.evaluate(() => { const c = document.getElementById('tc'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok('3D view draws the building', px > 5000, px);
  await pg.click('[data-t=qty]'); const qt = await pg.textContent('#qtyBox');
  ok('Quantities table', /Total concrete/.test(qt) && /Floor area/.test(qt));
  /* export DXF (download) and import it into IS StructDesign */
  await pg.click('[data-t=export]');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#eDxf')]);
  const file = await dl.path(), text = fs.readFileSync(file, 'utf8');
  ok('Analysis DXF downloaded as <name>_model.dxf', /_model\.dxf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const geo = DXF.build(DXF.parse(text), { mode: '3d', scale: 1, roles: {}, mesh: 1, tol: 0.005 });
  const m = MD.make(geo, { fck: 25, fy: 500, fys: 250, pcCol: 1, pcBeam: 1, method: 'lsm', exposure: 'moderate', fire: 1, base: 'fixed', kcol: 1.2 });
  const big = m.frames.filter(e => e.type === 'column' && e.sec.D === 400 && e.sec.b === 600).reduce((t, e) => t + e.L, 0);
  ok('IS StructDesign reads it: the edited 400 (X) × 600 (Y) columns, 13 per storey over 9.5 m, and the walls', Math.abs(big - 13 * 9.5) < 1e-6 && m.shells.some(s => s.kind === 'wall'), big);
  const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('#ePlans')]);
  const pt = fs.readFileSync(await dl2.path(), 'utf8');
  ok('Framing plans DXF downloaded and readable', /GROUND FLOOR — FRAMING PLAN/.test(pt) && DXF.parse(pt).ents.length > 100);
  /* project save / reload persistence */
  await pg.reload(); ok('Model kept on the device after a reload', await pg.evaluate(() => ISM.P.walls.length === 3));
  ok('No JavaScript errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
