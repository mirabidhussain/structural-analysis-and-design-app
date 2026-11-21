/* IS GeoTech browser test (Playwright): every tab renders, edits flow through, numbers agree with the engine */
const { chromium } = require('playwright');
const path = require('path');
const GC = require('../www/js/gcore.js');
let pass = 0, fail = 0;
function ok(n, c, info) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && info !== undefined ? ' — ' + info : '')); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '../../dist-geotech/index.html')); await pg.evaluate(() => localStorage.clear()); await pg.reload();
  ok('Opens with the sample site: 4 layers, 7 SPT readings', await pg.evaluate(() => ISG.P.boreholes[0].layers.length === 4 && document.querySelectorAll('#sptTab tr').length === 8));
  ok('Layers estimated from SPT are marked', (await pg.textContent('#layers')).includes('SPT estimates'));
  /* open a layer and edit it */
  await pg.click('.lay:nth-child(3) .h'); await pg.fill('.lay.open input[data-k=cu]', '45'); await pg.press('.lay.open input[data-k=cu]', 'Tab'); await pg.waitForTimeout(100);
  ok('Edit a layer: cu of the clay saved', await pg.evaluate(() => ISG.P.boreholes[0].layers[2].cu === 45));
  await pg.click('#bUndo'); ok('Undo restores cu = 30', await pg.evaluate(() => ISG.P.boreholes[0].layers[2].cu === 30));
  /* footing */
  await pg.click('[data-t=footing]'); await pg.waitForTimeout(150);
  const res = await pg.textContent('#fRes'), P = await pg.evaluate(() => ISG.P), a = GC.allowable(P, P.footings[0]);
  ok('Footing tab shows the engine\'s allowable pressure', res.includes(String(Math.round(a.qa))), res.slice(0, 200));
  ok('Sample footing is reported as not satisfactory (settlement)', /Settlement too large/.test(res));
  ok('A working width is suggested', /Smallest width that works at this depth: [\d.]+ m/.test(res), res);
  const failTxt = await pg.textContent('#fFail');
  ok('Which part can fail names the soft clay and its settlement share', /soft silty clay/i.test(failTxt) && /% of the settlement/.test(failTxt));
  ok('Bearing capacity steps listed with IS 6403 clauses', (await pg.$$eval('#fSteps li', l => l.length)) >= 7);
  await pg.fill('#fP', '400'); await pg.press('#fP', 'Tab'); await pg.waitForTimeout(150);
  ok('Lower load → satisfactory', /Satisfactory/.test(await pg.textContent('#fRes')));
  /* pressure bulb */
  await pg.click('[data-t=bulb]'); await pg.waitForTimeout(250);
  const px = await pg.evaluate(() => { const c = document.getElementById('bulbCv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok('Pressure bulb drawn', px > 20000, px);
  await pg.$eval('#bW', el => { el.value = '3'; el.dispatchEvent(new Event('input')); }); await pg.waitForTimeout(150);
  ok('Width slider tries B = 3 m without saving', (await pg.textContent('#bWl')).includes('3.00 m') && await pg.evaluate(() => ISG.P.footings[0].B === 2));
  await pg.click('#bUse'); ok('"Use this width" saves B = 3 m', await pg.evaluate(() => ISG.P.footings[0].B === 3));
  ok('Stress table by layer', (await pg.$$eval('#bTab tr', t => t.length)) >= 3);
  /* lab */
  await pg.click('[data-t=tests]'); await pg.waitForTimeout(100);
  ok('Lab sample classified SM (silty sand)', /SM/.test(await pg.textContent('#tOut')));
  await pg.fill('#tLL', '30'); await pg.press('#tLL', 'Tab'); await pg.fill('#tPL', '18'); await pg.press('#tPL', 'Tab'); await pg.waitForTimeout(100);
  ok('Adding LL 30, PL 18 (PI 12 above A-line) → SC', /SC/.test(await pg.textContent('#tOut')), await pg.textContent('#tOut'));
  /* plate */
  await pg.click('[data-t=plate]'); await pg.waitForTimeout(100);
  const pt = await pg.textContent('#ptOut'), po = GC.plate(P.plates[0], P);
  ok('Plate test result matches the engine', pt.includes(String(Math.round(po.qa))), pt.slice(0, 160));
  /* report */
  await pg.click('[data-t=report]'); await pg.waitForTimeout(200);
  const rp = await pg.textContent('#rBody');
  ok('Report has the profile, classification, footing and plate test', /soil profile/.test(rp) && /IS 1498/.test(rp) && /Allowable net bearing pressure/.test(rp) && /plate load test/.test(rp));
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#rSave')]);
  ok('Report saved as .html', /_report\.html$/.test(dl.suggestedFilename()));
  /* project file */
  await pg.click('#bMenu'); const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-m=save]')]);
  ok('Project saved as .isg.json', /\.isg\.json$/.test(dl2.suggestedFilename()));
  await pg.reload(); ok('Model kept after reload', await pg.evaluate(() => ISG.P.footings[0].B === 3));
  /* new site from scratch */
  pg.once('dialog', d => d.accept()); await pg.click('#bMenu'); await pg.click('[data-m=new]'); await pg.waitForTimeout(150);
  await pg.click('#lAdd'); await pg.click('#sAdd');
  ok('New site: layer and SPT reading added', await pg.evaluate(() => ISG.P.boreholes[0].layers.length === 2 && ISG.P.boreholes[0].spt.length === 1));
  await pg.click('[data-t=footing]'); await pg.waitForTimeout(150);
  ok('New site footing gives a result', /kPa/.test(await pg.textContent('#fRes')));
  await pg.evaluate(() => { document.documentElement.dataset.th = 'dark'; ISG.refresh(); });
  ok('No JavaScript errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
