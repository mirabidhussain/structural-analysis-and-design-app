/* DXF import: ASCII DXF (R12 - R2018). Reads LINE, LWPOLYLINE, POLYLINE/VERTEX, 3DFACE, SOLID, POINT, CIRCLE.
   Builds an analysis model: frames from lines, shell meshes from faces / closed 4-sided polylines, supports from points. */
var DXF = {};
DXF.UNITS = { 0: null, 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };

DXF.parse = function (text) {
  var L = text.split(/\r?\n/), pairs = [];
  for (var i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i].trim(), 10), L[i + 1].trim()]);
  var units = null, ents = [], warn = [], layers = {}, skipped = {}, sec = null, cur = null, poly = null, texts = [];
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function flush() {
    if (!cur) return;
    var e = cur; cur = null;
    if (e.t === "VERTEX") { if (poly) { if (e.f & 128 && !(e.f & 64)) { poly.faces.push([e.i71, e.i72, e.i73, e.i74]); } else poly.v.push([e.x, e.y, e.z + poly.elev]); } return; }
    if (e.t === "SEQEND") { if (poly) finishPoly(poly); poly = null; return; }
    if (e.t === "POLYLINE") { poly = { layer: e.layer, closed: !!(e.f & 1), mesh: !!(e.f & 64), v: [], faces: [], elev: e.z || 0 }; return; }
    layers[e.layer] = (layers[e.layer] || 0) + 1;
    if (e.t === "LINE") ents.push({ k: "line", layer: e.layer, p: [[e.x, e.y, e.z], [e.x1, e.y1, e.z1]] });
    else if (e.t === "LWPOLYLINE") addPoly(e.layer, e.v.map(function (v) { return [v[0], v[1], e.elev || 0]; }), !!(e.f & 1));
    else if (e.t === "3DFACE") { var p = [[e.x, e.y, e.z], [e.x1, e.y1, e.z1], [e.x2, e.y2, e.z2], [e.x3, e.y3, e.z3]]; ents.push({ k: "face", layer: e.layer, p: dedupe(p) }); }
    else if (e.t === "SOLID") { var s = [[e.x, e.y, e.z], [e.x1, e.y1, e.z1], [e.x3, e.y3, e.z3], [e.x2, e.y2, e.z2]]; ents.push({ k: "face", layer: e.layer, p: dedupe(s) }); }
    else if (e.t === "POINT" || e.t === "CIRCLE") ents.push({ k: "point", layer: e.layer, p: [[e.x, e.y, e.z]], r: e.t === "CIRCLE" ? e.r || 0 : 0 });
    else if (e.t === "TEXT" || e.t === "MTEXT") { layers[e.layer]--; if (!layers[e.layer]) delete layers[e.layer]; var tx = String(e.s || "").replace(/\\P/g, " ").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "").trim(); if (tx) texts.push({ k: "text", layer: e.layer, p: [[e.x, e.y, e.z]], t: tx }); }
  }
  function dedupe(p) { var o = []; p.forEach(function (q) { if (!o.some(function (r) { return Math.hypot(r[0] - q[0], r[1] - q[1], r[2] - q[2]) < 1e-9; })) o.push(q); }); return o; }
  function addPoly(layer, v, closed) {
    if (v.length < 2) return;
    ents.push({ k: "poly", layer: layer, p: v, closed: closed });
  }
  function finishPoly(p) {
    layers[p.layer] = (layers[p.layer] || 0) + 1;
    if (p.mesh) { p.faces.forEach(function (f) { var q = f.filter(function (i) { return i; }).map(function (i) { return p.v[Math.abs(i) - 1]; }).filter(Boolean); if (q.length >= 3) ents.push({ k: "face", layer: p.layer, p: dedupe(q) }); }); return; }
    addPoly(p.layer, p.v, p.closed);
  }
  var ENT = { LINE: 1, LWPOLYLINE: 1, POLYLINE: 1, VERTEX: 1, SEQEND: 1, "3DFACE": 1, SOLID: 1, POINT: 1, CIRCLE: 1, TEXT: 1, MTEXT: 1 };
  var lastVar = null;
  pairs.forEach(function (pr) {
    var c = pr[0], v = pr[1];
    if (c === 0) {
      flush();
      if (v === "SECTION") { sec = "?"; return; }
      if (v === "ENDSEC") { sec = null; return; }
      if (sec === "ENTITIES" || sec === "BLOCKS_IGNORED") {
        if (ENT[v]) cur = { t: v, layer: "0", x: 0, y: 0, z: 0, x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0, x3: 0, y3: 0, z3: 0, f: 0, v: [], elev: 0 };
        else if (v !== "EOF") skipped[v] = (skipped[v] || 0) + 1;
      }
      return;
    }
    if (c === 2 && sec === "?") { sec = v; return; }
    if (sec === "HEADER") { if (c === 9) lastVar = v; else if (lastVar === "$INSUNITS" && c === 70) units = parseInt(v, 10); return; }
    if (!cur) return;
    switch (c) {
      case 8: cur.layer = v; break;
      case 1: if (cur.t === "TEXT" || cur.t === "MTEXT") cur.s = (cur.s || "") + v; break;
      case 3: if (cur.t === "MTEXT") cur.s = (cur.s || "") + v; break;
      case 40: cur.r = num(v); break;
      case 10: if (cur.t === "LWPOLYLINE") cur.v.push([num(v), 0]); else cur.x = num(v); break;
      case 20: if (cur.t === "LWPOLYLINE") cur.v[cur.v.length - 1][1] = num(v); else cur.y = num(v); break;
      case 30: cur.z = num(v); break;
      case 11: cur.x1 = num(v); break; case 21: cur.y1 = num(v); break; case 31: cur.z1 = num(v); break;
      case 12: cur.x2 = num(v); break; case 22: cur.y2 = num(v); break; case 32: cur.z2 = num(v); break;
      case 13: cur.x3 = num(v); break; case 23: cur.y3 = num(v); break; case 33: cur.z3 = num(v); break;
      case 38: cur.elev = num(v); break;
      case 70: cur.f = parseInt(v, 10) || 0; break;
      case 71: cur.i71 = parseInt(v, 10); break; case 72: cur.i72 = parseInt(v, 10); break;
      case 73: cur.i73 = parseInt(v, 10); break; case 74: cur.i74 = parseInt(v, 10); break;
    }
  });
  flush();
  Object.keys(skipped).forEach(function (k) { warn.push(skipped[k] + " " + k + " entit" + (skipped[k] > 1 ? "ies" : "y") + " ignored" + (k === "INSERT" ? " (explode blocks before export)" : k === "ARC" ? " (curved members not supported)" : "")); });
  if (!ents.length) warn.push("No LINE / POLYLINE / 3DFACE entities found in the ENTITIES section.");
  return { units: units, ents: ents, layers: layers, warn: warn, texts: texts };
};

/* default role from layer name */
DXF.guessRole = function (name) {
  var s = name.toUpperCase();
  if (/ROLL/.test(s)) return "roller";
  if (/SUPP|FIX|BASE|RESTR/.test(s)) return /PIN|HINGE/.test(s) ? "pin" : "fixed";
  if (/PIN|HINGE/.test(s)) return "pin";
  if (/SLAB|FLOOR|ROOF|DECK|PLATE/.test(s)) return "slab";
  if (/WALL|SHEAR|CORE/.test(s)) return "wall";
  if (/BRAC|TRUSS|DIAG|ISA/.test(s)) return "brace";
  if (/COL/.test(s)) return "column";
  if (/BEAM|BM|GIRD|RAFT|PURL|ISMB/.test(s)) return "beam";
  if (/DIM|TEXT|ANNO|GRID|AXIS|HATCH|DEFPOINT|TITLE|BORDER/.test(s)) return "ignore";
  return "auto";
};
/* section hint in a layer name: "COL_300x450", "B 230X400", "ISMB300", "ISA 65x65x6", "SLAB150", "WALL 200" */
DXF.secHint = function (name) {
  var s = name.toUpperCase().replace(/\s+/g, ""), m;
  if ((m = s.match(/ISA(\d+)X(\d+)X(\d+)/))) return { kind: "ISA", name: "ISA " + m[1] + "x" + m[2] + "x" + m[3] };
  if ((m = s.match(/ISMB(\d+)/))) return { kind: "ISMB", name: "ISMB " + m[1] };
  if ((m = s.match(/(\d{2,4})[X×*](\d{2,4})/))) return { kind: "RCC", b: +m[1], D: +m[2] };
  if ((m = s.match(/(\d{2,3})(MM)?$/))) return { kind: "T", t: +m[1] };
  return null;
};

/* opt: {mode:'3d'|'2d', scale (m per drawing unit), roles:{layer:role}, mesh (m), tol (m)} */
DXF.build = function (dx, opt) {
  var sc = opt.scale, tol = opt.tol || 0.002, warn = [];
  var nodes = [], grid = {};
  function P(p) { return opt.mode === "2d" ? { x: p[0] * sc, y: 0, z: p[1] * sc } : { x: p[0] * sc, y: p[1] * sc, z: p[2] * sc }; }
  function key(a) { return Math.round(a.x / tol) + "," + Math.round(a.y / tol) + "," + Math.round(a.z / tol); }
  function node(a) {
    var kx = Math.round(a.x / tol), ky = Math.round(a.y / tol), kz = Math.round(a.z / tol);
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) for (var k = -1; k <= 1; k++) {
      var id = grid[(kx + i) + "," + (ky + j) + "," + (kz + k)];
      if (id !== undefined && Math.hypot(nodes[id].x - a.x, nodes[id].y - a.y, nodes[id].z - a.z) <= tol) return id;
    }
    nodes.push({ x: a.x, y: a.y, z: a.z }); grid[key(a)] = nodes.length - 1; return nodes.length - 1;
  }
  function role(layer, a, b) {
    var r = opt.roles[layer] || DXF.guessRole(layer);
    if (r !== "auto") return r;
    if (!a) return "slab";
    var dz = Math.abs(b.z - a.z), dh = Math.hypot(b.x - a.x, b.y - a.y);
    return dh < 1e-6 * (dz + 1) ? "column" : dz < 1e-6 * (dh + 1) ? "beam" : "beam";
  }
  var lines = [], faces = [], sups = [];
  dx.ents.forEach(function (e) {
    if (e.k === "point") { var r = opt.roles[e.layer] || DXF.guessRole(e.layer); sups.push({ p: P(e.p[0]), r: r === "pin" || r === "roller" ? r : "fixed" }); return; }
    var pts = e.p.map(P);
    var lr = opt.roles[e.layer] || DXF.guessRole(e.layer);
    if (lr === "ignore") return;
    if (e.k === "face") { if (lr === "slab" || lr === "wall" || lr === "auto") faces.push({ p: pts, layer: e.layer, kind: lr === "wall" ? "wall" : lr === "auto" ? null : "slab" }); return; }
    if (e.k === "poly" && e.closed && (lr === "slab" || lr === "wall")) {
      if (pts.length === 3 || pts.length === 4) faces.push({ p: pts, layer: e.layer, kind: lr });
      else warn.push("Closed polyline with " + pts.length + " vertices on layer " + e.layer + " skipped - draw slabs/walls as 4-sided panels (one per bay)");
      return;
    }
    if (lr === "slab" || lr === "wall") { warn.push("Open polyline/line on " + lr + " layer " + e.layer + " ignored"); return; }
    if (lr === "fixed" || lr === "pin" || lr === "roller") { pts.forEach(function (p) { sups.push({ p: p, r: lr }); }); return; }
    var segs = []; for (var i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
    if (e.k === "poly" && e.closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
    segs.forEach(function (s) {
      if (Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y, s[1].z - s[0].z) < tol) return;
      lines.push({ a: s[0], b: s[1], layer: e.layer, role: role(e.layer, s[0], s[1]) });
    });
  });
  /* faces -> quad mesh */
  var shells = [];
  faces.forEach(function (f) {
    var p = f.p, quads = [];
    if (p.length === 4) quads.push(p);
    else if (p.length === 3) {
      var c = avg(p), m01 = avg([p[0], p[1]]), m12 = avg([p[1], p[2]]), m20 = avg([p[2], p[0]]);
      quads.push([p[0], m01, c, m20], [p[1], m12, c, m01], [p[2], m20, c, m12]);
    } else return;
    var n3 = FE.cross([p[1].x - p[0].x, p[1].y - p[0].y, p[1].z - p[0].z], [p[2].x - p[0].x, p[2].y - p[0].y, p[2].z - p[0].z]);
    var kind = f.kind || (Math.abs(n3[2]) > 0.7 * Math.hypot(n3[0], n3[1], n3[2]) ? "slab" : "wall");
    quads.forEach(function (q) {
      var na = Math.max(1, Math.ceil(Math.max(dist(q[0], q[1]), dist(q[3], q[2])) / opt.mesh - 1e-9));
      var nb = Math.max(1, Math.ceil(Math.max(dist(q[1], q[2]), dist(q[0], q[3])) / opt.mesh - 1e-9));
      var id = [];
      for (var j = 0; j <= nb; j++) { id.push([]); for (var i = 0; i <= na; i++) id[j].push(node(bil(q, i / na, j / nb))); }
      for (j = 0; j < nb; j++) for (i = 0; i < na; i++) {
        var nn = [id[j][i], id[j][i + 1], id[j + 1][i + 1], id[j + 1][i]];
        if (kind === "slab") {   /* slabs: local z up */
          var A = nodes[nn[0]], B = nodes[nn[1]], C = nodes[nn[2]], Dd = nodes[nn[3]];
          var nz = (C.x - A.x) * (Dd.y - B.y) - (C.y - A.y) * (Dd.x - B.x);
          if (nz < 0) nn = [nn[0], nn[3], nn[2], nn[1]];
        }
        shells.push({ n: nn, kind: kind, layer: f.layer });
      }
    });
  });
  function avg(a) { var o = { x: 0, y: 0, z: 0 }; a.forEach(function (p) { o.x += p.x / a.length; o.y += p.y / a.length; o.z += p.z / a.length; }); return o; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  function bil(q, s, t) {
    var w = [(1 - s) * (1 - t), s * (1 - t), s * t, (1 - s) * t], o = { x: 0, y: 0, z: 0 };
    q.forEach(function (p, i) { o.x += w[i] * p.x; o.y += w[i] * p.y; o.z += w[i] * p.z; }); return o;
  }
  /* frames: create end nodes, then split at every node lying on the segment */
  var segs = lines.map(function (l) { return { a: node(l.a), b: node(l.b), layer: l.layer, role: l.role }; });
  sups.forEach(function (s) { s.n = node(s.p); });
  var frames = [], seen = {};
  segs.forEach(function (s) {
    var A = nodes[s.a], B = nodes[s.b], L = dist(A, B), on = [];
    nodes.forEach(function (N, i) {
      if (i === s.a || i === s.b) return;
      var t = ((N.x - A.x) * (B.x - A.x) + (N.y - A.y) * (B.y - A.y) + (N.z - A.z) * (B.z - A.z)) / (L * L);
      if (t <= 1e-6 || t >= 1 - 1e-6) return;
      var Q = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), z: A.z + t * (B.z - A.z) };
      if (dist(Q, N) <= tol) on.push([t, i]);
    });
    on.sort(function (a, b) { return a[0] - b[0]; });
    var chain = [s.a].concat(on.map(function (o) { return o[1]; })).concat([s.b]);
    for (var i = 0; i + 1 < chain.length; i++) {
      var k = Math.min(chain[i], chain[i + 1]) + "-" + Math.max(chain[i], chain[i + 1]);
      if (seen[k]) { warn.push("Duplicate member between nodes " + (chain[i] + 1) + " and " + (chain[i + 1] + 1) + " removed"); continue; }
      seen[k] = 1;
      frames.push({ n1: chain[i], n2: chain[i + 1], role: s.role, layer: s.layer, part: i, parts: chain.length - 1 });
    }
  });
  /* supports */
  var sup = {};
  sups.forEach(function (s) { sup[s.n] = s.r === "pin" ? [1, 1, 1, 0, 0, 0] : s.r === "roller" ? [0, 0, 1, 0, 0, 0] : [1, 1, 1, 1, 1, 1]; });
  if (!Object.keys(sup).length && nodes.length) {
    var zmin = Math.min.apply(null, nodes.map(function (n) { return n.z; }));
    nodes.forEach(function (n, i) { if (n.z - zmin < tol) sup[i] = [1, 1, 1, 1, 1, 1]; });
    warn.push("No support layer found - all " + Object.keys(sup).length + " nodes at the lowest level (z = " + zmin.toFixed(3) + " m) made fixed.");
  }
  /* unused nodes */
  var used = new Uint8Array(nodes.length);
  frames.forEach(function (f) { used[f.n1] = used[f.n2] = 1; }); shells.forEach(function (s) { s.n.forEach(function (i) { used[i] = 1; }); });
  var map = [], nn = [];
  nodes.forEach(function (n, i) { if (used[i]) { map[i] = nn.length; nn.push(n); } });
  frames.forEach(function (f) { f.n1 = map[f.n1]; f.n2 = map[f.n2]; });
  shells.forEach(function (s) { s.n = s.n.map(function (i) { return map[i]; }); });
  var sup2 = {}; Object.keys(sup).forEach(function (i) { if (map[i] !== undefined) sup2[map[i]] = sup[i]; else warn.push("Support point not on any member ignored"); });
  return { nodes: nn, frames: frames, shells: shells, sup: sup2, warn: warn, twoD: opt.mode === "2d" };
};

/* write a model back to DXF (R12, 3D lines + 3DFACEs) for round-trip / CAD use */
DXF.write = function (m) {
  var o = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  function n(i) { return m.nodes[i]; }
  m.frames.forEach(function (f) {
    var a = n(f.n1), b = n(f.n2);
    o.push("0", "LINE", "8", f.layer || (f.type || "BEAM").toUpperCase(), "10", a.x, "20", a.y, "30", a.z, "11", b.x, "21", b.y, "31", b.z);
  });
  m.shells.forEach(function (s) {
    var p = s.n.map(n);
    o.push("0", "3DFACE", "8", s.layer || (s.kind === "wall" ? "WALL" : "SLAB"));
    p.forEach(function (q, i) { o.push("1" + i, q.x, "2" + i, q.y, "3" + i, q.z); });
  });
  Object.keys(m.sup).forEach(function (i) { var a = n(+i); o.push("0", "POINT", "8", m.sup[i][3] ? "SUPPORT_FIXED" : "SUPPORT_PIN", "10", a.x, "20", a.y, "30", a.z); });
  o.push("0", "ENDSEC", "0", "EOF");
  return o.join("\n") + "\n";
};

if (typeof module !== "undefined") module.exports = DXF;

/* ---------- roof truss from a 2D elevation (X horizontal, Y up) ---------- */
/* layers: TOP / RAFTER → top chord, BOT / TIE / BOTTOM → bottom chord, WEB / DIAG / VERT → web; otherwise found from the outline */
DXF.truss = function (text, opt) {
  opt = opt || {};
  var dx = DXF.parse(text), sc = opt.scale || DXF.UNITS[dx.units] || null, warn = dx.warn.slice();
  var segs = [];
  dx.ents.forEach(function (e) {
    if (DXF.guessRole(e.layer) === "ignore") return;
    if (e.k === "line") segs.push({ a: e.p[0], b: e.p[1], layer: e.layer });
    else if (e.k === "poly") for (var i = 0; i + 1 < e.p.length + (e.closed ? 1 : 0); i++) segs.push({ a: e.p[i], b: e.p[(i + 1) % e.p.length], layer: e.layer });
  });
  if (segs.length < 3) throw new Error("No truss lines found — draw the members as LINEs or polylines in an elevation (X horizontal, Y up)");
  if (!sc) { var ext = 0; segs.forEach(function (q) { ext = Math.max(ext, Math.abs(q.a[0] - q.b[0])); }); sc = ext > 200 ? 0.001 : 1; warn.push("Drawing units not set in the file — taken as " + (sc === 0.001 ? "millimetres" : "metres")); }
  var N = [], tol = 0.005;
  function nd(p) { var x = p[0] * sc, y = p[1] * sc; for (var i = 0; i < N.length; i++) if (Math.hypot(N[i].x - x, N[i].y - y) < tol) return i; N.push({ x: x, y: y }); return N.length - 1; }
  segs.forEach(function (q) { q.i = nd(q.a); q.j = nd(q.b); });
  /* split members at nodes lying on them (chords drawn as one line) */
  var M = [], seen = {};
  segs.forEach(function (q) {
    if (q.i === q.j) return;
    var A = N[q.i], B = N[q.j], L = Math.hypot(B.x - A.x, B.y - A.y), on = [];
    N.forEach(function (P, k) { if (k === q.i || k === q.j) return; var t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / (L * L), d = Math.abs((B.x - A.x) * (A.y - P.y) - (A.x - P.x) * (B.y - A.y)) / L; if (t > 1e-6 && t < 1 - 1e-6 && d < tol) on.push([t, k]); });
    on.sort(function (u, v) { return u[0] - v[0]; });
    var chain = [q.i].concat(on.map(function (o) { return o[1]; }), [q.j]);
    for (var c = 0; c + 1 < chain.length; c++) { var a = chain[c], b = chain[c + 1], key = Math.min(a, b) + "-" + Math.max(a, b); if (!seen[key]) { seen[key] = 1; M.push({ i: a, j: b, layer: q.layer }); } }
  });
  var minY = Infinity, minX = Infinity, maxX = -Infinity;
  N.forEach(function (n) { minY = Math.min(minY, n.y); minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); });
  /* supports: lowest nodes at the two ends (or points on a SUPPORT layer) */
  var supL = null, supR = null;
  dx.ents.forEach(function (e) { if (e.k === "point" && /SUPP|BEAR|BASE|FIX|PIN/i.test(e.layer)) { var k = nd(e.p[0]); if (supL === null || N[k].x < N[supL].x) supL = k; if (supR === null || N[k].x > N[supR].x) supR = k; } });
  if (supL === null || supL === supR) {
    var ends = N.map(function (n, k) { return k; }).filter(function (k) { return Math.abs(N[k].x - minX) < 0.05 || Math.abs(N[k].x - maxX) < 0.05; });
    var lo = function (side) { var c = ends.filter(function (k) { return side ? Math.abs(N[k].x - maxX) < 0.05 : Math.abs(N[k].x - minX) < 0.05; }); c.sort(function (u, v) { return N[u].y - N[v].y; }); return c[0]; };
    supL = lo(false); supR = lo(true);
  }
  var adj = N.map(function () { return []; });
  M.forEach(function (m, k) { adj[m.i].push([m.j, k]); adj[m.j].push([m.i, k]); });
  function walk(upper) {
    var path = [supL], used = [], cur = supL, guard = 0;
    while (cur !== supR && guard++ < 500) {
      var best = null, ba = upper ? -Infinity : Infinity;
      adj[cur].forEach(function (q) { var o = N[q[0]], dxx = o.x - N[cur].x; if (dxx <= 1e-6) return; var ang = Math.atan2(o.y - N[cur].y, dxx); if (upper ? ang > ba : ang < ba) { ba = ang; best = q; } });
      if (!best) return null;
      used.push(best[1]); path.push(best[0]); cur = best[0];
    }
    return cur === supR ? { path: path, used: used } : null;
  }
  var up = walk(true), dn = walk(false);
  if (!up || !dn) throw new Error("Could not trace the chords from support to support — check that the members meet at common joints");
  M.forEach(function (m, k) {
    var L = m.layer.toUpperCase();
    m.g = /TOP|RAFT|UPPER/.test(L) ? "top" : /BOT|TIE|LOWER/.test(L) ? "bot" : /WEB|DIAG|VERT|STRUT/.test(L) ? "web" : up.used.indexOf(k) >= 0 ? "top" : dn.used.indexOf(k) >= 0 ? "bot" : "web";
  });
  var x0 = N[supL].x, y0 = N[supL].y, top = [], bot = [];
  var G = { N: N.map(function (n) { return { x: n.x - x0, y: n.y - y0, kind: "b" }; }), M: M.map(function (m) { return { i: m.i, j: m.j, g: m.g }; }) };
  up.path.forEach(function (k) { G.N[k].kind = "t"; top.push(k); }); dn.path.forEach(function (k) { bot.push(k); });
  G.top = top; G.bot = bot; G.sup = [supL, supR]; G.span = N[supR].x - x0;
  G.h = Math.max.apply(null, top.map(function (k) { return G.N[k].y; }));
  if (Math.abs(N[supR].y - y0) > 0.01) warn.push("Supports at different levels — the span is measured horizontally");
  G.slope = Math.atan2(G.h, G.span / 2) * 180 / Math.PI; G.warn = warn;
  return G;
};

/* ---------- column layout from a plan: rectangles / circles / points on column layers, marks from nearby text ---------- */
DXF.columns = function (text, opt) {
  opt = opt || {};
  var dx = DXF.parse(text), sc = opt.scale || DXF.UNITS[dx.units] || null, warn = dx.warn.slice(), cand = [];
  var colLay = function (l) { return /COL|PILLAR|PIER/i.test(l); }, anyCol = dx.ents.some(function (e) { return colLay(e.layer); });
  dx.ents.forEach(function (e) {
    if (anyCol && !colLay(e.layer)) return;
    if (!anyCol && DXF.guessRole(e.layer) === "ignore") return;
    if (e.k === "poly" && e.closed && e.p.length >= 3 && e.p.length <= 8) {
      var xs = e.p.map(function (q) { return q[0]; }), ys = e.p.map(function (q) { return q[1]; }), b = Math.max.apply(null, xs) - Math.min.apply(null, xs), d = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      cand.push({ x: (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2, y: (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2, b: b, d: d, layer: e.layer });
    } else if (e.k === "point") cand.push({ x: e.p[0][0], y: e.p[0][1], b: e.r ? 2 * e.r : 0, d: e.r ? 2 * e.r : 0, circ: !!e.r, layer: e.layer });
  });
  if (!cand.length) throw new Error("No columns found — draw each column as a closed rectangle (or a circle / point) on a layer named COLUMN");
  if (!sc) { var big = cand.some(function (q) { return Math.abs(q.x) > 300 || Math.abs(q.y) > 300 || q.b > 50; }); sc = big ? 0.001 : 1; warn.push("Drawing units not set in the file — taken as " + (big ? "millimetres" : "metres")); }
  /* merge duplicates (e.g. a rectangle and a point at the same column) */
  var cols = [];
  cand.forEach(function (q) { var x = q.x * sc, y = q.y * sc, b = q.b * sc * 1000, d = q.d * sc * 1000; var o = cols.filter(function (c) { return Math.hypot(c.x - x, c.y - y) < 0.05; })[0]; if (o) { if (b > o.b) { o.b = b; o.d = d; } } else cols.push({ x: x, y: y, b: b, d: d, circ: q.circ }); });
  var minX = Math.min.apply(null, cols.map(function (c) { return c.x; })), minY = Math.min.apply(null, cols.map(function (c) { return c.y; }));
  cols.forEach(function (c) { c.x = Math.round((c.x - minX) * 1000) / 1000; c.y = Math.round((c.y - minY) * 1000) / 1000; });
  /* marks: nearest text like C1, C-12, P3 within 1.5 m of the column */
  var tx = (dx.texts || []).filter(function (t) { return /^[A-Za-z]{1,3}[-\s]?\d+[A-Za-z]?$/.test(t.t.trim()); }).map(function (t) { return { x: Math.round((t.p[0][0] * sc - minX) * 1000) / 1000, y: Math.round((t.p[0][1] * sc - minY) * 1000) / 1000, t: t.t.trim().replace(/\s+/g, "").toUpperCase() }; });
  var taken = {};
  cols.forEach(function (c) { var best = null, bd = 1.5; tx.forEach(function (t) { var d = Math.hypot(t.x - c.x, t.y - c.y); if (d < bd && !taken[t.t]) { bd = d; best = t; } }); if (best) { c.mark = best.t; taken[best.t] = 1; } });
  cols.sort(function (a, b) { return Math.abs(a.y - b.y) > 0.05 ? a.y - b.y : a.x - b.x; });
  var n = 1; cols.forEach(function (c) { if (!c.mark) { while (taken["C" + n]) n++; c.mark = "C" + n; taken[c.mark] = 1; } });
  var sizes = {}; cols.forEach(function (c) { if (c.b > 0) { var k = Math.round(c.b) + "x" + Math.round(c.d); sizes[k] = (sizes[k] || 0) + 1; } });
  var common = Object.keys(sizes).sort(function (a, b) { return sizes[b] - sizes[a]; })[0];
  return { cols: cols, size: common ? common.split("x").map(Number) : null, warn: warn, texts: tx.length };
};

/* ---------- sample drawings (also used by the tests) ---------- */
(function () {
function hdr(units) { return ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", String(units), "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"]; }
function line(l, a, b) { return ["0", "LINE", "8", l, "10", a[0], "20", a[1], "30", 0, "11", b[0], "21", b[1], "31", 0].map(String); }
function rectp(l, x, y, b, d) { return ["0", "LWPOLYLINE", "8", l, "90", "4", "70", "1", "10", x - b / 2, "20", y - d / 2, "10", x + b / 2, "20", y - d / 2, "10", x + b / 2, "20", y + d / 2, "10", x - b / 2, "20", y + d / 2].map(String); }
function text(l, x, y, t) { return ["0", "TEXT", "8", l, "10", x, "20", y, "30", 0, "40", 250, "1", t].map(String); }
function circle(l, x, y, r) { return ["0", "CIRCLE", "8", l, "10", x, "20", y, "30", 0, "40", r].map(String); }
function end(a) { return a.concat(["0", "ENDSEC", "0", "EOF"]).join("\n"); }
/* Pratt truss elevation in mm: chords drawn as single long lines (split at the joints by the reader) */
DXF.sampleTruss = function (span, slope, n, opt) {
  opt = opt || {}; var t = Math.tan(slope * Math.PI / 180), nn = 2 * n, p = span / nn, a = hdr(4), S = span * 1000;
  var top = []; for (var i = 0; i <= nn; i++) top.push([i * p * 1000, Math.min(i, nn - i) * p * t * 1000]);
  a = a.concat(line(opt.layers ? "BOTTOM" : "TRUSS", [0, 0], [S, 0]));
  a = a.concat(line(opt.layers ? "TOP" : "TRUSS", top[0], top[n]), line(opt.layers ? "TOP" : "TRUSS", top[n], top[nn]));
  for (i = 1; i < nn; i++) a = a.concat(line(opt.layers ? "WEB" : "TRUSS", [i * p * 1000, 0], top[i]));
  for (i = 1; i < n; i++) { a = a.concat(line(opt.layers ? "WEB" : "TRUSS", top[i], [(i + 1) * p * 1000, 0]), line(opt.layers ? "WEB" : "TRUSS", top[nn - i], [(nn - i - 1) * p * 1000, 0])); }
  a = a.concat(line("DIMENSIONS", [0, -800], [S, -800]));
  return end(a);
};
/* column plan in mm: rectangles on COLUMN with marks; one circle column */
DXF.samplePlan = function (xs, ys, b, d, opt) {
  opt = opt || {}; var a = hdr(4), k = 1;
  ys.forEach(function (y) { xs.forEach(function (x) { var X = x * 1000 + (opt.dx || 0), Y = y * 1000 + (opt.dy || 0); a = a.concat(rectp("COLUMN", X, Y, b, d)); if (!opt.nomarks) a = a.concat(text("COL-TEXT", X + 300, Y + 300, "C" + k)); k++; }); });
  if (opt.circle) a = a.concat(circle("COLUMN", opt.circle[0] * 1000, opt.circle[1] * 1000, 250));
  a = a.concat(line("GRID", [-2000, 0], [50000, 0]));
  return end(a);
};
})();
