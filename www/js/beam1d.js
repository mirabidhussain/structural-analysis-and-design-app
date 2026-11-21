/* Line beams by the stiffness method: any number of spans, each support fixed, pinned, roller, free or a vertical spring;
   uniform loads per span and point loads anywhere. Used by the beam module (single span with chosen end conditions,
   cantilever, propped cantilever, fixed–fixed) and by the continuous beam.
   Sign convention: sagging moment +, shear + when the left part is pushed up; loads + downward (kN, m). */
var B1 = (function () {
  var B = {};
  /* end conditions: v = vertical restraint, r = rotational restraint */
  B.SUP = {
    fixed: { v: 1, r: 1, label: "Fixed", sym: "fixed" },
    pinned: { v: 1, r: 0, label: "Pinned (hinged)", sym: "pin" },
    roller: { v: 1, r: 0, label: "Roller", sym: "roller" },
    free: { v: 0, r: 0, label: "Free", sym: "free" },
    spring: { v: 0, r: 0, label: "Spring", sym: "spring" },
    guided: { v: 0, r: 1, label: "Guided (rotation held, sliding)", sym: "guided" }
  };
  /* model: { x: [node positions m], sup: [type per node], ks: [kN/m per node for springs], w: [udl kN/m per element],
              P: [{x, P}] point loads (kN, at any x), EI } — elements are between consecutive x; point loads split elements */
  B.solve = function (o) {
    var xs = o.x.slice(), P = (o.P || []).filter(function (q) { return q.P && q.x >= o.x[0] - 1e-9 && q.x <= o.x[o.x.length - 1] + 1e-9; });
    var sup = {}, ks = {}, wseg = [];
    o.x.forEach(function (x, i) { sup[x.toFixed(6)] = o.sup[i]; ks[x.toFixed(6)] = (o.ks || [])[i] || 0; });
    P.forEach(function (q) { if (!xs.some(function (x) { return Math.abs(x - q.x) < 1e-9; })) xs.push(q.x); });
    xs.sort(function (a, b) { return a - b; });
    for (var e = 0; e + 1 < xs.length; e++) { var xm = (xs[e] + xs[e + 1]) / 2, w = 0; for (var s = 0; s + 1 < o.x.length; s++) if (xm > o.x[s] && xm < o.x[s + 1]) w = (o.w || [])[s] || 0; wseg.push(w); }
    var n = xs.length, nd = 2 * n, K = [], F = new Float64Array(nd), EI = o.EI || 1, i, j;
    for (i = 0; i < nd; i++) K.push(new Float64Array(nd));
    for (e = 0; e + 1 < n; e++) {
      var L = xs[e + 1] - xs[e], k = EI / (L * L * L), w = wseg[e];
      var ke = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]], dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) K[dof[i]][dof[j]] += k * ke[i][j];
      var fe = [-w * L / 2, -w * L * L / 12, -w * L / 2, w * L * L / 12];   /* equivalent nodal loads, up / anticlockwise + */
      for (i = 0; i < 4; i++) F[dof[i]] += fe[i];
    }
    P.forEach(function (q) { var ni = xs.findIndex(function (x) { return Math.abs(x - q.x) < 1e-9; }); F[2 * ni] -= q.P; });
    var fixd = new Uint8Array(nd), spr = new Float64Array(nd);
    xs.forEach(function (x, ni) {
      var t = sup[x.toFixed(6)]; if (!t) return; var S = B.SUP[t] || B.SUP.free;
      if (S.v) fixd[2 * ni] = 1; if (S.r) fixd[2 * ni + 1] = 1;
      if (t === "spring") spr[2 * ni] = ks[x.toFixed(6)] || 0;
    });
    for (i = 0; i < nd; i++) K[i][i] += spr[i];
    var free = []; for (i = 0; i < nd; i++) if (!fixd[i]) free.push(i);
    var nf = free.length, A = [], bb = new Float64Array(nf);
    for (i = 0; i < nf; i++) { A.push(new Float64Array(nf)); for (j = 0; j < nf; j++) A[i][j] = K[free[i]][free[j]]; bb[i] = F[free[i]]; }
    /* Gaussian elimination with partial pivoting; tiny pivot → mechanism */
    var scale = 0; for (i = 0; i < nf; i++) scale = Math.max(scale, Math.abs(A[i][i]));
    for (var c = 0; c < nf; c++) {
      var pr = c; for (i = c + 1; i < nf; i++) if (Math.abs(A[i][c]) > Math.abs(A[pr][c])) pr = i;
      if (Math.abs(A[pr][c]) < 1e-9 * (scale || 1)) throw new Error("The supports chosen do not hold the beam (it is a mechanism) — e.g. free at both ends, or free with a pinned/roller end. Add a fixed end or another support.");
      if (pr !== c) { var tr = A[pr]; A[pr] = A[c]; A[c] = tr; var tb = bb[pr]; bb[pr] = bb[c]; bb[c] = tb; }
      for (i = c + 1; i < nf; i++) { var f = A[i][c] / A[c][c]; if (!f) continue; for (j = c; j < nf; j++) A[i][j] -= f * A[c][j]; bb[i] -= f * bb[c]; }
    }
    var u = new Float64Array(nf); for (i = nf - 1; i >= 0; i--) { var sm = bb[i]; for (j = i + 1; j < nf; j++) sm -= A[i][j] * u[j]; u[i] = sm / A[i][i]; }
    var U = new Float64Array(nd); free.forEach(function (d, k) { U[d] = u[k]; });
    /* element end forces and reactions */
    var R = new Float64Array(nd), els = [];
    for (e = 0; e + 1 < n; e++) {
      L = xs[e + 1] - xs[e]; k = EI / (L * L * L); w = wseg[e];
      var ue = [U[2 * e], U[2 * e + 1], U[2 * e + 2], U[2 * e + 3]], ke2 = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
      var fend = [w * L / 2, w * L * L / 12, w * L / 2, -w * L * L / 12];
      for (i = 0; i < 4; i++) { for (j = 0; j < 4; j++) fend[i] += k * ke2[i][j] * ue[j]; }
      els.push({ x0: xs[e], L: L, w: w, V0: fend[0], M0: -fend[1] });
      R[2 * e] += fend[0]; R[2 * e + 1] += fend[1]; R[2 * e + 2] += fend[2]; R[2 * e + 3] += fend[3];
    }
    P.forEach(function (q) { var ni = xs.findIndex(function (x) { return Math.abs(x - q.x) < 1e-9; }); R[2 * ni] += q.P; });
    var reac = o.x.map(function (x) { var ni = xs.findIndex(function (y) { return Math.abs(y - x) < 1e-9; }), t = o.sup[o.x.indexOf(x)], S = B.SUP[t] || B.SUP.free; return { x: x, type: t, V: S.v || t === "spring" ? (t === "spring" ? -spr[2 * ni] * U[2 * ni] : R[2 * ni]) : 0, M: S.r ? -R[2 * ni + 1] : 0 }; });
    return { xs: xs, U: U, els: els, reac: reac, EI: EI };
  };
  /* moment, shear and deflection at x */
  B.at = function (s, x) {
    var e = s.els.filter(function (q) { return x >= q.x0 - 1e-9 && x <= q.x0 + q.L + 1e-9; })[0] || s.els[s.els.length - 1], t = Math.min(Math.max(x - e.x0, 0), e.L);
    return { M: e.M0 + e.V0 * t - e.w * t * t / 2, V: e.V0 - e.w * t };
  };
  B.diagram = function (s, nper) {
    var pts = [];
    s.els.forEach(function (e, k) { var m = Math.max(2, Math.round((nper || 24) * e.L / Math.max(1e-9, s.xs[s.xs.length - 1] - s.xs[0])) + 2); for (var i = 0; i <= m; i++) { var t = e.L * i / m, x = e.x0 + t; pts.push({ x: x, M: e.M0 + e.V0 * t - e.w * t * t / 2, V: e.V0 - e.w * t, side: i === 0 ? "L" : i === m ? "R" : "" }); } });
    return pts;
  };
  /* extreme values and points of contraflexure */
  B.extremes = function (s) {
    var pts = B.diagram(s, 400), out = { Msag: 0, xs: 0, Mhog: 0, xh: 0, Vmax: 0, xv: 0, zeros: [] };
    pts.forEach(function (q, i) {
      if (q.M > out.Msag) { out.Msag = q.M; out.xs = q.x; } if (-q.M > out.Mhog) { out.Mhog = -q.M; out.xh = q.x; } if (Math.abs(q.V) > out.Vmax) { out.Vmax = Math.abs(q.V); out.xv = q.x; }
      if (i && (pts[i - 1].M > 1e-9 && q.M < -1e-9 || pts[i - 1].M < -1e-9 && q.M > 1e-9)) out.zeros.push(pts[i - 1].x + (q.x - pts[i - 1].x) * pts[i - 1].M / (pts[i - 1].M - q.M));
    });
    return out;
  };
  /* effective length factors of compression members — IS 456 Table 28 and IS 800 Table 11 (recommended values) */
  B.KEFF = {
    "fixed|fixed": [0.65, "both ends held in position and restrained against rotation"],
    "fixed|pinned": [0.80, "both ends held in position, one end restrained against rotation"],
    "pinned|pinned": [1.00, "both ends held in position, neither restrained against rotation"],
    "fixed|guided": [1.20, "both ends restrained against rotation, one end not held in position (sway)"],
    "pinned|guided": [2.00, "one end held in position but not restrained, the other restrained against rotation but not held in position"],
    "fixed|free": [2.00, "one end held in position and restrained against rotation, the other free"],
    "fixed|partial": [1.50, "one end held in position and restrained against rotation, the other partially restrained against rotation but not held in position (IS 456 only)"]
  };
  /* choices for the module forms: [key, label] */
  B.LE_OPTS = [["manual", "Enter the effective length below"], ["fixed|fixed", "0.65 L — braced, both ends fixed"], ["fixed|pinned", "0.80 L — braced, one end fixed, the other pinned"],
    ["pinned|pinned", "1.00 L — braced, both ends pinned"], ["fixed|guided", "1.20 L — sway, both ends fixed"], ["fixed|partial", "1.50 L — sway, top partially restrained"],
    ["pinned|guided", "2.00 L — sway, one end pinned, the other fixed"], ["fixed|free", "2.00 L — cantilever (fixed base, free top)"]];
  /* IS 800 Table 15: effective length for lateral-torsional buckling of simply supported beams — [normal, destabilising, +2D] */
  B.T15 = { ff: [0.70, 0.85, 0, "torsion fully restrained, both flanges fully restrained against warping"], cf: [0.75, 0.90, 0, "torsion fully restrained, compression flange fully restrained against warping"],
    pp: [0.80, 0.95, 0, "torsion fully restrained, both flanges partially restrained against warping"], cp: [0.85, 1.00, 0, "torsion fully restrained, compression flange partially restrained against warping"],
    nw: [1.00, 1.20, 0, "torsion fully restrained, warping not restrained in either flange"], pc: [1.00, 1.20, 1, "torsion partially restrained by a bottom-flange support connection, warping not restrained"],
    pb: [1.20, 1.40, 1, "torsion partially restrained by bottom-flange bearing only, warping not restrained"] };
  B.T15_OPTS = [["manual", "Use the unbraced length below (× 1.2 if destabilising)"]].concat(Object.keys(B.T15).map(function (k) { var t = B.T15[k]; return [k, t[0].toFixed(2) + " L" + (t[2] ? " + 2D" : "") + " — " + t[3]]; }));
  B.keff = function (a, b) {
    var k = B.KEFF[a + "|" + b] || B.KEFF[b + "|" + a];
    if (!k) throw new Error("End conditions " + a + " + " + b + " do not hold the member (mechanism) — choose fixed, pinned or guided ends with at least one end held in position");
    return { k: k[0], why: k[1] };
  };
  return B;
})();
if (typeof module !== "undefined") module.exports = B1;
