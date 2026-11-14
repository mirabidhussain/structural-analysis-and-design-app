const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.screenshot({ path: __dirname + '/home.png', fullPage: false });
  const ids = await pg.evaluate(() => ISD.modules.map(m => m.id));
  const res = {};
  for (const id of ids) {
    await pg.evaluate(i => { location.hash = '#' + i; }, id);
    await pg.waitForTimeout(150);
    await pg.click('button.pri');
    await pg.waitForTimeout(250);
    res[id] = await pg.evaluate(() => { const b = document.querySelector('#out .badge'); const e = document.querySelector('#out .err'); return (b ? b.textContent : 'NO REPORT') + (e ? ' | ERR: ' + e.textContent : ''); });
    if (id === 'truss' || id === 'beam') await pg.screenshot({ path: __dirname + '/' + id + '.png', fullPage: true });
  }
  for (const p of ['tables', 'about']) { await pg.evaluate(i => { location.hash = '#' + i; }, p); await pg.waitForTimeout(100); }
  console.log(res); console.log('errors:', errs);
  await b.close();
})();
