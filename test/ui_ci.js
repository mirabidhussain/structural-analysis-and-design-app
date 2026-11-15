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
  const det = await pg.evaluate(() => { const o = [...document.querySelectorAll('#dtSel option')].map(x => x.value); return { n: o.length, kinds: [...new Set(o.map(v => v[0]))].join(''), svg: document.querySelectorAll('#dtView svg.dwg').length, bbs: /Cut length/.test(document.querySelector('#dtView').textContent) }; });
  ok('Detailing: beam drawings and bar bending schedule shown', det.svg >= 3 && det.bbs && det.kinds === 'bcsf', JSON.stringify(det));
  for (const k of ['c', 's', 'f']) { const v = await pg.evaluate(k0 => [...document.querySelectorAll('#dtSel option')].find(o => o.value[0] === k0).value, k); await pg.selectOption('#dtSel', v); }
  ok('Detailing: column, slab and footing views render', await pg.evaluate(() => document.querySelectorAll('#dtView svg.dwg').length >= 2 && /Cut length/.test(document.querySelector('#dtView').textContent)));
  const [dxfDl] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('#bDtDxf')]);
  ok('Standards register and verification status shown (IS 1893:2016 reinstated)', await pg.evaluate(() => /Standards register/.test(document.querySelector('#results').textContent) && /withdrawn by BIS/.test(document.querySelector('#results').textContent) && /Not implemented/.test(document.querySelector('#results').textContent)));
  ok('Joint shear and strong-column checks reported', await pg.evaluate(() => /Beam–column joints/.test(document.querySelector('#results').textContent) && /Strong column – weak beam/.test(document.querySelector('#results').textContent)));
  ok('Detail drawings DXF downloads', /detailing\.dxf$/.test(dxfDl.suggestedFilename()), dxfDl.suggestedFilename());
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#results .bXls')]);
  ok('Excel export downloads an .xlsx', /\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await pg.click('#p2 > h3'); await pg.selectOption('[data-k=method]', 'wsm');
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 60000 });
  ok('Working stress method switch', /Working stress/.test(await pg.textContent('#results .rh')));
  /* ---- professional platform ---- */
  await pg.evaluate(() => { location.hash = '#model'; }); await pg.waitForTimeout(400);
  const sel0 = await pg.$('#p2 [data-k=method]'); if (sel0) { await pg.selectOption('#p2 [data-k=method]', 'lsm'); }
  await pg.click('#bAna'); await pg.waitForSelector('#results .rep.pro', { timeout: 90000 });
  await pg.click('#vMode'); await pg.waitForSelector('.vitem', { timeout: 10000 });
  const vb = await pg.evaluate(() => ({ cls: document.querySelector('.vbox b').textContent, items: document.querySelectorAll('.vitem').length, chips: document.querySelectorAll('#results h4 .vchip').length }));
  ok('Verification mode: status, design summary, checklist and chips', vb.items > 3 && vb.chips >= 2 && /Not acceptable|Calculated result/.test(vb.cls), JSON.stringify(vb));
  await pg.fill('#vBy', 'Checker'); await pg.click('.vitem [data-vs=ok]'); await pg.waitForTimeout(300);
  ok('Verification: an item can be accepted and is signed', /Accepted by Checker/.test(await pg.textContent('#results')));
  await pg.evaluate(() => document.querySelectorAll('.rep.pro details').forEach(d => d.open = true));
  await pg.fill('input.rate[data-ri=rcs]', '6500'); await pg.dispatchEvent('input.rate[data-ri=rcs]', 'change'); await pg.waitForTimeout(300);
  const bq = await pg.evaluate(() => { const t = document.querySelector('#results').textContent; return { sor: /JKSOR 5\.34\.2/.test(t), own: /own rate/.test(t), gst: /GST 18 %/.test(t), total: /Estimated cost incl\. GST/.test(t), mas: /Brick masonry/.test(t) }; });
  ok('BOQ: whole-building items priced with JKSOR 2022, own rate overrides, abstract with GST', bq.sor && bq.own && bq.gst && bq.total && bq.mas, JSON.stringify(bq));
  const vol = async () => pg.evaluate(() => { const r = [...document.querySelectorAll('#results tr')].find(tr => /Brick masonry \(class 7\.5\) in CM 1:6 in superstructure/.test(tr.textContent)); return r ? parseFloat(r.children[3].textContent.replace(/,/g, '')) : null; });
  const v230 = await vol();
  await pg.evaluate(() => { const e = document.querySelector('[data-k=mT]'); e.value = '115'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.evaluate(() => document.querySelector('#bBoq').click()); await pg.waitForTimeout(600); const v115 = await vol();
  ok('BOQ: "Recalculate BOQ" applies a new masonry thickness without re-analysis', v230 > 0 && Math.abs(v115 / v230 - 115 / 230) < 0.02, v230 + ' → ' + v115);
  await pg.evaluate(() => { const e = document.querySelector('[data-k=mT]'); e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); });
  ok('Load inputs: snow, pattern load, imposed-load reduction, exposure and fire are on the form', await pg.evaluate(() => ['snow', 's0', 'mu', 'pattern', 'llRed', 'exposure', 'fire', 'gst', 'sorOn'].every(k => document.querySelector('[data-k=' + k + ']'))));
  /* mat foundation */
  const setK = (k, v) => pg.evaluate(([k, v]) => { const e = document.querySelector('[data-k=' + k + ']'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);
  await setK('found', 'mat'); await setK('sbc', '100');
  await pg.evaluate(() => document.querySelector('#bAna').click()); await pg.waitForFunction(() => document.querySelector('#dtSel option[value=m0]'), null, { timeout: 120000 });
  await pg.evaluate(() => { const s = document.querySelector('#dtSel'); s.value = 'm0'; s.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(300);
  const mv = await pg.evaluate(() => { const v = document.querySelector('#dtView'), t = v.textContent; return { heat: v.querySelectorAll('svg rect').length, press: /Net soil pressure under DL\+LL/.test(t), pun: /ks·0.25√fck/.test(t), bbs: /Bottom mesh, bars along X/.test(t), dwg: v.querySelectorAll('svg.dwg').length }; });
  ok('Mat foundation: plan and section, pressure and steel maps, punching table and bar schedule', mv.heat > 200 && mv.press && mv.pun && mv.bbs && mv.dwg >= 4, JSON.stringify(mv));
  ok('Mat foundation in the design summary and BOQ', await pg.evaluate(() => /Mat under 12 supports/.test(document.querySelector('#results').textContent) && /Mat reinforcement schedule/.test(document.querySelector('#results').textContent)));
  await setK('found', 'isolated'); await setK('sbc', '');
  await pg.evaluate(() => document.querySelector('#bAna').click()); await pg.waitForFunction(() => document.querySelector('#dtSel') && !document.querySelector('#dtSel option[value=m0]'), null, { timeout: 120000 });
  await pg.evaluate(() => document.querySelectorAll('.rep.pro details').forEach(d => d.open = true));
  await pg.fill('#aQ', 'why does C-B2 fail?'); await pg.click('#aGo'); await pg.waitForTimeout(300);
  ok('Assistant answers offline (member lookup)', /C-B2/.test(await pg.textContent('#aOut')));
  for (const [id, ext] of [['#bGA', '.dxf'], ['#bStd', '.std']]) { const [d2] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click(id)]); ok('Download ' + ext, d2.suggestedFilename().endsWith(ext), d2.suggestedFilename()); }
  await pg.evaluate(() => { location.hash = '#report'; }); await pg.waitForSelector('#rpt h2', { timeout: 30000 });
  ok('Calculation report renders with all sections', await pg.evaluate(() => document.querySelectorAll('#rpt h2').length >= 12));
  const [d3] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('#rDl')]); ok('Report downloads as HTML', /\.html$/.test(d3.suggestedFilename()), d3.suggestedFilename());
  await pg.evaluate(() => { location.hash = '#projects'; }); await pg.waitForSelector('#pNew');
  await pg.fill('[data-pk=name]', 'Test building A'); await pg.click('#pSave'); await pg.waitForTimeout(200);
  await pg.click('#pNew'); await pg.waitForTimeout(300);
  const np = await pg.evaluate(() => ({ n: document.querySelectorAll('.prow').length, cur: document.querySelector('.rh h3').textContent }));
  ok('Projects: rename, create and switch', np.n === 2 && /Project 2/.test(np.cur), JSON.stringify(np));
  await pg.evaluate(() => { location.hash = '#model'; }); await pg.waitForTimeout(400);
  ok('New project starts without the previous results', await pg.evaluate(() => !document.querySelector('#results .rep') && /Project 2/.test(document.querySelector('.projbar').textContent)));
  await pg.evaluate(() => { location.hash = '#projects'; }); await pg.waitForSelector('[data-po]');
  await pg.click('[data-po]'); await pg.waitForTimeout(500);
  ok('Projects: reopen the first project', await pg.evaluate(() => /Test building A/.test(document.querySelector('.projbar').textContent)));
  await pg.reload(); await pg.waitForTimeout(800); await pg.evaluate(() => { location.hash = '#projects'; }); await pg.waitForTimeout(400);
  ok('Projects persist after reload (IndexedDB)', await pg.evaluate(() => document.querySelectorAll('.prow').length === 2 && /Test building A/.test(document.querySelector('.rh h3').textContent)));
  await pg.evaluate(() => { location.hash = '#model'; }); await pg.waitForTimeout(400);
  await pg.click('#bAuto'); await pg.waitForSelector('#results .rep.pro', { timeout: 240000 });
  const au = await pg.evaluate(() => ({ t: document.querySelector('.rep.pro .vbox b').textContent, rules: document.querySelector('[data-k=secOver]') ? document.querySelector('[data-k=secOver]').value : '' }));
  ok('Automatic design converges in the browser and writes section rules', /converged/.test(au.t) && /columns storey 1 = 500x500/.test(au.rules), au.t);
  ok('No JavaScript errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
