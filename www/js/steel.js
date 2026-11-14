/* Steel design to IS 800:2007 (limit state). Units: mm, N, kN, kNm. */
var ST = {};
ST.eps = function (fy) { return Math.sqrt(250 / fy); };
ST.chi = function (lam, alpha) {
  var ph = 0.5 * (1 + alpha * (lam - 0.2) + lam * lam);
  return Math.min(1, 1 / (ph + Math.sqrt(Math.max(ph * ph - lam * lam, 0))));
};
ST.lamND = function (KLr, fy) { return Math.sqrt(fy / (Math.PI * Math.PI * D.E / (KLr * KLr))); };
ST.fcd = function (KLr, fy, curve) { return ST.chi(ST.lamND(KLr, fy), D.alpha[curve]) * fy / D.gm0; };
ST.d0 = function (db) { return db <= 14 ? db + 1 : db <= 24 ? db + 2 : db + 3; };
ST.angle = function (name) { return D.ISA.filter(function (a) { return a.name === name; })[0]; };
/* geometric props in mm units; n = 1 single, 2 back-to-back with gap g */
ST.angleProps = function (s, n, g) {
  var A = s.A * 100, r = { A: A * n, rxx: s.rxx * 10, rvv: s.rvv * 10, m: s.m * n };
  if (n === 2) {
    var Ix = s.A * s.rxx * s.rxx, Iy = 2 * (Ix + s.A * Math.pow(s.C + g / 20, 2));
    r.ryy = Math.sqrt(Iy / (2 * s.A)) * 10;
    r.rmin = Math.min(r.rxx, r.ryy);
  } else r.rmin = r.rvv;
  return r;
};

/* ------------------------------------------------------------ TENSION MEMBER (angles) */
ST.tensionCap = function (s, n, p) {
  var t = s.t, a = s.a, fy = p.fy, fu = p.fu, d0 = ST.d0(p.db);
  var Ag = s.A * 100, out = {};
  out.Tdg = n * Ag * fy / D.gm0 / 1e3;
  var Anc = (a - t / 2 - (p.conn === "weld" ? 0 : d0)) * t, Ago = (a - t / 2) * t;
  var w = a, bs = p.conn === "weld" ? w : w + p.g - t;
  var Lc = p.conn === "weld" ? p.Lw : (p.nb - 1) * p.pitch;
  if (p.conn !== "weld" && p.nb < 2) {
    var alpha = 0.6;
    out.Tdn = n * alpha * (Anc + Ago) * fu / D.gm1 / 1e3; out.beta = null; out.alt = true;
  } else {
    var beta = 1.4 - 0.076 * (w / t) * (fy / fu) * (bs / Math.max(Lc, 1));
    beta = Math.max(0.7, Math.min(beta, 0.9 * fu * D.gm0 / (fy * D.gm1)));
    out.beta = beta;
    out.Tdn = n * (0.9 * Anc * fu / D.gm1 + beta * Ago * fy / D.gm0) / 1e3;
  }
  if (p.conn !== "weld") {
    var Avg = ((p.nb - 1) * p.pitch + p.e) * t, Avn = Avg - (p.nb - 0.5) * d0 * t;
    var Atg = (a - p.g) * t, Atn = Atg - 0.5 * d0 * t;
    var T1 = Avg * fy / (Math.sqrt(3) * D.gm0) + 0.9 * Atn * fu / D.gm1;
    var T2 = 0.9 * Avn * fu / (Math.sqrt(3) * D.gm1) + Atg * fy / D.gm0;
    out.Tdb = n * Math.min(T1, T2) / 1e3;
  } else out.Tdb = Infinity;
  out.Td = Math.min(out.Tdg, out.Tdn, out.Tdb);
  return out;
};
ST.tension = function (p) {
  var r = new Rep("Tension Member (angle)", "IS 800:2007 Section 6");
  var list = p.sec === "auto" ? D.ISA : [ST.angle(p.sec)], n = p.n, chosen = null, cap;
  for (var i = 0; i < list.length; i++) {
    var s = list[i], pr = ST.angleProps(s, n, p.gap);
    if (p.conn !== "weld" && p.g + ST.d0(p.db) / 2 > s.a - 10) continue;
    cap = ST.tensionCap(s, n, p);
    if (cap.Td >= p.Tu && p.L * 1000 / pr.rmin <= p.lmax) { chosen = s; break; }
    if (p.sec !== "auto") { chosen = s; break; }
  }
  if (!chosen) { r.fail("No angle in the table carries " + p.Tu + " kN - use larger/double angles."); return r; }
  var s = chosen, pr = ST.angleProps(s, n, p.gap); cap = ST.tensionCap(s, n, p);
  r.h("Section: " + (n === 2 ? "2 - " : "") + s.name + (n === 2 ? " back-to-back (gap " + p.gap + " mm)" : ""));
  r.row("Gross area Ag", U.f(pr.A, 0), "mm²");
  r.row("Hole diameter d0", ST.d0(p.db), "mm", "Table 19");
  r.eq("Tdg = Ag fy/γm0 = " + U.f(cap.Tdg) + " kN", "cl 6.2");
  if (cap.alt) r.eq("Tdn = α An fu/γm1 (α = 0.6, single bolt) = " + U.f(cap.Tdn) + " kN", "cl 6.3.3");
  else r.eq("β = 1.4 - 0.076 (w/t)(fy/fu)(bs/Lc) = " + U.f(cap.beta, 3) + " ; Tdn = 0.9 Anc fu/γm1 + β Ago fy/γm0 = " + U.f(cap.Tdn) + " kN", "cl 6.3.3");
  if (isFinite(cap.Tdb)) r.eq("Block shear Tdb = " + U.f(cap.Tdb) + " kN", "cl 6.4.1");
  r.row("Design strength Td = min", U.f(cap.Td), "kN");
  r.check("Tu ≤ Td", p.Tu <= cap.Td, p.Tu + " ≤ " + U.f(cap.Td) + " kN");
  var lr = p.L * 1000 / pr.rmin;
  r.check("Slenderness L/r ≤ " + p.lmax, lr <= p.lmax, U.f(lr, 0), "Table 3");
  if (p.conn !== "weld") {
    var bc = ST.boltCap({ db: p.db, grade: p.bgrade, t: Math.min(p.tg, n === 2 ? 2 * s.t : s.t), fu: p.fu, e: p.e, pitch: p.pitch, nn: n === 2 ? 2 : 1, ns: 0 });
    var nreq = Math.ceil(p.Tu / bc.Vdb);
    r.check("Bolts: " + p.nb + " provided, " + nreq + " required (" + U.f(bc.Vdb) + " kN each)", p.nb * bc.Vdb >= p.Tu, U.f(p.nb * bc.Vdb) + " ≥ " + p.Tu + " kN (" + (n === 2 ? "double" : "single") + " shear)", "cl 10.3");
  }
  r.sum("Member", (n === 2 ? "2-" : "") + s.name);
  r.sum("Capacity Td", U.f(cap.Td) + " kN");
  r.sum("Weight", U.f(pr.m, 2) + " kg/m");
  r.res = { sec: s, Td: cap.Td };
  return r;
};

/* ------------------------------------------------------------ COMPRESSION MEMBER */
ST.compCap = function (type, s, p) {
  var fy = p.fy, eps = ST.eps(fy), o = {};
  if (type === "sa") {
    var k = D.angleK[p.endc], e = eps * Math.PI * Math.sqrt(D.E / 250);
    var lvv = (p.L * 1000 / (s.rvv * 10)) / e, lph = (2 * s.a) / (2 * s.t) / e;
    var lam = Math.sqrt(k[0] + k[1] * lvv * lvv + k[2] * lph * lph);
    o.lam = lam; o.KLr = p.L * 1000 / (s.rvv * 10); o.A = s.A * 100; o.m = s.m;
    o.fcd = ST.chi(lam, D.alpha.c) * fy / D.gm0; o.txt = "λe = √(k1 + k2λvv² + k3λφ²) = " + U.f(lam, 3) + " (k = " + k.join(", ") + ")"; o.ref = "cl 7.5.1.2";
  } else if (type === "da") {
    var pr = ST.angleProps(s, 2, p.gap);
    o.KLr = p.K * p.L * 1000 / pr.rmin; o.A = pr.A; o.m = pr.m;
    o.fcd = ST.fcd(o.KLr, fy, "c"); o.txt = "r min = " + U.f(pr.rmin, 1) + " mm, KL/r = " + U.f(o.KLr, 1) + ", curve c"; o.ref = "cl 7.1.2, 7.5.2";
  } else {
    var isB = type === "mb";
    var KLz = p.K * p.L * 1000 / (s.rx * 10), KLy = p.K * (p.Ly || p.L) * 1000 / (s.ry * 10);
    var fz = ST.fcd(KLz, fy, isB ? "a" : "c"), fyy = ST.fcd(KLy, fy, isB ? "b" : "c");
    o.fcd = Math.min(fz, fyy); o.KLr = Math.max(KLz, KLy); o.A = s.A * 100; o.m = s.m;
    o.txt = "KL/rz = " + U.f(KLz, 1) + " (curve " + (isB ? "a" : "c") + ", fcd " + U.f(fz, 1) + ") ; KL/ry = " + U.f(KLy, 1) + " (curve " + (isB ? "b" : "c") + ", fcd " + U.f(fyy, 1) + ")"; o.ref = "cl 7.1.2, Table 10";
  }
  o.Pd = o.A * o.fcd / 1e3;
  return o;
};
ST.compression = function (p) {
  var r = new Rep("Compression Member", "IS 800:2007 Section 7");
  var lib = (p.type === "sa" || p.type === "da") ? D.ISA : p.type === "mb" ? D.ISMB : D.ISMC;
  var list = p.sec === "auto" ? lib : lib.filter(function (x) { return x.name === p.sec; });
  var s = null, o;
  for (var i = 0; i < list.length; i++) {
    o = ST.compCap(p.type, list[i], p);
    if (p.sec !== "auto" || (o.Pd >= p.Pu && o.KLr <= p.lmax)) { s = list[i]; break; }
  }
  if (!s) { r.fail("No section in the table is adequate for " + p.Pu + " kN."); return r; }
  r.h("Section: " + (p.type === "da" ? "2-" : "") + s.name + (p.type === "da" ? " back-to-back" : ""));
  r.row("Area", U.f(o.A, 0), "mm²");
  r.eq(o.txt, o.ref);
  r.row("Design compressive stress fcd", U.f(o.fcd, 1), "N/mm²", "cl 7.1.2.1");
  r.row("Design strength Pd = A fcd", U.f(o.Pd), "kN");
  r.check("Pu ≤ Pd", p.Pu <= o.Pd, p.Pu + " ≤ " + U.f(o.Pd) + " kN");
  r.check("Slenderness KL/r ≤ " + p.lmax, o.KLr <= p.lmax, U.f(o.KLr, 0), "Table 3");
  r.sum("Member", (p.type === "da" ? "2-" : "") + s.name);
  r.sum("Pd", U.f(o.Pd) + " kN");
  r.sum("Weight", U.f(o.m, 2) + " kg/m");
  r.res = { sec: s, Pd: o.Pd };
  return r;
};

/* ------------------------------------------------------------ BEAM (ISMB) */
ST.beamCheck = function (s, p) {
  var fy = p.fy, eps = ST.eps(fy), L = p.L * 1000, o = {};
  var bt = (s.bf / 2) / s.tf, dt = (s.D - 2 * s.tf) / s.tw;
  o.cls = (bt <= 9.4 * eps && dt <= 84 * eps) ? "Plastic" : (bt <= 10.5 * eps && dt <= 105 * eps) ? "Compact" : "Semi-compact";
  var bb = o.cls === "Semi-compact" ? s.Zex / s.Zpx : 1;
  var Zp = s.Zpx * 1e3, Ze = s.Zex * 1e3;
  var Mds = Math.min(bb * Zp * fy / D.gm0, (p.support === "cant" ? 1.5 : 1.2) * Ze * fy / D.gm0) / 1e6;
  o.Md = Mds; o.chi = 1;
  if (!p.lat) {
    var LLT = p.Lun * 1000 * (p.destab ? 1.2 : 1.0);
    var Iy = s.Iy * 1e4, hf = s.D - s.tf;
    var It = (2 * s.bf * Math.pow(s.tf, 3) + (s.D - 2 * s.tf) * Math.pow(s.tw, 3)) / 3;
    var Iw = Iy * hf * hf / 4;
    var Mcr = Math.sqrt((Math.PI * Math.PI * D.E * Iy / (LLT * LLT)) * (D.G * It + Math.PI * Math.PI * D.E * Iw / (LLT * LLT)));
    var lLT = Math.sqrt(bb * Zp * fy / Mcr);
    var phi = 0.5 * (1 + 0.21 * (lLT - 0.2) + lLT * lLT);
    var chi = Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lLT * lLT)));
    o.Mcr = Mcr / 1e6; o.lLT = lLT; o.chi = chi;
    o.Md = Math.min(bb * Zp * chi * fy / D.gm0 / 1e6, Mds);
  }
  var w = p.wu, P = p.Pu || 0;
  if (p.support === "cant") { o.Mu = w * p.L * p.L / 2 + P * p.L; o.Vu = w * p.L + P; }
  else { o.Mu = w * p.L * p.L / 8 + P * p.L / 4; o.Vu = w * p.L / 2 + P / 2; }
  o.Mu += (s.m * 9.81 / 1000) * 1.5 * p.L * p.L / (p.support === "cant" ? 2 : 8);
  o.Vd = s.D * s.tw * fy / (Math.sqrt(3) * D.gm0) / 1e3;
  /* IS 800 cl 9.2.2: where V > 0.6Vd the design moment is reduced, Mdv = Md − β(Md − Mfd), β = (2V/Vd − 1)²,
     Mfd = plastic moment of the flanges alone; semi-compact: Mdv = Ze·fy/γm0. Checked at sections along the span where M and V act together. */
  o.Mfd = s.bf * s.tf * (s.D - s.tf) * fy / D.gm0 / 1e6;
  var swt = (s.m * 9.81 / 1000) * 1.5, Lm = p.L, worst = { u: -1 };
  for (var i = 0; i <= 60; i++) {
    var x = Lm * i / 60, Mx, Vx;
    if (p.support === "cant") { var a = Lm - x; Mx = (w + swt) * a * a / 2 + P * a; Vx = (w + swt) * a + P; }
    else { Mx = (w + swt) * x * (Lm - x) / 2 + P * Math.min(x, Lm - x) / 2; Vx = Math.abs((w + swt) * (Lm / 2 - x)) + P / 2; }
    var Mdv = o.Md;
    if (Vx > 0.6 * o.Vd) {
      var beta = Math.pow(2 * Vx / o.Vd - 1, 2);
      Mdv = o.cls === "Semi-compact" ? Math.min(o.Md, Ze * fy / D.gm0 / 1e6) : Math.max(0, o.Md - beta * Math.max(0, o.Md - o.Mfd));
    }
    var u = Mx / Math.max(Mdv, 1e-9);
    if (u > worst.u) worst = { u: u, x: x, M: Mx, V: Vx, Mdv: Mdv, beta: Vx > 0.6 * o.Vd ? Math.pow(2 * Vx / o.Vd - 1, 2) : 0 };
  }
  o.hs = worst; o.highShear = worst.beta > 0;
  var I = s.Ix * 1e4, ws = (w / 1.5), Ps = P / 1.5;
  o.defl = p.support === "cant" ? ws * Math.pow(L, 4) / (8 * D.E * I) + Ps * 1e3 * Math.pow(L, 3) / (3 * D.E * I)
    : 5 * ws * Math.pow(L, 4) / (384 * D.E * I) + Ps * 1e3 * Math.pow(L, 3) / (48 * D.E * I);
  o.dlim = L / (p.support === "cant" ? 150 : p.dl);
  o.ok = o.Mu <= o.Md && o.Vu <= o.Vd && o.defl <= o.dlim && o.hs.u <= 1;
  return o;
};
ST.beam = function (p) {
  var r = new Rep("Steel Beam (ISMB)", "IS 800:2007 Section 8");
  var list = p.sec === "auto" ? D.ISMB : D.ISMB.filter(function (x) { return x.name === p.sec; });
  var s = null, o;
  for (var i = 0; i < list.length; i++) { o = ST.beamCheck(list[i], p); if (p.sec !== "auto" || o.ok) { s = list[i]; break; } }
  if (!s) { r.fail("No ISMB in the table is adequate - use a built-up/plated section."); return r; }
  r.h("Section: " + s.name + " (" + s.m + " kg/m)");
  r.row("Section class", o.cls, "", "Table 2");
  r.eq("Mu = " + U.f(o.Mu) + " kNm (incl. self weight) ; Vu = " + U.f(o.Vu) + " kN");
  if (!p.lat) {
    r.eq("Mcr = " + U.f(o.Mcr) + " kNm ; λLT = " + U.f(o.lLT, 3) + " ; χLT = " + U.f(o.chi, 3), "cl 8.2.2, Annex E");
  } else r.note("Compression flange laterally supported: Md = βb Zp fy/γm0 ≤ 1.2 Ze fy/γm0 (cl 8.2.1.2).");
  r.check("Bending Mu ≤ Md", o.Mu <= o.Md, U.f(o.Mu) + " ≤ " + U.f(o.Md) + " kNm", "cl 8.2");
  r.check("Shear Vu ≤ Vd = Av fy/(√3 γm0)", o.Vu <= o.Vd, U.f(o.Vu) + " ≤ " + U.f(o.Vd) + " kN", "cl 8.4");
  if (o.Vu > 0.6 * o.Vd) {
    r.eq("High shear: V > 0.6Vd = " + U.f(0.6 * o.Vd) + " kN → Mdv = Md − β(Md − Mfd), β = (2V/Vd − 1)², Mfd = bf·tf·(D − tf)·fy/γm0 = " + U.f(o.Mfd) + " kNm", "cl 9.2.2");
    r.check("Moment with high shear M ≤ Mdv (critical section x = " + U.f(o.hs.x, 2) + " m)", o.hs.u <= 1, "M = " + U.f(o.hs.M) + ", V = " + U.f(o.hs.V) + " kN, β = " + U.f(o.hs.beta, 3) + " → Mdv = " + U.f(o.hs.Mdv) + " kNm", "cl 9.2.2");
  } else r.check("Low shear V ≤ 0.6Vd: no moment reduction", true, U.f(o.Vu) + " ≤ " + U.f(0.6 * o.Vd) + " kN", "cl 9.2.1");
  r.check("Deflection (service) ≤ limit", o.defl <= o.dlim, U.f(o.defl, 1) + " ≤ " + U.f(o.dlim, 1) + " mm", "Table 6");
  r.note("Check web bearing and web buckling at supports/concentrated loads (cl 8.7.3, 8.7.4).");
  r.sum("Beam", s.name);
  r.sum("Md / Mu", U.f(o.Md) + " / " + U.f(o.Mu) + " kNm");
  r.res = { sec: s, o: o };
  return r;
};

/* ------------------------------------------------------------ PURLIN */
ST.purlinCheck = function (s, kind, p, loads) {
  var fy = p.fy, o = {};
  var Zz, Zy, Iz, Zpz, Zpy, m;
  if (kind === "angle") {
    var c = s.C * 10, a = s.a; Iz = s.A * 100 * Math.pow(s.rxx * 10, 2);
    Zz = Iz / (a - c); Zy = Zz; Zpz = Zz; Zpy = Zy; m = s.m;
  } else { Iz = s.Ix * 1e4; Zz = s.Zex * 1e3; Zy = s.Zey * 1e3; Zpz = 1.14 * Zz; Zpy = 1.5 * Zy; m = s.m; }
  var Mdz = Math.min(Zpz, 1.2 * Zz) * fy / D.gm0 / 1e6, Mdy = Math.min(Zpy, 1.5 * Zy) * fy / D.gm0 / 1e6;
  if (kind === "angle") { Mdz = Zz * fy / D.gm0 / 1e6; Mdy = Zy * fy / D.gm0 / 1e6; }
  var L = p.span, sw = m * 9.81 / 1000, best = 0, gov = "";
  loads.forEach(function (c) {
    var wn = c.n + c.fd * sw * Math.cos(p.th), wt = c.t + c.fd * sw * Math.sin(p.th);
    var Mz = Math.abs(wn) * L * L / 10, My = Math.abs(wt) * Math.pow(L / (p.sag ? 2 : 1), 2) / 10;
    var u = Mz / Mdz + My / Mdy;
    if (u > best) { best = u; gov = c.name; o.Mz = Mz; o.My = My; }
  });
  o.u = best; o.gov = gov; o.Mdz = Mdz; o.Mdy = Mdy; o.m = m;
  var wsv = loads.service * 1;
  o.defl = 5 * (wsv + sw * Math.cos(p.th)) * Math.pow(L * 1000, 4) / (384 * D.E * Iz);
  o.dlim = L * 1000 / 180;
  o.ok = o.u <= 1 && o.defl <= o.dlim;
  return o;
};
ST.purlin = function (p) {
  var r = new Rep("Purlin Design", "IS 800:2007 cl 8, 9.3 ; IS 875");
  var th = p.slope * Math.PI / 180; p.th = th;
  var sp = p.sp;
  var D_ = p.DL * sp, L_ = p.LL * sp * Math.cos(th), W_ = p.WL * sp;   /* kN/m on purlin */
  r.h("1. Loads on purlin (per m run)");
  r.eq("DL = " + p.DL + " × " + sp + " = " + U.f(D_, 3) + " ; LL = " + p.LL + " × " + sp + " × cosθ = " + U.f(L_, 3) + " ; WL (normal) = " + p.WL + " × " + sp + " = " + U.f(W_, 3) + " kN/m", "IS 875 Pt 1-3");
  var loads = [
    { name: "1.5(DL+LL)", n: 1.5 * (D_ + L_) * Math.cos(th), t: 1.5 * (D_ + L_) * Math.sin(th), fd: 1.5 },
    { name: "1.2(DL+LL+WL)", n: 1.2 * ((D_ + L_) * Math.cos(th) + W_), t: 1.2 * (D_ + L_) * Math.sin(th), fd: 1.2 },
    { name: "0.9DL - 1.5WL (uplift)", n: 0.9 * D_ * Math.cos(th) - 1.5 * Math.abs(p.WLup) * sp, t: 0.9 * D_ * Math.sin(th), fd: 0.9 }
  ];
  loads.service = (D_ + L_) * Math.cos(th);
  var cands = p.kind === "angle" ? D.ISA : D.ISMC, s = null, o;
  for (var i = 0; i < cands.length; i++) { o = ST.purlinCheck(cands[i], p.kind, p, loads); if (o.ok) { s = cands[i]; break; } }
  if (!s) { r.fail("No section adequate - reduce truss spacing or use sag rods."); return r; }
  r.h("2. Section: " + s.name);
  r.eq("Governing combination: " + o.gov + " ; Mz = " + U.f(o.Mz, 3) + " kNm, My = " + U.f(o.My, 3) + " kNm (wL²/10, continuous)", "");
  r.check("Biaxial: Mz/Mdz + My/Mdy ≤ 1", o.u <= 1, U.f(o.u, 3) + " (Mdz " + U.f(o.Mdz, 2) + ", Mdy " + U.f(o.Mdy, 2) + " kNm)", "cl 9.3.1.1");
  r.check("Deflection ≤ span/180", o.defl <= o.dlim, U.f(o.defl, 1) + " ≤ " + U.f(o.dlim, 1) + " mm", "Table 6");
  if (p.sag) r.note("Sag rods at mid-span assumed (weak-axis span halved).");
  r.sum("Purlin", s.name + " @ " + sp + " m c/c");
  r.sum("Weight", U.f(o.m, 2) + " kg/m");
  r.res = { sec: s };
  return r;
};

/* ------------------------------------------------------------ BOLTS & WELDS */
ST.boltCap = function (p) {
  var fub = p.grade === "8.8" ? 800 : p.grade === "10.9" ? 1000 : 400, d = p.db, d0 = ST.d0(d);
  var Asb = Math.PI * d * d / 4, Anb = 0.78 * Asb;
  var Vdsb = fub / Math.sqrt(3) * (p.nn * Anb + p.ns * Asb) / D.gmb;
  var kb = Math.min(p.e / (3 * d0), p.pitch / (3 * d0) - 0.25, fub / p.fu, 1);
  var Vdpb = 2.5 * kb * d * p.t * p.fu / D.gmb;
  return { Vdsb: Vdsb / 1e3, Vdpb: Vdpb / 1e3, Vdb: Math.min(Vdsb, Vdpb) / 1e3, kb: kb, fub: fub, Anb: Anb };
};
ST.bolts = function (p) {
  var r = new Rep("Bolted & Welded Connections", "IS 800:2007 Section 10");
  r.h("1. Bearing-type bolts (grade " + p.grade + ", M" + p.db + ")");
  var c = ST.boltCap(p);
  r.eq("Vdsb = fub/(√3 γmb) (nn Anb + ns Asb) = " + U.f(c.Vdsb) + " kN", "cl 10.3.3");
  r.eq("kb = " + U.f(c.kb, 3) + " ; Vdpb = 2.5 kb d t fu/γmb = " + U.f(c.Vdpb) + " kN", "cl 10.3.4");
  var lj = (p.nb - 1) * p.pitch, blj = lj > 15 * p.db ? Math.max(0.75, Math.min(1, 1.075 - lj / (200 * p.db))) : 1;
  var cap = p.nb * c.Vdb * blj;
  r.row("Long joint factor βlj", U.f(blj, 3), "", "cl 10.3.3.1");
  r.row("Bolt group capacity", U.f(cap), "kN");
  var nreq = Math.ceil(p.Vu / (c.Vdb * blj));
  r.check(p.nb + " bolts ≥ required " + nreq, cap >= p.Vu, U.f(cap) + " ≥ " + p.Vu + " kN");
  var d0 = ST.d0(p.db);
  r.check("Min pitch 2.5d", p.pitch >= 2.5 * p.db, p.pitch + " ≥ " + 2.5 * p.db + " mm", "cl 10.2.2");
  r.check("Min edge/end distance 1.5d0", p.e >= 1.5 * d0, p.e + " ≥ " + U.f(1.5 * d0, 1) + " mm", "cl 10.2.4.2");
  r.h("2. Fillet weld");
  var tmin = p.tw_thk, smin = tmin <= 10 ? 3 : tmin <= 20 ? 5 : tmin <= 32 ? 6 : 10;
  var gmw = p.field ? 1.5 : 1.25, fwd = p.fu / (Math.sqrt(3) * gmw);
  var capw = 0.7 * p.s * p.Lw * fwd / 1e3;
  r.row("Minimum weld size for " + tmin + " mm plate", smin, "mm", "Table 21");
  r.check("Weld size ≥ minimum", p.s >= smin, p.s + " ≥ " + smin + " mm");
  r.eq("fwd = fu/(√3 γmw) = " + U.f(fwd, 1) + " N/mm² ; capacity = 0.7 s Lw fwd = " + U.f(capw) + " kN", "cl 10.5.7.1.1");
  r.check("Weld capacity ≥ force", capw >= p.Fw, U.f(capw) + " ≥ " + p.Fw + " kN");
  var Lreq = p.Fw * 1e3 / (0.7 * p.s * fwd) + 2 * p.s;
  r.row("Required effective length + end returns", U.f(Lreq, 0), "mm", "cl 10.5.4");
  r.sum("Bolts", p.nb + " nos M" + p.db + " gr " + p.grade + " (" + U.f(c.Vdb) + " kN each)");
  r.sum("Weld", p.s + " mm fillet, " + p.Lw + " mm (" + U.f(capw) + " kN)");
  return r;
};

if (typeof module !== "undefined") module.exports = ST;
