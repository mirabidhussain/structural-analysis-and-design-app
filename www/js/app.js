/* UI: module registry, forms, report rendering, routing, storage, print/share. */
(function () {
  var fy = { type: "select", opts: [["250", "Fe 250"], ["415", "Fe 415"], ["500", "Fe 500"], ["550", "Fe 550"]], def: "500", label: "Steel grade fy", unit: "N/mm²", num: true };
  var fck = { type: "select", opts: [["15", "M15"], ["20", "M20"], ["25", "M25"], ["30", "M30"], ["35", "M35"], ["40", "M40"]], def: "20", label: "Concrete grade fck", unit: "N/mm²", num: true };
  function n(label, def, unit, help) { return { type: "number", label: label, def: def, unit: unit || "", help: help || "" }; }
  var meth = { type: "select", label: "Design method", opts: [["lsm", "Limit state method (default)"], ["wsm", "Working stress method (Annex B)"]], def: "lsm", help: "Loads: factored for LSM, working (service) for WSM" };
  function by(l, w) { return function (p) { return p.method === "wsm" ? w(p) : l(p); }; }
  function sel(label, opts, def, num) { return { type: "select", label: label, opts: opts, def: def, num: !!num }; }
  var supp = sel("Support condition", [["ss", "Simply supported"], ["cont", "Continuous"], ["cant", "Cantilever"]], "ss");
  var isa = [["auto", "Auto-select lightest"]].concat(D.ISA.map(function (a) { return [a.name, a.name]; }));
  var ismb = [["auto", "Auto-select lightest"]].concat(D.ISMB.map(function (a) { return [a.name, a.name]; }));
  var places = Object.keys(D.vb).filter(function (k) { return k !== "Custom"; }).map(function (k) { return [k, k + " (" + D.vb[k] + " m/s)"]; }).concat([["Custom", "Custom - enter below"]]);

  var M = [
    { id: "beam", grp: "RCC", icon: "━", t: "RCC Beam", d: "Flexure, shear, deflection, Ld", code: "IS 456", fn: by(RCC.beam, WS.beam), f: {
      method: meth, b: n("Width b", 230, "mm"), D: n("Overall depth D", 450, "mm"), cover: n("Clear cover", 25, "mm"), stir: n("Stirrup dia", 8, "mm"), dia: n("Main bar dia (for d)", 16, "mm"),
      L: n("Effective span L", 5, "m"), support: supp, mode: sel("Design forces", [["load", "From factored UDL"], ["direct", "Enter Mu, Vu"]], "load"),
      wu: n("Design UDL w", 30, "kN/m", "LSM: factored 1.5(DL+LL) · WSM: working DL+LL"), Mu: n("M (if direct)", 100, "kNm", "factored (LSM) / working (WSM)"), Vu: n("V (if direct)", 80, "kN"), fck: fck, fy: fy } },
    { id: "slab1", grp: "RCC", icon: "▭", t: "One-way Slab", d: "ly/lx > 2, cantilever, continuous", code: "IS 456", fn: by(RCC.slab1, WS.slab1), f: {
      method: meth, L: n("Effective span", 3.0, "m"), D: n("Thickness D", 150, "mm"), cover: n("Clear cover", 20, "mm"), dia: n("Bar dia", 10, "mm"),
      LL: n("Live load", 3, "kN/m²", "IS 875 Pt 2: office 2.5-4"), FF: n("Floor finish", 1, "kN/m²"), support: supp, fck: fck, fy: fy } },
    { id: "slab2", grp: "RCC", icon: "▦", t: "Two-way Slab", d: "Table 26/27 coefficients, 10 edge cases", code: "IS 456 Annex D", fn: by(RCC.slab2, WS.slab2), f: {
      method: meth, lx: n("Short span lx", 4, "m"), ly: n("Long span ly", 5, "m"), case_: sel("Edge condition", D.T26.map(function (c, i) { return [String(i + 1), c.name]; }), "4", true),
      D: n("Thickness D", 150, "mm"), cover: n("Clear cover", 20, "mm"), dia: n("Bar dia", 10, "mm"), LL: n("Live load", 3, "kN/m²"), FF: n("Floor finish", 1, "kN/m²"), fck: fck, fy: fy } },
    { id: "column", grp: "RCC", icon: "┃", t: "RCC Column", d: "Axial + biaxial bending, slender", code: "IS 456 cl 39", fn: by(RCC.column, WS.column), f: {
      method: meth, b: n("Width b", 300, "mm"), D: n("Depth D", 450, "mm"), L: n("Unsupported length", 3, "m"), lex: n("Effective length lex", 3, "m"), ley: n("Effective length ley", 3, "m"),
      Pu: n("Axial load P", 1500, "kN", "factored (LSM) / working (WSM)"), Mux: n("Mx", 60, "kNm"), Muy: n("My", 30, "kNm"), cover: n("Clear cover", 40, "mm"), tie: n("Tie dia", 8, "mm"),
      dia: sel("Main bar dia", [["12", "12 mm"], ["16", "16 mm"], ["20", "20 mm"], ["25", "25 mm"], ["32", "32 mm"]], "16", true),
      arr: sel("Bar arrangement", [["four", "Equal on four faces"], ["two", "Two faces (parallel to b)"]], "four"), pmax: n("Max steel %", 4, "%"), fck: fck, fy: fy } },
    { id: "footing", grp: "RCC", icon: "⬛", t: "Isolated Footing", d: "Size, bending, one-way & punching shear", code: "IS 456 cl 34", fn: RCC.footing, f: {
      P: n("Service axial load P", 1000, "kN"), Mx: n("Service moment (long dir)", 0, "kNm"), sbc: n("Safe bearing capacity", 150, "kN/m²"), sw: n("Self wt + backfill", 10, "% of P"),
      cb: n("Column width b", 300, "mm"), cd: n("Column depth D", 450, "mm"), shape: sel("Shape", [["rect", "Rectangular (equal projections)"], ["sq", "Square"]], "rect"),
      cover: n("Clear cover", 50, "mm"), dia: n("Bar dia", 12, "mm"), fck: fck, fy: fy } },
    { id: "pile", grp: "Fdn", icon: "⦿", t: "Pile Foundation", d: "Pile capacity, groups, caps, pile bars, drawings, BOQ", code: "IS 2911 / IS 456", fn: FD.pile, f: {
      cols: { type: "text", label: "Columns: mark, x (m), y (m), P (kN), Mx, My (kNm), Hx, Hy (kN) — service loads, one per line", def: "C1, 0, 0, 1800, 40, 30, 35, 25\nC2, 6, 0, 2600, 20, 60, 40, 30\nC3, 0, 5, 2200, 50, 20, 30, 35\nC4, 6, 5, 3200, 30, 40, 45, 40" },
      cb: n("Column size along X", 450, "mm"), cd: n("Column size along Y", 450, "mm"),
      ptype: sel("Pile type", [["bored", "Bored cast-in-situ (IS 2911 Pt 1/Sec 2)"], ["driven", "Driven cast-in-situ (IS 2911 Pt 1/Sec 1)"]], "bored"),
      Dp: n("Pile diameter", 500, "mm"), Lp: n("Pile length below the cut-off", 15, "m"), zc: n("Cut-off level below ground", 1.5, "m"),
      soil: { type: "text", label: "Soil layers from the bore log, top down: type (clay / sand), thickness m, c (kPa) or φ (°), effective unit weight γ' kN/m³", def: "clay, 4, 35, 8\nsand, 6, 30, 9\nsand, 10, 34, 10", help: "γ' = submerged weight below the water table. The last layer continues below the pile toe." },
      Qg: n("Safe pile capacity from a load test (0 = use the soil layers)", 0, "kN", "IS 2911 Pt 4 — governs when entered"), Qupg: n("Safe uplift capacity from a test (0 = static formula)", 0, "kN"),
      K: n("Earth pressure coefficient K (0 = 1.0 bored / 1.5 driven)", 0, ""), fos: n("Factor of safety", 2.5, "", "IS 2911 Annex B minimum 2.5"),
      nh: n("Modulus ηh for sand (0 = from φ, submerged, IS 2911 Table 3)", 0, "kN/m³"), head: sel("Pile head", [["fixed", "Fixed — groups under a rigid cap / tie beams"], ["free", "Free"]], "fixed"), ylim: n("Lateral deflection limit at the cut-off", 5, "mm"),
      seis: sel("Allowable load increase for seismic loads", [["0", "None (gravity loads)"], ["25", "25 % (IS 1893 Table 1)"], ["50", "50 % (piles on rock / hard soil)"]], "0", true),
      nsf: n("Negative skin friction per pile", 0, "kN"), sp: n("Pile spacing", 3, "× D", "IS 2911: ≥ 3D friction piles, 2.5D end-bearing"), edge: n("Clear edge distance beyond the piles", 150, "mm", "IS 2911 cl 6.12.5: ≥ 150"),
      capT: n("Cap thickness (0 = smallest that passes)", 0, "mm"), pcov: n("Cover to pile bars", 75, "mm", "IS 2911: ≥ 50"), lf: n("Load factor for design", 1.5, ""),
      zone: sel("Seismic zone (confinement links at the pile top)", [["2", "II"], ["3", "III"], ["4", "IV"], ["5", "V"]], "4", true), fck: fck, fy: fy } },
    { id: "raft", grp: "Fdn", icon: "▭", t: "Raft Foundation", d: "Plate on soil springs, punching, mesh + extra bars, drawings, BOQ", code: "IS 2950 / IS 456", fn: FD.raft, f: {
      cols: { type: "text", label: "Columns: mark, x (m), y (m), P dead (kN), P live (kN), Mx, My (kNm) — one per line", def: "C1, 0, 0, 600, 200, 0, 0\nC2, 5, 0, 900, 300, 0, 0\nC3, 10, 0, 600, 200, 0, 0\nC4, 0, 5, 900, 300, 0, 0\nC5, 5, 5, 1300, 450, 0, 0\nC6, 10, 5, 900, 300, 0, 0" },
      cb: n("Column size along X", 450, "mm"), cd: n("Column size along Y", 450, "mm"), sbc: n("Safe bearing capacity (net)", 200, "kN/m²"), ks: n("Modulus of subgrade reaction ks (0 = 120 × SBC)", 0, "kN/m³"),
      Df: n("Founding depth", 1.5, "m"), matT: n("Raft thickness (0 = smallest that passes)", 0, "mm"), matOff: n("Projection beyond the outer column faces", 0.5, "m"),
      setLim: n("Permissible settlement", 75, "mm", "IS 1904: raft on sand 75, clay 100"), matMesh: n("Mesh size", 0.5, "m"), lf: n("Load factor", 1.5, ""), fck: fck, fy: fy } },
    { id: "strip", grp: "RCC", icon: "▁", t: "Strip / Wall Footing", d: "Under masonry walls", code: "IS 456 cl 34", fn: RCC.strip, f: {
      w: n("Wall load (service)", 150, "kN/m"), sbc: n("Safe bearing capacity", 150, "kN/m²"), sw: n("Self wt + backfill", 10, "% of w"), tw: n("Wall / block width", 350, "mm"),
      Bmin: n("Minimum width (optional)", 0, "m", "e.g. 0.76 m for 2'-6\""), Dmin: n("Minimum depth (optional)", 0, "mm"), cover: n("Clear cover", 50, "mm"), dia: n("Bar dia", 8, "mm"), fck: fck, fy: fy } },
    { id: "stair", grp: "RCC", icon: "↗", t: "Staircase", d: "Dog-legged / waist slab", code: "IS 456 cl 33", fn: RCC.stair, f: {
      R: n("Riser", 150, "mm"), T: n("Tread", 250, "mm"), t: n("Waist thickness", 175, "mm"), L: n("Effective horizontal span", 3.5, "m"), LL: n("Live load", 3, "kN/m²", "3 residential, 5 public"),
      FF: n("Finishes", 1, "kN/m²"), support: sel("End condition", [["ss", "Simply supported"], ["cont", "Continuous / monolithic"]], "ss"), cover: n("Clear cover", 20, "mm"), dia: n("Bar dia", 10, "mm"), fck: fck, fy: fy } },

    { id: "truss", grp: "Steel", icon: "△", t: "Roof Truss", d: "Geometry, IS 875 loads, analysis & design", code: "IS 800 / 875", fn: TR.design, f: {
      type: sel("Truss type", [["pratt", "Pratt"], ["howe", "Howe"], ["fink", "Fink (W, 4 panels)"]], "pratt"), span: n("Span (c/c bearing)", 9.65, "m"), slope: n("Roof slope", 30, "deg"),
      n: n("Panels per half (Pratt/Howe)", 3, ""), spacing: n("Truss spacing", 2.4, "m"), sheet: n("Sheeting + fixings", 0.08, "kN/m²", "0.5 mm CGI ≈ 0.05-0.08"),
      purl: n("Purlins (on slope)", 0.06, "kN/m²"), s0: n("Ground snow load s0", 1.5, "kN/m²", "Kashmir valley 1.5-2.5; confirm locally"),
      vb: sel("Basic wind speed (place)", places, "Srinagar"), vbc: n("Custom Vb (if Custom)", 39, "m/s"), k1: n("k1 (risk coefficient)", 1.0, ""), terrain: sel("Terrain category", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]], "2", true),
      h: n("Height to ridge", 10, "m"), hw: n("h/w of building", 0.5, ""), cpi: n("Cpi (±)", 0.2, "", "0.2 normal, 0.5 large openings"),
      purlinSp: n("Purlin spacing (top chord restraint)", 1.0, "m"), bracing: n("Bottom chord bracing spacing", 3.2, "m"), gusset: n("Gusset thickness", 8, "mm"), webMin: n("Min web angle leg", 50, "mm"),
      fy: sel("Steel fy", [["250", "E250"], ["350", "E350"]], "250", true), fu: n("Steel fu", 410, "N/mm²") } },
    { id: "purlin", grp: "Steel", icon: "═", t: "Purlin", d: "Angle / channel, biaxial bending", code: "IS 800 cl 8, 9", fn: ST.purlin, f: {
      span: n("Purlin span (truss spacing)", 2.4, "m"), sp: n("Purlin spacing on slope", 1.0, "m"), slope: n("Roof slope", 30, "deg"), DL: n("Sheeting DL (on slope)", 0.10, "kN/m²"),
      LL: n("Imposed / snow load (plan)", 0.75, "kN/m²"), WL: n("Wind pressure (inward)", 0.5, "kN/m²"), WLup: n("Wind suction (uplift)", 1.0, "kN/m²"),
      kind: sel("Section type", [["angle", "Angle (ISA)"], ["channel", "Channel (ISMC)"]], "angle"), sag: sel("Sag rods at mid-span", [["", "No"], ["1", "Yes"]], ""), fy: sel("Steel fy", [["250", "E250"], ["350", "E350"]], "250", true) } },
    { id: "tension", grp: "Steel", icon: "↔", t: "Tension Member", d: "Yield, rupture, block shear", code: "IS 800 Sec 6", fn: ST.tension, f: {
      Tu: n("Factored tension Tu", 150, "kN"), sec: sel("Angle section", isa, "auto"), n: sel("Arrangement", [["1", "Single angle"], ["2", "Double angle back-to-back"]], "1", true),
      L: n("Length", 2.5, "m"), conn: sel("End connection", [["bolt", "Bolted (one leg)"], ["weld", "Welded"]], "bolt"), db: n("Bolt dia", 16, "mm"), bgrade: sel("Bolt grade", [["4.6", "4.6"], ["8.8", "8.8"]], "4.6"),
      nb: n("Bolts in line", 6, ""), pitch: n("Pitch", 50, "mm"), e: n("End distance", 30, "mm"), g: n("Gauge (heel to bolt line)", 35, "mm"), Lw: n("Weld length (if welded)", 150, "mm"),
      tg: n("Gusset thickness", 8, "mm"), gap: n("Gap between angles", 8, "mm"), lmax: n("Max L/r", 400, ""), fy: n("fy", 250, "N/mm²"), fu: n("fu", 410, "N/mm²") } },
    { id: "comp", grp: "Steel", icon: "↕", t: "Compression Member", d: "Struts & columns, buckling curves", code: "IS 800 Sec 7", fn: ST.compression, f: {
      Pu: n("Factored axial load Pu", 200, "kN"), type: sel("Member type", [["sa", "Single angle (cl 7.5.1.2)"], ["da", "Double angle back-to-back"], ["mb", "ISMB column"], ["mc", "ISMC"]], "da"),
      sec: sel("Section (or auto)", [["auto", "Auto-select lightest"]].concat(D.ISA.concat(D.ISMB, D.ISMC).map(function (a) { return [a.name, a.name]; })), "auto"),
      L: n("Length", 2.5, "m"), Ly: n("Length about minor axis (ISMB)", 0, "m", "0 = same as L"), K: n("Effective length factor K", 0.85, "", "Table 11"),
      endc: sel("Single angle end condition", [["fixed2", "≥ 2 bolts / welded, fixed"], ["hinged2", "≥ 2 bolts, hinged"], ["fixed1", "1 bolt, fixed"], ["hinged1", "1 bolt, hinged"]], "fixed2"),
      gap: n("Gap (double angles)", 8, "mm"), lmax: n("Max KL/r", 180, ""), fy: n("fy", 250, "N/mm²") } },
    { id: "sbeam", grp: "Steel", icon: "⌶", t: "Steel Beam", d: "ISMB, LTB, shear, deflection", code: "IS 800 Sec 8", fn: ST.beam, f: {
      sec: sel("Section", ismb, "auto"), L: n("Span", 6, "m"), support: sel("Support", [["ss", "Simply supported"], ["cant", "Cantilever"]], "ss"), wu: n("Factored UDL wu", 30, "kN/m"),
      Pu: n("Factored mid-span / tip point load", 0, "kN"), lat: sel("Compression flange", [["1", "Laterally supported"], ["", "Laterally unsupported"]], "1"), Lun: n("Unbraced length (if unsupported)", 6, "m"),
      destab: sel("Load on top flange (destabilising)", [["", "No"], ["1", "Yes"]], ""), dl: n("Deflection limit span /", 300, ""), fy: n("fy", 250, "N/mm²") } },
    { id: "bolts", grp: "Steel", icon: "⊙", t: "Bolts & Welds", d: "Bearing bolts, fillet welds", code: "IS 800 Sec 10", fn: ST.bolts, f: {
      Vu: n("Factored shear on bolt group", 120, "kN"), db: n("Bolt dia", 16, "mm"), grade: sel("Bolt grade", [["4.6", "4.6"], ["8.8", "8.8"], ["10.9", "10.9"]], "4.6"),
      nb: n("Number of bolts", 5, ""), nn: n("Shear planes through threads", 1, ""), ns: n("Shear planes through shank", 0, ""), t: n("Thinner plate thickness", 8, "mm"),
      fu: n("Plate fu", 410, "N/mm²"), pitch: n("Pitch", 50, "mm"), e: n("End distance", 30, "mm"), Fw: n("Force on weld", 120, "kN"), s: n("Weld size", 6, "mm"),
      Lw: n("Effective weld length", 160, "mm"), tw_thk: n("Thicker part joined", 8, "mm"), field: sel("Weld made", [["", "In shop"], ["1", "At site"]], "") } },

    { id: "roof", grp: "Loads", icon: "☁", t: "Roof Loads", d: "DL, LL, snow, wind", code: "IS 875 Pt 1-4", fn: LD.roofReport, f: {
      span: n("Truss span", 9.65, "m"), slope: n("Roof slope", 30, "deg"), sheet: n("Sheeting", 0.08, "kN/m²"), purl: n("Purlins", 0.06, "kN/m²"), extra: n("Other DL (ceiling etc.)", 0, "kN/m²"),
      s0: n("Ground snow load s0", 1.5, "kN/m²"), vb: sel("Basic wind speed", places, "Srinagar"), vbc: n("Custom Vb (if Custom)", 39, "m/s"), k1: n("k1", 1.0, ""), terrain: sel("Terrain category", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]], "2", true),
      h: n("Height", 10, "m"), k3: n("k3 (topography)", 1.0, ""), k4: n("k4 (cyclonic)", 1.0, ""), kd: n("Kd", 0.9, ""), ka: n("Ka", 1.0, ""), kc: n("Kc", 0.9, ""), hw: n("h/w", 0.5, ""), cpi: n("Cpi (±)", 0.2, "") } },
    { id: "seismic", grp: "Loads", icon: "≈", t: "Seismic Base Shear", d: "Equivalent static, storey forces", code: "IS 1893:2016", fn: LD.seismic, f: {
      zone: sel("Seismic zone", [["II", "II"], ["III", "III"], ["IV", "IV"], ["V", "V (Kashmir)"]], "V"), I: n("Importance factor I", 1.2, "", "1.5 critical, 1.2 public/office, 1.0 others"),
      R: n("Response reduction R", 5, "", "SMRF 5, OMRF 3"), soil: sel("Soil type", [["I", "I - Rock/hard"], ["II", "II - Medium"], ["III", "III - Soft"]], "II"),
      btype: sel("Building type (Ta)", [["rcmrf", "RC MRF without infill"], ["steel", "Steel MRF"], ["infill", "Other / with infill (0.09h/√d)"]], "rcmrf"),
      h: n("Height above base", 7, "m"), d: n("Base dimension along EQ", 10, "m"),
      floors: { type: "text", label: "Floors: name, weight kN, height m (one per line, bottom first)", def: "First floor, 1200, 3.5\nRoof, 900, 7.0" } } }
  ];

  var app = document.getElementById("app"), title = document.getElementById("title"), back = document.getElementById("back");
  function saveText(name, text) {
    if (window.AndroidBridge && AndroidBridge.saveFile) { AndroidBridge.saveFile(name, text); return; }
    var blob = new Blob([text], { type: "application/dxf" });
    if (window.claude && window.claude.use && window.self !== window.top) { Promise.resolve(window.claude.use("downloads")).then(function (dl) { if (!dl) throw 0; return dl.save({ filename: name, data: blob }); }).then(function () { toast("Saved " + name); }, function () { toast("Download not available here"); }); return; }
    try { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast("Saved " + name); } catch (e) { toast("Download not available here"); }
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("isd_" + k) || "null"); localStorage.setItem("isd_" + k, JSON.stringify(v)); } catch (e) { return null; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var GRP = { RCC: ["RCC design", "IS 456:2000 · IS 13920:2016"], Fdn: ["Foundations", "IS 2911 · IS 2950 · IS 456"], Steel: ["Steel design", "IS 800:2007"], Loads: ["Loads", "IS 875 · IS 1893"] }, homeFilter = "all";
  function home() {
    title.textContent = "IS StructDesign"; back.hidden = true;
    var h = '<section class="hero"><div class="hero-t"><span class="eyebrow">IS 456 · IS 800 · IS 875 · IS 1893 · IS 13920</span><h2>Analyse, design and detail buildings to Indian Standards</h2>' +
      '<p>Frame & shell FEA, seismic, mat foundations, bar bending schedules, drawings and estimates — all offline.</p><div class="hero-b"><a class="hbtn pri" href="#model">' + IC.svg("frame") + ' Frame & FE analysis</a><a class="hbtn" href="#projects">' + IC.svg("projects") + ' Projects</a></div></div>' +
      '<div class="hero-a">' + IC.hero() + '</div></section>';
    if (window.PDB) { var pr = PDB.current(), sm = pr.summary, nf = sm ? sm.memberFails + (sm.detailFails || 0) : 0;
      h += '<a class="card wide proj" href="#projects"><span class="ic">' + IC.svg("projects") + '</span><div class="pc"><b>' + esc(pr.name) + ' <small class="stchip">' + esc(pr.status) + '</small></b><small>Current project · ' + PDB.list().length + ' project(s) on this device' + (sm ? ' · last run ' + new Date(sm.date).toLocaleDateString() : ' · not analysed yet') + '</small>' +
        (sm ? '<div class="kpis"><span class="' + (nf ? "bad" : "good") + '">' + (nf ? nf + " checks fail" : "All checks pass") + '</span>' + (sm.cost ? '<span>₹ ' + Math.round(sm.cost).toLocaleString("en-IN") + '</span>' : '') + (sm.steel_t ? '<span>' + sm.steel_t.toFixed(1) + ' t steel</span>' : '') + '</div>' : '') + '</div>' + IC.svg("chev", "go") + '</a>'; }
    h += '<label class="search">' + IC.svg("search") + '<input id="q" type="search" placeholder="Search — beam, footing, truss, seismic…" autocomplete="off"></label>';
    h += '<div class="chips" id="fchips">' + [["all", "All"], ["RCC", "RCC"], ["Fdn", "Foundations"], ["Steel", "Steel"], ["Loads", "Loads"], ["Ref", "Reference"]].map(function (c) { return '<button type="button" data-g="' + c[0] + '"' + (homeFilter === c[0] ? ' class="on"' : '') + '>' + c[1] + '</button>'; }).join("") + '</div>';
    ["RCC", "Fdn", "Steel", "Loads"].forEach(function (g) {
      h += '<div class="gsec" data-g="' + g + '"><h2 class="grp"><span>' + GRP[g][0] + '</span><em>' + GRP[g][1] + '</em></h2><div class="grid">';
      M.filter(function (m) { return m.grp === g; }).forEach(function (m) {
        h += '<a class="card mod g-' + g.toLowerCase() + '" href="#' + m.id + '" data-s="' + esc((m.t + " " + m.d + " " + m.code).toLowerCase()) + '"><span class="ic">' + IC.svg(m.id) + '</span><b>' + m.t + '</b><small>' + m.d + '</small><em>' + m.code + '</em></a>';
      });
      h += '</div></div>';
    });
    h += '<div class="gsec" data-g="Ref"><h2 class="grp"><span>Reference</span><em>SP 6(1) · IS 456 tables</em></h2><div class="grid"><a class="card mod g-ref" href="#tables" data-s="section tables isa ismb ismc tau"><span class="ic">' + IC.svg("tables") + '</span><b>Section tables</b><small>ISA, ISMB, ISMC properties, τc</small><em>SP 6(1)</em></a>' +
      '<a class="card mod g-ref" href="#about" data-s="about scope codes register"><span class="ic">' + IC.svg("about") + '</span><b>About & scope</b><small>Codes, assumptions, limits</small><em>engine ' + (window.REG ? REG.ENGINE : "") + '</em></a></div></div>';
    h += '<p class="empty" id="nores" hidden>No module matches your search.</p>';
    app.innerHTML = h;
    var q = document.getElementById("q");
    function filt() {
      var t = q.value.trim().toLowerCase(), any = false;
      document.querySelectorAll(".gsec").forEach(function (sec) {
        var g = sec.getAttribute("data-g"), show = homeFilter === "all" || homeFilter === g, n = 0;
        sec.querySelectorAll(".card").forEach(function (c) { var ok = show && (!t || c.getAttribute("data-s").indexOf(t) >= 0); c.hidden = !ok; if (ok) n++; });
        sec.hidden = !n; if (n) any = true;
      });
      document.getElementById("nores").hidden = any;
    }
    q.oninput = filt;
    document.querySelectorAll("#fchips button").forEach(function (b) { b.onclick = function () { homeFilter = this.getAttribute("data-g"); document.querySelectorAll("#fchips button").forEach(function (x) { x.classList.toggle("on", x === b); }); filt(); }; });
    filt();
  }

  function moduleView(m) {
    title.textContent = m.t; back.hidden = false;
    var saved = store(m.id) || {}, h = '<div class="mhead g-' + m.grp.toLowerCase() + '"><span class="mic">' + IC.svg(m.id) + '</span><div><b>' + esc(m.t) + '</b><small>' + esc(m.d) + '</small></div><em class="cchip">' + m.code + '</em></div>' +
      '<form id="f" class="form" autocomplete="off"><div class="code">Inputs — leave a field blank to use the value shown in it</div>';
    Object.keys(m.f).forEach(function (k) {
      var f = m.f[k], v = saved[k] !== undefined && saved[k] !== "" ? saved[k] : (f.type === "select" ? f.def : "");
      h += '<label class="fld"><span>' + f.label + '</span>';
      if (f.type === "select") h += '<select name="' + k + '">' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === o[0] ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") + '</select>';
      else if (f.type === "text") h += '<textarea name="' + k + '" rows="4" placeholder="' + esc(f.def) + '">' + esc(v) + '</textarea>';
      else h += '<span class="inw"><input name="' + k + '" type="number" step="any" inputmode="decimal" placeholder="' + esc(f.def) + '" value="' + esc(v) + '">' + (f.unit ? '<em class="u">' + f.unit + '</em>' : '') + '</span>';
      if (f.help) h += '<small>' + f.help + '</small>';
      h += '</label>';
    });
    h += '<div class="btns sticky"><button type="submit" class="pri">' + IC.svg("play") + ' Calculate</button><button type="button" id="rst">Reset</button></div></form><div id="out"></div>';
    app.innerHTML = h;
    var form = document.getElementById("f");
    form.onsubmit = function (e) { e.preventDefault(); run(m, form); };
    document.getElementById("rst").onclick = function () { store(m.id, {}); moduleView(m); };
    if (saved.__ran) run(m, form, true);
  }

  function read(m, form) {
    var p = {}, raw = {}, defs = [];
    Object.keys(m.f).forEach(function (k) {
      var f = m.f[k], el = form.elements[k], v = String(el.value).trim(); raw[k] = v;
      if (f.type !== "select" && v === "") { v = String(f.def); defs.push(f.label.replace(/<[^>]+>/g, "") + (f.type === "number" ? " = " + f.def + (f.unit ? " " + f.unit : "") : "")); }
      if (f.type === "number") { var n = parseFloat(v); if (!isFinite(n)) { n = parseFloat(f.def); defs.push(f.label); } p[k] = n; }
      else if (f.type === "select") p[k] = f.num ? parseFloat(v) : v;
      else p[k] = v;
    });
    if (p.vb !== undefined) p.vb = p.vb === "Custom" ? p.vbc : D.vb[p.vb];
    if (m.id === "seismic") p.floors = String(p.floors).split(/\n/).map(function (l) { var a = l.split(","); return a.length >= 3 ? { name: a[0].trim(), w: parseFloat(a[1]), h: parseFloat(a[2]) } : null; }).filter(Boolean);
    if (m.id === "sbeam") { p.lat = !!p.lat; p.destab = !!p.destab; }
    if (m.id === "purlin") p.sag = !!p.sag;
    if (m.id === "comp" && !p.Ly) p.Ly = p.L;
    if (m.id === "slab2") p.case_ = parseInt(p.case_, 10);
    raw.__ran = true; store(m.id, raw);
    p.__defaults = defs;
    return p;
  }

  function run(m, form, quiet) {
    var out = document.getElementById("out"), r;
    try { r = m.fn(read(m, form)); } catch (err) { out.innerHTML = '<div class="err">Could not calculate: ' + esc(err.message) + '</div>'; return; }
    var pp = read(m, form);
    out.innerHTML = render(r);
    if (pp.__defaults.length) out.querySelector(".rh").insertAdjacentHTML("afterend", '<div class="note">Blank inputs taken at default: ' + esc(pp.__defaults.join(" · ")) + '</div>');
    var pdf = document.getElementById("pdf");
    if (!window.AndroidBridge && window.self !== window.top) pdf.hidden = true;   /* printing is blocked inside embedded viewers */
    pdf.onclick = function () { if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print(m.t); else window.print(); };
    document.getElementById("share").onclick = function () { share(r); };
    if (r.dxf) document.getElementById("dxf").onclick = function () { saveText(r.dxfName || (m.id + ".dxf"), r.dxf); };
    document.getElementById("xls").onclick = function () { toast("Preparing Excel…"); RX.save(RX.fromRep(r, m, read(m, form)), m.id + "-design.xlsx", function (ok) { if (!ok) toast("Excel export not available here"); }); };
    if (!quiet) out.scrollIntoView({ behavior: "smooth" });
  }

  function render(r) {
    var ok = r.ok(), h = '<section class="rep"><div class="rh"><div><h3>' + esc(r.title) + '</h3><small>' + esc(r.code) + ' • ' + new Date().toLocaleDateString("en-IN") + '</small></div><span class="badge ' + (ok ? "pass" : "fail") + '">' + (ok ? "ALL CHECKS PASS" : "CHECK FAILS") + '</span></div>';
    if (r.summary.length) h += '<div class="sum">' + r.summary.map(function (s) { return '<div><span>' + esc(s[0]) + '</span><b>' + esc(s[1]) + '</b></div>'; }).join("") + '</div>';
    if (r.svg) h += '<div class="svg">' + r.svg + '</div>';
    r.items.forEach(function (it) {
      if (it.k === "h") h += '<h4>' + esc(it.t) + '</h4>';
      else if (it.k === "r") h += '<div class="row"><span>' + esc(it.l) + (it.ref ? ' <i>' + esc(it.ref) + '</i>' : '') + '</span><b>' + esc(it.v) + ' ' + esc(it.u) + '</b></div>';
      else if (it.k === "e") h += '<div class="eq">' + esc(it.t) + (it.ref ? ' <i>[' + esc(it.ref) + ']</i>' : '') + '</div>';
      else if (it.k === "n") h += '<div class="note">' + esc(it.t) + '</div>';
      else if (it.k === "x") h += '<div class="err">' + esc(it.t) + '</div>';
      else if (it.k === "c") h += '<div class="chk ' + (it.c.ok ? "ok" : "no") + '"><span>' + (it.c.ok ? "✔" : "✘") + ' ' + esc(it.c.l) + (it.c.ref ? ' <i>' + esc(it.c.ref) + '</i>' : '') + '</span><b>' + esc(it.c.d) + '</b></div>';
      else if (it.k === "t") h += '<div class="tw"><table><tr>' + it.head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join("") + '</tr>' + it.rows.map(function (rw) { return '<tr>' + rw.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>';
    });
    h += '<div class="disc">Design aid based on IS codes — results must be checked and approved by a qualified structural engineer.</div>';
    h += '<div class="btns noprint"><button id="pdf" class="pri">Print / Save PDF</button><button id="xls">Excel (.xlsx)</button>' + (r.dxf ? '<button id="dxf">Drawings (.dxf)</button>' : '') + '<button id="share">Share</button></div></section>';
    return h;
  }

  function share(r) {
    var t = r.title + " (" + r.code + ")\n" + r.summary.map(function (s) { return s[0] + ": " + s[1]; }).join("\n") + "\nChecks: " + (r.ok() ? "all pass" : r.checks.filter(function (c) { return !c.ok; }).map(function (c) { return "FAIL " + c.l; }).join("; "));
    if (window.AndroidBridge && AndroidBridge.share) AndroidBridge.share(t);
    else if (navigator.share && window.self === window.top) navigator.share({ title: r.title, text: t }).catch(function () {});
    else {
      try { navigator.clipboard.writeText(t).then(function () { toast("Summary copied to clipboard"); }, function () { toast("Copy not allowed here"); }); }
      catch (e) { toast("Copy not allowed here"); }
    }
  }

  function toast(msg) {
    var d = document.createElement("div"); d.className = "toast"; d.textContent = msg; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2200);
  }
  function tables() {
    title.textContent = "Section tables"; back.hidden = false;
    function tb(head, rows) { return '<div class="tw"><table><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join("") + '</tr>' + rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + x + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>'; }
    var h = '<div class="rep"><h4>Equal angles (ISA)</h4>' + tb(["Section", "A cm²", "kg/m", "Cxx cm", "rxx cm", "rvv cm"], D.ISA.map(function (a) { return [a.name, a.A, a.m, a.C, a.rxx, a.rvv]; }));
    h += '<h4>Medium weight beams (ISMB)</h4>' + tb(["Section", "kg/m", "A cm²", "Ix cm⁴", "Iy cm⁴", "Zp cm³", "ry cm"], D.ISMB.map(function (a) { return [a.name, a.m, a.A, a.Ix, a.Iy, a.Zpx, a.ry]; }));
    h += '<h4>Channels (ISMC)</h4>' + tb(["Section", "kg/m", "A cm²", "Ix cm⁴", "Zex cm³", "Zey cm³"], D.ISMC.map(function (a) { return [a.name, a.m, a.A, a.Ix, a.Zex, a.Zey]; }));
    h += '<h4>IS 456 Table 19 — τc (N/mm²)</h4>' + tb(["pt %"].concat(Object.keys(D.T19).map(function (k) { return "M" + k; })), D.T19_pt.map(function (pt, i) { return [pt].concat(Object.keys(D.T19).map(function (k) { return D.T19[k][i]; })); }));
    h += '<div class="note">Section properties are rounded standard-table values; verify against SP 6(1) / IS 808 for final design.</div></div>';
    app.innerHTML = h;
  }

  function about() {
    title.textContent = "About & scope"; back.hidden = false;
    app.innerHTML = '<div class="rep"><h4>IS StructDesign — engine ' + (window.REG ? REG.ENGINE : "") + '</h4><p>Analysis, design, detailing and documentation of buildings to Indian Standards. Works offline; projects are stored on this device.</p>' +
      '<h4>What it does</h4><ul><li>Frame & shell FE analysis: linear static, P-Delta, modal and response spectrum (IS 1893:2016), accidental torsion, pushover</li>' +
      '<li>Design: IS 456 (limit state or working stress), IS 800, with worked calculations</li><li>Loads & durability: snow (IS 875 Pt 4), pattern imposed load, imposed-load reduction, covers for exposure and fire (IS 456 Table 16/16A)</li><li>Automatic design & detailing: storey-wise enlargement until every check passes</li>' +
      '<li>Detailing: IS 13920 beams, columns, joints, strong column–weak beam, shear walls, slabs, isolated footings; bar bending schedule (IS 2502)</li><li>Mat (raft) foundations: plate on compression-only soil springs, punching, one-way shear, flexure, settlement (IS 2950, IS 456, IS 1904)</li>' +
      '<li>Outputs: Excel with live formulas, calculation report (print/PDF), drawing set DXF, STAAD.Pro input, BOQ of the whole building priced with JKSOR 2022 (with contingencies, cess and GST) and reinforcement schedules</li>' +
      '<li>Projects: offline database with revisions, backups and an engineering verification mode with reviewer sign-off; engineering assistant</li><li>Standalone modules for beams, slabs, columns, footings, stairs, steel members, connections, trusses and loads</li></ul>' +
      '<h4>Not covered</h4><ul><li>Time-history analysis, combined footings, piled raft, beam-slab raft, consolidation settlement, full soil–structure interaction</li><li>Deflection and crack width in the frame design (use the beam and slab modules)</li><li>Full building wind pressure-coefficient workflow</li></ul>' +
      (window.REG ? REG.html(esc) : '') +
      '<h4>Important</h4><p>Results are for design assistance. Every design must be checked, and drawings signed, by a qualified structural engineer.</p></div>';
  }

  function route() {
    var id = (location.hash || "").replace(/^#\/?/, "");
    var m = M.filter(function (x) { return x.id === id; })[0];
    var ctx = window.SU ? SU.ctx() : null;
    if (m) moduleView(m); else if (id === "model" && window.SU) SU.view(app, title, back); else if (id === "projects" && window.PRO) PRO.projectsView(app, title, back, ctx); else if (id === "report" && window.RPT) RPT.view(app, title, back, ctx);
    else if (id === "tables") tables(); else if (id === "about") about(); else home();
    var tab = m ? "" : id === "model" ? "model" : id === "projects" ? "projects" : id === "report" ? "report" : id === "about" || id === "tables" ? "about" : id ? "" : "home";
    document.querySelectorAll(".tabbar a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-t") === tab); });
    window.scrollTo(0, 0);
  }
  back.onclick = function () { if (location.hash) location.hash = ""; };
  /* app chrome: logo, bottom tab bar, light / dark theme */
  var lg = document.getElementById("logo"); if (lg) lg.innerHTML = IC.logo(30);
  var tb = document.createElement("nav"); tb.className = "tabbar noprint";
  tb.innerHTML = [["home", "#", "home", "Home"], ["model", "#model", "frame", "Analysis"], ["projects", "#projects", "projects", "Projects"], ["report", "#report", "report", "Report"], ["about", "#about", "about", "About"]].map(function (t) { return '<a href="' + t[1] + '" data-t="' + t[0] + '">' + IC.svg(t[2]) + '<span>' + t[3] + '</span></a>'; }).join("");
  document.body.appendChild(tb);
  function theme(t) { try { if (t) localStorage.setItem("isd_theme", t); t = localStorage.getItem("isd_theme") || "auto"; } catch (e) { t = t || "auto"; } document.documentElement.setAttribute("data-theme", t); var b = document.getElementById("themeBtn"); if (b) b.innerHTML = IC.svg(t === "dark" ? "sun" : "moon"); }
  var thb = document.getElementById("themeBtn"); if (thb) thb.onclick = function () { var cur = document.documentElement.getAttribute("data-theme"), dark = cur === "dark" || (cur === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches); theme(dark ? "light" : "dark"); };
  theme();
  window.addEventListener("hashchange", route);
  window.ISD = { modules: M, route: route, store: store };
  if (window.PDB) PDB.init().then(route, route); else route();
})();
