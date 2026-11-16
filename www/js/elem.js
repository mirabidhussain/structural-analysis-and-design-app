/* Project elements: quantities, bar bending schedule and JKSOR 2022 estimate of individually designed members. */
var EL = (function () {
  var E = {};
  E.PREFIX = { beam: "B", slab1: "S", slab2: "S", column: "C", footing: "F", strip: "SF", stair: "ST", pile: "PF", raft: "RF", truss: "T", purlin: "PU", tension: "TM", comp: "CM", sbeam: "SB", bolts: "J", roof: "RL", seismic: "EQ" };
  /* extra dimension needed to take off quantities */
  E.EXTRA = { slab1: ["w", "Slab width (along the supports)", "m", 3], strip: ["len", "Length of the wall footing", "m", 10], stair: ["w", "Width of the flight", "m", 1.2] };
  function sor(k) { return BOQ.SOR[k]; }
  function concRate(kind, fck) {   /* kind: f foundation, c column, b beam/slab */
    if (fck <= 20) return sor(kind === "f" ? "rcM20f" : kind === "c" ? "rcM20c" : "rcM20b");
    var base = sor(kind === "f" ? "dmBelow" : "dmAbove"), ex = fck >= 40 ? sor("ex40") : fck >= 35 ? sor("ex35") : fck >= 30 ? sor("ex30") : null;
    return ex ? [base[0] + " + " + ex[0], base[1] + ex[1]] : base;
  }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function anc(dia, p) { return Math.round(RCC.Ld(dia, p.fy, p.fck) / 3 / 10) * 10; }   /* Ld/3 into each support, IS 456 cl 26.2.3.3 */
  /* returns { conc: [{d, n, L, B, H, q}], fw: [...], pcc: [...], bars: [{mark, desc, dia, n, L, kg}], items: [{d, q, u, sor, rate}], kind, note } — for ONE element */
  E.take = function (id, p, r, x) {
    x = x || {};
    var T = { conc: [], fw: [], pcc: [], bars: [], items: [], kind: "b", note: "" }, res = r && r.res || {}, c = +p.cover || 0;
    function conc(d, L, B, H) { T.conc.push({ d: d, n: 1, L: r3(L), B: r3(B), H: r3(H), q: L * B * H }); }
    function fw(d, L, H, n) { T.fw.push({ d: d, n: n || 1, L: r3(L), B: "", H: r3(H), q: (n || 1) * L * H }); }
    function pcc(d, L, B, H) { T.pcc.push({ d: d, n: 1, L: r3(L), B: r3(B), H: r3(H), q: L * B * H }); }
    function bar(mark, desc, dia, n, Lmm) { if (!(n > 0 && Lmm > 0)) return; n = Math.ceil(n); T.bars.push({ mark: mark, desc: desc, dia: dia, n: n, L: Math.round(Lmm), kg: n * Lmm / 1000 * DT.wpm(dia) }); }
    function nOver(len, s) { return Math.floor(len / s) + 1; }
    switch (id) {
      case "beam": {
        var L = p.L, b = p.b / 1000, D = p.D / 1000, bb = res.bars || { n: 2, dia: 12 };
        conc("Beam " + p.b + " × " + p.D, L, b, D); fw("Beam soffit and sides", L, b + 2 * D);
        bar("a", "Bottom bars, span + Ld/3 into each support", bb.dia, bb.n, L * 1000 + 2 * anc(bb.dia, p));
        bar("b", res.doubly ? "Top (compression) bars" : "Top hanger bars", 12, 2, L * 1000 + 2 * anc(12, p));
        if (res.sv) bar("c", "2-legged stirrups " + p.stir + " mm @ " + res.sv, p.stir, nOver(L * 1000, res.sv), 2 * (p.b - 2 * c + p.D - 2 * c) + 20 * p.stir);
        break;
      }
      case "slab1": {
        var w = x.w || 1, Ls = p.L, m = res.main, ds = res.dist;
        conc("Slab " + p.D + " mm", Ls, w, p.D / 1000); fw("Slab soffit", Ls, w);
        if (m) bar("a", "Main bars " + m.dia + " mm @ " + m.s, m.dia, nOver(w * 1000, m.s), Ls * 1000 + 2 * anc(m.dia, p));
        if (ds) bar("b", "Distribution bars " + ds.dia + " mm @ " + ds.s, ds.dia, nOver(Ls * 1000, ds.s), w * 1000 - 2 * c);
        break;
      }
      case "slab2": {
        var lx = p.lx, ly = p.ly, sp = res.sp || {}, k = 0;
        conc("Slab " + p.D + " mm", lx, ly, p.D / 1000); fw("Slab soffit", lx, ly);
        Object.keys(sp).forEach(function (nm) {
          var q = sp[nm], shortS = /^Short/.test(nm), along = shortS ? lx : ly, across = shortS ? ly : lx, sup = /support/.test(nm), mk = String.fromCharCode(97 + k++);
          if (sup) bar(mk, nm + " — top bars over the continuous edges, 0.3 × span + Ld/3", q.dia, 2 * nOver(across * 1000, q.s), 0.3 * lx * 1000 + anc(q.dia, p));
          else bar(mk, nm + " — bottom bars", q.dia, nOver(across * 1000, q.s), along * 1000 + 2 * anc(q.dia, p));
        });
        T.note = "Top bars assumed over two continuous edges in each direction; torsion steel at corners not included.";
        break;
      }
      case "column": {
        var H = p.L, cb = p.b / 1000, cd = p.D / 1000;
        T.kind = "c"; conc("Column " + p.b + " × " + p.D, cb, cd, H); fw("Column sides", 2 * (cb + cd), H);
        if (res.nb) bar("a", "Main bars incl. lap 50φ", p.dia, res.nb, H * 1000 + 50 * p.dia);
        if (res.ts) bar("b", "Ties " + res.td + " mm @ " + res.ts, res.td, nOver(H * 1000, res.ts), 2 * (p.b - 2 * c + p.D - 2 * c) + 20 * res.td);
        break;
      }
      case "footing": {
        var Lf = res.L, Bf = res.B, Df = res.D / 1000;
        if (!Lf) break;
        T.kind = "f"; conc("Footing", Lf, Bf, Df); fw("Footing sides", 2 * (Lf + Bf), Df); pcc("PCC 1:4:8 under the footing, 100 mm offsets", Lf + 0.2, Bf + 0.2, 0.1);
        if (res.s1) bar("a", "Bottom bars along the length " + res.s1.dia + " mm @ " + res.s1.s, res.s1.dia, nOver(Bf * 1000 - 2 * c, res.s1.s), Lf * 1000 - 2 * c);
        if (res.s2) bar("b", "Bottom bars along the width " + res.s2.dia + " mm @ " + res.s2.s, res.s2.dia, nOver(Lf * 1000 - 2 * c, res.s2.s), Bf * 1000 - 2 * c);
        break;
      }
      case "strip": {
        var len = x.len || 1, B = res.B, Dt = res.D / 1000;
        if (!B) break;
        T.kind = "f"; conc("Wall footing", len, B, Dt); fw("Footing sides", 2 * len, Dt); pcc("PCC 1:4:8 under the footing", len, B + 0.2, 0.1);
        if (res.main) bar("a", "Transverse (main) bars " + res.main.dia + " mm @ " + res.main.s, res.main.dia, nOver(len * 1000, res.main.s), B * 1000 - 2 * c + 2 * (Dt * 1000 - 2 * c));
        if (res.dist) bar("b", "Longitudinal bars " + res.dist.dia + " mm @ " + res.dist.s, res.dist.dia, nOver(B * 1000 - 2 * c, res.dist.s), len * 1000);
        break;
      }
      case "stair": {
        var w2 = x.w || 1, inc = p.L * Math.sqrt(1 + Math.pow(p.R / p.T, 2)), ns = Math.round(p.L * 1000 / p.T), t = (res.t || p.t) / 1000;
        conc("Waist slab " + Math.round(t * 1000) + " mm (inclined length)", inc, w2, t);
        T.conc.push({ d: "Steps " + ns + " nos (½ R × T each)", n: ns, L: r3(w2), B: r3(p.T / 1000), H: r3(p.R / 2000), q: ns * w2 * p.T / 1000 * p.R / 2000 });
        fw("Waist soffit", inc, w2); fw("Risers", w2, p.R / 1000, ns);
        if (res.main) bar("a", "Main bars along the flight " + res.main.dia + " mm @ " + res.main.s, res.main.dia, nOver(w2 * 1000, res.main.s), inc * 1000 + 2 * anc(res.main.dia, p));
        if (res.dist) bar("b", "Distribution bars " + res.dist.dia + " mm @ " + res.dist.s, res.dist.dia, nOver(inc * 1000, res.dist.s), w2 * 1000 - 2 * c);
        break;
      }
      case "pile": {
        var fd = r && r.fd; if (!fd) break;
        T.kind = "f"; T.items = fd.boq.items.map(function (q) { return Object.assign({}, q); });
        fd.bbs.rows.forEach(function (q) { T.bars.push({ mark: q.mark, desc: q.mem + " — " + q.desc, dia: q.dia, n: q.n, L: Math.round(q.L), kg: q.kg }); });
        T.own = true; break;
      }
      case "raft": {
        if (!r || !r.est) break;
        T.kind = "f"; T.items = r.est.items.map(function (q) { return Object.assign({}, q); });
        (r.mat && r.mat.bars || []).forEach(function (q) { T.bars.push({ mark: q.mark, desc: q.desc, dia: q.dia, n: q.n, L: Math.round(q.L), kg: q.n * q.L / 1000 * DT.wpm(q.dia) }); });
        T.own = true; break;
      }
      case "tension": case "comp": case "sbeam": case "purlin": {
        var sec = res.sec, Lm = id === "purlin" ? p.span : p.L, mult = id === "tension" ? +p.n || 1 : id === "comp" && p.type === "da" ? 2 : 1;
        if (sec && sec.m) T.items.push({ d: "Structural steel " + (mult > 1 ? "2 × " : "") + sec.name + " (" + sec.m + " kg/m) × " + Lm + " m", q: mult * sec.m * Lm, u: "kg", sor: sor("sst")[0], rate: sor("sst")[1] });
        T.own = true; break;
      }
      case "truss": {
        if (res.weight) T.items.push({ d: "Structural steel in the roof truss (members + 10 % gussets & bolts)", q: res.weight, u: "kg", sor: sor("sst")[0], rate: sor("sst")[1] });
        T.own = true; break;
      }
    }
    if (!T.own) {
      var cq = T.conc.reduce(function (a, q) { return a + q.q; }, 0), fq = T.fw.reduce(function (a, q) { return a + q.q; }, 0), pq = T.pcc.reduce(function (a, q) { return a + q.q; }, 0), kg = T.bars.reduce(function (a, q) { return a + q.kg; }, 0), cr = concRate(T.kind, +p.fck || 20);
      var where = ({ f: "foundations (footings, bases, rafts) up to plinth", c: "columns", b: id === "beam" ? "beams" : id === "stair" ? "stairs (waist slab and steps)" : "suspended slabs" })[T.kind];
      if (pq) T.items.push({ cat: "pcc", d: "Providing and laying in position cement concrete 1:4:8 (40 mm graded stone aggregate) in levelling course under foundations, excluding shuttering", q: pq, u: "m³", sor: sor("pcc")[0], rate: sor("pcc")[1], rows: T.pcc });
      if (cq) T.items.push({ cat: "rcc", d: "Reinforced cement concrete M" + (p.fck || 20) + " in " + where + ", including compaction and curing, excluding reinforcement and shuttering", q: cq, u: "m³", sor: cr[0], rate: cr[1], rows: T.conc });
      var fk = T.kind === "f" ? "fwf" : T.kind === "c" ? "fwc" : id === "beam" ? "fwb" : id === "stair" ? "fws" : "fws";
      if (fq) T.items.push({ cat: "fw", d: "Centering and shuttering including strutting, propping and removal — " + ({ fwf: "foundations, footings and bases", fwc: "columns", fwb: "beams", fws: id === "stair" ? "stairs (soffit and risers)" : "suspended slabs" })[fk], q: fq, u: "m²", sor: sor(fk)[0], rate: sor(fk)[1], rows: T.fw });
      if (kg) T.items.push({ cat: "stl", d: "Reinforcement Fe " + (p.fy || 500) + " for RCC work including straightening, cutting, bending, placing in position and binding (bar bending schedule + 3 % wastage)", q: kg * 1.03, u: "kg", sor: sor(+p.fy >= 500 ? "stl500" : "stl415")[0], rate: 123.20, rows: T.bars.map(function (q) { return { d: q.mark + " — " + q.desc, n: q.n, L: q.L / 1000, H: DT.wpm(q.dia), hU: "kg/m", q: q.kg, dia: q.dia }; }), wastage: 3 });
    } else T.items.forEach(function (q) { q.cat = q.cat || (q.u === "kg" && /einforcement/.test(q.d) ? "stl" : /RCC|concrete/i.test(q.d) && q.u === "m³" ? "rcc" : "own"); q.rows = q.rows || [{ d: q.d, src: "", q: q.q }]; });
    return T;
  };
  /* combine elements [{mark, nos, take}] → schedule, BBS and estimate */
  E.combine = function (els) {
    var bbs = [], meas = [], items = {}, order = [];
    els.forEach(function (e) {
      var t = e.take, n = e.nos || 1;
      t.bars.forEach(function (q) { bbs.push({ el: e.mark, mark: e.mark + "-" + q.mark, desc: q.desc, dia: q.dia, n: q.n * n, L: q.L, kg: q.kg * n }); });
      t.conc.concat(t.pcc, t.fw).forEach(function (q) { meas.push({ el: e.mark, d: q.d, n: q.n * n, L: q.L, B: q.B, H: q.H, q: q.q * n }); });
      t.items.forEach(function (q) {
        var key = q.d.replace(/ — \d+ × .*$/, "").replace(/\(.*kg\/m\) × .* m$/, "") + "|" + q.sor + "|" + q.u + "|" + q.rate;
        if (!items[key]) { items[key] = { d: q.d.replace(/ — \d+ × .*$/, ""), sor: q.sor, u: q.u, rate: q.rate, q: 0, from: [] }; order.push(key); }
        items[key].q += q.q * n; items[key].from.push(e.mark);
      });
    });
    var list = order.map(function (k) { return items[k]; }), sum = list.reduce(function (a, q) { return a + q.q * (q.rate || 0); }, 0);
    var byDia = {}; bbs.forEach(function (q) { byDia[q.dia] = (byDia[q.dia] || 0) + q.kg; });
    return { bbs: bbs, meas: meas, items: list, sum: sum, byDia: byDia, kg: bbs.reduce(function (a, q) { return a + q.kg; }, 0) };
  };
  return E;
})();
if (typeof module !== "undefined") module.exports = EL;
