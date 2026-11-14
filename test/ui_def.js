const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.evaluate(() => { localStorage.clear(); location.hash = '#model'; }); await pg.waitForTimeout(400);
  console.log('blank inputs:', await pg.evaluate(() => [...document.querySelectorAll('[data-k=ll],[data-k=colSec],[data-k=bx]')].map(e => JSON.stringify([e.value, e.placeholder])).join(' ')));
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 30000 });
  console.log('all-default run:', await pg.evaluate(() => document.querySelector('#results .badge').textContent + ' | ' + (document.querySelector('#results .note') || {}).textContent));
  // enter some values + overrides
  await pg.click('#p2 > h3'); await pg.click('#p3 > h3');
  await pg.fill('[data-k=ll]', '4'); await pg.selectOption('[data-k=zone]', 'IV'); await pg.fill('[data-k=ff]', '-2');
  await pg.fill('[data-k=secOver]', 'columns storey 1 = 450x450\nbeams storey 3 = 300x400\n5, 7-8 = 350x500\nfoo = 200x200');
  await pg.fill('[data-k=loadOver]', 'beams storey 1 = DL 6, LL 2');
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 30000 });
  console.log('override run:', await pg.evaluate(() => { const m = SU.S.m; const c = {}; m.frames.forEach((e, k) => { const key = e.type + ':' + e.sec.name + ':' + e.src.replace(/line \d+/, 'line'); c[key] = (c[key] || 0) + 1; }); return JSON.stringify(c) + ' | LL=' + SU.S.p.ll + ' zone=' + SU.S.p.zone + ' ff=' + SU.S.p.ff + ' | DL beam UDLs=' + SU.S.L.cases.DL.frameUDL.length + ' | warn=' + m.warn.join(';'); }));
  console.log('defaults note:', await pg.evaluate(() => [...document.querySelectorAll('#results .note')].map(n => n.textContent).find(t => /Defaults used/.test(t))));
  await pg.screenshot({ path: __dirname + '/def_inputs.png', fullPage: false });
  // tap-assign
  await pg.click('#results a.lk'); await pg.waitForTimeout(300); await pg.fill('#asgSec', 'ISMB 400'); await pg.click('#asgBtn'); await pg.waitForTimeout(300);
  console.log('assign:', await pg.evaluate(() => document.querySelector('[data-k=secOver]').value.split('\n').pop() + ' -> ' + SU.S.m.frames.filter(f => f.sec.name === 'ISMB 400').length + ' member(s)'));
  // module blank field
  await pg.evaluate(() => { location.hash = '#beam'; }); await pg.waitForTimeout(300);
  await pg.click('button.pri'); await pg.waitForTimeout(300);
  console.log('beam module all blank:', await pg.evaluate(() => document.querySelector('#out .badge').textContent + ' | ' + (document.querySelector('#out .note') || {}).textContent));
  await pg.screenshot({ path: __dirname + '/def_beam.png', fullPage: false });
  console.log('errors:', errs); await b.close();
})();
