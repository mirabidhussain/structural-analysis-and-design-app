/* Excel check for CI: builds workbooks of three projects, writes copies WITHOUT cached formula values and a JSON of the
   values the app expects; test/xlsx_check.py lets LibreOffice compute every formula and compares. */
const c = require('./load.js'), { MD, FE, SE, DT, RX, XL, BOQ } = c, fs = require('fs'), path = require('path');
const out = process.argv[2] || path.join(__dirname, 'xci');
fs.mkdirSync(out, { recursive: true });
const base = { fck: 25, fy: 500, fys: 250, crack: true, pcCol: 2, pcBeam: 1, colSec: '400x400', beamSec: '300x450', braceSec: 'ISA 75x75x6', tSlab: 150, tWall: 200, ff: 1.5, ffRoof: 2.5, ll: 3, llRoof: 1.5, wall: 12, parapet: 3, bDL: 0, bLL: 0, bLLr: 0, eq: true, zone: 'V', I: 1.2, R: 5, soil: 'II', sys: 'rc', wind: false, vb: 39, vbp: 'Srinagar', terrain: 2, cf: 1.3, trib: 4, kcol: 1.2, accTor: true, rsa: true, nModes: 12, rsComb: 'cqc', method: 'lsm', sbc: 200 };
async function run(name, g, pp) {
  const p = Object.assign({}, base, pp || {}), m = MD.make(g, p), S = { m, p };
  S.L = MD.cases(m, p); S.cb = MD.combos(S.L.cases, p.method); S.res = FE.linear(m, S.L.cases, S.cb, { caseReac: true }); S.res.incMap = {}; S.cb.forEach(x => S.res.incMap[x.name] = x.inc || 1);
  if (p.eq && p.rsa) { S.se = SE.run(m, S, p); S.se.irr = SE.irregular(m, S, S.se); S.se.tc = SE.torsionCheck(m, S, S.se); }
  S.des = MD.design(m, S.res, p); S.det = DT.run(m, S, p); S.drift = MD.drift(m, S.res).concat(S.se ? S.se.drift || [] : []);
  if (S.det && !S.det.err) S.boq = BOQ.run(m, S, p);
  const wb = RX.build(S), exp = [];
  wb.sheets.forEach(sh => sh.rows.forEach((r, ri) => r.c.forEach((cl, ci) => { if (cl && typeof cl === 'object' && cl.f && (typeof cl.v === 'number' || typeof cl.v === 'string')) exp.push([sh.name, ci, ri + 1, cl.v]); })));
  XL.NOCACHE = true; fs.writeFileSync(path.join(out, name + '.xlsx'), await wb.bytesAsync()); XL.NOCACHE = false;
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(exp));
  console.log(name, exp.length + ' formulas with expected values', wb.sheets.length + ' sheets');
}
(async () => {
  await run('rc3d', MD.generate({ bx: '5,5', by: '4,4', hs: '3.2,3.2', slabs: true, walls: true, mesh: 1.5 }));
  await run('rc2d_wsm', MD.generate({ bx: '5,4', by: '', hs: '3.5,3.2', twoD: true, mesh: 1 }), { bDL: 20, bLL: 10, method: 'wsm' });
  await run('steel', MD.generate({ bx: '6,6', by: '5', hs: '4,4', slabs: false, brace: true, mesh: 1 }), { colSec: 'ISMB 300', beamSec: 'ISMB 250', sys: 'steel', bDL: 15, bLL: 8, rsa: false });
})();
