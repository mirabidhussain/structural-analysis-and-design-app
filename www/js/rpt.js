/* Complete calculation report: one self-contained HTML document (print → PDF), signed-review ready. */
var RPT = (function () {
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f(x, d) { return x === null || x === undefined || isNaN(x) ? "-" : (+x).toFixed(d === undefined ? 2 : d); }
  function tbl(head, rows) { return '<table><thead><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join("") + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + (x === undefined ? "" : x) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table>'; }
  function day(t) { return new Date(t || Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); }
  var CSS = "#rpt{font:12.5px/1.45 'Segoe UI',Roboto,Arial,sans-serif;color:#16202c;background:#fff;max-width:900px;margin:0 auto;padding:18px}" +
    "#rpt h1{font-size:24px;margin:0 0 6px;color:#1d3557}#rpt h2{font-size:17px;color:#1d3557;border-bottom:2px solid #1d3557;padding-bottom:4px;margin:26px 0 8px;page-break-before:always}#rpt h2.nb{page-break-before:auto}" +
    "#rpt h3{font-size:14px;color:#1d3557;margin:14px 0 6px}#rpt table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:11.5px}#rpt th,#rpt td{border:1px solid #c9d1da;padding:3px 5px;text-align:left;vertical-align:top}" +
    "#rpt th{background:#eef2f6}#rpt .cover{border:2px solid #1d3557;padding:26px;margin-bottom:10px}#rpt .meta td:first-child{width:32%;color:#5d6b7b}#rpt .ok{color:#1e8e4a;font-weight:600}#rpt .no{color:#c62828;font-weight:600}#rpt .w{color:#b26a00;font-weight:600}" +
    "#rpt .vb{border-left:5px solid #b26a00;background:#fff7e8;padding:8px 10px;margin:8px 0}#rpt .vb.vok{border-color:#1e8e4a;background:#e8f6ee}#rpt .vb.vno{border-color:#c62828;background:#fdecec}" +
    "#rpt .eq{font-family:Consolas,Menlo,monospace;background:#f3f5f8;border-left:3px solid #1d3557;padding:4px 7px;margin:3px 0;font-size:11.5px}#rpt .sig td{height:46px}#rpt .note{color:#5d6b7b;font-size:11.5px}" +
    "#rpt .toc li{margin:1px 0}#rpt details{margin:4px 0}#rpt .calc{border:1px solid #dfe4ea;border-radius:6px;padding:6px 8px;margin:6px 0}" +
    "@media print{#rpt{padding:0;max-width:none}.noprint{display:none!important}#rpt h2{page-break-before:always}#rpt tr{page-break-inside:avoid}}";
  function html(S, p, opt) {
    opt = opt || {};
    var P = S.p || {}, m = S.m, dt = S.det && !S.det.err && S.det.gB ? S.det : null, sm = PRO.summary(S), v = PRO.verifyState(p, S), vc = PRO.vClass(v), sec = 0, toc = [], body = "";
    function H(t, nb) { sec++; toc.push(sec + ". " + t); return '<h2 id="s' + sec + '"' + (nb ? ' class="nb"' : '') + '>' + sec + '. ' + esc(t) + '</h2>'; }
    var rev = p && p.revs && p.revs.length ? p.revs[p.revs.length - 1] : null;
    /* cover */
    var cover = '<div class="cover"><h1>Structural design calculations</h1><div style="font-size:16px;font-weight:600">' + esc(p ? p.name : "Project") + '</div><table class="meta">' +
      [["Job / file no.", p && p.jobNo], ["Client", p && p.client], ["Site", p && p.site], ["Design engineer", p && p.engineer], ["Checking engineer", p && p.checker], ["Status", p && p.status], ["Revision", rev ? rev.rev + " — " + day(rev.date) + (rev.note ? " — " + rev.note : "") : "not issued"], ["Date of this report", day()], ["Design method", P.method === "wsm" ? "Working stress (IS 456 Annex B, IS 800 cl 11)" : "Limit state (IS 456, IS 800)"], ["Software", "IS StructDesign, calculation engine " + REG.ENGINE]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + esc(r[1] || "—") + "</td></tr>"; }).join("") + '</table>' +
      '<div class="vb ' + vc[0] + '"><b>' + vc[1] + '</b><br>' + esc(vc[2]) + '</div><p class="note">A PASS in this report means the check that was made passed. It is not by itself a certificate of structural safety: the design must be reviewed and the drawings signed by a qualified structural engineer before construction.</p></div>';
    /* 1 codes */
    body += H("Codes and standards", true) + tbl(["Standard", "Status", "How it is used"], REG.STANDARDS.map(function (s) { return ["<b>" + esc(s[0]) + "</b><br><small>" + esc(s[1]) + "</small>", esc(s[2]), esc(s[3])]; }));
    /* 2 basis */
    var ent = P.entered || [], par = [["Concrete grade fck", P.fck, "N/mm²", "fck"], ["Reinforcement fy", P.fy, "N/mm²", "fy"], ["Structural steel fy", P.fys, "N/mm²", "fys"], ["Column section (default)", P.colSec, "", "colSec"], ["Beam section (default)", P.beamSec, "", "beamSec"], ["Slab thickness", P.tSlab, "mm", "tSlab"], ["Wall thickness", P.tWall, "mm", "tWall"],
      ["Cracked sections (IS 1893 cl 6.4.3.1)", P.crack ? "yes" : "no", "", "crack"], ["Floor finish / roof finish", P.ff + " / " + P.ffRoof, "kN/m²", "ff"], ["Imposed load floor / roof", P.ll + " / " + P.llRoof, "kN/m²", "ll"], ["Wall load on beams / parapet", P.wall + " / " + P.parapet, "kN/m", "wall"],
      ["Seismic zone, I, R, soil", P.eq ? P.zone + ", " + P.I + ", " + P.R + ", " + P.soil : "not considered", "", "zone"], ["Response spectrum / modes / combination", P.rsa ? "yes / " + P.nModes + " / " + String(P.rsComb).toUpperCase() : "no", "", "rsa"], ["Accidental torsion", P.accTor ? "yes (cl 7.8.2)" : "no", "", "accTor"],
      ["Wind", P.wind ? "Vb " + P.vb + " m/s, terrain " + P.terrain + ", Cf " + P.cf : "not considered", "", "wind"], ["Safe bearing capacity / founding depth", P.sbc + " kN/m² / " + P.Df + " m", "", "sbc"]];
    body += H("Design basis") + tbl(["Parameter", "Value", "Unit", "Source"], par.map(function (r) { return [esc(r[0]), esc(r[1]), r[2], ent.indexOf(r[3]) >= 0 ? "entered" : '<span class="w">default — confirm</span>']; }));
    if (P.secOver) body += '<h3>Section rules</h3><div class="eq">' + esc(P.secOver).replace(/\n/g, "<br>") + '</div>';
    body += '<p class="note">Clear covers used in detailing: beams ' + (dt ? dt.cf.cb : 30) + ' mm, columns ' + (dt ? dt.cf.cc : 40) + ' mm, slabs ' + (dt ? dt.cf.cs : 20) + ' mm, footings ' + (dt ? dt.cf.cf : 50) + ' mm (IS 456 Table 16, moderate exposure). ' + (dt && dt.cf.duct ? 'Ductile detailing to IS 13920:2016 applies (zone ' + esc(P.zone) + ').' : 'IS 13920 not mandatory (zone II / no seismic).') + '</p>';
    /* 3 assumptions */
    var asm = REG.CHECKS.filter(function (r) { return r[2] === "Simplified"; }).map(function (r) { return [esc(r[0]), esc(r[1]), esc(r[3])]; });
    asm = [["Model", "Supports at the base are fixed; floors are not rigid diaphragms (slab shells give in-plane stiffness)", "Footing rotation is ignored"], ["Model", "Members are line elements between nodes; rigid end offsets at joints are not modelled", "Conservative for moments at faces"], ["Loads", "Seismic weight = DL + 25 % LL (50 % for LL > 3 kN/m²), roof LL excluded (IS 1893 Table 10)", ""]].map(function (r) { return r.map(esc); }).concat(asm);
    body += H("Assumptions register") + tbl(["Area", "Assumption", "Effect / note"], asm);
    /* 4 model */
    var cnt = {}; m.frames.forEach(function (e) { var k = e.type + " " + e.sec.name; cnt[k] = (cnt[k] || 0) + 1; });
    body += H("Structural model") + tbl(["Item", "Value"], [["Nodes / frame elements / shell elements", m.nodes.length + " / " + m.frames.length + " / " + m.shells.length], ["Supports", Object.keys(m.sup).length], ["Type", m.twoD ? "2D plane frame" : "3D space structure"], ["Floor levels (m)", MD.floorLevels(m).map(function (z) { return f(z, 2); }).join(", ")]]) +
      '<h3>Sections in use</h3>' + tbl(["Member type and section", "Elements"], Object.keys(cnt).sort().map(function (k) { return [esc(k), cnt[k]]; }));
    /* 5 loads */
    var L = S.L, cr = S.res.caseReac || {};
    body += H("Loads") + tbl(["Case", "Σ Fx (kN)", "Σ Fy (kN)", "Σ Fz (kN)"], Object.keys(L.cases).map(function (c) { var s = [0, 0, 0]; Object.keys(cr[c] || {}).forEach(function (n) { for (var i = 0; i < 3; i++) s[i] += cr[c][n][i]; }); return [c, f(s[0], 1), f(s[1], 1), f(s[2], 1)]; })) + '<p class="note">Sums of the support reactions of each load case (equilibrium check of the applied loads).</p>';
    Object.keys(L.eq || {}).forEach(function (k) { var q = L.eq[k]; body += '<div class="eq">' + k + ': h = ' + f(q.H, 2) + ' m, d = ' + f(q.d, 1) + ' m, Ta = ' + f(q.T, 3) + ' s, Sa/g = ' + f(q.Sa, 3) + ', Ah = (Z/2)(Sa/g)/(R/I) = ' + f(q.Ah, 4) + ', W = ' + f(q.W, 0) + ' kN, VB = ' + f(q.Vb, 1) + ' kN (IS 1893 cl 7.2, 7.6)</div>'; });
    body += '<h3>Load combinations</h3>' + tbl(["No.", "Combination"], (S.cb || []).filter(function (c) { return !/^__/.test(c.name); }).map(function (c, i) { return [i + 1, esc(c.name) + (c.rs ? " (response spectrum)" : "")]; }));
    /* 6 analysis */
    body += H("Analysis results");
    if (S.se && S.se.md) {
      body += '<h3>Modal analysis</h3>' + tbl(["Mode", "T (s)", "f (Hz)", "Mass X %", "Mass Y %", "Torsion %", "Type"], S.se.md.modes.slice(0, 12).map(function (q) { return [q.k, f(q.T, 3), f(q.f, 3), f(100 * q.pct[0], 1), f(100 * (q.pct[1] || 0), 1), f(100 * q.pctR, 1), q.kind]; }));
      body += '<h3>Response spectrum (IS 1893 cl 7.7)</h3>' + tbl(["Direction", "Dynamic VB (kN)", "Static VB (kN)", "Scale factor", "Mass captured"], Object.keys(S.se.rs).map(function (d) { var r = S.se.rs[d]; return [+d ? "Y" : "X", f(r.Vb, 1), f(r.VbS, 1), f(r.scale, 3), f(100 * r.cum, 1) + " %"]; }));
    }
    if (S.drift && S.drift.length) { var dm = {}; S.drift.forEach(function (q) { if (!dm[q.c] || q.dr > dm[q.c].dr) dm[q.c] = q; }); body += '<h3>Storey drift (cl 7.11.1, limit 0.004)</h3>' + tbl(["Case", "Storey (m)", "Max drift", "Δmax/Δave", "Status"], Object.keys(dm).map(function (k) { var q = dm[k]; return [esc(k), f(q.zb, 2) + "–" + f(q.z, 2), f(q.dr, 5), m.twoD ? "—" : f(q.tr, 2), q.lim ? (q.ok ? '<span class="ok">OK</span>' : '<span class="no">EXCEEDS</span>') : ""]; })); }
    if (S.se && S.se.irr) { var soft = S.se.irr.filter(function (r) { return r.soft; }).length, mass = S.se.irr.filter(function (r) { return r.mass; }).length, tor = (S.se.tc || []).filter(function (r) { return r.ave > 1.2; }).length; body += '<p>Irregularities (IS 1893 Tables 5, 6): soft storey ' + (soft ? '<span class="no">' + soft + ' flags</span>' : '<span class="ok">none</span>') + ', mass ' + (mass ? '<span class="no">' + mass + '</span>' : '<span class="ok">none</span>') + ', torsional (Δmax/Δave > 1.2) ' + (tor ? '<span class="no">' + tor + '</span>' : '<span class="ok">none</span>') + '.</p>'; }
    /* 7 design summary */
    body += H("Design summary") + tbl(["Group", "Members", "Result", "Utilisation", "Governing", "Status", "Verification"], sm.map(function (r) { return ["<b>" + r.id + "</b>", esc(r.mem), esc(r.res), '<span class="' + (r.u > 1 ? "no" : r.u > 0.9 ? "w" : "") + '">' + f(r.u, 2) + '</span>', esc(r.why), r.ok ? '<span class="ok">PASS</span>' : '<span class="no">FAIL</span>', r.v ? esc(r.v.st) : ""]; })) +
      '<p class="note">Utilisation is the governing demand/capacity ratio; the verification state is the weakest of the checks behind the result (see "Verification status and review").</p>';
    /* 8 calculation trace */
    body += H("Calculation trace — governing members");
    var d = S.des, picks = [];
    function worst(arr, key) { var w = null; arr.forEach(function (r) { var u = key(r); if (!w || u > w.u) w = { r: r, u: u }; }); return w && w.r; }
    if (d.beams.length) picks.push(["beam", worst(d.beams, function (r) { return (r.ok ? 0 : 10) + Math.max(r.Ab, r.At) / (r.b * r.d); })]);
    if (d.cols.length) picks.push(["column", worst(d.cols, function (r) { return r.need ? r.need.r : 10; })]);
    if (d.steel.length) picks.push(["steel", worst(d.steel, function (r) { return r.ratio; })]);
    if (d.slabs.length) picks.push(["slab", worst(d.slabs, function (r) { return Math.max(r.Abx, r.Aby, r.Atx, r.Aty); })]);
    if (d.walls.length) picks.push(["wall", worst(d.walls, function (r) { return r.ok ? 0 : 1; })]);
    var list = opt.all ? [["beam", d.beams], ["column", d.cols], ["steel", d.steel], ["slab", d.slabs], ["wall", d.walls]].reduce(function (a, g) { return a.concat(g[1].map(function (r) { return [g[0], r]; })); }, []) : picks;
    body += '<p class="note">' + (opt.all ? "All members." : "The most heavily loaded member of each type, step by step with the clause used; every member is in the Excel workbook and in the app.") + '</p>';
    list.forEach(function (q) { if (!q[1]) return; body += '<div class="calc"><h3>' + esc(q[0][0].toUpperCase() + q[0].slice(1)) + ' ' + (q[0] === "slab" || q[0] === "wall" ? "S" : "F") + (q[1].k + 1) + (q[1].name ? " (" + esc(q[1].name) + ")" : "") + ' — ' + (q[1].ok ? '<span class="ok">OK</span>' : '<span class="no">FAIL</span>') + '</h3>' + CALC.html(CALC.stepsFor(q[0], q[1], m, P), esc) + '</div>'; });
    /* 9 detailing */
    if (dt) {
      body += H("Detailing and ductility checks");
      if (dt.scwb.length) { var sw = dt.scwb.slice().sort(function (a, b) { return a.r - b.r; }); body += '<h3>Strong column – weak beam (IS 13920 cl 7.2.1) — ' + sw.filter(function (q) { return !q.ok; }).length + ' of ' + sw.length + ' fail</h3>' + tbl(["Column", "Joint (m)", "Dir", "ΣMc", "ΣMb", "Ratio", ""], sw.slice(0, opt.all ? 999 : 20).map(function (q) { return [esc(q.col), f(q.z, 2), q.dir, f(q.Mc, 0), f(q.Mb, 0), f(q.r, 2), q.ok ? '<span class="ok">OK</span>' : '<span class="no">FAIL</span>']; })); }
      if (dt.joints.length) { var jj = dt.joints.slice().sort(function (a, b) { return b.r - a.r; }); body += '<h3>Beam–column joints (IS 13920 cl 9) — ' + jj.filter(function (q) { return !q.ok || !q.anch; }).length + ' of ' + jj.length + ' fail</h3>' + tbl(["Column", "Joint (m)", "Dir", "Vj (kN)", "Capacity (kN)", "k", "hc ≥ 20φ", ""], jj.slice(0, opt.all ? 999 : 20).map(function (q) { return [esc(q.col), f(q.z, 2), q.dir, f(q.Vj, 0), f(q.cap, 0), q.k, q.anch ? "yes" : '<span class="no">no</span>', q.ok && q.anch ? '<span class="ok">OK</span>' : '<span class="no">FAIL</span>']; })); }
      var ck = []; dt.gB.forEach(function (G) { G.rep.checks.forEach(function (q) { if (!q.ok) ck.push([G.id, q.t, q.v, q.cl]); }); }); dt.gC.forEach(function (G) { G.rep.checks.forEach(function (q) { if (!q.ok) ck.push([G.id, q.t, q.v, q.cl]); }); }); dt.gF.forEach(function (G) { G.rep.checks.forEach(function (q) { if (!q.ok) ck.push([G.id, q.t, q.v, q.cl]); }); }); (dt.gW || []).forEach(function (G) { G.rep.checks.forEach(function (q) { if (!q.ok) ck.push([G.id, q.t, q.v, q.cl]); }); });
      body += '<h3>Detailing checks not satisfied</h3>' + (ck.length ? tbl(["Group", "Check", "Value", "Clause"], ck.map(function (r) { return r.map(esc); })) : '<p class="ok">All beam, column, wall and footing detailing checks are satisfied.</p>');
      var sc = BOQ.schedules(S);
      [["cols", "Column schedule"], ["beams", "Beam schedule"], ["walls", "Wall schedule"], ["slabs", "Slab schedule"], ["foot", "Footing schedule"], ["mat", "Mat reinforcement schedule"]].forEach(function (g) { if (sc[g[0]].length) body += '<h3>' + g[1] + '</h3>' + tbl(BOQ.HEAD[g[0]], sc[g[0]].map(function (r) { return r.map(esc); })); });
      body += '<h3>Reinforcement by diameter (kg)</h3>' + tbl(["φ", "Beams", "Columns", "Slabs", "Footings", "Walls", "Total"], dt.tot.map(function (t) { return [t.dia + " mm", f(t.beams, 0), f(t.cols, 0), f(t.slabs, 0), f(t.foot, 0), f(t.walls || 0, 0), "<b>" + f(t.all, 0) + "</b>"]; }).concat([["<b>Total</b>", "", "", "", "", "", "<b>" + f(dt.total, 0) + "</b>"]]));
      if (dt.mat) {
        var mt = dt.mat, M0 = mt.mesh;
        body += H("Mat (raft) foundation") + '<p>' + esc(mt.why === "chosen" ? "Mat foundation chosen." : "Mat foundation used because " + mt.why + ".") + ' Plan ' + f(mt.L, 2) + ' × ' + f(mt.B, 2) + ' m (projection ' + f(mt.off, 2) + ' m beyond the outer column faces), thickness ' + mt.T + ' mm, M' + mt.fck + ' / Fe ' + mt.fy + '. Analysed by the flexible-plate method of IS 2950 (Part 1): thick-plate shell elements (' + mt.el.length + ', ' + f(mt.h, 2) + ' m) on compression-only Winkler springs, ks = ' + f(mt.ks, 0) + ' kN/m³' + (S.p.ks > 0 ? ' (entered)' : ' (120 × SBC, Bowles — replace with the soil report value)') + ', loaded by the base reactions of the building analysis. Soil pressures are net (backfill over the mat balances the excavated soil). Rigidity: λ = ' + f(mt.rigidity.lam, 3) + ' /m, 1.75/λ = ' + f(mt.rigidity.lim, 2) + ' m vs largest column spacing ' + f(mt.rigidity.sp, 2) + ' m (' + (mt.rigidity.rigid ? 'rigid' : 'flexible') + ').</p>';
        body += tbl(["Check", "Value", "Clause", ""], mt.checks.map(function (q) { return [esc(q.t), esc(q.v), esc(q.cl || ""), q.ok ? '<span class="ok">OK</span>' : '<span class="no">FAIL</span>']; }));
        body += '<h3>Soil pressure — flexible plate vs rigid method (kN/m²)</h3>' + tbl(["Set", "FE max", "Rigid max", "Rigid min", "Allowable", "Lift-off"], mt.svc.map(function (r) { return [esc(r.name), f(r.qmax, 1), f(r.rig.max, 1), f(r.rig.min, 1), f(r.lim, 0), f(100 * r.lift, 1) + " %"]; }));
        body += '<h3>Punching shear at d/2 (IS 456 cl 31.6)</h3>' + tbl(["Column", "Type", "Pu kN", "Vu kN", "b0 mm", "d mm", "τv N/mm²", "ks·0.25√fck", "Combination"], mt.pun.slice().sort(function (a, b) { return b.u - a.u; }).slice(0, opt.all ? 999 : 8).map(function (q) { return [esc(q.name), q.type, f(q.Pu, 0), f(q.Vu, 0), f(q.b0, 0), f(q.d, 0), f(q.tv, 3), f(q.kc, 3), esc(q.cb)]; }));
        body += '<h3>One-way shear, column strips at d from the faces</h3>' + tbl(["Column", "Section", "Strip width m", "V kN/m", "τv", "pt %", "τc", "Face"], mt.strips.slice().sort(function (a, b) { return b.u - a.u; }).slice(0, opt.all ? 999 : 6).map(function (q) { return [esc(q.col), q.dir + " at " + f(q.at, 2), f(q.w, 2), f(q.V, 1), f(q.tv, 3), f(q.pt, 2), f(q.tc, 3), q.face]; }));
        body += '<h3>Reinforcement</h3>' + tbl(["Layer", "Base mesh", "As mm²/m", "d mm"], [["Bottom X", M0.bx.dia + "φ@" + M0.bx.s, f(M0.bx.As, 0), f(mt.d.bx, 0)], ["Bottom Y", M0.by.dia + "φ@" + M0.by.s, f(M0.by.As, 0), f(mt.d.by, 0)], ["Top X", M0.tx.dia + "φ@" + M0.tx.s, f(M0.tx.As, 0), f(mt.d.tx, 0)], ["Top Y", M0.ty.dia + "φ@" + M0.ty.s, f(M0.ty.As, 0), f(mt.d.ty, 0)]]) +
          '<p class="note">Settlement under DL+LL ' + f(mt.wmax, 1) + ' mm (springs — indicative), angular distortion 1/' + (mt.ang.r > 0 ? Math.round(1 / mt.ang.r) : "∞") + '. ' + mt.zones.length + ' zones of extra bars (see the mat reinforcement schedule). Reinforcement ' + f(mt.wt, 0) + ' kg, concrete ' + f(mt.conc, 1) + ' m³.</p>' + '<div class="dwg">' + DT.svg(MAT.draw(mt, dt.cf)[0], { maxW: 700 }) + '</div>';
      }
    }
    /* 10 BOQ */
    if (S.boq) {
      var b = BOQ.price(S.boq, (p && p.rates) || {}), A = b.abs, I = b.inp, inr = function (v) { return Math.round(v).toLocaleString("en-IN"); };
      body += H("Bill of quantities and estimate") + tbl(["Item", "Description", "Unit", "Quantity", "Rate (₹)", "Source", "Amount (₹)"], b.items.map(function (it, i) { return [i + 1, esc(it.desc), it.unit, f(it.qty, it.unit === "kg" ? 0 : 2), it.rate ? f(it.rate, 2) : "", esc(it.src || "—"), it.amt ? inr(it.amt) : ""]; })
        .concat([["", "Sub-total", "", "", "", "", inr(A.sub)], ["", "Contingencies " + I.cont + " %", "", "", "", "", inr(A.cont)], ["", "Labour welfare cess " + I.cess + " %", "", "", "", "", inr(A.cess)], ["", "GST " + I.gst + " %", "", "", "", "", inr(A.gst)], ["", "<b>Total estimated cost</b>", "", "", "", "", "<b>₹ " + inr(A.total) + "</b>"]])) +
        '<p class="note">' + (I.sorOn ? "Rates: Jammu & Kashmir Schedule of Rates 2022 (exclusive of GST) unless the project's own rate is entered. " : "Rates: the project's own entries. ") + "Measurement in IS 1200 style from the designed model; " + I.mT + " mm masonry under every beam line less " + I.open + " % openings; steel from the bar bending schedule + " + I.wst + " % wastage. Doors, windows, roofing, painting, services and external works are not included." + (b.unpriced.length ? " Unpriced items: " + b.unpriced.length + "." : "") + "</p>";
    }
    /* 11 verification */
    var rv = (p && p.review) || {};
    body += H("Verification status and review") + '<div class="vb ' + vc[0] + '"><b>' + vc[1] + '</b><br>' + esc(vc[2]) + '</div>' +
      tbl(["Area", "Check", "State", "Why it needs review", "Review"], v.items.map(function (i) { var r = rv[i.key]; return [esc(i.area), esc(i.t), i.st === "FAIL" ? '<span class="no">FAIL</span>' : esc(i.st), esc(i.why), r ? ({ ok: "Accepted", query: '<span class="no">Query</span>', na: "N/A" }[r.state]) + " — " + esc(r.by) + ", " + day(r.date) + (r.note ? " — " + esc(r.note) : "") : '<span class="w">open</span>']; })) +
      '<h3>Independently verified checks</h3>' + tbl(["Area", "Check", "Evidence"], REG.CHECKS.filter(function (r) { return r[2] === "Verified"; }).map(function (r) { return [esc(r[0]), esc(r[1]), esc(r[3])]; }));
    body += '<h3>Signatures</h3><table class="sig"><tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr><tr><td>Designed by</td><td>' + esc(p && p.engineer) + '</td><td></td><td></td></tr><tr><td>Checked by</td><td>' + esc(p && p.checker) + '</td><td></td><td></td></tr><tr><td>Approved by</td><td></td><td></td><td></td></tr></table>';
    if (p && p.revs && p.revs.length) body += '<h3>Revision history</h3>' + tbl(["Rev", "Date", "By", "Note", "Engine"], p.revs.map(function (r) { return [esc(r.rev), day(r.date), esc(r.by), esc(r.note), esc(r.engine)]; }));
    /* 12 limits */
    body += H("Limitations") + '<ul>' + REG.CHECKS.filter(function (r) { return r[2] === "Not implemented"; }).map(function (r) { return '<li>' + esc(r[1]) + (r[3] ? ' — ' + esc(r[3]) : '') + '</li>'; }).join("") + '<li>The results depend on the inputs listed in the design basis; defaults marked "confirm" must be checked against site data.</li></ul>';
    return '<div id="rpt">' + cover + '<h2 class="nb">Contents</h2><ol class="toc">' + toc.map(function (t) { return '<li>' + esc(t.replace(/^\d+\.\s*/, "")) + '</li>'; }).join("") + '</ol>' + body + '</div>';
  }
  function doc(S, p, opt) { return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc((p ? p.name : "Project") + " — calculations") + '</title><style>body{margin:0;background:#fff}' + CSS + '</style></head><body>' + html(S, p, opt) + '</body></html>'; }
  function view(app, title, back, ctx) {
    title.textContent = "Calculation report"; back.hidden = false;
    var S = ctx.S();
    if (!S || !S.des) { app.innerHTML = '<div class="rep"><p>Run the analysis first (Frame & FE analysis ▸ Linear static).</p><a class="btnl pri" href="#model">Open the model ›</a></div>'; return; }
    var p = PDB.current(), all = !!view.all;
    app.innerHTML = '<style>' + CSS + '</style><div class="btns noprint" style="margin-bottom:8px"><button class="pri" id="rPrint" type="button">Print / Save PDF</button><button id="rDl" type="button">Download HTML</button><button id="rAll" type="button">' + (all ? "Governing members only" : "Include every member") + '</button><a class="btnl" href="#model">‹ Model</a></div>' + html(S, p, { all: all });
    document.getElementById("rPrint").onclick = function () { if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print((p.name || "Report") + " calculations"); else window.print(); };
    document.getElementById("rDl").onclick = function () { ctx.download(((p.name || "project").replace(/[^\w\- ]+/g, "_").replace(/\s+/g, "-")) + "-calculations.html", doc(S, p, { all: all })); };
    document.getElementById("rAll").onclick = function () { view.all = !all; view(app, title, back, ctx); };
  }
  return { html: html, doc: doc, view: view };
})();
if (typeof module !== "undefined") module.exports = RPT;
