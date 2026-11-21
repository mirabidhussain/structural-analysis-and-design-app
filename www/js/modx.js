/* v4.0 design modules: continuous beam (IS 456 cl 22.4.1 pattern loading, cl 37.1.1 redistribution), cantilever retaining wall
   (Rankine earth pressure, IS 456 cl 20 stability), and two-column combined footing (IS 456 cl 34). Units kN, m, mm, N/mm². */

/* ------------------------------------------------------------ CONTINUOUS BEAM */
RCC.listNums = function (s) { return String(s || "").split(/[,;\s]+/).map(Number).filter(function (x) { return isFinite(x) && x > 0; }); };
RCC.contBeam = function (p) {
  var r = new Rep("Continuous Beam Design", "IS 456:2000 cl 22, 37, 40");
  var Ls = RCC.listNums(p.spans), n = Ls.length;
  if (!n) throw new Error("Give the span lengths, e.g. 4.5, 5, 4.5");
  if (n > 12) throw new Error("Up to 12 spans");
  var b = p.b, Dd = p.D, fck = p.fck, fy = p.fy, d = Dd - p.cover - p.stir - p.dia / 2, dc = p.cover + p.stir + p.dia / 2;
  var gl = String(p.gk).split(/[,;\s]+/).map(Number).filter(isFinite), ql = String(p.qk).split(/[,;\s]+/).map(Number).filter(isFinite);
  var sw = p.self === "no" ? 0 : 25 * b * Dd / 1e6;
  var G = Ls.map(function (L, i) { return (gl.length ? (gl[i] !== undefined ? gl[i] : gl[gl.length - 1]) : 0) + sw; }), Q = Ls.map(function (L, i) { return ql.length ? (ql[i] !== undefined ? ql[i] : ql[ql.length - 1]) : 0; });
  var xs = [0]; Ls.forEach(function (L) { xs.push(xs[xs.length - 1] + L); });
  var endL = p.endL || "pinned", endR = p.endR || "pinned", sup = xs.map(function (x, i) { return i === 0 ? endL : i === n ? endR : "pinned"; });
  if (endL === "free" && n < 2 || endR === "free" && n < 2) throw new Error("A free end needs at least two spans (the first or last span is then a cantilever)");
  var Ec = 5000 * Math.sqrt(fck) * 1e3, EI = Ec * b * Math.pow(Dd, 3) / 12 * 1e-12, gf = 1.5, qf = 1.5;
  r.h("1. Spans, supports and loads");
  r.table(["Span", "L (m)", "gk (kN/m)", "qk (kN/m)", "wu = 1.5(gk + qk)"], Ls.map(function (L, i) { return [String(i + 1) + (sup[i] === "free" || sup[i + 1] === "free" ? " (cantilever)" : ""), U.f(L, 2), U.f(G[i], 2), U.f(Q[i], 2), U.f(gf * G[i] + qf * Q[i], 2)]; }));
  r.row("Self weight included in gk", sw ? U.f(sw, 2) + " kN/m (25 b D)" : "no", "");
  r.row("End supports (left – right)", B1.SUP[endL].label + " – " + B1.SUP[endR].label + "; interior supports simple (knife-edge)", "");
  r.row("Effective depth d", U.f(d, 0), "mm");
  /* load arrangements, IS 456 cl 22.4.1 */
  var arr = [{ name: "All spans 1.5(G + Q)", q: Ls.map(function () { return 1; }) }];
  var allowAll = Q.every(function (q, i) { return qf * q <= 0.75 * gf * G[i] + 1e-9; });
  if (n > 1 && !(p.pattern === "off" || (p.pattern !== "on" && allowAll))) {
    arr.push({ name: "Q on odd spans", q: Ls.map(function (L, i) { return i % 2 === 0 ? 1 : 0; }) }, { name: "Q on even spans", q: Ls.map(function (L, i) { return i % 2 === 1 ? 1 : 0; }) });
    for (var i = 0; i + 1 < n; i++) arr.push({ name: "Q on spans " + (i + 1) + "–" + (i + 2), q: Ls.map(function (L, k) { return k === i || k === i + 1 ? 1 : 0; }) });
  }
  r.note(arr.length > 1 ? "Imposed load arranged per IS 456 cl 22.4.1: dead load on all spans with the imposed load on alternate spans (max sagging) and on two adjacent spans (max hogging at the support between them) — " + arr.length + " arrangements." : n > 1 ? (allowAll && p.pattern !== "on" ? "Design imposed load ≤ ¾ design dead load on every span — all spans loaded (cl 22.4.1(a), note)." : "Pattern loading switched off — all spans loaded.") : "Single span.");
  var NP = 240, env = [], sols = [];
  arr.forEach(function (a) {
    var w = Ls.map(function (L, i) { return gf * G[i] + qf * Q[i] * a.q[i]; });
    var s = B1.solve({ x: xs, sup: sup, w: w, EI: EI }); sols.push(s);
  });
  /* redistribution, cl 37.1.1: support moments reduced by δ, span moments by statics; resistance ≥ 70 % of the elastic envelope */
  var del = Math.min(Math.max(+p.redist || 0, 0), 30) / 100;
  function Mat(s, x) { return B1.at(s, x).M; }
  function supM(s, j) { return Mat(s, xs[j]); }
  var pts = []; Ls.forEach(function (L, i) { for (var k = 0; k <= NP; k++) pts.push({ sp: i, x: xs[i] + L * k / NP, t: k / NP }); });
  pts.forEach(function (q) {
    var mx = -Infinity, mn = Infinity, vmax = 0, emx = -Infinity, emn = Infinity;
    sols.forEach(function (s) {
      var xi = Math.min(Math.max(q.x, xs[q.sp] + 1e-7), xs[q.sp + 1] - 1e-7), m0 = Mat(s, xi), v = B1.at(s, xi).V;
      emx = Math.max(emx, m0); emn = Math.min(emn, m0);
      var red = m0;
      if (del) { var ML = sup[q.sp] === "free" ? 0 : supM(s, q.sp), MR = sup[q.sp + 1] === "free" ? 0 : supM(s, q.sp + 1); red = m0 - del * (Math.min(ML, 0) * (1 - q.t) + Math.min(MR, 0) * q.t); }
      mx = Math.max(mx, red); mn = Math.min(mn, red); vmax = Math.max(vmax, Math.abs(v));
    });
    if (del) { mx = Math.max(mx, 0.7 * emx); mn = Math.min(mn, 0.7 * emn); }
    q.Mmax = mx; q.Mmin = mn; q.V = vmax; q.Emax = emx; q.Emin = emn;
  });
  if (del) r.note("Moment redistribution " + U.f(del * 100, 0) + " % (cl 37.1.1): support moments reduced and span moments increased by statics for every arrangement; the moments used are not less than 70 % of the elastic envelope (cl 37.1.1(b)); xu/d at the supports is limited to 0.6 − δ = " + U.f(0.6 - del, 2) + " (cl 37.1.1(d)).");
  /* reactions envelope */
  var reac = xs.map(function (x, j) { var mx2 = 0; sols.forEach(function (s) { mx2 = Math.max(mx2, s.reac[j].V); }); return mx2; });
  r.table(["Support", "x (m)", "Max factored reaction (kN)", "Max hogging Mu (kNm)"], xs.map(function (x, j) {
    var hm = 0; pts.forEach(function (q) { if (Math.abs(q.x - x) < 1e-6) hm = Math.max(hm, -q.Mmin); });
    return [String(j + 1), U.f(x, 2), sup[j] === "free" ? "—" : U.f(reac[j], 1), U.f(hm, 1)];
  }));
  var Mlim = RCC.mulim(b, d, fck, fy), Amin = 0.85 * b * d / fy, Amax = 0.04 * b * Dd, dias = [12, 16, 20, 25];
  function steel(Mu, where, sup2) {
    if (Mu < 0.5) return { bars: { n: 2, dia: 12, area: 2 * D.barArea(12), text: "2 nos 12 mm φ" }, Ast: 0, nominal: true };
    var xr = sup2 && del ? Math.min(RCC.xumax(fy), 0.6 - del) : RCC.xumax(fy), Ml = 0.36 * fck * b * xr * d * (d - 0.416 * xr * d) / 1e6, Ast, Asc = 0;
    if (Mu <= Ml) Ast = RCC.astFlex(Mu, b, d, fck, fy);
    else { var xu = xr * d, fsc = Math.abs(RCC.fs(0.0035 * (xu - dc) / xu, fy)), fcc = 0.446 * fck; Asc = (Mu - Ml) * 1e6 / ((fsc - fcc) * (d - dc)); Ast = 0.36 * fck * b * xu / (0.87 * fy) + Asc * (fsc - fcc) / (0.87 * fy); }
    var bars = U.pickBars(Math.max(Ast, Amin), dias, 2, 8);
    return { bars: bars, Ast: Ast, Asc: Asc, doubly: Asc > 0, Ml: Ml, cbars: Asc > 0 ? U.pickBars(Asc, dias, 2, 6) : null };
  }
  r.h("2. Moment and shear envelope");
  var spanR = Ls.map(function (L, i) {
    var sp = pts.filter(function (q) { return q.sp === i; }), ms = 0, xm = 0, vl = sp[0].V, vr = sp[sp.length - 1].V;
    sp.forEach(function (q) { if (q.Mmax > ms) { ms = q.Mmax; xm = q.x - xs[i]; } });
    return { L: L, Ms: ms, xm: xm, VL: vl, VR: vr, cant: sup[i] === "free" || sup[i + 1] === "free" };
  });
  var supR = xs.map(function (x, j) { var hm = 0; pts.forEach(function (q) { if (Math.abs(q.x - x) < 1e-6) hm = Math.max(hm, -q.Mmin); }); return hm; });
  r.svg = RCC.contEnvSvg(pts, xs, sup);
  r.h("3. Flexure");
  var rows = [], ok = true;
  spanR.forEach(function (s, i) { s.bot = steel(s.Ms, "Span " + (i + 1), false); rows.push(["Span " + (i + 1) + " bottom", U.f(s.Ms, 1), U.f(s.bot.Ast, 0), s.bot.bars.text + (s.bot.doubly ? " (+ " + s.bot.cbars.text + " top, doubly)" : "")]); });
  var supS = supR.map(function (M0, j) { var st = steel(M0, "Support " + (j + 1), true); if (!st.nominal) rows.push(["Support " + (j + 1) + " top", U.f(M0, 1), U.f(st.Ast, 0), st.bars.text + (st.doubly ? " (+ " + st.cbars.text + " bottom, doubly)" : "")]); return st; });
  r.table(["Section", "Mu (kNm)", "Ast req (mm²)", "Provide"], rows);
  r.row("Mu,lim (singly reinforced)", U.f(Mlim, 1), "kNm", "Annex G-1.1(c)");
  r.row("Minimum / maximum steel", U.f(Amin, 0) + " / " + U.f(Amax, 0), "mm²", "cl 26.5.1.1");
  spanR.concat([]).forEach(function (s, i) { r.check("Span " + (i + 1) + ": Ast ≤ 0.04 bD", s.bot.bars.area <= Amax, U.f(s.bot.bars.area, 0) + " ≤ " + U.f(Amax, 0) + " mm²", "cl 26.5.1.1(b)"); });
  supS.forEach(function (st, j) { if (!st.nominal) r.check("Support " + (j + 1) + ": Ast ≤ 0.04 bD", st.bars.area <= Amax, U.f(st.bars.area, 0) + " ≤ " + U.f(Amax, 0) + " mm²", "cl 26.5.1.1(b)"); });
  r.h("4. Shear (at the support faces, critical section at d)");
  var Asv = 2 * D.barArea(p.stir), tcm = RCC.taucmax(fck), svmax = Math.min(0.75 * d, 300), svmin0 = 0.87 * fy * Asv / (0.4 * b), srow = [];
  spanR.forEach(function (s, i) {
    [["left", s.VL, supS[i]], ["right", s.VR, supS[i + 1]]].forEach(function (e) {
      if (e[1] < 1e-6) return;
      var wu = 1.5 * (G[i] + Q[i]), Vd = Math.max(0, e[1] - wu * d / 1000), tv = Vd * 1e3 / (b * d), At = Math.max(e[2].bars.area, s.bot.bars.area / 4), tc = RCC.tauc(fck, 100 * e[2].bars.area / (b * d)), sv;
      if (tv <= tc) sv = Math.min(svmin0, svmax); else { var Vus = (tv - tc) * b * d; sv = Math.min(0.87 * fy * Asv * d / Vus, svmax, svmin0); }
      sv = sv >= 100 ? U.floorTo(sv, 25) : U.floorTo(sv, 5);
      ok = ok && tv <= tcm;
      r.check("Span " + (i + 1) + " " + e[0] + ": τv ≤ τc,max", tv <= tcm, U.f(tv, 3) + " ≤ " + tcm + " N/mm²", "Table 20");
      srow.push(["Span " + (i + 1) + " " + e[0], U.f(e[1], 1), U.f(Vd, 1), U.f(tv, 3), U.f(tc, 3), "2L-" + p.stir + " @ " + sv]);
      s["sv" + e[0]] = sv;
    });
  });
  r.table(["Location", "Vu at support (kN)", "Vu at d (kN)", "τv", "τc", "Stirrups"], srow);
  r.note("Stirrup spacing ≤ 0.75 d and 300 mm (cl 26.5.1.5); minimum shear steel 0.4 b sv/(0.87 fy) (cl 26.5.1.6). Use the support spacing up to the point where τv falls to τc, the minimum spacing beyond.");
  r.h("5. Deflection (span/effective depth, cl 23.2.1)");
  spanR.forEach(function (s, i) {
    var basic = s.cant ? 7 : (n === 1 && sup[0] !== "fixed" && sup[1] !== "fixed") ? 20 : 26;
    if (s.L > 10 && !s.cant) basic *= 10 / s.L;
    var g = s.cant ? (supS[sup[i] === "free" ? i + 1 : i]) : s.bot, Ar = Math.max(g.Ast || 0, Amin), fs = 0.58 * fy * Math.min(Ar, g.bars.area) / g.bars.area;
    var kt = RCC.kt(100 * g.bars.area / (b * d), fs), allow = basic * kt, act = s.L * 1000 / d;
    r.check("Span " + (i + 1) + ": L/d ≤ " + U.f(basic, 1) + " × kt " + U.f(kt, 2), act <= allow, U.f(act, 1) + " ≤ " + U.f(allow, 1), "cl 23.2.1");
  });
  r.h("6. Crack width (service = Mu/1.5, IS 456 Annex F)");
  var wlim = DT.wlim({ cv: { expo: p.exp || "moderate", nom: p.cover } }), cmin = p.cover + p.stir;
  spanR.forEach(function (s, i) { if (s.bot.nominal) return; var cw = DT.crack(s.Ms / 1.5, b, Dd, d, s.bot.bars.n, s.bot.bars.dia, cmin, fck); r.check("Span " + (i + 1) + " soffit: wcr ≤ " + U.f(wlim, 2) + " mm", cw.w <= wlim + 1e-9, U.f(cw.w, 3) + " mm", "cl 35.3.2"); });
  supS.forEach(function (st, j) { if (st.nominal) return; var cw = DT.crack(supR[j] / 1.5, b, Dd, d, st.bars.n, st.bars.dia, cmin, fck); r.check("Support " + (j + 1) + " top: wcr ≤ " + U.f(wlim, 2) + " mm", cw.w <= wlim + 1e-9, U.f(cw.w, 3) + " mm", "cl 35.3.2"); });
  r.h("7. Curtailment (cl 26.2.3)");
  var crow = [];
  xs.forEach(function (x, j) {
    var st = supS[j]; if (st.nominal) return;
    var Ld = RCC.Ld(st.bars.dia, fy, fck), ext = [];
    [[j - 1, -1], [j, 1]].forEach(function (sd) {
      var i = sd[0]; if (i < 0 || i >= n) return;
      var sp = pts.filter(function (q) { return q.sp === i; }), far = 0;
      sp.forEach(function (q) { if (q.Mmin < -1e-6) far = Math.max(far, Math.abs(q.x - x)); });
      var lead = Math.max(d / 1000, 12 * st.bars.dia / 1000, Ls[i] / 16);
      ext.push((i < j ? "left" : "right") + " " + U.f(Math.min(far + lead, Ls[i]), 2) + " m");
    });
    crow.push(["Support " + (j + 1) + " top " + st.bars.text, ext.join(", "), "⅓ of the bars run to " + U.f(Math.max.apply(null, [0].concat(ext.map(function (e) { return parseFloat(e.split(" ")[1]); }))), 2) + " m; Ld = " + U.f(Ld, 0) + " mm"]);
  });
  spanR.forEach(function (s, i) { crow.push(["Span " + (i + 1) + " bottom " + s.bot.bars.text, "≥ ¼ of the bars into each support by ≥ Ld/3", "rest may stop at 0.15 L from interior supports when Mu permits"]); });
  r.table(["Bars", "Top bars extend beyond the point of contraflexure by max(d, 12φ, L/16)", "Notes"], crow);
  r.note("At simple end supports the positive bars satisfy Ld ≤ 1.3 M1/V + L0 (cl 26.2.3.3(c)); at interior supports ⅓ of the negative steel extends beyond the point of inflection by the larger of d, 12φ and L/16 (cl 26.2.3.4).");
  r.sum("Beam", b + " × " + Dd + " mm, " + n + " span" + (n > 1 ? "s" : "") + " (" + Ls.map(function (L) { return U.f(L, 2); }).join(" + ") + " m)");
  r.sum("Max sagging / hogging", U.f(Math.max.apply(null, spanR.map(function (s) { return s.Ms; })), 1) + " / " + U.f(Math.max.apply(null, supR), 1) + " kNm");
  r.sum("Bottom steel", spanR.map(function (s, i) { return "S" + (i + 1) + ": " + s.bot.bars.text; }).join("; "));
  r.sum("Top steel", supS.map(function (st, j) { return st.nominal ? null : "Sup" + (j + 1) + ": " + st.bars.text; }).filter(Boolean).join("; ") || "hangers 2 nos 12 mm φ");
  r.res = { spans: spanR, sup: supS, supM: supR, reac: reac, pts: pts, d: d };
  return r;
};
RCC.contEnvSvg = function (pts, xs, sup) {
  var W = 640, H = 190, ml = 46, mr = 14, Lt = xs[xs.length - 1], sx = (W - ml - mr) / Lt;
  function plot(keyA, keyB, title, unit, col, invert, mono) {
    var vals = []; pts.forEach(function (q) { vals.push(q[keyA]); if (keyB) vals.push(q[keyB]); });
    var mx = Math.max(1e-9, Math.max.apply(null, vals.map(Math.abs))), sy = (H / 2 - 34) / mx, y0 = H / 2 + 4;
    function path(k, sg) { return "M" + ml + " " + y0 + pts.map(function (q) { return " L" + (ml + q.x * sx).toFixed(1) + " " + (y0 + (invert ? 1 : -1) * sg * q[k] * sy).toFixed(1); }).join("") + " L" + (ml + Lt * sx).toFixed(1) + " " + y0; }
    var o = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="bmd" xmlns="http://www.w3.org/2000/svg"><text x="4" y="14" class="bt">' + title + '</text>';
    o += '<path d="' + path(keyA, 1) + '" fill="' + col + '" fill-opacity=".15" stroke="' + col + '" stroke-width="1.6"/>';
    if (keyB) o += '<path d="' + path(keyB, 1) + '" fill="' + col + '" fill-opacity=".08" stroke="' + col + '" stroke-width="1.2" stroke-dasharray="4 3"/>';
    o += '<line x1="' + ml + '" y1="' + y0 + '" x2="' + (W - mr) + '" y2="' + y0 + '" stroke="#6b7a8a"/>';
    xs.forEach(function (x, j) { var X = ml + x * sx; if (sup[j] !== "free") o += '<path d="M' + X + ' ' + (y0 + 1) + ' l-5 9 h10 z" fill="#6b7a8a"/>'; o += '<text x="' + (X - 6) + '" y="' + (H - 4) + '" class="bv">' + U.f(x, 1) + '</text>'; });
    var iA = 0, iB = 0; pts.forEach(function (q, i) { if (q[keyA] > pts[iA][keyA]) iA = i; if ((keyB ? q[keyB] : q[keyA]) < (keyB ? pts[iB][keyB] : pts[iB][keyA])) iB = i; });
    [[iA, keyA], [iB, keyB || keyA]].forEach(function (e) { var v = pts[e[0]][e[1]]; if (Math.abs(v) < mx * 0.03) return; var X = ml + pts[e[0]].x * sx, Y = y0 + (invert ? 1 : -1) * v * sy; o += '<text x="' + Math.min(W - 70, Math.max(ml, X - 18)).toFixed(1) + '" y="' + Math.min(H - 16, Math.max(26, Y + ((invert ? 1 : -1) * v > 0 ? 13 : -5))).toFixed(1) + '" class="bv">' + U.f(v, 1) + ' ' + unit + '</text>'; });
    return o + '</svg>';
  }
  return '<div class="dwgs"><div class="dwgt">Factored envelopes over all load arrangements — sagging below the axis</div><div class="tw">' + plot("Mmax", "Mmin", "Bending moment envelope Mu", "kNm", "#1d4ed8", true) + plot("V", null, "Shear envelope |Vu|", "kN", "#c2410c", false) + '</div></div>';
};

/* ------------------------------------------------------------ CANTILEVER RETAINING WALL */
RCC.retWall = function (p) {
  var r = new Rep("Cantilever Retaining Wall", "IS 456:2000 cl 20, 34; Rankine earth pressure");
  var H = p.H, gs = p.gs, phi = p.phi * Math.PI / 180, bet = (p.beta || 0) * Math.PI / 180, q = p.q || 0, mu = p.mu, sbc = p.sbc, fck = p.fck, fy = p.fy, gc = 25;
  if (bet >= phi) throw new Error("Backfill slope must be less than the angle of internal friction");
  var Ka = bet ? Math.cos(bet) * (Math.cos(bet) - Math.sqrt(Math.cos(bet) * Math.cos(bet) - Math.cos(phi) * Math.cos(phi))) / (Math.cos(bet) + Math.sqrt(Math.cos(bet) * Math.cos(bet) - Math.cos(phi) * Math.cos(phi))) : (1 - Math.sin(phi)) / (1 + Math.sin(phi));
  var Kp = (1 + Math.sin(phi)) / (1 - Math.sin(phi)), Df = p.Df || 0;
  r.h("1. Earth pressure (Rankine)");
  r.eq("Ka = " + (bet ? "cos β (cos β − √(cos²β − cos²φ)) / (cos β + √(cos²β − cos²φ))" : "(1 − sin φ)/(1 + sin φ)") + " = " + U.f(Ka, 3) + " ; Kp = " + U.f(Kp, 3), "Rankine");
  /* proportions: user values or the usual first trial (base width 0.5–0.7 H, toe ≈ B/3, base and stem ≈ H/12) */
  var tb = p.tb > 0 ? p.tb / 1000 : U.ceilTo(Math.max(H / 12, 0.3), 0.05), tt = (p.ttop > 0 ? p.ttop : 200) / 1000, ts = p.tstem > 0 ? p.tstem / 1000 : U.ceilTo(Math.max(H / 12, tt + 0.05, 0.25), 0.025);
  var B = p.B > 0 ? p.B : U.ceilTo(0.5 * H, 0.05), toe = p.toe > 0 ? p.toe : U.ceilTo(B / 3, 0.05), auto = !(p.B > 0);
  var h = H - tb, st = null;
  function stab(Bw, toeL) {
    var heel = Bw - toeL - ts, Wk = [];
    if (heel < 0.1) return null;
    Wk.push(["Stem (rectangular part)", gc * tt * h, toeL + ts - tt / 2]);
    if (ts > tt) Wk.push(["Stem (tapered part)", gc * (ts - tt) * h / 2, toeL + (ts - tt) * 2 / 3]);
    Wk.push(["Base slab", gc * Bw * tb, Bw / 2]);
    Wk.push(["Soil over the heel", gs * heel * h, toeL + ts + heel / 2]);
    if (bet) Wk.push(["Sloping fill over the heel", gs * heel * heel * Math.tan(bet) / 2, toeL + ts + heel * 2 / 3]);
    if (Df > tb) Wk.push(["Soil over the toe", gs * toeL * (Df - tb), toeL / 2]);
    var Hs = H + (bet ? heel * Math.tan(bet) : 0), Pa = Ka * gs * Hs * Hs / 2, Pq = Ka * q * Hs, Pah = Pa * Math.cos(bet), Pav = Pa * Math.sin(bet);
    var W = Wk.reduce(function (s, w) { return s + w[1]; }, 0), Mr = Wk.reduce(function (s, w) { return s + w[1] * w[2]; }, 0), Wq = q * heel, Mq = Wq * (toeL + ts + heel / 2);
    if (Pav) { W += Pav; Mr += Pav * Bw; }
    var Mo = Pah * Hs / 3, Moq = Pq * Hs / 2, Ht = Pah + Pq;
    /* IS 456 cl 20.1: 0.9 × restoring ≥ 1.2 × overturning (earth) + 1.4 × overturning (surcharge); surcharge on the heel not taken as restoring */
    var ovt = 0.9 * Mr / (1.2 * Mo + 1.4 * Moq), Pp = p.passive === "yes" ? Kp * gs * Df * Df / 2 : 0;
    var sld = (0.9 * mu * W + Pp) / (1.4 * Pa * Math.cos(bet) + 1.4 * Pq);
    /* service bearing pressure with surcharge */
    var Wv = W + Wq, Mnet = Mr + Mq - Mo - Moq, xr = Mnet / Wv, e = Bw / 2 - xr, qmax, qmin, qheel, qtoe;
    if (Math.abs(e) <= Bw / 6) { qmax = Wv / Bw * (1 + 6 * Math.abs(e) / Bw); qmin = Wv / Bw * (1 - 6 * Math.abs(e) / Bw); }
    else { qmax = 2 * Wv / (3 * (Bw / 2 - Math.abs(e))); qmin = 0; }
    qtoe = e >= 0 ? qmax : qmin; qheel = e >= 0 ? qmin : qmax;
    return { Wk: Wk, W: W, Wq: Wq, Mr: Mr, Mq: Mq, Mo: Mo, Moq: Moq, Pa: Pa, Pq: Pq, Pah: Pah, Ht: Ht, ovt: ovt, sld: sld, Pp: Pp, e: e, xr: xr, qmax: qmax, qmin: qmin, qtoe: qtoe, qheel: qheel, heel: heel, Hs: Hs, B: Bw, toe: toeL, Wv: Wv };
  }
  for (var it = 0; it < 200; it++) {
    st = stab(B, toe);
    var good = st && st.ovt >= 1 && st.sld >= 1 && st.qmax <= sbc && st.qmin >= 0;
    if (good || !auto) break;
    B = U.ceilTo(B + 0.05, 0.05); if (!(p.toe > 0)) toe = U.ceilTo(B / 3, 0.05);
  }
  if (!st) throw new Error("The heel is too short for the stem — increase the base width or reduce the toe");
  r.row("Height of retained earth above founding level H", U.f(H, 2), "m");
  r.row("Soil: γ, φ, base friction μ", U.f(gs, 1) + " kN/m³, " + p.phi + "°, " + mu, "");
  r.row("Surcharge q", U.f(q, 1), "kN/m²");
  r.eq("Pa = Ka γ H²/2 = " + U.f(st.Pa, 2) + " kN/m at H/3 ; Pq = Ka q H = " + U.f(st.Pq, 2) + " kN/m at H/2" + (bet ? " (H at the heel end " + U.f(st.Hs, 2) + " m, inclined at β)" : ""), "");
  r.h("2. Proportions" + (auto ? " (base widened until stable)" : ""));
  r.row("Base width B / toe / heel", U.f(B, 2) + " / " + U.f(toe, 2) + " / " + U.f(st.heel, 2), "m");
  r.row("Base thickness / stem at base / stem at top", U.f(tb * 1000, 0) + " / " + U.f(ts * 1000, 0) + " / " + U.f(tt * 1000, 0), "mm");
  r.table(["Load (per m run)", "W (kN)", "Lever arm about the toe (m)", "Moment (kNm)"], st.Wk.map(function (w) { return [w[0], U.f(w[1], 2), U.f(w[2], 3), U.f(w[1] * w[2], 2)]; }).concat([["Total", U.f(st.W, 2), "", U.f(st.Mr, 2)]]));
  r.h("3. Stability (IS 456 cl 20)");
  r.eq("Overturning: 0.9 Mr / (1.2 Mo,earth + 1.4 Mo,surcharge) = 0.9 × " + U.f(st.Mr, 1) + " / (1.2 × " + U.f(st.Mo, 1) + " + 1.4 × " + U.f(st.Moq, 1) + ") = " + U.f(st.ovt, 2), "cl 20.1");
  r.check("Overturning — ratio ≥ 1.0", st.ovt >= 1, U.f(st.ovt, 2) + " ≥ 1.0 (conventional Mr/Mo " + U.f(st.Mr / (st.Mo + st.Moq), 2) + ")", "cl 20.1");
  r.eq("Sliding: (0.9 μ W" + (st.Pp ? " + Pp" : "") + ") / H = (0.9 × " + mu + " × " + U.f(st.W, 1) + (st.Pp ? " + " + U.f(st.Pp, 1) : "") + ") / " + U.f(st.Ht, 1) + " → factor " + U.f(st.sld * 1.4, 2) + " ≥ 1.4", "cl 20.2");
  r.check("Sliding — factor ≥ 1.4", st.sld >= 1, U.f(st.sld * 1.4, 2) + " ≥ 1.4", "cl 20.2");
  if (st.sld < 1 && !st.Pp) r.note("Sliding governs: widen the base, add a shear key below the base, or include passive resistance in front of the toe (Df " + U.f(Df, 2) + " m).");
  r.eq("Resultant at " + U.f(st.xr, 3) + " m from the toe, e = " + U.f(st.e, 3) + " m (B/6 = " + U.f(B / 6, 3) + ") → q = " + U.f(st.qtoe, 1) + " kN/m² (toe) / " + U.f(st.qheel, 1) + " kN/m² (heel)", "");
  r.check("Max bearing pressure ≤ SBC", st.qmax <= sbc, U.f(st.qmax, 1) + " ≤ " + sbc + " kN/m²", "");
  r.check("No tension under the base (e ≤ B/6)", Math.abs(st.e) <= B / 6 + 1e-9, "e = " + U.f(st.e, 3) + " m", "");
  /* structural design, factor 1.5 */
  var cov = p.cover, dia = p.dia, wlim = 0;
  function des(Mu, Dthk, name, ref) {
    var dd = Dthk * 1000 - cov - dia / 2, Ast = Math.max(RCC.astFlex(Mu, 1000, dd, fck, fy), 0.0012 * 1000 * Dthk * 1000), Ml = RCC.mulim(1000, dd, fck, fy);
    var sp = U.spacing(Ast, dia, Math.min(3 * dd, 300));
    r.check(name + ": Mu ≤ Mu,lim", Mu <= Ml, U.f(Mu, 1) + " ≤ " + U.f(Ml, 1) + " kNm/m", ref || "Annex G");
    r.row(name + " — steel", sp.text, "", "Ast " + U.f(Ast, 0) + " mm²/m (d = " + U.f(dd, 0) + " mm)");
    return { d: dd, Ast: Ast, sp: sp };
  }
  function shear(Vu, dd, sp, name) {
    var tv = Vu * 1e3 / (1000 * dd), k = U.interp([150, 300], [1.3, 1.0], Math.max(150, Math.min(300, dd + cov + dia / 2))), tc = k * RCC.tauc(fck, 100 * sp.area / (1000 * dd));
    r.check(name + ": τv ≤ k τc (no shear steel)", tv <= tc, U.f(tv, 3) + " ≤ " + U.f(tc, 3) + " N/mm²", "cl 40.2.1.1");
  }
  r.h("4. Stem (cantilever from the base, factored 1.5)");
  var Mst = 1.5 * (Ka * gs * Math.pow(h, 3) / 6 + Ka * q * h * h / 2), Vst = 1.5 * (Ka * gs * h * h / 2 + Ka * q * h);
  r.eq("Mu = 1.5 (Ka γ h³/6 + Ka q h²/2) = " + U.f(Mst, 1) + " kNm/m ; Vu = " + U.f(Vst, 1) + " kN/m (h = " + U.f(h, 2) + " m)", "");
  var sm = des(Mst, ts, "Stem, earth face (vertical bars)");
  var Vd = 1.5 * (Ka * gs * Math.pow(Math.max(h - sm.d / 1000, 0), 2) / 2 + Ka * q * Math.max(h - sm.d / 1000, 0));
  shear(Vd, sm.d, sm.sp, "Stem at d above the base");
  /* curtail half the bars where the moment falls to half (moment ∝ depth³ for earth): depth z with M(z) = Mst/2 */
  var zc = h; for (var z = 0; z <= h; z += 0.01) { var Mz = 1.5 * (Ka * gs * z * z * z / 6 + Ka * q * z * z / 2); if (Mz >= Mst / 2) { zc = z; break; } }
  var Ld = RCC.Ld(dia, fy, fck), cutH = Math.max(0, h - zc - Math.max(sm.d / 1000, 12 * dia / 1000));
  r.row("Curtail alternate stem bars at", U.f(cutH, 2) + " m above the base", "", "M = Mu/2 at " + U.f(h - zc, 2) + " m, less max(d, 12φ) (cl 26.2.3.1)");
  var distS = U.spacing(0.0012 * 1000 * (tt + ts) / 2 * 1000, 8, Math.min(450, 5 * sm.d));
  r.row("Stem distribution / front face (temperature) steel", distS.text + " each face, horizontal; front face vertical " + U.spacing(0.0012 * 1000 * ts * 1000 / 2, 8, 300).text, "", "0.12 % (cl 26.5.2.1)");
  r.h("5. Heel slab (downward soil, surcharge and self weight less the upward pressure)");
  var x0 = toe + ts, qAt = function (x) { return st.qtoe + (st.qheel - st.qtoe) * x / B; }, Mh = 0, Vh = 0, nn = 40;
  var wdown = gs * h + q + gc * tb + (bet ? gs * st.heel * Math.tan(bet) / 2 : 0);
  for (var i2 = 0; i2 < nn; i2++) { var xa = x0 + st.heel * (i2 + 0.5) / nn, dx = st.heel / nn, net = wdown - qAt(xa); Mh += net * dx * (xa - x0); Vh += net * dx; }
  Mh = 1.5 * Math.max(Mh, 0); Vh = 1.5 * Math.max(Vh, 0);
  r.eq("Net downward load on the heel → Mu = " + U.f(Mh, 1) + " kNm/m at the stem face (tension at the top), Vu = " + U.f(Vh, 1) + " kN/m", "");
  var hs = des(Mh, tb, "Heel, top bars");
  shear(Vh, hs.d, hs.sp, "Heel at the stem face");
  r.h("6. Toe slab (upward pressure less self weight)");
  var Mt = 0, Vt = 0, Vtd = 0, dT = (tb * 1000 - cov - dia / 2) / 1000;
  for (i2 = 0; i2 < nn; i2++) { var xb = toe * (i2 + 0.5) / nn, dx2 = toe / nn, net2 = qAt(xb) - gc * tb; Mt += net2 * dx2 * (toe - xb); Vt += net2 * dx2; if (xb < toe - dT) Vtd += net2 * dx2; }
  Mt = 1.5 * Math.max(Mt, 0); Vtd = 1.5 * Math.max(Vtd, 0);
  r.eq("Mu = " + U.f(Mt, 1) + " kNm/m at the stem face (tension at the bottom); Vu at d from the face = " + U.f(Vtd, 1) + " kN/m", "");
  var ts2 = des(Mt, tb, "Toe, bottom bars");
  shear(Vtd, ts2.d, ts2.sp, "Toe at d from the face");
  r.row("Base distribution steel", U.spacing(0.0012 * 1000 * tb * 1000, 10, 300).text + " both faces along the wall", "", "0.12 %");
  r.row("Stem bars anchored into the base", "L-bars, leg " + U.f(Math.max(Ld - (tb * 1000 - cov), 12 * dia), 0) + " mm along the base", "", "Ld = " + U.f(Ld, 0) + " mm (cl 26.2.1)");
  r.svg = RCC.wallSvg({ H: H, tb: tb, ts: ts, tt: tt, B: B, toe: toe, heel: st.heel, Df: Df, qtoe: st.qtoe, qheel: st.qheel, beta: bet });
  r.note("Provide weep holes (≥ 75 mm at about 1.5 m centres) and a filter / drainage layer behind the stem so that no water pressure builds up — the design assumes drained backfill.");
  r.sum("Wall", "H " + U.f(H, 2) + " m; base " + U.f(B, 2) + " m (toe " + U.f(toe, 2) + ", heel " + U.f(st.heel, 2) + "), " + U.f(tb * 1000, 0) + " mm thick; stem " + U.f(tt * 1000, 0) + "–" + U.f(ts * 1000, 0) + " mm");
  r.sum("Stability", "overturning " + U.f(st.ovt, 2) + ", sliding " + U.f(st.sld * 1.4, 2) + ", qmax " + U.f(st.qmax, 0) + " kN/m²");
  r.sum("Stem / heel / toe steel", sm.sp.text + " / " + hs.sp.text + " / " + ts2.sp.text);
  r.res = { B: B, toe: toe, heel: st.heel, tb: tb, ts: ts, st: st, stem: sm, heelS: hs, toeS: ts2, Ka: Ka, Mst: Mst };
  return r;
};
RCC.wallSvg = function (g) {
  var W = 420, Hh = 300, pad = 40, sc = Math.min((W - 2 * pad) / g.B, (Hh - 70) / g.H), X = function (x) { return pad + x * sc; }, Y = function (y) { return Hh - 40 - y * sc; };
  var h = g.H - g.tb, o = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" class="bmd" xmlns="http://www.w3.org/2000/svg"><text x="4" y="14" class="bt">Section (per m run)</text>';
  o += '<path d="M' + X(0) + ' ' + Y(0) + ' H' + X(g.B) + ' V' + Y(g.tb) + ' H' + X(g.toe + g.ts) + ' L' + X(g.toe + g.ts) + ' ' + Y(g.H) + ' H' + X(g.toe + g.ts - g.tt) + ' L' + X(g.toe) + ' ' + Y(g.tb) + ' H' + X(0) + ' Z" fill="#cbd5e1" stroke="#334155" stroke-width="1.5"/>';
  o += '<path d="M' + X(g.toe + g.ts) + ' ' + Y(g.H) + ' L' + X(g.B) + ' ' + Y(g.H + g.heel * Math.tan(g.beta || 0)) + '" stroke="#a16207" stroke-dasharray="5 3"/><text x="' + (X(g.B) - 60) + '" y="' + (Y(g.H) - 6) + '" class="bv">backfill</text>';
  var qs = Math.max(g.qtoe, g.qheel) || 1, k = 26 / qs;
  o += '<path d="M' + X(0) + ' ' + (Y(0) + 4) + ' L' + X(0) + ' ' + (Y(0) + 4 + g.qtoe * k) + ' L' + X(g.B) + ' ' + (Y(0) + 4 + g.qheel * k) + ' L' + X(g.B) + ' ' + (Y(0) + 4) + ' Z" fill="#c2410c" fill-opacity=".2" stroke="#c2410c"/>';
  o += '<text x="' + X(0) + '" y="' + (Hh - 2) + '" class="bv">' + U.f(g.qtoe, 0) + ' kN/m²</text><text x="' + (X(g.B) - 52) + '" y="' + (Hh - 2) + '" class="bv">' + U.f(g.qheel, 0) + ' kN/m²</text>';
  o += '<text x="' + (X(g.B / 2) - 30) + '" y="' + (Y(0) - 4) + '" class="bv">B ' + U.f(g.B, 2) + ' m</text><text x="' + (X(g.toe + g.ts) + 6) + '" y="' + Y(g.H / 2) + '" class="bv">H ' + U.f(g.H, 2) + ' m</text>';
  return '<div class="dwgs"><div class="tw">' + o + '</svg></div></div>';
};

/* ------------------------------------------------------------ COMBINED FOOTING (two columns) */
RCC.combFooting = function (p) {
  var r = new Rep("Combined Footing (two columns)", "IS 456:2000 cl 34");
  var P1 = p.P1, P2 = p.P2, s = p.s, a1 = p.c1b / 1000, b1 = p.c1d / 1000, a2 = p.c2b / 1000, b2 = p.c2d / 1000, q = p.sbc, fck = p.fck, fy = p.fy, cov = p.cover, dia = p.dia;
  var P = P1 + P2, xbar = P2 * s / P;
  r.h("1. Plan size (resultant at the centre of the footing)");
  r.eq("Resultant of the service loads from column 1: x̄ = P2 s / (P1 + P2) = " + U.f(P2, 1) + " × " + U.f(s, 2) + " / " + U.f(P, 1) + " = " + U.f(xbar, 3) + " m", "");
  var A = P * (1 + p.sw / 100) / q, edge = p.edge === "line";
  var aL = edge ? b1 / 2 : (p.projL > 0 ? p.projL : null), L;
  if (aL === null) { L = U.ceilTo(2 * Math.max(xbar + b1 / 2 + 0.3, s - xbar + b2 / 2 + 0.3), 0.05); aL = L / 2 - xbar; }
  else L = U.ceilTo(2 * (xbar + aL), 0.05);
  var aR = L - aL - s;
  if (aR < b2 / 2) { r.note("With the left projection fixed the right column would overhang the footing; the footing is not centred on the resultant (pressure varies) — check below."); aR = b2 / 2; L = aL + s + aR; }
  var B = U.ceilTo(A / L, 0.05), e = (aL + xbar) - L / 2;
  r.eq("Area = (P1 + P2)(1 + " + p.sw + " %) / SBC = " + U.f(A, 2) + " m² ; L = " + U.f(L, 2) + " m (projection " + U.f(aL, 2) + " m left of column 1" + (edge ? " — column 1 on the property line" : "") + ", " + U.f(aR, 2) + " m right of column 2) ; B = " + U.f(B, 2) + " m", "");
  var qa = P * (1 + p.sw / 100) / (B * L), qmax = qa * (1 + 6 * Math.abs(e) / L);
  r.check("Gross pressure ≤ SBC", qmax <= q * 1.0001, U.f(qmax, 1) + " ≤ " + q + " kN/m²" + (Math.abs(e) > 1e-3 ? " (eccentricity " + U.f(e, 3) + " m)" : ""), "");
  var Pu1 = 1.5 * P1, Pu2 = 1.5 * P2, Pu = Pu1 + Pu2, qu = Pu / (B * L);
  r.row("Factored net upward pressure qu", U.f(qu, 1), "kN/m²", "1.5 (P1 + P2) / (B L)");
  /* longitudinal: beam of length L, upward w = qu B (uniform; with eccentricity linear), column loads spread over the column depth */
  var NX = 400, xsA = [], Vx = [], Mx = [], wq = function (x) { var qe = qu * (1 + 12 * e * (x - L / 2) / (L * L)); return qe * B; };
  var c1 = aL, c2 = aL + s;
  for (var i = 0; i <= NX; i++) {
    var x = L * i / NX, V = 0, M = 0, nn = 60;
    for (var k = 0; k < nn; k++) { var xi = x * (k + 0.5) / nn, dx = x / nn; V += wq(xi) * dx; M += wq(xi) * dx * (x - xi); }
    [[c1, b1, Pu1], [c2, b2, Pu2]].forEach(function (c) { var lo = c[0] - c[1] / 2, hi = c[0] + c[1] / 2; if (x <= lo) return; var ln = Math.min(x, hi) - lo, wcol = c[2] / c[1]; V -= wcol * ln; M -= wcol * ln * (x - (lo + ln / 2)); });
    xsA.push(x); Vx.push(V); Mx.push(M);
  }
  var Mhog = 0, xh = 0, Msag = 0, xs2 = 0; Mx.forEach(function (m, i3) { if (-m > Mhog) { Mhog = -m; xh = xsA[i3]; } if (m > Msag) { Msag = m; xs2 = xsA[i3]; } });
  r.h("2. Longitudinal bending (beam on the two columns, upward soil pressure)");
  r.row("Max hogging moment (between the columns, tension at the top)", U.f(Mhog, 1) + " kNm at " + U.f(xh, 2) + " m", "");
  r.row("Max sagging moment (at the columns, tension at the bottom)", U.f(Msag, 1) + " kNm at " + U.f(xs2, 2) + " m", "");
  r.svg = RCC.cfSvg(xsA, Mx, Vx, L, c1, c2);
  /* depth: punching at both columns, one-way shear at d from the faces, bending */
  var kmu = RCC.mulim(1, 1, fck, fy) * 1e6, d = Math.max(U.ceilTo(Math.sqrt(Math.max(Mhog, Msag) * 1e6 / (kmu * B * 1000)), 25), 200), ok = false, chk = {};
  function Vat(x) { var i4 = Math.round(Math.min(Math.max(x / L, 0), 1) * NX); return Math.abs(Vx[i4]); }
  for (var it = 0; it < 120 && !ok; it++) {
    var dm = d / 1000, ks1 = Math.min(1, 0.5 + Math.min(a1, b1) / Math.max(a1, b1)), ks2 = Math.min(1, 0.5 + Math.min(a2, b2) / Math.max(a2, b2)), tpa = 0.25 * Math.sqrt(fck);
    /* column 1: 3-sided perimeter on the property line */
    var bo1 = edge ? 2 * (b1 + dm / 2) + (a1 + dm) : 2 * ((a1 + dm) + (b1 + dm)), Ain1 = edge ? (b1 + dm / 2) * (a1 + dm) : (a1 + dm) * (b1 + dm), Vp1 = Pu1 - qu * Ain1, tp1 = Vp1 * 1e3 / (bo1 * 1000 * d);
    var bo2 = 2 * ((a2 + dm) + (b2 + dm)), Vp2 = Pu2 - qu * (a2 + dm) * (b2 + dm), tp2 = Vp2 * 1e3 / (bo2 * 1000 * d);
    var xs3 = [c1 + b1 / 2 + dm, c2 - b2 / 2 - dm, c1 - b1 / 2 - dm, c2 + b2 / 2 + dm].filter(function (x) { return x > 0 && x < L; });
    var Vow = Math.max.apply(null, xs3.map(Vat).concat([0])), tvow = Vow * 1e3 / (B * 1000 * d);
    var AstT = RCC.astFlex(Mhog, B * 1000, d, fck, fy), tc = RCC.tauc(fck, 100 * Math.max(AstT, 0.0012 * B * 1000 * (d + cov + dia)) / (B * 1000 * d));
    chk = { tp1: tp1, tp2: tp2, tpa1: ks1 * tpa, tpa2: ks2 * tpa, tvow: tvow, tc: tc, Vow: Vow };
    ok = tp1 <= ks1 * tpa && tp2 <= ks2 * tpa && tvow <= tc;
    if (!ok) d += 25;
  }
  var Dtot = U.ceilTo(d + cov + dia / 2, 25);
  r.h("3. Depth — punching and one-way shear");
  r.row("Effective depth d / overall depth D", d + " / " + Dtot, "mm");
  r.check("Punching at column 1" + (edge ? " (3-sided, on the property line)" : ""), chk.tp1 <= chk.tpa1, U.f(chk.tp1, 3) + " ≤ ks 0.25√fck = " + U.f(chk.tpa1, 3) + " N/mm²", "cl 31.6.3");
  r.check("Punching at column 2", chk.tp2 <= chk.tpa2, U.f(chk.tp2, 3) + " ≤ " + U.f(chk.tpa2, 3) + " N/mm²", "cl 31.6.3");
  r.check("One-way shear at d from the column faces", chk.tvow <= chk.tc, U.f(chk.tvow, 3) + " ≤ τc " + U.f(chk.tc, 3) + " N/mm² (Vu " + U.f(chk.Vow, 1) + " kN)", "cl 34.2.4.1(a)");
  r.check("Mu ≤ Mu,lim", Math.max(Mhog, Msag) <= RCC.mulim(B * 1000, d, fck, fy), U.f(Math.max(Mhog, Msag), 1) + " ≤ " + U.f(RCC.mulim(B * 1000, d, fck, fy), 1) + " kNm", "");
  r.h("4. Longitudinal steel (over the full width B)");
  var Amin = 0.0012 * B * 1000 * Dtot, At = Math.max(RCC.astFlex(Mhog, B * 1000, d, fck, fy), Amin), Ab = Math.max(RCC.astFlex(Msag, B * 1000, d, fck, fy), Amin);
  var nTop = U.spacing(At / B, dia, 300), nBot = U.spacing(Ab / B, dia, 300);
  r.row("Top (between the columns)", nTop.text, "", "Ast " + U.f(At, 0) + " mm² over " + U.f(B, 2) + " m");
  r.row("Bottom (under the columns)", nBot.text, "", "Ast " + U.f(Ab, 0) + " mm²; at least the minimum 0.12 % over the whole length");
  r.h("5. Transverse steel — column bands (width = column + 0.75 d each side)");
  [[1, a1, Pu1], [2, a2, Pu2]].forEach(function (c) {
    var proj = (B - c[1]) / 2, Mt = c[2] / B * proj * proj / 2, bw = c[1] + 2 * 0.75 * d / 1000, dT = d - dia, Ast = Math.max(RCC.astFlex(Mt, bw * 1000, dT, fck, fy), 0.0012 * bw * 1000 * Dtot);
    var sp = U.spacing(Ast / bw, dia, 300);
    r.row("Column " + c[0] + ": Mu = (Pu/B)(B − b)²/2 = " + U.f(Mt, 1) + " kNm over a band " + U.f(bw, 2) + " m", sp.text, "", "Ast " + U.f(Ast, 0) + " mm²");
  });
  r.row("Elsewhere (transverse)", U.spacing(0.0012 * 1000 * Dtot, Math.min(dia, 10), 300).text, "", "0.12 %");
  r.h("6. Bearing and anchorage");
  [[1, a1, b1, Pu1], [2, a2, b2, Pu2]].forEach(function (c) {
    var A1 = c[1] * c[2], A2 = Math.min(B * L, (c[1] + 4 * Dtot / 1000) * (c[2] + 4 * Dtot / 1000)), fbr = 0.45 * fck * Math.min(2, Math.sqrt(A2 / A1)), fa = c[3] * 1e3 / (A1 * 1e6);
    r.check("Bearing under column " + c[0], fa <= fbr, U.f(fa, 2) + " ≤ " + U.f(fbr, 2) + " N/mm²", "cl 34.4");
  });
  var Ld = RCC.Ld(dia, fy, fck), up = Dtot - 2 * cov - 2 * dia;
  [[1, aL - b1 / 2], [2, aR - b2 / 2]].forEach(function (c) {
    var avail = Math.max(0, c[1] * 1000 - cov), straight = avail >= Ld, bent = avail + 8 * dia + up;
    r.check("Anchorage of the bottom bars beyond column " + c[0] + (straight ? "" : " (bent up at the end)"), straight || bent >= Ld, U.f(straight ? avail : bent, 0) + " ≥ Ld " + U.f(Ld, 0) + " mm" + (straight ? "" : " (straight " + U.f(avail, 0) + " + 8φ + bend-up " + U.f(up, 0) + ")"), "cl 34.2.4.3, 26.2.2.1");
  });
  r.sum("Footing", U.f(L, 2) + " × " + U.f(B, 2) + " m, D = " + Dtot + " mm");
  r.sum("Longitudinal", "top " + nTop.text + ", bottom " + nBot.text);
  r.sum("Max pressure", U.f(qmax, 0) + " kN/m² (SBC " + q + ")");
  r.res = { L: L, B: B, D: Dtot, d: d, aL: aL, aR: aR, Mhog: Mhog, Msag: Msag, chk: chk, top: nTop, bot: nBot };
  return r;
};
RCC.cfSvg = function (xs, M, V, L, c1, c2) {
  var W = 640, H = 170, ml = 46, mr = 14, sx = (W - ml - mr) / L;
  function plot(vals, title, unit, col, invert) {
    var mx = Math.max(1e-9, Math.max.apply(null, vals.map(Math.abs))), sy = (H / 2 - 34) / mx, y0 = H / 2 + 6;
    var o = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="bmd" xmlns="http://www.w3.org/2000/svg"><text x="4" y="14" class="bt">' + title + '</text><path d="M' + ml + ' ' + y0 + vals.map(function (v, i) { return ' L' + (ml + xs[i] * sx).toFixed(1) + ' ' + (y0 + (invert ? 1 : -1) * v * sy).toFixed(1); }).join("") + ' L' + (ml + L * sx) + ' ' + y0 + ' Z" fill="' + col + '" fill-opacity=".18" stroke="' + col + '" stroke-width="1.6"/><line x1="' + ml + '" y1="' + y0 + '" x2="' + (W - mr) + '" y2="' + y0 + '" stroke="#6b7a8a"/>';
    [c1, c2].forEach(function (c, k) { var X = ml + c * sx; o += '<path d="M' + X + ' ' + (y0 - 4) + ' v-14" stroke="#334155" stroke-width="3"/><text x="' + (X - 8) + '" y="' + (H - 4) + '" class="bv">C' + (k + 1) + '</text>'; });
    var iA = 0, iB = 0; vals.forEach(function (v, i) { if (v > vals[iA]) iA = i; if (v < vals[iB]) iB = i; });
    [iA, iB].forEach(function (i) { var v = vals[i]; if (Math.abs(v) < 0.03 * mx) return; var X = ml + xs[i] * sx, Y = y0 + (invert ? 1 : -1) * v * sy; o += '<text x="' + Math.min(W - 70, Math.max(ml, X - 18)).toFixed(1) + '" y="' + Math.min(H - 16, Math.max(26, Y + ((invert ? 1 : -1) * v > 0 ? 13 : -5))).toFixed(1) + '" class="bv">' + U.f(v, 1) + ' ' + unit + '</text>'; });
    return o + '</svg>';
  }
  return '<div class="dwgs"><div class="dwgt">Longitudinal bending moment (sagging below the axis) and shear — factored</div><div class="tw">' + plot(M, "Bending moment Mu", "kNm", "#1d4ed8", true) + plot(V, "Shear force Vu", "kN", "#c2410c", false) + '</div></div>';
};
if (typeof module !== "undefined") module.exports = RCC;
