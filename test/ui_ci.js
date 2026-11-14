/* Browser (UI) acceptance test for CI. Fails (exit 1) on any JavaScript error or missing result.
   Local: CHROME_PATH=/usr/bin/google-chrome node test/ui_ci.js   ·   CI: npx playwright install chromium */
const { chromium } = require('playwright');
let pass = 0, fail = 0;
function ok(n, c, i) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.evaluate(() => localStorage.clear());
  const ids = await pg.evaluate(() => ISD.modules.map(m => m.id));
  ok('Home lists all design modules', ids.length >= 15, ids.length + ' modules');
  for (const id of ids) {
    await pg.evaluate(i => { location.hash = '#' + i; }, id); await pg.waitForTimeout(120);
    await pg.click('button.pri'); await pg.waitForTimeout(200);
    const r = await pg.evaluate(() => { const x = document.querySelector('#out .badge'), e = document.querySelector('#out .err'); return { badge: x ? x.textContent : null, err: e ? e.textContent : null }; });
    ok('Module "' + id + '" produces a report with defaults (all inputs blank)', !!r.badge && !r.err, r.badge || r.err || 'no report');
  }
  await pg.evaluate(() => { location.hash = '#model'; }); await pg.waitForTimeout(300);
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 60000 });
  ok('Frame & FE analysis (linear) runs on the default 3D model', await pg.$('#results table.basis') !== null);
  const seis = await pg.evaluate(() => { const h = [...document.querySelectorAll('#results h4')].map(x => x.textContent); return { modal: h.some(t => /Modal analysis/.test(t)), rs: h.some(t => /Response spectrum/.test(t)), cr: h.some(t => /Centre of mass/.test(t)), irr: h.some(t => /Vertical irregularity/.test(t)), modes: [...document.querySelectorAll('#vState option')].filter(o => /^Mode /.test(o.textContent)).length }; });
  ok('Seismic results: modal, response spectrum, CM/CR, irregularity', seis.modal && seis.rs && seis.cr && seis.irr, JSON.stringify(seis));
  const modeOpt = await pg.evaluate(() => [...document.querySelectorAll('#vState option')].find(o => /^Mode 1/.test(o.textContent)).textContent);
  await pg.selectOption('#vDisp', 'def'); await pg.selectOption('#vState', modeOpt); await pg.waitForTimeout(200);
  ok('Mode shape can be displayed', /Max displacement/.test(await pg.textContent('#leg')), modeOpt);
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#results .bXls')]);
  ok('Excel export downloads an .xlsx', /\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await pg.click('#p2 > h3'); await pg.selectOption('[data-k=method]', 'wsm');
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 60000 });
  ok('Working stress method switch', /Working stress/.test(await pg.textContent('#results .rh')));
  ok('No JavaScript errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
