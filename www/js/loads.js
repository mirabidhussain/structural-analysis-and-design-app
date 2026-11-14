/* Loads: IS 875 Parts 1-4 roof loads, IS 1893 (Part 1):2016 seismic base shear. */
var LD = {};

LD.roof = function (p) {
  var th = p.slope, tr = th * Math.PI / 180, o = {};
  o.sheet = p.sheet;                                   /* kN/m2 on slope */
  o.purl = p.purl;                                     /* kN/m2 on slope */
  o.self = (p.span / 3 + 5) * 10 / 1000;               /* truss self wt, kN/m2 plan */
  o.DLplan = (o.sheet + o.purl) / Math.cos(tr) + o.self + (p.extra || 0);
  o.LL = th <= 10 ? 0.75 : Math.max(0.4, 0.75 - 0.02 * (th - 10));
  var mu = th <= 30 ? 0.8 : th < 60 ? 0.8 * (60 - th) / 30 : 0;
  o.snow = mu * p.s0; o.mu = mu;
  o.LLs = Math.max(o.LL, o.snow);
  var k2 = U.interp(D.k2h, D.k2[p.terrain], Math.max(10, p.h));
  o.k2 = k2;
  o.Vz = p.vb * p.k1 * k2 * p.k3 * p.k4;
  o.pz = 0.6 * o.Vz * o.Vz / 1000;
  o.pd = Math.max(0.7 * o.pz, p.kd * p.ka * p.kc * o.pz);
  var tb = p.hw <= 0.5 ? D.cpe.low : D.cpe.mid;
  o.cpeW = U.interp(D.cpeAng, tb.EF, th); o.cpeL = U.interp(D.cpeAng, tb.GH, th);
  var cpi = p.cpi;
  /* + = pressure towards roof, - = suction; take worst of internal +/- cpi */
  o.wW_up = (o.cpeW - cpi) * o.pd; o.wW_dn = (o.cpeW + cpi) * o.pd;
  o.wL_up = (o.cpeL - cpi) * o.pd; o.wL_dn = (o.cpeL + cpi) * o.pd;
  return o;
};
LD.roofReport = function (p) {
  var o = LD.roof(p), r = new Rep("Roof Loads", "IS 875 Parts 1-4 (2015)");
  r.h("1. Dead load");
  r.row("Sheeting (on slope)", U.f(o.sheet, 3), "kN/m²", "IS 875 Pt 1");
  r.row("Purlins (on slope)", U.f(o.purl, 3), "kN/m²");
  r.eq("Truss self weight ≈ (L/3 + 5) × 10 N/m² = " + U.f(o.self, 3) + " kN/m² (plan)", "empirical");
  r.row("Total DL on plan", U.f(o.DLplan, 3), "kN/m²");
  r.h("2. Imposed & snow load");
  r.eq("LL = 0.75 - 0.02(θ - 10) ≥ 0.40 = " + U.f(o.LL, 3) + " kN/m² (no access)", "IS 875 Pt 2 Table 2");
  r.eq("Snow S = μ s0 = " + U.f(o.mu, 2) + " × " + p.s0 + " = " + U.f(o.snow, 3) + " kN/m²", "IS 875 Pt 4 cl 4, 5");
  r.row("Design LL (greater of LL, snow)", U.f(o.LLs, 3), "kN/m²", "LL and snow not combined");
  r.h("3. Wind load");
  r.eq("Vz = Vb k1 k2 k3 k4 = " + p.vb + " × " + p.k1 + " × " + U.f(o.k2, 3) + " × " + p.k3 + " × " + p.k4 + " = " + U.f(o.Vz, 2) + " m/s", "IS 875 Pt 3 cl 6.3");
  r.eq("pz = 0.6 Vz² = " + U.f(o.pz, 3) + " kN/m² ; pd = Kd Ka Kc pz (≥ 0.7pz) = " + U.f(o.pd, 3) + " kN/m²", "cl 7.2");
  r.eq("Cpe windward = " + U.f(o.cpeW, 2) + " ; leeward = " + U.f(o.cpeL, 2) + " ; Cpi = ±" + p.cpi, "Table 6, cl 7.3.2");
  r.table(["Slope", "Cpe-Cpi (uplift)", "kN/m²", "Cpe+Cpi", "kN/m²"],
    [["Windward", U.f(o.cpeW - p.cpi, 2), U.f(o.wW_up, 3), U.f(o.cpeW + p.cpi, 2), U.f(o.wW_dn, 3)],
     ["Leeward", U.f(o.cpeL - p.cpi, 2), U.f(o.wL_up, 3), U.f(o.cpeL + p.cpi, 2), U.f(o.wL_dn, 3)]]);
  r.note("Negative = suction (acting away from roof). Load combinations per IS 800 Table 4: 1.5(DL+LL), 1.2(DL+LL+WL), 1.5(DL+WL), 0.9DL+1.5WL.");
  r.sum("DL (plan)", U.f(o.DLplan, 3) + " kN/m²");
  r.sum("LL / snow", U.f(o.LLs, 3) + " kN/m²");
  r.sum("Design wind pd", U.f(o.pd, 3) + " kN/m²");
  r.res = o;
  return r;
};

LD.saG = function (T, soil) {
  var lim = { I: 0.40, II: 0.55, III: 0.67 }[soil], k = { I: 1.0, II: 1.36, III: 1.67 }[soil];
  if (T < 0.1) return 1 + 15 * T;
  if (T <= lim) return 2.5;
  if (T <= 4) return k / T;
  return k / 4;
};
LD.seismic = function (p) {
  var r = new Rep("Seismic Base Shear (Equivalent Static)", "IS 1893 (Part 1):2016");
  var Z = D.zone[p.zone], h = p.h, T;
  if (p.btype === "rcmrf") T = 0.075 * Math.pow(h, 0.75);
  else if (p.btype === "steel") T = 0.085 * Math.pow(h, 0.75);
  else T = 0.09 * h / Math.sqrt(p.d);
  var sa = LD.saG(T, p.soil);
  var Ah = Math.max((Z / 2) * (p.I / p.R) * sa, Z / 2 * 0); /* min handled below */
  r.h("1. Parameters");
  r.row("Zone factor Z (Zone " + p.zone + ")", Z, "", "Table 3");
  r.row("Importance factor I", p.I, "", "Table 8");
  r.row("Response reduction R", p.R, "", "Table 9");
  r.eq("Ta = " + (p.btype === "rcmrf" ? "0.075 h^0.75" : p.btype === "steel" ? "0.085 h^0.75" : "0.09 h/√d") + " = " + U.f(T, 3) + " s", "cl 7.6.2");
  r.eq("Sa/g (soil type " + p.soil + ") = " + U.f(sa, 3), "cl 6.4.2 Fig 2");
  r.eq("Ah = (Z/2)(I/R)(Sa/g) = " + U.f(Ah, 4), "cl 6.4.2");
  var W = p.floors.reduce(function (a, f) { return a + f.w; }, 0), Vb = Ah * W;
  var Vmin = { II: 0.007, III: 0.011, IV: 0.016, V: 0.024 }[p.zone] * W;
  r.row("Seismic weight W", U.f(W, 1), "kN", "cl 7.4");
  r.eq("VB = Ah W = " + U.f(Vb, 2) + " kN (minimum " + U.f(Vmin, 2) + " kN, Table 7)", "cl 7.2.1, 7.2.2");
  Vb = Math.max(Vb, Vmin);
  r.h("2. Vertical distribution Qi = VB Wi hi² / Σ Wj hj²");
  var den = p.floors.reduce(function (a, f) { return a + f.w * f.h * f.h; }, 0), rows = [], cum = 0;
  var Q = p.floors.map(function (f) { return Vb * f.w * f.h * f.h / den; });
  for (var i = p.floors.length - 1; i >= 0; i--) { cum += Q[i]; rows.unshift([p.floors[i].name, U.f(p.floors[i].w, 1), U.f(p.floors[i].h, 2), U.f(Q[i], 2), U.f(cum, 2)]); }
  r.table(["Floor", "Wi kN", "hi m", "Qi kN", "Storey shear kN"], rows);
  r.note("Use dynamic analysis where required by cl 7.7.1 (irregular / tall buildings). Zone V covers Kashmir valley.");
  r.sum("Ah", U.f(Ah, 4));
  r.sum("Base shear VB", U.f(Vb, 2) + " kN");
  return r;
};

if (typeof module !== "undefined") module.exports = LD;
