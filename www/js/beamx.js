/* RCC beam with chosen end conditions (IS 456:2000): simply supported, cantilever, propped cantilever, fixed–fixed,
   spring or guided ends; UDL + point loads analysed by the stiffness method (B1), sagging and hogging sections designed,
   shear, deflection (cl 23.2.1), curtailment and anchorage (cl 26.2.3), drawings, bar bending schedule and take-off. */
RCC.BEAM_ENDS = [["fixed", "Fixed"], ["pinned", "Pinned"], ["roller", "Roller"], ["free", "Free"], ["spring", "Spring"]];
RCC.beamCase = function (a, b) {
  var hold = function (t) { return t === "pinned" || t === "roller"; };
  if (a === "fixed" && b === "free" || a === "free" && b === "fixed") return { id: "cant", name: "Cantilever", basic: 7 };
  if (a === "fixed" && b === "fixed") return { id: "ff", name: "Fixed–fixed", basic: 26 };
  if (a === "fixed" && (hold(b) || b === "spring") || b === "fixed" && (hold(a) || a === "spring")) return { id: "prop", name: "Propped cantilever", basic: 20 };
  if (hold(a) && hold(b)) return { id: "ss", name: "Simply supported", basic: 20 };
  return { id: "gen", name: "Beam (" + a + " – " + b + ")", basic: 20 };
};
RCC.beamEnds = function (p) {
  var eL = p.endL || "pinned", eR = p.endR || "roller", cs = RCC.beamCase(eL, eR), L = p.L, b = p.b, Dd = p.D, fck = p.fck, fy = p.fy;
  var r = new Rep("RCC Beam Design — " + cs.name.toLowerCase(), "IS 456:2000");
  var d = Dd - p.cover - p.stir - p.dia / 2, dc = p.cover + p.stir + p.dia / 2, Ec = 5000 * Math.sqrt(fck) * 1e3, Ig = b * Math.pow(Dd, 3) / 12 * 1e-12;
  var loads = [[p.P1, p.a1], [p.P2, p.a2]].filter(function (q) { return q[0] > 0; }).map(function (q) { return { P: q[0], x: Math.min(Math.max(q[1] || 0, 0), L) }; });
  var s = B1.solve({ x: [0, L], sup: [eL, eR], ks: [p.ksL || 0, p.ksR || 0], w: [p.wu], P: loads, EI: Ec * Ig }), ex = B1.extremes(s);
  var ML = -B1.at(s, 0).M, MR = -B1.at(s, L).M;   /* hogging + at the ends */
  r.h("1. Analysis — " + cs.name);
  r.row("Supports (left – right)", B1.SUP[eL].label + " – " + B1.SUP[eR].label, "");
  r.row("Span L", U.f(L, 2), "m");
  r.row("Factored UDL wu", U.f(p.wu), "kN/m");
  loads.forEach(function (q, i) { r.row("Factored point load P" + (i + 1) + " at " + U.f(q.x, 2) + " m from the left end", U.f(q.P), "kN"); });
  r.note("Analysed by the stiffness method (EI of the gross section, Ec = 5000√fck, cl 6.2.3.1)" + (cs.id === "prop" && !loads.length ? " — for UDL: Mfixed = wL²/8, Mspan = 9wL²/128 at 3L/8 from the prop, reactions 5wL/8 and 3wL/8." : cs.id === "ff" && !loads.length ? " — for UDL: Mend = wL²/12, Mspan = wL²/24." : cs.id === "cant" && !loads.length ? " — for UDL: M = wL²/2 at the support, V = wL." : "."));
  r.table(["Support", "Type", "Reaction (kN)", "Moment (kNm)"], s.reac.map(function (q, i) { return [i ? "Right" : "Left", B1.SUP[q.type].label, U.f(q.V, 1), q.M ? U.f(Math.abs(q.M), 1) + " hogging" : "—"]; }));
  r.row("Maximum sagging moment Mu+", ex.Msag > 0.01 ? U.f(ex.Msag) + " kNm at " + U.f(ex.xs, 2) + " m" : "none", "");
  r.row("Hogging moment at the left / right end", U.f(Math.max(ML, 0)) + " / " + U.f(Math.max(MR, 0)), "kNm");
  r.row("Maximum shear Vu", U.f(ex.Vmax) + " kN at " + U.f(ex.xv, 2) + " m", "");
  if (ex.zeros.length) r.row("Points of contraflexure", ex.zeros.map(function (z) { return U.f(z, 2) + " m"; }).join(", "), "from the left end");
  r.row("Effective depth d = D − cover − stirrup − φ/2", U.f(d, 0), "mm");

  var xr = RCC.xumax(fy), Mlim = RCC.mulim(b, d, fck, fy), Amin = 0.85 * b * d / fy, Amax = 0.04 * b * Dd;
  function flex(Mu, where) {
    if (Mu < 0.5) return { bars: { n: 2, dia: 12, area: 2 * D.barArea(12), text: "2 nos 12 mm φ" }, nominal: true, Ast: 0 };
    var Ast, Asc = 0, doubly = Mu > Mlim;
    if (!doubly) { Ast = RCC.astFlex(Mu, b, d, fck, fy); r.eq(where + ": Mu = " + U.f(Mu) + " kNm ≤ Mu,lim = " + U.f(Mlim) + " → Ast = " + U.f(Ast, 0) + " mm²", "Annex G-1.1(b)"); }
    else {
      var xu = xr * d, esc = 0.0035 * (xu - dc) / xu, fsc = Math.abs(RCC.fs(esc, fy)), fcc = 0.446 * fck;
      Asc = (Mu - Mlim) * 1e6 / ((fsc - fcc) * (d - dc)); Ast = 0.36 * fck * b * xu / (0.87 * fy) + Asc * (fsc - fcc) / (0.87 * fy);
      r.eq(where + ": Mu = " + U.f(Mu) + " kNm > Mu,lim = " + U.f(Mlim) + " → doubly reinforced: Ast = " + U.f(Ast, 0) + " mm², Asc = " + U.f(Asc, 0) + " mm²", "Annex G-1.2");
    }
    var bars = U.pickBars(Math.max(Ast, Amin), p.dias || [12, 16, 20, 25], 2, 8);
    r.row(where + " — provide", bars.text, "", "min " + U.f(Amin, 0) + " mm², cl 26.5.1.1");
    r.check(where + ": Ast ≤ 0.04 b D", bars.area <= Amax, U.f(bars.area, 0) + " ≤ " + U.f(Amax, 0) + " mm²", "cl 26.5.1.1(b)");
    var clear = (b - 2 * p.cover - 2 * p.stir - bars.n * bars.dia) / Math.max(1, bars.n - 1);
    if (clear < Math.max(bars.dia, 25)) r.note(where + ": clear spacing " + U.f(clear, 0) + " mm < " + Math.max(bars.dia, 25) + " mm — place the bars in two layers (recheck d).");
    return { bars: bars, Ast: Ast, Asc: Asc, doubly: doubly, cbars: doubly ? U.pickBars(Asc, [12, 16, 20, 25], 2, 6) : null };
  }
  r.h("2. Flexure — bottom steel (sagging)");
  var bot = ex.Msag > 0.5 ? flex(ex.Msag, "Mid-span bottom") : (r.note("No sagging moment — nominal bottom bars 2 nos 12 mm φ (also hold the stirrups)."), flex(0, "Bottom"));
  r.h("3. Flexure — top steel (hogging)");
  var topL = ML > 0.5 ? flex(ML, "Left end top") : null, topR = MR > 0.5 ? flex(MR, "Right end top") : null;
  if (!topL && !topR) r.note("No hogging moment — top hanger bars 2 nos 12 mm φ.");
  if (bot.doubly && bot.cbars) r.row("Compression steel at mid-span (top)", bot.cbars.text, "");

  r.h("4. Shear");
  var supAt = ex.xv < L / 2 ? "L" : "R", tens = (supAt === "L" ? topL : topR) || bot, tv = ex.Vmax * 1e3 / (b * d), pt = 100 * tens.bars.area / (b * d), tc = RCC.tauc(fck, pt), tcm = RCC.taucmax(fck);
  r.eq("τv = Vu/(b d) = " + U.f(tv, 3) + " N/mm² ; pt = " + U.f(pt, 2) + " % (tension steel at that section)", "cl 40.1");
  r.row("τc", U.f(tc, 3), "N/mm²", "Table 19");
  r.check("τv ≤ τc,max", tv <= tcm, U.f(tv, 3) + " ≤ " + tcm, "Table 20");
  var Asv = 2 * D.barArea(p.stir), svmax = Math.min(0.75 * d, 300), svmin = 0.87 * fy * Asv / (0.4 * b), sv;
  if (tv <= tc) { sv = Math.min(svmin, svmax); r.eq("τv ≤ τc : minimum shear reinforcement, sv ≤ 0.87 fy Asv/(0.4 b) = " + U.f(svmin, 0) + " mm", "cl 26.5.1.6"); }
  else { var Vus = (tv - tc) * b * d, sreq = 0.87 * fy * Asv * d / Vus; sv = Math.min(sreq, svmax, svmin); r.eq("Vus = (τv − τc) b d = " + U.f(Vus / 1e3) + " kN ; sv = 0.87 fy Asv d / Vus = " + U.f(sreq, 0) + " mm", "cl 40.4(a)"); }
  sv = sv >= 100 ? U.floorTo(sv, 25) : U.floorTo(sv, 5);
  r.row("Provide stirrups (whole length)", "2-legged " + p.stir + " mm φ @ " + sv + " mm c/c", "", "max " + U.f(svmax, 0) + " mm");
  r.check("Stirrup spacing ≥ 75 mm (practical)", sv >= 75, sv + " mm", "");

  r.h("5. Deflection");
  var basic = cs.basic, gov = cs.id === "cant" ? (topL || topR || bot) : bot, Areq = Math.max(gov.Ast || 0, Amin);
  if (L > 10 && cs.id !== "cant") basic = basic * 10 / L;
  var fs = 0.58 * fy * Math.min(Areq, gov.bars.area) / gov.bars.area, kt = RCC.kt(100 * gov.bars.area / (b * d), fs), kc = bot.cbars ? RCC.kc(100 * bot.cbars.area / (b * d)) : 1, allow = basic * kt * kc, act = L * 1000 / d;
  r.eq("Basic span/d = " + cs.basic + (cs.id === "prop" ? " (propped cantilever taken as simply supported — conservative; IS 456 gives no separate value)" : cs.id === "ff" ? " (continuous / fixed ends)" : cs.id === "cant" ? " (cantilever)" : "") + (L > 10 && cs.id !== "cant" ? " × 10/L" : "") + " ; kt = " + U.f(kt, 2) + " ; kc = " + U.f(kc, 2), "cl 23.2.1, Fig 4, 5");
  r.check("L/d ≤ basic × kt × kc", act <= allow, U.f(act, 1) + " ≤ " + U.f(allow, 1), "cl 23.2.1");
  if (cs.id === "cant" && L > 10) r.note("Cantilever longer than 10 m: IS 456 cl 23.2.1(b) requires the deflection to be calculated.");

  r.h("6. Crack width (IS 456 cl 35.3.2, Annex F)");
  var wlim = DT.wlim({ cv: { expo: p.exp || "moderate", nom: p.cover } }), cmin = p.cover + p.stir, wsv = [];
  [["Mid-span soffit", ex.Msag, bot], ["Left support, top", ML, topL], ["Right support, top", MR, topR]].forEach(function (q) {
    if (!q[2] || q[1] < 0.5 || q[2].nominal) return;
    var cw = DT.crack(q[1] / 1.5, b, Dd, d, q[2].bars.n, q[2].bars.dia, cmin, fck); wsv.push(cw.w);
    r.check(q[0] + ": wcr ≤ " + wlim.toFixed(2) + " mm", cw.w <= wlim + 1e-9, U.f(cw.w, 3) + " mm (Ms = Mu/1.5 = " + U.f(q[1] / 1.5) + " kNm, fs = " + U.f(cw.fs, 0) + " N/mm², acr = " + U.f(cw.acr, 0) + " mm)", "Annex F");
  });
  r.note("Cracked section with the long-term modular ratio Es/(Ec/(1+θ)), θ = 1.6; limit 0.3 mm in general, 0.2 mm for severe exposure, 0.004 × cover (≤ 0.2 mm) for very severe and extreme (cl 35.3.2).");
  r.h("7. Curtailment and anchorage");
  var lead = function (dia) { return Math.max(d, 12 * dia); }, Ld = function (dia) { return RCC.Ld(dia, fy, fck); };
  var fixedL = eL === "fixed", fixedR = eR === "fixed", cut = {}, cantRight = cs.id === "cant" && eR === "fixed";
  function Mcap(nb, dia) { var As = nb * D.barArea(dia); return 0.87 * fy * As * d * (1 - As * fy / (b * d * fck)) / 1e6; }
  /* bottom bars */
  var nb = bot.bars.n, nc = Math.max(2, Math.ceil(nb / (fixedL || fixedR ? 4 : 3))), botCut = null;
  if (!bot.nominal && nb - nc >= 1) {
    var Mc = Mcap(nc, bot.bars.dia), pts = B1.diagram(s, 400), xa = null, xb = null;
    pts.forEach(function (q) { if (q.M > Mc) { if (xa === null) xa = q.x; xb = q.x; } });
    if (xa !== null) { botCut = { a: Math.max(0, xa - lead(bot.bars.dia) / 1000), b: Math.min(L, xb + lead(bot.bars.dia) / 1000), n: nb - nc };
      r.eq("Bottom: " + nc + " bars continue into the supports (≥ " + (fixedL || fixedR ? "¼" : "⅓") + " of the steel, cl 26.2.3.3(a)); " + botCut.n + " bars stop where M = M(" + nc + " bars) = " + U.f(Mc) + " kNm plus max(d, 12φ): from " + U.f(botCut.a, 2) + " m to " + U.f(botCut.b, 2) + " m", "cl 26.2.3.1"); }
  } else r.eq("Bottom: all " + nb + " bars run the full length", "cl 26.2.3.3");
  r.row("Bottom bars anchored beyond the support centre", (eL === "free" || eR === "free" ? "to the free end − cover; " : "") + "Ld/3 = " + U.f(Ld(bot.bars.dia) / 3, 0) + " mm at simple supports, Ld = " + U.f(Ld(bot.bars.dia), 0) + " mm into fixed supports", "", "cl 26.2.3.3(c)");
  /* top bars at each restrained end */
  function topExt(side, tb, M0) {
    if (!tb) return null;
    var dia = tb.bars.dia, x0 = side === "L" ? 0 : L;
    if (cs.id === "cant") {
      var nk = tb.bars.n >= 4 ? Math.floor(tb.bars.n / 2) : 0, info = { full: true, n: tb.bars.n, nk: nk, dia: dia };
      if (nk) { var Mk = Mcap(tb.bars.n - nk, dia), xk = null; B1.diagram(s, 400).forEach(function (q) { if (-q.M > Mk) { var dist = Math.abs(q.x - x0); if (xk === null || dist > xk) xk = dist; } }); info.cutAt = Math.min(L, (xk || 0) + lead(dia) / 1000); }
      r.eq("Cantilever top bars: run to the free end (bent down 10φ); anchored Ld = " + U.f(Ld(dia), 0) + " mm beyond the support face" + (info.cutAt ? "; " + nk + " of them may stop at " + U.f(info.cutAt, 2) + " m from the support (M ≤ capacity of the rest + max(d, 12φ))" : ""), "cl 26.2.3.3, 26.2.3.4");
      return info;
    }
    var zs = ex.zeros.map(function (z) { return Math.abs(z - x0); }).sort(function (u, v) { return u - v; }), zc = zs.length ? zs[0] : L / 4, ext = zc + Math.max(d / 1000, 12 * dia / 1000, L / 16);
    r.eq((side === "L" ? "Left" : "Right") + " top bars (" + tb.bars.text + "): to the point of contraflexure " + U.f(zc, 2) + " m + max(d, 12φ, L/16) = " + U.f(ext, 2) + " m into the span; ≥ ⅓ of them continue as hangers; anchored Ld = " + U.f(Ld(dia), 0) + " mm into the support", "cl 26.2.3.4(b)");
    return { ext: Math.min(ext, L), n: tb.bars.n, dia: dia };
  }
  cut.L = topExt("L", topL, ML); cut.R = topExt("R", topR, MR); cut.bot = botCut;

  /* bar bending schedule (one beam) */
  var c = p.cover, rows = [], mk = 0, len = L * 1000, aB = function (end) { return end === "fixed" ? Ld(bot.bars.dia) : end === "free" ? -c : Ld(bot.bars.dia) / 3; };
  function bar(desc, dia, n, Lmm) { if (n > 0 && Lmm > 0) rows.push({ mark: String.fromCharCode(97 + mk++), desc: desc, dia: dia, n: Math.ceil(n), L: Math.round(Lmm), kg: Math.ceil(n) * Lmm / 1000 * DT.wpm(dia) }); }
  bar("Bottom bars, full length", bot.bars.dia, botCut ? nc : bot.bars.n, len + aB(eL) + aB(eR));
  if (botCut) bar("Bottom bars, curtailed", bot.bars.dia, botCut.n, (botCut.b - botCut.a) * 1000);
  [["L", topL, eL], ["R", topR, eR]].forEach(function (q) {
    var info = cut[q[0]], tb = q[1]; if (!info) return;
    if (info.full) { bar("Top bars, cantilever, full projection + anchorage", tb.bars.dia, tb.bars.n - (info.nk || 0), len + Ld(tb.bars.dia) - c + 10 * tb.bars.dia); if (info.nk) bar("Top bars, cantilever, curtailed", tb.bars.dia, info.nk, info.cutAt * 1000 + Ld(tb.bars.dia)); }
    else bar("Top bars over the " + (q[0] === "L" ? "left" : "right") + " support", tb.bars.dia, tb.bars.n, info.ext * 1000 + Ld(tb.bars.dia));
  });
  if (!cut.L || !cut.L.full) bar("Top hanger bars, full length", 12, 2, len + 2 * 300);
  if (bot.cbars) bar("Compression bars at mid-span", bot.cbars.dia, bot.cbars.n, len * 0.6);
  var nst = Math.floor((len - 100) / sv) + 1; bar("2-legged stirrups " + p.stir + " mm @ " + sv, p.stir, nst, 2 * (b - 2 * c + Dd - 2 * c) + 20 * p.stir);
  r.table(["Mark", "Description", "φ (mm)", "No.", "Length (mm)", "Weight (kg)"], rows.map(function (q) { return [q.mark, q.desc, q.dia, q.n, q.L, U.f(q.kg, 1)]; }).concat([["", "Total", "", "", "", U.f(rows.reduce(function (a, q) { return a + q.kg; }, 0), 1)]]));

  /* drawings: diagrams, elevation and sections */
  r.svg = RCC.beamDiagrams(s, L) + RCC.beamDrawSvg(p, cs, eL, eR, bot, topL, topR, cut, sv, d);
  r.dxf = DT.dxf([{ title: "RCC BEAM - " + cs.name.toUpperCase(), dws: RCC._lastBeamDws }]); r.dxfName = "rcc-beam.dxf";
  var tops = [topL, topR].filter(Boolean);
  r.sum("Case", cs.name + " · L = " + L + " m");
  r.sum("Section", b + " × " + Dd + " mm, d = " + U.f(d, 0) + " mm");
  r.sum("Bottom steel", bot.bars.text + (bot.nominal ? " (nominal)" : ""));
  r.sum("Top steel", tops.length ? tops.map(function (t, i) { return (tops.length > 1 ? (i ? "right " : "left ") : "") + t.bars.text; }).join(", ") : "2 nos 12 mm φ (hanger)");
  r.sum("Stirrups", "2L-" + p.stir + " mm @ " + sv + " c/c");
  r.res = { d: d, Mu: Math.max(ex.Msag, ML, MR), Vu: ex.Vmax, Msag: ex.Msag, ML: ML, MR: MR, bars: bot.bars, top: { L: topL && topL.bars, R: topR && topR.bars }, sv: sv, doubly: bot.doubly, case: cs.id, reac: s.reac, cut: cut,
    take: { kind: "b", conc: [{ d: "Beam " + b + " × " + Dd, n: 1, L: L, B: b / 1000, H: Dd / 1000, q: L * b * Dd / 1e6 }], fw: [{ d: "Beam soffit and sides", n: 1, L: L, B: "", H: (b + 2 * Dd) / 1000, q: L * (b + 2 * Dd) / 1000 }], pcc: [], bars: rows } };
  return r;
};
/* bending moment and shear force diagrams */
RCC.beamDiagrams = function (s, L) {
  var pts = B1.diagram(s, 120), W = 640, H = 170, ml = 46, mr = 14;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function plot(key, title, unit, col, invert) {
    var vals = pts.map(function (q) { return q[key]; }), mx = Math.max(1e-9, Math.max.apply(null, vals.map(Math.abs))), sx = (W - ml - mr) / L, sy = (H / 2 - 36) / mx;
    var y0 = H / 2 + 6, path = "M" + ml + " " + y0 + pts.map(function (q) { return " L" + (ml + q.x * sx).toFixed(1) + " " + (y0 + (invert ? 1 : -1) * q[key] * sy).toFixed(1); }).join("") + " L" + (ml + L * sx) + " " + y0 + " Z";
    var o = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="bmd" xmlns="http://www.w3.org/2000/svg"><text x="4" y="14" class="bt">' + title + '</text>';
    o += '<path d="' + path + '" fill="' + col + '" fill-opacity=".18" stroke="' + col + '" stroke-width="1.6"/><line x1="' + ml + '" y1="' + y0 + '" x2="' + (W - mr) + '" y2="' + y0 + '" stroke="#6b7a8a" stroke-width="1"/>';
    var iMax = 0, iMin = 0; vals.forEach(function (v, i) { if (v > vals[iMax]) iMax = i; if (v < vals[iMin]) iMin = i; });
    [iMax, iMin].forEach(function (i, k) { var v = vals[i]; if (Math.abs(v) < mx * 0.02 || (k && i === iMax)) return; var x = ml + pts[i].x * sx, y = y0 + (invert ? 1 : -1) * v * sy; o += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.5" fill="' + col + '"/><text x="' + Math.min(W - 70, Math.max(ml, x - 20)).toFixed(1) + '" y="' + clamp(y + ((invert ? 1 : -1) * v > 0 ? 13 : -5), 28, H - 18).toFixed(1) + '" class="bv">' + U.f(v, 1) + ' ' + unit + '</text>'; });
    return o + '<text x="' + ml + '" y="' + (H - 4) + '" class="bv">0</text><text x="' + (W - mr - 28) + '" y="' + (H - 4) + '" class="bv">' + U.f(L, 2) + ' m</text></svg>';
  }
  return '<div class="dwgs"><div class="dwgt">Bending moment (sagging below the axis, tension side) and shear force — factored</div><div class="tw">' + plot("M", "Bending moment Mu", "kNm", "#1d4ed8", true) + plot("V", "Shear force Vu", "kN", "#c2410c", false) + '</div></div>';
};
/* elevation with bars and support symbols, plus cross-sections (SVG + DXF through DT) */
RCC.beamDrawSvg = function (p, cs, eL, eR, bot, topL, topR, cut, sv, d) {
  var DW = DT.DW, L = p.L * 1000, Dd = p.D, b = p.b, c = p.cover, th = Math.max(70, Dd / 6), el = new DW("Elevation — " + cs.name.toLowerCase() + " (bars schematic, not to scale vertically)");
  var vs = Math.max(1, L / (Dd * 6)), H = Dd * vs * 0.5;   /* exaggerate depth for legibility */
  el.r(0, 0, L, H, "C");
  function sup(x, t) {
    if (t === "fixed") { el.l(x, -H * 0.6, x, H * 1.6, "C"); for (var i = 0; i < 6; i++) { var yy = -H * 0.6 + i * H * 0.4; el.l(x, yy, x + (x ? 120 : -120), yy - 120, "D"); } }
    else if (t === "pinned" || t === "roller") { el.pl([[x, 0], [x - 160, -260], [x + 160, -260]], "C", true); if (t === "roller") { el.c(x - 90, -320, 55, "C").c(x + 90, -320, 55, "C"); } else el.l(x - 220, -260, x + 220, -260, "D"); }
    else if (t === "spring") { var pts = [[x, 0]]; for (var j = 1; j <= 6; j++) pts.push([x + (j % 2 ? 90 : -90), -j * 60]); pts.push([x, -420]); el.pl(pts, "C"); el.l(x - 160, -420, x + 160, -420, "D"); }
  }
  sup(0, eL); sup(L, eR);
  var yb = c + 40, yt = H - c - 40;
  el.l(eL === "free" ? c : -200, yb, eR === "free" ? L - c : L + 200, yb, "R");
  if (cut.bot) el.l(cut.bot.a * 1000, yb + 50, cut.bot.b * 1000, yb + 50, "R");
  if (cut.L && cut.L.full) el.l(0 - 400, yt, L - c, yt, "R").l(L - c, yt, L - c, yt - 200, "R");
  else if (cut.R && cut.R.full) el.l(L + 400, yt, c, yt, "R").l(c, yt, c, yt - 200, "R");
  else { if (cut.L) el.l(-400, yt, cut.L.ext * 1000, yt, "R"); if (cut.R) el.l(L - cut.R.ext * 1000, yt, L + 400, yt, "R"); el.l(0, yt - 50, L, yt - 50, "S"); }
  var ns = Math.min(40, Math.floor(L / sv)); for (var i = 0; i <= ns; i++) { var x = 50 + i * (L - 100) / ns; el.l(x, c, x, H - c, "S"); }
  el.dim(0, -650, L, -650, 0, "L = " + p.L + " m", th);
  el.tx(L / 2, H + 180, "top: " + [topL, topR].filter(Boolean).map(function (t) { return t.bars.text; }).join(" / ") + (topL || topR ? "" : "2-12φ hangers") + " · bottom: " + bot.bars.text + " · stirrups 2L-" + p.stir + "φ @ " + sv, th, "c", "T");
  var dws = [el];
  function sec(title, nTop, dTop, nBot, dBot) {
    var s = new DW(title); s.r(0, 0, b, Dd, "C").r(c, c, b - 2 * c, Dd - 2 * c, "S");
    function row(n, dia, y) { for (var k = 0; k < n; k++) s.c(c + p.stir + dia / 2 + k * (b - 2 * c - 2 * p.stir - dia) / Math.max(1, n - 1), y, dia / 2, "R"); }
    row(nBot, dBot, c + p.stir + dBot / 2); row(nTop, dTop, Dd - c - p.stir - dTop / 2);
    s.dim(0, -120, b, -120, 0, String(b), 60).dim(-120, 0, -120, Dd, 0, String(Dd), 60); return s;
  }
  var tS = topL || topR;
  dws.push(sec("Section at the support", tS ? tS.bars.n : 2, tS ? tS.bars.dia : 12, cut.bot ? Math.max(2, bot.bars.n - cut.bot.n) : bot.bars.n, bot.bars.dia));
  if (cs.id !== "cant") dws.push(sec("Section at mid-span", 2, 12, bot.bars.n, bot.bars.dia));
  RCC._lastBeamDws = dws;
  return '<div class="dwgs">' + dws.map(function (dw) { return '<div class="dwgt">' + dw.title + '</div><div class="tw">' + DT.svg(dw, { maxW: 680, maxH: 300 }) + '</div>'; }).join("") + '</div>';
};
