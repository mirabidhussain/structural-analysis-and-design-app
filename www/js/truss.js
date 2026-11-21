/* Roof truss: geometry, IS 875 loads, stiffness analysis, IS 800 member design. Units m, kN. */
var TR = {};

TR.geometry = function (type, span, slope, n) {
  var t = Math.tan(slope * Math.PI / 180), N = [], M = [], top = [], bot = [];
  function node(x, y, kind) { N.push({ x: x, y: y, kind: kind }); return N.length - 1; }
  function mem(i, j, g) { M.push({ i: i, j: j, g: g }); }
  if (type === "fink") {
    var h = span / 2 * t;
    var b0 = node(0, 0, "b"), b1 = node(span / 3, 0, "b"), b2 = node(2 * span / 3, 0, "b"), b3 = node(span, 0, "b");
    var t1 = node(span / 4, h / 2, "t"), ap = node(span / 2, h, "t"), t3 = node(3 * span / 4, h / 2, "t");
    mem(b0, t1, "top"); mem(t1, ap, "top"); mem(ap, t3, "top"); mem(t3, b3, "top");
    mem(b0, b1, "bot"); mem(b1, b2, "bot"); mem(b2, b3, "bot");
    mem(t1, b1, "web"); mem(b1, ap, "web"); mem(ap, b2, "web"); mem(b2, t3, "web");
    top = [b0, t1, ap, t3, b3]; bot = [b0, b1, b2, b3];
    return { N: N, M: M, top: top, bot: bot, sup: [b0, b3], span: span, h: h };
  }
  var nn = 2 * n, p = span / nn;
  for (var i = 0; i <= nn; i++) bot.push(node(i * p, 0, "b"));
  top.push(bot[0]);
  for (i = 1; i < nn; i++) top.push(node(i * p, Math.min(i, nn - i) * p * t, "t"));
  top.push(bot[nn]);
  for (i = 0; i < nn; i++) { mem(top[i], top[i + 1], "top"); mem(bot[i], bot[i + 1], "bot"); }
  for (i = 1; i < nn; i++) mem(bot[i], top[i], "web");
  for (i = 1; i < n; i++) {
    if (type === "pratt") { mem(top[i], bot[i + 1], "web"); mem(top[nn - i], bot[nn - i - 1], "web"); }
    else { mem(bot[i], top[i + 1], "web"); mem(bot[nn - i], top[nn - i - 1], "web"); }
  }
  return { N: N, M: M, top: top, bot: bot, sup: [bot[0], bot[nn]], span: span, h: span / 2 * t };
};

/* direct stiffness solve: loads [{node, fx, fy}], left pin + right roller */
TR.solve = function (g, loads) {
  var n = g.N.length, K = [], F = new Array(2 * n).fill(0);
  for (var a = 0; a < 2 * n; a++) K.push(new Array(2 * n).fill(0));
  g.M.forEach(function (m) {
    var A = g.N[m.i], B = g.N[m.j], L = Math.hypot(B.x - A.x, B.y - A.y), c = (B.x - A.x) / L, s = (B.y - A.y) / L;
    m.L = L; m.c = c; m.s = s;
    var k = [[c * c, c * s], [c * s, s * s]], idx = [2 * m.i, 2 * m.i + 1, 2 * m.j, 2 * m.j + 1];
    for (var p = 0; p < 4; p++) for (var q = 0; q < 4; q++) {
      var sg = ((p < 2) === (q < 2)) ? 1 : -1;
      K[idx[p]][idx[q]] += sg * k[p % 2][q % 2] / L;
    }
  });
  loads.forEach(function (l) { F[2 * l.node] += l.fx; F[2 * l.node + 1] += l.fy; });
  var fixed = g.pp ? [2 * g.sup[0], 2 * g.sup[0] + 1, 2 * g.sup[1], 2 * g.sup[1] + 1] : [2 * g.sup[0], 2 * g.sup[0] + 1, 2 * g.sup[1] + 1];
  var free = []; for (a = 0; a < 2 * n; a++) if (fixed.indexOf(a) < 0) free.push(a);
  var m = free.length, A2 = [], b2 = [];
  for (var i = 0; i < m; i++) { A2.push(free.map(function (j) { return K[free[i]][j]; })); b2.push(F[free[i]]); }
  for (i = 0; i < m; i++) {
    var piv = i; for (var r = i + 1; r < m; r++) if (Math.abs(A2[r][i]) > Math.abs(A2[piv][i])) piv = r;
    var tmp = A2[i]; A2[i] = A2[piv]; A2[piv] = tmp; tmp = b2[i]; b2[i] = b2[piv]; b2[piv] = tmp;
    for (r = i + 1; r < m; r++) { var f = A2[r][i] / A2[i][i]; for (var c2 = i; c2 < m; c2++) A2[r][c2] -= f * A2[i][c2]; b2[r] -= f * b2[i]; }
  }
  var x = new Array(m);
  for (i = m - 1; i >= 0; i--) { var s2 = b2[i]; for (var c3 = i + 1; c3 < m; c3++) s2 -= A2[i][c3] * x[c3]; x[i] = s2 / A2[i][i]; }
  var u = new Array(2 * n).fill(0); free.forEach(function (d, k) { u[d] = x[k]; });
  var forces = g.M.map(function (m) {
    return ((u[2 * m.j] - u[2 * m.i]) * m.c + (u[2 * m.j + 1] - u[2 * m.i + 1]) * m.s) / m.L;   /* EA = 1 -> axial force, + tension */
  });
  /* reactions */
  var R = { RAx: 0, RAy: 0, RBy: 0, RBx: 0 };
  var Fint = new Array(2 * n).fill(0);
  g.M.forEach(function (m, k) { var f = forces[k]; Fint[2 * m.i] += f * m.c; Fint[2 * m.i + 1] += f * m.s; Fint[2 * m.j] -= f * m.c; Fint[2 * m.j + 1] -= f * m.s; });   /* tension pulls node i towards j */
  R.RAx = -(F[2 * g.sup[0]] + Fint[2 * g.sup[0]]); R.RAy = -(F[2 * g.sup[0] + 1] + Fint[2 * g.sup[0] + 1]); R.RBy = -(F[2 * g.sup[1] + 1] + Fint[2 * g.sup[1] + 1]); if (g.pp) R.RBx = -(F[2 * g.sup[1]] + Fint[2 * g.sup[1]]);
  return { f: forces, R: R };
};

/* panel loads: gravity w (kN/m2 plan) and wind normal pressures on left/right slopes (kN/m2, + towards roof) */
TR.loads = function (g, sp, wg, wLeft, wRight) {
  var L = [], top = g.top;
  for (var k = 0; k < top.length; k++) {
    var nd = g.N[top[k]], fx = 0, fy = 0;
    [k - 1, k + 1].forEach(function (j) {
      if (j < 0 || j >= top.length) return;
      var o = g.N[top[j]], dx = Math.abs(o.x - nd.x), dl = Math.hypot(o.x - nd.x, o.y - nd.y);
      fy -= wg * sp * dx / 2;
      var left = Math.min(o.x, nd.x) < g.span / 2 - 1e-9, wp = left ? wLeft : wRight;
      var sx = (Math.max(o.x, nd.x) - Math.min(o.x, nd.x)) / dl, sy = Math.abs(o.y - nd.y) / dl;
      /* outward normal of roof surface: left slope (-sy, +sx)... pressure acts opposite to outward normal */
      var nxo = left ? -sy : sy, nyo = sx;
      fx += -wp * sp * dl / 2 * nxo; fy += -wp * sp * dl / 2 * nyo;
    });
    L.push({ node: top[k], fx: fx, fy: fy });
  }
  return L;
};

TR.design = function (p) {
  var r = new Rep("Roof Truss Analysis & Design", "IS 875 / IS 800:2007");
  var fromDxf = p.src === "dxf";
  if (fromDxf) {
    if (!p.dxf) throw new Error("Choose the truss elevation DXF file (or switch the geometry source to the generator)");
    var g = DXF.truss(p.dxf, { scale: { mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, "in": 0.0254 }[p.dunits] || null });
    p = Object.assign({}, p, { span: Math.round(g.span * 1000) / 1000, slope: Math.round(g.slope * 10) / 10 });
  } else var g = TR.geometry(p.type, p.span, p.slope, p.n);
  var ld = LD.roof({ span: p.span, slope: p.slope, sheet: p.sheet, purl: p.purl, s0: p.s0, vb: p.vb, k1: p.k1, terrain: p.terrain, h: p.h, k3: 1, k4: 1, kd: 0.9, ka: 1, kc: 0.9, hw: p.hw, cpi: p.cpi });
  var sp = p.spacing; g.pp = p.tsup === "pp";
  r.h("1. Geometry & loads");
  r.row("Truss", (fromDxf ? "From the DXF drawing (" + g.N.length + " joints, " + g.M.length + " members: " + ["top", "bot", "web"].map(function (k) { return g.M.filter(function (m) { return m.g === k; }).length + " " + { top: "top chord", bot: "bottom chord", web: "web" }[k]; }).join(", ") + ")" : { pratt: "Pratt", howe: "Howe", fink: "Fink (W)" }[p.type]) + ", span " + p.span + " m, rise " + U.f(g.h, 3) + " m (" + p.slope + "°" + (fromDxf ? " average" : "") + "), spacing " + sp + " m", "");
  if (fromDxf && g.warn.length) r.note(g.warn.join("; "));
  r.row("DL / LL(snow) on plan", U.f(ld.DLplan, 3) + " / " + U.f(ld.LLs, 3), "kN/m²", "IS 875 Pt 1, 2, 4");
  r.row("Wind pd ; Cpe windward / leeward", U.f(ld.pd, 3) + " ; " + U.f(ld.cpeW, 2) + " / " + U.f(ld.cpeL, 2), "kN/m²", "IS 875 Pt 3");
  var cases = {
    DL: TR.solve(g, TR.loads(g, sp, ld.DLplan, 0, 0)),
    LL: TR.solve(g, TR.loads(g, sp, ld.LLs, 0, 0)),
    WLu: TR.solve(g, TR.loads(g, sp, 0, ld.wW_up, ld.wL_up)),
    WLu2: TR.solve(g, TR.loads(g, sp, 0, ld.wL_up, ld.wW_up)),
    WLd: TR.solve(g, TR.loads(g, sp, 0, ld.wW_dn, ld.wL_dn)),
    WLd2: TR.solve(g, TR.loads(g, sp, 0, ld.wL_dn, ld.wW_dn))
  };
  if (cases.DL.f.some(function (v) { return !isFinite(v); })) throw new Error("The truss is unstable (a mechanism) — check that every joint is connected and the members meet at common points");
  var combos = [["1.5(DL+LL)", { DL: 1.5, LL: 1.5 }]];
  ["WLu", "WLu2", "WLd", "WLd2"].forEach(function (w) {
    var tag = w.indexOf("u") >= 0 ? "suction" : "pressure", side = w.slice(-1) === "2" ? "R" : "L";
    var o1 = { DL: 1.2, LL: 1.2 }; o1[w] = 1.2; combos.push(["1.2(DL+LL+WL " + tag + " " + side + ")", o1]);
    var o2 = { DL: 1.5 }; o2[w] = 1.5; combos.push(["1.5(DL+WL " + tag + " " + side + ")", o2]);
    var o3 = { DL: 0.9 }; o3[w] = 1.5; combos.push(["0.9DL+1.5WL " + tag + " " + side, o3]);
  });
  var env = g.M.map(function () { return { T: 0, C: 0, Tc: "", Cc: "" }; }), reac = [];
  combos.forEach(function (cb) {
    var f = g.M.map(function (_, k) { var s = 0; for (var key in cb[1]) s += cb[1][key] * cases[key].f[k]; return s; });
    f.forEach(function (v, k) { if (v > env[k].T) { env[k].T = v; env[k].Tc = cb[0]; } if (v < env[k].C) { env[k].C = v; env[k].Cc = cb[0]; } });
    var R = { RAx: 0, RAy: 0, RBy: 0, RBx: 0 };
    for (var key in cb[1]) { R.RAx += cb[1][key] * cases[key].R.RAx; R.RAy += cb[1][key] * cases[key].R.RAy; R.RBy += cb[1][key] * cases[key].R.RBy; R.RBx += cb[1][key] * cases[key].R.RBx; }
    reac.push(g.pp ? [cb[0], U.f(R.RAx, 2), U.f(R.RAy, 2), U.f(R.RBx, 2), U.f(R.RBy, 2)] : [cb[0], U.f(R.RAx, 2), U.f(R.RAy, 2), U.f(R.RBy, 2)]);
  });
  r.h("2. Support reactions (kN)  [+ up]");
  r.table(g.pp ? ["Combination", "HA", "VA", "HB", "VB"] : ["Combination", "HA", "VA", "VB"], reac);
  r.note(g.pp ? "Supports: pinned at both ends (both bearings held horizontally) — the truss is externally indeterminate; forces found with equal member stiffness EA, the bottom chord carries less tension and the bearings take horizontal thrust HB. Anchor both bearings and the supporting columns for H." : "Supports: pinned at the left end, roller (free to slide) at the right end — statically determinate; slotted holes at the roller bearing.");
  /* design */
  r.h("3. Member design (envelope of " + combos.length + " combinations)");
  var cfg = { fy: p.fy, fu: p.fu, conn: "weld", Lw: 100, db: 16, g: 30, nb: 2, pitch: 50, e: 30 };
  function designAngle(grp, Tmax, Cmax, Lin, Lout) {
    var dbl = grp !== "web", n = dbl ? 2 : 1;
    var list = D.ISA.filter(function (a) { return a.a >= (dbl ? 50 : (p.webMin || 50)); });
    for (var i = 0; i < list.length; i++) {
      var s = list[i], pr = ST.angleProps(s, n, p.gusset);
      var cfg2 = Object.assign({}, cfg, { Lw: 2 * s.a });
      var Td = ST.tensionCap(s, n, cfg2).Td;
      var Pd;
      if (dbl) {
        var KLx = 0.85 * Lin * 1000 / pr.rxx, KLy = 0.85 * Lout * 1000 / pr.ryy, KLr = Math.max(KLx, KLy);
        Pd = pr.A * ST.fcd(KLr, p.fy, "c") / 1e3;
      } else {
        var o = ST.compCap("sa", s, { fy: p.fy, L: Lin, endc: "fixed2" }); Pd = o.Pd; KLr = o.KLr;
      }
      var lim = Cmax > 0 ? (Tmax > 0 ? 250 : 180) : 400;
      if (Td >= Tmax && Pd >= Cmax && (Cmax > 0 ? KLr <= lim : Lin * 1000 / pr.rmin <= 400))
        return { s: s, n: n, Td: Td, Pd: Pd, m: pr.m, u: Math.max(Tmax / Td, Cmax / Pd) };
    }
    return null;
  }
  var groups = { top: [], bot: [], web: [] };
  g.M.forEach(function (m, k) { groups[m.g].push(k); });
  var chosen = {}, rows = [], wt = 0, fail = false;
  ["top", "bot"].forEach(function (grp) {
    var Tm = 0, Cm = 0, Lm = 0;
    groups[grp].forEach(function (k) { Tm = Math.max(Tm, env[k].T); Cm = Math.max(Cm, -env[k].C); Lm = Math.max(Lm, g.M[k].L); });
    var Lout = grp === "top" ? Math.min(Lm, p.purlinSp) : p.bracing;
    chosen[grp] = designAngle(grp, Tm, Cm, Lm, Lout);
    if (!chosen[grp]) fail = true;
  });
  g.M.forEach(function (m, k) {
    var d = m.g === "web" ? designAngle("web", env[k].T, -env[k].C, m.L, m.L) : chosen[m.g];
    if (!d) { fail = true; rows.push([k + 1, m.g, U.f(m.L, 3), U.f(env[k].T, 2), U.f(-env[k].C, 2), "none adequate", "-"]); return; }
    m.sec = d; wt += d.m * m.L;
    var u = Math.max(env[k].T / d.Td, -env[k].C / d.Pd);
    rows.push([k + 1, m.g === "top" ? "Top chord" : m.g === "bot" ? "Bottom chord" : "Web", U.f(m.L, 3), U.f(env[k].T, 2), U.f(-env[k].C, 2), (d.n === 2 ? "2-" : "") + d.s.name, U.f(u, 2)]);
  });
  r.table(["#", "Member", "L m", "Tmax kN", "Cmax kN", "Section", "Util."], rows);
  r.note("Chords: double angles back-to-back on " + p.gusset + " mm gussets, KL = 0.85L in-plane; out-of-plane length = purlin spacing (top) / bracing spacing (bottom). Webs: single angles, cl 7.5.1.2 (fixed, ≥ 2 bolts/welded). Welded end connections assumed.");
  r.check("All members adequate", !fail, fail ? "increase sizes / reduce span" : "", "IS 800 cl 6, 7");
  var wt2 = wt * 1.10;
  r.row("Truss steel weight (+10% gussets/connections)", U.f(wt2, 1), "kg per truss");
  r.sum("Truss", (fromDxf ? "From DXF" : { pratt: "Pratt", howe: "Howe", fink: "Fink" }[p.type]) + " " + p.span + " m @ " + p.slope + "°");
  if (chosen.top) r.sum("Top chord", "2-" + chosen.top.s.name);
  if (chosen.bot) r.sum("Bottom chord", "2-" + chosen.bot.s.name);
  r.sum("Weight / truss", U.f(wt2, 1) + " kg");
  r.svg = TR.svg(g, env);
  r.res = { g: g, env: env, weight: wt2 };
  return r;
};

TR.svg = function (g, env) {
  var W = 640, Hh = 260, pad = 30, sc = (W - 2 * pad) / g.span, H = g.h * sc + 2 * pad + 20;
  var X = function (x) { return pad + x * sc; }, Y = function (y) { return H - pad - y * sc; };
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;font-family:sans-serif">';
  g.M.forEach(function (m, k) {
    var A = g.N[m.i], B = g.N[m.j], e = env[k], gov = e.T >= -e.C ? "t" : "c";
    var col = gov === "t" ? "#c0392b" : "#1f6fb5";
    s += '<line x1="' + X(A.x) + '" y1="' + Y(A.y) + '" x2="' + X(B.x) + '" y2="' + Y(B.y) + '" stroke="' + col + '" stroke-width="' + (m.g === "web" ? 2 : 3.5) + '"/>';
    var mx = (X(A.x) + X(B.x)) / 2, my = (Y(A.y) + Y(B.y)) / 2;
    s += '<text x="' + mx + '" y="' + (my - 3) + '" font-size="10" text-anchor="middle" fill="#222">' + (k + 1) + '</text>';
  });
  g.N.forEach(function (n) { s += '<circle cx="' + X(n.x) + '" cy="' + Y(n.y) + '" r="3" fill="#333"/>'; });
  [g.sup[0], g.sup[1]].forEach(function (i, k) {
    var x = X(g.N[i].x), y = Y(g.N[i].y);
    s += '<path d="M' + x + ' ' + y + ' l-8 14 h16 z" fill="none" stroke="#333"/>' + (k ? '<line x1="' + (x - 9) + '" y1="' + (y + 18) + '" x2="' + (x + 9) + '" y2="' + (y + 18) + '" stroke="#333"/>' : '');
  });
  s += '<text x="' + pad + '" y="14" font-size="11" fill="#c0392b">■ tension governs</text><text x="' + (pad + 120) + '" y="14" font-size="11" fill="#1f6fb5">■ compression governs</text>';
  return s + '</svg>';
};

if (typeof module !== "undefined") module.exports = TR;
