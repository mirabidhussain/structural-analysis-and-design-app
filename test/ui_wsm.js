const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.evaluate(() => { localStorage.clear(); location.hash = '#model'; }); await pg.waitForTimeout(400);
  await pg.click('#p2 > h3'); await pg.selectOption('[data-k=method]', 'wsm');
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 30000 });
  console.log('WSM analysis:', await pg.evaluate(() => document.querySelector('#results .rh').innerText.replace(/\n/g, ' | ') + ' || combos: ' + SU.S.cb.map(c => c.name + (c.inc > 1 ? '*' : '')).join(', ') + ' || ' + [...document.querySelectorAll('#results h4')].map(h => h.textContent).filter(t => /RCC|basis/.test(t)).join(' / ')));
  const el = await pg.$('#results details.calc'); await el.screenshot({ path: __dirname + '/wsm_calc.png' });
  await pg.selectOption('[data-k=method]', 'lsm'); await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 30000 });
  console.log('LSM again:', await pg.evaluate(() => document.querySelector('.mbadge').textContent + ' | ' + SU.S.cb[0].name));
  for (const id of ['beam', 'slab1', 'slab2', 'column']) {
    await pg.evaluate(i => { location.hash = '#' + i; }, id); await pg.waitForTimeout(250);
    await pg.selectOption('[name=method]', 'wsm'); await pg.click('button.pri'); await pg.waitForTimeout(300);
    console.log(id, 'WSM:', await pg.evaluate(() => document.querySelector('#out h3').textContent + ' | ' + document.querySelector('#out .badge').textContent));
    await pg.selectOption('[name=method]', 'lsm'); await pg.click('button.pri'); await pg.waitForTimeout(300);
    console.log(id, 'LSM:', await pg.evaluate(() => document.querySelector('#out h3').textContent + ' | ' + document.querySelector('#out .badge').textContent));
  }
  console.log('errors:', errs); await b.close();
})();
