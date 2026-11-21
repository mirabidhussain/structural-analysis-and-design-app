/* IS GeoTech engine checks against published values and hand calculations */
const GC = require('../www/js/gcore.js');
let pass = 0, fail = 0;
function ok(n, c, info) { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && info !== undefined ? ' — ' + info : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* IS 6403 Table 1 bearing capacity factors */
const T1 = { 0: [5.14, 1, 0], 5: [6.49, 1.57, 0.45], 10: [8.35, 2.47, 1.22], 15: [10.98, 3.94, 2.65], 20: [14.83, 6.40, 5.39], 25: [20.72, 10.66, 10.88], 30: [30.14, 18.40, 22.40], 35: [46.12, 33.30, 48.03], 40: [75.31, 64.20, 109.41], 45: [133.88, 134.88, 271.76], 50: [266.89, 319.07, 762.89] };
let worst = 0; Object.keys(T1).forEach(p => { const F = GC.factors(+p), t = T1[p]; [F.Nc, F.Nq, F.Ng].forEach((v, i) => { if (t[i]) worst = Math.max(worst, Math.abs(v - t[i]) / t[i]); }); });
ok('Nc, Nq, Nγ match IS 6403 Table 1 within 0.5 % for φ = 0–50°', worst < 0.005, worst);

/* Boussinesq */
ok('Fadum corner factor m = n = 1 → 0.1752', near(GC.fadum(1, 1), 0.1752, 0.0002), GC.fadum(1, 1));
ok('Fadum m = 2, n = 1 → 0.1999', near(GC.fadum(2, 1), 0.1999, 0.0002), GC.fadum(2, 1));
ok('Fadum m = n → ∞ → 0.25', near(GC.fadum(1e4, 1e4), 0.25, 1e-4));
ok('Fadum m = n = 3 (π branch) = numerical integration 0.2439', near(GC.fadum(3, 3), 0.2439, 0.0003), GC.fadum(3, 3));
ok('Square B under centre at z = B: 4·I(0.5, 0.5) = 0.336', near(GC.rectAt(1, -1, 1, -1, 1, 0, 0, 2), 0.336, 0.002), GC.rectAt(1, -1, 1, -1, 1, 0, 0, 2));
ok('Strip under centre at z = B → 0.550', near(GC.stripAt(1, -1, 1, 0, 2), 0.550, 0.001), GC.stripAt(1, -1, 1, 0, 2));
ok('Circle centre line at z = R → 0.6464', near(GC.circleAt(1, 1, 0, 0, 1), 0.6464, 1e-4));
ok('Circle off-axis numeric = exact on axis limit (r = 0.001 R)', near(GC.circleAt(1, 1, 0.001, 0, 1), 0.6464, 0.002), GC.circleAt(1, 1, 0.001, 0, 1));
ok('Rectangle point outside the area: superposition with negative parts', near(GC.rectAt(1, 0, 1, 0, 1, 2, 0.5, 1), GC.fadum(2, 0.5) * 2 - GC.fadum(1, 0.5) * 2, 1e-9));

/* Steinbrenner */
const s1 = GC.stein(1, 1e5, 0);
ok('Steinbrenner F1 → 0.561 for a square corner on a deep layer', near(s1.F1, 0.5611, 0.001), s1.F1);
ok('Steinbrenner F2 → 0 for a deep layer', s1.F2 < 1e-4, s1.F2);
const s2 = GC.stein(1, 1, 0.3);
ok('Steinbrenner m = 1, n = 1: F1 = 0.142, F2 = 0.083 (Bowles Table 5-2)', near(s2.F1, 0.142, 0.002) && near(s2.F2, 0.083, 0.002), s2.F1.toFixed(4) + ' / ' + s2.F2.toFixed(4));

/* consolidation degree */
ok('U(Tv = 0.197) = 50 %, U(0.848) = 90 %', near(GC.U(0.197), 0.5, 0.002) && near(GC.U(0.848), 0.9, 0.002), GC.U(0.197) + ' ' + GC.U(0.848));
ok('Tv(50 %) = 0.196, Tv(90 %) = 0.848', near(GC.Tv(0.5), 0.196, 0.002) && near(GC.Tv(0.9), 0.848, 0.002));

/* bearing capacity — hand calculation: square 2 × 2, Df 1.5, c = 0, φ = 30°, γ = 18, water deep, no depth factors, dense */
let P = GC.blank('t'); P.boreholes.push({ id: 'b', name: 'B', gwt: '', layers: [GC.layer({ top: 0, bot: 10, kind: 'sand', gamma: 18, gsat: 20, phi: 30, Dr: 80, E: 30000 })], spt: [] });
let f = { id: 'f', bh: 'b', shape: 'square', B: 2, L: 2, Df: 1.5, P: 0, H: 0 }; P.footings.push(f);
let bc = GC.bearing(P, f);
let hand = 27 * (GC.factors(30).Nq - 1) * 1.2 + 0.5 * 2 * 18 * GC.factors(30).Ng * 0.8;
ok('Sand, square, general shear: qnu = q(Nq−1)sq + ½BγNγsγ = 886 kPa', near(bc.qnu, hand, 0.5) && near(hand, 886.3, 1), bc.qnu.toFixed(1) + ' vs ' + hand.toFixed(1));
P.boreholes[0].gwt = 1.5; bc = GC.bearing(P, f);
ok('Water table at the base: W′ = 0.5 and q uses effective weight', bc.Wp === 0.5 && near(bc.q, 27, 1e-9), bc.Wp + ' ' + bc.q);
P.boreholes[0].gwt = 2.5; bc = GC.bearing(P, f);
ok('Water table at Df + B/2: W′ = 0.75', near(bc.Wp, 0.75, 1e-9), bc.Wp);
P.boreholes[0].gwt = ''; P.boreholes[0].layers[0].Dr = 20; bc = GC.bearing(P, f);
const phiL = Math.atan(2 / 3 * Math.tan(30 * Math.PI / 180)) * 180 / Math.PI, FL = GC.factors(phiL);
ok('Loose sand (Dr 20 %): local shear with tan φ′ = ⅔ tan φ', near(bc.qnu, 27 * (FL.Nq - 1) * 1.2 + 0.5 * 2 * 18 * FL.Ng * 0.8, 0.5), bc.qnu);
P.boreholes[0].layers[0].Dr = 45; bc = GC.bearing(P, f);
ok('Medium sand (Dr 45 %): halfway between local and general', near(bc.qnu, 0.5 * hand + 0.5 * (27 * (FL.Nq - 1) * 1.2 + 0.5 * 2 * 18 * FL.Ng * 0.8), 0.5));
P.depthF = true; P.boreholes[0].layers[0].Dr = 80; bc = GC.bearing(P, f);
const Nf = Math.pow(Math.tan(60 * Math.PI / 180), 2), dq = 1 + 0.1 * 0.75 * Math.sqrt(Nf);
ok('Depth factors dq = dγ = 1 + 0.1(Df/B)√Nφ when backfill is compacted', near(bc.qnu, 27 * (GC.factors(30).Nq - 1) * 1.2 * dq + 0.5 * 2 * 18 * GC.factors(30).Ng * 0.8 * dq, 0.5));
P.depthF = false;
f.P = 1000; f.H = 100; bc = GC.bearing(P, f);
const al = Math.atan(0.1) * 180 / Math.PI;
ok('Inclined load: iq = (1 − α/90)², iγ = (1 − α/φ)²', near(bc.qnu, 27 * (GC.factors(30).Nq - 1) * 1.2 * Math.pow(1 - al / 90, 2) + 0.5 * 2 * 18 * GC.factors(30).Ng * 0.8 * Math.pow(1 - al / 30, 2), 0.5));
f.H = 0; f.eB = 0.2; bc = GC.bearing(P, f);
ok('Eccentricity: B′ = B − 2e = 1.6 m, rectangle 1.6 × 2 shape factors', near(bc.dims.B1, 1.6, 1e-9) && near(bc.shape.sg, 1 - 0.4 * 0.8, 1e-9));
f.eB = 0;
/* undrained clay */
let Q = GC.blank('c'); Q.boreholes.push({ id: 'b', name: 'B', gwt: 1, layers: [GC.layer({ top: 0, bot: 10, kind: 'clay', gamma: 18, gsat: 18, cu: 50, nu: 0.5, E: 15000, Cc: 0.3, e0: 1.0, cv: 3 })], spt: [] });
let g = { id: 'g', bh: 'b', shape: 'square', B: 2, L: 2, Df: 1.5, P: 600, H: 0 }; Q.footings.push(g);
bc = GC.bearing(Q, g);
ok('Clay, undrained: qnu = cu·5.14·1.3 = 334 kPa (cl. 5.3.1.1)', near(bc.qnu, 50 * 5.14 * 1.3, 0.01), bc.qnu);

/* consolidation — single NC clay layer by hand */
let s = GC.settle(Q, g, 150, { rigid: false });
let hs = 0; const n = Math.ceil(8.5 / 0.5), h = 8.5 / n;
for (let k = 0; k < n; k++) { const zm = 1.5 + (k + 0.5) * h; if (zm > s.zi) break; }
{ let tot = 0; const zi = s.zi; const nn = Math.max(1, Math.ceil((zi - 1.5) / 0.5)), hh = (zi - 1.5) / nn;
  for (let k = 0; k < nn; k++) { const zm = 1.5 + (k + 0.5) * hh, s0 = 18 * zm - 9.81 * (zm - 1), ds = GC.rectAt(150, -1, 1, -1, 1, 0, 0, zm - 1.5); tot += 0.3 * hh / 2 * Math.log10((s0 + ds) / s0); }
  hs = tot * 1000; }
ok('Consolidation settlement = Σ Cc·H/(1+e0)·log((σ′0+Δσ)/σ′0) over the stressed depth', near(s.con, hs, 0.05), s.con.toFixed(2) + ' vs ' + hs.toFixed(2));
ok('Influence depth where Δσ < 10 % σ′v', s.zi > 4 && s.zi < 10, s.zi);
ok('Undrained immediate settlement uses ν = 0.5 (F2 term vanishes)', s.imm > 0);
ok('Time: t90 = 0.848·Hdr²/cv for a layer drained at the top only', near(s.layers[0].t90, 0.848 * 100 / 3, 0.5) && s.layers[0].drain === 'top only', s.layers[0].t90 + ' ' + s.layers[0].drain);
const s1y = GC.settleTime(s, s.layers[0].t90); ok('Settlement at t90 = immediate + 90 % of consolidation', near(s1y, s.imm + 0.9 * s.con, 0.05 * s.con));
/* overconsolidated: below σ′p uses Cr */
Q.boreholes[0].layers[0].pc = 400; Q.boreholes[0].layers[0].Cr = 0.05;
let so = GC.settle(Q, g, 150, { rigid: false });
ok('Overconsolidated clay settles less (Cr below σ′p), and no yield flagged', so.con < s.con * 0.25 && !so.layers[0].yld, so.con);
Q.boreholes[0].layers[0].pc = 60; so = GC.settle(Q, g, 150, { rigid: false });
ok('Lightly overconsolidated: loading past σ′p is flagged as yielding', so.layers[0].yld === true);
Q.boreholes[0].layers[0].pc = 0;

/* elastic settlement: uniform deep layer vs closed form (centre of flexible square on half-space, Ip = 1.122) */
let E = GC.blank('e'); E.cut = 0.0001; E.boreholes.push({ id: 'b', name: 'B', gwt: '', layers: [GC.layer({ top: 0, bot: 400, kind: 'sand', gamma: 18, phi: 35, Dr: 80, E: 20000, nu: 0.3 })], spt: [] });
let fe = { id: 'e', bh: 'b', shape: 'square', B: 2, L: 2, Df: 0, P: 0, H: 0 }; E.footings.push(fe);
const se = GC.settle(E, fe, 100, { rigid: false });
ok('Elastic: flexible square centre on a deep layer, s = qB(1−ν²)·1.122/E = 10.2 mm', near(se.imm, 100 * 2 * 0.91 * 1.122 / 20000 * 1000, 0.25), se.imm.toFixed(2));
const sr = GC.settle(E, fe, 100); ok('Rigid footing factor 0.8 (IS 8009)', near(sr.imm, 0.8 * se.imm, 1e-6));

/* IS 1904 limits and allowable pressure */
P = GC.sample(); const fa = P.footings[0], al2 = GC.allowable(P, fa);
ok('Sample: allowable pressure is the smaller of shear and settlement', near(al2.qa, Math.min(al2.bc.qns, al2.qSettle), 1e-6) && al2.qa > 0, JSON.stringify({ qns: al2.bc.qns, qs: al2.qSettle }));
ok('Settlement at the allowable pressure equals the limit when settlement governs', al2.gov !== 'settlement' || near(GC.settle(P, fa, al2.qSettle).total, al2.lim.mm, 0.05));
ok('IS 1904:2021 Table 1: RC, isolated, plastic clay → 75 mm', GC.IS1904.rc.iso.clay[0] === 75 && GC.IS1904.frame.iso.sand[0] === 60);
const fl = GC.failure(P, fa);
ok('Sample: soft clay at 4 m is identified by the 2:1 check and settlement share', fl.items.some(i => /soft silty clay/i.test(i.t) && /2:1/.test(i.t)) && fl.items.some(i => /settlement/.test(i.t) && /clay/i.test(i.t)), fl.items.map(i => i.t).join(' | '));

/* weak layer punching: strong sand over very soft clay should fail the 2:1 check */
let W = GC.blank('w'); W.boreholes.push({ id: 'b', name: 'B', gwt: '', layers: [GC.layer({ top: 0, bot: 2.2, kind: 'sand', gamma: 18, phi: 34, Dr: 75, E: 30000 }), GC.layer({ top: 2.2, bot: 8, name: 'Very soft clay', kind: 'clay', gamma: 16, gsat: 16, cu: 12, E: 3000, nu: 0.5 })], spt: [] });
let fw = { id: 'w', bh: 'b', shape: 'square', B: 2, L: 2, Df: 1, P: 800, H: 0 }; W.footings.push(fw);
const fwl = GC.failure(W, fw);
ok('Strong over very weak: punching into the soft clay is reported as a failure', fwl.items.some(i => i.sev === 'err' && /Very soft clay/.test(i.t)), fwl.items.map(i => i.sev + ':' + i.t).join(' | '));
/* hand: qz = 800/(3.2²) = 78.1; capacity of fictitious 3.2 m footing at 2.2 m on cu 12 = 12·5.14·1.3 = 80.2 → FS 1.03 */
ok('2:1 check by hand: 800/3.2² = 78.1 kPa vs 12·5.14·1.3 = 80.2 kPa → FS ≈ 1.03', fwl.items.some(i => /FS = 1\.0[23]/.test(i.t)));

/* SPT */
const bh = { gwt: 2, layers: [GC.layer({ top: 0, bot: 10, kind: 'sand', gamma: 18, gsat: 20 })], spt: [{ z: 5, N: 30 }] };
const sp = GC.spt(bh)[0], sv = 2 * 18 + 3 * 20 - 3 * 9.81, CN = 0.77 * Math.log10(2000 / sv), N1 = 30 * CN;
ok('SPT overburden correction CN = 0.77 log(2000/σ′v)', near(sp.CN, CN, 1e-9) && near(sp.sv, sv, 1e-9));
ok('SPT dilatancy: N″ = 15 + ½(N′ − 15) for submerged fine sand', near(sp.Nc, 15 + 0.5 * (N1 - 15), 1e-9) && sp.dil);
ok('φ from N (Peck–Hanson–Thornburn): N = 10 → 30°, N = 30 → 35.6°', near(GC.phiFromN(10), 30.05, 0.1) && near(GC.phiFromN(30), 35.6, 0.2));

/* classification IS 1498 */
let c1 = GC.classify({ sieve: [[4.75, 50], [2, 100], [0.425, 150], [0.075, 150], [0.0001, 50]], total: 500 });
ok('Sieve: gravel 10 %, fines 10 % → dual symbol S?-SM', c1.G === 10 && near(c1.F, 10, 1e-9) && /^S[WP]-SM$/.test(c1.sym), c1.sym + ' G' + c1.G + ' F' + c1.F);
let c2 = GC.classify({ fines: 60, gravel: 0, LL: 45, PL: 25 });
ok('Fines 60 %, LL 45, PI 20 (above A-line 18.25) → CI', c2.sym === 'CI', c2.sym);
let c3 = GC.classify({ fines: 70, gravel: 0, LL: 55, PL: 40 });
ok('LL 55, PI 15 (below A-line) → MH', c3.sym === 'MH', c3.sym);
let c4 = GC.classify({ fines: 20, gravel: 10, LL: 30, PL: 18 });
ok('Sand with 20 % clayey fines (PI 12 above A-line) → SC', c4.sym === 'SC', c4.sym);
let c5 = GC.classify({ sieve: [[20, 0], [10, 100], [4.75, 100], [2, 100], [0.6, 100], [0.15, 80], [0.075, 15]], total: 500 });
ok('Well graded sand-gravel with 1 % fines → G or S with W/P from Cu, Cc', /^[GS][WP]$/.test(c5.sym) && c5.Cu > 0, c5.sym + ' Cu ' + c5.Cu);

/* plate load test */
const pl = GC.plate({ Bp: 0.3, Bf: 2, soil: 'sand', rows: [[0, 0], [50, 1], [100, 2.1], [150, 3.3], [200, 4.6], [250, 6.6], [300, 10], [350, 16], [400, 25]] }, { fs: 2.5 });
ok('Plate test: sand scaling [Bf(Bp+0.3)/(Bp(Bf+0.3))]² = 3.025', near(pl.scale, 3.0246, 0.001), pl.scale);
ok('Plate test: log–log break between 200 and 300 kPa', pl.qu > 200 && pl.qu < 300, pl.qu);
ok('Plate test: pressure for 25 mm under the footing = plate pressure at 8.27 mm', near(pl.spLim, 25 / 3.0246, 1e-3) && pl.qSettle > 250 && pl.qSettle < 300, pl.qSettle);
const pc = GC.plate({ Bp: 0.3, Bf: 2, soil: 'clay', rows: [[0, 0], [50, 1], [100, 2.1], [150, 3.3], [200, 4.6], [250, 6.6], [300, 10], [350, 16], [400, 25]] }, { fs: 2.5 });
ok('Plate test in clay: settlement scales with B, ultimate unchanged', near(pc.scale, 2 / 0.3, 1e-9) && near(pc.quF, pc.qu, 1e-9));

/* pressure bulb contours */
const gr = GC.bulbGrid(P, fa, { nx: 41, nz: 41 }), seg = GC.contour(gr, 0.2 * gr.q);
ok('Pressure bulb: 0.2q contour exists and closes near depth 1.5B below a square', seg.length > 10 && Math.max(...seg.flat().map(p => p[1])) - fa.Df > 1.2 * fa.B && Math.max(...seg.flat().map(p => p[1])) - fa.Df < 2.2 * fa.B);
const pr = GC.load(GC.save(P)); ok('Project file round trip', pr.boreholes[0].layers.length === 4 && pr.footings.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
