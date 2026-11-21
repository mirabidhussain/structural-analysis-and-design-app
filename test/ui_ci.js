/* Browser (UI) acceptance test for CI. Fails (exit 1) on any JavaScript error or missing result.
   Local: CHROME_PATH=/usr/bin/google-chrome node test/ui_ci.js   ·   CI: npx playwright install chromium */
const { chromium } = require('playwright');
let pass = 0, fail = 0;
function ok(n, c, i) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); }
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' '))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.evaluate(() => localStorage.clear());
  const ids = await pg.evaluate(() => ISD.modules.map(m => m.id));
  ok('Home lists all design modules', ids.length >= 15, ids.length + ' modules');
  await pg.fill('#q', 'footing'); const vis = await pg.evaluate(() => [...document.querySelectorAll('.card.mod')].filter(c => !c.hidden).map(c => c.getAttribute('href')));
  ok('Home search filters the modules', vis.length === 3 && vis.indexOf('#footing') >= 0 && vis.indexOf('#strip') >= 0 && vis.indexOf('#combfoot') >= 0, vis.join(' '));
  await pg.fill('#q', ''); await pg.evaluate(() => document.querySelector('#fchips [data-g=Steel]').click());
  ok('Home category chips', await pg.evaluate(() => [...document.querySelectorAll('.card.mod')].filter(c => !c.hidden).length === 6));
  await pg.evaluate(() => document.querySelector('#fchips [data-g=all]').click());
  for (const id of ['pile', 'raft']) {
    await pg.evaluate(id => { location.hash = '#' + id; }, id); await pg.waitForSelector('#f'); await pg.evaluate(() => document.querySelector('button.pri').click());
    await pg.waitForSelector('#out .rep', { timeout: 60000 });
    const mv = await pg.evaluate(() => ({ dw: document.querySelectorAll('#out svg.dwg').length, dxf: !!document.getElementById('dxf'), pass: !!document.querySelector('#out .badge.pass'), bbs: /Bar bending schedule/.test(document.querySelector('#out').textContent), est: /JKSOR/.test(document.querySelector('#out').textContent) }));
    ok('Module ' + id + ': design passes with drawings, DXF, bar bending schedule and JKSOR estimate', mv.dw >= 3 && mv.dxf && mv.pass && mv.bbs && mv.est, JSON.stringify(mv));
  }
  await pg.evaluate(() => { location.hash = ''; }); await pg.waitForTimeout(300);
  await pg.evaluate(() => document.getElementById('themeBtn').click()); await pg.waitForSelector('.thsheet .thg');
  await pg.click('.thsheet [data-th=dark]'); await pg.click('.thsheet [data-pal=forest]');
  const th = await pg.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), p: document.documentElement.getAttribute('data-pal'), st: localStorage.getItem('isd_theme') + '/' + localStorage.getItem('isd_pal'), bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), n: document.querySelectorAll('.thsheet .thg button').length }));
  await pg.click('.thsheet [data-pal=hc]'); await pg.click('.thsheet [data-th=light]');
  const hc = await pg.evaluate(() => ({ ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(), bg: getComputedStyle(document.body).backgroundColor }));
  await pg.click('.thsheet [data-pal=gold]'); await pg.click('.thsheet [data-th=auto]'); await pg.evaluate(() => document.querySelector('.thsheet').click());
  ok('Colour themes: six palettes, each light / dark / auto, applied and remembered', th.n === 6 && th.t === 'dark' && th.p === 'forest' && th.st === 'dark/forest' && th.bg === '#0b140e' && hc.ink === '#000000', JSON.stringify(th) + JSON.stringify(hc));
  ok('Theme picker closes and the default theme is restored', await pg.evaluate(() => !document.querySelector('.thsheet') && !document.documentElement.hasAttribute('data-pal') && document.documentElement.getAttribute('data-theme') === 'auto'));
  for (const id of ids) {
    await pg.evaluate(i => { location.hash = '#' + i; }, id); await pg.waitForTimeout(120);
    await pg.click('button.pri'); await pg.waitForSelector('#out .badge, #out .err', { timeout: 60000 }).catch(() => {});
    const r = await pg.evaluate(() => { const x = document.querySelector('#out .badge'), e = document.querySelector('#out .err'); return { badge: x ? x.textContent : null, err: e ? e.textContent : null }; });
    ok('Module "' + id + '" produces a report with defaults (all inputs blank)', !!r.badge && !r.err, r.badge || r.err || 'no report');
  }
  /* v3.6: standard bars, code limits, fixes, home order */
  await pg.evaluate(() => { location.hash = ''; }); await pg.waitForTimeout(300);
  const ho = await pg.evaluate(() => ({ order: [...document.querySelectorAll('.gsec')].map(x => x.getAttribute('data-g')).join(','), heroFE: !!document.querySelector('.hero a[href="#model"]'), ana: !!document.querySelector('.gsec[data-g=Ana] a[href="#model"]') }));
  ok('Home: member design first, frame & FE analysis moved to the bottom', ho.order === 'RCC,Fdn,Steel,Loads,Ana,Ref' && !ho.heroFE && ho.ana, JSON.stringify(ho));
  await pg.evaluate(() => { location.hash = '#beam'; }); await pg.waitForSelector('#f');
  const bars = await pg.evaluate(() => { const f = document.getElementById('f'); return ['dia', 'stir'].map(k => f.elements[k].tagName + ':' + [...f.elements[k].options].map(o => o.value).join('/')); });
  ok('Bar diameters are dropdowns of standard sizes', bars[0] === 'SELECT:12/16/20/25/28/32' && bars[1] === 'SELECT:6/8/10/12', bars.join(' '));
  await pg.evaluate(() => { location.hash = '#slab1'; }); await pg.waitForSelector('#f');
  await pg.fill('#f [name=cover]', '10'); await pg.waitForTimeout(400);
  const lv = await pg.evaluate(() => { const l = document.querySelector('.fld[data-fk=cover] .lim'); return { shown: !l.hidden, hard: l.classList.contains('hd'), t: l.textContent }; });
  await pg.click('button.pri'); await pg.waitForTimeout(200);
  const blk = await pg.evaluate(() => ({ err: !!document.querySelector('#out .err'), badge: !!document.querySelector('#out .badge') }));
  ok('Cover below IS 456 Table 16 is flagged on the field and blocks the calculation', lv.shown && lv.hard && /Table 16/.test(lv.t) && blk.err && !blk.badge, lv.t);
  await pg.evaluate(() => { document.getElementById('exist').checked = true; }); await pg.click('button.pri'); await pg.waitForTimeout(200);
  ok('Existing-structure switch runs the design and flags the input in the report', await pg.evaluate(() => !!document.querySelector('#out .badge') && /outside the code limits/.test(document.querySelector('#out .limn').textContent)));
  await pg.evaluate(() => { document.getElementById('exist').checked = false; document.getElementById('rst').click(); });
  await pg.evaluate(() => { location.hash = '#beam'; }); await pg.waitForSelector('#f');
  await pg.fill('#f [name=D]', '300'); await pg.fill('#f [name=L]', '6'); await pg.fill('#f [name=wu]', '45'); await pg.click('button.pri');
  await pg.waitForSelector('#fixbox .fx button', { timeout: 30000 });
  const fx1 = await pg.evaluate(() => ({ fail: !!document.querySelector('#out .badge.fail'), t: document.querySelector('#fixbox .fx span').textContent }));
  await pg.click('#fixbox .fx button'); await pg.waitForTimeout(400);
  const fx2 = await pg.evaluate(() => ({ pass: !!document.querySelector('#out .badge.pass'), D: document.querySelector('#f [name=D]').value }));
  ok('Failed design shows changes that pass; Apply fills the input and the design passes', fx1.fail && fx2.pass, fx1.t + ' → D ' + fx2.D);
  await pg.evaluate(() => { document.getElementById('rst').click(); });
  /* DXF import in the truss and foundation modules */
  const DG = require('./dxfgen.js');
  await pg.evaluate(() => { location.hash = '#truss'; }); await pg.waitForSelector('#f [data-dxf=dxf]');
  await pg.setInputFiles('#f [data-dxf=dxf]', { name: 'truss.dxf', mimeType: 'text/plain', buffer: Buffer.from(DG.truss(12, 25, 3)) }); await pg.waitForTimeout(600);
  const tst = await pg.evaluate(() => ({ st: document.querySelector('[data-st=dxf]').textContent, src: document.querySelector('#f [name=src]').value }));
  await pg.click('button.pri'); await pg.waitForSelector('#out .rep'); await pg.waitForTimeout(300);
  const tr = await pg.evaluate(() => ({ pass: !!document.querySelector('#out .badge.pass'), txt: /From the DXF drawing \(12 joints, 21 members/.test(document.querySelector('#out').textContent) }));
  ok('Roof truss imported from a DXF elevation, analysed and designed', /12 joints, 21 members, span 12\.00/.test(tst.st) && tst.src === 'dxf' && tr.pass && tr.txt, tst.st);
  await pg.evaluate(() => document.getElementById('rst').click());
  await pg.evaluate(() => { location.hash = '#pile'; }); await pg.waitForSelector('#f [data-dxf=dxf]');
  await pg.setInputFiles('#f [data-dxf=dxf]', { name: 'plan.dxf', mimeType: 'text/plain', buffer: Buffer.from(DG.plan([0, 6, 9], [0, 5], 450, 450)) }); await pg.waitForTimeout(600);
  const pv = await pg.evaluate(() => ({ st: document.querySelector('[data-st=dxf]').textContent, rows: document.querySelector('#f [name=cols]').value.split('\n').length, lim: document.querySelector('.fld[data-fk=cols] .lim').textContent }));
  await pg.click('button.pri'); await pg.waitForTimeout(300); const blocked = await pg.evaluate(() => !!document.querySelector('#out .err'));
  ok('Pile foundation: columns read from a DXF plan keep the loads of matching marks; new columns must get loads before the design runs', /6 columns read/.test(pv.st) && /enter the loads of 2 new/.test(pv.st) && pv.rows === 6 && /C5, C6/.test(pv.lim) && blocked, pv.lim);
  await pg.evaluate(() => document.getElementById('rst').click());
  /* v3.8: brand banner, slab module, live sketches, governing check */
  await pg.evaluate(() => { location.hash = ''; }); await pg.waitForTimeout(300);
  const br = await pg.evaluate(() => ({ brand: !!document.querySelector('.brand .brand-art'), sticky: getComputedStyle(document.querySelector('.brand')).position, logo: !!document.querySelector('header .logo img'), qa: document.querySelectorAll('.qa .qai').length, slab: !!document.querySelector('.card[href="#slab"]') && !document.querySelector('.card[href="#slab1"]') }));
  ok('Home: logo banner stays fixed while scrolling, header logo, quick actions, single Slab Design module', br.brand && br.sticky === 'sticky' && br.logo && br.qa === 8 && br.slab, JSON.stringify(br));
  await pg.evaluate(() => { location.hash = '#slab'; }); await pg.waitForSelector('#sk svg');
  const s1 = await pg.evaluate(() => document.querySelector('#sk').textContent); await pg.fill('#f [name=ly]', '9'); await pg.waitForTimeout(400); const s2 = await pg.evaluate(() => document.querySelector('#sk').textContent);
  await pg.click('button.pri'); await pg.waitForSelector('#out .gov');
  const sv = await pg.evaluate(() => ({ title: document.querySelector('#out h3').textContent, gov: document.querySelector('#out .gov b') ? document.querySelector('#out .gov b').textContent : '' }));
  ok('Slab Design decides one-way / two-way from lx, ly; the live sketch follows the inputs; governing check shown', /TWO-WAY/.test(s1) && /ONE-WAY/.test(s2) && /one-way/.test(sv.title) && sv.gov.length > 3, sv.title + ' · ' + sv.gov);
  await pg.evaluate(() => document.getElementById('rst').click());
  /* v3.7: grouped inputs, units, project elements, design aids */
  await pg.evaluate(() => { location.hash = '#beam'; }); await pg.waitForSelector('#f');
  ok('Inputs grouped into sections with segmented choices', await pg.evaluate(() => document.querySelectorAll('#f details.fgrp').length >= 4 && !!document.querySelector('#f .fseg button.on')));
  await pg.click('button.pri'); await pg.waitForTimeout(300);
  const siSum = await pg.evaluate(() => document.querySelector('#out .sum').textContent);
  ok('Checks show utilisation bars', await pg.evaluate(() => document.querySelectorAll('#out .chk .ub').length >= 3));
  await pg.click('.useg [data-u=fps]'); await pg.waitForTimeout(300);
  const fv = await pg.evaluate(() => ({ D: document.querySelector('#f [name=D]').placeholder, u: document.querySelector('.fld[data-fk=D] .u').textContent, w: document.querySelector('.fld[data-fk=wu] .u').textContent }));
  await pg.click('button.pri'); await pg.waitForTimeout(300);
  const fpsSum = await pg.evaluate(() => document.querySelector('#out .sum').textContent);
  await pg.fill('#f [name=D]', '20'); await pg.click('button.pri'); await pg.waitForTimeout(300);
  const d20 = await pg.evaluate(() => document.querySelector('#out .sum').textContent);
  await pg.click('.useg [data-u=si]'); await pg.waitForTimeout(300);
  ok('Units switch: FPS shows inches and kip/ft, gives the same design, 20 in is stored as 508 mm', fv.D === '17.717' && fv.u === 'in' && fv.w === 'kip/ft' && fpsSum === siSum && /508 mm/.test(d20) && await pg.evaluate(() => document.querySelector('#f [name=D]').value === '508'), JSON.stringify(fv));
  await pg.evaluate(() => document.getElementById('rst').click());
  for (const [id, nos] of [['beam', 4], ['footing', 6]]) {
    await pg.evaluate(i => { location.hash = '#' + i; }, id); await pg.waitForSelector('#f'); await pg.click('button.pri'); await pg.waitForSelector('#addp');
    await pg.click('#addp'); await pg.waitForSelector('#aSave'); await pg.fill('#aNos', String(nos)); await pg.click('#aSave'); await pg.waitForTimeout(300);
  }
  await pg.evaluate(() => { location.hash = '#elements'; }); await pg.waitForSelector('.ecard', { timeout: 60000 });
  const ev = await pg.evaluate(() => ({ n: document.querySelectorAll('.ecard').length, marks: [...document.querySelectorAll('.emk')].map(x => x.textContent).join(','), est: document.querySelector('.sum').textContent }));
  await pg.click('.etabs [data-t=bbs]'); await pg.waitForTimeout(500); const bbsRows = await pg.evaluate(() => document.querySelectorAll('.rep table.etb tr').length);
  await pg.click('.etabs [data-t=est]'); await pg.waitForTimeout(500); const estOk = await pg.evaluate(() => !!document.querySelector('.rep table.jk tr.ih') && /Grand total/.test(document.querySelector('.rep').textContent) && /5\.34\.1/.test(document.querySelector('.rep').textContent));
  ok('Add to project: elements listed with schedule, bar bending schedule and JKSOR estimate', ev.n === 2 && ev.marks === 'B1,F1' && /₹/.test(ev.est) && bbsRows >= 6 && estOk, JSON.stringify(ev));
  await pg.click('[data-eo]'); await pg.waitForSelector('#addp', { timeout: 30000 });
  ok('Opening an element restores its inputs and offers Update', await pg.evaluate(() => /Update B1/.test(document.getElementById('addp').textContent)));
  await pg.evaluate(() => { location.hash = '#column'; }); await pg.waitForSelector('#f'); await pg.click('button.pri'); await pg.waitForSelector('#estd');
  ok('Every design result has a one-tap detailed estimate (L × B × D, bar schedule, JKSOR abstract)', await pg.evaluate(() => { const d = document.getElementById('estd'); d.open = true; return /₹/.test(d.querySelector('summary').textContent) && !!d.querySelector('table.jk tr.ih') && !!d.querySelector('table.jk tr.gt') && d.querySelectorAll('table.est').length === 2; }));
  await pg.click('.tabbar a[data-t=estimate]'); await pg.waitForSelector('#estE');
  const eh = await pg.evaluate(() => ({ on: document.querySelector('.tabbar a.on').getAttribute('data-t'), det: document.querySelector('#estSeg .on').getAttribute('data-v'), el: !!document.querySelector('#estE table.jk tr.sb') && /Grand total/.test(document.getElementById('estE').textContent), run: !!document.getElementById('estRun') }));
  ok('Estimate tab: detailed estimate first, designed elements and a button to estimate the building', eh.on === 'estimate' && eh.det === 'detailed' && eh.el && eh.run, JSON.stringify(eh));
  const [xd] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('#estE .estx')]);
  ok('Detailed estimate exports to Excel in the J&K R&B format', /detailed-estimate\.xlsx$/.test(xd.suggestedFilename()), xd.suggestedFilename());
  await pg.evaluate(() => { location.hash = '#aids'; }); await pg.waitForSelector('.acard img'); await pg.waitForTimeout(800);
  const av = await pg.evaluate(() => ({ n: document.querySelectorAll('.acard').length, loaded: [...document.querySelectorAll('.acard img')].filter(i => i.complete && i.naturalWidth > 1000).length, ld: !!document.querySelector('table.ldt') }));
  await pg.click('.acard'); await pg.waitForSelector('.zoomv img'); const zv = await pg.evaluate(() => document.querySelector('.zoomv img').naturalWidth > 1000); await pg.click('.zoomv [data-z=x]');
  await pg.click('#achips [data-g=Ld]'); await pg.waitForTimeout(200); av.ld = await pg.evaluate(() => document.querySelectorAll('table.ldt').length === 2);
  ok('Design aids: 65 charts load offline, zoom viewer, development-length tables', av.n === 65 && av.loaded >= 2 && av.ld && zv, JSON.stringify(av));
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
  const bq = await pg.evaluate(() => { const t = document.querySelector('#results').textContent; return { sor: /JKSOR 5\.34\.2/.test(t), own: /own rate/.test(t), gst: !/GST \d+ %/.test(t), total: /Estimated cost \(JKSOR 2022\)/.test(t), mas: /Brick masonry/.test(t) }; });
  ok('BOQ: whole-building items priced with JKSOR 2022, own rate overrides, abstract without GST (JKSOR rates include it)', bq.sor && bq.own && bq.gst && bq.total && bq.mas, JSON.stringify(bq));
  const vol = async () => pg.evaluate(() => { const r = [...document.querySelectorAll('#results tr')].find(tr => /Brick masonry \(class 7\.5\) in CM 1:6 in superstructure/.test(tr.textContent)); return r ? parseFloat(r.children[3].textContent.replace(/,/g, '')) : null; });
  await pg.evaluate(() => { const b = document.querySelector('#results [data-est=boq]'); if (b) b.click(); }); await pg.waitForTimeout(600);
  const v230 = await vol();
  await pg.evaluate(() => { const e = document.querySelector('[data-k=mT]'); e.value = '115'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.evaluate(() => document.querySelector('#bBoq').click()); await pg.waitForTimeout(600); const v115 = await vol();
  ok('BOQ: "Recalculate BOQ" applies a new masonry thickness without re-analysis', v230 > 0 && Math.abs(v115 / v230 - 115 / 230) < 0.02, v230 + ' → ' + v115);
  await pg.evaluate(() => { const e = document.querySelector('[data-k=mT]'); e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.evaluate(() => document.querySelector('[data-est=detailed]').click()); await pg.waitForTimeout(500);
  const de = await pg.evaluate(() => ({ ih: document.querySelectorAll('#results table.est tr.ih').length, ab: /Abstract of cost/.test(document.querySelector('#results').textContent), rate: document.querySelectorAll('#results input.rate').length, on: document.querySelector('[data-est=detailed]').classList.contains('on') }));
  ok('Detailed estimate: measurement sheet + abstract of cost, rates still editable', de.ih > 20 && de.ab && de.rate > 20 && de.on, JSON.stringify(de));
  await pg.evaluate(() => document.querySelector('[data-est=boq]').click()); await pg.waitForTimeout(300);
  ok('Results: jump chips to the main sections and the bottom tab bar', await pg.evaluate(() => document.querySelectorAll('#results .jump a').length >= 6 && document.querySelector('.tabbar a.on') && document.querySelector('.tabbar a.on').getAttribute('data-t') === 'model'));
  ok('Frame results offer the pile and raft hand-off', await pg.evaluate(() => !!document.getElementById('bToPile') && !!document.getElementById('bToRaft')));
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
  /* performance: background workers, cancel, GPU viewer, device info */
  await pg.waitForFunction(() => window.PAR && PAR.ok(), null, { timeout: 20000 }).catch(() => {});
  await pg.evaluate(() => { HW.useGL = true; location.hash = '#model'; }); await pg.waitForSelector('#bAna');
  await pg.click('#bAna'); await pg.waitForSelector('#bCancel', { timeout: 10000 }); await pg.click('#bCancel'); await pg.waitForTimeout(300);
  const canc = await pg.evaluate(() => /cancelled/.test(document.getElementById('results').textContent));
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 120000 }); await pg.waitForTimeout(400);
  const wk = await pg.evaluate(() => { const S = SU.state(), T = PIPE.run(S.geo, S.p), f = X => JSON.stringify([X.des.fails, Math.round(X.boq.abs.total), X.res.combos.length, X.res.combos.map(c => Array.from(c.U).reduce((a, v) => Math.max(a, Math.abs(v)), 0).toPrecision(12)).join()]); return { ok: PAR.ok(), same: f(S) === f(T), gpu: document.getElementById('glbadge').textContent, gl: getComputedStyle(document.getElementById('cvgl')).display }; });
  ok('Analysis runs on a background core (cancel works) and gives results identical to the main thread; GPU draws the model', canc && wk.ok && wk.same && wk.gpu === 'GPU' && wk.gl === 'block', JSON.stringify(wk));
  await pg.evaluate(() => { location.hash = '#about'; }); await pg.waitForSelector('#hwinfo');
  ok('About shows the device: CPU cores, memory, GPU, tier and background workers', await pg.evaluate(() => /CPU cores/.test(document.getElementById('hwinfo').textContent) && /background worker/.test(document.getElementById('hwinfo').textContent)));
  /* v3.11: supports, cantilever / propped design, node supports */
  await pg.evaluate(() => { location.hash = '#beam'; }); await pg.waitForSelector('#f');
  await pg.selectOption('#f [name=endL]', 'fixed'); await pg.selectOption('#f [name=endR]', 'free'); await pg.fill('#f [name=L]', '2'); await pg.fill('#f [name=P1]', '10'); await pg.fill('#f [name=a1]', '2'); await pg.waitForTimeout(300);
  const skc = await pg.evaluate(() => ({ wall: !!document.querySelector('#sk .wall'), free: /free/.test(document.querySelector('#sk').textContent), cs: /Cantilever/.test(document.querySelector('#sk').textContent) }));
  await pg.click('button.pri'); await pg.waitForSelector('#out .rep', { timeout: 30000 }); await pg.waitForTimeout(300);
  const cb = await pg.evaluate(() => ({ t: document.querySelector('#out h2, #out .rep h2') ? document.querySelector('#out .rep h2').textContent : document.querySelector('#out').textContent.slice(0, 80), bmd: document.querySelectorAll('#out svg.bmd').length, dw: document.querySelectorAll('#out .dwgs svg').length, dxf: !!document.querySelector('#out [data-dxf], #out .dxfdl, #out button[id*=dxf], #out a[download$=".dxf"]'), bbs: /Bar bending|Mark/.test(document.querySelector('#out').textContent) }));
  ok('Beam end conditions: cantilever sketch shows the fixed wall and free end; design gives BMD/SFD, drawings and BBS', skc.wall && skc.free && skc.cs && /cantilever/i.test(cb.t) && cb.bmd === 2 && cb.dw >= 4 && cb.bbs, JSON.stringify(skc) + JSON.stringify(cb));
  await pg.selectOption('#f [name=endR]', 'roller'); await pg.fill('#f [name=L]', '5'); await pg.fill('#f [name=P1]', '0'); await pg.click('button.pri'); await pg.waitForTimeout(600);
  ok('Propped cantilever beam designed with top steel past the contraflexure point', await pg.evaluate(() => /propped cantilever/i.test(document.querySelector('#out').textContent) && /point of contraflexure/.test(document.querySelector('#out').textContent)));
  await pg.selectOption('#f [name=endL]', 'pinned'); await pg.selectOption('#f [name=endR]', 'free'); await pg.waitForTimeout(300);
  ok('Unstable supports (pinned + free) are flagged on the form', await pg.evaluate(() => { const l = document.querySelector('.fld[data-fk=endR] .lim'); return !!l && !l.hidden && /mechanism/.test(l.textContent); }));
  await pg.evaluate(() => document.getElementById('rst').click());
  await pg.evaluate(() => { location.hash = '#model'; }); await pg.waitForSelector('#bAna');
  await pg.evaluate(() => { const e = document.querySelector('[data-k=base]'); e.value = 'spring'; e.dispatchEvent(new Event('change', { bubbles: true })); }); await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 120000 }); await pg.waitForTimeout(500);
  const sp = await pg.evaluate(() => { const m = SU.state().m; return { spr: !!m.spr, n: Object.keys(m.spr || {}).length, t: Object.values(m.supType).join() }; });
  const svr = await pg.evaluate(() => { const d = SU.state().det; return { serv: d && d.serv, txt: /Serviceability/.test(document.getElementById('results').textContent) && /Annex F/.test(document.getElementById('results').textContent) }; });
  ok('Frame detailing reports serviceability (span / depth and crack width, IS 456 cl 23.2.1, Annex F)', svr.serv && svr.serv.beams > 0 && svr.txt, JSON.stringify(svr));
  const xy = await pg.evaluate(() => { const m = SU.state().m, k = Object.keys(m.sup)[0]; return { k: +k, p: SU.nodeXY(+k) }; });
  await pg.mouse.click(xy.p[0], xy.p[1]); await pg.waitForSelector('#supSel', { timeout: 5000 }).catch(() => {});
  const sel = await pg.evaluate(() => ({ box: !!document.getElementById('supSel'), h: document.querySelector('#selinfo h4') ? document.querySelector('#selinfo h4').textContent : '' }));
  if (sel.box) { await pg.selectOption('#supSel', 'pinned'); await pg.click('#supBtn'); await pg.waitForTimeout(300); }
  const tapped = /Node N(\d+)/.exec(sel.h), kk = tapped ? +tapped[1] - 1 : xy.k;   /* the node the tap actually selected (a node above may be drawn at the same spot) */
  const after = await pg.evaluate(k => ({ rule: document.querySelector('[data-k=supOver]').value, t: SU.state().m.supType[k] }), kk);
  ok('Frame base condition "spring" gives soil springs at every base; tapping a node lets its support be changed (rule written)', sp.spr && sp.n >= 4 && /spring/.test(sp.t) && sel.box && /^Node N/.test(sel.h) && after.t === 'pinned' && new RegExp('N' + (kk + 1) + ' = pinned').test(after.rule), JSON.stringify([sp, sel, after]));
  await pg.evaluate(() => { const t = document.querySelector('[data-k=supOver]'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.evaluate(() => { const e = document.querySelector('[data-k=base]'); e.value = 'fixed'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  /* v3.12: serviceability in the frame detailing, design audit on member reports */
  await pg.evaluate(() => { location.hash = '#beam'; }); await pg.waitForSelector('#f'); await pg.click('button.pri'); await pg.waitForSelector('#out .rep', { timeout: 30000 }); await pg.waitForTimeout(300);
  const aud = await pg.evaluate(() => { const a = document.querySelector('#out .audit'); return a ? { chip: a.querySelector('.vchip').textContent, stamp: !!a.querySelector('.stamp'), gaps: a.querySelectorAll('.ag li').length, crack: /wcr/.test(document.querySelector('#out').textContent) } : null; });
  ok('Member report carries the design audit: verification state, items not covered and the not-for-construction stamp; beam crack widths reported', aud && aud.chip === 'Calculated' && aud.stamp && aud.gaps >= 3 && aud.crack, JSON.stringify(aud));
  /* v4.0: continuous beam envelope, retaining wall and combined footing drawings, STAAD import with model checks */
  for (const [id, re] of [['contbeam', /Bending moment envelope/], ['retwall', /Section \(per m run\)/], ['combfoot', /Longitudinal bending moment/]]) {
    await pg.evaluate(i => { location.hash = '#' + i; }, id); await pg.waitForSelector('#f'); await pg.click('button.pri'); await pg.waitForSelector('#out .rep', { timeout: 30000 });
    const v = await pg.evaluate(() => ({ svg: document.querySelectorAll('#out svg.bmd').length, txt: document.querySelector('#out').textContent, pass: !!document.querySelector('#out .badge.pass'), aud: !!document.querySelector('#out .audit') }));
    ok('v4 module ' + id + ' designs, draws and carries the design audit', v.svg >= 1 && re.test(v.txt) && v.pass && v.aud, JSON.stringify({ svg: v.svg, pass: v.pass, aud: v.aud }));
  }
  await pg.evaluate(() => { location.hash = '#model'; }); await pg.waitForSelector('[data-k=src]');
  await pg.evaluate(() => { const e = document.querySelector('[data-k=src]'); e.value = 'std'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.waitForSelector('#stdFile');
  await pg.setInputFiles('#stdFile', __dirname + '/g5.std'); await pg.waitForSelector('#bStd:not([disabled])', { timeout: 20000 });
  const stp = await pg.evaluate(() => ({ t: document.getElementById("srcbox").textContent, fck: SU.ctx().params().fck, fy: SU.ctx().params().fy }));
  ok('STAAD file read: 285 members, 18 plates, 6 load cases, 4 combinations; FC 25 / FYMAIN 415 taken as the grades', /285/.test(stp.t) && /18/.test(stp.t) && stp.fck === 25 && stp.fy === 415, JSON.stringify({ fck: stp.fck, fy: stp.fy }));
  await pg.evaluate(() => { const e = document.querySelector('[data-k=ssurf]'); if (e.checked) e.click(); });
  await pg.click('#bStd'); await pg.waitForSelector('#mstat .mchk', { timeout: 30000 });
  const fc = await pg.evaluate(() => document.querySelector('#mstat .mchk').textContent);
  ok('STAAD file checks flag the cancelling wind cases, the low seismic weight and the missing 1.5(DL + LL)', /Wind loads cancel/.test(fc) && /Seismic weight low/.test(fc) && /No 1\.5\(DL \+ LL\)/.test(fc), fc.slice(0, 160));
  await pg.click('#bAna'); await pg.waitForSelector('#results .mchk', { timeout: 180000 });
  const ar = await pg.evaluate(() => ({ eq: [...document.querySelectorAll('#results .eq')].map(e => e.textContent).slice(0, 1).join(''), t: document.getElementById('results').textContent, nb: SU.state().m.frames.length, cb: SU.state().cb.map(c => c.name).join('|') }));
  ok('STAAD model analysed with the file\'s loads and combinations; model checks shown', ar.nb === 285 && /C7/.test(ar.cb) && /Loads from the STAAD file/.test(ar.t) && /Vb = 20[67]\.\d/.test(ar.t) && /zero net horizontal force/.test(ar.t), ar.cb + ' ' + JSON.stringify({ nb: ar.nb, ld: /Loads from the STAAD file/.test(ar.t), vb: /Vb = 20[67]\.\d/.test(ar.t), zero: /zero net horizontal force/.test(ar.t), eq: ar.eq }));
  await pg.evaluate(() => { const e = document.querySelector('[data-k=src]'); e.value = 'gen'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  ok('No JavaScript errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
