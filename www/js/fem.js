/* Finite element engine. Units: kN, m. 6 DOF per node (ux, uy, uz, rx, ry, rz). Global Z is vertical (up).
   - 3D frame element (direct stiffness / displacement method) with end releases, UDL, P-Delta geometric stiffness
   - 4-node flat shell: QM6 incompatible-mode membrane + MITC4 Mindlin plate + drilling stiffness
   - RCM node renumbering + skyline LDL^T solver (Bathe COLSOL) */
var FE = {};

/* ---------- small dense helpers ---------- */
FE.zeros = function (n, m) { var a = []; for (var i = 0; i < n; i++) a.push(new Float64Array(m)); return a; };
FE.inv = function (A) {           /* small dense inverse (Gauss-Jordan) */
  var n = A.length, M = A.map(function (r, i) { var x = Array.from(r); for (var j = 0; j < n; j++) x.push(i === j ? 1 : 0); return x; });
  for (var c = 0; c < n; c++) {
    var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    var t = M[c]; M[c] = M[p]; M[p] = t;
    var d = M[c][c]; if (Math.abs(d) < 1e-300) throw new Error("singular local matrix");
    for (var j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (r = 0; r < n; r++) if (r !== c) { var f = M[r][c]; if (f) for (j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(function (r) { return r.slice(n); });
};
FE.mul = function (A, B) {
  var n = A.length, m = B[0].length, k = B.length, C = FE.zeros(n, m);
  for (var i = 0; i < n; i++) for (var p = 0; p < k; p++) { var a = A[i][p]; if (a) for (var j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
  return C;
};
FE.tr = function (A) { var n = A.length, m = A[0].length, T = FE.zeros(m, n); for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) T[j][i] = A[i][j]; return T; };
FE.mv = function (A, v) { return A.map(function (r) { var s = 0; for (var j = 0; j < v.length; j++) s += r[j] * v[j]; return s; }); };
FE.btdb = function (K, B, Dm, f) {   /* K += f * B^T D B */
  var DB = FE.mul(Dm, B), n = B[0].length, m = B.length;
  for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) { var s = 0; for (var k = 0; k < m; k++) s += B[k][i] * DB[k][j]; K[i][j] += f * s; }
};
function v3(a, b) { return [b.x - a.x, b.y - a.y, b.z - a.z]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function unit(a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
FE.cross = cross; FE.unit = unit; FE.dot = dot;
FE.rotate = function (R, nblk, K) {     /* K_global = T^T K T, T = blockdiag(R x nblk) */
  var n = 3 * nblk, KT = FE.zeros(n, n), G = FE.zeros(n, n), b, i, j, k;
  for (i = 0; i < n; i++) for (b = 0; b < nblk; b++) for (j = 0; j < 3; j++) { var s = 0; for (k = 0; k < 3; k++) s += K[i][3 * b + k] * R[k][j]; KT[i][3 * b + j] = s; }
  for (b = 0; b < nblk; b++) for (i = 0; i < 3; i++) for (j = 0; j < n; j++) { var s2 = 0; for (k = 0; k < 3; k++) s2 += R[k][i] * KT[3 * b + k][j]; G[3 * b + i][j] = s2; }
  return G;
};
FE.toLocal = function (R, nblk, u) { var o = new Array(3 * nblk); for (var b = 0; b < nblk; b++) for (var i = 0; i < 3; i++) o[3 * b + i] = R[i][0] * u[3 * b] + R[i][1] * u[3 * b + 1] + R[i][2] * u[3 * b + 2]; return o; };
FE.toGlobal = function (R, nblk, f) { var o = new Array(3 * nblk); for (var b = 0; b < nblk; b++) for (var i = 0; i < 3; i++) o[3 * b + i] = R[0][i] * f[3 * b] + R[1][i] * f[3 * b + 1] + R[2][i] * f[3 * b + 2]; return o; };

/* ================= FRAME ELEMENT ================= */
FE.frameAxes = function (A, B) {
  var x = unit(v3(A, B)), ref = Math.abs(x[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1];
  var z = unit(cross(x, ref)), y = cross(z, x);
  return [x, y, z];
};
/* local elastic stiffness (12x12) */
FE.frameKe = function (L, s, truss) {
  var K = FE.zeros(12, 12), E = s.E, G = s.G;
  function put(i, j, v) { K[i][j] += v; if (i !== j) K[j][i] += v; }
  var a = E * s.A / L; put(0, 0, a); put(6, 6, a); put(0, 6, -a);
  if (truss) return K;
  var t = G * s.J / L; put(3, 3, t); put(9, 9, t); put(3, 9, -t);
  var Iz = s.Iz, Iy = s.Iy, L2 = L * L, L3 = L2 * L;
  put(1, 1, 12 * E * Iz / L3); put(7, 7, 12 * E * Iz / L3); put(1, 7, -12 * E * Iz / L3);
  put(1, 5, 6 * E * Iz / L2); put(1, 11, 6 * E * Iz / L2); put(5, 7, -6 * E * Iz / L2); put(7, 11, -6 * E * Iz / L2);
  put(5, 5, 4 * E * Iz / L); put(11, 11, 4 * E * Iz / L); put(5, 11, 2 * E * Iz / L);
  put(2, 2, 12 * E * Iy / L3); put(8, 8, 12 * E * Iy / L3); put(2, 8, -12 * E * Iy / L3);
  put(2, 4, -6 * E * Iy / L2); put(2, 10, -6 * E * Iy / L2); put(4, 8, 6 * E * Iy / L2); put(8, 10, 6 * E * Iy / L2);
  put(4, 4, 4 * E * Iy / L); put(10, 10, 4 * E * Iy / L); put(4, 10, 2 * E * Iy / L);
  return K;
};
/* geometric stiffness for axial force N (tension +) */
FE.frameKg = function (L, N, truss) {
  var K = FE.zeros(12, 12);
  if (truss) { [[1, 7], [2, 8]].forEach(function (p) { K[p[0]][p[0]] += N / L; K[p[1]][p[1]] += N / L; K[p[0]][p[1]] -= N / L; K[p[1]][p[0]] -= N / L; }); return K; }
  var c = N / (30 * L), L2 = L * L;
  var a = [[36, 3 * L, -36, 3 * L], [3 * L, 4 * L2, -3 * L, -L2], [-36, -3 * L, 36, -3 * L], [3 * L, -L2, -3 * L, 4 * L2]];
  var d1 = [1, 5, 7, 11], d2 = [2, 4, 8, 10], sg = [1, -1, 1, -1];
  for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
    K[d1[i]][d1[j]] += c * a[i][j];
    K[d2[i]][d2[j]] += c * a[i][j] * sg[i] * sg[j];
  }
  return K;
};
/* condense released local DOFs r out of K (and load q); returns {K, q, rel, Krr_inv_Krc...} */
FE.condense = function (K, q, rel) {
  if (!rel || !rel.length) return { K: K, q: q };
  var c = [], i, j;
  for (i = 0; i < 12; i++) if (rel.indexOf(i) < 0) c.push(i);
  var Krr = rel.map(function (a) { return rel.map(function (b) { return K[a][b]; }); });
  var Ri = FE.inv(Krr);
  var Kr_c = rel.map(function (a) { return Array.from({ length: 12 }, function (_, b) { return K[a][b]; }); });   /* rows r, all cols */
  var X = FE.mul(Ri, Kr_c);                         /* Krr^-1 Kr* */
  var qr = rel.map(function (a) { return q[a]; }), xq = FE.mv(Ri, qr);
  var K2 = FE.zeros(12, 12), q2 = new Array(12).fill(0);
  for (i = 0; i < 12; i++) {
    if (rel.indexOf(i) >= 0) continue;
    for (j = 0; j < 12; j++) {
      if (rel.indexOf(j) >= 0) continue;
      var s = K[i][j]; for (var k = 0; k < rel.length; k++) s -= K[i][rel[k]] * X[k][j]; K2[i][j] = s;
    }
    var sq = q[i]; for (k = 0; k < rel.length; k++) sq -= K[i][rel[k]] * xq[k]; q2[i] = sq;
  }
  return { K: K2, q: q2, X: X, xq: xq };
};
FE.frameLoadLocal = function (L, wl) {
  var q = new Array(12).fill(0);
  q[0] = q[6] = wl[0] * L / 2;
  q[1] = q[7] = wl[1] * L / 2; q[5] = wl[1] * L * L / 12; q[11] = -wl[1] * L * L / 12;
  q[2] = q[8] = wl[2] * L / 2; q[4] = -wl[2] * L * L / 12; q[10] = wl[2] * L * L / 12;
  return q;
};
/* full element data in local coordinates for given axial force (P-Delta) and releases */
FE.frameElem = function (m, e, N, wGlobal) {
  var A = m.nodes[e.n1], B = m.nodes[e.n2], R = FE.frameAxes(A, B), L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
  var truss = e.type === "brace" && e.pinned;
  var K = FE.frameKe(L, e.sec, truss);
  if (N) { var Kg = FE.frameKg(L, N, truss); for (var i = 0; i < 12; i++) for (var j = 0; j < 12; j++) K[i][j] += Kg[i][j]; }
  var wl = [0, 0, 0];
  if (wGlobal) wl = [dot(R[0], wGlobal), dot(R[1], wGlobal), dot(R[2], wGlobal)];
  var q = FE.frameLoadLocal(L, wl);
  if (truss) { q[4] = q[5] = q[10] = q[11] = 0; }
  var rel = (e.rel || []).slice();
  var c = FE.condense(K, q, rel);
  return { R: R, L: L, K: c.K, q: c.q, cond: c, rel: rel, wl: wl, truss: truss };
};

/* ================= SHELL ELEMENT ================= */
var GP = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)];
function q4(xi, eta) {
  return { N: [(1 - xi) * (1 - eta) / 4, (1 + xi) * (1 - eta) / 4, (1 + xi) * (1 + eta) / 4, (1 - xi) * (1 + eta) / 4],
    dxi: [-(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4],
    deta: [-(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4] };
}
function jac(sf, X, Y) {
  var J = [[0, 0], [0, 0]];
  for (var i = 0; i < 4; i++) { J[0][0] += sf.dxi[i] * X[i]; J[0][1] += sf.dxi[i] * Y[i]; J[1][0] += sf.deta[i] * X[i]; J[1][1] += sf.deta[i] * Y[i]; }
  var det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  var Ji = [[J[1][1] / det, -J[0][1] / det], [-J[1][0] / det, J[0][0] / det]];
  return { J: J, det: det, Ji: Ji };
}
FE.shellGeom = function (m, e) {
  var P = e.n.map(function (i) { return m.nodes[i]; });
  var e3 = unit(cross(v3(P[0], P[2]), v3(P[1], P[3])));
  var a = v3(P[0], P[1]), d = dot(a, e3); a = [a[0] - d * e3[0], a[1] - d * e3[1], a[2] - d * e3[2]];
  var e1 = unit(a), e2 = cross(e3, e1);
  var c = { x: (P[0].x + P[1].x + P[2].x + P[3].x) / 4, y: (P[0].y + P[1].y + P[2].y + P[3].y) / 4, z: (P[0].z + P[1].z + P[2].z + P[3].z) / 4 };
  var X = P.map(function (p) { return dot(v3(c, p), e1); }), Y = P.map(function (p) { return dot(v3(c, p), e2); });
  return { R: [e1, e2, e3], X: X, Y: Y };
};
FE.shellElem = function (m, e) {
  var g = FE.shellGeom(m, e), X = g.X, Y = g.Y, E = e.mat.E, nu = e.mat.nu, t = e.t;
  var cm = E * t / (1 - nu * nu), Dm = [[cm, cm * nu, 0], [cm * nu, cm, 0], [0, 0, cm * (1 - nu) / 2]];
  var cb = E * t * t * t / (12 * (1 - nu * nu)), Db = [[cb, cb * nu, 0], [cb * nu, cb, 0], [0, 0, cb * (1 - nu) / 2]];
  var Gs = 5 / 6 * E / (2 * (1 + nu)) * t, Ds = [[Gs, 0], [0, Gs]];
  var gq = FE.quadQuality(X, Y);
  if (gq.err) throw new Error("Shell element " + (e.id + 1) + ": " + gq.err);
  var j0 = jac(q4(0, 0), X, Y);
  var Kcc = FE.zeros(8, 8), Kci = FE.zeros(8, 4), Kii = FE.zeros(4, 4), Kb = FE.zeros(12, 12), area = 0, Ni = [0, 0, 0, 0];
  /* MITC4 tying rows */
  function tyRows(xi, eta) {
    var sf = q4(xi, eta), jj = jac(sf, X, Y), rx = new Array(12).fill(0), re = new Array(12).fill(0);
    for (var i = 0; i < 4; i++) {
      rx[3 * i] = sf.dxi[i]; rx[3 * i + 1] = -jj.J[0][1] * sf.N[i]; rx[3 * i + 2] = jj.J[0][0] * sf.N[i];
      re[3 * i] = sf.deta[i]; re[3 * i + 1] = -jj.J[1][1] * sf.N[i]; re[3 * i + 2] = jj.J[1][0] * sf.N[i];
    }
    return { gx: rx, ge: re };
  }
  var TA = tyRows(0, 1), TC = tyRows(0, -1), TB = tyRows(-1, 0), TD = tyRows(1, 0);
  function shearB(xi, eta, Ji) {
    var gx = new Array(12), ge = new Array(12);
    for (var k = 0; k < 12; k++) { gx[k] = 0.5 * (1 + eta) * TA.gx[k] + 0.5 * (1 - eta) * TC.gx[k]; ge[k] = 0.5 * (1 + xi) * TD.ge[k] + 0.5 * (1 - xi) * TB.ge[k]; }
    return [gx.map(function (_, k) { return Ji[0][0] * gx[k] + Ji[0][1] * ge[k]; }), gx.map(function (_, k) { return Ji[1][0] * gx[k] + Ji[1][1] * ge[k]; })];
  }
  function mats(xi, eta) {
    var sf = q4(xi, eta), jj = jac(sf, X, Y);
    var Nx = [], Ny = [];
    for (var i = 0; i < 4; i++) { Nx.push(jj.Ji[0][0] * sf.dxi[i] + jj.Ji[0][1] * sf.deta[i]); Ny.push(jj.Ji[1][0] * sf.dxi[i] + jj.Ji[1][1] * sf.deta[i]); }
    var Bm = FE.zeros(3, 8), Bi = FE.zeros(3, 4), Bb = FE.zeros(3, 12);
    for (i = 0; i < 4; i++) {
      Bm[0][2 * i] = Nx[i]; Bm[1][2 * i + 1] = Ny[i]; Bm[2][2 * i] = Ny[i]; Bm[2][2 * i + 1] = Nx[i];
      Bb[0][3 * i + 2] = Nx[i]; Bb[1][3 * i + 1] = -Ny[i]; Bb[2][3 * i + 1] = -Nx[i]; Bb[2][3 * i + 2] = Ny[i];
    }
    var r = j0.det / jj.det, dP = [[-2 * xi, 0], [0, -2 * eta]];   /* P1 = 1-xi^2, P2 = 1-eta^2 */
    for (var p = 0; p < 2; p++) {
      var px = r * (j0.Ji[0][0] * dP[p][0] + j0.Ji[0][1] * dP[p][1]), py = r * (j0.Ji[1][0] * dP[p][0] + j0.Ji[1][1] * dP[p][1]);
      Bi[0][2 * p] = px; Bi[1][2 * p + 1] = py; Bi[2][2 * p] = py; Bi[2][2 * p + 1] = px;
    }
    return { sf: sf, jj: jj, Bm: Bm, Bi: Bi, Bb: Bb, Bs: shearB(xi, eta, jj.Ji) };
  }
  GP.forEach(function (xi) {
    GP.forEach(function (eta) {
      var o = mats(xi, eta), w = o.jj.det;
      if (w <= 0) throw new Error("Shell element " + (e.id + 1) + " is distorted or has reversed node order");
      FE.btdb(Kcc, o.Bm, Dm, w); FE.btdb(Kii, o.Bi, Dm, w);
      var DBi = FE.mul(Dm, o.Bi);
      for (var a = 0; a < 8; a++) for (var b = 0; b < 4; b++) { var s = 0; for (var k = 0; k < 3; k++) s += o.Bm[k][a] * DBi[k][b]; Kci[a][b] += w * s; }
      FE.btdb(Kb, o.Bb, Db, w); FE.btdb(Kb, o.Bs, Ds, w);
      area += w; for (var i = 0; i < 4; i++) Ni[i] += o.sf.N[i] * w;
    });
  });
  var Kiinv = FE.inv(Kii), Kic = FE.tr(Kci), X2 = FE.mul(Kiinv, Kic);   /* alpha = -X2 u_m */
  var Km = FE.zeros(8, 8);
  for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) { var s = Kcc[i][j]; for (var k = 0; k < 4; k++) s -= Kci[i][k] * X2[k][j]; Km[i][j] = s; }
  var K = FE.zeros(24, 24), kdr = 1e-3 * E * t * area;
  var mI = [0, 1], bI = [2, 3, 4];
  for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) {
    for (var p = 0; p < 2; p++) for (var q = 0; q < 2; q++) K[6 * a + mI[p]][6 * b + mI[q]] = Km[2 * a + p][2 * b + q];
    for (p = 0; p < 3; p++) for (q = 0; q < 3; q++) K[6 * a + bI[p]][6 * b + bI[q]] = Kb[3 * a + p][3 * b + q];
  }
  for (a = 0; a < 4; a++) K[6 * a + 5][6 * a + 5] += kdr;
  /* drilling: tie each node's rz weakly to the element mean rotation (avoids a free rigid mode) */
  for (a = 0; a < 4; a++) for (b = 0; b < 4; b++) K[6 * a + 5][6 * b + 5] -= kdr / 4;
  var o0 = mats(0, 0);
  return { R: g.R, K: K, area: area, Ni: Ni, Dm: Dm, Db: Db, Ds: Ds, B0: o0, X2: X2, X: X, Y: Y };
};

/* ================= MODEL / ASSEMBLY ================= */
/* stiffness signature: geometry, supports, sections, releases, shells — reuse numbering and the factorised K while it is unchanged */
FE.sig = function (m) {
  var h1 = 2166136261, h2 = 5381, cnt = 0;
  function add(x) { var v = typeof x === "number" ? (x * 1e6) | 0 : String(x).length * 7919 + (String(x).charCodeAt(0) || 0); h1 = Math.imul(h1 ^ v, 16777619); h2 = (Math.imul(h2, 33) + v) | 0; cnt++; }
  function addS(o) { if (!o) return add(0); for (var k in o) { var v = o[k]; if (typeof v === "number") add(v); else if (typeof v === "boolean") add(v ? 1 : 0); else if (typeof v === "string") { add(v.length); for (var i = 0; i < v.length; i++) add(v.charCodeAt(i)); } } }
  add(m.nodes.length); add(m.frames.length); add(m.shells.length); add(m.twoD ? 1 : 0);
  m.nodes.forEach(function (n) { add(n.x); add(n.y); add(n.z); });
  Object.keys(m.sup || {}).forEach(function (k) { add(+k); (m.sup[k] || []).forEach(function (x) { add(x ? 1 : 0); }); });
  Object.keys(m.spr || {}).forEach(function (k) { add(-1 - k); m.spr[k].forEach(function (x) { add(x / 1e3); }); });
  m.frames.forEach(function (e) { add(e.n1); add(e.n2); add(e.pinned ? 1 : 0); add(e.type || ""); addS(e.sec); if (e.rel) e.rel.forEach(function (x) { add(x ? 1 : 0); }); });
  m.shells.forEach(function (e) { e.n.forEach(add); add(e.t); addS(e.mat); });
  return (h1 >>> 0).toString(36) + "." + (h2 >>> 0).toString(36) + "." + cnt;
};
/* factorised elastic stiffness (no geometric stiffness), shared by the linear analysis, rigidity centres and modal analysis */
FE.factored = function (m) {
  FE.prepare(m);
  if (m._LDL && m._LDL.sig === m._kSig && m._LDL.A.length === m._maxa[m._neq]) return m._LDL.A;
  var A = FE.assemble(m, null).A, bad = FE.factor(A, m._maxa, m._neq);
  if (bad >= 0) { var er = new Error("Structure is unstable (mechanism or missing support) at " + FE.dofName(m, bad) + ". Check supports, member releases and that every part of the model is connected."); er.dof = bad; throw er; }
  m._LDL = { sig: m._kSig, A: A };
  return A;
};
FE.prepare = function (m) {
  var sg = FE.sig(m);
  if (m._kSig === sg && m._eq && m._prepInfo) return m._prepInfo;
  m._LDL = null;
  var n = m.nodes.length, adj = []; for (var i = 0; i < n; i++) adj.push([]);
  function link(list) { for (var a = 0; a < list.length; a++) for (var b = 0; b < list.length; b++) if (a !== b) adj[list[a]].push(list[b]); }
  m.frames.forEach(function (e) { link([e.n1, e.n2]); }); m.shells.forEach(function (e, k) { e.id = k; link(e.n); });
  /* reverse Cuthill-McKee */
  var deg = adj.map(function (a) { return a.length; }), seen = new Uint8Array(n), order = [];
  var ids = Array.from({ length: n }, function (_, i) { return i; }).sort(function (a, b) { return deg[a] - deg[b]; });
  ids.forEach(function (s) {
    if (seen[s]) return; var Q = [s]; seen[s] = 1;
    while (Q.length) {
      var v = Q.shift(); order.push(v);
      adj[v].filter(function (w) { return !seen[w]; }).sort(function (a, b) { return deg[a] - deg[b]; }).forEach(function (w) { if (!seen[w]) { seen[w] = 1; Q.push(w); } });
    }
  });
  order.reverse();
  var pos = new Int32Array(n); order.forEach(function (v, k) { pos[v] = k; });
  /* equation numbers */
  var eq = new Int32Array(6 * n).fill(-1), neq = 0;
  order.forEach(function (v) {
    var r = (m.sup[v] || [0, 0, 0, 0, 0, 0]);
    for (var d = 0; d < 6; d++) {
      var fixed = r[d] || (m.twoD && (d === 1 || d === 3 || d === 5));
      if (!fixed) eq[6 * v + d] = neq++;
    }
  });
  var conn = new Uint8Array(6 * n);   /* dofs with stiffness */
  m.frames.forEach(function (e) {
    var truss = e.type === "brace" && e.pinned;
    [e.n1, e.n2].forEach(function (v) { for (var d = 0; d < (truss ? 3 : 6); d++) conn[6 * v + d] = 1; });
  });
  m.shells.forEach(function (e) { e.n.forEach(function (v) { for (var d = 0; d < 6; d++) conn[6 * v + d] = 1; }); });
  Object.keys(m.spr || {}).forEach(function (v) { m.spr[v].forEach(function (k, d) { if (k > 0) conn[6 * v + d] = 1; }); });
  /* restrain DOFs with no stiffness at all (e.g. rotations at pure truss joints) */
  var eq2 = new Int32Array(6 * n).fill(-1); neq = 0;
  order.forEach(function (v) { for (var d = 0; d < 6; d++) if (eq[6 * v + d] >= 0 && conn[6 * v + d]) eq2[6 * v + d] = neq++; });
  /* skyline heights */
  var minRow = new Int32Array(neq); for (i = 0; i < neq; i++) minRow[i] = i;
  function elDofs(nodes) { var d = []; nodes.forEach(function (v) { for (var k = 0; k < 6; k++) d.push(eq2[6 * v + k]); }); return d; }
  function prof(ds) { var mn = Infinity; ds.forEach(function (x) { if (x >= 0 && x < mn) mn = x; }); ds.forEach(function (x) { if (x >= 0 && mn < minRow[x]) minRow[x] = mn; }); }
  m.frames.forEach(function (e) { prof(elDofs([e.n1, e.n2])); });
  m.shells.forEach(function (e) { prof(elDofs(e.n)); });
  var maxa = new Int32Array(neq + 1); maxa[0] = 0;
  for (i = 0; i < neq; i++) maxa[i + 1] = maxa[i] + (i - minRow[i]) + 1;
  m._eq = eq2; m._neq = neq; m._maxa = maxa; m._elDofs = elDofs; m._skyShell = null; m._shellCache = [];
  m._kSig = sg; m._prepInfo = { neq: neq, size: maxa[neq] };
  return m._prepInfo;
};
FE.newSky = function (m) { return new Float64Array(m._maxa[m._neq]); };
FE.addSky = function (m, A, dofs, K) {
  for (var a = 0; a < dofs.length; a++) {
    var i = dofs[a]; if (i < 0) continue;
    for (var b = 0; b < dofs.length; b++) {
      var j = dofs[b]; if (j < 0 || i > j) continue;
      A[m._maxa[j] + (j - i)] += K[a][b];
    }
  }
};
FE.factor = function (A, maxa, nn) {   /* LDL^T in place (Bathe COLSOL) */
  for (var n = 0; n < nn; n++) {
    var kn = maxa[n], kl = kn + 1, ku = maxa[n + 1] - 1, kh = ku - kl, k, kk, c, ki;
    if (kh > 0) {
      k = n - kh; var ic = 0, klt = ku;
      for (var j = 1; j <= kh; j++) {
        ic++; klt--; ki = maxa[k]; var nd = maxa[k + 1] - ki - 1;
        if (nd > 0) { kk = Math.min(ic, nd); c = 0; for (var l = 1; l <= kk; l++) c += A[ki + l] * A[klt + l]; A[klt] -= c; }
        k++;
      }
    }
    if (kh >= 0) {
      k = n; var b = 0;
      for (kk = kl; kk <= ku; kk++) { k--; ki = maxa[k]; c = A[kk] / A[ki]; b += c * A[kk]; A[kk] = c; }
      A[kn] -= b;
    }
    if (!(A[kn] > 0)) return n;     /* non-positive pivot: singular / unstable */
  }
  return -1;
};
FE.backsub = function (A, maxa, nn, V) {
  var n, kl, ku, k, kk, c;
  for (n = 0; n < nn; n++) { kl = maxa[n] + 1; ku = maxa[n + 1] - 1; if (ku - kl >= 0) { k = n; c = 0; for (kk = kl; kk <= ku; kk++) { k--; c += A[kk] * V[k]; } V[n] -= c; } }
  for (n = 0; n < nn; n++) V[n] /= A[maxa[n]];
  for (n = nn - 1; n > 0; n--) { kl = maxa[n] + 1; ku = maxa[n + 1] - 1; if (ku - kl >= 0) { k = n; for (kk = kl; kk <= ku; kk++) { k--; V[k] -= A[kk] * V[n]; } } }
  return V;
};

/* back-substitution for many right-hand sides at once: each row of the factor is read once for all vectors
   (memory bound on phones — several times faster than one vector at a time). Vs: array of Float64Array, solved in place */
FE.backsubMany = function (A, maxa, nn, Vs) {
  var nv = Vs.length; if (!nv) return Vs;
  if (nv === 1) { FE.backsub(A, maxa, nn, Vs[0]); return Vs; }
  var B = new Float64Array(nn * nv), n, r, kl, ku, k, kk, a, o, o2, acc = new Float64Array(nv);
  for (r = 0; r < nv; r++) { var v = Vs[r]; for (n = 0; n < nn; n++) B[n * nv + r] = v[n]; }
  for (n = 0; n < nn; n++) {
    kl = maxa[n] + 1; ku = maxa[n + 1] - 1; if (ku < kl) continue;
    acc.fill(0); k = n;
    for (kk = kl; kk <= ku; kk++) { k--; a = A[kk]; if (a === 0) continue; o = k * nv; for (r = 0; r < nv; r++) acc[r] += a * B[o + r]; }
    o = n * nv; for (r = 0; r < nv; r++) B[o + r] -= acc[r];
  }
  for (n = 0; n < nn; n++) { a = 1 / A[maxa[n]]; o = n * nv; for (r = 0; r < nv; r++) B[o + r] *= a; }
  for (n = nn - 1; n > 0; n--) {
    kl = maxa[n] + 1; ku = maxa[n + 1] - 1; if (ku < kl) continue;
    k = n; o2 = n * nv;
    for (kk = kl; kk <= ku; kk++) { k--; a = A[kk]; if (a === 0) continue; o = k * nv; for (r = 0; r < nv; r++) B[o + r] -= a * B[o2 + r]; }
  }
  for (r = 0; r < nv; r++) { var w = Vs[r]; for (n = 0; n < nn; n++) w[n] = B[n * nv + r]; }
  return Vs;
};
/* global stiffness of a shell (cached with the element) */
FE.shellKg = function (d) { return d.Kg || (d.Kg = FE.rotate(d.R, 8, d.K)); };

/* assemble global K (+ geometric stiffness from axial forces Nfr[], optional) */
FE.assemble = function (m, Nfr) {
  var A, cache = { fr: [], sh: [] };
  if (m._skyShell && m._skyShell.length === m._maxa[m._neq]) { A = Float64Array.from(m._skyShell); cache.sh = m._shellCache; }
  else {
    A = FE.newSky(m);
    m.shells.forEach(function (e, k) {
      var d = FE.shellElem(m, e);
      cache.sh[k] = d;
      FE.addSky(m, A, m._elDofs(e.n), FE.shellKg(d));
    });
    m._shellCache = cache.sh; m._skyShell = Float64Array.from(A);
  }
  m.frames.forEach(function (e, k) {
    var d = FE.frameElem(m, e, Nfr ? Nfr[k] : 0, null);
    cache.fr[k] = d;
    FE.addSky(m, A, m._elDofs([e.n1, e.n2]), FE.rotate(d.R, 4, d.K));
  });
  Object.keys(m.spr || {}).forEach(function (v) { m.spr[v].forEach(function (k, d) { var i = m._eq[6 * v + d]; if (k > 0 && i >= 0) A[m._maxa[i]] += k; }); });   /* support springs */
  return { A: A, cache: cache };
};
/* load vector for a load case: {nodal:[{n,f[6]}], frameUDL:[{e,w[3]}], shellP:[{e,q[3]}], self: factor (gravity -Z)} */
FE.loadVector = function (m, lc, cache) {
  var F = new Float64Array(m._neq), n = m.nodes.length, g = lc.self || 0;
  var Ffull = new Float64Array(6 * n);
  (lc.nodal || []).forEach(function (l) { for (var d = 0; d < 6; d++) Ffull[6 * l.n + d] += l.f[d] || 0; });
  var wfr = m.frames.map(function () { return [0, 0, 0]; });
  (lc.frameUDL || []).forEach(function (l) { for (var d = 0; d < 3; d++) wfr[l.e][d] += l.w[d]; });
  if (g) m.frames.forEach(function (e, k) { wfr[k][2] -= g * e.sec.gamma * e.sec.A; });
  var qeq = [];
  m.frames.forEach(function (e, k) {
    var w = wfr[k]; if (!w[0] && !w[1] && !w[2]) { qeq[k] = null; return; }
    var d = FE.frameElem(m, e, cache && cache.N ? cache.N[k] : 0, w);
    qeq[k] = { w: w, q: d.q };
    var qg = FE.toGlobal(d.R, 4, d.q);
    [e.n1, e.n2].forEach(function (v, s) { for (var t = 0; t < 6; t++) Ffull[6 * v + t] += qg[6 * s + t]; });
  });
  var qs = m.shells.map(function () { return [0, 0, 0]; });
  (lc.shellP || []).forEach(function (l) { for (var d = 0; d < 3; d++) qs[l.e][d] += l.q[d]; });
  if (g) m.shells.forEach(function (e, k) { qs[k][2] -= g * e.mat.gamma * e.t; });
  m.shells.forEach(function (e, k) {
    var q = qs[k]; if (!q[0] && !q[1] && !q[2]) return;
    var d = m._shellCache[k] || FE.shellElem(m, e);
    e.n.forEach(function (v, i) { for (var t = 0; t < 3; t++) Ffull[6 * v + t] += q[t] * d.Ni[i]; });
  });
  for (var i = 0; i < 6 * n; i++) if (m._eq[i] >= 0) F[m._eq[i]] += Ffull[i];
  return { F: F, Ffull: Ffull, qeq: qeq, wfr: wfr };
};
FE.expand = function (m, x) { var U = new Float64Array(6 * m.nodes.length); for (var i = 0; i < U.length; i++) if (m._eq[i] >= 0) U[i] = x[m._eq[i]]; return U; };

/* member end forces (local) for displacement vector U */
FE.frameForces = function (m, k, U, qinfo, N) {
  var e = m.frames[k], d = FE.frameElem(m, e, N || 0, qinfo ? qinfo.w : null);
  var ug = []; [e.n1, e.n2].forEach(function (v) { for (var t = 0; t < 6; t++) ug.push(U[6 * v + t]); });
  var ul = FE.toLocal(d.R, 4, ug);
  var f = FE.mv(d.K, ul).map(function (v, i) { return v - (d.q[i] || 0); });
  d.rel.forEach(function (r) { f[r] = 0; });
  return { f: f, L: d.L, wl: d.wl, R: d.R, ul: ul, d: d };
};
/* internal force diagrams at n points: N (tension +), Vy, Vz, T, My, Mz */
FE.frameDiagram = function (ff, npts) {
  if (ff.dg) {   /* precomputed (e.g. response-spectrum envelope) diagram: resample linearly */
    var src = ff.dg, ns = src.length - 1, o2 = [];
    for (var s2 = 0; s2 <= npts; s2++) {
      var t = s2 / npts * ns, i0 = Math.min(Math.floor(t), ns - 1), a = t - i0, A0 = src[i0], B0 = src[i0 + 1], q = { x: ff.L * s2 / npts };
      ["N", "Vy", "Vz", "T", "My", "Mz"].forEach(function (c) { q[c] = A0[c] * (1 - a) + B0[c] * a; });
      o2.push(q);
    }
    return o2;
  }
  var f = ff.f, L = ff.L, w = ff.wl, out = [];
  for (var s = 0; s <= npts; s++) {
    var x = L * s / npts;
    out.push({ x: x, N: -(f[0] + w[0] * x), Vy: f[1] + w[1] * x, Vz: f[2] + w[2] * x, T: -f[3],
      Mz: -f[5] + f[1] * x + w[1] * x * x / 2, My: -(f[4] + f[2] * x + w[2] * x * x / 2) });
  }
  return out;
};
/* shell stress resultants at centre: membrane Nx,Ny,Nxy (kN/m), moments Mx,My,Mxy (kNm/m), shear Qx,Qy */
FE.shellForces = function (m, k, U) {
  var e = m.shells[k], d = m._shellCache[k] || FE.shellElem(m, e), ug = [];
  e.n.forEach(function (v) { for (var t = 0; t < 6; t++) ug.push(U[6 * v + t]); });
  var ul = FE.toLocal(d.R, 8, ug), um = [], ub = [];
  for (var a = 0; a < 4; a++) { um.push(ul[6 * a], ul[6 * a + 1]); ub.push(ul[6 * a + 2], ul[6 * a + 3], ul[6 * a + 4]); }
  var al = FE.mv(d.X2, um).map(function (v) { return -v; });
  var eps = FE.mv(d.B0.Bm, um), epi = FE.mv(d.B0.Bi, al);
  var Nn = FE.mv(d.Dm, eps.map(function (v, i) { return v + epi[i]; }));
  var Mm = FE.mv(d.Db, FE.mv(d.B0.Bb, ub)), Qq = FE.mv(d.Ds, FE.mv(d.B0.Bs, ub));
  return { Nx: Nn[0], Ny: Nn[1], Nxy: Nn[2], Mx: Mm[0], My: Mm[1], Mxy: Mm[2], Qx: Qq[0], Qy: Qq[1], R: d.R, w: ul.filter(function (_, i) { return i % 6 === 2; }) };
};
/* Wood-Armer design moments (sagging +): returns {bx, by, tx, ty} */
FE.woodArmer = function (mx, my, mxy) {
  var a = Math.abs(mxy), bx = mx + a, by = my + a;
  if (bx < 0) { bx = 0; by = mx !== 0 ? my + Math.abs(mxy * mxy / mx) : my + a; }
  else if (by < 0) { by = 0; bx = my !== 0 ? mx + Math.abs(mxy * mxy / my) : mx + a; }
  var tx = mx - a, ty = my - a;
  if (tx > 0) { tx = 0; ty = mx !== 0 ? my - Math.abs(mxy * mxy / mx) : my - a; }
  else if (ty > 0) { ty = 0; tx = my !== 0 ? mx - Math.abs(mxy * mxy / my) : mx - a; }
  return { bx: Math.max(0, bx), by: Math.max(0, by), tx: Math.min(0, tx), ty: Math.min(0, ty) };
};

/* ================= MODEL / MESH QUALITY ================= */
FE.dofName = function (m, eqn) {
  for (var i = 0; i < m._eq.length; i++) if (m._eq[i] === eqn) { var n = Math.floor(i / 6), nd = m.nodes[n]; return "node " + (n + 1) + " (" + nd.x.toFixed(2) + ", " + nd.y.toFixed(2) + ", " + nd.z.toFixed(2) + " m), " + ["UX", "UY", "UZ", "RX", "RY", "RZ"][i % 6]; }
  return "equation " + eqn;
};
/* planar quad in local coordinates: area, convexity, angles, aspect ratio */
FE.quadQuality = function (X, Y) {
  var A = 0, cr = [], ang = [], L = [];
  for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; A += X[i] * Y[j] - X[j] * Y[i]; L.push(Math.hypot(X[j] - X[i], Y[j] - Y[i])); }
  A /= 2;
  var Lmax = Math.max.apply(null, L), Lmin = Math.min.apply(null, L);
  if (!(Lmin > 1e-9 * Math.max(Lmax, 1))) return { err: "zero-length edge (coincident nodes)", A: A };
  if (!(A > 1e-6 * Lmax * Lmax)) return { err: A < 0 ? "inverted (clockwise) node order" : "zero or near-zero area (collinear nodes)", A: A };
  for (i = 0; i < 4; i++) {
    var a = (i + 3) % 4, b = (i + 1) % 4, ux = X[a] - X[i], uy = Y[a] - Y[i], vx = X[b] - X[i], vy = Y[b] - Y[i];
    cr.push(vx * uy - vy * ux);
    ang.push(Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))) * 180 / Math.PI);
  }
  if (cr.some(function (c) { return c <= 0; })) return { err: "non-convex or self-intersecting quadrilateral (Jacobian not positive)", A: A };
  var amin = Math.min.apply(null, ang), amax = Math.max.apply(null, ang);
  if (amin < 10 || amax > 170) return { err: "badly distorted: interior angle " + amin.toFixed(0) + "°–" + amax.toFixed(0) + "° (limit 10°–170°)", A: A };
  return { A: A, ar: Lmax / Lmin, amin: amin, amax: amax };
};
FE.checkModel = function (m) {
  var errors = [], warnings = [], n = m.nodes.length, used = new Uint8Array(n), stats = { shells: m.shells.length, badAR: 0, badAng: 0, warped: 0, maxAR: 0, minAng: 180 };
  m.frames.forEach(function (e, k) {
    var A = m.nodes[e.n1], B = m.nodes[e.n2]; used[e.n1] = used[e.n2] = 1;
    if (e.n1 === e.n2 || Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) < 1e-6) errors.push("Member " + (k + 1) + " has zero length");
    if (e.sec && !(e.sec.A > 0 && e.sec.Iz > 0 && e.sec.Iy > 0)) errors.push("Member " + (k + 1) + " has invalid section properties");
  });
  m.shells.forEach(function (e, k) {
    e.id = k; e.n.forEach(function (i) { used[i] = 1; });
    if (!(e.t > 0)) { errors.push("Shell " + (k + 1) + " has zero thickness"); return; }
    var P = e.n.map(function (i) { return m.nodes[i]; });
    if (new Set(e.n).size < 4) { errors.push("Shell " + (k + 1) + " has repeated nodes (degenerate)"); return; }
    var g; try { g = FE.shellGeom(m, e); } catch (x) { errors.push("Shell " + (k + 1) + ": degenerate geometry"); return; }
    if (g.R.some(function (v) { return v.some(function (x) { return !isFinite(x); }); })) { errors.push("Shell " + (k + 1) + ": degenerate geometry (zero area)"); return; }
    var q = FE.quadQuality(g.X, g.Y);
    if (q.err) { errors.push("Shell " + (k + 1) + ": " + q.err); return; }
    /* warping: out-of-plane offset of nodes from the mean plane relative to the diagonal */
    var c = { x: 0, y: 0, z: 0 }; P.forEach(function (p) { c.x += p.x / 4; c.y += p.y / 4; c.z += p.z / 4; });
    var w = 0; P.forEach(function (p) { w = Math.max(w, Math.abs((p.x - c.x) * g.R[2][0] + (p.y - c.y) * g.R[2][1] + (p.z - c.z) * g.R[2][2])); });
    var diag = Math.max(Math.hypot(P[2].x - P[0].x, P[2].y - P[0].y, P[2].z - P[0].z), Math.hypot(P[3].x - P[1].x, P[3].y - P[1].y, P[3].z - P[1].z));
    if (w / diag > 0.1) errors.push("Shell " + (k + 1) + " is strongly warped (out-of-plane " + (100 * w / diag).toFixed(1) + "% of diagonal)");
    else if (w / diag > 0.01) stats.warped++;
    if (q.ar > 5) stats.badAR++;
    if (q.amin < 45 || q.amax > 135) stats.badAng++;
    stats.maxAR = Math.max(stats.maxAR, q.ar); stats.minAng = Math.min(stats.minAng, q.amin);
  });
  var free = 0; for (var i = 0; i < n; i++) if (!used[i]) free++;
  if (free) warnings.push(free + " node(s) not connected to any element (ignored)");
  if (stats.badAR) warnings.push(stats.badAR + " shell element(s) with aspect ratio > 5 (max " + stats.maxAR.toFixed(1) + ") — refine the mesh for accurate stresses");
  if (stats.badAng) warnings.push(stats.badAng + " shell element(s) with corner angles outside 45°–135° (min " + stats.minAng.toFixed(0) + "°)");
  if (stats.warped) warnings.push(stats.warped + " shell element(s) slightly warped (1–10% of diagonal)");
  /* connectivity: every connected part must contain a support */
  var adj = []; for (i = 0; i < n; i++) adj.push([]);
  m.frames.forEach(function (e) { adj[e.n1].push(e.n2); adj[e.n2].push(e.n1); });
  m.shells.forEach(function (e) { for (var a = 0; a < 4; a++) adj[e.n[a]].push(e.n[(a + 1) % 4], e.n[(a + 3) % 4]); });
  var comp = new Int32Array(n).fill(-1), nc = 0;
  for (i = 0; i < n; i++) {
    if (comp[i] >= 0 || !used[i]) continue;
    var st = [i], hasSup = false, cnt = 0; comp[i] = nc;
    while (st.length) { var v = st.pop(); cnt++; if (m.sup[v] && m.sup[v].some(function (x) { return x; })) hasSup = true; adj[v].forEach(function (w2) { if (comp[w2] < 0) { comp[w2] = nc; st.push(w2); } }); }
    if (!hasSup) errors.push("A group of " + cnt + " node(s) including node " + (i + 1) + " is not connected to any support (floating part)");
    nc++;
  }
  stats.parts = nc;
  return { errors: errors, warnings: warnings, stats: stats };
};

/* ================= LINEAR STATIC ================= */
/* cases: {name: lc}. combos: [{name, f:{case:factor}}]. pdelta: iterate geometric stiffness for each combo */
FE.linear = function (m, cases, combos, opt) {
  opt = opt || {};
  var qc = FE.checkModel(m);
  if (qc.errors.length) throw new Error("Model check failed:\n• " + qc.errors.slice(0, 8).join("\n• ") + (qc.errors.length > 8 ? "\n… " + (qc.errors.length - 8) + " more" : ""));
  var info = FE.prepare(m);
  var res = { info: info, cases: {}, combos: [], quality: qc, warn: qc.warnings.slice() };
  var A = FE.factored(m);
  Object.keys(cases).forEach(function (cn) {
    var lv = FE.loadVector(m, cases[cn], null), x = FE.backsub(A, m._maxa, m._neq, Float64Array.from(lv.F));
    res.cases[cn] = { U: FE.expand(m, x), lv: lv };
  });
  var cbl = combos.slice();
  if (opt.caseReac) Object.keys(cases).forEach(function (cn) { var f0 = {}; f0[cn] = 1; cbl.push({ name: "__case_" + cn, f: f0, __case: true }); });
  var pd0 = opt.pdelta;
  cbl.forEach(function (cb) {
    opt.pdelta = cb.__case ? false : pd0;
    var U = new Float64Array(6 * m.nodes.length), qmix = m.frames.map(function () { return null; }), lcs = [];
    Object.keys(cb.f).forEach(function (cn) {
      var c = res.cases[cn], s = cb.f[cn]; if (!c) return;
      for (var i = 0; i < U.length; i++) U[i] += s * c.U[i];
      c.lv.qeq.forEach(function (q, k) { if (!q) return; if (!qmix[k]) qmix[k] = { w: [0, 0, 0] }; for (var d = 0; d < 3; d++) qmix[k].w[d] += s * q.w[d]; });
      lcs.push([cn, s]);
    });
    var N = null, it = 0, amp = 1, conv = null, hist = [], maxIt = opt.pdMaxIt || 30, tol = opt.pdTol || 1e-6;
    if (opt.pdelta) {
      conv = false;
      for (it = 0; it < maxIt; it++) {
        var Nold = N;
        N = m.frames.map(function (e, k) { var ff = FE.frameForces(m, k, U, qmix[k], N ? N[k] : 0); return -ff.f[0]; });
        var asm2 = FE.assemble(m, N), A2 = asm2.A;
        var badPD = FE.factor(A2, m._maxa, m._neq);
        if (badPD >= 0) throw new Error("P-Delta: the structure becomes unstable (buckles) under combination " + cb.name + " — " + FE.dofName(m, badPD) + ". Axial loads exceed the elastic critical load; stiffen the structure.");
        var F = new Float64Array(m._neq);
        lcs.forEach(function (p) { var f = res.cases[p[0]].lv.F; for (var i = 0; i < F.length; i++) F[i] += p[1] * f[i]; });
        var U2 = FE.expand(m, FE.backsub(A2, m._maxa, m._neq, F));
        var dmax = 0, umax = 0; for (var i = 0; i < U.length; i += 1) { dmax = Math.max(dmax, Math.abs(U2[i] - U[i])); umax = Math.max(umax, Math.abs(U2[i])); }
        var u0 = 0; for (i = 0; i < U.length; i++) u0 = Math.max(u0, Math.abs(U[i]));
        if (it === 0) amp = u0 > 0 ? umax / u0 : 1;
        var dN = 0, nN = 0; if (Nold) N.forEach(function (v, k) { dN = Math.max(dN, Math.abs(v - Nold[k])); nN = Math.max(nN, Math.abs(v)); });
        var rU = dmax / Math.max(umax, 1e-12), rN = Nold ? dN / Math.max(nN, 1e-9) : 1;
        hist.push(rU);
        U = U2;
        if (rU <= tol) { conv = true; it++; break; }
        if (it >= 4 && hist[it] > hist[it - 1] * 1.05 && hist[it - 1] > hist[it - 2] * 1.05) break;   /* diverging */
      }
      if (!conv) throw new Error("P-Delta did not converge for combination " + cb.name + " after " + it + " iterations (last relative displacement change " + (hist[hist.length - 1] || 0).toExponential(2) + ", tolerance " + tol.toExponential(0) + "). The structure is close to elastic instability — results rejected. Stiffen the structure or reduce axial loads.");
    }
    var fr = m.frames.map(function (e, k) { return FE.frameForces(m, k, U, qmix[k], N ? N[k] : 0); });
    var sh = m.shells.map(function (e, k) { return FE.shellForces(m, k, U); });
    /* reactions = K u - F at restrained dofs (from element forces) */
    var Rr = new Float64Array(6 * m.nodes.length);
    fr.forEach(function (ff, k) { var e = m.frames[k], ku = ff.f.map(function (v, i) { return v + (ff.d.rel.indexOf(i) >= 0 ? 0 : ff.d.q[i]); }), g = FE.toGlobal(ff.R, 4, ku); [e.n1, e.n2].forEach(function (v, s) { for (var t = 0; t < 6; t++) Rr[6 * v + t] += g[6 * s + t]; }); });   /* element K u */
    m.shells.forEach(function (e, k) {
      var d = m._shellCache[k], ug = []; e.n.forEach(function (v) { for (var t = 0; t < 6; t++) ug.push(U[6 * v + t]); });
      var fg = FE.mv(FE.shellKg(d), ug); e.n.forEach(function (v, s) { for (var t = 0; t < 6; t++) Rr[6 * v + t] += fg[6 * s + t]; });
    });
    var Fn = new Float64Array(6 * m.nodes.length);
    lcs.forEach(function (p) { var c = res.cases[p[0]].lv.Ffull; for (var i = 0; i < Fn.length; i++) Fn[i] += p[1] * c[i]; });
    var reac = {};
    Object.keys(m.sup).forEach(function (v) { reac[v] = []; for (var t = 0; t < 6; t++) reac[v].push(m.sup[v][t] ? Rr[6 * v + t] - Fn[6 * v + t] : m.spr && m.spr[v] && m.spr[v][t] ? -m.spr[v][t] * U[6 * v + t] : 0); });
    res.combos.push({ name: cb.name, U: U, fr: fr, sh: sh, reac: reac, N: N, pdIter: it, pdAmp: amp, pdConv: conv, pdResid: hist.length ? hist[hist.length - 1] : null });
    if (cb.__case) { res.caseReac = res.caseReac || {}; res.caseReac[lcs[0][0]] = reac; res.combos.pop(); }
    if (conv && it > 10) (res.warn = res.warn || []).push("P-Delta converged slowly for " + cb.name + " (" + it + " iterations): structure is approaching instability.");
  });
  opt.pdelta = pd0;
  return res;
};

if (typeof module !== "undefined") module.exports = FE;
