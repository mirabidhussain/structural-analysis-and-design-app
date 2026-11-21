/* v4.0 modules: continuous beam, retaining wall, combined footing — against closed-form and hand results */
const c = require('./load.js'), { MODS } = c;
let pass = 0, fail = 0;
function near(name, got, exp, tol) { const ok = Math.abs(got - exp) <= (tol || 1e-3) * Math.max(1, Math.abs(exp)); ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + (+got).toPrecision(6) + ' expected ' + (+exp).toPrecision(6)); }
function truth(name, ok) { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name); }

/* ---- continuous beam ---- */
const cb = { b: 300, D: 500, cover: 25, stir: 8, dia: 16, exp: 'moderate', fck: 25, fy: 415, self: 'no', endL: 'pinned', endR: 'pinned', redist: 0 };
let r = MODS.contbeam(Object.assign({}, cb, { spans: '5,5', gk: '20', qk: '0', pattern: 'off' }));
near('Two equal spans, UDL: support moment wL²/8', r.res.supM[1], 30 * 25 / 8, 1e-6);
near('Two equal spans: span moment 9wL²/128', r.res.spans[0].Ms, 9 * 30 * 25 / 128, 2e-4);
near('Two equal spans: centre reaction 10wL/8', r.res.reac[1], 10 * 30 * 5 / 8, 1e-6);
r = MODS.contbeam(Object.assign({}, cb, { spans: '5,5,5', gk: '10', qk: '10', pattern: 'on' }));
near('Three equal spans: support moment 0.100 G + 0.1167 Q (adjacent spans loaded)', r.res.supM[1], (0.1 * 15 + 7 / 60 * 15) * 25, 1e-4);
near('Three equal spans: interior span 0.025 G + 0.075 Q (Q on that span only)', r.res.spans[1].Ms, (0.025 * 15 + 0.075 * 15) * 25, 2e-4);
truth('Three equal spans: end span sagging between max(G+Q all) and the sum of coefficient maxima', r.res.spans[0].Ms > 0.08 * 30 * 25 && r.res.spans[0].Ms <= (0.08 + 0.10125) * 15 * 25 + 1e-6);
let r2 = MODS.contbeam(Object.assign({}, cb, { spans: '5,5,5', gk: '10', qk: '10', pattern: 'on', redist: 20 }));
near('20 % redistribution: support moment × 0.8', r2.res.supM[1], 0.8 * r.res.supM[1], 1e-6);
truth('Redistribution raises the span moment', r2.res.spans[0].Ms > r.res.spans[0].Ms);
let r3 = MODS.contbeam(Object.assign({}, cb, { spans: '5,5,5', gk: '10', qk: '10', pattern: 'on', redist: 40 }));
near('Redistribution capped at 30 %', r3.res.supM[1], 0.7 * r.res.supM[1], 1e-6);
r = MODS.contbeam(Object.assign({}, cb, { spans: '1.5,5,5', gk: '10', qk: '10', endL: 'free' }));
near('Cantilever end: support moment wL²/2', r.res.supM[1], 30 * 1.5 * 1.5 / 2, 1e-6);
r = MODS.contbeam(Object.assign({}, cb, { spans: '6', gk: '20', qk: '10', self: 'yes' }));
near('Single span with self weight 25bD: M = wL²/8', r.res.spans[0].Ms, 1.5 * (20 + 25 * 0.3 * 0.5 + 10) * 36 / 8, 2e-4);

/* ---- retaining wall: independent statics about the toe ---- */
const wp = { H: 4, Df: 1, q: 10, gs: 18, phi: 30, beta: 0, mu: 0.5, sbc: 150, passive: 'no', B: 3.0, toe: 1.0, tb: 350, ttop: 200, tstem: 350, exp: 'moderate', cover: 50, dia: 12, fck: 25, fy: 415 };
r = MODS.retwall(wp);
const Ka = 1 / 3, h = 4 - 0.35, heel = 3 - 1 - 0.35;
const Wst1 = 25 * 0.2 * h, Wst2 = 25 * 0.15 * h / 2, Wb = 25 * 3 * 0.35, Wh = 18 * heel * h, Wt = 18 * 1 * (1 - 0.35);
const W = Wst1 + Wst2 + Wb + Wh + Wt, Mr = Wst1 * (1 + 0.35 - 0.1) + Wst2 * (1 + 0.15 * 2 / 3) + Wb * 1.5 + Wh * (1.35 + heel / 2) + Wt * 0.5;
const Pa = Ka * 18 * 16 / 2, Pq = Ka * 10 * 4;
near('Wall: Ka = 1/3 for φ = 30°', r.res.Ka, Ka, 1e-9);
near('Wall: total weight', r.res.st.W, W, 1e-9);
near('Wall: restoring moment about the toe', r.res.st.Mr, Mr, 1e-9);
near('Wall: overturning ratio 0.9 Mr / (1.2 Mo + 1.4 Mq) (IS 456 cl 20.1)', r.res.st.ovt, 0.9 * Mr / (1.2 * Pa * 4 / 3 + 1.4 * Pq * 2), 1e-9);
near('Wall: sliding factor 0.9 μ W / H (cl 20.2)', r.res.st.sld * 1.4, 0.9 * 0.5 * W / (Pa + Pq), 1e-9);
const Wv = W + 10 * heel, xr = (Mr + 10 * heel * (1.35 + heel / 2) - Pa * 4 / 3 - Pq * 2) / Wv, e = 1.5 - xr;
near('Wall: toe pressure (W/B)(1 + 6e/B)', r.res.st.qtoe, Wv / 3 * (1 + 6 * e / 3), 1e-9);
near('Wall: stem moment 1.5(Ka γ h³/6 + Ka q h²/2)', r.res.Mst, 1.5 * (Ka * 18 * h ** 3 / 6 + Ka * 10 * h * h / 2), 1e-9);
let rw = MODS.retwall(Object.assign({}, wp, { B: 0, toe: 0, tb: 0, tstem: 0, q: 20, mu: 0.45 }));
truth('Wall: auto proportions widen the base until stable', rw.ok() && rw.res.st.sld >= 1 && rw.res.st.ovt >= 1);
let rs = MODS.retwall(Object.assign({}, wp, { beta: 15 }));
near('Wall: Rankine Ka for sloping backfill β = 15°', rs.res.Ka, (() => { const b = 15 * Math.PI / 180, f = Math.PI / 6, cb2 = Math.cos(b), r0 = Math.sqrt(cb2 * cb2 - Math.cos(f) ** 2); return cb2 * (cb2 - r0) / (cb2 + r0); })(), 1e-9);

/* ---- combined footing: statics of the longitudinal beam ---- */
const fp = { P1: 800, P2: 1200, s: 4, c1b: 400, c1d: 400, c2b: 450, c2d: 450, edge: 'free', projL: 0, sbc: 200, sw: 10, exp: 'moderate', cover: 50, dia: 16, fck: 25, fy: 415 };
r = MODS.combfoot(fp);
const L = r.res.L, B = r.res.B, aL = r.res.aL, w = 1.5 * 2000 / L, x0 = 1200 / w;
near('Combined footing: resultant at the centre (aL + x̄ = L/2)', aL + 1200 * 4 / 2000, L / 2, 1e-9);
near('Combined footing: hogging moment by statics wx²/2 − Pu1(x − a)', r.res.Mhog, -(w * x0 * x0 / 2 - 1200 * (x0 - aL)), 2e-3);
truth('Combined footing: area ≥ 1.1 P / SBC', L * B >= 2000 * 1.1 / 200 - 1e-9);
r = MODS.combfoot(Object.assign({}, fp, { edge: 'line' }));
near('Property line: column 1 at the edge (projection = half the column)', r.res.aL, 0.2, 1e-9);
near('Property line: L = 2(x̄ + b1/2)', r.res.L, 2 * (2.4 + 0.2), 1e-9);
truth('Property line: design passes', r.ok());

console.log(`\n${pass} passed, ${fail} failed`);
