/* RCC design to IS 456:2000 (limit state method). Units: mm, N, kN, kNm unless stated. */
var RCC = {};

RCC.tauc = function (fck, pt) {
  var k = U.gradeKey(D.T19, fck);
  return U.interp(D.T19_pt, D.T19[k], Math.max(0.15, Math.min(pt, 3)));
};
RCC.taucmax = function (fck) { return D.T20[U.gradeKey(D.T20, fck)]; };
RCC.xumax = function (fy) { return D.xumax[fy] || (fy <= 250 ? 0.53 : fy <= 415 ? 0.48 : 0.46); };
/* design steel stress for strain (IS 456 Fig 22/23), compression positive or tension - sign preserved */
RCC.fs = function (eps, fy) {
  var s = eps < 0 ? -1 : 1, e = Math.abs(eps), fyd = 0.87 * fy;
  if (fy <= 250 || !D.hysd[fy]) return s * Math.min(D.E * e, fyd);
  var t = D.hysd[fy];
  if (e <= t[1][0]) return s * D.E * e;
  if (e >= t[t.length - 1][0]) return s * fyd;
  for (var i = 2; i < t.length; i++) if (e <= t[i][0]) {
    var r = t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (e - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
    return s * r * fyd;
  }
  return s * fyd;
};
/* parabolic-rectangular concrete stress (compression positive), cl 38.1 */
RCC.fc = function (eps, fck) {
  if (eps <= 0) return 0;
  if (eps >= 0.002) return 0.446 * fck;
  var r = eps / 0.002; return 0.446 * fck * (2 * r - r * r);
};
RCC.Ld = function (dia, fy, fck, comp) {
  var tb = D.tbd[U.gradeKey(D.tbd, fck)] * (fy > 250 ? 1.6 : 1.0) * (comp ? 1.25 : 1.0);
  return dia * 0.87 * fy / (4 * tb);
};
/* singly reinforced Ast for Mu (kNm) on b x d */
RCC.astFlex = function (Mu, b, d, fck, fy) {
  var M = Mu * 1e6, k = 4.6 * M / (fck * b * d * d);
  if (k >= 1) return NaN;
  return 0.5 * fck / fy * (1 - Math.sqrt(1 - k)) * b * d;
};
RCC.mulim = function (b, d, fck, fy) {
  var x = RCC.xumax(fy);
  return 0.36 * fck * b * x * d * (d - 0.42 * x * d) / 1e6;
};
/* modification factor for tension steel, IS 456 Fig 4 (fitted expression) */
RCC.kt = function (pt, fs) {
  pt = Math.max(pt, 0.1);
  var k = 1 / (0.225 + 0.00322 * fs - 0.625 * Math.log10(1 / pt));
  return Math.max(0.6, Math.min(2.0, k));
};
RCC.kc = function (pc) { return Math.min(1.5, 1 + pc / (3 + pc)); };

/* ------------------------------------------------------------ BEAM */
RCC.beam = function (p) {
  var r = new Rep("RCC Beam Design", "IS 456:2000");
  var b = p.b, Dd = p.D, fck = p.fck, fy = p.fy, L = p.L;
  var d = Dd - p.cover - p.stir - p.dia / 2;
  var dc = p.cover + p.stir + p.dia / 2;
  var Mu, Vu;
  r.h("1. Design forces");
  if (p.mode === "load") {
    var c = { ss: [8, 0.5], cont: [10, 0.6], cant: [2, 1.0] }[p.support];
    Mu = p.wu * L * L / c[0]; Vu = p.wu * L * c[1];
    r.row("Factored UDL wu", U.f(p.wu), "kN/m");
    r.eq("Mu = wu L²/" + c[0] + " = " + U.f(Mu) + " kNm ;  Vu = " + c[1] + " wu L = " + U.f(Vu) + " kN",
      p.support === "cont" ? "approx. coefficients, cl 22.5 / Table 12" : "statics");
  } else { Mu = p.Mu; Vu = p.Vu; r.row("Mu (given)", U.f(Mu), "kNm"); r.row("Vu (given)", U.f(Vu), "kN"); }
  r.row("Effective depth d = D - cover - stirrup - φ/2", U.f(d, 0), "mm");

  r.h("2. Flexure");
  var xr = RCC.xumax(fy), Mlim = RCC.mulim(b, d, fck, fy);
  r.row("xu,max / d", U.f(xr, 2), "", "cl 38.1");
  r.eq("Mu,lim = 0.36 fck b xu,max (d - 0.42 xu,max) = " + U.f(Mlim) + " kNm", "Annex G-1.1");
  var Ast, Asc = 0, doubly = Mu > Mlim;
  if (!doubly) {
    Ast = RCC.astFlex(Mu, b, d, fck, fy);
    r.eq("Singly reinforced: Ast = 0.5 fck/fy [1 - √(1 - 4.6Mu/(fck b d²))] b d = " + U.f(Ast, 0) + " mm²", "Annex G-1.1(b)");
  } else {
    var xu = xr * d, dd = p.dsc || dc;
    var esc = 0.0035 * (xu - dd) / xu, fsc = Math.abs(RCC.fs(esc, fy));
    var fcc = 0.446 * fck;
    var Mu2 = Mu - Mlim;
    Asc = Mu2 * 1e6 / ((fsc - fcc) * (d - dd));
    var Ast1 = 0.36 * fck * b * xu / (0.87 * fy);
    Ast = Ast1 + Asc * (fsc - fcc) / (0.87 * fy);
    r.note("Mu > Mu,lim : doubly reinforced section.");
    r.eq("εsc = 0.0035 (xu,max - d')/xu,max = " + U.f(esc, 5) + " → fsc = " + U.f(fsc, 1) + " N/mm²", "Fig 23");
    r.eq("Asc = (Mu - Mu,lim)/((fsc - 0.446fck)(d - d')) = " + U.f(Asc, 0) + " mm²", "Annex G-1.2");
    r.eq("Ast = 0.36 fck b xu,max/(0.87fy) + Asc(fsc-0.446fck)/(0.87fy) = " + U.f(Ast, 0) + " mm²");
  }
  var Amin = 0.85 * b * d / fy, Amax = 0.04 * b * Dd;
  r.row("Minimum Ast = 0.85 b d / fy", U.f(Amin, 0), "mm²", "cl 26.5.1.1(a)");
  var AstD = Math.max(Ast, Amin);
  var bars = U.pickBars(AstD, p.dias || [12, 16, 20, 25], 2, 8);
  r.row("Provide tension steel", bars.text, "");
  r.check("Ast ≤ 0.04 b D", bars.area <= Amax, U.f(bars.area, 0) + " ≤ " + U.f(Amax, 0) + " mm²", "cl 26.5.1.1(b)");
  var clear = (b - 2 * p.cover - 2 * p.stir - bars.n * bars.dia) / Math.max(1, bars.n - 1);
  if (clear < Math.max(bars.dia, 25)) r.note("Clear spacing " + U.f(clear, 0) + " mm < " + Math.max(bars.dia, 25) + " mm: place bars in two layers (recheck d).");
  var cbars = null;
  if (doubly) { cbars = U.pickBars(Asc, [12, 16, 20, 25], 2, 6); r.row("Provide compression steel", cbars.text, ""); }
  else r.row("Hanger bars (top)", "2 nos 12 mm φ", "");

  r.h("3. Shear");
  var tv = Vu * 1e3 / (b * d), pt = 100 * bars.area / (b * d);
  var tc = RCC.tauc(fck, pt), tcm = RCC.taucmax(fck);
  r.eq("τv = Vu/(b d) = " + U.f(tv, 3) + " N/mm² ; pt = " + U.f(pt, 2) + " %", "cl 40.1");
  r.row("τc (Table 19)", U.f(tc, 3), "N/mm²", "Table 19");
  r.check("τv ≤ τc,max", tv <= tcm, U.f(tv, 3) + " ≤ " + tcm, "Table 20");
  var Asv = 2 * D.barArea(p.stir), sv;
  var svmax = Math.min(0.75 * d, 300);
  var svmin = 0.87 * fy * Asv / (0.4 * b);
  if (tv <= tc) {
    sv = Math.min(svmin, svmax);
    r.eq("τv < τc : minimum shear reinforcement, sv ≤ 0.87fy Asv/(0.4b) = " + U.f(svmin, 0) + " mm", "cl 26.5.1.6");
  } else {
    var Vus = (tv - tc) * b * d;
    var sreq = 0.87 * fy * Asv * d / Vus;
    sv = Math.min(sreq, svmax, svmin);
    r.eq("Vus = (τv - τc) b d = " + U.f(Vus / 1e3) + " kN ; sv = 0.87 fy Asv d / Vus = " + U.f(sreq, 0) + " mm", "cl 40.4(a)");
  }
  sv = sv >= 100 ? U.floorTo(sv, 25) : U.floorTo(sv, 5);
  r.row("Provide stirrups", "2-legged " + p.stir + " mm φ @ " + sv + " mm c/c", "", "max " + U.f(svmax, 0) + " mm");
  r.check("Stirrup spacing ≥ 75 mm (practical)", sv >= 75, "", "");

  r.h("4. Deflection");
  var basic = { ss: 20, cont: 26, cant: 7 }[p.support];
  if (L > 10 && p.support !== "cant") basic = basic * 10 / L;
  var fs = 0.58 * fy * Math.min(Ast, bars.area) / bars.area;
  var kt = RCC.kt(pt, fs), kc = cbars ? RCC.kc(100 * cbars.area / (b * d)) : 1;
  var allow = basic * kt * kc, act = L * 1000 / d;
  r.eq("fs = 0.58 fy Ast,req/Ast,prov = " + U.f(fs, 0) + " N/mm² ; kt = " + U.f(kt, 2) + " ; kc = " + U.f(kc, 2), "Fig 4, Fig 5");
  r.check("L/d ≤ basic × kt × kc", act <= allow, U.f(act, 1) + " ≤ " + U.f(allow, 1), "cl 23.2.1");

  r.h("5. Development length");
  var Ld = RCC.Ld(bars.dia, fy, fck);
  r.row("Ld = φ × 0.87 fy / (4 τbd)", U.f(Ld, 0) + " mm (" + U.f(Ld / bars.dia, 0) + "φ)", "", "cl 26.2.1");

  r.sum("Section", b + " × " + Dd + " mm, d = " + U.f(d, 0) + " mm");
  r.sum("Bottom steel", bars.text);
  r.sum("Top steel", cbars ? cbars.text : "2 nos 12 mm φ (hanger)");
  r.sum("Stirrups", "2L-" + p.stir + " mm @ " + sv + " c/c");
  r.res = { d: d, Mu: Mu, Vu: Vu, Mulim: Mlim, Ast: AstD, Asc: Asc, bars: bars, sv: sv, doubly: doubly, tv: tv, tc: tc };
  return r;
};

/* ------------------------------------------------------------ ONE-WAY SLAB */
RCC.slab1 = function (p) {
  var r = new Rep("One-way Slab Design", "IS 456:2000");
  var Dd = p.D, d = Dd - p.cover - p.dia / 2, L = p.L, fck = p.fck, fy = p.fy;
  r.h("1. Loads (per metre width)");
  var dl = 25 * Dd / 1000, w = dl + p.LL + p.FF, wu = 1.5 * w;
  r.eq("DL = 25 × " + Dd / 1000 + " = " + U.f(dl) + " ; LL = " + p.LL + " ; FF = " + p.FF + " → w = " + U.f(w) + " kN/m² ; wu = 1.5w = " + U.f(wu) + " kN/m²", "IS 875 Pt 1, 2 ; Table 18");
  var c = { ss: [8, 0.5], cont: [10, 0.6], cant: [2, 1.0] }[p.support];
  var Mu = wu * L * L / c[0], Vu = wu * L * c[1];
  r.eq("Mu = wu L²/" + c[0] + " = " + U.f(Mu) + " kNm/m ; Vu = " + U.f(Vu) + " kN/m");
  r.h("2. Main steel");
  r.row("d = D - cover - φ/2", U.f(d, 0), "mm");
  var Mlim = RCC.mulim(1000, d, fck, fy);
  r.check("Mu ≤ Mu,lim", Mu <= Mlim, U.f(Mu) + " ≤ " + U.f(Mlim) + " kNm", "Annex G-1.1");
  var Ast = RCC.astFlex(Mu, 1000, d, fck, fy);
  var Amin = (fy >= 415 ? 0.0012 : 0.0015) * 1000 * Dd;
  r.row("Ast required", U.f(Ast, 0), "mm²/m", "Annex G-1.1(b)");
  r.row("Ast minimum", U.f(Amin, 0), "mm²/m", "cl 26.5.2.1");
  var main = U.spacing(Math.max(Ast, Amin), p.dia, Math.min(3 * d, 300));
  r.row("Provide main bars", main.text, "", "max spacing min(3d,300) cl 26.3.3(b)");
  var dist = U.spacing(Amin, 8, Math.min(5 * d, 450));
  r.row("Distribution bars", dist.text, "", "cl 26.3.3(b)(2)");
  r.h("3. Shear");
  var tv = Vu * 1e3 / (1000 * d), pt = 100 * main.area / (1000 * d);
  var k = U.interp([150, 175, 200, 225, 250, 275, 300], [1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00], Dd);
  var tc = k * RCC.tauc(fck, pt);
  r.check("τv ≤ k τc", tv <= tc, U.f(tv, 3) + " ≤ " + U.f(k, 2) + " × " + U.f(tc / k, 3) + " = " + U.f(tc, 3) + " N/mm²", "cl 40.2.1.1");
  r.h("4. Deflection");
  var basic = { ss: 20, cont: 26, cant: 7 }[p.support];
  var fs = 0.58 * fy * Math.min(Ast, main.area) / main.area, kt = RCC.kt(pt, fs);
  r.check("L/d ≤ basic × kt", L * 1000 / d <= basic * kt, U.f(L * 1000 / d, 1) + " ≤ " + U.f(basic * kt, 1), "cl 23.2.1");
  r.sum("Thickness", Dd + " mm (d = " + U.f(d, 0) + ")");
  r.sum("Main steel", main.text);
  r.sum("Distribution", dist.text);
  r.res = { Mu: Mu, Ast: Ast, main: main };
  return r;
};

/* ------------------------------------------------------------ TWO-WAY SLAB */
RCC.slab2 = function (p) {
  var r = new Rep("Two-way Slab Design", "IS 456:2000 Annex D");
  var lx = Math.min(p.lx, p.ly), ly = Math.max(p.lx, p.ly), ratio = ly / lx;
  var Dd = p.D, dx = Dd - p.cover - p.dia / 2, dy = dx - p.dia, fck = p.fck, fy = p.fy;
  r.h("1. Loads");
  var dl = 25 * Dd / 1000, w = dl + p.LL + p.FF, wu = 1.5 * w;
  r.eq("w = " + U.f(dl) + " + " + p.LL + " + " + p.FF + " = " + U.f(w) + " kN/m² ; wu = " + U.f(wu) + " kN/m²");
  r.row("ly / lx", U.f(ratio, 2), "", ratio > 2 ? "> 2: design as one-way slab" : "≤ 2: two-way");
  if (ratio > 2) r.note("ly/lx > 2. Table 26 is not applicable - use the one-way slab module.");
  var cs = D.T26[p.case_ - 1], mom = [];
  r.h("2. Moments (" + cs.name + ")");
  var rr = Math.min(ratio, 2);
  if (cs.ss) {
    var ax = Math.pow(rr, 4) / (8 * (1 + Math.pow(rr, 4))), ay = rr * rr / (8 * (1 + Math.pow(rr, 4)));
    mom.push(["Short span, mid-span (+)", ax, dx], ["Long span, mid-span (+)", ay, dy]);
    r.note("Rankine-Grashoff coefficients, slab simply supported, corners not held down (Table 27, cl D-2).");
  } else {
    if (cs.xn) mom.push(["Short span, support (-)", U.interp(D.T26_r, cs.xn, rr), dx]);
    mom.push(["Short span, mid-span (+)", U.interp(D.T26_r, cs.xp, rr), dx]);
    if (cs.yn) mom.push(["Long span, support (-)", cs.yn, dy]);
    mom.push(["Long span, mid-span (+)", cs.yp, dy]);
  }
  var Amin = (fy >= 415 ? 0.0012 : 0.0015) * 1000 * Dd, rows = [], Mmax = 0, sumAst = {}, midReq = 0, midProv = 1;
  mom.forEach(function (m) {
    var Mu = m[1] * wu * lx * lx; Mmax = Math.max(Mmax, Mu);
    var Ast = RCC.astFlex(Mu, 1000, m[2], fck, fy);
    var sp = U.spacing(Math.max(Ast, Amin), p.dia, Math.min(3 * m[2], 300));
    rows.push([m[0], U.f(m[1], 3), U.f(Mu), U.f(m[2], 0), U.f(Ast, 0), sp.text]);
    sumAst[m[0]] = sp;
    if (m[0].indexOf("Short span, mid") === 0) { midReq = Ast; midProv = sp.area; }
  });
  r.table(["Location", "α", "Mu kNm/m", "d mm", "Ast req mm²/m", "Provide"], rows);
  var Mlim = RCC.mulim(1000, dx, fck, fy);
  r.check("Max Mu ≤ Mu,lim", Mmax <= Mlim, U.f(Mmax) + " ≤ " + U.f(Mlim) + " kNm/m", "Annex G");
  r.row("Minimum steel", U.f(Amin, 0), "mm²/m", "cl 26.5.2.1");
  r.note("Torsion steel at discontinuous corners: 3/4 of short-span mid-span steel in each of four layers over lx/5 (cl D-1.8). Edge strips: min steel (cl D-1.7).");
  r.h("3. Shear");
  var Vu = wu * lx / 2, tv = Vu * 1e3 / (1000 * dx);
  var k = U.interp([150, 175, 200, 225, 250, 275, 300], [1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00], Dd);
  var tc = k * RCC.tauc(fck, 0.15);
  r.check("τv ≤ k τc (conservative pt = 0.15%)", tv <= tc, U.f(tv, 3) + " ≤ " + U.f(tc, 3), "cl 40.2.1.1");
  r.h("4. Deflection");
  if (lx <= 3.5 && p.LL <= 3) {
    var cont = !cs.ss && p.case_ !== 9, lim = (cont ? 40 : 35) * (fy >= 415 ? 0.8 : 1);
    r.check("lx / D ≤ " + lim, lx * 1000 / Dd <= lim, U.f(lx * 1000 / Dd, 1) + " ≤ " + lim, "cl 24.1 Note 2");
  } else {
    var fs2 = 0.58 * fy * Math.min(midReq, midProv) / midProv, kt = RCC.kt(100 * midProv / (1000 * dx), fs2), basic = cs.ss ? 20 : 26;
    r.eq("Short-span mid steel: pt = " + U.f(100 * midProv / (1000 * dx), 3) + " %, fs = " + U.f(fs2, 0) + " N/mm\u00b2 \u2192 kt = " + U.f(kt, 2), "Fig 4");
    r.check("lx / d ≤ basic × kt", lx * 1000 / dx <= basic * kt, U.f(lx * 1000 / dx, 1) + " ≤ " + U.f(basic * kt, 1), "cl 23.2.1");
  }
  r.sum("Slab", Dd + " mm, " + cs.name);
  Object.keys(sumAst).forEach(function (k) { r.sum(k, sumAst[k].text); });
  return r;
};

/* ------------------------------------------------------------ COLUMN (strain compatibility) */
/* section capacity: bars as layers [{y (from top), As}], returns {P (kN), M (kNm)} for neutral axis xu (mm) */
RCC.colPM = function (b, Dd, layers, xu, fck, fy) {
  var n = 60, h = Dd / n, P = 0, M = 0, yc = Dd / 2;
  var epsAt;
  if (xu <= Dd) epsAt = function (y) { return 0.0035 * (xu - y) / xu; };
  else epsAt = function (y) { return 0.002 * (xu - y) / (xu - 3 * Dd / 7); };
  for (var i = 0; i < n; i++) {
    var y = (i + 0.5) * h, s = RCC.fc(epsAt(y), fck), F = s * b * h;
    P += F; M += F * (yc - y);
  }
  layers.forEach(function (L) {
    var e = epsAt(L.y), fs = RCC.fs(e, fy), fcon = RCC.fc(e, fck);
    var F = (fs - (e > 0 ? fcon : 0)) * L.As;
    P += F; M += F * (yc - L.y);
  });
  return { P: P / 1e3, M: M / 1e6 };
};
RCC.colLayers = function (Dd, dc, As, arr) {
  if (arr === "two") return [{ y: dc, As: As / 2 }, { y: Dd - dc, As: As / 2 }];
  /* equal on four faces: corners + side bars spread over 3 intermediate layers */
  var L = [{ y: dc, As: As * 0.3 }, { y: Dd - dc, As: As * 0.3 }];
  for (var i = 1; i <= 3; i++) L.push({ y: dc + i * (Dd - 2 * dc) / 4, As: As * 0.4 / 3 });
  return L;
};
/* moment capacity at axial load Pu (kN) */
RCC.colMcap = function (b, Dd, As, Pu, fck, fy, dc, arr) {
  var lay = RCC.colLayers(Dd, dc, As, arr);
  var lo = 0.01 * Dd, hi = 50 * Dd;
  var Pmax = RCC.colPM(b, Dd, lay, hi, fck, fy).P;
  if (Pu > Pmax) return 0;
  for (var k = 0; k < 80; k++) {
    var mid = (lo + hi) / 2, pm = RCC.colPM(b, Dd, lay, mid, fck, fy);
    if (pm.P > Pu) hi = mid; else lo = mid;
  }
  return Math.max(0, RCC.colPM(b, Dd, lay, (lo + hi) / 2, fck, fy).M);
};
RCC.column = function (p) {
  var r = new Rep("RCC Column Design", "IS 456:2000 cl 25, 26.5.3, 39");
  var b = p.b, Dd = p.D, fck = p.fck, fy = p.fy, Pu = p.Pu;
  var dc = p.cover + p.tie + p.dia / 2;
  r.h("1. Slenderness");
  var lx = p.lex * 1000 / Dd, ly = p.ley * 1000 / b;
  r.eq("lex/D = " + U.f(lx, 2) + " ; ley/b = " + U.f(ly, 2), "cl 25.1.2");
  var slx = lx > 12, sly = ly > 12;
  r.row("Column type", (slx || sly) ? "Slender (about " + (slx ? "x" : "") + (sly ? " y" : "") + ")" : "Short", "");
  r.check("Effective length ≤ 60 × least lateral dimension", Math.max(p.lex, p.ley) * 1000 <= 60 * Math.min(b, Dd), "", "cl 25.3.1");
  r.h("2. Design moments");
  var Lun = p.L * 1000;
  var exmin = Math.max(Lun / 500 + Dd / 30, 20), eymin = Math.max(Lun / 500 + b / 30, 20);
  var Mx = Math.max(p.Mux, Pu * exmin / 1000), My = Math.max(p.Muy, Pu * eymin / 1000);
  r.eq("ex,min = L/500 + D/30 = " + U.f(exmin, 1) + " mm → Mx,min = " + U.f(Pu * exmin / 1000) + " kNm ; ey,min = " + U.f(eymin, 1) + " mm → My,min = " + U.f(Pu * eymin / 1000) + " kNm", "cl 25.4");
  if (slx) { var Max = Pu * Dd / 2000 * lx * lx / 1000; Mx += Max; r.eq("Additional moment Max = Pu D/2000 (lex/D)² = " + U.f(Max) + " kNm (k = 1, conservative)", "cl 39.7.1"); }
  if (sly) { var May = Pu * b / 2000 * ly * ly / 1000; My += May; r.eq("Additional moment May = Pu b/2000 (ley/b)² = " + U.f(May) + " kNm (k = 1, conservative)", "cl 39.7.1"); }
  r.row("Design Mux / Muy", U.f(Mx) + " / " + U.f(My), "kNm");
  r.h("3. Longitudinal steel (strain compatibility, Bresler)");
  var Ag = b * Dd, found = null, trace = [];
  for (var pc = 0.8; pc <= p.pmax + 1e-9; pc += 0.1) {
    var As = pc / 100 * Ag;
    var Puz = (0.45 * fck * (Ag - As) + 0.75 * fy * As) / 1000;
    if (Pu > Puz) continue;
    var Mx1 = RCC.colMcap(b, Dd, As, Pu, fck, fy, dc, p.arr);
    var My1 = RCC.colMcap(Dd, b, As, Pu, fck, fy, dc, p.arr);
    var ratio = Pu / Puz, an = ratio <= 0.2 ? 1 : ratio >= 0.8 ? 2 : 1 + (ratio - 0.2) / 0.6;
    var u = Math.pow(Mx / Mx1, an) + Math.pow(My / My1, an);
    trace.push([U.f(pc, 1), U.f(Puz, 0), U.f(Mx1, 1), U.f(My1, 1), U.f(an, 2), U.f(u, 3)]);
    if (u <= 1) { found = { pc: pc, As: As, Puz: Puz, Mx1: Mx1, My1: My1, an: an, u: u }; break; }
  }
  if (trace.length) r.table(["p %", "Puz kN", "Mux1 kNm", "Muy1 kNm", "αn", "Interaction"], trace.slice(-4));
  if (!found) { r.fail("Section inadequate up to p = " + p.pmax + " %. Increase size or grade."); return r; }
  r.eq("Puz = 0.45 fck Ac + 0.75 fy Asc = " + U.f(found.Puz, 0) + " kN ; αn = " + U.f(found.an, 2), "cl 39.6");
  r.check("(Mux/Mux1)^αn + (Muy/Muy1)^αn ≤ 1", true, U.f(found.u, 3), "cl 39.6");
  var Asmin = 0.008 * Ag, Asreq = Math.max(found.As, Asmin);
  var nb = Math.max(4, Math.ceil(Asreq / D.barArea(p.dia) / 2) * 2);
  if (p.arr === "four" && nb % 4 && nb > 4) nb = Math.ceil(nb / 4) * 4;
  var Aprov = nb * D.barArea(p.dia);
  r.row("Required Asc (p = " + U.f(found.pc, 1) + " %)", U.f(Asreq, 0), "mm²", "min 0.8 % cl 26.5.3.1");
  r.row("Provide", nb + " nos " + p.dia + " mm φ (" + U.f(Aprov, 0) + " mm², " + U.f(100 * Aprov / Ag, 2) + " %)", "");
  r.check("Asc ≤ 4 % (practical) / 6 %", 100 * Aprov / Ag <= 6, "", "cl 26.5.3.1");
  r.h("4. Lateral ties");
  var td = Math.max(6, Math.ceil(p.dia / 4)); td = D.bars.filter(function (x) { return x >= td; })[0];
  var ts = Math.min(Math.min(b, Dd), 16 * p.dia, 300);
  ts = U.floorTo(ts, 25);
  r.row("Ties", td + " mm φ @ " + ts + " mm c/c", "", "cl 26.5.3.2(c): ≥ φ/4, 6 mm ; s ≤ least dim, 16φ, 300");
  r.note("Seismic zones III-V: confining links per IS 13920 at column ends (special confining zone).");
  r.sum("Column", b + " × " + Dd + " mm");
  r.sum("Main bars", nb + " nos " + p.dia + " mm φ");
  r.sum("Ties", td + " mm @ " + ts + " c/c");
  r.res = found;
  return r;
};

/* ------------------------------------------------------------ ISOLATED FOOTING */
RCC.footing = function (p) {
  var r = new Rep("Isolated Footing Design", "IS 456:2000 cl 34");
  var P = p.P, q = p.sbc, a = p.cb / 1000, bc = p.cd / 1000, fck = p.fck, fy = p.fy;
  r.h("1. Plan size");
  var Areq = P * (1 + p.sw / 100) / q;
  var Bf, Lf;
  if (p.shape === "sq") { Bf = Lf = U.ceilTo(Math.sqrt(Areq), 0.05); }
  else { var dd = Math.abs(bc - a); Bf = U.ceilTo((-dd + Math.sqrt(dd * dd + 4 * Areq)) / 2, 0.05); Lf = U.ceilTo(Bf + dd, 0.05); }
  if (p.Mx > 0) {
    for (var it = 0; it < 200; it++) {
      var qmx = P * (1 + p.sw / 100) / (Bf * Lf) + 6 * p.Mx / (Bf * Lf * Lf);
      if (qmx <= q) break; Lf += 0.05; if (p.shape === "sq") Bf = Lf;
    }
  }
  r.eq("Area = P(1 + " + p.sw + "%)/SBC = " + U.f(Areq, 3) + " m² → provide " + U.f(Lf, 2) + " × " + U.f(Bf, 2) + " m", "");
  var qa = P / (Bf * Lf), qmax = qa + 6 * p.Mx / (Bf * Lf * Lf), qmin = qa - 6 * p.Mx / (Bf * Lf * Lf);
  r.check("Gross pressure ≤ SBC", P * (1 + p.sw / 100) / (Bf * Lf) + 6 * p.Mx / (Bf * Lf * Lf) <= q * 1.0001, U.f(P * (1 + p.sw / 100) / (Bf * Lf) + 6 * p.Mx / (Bf * Lf * Lf)) + " ≤ " + q + " kN/m²");
  if (p.Mx > 0) r.check("No tension (qmin ≥ 0)", qmin >= 0, U.f(qmin) + " kN/m²");
  var qu = 1.5 * qmax;
  r.row("Factored net upward pressure qu (max)", U.f(qu), "kN/m²", "load factor 1.5");
  r.h("2. Depth from bending, one-way and punching shear");
  var cl = Math.max((Lf - bc) / 2, (Bf - a) / 2);
  var Mx = qu * Bf * Math.pow((Lf - bc) / 2, 2) / 2, My = qu * Lf * Math.pow((Bf - a) / 2, 2) / 2;
  var cover = p.cover, dia = p.dia, dd2;
  var kmu = RCC.mulim(1, 1, fck, fy) * 1e6;   /* Mulim/(b d^2) */
  var dreq = Math.sqrt(Math.max(Mx / Bf, My / Lf) * 1e6 / (kmu * 1000));
  var d = Math.max(U.ceilTo(dreq, 25), 150), ok = false, tc, tv1, tv2, tp, ks, Ast1, Ast2, Dtot;
  for (var k = 0; k < 80 && !ok; k++) {
    Ast1 = Math.max(RCC.astFlex(Mx / Bf, 1000, d, fck, fy), 0.0012 * 1000 * (d + cover + dia));
    Ast2 = Math.max(RCC.astFlex(My / Lf, 1000, d - dia, fck, fy), 0.0012 * 1000 * (d + cover + dia));
    var pt = 100 * Ast1 / (1000 * d);
    tc = RCC.tauc(fck, pt);
    var x1 = (Lf - bc) / 2 - d / 1000, x2 = (Bf - a) / 2 - d / 1000;
    tv1 = x1 > 0 ? qu * Bf * x1 * 1e3 / (Bf * 1000 * d) : 0;
    tv2 = x2 > 0 ? qu * Lf * x2 * 1e3 / (Lf * 1000 * d) : 0;
    var bo = 2 * ((a + d / 1000) + (bc + d / 1000)) * 1000;
    var Vp = qu * (Bf * Lf - (a + d / 1000) * (bc + d / 1000));
    tp = Vp * 1e3 / (bo * d);
    ks = Math.min(1, 0.5 + Math.min(a, bc) / Math.max(a, bc));
    ok = tv1 <= tc && tv2 <= tc && tp <= ks * 0.25 * Math.sqrt(fck);
    if (!ok) d += 25;
  }
  Dtot = d + cover + dia / 2; Dtot = U.ceilTo(Dtot, 25);
  r.eq("Mu (long dir) = qu B (L - D)²/8 = " + U.f(Mx) + " kNm ; Mu (short dir) = " + U.f(My) + " kNm", "cl 34.2.3.1");
  r.row("d from bending (Mu,lim)", U.f(dreq, 0), "mm");
  r.row("Adopted effective depth d", d, "mm");
  r.row("Overall depth D", Dtot, "mm");
  r.check("One-way shear (L dir) τv ≤ τc", tv1 <= tc, U.f(tv1, 3) + " ≤ " + U.f(tc, 3), "cl 34.2.4.1(a)");
  r.check("One-way shear (B dir) τv ≤ τc", tv2 <= tc, U.f(tv2, 3) + " ≤ " + U.f(tc, 3), "cl 34.2.4.1(a)");
  r.check("Punching shear τv ≤ ks 0.25√fck", tp <= ks * 0.25 * Math.sqrt(fck), U.f(tp, 3) + " ≤ " + U.f(ks * 0.25 * Math.sqrt(fck), 3), "cl 31.6.3");
  r.h("3. Reinforcement");
  var s1 = U.spacing(Ast1, dia, 300), s2 = U.spacing(Ast2, dia, 300);
  r.row("Along long dir (bottom layer)", s1.text, "", "Ast " + U.f(Ast1, 0) + " mm²/m");
  if (p.shape !== "sq" && Lf > Bf) {
    var beta = Lf / Bf, band = 2 / (beta + 1);
    r.row("Along short dir", s2.text, "", "central band " + U.f(Bf, 2) + " m gets " + U.f(band * 100, 0) + "% (cl 34.3.1(c))");
  } else r.row("Along short dir", s2.text, "", "Ast " + U.f(Ast2, 0) + " mm²/m");
  var Ld = RCC.Ld(dia, fy, fck), avail = cl * 1000 - cover;
  if (avail >= Ld) r.check("Development length available", true, U.f(avail, 0) + " ≥ Ld " + U.f(Ld, 0) + " mm", "cl 34.2.4.3");
  else {
    var bent2 = avail + 8 * dia + (Dtot - 2 * cover - 2 * dia);
    r.check("Anchorage with 90° bend-up at ends", bent2 >= Ld, U.f(bent2, 0) + " ≥ " + U.f(Ld, 0) + " mm", "cl 26.2.2.1");
  }
  var A2 = Math.min(Bf * Lf, (a + 4 * Dtot / 1000) * (bc + 4 * Dtot / 1000)), A1 = a * bc;
  var fbr = 0.45 * fck * Math.min(2, Math.sqrt(A2 / A1)), fact = 1.5 * P * 1e3 / (A1 * 1e6);
  r.check("Bearing at column base", fact <= fbr, U.f(fact, 2) + " ≤ " + U.f(fbr, 2) + " N/mm²", "cl 34.4");
  r.sum("Footing", U.f(Lf, 2) + " × " + U.f(Bf, 2) + " m, D = " + Dtot + " mm");
  r.sum("Steel (long)", s1.text);
  r.sum("Steel (short)", s2.text);
  r.res = { L: Lf, B: Bf, D: Dtot, d: d };
  return r;
};

/* ------------------------------------------------------------ STRIP (WALL) FOOTING */
RCC.strip = function (p) {
  var r = new Rep("Strip (Wall) Footing Design", "IS 456:2000 cl 34");
  var w = p.w, q = p.sbc, t = p.tw / 1000, fck = p.fck, fy = p.fy;
  r.h("1. Width");
  var Breq = w * (1 + p.sw / 100) / q, B = Math.max(U.ceilTo(Breq, 0.05), p.Bmin || 0);
  r.eq("B = w(1 + " + p.sw + "%)/SBC = " + U.f(Breq, 3) + " m → adopt " + U.f(B, 2) + " m", "");
  var qu = 1.5 * w / B;
  r.row("Factored net upward pressure qu", U.f(qu), "kN/m²");
  var proj = (B - t) / 2;
  var Mu = qu * proj * proj / 2;
  r.eq("Mu at wall face = qu x²/2 = " + U.f(Mu) + " kNm/m (x = " + U.f(proj, 3) + " m)", "cl 34.2.3.2");
  r.h("2. Depth & steel");
  var d = Math.max(150, U.ceilTo(Math.sqrt(Mu * 1e6 / (RCC.mulim(1, 1, fck, fy) * 1e6 * 1000)), 25));
  var Ast, tv, tc;
  for (var i = 0; i < 60; i++) {
    Ast = Math.max(RCC.astFlex(Mu, 1000, d, fck, fy), 0.0012 * 1000 * (d + p.cover + p.dia / 2));
    tc = RCC.tauc(fck, 100 * Ast / (1000 * d));
    var x = proj - d / 1000; tv = x > 0 ? qu * x * 1e3 / (1000 * d) : 0;
    if (tv <= tc) break; d += 25;
  }
  var Dt = U.ceilTo(d + p.cover + p.dia / 2, 25);
  if (p.Dmin && Dt < p.Dmin) { Dt = p.Dmin; d = Dt - p.cover - p.dia / 2; Ast = Math.max(RCC.astFlex(Mu, 1000, d, fck, fy), 0.0012 * 1000 * Dt); }
  r.row("Effective depth d / overall D", d + " / " + Dt, "mm");
  r.check("One-way shear at d from wall face", tv <= tc, U.f(tv, 3) + " ≤ " + U.f(tc, 3) + " N/mm²", "cl 34.2.4.1(a)");
  var main = U.spacing(Ast, p.dia, 300), dist = U.spacing(0.0012 * 1000 * Dt, 8, 300);
  r.row("Transverse (main) bars", main.text, "");
  r.row("Longitudinal (distribution) bars", dist.text, "", "cl 26.5.2.1");
  var Ld = RCC.Ld(p.dia, fy, fck), straight = proj * 1000 - p.cover;
  if (straight >= Ld) r.check("Development length (straight)", true, U.f(straight, 0) + " ≥ " + U.f(Ld, 0) + " mm", "cl 34.2.4.3");
  else {
    var bent = straight + 8 * p.dia + (Dt - 2 * p.cover - 2 * p.dia);
    r.check("Anchorage with 90° bend-up at ends", bent >= Ld, U.f(bent, 0) + " ≥ " + U.f(Ld, 0) + " mm (straight " + U.f(straight, 0) + " + bend 8φ + leg)", "cl 26.2.2.1, 34.2.4.3");
    r.note("Bend main bars up at both ends (90°) to the top of the footing.");
  }
  r.sum("Footing", "B = " + U.f(B, 2) + " m, D = " + Dt + " mm");
  r.sum("Main bars", main.text);
  r.sum("Distribution", dist.text);
  return r;
};

/* ------------------------------------------------------------ STAIRCASE (waist slab) */
RCC.stair = function (p) {
  var r = new Rep("Staircase Design (waist slab)", "IS 456:2000 cl 33");
  var R_ = p.R, T = p.T, t = p.t, L = p.L, fck = p.fck, fy = p.fy;
  var hyp = Math.sqrt(R_ * R_ + T * T);
  r.h("1. Loads per m² of horizontal area");
  var ws = 25 * (t / 1000) * hyp / T, wst = 25 * (R_ / 1000) / 2;
  var w = ws + wst + p.FF + p.LL, wu = 1.5 * w;
  r.eq("Waist = 25 t √(R²+T²)/T = " + U.f(ws) + " ; steps = 25 R/2 = " + U.f(wst) + " ; FF = " + p.FF + " ; LL = " + p.LL + " → wu = " + U.f(wu) + " kN/m²", "IS 875 Pt 2 (LL 3/5 kN/m²)");
  var c = p.support === "cont" ? 10 : 8;
  var Mu = wu * L * L / c, Vu = wu * L / 2;
  r.eq("Mu = wu L²/" + c + " = " + U.f(Mu) + " kNm/m ; Vu = " + U.f(Vu) + " kN/m", "cl 33.2");
  var d = t - p.cover - p.dia / 2;
  r.h("2. Steel");
  r.check("Mu ≤ Mu,lim", Mu <= RCC.mulim(1000, d, fck, fy), U.f(Mu) + " ≤ " + U.f(RCC.mulim(1000, d, fck, fy)) + " kNm/m");
  var Ast = Math.max(RCC.astFlex(Mu, 1000, d, fck, fy), 0.0012 * 1000 * t);
  var main = U.spacing(Ast, p.dia, Math.min(3 * d, 300)), dist = U.spacing(0.0012 * 1000 * t, 8, Math.min(5 * d, 450));
  r.row("Main bars (along flight)", main.text, "");
  r.row("Distribution bars", dist.text, "");
  var tv = Vu * 1e3 / (1000 * d), k = U.interp([150, 300], [1.3, 1.0], t), tc = k * RCC.tauc(fck, 100 * main.area / (1000 * d));
  r.check("Shear τv ≤ kτc", tv <= tc, U.f(tv, 3) + " ≤ " + U.f(tc, 3));
  var basic = c === 10 ? 26 : 20, kt = RCC.kt(100 * main.area / (1000 * d), 0.58 * fy * Ast / main.area);
  r.check("Deflection L/d ≤ basic × kt", L * 1000 / d <= basic * kt, U.f(L * 1000 / d, 1) + " ≤ " + U.f(basic * kt, 1), "cl 23.2.1 / 33.3");
  r.sum("Waist", t + " mm, R/T = " + R_ + "/" + T + " mm");
  r.sum("Main", main.text); r.sum("Distribution", dist.text);
  return r;
};

if (typeof module !== "undefined") module.exports = RCC;
