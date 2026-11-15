/* Reinforcement detailing: beam lines, column stacks, slab panels and isolated footings from the frame & FE design,
   ductile detailing to IS 13920:2016 (zones III-V), detailing rules of IS 456:2000 / SP 34, bar bending schedule (IS 2502).
   Units inside: mm, N, kN, kNm (model coordinates are metres). */
var DT = {};
DT.DIAS = [8, 10, 12, 16, 20, 25, 32];
DT.STOCK = 12000;                       /* stock bar length, mm */
DT.wpm = function (d) { return d * d / 162; };   /* kg per metre */
DT.r = function (x, s) { s = s || 5; return Math.ceil(x / s - 1e-9) * s; };
DT.rf = function (x, s) { s = s || 5; return Math.floor(x / s + 1e-9) * s; };
DT.Ld = function (dia, fy, fck) { return RCC.Ld(dia, fy, fck); };
DT.lap = function (dia, fy, fck) { return DT.r(Math.max(RCC.Ld(dia, fy, fck), 30 * dia), 25); };   /* IS 456 cl 26.2.5.1(c), IS 13920 cl 6.2.6 */
/* cutting length (IS 2502 / SP 34): straight + legs − 2φ per 90° bend; closed hoop with two 135° hooks; crosstie with 135° hooks */
DT.hook = function (d) { return Math.max(10 * d, 75); };   /* 135° hook allowance incl. bend: extension 6φ ≥ 65 mm (IS 13920 cl 4.5) */
DT.cut = function (b) {
  var d = b.dia;
  if (b.shape === "ST") return 2 * (b.A + b.B) + 2 * DT.hook(d) - 12 * d;
  if (b.shape === "CT") return b.A + 2 * DT.hook(d) - 6 * d;
  return b.A + (b.B || 0) + (b.C || 0) - 2 * d * (b.n90 || 0);
};
DT.cfg = function (p) {
  var duct = p.eq !== false && String(p.zone) !== "II", cv = MD.cover(p);
  return { duct: duct, cb: cv.cb, cc: cv.cc, cs: cv.cs, cf: cv.cf, dB: cv.dB, dC: cv.dC, cv: cv, wsm: p.method === "wsm", fck: p.fck, fy: p.fy, sbc: p.sbc > 0 ? p.sbc : 200, Df: p.Df > 0 ? p.Df : 1.5 };
};
/* plan grid: column x and y coordinates → labels 1,2,3 (x) and A,B,C (y); floor levels */
DT.grid = function (m) {
  var xs = [], ys = [];
  function add(a, v) { v = Math.round(v * 1000) / 1000; if (!a.some(function (q) { return Math.abs(q - v) < 0.005; })) a.push(v); }
  m.frames.forEach(function (e) { if (e.type === "column") { var A = m.nodes[e.n1]; add(xs, A.x); add(ys, A.y); } });
  xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
  function idx(a, v) { for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - v) < 0.005) return i; return -1; }
  function letter(i) { var s = ""; i++; while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; }
  var lv = MD.floorLevels(m);
  return { xs: xs, ys: ys, lv: lv, gx: function (x) { var i = idx(xs, x); return i >= 0 ? String(i + 1) : "x" + x.toFixed(2); }, gy: function (y) { var i = idx(ys, y); return i >= 0 ? (m.twoD ? "" : letter(i)) : "y" + y.toFixed(2); },
    lev: function (z) { for (var i = 0; i < lv.length; i++) if (Math.abs(lv[i] - z) < 0.01) return i; return -1; } };
};
/* required tension / compression steel for a design moment (kNm) on b × d: limit state (IS 456 G-1) or working stress (Annex B) */
DT.flex = function (M, b, d, fck, fy, wsm) {
  if (M <= 1e-9) return { t: 0, c: 0 };
  if (wsm) { var w = WS.flex(M, b, d, fck, fy, 1, 50); return { t: w.Ast, c: w.Asc || 0 }; }
  var Mul = RCC.mulim(b, d, fck, fy);
  if (M <= Mul) return { t: RCC.astFlex(M, b, d, fck, fy), c: 0 };
  var dp = 50, xu = RCC.xumax(fy) * d, fsc = RCC.fs(0.0035 * (xu - dp) / xu, fy), fcc = 0.446 * fck;
  var Asc = (M - Mul) * 1e6 / ((fsc - fcc) * (d - dp)), Ast1 = RCC.astFlex(Mul * 0.99999, b, d, fck, fy);
  return { t: Ast1 + Asc * (fsc - fcc) / (0.87 * fy), c: Asc };
};
/* moment of resistance of a singly reinforced section with the bars provided (capacity design, IS 13920 cl 6.3.3) */
DT.Mcap = function (As, b, d, fck, fy) {
  var xu = 0.87 * fy * As / (0.36 * fck * b), xm = RCC.xumax(fy) * d;
  if (xu >= xm) return RCC.mulim(b, d, fck, fy);
  return 0.87 * fy * As * (d - 0.42 * xu) / 1e6;
};
DT.parseBars = function (t) { var m = /(\d+)\s*nos\s*(\d+)/.exec(t || ""); return m ? { n: +m[1], dia: +m[2] } : null; };

/* ------------------------------------------------------------------ BEAM LINES */
/* chain collinear beam elements of the same section into continuous lines, ordered in +x / +y */
DT.lines = function (m) {
  var at = {}, used = {}, lines = [];
  function dir(k) { var e = m.frames[k], A = m.nodes[e.n1], B = m.nodes[e.n2], L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z); return [(B.x - A.x) / L, (B.y - A.y) / L, (B.z - A.z) / L]; }
  function rcBeam(k) { var e = m.frames[k]; return e.type === "beam" && e.sec.kind === "rcc"; }
  m.frames.forEach(function (e, k) { if (rcBeam(k)) [e.n1, e.n2].forEach(function (n) { (at[n] = at[n] || []).push(k); }); });
  function next(k, n) {
    var d = dir(k), s = m.frames[k].sec;
    var c = (at[n] || []).filter(function (j) { if (j === k || used[j]) return false; var q = dir(j), t = s.b === m.frames[j].sec.b && s.D === m.frames[j].sec.D; return t && Math.abs(Math.abs(d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) - 1) < 1e-4; });
    return c.length === 1 ? c[0] : null;
  }
  m.frames.forEach(function (e0, k0) {
    if (!rcBeam(k0) || used[k0]) return;
    used[k0] = 1;
    var seq = [{ k: k0, a: e0.n1, b: e0.n2 }], cur = seq[0], j;
    while ((j = next(cur.k, cur.b)) !== null) { used[j] = 1; var ej = m.frames[j]; cur = ej.n1 === cur.b ? { k: j, a: ej.n1, b: ej.n2 } : { k: j, a: ej.n2, b: ej.n1 }; seq.push(cur); }
    cur = seq[0];
    while ((j = next(cur.k, cur.a)) !== null) { used[j] = 1; var ek = m.frames[j]; cur = ek.n2 === cur.a ? { k: j, a: ek.n1, b: ek.n2 } : { k: j, a: ek.n2, b: ek.n1 }; seq.unshift(cur); }
    var A = m.nodes[seq[0].a], B = m.nodes[seq[seq.length - 1].b];
    if (B.x < A.x - 1e-6 || (Math.abs(B.x - A.x) < 1e-6 && B.y < A.y - 1e-6)) seq = seq.reverse().map(function (it) { return { k: it.k, a: it.b, b: it.a }; });
    seq.forEach(function (it) { it.rev = it.a !== m.frames[it.k].n1; });
    lines.push(seq);
  });
  return lines;
};
/* column (and its section) meeting a node */
DT.colAt = function (m, n) {
  var best = null;
  m.frames.forEach(function (e, k) { if (e.type === "column" && (e.n1 === n || e.n2 === n)) { var below = Math.max(m.nodes[e.n1].z, m.nodes[e.n2].z) <= m.nodes[n].z + 1e-6; if (!best || (below && !best.below)) best = { k: k, sec: e.sec, below: below }; } });
  return best;
};

DT.beams = function (m, S, p, cf, g) {
  var res = S.res, des = S.des, inc = res.incMap || {}, desB = {}, out = [];
  des.beams.forEach(function (r) { desB[r.k] = r; });
  var gcases = ["DL", "LL"].filter(function (c) { return res.cases[c]; });
  DT.lines(m).forEach(function (seq, li) {
    var e0 = m.frames[seq[0].k], sec = e0.sec, b = sec.b, Dd = sec.D, fck = sec.fck, fy = sec.fy, d = Dd - cf.dB, n0 = m.nodes[seq[0].a], n1 = m.nodes[seq[seq.length - 1].b];
    var ux = Math.abs(n1.x - n0.x) >= Math.abs(n1.y - n0.y), z = n0.z;
    /* node positions along the line (mm) */
    var nodes = [seq[0].a].concat(seq.map(function (it) { return it.b; })), pos = [0];
    seq.forEach(function (it, i) { pos.push(pos[i] + m.frames[it.k].L * 1000); });
    /* supports: columns or restrained nodes */
    var sup = [];
    nodes.forEach(function (n, i) {
      var c = DT.colAt(m, n);
      if (c) sup.push({ i: i, n: n, s: pos[i], hc: c.sec.kind === "rcc" || c.sec.b ? (ux ? (c.sec.D || 300) : (c.sec.b || 300)) : 300, col: c });
      else if (m.sup[n]) sup.push({ i: i, n: n, s: pos[i], hc: 0 });
    });
    if (!sup.length) return;
    /* stations: envelope over all combinations, + factored gravity shear */
    var st = [];
    seq.forEach(function (it) {
      var L = m.frames[it.k].L * 1000, s0 = pos[seq.indexOf(it)], loc = [];
      for (var q = 0; q <= 8; q++) loc.push({ s: s0 + (it.rev ? L * (1 - q / 8) : L * q / 8), Mp: 0, Mn: 0, V: 0, T: 0, Vg: 0, k: it.k });
      res.combos.forEach(function (cb) {
        var ic = inc[cb.name] || 1;
        FE.frameDiagram(cb.fr[it.k], 8).forEach(function (pt, q) { var o = loc[q]; o.Mp = Math.max(o.Mp, pt.Mz / ic); o.Mn = Math.max(o.Mn, -pt.Mz / ic); o.V = Math.max(o.V, Math.abs(pt.Vy) / ic); o.T = Math.max(o.T, Math.abs(pt.T) / ic); });
      });
      var vg = loc.map(function () { return 0; });
      gcases.forEach(function (c) { var C = res.cases[c]; FE.frameDiagram(FE.frameForces(m, it.k, C.U, C.lv.qeq[it.k], 0), 8).forEach(function (pt, q) { vg[q] += pt.Vy; }); });
      loc.forEach(function (o, q) { o.Vg = Math.abs(vg[q]) * (cf.wsm ? 1 : 1.2); st.push(o); });
    });
    st.sort(function (a, c) { return a.s - c.s; });
    function req(o) {
      var Mt = o.T * (1 + Dd / b) / 1.7, ft = DT.flex(o.Mn + Mt, b, d, fck, fy, cf.wsm), fb = DT.flex(o.Mp + Mt, b, d, fck, fy, cf.wsm);
      return { top: Math.max(ft.t, fb.c), bot: Math.max(fb.t, ft.c) };
    }
    st.forEach(function (o) { var r = req(o); o.At = r.top; o.Ab = r.bot; });
    var amin = 0.85 * b * d / fy, rmin = cf.duct ? 0.24 * Math.sqrt(fck) / fy * b * d : 0, Lline = pos[pos.length - 1];
    /* spans between supports (+ cantilevers) */
    var spans = [];
    for (var i = 0; i + 1 < sup.length; i++) spans.push({ L: sup[i], R: sup[i + 1], fL: sup[i].s + sup[i].hc / 2, fR: sup[i + 1].s - sup[i + 1].hc / 2 });
    var cantL = sup[0].s > 1 ? { fR: sup[0].s - sup[0].hc / 2, fL: 0, tip: true } : null, cantR = sup[sup.length - 1].s < Lline - 1 ? { fL: sup[sup.length - 1].s + sup[sup.length - 1].hc / 2, fR: Lline, tip: true } : null;
    spans.forEach(function (sp) { sp.Lc = sp.fR - sp.fL; sp.st = st.filter(function (o) { return o.s >= sp.L.s - 1 && o.s <= sp.R.s + 1; }); });
    /* requirement at each support (stations within the column) */
    sup.forEach(function (s) { var near = st.filter(function (o) { return Math.abs(o.s - s.s) <= s.hc / 2 + 1; }); s.At = 0; s.Ab = 0; near.forEach(function (o) { s.At = Math.max(s.At, o.At, o.Mn > 1e-6 ? amin : 0); s.Ab = Math.max(s.Ab, o.Ab); }); });
    /* bar diameter: fewest larger bars that fit in one layer (clear spacing ≥ max(φ, 25 mm), IS 456 cl 26.3.2) */
    var Amax = 0; st.forEach(function (o) { Amax = Math.max(Amax, o.At, o.Ab); }); Amax = Math.max(Amax, amin, rmin);
    var phs = 8, best = null;
    [12, 16, 20, 25].forEach(function (f) {
      var sc = Math.max(f, 25), nmax = Math.floor((b - 2 * cf.cb - 2 * phs + sc) / (f + sc)), n = Math.max(2, Math.ceil(Amax / D.barArea(f) - 1e-9)), sco = n * D.barArea(f) + 15 * n;
      if (n <= nmax && (!best || sco < best.sco)) best = { dia: f, nmax: nmax, sco: sco };
    });
    var layers = 1;
    if (!best) { var sc25 = 25; best = { dia: 25, nmax: Math.floor((b - 2 * cf.cb - 2 * phs + sc25) / (25 + sc25)) }; layers = 2; }
    var dia = best.dia, a = D.barArea(dia), Ld = DT.Ld(dia, fy, fck), lap = DT.lap(dia, fy, fck), ext0 = Math.max(d, 12 * dia), msg = [];
    function nb(A) { return Math.max(0, Math.ceil(A / a - 1e-6)); }
    /* continuous top: 2 bars, ρmin and ¼ of top at the faces (IS 13920 cl 6.2.1, 6.2.4), and the smallest top need inside each span */
    var nct = Math.max(2, nb(rmin));
    spans.forEach(function (sp) { var mid = sp.st.filter(function (o) { return o.s > sp.fL + 0.3 * sp.Lc && o.s < sp.fR - 0.3 * sp.Lc; }), mn = Infinity; mid.forEach(function (o) { mn = Math.min(mn, o.At); }); if (mid.length) nct = Math.max(nct, nb(mn)); });
    sup.forEach(function (s) { s.nt = Math.max(nct, nb(s.At)); });
    if (cf.duct) { var mx = 0; sup.forEach(function (s) { mx = Math.max(mx, s.nt); }); nct = Math.max(nct, Math.ceil(mx / 4)); sup.forEach(function (s) { s.nt = Math.max(s.nt, nct); }); }
    /* continuous bottom: 2 bars, ρmin, ½ top at each face and ¼ of max top (IS 13920 cl 6.2.3, 6.2.4), sagging at faces */
    var ncb = Math.max(2, nb(rmin));
    sup.forEach(function (s) { ncb = Math.max(ncb, nb(s.Ab)); if (cf.duct) ncb = Math.max(ncb, Math.ceil(s.nt / 2)); });
    if (cf.duct) { var mt = 0; sup.forEach(function (s) { mt = Math.max(mt, s.nt); }); ncb = Math.max(ncb, Math.ceil(mt / 4)); }
    /* extra top bars at supports, extended to the cut-off + max(d, 12φ), at least Ld and Lclear/4 */
    sup.forEach(function (s, si) {
      s.nxt = s.nt - nct; s.extL = 0; s.extR = 0;
      if (s.nxt <= 0) return;
      [-1, 1].forEach(function (sg) {
        var sp = sg > 0 ? spans[si] : spans[si - 1], cant = sg > 0 ? (si === sup.length - 1 ? cantR : null) : (si === 0 ? cantL : null);
        if (cant) { s[sg > 0 ? "extR" : "extL"] = "tip"; return; }
        if (!sp) return;
        var face = sg > 0 ? sp.fL : sp.fR, list = sp.st.slice().sort(function (p1, p2) { return sg * (p1.s - p2.s); }), x0 = face;
        for (var q = 0; q < list.length; q++) { var o = list[q]; if (sg * (o.s - face) < 0) continue; if (o.At > nct * a) x0 = o.s; else break; }
        var ext = Math.max(Math.abs(x0 - face) + ext0, Ld, sp.Lc / 4);
        s[sg > 0 ? "extR" : "extL"] = Math.min(DT.r(ext, 50), sp.Lc);
      });
    });
    /* extra bottom bars per span */
    spans.forEach(function (sp) {
      var mxb = 0, xm = (sp.fL + sp.fR) / 2; sp.st.forEach(function (o) { if (o.s > sp.fL && o.s < sp.fR && o.Ab > mxb) { mxb = o.Ab; xm = o.s; } });
      sp.nb = Math.max(ncb, nb(mxb), nb(amin)); sp.nxb = sp.nb - ncb; sp.cL = sp.fL; sp.cR = sp.fR;
      if (sp.nxb > 0) {
        var lim = ncb * a, xl = xm, xr = xm;
        sp.st.forEach(function (o) { if (o.s <= xm && o.s >= sp.fL && Math.max(o.Ab, amin * (o.Mp > 0 ? 1 : 0)) > lim) xl = Math.min(xl, o.s); if (o.s >= xm && o.s <= sp.fR && Math.max(o.Ab, amin * (o.Mp > 0 ? 1 : 0)) > lim) xr = Math.max(xr, o.s); });
        sp.cL = Math.max(sp.fL, DT.rf(Math.min(xl - ext0, xm - Ld), 50)); sp.cR = Math.min(sp.fR, DT.r(Math.max(xr + ext0, xm + Ld), 50));
        if (sp.cL - sp.fL < 100) sp.cL = sp.fL - sp.L.hc / 2; if (sp.fR - sp.cR < 100) sp.cR = sp.fR + sp.R.hc / 2;   /* run into the support to its centre line */
      }
    });
    /* stirrups: 2-legged hoops, 135° hooks; spacing from design (IS 456 cl 40.4/41.4.3), capacity shear and ductile limits */
    var checks = [];
    spans.forEach(function (sp, si) {
      var lh = 2 * d, Asv = 2 * D.barArea(phs);
      function dsv(x0, x1) { var s = Infinity; sp.st.forEach(function (o) { if (o.s >= x0 - 1 && o.s <= x1 + 1) { var r = desB[o.k]; if (r) s = Math.min(s, r.sv === null || r.sv === undefined ? 50 : r.sv); } }); return s; }
      var tL = sup[si].nt * a, tR = sup[si + 1].nt * a, bL = ncb * a, bR = ncb * a;
      var MhL = DT.Mcap(tL, b, d, fck, fy), MsL = DT.Mcap(bL, b, d, fck, fy), MhR = DT.Mcap(tR, b, d, fck, fy), MsR = DT.Mcap(bR, b, d, fck, fy);
      var VgL = 0, VgR = 0; sp.st.forEach(function (o) { if (o.s <= sp.fL + d) VgL = Math.max(VgL, o.Vg); if (o.s >= sp.fR - d) VgR = Math.max(VgR, o.Vg); });
      var Msw = Math.max(MhL + MsR, MsL + MhR), VcL = VgL + 1.4 * Msw / (sp.Lc / 1000), VcR = VgR + 1.4 * Msw / (sp.Lc / 1000);
      var VaL = 0, VaR = 0; sp.st.forEach(function (o) { if (o.s <= sp.fL + lh) VaL = Math.max(VaL, o.V); if (o.s >= sp.fR - lh) VaR = Math.max(VaR, o.V); });
      var cap = cf.duct && !cf.wsm, VuL = cap ? Math.max(VcL, VaL) : VaL, VuR = cap ? Math.max(VcR, VaR) : VaR;
      function sCap(Vu) { return cap ? 0.87 * fy * Asv * d / (Vu * 1000) : Infinity; }      /* concrete contribution ignored in hinge zones (conservative) */
      var lim = cf.duct ? Math.min(d / 4, 6 * dia, 100) : Infinity;
      var sh = DT.rf(Math.min(dsv(sp.fL, sp.fL + lh), dsv(sp.fR - lh, sp.fR), sCap(Math.max(VuL, VuR)), lim, 0.75 * d, 300), 5);
      var sm = DT.rf(Math.min(dsv(sp.fL + lh, sp.fR - lh), cf.duct ? d / 2 : 0.75 * d, 300), 5);
      var ph = phs;
      if (sh < 50) { ph = 10; Asv = 2 * D.barArea(10); sh = DT.rf(Math.min(sh * 157.1 / 100.5, lim), 5); msg.push("Span " + (si + 1) + ": 10 mm hoops needed in the end zones"); }
      sm = Math.max(Math.min(sm, sh * 3), sh);
      sp.sv = { lh: lh, sh: Math.max(sh, 50), sm: Math.max(sm, 50), ph: ph, VuL: VuL, VuR: VuR, VcL: VcL, VcR: VcR, VgL: VgL, VgR: VgR, MhL: MhL, MsL: MsL, MhR: MhR, MsR: MsR, cap: cap };
      /* ductile checks per span */
      if (cf.duct) {
        checks.push({ t: "Width b ≥ 200 mm, b/D ≥ 0.3", ok: b >= 200 && b / Dd >= 0.3, v: b + " mm, " + (b / Dd).toFixed(2), cl: "IS 13920 cl 6.1.1, 6.1.2", sp: si });
        checks.push({ t: "Clear span / depth ≥ 4", ok: sp.Lc / Dd >= 4, v: (sp.Lc / Dd).toFixed(2), cl: "IS 13920 cl 6.1.3", sp: si });
        [[tL, "left"], [tR, "right"]].forEach(function (q) { checks.push({ t: "Bottom ≥ ½ top at " + q[1] + " face", ok: ncb * a >= 0.5 * q[0] - 1e-6, v: (ncb * a).toFixed(0) + " ≥ " + (0.5 * q[0]).toFixed(0) + " mm²", cl: "IS 13920 cl 6.2.3", sp: si }); });
        checks.push({ t: "Top & bottom everywhere ≥ ¼ max top at faces", ok: Math.min(nct, ncb) * a >= 0.25 * Math.max(tL, tR) - 1e-6, v: (Math.min(nct, ncb) * a).toFixed(0) + " ≥ " + (0.25 * Math.max(tL, tR)).toFixed(0) + " mm²", cl: "IS 13920 cl 6.2.4", sp: si });
        checks.push({ t: "ρ ≤ 2.5 % at faces", ok: Math.max(tL, tR) / (b * d) <= 0.025, v: (100 * Math.max(tL, tR) / (b * d)).toFixed(2) + " %", cl: "IS 13920 cl 6.2.2", sp: si });
        checks.push({ t: "ρ ≥ 0.24√fck/fy both faces", ok: Math.min(nct, ncb) * a >= rmin - 1e-6, v: (100 * Math.min(nct, ncb) * a / (b * d)).toFixed(3) + " % ≥ " + (100 * rmin / (b * d)).toFixed(3) + " %", cl: "IS 13920 cl 6.2.1", sp: si });
        checks.push({ t: "End-zone hoops: s ≤ d/4, 6φ, 100 over 2d", ok: sp.sv.sh <= lim + 1e-6, v: sp.sv.ph + "φ @ " + sp.sv.sh + " over " + DT.r(lh, 5) + " mm (limit " + DT.rf(lim, 5) + ")", cl: "IS 13920 cl 6.3.5", sp: si });
        if (cap) checks.push({ t: "Capacity-design shear Vu = 1.2(DL+LL) + 1.4(Mu,h + Mu,s)/Lc", ok: true, v: Math.max(VuL, VuR).toFixed(1) + " kN → s ≤ " + DT.rf(sCap(Math.max(VuL, VuR)), 5) + " mm", cl: "IS 13920 cl 6.3.3", sp: si });
      }
    });
    if (layers > 1 || sup.some(function (s) { return s.nt > best.nmax; }) || spans.some(function (sp) { return sp.nb > best.nmax; })) msg.push("More bars than fit in one layer at some sections: second layer needed (effective depth reduced — check)");
    sup.forEach(function (s) { if (s.col && s.col.sec.kind === "rcc" && cf.duct && Math.min(s.col.sec.b, s.col.sec.D) < 20 * dia) msg.push("Column at support " + (sup.indexOf(s) + 1) + ": dimension < 20 × beam bar φ (" + 20 * dia + " mm), IS 13920 cl 7.1.1"); });
    out.push({ id: li, seq: seq, nodes: nodes, pos: pos, z: z, ux: ux, xy: [n0, n1], b: b, D: Dd, d: d, fck: fck, fy: fy, name: sec.name, sup: sup, spans: spans, cantL: cantL, cantR: cantR, L: Lline,
      dia: dia, a: a, nct: nct, ncb: ncb, Ld: Ld, lap: lap, nmax: best.nmax, amin: amin, rmin: rmin, st: st, checks: checks, msg: msg, phs: phs });
  });
  out.forEach(function (bl) { DT.beamBars(bl, cf); });
  return out;
};
/* bars, laps (stock length) and bar marks for a beam line */
DT.beamBars = function (bl, cf) {
  var dia = bl.dia, sup = bl.sup, c = cf.cb, bars = [], laps = [];
  var s0 = sup[0], s1 = sup[sup.length - 1], Ld = bl.Ld, La = cf.duct ? Ld + 10 * dia - 8 * dia : Ld - 8 * dia;    /* anchorage beyond the inner face, 90° bend credited 8φ (IS 456 cl 26.2.2.1, IS 13920 cl 6.2.5) */
  /* bar ends: inside an end column (to far face − 50) with a 90° bend, or at a cantilever tip */
  function endInfo(side) {
    var s = side < 0 ? s0 : s1, cant = side < 0 ? bl.cantL : bl.cantR;
    if (cant) return { x: side < 0 ? c : bl.L - c, leg: 0, tip: true };
    var hin = Math.max(s.hc - 50, 0), x = side < 0 ? s.s - s.hc / 2 + 50 : s.s + s.hc / 2 - 50;
    return { x: x, leg: DT.r(Math.max(La - hin, 12 * dia), 25), tip: false, hin: hin };
  }
  var eL = endInfo(-1), eR = endInfo(1);
  bl.eL = eL; bl.eR = eR;
  /* splice zones: top bars at mid-span, bottom bars near the quarter span but outside 2d of the faces (IS 13920 cl 6.2.6) */
  function zones(top) {
    return bl.spans.map(function (sp) {
      if (top) return (sp.fL + sp.fR) / 2;
      var x = sp.fL + Math.max(sp.Lc / 4, 2 * bl.d + bl.lap / 2 + 50);
      return x + bl.lap / 2 < sp.fR - 2 * bl.d ? x : (sp.fL + sp.fR) / 2;
    });
  }
  function split(top) {
    var z = zones(top), pieces = [], a = eL.x, legA = eL.leg, guard = 0;
    while (guard++ < 50) {
      var rem = eR.x - a + legA + eR.leg;
      if (rem <= DT.STOCK) { pieces.push({ x0: a, x1: eR.x, l0: legA, l1: eR.leg }); break; }
      var cand = z.filter(function (zc) { return zc - bl.lap / 2 > a + 500 && zc + bl.lap / 2 - a + legA <= DT.STOCK; });
      var zc = cand.length ? cand[cand.length - 1] : a + DT.STOCK - legA - bl.lap / 2;
      if (!cand.length) bl.msg.push((top ? "Top" : "Bottom") + " bars: no permitted splice zone within 12 m — splice placed at " + (zc / 1000).toFixed(2) + " m (check)");
      pieces.push({ x0: a, x1: zc + bl.lap / 2, l0: legA, l1: 0 });
      laps.push({ top: top, x0: zc - bl.lap / 2, x1: zc + bl.lap / 2 });
      a = zc - bl.lap / 2; legA = 0;
    }
    return pieces;
  }
  var mk = 0;
  function mark() { return String.fromCharCode(97 + (mk % 26)) + (mk++ >= 26 ? Math.floor(mk / 26) : ""); }
  function add(o) { o.B = o.B || 0; o.C = o.C || 0; o.mark = mark(); o.L = DT.cut(o); bars.push(o); return o; }
  function piece(pc, top, n, desc) {
    var A = DT.r(pc.x1 - pc.x0, 5), nb = (pc.l0 ? 1 : 0) + (pc.l1 ? 1 : 0);
    return add({ desc: desc, pos: top ? "T" : "B", dia: dia, n: n, shape: nb === 2 ? "U" : nb === 1 ? "L" : "S", A: A, B: pc.l0 || pc.l1 || 0, C: nb === 2 ? pc.l1 : 0, n90: nb, x0: pc.x0, x1: pc.x1, l0: pc.l0, l1: pc.l1 });
  }
  split(true).forEach(function (pc) { piece(pc, true, bl.nct, "Top, continuous"); });
  split(false).forEach(function (pc) { piece(pc, false, bl.ncb, "Bottom, continuous"); });
  sup.forEach(function (s, si) {
    if (s.nxt <= 0) return;
    var x0, x1, l0 = 0, l1 = 0;
    if (si === 0 && !bl.cantL) { x0 = eL.x; l0 = eL.leg; } else x0 = s.extL === "tip" ? c : s.s - s.hc / 2 - s.extL;
    if (si === sup.length - 1 && !bl.cantR) { x1 = eR.x; l1 = eR.leg; } else x1 = s.extR === "tip" ? bl.L - c : s.s + s.hc / 2 + s.extR;
    piece({ x0: x0, x1: x1, l0: l0, l1: l1 }, true, s.nxt, "Top, extra at support " + (si + 1)).sup = si;
  });
  bl.spans.forEach(function (sp, si) { if (sp.nxb > 0) piece({ x0: sp.cL, x1: sp.cR, l0: 0, l1: 0 }, false, sp.nxb, "Bottom, extra span " + (si + 1)).span = si; });
  /* hoop positions per span (and cantilevers) */
  var hp = [];
  function hoops(x0, x1, sv, tag) {
    var xs = [], x = x0 + 50, lh = sv.lh;
    function inLap(x) { return laps.some(function (l) { return x >= l.x0 - 1 && x <= l.x1 + 1; }); }
    while (x <= x1 - 50 + 1) {
      xs.push(x);
      var s = (x < x0 + lh || x > x1 - lh) ? sv.sh : sv.sm;
      if (cf.duct && inLap(x)) s = Math.min(s, 150);
      x += s;
    }
    if (xs.length && x1 - 50 - xs[xs.length - 1] > 1) xs.push(x1 - 50);
    hp.push({ tag: tag, xs: xs, ph: sv.ph });
    return xs.length;
  }
  bl.spans.forEach(function (sp, si) { sp.nh = hoops(sp.fL, sp.fR, sp.sv, si); });
  [bl.cantL, bl.cantR].forEach(function (ct) { if (ct) { var sv = { lh: 2 * bl.d, sh: Math.min(bl.spans[0] ? bl.spans[0].sv.sh : 100, 100), sm: Math.min(bl.spans[0] ? bl.spans[0].sv.sm : 150, 150), ph: bl.phs }; ct.sv = sv; ct.nh = hoops(ct.fL, ct.fR, sv, "c"); } });
  var nH = 0, phH = bl.phs; hp.forEach(function (h) { nH += h.xs.length; phH = Math.max(phH, h.ph); });
  add({ desc: "Hoops, 2-legged, 135° hooks", pos: "S", dia: phH, n: nH, shape: "ST", A: bl.b - 2 * c, B: bl.D - 2 * c, n90: 3 });
  if (bl.D > 750) {   /* side-face bars, IS 456 cl 26.5.1.3: 0.1 % of web area split on both faces, spacing ≤ 300 */
    var nside = Math.max(1, Math.ceil((bl.D - 2 * c - 100) / 300) - 1);
    add({ desc: "Side-face bars (D > 750 mm), each face", pos: "SF", dia: 12, n: 2 * nside, shape: "S", A: DT.r(eR.x - eL.x, 5), n90: 0 });
  }
  bl.bars = bars; bl.laps = laps; bl.hoops = hp;
  bl.wt = 0; bars.forEach(function (q) { bl.wt += q.n * q.L / 1000 * DT.wpm(q.dia); });
  /* signature for grouping identical lines */
  bl.sig = [bl.b, bl.D, bl.fck, bl.fy, Math.round(bl.L), bl.sup.map(function (s) { return Math.round(s.s) + ":" + s.hc; }).join(","), bars.map(function (q) { return q.dia + "x" + q.n + "x" + Math.round(q.L) + q.shape; }).join(",")].join("|");
};

/* ------------------------------------------------------------------ COLUMNS */
/* bars around the perimeter: nB bars on each b-face (incl. corners), nD on each D-face; D runs along global X */
DT.arrange = function (n, b, Dd) {
  n = Math.max(4, n + (n % 2));
  var ex = (n - 4) / 2, eb = Math.round(ex * b / (b + Dd)), ed = ex - eb;
  return { n: 2 * (eb + 2) + 2 * ed, nB: eb + 2, nD: ed + 2 };
};
DT.columns = function (m, S, p, cf, g, beams, foot) {
  var des = S.des, desC = {}, out = [], lv = g.lv, stacks = {};
  des.cols.forEach(function (r) { desC[r.k] = r; });
  m.frames.forEach(function (e, k) {
    if (e.type !== "column" || e.sec.kind !== "rcc") return;
    var A = m.nodes[e.n1], B = m.nodes[e.n2], key = Math.round(A.x * 100) + "," + Math.round(A.y * 100);
    (stacks[key] = stacks[key] || []).push({ k: k, z0: Math.min(A.z, B.z), z1: Math.max(A.z, B.z), nb: A.z < B.z ? e.n1 : e.n2, nt: A.z < B.z ? e.n2 : e.n1 });
  });
  /* deepest beam meeting a node (for the clear height and joint) */
  var bD = {};
  beams.forEach(function (bl) { bl.nodes.forEach(function (n) { bD[n] = Math.max(bD[n] || 0, bl.D); }); });
  Object.keys(stacks).forEach(function (key) {
    var els = stacks[key].sort(function (a, c) { return a.z0 - c.z0; }), x = m.nodes[els[0].nb].x, y = m.nodes[els[0].nb].y;
    /* storeys between floor levels */
    var zb = els[0].z0, zt = els[els.length - 1].z1, ls = lv.filter(function (z) { return z >= zb - 0.01 && z <= zt + 0.01; });
    if (ls.length < 2) ls = [zb, zt];
    var st = [];
    for (var i = 0; i + 1 < ls.length; i++) {
      var ee = els.filter(function (q) { return q.z0 >= ls[i] - 0.01 && q.z1 <= ls[i + 1] + 0.01; });
      if (!ee.length) continue;
      var sec = m.frames[ee[0].k].sec, Areq = 0.008 * sec.b * sec.D, fail = false, Pmax = 0, Pmin = Infinity;
      ee.forEach(function (q) {
        var r = desC[q.k]; if (!r) return;
        if (!r.ok || !r.need) { fail = true; Areq = Math.max(Areq, 0.04 * sec.b * sec.D); return; }
        Areq = Math.max(Areq, r.need.As);
      });
      /* axial load range at the ends, all combinations (for strong-column/weak-beam and shear) */
      ee.forEach(function (q) { S.res.combos.forEach(function (cb) { var ic = (S.res.incMap || {})[cb.name] || 1; FE.frameDiagram(cb.fr[q.k], 8).forEach(function (pt, j) { if (j === 0 || j === 8) { Pmax = Math.max(Pmax, -pt.N / ic); Pmin = Math.min(Pmin, -pt.N / ic); } }); }); });
      var nTop = ee[ee.length - 1].nt, nBot = ee[0].nb;
      st.push({ i: i, z0: ls[i] * 1000, z1: ls[i + 1] * 1000, h: (ls[i + 1] - ls[i]) * 1000, b: sec.b, D: sec.D, fck: sec.fck, fy: sec.fy, Areq: Areq, fail: fail, els: ee.map(function (q) { return q.k; }), nTop: nTop, nBot: nBot, Db: bD[nTop] || 0, Pmax: Pmax, Pmin: Pmin === Infinity ? 0 : Pmin, name: sec.name });
    }
    if (!st.length) return;
    var base = els[0].nb, top = st[st.length - 1];
    out.push({ key: key, x: x, y: y, name: "C-" + g.gy(y) + g.gx(x), st: st, base: base, foot: foot ? foot.filter(function (f) { return f.n === base; })[0] || null : null, sup: !!m.sup[base] });
  });
  out.forEach(function (c) { DT.colDetail(c, cf); });
  return out;
};
DT.colDetail = function (col, cf) {
  var cc = cf.cc, bars = [], ties = [], msg = [], checks = [], mk = 0;
  function mark() { return String.fromCharCode(97 + (mk % 26)) + (mk++ >= 26 ? Math.floor(mk / 26) : ""); }
  function add(o) { o.B = o.B || 0; o.C = o.C || 0; o.mark = mark(); o.L = DT.cut(o); bars.push(o); return o; }
  var st = col.st;
  /* arrangement per storey, with legs (hoop + crossties) so that parallel legs are ≤ 300 mm apart (IS 13920 cl 7.4) and alternate bars are restrained (IS 456 cl 26.5.3.2) */
  st.forEach(function (s) {
    var b = s.b, Dd = s.D, hb = b - 2 * cc, hd = Dd - 2 * cc, best = null;
    function legs(core, nface) { var nl = Math.max(2, 1 + Math.ceil((nface - 1) / 2)); if (cf.duct) nl = Math.max(nl, Math.ceil(core / 300 - 1e-9) + 1); return nl; }
    /* choose φ and count: area ≥ required, bar spacing ≤ 300 (IS 456 cl 26.5.3.1 g), a bar at every hoop/crosstie leg (legs ≤ 300 apart, IS 13920 cl 7.4; alternate bars restrained, IS 456 cl 26.5.3.2) */
    [12, 16, 20, 25, 32].forEach(function (f) {
      var a = D.barArea(f), n = Math.max(4, Math.ceil(s.Areq / a - 1e-9)), ar, lB, lD, nB, nD;
      for (var it = 0; it < 30; it++) {
        ar = DT.arrange(n, b, Dd);
        lB = legs(hb, ar.nB); lD = legs(hd, ar.nD);
        nB = Math.max(ar.nB, lB, Math.ceil((hb - 16 - f) / 300 - 1e-9) + 1); nD = Math.max(ar.nD, lD, Math.ceil((hd - 16 - f) / 300 - 1e-9) + 1);
        lB = legs(hb, nB); lD = legs(hd, nD);
        if (2 * nB + 2 * nD - 4 <= n + (n % 2)) break; n = 2 * nB + 2 * nD - 4;
      }
      var nn = 2 * nB + 2 * nD - 4, clr = Math.min((hb - 16 - f) / (nB - 1), (hd - 16 - f) / (nD - 1)) - f;
      if (clr < 40) return;    /* clear spacing ≥ 40 mm to allow laps and concreting */
      var sco = nn * a + 15 * nn;
      if (!best || sco < best.sco) best = { sco: sco, nB: nB, nD: nD, n: nn, dia: f, lB: lB, lD: lD };
    });
    if (!best) { best = { nB: 4, nD: 4, n: 12, dia: 32, lB: 3, lD: 3 }; msg.push("Storey " + (s.i + 1) + ": bars do not fit — enlarge section"); }
    var dia = best.dia;
    s.ar = { nB: best.nB, nD: best.nD, n: best.n, dia: dia, lB: best.lB, lD: best.lD };
    var lB = best.lB, lD = best.lD;
    s.As = s.ar.n * D.barArea(dia);
    var pct = 100 * s.As / (b * Dd); s.pct = pct;
    /* ties: diameter ≥ φ/4, ≥ 8 mm; confining zone lo, spacing; Ash (IS 13920 cl 8.1) */
    var pt = Math.max(8, DT.DIAS.filter(function (q) { return q >= dia / 4; })[0] || 8), Lc = s.h - s.Db, lo = DT.r(Math.max(Math.max(b, Dd), Lc / 6, 450), 25);
    var smin = Math.min(b, Dd), sc = cf.duct ? DT.rf(Math.min(smin / 4, 6 * dia, 100), 5) : null, smid = DT.rf(cf.duct ? Math.min(smin / 2, 16 * dia, 300) : Math.min(smin, 16 * dia, 300), 5);
    var Ag = b * Dd, Ak = hb * hd, hleg = Math.max(hb / (lB - 1), hd / (lD - 1)) + pt;
    function ash(s0, ph) { return Math.max(0.18 * s0 * hleg * s.fck / s.fy * (Ag / Ak - 1), 0.05 * s0 * hleg * s.fck / s.fy); }
    if (cf.duct) { var guard = 0; while (ash(sc, pt) > D.barArea(pt) && guard++ < 40) { if (pt < 10) pt = 10; else sc -= 5; } sc = Math.max(sc, 50); }
    /* column shear (capacity, IS 13920 cl 7.5): Vu = 1.4 (Mu,top + Mu,bot) / Lc with the moment capacity at Pmin..Pmax */
    var dc = cf.dC || 50, Mc = Math.min(RCC.colMcap(b, Dd, s.As, Math.max(s.Pmin, 0), s.fck, s.fy, dc, "four"), RCC.colMcap(b, Dd, s.As, Math.max(s.Pmax, 0), s.fck, s.fy, dc, "four"));
    var Mc2 = Math.min(RCC.colMcap(Dd, b, s.As, Math.max(s.Pmin, 0), s.fck, s.fy, dc, "four"), RCC.colMcap(Dd, b, s.As, Math.max(s.Pmax, 0), s.fck, s.fy, dc, "four"));
    s.McX = Mc; s.McY = Mc2;
    var Vu = cf.duct ? 1.4 * 2 * Math.max(Mc, Mc2) / (Lc / 1000) : 0, dd = Math.max(b, Dd) - (cf.dC || 50), bw = Math.min(b, Dd), tc = RCC.tauc(s.fck, Math.min(100 * s.As / 2 / (bw * dd), 3));
    var Asv = Math.min(lB, lD) * D.barArea(pt), Vus = Vu * 1000 - tc * bw * dd, sV = Vus > 0 ? DT.rf(0.87 * s.fy * Asv * dd / Vus, 5) : Infinity;
    smid = Math.max(50, Math.min(smid, sV)); if (sc) sc = Math.min(sc, Math.max(sV, 50));
    s.tie = { dia: pt, lo: lo, sc: sc, sm: smid, slap: cf.duct ? Math.min(smid, 150) : smid, lB: lB, lD: lD, Ash: cf.duct ? ash(sc, pt) : 0, hleg: hleg, Ag: Ag, Ak: Ak, Vu: Vu, sV: sV, Lc: Lc };
    if (cf.duct) {
      checks.push({ t: "Least dimension ≥ 300 mm", ok: smin >= 300, v: smin + " mm", cl: "IS 13920 cl 7.1.1", st: s.i });
      checks.push({ t: "b/D ≥ 0.4", ok: smin / Math.max(b, Dd) >= 0.4, v: (smin / Math.max(b, Dd)).toFixed(2), cl: "IS 13920 cl 7.1.2", st: s.i });
      checks.push({ t: "Confining length lo = max(D, Lc/6, 450)", ok: true, v: lo + " mm (Lc = " + DT.r(Lc, 5) + ")", cl: "IS 13920 cl 8.1(a)", st: s.i });
      checks.push({ t: "Confining hoops s ≤ min(B/4, 6φ, 100)", ok: sc <= Math.min(smin / 4, 6 * dia, 100) + 1e-6, v: pt + "φ @ " + sc, cl: "IS 13920 cl 8.1(b)", st: s.i });
      checks.push({ t: "Ash = max(0.18 s h fck/fy (Ag/Ak−1), 0.05 s h fck/fy) ≤ hoop bar area", ok: ash(sc, pt) <= D.barArea(pt) + 1e-6, v: ash(sc, pt).toFixed(1) + " ≤ " + D.barArea(pt).toFixed(1) + " mm² (h = " + hleg.toFixed(0) + ")", cl: "IS 13920 cl 8.1(c)", st: s.i });
      checks.push({ t: "Parallel hoop legs ≤ 300 mm apart", ok: Math.max(hb / (lB - 1), hd / (lD - 1)) <= 300 + 1e-6, v: Math.max(hb / (lB - 1), hd / (lD - 1)).toFixed(0) + " mm (" + lB + " × " + lD + " legs)", cl: "IS 13920 cl 7.4", st: s.i });
      checks.push({ t: "Shear: Vu = 1.4(Mu,top + Mu,bot)/Lc", ok: sV >= 50, v: Vu.toFixed(1) + " kN → s ≤ " + (isFinite(sV) ? sV : "—") + " mm", cl: "IS 13920 cl 7.5", st: s.i });
    }
    checks.push({ t: "Longitudinal steel 0.8 % – 4 %", ok: pct >= 0.8 - 1e-6 && pct <= 4, v: s.ar.n + "-" + dia + "φ = " + pct.toFixed(2) + " %", cl: "IS 456 cl 26.5.3.1", st: s.i });
    if (s.fail) msg.push("Storey " + (s.i + 1) + ": column design failed — detailing shown at 4 %, enlarge the section");
    if (pct > 4 + 1e-6) msg.push("Storey " + (s.i + 1) + ": steel " + pct.toFixed(2) + " % > 4 % — enlarge the section");
  });
  /* longitudinal bars: one piece per storey, lapped in the central half of the next storey (IS 13920 cl 7.2.1; IS 456 cl 26.2.5) */
  var pieces = [], laps = [];
  st.forEach(function (s, i) {
    var nx = st[i + 1], ar = nx && nx.As > s.As ? nx.ar : s.ar, dia = ar.dia, lap = DT.lap(dia, s.fy, s.fck);
    var z0 = i === 0 ? null : laps[i - 1].z0, piece = { i: i, ar: ar, dia: dia, n: ar.n };
    if (i === 0) {   /* starter into the footing: down to the footing mesh with a 90° bend */
      var Df = col.foot ? col.foot.D : 600, fb = col.foot ? col.foot.dia : 12;
      piece.zb = s.z0 - (Df - cf.cf - 2 * fb - dia / 2); piece.legB = DT.r(Math.max(12 * dia, 150), 25);
    } else piece.zb = z0;
    if (nx) {
      var lp = DT.lap(Math.min(dia, nx.ar.dia), nx.fy, nx.fck), mid = nx.z0 + nx.h / 2;
      laps.push({ i: i + 1, z0: mid - lp / 2, z1: mid + lp / 2, lap: lp });
      if (lp > (nx.h - nx.Db) / 2) msg.push("Lap " + lp + " mm longer than half the clear height of storey " + (i + 2) + " (IS 13920 cl 7.2.1) — use mechanical couplers or smaller bars");
      piece.zt = mid + lp / 2; piece.legT = 0;
    } else {         /* top: into the roof beam with a 90° bend, Ld from the beam soffit (IS 456 cl 26.2) */
      var Ld = DT.Ld(dia, s.fy, s.fck), vin = Math.max(s.Db, 300) - cc;
      piece.zt = s.z1 - cc; piece.legT = DT.r(Math.max(12 * dia, Ld - vin - 8 * dia), 25);
    }
    pieces.push(piece);
  });
  pieces.forEach(function (pc) {
    var nb = (pc.legB ? 1 : 0) + (pc.legT ? 1 : 0), A = DT.r(pc.zt - pc.zb, 5);
    var o = add({ desc: pc.i === 0 ? "Longitudinal, storey 1 (starter from footing)" : "Longitudinal, storey " + (pc.i + 1), pos: "L", dia: pc.dia, n: pc.n, shape: nb === 2 ? "U" : nb ? "L" : "S", A: A, B: pc.legB || pc.legT || 0, C: nb === 2 ? pc.legT : 0, n90: nb, zb: pc.zb, zt: pc.zt });
    if (o.L > DT.STOCK) msg.push("Bar " + o.mark + " longer than 12 m stock — add a splice");
  });
  /* tie positions per storey: confining zones at both ends + through the joint, laps at ≤ 150 */
  st.forEach(function (s, i) {
    var t = s.tie, zs = [], z = s.z0 + 50, zt = s.z1 - (i === st.length - 1 ? 50 : 0), soff = s.z1 - s.Db;
    function lapAt(z) { return laps.some(function (l) { return z >= l.z0 && z <= l.z1; }); }
    if (i === 0 && cf.duct) { for (var zf = s.z0 - 300; zf < s.z0; zf += t.sc) zs.push(zf); }   /* 300 mm into the footing (IS 13920 cl 8.1) */
    while (z <= zt - 1e-6) {
      zs.push(z);
      var conf = cf.duct && (z < s.z0 + t.lo || z > soff - t.lo), sp = conf ? t.sc : t.sm;
      if (lapAt(z)) sp = Math.min(sp, t.slap);
      if (z >= soff && cf.duct) sp = t.sc;      /* through the joint */
      z += sp;
    }
    s.tz = zs;
    var hb = s.b - 2 * cc, hd = s.D - 2 * cc;
    add({ desc: "Hoops storey " + (i + 1) + ", 135° hooks", pos: "T", dia: t.dia, n: zs.length, shape: "ST", A: hb, B: hd, n90: 3, st: i });
    if (t.lB > 2) add({ desc: "Crossties storey " + (i + 1) + " (parallel to D)", pos: "T", dia: t.dia, n: zs.length * (t.lB - 2), shape: "CT", A: hd, n90: 0, st: i });
    if (t.lD > 2) add({ desc: "Crossties storey " + (i + 1) + " (parallel to b)", pos: "T", dia: t.dia, n: zs.length * (t.lD - 2), shape: "CT", A: hb, n90: 0, st: i });
  });
  col.bars = bars; col.laps = laps; col.pieces = pieces; col.msg = msg; col.checks = checks;
  col.wt = 0; bars.forEach(function (q) { col.wt += q.n * q.L / 1000 * DT.wpm(q.dia); });
  col.sig = st.map(function (s) { return [s.b, s.D, Math.round(s.h), s.ar.n, s.ar.dia, s.tie.dia, s.tie.sc, s.tie.sm, s.tie.lB, s.tie.lD].join(","); }).join("|") + "|" + bars.map(function (q) { return q.n + "x" + Math.round(q.L); }).join(",") + (col.foot ? "|f" + col.foot.sig : "");
};
/* strong column – weak beam at every joint below the roof (IS 13920 cl 7.2.1): ΣMc ≥ 1.4 ΣMb in each direction */
DT.scwb = function (m, cols, beams) {
  var byNode = {};
  beams.forEach(function (bl) { bl.sup.forEach(function (s, si) { (byNode[s.n] = byNode[s.n] || []).push({ bl: bl, si: si }); }); });
  var out = [];
  cols.forEach(function (c) {
    c.st.forEach(function (s, i) {
      var above = c.st[i + 1]; if (!above) return;
      var n = s.nTop, list = byNode[n] || [];
      [0, 1].forEach(function (dir) {
        var Mb = 0, cnt = 0;
        list.filter(function (q) { return q.bl.ux === (dir === 0); }).forEach(function (q) {
          var bl = q.bl, sp = bl.sup[q.si], a = bl.a, tL = sp.nt * a, bb = bl.ncb * a, d = bl.d;
          var hasL = q.si > 0 || !!bl.cantL, hasR = q.si < bl.sup.length - 1 || !!bl.cantR;
          var Mh = DT.Mcap(tL, bl.b, d, bl.fck, bl.fy), Ms = DT.Mcap(bb, bl.b, d, bl.fck, bl.fy);
          Mb += Math.max((hasL ? Mh : 0) + (hasR ? Ms : 0), (hasL ? Ms : 0) + (hasR ? Mh : 0)); cnt++;
        });
        if (!cnt || Mb <= 0) return;
        var Mc = dir === 0 ? s.McX + above.McX : s.McY + above.McY;
        out.push({ col: c.name, z: s.z1 / 1000, dir: dir ? "Y" : "X", Mc: Mc, Mb: Mb, r: Mc / Mb, ok: Mc >= 1.4 * Mb, colRef: c });
      });
    });
  });
  return out;
};

/* beam–column joints (IS 13920:2016 cl 9): Vj = 1.25fy(Ast,top + Ast,bot) − Vcol, Vcol = (Mo,L + Mo,R)/hst with beam moments at 1.25fy;
   capacity 1.5/1.2/1.0·√fck·Aej for joints confined on four faces / three or two opposite faces / others; Aej = bj·hc, bj = min(bc, bb + hc) */
DT.joints = function (m, cols, beams) {
  var byNode = {}, out = [];
  beams.forEach(function (bl) { bl.sup.forEach(function (s, si) { (byNode[s.n] = byNode[s.n] || []).push({ bl: bl, si: si }); }); });
  cols.forEach(function (c) {
    c.st.forEach(function (s, i) {
      var n = s.nTop, list = byNode[n] || [], above = c.st[i + 1], hst = (above ? (s.h + above.h) / 2 : s.h) / 1000;
      /* faces covered by beams at least 3/4 of the column face width */
      var faces = 0;
      list.forEach(function (q) {
        var bl = q.bl, face = bl.ux ? s.b : s.D, wide = bl.b >= 0.75 * face;
        if (q.si > 0 || bl.cantL) faces += wide ? 1 : 0;
        if (q.si < bl.sup.length - 1 || bl.cantR) faces += wide ? 1 : 0;
      });
      [0, 1].forEach(function (dir) {
        var bls = list.filter(function (q) { return q.bl.ux === (dir === 0); });
        if (!bls.length) return;
        var hc = dir === 0 ? s.D : s.b, bc = dir === 0 ? s.b : s.D, best = null;
        bls.forEach(function (q) {
          var bl = q.bl, sp = bl.sup[q.si], a = bl.a, At = sp.nt * a, Ab = bl.ncb * a, hasL = q.si > 0 || !!bl.cantL, hasR = q.si < bl.sup.length - 1 || !!bl.cantR;
          function Mo(As) { var T = 1.25 * bl.fy * As, x = T / (0.36 * bl.fck * bl.b); return T * (bl.d - 0.42 * Math.min(x, bl.d)) / 1e6; }
          /* two sway senses: hogging on the left + sagging on the right, and the reverse */
          [[hasL, hasR], [hasR, hasL]].forEach(function (pr) {
            var T1 = pr[0] ? 1.25 * bl.fy * At / 1000 : 0, C2 = pr[1] ? 1.25 * bl.fy * Ab / 1000 : 0;
            var Vcol = ((pr[0] ? Mo(At) : 0) + (pr[1] ? Mo(Ab) : 0)) / hst, Vj = T1 + C2 - Vcol;
            if (!best || Vj > best.Vj) best = { Vj: Vj, T1: T1, C2: C2, Vcol: Vcol, bb: bl.b, dia: bl.dia };
          });
        });
        var bj = Math.min(bc, best.bb + hc), Aej = bj * hc, k = faces >= 4 ? 1.5 : faces === 3 || (faces === 2 && opposite()) ? 1.2 : 1.0;
        function opposite() { var lx = list.filter(function (q) { return q.bl.ux; }).length, ly = list.length - lx; return (lx && !ly) || (ly && !lx); }
        var cap = k * Math.sqrt(s.fck) * Aej / 1000, fy0 = best.dia;
        out.push({ col: c.name, colRef: c, z: s.z1 / 1000, dir: dir ? "Y" : "X", faces: faces, k: k, bj: bj, hc: hc, Aej: Aej, Vj: best.Vj, T1: best.T1, C2: best.C2, Vcol: best.Vcol, cap: cap, r: best.Vj / cap, ok: best.Vj <= cap, anch: hc >= 20 * fy0, dia: fy0, fck: s.fck });
      });
    });
  });
  return out;
};

/* ------------------------------------------------------------------ ISOLATED FOOTINGS */
/* size from service loads (DL+LL; DL+LL±EQ with the IS 1893 Table 1 increase in allowable pressure), depth and steel from
   the factored pressures (IS 456 cl 34): bending at the column face, one-way shear at d, punching at d/2, bearing. */
DT.footings = function (m, S, p, cf, g) {
  var res = S.res, cr = res.caseReac || {}, out = [], fck = p.fck, fy = p.fy, q = cf.sbc;
  var incr = { I: 1.5, II: 1.25, III: 1.0 }[String(p.soil)] || 1.25;
  var lat = MD.lateralSets(res.cases).filter(function (Ls) { return /^EQ/.test(Ls.name); });
  Object.keys(m.sup).forEach(function (ns) {
    var n = +ns, c = DT.colAt(m, n); if (!c || c.sec.kind !== "rcc" || !cr.DL) return;
    var a = c.sec.D / 1000, bc = c.sec.b / 1000;     /* column D along X, b along Y (m) */
    function R(name) { return cr[name] && cr[name][n] ? cr[name][n] : [0, 0, 0, 0, 0, 0]; }
    /* imposed-load reduction for the floors carried (IS 875 Pt 2 cl 3.2.1, Table 3) */
    var nfl = 0; m.frames.forEach(function (e) { if (e.type === "column") { var a0 = m.nodes[e.n1], b0 = m.nodes[e.n2]; if (Math.abs(a0.x - m.nodes[n].x) < 0.01 && Math.abs(a0.y - m.nodes[n].y) < 0.01) nfl = Math.max(nfl, g.lev(Math.max(a0.z, b0.z))); } });
    var red = p.llRed ? (nfl <= 1 ? 0 : nfl === 2 ? 0.1 : nfl === 3 ? 0.2 : nfl === 4 ? 0.3 : nfl <= 10 ? 0.4 : 0.5) : 0;
    var G = [0, 1, 2, 3, 4, 5].map(function (t) { return R("DL")[t] + (1 - red) * R("LL")[t]; }), sets = [{ name: "DL+" + (red ? (1 - red).toFixed(1) + "LL" : "LL"), r: G, lim: q }];
    lat.forEach(function (Ls) {
      var E = [0, 0, 0, 0, 0, 0]; Object.keys(Ls.f).forEach(function (cn) { var r = R(cn); for (var t = 0; t < 6; t++) E[t] += Ls.f[cn] * r[t]; });
      [1, -1].forEach(function (sg) { sets.push({ name: "DL+LL" + (sg > 0 ? "+" : "−") + Ls.name, r: G.map(function (v, t) { return v + sg * E[t]; }), lim: q * incr }); });
    });
    if (S.se && S.se.env) Object.keys(S.se.env).forEach(function (d) {
      var E = S.se.env[d].reac[n]; if (!E) return;
      [1, -1].forEach(function (sg) { sets.push({ name: "DL+LL" + (sg > 0 ? "+" : "−") + "RS" + (+d ? "Y" : "X"), r: G.map(function (v, t) { return v + sg * Math.abs(E[t]); }), lim: q * incr }); });
    });
    /* pressure under a rigid footing Lx × Ly with P and moments about X (Mx → varies along Y) and Y */
    function press(r, Lx, Ly, sw) { var P = r[2] * (sw ? 1.1 : 1), Mx = Math.abs(r[3]), My = Math.abs(r[4]), A = Lx * Ly; return { P: P, max: P / A + 6 * Mx / (Lx * Ly * Ly) + 6 * My / (Ly * Lx * Lx), min: P / A - 6 * Mx / (Lx * Ly * Ly) - 6 * My / (Ly * Lx * Lx) }; }
    var Lx = Math.max(a + 0.3, Math.sqrt(Math.max(G[2], 1) * 1.1 / q)), Ly = Lx - a + bc; Lx = DT.r(Lx * 1000, 50) / 1000; Ly = DT.r(Math.max(Ly, bc + 0.3) * 1000, 50) / 1000;
    var gov = null, guard = 0;
    while (guard++ < 200) {
      gov = null; var ok = true;
      sets.forEach(function (st) { var pr = press(st.r, Lx, Ly, true), u = pr.max / st.lim; if (!gov || u > gov.u) gov = { u: u, set: st, pr: pr }; if (u > 1 + 1e-9) ok = false; if (st.name === "DL+LL" && pr.min < -1e-9) ok = false; });
      if (ok) break; Lx = Math.round(Lx * 100 + 5) / 100; Ly = Math.round(Ly * 100 + 5) / 100;
    }
    /* factored net upward pressure (self weight excluded) */
    var qu = 0, gq = "";
    var llr = R("LL");
    if (!cf.wsm) res.combos.forEach(function (cb, ci) { if (!cb.reac || !cb.reac[n]) return; var fl0 = (((S.cb || [])[ci] || {}).f || {}).LL || 0, rr = cb.reac[n].map(function (v, t) { return v - red * fl0 * llr[t]; }), pr = press(rr, Lx, Ly, false); if (pr.max > qu) { qu = pr.max; gq = cb.name; } });
    else sets.forEach(function (st) { var f = st.name === "DL+LL" ? 1.5 : 1.2, pr = press(st.r, Lx, Ly, false); if (f * pr.max > qu) { qu = f * pr.max; gq = f + "(" + st.name + ")"; } });
    var cx = (Lx - a) / 2, cy = (Ly - bc) / 2, dia = 12, d = 150, Ast = [0, 0], tv = [0, 0], tc = [0, 0], tp = 0, kp = 0, ok2 = false;
    for (var it = 0; it < 120 && !ok2; it++) {
      var Mux = qu * Ly * cx * cx / 2, Muy = qu * Lx * cy * cy / 2;      /* about the column faces; bars along X resist Mux */
      var Dtot = d + cf.cf + dia;
      Ast[0] = Math.max(RCC.astFlex(Mux, Ly * 1000, d, fck, fy), 0.0012 * Ly * 1000 * Dtot); Ast[1] = Math.max(RCC.astFlex(Muy, Lx * 1000, d - dia, fck, fy), 0.0012 * Lx * 1000 * Dtot);
      if (isNaN(Ast[0]) || isNaN(Ast[1])) { d += 25; continue; }
      var dm = d / 1000;
      tv[0] = Math.max(0, cx - dm) * qu * Ly * 1000 / (Ly * 1000 * d); tv[1] = Math.max(0, cy - dm) * qu * Lx * 1000 / (Lx * 1000 * (d - dia));
      tc[0] = RCC.tauc(fck, 100 * Ast[0] / (Ly * 1000 * d)); tc[1] = RCC.tauc(fck, 100 * Ast[1] / (Lx * 1000 * (d - dia)));
      var bo = 2 * (a + dm + bc + dm) * 1000, Vp = qu * (Lx * Ly - (a + dm) * (bc + dm)); tp = Vp * 1000 / (bo * d);
      kp = Math.min(1, 0.5 + Math.min(a, bc) / Math.max(a, bc)) * 0.25 * Math.sqrt(fck);
      ok2 = tv[0] <= tc[0] && tv[1] <= tc[1] && tp <= kp;
      if (!ok2) d += 25;
    }
    var D0 = Math.max(DT.r(d + cf.cf + dia, 25), 300); d = D0 - cf.cf - dia;
    /* bars: spacing ≤ min(3d, 300) (IS 456 cl 26.3.3), ≥ 100 */
    function bars(As, W) { var pick = null; [10, 12, 16, 20].forEach(function (f) { var s = DT.rf(Math.min(1000 * D.barArea(f) * W / As, 300, 3 * d), 5); if (!pick && s >= 100) pick = { dia: f, s: s }; }); return pick || { dia: 20, s: 100 }; }
    var bx = bars(Ast[0], Ly), by = bars(Ast[1], Lx);
    /* development: Ld from the column face, else 90° bends up at the ends (IS 456 cl 34.2.4.3) */
    function anch(f, cant) { var Ld = DT.Ld(f, fy, fck), av = cant * 1000 - cf.cf; return av >= Ld ? { leg: 0, Ld: Ld, av: av } : { leg: DT.r(Math.max(D0 - 2 * cf.cf - 2 * f, Ld - av - 8 * f), 25), Ld: Ld, av: av }; }
    var axx = anch(bx.dia, cx), ayy = anch(by.dia, cy);
    var A2 = Math.min(Lx * Ly, (a + 4 * D0 / 1000) * (bc + 4 * D0 / 1000)), A1 = a * bc, fbr = 0.45 * fck * Math.min(2, Math.sqrt(A2 / A1)), Pu = 0;
    if (!cf.wsm) res.combos.forEach(function (cb, ci) { if (cb.reac && cb.reac[n]) { var fl1 = (((S.cb || [])[ci] || {}).f || {}).LL || 0; Pu = Math.max(Pu, cb.reac[n][2] - red * fl1 * llr[2]); } }); else Pu = 1.5 * G[2];
    var fact = Pu * 1000 / (A1 * 1e6);
    var nd = m.nodes[n], ft = { n: n, x: nd.x, y: nd.y, name: "F-" + g.gy(nd.y) + g.gx(nd.x), a: a * 1000, bc: bc * 1000, Lx: Lx * 1000, Ly: Ly * 1000, D: D0, d: d, sets: sets, gov: gov, q: q, incr: incr, qu: qu, gq: gq,
      Mux: qu * Ly * cx * cx / 2, Muy: qu * Lx * cy * cy / 2, Ast: Ast, bx: bx, by: by, tv: tv, tc: tc, tp: tp, kp: kp, ax: axx, ay: ayy, fbr: fbr, fact: fact, dia: Math.max(bx.dia, by.dia), Pser: G[2], fck: fck, fy: fy, red: red, nfl: nfl };
    ft.checks = [
      { t: "Max pressure ≤ SBC (" + gov.set.name + ")", ok: gov.u <= 1 + 1e-9, v: gov.pr.max.toFixed(1) + " ≤ " + gov.set.lim.toFixed(0) + " kN/m²", cl: gov.set.lim > q ? "IS 1893 cl 6.3.5.2 / Table 1 (+" + Math.round((incr - 1) * 100) + " %)" : "IS 456 cl 34.1" },
      { t: "No tension under DL+LL", ok: press(G, Lx, Ly, true).min >= -1e-9, v: press(G, Lx, Ly, true).min.toFixed(1) + " kN/m²", cl: "" },
      { t: "One-way shear, bars along X", ok: tv[0] <= tc[0] + 1e-9, v: tv[0].toFixed(3) + " ≤ τc " + tc[0].toFixed(3) + " N/mm²", cl: "IS 456 cl 34.2.4.1(a)" },
      { t: "One-way shear, bars along Y", ok: tv[1] <= tc[1] + 1e-9, v: tv[1].toFixed(3) + " ≤ τc " + tc[1].toFixed(3) + " N/mm²", cl: "IS 456 cl 34.2.4.1(a)" },
      { t: "Punching shear at d/2", ok: tp <= kp + 1e-9, v: tp.toFixed(3) + " ≤ ks·0.25√fck " + kp.toFixed(3) + " N/mm²", cl: "IS 456 cl 31.6.3" },
      { t: "Bearing at column base", ok: fact <= fbr + 1e-9, v: fact.toFixed(2) + " ≤ " + fbr.toFixed(2) + " N/mm²", cl: "IS 456 cl 34.4" },
      { t: "Development length (bars along X)", ok: true, v: axx.leg ? "90° bend up " + axx.leg + " mm (straight " + axx.av.toFixed(0) + " < Ld " + axx.Ld.toFixed(0) + ")" : axx.av.toFixed(0) + " ≥ Ld " + axx.Ld.toFixed(0) + " mm", cl: "IS 456 cl 34.2.4.3" }
    ];
    if (Math.abs(Lx - Ly) > 0.6) ft.checks.push({ t: "Central band (short-direction bars)", ok: true, v: "place " + (200 / (Math.max(Lx, Ly) / Math.min(Lx, Ly) + 1)).toFixed(0) + " % of short-direction bars in the central band", cl: "IS 456 cl 34.3.1(c)" });
    /* bars */
    var cv = cf.cf, nbx = Math.floor((ft.Ly - 2 * cv) / bx.s) + 1, nby = Math.floor((ft.Lx - 2 * cv) / by.s) + 1;
    ft.bars = [
      { mark: "a", desc: "Bottom mesh, bars along X (lower layer)", pos: "B", dia: bx.dia, n: nbx, shape: axx.leg ? "U" : "S", A: ft.Lx - 2 * cv, B: axx.leg, C: axx.leg, n90: axx.leg ? 2 : 0 },
      { mark: "b", desc: "Bottom mesh, bars along Y (upper layer)", pos: "B", dia: by.dia, n: nby, shape: ayy.leg ? "U" : "S", A: ft.Ly - 2 * cv, B: ayy.leg, C: ayy.leg, n90: ayy.leg ? 2 : 0 }
    ];
    ft.bars.forEach(function (q2) { q2.L = DT.cut(q2); });
    ft.wt = 0; ft.bars.forEach(function (q2) { ft.wt += q2.n * q2.L / 1000 * DT.wpm(q2.dia); });
    ft.conc = Lx * Ly * D0 / 1000;
    ft.sig = [ft.a, ft.bc, ft.Lx, ft.Ly, ft.D, bx.dia, bx.s, by.dia, by.s, axx.leg, ayy.leg].join(",");
    out.push(ft);
  });
  /* overlapping footings → combined footing / raft advised */
  out.forEach(function (f1, i) { out.forEach(function (f2, j) { if (j <= i) return; if (Math.abs(f1.x - f2.x) * 1000 < (f1.Lx + f2.Lx) / 2 + 100 && Math.abs(f1.y - f2.y) * 1000 < (f1.Ly + f2.Ly) / 2 + 100) { (f1.warn = f1.warn || []).push("Overlaps " + f2.name + " — use a combined footing or raft"); (f2.warn = f2.warn || []).push("Overlaps " + f1.name + " — use a combined footing or raft"); } }); });
  return out;
};

/* ------------------------------------------------------------------ SLAB PANELS */
/* panels = slab elements joined across edges that are not on a beam; bars from the Wood–Armer design of the elements,
   SP 34 / IS 456 Annex D curtailment: bottom bars into the supports, top bars 0.3L each side of continuous edges,
   0.1L with a bend at discontinuous edges, torsion steel at corners. */
DT.slabs = function (m, S, p, cf, g) {
  var dS = {}, beamE = {}, edges = {}, pid = {}, panels = [];
  S.des.slabs.forEach(function (r) { dS[r.k] = r; });
  function ek(a, b) { return Math.min(a, b) + "-" + Math.max(a, b); }
  m.frames.forEach(function (e) { if (e.type === "beam") beamE[ek(e.n1, e.n2)] = e.sec.b || 300; });
  m.shells.forEach(function (sh, k) { if (sh.kind !== "slab") return; sh.n.forEach(function (a, i) { var key = ek(a, sh.n[(i + 1) % 4]); (edges[key] = edges[key] || []).push(k); }); });
  m.shells.forEach(function (sh, k0) {
    if (sh.kind !== "slab" || pid[k0] !== undefined) return;
    var id = panels.length, stack = [k0], list = []; pid[k0] = id;
    while (stack.length) {
      var k = stack.pop(), s = m.shells[k]; list.push(k);
      s.n.forEach(function (a, i) { var key = ek(a, s.n[(i + 1) % 4]); if (beamE[key]) return; (edges[key] || []).forEach(function (j) { if (pid[j] === undefined) { pid[j] = id; stack.push(j); } }); });
    }
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z = 0;
    list.forEach(function (k) { m.shells[k].n.forEach(function (i) { var n = m.nodes[i]; x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); z = n.z; }); });
    panels.push({ id: id, k: list, x0: x0, x1: x1, y0: y0, y1: y1, z: Math.round(z * 1000) / 1000, Lx: Math.round((x1 - x0) * 1000), Ly: Math.round((y1 - y0) * 1000) });
  });
  if (!panels.length) return [];
  /* element requirements in global X / Y */
  panels.forEach(function (P) {
    var t = 0, amin = 0, req = { bX: 0, bY: 0, W: 0, E: 0, S: 0, N: 0 };
    P.k.forEach(function (k) {
      var r = dS[k]; if (!r) return;
      var R = (m._shellCache && m._shellCache[k]) ? m._shellCache[k].R : FE.shellElem(m, m.shells[k]).R, lx = Math.abs(R[0][0]) >= Math.abs(R[0][1]);
      var bX = lx ? r.Abx : r.Aby, bY = lx ? r.Aby : r.Abx, tX = lx ? r.Atx : r.Aty, tY = lx ? r.Aty : r.Atx, cx = 0, cy = 0;
      m.shells[k].n.forEach(function (i) { cx += m.nodes[i].x / 4; cy += m.nodes[i].y / 4; });
      t = r.t; amin = r.amin;
      req.bX = Math.max(req.bX, bX || 0); req.bY = Math.max(req.bY, bY || 0);
      if ((cx - P.x0) * 1000 <= 0.3 * P.Lx) req.W = Math.max(req.W, tX || 0); if ((P.x1 - cx) * 1000 <= 0.3 * P.Lx) req.E = Math.max(req.E, tX || 0);
      if ((cy - P.y0) * 1000 <= 0.3 * P.Ly) req.S = Math.max(req.S, tY || 0); if ((P.y1 - cy) * 1000 <= 0.3 * P.Ly) req.N = Math.max(req.N, tY || 0);
    });
    P.t = t; P.amin = amin; P.req = req; P.d = t - cf.cs - 5;
  });
  /* neighbours */
  function ov(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0) > 0.01; }
  panels.forEach(function (P) {
    P.nb = { W: null, E: null, S: null, N: null };
    panels.forEach(function (Q) {
      if (Q === P || Math.abs(Q.z - P.z) > 0.01) return;
      if (Math.abs(Q.x1 - P.x0) < 0.002 && ov(P.y0, P.y1, Q.y0, Q.y1)) P.nb.W = Q; if (Math.abs(Q.x0 - P.x1) < 0.002 && ov(P.y0, P.y1, Q.y0, Q.y1)) P.nb.E = Q;
      if (Math.abs(Q.y1 - P.y0) < 0.002 && ov(P.x0, P.x1, Q.x0, Q.x1)) P.nb.S = Q; if (Math.abs(Q.y0 - P.y1) < 0.002 && ov(P.x0, P.x1, Q.x0, Q.x1)) P.nb.N = Q;
    });
    P.bw = 230; var bws = [];
    P.k.forEach(function (k) { var s = m.shells[k]; s.n.forEach(function (a, i) { var w = beamE[ek(a, s.n[(i + 1) % 4])]; if (w) bws.push(w); }); });
    if (bws.length) P.bw = Math.max.apply(null, bws);
  });
  function spc(As, d, smax) {
    var pick = null;
    [8, 10, 12].forEach(function (f) { var s = DT.rf(Math.min(1000 * D.barArea(f) / Math.max(As, 1), smax), 5); if (!pick && s >= 125) pick = { dia: f, s: s }; });
    if (!pick) [8, 10, 12].forEach(function (f) { var s = DT.rf(Math.min(1000 * D.barArea(f) / Math.max(As, 1), smax), 5); if (!pick && s >= 75) pick = { dia: f, s: s }; });
    if (!pick) pick = { dia: 12, s: 75, short: true };
    pick.As = 1000 * D.barArea(pick.dia) / pick.s; return pick;
  }
  var floors = {};
  panels.forEach(function (P) {
    var cs = cf.cs, smax = Math.min(3 * P.d, 300), sd = Math.min(5 * P.d, 450), bw = P.bw;
    P.bot = { X: spc(Math.max(P.req.bX, P.amin), P.d, smax), Y: spc(Math.max(P.req.bY, P.amin), P.d - 10, smax) };
    P.dist = spc(P.amin, P.d, sd);
    P.msg = [];
    if (P.bot.X.short || P.bot.Y.short) P.msg.push("Bottom steel needs more than 12φ @ 75 — increase slab thickness");
    /* top bars over each edge */
    P.top = {};
    ["W", "E", "S", "N"].forEach(function (sd0) {
      var alongX = sd0 === "W" || sd0 === "E", L = alongX ? P.Lx : P.Ly, Q = P.nb[sd0], rq = P.req[sd0];
      if (Q) {
        var op = { W: "E", E: "W", S: "N", N: "S" }[sd0], Lq = alongX ? Q.Lx : Q.Ly;
        P.top[sd0] = { cont: true, sp: spc(Math.max(rq, Q.req[op], P.amin), P.d, smax), ext: DT.r(0.3 * L + bw / 2, 25), extQ: DT.r(0.3 * Lq + bw / 2, 25) };
      } else {
        var half = 0.5 * (alongX ? P.bot.X.As : P.bot.Y.As);
        P.top[sd0] = { cont: false, sp: spc(Math.max(rq, half), P.d, smax), ext: DT.r(0.1 * L + bw - cs, 25), leg: P.t - 2 * cs };
      }
    });
    /* corners: both edges discontinuous → torsion steel 3/4 of short-span steel over Lx/5 (IS 456 D-1.8), one discontinuous → half (D-1.9) */
    var Lsh = Math.min(P.Lx, P.Ly), Ash = Math.min(P.Lx, P.Ly) === P.Lx ? P.bot.X.As : P.bot.Y.As;
    P.corner = [];
    [["W", "S"], ["E", "S"], ["W", "N"], ["E", "N"]].forEach(function (cc) {
      var dc = (P.nb[cc[0]] ? 0 : 1) + (P.nb[cc[1]] ? 0 : 1); if (!dc) return;
      var A = (dc === 2 ? 0.75 : 0.375) * Ash, sp = spc(A, P.d, smax), len = DT.r(Lsh / 5 + bw / 2, 25);
      P.corner.push({ c: cc[0] + cc[1], sp: sp, len: len, n: Math.floor((Lsh / 5) / sp.s) + 1, full: dc === 2 });
    });
    (floors[P.z] = floors[P.z] || []).push(P);
  });
  /* bars per floor (top bars over a shared edge counted once) */
  var out = [];
  Object.keys(floors).sort(function (a, b) { return a - b; }).forEach(function (zk) {
    var list = floors[zk], rows = {}, mk = 0;
    function add(o) { o.B = o.B || 0; o.C = o.C || 0; o.L = DT.cut(o); var key = [o.desc, o.dia, o.shape, o.A, o.B, o.C].join("|"); if (rows[key]) rows[key].n += o.n; else rows[key] = o; }
    list.forEach(function (P, pi) {
      var cs = cf.cs, cw = function (L) { return L - P.bw; };
      var eW = P.nb.W ? 0 : P.bw / 2 - cs, eE = P.nb.E ? 0 : P.bw / 2 - cs, eS = P.nb.S ? 0 : P.bw / 2 - cs, eN = P.nb.N ? 0 : P.bw / 2 - cs;
      add({ desc: "Bottom, along X", pos: "B", dia: P.bot.X.dia, n: Math.floor(cw(P.Ly) / P.bot.X.s) + 1, shape: "S", A: DT.r(P.Lx + eW + eE, 5) });
      add({ desc: "Bottom, along Y", pos: "B", dia: P.bot.Y.dia, n: Math.floor(cw(P.Lx) / P.bot.Y.s) + 1, shape: "S", A: DT.r(P.Ly + eS + eN, 5) });
      ["W", "E", "S", "N"].forEach(function (sd0) {
        var T = P.top[sd0], alongX = sd0 === "W" || sd0 === "E", Le = alongX ? P.Ly : P.Lx;
        if (T.cont) {
          if (sd0 === "E" || sd0 === "N") return;      /* shared edge: counted from the W / S panel side */
          add({ desc: "Top over continuous edge, along " + (alongX ? "X" : "Y"), pos: "T", dia: T.sp.dia, n: Math.floor(cw(Le) / T.sp.s) + 1, shape: "S", A: T.ext + T.extQ });
          add({ desc: "Distribution under top bars, along " + (alongX ? "Y" : "X"), pos: "T", dia: P.dist.dia, n: 2 * Math.max(2, Math.floor((Math.min(T.ext, T.extQ) - P.bw / 2) / P.dist.s) + 1), shape: "S", A: DT.r(Le, 5) });
        } else {
          add({ desc: "Top at discontinuous edge, along " + (alongX ? "X" : "Y"), pos: "T", dia: T.sp.dia, n: Math.floor(cw(Le) / T.sp.s) + 1, shape: "L", A: T.ext, B: T.leg, n90: 1 });
          add({ desc: "Distribution under edge top bars, along " + (alongX ? "Y" : "X"), pos: "T", dia: P.dist.dia, n: Math.max(2, Math.floor((T.ext - P.bw) / P.dist.s) + 1), shape: "S", A: DT.r(Le, 5) });
        }
      });
      P.corner.forEach(function (c) { add({ desc: "Corner torsion steel, top, both ways", pos: "T", dia: c.sp.dia, n: 2 * c.n, shape: "S", A: c.len }); });
    });
    var bars = Object.keys(rows).map(function (k) { return rows[k]; });
    bars.forEach(function (o) { o.mark = String.fromCharCode(97 + (mk % 26)) + (mk++ >= 26 ? Math.floor(mk / 26) : ""); });
    var wt = 0, area = 0; bars.forEach(function (o) { wt += o.n * o.L / 1000 * DT.wpm(o.dia); }); list.forEach(function (P) { area += P.Lx * P.Ly / 1e6; });
    out.push({ z: +zk, name: "Slab at +" + (+zk).toFixed(2) + " m", panels: list, bars: bars, wt: wt, area: area, t: list[0].t });
  });
  return out;
};

/* ------------------------------------------------------------------ SHEAR WALLS (IS 13920:2016 cl 10, IS 456 cl 32) */
/* rectangular wall tw × Lw with vertical steel ratio ρ spread uniformly: P–M by strain compatibility, IS 456 cl 38.1/39.1
   (εcu 0.0035; full compression: 0.002 at 3Lw/7 from the compressed face), parabolic–rectangular concrete, IS 456 Fig. 23 steel */
DT.wallPM = function (tw, Lw, rho, fck, fy) {
  var nc = 60, ns = 40, As = rho * tw * Lw, pts = [];
  function sig(e) { if (e <= 0) return 0; var x = Math.min(e / 0.002, 1); return 0.446 * fck * (2 * x - x * x); }
  function at(xu) {
    var et = xu <= Lw ? 0.0035 : 0.002 * xu / (xu - 3 * Lw / 7), P = 0, M = 0;
    for (var i = 0; i < nc; i++) { var y = (i + 0.5) * Lw / nc, e = et * (xu - y) / xu, f = sig(e) * tw * Lw / nc; P += f; M += f * (Lw / 2 - y); }
    for (i = 0; i < ns; i++) { var y2 = (i + 0.5) * Lw / ns, e2 = et * (xu - y2) / xu, fs = (e2 >= 0 ? 1 : -1) * RCC.fs(Math.abs(e2), fy), f2 = fs * As / ns; P += f2; M += f2 * (Lw / 2 - y2); }
    return { P: P / 1000, M: M / 1e6 };
  }
  for (var j = 0; j <= 80; j++) pts.push(at(Lw * (0.01 + j * 0.02)));
  for (j = 1; j <= 20; j++) pts.push(at(Lw * (2.6 + j * 0.5)));
  var Pt = -0.87 * fy * As / 1000;
  return { pts: pts, P0: pts[pts.length - 1].P, Pt: Pt,
    Mcap: function (Pu) {   /* moment capacity at axial load Pu (compression +) */
      if (Pu > pts[pts.length - 1].P) return 0;
      if (Pu < pts[0].P) { var t = (Pu - Pt) / (pts[0].P - Pt); return t <= 0 ? 0 : t * pts[0].M; }
      var best = 0;
      for (var i = 0; i + 1 < pts.length; i++) { var a = pts[i], b = pts[i + 1]; if ((Pu - a.P) * (Pu - b.P) <= 0 && b.P !== a.P) best = Math.max(best, a.M + (b.M - a.M) * (Pu - a.P) / (b.P - a.P)); }
      return best;
    } };
};
DT.walls = function (m, S, p, cf, g, cols) {
  var res = S.res, edges = {}, pid = {}, panels = [], out = [];
  function ek(a, b) { return Math.min(a, b) + "-" + Math.max(a, b); }
  m.shells.forEach(function (sh, k) { if (sh.kind !== "wall") return; sh.n.forEach(function (a, i) { (edges[ek(a, sh.n[(i + 1) % 4])] = edges[ek(a, sh.n[(i + 1) % 4])] || []).push(k); }); });
  function plane(k) { var R = (m._shellCache && m._shellCache[k] ? m._shellCache[k] : FE.shellElem(m, m.shells[k])).R; return R[2]; }
  m.shells.forEach(function (sh, k0) {
    if (sh.kind !== "wall" || pid[k0] !== undefined) return;
    var nrm = plane(k0), id = panels.length, st = [k0], list = []; pid[k0] = id;
    while (st.length) {
      var k = st.pop(), s0 = m.shells[k]; list.push(k);
      s0.n.forEach(function (a, i) { (edges[ek(a, s0.n[(i + 1) % 4])] || []).forEach(function (j) { if (pid[j] !== undefined) return; var q = plane(j); if (Math.abs(Math.abs(q[0] * nrm[0] + q[1] * nrm[1] + q[2] * nrm[2]) - 1) < 1e-3) { pid[j] = id; st.push(j); } }); });
    }
    panels.push({ k: list, nrm: nrm });
  });
  var lv = g.lv;
  panels.forEach(function (P, pi) {
    /* in-plane horizontal axis */
    var ax = Math.abs(P.nrm[0]) > Math.abs(P.nrm[1]) ? [0, 1] : [1, 0], s0 = Infinity, s1 = -Infinity, z0 = Infinity, z1 = -Infinity, t = m.shells[P.k[0]].t * 1000, fck = p.fck, fy = p.fy, xy = null;
    P.k.forEach(function (k) { m.shells[k].n.forEach(function (i) { var n = m.nodes[i], sv = n.x * ax[0] + n.y * ax[1]; s0 = Math.min(s0, sv); s1 = Math.max(s1, sv); z0 = Math.min(z0, n.z); z1 = Math.max(z1, n.z); if (!xy) xy = n; }); });
    var Lw = (s1 - s0) * 1000, sc = (s0 + s1) / 2, cuts = lv.filter(function (z) { return z >= z0 - 0.01 && z < z1 - 0.01; });
    if (Lw < 300 || !cuts.length) return;
    var line = ax[0] ? "along X at y = " + xy.y.toFixed(2) : "along Y at x = " + xy.x.toFixed(2), name = "W" + (out.length + 1) + " (" + (ax[0] ? g.gy(xy.y) || "" : g.gx(xy.x)) + ", " + (ax[0] ? "X" : "Y") + ")";
    /* boundary columns at the wall ends */
    var endCols = cols.filter(function (c) { var sv = c.x * ax[0] + c.y * ax[1], on = ax[0] ? Math.abs(c.y - xy.y) < 0.01 : Math.abs(c.x - xy.x) < 0.01; return on && (Math.abs(sv - s0) < 0.01 || Math.abs(sv - s1) < 0.01); });
    var storeys = [];
    cuts.forEach(function (zc, si) {
      var ztop = lv.filter(function (z) { return z > zc + 0.01; })[0] || z1, h = (ztop - zc) * 1000;
      var els = P.k.filter(function (k) { var zmin = Infinity; m.shells[k].n.forEach(function (i) { zmin = Math.min(zmin, m.nodes[i].z); }); return Math.abs(zmin - zc) < 0.005; });
      /* section forces just above the cut: Σ element nodal forces K·u of the wall elements above, at the cut nodes */
      var pre = els.map(function (k) { var e = m.shells[k]; return { e: e, d: m._shellCache[k] || FE.shellElem(m, e) }; });
      function cut(U) {
        var F = 0, V = 0, M = 0;
        pre.forEach(function (q) {
          var ug = []; q.e.n.forEach(function (v) { for (var t2 = 0; t2 < 6; t2++) ug.push(U[6 * v + t2]); });
          var fg = FE.toGlobal(q.d.R, 8, FE.mv(q.d.K, FE.toLocal(q.d.R, 8, ug)));
          q.e.n.forEach(function (v, a) {
            var n = m.nodes[v]; if (Math.abs(n.z - zc) > 0.005) return;
            var fz = fg[6 * a + 2], fh = fg[6 * a] * ax[0] + fg[6 * a + 1] * ax[1], sv = n.x * ax[0] + n.y * ax[1];
            F += fz; V += fh; M += fz * (sv - sc) + (ax[0] ? -fg[6 * a + 4] : fg[6 * a + 3]);
          });
        });
        return [F, V, M];
      }
      var cv0 = {}, E = SE.respEnv(m, S, p, cut), env = [];
      res.combos.forEach(function (cb, ci) {
        var meta = (S.cb || [])[ci] || {}, ic = (res.incMap || {})[cb.name] || 1, r;
        if (cb.rs && meta.rs) {   /* response spectrum: static part + sign·fac·envelope */
          r = [0, 0, 0];
          Object.keys(meta.f).forEach(function (c) { if (!cv0[c]) cv0[c] = cut(res.cases[c].U); cv0[c].forEach(function (v, j) { r[j] += meta.f[c] * v; }); });
          var e = E[meta.rs.dir] || [0, 0, 0]; r = r.map(function (v, j) { return v + meta.rs.sign * meta.rs.fac * e[j]; });
        } else r = cut(cb.U);
        var fac = cf.wsm ? 1.5 / ic : 1;   /* WSM projects: wall designed by limit state with 1.5 × service forces */
        env.push({ cb: cb.name, P: r[0] * fac, V: Math.abs(r[1]) * fac, M: Math.abs(r[2]) * fac });
      });
      storeys.push({ i: si, z: zc, h: h, env: env, els: els.length });
    });
    /* design per storey */
    var Ag = t * Lw, dw = 0.8 * Lw, two = t >= 200, msg = [], checks = [];
    storeys.forEach(function (st) {
      var Vu = 0, Pmax = 0, Pmin = Infinity, gv = null, sMax = 0, gs = null;
      st.env.forEach(function (q) { if (q.V > Vu) { Vu = q.V; gv = q; } Pmax = Math.max(Pmax, q.P); Pmin = Math.min(Pmin, q.P); var sg = q.P * 1000 / Ag + q.M * 1e6 * 6 / (t * Lw * Lw); if (sg > sMax) { sMax = sg; gs = q; } });
      /* flexure + axial: smallest uniform ρv (≥ 0.25 %) giving M ≤ Mcap(P) for every combination */
      var rho = 0.0025, pm = null, worst = 0, okF = false;
      for (; rho <= 0.04 + 1e-9; rho += 0.0005) {
        pm = DT.wallPM(t, Lw, rho, fck, fy); worst = 0;
        st.env.forEach(function (q) { var c = pm.Mcap(q.P); worst = Math.max(worst, c > 0 ? q.M / c : (q.M > 1e-6 || q.P > pm.P0 ? 99 : 0)); });
        if (worst <= 1) { okF = true; break; }
      }
      rho = Math.min(rho, 0.04);
      /* shear, IS 13920 cl 10.2 */
      var tv = Vu * 1000 / (t * dw), tcm = RCC.tcmax ? RCC.tcmax(fck) : Math.min(0.62 * Math.sqrt(fck), 4), tc = RCC.tauc(fck, Math.min(100 * rho, 3));
      var rh = 0.0025, Vus = Vu * 1000 - tc * t * dw; if (Vus > 0) rh = Math.max(rh, Vus / (0.87 * fy * dw) / t);   /* Ah/(t·Sv) */
      two = two || tv > 0.25 * Math.sqrt(fck);
      var smax = Math.min(Lw / 5, 3 * t, 450), nc = two ? 2 : 1;
      function bars(r) { var pick = null; [8, 10, 12, 16, 20].forEach(function (f) { if (f > t / 10 + 1e-9 && f > 8) return; var s0 = DT.rf(Math.min(1000 * nc * D.barArea(f) / (r * t * 1000), smax), 5); if (!pick && s0 >= 100) pick = { dia: f, s: s0 }; }); return pick || { dia: Math.max(8, Math.floor(t / 10 / 2) * 2), s: 100, short: true }; }
      st.vb = bars(rho); st.hb = bars(rh); st.rho = rho; st.rh = rh; st.tv = tv; st.tc = tc; st.tcm = tcm; st.Vu = Vu; st.okF = okF; st.worst = worst; st.pm = pm; st.gv = gv;
      st.rhoP = nc * D.barArea(st.vb.dia) / (st.vb.s * t); st.rhP = nc * D.barArea(st.hb.dia) / (st.hb.s * t);
      /* boundary elements, cl 10.4: σ = Pu/A + 6Mu/(t·Lw²) > 0.2fck */
      st.sMax = sMax; st.gs = gs; st.be = sMax > 0.2 * fck;
      if (st.be) {
        var Cw = endCols.length >= 2 ? Lw : 0.85 * Lw, PbeMax = 0;
        st.env.forEach(function (q) { PbeMax = Math.max(PbeMax, q.P / 2 + q.M / (Cw / 1000)); });
        st.Pbe = PbeMax;
        if (endCols.length) {
          var cs = endCols.map(function (c) { return c.st.filter(function (q) { return Math.abs(q.z0 / 1000 - st.z) < 0.01; })[0]; }).filter(Boolean);
          st.beCap = cs.length ? Math.min.apply(null, cs.map(function (q) { return (0.4 * q.fck * (q.b * q.D - q.As) + 0.67 * q.fy * q.As) / 1000; })) : 0;
          st.beText = "end columns act as boundary elements: Pu,BE ≤ 0.4fck·Ac + 0.67fy·Asc of the column";
        } else {
          var Lb = DT.r(Math.max(0.15 * Lw, 2 * t, 300), 25), Ab = Lb * t, Asb = Math.max((PbeMax * 1000 - 0.4 * fck * Ab) / (0.67 * fy - 0.4 * fck), 0.008 * Ab), pk = U.pickBars(Asb, [12, 16, 20, 25], 4, 40);
          st.beL = Lb; st.beBars = { n: pk.n + (pk.n % 2), dia: pk.dia }; st.beCap = (0.4 * fck * (Ab - st.beBars.n * D.barArea(pk.dia)) + 0.67 * fy * st.beBars.n * D.barArea(pk.dia)) / 1000;
          st.beText = "boundary element " + t + " × " + Lb + " mm with " + st.beBars.n + "-" + pk.dia + "φ and special confining hoops (cl 8) over the storey";
        }
      }
      checks.push({ t: "Flexure + axial (strain compatibility, uniform ρv)", ok: okF, v: "ρv = " + (100 * rho).toFixed(2) + " % → max M/Mcap = " + worst.toFixed(2), cl: "IS 456 cl 38, 39; IS 13920 cl 10.3", st: st.i });
      checks.push({ t: "Shear stress τv = Vu/(tw·0.8Lw) ≤ τc,max", ok: tv <= tcm, v: tv.toFixed(2) + " ≤ " + tcm.toFixed(2) + " N/mm²", cl: "IS 13920 cl 10.2.1", st: st.i });
      checks.push({ t: "Horizontal steel ρh ≥ max(0.25 %, (Vu − τc·tw·dw)/(0.87fy·dw·tw))", ok: st.rhP >= rh - 1e-9, v: st.hb.dia + "φ@" + st.hb.s + (nc > 1 ? " each face" : "") + " = " + (100 * st.rhP).toFixed(3) + " %", cl: "IS 13920 cl 10.1.5, 10.2.3", st: st.i });
      checks.push({ t: "Vertical steel ρv ≥ max(0.25 %, ρh needed for shear), spacing ≤ min(Lw/5, 3tw, 450)", ok: st.rhoP >= Math.max(rho, 0.0025) - 1e-9 && st.vb.s <= smax, v: st.vb.dia + "φ@" + st.vb.s + (nc > 1 ? " each face" : "") + " = " + (100 * st.rhoP).toFixed(3) + " %", cl: "IS 13920 cl 10.1.7, 10.1.9", st: st.i });
      checks.push({ t: "Bar diameter ≤ tw/10", ok: Math.max(st.vb.dia, st.hb.dia) <= Math.max(t / 10, 8), v: Math.max(st.vb.dia, st.hb.dia) + " ≤ " + (t / 10).toFixed(0) + " mm", cl: "IS 13920 cl 10.1.8", st: st.i });
      checks.push({ t: "Boundary element needed if σ = Pu/A + 6Mu/(tLw²) > 0.2fck", ok: !st.be || st.beCap >= st.Pbe - 1e-6, v: sMax.toFixed(2) + (st.be ? " > " : " ≤ ") + (0.2 * fck).toFixed(1) + " N/mm²" + (st.be ? " → Pu,BE " + st.Pbe.toFixed(0) + " ≤ " + st.beCap.toFixed(0) + " kN; " + st.beText : " (not required)"), cl: "IS 13920 cl 10.4", st: st.i });
    });
    if (t < 150) msg.push("Wall thickness " + t + " mm < 150 mm (IS 13920 cl 10.1.2)");
    if (two) msg.push("Two curtains of reinforcement (tw ≥ 200 mm or τv > 0.25√fck, IS 13920 cl 10.1.4)");
    checks.push({ t: "Thickness ≥ 150 mm", ok: t >= 150, v: t + " mm", cl: "IS 13920 cl 10.1.2" });
    /* bar schedule */
    var bars = [], cv = 25, mk = 0;
    function add(o) { o.B = o.B || 0; o.C = o.C || 0; o.mark = String.fromCharCode(97 + (mk % 26)) + (mk++ >= 26 ? Math.floor(mk / 26) : ""); o.L = DT.cut(o); bars.push(o); }
    var nc2 = two ? 2 : 1;
    storeys.forEach(function (st, i) {
      var lapV = DT.lap(st.vb.dia, fy, fck), nV = nc2 * (Math.floor((Lw - 2 * cv) / st.vb.s) + 1), nH = nc2 * (Math.floor((st.h - 50) / st.hb.s) + 1), Lh = DT.r(Lw - 2 * cv, 5), leg = DT.r(Math.max(10 * st.hb.dia, 100), 25);
      add({ desc: "Vertical bars storey " + (i + 1) + (nc2 > 1 ? " (both faces)" : ""), pos: "V", dia: st.vb.dia, n: nV, shape: i === 0 ? "L" : "S", A: DT.r(st.h + lapV + (i === 0 ? 400 : 0), 5), B: i === 0 ? DT.r(Math.max(12 * st.vb.dia, 150), 25) : 0, n90: i === 0 ? 1 : 0, st: i });
      add({ desc: "Horizontal bars storey " + (i + 1) + (nc2 > 1 ? " (both faces), 90° legs at ends" : ""), pos: "H", dia: st.hb.dia, n: nH, shape: "U", A: Lh, B: leg, C: leg, n90: 2, st: i });
      if (nc2 > 1) add({ desc: "Crossties between curtains storey " + (i + 1) + " (alternate bars, ≤ 1 m grid)", pos: "X", dia: 8, n: Math.ceil(Lw / 1000) * Math.ceil(st.h / 1000) + 2, shape: "CT", A: t - 2 * cv, n90: 0, st: i });
      if (st.be && st.beBars) {
        var lb = DT.lap(st.beBars.dia, fy, fck), sc2 = DT.rf(Math.min(Math.min(t, st.beL) / 4, 6 * st.beBars.dia, 100), 5), nt = Math.floor(st.h / sc2) + 1;
        add({ desc: "Boundary element bars storey " + (i + 1) + " (2 ends)", pos: "BE", dia: st.beBars.dia, n: 2 * st.beBars.n, shape: "S", A: DT.r(st.h + lb, 5), n90: 0, st: i });
        add({ desc: "Boundary element hoops storey " + (i + 1) + " (2 ends) @ " + sc2, pos: "BE", dia: 8, n: 2 * nt, shape: "ST", A: t - 2 * 40, B: st.beL - 2 * 40, n90: 3, st: i });
      }
    });
    var w = { name: name, line: line, Lw: Lw, t: t, fck: fck, fy: fy, ax: ax, s0: s0 * 1000, z0: z0 * 1000, z1: z1 * 1000, storeys: storeys, checks: checks, msg: msg, bars: bars, two: two, endCols: endCols.map(function (c) { return c.name; }) };
    w.wt = 0; bars.forEach(function (q) { w.wt += q.n * q.L / 1000 * DT.wpm(q.dia); });
    w.sig = [t, Math.round(Lw), storeys.map(function (s) { return [Math.round(s.h), s.vb.dia, s.vb.s, s.hb.dia, s.hb.s, s.be ? 1 : 0].join(","); }).join("|"), bars.map(function (q) { return q.n + "x" + Math.round(q.L); }).join(",")].join("|");
    out.push(w);
  });
  return out;
};
DT.drawWall = function (w, cf) {
  var dw = new DW("Elevation " + w.name), th = 120, Lw = w.Lw, t = w.t;
  w.storeys.forEach(function (st, i) {
    var z0 = st.z * 1000, z1 = z0 + st.h;
    dw.r(0, z0, Lw, st.h, "C").tx(-150, z1 - 300, "+" + (z1 / 1000).toFixed(2), th, "r", "D");
    for (var x = 25; x <= Lw - 25 + 1; x += st.vb.s) dw.l(x, z0, x, z1, "R");
    for (var z = z0 + 50; z <= z1 - 1; z += st.hb.s) dw.l(25, z, Lw - 25, z, "S");
    dw.tx(Lw + 150, (z0 + z1) / 2 + 150, "V: " + st.vb.dia + "φ@" + st.vb.s + (w.two ? " EF" : ""), th, "l", "R").tx(Lw + 150, (z0 + z1) / 2 - 100, "H: " + st.hb.dia + "φ@" + st.hb.s + (w.two ? " EF" : ""), th, "l", "S");
    if (st.be) dw.tx(Lw + 150, (z0 + z1) / 2 - 350, st.beBars ? "BE " + st.beL + ": " + st.beBars.n + "-" + st.beBars.dia + "φ" : "BE = end columns", th, "l", "R");
    if (st.be && st.beL) { dw.r(0, z0, st.beL, st.h, "S"); dw.r(Lw - st.beL, z0, st.beL, st.h, "S"); }
  });
  dw.dim(0, w.storeys[0].z * 1000 - 200, Lw, w.storeys[0].z * 1000 - 200, -150, "Lw " + Math.round(Lw), th);
  dw.tx(0, w.z1 + 400, w.name + "  t = " + t + " mm  M" + w.fck + " / Fe" + w.fy, 150, "l").it[dw.it.length - 1].b = true;
  /* plan section of the lowest storey */
  var st0 = w.storeys[0], sec = new DW("Plan section, storey 1"), cv = 25;
  sec.r(0, 0, Lw, t, "C");
  var ys = w.two ? [cv + st0.vb.dia / 2 + st0.hb.dia, t - cv - st0.vb.dia / 2 - st0.hb.dia] : [t / 2];
  ys.forEach(function (y) { for (var x = cv; x <= Lw - cv + 1; x += st0.vb.s) sec.c(x, y, st0.vb.dia / 2, "R"); sec.l(cv, y + (w.two ? (y < t / 2 ? -1 : 1) * st0.hb.dia : 0), Lw - cv, y + (w.two ? (y < t / 2 ? -1 : 1) * st0.hb.dia : 0), "S"); });
  if (st0.be && st0.beL) { sec.r(40, 40, st0.beL - 80, t - 80, "S"); sec.r(Lw - st0.beL + 40, 40, st0.beL - 80, t - 80, "S"); }
  sec.dim(0, -40, Lw, -40, -80, String(Math.round(Lw)), 80);
  return [dw, sec];
};

/* ------------------------------------------------------------------ RUN */
DT.run = function (m, S, p) {
  var cf = DT.cfg(p), g = DT.grid(m), out = { cf: cf, g: g, beams: [], cols: [], slabs: [], foot: [], scwb: [], joints: [], walls: [], warn: [] };
  if (!S.des || !m.frames.some(function (e) { return e.sec.kind === "rcc"; })) { out.warn.push("Detailing is for RCC frames only"); return out; }
  out.beams = DT.beams(m, S, p, cf, g);
  out.beams.forEach(function (bl) { var lv = g.lev(bl.z); bl.lev = lv; bl.name = (lv > 0 ? "F" + lv : "z" + bl.z.toFixed(2)) + "-" + (bl.ux ? (m.twoD ? "X" : g.gy(bl.xy[0].y) + "(X)") : g.gx(bl.xy[0].x) + "(Y)"); });
  try { out.foot = DT.footings(m, S, p, cf, g); } catch (e) { out.warn.push("Footings: " + e.message); }
  /* mat (raft) foundation when chosen, or automatically when isolated footings overlap / cover > 50 % of the plan */
  var fm = p.found || "isolated", colFoot = out.foot;
  if (typeof MAT !== "undefined" && fm !== "isolated" && !m.twoD) {
    var nd = MAT.need(out.foot, g);
    if (fm === "mat" || nd.need) {
      try {
        var mt = MAT.run(m, S, p, cf, g, out.foot);
        if (mt.err) out.warn.push("Mat foundation: " + mt.err);
        else {
          mt.why = fm === "mat" ? "chosen" : nd.why; out.mat = mt; out.footIso = out.foot; out.foot = [];
          colFoot = mt.sups.filter(function (s) { return s.col; }).map(function (s) { return { n: s.n, D: mt.T, dia: mt.mesh.bx.dia, Lx: mt.L * 1000, Ly: mt.B * 1000, name: "Mat", sig: mt.sig }; });
          if (fm === "auto") out.warn.push("Mat foundation used: " + nd.why);
        }
      } catch (e) { out.warn.push("Mat foundation: " + e.message); }
    }
  }
  out.cols = DT.columns(m, S, p, cf, g, out.beams, colFoot);
  if (cf.duct) { out.scwb = DT.scwb(m, out.cols, out.beams); out.joints = DT.joints(m, out.cols, out.beams); } else out.joints = [];
  try { out.slabs = DT.slabs(m, S, p, cf, g); } catch (e) { out.warn.push("Slabs: " + e.message); }
  try { out.walls = DT.walls(m, S, p, cf, g, out.cols); } catch (e) { out.warn.push("Walls: " + e.message); }
  /* durability (IS 456 Table 5) and fire resistance (Table 16A, Fig. 1) */
  var cv = cf.cv, fr = cv.fire, dur = [];
  if (p.fck < cv.minGrade) dur.push("Concrete M" + p.fck + " is below the minimum M" + cv.minGrade + " for " + cv.expo + " exposure (IS 456 Table 5)");
  out.beams.forEach(function (bl) { if (bl.b < fr[2]) dur.push("Beam " + bl.name + ": width " + bl.b + " < " + fr[2] + " mm for " + cv.hrs + " h fire (IS 456 Fig. 1)"); });
  out.cols.forEach(function (c) { var s0 = c.st[0]; if (Math.min(s0.b, s0.D) < fr[4]) dur.push("Column " + c.name + ": " + Math.min(s0.b, s0.D) + " < " + fr[4] + " mm for " + cv.hrs + " h fire (IS 456 Fig. 1)"); });
  out.slabs.forEach(function (sl) { if (sl.t < fr[3]) dur.push(sl.name + ": thickness " + sl.t + " < " + fr[3] + " mm for " + cv.hrs + " h fire (IS 456 Fig. 1)"); });
  out.dur = dur; dur.slice(0, 6).forEach(function (t) { out.warn.push(t); }); if (dur.length > 6) out.warn.push("… " + (dur.length - 6) + " more durability / fire items");
  /* group identical members */
  function grp(list, nm) {
    var gs = {}, order = [];
    list.forEach(function (o) { if (!gs[o.sig]) { gs[o.sig] = { rep: o, list: [] }; order.push(o.sig); } gs[o.sig].list.push(o); });
    return order.map(function (k, i) { var G = gs[k]; G.id = nm + (i + 1); G.n = G.list.length; G.list.forEach(function (o) { o.grp = G.id; }); return G; });
  }
  out.gB = grp(out.beams, "B"); out.gC = grp(out.cols, "C"); out.gF = grp(out.foot, "F"); out.gW = grp(out.walls, "W");
  /* totals by diameter */
  var tot = {}, conc = 0;
  function acc(bars, nm, kind) { bars.forEach(function (q) { var w = nm * q.n * q.L / 1000 * DT.wpm(q.dia); tot[q.dia] = tot[q.dia] || { dia: q.dia, beams: 0, cols: 0, slabs: 0, foot: 0, walls: 0 }; tot[q.dia][kind] += w; }); }
  out.gB.forEach(function (G) { acc(G.rep.bars, G.n, "beams"); });
  out.gC.forEach(function (G) { acc(G.rep.bars, G.n, "cols"); });
  out.gF.forEach(function (G) { acc(G.rep.bars, G.n, "foot"); });
  out.slabs.forEach(function (s) { acc(s.bars, 1, "slabs"); });
  out.gW.forEach(function (G) { acc(G.rep.bars, G.n, "walls"); });
  if (out.mat) acc(out.mat.bars, 1, "foot");
  out.tot = Object.keys(tot).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { var t = tot[k]; t.all = t.beams + t.cols + t.slabs + t.foot + t.walls; return t; });
  out.total = 0; out.tot.forEach(function (t) { out.total += t.all; });
  out.area = 0; out.slabs.forEach(function (s) { out.area += s.area; });
  out.fails = 0;
  out.beams.forEach(function (b) { b.checks.forEach(function (c) { if (!c.ok) out.fails++; }); });
  out.cols.forEach(function (c) { c.checks.forEach(function (q) { if (!q.ok) out.fails++; }); });
  out.foot.forEach(function (f) { f.checks.forEach(function (q) { if (!q.ok) out.fails++; }); });
  out.walls.forEach(function (w) { w.checks.forEach(function (q) { if (!q.ok) out.fails++; }); });
  if (out.mat) out.mat.checks.forEach(function (q) { if (!q.ok) out.fails++; });
  out.scwb.forEach(function (q) { if (!q.ok) out.fails++; });
  out.fails += (out.dur || []).length;
  out.joints.forEach(function (q) { if (!q.ok || !q.anch) out.fails++; });
  return out;
};

/* ------------------------------------------------------------------ DRAWINGS (one primitive list → SVG and DXF) */
function DW(title) { this.it = []; this.title = title; }
DW.prototype.l = function (x1, y1, x2, y2, ly) { this.it.push({ t: "l", x1: x1, y1: y1, x2: x2, y2: y2, ly: ly || "C" }); return this; };
DW.prototype.pl = function (pts, ly, closed) { for (var i = 0; i + 1 < pts.length; i++) this.l(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ly); if (closed) this.l(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], ly); return this; };
DW.prototype.r = function (x, y, w, h, ly) { return this.pl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], ly, true); };
DW.prototype.c = function (x, y, r, ly) { this.it.push({ t: "c", x: x, y: y, r: r, ly: ly || "R" }); return this; };
DW.prototype.tx = function (x, y, s, h, al, ly) { this.it.push({ t: "t", x: x, y: y, s: String(s), h: h || 100, al: al || "l", ly: ly || "T" }); return this; };
/* aligned dimension between two points, offset perpendicular, text in the middle */
DW.prototype.dim = function (x1, y1, x2, y2, off, txt, h) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * off, ny = dx / L * off, tk = (h || 100) * 0.4;
  this.l(x1, y1, x1 + nx * 1.1, y1 + ny * 1.1, "D").l(x2, y2, x2 + nx * 1.1, y2 + ny * 1.1, "D").l(x1 + nx, y1 + ny, x2 + nx, y2 + ny, "D");
  this.l(x1 + nx - tk, y1 + ny - tk, x1 + nx + tk, y1 + ny + tk, "D").l(x2 + nx - tk, y2 + ny - tk, x2 + nx + tk, y2 + ny + tk, "D");
  this.it.push({ t: "t", x: (x1 + x2) / 2 + nx + (Math.abs(dx) >= Math.abs(dy) ? 0 : -(h || 100) * 0.3), y: (y1 + y2) / 2 + ny + (Math.abs(dx) >= Math.abs(dy) ? (h || 100) * 0.3 : 0), s: txt, h: h || 100, al: Math.abs(dx) >= Math.abs(dy) ? "c" : "r", ly: "D", rot: 0 });
  return this;
};
DW.prototype.bbox = function () {
  var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  function e(x, y) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); }
  this.it.forEach(function (q) { if (q.t === "l") { e(q.x1, q.y1); e(q.x2, q.y2); } else if (q.t === "c") { e(q.x - q.r, q.y - q.r); e(q.x + q.r, q.y + q.r); } else { var w = q.s.length * q.h * 0.6; e(q.al === "r" ? q.x - w : q.al === "c" ? q.x - w / 2 : q.x, q.y); e(q.al === "r" ? q.x : q.al === "c" ? q.x + w / 2 : q.x + w, q.y + q.h); } });
  return b;
};
DT.DW = DW;
DT.LY = { C: ["#1d3557", 1.3, 7], R: ["#c62828", 1.6, 1], S: ["#2e7d32", 0.8, 3], D: ["#6b7a8a", 0.6, 8], T: ["#1d3557", 0, 7], G: ["#9aa5b1", 0.6, 9] };
/* SVG: fit to maxW px (never larger than ppm px/mm); text fixed 9–12 px */
DT.svg = function (dw, opt) {
  opt = opt || {};
  var bb = dw.bbox(), pad = 14, W = bb.x1 - bb.x0 || 1, H = bb.y1 - bb.y0 || 1;
  var sc = Math.min((opt.maxW || 340) / W, opt.maxH ? opt.maxH / H : Infinity, opt.ppm || 0.5);
  if (opt.minW && W * sc < opt.minW) sc = opt.minW / W;
  /* re-fit with text widths at screen size */
  var fs = function (h) { return Math.max(9, Math.min(12, h * sc)); };
  var bx = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  dw.it.forEach(function (q) {
    if (q.t === "t") { var w = q.s.length * fs(q.h) * 0.56 / sc, hh = fs(q.h) / sc; var x0 = q.al === "r" ? q.x - w : q.al === "c" ? q.x - w / 2 : q.x; bx.x0 = Math.min(bx.x0, x0); bx.x1 = Math.max(bx.x1, x0 + w); bx.y0 = Math.min(bx.y0, q.y); bx.y1 = Math.max(bx.y1, q.y + hh); }
    else if (q.t === "l") { bx.x0 = Math.min(bx.x0, q.x1, q.x2); bx.x1 = Math.max(bx.x1, q.x1, q.x2); bx.y0 = Math.min(bx.y0, q.y1, q.y2); bx.y1 = Math.max(bx.y1, q.y1, q.y2); }
    else { bx.x0 = Math.min(bx.x0, q.x - q.r); bx.x1 = Math.max(bx.x1, q.x + q.r); bx.y0 = Math.min(bx.y0, q.y - q.r); bx.y1 = Math.max(bx.y1, q.y + q.r); }
  });
  var X = function (x) { return ((x - bx.x0) * sc + pad).toFixed(1); }, Y = function (y) { return ((bx.y1 - y) * sc + pad).toFixed(1); };
  var Wp = (bx.x1 - bx.x0) * sc + 2 * pad, Hp = (bx.y1 - bx.y0) * sc + 2 * pad, o = [];
  o.push('<svg xmlns="http://www.w3.org/2000/svg" class="dwg" width="' + Wp.toFixed(0) + '" height="' + Hp.toFixed(0) + '" viewBox="0 0 ' + Wp.toFixed(0) + " " + Hp.toFixed(0) + '" font-family="Inter,Arial,sans-serif">');
  var byL = {};
  dw.it.forEach(function (q) { if (q.t === "l") (byL[q.ly] = byL[q.ly] || []).push("M" + X(q.x1) + " " + Y(q.y1) + "L" + X(q.x2) + " " + Y(q.y2)); });
  Object.keys(byL).forEach(function (ly) { var s = DT.LY[ly] || DT.LY.C; o.push('<path d="' + byL[ly].join("") + '" stroke="' + s[0] + '" stroke-width="' + s[1] + '" fill="none" stroke-linecap="round"' + (ly === "G" ? ' stroke-dasharray="6 3 1 3"' : "") + '/>'); });
  dw.it.forEach(function (q) {
    if (q.t === "c") o.push('<circle cx="' + X(q.x) + '" cy="' + Y(q.y) + '" r="' + Math.max(1.6, q.r * sc).toFixed(1) + '" fill="' + (DT.LY[q.ly] || DT.LY.R)[0] + '"/>');
    else if (q.t === "t") { var f = fs(q.h); o.push('<text x="' + X(q.x) + '" y="' + Y(q.y) + '" font-size="' + f.toFixed(1) + '" fill="' + (DT.LY[q.ly] || DT.LY.T)[0] + '" text-anchor="' + (q.al === "r" ? "end" : q.al === "c" ? "middle" : "start") + '"' + (q.b ? ' font-weight="600"' : "") + ">" + String(q.s).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</text>"); }
  });
  o.push("</svg>");
  return o.join("");
};
/* DXF (R12): drawings placed in rows; layers CONCRETE, REBAR, LINKS, DIMS, TEXT, GRID */
DT.dxf = function (rows) {
  var LN = { C: "CONCRETE", R: "REBAR", S: "LINKS", D: "DIMS", T: "TEXT", G: "GRID" }, o = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "6"];
  Object.keys(LN).forEach(function (k) { o.push("0", "LAYER", "2", LN[k], "70", "0", "62", String(DT.LY[k][2]), "6", k === "G" ? "CENTER" : "CONTINUOUS"); });
  o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
  function f(v) { return (Math.round(v * 10) / 10).toString(); }
  var y = 0;
  rows.forEach(function (row) {
    var x = 0, hmax = 0, boxes = row.dws.map(function (d) { return d.bbox(); });
    boxes.forEach(function (b) { hmax = Math.max(hmax, b.y1 - b.y0); });
    o.push("0", "TEXT", "8", "TEXT", "10", "0", "20", f(y + 250), "30", "0", "40", "200", "1", row.title);
    row.dws.forEach(function (dw, i) {
      var b = boxes[i], ox = x - b.x0, oy = y - hmax - 400 - b.y0 + (hmax - (b.y1 - b.y0));
      if (dw.title) o.push("0", "TEXT", "8", "TEXT", "10", f(x), "20", f(oy + b.y1 + 120), "30", "0", "40", "120", "1", dw.title);
      dw.it.forEach(function (q) {
        var ly = LN[q.ly] || "CONCRETE";
        if (q.t === "l") o.push("0", "LINE", "8", ly, "10", f(q.x1 + ox), "20", f(q.y1 + oy), "30", "0", "11", f(q.x2 + ox), "21", f(q.y2 + oy), "31", "0");
        else if (q.t === "c") o.push("0", "CIRCLE", "8", ly, "10", f(q.x + ox), "20", f(q.y + oy), "30", "0", "40", f(q.r));
        else { var j = q.al === "r" ? 2 : q.al === "c" ? 1 : 0; o.push("0", "TEXT", "8", ly, "10", f(q.x + ox), "20", f(q.y + oy), "30", "0", "40", f(q.h), "1", q.s); if (j) o.push("72", String(j), "11", f(q.x + ox), "21", f(q.y + oy), "31", "0"); }
      });
      x += (b.x1 - b.x0) + 800;
    });
    y -= hmax + 1600;
  });
  o.push("0", "ENDSEC", "0", "EOF");
  return o.join("\n") + "\n";
};

/* beam line: elevation (vertical scale vs) and sections */
DT.drawBeam = function (bl, cf, vs) {
  vs = vs || 1;
  var dw = new DW("Elevation " + bl.name + (vs !== 1 ? " (depth ×" + vs + ")" : "")), D = bl.D, c = cf.cb, ph = bl.phs, dia = bl.dia, Y = function (y) { return y * vs; }, th = 110;
  var yt = D - c - ph - dia / 2, yb = c + ph + dia / 2, yt2 = yt - 2.5 * dia, yb2 = yb + 2.5 * dia;
  var xs = bl.cantL ? 0 : bl.sup[0].s - bl.sup[0].hc / 2, xe = bl.cantR ? bl.L : bl.sup[bl.sup.length - 1].s + bl.sup[bl.sup.length - 1].hc / 2;
  dw.l(xs, Y(D), xe, Y(D), "C");
  bl.sup.forEach(function (s, i) {
    var x0 = s.s - s.hc / 2, x1 = s.s + s.hc / 2, ext = 500;
    if (s.hc > 0) { dw.l(x0, Y(-ext), x0, Y(0), "C").l(x1, Y(-ext), x1, Y(0), "C").l(x0, Y(D), x0, Y(D + ext), "C").l(x1, Y(D), x1, Y(D + ext), "C"); dw.l(x0 - 60, Y(-ext), x1 + 60, Y(-ext), "G").l(x0 - 60, Y(D + ext), x1 + 60, Y(D + ext), "G"); }
    dw.l(s.s, Y(-ext) - 150, s.s, Y(D + ext) + 150, "G").tx(s.s, Y(D + ext) + 200, String(i + 1), th, "c");
  });
  bl.spans.forEach(function (sp) { dw.l(sp.fL, 0, sp.fR, 0, "C"); });
  if (bl.cantL) dw.l(0, 0, bl.cantL.fR, 0, "C").l(0, 0, 0, Y(D), "C");
  if (bl.cantR) dw.l(bl.cantR.fL, 0, bl.L, 0, "C").l(bl.L, 0, bl.L, Y(D), "C");
  /* hoops */
  bl.hoops.forEach(function (h) { h.xs.forEach(function (x) { dw.l(x, Y(c), x, Y(D - c), "S"); }); });
  /* bars */
  var lapAlt = { T: 0, B: 0 };
  bl.bars.forEach(function (q) {
    if (q.shape === "ST" || q.pos === "SF") return;
    var top = q.pos === "T", extra = /extra/.test(q.desc), y = top ? (extra ? yt2 : yt) : (extra ? yb2 : yb), sg = top ? -1 : 1;
    if (!extra) { y += (lapAlt[q.pos] % 2) * (top ? -1 : 1) * 1.2 * dia; lapAlt[q.pos]++; }
    dw.l(q.x0, Y(y), q.x1, Y(y), "R");
    if (q.l0) dw.l(q.x0, Y(y), q.x0, Y(y + sg * q.l0), "R");
    if (q.l1) dw.l(q.x1, Y(y), q.x1, Y(y + sg * q.l1), "R");
    var xm = extra ? (q.sup !== undefined ? Math.min(Math.max(bl.sup[q.sup].s, q.x0 + 300), q.x1 - 300) : (q.x0 + q.x1) / 2) : (q.x0 + q.x1) / 2;
    var ly = top ? Y(D) + (extra ? 380 : 140) : -(extra ? 560 : 320);
    dw.tx(xm, ly, q.mark + ": " + q.n + "-" + q.dia + "φ" + (extra ? " (L " + q.A + ")" : ""), th, "c", "R");
  });
  /* laps */
  bl.laps.forEach(function (lp) { var y = lp.top ? Y(D) + 40 : -120; dw.l(lp.x0, y, lp.x1, y, "D").tx((lp.x0 + lp.x1) / 2, y + (lp.top ? 20 : -150), "lap " + bl.lap, 90, "c", "D"); });
  /* hoop zones and spans */
  bl.spans.forEach(function (sp, i) {
    var sv = sp.sv, lh = Math.min(sv.lh, sp.Lc / 2), yd = -900;
    dw.dim(sp.fL, yd, sp.fL + lh, yd, 0, sv.ph + "φ@" + sv.sh, 90);
    if (sp.Lc - 2 * lh > 1) dw.dim(sp.fL + lh, yd, sp.fR - lh, yd, 0, sv.ph + "φ@" + sv.sm, 90);
    dw.dim(sp.fR - lh, yd, sp.fR, yd, 0, sv.ph + "φ@" + sv.sh, 90);
    dw.dim(sp.fL, yd - 300, sp.fR, yd - 300, 0, "clear span " + Math.round(sp.Lc), 100);
  });
  dw.tx(xs, Y(D + 500) + 450, bl.name + "  " + bl.b + " × " + bl.D + "  M" + bl.fck + " / Fe" + bl.fy, 140, "l").it[dw.it.length - 1].b = true;
  /* sections: at the support with most top steel, and mid-span of the longest span */
  var si = 0; bl.sup.forEach(function (s, i) { if (s.nt > bl.sup[si].nt) si = i; });
  var sp0 = bl.spans[0]; bl.spans.forEach(function (sp) { if (sp.nb > sp0.nb) sp0 = sp; });
  var s1 = DT.drawBeamSec(bl, cf, bl.sup[si].nt, bl.ncb, "Section at support " + (si + 1)), s2 = DT.drawBeamSec(bl, cf, bl.nct, sp0 ? sp0.nb : bl.ncb, "Section at mid-span " + (bl.spans.indexOf(sp0) + 1));
  return [dw, s1, s2];
};
DT.drawBeamSec = function (bl, cf, nt, nb, title) {
  var dw = new DW(title), b = bl.b, D = bl.D, c = cf.cb, ph = bl.phs, dia = bl.dia, th = 45;
  dw.r(0, 0, b, D, "C").r(c, c, b - 2 * c, D - 2 * c, "S");
  dw.l(c + 10, D - c, c + 10 + 45, D - c - 45, "S").l(c + 22, D - c, c + 22 + 45, D - c - 45, "S");   /* 135° hooks */
  function row(n, y, sg) {
    var nm = bl.nmax, n1 = Math.min(n, nm), n2 = n - n1, x0 = c + ph + dia / 2, x1 = b - c - ph - dia / 2;
    for (var i = 0; i < n1; i++) dw.c(n1 === 1 ? b / 2 : x0 + (x1 - x0) * i / (n1 - 1), y, dia / 2, "R");
    for (i = 0; i < n2; i++) dw.c(n2 === 1 ? b / 2 : x0 + (x1 - x0) * i / Math.max(n2 - 1, 1), y + sg * (dia + 25), dia / 2, "R");
  }
  row(nt, D - c - ph - dia / 2, -1); row(nb, c + ph + dia / 2, 1);
  dw.tx(b + 30, D - c - dia, nt + "-" + dia + "φ", th, "l", "R").tx(b + 30, c, nb + "-" + dia + "φ", th, "l", "R").tx(b + 30, D / 2, ph + "φ hoops", th, "l", "S");
  dw.dim(0, -30, b, -30, -40, String(b), th).dim(-30, 0, -30, D, 40, String(D), th);
  return dw;
};
/* column stack: elevation (horizontal scale hs) and a section per arrangement */
DT.drawCol = function (col, cf, hs) {
  hs = hs || 1;
  var st = col.st, s0 = st[0], Dd = s0.D, X = function (x) { return x * hs; }, cc = cf.cc, th = 120, dw = new DW("Elevation " + col.name + (hs !== 1 ? " (width ×" + hs + ")" : ""));
  var zb = st[0].z0, zt = st[st.length - 1].z1, ftD = col.foot ? col.foot.D : 600, fw = Math.max(col.foot ? Math.min(col.foot.Lx, Dd + 1200) : Dd + 600, Dd + 300);
  /* footing */
  dw.r(X(Dd / 2) - fw / 2 * hs, zb - ftD, fw * hs, ftD, "C").tx(X(Dd / 2), zb - ftD - 220, col.foot ? col.foot.name + " " + col.foot.Lx + "×" + col.foot.Ly + "×" + col.foot.D : "footing (not designed)", th, "c");
  st.forEach(function (s) {
    dw.l(0, s.z0, 0, s.z1 - s.Db, "C").l(X(Dd), s.z0, X(Dd), s.z1 - s.Db, "C");
    var bx0 = -600, bx1 = X(Dd) + 600;
    dw.r(bx0, s.z1 - (s.Db || 150), bx1 - bx0, s.Db || 150, "C");
    dw.l(bx0 - 200, s.z1, bx1 + 200, s.z1, "G").tx(bx1 + 250, s.z1 - 40, "+" + (s.z1 / 1000).toFixed(2), th, "l", "D");
    s.tz.forEach(function (z) { dw.l(X(cc), z, X(Dd - cc), z, "S"); });
    var t = s.tie, xr = X(Dd) + 700;
    if (cf.duct) {
      dw.dim(xr, s.z0, xr, s.z0 + t.lo, -0, t.dia + "φ@" + t.sc, 90);
      dw.dim(xr, s.z1 - s.Db - t.lo, xr, s.z1, 0, t.dia + "φ@" + t.sc, 90);
      if (s.h - s.Db - 2 * t.lo > 0) dw.dim(xr, s.z0 + t.lo, xr, s.z1 - s.Db - t.lo, 0, t.dia + "φ@" + t.sm, 90);
    } else dw.dim(xr, s.z0, xr, s.z1, 0, t.dia + "φ@" + t.sm, 90);
    dw.tx(-1100, (s.z0 + s.z1) / 2, "Storey " + (s.i + 1) + ": " + s.ar.n + "-" + s.ar.dia + "φ", th, "r", "R");
  });
  if (cf.duct) dw.dim(X(Dd) + 700, zb - 300, X(Dd) + 700, zb, 0, "300 into footing", 80);
  col.pieces.forEach(function (pc, i) {
    var dia = pc.dia, off = (i % 2) * 2.2 * dia, xl = X(cc + 10 + dia / 2 + off), xr = X(Dd - cc - 10 - dia / 2 - off);
    dw.l(xl, pc.zb, xl, pc.zt, "R").l(xr, pc.zb, xr, pc.zt, "R");
    if (pc.legB) dw.l(xl, pc.zb, xl - pc.legB, pc.zb, "R").l(xr, pc.zb, xr + pc.legB, pc.zb, "R");
    if (pc.legT) dw.l(xl, pc.zt, xl + pc.legT, pc.zt, "R").l(xr, pc.zt, xr - pc.legT, pc.zt, "R");
    var b0 = col.bars.filter(function (q) { return q.zb === pc.zb && q.zt === pc.zt; })[0];
    dw.tx(xr + 40, (pc.zb + pc.zt) / 2 + 300, (b0 ? b0.mark + ": " : "") + pc.n + "-" + dia + "φ", 100, "l", "R");
  });
  col.laps.forEach(function (lp) { dw.dim(-350, lp.z0, -350, lp.z1, 0, "lap " + lp.lap, 80); });
  dw.tx(-1100, zt + 500, col.name + "  " + s0.b + " × " + s0.D + "  M" + s0.fck + " / Fe" + s0.fy, 150, "l").it[dw.it.length - 1].b = true;
  var out = [dw], seen = {};
  st.forEach(function (s) { var k = [s.b, s.D, s.ar.n, s.ar.dia, s.tie.dia, s.tie.lB, s.tie.lD].join(","); if (seen[k]) { seen[k].push(s.i + 1); return; } seen[k] = [s.i + 1]; out.push(DT.drawColSec(s, cf, seen[k])); });
  out.slice(1).forEach(function (d) { d.title = "Section, storey " + d.stl.join(", "); });
  return out;
};
DT.drawColSec = function (s, cf, stl) {
  var dw = new DW(""), b = s.b, Dd = s.D, cc = cf.cc, t = s.tie, ar = s.ar, dia = ar.dia, pt = t.dia, th = 45;
  dw.stl = stl;
  dw.r(0, 0, Dd, b, "C").r(cc, cc, Dd - 2 * cc, b - 2 * cc, "S");
  dw.l(cc + 10, b - cc, cc + 55, b - cc - 45, "S").l(cc + 22, b - cc, cc + 67, b - cc - 45, "S");
  var x0 = cc + pt + dia / 2, x1 = Dd - x0, y0 = cc + pt + dia / 2, y1 = b - y0, px = [], py = [];
  for (var i = 0; i < ar.nD; i++) px.push(x0 + (x1 - x0) * i / (ar.nD - 1));
  for (i = 0; i < ar.nB; i++) py.push(y0 + (y1 - y0) * i / (ar.nB - 1));
  px.forEach(function (x) { dw.c(x, y0, dia / 2, "R").c(x, y1, dia / 2, "R"); });
  py.slice(1, -1).forEach(function (y) { dw.c(x0, y, dia / 2, "R").c(x1, y, dia / 2, "R"); });
  /* crossties: parallel to D at bars on the b-faces, parallel to b at bars on the D-faces */
  function pick(n, l) { var o = []; for (var j = 1; j < l - 1; j++) o.push(Math.round(j * (n - 1) / (l - 1))); return o; }
  pick(ar.nB, t.lB).forEach(function (j) { dw.l(cc, py[j], Dd - cc, py[j], "S"); });
  pick(ar.nD, t.lD).forEach(function (j) { dw.l(px[j], cc, px[j], b - cc, "S"); });
  dw.tx(Dd + 30, b - 40, ar.n + "-" + dia + "φ", th, "l", "R").tx(Dd + 30, b / 2, pt + "φ hoop" + (t.lB > 2 || t.lD > 2 ? " + crossties" : ""), th, "l", "S");
  dw.dim(0, -30, Dd, -30, -40, "D " + Dd + " (X)", th).dim(-30, 0, -30, b, 40, "b " + b, th);
  return dw;
};
DT.drawFoot = function (ft, cf) {
  var p = new DW("Plan " + ft.name), Lx = ft.Lx, Ly = ft.Ly, a = ft.a, bc = ft.bc, cv = cf.cf, th = 80;
  p.r(-Lx / 2, -Ly / 2, Lx, Ly, "C").r(-a / 2, -bc / 2, a, bc, "C");
  for (var y = -Ly / 2 + cv; y <= Ly / 2 - cv + 1; y += ft.bx.s) p.l(-Lx / 2 + cv, y, Lx / 2 - cv, y, "R");
  for (var x = -Lx / 2 + cv; x <= Lx / 2 - cv + 1; x += ft.by.s) p.l(x, -Ly / 2 + cv, x, Ly / 2 - cv, "R");
  p.dim(-Lx / 2, -Ly / 2 - 80, Lx / 2, -Ly / 2 - 80, -100, "Lx " + Lx, th).dim(-Lx / 2 - 80, -Ly / 2, -Lx / 2 - 80, Ly / 2, 100, "Ly " + Ly, th);
  p.tx(Lx / 2 + 60, 60, "a: " + ft.bx.dia + "φ@" + ft.bx.s + " along X (bottom)", th, "l", "R").tx(Lx / 2 + 60, -100, "b: " + ft.by.dia + "φ@" + ft.by.s + " along Y", th, "l", "R");
  var s = new DW("Section X-X"), D0 = ft.D, sb = cv + ft.bx.dia / 2;
  s.r(-Lx / 2, 0, Lx, D0, "C").l(-a / 2, D0, -a / 2, D0 + 700, "C").l(a / 2, D0, a / 2, D0 + 700, "C");
  s.l(-Lx / 2 + cv, sb, Lx / 2 - cv, sb, "R");
  if (ft.ax.leg) s.l(-Lx / 2 + cv, sb, -Lx / 2 + cv, sb + ft.ax.leg, "R").l(Lx / 2 - cv, sb, Lx / 2 - cv, sb + ft.ax.leg, "R");
  for (var x2 = -Lx / 2 + cv; x2 <= Lx / 2 - cv + 1; x2 += ft.by.s) s.c(x2, sb + ft.bx.dia / 2 + ft.by.dia / 2, ft.by.dia / 2, "R");
  var xs = -a / 2 + cf.cc + 20, xe = a / 2 - cf.cc - 20, zb = cv + ft.bx.dia + ft.by.dia + 10;
  s.l(xs, zb, xs, D0 + 700, "R").l(xe, zb, xe, D0 + 700, "R").l(xs, zb, xs - 250, zb, "R").l(xe, zb, xe + 250, zb, "R");
  s.dim(Lx / 2 + 80, 0, Lx / 2 + 80, D0, 0, "D " + D0, th).tx(0, D0 + 760, "column starter bars (see column schedule)", th, "c", "R");
  return [p, s];
};
DT.drawSlab = function (fl, cf) {
  var dw = new DW("Plan " + fl.name + "  t = " + fl.t + " mm"), th = 140;
  fl.panels.forEach(function (P, i) {
    var x0 = P.x0 * 1000, y0 = P.y0 * 1000, x1 = P.x1 * 1000, y1 = P.y1 * 1000, bw = P.bw;
    dw.r(x0, y0, x1 - x0, y1 - y0, "G");
    dw.l(x0 + bw / 2, y0 + bw / 2, x1 - bw / 2, y0 + bw / 2, "C").l(x1 - bw / 2, y0 + bw / 2, x1 - bw / 2, y1 - bw / 2, "C").l(x1 - bw / 2, y1 - bw / 2, x0 + bw / 2, y1 - bw / 2, "C").l(x0 + bw / 2, y1 - bw / 2, x0 + bw / 2, y0 + bw / 2, "C");
    var ym = y0 + 0.38 * (y1 - y0), xm = x0 + 0.62 * (x1 - x0);
    dw.l(x0 + 60, ym, x1 - 60, ym, "R").l(x0 + 60, ym, x0 + 60, ym + 120, "R").l(x1 - 60, ym, x1 - 60, ym + 120, "R");
    dw.tx((x0 + x1) / 2 - 200, ym + 60, P.bot.X.dia + "φ@" + P.bot.X.s + " B", th, "c", "R");
    dw.l(xm, y0 + 60, xm, y1 - 60, "R").l(xm, y0 + 60, xm + 120, y0 + 60, "R").l(xm, y1 - 60, xm + 120, y1 - 60, "R");
    dw.tx(xm + 80, y0 + 0.62 * (y1 - y0), P.bot.Y.dia + "φ@" + P.bot.Y.s + " B", th, "l", "R");
    ["W", "E", "S", "N"].forEach(function (sd) {
      var T = P.top[sd]; if (!T || (T.cont && (sd === "E" || sd === "N"))) return;
      var alongX = sd === "W" || sd === "E", lab = T.sp.dia + "φ@" + T.sp.s + " T";
      if (alongX) {
        var xe = sd === "W" ? x0 : x1, yy = y0 + 0.75 * (y1 - y0), sg = sd === "W" ? 1 : -1;
        if (T.cont) dw.l(xe - T.extQ, yy, xe + T.ext, yy, "R"); else dw.l(xe + sg * (bw - cf.cs) * 0 + (sd === "W" ? x0 - x0 : 0), yy, xe + sg * T.ext, yy, "R").l(xe, yy, xe, yy - 100, "R");
        dw.tx(xe + (T.cont ? 0 : sg * T.ext / 2), yy + 50, lab, th * 0.85, "c", "R");
      } else {
        var ye = sd === "S" ? y0 : y1, xx = x0 + 0.22 * (x1 - x0), sg2 = sd === "S" ? 1 : -1;
        if (T.cont) dw.l(xx, ye - T.extQ, xx, ye + T.ext, "R"); else dw.l(xx, ye, xx, ye + sg2 * T.ext, "R").l(xx, ye, xx + 100, ye, "R");
        dw.tx(xx + 60, ye + (T.cont ? 60 : sg2 * T.ext / 2), lab, th * 0.85, "l", "R");
      }
    });
    dw.tx(x0 + 0.5 * (x1 - x0), y0 + 0.12 * (y1 - y0), "S" + (i + 1) + "  " + P.Lx + "×" + P.Ly, th, "c");
  });
  return [dw];
};
if (typeof module !== "undefined") module.exports = DT;
