/* Seismic engine — IS 1893 (Part 1):2016.
   • Centre of mass (CM) and centre of rigidity (CR) of every floor, design eccentricity (cl 7.8.2)
   • Accidental-torsion load cases (torques Qi·e at each floor)
   • Modal analysis: lumped translational masses, subspace iteration on the skyline-factored stiffness
   • Response spectrum analysis (cl 7.7): Ak = (Z/2)(Sa/g)/(R/I), CQC (5 % damping) or SRSS, scaling to the
     static base shear (cl 7.7.3), optional 100 % + 30 % orthogonal combination
   • Irregularity indicators: torsion (Table 5 (i)), soft storey and mass irregularity (Table 6)
   Units kN, m, s; mass = W/g in kN·s²/m. */
var SE = {};
SE.g = 9.81;

/* ---------- floors ---------- */
/* nodes grouped to the nearest floor level above the base; returns [{z, nodes:[i], W, cm:{x,y}, bx, by}] */
SE.floors = function (m, W) {
  var lv = MD.floorLevels(m), base = lv[0], fl = lv.slice(1).map(function (z) { return { z: z, nodes: [], W: 0, sx: 0, sy: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }; });
  if (!fl.length) return [];
  m.nodes.forEach(function (n, i) {
    if (n.z - base < 0.01) return;
    var best = 0, d = Infinity; fl.forEach(function (f, k) { var dd = Math.abs(f.z - n.z); if (dd < d) { d = dd; best = k; } });
    var f = fl[best], w = W ? W[i] || 0 : 0;
    f.nodes.push(i); f.W += w; f.sx += w * n.x; f.sy += w * n.y;
    if (Math.abs(n.z - f.z) < 0.01) { f.x0 = Math.min(f.x0, n.x); f.x1 = Math.max(f.x1, n.x); f.y0 = Math.min(f.y0, n.y); f.y1 = Math.max(f.y1, n.y); }
  });
  fl.forEach(function (f) {
    if (f.W > 0) f.cm = { x: f.sx / f.W, y: f.sy / f.W };
    else { var a = 0, b = 0; f.nodes.forEach(function (i) { a += m.nodes[i].x; b += m.nodes[i].y; }); f.cm = { x: a / Math.max(f.nodes.length, 1), y: b / Math.max(f.nodes.length, 1) }; }
    f.bx = isFinite(f.x1) ? f.x1 - f.x0 : 0; f.by = isFinite(f.y1) ? f.y1 - f.y0 : 0;
    f.top = f.nodes.filter(function (i) { return Math.abs(m.nodes[i].z - f.z) < 0.01; });
  });
  return fl.filter(function (f) { return f.top.length; });
};
/* nodal forces forming a pure torque Mz about the floor CM, distributed in proportion to node weight (rigid-floor pattern) */
SE.torque = function (m, f, Mz, W) {
  var J = 0, out = [], c = f.cm, nodes = f.top;
  var wt = function (i) { return W && W[i] > 0 ? W[i] : 1; };
  nodes.forEach(function (i) { var n = m.nodes[i]; J += wt(i) * ((n.x - c.x) * (n.x - c.x) + (n.y - c.y) * (n.y - c.y)); });
  if (!(J > 0)) return out;
  nodes.forEach(function (i) { var n = m.nodes[i], k = Mz * wt(i) / J; out.push({ n: i, f: [-k * (n.y - c.y), k * (n.x - c.x), 0, 0, 0, 0] }); });
  return out;
};
/* least-squares rigid rotation of a floor from its node displacements */
SE.floorRot = function (m, f, U, W) {
  var c = f.cm, a = 0, b = 0;
  f.top.forEach(function (i) { var n = m.nodes[i], w = W && W[i] > 0 ? W[i] : 1, rx = n.x - c.x, ry = n.y - c.y; a += w * (rx * U[6 * i + 1] - ry * U[6 * i]); b += w * (rx * rx + ry * ry); });
  return b > 0 ? a / b : 0;
};
SE.floorDisp = function (m, f, U, d, W) {
  var s = 0, w = 0; f.top.forEach(function (i) { var wi = W && W[i] > 0 ? W[i] : 1; s += wi * U[6 * i + d]; w += wi; }); return w ? s / w : 0;
};
/* centre of rigidity of every floor (floor-by-floor unit loads on the factored stiffness) */
SE.centres = function (m, W, fl) {
  FE.prepare(m); var asm = FE.assemble(m, null), A = asm.A;
  if (FE.factor(A, m._maxa, m._neq) >= 0) throw new Error("Structure unstable — cannot compute centres of rigidity");
  function solve(loads) {
    var F = new Float64Array(m._neq);
    loads.forEach(function (l) { for (var t = 0; t < 6; t++) { var e = m._eq[6 * l.n + t]; if (e >= 0) F[e] += l.f[t]; } });
    return FE.expand(m, FE.backsub(A, m._maxa, m._neq, F));
  }
  fl.forEach(function (f) {
    var Wf = f.top.reduce(function (s, i) { return s + (W[i] > 0 ? W[i] : 0); }, 0) || f.top.length;
    var lx = f.top.map(function (i) { return { n: i, f: [(W[i] > 0 ? W[i] : Wf / f.top.length) / Wf, 0, 0, 0, 0, 0] }; });
    var ly = f.top.map(function (i) { return { n: i, f: [0, (W[i] > 0 ? W[i] : Wf / f.top.length) / Wf, 0, 0, 0, 0] }; });
    var tT = SE.floorRot(m, f, solve(SE.torque(m, f, 1, W)), W);
    var t1 = SE.floorRot(m, f, solve(lx), W), t2 = SE.floorRot(m, f, solve(ly), W);
    if (Math.abs(tT) < 1e-15) { f.cr = { x: f.cm.x, y: f.cm.y }; return; }
    f.cr = { x: f.cm.x - t2 / tT, y: f.cm.y + t1 / tT };
    f.esx = f.cm.x - f.cr.x; f.esy = f.cm.y - f.cr.y;   /* static eccentricities */
  });
  return fl;
};

/* ---------- modal analysis (subspace iteration) ---------- */
SE.modes = function (m, W, nModes, opt) {
  opt = opt || {};
  FE.prepare(m); var asm = FE.assemble(m, null), A = asm.A, n = m._neq;
  if (FE.factor(A, m._maxa, n) >= 0) throw new Error("Structure unstable — modal analysis not possible");
  var Md = new Float64Array(n), Mt = [0, 0], dirs = m.twoD ? [0] : [0, 1];
  m.nodes.forEach(function (nd, i) {
    var mi = (W[i] > 0 ? W[i] : 0) / SE.g; if (!mi) return;
    dirs.forEach(function (d) { var e = m._eq[6 * i + d]; if (e >= 0) { Md[e] += mi; Mt[d] += mi; } });
  });
  var nm = 0; for (var i = 0; i < n; i++) if (Md[i] > 0) nm++;
  var p = Math.max(1, Math.min(nModes, nm)), q = Math.min(Math.max(2 * p, p + 8), nm);
  if (q < 1) throw new Error("No seismic mass in the model");
  /* starting vectors (Bathe): mass diagonal, unit vectors at largest m/k, one random */
  var Kd = new Float64Array(n); for (i = 0; i < n; i++) Kd[i] = A[m._maxa[i]];
  var X = [], cand = []; for (i = 0; i < n; i++) if (Md[i] > 0) cand.push(i);
  cand.sort(function (a, b) { return Md[b] / Math.abs(Kd[b] || 1) - Md[a] / Math.abs(Kd[a] || 1); });
  X.push(Float64Array.from(Md));
  for (var k = 1; k < q - 1 && k - 1 < cand.length; k++) { var v = new Float64Array(n); v[cand[k - 1]] = 1; X.push(v); }
  var seed = 12345; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  while (X.length < q) { var r = new Float64Array(n); for (i = 0; i < n; i++) r[i] = Md[i] > 0 ? rnd() - 0.5 : 0; X.push(r); }
  var lam = null, it, conv = false, maxIt = opt.maxIt || 60, tol = opt.tol || 1e-8, Q, Xb, j;
  for (it = 0; it < maxIt; it++) {
    var MX = X.map(function (x) { var y = new Float64Array(n); for (var j = 0; j < n; j++) y[j] = Md[j] * x[j]; return y; });
    Xb = MX.map(function (y) { return FE.backsub(A, m._maxa, n, Float64Array.from(y)); });
    var Kr = [], Mr = [];
    for (var a = 0; a < q; a++) { Kr.push(new Float64Array(q)); Mr.push(new Float64Array(q)); }
    for (a = 0; a < q; a++) for (var b = a; b < q; b++) {
      var s1 = 0, s2 = 0; for (j = 0; j < n; j++) { s1 += Xb[a][j] * MX[b][j]; if (Md[j]) s2 += Xb[a][j] * Md[j] * Xb[b][j]; }
      Kr[a][b] = Kr[b][a] = s1; Mr[a][b] = Mr[b][a] = s2;
    }
    var eg = SE.geneig(Kr, Mr), l2 = eg.val;
    Q = eg.vec;
    X = []; for (a = 0; a < q; a++) { var x = new Float64Array(n); for (b = 0; b < q; b++) { var c = Q[b][a]; if (c) for (j = 0; j < n; j++) x[j] += c * Xb[b][j]; } X.push(x); }
    if (lam) { var err = 0; for (a = 0; a < p; a++) err = Math.max(err, Math.abs(l2[a] - lam[a]) / Math.abs(l2[a])); if (err < tol) { lam = l2; conv = true; break; } }
    lam = l2;
  }
  var modes = [];
  for (a = 0; a < p; a++) {
    var phi = X[a], mn = 0; for (j = 0; j < n; j++) mn += Md[j] * phi[j] * phi[j];
    var sc = 1 / Math.sqrt(mn), U = new Float64Array(6 * m.nodes.length);
    for (i = 0; i < U.length; i++) if (m._eq[i] >= 0) U[i] = phi[m._eq[i]] * sc;
    var w2 = lam[a], T = 2 * Math.PI / Math.sqrt(w2), L = [0, 0];
    dirs.forEach(function (d) { var s = 0; m.nodes.forEach(function (nd, i2) { var mi = (W[i2] > 0 ? W[i2] : 0) / SE.g, e = m._eq[6 * i2 + d]; if (mi && e >= 0) s += mi * U[6 * i2 + d]; }); L[d] = s; });
    modes.push({ k: a + 1, w2: w2, w: Math.sqrt(w2), T: T, f: 1 / T, U: U, L: L, Gam: L.slice(), Meff: L.map(function (x) { return x * x; }), pct: L.map(function (x, d) { return Mt[d] > 0 ? x * x / Mt[d] : 0; }) });
  }
  /* torsional participation about the overall mass centre */
  var xc = 0, yc = 0, ms = 0; m.nodes.forEach(function (nd, i2) { var mi = (W[i2] > 0 ? W[i2] : 0) / SE.g; xc += mi * nd.x; yc += mi * nd.y; ms += mi; });
  if (ms > 0) { xc /= ms; yc /= ms; }
  var Ir = 0; m.nodes.forEach(function (nd, i2) { var mi = (W[i2] > 0 ? W[i2] : 0) / SE.g; Ir += mi * ((nd.x - xc) * (nd.x - xc) + (nd.y - yc) * (nd.y - yc)); });
  modes.forEach(function (md) {
    var s = 0; if (!m.twoD) m.nodes.forEach(function (nd, i2) { var mi = (W[i2] > 0 ? W[i2] : 0) / SE.g; if (mi) s += mi * (-(nd.y - yc) * md.U[6 * i2] + (nd.x - xc) * md.U[6 * i2 + 1]); });
    md.pctR = Ir > 0 ? s * s / Ir : 0;
    var mx = Math.max(md.pct[0], md.pct[1] || 0, md.pctR);
    md.kind = mx < 0.01 ? "Local" : m.twoD ? "X" : md.pctR >= Math.max(md.pct[0], md.pct[1]) ? "Torsion" : md.pct[0] >= md.pct[1] ? "X" : "Y";
  });
  return { modes: modes, Mt: Mt, conv: conv, iter: it + 1, q: q, nMassDof: nm };
};
/* generalized symmetric eigenproblem K x = λ M x (small, dense): Cholesky of M, Jacobi on L⁻¹ K L⁻ᵀ */
SE.geneig = function (K, M) {
  var n = K.length, L = [], i, j, k;
  for (i = 0; i < n; i++) L.push(new Float64Array(n));
  for (i = 0; i < n; i++) for (j = 0; j <= i; j++) {
    var s = M[i][j]; for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) L[i][i] = Math.sqrt(Math.max(s, 1e-300)); else L[i][j] = s / L[j][j];
  }
  function solveL(b) { var x = new Float64Array(n); for (var r = 0; r < n; r++) { var s2 = b[r]; for (var c = 0; c < r; c++) s2 -= L[r][c] * x[c]; x[r] = s2 / L[r][r]; } return x; }
  function solveLT(b) { var x = new Float64Array(n); for (var r = n - 1; r >= 0; r--) { var s2 = b[r]; for (var c = r + 1; c < n; c++) s2 -= L[c][r] * x[c]; x[r] = s2 / L[r][r]; } return x; }
  /* C = L⁻¹ K L⁻ᵀ */
  var Y = []; for (j = 0; j < n; j++) { var col = new Float64Array(n); for (i = 0; i < n; i++) col[i] = K[i][j]; Y.push(solveL(col)); }   /* Y[j] = L⁻¹ K[:,j] → columns of L⁻¹K */
  var C = []; for (i = 0; i < n; i++) C.push(new Float64Array(n));
  for (i = 0; i < n; i++) { var row = new Float64Array(n); for (j = 0; j < n; j++) row[j] = Y[j][i]; var z = solveL(row); for (j = 0; j < n; j++) C[i][j] = z[j]; }
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { var a = (C[i][j] + C[j][i]) / 2; C[i][j] = C[j][i] = a; }
  var V = []; for (i = 0; i < n; i++) { V.push(new Float64Array(n)); V[i][i] = 1; }
  for (var sweep = 0; sweep < 80; sweep++) {
    var off = 0; for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) off += C[i][j] * C[i][j];
    if (off < 1e-30) break;
    for (var pI = 0; pI < n; pI++) for (var qI = pI + 1; qI < n; qI++) {
      if (Math.abs(C[pI][qI]) < 1e-300) continue;
      var th = (C[qI][qI] - C[pI][pI]) / (2 * C[pI][qI]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (k = 0; k < n; k++) { var akp = C[k][pI], akq = C[k][qI]; C[k][pI] = cs * akp - sn * akq; C[k][qI] = sn * akp + cs * akq; }
      for (k = 0; k < n; k++) { var apk = C[pI][k], aqk = C[qI][k]; C[pI][k] = cs * apk - sn * aqk; C[qI][k] = sn * apk + cs * aqk; }
      for (k = 0; k < n; k++) { var vkp = V[k][pI], vkq = V[k][qI]; V[k][pI] = cs * vkp - sn * vkq; V[k][qI] = sn * vkp + cs * vkq; }
    }
  }
  var idx = []; for (i = 0; i < n; i++) idx.push(i);
  idx.sort(function (a2, b2) { return C[a2][a2] - C[b2][b2]; });
  var val = idx.map(function (c) { return C[c][c]; }), vec = [];
  for (i = 0; i < n; i++) vec.push(new Float64Array(n));
  idx.forEach(function (c, col) { var y = new Float64Array(n); for (i = 0; i < n; i++) y[i] = V[i][c]; var x = solveLT(y); for (i = 0; i < n; i++) vec[i][col] = x[i]; });
  return { val: val, vec: vec };
};

/* ---------- response spectrum ---------- */
SE.rho = function (wi, wj, z) {   /* CQC correlation, equal damping z */
  var b = wj / wi; return 8 * z * z * (1 + b) * Math.pow(b, 1.5) / (Math.pow(1 - b * b, 2) + 4 * z * z * b * Math.pow(1 + b, 2));
};
SE.combine = function (vals, modes, method) {   /* vals[k] = modal response of one quantity */
  var s = 0, nM = vals.length, i, j;
  if (method === "srss") { for (i = 0; i < nM; i++) s += vals[i] * vals[i]; return Math.sqrt(s); }
  for (i = 0; i < nM; i++) for (j = 0; j < nM; j++) s += vals[i] * vals[j] * (i === j ? 1 : SE.rho(modes[i].w, modes[j].w, 0.05));
  return Math.sqrt(Math.max(s, 0));
};
/* modal response quantities and combined envelopes for direction d. Returns {Vb, VbStatic, scale, U (envelope),
   fr[k].dg (9-point envelope), sh[k], reac, Ak[], Vk[] } */
SE.spectrum = function (m, res, md, d, p, sta) {
  var modes = md.modes, Z = D.zone[p.zone], nM = modes.length, meth = p.rsComb || "cqc";
  var Ak = modes.map(function (mo) { return Z / 2 * LD.saG(mo.T, p.soil) / (p.R / p.I); });
  var amp = modes.map(function (mo, i) { return mo.Gam[d] * Ak[i] * SE.g / mo.w2; });   /* modal coordinate peak */
  var Vk = modes.map(function (mo, i) { return mo.Meff[d] * Ak[i] * SE.g; });
  var Vb = SE.combine(Vk, modes, meth);
  var VbS = sta ? sta.Vb : 0, scale = Vb > 0 && VbS > Vb ? VbS / Vb : 1;
  var sD = p.rsScaleDisp ? scale : 1;
  /* displacements */
  var nU = 6 * m.nodes.length, U = new Float64Array(nU), tmp = new Float64Array(nM);
  for (var i = 0; i < nU; i++) { for (var k = 0; k < nM; k++) tmp[k] = modes[k].U[i] * amp[k]; U[i] = SE.combine(tmp, modes, meth) * sD; }
  /* member diagrams */
  var comps = ["N", "Vy", "Vz", "T", "My", "Mz"], fr = [], sh = [];
  var mdg = modes.map(function (mo, k) { return m.frames.map(function (e, j) { var Um = mo.U.map(function (v) { return v * amp[k]; }); return FE.frameDiagram(FE.frameForces(m, j, Um, null, 0), 8); }); });
  m.frames.forEach(function (e, j) {
    var dg = [];
    for (var s = 0; s <= 8; s++) {
      var pt = { x: mdg[0][j][s].x };
      comps.forEach(function (c) { for (var k2 = 0; k2 < nM; k2++) tmp[k2] = mdg[k2][j][s][c]; pt[c] = SE.combine(tmp, modes, meth) * scale; });
      dg.push(pt);
    }
    fr.push(dg);
  });
  var sc = ["Nx", "Ny", "Nxy", "Mx", "My", "Mxy", "Qx", "Qy"];
  if (m.shells.length) {
    var msh = modes.map(function (mo, k) { var Um = mo.U.map(function (v) { return v * amp[k]; }); return m.shells.map(function (e, j) { return FE.shellForces(m, j, Um); }); });
    m.shells.forEach(function (e, j) { var o = { R: msh[0][j].R }; sc.forEach(function (c) { for (var k2 = 0; k2 < nM; k2++) tmp[k2] = msh[k2][j][c]; o[c] = SE.combine(tmp, modes, meth) * scale; }); sh.push(o); });
  }
  /* reactions: from modal displacements via element forces is costly; use modal base-shear distribution to supports */
  var reac = {}; Object.keys(m.sup).forEach(function (v) { reac[v] = [0, 0, 0, 0, 0, 0]; });
  var mreac = modes.map(function (mo, k) { var Um = mo.U.map(function (v) { return v * amp[k]; }); return SE.reactions(m, Um); });
  Object.keys(reac).forEach(function (v) { for (var t = 0; t < 6; t++) { for (var k2 = 0; k2 < nM; k2++) tmp[k2] = mreac[k2][v] ? mreac[k2][v][t] : 0; reac[v][t] = SE.combine(tmp, modes, meth) * scale; } });
  var cum = 0; modes.forEach(function (mo) { cum += mo.pct[d]; });
  return { d: d, Ak: Ak, Vk: Vk, Vb: Vb, VbS: VbS, scale: scale, sD: sD, U: U, fr: fr, sh: sh, reac: reac, cum: cum, meth: meth, amp: amp };
};
/* support reactions for a displacement vector (no member loads) */
SE.reactions = function (m, U) {
  var R = {}; Object.keys(m.sup).forEach(function (v) { R[v] = [0, 0, 0, 0, 0, 0]; });
  var isS = {}; Object.keys(m.sup).forEach(function (v) { isS[v] = 1; });
  m.frames.forEach(function (e, k) {
    if (!isS[e.n1] && !isS[e.n2]) return;
    var ff = FE.frameForces(m, k, U, null, 0), g = FE.toGlobal(ff.R, 4, ff.f);
    [e.n1, e.n2].forEach(function (v, s) { if (isS[v]) for (var t = 0; t < 6; t++) R[v][t] += g[6 * s + t]; });
  });
  m.shells.forEach(function (e, k) {
    if (!e.n.some(function (v) { return isS[v]; })) return;
    var dd = m._shellCache[k], ug = []; e.n.forEach(function (v) { for (var t = 0; t < 6; t++) ug.push(U[6 * v + t]); });
    var fg = FE.mv(FE.rotate(dd.R, 8, dd.K), ug); e.n.forEach(function (v, s) { if (isS[v]) for (var t = 0; t < 6; t++) R[v][t] += fg[6 * s + t]; });
  });
  return R;
};
/* storey drift for the spectrum: modal drift of every stacked node pair, combined (CQC), largest per storey */
SE.rsDrift = function (m, md, rs) {
  var lv = MD.floorLevels(m), out = [], modes = md.modes, d = rs.d, tmp = new Float64Array(modes.length);
  for (var i = 1; i < lv.length; i++) {
    var h = lv[i] - lv[i - 1], top = [], bot = [];
    m.nodes.forEach(function (n, j) { if (Math.abs(n.z - lv[i]) < 0.01) top.push(j); else if (Math.abs(n.z - lv[i - 1]) < 0.01) bot.push(j); });
    var best = null;
    top.forEach(function (j) {
      var A = m.nodes[j], k = -1; bot.forEach(function (q) { var B = m.nodes[q]; if (Math.hypot(A.x - B.x, A.y - B.y) < 0.01) k = q; });
      if (k < 0) return;
      for (var t = 0; t < modes.length; t++) tmp[t] = (modes[t].U[6 * j + d] - modes[t].U[6 * k + d]) * rs.amp[t];
      var dr = SE.combine(tmp, modes, rs.meth) * rs.sD / h;
      if (!best || dr > best.dr) best = { dr: dr, top: j, bot: k };
    });
    if (best) out.push({ c: "RS" + (d ? "Y" : "X"), z: lv[i], zb: lv[i - 1], h: h, dr: best.dr, top: best.top, bot: best.bot, ut: rs.U[6 * best.top + d], ub: rs.U[6 * best.bot + d], stacked: true, tr: 1, ok: best.dr <= 0.004, lim: 0.004, rs: true });
  }
  return out;
};

/* ---------- full seismic run: called after the linear static analysis ---------- */
/* adds response-spectrum combinations to res.combos / S.cb; returns report data */
SE.run = function (m, S, p) {
  var L = S.L, res = S.res, out = { floors: SE.floors(m, L.W) };
  if (!m.twoD && out.floors.length) { try { SE.centres(m, L.W, out.floors); } catch (e) { out.crErr = e.message; } }
  if (!p.rsa) return out;
  var t0 = Date.now(), nF = out.floors.length;
  var md = SE.modes(m, L.W, Math.max(p.nModes || 12, 1));
  out.md = md; out.rs = {};
  var dirs = m.twoD ? [0] : [0, 1];
  dirs.forEach(function (d) { out.rs[d] = SE.spectrum(m, res, md, d, p, L.eq["EQ" + (d ? "Y" : "X")]); });
  /* orthogonal 100 % + 30 % (cl 6.3.4.2) on envelopes, accidental torsion added as |T| responses */
  function env(d) {
    var a = out.rs[d], b = out.rs[1 - d], o = p.ortho && b ? 0.3 : 0, tA = res.cases["T" + (d ? "Y" : "X") + "a"];
    var U = new Float64Array(a.U.length); for (var i = 0; i < U.length; i++) U[i] = a.U[i] + (o ? o * b.U[i] : 0);
    var fr = a.fr.map(function (dg, j) { return dg.map(function (pt, s) { var q = { x: pt.x }; ["N", "Vy", "Vz", "T", "My", "Mz"].forEach(function (c) { q[c] = pt[c] + (o ? o * b.fr[j][s][c] : 0); }); return q; }); });
    var sh = a.sh.map(function (x, j) { var q = { R: x.R }; ["Nx", "Ny", "Nxy", "Mx", "My", "Mxy", "Qx", "Qy"].forEach(function (c) { q[c] = x[c] + (o ? o * b.sh[j][c] : 0); }); return q; });
    var reac = {}; Object.keys(a.reac).forEach(function (v) { reac[v] = a.reac[v].map(function (x, t) { return x + (o ? o * b.reac[v][t] : 0); }); });
    if (tA && p.accTor) {   /* accidental eccentricity ±0.05 b (static torques) added as absolute response */
      var Ut = tA.U, frt = m.frames.map(function (e, j) { return FE.frameDiagram(FE.frameForces(m, j, Ut, tA.lv.qeq[j], 0), 8); });
      for (i = 0; i < U.length; i++) U[i] += Math.abs(Ut[i]);
      fr.forEach(function (dg, j) { dg.forEach(function (q, s) { ["N", "Vy", "Vz", "T", "My", "Mz"].forEach(function (c) { q[c] += Math.abs(frt[j][s][c]); }); }); });
      sh.forEach(function (q, j) { var t = FE.shellForces(m, j, Ut); ["Nx", "Ny", "Nxy", "Mx", "My", "Mxy", "Qx", "Qy"].forEach(function (c) { q[c] += Math.abs(t[c]); }); });
    }
    return { U: U, fr: fr, sh: sh, reac: reac };
  }
  out.env = {}; dirs.forEach(function (d) { out.env[d] = env(d); });
  /* combinations: gravity part from the static cases, ± spectral envelope */
  var W = p.method === "wsm", G = W ? [["DL+LL", { DL: 1, LL: 1 }, 1], ["DL", { DL: 1 }, 1]] : [["1.2(DL+LL", { DL: 1.2, LL: 1.2 }, 1.2], ["1.5(DL", { DL: 1.5 }, 1.5], ["0.9DL", { DL: 0.9 }, 1.5]];
  dirs.forEach(function (d) {
    var nm = "RS" + (d ? "Y" : "X"), E = out.env[d];
    G.forEach(function (g) {
      [1, -1].forEach(function (sg) {
        var name = W ? g[0] + (sg > 0 ? "+" : "-") + nm : (g[0] === "0.9DL" ? "0.9DL" + (sg > 0 ? "+" : "-") + "1.5" + nm : g[0] + (sg > 0 ? "+" : "-") + nm + ")");
        var cb = SE.combo(m, res, g[1], E, sg * g[2], name);
        res.combos.push(cb);
        var meta = { name: name, f: g[1], rs: { dir: d, sign: sg, fac: g[2] }, inc: W ? 4 / 3 : 1 };
        S.cb.push(meta); if (res.incMap) res.incMap[name] = meta.inc;
      });
    });
  });
  out.drift = []; dirs.forEach(function (d) { out.drift = out.drift.concat(SE.rsDrift(m, md, out.rs[d])); });
  out.ms = Date.now() - t0;
  return out;
};
/* spectral envelope of any linear response r(U) (vector-valued), consistent with SE.run: modal combination × scale,
   + 0.3 × the orthogonal direction (if chosen), + |r(accidental-torsion case)| */
SE.respEnv = function (m, S, p, fn) {
  var se = S.se, out = {};
  if (!se || !se.rs || !se.md) return out;
  var modes = se.md.modes, cache = {};
  function modal(d) {
    if (cache[d]) return cache[d];
    var a = se.rs[d], per = modes.map(function (mo, k) { var Um = mo.U.map(function (v) { return v * a.amp[k]; }); return fn(Um); }), n = per[0].length, r = [];
    for (var c = 0; c < n; c++) r.push(SE.combine(per.map(function (q) { return q[c]; }), modes, a.meth) * a.scale);
    return (cache[d] = r);
  }
  Object.keys(se.rs).forEach(function (dk) {
    var d = +dk, r = modal(d).slice(), o = p.ortho && se.rs[1 - d] ? 0.3 : 0;
    if (o) modal(1 - d).forEach(function (v, c) { r[c] += o * v; });
    var tA = S.res.cases["T" + (d ? "Y" : "X") + "a"];
    if (tA && p.accTor) fn(tA.U).forEach(function (v, c) { r[c] += Math.abs(v); });
    out[d] = r;
  });
  return out;
};
/* one response-spectrum combination: Σ f·(static case) + fac·(± envelope) */
SE.combo = function (m, res, f, E, fac, name) {
  var nU = 6 * m.nodes.length, U = new Float64Array(nU), cs = Object.keys(f);
  cs.forEach(function (c) { var u = res.cases[c].U; for (var i = 0; i < nU; i++) U[i] += f[c] * u[i]; });
  for (var i = 0; i < nU; i++) U[i] += fac * E.U[i];
  var fr = m.frames.map(function (e, j) {
    var gdg = null;
    cs.forEach(function (c) {
      var dg = FE.frameDiagram(FE.frameForces(m, j, res.cases[c].U, res.cases[c].lv.qeq[j], 0), 8);
      if (!gdg) gdg = dg.map(function (q) { var o = { x: q.x }; ["N", "Vy", "Vz", "T", "My", "Mz"].forEach(function (k) { o[k] = 0; }); return o; });
      dg.forEach(function (q, s) { ["N", "Vy", "Vz", "T", "My", "Mz"].forEach(function (k) { gdg[s][k] += f[c] * q[k]; }); });
    });
    var dg2 = gdg.map(function (q, s) { var o = { x: q.x }; ["N", "Vy", "Vz", "T", "My", "Mz"].forEach(function (k) { o[k] = q[k] + fac * E.fr[j][s][k]; }); return o; });
    var ff = FE.frameForces(m, j, U, null, 0);
    return { dg: dg2, L: ff.L, R: ff.R, wl: [0, 0, 0], f: ff.f, d: ff.d, ul: ff.ul };
  });
  var sh = m.shells.map(function (e, j) {
    var o = { R: null }, k0 = ["Nx", "Ny", "Nxy", "Mx", "My", "Mxy", "Qx", "Qy"];
    k0.forEach(function (k) { o[k] = 0; });
    cs.forEach(function (c) { var t = FE.shellForces(m, j, res.cases[c].U); o.R = t.R; k0.forEach(function (k) { o[k] += f[c] * t[k]; }); });
    k0.forEach(function (k) { o[k] += fac * E.sh[j][k]; });
    return o;
  });
  var reac = {}, g0 = res.combos[0].reac;
  Object.keys(m.sup).forEach(function (v) {
    reac[v] = [0, 0, 0, 0, 0, 0];
    cs.forEach(function (c) { var rc = res.caseReac ? res.caseReac[c] : null; if (rc && rc[v]) for (var t = 0; t < 6; t++) reac[v][t] += f[c] * rc[v][t]; });
    for (var t = 0; t < 6; t++) reac[v][t] += fac * (E.reac[v] ? E.reac[v][t] : 0);
  });
  return { name: name, U: U, fr: fr, sh: sh, reac: reac, rs: true, N: null };
};

/* ---------- irregularity indicators ---------- */
SE.irregular = function (m, S, out) {
  var fl = out.floors, L = S.L, res = S.res, W = L.W, rows = [];
  if (!fl.length) return rows;
  ["X", "Y"].forEach(function (D0, d) {
    if (m.twoD && d) return;
    var nm = "EQ" + D0; if (!res.cases[nm]) return;
    var U = res.cases[nm].U, Q = fl.map(function (f) { var s = 0; (L.cases[nm].nodal || []).forEach(function (l) { if (f.nodes.indexOf(l.n) >= 0) s += l.f[d]; }); return s; });
    var V = Q.map(function (q, i) { var s = 0; for (var j = i; j < Q.length; j++) s += Q[j]; return s; });
    var dCM = fl.map(function (f) { return SE.floorDisp(m, f, U, d, W); });
    fl.forEach(function (f, i) {
      var dd = dCM[i] - (i ? dCM[i - 1] : 0), k = Math.abs(dd) > 1e-12 ? V[i] / dd : Infinity;
      rows.push({ dir: D0, i: i, z: f.z, W: f.W, Q: Q[i], V: V[i], dcm: dCM[i], k: k });
    });
  });
  /* soft storey (stiffness < storey above), mass (W > 1.5 W below) */
  rows.forEach(function (r) {
    var above = rows.filter(function (q) { return q.dir === r.dir && q.i === r.i + 1; })[0], below = rows.filter(function (q) { return q.dir === r.dir && q.i === r.i - 1; })[0];
    r.kr = above && isFinite(above.k) && above.k > 0 ? r.k / above.k : null;
    r.soft = r.kr !== null && r.kr < 1;
    r.wr = below && below.W > 0 ? r.W / below.W : null;
    r.mass = r.wr !== null && r.wr > 1.5;
  });
  return rows;
};
SE.torsionCheck = function (m, S, out) {
  var fl = out.floors, res = S.res, rows = [];
  if (m.twoD) return rows;
  fl.forEach(function (f, i) {
    ["X", "Y"].forEach(function (D0, d) {
      var worst = null;
      Object.keys(res.cases).filter(function (c) { return c === "EQ" + D0; }).forEach(function (c) {
        [null, "a", "b"].forEach(function (v) {
          var tc = v ? res.cases["T" + D0 + v] : null; if (v && !tc) return;
          var U = res.cases[c].U, mx = -Infinity, mn = Infinity;
          f.top.forEach(function (j) { var u = Math.abs(U[6 * j + d] + (tc ? tc.U[6 * j + d] : 0)); mx = Math.max(mx, u); mn = Math.min(mn, u); });
          var r1 = mx / ((mx + mn) / 2), r2 = mn > 1e-12 ? mx / mn : Infinity;
          if (!worst || r1 > worst.ave) worst = { ave: r1, min: r2, mx: mx, mn: mn, v: v || "—" };
        });
      });
      if (worst) rows.push({ z: f.z, dir: D0, ave: worst.ave, min: worst.min, mx: worst.mx, mn: worst.mn, v: worst.v,
        amd2: worst.ave <= 1.2 ? "regular" : worst.ave <= 1.4 ? "irregular (1.2–1.4)" : "irregular (> 1.4)",
        orig: worst.min <= 1.5 ? "regular" : worst.min <= 2.0 ? "irregular (1.5–2.0)" : "irregular (> 2.0)" });
    });
  });
  return rows;
};
if (typeof module !== "undefined") module.exports = SE;
