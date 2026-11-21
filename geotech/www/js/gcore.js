/* IS GeoTech engine — soil profile, SPT, classification (IS 1498), bearing capacity (IS 6403), stresses (Boussinesq),
   settlement (IS 8009 Pt 1: elastic by Steinbrenner + consolidation and time), weak-layer and yield checks,
   plate load test (IS 1888), settlement limits (IS 1904:2021 Table 1). Units: m, kN, kPa, mm for settlement. */
var GC = (function () {
  "use strict";
  var C = {}, GW = 9.81, D2R = Math.PI / 180;
  C.VERSION = "1.0";
  var uidN = 0; C.uid = function () { return "g" + Date.now().toString(36) + (uidN++).toString(36); };
  function r(v, d) { var k = Math.pow(10, d === undefined ? 2 : d); return Math.round(v * k) / k; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  C.r = r;

  /* ---------------- project ---------------- */
  C.KINDS = { sand: "Sand", gravel: "Gravel", silt: "Silt", clay: "Clay", rock: "Weathered rock" };
  C.blank = function (name) {
    return { app: "IS GeoTech", v: C.VERSION, name: name || "New site", fs: 2.5, struct: "rc", depthF: false, cut: 0.1,
      boreholes: [], footings: [], plates: [], labs: [] };
  };
  C.layer = function (o) {
    return Object.assign({ id: C.uid(), top: 0, bot: 1, name: "", kind: "sand", gamma: 18, gsat: 19, c: 0, phi: 30, cu: 0, Dr: 0, E: 0, nu: 0.3,
      Cc: 0, Cr: 0, e0: 0, pc: 0, mv: 0, cv: 0 }, o || {});
  };
  C.sample = function () {
    var P = C.blank("Sample site — Srinagar alluvium");
    P.boreholes.push({ id: "bh1", name: "BH-1", gwt: 2.0, layers: [
      C.layer({ top: 0, bot: 1.0, name: "Filled-up soil", kind: "silt", gamma: 17, gsat: 18, c: 5, phi: 24, E: 6000, nu: 0.3 }),
      C.layer({ top: 1.0, bot: 4.0, name: "Brown silty sand, medium dense", kind: "sand", gamma: 18, gsat: 19.5, phi: 0, E: 0, nu: 0.3 }),
      C.layer({ top: 4.0, bot: 7.0, name: "Grey soft silty clay", kind: "clay", gamma: 17.5, gsat: 17.5, cu: 30, E: 9000, nu: 0.5, Cc: 0.28, Cr: 0.04, e0: 0.95, pc: 0, cv: 2.0 }),
      C.layer({ top: 7.0, bot: 15.0, name: "Dense sandy gravel", kind: "gravel", gamma: 19, gsat: 20.5, phi: 38, E: 60000, nu: 0.3 })
    ], spt: [{ z: 1.5, N: 9 }, { z: 3.0, N: 14 }, { z: 4.5, N: 4 }, { z: 6.0, N: 5 }, { z: 7.5, N: 32 }, { z: 9.0, N: 41 }, { z: 10.5, N: 48 }] });
    P.footings.push({ id: "f1", name: "F1 (interior column)", bh: "bh1", shape: "square", B: 2.0, L: 2.0, Df: 1.5, P: 900, H: 0, eB: 0, eL: 0, x: 0, y: 0 });
    P.plates.push({ id: "p1", name: "PLT-1 at 1.5 m", Bp: 0.3, Bf: 2.0, soil: "sand", rows: [[0, 0], [50, 1.1], [100, 2.4], [150, 3.9], [200, 5.8], [250, 8.3], [300, 12.0], [350, 17.5], [400, 25.5]] });
    P.labs.push({ id: "l1", name: "BH-1 @ 2.0 m", sieve: [[4.75, 0], [2.0, 18], [0.425, 112], [0.075, 205]], total: 500, LL: 0, PL: 0, organic: false });
    return P;
  };
  C.save = function (P) { return JSON.stringify(P, null, 1); };
  C.load = function (t) {
    var P = JSON.parse(t); if (!P || !P.boreholes) throw new Error("Not an IS GeoTech project file");
    var B = C.blank(P.name); Object.keys(B).forEach(function (k) { if (P[k] === undefined) P[k] = B[k]; });
    P.boreholes.forEach(function (b) { b.layers = b.layers.map(C.layer); b.spt = b.spt || []; });
    return P;
  };
  C.gwt = function (bh) { return bh.gwt === "" || bh.gwt === null || bh.gwt === undefined || isNaN(+bh.gwt) ? Infinity : +bh.gwt; };
  C.bh = function (P, id) { return P.boreholes.filter(function (b) { return b.id === id; })[0] || P.boreholes[0]; };
  C.layerAt = function (bh, z) {
    var L = bh.layers; for (var i = 0; i < L.length; i++) if (z >= L[i].top - 1e-9 && z < L[i].bot - 1e-9) return L[i];
    return z >= 0 && L.length ? L[L.length - 1] : null;
  };
  C.depth = function (bh) { return bh.layers.length ? bh.layers[bh.layers.length - 1].bot : 0; };

  /* vertical stresses at depth z below ground: total, pore pressure, effective (kPa) */
  C.sv = function (bh, z) {
    var s = 0, w = C.gwt(bh), L = bh.layers;
    for (var i = 0; i < L.length && L[i].top < z; i++) {
      var a = L[i].top, b = Math.min(L[i].bot, z);
      var dry = Math.max(0, Math.min(b, w) - a), wet = Math.max(0, b - Math.max(a, w));
      s += dry * L[i].gamma + wet * (L[i].gsat || L[i].gamma);
    }
    if (L.length && z > C.depth(bh)) { var l = L[L.length - 1], d = z - C.depth(bh); s += d * (z > w ? (l.gsat || l.gamma) : l.gamma); }
    var u = Math.max(0, z - w) * GW;
    return { t: s, u: u, e: s - u };
  };

  /* ---------------- SPT (IS 2131 practice; correlations labelled) ---------------- */
  C.phiFromN = function (N) { return clamp(27.1 + 0.3 * N - 0.00054 * N * N, 25, 45); };          /* Peck–Hanson–Thornburn curve (IS 6403 Fig. 1), Wolff (1989) fit */
  C.DrFromN = function (N, sv) { return clamp(21 * Math.sqrt(N / (sv / 98.1 + 0.7)), 0, 100); }; /* Meyerhof (1957), from Gibbs & Holtz */
  C.cuFromN = function (N) { return 4.5 * N; };                                                    /* Stroud (1974), estimate only */
  C.EFromN = function (N) { return 500 * (N + 15); };                                              /* Bowles, normally consolidated sand, kPa */
  C.spt = function (bh) {
    return (bh.spt || []).slice().sort(function (a, b) { return a.z - b.z; }).map(function (s) {
      var L = C.layerAt(bh, s.z), sv = C.sv(bh, s.z).e, CN = clamp(0.77 * Math.log10(2000 / Math.max(sv, 25)), 0, 2), N1 = s.N * CN, N2 = N1;
      var fine = L && (L.kind === "sand" || L.kind === "silt"), sub = s.z > C.gwt(bh);
      if (fine && sub && N1 > 15) N2 = 15 + 0.5 * (N1 - 15);
      return { z: s.z, N: s.N, layer: L ? L.name : "", kind: L ? L.kind : "", sv: sv, CN: CN, N1: N1, Nc: N2, dil: N2 !== N1, phi: C.phiFromN(N2), Dr: C.DrFromN(s.N, sv), cu: C.cuFromN(s.N) };
    });
  };
  /* design N under a footing: corrected N averaged from the base to base + 1.5B; values over 1.5 × the average dropped (IS 6403 cl. 5.2.2) */
  C.designN = function (bh, Df, B) {
    var rows = C.spt(bh).filter(function (s) { return s.z >= Df - 1e-9 && s.z <= Df + 1.5 * B + 1e-9; });
    if (!rows.length) { var all = C.spt(bh).filter(function (s) { return s.z >= Df; }); if (all.length) rows = [all[0]]; }
    if (!rows.length) return null;
    var avg = rows.reduce(function (a, s) { return a + s.Nc; }, 0) / rows.length, kept = rows.filter(function (s) { return s.Nc <= 1.5 * avg || s.Nc < avg; });
    var N = kept.reduce(function (a, s) { return a + s.Nc; }, 0) / kept.length;
    return { N: N, rows: rows, dropped: rows.length - kept.length };
  };
  /* layer parameters with gaps filled from SPT (marked as correlations) */
  C.params = function (bh, L) {
    var o = Object.assign({}, L), src = {}, rows = C.spt(bh).filter(function (s) { return s.z >= L.top && s.z < L.bot; });
    var Nr = rows.length ? rows.reduce(function (a, s) { return a + s.Nc; }, 0) / rows.length : null, Nraw = rows.length ? rows.reduce(function (a, s) { return a + s.N; }, 0) / rows.length : null;
    var coh = L.kind === "clay";
    if (!coh && !(o.phi > 0) && Nr !== null) { o.phi = r(C.phiFromN(Nr), 1); src.phi = "from SPT N′ = " + r(Nr, 1); }
    if (coh && !(o.cu > 0) && Nraw !== null) { o.cu = r(C.cuFromN(Nraw), 0); src.cu = "from SPT N = " + r(Nraw, 1) + " (Stroud)"; }
    if (!coh && !(o.Dr > 0) && Nraw !== null) { var zm = rows.reduce(function (a, s) { return a + s.sv; }, 0) / rows.length; o.Dr = r(C.DrFromN(Nraw, zm), 0); src.Dr = "from SPT (Meyerhof)"; }
    if (!(o.E > 0)) {
      if (!coh && Nr !== null) { o.E = r(C.EFromN(Nr), -2); src.E = "from SPT (Bowles 500(N+15))"; }
      else if (coh && o.cu > 0) { o.E = r(300 * o.cu, -2); src.E = "300·cu (estimate)"; }
      else if (L.kind === "rock") { o.E = 200000; src.E = "assumed"; }
    }
    if (coh && !(o.nu > 0)) o.nu = 0.5;
    o.N = Nr; o.src = src; return o;
  };

  /* ---------------- classification (IS 1498:1970) ---------------- */
  C.sieve = function (rows, total) {
    var s = rows.slice().filter(function (a) { return a[0] > 0; }).sort(function (a, b) { return b[0] - a[0]; }), cum = 0, T = total || s.reduce(function (a, x) { return a + x[1]; }, 0);
    return s.map(function (a) { cum += +a[1]; return { d: a[0], ret: a[1], pf: clamp(100 * (1 - cum / T), 0, 100) }; });
  };
  function Dx(curve, p) {
    for (var i = 0; i + 1 < curve.length; i++) { var a = curve[i], b = curve[i + 1]; if ((a.pf - p) * (b.pf - p) <= 0 && a.pf !== b.pf) return Math.pow(10, Math.log10(a.d) + (p - a.pf) / (b.pf - a.pf) * (Math.log10(b.d) - Math.log10(a.d))); }
    return null;
  }
  function pfAt(curve, d) {
    for (var i = 0; i + 1 < curve.length; i++) { var a = curve[i], b = curve[i + 1]; if (d <= a.d && d >= b.d) return a.pf + (Math.log10(d) - Math.log10(a.d)) / (Math.log10(b.d) - Math.log10(a.d)) * (b.pf - a.pf); }
    return d > curve[0].d ? 100 : curve[curve.length - 1].pf;
  }
  C.aline = function (LL) { return 0.73 * (LL - 20); };
  C.classify = function (lab) {
    var cv = lab.sieve && lab.sieve.length ? C.sieve(lab.sieve, lab.total) : null, out = { curve: cv, notes: [] };
    var F = cv ? pfAt(cv, 0.075) : +lab.fines, G = cv ? 100 - pfAt(cv, 4.75) : +lab.gravel, S = 100 - F - G;
    var LL = +lab.LL || 0, PL = +lab.PL || 0, PI = LL && PL ? Math.max(0, LL - PL) : 0, np = !LL || !PL || PI === 0;
    out.F = F; out.G = G; out.S = S; out.LL = LL; out.PL = PL; out.PI = PI;
    function plas() { if (np) return "M"; var A = C.aline(LL); if (PI > 7 && PI >= A) return "C"; if (PI < 4 || PI < A) return "M"; return "CM"; }
    var name = { G: "gravel", S: "sand", W: "well graded", P: "poorly graded", M: "silty", C: "clayey" };
    if (F > 50) {
      var c = LL < 35 ? "L" : LL <= 50 ? "I" : "H", p = plas(), comp = { L: "low", I: "intermediate", H: "high" }[c];
      if (lab.organic) out.sym = "O" + c, out.name = "Organic silt/clay of " + comp + " compressibility";
      else if (p === "CM") out.sym = "CL-ML", out.name = "Silty clay of low plasticity (hatched zone)";
      else out.sym = (p === "C" ? "C" : "M") + c, out.name = (p === "C" ? "Clay" : "Silt") + " of " + comp + " compressibility";
      if (np) out.notes.push("Liquid and plastic limits not given — taken as non-plastic.");
    } else {
      var g = G > S ? "G" : "S", sym;
      out.D10 = cv ? Dx(cv, 10) : null; out.D30 = cv ? Dx(cv, 30) : null; out.D60 = cv ? Dx(cv, 60) : null;
      if (out.D10 && out.D60) { out.Cu = out.D60 / out.D10; out.Cc = out.D30 * out.D30 / (out.D10 * out.D60); }
      var well = out.Cu && out.Cc && out.Cu > (g === "G" ? 4 : 6) && out.Cc >= 1 && out.Cc <= 3, grad = well ? "W" : "P";
      if (!out.Cu && F < 12) out.notes.push("D10 is below the finest sieve — gradation taken as poorly graded.");
      if (F < 5) sym = g + grad;
      else if (F > 12) { var p2 = plas(); sym = p2 === "CM" ? g + "M-" + g + "C" : g + p2; }
      else { var p3 = plas() === "C" ? "C" : "M"; sym = g + grad + "-" + g + p3; out.notes.push("Fines 5–12 %: dual symbol."); }
      out.sym = sym;
      var base = (g === "G" ? "Gravel" : "Sand");
      out.name = sym.length === 2 ? (sym[1] === "W" ? "Well graded " : sym[1] === "P" ? "Poorly graded " : sym[1] === "M" ? "Silty " : "Clayey ") + base.toLowerCase() : base + " with fines (" + sym + ")";
      out.name = out.name.charAt(0).toUpperCase() + out.name.slice(1);
    }
    out.kind = F > 50 ? (out.sym[0] === "C" ? "clay" : "silt") : G > S ? "gravel" : "sand";
    return out;
  };

  /* ---------------- bearing capacity (IS 6403:1981) ---------------- */
  C.factors = function (phi) {
    if (phi < 1e-6) return { Nc: 5.14, Nq: 1, Ng: 0 };
    var t = Math.tan(phi * D2R), Nq = Math.exp(Math.PI * t) * Math.pow(Math.tan((45 + phi / 2) * D2R), 2);
    return { Nc: (Nq - 1) / t, Nq: Nq, Ng: 2 * (Nq + 1) * t };
  };
  function dims(f) {
    var B = +f.B, L = f.shape === "square" || f.shape === "circle" ? B : f.shape === "strip" ? Infinity : Math.max(+f.L, B);
    if (f.shape === "rect" && +f.L < B) { L = B; B = +f.L; }
    var B1 = B - 2 * Math.abs(+f.eB || 0), L1 = L === Infinity ? L : L - 2 * Math.abs(+f.eL || 0);
    if (L1 < B1) { var t = B1; B1 = L1; L1 = t; }
    var A = f.shape === "circle" ? Math.PI * B * B / 4 : f.shape === "strip" ? B : B * L, A1 = f.shape === "circle" ? A * B1 / B : f.shape === "strip" ? B1 : B1 * L1;
    return { B: B, L: L, B1: B1, L1: L1, A: A, A1: A1 };
  }
  C.dims = dims;
  function shapeF(shape, B, L) {
    if (shape === "strip") return { sc: 1, sq: 1, sg: 1 };
    if (shape === "square") return { sc: 1.3, sq: 1.2, sg: 0.8 };
    if (shape === "circle") return { sc: 1.3, sq: 1.2, sg: 0.6 };
    var k = B / L; return { sc: 1 + 0.2 * k, sq: 1 + 0.2 * k, sg: 1 - 0.4 * k };
  }
  /* weighted average of soil properties over the zone base → base + B (the zone of shear) */
  C.zoneAvg = function (bh, z1, z2) {
    var w = 0, a = { c: 0, phi: 0, gamma: 0, cu: 0, cuw: 0, clay: 0 };
    bh.layers.forEach(function (L) {
      var t = Math.max(0, Math.min(L.bot, z2) - Math.max(L.top, z1)); if (!t) return;
      var p = C.params(bh, L), g = (L.top + L.bot) / 2 > C.gwt(bh) ? (p.gsat || p.gamma) : p.gamma;
      w += t; a.c += t * (+p.c || 0); a.phi += t * (p.kind === "clay" ? (+L.phi || 0) : (+p.phi || 0)); a.gamma += t * g;
      if (p.kind === "clay") { a.clay += t; if (p.cu > 0) { a.cu += t * p.cu; a.cuw += t; } }
    });
    if (!w) return null;
    return { c: a.c / w, phi: a.phi / w, gamma: a.gamma / w, cu: a.cuw ? a.cu / a.cuw : 0, clayFrac: a.clay / w };
  };
  C.bearing = function (P, f) {
    var bh = C.bh(P, f.bh), d = dims(f), Df = +f.Df, steps = [], W = C.gwt(bh);
    var z = C.zoneAvg(bh, Df, Df + Math.max(d.B1, 0.3)), q = C.sv(bh, Df).e, sh = shapeF(f.shape === "square" && Math.abs(d.B1 - d.L1) > 1e-9 ? "rect" : f.shape, Math.min(d.B1, d.L1), Math.max(d.B1, d.L1));
    if (!z) return { err: "The footing base is below the borehole log" };
    var alpha = +f.P > 0 ? Math.atan2(+f.H || 0, +f.P) / D2R : 0, Wp = clamp(0.5 + 0.5 * (W - Df) / d.B1, 0.5, 1);
    steps.push("Effective dimensions B′ = " + r(d.B1) + " m" + (d.L !== Infinity ? ", L′ = " + r(d.L1) + " m" : " (strip)") + (+f.eB || +f.eL ? " (B − 2e, IS 6403 cl. 5.0.1)" : ""));
    steps.push("Effective overburden at the base q = σ′v(" + r(Df) + " m) = " + r(q, 1) + " kPa");
    steps.push("Zone of shear " + r(Df) + "–" + r(Df + d.B1) + " m: averaged c = " + r(z.c, 1) + " kPa, φ = " + r(z.phi, 1) + "°, γ = " + r(z.gamma, 1) + " kN/m³" + (z.cu ? ", cu = " + r(z.cu, 1) + " kPa" : ""));
    steps.push("Water table factor W′ = " + r(Wp, 3) + (W >= Df + d.B1 ? " (water below Df + B)" : W <= Df ? " (water at or above the base)" : " (interpolated)") + " — IS 6403 cl. 5.1.2.4");
    steps.push("Shape factors sc = " + r(sh.sc, 3) + ", sq = " + r(sh.sq, 3) + ", sγ = " + r(sh.sg, 3) + " (Table 2)");
    var res = { dims: d, q: q, Wp: Wp, alpha: alpha, zone: z, shape: sh, steps: steps, cases: [] };
    function drained(phi, c, tag) {
      var F = C.factors(phi), Nf = Math.pow(Math.tan((45 + phi / 2) * D2R), 2), dk = P.depthF && Df > 0;
      var dc = dk ? 1 + 0.2 * Df / d.B1 * Math.sqrt(Nf) : 1, dq = dk && phi > 10 ? 1 + 0.1 * Df / d.B1 * Math.sqrt(Nf) : 1, dg = dq;
      var ic = Math.pow(1 - alpha / 90, 2), ig = phi > 0 ? Math.pow(clamp(1 - alpha / phi, 0, 1), 2) : 0;
      var t1 = c * F.Nc * sh.sc * dc * ic, t2 = q * (F.Nq - 1) * sh.sq * dq * ic, t3 = 0.5 * d.B1 * z.gamma * F.Ng * sh.sg * dg * ig * Wp;
      return { tag: tag, phi: phi, c: c, F: F, dc: dc, dq: dq, ic: ic, ig: ig, t1: t1, t2: t2, t3: t3, qnu: t1 + t2 + t3 };
    }
    if (z.cu > 0 && z.clayFrac > 0.5) {
      var dcu = P.depthF ? 1 + 0.2 * Df / d.B1 : 1, icu = Math.pow(1 - alpha / 90, 2), qu = z.cu * 5.14 * sh.sc * dcu * icu;
      res.cases.push({ tag: "Undrained (short term), φ = 0", phi: 0, c: z.cu, F: C.factors(0), dc: dcu, ic: icu, t1: qu, t2: 0, t3: 0, qnu: qu });
      steps.push("Cohesive zone: qnu = cu·Nc·sc·dc·ic = " + r(z.cu, 1) + " × 5.14 × " + r(sh.sc, 3) + " × " + r(dcu, 3) + " × " + r(icu, 3) + " = " + r(qu, 1) + " kPa (cl. 5.3.1.1)");
    }
    if (z.phi > 0 || (z.c > 0 && !(z.cu > 0 && z.clayFrac > 0.5))) {
      var gen = drained(z.phi, z.c, "General shear"), Dr = null, bl = bh.layers.filter(function (L) { return L.top <= Df + 1e-9 && L.bot > Df; })[0];
      if (bl && bl.kind !== "clay") { Dr = C.params(bh, bl).Dr || null; }
      var wt = Dr === null ? 1 : clamp((Dr - 20) / 50, 0, 1);
      if (wt < 1) {
        var phiL = Math.atan(2 / 3 * Math.tan(z.phi * D2R)) / D2R, loc = drained(phiL, 2 / 3 * z.c, "Local shear");
        var qnu = wt * gen.qnu + (1 - wt) * loc.qnu;
        res.cases.push({ tag: "Drained — " + (wt === 0 ? "local shear" : "between local and general shear (Dr = " + r(Dr, 0) + " %)"), phi: z.phi, c: z.c, gen: gen, loc: loc, w: wt, qnu: qnu, F: gen.F, t1: gen.t1, t2: gen.t2, t3: gen.t3, dc: gen.dc, dq: gen.dq, ic: gen.ic, ig: gen.ig });
        steps.push("Relative density " + r(Dr, 0) + " % → " + (wt === 0 ? "local shear (Dr ≤ 20 %)" : "interpolate between local (Dr 20 %) and general (Dr 70 %) shear") + ", IS 6403 Table 3; local shear uses c′ = ⅔c and tan φ′ = ⅔ tan φ (φ′ = " + r(phiL, 1) + "°)");
      } else {
        res.cases.push(gen); if (Dr !== null) steps.push("Relative density " + r(Dr, 0) + " % ≥ 70 % → general shear (IS 6403 Table 3)");
      }
      var g0 = res.cases[res.cases.length - 1];
      steps.push("Nc = " + r(gen.F.Nc, 2) + ", Nq = " + r(gen.F.Nq, 2) + ", Nγ = " + r(gen.F.Ng, 2) + " for φ = " + r(z.phi, 1) + "° (Table 1)" + (P.depthF ? "; depth factors dc = " + r(gen.dc, 3) + ", dq = dγ = " + r(gen.dq, 3) : "; depth factors not used (backfill not certified as compacted)"));
      steps.push("qnu = c·Nc·sc·dc·ic + q(Nq − 1)·sq·dq·iq + ½·B′·γ·Nγ·sγ·dγ·iγ·W′ = " + r(gen.t1, 1) + " + " + r(gen.t2, 1) + " + " + r(gen.t3, 1) + " = " + r(gen.qnu, 1) + " kPa" + (g0 !== gen ? " (general); governing " + r(g0.qnu, 1) + " kPa" : ""));
    }
    if (alpha > 0) steps.push("Load inclination α = " + r(alpha, 1) + "° → ic = iq = (1 − α/90)², iγ = (1 − α/φ)² (cl. 5.1.2.3)");
    var gov = res.cases.reduce(function (a, c) { return !a || c.qnu < a.qnu ? c : a; }, null);
    res.qnu = gov ? gov.qnu : 0; res.gov = gov;
    res.qns = res.qnu / (+P.fs || 2.5); res.qsg = res.qns + q;
    res.qnet = +f.P > 0 ? +f.P / d.A1 : 0;
    steps.push("Net safe bearing capacity = qnu / FS = " + r(res.qnu, 1) + " / " + (+P.fs || 2.5) + " = " + r(res.qns, 1) + " kPa; safe gross = " + r(res.qsg, 1) + " kPa");
    return res;
  };

  /* ---------------- stresses (Boussinesq) ---------------- */
  C.fadum = function (m, n) {
    var m2 = m * m, n2 = n * n, s = Math.sqrt(m2 + n2 + 1);
    return (2 * m * n * s / (m2 + n2 + m2 * n2 + 1) * (m2 + n2 + 2) / (m2 + n2 + 1) + Math.atan2(2 * m * n * s, m2 + n2 + 1 - m2 * n2)) / (4 * Math.PI);
  };
  function corner(a, b, z) { if (!a || !b) return 0; return Math.sign(a) * Math.sign(b) * C.fadum(Math.abs(a) / z, Math.abs(b) / z); }
  C.rectAt = function (q, x1, x2, y1, y2, x, y, z) {
    if (z < 1e-6) return x > x1 && x < x2 && y > y1 && y < y2 ? q : 0;
    return q * (corner(x2 - x, y2 - y, z) - corner(x1 - x, y2 - y, z) - corner(x2 - x, y1 - y, z) + corner(x1 - x, y1 - y, z));
  };
  C.stripAt = function (q, x1, x2, x, z) {
    if (z < 1e-6) return x > x1 && x < x2 ? q : 0;
    var b1 = Math.atan((x - x1) / z), b2 = Math.atan((x - x2) / z);
    return q / Math.PI * (b1 - b2 + Math.sin(b1) * Math.cos(b1) - Math.sin(b2) * Math.cos(b2));
  };
  C.circleAt = function (q, R, x, y, z) {
    var rr = Math.hypot(x, y);
    if (z < 1e-6) return rr < R ? q : 0;
    if (rr < 1e-9) return q * (1 - Math.pow(1 / (1 + (R / z) * (R / z)), 1.5));
    var s = 0, nr = 40, nt = 72;
    for (var i = 0; i < nr; i++) { var ra = R * (i + 0.5) / nr, dA = (R / nr) * ra * 2 * Math.PI / nt;
      for (var j = 0; j < nt; j++) { var t = 2 * Math.PI * (j + 0.5) / nt, dx = ra * Math.cos(t) - x, dy = ra * Math.sin(t) - y, R2 = dx * dx + dy * dy + z * z; s += 3 * z * z * z / (2 * Math.PI * Math.pow(R2, 2.5)) * dA; } }
    return q * s;
  };
  /* added vertical stress at (x, y, depth below base dz) from footing f with net pressure q; x, y global */
  C.dsig = function (f, q, x, y, dz) {
    var d = dims(f), cx = +f.x || 0, cy = +f.y || 0;
    if (f.shape === "strip") return C.stripAt(q, cx - d.B1 / 2, cx + d.B1 / 2, x, dz);
    if (f.shape === "circle") return C.circleAt(q, d.B1 / 2, x - cx, y - cy, dz);
    return C.rectAt(q, cx - d.B1 / 2, cx + d.B1 / 2, cy - d.L1 / 2, cy + d.L1 / 2, x, y, dz); /* B along X, L along Y */
  };
  /* total added stress at a point from all footings (each at its own base level) — z is depth below ground */
  C.dsigAll = function (P, x, y, z, only) {
    var s = 0; (only ? [only] : P.footings).forEach(function (f) { var dz = z - +f.Df; if (dz <= 0) return; var q = +f.P > 0 ? +f.P / dims(f).A1 : 0; s += C.dsig(f, q, x, y, dz); });
    return s;
  };
  /* stress grid on a vertical section (along X through y0) for contouring */
  C.bulbGrid = function (P, f, opt) {
    opt = opt || {}; var d = dims(f), B = d.B1, cx = +f.x || 0, cy = +f.y || 0, nx = opt.nx || 61, nz = opt.nz || 61;
    var x0 = cx - 2.5 * B, x1 = cx + 2.5 * B, z0 = +f.Df, z1 = +f.Df + (opt.depth || Math.max(4 * B, f.shape === "strip" ? 6 * B : 4 * B));
    if (opt.group) { P.footings.forEach(function (g) { if (+g.y === cy || f.shape === "strip") { x0 = Math.min(x0, +g.x - 2 * dims(g).B1); x1 = Math.max(x1, +g.x + 2 * dims(g).B1); } }); }
    var q = +f.P > 0 ? +f.P / d.A1 : 100, v = [];
    for (var j = 0; j < nz; j++) { var row = [], z = z0 + (z1 - z0) * j / (nz - 1);
      for (var i = 0; i < nx; i++) { var x = x0 + (x1 - x0) * i / (nx - 1); row.push(opt.group ? C.dsigAll(P, x, cy, z) : C.dsig(f, q, x, cy, z - z0)); } v.push(row); }
    return { x0: x0, x1: x1, z0: z0, z1: z1, nx: nx, nz: nz, v: v, q: q };
  };
  /* marching squares → line segments for one level */
  C.contour = function (g, lev) {
    var seg = [], dx = (g.x1 - g.x0) / (g.nx - 1), dz = (g.z1 - g.z0) / (g.nz - 1);
    function P_(i, j) { return [g.x0 + i * dx, g.z0 + j * dz]; }
    function lerp(a, b, va, vb) { var t = (lev - va) / (vb - va); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; }
    for (var j = 0; j + 1 < g.nz; j++) for (var i = 0; i + 1 < g.nx; i++) {
      var a = g.v[j][i], b = g.v[j][i + 1], c = g.v[j + 1][i + 1], dd = g.v[j + 1][i], k = (a > lev) | (b > lev) << 1 | (c > lev) << 2 | (dd > lev) << 3;
      if (k === 0 || k === 15) continue;
      var pa = P_(i, j), pb = P_(i + 1, j), pc = P_(i + 1, j + 1), pd = P_(i, j + 1), e = [];
      if ((a > lev) !== (b > lev)) e.push(lerp(pa, pb, a, b)); if ((b > lev) !== (c > lev)) e.push(lerp(pb, pc, b, c));
      if ((c > lev) !== (dd > lev)) e.push(lerp(pc, pd, c, dd)); if ((dd > lev) !== (a > lev)) e.push(lerp(pd, pa, dd, a));
      if (e.length === 2) seg.push(e); else if (e.length === 4) { seg.push([e[0], e[1]]); seg.push([e[2], e[3]]); }
    }
    return seg;
  };

  /* ---------------- settlement (IS 8009 Part 1) ---------------- */
  /* Steinbrenner: settlement of the corner of a flexible b × l area on a layer of thickness H (per unit q/E) */
  C.stein = function (m, n, nu) {
    var m2 = m * m, n2 = n * n, A = Math.sqrt(m2 + n2 + 1);
    var F1 = (m * Math.log((1 + Math.sqrt(m2 + 1)) * Math.sqrt(m2 + n2) / (m * (1 + A))) + Math.log((m + Math.sqrt(m2 + 1)) * Math.sqrt(1 + n2) / (m + A))) / Math.PI;
    var F2 = n / (2 * Math.PI) * Math.atan(m / (n * A));
    return { F1: F1, F2: F2, I: (1 - nu * nu) * F1 + (1 - nu - 2 * nu * nu) * F2 };
  };
  function centreS(q, b, l, H, E, nu) { /* centre of a b × l flexible area, depth H */
    if (H <= 0) return 0; var bb = b / 2, ll = l / 2, m = Math.max(ll, bb) / Math.min(ll, bb), n = H / Math.min(ll, bb);
    return 4 * q * Math.min(ll, bb) / E * C.stein(m, n, nu).I;
  }
  C.U = function (Tv) { return Tv <= 0 ? 0 : Tv < 0.2827 ? Math.sqrt(4 * Tv / Math.PI) : 1 - 8 / (Math.PI * Math.PI) * Math.exp(-Math.PI * Math.PI * Tv / 4); };
  C.Tv = function (U) { if (U <= 0) return 0; if (U <= 0.6) return Math.PI / 4 * U * U; return -0.933 * Math.log10(1 - U) - 0.085; };
  /* settlement of footing f at net pressure q (kPa) → mm; detailed per layer */
  C.settle = function (P, f, q, opt) {
    opt = opt || {}; var bh = C.bh(P, f.bh), d = dims(f), Df = +f.Df, out = { layers: [], q: q, imm: 0, con: 0, notes: [] }, bot = C.depth(bh);
    var b = f.shape === "circle" ? Math.sqrt(Math.PI) * d.B1 / 2 : d.B1, l = f.shape === "strip" ? 20 * d.B1 : f.shape === "circle" ? b : d.L1;
    /* depth of influence: where the added stress falls below 10 % (default) of the effective overburden */
    var zi = Df + 0.1, cut = +P.cut || 0.1;
    for (var z = Df + 0.1; z <= bot + 1e-9; z += 0.1) { zi = z; if (C.dsig(f, q, +f.x || 0, +f.y || 0, z - Df) < cut * Math.max(C.sv(bh, z).e, 1)) break; }
    out.zi = zi;
    bh.layers.forEach(function (L) {
      var a = Math.max(L.top, Df), c = Math.min(L.bot, zi); if (c <= a) return;
      var p = C.params(bh, L), row = { name: L.name || C.KINDS[L.kind], kind: L.kind, top: a, bot: c, imm: 0, con: 0, src: p.src };
      if (p.E > 0) { row.E = p.E; row.imm = 1000 * (centreS(q, b, l, c - Df, p.E, p.nu || 0.3) - centreS(q, b, l, a - Df, p.E, p.nu || 0.3)); }
      if (L.kind === "clay" && ((p.Cc > 0 && p.e0 > 0) || p.mv > 0)) {
        var n = Math.max(1, Math.ceil((c - a) / 0.5)), h = (c - a) / n, s = 0, yld = false, maxR = 0;
        for (var k = 0; k < n; k++) {
          var zm = a + (k + 0.5) * h, s0 = C.sv(bh, zm).e, ds = C.dsig(f, q, +f.x || 0, +f.y || 0, zm - Df), pc = p.pc > 0 ? p.pc : s0, s1 = s0 + ds;
          maxR = Math.max(maxR, s1 / pc); if (s1 > pc * 1.0001 && p.pc > 0) yld = true;
          if (p.Cc > 0 && p.e0 > 0) {
            if (s1 <= pc) s += (p.Cr || p.Cc / 6) * h / (1 + p.e0) * Math.log10(s1 / s0);
            else s += ((p.Cr || p.Cc / 6) * Math.log10(pc / s0) + p.Cc * Math.log10(s1 / pc)) * h / (1 + p.e0);
          } else s += p.mv / 1000 * ds * h;
        }
        row.con = 1000 * s * (opt.lambda || 1); row.yld = yld; row.ratio = maxR;
        /* drainage: open if the neighbour above/below is not clay or is the ground surface */
        var idx = bh.layers.indexOf(L), up = idx === 0 || bh.layers[idx - 1].kind !== "clay", dn = idx === bh.layers.length - 1 ? false : bh.layers[idx + 1].kind !== "clay";
        var H = L.bot - L.top, Hdr = up && dn ? H / 2 : H; row.Hdr = Hdr; row.drain = up && dn ? "both faces" : up ? "top only" : dn ? "bottom only" : "none";
        if (p.cv > 0 && (up || dn)) { row.t50 = C.Tv(0.5) * Hdr * Hdr / p.cv; row.t90 = C.Tv(0.9) * Hdr * Hdr / p.cv; row.cv = p.cv; }
      }
      out.layers.push(row);
    });
    var rig = opt.rigid === false ? 1 : 0.8;
    out.layers.forEach(function (x) { x.imm *= rig; out.imm += x.imm; out.con += x.con; });
    out.rig = rig; out.total = out.imm + out.con;
    if (zi >= bot - 0.05) out.notes.push("The stressed zone reaches the bottom of the borehole log (" + r(bot) + " m) — the settlement may be under-estimated.");
    return out;
  };
  /* settlement with time (mm) — sum over clay layers */
  C.settleTime = function (s, t) {
    var v = s.imm; s.layers.forEach(function (x) { if (!x.con) return; if (x.cv) v += x.con * C.U(x.cv * t / (x.Hdr * x.Hdr)); else v += x.con; }); return v;
  };

  /* ---------------- IS 1904:2021 Table 1 (permissible settlements — guide values) ---------------- */
  C.IS1904 = {
    steel: { name: "Steel structure", iso: { sand: [50, 0.003, 300], clay: [50, 0.003, 300] }, raft: { sand: [75, 0.003, 300], clay: [100, 0.003, 300] } },
    rc: { name: "RC structure", iso: { sand: [50, 0.0015, 666], clay: [75, 0.0015, 666] }, raft: { sand: [75, 0.0021, 500], clay: [125, 0.002, 500] } },
    frame: { name: "Multistorey RC or steel frame with panel walls", iso: { sand: [60, 0.002, 500], clay: [75, 0.002, 500] }, raft: { sand: [75, 0.0025, 400], clay: [125, 0.0033, 300] } },
    lbw2: { name: "Load-bearing walls, L/H = 2", iso: { sand: [60, 0.0002, 5000], clay: [60, 0.0002, 5000] }, raft: null },
    lbw7: { name: "Load-bearing walls, L/H = 7", iso: { sand: [60, 0.0004, 2500], clay: [60, 0.0004, 2500] }, raft: null },
    tower: { name: "Water tower or silo", iso: { sand: [50, 0.0015, 666], clay: [75, 0.0015, 666] }, raft: { sand: [100, 0.0025, 400], clay: [125, 0.0025, 400] } }
  };
  C.limit = function (P, f) {
    var bh = C.bh(P, f.bh), Df = +f.Df, d = dims(f), z = C.zoneAvg(bh, Df, Df + 2 * d.B1), soil = z && z.clayFrac > 0.5 ? "clay" : "sand";
    var T = C.IS1904[P.struct] || C.IS1904.rc, fnd = f.raft && T.raft ? "raft" : "iso", v = T[fnd][soil];
    return { mm: +f.sLim > 0 ? +f.sLim : v[0], diff: v[1], ang: v[2], soil: soil, fnd: fnd, name: T.name, own: +f.sLim > 0 };
  };
  /* allowable net pressure: the smaller of shear (qnu/FS) and the pressure that gives the permissible settlement */
  C.allowable = function (P, f) {
    var bc = C.bearing(P, f); if (bc.err) return bc;
    var lim = C.limit(P, f), lo = 0, hi = Math.max(bc.qns * 3, 50), s = function (q) { return C.settle(P, f, q).total; };
    if (s(hi) < lim.mm) { var k = 0; while (s(hi) < lim.mm && k++ < 6) hi *= 2; }
    for (var i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (s(m) > lim.mm) hi = m; else lo = m; }
    var qs = lo, qa = Math.min(bc.qns, qs), d = bc.dims;
    var res = { bc: bc, lim: lim, qSettle: qs, qa: qa, gov: qa === bc.qns ? "shear" : "settlement", Pallow: qa * d.A1, qnet: bc.qnet };
    if (bc.qnet > 0) { res.sAct = C.settle(P, f, bc.qnet); res.ok = bc.qnet <= qa * 1.0001; }
    return res;
  };

  /* ---------------- which part can fail ---------------- */
  C.failure = function (P, f) {
    var bh = C.bh(P, f.bh), bc = C.bearing(P, f), d = bc.dims, Df = +f.Df, q = bc.qnet || bc.qns, out = { items: [], zone: 0 };
    if (bc.err) return { items: [{ sev: "err", t: bc.err }] };
    var phi = bc.gov ? bc.gov.phi || 0 : 0, zd = d.B1 * Math.tan((45 + phi / 2) * D2R); out.zone = zd;
    var inZone = bh.layers.filter(function (L) { return L.bot > Df && L.top < Df + zd; }).map(function (L) { return L.name || C.KINDS[L.kind]; });
    out.items.push({ sev: "info", t: "General shear wedge reaches about " + r(zd) + " m below the base (B′·tan(45° + φ/2)), i.e. to " + r(Df + zd) + " m: " + inZone.join(", ") + "." });
    if (C.gwt(bh) < Df + d.B1) out.items.push({ sev: "warn", t: "Water table at " + r(C.gwt(bh)) + " m is within B of the base — the γ term is reduced (W′ = " + r(bc.Wp, 2) + "). A rise in water level lowers capacity further." });
    /* weak layers below the bearing zone: 2:1 fictitious footing */
    bh.layers.forEach(function (L) {
      if (L.top <= Df + 1e-6) return;
      var zt = L.top - Df; if (zt > 4 * d.B1) return;
      var Bz = d.B1 + zt, Lz = d.L === Infinity ? Infinity : d.L1 + zt, Az = Lz === Infinity ? Bz : Bz * Lz, qz = q * d.A1 / Az;
      var ff = { bh: f.bh, shape: f.shape === "strip" ? "strip" : f.shape === "circle" ? "square" : "rect", B: Bz, L: Lz === Infinity ? Bz : Lz, Df: L.top, P: 0, H: 0 };
      if (ff.shape === "rect" && Math.abs(ff.B - ff.L) < 1e-6) ff.shape = "square";
      var bz = C.bearing(P, ff); if (bz.err || !bz.qnu) return;
      var fs = bz.qnu / Math.max(qz, 1e-6);
      if (fs < 3 * (+P.fs || 2.5)) out.items.push({ sev: fs < (+P.fs || 2.5) ? "err" : "ok", layer: L.id, t: (L.name || C.KINDS[L.kind]) + " at " + r(L.top) + " m: pressure spread 2:1 is " + r(qz, 1) + " kPa on a " + r(Bz) + " m wide area; its capacity there is " + r(bz.qnu, 0) + " kPa → FS = " + r(fs, 2) + (fs < (+P.fs || 2.5) ? " — below the required " + (+P.fs || 2.5) + ": the footing can punch through into this layer" : "") });
    });
    var s = C.settle(P, f, q);
    s.layers.forEach(function (x) {
      if (x.yld) out.items.push({ sev: "warn", t: x.name + ": stress after loading exceeds the preconsolidation pressure (up to " + r(x.ratio, 2) + " × σ′p) — this layer yields into virgin compression and settles much more." });
    });
    var tot = s.total || 1;
    s.layers.slice().sort(function (a, b) { return (b.imm + b.con) - (a.imm + a.con); }).slice(0, 3).forEach(function (x, i) {
      var share = 100 * (x.imm + x.con) / tot; if (share < 5) return;
      out.items.push({ sev: i === 0 && share > 50 ? "warn" : "info", t: x.name + " (" + r(x.top, 1) + "–" + r(x.bot, 1) + " m) gives " + r(share, 0) + " % of the settlement (" + r(x.imm + x.con, 1) + " mm" + (x.con ? ", of which consolidation " + r(x.con, 1) + " mm" : "") + ")." });
    });
    out.settle = s; out.bc = bc; out.q = q;
    return out;
  };

  /* ---------------- plate load test (IS 1888:1982) ---------------- */
  C.plate = function (pt, P) {
    var rows = (pt.rows || []).filter(function (a) { return a[0] >= 0 && a[1] >= 0; }).sort(function (a, b) { return a[0] - b[0]; });
    var out = { rows: rows, notes: [] }; if (rows.length < 4) { out.err = "Give at least four readings"; return out; }
    /* log–log: two straight lines; the break is the yield (ultimate) pressure */
    var pts = rows.filter(function (a) { return a[0] > 0 && a[1] > 0; }).map(function (a) { return [Math.log10(a[0]), Math.log10(a[1])]; });
    function fit(a) { var n = a.length, sx = 0, sy = 0, sxx = 0, sxy = 0; a.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; }); var k = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - k * sx) / n, e = 0; a.forEach(function (p) { e += Math.pow(p[1] - k * p[0] - c, 2); }); return { k: k, c: c, e: e }; }
    var best = null;
    for (var i = 2; i <= pts.length - 2; i++) { var A = fit(pts.slice(0, i)), B = fit(pts.slice(i - 1)); if (A.k >= B.k) continue; var e = A.e + B.e; if (!best || e < best.e) best = { A: A, B: B, e: e, i: i }; }
    if (best) { var xl = (best.B.c - best.A.c) / (best.A.k - best.B.k); out.qu = Math.pow(10, xl); out.lines = best; }
    else { out.qu = rows[rows.length - 1][0]; out.notes.push("No clear break in the log–log plot — the largest test pressure is taken as the ultimate value (a lower bound)."); }
    if (out.qu > rows[rows.length - 1][0] * 1.05) { out.qu = rows[rows.length - 1][0]; out.notes.push("The break lies beyond the last reading — the largest test pressure is used."); }
    var Bp = +pt.Bp, Bf = +pt.Bf, sand = pt.soil !== "clay";
    out.scale = sand ? Math.pow(Bf * (Bp + 0.3) / (Bp * (Bf + 0.3)), 2) : Bf / Bp;
    out.quF = sand ? out.qu * Bf / Bp : out.qu;
    out.sAt = function (p) { for (var i = 0; i + 1 < rows.length; i++) if (p >= rows[i][0] && p <= rows[i + 1][0]) return rows[i][1] + (p - rows[i][0]) / (rows[i + 1][0] - rows[i][0]) * (rows[i + 1][1] - rows[i][1]); return null; };
    out.pAt = function (s) { for (var i = 0; i + 1 < rows.length; i++) if (s >= rows[i][1] && s <= rows[i + 1][1]) return rows[i][0] + (s - rows[i][1]) / (rows[i + 1][1] - rows[i][1]) * (rows[i + 1][0] - rows[i][0]); return null; };
    var lim = +pt.sLim || 25, sp = lim / out.scale; out.sLim = lim; out.spLim = sp; out.qSettle = out.pAt(sp);
    if (out.qSettle === null) out.notes.push("The plate settlement for " + lim + " mm under the footing (" + r(sp, 2) + " mm) is outside the test readings.");
    var FS = P && +P.fs || 2.5; out.qs = out.quF / FS;
    out.qa = out.qSettle === null ? out.qs : Math.min(out.qs, out.qSettle);
    return out;
  };
  return C;
})();
if (typeof module !== "undefined") module.exports = GC;
