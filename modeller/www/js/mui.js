/* IS StructModeller — interface: setup, plan editor (canvas), 3D view, checks, quantities, export. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "ism.project", THK = "ism.theme";
  var P, S = { st: 1, tool: "sel", sel: null, pend: null, hover: null, undo: [], redo: [], view: null, v3: { az: -0.65, el: 0.5, zoom: 1, slabs: true } };
  try { document.documentElement.dataset.th = localStorage.getItem(THK) || ""; } catch (e) {}

  /* ---------------- state ---------------- */
  function load() {
    try { var t = localStorage.getItem(KEY); if (t) { P = MC.load(t); return; } } catch (e) {}
    P = MC.sample();
  }
  function persist() { try { localStorage.setItem(KEY, MC.save(P)); } catch (e) {} }
  function commit(label) {
    S.undo.push(JSON.stringify(P)); if (S.undo.length > 80) S.undo.shift(); S.redo = [];
    return label;
  }
  function changed() { persist(); refresh(); }
  function undo() { if (!S.undo.length) return toast("Nothing to undo"); S.redo.push(JSON.stringify(P)); P = JSON.parse(S.undo.pop()); S.sel = null; S.pend = null; changed(); }
  function redo() { if (!S.redo.length) return toast("Nothing to redo"); S.undo.push(JSON.stringify(P)); P = JSON.parse(S.redo.pop()); S.sel = null; changed(); }
  function toast(t) { var e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(function () { e.classList.remove("on"); }, 2200); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- tabs & menu ---------------- */
  var tab = "setup";
  $("tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; show(b.dataset.t); };
  function show(t) {
    tab = t; [].forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.dataset.t === t); });
    [].forEach.call(document.querySelectorAll("main section"), function (s) { s.classList.toggle("on", s.id === t); });
    refresh(); if (t === "plan") { sizeCanvas(); if (!S.view) fit(); drawPlan(); } if (t === "v3d") { size3d(); draw3d(); }
  }
  $("bMenu").onclick = function (e) { e.stopPropagation(); $("menu").classList.toggle("on"); };
  document.addEventListener("click", function (e) { if (!e.target.closest("#menu")) $("menu").classList.remove("on"); });
  $("menu").onclick = function (e) {
    var b = e.target.closest("button"); if (!b) return; $("menu").classList.remove("on");
    var m = b.dataset.m;
    if (m === "new") { if (!confirm("Start a new building? The current model is replaced (save it first if needed).")) return; commit(); P = MC.blank("New building"); MC.setGrid(P, [5, 5], [5]); MC.setStoreys(P, [3.2, 3]); S.sel = null; S.view = null; changed(); show("setup"); }
    else if (m === "sample") { commit(); P = MC.sample(); S.sel = null; S.view = null; changed(); show("plan"); }
    else if (m === "open") $("fOpen").click();
    else if (m === "save") saveProject();
    else if (m === "dxf") exportDxf(); else if (m === "plans") exportPlans();
    else if (m === "theme") { var th = document.documentElement.dataset.th === "dark" ? "" : "dark"; document.documentElement.dataset.th = th; try { localStorage.setItem(THK, th); } catch (er) {} refresh(); }
    else if (m === "about") alert("IS StructModeller " + MC.VERSION + "\nCompanion to IS StructDesign. Model a building on grids and storeys and export it as DXF: a 3D analysis model whose layer names carry the member sizes, and 2D framing plans.\n\nDesign checks are done in IS StructDesign; this app checks the model's connectivity only.");
  };
  $("bUndo").onclick = undo; $("bRedo").onclick = redo;

  /* ---------------- files ---------------- */
  /* in a Claude artifact, files go through the viewer's "downloads" capability; types it does not allow (.dxf) travel inside a .zip */
  var DL = null;
  try { if (window.claude && window.claude.use) window.claude.use("downloads").then(function (d) { DL = d; }, function () {}); } catch (e) {}
  function zipOne(name, text) {
    var data = new TextEncoder().encode(text), nm = new TextEncoder().encode(name), T = zipOne.T;
    if (!T) { T = zipOne.T = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < data.length; i++) crc = T[(crc ^ data[i]) & 255] ^ (crc >>> 8); crc = (crc ^ 0xFFFFFFFF) >>> 0;
    var d = new Date(), dt = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dd = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var L = 30 + nm.length, C = 46 + nm.length, out = new Uint8Array(L + data.length + C + 22), v = new DataView(out.buffer);
    function hdr(o, central) {
      var p = o; v.setUint32(p, central ? 0x02014b50 : 0x04034b50, true); p += 4; if (central) { v.setUint16(p, 20, true); p += 2; }
      v.setUint16(p, 20, true); v.setUint16(p + 2, 0x0800, true); v.setUint16(p + 4, 0, true); v.setUint16(p + 6, dt, true); v.setUint16(p + 8, dd, true);
      v.setUint32(p + 10, crc, true); v.setUint32(p + 14, data.length, true); v.setUint32(p + 18, data.length, true); v.setUint16(p + 22, nm.length, true); v.setUint16(p + 24, 0, true); p += 26;
      if (central) p += 14; /* comment length, disk, attributes, local header offset: all 0 */
      out.set(nm, p); return p + nm.length;
    }
    var p = hdr(0, false); out.set(data, p); p += data.length; var cd = p; p = hdr(p, true);
    v.setUint32(p, 0x06054b50, true); v.setUint16(p + 8, 1, true); v.setUint16(p + 10, 1, true); v.setUint32(p + 12, C, true); v.setUint32(p + 16, cd, true);
    return out;
  }
  function download(name, text, mime) {
    if (window.AndroidBridge && AndroidBridge.saveFile) { AndroidBridge.saveFile(name, text); return; }
    if (DL) {
      var fn = name, data = text;
      if (!/\.(json|txt|csv|md)$/i.test(name)) { data = zipOne(name, text); fn = name.replace(/\.[^.]+$/, "") + ".zip"; }
      DL.save({ filename: fn, data: data }).then(function () { toast("Saved " + fn + (fn !== name ? " — unzip it for " + name : "")); }, function (e) { if (!e || e.code !== "declined") toast("Could not save: " + (e && (e.message || e.code))); });
      return;
    }
    var url = URL.createObjectURL(new Blob([text], { type: mime || "application/octet-stream" })), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function safe(n) { return String(n || "building").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "building"; }
  function saveProject() { download(safe(P.name) + ".ism.json", MC.save(P), "application/json"); toast("Project file saved"); }
  function exportDxf() {
    var bad = MC.check(P).filter(function (c) { return c.sev === "err"; });
    if (bad.length && !confirm(bad.length + " model error(s) — see Checks. Export anyway?")) return;
    var r = MC.dxfModel(P); download(safe(P.name) + "_model.dxf", r.text, "application/dxf");
    toast("Analysis DXF exported — " + r.layers.length + " layers" + (r.warn.length ? " · " + r.warn[0] : ""));
  }
  function exportPlans() { var r = MC.dxfPlans(P); download(safe(P.name) + "_plans.dxf", r.text, "application/dxf"); toast(r.sheets + " framing plan(s) exported"); }
  $("fOpen").onchange = function (e) {
    var f = e.target.files[0]; if (!f) return; var rd = new FileReader();
    rd.onload = function () { try { var np = MC.load(String(rd.result)); commit(); P = np; S.sel = null; S.view = null; S.st = 1; changed(); toast("Opened " + f.name); show("plan"); } catch (er) { alert(er.message); } e.target.value = ""; };
    rd.readAsText(f);
  };
  $("eDxf").onclick = exportDxf; $("ePlans").onclick = exportPlans; $("eSave").onclick = saveProject; $("eOpen").onclick = function () { $("fOpen").click(); };

  /* ---------------- setup ---------------- */
  function spacing(g) { var o = []; for (var i = 1; i < g.length; i++) o.push(+(g[i].p - g[i - 1].p).toFixed(3)); return compress(o); }
  function compress(a) { var o = [], i = 0; while (i < a.length) { var j = i; while (j + 1 < a.length && a[j + 1] === a[i]) j++; o.push(j > i ? (j - i + 1) + "*" + a[i] : String(a[i])); i = j + 1; } return o.join(", "); }
  function fillSetup() {
    $("sName").value = P.name; $("sFck").value = P.def.fck; $("sFy").value = P.def.fy;
    $("sGx").value = spacing(P.grids.x); $("sGy").value = spacing(P.grids.y);
    $("sHs").value = compress(P.storeys.map(function (s) { return s.h; })); $("sHn").value = P.storeys.map(function (s) { return s.name; }).join(", ");
    $("dCx").value = P.def.col.bx; $("dCy").value = P.def.col.by; $("dBb").value = P.def.beam.b; $("dBd").value = P.def.beam.D; $("dSt").value = P.def.slab.t; $("dWt").value = P.def.wall.t; $("dSup").value = P.def.sup; $("dBr").value = P.def.brace.sec;
  }
  function readGrid() {
    var gx = MC.spans($("sGx").value), gy = MC.spans($("sGy").value), hs = MC.spans($("sHs").value), hn = $("sHn").value.split(",").map(function (s) { return s.trim(); });
    if (!gx.length && !gy.length) throw new Error("Give at least one spacing along X or Y");
    if (!hs.length) throw new Error("Give at least one storey height");
    if (hn.length !== hs.length || hn.some(function (s) { return !s; })) hn = null;
    return { gx: gx, gy: gy, hs: hs, hn: hn };
  }
  $("sName").onchange = function () { commit(); P.name = $("sName").value.trim() || "Building"; changed(); };
  $("sFck").onchange = $("sFy").onchange = function () { commit(); P.def.fck = +$("sFck").value; P.def.fy = +$("sFy").value; changed(); };
  $("bGrid").onclick = function () {
    try {
      var g = readGrid(); commit(); MC.setGrid(P, g.gx, g.gy); var old = P.storeys.length; MC.setStoreys(P, g.hs, g.hn);
      var n = P.storeys.length; ["cols", "walls", "braces"].forEach(function (k) { P[k] = P[k].filter(function (e) { return e.s <= n; }); }); ["beams", "slabs"].forEach(function (k) { P[k] = P[k].filter(function (e) { return e.lv <= n; }); });
      S.st = Math.min(S.st, n); S.view = null; changed(); toast("Grids and " + n + " storeys applied" + (n < old ? " (elements above storey " + n + " removed)" : ""));
    } catch (e) { alert(e.message); }
  };
  $("bGen").onclick = function () {
    try {
      var g = readGrid();
      if ((P.cols.length || P.beams.length) && !confirm("Replace the model with a full frame on the grid?")) return;
      commit(); MC.setGrid(P, g.gx, g.gy); MC.setStoreys(P, g.hs, g.hn); MC.generate(P); S.st = 1; S.view = null; S.sel = null; changed();
      toast(P.cols.length + " columns, " + P.beams.length + " beams, " + P.slabs.length + " slabs generated"); show("plan");
    } catch (e) { alert(e.message); }
  };
  $("bDef").onclick = function () {
    commit();
    P.def.col = { bx: +$("dCx").value || 300, by: +$("dCy").value || 450 }; P.def.beam = { b: +$("dBb").value || 230, D: +$("dBd").value || 450 };
    P.def.slab = { t: +$("dSt").value || 150 }; P.def.wall = { t: +$("dWt").value || 200 }; P.def.sup = $("dSup").value; P.def.brace = { sec: $("dBr").value };
    changed(); toast("Defaults saved — new members use them");
  };

  /* ---------------- plan: geometry helpers ---------------- */
  var pc = $("pc"), pctx = pc.getContext("2d"), DPR = Math.max(1, window.devicePixelRatio || 1);
  function bounds() {
    var xs = P.grids.x.map(function (g) { return g.p; }), ys = P.grids.y.map(function (g) { return g.p; });
    MC.kinds.forEach(function (k) { P[k].forEach(function (e) { if (e.x !== undefined) { xs.push(e.x); ys.push(e.y); } if (e.x1 !== undefined) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); } }); });
    if (!xs.length) { xs = [0, 10]; ys = [0, 10]; }
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  }
  function sizeCanvas() { var w = $("pw").clientWidth || 360, h = Math.max(320, Math.min(window.innerHeight - 260, w * 1.05)); pc.width = w * DPR; pc.height = h * DPR; pc.style.height = h + "px"; }
  function fit() {
    var b = bounds(), w = pc.width / DPR, h = pc.height / DPR, pad = 52, sx = (w - 2 * pad) / Math.max(b.x1 - b.x0, 1), sy = (h - 2 * pad) / Math.max(b.y1 - b.y0, 1), s = Math.min(sx, sy);
    S.view = { s: s, ox: w / 2 - s * (b.x0 + b.x1) / 2, oy: h / 2 + s * (b.y0 + b.y1) / 2 };
  }
  function W2S(x, y) { return [S.view.ox + S.view.s * x, S.view.oy - S.view.s * y]; }
  function S2W(X, Y) { return [(X - S.view.ox) / S.view.s, (S.view.oy - Y) / S.view.s]; }
  /* snapping: grid intersections, element ends and columns, grid lines, then a 50 mm grid */
  function snap(X, Y) {
    var w = S2W(X, Y), best = null, bd = 18 / S.view.s;
    function tryP(x, y, k) { var d = Math.hypot(x - w[0], y - w[1]); if (d < bd) { bd = d; best = { x: x, y: y, k: k }; } }
    P.grids.x.forEach(function (gx) { P.grids.y.forEach(function (gy) { tryP(gx.p, gy.p, "grid " + gx.id + "-" + gy.id); }); });
    P.cols.forEach(function (c) { if (c.s === S.st || c.s === S.st + 1) tryP(c.x, c.y, "column"); });
    P.beams.forEach(function (b) { if (b.lv === S.st) { tryP(b.x1, b.y1, "beam end"); tryP(b.x2, b.y2, "beam end"); tryP((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, "beam middle"); } });
    P.walls.forEach(function (b) { if (b.s === S.st) { tryP(b.x1, b.y1, "wall end"); tryP(b.x2, b.y2, "wall end"); } });
    if (best) return best;
    var st = 0.05, x = Math.round(w[0] / st) * st, y = Math.round(w[1] / st) * st, lt = 12 / S.view.s, k = "free";
    P.grids.x.forEach(function (gx) { if (Math.abs(gx.p - w[0]) < lt) { x = gx.p; k = "on grid " + gx.id; } });
    P.grids.y.forEach(function (gy) { if (Math.abs(gy.p - w[1]) < lt) { y = gy.p; k = k === "free" ? "on grid " + gy.id : "grid " + k.slice(8) + "-" + gy.id; } });
    if (S.pend && k === "free") { if (Math.abs(x - S.pend.x) < lt) x = S.pend.x; if (Math.abs(y - S.pend.y) < lt) y = S.pend.y; }
    return { x: +x.toFixed(3), y: +y.toFixed(3), k: k };
  }
  /* element under a screen point (current storey) */
  function hit(X, Y) {
    var w = S2W(X, Y), tol = 10 / S.view.s, best = null, bd = Infinity;
    function seg(e, x1, y1, x2, y2, pr) { var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((w[0] - x1) * dx + (w[1] - y1) * dy) / L2)) : 0, d = Math.hypot(x1 + t * dx - w[0], y1 + t * dy - w[1]); if (d < tol && d + pr < bd) { bd = d + pr; best = e; } }
    P.cols.forEach(function (c) { if (c.s !== S.st) return; var hx = Math.max(c.bx / 2000, 7 / S.view.s), hy = Math.max(c.by / 2000, 7 / S.view.s); if (Math.abs(w[0] - c.x) <= hx + tol / 2 && Math.abs(w[1] - c.y) <= hy + tol / 2) { var d = Math.hypot(w[0] - c.x, w[1] - c.y) - 1; if (d < bd) { bd = d; best = c; } } });
    P.beams.forEach(function (b) { if (b.lv === S.st) seg(b, b.x1, b.y1, b.x2, b.y2, 0); });
    P.walls.forEach(function (b) { if (b.s === S.st) seg(b, b.x1, b.y1, b.x2, b.y2, 0); });
    P.braces.forEach(function (b) { if (b.s === S.st) seg(b, b.x1, b.y1, b.x2, b.y2, 0.001); });
    if (!best) P.slabs.forEach(function (s) { if (s.lv !== S.st) return; if (w[0] >= Math.min(s.x1, s.x2) && w[0] <= Math.max(s.x1, s.x2) && w[1] >= Math.min(s.y1, s.y2) && w[1] <= Math.max(s.y1, s.y2)) best = s; });
    return best;
  }
  function cellAt(x, y) {
    var X = P.grids.x.map(function (g) { return g.p; }).sort(function (a, b) { return a - b; }), Y = P.grids.y.map(function (g) { return g.p; }).sort(function (a, b) { return a - b; });
    var i = -1, j = -1; for (var a = 0; a + 1 < X.length; a++) if (x >= X[a] && x <= X[a + 1]) i = a; for (var b = 0; b + 1 < Y.length; b++) if (y >= Y[b] && y <= Y[b + 1]) j = b;
    return i < 0 || j < 0 ? null : { x1: X[i], x2: X[i + 1], y1: Y[j], y2: Y[j + 1] };
  }

  /* ---------------- plan: actions ---------------- */
  function act(X, Y) {
    var t = S.tool;
    if (t === "sel" || t === "del") {
      var e = hit(X, Y);
      if (t === "del") { if (!e) return; commit(); MC.remove(P, e.id); if (S.sel === e.id) S.sel = null; changed(); toast("Deleted"); return; }
      S.sel = e ? e.id : null; props(); drawPlan(); return;
    }
    var p = snap(X, Y);
    if (t === "col") {
      if (P.cols.some(function (c) { return c.s === S.st && Math.hypot(c.x - p.x, c.y - p.y) < 0.01; })) return toast("A column is already there");
      commit(); var c = { id: MC.uid(), s: S.st, x: p.x, y: p.y, bx: P.def.col.bx, by: P.def.col.by }; P.cols.push(c); S.sel = c.id; changed(); return;
    }
    if (t === "slab") {
      var w = S2W(X, Y), cell = cellAt(w[0], w[1]); if (!cell) return toast("Tap inside a grid bay");
      if (P.slabs.some(function (s) { return s.lv === S.st && Math.abs(Math.min(s.x1, s.x2) - cell.x1) < 1e-6 && Math.abs(Math.min(s.y1, s.y2) - cell.y1) < 1e-6 && Math.abs(Math.max(s.x1, s.x2) - cell.x2) < 1e-6; })) return toast("That bay already has a slab");
      commit(); var sl = Object.assign({ id: MC.uid(), lv: S.st, t: P.def.slab.t }, cell); P.slabs.push(sl); S.sel = sl.id; changed(); return;
    }
    /* two-point tools: beam (chains), wall, brace */
    if (!S.pend) { S.pend = p; $("pFin").style.display = t === "beam" ? "block" : "none"; drawPlan(); return; }
    if (Math.hypot(p.x - S.pend.x, p.y - S.pend.y) < 0.05) { S.pend = null; $("pFin").style.display = "none"; drawPlan(); return; }
    commit();
    var a = S.pend, el;
    if (t === "beam") el = { id: MC.uid(), lv: S.st, x1: a.x, y1: a.y, x2: p.x, y2: p.y, b: P.def.beam.b, D: P.def.beam.D }, P.beams.push(el);
    else if (t === "wall") el = { id: MC.uid(), s: S.st, x1: a.x, y1: a.y, x2: p.x, y2: p.y, t: P.def.wall.t }, P.walls.push(el);
    else el = { id: MC.uid(), s: S.st, x1: a.x, y1: a.y, x2: p.x, y2: p.y, sec: P.def.brace.sec }, P.braces.push(el);
    S.sel = el.id; S.pend = t === "beam" ? p : null; if (!S.pend) $("pFin").style.display = "none";
    changed();
  }
  $("pFin").onclick = function () { S.pend = null; this.style.display = "none"; drawPlan(); };
  $("tools").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; S.tool = b.dataset.tool; S.pend = null; $("pFin").style.display = "none"; [].forEach.call(this.querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); }); hud(); drawPlan(); };
  $("stChips").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; S.st = +b.dataset.s; S.sel = null; S.pend = null; refresh(); };
  $("pFit").onclick = function () { fit(); drawPlan(); }; $("pIn").onclick = function () { zoomAt(1.25); }; $("pOut").onclick = function () { zoomAt(0.8); };
  function zoomAt(f, X, Y) { var w = pc.width / DPR, h = pc.height / DPR; X = X === undefined ? w / 2 : X; Y = Y === undefined ? h / 2 : Y; S.view.ox = X - (X - S.view.ox) * f; S.view.oy = Y - (Y - S.view.oy) * f; S.view.s *= f; drawPlan(); }
  $("aCols").onclick = function () { commit(); var n = 0; P.grids.x.forEach(function (gx) { P.grids.y.forEach(function (gy) { if (!P.cols.some(function (c) { return c.s === S.st && Math.hypot(c.x - gx.p, c.y - gy.p) < 0.01; })) { P.cols.push({ id: MC.uid(), s: S.st, x: gx.p, y: gy.p, bx: P.def.col.bx, by: P.def.col.by }); n++; } }); }); changed(); toast(n + " column(s) added"); };
  $("aBeams").onclick = function () {
    commit(); var n = 0, X = P.grids.x, Y = P.grids.y;
    function addB(x1, y1, x2, y2) { var b = { id: MC.uid(), lv: S.st, x1: x1, y1: y1, x2: x2, y2: y2, b: P.def.beam.b, D: P.def.beam.D }; if (!P.beams.some(function (o) { return o.lv === S.st && MC.key("beams", o) === MC.key("beams", b); })) { P.beams.push(b); n++; } }
    Y.forEach(function (gy) { for (var i = 0; i + 1 < X.length; i++) addB(X[i].p, gy.p, X[i + 1].p, gy.p); });
    X.forEach(function (gx) { for (var j = 0; j + 1 < Y.length; j++) addB(gx.p, Y[j].p, gx.p, Y[j + 1].p); });
    changed(); toast(n + " beam(s) added");
  };
  $("aSlabs").onclick = function () {
    commit(); var n = 0, X = P.grids.x, Y = P.grids.y;
    for (var i = 0; i + 1 < X.length; i++) for (var j = 0; j + 1 < Y.length; j++) { var s = { id: MC.uid(), lv: S.st, x1: X[i].p, y1: Y[j].p, x2: X[i + 1].p, y2: Y[j + 1].p, t: P.def.slab.t }; if (!P.slabs.some(function (o) { return o.lv === S.st && MC.key("slabs", o) === MC.key("slabs", s); })) { P.slabs.push(s); n++; } }
    changed(); toast(n + " slab(s) added");
  };
  $("aCopy").onclick = function () {
    var n = P.storeys.length; if (n < 2) return toast("Only one storey");
    var ans = prompt("Copy " + P.storeys[S.st - 1].name + " (its columns, walls, braces, and the beams and slabs at its top) to which storeys?\nNumbers 1–" + n + ", e.g. 2-" + n + " or 3,4. Existing elements there are replaced.", S.st === 1 ? "2-" + n : "");
    if (!ans) return;
    var tg = []; ans.split(/[,\s]+/).forEach(function (t) { var m = t.match(/^(\d+)\s*-\s*(\d+)$/); if (m) { for (var k = +m[1]; k <= +m[2]; k++) tg.push(k); } else if (+t) tg.push(+t); });
    tg = tg.filter(function (k) { return k >= 1 && k <= n && k !== S.st; });
    if (!tg.length) return toast("No valid storeys");
    commit(); MC.copyStorey(P, S.st, tg, true); changed(); toast("Copied to storey " + tg.join(", "));
  };
  $("aClear").onclick = function () {
    if (!confirm("Remove everything in " + P.storeys[S.st - 1].name + " (columns, walls, braces, beams and slabs at its top)?")) return;
    commit(); var s = S.st; ["cols", "walls", "braces"].forEach(function (k) { P[k] = P[k].filter(function (e) { return e.s !== s; }); }); ["beams", "slabs"].forEach(function (k) { P[k] = P[k].filter(function (e) { return e.lv !== s; }); }); S.sel = null; changed();
  };

  /* pointer: tap = act, drag = pan, pinch = zoom, wheel = zoom */
  var ptrs = {}, gest = null;
  function pos(e) { var r = pc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  pc.addEventListener("pointerdown", function (e) { pc.setPointerCapture(e.pointerId); ptrs[e.pointerId] = pos(e); var k = Object.keys(ptrs); if (k.length === 1) gest = { start: pos(e), moved: false, ox: S.view.ox, oy: S.view.oy }; else if (k.length === 2) { var a = ptrs[k[0]], b = ptrs[k[1]]; gest = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), s: S.view.s, ox: S.view.ox, oy: S.view.oy, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], moved: true }; } });
  pc.addEventListener("pointermove", function (e) {
    var p = pos(e);
    if (!ptrs[e.pointerId]) { S.hover = snap(p[0], p[1]); S.hoverS = p; hud(); drawPlan(); return; }
    ptrs[e.pointerId] = p; var k = Object.keys(ptrs);
    if (k.length === 2 && gest && gest.pinch) { var a = ptrs[k[0]], b = ptrs[k[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]), f = d / gest.pinch; S.view.s = gest.s * f; S.view.ox = gest.c[0] - (gest.c[0] - gest.ox) * f; S.view.oy = gest.c[1] - (gest.c[1] - gest.oy) * f; drawPlan(); return; }
    if (gest && !gest.pinch) { var dx = p[0] - gest.start[0], dy = p[1] - gest.start[1]; if (Math.hypot(dx, dy) > 8) gest.moved = true; if (gest.moved) { S.view.ox = gest.ox + dx; S.view.oy = gest.oy + dy; drawPlan(); } else if (S.pend) { S.hover = snap(p[0], p[1]); drawPlan(); } }
  });
  function up(e) { var g = gest, p = pos(e); delete ptrs[e.pointerId]; if (Object.keys(ptrs).length === 0) { if (g && !g.moved && !g.pinch) act(p[0], p[1]); gest = null; } }
  pc.addEventListener("pointerup", up); pc.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; gest = null; });
  pc.addEventListener("wheel", function (e) { e.preventDefault(); var p = pos(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p[0], p[1]); }, { passive: false });
  pc.addEventListener("pointerleave", function () { if (!S.pend) { S.hover = null; drawPlan(); } });

  /* ---------------- plan: drawing ---------------- */
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function drawPlan() {
    if (tab !== "plan" || !S.view) return;
    var c = pctx, w = pc.width / DPR, h = pc.height / DPR, s = S.st, k = S.view.s;
    c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, w, h);
    var cg = css("--grid"), cc = css("--col"), cb = css("--beam"), cs = css("--slab"), cw = css("--wall"), cbr = css("--brace"), csel = css("--sel"), ink = css("--ink"), mut = css("--mut");
    /* slabs */
    P.slabs.forEach(function (q) { if (q.lv !== s) return; var a = W2S(Math.min(q.x1, q.x2), Math.max(q.y1, q.y2)), b = W2S(Math.max(q.x1, q.x2), Math.min(q.y1, q.y2)); c.fillStyle = q.id === S.sel ? "rgba(217,119,6,.22)" : hexA(cs, 0.13); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); if (k > 25) { c.fillStyle = mut; c.font = "11px system-ui"; c.textAlign = "center"; c.fillText(q.t + " mm", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4); } });
    /* grids */
    var b = bounds(); c.setLineDash([10, 4, 2, 4]); c.strokeStyle = cg; c.lineWidth = 1;
    P.grids.x.forEach(function (g) { var a = W2S(g.p, b.y0 - 0.8), z = W2S(g.p, b.y1 + 0.8); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(z[0], z[1]); c.stroke(); bubble(z[0], z[1] - 13, g.id); });
    P.grids.y.forEach(function (g) { var a = W2S(b.x0 - 0.8, g.p), z = W2S(b.x1 + 0.8, g.p); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(z[0], z[1]); c.stroke(); bubble(a[0] - 13, a[1], g.id); });
    c.setLineDash([]);
    function bubble(x, y, t) { c.beginPath(); c.arc(x, y, 11, 0, 7); c.fillStyle = css("--card"); c.fill(); c.strokeStyle = mut; c.stroke(); c.fillStyle = ink; c.font = "600 11px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, x, y + 0.5); c.textBaseline = "alphabetic"; }
    /* columns of the storey above, faint (they stand on this floor) */
    P.cols.forEach(function (q) { if (q.s !== s + 1) return; var a = W2S(q.x - q.bx / 2000, q.y + q.by / 2000); c.strokeStyle = hexA(cc, 0.35); c.setLineDash([3, 3]); c.strokeRect(a[0], a[1], Math.max(q.bx / 1000 * k, 6), Math.max(q.by / 1000 * k, 6)); c.setLineDash([]); });
    /* walls, beams, braces */
    P.walls.forEach(function (q) { if (q.s !== s) return; line(q, q.id === S.sel ? csel : cw, Math.max(q.t / 1000 * k, 5)); });
    P.beams.forEach(function (q) { if (q.lv !== s) return; line(q, q.id === S.sel ? csel : cb, Math.max(Math.min(q.b / 1000 * k, 14), 3)); });
    P.braces.forEach(function (q) { if (q.s !== s) return; c.setLineDash([6, 4]); line(q, q.id === S.sel ? csel : cbr, 2.5); c.setLineDash([]); });
    function line(q, col, lw) { var a = W2S(q.x1, q.y1), z = W2S(q.x2, q.y2); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "butt"; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(z[0], z[1]); c.stroke(); c.lineWidth = 1; }
    /* columns of this storey */
    P.cols.forEach(function (q) { if (q.s !== s) return; var ww = Math.max(q.bx / 1000 * k, 8), hh = Math.max(q.by / 1000 * k, 8), a = W2S(q.x, q.y); c.fillStyle = q.id === S.sel ? csel : cc; c.fillRect(a[0] - ww / 2, a[1] - hh / 2, ww, hh); });
    /* pending and hover */
    if (S.pend) { var a = W2S(S.pend.x, S.pend.y); c.fillStyle = csel; c.beginPath(); c.arc(a[0], a[1], 5, 0, 7); c.fill(); if (S.hover) { var z = W2S(S.hover.x, S.hover.y); c.strokeStyle = csel; c.setLineDash([5, 4]); c.lineWidth = 2; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(z[0], z[1]); c.stroke(); c.setLineDash([]); c.lineWidth = 1; c.fillStyle = ink; c.font = "12px system-ui"; c.textAlign = "left"; c.fillText(f2(Math.hypot(S.hover.x - S.pend.x, S.hover.y - S.pend.y)) + " m", z[0] + 8, z[1] - 8); } }
    if (S.hover && S.tool !== "sel" && S.tool !== "del" && S.tool !== "slab") { var hv = W2S(S.hover.x, S.hover.y); c.strokeStyle = csel; c.lineWidth = 1.5; c.beginPath(); c.arc(hv[0], hv[1], 7, 0, 7); c.stroke(); c.lineWidth = 1; }
  }
  function hexA(col, a) { var m = col.match(/^#([0-9a-f]{6})$/i); if (!m) return col; var n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }
  function hud() {
    var t = { sel: "Tap a member to edit it", col: "Tap a grid point to place a column", beam: S.pend ? "Tap the other end — beams chain; Finish to stop" : "Tap the first end of the beam", slab: "Tap inside a bay to add its slab", wall: S.pend ? "Tap the other end of the wall" : "Tap the first end of the wall", brace: S.pend ? "Tap the top end (next column line)" : "Tap the bottom end of the brace", del: "Tap a member to delete it" }[S.tool];
    $("phud").textContent = (S.hover && S.hover.k ? "(" + f2(S.hover.x) + ", " + f2(S.hover.y) + ") " + S.hover.k + " · " : "") + t;
  }

  /* ---------------- properties of the selected member ---------------- */
  function props() {
    var box = $("props"), f = S.sel ? MC.find(P, S.sel) : null;
    if (!f) { box.style.display = "none"; return; }
    var e = f.el, h = "", k = f.kind, nm = { cols: "Column", beams: "Beam", slabs: "Slab", walls: "Wall", braces: "Brace" }[k];
    function n(id, l, v) { return '<label class="f"><span>' + l + '</span><input id="' + id + '" type="number" value="' + v + '"></label>'; }
    if (k === "cols") h = '<div class="row">' + n("eBx", "Size along X (mm)", e.bx) + n("eBy", "Size along Y (mm)", e.by) + '</div><div class="row">' + n("eX", "x (m)", e.x) + n("eY", "y (m)", e.y) + '</div>' + (e.s === 1 ? '<label class="f"><span>Base support</span><select id="eSup"><option value="">Default (' + P.def.sup + ')</option><option value="fixed">Fixed</option><option value="pinned">Pinned</option></select></label>' : '');
    else if (k === "beams") h = '<div class="row">' + n("eB", "Width b (mm)", e.b) + n("eD", "Depth D (mm)", e.D) + '</div><div class="note">Length ' + f2(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)) + ' m, from (' + f2(e.x1) + ', ' + f2(e.y1) + ') to (' + f2(e.x2) + ', ' + f2(e.y2) + ')</div>';
    else if (k === "slabs") h = n("eT", "Thickness (mm)", e.t) + '<div class="note">' + f2(Math.abs(e.x2 - e.x1)) + ' × ' + f2(Math.abs(e.y2 - e.y1)) + ' m</div>';
    else if (k === "walls") h = n("eT", "Thickness (mm)", e.t) + '<div class="note">Length ' + f2(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)) + ' m, storey height</div>';
    else h = '<label class="f"><span>Section</span><input id="eSec" value="' + esc(e.sec) + '"></label>';
    box.innerHTML = '<h3>' + nm + ' — ' + (k === "beams" || k === "slabs" ? MC.levelName(P, e.lv) : P.storeys[e.s - 1].name) + '</h3>' + h +
      '<div class="btns"><button class="btn pri" id="eApply">Apply</button><button class="btn" id="eAll">Apply to all alike</button><button class="btn dan" id="eDel">Delete</button></div><div class="note">"All alike" changes every ' + nm.toLowerCase() + ' of the same size on this storey.</div>';
    box.style.display = "block";
    if ($("eSup")) $("eSup").value = e.sup || "";
    function vals() {
      if (k === "cols") return { bx: +$("eBx").value, by: +$("eBy").value };
      if (k === "beams") return { b: +$("eB").value, D: +$("eD").value };
      if (k === "slabs" || k === "walls") return { t: +$("eT").value };
      return { sec: $("eSec").value.trim() };
    }
    function same(a) { return k === "cols" ? a.bx === e.bx && a.by === e.by && a.s === e.s : k === "beams" ? a.b === e.b && a.D === e.D && a.lv === e.lv : k === "slabs" ? a.t === e.t && a.lv === e.lv : k === "walls" ? a.t === e.t && a.s === e.s : a.sec === e.sec && a.s === e.s; }
    function okv(v) { return Object.keys(v).every(function (q) { return q === "sec" ? !!v[q] : v[q] >= 75 && v[q] <= 3000; }); }
    $("eApply").onclick = function () {
      var v = vals(); if (!okv(v)) return toast("Sizes must be 75–3000 mm");
      commit(); Object.assign(e, v);
      if (k === "cols") { var x = +$("eX").value, y = +$("eY").value; if (isFinite(x) && isFinite(y)) { e.x = x; e.y = y; } if ($("eSup")) { if ($("eSup").value) e.sup = $("eSup").value; else delete e.sup; } }
      changed(); toast("Updated");
    };
    $("eAll").onclick = function () { var v = vals(); if (!okv(v)) return toast("Sizes must be 75–3000 mm"); commit(); var n = 0; P[k].forEach(function (a) { if (a !== e && same(a)) { Object.assign(a, v); n++; } }); Object.assign(e, v); changed(); toast((n + 1) + " member(s) updated"); };
    $("eDel").onclick = function () { commit(); MC.remove(P, e.id); S.sel = null; changed(); };
  }

  /* ---------------- 3D view ---------------- */
  var tc = $("tc"), tctx = tc.getContext("2d");
  function size3d() { var w = $("tw").clientWidth || 360, h = Math.max(360, Math.min(window.innerHeight - 180, w * 1.1)); tc.width = w * DPR; tc.height = h * DPR; tc.style.height = h + "px"; }
  function draw3d() {
    if (tab !== "v3d") return;
    var c = tctx, w = tc.width / DPR, h = tc.height / DPR, lv = MC.levels(P), b = bounds(), zt = lv[lv.length - 1];
    c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, w, h);
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (lv[0] + zt) / 2, R = Math.max(b.x1 - b.x0, b.y1 - b.y0, zt - lv[0], 1);
    var ca = Math.cos(S.v3.az), sa = Math.sin(S.v3.az), ce = Math.cos(S.v3.el), se = Math.sin(S.v3.el), sc = Math.min(w, h) / (1.6 * R) * S.v3.zoom;
    function P3(x, y, z) { x -= cx; y -= cy; z -= cz; var X = x * ca - y * sa, Y = x * sa + y * ca; var up = z * ce + Y * se, dep = Y * ce - z * se; return [w / 2 + X * sc, h / 2 - up * sc, dep]; }
    var items = [], cs = css("--slab"), cw = css("--wall"), cb = css("--beam"), cc = css("--col"), cbr = css("--brace"), cg = css("--grid");
    if (S.v3.slabs) {
      P.slabs.forEach(function (s) { var z = lv[s.lv], q = [P3(s.x1, s.y1, z), P3(s.x2, s.y1, z), P3(s.x2, s.y2, z), P3(s.x1, s.y2, z)]; items.push({ d: avgD(q), poly: q, fill: hexA(cs, 0.16), stroke: hexA(cs, 0.5) }); });
      P.walls.forEach(function (s) { var q = [P3(s.x1, s.y1, lv[s.s - 1]), P3(s.x2, s.y2, lv[s.s - 1]), P3(s.x2, s.y2, lv[s.s]), P3(s.x1, s.y1, lv[s.s])]; items.push({ d: avgD(q), poly: q, fill: hexA(cw, 0.42), stroke: cw }); });
    }
    P.cols.forEach(function (q) { var a = P3(q.x, q.y, lv[q.s - 1]), z = P3(q.x, q.y, lv[q.s]); items.push({ d: (a[2] + z[2]) / 2, ln: [a, z], col: cc, lw: Math.max(2, Math.min(q.bx, q.by) / 1000 * sc * 0.7) }); });
    P.beams.forEach(function (q) { var a = P3(q.x1, q.y1, lv[q.lv]), z = P3(q.x2, q.y2, lv[q.lv]); items.push({ d: (a[2] + z[2]) / 2, ln: [a, z], col: cb, lw: Math.max(1.5, q.b / 1000 * sc * 0.6) }); });
    P.braces.forEach(function (q) { var a = P3(q.x1, q.y1, lv[q.s - 1]), z = P3(q.x2, q.y2, lv[q.s]); items.push({ d: (a[2] + z[2]) / 2, ln: [a, z], col: cbr, lw: 1.5 }); });
    function avgD(q) { return q.reduce(function (s, p) { return s + p[2]; }, 0) / q.length; }
    /* ground grid */
    c.strokeStyle = hexA(cg.length === 7 ? cg : "#9ca3af", 0.6); c.lineWidth = 1; c.setLineDash([6, 4]);
    P.grids.x.forEach(function (g) { var a = P3(g.p, b.y0 - 1, lv[0]), z = P3(g.p, b.y1 + 1, lv[0]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(z[0], z[1]); c.stroke(); });
    P.grids.y.forEach(function (g) { var a = P3(b.x0 - 1, g.p, lv[0]), z = P3(b.x1 + 1, g.p, lv[0]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(z[0], z[1]); c.stroke(); });
    c.setLineDash([]);
    items.sort(function (a, z) { return z.d - a.d; });
    items.forEach(function (it) {
      if (it.poly) { c.beginPath(); it.poly.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.fillStyle = it.fill; c.fill(); c.strokeStyle = it.stroke; c.lineWidth = 0.8; c.stroke(); }
      else { c.strokeStyle = it.col; c.lineWidth = it.lw; c.lineCap = "round"; c.beginPath(); c.moveTo(it.ln[0][0], it.ln[0][1]); c.lineTo(it.ln[1][0], it.ln[1][1]); c.stroke(); }
    });
    var q = MC.qty(P); $("thud").textContent = P.storeys.length + " storeys · " + f2(q.height) + " m high · " + P.cols.length + " columns, " + P.beams.length + " beams, " + P.slabs.length + " slabs, " + P.walls.length + " walls — drag to rotate, pinch or scroll to zoom";
  }
  var tp = {}, tg = null;
  tc.addEventListener("pointerdown", function (e) { tc.setPointerCapture(e.pointerId); tp[e.pointerId] = [e.clientX, e.clientY]; var k = Object.keys(tp); tg = k.length === 2 ? { pinch: Math.hypot(tp[k[0]][0] - tp[k[1]][0], tp[k[0]][1] - tp[k[1]][1]), z: S.v3.zoom } : { x: e.clientX, y: e.clientY, az: S.v3.az, el: S.v3.el }; });
  tc.addEventListener("pointermove", function (e) {
    if (!tp[e.pointerId] || !tg) return; tp[e.pointerId] = [e.clientX, e.clientY]; var k = Object.keys(tp);
    if (k.length === 2 && tg.pinch) { S.v3.zoom = Math.max(0.2, Math.min(8, tg.z * Math.hypot(tp[k[0]][0] - tp[k[1]][0], tp[k[0]][1] - tp[k[1]][1]) / tg.pinch)); }
    else if (!tg.pinch) { S.v3.az = tg.az + (e.clientX - tg.x) * 0.01; S.v3.el = Math.max(-0.2, Math.min(1.5, tg.el + (e.clientY - tg.y) * 0.008)); }
    draw3d();
  });
  tc.addEventListener("pointerup", function (e) { delete tp[e.pointerId]; if (!Object.keys(tp).length) tg = null; });
  tc.addEventListener("pointercancel", function (e) { delete tp[e.pointerId]; tg = null; });
  tc.addEventListener("wheel", function (e) { e.preventDefault(); S.v3.zoom = Math.max(0.2, Math.min(8, S.v3.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); draw3d(); }, { passive: false });
  $("tFit").onclick = function () { S.v3 = { az: -0.65, el: 0.5, zoom: 1, slabs: S.v3.slabs }; draw3d(); };
  $("tSl").onclick = function () { S.v3.slabs = !S.v3.slabs; draw3d(); };

  /* ---------------- checks & quantities ---------------- */
  function renderChecks() {
    var ch = MC.check(P), sym = { err: "✘", warn: "⚠", info: "ℹ", ok: "✔" };
    $("chkList").innerHTML = ch.map(function (c, i) { return '<div class="it"><span class="sev ' + c.sev + '">' + sym[c.sev] + '</span><span>' + esc(c.t) + (c.ids.length === 1 ? ' <a href="#" data-go="' + c.ids[0] + '">show</a>' : '') + '</span></div>'; }).join("");
  }
  $("chkList").onclick = function (e) { var a = e.target.closest("[data-go]"); if (!a) return; e.preventDefault(); var f = MC.find(P, a.dataset.go); if (!f) return; S.st = f.el.s || f.el.lv || 1; S.sel = f.el.id; S.tool = "sel"; show("plan"); props(); };
  $("bTidy").onclick = function () { commit(); var n = MC.dedupe(P); changed(); toast(n ? n + " duplicate(s) removed" : "No duplicates"); };
  function renderQty() {
    var q = MC.qty(P);
    function r(a, b, c, d) { return '<tr><td>' + a + '</td><td class="n">' + b + '</td><td class="n">' + c + '</td><td class="n">' + d + '</td></tr>'; }
    $("qtyBox").innerHTML = '<table><tr><th>Element</th><th class="n">Number</th><th class="n">Size</th><th class="n">Concrete (m³)</th></tr>' +
      r("Columns", q.cols.n, "", q.cols.v.toFixed(2)) + r("Beams (below the slab)", q.beams.n, q.beams.L.toFixed(1) + " m", q.beams.v.toFixed(2)) + r("Slabs", q.slabs.n, q.slabs.A.toFixed(1) + " m²", q.slabs.v.toFixed(2)) + r("Walls", q.walls.n, "", q.walls.v.toFixed(2)) + (q.braces.n ? r("Braces (steel)", q.braces.n, q.braces.L.toFixed(1) + " m", "—") : "") +
      '<tr><td><b>Total concrete</b></td><td></td><td></td><td class="n"><b>' + q.total.toFixed(2) + '</b></td></tr></table>' +
      '<div class="kv" style="margin-top:10px"><b>Floor area (slabs)</b><span>' + q.area.toFixed(1) + ' m²</span><b>Concrete per m² of floor</b><span>' + (q.area ? (q.total / q.area).toFixed(3) : "—") + ' m³/m²</span><b>Reinforcement (indicative)</b><span>' + (q.steel / 1000).toFixed(1) + ' t at ' + q.rate.cols + ' / ' + q.rate.beams + ' / ' + q.rate.slabs + ' / ' + q.rate.walls + ' kg/m³ for columns / beams / slabs / walls</span><b>Height</b><span>' + f2(q.height) + ' m, ' + P.storeys.length + ' storeys</span></div>' +
      '<div class="note">Concrete grade M' + P.def.fck + ', rebar Fe ' + P.def.fy + '. Steel here is a planning ratio, not a design — design the members in IS StructDesign for the bar schedule and the JKSOR estimate.</div>';
  }

  /* ---------------- refresh ---------------- */
  function refresh() {
    $("pname").textContent = P.name + " · " + P.storeys.length + " storeys · " + P.cols.length + " columns";
    if (tab === "setup") fillSetup();
    if (S.st > P.storeys.length) S.st = Math.max(1, P.storeys.length);
    var lv = MC.levels(P);
    $("stChips").innerHTML = P.storeys.map(function (s, i) { return '<button class="chip' + (i + 1 === S.st ? " on" : "") + '" data-s="' + (i + 1) + '">' + esc(s.name) + ' · +' + lv[i + 1].toFixed(2) + '</button>'; }).join("");
    if (P.storeys[S.st - 1]) {
      var s = S.st, n = function (a, f) { return a.filter(f).length; };
      $("stInfo").textContent = "Columns " + lv[s - 1].toFixed(2) + " → " + lv[s].toFixed(2) + " m: " + n(P.cols, function (c) { return c.s === s; }) + " · beams and slabs at +" + lv[s].toFixed(2) + " m: " + n(P.beams, function (c) { return c.lv === s; }) + " beams, " + n(P.slabs, function (c) { return c.lv === s; }) + " slabs · walls " + n(P.walls, function (c) { return c.s === s; });
    }
    if (tab === "plan") { if (!S.view) { sizeCanvas(); fit(); } hud(); props(); drawPlan(); }
    if (tab === "v3d") draw3d();
    if (tab === "checks") renderChecks();
    if (tab === "qty") renderQty();
  }
  window.addEventListener("resize", function () { if (tab === "plan") { sizeCanvas(); drawPlan(); } if (tab === "v3d") { size3d(); draw3d(); } });
  document.addEventListener("keydown", function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.shiftKey && e.key === "Z")) { e.preventDefault(); redo(); }
    else if (e.key === "Escape") { S.pend = null; $("pFin").style.display = "none"; drawPlan(); } else if ((e.key === "Delete" || e.key === "Backspace") && S.sel) { commit(); MC.remove(P, S.sel); S.sel = null; changed(); }
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
  window.ISM = { get P() { return P; }, S: S, show: show, act: act, W2S: function (x, y) { return W2S(x, y); }, refresh: refresh };
  load(); refresh();
})();
