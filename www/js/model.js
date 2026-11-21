/* Building model: sections & materials, parametric generator, load cases (IS 875 / IS 1893), IS 456 / IS 875-5 combinations,
   member & element design from analysis results (IS 456, IS 800). Units kN, m unless noted. */
var MD = {};

/* ---------- sections ---------- */
MD._pm = {};
MD.secRCC = function (b, Dd, p, role) {
  var fck = p.fck, fy = p.fy, E = 5000 * Math.sqrt(fck) * 1000, col = role === "column";
  var cr = p.crack ? (col ? 0.70 : 0.35) : 1;
  var s = Math.min(b, Dd), l = Math.max(b, Dd), beta = 1 / 3 - 0.21 * s / l * (1 - Math.pow(s / l, 4) / 12);
  var pct = col ? p.pcCol : p.pcBeam, As = pct / 100 * b * Dd, arr = col ? "four" : "two";
  var key = [b, Dd, fck, fy, As, arr].join("|");
  if (!MD._pm[key]) MD._pm[key] = { z: MD.pmTable(b, Dd, As, fck, fy, arr), y: MD.pmTable(Dd, b, As, fck, fy, arr) };
  var t = MD._pm[key];
  return { kind: "rcc", name: b + "x" + Dd, b: b, D: Dd, E: E, G: E / 2.4, A: b * Dd / 1e6, Iz: cr * b * Math.pow(Dd, 3) / 12e12, Iy: cr * Dd * Math.pow(b, 3) / 12e12,
    J: (p.crack ? 0.1 : 1) * beta * s * s * s * l / 1e12, gamma: 25, fck: fck, fy: fy, As: As, arr: arr,
    Mpz: function (N) { return MD.pmGet(t.z, N); }, Mpy: function (N) { return MD.pmGet(t.y, N); },
    Mpz0: MD.pmGet(t.z, 0), Pc: t.z.Pmax, Pt: 0.87 * fy * As / 1e3 };
};
MD.pmTable = function (b, Dd, As, fck, fy, arr) {
  var lay = RCC.colLayers(Dd, 50, As, arr), Pmax = RCC.colPM(b, Dd, lay, 50 * Dd, fck, fy).P, Pt = -0.87 * fy * As / 1e3, pts = [];
  for (var i = 0; i <= 16; i++) { var P = Pt + (Pmax - Pt) * i / 16; pts.push([P, i === 16 ? 0 : RCC.colMcap(b, Dd, As, P, fck, fy, 50, arr)]); }
  return { pts: pts, Pmax: Pmax };
};
MD.pmGet = function (t, N) {
  var p = t.pts; if (N <= p[0][0]) return Math.max(p[0][1], 1e-3); if (N >= p[p.length - 1][0]) return 1e-3;
  for (var i = 1; i < p.length; i++) if (N <= p[i][0]) return Math.max(1e-3, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (N - p[i - 1][0]) / (p[i][0] - p[i - 1][0]));
  return 1e-3;
};
MD.secISMB = function (name, p) {
  var r = D.ISMB.filter(function (x) { return x.name.replace(/\s/g, "") === name.replace(/\s/g, ""); })[0];
  if (!r) return null;
  var fy = p.fys, Py = r.A * 100 * fy / D.gm0 / 1e3, Mp = fy * r.Zpx / D.gm0 / 1e3;
  var Zpy = (2 * r.tf * r.bf * r.bf / 4 + (r.D - 2 * r.tf) * r.tw * r.tw / 4) / 1e3, Mpy = fy * Math.min(Zpy, 1.2 * r.Iy * 2 / r.bf) / D.gm0 / 1e3;
  return { kind: "steel", shape: "I", name: r.name, row: r, E: 2e8, G: 7.69e7, A: r.A * 1e-4, Iz: r.Ix * 1e-8, Iy: r.Iy * 1e-8,
    J: (2 * r.bf * Math.pow(r.tf, 3) + (r.D - 2 * r.tf) * Math.pow(r.tw, 3)) / 3e12, gamma: 78.5, fy: fy, Zpy: Zpy,
    Mpz0: Mp, Mpz: function (N) { var n = Math.abs(N) / Py; return Math.max(1e-3, Math.min(Mp, 1.18 * Mp * (1 - n))); },
    Mpy: function (N) { var n = Math.abs(N) / Py; return Math.max(1e-3, Mpy * (1 - n * n)); }, Py: Py, Pt: Py, Pc: Py };
};
MD.secISA = function (name, p) {
  var r = D.ISA.filter(function (x) { return x.name.replace(/\s/g, "") === name.replace(/\s/g, ""); })[0];
  if (!r) return null;
  var A = r.A * 1e-4, I = A * Math.pow(r.rxx / 100, 2), fy = p.fys;
  return { kind: "steel", shape: "L", name: r.name, row: r, E: 2e8, G: 7.69e7, A: A, Iz: I, Iy: I, J: 2 * r.a * Math.pow(r.t, 3) / 3e12, gamma: 78.5, fy: fy,
    Mpz0: 1e9, Mpz: function () { return 1e9; }, Mpy: function () { return 1e9; }, Pt: r.A * 100 * fy / D.gm0 / 1e3, Pc: r.A * 100 * fy / D.gm0 / 1e3 };
};
MD.parseSec = function (txt, p, role) {
  var h = DXF.secHint(txt || "");
  if (!h) return null;
  if (h.kind === "ISMB") return MD.secISMB(h.name, p);
  if (h.kind === "ISA") return MD.secISA(h.name, p);
  if (h.kind === "RCC") return MD.secRCC(h.b, h.D, p, role);
  return null;
};

/* ---------- parametric generator ---------- */
MD.list = function (s) { return String(s || "").split(/[,\s]+/).map(Number).filter(function (x) { return x > 0; }); };
MD.generate = function (g) {
  var bx = MD.list(g.bx), by = g.twoD ? [] : MD.list(g.by), hs = MD.list(g.hs);
  if (!bx.length || !hs.length) throw new Error("Give at least one bay width and one storey height");
  var X = [0], Y = [0], Z = [0];
  bx.forEach(function (b) { X.push(X[X.length - 1] + b); }); by.forEach(function (b) { Y.push(Y[Y.length - 1] + b); }); hs.forEach(function (h) { Z.push(Z[Z.length - 1] + h); });
  var lines = [], faces = [];
  function P(x, y, z) { return { x: x, y: y, z: z }; }
  for (var k = 1; k < Z.length; k++) {
    for (var j = 0; j < Y.length; j++) for (var i = 0; i < X.length; i++) {
      lines.push({ a: P(X[i], Y[j], Z[k - 1]), b: P(X[i], Y[j], Z[k]), role: "column" });
      if (i + 1 < X.length) lines.push({ a: P(X[i], Y[j], Z[k]), b: P(X[i + 1], Y[j], Z[k]), role: "beam" });
      if (j + 1 < Y.length) lines.push({ a: P(X[i], Y[j], Z[k]), b: P(X[i], Y[j + 1], Z[k]), role: "beam" });
      if (g.slabs && i + 1 < X.length && j + 1 < Y.length) faces.push({ p: [P(X[i], Y[j], Z[k]), P(X[i + 1], Y[j], Z[k]), P(X[i + 1], Y[j + 1], Z[k]), P(X[i], Y[j + 1], Z[k])], kind: "slab" });
    }
    if (g.brace) {   /* X-bracing in the end bays of the outer frames */
      var ys = Y.length > 1 ? [Y[0], Y[Y.length - 1]] : [Y[0]], i2 = X.length - 2;
      ys.forEach(function (y) { [0, i2].filter(function (v, q, a) { return a.indexOf(v) === q; }).forEach(function (i) {
        lines.push({ a: P(X[i], y, Z[k - 1]), b: P(X[i + 1], y, Z[k]), role: "brace" }, { a: P(X[i + 1], y, Z[k - 1]), b: P(X[i], y, Z[k]), role: "brace" });
      }); });
    }
    if (g.walls && Y.length > 1) {   /* shear walls in the end bays along Y at both ends */
      [0, X.length - 1].forEach(function (i) { faces.push({ p: [P(X[i], Y[0], Z[k - 1]), P(X[i], Y[1], Z[k - 1]), P(X[i], Y[1], Z[k]), P(X[i], Y[0], Z[k])], kind: "wall" }); });
    }
  }
  /* emit as DXF-like entities so the same builder handles meshing/splitting */
  var ents = [];
  lines.forEach(function (l) { ents.push({ k: "line", layer: l.role.toUpperCase(), p: [[l.a.x, l.a.y, l.a.z], [l.b.x, l.b.y, l.b.z]] }); });
  faces.forEach(function (f) { ents.push({ k: "face", layer: f.kind.toUpperCase(), p: f.p.map(function (q) { return [q.x, q.y, q.z]; }) }); });
  if (g.twoD) ents.forEach(function (e) { e.p = e.p.map(function (q) { return [q[0], q[2], 0]; }); });
  return DXF.build({ ents: ents }, { mode: g.twoD ? "2d" : "3d", scale: 1, roles: {}, mesh: g.mesh || 1 });
};

/* ---------- member selection rules: "12", "1-12", "F20", "columns storey 1-2", "beams level 3.5", "layer BEAM" ---------- */
MD.select = function (m, sel) {
  var lv = MD.floorLevels(m), out = [], bad = null;
  function storey(e) { var z = Math.max(m.nodes[e.n1].z, m.nodes[e.n2].z); var i = -1, best = 1e9; lv.forEach(function (l, j) { if (Math.abs(l - z) < best) { best = Math.abs(l - z); i = j; } }); return i; }
  String(sel).split(",").forEach(function (part) {
    var t = part.trim(), mm; if (!t) return;
    if ((mm = t.match(/^f?\s*(\d+)(?:\s*(?:-|to)\s*f?\s*(\d+))?$/i))) { var a = +mm[1], b = mm[2] ? +mm[2] : a; for (var i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= m.frames.length) out.push(i - 1); return; }
    var low = t.toLowerCase(), type = /^col/.test(low) ? "column" : /^beam/.test(low) ? "beam" : /^brac/.test(low) ? "brace" : /^(all|member)/.test(low) ? null : undefined;
    if (type === undefined && !/^(storey|story|level|layer)/.test(low)) { bad = t; return; }
    var st = low.match(/stor(?:e)?y\s*(\d+)(?:\s*(?:-|to)\s*(\d+))?/), lz = low.match(/level\s*(-?[\d.]+)/), ly = t.match(/layer\s+(.+)$/i);
    m.frames.forEach(function (e, k) {
      if (type && e.type !== type) return;
      if (st) { var s = storey(e), a = +st[1], b = st[2] ? +st[2] : a; if (s < Math.min(a, b) || s > Math.max(a, b)) return; }
      if (lz && Math.abs(Math.max(m.nodes[e.n1].z, m.nodes[e.n2].z) - +lz[1]) > 0.02) return;
      if (ly && String(e.layer || "").toUpperCase() !== ly[1].trim().toUpperCase()) return;
      out.push(k);
    });
  });
  return { ids: out, bad: bad };
};
MD.rules = function (txt) {
  return String(txt || "").split(/\n/).map(function (l, i) { var j = l.search(/[=:]/); return j > 0 ? { sel: l.slice(0, j).trim(), val: l.slice(j + 1).trim(), line: i + 1 } : (l.trim() ? { err: true, line: i + 1, txt: l.trim() } : null); }).filter(Boolean);
};

/* ---------- analysis model from geometry + properties ---------- */
MD.make = function (geo, p) {
  var warn = [];
  var defs = { column: p.colSec, beam: p.beamSec, brace: p.braceSec };
  var cache = {};
  function sec(txt, role, layer) {
    var k = role + "|" + layer + "|" + txt; if (cache[k]) return cache[k];
    var s = MD.parseSec(layer, p, role) || MD.parseSec(txt, p, role);
    if (!s) { warn.push("Section '" + txt + "' not recognised for " + role + " - using 300x450 RCC"); s = MD.secRCC(300, 450, p, role); }
    return (cache[k] = s);
  }
  var m = { nodes: geo.nodes, sup: geo.sup, twoD: geo.twoD, frames: [], shells: [] };
  MD.supports(m, geo, p, warn);
  geo.frames.forEach(function (f) {
    var role = f.role === "brace" ? "brace" : f.role === "column" ? "column" : "beam";
    var s = sec(defs[role], role, f.layer || ""), src = MD.parseSec(f.layer || "", p, role) ? "DXF layer" : "default";
    var A = m.nodes[f.n1], B = m.nodes[f.n2], L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    var e = { n1: f.n1, n2: f.n2, type: role, sec: s, layer: f.layer, L: L, pinned: role === "brace", src: src };
    if (s.kind === "steel") {   /* member buckling capacity for pushover */
      var r = s.row, rmin = s.shape === "L" ? r.rvv : r.ry, curve = s.shape === "L" ? "c" : "b";
      var Pc = s.A * 1e6 * ST.fcd(Math.max(L * 1000 / (rmin * 10), 1), s.fy, curve) / 1e3;
      e.sec = Object.assign({}, s, { Pc: Pc });
    }
    m.frames.push(e);
  });
  /* user section overrides */
  MD.rules(p.secOver).forEach(function (r) {
    if (r.err) { warn.push("Section rule line " + r.line + " ignored (use 'which = section'): " + r.txt); return; }
    var se = MD.select(m, r.sel); if (se.bad) warn.push("Section rule line " + r.line + ": '" + se.bad + "' not understood");
    if (!se.ids.length) { warn.push("Section rule line " + r.line + " matches no members"); return; }
    se.ids.forEach(function (k) {
      var e = m.frames[k], s = MD.parseSec(r.val, p, e.type);
      if (!s) { warn.push("Section rule line " + r.line + ": '" + r.val + "' not recognised (use b×D mm, ISMB nnn or ISA a×a×t)"); return; }
      if (s.kind === "steel") { var rw = s.row, rmin = s.shape === "L" ? rw.rvv : rw.ry; s = Object.assign({}, s, { Pc: s.A * 1e6 * ST.fcd(Math.max(e.L * 1000 / (rmin * 10), 1), s.fy, s.shape === "L" ? "c" : "b") / 1e3 }); }
      e.sec = s; e.over = r.line; e.src = "rule line " + r.line;
    });
  });
  var Ec = 5000 * Math.sqrt(p.fck) * 1000;
  geo.shells.forEach(function (s) {
    var h = DXF.secHint(s.layer || ""), t = (h && h.kind === "T" ? h.t : s.kind === "wall" ? p.tWall : p.tSlab) / 1000;
    m.shells.push({ n: s.n, kind: s.kind, layer: s.layer, t: t, mat: { E: Ec * (p.crack ? (s.kind === "wall" ? 0.7 : 0.25) : 1), nu: 0.2, gamma: 25 } });
  });
  m.warn = (geo.warn || []).concat(warn);
  return m;
};

/* ---------- covers (IS 456 Table 16 / 16A, cl 26.4.2) and effective-depth offsets ---------- */
MD.EXPO = { mild: [20, 20], moderate: [30, 25], severe: [45, 30], "very severe": [50, 35], extreme: [75, 40] };   /* nominal cover, minimum grade (Table 5) */
MD.FIRE = { "0.5": [20, 20, 200, 75, 150], "1": [20, 20, 200, 95, 200], "1.5": [20, 20, 200, 110, 250], "2": [30, 25, 200, 125, 300], "3": [40, 35, 240, 150, 400], "4": [50, 45, 280, 170, 450] };   /* continuous beam / slab cover, beam width, slab t, column size (Table 16A, Fig. 1) */
MD.cover = function (p) {
  var e = MD.EXPO[p.exposure] || MD.EXPO.moderate, fr = MD.FIRE[String(p.fire || 1)] || MD.FIRE["1"], nom = e[0];
  var cb = Math.max(nom, fr[0]), cs = Math.max(nom, fr[1]), cc = Math.max(40, nom, 40), cf = Math.max(50, nom);
  return { nom: nom, minGrade: e[1], cb: cb, cs: cs, cc: cc, cf: cf, dB: cb + 20, dS: cs + 10, dC: Math.max(50, cc + 10), fire: fr, expo: p.exposure || "moderate", hrs: String(p.fire || 1) };
};
/* ---------- load cases ---------- */
MD.levels = function (m) {
  var zs = []; m.nodes.forEach(function (n) { var z = Math.round(n.z * 100) / 100; if (zs.indexOf(z) < 0) zs.push(z); });
  return zs.sort(function (a, b) { return a - b; });
};
MD.cases = function (m, p) {
  var zmax = -Infinity, zmin = Infinity; m.nodes.forEach(function (n) { zmax = Math.max(zmax, n.z); zmin = Math.min(zmin, n.z); });
  function isRoof(z) { return z > zmax - 0.05; }
  var DL = { self: 1, frameUDL: [], shellP: [] }, LL = { frameUDL: [], shellP: [] }, notes = [];
  m.frames.forEach(function (e, k) {
    if (e.type !== "beam") return;
    var A = m.nodes[e.n1], B = m.nodes[e.n2]; if (Math.abs(A.z - B.z) > 0.05 * e.L) return;   /* horizontal beams only */
    var roof = isRoof(A.z), wd = (roof ? p.parapet : p.wall) + p.bDL, wl = p.bLL * (roof ? 0 : 1) + (roof ? p.bLLr : 0);
    if (wd) DL.frameUDL.push({ e: k, w: [0, 0, -wd] }); if (wl) LL.frameUDL.push({ e: k, w: [0, 0, -wl] });
  });
  /* snow (IS 875 Part 4): s = μ·s0 on the roof, taken with roof imposed load as the larger of the two (not additive) */
  var snow = p.snow ? (p.mu > 0 ? p.mu : 0.8) * (p.s0 > 0 ? p.s0 : 1.5) : 0, llR = Math.max(p.llRoof, snow);
  if (snow) notes.push("Snow s = μ·s0 = " + (snow).toFixed(2) + " kN/m² " + (snow > p.llRoof ? "governs over" : "is less than") + " roof imposed load " + p.llRoof + " kN/m² (IS 875 Pt 4; the larger is applied)");
  /* pattern imposed load, IS 456 cl 22.4.1: alternate bays (checkerboard) when LL > ¾ DL, or always if chosen */
  var dlF = 25 * p.tSlab / 1000 + p.ff, pat = p.pattern === "on" || (p.pattern !== "off" && p.ll > 0.75 * dlF), xs = [], ys = [];
  if (pat) {
    m.frames.forEach(function (e) { if (e.type === "column") { var A = m.nodes[e.n1]; [[xs, A.x], [ys, A.y]].forEach(function (q) { var v = Math.round(q[1] * 1000) / 1000; if (!q[0].some(function (w) { return Math.abs(w - v) < 0.005; })) q[0].push(v); }); } });
    xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
    if (xs.length < 3 && ys.length < 3) pat = false;
  }
  function bay(a, v) { var i = 0; while (i + 1 < a.length && v > a[i + 1] - 1e-6) i++; return i; }
  var LP1 = { frameUDL: [], shellP: [] }, LP2 = { frameUDL: [], shellP: [] };
  m.shells.forEach(function (s, k) {
    if (s.kind !== "slab") return;
    var roof = isRoof(m.nodes[s.n[0]].z), q = roof ? llR : p.ll;
    DL.shellP.push({ e: k, q: [0, 0, -(roof ? p.ffRoof : p.ff)] });
    LL.shellP.push({ e: k, q: [0, 0, -q] });
    if (pat) { var cx = 0, cy = 0; s.n.forEach(function (i) { cx += m.nodes[i].x / 4; cy += m.nodes[i].y / 4; }); var par = (bay(xs, cx) + bay(ys, cy)) % 2; (par ? LP2 : LP1).shellP.push({ e: k, q: [0, 0, -q] }); }
  });
  if (pat) notes.push("Pattern imposed load (IS 456 cl 22.4.1): alternate-bay cases LP1/LP2 added" + (p.pattern === "on" ? "" : " because LL " + p.ll + " > ¾ DL " + (0.75 * dlF).toFixed(2) + " kN/m²"));
  MD.rules(p.loadOver).forEach(function (r) {
    if (r.err) { notes.push("Load rule line " + r.line + " ignored: " + r.txt); return; }
    var se = MD.select(m, r.sel), dl = 0, ll = 0, mm, re = /(DL|LL)\s*[:=]?\s*(-?[\d.]+)/gi, any = false;
    while ((mm = re.exec(r.val))) { any = true; if (mm[1].toUpperCase() === "DL") dl += +mm[2]; else ll += +mm[2]; }
    if (!any && isFinite(parseFloat(r.val))) dl = parseFloat(r.val);
    if (!se.ids.length) { notes.push("Load rule line " + r.line + " matches no members"); return; }
    se.ids.forEach(function (k) { if (dl) DL.frameUDL.push({ e: k, w: [0, 0, -dl] }); if (ll) LL.frameUDL.push({ e: k, w: [0, 0, -ll] }); });
  });
  var cases = { DL: DL, LL: LL };
  if (pat) {
    /* beam imposed loads: with slabs they stay in both patterns (the slabs carry the checkerboard); without slabs (2D frames) alternate spans */
    var hasSlab = m.shells.some(function (s) { return s.kind === "slab"; });
    LL.frameUDL.forEach(function (l) {
      if (hasSlab) { LP1.frameUDL.push(l); LP2.frameUDL.push(l); return; }
      var e = m.frames[l.e], A = m.nodes[e.n1], B = m.nodes[e.n2], par = (bay(xs, (A.x + B.x) / 2) + bay(ys, (A.y + B.y) / 2)) % 2;
      (par ? LP2 : LP1).frameUDL.push(l);
    });
    cases.LP1 = LP1; cases.LP2 = LP2;
  }
  /* seismic weights (IS 1893 cl 7.3): DL + 25%/50% of imposed, roof imposed excluded */
  var info = FE.prepare(m);
  var fd = FE.loadVector(m, DL, null).Ffull, fl = FE.loadVector(m, LL, null).Ffull, W = [], Wt = 0;
  var llf = p.ll > 3 ? 0.5 : 0.25;
  var sw = snow && p.snowW > 0 ? p.snowW / 100 * snow / Math.max(llR, 1e-9) : 0;   /* share of snow in the seismic weight (roof imposed otherwise excluded, IS 1893 cl 7.3) */
  m.nodes.forEach(function (n, i) { var w = -fd[6 * i + 2] - (isRoof(n.z) ? sw * fl[6 * i + 2] : llf * fl[6 * i + 2]); W.push(n.z - zmin > 0.01 ? w : 0); Wt += W[i]; });
  var H = zmax - zmin, dirs = m.twoD ? [0] : [0, 1], eq = {};
  if (p.eq) dirs.forEach(function (d) {
    var ext = 0, a = Infinity, b = -Infinity; m.nodes.forEach(function (n) { var v = d ? n.y : n.x; a = Math.min(a, v); b = Math.max(b, v); }); ext = Math.max(b - a, 1);
    var T = p.sys === "rc" ? 0.075 * Math.pow(H, 0.75) : p.sys === "steel" ? 0.085 * Math.pow(H, 0.75) : 0.09 * H / Math.sqrt(ext);
    var Sa = LD.saG(T, p.soil), Z = D.zone[p.zone], Ah = Z / 2 * Sa / (p.R / p.I), rho = { II: 0.007, III: 0.011, IV: 0.016, V: 0.024 }[p.zone];
    var Ahd = Math.max(Ah, rho), Vb = Ahd * Wt, pat = PO.pattern(m, W, d, "parabolic");
    var nm = "EQ" + (d ? "Y" : "X");
    cases[nm] = { nodal: pat.map(function (q) { var f = q.f.map(function (v) { return v * Vb; }); return { n: q.n, f: f }; }) };
    eq[nm] = { T: T, Sa: Sa, Ah: Ah, Ahd: Ahd, Vb: Vb, W: Wt, H: H, d: ext };
  });
  /* accidental torsion, IS 1893 cl 7.8.2: edi = 1.5 esi ± 0.05 bi. The 3D model already carries the natural
     eccentricity esi (loads at the masses, stiffness at the CR); the extra torque per floor is Qi·(0.5 esi + 0.05 bi)
     (case a, eccentricity increased) and Qi·(−0.05 bi) (case b), signed with esi. */
  var tor = null;
  if (p.eq && p.accTor !== false && !m.twoD && typeof SE !== "undefined") {
    try {
      var fl = SE.floors(m, W); SE.centres(m, W, fl); tor = { floors: fl, dir: {} };
      dirs.forEach(function (d) {
        var nm = "EQ" + (d ? "Y" : "X"), ld = cases[nm], ca = [], cb2 = [], rows = [];
        if (!ld) return;
        fl.forEach(function (f) {
          var Q = 0; ld.nodal.forEach(function (l) { if (f.nodes.indexOf(l.n) >= 0) Q += l.f[d]; });
          var es = d ? (f.esx || 0) : (f.esy || 0), b = d ? f.bx : f.by, sg = es >= -1e-6 ? 1 : -1;   /* |es| < 1 µm treated as 0 (symmetric plans) */
          var ea = 0.5 * es + 0.05 * b * sg, eb = -0.05 * b * sg;
          var Ma = (d ? 1 : -1) * Q * ea, Mb = (d ? 1 : -1) * Q * eb;   /* Fx at +y offset gives −Mz; Fy at +x offset gives +Mz */
          ca = ca.concat(SE.torque(m, f, Ma, W)); cb2 = cb2.concat(SE.torque(m, f, Mb, W));
          rows.push({ z: f.z, Q: Q, es: es, b: b, edA: 1.5 * es + 0.05 * b * sg, edB: es - 0.05 * b * sg, Ma: Ma, Mb: Mb });
        });
        cases["T" + (d ? "Y" : "X") + "a"] = { nodal: ca }; cases["T" + (d ? "Y" : "X") + "b"] = { nodal: cb2 };
        tor.dir[d] = rows;
      });
    } catch (e) { notes.push("Accidental torsion not applied: " + e.message); tor = null; }
  }
  var wind = {};
  if (p.wind) dirs.forEach(function (d) {
    var lv = MD.floorLevels(m), nm = "WL" + (d ? "Y" : "X"), nod = [], B = m.twoD ? p.trib : (function () { var a = Infinity, b = -Infinity; m.nodes.forEach(function (n) { var v = d ? n.x : n.y; a = Math.min(a, v); b = Math.max(b, v); }); return Math.max(b - a, 1); })();
    var Ftot = 0;
    lv.forEach(function (z, i) {
      if (i === 0) return;
      var hz = z - zmin, k2 = U.interp(D.k2h, D.k2[p.terrain], Math.max(10, Math.min(hz, 100)));
      var Vz = p.vb * k2, pz = 0.6 * Vz * Vz / 1000, pd = Math.max(0.9 * 0.8 * 0.9, 0.7) * pz;
      var hb = (z - lv[i - 1]) / 2 + (i + 1 < lv.length ? (lv[i + 1] - z) / 2 : 0);
      var F = p.cf * pd * B * hb, at = [];
      m.nodes.forEach(function (n, j) { if (Math.abs(n.z - z) < 0.01) at.push(j); });
      at.forEach(function (j) { var f = [0, 0, 0, 0, 0, 0]; f[d] = F / at.length; nod.push({ n: j, f: f }); });
      Ftot += F;
    });
    cases[nm] = { nodal: nod }; wind[nm] = { B: B, F: Ftot };
  });
  return { cases: cases, eq: eq, wind: wind, W: W, Wt: Wt, notes: notes, tor: tor, snow: snow, pattern: pat };
};
/* IS 456 Table 18 / IS 875 Part 5 combinations */
MD.combos = function (cases, method) {
  if (method === "wsm") return WS.combos(cases);
  var c = [{ name: "1.5(DL+LL)", f: { DL: 1.5, LL: 1.5 } }];
  if (cases.LP1) c.push({ name: "1.5(DL+LP1)", f: { DL: 1.5, LP1: 1.5 } }, { name: "1.5(DL+LP2)", f: { DL: 1.5, LP2: 1.5 } });
  MD.lateralSets(cases).forEach(function (L) {
    [1, -1].forEach(function (s) {
      var sg = s > 0 ? "+" : "-";
      function fx(base, k) { var o = Object.assign({}, base); Object.keys(L.f).forEach(function (cn) { o[cn] = k * s * L.f[cn]; }); return o; }
      c.push({ name: "1.2(DL+LL" + sg + L.name + ")", f: fx({ DL: 1.2, LL: 1.2 }, 1.2) });
      c.push({ name: "1.5(DL" + sg + L.name + ")", f: fx({ DL: 1.5 }, 1.5) });
      c.push({ name: "0.9DL" + sg + "1.5" + L.name, f: fx({ DL: 0.9 }, 1.5) });
    });
  });
  return c;
};
/* lateral load sets: EQX (with accidental-torsion variants EQX+TXa, EQX+TXb when present), EQY, WLX, WLY */
MD.lateralSets = function (cases) {
  var out = [];
  Object.keys(cases).filter(function (k) { return /^(EQ|WL)[XY]$/.test(k); }).forEach(function (L) {
    var d = L.charAt(2), ta = "T" + d + "a", tb = "T" + d + "b";
    if (/^EQ/.test(L) && cases[ta] && cases[tb]) {
      var a = {}; a[L] = 1; a[ta] = 1; var b = {}; b[L] = 1; b[tb] = 1;
      out.push({ name: L + "+" + ta, f: a, dir: d, base: L }, { name: L + "+" + tb, f: b, dir: d, base: L });
    } else { var o = {}; o[L] = 1; out.push({ name: L, f: o, dir: d, base: L }); }
  });
  return out;
};

/* ---------- design ---------- */
MD.design = function (m, res, p) {
  p = Object.assign({}, p, { twoD: m.twoD });
  var W = p.method === "wsm", inc = res.incMap || {};
  var out = { beams: [], cols: [], steel: [], slabs: [], walls: [], fails: 0 };
  m.frames.forEach(function (e, k) {
    var s = e.sec, pts = [];
    res.combos.forEach(function (cb) { FE.frameDiagram(cb.fr[k], 8).forEach(function (q) { q.cb = cb.name; q.inc = inc[cb.name] || 1; pts.push(q); }); });
    if (s.kind === "rcc" && e.type === "beam") out.beams.push(W ? WS.dBeam(e, k, s, pts, p) : MD.rccBeam(e, k, s, pts, p));
    else if (s.kind === "rcc") out.cols.push(W ? WS.dCol(e, k, s, pts, p) : MD.rccCol(e, k, s, pts, p, res));
    else out.steel.push(W ? WS.dSteel(e, k, s, pts, p) : MD.steelMem(e, k, s, pts, p));
  });
  m.shells.forEach(function (sh, k) {
    var env = { bx: 0, by: 0, tx: 0, ty: 0, Ncmax: 0, Ntmax: 0, tau: 0, w: 0 };
    res.combos.forEach(function (cb) {
      var f0 = cb.sh[k], ic = inc[cb.name] || 1, f = { Nx: f0.Nx / ic, Ny: f0.Ny / ic, Nxy: f0.Nxy / ic, Mx: f0.Mx / ic, My: f0.My / ic, Mxy: f0.Mxy / ic, R: f0.R };
      var wa = FE.woodArmer(-f.Mx, -f.My, f.Mxy);
      env.bx = Math.max(env.bx, wa.bx); env.by = Math.max(env.by, wa.by); env.tx = Math.min(env.tx, wa.tx); env.ty = Math.min(env.ty, wa.ty);
      if (sh.kind === "wall") {
        var c = f.R[0][2], sN = f.R[1][2], nv = f.Nx * c * c + f.Ny * sN * sN + 2 * f.Nxy * c * sN;
        var nh = f.Nx * sN * sN + f.Ny * c * c - 2 * f.Nxy * c * sN, nt = (f.Ny - f.Nx) * c * sN + f.Nxy * (c * c - sN * sN);
        env.Ncmax = Math.max(env.Ncmax, -nv); env.Ntmax = Math.max(env.Ntmax, nv, nh); env.tau = Math.max(env.tau, Math.abs(nt));
      }
    });
    out[sh.kind === "wall" ? "walls" : "slabs"].push(W ? WS.dShell(sh, k, env, p) : MD.shellDesign(sh, k, env, p));
  });
  ["beams", "cols", "steel", "slabs", "walls"].forEach(function (g) { out[g].forEach(function (r) { if (!r.ok) out.fails++; }); });
  return out;
};
MD.rccBeam = function (e, k, s, pts, p) {
  var cvr = MD.cover(p), b = s.b, Dd = s.D, d = Dd - cvr.dB, fck = s.fck, fy = s.fy;
  var Ms = 0, Mh = 0, V = 0, T = 0, My = 0, cs = "", ch = "";
  pts.forEach(function (q) { if (q.Mz > Ms) { Ms = q.Mz; cs = q.cb; } if (-q.Mz > Mh) { Mh = -q.Mz; ch = q.cb; } V = Math.max(V, Math.abs(q.Vy)); T = Math.max(T, Math.abs(q.T)); My = Math.max(My, Math.abs(q.My)); });
  /* IS 456 cl 41.4.2: equivalent moment & shear for torsion */
  var Mt = T * (1 + Dd / b) / 1.7, Ve = V + 1.6 * T / (b / 1000);
  var Mul = RCC.mulim(b, d, fck, fy), amin = 0.85 * b * d / fy, amax = 0.04 * b * Dd, dp = cvr.dB, ok = true, msg = [];
  /* singly / doubly reinforced (IS 456 Annex G-1.2) */
  function flex(M) {
    if (M <= Mul) { var a = RCC.astFlex(M, b, d, fck, fy); return { t: Math.max(a, amin), c: 0 }; }
    var xu = RCC.xumax(fy) * d, fsc = RCC.fs(0.0035 * (xu - dp) / xu, fy), fcc = 0.446 * fck;
    var Asc = (M - Mul) * 1e6 / ((fsc - fcc) * (d - dp)), Ast1 = RCC.astFlex(Mul * 0.99999, b, d, fck, fy);
    return { t: Ast1 + Asc * (fsc - fcc) / (0.87 * fy), c: Asc, dbl: true };
  }
  var fb = flex(Ms + Mt), ft = flex(Mh + Mt), Ab = Math.max(fb.t, ft.c), At = Math.max(ft.t, fb.c);
  if (fb.dbl || ft.dbl) msg.push("Doubly reinforced: Mu > Mu,lim = " + Mul.toFixed(1) + " kNm (compression steel included in the opposite face)");
  if (Ab + At > amax) { ok = false; msg.push("Total steel > 4% bD - increase section"); }
  var pt = 100 * At / (b * d), tv = Ve * 1000 / (b * d), tc = RCC.tauc(fck, Math.min(pt, 3)), tcm = RCC.taucmax(fck);
  var sv = null, Asv = 2 * Math.PI * 64 / 4;
  if (tv > tcm) { ok = false; msg.push("τve " + tv.toFixed(2) + " > τc,max " + tcm + " N/mm² - enlarge section"); }
  else {
    var b1 = b - 60, d1 = Dd - 70, Vus = Math.max(0, (tv - tc) * b * d);
    var svV = Vus > 0 ? 0.87 * fy * Asv * d / Vus : Infinity;
    var svT = T > 0.5 ? 0.87 * fy * Asv / (T * 1e6 / (b1 * d1) + V * 1e3 / (2.5 * d1)) : Infinity;      /* cl 41.4.3 */
    var svm = 0.87 * fy * Asv / (0.4 * b), lim = T > 0.5 ? Math.min(b1, (b1 + d1) / 4, 300) : Math.min(0.75 * d, 300);
    sv = Math.max(50, Math.floor(Math.min(svV, svT, svm, lim) / 5) * 5);
  }
  if (My > 0.1 * Math.max(Ms, Mh) && My > 2) msg.push("Lateral moment My " + My.toFixed(1) + " kNm - check biaxial bending");
  var xu0 = RCC.xumax(fy) * d, fsc = RCC.fs(0.0035 * (xu0 - dp) / xu0, fy);
  return { k: k, name: s.name, b: b, D: Dd, d: d, fck: fck, fy: fy, fsc: fsc, Mul: Mul, Mt: Mt, Ve: Ve, Ms: Ms, Mh: Mh, V: V, T: T, Ab: Ab, At: At, sv: sv, tv: tv, tc: tc, ok: ok, msg: msg, cs: cs, ch: ch,
    barsB: isNaN(Ab) ? "-" : U.pickBars(Ab, [12, 16, 20, 25], 2, Math.max(2, Math.floor((b - 50) / 40) + 1)).text, barsT: isNaN(At) ? "-" : U.pickBars(At, [12, 16, 20, 25], 2, Math.max(2, Math.floor((b - 50) / 40) + 1)).text };
};
MD.rccCol = function (e, k, s, pts, p, res) {
  var b = s.b, Dd = s.D, fck = s.fck, fy = s.fy, L = e.L * 1000, Ag = b * Dd;
  var exz = Math.max(L / 500 + Dd / 30, 20) / 1000, exy = Math.max(L / 500 + b / 30, 20) / 1000;
  var le = (p.kcol || 1.2) * L, slz = le / Dd, sly = le / b, crit = null, need = null;
  /* governing (P, Mz, My) points: column ends of every combination */
  var cand = pts.filter(function (q, i) { return i % 9 === 0 || i % 9 === 8; });
  /* early exit: the points are checked most-critical first, and a failing trial stops at the first point with r > 1 */
  var rank = null;
  function evalP(pcv, quick) {
    var As = pcv / 100 * Ag, Puz = (0.45 * fck * (Ag - As) + 0.75 * fy * As) / 1000, worst = 0, wq = null, rs = rank ? null : [];
    (rank || cand).some(function (q) {
      var Pu = Math.max(-q.N, 0);
      var Maz = slz > 12 ? Pu * Dd / 2000 * slz * slz / 1000 : 0, May = sly > 12 ? Pu * b / 2000 * sly * sly / 1000 : 0;
      var Mz = Math.max(Math.abs(q.Mz), Pu * exz) + Maz, My = Math.max(Math.abs(q.My), Pu * exy) + May;
      if (Pu > 0.98 * Puz) { if (9 > worst) { worst = 9; wq = { cb: q.cb, Pu: Pu, Mz: Mz, My: My, an: 2, M1: 1e-6, M2: 1e-6, Mz0: Math.abs(q.Mz), My0: Math.abs(q.My), Maz: Maz, May: May, Puz: Puz }; } if (rs) rs.push([q, 9]); return quick && worst > 1; }
      var dC = MD.cover(p).dC, M1 = RCC.colMcap(b, Dd, As, Pu, fck, fy, dC, "four"), M2 = m2d() ? RCC.colMcap(Dd, b, As, Pu, fck, fy, dC, "four") : 1;
      var an = Math.max(1, Math.min(2, 1 + (Pu / Puz - 0.2) / 0.6)), r = Math.pow(Mz / Math.max(M1, 1e-6), an) + (m2d(My) ? Math.pow(My / Math.max(M2, 1e-6), an) : 0);
      if (rs) rs.push([q, r]);
      if (r > worst) { worst = r; wq = { cb: q.cb, Pu: Pu, Mz: Mz, My: My, an: an, M1: M1, M2: M2, Mz0: Math.abs(q.Mz), My0: Math.abs(q.My), Maz: Maz, May: May, Puz: Puz }; }
      return quick && worst > 1;
    });
    if (rs) rank = rs.sort(function (a, b2) { return b2[1] - a[1]; }).map(function (x) { return x[0]; });
    return { pc: pcv, As: As, r: worst, q: wq };
  }
  /* coarse scan in 0.2 % steps, then bisection to 0.01 % between the last failing and first passing value */
  var lo = null;
  for (var pc = 0.8; pc <= 4.0001 && need === null; pc += 0.2) {
    var t = evalP(pc, !!rank);
    if (t.r <= 1) need = t; else { lo = pc; crit = t; }
  }
  if (need && lo !== null) {
    var hi = need.pc;
    while (hi - lo > 0.01) { var mid = (lo + hi) / 2, tm = evalP(mid, true); if (tm.r <= 1) { hi = mid; need = tm; } else lo = mid; }
  }
  if (need) {   /* verify again with the bars actually provided */
    var pb = U.pickBars(need.As, [12, 16, 20, 25, 32], 4, 24), chk = evalP(100 * pb.area / Ag);
    need.prov = { area: pb.area, pc: 100 * pb.area / Ag, r: chk.r, text: pb.text };
    if (chk.r > 1) need = null;
  }
  function m2d() { return !p.twoD; }
  var msg = [];
  if (slz > 12 || sly > 12) msg.push("Slender (le/D = " + slz.toFixed(1) + ", le/b = " + sly.toFixed(1) + ") - additional moments cl 39.7.1 included");
  if (!need) msg.push("Fails even at 4% steel - enlarge section");
  var Pmax = 0; pts.forEach(function (q) { Pmax = Math.max(Pmax, -q.N); });
  return { k: k, name: s.name, b: b, D: Dd, L: L, le: le, exz: exz, exy: exy, fck: fck, fy: fy, Pu: Pmax, need: need, crit: crit, ok: !!need, msg: msg, bars: need ? need.prov.text : "-" };
};
MD.steelMem = function (e, k, s, pts, p) {
  var r = s.row, fy = s.fy, L = e.L * 1000, A = s.A * 1e6, msg = [], ok = true, worst = 0, wq = null;
  if (s.shape === "L") {
    var Pc = A * ST.fcd(L / (r.rvv * 10), fy, "c") / 1e3, Pt = A * fy / D.gm0 / 1e3;
    pts.forEach(function (q) { var u = q.N < 0 ? -q.N / Pc : q.N / Pt; if (u > worst) { worst = u; wq = q; } });
    if (L / (r.rvv * 10) > 180) { msg.push("KL/r = " + (L / (r.rvv * 10)).toFixed(0) + " > 180 (IS 800 Table 3) - tension-only bracing"); }
    return { k: k, name: s.name, ratio: worst, ok: worst <= 1, msg: msg, txt: "Pd,c = " + Pc.toFixed(1) + " kN, Td = " + Pt.toFixed(1) + " kN", cb: wq && wq.cb, Pd: Pc, Td: Pt, Mdz: 0, Mdy: 0, q: wq, L: L, KLr: L / (r.rvv * 10) };
  }
  /* ---- IS 800:2007 I-section: cl 7.1.2 buckling, 8.2.2 LTB, 8.4 shear, 9.2.2 high shear, 9.3.1.1 section strength, 9.3.2.2 member buckling ---- */
  var K = e.type === "column" ? (p.kcol || 1.2) : 1, KL = K * L, lz = KL / (r.rx * 10), ly = KL / (r.ry * 10);
  var lamz = ST.lamND(lz, fy), lamy = ST.lamND(ly, fy);
  var Pdz = A * ST.fcd(lz, fy, "a") / 1e3, Pdy = A * ST.fcd(ly, fy, "b") / 1e3, Pd = Math.min(Pdz, Pdy), Nd = A * fy / D.gm0 / 1e3, Td = Nd;
  var eps = ST.eps(fy), bt = (r.bf / 2) / r.tf, dt = (r.D - 2 * r.tf) / r.tw;
  var cls = (bt <= 9.4 * eps && dt <= 84 * eps) ? "Plastic" : (bt <= 10.5 * eps && dt <= 105 * eps) ? "Compact" : "Semi-compact", bb = cls === "Semi-compact" ? r.Zex / r.Zpx : 1;
  var Iy = r.Iy * 1e4, It = s.J * 1e12, hf = r.D - r.tf, Iw = Iy * hf * hf / 4, E = 2e5, G = 76900, LLT = L;
  var Mcr = Math.PI * Math.PI * E * Iy / (LLT * LLT) * Math.sqrt(Iw / Iy + G * It * LLT * LLT / (Math.PI * Math.PI * E * Iy)) / 1e6;
  var MdzS = Math.min(bb * fy * r.Zpx / 1e3, 1.2 * fy * r.Zex / 1e3) / D.gm0;                    /* section, cl 8.2.1.2 */
  var lLT = Math.sqrt(bb * fy * r.Zpx / 1e3 / Mcr), phi = 0.5 * (1 + 0.21 * (lLT - 0.2) + lLT * lLT);
  var chi = Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi * phi - lLT * lLT, 0)))), Mdz = Math.min(chi * bb * fy * r.Zpx / 1e3 / D.gm0, MdzS);   /* LTB, cl 8.2.2 */
  var Mdy = fy * s.Zpy / 1e3 / D.gm0;
  var Vd = r.D * r.tw * fy / (Math.sqrt(3) * D.gm0) / 1e3, Mfd = r.bf * r.tf * (r.D - r.tf) * fy / D.gm0 / 1e6, Vmax = 0, best = null;
  function Mv(M, V) {   /* cl 9.2.2 */
    if (V <= 0.6 * Vd) return M;
    var beta = Math.pow(2 * V / Vd - 1, 2);
    return cls === "Semi-compact" ? Math.min(M, fy * r.Zex / 1e3 / D.gm0) : Math.max(0, M - beta * Math.max(0, M - Mfd));
  }
  function Cm(a) {   /* IS 800 Table 18: linear moment 0.6 + 0.4ψ ≥ 0.4; transverse load 0.95 */
    var m1 = a[0], m2 = a[a.length - 1], me = Math.max(Math.abs(m1), Math.abs(m2)), mi = 0;
    a.forEach(function (x) { mi = Math.max(mi, Math.abs(x)); });
    if (mi < 1e-6) return 1;
    if (mi > 1.05 * me) return 0.95;
    var psi = Math.abs(m1) >= Math.abs(m2) ? (Math.abs(m1) > 1e-9 ? m2 / m1 : 0) : m1 / m2;
    return Math.max(0.4, 0.6 + 0.4 * psi);
  }
  for (var c0 = 0; c0 < pts.length; c0 += 9) {
    var g = pts.slice(c0, c0 + 9), P = 0, T = 0, Mz = 0, My = 0, V = 0, sec = 0, sq = null;
    g.forEach(function (q) {
      P = Math.max(P, -q.N); T = Math.max(T, q.N); Mz = Math.max(Mz, Math.abs(q.Mz)); My = Math.max(My, Math.abs(q.My)); V = Math.max(V, Math.abs(q.Vy)); Vmax = Math.max(Vmax, Math.abs(q.Vy));
      /* section strength at every point, cl 9.3.1.1 */
      var n = Math.abs(q.N) / Nd, MdzV = Mv(MdzS, Math.abs(q.Vy)), Mndz = Math.min(MdzV, 1.11 * MdzV * (1 - n)), Mndy = n <= 0.2 ? Mdy : Math.min(Mdy, 1.56 * Mdy * (1 - n) * (n + 0.6)), a1 = Math.max(1, 5 * n);
      var us = n >= 1 ? n : Math.pow(Math.abs(q.My) / Math.max(Mndy, 1e-9), a1) + Math.pow(Math.abs(q.Mz) / Math.max(Mndz, 1e-9), 2);
      if (us > sec) { sec = us; sq = { n: n, Mndz: Mndz, Mndy: Mndy, a1: a1, MdzV: MdzV, q: q }; }
    });
    var Cmz = Cm(g.map(function (q) { return q.Mz; })), Cmy = Cm(g.map(function (q) { return q.My; })), CmLT = Cmz, u1 = 0, u2 = 0, ny = 0, nz = 0, Ky = 1, Kz = 1, KLT = 1;
    if (P > 1e-6) {   /* member buckling, cl 9.3.2.2 */
      ny = P / Pdy; nz = P / Pdz;
      Ky = Math.min(1 + (lamy - 0.2) * ny, 1 + 0.8 * ny); Kz = Math.min(1 + (lamz - 0.2) * nz, 1 + 0.8 * nz);
      KLT = Math.max(1 - 0.1 * lLT * ny / (CmLT - 0.25), 1 - 0.1 * ny / (CmLT - 0.25));
      u1 = P / Pdy + Ky * Cmy * My / Mdy + KLT * Mz / Mdz;
      u2 = P / Pdz + 0.6 * Ky * Cmy * My / Mdy + Kz * Cmz * Mz / Mdz;
    } else { u1 = Mz / Mdz + My / Mdy; u2 = T / Td; }   /* tension: LTB with tension relief ignored (conservative), cl 9.3.2.1 */
    var u = Math.max(sec, u1, u2);
    if (!best || u > best.u) best = { u: u, cb: g[0].cb, P: P, T: T, Mz: Mz, My: My, V: V, sec: sec, sq: sq, u1: u1, u2: u2, ny: ny, nz: nz, Ky: Ky, Kz: Kz, KLT: KLT, Cmy: Cmy, Cmz: Cmz,
      gov: u === sec ? "section strength cl 9.3.1.1" : u === u1 ? (P > 0 ? "member buckling cl 9.3.2.2 (y)" : "LTB cl 9.3.2.1") : (P > 0 ? "member buckling cl 9.3.2.2 (z)" : "tension cl 6") };
  }
  worst = best ? best.u : 0;
  wq = best ? { cb: best.cb, N: best.P > 0 ? -best.P : best.T, Mz: best.Mz, My: best.My } : null;
  if (Vmax > 0.6 * Vd) msg.push("High shear V = " + Vmax.toFixed(1) + " > 0.6Vd: moment capacity reduced per cl 9.2.2");
  if (Vmax > Vd) { ok = false; msg.push("Shear V > Vd (cl 8.4)"); }
  if (e.type === "column" && Math.max(lz, ly) > 180) { ok = false; msg.push("KL/r > 180 (Table 3)"); }
  return { k: k, name: s.name, ratio: worst, ok: ok && worst <= 1, msg: msg, cb: wq && wq.cb, Pd: Pd, Pdy: Pdy, Pdz: Pdz, Nd: Nd, Td: Td, Mdz: Mdz, MdzS: MdzS, Mdy: Mdy, Vd: Vd, Vmax: Vmax, Mfd: Mfd, chi: chi, lLT: lLT, Mcr: Mcr, cls: cls,
    lamy: lamy, lamz: lamz, K: K, q: wq, b: best, L: L, KLr: Math.max(lz, ly),
    txt: "Pdy = " + Pdy.toFixed(0) + ", Pdz = " + Pdz.toFixed(0) + " kN, Md,z = " + Mdz.toFixed(1) + " kNm (χLT " + chi.toFixed(2) + "), Md,y = " + Mdy.toFixed(1) + " kNm, Vd = " + Vd.toFixed(0) + " kN; governs: " + (best ? best.gov : "-") };
};
MD.shellDesign = function (sh, k, env, p) {
  var cvs = MD.cover(p), t = sh.t * 1000, dx = t - cvs.dS, dy = dx - 10, fck = p.fck, fy = p.fy, msg = [], ok = true;
  var amin = (sh.kind === "wall" ? 0.0025 : (fy > 250 ? 0.0012 : 0.0015)) * 1000 * t;
  function A(M, d) { var a = RCC.astFlex(Math.abs(M), 1000, d, fck, fy); if (isNaN(a)) { ok = false; return NaN; } return Math.max(a, amin); }
  var r = { k: k, kind: sh.kind, t: t, dx: dx, dy: dy, amin: amin, bx: env.bx, by: env.by, tx: env.tx, ty: env.ty, Abx: A(env.bx, dx), Aby: A(env.by, dy), Atx: A(env.tx, dx), Aty: A(env.ty, dy) };
  if (sh.kind === "wall") {
    var sc = env.Ncmax / t, tau = env.tau / t, tmax = RCC.taucmax(fck);
    r.sc = sc; r.tau = tau; r.Ast = Math.max(env.Ntmax * 1000 / (0.87 * fy), amin);
    if (sc > 0.4 * fck) { ok = false; msg.push("Compression " + sc.toFixed(2) + " > 0.4fck"); }
    if (tau > Math.min(0.17 * fck, tmax)) { ok = false; msg.push("In-plane shear " + tau.toFixed(2) + " N/mm² exceeds limit"); }
  }
  r.ok = ok; r.msg = msg; return r;
};
/* Storey drift at corresponding locations (IS 1893 cl 7.11.1): for every node of a floor, the node directly below it
   (same plan position, else the nearest one on the floor below) gives Δ = |u_top − u_bottom| / h. The governing (largest)
   location is reported, with the plan-torsion indicator Δmax/Δave of floor displacements (IS 1893 Table 5 (i)). */
/* floor levels: base + levels that carry horizontal beams or slabs (excludes intermediate wall-mesh rows) */
MD.floorLevels = function (m) {
  var zs = [], zmin = Infinity;
  function add(z) { z = Math.round(z * 100) / 100; if (zs.indexOf(z) < 0) zs.push(z); }
  m.nodes.forEach(function (n) { zmin = Math.min(zmin, n.z); });
  m.frames.forEach(function (e) { var A = m.nodes[e.n1], B = m.nodes[e.n2]; if (Math.abs(A.z - B.z) < 0.01 && e.type !== "column") add(A.z); });
  m.shells.forEach(function (s) { if (s.kind === "slab") s.n.forEach(function (i) { add(m.nodes[i].z); }); });
  if (!zs.length) return MD.levels(m);
  add(zmin);
  return zs.sort(function (a, b) { return a - b; });
};
MD.drift = function (m, res) {
  var lv = MD.floorLevels(m), out = [], byLev = lv.map(function (z) { return m.nodes.map(function (n, j) { return j; }).filter(function (j) { return Math.abs(m.nodes[j].z - z) < 0.01; }); });
  MD.lateralSets(res.cases).forEach(function (Ls) {
    var c = Ls.name, d = Ls.dir === "Y" ? 1 : 0, U = new Float64Array(6 * m.nodes.length);
    Object.keys(Ls.f).forEach(function (cn) { var u = res.cases[cn].U; for (var q = 0; q < U.length; q++) U[q] += Ls.f[cn] * u[q]; });
    for (var i = 1; i < lv.length; i++) {
      var h = lv[i] - lv[i - 1], top = byLev[i], bot = byLev[i - 1], best = null, umax = -Infinity, umin = Infinity, nPair = 0, exact = 0;
      if (!top.length || !bot.length) continue;
      var pairs = top.map(function (j) {
        var A = m.nodes[j], k = -1, dmin = Infinity;
        bot.forEach(function (q) { var B = m.nodes[q], dd = Math.hypot(A.x - B.x, A.y - B.y); if (dd < dmin) { dmin = dd; k = q; } });
        return [j, k, dmin];
      }).filter(function (x) { return x[1] >= 0; });
      var ex = pairs.filter(function (x) { return x[2] < 0.01; });
      if (ex.length) pairs = ex;          /* use vertically stacked node pairs whenever they exist */
      pairs.forEach(function (pr) {
        var j = pr[0], k = pr[1], dmin = pr[2];
        nPair++; if (dmin < 0.01) exact++;
        var dr = Math.abs(U[6 * j + d] - U[6 * k + d]) / h;
        if (!best || dr > best.dr) best = { dr: dr, top: j, bot: k, ut: U[6 * j + d], ub: U[6 * k + d], off: dmin };
        var ut = Math.abs(U[6 * j + d]); umax = Math.max(umax, ut); umin = Math.min(umin, ut);
      });
      if (!best) continue;
      var eq = /^EQ/.test(c), dave = (umax + umin) / 2;
      out.push({ c: c, z: lv[i], zb: lv[i - 1], h: h, d: Math.max(Math.abs(best.ut), Math.abs(best.ub)), dr: best.dr, top: best.top, bot: best.bot, ut: best.ut, ub: best.ub, stacked: best.off < 0.01, pairs: nPair, exact: exact,
        tr: dave > 1e-12 ? umax / dave : 1, ok: !eq || best.dr <= 0.004, lim: eq ? 0.004 : null });
    }
  });
  return out;
};

if (typeof module !== "undefined") module.exports = MD;

/* support conditions: base condition for the generated / default-fixed bases, then per-node rules ("N12 = pinned", "3-5 = roller").
   Restraint vector [ux, uy, uz, rx, ry, rz], z vertical. Spring base: vertical and rocking springs of a footing on soil,
   Kv = ks·B·L, Kθ = ks·I (IS 2950 Pt 1 modulus of subgrade reaction), horizontal and torsion held. */
MD.SUPS = { fixed: [1, 1, 1, 1, 1, 1], pinned: [1, 1, 1, 0, 0, 0], roller: [0, 0, 1, 0, 0, 0], spring: [1, 1, 0, 0, 0, 1], guided: [1, 1, 0, 1, 1, 1] };
MD.SUP_OPTS = [["fixed", "Fixed"], ["pinned", "Pinned (hinged)"], ["roller", "Roller (vertical only)"], ["spring", "Spring (footing on soil)"], ["guided", "Guided (slides vertically)"], ["free", "Free (no support)"]];
MD.springOf = function (p) {
  var ks = +p.ksoil > 0 ? +p.ksoil : 40000, B = +p.fB > 0 ? +p.fB : 2, L = +p.fL > 0 ? +p.fL : 2;
  return [0, 0, ks * B * L, ks * L * Math.pow(B, 3) / 12, ks * B * Math.pow(L, 3) / 12, 0];   /* L along X, B along Y: rocking about X uses B³, about Y uses L³ */
};
MD.supRules = function (txt) {
  var out = [];
  String(txt || "").split(/\n/).forEach(function (ln, i) {
    var t = ln.replace(/#.*/, "").trim(); if (!t) return;
    var mm = t.match(/^(.+?)=\s*([a-z]+)\s*$/i), nodes = [];
    if (!mm) { out.push({ err: true, line: i + 1, txt: t }); return; }
    mm[1].split(/[,\s]+/).forEach(function (q) { q = q.replace(/^n/i, ""); var r = q.match(/^(\d+)(?:-(\d+))?$/); if (r) for (var k = +r[1]; k <= +(r[2] || r[1]); k++) nodes.push(k - 1); });
    var ty = mm[2].toLowerCase().replace(/^hinged?$/, "pinned").replace(/^pin$/, "pinned");
    if (!nodes.length || !(MD.SUPS[ty] || ty === "free")) { out.push({ err: true, line: i + 1, txt: t }); return; }
    out.push({ nodes: nodes, type: ty, line: i + 1 });
  });
  return out;
};
MD.supports = function (m, geo, p, warn) {
  var sup = {}, spr = {}, base = p.base || "fixed", K = MD.springOf(p), types = {};
  Object.keys(geo.sup || {}).forEach(function (k) {
    var r = geo.sup[k], allFix = r.every(function (x) { return !!x; });
    if (allFix && base !== "fixed" && MD.SUPS[base]) { sup[k] = MD.SUPS[base].slice(); types[k] = base; if (base === "spring") spr[k] = K.slice(); }
    else { sup[k] = r.slice(); types[k] = allFix ? "fixed" : r[3] || r[4] ? "partial" : r[0] ? "pinned" : "roller"; }
  });
  MD.supRules(p.supOver).forEach(function (r) {
    if (r.err) { warn.push("Support rule line " + r.line + " ignored (use e.g. 'N12 = pinned', '3-5 = roller', 'N7 = spring' or 'N9 = free'): " + r.txt); return; }
    r.nodes.forEach(function (v) {
      if (v < 0 || v >= m.nodes.length) { warn.push("Support rule line " + r.line + ": node " + (v + 1) + " does not exist"); return; }
      delete spr[v]; delete types[v];
      if (r.type === "free") { delete sup[v]; return; }
      sup[v] = MD.SUPS[r.type].slice(); types[v] = r.type; if (r.type === "spring") spr[v] = K.slice();
    });
  });
  m.sup = sup; m.supType = types; if (Object.keys(spr).length) m.spr = spr;
  if (!Object.keys(sup).length) warn.push("No supports left — the model is a mechanism; restore a support (Support rules).");
};
