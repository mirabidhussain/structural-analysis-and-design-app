/* Bill of quantities of the whole building (structure + masonry, plaster, flooring, plinth) measured from the designed model
   in IS 1200 style, priced with the Jammu & Kashmir Schedule of Rates 2022 (JKSOR 2022) unless the user enters own rates,
   with reinforcement wastage, contingencies, labour cess and GST in the abstract. Reinforcement schedules for the drawings.
   Concrete: columns floor to floor less slab (+ necks footing to plinth), beams below the slab between column faces, slabs over
   the panel area, walls between end columns, footings L×B×D; PCC 100 mm with 100 mm offsets; excavation with 300 mm working space. */
var BOQ = {};
/* JKSOR 2022 rates (₹, exclusive of GST): [item no., rate] */
BOQ.SOR = {
  exc: ["2.6.1", 592.90], exl: ["2.10.1", 89.75], pcc: ["4.4.7", 5202.90], bfl: ["2.11", 218.40], pfl: ["2.11(a)", 276.60], gfb: ["4.4.7", 5202.90], dpc: ["4.17", 346.70],
  rcM20f: ["5.1.2", 7788.40], rcM20c: ["5.2.2", 9395.70], rcM20b: ["5.3.1", 9821.85], dmBelow: ["5.34.1", 8021.10], dmAbove: ["5.34.2", 9412.05],
  ex30: ["5.35.1", 98.80], ex35: ["5.35.2", 197.55], ex40: ["5.35.3", 269.35],
  fwf: ["5.9.1", 286.35], fwc: ["5.9.6", 742.55], fwb: ["5.9.5", 577.55], fws: ["5.9.3", 718.20], fww: ["5.9.2", 628.95], fwh: ["5.11.1", 293.90],
  stl500: ["5.22.6 / 5.22A.6", 123.20], stl415: ["5.22.4 / 5.22A.4", 123.20], sst: ["10.1", 120.80],
  msp: ["6.1.5", 7571.55], mss: ["6.1.5 + 6.4", 9027.20], pli: ["13.4.2", 266.20], ple: ["13.6.1", 390.05], plc: ["13.17", 241.25], flr: ["11.52.2", 1395.10]
};
/* [id, description, unit, JKSOR key] */
BOQ.ITEMS = [
  ["exc", "Earthwork in excavation for footings, all kinds of soil, lift up to 1.5 m (300 mm working space, vertical sides)", "m³", "exc"],
  ["exl", "Extra for additional lift in excavation (depth beyond 1.5 m)", "m³", "exl"],
  ["pcc", "PCC 1:4:8 (40 mm aggregate) 100 mm below footings, 100 mm offset", "m³", "pcc"],
  ["rcf", "RCC {g} in footings / raft up to plinth (excl. steel & formwork)", "m³", "below"],
  ["rcn", "RCC {g} in column necks, footing to plinth", "m³", "below"],
  ["rcc", "RCC {g} in columns above plinth", "m³", "col"],
  ["rcb", "RCC {g} in beams (below slab)", "m³", "beam"],
  ["rcs", "RCC {g} in suspended slabs", "m³", "beam"],
  ["rcw", "RCC {g} in walls", "m³", "col"],
  ["fwf", "Centering & shuttering — footings, raft edges and bases", "m²", "fwf"],
  ["fwc", "Centering & shuttering — columns", "m²", "fwc"],
  ["fwb", "Centering & shuttering — beams", "m²", "fwb"],
  ["fws", "Centering & shuttering — suspended slabs", "m²", "fws"],
  ["fww", "Centering & shuttering — walls", "m²", "fww"],
  ["fwh", "Extra for centering above 3.5 m height, per metre or part (slab soffit area)", "m²", "fwh"],
  ["stl", "Reinforcement Fe {fy} — cut, bent, tied and placed (bar bending schedule + {w} % wastage)", "kg", "stl"],
  ["sst", "Structural steel in single sections, fixed in position incl. primer", "kg", "sst"],
  ["bfl", "Refilling excavated earth around foundations in 20 cm layers, rammed", "m³", "bfl"],
  ["pfl", "Filling local earth in plinth (incl. carriage), rammed & watered", "m³", "pfl"],
  ["gfb", "PCC 1:4:8 in ground-floor base, 100 mm thick", "m³", "gfb"],
  ["dpc", "Damp-proof course 40 mm thick CC 1:2:4", "m²", "dpc"],
  ["msp", "Brick masonry (class 7.5) in CM 1:6 in plinth", "m³", "msp"],
  ["mss", "Brick masonry (class 7.5) in CM 1:6 in superstructure incl. parapet", "m³", "mss"],
  ["pli", "12 mm cement plaster CM 1:6 on internal wall faces", "m²", "pli"],
  ["ple", "20 mm cement plaster CM 1:4 on external faces and parapets", "m²", "ple"],
  ["plc", "6 mm cement plaster CM 1:3 to ceilings", "m²", "plc"],
  ["flr", "Vitrified floor tiles 600 × 600 mm on CM bed (all floors)", "m²", "flr"],
  ["atr", "Anti-termite pre-construction treatment (not in JKSOR — enter a market rate)", "m²", null]
];
BOQ.run = function (m, S, p) {
  var dt = S.det && !S.det.err ? S.det : null, R = {}, lv = MD.floorLevels(m), ts = (p.tSlab || 150) / 1000, Df = p.Df > 0 ? p.Df : 1.5;
  var mT = (p.mT > 0 ? +p.mT : 230) / 1000, open = Math.min(Math.max(p.mOpen >= 0 ? +p.mOpen : 15, 0), 90) / 100, pH = p.plinthH >= 0 ? +p.plinthH : 0.45, parH = p.parH >= 0 ? +p.parH : 1.0;
  BOQ.ITEMS.forEach(function (it) { R[it[0]] = []; });
  /* measurement rows (detailed estimate): quantity = No. × L × B × D/H for the dimensions given; pct rows add a percentage of the rows above */
  function row(k, d, n, L, B, H) { var r = { d: d, n: n, L: L, B: B, H: H }; r.q = n * (L === undefined ? 1 : L) * (B === undefined ? 1 : B) * (H === undefined ? 1 : H); if (r.q !== 0 && isFinite(r.q) && !(L === 0 || B === 0 || H === 0)) R[k].push(r); return r; }
  function qrow(k, d, q, src) { if (q > 0) R[k].push({ d: d, q: q, src: src }); }
  function pct(k, d, pc) { var sum = 0; R[k].forEach(function (r) { sum += r.q; }); if (sum > 0 && pc) R[k].push({ d: d, pct: pc, q: sum * pc / 100 }); }
  function grp(list, key) { var g = {}, o = []; list.forEach(function (x) { var k = key(x); if (!g[k]) { g[k] = { n: 0, x: x, names: [] }; o.push(k); } g[k].n++; if (x.name) g[k].names.push(x.name); }); return o.map(function (k) { return g[k]; }); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function names(a) { a = a.filter(Boolean); return a.length ? " (" + (a.length > 4 ? a.slice(0, 4).join(", ") + " …" : a.join(", ")) + ")" : ""; }
  /* columns: floor to floor less the slab at each floor they reach, grouped by size and height */
  var cl = [];
  m.frames.forEach(function (e) {
    if (e.type !== "column" || e.sec.kind !== "rcc") return;
    var A = m.nodes[e.n1], B = m.nodes[e.n2], zt = Math.max(A.z, B.z), zb = Math.min(A.z, B.z), top = lv.some(function (l) { return l > 0 && Math.abs(l - zt) < 0.005; });
    var lo = A.z < B.z ? A : B, gg = dt && dt.g;
    cl.push({ b: e.sec.b / 1000, D: e.sec.D / 1000, h: e.L - (top ? ts : 0), zb: zb, zt: zt, name: gg ? gg.gy(lo.y) + gg.gx(lo.x) : "" });
  });
  grp(cl, function (c) { return [c.b, c.D, c.h.toFixed(4), c.zb.toFixed(2)].join("|"); }).forEach(function (G) {
    var c = G.x, t = "Columns " + Math.round(c.b * 1000) + "×" + Math.round(c.D * 1000) + ", +" + c.zb.toFixed(2) + " to +" + c.zt.toFixed(2) + " less slab" + (G.names.length ? " — " + G.names.join(", ") : "");
    row("rcc", t, G.n, c.b, c.D, c.h); row("fwc", t + " — girth 2(b + D)", G.n, 2 * (c.b + c.D), undefined, c.h);
  });
  var stl = []; m.frames.forEach(function (e) { if (e.sec.kind === "steel") stl.push({ s: e.sec, L: e.L }); });
  grp(stl, function (q) { return q.s.name + "|" + q.L.toFixed(3); }).forEach(function (G) { row("sst", (G.x.s.name || "Section") + " × " + G.x.L.toFixed(2) + " m — A × 7850 kg/m³", G.n, G.x.L, G.x.s.A, 7850); });
  /* beams: below the slab, between column faces */
  var bls = dt && dt.beams ? dt.beams : [], g = dt ? dt.g : null;
  function levOf(bl) { return g ? g.lev(bl.z) : -1; }
  function clear(bl) { var L = 0; bl.spans.forEach(function (sp) { L += sp.Lc / 1000; }); return L; }
  bls.forEach(function (bl) {
    var b = bl.b / 1000, hs = Math.max(bl.D / 1000 - ts, 0), sz = bl.b + "×" + bl.D;
    grp(bl.spans.map(function (sp) { return { Lc: sp.Lc / 1000 }; }), function (q) { return q.Lc.toFixed(4); }).forEach(function (G) {
      row("rcb", "Beam " + bl.name + " (" + sz + "), " + G.n + " span" + (G.n > 1 ? "s" : "") + " between column faces — b × (D − slab)", G.n, G.x.Lc, b, hs);
      row("fwb", "Beam " + bl.name + ", " + G.n + " span" + (G.n > 1 ? "s" : "") + " — girth 2(D − t) + b", G.n, G.x.Lc, 2 * hs + b);
    });
    [["cantL", "left"], ["cantR", "right"]].forEach(function (k) { var c = bl[k[0]]; if (!c) return; var L = (c.fR - c.fL) / 1000; row("rcb", "Beam " + bl.name + " — " + k[1] + " cantilever", 1, L, b, hs); row("fwb", "Beam " + bl.name + " — " + k[1] + " cantilever, girth", 1, L, 2 * hs + b); });
  });
  /* slabs, grouped panels of each floor */
  var slabs = [];
  if (dt && dt.slabs) dt.slabs.forEach(function (fl) {
    var i = -1; lv.forEach(function (z, j) { if (Math.abs(z - fl.z) < 0.01) i = j; });
    var h = i > 0 ? lv[i] - lv[i - 1] : 0, ex = h > 3.5 ? Math.ceil(h - 3.5 - 1e-9) : 0, gp = grp(fl.panels, function (P) { return [P.Lx, P.Ly, P.t, P.bw].join("|"); });
    slabs.push({ z: fl.z, name: fl.name, gp: gp, roof: i === lv.length - 1 });
    gp.forEach(function (G) {
      var P = G.x, Lx = P.Lx / 1000, Ly = P.Ly / 1000, cx = Math.max(P.Lx - P.bw, 0) / 1000, cy = Math.max(P.Ly - P.bw, 0) / 1000, t = fl.name + " panels " + P.Lx + "×" + P.Ly;
      row("rcs", t, G.n, Lx, Ly, P.t / 1000); row("fws", t + " — soffit between beams", G.n, cx, cy);
      if (ex) row("fwh", t + " — storey " + h.toFixed(2) + " m, " + ex + " extra metre" + (ex > 1 ? "s" : ""), G.n, cx, cy, ex);
    });
  });
  /* walls: between end columns, storey height less the slab */
  if (dt && dt.walls) dt.walls.forEach(function (w) {
    var t = w.t / 1000, Lw = w.Lw / 1000;
    w.endCols.forEach(function (nm) { var c = dt.cols.filter(function (c0) { return c0.name === nm; })[0]; if (c) Lw -= (w.ax[0] ? c.st[0].D : c.st[0].b) / 2000; });
    w.storeys.forEach(function (st, i) { var h = st.h / 1000 - ts; row("rcw", (w.name || "Wall") + " storey " + (i + 1), 1, Lw, t, h); row("fww", (w.name || "Wall") + " storey " + (i + 1) + " — both faces", 2, Lw, undefined, h); });
  });
  /* isolated footings: groups of equal size */
  var dep = Df + 0.1;
  if (dt && dt.foot && dt.foot.length) {
    var fg = grp(dt.foot, function (ft) { return [ft.Lx, ft.Ly, ft.D, ft.a, ft.bc].join("|"); }), ex1 = [], ded = [];
    fg.forEach(function (G) {
      var ft = G.x, Lx = ft.Lx / 1000, Ly = ft.Ly / 1000, D = ft.D / 1000, a = ft.a / 1000, bc = ft.bc / 1000, neck = Math.max(Df - D, 0), t = "Footings " + ft.Lx + "×" + ft.Ly + names(G.names);
      row("exc", t + " — pit (L + 0.8)(B + 0.8)", G.n, Lx + 0.8, Ly + 0.8, Math.min(dep, 1.5));
      if (dep > 1.5) row("exl", t + " — below 1.5 m", G.n, Lx + 0.8, Ly + 0.8, dep - 1.5);
      row("pcc", t + " — bed (L + 0.2)(B + 0.2)", G.n, Lx + 0.2, Ly + 0.2, 0.1);
      row("rcf", t, G.n, Lx, Ly, D); row("fwf", t + " — sides 2(L + B)", G.n, 2 * (Lx + Ly), undefined, D);
      if (neck > 0) { row("rcn", "Necks " + ft.a + "×" + ft.bc + names(G.names), G.n, a, bc, neck); row("fwc", "Necks " + ft.a + "×" + ft.bc + " — girth 2(a + b)", G.n, 2 * (a + bc), undefined, neck); }
      ex1.push([t, G.n, Lx + 0.8, Ly + 0.8, dep]); ded.push(["Deduct footings " + ft.Lx + "×" + ft.Ly, -G.n, Lx, Ly, D], ["Deduct PCC", -G.n, Lx + 0.2, Ly + 0.2, 0.1]); if (neck > 0) ded.push(["Deduct necks", -G.n, a, bc, neck]);
    });
    ex1.forEach(function (r) { row("bfl", r[0] + " — excavated volume", r[1], r[2], r[3], r[4]); }); ded.forEach(function (r) { row("bfl", r[0], r[1], r[2], r[3], r[4]); });
  }
  if (dt && dt.mat) {
    var mt = dt.mat, Lm = mt.L, Bm = mt.B, Tm = mt.T / 1000, neckH = Math.max(Df - Tm, 0);
    row("exc", "Mat pit (L + 0.6)(B + 0.6)", 1, Lm + 0.6, Bm + 0.6, Math.min(dep, 1.5)); if (dep > 1.5) row("exl", "Mat pit below 1.5 m", 1, Lm + 0.6, Bm + 0.6, dep - 1.5);
    row("pcc", "Under the mat (L + 0.2)(B + 0.2)", 1, Lm + 0.2, Bm + 0.2, 0.1); row("rcf", "Mat " + f2(Lm) + " × " + f2(Bm) + " m", 1, Lm, Bm, Tm); row("fwf", "Mat edges 2(L + B)", 1, 2 * (Lm + Bm), undefined, Tm);
    var nk = grp(mt.sups.filter(function (s0) { return s0.rcc; }), function (s0) { return s0.a + "|" + s0.b; });
    row("bfl", "Mat pit — excavated volume", 1, Lm + 0.6, Bm + 0.6, dep); row("bfl", "Deduct mat", -1, Lm, Bm, Tm); row("bfl", "Deduct PCC", -1, Lm + 0.2, Bm + 0.2, 0.1);
    if (neckH > 0) nk.forEach(function (G) { var a = G.x.a, b = G.x.b; row("rcn", "Necks " + Math.round(a * 1000) + "×" + Math.round(b * 1000) + " from the mat to the plinth", G.n, a, b, neckH); row("fwc", "Necks — girth 2(a + b)", G.n, 2 * (a + b), undefined, neckH); row("bfl", "Deduct necks", -G.n, a, b, neckH); });
  }
  /* masonry: storey s on the level s−1 beams (storey 1 on the plinth, layout of level 1); perimeter lines external */
  var xs = g ? g.xs : [], ys = g ? g.ys : [], L1 = 0, perim = 0, Hb = lv[lv.length - 1] - lv[0], top = lv.length - 1, st = [];
  function onEdge(bl) { if (m.twoD) return true; var v = bl.ux ? bl.xy[0].y : bl.xy[0].x, a = bl.ux ? ys : xs; return a.length > 0 && (Math.abs(v - a[0]) < 0.01 || Math.abs(v - a[a.length - 1]) < 0.01); }
  function line(bl) { return String(bl.name).replace(/^F\d+-/, ""); }
  function spans(bl) { return grp(bl.spans.map(function (sp) { return { Lc: sp.Lc / 1000 }; }), function (q) { return q.Lc.toFixed(4); }); }
  if ((+p.wall || 0) > 0 && g) for (var s = 1; s <= top; s++) {
    var ref = s === 1 ? 1 : s - 1, Dmax = bls.filter(function (bl) { return levOf(bl) === s; }).reduce(function (a, bl) { return Math.max(a, bl.D / 1000); }, ts), h = lv[s] - lv[s - 1] - Dmax;
    st.push({ s: s, h: h, lines: bls.filter(function (bl) { return levOf(bl) === ref; }).map(function (bl) { var e = onEdge(bl), L = clear(bl); if (s === 1) { L1 += L; if (e) perim += L; } return { bl: bl, ext: e }; }) });
  }
  var parL = 0, parLines = bls.filter(function (bl) { return levOf(bl) === top && onEdge(bl); });
  if ((+p.parapet || 0) > 0 || p.parH > 0) parLines.forEach(function (bl) { parL += clear(bl); }); else parLines = [];
  st.forEach(function (q) { q.lines.forEach(function (w) { spans(w.bl).forEach(function (G) { row("mss", "Storey " + q.s + ", " + (w.ext ? "external" : "internal") + " wall on line " + line(w.bl) + " — " + G.n + " panel" + (G.n > 1 ? "s" : "") + " between columns, height floor to beam soffit", G.n, G.x.Lc, mT, q.h); }); }); });
  pct("mss", "Deduct doors & windows " + Math.round(open * 100) + " %", -open * 100);
  parLines.forEach(function (bl) { spans(bl).forEach(function (G) { row("mss", "Parapet on line " + line(bl), G.n, G.x.Lc, mT, parH); }); });
  if (st.length) st[0].lines.forEach(function (w) { spans(w.bl).forEach(function (G) { row("msp", "Plinth wall on line " + line(w.bl), G.n, G.x.Lc, mT, pH); row("dpc", "DPC on line " + line(w.bl), G.n, G.x.Lc, mT); }); });
  st.forEach(function (q) { q.lines.forEach(function (w) { spans(w.bl).forEach(function (G) { row("pli", "Storey " + q.s + ", line " + line(w.bl) + (w.ext ? " — inner face of external wall" : " — internal wall, both faces"), (w.ext ? 1 : 2) * G.n, G.x.Lc, undefined, q.h); }); }); });
  pct("pli", "Deduct openings " + Math.round(open * 100) + " %", -open * 100);
  if (perim > 0 && st.length) st[0].lines.forEach(function (w) { if (w.ext) spans(w.bl).forEach(function (G) { row("ple", "Outer face on line " + line(w.bl) + ", plinth to roof", G.n, G.x.Lc, undefined, Hb + pH); }); });
  else st.forEach(function (q) { q.lines.forEach(function (w) { if (w.ext) spans(w.bl).forEach(function (G) { row("ple", "Storey " + q.s + ", outer face on line " + line(w.bl), G.n, G.x.Lc, undefined, q.h); }); }); });
  pct("ple", "Deduct openings " + Math.round(open * 100) + " %", -open * 100);
  parLines.forEach(function (bl) { spans(bl).forEach(function (G) { row("ple", "Parapet on line " + line(bl) + ", both faces", 2 * G.n, G.x.Lc, undefined, parH); }); });
  /* floors, ceilings, plinth */
  slabs.sort(function (a, b) { return a.z - b.z; });
  slabs.forEach(function (sl) { sl.gp.forEach(function (G) { var P = G.x, cx = Math.max(P.Lx - P.bw, 0) / 1000, cy = Math.max(P.Ly - P.bw, 0) / 1000; row("plc", "Ceiling under " + sl.name + ", panels " + P.Lx + "×" + P.Ly, G.n, cx, cy); if (!sl.roof) row("flr", "Floor at +" + sl.z.toFixed(2) + ", panels " + P.Lx + "×" + P.Ly, G.n, cx, cy); }); });
  var gf = 0;
  if (slabs.length) slabs[0].gp.forEach(function (G) {
    var P = G.x, cx = Math.max(P.Lx - P.bw, 0) / 1000, cy = Math.max(P.Ly - P.bw, 0) / 1000; gf += G.n * cx * cy;
    row("flr", "Ground floor (first-floor layout), panels " + P.Lx + "×" + P.Ly, G.n, cx, cy); row("gfb", "Ground floor panels " + P.Lx + "×" + P.Ly, G.n, cx, cy, 0.1);
    if (pH > 0.15) row("pfl", "Plinth filling, panels " + P.Lx + "×" + P.Ly, G.n, cx, cy, pH - 0.15);
  });
  var foot = 0;
  if (xs.length > 1 && ys.length > 1 && !m.twoD) { row("atr", "Plinth area", 1, xs[xs.length - 1] - xs[0] + 0.4, ys[ys.length - 1] - ys[0] + 0.4); foot = (xs[xs.length - 1] - xs[0] + 0.4) * (ys[ys.length - 1] - ys[0] + 0.4); }
  else if (gf) { qrow("atr", "Plinth area (ground floor)", gf); foot = gf; }
  /* reinforcement from the bar bending schedule + wastage */
  var byDia = {}, kg = 0, wst = p.wastage >= 0 ? +p.wastage : 3;
  if (dt && dt.tot) dt.tot.forEach(function (t) { byDia[t.dia] = t.all; kg += t.all; });
  /* every bar mark of the bar bending schedule: No. of bars × cutting length × kg/m */
  function bars(label, list, nm) { list.forEach(function (q) { var r = row("stl", label + " — mark " + q.mark + ", " + q.dia + " mm" + (q.desc ? " (" + String(q.desc).replace(/\s*\(.*$/, "").slice(0, 60) + ")" : ""), nm * q.n, q.L / 1000, undefined, DT.wpm(q.dia)); r.hU = "kg/m"; }); }
  if (dt && !dt.err) {
    (dt.gB || []).forEach(function (G) { bars("Beams " + G.id + names(G.list.map(function (b0) { return b0.name; })), G.rep.bars, G.n); });
    (dt.gC || []).forEach(function (G) { bars("Columns " + G.id + names(G.list.map(function (c0) { return c0.name; })), G.rep.bars, G.n); });
    (dt.slabs || []).forEach(function (sl) { bars(sl.name, sl.bars, 1); });
    (dt.gW || []).forEach(function (G) { bars("Walls " + G.id, G.rep.bars, G.n); });
    (dt.gF || []).forEach(function (G) { bars("Footings " + G.id + names(G.list.map(function (c0) { return c0.name; })), G.rep.bars, G.n); });
    if (dt.mat) bars("Mat", dt.mat.bars, 1);
  }
  pct("stl", "Wastage and rolling margin " + wst + " %", wst);
  var q = {}; BOQ.ITEMS.forEach(function (it) { q[it[0]] = R[it[0]].reduce(function (a, r) { return a + r.q; }, 0); });
  var conc = q.rcf + q.rcn + q.rcc + q.rcb + q.rcs + q.rcw, gr = "M" + p.fck;
  var items = BOQ.ITEMS.map(function (it) {
    return { id: it[0], desc: it[1].replace("{g}", gr).replace("{fy}", p.fy).replace("{w}", wst), unit: it[2], qty: q[it[0]], sor: BOQ.sorFor(it, p), rows: R[it[0]], br: R[it[0]].map(function (r) { return [r.d, r.q]; }), grade: /^rc/.test(it[0]) ? gr : "" };
  }).filter(function (it) { return it.qty > 1e-9; });
  return { items: items, conc: conc, steelKg: kg, steelWithWaste: q.stl, byDia: byDia, ratio: conc > 0 ? kg / conc : 0, Df: Df, ts: ts, schedules: BOQ.schedules(S), amount: 0, footprint: foot,
    inp: { mT: mT * 1000, open: open * 100, pH: pH, parH: parH, wst: wst, cont: p.cont >= 0 ? +p.cont : 3, cess: p.cess >= 0 ? +p.cess : 1, gst: p.gst >= 0 ? +p.gst : 18, sorOn: p.sorOn !== false, fmt: p.estFmt === "detailed" ? "detailed" : "boq" } };
};
/* the JKSOR item for a BOQ line (concrete by grade: nominal mix M20, design mix M25 + extras for richer grades) */
BOQ.sorFor = function (it, p) {
  var k = it[3], S0 = BOQ.SOR, fck = +p.fck;
  if (!k) return null;
  if (k === "stl") return S0[p.fy >= 500 ? "stl500" : "stl415"];
  if (k === "below" || k === "col" || k === "beam") {
    if (fck <= 20) return S0[k === "below" ? "rcM20f" : k === "col" ? "rcM20c" : "rcM20b"];
    var b = S0[k === "below" ? "dmBelow" : "dmAbove"], ex = fck >= 40 ? S0.ex40 : fck >= 35 ? S0.ex35 : fck >= 30 ? S0.ex30 : null;
    return ex ? [b[0] + " + " + ex[0], Math.round((b[1] + ex[1]) * 100) / 100] : b;
  }
  return S0[k] || null;
};
/* rates: your own rate, else JKSOR 2022 (when on); abstract with contingencies, labour cess and GST */
BOQ.price = function (boq, rates) {
  var sum = 0, i = boq.inp || { cont: 3, cess: 1, gst: 18, sorOn: true };
  boq.items.forEach(function (it) {
    var own = rates && +rates[it.id];
    it.rate = own > 0 ? own : i.sorOn && it.sor ? it.sor[1] : null;
    it.src = own > 0 ? "own rate" : i.sorOn && it.sor ? "JKSOR " + it.sor[0] : "";
    it.amt = it.rate ? it.rate * it.qty : null; if (it.amt) sum += it.amt;
  });
  boq.amount = sum;
  boq.abs = { sub: sum, cont: sum * i.cont / 100, cess: sum * i.cess / 100, gst: sum * i.gst / 100, pc: i };
  boq.abs.total = sum + boq.abs.cont + boq.abs.cess + boq.abs.gst;
  boq.unpriced = boq.items.filter(function (it) { return !it.rate; }).map(function (it) { return it.id; });
  return boq;
};
/* detailed estimate (measurement sheet) as HTML: every item with its No. × L × B × D/H rows and total */
BOQ.detailedHtml = function (b, esc) {
  function n(v, d) { return v === undefined || v === null ? "" : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  var h = '<div class="tw"><table class="est"><tr><th>Item</th><th>Particulars</th><th>No.</th><th>L (m)</th><th>B (m)</th><th>D/H (m) · kg/m</th><th>Quantity</th></tr>';
  b.items.forEach(function (it, i) {
    var u = it.unit, dq = u === "kg" ? 1 : 2;
    h += '<tr class="ih"><td>' + (i + 1) + '</td><td><b>' + esc(it.desc) + '</b>' + (it.sor ? ' <span class="sorc">JKSOR ' + esc(it.sor[0]) + '</span>' : '') + '</td><td></td><td></td><td></td><td></td><td>' + esc(u) + '</td></tr>';
    it.rows.forEach(function (r) {
      var neg = r.q < 0;
      var dims = r.pct !== undefined ? n(r.pct, 1) + " % of the above" : r.n === undefined ? (r.src || "") : [n(r.n, 0), n(r.L, 3), n(r.B, 3), n(r.H, 3) + (r.hU ? " " + r.hU : "")].filter(function (x) { return x.trim() !== ""; }).join(" × ");
      h += '<tr' + (neg ? ' class="ded"' : '') + '><td></td><td>' + esc(r.d) + '<span class="dims">' + esc(dims) + '</span></td>' + (r.pct !== undefined ? '<td colspan="4" class="pc4">' + n(r.pct, 1) + ' % of the above</td>' : r.n === undefined ? '<td colspan="4" class="pc4">' + esc(r.src || "") + '</td>' :
        '<td>' + n(r.n, 0) + '</td><td>' + n(r.L, 3) + '</td><td>' + n(r.B, 3) + '</td><td>' + n(r.H, 3) + (r.hU ? ' <small>' + r.hU + '</small>' : '') + '</td>') + '<td>' + n(r.q, dq) + '</td></tr>';
    });
    h += '<tr class="it"><td></td><td>Total</td><td></td><td></td><td></td><td></td><td><b>' + n(it.qty, dq) + ' ' + esc(u) + '</b></td></tr>';
  });
  return h + '</table></div>';
};
/* reinforcement schedules (rows ready for tables) */
BOQ.schedules = function (S) {
  var dt = S.det, o = { cols: [], beams: [], slabs: [], foot: [], walls: [], mat: [] };
  if (!dt || dt.err || !dt.gB) return o;
  dt.gC.forEach(function (G) { G.rep.st.forEach(function (s, i) { o.cols.push([i ? "" : G.id, i ? "" : G.list.map(function (c) { return c.name; }).join(" "), "Storey " + (s.i + 1), s.b + "×" + s.D, s.ar.n + "-" + s.ar.dia + "φ", s.pct.toFixed(2) + " %", s.tie.dia + "φ" + (s.tie.lB > 2 || s.tie.lD > 2 ? " + " + (s.tie.lB - 2 + s.tie.lD - 2) + " crossties" : ""), s.tie.sc ? "@" + s.tie.sc + " over " + s.tie.lo : "—", "@" + s.tie.sm]); }); });
  dt.gB.forEach(function (G) { var bl = G.rep; bl.spans.forEach(function (sp, j) { o.beams.push([j ? "" : G.id, j ? "" : G.list.map(function (b) { return b.name; }).join(" "), j ? "" : bl.b + "×" + bl.D, "Span " + (j + 1) + " (" + Math.round(sp.Lc) + ")", bl.sup[j].nt + "-" + bl.dia + "φ", sp.nb + "-" + bl.dia + "φ", bl.sup[j + 1].nt + "-" + bl.dia + "φ", sp.sv.ph + "φ@" + sp.sv.sh + " / @" + sp.sv.sm]); }); });
  dt.slabs.forEach(function (fl) { fl.panels.forEach(function (P, j) { o.slabs.push([j ? "" : fl.name, "S" + (j + 1), P.Lx + "×" + P.Ly, P.t, P.bot.X.dia + "φ@" + P.bot.X.s, P.bot.Y.dia + "φ@" + P.bot.Y.s, ["W", "E", "S", "N"].map(function (k) { return P.top[k].sp.dia + "@" + P.top[k].sp.s; }).join(" / ")]); }); });
  dt.gF.forEach(function (G) { var f = G.rep; o.foot.push([G.id, G.list.map(function (c) { return c.name; }).join(" "), f.Lx + "×" + f.Ly, f.D, f.bx.dia + "φ@" + f.bx.s, f.by.dia + "φ@" + f.by.s, G.n]); });
  if (dt.mat) { var mt = dt.mat; [["bx", "Bottom", "X"], ["by", "Bottom", "Y"], ["tx", "Top", "X"], ["ty", "Top", "Y"]].forEach(function (k) { o.mat.push(["Mesh", k[1] + " " + k[2], mt.mesh[k[0]].dia + "φ@" + mt.mesh[k[0]].s, "whole mat", "", Math.round(mt.mesh[k[0]].As)]); });
    mt.zones.forEach(function (z) { o.mat.push([z.mark, z.face + " " + z.dir, z.dia + "φ@" + z.s, "x " + z.x0.toFixed(2) + "–" + z.x1.toFixed(2), "y " + z.y0.toFixed(2) + "–" + z.y1.toFixed(2), Math.round(z.As)]); }); }
  (dt.gW || []).forEach(function (G) { G.rep.storeys.forEach(function (st, i) { o.walls.push([i ? "" : G.id, i ? "" : G.list.map(function (w) { return w.line; }).join("; "), "Storey " + (i + 1), G.rep.t, st.vb.dia + "φ@" + st.vb.s + (G.rep.two ? " EF" : ""), st.hb.dia + "φ@" + st.hb.s + (G.rep.two ? " EF" : ""), st.be ? (st.beBars ? st.beL + ", " + st.beBars.n + "-" + st.beBars.dia + "φ" : "end columns") : "—"]); }); });
  return o;
};
BOQ.HEAD = { cols: ["Mark", "Columns", "Storey", "Size", "Bars", "Steel", "Ties", "Confining zones", "Middle"], beams: ["Mark", "Beams", "Size", "Span (clear)", "Top left", "Bottom", "Top right", "Hoops ends / middle"],
  slabs: ["Floor", "Panel", "Lx × Ly", "t", "Bottom X", "Bottom Y", "Top W / E / S / N"], foot: ["Mark", "Columns", "Lx × Ly", "D", "Bars X", "Bars Y", "No."], mat: ["Mark", "Layer", "Bars", "Extent x (m)", "Extent y (m)", "As mm²/m"], walls: ["Mark", "Walls", "Storey", "t", "Vertical", "Horizontal", "Boundary"] };
if (typeof module !== "undefined") module.exports = BOQ;
