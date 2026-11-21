/* STAAD.Pro import: parser, geometry, loads and checks against hand results */
const c = require('./load.js'), { STD, PIPE, FE } = c;
let pass = 0, fail = 0;
function near(name, got, exp, tol) { const ok = Math.abs(got - exp) <= (tol || 1e-6) * Math.max(1, Math.abs(exp)); ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + (+got).toPrecision(6) + ' expected ' + (+exp).toPrecision(6)); }
function truth(name, ok) { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name); }
const P = { fck: 25, fy: 415, fys: 250, pcCol: 1, pcBeam: 1, method: 'lsm', exposure: 'moderate', fire: 1, crack: false, base: 'fixed', kcol: 1.2 };
function run(txt, opt) { const M = STD.parse(txt), g = STD.toGeo(M, opt || {}), S = PIPE.run(g, Object.assign({}, P, (opt || {}).p || {}), false); return { M, g, S }; }
function Rz(S, cb, node) { const r = S.res.combos.filter(x => x.name.startsWith(cb))[0].reac; return r[node][2]; }
function caseRz(S, cn) { const r = S.res.caseReac[cn]; return Object.keys(r).reduce((s, k) => s + r[k][2], 0); }
function sumRz(S, cb) { const r = S.res.combos.filter(x => x.name.startsWith(cb))[0].reac; return Object.keys(r).reduce((s, k) => s + r[k][2], 0); }

/* 1 simply supported beam, Y up: point load 30 kN at 2 m and UDL 10 kN/m on 6 m */
let t = `STAAD SPACE
UNIT METER KN
JOINT COORDINATES
1 0 0 0; 2 6 0 0;
MEMBER INCIDENCES
1 1 2;
MEMBER PROPERTY INDIAN
1 PRIS YD 0.45 ZD 0.3
CONSTANTS
E 2.5e7 ALL
POISSON 0.2 ALL
DENSITY 0 ALL
SUPPORTS
1 FIXED BUT MZ
2 FIXED BUT FX MZ
LOAD 1 LOADTYPE Live TITLE P
MEMBER LOAD
1 CON GY -30 2
LOAD 2 LOADTYPE Dead TITLE W
MEMBER LOAD
1 UNI GY -10
LOAD COMBINATION 3 W+P
1 1.0 2 1.0
PERFORM ANALYSIS
FINISH`;
let r = run(t);
near('Point load 30 kN at 2 m: left reaction 20', Rz(r.S, 'C3', 0) - 30, 20);
near('Point load: right reaction 10', Rz(r.S, 'C3', 1) - 30, 10);
let fr = r.S.res.combos[0].fr[0], dg = FE.frameDiagram(fr, 6);
near('Moment under the point load = 20·2 + UDL 10·2·(6−2)/2', dg[2].Mz, 40 + 40, 1e-6);
truth('Member kept as one element (no splitting for loads)', r.S.m.frames.length === 1);
near('Section from PRIS: depth 450 mm (YD) as D', r.S.m.frames[0].sec.D, 450);

/* 2 same beam with SET Z UP, units mm and N, GZ loads, UNI partial */
t = `STAAD SPACE
SET Z UP
UNIT MMS NEWTON
JOINT COORDINATES
1 0 0 0 3 6000 0 0
MEMBER INCIDENCES
1 1 2 2
MEMBER PROPERTY
1 2 PRIS YD 450 ZD 300
CONSTANTS
E 25000 ALL
DENSITY 0 ALL
SUPPORTS
1 FIXED BUT MY
3 FIXED BUT FX MY
LOAD 1 TITLE PARTIAL
MEMBER LOAD
1 UNI GZ -10 1000 3000
PERFORM ANALYSIS
FINISH`;
r = run(t);
truth('Joint generation 1…3 over 6 m', r.S.m.nodes.length === 3 && Math.abs(r.S.m.nodes[1].x - 3) < 1e-9);
truth('Member generation 1 1 2 2', r.S.m.frames.length === 2 && r.S.m.frames[1].n1 === 1);
near('Partial UDL 10 kN/m from 1 to 3 m on member 1 (6 m span): R1 = 20·(6−2)/6', r.S.res.caseReac.L1[0][2], 20 * 4 / 6);
near('E from N/mm² to kN/m²', r.S.m.frames[0].sec.E, 2.5e7);
truth('Z-up model kept vertical axis', r.M.zup && Math.abs(r.S.m.nodes[2].z) < 1e-12);

/* 3 portal frame: floor load on a 4 × 6 m panel carried by 4 beams; total = 5 × 24 = 120 kN */
t = `STAAD SPACE
UNIT METER KN
JOINT COORDINATES
1 0 0 0; 2 4 0 0; 3 4 0 6; 4 0 0 6; 5 0 3 0; 6 4 3 0; 7 4 3 6; 8 0 3 6
MEMBER INCIDENCES
1 1 5; 2 2 6; 3 3 7; 4 4 8; 5 5 6; 6 6 7; 7 7 8; 8 8 5
MEMBER PROPERTY
1 TO 4 PRIS YD 0.4 ZD 0.4
5 TO 8 PRIS YD 0.45 ZD 0.3
CONSTANTS
MATERIAL CONCRETE ALL
SUPPORTS
1 TO 4 FIXED
LOAD 1 LOADTYPE Live TITLE FLOOR
FLOOR LOAD
YRANGE 2.9 3.1 FLOAD -5 GY
LOAD 2 LOADTYPE Dead TITLE SELF
SELFWEIGHT Y -1
LOAD 3 TITLE REPEAT
REPEAT LOAD
1 1.5 2 1.5
LOAD COMBINATION 4 1.5DL+1.5LL
1 1.5 2 1.5
PERFORM ANALYSIS
FINISH`;
r = run(t);
near('Floor load 5 kN/m² × 4 × 6 m = 120 kN reaches the supports', caseRz(r.S, 'L1'), 120, 1e-6);
let lv = r.S.res.cases.L1.lv, tot = 0; for (let i = 2; i < lv.Ffull.length; i += 6) tot += lv.Ffull[i];
near('Floor load total applied −120 kN', tot, -120);
/* short beam (4 m) gets a triangle w·lx/2 = 10 peak → total 20 kN; long beam (6 m) trapezoid → total 40 kN */
let k5 = r.g.std.fmap[5][0], k6 = r.g.std.fmap[6][0], ld5 = 0, ld6 = 0;
r.S.L.cases.L1.frameLoads.forEach(q => { const s = (q.w1[2] + q.w2[2]) / 2 * (q.b - q.a); if (q.e === k5) ld5 += s; if (q.e === k6) ld6 += s; });
near('Short (4 m) beam: triangular share 5·4²/4 = 20 kN', -ld5, 20);
near('Long (6 m) beam: trapezoidal share 5·4/2·(6 − 2) = 40 kN', -ld6, 40);
let sw = 0; r.S.m.frames.forEach(e => { sw += e.sec.gamma * e.sec.A * e.L; });
near('Self weight with STAAD concrete density 23.5616 kN/m³', -(() => { let s = 0; const F = r.S.res.cases.L2.lv.Ffull; for (let i = 2; i < F.length; i += 6) s += F[i]; return s; })(), sw);
near('REPEAT LOAD 1.5 L1 + 1.5 L2 equals the combination', caseRz(r.S, 'L3'), sumRz(r.S, 'C4'));
truth('Dead and live aliases DL / LL created', !!r.S.L.cases.DL && !!r.S.L.cases.LL);

/* 4 IS 1893 seismic from DEFINE 1893 LOAD: single storey, joint weights → Vb = Ah·W */
t = `STAAD SPACE
UNIT METER KN
JOINT COORDINATES
1 0 0 0; 2 5 0 0; 3 0 3.5 0; 4 5 3.5 0
MEMBER INCIDENCES
1 1 3; 2 2 4; 3 3 4
MEMBER PROPERTY
1 TO 3 PRIS YD 0.4 ZD 0.3
CONSTANTS
MATERIAL CONCRETE ALL
SUPPORTS
1 2 FIXED
DEFINE 1893 LOAD
ZONE 0.24 RF 5 I 1.2 SS 2 ST 1 DM 0.05
JOINT WEIGHT
3 4 WEIGHT 200
LOAD 1 LOADTYPE Seismic TITLE EQX
1893 LOAD X 1
LOAD 2 LOADTYPE Seismic TITLE EQX-
1893 LOAD X -1
LOAD 3 LOADTYPE Dead TITLE DL
SELFWEIGHT Y -1
LOAD COMBINATION 4 C
3 1.5 1 1.5
PERFORM ANALYSIS
FINISH`;
r = run(t);
let T = 0.075 * Math.pow(3.5, 0.75), Sa = c.LD.saG(T, 'II'), Ah = 0.24 / 2 * 1.2 / 5 * Sa;
near('1893 LOAD X: Vb = Ah·W, W = 400 kN', r.S.L.stdEq.L1.Vb, Ah * 400);
let Fx = 0; const F1 = r.S.res.cases.L1.lv.Ffull; for (let i = 0; i < F1.length; i += 6) Fx += F1[i];
near('Seismic case applies Vb in +X', Fx, Ah * 400);
let Fx2 = 0; const F2 = r.S.res.cases.L2.lv.Ffull; for (let i = 0; i < F2.length; i += 6) Fx2 += F2[i];
near('1893 LOAD X −1 reverses it', Fx2, -Ah * 400);

/* 5 checks: cancelling wind, missing 1.5(DL+LL), no reversal, plates */
t = `STAAD SPACE
UNIT METER KN
JOINT COORDINATES
1 0 0 0; 2 5 0 0; 3 0 3 0; 4 5 3 0; 5 0 3 4; 6 5 3 4; 7 0 0 4; 8 5 0 4
MEMBER INCIDENCES
1 1 3; 2 2 4; 3 3 4; 4 7 5; 5 8 6; 6 5 6; 7 3 5; 8 4 6
ELEMENT INCIDENCES SHELL
9 3 4 6 5
ELEMENT PROPERTY
9 THICKNESS 0.125
MEMBER PROPERTY
1 TO 8 PRIS YD 0.4 ZD 0.3
CONSTANTS
MATERIAL CONCRETE ALL
SUPPORTS
1 2 7 8 FIXED
DEFINE WIND LOAD
TYPE 1
INT 1.0 HEIG 10
LOAD 1 LOADTYPE Wind TITLE WX
WIND LOAD X 1 TYPE 1
WIND LOAD X -1 TYPE 1
LOAD 2 LOADTYPE Dead TITLE DL
SELFWEIGHT Y -1
LOAD 3 LOADTYPE Live TITLE LL
ELEMENT LOAD
9 PR GY -3
LOAD COMBINATION 4 C
2 1.2 3 1.2 1 1.2
PERFORM ANALYSIS
FINISH`;
r = run(t);
let au = STD.audit(r.M, r.g, r.S.m), has = s => au.some(a => a.t.indexOf(s) >= 0 && a.sev !== 'ok');
truth('Check: wind loads cancel in a case', has('Wind loads cancel'));
truth('Check: no 1.5(DL + LL)', has('No 1.5(DL + LL)'));
truth('Check: no wind reversal', has('No load reversal for wind'));
truth('Check: plate larger than 2 m', has('larger than 2 m'));
let mc = STD.modelChecks(r.S);
truth('Model check: wind case has zero net horizontal force', mc.some(a => a.t.indexOf('zero net horizontal') >= 0));
truth('No false alarm: no column in tension under gravity', !mc.some(a => a.t.indexOf('tension') >= 0));
/* gravity given upward → columns in tension flagged */
r = run(t.replace('SELFWEIGHT Y -1', 'SELFWEIGHT Y 1').replace('PR GY -3', 'PR GY 3'));
mc = STD.modelChecks(r.S);
truth('Model check: gravity applied upward → columns in tension', mc.some(a => a.t.indexOf('in tension') >= 0));
/* plate meshing splits the edge beams and keeps the load */
r = run(t, { mesh: 1 });
truth('Plate meshed 5 × 4 and edge beams split at the mesh nodes', r.S.m.shells.length === 20 && r.g.std.fmap[3].length === 5);
let F3 = r.S.res.cases.L3.lv.Ffull, s3 = 0; for (let i = 2; i < F3.length; i += 6) s3 += F3[i];
near('Plate pressure 3 kN/m² × 20 m² kept after meshing', s3, -60);

console.log(`\n${pass} passed, ${fail} failed`);
