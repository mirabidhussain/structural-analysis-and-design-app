/* Design-aid data from the app's own IS 456 engine (strain compatibility, cl 38-40): node tools/aids_data.js > /tmp/aids.json */
const c = require('../test/load.js'), { RCC, FD, ST, LD } = c, D = c.D || require('vm').runInContext('D', c);
const out = { rect: [], circ: [], flex: [], tauc: [], kt: [], kc: [], dbl: [], slab: [], fcd: [], ltb: [], spec: [], k2: [] };
const PF = [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26];
function rectCurve(pf, dD, fy, arr) {
  const fck = 25, b = 1000, D = 1000, dc = dD * D, As = pf * fck / 100 * b * D, lay = RCC.colLayers(D, dc, As, arr), pts = [];
  for (let i = 0; i <= 260; i++) {
    const xu = D * Math.pow(10, -2 + 4 * i / 260);   /* 0.01D .. 100D */
    const pm = RCC.colPM(b, D, lay, xu, fck, fy), P = pm.P * 1e3 / (fck * b * D), M = pm.M * 1e6 / (fck * b * D * D);
    if (P >= -0.02) pts.push([+M.toFixed(5), +P.toFixed(5)]);
  }
  return pts;
}
for (const fy of [415, 500, 550]) for (const arr of ['two', 'four']) for (const dD of [0.05, 0.10, 0.15, 0.20])
  out.rect.push({ fy, arr, dD, curves: PF.map(pf => ({ pf, pts: rectCurve(pf, dD, fy, arr) })) });
for (const fy of [415, 500, 550]) for (const dD of [0.05, 0.10, 0.15, 0.20]) {
  const fck = 25, D = 1000, nb = 12, curves = [];
  for (const pf of PF) {
    const As = pf * fck / 100 * Math.PI * D * D / 4, dia = pf ? Math.sqrt(4 * As / (nb * Math.PI)) : 0.001, dc = dD * D - dia / 2;
    const top = FD.circCap(D, dc, nb, dia, fck, fy, 0), Pmax = top.Pmax, pts = [];
    for (let i = 0; i <= 120; i++) { const Pu = Pmax * i / 120 * 0.9999, r = FD.circCap(D, dc, nb, dia, fck, fy, Pu); if (r.ok) pts.push([+(r.M * 1e6 / (fck * D * D * D)).toFixed(5), +(Pu * 1e3 / (fck * D * D)).toFixed(5)]); }
    pts.push([0, +(Pmax * 1e3 / (fck * D * D)).toFixed(5)]);
    curves.push({ pf, pts });
  }
  out.circ.push({ fy, dD, curves });
}
/* singly reinforced flexure, Annex G-1.1(b): Mu/bd² vs pt */
for (const fy of [250, 415, 500, 550]) {
  const xl = fy === 250 ? 0.53 : fy === 415 ? 0.48 : fy === 500 ? 0.46 : 0.44, set = [];
  for (const fck of [20, 25, 30, 35, 40]) {
    const ptl = 41.61 * xl * fck / fy * 100 / 100, pts = [];
    for (let i = 0; i <= 100; i++) { const pt = 0.1 + (ptl - 0.1) * i / 100, R = 0.87 * fy * pt / 100 * (1 - (pt / 100) * fy / fck); pts.push([+pt.toFixed(4), +R.toFixed(4)]); }
    set.push({ fck, ptl, Rlim: 0.36 * fck * xl * (1 - 0.416 * xl), pts });
  }
  out.flex.push({ fy, set });
}
for (const fck of [15, 20, 25, 30, 35, 40]) { const pts = []; for (let i = 0; i <= 120; i++) { const pt = 0.15 + 2.85 * i / 120; pts.push([+pt.toFixed(3), +RCC.tauc(fck, pt).toFixed(4)]); } out.tauc.push({ fck, pts }); }
for (const fs of [120, 145, 190, 240, 290]) { const pts = []; for (let i = 0; i <= 120; i++) { const pt = 0.1 + 2.9 * i / 120; pts.push([+pt.toFixed(3), +RCC.kt(pt, fs).toFixed(4)]); } out.kt.push({ fs, pts }); }
for (let i = 0; i <= 60; i++) { const pc = 3 * i / 60; out.kc.push([+pc.toFixed(3), +Math.min(1.5, 1 + pc / (3 + pc)).toFixed(4)]); }
/* doubly reinforced: Mu/bd² beyond the limit → pt and pc, for d'/d */
for (const fy of [415, 500]) for (const fck of [20, 25, 30]) {
  const xl = fy === 415 ? 0.48 : 0.46, Rl = 0.36 * fck * xl * (1 - 0.416 * xl), ptl = 0.36 * fck * xl / (0.87 * fy) * 100, lines = [];
  for (const dd of [0.05, 0.10, 0.15, 0.20]) {
    const esc = 0.0035 * (xl - dd) / xl, fsc = Math.min(RCC.fs(esc, fy), 0.87 * fy) - 0.446 * fck, pts = [];
    for (let i = 0; i <= 80; i++) { const R = Rl + (Rl * 0.9) * i / 80, Mx = (R - Rl), pc = Mx / (fsc * (1 - dd)) * 100, pt = ptl + pc * fsc / (0.87 * fy); pts.push([+R.toFixed(4), +pt.toFixed(4), +pc.toFixed(4)]); }
    lines.push({ dd, fsc, pts });
  }
  out.dbl.push({ fy, fck, Rl, ptl, lines });
}
/* IS 456 Table 26 / 27 slab moment coefficients */
const RR = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0];
D.T26.forEach((cs, i) => {
  if (cs.ss) { const pts = []; for (let k = 0; k <= 50; k++) { const r = 1 + k / 50; pts.push([r, Math.pow(r, 4) / (8 * (1 + Math.pow(r, 4))), r * r / (8 * (1 + Math.pow(r, 4)))]); } out.slab.push({ i: i + 1, name: cs.name, ss: true, pts }); }
  else out.slab.push({ i: i + 1, name: cs.name, r: RR, xn: cs.xn, xp: cs.xp, yn: cs.yn, yp: cs.yp });
});
/* IS 800 cl 7.1.2: design compressive stress fcd vs KL/r, buckling curves a–d */
for (const fy of [250, 350]) { const cur = {}; for (const cv of ['a', 'b', 'c', 'd']) { const pts = []; for (let k = 0; k <= 125; k++) { const s2 = 2 * k; pts.push([s2, +ST.fcd(Math.max(s2, 1e-6), fy, cv).toFixed(3)]); } cur[cv] = pts; } out.fcd.push({ fy, cur }); }
/* IS 800 cl 8.2.2: lateral-torsional buckling fbd vs λLT */
for (const fy of [250, 350]) { const cur = {}; for (const a of [0.21, 0.49]) { const pts = []; for (let k = 0; k <= 100; k++) { const l = 3 * k / 100; pts.push([l, +(ST.chi(l, a) * fy / D.gm0).toFixed(3)]); } cur[a] = pts; } out.ltb.push({ fy, cur }); }
/* IS 1893 (Part 1):2016 Fig 2 — Sa/g, 5 % damping */
for (const soil of ['I', 'II', 'III']) { const pts = []; for (let k = 0; k <= 200; k++) { const T = 4 * k / 200; pts.push([T, +LD.saG(T, soil).toFixed(4)]); } out.spec.push({ soil, pts }); }
/* IS 875 (Part 3):2015 Table 2 — k2 */
for (const tc of [1, 2, 3, 4]) out.k2.push({ tc, h: D.k2h, k: D.k2[tc] });
console.log(JSON.stringify(out));
