/* Bill of quantities (IS 1200 style measurement) and reinforcement schedules from the designed and detailed model.
   Concrete: columns floor to floor less slab thickness (+ necks from footing to plinth), beams below the slab between column
   faces, slabs over the panel area, walls between end columns, footings L×B×D; PCC 100 mm with 100 mm offsets; excavation with
   300 mm working space; formwork on all cast faces; steel from the bar bending schedule. Rates are entered by the user. */
var BOQ = {};
BOQ.ITEMS = [
  ["exc", "Earthwork in excavation for footings (300 mm working space, vertical sides)", "m³"],
  ["pcc", "PCC 1:4:8 (M7.5) 100 mm below footings, 100 mm offset", "m³"],
  ["rcf", "RCC in footings", "m³"],
  ["rcc", "RCC in columns incl. necks to plinth", "m³"],
  ["rcb", "RCC in beams (below slab)", "m³"],
  ["rcs", "RCC in slabs", "m³"],
  ["rcw", "RCC in walls", "m³"],
  ["fwf", "Formwork — footing sides", "m²"],
  ["fwc", "Formwork — columns", "m²"],
  ["fwb", "Formwork — beam sides and soffits", "m²"],
  ["fws", "Formwork — slab soffits", "m²"],
  ["fww", "Formwork — walls (both faces)", "m²"],
  ["stl", "Reinforcement Fe {fy} — cut, bent and placed (bar bending schedule)", "kg"],
  ["bfl", "Backfilling around foundations in layers, compacted", "m³"],
  ["sst", "Structural steel (rolled sections, IS 2062) fabricated and erected", "kg"]
];
BOQ.run = function (m, S, p) {
  var dt = S.det, q = {}, br = {}, lv = MD.floorLevels(m), ts = (p.tSlab || 150) / 1000, Df = p.Df > 0 ? p.Df : 1.5;
  BOQ.ITEMS.forEach(function (it) { q[it[0]] = 0; br[it[0]] = []; });
  function add(k, v, how) { q[k] += v; if (how) br[k].push([how, v]); }
  /* columns: element lengths, less the slab thickness at each floor they reach */
  var colAt = {};
  m.frames.forEach(function (e, k) {
    if (e.type !== "column" || e.sec.kind !== "rcc") return;
    var A = m.nodes[e.n1], B = m.nodes[e.n2], zt = Math.max(A.z, B.z), b = e.sec.b / 1000, D = e.sec.D / 1000, top = lv.some(function (l) { return l > 0 && Math.abs(l - zt) < 0.005; });
    var L = e.L - (top ? ts : 0);
    add("rcc", b * D * L); add("fwc", 2 * (b + D) * L);
    colAt[A.z < B.z ? e.n1 : e.n2] = colAt[A.z < B.z ? e.n1 : e.n2] || e.sec;
  });
  /* structural steel members: A × L × 7850 kg/m³ */
  m.frames.forEach(function (e) { if (e.sec.kind === "steel") add("sst", e.sec.A * e.L * 7850); });
  /* beams: below the slab, between column faces */
  if (dt && dt.beams) dt.beams.forEach(function (bl) {
    var b = bl.b / 1000, hs = Math.max(bl.D / 1000 - ts, 0), L = 0;
    bl.spans.forEach(function (sp) { L += sp.Lc / 1000; }); [bl.cantL, bl.cantR].forEach(function (c) { if (c) L += (c.fR - c.fL) / 1000; });
    add("rcb", b * hs * L); add("fwb", (2 * hs + b) * L);
  });
  /* slabs */
  if (dt && dt.slabs) dt.slabs.forEach(function (fl) { fl.panels.forEach(function (P) { var A = P.Lx * P.Ly / 1e6, t = P.t / 1000; add("rcs", A * t); add("fws", Math.max(P.Lx - P.bw, 0) * Math.max(P.Ly - P.bw, 0) / 1e6); }); });
  /* walls */
  if (dt && dt.walls) dt.walls.forEach(function (w) {
    var t = w.t / 1000, Lw = w.Lw / 1000;
    w.endCols.forEach(function (nm) { var c = dt.cols.filter(function (q) { return q.name === nm; })[0]; if (c) Lw -= (w.ax[0] ? c.st[0].D : c.st[0].b) / 2000; });   /* end columns measured with the columns */
    w.storeys.forEach(function (st) { var h = st.h / 1000 - ts; add("rcw", Lw * t * h); add("fww", 2 * Lw * h); });
  });
  /* footings, PCC, excavation, necks, backfill */
  if (dt && dt.foot) dt.foot.forEach(function (ft) {
    var Lx = ft.Lx / 1000, Ly = ft.Ly / 1000, D = ft.D / 1000, a = ft.a / 1000, bc = ft.bc / 1000, neck = Math.max(Df - D, 0);
    var vf = Lx * Ly * D, vp = (Lx + 0.2) * (Ly + 0.2) * 0.1, ve = (Lx + 0.2 + 0.6) * (Ly + 0.2 + 0.6) * (Df + 0.1), vn = a * bc * neck;
    add("rcf", vf); add("fwf", 2 * (Lx + Ly) * D); add("pcc", vp); add("exc", ve); add("rcc", vn); add("fwc", 2 * (a + bc) * neck); add("bfl", ve - vf - vp - vn);
  });
  /* steel from the bar bending schedule, by diameter */
  var byDia = {}, kg = 0;
  if (dt && dt.tot) dt.tot.forEach(function (t) { byDia[t.dia] = t.all; kg += t.all; });
  q.stl = kg;
  var conc = q.rcf + q.rcc + q.rcb + q.rcs + q.rcw;
  var items = BOQ.ITEMS.map(function (it) { return { id: it[0], desc: it[1].replace("{fy}", p.fy), unit: it[2], qty: q[it[0]], grade: /^rc/.test(it[0]) ? "M" + p.fck : "" }; }).filter(function (it) { return it.qty > 1e-9; });
  return { items: items, conc: conc, steelKg: kg, byDia: byDia, ratio: conc > 0 ? kg / conc : 0, Df: Df, ts: ts, schedules: BOQ.schedules(S), amount: 0 };
};
/* amounts with the project's rates */
BOQ.price = function (boq, rates) {
  var sum = 0; boq.items.forEach(function (it) { var r = rates && +rates[it.id]; it.rate = r > 0 ? r : null; it.amt = r > 0 ? r * it.qty : null; if (it.amt) sum += it.amt; }); boq.amount = sum; return boq;
};
/* reinforcement schedules (rows ready for tables) */
BOQ.schedules = function (S) {
  var dt = S.det, o = { cols: [], beams: [], slabs: [], foot: [], walls: [] };
  if (!dt || dt.err || !dt.gB) return o;
  dt.gC.forEach(function (G) { G.rep.st.forEach(function (s, i) { o.cols.push([i ? "" : G.id, i ? "" : G.list.map(function (c) { return c.name; }).join(" "), "Storey " + (s.i + 1), s.b + "×" + s.D, s.ar.n + "-" + s.ar.dia + "φ", s.pct.toFixed(2) + " %", s.tie.dia + "φ" + (s.tie.lB > 2 || s.tie.lD > 2 ? " + " + (s.tie.lB - 2 + s.tie.lD - 2) + " crossties" : ""), s.tie.sc ? "@" + s.tie.sc + " over " + s.tie.lo : "—", "@" + s.tie.sm]); }); });
  dt.gB.forEach(function (G) { var bl = G.rep; bl.spans.forEach(function (sp, j) { o.beams.push([j ? "" : G.id, j ? "" : G.list.map(function (b) { return b.name; }).join(" "), j ? "" : bl.b + "×" + bl.D, "Span " + (j + 1) + " (" + Math.round(sp.Lc) + ")", bl.sup[j].nt + "-" + bl.dia + "φ", sp.nb + "-" + bl.dia + "φ", bl.sup[j + 1].nt + "-" + bl.dia + "φ", sp.sv.ph + "φ@" + sp.sv.sh + " / @" + sp.sv.sm]); }); });
  dt.slabs.forEach(function (fl) { fl.panels.forEach(function (P, j) { o.slabs.push([j ? "" : fl.name, "S" + (j + 1), P.Lx + "×" + P.Ly, P.t, P.bot.X.dia + "φ@" + P.bot.X.s, P.bot.Y.dia + "φ@" + P.bot.Y.s, ["W", "E", "S", "N"].map(function (k) { return P.top[k].sp.dia + "@" + P.top[k].sp.s; }).join(" / ")]); }); });
  dt.gF.forEach(function (G) { var f = G.rep; o.foot.push([G.id, G.list.map(function (c) { return c.name; }).join(" "), f.Lx + "×" + f.Ly, f.D, f.bx.dia + "φ@" + f.bx.s, f.by.dia + "φ@" + f.by.s, G.n]); });
  (dt.gW || []).forEach(function (G) { G.rep.storeys.forEach(function (st, i) { o.walls.push([i ? "" : G.id, i ? "" : G.list.map(function (w) { return w.line; }).join("; "), "Storey " + (i + 1), G.rep.t, st.vb.dia + "φ@" + st.vb.s + (G.rep.two ? " EF" : ""), st.hb.dia + "φ@" + st.hb.s + (G.rep.two ? " EF" : ""), st.be ? (st.beBars ? st.beL + ", " + st.beBars.n + "-" + st.beBars.dia + "φ" : "end columns") : "—"]); }); });
  return o;
};
BOQ.HEAD = { cols: ["Mark", "Columns", "Storey", "Size", "Bars", "Steel", "Ties", "Confining zones", "Middle"], beams: ["Mark", "Beams", "Size", "Span (clear)", "Top left", "Bottom", "Top right", "Hoops ends / middle"],
  slabs: ["Floor", "Panel", "Lx × Ly", "t", "Bottom X", "Bottom Y", "Top W / E / S / N"], foot: ["Mark", "Columns", "Lx × Ly", "D", "Bars X", "Bars Y", "No."], walls: ["Mark", "Walls", "Storey", "t", "Vertical", "Horizontal", "Boundary"] };
if (typeof module !== "undefined") module.exports = BOQ;
