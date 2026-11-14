const { chromium } = require('playwright'); const fs=require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.evaluate(() => { localStorage.clear(); location.hash = '#model'; }); await pg.waitForTimeout(400);
  await pg.click('#bAna'); await pg.waitForSelector('#results .bXls', { timeout: 30000 });
  let [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#results .bXls')]);
  await dl.saveAs(__dirname + '/ui_full.xlsx'); console.log('full workbook', dl.suggestedFilename(), fs.statSync(__dirname + '/ui_full.xlsx').size);
  await pg.screenshot({ path: __dirname + '/ui_xls.png' });
  await pg.evaluate(() => { location.hash = '#beam'; }); await pg.waitForTimeout(300); await pg.click('button.pri'); await pg.waitForTimeout(400);
  [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('#xls')]);
  await dl.saveAs(__dirname + '/ui_beam.xlsx'); console.log('module workbook', dl.suggestedFilename(), fs.statSync(__dirname + '/ui_beam.xlsx').size);
  console.log('errors:', errs); await b.close();
})();
