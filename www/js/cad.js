/* CAD integration: drawing set DXF (GA plans, footing layout, schedules, title blocks, reinforcement details)
   and STAAD.Pro input for independent cross-checking. */
var CAD = (function () {
  var DW = DT.DW;
  function title(p, sheet, no) {
    var t = new DW(""), W = 6000, H = 1100;
    t.r(0, 0, W, H, "C").l(0, 700, W, 700, "C").l(3600, 0, 3600, 700, "C").l(4800, 0, 4800, 700, "C");
    t.tx(120, 820, (p && p.name) || "Project", 180, "l", "T").it[t.it.length - 1].b = true;
    t.tx(W - 120, 820, sheet, 150, "r", "T");
    t.tx(120, 470, "Client: " + ((p && p.client) || "—") + "   Site: " + ((p && p.site) || "—"), 100, "l", "T");
    t.tx(120, 300, "Job no.: " + ((p && p.jobNo) || "—") + "   Designed: " + ((p && p.engineer) || "—") + "   Checked: " + ((p && p.checker) || "—"), 100, "l", "T");
    t.tx(120, 120, "IS 456:2000 · IS 13920:2016 · IS 1893 (Part 1):2016 · IS 800:2007 — engine " + REG.ENGINE, 90, "l", "D");
    t.tx(3700, 470, "Drawing no.", 90, "l", "D").tx(3700, 250, no, 140, "l", "T");
    var rev = p && p.revs && p.revs.length ? p.revs[p.revs.length - 1].rev : "—";
    t.tx(4900, 470, "Rev / date", 90, "l", "D").tx(4900, 250, rev + "  " + new Date().toISOString().slice(0, 10), 120, "l", "T");
    return t;
  }
  function grid(dw, g, x0, x1, y0, y1) {
    var e = 1500, r = 300;
    g.xs.forEach(function (x, i) { var X = x * 1000; dw.l(X, y0 - e, X, y1 + e, "G").c(X, y1 + e + r, r, "G").tx(X, y1 + e + r - 60, String(i + 1), 160, "c", "T"); });
    if (g.ys.length > 1 || y1 > y0) g.ys.forEach(function (y, i) { var Y = y * 1000; dw.l(x0 - e, Y, x1 + e, Y, "G").c(x0 - e - r, Y, r, "G").tx(x0 - e - r, Y - 60, g.gy(y) || String(i + 1), 160, "c", "T"); });
    for (var i = 0; i + 1 < g.xs.length; i++) dw.dim(g.xs[i] * 1000, y0 - e + 300, g.xs[i + 1] * 1000, y0 - e + 300, -300, String(Math.round((g.xs[i + 1] - g.xs[i]) * 1000)), 120);
    for (i = 0; i + 1 < g.ys.length; i++) dw.dim(x1 + e - 300, g.ys[i] * 1000, x1 + e - 300, g.ys[i + 1] * 1000, 300, String(Math.round((g.ys[i + 1] - g.ys[i]) * 1000)), 120);
  }
  function plan(S, lev) {
    var dt = S.det, g = dt.g, z = g.lv[lev], dw = new DW("General arrangement — floor at +" + z.toFixed(2) + " m");
    var x0 = Math.min.apply(null, g.xs) * 1000, x1 = Math.max.apply(null, g.xs) * 1000, y0 = Math.min.apply(null, g.ys.length ? g.ys : [0]) * 1000, y1 = Math.max.apply(null, g.ys.length ? g.ys : [0]) * 1000;
    grid(dw, g, x0, x1, y0, y1);
    dt.slabs.filter(function (s) { return Math.abs(s.z - z) < 0.01; }).forEach(function (sl) { sl.panels.forEach(function (P, i) { dw.tx((P.x0 + P.x1) * 500, (P.y0 + P.y1) * 500 - 300, "S" + (i + 1) + " t=" + P.t, 130, "c", "D"); }); });
    dt.beams.filter(function (b) { return b.lev === lev; }).forEach(function (bl) {
      var A = bl.xy[0], B = bl.xy[1], ux = bl.ux, hw = bl.b / 2;
      bl.spans.forEach(function (sp) {
        var a = sp.fL, b = sp.fR, P = function (s) { return ux ? [A.x * 1000 + s, A.y * 1000] : [A.x * 1000, A.y * 1000 + s]; }, p1 = P(a), p2 = P(b);
        if (ux) { dw.l(p1[0], p1[1] - hw, p2[0], p2[1] - hw, "C").l(p1[0], p1[1] + hw, p2[0], p2[1] + hw, "C"); }
        else { dw.l(p1[0] - hw, p1[1], p2[0] - hw, p2[1], "C").l(p1[0] + hw, p1[1], p2[0] + hw, p2[1], "C"); }
        var m = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        dw.tx(m[0] + (ux ? 0 : 220), m[1] + (ux ? hw + 60 : 0), bl.grp + " " + bl.b + "x" + bl.D, 120, ux ? "c" : "l", "T");
      });
    });
    dt.cols.forEach(function (c) {
      var s = c.st.filter(function (q) { return Math.abs(q.z1 / 1000 - z) < 0.01; })[0]; if (!s) return;
      var X = c.x * 1000, Y = c.y * 1000;
      dw.r(X - s.D / 2, Y - s.b / 2, s.D, s.b, "C").l(X - s.D / 2, Y - s.b / 2, X + s.D / 2, Y + s.b / 2, "C").l(X - s.D / 2, Y + s.b / 2, X + s.D / 2, Y - s.b / 2, "C");
      dw.tx(X + s.D / 2 + 60, Y + s.b / 2 + 40, c.grp, 130, "l", "R");
    });
    (dt.walls || []).forEach(function (w) {
      if (!w.storeys.some(function (st) { return Math.abs(st.z + st.h / 1000 - z) < 0.01; })) return;
      var ax = w.ax, s0 = w.s0, t = w.t;
      if (ax[0]) dw.r(s0, yOf(S, w) * 1000 - t / 2, w.Lw, t, "C"); else dw.r(xOf(S, w) * 1000 - t / 2, s0, t, w.Lw, "C");
      if (ax[0]) dw.tx(s0 + w.Lw / 2, yOf(S, w) * 1000 - t - 260, w.grp + " wall t=" + t, 120, "c", "R");
      else dw.tx(xOf(S, w) * 1000 + (xOf(S, w) * 1000 <= S.det.g.xs[0] * 1000 + 1 ? -t - 120 : t + 120), s0 + w.Lw * 0.3, w.grp + " wall t=" + t, 120, xOf(S, w) * 1000 <= S.det.g.xs[0] * 1000 + 1 ? "r" : "l", "R");
    });
    return dw;
  }
  function xOf(S, w) { return +(/x = ([\d.-]+)/.exec(w.line) || [0, 0])[1]; }
  function yOf(S, w) { return +(/y = ([\d.-]+)/.exec(w.line) || [0, 0])[1]; }
  function footPlan(S) {
    var dt = S.det, g = dt.g, dw = new DW("Foundation layout");
    var x0 = Math.min.apply(null, g.xs) * 1000, x1 = Math.max.apply(null, g.xs) * 1000, y0 = Math.min.apply(null, g.ys.length ? g.ys : [0]) * 1000, y1 = Math.max.apply(null, g.ys.length ? g.ys : [0]) * 1000;
    grid(dw, g, x0, x1, y0, y1);
    dt.foot.forEach(function (ft) { var X = ft.x * 1000, Y = ft.y * 1000; dw.r(X - ft.Lx / 2, Y - ft.Ly / 2, ft.Lx, ft.Ly, "C").r(X - ft.a / 2, Y - ft.bc / 2, ft.a, ft.bc, "C"); dw.tx(X, Y - ft.Ly / 2 - 220, ft.grp + " " + ft.Lx + "x" + ft.Ly + "x" + ft.D, 120, "c", "T"); });
    dw.tx(x0, y0 - 2600, "Founding depth " + (S.p.Df || 1.5) + " m below plinth · SBC " + (S.p.sbc || 200) + " kN/m² (confirm by soil investigation) · PCC 1:4:8 100 mm below all footings", 130, "l", "D");
    return dw;
  }
  function table(ttl, head, rows, cw) {
    var dw = new DW(ttl), rh = 360, th = 110, W = cw.reduce(function (a, b) { return a + b; }, 0), n = rows.length + 1, y = 0;
    dw.r(0, -n * rh, W, n * rh, "C");
    for (var i = 1; i < n; i++) dw.l(0, -i * rh, W, -i * rh, i === 1 ? "C" : "D");
    var x = 0; cw.forEach(function (w, j) { if (j) dw.l(x, 0, x, -n * rh, "D"); x += w; });
    [head].concat(rows).forEach(function (r, i) { var xx = 0; r.forEach(function (c, j) { dw.tx(xx + 50, -i * rh - rh + 110, String(c === undefined ? "" : c).slice(0, Math.floor(cw[j] / (th * 0.62))), th, "l", i ? "T" : "T"); xx += cw[j]; }); });
    return dw;
  }
  function drawingSet(S, p) {
    var dt = S.det; if (!dt || dt.err) throw new Error("Run the analysis first");
    var rows = [], no = 0, code = ((p && p.jobNo) || "ISD").replace(/\s+/g, "");
    function sheet(t, dws) { no++; rows.push({ title: t, dws: dws.concat([title(p, t, code + "/S-" + (no < 10 ? "0" : "") + no)]) }); }
    for (var i = 1; i < dt.g.lv.length; i++) if (dt.beams.some(function (b) { return b.lev === i; })) sheet("GA plan +" + dt.g.lv[i].toFixed(2), [plan(S, i)]);
    if (dt.foot.length) sheet("Foundation layout", [footPlan(S)]);
    if (dt.mat) sheet("Mat foundation — " + dt.mat.L.toFixed(2) + " × " + dt.mat.B.toFixed(2) + " m × " + dt.mat.T + " mm", MAT.draw(dt.mat, dt.cf));
    var sc = BOQ.schedules(S);
    if (sc.cols.length) sheet("Column schedule", [table("Column schedule", BOQ.HEAD.cols, sc.cols, [600, 2200, 900, 900, 1000, 800, 1700, 1600, 800])]);
    if (sc.beams.length) sheet("Beam schedule", [table("Beam schedule", BOQ.HEAD.beams, sc.beams, [600, 2600, 900, 1500, 1000, 1000, 1000, 1700])]);
    if (sc.foot.length) sheet("Footing schedule", [table("Footing schedule", BOQ.HEAD.foot, sc.foot, [600, 3000, 1200, 600, 1000, 1000, 500])]);
    if (sc.mat.length) sheet("Mat reinforcement schedule", [table("Mat reinforcement schedule", BOQ.HEAD.mat, sc.mat, [700, 1400, 1300, 2000, 2000, 1200])]);
    if (sc.walls.length) sheet("Wall schedule", [table("Wall schedule", BOQ.HEAD.walls, sc.walls, [600, 2600, 900, 500, 1300, 1300, 1700])]);
    var cf = dt.cf;
    dt.gB.forEach(function (G) { sheet("Beam " + G.id + " — " + G.list.map(function (b) { return b.name; }).join(", "), DT.drawBeam(G.rep, cf, 1)); });
    dt.gC.forEach(function (G) { sheet("Column " + G.id + " — " + G.list.map(function (c) { return c.name; }).join(", "), DT.drawCol(G.rep, cf, 1)); });
    dt.gF.forEach(function (G) { sheet("Footing " + G.id + " — " + G.list.map(function (c) { return c.name; }).join(", "), DT.drawFoot(G.rep, cf)); });
    (dt.gW || []).forEach(function (G) { sheet("Wall " + G.id, DT.drawWall(G.rep, cf)); });
    dt.slabs.forEach(function (sl) { sheet(sl.name, DT.drawSlab(sl, cf)); });
    return DT.dxf(rows);
  }

  /* ---------- STAAD.Pro input ---------- */
  function n6(v) { return (Math.round(v * 1e6) / 1e6).toString(); }
  function staad(S, p) {
    var m = S.m, L = S.L, o = [], nf = m.frames.length;
    o.push("STAAD SPACE", "* Written by IS StructDesign engine " + REG.ENGINE + " for an independent cross-check of the linear static analysis.",
      "* Static load cases and combinations only (response spectrum, P-Delta and pushover are not exported).",
      "* Section properties are the cracked values used by the app (PRIS AX IX IY IZ). Check the BETA angle of rectangular columns.",
      "START JOB INFORMATION", "JOB NAME " + ((p && p.name) || "IS StructDesign model").slice(0, 60), "JOB NO " + ((p && p.jobNo) || "-"), "ENGINEER NAME " + ((p && p.engineer) || "-"), "END JOB INFORMATION",
      "INPUT WIDTH 79", "SET Z UP", "UNIT METER KN", "JOINT COORDINATES");
    m.nodes.forEach(function (n, i) { o.push((i + 1) + " " + n6(n.x) + " " + n6(n.y) + " " + n6(n.z) + ";"); });
    o.push("MEMBER INCIDENCES");
    m.frames.forEach(function (e, k) { o.push((k + 1) + " " + (e.n1 + 1) + " " + (e.n2 + 1) + ";"); });
    if (m.shells.length) { o.push("ELEMENT INCIDENCES SHELL"); m.shells.forEach(function (s, k) { o.push((nf + k + 1) + " " + s.n.map(function (v) { return v + 1; }).join(" ") + ";"); }); o.push("ELEMENT PROPERTY"); m.shells.forEach(function (s, k) { o.push((nf + k + 1) + " THICKNESS " + n6(s.t)); }); }
    /* materials by modulus */
    var mats = {}, mi = 0;
    function mat(E, nu, dens) { var key = Math.round(E) + "|" + nu + "|" + dens; if (!mats[key]) mats[key] = { name: "MAT" + (++mi), E: E, nu: nu, d: dens }; return mats[key].name; }
    var fm = m.frames.map(function (e) { return mat(e.sec.E, e.sec.kind === "steel" ? 0.3 : 0.2, e.sec.gamma !== undefined ? e.sec.gamma : 25); }), sm = m.shells.map(function (s) { return mat(s.mat.E, s.mat.nu, s.mat.gamma); });
    o.push("DEFINE MATERIAL START");
    Object.keys(mats).forEach(function (k) { var q = mats[k]; o.push("ISOTROPIC " + q.name, "E " + n6(q.E), "POISSON " + q.nu, "DENSITY " + n6(q.d), "ALPHA 1e-005"); });
    o.push("END DEFINE MATERIAL", "MEMBER PROPERTY INDIAN");
    m.frames.forEach(function (e, k) { var s = e.sec; o.push((k + 1) + " PRIS AX " + n6(s.A) + " IX " + n6(s.J) + " IY " + n6(s.Iy) + " IZ " + n6(s.Iz)); });
    var rel = m.frames.map(function (e, k) { return e.pinned ? k + 1 : 0; }).filter(Boolean);
    if (rel.length) { o.push("MEMBER RELEASE"); rel.forEach(function (k) { o.push(k + " START MY MZ"); o.push(k + " END MY MZ"); }); }
    o.push("CONSTANTS");
    fm.forEach(function (nm, k) { o.push("MATERIAL " + nm + " MEMB " + (k + 1)); });
    sm.forEach(function (nm, k) { o.push("MATERIAL " + nm + " MEMB " + (nf + k + 1)); });
    o.push("SUPPORTS");
    Object.keys(m.sup).forEach(function (n) { var r = m.sup[n], all = r.every(Boolean), tr = r[0] && r[1] && r[2] && !r[3] && !r[4] && !r[5];
      if (all) o.push((+n + 1) + " FIXED"); else if (tr) o.push((+n + 1) + " PINNED"); else o.push((+n + 1) + " FIXED BUT " + ["FX", "FY", "FZ", "MX", "MY", "MZ"].filter(function (d, i) { return !r[i]; }).join(" ")); });
    var ids = {}, li = 0;
    Object.keys(L.cases).forEach(function (cn) {
      var c = L.cases[cn]; ids[cn] = ++li;
      o.push("LOAD " + li + " LOADTYPE " + (cn === "DL" ? "Dead" : cn === "LL" ? "Live" : /^(EQ|T)/.test(cn) ? "Seismic" : /^WL/.test(cn) ? "Wind" : "None") + " TITLE " + cn);
      if (c.self) o.push("SELFWEIGHT Z -1");
      if (c.frameUDL && c.frameUDL.length) { o.push("MEMBER LOAD"); c.frameUDL.forEach(function (q) { ["GX", "GY", "GZ"].forEach(function (d, i) { if (Math.abs(q.w[i]) > 1e-12) o.push((q.e + 1) + " UNI " + d + " " + n6(q.w[i])); }); }); }
      if (c.shellP && c.shellP.length) { o.push("ELEMENT LOAD"); c.shellP.forEach(function (q) { ["GX", "GY", "GZ"].forEach(function (d, i) { if (Math.abs(q.q[i]) > 1e-12) o.push((nf + q.e + 1) + " PR " + d + " " + n6(q.q[i])); }); }); }
      if (c.nodal && c.nodal.length) { o.push("JOINT LOAD"); c.nodal.forEach(function (q) { var t = ["FX", "FY", "FZ", "MX", "MY", "MZ"].map(function (d, i) { return Math.abs(q.f[i]) > 1e-12 ? d + " " + n6(q.f[i]) : ""; }).filter(Boolean); if (t.length) o.push((q.n + 1) + " " + t.join(" ")); }); }
    });
    (S.cb || []).forEach(function (cb, i) {
      if (cb.rs || /^__/.test(cb.name)) return;
      o.push("LOAD COMBINATION " + (101 + i) + " " + cb.name.slice(0, 60));
      o.push(Object.keys(cb.f).map(function (cn) { return ids[cn] + " " + n6(cb.f[cn]); }).join(" "));
    });
    o.push("PERFORM ANALYSIS", "PRINT SUPPORT REACTION", "FINISH");
    return o.join("\n") + "\n";
  }
  return { drawingSet: drawingSet, staad: staad, plan: plan, table: table };
})();
if (typeof module !== "undefined") module.exports = CAD;
