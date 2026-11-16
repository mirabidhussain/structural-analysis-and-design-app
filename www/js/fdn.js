/* Pile foundations — IS 2911 (Part 1/Sec 2):2010 bored cast-in-situ piles (Sec 1/3 driven piles as an option), IS 456 pile caps,
   and a standalone raft (mat) that reuses the plate-on-springs engine of mat.js. Column loads come from a table (service loads),
   or from the frame analysis. Output: Rep report + drawings (SVG and DXF) + bar bending schedule + BOQ with JKSOR 2022 rates.
   Units: kN, m inside the soil / pile analysis; mm for sections and drawings. */
var FD = {};
/* ------------------------------------------------------------------ inputs */
FD.cols = function (txt) {
  return String(txt || "").split(/\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^#/.test(l); }).map(function (l, i) {
    var a = l.split(/[,;\t]+/).map(function (s) { return s.trim(); }), num = function (k) { var v = parseFloat(a[k]); return isFinite(v) ? v : 0; };
    return { mark: a[0] || "C" + (i + 1), x: num(1), y: num(2), P: num(3), Mx: num(4), My: num(5), Hx: num(6), Hy: num(7) };
  }).filter(function (c) { return c.P > 0; });
};
FD.soil = function (txt) {
  var z = 0, out = [];
  String(txt || "").split(/\n/).forEach(function (l) {
    var a = l.split(/[,;\t]+/).map(function (s) { return s.trim(); }); if (a.length < 4) return;
    var t = /^s|^g/i.test(a[0]) ? "sand" : "clay", h = parseFloat(a[1]), v = parseFloat(a[2]), g = parseFloat(a[3]);
    if (!(h > 0) || !(g > 0)) return;
    out.push({ type: t, z0: z, z1: z + h, h: h, c: t === "clay" ? v : 0, phi: t === "sand" ? v : 0, g: g }); z += h;
  });
  if (out.length) out[out.length - 1].z1 = Infinity;   /* the last layer continues below */
  return out;
};
/* adhesion factor, IS 2911 Fig 2 (α = 1 up to cu = 40 kPa, 0.5 from 70 kPa, linear between) */
FD.alpha = function (cu) { return cu <= 40 ? 1 : cu >= 70 ? 0.5 : 1 - 0.5 * (cu - 40) / 30; };
/* bearing capacity factor Nq for deep foundations (IS 2911 Fig 1, Berezantsev type), read at L/D ≈ 20 — bored; driven ≈ 2 × */
FD.NQ = [[25, 9], [28, 14], [30, 20], [32, 28], [34, 42], [36, 62], [38, 95], [40, 140], [42, 200]];
FD.Nq = function (phi, driven) {
  var t = FD.NQ, v; if (phi <= t[0][0]) v = t[0][1] * phi / t[0][0]; else if (phi >= t[t.length - 1][0]) v = t[t.length - 1][1];
  else for (var i = 1; i < t.length; i++) if (phi <= t[i][0]) { var r = (phi - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); v = Math.exp(Math.log(t[i - 1][1]) + r * (Math.log(t[i][1]) - Math.log(t[i - 1][1]))); break; }
  return driven ? 2 * v : v;
};
/* Nγ for general shear failure (IS 6403) */
FD.Ng = function (phi) { var f = phi * Math.PI / 180, nq = Math.exp(Math.PI * Math.tan(f)) * Math.pow(Math.tan(Math.PI / 4 + f / 2), 2); return 2 * (nq + 1) * Math.tan(f); };
/* effective overburden at depth z (kN/m²) */
FD.sigma = function (L, z) { var s = 0; L.forEach(function (q) { var a = q.z0, b = Math.min(q.z1, z); if (b > a) s += q.g * (b - a); }); return s; };
/* -------------------------------------------------------- single pile capacity (IS 2911 Annex B) */
FD.capacity = function (p, Lay) {
  var D = p.Dp / 1000, Ap = Math.PI * D * D / 4, zt = p.zc, zb = p.zc + p.Lp, drv = p.ptype === "driven", K = p.K > 0 ? p.K : drv ? 1.5 : 1.0, rows = [], Qs = 0, Qb = 0, tip = null;
  function crit(phi) { return (phi <= 30 ? 15 : phi >= 40 ? 20 : 15 + (phi - 30) / 2) * D; }
  Lay.forEach(function (q) {
    var a = Math.max(q.z0, zt), b = Math.min(q.z1, zb); if (b <= a) return;
    var h = b - a, As = Math.PI * D * h, f, v;
    if (q.type === "clay") { var al = FD.alpha(q.c); f = al * q.c; v = f * As; rows.push({ q: q, a: a, b: b, h: h, kind: "clay", al: al, f: f, Q: v }); }
    else { var zm = Math.min((a + b) / 2, zt + crit(q.phi)), pd = FD.sigma(Lay, zm), dl = q.phi * Math.PI / 180; f = K * pd * Math.tan(dl); v = f * As; rows.push({ q: q, a: a, b: b, h: h, kind: "sand", K: K, pd: pd, zm: zm, f: f, Q: v }); }
    Qs += v; if (zb > q.z0 - 1e-9 && zb <= q.z1 + 1e-9) tip = q;
  });
  if (!tip && Lay.length) tip = Lay[Lay.length - 1];
  var tipD = null;
  if (tip && tip.type === "clay") { Qb = Ap * 9 * tip.c; tipD = { kind: "clay", Nc: 9, c: tip.c }; }
  else if (tip) { var zc2 = Math.min(zb, zt + crit(tip.phi)), PD = FD.sigma(Lay, zc2), nq = FD.Nq(tip.phi, drv), ng = FD.Ng(tip.phi); Qb = Ap * (0.5 * D * tip.g * ng + PD * nq); tipD = { kind: "sand", Nq: nq, Ng: ng, PD: PD, phi: tip.phi, zc: zc2 }; }
  var Wp = (25 - 10) * Ap * p.Lp, Qu = Qs + Qb, FOS = p.fos > 0 ? p.fos : 2.5;
  return { rows: rows, Qs: Qs, Qb: Qb, Qu: Qu, FOS: FOS, Qsafe: Qu / FOS, Qup: (Qs + Wp) / 3, Wp: Wp, tip: tipD, K: K, Ap: Ap };
};
/* -------------------------------------------------------- laterally loaded pile: beam on Winkler springs (IS 2911 Annex C moduli) */
FD.lateral = function (p, Lay, H, fixed) {
  var D = p.Dp / 1000, E = 5000 * Math.sqrt(p.fck) * 1000, I = Math.PI * Math.pow(D, 4) / 64, EI = E * I, L = p.Lp, ne = Math.max(40, Math.ceil(L / 0.25)), h = L / ne, n = ne + 1, N = 2 * n;
  var K = []; for (var i = 0; i < N; i++) K.push(new Float64Array(N));
  function nh(q) { if (p.nh > 0) return p.nh; var f = q.phi; return f <= 28 ? 1400 : f >= 36 ? 12000 : f <= 32 ? 1400 + (f - 28) / 4 * 3600 : 5000 + (f - 32) / 4 * 7000; }   /* submerged, IS 2911 Table 3 */
  function ksp(z) {   /* line spring kN/m per m at depth z below the cut-off */
    var zz = p.zc + z, q = null; Lay.forEach(function (l) { if (zz >= l.z0 && zz < l.z1) q = l; }); if (!q) q = Lay[Lay.length - 1];
    if (!q) return 0; return q.type === "sand" ? nh(q) * Math.max(z, 0) : 0.2 * 360 * q.c;   /* clay: k1 = 180·qu = 360·c (Table 4), K·B = 0.3k1/1.5 */
  }
  for (var e = 0; e < ne; e++) {
    var k = [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]], c = EI / (h * h * h), id = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) K[id[a]][id[b]] += c * k[a][b];
  }
  for (i = 0; i < n; i++) { var z = i * h, w = (i === 0 || i === n - 1) ? h / 2 : h; K[2 * i][2 * i] += ksp(z) * w; }
  var F = new Float64Array(N); F[0] = H;
  if (fixed) { for (i = 0; i < N; i++) { K[1][i] = 0; K[i][1] = 0; } K[1][1] = 1; }
  /* Gauss elimination (banded small system) */
  var A = K.map(function (r) { return Float64Array.from(r); }), x = Float64Array.from(F);
  for (i = 0; i < N; i++) { var pv = A[i][i]; if (Math.abs(pv) < 1e-12) return { err: "Lateral analysis unstable — check the soil layers" }; for (var r = i + 1; r < Math.min(N, i + 5); r++) { var fct = A[r][i] / pv; if (!fct) continue; for (var cc = i; cc < Math.min(N, i + 5); cc++) A[r][cc] -= fct * A[i][cc]; x[r] -= fct * x[i]; } }
  for (i = N - 1; i >= 0; i--) { var s = x[i]; for (cc = i + 1; cc < Math.min(N, i + 5); cc++) s -= A[i][cc] * x[cc]; x[i] = s / A[i][i]; }
  var Mmax = 0, zM = 0, Mtop = 0, prof = [];
  for (e = 0; e < ne; e++) {
    var u1 = x[2 * e], t1 = x[2 * e + 1], u2 = x[2 * e + 2], t2 = x[2 * e + 3];
    var M1 = EI / (h * h) * (-6 * u1 - 4 * h * t1 + 6 * u2 - 2 * h * t2);   /* moment at the start node (sagging sign convention irrelevant: magnitudes used) */
    if (e === 0) Mtop = Math.abs(M1);
    if (Math.abs(M1) > Mmax) { Mmax = Math.abs(M1); zM = e * h; }
    prof.push([e * h, u1, M1]);
  }
  var lam = 0; Lay.forEach(function () { });
  return { y0: x[0], Mmax: Mmax, zM: zM, Mtop: Mtop, EI: EI, prof: prof, fixed: fixed };
};
/* -------------------------------------------------------- circular RC section, IS 456 strain compatibility */
FD.circCap = function (Dm, dc, nb, dia, fck, fy, Pu) {
  var R = Dm / 2, rb = R - dc - dia / 2, Ab = Math.PI * dia * dia / 4, ns = 80, dy = Dm / ns;
  function PM(xu) {
    var P = 0, M = 0;
    function eps(y) { return xu <= Dm ? 0.0035 * (xu - y) / xu : 0.002 * (xu - y) / (xu - 3 * Dm / 7); }
    for (var i = 0; i < ns; i++) { var y = (i + 0.5) * dy, b = 2 * Math.sqrt(Math.max(R * R - (R - y) * (R - y), 0)), f = RCC.fc(eps(y), fck) * b * dy; P += f; M += f * (R - y); }
    for (var k = 0; k < nb; k++) { var th = 2 * Math.PI * k / nb, y2 = R - rb * Math.cos(th), e = eps(y2), fs = RCC.fs(e, fy) - (e > 0 ? RCC.fc(e, fck) : 0), f2 = fs * Ab; P += f2; M += f2 * (R - y2); }
    return [P / 1000, M / 1e6];
  }
  var lo = 1e-3 * Dm, hi = 60 * Dm, Pl = PM(lo)[0], Ph = PM(hi)[0];
  if (Pu > Ph || Pu < Pl) return { ok: false, M: 0, Pmax: Ph, Pmin: Pl };
  for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2; if (PM(mid)[0] < Pu) lo = mid; else hi = mid; }
  return { ok: true, M: Math.abs(PM((lo + hi) / 2)[1]), Pmax: Ph, Pmin: Pl, xu: (lo + hi) / 2 };
};
/* -------------------------------------------------------- pile arrangements (coordinates in multiples of the spacing s) */
FD.layout = function (n, s) {
  var r3 = Math.sqrt(3), L = {
    1: [[0, 0]], 2: [[-0.5, 0], [0.5, 0]], 3: [[-0.5, -r3 / 6], [0.5, -r3 / 6], [0, r3 / 3]], 4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
    5: [[-Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, Math.SQRT1_2], [0, 0]],
    6: [[-1, -0.5], [0, -0.5], [1, -0.5], [-1, 0.5], [0, 0.5], [1, 0.5]], 8: [[-1.5, -0.5], [-0.5, -0.5], [0.5, -0.5], [1.5, -0.5], [-1.5, 0.5], [-0.5, 0.5], [0.5, 0.5], [1.5, 0.5]],
    9: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]], 12: [[-1.5, -1], [-0.5, -1], [0.5, -1], [1.5, -1], [-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0], [-1.5, 1], [-0.5, 1], [0.5, 1], [1.5, 1]]
  }[n];
  return L ? L.map(function (q) { return [q[0] * s, q[1] * s]; }) : null;
};
FD.NS = [1, 2, 3, 4, 5, 6, 8, 9, 12];
FD.r50 = function (v) { return Math.ceil(v / 50 - 1e-9) * 50; };
/* -------------------------------------------------------- pile group + cap for one column */
FD.group = function (p, col, cap, lat1) {
  var D = p.Dp, sF = p.sp > 0 ? p.sp : 3, s = sF * D, edge = p.edge > 0 ? p.edge : 150, a = p.cb, b = p.cd, lf = p.lf > 0 ? p.lf : 1.5, inc = 1 + (p.seis || 0) / 100, out = null;
  for (var k = 0; k < FD.NS.length && !out; k++) {
    var n = FD.NS[k]; if (n < (p.nmin || 1)) continue;
    var pl = FD.layout(n, s), xs = pl.map(function (q) { return q[0]; }), ys = pl.map(function (q) { return q[1]; });
    var Lx = FD.r50(Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs) + D + 2 * edge, a + 200)), Ly = FD.r50(Math.max(Math.max.apply(null, ys) - Math.min.apply(null, ys) + D + 2 * edge, b + 200));
    var T = FD.r50(Math.max(p.capT > 0 ? p.capT : 0, n === 1 ? Math.max(600, D + 100) : Math.max(600, 1.5 * D)));
    var g = { n: n, pl: pl, s: s, Lx: Lx, Ly: Ly };
    for (var tr = 0; tr < 40; tr++) { g.T = T; FD.capCheck(p, col, g, cap, lat1, lf, inc); if (g.okCap || p.capT > 0) break; T += 50; }
    if (g.okPile) out = g;
    if (!out && n === FD.NS[FD.NS.length - 1]) { g.fail = "Even 12 piles are not enough — use larger or longer piles"; out = g; }
  }
  return out;
};
/* loads on piles, then cap checks for thickness g.T */
FD.capCheck = function (p, col, g, cap, lat1, lf, inc) {
  var n = g.n, T = g.T, Wc = 25 * g.Lx * g.Ly * T / 1e9, sx = 0, sy = 0, D = p.Dp, fck = p.fck, fy = p.fy, a = p.cb, b = p.cd;
  g.pl.forEach(function (q) { sx += q[0] * q[0] / 1e6; sy += q[1] * q[1] / 1e6; });
  var Mx = col.Mx + col.Hy * T / 1000, My = col.My + col.Hx * T / 1000;   /* moments at the pile-head level */
  g.Wc = Wc; g.Mx = Mx; g.My = My;
  g.load = g.pl.map(function (q) { return (col.P + Wc) / n + (sx > 0 ? My * q[0] / 1000 / sx : 0) + (sy > 0 ? Mx * q[1] / 1000 / sy : 0); });
  g.Pmax = Math.max.apply(null, g.load); g.Pmin = Math.min.apply(null, g.load);
  g.H = Math.hypot(col.Hx, col.Hy) / n;
  var Qc = cap.Qsafe * inc, Qt = cap.Qup * inc;
  g.okPile = g.Pmax + (p.nsf || 0) <= Qc + 1e-9 && g.Pmin >= -Qt - 1e-9 && (n > 1 || Math.abs(Mx) + Math.abs(My) < 1e-9 || p.ties !== "no");
  g.okLat = true;
  /* factored pile reactions (cap self-weight excluded: it does not bend the cap) */
  var fr = g.pl.map(function (q) { return lf * (col.P / n + (sx > 0 ? My * q[0] / 1000 / sx : 0) + (sy > 0 ? Mx * q[1] / 1000 / sy : 0)); });
  g.fr = fr;
  var cb = 100, dia = 20, dx = T - cb - dia / 2, dy = dx - dia, dm = (dx + dy) / 2;   /* bottom bars sit on the pile heads (75 embedment + 25) */
  g.d = { x: dx, y: dy };
  var chk = [];
  if (n === 1) {
    g.okCap = T >= Math.max(600, D + 100); g.checks = [{ t: "Single-pile cap: depth ≥ D + 100 and anchorage of the pile bars", ok: g.okCap, v: T + " mm", cl: "IS 2911 cl 6.12" }];
    g.mx = { Mu: 0, req: 0 }; g.my = { Mu: 0, req: 0 }; g.vx = { V: 0, tv: 0, tc: 1 }; g.vy = { V: 0, tv: 0, tc: 1 }; g.pun = { tv: 0, k: 1 }; g.pp = { tv: 0, k: 1 };
    return g;
  }
  /* bending at the column faces */
  function bend(ax) {
    var half = (ax ? b : a) / 2, best = { Mu: 0, side: 1 };
    [1, -1].forEach(function (sg) { var M = 0; g.pl.forEach(function (q, i) { var c = sg * q[ax]; if (c > half) M += fr[i] * (c - half) / 1000; }); if (M > best.Mu) best = { Mu: M, side: sg }; });
    var B = ax ? g.Lx : g.Ly, d = ax ? dy : dx, req = RCC.astFlex(best.Mu, B, d, fck, fy), amin = 0.0012 * B * T;
    best.req = isNaN(req) ? Infinity : Math.max(req, amin); best.amin = amin; best.d = d; best.B = B; best.lim = RCC.mulim(B, d, fck, fy);
    return best;
  }
  g.mx = bend(0); g.my = bend(1);   /* mx: bars along X (moment about Y) */
  /* one-way shear at d from the column face, IS 456 cl 34.2.4.1(c) pile reactions; enhancement 2d/av (cl 40.5.1) */
  function shear(ax, M) {
    var half = (ax ? b : a) / 2, d = ax ? dy : dx, B = ax ? g.Lx : g.Ly, best = { V: 0, tv: 0, tc: 1, u: 0 };
    [1, -1].forEach(function (sg) {
      var sec = half + d, V = 0, av = Infinity;
      g.pl.forEach(function (q, i) { var c = sg * q[ax], r = c - sec; V += fr[i] * (r >= D / 2 ? 1 : r <= -D / 2 ? 0 : (r + D / 2) / D); if (c > half) av = Math.min(av, c - half - 0.3 * D); });
      var pt = 100 * M.req / (B * d), tc = RCC.tauc(fck, Math.min(pt, 3)), en = isFinite(av) && av > 0 && av < 2 * d ? Math.min(2 * d / av, RCC.taucmax(fck) / tc) : 1, tv = V * 1000 / (B * d);
      if (tv / (tc * en) > best.u) best = { V: V, tv: tv, tc: tc * en, tc0: tc, en: en, av: av, u: tv / (tc * en), pt: pt };
    });
    return best;
  }
  g.vx = shear(0, g.mx); g.vy = shear(1, g.my);
  /* punching around the column at d/2 */
  var b0 = 2 * (a + b + 2 * dm), inside = 0; g.pl.forEach(function (q, i) { if (Math.abs(q[0]) < a / 2 + dm / 2 && Math.abs(q[1]) < b / 2 + dm / 2) inside += fr[i]; });
  var Vp = lf * col.P - inside, kc = Math.min(1, 0.5 + Math.min(a, b) / Math.max(a, b)) * 0.25 * Math.sqrt(fck);
  g.pun = { V: Vp, b0: b0, tv: Vp * 1000 / (b0 * dm), k: kc };
  /* punching around the most loaded pile, perimeter clipped by the cap edges */
  var worst = null;
  g.pl.forEach(function (q, i) {
    var ex = g.Lx / 2 - Math.abs(q[0]), ey = g.Ly / 2 - Math.abs(q[1]), r = (D + dm) / 2, nx = ex < r, ny = ey < r, b1;
    if (nx && ny) b1 = 0.25 * Math.PI * (D + dm) + ex + ey; else if (nx || ny) b1 = 0.5 * Math.PI * (D + dm) + 2 * (nx ? ex : ey); else b1 = Math.PI * (D + dm);
    var tv = Math.max(fr[i], 0) * 1000 / (b1 * dm); if (!worst || tv > worst.tv) worst = { i: i, b0: b1, tv: tv, P: fr[i] };
  });
  g.pp = { tv: worst.tv, b0: worst.b0, P: worst.P, k: 0.25 * Math.sqrt(fck) };
  chk.push({ t: "Flexure at the column face, bars along X", ok: g.mx.Mu <= g.mx.lim, v: "Mu " + g.mx.Mu.toFixed(1) + " kNm ≤ Mu,lim " + g.mx.lim.toFixed(0), cl: "IS 456 cl 34.2.3", u: g.mx.Mu / g.mx.lim });
  chk.push({ t: "Flexure at the column face, bars along Y", ok: g.my.Mu <= g.my.lim, v: "Mu " + g.my.Mu.toFixed(1) + " kNm ≤ Mu,lim " + g.my.lim.toFixed(0), cl: "IS 456 cl 34.2.3", u: g.my.Mu / g.my.lim });
  chk.push({ t: "One-way shear at d from the column face (X)", ok: g.vx.u <= 1 + 1e-9, v: g.vx.tv.toFixed(3) + " ≤ " + g.vx.tc.toFixed(3) + " N/mm²" + (g.vx.en > 1 ? " (2d/av = " + g.vx.en.toFixed(2) + ")" : ""), cl: "IS 456 cl 34.2.4.1, 40.5.1", u: g.vx.u });
  chk.push({ t: "One-way shear at d from the column face (Y)", ok: g.vy.u <= 1 + 1e-9, v: g.vy.tv.toFixed(3) + " ≤ " + g.vy.tc.toFixed(3) + " N/mm²" + (g.vy.en > 1 ? " (2d/av = " + g.vy.en.toFixed(2) + ")" : ""), cl: "IS 456 cl 34.2.4.1, 40.5.1", u: g.vy.u });
  chk.push({ t: "Punching around the column at d/2", ok: g.pun.tv <= g.pun.k + 1e-9, v: g.pun.tv.toFixed(3) + " ≤ ks·0.25√fck " + g.pun.k.toFixed(3), cl: "IS 456 cl 31.6.3", u: g.pun.tv / g.pun.k });
  chk.push({ t: "Punching around the most loaded pile", ok: g.pp.tv <= g.pp.k + 1e-9, v: g.pp.tv.toFixed(3) + " ≤ 0.25√fck " + g.pp.k.toFixed(3), cl: "IS 456 cl 31.6.3", u: g.pp.tv / g.pp.k });
  g.checks = chk; g.okCap = chk.every(function (c) { return c.ok; });
  return g;
};
/* -------------------------------------------------------- bars of a pile and a cap */
FD.pileBars = function (p, Pu, Pt, Mu) {
  var D = p.Dp, cv = p.pcov > 0 ? p.pcov : 75, Ap = Math.PI * D * D / 4, amin = 0.004 * Ap, pick = null;
  [12, 16, 20, 25, 28, 32].forEach(function (dia) {
    if (pick) return;
    for (var nb = 6; nb <= 24; nb++) {
      var As = nb * Math.PI * dia * dia / 4, clr = 2 * Math.PI * (D / 2 - cv - 8 - dia / 2) / nb - dia;
      if (As < amin || clr < 80) continue;   /* clear spacing ≥ 4 × 20 mm aggregate (IS 2911 cl 6.11.3) */
      var c1 = FD.circCap(D, cv + 8, nb, dia, p.fck, p.fy, Pu), c2 = FD.circCap(D, cv + 8, nb, dia, p.fck, p.fy, Pt);
      if (c1.ok && c1.M >= Mu && c2.ok && c2.M >= Mu) { pick = { nb: nb, dia: dia, As: As, c1: c1, c2: c2, pct: 100 * As / Ap }; break; }
    }
  });
  return pick;
};
/* -------------------------------------------------------- main: pile foundation design */
FD.pile = function (p) {
  var r = new Rep("Pile Foundation — Bored Cast-in-situ Piles and Pile Caps", "IS 2911 (Pt 1/Sec 2):2010 · IS 456:2000 · IS 1893"), cols = FD.cols(p.cols), Lay = FD.soil(p.soil);
  if (!cols.length) { r.fail("Enter at least one column: mark, x, y, P, Mx, My, Hx, Hy"); return r; }
  p.ptype = p.ptype || "bored"; p.Dp = +p.Dp; p.Lp = +p.Lp; p.zc = +p.zc; p.cb = +p.cb; p.cd = +p.cd;
  /* single pile capacity */
  var cap = null, given = p.Qg > 0;
  if (Lay.length) cap = FD.capacity(p, Lay);
  if (!cap && !given) { r.fail("Enter the soil layers or a safe pile capacity from a load test"); return r; }
  var Qsafe = given ? +p.Qg : cap.Qsafe, Qup = p.Qupg > 0 ? +p.Qupg : cap ? cap.Qup : 0.3 * Qsafe;
  var CAP = { Qsafe: Qsafe, Qup: Qup };
  r.h("1. Single pile capacity" + (given ? " (load-test value governs)" : " — static formula, IS 2911 Annex B"));
  r.row("Pile", (p.ptype === "driven" ? "Driven cast-in-situ" : "Bored cast-in-situ") + ", Ø " + p.Dp + " mm, length " + p.Lp + " m below the cut-off at " + p.zc + " m depth");
  if (cap) {
    r.table(["Layer", "Depth (m)", "Soil", "Skin friction", "Q (kN)"], cap.rows.map(function (q) {
      return [String(Lay.indexOf(q.q) + 1), q.a.toFixed(2) + "–" + q.b.toFixed(2), q.kind === "clay" ? "Clay, c = " + q.q.c + " kPa" : "Sand, φ = " + q.q.phi + "°", q.kind === "clay" ? "α = " + q.al.toFixed(2) + " → fs = α·c = " + q.f.toFixed(1) + " kPa" : "K tanδ·PD = " + q.K + "×tan" + q.q.phi + "°×" + q.pd.toFixed(1) + " = " + q.f.toFixed(1) + " kPa", q.Q.toFixed(1)];
    }));
    if (cap.tip) r.eq(cap.tip.kind === "clay" ? "End bearing Qb = Ap·Nc·cp = " + cap.Ap.toFixed(4) + " × 9 × " + cap.tip.c + " = " + cap.Qb.toFixed(1) + " kN" : "End bearing Qb = Ap(½·D·γ·Nγ + PD·Nq) = " + cap.Ap.toFixed(4) + "(½·" + (p.Dp / 1000) + "·γ·" + cap.tip.Ng.toFixed(1) + " + " + cap.tip.PD.toFixed(1) + "×" + cap.tip.Nq.toFixed(1) + ") = " + cap.Qb.toFixed(1) + " kN  (PD at the critical depth " + cap.tip.zc.toFixed(2) + " m)", "IS 2911 B-1, B-2");
    r.eq("Qu = Qs + Qb = " + cap.Qs.toFixed(1) + " + " + cap.Qb.toFixed(1) + " = " + cap.Qu.toFixed(1) + " kN;  Qsafe = Qu / " + cap.FOS + " = " + cap.Qsafe.toFixed(1) + " kN", "IS 2911 B-5");
    r.eq("Uplift: (Qs + Wpile,buoyant) / 3 = (" + cap.Qs.toFixed(1) + " + " + cap.Wp.toFixed(1) + ") / 3 = " + cap.Qup.toFixed(1) + " kN", "IS 2911 cl 6.3");
  }
  if (given) r.row("Safe capacity entered (load test)", Qsafe.toFixed(0), "kN", "IS 2911 Pt 4");
  if (p.seis > 0) r.note("Seismic load combination: allowable pile load increased by " + p.seis + " % (IS 1893 Table 1 / IS 2911).");
  /* lateral: single pile, fixed head, unit-scaled later */
  var fixed = p.head !== "free", latU = Lay.length ? FD.lateral(p, Lay, 1, fixed) : null;
  /* groups */
  var res = cols.map(function (c) { var g = FD.group(p, c, CAP, latU); g.col = c; return g; }), lf = p.lf > 0 ? +p.lf : 1.5;
  /* lateral per group, pile bars */
  var Hmax = 0, Pumax = 0, Ptmin = 0, Mumax = 0, ylim = p.ylim > 0 ? +p.ylim : 5;
  res.forEach(function (g) {
    var H = g.H; Hmax = Math.max(Hmax, H);
    g.lat = latU && !latU.err ? { y: latU.y0 * H * 1000, M: latU.Mmax * H, Mtop: latU.Mtop * H, zM: latU.zM } : { y: 0, M: 0 };
    if (g.n === 1) g.lat.M += Math.hypot(g.Mx, g.My);   /* single pile also takes the column moment (tie beams for stability) */
    Pumax = Math.max(Pumax, lf * g.Pmax); Ptmin = Math.min(Ptmin, lf * g.Pmin); Mumax = Math.max(Mumax, lf * g.lat.M);
  });
  var pb = FD.pileBars(p, Pumax, Ptmin, Mumax);
  /* marks: identical designs share a mark */
  var marks = [];
  res.forEach(function (g) { g.key = [g.n, g.Lx, g.Ly, g.T].join("|"); var m0 = marks.filter(function (q) { return q.key === g.key; })[0]; if (!m0) { m0 = { key: g.key, id: "PC" + (marks.length + 1), list: [], rep: g }; marks.push(m0); } m0.list.push(g); g.mark = m0.id; if (g.Pmax > m0.rep.Pmax) m0.rep = g; });
  marks.forEach(function (M) { FD.capBars(p, M.rep); M.list.forEach(function (g) { g.bars = M.rep.bars; g.capBars = M.rep.capBars; }); });
  r.h("2. Pile groups and caps");
  r.table(["Column", "P (kN)", "Piles", "Cap mark", "Cap L×B×T (mm)", "Max pile (kN)", "Min pile (kN)", "Allowable (kN)"], res.map(function (g) { return [g.col.mark, g.col.P.toFixed(0), String(g.n), g.mark, g.Lx + "×" + g.Ly + "×" + g.T, g.Pmax.toFixed(1), g.Pmin.toFixed(1), (Qsafe * (1 + (p.seis || 0) / 100)).toFixed(0)]; }));
  r.eq("Pile load Pi = (P + Wcap)/n ± My·xi/Σx² ± Mx·yi/Σy², moments taken at the pile heads (column moment + H × cap depth)", "IS 2911 cl 6.7");
  res.forEach(function (g) {
    var inc = 1 + (p.seis || 0) / 100;
    r.check("Pile loads " + g.col.mark + " (" + g.n + " piles): max " + g.Pmax.toFixed(1) + (p.nsf ? " + NSF " + p.nsf : "") + " ≤ " + (Qsafe * inc).toFixed(0) + " kN" + (g.Pmin < 0 ? ", uplift " + (-g.Pmin).toFixed(1) + " ≤ " + (Qup * inc).toFixed(0) : ""), g.okPile, g.fail || "", "IS 2911 cl 6.3");
  });
  if (Lay.length && Lay.some(function (q) { return q.type === "clay"; })) {
    res.forEach(function (g) {
      if (g.n < 4 || !cap) return;
      var xs = g.pl.map(function (q) { return q[0]; }), ys = g.pl.map(function (q) { return q[1]; }), Bg = (Math.max.apply(null, xs) - Math.min.apply(null, xs) + p.Dp) / 1000, Lg = (Math.max.apply(null, ys) - Math.min.apply(null, ys) + p.Dp) / 1000, Qbk = 0;
      cap.rows.forEach(function (q) { Qbk += 2 * (Bg + Lg) * q.h * (q.kind === "clay" ? q.q.c : q.f); }); Qbk += Bg * Lg * (cap.tip && cap.tip.kind === "clay" ? 9 * cap.tip.c : cap.Qb / cap.Ap);
      g.block = Qbk / cap.FOS;
      r.check("Block failure " + g.col.mark + ": n × average load " + (g.n * (g.col.P + g.Wc) / g.n).toFixed(0) + " ≤ block capacity / FOS " + g.block.toFixed(0) + " kN", g.col.P + g.Wc <= g.block, "", "IS 2911 cl 6.7.3");
    });
  }
  r.h("3. Lateral load (" + (fixed ? "fixed head — group under a rigid cap / tie beams" : "free head") + ")");
  if (latU && !latU.err) {
    r.row("Pile stiffness EI", (latU.EI / 1000).toFixed(0), "MNm²"); r.note("Pile modelled as a beam on Winkler springs: sand ηh·z (IS 2911 Table 3, submerged" + (p.nh > 0 ? ", entered " + p.nh : "") + "), clay K·B = 0.3k1/1.5 with k1 = 180·qu (Table 4). Deflection limit " + ylim + " mm at the cut-off (IS 2911 Pt 4 criterion).");
    var gw = res.reduce(function (a0, g) { return !a0 || g.lat.y > a0.lat.y ? g : a0; }, null);
    r.row("Largest lateral load per pile", gw.H.toFixed(1), "kN"); r.row("Deflection at the cut-off", gw.lat.y.toFixed(2), "mm"); r.row("Maximum pile moment (service)", gw.lat.M.toFixed(1), "kNm", "at " + gw.lat.zM.toFixed(2) + " m below the cut-off");
    r.check("Lateral deflection ≤ " + ylim + " mm", gw.lat.y <= ylim + 1e-9, gw.lat.y.toFixed(2) + " mm", "IS 2911 Pt 4");
  } else r.note("No soil layers: lateral load not analysed — check lateral capacity from a lateral load test.");
  r.h("4. Pile reinforcement");
  if (pb) {
    r.row("Design loads (factored × " + lf + ")", "Pu " + Pumax.toFixed(0) + " kN, " + (Ptmin < 0 ? "Tu " + (-Ptmin).toFixed(0) + " kN, " : "") + "Mu " + Mumax.toFixed(1) + " kNm");
    r.row("Longitudinal bars", pb.nb + " – " + pb.dia + " mm (" + pb.pct.toFixed(2) + " % ≥ 0.4 %)", "", "IS 2911 cl 6.11.1");
    r.check("Section capacity at Pu: Mu,cap " + pb.c1.M.toFixed(1) + " ≥ " + Mumax.toFixed(1) + " kNm", pb.c1.M >= Mumax - 1e-9, "circular section, IS 456 cl 38–39 strain compatibility", "IS 456 cl 39");
    r.row("Links", "8 mm rings @ 150 c/c throughout; 10 mm @ 150 over the top " + Math.max(3 * p.Dp / 1000, p.zone >= 3 ? 3 : 0).toFixed(1) + " m; 16 mm stiffener rings @ 1.5 m", "", "IS 2911 cl 6.11.4");
    r.row("Cover to main bars", (p.pcov > 0 ? p.pcov : 75) + " mm (≥ 50)", "", "IS 2911 cl 6.11.4");
  } else r.fail("No bar arrangement (6–24 bars of 12–32 mm) carries the pile loads — increase the pile diameter");
  r.h("5. Pile caps");
  marks.forEach(function (M) {
    var g = M.rep; r.h("Cap " + M.id + " — " + g.n + " pile" + (g.n > 1 ? "s" : "") + ", " + g.Lx + " × " + g.Ly + " × " + g.T + " mm, columns " + M.list.map(function (q) { return q.col.mark; }).join(", "));
    if (g.n > 1) {
      r.eq("Bars along X: Mu = Σ Pu,i × (xi − a/2) = " + g.mx.Mu.toFixed(1) + " kNm, d = " + g.mx.d.toFixed(0) + " → Ast = " + (isFinite(g.mx.req) ? g.mx.req.toFixed(0) : "—") + " mm² (min 0.12 % " + g.mx.amin.toFixed(0) + ")", "IS 456 cl 34.2.3");
      r.eq("Bars along Y: Mu = " + g.my.Mu.toFixed(1) + " kNm, d = " + g.my.d.toFixed(0) + " → Ast = " + (isFinite(g.my.req) ? g.my.req.toFixed(0) : "—") + " mm²", "IS 456 cl 34.2.3");
    }
    g.checks.forEach(function (c) { r.check(c.t, c.ok, c.v, c.cl); });
    r.row("Reinforcement", g.capBars.txt);
    r.row("Pile bars into the cap", "Ld = " + DT.r(RCC.Ld(pb ? pb.dia : 16, p.fy, p.fck), 10) + " mm (bent if the cap is shallower), piles embedded 75 mm, 60 mm cover above the levelling course", "", "IS 2911 cl 6.12.6–6.12.7");
  });
  r.note("Bottom bars sit on the pile heads (75 mm embedment + 25 mm). Shear enhancement 2d/av uses av to 0.3 D inside the pile face (pile reaction centre, common pile-cap practice). Single-pile and two-pile caps need tie beams in both / the transverse direction (IS 2911 cl 6.5.2.1) — design them as beams.");
  /* bars, BOQ, drawings */
  var bbs = FD.bbs(p, res, marks, pb), boq = FD.boq(p, res, marks, pb, bbs);
  r.h("6. Bar bending schedule");
  r.table(["Member", "Mark", "Bar", "No.", "Cut length (m)", "Weight (kg)"], bbs.rows.map(function (q) { return [q.mem, q.mark, q.dia + " mm " + q.shape, String(q.n), (q.L / 1000).toFixed(2), q.kg.toFixed(1)]; }).concat([["Total", "", "", "", "", bbs.kg.toFixed(0)]]));
  r.h("7. Quantities and estimate (JKSOR 2022)");
  r.table(["Item", "Description", "Qty", "Unit", "Rate (₹)", "Amount (₹)"], boq.items.map(function (q, i) { return [String(i + 1), q.d + (q.sor ? " [" + q.sor + "]" : ""), q.q.toFixed(2), q.u, q.rate ? q.rate.toFixed(2) : "—", q.rate ? Math.round(q.q * q.rate).toLocaleString("en-IN") : "—"]; }).concat([["", "Sub-total (excl. GST)", "", "", "", Math.round(boq.sum).toLocaleString("en-IN")], ["", "GST 18 %", "", "", "", Math.round(boq.sum * 0.18).toLocaleString("en-IN")], ["", "Total", "", "", "", Math.round(boq.sum * 1.18).toLocaleString("en-IN")]]));
  var dws = FD.drawPile(p, res, marks, pb);
  r.svg = '<div class="dwgs">' + dws.map(function (d) { return '<div class="dwgt">' + d.title + '</div><div class="tw">' + DT.svg(d, { maxW: 680, maxH: 560 }) + '</div>'; }).join("") + '</div>';
  r.dxf = DT.dxf([{ title: "PILE FOUNDATION", dws: dws }]);
  r.dxfName = "pile-foundation.dxf";
  r.sum("Pile", "Ø" + p.Dp + " × " + p.Lp + " m"); r.sum("Safe capacity", Qsafe.toFixed(0) + " kN");
  r.sum("Piles", String(res.reduce(function (a0, g) { return a0 + g.n; }, 0))); r.sum("Caps", marks.length + " types"); r.sum("Steel", (bbs.kg / 1000).toFixed(2) + " t"); r.sum("Cost (incl. GST)", "₹ " + Math.round(boq.sum * 1.18).toLocaleString("en-IN"));
  r.fd = { res: res, marks: marks, pb: pb, cap: cap, CAP: CAP, bbs: bbs, boq: boq, lat: latU };
  return r;
};
/* cap reinforcement layout */
FD.capBars = function (p, g) {
  var cv = 60, bars = [], T = g.T, txt = [];
  function pick(As, B) { var o = null; [16, 20, 25].forEach(function (f) { if (o) return; var a1 = Math.PI * f * f / 4, n = Math.max(Math.ceil(As / a1 - 1e-9), Math.ceil((B - 2 * cv) / 300) + 1), s = (B - 2 * cv) / (n - 1); if (s >= 75) o = { dia: f, n: n, s: Math.floor(s / 5) * 5 }; }); return o || { dia: 25, n: Math.ceil(As / 491), s: 75 }; }
  var bx = g.n === 1 ? { dia: 16, n: Math.ceil((g.Ly - 2 * cv) / 150) + 1, s: 150 } : pick(g.mx.req, g.Ly), by = g.n === 1 ? { dia: 16, n: Math.ceil((g.Lx - 2 * cv) / 150) + 1, s: 150 } : pick(g.my.req, g.Lx);
  var leg = T - 100 - 60;
  bars.push({ mark: "a", desc: "Bottom bars along X, bent up at the ends", dia: bx.dia, n: bx.n, shape: "U", A: g.Lx - 2 * cv, B: leg, C: leg, n90: 2 });
  bars.push({ mark: "b", desc: "Bottom bars along Y, bent up at the ends", dia: by.dia, n: by.n, shape: "U", A: g.Ly - 2 * cv, B: leg - bx.dia, C: leg - bx.dia, n90: 2 });
  txt.push("Bottom a: " + bx.n + "–" + bx.dia + " mm @ " + bx.s + " along X; b: " + by.n + "–" + by.dia + " mm @ " + by.s + " along Y");
  var tn = Math.ceil((g.Ly - 2 * cv) / 200) + 1, tm = Math.ceil((g.Lx - 2 * cv) / 200) + 1;
  var td = g.Pmin < 0 ? 16 : 12;
  bars.push({ mark: "c", desc: "Top bars along X" + (g.Pmin < 0 ? " (pile uplift)" : " (nominal)"), dia: td, n: tn, shape: "S", A: g.Lx - 2 * cv, n90: 0 });
  bars.push({ mark: "d", desc: "Top bars along Y", dia: td, n: tm, shape: "S", A: g.Ly - 2 * cv, n90: 0 });
  txt.push("Top c/d: " + td + " mm @ 200 both ways");
  if (T > 750) { var ns = Math.max(1, Math.ceil((T - 200) / 300) - 1); bars.push({ mark: "e", desc: "Side-face bars, " + ns + " per face (IS 456 cl 26.5.1.3)", dia: 12, n: ns, shape: "S", A: 2 * (g.Lx + g.Ly) - 8 * cv, n90: 0 }); txt.push("Side e: " + ns + " – 12 mm all round"); }
  bars.forEach(function (q) { q.L = DT.cut(q); });
  g.capBars = { bars: bars, bx: bx, by: by, txt: txt.join("; ") };
};
/* bar bending schedule */
FD.bbs = function (p, res, marks, pb) {
  var rows = [], kg = 0, cv = p.pcov > 0 ? p.pcov : 75;
  function add(mem, q, nm) { var w = nm * q.n * q.L / 1000 * DT.wpm(q.dia); rows.push({ mem: mem, mark: q.mark, dia: q.dia, shape: q.shape, n: nm * q.n, L: q.L, kg: w, desc: q.desc }); kg += w; }
  var np = res.reduce(function (a0, g) { return a0 + g.n; }, 0);
  if (pb) {
    var Lcage = p.Lp * 1000 + DT.r(RCC.Ld(pb.dia, p.fy, p.fck), 10) - 75, laps = Math.max(0, Math.ceil(Lcage / 12000 - 1e-9) - 1), Lm = Lcage + laps * DT.lap(pb.dia, p.fy, p.fck);
    add("Piles (" + np + ")", { mark: "P1", desc: "Main bars, full length + anchorage into the cap", dia: pb.dia, n: pb.nb, shape: "S", L: Lm }, np);
    var Dl = p.Dp - 2 * cv, per = Math.PI * Dl + 2 * 10 * 8 + 2 * 75, top = Math.max(3 * p.Dp, (p.zone >= 3 ? 3000 : 0)), nTop = Math.ceil(top / 150), nBody = Math.ceil((p.Lp * 1000 - top) / 150) + 1;
    add("Piles (" + np + ")", { mark: "P2", desc: "Ring links 8 mm @ 150", dia: 8, n: nBody, shape: "R", L: per }, np);
    add("Piles (" + np + ")", { mark: "P3", desc: "Ring links 10 mm @ 150, top zone", dia: 10, n: nTop, shape: "R", L: Math.PI * Dl + 2 * 10 * 10 + 2 * 75 }, np);
    add("Piles (" + np + ")", { mark: "P4", desc: "Stiffener rings 16 mm @ 1.5 m (inside the main bars)", dia: 16, n: Math.ceil(p.Lp / 1.5), shape: "R", L: Math.PI * (Dl - 2 * pb.dia - 32) + 2 * 30 * 16 }, np);
  }
  marks.forEach(function (M) { M.rep.capBars.bars.forEach(function (q) { add("Cap " + M.id + " (" + M.list.length + ")", q, M.list.length); }); });
  return { rows: rows, kg: kg };
};
/* quantities priced with JKSOR 2022 */
FD.boq = function (p, res, marks, pb, bbs) {
  var it = [], np = res.reduce(function (a0, g) { return a0 + g.n; }, 0), g3 = p.fck <= 25 ? 0 : p.fck <= 30 ? 1 : 2, D = +p.Dp;
  var BR = { 450: ["21.2.1.1", [1941.90, 1957.55, 1973.30]], 500: ["21.2.1.2", [2275.50, 2294.80, 2314.25]], 600: ["21.2.1.3", [3095.25, 3123.10, 3151.10]], 750: ["21.2.1.4", [4693.95, 4737.40, 4781.10]], 1000: ["21.2.2.3", [10902.85, 10980.15, 11057.90]], 1200: ["21.2.2.4", [14325.90, 14437.25, 14549.15]], 1500: ["21.2.2.5", [20623.20, 20797.25, 20972.20]] };
  var DR = { 400: ["21.1.1", [2441.45, 2453.85, 2466.25]], 450: ["21.1.2", [2969.65, 2985.35, 3001.10]], 500: ["21.1.3", [3572.40, 3591.70, 3611.15]], 550: ["21.1.4", [3876.80, 3900.20, 3923.75]], 750: ["21.1.5", [6604.50, 6648.00, 6691.70]], 1000: ["21.1.6", [10947.35, 11024.65, 11102.40]], 1200: ["21.1.7", [14161.0, 14273.00, 14384.90]], 1500: ["21.1.8", [19994.35, 20168.35, 20343.35]] };
  var tab = p.ptype === "driven" ? DR : BR, key = Object.keys(tab).map(Number).sort(function (a, b) { return a - b; }).filter(function (k) { return k >= D; })[0], pr = key ? tab[key] : null;
  it.push({ d: (p.ptype === "driven" ? "Driven" : "Bored") + " cast-in-situ RCC piles Ø" + D + " mm, M" + p.fck + (key && key !== D ? " (rate of Ø" + key + ")" : "") + " — " + np + " × " + p.Lp + " m", q: np * p.Lp, u: "m", sor: pr ? pr[0] : "", rate: pr ? pr[1][g3] : 0 });
  var exc = 0, pcc = 0, conc = 0, fw = 0, bf = 0, zc = +p.zc;
  res.forEach(function (g) { var A = (g.Lx / 1000 + 0.6) * (g.Ly / 1000 + 0.6), dep = zc + 0.075; exc += A * dep; pcc += (g.Lx / 1000) * (g.Ly / 1000) * 0.075; var v = g.Lx * g.Ly * g.T / 1e9; conc += v; fw += 2 * (g.Lx + g.Ly) / 1000 * g.T / 1000; bf += Math.max(A * dep - v - (g.Lx / 1000) * (g.Ly / 1000) * 0.075, 0); });
  it.push({ d: "Excavation for pile caps (300 mm working space) up to the cut-off level", q: exc, u: "m³", sor: "2.6.1", rate: 592.90 });
  it.push({ d: "PCC 1:4:8 levelling course 75 mm under the caps", q: pcc, u: "m³", sor: "4.4.7", rate: 5202.90 });
  var fck = +p.fck, rc = fck <= 20 ? ["5.1.2", 7788.40] : fck >= 30 ? ["5.34.1 + 5.35." + (fck >= 40 ? 3 : fck >= 35 ? 2 : 1), 8021.10 + (fck >= 40 ? 269.35 : fck >= 35 ? 197.55 : 98.80)] : ["5.34.1", 8021.10];
  it.push({ d: "RCC M" + fck + " in pile caps", q: conc, u: "m³", sor: rc[0], rate: rc[1] });
  it.push({ d: "Centering & shuttering — sides of the pile caps", q: fw, u: "m²", sor: "5.9.1", rate: 286.35 });
  it.push({ d: "Reinforcement Fe " + p.fy + " — piles and caps (BBS + 3 % wastage)", q: bbs.kg * 1.03, u: "kg", sor: p.fy >= 500 ? "5.22.6" : "5.22.4", rate: 123.20 });
  it.push({ d: "Refilling around the caps", q: bf, u: "m³", sor: "2.11", rate: 218.40 });
  var Qt = (p.Qg > 0 ? +p.Qg : 0) || 0, big = Qt > 490;
  it.push({ d: "Initial vertical load test on a single pile (test load 2.5 × safe capacity) — provisional", q: 1, u: "no.", sor: big ? "21.6.2.1" : "21.6.1.1", rate: big ? 241337.20 : 159533.00 });
  var sum = 0; it.forEach(function (q) { sum += q.q * (q.rate || 0); });
  return { items: it, sum: sum };
};
/* -------------------------------------------------------- drawings */
FD.circle = function (dw, x, y, r, ly, n) { var pts = []; n = n || 40; for (var i = 0; i <= n; i++) { var t = 2 * Math.PI * i / n; pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]); } return dw.pl(pts, ly); };
FD.drawPile = function (p, res, marks, pb) {
  var DW = DT.DW, out = [], D = p.Dp, th = 160;
  /* 1. layout plan */
  var lp = new DW("Foundation layout plan — piles and pile caps"), xs = res.map(function (g) { return g.col.x; }), ys = res.map(function (g) { return g.col.y; }), x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
  var ux = []; xs.forEach(function (x) { if (ux.indexOf(x) < 0) ux.push(x); }); var uy = []; ys.forEach(function (y) { if (uy.indexOf(y) < 0) uy.push(y); });
  var X1 = (Math.max.apply(null, xs) - x0) * 1000, Y1 = (Math.max.apply(null, ys) - y0) * 1000;
  ux.forEach(function (x) { var X = (x - x0) * 1000; lp.l(X, -1500, X, Y1 + 1500, "G"); });
  uy.forEach(function (y) { var Y = (y - y0) * 1000; lp.l(-1500, Y, X1 + 1500, Y, "G"); });
  res.forEach(function (g) {
    var cx = (g.col.x - x0) * 1000, cy = (g.col.y - y0) * 1000;
    lp.r(cx - g.Lx / 2, cy - g.Ly / 2, g.Lx, g.Ly, "C").r(cx - p.cb / 2, cy - p.cd / 2, p.cb, p.cd, "C");
    g.pl.forEach(function (q) { FD.circle(lp, cx + q[0], cy + q[1], D / 2, "S"); });
    lp.tx(cx - g.Lx / 2, cy + g.Ly / 2 + 80, g.col.mark + " / " + g.mark, th, "l", "T");
  });
  for (var i = 1; i < ux.length; i++) { var a = (ux.slice().sort(function (u, v) { return u - v; })[i - 1] - x0) * 1000, b = (ux.slice().sort(function (u, v) { return u - v; })[i] - x0) * 1000; lp.dim(a, -1300, b, -1300, 0, String(Math.round(b - a)), th); }
  var uys = uy.slice().sort(function (u, v) { return u - v; }); for (i = 1; i < uys.length; i++) lp.dim(-1300, (uys[i - 1] - y0) * 1000, -1300, (uys[i] - y0) * 1000, 0, String(Math.round((uys[i] - uys[i - 1]) * 1000)), th);
  lp.tx(0, -2300, "Piles Ø" + D + " mm × " + p.Lp + " m below the cut-off (" + p.zc + " m below GL); cap marks as scheduled", th, "l", "T");
  out.push(lp);
  /* 2. each cap: plan + section */
  marks.forEach(function (M) {
    var g = M.rep, cb = g.capBars, pl = new DW("Cap " + M.id + " — plan (" + g.n + " piles, " + M.list.length + " no.)"), cv = 60, hx = g.Lx / 2, hy = g.Ly / 2, t2 = 110;
    pl.r(-hx, -hy, g.Lx, g.Ly, "C").r(-p.cb / 2, -p.cd / 2, p.cb, p.cd, "C");
    g.pl.forEach(function (q, k) { FD.circle(pl, q[0], q[1], D / 2, "S"); pl.tx(q[0], q[1] - 40, "P" + (k + 1), t2 * 0.8, "c", "T"); });
    var nShow = Math.min(cb.bx.n, 7); for (var k = 0; k < nShow; k++) { var yy = -hy + cv + (g.Ly - 2 * cv) * k / Math.max(nShow - 1, 1); pl.l(-hx + cv, yy, hx - cv, yy, "R"); }
    nShow = Math.min(cb.by.n, 7); for (k = 0; k < nShow; k++) { var xx = -hx + cv + (g.Lx - 2 * cv) * k / Math.max(nShow - 1, 1); pl.l(xx, -hy + cv, xx, hy - cv, "R"); }
    pl.tx(hx + 80, 0, "a " + cb.bx.n + "–" + cb.bx.dia + "φ @ " + cb.bx.s + " (X)", t2, "l", "R").tx(-hx, hy + 120, "b " + cb.by.n + "–" + cb.by.dia + "φ @ " + cb.by.s + " (Y)", t2, "l", "R");
    pl.dim(-hx, -hy - 150, hx, -hy - 150, 0, String(g.Lx), t2).dim(-hx - 150, -hy, -hx - 150, hy, 0, String(g.Ly), t2);
    if (g.n > 1) { var sx = g.pl.map(function (q) { return q[0]; }).filter(function (v, j, a2) { return a2.indexOf(v) === j; }).sort(function (u, v) { return u - v; }); if (sx.length > 1) pl.dim(sx[0], hy + 300, sx[1], hy + 300, 0, String(Math.round(sx[1] - sx[0])), t2); }
    out.push(pl);
    var se = new DW("Cap " + M.id + " — section A-A"), T = g.T, Lx = g.Lx, by0 = 100, tc = 60;
    se.r(-hx, 0, Lx, T, "C").pl([[-p.cb / 2, T], [-p.cb / 2, T + 700]], "C").pl([[p.cb / 2, T], [p.cb / 2, T + 700]], "C");
    se.l(-hx - 100, -75, hx + 100, -75, "C").tx(hx + 140, -110, "75 PCC levelling", t2 * 0.8, "l", "T");
    var pxs = g.pl.map(function (q) { return q[0]; }).filter(function (v, j, a2) { return a2.indexOf(v) === j; });
    pxs.forEach(function (x) { se.pl([[x - D / 2, 75], [x - D / 2, -1400]], "C").pl([[x + D / 2, 75], [x + D / 2, -1400]], "C").l(x - D / 2, 75, x + D / 2, 75, "C"); if (pb) { [-1, 1].forEach(function (sg) { var bx = x + sg * (D / 2 - 75 - pb.dia / 2); se.pl([[bx, -1400], [bx, T - tc - 40], [bx + sg * 150, T - tc - 40]], "R"); }); } });
    se.pl([[-hx + cv, T - tc], [-hx + cv, by0], [hx - cv, by0], [hx - cv, T - tc]], "R").l(-hx + cv, T - tc, hx - cv, T - tc, "R");
    [-1, 1].forEach(function (sg) { var x = sg * (p.cb / 2 - 50); se.pl([[x, T + 700], [x, by0 + cb.bx.dia + 20], [x + sg * 300, by0 + cb.bx.dia + 20]], "R"); });
    se.tx(hx + 80, by0, "a " + cb.bx.dia + "φ @ " + cb.bx.s, t2, "l", "R").tx(hx + 80, T - tc, (cb.bars[2] ? "c " + cb.bars[2].dia + "φ @ 200" : ""), t2, "l", "R").tx(-p.cb / 2 - 80, T + 500, "column starters, L-bent 300", t2 * 0.8, "r", "R");
    se.dim(hx + 300 + 400, 0, hx + 300 + 400, T, 0, "T " + T, t2).dim(-hx, -1550, hx, -1550, 0, String(Lx), t2);
    se.tx(-hx, -1800, "Piles embedded 75 mm; pile bars anchored into the cap; cover 60 mm (sides, top), bottom bars on the pile heads", t2 * 0.8, "l", "T");
    out.push(se);
  });
  /* 3. pile elevation (top 4 m, break, toe) and cross-section */
  if (pb) {
    var el = new DW("Pile — elevation (not to scale along the length)"), R = D / 2, cvp = p.pcov > 0 ? p.pcov : 75, top = Math.min(4000, p.Lp * 1000), toe = 1500, gap = 600, yT = 0, yB = -(top + gap + toe);
    el.pl([[-R, yT], [-R, -top]], "C").pl([[R, yT], [R, -top]], "C").pl([[-R, -top - gap], [-R, yB]], "C").pl([[R, -top - gap], [R, yB]], "C").l(-R, yB, R, yB, "C").l(-R, yT, R, yT, "C");
    el.pl([[-R - 80, -top + 60], [-R + 120, -top - 60], [R - 120, -top + 60], [R + 80, -top - 60]], "D").pl([[-R - 80, -top - gap + 60], [-R + 120, -top - gap - 60], [R - 120, -top - gap + 60], [R + 80, -top - gap - 60]], "D");
    var bx1 = -R + cvp + 8 + pb.dia / 2, bx2 = -bx1, Lanc = DT.r(RCC.Ld(pb.dia, p.fy, p.fck), 10);
    [bx1, bx2].forEach(function (x) { el.l(x, yT + Lanc - 75, x, -top, "R").l(x, -top - gap, x, yB + 75, "R"); });
    var tz = Math.max(3 * D, p.zone >= 3 ? 3000 : 0);
    for (var z = 150; z < top; z += 150) el.l(-R + cvp, -z, R - cvp, -z, z <= tz ? "R" : "S");
    for (z = top + gap + 150; z < top + gap + toe; z += 150) el.l(-R + cvp, -z, R - cvp, -z, "S");
    el.tx(R + 120, yT + Lanc / 2, "into cap Ld = " + Lanc, 120, "l", "R").tx(R + 120, -tz / 2, "10φ rings @ 150 (top " + (tz / 1000).toFixed(1) + " m)", 120, "l", "R").tx(R + 120, -top + 300, "8φ rings @ 150", 120, "l", "S").tx(R + 120, -top - gap - 300, pb.nb + "–" + pb.dia + "φ full length", 120, "l", "R").tx(R + 120, yB + 200, "16φ stiffener rings @ 1.5 m", 120, "l", "S");
    el.dim(-R - 300, yT, -R - 300, yB, 0, "L = " + p.Lp + " m", 120).tx(0, yT + 200 + Lanc, "cut-off level", 110, "c", "T");
    out.push(el);
    var cs = new DW("Pile — section"); FD.circle(cs, 0, 0, R, "C", 64); FD.circle(cs, 0, 0, R - cvp + 4, "S", 64);
    for (var k2 = 0; k2 < pb.nb; k2++) { var a2 = 2 * Math.PI * k2 / pb.nb, rr = R - cvp - 8 - pb.dia / 2; cs.c(rr * Math.cos(a2), rr * Math.sin(a2), pb.dia / 2, "R"); }
    cs.tx(0, -R - 200, pb.nb + "–" + pb.dia + "φ, cover " + cvp + ", Ø" + D, 110, "c", "T");
    out.push(cs);
  }
  return out;
};
/* -------------------------------------------------------- standalone raft: a synthetic base-reaction model for mat.js */
FD.raft = function (p) {
  var r = new Rep("Raft (Mat) Foundation — Plate on Soil Springs", "IS 2950 (Pt 1):1981 · IS 456:2000 · IS 1904"), cols = FD.cols(p.cols);
  if (cols.length < 2) { r.fail("Enter at least two columns: mark, x, y, P(DL), P(LL), Mx, My"); return r; }
  /* columns table for the raft: mark, x, y, P_DL, P_LL, Mx, My (service) */
  var rows = String(p.cols).split(/\n/).map(function (l) { return l.split(/[,;\t]+/).map(function (s) { return s.trim(); }); }).filter(function (a) { return a.length >= 4 && isFinite(parseFloat(a[1])) && isFinite(parseFloat(a[3])); });
  var m = { nodes: [], frames: [], shells: [], sup: {}, twoD: false }, caseReac = { DL: {}, LL: {} };
  rows.forEach(function (a, i) {
    var x = +a[1], y = +a[2], dl = +a[3] || 0, ll = +a[4] || 0, mx = +a[5] || 0, my = +a[6] || 0, nb = m.nodes.length;
    m.nodes.push({ x: x, y: y, z: 0 }, { x: x, y: y, z: 3 }); m.sup[nb] = [1, 1, 1, 1, 1, 1];
    m.frames.push({ n1: nb, n2: nb + 1, type: "column", L: 3, sec: { kind: "rcc", b: +p.cb, D: +p.cd }, name: a[0] });
    caseReac.DL[nb] = [0, 0, dl, mx * dl / Math.max(dl + ll, 1e-9), my * dl / Math.max(dl + ll, 1e-9), 0]; caseReac.LL[nb] = [0, 0, ll, mx * ll / Math.max(dl + ll, 1e-9), my * ll / Math.max(dl + ll, 1e-9), 0];
  });
  var lf = p.lf > 0 ? +p.lf : 1.5, S = { res: { caseReac: caseReac, cases: { DL: {}, LL: {} } }, cb: [{ name: lf + "(DL+LL)", f: { DL: lf, LL: lf } }] };
  var pp = { fck: +p.fck, fy: +p.fy, soil: "II", sbc: +p.sbc, Df: +p.Df, matT: +p.matT, matOff: +p.matOff, ks: +p.ks, gs: 18, setLim: +p.setLim, angLim: 500, matMesh: +p.matMesh, exposure: "moderate", fire: "1" };
  var cf = DT.cfg(pp), g = DT.grid(m), mt;
  try { mt = MAT.run(m, S, pp, cf, g, []); } catch (e) { r.fail("Raft analysis failed: " + e.message); return r; }
  if (mt.err) { r.fail(mt.err); return r; }
  r.sum("Raft", mt.L.toFixed(2) + " × " + mt.B.toFixed(2) + " m"); r.sum("Thickness", mt.T + " mm"); r.sum("Max net pressure", mt.gov.qmax.toFixed(1) + " kN/m²"); r.sum("Settlement", mt.wmax.toFixed(1) + " mm"); r.sum("Steel", (mt.wt / 1000).toFixed(2) + " t");
  r.h("1. Model");
  r.note("Flexible plate (" + mt.el.length + " thick-plate elements, " + mt.h.toFixed(2) + " m) on compression-only Winkler springs, ks = " + mt.ks.toFixed(0) + " kN/m³" + (p.ks > 0 ? " (entered)" : " (120 × SBC — replace with the soil report value)") + "; projection " + mt.off + " m beyond the outer column faces; net pressures; factored design for " + lf + "(DL+LL). Rigidity: 1.75/λ = " + mt.rigidity.lim.toFixed(2) + " m vs spacing " + mt.rigidity.sp.toFixed(2) + " m (" + (mt.rigidity.rigid ? "rigid" : "flexible") + ").");
  r.h("2. Checks"); mt.checks.forEach(function (c) { r.check(c.t, c.ok, c.v, c.cl); });
  r.h("3. Soil pressure — plate vs rigid method"); r.table(["Set", "FE max", "Rigid max", "Rigid min", "Allowable"], mt.svc.map(function (q) { return [q.name, q.qmax.toFixed(1), q.rig.max.toFixed(1), q.rig.min.toFixed(1), q.lim.toFixed(0)]; }));
  r.h("4. Punching at the columns"); r.table(["Column", "Type", "Vu kN", "b0 mm", "d mm", "τv", "ks·0.25√fck"], mt.pun.map(function (q) { return [q.name, q.type, q.Vu.toFixed(0), q.b0.toFixed(0), q.d.toFixed(0), q.tv.toFixed(3), q.kc.toFixed(3)]; }));
  var M0 = mt.mesh; r.h("5. Reinforcement");
  r.table(["Layer", "Base mesh", "As mm²/m", "d mm"], [["Bottom X", M0.bx.dia + "φ@" + M0.bx.s, M0.bx.As.toFixed(0), mt.d.bx.toFixed(0)], ["Bottom Y", M0.by.dia + "φ@" + M0.by.s, M0.by.As.toFixed(0), mt.d.by.toFixed(0)], ["Top X", M0.tx.dia + "φ@" + M0.tx.s, M0.tx.As.toFixed(0), mt.d.tx.toFixed(0)], ["Top Y", M0.ty.dia + "φ@" + M0.ty.s, M0.ty.As.toFixed(0), mt.d.ty.toFixed(0)]]);
  if (mt.zones.length) r.table(["Mark", "Face / dir", "x (m)", "y (m)", "Extra bars"], mt.zones.map(function (z) { return [z.mark, z.face + " " + z.dir, z.x0.toFixed(2) + "–" + z.x1.toFixed(2), z.y0.toFixed(2) + "–" + z.y1.toFixed(2), z.dia + "φ@" + z.s]; }));
  r.h("6. Bar bending schedule"); var kg = 0;
  r.table(["Mark", "Description", "Bar", "No.", "Cut length (m)", "Weight (kg)"], mt.bars.map(function (q) { var w = q.n * q.L / 1000 * DT.wpm(q.dia); kg += w; return [q.mark, q.desc, q.dia + " mm", String(q.n), (q.L / 1000).toFixed(2), w.toFixed(1)]; }).concat([["", "Total", "", "", "", kg.toFixed(0)]]));
  var Dfm = +p.Df || 1.5, Tm = mt.T / 1000, it = [
    { d: "Excavation for the raft (300 mm working space), first 1.5 m", q: (mt.L + 0.6) * (mt.B + 0.6) * Math.min(Dfm + 0.1, 1.5), u: "m³", sor: "2.6.1", rate: 592.90 },
    { d: "PCC 1:4:8, 100 mm under the raft", q: (mt.L + 0.2) * (mt.B + 0.2) * 0.1, u: "m³", sor: "4.4.7", rate: 5202.90 },
    { d: "RCC M" + p.fck + " in the raft", q: mt.L * mt.B * Tm, u: "m³", sor: +p.fck <= 20 ? "5.1.2" : "5.34.1", rate: +p.fck <= 20 ? 7788.40 : 8021.10 },
    { d: "Formwork — raft edges", q: 2 * (mt.L + mt.B) * Tm, u: "m²", sor: "5.9.1", rate: 286.35 },
    { d: "Reinforcement Fe " + p.fy + " (BBS + 3 %)", q: kg * 1.03, u: "kg", sor: "5.22.6", rate: 123.20 }];
  if (Dfm + 0.1 > 1.5) it.splice(1, 0, { d: "Extra lift below 1.5 m", q: (mt.L + 0.6) * (mt.B + 0.6) * (Dfm + 0.1 - 1.5), u: "m³", sor: "2.10.1", rate: 89.75 });
  var sum = 0; it.forEach(function (q) { sum += q.q * q.rate; });
  r.h("7. Quantities and estimate (JKSOR 2022)"); r.table(["Item", "Description", "Qty", "Unit", "Rate (₹)", "Amount (₹)"], it.map(function (q, i) { return [String(i + 1), q.d + " [" + q.sor + "]", q.q.toFixed(2), q.u, q.rate.toFixed(2), Math.round(q.q * q.rate).toLocaleString("en-IN")]; }).concat([["", "Total incl. GST 18 %", "", "", "", Math.round(sum * 1.18).toLocaleString("en-IN")]]));
  var dws = MAT.draw(mt, cf);
  r.svg = '<div class="dwgs"><div class="dwgt">Net soil pressure under DL+LL (kN/m²)</div><div class="tw">' + MAT.heat(mt, function (q) { return q.qG; }, "kN/m²", 520) + '</div>' + dws.map(function (d) { return '<div class="dwgt">' + d.title + '</div><div class="tw">' + DT.svg(d, { maxW: 680, maxH: 560 }) + '</div>'; }).join("") + '</div>';
  r.dxf = DT.dxf([{ title: "RAFT FOUNDATION", dws: dws }]); r.dxfName = "raft-foundation.dxf";
  r.mat = mt; r.est = { items: it, sum: sum };
  return r;
};
if (typeof module !== "undefined") module.exports = FD;
