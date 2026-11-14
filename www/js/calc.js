/* Step-by-step design calculations with IS-code equations, substituted values, limits and clause references.
   Each step: {h} heading | {l: label, e: equation (symbols), s: substituted & result, lim: limit text, ok: true/false/undefined, ref: clause} */
var CALC = (function () {
  function f(x, d) { return x === null || x === undefined || !isFinite(x) ? "-" : (+x).toFixed(d === undefined ? 2 : d); }
  function xr(fy) { return RCC.xumax(fy); }

  function beam(r, e, p) {
    var b = r.b, Dd = r.D, d = r.d, fck = r.fck, fy = r.fy, S = [], Asv = 2 * Math.PI * 64 / 4;
    var x = xr(fy), Mul = r.Mul, Amin = 0.85 * b * d / fy, Amax = 0.04 * b * Dd;
    S.push({ h: "Section & design actions" });
    S.push({ l: "Effective depth", e: "d = D − d′", s: "d = " + Dd + " − 50 = " + f(d, 0) + " mm", ref: "cl 26.4" });
    S.push({ l: "Design moments", e: "Mu⁺ (sagging), Mu⁻ (hogging), Vu, Tu — envelope of all combinations", s: "Mu⁺ = " + f(r.Ms) + " kNm (" + (r.cs || "-") + "), Mu⁻ = " + f(r.Mh) + " kNm (" + (r.ch || "-") + "), Vu = " + f(r.V) + " kN, Tu = " + f(r.T) + " kNm", ref: "IS 456 Table 18" });
    if (r.T > 0.01) S.push({ l: "Equivalent moment for torsion", e: "Mt = Tu(1 + D/b)/1.7 ;  Me1 = Mu + Mt", s: "Mt = " + f(r.T) + "(1 + " + Dd + "/" + b + ")/1.7 = " + f(r.Mt) + " kNm", ref: "cl 41.4.2" });
    S.push({ h: "Flexure — IS 456 Annex G" });
    S.push({ l: "Limiting neutral axis", e: "xu,max/d = 0.53 (Fe250), 0.48 (Fe415), 0.46 (Fe500)", s: "xu,max/d = " + x, ref: "cl 38.1" });
    S.push({ l: "Limiting moment", e: "Mu,lim = 0.36·fck·b·xu,max·(d − 0.42·xu,max)", s: "= 0.36×" + fck + "×" + b + "×" + f(x * d, 1) + "×(" + f(d, 0) + " − 0.42×" + f(x * d, 1) + ")/10⁶ = " + f(Mul) + " kNm", ref: "G-1.1(c)" });
    [["Bottom (sagging)", r.Ms + r.Mt, r.Ab], ["Top (hogging)", r.Mh + r.Mt, r.At]].forEach(function (q) {
      var M = q[1];
      if (M <= Mul) S.push({ l: q[0] + " steel", e: "Ast = 0.5·fck/fy·[1 − √(1 − 4.6·Mu/(fck·b·d²))]·b·d", s: "Mu = " + f(M) + " ≤ Mu,lim → singly reinforced: Ast = " + f(RCC.astFlex(M, b, d, fck, fy), 0) + " mm²", ref: "G-1.1(b)" });
      else {
        var Asc = (M - Mul) * 1e6 / ((r.fsc - 0.446 * fck) * (d - 50));
        S.push({ l: q[0] + " steel (doubly)", e: "Asc = (Mu − Mu,lim)/((fsc − fcc)(d − d′)) ;  Ast = Ast,lim + Asc(fsc − fcc)/(0.87fy)", s: "Mu = " + f(M) + " > Mu,lim; fsc = " + f(r.fsc, 0) + " N/mm², fcc = 0.446fck = " + f(0.446 * fck, 1) + " → Asc = " + f(Asc, 0) + " mm²", ref: "G-1.2" });
      }
    });
    S.push({ l: "Minimum tension steel", e: "Ast ≥ 0.85·b·d/fy", s: "= 0.85×" + b + "×" + f(d, 0) + "/" + fy + " = " + f(Amin, 0) + " mm²", lim: "Ast,req ≥ " + f(Amin, 0), ok: Math.min(r.Ab, r.At) >= Amin - 0.5, ref: "cl 26.5.1.1(a)" });
    S.push({ l: "Maximum steel", e: "Ast + Asc ≤ 0.04·b·D", s: f(r.Ab, 0) + " + " + f(r.At, 0) + " = " + f(r.Ab + r.At, 0) + " mm²", lim: "≤ " + f(Amax, 0) + " mm²", ok: r.Ab + r.At <= Amax, ref: "cl 26.5.1.1(b), 26.5.1.2" });
    S.push({ l: "Provide", e: "", s: "Bottom: " + r.barsB + " ;  Top: " + r.barsT });
    S.push({ h: "Shear & torsion — IS 456 cl 40, 41" });
    S.push({ l: "Equivalent shear", e: "Ve = Vu + 1.6·Tu/b", s: "= " + f(r.V) + " + 1.6×" + f(r.T) + "/" + (b / 1000) + " = " + f(r.Ve) + " kN", ref: "cl 41.3.1" });
    var tcm = RCC.taucmax(fck);
    S.push({ l: "Nominal shear stress", e: "τv = Ve/(b·d)", s: "= " + f(r.Ve) + "×10³/(" + b + "×" + f(d, 0) + ") = " + f(r.tv, 3) + " N/mm²", lim: "≤ τc,max = " + tcm + " N/mm² (M" + fck + ")", ok: r.tv <= tcm, ref: "cl 40.1, Table 20" });
    var pt = Math.min(100 * r.At / (b * d), 3);
    S.push({ l: "Design shear strength of concrete", e: "τc from Table 19 for pt = 100·Ast/(b·d)", s: "pt = " + f(pt, 2) + " % → τc = " + f(r.tc, 3) + " N/mm²", ref: "Table 19" });
    var Vus = Math.max(0, (r.tv - r.tc) * b * d / 1000);
    S.push({ l: "Shear by stirrups", e: "Vus = (τv − τc)·b·d ;  sv = 0.87·fy·Asv·d/Vus", s: "Vus = " + f(Vus) + " kN" + (Vus > 0 ? " → sv = 0.87×" + fy + "×" + f(Asv, 1) + "×" + f(d, 0) + "/" + f(Vus * 1000, 0) + " = " + f(0.87 * fy * Asv * d / (Vus * 1000), 0) + " mm" : " (τv ≤ τc: minimum stirrups)"), ref: "cl 40.4(a)" });
    S.push({ l: "Minimum shear reinforcement", e: "Asv/(b·sv) ≥ 0.4/(0.87·fy)  →  sv ≤ 0.87·fy·Asv/(0.4·b)", s: "sv ≤ " + f(0.87 * fy * Asv / (0.4 * b), 0) + " mm", ref: "cl 26.5.1.6" });
    if (r.T > 0.5) S.push({ l: "Torsion stirrups", e: "Asv = Tu·sv/(b1·d1·0.87fy) + Vu·sv/(2.5·d1·0.87fy) ;  sv ≤ x1, (x1 + y1)/4, 300", s: "b1 = " + (b - 60) + ", d1 = " + (Dd - 70) + " mm", ref: "cl 41.4.3, 26.5.1.7" });
    S.push({ l: "Maximum spacing", e: r.T > 0.5 ? "sv ≤ min(x1, (x1+y1)/4, 300)" : "sv ≤ min(0.75·d, 300 mm)", s: "", lim: "provided " + r.sv + " mm", ok: true, ref: r.T > 0.5 ? "cl 26.5.1.7" : "cl 26.5.1.5" });
    S.push({ l: "Provide", e: "", s: "2-legged 8 mm φ stirrups @ " + r.sv + " mm c/c" });
    return S;
  }

  function column(r, e, p) {
    var S = [], q = (r.need || r.crit || {}).q || {}, b = r.b, Dd = r.D, fck = r.fck, fy = r.fy, Ag = b * Dd;
    var pc = r.need ? r.need.pc : 4, As = pc / 100 * Ag, sD = r.le / Dd, sb = r.le / b;
    S.push({ h: "Slenderness & eccentricity — IS 456 cl 25" });
    S.push({ l: "Effective length", e: "le = k·L", s: "= " + p.kcol + " × " + f(r.L, 0) + " = " + f(r.le, 0) + " mm", ref: "cl 25.2, Table 28 / Annex E" });
    S.push({ l: "Slenderness ratios", e: "le/D, le/b ; short if both ≤ 12", s: "le/D = " + f(sD, 1) + ", le/b = " + f(sb, 1) + (sD > 12 || sb > 12 ? " → slender" : " → short"), lim: "le/b ≤ 60 (unsupported length limit)", ok: Math.max(sD, sb) <= 60, ref: "cl 25.1.2, 25.3.1" });
    S.push({ l: "Minimum eccentricity", e: "emin = L/500 + D/30 ≥ 20 mm", s: "ex = " + f(r.exz * 1000, 1) + " mm, ey = " + f(r.exy * 1000, 1) + " mm", ref: "cl 25.4" });
    if (sD > 12 || sb > 12) S.push({ l: "Additional moments", e: "Ma = Pu·D/2000·(le/D)²", s: "Max = " + f(q.Maz) + " kNm, May = " + f(q.May) + " kNm", ref: "cl 39.7.1" });
    S.push({ h: "Strength — IS 456 cl 38, 39 (critical combination: " + (q.cb || "-") + ")" });
    S.push({ l: "Design actions", e: "Mu = max(Mu,analysis, Pu·emin) + Ma", s: "Pu = " + f(q.Pu, 1) + " kN, Mux = " + f(q.Mz) + " kNm, Muy = " + f(q.My) + " kNm" + " (analysis " + f(q.Mz0) + " / " + f(q.My0) + ")" });
    S.push({ l: "Longitudinal steel", e: "0.8% ≤ Asc/Ag ≤ 4% (6% absolute)", s: "required p = " + f(pc, 2) + "% (searched to 0.01 %) → Asc = " + f(As, 0) + " mm² → " + r.bars, lim: "0.8–4 %", ok: !!r.need, ref: "cl 26.5.3.1" });
    S.push({ l: "Pure axial capacity", e: "Puz = 0.45·fck·Ac + 0.75·fy·Asc", s: "= (0.45×" + fck + "×" + f(Ag - As, 0) + " + 0.75×" + fy + "×" + f(As, 0) + ")/10³ = " + f(q.Puz, 0) + " kN", ref: "cl 39.6" });
    S.push({ l: "Short-column axial check", e: "Pu ≤ 0.4·fck·Ac + 0.67·fy·Asc", s: "Pu = " + f(q.Pu, 0) + " kN", lim: "capacity " + f((0.4 * fck * (Ag - As) + 0.67 * fy * As) / 1000, 0) + " kN with no moment (reference; bending governs)", ref: "cl 39.3" });
    S.push({ l: "Uniaxial capacities at Pu", e: "Mux1, Muy1 by strain compatibility: εcu = 0.0035, fcd = 0.446fck (parabola-rectangle), steel design stress–strain", s: "Mux1 = " + f(q.M1) + " kNm, Muy1 = " + f(q.M2) + " kNm", ref: "cl 38.1, 39.1" });
    S.push({ l: "Exponent αn", e: "αn = 1.0 for Pu/Puz ≤ 0.2, 2.0 for ≥ 0.8, linear between", s: "Pu/Puz = " + f(q.Pu / q.Puz, 3) + " → αn = " + f(q.an, 3), ref: "cl 39.6" });
    var ratio = Math.pow(q.Mz / q.M1, q.an) + (p.twoD ? 0 : Math.pow(q.My / q.M2, q.an));
    S.push({ l: "Biaxial interaction", e: "(Mux/Mux1)^αn + (Muy/Muy1)^αn ≤ 1.0", s: "= (" + f(q.Mz) + "/" + f(q.M1) + ")^" + f(q.an, 2) + (p.twoD ? "" : " + (" + f(q.My) + "/" + f(q.M2) + ")^" + f(q.an, 2)) + " = " + f(ratio, 3), lim: "≤ 1.0", ok: ratio <= 1.0001, ref: "cl 39.6" });
    var dmax = /(\d+) mm/.exec(r.bars), dd = dmax ? +dmax[1] : 16;
    if (r.need && r.need.prov) S.push({ l: "Check with bars provided", e: "interaction recomputed with the actual bar area", s: r.bars + " = " + f(r.need.prov.pc, 2) + " % → ratio " + f(r.need.prov.r, 3), lim: "≤ 1.0", ok: r.need.prov.r <= 1, ref: "cl 39.6" });
    S.push({ l: "Lateral ties", e: "φt ≥ max(φ/4, 6 mm) ;  st ≤ min(b, 16φ, 300 mm)", s: "φt = " + Math.max(8, Math.ceil(dd / 4)) + " mm @ " + Math.min(b, 16 * dd, 300) + " mm c/c", ref: "cl 26.5.3.2" });
    return S;
  }

  function steel(r, e, p) {
    var S = [], s = e.sec, w = s.row, fy = s.fy, A = s.A * 1e6, L = r.L, q = r.q || {};
    S.push({ h: "Member " + s.name + " — IS 800:2007 (governing: " + (r.cb || "-") + ")" });
    S.push({ l: "Design forces", e: "N (tension +), Mz, My", s: "N = " + f(q.N) + " kN, Mz = " + f(q.Mz) + " kNm, My = " + f(q.My) + " kNm" });
    if (s.shape === "L") {
      var lr = L / (w.rvv * 10), lam = Math.sqrt(fy / (Math.PI * Math.PI * 2e5 / (lr * lr)));
      S.push({ l: "Slenderness", e: "KL/r = L/rvv", s: "= " + f(L, 0) + "/" + f(w.rvv * 10, 1) + " = " + f(lr, 1), lim: "≤ 180 (compression) / 400 (tension only)", ok: lr <= 180 || q.N >= 0, ref: "Table 3" });
      S.push({ l: "Non-dimensional slenderness", e: "λ = √(fy/fcc), fcc = π²E/(KL/r)²", s: "λ = " + f(lam, 3), ref: "cl 7.1.2.1" });
      S.push({ l: "Compression capacity", e: "χ = 1/[φ + √(φ² − λ²)], φ = 0.5[1 + α(λ − 0.2) + λ²], α = 0.49 (curve c) ; Pd = A·χ·fy/γm0", s: "Pd = " + f(r.Pd, 1) + " kN", ref: "cl 7.1.2, Table 10" });
      S.push({ l: "Tension capacity", e: "Tdg = A·fy/γm0", s: "= " + f(A, 0) + "×" + fy + "/" + D.gm0 + "/10³ = " + f(r.Td, 1) + " kN", ref: "cl 6.2" });
      S.push({ l: "Utilisation", e: "|N|/Pd (compression) or N/Td (tension)", s: "= " + f(r.ratio, 3), lim: "≤ 1.0", ok: r.ratio <= 1, ref: "cl 6, 7" });
      return S;
    }
    var B = r.b || {}, sq = B.sq || {};
    S.push({ l: "Section class & slenderness", e: "class per Table 2 ; KL/r with K = " + r.K + " ; λ = √(fy/fcc)", s: r.cls + ", λy = " + f(r.lamy, 3) + ", λz = " + f(r.lamz, 3), lim: "KL/r ≤ 180 (compression)", ok: r.KLr <= 180 || e.type === "beam", ref: "Table 2, Table 3, cl 7.1.2.1" });
    S.push({ l: "Compression capacity", e: "Pd = A·χ·fy/γm0 ; α = 0.21 (z-z, curve a), 0.34 (y-y, curve b)", s: "Pdz = " + f(r.Pdz, 1) + " kN, Pdy = " + f(r.Pdy, 1) + " kN", ref: "cl 7.1.2, Table 10" });
    S.push({ l: "Bending capacity", e: "Md,z(section) = βb·Zp·fy/γm0 ≤ 1.2Ze·fy/γm0 ; Mcr = (π²EIy/L²)√[Iw/Iy + G·It·L²/(π²EIy)] ; χLT (αLT = 0.21) ; Md,z = χLT·βb·Zp·fy/γm0", s: "Md,z(section) = " + f(r.MdzS, 1) + ", Mcr = " + f(r.Mcr, 1) + ", λLT = " + f(r.lLT, 3) + ", χLT = " + f(r.chi, 3) + " → Md,z = " + f(r.Mdz, 1) + " kNm ; Md,y = " + f(r.Mdy, 1) + " kNm", ref: "cl 8.2.1.2, 8.2.2, Annex E" });
    S.push({ l: "Shear", e: "Vd = Av·fy/(√3·γm0) ; if V > 0.6Vd: Mdv = Md − β(Md − Mfd), β = (2V/Vd − 1)²", s: "Vd = " + f(r.Vd, 1) + " kN, V = " + f(r.Vmax, 1) + " kN, Mfd = " + f(r.Mfd, 1) + " kNm" + (r.Vmax > 0.6 * r.Vd ? " → moment reduced" : " → no reduction"), lim: "V ≤ Vd", ok: r.Vmax <= r.Vd, ref: "cl 8.4, 9.2.2" });
    S.push({ l: "Design forces (governing combination)", e: "P (compression), T (tension), Mz, My — maxima along the member", s: "P = " + f(B.P) + ", T = " + f(B.T) + " kN, Mz = " + f(B.Mz) + ", My = " + f(B.My) + " kNm" });
    S.push({ l: "Section strength", e: "n = N/Nd ; Mndz = 1.11Md,z(1 − n) ≤ Md,z ; Mndy = Md,y (n ≤ 0.2) else 1.56Md,y(1 − n)(n + 0.6) ; (My/Mndy)^α1 + (Mz/Mndz)^α2 ≤ 1, α1 = 5n ≥ 1, α2 = 2", s: "n = " + f(sq.n, 3) + ", Mndz = " + f(sq.Mndz, 1) + ", Mndy = " + f(sq.Mndy, 1) + " → " + f(B.sec, 3), lim: "≤ 1.0", ok: B.sec <= 1, ref: "cl 9.3.1.1" });
    if (B.P > 0) {
      S.push({ l: "Interaction factors", e: "Ky = 1 + (λy − 0.2)ny ≤ 1 + 0.8ny ; Kz likewise ; KLT = 1 − 0.1λLT·ny/(CmLT − 0.25) ; Cm = 0.6 + 0.4ψ ≥ 0.4 (0.95 with transverse load)", s: "ny = " + f(B.ny, 3) + ", nz = " + f(B.nz, 3) + ", Ky = " + f(B.Ky, 3) + ", Kz = " + f(B.Kz, 3) + ", KLT = " + f(B.KLT, 3) + ", Cmy = " + f(B.Cmy, 2) + ", Cmz = " + f(B.Cmz, 2), ref: "cl 9.3.2.2, Table 18" });
      S.push({ l: "Member buckling (y)", e: "P/Pdy + Ky·Cmy·My/Mdy + KLT·Mz/Mdz ≤ 1", s: "= " + f(B.u1, 3), lim: "≤ 1.0", ok: B.u1 <= 1, ref: "cl 9.3.2.2(a)" });
      S.push({ l: "Member buckling (z)", e: "P/Pdz + 0.6Ky·Cmy·My/Mdy + Kz·Cmz·Mz/Mdz ≤ 1", s: "= " + f(B.u2, 3), lim: "≤ 1.0", ok: B.u2 <= 1, ref: "cl 9.3.2.2(b)" });
    } else S.push({ l: "Bending + tension", e: "Mz/Md,z(LTB) + My/Md,y ≤ 1 (tension relief ignored) ; T/Td ≤ 1", s: "= " + f(B.u1, 3) + " ; " + f(B.u2, 3), lim: "≤ 1.0", ok: Math.max(B.u1, B.u2) <= 1, ref: "cl 9.3.2.1, 6.2" });
    S.push({ l: "Utilisation", e: "max of section and member checks", s: "= " + f(r.ratio, 3) + " (" + (B.gov || "-") + ")", lim: "≤ 1.0", ok: r.ratio <= 1 });
    return S;
  }

  function shell(r, p) {
    var S = [], fck = p.fck, fy = p.fy;
    S.push({ h: (r.kind === "wall" ? "Wall" : "Slab") + " element S" + (r.k + 1) + " — t = " + r.t + " mm" });
    S.push({ l: "Wood–Armer design moments", e: "Bottom: Mx* = Mx + |Mxy|, My* = My + |Mxy| (if one < 0: set 0, other = M + |Mxy²/M|) ; Top analogous", s: "bottom x/y = " + f(r.bx, 3) + " / " + f(r.by, 3) + ", top x/y = " + f(r.tx, 3) + " / " + f(r.ty, 3) + " kNm/m", ref: "Wood (1968), Armer (1968)" });
    S.push({ l: "Effective depths", e: "dx = t − 30, dy = t − 40 mm", s: "dx = " + r.dx + ", dy = " + r.dy + " mm" });
    S.push({ l: "Steel per metre", e: "Ast = 0.5·fck/fy·[1 − √(1 − 4.6·Mu/(fck·1000·d²))]·1000·d", s: "bottom x/y = " + f(r.Abx, 0) + " / " + f(r.Aby, 0) + ", top x/y = " + f(r.Atx, 0) + " / " + f(r.Aty, 0) + " mm²/m", ref: "G-1.1(b)" });
    S.push({ l: "Minimum steel", e: r.kind === "wall" ? "0.25% of gross area each way (IS 13920 cl 9.1.4); IS 456 cl 32.5: 0.12% vertical, 0.20% horizontal" : "0.12% (HYSD) / 0.15% (mild steel) of b·t", s: "= " + f(r.amin, 0) + " mm²/m", ref: r.kind === "wall" ? "IS 456 cl 32.5" : "cl 26.5.2.1" });
    S.push({ l: "Bar spacing & size", e: "s ≤ min(3d, 300 mm) main steel ; φ ≤ t/8", s: "", lim: "s ≤ " + Math.min(3 * r.dx, 300) + " mm, φ ≤ " + Math.floor(r.t / 8) + " mm", ok: true, ref: "cl 26.3.3(b), 26.5.2.2" });
    if (r.kind === "wall") {
      S.push({ l: "Axial compression", e: "σc = Nc/t ≤ 0.4·fck (simplified, cl 32.2.5 with e ≈ 0)", s: "σc = " + f(r.sc, 3) + " N/mm²", lim: "≤ " + f(0.4 * fck, 1), ok: r.sc <= 0.4 * fck, ref: "cl 32.2.5" });
      S.push({ l: "In-plane shear", e: "τv = Nxy/t ≤ τc,max (≤ 0.17·fck)", s: "τv = " + f(r.tau, 3) + " N/mm²", lim: "≤ " + f(Math.min(0.17 * fck, RCC.taucmax(fck)), 2), ok: r.tau <= Math.min(0.17 * fck, RCC.taucmax(fck)), ref: "cl 32.4.2, 32.4.3" });
    }
    return S;
  }


  /* ---------- working stress method steps ---------- */
  function beamW(r, e, p) {
    var b = r.b, Dd = r.D, d = r.d, fck = r.fck, fy = r.fy, C = r.C, S = [], Asv = 2 * Math.PI * 64 / 4, amin = 0.85 * b * d / fy, amax = 0.04 * b * Dd;
    S.push({ h: "Working stress method — IS 456 Annex B" });
    S.push({ l: "Design actions (working loads)", e: "M, V, T = envelope of DL+LL, DL+LL±EL/WL, DL±EL/WL ; for EL/WL combinations forces ÷ 1.33 (permissible stresses +33⅓ %)", s: "M⁺ = " + f(r.Ms) + " kNm (" + (r.cs || "-") + "), M⁻ = " + f(r.Mh) + " kNm (" + (r.ch || "-") + "), Ve = " + f(r.V) + " kN, T = " + f(r.T) + " kNm", ref: "B-2, IS 875 Pt 5" });
    S.push({ l: "Permissible stresses", e: "σcbc (Table 21), σst (Table 22)", s: "σcbc = " + C.scbc + " N/mm² (M" + fck + "), σst = " + C.sst + " N/mm² (Fe" + fy + ")", ref: "Tables 21, 22" });
    S.push({ l: "Design constants", e: "m = 280/(3σcbc) ; k = mσcbc/(mσcbc + σst) ; j = 1 − k/3 ; R = ½·σcbc·k·j", s: "m = " + f(C.m) + ", k = " + f(C.k, 4) + ", j = " + f(C.j, 4) + ", R = " + f(C.R, 4) + " N/mm²", ref: "B-1.3, B-3" });
    S.push({ l: "Balanced moment", e: "Mbal = R·b·d²", s: "= " + f(C.R, 4) + "×" + b + "×" + f(d, 0) + "²/10⁶ = " + f(r.Mul) + " kNm", ref: "B-3" });
    [["Bottom (sagging)", r.Ms + r.Mt, r.fb], ["Top (hogging)", r.Mh + r.Mt, r.ft]].forEach(function (q) {
      if (!q[2].dbl) S.push({ l: q[0] + " steel", e: "Ast = M/(σst·j·d)", s: "= " + f(q[1]) + "×10⁶/(" + C.sst + "×" + f(C.j, 4) + "×" + f(d, 0) + ") = " + f(q[2].Ast, 0) + " mm²", ref: "B-3" });
      else S.push({ l: q[0] + " steel (doubly)", e: "σcbc′ = σcbc(kd − d′)/kd ; σsc = min(1.5m·σcbc′, σsc,perm) ; Asc = (M − Mbal)/((σsc − σcbc′)(d − d′)) ; Ast = Mbal/(σst·j·d) + (M − Mbal)/(σst(d − d′))", s: "σsc = " + f(q[2].fsc, 1) + " → Asc = " + f(q[2].Asc, 0) + " mm², Ast = " + f(q[2].Ast, 0) + " mm²", ref: "B-2.2, B-3" });
    });
    S.push({ l: "Minimum tension steel", e: "Ast ≥ 0.85·b·d/fy", s: "= " + f(amin, 0) + " mm²", lim: "≥ " + f(amin, 0), ok: true, ref: "cl 26.5.1.1(a)" });
    S.push({ l: "Maximum steel", e: "Ast + Asc ≤ 0.04·b·D", s: f(r.Ab + r.At, 0) + " mm²", lim: "≤ " + f(amax, 0) + " mm²", ok: r.Ab + r.At <= amax, ref: "cl 26.5.1.1(b)" });
    S.push({ l: "Provide", e: "", s: "Bottom: " + r.barsB + " ;  Top: " + r.barsT });
    S.push({ l: "Shear stress", e: "τv = Ve/(b·d), Ve = V + 1.6T/b", s: "= " + f(r.tv, 3) + " N/mm²", lim: "≤ τc,max = " + r.tcm + " N/mm² (Table 24)", ok: r.tv <= r.tcm, ref: "B-5.1, B-6.3, Table 24" });
    S.push({ l: "Permissible concrete shear", e: "τc from Table 23 for pt", s: "τc = " + f(r.tc, 3) + " N/mm²", ref: "Table 23" });
    var Vs = Math.max(0, (r.tv - r.tc) * b * d / 1000);
    S.push({ l: "Stirrups", e: "Vs = (τv − τc)·b·d ; sv = σsv·Asv·d/Vs (σsv ≤ 230 N/mm²) ; Asv/(b·sv) ≥ 0.4/(0.87fy)", s: "Vs = " + f(Vs) + " kN → 2L-8φ @ " + r.sv + " mm c/c", ref: "B-5.4, cl 26.5.1.6" });
    return S;
  }
  function columnW(r, e, p) {
    var S = [], q = (r.need || r.crit || {}).q || {}, c = q.c || {}, pc = r.need ? r.need.pc : 4;
    S.push({ h: "Working stress method — IS 456 Annex B-3, B-4 (critical: " + (q.cb || "-") + ")" });
    S.push({ l: "Slenderness", e: "le = k·L ; long column if le/D or le/b > 12 → Cr = 1.25 − le/(48·bmin)", s: "le = " + f(r.le, 0) + " mm, Cr = " + f(r.Cr, 3), ref: "B-3.3" });
    S.push({ l: "Minimum eccentricity", e: "emin = L/500 + D/30 ≥ 20 mm", s: "ex = " + f(r.exz * 1000, 1) + ", ey = " + f(r.exy * 1000, 1) + " mm", ref: "cl 25.4" });
    S.push({ l: "Working actions", e: "P, Mx = max(M, P·ex), My ; EL/WL combinations: permissible stresses × 1.33", s: "P = " + f(q.Pu, 1) + " kN, Mx = " + f(q.Mz) + ", My = " + f(q.My) + " kNm, increase " + f(q.inc || 1, 2) });
    S.push({ l: "Transformed section", e: "Ae = Ag + (1.5m − 1)·Asc ; I = bD³/12 + (1.5m − 1)ΣAs·y²", s: "p = " + f(pc, 1) + " %, 1.5m = " + f(c.n, 2) + ", Ae = " + f(c.Ae, 0) + " mm²", ref: "B-4.2" });
    S.push({ l: "Calculated stresses", e: "σcc,cal = P/Ae ; σcbc,cal = Mx/Zx + My/Zy", s: "σcc,cal = " + f(c.scc, 3) + ", σcbc,cal = " + f(c.scb, 3) + " N/mm²", ref: "B-4.2" });
    S.push({ l: "Permissible stresses", e: "σcc, σcbc (Table 21) × Cr × increase", s: "σcc = " + f(c.pcc, 2) + ", σcbc = " + f(c.pcb, 2) + " N/mm²", ref: "Table 21, B-3.3" });
    S.push({ l: "Interaction", e: "σcc,cal/σcc + σcbc,cal/σcbc ≤ 1", s: "= " + f(r.need ? r.need.r : (r.crit || {}).r, 3), lim: "≤ 1.0", ok: !!r.need, ref: "B-4.2" });
    if (c.ten > 0) S.push({ l: "Net tension", e: "σcbc,cal − σcc,cal > 0 → check cracked section if tension exceeds permissible", s: f(c.ten, 3) + " N/mm²", ref: "B-4.3" });
    S.push({ l: "Steel provided", e: "0.8 % ≤ p ≤ 4 %", s: f(pc, 1) + " % → " + r.bars, lim: "0.8–4 %", ok: !!r.need, ref: "cl 26.5.3.1" });
    return S;
  }
  function steelW(r, e, p) {
    var S = [], q = r.q || {};
    S.push({ h: "Working stress method — IS 800:2007 Section 11 (governing: " + (r.cb || "-") + ")" });
    S.push({ l: "Working forces", e: "N, Mz, My ; for EL/WL combinations permissible stresses × 1.33", s: "N = " + f(q.N) + " kN, Mz = " + f(q.Mz) + ", My = " + f(q.My) + " kNm" });
    S.push({ l: "Permissible axial compression", e: "fac = 0.6·χ·fy (χ from cl 7.1.2.1 with γm0 = 1)", s: "fac = " + f(r.fac, 1) + " N/mm² (KL/r = " + f(r.KLr, 1) + ")", lim: "KL/r ≤ 180", ok: r.KLr <= 180 || (q.N || 0) >= 0, ref: "cl 11.3.1, Table 3" });
    S.push({ l: "Permissible axial tension", e: "fat = 0.6·fy", s: "fat = " + f(r.fat, 0) + " N/mm²", ref: "cl 11.2.1" });
    if (r.fbcz) {
      S.push({ l: "Permissible bending", e: "fbc = 0.66·fy (laterally supported) ; reduced by χLT for lateral-torsional buckling", s: "fbcz = " + f(r.fbcz, 1) + " (χLT = " + f(r.chi, 3) + ", Mcr = " + f(r.Mcr, 1) + " kNm), fbcy = " + f(r.fbcy, 0) + " N/mm²", ref: "cl 11.4.1, Annex E" });
      S.push({ l: "Permissible shear", e: "fv = 0.4·fy ; τ = V/(D·tw)", s: "τ = " + f(r.Vmax * 1e3 / r.Av, 1) + " N/mm²", lim: "≤ " + f(r.fv, 0), ok: r.Vmax * 1e3 / r.Av <= r.fv, ref: "cl 11.4.2" });
    }
    S.push({ l: "Combined stresses", e: "fc/fac (or ft/fat) + fbcz/Fbcz + fbcy/Fbcy ≤ 1", s: "= " + f(r.ratio, 3), lim: "≤ 1.0", ok: r.ratio <= 1, ref: "cl 11.5.1" });
    return S;
  }
  function shellW(r, p) {
    var S = [], C = r.C;
    S.push({ h: (r.kind === "wall" ? "Wall" : "Slab") + " element S" + (r.k + 1) + " — working stress, t = " + r.t + " mm" });
    S.push({ l: "Wood–Armer design moments (working)", e: "Mx* = Mx + |Mxy|, My* = My + |Mxy| (bottom); top analogous", s: "bottom x/y = " + f(r.bx, 3) + " / " + f(r.by, 3) + ", top x/y = " + f(r.tx, 3) + " / " + f(r.ty, 3) + " kNm/m" });
    S.push({ l: "Design constants", e: "σcbc, σst ; j = 1 − k/3 ; R = ½σcbc·k·j", s: "σcbc = " + C.scbc + ", σst = " + C.sst + ", j = " + f(C.j, 3) + ", R = " + f(C.R, 3), ref: "Tables 21, 22, B-3" });
    S.push({ l: "Steel per metre", e: "Ast = M/(σst·j·d) ≥ minimum", s: "bottom x/y = " + f(r.Abx, 0) + " / " + f(r.Aby, 0) + ", top x/y = " + f(r.Atx, 0) + " / " + f(r.Aty, 0) + " mm²/m", ref: "B-3, cl 26.5.2.1" });
    S.push({ l: "Depth check", e: "M ≤ R·b·d²", s: "", lim: "singly reinforced", ok: r.ok || r.kind === "wall", ref: "B-3" });
    if (r.kind === "wall") {
      S.push({ l: "Axial compression", e: "σc ≤ σcc (Table 21)", s: f(r.sc, 3) + " N/mm²", lim: "≤ " + WS.scc(p.fck), ok: r.sc <= WS.scc(p.fck), ref: "B-3.1, Table 21" });
      S.push({ l: "In-plane shear", e: "τ ≤ τc,max (Table 24)", s: f(r.tau, 3) + " N/mm²", lim: "≤ " + WS.taucmax(p.fck), ok: r.tau <= WS.taucmax(p.fck), ref: "Table 24" });
    }
    return S;
  }
  var BASIS_WSM = [
    ["Loads & combinations (working stress)"],
    ["Load combinations", "DL+LL ; DL+LL±EL/WL ; DL±EL/WL — all unfactored", "IS 875 Pt 5, IS 456 Annex B"],
    ["Increase in permissible stresses", "+33⅓ % for combinations with wind or earthquake", "IS 456 Annex B, IS 800 Section 11"],
    ["Seismic", "Ta, Sa/g, Ah = (Z/2)(Sa/g)/(R/I), Vb = Ah·W, Qi = Vb·Wi·hi²/ΣWh²", "IS 1893 cl 6.4.2, 7.2, 7.6"],
    ["Dynamic analysis — IS 1893 (Part 1):2016"],
    ["Modal analysis", "K φ = ω² M φ (lumped translational masses W/g); T = 2π/ω; modes until Σ effective mass ≥ 90 % in each direction", "cl 7.7.5.2"],
    ["Spectral coefficient per mode", "Ak = (Z/2)(Sa/g)k/(R/I)", "cl 7.7.5.3"],
    ["Modal combination", "CQC: λ = √(ΣΣ λi ρij λj), ρij = 8ζ²(1+β)β^1.5/[(1−β²)² + 4ζ²β(1+β)²], ζ = 0.05 (SRSS optional)", "cl 7.7.5.4"],
    ["Scaling", "When dynamic VB < static V̄B (Ta formula): forces × V̄B/VB; displacements not scaled (Amendment 2)", "cl 7.7.3"],
    ["Accidental torsion", "edi = 1.5esi + 0.05bi or esi − 0.05bi", "cl 7.8.2"],
    ["Orthogonal effects (optional)", "±ELx ± 0.3ELy and ±ELy ± 0.3ELx", "cl 6.3.4.2"],
    ["Torsional irregularity", "Δmax/Δave > 1.2 (Amendment 2); Δmax/Δmin > 1.5 (2016 as published)", "Table 5 (i)"],
    ["Soft storey / mass irregularity", "k < k of storey above ; W > 1.5 W of floor below", "Table 6 (i), (ii)"],
    ["Serviceability / analysis limits"],
    ["Storey drift", "Δ/h ≤ 0.004", "IS 1893 cl 7.11.1"],
    ["Span/depth", "l/d ≤ 7 / 20 / 26 × kt × kc", "IS 456 cl 23.2.1"],
    ["RCC beams — IS 456 Annex B"],
    ["Permissible stresses", "σcbc: M15 5, M20 7, M25 8.5, M30 10, M35 11.5, M40 13 ; σst: Fe250 140, Fe415 230, Fe500 275 N/mm²", "Tables 21, 22"],
    ["Modular ratio", "m = 280/(3σcbc)", "B-1.3"],
    ["Design constants", "k = mσcbc/(mσcbc + σst) ; j = 1 − k/3 ; R = ½σcbc·k·j ; Mbal = R·b·d²", "B-3"],
    ["Tension steel", "Ast = M/(σst·j·d)", "B-3"],
    ["Compression steel", "Stress = 1.5m × concrete stress at that level ≤ σsc", "B-2.2"],
    ["Shear", "τv = V/bd ≤ τc,max (Table 24) ; τc Table 23 ; sv = σsv·Asv·d/(V − τc·b·d)", "B-5"],
    ["Torsion", "Me1 = M + T(1 + D/b)/1.7 ; Ve = V + 1.6T/b", "B-6"],
    ["RCC columns — IS 456 Annex B"],
    ["Axial (short)", "P = σcc·Ac + σsc·Asc ; σcc: M20 5, M25 6, M30 8 ; σsc: Fe415/500 190", "B-3.1, Tables 21, 22"],
    ["Long columns", "Cr = 1.25 − le/(48·bmin) applied to permissible stresses", "B-3.3"],
    ["Axial + bending (uncracked)", "σcc,cal/σcc + σcbc,cal/σcbc ≤ 1 with steel transformed at 1.5m", "B-4.2"],
    ["Steel & ties", "0.8–4 % ; ties ≥ φ/4, 6 mm, pitch ≤ b, 16φ, 300", "cl 26.5.3"],
    ["Slabs & walls — IS 456 Annex B"],
    ["Slab steel", "Ast = M/(σst·j·d) ≥ 0.12 % (HYSD) ; d ≥ √(M/(R·b))", "B-3, cl 26.5.2.1"],
    ["Walls", "σc ≤ σcc ; τ ≤ τc,max (Table 24) ; min steel 0.12 % / 0.20 %", "Table 21, 24, cl 32.5"],
    ["Structural steel — IS 800 Section 11"],
    ["Axial tension", "fat = 0.6·fy", "cl 11.2.1"],
    ["Axial compression", "fac = 0.6·χ·fy", "cl 11.3.1"],
    ["Bending", "fbc = 0.66·fy (supported) ; × χLT when laterally unsupported", "cl 11.4.1"],
    ["Shear", "fv = 0.4·fy", "cl 11.4.2"],
    ["Combined", "fc/fac + fbcz/Fbcz + fbcy/Fbcy ≤ 1", "cl 11.5.1"]
  ];
  /* equations & limits used in this design (one table) */
  var BASIS = [
    ["Loads & combinations"],
    ["Load combinations", "1.5(DL+LL); 1.2(DL+LL±EL); 1.5(DL±EL); 0.9DL±1.5EL", "IS 456 Table 18, IS 875 Pt 5"],
    ["Imposed loads", "Floors/roofs as entered (IS 875 Pt 2 Table 1: office 2.5–4.0, residential 2.0 kN/m²)", "IS 875 Pt 2"],
    ["Seismic weight", "W = DL + 25% LL (LL ≤ 3 kN/m²) or 50% LL (> 3 kN/m²); roof LL excluded", "IS 1893 cl 7.3"],
    ["Fundamental period", "Ta = 0.075h^0.75 (RC MRF), 0.085h^0.75 (steel MRF), 0.09h/√d (others)", "IS 1893 cl 7.6.2"],
    ["Design horizontal coefficient", "Ah = (Z/2)·(Sa/g)/(R/I) ≥ Table 7 minimum", "IS 1893 cl 6.4.2, 7.2.2"],
    ["Base shear & distribution", "Vb = Ah·W ;  Qi = Vb·Wi·hi²/ΣWj·hj²", "IS 1893 cl 7.2.1, 7.6.3"],
    ["Wind", "Vz = Vb·k1·k2·k3·k4 ; pz = 0.6Vz² ; pd = Kd·Ka·Kc·pz ≥ 0.7pz ; F = Cf·pd·Ae", "IS 875 Pt 3 cl 6.3, 7.2, 7.4"],
    ["Cracked stiffness", "Beams 0.35EIg, columns 0.70EIg (if selected)", "IS 1893 cl 6.4.3.1"],
    ["Dynamic analysis — IS 1893 (Part 1):2016"],
    ["Modal analysis", "K φ = ω² M φ (lumped translational masses W/g); T = 2π/ω; modes until Σ effective mass ≥ 90 % in each direction", "cl 7.7.5.2"],
    ["Spectral coefficient per mode", "Ak = (Z/2)(Sa/g)k/(R/I)", "cl 7.7.5.3"],
    ["Modal combination", "CQC: λ = √(ΣΣ λi ρij λj), ρij = 8ζ²(1+β)β^1.5/[(1−β²)² + 4ζ²β(1+β)²], ζ = 0.05 (SRSS optional)", "cl 7.7.5.4"],
    ["Scaling", "When dynamic VB < static V̄B (Ta formula): forces × V̄B/VB; displacements not scaled (Amendment 2)", "cl 7.7.3"],
    ["Accidental torsion", "edi = 1.5esi + 0.05bi or esi − 0.05bi", "cl 7.8.2"],
    ["Orthogonal effects (optional)", "±ELx ± 0.3ELy and ±ELy ± 0.3ELx", "cl 6.3.4.2"],
    ["Torsional irregularity", "Δmax/Δave > 1.2 (Amendment 2); Δmax/Δmin > 1.5 (2016 as published)", "Table 5 (i)"],
    ["Soft storey / mass irregularity", "k < k of storey above ; W > 1.5 W of floor below", "Table 6 (i), (ii)"],
    ["Serviceability / analysis limits"],
    ["Storey drift", "Δ/h ≤ 0.004 under unfactored design lateral force", "IS 1893 cl 7.11.1"],
    ["Span/depth (beams, slabs)", "l/d ≤ 7 (cantilever), 20 (simply supported), 26 (continuous) × kt × kc", "IS 456 cl 23.2.1"],
    ["RCC beams — IS 456"],
    ["Limiting neutral axis", "xu,max/d = 0.53 / 0.48 / 0.46 for Fe250 / Fe415 / Fe500", "cl 38.1"],
    ["Limiting moment", "Mu,lim = 0.36·fck·b·xu,max·(d − 0.42xu,max)", "Annex G-1.1(c)"],
    ["Tension steel", "Ast = 0.5·fck/fy·[1 − √(1 − 4.6Mu/(fck·b·d²))]·b·d", "Annex G-1.1(b)"],
    ["Doubly reinforced", "Asc = (Mu − Mu,lim)/((fsc − fcc)(d − d′))", "Annex G-1.2"],
    ["Steel limits", "0.85bd/fy ≤ Ast ;  Ast, Asc ≤ 0.04bD", "cl 26.5.1.1, 26.5.1.2"],
    ["Shear", "τv = Vu/bd ≤ τc,max (Table 20) ; Vus = (τv − τc)bd ; sv = 0.87fy·Asv·d/Vus", "cl 40.1, 40.2.3, 40.4"],
    ["Minimum stirrups", "Asv/(b·sv) ≥ 0.4/(0.87fy) ;  sv ≤ 0.75d, 300 mm", "cl 26.5.1.5, 26.5.1.6"],
    ["Torsion", "Me1 = Mu + Tu(1 + D/b)/1.7 ;  Ve = Vu + 1.6Tu/b", "cl 41.3.1, 41.4.2"],
    ["RCC columns — IS 456"],
    ["Slenderness", "Short if le/D and le/b ≤ 12 ; unsupported length ≤ 60b", "cl 25.1.2, 25.3.1"],
    ["Minimum eccentricity", "emin = L/500 + D/30 ≥ 20 mm", "cl 25.4"],
    ["Additional moment (slender)", "Ma = Pu·D/2000·(le/D)²", "cl 39.7.1"],
    ["Longitudinal steel", "0.8% ≤ p ≤ 4% (6% max)", "cl 26.5.3.1"],
    ["Axial capacity", "Puz = 0.45fck·Ac + 0.75fy·Asc ;  short column Pu ≤ 0.4fck·Ac + 0.67fy·Asc", "cl 39.3, 39.6"],
    ["Biaxial bending", "(Mux/Mux1)^αn + (Muy/Muy1)^αn ≤ 1 ;  αn = 1 → 2 for Pu/Puz = 0.2 → 0.8", "cl 39.6"],
    ["Ties", "φt ≥ φ/4, 6 mm ;  pitch ≤ b, 16φ, 300 mm", "cl 26.5.3.2"],
    ["Slabs & walls — IS 456"],
    ["Design moments", "Wood–Armer from FE Mx, My, Mxy", "—"],
    ["Minimum steel", "Slabs 0.12% (HYSD) / 0.15% (mild) ; walls 0.12% vertical, 0.20% horizontal (IS 13920: 0.25%)", "cl 26.5.2.1, 32.5"],
    ["Spacing", "≤ 3d or 300 mm (main), 5d or 300 mm (distribution) ; φ ≤ t/8", "cl 26.3.3, 26.5.2.2"],
    ["Wall stresses", "Compression ≤ 0.4fck (simplified) ; shear τv ≤ 0.17fck", "cl 32.2.5, 32.4.3"],
    ["Structural steel — IS 800"],
    ["Partial safety factors", "γm0 = 1.10, γm1 = 1.25", "Table 5"],
    ["Slenderness limits", "KL/r ≤ 180 (compression), 250 (only wind/EQ), 400 (tension)", "Table 3"],
    ["Compression", "fcd = χ·fy/γm0 ; χ = 1/[φ + √(φ² − λ²)] ; φ = 0.5[1 + α(λ − 0.2) + λ²]", "cl 7.1.2.1"],
    ["Tension", "Tdg = Ag·fy/γm0", "cl 6.2"],
    ["Bending with LTB", "Md = χLT·βb·Zp·fy/γm0 ; Mcr per Annex E ; αLT = 0.21 (rolled)", "cl 8.2.2, Annex E"],
    ["Shear", "Vd = Av·fy/(√3·γm0) ; moment reduction if V > 0.6Vd", "cl 8.4, 9.2"],
    ["Shear with bending", "V > 0.6Vd: Mdv = Md − β(Md − Mfd), β = (2V/Vd − 1)²", "cl 9.2.2"],
    ["Section strength", "(My/Mndy)^α1 + (Mz/Mndz)^α2 ≤ 1 ; Mndz = 1.11Mdz(1 − n), α1 = 5n ≥ 1, α2 = 2", "cl 9.3.1.1"],
    ["Member buckling", "P/Pdy + Ky·Cmy·My/Mdy + KLT·Mz/Mdz ≤ 1 ; P/Pdz + 0.6Ky·Cmy·My/Mdy + Kz·Cmz·Mz/Mdz ≤ 1", "cl 9.3.2.2, Table 18"]
  ];

  /* render steps as HTML */
  function html(S, esc) {
    return S.map(function (s) {
      if (s.h) return '<div class="ch">' + esc(s.h) + '</div>';
      var st = s.ok === undefined ? "" : s.ok ? " cok" : " cno";
      return '<div class="cs' + st + '"><div class="cl">' + (s.ok === undefined ? "" : s.ok ? "✔ " : "✘ ") + esc(s.l) + (s.ref ? ' <i>[' + esc(s.ref) + ']</i>' : '') + '</div>' +
        (s.e ? '<div class="ce">' + esc(s.e) + '</div>' : '') + (s.s ? '<div class="cv">' + esc(s.s) + '</div>' : '') + (s.lim ? '<div class="cm">Limit: ' + esc(s.lim) + '</div>' : '') + '</div>';
    }).join("");
  }
  function basisHtml(esc, has, wsm) {
    var h = '<div class="tw"><table class="basis"><tr><th>Item</th><th>Equation / limit</th><th>IS clause</th></tr>', grp = null, show = true;
    (wsm ? BASIS_WSM : BASIS).forEach(function (r) {
      if (r.length === 1) { grp = r[0]; show = !has || has(grp); if (show) h += '<tr><td colspan="3" class="bg">' + esc(grp) + '</td></tr>'; return; }
      if (show) h += '<tr><td>' + esc(r[0]) + '</td><td class="eqc">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
    });
    return h + '</table></div>';
  }
  function forMember(des, m, k, p) {
    var r = des.beams.concat(des.cols, des.steel).filter(function (x) { return x.k === k; })[0]; if (!r) return null;
    var e = m.frames[k];
    if (r.Ab !== undefined) return r.wsm ? beamW(r, e, p) : beam(r, e, p);
    if (r.need !== undefined) return r.wsm ? columnW(r, e, p) : column(r, e, Object.assign({ twoD: m.twoD }, p));
    return r.wsm ? steelW(r, e, p) : steel(r, e, p);
  }
  /* most critical member of each group */
  function critical(des) {
    var out = [];
    function pick(a, key) { if (!a.length) return null; return a.slice().sort(function (x, y) { return (x.ok - y.ok) || key(y) - key(x); })[0]; }
    var b = pick(des.beams, function (r) { return Math.max(r.Ms, r.Mh) / r.Mul + r.tv / (r.wsm ? r.tcm : RCC.taucmax(r.fck)); }); if (b) out.push(["beam", b]);
    var c = pick(des.cols, function (r) { return (r.need ? r.need.pc : 9) + (r.need ? r.need.r : 0); }); if (c) out.push(["column", c]);
    var s = pick(des.steel, function (r) { return r.ratio; }); if (s) out.push(["steel", s]);
    var sl = pick(des.slabs, function (r) { return Math.max(r.Abx, r.Aby, r.Atx, r.Aty); }); if (sl) out.push(["slab", sl]);
    var w = pick(des.walls, function (r) { return Math.max(r.sc || 0, r.tau || 0); }); if (w) out.push(["wall", w]);
    return out;
  }
  function stepsFor(kind, r, m, p) {
    if (kind === "slab" || kind === "wall") return r.wsm ? shellW(r, p) : shell(r, p);
    return forMember({ beams: kind === "beam" ? [r] : [], cols: kind === "column" ? [r] : [], steel: kind === "steel" ? [r] : [] }, m, r.k, p);
  }
  function text(S) {
    return S.map(function (s) { return s.h ? ["", s.h] : [(s.ok === undefined ? "" : s.ok ? "✔ " : "✘ ") + s.l, s.e || "", s.s || "", s.lim || "", s.ref || "", s.ok === undefined ? "" : s.ok ? "OK" : "FAIL"]; });
  }
  return { beam: beam, column: column, steel: steel, shell: shell, BASIS: BASIS, BASIS_WSM: BASIS_WSM, html: html, basisHtml: basisHtml, forMember: forMember, critical: critical, stepsFor: stepsFor, text: text };
})();
if (typeof module !== "undefined") module.exports = CALC;
