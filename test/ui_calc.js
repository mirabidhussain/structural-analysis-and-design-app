const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.evaluate(() => { localStorage.clear(); location.hash = '#model'; }); await pg.waitForTimeout(400);
  await pg.click('#bAna'); await pg.waitForSelector('table.basis', { timeout: 30000 });
  console.log('basis rows', await pg.$$eval('table.basis tr', r => r.length), 'critical calcs', await pg.$$eval('#results details.calc', r => r.length));
  const el = await pg.$('#results details.calc'); await el.screenshot({ path: __dirname + '/calc_beam.png' });
  await pg.click('#bAllCalc'); await pg.waitForTimeout(1500);
  console.log('all calcs', await pg.$$eval('#allCalc details', r => r.length));
  await pg.click('#results a.lk'); await pg.waitForTimeout(300);
  console.log('member calc', await pg.$$eval('#selinfo .cs', r => r.length));
  await pg.emulateMedia({ media: 'print' }); await pg.pdf({ path: __dirname + '/print.pdf', format: 'A4' });
  console.log('errors:', errs); await b.close();
})();
