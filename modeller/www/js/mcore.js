/* IS StructModeller — model, editing operations, checks, quantities and DXF writers.
   Units: metres for geometry, millimetres for section sizes. Global Z up; grids: numbered lines 1, 2, 3 … are parallel to Y
   (placed along X), lettered lines A, B, C … are parallel to X (placed along Y). Storey s (1…n) spans level s−1 to level s. */
var MC = (function () {
  var C = {};
  C.VERSION = "1.0";
  C.uid = function () { return Math.random().toString(36).slice(2, 9); };
  C.letters = function (i) { var s = ""; i++; while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  C.nums = function (s) { return String(s || "").split(/[,;\s]+/).map(Number).filter(function (x) { return isFinite(x) && x > 0; }); };
  /* "3*4.5, 5" → [4.5, 4.5, 4.5, 5] */
  C.spans = function (s) {
    var out = [];
    String(s || "").split(/[,;\s]+/).forEach(function (t) { var m = t.match(/^(\d+)\s*[*x×]\s*([\d.]+)$/i); if (m) { for (var i = 0; i < +m[1]; i++) out.push(+m[2]); } else if (isFinite(+t) && +t > 0) out.push(+t); });
    return out;
  };

  C.blank = function (name) {
    return { app: "IS StructModeller", v: C.VERSION, name: name || "New building", grids: { x: [], y: [] }, storeys: [], z0: 0,
      def: { col: { bx: 300, by: 450 }, beam: { b: 230, D: 450 }, slab: { t: 150 }, wall: { t: 200 }, brace: { sec: "ISA 65x65x6" }, sup: "fixed", fck: 25, fy: 500 },
      cols: [], beams: [], slabs: [], walls: [], braces: [], notes: "" };
  };
  /* grids and storeys from spacing lists */
  C.setGrid = function (P, xs, ys) {
    var x = 0, y = 0;
    P.grids.x = [{ id: "1", p: 0 }].concat(xs.map(function (s, i) { x += s; return { id: String(i + 2), p: +x.toFixed(4) }; }));
    P.grids.y = [{ id: "A", p: 0 }].concat(ys.map(function (s, i) { y += s; return { id: C.letters(i + 1), p: +y.toFixed(4) }; }));
  };
  C.setStoreys = function (P, hs, names) {
    P.storeys = hs.map(function (h, i) { return { name: names && names[i] || C.storeyName(i, hs.length), h: h }; });
  };
  C.storeyName = function (i, n) { return i === 0 ? "Ground floor" : i === n - 1 && n > 2 ? "Top floor (" + C.ord(i) + ")" : C.ord(i) + " floor"; };
  C.ord = function (i) { var s = ["th", "st", "nd", "rd"], v = i % 100; return i + (s[(v - 20) % 10] || s[v] || s[0]); };
  C.levels = function (P) { var z = [P.z0 || 0]; P.storeys.forEach(function (s) { z.push(+(z[z.length - 1] + s.h).toFixed(4)); }); return z; };
  C.levelName = function (P, lv) { return lv === 0 ? "Base" : (P.storeys[lv] ? P.storeys[lv].name : "Roof") + " level"; };

  /* quick building: columns at every grid point, beams on every grid line, slabs in every cell, on every storey */
  C.generate = function (P, o) {
    o = o || {};
    var X = P.grids.x, Y = P.grids.y;
    P.cols = []; P.beams = []; P.slabs = []; P.walls = []; P.braces = [];
    P.storeys.forEach(function (st, k) {
      var s = k + 1;
      X.forEach(function (gx) { Y.forEach(function (gy) { P.cols.push({ id: C.uid(), s: s, x: gx.p, y: gy.p, bx: P.def.col.bx, by: P.def.col.by }); }); });
      if (o.beams !== false) {
        Y.forEach(function (gy) { for (var i = 0; i + 1 < X.length; i++) P.beams.push({ id: C.uid(), lv: s, x1: X[i].p, y1: gy.p, x2: X[i + 1].p, y2: gy.p, b: P.def.beam.b, D: P.def.beam.D }); });
        X.forEach(function (gx) { for (var j = 0; j + 1 < Y.length; j++) P.beams.push({ id: C.uid(), lv: s, x1: gx.p, y1: Y[j].p, x2: gx.p, y2: Y[j + 1].p, b: P.def.beam.b, D: P.def.beam.D }); });
      }
      if (o.slabs !== false) for (var i = 0; i + 1 < X.length; i++) for (var j = 0; j + 1 < Y.length; j++) P.slabs.push({ id: C.uid(), lv: s, x1: X[i].p, y1: Y[j].p, x2: X[i + 1].p, y2: Y[j + 1].p, t: P.def.slab.t });
    });
    return P;
  };
  /* copy storey s (its columns, walls, braces, and the beams and slabs at its top level) to the target storeys */
  C.copyStorey = function (P, s, targets, replace) {
    targets.forEach(function (t) {
      if (t === s || t < 1 || t > P.storeys.length) return;
      if (replace) { P.cols = P.cols.filter(function (c) { return c.s !== t; }); P.walls = P.walls.filter(function (c) { return c.s !== t; }); P.braces = P.braces.filter(function (c) { return c.s !== t; }); P.beams = P.beams.filter(function (c) { return c.lv !== t; }); P.slabs = P.slabs.filter(function (c) { return c.lv !== t; }); }
      P.cols.filter(function (c) { return c.s === s; }).forEach(function (c) { P.cols.push(Object.assign({}, c, { id: C.uid(), s: t })); });
      P.walls.filter(function (c) { return c.s === s; }).forEach(function (c) { P.walls.push(Object.assign({}, c, { id: C.uid(), s: t })); });
      P.braces.filter(function (c) { return c.s === s; }).forEach(function (c) { P.braces.push(Object.assign({}, c, { id: C.uid(), s: t })); });
      P.beams.filter(function (c) { return c.lv === s; }).forEach(function (c) { P.beams.push(Object.assign({}, c, { id: C.uid(), lv: t })); });
      P.slabs.filter(function (c) { return c.lv === s; }).forEach(function (c) { P.slabs.push(Object.assign({}, c, { id: C.uid(), lv: t })); });
    });
  };
  C.kinds = ["cols", "beams", "slabs", "walls", "braces"];
  C.find = function (P, id) { for (var i = 0; i < C.kinds.length; i++) { var a = P[C.kinds[i]]; for (var j = 0; j < a.length; j++) if (a[j].id === id) return { kind: C.kinds[i], el: a[j], i: j }; } return null; };
  C.remove = function (P, id) { var f = C.find(P, id); if (f) P[f.kind].splice(f.i, 1); return !!f; };
  /* remove exact duplicates (same kind, same place) */
  C.dedupe = function (P) {
    var n = 0;
    C.kinds.forEach(function (k) {
      var seen = {}; P[k] = P[k].filter(function (e) { var key = C.key(k, e); if (seen[key]) { n++; return false; } seen[key] = 1; return true; });
    });
    return n;
  };
  C.key = function (k, e) {
    function r(v) { return Math.round(v * 1000); }
    if (k === "cols") return e.s + ":" + r(e.x) + "," + r(e.y);
    if (k === "slabs") return e.lv + ":" + [r(Math.min(e.x1, e.x2)), r(Math.min(e.y1, e.y2)), r(Math.max(e.x1, e.x2)), r(Math.max(e.y1, e.y2))].join(",");
    var a = [r(e.x1), r(e.y1)].join(","), b = [r(e.x2), r(e.y2)].join(","), s = a < b ? a + "|" + b : b + "|" + a;
    return (k === "beams" ? e.lv : e.s) + ":" + s;
  };

  /* ------------------------------------------------ checks */
  function onSeg(px, py, x1, y1, x2, y2, tol) {
    var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy; if (L2 < 1e-12) return Math.hypot(px - x1, py - y1) <= tol;
    var t = ((px - x1) * dx + (py - y1) * dy) / L2; if (t < -1e-9 || t > 1 + 1e-9) return false;
    return Math.hypot(x1 + t * dx - px, y1 + t * dy - py) <= tol;
  }
  C.onSeg = onSeg;
  C.check = function (P) {
    var out = [], tol = 0.01, n = P.storeys.length;
    function add(sev, t, ids) { out.push({ sev: sev, t: t, ids: ids || [] }); }
    if (!P.storeys.length) add("err", "No storeys — set the storey heights");
    if (!P.cols.length && !P.walls.length) add("err", "No columns or walls — nothing carries the floors down to the foundation");
    /* beam ends: on a column (of the storey below or above), a wall, or another beam at the same level */
    P.beams.forEach(function (b) {
      [[b.x1, b.y1], [b.x2, b.y2]].forEach(function (p, k) {
        var ok = P.cols.some(function (c) { return (c.s === b.lv || c.s === b.lv + 1) && Math.hypot(c.x - p[0], c.y - p[1]) <= tol; }) ||
          P.walls.some(function (w) { return (w.s === b.lv || w.s === b.lv + 1) && onSeg(p[0], p[1], w.x1, w.y1, w.x2, w.y2, tol); }) ||
          P.beams.some(function (o) { return o !== b && o.lv === b.lv && onSeg(p[0], p[1], o.x1, o.y1, o.x2, o.y2, tol); });
        if (!ok) add("warn", "Beam at " + C.levelName(P, b.lv) + " has a free end at (" + p[0].toFixed(2) + ", " + p[1].toFixed(2) + ") — a cantilever, or a missing column", [b.id]);
      });
      if (Math.hypot(b.x2 - b.x1, b.y2 - b.y1) < 0.05) add("err", "Zero-length beam", [b.id]);
    });
    /* columns: something below (column of the storey below, or the base) */
    P.cols.forEach(function (c) {
      if (c.s === 1) return;
      var below = P.cols.some(function (o) { return o.s === c.s - 1 && Math.hypot(o.x - c.x, o.y - c.y) <= tol; }) || P.walls.some(function (w) { return w.s === c.s - 1 && onSeg(c.x, c.y, w.x1, w.y1, w.x2, w.y2, tol); });
      if (!below) {
        var onBeam = P.beams.some(function (b) { return b.lv === c.s - 1 && onSeg(c.x, c.y, b.x1, b.y1, b.x2, b.y2, tol); });
        add(onBeam ? "warn" : "err", onBeam ? "Floating column on a beam at " + C.levelName(P, c.s - 1) + " (" + c.x.toFixed(2) + ", " + c.y.toFixed(2) + ") — design that beam as a transfer beam" : "Column in " + P.storeys[c.s - 1].name + " at (" + c.x.toFixed(2) + ", " + c.y.toFixed(2) + ") stands on nothing", [c.id]);
      }
    });
    /* slabs: edges carried by beams or walls */
    P.slabs.forEach(function (s) {
      var x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2), y1 = Math.min(s.y1, s.y2), y2 = Math.max(s.y1, s.y2), free = 0;
      [[x1, y1, x2, y1], [x2, y1, x2, y2], [x1, y2, x2, y2], [x1, y1, x1, y2]].forEach(function (e) {
        var mx = (e[0] + e[2]) / 2, my = (e[1] + e[3]) / 2;
        var sup = P.beams.some(function (b) { return b.lv === s.lv && onSeg(mx, my, b.x1, b.y1, b.x2, b.y2, tol); }) || P.walls.some(function (w) { return (w.s === s.lv || w.s === s.lv + 1) && onSeg(mx, my, w.x1, w.y1, w.x2, w.y2, tol); });
        if (!sup) free++;
      });
      if (free === 4) add("warn", "Slab at " + C.levelName(P, s.lv) + " (" + (x2 - x1).toFixed(2) + " × " + (y2 - y1).toFixed(2) + " m) has no beam or wall on any edge — a flat slab; check punching at the columns", [s.id]);
      else if (free) add("info", "Slab at " + C.levelName(P, s.lv) + " has " + free + " free edge(s) — a cantilever or an edge without a beam", [s.id]);
      var sp = Math.min(x2 - x1, y2 - y1); if (sp > 0 && s.t > 0 && sp * 1000 / (s.t - 25) > 40) add("info", "Slab " + (x2 - x1).toFixed(2) + " × " + (y2 - y1).toFixed(2) + " m at " + C.levelName(P, s.lv) + ": " + s.t + " mm looks thin (short span / d > 40, IS 456 cl 23.2.1 / 24.1)", [s.id]);
    });
    /* member proportions (IS 13920 minimums as a reminder) */
    var thin = P.cols.filter(function (c) { return Math.min(c.bx, c.by) < 300; });
    if (thin.length) add("info", thin.length + " column(s) smaller than 300 mm — below the IS 13920:2016 minimum for seismic zones III–V", thin.map(function (c) { return c.id; }));
    var nb = P.beams.filter(function (b) { return b.b < 200 || b.b / b.D < 0.3; });
    if (nb.length) add("info", nb.length + " beam(s) narrower than 200 mm or with b/D < 0.3 (IS 13920 cl 6.1)", nb.map(function (b) { return b.id; }));
    var d = 0, seen = {}; C.kinds.forEach(function (k) { P[k].forEach(function (e) { var key = k + C.key(k, e); if (seen[key]) d++; seen[key] = 1; }); });
    if (d) add("warn", d + " duplicate element(s) on top of each other — use Tidy to remove them");
    if (!out.some(function (o) { return o.sev === "err" || o.sev === "warn"; })) add("ok", "No modelling problems found");
    return out;
  };

  /* ------------------------------------------------ quantities */
  C.qty = function (P) {
    var lv = C.levels(P), q = { cols: { n: 0, v: 0 }, beams: { n: 0, v: 0, L: 0 }, slabs: { n: 0, v: 0, A: 0 }, walls: { n: 0, v: 0 }, braces: { n: 0, L: 0 } };
    function sh(s) { return P.storeys[s - 1] ? P.storeys[s - 1].h : 0; }
    P.cols.forEach(function (c) { q.cols.n++; q.cols.v += c.bx * c.by / 1e6 * sh(c.s); });
    /* beams: depth below the slab soffit only (the slab part is counted with the slab) */
    var tS = function (lvl) { var t = 0; P.slabs.forEach(function (s) { if (s.lv === lvl) t = Math.max(t, s.t); }); return t; };
    P.beams.forEach(function (b) { var L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1); q.beams.n++; q.beams.L += L; q.beams.v += b.b * Math.max(b.D - tS(b.lv), 0) / 1e6 * L; });
    P.slabs.forEach(function (s) { var A = Math.abs(s.x2 - s.x1) * Math.abs(s.y2 - s.y1); q.slabs.n++; q.slabs.A += A; q.slabs.v += A * s.t / 1000; });
    P.walls.forEach(function (w) { q.walls.n++; q.walls.v += Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * sh(w.s) * w.t / 1000; });
    P.braces.forEach(function (b) { q.braces.n++; q.braces.L += Math.hypot(Math.hypot(b.x2 - b.x1, b.y2 - b.y1), sh(b.s)); });
    var rate = { cols: 160, beams: 130, slabs: 85, walls: 110 };
    q.total = q.cols.v + q.beams.v + q.slabs.v + q.walls.v;
    q.steel = q.cols.v * rate.cols + q.beams.v * rate.beams + q.slabs.v * rate.slabs + q.walls.v * rate.walls;
    q.rate = rate; q.area = 0; P.storeys.forEach(function (s, i) { var a = 0; P.slabs.forEach(function (sl) { if (sl.lv === i + 1) a += Math.abs(sl.x2 - sl.x1) * Math.abs(sl.y2 - sl.y1); }); q.area += a; });
    q.height = lv[lv.length - 1] - lv[0];
    return q;
  };

  /* ------------------------------------------------ DXF writer (ASCII R12) */
  function Dxf() { this.o = []; }
  Dxf.prototype.add = function () { for (var i = 0; i < arguments.length; i++) this.o.push(String(arguments[i])); return this; };
  Dxf.prototype.num = function (v) { return (Math.round(v * 1e6) / 1e6).toString(); };
  Dxf.prototype.line = function (L, a, b, col) { this.add(0, "LINE", 8, L); if (col) this.add(62, col); this.add(10, this.num(a[0]), 20, this.num(a[1]), 30, this.num(a[2] || 0), 11, this.num(b[0]), 21, this.num(b[1]), 31, this.num(b[2] || 0)); return this; };
  Dxf.prototype.face = function (L, p) { this.add(0, "3DFACE", 8, L); var q = p.length === 3 ? [p[0], p[1], p[2], p[2]] : p; for (var i = 0; i < 4; i++) this.add(10 + i, this.num(q[i][0]), 20 + i, this.num(q[i][1]), 30 + i, this.num(q[i][2] || 0)); return this; };
  Dxf.prototype.solid = function (L, p) { this.add(0, "SOLID", 8, L); var q = [p[0], p[1], p[3], p[2]]; for (var i = 0; i < 4; i++) this.add(10 + i, this.num(q[i][0]), 20 + i, this.num(q[i][1]), 30 + i, 0); return this; };
  Dxf.prototype.point = function (L, a) { this.add(0, "POINT", 8, L, 10, this.num(a[0]), 20, this.num(a[1]), 30, this.num(a[2] || 0)); return this; };
  Dxf.prototype.circle = function (L, a, r) { this.add(0, "CIRCLE", 8, L, 10, this.num(a[0]), 20, this.num(a[1]), 30, 0, 40, this.num(r)); return this; };
  Dxf.prototype.text = function (L, a, h, s, align, rot) {
    this.add(0, "TEXT", 8, L, 10, this.num(a[0]), 20, this.num(a[1]), 30, 0, 40, this.num(h), 1, String(s).replace(/[\r\n]+/g, " "));
    if (rot) this.add(50, this.num(rot));
    if (align) { this.add(72, align === "c" ? 1 : align === "r" ? 2 : 0, 73, 2, 11, this.num(a[0]), 21, this.num(a[1]), 31, 0); }
    return this;
  };
  Dxf.prototype.pline = function (L, pts, closed) { for (var i = 0; i + 1 < pts.length; i++) this.line(L, pts[i], pts[i + 1]); if (closed) this.line(L, pts[pts.length - 1], pts[0]); return this; };
  C.dxfDoc = function (layers, ext, body, ltypes) {
    var d = new Dxf();
    d.add(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSUNITS", 70, 6, 9, "$EXTMIN", 10, ext[0], 20, ext[1], 30, 0, 9, "$EXTMAX", 10, ext[2], 20, ext[3], 30, ext[4] || 0, 9, "$LTSCALE", 40, ltypes ? 0.5 : 1, 0, "ENDSEC");
    d.add(0, "SECTION", 2, "TABLES");
    d.add(0, "TABLE", 2, "LTYPE", 70, 2, 0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0);
    d.add(0, "LTYPE", 2, "CENTER", 70, 0, 3, "Center ____ _ ____ _", 72, 65, 73, 4, 40, 2.0, 49, 1.25, 49, -0.25, 49, 0.25, 49, -0.25);
    d.add(0, "ENDTAB");
    d.add(0, "TABLE", 2, "LAYER", 70, Object.keys(layers).length);
    Object.keys(layers).forEach(function (n) { var L = layers[n]; d.add(0, "LAYER", 2, n, 70, 0, 62, L.c || 7, 6, L.lt || "CONTINUOUS"); });
    d.add(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
    d.o = d.o.concat(body.o);
    d.add(0, "ENDSEC", 0, "EOF");
    return d.o.join("\n") + "\n";
  };

  /* 3D analysis model — the layer names are what IS StructDesign (and most analysis programs' DXF import) read:
     COL_<b>x<D> (D along X), BEAM_<b>x<D>, BRACE_<section>, SLAB_<t>, WALL_<t>, SUPPORT_FIXED / SUPPORT_PIN. */
  C.dxfModel = function (P, opt) {
    opt = opt || {};
    var lv = C.levels(P), body = new Dxf(), layers = {}, warn = [], ext = [Infinity, Infinity, -Infinity, -Infinity, 0];
    function L(name, c) { if (!layers[name]) layers[name] = { c: c }; return name; }
    function grow(p) { ext[0] = Math.min(ext[0], p[0]); ext[1] = Math.min(ext[1], p[1]); ext[2] = Math.max(ext[2], p[0]); ext[3] = Math.max(ext[3], p[1]); ext[4] = Math.max(ext[4], p[2]); }
    P.cols.forEach(function (c) {
      /* app section b × D with D along X: a column bx (along X) × by (along Y) is COL_<by>x<bx> */
      var a = [c.x, c.y, lv[c.s - 1]], b = [c.x, c.y, lv[c.s]]; grow(a); grow(b);
      body.line(L("COL_" + c.by + "x" + c.bx, 1), a, b);
    });
    P.beams.forEach(function (bm) { var a = [bm.x1, bm.y1, lv[bm.lv]], b = [bm.x2, bm.y2, lv[bm.lv]]; grow(a); grow(b); body.line(L("BEAM_" + bm.b + "x" + bm.D, 5), a, b); });
    P.braces.forEach(function (br) { var a = [br.x1, br.y1, lv[br.s - 1]], b = [br.x2, br.y2, lv[br.s]]; body.line(L("BRACE_" + String(br.sec || "ISA65x65x6").replace(/\s+/g, ""), 6), a, b); });
    P.slabs.forEach(function (s) { var z = lv[s.lv], x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2), y1 = Math.min(s.y1, s.y2), y2 = Math.max(s.y1, s.y2); body.face(L("SLAB_" + s.t, 3), [[x1, y1, z], [x2, y1, z], [x2, y2, z], [x1, y2, z]]); });
    P.walls.forEach(function (w) { var z0 = lv[w.s - 1], z1 = lv[w.s]; body.face(L("WALL_" + w.t, 4), [[w.x1, w.y1, z0], [w.x2, w.y2, z0], [w.x2, w.y2, z1], [w.x1, w.y1, z1]]); });
    /* supports: the base of every ground-storey column (and wall ends); when walls stand on the base and every support is fixed,
       no points are written so that the importer fixes every node at the lowest level (the whole wall base). */
    var baseWalls = P.walls.some(function (w) { return w.s === 1; }), pins = P.cols.some(function (c) { return c.s === 1 && (c.sup || P.def.sup) === "pinned"; });
    if (opt.supports !== false && !(baseWalls && !pins)) {
      P.cols.forEach(function (c) { if (c.s !== 1) return; var t = (c.sup || P.def.sup) === "pinned" ? "SUPPORT_PIN" : "SUPPORT_FIXED"; body.point(L(t, 2), [c.x, c.y, lv[0]]); });
      P.walls.forEach(function (w) { if (w.s !== 1) return; body.point(L("SUPPORT_FIXED", 2), [w.x1, w.y1, lv[0]]); body.point(L("SUPPORT_FIXED", 2), [w.x2, w.y2, lv[0]]); });
      if (baseWalls) warn.push("Walls stand on the base and some supports are pinned: wall bases are supported only at their ends.");
    } else if (baseWalls) warn.push("Supports: no support points written — the importer fixes every node at the base level (columns and the full wall bases).");
    if (!isFinite(ext[0])) ext = [0, 0, 1, 1, 1];
    return { text: C.dxfDoc(layers, ext, body), warn: warn, layers: Object.keys(layers) };
  };

  /* 2D drawings: one plan per level (grids with bubbles, columns, beams as double lines with marks, slabs, walls, dimensions)
     placed side by side, plus a column schedule. Drawing units: metres. */
  C.dxfPlans = function (P, opt) {
    opt = opt || {};
    var lv = C.levels(P), d = new Dxf(), layers = { GRID: { c: 8, lt: "CENTER" }, GRID_BUBBLE: { c: 7 }, COLUMN: { c: 1 }, COLUMN_FILL: { c: 251 }, BEAM: { c: 5 }, BEAM_HIDDEN: { c: 5 }, SLAB: { c: 3 }, WALL: { c: 4 }, WALL_FILL: { c: 253 }, BRACE: { c: 6 }, DIM: { c: 2 }, TEXT: { c: 7 }, TITLE: { c: 7 } };
    var X = P.grids.x, Y = P.grids.y, minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    function bb(x, y) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    X.forEach(function (g) { bb(g.p, 0); }); Y.forEach(function (g) { bb(0, g.p); });
    C.kinds.forEach(function (k) { P[k].forEach(function (e) { if (e.x !== undefined) bb(e.x, e.y); if (e.x1 !== undefined) { bb(e.x1, e.y1); bb(e.x2, e.y2); } }); });
    if (!isFinite(minx)) { minx = miny = 0; maxx = maxy = 10; }
    var W = maxx - minx, H = maxy - miny, gap = Math.max(6, 0.35 * W), ext = 1.8, th = Math.max(0.18, Math.min(0.35, W / 60));
    var plans = []; for (var s = 1; s <= P.storeys.length; s++) plans.push(s);
    plans.forEach(function (s, k) {
      var ox = k * (W + 2 * ext + gap) - minx + ext, oy = -miny + ext + 1.5;
      function p(x, y) { return [x + ox, y + oy]; }
      /* grids */
      X.forEach(function (g) { d.line("GRID", p(g.p, miny - ext + 0.6), p(g.p, maxy + ext - 0.6)); d.circle("GRID_BUBBLE", p(g.p, maxy + ext - 0.25), 0.35); d.text("GRID_BUBBLE", p(g.p, maxy + ext - 0.25), th * 1.2, g.id, "c"); });
      Y.forEach(function (g) { d.line("GRID", p(minx - ext + 0.6, g.p), p(maxx + ext - 0.6, g.p)); d.circle("GRID_BUBBLE", p(minx - ext + 0.25, g.p), 0.35); d.text("GRID_BUBBLE", p(minx - ext + 0.25, g.p), th * 1.2, g.id, "c"); });
      /* dimensions between grids (bottom and right) */
      for (var i = 0; i + 1 < X.length; i++) { var y0 = miny - ext + 0.9; d.line("DIM", p(X[i].p, y0), p(X[i + 1].p, y0)); d.line("DIM", p(X[i].p, y0 - 0.12), p(X[i].p, y0 + 0.12)); d.line("DIM", p(X[i + 1].p, y0 - 0.12), p(X[i + 1].p, y0 + 0.12)); d.text("DIM", p((X[i].p + X[i + 1].p) / 2, y0 + 0.22), th, Math.round((X[i + 1].p - X[i].p) * 1000), "c"); }
      for (var j = 0; j + 1 < Y.length; j++) { var x0 = maxx + ext - 0.9; d.line("DIM", p(x0, Y[j].p), p(x0, Y[j + 1].p)); d.line("DIM", p(x0 - 0.12, Y[j].p), p(x0 + 0.12, Y[j].p)); d.line("DIM", p(x0 - 0.12, Y[j + 1].p), p(x0 + 0.12, Y[j + 1].p)); d.text("DIM", p(x0 + 0.22, (Y[j].p + Y[j + 1].p) / 2), th, Math.round((Y[j + 1].p - Y[j].p) * 1000), "c", 90); }
      /* slabs */
      var sn = 0;
      P.slabs.filter(function (q) { return q.lv === s; }).forEach(function (q) {
        sn++; var x1 = Math.min(q.x1, q.x2), x2 = Math.max(q.x1, q.x2), y1 = Math.min(q.y1, q.y2), y2 = Math.max(q.y1, q.y2);
        d.line("SLAB", p(x1 + 0.15, y1 + 0.15), p(x2 - 0.15, y2 - 0.15)); d.line("SLAB", p(x1 + 0.15, y2 - 0.15), p(x2 - 0.15, y1 + 0.15));
        d.text("SLAB", p((x1 + x2) / 2, (y1 + y2) / 2 + th * 0.7), th, "S" + sn, "c"); d.text("SLAB", p((x1 + x2) / 2, (y1 + y2) / 2 - th * 0.9), th * 0.8, q.t + " THK", "c");
      });
      /* beams: two lines at ±b/2, mark at mid-length */
      var bn = 0;
      P.beams.filter(function (q) { return q.lv === s; }).forEach(function (q) {
        bn++; var dx = q.x2 - q.x1, dy = q.y2 - q.y1, Lb = Math.hypot(dx, dy); if (Lb < 1e-6) return;
        var nx = -dy / Lb * q.b / 2000, ny = dx / Lb * q.b / 2000;
        d.line("BEAM", p(q.x1 + nx, q.y1 + ny), p(q.x2 + nx, q.y2 + ny)); d.line("BEAM", p(q.x1 - nx, q.y1 - ny), p(q.x2 - nx, q.y2 - ny));
        var ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90.5 || ang < -89.5) ang += 180;
        d.text("TEXT", p((q.x1 + q.x2) / 2 + nx * 3 + (Math.abs(dy) > Math.abs(dx) ? -0.12 : 0), (q.y1 + q.y2) / 2 + ny * 3 + (Math.abs(dx) >= Math.abs(dy) ? 0.12 : 0)), th * 0.75, "B" + bn + " (" + q.b + "x" + q.D + ")", "c", Math.abs(dy) > Math.abs(dx) ? 90 : 0);
      });
      /* walls */
      P.walls.filter(function (q) { return q.s === s; }).forEach(function (q) {
        var dx = q.x2 - q.x1, dy = q.y2 - q.y1, Lw = Math.hypot(dx, dy); if (Lw < 1e-6) return;
        var nx = -dy / Lw * q.t / 2000, ny = dx / Lw * q.t / 2000, c4 = [p(q.x1 + nx, q.y1 + ny), p(q.x2 + nx, q.y2 + ny), p(q.x2 - nx, q.y2 - ny), p(q.x1 - nx, q.y1 - ny)];
        d.pline("WALL", c4, true); d.solid("WALL_FILL", c4);
      });
      P.braces.filter(function (q) { return q.s === s; }).forEach(function (q) { d.line("BRACE", p(q.x1, q.y1), p(q.x2, q.y2)); });
      /* columns: outline + fill, mark */
      var cn = 0;
      P.cols.filter(function (q) { return q.s === s; }).forEach(function (q) {
        cn++; var hx = q.bx / 2000, hy = q.by / 2000, c4 = [p(q.x - hx, q.y - hy), p(q.x + hx, q.y - hy), p(q.x + hx, q.y + hy), p(q.x - hx, q.y + hy)];
        d.solid("COLUMN_FILL", c4); d.pline("COLUMN", c4, true);
        d.text("TEXT", p(q.x + hx + 0.08, q.y + hy + 0.08), th * 0.7, "C" + cn, "l");
      });
      var title = (P.storeys[s - 1] ? P.storeys[s - 1].name.toUpperCase() : "LEVEL " + s) + " — FRAMING PLAN AT +" + lv[s].toFixed(3);
      d.text("TITLE", p((minx + maxx) / 2, miny - ext - 0.2), th * 1.8, title, "c");
      d.text("TITLE", p((minx + maxx) / 2, miny - ext - 0.75), th, "Columns below this level: " + cn + " · beams: " + bn + " · slabs: " + sn + " · dimensions in mm", "c");
    });
    /* column schedule */
    var sx = -minx + ext, sy = -miny - 3.5, row = 0;
    d.text("TITLE", [sx, sy], th * 1.5, "COLUMN SCHEDULE (size along X x along Y, mm)", "l");
    var sizes = {};
    P.cols.forEach(function (c) { var k = c.bx + " x " + c.by; sizes[k] = sizes[k] || {}; sizes[k][c.s] = (sizes[k][c.s] || 0) + 1; });
    Object.keys(sizes).forEach(function (k) { row++; d.text("TEXT", [sx, sy - row * th * 2], th, k + " :  " + Object.keys(sizes[k]).map(function (s) { return (P.storeys[s - 1] ? P.storeys[s - 1].name : s) + " " + sizes[k][s] + " nos"; }).join(", "), "l"); });
    var totalW = plans.length * (W + 2 * ext + gap);
    return { text: C.dxfDoc(layers, [0, sy - row * th * 2 - 1, totalW, H + 2 * ext + 2, 0], d, true), sheets: plans.length };
  };

  /* project file */
  C.save = function (P) { return JSON.stringify(P, null, 1); };
  C.load = function (txt) {
    var P = JSON.parse(txt); if (!P || !P.storeys || !P.grids) throw new Error("Not an IS StructModeller project file");
    var b = C.blank(); Object.keys(b).forEach(function (k) { if (P[k] === undefined) P[k] = b[k]; }); P.def = Object.assign(b.def, P.def || {});
    return P;
  };
  C.sample = function () {
    var P = C.blank("Sample G+3 residential building");
    C.setGrid(P, [4, 4.5, 4], [3.5, 4.5, 3.5]); C.setStoreys(P, [3.6, 3.2, 3.2, 3.2]); C.generate(P);
    return P;
  };
  return C;
})();
if (typeof module !== "undefined") module.exports = MC;
