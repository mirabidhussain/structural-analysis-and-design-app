/* IS GeoTech — interface */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); }, r = GC.r, KEY = "isg.project", THK = "isg.theme";
  var P, S = { bh: null, lab: null, f: null, pt: null, open: null, bW: null, group: false, undo: [] }, tab = "site";
  var KC = { sand: "#e2c47a", gravel: "#c49a5c", silt: "#c9b899", clay: "#8ea6b4", rock: "#9a8f87" };
  try { document.documentElement.dataset.th = localStorage.getItem(THK) || ""; } catch (e) {}
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t) { var e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(function () { e.classList.remove("on"); }, 2400); }
  function f1(v, d) { return v === null || v === undefined || !isFinite(v) ? "—" : r(v, d === undefined ? 1 : d).toFixed(d === undefined ? 1 : d); }

  /* ---------------- state ---------------- */
  function load() { try { var t = localStorage.getItem(KEY); if (t) { P = GC.load(t); return; } } catch (e) {} P = GC.sample(); }
  function persist() { try { localStorage.setItem(KEY, GC.save(P)); } catch (e) {} }
  function commit() { S.undo.push(JSON.stringify(P)); if (S.undo.length > 60) S.undo.shift(); }
  function changed() { persist(); refresh(); }
  $("bUndo").onclick = function () { if (!S.undo.length) return toast("Nothing to undo"); P = JSON.parse(S.undo.pop()); changed(); };
  function cur(list, id) { return list.filter(function (x) { return x.id === id; })[0] || list[0] || null; }
  function bh() { return cur(P.boreholes, S.bh); } function ft() { return cur(P.footings, S.f); } function lab() { return cur(P.labs, S.lab); } function pt() { return cur(P.plates, S.pt); }

  /* ---------------- files ---------------- */
  var DL = null; try { if (window.claude && window.claude.use) window.claude.use("downloads").then(function (d) { DL = d; }, function () {}); } catch (e) {}
  function download(name, text, mime) {
    if (window.AndroidBridge && AndroidBridge.saveFile) { AndroidBridge.saveFile(name, text); return; }
    if (DL) { DL.save({ filename: name, data: text }).then(function () { toast("Saved " + name); }, function (e) { if (!e || e.code !== "declined") toast("Could not save: " + (e && (e.message || e.code))); }); return; }
    var url = URL.createObjectURL(new Blob([text], { type: mime })), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function safe(n) { return String(n || "site").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "site"; }
  $("fOpen").onchange = function (e) {
    var fl = e.target.files[0]; if (!fl) return; var rd = new FileReader();
    rd.onload = function () { try { var np = GC.load(String(rd.result)); commit(); P = np; S = Object.assign(S, { bh: null, f: null, lab: null, pt: null, bW: null }); changed(); toast("Opened " + fl.name); } catch (er) { alert(er.message); } e.target.value = ""; };
    rd.readAsText(fl);
  };

  /* ---------------- tabs & menu ---------------- */
  $("tabs").onclick = function (e) { var b = e.target.closest("button"); if (b) show(b.dataset.t); };
  function show(t) { tab = t; [].forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.dataset.t === t); }); [].forEach.call(document.querySelectorAll("main section"), function (s) { s.classList.toggle("on", s.id === t); }); refresh(); window.scrollTo(0, 0); }
  $("bMenu").onclick = function (e) { e.stopPropagation(); $("menu").classList.toggle("on"); };
  document.addEventListener("click", function (e) { if (!e.target.closest("#menu")) $("menu").classList.remove("on"); });
  $("menu").onclick = function (e) {
    var b = e.target.closest("button"); if (!b) return; $("menu").classList.remove("on"); var m = b.dataset.m;
    if (m === "new") { if (!confirm("Start a new site? Save the current one first if you need it.")) return; commit(); P = GC.blank("New site"); P.boreholes.push({ id: GC.uid(), name: "BH-1", gwt: "", layers: [GC.layer({ top: 0, bot: 3, name: "Layer 1" })], spt: [] }); P.footings.push({ id: GC.uid(), name: "F1", bh: P.boreholes[0].id, shape: "square", B: 2, L: 2, Df: 1.5, P: 500, H: 0, eB: 0, eL: 0, x: 0, y: 0 }); S.bh = S.f = null; changed(); show("site"); }
    else if (m === "sample") { commit(); P = GC.sample(); S.bh = S.f = S.lab = S.pt = null; S.bW = null; changed(); show("footing"); }
    else if (m === "open") $("fOpen").click();
    else if (m === "save") download(safe(P.name) + ".isg.json", GC.save(P), "application/json");
    else if (m === "report") show("report");
    else if (m === "theme") { var th = document.documentElement.dataset.th === "dark" ? "" : "dark"; document.documentElement.dataset.th = th; try { localStorage.setItem(THK, th); } catch (er) {} refresh(); }
    else if (m === "about") alert("IS GeoTech " + GC.VERSION + "\\nShallow foundations from borehole data: SPT corrections, soil classification (IS 1498), bearing capacity (IS 6403), settlement (IS 8009 Part 1), limits (IS 1904:2021), plate load test (IS 1888), pressure bulb and weak-layer checks.\\n\\nCorrelations from SPT are estimates; replace them with test values where you have them. Check results before use in design.".replace(/\\n/g, "\n"));
  };

  /* ---------------- generic binding ---------------- */
  function num(v) { return v === "" ? "" : +v; }
  function bind(id, obj, key, isNum, after) {
    var el = $(id); if (!el) return;
    if (el.type === "checkbox") el.checked = !!obj[key]; else if (document.activeElement !== el) el.value = obj[key] === undefined || obj[key] === null ? "" : obj[key];
    el.onchange = function () { commit(); obj[key] = el.type === "checkbox" ? el.checked : isNum ? num(el.value) : el.value; if (after) after(); changed(); };
  }
  function chips(id, list, sel, onPick) {
    $(id).innerHTML = list.map(function (x) { return '<button class="chip' + (x.id === sel ? " on" : "") + '" data-id="' + x.id + '">' + esc(x.name) + '</button>'; }).join("");
    $(id).onclick = function (e) { var b = e.target.closest("button"); if (b) { onPick(b.dataset.id); refresh(); } };
  }
  function cv(id, ratio, minH) { var c = $(id), w = c.parentNode.clientWidth || 340, h = Math.max(minH || 220, Math.round(w * ratio)), d = Math.max(1, window.devicePixelRatio || 1); c.width = w * d; c.height = h * d; c.style.height = h + "px"; var x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h); return { x: x, w: w, h: h }; }

  /* ---------------- site ---------------- */
  var FIELDS = {
    all: [["bot", "Bottom (m)"], ["gamma", "γ bulk (kN/m³)"], ["gsat", "γ sat (kN/m³)"], ["E", "E (kPa)"], ["nu", "Poisson ν"]],
    gran: [["phi", "φ (°)"], ["c", "c (kPa)"], ["Dr", "Dr (%)"]],
    clay: [["cu", "cu (kPa)"], ["phi", "φ′ drained (°)"], ["c", "c′ (kPa)"], ["Cc", "Cc"], ["Cr", "Cr"], ["e0", "e0"], ["pc", "σ′p (kPa)"], ["cv", "cv (m²/yr)"], ["mv", "mv (m²/MN)"]]
  };
  function renderSite() {
    $("pName").value = P.name; bind("pName", P, "name"); bind("pFs", P, "fs", true); bind("pDepth", P, "depthF");
    $("pStruct").innerHTML = Object.keys(GC.IS1904).map(function (k) { return '<option value="' + k + '">' + GC.IS1904[k].name + '</option>'; }).join(""); bind("pStruct", P, "struct");
    var b = bh(); chips("bhChips", P.boreholes, b && b.id, function (id) { S.bh = id; });
    if (!b) { $("layers").innerHTML = '<div class="note">No borehole — add one.</div>'; return; }
    S.bh = b.id; bind("bName", b, "name"); bind("bGwt", b, "gwt", true);
    $("layers").innerHTML = b.layers.map(function (L, i) {
      var p = GC.params(b, L), fl = L.kind === "clay" ? FIELDS.clay : FIELDS.gran, sum = L.kind === "clay" ? "cu " + f1(p.cu, 0) + " kPa" + (L.Cc ? " · Cc " + L.Cc : "") : "φ " + f1(p.phi) + "°" + (p.Dr ? " · Dr " + f1(p.Dr, 0) + " %" : "");
      var inp = FIELDS.all.concat(fl).map(function (q) { var k = q[0], est = p.src[k]; return '<label class="f"><span>' + q[1] + (est ? ' <b class="src">≈ ' + f1(p[k], k === "E" ? 0 : 1) + '</b>' : '') + '</span><input type="number" step="any" data-k="' + k + '" value="' + (L[k] === 0 && est ? "" : esc(L[k])) + '" placeholder="' + (est ? "from SPT" : "") + '"></label>'; }).join("");
      return '<div class="lay' + (S.open === L.id ? " open" : "") + '" data-id="' + L.id + '"><div class="h"><span class="sw" style="background:' + KC[L.kind] + '"></span><span class="tx"><b>' + esc(L.name || GC.KINDS[L.kind]) + '</b><small>' + f1(L.top, 2) + '–' + f1(L.bot, 2) + ' m · ' + GC.KINDS[L.kind] + ' · ' + sum + (Object.keys(p.src).length ? ' · <span class="src">SPT estimates</span>' : '') + '</small></span><span>' + (S.open === L.id ? "▴" : "▾") + '</span></div>' +
        '<div class="b"><label class="f"><span>Description</span><input data-k="name" value="' + esc(L.name) + '"></label><label class="f"><span>Type</span><select data-k="kind">' + Object.keys(GC.KINDS).map(function (k) { return '<option value="' + k + '"' + (k === L.kind ? " selected" : "") + '>' + GC.KINDS[k] + '</option>'; }).join("") + '</select></label><div class="grid4">' + inp + '</div>' +
        Object.keys(p.src).map(function (k) { return '<div class="src">' + k + ' ' + p.src[k] + '</div>'; }).join("") +
        '<div class="btns"><button class="btn dan" data-del="' + L.id + '">Delete layer</button></div></div></div>';
    }).join("");
    var spt = GC.spt(b);
    $("sptTab").innerHTML = '<tr><th>Depth (m)</th><th>N</th><th class="n">σ′v</th><th class="n">N′</th><th class="n">N″</th><th class="n">φ</th><th class="n">Dr %</th><th></th></tr>' +
      b.spt.map(function (s, i) { var c = spt.filter(function (q) { return q.z === s.z && q.N === s.N; })[0] || {}; return '<tr><td><input type="number" step="0.1" data-s="' + i + '" data-k="z" value="' + s.z + '"></td><td><input type="number" data-s="' + i + '" data-k="N" value="' + s.N + '"></td><td class="n">' + f1(c.sv, 0) + '</td><td class="n">' + f1(c.N1) + '</td><td class="n">' + f1(c.Nc) + (c.dil ? "*" : "") + '</td><td class="n">' + f1(c.phi) + '</td><td class="n">' + f1(c.Dr, 0) + '</td><td><button class="btn dan" data-sdel="' + i + '" style="padding:4px 8px">×</button></td></tr>'; }).join("");
    drawLog(b);
  }
  $("layers").onclick = function (e) {
    var b = bh(), h = e.target.closest(".h"), d = e.target.closest("[data-del]");
    if (d) { if (b.layers.length < 2) return toast("Keep at least one layer"); commit(); var i = b.layers.findIndex(function (L) { return L.id === d.dataset.del; }); var gone = b.layers.splice(i, 1)[0]; if (i < b.layers.length) b.layers[i].top = i ? b.layers[i - 1].bot : 0; else if (i === b.layers.length && i > 0) b.layers[i - 1].bot = gone.bot; changed(); return; }
    if (h) { var id = h.parentNode.dataset.id; S.open = S.open === id ? null : id; renderSite(); }
  };
  $("layers").onchange = function (e) {
    var el = e.target, k = el.dataset.k; if (!k) return; var b = bh(), id = el.closest(".lay").dataset.id, i = b.layers.findIndex(function (L) { return L.id === id; }), L = b.layers[i];
    commit();
    if (k === "name" || k === "kind") L[k] = el.value;
    else { var v = el.value === "" ? 0 : +el.value; if (k === "bot") { if (v <= L.top) { toast("Bottom must be below " + L.top + " m"); return renderSite(); } L.bot = v; if (b.layers[i + 1]) { b.layers[i + 1].top = v; if (b.layers[i + 1].bot <= v) b.layers[i + 1].bot = v + 0.5; } } else L[k] = v; }
    if (k === "kind" && L.kind === "clay" && !(L.nu > 0.45)) L.nu = 0.5;
    changed();
  };
  $("lAdd").onclick = function () { var b = bh(); if (!b) return; commit(); var last = b.layers[b.layers.length - 1], top = last ? last.bot : 0, L = GC.layer({ top: top, bot: top + 2, name: "Layer " + (b.layers.length + 1), kind: last ? last.kind : "sand" }); b.layers.push(L); S.open = L.id; changed(); };
  $("sptTab").onchange = function (e) { var el = e.target, i = el.dataset.s; if (i === undefined) return; commit(); bh().spt[+i][el.dataset.k] = +el.value; changed(); };
  $("sptTab").onclick = function (e) { var d = e.target.closest("[data-sdel]"); if (!d) return; commit(); bh().spt.splice(+d.dataset.sdel, 1); changed(); };
  $("sAdd").onclick = function () { var b = bh(); commit(); var z = b.spt.length ? b.spt[b.spt.length - 1].z + 1.5 : 1.5; b.spt.push({ z: z, N: 10 }); changed(); };
  $("bAdd").onclick = function () { commit(); var b = { id: GC.uid(), name: "BH-" + (P.boreholes.length + 1), gwt: "", layers: [GC.layer({ top: 0, bot: 3, name: "Layer 1" })], spt: [] }; P.boreholes.push(b); S.bh = b.id; changed(); };
  $("bCopy").onclick = function () { var b = bh(); if (!b) return; commit(); var c = JSON.parse(JSON.stringify(b)); c.id = GC.uid(); c.name = b.name + " copy"; c.layers.forEach(function (L) { L.id = GC.uid(); }); P.boreholes.push(c); S.bh = c.id; changed(); };
  $("bDel").onclick = function () { var b = bh(); if (!b || P.boreholes.length < 2) return toast("Keep at least one borehole"); if (!confirm("Delete " + b.name + "? Footings on it move to the first borehole.")) return; commit(); P.boreholes = P.boreholes.filter(function (x) { return x !== b; }); P.footings.forEach(function (f) { if (f.bh === b.id) f.bh = P.boreholes[0].id; }); S.bh = null; changed(); };

  function drawLog(b) {
    var c = cv("logCv", 0.95, 300), x = c.x, w = c.w, h = c.h, D = Math.max(GC.depth(b), 1), top = 28, bot = h - 14, k = (bot - top) / D, ink = css("--ink"), mut = css("--mut");
    var colX = 44, colW = Math.min(70, w * 0.18), plotX = colX + colW + 110, plotW = w - plotX - 14, Nmax = 50;
    x.font = "11px system-ui"; x.fillStyle = mut; x.textAlign = "right";
    for (var d = 0; d <= D + 1e-9; d += D > 12 ? 2 : 1) { var y = top + d * k; x.fillText(d + " m", colX - 6, y + 4); x.strokeStyle = css("--line"); x.beginPath(); x.moveTo(colX, y); x.lineTo(w - 10, y); x.stroke(); }
    b.layers.forEach(function (L) { var y1 = top + L.top * k, y2 = top + L.bot * k; x.fillStyle = KC[L.kind]; x.fillRect(colX, y1, colW, y2 - y1); x.strokeStyle = ink; x.strokeRect(colX, y1, colW, y2 - y1);
      x.fillStyle = ink; x.textAlign = "left"; x.font = "600 11px system-ui"; var nm = L.name || GC.KINDS[L.kind]; wrap(nm, colX + colW + 6, (y1 + y2) / 2 - 4, 104, 12, y2 - y1); });
    function wrap(t, X, Y, W, lh, H) { var words = t.split(" "), line = "", lines = []; words.forEach(function (wd) { var tt = line ? line + " " + wd : wd; if (x.measureText(tt).width > W && line) { lines.push(line); line = wd; } else line = tt; }); lines.push(line); var max = Math.max(1, Math.floor(H / lh)); lines = lines.slice(0, max); var y0 = Y - (lines.length - 1) * lh / 2 + 4; lines.forEach(function (l, i) { x.fillText(l, X, y0 + i * lh); }); }
    var g = GC.gwt(b); if (isFinite(g)) { var yg = top + g * k; x.strokeStyle = css("--blue"); x.setLineDash([5, 3]); x.beginPath(); x.moveTo(colX - 4, yg); x.lineTo(w - 10, yg); x.stroke(); x.setLineDash([]); x.fillStyle = css("--blue"); x.beginPath(); x.moveTo(colX - 14, yg - 7); x.lineTo(colX - 4, yg - 7); x.lineTo(colX - 9, yg); x.fill(); }
    if (plotW > 60) {
      x.fillStyle = mut; x.textAlign = "center"; x.font = "11px system-ui"; x.fillText("SPT N (● field, ○ corrected)", plotX + plotW / 2, 14);
      for (var n = 0; n <= Nmax; n += 10) { var px = plotX + n / Nmax * plotW; x.fillText(n, px, top - 4); x.strokeStyle = css("--line"); x.beginPath(); x.moveTo(px, top); x.lineTo(px, bot); x.stroke(); }
      var s = GC.spt(b); [["N", true], ["Nc", false]].forEach(function (q) { x.strokeStyle = q[1] ? ink : css("--acc"); x.fillStyle = x.strokeStyle; x.beginPath(); s.forEach(function (p, i) { var X = plotX + Math.min(p[q[0]], Nmax) / Nmax * plotW, Y = top + p.z * k; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); }); x.stroke(); s.forEach(function (p) { var X = plotX + Math.min(p[q[0]], Nmax) / Nmax * plotW, Y = top + p.z * k; x.beginPath(); x.arc(X, Y, 3.5, 0, 7); q[1] ? x.fill() : x.stroke(); }); });
    }
  }

  /* ---------------- lab tests ---------------- */
  function renderTests() {
    var l = lab(); chips("labChips", P.labs, l && l.id, function (id) { S.lab = id; });
    if (!l) { $("tOut").innerHTML = '<div class="note">No sample yet — add one.</div>'; $("sieveTab").innerHTML = ""; return; }
    S.lab = l.id; bind("tName", l, "name"); bind("tTot", l, "total", true); bind("tLL", l, "LL", true); bind("tPL", l, "PL", true); bind("tOrg", l, "organic");
    var res = GC.classify(l), curve = res.curve || [];
    $("sieveTab").innerHTML = '<tr><th>Sieve (mm)</th><th>Mass retained (g)</th><th class="n">% finer</th><th></th></tr>' + l.sieve.map(function (s, i) { var c = curve.filter(function (q) { return q.d === s[0]; })[0]; return '<tr><td><input type="number" step="any" data-i="' + i + '" data-j="0" value="' + s[0] + '"></td><td><input type="number" step="any" data-i="' + i + '" data-j="1" value="' + s[1] + '"></td><td class="n">' + (c ? f1(c.pf) : "—") + '</td><td><button class="btn dan" data-x="' + i + '" style="padding:4px 8px">×</button></td></tr>'; }).join("");
    $("tOut").innerHTML = '<div style="display:flex;gap:12px;align-items:center;margin-top:8px"><div class="big">' + esc(res.sym) + '</div><div><b>' + esc(res.name) + '</b><div class="note" style="margin:2px 0">Gravel ' + f1(res.G, 0) + ' % · sand ' + f1(res.S, 0) + ' % · fines ' + f1(res.F, 0) + ' %' + (res.PI ? ' · PI ' + f1(res.PI, 0) + ' (A-line ' + f1(GC.aline(res.LL), 1) + ')' : '') + (res.Cu ? ' · Cu ' + f1(res.Cu, 1) + ', Cc ' + f1(res.Cc, 2) : '') + '</div></div></div>' + res.notes.map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join("");
    drawGrad(curve, res);
  }
  $("sieveTab").onchange = function (e) { var el = e.target; if (el.dataset.i === undefined) return; commit(); lab().sieve[+el.dataset.i][+el.dataset.j] = +el.value; changed(); };
  $("sieveTab").onclick = function (e) { var d = e.target.closest("[data-x]"); if (!d) return; commit(); lab().sieve.splice(+d.dataset.x, 1); changed(); };
  $("tRow").onclick = function () { var l = lab(); if (!l) return; commit(); var last = l.sieve[l.sieve.length - 1]; l.sieve.push([last ? +(last[0] / 2).toFixed(3) : 4.75, 0]); changed(); };
  $("tNew").onclick = function () { commit(); var l = { id: GC.uid(), name: "Sample " + (P.labs.length + 1), sieve: [[4.75, 0], [2, 0], [0.425, 0], [0.075, 0]], total: 500, LL: 0, PL: 0, organic: false }; P.labs.push(l); S.lab = l.id; changed(); };
  $("tDel").onclick = function () { var l = lab(); if (!l) return; commit(); P.labs = P.labs.filter(function (x) { return x !== l; }); S.lab = null; changed(); };
  function drawGrad(curve, res) {
    var c = cv("gradCv", 0.6, 220), x = c.x, w = c.w, h = c.h, L = 40, R = w - 12, T = 14, B = h - 30, ink = css("--ink"), mut = css("--mut");
    function X(d) { return L + (Math.log10(d) + 3) / 5 * (R - L); } function Y(p) { return B - p / 100 * (B - T); }
    x.font = "11px system-ui"; x.fillStyle = mut; x.strokeStyle = css("--line"); x.textAlign = "center";
    [0.001, 0.01, 0.1, 1, 10, 100].forEach(function (d) { x.beginPath(); x.moveTo(X(d), T); x.lineTo(X(d), B); x.stroke(); x.fillText(d, X(d), B + 14); });
    x.textAlign = "right"; for (var p = 0; p <= 100; p += 20) { x.beginPath(); x.moveTo(L, Y(p)); x.lineTo(R, Y(p)); x.stroke(); x.fillText(p, L - 4, Y(p) + 4); }
    x.textAlign = "center"; x.fillText("Particle size (mm)", (L + R) / 2, h - 3);
    [[0.075, "75 µm"], [4.75, "4.75"]].forEach(function (q) { x.strokeStyle = css("--acc"); x.setLineDash([4, 3]); x.beginPath(); x.moveTo(X(q[0]), T); x.lineTo(X(q[0]), B); x.stroke(); x.setLineDash([]); });
    if (!curve.length) return; x.strokeStyle = css("--blue"); x.lineWidth = 2; x.beginPath(); curve.forEach(function (q, i) { if (i) x.lineTo(X(q.d), Y(q.pf)); else x.moveTo(X(q.d), Y(q.pf)); }); x.stroke(); x.lineWidth = 1;
    x.fillStyle = css("--blue"); curve.forEach(function (q) { x.beginPath(); x.arc(X(q.d), Y(q.pf), 3, 0, 7); x.fill(); });
  }

  /* ---------------- footing ---------------- */
  function renderFooting() {
    var f = ft(); chips("fChips", P.footings, f && f.id, function (id) { S.f = id; S.bW = null; });
    if (!f) { $("fRes").innerHTML = '<div class="note">No footing — add one.</div>'; return; }
    S.f = f.id;
    $("fBh").innerHTML = P.boreholes.map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join("");
    ["fName:name", "fBh:bh", "fShape:shape"].forEach(function (s) { var a = s.split(":"); bind(a[0], f, a[1]); });
    ["fB:B", "fL:L", "fDf:Df", "fP:P", "fH:H", "feB:eB", "feL:eL", "fS:sLim", "fX:x", "fY:y"].forEach(function (s) { var a = s.split(":"); bind(a[0], f, a[1], true); });
    bind("fRaft", f, "raft");
    $("fLw").style.display = f.shape === "rect" ? "" : "none"; $("fBl").textContent = f.shape === "circle" ? "Diameter (m)" : "Width B (m)"; $("fPl").textContent = f.shape === "strip" ? "Wall load P (kN per m)" : "Column load P (kN)";
    var a = GC.allowable(P, f);
    if (a.err) { $("fRes").innerHTML = '<div class="verdict err">' + esc(a.err) + '</div>'; $("fFail").innerHTML = ""; $("fSteps").innerHTML = ""; $("fSet").innerHTML = ""; return; }
    var unit = f.shape === "strip" ? " kN/m" : " kN", d = a.bc.dims, s = a.sAct, lim = a.lim;
    var html = '<div class="stat"><div><small>Net safe bearing capacity (shear, FS ' + (+P.fs || 2.5) + ')</small><b class="big">' + f1(a.bc.qns, 0) + '</b> kPa</div><div><small>Net pressure for ' + lim.mm + ' mm settlement' + (lim.own ? "" : " (IS 1904)") + '</small><b class="big">' + f1(a.qSettle, 0) + '</b> kPa</div>' +
      '<div><small>Allowable net bearing pressure (' + a.gov + ' governs)</small><b class="big">' + f1(a.qa, 0) + '</b> kPa</div><div><small>Safe load on this footing</small><b class="big">' + f1(a.Pallow, 0) + '</b>' + unit + '</div></div>';
    if (a.qnet > 0) {
      var okS = s.total <= lim.mm, okB = a.qnet <= a.bc.qns;
      html += '<div class="verdict ' + (okS && okB ? "ok" : "err") + '">Applied net pressure ' + f1(a.qnet, 0) + ' kPa → settlement ' + f1(s.total) + ' mm (limit ' + lim.mm + ' mm), FS on shear ' + f1(a.bc.qnu / a.qnet, 2) + '. ' + (okS && okB ? "Satisfactory." : (!okB ? "Shear capacity exceeded. " : "") + (!okS ? "Settlement too large." : "")) + '</div>';
      if (!(okS && okB)) { var nb = needWidth(f); html += '<div class="note">' + (nb ? "Smallest " + (f.shape === "circle" ? "diameter" : "width") + " that works at this depth: <b>" + f1(nb, 2) + " m</b>" + (f.shape === "rect" ? " (same L/B ratio)" : "") + ". If that is impractical, see which layer governs below — a deeper base or piles may be the answer." : "No width up to 8 m works at this depth — consider founding deeper or on piles.") + '</div>'; }
    }
    html += '<div class="note">Differential settlement limit ' + lim.diff + ' L, angular distortion 1/' + lim.ang + ' — ' + esc(lim.name) + ', ' + (lim.fnd === "raft" ? "raft" : "isolated footing") + ' on ' + (lim.soil === "clay" ? "plastic clay" : "sand or hard clay") + ' (IS 1904:2021 Table 1 — guide values).</div>';
    $("fRes").innerHTML = html;
    var fl = GC.failure(P, f), sym = { err: "✘", warn: "⚠", info: "ℹ", ok: "✔" };
    $("fFail").innerHTML = fl.items.map(function (i) { return '<div class="it"><span class="sev ' + i.sev + '">' + sym[i.sev] + '</span><span>' + esc(i.t) + '</span></div>'; }).join("");
    $("fSteps").innerHTML = a.bc.steps.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var st = s || GC.settle(P, f, a.qa), q = s ? a.qnet : a.qa;
    $("fSet").innerHTML = '<div class="note">At net pressure ' + f1(q, 0) + ' kPa. Stressed zone to ' + f1(st.zi, 2) + ' m (added stress above ' + Math.round((+P.cut || 0.1) * 100) + ' % of σ′v). Immediate settlement × ' + st.rig + ' for a rigid footing.</div>' +
      '<table><tr><th>Layer</th><th class="n">Depth (m)</th><th class="n">Immediate</th><th class="n">Consol.</th><th class="n">t₉₀ (yr)</th></tr>' + st.layers.map(function (l) { return '<tr><td>' + esc(l.name) + (l.yld ? ' <span class="sev err">yields</span>' : '') + (l.src && l.src.E ? '<div class="src">E ' + esc(l.src.E) + '</div>' : '') + '</td><td class="n">' + f1(l.top, 1) + '–' + f1(l.bot, 1) + '</td><td class="n">' + f1(l.imm) + '</td><td class="n">' + (l.con ? f1(l.con) : "—") + '</td><td class="n">' + (l.t90 ? f1(l.t90, 2) : "—") + '</td></tr>'; }).join("") +
      '<tr><td><b>Total (mm)</b></td><td></td><td class="n"><b>' + f1(st.imm) + '</b></td><td class="n"><b>' + f1(st.con) + '</b></td><td class="n"><b>' + f1(st.total) + '</b></td></tr></table>' + st.notes.map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join("");
    drawTime(st, lim.mm);
  }
  function scaled(f, B) { var g = Object.assign({}, f); if (f.shape === "rect") g.L = +f.L * B / +f.B; g.B = B; return g; }
  function needWidth(f) {
    var lim = GC.limit(P, f).mm;
    for (var B = Math.max(0.5, +f.B * 0.5); B <= 8 + 1e-9; B += 0.05) { var g = scaled(f, B), bc = GC.bearing(P, g); if (bc.err) return null; if (bc.qnet <= bc.qns && GC.settle(P, g, bc.qnet).total <= lim) return B; }
    return null;
  }
  ["fNew", "fDup"].forEach(function (id) { $(id).onclick = function () { commit(); var f = ft(), g = id === "fDup" && f ? Object.assign({}, f) : { shape: "square", B: 2, L: 2, Df: 1.5, P: 500, H: 0, eB: 0, eL: 0, x: 0, y: 0, bh: P.boreholes[0] && P.boreholes[0].id }; g.id = GC.uid(); g.name = "F" + (P.footings.length + 1); if (id === "fDup") g.x = (+g.x || 0) + Math.max(3, +g.B + 1); P.footings.push(g); S.f = g.id; changed(); }; });
  $("fDel").onclick = function () { var f = ft(); if (!f) return; commit(); P.footings = P.footings.filter(function (x) { return x !== f; }); S.f = null; changed(); };
  function drawTime(st, lim) {
    var c = cv("timeCv", 0.5, 200), x = c.x, w = c.w, h = c.h, L = 42, R = w - 12, T = 16, B = h - 30, mut = css("--mut"), smax = Math.max(st.total, lim) * 1.15 || 1;
    function X(t) { return L + (Math.log10(t) + 2) / 4 * (R - L); } function Y(s) { return T + s / smax * (B - T); }
    x.font = "11px system-ui"; x.fillStyle = mut; x.strokeStyle = css("--line"); x.textAlign = "center";
    [0.01, 0.1, 1, 10, 100].forEach(function (t) { x.beginPath(); x.moveTo(X(t), T); x.lineTo(X(t), B); x.stroke(); x.fillText(t < 1 ? t : t + "", X(t), B + 14); });
    x.fillText("Time after loading (years)", (L + R) / 2, h - 3); x.textAlign = "right";
    var stp = smax > 100 ? 25 : smax > 40 ? 10 : 5; for (var s = 0; s <= smax; s += stp) { x.beginPath(); x.moveTo(L, Y(s)); x.lineTo(R, Y(s)); x.stroke(); x.fillText(s, L - 4, Y(s) + 4); }
    x.save(); x.translate(10, (T + B) / 2); x.rotate(-Math.PI / 2); x.textAlign = "center"; x.fillText("mm", 0, 0); x.restore();
    x.strokeStyle = css("--err"); x.setLineDash([5, 4]); x.beginPath(); x.moveTo(L, Y(lim)); x.lineTo(R, Y(lim)); x.stroke(); x.setLineDash([]); x.fillStyle = css("--err"); x.textAlign = "left"; x.fillText("limit " + lim + " mm", L + 4, Y(lim) - 4);
    x.strokeStyle = css("--blue"); x.lineWidth = 2; x.beginPath(); for (var i = 0; i <= 80; i++) { var t = Math.pow(10, -2 + 4 * i / 80), v = GC.settleTime(st, t); if (i) x.lineTo(X(t), Y(v)); else x.moveTo(X(t), Y(v)); } x.stroke(); x.lineWidth = 1;
  }

  /* ---------------- pressure bulb ---------------- */
  function renderBulb() {
    var f0 = ft(); chips("bChips", P.footings, f0 && f0.id, function (id) { S.f = id; S.bW = null; });
    if (!f0) return; var f = S.bW ? scaled(f0, S.bW) : f0, b = GC.bh(P, f.bh);
    $("bW").value = +f.B; $("bWl").textContent = (f.shape === "circle" ? "Diameter" : "Width B") + " = " + f1(+f.B, 2) + " m" + (S.bW ? " (trying — not saved)" : "") + " · net pressure " + f1(+f.P / GC.dims(f).A1, 0) + " kPa";
    $("bUse").disabled = !S.bW; $("bGrp").textContent = S.group ? "Show this footing only" : "Show all footings"; $("bGrp").style.display = P.footings.length > 1 ? "" : "none";
    var fl = GC.failure(P, f), bad = {}, tot = fl.settle ? fl.settle.total || 1 : 1;
    (fl.settle ? fl.settle.layers : []).forEach(function (l) { var st = l.yld ? "err" : (l.imm + l.con) / tot > 0.5 ? "warn" : null; if (st) b.layers.forEach(function (L) { if ((L.name || GC.KINDS[L.kind]) === l.name) bad[L.id] = st; }); });
    fl.items.forEach(function (i) { if (i.sev === "err" && i.layer) bad[i.layer] = "err"; });
    var g = GC.bulbGrid(P, f, { nx: 71, nz: 71, group: S.group && P.footings.length > 1 }), c = cv("bulbCv", 1.05, 320), x = c.x, w = c.w, h = c.h;
    var z0 = 0, z1 = g.z1, sx = (w - 20) / (g.x1 - g.x0), sz = (h - 20) / (z1 - z0), s = Math.min(sx, sz), ox = 10 + ((w - 20) - (g.x1 - g.x0) * s) / 2;
    function X(v) { return ox + (v - g.x0) * s; } function Z(v) { return 10 + (v - z0) * s; }
    b.layers.forEach(function (L) { if (L.top > z1) return; var y1 = Z(L.top), y2 = Z(Math.min(L.bot, z1)); x.globalAlpha = 0.45; x.fillStyle = KC[L.kind]; x.fillRect(X(g.x0), y1, (g.x1 - g.x0) * s, y2 - y1); x.globalAlpha = 1;
      if (bad[L.id]) { x.strokeStyle = css(bad[L.id] === "err" ? "--err" : "--warn"); x.lineWidth = 2.5; x.strokeRect(X(g.x0) + 1, y1 + 1, (g.x1 - g.x0) * s - 2, y2 - y1 - 2); x.lineWidth = 1; }
      x.fillStyle = css("--ink"); x.font = "600 11px system-ui"; x.textAlign = "left"; if (y2 - y1 > 14) x.fillText((L.name || GC.KINDS[L.kind]).slice(0, 40), X(g.x0) + 6, y2 - 6); });
    var gw = GC.gwt(b); if (gw < z1) { x.strokeStyle = css("--blue"); x.setLineDash([6, 4]); x.beginPath(); x.moveTo(X(g.x0), Z(gw)); x.lineTo(X(g.x1), Z(gw)); x.stroke(); x.setLineDash([]); x.fillStyle = css("--blue"); x.textAlign = "right"; x.font = "11px system-ui"; x.fillText("water table", X(g.x1) - 4, Z(gw) - 4); }
    [0.9, 0.7, 0.5, 0.3, 0.2, 0.1, 0.05].forEach(function (lv) {
      var seg = GC.contour(g, lv * g.q); x.strokeStyle = css("--blue"); x.lineWidth = lv >= 0.5 ? 2 : 1.3; x.beginPath(); seg.forEach(function (p) { x.moveTo(X(p[0][0]), Z(p[0][1])); x.lineTo(X(p[1][0]), Z(p[1][1])); }); x.stroke(); x.lineWidth = 1;
      var lowest = null; seg.forEach(function (p) { p.forEach(function (q) { if (Math.abs(q[0] - (+f.x || 0)) < (g.x1 - g.x0) / 60 && (!lowest || q[1] > lowest[1])) lowest = q; }); });
      if (lowest && [0.5, 0.2, 0.1, 0.05].indexOf(lv) >= 0) { x.fillStyle = css("--blue"); x.font = "600 11px system-ui"; x.textAlign = "center"; x.fillText(lv + "q", X(lowest[0]), Z(lowest[1]) + 12); }
    });
    (S.group ? P.footings : [f]).forEach(function (q) { var dd = GC.dims(q === f0 ? f : q), bx = q.shape === "strip" ? dd.B1 : dd.B1; x.fillStyle = css("--mut"); x.fillRect(X((+q.x || 0) - bx / 2), Z(+q.Df) - 8, bx * s, 8); });
    x.strokeStyle = css("--ink"); x.beginPath(); x.moveTo(X(g.x0), Z(0)); x.lineTo(X(g.x1), Z(0)); x.stroke();
    $("bHud").textContent = "Section through " + (f.name || "the footing") + " · " + f1(g.x1 - g.x0, 1) + " m wide, to " + f1(z1, 1) + " m";
    drawProfile(f, b, fl, bad);
  }
  $("bW").oninput = function () { S.bW = +this.value; renderBulb(); };
  $("bUse").onclick = function () { var f = ft(); if (!f || !S.bW) return; commit(); var g = scaled(f, S.bW); f.B = r(g.B, 2); if (f.shape === "rect") f.L = r(g.L, 2); S.bW = null; changed(); toast("Width saved"); };
  $("bGrp").onclick = function () { S.group = !S.group; renderBulb(); };
  function drawProfile(f, b, fl, bad) {
    var q = +f.P / GC.dims(f).A1, Df = +f.Df, zmax = Math.max(fl.settle ? fl.settle.zi : 0, Df + 3 * GC.dims(f).B1, Df + 2) , pts = [];
    zmax = Math.min(Math.max(zmax, Df + 1), GC.depth(b));
    for (var i = 0; i <= 120; i++) { var z = Df + (zmax - Df) * i / 120, s0 = GC.sv(b, z).e, ds = S.group ? GC.dsigAll(P, +f.x || 0, +f.y || 0, z) : GC.dsig(f, q, +f.x || 0, +f.y || 0, z - Df), L = GC.layerAt(b, z); pts.push({ z: z, s0: s0, ds: ds, pc: L && L.kind === "clay" && L.pc > 0 ? L.pc : null }); }
    var smax = Math.max.apply(null, pts.map(function (p) { return Math.max(p.s0 + p.ds, p.pc || 0); })) * 1.08 || 1;
    var c = cv("profCv", 0.85, 280), x = c.x, w = c.w, h = c.h, Lx = 44, R = w - 12, T = 22, B = h - 12;
    function X(v) { return Lx + v / smax * (R - Lx); } function Y(z) { return T + (z - Df) / (zmax - Df) * (B - T); }
    b.layers.forEach(function (L) { if (L.bot <= Df || L.top >= zmax) return; var y1 = Y(Math.max(L.top, Df)), y2 = Y(Math.min(L.bot, zmax)); x.globalAlpha = 0.25; x.fillStyle = KC[L.kind]; x.fillRect(Lx, y1, R - Lx, y2 - y1); x.globalAlpha = 1; if (bad[L.id]) { x.strokeStyle = css(bad[L.id] === "err" ? "--err" : "--warn"); x.lineWidth = 2; x.strokeRect(Lx + 1, y1 + 1, R - Lx - 2, y2 - y1 - 2); x.lineWidth = 1; } });
    x.font = "11px system-ui"; x.fillStyle = css("--mut"); x.strokeStyle = css("--line"); x.textAlign = "center";
    var st = smax > 400 ? 100 : smax > 150 ? 50 : 20; for (var v = 0; v <= smax; v += st) { x.beginPath(); x.moveTo(X(v), T); x.lineTo(X(v), B); x.stroke(); x.fillText(v, X(v), T - 6); }
    x.textAlign = "right"; var zs = zmax - Df > 8 ? 2 : 1; for (var z = Math.ceil(Df); z <= zmax; z += zs) { x.fillText(z + " m", Lx - 4, Y(z) + 4); }
    function line(key, col, w0, dash) { x.strokeStyle = col; x.lineWidth = w0; x.setLineDash(dash || []); x.beginPath(); var on = false; pts.forEach(function (p) { var v = key === "sum" ? p.s0 + p.ds : p[key]; if (v === null) { on = false; return; } if (on) x.lineTo(X(v), Y(p.z)); else { x.moveTo(X(v), Y(p.z)); on = true; } }); x.stroke(); x.setLineDash([]); x.lineWidth = 1; }
    line("s0", css("--mut"), 1.5); line("ds", css("--blue"), 2); line("sum", css("--acc"), 2); line("pc", css("--err"), 1.5, [5, 3]);
    x.fillStyle = css("--mut"); x.textAlign = "right"; x.fillText("kPa", R, h - 1);
    var rows = b.layers.filter(function (L) { return L.bot > Df && L.top < zmax; }).map(function (L) { var zm = (Math.max(L.top, Df) + Math.min(L.bot, zmax)) / 2, p = pts.reduce(function (a, q) { return Math.abs(q.z - zm) < Math.abs(a.z - zm) ? q : a; }, pts[0]), sl = fl.settle ? fl.settle.layers.filter(function (s) { return s.name === (L.name || GC.KINDS[L.kind]); })[0] : null; return '<tr' + (bad[L.id] ? ' style="color:var(--' + bad[L.id] + ')"' : '') + '><td>' + esc(L.name || GC.KINDS[L.kind]) + '</td><td class="n">' + f1(zm, 1) + '</td><td class="n">' + f1(p.ds, 0) + '</td><td class="n">' + f1(100 * p.ds / q, 0) + '%</td><td class="n">' + (sl ? f1(sl.imm + sl.con) : "—") + '</td></tr>'; });
    $("bTab").innerHTML = '<table style="margin-top:8px"><tr><th>Layer</th><th class="n">Mid depth (m)</th><th class="n">Δσz (kPa)</th><th class="n">of q</th><th class="n">Settles (mm)</th></tr>' + rows.join("") + '</table>';
  }

  /* ---------------- plate load test ---------------- */
  function renderPlate() {
    var p = pt(); chips("pChips", P.plates, p && p.id, function (id) { S.pt = id; });
    if (!p) { $("ptOut").innerHTML = '<div class="note">No test yet — add one.</div>'; $("ptTab").innerHTML = ""; return; }
    S.pt = p.id; bind("ptName", p, "name"); bind("ptBp", p, "Bp", true); bind("ptBf", p, "Bf", true); bind("ptSoil", p, "soil"); if (!p.sLim) p.sLim = 25; bind("ptLim", p, "sLim", true);
    $("ptTab").innerHTML = '<tr><th>Pressure (kPa)</th><th>Settlement (mm)</th><th></th></tr>' + p.rows.map(function (q, i) { return '<tr><td><input type="number" step="any" data-i="' + i + '" data-j="0" value="' + q[0] + '"></td><td><input type="number" step="any" data-i="' + i + '" data-j="1" value="' + q[1] + '"></td><td><button class="btn dan" data-x="' + i + '" style="padding:4px 8px">×</button></td></tr>'; }).join("");
    var o = GC.plate(p, P);
    if (o.err) { $("ptOut").innerHTML = '<div class="note">' + o.err + '</div>'; return; }
    $("ptOut").innerHTML = '<div class="stat"><div><small>Ultimate pressure — plate (log–log break)</small><b class="big">' + f1(o.qu, 0) + '</b> kPa</div><div><small>Ultimate for the ' + p.Bf + ' m footing' + (p.soil === "clay" ? " (same in clay)" : " (× Bf/Bp in sand)") + '</small><b class="big">' + f1(o.quF, 0) + '</b> kPa</div>' +
      '<div><small>Pressure for ' + o.sLim + ' mm under the footing (plate ' + f1(o.spLim, 2) + ' mm)</small><b class="big">' + f1(o.qSettle, 0) + '</b> kPa</div><div><small>Safe bearing pressure (smaller of ultimate ÷ ' + (+P.fs || 2.5) + ' and settlement)</small><b class="big">' + f1(o.qa, 0) + '</b> kPa</div></div>' +
      '<div class="note">Footing settlement = plate settlement × ' + f1(o.scale, 3) + (p.soil === "clay" ? " (Bf/Bp, clay)" : " ([Bf(Bp + 0.3)/(Bp(Bf + 0.3))]², sand — Terzaghi and Peck)") + '. ' + (p.soil !== "clay" ? "Scaling the ultimate value with width over-predicts in sand; settlement normally governs." : "") + '</div>' + o.notes.map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join("");
    drawPlate(o);
  }
  $("ptTab").onchange = function (e) { var el = e.target; if (el.dataset.i === undefined) return; commit(); pt().rows[+el.dataset.i][+el.dataset.j] = +el.value; changed(); };
  $("ptTab").onclick = function (e) { var d = e.target.closest("[data-x]"); if (!d) return; commit(); pt().rows.splice(+d.dataset.x, 1); changed(); };
  $("ptRow").onclick = function () { var p = pt(); if (!p) return; commit(); var l = p.rows[p.rows.length - 1] || [0, 0]; p.rows.push([l[0] + 50, +(l[1] * 1.3 + 1).toFixed(1)]); changed(); };
  $("ptNew").onclick = function () { commit(); var p = { id: GC.uid(), name: "PLT-" + (P.plates.length + 1), Bp: 0.3, Bf: 2, soil: "sand", sLim: 25, rows: [[0, 0]] }; P.plates.push(p); S.pt = p.id; changed(); };
  $("ptDel").onclick = function () { var p = pt(); if (!p) return; commit(); P.plates = P.plates.filter(function (x) { return x !== p; }); S.pt = null; changed(); };
  function drawPlate(o) {
    var c = cv("ptCv", 0.55, 220), x = c.x, w = c.w, h = c.h, half = w / 2, mut = css("--mut"), rows = o.rows, pm = Math.max.apply(null, rows.map(function (q) { return q[0]; })) * 1.05, sm = Math.max.apply(null, rows.map(function (q) { return q[1]; })) * 1.1;
    x.font = "11px system-ui";
    /* arithmetic */
    var L = 34, R = half - 10, T = 18, B = h - 24; function X(p) { return L + p / pm * (R - L); } function Y(s) { return T + s / sm * (B - T); }
    x.strokeStyle = css("--line"); x.strokeRect(L, T, R - L, B - T); x.fillStyle = mut; x.textAlign = "center"; x.fillText("pressure (kPa) →", (L + R) / 2, T - 5); x.fillText("settlement (mm) ↓", (L + R) / 2, h - 6);
    x.strokeStyle = css("--blue"); x.lineWidth = 2; x.beginPath(); rows.forEach(function (q, i) { if (i) x.lineTo(X(q[0]), Y(q[1])); else x.moveTo(X(q[0]), Y(q[1])); }); x.stroke(); x.lineWidth = 1;
    if (o.qSettle) { x.strokeStyle = css("--acc"); x.setLineDash([4, 3]); x.beginPath(); x.moveTo(L, Y(o.spLim)); x.lineTo(X(o.qSettle), Y(o.spLim)); x.lineTo(X(o.qSettle), T); x.stroke(); x.setLineDash([]); }
    x.strokeStyle = css("--err"); x.setLineDash([4, 3]); x.beginPath(); x.moveTo(X(o.qu), T); x.lineTo(X(o.qu), B); x.stroke(); x.setLineDash([]);
    /* log–log */
    var L2 = half + 30, R2 = w - 10, pts = rows.filter(function (q) { return q[0] > 0 && q[1] > 0; }); if (pts.length < 2) return;
    var lx0 = Math.log10(pts[0][0]) - 0.05, lx1 = Math.log10(pm), ly0 = Math.log10(pts[0][1]) - 0.1, ly1 = Math.log10(sm);
    function X2(v) { return L2 + (v - lx0) / (lx1 - lx0) * (R2 - L2); } function Y2(v) { return B - (v - ly0) / (ly1 - ly0) * (B - T); }
    x.strokeStyle = css("--line"); x.strokeRect(L2, T, R2 - L2, B - T); x.fillStyle = mut; x.fillText("log pressure", (L2 + R2) / 2, h - 6); x.fillText("log–log: break = ultimate", (L2 + R2) / 2, T - 5);
    x.fillStyle = css("--blue"); pts.forEach(function (q) { x.beginPath(); x.arc(X2(Math.log10(q[0])), Y2(Math.log10(q[1])), 3, 0, 7); x.fill(); });
    x.save(); x.beginPath(); x.rect(L2, T, R2 - L2, B - T); x.clip();
    if (o.lines) { [o.lines.A, o.lines.B].forEach(function (ln) { x.strokeStyle = css("--acc"); x.beginPath(); x.moveTo(X2(lx0), Y2(ln.k * lx0 + ln.c)); x.lineTo(X2(lx1), Y2(ln.k * lx1 + ln.c)); x.stroke(); }); }
    x.restore();
    x.strokeStyle = css("--err"); x.setLineDash([4, 3]); x.beginPath(); x.moveTo(X2(Math.log10(o.qu)), T); x.lineTo(X2(Math.log10(o.qu)), B); x.stroke(); x.setLineDash([]);
  }

  /* ---------------- report ---------------- */
  function img(id) { try { return '<img style="max-width:100%;border:1px solid #ddd;border-radius:8px" src="' + $(id).toDataURL("image/png") + '">'; } catch (e) { return ""; } }
  function renderReport() {
    var h = '<h1>' + esc(P.name) + '</h1><div class="note">IS GeoTech ' + GC.VERSION + ' · ' + new Date().toLocaleDateString() + ' · factor of safety on shear ' + (+P.fs || 2.5) + ' · ' + esc((GC.IS1904[P.struct] || GC.IS1904.rc).name) + ' (IS 1904:2021 limits)</div>';
    P.boreholes.forEach(function (b) {
      h += '<h2>' + esc(b.name) + ' — soil profile</h2><div class="note">Water table: ' + (isFinite(GC.gwt(b)) ? GC.gwt(b) + ' m below ground' : 'not met') + '</div><table class="mini"><tr><th>Depth (m)</th><th>Description</th><th class="n">γ</th><th class="n">c / cu</th><th class="n">φ</th><th class="n">E (MPa)</th><th class="n">Cc / e0</th></tr>' +
        b.layers.map(function (L) { var p = GC.params(b, L); return '<tr><td>' + f1(L.top, 2) + '–' + f1(L.bot, 2) + '</td><td>' + esc(L.name || GC.KINDS[L.kind]) + '</td><td class="n">' + f1(L.gamma) + '</td><td class="n">' + (L.kind === "clay" ? f1(p.cu, 0) + (p.src.cu ? "*" : "") : f1(L.c, 0)) + '</td><td class="n">' + (L.kind === "clay" ? (L.phi ? f1(L.phi) : "—") : f1(p.phi) + (p.src.phi ? "*" : "")) + '</td><td class="n">' + f1(p.E / 1000, 1) + (p.src.E ? "*" : "") + '</td><td class="n">' + (L.Cc ? L.Cc + " / " + L.e0 : "—") + '</td></tr>'; }).join("") + '</table><div class="note">* estimated from SPT correlations.</div>';
      var sp = GC.spt(b); if (sp.length) h += '<table class="mini"><tr><th>Depth</th><th class="n">N</th><th class="n">σ′v</th><th class="n">CN</th><th class="n">N′</th><th class="n">N″</th><th class="n">φ</th></tr>' + sp.map(function (s) { return '<tr><td>' + s.z + ' m</td><td class="n">' + s.N + '</td><td class="n">' + f1(s.sv, 0) + '</td><td class="n">' + f1(s.CN, 2) + '</td><td class="n">' + f1(s.N1) + '</td><td class="n">' + f1(s.Nc) + '</td><td class="n">' + f1(s.phi) + '</td></tr>'; }).join("") + '</table>';
    });
    if (P.labs.length) h += '<h2>Soil classification — IS 1498</h2><table class="mini"><tr><th>Sample</th><th>Symbol</th><th>Description</th><th class="n">G / S / F %</th><th class="n">LL / PI</th></tr>' + P.labs.map(function (l) { var c = GC.classify(l); return '<tr><td>' + esc(l.name) + '</td><td><b>' + c.sym + '</b></td><td>' + esc(c.name) + '</td><td class="n">' + f1(c.G, 0) + ' / ' + f1(c.S, 0) + ' / ' + f1(c.F, 0) + '</td><td class="n">' + (c.LL ? c.LL + ' / ' + c.PI : 'NP') + '</td></tr>'; }).join("") + '</table>';
    P.footings.forEach(function (f) {
      var a = GC.allowable(P, f); if (a.err) return; var fl = GC.failure(P, f), st = a.sAct || GC.settle(P, f, a.qa);
      h += '<h2>' + esc(f.name) + ' — ' + ({ square: "square", rect: "rectangular", circle: "circular", strip: "strip" }[f.shape]) + ' footing ' + f.B + (f.shape === "rect" ? ' × ' + f.L : '') + ' m at ' + f.Df + ' m, ' + esc(GC.bh(P, f.bh).name) + '</h2>' +
        '<table class="mini"><tr><td>Net ultimate bearing capacity</td><td class="n">' + f1(a.bc.qnu, 0) + ' kPa</td></tr><tr><td>Net safe bearing capacity (shear)</td><td class="n">' + f1(a.bc.qns, 0) + ' kPa</td></tr><tr><td>Net pressure for ' + a.lim.mm + ' mm settlement</td><td class="n">' + f1(a.qSettle, 0) + ' kPa</td></tr><tr><td><b>Allowable net bearing pressure</b> (' + a.gov + ' governs)</td><td class="n"><b>' + f1(a.qa, 0) + ' kPa</b></td></tr><tr><td>Safe load on the footing</td><td class="n">' + f1(a.Pallow, 0) + (f.shape === "strip" ? ' kN/m' : ' kN') + '</td></tr>' +
        (a.qnet ? '<tr><td>Applied net pressure / settlement</td><td class="n">' + f1(a.qnet, 0) + ' kPa / ' + f1(st.total) + ' mm — ' + (a.ok && st.total <= a.lim.mm ? 'OK' : '<b style="color:#b42318">NOT OK</b>') + '</td></tr>' : '') + '</table>' +
        '<ol class="steps">' + a.bc.steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ol>' +
        '<table class="mini"><tr><th>Layer</th><th class="n">Immediate</th><th class="n">Consolidation</th><th class="n">t₉₀ (yr)</th></tr>' + st.layers.map(function (l) { return '<tr><td>' + esc(l.name) + ' (' + f1(l.top, 1) + '–' + f1(l.bot, 1) + ' m)</td><td class="n">' + f1(l.imm) + '</td><td class="n">' + (l.con ? f1(l.con) : '—') + '</td><td class="n">' + (l.t90 ? f1(l.t90, 2) : '—') + '</td></tr>'; }).join("") + '<tr><td><b>Total, mm</b></td><td></td><td></td><td class="n"><b>' + f1(st.total) + '</b></td></tr></table>' +
        '<p><b>Which part can fail</b></p><ul>' + fl.items.map(function (i) { return '<li>' + esc(i.t) + '</li>'; }).join("") + '</ul>';
    });
    P.plates.forEach(function (p) { var o = GC.plate(p, P); if (o.err) return; h += '<h2>' + esc(p.name) + ' — plate load test (IS 1888)</h2><table class="mini"><tr><td>Plate / footing</td><td class="n">' + p.Bp + ' m / ' + p.Bf + ' m, ' + (p.soil === "clay" ? "clay" : "sand") + '</td></tr><tr><td>Ultimate (plate, log–log break)</td><td class="n">' + f1(o.qu, 0) + ' kPa</td></tr><tr><td>Pressure for ' + o.sLim + ' mm footing settlement</td><td class="n">' + f1(o.qSettle, 0) + ' kPa</td></tr><tr><td><b>Safe bearing pressure</b></td><td class="n"><b>' + f1(o.qa, 0) + ' kPa</b></td></tr></table>'; });
    h += '<p class="note">Correlations from SPT values are estimates and should be replaced by test values where available. Values from IS 1904:2021 Table 1 are guide values. The designer remains responsible for the final bearing pressure.</p>';
    $("rBody").innerHTML = h;
  }
  $("rPrint").onclick = function () { if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print(P.name + " soil report"); else window.print(); };
  $("rSave").onclick = function () {
    var style = document.querySelector("style").textContent;
    download(safe(P.name) + "_report.html", '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(P.name) + '</title><style>' + style + 'body{padding:16px;max-width:900px;margin:auto}</style></head><body>' + $("rBody").innerHTML + '</body></html>', "text/html");
  };

  /* ---------------- refresh ---------------- */
  function refresh() {
    $("pname").textContent = P.name + " · " + P.boreholes.length + " borehole" + (P.boreholes.length === 1 ? "" : "s") + " · " + P.footings.length + " footing" + (P.footings.length === 1 ? "" : "s");
    if (tab === "site") renderSite(); else if (tab === "tests") renderTests(); else if (tab === "footing") renderFooting(); else if (tab === "bulb") renderBulb(); else if (tab === "plate") renderPlate(); else if (tab === "report") renderReport();
  }
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(refresh, 150); });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
  window.ISG = { get P() { return P; }, S: S, show: show, refresh: refresh };
  load(); refresh();
})();
