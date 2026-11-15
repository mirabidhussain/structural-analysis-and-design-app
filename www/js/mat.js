/* Mat (raft) foundation — IS 2950 (Part 1):1981 flexible-plate method, IS 456 design.
   The mat is a thick (Mindlin) plate of shell elements on compression-only Winkler springs (modulus of subgrade reaction ks),
   loaded by the column and wall base reactions of the building analysis. Springs that lift off are switched off and the plate
   re-solved until contact is consistent. Soil pressures are net: the backfill over the mat balances the excavated soil, so the
   mat adds (25 − γsoil)·t; factored design uses the full 25·t (it causes no bending while the whole mat is in contact). Checks: soil pressure (service), uplift, settlement and angular distortion (IS 1904),
   punching at every column at d/2 (IS 456 cl 31.6), one-way shear, flexure from Wood–Armer moments (base mesh top and bottom +
   extra bars where needed), sliding and overturning (IS 456 cl 20). The conventional rigid method (pressure P/A ± M/I) is
   reported alongside as an independent check. Units: kN, m inside; mm on drawings. */
var MAT = {};
MAT.ks = function (p) { return p.ks > 0 ? +p.ks : 120 * (p.sbc > 0 ? +p.sbc : 200); };   /* Bowles: ks ≈ 40·FS·qa with FS = 3 */
MAT.DIAS = [12, 16, 20, 25, 32];
/* is a mat advisable? isolated footings overlap or cover more than half of the plan */
MAT.need = function (iso, g) {
  if (!iso || !iso.length) return { need: false, why: "" };
  var ov = iso.some(function (f) { return f.warn && f.warn.length; }), A = 0, xs = g.xs, ys = g.ys;
  iso.forEach(function (f) { A += f.Lx * f.Ly / 1e6; });
  var plan = xs.length > 1 && ys.length > 1 ? (xs[xs.length - 1] - xs[0] + 1) * (ys[ys.length - 1] - ys[0] + 1) : 0, r = plan > 0 ? A / plan : 0;
  return { need: ov || r > 0.5, ratio: r, overlap: ov, why: ov ? "isolated footings overlap" : r > 0.5 ? "isolated footings would cover " + Math.round(r * 100) + " % of the plan" : "" };
};
/* -------------------------------------------------------------------------------------------------- plate on springs */
MAT.model = function (geo, T, E, ks) {
  var xs = geo.xs, ys = geo.ys, nx = xs.length, ny = ys.length, mm = { nodes: [], frames: [], shells: [], sup: {}, twoD: false }, kn = [], tr = [];
  for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
    var ax = ((i > 0 ? xs[i] - xs[i - 1] : 0) + (i < nx - 1 ? xs[i + 1] - xs[i] : 0)) / 2, ay = ((j > 0 ? ys[j] - ys[j - 1] : 0) + (j < ny - 1 ? ys[j + 1] - ys[j] : 0)) / 2;
    mm.sup[mm.nodes.length] = [1, 1, 0, 0, 0, 1];
    mm.nodes.push({ x: xs[i], y: ys[j], z: 0 }); tr.push(ax * ay); kn.push(ks * ax * ay);
  }
  for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) { var a = j * nx + i; mm.shells.push({ n: [a, a + 1, a + nx + 1, a + nx], t: T, kind: "mat", mat: { E: E, nu: 0.2, gamma: 25 }, i: i, j: j }); }
  FE.prepare(mm); var asm = FE.assemble(mm, null);
  return { m: mm, K0: asm.A, kn: kn, tr: tr, nx: nx, ny: ny, T: T, ks: ks };
};
/* solve one load vector (Ffull, 6 per node) with compression-only springs (linear = keep tension springs, for checks) */
MAT.solve = function (pm, Ffull, base, linear) {
  var m = pm.m, n = m.nodes.length, act = new Uint8Array(n).fill(1), it = 0, U, A, F = new Float64Array(m._neq);
  for (var i = 0; i < 6 * n; i++) if (m._eq[i] >= 0) F[m._eq[i]] += Ffull[i];
  for (it = 0; it < 30; it++) {
    var key = act.join("");
    if (base && base.key === key) A = base.A;
    else {
      A = Float64Array.from(pm.K0);
      for (var v = 0; v < n; v++) if (act[v]) A[m._maxa[m._eq[6 * v + 2]]] += pm.kn[v];
      if (FE.factor(A, m._maxa, m._neq) >= 0) return { err: "the mat loses contact with the soil (overturning) — increase the plan size or the load is unstable" };
      if (base && !base.key) { base.key = key; base.A = A; }
    }
    U = FE.expand(m, FE.backsub(A, m._maxa, m._neq, Float64Array.from(F)));
    var ch = 0;
    for (v = 0; v < n && !linear; v++) { var w = U[6 * v + 2]; if (act[v] && w > 1e-12) { act[v] = 0; ch++; } else if (!act[v] && w < -1e-12) { act[v] = 1; ch++; } }
    if (!ch || linear) break;
  }
  var q = new Float64Array(n), R = new Float64Array(n), lift = 0;
  for (v = 0; v < n; v++) { var w2 = U[6 * v + 2]; if (act[v]) { q[v] = -pm.ks * w2; R[v] = -pm.kn[v] * w2; } else lift += pm.tr[v]; }
  return { U: U, q: q, R: R, act: act, it: it + 1, lift: lift };
};
/* -------------------------------------------------------------------------------------------------- driver */
MAT.run = function (m, S, p, cf, g, iso) {
  if (m.twoD) return { err: "A mat foundation needs a 3D model (a 2D frame has no plan)." };
  var cr = S.res && S.res.caseReac || {}; if (!cr.DL) return { err: "Case reactions are not available." };
  var fck = +p.fck, fy = +p.fy, q0 = cf.sbc, incr = { I: 1.5, II: 1.25, III: 1.0 }[String(p.soil)] || 1.25, ks = MAT.ks(p), Ec = 5000 * Math.sqrt(fck) * 1000;
  var off = p.matOff >= 0 && p.matOff !== "" ? +p.matOff : 0.5, cov = cf.cf, red = {}, gs = p.gs > 0 ? +p.gs : 18;
  (iso || []).forEach(function (f) { red[f.n] = f.red || 0; });
  /* supports: columns (punching) and wall bases (loads only) */
  var sups = Object.keys(m.sup).map(Number).map(function (n) {
    var c = DT.colAt(m, n), nd = m.nodes[n], a = 0, b = 0;
    if (c) { a = (c.sec.D || c.sec.b || 300) / 1000; b = (c.sec.b || c.sec.D || 300) / 1000; if (c.sec.kind !== "rcc") { a = Math.max(a, 0.3); b = Math.max(b, 0.3); } }
    return { n: n, x: nd.x, y: nd.y, a: a, b: b, col: !!c, rcc: !!(c && c.sec.kind === "rcc"), name: c ? "C-" + g.gy(nd.y) + g.gx(nd.x) : "wall node " + n, red: red[n] || 0 };
  });
  if (sups.length < 2) return { err: "A mat needs at least two supports." };
  var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  sups.forEach(function (s) { x0 = Math.min(x0, s.x - s.a / 2); x1 = Math.max(x1, s.x + s.a / 2); y0 = Math.min(y0, s.y - s.b / 2); y1 = Math.max(y1, s.y + s.b / 2); });
  x0 -= off; x1 += off; y0 -= off; y1 += off;
  var L = x1 - x0, B = y1 - y0, Am = L * B;
  /* mesh lines through every support, subdivided to ≤ h */
  function lines(lo, hi, pts, h) {
    var a = [lo, hi]; pts.forEach(function (v) { if (!a.some(function (q) { return Math.abs(q - v) < 0.005; })) a.push(v); });
    a.sort(function (u, v) { return u - v; }); var o = [a[0]];
    for (var i = 1; i < a.length; i++) { var k = Math.max(1, Math.ceil((a[i] - a[i - 1]) / h - 1e-9)); for (var j = 1; j <= k; j++) o.push(a[i - 1] + (a[i] - a[i - 1]) * j / k); }
    return o;
  }
  var h = p.matMesh > 0 ? +p.matMesh : 0.5, mx, my;
  for (var tries = 0; tries < 8; tries++) { mx = lines(x0, x1, sups.map(function (s) { return s.x; }), h); my = lines(y0, y1, sups.map(function (s) { return s.y; }), h); if (mx.length * my.length <= 2500) break; h *= 1.25; }
  function nodeAt(x, y) { var i = 0, j = 0, bi = 1e9, bj = 1e9; mx.forEach(function (v, k) { if (Math.abs(v - x) < bi) { bi = Math.abs(v - x); i = k; } }); my.forEach(function (v, k) { if (Math.abs(v - y) < bj) { bj = Math.abs(v - y); j = k; } }); return j * mx.length + i; }
  sups.forEach(function (s) { s.node = nodeAt(s.x, s.y); });
  function R(cn, n) { return cr[cn] && cr[cn][n] ? cr[cn][n] : [0, 0, 0, 0, 0, 0]; }
  /* load sets: support reactions per node (6) and a self-weight factor */
  var lat = MD.lateralSets(S.res.cases).filter(function (Ls) { return /^EQ/.test(Ls.name); }), svc = [], fac = [];
  function comb(f, extra) { var o = {}; sups.forEach(function (s) { var r = [0, 0, 0, 0, 0, 0], t; Object.keys(f).forEach(function (cn) { var rr = R(cn, s.n); for (var t = 0; t < 6; t++) r[t] += f[cn] * rr[t]; }); if (extra) { var e = extra(s); for (t = 0; t < 6; t++) r[t] += e[t]; } o[s.n] = r; }); return o; }
  function llRed(fLL) { return function (s) { var l = R("LL", s.n); return l.map(function (v) { return -s.red * fLL * v; }); }; }
  var G = comb({ DL: 1, LL: 1 }, llRed(1));
  svc.push({ name: "DL+LL", r: G, sw: 1, lim: q0, grav: true, svc: true });
  lat.forEach(function (Ls) { [1, -1].forEach(function (sg) { var ff = { DL: 1, LL: 1 }; Object.keys(Ls.f).forEach(function (cn) { ff[cn] = (ff[cn] || 0) + sg * Ls.f[cn]; }); svc.push({ name: "DL+LL" + (sg > 0 ? "+" : "−") + Ls.name, r: comb(ff, llRed(1)), sw: 1, lim: q0 * incr, E: { f: Ls.f, sg: sg }, svc: true }); }); });
  /* response spectrum reactions are envelopes (no sign): signed here by the static EQ case of the same direction */
  function rsSigned(d, k) { var E = S.se && S.se.env && S.se.env[d], st = "EQ" + (d ? "Y" : "X"); return function (s) { if (!E || !E.reac[s.n]) return [0, 0, 0, 0, 0, 0]; var rs = R(st, s.n); return E.reac[s.n].map(function (v, t) { return k * Math.abs(v) * (rs[t] < 0 ? -1 : 1); }); }; }
  if (S.se && S.se.env) Object.keys(S.se.env).forEach(function (d) { [1, -1].forEach(function (sg) { var f1 = rsSigned(+d, sg), f2 = llRed(1); svc.push({ name: "DL+LL" + (sg > 0 ? "+" : "−") + "RS" + (+d ? "Y" : "X"), r: comb({ DL: 1, LL: 1 }, function (s) { var a = f1(s), b = f2(s); return a.map(function (v, t) { return v + b[t]; }); }), sw: 1, lim: q0 * incr, svc: true }); }); });
  if (!cf.wsm) (S.cb || []).forEach(function (cb) {
    var fL = (cb.f && cb.f.LL) || 0, ex = llRed(fL), rsf = cb.rs ? rsSigned(cb.rs.dir, cb.rs.sign * cb.rs.fac) : null;
    fac.push({ name: cb.name, r: comb(cb.f || {}, function (s) { var a = ex(s); if (rsf) { var b = rsf(s); a = a.map(function (v, t) { return v + b[t]; }); } return a; }), sw: (cb.f && cb.f.DL) || 0 });
  });
  else svc.forEach(function (st) { var k = st.grav ? 1.5 : 1.2, r = {}; Object.keys(st.r).forEach(function (n) { r[n] = st.r[n].map(function (v) { return k * v; }); }); fac.push({ name: k + "(" + st.name + ")", r: r, sw: k }); });
  /* totals for the rigid method and the first thickness */
  function tot(set) { var N = 0, Sx = 0, Sy = 0, M3 = 0, M4 = 0, H = [0, 0]; sups.forEach(function (s) { var r = set.r[s.n]; N += r[2]; Sx += r[2] * s.x; Sy += r[2] * s.y; M3 += r[3]; M4 += r[4]; H[0] += r[0]; H[1] += r[1]; }); return { N: N, Sx: Sx, Sy: Sy, M3: M3, M4: M4, H: H }; }
  var Pu = {}; fac.forEach(function (st) { sups.forEach(function (s) { Pu[s.n] = Math.max(Pu[s.n] || 0, st.r[s.n][2]); }); });
  var quAvg = 0; fac.forEach(function (st) { quAvg = Math.max(quAvg, tot(st).N / Am); });
  /* punching perimeter at d/2 clipped by the mat edges (IS 456 cl 31.6.1) */
  function perim(s, d) {
    var xa = s.x - s.a / 2 - d / 2, xb = s.x + s.a / 2 + d / 2, ya = s.y - s.b / 2 - d / 2, yb = s.y + s.b / 2 + d / 2, open = [];
    var cxa = Math.max(xa, x0), cxb = Math.min(xb, x1), cya = Math.max(ya, y0), cyb = Math.min(yb, y1), b0 = 0;
    if (xa > x0 + 1e-6) b0 += cyb - cya; else open.push("W"); if (xb < x1 - 1e-6) b0 += cyb - cya; else open.push("E");
    if (ya > y0 + 1e-6) b0 += cxb - cxa; else open.push("S"); if (yb < y1 - 1e-6) b0 += cxb - cxa; else open.push("N");
    return { b0: b0, A: (cxb - cxa) * (cyb - cya), box: [cxa, cxb, cya, cyb], open: open, type: open.length === 0 ? "interior" : open.length === 1 ? "edge" : "corner" };
  }
  function kpun(s) { var bc = Math.min(s.a, s.b) / Math.max(s.a, s.b); return Math.min(1, 0.5 + bc) * 0.25 * Math.sqrt(fck); }
  var dia0 = 16, T = p.matT > 0 ? DT.r(+p.matT, 25) / 1000 : 0.3, fixedT = p.matT > 0;
  if (!fixedT) for (var g0 = 0; g0 < 80; g0++) {   /* first estimate: uniform reaction under every column */
    var d0 = T - cov / 1000 - dia0 / 1000, okT = sups.every(function (s) { if (!s.col) return true; var pr = perim(s, d0), Vu = Pu[s.n] - quAvg * pr.A; return Vu * 1000 / (pr.b0 * 1000 * d0 * 1000) <= kpun(s); });
    if (okT) break; T = Math.round((T + 0.05) * 1000) / 1000;
  }
  var res, pass = 0;
  for (pass = 0; pass < 12; pass++) {
    res = analyseT(T);
    if (res.err) return { err: res.err };
    if (res.ok || fixedT) break;
    T = Math.round((T + 0.05) * 1000) / 1000;
  }
  res.passes = pass + 1; res.fixedT = fixedT;
  if (!res.ok && !fixedT) res.msg.push("Thickness limit of the automatic search reached — check the failing items");
  return res;

  /* ---------------------------------------------------------------- one thickness: analyse, design, check */
  function analyseT(T) {
    var pm = MAT.model({ xs: mx, ys: my }, T, Ec, ks), mm = pm.m, n = mm.nodes.length, base = {};
    function vec(set) {
      var F = new Float64Array(6 * n);
      sups.forEach(function (s) { var r = set.r[s.n]; F[6 * s.node + 2] -= r[2]; F[6 * s.node + 3] -= r[3]; F[6 * s.node + 4] -= r[4]; });
      if (set.sw) for (var v = 0; v < n; v++) F[6 * v + 2] -= set.sw * (set.svc ? 25 - gs : 25) * T * pm.tr[v];
      return F;
    }
    var out = { T: Math.round(T * 1000), ks: ks, x0: x0, x1: x1, y0: y0, y1: y1, L: L, B: B, off: off, mx: mx, my: my, h: h, sups: sups, q: q0, incr: incr, Ec: Ec, svc: [], fac: [], el: [], checks: [], msg: [], name: "MAT", fck: fck, fy: fy };
    /* service: soil pressure, uplift, settlement */
    var Wm = (25 - gs) * T * Am, gov = null, wG = null;
    for (var i = 0; i < svc.length; i++) {
      var st = svc[i], r = MAT.solve(pm, vec(st), base); if (r.err) return { err: r.err + " (" + st.name + ")" };
      var qmax = 0, qmin = Infinity; for (var v = 0; v < n; v++) { if (r.q[v] > qmax) qmax = r.q[v]; if (r.act[v] && r.q[v] < qmin) qmin = r.q[v]; }
      var t0 = tot(st), N = t0.N + st.sw * Wm, xc = (x0 + x1) / 2, yc = (y0 + y1) / 2;
      var bq = (t0.Sx - xc * t0.N - t0.M4) / (B * L * L * L / 12), cq = (t0.Sy - yc * t0.N + t0.M3) / (L * B * B * B / 12);
      var rig = { N: N, Mx: cq * L * B * B * B / 12, My: bq * B * L * L * L / 12, max: N / Am + Math.abs(bq) * L / 2 + Math.abs(cq) * B / 2, min: N / Am - Math.abs(bq) * L / 2 - Math.abs(cq) * B / 2 };
      var row = { name: st.name, lim: st.lim, qmax: qmax, qmin: qmin, lift: r.lift / Am, it: r.it, rig: rig, u: qmax / st.lim, H: t0.H, E: st.E };
      out.svc.push(row); if (!gov || row.u > gov.u) gov = row;
      if (i === 0) { wG = r; out.wmax = 0; for (v = 0; v < n; v++) out.wmax = Math.max(out.wmax, -r.U[6 * v + 2] * 1000); out.wmin = Infinity; for (v = 0; v < n; v++) out.wmin = Math.min(out.wmin, -r.U[6 * v + 2] * 1000); out.qG = r.q; }
    }
    out.gov = gov;
    /* angular distortion between neighbouring columns on a grid line (DL+LL) */
    var ang = null, cols = sups.filter(function (s) { return s.col; });
    cols.forEach(function (a) { [["x", "y"], ["y", "x"]].forEach(function (ax) { var nb = null; cols.forEach(function (b) { if (b === a || Math.abs(b[ax[1]] - a[ax[1]]) > 0.01 || b[ax[0]] <= a[ax[0]] + 0.01) return; if (!nb || b[ax[0]] < nb[ax[0]]) nb = b; }); if (!nb) return; var dw = Math.abs(wG.U[6 * a.node + 2] - wG.U[6 * nb.node + 2]), Lr = nb[ax[0]] - a[ax[0]], rr = dw / Lr; if (!ang || rr > ang.r) ang = { r: rr, dw: dw * 1000, L: Lr, a: a.name, b: nb.name }; }); });
    out.ang = ang || { r: 0, dw: 0, L: 0, a: "", b: "" };
    /* factored: element moments and shears, punching */
    var ne = mm.shells.length, env = []; for (var k = 0; k < ne; k++) env.push({ bx: 0, by: 0, tx: 0, ty: 0, Q: 0, Mx: [0, 0], My: [0, 0], cb: ["", "", "", ""] });
    var pun = {}; cols.forEach(function (s) { pun[s.n] = { Vu: 0, cb: "" }; });
    /* one-way shear (IS 456 cl 31.6.1 / 40.2): section at d from each column face, shear averaged over the column strip
       (0.25 of the transverse spans each side of the column line, or to the mat edge) */
    var strips = [], d1 = ((T * 1000 - cov - dia0 / 2) + (T * 1000 - cov - 1.5 * dia0)) / 2000;
    function gap(a, v, sg, lo, hi) { var best = null; a.forEach(function (q) { if (sg * (q - v) > 0.01 && (best === null || Math.abs(q - v) < Math.abs(best - v))) best = q; }); return best === null ? (sg > 0 ? hi - v : v - lo) : 0.25 * Math.abs(best - v); }
    cols.forEach(function (s) {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dv) {
        var ax = dv[0] ? 0 : 1, half = (ax ? s.b : s.a) / 2, at = (ax ? s.y : s.x) + (dv[0] || dv[1]) * (half + d1), lo = ax ? y0 : x0, hi = ax ? y1 : x1;
        if (at <= lo + 1e-6 || at >= hi - 1e-6) return;
        var tc = ax ? s.x : s.y, w1 = gap(ax ? g.xs : g.ys, tc, -1, ax ? x0 : y0, ax ? x1 : y1), w2 = gap(ax ? g.xs : g.ys, tc, 1, ax ? x0 : y0, ax ? x1 : y1), list = [];
        mm.shells.forEach(function (sh, k) { var P0 = mm.nodes[sh.n[0]], P2 = mm.nodes[sh.n[2]], a0 = ax ? P0.y : P0.x, a1 = ax ? P2.y : P2.x, c = ax ? (P0.x + P2.x) / 2 : (P0.y + P2.y) / 2; if (at >= a0 - 1e-9 && at < a1 - 1e-9 && c >= tc - w1 - 1e-9 && c <= tc + w2 + 1e-9) list.push(k); });
        if (list.length) strips.push({ s: s, ax: ax, at: at, w: w1 + w2, els: list, V: 0, cb: "" });
      });
    });
    var dxB = T * 1000 - cov - dia0 / 2, dyB = dxB - dia0, dxT = dxB, dyT = dyB, dd0 = (dxB + dyB) / 2000;
    var Qs = [];
    for (i = 0; i < fac.length; i++) {
      var sf = fac[i], rf = MAT.solve(pm, vec(sf), base); if (rf.err) return { err: rf.err + " (" + sf.name + ")" };
      for (k = 0; k < ne; k++) {
        var fo = FE.shellForces(mm, k, rf.U), wa = FE.woodArmer(-fo.Mx, -fo.My, fo.Mxy), e = env[k];   /* sagging (bottom tension) positive, as in slab design */
        if (wa.bx > e.bx) { e.bx = wa.bx; e.cb[0] = sf.name; } if (wa.by > e.by) { e.by = wa.by; e.cb[1] = sf.name; }
        if (wa.tx < e.tx) { e.tx = wa.tx; e.cb[2] = sf.name; } if (wa.ty < e.ty) { e.ty = wa.ty; e.cb[3] = sf.name; }
        e.Q = Math.max(e.Q, Math.abs(fo.Qx), Math.abs(fo.Qy)); Qs[k] = [fo.Qx, fo.Qy];
      }
      strips.forEach(function (st) { var sum = 0, wsum = 0; st.els.forEach(function (k2) { var sh2 = mm.shells[k2], w0 = st.ax ? mm.nodes[sh2.n[1]].x - mm.nodes[sh2.n[0]].x : mm.nodes[sh2.n[3]].y - mm.nodes[sh2.n[0]].y; sum += Qs[k2][st.ax] * w0; wsum += w0; }); var V = Math.abs(sum / wsum); if (V > st.V) { st.V = V; st.cb = sf.name; } });
      cols.forEach(function (s) {
        var pr = perim(s, dd0), sup = 0;
        for (var v2 = 0; v2 < n; v2++) { var nd = mm.nodes[v2]; if (nd.x > pr.box[0] + 1e-6 && nd.x < pr.box[1] - 1e-6 && nd.y > pr.box[2] + 1e-6 && nd.y < pr.box[3] - 1e-6) sup += rf.R[v2] - sf.sw * 25 * T * pm.tr[v2]; }
        var Vu = sf.r[s.n][2] - Math.max(sup, 0); if (Vu > pun[s.n].Vu) pun[s.n] = { Vu: Vu, cb: sf.name };
      });
    }
    /* flexure: required steel per element, base mesh (≥ 0.12 % split between faces, covering 75 % of the area), extra bars */
    var feasible = true;
    function ast(M, d) { var a = RCC.astFlex(Math.abs(M), 1000, d, fck, fy); if (isNaN(a)) feasible = false; return isNaN(a) ? 1e9 : a; }
    var Amin = 0.0012 * 1000 * T * 1000 / 2, smax = Math.min(300, 3 * dyB);
    for (k = 0; k < ne; k++) {
      var sh = mm.shells[k], P = sh.n.map(function (v3) { return mm.nodes[v3]; }), E0 = env[k];
      out.el.push({ k: k, i: sh.i, j: sh.j, x0: P[0].x, x1: P[1].x, y0: P[0].y, y1: P[2].y, bx: E0.bx, by: E0.by, tx: E0.tx, ty: E0.ty, Q: E0.Q, cb: E0.cb,
        qG: P.reduce(function (a0, nd, ii) { return a0 + out.qG[sh.n[ii]] / 4; }, 0), req: { bx: ast(E0.bx, dxB), by: ast(E0.by, dyB), tx: ast(E0.tx, dxT), ty: ast(E0.ty, dyT) } });
    }
    function mesh(key) {
      var a = out.el.map(function (q) { return { A: (q.x1 - q.x0) * (q.y1 - q.y0), r: q.req[key] }; }).sort(function (u, w) { return u.r - w.r; }), tA = 0, cum = 0, need = Amin;
      a.forEach(function (q) { tA += q.A; }); for (var i2 = 0; i2 < a.length; i2++) { cum += a[i2].A; if (cum >= 0.75 * tA) { need = Math.max(need, a[i2].r); break; } }
      var pick = null;
      [12, 16, 20, 25].forEach(function (f) { if (pick) return; [300, 250, 200, 150, 125, 100].forEach(function (s) { if (pick || s > smax + 1e-9) return; var As = D.barArea(f) * 1000 / s; if (As >= need - 1e-9) pick = { dia: f, s: s, As: As }; }); });
      return pick || { dia: 25, s: 100, As: D.barArea(25) * 10 };
    }
    out.mesh = { bx: mesh("bx"), by: mesh("by"), tx: mesh("tx"), ty: mesh("ty") };
    out.Amin = Amin; out.smax = smax; out.d = { bx: dxB, by: dyB, tx: dxT, ty: dyT };
    /* extra-bar zones: 4-connected groups of elements whose demand exceeds the base mesh */
    function makeZones() {
      out.zones = [];
    ["bx", "by", "tx", "ty"].forEach(function (key) {
      var M0 = out.mesh[key], nxe = mx.length - 1, seen = {}, need = {};
      out.el.forEach(function (q) { if (q.req[key] > M0.As + 1e-6) need[q.j * nxe + q.i] = q; });
      Object.keys(need).forEach(function (id) {
        if (seen[id]) return; var st0 = [+id], grp = []; seen[id] = 1;
        while (st0.length) { var c = st0.pop(), q = need[c]; grp.push(q); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) { var ii = q.i + dd[0], jj = q.j + dd[1], id2 = jj * nxe + ii; if (ii >= 0 && jj >= 0 && ii < nxe && need[id2] && !seen[id2]) { seen[id2] = 1; st0.push(id2); } }); }
        var z = { face: key[0] === "b" ? "bottom" : "top", dir: key[1].toUpperCase(), key: key, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, req: 0, M: 0, n: grp.length };
        grp.forEach(function (q) { z.x0 = Math.min(z.x0, q.x0); z.x1 = Math.max(z.x1, q.x1); z.y0 = Math.min(z.y0, q.y0); z.y1 = Math.max(z.y1, q.y1); if (q.req[key] > z.req) { z.req = q.req[key]; z.M = Math.abs(q[key]); } });
        out.zones.push(z);
      });
      /* merge zones of the same layer that overlap or touch (within one element) */
      var zs = out.zones.filter(function (z) { return z.key === key; }), others = out.zones.filter(function (z) { return z.key !== key; }), merged = true;
      while (merged) {
        merged = false;
        for (var a = 0; a < zs.length && !merged; a++) for (var b = a + 1; b < zs.length && !merged; b++) {
          var A1 = zs[a], B1 = zs[b];
          if (A1.x0 <= B1.x1 + h + 1e-6 && B1.x0 <= A1.x1 + h + 1e-6 && A1.y0 <= B1.y1 + h + 1e-6 && B1.y0 <= A1.y1 + h + 1e-6) {
            A1.x0 = Math.min(A1.x0, B1.x0); A1.x1 = Math.max(A1.x1, B1.x1); A1.y0 = Math.min(A1.y0, B1.y0); A1.y1 = Math.max(A1.y1, B1.y1);
            if (B1.req > A1.req) { A1.req = B1.req; A1.M = B1.M; } A1.n += B1.n; zs.splice(b, 1); merged = true;
          }
        }
      }
      zs.forEach(function (z) {
        /* extra bars between the mesh bars at the mesh spacing, or two between (half spacing); smallest area that suffices */
        var add = z.req - M0.As, pk = null;
        MAT.DIAS.forEach(function (f) { [M0.s, M0.s / 2].forEach(function (sp) { var A0 = D.barArea(f) * 1000 / sp; if (A0 >= add - 1e-9 && (f <= 25 || !pk) && (!pk || A0 < pk.A || pk.dia > 25)) pk = { dia: f, s: sp, A: A0 }; }); });
        if (!pk) { pk = { dia: 32, s: M0.s / 2, A: D.barArea(32) * 2000 / M0.s }; feasible = false; }
        z.dia = pk.dia; z.s = pk.s; z.As = M0.As + pk.A;
      });
      out.zones = others.concat(zs);
    });
    out.zones.forEach(function (z, i3) { z.mark = (z.face === "bottom" ? "EB" : "ET") + (i3 + 1); });
    }
    function shearCheck() {
    var vmax = null;
    strips.forEach(function (st) {
      var dir = st.ax ? "y" : "x", As = Infinity;
      var sb = 0, stp = 0; st.els.forEach(function (k2) { sb += out.el[k2].req["b" + dir]; stp += out.el[k2].req["t" + dir]; }); st.face = sb >= stp ? "b" : "t";
      st.els.forEach(function (k2) { var q = out.el[k2]; As = Math.min(As, provAs(q, st.face, dir)); });   /* tension face of the strip */
      var dm = st.ax ? dyB : dxB, pt = 100 * As / (1000 * dm), tv = st.V / dm, tc = RCC.tauc(fck, pt), u = tv / tc;
      st.tv = tv; st.tc = tc; st.pt = pt; st.u = u;
      if (!vmax || u > vmax.u) vmax = { u: u, tv: tv, tc: tc, pt: pt, V: st.V, d: dm, w: st.w, col: st.s.name, dir: (st.ax ? "Y" : "X"), cb: st.cb };
    });
    function provAs(q, face, dd) { var key = face + dd, A0 = out.mesh[key].As; out.zones.forEach(function (z) { if (z.key === key && q.x0 >= z.x0 - 1e-6 && q.x1 <= z.x1 + 1e-6 && q.y0 >= z.y0 - 1e-6 && q.y1 <= z.y1 + 1e-6) A0 = Math.max(A0, z.As); }); return A0; }
    out.strips = strips.map(function (st) { return { col: st.s.name, dir: st.ax ? "Y" : "X", at: st.at, w: st.w, V: st.V, tv: st.tv, tc: st.tc, pt: st.pt, u: st.u, cb: st.cb, face: st.face === "b" ? "bottom" : "top", d: st.ax ? dyB : dxB }; });
    out.shear = vmax || { u: 0, tv: 0, tc: 0, pt: 0 };
    }
    makeZones(); shearCheck();
    /* one-way shear failing: raise the tension steel in the column strip (τc grows with pt) up to pt = 1 %, else thicken */
    var bumped = false;
    out.strips.forEach(function (st, si) {
      if (st.u <= 1 + 1e-9) return;
      var S0 = strips[si], dir = S0.ax ? "y" : "x", dm = S0.ax ? dyB : dxB, need = null;
      for (var pt = 0.15; pt <= 1.0 + 1e-9; pt += 0.05) if (RCC.tauc(fck, pt) >= st.tv) { need = pt; break; }
      if (need === null) return;
      var As = need / 100 * 1000 * dm, face = S0.face;
      S0.els.forEach(function (k2) { var q = out.el[k2]; q.req[face + dir] = Math.max(q.req[face + dir], As); q.shearSteel = true; });
      bumped = true;
    });
    if (bumped) { makeZones(); shearCheck(); }
    /* most stressed element of each layer (for the report and Excel) */
    out.flex = {};
    ["bx", "by", "tx", "ty"].forEach(function (key) {
      var w = null; out.el.forEach(function (q) { if (!w || Math.abs(q[key]) > Math.abs(w[key])) w = q; });
      var prov = out.mesh[key].As; out.zones.forEach(function (z) { if (z.key === key && w.x0 >= z.x0 - 1e-6 && w.x1 <= z.x1 + 1e-6 && w.y0 >= z.y0 - 1e-6 && w.y1 <= z.y1 + 1e-6) prov = Math.max(prov, z.As); });
      out.flex[key] = { M: Math.abs(w[key]), d: out.d[key], req: RCC.astFlex(Math.abs(w[key]), 1000, out.d[key], fck, fy), prov: prov, x: (w.x0 + w.x1) / 2, y: (w.y0 + w.y1) / 2, cb: w.cb[{ bx: 0, by: 1, tx: 2, ty: 3 }[key]] };
    });

    /* punching */
    out.pun = cols.map(function (s) {
      var dd = (dxB + dyB) / 2, pr = perim(s, dd / 1000), Vu = pun[s.n].Vu, tv = Vu * 1000 / (pr.b0 * 1000 * dd), kc = kpun(s);
      return { name: s.name, n: s.n, a: s.a * 1000, b: s.b * 1000, d: dd, b0: pr.b0 * 1000, type: pr.type, Vu: Vu, Pu: Pu[s.n], cb: pun[s.n].cb, tv: tv, kc: kc, u: tv / kc, ok: tv <= kc + 1e-9 };
    });
    /* sliding and overturning (IS 456 cl 20): 0.9 × dead load, μ = 0.5 */
    var DLt = tot({ r: comb({ DL: 1 }) }), Wd = 0.9 * (DLt.N + 25 * T * Am), sl = null, ot = null;
    out.svc.forEach(function (r0) {
      if (!r0.E) return; var H = Math.hypot(r0.H[0], r0.H[1]);
      if (H > 1e-6) { var fs = 0.5 * Wd / H; if (!sl || fs < sl.fs) sl = { fs: fs, H: H, set: r0.name }; }
      var Et = tot({ r: comb(Object.keys(r0.E.f).reduce(function (o, cn) { o[cn] = r0.E.sg * r0.E.f[cn]; return o; }, {})) }), xc = (x0 + x1) / 2, yc = (y0 + y1) / 2;
      var Mo = [Math.abs(Et.Sx - xc * Et.N - Et.M4), Math.abs(Et.Sy - yc * Et.N + Et.M3)];
      [0, 1].forEach(function (ax) { if (Mo[ax] < 1e-6) return; var fs2 = Wd * (ax ? B : L) / 2 / Mo[ax]; if (!ot || fs2 < ot.fs) ot = { fs: fs2, M: Mo[ax], set: r0.name }; });
    });
    out.slide = sl; out.over = ot;
    /* rigidity (IS 2950 Pt 1 cl 5.3): rigid if the column spacing < 1.75/λ, λ = (3ks/(Ec t³))^¼ */
    var lam = Math.pow(3 * ks / (Ec * T * T * T), 0.25), sp = 0;
    [g.xs, g.ys].forEach(function (a) { for (var i4 = 1; i4 < a.length; i4++) sp = Math.max(sp, a[i4] - a[i4 - 1]); });
    out.rigidity = { lam: lam, lim: 1.75 / lam, sp: sp, rigid: sp < 1.75 / lam };
    /* checks */
    var setLim = p.setLim > 0 ? +p.setLim : 75, angLim = p.angLim > 0 ? +p.angLim : 500, C = out.checks;
    C.push({ t: "Max net soil pressure ≤ allowable (" + gov.name + ")", ok: gov.u <= 1 + 1e-9, v: gov.qmax.toFixed(1) + " ≤ " + gov.lim.toFixed(0) + " kN/m²", cl: gov.lim > q0 ? "IS 1893 cl 6.3.5.2 (+" + Math.round((incr - 1) * 100) + " %)" : "IS 2950 Pt 1 cl 4.2", u: gov.u });
    var up = out.svc[0];
    C.push({ t: "Full contact under DL+LL", ok: up.lift < 1e-9, v: up.lift > 0 ? (100 * up.lift).toFixed(1) + " % of the area lifts off" : "no uplift", cl: "IS 2950 Pt 1" });
    var lw = out.svc.reduce(function (a, r0) { return Math.max(a, r0.lift); }, 0);
    C.push({ t: "Contact under seismic sets (lift-off ≤ 25 % of the area)", ok: lw <= 0.25 + 1e-9, v: (100 * lw).toFixed(1) + " % lifts off (springs switched off)", cl: "IS 2950 Pt 1 / IS 1893 cl 6.3.5.2" });
    C.push({ t: "Settlement under DL+LL (Winkler, indicative)", ok: out.wmax <= setLim + 1e-9, v: out.wmax.toFixed(1) + " ≤ " + setLim + " mm", cl: "IS 1904 (raft) — confirm with a settlement analysis", u: out.wmax / setLim });
    C.push({ t: "Angular distortion between columns", ok: out.ang.r <= 1 / angLim + 1e-12, v: "1/" + (out.ang.r > 0 ? Math.round(1 / out.ang.r) : "∞") + (out.ang.a ? " (" + out.ang.a + "–" + out.ang.b + ", Δ " + out.ang.dw.toFixed(1) + " mm)" : "") + " ≤ 1/" + angLim, cl: "IS 1904", u: out.ang.r * angLim });
    var pw = out.pun.reduce(function (a, q) { return !a || q.u > a.u ? q : a; }, null);
    if (pw) C.push({ t: "Punching shear at d/2 — worst " + pw.name + " (" + pw.type + ")", ok: out.pun.every(function (q) { return q.ok; }), v: pw.tv.toFixed(3) + " ≤ ks·0.25√fck " + pw.kc.toFixed(3) + " N/mm²" + (out.pun.filter(function (q) { return !q.ok; }).length ? " — fails at " + out.pun.filter(function (q) { return !q.ok; }).length + " columns" : ""), cl: "IS 456 cl 31.6", u: pw.u });
    C.push({ t: "One-way shear at d from the column faces (column-strip average)" + (out.shear.col ? " — worst " + out.shear.col + " " + out.shear.dir : ""), ok: out.shear.u <= 1 + 1e-9, v: out.shear.tv.toFixed(3) + " ≤ τc " + out.shear.tc.toFixed(3) + " N/mm² (pt " + out.shear.pt.toFixed(2) + " %)", cl: "IS 456 cl 31.6.1, 40.2", u: out.shear.u });
    C.push({ t: "Flexure (Wood–Armer) within the section capacity", ok: feasible, v: feasible ? "all elements designed" : "Mu > Mu,lim or more than 32φ extra bars needed — thicken the mat", cl: "IS 456 Annex G / cl 24" });
    if (sl) C.push({ t: "Sliding (μ = 0.5, 0.9 DL)", ok: sl.fs >= 1.4 - 1e-9, v: "FS " + sl.fs.toFixed(2) + " ≥ 1.4", cl: "IS 456 cl 20.2" });
    if (ot) C.push({ t: "Overturning (0.9 DL)", ok: ot.fs >= 1.4 - 1e-9, v: "FS " + ot.fs.toFixed(2) + " ≥ 1.4", cl: "IS 456 cl 20.1" });
    C.push({ t: "Mat " + (out.rigidity.rigid ? "is rigid" : "is flexible") + " (spacing " + sp.toFixed(2) + " m vs 1.75/λ = " + out.rigidity.lim.toFixed(2) + " m)", ok: true, v: "flexible-plate analysis used in either case", cl: "IS 2950 Pt 1 cl 5.3" });
    /* thickness is acceptable when punching, one-way shear and flexure pass (pressure, settlement and sliding are not cured by thickness) */
    out.ok = out.pun.every(function (q) { return q.ok; }) && out.shear.u <= 1 + 1e-9 && feasible;
    out.fails = C.filter(function (c) { return !c.ok; }).length;
    MAT.bars(out, cf, p);
    return out;
  }
};

/* -------------------------------------------------------------------------------------------------- bars (BBS) */
MAT.bars = function (o, cf, p) {
  var cv = cf.cf, Lm = o.L * 1000, Bm = o.B * 1000, T = o.T, fy = o.fy, fck = o.fck, bars = [];
  function lapd(L0, f) { var nl = Math.max(0, Math.ceil(L0 / 12000 - 1e-9) - 1); return { nl: nl, add: nl * DT.lap(f, fy, fck) }; }
  function add(q) { var lp = lapd(DT.cut(q), q.dia); q.laps = lp.nl; q.L = DT.cut(q) + lp.add; bars.push(q); }
  var leg = 2 * Math.round((T - 2 * cv) / 2), Lm0 = Math.round(Lm), Bm0 = Math.round(Bm);
  [["bx", "a", "Bottom mesh, bars along X (outer layer), bent up at the edges", Lm0, Bm0], ["by", "b", "Bottom mesh, bars along Y, bent up at the edges", Bm0, Lm0],
   ["tx", "c", "Top mesh, bars along X (outer layer), bent down at the edges", Lm0, Bm0], ["ty", "d", "Top mesh, bars along Y, bent down at the edges", Bm0, Lm0]].forEach(function (k) {
    var M = o.mesh[k[0]], n = Math.floor((k[4] - 2 * cv) / M.s + 1e-9) + 1;
    add({ mark: k[1], desc: k[2], pos: k[0][0] === "b" ? "B" : "T", dia: M.dia, n: n, shape: "U", A: k[3] - 2 * cv, B: leg / 2, C: leg / 2, n90: 2, s: M.s });
  });
  o.zones.forEach(function (z) {
    var alongX = z.dir === "X", len = (alongX ? z.x1 - z.x0 : z.y1 - z.y0) * 1000 + 2 * DT.Ld(z.dia, fy, fck), wid = (alongX ? z.y1 - z.y0 : z.x1 - z.x0) * 1000;
    len = Math.min(len, (alongX ? Lm : Bm) - 2 * cv);
    add({ mark: z.mark, desc: "Extra " + z.face + " bars along " + z.dir + " between the mesh bars (" + ((z.x0 + z.x1) / 2).toFixed(2) + ", " + ((z.y0 + z.y1) / 2).toFixed(2) + ")", pos: z.face === "bottom" ? "B" : "T", dia: z.dia, n: Math.floor(wid / z.s + 1e-9) + 1, shape: "S", A: DT.r(len, 50), s: z.s });
  });
  if (T > 750) { var ns = Math.max(1, Math.ceil((T - 2 * cv) / 300 - 1e-9) - 1); add({ mark: "e", desc: "Side-face bars around the edge, " + ns + " per face (IS 456 cl 26.5.1.3)", pos: "S", dia: 12, n: ns, shape: "S", A: 2 * (Lm + Bm) - 8 * cv }); }
  o.bars = bars; o.wt = 0; bars.forEach(function (q) { o.wt += q.n * q.L / 1000 * DT.wpm(q.dia); });
  o.conc = o.L * o.B * o.T / 1000; o.sig = "mat" + o.T;
};
/* -------------------------------------------------------------------------------------------------- drawings */
MAT.draw = function (o, cf) {
  var DWc = DT.DW, th = Math.max(120, Math.min(o.L, o.B) * 18), M = o.mesh;
  var X = function (x) { return (x - o.x0) * 1000; }, Y = function (y) { return (y - o.y0) * 1000; };
  function plan(face) {
    var bot = face === "bottom", p = new DWc((bot ? "Bottom" : "Top") + " reinforcement — mat " + o.L.toFixed(2) + " × " + o.B.toFixed(2) + " m × " + o.T + " mm"), ly = bot ? "S" : "R";
    p.r(0, 0, o.L * 1000, o.B * 1000, "C");
    o.sups.forEach(function (s) { if (s.col) p.r(X(s.x) - s.a * 500, Y(s.y) - s.b * 500, s.a * 1000, s.b * 1000, "C").tx(X(s.x) + s.a * 500 + 40, Y(s.y) + s.b * 500 + 40, s.name.replace(/^C-/, ""), th * 0.7, "l", "T"); else p.c(X(s.x), Y(s.y), 60, "C"); });
    o.zones.forEach(function (z) {
      if (z.face !== face) return;
      var x0 = X(z.x0), y0 = Y(z.y0), w = (z.x1 - z.x0) * 1000, h = (z.y1 - z.y0) * 1000, alongX = z.dir === "X";
      p.r(x0, y0, w, h, ly);
      if (alongX) p.l(x0, y0 + h / 2, x0 + w, y0 + h / 2, ly); else p.l(x0 + w / 2, y0, x0 + w / 2, y0 + h, ly);
      p.tx(x0 + w / 2, y0 + h / 2 + (alongX ? 40 : -th - 40), z.mark + " " + z.dia + "φ@" + z.s + " " + z.dir, th * 0.65, "c", ly);
    });
    var a = bot ? M.bx : M.tx, b = bot ? M.by : M.ty;
    p.tx(0, -th * 2.2, "Base mesh " + face + ":  " + (bot ? "a" : "c") + " " + a.dia + "φ@" + a.s + " along X,  " + (bot ? "b" : "d") + " " + b.dia + "φ@" + b.s + " along Y — whole mat, bent at the edges", th, "l", ly);
    p.tx(0, -th * 3.6, (bot ? "EB" : "ET") + " zones: extra " + face + " bars between the mesh bars (direction after the spacing), extended Ld beyond the zone", th * 0.8, "l", "T");
    p.dim(0, o.B * 1000 + 150, o.L * 1000, o.B * 1000 + 150, 150, "L " + Math.round(o.L * 1000), th).dim(-150, 0, -150, o.B * 1000, 150, "B " + Math.round(o.B * 1000), th);
    return p;
  }
  var p = plan("bottom"), pt = plan("top");
  /* section along X through the most loaded column line */
  var rowY = o.sups.filter(function (s) { return s.col; }).reduce(function (a, s) { return a === null || Math.abs(s.y - (o.y0 + o.y1) / 2) < Math.abs(a - (o.y0 + o.y1) / 2) ? s.y : a; }, null);
  var sc = new DWc("Section A-A (along X at y = " + (rowY || 0).toFixed(2) + ")"), T = o.T, cv = cf.cf, Lm = o.L * 1000;
  sc.r(0, 0, Lm, T, "C");
  o.sups.forEach(function (s) { if (s.col && Math.abs(s.y - rowY) < 0.01) sc.l(X(s.x) - s.a * 500, T, X(s.x) - s.a * 500, T + 600, "C").l(X(s.x) + s.a * 500, T, X(s.x) + s.a * 500, T + 600, "C"); });
  var zb = cv + M.bx.dia / 2, zt = T - cv - M.tx.dia / 2;
  sc.pl([[cv, zt], [cv, zb], [Lm - cv, zb], [Lm - cv, zt]], "R").pl([[cv + 30, zb], [cv + 30, zt], [Lm - cv - 30, zt], [Lm - cv - 30, zb]], "R");
  o.zones.forEach(function (z) { if (z.dir !== "X" || rowY < z.y0 - 1e-6 || rowY > z.y1 + 1e-6) return; var zz = z.face === "bottom" ? zb + z.dia + 10 : zt - z.dia - 10; sc.l(X(z.x0), zz, X(z.x1), zz, "S").tx((X(z.x0) + X(z.x1)) / 2, z.face === "bottom" ? zz + 30 : zz - th - 20, z.mark, th * 0.7, "c", "S"); });
  sc.tx(Lm / 2, -th * 1.6, "a/b " + M.bx.dia + "/" + M.by.dia + "φ bottom · c/d " + M.tx.dia + "/" + M.ty.dia + "φ top · cover " + cv + " mm · chairs to hold the top mesh", th * 0.8, "c", "T");
  sc.dim(Lm + 120, 0, Lm + 120, T, 0, "T " + T, th * 0.8);
  return [p, pt, sc];
};
/* colour map of an element value (SVG string) — pressure or required steel */
MAT.heat = function (o, fn, unit, W) {
  var sc = (W || 340) / o.L, Hh = o.B * sc, vals = o.el.map(fn), mx = Math.max.apply(null, vals.concat([1e-9])), mn = Math.min.apply(null, vals.concat([0])), h = '<svg class="dwg" viewBox="-2 -2 ' + ((W || 340) + 4) + ' ' + (Hh + 26) + '" width="' + ((W || 340) + 4) + '">';
  function col(v) { var t = (v - mn) / ((mx - mn) || 1), r = Math.round(255 * Math.min(1, 2 * t)), g = Math.round(200 * Math.min(1, 2 * (1 - t))); return "rgb(" + r + "," + g + ",60)"; }
  o.el.forEach(function (q, k) { h += '<rect x="' + ((q.x0 - o.x0) * sc).toFixed(1) + '" y="' + ((o.y1 - q.y1) * sc).toFixed(1) + '" width="' + ((q.x1 - q.x0) * sc + 0.3).toFixed(1) + '" height="' + ((q.y1 - q.y0) * sc + 0.3).toFixed(1) + '" fill="' + col(vals[k]) + '"/>'; });
  o.sups.forEach(function (s) { if (s.col) h += '<rect x="' + ((s.x - s.a / 2 - o.x0) * sc).toFixed(1) + '" y="' + ((o.y1 - s.y - s.b / 2) * sc).toFixed(1) + '" width="' + (s.a * sc).toFixed(1) + '" height="' + (s.b * sc).toFixed(1) + '" fill="none" stroke="#1d3557" stroke-width="1"/>'; });
  h += '<text x="0" y="' + (Hh + 18) + '" font-size="11" fill="currentColor">' + mn.toFixed(0) + ' (green) … ' + mx.toFixed(0) + ' ' + unit + ' (red)</text></svg>';
  return h;
};
if (typeof module !== "undefined") module.exports = MAT;
