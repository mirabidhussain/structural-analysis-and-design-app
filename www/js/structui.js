/* Structural analysis screen: model input (generator / DXF), properties, loads, linear static (+P-Delta), pushover,
   3D viewer with deformed shape, diagrams and contours, design tables. */
var SU = (function () {
  var S = { geo: null, m: null, res: null, des: null, po: null, dx: null, L: null, sel: null, view: { yaw: -0.6, pitch: 0.45, zoom: 1, px: 0, py: 0 } };
  var DEF = {
    src: "gen", bx: "4, 4, 4", by: "5, 5", hs: "3.5, 3.2, 3.2", slabs: true, walls: false, brace: false, mesh: 1,
    dmode: "3d", dunits: "auto", dmesh: 1, roles: {},
    method: "lsm", mat: "rcc", fck: 25, fy: 500, fys: 250, colSec: "400x400", beamSec: "300x450", braceSec: "ISA 75x75x6", tSlab: 150, tWall: 200,
    crack: true, pcCol: 2, pcBeam: 1, kcol: 1.2,
    ff: 1.5, ll: 3, ffRoof: 2.5, llRoof: 1.5, wall: 12, parapet: 3, bDL: 0, bLL: 0, bLLr: 0,
    eq: true, zone: "V", I: 1.2, R: 5, soil: "II", sys: "rc", wind: false, vbp: "Srinagar", terrain: 2, cf: 1.3, trib: 4,
    pdir: 0, ppat: "parabolic", pdrift: 4, ppd: true, pev: 80, secOver: "", loadOver: ""
  };
  /* defaults that depend on the frame material */
  var MATDEF = { rcc: { colSec: "400x400", beamSec: "300x450", sys: "rc" }, steel: { colSec: "ISMB 300", beamSec: "ISMB 250", sys: "steel" } };
  var UV = {};     /* values the user actually entered; anything missing falls back to its default */
  var P = {};
  function dflt(k) { var md = MATDEF[UV.mat === "steel" ? "steel" : "rcc"]; return md[k] !== undefined ? md[k] : DEF[k]; }
  function given(k) { var v = UV[k]; return v !== undefined && v !== null && v !== "" && !(typeof v === "number" && isNaN(v)); }
  function eff() { var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = given(k) ? UV[k] : dflt(k); }); o.roles = UV.roles || (UV.roles = {}); return o; }
  function load() { try { UV = JSON.parse(localStorage.getItem("isd_model2") || "{}") || {}; } catch (e) { UV = {}; } P = eff(); }
  function save() { P = eff(); try { localStorage.setItem("isd_model2", JSON.stringify(UV)); } catch (e) {} }
  function set(k, v) { UV[k] = v; save(); }
  function dtxt(k) { var d = dflt(k); return typeof d === "boolean" ? (d ? "on" : "off") : String(d); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f(x, d) { return x === null || x === undefined || isNaN(x) ? "-" : (+x).toFixed(d === undefined ? 2 : d); }
  function $(id) { return document.getElementById(id); }
  function toast(t) { var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }

  /* ---------- form helpers ---------- */
  /* blank input = default (shown as greyed placeholder) */
  function num(k, label, unit, help) { return '<label class="fld"><span>' + label + (unit ? ' <i>(' + unit + ')</i>' : '') + '</span><input data-k="' + k + '" type="number" step="any" inputmode="decimal" placeholder="' + esc(dflt(k)) + '" value="' + (given(k) ? esc(UV[k]) : "") + '"><small>' + (help ? help + ' · ' : '') + 'blank = default ' + esc(dtxt(k)) + '</small></label>'; }
  function txt(k, label, help) { return '<label class="fld"><span>' + label + '</span><input data-k="' + k + '" placeholder="' + esc(dflt(k)) + '" value="' + (given(k) ? esc(UV[k]) : "") + '"><small>' + (help ? help + ' · ' : '') + 'blank = default ' + esc(dtxt(k)) + '</small></label>'; }
  function area(k, label, help, ph) { return '<label class="fld full"><span>' + label + '</span><textarea data-k="' + k + '" rows="3" placeholder="' + esc(ph) + '">' + (given(k) ? esc(UV[k]) : "") + '</textarea><small>' + help + '</small></label>'; }
  function sel(k, label, opts) { return '<label class="fld"><span>' + label + '</span><select data-k="' + k + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(P[k]) === String(o[0]) ? " selected" : "") + '>' + esc(o[1]) + (String(dflt(k)) === String(o[0]) ? " (default)" : "") + '</option>'; }).join("") + '</select></label>'; }
  function chk(k, label) { return '<label class="fld ck"><span><input data-k="' + k + '" type="checkbox"' + (P[k] ? " checked" : "") + '> ' + label + '</span></label>'; }
  var BAD = [];
  var LBL = { fck: "fck", fy: "fy", fys: "steel fy", colSec: "columns", beamSec: "beams", braceSec: "braces", tSlab: "slab t", tWall: "wall t", ff: "floor finish", ll: "LL", ffRoof: "roof finish", llRoof: "roof LL", wall: "wall load", parapet: "parapet", zone: "zone", I: "I", R: "R", soil: "soil", sys: "period formula", method: "design method", vbp: "wind speed", terrain: "terrain", cf: "Cf", kcol: "k (col)" };
  function grab(root) {
    BAD = [];
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k"), v = el.value;
      if (el.type === "checkbox") { if (el.checked === dflt(k) && !given(k)) return; UV[k] = el.checked; return; }
      if (el.tagName === "SELECT") { if (String(v) === String(dflt(k)) && !given(k)) return; UV[k] = isNaN(+v) || v === "" ? v : +v; return; }
      v = String(v).trim();
      if (v === "") { delete UV[k]; return; }
      if (el.type === "number") { var n = parseFloat(v); if (!isFinite(n) || n < 0) { delete UV[k]; BAD.push(k); el.value = ""; } else UV[k] = n; }
      else UV[k] = v;
    });
    save();
    if (BAD.length) toast("Invalid entry replaced by default: " + BAD.join(", "));
  }
  function used() {   /* list of inputs left at default, for the report */
    return Object.keys(DEF).filter(function (k) { return !given(k); });
  }
  function params() {
    var p = Object.assign({}, P);
    p.vb = D.vb[P.vbp] || 39; p.terrain = +P.terrain; p.pdir = +P.pdir; p.zone = String(P.zone); p.soil = String(P.soil); p.I = +P.I; p.R = +P.R;
    p.fck = +P.fck; p.fy = +P.fy; p.fys = +P.fys; p.mesh = P.mesh > 0 ? P.mesh : 1; p.dmesh = P.dmesh > 0 ? P.dmesh : 1;
    p.entered = Object.keys(DEF).filter(given);
    return p;
  }

  /* ---------- page ---------- */
  function view(app, title, back) {
    load();
    title.textContent = "Frame & FE Analysis"; back.hidden = false;
    var h = '<div class="code-note">Stiffness matrix (displacement) method for frames · 4-node flat-shell FEA for slabs, plates & walls · Linear static, P-Delta and pushover · DXF input</div>';
    h += panel("p1", "1 · Geometry", srcForm(), true);
    h += panel("p2", "2 · Materials & sections", propForm());
    h += panel("p3", "3 · Loads (IS 875, IS 1893)", loadForm());
    h += panel("p4", "4 · Analyse", anaForm(), true);
    h += '<div id="mstat"></div><div id="viewer"></div><div id="results"></div>';
    app.innerHTML = h;
    app.querySelectorAll(".pnl > h3").forEach(function (hd) { hd.onclick = function () { hd.parentNode.classList.toggle("open"); }; });
    app.addEventListener("change", function (e) { if (e.target.getAttribute && e.target.getAttribute("data-k")) { grab(app); if (e.target.getAttribute("data-k") === "src") { $("srcbox").innerHTML = srcInner(); bindSrc(); } if (e.target.getAttribute("data-k") === "mat") matDefaults(app); } });
    bindSrc();
    app.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".rstd"); if (!b) return;
      var box = $(b.getAttribute("data-p"));
      box.querySelectorAll("[data-k]").forEach(function (el) { delete UV[el.getAttribute("data-k")]; });
      save(); box.querySelector(".pb").innerHTML = b.getAttribute("data-p") === "p2" ? propForm() : loadForm(); toast("Defaults restored");
    });
    $("bAna").onclick = function () { runLinear(false); };
    $("bPD").onclick = function () { runLinear(true); };
    $("bPO").onclick = runPushover;
    if (S.m) { status(); drawViewer(); if (S.res || S.po) renderResults(); }
    else { try { buildGen(true); } catch (e) {} }
  }
  function panel(id, t, body, open) { return '<section class="pnl' + (open ? " open" : "") + '" id="' + id + '"><h3>' + t + '</h3><div class="pb">' + body + '</div></section>'; }
  function srcForm() { return '<div class="form">' + sel("src", "Model source", [["gen", "Parametric frame generator"], ["dxf", "Import DXF drawing"]]) + '<div id="srcbox" class="full">' + srcInner() + '</div></div>'; }
  function srcInner() {
    if (P.src === "gen") return '<div class="form inner">' + txt("bx", "Bay widths along X (m)", "comma separated") + txt("by", "Bay widths along Y (m)", "leave blank for a 2D plane frame") +
      txt("hs", "Storey heights, bottom up (m)") + num("mesh", "Shell mesh size", "m") + chk("slabs", "Slabs as shell elements") + chk("walls", "Shear walls in end bays (Y)") + chk("brace", "X-bracing in end bays") +
      '<div class="btns"><button class="pri" id="bGen" type="button">Generate model</button></div></div>';
    var lay = S.dx ? Object.keys(S.dx.layers).sort() : [];
    var roles = [["auto", "Auto (by direction)"], ["column", "Column"], ["beam", "Beam / rafter"], ["brace", "Brace (pinned)"], ["slab", "Slab / plate"], ["wall", "Wall (shell)"], ["fixed", "Fixed support"], ["pin", "Pinned support"], ["ignore", "Ignore"]];
    var h = '<div class="form inner"><label class="fld full"><span>DXF file (ASCII, AutoCAD R12–2018)</span><input type="file" id="dxfFile" accept=".dxf,.DXF,application/dxf,text/plain,*/*"></label>' +
      sel("dmode", "Drawing type", [["3d", "3D model (X, Y, Z)"], ["2d", "2D elevation (X horizontal, Y up)"]]) +
      sel("dunits", "Drawing units", [["auto", "Auto ($INSUNITS)"], ["mm", "Millimetres"], ["cm", "Centimetres"], ["m", "Metres"], ["ft", "Feet"], ["in", "Inches"]]) + num("dmesh", "Shell mesh size", "m");
    if (lay.length) {
      h += '<div class="full"><div class="lbl">Layers → structural role' + (S.dx.units ? ' · file units code ' + S.dx.units : '') + '</div><div class="tw"><table><tr><th>Layer</th><th>Entities</th><th>Role</th><th>Section hint</th></tr>' +
        lay.map(function (L) {
          var r = P.roles[L] || DXF.guessRole(L), hn = DXF.secHint(L);
          return '<tr><td>' + esc(L) + '</td><td>' + S.dx.layers[L] + '</td><td><select data-layer="' + esc(L) + '">' + roles.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === r ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select></td><td>' + (hn ? esc(hn.name || (hn.b ? hn.b + "×" + hn.D : hn.t + " mm")) : "-") + '</td></tr>';
        }).join("") + '</table></div>' + (S.dx.warn.length ? '<div class="note">' + S.dx.warn.map(esc).join("<br>") + '</div>' : '') + '</div>';
    }
    h += '<div class="btns"><button class="pri" id="bDxf" type="button"' + (lay.length ? "" : " disabled") + '>Build model from DXF</button><button type="button" id="bSample">Sample DXF</button></div>' +
      '<div class="note full">Draw members as LINEs/POLYLINEs on layers such as COLUMN, BEAM, BRACE; slabs and walls as 3DFACEs or closed 4-sided polylines (one panel per bay) on SLAB / WALL layers; supports as POINTs on a SUPPORT layer (else the lowest nodes are fixed). Section sizes can be written in layer names: "COL 300x450", "ISMB300", "ISA 65x65x6", "SLAB 150".</div></div>';
    return h;
  }
  function bindSrc() {
    if ($("bGen")) $("bGen").onclick = function () { grab(document.getElementById("app")); try { buildGen(); } catch (e) { err(e); } };
    if ($("dxfFile")) $("dxfFile").onchange = function (ev) {
      var fl = ev.target.files[0]; if (!fl) return;
      var rd = new FileReader();
      rd.onload = function () { try { S.dx = DXF.parse(String(rd.result)); S.dxName = fl.name; UV.roles = {}; save(); $("srcbox").innerHTML = srcInner(); bindSrc(); toast(S.dx.ents.length + " entities on " + Object.keys(S.dx.layers).length + " layers"); } catch (e) { err(e); } };
      rd.readAsText(fl);
    };
    document.querySelectorAll("[data-layer]").forEach(function (s) { s.onchange = function () { UV.roles = UV.roles || {}; UV.roles[s.getAttribute("data-layer")] = s.value; save(); }; });
    if ($("bDxf")) $("bDxf").onclick = function () { grab(document.getElementById("app")); try { buildDxf(); } catch (e) { err(e); } };
    if ($("bSample")) $("bSample").onclick = function () {
      var g = MD.generate({ bx: "5, 4", by: "", hs: "3.5, 3.2", twoD: true, slabs: false, mesh: 1 });
      var m = { nodes: g.nodes, frames: g.frames.map(function (e) { return { n1: e.n1, n2: e.n2, layer: e.role === "column" ? "COLUMN 300x400" : "BEAM 300x450" }; }), shells: [], sup: g.sup };
      m.nodes = m.nodes.map(function (n) { return { x: n.x * 1000, y: n.z * 1000, z: 0 }; });
      var t = DXF.write(m).replace("$INSUNITS\n70\n6", "$INSUNITS\n70\n4");
      S.dx = DXF.parse(t); S.dxName = "sample-portal.dxf"; UV.dmode = "2d"; UV.roles = {}; save();
      $("srcbox").innerHTML = srcInner(); bindSrc(); download("sample-portal.dxf", t);
    };
  }
  function propForm() {
    return '<div class="form">' + sel("method", "Design method", [["lsm", "Limit state method (IS 456 / IS 800)"], ["wsm", "Working stress method (IS 456 Annex B / IS 800 Sec 11)"]]) + sel("mat", "Frame material", [["rcc", "RCC (IS 456)"], ["steel", "Structural steel (IS 800)"]]) +
      sel("fck", "Concrete grade", [[20, "M20"], [25, "M25"], [30, "M30"], [35, "M35"], [40, "M40"]]) + sel("fy", "Rebar grade", [[415, "Fe415"], [500, "Fe500"], [550, "Fe550"]]) + sel("fys", "Steel fy", [[250, "E250 (fy 250)"], [350, "E350 (fy 350)"]]) +
      txt("colSec", "Columns", "b×D mm (D along X) or ISMB…") + txt("beamSec", "Beams", "b×D mm or ISMB…") + txt("braceSec", "Braces", "ISA a×a×t or ISMB") +
      num("tSlab", "Slab thickness", "mm") + num("tWall", "Wall thickness", "mm") + chk("crack", "Cracked stiffness (IS 1893 cl 6.4.3.1: beams 0.35, columns 0.70)") +
      num("pcCol", "Column steel for hinges / P-M", "%") + num("pcBeam", "Beam steel (both faces) for hinges", "%") + num("kcol", "Column effective length factor", "", "IS 456 Table 28 / Annex E (1.2 for sway frames)") +
      area("secOver", "Member section overrides (optional)", "One rule per line: <i>which = section</i>. Which: member numbers (12, 1-12, F20), <i>columns / beams / braces / all</i>, optionally with <i>storey 1</i>, <i>storey 2-4</i>, <i>level 3.5</i> (m) or <i>layer NAME</i>. Later lines win. Tap a member in the 3D view to assign it directly.", "columns storey 1-2 = 450x450\nbeams storey 3 = 300x400\n15, 18-20 = ISMB 350") +
      '<div class="btns full"><button type="button" class="rstd" data-p="p2">Clear my entries (use defaults)</button></div><div class="note full">Priority: override rules › section written in the DXF layer name › the default sections above. Sections are standard-table values (SP 6).</div></div>';
  }
  function matDefaults(app) {
    save(); $("p3").querySelector(".pb").innerHTML = loadForm(); $("p2").querySelector(".pb").innerHTML = propForm();
  }
  function loadForm() {
    return '<div class="form">' + num("ff", "Floor finish + partitions", "kN/m²") + num("ll", "Imposed load (floors)", "kN/m²", "IS 875 Pt 2: office 2.5–4, residence 2") +
      num("ffRoof", "Roof finish / waterproofing", "kN/m²") + num("llRoof", "Roof imposed load", "kN/m²") + num("wall", "Wall load on floor beams", "kN/m", "230 mm brick × 3 m ≈ 13") +
      num("parapet", "Parapet load on roof beams", "kN/m") + num("bDL", "Extra DL on all beams", "kN/m", "use for 2D frames / no slabs") + num("bLL", "Extra LL on floor beams", "kN/m") + num("bLLr", "Extra LL on roof beams", "kN/m") +
      area("loadOver", "Extra member loads (optional)", "One rule per line: <i>which = DL x, LL y</i> in kN/m acting downward, added to the loads above. Same 'which' syntax as section overrides.", "beams storey 1 = DL 6, LL 2\n21-24 = DL 10") +
      chk("eq", "Seismic — IS 1893 (Part 1):2016 equivalent static") + sel("zone", "Seismic zone", [["II", "II (0.10)"], ["III", "III (0.16)"], ["IV", "IV (0.24)"], ["V", "V (0.36) — Kashmir valley"]]) +
      sel("I", "Importance factor I", [[1, "1.0 ordinary"], [1.2, "1.2 important / offices >200"], [1.5, "1.5 critical"]]) + sel("R", "Response reduction R", [[3, "3 OMRF"], [4, "4 braced steel"], [5, "5 SMRF / ductile"], [4.5, "4.5 dual (walls)"]]) +
      sel("soil", "Soil type", [["I", "I rock/hard"], ["II", "II medium"], ["III", "III soft"]]) + sel("sys", "Period formula", [["rc", "RC MRF 0.075h^0.75"], ["steel", "Steel MRF 0.085h^0.75"], ["other", "With infill/walls 0.09h/√d"]]) +
      chk("wind", "Wind — IS 875 (Part 3):2015") + sel("vbp", "Basic wind speed", Object.keys(D.vb).filter(function (k) { return k !== "Custom"; }).map(function (k) { return [k, k + " — " + D.vb[k] + " m/s"]; })) +
      sel("terrain", "Terrain category", [[1, "1 open sea/flat"], [2, "2 open terrain"], [3, "3 suburban"], [4, "4 city centre"]]) + num("cf", "Net force coefficient Cf") + num("trib", "Frame spacing (2D only)", "m") +
      '<div class="btns full"><button type="button" class="rstd" data-p="p3">Clear my entries (use defaults)</button></div><div class="note full">Combinations (IS 456 Table 18 / IS 875 Pt 5): 1.5(DL+LL), 1.2(DL+LL±EL), 1.5(DL±EL), 0.9DL±1.5EL. Seismic weight = DL + 25% LL (50% if LL>3 kN/m²), roof LL excluded. Lateral loads to nodes ∝ W·h² (cl 7.6.3).</div></div>';
  }
  function anaForm() {
    return '<div class="form">' + '<div class="btns full"><button class="pri" id="bAna" type="button">Linear static</button><button id="bPD" type="button">Linear + P-Delta</button></div>' +
      sel("pdir", "Pushover direction", [[0, "+X"], [1, "+Y"]]) + sel("ppat", "Lateral pattern", [["parabolic", "IS 1893 (W·h²)"], ["uniform", "Uniform (mass)"]]) +
      num("pdrift", "Target roof drift", "% of height") + num("pev", "Max hinge events") + chk("ppd", "Include P-Delta (geometric non-linearity)") +
      '<div class="btns full"><button class="pri" id="bPO" type="button">Run pushover (non-linear static)</button></div>' +
      '<div class="note full">Pushover: gravity (DL + 25% LL) first, then the lateral pattern is increased event-by-event. Plastic hinges form at member ends when M reaches Mp(P) from the P–M interaction (RCC: strain compatibility, IS 456 cl 38/39; steel: IS 800 cl 9.3.1), braces yield/buckle; P-Delta updates the geometric stiffness at every event.</div></div>';
  }

  /* ---------- model building ---------- */
  function err(e) { console.error(e); $("mstat").innerHTML = '<div class="err">' + esc(e.message || e) + '</div>'; }
  function setGeo(g) {
    S.geo = g; S.res = S.des = S.po = null; S.sel = null; S.state = null;
    var p = params(); MD._pm = {};
    S.m = MD.make(g, p); S.p = p;
    status(); drawViewer(); $("results").innerHTML = "";
  }
  function buildGen(quiet) {
    var g = MD.generate({ bx: P.bx, by: P.by, hs: P.hs, twoD: !MD.list(P.by).length, slabs: P.slabs, walls: P.walls, brace: P.brace, mesh: P.mesh || 1 });
    setGeo(g); if (!quiet) toast("Model generated");
  }
  function buildDxf() {
    if (!S.dx) throw new Error("Choose a DXF file first");
    var u = P.dunits === "auto" ? (DXF.UNITS[S.dx.units] || null) : { mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, "in": 0.0254 }[P.dunits];
    if (!u) {   /* guess from extents */
      var mx = 0; S.dx.ents.forEach(function (e) { e.p.forEach(function (q) { mx = Math.max(mx, Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])); }); });
      u = mx > 500 ? 0.001 : 1; toast("Units not set in file - assumed " + (u === 1 ? "metres" : "millimetres"));
    }
    var g = DXF.build(S.dx, { mode: P.dmode, scale: u, roles: P.roles, mesh: P.dmesh || 1 });
    if (!g.frames.length && !g.shells.length) throw new Error("No structural members found - check the layer roles");
    setGeo(g);
  }
  function status() {
    var m = S.m, nf = m.frames.length, ns = m.shells.length, nsup = Object.keys(m.sup).length;
    var cnt = {}; m.frames.forEach(function (e) { cnt[e.type] = (cnt[e.type] || 0) + 1; });
    var h = '<div class="rep"><div class="sum"><div><span>Nodes</span><b>' + m.nodes.length + '</b></div><div><span>Frame elements</span><b>' + nf + (nf ? ' (' + Object.keys(cnt).map(function (k) { return cnt[k] + " " + k + "s"; }).join(", ") + ')' : '') + '</b></div>' +
      '<div><span>Shell elements</span><b>' + ns + '</b></div><div><span>Supports</span><b>' + nsup + '</b></div><div><span>Type</span><b>' + (m.twoD ? "2D plane frame (XZ)" : "3D space structure") + '</b></div></div>';
    if (m.warn && m.warn.length) h += '<div class="note">' + m.warn.map(esc).join("<br>") + '</div>';
    h += '<div class="btns noprint"><button type="button" id="bExp">Export model DXF</button></div></div>';
    $("mstat").innerHTML = h;
    $("bExp").onclick = function () { var mm = { nodes: m.nodes, frames: m.frames.map(function (e) { return { n1: e.n1, n2: e.n2, layer: (e.type + " " + e.sec.name).toUpperCase() }; }), shells: m.shells, sup: m.sup }; download("model.dxf", DXF.write(mm)); };
  }
  function download(name, text) {
    if (window.AndroidBridge && AndroidBridge.saveFile) { AndroidBridge.saveFile(name, text); return; }
    var blob = new Blob([text], { type: name.slice(-4) === ".csv" ? "text/csv" : "application/dxf" });
    if (window.claude && window.claude.use && window.self !== window.top) { Promise.resolve(window.claude.use("downloads")).then(function (dl) { if (!dl) throw 0; return dl.save({ filename: name, data: blob }); }).then(function () { toast("Saved " + name); }, function () { toast("Download not available here"); }); return; }
    try { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast("Saved " + name); }
    catch (e) { toast("Download not available here"); }
  }

  /* ---------- analysis ---------- */
  function busy(t) { $("results").innerHTML = '<div class="rep"><div class="busy"><i></i>' + t + '</div></div>'; }
  function runLinear(pd) {
    grab(document.getElementById("app"));
    try { if (P.src === "gen" && !S.geo) buildGen(true); } catch (e) { return err(e); }
    if (!S.m) return err("Build a model first");
    var p = params(); S.p = p; MD._pm = {};
    S.m = MD.make(S.geo, p);
    busy("Assembling stiffness matrix and solving…");
    setTimeout(function () {
      try {
        var t0 = Date.now();
        S.L = MD.cases(S.m, p); S.cb = MD.combos(S.L.cases, p.method);
        S.res = FE.linear(S.m, S.L.cases, S.cb, { pdelta: pd }); S.res.pd = pd; S.res.ms = Date.now() - t0; S.res.incMap = {}; S.cb.forEach(function (c) { S.res.incMap[c.name] = c.inc || 1; });
        S.des = MD.design(S.m, S.res, p); S.drift = MD.drift(S.m, S.res); S.po = null;
        S.state = S.cb[0].name; S.disp = "def"; S.sel = null;
        drawViewer(); renderResults(); status(); $("viewer").scrollIntoView({ behavior: "smooth" });
      } catch (e) { err(e); $("results").innerHTML = ""; }
    }, 30);
  }
  function runPushover() {
    grab(document.getElementById("app"));
    try { if (P.src === "gen" && !S.geo) buildGen(true); } catch (e) { return err(e); }
    if (!S.m) return err("Build a model first");
    var p = params(); S.p = p; MD._pm = {};
    S.m = MD.make(S.geo, p);
    if (S.m.twoD && p.pdir === 1) return err("2D frame: push in X only");
    var m = S.m;
    try {
      var L = MD.cases(m, Object.assign({}, p, { wind: false })); S.L = L;
      var grav = { self: 1, frameUDL: L.cases.DL.frameUDL.concat(L.cases.LL.frameUDL.map(function (q) { return { e: q.e, w: q.w.map(function (v) { return 0.25 * v; }) }; })),
        shellP: L.cases.DL.shellP.concat(L.cases.LL.shellP.map(function (q) { return { e: q.e, q: q.q.map(function (v) { return 0.25 * v; }) }; })) };
      var zmax = -Infinity, zmin = Infinity; m.nodes.forEach(function (n) { zmax = Math.max(zmax, n.z); zmin = Math.min(zmin, n.z); });
      var cx = 0, cy = 0, top = []; m.nodes.forEach(function (n, i) { if (n.z > zmax - 0.01) { top.push(i); cx += n.x; cy += n.y; } });
      cx /= top.length; cy /= top.length;
      var ctrl = top.reduce(function (b, i) { var n = m.nodes[i], d = Math.hypot(n.x - cx, n.y - cy); return !b || d < b.d ? { i: i, d: d } : b; }, null).i;
      var pat = PO.pattern(m, L.W, p.pdir, p.ppat);
      if (!pat.length) throw new Error("No mass above the base - nothing to push");
      var st = PO.start(m, { gravity: grav, pattern: pat, ctrl: ctrl, dir: p.pdir, dmax: p.pdrift / 100 * (zmax - zmin), pdelta: p.ppd, maxEvents: p.pev || 80 });
    } catch (e) { return err(e); }
    S.res = null; S.des = null; S.cancel = false;
    $("results").innerHTML = '<div class="rep"><div class="busy"><i></i><span id="pop">Pushover: gravity applied…</span></div><div class="btns"><button type="button" id="bStop">Stop</button></div></div>';
    $("bStop").onclick = function () { S.cancel = true; };
    (function loop() {
      try {
        var t = Date.now(), done = false;
        while (!done && Date.now() - t < 150 && !S.cancel) done = st.step();
        var pr = st.progress();
        if ($("pop")) $("pop").textContent = "Pushover event " + pr.ev + " / " + pr.max + " — V = " + pr.V.toFixed(0) + " kN, roof drift " + (pr.d * 1000).toFixed(1) + " mm";
        if (!done && !S.cancel) return setTimeout(loop, 0);
        S.po = st.finish(); S.po.ctrl = ctrl; S.po.dir = p.pdir; S.po.H = zmax - zmin; if (S.cancel) S.po.stop = "stopped by user";
        S.disp = "hinge"; S.sel = null; drawViewer(); renderResults(); $("viewer").scrollIntoView({ behavior: "smooth" });
      } catch (e) { err(e); }
    })();
  }

  /* ---------- state (case / combo) ---------- */
  function stateOf(name) {
    var r = S.res; if (!r) return null;
    var cb = r.combos.filter(function (c) { return c.name === name; })[0];
    if (cb) return { U: cb.U, fr: function (k) { return cb.fr[k]; }, sh: function (k) { return cb.sh[k]; }, reac: cb.reac };
    var c = r.cases[name]; if (!c) return null;
    var frc = [], shc = [];
    return { U: c.U, fr: function (k) { return frc[k] || (frc[k] = FE.frameForces(S.m, k, c.U, c.lv.qeq[k], 0)); }, sh: function (k) { return shc[k] || (shc[k] = FE.shellForces(S.m, k, c.U)); } };
  }

  /* ---------- 3D viewer ---------- */
  function drawViewer() {
    var v = $("viewer"); if (!v || !S.m) return;
    var opts = [["model", "Model"], ["util", "Design status"]];
    if (S.res) opts.push(["def", "Deformed shape"], ["mz", "Bending moment Mz"], ["my", "Bending moment My"], ["n", "Axial force"], ["smx", "Slab/wall Mx contour"], ["smy", "Slab/wall My contour"], ["uz", "Vertical displacement contour"]);
    if (S.po) opts.push(["hinge", "Pushover hinges & deformed"]);
    if (!opts.some(function (o) { return o[0] === S.disp; })) S.disp = S.res ? "def" : S.po ? "hinge" : "model";
    var states = S.res ? Object.keys(S.res.cases).concat(S.cb.map(function (c) { return c.name; })) : [];
    var h = '<div class="rep viewer"><div class="vbar"><select id="vDisp">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.disp ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>' +
      (states.length ? '<select id="vState">' + states.map(function (s) { return '<option' + (s === S.state ? " selected" : "") + '>' + esc(s) + '</option>'; }).join("") + '</select>' : '') +
      '<button type="button" id="vFit" title="Reset view">⟲</button><button type="button" id="vTop" title="Plan">Plan</button><button type="button" id="vFront" title="Elevation">Elev</button></div>' +
      '<canvas id="cv"></canvas><div id="leg" class="leg"></div><div class="note">Drag to rotate · pinch / wheel to zoom · two-finger drag to pan · tap a member or element for details</div><div id="selinfo"></div></div>';
    v.innerHTML = h;
    $("vDisp").onchange = function () { S.disp = this.value; render(); };
    if ($("vState")) $("vState").onchange = function () { S.state = this.value; render(); if (S.sel) showSel(); };
    $("vFit").onclick = function () { S.view = { yaw: S.m.twoD ? 0 : -0.6, pitch: S.m.twoD ? 0 : 0.45, zoom: 1, px: 0, py: 0 }; render(); };
    $("vTop").onclick = function () { S.view.yaw = 0; S.view.pitch = Math.PI / 2 - 1e-3; render(); };
    $("vFront").onclick = function () { S.view.yaw = 0; S.view.pitch = 0; render(); };
    if (S.m.twoD && !S._2dset) { S.view = { yaw: 0, pitch: 0, zoom: 1, px: 0, py: 0 }; S._2dset = true; }
    if (!S.m.twoD) S._2dset = false;
    bindCanvas($("cv")); render();
  }
  function bindCanvas(cv) {
    var pts = {}, last = null, moved = false;
    function center(o) { var k = Object.keys(o), x = 0, y = 0; k.forEach(function (i) { x += o[i].x; y += o[i].y; }); return { x: x / k.length, y: y / k.length, n: k.length, d: k.length > 1 ? Math.hypot(o[k[0]].x - o[k[1]].x, o[k[0]].y - o[k[1]].y) : 0 }; }
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; last = center(pts); moved = false; });
    cv.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return; pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var c = center(pts); if (!last || c.n !== last.n) { last = c; return; }
      var dx = c.x - last.x, dy = c.y - last.y; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (c.n === 1) { S.view.yaw += dx * 0.01; S.view.pitch = Math.max(-1.55, Math.min(1.55, S.view.pitch + dy * 0.01)); }
      else { S.view.px += dx; S.view.py += dy; if (last.d > 0 && c.d > 0) S.view.zoom *= c.d / last.d; }
      last = c; render();
    });
    function up(e) { if (pts[e.pointerId] && !moved && Object.keys(pts).length === 1) pick(e); delete pts[e.pointerId]; last = center(pts); if (!last.n) last = null; }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", function (e) { delete pts[e.pointerId]; last = null; });
    cv.addEventListener("wheel", function (e) { e.preventDefault(); S.view.zoom *= e.deltaY < 0 ? 1.12 : 1 / 1.12; render(); }, { passive: false });
  }
  var PRJ = null;
  function render() {
    var cv = $("cv"); if (!cv) return;
    var W = cv.clientWidth || 340, H = Math.round(Math.min(560, Math.max(300, W * 0.8))), dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var dark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    g.fillStyle = dark ? "#0f1620" : "#fbfcfe"; g.fillRect(0, 0, W, H);
    var m = S.m, v = S.view, cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    var st = S.res && S.state ? stateOf(S.state) : null, disp = S.disp, U = null, sc = 0;
    if (disp === "hinge" && S.po) U = S.po.U; else if (st && /def|mz|my|n|smx|smy|uz|util/.test(disp)) U = st.U;
    var bx = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    m.nodes.forEach(function (n) { bx[0] = Math.min(bx[0], n.x); bx[1] = Math.max(bx[1], n.x); bx[2] = Math.min(bx[2], n.y); bx[3] = Math.max(bx[3], n.y); bx[4] = Math.min(bx[4], n.z); bx[5] = Math.max(bx[5], n.z); });
    var span = Math.max(bx[1] - bx[0], bx[3] - bx[2], bx[5] - bx[4], 1), c0 = [(bx[0] + bx[1]) / 2, (bx[2] + bx[3]) / 2, (bx[4] + bx[5]) / 2];
    if (U && (disp === "def" || disp === "hinge")) { var um = 0; for (var i = 0; i < m.nodes.length; i++) um = Math.max(um, Math.hypot(U[6 * i], U[6 * i + 1], U[6 * i + 2])); sc = um > 0 ? 0.08 * span / um : 0; }
    var s = Math.min(W, H) * 0.8 / span * v.zoom;
    function pr(x, y, z) {
      var X = x - c0[0], Y = y - c0[1], Z = z - c0[2];
      var a = X * cy + Y * sy, b = -X * sy + Y * cy;          /* rotate about Z */
      var sx = a, syy = Z * cp - b * sp, dep = Z * sp + b * cp;
      return [W / 2 + v.px + sx * s, H / 2 + v.py - syy * s, dep];
    }
    function P(i) { var n = m.nodes[i]; return sc ? pr(n.x + sc * U[6 * i], n.y + sc * U[6 * i + 1], n.z + sc * U[6 * i + 2]) : pr(n.x, n.y, n.z); }
    PRJ = { pr: pr, P: P };
    /* shells */
    var cont = (disp === "smx" || disp === "smy" || disp === "uz") && st, vals = [], vmin = Infinity, vmax = -Infinity;
    if (cont) {
      m.shells.forEach(function (e, k) {
        var val;
        if (disp === "uz") val = e.n.reduce(function (a, i) { return a + st.U[6 * i + 2]; }, 0) / 4 * 1000;
        else { var fs = st.sh(k); val = -(disp === "smx" ? fs.Mx : fs.My); }
        vals[k] = val; vmin = Math.min(vmin, val); vmax = Math.max(vmax, val);
      });
      if (disp === "uz") m.frames.forEach(function () {});
    }
    var polys = m.shells.map(function (e, k) { var q = e.n.map(P); return { q: q, d: (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4, k: k }; }).sort(function (a, b) { return a.d - b.d; });
    var fail = {}; if (S.des && disp === "util") ["slabs", "walls"].forEach(function (gk) { S.des[gk].forEach(function (r) { if (!r.ok) fail["s" + r.k] = 1; }); });
    polys.forEach(function (p) {
      var e = m.shells[p.k];
      g.beginPath(); p.q.forEach(function (q, i) { i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
      g.fillStyle = cont ? cmap(vals[p.k], vmin, vmax) : disp === "util" && S.des ? (fail["s" + p.k] ? "rgba(198,40,40,.55)" : "rgba(30,142,74,.35)") : e.kind === "wall" ? "rgba(224,122,31,.28)" : "rgba(80,140,220,.22)";
      g.fill(); g.strokeStyle = dark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.12)"; g.lineWidth = 0.6; g.stroke();
    });
    /* frames */
    var util = {}; if (S.des) ["beams", "cols", "steel"].forEach(function (gk) { S.des[gk].forEach(function (r) { util[r.k] = r; }); });
    var dg = (disp === "mz" || disp === "my" || disp === "n") && st, dmax = 0, dd = [];
    if (dg) m.frames.forEach(function (e, k) { var d = FE.frameDiagram(st.fr(k), 8); dd[k] = d; d.forEach(function (q) { dmax = Math.max(dmax, Math.abs(disp === "mz" ? q.Mz : disp === "my" ? q.My : q.N)); }); });
    var ds = dmax > 0 ? 0.06 * span / dmax : 0;
    m.frames.forEach(function (e, k) {
      var a = P(e.n1), b = P(e.n2);
      var col = e.type === "column" ? (dark ? "#9ab6d8" : "#1d3557") : e.type === "brace" ? "#7a5bbf" : (dark ? "#f0a050" : "#c4621a");
      if (disp === "util" && util[k]) col = util[k].ok ? (util[k].ratio > 0.85 ? "#e0a020" : "#1e8e4a") : "#c62828";
      if (S.sel && S.sel.t === "f" && S.sel.k === k) col = "#00a3ff";
      g.strokeStyle = col; g.lineWidth = S.sel && S.sel.t === "f" && S.sel.k === k ? 4 : e.type === "brace" ? 1.4 : 2.2;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      if (dg && ds) {
        var ff = st.fr(k), R = ff.R, A = m.nodes[e.n1], dir = disp === "my" ? R[2] : R[1];
        g.beginPath(); g.fillStyle = "rgba(29,53,87,.16)"; g.strokeStyle = dark ? "#7fb0e8" : "#1d3557"; g.lineWidth = 1;
        var poly = dd[k].map(function (q) {
          var val = disp === "mz" ? -q.Mz : disp === "my" ? q.My : q.N, t = q.x;
          return pr(A.x + R[0][0] * t + dir[0] * val * ds, A.y + R[0][1] * t + dir[1] * val * ds, A.z + R[0][2] * t + dir[2] * val * ds);
        });
        var a0 = pr(A.x, A.y, A.z), b0 = pr(A.x + R[0][0] * ff.L, A.y + R[0][1] * ff.L, A.z + R[0][2] * ff.L);
        g.moveTo(a0[0], a0[1]); poly.forEach(function (q) { g.lineTo(q[0], q[1]); }); g.lineTo(b0[0], b0[1]); g.closePath(); g.fill(); g.stroke();
      }
    });
    /* hinges */
    if (disp === "hinge" && S.po) {
      var colr = { "Elastic": "#9e9e9e", "B-IO": "#1e8e4a", "IO-LS": "#2b7bd6", "LS-CP": "#e0a020", "> CP": "#c62828", "Axial yield/buckle": "#7a5bbf" };
      S.po.hinges.forEach(function (h) {
        var e = m.frames[h.k], a = P(e.n1), b = P(e.n2), t = h.end === "i" ? 0.12 : 0.88, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        if (h.axis === "a") { x = (a[0] + b[0]) / 2; y = (a[1] + b[1]) / 2; }
        g.beginPath(); g.arc(x, y, 4.5, 0, 6.3); g.fillStyle = colr[h.state] || "#c62828"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke();
      });
    }
    /* supports */
    Object.keys(m.sup).forEach(function (i) { var q = P(+i), fx = m.sup[i][3]; g.fillStyle = fx ? "#2e7d32" : "#8d6e63"; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] - 6, q[1] + 9); g.lineTo(q[0] + 6, q[1] + 9); g.closePath(); g.fill(); });
    if (S.sel && S.sel.t === "s") { var e2 = m.shells[S.sel.k]; g.beginPath(); e2.n.map(P).forEach(function (q, i) { i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.strokeStyle = "#00a3ff"; g.lineWidth = 3; g.stroke(); }
    /* axes */
    var o = [34, H - 30], ax = [[1, 0, 0, "X", "#c62828"], [0, 1, 0, "Y", "#2e7d32"], [0, 0, 1, "Z", "#1565c0"]];
    ax.forEach(function (a) { var p0 = pr(c0[0], c0[1], c0[2]), p1 = pr(c0[0] + a[0] * span / s * 22, c0[1] + a[1] * span / s * 22, c0[2] + a[2] * span / s * 22); var dx = (p1[0] - p0[0]) / span * s / 1, dy = (p1[1] - p0[1]) / span * s; dx = (p1[0] - p0[0]); dy = (p1[1] - p0[1]); var l = Math.hypot(dx, dy) || 1; if (m.twoD && a[3] === "Y") return; g.strokeStyle = a[4]; g.lineWidth = 2; g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(o[0] + dx / l * 22 * Math.min(1, l / 22), o[1] + dy / l * 22 * Math.min(1, l / 22)); g.stroke(); g.fillStyle = a[4]; g.font = "11px sans-serif"; g.fillText(a[3], o[0] + dx / l * 27, o[1] + dy / l * 27 + 4); });
    /* legend */
    var lg = $("leg"), lh = "";
    if (cont) lh = '<span class="cbar"></span> ' + f(vmin, 2) + ' … ' + f(vmax, 2) + (disp === "uz" ? " mm (Z)" : " kNm/m (sagging +, local axes)");
    else if (dg) lh = "Max |" + (disp === "n" ? "N" : disp === "mz" ? "Mz" : "My") + "| = " + f(dmax, 1) + (disp === "n" ? " kN" : " kNm") + (disp === "mz" ? " — drawn on tension side" : "");
    else if ((disp === "def" || disp === "hinge") && sc) { var mxu = 0, mi = 0; for (i = 0; i < m.nodes.length; i++) { var uu = Math.hypot(U[6 * i], U[6 * i + 1], U[6 * i + 2]); if (uu > mxu) { mxu = uu; mi = i; } } lh = "Max displacement " + f(mxu * 1000, 2) + " mm at node " + (mi + 1) + " (scale ×" + f(sc, 0) + ")"; }
    if (disp === "hinge") lh += '<br><b style="color:#1e8e4a">●</b> B–IO <b style="color:#2b7bd6">●</b> IO–LS <b style="color:#e0a020">●</b> LS–CP <b style="color:#c62828">●</b> &gt;CP <b style="color:#7a5bbf">●</b> brace';
    if (disp === "util") lh = '<b style="color:#1e8e4a">■</b> OK <b style="color:#e0a020">■</b> ratio &gt; 0.85 <b style="color:#c62828">■</b> fails' + (S.des ? "" : " (run linear analysis first)");
    lg.innerHTML = lh;
  }
  function cmap(v, a, b) {
    var t = b > a ? (v - a) / (b - a) : 0.5, st = [[0, [33, 102, 172]], [0.25, [103, 169, 207]], [0.5, [209, 229, 240]], [0.75, [244, 165, 130]], [1, [178, 24, 43]]];
    for (var i = 1; i < st.length; i++) if (t <= st[i][0]) { var u = (t - st[i - 1][0]) / (st[i][0] - st[i - 1][0]), c = st[i - 1][1].map(function (x, j) { return Math.round(x + (st[i][1][j] - x) * u); }); return "rgba(" + c.join(",") + ",.85)"; }
    return "rgba(178,24,43,.85)";
  }
  function pick(e) {
    var cv = $("cv"), r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, m = S.m;
    m.frames.forEach(function (fr, k) {
      var a = PRJ.P(fr.n1), b = PRJ.P(fr.n2), dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      var d = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y); if (d < 14 && (!best || d < best.d)) best = { t: "f", k: k, d: d };
    });
    if (!best) m.shells.forEach(function (sh, k) {
      var q = sh.n.map(PRJ.P), inside = false;
      for (var i = 0, j = 3; i < 4; j = i++) if ((q[i][1] > y) !== (q[j][1] > y) && x < (q[j][0] - q[i][0]) * (y - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) inside = !inside;
      var dep = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4;
      if (inside && (!best || dep > best.dep)) best = { t: "s", k: k, dep: dep };
    });
    S.sel = best; render(); showSel();
  }
  function showSel() {
    var box = $("selinfo"), sl = S.sel, m = S.m; if (!box) return;
    if (!sl) { box.innerHTML = ""; return; }
    var st = S.res && S.state ? stateOf(S.state) : null, h = '<div class="selbox">';
    if (sl.t === "f") {
      var e = m.frames[sl.k], A = m.nodes[e.n1], B = m.nodes[e.n2];
      h += '<h4>' + cap(e.type) + ' F' + (sl.k + 1) + ' — ' + esc(e.sec.name) + ' <i class="small">(' + esc(e.src || "default") + ')</i> · L = ' + f(e.L, 3) + ' m · nodes ' + (e.n1 + 1) + '→' + (e.n2 + 1) + (e.layer ? ' · layer ' + esc(e.layer) : '') + '</h4>';
      h += '<div class="small">(' + f(A.x) + ', ' + f(A.y) + ', ' + f(A.z) + ') → (' + f(B.x) + ', ' + f(B.y) + ', ' + f(B.z) + ') m</div>';
      if (st) {
        var d = FE.frameDiagram(st.fr(sl.k), 20);
        h += '<div class="small">Combination / case: <b>' + esc(S.state) + '</b></div>' + diagSvg(d, "N", "Axial N (kN, tension +)") + diagSvg(d, "Vy", "Shear Vy (kN)") + diagSvg(d, "Mz", "Moment Mz (kNm, sagging +)");
        if (!m.twoD) h += diagSvg(d, "Vz", "Shear Vz (kN)") + diagSvg(d, "My", "Moment My (kNm)") + '<div class="small">Torsion T = ' + f(d[0].T) + ' kNm</div>';
      }
      h += '<div class="asg noprint"><input id="asgSec" placeholder="new section e.g. 450x450 or ISMB 400"><button type="button" id="asgBtn">Assign to F' + (sl.k + 1) + '</button></div>';
      var dr = S.des && (S.des.beams.concat(S.des.cols, S.des.steel).filter(function (r) { return r.k === sl.k; })[0]);
      if (dr) { h += desText(dr, e); var stp = CALC.forMember(S.des, m, sl.k, S.p); if (stp) h += '<details class="calc" open><summary>Worked calculation (IS code equations & limits)</summary>' + CALC.html(stp, esc) + '</details>'; }
      if (S.po) S.po.hinges.filter(function (hh) { return hh.k === sl.k; }).forEach(function (hh) { h += '<div class="small">Pushover hinge at end ' + hh.end + ' (' + (hh.axis === "a" ? "axial" : "M" + hh.axis) + '): event ' + hh.ev + ', V = ' + f(hh.V, 1) + ' kN, plastic rotation ' + f(hh.rot, 4) + ' rad → <b>' + hh.state + '</b></div>'; });
    } else {
      var s = m.shells[sl.k];
      h += '<h4>' + cap(s.kind) + ' element S' + (sl.k + 1) + ' · t = ' + f(s.t * 1000, 0) + ' mm · nodes ' + s.n.map(function (i) { return i + 1; }).join(", ") + '</h4>';
      if (st) { var fs = st.sh(sl.k); h += '<div class="small">' + esc(S.state) + ' — local axes: Nx ' + f(fs.Nx, 1) + ', Ny ' + f(fs.Ny, 1) + ', Nxy ' + f(fs.Nxy, 1) + ' kN/m · Mx ' + f(fs.Mx, 2) + ', My ' + f(fs.My, 2) + ', Mxy ' + f(fs.Mxy, 2) + ' kNm/m · Qx ' + f(fs.Qx, 1) + ', Qy ' + f(fs.Qy, 1) + ' kN/m</div>'; }
      var sd = S.des && S.des[s.kind === "wall" ? "walls" : "slabs"].filter(function (r) { return r.k === sl.k; })[0];
      if (sd) h += shellText(sd) + '<details class="calc" open><summary>Worked calculation (IS code equations & limits)</summary>' + CALC.html(CALC.shell(sd, S.p), esc) + '</details>';
    }
    box.innerHTML = h + '</div>';
    if ($("asgBtn")) $("asgBtn").onclick = function () {
      var v = $("asgSec").value.trim(); if (!v) return;
      if (!MD.parseSec(v, params(), m.frames[sl.k].type)) { toast("Section not recognised: " + v); return; }
      UV.secOver = ((given("secOver") ? UV.secOver + "\n" : "") + "F" + (sl.k + 1) + " = " + v); save();
      var ta = document.querySelector("[data-k=secOver]"); if (ta) ta.value = UV.secOver;
      S.m = MD.make(S.geo, params()); S.res = S.des = S.po = null; status(); drawViewer(); $("results").innerHTML = "";
      toast("F" + (sl.k + 1) + " = " + v + " — re-run the analysis");
    };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function diagSvg(d, key, label) {
    var W = 320, H = 70, L = d[d.length - 1].x || 1, mx = 0; d.forEach(function (q) { mx = Math.max(mx, Math.abs(q[key])); });
    var sy = mx > 0 ? (H / 2 - 8) / mx : 0, sgn = key === "Mz" ? 1 : -1;
    var pts = d.map(function (q) { return (10 + q.x / L * (W - 20)).toFixed(1) + "," + (H / 2 + sgn * q[key] * sy).toFixed(1); });
    var ext = d.reduce(function (b, q) { return Math.abs(q[key]) > Math.abs(b[key]) ? q : b; }, d[0]);
    return '<div class="dg"><div class="small">' + label + ': end i ' + f(d[0][key], 1) + ', end j ' + f(d[d.length - 1][key], 1) + ', max ' + f(ext[key], 1) + ' at ' + f(ext.x, 2) + ' m</div><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%"><line x1="10" y1="' + H / 2 + '" x2="' + (W - 10) + '" y2="' + H / 2 + '" stroke="#888"/><polygon points="10,' + H / 2 + ' ' + pts.join(" ") + ' ' + (W - 10) + ',' + H / 2 + '" fill="rgba(224,122,31,.25)" stroke="#e07a1f"/></svg></div>';
  }
  function desText(r, e) {
    var h = '<div class="dbox ' + (r.ok ? "okb" : "nob") + '"><b>' + (r.ok ? "✓ Design OK" : "✗ Design fails") + '</b> ';
    if (r.wsm) h += '<i>(working stress)</i> ';
    if (r.Ab !== undefined) h += '— IS 456 beam: M+ ' + f(r.Ms, 1) + ' kNm (' + esc(r.cs || "-") + '), M− ' + f(r.Mh, 1) + ' kNm (' + esc(r.ch || "-") + '), V ' + f(r.V, 1) + ' kN, Tu ' + f(r.T, 1) + ' kNm<br>Bottom Ast ' + f(r.Ab, 0) + ' mm² → ' + r.barsB + '<br>Top Ast ' + f(r.At, 0) + ' mm² → ' + r.barsT + '<br>τv ' + f(r.tv) + ' vs τc ' + f(r.tc) + ' N/mm² → 2L-8φ @ ' + (r.sv || "-") + ' mm c/c';
    else if (r.need !== undefined) h += '— IS 456 column (biaxial, Bresler cl 39.6): Pu max ' + f(r.Pu, 0) + ' kN' + (r.need ? '<br>Steel required ' + f(r.need.pc, 1) + '% = ' + f(r.need.As, 0) + ' mm² → ' + r.bars + '<br>Critical: ' + esc(r.need.q ? r.need.q.cb : "-") + ' — Pu ' + f(r.need.q && r.need.q.Pu, 0) + ' kN, Mux ' + f(r.need.q && r.need.q.Mz, 1) + ', Muy ' + f(r.need.q && r.need.q.My, 1) + ' kNm; interaction ' + f(r.need.r, 3) : '');
    else h += '— IS 800: interaction ratio ' + f(r.ratio, 3) + ' (' + esc(r.cb || "-") + ')<br>' + r.txt;
    if (r.msg && r.msg.length) h += '<br><i>' + r.msg.map(esc).join("<br>") + '</i>';
    return h + '</div>';
  }
  function shellText(r) {
    var h = '<div class="dbox ' + (r.ok ? "okb" : "nob") + '"><b>' + (r.ok ? "✓ OK" : "✗ Fails") + '</b> Wood–Armer design moments (envelope): bottom ' + f(r.bx) + ' / ' + f(r.by) + ', top ' + f(r.tx) + ' / ' + f(r.ty) + ' kNm/m (x / y)<br>Ast bottom ' + f(r.Abx, 0) + ' / ' + f(r.Aby, 0) + ', top ' + f(r.Atx, 0) + ' / ' + f(r.Aty, 0) + ' mm²/m → ' + barTxt(Math.max(r.Abx, r.Aby, r.Atx, r.Aty), r.t);
    if (r.kind === "wall") h += '<br>Max compression ' + f(r.sc) + ' N/mm², in-plane shear ' + f(r.tau) + ' N/mm², tension steel ' + f(r.Ast, 0) + ' mm²/m';
    if (r.msg.length) h += '<br><i>' + r.msg.map(esc).join("<br>") + '</i>';
    return h + '</div>';
  }
  function barTxt(As, t) { if (!(As > 0)) return "-"; var dia = As > 700 ? 12 : As > 350 ? 10 : 8, a = Math.PI * dia * dia / 4, sp = Math.min(Math.floor(1000 * a / As / 10) * 10, 3 * t, 300); return dia + "φ @ " + sp + " c/c (max)"; }

  /* ---------- results ---------- */
  function renderResults() {
    var h = "", m = S.m;
    if (S.res) {
      var r = S.res, cb0 = r.combos[0], umax = 0, ui = 0;
      for (var i = 0; i < m.nodes.length; i++) { var u = Math.hypot(cb0.U[6 * i], cb0.U[6 * i + 1], cb0.U[6 * i + 2]); if (u > umax) { umax = u; ui = i; } }
      var Rz = 0; Object.keys(cb0.reac).forEach(function (k) { Rz += cb0.reac[k][2]; });
      h += '<div class="rep"><div class="rh"><div><h3>Linear static analysis' + (r.pd ? ' with P-Delta' : '') + '</h3><div class="mbadge">Design: ' + (S.p.method === "wsm" ? "Working stress method" : "Limit state method") + (given("method") ? "" : " (default)") + '</div><small>Direct stiffness method · ' + r.info.neq + ' equations · skyline ' + (r.info.size / 1e6).toFixed(2) + ' M terms · ' + r.ms + ' ms</small></div>' +
        '<span class="badge ' + (S.des.fails ? "fail" : "pass") + '">' + (S.des.fails ? S.des.fails + " FAIL" : "ALL OK") + '</span></div>';
      h += '<div class="sum"><div><span>Max displacement, ' + esc(cb0.name) + '</span><b>' + f(umax * 1000, 2) + ' mm at node ' + (ui + 1) + '</b></div><div><span>Total vertical reaction, ' + esc(cb0.name) + '</span><b>' + f(Rz, 1) + ' kN</b></div>';
      if (r.pd) { var a = r.combos.map(function (c) { return c.pdAmp; }); h += '<div><span>P-Delta displacement amplification (max)</span><b>' + f(Math.max.apply(null, a), 3) + '</b></div>'; }
      h += '</div>';
      var dfl = used().filter(function (k) { return LBL[k]; }).map(function (k) { return LBL[k] + " " + dtxt(k); });
      if (dfl.length) h += '<div class="note"><b>Defaults used</b> (not entered): ' + esc(dfl.join(" · ")) + '</div>';
      if (S.L.notes.length) h += '<div class="note">' + S.L.notes.map(esc).join("<br>") + '</div>';
      Object.keys(S.L.eq).forEach(function (k) { var q = S.L.eq[k]; h += '<div class="eq">' + k + ': h = ' + f(q.H, 2) + ' m, d = ' + f(q.d, 1) + ' m, Ta = ' + f(q.T, 3) + ' s, Sa/g = ' + f(q.Sa, 3) + ', Ah = Z/2 · Sa/g / (R/I) = ' + f(q.Ah, 4) + (q.Ahd > q.Ah ? ' → min ' + f(q.Ahd, 4) + ' (Table 7)' : '') + ', W = ' + f(q.W, 0) + ' kN, <b>Vb = ' + f(q.Vb, 1) + ' kN</b></div>'; });
      Object.keys(S.L.wind).forEach(function (k) { var q = S.L.wind[k]; h += '<div class="eq">' + k + ': exposed width ' + f(q.B, 1) + ' m, total wind force ' + f(q.F, 1) + ' kN (pd = 0.7·pz min, Cf ' + S.p.cf + ')</div>'; });
      if (S.drift.length) h += '<h4>Storey drift (unfactored lateral load, IS 1893 cl 7.11.1 limit 0.004h)</h4>' + tbl(["Case", "Level z (m)", "Max disp (mm)", "Drift ratio", ""], S.drift.map(function (d) { return [d.c, f(d.z, 2), f(d.d * 1000, 2), f(d.dr, 5), d.lim ? (d.ok ? '<span class="okt">OK</span>' : '<span class="not">EXCEEDS</span>') : '']; }));
      h += designTables() + basisBlock();
      h += '<h4>Support reactions — ' + esc(cb0.name) + '</h4>' + tbl(["Node", "Fx", "Fy", "Fz (kN)", "Mx", "My", "Mz (kNm)"], Object.keys(cb0.reac).slice(0, 60).map(function (k) { var q = cb0.reac[k]; return [+k + 1].concat(q.map(function (v) { return f(v, 1); })); }));
      h += '<div class="btns noprint"><button type="button" class="pri bXls">Excel: full analysis & design</button></div><div class="btns noprint"><button type="button" id="bCSV">Forces CSV</button><button type="button" id="bPrint">Print / Save PDF</button></div>';
      h += '<div class="disc">Analysis: 3D frame elements (Euler–Bernoulli, 6 DOF/node) by the direct stiffness method; slabs, plates & walls by 4-node flat shell FEA (QM6 incompatible-mode membrane + MITC4 Mindlin plate). Verified against closed-form beam, frame, plate and wall solutions. Results must be reviewed by a qualified structural engineer.</div></div>';
    }
    if (S.po) h += poReport() + (S.res ? '' : '<div class="btns noprint"><button type="button" class="pri bXls">Excel: pushover & model</button></div>');
    $("results").innerHTML = h;
    document.querySelectorAll(".bXls").forEach(function (b) { b.onclick = exportXlsx; });
    if ($("bPrint")) { if (!window.AndroidBridge && window.self !== window.top) $("bPrint").hidden = true; $("bPrint").onclick = function () { document.querySelectorAll("details").forEach(function (x) { x.open = true; }); if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print("Frame analysis"); else window.print(); }; }
    if ($("bCSV")) $("bCSV").onclick = csv;
    if ($("bAllCalc")) $("bAllCalc").onclick = function () { this.disabled = true; this.textContent = "Preparing…"; var b = this; setTimeout(function () { allCalcs(); b.textContent = "All member calculations shown below"; }, 20); };
    document.querySelectorAll("[data-fk]").forEach(function (td) { td.onclick = function () { S.sel = { t: td.getAttribute("data-t"), k: +td.getAttribute("data-fk") }; render(); showSel(); $("viewer").scrollIntoView({ behavior: "smooth" }); }; });
  }
  function tbl(head, rows) { return '<div class="tw"><table><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join("") + '</tr>' + rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + x + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>'; }
  function lk(t, k, label) { return '<a class="lk" data-t="' + t + '" data-fk="' + k + '">' + label + '</a>'; }
  function okc(ok) { return ok ? '<span class="okt">OK</span>' : '<span class="not">FAIL</span>'; }
  function sortFail(a) { return a.slice().sort(function (x, y) { return (x.ok - y.ok); }); }
  function designTables() {
    var d = S.des, h = "", LIM = 40;
    if (d.beams.length) h += '<h4>RCC beams — ' + (S.p.method === "wsm" ? 'IS 456 Annex B (working stress)' : 'IS 456 (flexure Annex G, shear cl 40, torsion cl 41)') + ' · ' + d.beams.filter(function (r) { return !r.ok; }).length + ' fail of ' + d.beams.length + '</h4>' +
      tbl(["Member", "Section", (S.p.method === "wsm" ? "M+" : "Mu+") + " kNm", (S.p.method === "wsm" ? "M−" : "Mu−") + " kNm", (S.p.method === "wsm" ? "V" : "Vu") + " kN", "Bottom", "Top", "Stirrups", ""], sortFail(d.beams).slice(0, LIM).map(function (r) { return [lk("f", r.k, "F" + (r.k + 1)), r.name, f(r.Ms, 1), f(r.Mh, 1), f(r.V, 1), r.barsB, r.barsT, r.sv ? "2L-8φ@" + r.sv : "-", okc(r.ok)]; })) + more(d.beams.length, LIM);
    if (d.cols.length) h += '<h4>RCC columns — ' + (S.p.method === "wsm" ? 'IS 456 Annex B-3, B-4 (working stress)' : 'IS 456 cl 39 (P–M strain compatibility, biaxial Bresler, slenderness cl 39.7)') + ' · ' + d.cols.filter(function (r) { return !r.ok; }).length + ' fail of ' + d.cols.length + '</h4>' +
      tbl(["Member", "Section", "Pu kN", "Steel %", "Bars", "Ratio", ""], sortFail(d.cols).slice(0, LIM).map(function (r) { return [lk("f", r.k, "F" + (r.k + 1)), r.name, f(r.Pu, 0), r.need ? f(r.need.pc, 1) : "> 4", r.bars, r.need ? f(r.need.r, 3) : "-", okc(r.ok)]; })) + more(d.cols.length, LIM);
    if (d.steel.length) h += '<h4>Steel members — ' + (S.p.method === "wsm" ? 'IS 800 Section 11 (working stress)' : 'IS 800 (cl 7.1 buckling, Annex E LTB, cl 9.3 combined)') + ' · ' + d.steel.filter(function (r) { return !r.ok; }).length + ' fail of ' + d.steel.length + '</h4>' +
      tbl(["Member", "Section", "Ratio", "Governing", ""], sortFail(d.steel).sort(function (a, b) { return b.ratio - a.ratio; }).slice(0, LIM).map(function (r) { return [lk("f", r.k, "F" + (r.k + 1)), r.name, f(r.ratio, 3), esc(r.cb || "-"), okc(r.ok)]; })) + more(d.steel.length, LIM);
    [["slabs", "Slabs — Wood–Armer moments, IS 456 cl 24 / Annex D", "s"], ["walls", "Walls — membrane stresses & Wood–Armer moments", "s"]].forEach(function (g) {
      var a = d[g[0]]; if (!a.length) return;
      var worst = a.slice().sort(function (x, y) { return Math.max(y.Abx, y.Aby, y.Atx, y.Aty) - Math.max(x.Abx, x.Aby, x.Atx, x.Aty); });
      var mx = function (k) { return a.reduce(function (s, r) { return Math.max(s, Math.abs(r[k])); }, 0); };
      h += '<h4>' + g[1] + ' · ' + a.filter(function (r) { return !r.ok; }).length + ' fail of ' + a.length + ' elements</h4><div class="sum"><div><span>Max sagging (x / y)</span><b>' + f(mx("bx")) + ' / ' + f(mx("by")) + ' kNm/m</b></div><div><span>Max hogging (x / y)</span><b>' + f(mx("tx")) + ' / ' + f(mx("ty")) + ' kNm/m</b></div>' +
        '<div><span>Max Ast bottom (x / y)</span><b>' + f(mx("Abx"), 0) + ' / ' + f(mx("Aby"), 0) + ' mm²/m</b></div><div><span>Max Ast top (x / y)</span><b>' + f(mx("Atx"), 0) + ' / ' + f(mx("Aty"), 0) + ' mm²/m</b></div></div>' +
        tbl(["Element", "t mm", "Ast bot x/y", "Ast top x/y", "Provide", ""], worst.slice(0, 12).map(function (r) { return [lk("s", r.k, "S" + (r.k + 1)), f(r.t, 0), f(r.Abx, 0) + " / " + f(r.Aby, 0), f(r.Atx, 0) + " / " + f(r.Aty, 0), barTxt(Math.max(r.Abx, r.Aby, r.Atx, r.Aty), r.t), okc(r.ok)]; })) + more(a.length, 12, "most heavily reinforced");
    });
    return h;
  }
  function basisBlock() {
    var d = S.des, has = function (g) { g = g.replace(/RCC beams/, "beams"); return /Loads|Serviceability/.test(g) || (/beams/.test(g) && d.beams.length) || (/columns/.test(g) && d.cols.length) || (/Slabs/.test(g) && (d.slabs.length || d.walls.length)) || (/steel/.test(g) && d.steel.length); };
    var W = S.p.method === "wsm";
    var h = '<h4>Design basis — ' + (W ? 'working stress method' : 'limit state method') + ': equations and IS code limits used</h4>' + CALC.basisHtml(esc, has, W);
    h += '<h4>Worked calculations — most critical member of each type</h4>';
    CALC.critical(d).forEach(function (c) {
      var r = c[1], nm = c[0] === "slab" || c[0] === "wall" ? cap(c[0]) + " element S" + (r.k + 1) : cap(c[0]) + " F" + (r.k + 1) + " (" + r.name + ")";
      h += '<details class="calc" open><summary>' + esc(nm) + ' — ' + (r.ok ? '<span class="okt">OK</span>' : '<span class="not">FAIL</span>') + '</summary>' + CALC.html(CALC.stepsFor(c[0], r, S.m, S.p), esc) + '</details>';
    });
    h += '<div class="btns noprint"><button type="button" id="bAllCalc">Show worked calculations for all members (for printing)</button></div><div id="allCalc"></div>';
    return h;
  }
  function allCalcs() {
    var d = S.des, h = '<h4>Worked calculations — all members</h4>';
    [["beam", d.beams], ["column", d.cols], ["steel", d.steel], ["slab", d.slabs], ["wall", d.walls]].forEach(function (g) {
      g[1].forEach(function (r) {
        var nm = g[0] === "slab" || g[0] === "wall" ? cap(g[0]) + " S" + (r.k + 1) : cap(g[0]) + " F" + (r.k + 1) + " (" + r.name + ")";
        h += '<details class="calc"' + (r.ok ? '' : ' open') + '><summary>' + esc(nm) + ' — ' + (r.ok ? '<span class="okt">OK</span>' : '<span class="not">FAIL</span>') + '</summary>' + CALC.html(CALC.stepsFor(g[0], r, S.m, S.p), esc) + '</details>';
      });
    });
    $("allCalc").innerHTML = h;
    document.querySelectorAll("#allCalc details").forEach(function (x) { x.open = true; });
  }
  function more(n, lim, w) { return n > lim ? '<div class="note">Showing ' + lim + ' ' + (w || "(failures first)") + ' of ' + n + ' — tap a member in the 3D view for any other.</div>' : ''; }
  function poReport() {
    var p = S.po, W = 340, H = 220, c = p.curve, dm = 0, vm = 0;
    c.forEach(function (q) { dm = Math.max(dm, q[0]); vm = Math.max(vm, q[1]); });
    var sx = (W - 60) / (dm * 1000 || 1), sy = (H - 50) / (vm || 1);
    var pts = c.map(function (q) { return (45 + q[0] * 1000 * sx).toFixed(1) + "," + (H - 30 - q[1] * sy).toFixed(1); });
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:560px"><rect width="100%" height="100%" fill="#fff"/><line x1="45" y1="' + (H - 30) + '" x2="' + (W - 10) + '" y2="' + (H - 30) + '" stroke="#333"/><line x1="45" y1="10" x2="45" y2="' + (H - 30) + '" stroke="#333"/>' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#e07a1f" stroke-width="2.2"/>' + c.slice(1).map(function (q) { return '<circle cx="' + (45 + q[0] * 1000 * sx).toFixed(1) + '" cy="' + (H - 30 - q[1] * sy).toFixed(1) + '" r="2" fill="#1d3557"/>'; }).join("") +
      '<text x="' + (W / 2) + '" y="' + (H - 6) + '" font-size="11" text-anchor="middle">Roof displacement (mm) — max ' + f(dm * 1000, 1) + '</text><text x="12" y="' + (H / 2) + '" font-size="11" transform="rotate(-90 12 ' + (H / 2) + ')" text-anchor="middle">Base shear (kN)</text>' +
      '<text x="48" y="20" font-size="10">' + f(vm, 0) + '</text><text x="' + (W - 12) + '" y="' + (H - 34) + '" font-size="10" text-anchor="end">' + f(dm * 1000, 0) + '</text>';
    var Vd = S.L && S.L.eq ? S.L.eq[p.dir ? "EQY" : "EQX"] : null;
    if (Vd && Vd.Vb < vm * 1.5) svg += '<line x1="45" x2="' + (W - 10) + '" y1="' + (H - 30 - Vd.Vb * sy) + '" y2="' + (H - 30 - Vd.Vb * sy) + '" stroke="#c62828" stroke-dasharray="4 3"/><text x="' + (W - 12) + '" y="' + (H - 33 - Vd.Vb * sy) + '" font-size="10" fill="#c62828" text-anchor="end">design Vb</text>';
    svg += '</svg>';
    var cnt = {}; p.hinges.forEach(function (h) { cnt[h.state] = (cnt[h.state] || 0) + 1; });
    var h = '<div class="rep"><div class="rh"><div><h3>Pushover (nonlinear static) — +' + (p.dir ? "Y" : "X") + '</h3><small>Event-to-event plastic hinges, P–M interaction' + (S.p.ppd ? ', P-Delta' : '') + ' · control node ' + (p.ctrl + 1) + ' · ' + esc(p.stop) + '</small></div></div>' + svg;
    h += '<div class="sum"><div><span>Peak base shear</span><b>' + f(p.Vmax, 1) + ' kN</b></div><div><span>First hinge (yield) at</span><b>' + (p.Vy ? f(p.Vy, 1) + ' kN, ' + f(p.dy * 1000, 1) + ' mm' : '-') + '</b></div>' +
      '<div><span>Final roof displacement / drift</span><b>' + f(p.du * 1000, 1) + ' mm / ' + f(100 * p.du / p.H, 2) + ' %</b></div><div><span>Displacement ductility du/dy</span><b>' + f(p.mu, 2) + '</b></div>' +
      (Vd ? '<div><span>Overstrength Vmax / Vb(design)</span><b>' + f(p.Vmax / Vd.Vb, 2) + '</b></div>' : '') + '<div><span>Hinges formed</span><b>' + p.hinges.length + ' (' + Object.keys(cnt).map(function (k) { return cnt[k] + " " + k; }).join(", ") + ')</b></div></div>';
    if (p.warn.length) h += '<div class="note">' + p.warn.slice(0, 6).map(esc).join("<br>") + '</div>';
    h += '<h4>Hinge formation sequence</h4>' + tbl(["#", "Member", "End", "Type", "V (kN)", "Roof d (mm)", "θp (rad)", "State"], p.events.slice(0, 60).map(function (e) { var fr = S.m.frames[e.k]; return [e.ev, lk("f", e.k, "F" + (e.k + 1) + " " + fr.type), e.end, e.axis === "a" ? "Axial" : "M" + e.axis, f(e.V, 1), f(e.d * 1000, 1), e.axis === "a" ? "-" : f(e.rot, 4), e.state]; }));
    h += '<div class="note">Acceptance (indicative, ASCE 41 / FEMA 356 style): RCC beams IO/LS/CP = 0.010/0.020/0.025 rad, RCC columns 0.005/0.015/0.020 rad, steel θy/6θy/8θy. Hinges are elastic–perfectly plastic; strength degradation after CP is not modelled. Use the curve with IS 1893 / ATC-40 capacity-spectrum or FEMA 440 displacement-coefficient method to find the performance point.</div></div>';
    return h;
  }
  function exportXlsx() {
    var btn = this; btn.disabled = true; var old = btn.textContent; btn.textContent = "Building workbook…";
    setTimeout(function () {
      try {
        var wb = RX.build(S), nm = (S.po && !S.res ? "pushover" : "analysis-design") + "-" + new Date().toISOString().slice(0, 10) + ".xlsx";
        RX.save(wb, nm, function (ok, e) { btn.disabled = false; btn.textContent = old; toast(ok ? "Excel workbook ready: " + nm : "Excel export not available here" + (e ? " (" + (e.message || e) + ")" : "")); });
      } catch (e) { btn.disabled = false; btn.textContent = old; err(e); }
    }, 30);
  }
  function csv() {
    var r = S.res, m = S.m, rows = ["Combination,Member,Type,Section,End,N (kN),Vy (kN),Vz (kN),T (kNm),My (kNm),Mz (kNm)"];
    r.combos.forEach(function (cb) { m.frames.forEach(function (e, k) { var d = FE.frameDiagram(cb.fr[k], 1); ["i", "j"].forEach(function (end, t) { var q = d[t]; rows.push([cb.name, k + 1, e.type, e.sec.name, end, q.N, q.Vy, q.Vz, q.T, q.My, q.Mz].map(function (v) { return typeof v === "number" ? v.toFixed(3) : '"' + v + '"'; }).join(",")); }); }); });
    download("member-forces.csv", rows.join("\n"));
  }
  function openText(name, text) {
    try { load(); UV.src = "dxf"; UV.roles = {}; save(); S.dx = DXF.parse(text); S.dxName = name; var a = document.getElementById("app");
      if (!$("srcbox")) return; a.querySelector("[data-k=src]").value = "dxf"; $("srcbox").innerHTML = srcInner(); bindSrc(); $("p1").classList.add("open"); toast("DXF loaded: " + S.dx.ents.length + " entities"); } catch (e) { err(e); }
  }
  return { view: view, S: S, openText: openText };
})();
