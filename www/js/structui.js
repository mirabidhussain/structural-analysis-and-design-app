/* Structural analysis screen: model input (generator / DXF), properties, loads, linear static (+P-Delta), pushover,
   3D viewer with deformed shape, diagrams and contours, design tables. */
var SU = (function () {
  var S = { geo: null, m: null, res: null, des: null, po: null, dx: null, L: null, sel: null, view: { yaw: -0.6, pitch: 0.45, zoom: 1, px: 0, py: 0 } };
  var DEF = {
    src: "gen", bx: "4, 4, 4", by: "5, 5", hs: "3.5, 3.2, 3.2", slabs: true, walls: false, brace: false, mesh: 1,
    dmode: "3d", dunits: "auto", dmesh: 1, roles: {},
    method: "lsm", mat: "rcc", fck: 25, fy: 500, fys: 250, colSec: "400x400", beamSec: "300x450", braceSec: "ISA 75x75x6", tSlab: 150, tWall: 200,
    crack: true, existing: false, pcCol: 2, pcBeam: 1, kcol: 1.2, base: "fixed", ksoil: 40000, fL: 2, fB: 2, supOver: "",
    ff: 1.5, ll: 3, ffRoof: 2.5, llRoof: 1.5, wall: 12, parapet: 3, bDL: 0, bLL: 0, bLLr: 0,
    eq: true, zone: "V", I: 1.2, R: 5, soil: "II", sys: "rc", wind: false, vbp: "Srinagar", terrain: 2, cf: 1.3, trib: 4, wmeth: "cpe", k1: 1, wperm: "normal", wtor: true,
    pdir: 0, ppat: "parabolic", pdrift: 4, ppd: true, pev: 80, secOver: "", loadOver: "",
    accTor: true, rsa: true, mmc: true, nModes: 12, rsComb: "cqc", ortho: false, rsScaleDisp: false, sbc: 200, Df: 1.5,
    snow: false, s0: 1.5, mu: 0.8, snowW: 0, pattern: "auto", llRed: false, exposure: "moderate", fire: "1",
    found: "isolated", matT: 0, matOff: 0.5, ks: 0, gs: 18, setLim: 75, angLim: 500, matMesh: 0.5,
    estFmt: "detailed", mT: 230, mOpen: 15, plinthH: 0.45, parH: 1.0, wastage: 3, cont: 3, cess: 1, gst: 0, sorOn: true
  };
  /* defaults that depend on the frame material */
  var MATDEF = { rcc: { colSec: "400x400", beamSec: "300x450", sys: "rc" }, steel: { colSec: "ISMB 300", beamSec: "ISMB 250", sys: "steel" } };
  var UV = {};     /* values the user actually entered; anything missing falls back to its default */
  var P = {};
  function dflt(k) { var md = MATDEF[UV.mat === "steel" ? "steel" : "rcc"]; return md[k] !== undefined ? md[k] : DEF[k]; }
  function given(k) { var v = UV[k]; return v !== undefined && v !== null && v !== "" && !(typeof v === "number" && isNaN(v)); }
  function eff() { var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = given(k) ? UV[k] : dflt(k); }); o.roles = UV.roles || (UV.roles = {}); return o; }
  function load() {
    if (typeof PDB !== "undefined") { var pr = PDB.current(); UV = JSON.parse(JSON.stringify(pr.inputs || {})); if (S.pid !== pr.id) { resetFor(pr); } }
    else { try { UV = JSON.parse(localStorage.getItem("isd_model2") || "{}") || {}; } catch (e) { UV = {}; } }
    P = eff();
  }
  function save() { P = eff(); if (typeof PDB !== "undefined") PDB.setInputs(UV); else try { localStorage.setItem("isd_model2", JSON.stringify(UV)); } catch (e) {} }
  /* switching project: forget the previous model and results, restore the project's DXF */
  function resetFor(pr) {
    S.pid = pr.id; S.geo = S.m = S.res = S.des = S.po = S.det = S.se = S.boq = S.autoRes = null; S.dx = null; S.dxName = null; S.sel = null; S.state = null;
    if (pr.dxf && pr.dxf.text) { try { S.dx = DXF.parse(pr.dxf.text); S.dxName = pr.dxf.name; } catch (e) { S.dx = null; } }
  }
  function set(k, v) { UV[k] = v; save(); }
  function dtxt(k) { var d = dflt(k); return typeof d === "boolean" ? (d ? "on" : "off") : String(d); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f(x, d) { return x === null || x === undefined || isNaN(x) ? "-" : (+x).toFixed(d === undefined ? 2 : d); }
  function $(id) { return document.getElementById(id); }
  function toast(t) { var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }

  /* ---------- form helpers ---------- */
  /* blank input = default (shown as greyed placeholder) */
  function num(k, label, unit, help) { var sh = given(k) ? UN.show(UV[k], unit) : ""; return '<label class="fld"><span>' + label + '</span><span class="inw"><input data-k="' + k + '" data-u="' + esc(unit || "") + '" data-shown="' + esc(sh) + '" type="number" step="any" inputmode="decimal" placeholder="' + esc(UN.show(dflt(k), unit)) + '" value="' + esc(sh) + '">' + (unit ? '<em class="u">' + esc(UN.label(unit)) + '</em>' : '') + '</span>' + (help ? '<small>' + help + '</small>' : '') + '</label>'; }
  function txt(k, label, help) { return '<label class="fld"><span>' + label + '</span><input data-k="' + k + '" placeholder="' + esc(dflt(k)) + '" value="' + (given(k) ? esc(UV[k]) : "") + '"><small>' + (help ? help + ' · ' : '') + 'default ' + esc(dtxt(k)) + '</small></label>'; }
  function area(k, label, help, ph) { return '<label class="fld full"><span>' + label + '</span><textarea data-k="' + k + '" rows="3" placeholder="' + esc(ph) + '">' + (given(k) ? esc(UV[k]) : "") + '</textarea><small>' + help + '</small></label>'; }
  function sel(k, label, opts) { return '<label class="fld"><span>' + label + '</span><select data-k="' + k + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(P[k]) === String(o[0]) ? " selected" : "") + '>' + esc(o[1]) + (String(dflt(k)) === String(o[0]) ? " (default)" : "") + '</option>'; }).join("") + '</select></label>'; }
  function chk(k, label) { return '<label class="fld ck"><span><input data-k="' + k + '" type="checkbox"' + (P[k] ? " checked" : "") + '> ' + label + '</span></label>'; }
  var BAD = [];
  var LBL = { sbc: "SBC", fck: "fck", fy: "fy", fys: "steel fy", colSec: "columns", beamSec: "beams", braceSec: "braces", tSlab: "slab t", tWall: "wall t", ff: "floor finish", ll: "LL", ffRoof: "roof finish", llRoof: "roof LL", wall: "wall load", parapet: "parapet", zone: "zone", I: "I", R: "R", soil: "soil", sys: "period formula", method: "design method", vbp: "wind speed", terrain: "terrain", cf: "Cf", kcol: "k (col)", base: "base", ksoil: "ks", fL: "footing L", fB: "footing B" };
  function grab(root) {
    BAD = [];
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k"), v = el.value;
      if (el.type === "checkbox") { if (el.checked === dflt(k) && !given(k)) return; UV[k] = el.checked; return; }
      if (el.tagName === "SELECT") { if (String(v) === String(dflt(k)) && !given(k)) return; UV[k] = isNaN(+v) || v === "" ? v : +v; return; }
      v = String(v).trim();
      if (v === "") { delete UV[k]; return; }
      if (el.type === "number") { if (el.getAttribute("data-shown") === v && given(k)) return; var n = parseFloat(v); if (!isFinite(n) || n < 0) { delete UV[k]; BAD.push(k); el.value = ""; } else UV[k] = UN.toSI(n, el.getAttribute("data-u") || ""); }
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
    p.rsa = !!(P.rsa && P.eq); p.nModes = Math.max(1, Math.round(P.nModes > 0 ? P.nModes : 12)); p.accTor = !!(P.accTor && P.eq);
    return p;
  }

  /* ---------- page ---------- */
  function view(app, title, back) {
    load();
    title.textContent = "Frame & FE Analysis"; back.hidden = false;
    var pr = typeof PDB !== "undefined" ? PDB.current() : null;
    var h = (pr ? '<div class="projbar"><a href="#projects">▤ ' + esc(pr.name) + '</a><span class="stchip st' + ["Concept", "Design", "For check", "Checked", "Issued", "On hold"].indexOf(pr.status) + '">' + esc(pr.status) + '</span></div>' : '') + '<div class="code-note">Stiffness matrix (displacement) method for frames · 4-node flat-shell FEA for slabs, plates & walls · Linear static, P-Delta and pushover · DXF input</div>';
    h += '<div class="ftop fu"><span>Input units</span><span class="seg useg">' + ["si", "mks", "fps"].map(function (u) { return '<button type="button" data-u="' + u + '"' + (u === UN.sys() ? ' class="on"' : '') + '>' + UN.SYS[u].short + '</button>'; }).join("") + '</span></div>' + (UN.active() ? '<div class="note">' + esc(UN.note()) + ' Grid spacings, storey heights and section sizes stay in m and mm.</div>' : '');
    h += panel("p1", "1 · Geometry", srcForm(), true);
    h += panel("p2", "2 · Materials & sections", propForm());
    h += panel("p3", "3 · Loads (IS 875, IS 1893)", loadForm());
    h += panel("p5", "5 · Estimate & BOQ (JKSOR 2022)", boqForm());
    h += panel("p4", "4 · Analyse", anaForm(), true);
    h += '<div id="mstat"></div><div id="viewer"></div><div id="results"></div>';
    app.innerHTML = h;
    app.querySelectorAll(".fu .useg button").forEach(function (bt) { bt.onclick = function () { var u = bt.getAttribute("data-u"); if (u === UN.sys()) return; grab(app); save(); UN.set(u); view(app, title, back); }; });
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
    $("bAuto").onclick = runAuto;
    if (S.m) { status(); drawViewer(); if (S.res || S.po) renderResults(); }
    else { try { if (P.src === "dxf" && S.dx) buildDxf(); else if (P.src !== "dxf") buildGen(true); } catch (e) {} }
  }
  var PIC = { p1: "geometry", p2: "material", p3: "loads", p4: "analyse", p5: "estimate" };
  function panel(id, t, body, open) {
    var m0 = /^(\d+)\s*·\s*(.*)$/.exec(t), num0 = m0 ? m0[1] : "", tt = m0 ? m0[2] : t;
    return '<section class="pnl' + (open ? " open" : "") + '" id="' + id + '"><h3><span class="pnum">' + (typeof IC !== "undefined" ? IC.svg(PIC[id] || "frame") : num0) + '</span><span class="pt">' + (num0 ? '<small>Step ' + num0 + '</small>' : '') + tt + '</span></h3><div class="pb">' + body + '</div></section>';
  }
  function srcForm() { return '<div class="form">' + sel("src", "Model source", [["gen", "Parametric frame generator"], ["dxf", "Import DXF drawing"]]) + '<div id="srcbox" class="full">' + srcInner() + '</div></div>'; }
  function srcInner() {
    if (P.src === "gen") return '<div class="form inner">' + txt("bx", "Bay widths along X (m)", "comma separated") + txt("by", "Bay widths along Y (m)", "leave blank for a 2D plane frame") +
      txt("hs", "Storey heights, bottom up (m)") + num("mesh", "Shell mesh size", "m") + chk("slabs", "Slabs as shell elements") + chk("walls", "Shear walls in end bays (Y)") + chk("brace", "X-bracing in end bays") +
      '<div class="btns"><button class="pri" id="bGen" type="button">Generate model</button></div></div>';
    var lay = S.dx ? Object.keys(S.dx.layers).sort() : [];
    var roles = [["auto", "Auto (by direction)"], ["column", "Column"], ["beam", "Beam / rafter"], ["brace", "Brace (pinned)"], ["slab", "Slab / plate"], ["wall", "Wall (shell)"], ["fixed", "Fixed support"], ["pin", "Pinned support"], ["roller", "Roller support"], ["ignore", "Ignore"]];
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
      rd.onload = function () { try { S.dx = DXF.parse(String(rd.result)); S.dxName = fl.name; UV.roles = {}; save(); if (typeof PDB !== "undefined") PDB.setDxf(fl.name, String(rd.result)); $("srcbox").innerHTML = srcInner(); bindSrc(); toast(S.dx.ents.length + " entities on " + Object.keys(S.dx.layers).length + " layers"); } catch (e) { err(e); } };
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
      num("tSlab", "Slab thickness", "mm") + num("tWall", "Wall thickness", "mm") +
      sel("exposure", "Exposure condition (IS 456 Table 3)", [["mild", "Mild — cover 20, ≥ M20"], ["moderate", "Moderate — cover 30, ≥ M25"], ["severe", "Severe — cover 45, ≥ M30"], ["very severe", "Very severe — cover 50, ≥ M35"], ["extreme", "Extreme — cover 75, ≥ M40"]]) +
      sel("fire", "Fire resistance (IS 456 Table 16A)", [["0.5", "0.5 h"], ["1", "1 h"], ["1.5", "1.5 h"], ["2", "2 h"], ["3", "3 h"], ["4", "4 h"]]) + chk("crack", "Cracked stiffness (IS 1893 cl 6.4.3.1: beams 0.35, columns 0.70)") + chk("existing", "Checking an existing structure — allow member sizes and grades outside the code limits") +
      num("pcCol", "Column steel for hinges / P-M", "%") + num("pcBeam", "Beam steel (both faces) for hinges", "%") + num("kcol", "Column effective length factor", "", "IS 456 Table 28 / Annex E (1.2 for sway frames)") +
      sel("base", "Base condition", [["fixed", "Fixed"], ["pinned", "Pinned (hinged)"], ["spring", "Spring — footing on soil (IS 2950)"]]) +
      num("ksoil", "Modulus of subgrade reaction ks (spring base)", "kN/m³", "IS 2950 Pt 1 / plate load test: loose sand ≈ 15 000, medium ≈ 40 000, dense ≈ 100 000; soft clay ≈ 12 000, stiff ≈ 25 000") +
      num("fL", "Footing size along X (spring base)", "m") + num("fB", "Footing size along Y (spring base)", "m") +
      area("supOver", "Support rules (optional)", "One rule per line: <i>nodes = fixed / pinned / roller / spring / guided / free</i>, e.g. <i>N12 = pinned</i>, <i>3-5 = roller</i>, <i>N9 = free</i> (removes a support). Tap a node in the 3D view to set it directly. Later lines win.", "N1 = pinned\nN4 = roller") +
      area("secOver", "Member section overrides (optional)", "One rule per line: <i>which = section</i>. Which: member numbers (12, 1-12, F20), <i>columns / beams / braces / all</i>, optionally with <i>storey 1</i>, <i>storey 2-4</i>, <i>level 3.5</i> (m) or <i>layer NAME</i>. Later lines win. Tap a member in the 3D view to assign it directly.", "columns storey 1-2 = 450x450\nbeams storey 3 = 300x400\n15, 18-20 = ISMB 350") +
      '<div class="btns full"><button type="button" class="rstd" data-p="p2">Clear my entries (use defaults)</button></div><div class="note full">Priority: override rules › section written in the DXF layer name › the default sections above. Sections are standard-table values (SP 6).</div></div>';
  }
  function matDefaults(app) {
    save(); $("p3").querySelector(".pb").innerHTML = loadForm(); $("p2").querySelector(".pb").innerHTML = propForm();
  }
  function loadForm() {
    return '<div class="form">' + num("ff", "Floor finish + partitions", "kN/m²") + num("ll", "Imposed load (floors)", "kN/m²", "IS 875 Pt 2: office 2.5–4, residence 2") +
      num("ffRoof", "Roof finish / waterproofing", "kN/m²") + num("llRoof", "Roof imposed load", "kN/m²") +
      chk("snow", "Snow load — IS 875 (Part 4) on the roof (larger of snow and roof imposed load)") + num("s0", "Ground snow load s0", "kN/m²", "Kashmir valley ≈ 1.5–2.5; higher reaches more — confirm locally") + num("mu", "Shape coefficient μ", "", "0.8 for flat / ≤ 30° roofs (IS 875 Pt 4)") +
      num("snowW", "Snow included in seismic weight", "%", "roof imposed load is otherwise excluded; see IS 1893 cl 7.3 for heavy-snow regions") +
      sel("pattern", "Pattern imposed load (IS 456 cl 22.4.1)", [["auto", "Auto — alternate bays when LL > ¾ DL"], ["on", "Always"], ["off", "Off"]]) +
      chk("llRed", "Reduce imposed load on footings for the floors carried (IS 875 Pt 2 cl 3.2.1)") + num("wall", "Wall load on floor beams", "kN/m", "230 mm brick × 3 m ≈ 13") +
      num("parapet", "Parapet load on roof beams", "kN/m") + num("bDL", "Extra DL on all beams", "kN/m", "use for 2D frames / no slabs") + num("bLL", "Extra LL on floor beams", "kN/m") + num("bLLr", "Extra LL on roof beams", "kN/m") +
      area("loadOver", "Extra member loads (optional)", "One rule per line: <i>which = DL x, LL y</i> in kN/m acting downward, added to the loads above. Same 'which' syntax as section overrides.", "beams storey 1 = DL 6, LL 2\n21-24 = DL 10") +
      chk("eq", "Seismic — IS 1893 (Part 1):2016 equivalent static") + sel("zone", "Seismic zone", [["II", "II (0.10)"], ["III", "III (0.16)"], ["IV", "IV (0.24)"], ["V", "V (0.36) — Kashmir valley"]]) +
      sel("I", "Importance factor I", [[1, "1.0 ordinary"], [1.2, "1.2 important / offices >200"], [1.5, "1.5 critical"]]) + sel("R", "Response reduction R", [[3, "3 OMRF"], [4, "4 braced steel"], [5, "5 SMRF / ductile"], [4.5, "4.5 dual (walls)"]]) +
      sel("soil", "Soil type", [["I", "I rock/hard"], ["II", "II medium"], ["III", "III soft"]]) + sel("sys", "Period formula", [["rc", "RC MRF 0.075h^0.75"], ["steel", "Steel MRF 0.085h^0.75"], ["other", "With infill/walls 0.09h/√d"]]) +
      chk("accTor", "Accidental torsion, design eccentricity 1.5esi ± 0.05bi (cl 7.8.2, 3D models)") +
      chk("rsa", "Modal & response spectrum analysis (cl 7.7)") + num("nModes", "Number of modes", "", "cl 7.7.5.2: enough for ≥ 90 % mass participation") + chk("mmc", "Missing-mass correction (cl 7.7.5.2): modes above 33 Hz and the mass not in the modes act statically at the zero-period acceleration") +
      sel("rsComb", "Modal combination", [["cqc", "CQC, 5 % damping (cl 7.7.5.4)"], ["srss", "SRSS"]]) + chk("ortho", "Orthogonal effects 100 % + 30 % (cl 6.3.4.2)") +
      chk("rsScaleDisp", "Also scale spectrum displacements to the static base shear (off = IS 1893 Amendment 2, cl 7.7.3.2)") +
      chk("wind", "Wind — IS 875 (Part 3):2015") + sel("vbp", "Basic wind speed", Object.keys(D.vb).filter(function (k) { return k !== "Custom"; }).map(function (k) { return [k, k + " — " + D.vb[k] + " m/s"]; })) +
      sel("terrain", "Terrain category", [[1, "1 open sea/flat"], [2, "2 open terrain"], [3, "3 suburban"], [4, "4 city centre"]]) + sel("wmeth", "Wind force on the building", [["cpe", "Wall pressure coefficients Cpe (IS 875-3 Table 5)"], ["cf", "Force coefficient Cf (entered)"]]) + num("cf", "Net force coefficient Cf (Cf method and 2D frames)") +
      num("k1", "Risk coefficient k1", "", "IS 875-3 Table 1: 1.0 general buildings (50 years); 1.08 important / cyclone shelters (100 years)") + sel("wperm", "Openings in the walls (Cpi, cl 7.3.2)", [["normal", "Up to 5 % — Cpi ±0.2"], ["medium", "5–20 % — Cpi ±0.5"], ["large", "Over 20 % — Cpi ±0.7"]]) +
      chk("wtor", "Wind torsion check (75 % wind at ±15 % eccentricity — ASCE 7 Case 2; IS 875-3 has no torsion clause)") + num("trib", "Frame spacing (2D only)", "m") +
      num("sbc", "Safe bearing capacity (footings)", "kN/m²", "net allowable; +50/25/0 % with seismic for soil I/II/III (IS 1893 Table 1)") + num("Df", "Founding depth", "m") +
      sel("found", "Foundation type", [["isolated", "Isolated footings"], ["auto", "Auto — mat when footings overlap or cover > 50 % of the plan"], ["mat", "Mat (raft) foundation"]]) +
      num("matT", "Mat thickness", "mm", "0 = smallest that passes punching, shear and flexure (steps of 50 mm)") + num("matOff", "Mat projection beyond the outer column faces", "m") +
      num("ks", "Modulus of subgrade reaction ks", "kN/m³", "from the soil report / plate load test (IS 2950 Appendix B); 0 = 120 × SBC (Bowles)") + num("gs", "Unit weight of soil", "kN/m³") +
      num("setLim", "Permissible settlement", "mm", "IS 1904: raft on sand 75, on clay 100") + num("angLim", "Permissible angular distortion 1 /", "", "500 for RC frames (IS 1904)") + num("matMesh", "Mat mesh size", "m") +
      '<div class="btns full"><button type="button" class="rstd" data-p="p3">Clear my entries (use defaults)</button></div><div class="note full">Combinations (IS 456 Table 18 / IS 875 Pt 5): 1.5(DL+LL), 1.2(DL+LL±EL), 1.5(DL±EL), 0.9DL±1.5EL. Seismic weight = DL + 25% LL (50% if LL>3 kN/m²), roof LL excluded. Lateral loads to nodes ∝ W·h² (cl 7.6.3).</div></div>';
  }
  function boqForm() {
    return '<div class="form">' + sel("estFmt", "Estimate format", [["boq", "Bill of quantities (items with measurement notes)"], ["detailed", "Detailed estimate (measurement sheet + abstract of cost)"]]) + chk("sorOn", "Use JKSOR 2022 rates (Jammu & Kashmir Schedule of Rates) — your own rates in the BOQ override them") +
      num("mT", "Masonry wall thickness", "mm", "230 = one brick") + num("mOpen", "Openings in masonry walls", "%", "doors & windows deducted from masonry and plaster") +
      num("plinthH", "Plinth height above ground", "m", "earth filling and plinth masonry") + num("parH", "Parapet height", "m") +
      num("wastage", "Reinforcement wastage / rolling margin", "%") + num("cont", "Contingencies", "%") + num("cess", "Labour welfare cess", "%") + num("gst", "GST on works contract", "%", "Keep 0 with JKSOR 2022 — its rates already include GST. Enter a % only if your own rates exclude GST.") +
      '<div class="note full">Masonry is measured under every beam line when the wall load is above zero (ground-storey walls on the plinth, on the first-floor layout); perimeter lines are external walls. Re-run the analysis, or tap "Recalculate BOQ" in the results, after changing these.</div></div>';
  }
  function anaForm() {
    return '<div class="form">' + '<div class="btns full"><button class="pri" id="bAna" type="button">Linear static</button><button id="bPD" type="button">Linear + P-Delta</button></div>' +
      '<div class="btns full"><button id="bAuto" type="button">Automatic design & detailing</button></div><div class="note full">Automatic design runs analysis → design → detailing repeatedly and enlarges the columns and beams of the storeys that fail (design, steel > 4 %, strong column–weak beam, joint shear, drift) by 50 mm until every check passes; the sizes become editable section rules.</div>' +
      sel("pdir", "Pushover direction", [[0, "+X"], [1, "+Y"]]) + sel("ppat", "Lateral pattern", [["parabolic", "IS 1893 (W·h²)"], ["uniform", "Uniform (mass)"]]) +
      num("pdrift", "Target roof drift", "% of height") + num("pev", "Max hinge events") + chk("ppd", "Include P-Delta (geometric non-linearity)") +
      '<div class="btns full"><button class="pri" id="bPO" type="button">Run pushover (non-linear static)</button></div>' +
      '<div class="note full">Pushover: gravity (DL + 25% LL) first, then the lateral pattern is increased event-by-event. Plastic hinges form at member ends when M reaches Mp(P) from the P–M interaction (RCC: strain compatibility, IS 456 cl 38/39; steel: IS 800 cl 9.3.1), braces yield/buckle; P-Delta updates the geometric stiffness at every event.</div></div>';
  }

  /* ---------- model building ---------- */
  function err(e) { console.error(e); $("mstat").innerHTML = '<div class="err">' + esc(e.message || e).replace(/\n/g, "<br>") + '</div>'; }
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
    var ext = name.split(".").pop().toLowerCase(), blob = new Blob([text], { type: { csv: "text/csv", html: "text/html", json: "application/json", isdp: "application/json", std: "text/plain", txt: "text/plain" }[ext] || "application/dxf" });
    if (window.claude && window.claude.use && window.self !== window.top) { Promise.resolve(window.claude.use("downloads")).then(function (dl) { if (!dl) throw 0; return dl.save({ filename: name, data: blob }); }).then(function () { toast("Saved " + name); }, function () { toast("Download not available here"); }); return; }
    try { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast("Saved " + name); }
    catch (e) { toast("Download not available here"); }
  }

  /* ---------- analysis ---------- */
  var busyT0 = 0, busyTimer = null;
  function busy(t, cancel) {
    if (!busyT0) busyT0 = Date.now();
    $("results").innerHTML = '<div class="rep"><div class="busy prog"><i></i><span class="bt">' + t + '</span><em class="bclock">' + ((Date.now() - busyT0) / 1000).toFixed(1) + ' s</em>' + (cancel ? '<button type="button" id="bCancel">Cancel</button>' : '') + '</div>' + (cancel ? '<small class="bhw">' + esc(HW.summary()) + '</small>' : '') + '</div>';
    if (cancel && $("bCancel")) $("bCancel").onclick = function () { cancel(); };
    clearInterval(busyTimer); busyTimer = setInterval(function () { var c = document.querySelector(".bclock"); if (!c) { clearInterval(busyTimer); return; } c.textContent = ((Date.now() - busyT0) / 1000).toFixed(1) + " s"; }, 200);
  }
  function busyDone() { busyT0 = 0; clearInterval(busyTimer); }
  /* results computed in a background worker → attach to the model on this thread */
  function adopt(r, p) {
    Object.keys(r).forEach(function (k) { S[k] = r[k]; });
    S.m = MD.make(S.geo, p); FE.prepare(S.m);
    if (S.det && !S.det.err) S.det.g = DT.grid(S.m);
  }
  var NW = { off: false };
  function inWorker() { return typeof PAR !== "undefined" && !NW.off && (PAR.ok() || !PAR.tried); }
  function codeBlock(p) {
    var li = LIM.frame(p), hd = li.filter(function (x) { return x.hard; });
    S.limits = li;
    if (hd.length && !p.existing) { err("Inputs against the IS code — correct them in Properties (or switch on \u201cChecking an existing structure\u201d):\n" + hd.map(function (x) { return "• " + x.msg + " (" + x.ref + ")"; }).join("\n")); return true; }
    return false;
  }
  var afterRun = null;
  function runLinear(pd) {
    grab(document.getElementById("app"));
    try { if (P.src === "gen" && !S.geo) buildGen(true); } catch (e) { return err(e); }
    if (!S.m) return err("Build a model first");
    var p = params(); if (codeBlock(p)) return; S.p = p; MD._pm = {};
    S.m = MD.make(S.geo, p); busyT0 = 0;
    S.autoRes = null;
    function finish() {
      busyDone();
      if (!$("results")) return;
      if (typeof PDB !== "undefined") PDB.setSummary(PIPE.summary(S));
      S.state = S.cb[0].name; S.disp = "def"; S.sel = null;
      drawViewer(); renderResults(); status();
      if (afterRun) { var a = afterRun; afterRun = null; location.hash = "#" + a; return; }
      $("viewer").scrollIntoView({ behavior: "smooth" });
    }
    if (inWorker()) {
      var job = PAR.job("pipe", { geo: S.geo, p: p, pd: pd, proj: typeof PDB !== "undefined" ? PDB.current() : null }, function (x) { busy(x.prog + " (" + (x.i + 1) + "/" + x.n + ", background)", function () { PAR.cancelAll(); }); });
      busy("Starting the analysis in the background…", function () { PAR.cancelAll(); });
      PAR.tried = true;
      job.then(function (r) { adopt(r, p); finish(); }, function (e) {
        if (/cancelled/.test(e.message)) { busyDone(); $("results").innerHTML = '<div class="note">Analysis cancelled.</div>'; return; }
        if (!PAR.ok()) { runLinearSync(p, pd, finish); return; }
        busyDone(); err(e); $("results").innerHTML = "";
      });
      return;
    }
    runLinearSync(p, pd, finish);
  }
  function runLinearSync(p, pd, finish) {
    busy("Assembling stiffness matrix and solving…");
    var t0 = Date.now(), steps = PIPE.steps(S, p, pd);
    steps[2][1] = (function (f0) { return function () { S.res.ms = Date.now() - t0; f0(); finish(); }; })(steps[2][1]);
    (function next(i) {
      if (i >= steps.length) return;
      busy(steps[i][0]);
      setTimeout(function () { try { steps[i][1](); next(i + 1); } catch (e) { busyDone(); err(e); $("results").innerHTML = ""; } }, 30);
    })(0);
  }
  function runAuto() {
    grab(document.getElementById("app"));
    try { if (P.src === "gen" && !S.geo) buildGen(true); } catch (e) { return err(e); }
    if (!S.m) return err("Build a model first");
    var p = params(); if (codeBlock(p)) return; MD._pm = {}; busyT0 = 0;
    var bg = inWorker(), stop = bg ? function () { PAR.cancelAll(); } : null;
    busy("Automatic design: iteration 1…", stop);
    var prom = bg ? (PAR.tried = true, PAR.job("auto", { geo: S.geo, p: p, proj: typeof PDB !== "undefined" ? PDB.current() : null }, function (x) { busy("Automatic design: iteration " + (x.i + 2) + " — " + x.nf + " storey group(s) enlarged after iteration " + (x.i + 1) + "…", stop); })) :
      AUTO.run(S.geo, p, { async: true, step: function (i, l) { busy("Automatic design: iteration " + (i + 2) + " — " + (Object.keys(l.fails.col).length + Object.keys(l.fails.beam).length) + " storey group(s) enlarged after iteration " + (i + 1) + "…"); } });
    prom.then(function (r) {
      busyDone();
      if (bg) { adopt(r.S, r.p); } else Object.keys(r.S).forEach(function (k) { if (k !== "geo") S[k] = r.S[k]; });
      S.p = r.p; S.autoRes = r; set("secOver", r.rules);
      var box = document.querySelector("#p2 .pb"); if (box) box.innerHTML = propForm();
      if (typeof PDB !== "undefined") { PDB.setSummary(PIPE.summary(S)); PDB.update(PDB.current().id, {}, "Automatic design: " + r.log.length + " iterations, " + (r.ok ? "all checks pass" : "failures left")); }
      S.state = S.cb[0].name; S.disp = "def"; S.sel = null;
      drawViewer(); renderResults(); status(); toast(r.ok ? "Automatic design: all checks pass" : "Automatic design finished with failures left");
    }, function (e) {
      busyDone();
      if (/cancelled/.test(e.message)) { $("results").innerHTML = '<div class="note">Automatic design cancelled.</div>'; return; }
      if (bg && !PAR.ok()) { NW.off = true; return runAuto(); }
      err(e); $("results").innerHTML = "";
    });
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
    var mm = /^Mode (\d+)/.exec(name);
    if (mm && S.se && S.se.md) { var mo = S.se.md.modes[+mm[1] - 1]; if (mo) { var fc = []; return { U: mo.U, fr: function (k) { return fc[k] || (fc[k] = FE.frameForces(S.m, k, mo.U, null, 0)); }, sh: function (k) { return FE.shellForces(S.m, k, mo.U); } }; } }
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
    if (S.res && S.se && S.se.md) states = states.concat(S.se.md.modes.map(function (mo) { return "Mode " + mo.k + " (T = " + mo.T.toFixed(3) + " s, " + mo.kind + ")"; }));
    var h = '<div class="rep viewer"><div class="vbar"><select id="vDisp">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.disp ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>' +
      (states.length ? '<select id="vState">' + states.map(function (s) { return '<option' + (s === S.state ? " selected" : "") + '>' + esc(s) + '</option>'; }).join("") + '</select>' : '') +
      '<button type="button" id="vFit" title="Reset view">⟲</button><button type="button" id="vTop" title="Plan">Plan</button><button type="button" id="vFront" title="Elevation">Elev</button></div>' +
      '<div class="cvw"><canvas id="cvgl" aria-hidden="true"></canvas><canvas id="cv"></canvas><span id="glbadge" class="glb"></span></div><div id="leg" class="leg"></div><div class="note">Drag to rotate · pinch / wheel to zoom · two-finger drag to pan · tap a member or element for details</div><div id="selinfo"></div></div>';
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
  /* ---------- viewer: scene built once per result state, drawn by the GPU (WebGL) with a light 2D overlay; redraws limited to the screen refresh ---------- */
  var PRJ = null, SCN = null, rafR = 0, GLC = null, VW = { noGL: false };
  document.addEventListener("isd-theme", function () { SCN = null; if (document.getElementById("cv") && S.m) try { render(); } catch (e) { } });
  function render() {
    if (rafR) return;
    var f0 = function () { rafR = 0; paint(); };
    rafR = window.requestAnimationFrame ? requestAnimationFrame(f0) : setTimeout(f0, 16);
  }
  function scene(key, dark) {
    var m = S.m, st = S.res && S.state ? stateOf(S.state) : null, disp = S.disp, U = null, sc = 0, i;
    if (disp === "hinge" && S.po) U = S.po.U; else if (st && /def|mz|my|n|smx|smy|uz|util/.test(disp)) U = st.U;
    var bx = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    m.nodes.forEach(function (n) { bx[0] = Math.min(bx[0], n.x); bx[1] = Math.max(bx[1], n.x); bx[2] = Math.min(bx[2], n.y); bx[3] = Math.max(bx[3], n.y); bx[4] = Math.min(bx[4], n.z); bx[5] = Math.max(bx[5], n.z); });
    var span = Math.max(bx[1] - bx[0], bx[3] - bx[2], bx[5] - bx[4], 1), c0 = [(bx[0] + bx[1]) / 2, (bx[2] + bx[3]) / 2, (bx[4] + bx[5]) / 2];
    if (U && (disp === "def" || disp === "hinge")) { var um = 0; for (i = 0; i < m.nodes.length; i++) um = Math.max(um, Math.hypot(U[6 * i], U[6 * i + 1], U[6 * i + 2])); sc = um > 0 ? 0.08 * span / um : 0; }
    var Pw = new Float64Array(3 * m.nodes.length);
    m.nodes.forEach(function (n, k) { Pw[3 * k] = n.x + (sc ? sc * U[6 * k] : 0); Pw[3 * k + 1] = n.y + (sc ? sc * U[6 * k + 1] : 0); Pw[3 * k + 2] = n.z + (sc ? sc * U[6 * k + 2] : 0); });
    var cont = (disp === "smx" || disp === "smy" || disp === "uz") && st, vals = [], vmin = Infinity, vmax = -Infinity;
    if (cont) m.shells.forEach(function (e, k) {
      var val;
      if (disp === "uz") val = e.n.reduce(function (a, j) { return a + st.U[6 * j + 2]; }, 0) / 4 * 1000;
      else { var fs = st.sh(k); val = -(disp === "smx" ? fs.Mx : fs.My); }
      vals[k] = val; vmin = Math.min(vmin, val); vmax = Math.max(vmax, val);
    });
    var fail = {}; if (S.des && disp === "util") ["slabs", "walls"].forEach(function (gk) { S.des[gk].forEach(function (r) { if (!r.ok) fail["s" + r.k] = 1; }); });
    var stroke = dark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.12)";
    var shFill = m.shells.map(function (e, k) { return cont ? cmap(vals[k], vmin, vmax) : disp === "util" && S.des ? (fail["s" + k] ? "rgba(198,40,40,.55)" : "rgba(30,142,74,.35)") : e.kind === "wall" ? "rgba(224,122,31,.28)" : "rgba(80,140,220,.22)"; });
    var util = {}; if (S.des) ["beams", "cols", "steel"].forEach(function (gk) { S.des[gk].forEach(function (r) { util[r.k] = r; }); });
    var frCol = [], frW = [];
    m.frames.forEach(function (e, k) {
      var col = e.type === "column" ? (VW.col && VW.col.pri || (dark ? "#9ab6d8" : "#1d3557")) : e.type === "brace" ? "#7a5bbf" : (VW.col && VW.col.acc || (dark ? "#f0a050" : "#c4621a"));
      if (disp === "util" && util[k]) col = util[k].ok ? (util[k].ratio > 0.85 ? "#e0a020" : "#1e8e4a") : "#c62828";
      var sel = S.sel && S.sel.t === "f" && S.sel.k === k; if (sel) col = "#00a3ff";
      frCol[k] = col; frW[k] = sel ? 4 : e.type === "brace" ? 1.4 : 2.2;
    });
    /* force diagrams in world coordinates */
    var dg = (disp === "mz" || disp === "my" || disp === "n") && st, dmax = 0, dd = [], diag = [];
    if (dg) m.frames.forEach(function (e, k) { var d = FE.frameDiagram(st.fr(k), 8); dd[k] = d; d.forEach(function (q) { dmax = Math.max(dmax, Math.abs(disp === "mz" ? q.Mz : disp === "my" ? q.My : q.N)); }); });
    var ds = dmax > 0 ? 0.06 * span / dmax : 0;
    if (dg && ds) m.frames.forEach(function (e, k) {
      var ff = st.fr(k), R = ff.R, A = m.nodes[e.n1], dir = disp === "my" ? R[2] : R[1];
      var pts = [[A.x, A.y, A.z]].concat(dd[k].map(function (q) { var val = disp === "mz" ? -q.Mz : disp === "my" ? q.My : q.N, t = q.x; return [A.x + R[0][0] * t + dir[0] * val * ds, A.y + R[0][1] * t + dir[1] * val * ds, A.z + R[0][2] * t + dir[2] * val * ds]; }), [[A.x + R[0][0] * ff.L, A.y + R[0][1] * ff.L, A.z + R[0][2] * ff.L]]);
      diag.push(pts);
    });
    var lh = "";
    if (cont) lh = '<span class="cbar"></span> ' + f(vmin, 2) + ' … ' + f(vmax, 2) + (disp === "uz" ? " mm (Z)" : " kNm/m (sagging +, local axes)");
    else if (dg) lh = "Max |" + (disp === "n" ? "N" : disp === "mz" ? "Mz" : "My") + "| = " + f(dmax, 1) + (disp === "n" ? " kN" : " kNm") + (disp === "mz" ? " — drawn on tension side" : "");
    else if ((disp === "def" || disp === "hinge") && sc) { var mxu = 0, mi = 0; for (i = 0; i < m.nodes.length; i++) { var uu = Math.hypot(U[6 * i], U[6 * i + 1], U[6 * i + 2]); if (uu > mxu) { mxu = uu; mi = i; } } lh = "Max displacement " + f(mxu * 1000, 2) + " mm at node " + (mi + 1) + " (scale ×" + f(sc, 0) + ")"; }
    if (disp === "hinge") lh += '<br><b style="color:#1e8e4a">●</b> B–IO <b style="color:#2b7bd6">●</b> IO–LS <b style="color:#e0a020">●</b> LS–CP <b style="color:#c62828">●</b> &gt;CP <b style="color:#7a5bbf">●</b> brace';
    if (disp === "util") lh = '<b style="color:#1e8e4a">■</b> OK <b style="color:#e0a020">■</b> ratio &gt; 0.85 <b style="color:#c62828">■</b> fails' + (S.des ? "" : " (run linear analysis first)");
    var lg = $("leg"); if (lg) lg.innerHTML = lh;
    return { key: key, m: m, span: span, c0: c0, Pw: Pw, shFill: shFill, stroke: stroke, frCol: frCol, frW: frW, diag: diag, dark: dark, gl: null };
  }
  function glScene(sc) {
    if (sc.gl) return sc.gl;
    var m = sc.m, Pw = sc.Pw, tri = [], lines = [], stc = GLV.rgba(sc.stroke);
    function p(i) { return [Pw[3 * i], Pw[3 * i + 1], Pw[3 * i + 2]]; }
    m.shells.forEach(function (e, k) {
      var c = GLV.rgba(sc.shFill[k]), q = e.n.map(p);
      tri.push({ p: [q[0], q[1], q[2]], c: c }, { p: [q[0], q[2], q[3]], c: c });
      for (var j = 0; j < 4; j++) lines.push({ a: q[j], b: q[(j + 1) % 4], c: stc, w: 0.6 });
    });
    m.frames.forEach(function (e, k) { lines.push({ a: p(e.n1), b: p(e.n2), c: GLV.rgba(sc.frCol[k]), w: sc.frW[k] }); });
    sc.gl = { tri: tri, lines: lines, c0: sc.c0 };
    return sc.gl;
  }
  function paint() {
    var cv = $("cv"); if (!cv || !S.m) return;
    var W = cv.clientWidth || 340, H = Math.round(Math.min(560, Math.max(300, W * 0.8))), dpr = HW.dpr();
    var dark = window.ISDTHEME ? ISDTHEME.isDark() : window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches, cs = getComputedStyle(document.documentElement);
    VW.col = { acc: cs.getPropertyValue("--acc").trim() || "#c4621a", pri: cs.getPropertyValue("--pri").trim() || "#1d3557", bg: cs.getPropertyValue("--card").trim(), pal: document.documentElement.getAttribute("data-pal") || "gold" };
    var m = S.m, v = S.view, cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    var key = [VW.col.pal, S.state, S.disp, S.sel ? S.sel.t + S.sel.k : "", dark ? 1 : 0, S.res ? S.res.ms : 0, S.po ? S.po.U.length + ":" + S.po.hinges.length : 0, S.des ? S.des.fails : -1, m.nodes.length, m.frames.length, m.shells.length].join("|");
    if (!SCN || SCN.key !== key || SCN.m !== m) SCN = scene(key, dark);
    var span = SCN.span, c0 = SCN.c0, s = Math.min(W, H) * 0.8 / span * v.zoom, Pw = SCN.Pw;
    function pr(x, y, z) {
      var X = x - c0[0], Y = y - c0[1], Z = z - c0[2];
      var a = X * cy + Y * sy, b = -X * sy + Y * cy;
      return [W / 2 + v.px + a * s, H / 2 + v.py - (Z * cp - b * sp) * s, Z * sp + b * cp];
    }
    function P(i) { return pr(Pw[3 * i], Pw[3 * i + 1], Pw[3 * i + 2]); }
    PRJ = { pr: pr, P: P };
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px"; }
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var bgc = VW.col && VW.col.bg || (dark ? "#0f1620" : "#fbfcfe"), gcv = $("cvgl"), usedGL = false;
    if (gcv && HW.useGL && !VW.noGL) {
      if (gcv.width !== Math.round(W * dpr) || gcv.height !== Math.round(H * dpr)) { gcv.width = Math.round(W * dpr); gcv.height = Math.round(H * dpr); gcv.style.height = H + "px"; }
      if (!GLC || GLC.canvas !== gcv) { GLC = GLV.init(gcv); if (GLC) GLC.canvas = gcv; else VW.noGL = true; }
      if (GLC) {
        try {
          if (GLC.scn !== SCN) { GLV.upload(GLC, glScene(SCN)); GLC.scn = SCN; }
          var bg = GLV.rgba(bgc);
          usedGL = GLV.draw(GLC, { cy: cy, sy: sy, cp: cp, sp: sp, s: s, px: v.px, py: v.py, W: W, H: H, span: span, dpr: dpr, bg: [bg[0] / 255, bg[1] / 255, bg[2] / 255] });
        } catch (e) { VW.noGL = true; usedGL = false; }
      }
    }
    if (gcv) gcv.style.display = usedGL ? "block" : "none";
    if (usedGL) g.clearRect(0, 0, W, H);
    else {
      g.fillStyle = bgc; g.fillRect(0, 0, W, H);
      var polys = m.shells.map(function (e, k) { var q = e.n.map(P); return { q: q, d: (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4, k: k }; }).sort(function (a, b) { return a.d - b.d; });
      polys.forEach(function (p) {
        g.beginPath(); p.q.forEach(function (q, i) { i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
        g.fillStyle = SCN.shFill[p.k]; g.fill(); g.strokeStyle = SCN.stroke; g.lineWidth = 0.6; g.stroke();
      });
      m.frames.forEach(function (e, k) { var a = P(e.n1), b = P(e.n2); g.strokeStyle = SCN.frCol[k]; g.lineWidth = SCN.frW[k]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
    }
    /* overlay: force diagrams, hinges, supports, selection, axes */
    if (SCN.diag.length) {
      g.fillStyle = "rgba(29,53,87,.16)"; g.strokeStyle = dark ? "#7fb0e8" : "#1d3557"; g.lineWidth = 1;
      SCN.diag.forEach(function (pts) { g.beginPath(); pts.forEach(function (w, i) { var q = pr(w[0], w[1], w[2]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.stroke(); });
    }
    if (S.disp === "hinge" && S.po) {
      var colr = { "Elastic": "#9e9e9e", "B-IO": "#1e8e4a", "IO-LS": "#2b7bd6", "LS-CP": "#e0a020", "> CP": "#c62828", "Axial yield/buckle": "#7a5bbf" };
      S.po.hinges.forEach(function (h) {
        var e = m.frames[h.k], a = P(e.n1), b = P(e.n2), t = h.end === "i" ? 0.12 : 0.88, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        if (h.axis === "a") { x = (a[0] + b[0]) / 2; y = (a[1] + b[1]) / 2; }
        g.beginPath(); g.arc(x, y, 4.5, 0, 6.3); g.fillStyle = colr[h.state] || "#c62828"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke();
      });
    }
    Object.keys(m.sup).forEach(function (i) { supGlyph(g, P(+i), (m.supType && m.supType[i]) || (m.sup[i][3] ? "fixed" : "pinned")); });
    if (S.sel && S.sel.t === "n") { var qn = P(S.sel.k); g.strokeStyle = "#00a3ff"; g.lineWidth = 2.5; g.beginPath(); g.arc(qn[0], qn[1], 7, 0, 2 * Math.PI); g.stroke(); }
    if (S.sel && S.sel.t === "s") { var e2 = m.shells[S.sel.k]; g.beginPath(); e2.n.map(P).forEach(function (q, i) { i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.strokeStyle = "#00a3ff"; g.lineWidth = 3; g.stroke(); }
    var o = [34, H - 30], ax = [[1, 0, 0, "X", "#c62828"], [0, 1, 0, "Y", "#2e7d32"], [0, 0, 1, "Z", "#1565c0"]];
    ax.forEach(function (a) { var p0 = pr(c0[0], c0[1], c0[2]), p1 = pr(c0[0] + a[0] * span / s * 22, c0[1] + a[1] * span / s * 22, c0[2] + a[2] * span / s * 22); var dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1; if (m.twoD && a[3] === "Y") return; g.strokeStyle = a[4]; g.lineWidth = 2; g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(o[0] + dx / l * 22 * Math.min(1, l / 22), o[1] + dy / l * 22 * Math.min(1, l / 22)); g.stroke(); g.fillStyle = a[4]; g.font = "11px sans-serif"; g.fillText(a[3], o[0] + dx / l * 27, o[1] + dy / l * 27 + 4); });
    var gb = $("glbadge"); if (gb) gb.textContent = usedGL ? "GPU" : "";
  }
  function cmap(v, a, b) {
    var t = b > a ? (v - a) / (b - a) : 0.5, st = [[0, [33, 102, 172]], [0.25, [103, 169, 207]], [0.5, [209, 229, 240]], [0.75, [244, 165, 130]], [1, [178, 24, 43]]];
    for (var i = 1; i < st.length; i++) if (t <= st[i][0]) { var u = (t - st[i - 1][0]) / (st[i][0] - st[i - 1][0]), c = st[i - 1][1].map(function (x, j) { return Math.round(x + (st[i][1][j] - x) * u); }); return "rgba(" + c.join(",") + ",.85)"; }
    return "rgba(178,24,43,.85)";
  }
  /* support symbols on the 2D overlay: fixed (hatched base), pinned (triangle), roller (triangle on wheels), spring (zig-zag), guided (sleeve) */
  function supGlyph(g, q, t) {
    var x = q[0], y = q[1], col = t === "fixed" ? "#2e7d32" : t === "spring" ? "#b7791f" : t === "roller" ? "#1565c0" : "#8d6e63";
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.6; g.beginPath();
    if (t === "fixed") { g.fillRect(x - 8, y, 16, 3); for (var k = -8; k <= 6; k += 4) { g.moveTo(x + k, y + 3); g.lineTo(x + k - 3, y + 8); } g.stroke(); return; }
    if (t === "spring") { g.moveTo(x, y); for (var j = 1; j <= 5; j++) g.lineTo(x + (j % 2 ? 4 : -4), y + j * 2.4); g.lineTo(x, y + 14); g.moveTo(x - 7, y + 14); g.lineTo(x + 7, y + 14); g.stroke(); return; }
    if (t === "guided") { g.strokeRect(x - 5, y - 6, 10, 12); g.moveTo(x - 9, y + 9); g.lineTo(x + 9, y + 9); g.stroke(); return; }
    g.moveTo(x, y); g.lineTo(x - 6, y + 9); g.lineTo(x + 6, y + 9); g.closePath(); g.globalAlpha = .85; g.fill(); g.globalAlpha = 1;
    if (t === "roller") { g.beginPath(); g.arc(x - 3.5, y + 12, 2.2, 0, 7); g.arc(x + 3.5, y + 12, 2.2, 0, 7); g.stroke(); }
  }
  function pick(e) {
    var cv = $("cv"), r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, m = S.m;
    m.nodes.forEach(function (nd, k) { var q = PRJ.P(k), d = Math.hypot(q[0] - x, q[1] - y); if (d < 9 && (!best || d < best.d)) best = { t: "n", k: k, d: d }; });
    if (!best) m.frames.forEach(function (fr, k) {
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
    if (sl.t === "n") {
      var nd = m.nodes[sl.k], cur = (m.supType && m.supType[sl.k]) || (m.sup[sl.k] ? "fixed" : "free");
      h += '<h4>Node N' + (sl.k + 1) + ' · (' + f(nd.x, 2) + ', ' + f(nd.y, 2) + ', ' + f(nd.z, 2) + ') m</h4><div class="small">Support: <b>' + esc(cur) + '</b>' + (m.spr && m.spr[sl.k] ? ' — springs Kv ' + f(m.spr[sl.k][2], 0) + ' kN/m, Kθx ' + f(m.spr[sl.k][3], 0) + ', Kθy ' + f(m.spr[sl.k][4], 0) + ' kNm/rad' : '') + '</div>';
      if (st && st.reac && st.reac[sl.k]) { var rq = st.reac[sl.k]; h += '<div class="small">' + esc(S.state) + ' — reactions Fx ' + f(rq[0], 1) + ', Fy ' + f(rq[1], 1) + ', Fz ' + f(rq[2], 1) + ' kN · Mx ' + f(rq[3], 1) + ', My ' + f(rq[4], 1) + ' kNm</div>'; }
      h += '<div class="asg"><select id="supSel">' + MD.SUP_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") + '</select><button id="supBtn" type="button">Set support</button></div>';
    }
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
    } else if (sl.t === "s") {
      var s = m.shells[sl.k];
      h += '<h4>' + cap(s.kind) + ' element S' + (sl.k + 1) + ' · t = ' + f(s.t * 1000, 0) + ' mm · nodes ' + s.n.map(function (i) { return i + 1; }).join(", ") + '</h4>';
      if (st) { var fs = st.sh(sl.k); h += '<div class="small">' + esc(S.state) + ' — local axes: Nx ' + f(fs.Nx, 1) + ', Ny ' + f(fs.Ny, 1) + ', Nxy ' + f(fs.Nxy, 1) + ' kN/m · Mx ' + f(fs.Mx, 2) + ', My ' + f(fs.My, 2) + ', Mxy ' + f(fs.Mxy, 2) + ' kNm/m · Qx ' + f(fs.Qx, 1) + ', Qy ' + f(fs.Qy, 1) + ' kN/m</div>'; }
      var sd = S.des && S.des[s.kind === "wall" ? "walls" : "slabs"].filter(function (r) { return r.k === sl.k; })[0];
      if (sd) h += shellText(sd) + '<details class="calc" open><summary>Worked calculation (IS code equations & limits)</summary>' + CALC.html(CALC.shell(sd, S.p), esc) + '</details>';
    }
    box.innerHTML = h + '</div>';
    if ($("supBtn")) $("supBtn").onclick = function () {
      var v = $("supSel").value;
      UV.supOver = ((given("supOver") ? UV.supOver + "\n" : "") + "N" + (sl.k + 1) + " = " + v); save();
      var ta = document.querySelector("[data-k=supOver]"); if (ta) ta.value = UV.supOver;
      S.m = MD.make(S.geo, params()); S.res = S.des = S.po = null; status(); drawViewer(); $("results").innerHTML = ""; showSel();
      toast("N" + (sl.k + 1) + " = " + v + " — re-run the analysis");
    };
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
      if (r.pd) { var a = r.combos.map(function (c) { return c.pdAmp; }), its = r.combos.map(function (c) { return c.pdIter; }), rs = r.combos.map(function (c) { return c.pdResid || 0; });
        h += '<div><span>P-Delta displacement amplification (max)</span><b>' + f(Math.max.apply(null, a), 3) + '</b></div><div><span>P-Delta convergence</span><b>all ' + r.combos.length + ' combinations converged · ≤ ' + Math.max.apply(null, its) + ' iterations · residual ≤ ' + Math.max.apply(null, rs).toExponential(1) + '</b></div>'; }
      var qs = r.quality && r.quality.stats;
      if (qs && qs.shells) h += '<div><span>Mesh quality</span><b>' + qs.shells + ' shells · max aspect ' + f(qs.maxAR, 1) + ' · min angle ' + f(qs.minAng, 0) + '°</b></div>';
      h += '</div>';
      var dfl = used().filter(function (k) { return LBL[k]; }).map(function (k) { return LBL[k] + " " + dtxt(k); });
      if (S.des.fails) h += '<div class="fixbox noprint"><b>' + IC.svg("bulb") + ' How to make it pass</b><small>' + S.des.fails + ' design check(s) fail.</small><div class="fx"><span>' + (S.autoRes && !S.autoRes.ok ? 'Run automatic design again from the enlarged sizes' : 'Run automatic design — enlarges the columns and beams of the failing storeys in 50 mm steps until every check passes') + '</span><button type="button" id="bFixAuto">Apply</button></div><small>Or edit the sizes in <b>Member section overrides</b>, raise the concrete grade, or add shear walls / bracing where drift governs.</small></div>';
      if (S.limits && S.limits.length) h += '<div class="note"><b>' + (S.limits.some(function (x) { return x.hard; }) ? 'Existing structure — inputs outside the code limits:' : 'Code notes on the inputs:') + '</b> ' + S.limits.map(function (x) { return esc(x.msg + " (" + x.ref + ")"); }).join("<br>") + '</div>';
      if (dfl.length) h += '<div class="note"><b>Defaults used</b> (not entered): ' + esc(dfl.join(" · ")) + '</div>';
      if (S.L.notes.length) h += '<div class="note">' + S.L.notes.map(esc).join("<br>") + '</div>';
      if (r.warn && r.warn.length) h += '<div class="note"><b>Model warnings:</b> ' + r.warn.map(esc).join("<br>") + '</div>';
      Object.keys(S.L.eq).forEach(function (k) { var q = S.L.eq[k]; h += '<div class="eq">' + k + ': h = ' + f(q.H, 2) + ' m, d = ' + f(q.d, 1) + ' m, Ta = ' + f(q.T, 3) + ' s, Sa/g = ' + f(q.Sa, 3) + ', Ah = Z/2 · Sa/g / (R/I) = ' + f(q.Ah, 4) + (q.Ahd > q.Ah ? ' → min ' + f(q.Ahd, 4) + ' (Table 7)' : '') + ', W = ' + f(q.W, 0) + ' kN, <b>Vb = ' + f(q.Vb, 1) + ' kN</b></div>'; });
      Object.keys(S.L.wind).forEach(function (k) { var q = S.L.wind[k], cp = q.cpe; h += '<div class="eq">' + k + ': exposed width ' + f(q.B, 1) + ' m, total wind force ' + f(q.F, 1) + ' kN — Vz = Vb·k1·k2·k3·k4 (k1 ' + f(q.k1, 2) + '), pd = max(Kd·Ka·Kc, 0.7)·pz; ' + (cp ? 'Cpe windward ' + f(cp.ww, 2) + ', leeward ' + f(cp.lw, 2) + ' (IS 875-3 Table 5, h/w ' + f(cp.hw, 2) + ', l/w ' + f(cp.lwr, 2) + ', wind on the ' + (cp.onLong ? 'long' : 'short') + ' face) → net ' + f(cp.net, 2) + '; internal pressure ±' + f(q.cpi, 1) + ' cancels on the frame, cladding pressures ' + f(q.clad.pos, 2) + ' / ' + f(q.clad.neg, 2) + ' × pd' + (cp.note.length ? '. ' + esc(cp.note.join("; ")) : '') : 'force coefficient Cf ' + f(q.C, 2)) + (S.L.wtor && S.L.wtor[k] ? '; torsion sets 0.75·' + k + ' ± torque 0.75·Fi·0.15B' : '') + '</div>'; });
      if (S.se) h += seismicBlock();
      if (S.drift.length) h += '<h4>Storey drift at corresponding locations (unfactored lateral load, IS 1893 cl 7.11.1, limit 0.004h)</h4>' + tbl(["Case", "Storey (z, m)", "Governing nodes (top/bottom)", "Δu (mm)", "Drift Δu/h", "Δmax/Δave floor", ""], S.drift.map(function (d) { return [d.c, f(d.zb, 2) + "–" + f(d.z, 2), (d.top + 1) + " / " + (d.bot + 1) + (d.stacked ? "" : " (nearest)"), f(Math.abs(d.ut - d.ub) * 1000, 2), f(d.dr, 5), m.twoD ? "—" : f(d.tr, 2), d.lim ? (d.ok ? '<span class="okt">OK</span>' : '<span class="not">EXCEEDS</span>') : '']; })) +
        '<div class="note">Drift = relative lateral displacement of the node at the top of a storey and the node directly below it, ÷ storey height; the largest value on each storey is shown. ' + (m.twoD ? '' : 'Δmax/Δave = largest ÷ average of the extreme floor displacements — an indicator for torsional irregularity (IS 1893 (Part 1):2016 Table 5 (i); Amendment 2 (2020) uses Δmax/Δave with 1.2 and 1.4 thresholds) computed without accidental eccentricity; values above 1.2 need review.') + '</div>';
      var vm = typeof PDB !== "undefined" && PDB.current().vmode;
      h += (vm ? PRO.chips(designTables()) : designTables()) + detailBlock() + (typeof PRO !== "undefined" ? PRO.block(S) : "") + basisBlock();
      h += '<h4>Support reactions — ' + esc(cb0.name) + '</h4>' + tbl(["Node", "Fx", "Fy", "Fz (kN)", "Mx", "My", "Mz (kNm)"], Object.keys(cb0.reac).slice(0, 60).map(function (k) { var q = cb0.reac[k]; return [+k + 1].concat(q.map(function (v) { return f(v, 1); })); }));
      h += '<div class="btns noprint"><button type="button" class="pri bXls">Excel: full analysis & design</button></div><div class="btns noprint"><button type="button" id="bCSV">Forces CSV</button><button type="button" id="bPrint">Print / Save PDF</button></div>';
      h += '<div class="disc">Analysis: 3D frame elements (Euler–Bernoulli, 6 DOF/node) by the direct stiffness method; slabs, plates & walls by 4-node flat shell FEA (QM6 incompatible-mode membrane + MITC4 Mindlin plate). Verified against closed-form beam, frame, plate and wall solutions. Results must be reviewed by a qualified structural engineer.</div></div>';
    }
    if (S.po) h += poReport() + (S.res ? '' : '<div class="btns noprint"><button type="button" class="pri bXls">Excel: pushover & model</button></div>');
    $("results").innerHTML = h;
    if ($("bFixAuto")) $("bFixAuto").onclick = runAuto;
    jumpBar($("results"));
    function handoff(id) {
      var cr = S.res && S.res.caseReac; if (!cr || !cr.DL) return toast("Run the analysis first");
      var g = DT.grid(S.m), lines = [];
      Object.keys(S.m.sup).map(Number).forEach(function (n) {
        var c = DT.colAt(S.m, n); if (!c) return; var nd = S.m.nodes[n], d = cr.DL[n] || [0, 0, 0, 0, 0, 0], l = cr.LL && cr.LL[n] || [0, 0, 0, 0, 0, 0], nm = "C-" + g.gy(nd.y) + g.gx(nd.x), r1 = function (v) { return Math.round(v * 10) / 10; };
        lines.push(id === "pile" ? [nm, r1(nd.x), r1(nd.y), r1(d[2] + l[2]), r1(Math.abs(d[3] + l[3])), r1(Math.abs(d[4] + l[4])), r1(Math.abs(d[0] + l[0])), r1(Math.abs(d[1] + l[1]))].join(", ") : [nm, r1(nd.x), r1(nd.y), r1(d[2]), r1(l[2]), r1(Math.abs(d[3] + l[3])), r1(Math.abs(d[4] + l[4]))].join(", "));
      });
      var st = (window.ISD && ISD.store(id)) || {}; st.cols = lines.join("\n"); st.__ran = false; if (id === "pile" && S.p.zone) st.zone = String({ II: 2, III: 3, IV: 4, V: 5 }[S.p.zone] || 4); if (S.p.fck) st.fck = String(S.p.fck); if (S.p.fy) st.fy = String(S.p.fy); if (id === "raft" && S.p.sbc) st.sbc = String(S.p.sbc);
      ISD.store(id, st); location.hash = "#" + id; toast("Base reactions (DL + LL) sent — add seismic loads if they govern");
    }
    if ($("bToPile")) $("bToPile").onclick = function () { handoff("pile"); };
    if ($("bToRaft")) $("bToRaft").onclick = function () { handoff("raft"); };
    document.querySelectorAll(".bXls").forEach(function (b) { b.onclick = exportXlsx; });
    if ($("bPrint")) { if (!window.AndroidBridge && window.self !== window.top) $("bPrint").hidden = true; $("bPrint").onclick = function () { document.querySelectorAll("details").forEach(function (x) { x.open = true; }); if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print("Frame analysis"); else window.print(); }; }
    if ($("bCSV")) $("bCSV").onclick = csv;
    bindDetail();
    if (typeof PRO !== "undefined") PRO.bind(S, ctx());
    if ($("bAllCalc")) $("bAllCalc").onclick = function () { this.disabled = true; this.textContent = "Preparing…"; var b = this; setTimeout(function () { allCalcs(); b.textContent = "All member calculations shown below"; }, 20); };
    document.querySelectorAll("[data-fk]").forEach(function (td) { td.onclick = function () { S.sel = { t: td.getAttribute("data-t"), k: +td.getAttribute("data-fk") }; render(); showSel(); $("viewer").scrollIntoView({ behavior: "smooth" }); }; });
  }
  /* sticky chips that jump to the main parts of a long result */
  function jumpBar(box) {
    var L = [["Analysis", /^(Linear static|P-Delta|Pushover)/], ["Seismic", /^Modal analysis/], ["Drift", /^Storey drift/], ["Design", /^(RCC beams|RCC columns|Steel members)/], ["Detailing", /^Reinforcement detailing/], ["Outputs", /^Professional outputs/], ["Estimate", /^(Bill of quantities|Estimate)/], ["Assistant", /^Engineering assistant/], ["Calculations", /^Worked calculations/], ["Codes", /^Standards register/]], used = {}, chips = [];
    box.querySelectorAll("h3, h4, summary").forEach(function (el, i) {
      var t = el.textContent.trim(); L.forEach(function (q) { if (!used[q[0]] && q[1].test(t)) { used[q[0]] = 1; el.id = el.id || "j" + i; chips.push([q[0], el.id]); } });
    });
    if (chips.length < 3) return;
    var nav = document.createElement("nav"); nav.className = "jump noprint";
    nav.innerHTML = chips.map(function (c) { return '<a href="javascript:void 0" data-j="' + c[1] + '">' + c[0] + '</a>'; }).join("");
    box.insertBefore(nav, box.firstChild);
    nav.querySelectorAll("a").forEach(function (a) { a.onclick = function () { var el = document.getElementById(a.getAttribute("data-j")); if (!el) return; var d = el.closest("details"); if (d) d.open = true; var y = el.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: "smooth" }); }; });
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
  /* ---------- reinforcement detailing ---------- */
  function detailBlock() {
    var dt = S.det; if (!dt) return "";
    if (dt.err) return '<h4>Reinforcement detailing</h4><div class="note">Detailing not available: ' + esc(dt.err) + '</div>';
    if (!dt.beams.length && !dt.cols.length) return dt.warn.length ? '<h4>Reinforcement detailing</h4><div class="note">' + dt.warn.map(esc).join("<br>") + '</div>' : "";
    var h = '<h4 id="dtH">Reinforcement detailing & bar bending schedule — ' + (dt.cf.duct ? 'IS 13920:2016 ductile detailing (zone ' + esc(S.p.zone) + ')' : 'IS 456 / SP 34') + ' · ' + (dt.fails ? '<span class="not">' + dt.fails + ' check(s) fail</span>' : '<span class="okt">all checks OK</span>') + '</h4>';
    h += '<div class="sum"><div><span>Reinforcement (beams / columns / slabs / footings' + (dt.walls.length ? ' / walls' : '') + ')</span><b>' + ["beams", "cols", "slabs", "foot"].concat(dt.walls.length ? ["walls"] : []).map(function (k) { var t = 0; dt.tot.forEach(function (q) { t += q[k]; }); return f(t / 1000, 2); }).join(" / ") + ' t</b></div><div><span>Total steel</span><b>' + f(dt.total / 1000, 2) + ' t' + (dt.area ? ' · ' + f(dt.total / dt.area, 1) + ' kg per m² of slab' : '') + '</b></div></div>';
    h += tbl(["Diameter", "Beams kg", "Columns kg", "Slabs kg", "Footings kg"].concat(dt.walls.length ? ["Walls kg"] : []).concat(["Total kg"]), dt.tot.map(function (t) { return [t.dia + " mm", f(t.beams, 0), f(t.cols, 0), f(t.slabs, 0), f(t.foot, 0)].concat(dt.walls.length ? [f(t.walls, 0)] : []).concat(["<b>" + f(t.all, 0) + "</b>"]); }));
    var bad = dt.scwb.filter(function (q) { return !q.ok; });
    if (dt.scwb.length) h += '<div class="note"><b>Strong column – weak beam</b> (IS 13920 cl 7.2.1, ΣMc ≥ 1.4 ΣMb): ' + (bad.length ? '<span class="not">' + bad.length + ' of ' + dt.scwb.length + ' joint checks fail</span> — ' + bad.slice(0, 8).map(function (q) { return esc(q.col) + " +" + f(q.z, 2) + " " + q.dir + " (" + f(q.r, 2) + ")"; }).join(", ") + (bad.length > 8 ? " …" : "") + '. Enlarge or add steel to these columns.' : '<span class="okt">all ' + dt.scwb.length + ' joint checks OK</span> (min ratio ' + f(Math.min.apply(null, dt.scwb.map(function (q) { return q.r; })), 2) + ')') + '</div>';
    var jb = (dt.joints || []).filter(function (q) { return !q.ok || !q.anch; });
    if (dt.joints && dt.joints.length) h += '<div class="note"><b>Beam–column joints</b> (IS 13920 cl 9: Vj = 1.25fy(Ast,top + Ast,bot) − Vcol ≤ k√fck·Aej; column depth ≥ 20 × beam bar φ): ' + (jb.length ? '<span class="not">' + jb.length + ' of ' + dt.joints.length + ' joint checks fail</span> — ' + jb.slice(0, 8).map(function (q) { return esc(q.col) + " +" + f(q.z, 2) + " " + q.dir + (q.ok ? "" : " (Vj/cap " + f(q.r, 2) + ")") + (q.anch ? "" : " (hc < 20φ)"); }).join(", ") + (jb.length > 8 ? " …" : "") + '.' : '<span class="okt">all ' + dt.joints.length + ' joint checks OK</span> (max Vj/capacity ' + f(Math.max.apply(null, dt.joints.map(function (q) { return q.r; })), 2) + ')') + '</div>';
    if (dt.serv && (dt.serv.beams || dt.serv.slabs)) { var sb = []; dt.beams.forEach(function (bl) { bl.checks.forEach(function (q) { if (q.serv && !q.ok) sb.push(bl.name + " span " + (q.sp + 1) + ": " + q.t.split(",")[0] + " " + q.v); }); });
      h += '<div class="note"><b>Serviceability</b> (IS 456 cl 23.2.1 span / effective depth; crack width by Annex F under service DL + LL, limit ' + DT.wlim(dt.cf).toFixed(2) + ' mm for ' + esc(dt.cf.cv.expo) + ' exposure, cl 35.3.2): ' + ((dt.serv.beamFail + dt.serv.slabFail) ? '<span class="not">' + dt.serv.beamFail + ' of ' + dt.serv.beams + ' beam checks and ' + dt.serv.slabFail + ' of ' + dt.serv.slabs + ' slab panels fail</span>' + (sb.length ? ' — ' + sb.slice(0, 6).map(esc).join("; ") + (sb.length > 6 ? " …" : "") : "") : 'all ' + dt.serv.beams + ' beam checks and ' + dt.serv.slabs + ' slab panels pass') + '. Long-term deflection is not calculated (Annex C); the span / depth rule is the code\'s deemed-to-satisfy check.</div>'; }
    if (dt.warn.length) h += '<div class="note">' + dt.warn.map(esc).join("<br>") + '</div>';
    if (!S.m.twoD) h += '<div class="btns noprint"><button type="button" id="bToPile">Design these foundations on piles →</button><button type="button" id="bToRaft">Standalone raft module →</button></div>';
    var opts = [];
    dt.gB.forEach(function (G, i) { opts.push(["b" + i, "Beam " + G.id + ": " + G.rep.name + (G.n > 1 ? " (×" + G.n + ")" : "") + (G.rep.checks.some(function (c) { return !c.ok; }) ? " ⚠" : "")]); });
    dt.gC.forEach(function (G, i) { opts.push(["c" + i, "Column " + G.id + ": " + G.list.map(function (c) { return c.name; }).slice(0, 4).join(", ") + (G.n > 4 ? " … (×" + G.n + ")" : "") + (G.rep.checks.some(function (c) { return !c.ok; }) || G.rep.msg.length ? " ⚠" : "")]); });
    (dt.gW || []).forEach(function (G, i) { opts.push(["w" + i, "Wall " + G.id + ": " + G.list.map(function (w) { return w.name.replace(/^W\d+ /, "") + " " + w.line; }).slice(0, 2).join("; ") + (G.n > 1 ? " (×" + G.n + ")" : "") + (G.rep.checks.some(function (c) { return !c.ok; }) ? " ⚠" : "")]); });
    dt.slabs.forEach(function (sl, i) { opts.push(["s" + i, sl.name]); });
    if (dt.mat) opts.push(["m0", "Mat foundation " + f(dt.mat.L, 2) + " × " + f(dt.mat.B, 2) + " m × " + dt.mat.T + " mm" + (dt.mat.checks.some(function (c) { return !c.ok; }) ? " ⚠" : "")]);
    dt.gF.forEach(function (G, i) { opts.push(["f" + i, "Footing " + G.id + ": " + G.rep.Lx + "×" + G.rep.Ly + "×" + G.rep.D + " — " + G.list.map(function (c) { return c.name; }).slice(0, 4).join(", ") + (G.n > 4 ? " …" : "") + (G.rep.checks.some(function (c) { return !c.ok; }) ? " ⚠" : "")]); });
    h += '<div class="btns noprint"><select id="dtSel" style="flex:1;min-width:0">' + opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join("") + '</select></div><div id="dtView"></div>';
    h += '<div class="btns noprint"><button type="button" id="bDtDxf">Detail drawings DXF (all members)</button></div>';
    h += '<div class="note">Bar marks, shapes and cutting lengths per IS 2502 / SP 34 (90° bend deduction 2φ; hoops with two 135° hooks, allowance 10φ each); weight = φ²/162 kg/m. Laps: max(Ld, 30φ), beams outside joints and 2d from faces, columns in the central half, ≤ 150 mm hoop spacing over laps. Stock length 12 m. The Excel workbook has the full schedule with live formulas.</div>';
    return h;
  }
  function bindDetail() {
    var sel0 = $("dtSel"); if (!sel0) return;
    sel0.onchange = function () { showDetail(this.value); }; showDetail(sel0.value);
    $("bDtDxf").onclick = function () { download("detailing.dxf", DT.dxf(dtRows())); };
  }
  function dtRows() {
    var dt = S.det, cf = dt.cf, rows = [];
    dt.gB.forEach(function (G) { rows.push({ title: "Beam " + G.id + " — " + G.list.map(function (b) { return b.name; }).join(", "), dws: DT.drawBeam(G.rep, cf, 1) }); });
    dt.gC.forEach(function (G) { rows.push({ title: "Column " + G.id + " — " + G.list.map(function (c) { return c.name; }).join(", "), dws: DT.drawCol(G.rep, cf, 1) }); });
    dt.gF.forEach(function (G) { rows.push({ title: "Footing " + G.id + " — " + G.list.map(function (c) { return c.name; }).join(", "), dws: DT.drawFoot(G.rep, cf) }); });
    if (dt.mat) rows.push({ title: "Mat foundation", dws: MAT.draw(dt.mat, cf) });
    (dt.gW || []).forEach(function (G) { rows.push({ title: "Wall " + G.id + " — " + G.list.map(function (w) { return w.line; }).join("; "), dws: DT.drawWall(G.rep, cf) }); });
    dt.slabs.forEach(function (sl) { rows.push({ title: sl.name, dws: DT.drawSlab(sl, cf) }); });
    return rows;
  }
  function showDetail(v) {
    var dt = S.det, cf = dt.cf, kind = v[0], i = +v.slice(1), h = "", dws = [], bars = [], checks = [], msg = [], info = "", W = Math.max(280, Math.min(($("results").clientWidth || 360) - 30, 900));
    function bbs(rows, nm) { return tbl(["Mark", "Description", "φ", "Shape", "A", "B", "C", "No. × members", "Cut length m", "Weight kg"], rows.map(function (q) { return ["<b>" + q.mark + "</b>", esc(q.desc), q.dia, q.shape, f(q.A, 0), q.B ? f(q.B, 0) : "", q.C ? f(q.C, 0) : "", q.n + (nm > 1 ? " × " + nm : ""), f(q.L / 1000, 3), f(nm * q.n * q.L / 1000 * DT.wpm(q.dia), 1)]; })); }
    if (kind === "b") {
      var G = dt.gB[i], bl = G.rep; dws = DT.drawBeam(bl, cf, 2.5);
      info = G.list.map(function (b) { return b.name; }).join(", ") + " · " + bl.b + "×" + bl.D + " · main bars " + bl.dia + "φ (Ld " + f(bl.Ld, 0) + ", lap " + bl.lap + " mm) · " + bl.spans.length + " span(s)";
      h += '<div class="note">' + esc(info) + '</div>' + svgs(dws, W) + tbl(["Span", "Clear (mm)", "Bottom", "Top left / right", "End zones", "Middle", "Vu,cap (kN)"], bl.spans.map(function (sp, j) { return [j + 1, f(sp.Lc, 0), sp.nb + "-" + bl.dia + "φ", bl.sup[j].nt + " / " + bl.sup[j + 1].nt + " -" + bl.dia + "φ", sp.sv.ph + "φ@" + sp.sv.sh + " over " + f(sp.sv.lh, 0), sp.sv.ph + "φ@" + sp.sv.sm, sp.sv.cap ? f(Math.max(sp.sv.VuL, sp.sv.VuR), 1) : "—"]; }));
      checks = bl.checks; msg = bl.msg; h += dchk(checks, msg) + bbs(bl.bars, G.n);
    } else if (kind === "c") {
      var Gc = dt.gC[i], c = Gc.rep; dws = DT.drawCol(c, cf, 3);
      h += '<div class="note">' + esc(Gc.list.map(function (q) { return q.name; }).join(", ")) + '</div>' + svgs(dws, Math.min(W, 420), 640);
      h += tbl(["Storey", "Section", "Bars", "Steel %", "Ties", "lo (mm)", "Confining", "Middle"], c.st.map(function (s) { return [s.i + 1, s.b + "×" + s.D, s.ar.n + "-" + s.ar.dia + "φ", f(s.pct, 2), s.tie.dia + "φ, " + s.tie.lB + "×" + s.tie.lD + " legs", s.tie.lo, s.tie.sc ? s.tie.dia + "φ@" + s.tie.sc : "—", s.tie.dia + "φ@" + s.tie.sm]; }));
      var sw = dt.scwb.filter(function (q) { return q.colRef === c; });
      if (sw.length) h += tbl(["Joint", "Dir", "ΣMc kNm", "ΣMb kNm", "ΣMc/ΣMb", "≥ 1.4"], sw.map(function (q) { return ["+" + f(q.z, 2), q.dir, f(q.Mc, 0), f(q.Mb, 0), f(q.r, 2), okc(q.ok)]; }));
      var jj = (dt.joints || []).filter(function (q) { return q.colRef === c; });
      if (jj.length) h += tbl(["Joint", "Dir", "Faces confined", "Vj kN", "k√fck·Aej kN", "Vj/cap", "hc ≥ 20φ", ""], jj.map(function (q) { return ["+" + f(q.z, 2), q.dir, q.faces + " (k = " + q.k + ")", f(q.Vj, 0), f(q.cap, 0), f(q.r, 2), q.anch ? "✓ " + q.hc + " ≥ " + 20 * q.dia : "✗ " + q.hc + " < " + 20 * q.dia, okc(q.ok && q.anch)]; }));
      h += dchk(c.checks, c.msg) + bbs(c.bars, Gc.n);
    } else if (kind === "w") {
      var Gw = dt.gW[i], w = Gw.rep; dws = DT.drawWall(w, cf);
      h += '<div class="note">' + esc(Gw.list.map(function (q) { return q.name + " " + q.line; }).join("; ")) + ' · Lw ' + f(w.Lw, 0) + ' × tw ' + w.t + ' mm' + (w.endCols.length ? ' · end columns ' + esc(w.endCols.join(", ")) : '') + '</div>' + svgs(dws, Math.min(W, 520));
      h += tbl(["Storey", "Pu max kN", "Mu max kNm", "Vu kN", "τv / τc,max", "ρv (req)", "Vertical", "Horizontal", "σ/0.2fck", "Boundary el."], w.storeys.map(function (st) { var P = 0, M = 0; st.env.forEach(function (q) { P = Math.max(P, q.P); M = Math.max(M, q.M); }); return [st.i + 1, f(P, 0), f(M, 0), f(st.Vu, 0), f(st.tv, 2) + " / " + f(st.tcm, 2), f(100 * st.rho, 2) + " %", st.vb.dia + "φ@" + st.vb.s + (w.two ? " EF" : ""), st.hb.dia + "φ@" + st.hb.s + (w.two ? " EF" : ""), f(st.sMax / (0.2 * w.fck), 2), st.be ? (st.beBars ? st.beL + " mm, " + st.beBars.n + "-" + st.beBars.dia + "φ" : "end columns") : "not req."]; }));
      h += '<div class="note">Section forces at each floor from the wall elements (nodal forces K·u, response-spectrum combinations by modal combination); flexure with axial load by strain compatibility with uniformly distributed vertical steel; out-of-plane bending of the wall is checked element by element in the Wall Design table.</div>' + dchk(w.checks, w.msg) + bbs(w.bars, Gw.n);
    } else if (kind === "s") {
      var sl = dt.slabs[i]; dws = DT.drawSlab(sl, cf);
      h += svgs(dws, W) + tbl(["Panel", "Lx × Ly", "Bottom X", "Bottom Y", "Top W / E / S / N"], sl.panels.map(function (P, j) { return ["S" + (j + 1), P.Lx + "×" + P.Ly, P.bot.X.dia + "φ@" + P.bot.X.s, P.bot.Y.dia + "φ@" + P.bot.Y.s, ["W", "E", "S", "N"].map(function (k) { var T = P.top[k]; return T.sp.dia + "φ@" + T.sp.s + (T.cont ? "" : "*"); }).join(" / ")]; }));
      h += '<div class="small"><b>Deflection</b> — short span / effective depth (IS 456 cl 23.2.1; basic 26 where the panel continues along the short span, else 20; kt from the bottom steel provided)</div>' + tbl(["Panel", "Short span", "d (mm)", "L/d", "Allowed", ""], sl.panels.map(function (P, j) { var q = P.serv || {}; return ["S" + (j + 1), f(q.Ls / 1000, 2) + " m", f(P.d, 0), f(q.ratio, 1), q.basic ? f(q.basic, 1) + " × " + f(q.kt, 2) + " = " + f(q.allow, 1) : "—", okc(q.ok)]; }));
      var pm = []; sl.panels.forEach(function (P) { pm = pm.concat(P.msg); });
      h += '<div class="note">* discontinuous edge: top bars 0.1L into the panel with a bend, ≥ 50 % of mid-span steel (IS 456 Annex D). Continuous edges: 0.3L each side. Corner torsion steel where an edge is discontinuous (D-1.8, D-1.9).</div>' + dchk([], pm) + bbs(sl.bars, 1);
    } else if (kind === "m") {
      var mt = dt.mat; dws = MAT.draw(mt, cf);
      h += '<div class="note">' + esc(mt.why === "chosen" ? "Mat foundation (chosen)" : "Mat foundation — " + mt.why) + ' · plate on compression-only Winkler springs, ks = ' + f(mt.ks, 0) + ' kN/m³ · ' + mt.el.length + ' elements (' + f(mt.h, 2) + ' m) · thickness ' + mt.T + ' mm' + (mt.fixedT ? ' (entered)' : ' (smallest that passes, ' + mt.passes + ' trial' + (mt.passes > 1 ? 's' : '') + ')') + ' · net pressures (backfill over the mat balances the excavated soil)</div>' + svgs(dws, W);
      h += '<div class="dwgt">Net soil pressure under DL+LL (kN/m²)</div><div class="tw">' + MAT.heat(mt, function (q) { return q.qG; }, "kN/m²", Math.min(W, 520)) + '</div>';
      h += '<div class="dwgt">Required bottom steel, larger direction (mm²/m)</div><div class="tw">' + MAT.heat(mt, function (q) { return Math.max(q.req.bx, q.req.by); }, "mm²/m", Math.min(W, 520)) + '</div>';
      h += '<div class="dwgt">Required top steel, larger direction (mm²/m)</div><div class="tw">' + MAT.heat(mt, function (q) { return Math.max(q.req.tx, q.req.ty); }, "mm²/m", Math.min(W, 520)) + '</div>';
      h += dchk(mt.checks, mt.msg);
      h += tbl(["Service set", "FE q max", "Rigid q max", "q min", "Allowable", "Lift-off"], mt.svc.map(function (r) { return [esc(r.name), f(r.qmax, 1), f(r.rig.max, 1), f(r.qmin === Infinity ? 0 : r.qmin, 1), f(r.lim, 0), f(100 * r.lift, 1) + " %"]; }));
      h += tbl(["Column", "Type", "Vu kN", "Mx / My kNm", "b0 mm", "d mm", "τv shear + moment", "ks·0.25√fck", ""], mt.pun.slice().sort(function (a, b) { return b.u - a.u; }).map(function (q) { return [esc(q.name), q.type, f(q.Vu, 0), f(q.Mx || 0, 0) + " / " + f(q.My || 0, 0), f(q.b0, 0), f(q.d, 0), f(q.tvV || q.tv, 3) + " + " + f(q.tvM || 0, 3) + " = " + f(q.tv, 3), f(q.kc, 3), okc(q.ok)]; }));
      var M0 = mt.mesh;
      h += tbl(["Layer", "Base mesh", "As mm²/m", "d mm"], [["Bottom X", M0.bx.dia + "φ@" + M0.bx.s, f(M0.bx.As, 0), f(mt.d.bx, 0)], ["Bottom Y", M0.by.dia + "φ@" + M0.by.s, f(M0.by.As, 0), f(mt.d.by, 0)], ["Top X", M0.tx.dia + "φ@" + M0.tx.s, f(M0.tx.As, 0), f(mt.d.tx, 0)], ["Top Y", M0.ty.dia + "φ@" + M0.ty.s, f(M0.ty.As, 0), f(mt.d.ty, 0)]]);
      if (mt.zones.length) h += tbl(["Mark", "Face / dir", "Zone x (m)", "Zone y (m)", "Extra bars", "Req. As", "Prov. As"], mt.zones.map(function (z) { return [z.mark, z.face + " " + z.dir, f(z.x0, 2) + " – " + f(z.x1, 2), f(z.y0, 2) + " – " + f(z.y1, 2), z.dia + "φ@" + z.s, f(z.req, 0), f(z.As, 0)]; }));
      h += '<div class="note">Minimum steel 0.12 % of the section in each direction, half to each face (IS 456 cl 26.5.2.1); spacing ≤ min(3d, 300) (cl 26.3.3). The base mesh covers 75 % of the area; extra bars go between the mesh bars where the Wood–Armer moments or one-way shear (τc raised by more steel) need them, extended Ld beyond the zone. Punching at d/2 includes the unbalanced column moment: the fraction 1 − 1/(1 + ⅔√(a1/b1)) is carried by shear varying linearly about the centroid of the critical section (IS 456 cl 31.6.2.2, 31.3.3); moments are taken about that centroid, conservatively adding Vu × its offset at edge and corner columns. Settlements from springs are indicative: confirm with a settlement analysis (IS 8009). Chairs for the top mesh are not scheduled.</div>' + bbs(mt.bars, 1);
    } else if (kind === "f") {
      var Gf = dt.gF[i], ft = Gf.rep; dws = DT.drawFoot(ft, cf);
      h += '<div class="note">' + esc(Gf.list.map(function (q) { return q.name; }).join(", ")) + ' · SBC ' + ft.q + ' kN/m² (seismic ×' + ft.incr + ') · governing ' + esc(ft.gov.set.name) + ' · factored qu ' + f(ft.qu, 1) + ' kN/m² (' + esc(ft.gq) + ')</div>' + svgs(dws, Math.min(W, 420));
      h += dchk(ft.checks, ft.warn || []) + bbs(ft.bars, Gf.n);
    }
    $("dtView").innerHTML = h;
  }
  function svgs(dws, W, H) { return dws.map(function (d, j) { return '<div class="dwgt">' + esc(d.title || "") + '</div><div class="tw">' + DT.svg(d, j ? { maxW: Math.min(W, 260), ppm: 0.55 } : { maxW: W, maxH: H, minW: d.it.length > 200 && !H ? Math.min(900, W * 1.8) : 0 }) + '</div>'; }).join(""); }
  function dchk(c, msg) {
    /* one row per check type: the worst (first failing) instance, with how many spans/storeys it covers */
    var by = {}, ord = [];
    c.forEach(function (q) { if (!by[q.t]) { by[q.t] = { q: q, n: 0, bad: 0 }; ord.push(q.t); } var g = by[q.t]; g.n++; if (!q.ok) { if (!g.bad) g.q = q; g.bad++; } });
    c = ord.map(function (t) { var g = by[t], q = Object.assign({}, g.q); if (g.n > 1) { if (g.bad) q.t += " — fails in " + g.bad + " of " + g.n; else { q.t += " — all " + g.n; delete q.sp; delete q.st; } } return q; });
    var h = c.length ? tbl(["Check", "Value", "Reference", ""], c.map(function (q) { return [esc(q.t) + (q.sp !== undefined ? " (span " + (q.sp + 1) + ")" : q.st !== undefined ? " (storey " + (q.st + 1) + ")" : ""), esc(q.v), esc(q.cl || ""), okc(q.ok)]; })) : "";
    if (msg && msg.length) h += '<div class="note">' + msg.map(esc).join("<br>") + '</div>';
    return h;
  }
  function seismicBlock() {
    var se = S.se, h = "", m = S.m;
    if (se.md) {
      var md = se.md, cx = 0, cy = 0, cr = 0;
      h += '<h4>Modal analysis (' + md.modes.length + ' modes, subspace iteration ' + (md.conv ? 'converged in ' + md.iter + ' iterations' : 'NOT converged') + ')</h4>' +
        tbl(["Mode", "T (s)", "f (Hz)", "Type", "Mass X %", "Mass Y %", "Torsion %", "Σ X %", "Σ Y %"], md.modes.map(function (mo) { cx += mo.pct[0]; cy += mo.pct[1] || 0; return [mo.k, f(mo.T, 3), f(mo.f, 2), mo.kind, f(mo.pct[0] * 100, 1), m.twoD ? "—" : f(mo.pct[1] * 100, 1), m.twoD ? "—" : f(mo.pctR * 100, 1), f(cx * 100, 1), m.twoD ? "—" : f(cy * 100, 1)]; }));
      var first2 = md.modes.slice(0, 2).map(function (mo) { return mo.kind; });
      if (!m.twoD) h += '<div class="note">First two modes: ' + first2.join(", ") + (first2.indexOf("Torsion") >= 0 ? ' — <b>a torsional mode is among the first two</b>; IS 1893 Table 5 (i) requires the configuration to be revised so that the first two modes are translational where torsional irregularity exists.' : ' — translational (preferred).') + ' Tap a mode in the viewer list to see its shape.</div>';
      h += '<h4>Response spectrum analysis (cl 7.7, ' + (se.rs[0].meth === "cqc" ? "CQC, ζ = 5 %" : "SRSS") + ')</h4>' +
        tbl(["Direction", "Vb modal (kN)", "Missing mass", "Vb dynamic (kN)", "Vb static (kN)", "Scale factor", "Σ mass in modes", "Displacements"], Object.keys(se.rs).map(function (d) { var r = se.rs[d], ca = r.cumAll !== undefined ? r.cumAll : r.cum; return ["RS" + (+d ? "Y" : "X"), f(r.VbModal !== undefined ? r.VbModal : r.Vb, 1), r.mmc ? f(r.mmc.pct * 100, 1) + " % → " + f(r.mmc.V, 1) + " kN" + (r.mmc.rigid ? " (" + r.mmc.rigid + " modes > 33 Hz)" : "") : "off", f(r.Vb, 1), f(r.VbS, 1), f(r.scale, 3), '<span class="' + (ca >= 0.9 ? "okt" : "not") + '">' + f(ca * 100, 1) + ' %</span>', r.sD > 1 ? "scaled" : "unscaled"]; })) +
        (se.rs[0] && se.rs[0].mmc ? '<div class="note">Missing-mass correction (IS 1893 cl 7.7.5.2): the mass not carried by the modes below 33 Hz is loaded statically with the zero-period acceleration A0 = Z/2 · (Sa/g at T = 0) / (R/I) = ' + f(se.rs[0].mmc.A0, 4) + ' g; its response is added to the CQC/SRSS modal response by SRSS before scaling to the static base shear.</div>' : '') +
        '<div class="note">Ak = (Z/2)(Sa/g)/(R/I) for each mode; modal responses combined by ' + (se.rs[0].meth === "cqc" ? "CQC (cl 7.7.5.4)" : "SRSS") + '. When the dynamic base shear is below the static Vb (Ta formula), member forces are scaled up by Vb/VBd (cl 7.7.3); ' + (S.p.rsScaleDisp ? "displacements are scaled as well." : "displacements are not scaled (Amendment 2, cl 7.7.3.2).") + (S.p.accTor && !m.twoD ? " Accidental torsion torques are added as absolute responses." : "") + (S.p.ortho ? " Orthogonal effects: 100 % + 30 % of the other direction." : "") + ' Response-spectrum combinations are added to the design: ' + S.cb.filter(function (c) { return c.rs; }).map(function (c) { return c.name; }).join(", ") + '.</div>';
    }
    if (!m.twoD && se.floors && se.floors.length && se.floors[0].cr) {
      h += '<h4>Centre of mass, centre of rigidity and design eccentricity (cl 7.8.2)</h4>' + tbl(["Floor z (m)", "W (kN)", "CM x, y (m)", "CR x, y (m)", "esi x, y (m)", "b x, y (m)"], se.floors.map(function (fl) { return [f(fl.z, 2), f(fl.W, 0), f(fl.cm.x, 2) + ", " + f(fl.cm.y, 2), fl.cr ? f(fl.cr.x, 2) + ", " + f(fl.cr.y, 2) : "-", f(fl.esx || 0, 3) + ", " + f(fl.esy || 0, 3), f(fl.bx, 2) + ", " + f(fl.by, 2)]; }));
      if (S.L.tor) h += '<div class="note">Static method: torques Qi·(0.5esi + 0.05bi) and Qi·(−0.05bi) are applied as load cases TXa/TXb, TYa/TYb and combined with EQX/EQY, so the design eccentricities 1.5esi + 0.05bi and esi − 0.05bi are covered (the 3D model already carries esi).</div>';
    }
    if (se.tc && se.tc.length) h += '<h4>Torsional irregularity — IS 1893 Table 5 (i)</h4>' + tbl(["Floor z", "Dir", "Δmax/Δave", "Amendment 2 (2020)", "Δmax/Δmin", "2016 as published"], se.tc.map(function (r) { return [f(r.z, 2), r.dir, f(r.ave, 3), r.amd2, isFinite(r.min) ? f(r.min, 2) : "∞", r.orig]; })) +
      '<div class="note">Δ = lateral displacement of the floor extremes under the equivalent static load including accidental eccentricity. The thresholds differ between IS 1893 (Part 1):2016 as published (Δmax/Δmin: 1.5, 2.0) and Amendment 2 (Δmax/Δave: 1.2, 1.4) — apply the edition in force.</div>';
    if (se.irr && se.irr.length) h += '<h4>Vertical irregularity — IS 1893:2016 Table 6</h4>' + tbl(["Dir", "Floor z", "W (kN)", "Storey shear (kN)", "Storey stiffness (kN/m)", "k / k above", "Soft storey", "W / W below", "Mass irregular"], se.irr.map(function (r) { return [r.dir, f(r.z, 2), f(r.W, 0), f(r.V, 1), isFinite(r.k) ? f(r.k, 0) : "∞", r.kr === null ? "—" : f(r.kr, 2), r.kr === null ? "—" : (r.soft ? '<span class="not">yes</span>' : '<span class="okt">no</span>'), r.wr === null ? "—" : f(r.wr, 2), r.wr === null ? "—" : (r.mass ? '<span class="not">yes</span>' : '<span class="okt">no</span>')]; })) +
      '<div class="note">Storey stiffness = storey shear ÷ inter-storey drift at the centre of mass (static EQ). IS 1893:2016 Table 6: soft storey if lateral stiffness is less than that of the storey above; mass irregularity if seismic weight exceeds 150 % of the floor below. In Zones III–V such buildings need dynamic analysis (Amendment 2).</div>';
    return h;
  }
  function basisBlock() {
    var d = S.des, has = function (g) { g = g.replace(/RCC beams/, "beams"); return /Loads|Serviceability/.test(g) || (/Dynamic/.test(g) && S.se && S.se.md) || (/beams/.test(g) && d.beams.length) || (/columns/.test(g) && d.cols.length) || (/Slabs/.test(g) && (d.slabs.length || d.walls.length)) || (/steel/.test(g) && d.steel.length); };
    var W = S.p.method === "wsm";
    var h = '<h4>Design basis — ' + (W ? 'working stress method' : 'limit state method') + ': equations and IS code limits used</h4>' + CALC.basisHtml(esc, has, W);
    h += '<h4>Worked calculations — most critical member of each type</h4>';
    CALC.critical(d).forEach(function (c) {
      var r = c[1], nm = c[0] === "slab" || c[0] === "wall" ? cap(c[0]) + " element S" + (r.k + 1) : cap(c[0]) + " F" + (r.k + 1) + " (" + r.name + ")";
      h += '<details class="calc" open><summary>' + esc(nm) + ' — ' + (r.ok ? '<span class="okt">OK</span>' : '<span class="not">FAIL</span>') + '</summary>' + CALC.html(CALC.stepsFor(c[0], r, S.m, S.p), esc) + '</details>';
    });
    if (typeof REG !== "undefined") h += REG.html(esc);
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
    try { load(); UV.src = "dxf"; UV.roles = {}; save(); S.dx = DXF.parse(text); S.dxName = name; if (typeof PDB !== "undefined") PDB.setDxf(name, text); var a = document.getElementById("app");
      if (!$("srcbox")) return; a.querySelector("[data-k=src]").value = "dxf"; $("srcbox").innerHTML = srcInner(); bindSrc(); $("p1").classList.add("open"); toast("DXF loaded: " + S.dx.ents.length + " entities"); } catch (e) { err(e); }
  }
  function ctx() { return { download: download, toast: toast, rerender: renderResults, S: function () { return S; }, params: function () { return params(); }, opened: function (p) { load(); } }; }
  return { nodeXY: function (k) { var cv = $("cv"); if (!PRJ || !cv) return null; var q = PRJ.P(k), r = cv.getBoundingClientRect(); return [r.left + q[0], r.top + q[1]]; }, state: function () { return S; }, analyseThen: function (t) { afterRun = t; runLinear(); }, bindBoq: function (rr) { if (typeof PRO !== "undefined") PRO.bindBoq({ S: function () { return S; }, rerender: rr, toast: toast, params: params }); }, view: view, S: S, openText: openText, ctx: ctx, download: function (n, t) { download(n, t); }, toast: function (t) { toast(t); } };
})();
