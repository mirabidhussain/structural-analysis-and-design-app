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
  var dt = S.det && !S.det.err ? S.det : null, q = {}, br = {}, lv = MD.floorLevels(m), ts = (p.tSlab || 150) / 1000, Df = p.Df > 0 ? p.Df : 1.5;
  var mT = (p.mT > 0 ? +p.mT : 230) / 1000, open = Math.min(Math.max(p.mOpen >= 0 ? +p.mOpen : 15, 0), 90) / 100, pH = p.plinthH >= 0 ? +p.plinthH : 0.45, parH = p.parH >= 0 ? +p.parH : 1.0;
  BOQ.ITEMS.forEach(function (it) { q[it[0]] = 0; br[it[0]] = []; });
  function add(k, v, how) { if (!(v > 0)) return; q[k] += v; if (how) br[k].push([how, v]); }
  /* columns: element lengths, less the slab thickness at each floor they reach */
  var vc = 0, fc = 0;
  m.frames.forEach(function (e) {
    if (e.type !== "column" || e.sec.kind !== "rcc") return;
    var A = m.nodes[e.n1], B = m.nodes[e.n2], zt = Math.max(A.z, B.z), b = e.sec.b / 1000, D = e.sec.D / 1000, top = lv.some(function (l) { return l > 0 && Math.abs(l - zt) < 0.005; });
    var L = e.L - (top ? ts : 0); vc += b * D * L; fc += 2 * (b + D) * L;
  });
  add("rcc", vc, "Columns floor to floor less slab thickness"); add("fwc", fc, "Columns, four faces");
  m.frames.forEach(function (e) { if (e.sec.kind === "steel") q.sst += e.sec.A * e.L * 7850; });
  if (q.sst) br.sst.push(["Σ A × L × 7850 kg/m³", q.sst]);
  /* beams: below the slab, between column faces */
  var bls = dt && dt.beams ? dt.beams : [], g = dt ? dt.g : null;
  function levOf(bl) { return g ? g.lev(bl.z) : -1; }
  function clear(bl) { var L = 0; bl.spans.forEach(function (sp) { L += sp.Lc / 1000; }); return L; }
  bls.forEach(function (bl) {
    var b = bl.b / 1000, hs = Math.max(bl.D / 1000 - ts, 0), L = clear(bl);
    [bl.cantL, bl.cantR].forEach(function (c) { if (c) L += (c.fR - c.fL) / 1000; });
    q.rcb += b * hs * L; q.fwb += (2 * hs + b) * L;
  });
  if (q.rcb) { br.rcb.push([bls.length + " beam lines, b × (D − t) × clear length", q.rcb]); br.fwb.push(["Sides below slab + soffit", q.fwb]); }
  /* slabs */
  var slabA = [];
  if (dt && dt.slabs) dt.slabs.forEach(function (fl) {
    var A = 0, Ac = 0, V = 0;
    fl.panels.forEach(function (P) { A += P.Lx * P.Ly / 1e6; V += P.Lx * P.Ly / 1e6 * P.t / 1000; Ac += Math.max(P.Lx - P.bw, 0) * Math.max(P.Ly - P.bw, 0) / 1e6; });
    slabA.push({ z: fl.z, A: A, Ac: Ac });
    add("rcs", V, fl.name + ": " + A.toFixed(2) + " m²"); add("fws", Ac, fl.name + ": soffit between beams");
    var i = -1; lv.forEach(function (z, j) { if (Math.abs(z - fl.z) < 0.01) i = j; });
    var h = i > 0 ? lv[i] - lv[i - 1] : 0, ex = h > 3.5 ? Math.ceil(h - 3.5 - 1e-9) : 0;
    if (ex) add("fwh", Ac * ex, fl.name + ": storey " + h.toFixed(2) + " m → " + ex + " extra metre" + (ex > 1 ? "s" : ""));
  });
  /* walls */
  if (dt && dt.walls) dt.walls.forEach(function (w) {
    var t = w.t / 1000, Lw = w.Lw / 1000;
    w.endCols.forEach(function (nm) { var c = dt.cols.filter(function (c0) { return c0.name === nm; })[0]; if (c) Lw -= (w.ax[0] ? c.st[0].D : c.st[0].b) / 2000; });   /* end columns measured with the columns */
    w.storeys.forEach(function (st) { var h = st.h / 1000 - ts; q.rcw += Lw * t * h; q.fww += 2 * Lw * h; });
  });
  /* footings, PCC, excavation (first 1.5 m + extra lift), necks, backfill */
  var nf = 0;
  if (dt && dt.foot) dt.foot.forEach(function (ft) {
    var Lx = ft.Lx / 1000, Ly = ft.Ly / 1000, D = ft.D / 1000, a = ft.a / 1000, bc = ft.bc / 1000, neck = Math.max(Df - D, 0);
    var vf = Lx * Ly * D, vp = (Lx + 0.2) * (Ly + 0.2) * 0.1, ax = (Lx + 0.8) * (Ly + 0.8), dep = Df + 0.1, ve = ax * dep, vn = a * bc * neck;
    q.rcf += vf; q.fwf += 2 * (Lx + Ly) * D; q.pcc += vp; q.exc += ax * Math.min(dep, 1.5); q.exl += ax * Math.max(dep - 1.5, 0);
    q.rcn += vn; q.fwc += 2 * (a + bc) * neck; q.bfl += ve - vf - vp - vn; nf++;
  });
  if (nf) {
    br.exc.push([nf + " pits (L + 0.8) × (B + 0.8) × min(depth, 1.5 m)", q.exc]); if (q.exl) br.exl.push([nf + " pits, depth " + (Df + 0.1).toFixed(2) + " m − 1.5 m", q.exl]);
    br.rcf.push([nf + " footings L × B × D", q.rcf]); br.rcn.push([nf + " necks over " + Df + " m founding depth", q.rcn]); br.pcc.push([nf + " beds (L + 0.2) × (B + 0.2) × 0.1", q.pcc]);
    br.bfl.push(["Excavation − footing − PCC − neck", q.bfl]); br.fwf.push([nf + " footings, four sides 2(L + B) × D", q.fwf]);
  }
  if (dt && dt.mat) {
    var mt = dt.mat, Lm = mt.L, Bm = mt.B, Tm = mt.T / 1000, neckH = Math.max(Df - Tm, 0), dep = Df + 0.1, ax = (Lm + 0.6) * (Bm + 0.6), vm = Lm * Bm * Tm, vp = (Lm + 0.2) * (Bm + 0.2) * 0.1, vn = 0, fn = 0;
    mt.sups.forEach(function (s0) { if (s0.rcc) { vn += s0.a * s0.b * neckH; fn += 2 * (s0.a + s0.b) * neckH; } });
    add("rcf", vm, "Mat " + Lm.toFixed(2) + " × " + Bm.toFixed(2) + " × " + Tm.toFixed(2) + " m"); add("fwf", 2 * (Lm + Bm) * Tm, "Mat edges 2(L + B) × t");
    add("pcc", vp, "Under the mat (L + 0.2)(B + 0.2) × 0.1"); add("exc", ax * Math.min(dep, 1.5), "Mat pit (L + 0.6)(B + 0.6) × min(depth, 1.5 m)"); add("exl", ax * Math.max(dep - 1.5, 0), "Mat pit, depth below 1.5 m");
    add("rcn", vn, "Column necks from the mat to the plinth, " + neckH.toFixed(2) + " m"); add("fwc", fn, "Necks, four faces"); add("bfl", ax * dep - vm - vp - vn, "Excavation − mat − PCC − necks");
  }
  /* masonry: storey s on the level s−1 beams (storey 1 on the plinth, layout of level 1); perimeter lines are external */
  var xs = g ? g.xs : [], ys = g ? g.ys : [], ext = 0, int = 0, aE = 0, aI = 0, L1 = 0, perim = 0, Hb = lv[lv.length - 1] - lv[0], top = lv.length - 1;
  function onEdge(bl) {
    if (m.twoD) return true;
    var v = bl.ux ? bl.xy[0].y : bl.xy[0].x, a = bl.ux ? ys : xs;
    return a.length > 0 && (Math.abs(v - a[0]) < 0.01 || Math.abs(v - a[a.length - 1]) < 0.01);
  }
  if ((+p.wall || 0) > 0 && g) for (var s = 1; s <= top; s++) {
    var ref = s === 1 ? 1 : s - 1, Dmax = bls.filter(function (bl) { return levOf(bl) === s; }).reduce(function (a, bl) { return Math.max(a, bl.D / 1000); }, ts), h = lv[s] - lv[s - 1] - Dmax;
    bls.filter(function (bl) { return levOf(bl) === ref; }).forEach(function (bl) {
      var L = clear(bl), e = onEdge(bl);
      if (e) { ext += L * h; aE += L * h; if (s === 1) perim += L; } else { int += L * h; aI += L * h; }
      if (s === 1) L1 += L;
    });
  }
  var parL = bls.filter(function (bl) { return levOf(bl) === top && onEdge(bl); }).reduce(function (a, bl) { return a + clear(bl); }, 0);
  if ((+p.parapet || 0) <= 0 && !(p.parH > 0)) parL = 0;
  add("mss", (ext + int) * mT * (1 - open), "Walls under the beams, " + Math.round(mT * 1000) + " mm, less " + Math.round(open * 100) + " % openings");
  add("mss", parL * parH * mT, "Parapet " + parL.toFixed(1) + " m × " + parH + " m");
  add("msp", L1 * pH * mT, "Plinth walls " + L1.toFixed(1) + " m × " + pH + " m");
  add("dpc", L1 * mT, "Over the plinth walls");
  add("pli", (2 * aI + aE) * (1 - open), "Both faces of internal walls + inner face of external walls, less openings");
  add("ple", (perim > 0 ? perim * (Hb + pH) : aE) * (1 - open), "External face " + (perim > 0 ? perim.toFixed(1) + " m × " + (Hb + pH).toFixed(2) + " m" : "") + ", less openings");
  add("ple", 2 * parL * parH, "Parapet, both faces");
  /* floors, ceilings, plinth */
  slabA.sort(function (a, b) { return a.z - b.z; });
  slabA.forEach(function (sa) { add("plc", sa.Ac, "Ceiling under the slab at +" + sa.z.toFixed(2)); if (Math.abs(sa.z - lv[top]) > 0.01) add("flr", sa.Ac, "Floor at +" + sa.z.toFixed(2)); });
  var gf = slabA.length ? slabA[0].Ac : 0;
  if (gf) { add("flr", gf, "Ground floor (first-floor layout)"); add("gfb", gf * 0.1, "Ground floor, 100 mm"); add("pfl", gf * Math.max(pH - 0.15, 0), "Plinth filling " + Math.max(pH - 0.15, 0).toFixed(2) + " m deep"); }
  var foot = xs.length > 1 && ys.length > 1 && !m.twoD ? (xs[xs.length - 1] - xs[0] + 0.4) * (ys[ys.length - 1] - ys[0] + 0.4) : gf;
  add("atr", foot, "Plinth area");
  /* reinforcement from the bar bending schedule + wastage */
  var byDia = {}, kg = 0, wst = p.wastage >= 0 ? +p.wastage : 3;
  if (dt && dt.tot) dt.tot.forEach(function (t) { byDia[t.dia] = t.all; kg += t.all; });
  q.stl = kg * (1 + wst / 100); if (kg) br.stl.push(["Bar bending schedule " + kg.toFixed(0) + " kg + " + wst + " %", q.stl]);
  var conc = q.rcf + q.rcn + q.rcc + q.rcb + q.rcs + q.rcw, gr = "M" + p.fck;
  var items = BOQ.ITEMS.map(function (it) {
    return { id: it[0], desc: it[1].replace("{g}", gr).replace("{fy}", p.fy).replace("{w}", wst), unit: it[2], qty: q[it[0]], sor: BOQ.sorFor(it, p), br: br[it[0]], grade: /^rc/.test(it[0]) ? gr : "" };
  }).filter(function (it) { return it.qty > 1e-9; });
  return { items: items, conc: conc, steelKg: kg, steelWithWaste: q.stl, byDia: byDia, ratio: conc > 0 ? kg / conc : 0, Df: Df, ts: ts, schedules: BOQ.schedules(S), amount: 0, footprint: foot,
    inp: { mT: mT * 1000, open: open * 100, pH: pH, parH: parH, wst: wst, cont: p.cont >= 0 ? +p.cont : 3, cess: p.cess >= 0 ? +p.cess : 1, gst: p.gst >= 0 ? +p.gst : 18, sorOn: p.sorOn !== false } };
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
