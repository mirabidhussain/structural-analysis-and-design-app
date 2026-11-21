/* UI: module registry, forms, report rendering, routing, storage, print/share. */
(function () {
  var fy = { type: "select", opts: [["250", "Fe 250"], ["415", "Fe 415"], ["500", "Fe 500"], ["550", "Fe 550"]], def: "500", label: "Steel grade fy", unit: "N/mm²", num: true };
  var fck = { type: "select", opts: [["15", "M15"], ["20", "M20"], ["25", "M25"], ["30", "M30"], ["35", "M35"], ["40", "M40"]], def: "20", label: "Concrete grade fck", unit: "N/mm²", num: true };
  function n(label, def, unit, help) { return { type: "number", label: label, def: def, unit: unit || "", help: help || "" }; }
  var fck25 = Object.assign({}, fck, { def: "25" });
  function bar(label, def, set, pre) { return { type: "select", label: label, opts: LIM.BARS[set].map(function (d) { return [String(d), (pre || "") + d + " mm"]; }), def: String(def), num: true, unit: "mm" }; }
  function expo(def) { return { type: "select", label: "Exposure condition", opts: LIM.EXPO_OPTS, def: def, help: "IS 456 Table 3 — sets the minimum cover (Table 16) and grade (Table 5)" }; }
  var DUN = { type: "select", label: "DXF drawing units", opts: [["auto", "Auto (from the file)"], ["mm", "Millimetres"], ["cm", "Centimetres"], ["m", "Metres"], ["ft", "Feet"], ["in", "Inches"]], def: "auto" };
  function dxfF(label, fill, help) { return { type: "dxf", label: label, fill: fill, help: help, def: "" }; }
  var meth = { type: "select", label: "Design method", opts: [["lsm", "Limit state method (default)"], ["wsm", "Working stress method (Annex B)"]], def: "lsm", help: "Loads: factored for LSM, working (service) for WSM" };
  function by(l, w) { return function (p) { return p.method === "wsm" ? w(p) : l(p); }; }
  function sel(label, opts, def, num) { return { type: "select", label: label, opts: opts, def: def, num: !!num }; }
  var supp = sel("Support condition", [["ss", "Simply supported"], ["cont", "Continuous"], ["cant", "Cantilever"], ["prop", "Propped cantilever (one edge fixed)"]], "ss");
  var isa = [["auto", "Auto-select lightest"]].concat(D.ISA.map(function (a) { return [a.name, a.name]; }));
  var ismb = [["auto", "Auto-select lightest"]].concat(D.ISMB.map(function (a) { return [a.name, a.name]; }));
  var places = Object.keys(D.vb).filter(function (k) { return k !== "Custom"; }).map(function (k) { return [k, k + " (" + D.vb[k] + " m/s)"]; }).concat([["Custom", "Custom - enter below"]]);

  var M = [
    { id: "beam", grp: "RCC", icon: "━", t: "RCC Beam", d: "Any end conditions — simply supported, cantilever, propped, fixed; BMD/SFD, curtailment, BBS", code: "IS 456", fn: function (p) { return MODS.beam(p); }, f: {
      method: meth, b: n("Width b", 230, "mm"), D: n("Overall depth D", 450, "mm"), exp: expo("mild"), cover: n("Clear cover to stirrups", 25, "mm"), stir: bar("Stirrup dia", 8, "tie"), dia: bar("Main bar dia (for d)", 16, "main"),
      L: n("Effective span L", 5, "m"), endL: sel("Left end support", RCC.BEAM_ENDS, "pinned"), endR: sel("Right end support", RCC.BEAM_ENDS, "roller"),
      mode: sel("Design forces", [["load", "From loads"], ["direct", "Enter Mu, Vu"]], "load"),
      wu: n("Design UDL w", 30, "kN/m", "LSM: factored 1.5(DL+LL) · WSM: working DL+LL"), P1: n("Point load P1", 0, "kN", "factored; e.g. a tip load on a cantilever or a secondary beam"), a1: n("P1 distance from the left end", 2.5, "m"),
      P2: n("Point load P2", 0, "kN"), a2: n("P2 distance from the left end", 0, "m"), ksL: n("Spring stiffness (left, if spring)", 5000, "kN/m", "vertical spring support, e.g. a supporting beam or soil"), ksR: n("Spring stiffness (right, if spring)", 5000, "kN/m"),
      Mu: n("M (if direct)", 100, "kNm", "factored (LSM) / working (WSM)"), Vu: n("V (if direct)", 80, "kN"), fck: fck, fy: fy } },
    { id: "slab", grp: "RCC", icon: "▦", t: "Slab Design", d: "One-way or two-way decided from lx, ly — Annex D coefficients, cantilever", code: "IS 456 cl 24, Annex D", fn: function (p) { return RCC.slabAuto(p, p.method === "wsm" ? WS.slab1 : RCC.slab1, p.method === "wsm" ? WS.slab2 : RCC.slab2); }, f: {
      method: meth, lx: n("Span lx", 4, "m", "the app takes the shorter of lx, ly as the short span"), ly: n("Span ly", 5, "m", "ly/lx > 2 → one-way, otherwise two-way"), case_: sel("Edge condition (IS 456 Table 26)", RCC.SLAB_CASES, "4", true),
      D: n("Thickness D", 150, "mm"), exp: expo("mild"), cover: n("Clear cover", 20, "mm"), dia: bar("Bar dia", 10, "slab"), LL: n("Live load", 3, "kN/m²", "IS 875 Pt 2: residential 2, office 2.5–4"), FF: n("Floor finish", 1, "kN/m²"),
      Pe: n("Line load at the free edge", 0, "kN/m", "cantilever (case 11) only — parapet or railing, unfactored"), fck: fck, fy: fy } },
    { id: "slab1", grp: "RCC", hidden: true, icon: "▭", t: "One-way Slab", d: "ly/lx > 2, cantilever, continuous", code: "IS 456", fn: by(RCC.slab1, WS.slab1), f: {
      method: meth, L: n("Effective span", 3.0, "m"), D: n("Thickness D", 150, "mm"), exp: expo("mild"), cover: n("Clear cover", 20, "mm"), dia: bar("Bar dia", 10, "slab"),
      LL: n("Live load", 3, "kN/m²", "IS 875 Pt 2: office 2.5-4"), FF: n("Floor finish", 1, "kN/m²"), support: supp, fck: fck, fy: fy } },
    { id: "slab2", grp: "RCC", hidden: true, icon: "▦", t: "Two-way Slab", d: "Table 26/27 coefficients, 10 edge cases", code: "IS 456 Annex D", fn: by(RCC.slab2, WS.slab2), f: {
      method: meth, lx: n("Short span lx", 4, "m"), ly: n("Long span ly", 5, "m"), case_: sel("Edge condition", D.T26.map(function (c, i) { return [String(i + 1), c.name]; }), "4", true),
      D: n("Thickness D", 150, "mm"), exp: expo("mild"), cover: n("Clear cover", 20, "mm"), dia: bar("Bar dia", 10, "slab"), LL: n("Live load", 3, "kN/m²"), FF: n("Floor finish", 1, "kN/m²"), fck: fck, fy: fy } },
    { id: "column", grp: "RCC", icon: "┃", t: "RCC Column", d: "Axial + biaxial bending, slender", code: "IS 456 cl 39", fn: function (p) { return MODS.column(p); }, f: {
      method: meth, b: n("Width b", 300, "mm"), D: n("Depth D", 450, "mm"), L: n("Unsupported length", 3, "m"), lecx: sel("Effective length about x (IS 456 Table 28)", B1.LE_OPTS, "manual"), lex: n("Effective length lex", 3, "m", "used when 'Enter the effective length' is chosen"), lecy: sel("Effective length about y (IS 456 Table 28)", B1.LE_OPTS, "manual"), ley: n("Effective length ley", 3, "m"),
      Pu: n("Axial load P", 1500, "kN", "factored (LSM) / working (WSM)"), Mux: n("Mx", 60, "kNm"), Muy: n("My", 30, "kNm"), exp: expo("mild"), cover: n("Clear cover to ties", 40, "mm", "IS 456 cl 26.4.2.1: ≥ 40 mm to the main bars"), tie: bar("Tie dia", 8, "tie"),
      dia: bar("Main bar dia", 16, "col"),
      arr: sel("Bar arrangement", [["four", "Equal on four faces"], ["two", "Two faces (parallel to b)"]], "four"), pmax: n("Max steel %", 4, "%"), fck: fck, fy: fy } },
    { id: "footing", grp: "RCC", icon: "⬛", t: "Isolated Footing", d: "Size, bending, one-way & punching shear", code: "IS 456 cl 34", fn: RCC.footing, f: {
      P: n("Service axial load P", 1000, "kN"), Mx: n("Service moment (long dir)", 0, "kNm"), sbc: n("Safe bearing capacity", 150, "kN/m²"), sw: n("Self wt + backfill", 10, "% of P"),
      cb: n("Column width b", 300, "mm"), cd: n("Column depth D", 450, "mm"), shape: sel("Shape", [["rect", "Rectangular (equal projections)"], ["sq", "Square"]], "rect"),
      exp: expo("moderate"), cover: n("Clear cover", 50, "mm", "IS 456 cl 26.4.2.2: ≥ 50 mm"), dia: bar("Bar dia", 12, "ftg"), fck: fck25, fy: fy } },
    { id: "pile", grp: "Fdn", icon: "⦿", t: "Pile Foundation", d: "Pile capacity, groups, caps, pile bars, drawings, BOQ", code: "IS 2911 / IS 456", fn: FD.pile, f: {
      dxf: dxfF("Column layout from a DXF plan (optional)", "pile", "Columns as closed rectangles, circles or points on a COLUMN layer; marks taken from nearby text (C1, C2…). Fills the table below — then enter the loads."), dunits: DUN,
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
      zone: sel("Seismic zone (confinement links at the pile top)", [["2", "II"], ["3", "III"], ["4", "IV"], ["5", "V"]], "4", true), fck: fck25, fy: fy } },
    { id: "raft", grp: "Fdn", icon: "▭", t: "Raft Foundation", d: "Plate on soil springs, punching, mesh + extra bars, drawings, BOQ", code: "IS 2950 / IS 456", fn: FD.raft, f: {
      dxf: dxfF("Column layout from a DXF plan (optional)", "raft", "Columns as closed rectangles, circles or points on a COLUMN layer; marks taken from nearby text. Fills the table below — then enter the loads."), dunits: DUN,
      cols: { type: "text", label: "Columns: mark, x (m), y (m), P dead (kN), P live (kN), Mx, My (kNm) — one per line", def: "C1, 0, 0, 600, 200, 0, 0\nC2, 5, 0, 900, 300, 0, 0\nC3, 10, 0, 600, 200, 0, 0\nC4, 0, 5, 900, 300, 0, 0\nC5, 5, 5, 1300, 450, 0, 0\nC6, 10, 5, 900, 300, 0, 0" },
      cb: n("Column size along X", 450, "mm"), cd: n("Column size along Y", 450, "mm"), sbc: n("Safe bearing capacity (net)", 200, "kN/m²"), ks: n("Modulus of subgrade reaction ks (0 = 120 × SBC)", 0, "kN/m³"),
      Df: n("Founding depth", 1.5, "m"), matT: n("Raft thickness (0 = smallest that passes)", 0, "mm"), matOff: n("Projection beyond the outer column faces", 0.5, "m"),
      setLim: n("Permissible settlement", 75, "mm", "IS 1904: raft on sand 75, clay 100"), matMesh: n("Mesh size", 0.5, "m"), lf: n("Load factor", 1.5, ""), fck: fck25, fy: fy } },
    { id: "contbeam", grp: "RCC", icon: "┯", t: "Continuous Beam", d: "Any number of spans — pattern loading, redistribution, envelope design, curtailment", code: "IS 456 cl 22.4, 37.1", fn: function (p) { return MODS.contbeam(p); }, f: {
      spans: { type: "text", label: "Span lengths, left to right", def: "4.5, 5, 4.5", unit: "m", help: "comma separated (up to 12 spans)" },
      gk: { type: "text", label: "Dead load gk per span (excluding self weight)", def: "18", unit: "kN/m", help: "one value for all spans, or one per span" },
      qk: { type: "text", label: "Imposed load qk per span", def: "10", unit: "kN/m", help: "one value for all spans, or one per span" },
      self: sel("Add self weight 25 b D", [["yes", "Yes"], ["no", "No (included in gk)"]], "yes"),
      endL: sel("Left end support", [["pinned", "Simple (pinned)"], ["fixed", "Fixed / monolithic"], ["free", "Free — cantilever span"]], "pinned"), endR: sel("Right end support", [["pinned", "Simple (pinned)"], ["fixed", "Fixed / monolithic"], ["free", "Free — cantilever span"]], "pinned"),
      pattern: sel("Pattern imposed load (cl 22.4.1)", [["auto", "Auto — all spans loaded when 1.5 Q ≤ ¾ × 1.5 G"], ["on", "Always"], ["off", "Off"]], "auto"),
      redist: n("Moment redistribution", 0, "%", "IS 456 cl 37.1.1: up to 30 %; xu/d at the supports ≤ 0.6 − δ"),
      b: n("Width b", 300, "mm"), D: n("Overall depth D", 500, "mm"), exp: expo("moderate"), cover: n("Clear cover to stirrups", 25, "mm"), stir: bar("Stirrup dia", 8, "tie"), dia: bar("Main bar dia (for d)", 16, "main"), fck: fck25, fy: fy } },
    { id: "retwall", grp: "Fdn", icon: "⌊", t: "Retaining Wall", d: "Cantilever wall — Rankine pressure, overturning, sliding, bearing, stem / heel / toe", code: "IS 456 cl 20", fn: function (p) { return MODS.retwall(p); }, f: {
      H: n("Height of retained earth above founding level", 4, "m"), Df: n("Depth of the base below the ground in front", 1.0, "m"), q: n("Surcharge on the backfill", 10, "kN/m²", "traffic ≈ 10–12; nil 0"),
      gs: n("Unit weight of soil γ", 18, "kN/m³"), phi: n("Angle of internal friction φ", 30, "°"), beta: n("Backfill slope β", 0, "°", "0 = level backfill"), mu: n("Base friction coefficient μ", 0.5, "", "0.5 typical for concrete on soil"),
      sbc: n("Safe bearing capacity", 150, "kN/m²"), passive: sel("Passive resistance in front of the toe", [["no", "Ignore (conservative)"], ["yes", "Include (soil will not be removed)"]], "no"),
      B: n("Base width (0 = auto)", 0, "m"), toe: n("Toe length (0 = B/3)", 0, "m"), tb: n("Base thickness (0 = auto)", 0, "mm"), ttop: n("Stem thickness at the top", 200, "mm"), tstem: n("Stem thickness at the base (0 = auto)", 0, "mm"),
      exp: expo("moderate"), cover: n("Clear cover", 50, "mm", "earth face ≥ 50 mm"), dia: bar("Bar dia", 12, "ftg"), fck: fck25, fy: fy } },
    { id: "combfoot", grp: "Fdn", icon: "▬", t: "Combined Footing", d: "Two columns on one rectangular footing — property line, punching, longitudinal & transverse steel", code: "IS 456 cl 34", fn: function (p) { return MODS.combfoot(p); }, f: {
      P1: n("Column 1 service load P1", 800, "kN"), P2: n("Column 2 service load P2", 1200, "kN"), s: n("Column spacing (centre to centre)", 4, "m"),
      c1b: n("Column 1 width (across the footing)", 400, "mm"), c1d: n("Column 1 depth (along the footing)", 400, "mm"), c2b: n("Column 2 width", 450, "mm"), c2d: n("Column 2 depth", 450, "mm"),
      edge: sel("Column 1 position", [["free", "Free — footing may project"], ["line", "On a property line — no projection"]], "free"), projL: n("Projection beyond column 1 centre (0 = auto)", 0, "m"),
      sbc: n("Safe bearing capacity", 200, "kN/m²"), sw: n("Self weight + backfill", 10, "% of P"), exp: expo("moderate"), cover: n("Clear cover", 50, "mm"), dia: bar("Bar dia", 16, "ftg"), fck: fck25, fy: fy } },
    { id: "strip", grp: "RCC", icon: "▁", t: "Strip / Wall Footing", d: "Under masonry walls", code: "IS 456 cl 34", fn: RCC.strip, f: {
      w: n("Wall load (service)", 150, "kN/m"), sbc: n("Safe bearing capacity", 150, "kN/m²"), sw: n("Self wt + backfill", 10, "% of w"), tw: n("Wall / block width", 350, "mm"),
      Bmin: n("Minimum width (optional)", 0, "m", "e.g. 0.76 m for 2'-6\""), Dmin: n("Minimum depth (optional)", 0, "mm", "IS 456 cl 34.1.2: ≥ 150 mm at the edge"), exp: expo("moderate"), cover: n("Clear cover", 50, "mm"), dia: bar("Bar dia", 8, "slab"), fck: fck25, fy: fy } },
    { id: "stair", grp: "RCC", icon: "↗", t: "Staircase", d: "Dog-legged / waist slab", code: "IS 456 cl 33", fn: RCC.stair, f: {
      R: n("Riser", 150, "mm"), T: n("Tread", 250, "mm"), t: n("Waist thickness", 175, "mm"), L: n("Effective horizontal span", 3.5, "m"), LL: n("Live load", 3, "kN/m²", "IS 875-2 Table 1: 3 dwellings, 4 office / educational, 5 assembly / retail"),
      FF: n("Finishes", 1, "kN/m²"), support: sel("End condition", [["ss", "Simply supported"], ["cont", "Continuous / monolithic"]], "ss"), exp: expo("mild"), cover: n("Clear cover", 20, "mm"), dia: bar("Bar dia", 10, "slab"), fck: fck, fy: fy } },

    { id: "truss", grp: "Steel", icon: "△", t: "Roof Truss", d: "Geometry, IS 875 loads, analysis & design", code: "IS 800 / 875", fn: TR.design, f: {
      src: sel("Geometry", [["gen", "Generator"], ["dxf", "Import DXF"]], "gen"), dxf: dxfF("Truss elevation DXF (when importing)", null, "Members as LINEs or polylines in an elevation, X horizontal, Y up, joints where members meet; layers TOP / BOTTOM / WEB optional (otherwise the chords are traced from the outline); supports at the lowest end joints."), dunits: DUN,
      type: sel("Truss type (generator)", [["pratt", "Pratt"], ["howe", "Howe"], ["fink", "Fink (W, 4 panels)"]], "pratt"), span: n("Span (c/c bearing)", 9.65, "m"), slope: n("Roof slope", 30, "deg"),
      n: n("Panels per half (Pratt/Howe)", 3, ""), spacing: n("Truss spacing", 2.4, "m"), sheet: n("Sheeting + fixings", 0.08, "kN/m²", "0.5 mm CGI ≈ 0.05-0.08"),
      purl: n("Purlins (on slope)", 0.06, "kN/m²"), s0: n("Ground snow load s0", 1.5, "kN/m²", "Kashmir valley 1.5-2.5; confirm locally"),
      vb: sel("Basic wind speed (place)", places, "Srinagar"), vbc: n("Custom Vb (if Custom)", 39, "m/s"), k1: n("k1 (risk coefficient)", 1.0, ""), terrain: sel("Terrain category", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]], "2", true),
      h: n("Height to ridge", 10, "m"), hw: n("h/w of building", 0.5, ""), cpi: n("Cpi (±)", 0.2, "", "0.2 normal, 0.5 large openings"),
      tsup: sel("Bearings", [["pr", "Pinned + roller (sliding) — determinate"], ["pp", "Pinned at both ends — horizontal thrust"]], "pr"),
      purlinSp: n("Purlin spacing (top chord restraint)", 1.0, "m"), bracing: n("Bottom chord bracing spacing", 3.2, "m"), gusset: n("Gusset thickness", 8, "mm"), webMin: n("Min web angle leg", 50, "mm"),
      fy: sel("Steel fy", [["250", "E250"], ["350", "E350"]], "250", true), fu: n("Steel fu", 410, "N/mm²") } },
    { id: "purlin", grp: "Steel", icon: "═", t: "Purlin", d: "Angle / channel, biaxial bending", code: "IS 800 cl 8, 9", fn: ST.purlin, f: {
      span: n("Purlin span (truss spacing)", 2.4, "m"), sp: n("Purlin spacing on slope", 1.0, "m"), slope: n("Roof slope", 30, "deg"), DL: n("Sheeting DL (on slope)", 0.10, "kN/m²"),
      LL: n("Imposed / snow load (plan)", 0.75, "kN/m²"), WL: n("Wind pressure (inward)", 0.5, "kN/m²"), WLup: n("Wind suction (uplift)", 1.0, "kN/m²"),
      kind: sel("Section type", [["angle", "Angle (ISA)"], ["channel", "Channel (ISMC)"]], "angle"), sag: sel("Sag rods at mid-span", [["", "No"], ["1", "Yes"]], ""), fy: sel("Steel fy", [["250", "E250"], ["350", "E350"]], "250", true) } },
    { id: "tension", grp: "Steel", icon: "↔", t: "Tension Member", d: "Yield, rupture, block shear", code: "IS 800 Sec 6", fn: ST.tension, f: {
      Tu: n("Factored tension Tu", 150, "kN"), sec: sel("Angle section", isa, "auto"), n: sel("Arrangement", [["1", "Single angle"], ["2", "Double angle back-to-back"]], "1", true),
      L: n("Length", 2.5, "m"), conn: sel("End connection", [["bolt", "Bolted (one leg)"], ["weld", "Welded"]], "bolt"), db: bar("Bolt dia", 16, "bolt", "M"), bgrade: sel("Bolt grade", [["4.6", "4.6"], ["8.8", "8.8"]], "4.6"),
      nb: n("Bolts in line", 6, ""), pitch: n("Pitch", 50, "mm"), e: n("End distance", 30, "mm"), g: n("Gauge (heel to bolt line)", 35, "mm"), Lw: n("Weld length (if welded)", 150, "mm"),
      tg: n("Gusset thickness", 8, "mm"), gap: n("Gap between angles", 8, "mm"), lmax: n("Max L/r", 400, ""), fy: n("fy", 250, "N/mm²"), fu: n("fu", 410, "N/mm²") } },
    { id: "comp", grp: "Steel", icon: "↕", t: "Compression Member", d: "Struts & columns, buckling curves", code: "IS 800 Sec 7", fn: function (p) { return MODS.comp(p); }, f: {
      Pu: n("Factored axial load Pu", 200, "kN"), type: sel("Member type", [["sa", "Single angle (cl 7.5.1.2)"], ["da", "Double angle back-to-back"], ["mb", "ISMB column"], ["mc", "ISMC"]], "da"),
      sec: sel("Section (or auto)", [["auto", "Auto-select lightest"]].concat(D.ISA.concat(D.ISMB, D.ISMC).map(function (a) { return [a.name, a.name]; })), "auto"),
      L: n("Length", 2.5, "m"), Ly: n("Length about minor axis (ISMB)", 0, "m", "0 = same as L"), Kc: sel("End conditions (IS 800 Table 11)", B1.LE_OPTS, "manual"), K: n("Effective length factor K", 0.85, "", "used when 'Enter' is chosen; Table 11"),
      endc: sel("Single angle end condition", [["fixed2", "≥ 2 bolts / welded, fixed"], ["hinged2", "≥ 2 bolts, hinged"], ["fixed1", "1 bolt, fixed"], ["hinged1", "1 bolt, hinged"]], "fixed2"),
      gap: n("Gap (double angles)", 8, "mm"), lmax: n("Max KL/r", 180, ""), fy: n("fy", 250, "N/mm²") } },
    { id: "sbeam", grp: "Steel", icon: "⌶", t: "Steel Beam", d: "ISMB, LTB, shear, deflection", code: "IS 800 Sec 8", fn: function (p) { return MODS.sbeam(p); }, f: {
      sec: sel("Section", ismb, "auto"), L: n("Span", 6, "m"), support: sel("Support", [["ss", "Simply supported"], ["cant", "Cantilever"]], "ss"), wu: n("Factored UDL wu", 30, "kN/m"),
      Pu: n("Factored mid-span / tip point load", 0, "kN"), lat: sel("Compression flange", [["1", "Laterally supported"], ["", "Laterally unsupported"]], "1"), ltb: sel("Support restraint for LTB (IS 800 Table 15)", B1.T15_OPTS, "manual"), Lun: n("Unbraced length (if unsupported)", 6, "m"),
      destab: sel("Load on top flange (destabilising)", [["", "No"], ["1", "Yes"]], ""), dl: n("Deflection limit span /", 300, ""), fy: n("fy", 250, "N/mm²") } },
    { id: "bolts", grp: "Steel", icon: "⊙", t: "Bolts & Welds", d: "Bearing bolts, fillet welds", code: "IS 800 Sec 10", fn: ST.bolts, f: {
      Vu: n("Factored shear on bolt group", 120, "kN"), db: bar("Bolt dia", 16, "bolt", "M"), grade: sel("Bolt grade", [["4.6", "4.6"], ["8.8", "8.8"], ["10.9", "10.9"]], "4.6"),
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
    var QA = [["beam", "Beam"], ["slab", "Slab"], ["column", "Column"], ["footing", "Footing"], ["pile", "Piles"], ["estimate", "Estimate"], ["model", "Analysis"], ["aids", "Design aids"]];
    var h = '<section class="brand" aria-label="IS StructDesign"><div class="brand-art"></div><div class="brand-t"><b>IS StructDesign</b><span>Structural design &amp; detailing to Indian Standards</span></div></section><div class="homebody">' +
      '<div class="qa">' + QA.map(function (q) { return '<a href="#' + q[0] + '" class="qai"><span class="ic">' + IC.svg(q[0] === "model" ? "frame" : q[0]) + '</span><span>' + q[1] + '</span></a>'; }).join("") + '</div>';
    var projCard = "";
    if (window.PDB) { var h0 = h; h = ""; var pr = PDB.current(), sm = pr.summary, nf = sm ? sm.memberFails + (sm.detailFails || 0) : 0;
      h += '<a class="card wide proj" href="#projects"><span class="ic">' + IC.svg("projects") + '</span><div class="pc"><b>' + esc(pr.name) + ' <small class="stchip">' + esc(pr.status) + '</small></b><small>Current project · ' + PDB.list().length + ' project(s) on this device' + (sm ? ' · last run ' + new Date(sm.date).toLocaleDateString() : ' · not analysed yet') + '</small>' +
        (sm ? '<div class="kpis"><span class="' + (nf ? "bad" : "good") + '">' + (nf ? nf + " checks fail" : "All checks pass") + '</span>' + (sm.cost ? '<span>₹ ' + Math.round(sm.cost).toLocaleString("en-IN") + '</span>' : '') + (sm.steel_t ? '<span>' + sm.steel_t.toFixed(1) + ' t steel</span>' : '') + '</div>' : '') + '</div>' + IC.svg("chev", "go") + '</a>'; projCard = h; h = h0; }
    if (window.PDB && PDB.current()) { var el0 = PDB.current().elements || [];
      h += '<a class="pbar" href="#elements">' + IC.svg("projects") + '<span><b>' + esc(PDB.current().name) + '</b> · ' + (el0.length ? el0.length + ' designed element(s) · ' + "₹ " + Math.round(el0.reduce(function (a, e) { return a + (e.cost || 0); }, 0)).toLocaleString("en-IN") : 'no designed elements yet — use <i>Add to project</i> under a result') + '</span>' + IC.svg("chev", "go") + '</a>'; }
    h += '<label class="search">' + IC.svg("search") + '<input id="q" type="search" placeholder="Search — beam, footing, truss, seismic…" autocomplete="off"></label>';
    var rec = []; try { rec = JSON.parse(localStorage.getItem("isd_recent") || "[]"); } catch (e) {}
    rec = rec.map(modById).filter(Boolean).slice(0, 4);
    if (rec.length) h += '<div class="recent"><span>Recent</span>' + rec.map(function (m) { return '<a href="#' + m.id + '" class="rchip g-' + m.grp.toLowerCase() + '"><span class="ic">' + IC.svg(m.id) + '</span>' + esc(m.t) + '</a>'; }).join("") + '</div>';
    h += '<div class="chips" id="fchips">' + [["all", "All"], ["RCC", "RCC"], ["Fdn", "Foundations"], ["Steel", "Steel"], ["Loads", "Loads"], ["Ana", "Analysis"], ["Ref", "Reference"]].map(function (c) { return '<button type="button" data-g="' + c[0] + '"' + (homeFilter === c[0] ? ' class="on"' : '') + '>' + c[1] + '</button>'; }).join("") + '</div>';
    ["RCC", "Fdn", "Steel", "Loads"].forEach(function (g) {
      h += '<div class="gsec" data-g="' + g + '"><h2 class="grp"><span>' + GRP[g][0] + '</span><em>' + GRP[g][1] + '</em></h2><div class="grid">';
      M.filter(function (m) { return m.grp === g && !m.hidden; }).forEach(function (m) {
        h += '<a class="card mod g-' + g.toLowerCase() + '" href="#' + m.id + '" data-s="' + esc((m.t + " " + m.d + " " + m.code).toLowerCase()) + '"><span class="ic">' + IC.svg(m.id) + '</span><b>' + m.t + '</b><small>' + m.d + '</small><em>' + m.code + '</em></a>';
      });
      h += '</div></div>';
    });
    h += '<div class="gsec" data-g="Ana" id="secAna"><h2 class="grp"><span>Building analysis</span><em>Frame & shell FE · IS 1893 · IS 456 / 800</em></h2>' + projCard.replace('class="card wide proj"', 'class="card wide proj" data-s="project current analysis status"') + '<div class="grid">' +
      '<a class="card mod g-ana" href="#model" data-s="frame fe finite element analysis 3d building seismic response spectrum pushover model"><span class="ic">' + IC.svg("frame") + '</span><b>Frame & FE analysis</b><small>Whole-building 3D model, seismic, auto design, detailing</small><em>FEA</em></a>' +
      '<a class="card mod g-ana" href="#projects" data-s="projects revisions backup"><span class="ic">' + IC.svg("projects") + '</span><b>Projects</b><small>Saved buildings, revisions, backups</small><em>Offline</em></a>' +
      '<a class="card mod g-ana" href="#report" data-s="calculation report building"><span class="ic">' + IC.svg("report") + '</span><b>Building report</b><small>Calculation report of the analysed building</small><em>PDF</em></a></div></div>';
    h += '<div class="gsec" data-g="Ref"><h2 class="grp"><span>Reference</span><em>SP 16 · SP 6(1) · IS 456 tables</em></h2><div class="grid"><a class="card mod g-ref" href="#aids" data-s="design aids charts sp 16 interaction column flexure shear development length"><span class="ic">' + IC.svg("aids") + '</span><b>Design aids</b><small>' + (window.AIDS ? AIDS.length : 0) + ' charts: column P–M, slabs, flexure, shear, steel buckling, spectra; Ld tables</small><em>SP 16 style</em></a><a class="card mod g-ref" href="#tables" data-s="section tables isa ismb ismc tau"><span class="ic">' + IC.svg("tables") + '</span><b>Section tables</b><small>ISA, ISMB, ISMC properties, τc</small><em>SP 6(1)</em></a>' +
      '<a class="card mod g-ref" href="#about" data-s="about scope codes register"><span class="ic">' + IC.svg("about") + '</span><b>About & scope</b><small>Codes, assumptions, limits</small><em>engine ' + (window.REG ? REG.ENGINE : "") + '</em></a></div></div>';
    h += '<p class="empty" id="nores" hidden>No module matches your search.</p></div>';
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
    var hd = document.querySelector("header"); if (hd) document.documentElement.style.setProperty("--hh", hd.offsetHeight + "px");
    document.querySelectorAll("#fchips button").forEach(function (b) { b.onclick = function () { homeFilter = this.getAttribute("data-g"); document.querySelectorAll("#fchips button").forEach(function (x) { x.classList.toggle("on", x === b); }); filt(); }; });
    filt();
  }

  var GORD = ["Import from DXF", "Design method", "Geometry", "Loads", "Soil", "Materials", "Reinforcement & cover", "Connection", "Limits", "Inputs", "Other inputs"];
  var GICON = { "Import from DXF": "frame", "Design method": "about", "Geometry": "frame", "Loads": "roof", "Soil": "pile", "Materials": "tables", "Reinforcement & cover": "column", "Connection": "bolts", "Limits": "about", "Inputs": "about", "Other inputs": "about" };
  var GK = {
    "Import from DXF": ["src", "dxf", "dunits"],
    "Design method": ["method", "mode"],
    "Materials": ["fck", "fy", "fu", "exp", "grade", "bgrade"],
    "Reinforcement & cover": ["cover", "stir", "dia", "tie", "pmax", "arr", "pcov"],
    "Loads": ["wu", "Mu", "Vu", "Pu", "Mux", "Muy", "P", "Mx", "w", "LL", "FF", "sw", "Tu", "Fw", "DL", "WL", "WLup", "sheet", "purl", "s0", "vb", "vbc", "k1", "terrain", "cpi", "extra", "cols", "lf", "seis", "nsf", "zone", "hw"],
    "Soil": ["soil", "sbc", "ks", "Qg", "Qupg", "K", "fos", "nh", "ylim", "setLim", "head", "Df"],
    "Connection": ["db", "nb", "pitch", "e", "g", "conn", "Lw", "tg", "nn", "ns", "s", "tw_thk", "field", "t", "gap"],
    "Limits": ["lmax", "dl"]
  };
  function grpOf(k, m) {
    if (m.id === "stair" && k === "t") return "Geometry";
    for (var g in GK) if (GK[g].indexOf(k) >= 0) return g;
    return "Geometry";
  }
  function moduleView(m) {
    title.textContent = m.t; back.hidden = false;
    var saved = store(m.id) || {}, h = '<div class="mhead g-' + m.grp.toLowerCase() + '"><span class="mic">' + IC.svg(m.id) + '</span><div><b>' + esc(m.t) + '</b><small>' + esc(m.d) + '</small></div><em class="cchip">' + m.code + '</em></div>' +
      '<form id="f" class="form" autocomplete="off"><div class="code ftop full"><span>Inputs — leave a field blank to use the value shown in it</span>' + unitSeg() + '</div>' + (window.SK && SK.has(m.id) ? '<div class="sketch full" id="sk" aria-label="Live sketch of the inputs"></div>' : '');
    var GH = {}, gOrder = [];
    Object.keys(m.f).forEach(function (k) {
      var g = m.grp === "Loads" ? "Inputs" : grpOf(k, m), hh = h; h = "";
      var f = m.f[k], v = saved[k] !== undefined && saved[k] !== "" ? saved[k] : (f.type === "select" ? f.def : "");
      if (f.type === "select" && !f.opts.some(function (o) { return o[0] === String(v); })) v = f.num && isFinite(parseFloat(v)) ? f.opts.reduce(function (a, o) { return Math.abs(+o[0] - v) < Math.abs(+a - v) ? o[0] : a; }, f.opts[0][0]) : f.def;
      h += '<label class="fld" data-fk="' + k + '"><span>' + f.label + '</span>';
      var segOk = f.type === "select" && f.opts.length >= 2 && f.opts.length <= 3 && !f.unit && f.opts.every(function (o) { return o[1].length <= 26; });
      if (segOk) h += '<span class="seg fseg">' + f.opts.map(function (o) { return '<button type="button" data-sv="' + esc(o[0]) + '"' + (String(v) === o[0] ? ' class="on"' : '') + '>' + esc(o[1]) + '</button>'; }).join("") + '</span>';
      if (f.type === "select") h += '<select name="' + k + '"' + (segOk ? ' hidden' : '') + '>' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === o[0] ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") + '</select>';
      else if (f.type === "text") h += '<textarea name="' + k + '" rows="4" placeholder="' + esc(f.def) + '">' + esc(v) + '</textarea>';
      else if (f.type === "dxf") h += '<span class="dxfin"><label class="dxfbtn">' + IC.svg("frame") + '<span>' + (v ? 'Replace DXF file' : 'Choose DXF file') + '</span><input type="file" accept=".dxf,.DXF,application/dxf,text/plain,*/*" data-dxf="' + k + '"></label><textarea name="' + k + '" hidden>' + esc(v) + '</textarea><small class="dxfst" data-st="' + k + '">' + (v ? 'Loaded: ' + esc(saved[k + "__name"] || "drawing.dxf") + ' (' + Math.max(1, Math.round(v.length / 1024)) + ' kB)' : 'No file chosen') + '</small>' + (v ? '<button type="button" class="dxfclr" data-clr="' + k + '">Remove</button>' : '') + '<button type="button" class="dxfclr" data-smp="' + (f.fill ? "plan" : "truss") + '">Sample DXF</button></span>';
      else { var shown = UN.show(v, f.unit); h += '<span class="inw"><input name="' + k + '" type="number" step="any" inputmode="decimal" placeholder="' + esc(UN.show(f.def, f.unit)) + '" value="' + esc(shown) + '" data-si="' + esc(v) + '" data-shown="' + esc(shown) + '">' + (f.unit ? '<em class="u">' + esc(UN.label(f.unit)) + '</em>' : '') + '</span>'; }
      if (f.help) h += '<small>' + f.help + '</small>';
      h += '<small class="lim" hidden></small></label>';
      if (!GH[g]) { GH[g] = ""; gOrder.push(g); } GH[g] += h; h = hh;
    });
    gOrder.sort(function (a, b) { return GORD.indexOf(a) - GORD.indexOf(b); });
    gOrder.forEach(function (g) { h += '<details class="fgrp full" open><summary>' + IC.svg(GICON[g] || "about") + '<span>' + g + '</span></summary><div class="fgrid">' + GH[g] + '</div></details>'; });
    if (LIM.check(m.id, defaults(m)).length || ["RCC", "Fdn"].indexOf(m.grp) >= 0 || /tension|comp|bolts/.test(m.id))
      h += '<label class="fld ck full"><span><input type="checkbox" id="exist"' + (saved.__exist ? " checked" : "") + '> Checking an existing structure — allow inputs outside the code limits (they are flagged in the report)</span></label>';
    h += '<div class="btns sticky"><button type="submit" class="pri">' + IC.svg("play") + ' Calculate</button><button type="button" id="rst">Reset</button></div></form><div id="out"></div>';
    app.innerHTML = h;
    var form = document.getElementById("f");
    form.onsubmit = function (e) { e.preventDefault(); run(m, form); };
    form.querySelectorAll("[data-dxf]").forEach(function (inp) { inp.onchange = function () {
      var k = inp.getAttribute("data-dxf"), fl = inp.files && inp.files[0]; if (!fl) return;
      if (fl.size > 4e6) return toast("DXF over 4 MB — purge unused layers and blocks, then try again");
      var rd = new FileReader(); rd.onload = function () {
        var txt = String(rd.result), f = m.f[k], st = form.querySelector('[data-st="' + k + '"]');
        if (!/SECTION/.test(txt.slice(0, 5000))) { st.textContent = "Not an ASCII DXF — save the drawing as DXF (not DWG / binary)"; return; }
        form.elements[k].value = txt; form.elements[k].setAttribute("data-name", fl.name); st.textContent = "Loaded: " + fl.name + " (" + Math.max(1, Math.round(txt.length / 1024)) + " kB)";
        try {
          if (f.fill) {
            var sc = { mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, "in": 0.0254 }[form.elements.dunits ? form.elements.dunits.value : "auto"] || null, res = DXF.columns(txt, { scale: sc });
            var old = {}; String(form.elements.cols.value || m.f.cols.def || "").split(/\n/).forEach(function (l) { var a = l.split(/[,;\t]+/).map(function (x) { return x.trim(); }); if (a[0]) old[a[0].toUpperCase()] = a.slice(3); });
            var nl = f.fill === "pile" ? 5 : 4;
            form.elements.cols.value = res.cols.map(function (c) { var ld = old[c.mark] || []; while (ld.length < nl) ld.push("0"); return [c.mark, c.x, c.y].concat(ld.slice(0, nl)).join(", "); }).join("\n");
            if (res.size && form.elements.cb && form.elements.cd) { [["cb", res.size[0]], ["cd", res.size[1]]].forEach(function (q) { var el = form.elements[q[0]], sh = UN.show(q[1], "mm"); el.value = sh; el.setAttribute("data-si", q[1]); el.setAttribute("data-shown", sh); }); }
            var miss = res.cols.filter(function (c) { return !old[c.mark]; }).length;
            st.textContent += " — " + res.cols.length + " columns read" + (res.size ? ", size " + res.size[0] + " × " + res.size[1] + " mm" : "") + (miss ? "; enter the loads of " + miss + " new column(s) in the table" : "") + (res.warn.length ? " · " + res.warn.join("; ") : "");
            toast(res.cols.length + " columns read from " + fl.name);
          } else {
            var g = DXF.truss(txt, { scale: { mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, "in": 0.0254 }[form.elements.dunits.value] || null });
            if (form.elements.src) { form.elements.src.value = "dxf"; var sg = form.elements.src.parentNode.querySelectorAll(".fseg button"); sg.forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-sv") === "dxf"); }); }
            st.textContent += " — " + g.N.length + " joints, " + g.M.length + " members, span " + U.f(g.span, 2) + " m, rise " + U.f(g.h, 2) + " m" + (g.warn.length ? " · " + g.warn.join("; ") : "");
            toast("Truss read from " + fl.name);
          }
        } catch (e) { st.textContent = "Could not read the drawing: " + (e.message || e); }
        validate(m, form);
      }; rd.readAsText(fl);
    }; });
    form.querySelectorAll("[data-smp]").forEach(function (b) { b.onclick = function () { var t = b.getAttribute("data-smp") === "plan" ? DXF.samplePlan([0, 6, 12], [0, 5, 10], 450, 450) : DXF.sampleTruss(12, 25, 3, { layers: true }); saveText(b.getAttribute("data-smp") === "plan" ? "sample-column-plan.dxf" : "sample-truss.dxf", t); toast("Sample saved — open it in AutoCAD to see the layers"); }; });
    form.querySelectorAll("[data-clr]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-clr"); form.elements[k].value = ""; form.querySelector('[data-st="' + k + '"]').textContent = "No file chosen"; b.remove(); if (form.elements.src) { form.elements.src.value = "gen"; form.elements.src.parentNode.querySelectorAll(".fseg button").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-sv") === "gen"); }); } }; });
    form.querySelectorAll(".fseg button").forEach(function (b) { b.onclick = function () { var sel = b.parentNode.parentNode.querySelector("select"); sel.value = b.getAttribute("data-sv"); b.parentNode.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); sel.dispatchEvent(new Event("change", { bubbles: true })); }; });
    try { var rc = JSON.parse(localStorage.getItem("isd_recent") || "[]").filter(function (x) { return x !== m.id; }); rc.unshift(m.id); localStorage.setItem("isd_recent", JSON.stringify(rc.slice(0, 6))); } catch (e) {}
    bindUnitSeg(form, function (s, before) { if (before) read(m, form); else moduleView(m); });
    var vt; form.addEventListener("input", function () { clearTimeout(vt); vt = setTimeout(function () { validate(m, form); }, 250); });
    form.addEventListener("change", function () { validate(m, form); });
    validate(m, form);
    document.getElementById("rst").onclick = function () { store(m.id, {}); moduleView(m); };
    if (saved.__ran) run(m, form, true);
  }

  function defaults(m) { var p = {}; Object.keys(m.f).forEach(function (k) { var f = m.f[k]; p[k] = f.type === "number" || f.num ? parseFloat(f.def) : f.def; }); return p; }
  function validate(m, form) {
    var p = read(m, form, true), iss = LIM.check(m.id, p), ex = document.getElementById("exist"), exist = !!(ex && ex.checked), sk = document.getElementById("sk");
    if (sk) sk.innerHTML = SK.draw(m.id, p);
    if (m.id === "truss") ["type", "span", "slope", "n"].forEach(function (k) { var l = form.querySelector('.fld[data-fk="' + k + '"]'); if (l) l.hidden = p.src === "dxf"; });
    form.querySelectorAll(".fld[data-fk]").forEach(function (l) {
      var k = l.getAttribute("data-fk"), mine = iss.filter(function (x) { return x.k === k; }), sm = l.querySelector(".lim");
      sm.hidden = !mine.length; l.classList.toggle("bad", mine.some(function (x) { return x.hard && !exist; }));
      sm.className = "lim " + (mine.some(function (x) { return x.hard; }) ? (exist ? "wn" : "hd") : "wn");
      sm.textContent = mine.map(function (x) { return (x.hard ? (exist ? "Outside code: " : "Not allowed: ") : "Note: ") + x.msg + (x.ref ? " (" + x.ref + ")" : ""); }).join(" · ");
    });
    return { p: p, iss: iss, exist: exist };
  }
  /* stored inputs (SI strings) → design parameters */
  function parse(m, raw) {
    var p = {}, defs = [];
    Object.keys(m.f).forEach(function (k) {
      var f = m.f[k], v = raw[k] === undefined || raw[k] === null ? "" : String(raw[k]).trim();
      if (f.type === "select") { if (!f.opts.some(function (o) { return o[0] === v; })) v = f.def; p[k] = f.num ? parseFloat(v) : v; return; }
      if (f.type === "dxf") { p[k] = v; return; }
      if (v === "") { v = String(f.def); defs.push(f.label.replace(/<[^>]+>/g, "")); }
      if (f.type === "number") { var n = parseFloat(v); p[k] = isFinite(n) ? n : parseFloat(f.def); } else p[k] = v;
    });
    post(m, p); p.__defaults = defs; return p;
  }
  function post(m, p) {
    if (p.vb !== undefined) p.vb = p.vb === "Custom" ? p.vbc : D.vb[p.vb];
    if (m.id === "seismic") p.floors = String(p.floors).split(/\n/).map(function (l) { var a = l.split(","); return a.length >= 3 ? { name: a[0].trim(), w: parseFloat(a[1]), h: parseFloat(a[2]) } : null; }).filter(Boolean);
    if (m.id === "sbeam") { p.lat = !!p.lat; p.destab = !!p.destab; }
    if (m.id === "purlin") p.sag = !!p.sag;
    if (m.id === "comp" && !p.Ly) p.Ly = p.L;
    if (m.id === "slab2") p.case_ = parseInt(p.case_, 10);
  }
  function read(m, form, noStore) {
    var p = {}, raw = {}, defs = [];
    Object.keys(m.f).forEach(function (k) {
      var f = m.f[k], el = form.elements[k], v = String(el.value).trim(); raw[k] = v;
      if (f.type === "dxf") { p[k] = v; return; }
      if (f.type !== "select" && v === "") { v = String(f.def); defs.push(f.label.replace(/<[^>]+>/g, "") + (f.type === "number" ? " = " + UN.show(f.def, f.unit) + (f.unit ? " " + UN.label(f.unit) : "") : "")); if (f.type === "number") { p[k] = parseFloat(f.def); return; } }
      if (f.type === "number") { var n = el.getAttribute("data-shown") === v && el.getAttribute("data-si") !== "" ? parseFloat(el.getAttribute("data-si")) : UN.toSI(parseFloat(v), f.unit); if (!isFinite(n)) { n = parseFloat(f.def); defs.push(f.label); raw[k] = ""; } else raw[k] = String(n); p[k] = n; }
      else if (f.type === "select") p[k] = f.num ? parseFloat(v) : v;
      else p[k] = v;
    });
    post(m, p);
    if (noStore) return p;
    Object.keys(m.f).forEach(function (k) { if (m.f[k].type === "dxf" && form.elements[k]) raw[k + "__name"] = form.elements[k].getAttribute("data-name") || (store(m.id) || {})[k + "__name"] || ""; });
    var ex = document.getElementById("exist"); raw.__exist = !!(ex && ex.checked);
    raw.__ran = true; store(m.id, raw);
    p.__defaults = defs;
    return p;
  }

  function run(m, form, quiet) {
    var out = document.getElementById("out"), r, vd = validate(m, form), hardI = vd.iss.filter(function (x) { return x.hard; });
    if (hardI.length && !vd.exist) {
      out.innerHTML = '<section class="rep"><div class="err">Inputs against the IS code — correct them to calculate</div>' + hardI.map(function (x) { return '<div class="chk no"><span>✘ ' + esc(fl(m, x.k)) + ': ' + esc(x.msg) + (x.ref ? ' <i>' + esc(x.ref) + '</i>' : '') + '</span></div>'; }).join("") +
        '<div class="note">Checking an existing building? Switch on <b>Checking an existing structure</b> above the Calculate button to run the design with these inputs.</div></section>';
      var fe = form.querySelector('.fld[data-fk="' + hardI[0].k + '"]'); if (fe && !quiet) fe.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    var pIn = read(m, form), heavy = /^(pile|raft)$/.test(m.id) || (m.id === "truss" && pIn.src === "dxf");
    if (heavy && bgOn()) {
      out.innerHTML = '<section class="repbusy"><div class="busy"><i></i>Calculating on a background core…</div></section>';
      PAR.tried = true;
      PAR.job("call", { fn: "MODS." + m.id, args: [pIn] }).then(function (rr) { Object.setPrototypeOf(rr, Rep.prototype); rr.mid = m.id; show(rr); }, function (e) {
        if (!PAR.ok()) { BG.off = true; return run(m, form, quiet); }
        out.innerHTML = '<div class="err">Could not calculate: ' + esc(e.message) + '</div>';
      });
      return;
    }
    try { r = m.fn(pIn); } catch (err) { out.innerHTML = '<div class="err">Could not calculate: ' + esc(err.message) + '</div>'; return; }
    r.mid = m.id; show(r);
    function show(r) {
    if (!out.isConnected || !form.isConnected) return;   /* the user moved on while a background calculation was running */
    var pp = read(m, form);
    out.innerHTML = render(r); out.__rep = r;
    if (pp.__defaults.length) out.querySelector(".rh").insertAdjacentHTML("afterend", '<div class="note">Blank inputs taken at default: ' + esc(pp.__defaults.join(" · ")) + '</div>');
    if (UN.active()) out.querySelector(".rh").insertAdjacentHTML("afterend", '<div class="note">' + esc(UN.note()) + '</div>');
    if (vd.iss.length) out.querySelector(".rh").insertAdjacentHTML("afterend", '<div class="note limn"><b>' + (hardI.length ? "Existing structure — inputs outside the code limits:" : "Code notes on the inputs:") + '</b> ' + vd.iss.map(function (x) { return esc(fl(m, x.k) + ": " + x.msg + (x.ref ? " (" + x.ref + ")" : "")); }).join("<br>") + '</div>');
    if (!r.ok()) fixBox(m, form, pp, out);
    var pdf = document.getElementById("pdf");
    if (!window.AndroidBridge && window.self !== window.top) pdf.hidden = true;   /* printing is blocked inside embedded viewers */
    pdf.onclick = function () { if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print(m.t); else window.print(); };
    document.getElementById("share").onclick = function () { share(r); };
    if (r.dxf) document.getElementById("dxf").onclick = function () { saveText(r.dxfName || (m.id + ".dxf"), r.dxf); };
    document.getElementById("addp").onclick = function () { addSheet(m, r, pp); };
    try {
      var ex = EL.EXTRA[m.id], xx = {}; if (ex) xx[ex[0]] = 1;
      var tk = EL.take(m.id, pp, r, xx);
      if (tk.items.length) {
        var ed1 = mkData([], [{ mark: nextMark(m.id), nos: 1, title: m.t, take: tk }], m.t + " — detailed estimate (JKSOR 2022)"), c1 = ed1.cb, anchor = out.querySelector(".gov") || out.querySelector(".sum") || out.querySelector(".rh");
        anchor.insertAdjacentHTML("afterend", '<details class="estd noprint" id="estd"><summary>' + IC.svg("estimate") + '<span><b>Detailed estimate</b><small>' + (ex ? 'per 1 m ' + (ex[0] === "len" ? "length" : "width") : '1 no.') + ' · ' + (c1.kg ? (c1.kg).toFixed(0) + ' kg steel · ' : '') + 'JKSOR 2022</small></span><em>' + inr(ed1.model.total) + '</em></summary>' + elemEstHtml(ed1, "detailed") +
          '<div class="btns"><button type="button" class="pri" id="addp2">' + IC.svg("projects") + ' Add to project with the number of elements' + (ex ? ' and the ' + (ex[0] === "len" ? "length" : "width") : '') + '</button></div></details>');
        document.getElementById("addp2").onclick = function () { addSheet(m, r, pp); };
        out.querySelectorAll("#estd .estx").forEach(function (b) { b.onclick = function () { estExcel(ed1, m.t); }; });
      }
    } catch (e) {}
    document.getElementById("xls").onclick = function () { toast("Preparing Excel…"); RX.save(RX.fromRep(r, m, read(m, form)), m.id + "-design.xlsx", function (ok) { if (!ok) toast("Excel export not available here"); }); };
    if (!quiet) out.scrollIntoView({ behavior: "smooth" });
    }
  }
  var BG = { off: false };
  function bgOn() { return typeof PAR !== "undefined" && !BG.off && (PAR.ok() || !PAR.tried); }

  function unitSeg() { var c = UN.sys(); return '<span class="seg useg" role="group" aria-label="Units">' + ["si", "mks", "fps"].map(function (s) { return '<button type="button" data-u="' + s + '"' + (s === c ? ' class="on"' : '') + '>' + UN.SYS[s].short + '</button>'; }).join("") + '</span>'; }
  function bindUnitSeg(root, after) { root.querySelectorAll(".useg button").forEach(function (b) { b.onclick = function () { var s = b.getAttribute("data-u"); if (s === UN.sys()) return; if (after) after(s, true); UN.set(s); if (after) after(s); toast("Input units: " + UN.SYS[s].name); }; }); }
  /* ---------- project elements ---------- */
  var editEl = null;
  function elems() { return window.PDB && PDB.current() ? (PDB.current().elements || []) : []; }
  function nextMark(id) { var pre = EL.PREFIX[id] || "E", n = 1, ms = elems().map(function (e) { return e.mark; }); while (ms.indexOf(pre + n) >= 0) n++; return pre + n; }
  function addSheet(m, r, p) {
    if (!window.PDB) return toast("Projects are not available here");
    var box = document.getElementById("addsheet"), list = elems(), ed = editEl && list.filter(function (e) { return e.id === editEl.id; })[0], ex = EL.EXTRA[m.id];
    box.innerHTML = '<div class="sheet"><b>' + (ed ? 'Update ' + esc(ed.mark) : 'Add to ' + esc(PDB.current().name)) + '</b>' +
      '<div class="sgrid"><label class="fld"><span>Mark</span><input id="aMark" value="' + esc(ed ? ed.mark : nextMark(m.id)) + '"></label><label class="fld"><span>Number of identical elements</span><input id="aNos" type="number" min="1" step="1" inputmode="numeric" value="' + (ed ? ed.nos : 1) + '"></label>' +
      (ex ? '<label class="fld"><span>' + ex[1] + '</span><span class="inw"><input id="aX" type="number" step="any" inputmode="decimal" value="' + esc(UN.show(ed && ed.x && ed.x[ex[0]] || ex[3], ex[2])) + '"><em class="u">' + UN.label(ex[2]) + '</em></span></label>' : '') + '</div>' +
      (r.ok() ? '' : '<div class="note">This design has failing checks — it will be listed as failing in the project.</div>') +
      '<div class="btns"><button type="button" class="pri" id="aSave">' + (ed ? "Update" : "Add") + '</button>' + (ed ? '<button type="button" id="aNew">Add as new</button>' : '') + '<button type="button" id="aCan">Cancel</button></div></div>';
    function save(asNew) {
      var mark = document.getElementById("aMark").value.trim() || nextMark(m.id), nos = Math.max(1, Math.round(+document.getElementById("aNos").value || 1)), x = {};
      if (ex) { var xv = parseFloat(document.getElementById("aX").value); x[ex[0]] = isFinite(xv) && xv > 0 ? UN.toSI(xv, ex[2]) : ex[3]; }
      var dup = elems().filter(function (e) { return e.mark === mark && (asNew || !ed || e.id !== ed.id); })[0];
      if (dup) return toast("Mark " + mark + " is already used in this project");
      var t = EL.take(m.id, p, r, x), cost = EST.fromTakes([{ mark: mark, nos: nos, title: m.t, take: t }]).total;
      var el = { id: ed && !asNew ? ed.id : "e" + Date.now().toString(36), mod: m.id, title: m.t, mark: mark, nos: nos, x: x, inputs: store(m.id) || {}, ok: r.ok(), sum: r.summary.slice(0, 4), cost: cost, kg: t.bars.reduce(function (a, q) { return a + q.kg; }, 0) * nos, units: UN.sys(), date: new Date().toISOString() };
      var arr = elems().slice();
      if (ed && !asNew) arr = arr.map(function (e) { return e.id === ed.id ? el : e; }); else arr.push(el);
      PDB.update(PDB.current().id, { elements: arr }, (ed && !asNew ? "Element updated: " : "Element added: ") + mark + " (" + m.t + ")");
      editEl = { id: el.id, mod: m.id };
      box.innerHTML = '<div class="sheet ok">' + IC.svg("check") + ' <span>' + esc(mark) + ' ' + (ed && !asNew ? 'updated' : 'added') + ' — ' + arr.length + ' element(s) in ' + esc(PDB.current().name) + '</span><a href="#elements" class="btnl">View project ›</a></div>';
      var ab = document.getElementById("addp"); if (ab) ab.innerHTML = IC.svg("projects") + " Update " + esc(mark) + " in project";
    }
    document.getElementById("aSave").onclick = function () { save(false); };
    if (ed) document.getElementById("aNew").onclick = function () { save(true); };
    document.getElementById("aCan").onclick = function () { box.innerHTML = ""; };
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function modById(id) { return M.filter(function (x) { return x.id === id; })[0]; }
  function runEl(e) { var m = modById(e.mod); if (!m) return null; try { var p = parse(m, e.inputs || {}), r = m.fn(p); r.mid = m.id; return { m: m, p: p, r: r, t: EL.take(m.id, p, r, e.x) }; } catch (er) { return null; } }
  function inr(v) { return "₹ " + Math.round(v).toLocaleString("en-IN"); }
  function etb(head, rows, cls) { return '<div class="tw"><table class="etb ' + (cls || "") + '"><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join("") + '</tr>' + rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + x + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>'; }
  function elemData(list, title) { var runs = list.map(function (e) { return { e: e, x: runEl(e) }; }), okRuns = runs.filter(function (q) { return q.x; }); return mkData(runs, okRuns.map(function (q) { return { mark: q.e.mark, nos: q.e.nos, title: q.e.title, take: q.x.t }; }), title); }
  function mkData(runs, els, title) { return { runs: runs, okRuns: runs.filter(function (q) { return q.x; }), els: els, cb: EL.combine(els), model: EST.fromTakes(els, title || ((window.PDB && PDB.current() ? PDB.current().name + " — " : "") + "detailed estimate of the designed elements (JKSOR 2022)")) }; }
  function elemEstHtml(ed, view) {
    var cb = ed.cb, h = view === "detailed" ? '<h4>Detailed estimate</h4>' + EST.html(ed.model, esc) : '<h4>Abstract of cost</h4>' + EST.abstractHtml(ed.model, esc);
    if (view === "detailed" && cb.bbs.length) h += '<h4>Reinforcement — bar bending schedule</h4>' + etb(["Bar mark", "Description", "φ", "No.", "Length (m)", "kg"], cb.bbs.map(function (q) { return ["<b>" + esc(q.mark) + "</b>", esc(q.desc) + '<div class="dims">' + q.n + " nos " + q.dia + "φ × " + (q.L / 1000).toFixed(2) + ' m</div>', String(q.dia), String(q.n), (q.L / 1000).toFixed(2), q.kg.toFixed(1)]; }).concat([["", "<b>Total</b>", "", "", "", "<b>" + cb.kg.toFixed(1) + "</b>"]]), "est");
    return h + '<div class="note">J&K R&B format: items of work in order, measurement No. × L × B × D/H, totals carried to Quantity × Rate = Amount. Rates JKSOR 2022 (inclusive of GST, so no GST is added); carriage of aggregate (' + EST.CARRIAGE.agg[2] + ') and sand (' + EST.CARRIAGE.sand[2] + ') as in the reference format — change the leads and rates in the Excel. Excavation, backfill and finishes are not part of the element take-off.</div>' +
      '<div class="btns noprint"><button type="button" class="pri estx">' + IC.svg("estimate") + ' Excel — detailed estimate</button></div>';
  }
  function estExcel(ed, name) {
    var wb = XL.book(); EST.sheet(wb, ed.model, "Detailed Estimate", "Rates JKSOR 2022 (inclusive of GST) — edit any rate in column O; carriage leads as in the reference format.");
    if (ed.cb.bbs.length) { var b = wb.sheet("BBS", { cols: [10, 52, 7, 8, 12, 10, 12] }); b.row(["Bar bending schedule"], "t"); b.row(["Bar mark", "Description", "φ (mm)", "No.", "Cut length (m)", "kg/m", "Weight (kg)"], "h"); var f0 = b.next(); ed.cb.bbs.forEach(function (q) { var r = b.next(); b.row([q.mark, q.desc, { v: q.dia, s: "n0" }, { v: q.n, s: "n0" }, { v: q.L / 1000, s: "n3" }, { f: "=C" + r + "^2/162", v: q.dia * q.dia / 162, s: "f4" }, { f: "=D" + r + "*E" + r + "*F" + r, v: q.kg, s: "f2" }]); }); var lr = b.next(); b.row(["", "Total", "", "", "", "", { f: "=SUM(G" + f0 + ":G" + (lr - 1) + ")", v: ed.cb.kg, s: "f2" }], "b"); }
    toast("Preparing Excel…"); RX.save(wb, name.replace(/[^\w\- ]+/g, "_") + "-detailed-estimate.xlsx", function (ok) { if (!ok) toast("Excel export not available here"); });
  }
  /* ---------- estimate hub: building (frame model) and designed elements ---------- */
  function estimateView() {
    title.textContent = "Estimate"; back.hidden = false;
    var pr = window.PDB ? PDB.current() : null, S = window.SU && SU.state ? SU.state() : null, list = elems();
    var v = (window.PRO && PRO.estView()) || "detailed"; if (window.PRO) PRO.estView(v);
    var h = '<div class="mhead g-ana"><span class="mic">' + IC.svg("estimate") + '</span><div><b>Estimate</b><small>' + esc(pr ? pr.name : "") + ' · quantities and cost, JKSOR 2022</small></div></div>';
    h += '<span class="seg etabs" id="estSeg">' + [["detailed", "Detailed estimate"], ["boq", "Abstract / BOQ"]].map(function (t) { return '<button type="button" data-v="' + t[0] + '"' + (v === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join("") + '</span>';
    h += '<div class="rep" id="estB"><div class="rh"><div><h3>Building — frame & FE model</h3><small>Structure, masonry, plaster, flooring and plinth of the whole building (IS 1200 style measurement)</small></div></div>';
    if (S && S.boq) h += PRO.boqBlock(S);
    else h += '<p>The building estimate is prepared from the analysed and detailed frame model.' + (pr && pr.summary && pr.summary.cost ? ' Last run: <b>' + inr(pr.summary.cost) + '</b> (' + new Date(pr.summary.date).toLocaleDateString("en-IN") + ').' : '') + '</p><div class="btns"><button type="button" class="pri" id="estRun">' + IC.svg("play") + ' Analyse the building and prepare the estimate</button><a class="btnl" href="#model">Open the model ›</a></div>';
    h += '</div><div class="rep" id="estE"><div class="rh"><div><h3>Designed elements</h3><small>' + list.length + ' element(s) added from the design modules</small></div><a class="btnl" href="#elements">Elements ›</a></div>';
    var ed = null;
    if (list.length) { ed = elemData(list); h += '<div class="sum"><div><span>Reinforcement</span><b>' + (ed.cb.kg / 1000).toFixed(2) + ' t</b></div><div><span>Estimated cost (JKSOR 2022)</span><b>' + inr(ed.model.total) + '</b></div></div>' + elemEstHtml(ed, v) + '<div class="btns noprint"><button type="button" id="estCsv">Estimate CSV</button><button type="button" id="estPrint">Print / Save PDF</button></div>'; }
    else h += '<p>No elements yet — design a beam, slab, column, footing, pile group or raft and tap <b>Add to project</b>.</p>';
    h += '</div>';
    app.innerHTML = h;
    app.querySelectorAll("#estSeg button").forEach(function (b) { b.onclick = function () { PRO.estView(b.getAttribute("data-v")); estimateView(); }; });
    if (S && S.boq && window.SU) SU.bindBoq(estimateView);
    app.querySelectorAll("#estE .estx").forEach(function (b) { b.onclick = function () { estExcel(ed, (pr && pr.name) || "project"); }; });
    if (S && S.boq) { var bx = document.createElement("div"); bx.className = "btns noprint"; bx.innerHTML = '<button type="button" class="pri" id="estBx">' + IC.svg("estimate") + ' Excel — building detailed estimate</button>'; document.getElementById("estB").appendChild(bx);
      document.getElementById("estBx").onclick = function () { var wb = XL.book(); EST.sheet(wb, EST.fromBoq(S.boq, ((pr && pr.name) || "Building") + " — detailed estimate (JKSOR 2022)"), "Detailed Estimate", "Measured from the designed model (IS 1200 style); rates JKSOR 2022 or your own; carriage leads as in the reference format."); toast("Preparing Excel…"); RX.save(wb, ((pr && pr.name) || "building").replace(/[^\w\- ]+/g, "_") + "-building-detailed-estimate.xlsx", function (ok) { if (!ok) toast("Excel export not available here"); }); }; }
    var er = document.getElementById("estRun"); if (er) er.onclick = function () { location.hash = "#model"; setTimeout(function () { SU.analyseThen("estimate"); }, 150); };
    var ep = document.getElementById("estPrint"); if (ep) ep.onclick = function () { if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print("Estimate"); else window.print(); };
    var ec = document.getElementById("estCsv"); if (ec) ec.onclick = function () { location.hash = "#elements"; setTimeout(function () { var b = document.getElementById("eCsv"); if (b) b.click(); }, 300); };
  }
  function elementsView() {
    title.textContent = "Project elements"; back.hidden = false;
    var pr = PDB.current(), list = elems(), tab = elementsView.tab || "est";
    var h = '<div class="mhead g-ana"><span class="mic">' + IC.svg("projects") + '</span><div><b>' + esc(pr.name) + '</b><small>Individually designed elements · ' + list.length + ' element(s)</small></div><a class="cchip" href="#projects">Project ›</a></div>';
    if (!list.length) { app.innerHTML = h + '<div class="rep"><p>No elements yet. Design a beam, slab, column, footing, pile group or steel member and tap <b>Add to project</b> under the result.</p><div class="btns"><a class="btnl pri" href="#">Design a member ›</a></div></div>'; return; }
    var ed = elemData(list), runs = ed.runs, okRuns = ed.okRuns, cb = ed.cb, nf = okRuns.filter(function (q) { return !q.x.r.ok(); }).length;
    h += '<div class="sum"><div><span>Elements</span><b>' + list.length + ' types · ' + list.reduce(function (a, e) { return a + e.nos; }, 0) + ' nos</b></div><div><span>Checks</span><b class="' + (nf ? "bad" : "good") + '">' + (nf ? nf + " failing" : "All pass") + '</b></div><div><span>Reinforcement</span><b>' + (cb.kg / 1000).toFixed(2) + ' t</b></div><div><span>Estimate (JKSOR 2022)</span><b>' + inr(ed.model.total) + '</b></div></div>';
    h += '<div class="elist">' + runs.map(function (q) {
      var e = q.e, ok = q.x ? q.x.r.ok() : e.ok, sm = (q.x ? q.x.r.summary : e.sum).slice(0, 3);
      return '<div class="ecard"><div class="eh"><span class="emk">' + esc(e.mark) + '</span><div><b>' + esc(e.title) + (e.nos > 1 ? ' × ' + e.nos : '') + '</b><small>' + sm.map(function (s) { return esc(s[0] + ": " + s[1]); }).join(" · ") + '</small></div><span class="badge ' + (ok ? "pass" : "fail") + '">' + (ok ? "PASS" : "FAIL") + '</span></div>' +
        '<div class="eb"><button type="button" data-eo="' + e.id + '">Open</button><button type="button" data-er="' + e.id + '">Remove</button></div></div>';
    }).join("") + '</div>';
    h += '<span class="seg etabs">' + [["est", "Detailed estimate"], ["sched", "Schedule"], ["bbs", "Bar bending schedule"]].map(function (t) { return '<button type="button" data-t="' + t[0] + '"' + (tab === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join("") + '</span>';
    var tb = etb, body = "";
    if (tab === "sched") body = '<h4>Schedule of elements</h4>' + tb(["Mark", "Element", "Nos", "Size & reinforcement", "Status"], runs.map(function (q) { var e = q.e, sm = q.x ? q.x.r.summary : e.sum; return ["<b>" + esc(e.mark) + "</b>", esc(e.title), String(e.nos), sm.map(function (s) { return esc(s[0] + ": " + s[1]); }).join("<br>"), q.x && q.x.r.ok() ? '<span class="okt">pass</span>' : '<span class="bad">fail</span>']; }));
    else if (tab === "bbs") body = '<h4>Bar bending schedule (IS 2502)</h4>' + tb(["Bar mark", "Description", "Dia (mm)", "No.", "Cut length (m)", "Weight (kg)"], cb.bbs.map(function (q) { return ["<b>" + esc(q.mark) + "</b>", esc(q.desc), String(q.dia), String(q.n), (q.L / 1000).toFixed(2), q.kg.toFixed(1)]; }).concat([["", "<b>Total</b>", "", "", "", "<b>" + cb.kg.toFixed(1) + "</b>"]])) +
      '<h4>Steel by diameter</h4>' + tb(["Dia (mm)", "Weight (kg)", "Weight + 3 % (kg)"], Object.keys(cb.byDia).sort(function (a, b) { return a - b; }).map(function (d) { return [d, cb.byDia[d].toFixed(1), (cb.byDia[d] * 1.03).toFixed(1)]; })) + '<div class="note">Cut lengths: span + Ld/3 anchorage at each support (IS 456 cl 26.2.3.3), 50φ laps in columns, stirrups and ties 2(a + b) + 20φ hooks. Pile and raft schedules are taken from their own designs.</div>';
    else body = elemEstHtml(ed, "detailed");
    h += '<div class="rep">' + body + '</div>';
    h += '<div class="btns noprint"><button type="button" class="pri" id="eRep">Combined calculation report (print / PDF)</button><button type="button" id="eCsv">Estimate CSV</button></div><div id="eAll"></div>';
    app.innerHTML = h;
    app.querySelectorAll(".etabs button").forEach(function (b) { b.onclick = function () { elementsView.tab = b.getAttribute("data-t"); elementsView(); }; });
    app.querySelectorAll(".estx").forEach(function (b) { b.onclick = function () { estExcel(ed, pr.name || "project"); }; });
    app.querySelectorAll("[data-eo]").forEach(function (b) { b.onclick = function () { var e = list.filter(function (q) { return q.id === b.getAttribute("data-eo"); })[0]; var inp = Object.assign({}, e.inputs, { __ran: true }); store(e.mod, inp); editEl = { id: e.id, mod: e.mod }; location.hash = "#" + e.mod; }; });
    app.querySelectorAll("[data-er]").forEach(function (b) { b.onclick = function () {
      if (b.getAttribute("data-arm") !== "1") { b.setAttribute("data-arm", "1"); b.textContent = "Tap again to remove"; setTimeout(function () { b.removeAttribute("data-arm"); b.textContent = "Remove"; }, 3000); return; }
      var id = b.getAttribute("data-er"), e = list.filter(function (q) { return q.id === id; })[0];
      PDB.update(pr.id, { elements: list.filter(function (q) { return q.id !== id; }) }, "Element removed: " + e.mark); toast("Removed " + e.mark); elementsView(); }; });
    document.getElementById("eRep").onclick = function () {
      var all = '<div class="rep"><h3>' + esc(pr.name) + ' — calculation report of the designed elements</h3><small>' + esc([pr.jobNo, pr.client, pr.site].filter(Boolean).join(" · ")) + ' · ' + new Date().toLocaleDateString("en-IN") + ' · engine ' + REG.ENGINE + '</small>' + document.querySelector(".rep").outerHTML.replace(/^<div class="rep">|<\/div>$/g, "") + '</div>';
      all += okRuns.map(function (q) { return '<div class="pbrk"></div><h3 class="elh">' + esc(q.e.mark) + (q.e.nos > 1 ? ' (' + q.e.nos + ' nos)' : '') + ' — ' + esc(q.e.title) + '</h3>' + render(q.x.r, { bare: true }); }).join("");
      document.getElementById("eAll").innerHTML = all;
      setTimeout(function () { if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print(pr.name + " elements"); else if (window.self === window.top) window.print(); else { toast("Report below — use your browser's print to save a PDF"); document.getElementById("eAll").scrollIntoView({ behavior: "smooth" }); } }, 200);
    };
    document.getElementById("eCsv").onclick = function () {
      var rows = [["Item", "Description", "SOR", "Qty", "Unit", "Rate", "Amount"]].concat(cb.items.map(function (q, i) { return [i + 1, q.d, q.sor, q.q.toFixed(3), q.u, q.rate, Math.round(q.q * (q.rate || 0))]; }), [["", "Total", "", "", "", "", Math.round(cb.sum)]], [[]], [["Element", "Description", "No.", "L", "B", "H", "Qty"]], cb.meas.map(function (q) { return [q.el, q.d, q.n, q.L, q.B, q.H, q.q.toFixed(3)]; }));
      saveText((pr.name || "project").replace(/[^\w\- ]+/g, "_") + "-elements-estimate.csv", rows.map(function (r) { return r.map(function (x) { x = String(x === undefined ? "" : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(","); }).join("\n"));
    };
  }
  function fl(m, k) { return m.f[k] ? m.f[k].label.replace(/<[^>]+>/g, "") : k; }
  function fixBox(m, form, p, out) {
    var rh = out.querySelector(".rh"); if (!rh) return;
    rh.insertAdjacentHTML("afterend", '<div class="fixbox" id="fixbox"><b>' + IC.svg("bulb") + ' How to make it pass</b><div class="busy"><i></i>Trying changes to the inputs…</div></div>');
    setTimeout(function () {
      var box = document.getElementById("fixbox"); if (!box) return;
      var q = Object.assign({}, p); delete q.__defaults;
      var bud = /pile|raft/.test(m.id) ? 30 : 140, nl = LIM.nLevers(m.id, q);
      if (bgOn() && MODS[m.id] && nl > 1) {
        PAR.tried = true;
        var k = Math.min(HW.workers, nl), shards = []; for (var si = 0; si < k; si++) shards.push([]);
        for (var li = 0; li < nl; li++) shards[li % k].push(li);
        Promise.all(shards.map(function (sh) { return PAR.job("fixes", { id: m.id, p: q, fn: "MODS." + m.id, opt: { budget: bud, only: sh, noPairs: true, max: 8 } }); })).then(function (parts) {
          var list = [].concat.apply([], parts.map(function (x) { return x.list; })).sort(function (a, b) { return a.rank - b.rank; });
          if (list.length) return { list: list.slice(0, 4) };
          return PAR.job("fixes", { id: m.id, p: q, fn: "MODS." + m.id, opt: { budget: bud } });
        }).then(function (fx) { showFixes(fx); }, function () { showFixes(LIM.fixes(m.id, q, function (z) { return m.fn(Object.assign({ __defaults: [] }, z)); }, { budget: bud })); });
        return;
      }
      showFixes(LIM.fixes(m.id, q, function (z) { return m.fn(Object.assign({ __defaults: [] }, z)); }, { budget: bud }));
    }, 30);
    function showFixes(fx) {
      var box = document.getElementById("fixbox"); if (!box) return;
      var fails = (out.__rep && out.__rep.checks || []).filter(function (c) { return !c.ok; }).map(function (c) { return c.l; });
      var h = '<b>' + IC.svg("bulb") + ' How to make it pass</b>' + (fails.length ? '<small>Failing: ' + esc(fails.join(" · ")) + '</small>' : '');
      if (fx.list.length) h += fx.list.map(function (s, i) { return '<div class="fx"><span>' + esc(s.text) + '</span><button type="button" data-i="' + i + '">Apply</button></div>'; }).join("") + '<small>Each option makes every check pass on its own; the first is the smallest change. Apply fills the input and recalculates.</small>';
      else h += '<small>No single change of size, bars or grade within the usual range makes every check pass — review the loads, spans or support conditions' + (/beam|slab|stair/.test(m.id) ? ', or add an intermediate support' : '') + '.</small>';
      box.innerHTML = h;
      box.querySelectorAll("button[data-i]").forEach(function (b) { b.onclick = function () {
        var set = fx.list[+b.getAttribute("data-i")].set;
        Object.keys(set).forEach(function (k) { var el = form.elements[k], v = set[k], f = m.f[k]; if (!el) return; if (f && f.type === "number") { var sh = UN.show(v, f.unit); el.value = sh; el.setAttribute("data-si", v); el.setAttribute("data-shown", sh); } else el.value = v === true ? "1" : v === false ? "" : String(v); });
        run(m, form); toast("Applied: " + fx.list[+b.getAttribute("data-i")].text);
      }; });
    }
  }
  /* utilisation from a check's text "a ≤ b …" or "a ≥ b" (the limit is the value after "=" if present) */
  function util(d) {
    var t = String(d || ""), m = /(-?\d[\d,]*\.?\d*)[^≤≥<>]*?([≤≥<>])(.*)$/.exec(t); if (!m) return null;
    var a = parseFloat(m[1].replace(/,/g, "")), nums = (m[3].match(/-?\d[\d,]*\.?\d*/g) || []).map(function (x) { return parseFloat(x.replace(/,/g, "")); }), b = nums.length ? nums[0] : NaN;
    if (/=/.test(m[3])) { var eq = m[3].split("=").pop().match(/-?\d[\d,]*\.?\d*/); if (eq) b = parseFloat(eq[0].replace(/,/g, "")); }
    if (!(isFinite(a) && isFinite(b)) || a < 0 || b <= 0) return null;
    var u = m[2] === "≥" || m[2] === ">" ? (a > 0 ? b / a : null) : a / b;
    return u !== null && u >= 0 && u < 5 ? u : null;
  }
  function render(r, opt) {
    var ok = r.ok(), h = '<section class="rep"><div class="rh"><div><h3>' + esc(r.title) + '</h3><small>' + esc(r.code) + ' • ' + new Date().toLocaleDateString("en-IN") + '</small></div><span class="badge ' + (ok ? "pass" : "fail") + '">' + (ok ? "ALL CHECKS PASS" : "CHECK FAILS") + '</span></div>';
    if (r.summary.length) h += '<div class="sum">' + r.summary.map(function (s) { return '<div><span>' + esc(s[0]) + '</span><b>' + esc(s[1]) + '</b></div>'; }).join("") + '</div>';
    if (r.checks.length) { var gv = null, gu = -1, np = r.checks.filter(function (c) { return c.ok; }).length;
      r.checks.forEach(function (c) { var u = util(c.d); if (!c.ok && (u === null || u <= 1)) u = 1.0001; if (u !== null && u > gu) { gu = u; gv = c; } });
      h += '<div class="gov ' + (ok ? "pass" : "fail") + '"><div class="gh"><span>' + (gv ? 'Governing check' : 'Checks') + '</span><em>' + np + ' / ' + r.checks.length + ' pass</em></div>' + (gv ? '<b>' + esc(gv.l) + (gv.ref ? ' <i>' + esc(gv.ref) + '</i>' : '') + '</b><div class="ub big"><i style="width:' + Math.min(100, gu * 100).toFixed(1) + '%" class="' + (gu > 1 ? "x" : gu > 0.9 ? "w" : "g") + '"></i><em>' + Math.round(gu * 100) + ' %</em></div>' : '') + '</div>'; }
    if (r.mid && window.REG && REG.auditHtml) h += REG.auditHtml(r.mid, esc);
    if (r.svg) h += '<div class="svg">' + r.svg + '</div>';
    r.items.forEach(function (it) {
      if (it.k === "h") h += '<h4>' + esc(it.t) + '</h4>';
      else if (it.k === "r") h += '<div class="row"><span>' + esc(it.l) + (it.ref ? ' <i>' + esc(it.ref) + '</i>' : '') + '</span><b>' + esc(it.v) + ' ' + esc(it.u) + '</b></div>';
      else if (it.k === "e") h += '<div class="eq">' + esc(it.t) + (it.ref ? ' <i>[' + esc(it.ref) + ']</i>' : '') + '</div>';
      else if (it.k === "n") h += '<div class="note">' + esc(it.t) + '</div>';
      else if (it.k === "x") h += '<div class="err">' + esc(it.t) + '</div>';
      else if (it.k === "c") { var ur = util(it.c.d); h += '<div class="chk ' + (it.c.ok ? "ok" : "no") + '"><span>' + (it.c.ok ? "✔" : "✘") + ' ' + esc(it.c.l) + (it.c.ref ? ' <i>' + esc(it.c.ref) + '</i>' : '') + '</span><b>' + esc(it.c.d) + '</b>' + (ur !== null ? '<div class="ub" title="utilisation"><i style="width:' + Math.min(100, ur * 100).toFixed(1) + '%" class="' + (ur > 1 ? "x" : ur > 0.9 ? "w" : "g") + '"></i><em>' + Math.round(ur * 100) + ' %</em></div>' : '') + '</div>'; }
      else if (it.k === "t") h += '<div class="tw"><table><tr>' + it.head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join("") + '</tr>' + it.rows.map(function (rw) { return '<tr>' + rw.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>';
    });
    h += '<div class="disc">Design aid based on IS codes — results must be checked and approved by a qualified structural engineer.</div>';
    if (opt && opt.bare) return h + '</section>';
    var ed = editEl && PDB.current() && (PDB.current().elements || []).filter(function (e) { return e.id === editEl.id; })[0];
    h += '<div class="btns noprint"><button id="addp" class="pri">' + IC.svg("projects") + ' ' + (ed ? 'Update ' + esc(ed.mark) + ' in project' : 'Add to project') + '</button><button id="pdf">Print / Save PDF</button><button id="xls">Excel (.xlsx)</button>' + (r.dxf ? '<button id="dxf">Drawings (.dxf)</button>' : '') + '<button id="share">Share</button></div><div id="addsheet"></div></section>';
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
  function aidsView() {
    title.textContent = "Design aids"; back.hidden = false;
    var list = window.AIDS || [], gs = [], g = aidsView.g || "all";
    list.forEach(function (a) { if (gs.indexOf(a.grp) < 0) gs.push(a.grp); });
    var h = '<div class="mhead g-ref"><span class="mic">' + IC.svg("aids") + '</span><div><b>Design aids</b><small>Charts in the style of SP 16, drawn from this app\'s IS 456 engine · tap a chart to zoom</small></div><em class="cchip">SP 16 style</em></div>';
    h += '<div class="chips" id="achips">' + [["all", "All"]].concat(gs.map(function (x) { return [x, x]; })).concat([["Ld", "Development length"]]).map(function (c) { return '<button type="button" data-g="' + esc(c[0]) + '"' + (g === c[0] ? ' class="on"' : '') + '>' + esc(c[1]) + '</button>'; }).join("") + '</div>';
    if (g === "Ld") {
      var dias = [8, 10, 12, 16, 20, 25, 28, 32], grades = [20, 25, 30, 35, 40];
      h += '<div class="rep"><h4>Development length Ld in tension (mm) — IS 456 cl 26.2.1, deformed bars (τbd + 60 %)</h4>' + [415, 500].map(function (fy) {
        return '<div class="tw"><table class="etb ldt"><tr><th>Fe ' + fy + ' · bar φ</th>' + grades.map(function (c) { return '<th>M' + c + '</th>'; }).join("") + '</tr>' + dias.map(function (d) { return '<tr><td><b>' + d + ' mm</b></td>' + grades.map(function (c) { var L = RCC.Ld(d, fy, c); return '<td>' + Math.ceil(L / 10) * 10 + '<small> (' + Math.round(L / d) + 'φ)</small></td>'; }).join("") + '</tr>'; }).join("") + '</table></div>';
      }).join("") + '<div class="note">In compression Ld is 25 % less (τbd + 25 %). Lap length in tension ≥ Ld or 30φ (cl 26.2.5.1); in flexural tension 2Ld for bars over 36 mm is not permitted. Values are rounded up to 10 mm.</div></div>';
    }
    if (g !== "Ld") {
      h += '<div class="agrid">' + list.filter(function (a) { return g === "all" || a.grp === g; }).map(function (a) { return '<button type="button" class="acard" data-a="' + esc(a.id) + '"><img loading="lazy" src="' + a.file + '" alt="' + esc(a.title) + '"><b>' + esc(a.title) + '</b><small>' + esc(a.grp) + '</small></button>'; }).join("") + '</div>';
      h += '<div class="note">How to read the column charts: compute Pu/(fck·b·D) and Mu/(fck·b·D²) for the section, read p/fck at the point, then p = (p/fck) × fck gives the steel % (bars as named on the chart, d\' = cover to the bar centre). For biaxial bending use cl 39.6 with Mux1, Muy1 from the charts. Each chart is drawn from the same strain-compatibility routine that designs the columns and piles in this app.</div>';
    }
    app.innerHTML = h;
    app.querySelectorAll("#achips button").forEach(function (b) { b.onclick = function () { aidsView.g = b.getAttribute("data-g"); aidsView(); }; });
    app.querySelectorAll(".acard").forEach(function (b) { b.onclick = function () { var a = list.filter(function (x) { return x.id === b.getAttribute("data-a"); })[0]; zoom(a); }; });
  }
  function zoom(a) {
    var z = 1, d = document.createElement("div"); d.className = "zoomv";
    d.innerHTML = '<div class="zt"><b>' + esc(a.title) + '</b><span><button type="button" data-z="-">−</button><button type="button" data-z="+">+</button><button type="button" data-z="x">✕</button></span></div><div class="zs"><img src="' + a.file + '" alt=""></div>';
    document.body.appendChild(d);
    var img = d.querySelector("img");
    function setZ(v) { z = Math.max(1, Math.min(4, v)); img.style.width = (z * 100) + "%"; }
    d.querySelectorAll("[data-z]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-z"); if (k === "x") { d.remove(); history.replaceState(null, "", location.href); } else setZ(z + (k === "+" ? 0.5 : -0.5)); }; });
    img.ondblclick = function () { setZ(z > 1 ? 1 : 2.5); };
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
      '<h4>This device</h4><p id="hwinfo">' + esc(typeof HW !== "undefined" ? HW.summary() : "") + '</p><p class="note">Long analyses run on background CPU cores (the screen stays responsive and can cancel), independent jobs such as fix searches and pile / raft designs run on several cores at once, and the 3D viewer draws with the GPU. Results are identical on every device.</p>' +
      '<h4>What it does</h4><ul><li>Frame & shell FE analysis: linear static, P-Delta, modal and response spectrum (IS 1893:2016), accidental torsion, pushover</li>' +
      '<li>Design: IS 456 (limit state or working stress), IS 800, with worked calculations</li><li>Loads & durability: snow (IS 875 Pt 4), pattern imposed load, imposed-load reduction, covers for exposure and fire (IS 456 Table 16/16A)</li><li>Automatic design & detailing: storey-wise enlargement until every check passes</li>' +
      '<li>Detailing: IS 13920 beams, columns, joints, strong column–weak beam, shear walls, slabs, isolated footings; bar bending schedule (IS 2502)</li><li>Mat (raft) foundations: plate on compression-only soil springs, punching, one-way shear, flexure, settlement (IS 2950, IS 456, IS 1904)</li>' +
      '<li>Outputs: Excel with live formulas, calculation report (print/PDF), drawing set DXF, STAAD.Pro input (export, and import of .std files with model checks), BOQ of the whole building priced with JKSOR 2022 (rates inclusive of GST; contingencies and cess added) and reinforcement schedules</li>' +
      '<li>Projects: offline database with revisions, backups and an engineering verification mode with reviewer sign-off; engineering assistant</li><li>Standalone modules for beams, slabs, columns, footings, piles, rafts, stairs, steel members, connections, trusses and loads — input units SI / MKS / FPS, code limits on inputs, fix suggestions, and project elements with schedule, bar bending schedule and estimate</li><li>Design aids: SP 16 style charts and development-length tables</li></ul>' +
      '<h4>Not covered</h4><ul><li>Time-history analysis, combined footings, piled raft, beam-slab raft, consolidation settlement, full soil–structure interaction</li><li>Deflection and crack width in the frame design (use the beam and slab modules)</li><li>Full building wind pressure-coefficient workflow</li></ul>' +
      (window.REG ? REG.html(esc) : '') +
      '<h4>Important</h4><p>Results are for design assistance. Every design must be checked, and drawings signed, by a qualified structural engineer.</p></div>';
  }

  function route() {
    var id = (location.hash || "").replace(/^#\/?/, "");
    var m = M.filter(function (x) { return x.id === id; })[0];
    var ctx = window.SU ? SU.ctx() : null;
    if ((!m && id !== "elements" && id !== "estimate") || (m && editEl && editEl.mod !== m.id)) editEl = null;
    if (id === "estimate") estimateView(); else if (id === "elements" && window.PDB) elementsView(); else if (m) moduleView(m); else if (id === "model" && window.SU) SU.view(app, title, back); else if (id === "projects" && window.PRO) PRO.projectsView(app, title, back, ctx); else if (id === "report" && window.RPT) RPT.view(app, title, back, ctx);
    else if (id === "tables") tables(); else if (id === "aids") aidsView(); else if (id === "about") about(); else home();
    var tab = m ? "" : id === "estimate" ? "estimate" : id === "model" ? "model" : id === "projects" || id === "elements" ? "projects" : id === "report" ? "report" : id === "about" || id === "tables" || id === "aids" ? "about" : id ? "" : "home";
    document.querySelectorAll(".tabbar a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-t") === tab); });
    window.scrollTo(0, 0);
  }
  back.onclick = function () { if (location.hash) location.hash = ""; };
  /* app chrome: logo, bottom tab bar, light / dark theme */
  var lg = document.getElementById("logo"); if (lg) lg.innerHTML = '<img src="logo-mark-128.png" alt="" width="34" height="34">';
  var tb = document.createElement("nav"); tb.className = "tabbar noprint";
  tb.innerHTML = [["home", "#", "home", "Home"], ["projects", "#projects", "projects", "Projects"], ["estimate", "#estimate", "estimate", "Estimate"], ["model", "#model", "frame", "Analysis"], ["report", "#report", "report", "Report"]].map(function (t) { return '<a href="' + t[1] + '" data-t="' + t[0] + '">' + IC.svg(t[2]) + '<span>' + t[3] + '</span></a>'; }).join("");
  document.body.appendChild(tb);
  /* colour themes (palette) × light / dark / auto — stored per device; reports, PDF and Excel stay neutral */
  var PALS = [["gold", "Charcoal & Gold", ["#121418", "#d9b25c", "#f3f5f9"]], ["navy", "Classic Navy", ["#14284a", "#c2410c", "#f3f5f9"]], ["blueprint", "Blueprint", ["#0b3d6e", "#0a6f7a", "#eaf1fa"]],
    ["forest", "Forest", ["#17331f", "#94570f", "#f2f5f1"]], ["graphite", "Graphite", ["#232529", "#4652c8", "#f4f4f5"]], ["hc", "High Contrast", ["#000000", "#ffd400", "#ffffff"]]];
  function stored(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function keep(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function applyTheme() {
    var t = stored("isd_theme", "auto"), pl = stored("isd_pal", "gold"), de = document.documentElement;
    de.setAttribute("data-theme", t); if (pl === "gold") de.removeAttribute("data-pal"); else de.setAttribute("data-pal", pl);
    var b = document.getElementById("themeBtn"); if (b) b.innerHTML = IC.svg(isDark() ? "sun" : "moon");
    var mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.setAttribute("content", (getComputedStyle(de).getPropertyValue("--nav") || "#121418").trim());
    try { document.dispatchEvent(new Event("isd-theme")); } catch (e) { }
  }
  function isDark() { var t = document.documentElement.getAttribute("data-theme"); return t === "dark" || (t === "auto" && !!window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches); }
  window.ISDTHEME = { isDark: isDark, apply: applyTheme, PALS: PALS };
  function theme(t) { if (t) keep("isd_theme", t); applyTheme(); }
  function themeSheet() {
    var old = document.querySelector(".thsheet"); if (old) { old.remove(); return; }
    var sh = document.createElement("div"); sh.className = "thsheet noprint";
    function draw() {
      var pl = stored("isd_pal", "gold"), t = stored("isd_theme", "auto");
      sh.innerHTML = '<div class="thp" role="dialog" aria-label="Colour theme"><b>Colour theme</b><div class="thg">' + PALS.map(function (q) { return '<button type="button" data-pal="' + q[0] + '"' + (q[0] === pl ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '><i>' + q[2].map(function (c) { return '<s style="background:' + c + '"></s>'; }).join("") + '</i>' + q[1] + '</button>'; }).join("") +
        '</div><div class="thm" role="group" aria-label="Brightness">' + [["light", "Light"], ["dark", "Dark"], ["auto", "Auto"]].map(function (q) { return '<button type="button" data-th="' + q[0] + '"' + (q[0] === t ? ' class="on"' : '') + '>' + q[1] + '</button>'; }).join("") + '</div><small>Auto follows the phone setting. Reports, PDF and Excel files keep neutral print colours.</small></div>';
      sh.querySelectorAll("[data-pal]").forEach(function (bt) { bt.onclick = function () { keep("isd_pal", bt.getAttribute("data-pal")); applyTheme(); draw(); }; });
      sh.querySelectorAll("[data-th]").forEach(function (bt) { bt.onclick = function () { keep("isd_theme", bt.getAttribute("data-th")); applyTheme(); draw(); }; });
    }
    sh.onclick = function (ev) { if (ev.target === sh) sh.remove(); };
    draw(); document.body.appendChild(sh);
  }
  var thb = document.getElementById("themeBtn"); if (thb) { thb.onclick = themeSheet; thb.setAttribute("aria-label", "Colour theme"); }
  if (window.matchMedia) try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) { }
  theme();
  window.addEventListener("hashchange", route);
  window.ISD = { modules: M, route: route, store: store };
  if (window.PDB) PDB.init().then(route, route); else route();
  if (typeof HW !== "undefined") {
    HW.apply();
    var warm = function () { try { PAR.warm(); } catch (e) {} };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 1500);
  }
})();
