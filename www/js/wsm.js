/* Working stress method: IS 456:2000 Annex B (RCC) and IS 800:2007 Section 11 (steel).
   Loads are working (unfactored) loads. For combinations with wind or earthquake the permissible stresses are
   increased by 33⅓ % (IS 456 Annex B, IS 875 Part 5); implemented as "inc" = 4/3 (forces ÷ inc). */
var WS = {};
WS.T21 = { 15: [5.0, 4.0, 0.6], 20: [7.0, 5.0, 0.8], 25: [8.5, 6.0, 0.9], 30: [10.0, 8.0, 1.0], 35: [11.5, 9.0, 1.1], 40: [13.0, 10.0, 1.2], 45: [14.5, 11.0, 1.3], 50: [16.0, 12.0, 1.4] };   /* σcbc, σcc, τbd (plain bars) */
WS.T22 = { 250: [140, 130], 415: [230, 190], 500: [275, 190], 550: [275, 190] };   /* σst (flexural tension), σsc (column compression) */
WS.T23_pt = [0.15, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00];
WS.T23 = {   /* τc permissible shear stress in concrete, N/mm² (Table 23) */
  15: [0.18, 0.22, 0.29, 0.34, 0.37, 0.40, 0.42, 0.44, 0.44, 0.44, 0.44, 0.44, 0.44],
  20: [0.18, 0.22, 0.30, 0.35, 0.39, 0.42, 0.45, 0.47, 0.49, 0.51, 0.51, 0.51, 0.51],
  25: [0.19, 0.23, 0.31, 0.36, 0.40, 0.44, 0.46, 0.49, 0.51, 0.53, 0.55, 0.56, 0.57],
  30: [0.20, 0.23, 0.31, 0.37, 0.41, 0.45, 0.48, 0.50, 0.53, 0.55, 0.57, 0.58, 0.60],
  35: [0.20, 0.23, 0.31, 0.37, 0.42, 0.45, 0.49, 0.52, 0.54, 0.56, 0.58, 0.60, 0.62],
  40: [0.20, 0.23, 0.32, 0.38, 0.42, 0.46, 0.49, 0.52, 0.55, 0.57, 0.60, 0.62, 0.63] };
WS.T24 = { 15: 1.6, 20: 1.8, 25: 1.9, 30: 2.2, 35: 2.3, 40: 2.5 };
function wk(o, fck) { var ks = Object.keys(o).map(Number).sort(function (a, b) { return a - b; }), k = ks[0]; ks.forEach(function (x) { if (fck >= x) k = x; }); return k; }
WS.scbc = function (fck) { return WS.T21[wk(WS.T21, fck)][0]; };
WS.scc = function (fck) { return WS.T21[wk(WS.T21, fck)][1]; };
WS.tbd = function (fck, fy) { return WS.T21[wk(WS.T21, fck)][2] * (fy > 250 ? 1.6 : 1); };
WS.sst = function (fy) { return (WS.T22[wk(WS.T22, fy)] || [230])[0]; };
WS.ssc = function (fy) { return (WS.T22[wk(WS.T22, fy)] || [0, 190])[1]; };
WS.ssv = function (fy) { return Math.min(WS.sst(fy), 230); };
WS.m = function (fck) { return 280 / (3 * WS.scbc(fck)); };
WS.tauc = function (fck, pt) { return U.interp(WS.T23_pt, WS.T23[wk(WS.T23, fck)], Math.max(0.15, Math.min(pt, 3))); };
WS.taucmax = function (fck) { return WS.T24[wk(WS.T24, fck)]; };
WS.consts = function (fck, fy, inc) {
  inc = inc || 1;
  var c = WS.scbc(fck) * inc, t = WS.sst(fy) * inc, m = WS.m(fck), k = m * c / (m * c + t), j = 1 - k / 3;
  return { scbc: c, sst: t, m: m, k: k, j: j, R: 0.5 * c * k * j };
};
/* flexure: M kNm on b×d (mm), compression steel at dp; returns Ast, Asc, Mbal */
WS.flex = function (M, b, d, fck, fy, inc, dp) {
  var C = WS.consts(fck, fy, inc), Mb = C.R * b * d * d / 1e6;
  dp = dp || 50;
  if (M <= Mb) return { Ast: M * 1e6 / (C.sst * C.j * d), Asc: 0, Mbal: Mb, C: C, dbl: false };
  var Ast1 = Mb * 1e6 / (C.sst * C.j * d), M2 = M - Mb, kd = C.k * d, sc1 = C.scbc * (kd - dp) / kd;
  var fsc = Math.min(1.5 * C.m * sc1, WS.ssc(fy) * (inc || 1));
  return { Ast: Ast1 + M2 * 1e6 / (C.sst * (d - dp)), Asc: M2 * 1e6 / ((fsc - sc1) * (d - dp)), Mbal: Mb, C: C, dbl: true, fsc: fsc, sc1: sc1 };
};
/* uncracked transformed section stresses for column, B-4.2 */
WS.colRatio = function (b, Dd, As, P, Mx, My, fck, fy, arr, Cr, inc) {
  var m = WS.m(fck), n = 1.5 * m, lay = RCC.colLayers(Dd, 50, As, arr), lay2 = RCC.colLayers(b, 50, As, arr);
  var Ae = b * Dd + (n - 1) * As;
  var Ix = b * Math.pow(Dd, 3) / 12, Iy = Dd * Math.pow(b, 3) / 12;
  lay.forEach(function (L) { Ix += (n - 1) * L.As * Math.pow(L.y - Dd / 2, 2); });
  lay2.forEach(function (L) { Iy += (n - 1) * L.As * Math.pow(L.y - b / 2, 2); });
  var scc = P * 1e3 / Ae, scb = Mx * 1e6 / (Ix / (Dd / 2)) + My * 1e6 / (Iy / (b / 2));
  var pcc = WS.scc(fck) * Cr * inc, pcb = WS.scbc(fck) * Cr * inc;
  return { r: scc / pcc + scb / pcb, scc: scc, scb: scb, pcc: pcc, pcb: pcb, Ae: Ae, Ix: Ix, Iy: Iy, n: n, ten: scb - scc };
};

/* ---------------- design modules (working loads) ---------------- */
WS.note = function (r) { r.note("Working stress method (IS 456 Annex B): loads are working (unfactored) loads; permissible stresses σcbc, σst from Tables 21, 22; modular ratio m = 280/(3σcbc)."); };
WS.beam = function (p) {
  var r = new Rep("RCC Beam Design — Working Stress Method", "IS 456:2000 Annex B");
  WS.note(r);
  var b = p.b, Dd = p.D, fck = p.fck, fy = p.fy, L = p.L, d = Dd - p.cover - p.stir - p.dia / 2, dc = p.cover + p.stir + p.dia / 2, M, V;
  r.h("1. Design forces (working loads)");
  if (p.mode === "load") {
    var c = { ss: [8, 0.5], cont: [10, 0.6], cant: [2, 1.0] }[p.support];
    M = p.wu * L * L / c[0]; V = p.wu * L * c[1];
    r.row("Working UDL w", U.f(p.wu), "kN/m");
    r.eq("M = w L²/" + c[0] + " = " + U.f(M) + " kNm ; V = " + c[1] + " w L = " + U.f(V) + " kN", p.support === "cont" ? "Table 12 (approx.)" : "statics");
  } else { M = p.Mu; V = p.Vu; r.row("M (given, working)", U.f(M), "kNm"); r.row("V (given, working)", U.f(V), "kN"); }
  r.row("Effective depth d", U.f(d, 0), "mm");
  var C = WS.consts(fck, fy, 1);
  r.h("2. Permissible stresses & design constants");
  r.eq("σcbc = " + C.scbc + " N/mm² (M" + fck + ") ; σst = " + C.sst + " N/mm² (Fe" + fy + ")", "Table 21, Table 22");
  r.eq("m = 280/(3σcbc) = " + U.f(C.m, 2) + " ; k = mσcbc/(mσcbc + σst) = " + U.f(C.k, 4) + " ; j = 1 − k/3 = " + U.f(C.j, 4) + " ; R = ½σcbc·k·j = " + U.f(C.R, 4) + " N/mm²", "B-1.3, B-3");
  r.h("3. Flexure");
  var F = WS.flex(M, b, d, fck, fy, 1, p.dsc || dc);
  r.eq("Mbal = R b d² = " + U.f(C.R, 4) + " × " + b + " × " + U.f(d, 0) + "² /10⁶ = " + U.f(F.Mbal) + " kNm", "B-3");
  if (!F.dbl) r.eq("M ≤ Mbal → under-reinforced: Ast = M/(σst·j·d) = " + U.f(M) + "×10⁶/(" + C.sst + "×" + U.f(C.j, 4) + "×" + U.f(d, 0) + ") = " + U.f(F.Ast, 0) + " mm²", "B-3");
  else {
    r.note("M > Mbal : doubly reinforced section.");
    r.eq("σcbc′ at compression steel = σcbc(kd − d′)/kd = " + U.f(F.sc1, 2) + " ; σsc = min(1.5m·σcbc′, σsc,perm) = " + U.f(F.fsc, 1) + " N/mm²", "B-2.2");
    r.eq("Asc = (M − Mbal)/((σsc − σcbc′)(d − d′)) = " + U.f(F.Asc, 0) + " mm² ; Ast = Mbal/(σst j d) + (M − Mbal)/(σst(d − d′)) = " + U.f(F.Ast, 0) + " mm²", "B-3");
  }
  var Amin = 0.85 * b * d / fy, Amax = 0.04 * b * Dd, AstD = Math.max(F.Ast, Amin);
  r.row("Minimum Ast = 0.85 b d / fy", U.f(Amin, 0), "mm²", "cl 26.5.1.1(a)");
  var bars = U.pickBars(AstD, p.dias || [12, 16, 20, 25], 2, 8);
  r.row("Provide tension steel", bars.text, "");
  r.check("Ast ≤ 0.04 b D", bars.area <= Amax, U.f(bars.area, 0) + " ≤ " + U.f(Amax, 0) + " mm²", "cl 26.5.1.1(b)");
  var cbars = F.dbl ? U.pickBars(F.Asc, [12, 16, 20, 25], 2, 6) : null;
  r.row(F.dbl ? "Provide compression steel" : "Hanger bars (top)", cbars ? cbars.text : "2 nos 12 mm φ", "");
  r.h("4. Shear");
  var tv = V * 1e3 / (b * d), pt = 100 * bars.area / (b * d), tc = WS.tauc(fck, pt), tcm = WS.taucmax(fck);
  r.eq("τv = V/(b d) = " + U.f(tv, 3) + " N/mm² ; pt = " + U.f(pt, 2) + " %", "B-5.1");
  r.row("τc (Table 23)", U.f(tc, 3), "N/mm²", "Table 23");
  r.check("τv ≤ τc,max", tv <= tcm, U.f(tv, 3) + " ≤ " + tcm, "Table 24");
  var Asv = 2 * D.barArea(p.stir), ssv = WS.ssv(fy), svmax = Math.min(0.75 * d, 300), svmin = 0.87 * fy * Asv / (0.4 * b), sv;
  if (tv <= tc) { sv = Math.min(svmin, svmax); r.eq("τv ≤ τc : minimum shear reinforcement, sv ≤ 0.87fy Asv/(0.4b) = " + U.f(svmin, 0) + " mm", "cl 26.5.1.6"); }
  else { var Vs = (tv - tc) * b * d, sreq = ssv * Asv * d / Vs; sv = Math.min(sreq, svmax, svmin); r.eq("Vs = V − τc b d = " + U.f(Vs / 1e3) + " kN ; sv = σsv Asv d / Vs = " + ssv + "×" + U.f(Asv, 1) + "×" + U.f(d, 0) + "/" + U.f(Vs, 0) + " = " + U.f(sreq, 0) + " mm", "B-5.4"); }
  sv = sv >= 100 ? U.floorTo(sv, 25) : U.floorTo(sv, 5);
  r.row("Provide stirrups", "2-legged " + p.stir + " mm φ @ " + sv + " mm c/c", "", "max " + U.f(svmax, 0) + " mm");
  r.h("5. Deflection");
  var basic = { ss: 20, cont: 26, cant: 7 }[p.support]; if (L > 10 && p.support !== "cant") basic *= 10 / L;
  var fs = C.sst * Math.min(F.Ast, bars.area) / bars.area, kt = RCC.kt(pt, fs), kc = cbars ? RCC.kc(100 * cbars.area / (b * d)) : 1;
  r.eq("fs = σst × Ast,req/Ast,prov = " + U.f(fs, 0) + " N/mm² ; kt = " + U.f(kt, 2) + " ; kc = " + U.f(kc, 2), "Fig 4, 5");
  r.check("L/d ≤ basic × kt × kc", L * 1000 / d <= basic * kt * kc, U.f(L * 1000 / d, 1) + " ≤ " + U.f(basic * kt * kc, 1), "cl 23.2.1");
  r.h("6. Development length");
  var Ld = bars.dia * C.sst / (4 * WS.tbd(fck, fy));
  r.row("Ld = φ σst / (4 τbd)", U.f(Ld, 0) + " mm (" + U.f(Ld / bars.dia, 0) + "φ)", "", "B-2.1.2, cl 26.2.1");
  r.sum("Method", "Working stress (Annex B)");
  r.sum("Section", b + " × " + Dd + " mm, d = " + U.f(d, 0) + " mm");
  r.sum("Bottom steel", bars.text); r.sum("Top steel", cbars ? cbars.text : "2 nos 12 mm φ (hanger)");
  r.sum("Stirrups", "2L-" + p.stir + " mm @ " + sv + " c/c");
  return r;
};
WS.slabSteel = function (r, M, d, fck, fy, Dd, dia) {
  var C = WS.consts(fck, fy, 1), Ast = M * 1e6 / (C.sst * C.j * d), Amin = (fy >= 415 ? 0.0012 : 0.0015) * 1000 * Dd;
  return { Ast: Ast, Amin: Amin, sp: U.spacing(Math.max(Ast, Amin), dia, Math.min(3 * d, 300)), C: C, dreq: Math.sqrt(M * 1e6 / (C.R * 1000)) };
};
WS.slab1 = function (p) {
  var r = new Rep("One-way Slab Design — Working Stress Method", "IS 456:2000 Annex B");
  WS.note(r);
  var Dd = p.D, d = Dd - p.cover - p.dia / 2, L = p.L, fck = p.fck, fy = p.fy;
  r.h("1. Working loads (per metre width)");
  var dl = 25 * Dd / 1000, w = dl + p.LL + p.FF;
  r.eq("DL = " + U.f(dl) + " ; LL = " + p.LL + " ; FF = " + p.FF + " → w = " + U.f(w) + " kN/m² (unfactored)", "IS 875 Pt 1, 2");
  var c = { ss: [8, 0.5], cont: [10, 0.6], cant: [2, 1.0] }[p.support], M = w * L * L / c[0], V = w * L * c[1];
  r.eq("M = w L²/" + c[0] + " = " + U.f(M) + " kNm/m ; V = " + U.f(V) + " kN/m");
  r.h("2. Main steel");
  var S = WS.slabSteel(r, M, d, fck, fy, Dd, p.dia);
  r.eq("σcbc = " + S.C.scbc + ", σst = " + S.C.sst + ", m = " + U.f(S.C.m, 2) + ", k = " + U.f(S.C.k, 3) + ", j = " + U.f(S.C.j, 3) + ", R = " + U.f(S.C.R, 3), "Tables 21, 22 ; B-3");
  r.check("d ≥ √(M/(R b))", d >= S.dreq, U.f(d, 0) + " ≥ " + U.f(S.dreq, 0) + " mm", "B-3");
  r.row("Ast = M/(σst j d)", U.f(S.Ast, 0), "mm²/m", "B-3");
  r.row("Ast minimum", U.f(S.Amin, 0), "mm²/m", "cl 26.5.2.1");
  r.row("Provide main bars", S.sp.text, "", "max spacing min(3d,300) cl 26.3.3(b)");
  var dist = U.spacing(S.Amin, 8, Math.min(5 * d, 450)); r.row("Distribution bars", dist.text, "", "cl 26.3.3(b)(2)");
  r.h("3. Shear");
  var tv = V * 1e3 / (1000 * d), pt = 100 * S.sp.area / (1000 * d), k = U.interp([150, 175, 200, 225, 250, 275, 300], [1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00], Dd), tc = k * WS.tauc(fck, pt);
  r.check("τv ≤ k τc (Table 23)", tv <= tc, U.f(tv, 3) + " ≤ " + U.f(tc, 3) + " N/mm²", "B-5.2.1.1");
  r.h("4. Deflection");
  var basic = { ss: 20, cont: 26, cant: 7 }[p.support], fs = S.C.sst * Math.min(S.Ast, S.sp.area) / S.sp.area, kt = RCC.kt(pt, fs);
  r.check("L/d ≤ basic × kt", L * 1000 / d <= basic * kt, U.f(L * 1000 / d, 1) + " ≤ " + U.f(basic * kt, 1), "cl 23.2.1");
  r.sum("Method", "Working stress (Annex B)"); r.sum("Thickness", Dd + " mm (d = " + U.f(d, 0) + ")"); r.sum("Main steel", S.sp.text); r.sum("Distribution", dist.text);
  return r;
};
WS.slab2 = function (p) {
  var r = new Rep("Two-way Slab Design — Working Stress Method", "IS 456:2000 Annex B, Annex D");
  WS.note(r);
  var lx = Math.min(p.lx, p.ly), ly = Math.max(p.lx, p.ly), ratio = ly / lx, Dd = p.D, dx = Dd - p.cover - p.dia / 2, dy = dx - p.dia, fck = p.fck, fy = p.fy;
  var w = 25 * Dd / 1000 + p.LL + p.FF;
  r.h("1. Working load"); r.eq("w = " + U.f(25 * Dd / 1000) + " + " + p.LL + " + " + p.FF + " = " + U.f(w) + " kN/m² (unfactored)");
  if (ratio > 2) r.note("ly/lx > 2 — design as one-way slab.");
  var cs = D.T26[p.case_ - 1], rr = Math.min(ratio, 2), mom = [];
  if (cs.ss) { mom.push(["Short span, mid-span (+)", Math.pow(rr, 4) / (8 * (1 + Math.pow(rr, 4))), dx], ["Long span, mid-span (+)", rr * rr / (8 * (1 + Math.pow(rr, 4))), dy]); }
  else { if (cs.xn) mom.push(["Short span, support (-)", U.interp(D.T26_r, cs.xn, rr), dx]); mom.push(["Short span, mid-span (+)", U.interp(D.T26_r, cs.xp, rr), dx]); if (cs.yn) mom.push(["Long span, support (-)", cs.yn, dy]); mom.push(["Long span, mid-span (+)", cs.yp, dy]); }
  r.h("2. Moments & steel (" + cs.name + ")");
  var C = WS.consts(fck, fy, 1), Amin = (fy >= 415 ? 0.0012 : 0.0015) * 1000 * Dd, rows = [], Mmax = 0;
  r.eq("σcbc = " + C.scbc + ", σst = " + C.sst + ", j = " + U.f(C.j, 3) + ", R = " + U.f(C.R, 3) + " N/mm² ; Ast = M/(σst j d)", "B-3");
  mom.forEach(function (m) { var M = m[1] * w * lx * lx; Mmax = Math.max(Mmax, M); var A = M * 1e6 / (C.sst * C.j * m[2]); var sp = U.spacing(Math.max(A, Amin), p.dia, Math.min(3 * m[2], 300)); rows.push([m[0], U.f(m[1], 3), U.f(M), U.f(m[2], 0), U.f(A, 0), sp.text]); r.sum(m[0], sp.text); });
  r.table(["Location", "α", "M kNm/m", "d mm", "Ast req mm²/m", "Provide"], rows);
  r.check("d ≥ √(Mmax/(R b))", dx >= Math.sqrt(Mmax * 1e6 / (C.R * 1000)), U.f(dx, 0) + " ≥ " + U.f(Math.sqrt(Mmax * 1e6 / (C.R * 1000)), 0) + " mm", "B-3");
  var V = w * lx / 2, tv = V * 1e3 / (1000 * dx), k = U.interp([150, 175, 200, 225, 250, 275, 300], [1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00], Dd), tc = k * WS.tauc(fck, 0.15);
  r.h("3. Shear"); r.check("τv ≤ k τc (Table 23, pt = 0.15%)", tv <= tc, U.f(tv, 3) + " ≤ " + U.f(tc, 3), "B-5.2.1.1");
  r.sum("Method", "Working stress (Annex B)");
  return r;
};
WS.column = function (p) {
  var r = new Rep("RCC Column Design — Working Stress Method", "IS 456:2000 Annex B-3, B-4");
  WS.note(r);
  var b = p.b, Dd = p.D, fck = p.fck, fy = p.fy, P = p.Pu, Ag = b * Dd;
  r.h("1. Slenderness & reduction coefficient");
  var lx = p.lex * 1000 / Dd, ly = p.ley * 1000 / b, lmin = Math.min(b, Dd), le = Math.max(p.lex, p.ley) * 1000;
  var Cr = (lx > 12 || ly > 12) ? Math.min(1, 1.25 - le / (48 * lmin)) : 1;
  r.eq("lex/D = " + U.f(lx, 2) + " ; ley/b = " + U.f(ly, 2) + (Cr < 1 ? " → long column: Cr = 1.25 − le/(48 bmin) = " + U.f(Cr, 3) : " → short column, Cr = 1"), "B-3.3");
  r.check("Effective length ≤ 60 × least lateral dimension", le <= 60 * lmin, "", "cl 25.3.1");
  r.h("2. Design actions (working loads)");
  var Lun = p.L * 1000, ex = Math.max(Lun / 500 + Dd / 30, 20), ey = Math.max(Lun / 500 + b / 30, 20);
  var Mx = Math.max(p.Mux, P * ex / 1000), My = Math.max(p.Muy, P * ey / 1000);
  r.eq("ex,min = " + U.f(ex, 1) + " mm, ey,min = " + U.f(ey, 1) + " mm → Mx = " + U.f(Mx) + " kNm, My = " + U.f(My) + " kNm", "cl 25.4");
  r.h("3. Stresses — uncracked transformed section (steel at 1.5m)");
  var m = WS.m(fck), found = null, trace = [];
  r.eq("σcc = " + WS.scc(fck) + ", σcbc = " + WS.scbc(fck) + " N/mm² ; m = " + U.f(m, 2) + " ; check σcc,cal/σcc + σcbc,cal/σcbc ≤ 1", "B-4.2, Table 21");
  for (var pc = 0.8; pc <= p.pmax + 1e-9; pc += 0.1) {
    var As = pc / 100 * Ag, q = WS.colRatio(b, Dd, As, P, Mx, My, fck, fy, p.arr, Cr, 1);
    trace.push([U.f(pc, 1), U.f(q.scc, 2), U.f(q.scb, 2), U.f(q.r, 3)]);
    if (q.r <= 1) { found = { pc: pc, As: As, q: q }; break; }
  }
  if (found && found.pc > 0.8 + 1e-9) {   /* refine to 0.01 % by bisection */
    var lo = found.pc - 0.1, hi = found.pc;
    while (hi - lo > 0.01) { var md = (lo + hi) / 2, qm = WS.colRatio(b, Dd, md / 100 * Ag, P, Mx, My, fck, fy, p.arr, Cr, 1); if (qm.r <= 1) { hi = md; found = { pc: md, As: md / 100 * Ag, q: qm }; } else lo = md; }
    trace.push([U.f(found.pc, 2), U.f(found.q.scc, 2), U.f(found.q.scb, 2), U.f(found.q.r, 3)]);
  }
  r.table(["p %", "σcc,cal", "σcbc,cal", "Ratio"], trace.slice(-4));
  if (!found) { r.fail("Section inadequate up to p = " + p.pmax + " % (working stress)."); return r; }
  var Pperm = (WS.scc(fck) * (Ag - found.As) + WS.ssc(fy) * found.As) * Cr / 1000;
  r.eq("Axial capacity (B-3.1): P = (σcc Ac + σsc Asc)·Cr = " + U.f(Pperm, 0) + " kN", "B-3.1");
  r.check("P ≤ permissible axial load", P <= Pperm, U.f(P, 0) + " ≤ " + U.f(Pperm, 0) + " kN", "B-3.1");
  r.check("σcc,cal/σcc + σcbc,cal/σcbc ≤ 1", true, U.f(found.q.r, 3), "B-4.2");
  if (found.q.ten > 0) r.note("Net tension " + U.f(found.q.ten, 2) + " N/mm² at the extreme fibre: if it exceeds the permissible tensile stress, check by cracked-section analysis (B-4.3).");
  var Areq = Math.max(found.As, 0.008 * Ag), nb = Math.max(4, Math.ceil(Areq / D.barArea(p.dia) / 2) * 2);
  if (p.arr === "four" && nb % 4 && nb > 4) nb = Math.ceil(nb / 4) * 4;
  r.row("Provide", nb + " nos " + p.dia + " mm φ (" + U.f(nb * D.barArea(p.dia), 0) + " mm²)", "", "0.8–4 % cl 26.5.3.1");
  var qv = WS.colRatio(b, Dd, nb * D.barArea(p.dia), P, Mx, My, fck, fy, p.arr, Cr, 1);
  r.check("Stress ratio with bars provided ≤ 1", qv.r <= 1, U.f(qv.r, 3), "B-4.2");
  var td = Math.max(6, Math.ceil(p.dia / 4)); td = D.bars.filter(function (x) { return x >= td; })[0];
  var ts = U.floorTo(Math.min(Math.min(b, Dd), 16 * p.dia, 300), 25);
  r.row("Ties", td + " mm φ @ " + ts + " mm c/c", "", "cl 26.5.3.2");
  r.sum("Method", "Working stress (Annex B)"); r.sum("Column", b + " × " + Dd + " mm"); r.sum("Main bars", nb + " nos " + p.dia + " mm φ"); r.sum("Ties", td + " mm @ " + ts + " c/c");
  return r;
};

/* ---------------- analysis-screen member design (working stress) ---------------- */
WS.dBeam = function (e, k, s, pts, p) {
  var b = s.b, Dd = s.D, d = Dd - 50, fck = s.fck, fy = s.fy, dp = 50;
  var Ms = 0, Mh = 0, V = 0, T = 0, cs = "", ch = "", incS = 1, incH = 1, incV = 1;
  pts.forEach(function (q) {
    var i = q.inc || 1;
    if (q.Mz / i > Ms) { Ms = q.Mz / i; cs = q.cb; incS = i; }
    if (-q.Mz / i > Mh) { Mh = -q.Mz / i; ch = q.cb; incH = i; }
    var ve = (Math.abs(q.Vy) + 1.6 * Math.abs(q.T) / (b / 1000)) / i; if (ve > V) { V = ve; incV = i; }
    T = Math.max(T, Math.abs(q.T) / i);
  });
  /* forces divided by the permissible-stress increase factor ≡ stresses ×1.33 for EL/WL combinations */
  var Mt = T * (1 + Dd / b) / 1.7, C = WS.consts(fck, fy, 1), msg = [], ok = true;
  var fb = WS.flex(Ms + Mt, b, d, fck, fy, 1, dp), ft = WS.flex(Mh + Mt, b, d, fck, fy, 1, dp), amin = 0.85 * b * d / fy, amax = 0.04 * b * Dd;
  var Ab = Math.max(fb.Ast, amin, ft.Asc), At = Math.max(ft.Ast, amin, fb.Asc);
  if (fb.dbl || ft.dbl) msg.push("Doubly reinforced: M > Mbal = " + fb.Mbal.toFixed(1) + " kNm");
  if (Ab + At > amax) { ok = false; msg.push("Total steel > 4% bD"); }
  var pt = Math.min(100 * At / (b * d), 3), tv = V * 1000 / (b * d), tc = WS.tauc(fck, pt), tcm = WS.taucmax(fck), sv = null, Asv = 2 * Math.PI * 64 / 4;
  if (tv > tcm) { ok = false; msg.push("τv " + tv.toFixed(2) + " > τc,max " + tcm + " N/mm² (Table 24)"); }
  else {
    var Vs = Math.max(0, (tv - tc) * b * d), svV = Vs > 0 ? WS.ssv(fy) * Asv * d / Vs : Infinity, svm = 0.87 * fy * Asv / (0.4 * b);
    var lim = T > 0.5 ? Math.min(b - 60, (b - 60 + Dd - 70) / 4, 300) : Math.min(0.75 * d, 300);
    sv = Math.max(50, Math.floor(Math.min(svV, svm, lim) / 5) * 5);
  }
  return { k: k, wsm: true, name: s.name, b: b, D: Dd, d: d, fck: fck, fy: fy, C: C, Mul: fb.Mbal, Mt: Mt, Ve: V, Ms: Ms, Mh: Mh, V: V, T: T, Ab: Ab, At: At, sv: sv, tv: tv, tc: tc, tcm: tcm,
    ok: ok, msg: msg, cs: cs, ch: ch, fb: fb, ft: ft, fsc: fb.fsc || ft.fsc || 0,
    barsB: U.pickBars(Ab, [12, 16, 20, 25], 2, Math.max(2, Math.floor((b - 50) / 40) + 1)).text, barsT: U.pickBars(At, [12, 16, 20, 25], 2, Math.max(2, Math.floor((b - 50) / 40) + 1)).text };
};
WS.dCol = function (e, k, s, pts, p) {
  var b = s.b, Dd = s.D, fck = s.fck, fy = s.fy, L = e.L * 1000, Ag = b * Dd, le = (p.kcol || 1.2) * L, lmin = Math.min(b, Dd);
  var Cr = le / Dd > 12 || le / b > 12 ? Math.min(1, 1.25 - le / (48 * lmin)) : 1;
  var exz = Math.max(L / 500 + Dd / 30, 20), exy = Math.max(L / 500 + b / 30, 20), need = null, crit = null;
  var cand = pts.filter(function (q, i) { return i % 9 === 0 || i % 9 === 8; });
  function evalP(pc) {
    var As = pc / 100 * Ag, worst = 0, wq = null;
    cand.forEach(function (q) {
      var P = Math.max(-q.N, 0), i = q.inc || 1, Mz = Math.max(Math.abs(q.Mz), P * exz / 1000), My = p.twoD ? 0 : Math.max(Math.abs(q.My), P * exy / 1000);
      var c = WS.colRatio(b, Dd, As, P, Mz, My, fck, fy, "four", Cr, i);
      if (c.r > worst) { worst = c.r; wq = { cb: q.cb, Pu: P, Mz: Mz, My: My, inc: i, c: c, Mz0: Math.abs(q.Mz), My0: Math.abs(q.My) }; }
    });
    return { pc: pc, As: As, r: worst, q: wq };
  }
  for (var pc = 0.8; pc <= 4.001 && !need; pc += 0.2) { var e0 = evalP(pc); if (e0.r <= 1) need = e0; crit = e0; }
  if (need && need.pc > 0.8 + 1e-9) {   /* coarse 0.2 % scan, then bisection to 0.01 % */
    var lo = need.pc - 0.2, hi = need.pc;
    while (hi - lo > 0.01) { var md = (lo + hi) / 2, em = evalP(md); if (em.r <= 1) { hi = md; need = em; } else lo = md; }
  }
  var Pmax = 0; pts.forEach(function (q) { Pmax = Math.max(Pmax, -q.N); });
  var msg = []; if (!need) msg.push("Fails even at 4% steel (working stress) - enlarge section");
  if (Cr < 1) msg.push("Long column: permissible stresses × Cr = " + Cr.toFixed(3) + " (B-3.3)");
  return { k: k, wsm: true, name: s.name, b: b, D: Dd, L: L, le: le, Cr: Cr, exz: exz / 1000, exy: exy / 1000, fck: fck, fy: fy, Pu: Pmax, need: need, crit: crit, ok: !!need, msg: msg, bars: need ? U.pickBars(need.As, [12, 16, 20, 25, 32], 4, 24).text : "-" };
};
WS.dSteel = function (e, k, s, pts, p) {
  var r = s.row, fy = s.fy, L = e.L * 1000, A = s.A * 1e6, worst = 0, wq = null, msg = [];
  if (s.shape === "L") {
    var lr = L / (r.rvv * 10), chi = ST.chi(ST.lamND(lr, fy), D.alpha.c), fac = 0.6 * chi * fy, fat = 0.6 * fy;
    pts.forEach(function (q) { var i = q.inc || 1, u = (q.N < 0 ? -q.N * 1e3 / A / fac : q.N * 1e3 / A / fat) / i; if (u > worst) { worst = u; wq = q; } });
    if (lr > 180) msg.push("KL/r = " + lr.toFixed(0) + " > 180 (Table 3) - tension-only bracing");
    return { k: k, wsm: true, name: s.name, ratio: worst, ok: worst <= 1, msg: msg, cb: wq && wq.cb, Pd: fac * A / 1e3, Td: fat * A / 1e3, Mdz: 0, Mdy: 0, q: wq, L: L, KLr: lr, fac: fac, fat: fat,
      txt: "fac = 0.6χfy = " + fac.toFixed(1) + " N/mm², fat = 0.6fy = " + fat.toFixed(0) + " N/mm²" };
  }
  var lz = L / (r.rx * 10), ly = L / (r.ry * 10), chi = Math.min(ST.chi(ST.lamND(lz, fy), D.alpha.a), ST.chi(ST.lamND(ly, fy), D.alpha.b));
  var fac = 0.6 * chi * fy, fat = 0.6 * fy;
  var Iy = r.Iy * 1e4, It = s.J * 1e12, hf = r.D - r.tf, Iw = Iy * hf * hf / 4, E = 2e5, G = 76900;
  var Mcr = Math.PI * Math.PI * E * Iy / (L * L) * Math.sqrt(Iw / Iy + G * It * L * L / (Math.PI * Math.PI * E * Iy)) / 1e6;
  var lLT = Math.sqrt(fy * r.Zpx / 1e3 / Mcr), ph = 0.5 * (1 + 0.21 * (lLT - 0.2) + lLT * lLT), chiLT = Math.min(1, 1 / (ph + Math.sqrt(ph * ph - lLT * lLT)));
  var fbcz = 0.66 * fy * chiLT, fbcy = 0.66 * fy, Zez = r.Zex * 1e3, Zey = r.Iy * 1e4 * 2 / r.bf, fv = 0.4 * fy, Av = r.D * r.tw, Vmax = 0;
  pts.forEach(function (q) {
    var i = q.inc || 1; Vmax = Math.max(Vmax, Math.abs(q.Vy) / i);
    var u = ((q.N < 0 ? -q.N * 1e3 / A / fac : q.N * 1e3 / A / fat) + Math.abs(q.Mz) * 1e6 / Zez / fbcz + Math.abs(q.My) * 1e6 / Zey / fbcy) / i;
    if (u > worst) { worst = u; wq = q; }
  });
  var ok = worst <= 1 && Vmax * 1e3 / Av <= fv;
  if (Vmax * 1e3 / Av > fv) msg.push("Shear stress > 0.4fy");
  if (e.type === "column" && Math.max(lz, ly) > 180) { ok = false; msg.push("KL/r > 180"); }
  return { k: k, wsm: true, name: s.name, ratio: worst, ok: ok, msg: msg, cb: wq && wq.cb, q: wq, L: L, KLr: Math.max(lz, ly), fac: fac, fat: fat, fbcz: fbcz, fbcy: fbcy, chi: chiLT, Mcr: Mcr, Vmax: Vmax, Av: Av, fv: fv, Zez: Zez, Zey: Zey,
    Pd: fac * A / 1e3, Td: fat * A / 1e3, Mdz: fbcz * Zez / 1e6, Mdy: fbcy * Zey / 1e6, Vd: fv * Av / 1e3,
    txt: "fac = " + fac.toFixed(1) + ", fat = " + fat.toFixed(0) + ", fbcz = " + fbcz.toFixed(1) + " (χLT " + chiLT.toFixed(2) + "), fbcy = " + fbcy.toFixed(0) + ", fv = " + fv.toFixed(0) + " N/mm²" };
};
WS.dShell = function (sh, k, env, p) {
  var t = sh.t * 1000, dx = t - 30, dy = t - 40, fck = p.fck, fy = p.fy, msg = [], ok = true, C = WS.consts(fck, fy, 1);
  var amin = (sh.kind === "wall" ? 0.0025 : (fy > 250 ? 0.0012 : 0.0015)) * 1000 * t;
  function A(M, d) { M = Math.abs(M); if (M * 1e6 > C.R * 1000 * d * d) ok = false; return Math.max(M * 1e6 / (C.sst * C.j * d), amin); }
  var r = { k: k, wsm: true, kind: sh.kind, t: t, dx: dx, dy: dy, amin: amin, C: C, bx: env.bx, by: env.by, tx: env.tx, ty: env.ty, Abx: A(env.bx, dx), Aby: A(env.by, dy), Atx: A(env.tx, dx), Aty: A(env.ty, dy) };
  if (!ok) msg.push("M > R·b·d² — slab/wall too thin for singly reinforced working-stress design");
  if (sh.kind === "wall") {
    var sc = env.Ncmax / t, tau = env.tau / t;
    r.sc = sc; r.tau = tau; r.Ast = Math.max(env.Ntmax * 1000 / C.sst, amin);
    if (sc > WS.scc(fck)) { ok = false; msg.push("Compression " + sc.toFixed(2) + " > σcc " + WS.scc(fck)); }
    if (tau > WS.taucmax(fck)) { ok = false; msg.push("In-plane shear " + tau.toFixed(2) + " > τc,max (Table 24)"); }
  }
  r.ok = ok; r.msg = msg; return r;
};
/* IS 456 B-2 / IS 875 Pt 5 working-stress combinations; inc = permissible stress increase */
WS.combos = function (cases) {
  var c = [{ name: "DL+LL", f: { DL: 1, LL: 1 }, inc: 1 }];
  MD.lateralSets(cases).forEach(function (L) {
    [1, -1].forEach(function (s) {
      var sg = s > 0 ? "+" : "-", f1 = { DL: 1, LL: 1 }, f2 = { DL: 1 };
      Object.keys(L.f).forEach(function (cn) { f1[cn] = s * L.f[cn]; f2[cn] = s * L.f[cn]; });
      c.push({ name: "DL+LL" + sg + L.name, f: f1, inc: 4 / 3 }, { name: "DL" + sg + L.name, f: f2, inc: 4 / 3 });
    });
  });
  return c;
};
if (typeof module !== "undefined") module.exports = WS;
