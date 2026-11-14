const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + __dirname + '/../dist/index.html');
  await pg.screenshot({ path: __dirname + '/home2.png', fullPage: true });
  await pg.evaluate(() => { location.hash = '#model'; }); await pg.waitForTimeout(500);
  await pg.screenshot({ path: __dirname + '/fe1.png', fullPage: false });
  await pg.click('#bAna'); await pg.waitForSelector('#results .rh', { timeout: 30000 });
  console.log('linear:', await pg.evaluate(() => document.querySelector('#results .badge').textContent));
  await pg.selectOption('#vDisp', 'mz'); await pg.waitForTimeout(200);
  const cv = await pg.$('#cv'); await cv.screenshot({ path: __dirname + '/fe_mz.png' });
  await pg.selectOption('#vDisp', 'smx'); await pg.waitForTimeout(200); await cv.screenshot({ path: __dirname + '/fe_smx.png' });
  await pg.selectOption('#vDisp', 'def'); await pg.selectOption('#vState', '1.5(DL+EQX)'); await pg.waitForTimeout(200); await cv.screenshot({ path: __dirname + '/fe_def.png' });
  // click a member in the results table
  await pg.click('#results a.lk'); await pg.waitForTimeout(400);
  await pg.screenshot({ path: __dirname + '/fe_sel.png', fullPage: false });
  console.log('sel:', await pg.evaluate(() => document.querySelector('#selinfo').innerText.slice(0, 300)));
  // 2D generator + pushover
  await pg.fill('[data-k=by]', ''); await pg.fill('[data-k=bx]', '5, 4'); await pg.fill('[data-k=hs]', '3.5, 3.2');
  await pg.click('#bGen'); await pg.waitForTimeout(300);
  await pg.click('#p3 > h3'); await pg.fill('[data-k=bDL]', '20'); await pg.fill('[data-k=bLL]', '10');
  await pg.click('#bPO'); await pg.waitForSelector('#results svg polyline', { timeout: 60000 });
  console.log('pushover:', await pg.evaluate(() => document.querySelector('#results .sum').innerText.replace(/\n/g, ' | ')));
  await pg.screenshot({ path: __dirname + '/fe_po.png', fullPage: true });
  // DXF upload
  await pg.selectOption('[data-k=src]', 'dxf'); await pg.waitForTimeout(200);
  await pg.setInputFiles('#dxfFile', __dirname + '/sample3d.dxf'); await pg.waitForTimeout(400);
  await pg.click('#bDxf'); await pg.waitForTimeout(300);
  console.log('dxf model:', await pg.evaluate(() => document.querySelector('#mstat').innerText.replace(/\n/g, ' | ')));
  await pg.click('#bPD'); await pg.waitForSelector('#results .rh', { timeout: 30000 });
  console.log('dxf P-Delta:', await pg.evaluate(() => document.querySelector('#results .rh').innerText.replace(/\n/g, ' | ')));
  await pg.screenshot({ path: __dirname + '/fe_dxf.png', fullPage: false });
  console.log('errors:', errs);
  await b.close();
})();
