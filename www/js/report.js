/* Excel workbook of the complete analysis & design, with live formulas (loads, IS 1893 base shear, combinations,
   storey drift, IS 456 / IS 800 member design, slab & wall reinforcement) and the stiffness / FE results as data. */
var RX = (function () {
  var FN = {
    IF: function (c, a, b) { return c ? a : b; }, MAX: function () { return Math.max.apply(null, arguments); }, MIN: function () { return Math.min.apply(null, arguments); },
    SQRT: Math.sqrt, ABS: Math.abs, FLOOR: function (x, s) { return Math.floor(x / s) * s; }, AND: function () { for (var i = 0; i < arguments.length; i++) if (!arguments[i]) return false; return true; },
    OR: function () { for (var i = 0; i < arguments.length; i++) if (arguments[i]) return true; return false; }, ROUND: function (x, n) { var p = Math.pow(10, n); return Math.round(x * p) / p; }, PI: function () { return Math.PI; }
  };
  var cache = {};
  function ev(t, v, g) {
    var fn = cache[t];
    if (!fn) {
      var js = t.replace(/^=/, "").replace(/\{(\w+)\}/g, "v.$1").replace(/\[(\w+)\]/g, "g.$1").replace(/\^/g, "**").replace(/<>/g, "!=").replace(/([^<>!=])=(?!=)/g, "$1==");
      fn = cache[t] = new Function("v", "g", "F", "with(F){return (" + js + ");}");
    }
    try { var r = fn(v, g, FN); return typeof r === "number" && !isFinite(r) ? null : r; } catch (e) { return null; }
  }
  /* table: cols [{k, h, u, f (template or fn(row)), cell(row, rn, vals) , s, w}] */
  function table(sh, cols, rows, G, opt) {
    opt = opt || {};
    var L = {}; cols.forEach(function (c, i) { L[c.k] = XL.col(i + (opt.c0 || 0)); });
    var pad = []; for (var i = 0; i < (opt.c0 || 0); i++) pad.push(null);
    var hl = 1; cols.forEach(function (c, i) { var w = (sh.opt.cols || [])[i + (opt.c0 || 0)] || 10; hl = Math.max(hl, Math.ceil(String(c.h).length / Math.max(w * 0.9, 4))); });
    var h0 = sh.row(pad.concat(cols.map(function (c) { return c.h; })), "h", Math.min(13 * hl + 6, 90));
    if (cols.some(function (c) { return c.u; })) sh.row(pad.concat(cols.map(function (c) { return c.u || ""; })), "sub");
    if (cols.some(function (c) { return c.d; })) {
      var mx = 1; cols.forEach(function (c, i) { if (c.d) { var w = (sh.opt.cols || [])[i + (opt.c0 || 0)] || 10; mx = Math.max(mx, Math.ceil(c.d.length / Math.max(w * 0.95, 6))); } });
      sh.row(pad.concat(cols.map(function (c) { return { v: c.d || "", s: "cd" }; })), null, Math.min(12 * mx + 4, 160));
    }
    var first = sh.next();
    if (opt.freeze !== false && !sh.opt.freeze) sh.opt.freeze = XL.col(opt.fc === undefined ? 1 : opt.fc) + first;
    if (!sh._pt) { sh._pt = "$" + h0 + ":$" + (first - 1); }
    rows.forEach(function (r) {
      var rn = sh.next(), vals = {}, cells = pad.slice();
      cols.forEach(function (c) {
        if (c.cell) { var o = c.cell(r, rn, vals, L); vals[c.k] = o && typeof o === "object" ? o.v : o; cells.push(o); return; }
        if (c.f) {
          var t = typeof c.f === "function" ? c.f(r) : c.f;
          if (t === null) { vals[c.k] = r[c.k]; cells.push({ v: r[c.k], s: c.s || "n2" }); return; }
          var v = ev(t, vals, G); vals[c.k] = v;
          var st = c.s || "f2"; if (st === "stat") st = v === "OK" ? "ok" : "no";
          cells.push({ f: "=" + t.replace(/^=/, "").replace(/\{(\w+)\}/g, function (_, k) { return L[k] + rn; }).replace(/\[(\w+)\]/g, "p_$1"), v: v, s: st });
          return;
        }
        var x = r[c.k]; vals[c.k] = x; cells.push({ v: x, s: c.s || (typeof x === "number" ? "n2" : "") });
      });
      sh.row(cells);
    });
    var last = sh.next() - 1;
    if (L.st && last >= first) sh.status(L.st + first + ":" + L.st + last);
    return { L: L, first: first, last: last };
  }
  function q(name) { return "'" + name + "'"; }
  /* tab colours by sheet group */
  var TAB = { guide: "E07A1F", input: "2B6CB0", model: "5D6B7B", load: "8E44AD", result: "1D3557", design: "1E8E4A", nonlin: "C62828" };
  /* standard top block: title, plain-language description, link back to contents, blank row */
  function intro(sh, title, desc, span) {
    span = span || 8;
    sh.row([{ v: title, s: "t" }], null, 24);
    var w = (sh.opt.cols || []).slice(0, span).reduce(function (a, b) { return a + b; }, 0) || 80, lines = Math.max(1, Math.ceil(desc.length * 1.05 / w)) + (desc.split("\n").length - 1);
    var rn = sh.row([{ v: desc, s: "desc" }], null, Math.min(15 * lines + 4, 400));
    sh.merge("A" + rn + ":" + XL.col(span - 1) + rn);
    sh.row([{ f: '=HYPERLINK("#\'Read Me\'!A1","◄ Back to contents")', v: "◄ Back to contents", s: "link" }]);
    sh.row([]);
  }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  function build(S) {
    var m = S.m, p = S.p, res = S.res, des = S.des, po = S.po, wb = XL.book(), G = {};
    var date = new Date().toISOString().slice(0, 10);
    /* ===== Summary ===== */
    var rd = wb.sheet("Read Me", { cols: [4, 30, 72, 18], tab: 1, color: TAB.guide });
    var sm = wb.sheet("Summary", { cols: [36, 34, 14, 30], color: TAB.guide });
    intro(sm, "Summary — structural analysis & design report", "The one-page answer: what was analysed, the key results (displacement, base shear, pushover capacity) and how many members pass or fail in each design group. Failing counts are live formulas (COUNTIF of the Status column on each design sheet) and update if you change inputs. Generated by IS StructDesign on " + date + " · IS 456:2000, IS 800:2007, IS 875 (Parts 1–3, 5), IS 1893 (Part 1):2016.", 4);
    /* ===== Inputs (named cells) ===== */
    var ip = wb.sheet("Inputs", { cols: [12, 46, 14, 12, 40, 12], color: TAB.input });
    intro(ip, "Inputs — design parameters", "Every design parameter used by the formulas in this workbook. The blue values on a yellow background are inputs: change one and every dependent formula (base shear, design steel, checks) recalculates. Each value is a named cell, e.g. p_fck, so formulas read like =0.36*p_fck*b*… . 'Source' tells you whether you entered the value in the app or the default was used.\nNote: changing an input here does NOT re-run the structural analysis — forces and displacements stay as computed in the app.", 6);
    ip.row(["Name", "Description", "Value", "Unit", "Reference / note", "Source"], "h", 22);
    ip.opt.freeze = "A" + ip.next();
    var UIK = { fck: "fck", fy: "fy", fys: "fys", crackB: "crack", crackC: "crack", Zz: "zone", Imp: "I", Rr: "R", soil: "soil", sys: "sys", ff: "ff", ll: "ll", ffr: "ffRoof", llr: "llRoof", wall: "wall", parapet: "parapet", vb: "vbp", cf: "cf", kcol: "kcol" };
    var ent = p.entered || [];
    function inp(k, label, v, u, note) { var rn = ip.next(), src = UIK[k] ? (ent.indexOf(UIK[k]) >= 0 ? "entered" : "default") : "code value"; ip.row([{ v: "p_" + k, s: "b" }, label, { v: v, s: typeof v === "number" ? "in2" : "in" }, u || "", { v: note || "", s: "note" }, { v: src, s: src === "entered" ? "ok" : "" }]); wb.define("p_" + k, "Inputs!$C$" + rn); G[k] = v; }
    inp("fck", "Concrete grade fck", +p.fck, "N/mm²", "IS 456 cl 6.1");
    inp("fy", "Reinforcement yield strength fy", +p.fy, "N/mm²", "IS 1786");
    inp("fys", "Structural steel yield fy", +p.fys, "N/mm²", "IS 2062");
    inp("gm0", "Partial safety factor γm0", D.gm0, "", "IS 800 Table 5");
    inp("cover", "Effective cover to beam steel (d' = D − d)", 50, "mm", "IS 456 cl 26.4");
    inp("Asv", "Stirrup area, 2-legged 8 mm", r3(2 * Math.PI * 64 / 4), "mm²", "");
    inp("crackB", "Cracked stiffness factor — beams", p.crack ? 0.35 : 1, "", "IS 1893 cl 6.4.3.1");
    inp("crackC", "Cracked stiffness factor — columns", p.crack ? 0.70 : 1, "", "IS 1893 cl 6.4.3.1");
    inp("Zz", "Seismic zone factor Z (zone " + p.zone + ")", D.zone[p.zone], "", "IS 1893 Table 3");
    inp("Imp", "Importance factor I", +p.I, "", "IS 1893 Table 8");
    inp("Rr", "Response reduction factor R", +p.R, "", "IS 1893 Table 9");
    inp("soil", "Soil type (1 = rock, 2 = medium, 3 = soft)", { I: 1, II: 2, III: 3 }[p.soil], "", "IS 1893 cl 6.4.2");
    inp("sys", "Period formula (1 = RC MRF, 2 = steel MRF, 3 = 0.09h/√d)", { rc: 1, steel: 2, other: 3 }[p.sys], "", "IS 1893 cl 7.6.2");
    inp("rho", "Minimum design Ah", { II: 0.007, III: 0.011, IV: 0.016, V: 0.024 }[p.zone], "", "IS 1893 Table 7");
    inp("ff", "Floor finish + partitions", +p.ff, "kN/m²", "IS 875 Pt 1"); inp("ll", "Imposed load, floors", +p.ll, "kN/m²", "IS 875 Pt 2");
    inp("ffr", "Roof finish", +p.ffRoof, "kN/m²", ""); inp("llr", "Roof imposed load", +p.llRoof, "kN/m²", "");
    inp("wall", "Wall load on floor beams", +p.wall, "kN/m", ""); inp("parapet", "Parapet load on roof beams", +p.parapet, "kN/m", "");
    inp("vb", "Basic wind speed Vb", p.vb, "m/s", "IS 875 Pt 3 Annex A (" + p.vbp + ")"); inp("cf", "Net force coefficient Cf", +p.cf, "", "IS 875 Pt 3 cl 7.4");
    inp("kcol", "Column effective length factor", +p.kcol, "", "IS 456 Annex E / Table 28");
    inp("dlim", "Storey drift limit (× h)", 0.004, "", "IS 1893 cl 7.11.1");
    var W = p.method === "wsm";
    ip.row([]); ip.row([{ v: "Design method", s: "b" }, { v: W ? "Working stress method (IS 456 Annex B, IS 800 Section 11)" : "Limit state method (IS 456, IS 800)", s: "in" }, "", "", "", { v: (p.entered || []).indexOf("method") >= 0 ? "entered" : "default", s: (p.entered || []).indexOf("method") >= 0 ? "ok" : "" }]);
    if (W) {
      inp("scbc", "Permissible bending compression σcbc", WS.scbc(p.fck), "N/mm²", "IS 456 Table 21");
      inp("scc", "Permissible direct compression σcc", WS.scc(p.fck), "N/mm²", "IS 456 Table 21");
      inp("sst", "Permissible steel tension σst", WS.sst(p.fy), "N/mm²", "IS 456 Table 22");
      inp("ssc", "Permissible steel compression σsc (columns)", WS.ssc(p.fy), "N/mm²", "IS 456 Table 22");
      inp("inc", "Increase for wind / earthquake combinations", r3(4 / 3), "", "33⅓ % — IS 456 Annex B, IS 875 Pt 5");
    }

    ip.row([]); ip.row(["Default sections", "Columns: " + p.colSec + " · Beams: " + p.beamSec + " · Braces: " + p.braceSec + " · Slab " + p.tSlab + " mm · Wall " + p.tWall + " mm"]);
    if (p.secOver) { ip.row(["Section overrides"], "sub"); String(p.secOver).split(/\n/).forEach(function (l, i) { if (l.trim()) ip.row(["line " + (i + 1), { v: l.trim(), s: "in" }]); }); }
    if (p.loadOver) { ip.row(["Extra member loads"], "sub"); String(p.loadOver).split(/\n/).forEach(function (l, i) { if (l.trim()) ip.row(["line " + (i + 1), { v: l.trim(), s: "in" }]); }); }

    /* ===== Nodes ===== */
    var nd = wb.sheet("Nodes", { cols: [8, 11, 11, 11, 9, 9, 9, 9, 9, 9], color: TAB.model });
    intro(nd, "Nodes — joint coordinates and supports", "Every joint of the analysis model. X and Y are horizontal, Z is vertical (up). The six restraint columns show which movements are prevented at supports: U = translation, R = rotation; 'fixed' means restrained, blank means a free (unsupported) node.", 10);
    table(nd, [{ k: "id", h: "Node", s: "n0", d: "Node number" }, { k: "x", h: "X", u: "m", s: "n3" }, { k: "y", h: "Y", u: "m", s: "n3" }, { k: "z", h: "Z", u: "m", s: "n3", d: "height" },
      { k: "r0", h: "Ux", d: "translation X" }, { k: "r1", h: "Uy", d: "translation Y" }, { k: "r2", h: "Uz", d: "translation Z" }, { k: "r3", h: "Rx", d: "rotation about X" }, { k: "r4", h: "Ry", d: "rotation about Y" }, { k: "r5", h: "Rz", d: "rotation about Z" }],
      m.nodes.map(function (n, i) { var s = m.sup[i], o = { id: i + 1, x: r3(n.x), y: r3(n.y), z: r3(n.z) }; for (var d = 0; d < 6; d++) o["r" + d] = s ? (s[d] ? "fixed" : "free") : ""; return o; }), G);

    /* ===== Members ===== */
    var mb = wb.sheet("Members", { cols: [8, 9, 7, 7, 14, 9, 9, 9, 9, 9, 9, 10, 8, 8, 8, 11, 12, 12, 12, 12, 14], color: TAB.model });
    intro(mb, "Members — beams, columns and braces", "One row per frame element (members are split where they cross other members or slab mesh lines). Length L and, for RCC, the area A and second moments Iz, Iy are live formulas from b and D, including the cracked-section factors from Inputs. 'Section source' says where the size came from: an override rule, the DXF layer name, or the default section.", 12);
    var mrows = m.frames.map(function (e, k) {
      var A = m.nodes[e.n1], B = m.nodes[e.n2], s = e.sec;
      return { id: k + 1, type: e.type, n1: e.n1 + 1, n2: e.n2 + 1, sec: s.name, x1: r3(A.x), y1: r3(A.y), z1: r3(A.z), x2: r3(B.x), y2: r3(B.y), z2: r3(B.z), rcc: s.kind === "rcc",
        src: e.src || "default", b: s.kind === "rcc" ? s.b : null, Dd: s.kind === "rcc" ? s.D : null, cr: s.kind === "rcc" ? (e.type === "column" ? "crackC" : "crackB") : null, E: s.E / 1e6, A: s.A, Iz: s.Iz, Iy: s.Iy, J: s.J };
    });
    table(mb, [{ k: "id", h: "Member", s: "n0", d: "F-number in the app" }, { k: "type", h: "Type" }, { k: "n1", h: "Node i", s: "n0", d: "start" }, { k: "n2", h: "Node j", s: "n0", d: "end" }, { k: "sec", h: "Section", d: "b×D mm or rolled section" },
      { k: "x1", h: "xi", u: "m", s: "n3" }, { k: "y1", h: "yi", u: "m", s: "n3" }, { k: "z1", h: "zi", u: "m", s: "n3" }, { k: "x2", h: "xj", u: "m", s: "n3" }, { k: "y2", h: "yj", u: "m", s: "n3" }, { k: "z2", h: "zj", u: "m", s: "n3" },
      { k: "L", h: "Length L", u: "m", f: "SQRT(({x2}-{x1})^2+({y2}-{y1})^2+({z2}-{z1})^2)", s: "f4", d: "√(Δx²+Δy²+Δz²)" },
      { k: "b", h: "b", u: "mm", s: "n0" }, { k: "Dd", h: "D", u: "mm", s: "n0" }, { k: "E", h: "E", u: "GPa", s: "n2" },
      { k: "A", h: "Area A", u: "m²", f: function (r) { return r.rcc ? "{b}*{Dd}/1000000" : null; }, s: "e" },
      { k: "Iz", h: "Iz (major)", u: "m⁴", d: "factor·b·D³/12", f: function (r) { return r.rcc ? "[" + r.cr + "]*{b}*{Dd}^3/12/10^12" : null; }, s: "e" },
      { k: "Iy", h: "Iy (minor)", u: "m⁴", d: "factor·D·b³/12", f: function (r) { return r.rcc ? "[" + r.cr + "]*{Dd}*{b}^3/12/10^12" : null; }, s: "e" },
      { k: "J", h: "Torsion J", u: "m⁴", s: "e" }, { k: "src", h: "Section source" }], mrows, G);
    mb.row([]); mb.row(["Local axes: x along member (i→j); for beams local y = global Z (Iz resists gravity bending); for columns local y = global X (D measured along X). Cracked factors from Inputs. Units kN, m."], "note");

    if (m.shells.length) {
      var sl = wb.sheet("Shells", { cols: [9, 8, 8, 8, 8, 8, 10, 10], color: TAB.model });
      intro(sl, "Shells — slab and wall finite elements", "Slabs, plates and walls are divided into 4-node shell elements (flat shell: membrane + Mindlin plate). Nodes are listed anticlockwise; for slabs the local z-axis points up. Thickness t and concrete modulus E (reduced if cracked stiffness is selected) are listed.", 8);
      table(sl, [{ k: "id", h: "Element", s: "n0" }, { k: "kind", h: "Kind" }, { k: "a", h: "Node 1", s: "n0" }, { k: "b", h: "Node 2", s: "n0" }, { k: "c", h: "Node 3", s: "n0" }, { k: "d", h: "Node 4", s: "n0" }, { k: "t", h: "t", u: "mm", s: "n0" }, { k: "E", h: "E", u: "GPa", s: "n2" }],
        m.shells.map(function (s, k) { return { id: k + 1, kind: s.kind, a: s.n[0] + 1, b: s.n[1] + 1, c: s.n[2] + 1, d: s.n[3] + 1, t: Math.round(s.t * 1000), E: s.mat.E / 1e6 }; }), G);
    }

    var lin = !!res, pdl = lin && res.pd;
    var caseNames = lin ? Object.keys(res.cases) : [];
    /* ===== Loads & seismic ===== */
    if (S.L) {
      var ld = wb.sheet("Loads", { cols: [30, 14, 14, 14, 14, 14, 14, 14, 14], color: TAB.load });
      intro(ld, "Loads — load cases, seismic and wind", "Top: the total load in each basic load case (DL dead, LL imposed, EQ earthquake, WL wind), used by the Reactions sheet for the equilibrium check. Then the IS 1893 seismic base-shear calculation step by step — period Ta, spectral acceleration Sa/g, Ah and Vb are live formulas from the zone, importance and R factors on the Inputs sheet — and how Vb is shared between floors (Qi). Last, the IS 875-3 wind force at each level.", 7);
      ld.row(["Load cases"], "sub");
      var lcd = { DL: "Self weight (25 kN/m³ concrete, 78.5 kN/m³ steel) + finishes [ff]/[ffr] on slabs + wall/parapet UDL on beams", LL: "Imposed [ll] on floors, [llr] on roof (IS 875 Pt 2)", EQX: "IS 1893 equivalent static, +X", EQY: "IS 1893 equivalent static, +Y", WLX: "IS 875 Pt 3 wind, +X", WLY: "IS 875 Pt 3 wind, +Y" };
      ld.row(["Case", "Total Fx (kN)", "Total Fy (kN)", "Total Fz (kN)", "Description"], "h");
      var caseRow = {};
      caseNames.forEach(function (c) {
        var F = res.cases[c].lv.Ffull, t = [0, 0, 0]; for (var i = 0; i < F.length; i += 6) { t[0] += F[i]; t[1] += F[i + 1]; t[2] += F[i + 2]; }
        caseRow[c] = ld.next(); ld.row([c, { v: t[0], s: "n2" }, { v: t[1], s: "n2" }, { v: t[2], s: "n2" }, (lcd[c] || "").replace(/\[(\w+)\]/g, function (_, k) { return G[k] + (k.indexOf("ff") === 0 || k.indexOf("ll") === 0 ? " kN/m²" : ""); })]);
      });
      /* seismic */
      Object.keys(S.L.eq).forEach(function (k) {
        var e = S.L.eq[k], d = k === "EQY" ? 1 : 0;
        ld.row([]); ld.row(["Seismic base shear " + k + " — IS 1893 (Part 1):2016 cl 7.6"], "tb");
        var r0 = ld.next();
        function L2(lbl, cell, u, note) { var rn = ld.next(); ld.row([lbl, cell, u || "", { v: note || "", s: "note" }]); return rn; }
        var rH = L2("Height of building h", { v: e.H, s: "n3" }, "m", "from model");
        var rd = L2("Base dimension along " + (d ? "Y" : "X") + ", d", { v: e.d, s: "n3" }, "m", "from model");
        var rT = L2("Approximate period Ta", { f: "=IF(p_sys=1,0.075*B" + rH + "^0.75,IF(p_sys=2,0.085*B" + rH + "^0.75,0.09*B" + rH + "/SQRT(B" + rd + ")))", v: e.T, s: "f4" }, "s", "cl 7.6.2");
        var rS = L2("Sa/g (5% damping)", { f: "=IF(B" + rT + "<0.1,1+15*B" + rT + ",IF(B" + rT + "<=IF(p_soil=1,0.4,IF(p_soil=2,0.55,0.67)),2.5,IF(B" + rT + "<=4,IF(p_soil=1,1,IF(p_soil=2,1.36,1.67))/B" + rT + ",IF(p_soil=1,1,IF(p_soil=2,1.36,1.67))/4)))", v: e.Sa, s: "f4" }, "", "cl 6.4.2 Fig 2");
        var rA = L2("Ah = (Z/2)(Sa/g)/(R/I)", { f: "=p_Zz/2*B" + rS + "/(p_Rr/p_Imp)", v: e.Ah, s: "f4" }, "", "cl 6.4.2");
        var rAd = L2("Design Ah (not less than Table 7 minimum)", { f: "=MAX(B" + rA + ",p_rho)", v: e.Ahd, s: "f4" }, "", "cl 7.2.2");
        var rW = L2("Seismic weight W", { v: e.W, s: "n2" }, "kN", "DL + 25%/50% LL, roof LL excluded (cl 7.3) — level breakdown below");
        var rV = L2("Design base shear Vb = Ah·W", { f: "=B" + rAd + "*B" + rW, v: e.Vb, s: "f2" }, "kN", "cl 7.2.1");
        ld.row([]);
        /* level distribution */
        var lv = MD.levels(m), zmin = lv[0], W = S.L.W, rows = [];
        lv.forEach(function (z) { if (z - zmin < 0.01) return; var w = 0; m.nodes.forEach(function (n, i) { if (Math.abs(n.z - z) < 0.005) w += W[i]; }); if (w > 0) rows.push({ z: z, W: w, h: z - zmin }); });
        var t0 = ld.next() + 2, t1 = t0 + rows.length - 1;   /* header + description row */
        var sumW = rows.reduce(function (a, r) { return a + r.W * r.h * r.h; }, 0);
        table(ld, [{ k: "z", h: "Level z (m)", s: "n3", d: "floor level" }, { k: "W", h: "Wi (kN)", s: "n2", d: "seismic weight of the floor" }, { k: "h", h: "hi (m)", s: "n3", d: "height above base" },
          { k: "Wh2", h: "Wi·hi²", f: "{W}*{h}^2", s: "f2", d: "weight × height²" },
          { k: "Q", h: "Qi = Vb·Wi·hi²/ΣWh² (kN)", d: "lateral force at the floor (cl 7.6.3)", cell: function (r, rn) { return { f: "=$B$" + rV + "*D" + rn + "/SUM($D$" + t0 + ":$D$" + t1 + ")", v: e.Vb * r.W * r.h * r.h / sumW, s: "f2" }; } },
          { k: "V", h: "Storey shear Vi (kN)", d: "sum of Qi at and above", cell: function (r, rn) { return { f: "=SUM(E" + rn + ":$E$" + t1 + ")", v: null, s: "f2" }; } }], rows, G, { freeze: false });
        ld.row(["Σ", { f: "=SUM(B" + t0 + ":B" + t1 + ")", s: "f2" }, "", { f: "=SUM(D" + t0 + ":D" + t1 + ")", s: "f2" }, { f: "=SUM(E" + t0 + ":E" + t1 + ")", s: "f2" }]);
        ld.row([{ v: "Note: Wi of each level is applied at the nodes of that level in proportion to their tributary weight (cl 7.6.3). Total of Wi may differ slightly from W because base-level weight is excluded.", s: "note" }]);
      });
      Object.keys(S.L.wind).forEach(function (k) {
        var w = S.L.wind[k];
        ld.row([]); ld.row(["Wind " + k + " — IS 875 (Part 3):2015"], "tb");
        var lv = MD.levels(m), zmin = lv[0], rows = [];
        lv.forEach(function (z, i) { if (i === 0) return; var hz = z - zmin, k2 = U.interp(D.k2h, D.k2[p.terrain], Math.max(10, Math.min(hz, 100))); rows.push({ z: z, hz: hz, k2: k2, hb: (z - lv[i - 1]) / 2 + (i + 1 < lv.length ? (lv[i + 1] - z) / 2 : 0), B: w.B }); });
        table(ld, [{ k: "z", h: "Level z (m)", s: "n3" }, { k: "hz", h: "Height (m)", s: "n3" }, { k: "k2", h: "k2 (Table 2, TC " + p.terrain + ")", s: "n3" },
          { k: "Vz", h: "Vz = Vb·k1·k2·k3·k4 (m/s)", f: "[vb]*{k2}", s: "f2" }, { k: "pz", h: "pz = 0.6Vz² (kN/m²)", f: "0.6*{Vz}^2/1000", s: "f4" },
          { k: "pd", h: "pd = max(Kd·Ka·Kc, 0.7)·pz", f: "MAX(0.9*0.8*0.9,0.7)*{pz}", s: "f4" }, { k: "hb", h: "Tributary height (m)", s: "n3" }, { k: "B", h: "Exposed width (m)", s: "n3" },
          { k: "F", h: "F = Cf·pd·B·h (kN)", f: "[cf]*{pd}*{B}*{hb}", s: "f2" }], rows, G, { freeze: false });
      });
      ld.row([]); ld.row([{ v: "Reactions sheet checks Σ reactions against the total applied loads above for every combination.", s: "note" }]);
    }

    /* ===== Combinations ===== */
    if (lin) {
      var cs = wb.sheet("Combinations", { cols: [26].concat(caseNames.map(function () { return 10; })), color: TAB.load });
      intro(cs, "Combinations — load factors", "Each row is a load combination; each column is the factor applied to a basic load case (DL, LL, EQX …). These factors drive the combination results on Disp_Combos and Forces_Combos through SUMPRODUCT formulas, so editing a factor here updates those results instantly" + (pdl ? " (not for this P-Delta run, whose combination results are second-order values)." : "."), Math.max(caseNames.length + 1, 5));
      cs.row(["Combination"].concat(caseNames), "h", 22);
      cs.opt.freeze = "B" + cs.next();
      var fRow = {};
      S.cb.forEach(function (c) { fRow[c.name] = cs.row([c.name].concat(caseNames.map(function (n) { return { v: c.f[n] || 0, s: "in2" }; }))); });
      if (S.cb.some(function (c) { return c.inc > 1; })) { cs.row([]); cs.row(["Permissible stress increase", "×4/3 for combinations with EL/WL"], "sub"); }
      cs.row([]); cs.row([{ v: (W ? "Working stress (IS 875 Pt 5, IS 456 Annex B): DL+LL, DL+LL±EL/WL, DL±EL/WL, unfactored; permissible stresses +33⅓ % with EL/WL. " : "IS 456 Table 18 / IS 875 Part 5: 1.5(DL+LL), 1.2(DL+LL±EL), 1.5(DL±EL), 0.9DL±1.5EL. ") + (pdl ? "P-Delta analysis: combinations are solved individually (non-linear), so combination results are values, not sums." : "Linear analysis: every combination result is the factored sum of the case results — those cells are live formulas referencing this table."), s: "note" }]);
      cs.merge("A" + (cs.next() - 1) + ":" + XL.col(Math.max(caseNames.length, 6)) + (cs.next() - 1));
      var caseCol = {}; caseNames.forEach(function (n, i) { caseCol[n] = XL.col(i + 1); });
      function factorRef(cb, cn) { return "Combinations!$" + caseCol[cn] + "$" + fRow[cb]; }

      /* ===== Displacements ===== */
      var comps = ["N", "Vy", "Vz", "T", "My", "Mz"];
      var nC = caseNames.length, comp = ["ux", "uy", "uz"], lastC = XL.col(nC);
      function fRange(cb) { return "Combinations!$B$" + fRow[cb] + ":$" + lastC + "$" + fRow[cb]; }
      var dc = wb.sheet("Disp_Cases", { cols: [8].concat(Array(3 * nC).fill(10)), color: TAB.result });
      intro(dc, "Disp_Cases — nodal displacements for each load case", "Displacements of every node (mm, global axes) for each basic load case, straight from the stiffness-method solution. Columns are grouped by direction — all ux, then all uy, then all uz — so each group lines up with the factor row on the Combinations sheet.", 8);
      dc.row(["Node"].concat([].concat.apply([], comp.map(function (x) { return caseNames.map(function (c) { return x + " " + c; }); }))), "h");
      dc.row(["", "mm (global axes) — grouped by component so each block lines up with the Combinations factors"], "sub");
      dc.opt.freeze = "B" + dc.next(); var dRow = [];
      m.nodes.forEach(function (n, i) { dRow[i] = dc.next(); dc.row([{ v: i + 1, s: "n0" }].concat([].concat.apply([], [0, 1, 2].map(function (d) { return caseNames.map(function (c) { return { v: res.cases[c].U[6 * i + d] * 1000, s: "n4" }; }); })))); });
      var dcc = wb.sheet("Disp_Combos", { cols: [8].concat(Array(3 * S.cb.length).fill(12)), color: TAB.result });
      intro(dcc, "Disp_Combos — nodal displacements for each combination", "Displacements (mm) for every load combination. " + (pdl ? "This run included P-Delta, so these are second-order values computed directly." : "Each cell is a live formula =SUMPRODUCT(factors on Combinations, case displacements on Disp_Cases)."), 8);
      dcc.row(["Node"].concat([].concat.apply([], S.cb.map(function (c) { return comp.map(function (x) { return c.name + " " + x; }); }))), "h");
      dcc.row(["", "mm — " + (pdl ? "P-Delta values" : "= SUMPRODUCT(factors, case results) (live formulas)")], "sub");
      dcc.opt.freeze = "B" + dcc.next();
      m.nodes.forEach(function (n, i) {
        var rn = dRow[i], row = [{ v: i + 1, s: "n0" }];
        res.combos.forEach(function (cb, ci) {
          [0, 1, 2].forEach(function (d) {
            var v = cb.U[6 * i + d] * 1000;
            if (pdl) { row.push({ v: v, s: "n4" }); return; }
            row.push({ f: "=SUMPRODUCT(" + fRange(S.cb[ci].name) + ",Disp_Cases!" + XL.col(1 + d * nC) + rn + ":" + XL.col(d * nC + nC) + rn + ")", v: v, s: "f4" });
          });
        });
        dcc.row(row);
      });

      /* ===== Member forces ===== */
      var fc = wb.sheet("Forces_Cases", { cols: [8, 9, 5].concat(Array(6 * nC).fill(9)), color: TAB.result });
      intro(fc, "Forces_Cases — member end forces for each load case", "Internal forces at both ends (i = start, j = end) of every member for each basic load case, in member local axes: N axial (tension +), Vy and Vz shears, T torsion, My and Mz bending (Mz sagging + for beams). Columns are grouped by force type so each block lines up with the Combinations factors.", 9);
      fc.row(["Member", "Type", "End"].concat([].concat.apply([], comps.map(function (x) { return caseNames.map(function (c) { return x + " " + c; }); }))), "h");
      fc.row(["", "", "", "kN, kNm — member local axes; N tension +, Mz sagging +; grouped by component"], "sub");
      fc.opt.freeze = "D" + fc.next();
      var frow = {};
      m.frames.forEach(function (e, k) {
        var dgs = caseNames.map(function (c) { return FE.frameDiagram(FE.frameForces(m, k, res.cases[c].U, res.cases[c].lv.qeq[k], 0), 1); });
        ["i", "j"].forEach(function (end, t) {
          frow[k + end] = fc.next();
          fc.row([{ v: k + 1, s: "n0" }, e.type, end].concat([].concat.apply([], comps.map(function (x) { return dgs.map(function (d) { return { v: d[t][x], s: "n3" }; }); }))));
        });
      });
      var fco = wb.sheet("Forces_Combos", { cols: [22, 8, 9, 5, 10, 10, 10, 10, 10, 10], color: TAB.result });
      intro(fco, "Forces_Combos — member end forces for each combination", "Member end forces for every combination (one block of rows per combination). " + (pdl ? "P-Delta run: second-order values." : "Each value is a live SUMPRODUCT of the Combinations factors and the case forces.") + " Tip: use Data ▸ Filter on the Combination or Member column to find a member quickly. The design sheets use the envelope of these forces along the whole member length (9 points), not only the ends.", 10);
      fco.row(["Combination", "Member", "Type", "End"].concat(comps), "h");
      fco.row(["", "", "", "", pdl ? "kN, kNm — P-Delta (second-order) values" : "kN, kNm — SUMPRODUCT(factors, Forces_Cases) (live formulas)"], "sub");
      fco.opt.freeze = "E" + fco.next();
      res.combos.forEach(function (cb, ci) {
        var c0 = S.cb[ci];
        m.frames.forEach(function (e, k) {
          var d = FE.frameDiagram(cb.fr[k], 1);
          ["i", "j"].forEach(function (end, t) {
            var row = [c0.name, { v: k + 1, s: "n0" }, e.type, end], rr = frow[k + end];
            comps.forEach(function (x, xi) {
              var v = d[t][x];
              if (pdl) { row.push({ v: v, s: "n3" }); return; }
              row.push({ f: "=SUMPRODUCT(" + fRange(c0.name) + ",Forces_Cases!" + XL.col(3 + xi * nC) + rr + ":" + XL.col(3 + xi * nC + nC - 1) + rr + ")", v: v, s: "f2" });
            });
            fco.row(row);
          });
        });
      });

      /* ===== Reactions ===== */
      var rc = wb.sheet("Reactions", { cols: [24, 8, 11, 11, 11, 11, 11, 11], color: TAB.result });
      intro(rc, "Reactions — support forces for each combination", "Forces and moments the supports exert on the structure (global axes) — use these for foundation design. Under each combination, 'Σ reactions' is checked against '− Σ applied loads' (from the Loads sheet): the two rows should match, proving equilibrium.", 8);
      rc.row(["Combination", "Node", "Fx (kN)", "Fy (kN)", "Fz (kN)", "Mx (kNm)", "My (kNm)", "Mz (kNm)"], "h", 22);
      rc.opt.freeze = "C" + rc.next();
      res.combos.forEach(function (cb, ci) {
        var c0 = S.cb[ci], keys = Object.keys(cb.reac), r0 = rc.next();
        keys.forEach(function (n) { rc.row([c0.name, { v: +n + 1, s: "n0" }].concat(cb.reac[n].map(function (v) { return { v: v, s: "n2" }; }))); });
        var r1 = rc.next() - 1;
        var app = [0, 1, 2].map(function (d) { return "-(" + caseNames.filter(function (cn) { return c0.f[cn]; }).map(function (cn) { return factorRef(c0.name, cn) + "*Loads!" + "BCD".charAt(d) + caseRow[cn]; }).join("+") + ")"; });
        rc.row([{ v: "Σ reactions", s: "b" }, "", { f: "=SUM(C" + r0 + ":C" + r1 + ")", s: "f2" }, { f: "=SUM(D" + r0 + ":D" + r1 + ")", s: "f2" }, { f: "=SUM(E" + r0 + ":E" + r1 + ")", s: "f2" }]);
        rc.row([{ v: "− Σ applied loads (check)", s: "note" }, "", { f: "=" + app[0], s: "f2" }, { f: "=" + app[1], s: "f2" }, { f: "=" + app[2], s: "f2" }]);
        if (pdl) rc.row([{ v: "P-Delta: horizontal equilibrium is in the deformed geometry, small differences expected", s: "note" }]);
      });

      /* ===== Drift ===== */
      if (S.drift && S.drift.length) {
        var dr = wb.sheet("Drift", { cols: [8, 12, 12, 14, 14, 12, 10], color: TAB.result });
        intro(dr, "Drift — storey drift check (IS 1893 cl 7.11.1)", "Storey drift = difference in lateral displacement between two consecutive floors ÷ storey height, under the unfactored earthquake load. IS 1893 limits it to 0.004 (0.4 %). Wind drifts are listed for information only.", 7);
        var lvl = MD.levels(m), rows = [];
        Object.keys(res.cases).filter(function (c) { return /^(EQ|WL)/.test(c); }).forEach(function (c) {
          var d = c.slice(-1) === "Y" ? 1 : 0, U = res.cases[c].U;
          lvl.forEach(function (z, i) { var mx = 0; m.nodes.forEach(function (n, j) { if (Math.abs(n.z - z) < 0.01) mx = Math.max(mx, Math.abs(U[6 * j + d])); }); rows.push({ c: c, z: z, dm: mx * 1000, first: i === 0, eq: /^EQ/.test(c) }); });
        });
        table(dr, [{ k: "c", h: "Case" }, { k: "z", h: "Level z", u: "m", s: "n3" }, { k: "dm", h: "Max lateral disp.", u: "mm", s: "n3", d: "largest at this level" },
          { k: "h", h: "Storey height h", u: "m", cell: function (r, rn) { return r.first ? { v: 0, s: "n3" } : { f: "=B" + rn + "-B" + (rn - 1), v: null, s: "f4" }; } },
          { k: "dr", h: "Drift ratio Δ/h", cell: function (r, rn) { return r.first ? "" : { f: "=(C" + rn + "-C" + (rn - 1) + ")/(D" + rn + "*1000)", s: "f4" }; } },
          { k: "lim", h: "Limit", cell: function (r) { return r.first || !r.eq ? "" : { f: "=p_dlim", v: 0.004, s: "f4" }; } },
          { k: "st", h: "Check", cell: function (r, rn) { if (r.first || !r.eq) return ""; var row = S.drift.filter(function (x) { return x.c === r.c && Math.abs(x.z - r.z) < 1e-6; })[0]; return { f: '=IF(E' + rn + '<=F' + rn + ',"OK","FAIL")', v: row && row.ok ? "OK" : "FAIL", s: row && row.ok ? "ok" : "no" }; } }], rows, G);
        dr.row([]); dr.row([{ v: "Drift from unfactored lateral load cases (IS 1893 cl 7.11.1: partial safety factor 1.0). Wind drifts reported for information.", s: "note" }]);
      }
    }

    /* ===== Design sheets ===== */
    var dsn = {};
    if (des && W) designWSM(wb, des, m, p, G, dsn);
    if (des && des.beams.length && !W) {
      var bd = wb.sheet("Beam Design", { cols: [8, 10].concat(Array(40).fill(11)), color: TAB.design });
      intro(bd, "Beam Design — IS 456 limit state method", "One row per RCC beam element. Read left to right: section → design moments, shear and torsion (envelope of all combinations) → flexure (limiting moment, steel needed at bottom and top, doubly reinforced if Mu > Mu,lim) → bars to provide → shear stress and stirrup spacing → Status. Light-grey shaded columns are live formulas that use the Inputs sheet; white columns are results from the app's analysis. The italic row under the headings explains each column. Status = OK when total steel ≤ 4 % bD and τv ≤ τc,max.", 12);
      var t = table(bd, [
        { k: "id", h: "Member", s: "n0", d: "F-number" }, { k: "sec", h: "Section", d: "b × D" }, { k: "b", h: "b", u: "mm", s: "n0", d: "width" }, { k: "Dd", h: "D", u: "mm", s: "n0", d: "overall depth" },
        { k: "d", h: "d = D − d'", u: "mm", f: "{Dd}-[cover]", s: "f0", d: "effective depth" },
        { k: "Ms", h: "Mu+ (sagging)", u: "kNm", s: "n2", d: "max sagging, all combos" }, { k: "Mh", h: "Mu− (hogging)", u: "kNm", s: "n2", d: "max hogging (support)" }, { k: "Vu", h: "Vu", u: "kN", s: "n2", d: "max shear" }, { k: "Tu", h: "Tu", u: "kNm", s: "n2", d: "max torsion" },
        { k: "Mt", h: "Mt = Tu(1+D/b)/1.7", u: "kNm", f: "{Tu}*(1+{Dd}/{b})/1.7", d: "torsion as extra moment, cl 41.4.2" },
        { k: "Mb", h: "Me1 bottom = Mu+ + Mt", u: "kNm", f: "{Ms}+{Mt}" }, { k: "Mtp", h: "Me1 top = Mu− + Mt", u: "kNm", f: "{Mh}+{Mt}" },
        { k: "xr", h: "xu,max/d", f: "IF([fy]<=250,0.53,IF([fy]<=415,0.48,0.46))", s: "f4" },
        { k: "Mul", h: "Mu,lim = 0.36fck·b·xu(d−0.42xu)", u: "kNm", d: "max moment without compression steel", f: "0.36*[fck]*{b}*{xr}*{d}*({d}-0.42*{xr}*{d})/10^6" },
        { k: "Amin", h: "Ast,min = 0.85bd/fy", u: "mm²", f: "0.85*{b}*{d}/[fy]", s: "f0", d: "cl 26.5.1.1(a)" },
        { k: "Alim", h: "Ast,lim (at Mu,lim)", u: "mm²", f: "0.5*[fck]/[fy]*(1-SQRT(1-4.6*{Mul}*10^6/([fck]*{b}*{d}^2)))*{b}*{d}", s: "f0" },
        { k: "fsc", h: "fsc at d' (strain compat.)", u: "N/mm²", s: "n2" },
        { k: "AscB", h: "Asc for Mu+ (top)", u: "mm²", f: "IF({Mb}>{Mul},({Mb}-{Mul})*10^6/(({fsc}-0.446*[fck])*({d}-[cover])),0)", s: "f0" },
        { k: "AscT", h: "Asc for Mu− (bottom)", u: "mm²", f: "IF({Mtp}>{Mul},({Mtp}-{Mul})*10^6/(({fsc}-0.446*[fck])*({d}-[cover])),0)", s: "f0" },
        { k: "AstB", h: "Ast for Mu+ (bottom)", u: "mm²", f: "IF({Mb}<={Mul},MAX(0.5*[fck]/[fy]*(1-SQRT(1-4.6*{Mb}*10^6/([fck]*{b}*{d}^2)))*{b}*{d},{Amin}),{Alim}+{AscB}*({fsc}-0.446*[fck])/(0.87*[fy]))", s: "f0" },
        { k: "AstT", h: "Ast for Mu− (top)", u: "mm²", f: "IF({Mtp}<={Mul},MAX(0.5*[fck]/[fy]*(1-SQRT(1-4.6*{Mtp}*10^6/([fck]*{b}*{d}^2)))*{b}*{d},{Amin}),{Alim}+{AscT}*({fsc}-0.446*[fck])/(0.87*[fy]))", s: "f0" },
        { k: "Abot", h: "Bottom steel req.", u: "mm²", f: "MAX({AstB},{AscT})", s: "f0", d: "governing bottom area" }, { k: "Atop", h: "Top steel req.", u: "mm²", f: "MAX({AstT},{AscB})", s: "f0", d: "governing top area" },
        { k: "barsB", h: "Bottom bars", d: "suggested bars" }, { k: "barsT", h: "Top bars", d: "suggested bars" },
        { k: "Ve", h: "Ve = Vu + 1.6Tu/b", u: "kN", f: "{Vu}+1.6*{Tu}/({b}/1000)" },
        { k: "tv", h: "τve = Ve/bd", u: "N/mm²", f: "{Ve}*1000/({b}*{d})", s: "f4", d: "nominal shear stress" },
        { k: "pt", h: "pt = 100Ast/bd", u: "%", f: "MIN(100*{Atop}/({b}*{d}),3)", s: "f4" },
        { k: "beta", h: "β = 0.8fck/(6.89pt) ≥ 1", f: "MAX(0.8*[fck]/(6.89*{pt}),1)", s: "f4" },
        { k: "tc", h: "τc (Table 19 formula)", u: "N/mm²", d: "concrete shear strength", f: "0.85*SQRT(0.8*[fck])*(SQRT(1+5*{beta})-1)/(6*{beta})", s: "f4" },
        { k: "tcm", h: "τc,max (Table 20)", u: "N/mm²", f: "IF([fck]<=15,2.5,IF([fck]<=20,2.8,IF([fck]<=25,3.1,IF([fck]<=30,3.5,IF([fck]<=35,3.7,4)))))", s: "f2" },
        { k: "Vus", h: "Vus = (τv−τc)bd", u: "kN", f: "MAX(0,({tv}-{tc})*{b}*{d})/1000" },
        { k: "svV", h: "sv for shear", u: "mm", f: "IF({Vus}>0,0.87*[fy]*[Asv]*{d}/({Vus}*1000),9999)", s: "f0" },
        { k: "svT", h: "sv for torsion cl 41.4.3", u: "mm", f: "IF({Tu}>0.5,0.87*[fy]*[Asv]/({Tu}*10^6/(({b}-60)*({Dd}-70))+{Vu}*1000/(2.5*({Dd}-70))),9999)", s: "f0" },
        { k: "svm", h: "sv min steel cl 26.5.1.6", u: "mm", f: "0.87*[fy]*[Asv]/(0.4*{b})", s: "f0" },
        { k: "svl", h: "sv max spacing", u: "mm", f: "IF({Tu}>0.5,MIN({b}-60,({b}-60+{Dd}-70)/4,300),MIN(0.75*{d},300))", s: "f0" },
        { k: "sv", h: "Provide 2L-8φ @", u: "mm c/c", d: "smallest of the 4 spacings, rounded", f: "MAX(50,FLOOR(MIN({svV},{svT},{svm},{svl}),5))", s: "f0" },
        { k: "st", h: "Status", f: 'IF(AND({Abot}+{Atop}<=0.04*{b}*{Dd},{tv}<={tcm}),"OK","FAIL")', s: "stat", d: "OK / FAIL" },
        { k: "cs", h: "Mu+ from", d: "governing combination" }, { k: "ch", h: "Mu− from", d: "governing combination" }],
        des.beams.map(function (r) { return { id: r.k + 1, sec: r.name, b: r.b, Dd: r.D, Ms: r.Ms, Mh: r.Mh, Vu: r.V, Tu: r.T, fsc: r3(r.fsc), barsB: r.barsB, barsT: r.barsT, cs: r.cs, ch: r.ch }; }), G, { fc: 2 });
      dsn.beam = { sh: "Beam Design", col: t.L.st, a: t.first, b: t.last };
    }
    if (des && des.cols.length && !W) {
      var cd = wb.sheet("Column Design", { cols: [8, 10].concat(Array(30).fill(12)), color: TAB.design });
      intro(cd, "Column Design — IS 456 limit state method", "One row per RCC column element, for its critical load combination. Read left to right: slenderness (le/D, le/b) → design axial load and moments, increased for minimum eccentricity and, if slender, the additional moment Ma → steel percentage → axial capacity Puz and exponent αn → uniaxial capacities Mux1, Muy1 (strain-compatibility values from the app) → biaxial interaction ratio, which must be ≤ 1. Status = OK when the ratio ≤ 1.", 12);
      var t2 = table(cd, [
        { k: "id", h: "Member", s: "n0" }, { k: "sec", h: "Section" }, { k: "b", h: "b", u: "mm", s: "n0" }, { k: "Dd", h: "D", u: "mm", s: "n0" }, { k: "L", h: "L", u: "mm", s: "n0" },
        { k: "le", h: "le = k·L", u: "mm", f: "[kcol]*{L}", s: "f0", d: "effective length" }, { k: "sD", h: "le/D", f: "{le}/{Dd}", d: "> 12 = slender" }, { k: "sb", h: "le/b", f: "{le}/{b}", d: "> 12 = slender" },
        { k: "cb", h: "Critical combination", d: "worst of all combinations" }, { k: "Pu", h: "Pu", u: "kN", s: "n2", d: "factored axial load" }, { k: "Mz0", h: "Mux (analysis)", u: "kNm", s: "n2", d: "from frame analysis" }, { k: "My0", h: "Muy (analysis)", u: "kNm", s: "n2", d: "from frame analysis" },
        { k: "ex", h: "ex,min = L/500 + D/30 ≥ 20", u: "mm", f: "MAX({L}/500+{Dd}/30,20)" }, { k: "ey", h: "ey,min = L/500 + b/30 ≥ 20", u: "mm", f: "MAX({L}/500+{b}/30,20)" },
        { k: "Max", h: "Max (cl 39.7.1)", u: "kNm", f: "IF({sD}>12,{Pu}*{Dd}/2000*{sD}^2/1000,0)" }, { k: "May", h: "May (cl 39.7.1)", u: "kNm", f: "IF({sb}>12,{Pu}*{b}/2000*{sb}^2/1000,0)" },
        { k: "Mux", h: "Mux design", u: "kNm", f: "MAX({Mz0},{Pu}*{ex}/1000)+{Max}", d: "max(analysis, Pu·emin) + Ma" }, { k: "Muy", h: "Muy design", u: "kNm", f: function (r) { return r.twoD ? "0" : "MAX({My0},{Pu}*{ey}/1000)+{May}"; } },
        { k: "pc", h: "Steel provided", u: "%", s: "n2", d: "least % that passes" }, { k: "As", h: "Asc = p·b·D/100", u: "mm²", f: "{pc}*{b}*{Dd}/100", s: "f0" },
        { k: "Puz", h: "Puz = 0.45fck·Ac + 0.75fy·Asc", u: "kN", d: "pure axial capacity", f: "(0.45*[fck]*({b}*{Dd}-{As})+0.75*[fy]*{As})/1000" },
        { k: "an", h: "αn (cl 39.6)", f: "MAX(1,MIN(2,1+({Pu}/{Puz}-0.2)/0.6))", s: "f4" },
        { k: "M1", h: "Mux1 at Pu (P–M strain compat.)", u: "kNm", s: "n2", d: "capacity from the app" }, { k: "M2", h: "Muy1 at Pu (P–M strain compat.)", u: "kNm", s: "n2", d: "capacity from the app" },
        { k: "ratio", h: "(Mux/Mux1)^αn + (Muy/Muy1)^αn", d: "must be ≤ 1", f: "({Mux}/{M1})^{an}+IF({Muy}>0,({Muy}/{M2})^{an},0)", s: "f4" },
        { k: "st", h: "Status", f: 'IF(AND({ratio}<=1,{Pu}<0.98*{Puz}),"OK","FAIL")', s: "stat" }, { k: "bars", h: "Bars" }],
        des.cols.map(function (r) { var qq = (r.need || r.crit || {}).q || {}; return { id: r.k + 1, sec: r.name, b: r.b, Dd: r.D, L: Math.round(r.L), cb: qq.cb || "-", Pu: qq.Pu || 0, Mz0: qq.Mz0 || 0, My0: qq.My0 || 0, pc: r.need ? r3(r.need.pc) : 4, M1: qq.M1 || 0, M2: qq.M2 || 1, bars: r.bars, twoD: m.twoD }; }), G, { fc: 2 });
      cd.row([]); cd.row([{ v: "Mux1, Muy1: uniaxial moment capacities at Pu from IS 456 cl 38/39 strain compatibility (parabolic-rectangular concrete, design stress-strain of steel, bars equally on four faces) — computed by the app. Steel % is the least value (0.8–4%) that satisfies all combinations.", s: "note" }]);
      dsn.col = { sh: "Column Design", col: t2.L.st, a: t2.first, b: t2.last };
    }
    if (des && des.steel.length && !W) {
      var sd = wb.sheet("Steel Design", { cols: [8, 14, 10].concat(Array(16).fill(12)), color: TAB.design });
      intro(sd, "Steel Design — IS 800 limit state method", "One row per steel member, at its governing combination. Capacities: Pd compression with flexural buckling (cl 7.1.2), Td tension yield (cl 6.2), Md,z bending including lateral-torsional buckling (Annex E, unrestrained length = member length), Md,y minor-axis bending. The ratio N/Nd + Mz/Mdz + My/Mdy (cl 9.3, simplified) must be ≤ 1.", 12);
      var t3 = table(sd, [{ k: "id", h: "Member", s: "n0" }, { k: "sec", h: "Section" }, { k: "type", h: "Type" }, { k: "L", h: "L", u: "mm", s: "n0" }, { k: "KLr", h: "KL/r max", s: "n2" },
        { k: "cb", h: "Governing combination", d: "highest utilisation" }, { k: "N", h: "N (tension +)", u: "kN", s: "n2", d: "axial force" }, { k: "Mz", h: "Mz", u: "kNm", s: "n2", d: "major-axis moment" }, { k: "My", h: "My", u: "kNm", s: "n2", d: "minor-axis moment" },
        { k: "Pd", h: "Pd (cl 7.1.2)", u: "kN", s: "n2", d: "compression capacity" }, { k: "Td", h: "Td = A·fy/γm0", u: "kN", s: "n2", d: "tension capacity" }, { k: "Mdz", h: "Md,z (LTB, Annex E)", u: "kNm", s: "n2", d: "major-axis bending capacity" }, { k: "Mdy", h: "Md,y", u: "kNm", s: "n2", d: "minor-axis bending capacity" },
        { k: "ratio", h: "N/Nd + Mz/Mdz + My/Mdy (cl 9.3)", d: "utilisation, ≤ 1", f: "IF({N}<0,-{N}/{Pd},{N}/{Td})+IF({Mdz}>0,ABS({Mz})/{Mdz},0)+IF({Mdy}>0,ABS({My})/{Mdy},0)", s: "f4" },
        { k: "st", h: "Status", f: 'IF({ratio}<=1,"OK","FAIL")', s: "stat" }],
        des.steel.map(function (r) { var qq = r.q || {}; return { id: r.k + 1, sec: r.name, type: m.frames[r.k].type, L: Math.round(r.L), KLr: r.KLr, cb: r.cb || "-", N: qq.N || 0, Mz: qq.Mz || 0, My: qq.My || 0, Pd: r.Pd, Td: r.Td, Mdz: r.Mdz || 0, Mdy: r.Mdy || 0 }; }), G, { fc: 2 });
      dsn.steel = { sh: "Steel Design", col: t3.L.st, a: t3.first, b: t3.last };
    }
    ["slabs", "walls"].forEach(function (gk) {
      if (!des || !des[gk].length || W) return;
      var nm = gk === "slabs" ? "Slab Design" : "Wall Design";
      var ws = wb.sheet(nm, { cols: [9, 7].concat(Array(24).fill(11)), color: TAB.design });
      intro(ws, nm + " — IS 456 limit state method", "One row per " + (gk === "slabs" ? "slab" : "wall") + " finite element. The design moments come from the FE moments Mx, My, Mxy combined by the Wood–Armer rules (bottom = sagging, top = hogging, in the element's local x and y directions) and enveloped over all combinations. Steel per metre width is then a live formula from IS 456 Annex G, not less than the minimum. 'Spacing' is the 10 mm bar spacing for the largest steel area in that element." + (gk === "walls" ? " Walls also check axial compression and in-plane shear." : ""), 12);
      function ast(M, d) { return "IF(4.6*ABS(" + M + ")*10^6/([fck]*1000*" + d + "^2)<1,MAX(0.5*[fck]/[fy]*(1-SQRT(1-4.6*ABS(" + M + ")*10^6/([fck]*1000*" + d + "^2)))*1000*" + d + ",{amin}),0)"; }
      var cols = [{ k: "id", h: "Element", s: "n0" }, { k: "t", h: "t", u: "mm", s: "n0" }, { k: "dx", h: "dx = t − 30", u: "mm", f: "{t}-30", s: "f0" }, { k: "dy", h: "dy = t − 40", u: "mm", f: "{t}-40", s: "f0" },
        { k: "amin", h: "Ast,min", u: "mm²/m", f: gk === "slabs" ? "IF([fy]>250,0.0012,0.0015)*1000*{t}" : "0.0025*1000*{t}", s: "f0" },
        { k: "bx", h: "M bottom x (W–A)", u: "kNm/m", s: "n3", d: "sagging design moment" }, { k: "by", h: "M bottom y", u: "kNm/m", s: "n3" }, { k: "tx", h: "M top x", u: "kNm/m", s: "n3", d: "hogging design moment" }, { k: "ty", h: "M top y", u: "kNm/m", s: "n3" },
        { k: "Abx", h: "Ast bottom x", u: "mm²/m", f: ast("{bx}", "{dx}"), s: "f0" }, { k: "Aby", h: "Ast bottom y", u: "mm²/m", f: ast("{by}", "{dy}"), s: "f0" },
        { k: "Atx", h: "Ast top x", u: "mm²/m", f: ast("{tx}", "{dx}"), s: "f0" }, { k: "Aty", h: "Ast top y", u: "mm²/m", f: ast("{ty}", "{dy}"), s: "f0" },
        { k: "kmx", h: "max 4.6Mu/(fck·b·d²) (< 1 singly reinforced)", f: "4.6*10^6*MAX(ABS({bx})/{dx}^2,ABS({by})/{dy}^2,ABS({tx})/{dx}^2,ABS({ty})/{dy}^2)/([fck]*1000)", s: "f4" },
        { k: "s10", h: "10φ spacing for max Ast", u: "mm", f: "MIN(FLOOR(1000*78.54/MAX({Abx},{Aby},{Atx},{Aty}),10),3*{t},300)", s: "f0" }];
      if (gk === "walls") cols.push({ k: "sc", h: "Max compression σ", u: "N/mm²", s: "n3" }, { k: "tau", h: "In-plane shear τ", u: "N/mm²", s: "n3" },
        { k: "st", h: "Status", f: 'IF(AND({kmx}<1,{sc}<=0.4*[fck],{tau}<=MIN(0.17*[fck],IF([fck]<=20,2.8,IF([fck]<=25,3.1,IF([fck]<=30,3.5,IF([fck]<=35,3.7,4)))))),"OK","FAIL")', s: "stat" });
      else cols.push({ k: "st", h: "Status", f: 'IF({kmx}<1,"OK","FAIL")', s: "stat" });
      var t4 = table(ws, cols, des[gk].map(function (r) { return { id: r.k + 1, t: r.t, bx: r.bx, by: r.by, tx: r.tx, ty: r.ty, sc: r.sc, tau: r.tau }; }), G, { fc: 1 });
      ws.row([]); ws.row([{ v: "Design moments: Wood–Armer (sagging +, local element axes) enveloped over all combinations from the shell FE stress resultants Mx, My, Mxy. Ast = 0.5fck/fy·[1 − √(1 − 4.6Mu/(fck·b·d²))]·b·d with b = 1000 mm (IS 456 Annex G). Status: section must be adequate as singly reinforced (4.6Mu/fck·b·d² < 1)" + (gk === "walls" ? "; walls: axial compression ≤ 0.4fck, in-plane shear ≤ τc,max." : "."), s: "note" }]);
      dsn[gk] = { sh: nm, col: t4.L.st, a: t4.first, b: t4.last };
    });

    /* ===== Design basis & worked calculations ===== */
    if (des) {
      var bs = wb.sheet("Design Basis", { cols: [34, 90, 26], color: TAB.guide });
      intro(bs, "Design Basis — " + (W ? "working stress method" : "limit state method"), "Every equation, permissible value and limit used in this design, with the IS clause it comes from, grouped by topic. Use it as the 'design basis' page of a calculation report.", 3);
      bs.row(["Item", "Equation / limit", "IS clause"], "h", 22); bs.opt.freeze = "A" + bs.next();
      (W ? CALC.BASIS_WSM : CALC.BASIS).forEach(function (x) { if (x.length === 1) bs.row([x[0]], "sub"); else bs.row([{ v: x[0], s: "b" }, { v: x[1], s: "e2" }, x[2]]); });
      var wc = wb.sheet("Worked Calcs", { cols: [40, 62, 62, 34, 22, 8], color: TAB.design });
      intro(wc, "Worked Calcs — step-by-step calculation of every member", "Hand-calculation style working for each member and element: the check, the IS code equation, the equation with the actual numbers substituted and the result, the limit it is compared with, the clause, and OK/FAIL. Members are listed in order (beams, columns, steel, slabs, walls); each starts with a coloured heading row. Tip: use Ctrl+F to jump to a member, e.g. 'F25'.", 6);
      wc.row(["Check", "Equation", "Substitution / result", "Limit", "IS clause", "Status"], "h", 22); wc.opt.freeze = "A" + wc.next();
      [["beam", des.beams], ["column", des.cols], ["steel", des.steel], ["slab", des.slabs], ["wall", des.walls]].forEach(function (g) {
        g[1].forEach(function (rr) {
          var nm = g[0] === "slab" || g[0] === "wall" ? g[0].toUpperCase() + " element S" + (rr.k + 1) : g[0].toUpperCase() + " F" + (rr.k + 1) + " — " + rr.name;
          wc.row([nm + "  ·  " + (rr.ok ? "OK" : "FAIL")], rr.ok ? "ok" : "no");
          CALC.text(CALC.stepsFor(g[0], rr, m, p)).forEach(function (t) {
            if (t.length === 2) wc.row(["", { v: t[1], s: "b" }]);
            else wc.row([t[0], { v: t[1], s: "e2" }, { v: t[2], s: "e2" }, t[3], { v: t[4], s: "note" }, t[5] ? { v: t[5], s: t[5] === "OK" ? "ok" : "no" } : ""]);
          });
        });
      });
    }

    /* ===== Pushover ===== */
    if (po) {
      var ps = wb.sheet("Pushover", { cols: [34, 16, 16, 4, 12, 12, 12, 12, 12, 12, 12, 12], color: TAB.nonlin });
      intro(ps, "Pushover — nonlinear static analysis (+" + (po.dir ? "Y" : "X") + ")", "The building is pushed sideways with a gradually increasing load (pattern ∝ W·h²) while gravity load stays on. Each time a member end reaches its plastic moment a hinge forms; the analysis stops at a mechanism, instability or the target drift (" + po.stop + "). The capacity curve plots base shear against roof displacement. Compare the peak with the design base shear: the ratio is the overstrength. The hinge table lists when and where yielding occurred and its performance level (IO = immediate occupancy, LS = life safety, CP = collapse prevention).", 9);
      var Vd = S.L && S.L.eq ? S.L.eq[po.dir ? "EQY" : "EQX"] : null;
      ps.row(["Key results"], "tb");
      var s0 = ps.next(), nS = Vd ? 8 : 6, cH = s0 + nS + 2, c0 = cH + 1, c1 = c0 + po.curve.length - 1;
      var R = {}; function kv2(key, lbl, cell, note) { R[key] = ps.row([{ v: lbl, s: "b" }, cell, { v: note || "", s: "note" }]); }
      kv2("vmax", "Peak base shear Vmax (kN)", { f: "=MAX(B" + c0 + ":B" + c1 + ")", v: po.Vmax, s: "f2" }, "highest point of the curve");
      kv2("vy", "Base shear at first hinge Vy (kN)", { v: po.Vy || 0, s: "n2" }, "end of elastic behaviour");
      kv2("dy", "Roof displacement at first hinge dy (mm)", { v: (po.dy || 0) * 1000, s: "n2" }, "");
      kv2("du", "Final roof displacement du (mm)", { f: "=A" + c1, v: po.du * 1000, s: "f2" }, "last point of the curve");
      kv2("mu", "Displacement ductility μ = du/dy", { f: "=IF(B" + (s0 + 2) + ">0,B" + (s0 + 3) + "/B" + (s0 + 2) + ",0)", v: po.mu || 0, s: "f2" }, "how far beyond first yield the structure deforms");
      kv2("dr", "Roof drift du/H", { f: "=B" + (s0 + 3) + "/1000/" + r3(po.H), v: po.du / po.H, s: "pct" }, "H = " + r3(po.H) + " m");
      if (Vd) { kv2("vb", "Design base shear Vb (kN)", { v: Vd.Vb, s: "n2" }, "IS 1893, from the Loads sheet"); kv2("os", "Overstrength Vmax / Vb", { f: "=B" + s0 + "/B" + (s0 + 6), v: po.Vmax / Vd.Vb, s: "f2" }, "> 1 means reserve strength above the design force"); }
      ps.row([]); ps.row(["Capacity curve data"], "tb");
      ps.row(["Roof displacement (mm)", "Base shear (kN)", Vd ? "Design Vb (kN)" : ""], "h", 22);
      po.curve.forEach(function (c) { ps.row([{ v: c[0] * 1000, s: "n2" }, { v: c[1], s: "n2" }, Vd ? { f: "=$B$" + (s0 + 6), v: Vd.Vb, s: "f2" } : null]); });
      while (ps.rows.length < cH + 18) ps.rows.push({ c: [] });
      ps.chart({ title: "Capacity curve", x: "Roof displacement (mm)", y: "Base shear (kN)", at: [4, s0 - 2, 12, s0 + 20],
        series: [{ name: "Pushover", xref: "Pushover!$A$" + c0 + ":$A$" + c1, yref: "Pushover!$B$" + c0 + ":$B$" + c1, xv: po.curve.map(function (c) { return c[0] * 1000; }), yv: po.curve.map(function (c) { return c[1]; }) }]
          .concat(Vd ? [{ name: "Design Vb", xref: "Pushover!$A$" + c0 + ":$A$" + c1, yref: "Pushover!$C$" + c0 + ":$C$" + c1, dash: true, xv: po.curve.map(function (c) { return c[0] * 1000; }), yv: po.curve.map(function () { return Vd.Vb; }) }] : []) });
      ps.row([]); ps.row(["Hinge formation sequence"], "tb");
      table(ps, [{ k: "ev", h: "Event", s: "n0", d: "order of formation" }, { k: "mem", h: "Member", s: "n0" }, { k: "type", h: "Type" }, { k: "end", h: "End", d: "i start / j end" }, { k: "ax", h: "Action", d: "Mz/My bending, Axial for braces" }, { k: "V", h: "V (kN)", s: "n2", d: "base shear when it formed" }, { k: "d", h: "Roof d (mm)", s: "n2" }, { k: "rot", h: "θp (rad)", s: "n4", d: "final plastic rotation" }, { k: "state", h: "State", d: "performance level" }],
        po.events.map(function (e) { return { ev: e.ev, mem: e.k + 1, type: m.frames[e.k].type, end: e.end, ax: e.axis === "a" ? "Axial" : "M" + e.axis, V: e.V, d: e.d * 1000, rot: e.axis === "a" ? null : e.rot, state: e.state }; }), G, { freeze: false });
      ps.row([{ v: "Acceptance (indicative, ASCE 41 / FEMA 356): RCC beams IO/LS/CP 0.010/0.020/0.025 rad, RCC columns 0.005/0.015/0.020 rad, steel θy/6θy/8θy. Elastic–perfectly plastic hinges with P–M interaction; P-Delta " + (p.ppd ? "included" : "not included") + ".", s: "note" }]);
    }

    /* ===== Summary contents ===== */
    function kv(l, v, u) { sm.row([l, v, u || ""]); }
    sm.row(["Model"], "tb");
    kv("Model type", m.twoD ? "2D plane frame (XZ)" : "3D space structure");
    kv("Nodes / frame elements / shell elements", m.nodes.length + " / " + m.frames.length + " / " + m.shells.length);
    kv("Supports", Object.keys(m.sup).length);
    kv("Materials", "M" + p.fck + ", Fe" + p.fy + (des && des.steel.length ? ", E" + p.fys : ""));
    kv("Design method", W ? "Working stress method (IS 456 Annex B, IS 800 Sec 11)" : "Limit state method (IS 456, IS 800)");
    sm.row([]); sm.row(["Analysis"], "tb");
    if (lin) {
      kv("Method", "Direct stiffness (displacement) method" + (m.shells.length ? " + 4-node shell FEA" : "") + (pdl ? ", P-Delta (iterated geometric stiffness)" : ", linear elastic"));
      kv("Equations solved", res.info.neq);
      var umax = 0; res.combos.forEach(function (c) { for (var i = 0; i < c.U.length; i += 6) umax = Math.max(umax, Math.hypot(c.U[i], c.U[i + 1], c.U[i + 2])); });
      kv("Max displacement (all combinations)", { v: umax * 1000, s: "n2" }, "mm");
      Object.keys(S.L.eq).forEach(function (k) { kv("Design base shear " + k, { f: "=Loads!B" + findRow(wb, "Loads", "Design base shear Vb = Ah·W", k), v: S.L.eq[k].Vb, s: "f2" }, "kN"); });
    }
    if (po) kv("Pushover peak base shear", { f: "=Pushover!B6", v: po.Vmax, s: "f2" }, "kN");
    sm.row([]); sm.row(["Design check summary (live counts — updates if inputs change)"], "tb");
    sm.row(["Element group", "Checked", "Failing", "Open sheet"], "h", 22);
    [["Beams (IS 456)", "beam"], ["Columns (IS 456)", "col"], ["Steel members (IS 800)", "steel"], ["Slab elements", "slabs"], ["Wall elements", "walls"]].forEach(function (g) {
      var d = dsn[g[1]]; if (!d) return;
      var rng = q(d.sh) + "!$" + d.col + "$" + d.a + ":$" + d.col + "$" + d.b;
      var nf = (g[1] === "beam" ? des.beams : g[1] === "col" ? des.cols : g[1] === "steel" ? des.steel : des[g[1]]).filter(function (r) { return !r.ok; }).length;
      sm.row([g[0], { f: "=COUNTA(" + rng + ")", v: d.b - d.a + 1, s: "f0" }, { f: '=COUNTIF(' + rng + ',"FAIL")', v: nf, s: nf ? "no" : "ok" }, link(d.sh)]);
    });
    sm.row([]); sm.row([{ v: "Blue cells on the Inputs sheet and design-sheet inputs can be changed — dependent formulas recalculate. Analysis results (displacements, case forces, P–M capacities) come from the app's stiffness/FE solution and do not change when inputs are edited; re-run the analysis in the app after changing geometry, sections or loads. All results must be checked by a qualified structural engineer.", s: "note" }]);
    sm.merge("A" + (sm.next() - 1) + ":D" + (sm.next() - 1));

    /* ===== Method & formulas ===== */
    var mf = wb.sheet("Method & Formulas", { cols: [30, 110], color: TAB.guide });
    intro(mf, "Method & Formulas — how the analysis was done", "How the structure was modelled and solved (stiffness matrix method for frames, finite elements for slabs and walls, P-Delta, pushover), how loads were generated, and the design equations, with code references and limitations.", 2);
    METHOD.forEach(function (r) { if (r.length === 1) { mf.row([]); mf.row([r[0]], "sub"); } else mf.row([{ v: r[0], s: "b" }, { v: r[1], s: "note" }]); });
    notation(wb);
    readme(wb, rd, S, date);
    wb.sheets.forEach(function (s, i) { if (s._pt) wb.define("_xlnm.Print_Titles", q(s.name) + "!" + s._pt, i); });
    return wb;
  }
  function link(name, label) { return { f: '=HYPERLINK("#' + q(name).replace(/"/g, '""') + '!A1","' + (label || name).replace(/"/g, '""') + '")', v: label || name, s: "link" }; }
  function readme(wb, rd, S, date) {
    var m = S.m, p = S.p, W = p.method === "wsm";
    rd.row(["", { v: "IS StructDesign — analysis & design workbook", s: "t" }], null, 26);
    var r2 = rd.row(["", { v: "Created " + date + " · " + (m.twoD ? "2D plane frame" : "3D structure") + " · " + m.nodes.length + " nodes, " + m.frames.length + " members, " + m.shells.length + " shell elements · design by the " + (W ? "working stress method (IS 456 Annex B, IS 800 Section 11)" : "limit state method (IS 456:2000, IS 800:2007)") + ".", s: "desc" }], null, 32);
    rd.merge("B" + r2 + ":D" + r2);
    rd.row([]);
    rd.row(["", { v: "How to use this workbook", s: "tb" }]);
    [["1", "Start with Summary for the key results and how many members pass or fail."],
     ["2", "Open a Design sheet (beams, columns, steel, slabs, walls). Each row is one member; the Status column shows OK (green) or FAIL (red). The grey row under the headings explains every column."],
     ["3", "For the full hand-calculation of any member, open Worked Calcs and search (Ctrl+F) for its number, e.g. F25. Design Basis lists every equation and IS limit used."],
     ["4", "To try another concrete grade, steel grade, seismic zone or load factor, change the blue cells on Inputs (or the factors on Combinations). The design formulas, base shear and pass/fail counts update immediately."],
     ["5", "Changing the geometry, member sizes or loads changes the structural analysis itself — re-run the analysis in the app and export again."],
     ["6", "Every sheet has a ◄ Back to contents link at the top. Sheet tabs are colour-coded by group (see Contents)."]].forEach(function (x) { var rn = rd.row([{ v: x[0], s: "bt" }, { v: x[1], s: "desc" }], null, 30); rd.merge("B" + rn + ":D" + rn); });
    rd.row([]);
    rd.row(["", { v: "Colour key", s: "tb" }]);
    [[{ v: 25, s: "in2" }, "Input — you can change it; formulas that use it recalculate"],
     [{ v: 12.34, s: "f2" }, "Formula — calculated live in Excel from other cells"],
     [{ v: 12.34, s: "n2" }, "Result from the app's structural analysis (fixed number)"],
     [{ v: "OK", s: "ok" }, "Check passes (colour updates automatically)"],
     [{ v: "FAIL", s: "no" }, "Check fails — increase the section, grade or steel"],
     [{ v: "what the column means", s: "cd" }, "Explanation row under table headings"]].forEach(function (x) { var rn = rd.row(["", x[0], { v: x[1], s: "desc" }]); rd.merge("C" + rn + ":D" + rn); });
    rd.row([]);
    rd.row(["", { v: "Units and sign conventions", s: "tb" }]);
    [["Units", "Forces kN, moments kNm, lengths m (sections and steel in mm, mm²), stresses N/mm²."],
     ["Global axes", "X and Y horizontal, Z vertical upwards. Displacements are in mm."],
     ["Member axes", "x runs from node i to node j. Beams: local y is up, so Mz is the main (gravity) bending moment. Columns: local y is along global X."],
     ["Signs", "N positive = tension. Mz positive = sagging (bottom of beam in tension), negative = hogging (top in tension)."],
     ["Slabs & walls", "Moments are per metre width (kNm/m) in the element's local axes; Wood–Armer design moments: positive = bottom steel, negative = top steel."]].forEach(function (x) { var rn = rd.row(["", { v: x[0], s: "bt" }, { v: x[1], s: "desc" }], null, 30); rd.merge("C" + rn + ":D" + rn); });
    rd.row([]);
    rd.row(["", { v: "Contents", s: "tb" }]);
    rd.row(["#", "Sheet (click to open)", "What it contains", "Group"], "h", 22);
    var grp = {}; grp[TAB.guide] = "Guide"; grp[TAB.input] = "Inputs"; grp[TAB.model] = "Model"; grp[TAB.load] = "Loads"; grp[TAB.result] = "Analysis results"; grp[TAB.design] = "Design"; grp[TAB.nonlin] = "Nonlinear";
    wb.sheets.forEach(function (s, i) {
      if (s === rd) return;
      var dsc = SHEETDESC[s.name] || (/Slab/.test(s.name) ? "Slab reinforcement per element (Wood–Armer moments), live formulas" : /Wall/.test(s.name) ? "Wall reinforcement and stress checks, live formulas" : /Beam/.test(s.name) ? "Beam flexure, shear and torsion design, live formulas" : /Column/.test(s.name) ? "Column design for axial load + biaxial bending, live formulas" : /Steel/.test(s.name) ? "Steel member capacity checks, live formulas" : "");
      rd.row([{ v: i, s: "n0" }, link(s.name), { v: dsc, s: "desc" }, grp[s.opt.color] || ""]);
    });
    rd.row([]);
    var rn = rd.row(["", { v: "Design aid based on IS codes. Results must be checked and approved by a qualified structural engineer before use.", s: "note" }]); rd.merge("B" + rn + ":D" + rn);
  }
  function notation(wb) {
    var nt = wb.sheet("Notation", { cols: [16, 70, 16], color: TAB.guide });
    intro(nt, "Notation — symbols used in this workbook", "Meaning and units of every symbol that appears in the column headings, formulas and worked calculations.", 3);
    nt.row(["Symbol", "Meaning", "Unit"], "h", 22); nt.opt.freeze = "A" + nt.next();
    NOTATION.forEach(function (x) { if (x.length === 1) nt.row([x[0]], "sub"); else nt.row([{ v: x[0], s: "b" }, x[1], x[2] || ""]); });
  }
  var NOTATION = [["General"], ["DL, LL", "Dead load, imposed (live) load", "kN, kN/m, kN/m²"], ["EQX, EQY", "Earthquake load in X / Y (IS 1893)", "kN"], ["WLX, WLY", "Wind load in X / Y (IS 875 Pt 3)", "kN"], ["L, le", "Member length, effective length", "m / mm"], ["N", "Axial force (tension +)", "kN"], ["Vy, Vz", "Shear forces in member local y, z", "kN"], ["T", "Torsion", "kNm"], ["My, Mz", "Bending moments about member local y, z", "kNm"],
    ["Concrete"], ["fck", "Characteristic cube strength (M20 → 20)", "N/mm²"], ["fy", "Yield strength of reinforcement (Fe500 → 500)", "N/mm²"], ["b, D", "Width and overall depth of section", "mm"], ["d, d′", "Effective depth; cover to compression steel centre", "mm"], ["xu,max", "Limiting depth of neutral axis", "mm"], ["Mu, Vu, Tu", "Factored moment, shear, torsion (limit state)", "kNm, kN"], ["Mu,lim", "Limiting moment of resistance of a singly reinforced section", "kNm"], ["Ast, Asc", "Area of tension / compression steel", "mm²"], ["pt", "Tension steel percentage 100·Ast/(b·d)", "%"], ["τv, τc, τc,max", "Nominal shear stress; design shear strength of concrete; maximum shear stress", "N/mm²"], ["Asv, sv", "Area of stirrup legs; stirrup spacing", "mm², mm"], ["Me1, Ve", "Equivalent moment and shear including torsion", "kNm, kN"], ["Puz", "Pure axial load capacity of a column", "kN"], ["Mux1, Muy1", "Uniaxial moment capacity at the given axial load", "kNm"], ["αn", "Exponent in the biaxial interaction formula", "—"], ["emin", "Minimum eccentricity", "mm"], ["Ma", "Additional moment for slender columns", "kNm"],
    ["Working stress"], ["σcbc", "Permissible compressive stress in concrete in bending", "N/mm²"], ["σcc", "Permissible direct compressive stress in concrete", "N/mm²"], ["σst, σsc", "Permissible stress in tension / compression steel", "N/mm²"], ["m", "Modular ratio 280/(3σcbc)", "—"], ["k, j", "Neutral-axis depth factor, lever-arm factor", "—"], ["R", "Moment of resistance factor ½σcbc·k·j", "N/mm²"], ["Mbal", "Balanced moment R·b·d²", "kNm"], ["Cr", "Reduction coefficient for long columns", "—"],
    ["Steel"], ["A, Zp, Ze", "Area, plastic and elastic section modulus", "mm², mm³"], ["KL/r", "Slenderness ratio", "—"], ["λ, χ", "Non-dimensional slenderness; buckling reduction factor", "—"], ["Pd, Td", "Design compression / tension capacity", "kN"], ["Mcr, χLT", "Elastic critical moment; lateral-torsional buckling factor", "kNm, —"], ["Md", "Design bending capacity", "kNm"], ["γm0", "Partial safety factor for yielding (1.10)", "—"],
    ["Seismic & wind"], ["Z, I, R", "Zone factor, importance factor, response reduction factor", "—"], ["Ta, Sa/g", "Natural period; spectral acceleration coefficient", "s, —"], ["Ah", "Design horizontal acceleration coefficient", "—"], ["W, Wi", "Seismic weight of building / floor i", "kN"], ["Vb, Qi", "Design base shear; lateral force at floor i", "kN"], ["Vz, pz, pd", "Design wind speed; wind pressure; design wind pressure", "m/s, kN/m²"], ["Cf", "Net force coefficient", "—"],
    ["Slabs & pushover"], ["Mx, My, Mxy", "Plate bending and twisting moments per metre", "kNm/m"], ["Mx*, My*", "Wood–Armer design moments", "kNm/m"], ["Vmax, Vy", "Peak base shear; base shear at first hinge", "kN"], ["du, dy, μ", "Final and first-yield roof displacement; ductility du/dy", "mm, —"], ["θp", "Plastic hinge rotation", "rad"], ["IO, LS, CP", "Immediate occupancy, life safety, collapse prevention", "—"]];
  function designWSM(wb, des, m, p, G, dsn) {
    if (des.beams.length) {
      var bd = wb.sheet("Beam Design (WSM)", { cols: [8, 10].concat(Array(36).fill(11)), color: TAB.design });
      intro(bd, "Beam Design — IS 456 working stress method (Annex B)", "One row per RCC beam element, with working (unfactored) moments. For earthquake/wind combinations the forces are already divided by 4/3 (permissible stresses +33⅓ %). Read left to right: design constants m, k, j, R from the permissible stresses on Inputs → balanced moment Mbal = R·b·d² → steel Ast = M/(σst·j·d), plus compression steel when M > Mbal → shear stress against Table 23/24 → stirrups. Status = OK when steel ≤ 4 % bD and τv ≤ τc,max.", 12);
      var t = table(bd, [
        { k: "id", h: "Member", s: "n0" }, { k: "sec", h: "Section" }, { k: "b", h: "b", u: "mm", s: "n0" }, { k: "Dd", h: "D", u: "mm", s: "n0" },
        { k: "d", h: "d = D − d'", u: "mm", f: "{Dd}-[cover]", s: "f0" },
        { k: "Ms", h: "M+ working (÷1.33 if EL/WL)", u: "kNm", s: "n2" }, { k: "Mh", h: "M− working", u: "kNm", s: "n2" }, { k: "Ve", h: "Ve = V + 1.6T/b", u: "kN", s: "n2" }, { k: "Tu", h: "T", u: "kNm", s: "n2" },
        { k: "Mt", h: "Mt = T(1+D/b)/1.7", u: "kNm", f: "{Tu}*(1+{Dd}/{b})/1.7" }, { k: "Mb", h: "M1 bottom", u: "kNm", f: "{Ms}+{Mt}" }, { k: "Mtp", h: "M1 top", u: "kNm", f: "{Mh}+{Mt}" },
        { k: "mr", h: "m = 280/(3σcbc)", f: "280/(3*[scbc])", s: "f4" }, { k: "kk", h: "k = mσcbc/(mσcbc+σst)", f: "{mr}*[scbc]/({mr}*[scbc]+[sst])", s: "f4" },
        { k: "jj", h: "j = 1 − k/3", f: "1-{kk}/3", s: "f4" }, { k: "R", h: "R = ½σcbc·k·j", u: "N/mm²", f: "0.5*[scbc]*{kk}*{jj}", s: "f4" },
        { k: "Mbal", h: "Mbal = R·b·d²", u: "kNm", f: "{R}*{b}*{d}^2/10^6" }, { k: "Amin", h: "Ast,min = 0.85bd/fy", u: "mm²", f: "0.85*{b}*{d}/[fy]", s: "f0" },
        { k: "fsc", h: "σsc (1.5m rule, ≤ σsc,perm)", u: "N/mm²", s: "n2" },
        { k: "AstB", h: "Ast for M+ (bottom)", u: "mm²", f: "MAX(IF({Mb}<={Mbal},{Mb}*10^6/([sst]*{jj}*{d}),{Mbal}*10^6/([sst]*{jj}*{d})+({Mb}-{Mbal})*10^6/([sst]*({d}-[cover]))),{Amin})", s: "f0" },
        { k: "AstT", h: "Ast for M− (top)", u: "mm²", f: "MAX(IF({Mtp}<={Mbal},{Mtp}*10^6/([sst]*{jj}*{d}),{Mbal}*10^6/([sst]*{jj}*{d})+({Mtp}-{Mbal})*10^6/([sst]*({d}-[cover]))),{Amin})", s: "f0" },
        { k: "AscB", h: "Asc for M+ (top)", u: "mm²", f: "IF({Mb}>{Mbal},({Mb}-{Mbal})*10^6/(({fsc}-[scbc]*({kk}*{d}-[cover])/({kk}*{d}))*({d}-[cover])),0)", s: "f0" },
        { k: "AscT", h: "Asc for M− (bottom)", u: "mm²", f: "IF({Mtp}>{Mbal},({Mtp}-{Mbal})*10^6/(({fsc}-[scbc]*({kk}*{d}-[cover])/({kk}*{d}))*({d}-[cover])),0)", s: "f0" },
        { k: "Abot", h: "Bottom steel req.", u: "mm²", f: "MAX({AstB},{AscT})", s: "f0" }, { k: "Atop", h: "Top steel req.", u: "mm²", f: "MAX({AstT},{AscB})", s: "f0" },
        { k: "barsB", h: "Bottom bars" }, { k: "barsT", h: "Top bars" },
        { k: "tv", h: "τv = Ve/bd", u: "N/mm²", f: "{Ve}*1000/({b}*{d})", s: "f4" },
        { k: "tc", h: "τc (Table 23)", u: "N/mm²", s: "n3" },
        { k: "tcm", h: "τc,max (Table 24)", u: "N/mm²", f: "IF([fck]<=15,1.6,IF([fck]<=20,1.8,IF([fck]<=25,1.9,IF([fck]<=30,2.2,IF([fck]<=35,2.3,2.5)))))", s: "f2" },
        { k: "Vs", h: "Vs = (τv − τc)bd", u: "kN", f: "MAX(0,({tv}-{tc})*{b}*{d})/1000" },
        { k: "svV", h: "sv = σsv·Asv·d/Vs", u: "mm", f: "IF({Vs}>0,MIN([sst],230)*[Asv]*{d}/({Vs}*1000),9999)", s: "f0" },
        { k: "svm", h: "sv (min steel)", u: "mm", f: "0.87*[fy]*[Asv]/(0.4*{b})", s: "f0" },
        { k: "svl", h: "sv max", u: "mm", f: "IF({Tu}>0.5,MIN({b}-60,({b}-60+{Dd}-70)/4,300),MIN(0.75*{d},300))", s: "f0" },
        { k: "sv", h: "Provide 2L-8φ @", u: "mm", f: "MAX(50,FLOOR(MIN({svV},{svm},{svl}),5))", s: "f0" },
        { k: "st", h: "Status", f: 'IF(AND({Abot}+{Atop}<=0.04*{b}*{Dd},{tv}<={tcm}),"OK","FAIL")', s: "stat" }, { k: "cs", h: "M+ from" }, { k: "ch", h: "M− from" }],
        des.beams.map(function (x) { return { id: x.k + 1, sec: x.name, b: x.b, Dd: x.D, Ms: x.Ms, Mh: x.Mh, Ve: x.V, Tu: x.T, fsc: r3(x.fsc || WS.ssc(p.fy)), tc: x.tc, barsB: x.barsB, barsT: x.barsT, cs: x.cs, ch: x.ch }; }), G, { fc: 2 });
      bd.row([]); bd.row([{ v: "Working stress method, IS 456 Annex B. Forces from EL/WL combinations are divided by 4/3 (equivalent to increasing permissible stresses by 33⅓ %). τc from Table 23 at pt of the top steel.", s: "note" }]);
      dsn.beam = { sh: "Beam Design (WSM)", col: t.L.st, a: t.first, b: t.last };
    }
    if (des.cols.length) {
      var cd = wb.sheet("Column Design (WSM)", { cols: [8, 10].concat(Array(26).fill(12)), color: TAB.design });
      intro(cd, "Column Design — IS 456 working stress method (Annex B-3, B-4)", "One row per RCC column, at its critical working-load combination. The section is treated as uncracked with the steel transformed at 1.5m: calculated direct stress σcc,cal = P/Ae and bending stress σcbc,cal = Mx/Zx + My/Zy are compared with the permissible stresses (× Cr for long columns, × 4/3 for EL/WL). The sum of the two stress ratios must be ≤ 1.", 12);
      var t2 = table(cd, [
        { k: "id", h: "Member", s: "n0" }, { k: "sec", h: "Section" }, { k: "b", h: "b", u: "mm", s: "n0" }, { k: "Dd", h: "D", u: "mm", s: "n0" }, { k: "L", h: "L", u: "mm", s: "n0" },
        { k: "le", h: "le = k·L", u: "mm", f: "[kcol]*{L}", s: "f0" },
        { k: "Cr", h: "Cr (B-3.3)", f: "IF(OR({le}/{Dd}>12,{le}/{b}>12),MIN(1,1.25-{le}/(48*MIN({b},{Dd}))),1)", s: "f4" },
        { k: "cb", h: "Critical combination" }, { k: "P", h: "P", u: "kN", s: "n2" }, { k: "Mz", h: "Mx (incl. emin)", u: "kNm", s: "n2" }, { k: "My", h: "My (incl. emin)", u: "kNm", s: "n2" }, { k: "inc", h: "Stress increase", s: "n3" },
        { k: "pc", h: "Steel", u: "%", s: "n2" }, { k: "As", h: "Asc", u: "mm²", f: "{pc}*{b}*{Dd}/100", s: "f0" },
        { k: "n", h: "1.5m", f: "1.5*280/(3*[scbc])", s: "f4" }, { k: "Ae", h: "Ae = bD + (1.5m−1)Asc", u: "mm²", f: "{b}*{Dd}+({n}-1)*{As}", s: "f0" },
        { k: "Ix", h: "Ix transformed", u: "mm⁴", s: "e" }, { k: "Iy", h: "Iy transformed", u: "mm⁴", s: "e" },
        { k: "scc", h: "σcc,cal = P/Ae", u: "N/mm²", f: "{P}*1000/{Ae}", s: "f4" },
        { k: "scb", h: "σcbc,cal = Mx/Zx + My/Zy", u: "N/mm²", f: "{Mz}*10^6/({Ix}/({Dd}/2))+{My}*10^6/({Iy}/({b}/2))", s: "f4" },
        { k: "pcc", h: "σcc·Cr·inc", u: "N/mm²", f: "[scc]*{Cr}*{inc}", s: "f4" }, { k: "pcb", h: "σcbc·Cr·inc", u: "N/mm²", f: "[scbc]*{Cr}*{inc}", s: "f4" },
        { k: "ratio", h: "σcc,cal/σcc + σcbc,cal/σcbc", f: "{scc}/{pcc}+{scb}/{pcb}", s: "f4" },
        { k: "st", h: "Status", f: 'IF({ratio}<=1,"OK","FAIL")', s: "stat" }, { k: "bars", h: "Bars" }],
        des.cols.map(function (x) { var q = (x.need || x.crit || {}).q || {}, c = q.c || {}; return { id: x.k + 1, sec: x.name, b: x.b, Dd: x.D, L: Math.round(x.L), cb: q.cb || "-", P: q.Pu || 0, Mz: q.Mz || 0, My: q.My || 0, inc: r3(q.inc || 1), pc: x.need ? r3(x.need.pc) : 4, Ix: c.Ix || 1, Iy: c.Iy || 1, bars: x.bars }; }), G, { fc: 2 });
      cd.row([]); cd.row([{ v: "IS 456 Annex B-4.2: uncracked transformed section, compression steel at 1.5m. Ix, Iy include (1.5m−1)·As·y² of the bar layers (equal on four faces). If net tension occurs, check cracked section (B-4.3).", s: "note" }]);
      dsn.col = { sh: "Column Design (WSM)", col: t2.L.st, a: t2.first, b: t2.last };
    }
    if (des.steel.length) {
      var sd = wb.sheet("Steel Design (WSM)", { cols: [8, 14, 10].concat(Array(16).fill(12)), color: TAB.design });
      intro(sd, "Steel Design — IS 800 working stress method (Section 11)", "One row per steel member at its governing working-load combination. Permissible stresses: tension 0.6fy, compression 0.6χfy, bending 0.66fy (reduced for lateral-torsional buckling), shear 0.4fy — shown here as permissible forces/moments. Combined ratio (cl 11.5.1) ÷ stress increase (4/3 for EL/WL) must be ≤ 1.", 12);
      var t3 = table(sd, [{ k: "id", h: "Member", s: "n0" }, { k: "sec", h: "Section" }, { k: "type", h: "Type" }, { k: "L", h: "L", u: "mm", s: "n0" }, { k: "KLr", h: "KL/r", s: "n2" },
        { k: "cb", h: "Governing combination" }, { k: "N", h: "N (tension +)", u: "kN", s: "n2" }, { k: "Mz", h: "Mz", u: "kNm", s: "n2" }, { k: "My", h: "My", u: "kNm", s: "n2" }, { k: "inc", h: "Stress increase", s: "n3" },
        { k: "Pd", h: "fac·A (0.6χfy·A)", u: "kN", s: "n2" }, { k: "Td", h: "fat·A (0.6fy·A)", u: "kN", s: "n2" }, { k: "Mdz", h: "Fbcz·Zez", u: "kNm", s: "n2" }, { k: "Mdy", h: "Fbcy·Zey", u: "kNm", s: "n2" },
        { k: "ratio", h: "Combined (cl 11.5.1)", f: "(IF({N}<0,-{N}/{Pd},{N}/{Td})+IF({Mdz}>0,ABS({Mz})/{Mdz},0)+IF({Mdy}>0,ABS({My})/{Mdy},0))/{inc}", s: "f4" },
        { k: "st", h: "Status", f: 'IF({ratio}<=1,"OK","FAIL")', s: "stat" }],
        des.steel.map(function (x) { var q = x.q || {}; return { id: x.k + 1, sec: x.name, type: m.frames[x.k].type, L: Math.round(x.L), KLr: x.KLr, cb: x.cb || "-", N: q.N || 0, Mz: q.Mz || 0, My: q.My || 0, inc: r3(q.inc || 1), Pd: x.Pd, Td: x.Td, Mdz: x.Mdz || 0, Mdy: x.Mdy || 0 }; }), G, { fc: 2 });
      dsn.steel = { sh: "Steel Design (WSM)", col: t3.L.st, a: t3.first, b: t3.last };
    }
    ["slabs", "walls"].forEach(function (gk) {
      if (!des[gk].length) return;
      var nm = (gk === "slabs" ? "Slab" : "Wall") + " Design (WSM)", ws = wb.sheet(nm, { cols: [9, 7].concat(Array(20).fill(11)), color: TAB.design });
      intro(ws, nm + " — IS 456 working stress method", "One row per " + (gk === "slabs" ? "slab" : "wall") + " element. Wood–Armer working moments (EL/WL combinations divided by 4/3) → Ast = M/(σst·j·d) per metre, not less than the minimum. 'max M/(R·b·d²)' must be ≤ 1 for a singly reinforced section.", 12);
      var cols = [{ k: "id", h: "Element", s: "n0" }, { k: "t", h: "t", u: "mm", s: "n0" }, { k: "dx", h: "dx", u: "mm", f: "{t}-30", s: "f0" }, { k: "dy", h: "dy", u: "mm", f: "{t}-40", s: "f0" },
        { k: "amin", h: "Ast,min", u: "mm²/m", f: gk === "slabs" ? "IF([fy]>250,0.0012,0.0015)*1000*{t}" : "0.0025*1000*{t}", s: "f0" },
        { k: "kk", h: "k", f: "(280/(3*[scbc]))*[scbc]/((280/(3*[scbc]))*[scbc]+[sst])", s: "f4" }, { k: "jj", h: "j", f: "1-{kk}/3", s: "f4" }, { k: "R", h: "R", f: "0.5*[scbc]*{kk}*{jj}", s: "f4" },
        { k: "bx", h: "M bot x", u: "kNm/m", s: "n3" }, { k: "by", h: "M bot y", u: "kNm/m", s: "n3" }, { k: "tx", h: "M top x", u: "kNm/m", s: "n3" }, { k: "ty", h: "M top y", u: "kNm/m", s: "n3" },
        { k: "Abx", h: "Ast bot x = M/(σst·j·d)", u: "mm²/m", f: "MAX(ABS({bx})*10^6/([sst]*{jj}*{dx}),{amin})", s: "f0" }, { k: "Aby", h: "Ast bot y", u: "mm²/m", f: "MAX(ABS({by})*10^6/([sst]*{jj}*{dy}),{amin})", s: "f0" },
        { k: "Atx", h: "Ast top x", u: "mm²/m", f: "MAX(ABS({tx})*10^6/([sst]*{jj}*{dx}),{amin})", s: "f0" }, { k: "Aty", h: "Ast top y", u: "mm²/m", f: "MAX(ABS({ty})*10^6/([sst]*{jj}*{dy}),{amin})", s: "f0" },
        { k: "Mr", h: "max M/(R·b·d²)", f: "10^6*MAX(ABS({bx})/{dx}^2,ABS({by})/{dy}^2,ABS({tx})/{dx}^2,ABS({ty})/{dy}^2)/({R}*1000)", s: "f4" }];
      if (gk === "walls") cols.push({ k: "sc", h: "σc", u: "N/mm²", s: "n3" }, { k: "tau", h: "τ", u: "N/mm²", s: "n3" },
        { k: "st", h: "Status", f: 'IF(AND({Mr}<=1,{sc}<=[scc],{tau}<=IF([fck]<=15,1.6,IF([fck]<=20,1.8,IF([fck]<=25,1.9,IF([fck]<=30,2.2,IF([fck]<=35,2.3,2.5)))))),"OK","FAIL")', s: "stat" });
      else cols.push({ k: "st", h: "Status", f: 'IF({Mr}<=1,"OK","FAIL")', s: "stat" });
      var t4 = table(ws, cols, des[gk].map(function (x) { return { id: x.k + 1, t: x.t, bx: x.bx, by: x.by, tx: x.tx, ty: x.ty, sc: x.sc, tau: x.tau }; }), G, { fc: 1 });
      dsn[gk] = { sh: nm, col: t4.L.st, a: t4.first, b: t4.last };
    });
  }
  function findRow(wb, sheet, label, key) {
    var s = wb.sheets.filter(function (x) { return x.name === sheet; })[0], seen = false;
    for (var i = 0; i < s.rows.length; i++) {
      var c = s.rows[i].c[0];
      if (typeof c === "string" && c.indexOf("Seismic base shear " + key) === 0) seen = true;
      if (seen && c === label) return i + 1;
    }
    return 1;
  }
  var SHEETDESC = { Summary: "Key results and pass/fail counts for each member group", Notation: "Meaning and units of every symbol", Inputs: "Design parameters you can change (named cells p_fck, p_fy, p_Zz …)", Nodes: "Node coordinates and restraints", Members: "Frame members, lengths and section properties (formulas)", Shells: "Shell (slab / wall) elements",
    Loads: "Load-case totals, IS 1893 base shear & vertical distribution, IS 875-3 wind (formulas)", Combinations: "Load factors (IS 456 Table 18)", Disp_Cases: "Nodal displacements per load case", Disp_Combos: "Nodal displacements per combination",
    Forces_Cases: "Member end forces per load case", Forces_Combos: "Member end forces per combination", Reactions: "Support reactions with equilibrium check", Drift: "Storey drift check (formulas)", Pushover: "Capacity curve (chart), hinge sequence, ductility", "Design Basis": "Equations and IS code limits used, with clause numbers", "Worked Calcs": "Step-by-step calculation of every member: equation, substituted values, limit, clause, status", "Method & Formulas": "Element formulations, solver, design equations and clauses" };
  var METHOD = [
    ["1 · Frame analysis — direct stiffness (displacement) method"],
    ["Unknowns", "6 DOF per node (ux, uy, uz, θx, θy, θz). Global K = Σ Tᵀ k T assembled from element stiffness matrices; K·U = F solved for U; member end forces f = k·T·U − f₀ (fixed-end forces)."],
    ["Element stiffness k (12×12)", "Axial EA/L; torsion GJ/L; bending about z: 12EIz/L³, 6EIz/L², 4EIz/L, 2EIz/L; bending about y likewise with EIy. Euler–Bernoulli beam theory."],
    ["Transformation T", "Local x along i→j; local y = global Z projected normal to x (global X for vertical members); z = x × y."],
    ["Member loads", "UDL w → fixed-end forces wL/2 and wL²/12; self weight = γ·A."],
    ["End releases / pins", "Released DOFs removed by static condensation: k* = k_cc − k_cr k_rr⁻¹ k_rc."],
    ["Solver", "Reverse Cuthill–McKee node renumbering, skyline (profile) storage, LDLᵀ factorisation (Bathe COLSOL). A zero or negative pivot = mechanism / instability."],
    ["2 · Finite element analysis of slabs, plates and walls"],
    ["Shell element", "4-node flat shell = membrane + plate + drilling stiffness, in the element's local plane."],
    ["Membrane", "QM6 incompatible-mode quadrilateral (Taylor's modification), internal modes condensed: exact for pure bending in-plane, no shear locking."],
    ["Plate bending", "MITC4 Mindlin–Reissner plate: bending D = Et³/12(1−ν²); transverse shear 5/6·G·t with assumed (tied) shear strains — free of shear locking for thin slabs."],
    ["Stress resultants", "Nx, Ny, Nxy (kN/m), Mx, My, Mxy (kNm/m), Qx, Qy (kN/m) at element centre."],
    ["Wood–Armer", "Bottom: Mx* = Mx + |Mxy|, My* = My + |Mxy| (with the standard corrections when one is negative); top analogous. Used for slab/wall reinforcement."],
    ["Verification", "Cantilever PL³/3EI, fixed beam wL²/12 & wL⁴/384EI, portal sway Ph³/24EI, P-Delta 1/(1−P/Pcr), SS plate 0.00406qa⁴/D & 0.0479qa², clamped plate 0.00126qa⁴/D, shear wall PH³/3EI + PH/(κGA): all within 0–3%."],
    ["3 · Linear static and P-Delta"],
    ["Linear static", "Each load case solved once; combinations = Σ factor × case results (see Combinations sheet and live formulas)."],
    ["P-Delta", "Geometric stiffness kg(N) of each member (consistent, N/30L[36 3L −36 3L; …]) added to K; iterated per combination until displacements converge (geometric non-linearity)."],
    ["4 · Nonlinear static (pushover)"],
    ["Procedure", "Gravity (DL + 25% LL) applied first; lateral pattern ∝ W·h² (IS 1893) or W increased event-to-event. At each event the next hinge is found where M reaches Mp(P); a moment release is inserted and K (with kg for P-Delta) is rebuilt."],
    ["Hinge capacity", "RCC: Mp(P) from IS 456 strain-compatibility P–M interaction of the section (assumed steel %). Steel: Mp = Zp·fy/γm0, Mpr = 1.18Mp(1 − P/Py) ≤ Mp (IS 800 cl 9.3.1). Braces: yield in tension, buckling (IS 800 cl 7.1.2) in compression."],
    ["Stop criteria", "Target roof drift, mechanism (singular K), negative tangent stiffness (P-Delta), or maximum events."],
    ["5 · Loads"],
    ["Dead / imposed", "IS 875 Parts 1 & 2. Slab area loads → consistent nodal loads of the shell elements."],
    ["Seismic", "IS 1893 (Part 1):2016: Ta (cl 7.6.2), Sa/g (cl 6.4.2), Ah = (Z/2)(Sa/g)/(R/I) ≥ Table 7, Vb = Ah·W, Qi = Vb·Wi·hi²/ΣWj·hj² (cl 7.6.3). Seismic weight per cl 7.3."],
    ["Wind", "IS 875 (Part 3):2015: Vz = Vb·k1·k2·k3·k4, pz = 0.6Vz², pd = Kd·Ka·Kc·pz ≥ 0.7pz, F = Cf·pd·Ae."],
    ["Combinations", "IS 456 Table 18: 1.5(DL+LL), 1.2(DL+LL±EL), 1.5(DL±EL), 0.9DL±1.5EL."],
    ["6 · Design"],
    ["RCC beams", "IS 456 Annex G: Mu,lim = 0.36fck·b·xu,max(d − 0.42xu,max); Ast = 0.5fck/fy[1 − √(1 − 4.6Mu/fck·b·d²)]bd; doubly reinforced Asc = (Mu − Mu,lim)/((fsc − 0.446fck)(d − d')). Torsion cl 41.4.2: Me1 = Mu + Tu(1 + D/b)/1.7, Ve = Vu + 1.6Tu/b. Shear cl 40: τc from Table 19, τc,max Table 20, sv = 0.87fy·Asv·d/Vus; minimum cl 26.5.1.6."],
    ["RCC columns", "IS 456 cl 25.4 minimum eccentricity, cl 39.7.1 additional moments for slender columns (le/D > 12), cl 39.6 biaxial: (Mux/Mux1)^αn + (Muy/Muy1)^αn ≤ 1, Puz = 0.45fck·Ac + 0.75fy·Asc."],
    ["Steel members", "IS 800: compression cl 7.1.2 (buckling curves a/b/c), tension cl 6.2, LTB Annex E (Mcr, χLT, αLT = 0.21), combined cl 9.3.2 (simplified, Cm = 1): N/Nd + Mz/Mdz + My/Mdy ≤ 1, shear cl 8.4."],
    ["Slabs / walls", "Wood–Armer moments → Ast per metre (Annex G), minimum steel cl 26.5.2.1 (0.12% HYSD) / walls 0.25%; wall compression ≤ 0.4fck, in-plane shear ≤ τc,max."],
    ["Drift", "IS 1893 cl 7.11.1: storey drift ≤ 0.004h under unfactored design lateral force."],
    ["7 · Limitations"],
    ["", "Small-displacement theory; cracked-section factors are uniform; hinge model elastic–perfectly plastic without degradation; no response-spectrum / time-history dynamics; ductile detailing to IS 13920 must be done separately. Results must be reviewed and signed by a qualified structural engineer."]
  ];
  /* single design-module report (beam, column, footing, truss …) → workbook: inputs, step-by-step calculation, checks */
  function fromRep(r, mod, inputs) {
    var wb = XL.book(), sh = wb.sheet("Calculation", { cols: [48, 30, 12, 24], tab: 1, freeze: "A5" });
    sh.row([r.title], "t"); sh.merge("A1:D1");
    sh.row([r.code + " · IS StructDesign · " + new Date().toISOString().slice(0, 10)], "note");
    sh.row([r.ok() ? "Result: ALL CHECKS PASS" : "Result: CHECK FAILS"], r.ok() ? "ok" : "no");
    var dr = sh.row([{ v: "How to read: the design is set out step by step under numbered headings. Shaded rows in blue type are the IS code equations with your numbers substituted; rows marked ✔ / ✘ are code checks, with the comparison in column B and the clause in column D. 'Summary' gives the final section and reinforcement. The Inputs sheet lists every input used.", s: "desc" }], null, 44);
    sh.merge("A" + dr + ":D" + dr);
    if (r.summary.length) { sh.row([]); sh.row(["Summary", "Value"], "h"); r.summary.forEach(function (x) { sh.row([x[0], val(x[1])]); }); }
    function val(v) { var t = String(v).trim(), n = Number(t.replace(/,/g, "")); return t !== "" && isFinite(n) && /^[-+]?[\d,]*\.?\d+(e[-+]?\d+)?$/i.test(t) ? { v: n, s: "n3" } : t; }
    r.items.forEach(function (it) {
      if (it.k === "h") { sh.row([]); sh.row([it.t], "sub"); }
      else if (it.k === "r") sh.row([it.l, val(it.v), it.u, { v: it.ref, s: "note" }]);
      else if (it.k === "e") { var rn = sh.row([{ v: it.t, s: "e2" }, "", "", { v: it.ref ? "[" + it.ref + "]" : "", s: "note" }]); sh.merge("A" + rn + ":C" + rn); }
      else if (it.k === "n") sh.row([{ v: it.t, s: "note" }]);
      else if (it.k === "x") sh.row([{ v: it.t, s: "no" }]);
      else if (it.k === "c") sh.row([{ v: (it.c.ok ? "✔ " : "✘ ") + it.c.l, s: it.c.ok ? "ok" : "no" }, it.c.d, it.c.ok ? "OK" : "FAIL", { v: it.c.ref, s: "note" }]);
      else if (it.k === "t") { sh.row(it.head, "h"); it.rows.forEach(function (rw) { sh.row(rw.map(val)); }); }
    });
    sh.row([]); sh.row([{ v: "Design aid based on IS codes — results must be checked and approved by a qualified structural engineer.", s: "note" }]);
    sh.opt.color = TAB.design;
    var ip = wb.sheet("Inputs", { cols: [44, 20, 10], color: TAB.input });
    ip.row(["Inputs used for this design (blank fields in the app take their default values)"], "tb");
    ip.row(["Input", "Value", "Unit"], "h", 22);
    Object.keys(mod.f).forEach(function (k) { var f = mod.f[k], v = inputs[k]; if (v === undefined) return; ip.row([f.label, typeof v === "number" ? { v: v, s: "in2" } : { v: String(v), s: "in" }, f.unit || ""]); });
    return wb;
  }
  /* save bytes: Android bridge, artifact viewer download capability, or browser download */
  function save(wb, name, done) {
    var mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    wb.bytesAsync().then(function (u8) {
      if (window.AndroidBridge && AndroidBridge.saveFileB64) { AndroidBridge.saveFileB64(name, XL.b64(u8), mime); return done && done(true); }
      var blob = new Blob([u8], { type: mime });
      if (window.claude && window.claude.use && window.self !== window.top) {
        return Promise.resolve(window.claude.use("downloads")).then(function (dl) {
          if (!dl) throw new Error("downloads not available");
          return dl.save({ filename: name, data: blob });
        }).then(function () { done && done(true); }, function (e) { done && done(false, e); });
      }
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); done && done(true);
    }).catch(function (e) { done && done(false, e); });
  }
  return { build: build, ev: ev, fromRep: fromRep, save: save };
})();
if (typeof module !== "undefined") module.exports = RX;
