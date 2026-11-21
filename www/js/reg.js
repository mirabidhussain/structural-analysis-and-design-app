/* Standards register and verification status of every engineering check.
   Status: Verified = agrees with an independent benchmark in test/*.js; Calculated = implemented from the code clauses, checked
   for internal consistency but not against an independent benchmark; Simplified = stated approximation; Not implemented. */
var REG = {};
REG.ENGINE = "3.12";
REG.STANDARDS = [
  ["IS 456:2000", "Plain and reinforced concrete — code of practice (Fourth Revision), with amendments", "In use", "Limit state and working stress (Annex B) design, detailing rules"],
  ["IS 13920:2016", "Ductile design and detailing of RC structures subjected to seismic forces (First Revision)", "In use", "Applied in zones III–V: beams cl 6, columns cl 7–8, joints cl 9, walls cl 10"],
  ["IS 1893 (Part 1):2016", "Criteria for earthquake resistant design of structures (Sixth Revision), with Amendments 1 and 2", "In use (reinstated)", "IS 1893 (Part 1):2025 and (Part 5):2025 were published in Nov 2025 and withdrawn by BIS gazette notification of 3 March 2026; the 2016 edition is the applicable standard. Torsional irregularity reported to both the 2016 text and Amendment 2."],
  ["IS 800:2007", "General construction in steel (Third Revision)", "In use", "Limit state design of members; working stress cl 11"],
  ["IS 875 (Part 1)", "Dead loads — unit weights", "1987 values used; 2026 revision published", "Only concrete 25 kN/m³ is built in — finishes and wall loads are user inputs. Unit weights not yet reviewed against IS 875 (Part 1):2026."],
  ["IS 875 (Part 2):1987", "Imposed loads", "In use", "Imposed loads are user inputs; pattern loading (IS 456 cl 22.4.1) and reduction for floors carried (cl 3.2.1, footings) are options; seismic weight per IS 1893 Table 10"],
  ["IS 875 (Part 3):2015", "Wind loads", "In use", "Vz = Vb·k1·k2·k3·k4, pressure on the building frontal area (no building pressure-coefficient workflow)"],
  ["IS 2950 (Part 1):1981", "Design and construction of raft foundations — Part 1 Design", "In use", "Mat foundations: flexible-plate method on Winkler springs, rigidity criterion 1.75/λ, rigid method as a check"],
  ["IS 1904:1986", "Design and construction of foundations in soils — general requirements", "In use", "Permissible settlement and angular distortion (raft: 75 mm sand / 100 mm clay, 1/500) — editable"],
  ["IS 2911 (Part 1/Sec 2):2010", "Pile foundations — bored cast-in-situ concrete piles (Sec 1: driven cast-in-situ)", "In use", "Pile module: capacity (Annex B), lateral moduli (Annex C), reinforcement, spacing, caps"],
  ["IS 875 (Part 4):2021", "Snow loads (Third Revision)", "In use", "Roof snow s = μ·s0 (flat roof μ = 0.8), designed for the more severe of snow and roof imposed load (cl 1); drift, unbalanced and the exposure/thermal effects are not modelled — enter an adjusted s0 where they matter"],
  ["IS 1200", "Method of measurement of building and civil engineering works", "In use", "Measurement rules of the bill of quantities"],
  ["JKSOR 2022", "Jammu & Kashmir Schedule of Rates 2022 (PW(R&B) Department)", "In use", "Default BOQ rates (inclusive of GST — no GST is added in the abstract); project rates override them; apply the cost index / premium of your work"],
  ["IS 875 (Part 5):1987", "Special loads and load combinations", "In use", "Combinations as IS 456 Table 18 / IS 800 Table 4"],
  ["SP 16:1980, SP 34:1987", "Design aids (IS 456); handbook on concrete reinforcement and detailing", "In use", "Reference values in tests; detailing practice (curtailment, slab top bars)"],
  ["IS 2502:1963", "Bending and fixing of bars for concrete reinforcement", "In use", "Bar bending schedule, bend deductions and hooks"]
];
/* [area, check, status, evidence / assumption] */
REG.CHECKS = [
  ["Analysis", "Linear static frame (6 DOF, Euler–Bernoulli, releases)", "Verified", "fem_verify.js: cantilever, fixed-end, portal sway, continuous beams, torsion vs closed form"],
  ["Analysis", "Shell FE (MITC4 plate + QM6 membrane), rigid-body and patch tests", "Verified", "Patch test, Cook's membrane (converged reference 25.1 from independent CST/Q4/QM6 codes), plate deflection convergence"],
  ["Analysis", "P-Delta (geometric stiffness iteration)", "Verified", "Amplification vs 1/(1 − P/Pcr) closed form; non-convergence rejected"],
  ["Analysis", "Pushover (event-to-event hinges)", "Verified", "po_verify.js: plastic collapse loads of beams and portals vs upper-bound theorem"],
  ["Analysis", "Model checks (mesh quality, floating parts, mechanisms)", "Calculated", "FE.checkModel"],
  ["Seismic", "Design spectrum Sa/g (IS 1893 Fig. 2 / cl 6.4.2)", "Verified", "Reference values for soil types I–III in acceptance.js B"],
  ["Seismic", "Equivalent static base shear and storey distribution (cl 7.6, 7.7)", "Verified", "acceptance.js T5–T7: IITK-GSDMA IS 1893 Example 1 (Ta 0.28 s, Ah 0.09, VB 1404 kN) and the INSDAG distribution 426/352/172/55 of 1005 kN, through both the seismic module and the frame model's load pattern"],
  ["Seismic", "Modal analysis (subspace iteration)", "Verified", "2-storey shear frame vs exact eigen-solution; mass participation sums to 100 %"],
  ["Seismic", "Response spectrum, CQC/SRSS, scaling (cl 7.7.3)", "Verified", "Single storey Vb = Ak·W, displacement Ak·g/ω², CQC ρ closed form"],
  ["Seismic", "Accidental torsion, CM / CR (cl 7.8.2)", "Verified", "Symmetric plan CR = CM, CR shift towards walls, torque = Qi·(0.5esi + 0.05bi)"],
  ["Seismic", "Irregularities (Table 5, 6), storey drift (cl 7.11)", "Calculated", "Soft storey / mass flags tested on constructed cases; drift at stacked nodes"],
  ["Seismic", "Missing-mass correction (cl 7.7.5.2): modes > 33 Hz and truncated mass static at ZPA, SRSS with the modal response", "Verified", "A rigid structure gives the static ZPA solution exactly; residual base shear = missing mass × A0·g and equals Σ reactions; with all modes no correction (acceptance.js L)"],
  ["Seismic", "Time-history analysis", "Not implemented", ""],
  ["RCC design", "Beam flexure, shear, torsion (IS 456 cl 38, 40, 41)", "Verified", "Mu,lim (SP 16 Table C), τc (Table 19), τc,max (Table 20) and expected pass/fail designs in acceptance.js A, B"],
  ["RCC design", "Column biaxial (strain compatibility + Bresler cl 39.6)", "Verified", "acceptance.js T1–T3: SP 16 worked Examples 6, 8 and 9 (Charts 33, 44, 45, 63) — Mu1 within 3 % of the chart readings, Puz exact; spot check at P = 0 (verify.js)"],
  ["RCC design", "Slab elements (Wood–Armer)", "Calculated", "Plate moments verified; Wood–Armer per Wood (1968) formulae"],
  ["RCC design", "Wall elements: σc ≤ 0.4fck and in-plane shear per element", "Simplified", "Kept as an element screen; walls are designed as piers below"],
  ["RCC design", "Shear walls as piers: P–M strain compatibility, shear, boundary elements (IS 13920 cl 10)", "Verified", "Section forces equal base reactions (equilibrium); P–M vs independent fibre computation; boundary-element trigger"],
  ["RCC design", "Deflection (span/depth) and crack width of frame beams and slabs", "Calculated", "Frame beams: span / effective depth with kt, kc from the bars provided (cl 23.2.1) and crack width by Annex F under service DL + LL; slab panels: short span / d. Annex F checked against a hand calculation (acceptance.js T8–T12); no published benchmark"],
  ["Steel design", "Compression fcd (cl 7.1.2, Table 9) and high-shear moment reduction (cl 9.2.2)", "Verified", "Table 9 values and a hand calculation of Mdv in verify.js / acceptance.js"],
  ["Steel design", "LTB (cl 8.2.2) and combined forces cl 9.3.1.1, 9.3.2.2 with Cm (Table 18)", "Calculated", "LTB verified against the published STAAD.Pro IS 800 verification problem (Mcr 60.13 kNm, χLT 0.666, Md 36.35 kNm — acceptance.js T4); the combined-force interaction has no independent benchmark yet"],
  ["Steel design", "Effective length of frame columns", "Simplified", "Uniform K (input) instead of Annex D charts"],
  ["Detailing", "Beam bars, curtailment, anchorage, laps, hoops (IS 13920 cl 6)", "Verified", "acceptance.js F: provided ≥ required at every station, 2d hoop spacing, laps outside 2d, capacity shear"],
  ["Detailing", "Columns: confinement lo, s, Ash, legs, laps (cl 7, 8)", "Verified", "acceptance.js F: hand formulas for lo, s, Ash"],
  ["Detailing", "Strong column – weak beam (cl 7.2.1)", "Verified", "ΣMc and ΣMb recomputed independently in acceptance.js F"],
  ["Detailing", "Beam–column joint shear (cl 9)", "Verified", "Vj and capacity recomputed independently in acceptance.js F"],
  ["Detailing", "Slab panels (IS 456 Annex D, SP 34)", "Calculated", "Steel ≥ required of every element; top bars over panel edges from the panel maximum"],
  ["Detailing", "Bar bending schedule (IS 2502)", "Verified", "Cutting lengths and weights vs hand values; Excel formulas recalculate to the app values"],
  ["Foundations", "Isolated footings: pressure, shear, punching, bearing (IS 456 cl 34)", "Verified", "Pressures recomputed from reactions in acceptance.js F"],
  ["Foundations", "Footing soil pressure distribution", "Simplified", "Rigid footing, full contact (no partial-uplift redistribution), +10 % self weight"],
  ["Foundations", "Mat (raft): plate on compression-only Winkler springs; punching, one-way shear, Wood–Armer flexure (IS 2950 Pt 1, IS 456)", "Verified", "Hertz point load on a plate on springs and Hetényi's beam on an elastic foundation within 1 %; a stiff mat reproduces the rigid method; punching (with the moment-transfer part of IS 456 cl 31.6.2.2, closed forms for interior and edge columns, acceptance.js T13–T14) and shear recomputed (acceptance.js J)"],
  ["Foundations", "Mat soil model and design simplifications", "Simplified", "Winkler springs (ks from the soil report, else 120 × SBC), net pressures, punching without the moment-transfer part, settlement from springs only (indicative)"],
  ["Foundations", "Pile capacity, IS 2911 Annex B static formula (α from Fig 2, Nq from Fig 1 read approximately, K = 1.0 bored / 1.5 driven), uplift, block failure", "Simplified", "Capacity terms recomputed by hand (acceptance.js M); Nq is a digitised approximation of Fig 1 — a load-test value overrides it"],
  ["Foundations", "Laterally loaded pile: beam on Winkler springs (IS 2911 Annex C moduli), fixed or free head", "Verified", "Long pile in uniform soil against Hetényi: free head y0 = 2Hλ/k, fixed head y0 = Hλ/k and M0 = H/(2λ), within 1 % (acceptance.js M)"],
  ["Foundations", "Pile groups and caps: pile loads with moments, cap flexure, one-way shear (2d/av), punching at the column and the piles; circular pile section P–M (IS 456)", "Calculated", "Pile loads, cap moment and section capacity recomputed (acceptance.js M)"],
  ["Foundations", "Combined footings, piled raft, consolidation settlement, soil–structure interaction", "Not implemented", "Overlapping isolated footings are flagged (choose Auto or Mat); piled raft is the next step"],
  ["Loads", "Wind on buildings (IS 875-3): pressure coefficients, internal pressure, torsion cases", "Simplified", "Wall Cpe of Table 5 (windward − leeward) by h/w and l/w, k1, Cpi reported for cladding, optional torsion sets (ASCE 7 Case 2) — acceptance.js T15–T18. Still simplified: no gust-factor / dynamic method (cl 10) for tall or flexible buildings, roof Cpe not applied to the frame, Ka fixed at 0.8"],
  ["Loads", "Working stress projects: walls designed by limit state with 1.5 × service forces", "Simplified", "Stated in the wall results"],
  ["Loads", "Snow on roofs (IS 875 Pt 4): s = μ·s0, the larger of snow and roof imposed load", "Simplified", "Uniform balanced snow only — no drift at parapets or steps; s0 is a user input (acceptance.js I)"],
  ["Loads", "Pattern imposed load — checkerboard alternate bays (IS 456 cl 22.4.1)", "Calculated", "The two patterns add up to the full imposed load (acceptance.js I); envelope with the full-load combination"],
  ["Loads", "Imposed-load reduction for floors carried (IS 875 Pt 2 cl 3.2.1)", "Calculated", "Table values checked in acceptance.js I; applied to footing sizing and design only, not to columns"],
  ["Detailing", "Nominal cover for exposure and fire (IS 456 Table 16, 16A, Fig. 1) and minimum grade (Table 5)", "Verified", "Table values and the effective depths that use them checked in acceptance.js I"],
  ["Quantities", "Bill of quantities of the whole building (IS 1200 style) priced with JKSOR 2022", "Calculated", "Concrete, masonry, plaster, floor and excavation quantities checked by hand in acceptance.js H; every default rate is traced to its JKSOR 2022 item"],
  ["Automation", "Automatic design (storey-wise enlargement until all checks pass)", "Calculated", "Converges on the test building in acceptance.js H; sizes are written as editable section rules"],
  ["Inputs", "Code limits on inputs: cover (IS 456 Table 16, cl 26.4), grade (Table 5), bar size (cl 26.5), span/d ceiling (cl 23.2.1), column slenderness (cl 25.3.1), footing edge (cl 34.1.2), IS 13920 member sizes, IS 2911 piles, IS 800 bolts and welds", "Verified", "Rules checked case by case in acceptance.js N; blocking can be switched off for existing structures and is then reported"],
  ["Automation", "Fix suggestions for failed member designs: smallest change of size, bars or grade that passes every check", "Calculated", "Each suggestion is re-run through the design and the input limits (acceptance.js N, UI test)"],
  ["Inputs", "Input units SI / MKS / FPS — converted at the form, stored and calculated in SI", "Verified", "Conversion factors and round trip checked in acceptance.js O; same design in FPS and SI (UI test)"],
  ["Quantities", "Project elements: take-off, bar bending schedule and JKSOR 2022 estimate of individually designed members (span + Ld/3 anchorage, 50φ column laps, 2(a + b) + 20φ links)", "Approximate", "Take-off rules recomputed by hand in acceptance.js O; excavation, backfill and finishes not included"],
  ["Slabs", "Slab design: one-way when ly/lx > 2 (IS 456 cl 24.4, spanning lx; continuous if both long edges are), otherwise two-way by Annex D Table 26/27; cantilever option", "Verified", "Decision rule and identical results to the one-way and two-way routines checked in acceptance.js Q"],
  ["DXF", "DXF import for the roof truss (elevation: lines split at joints, chords traced or from TOP/BOTTOM/WEB layers) and the pile / raft foundations (column plan: rectangles, circles or points on COLUMN layers, marks from text)", "Verified", "Imported Pratt truss identical to the generated one; plan reading and load checks in acceptance.js R; UI tests"],
  ["Performance", "Solver and hardware: one factorisation of K shared by the analysis, rigidity centres and modal analysis; multi-vector back-substitution; cached CQC coefficients, shell stiffness and column capacities; background Web Workers sized to the CPU; WebGL viewer", "Verified", "Every engineering suite unchanged (acceptance, FE, pushover, verification); background results identical to the main thread in the UI test"],
  ["Design aids", "SP 16 style charts: rectangular and circular column P–M (Fe 415/500/550), slab coefficients (Tables 26, 27), flexure Mu/bd²–pt, τc, kt, kc, doubly reinforced sections, IS 800 fcd and LTB curves, IS 1893 spectrum, IS 875 k2; Ld tables", "Calculated", "Drawn from the engine's strain-compatibility routines; Pu = 0 point checked against a hand solution in acceptance.js O"],
  ["Analysis", "Line beam with chosen supports (fixed / pinned / roller / free / spring / guided), UDL + point loads", "Verified", "acceptance.js S1–S6: simply supported, propped cantilever (wL²/8, 9wL²/128 at 3L/8, 5wL/8, 3wL/8, contraflexure L/4), fixed–fixed, cantilever, stiff spring = prop, mechanism rejected"],
  ["Analysis", "Frame base condition fixed / pinned / soil springs (Kv = ks·A, Kθ = ks·I, IS 2950) and per-node supports", "Verified", "acceptance.js S18–S20: pinned bases carry no moment; stiff springs reproduce fixed bases; vertical equilibrium for every base"],
  ["RCC", "Beam by end conditions: cantilever, propped cantilever, fixed–fixed; curtailment cl 26.2.3, BMD/SFD, BBS", "Calculated", "acceptance.js S8–S11: simply supported case identical to the v3.10 beam; propped / cantilever moments vs closed form; deflection basic ratio of a propped cantilever taken as 20 (simply supported, conservative — IS 456 gives no value)"],
  ["RCC", "Cantilever slab with free-edge line load; stability cl 20.1; propped one-way slab", "Calculated", "acceptance.js S12–S13; the overturning check is reported for the designer to compare with the restoring moment of the wall / back-span"],
  ["RCC / Steel", "Effective length from end conditions — IS 456 Table 28, IS 800 Table 11; LTB length IS 800 Table 15", "Verified", "acceptance.js S7, S14–S16: same design as entering the effective length by hand"],
  ["Steel", "Roof truss bearings pinned + roller or pinned at both ends", "Calculated", "acceptance.js S17: equal and opposite thrusts under gravity; pinned–pinned solved with equal EA (approximation stated)"],
  ["RCC design", "Long-term deflection (IS 456 Annex C: shrinkage and creep) and vibration of floors", "Not implemented", "The span / depth rule of cl 23.2.1 is the code's deemed-to-satisfy check; calculate deflections for long spans, cantilevers over 10 m and brittle finishes"],
  ["Steel design", "Combined axial force and bending interaction (cl 9.3) — independent benchmark", "Calculated", "Implemented from the clauses; no published worked example compared yet"],
  ["Foundations", "Punching with unbalanced moment transfer (IS 456 cl 31.6.2.2) — mat foundation", "Verified", "acceptance.js T13–T14: interior and edge column polar moments and shear fractions equal the closed forms; pile caps and isolated footings check punching from the axial load"],
  ["Audit", "Design audit on every report: verification state, checks not covered, not-for-construction stamp", "Verified", "acceptance.js T19–T20; UI test; frame report stamped until all items are reviewed and the status is Checked or Issued"]
];
/* stable ids of REG.CHECKS rows, used by the verification mode */
REG.IDS = ["frame", "shell", "pdelta", "pushover", "modelchk", "spectrum", "statbase", "modal", "rsa", "torsion", "irreg", "mmc", "timehist",
  "rcbeam", "rccol", "rcslab", "rcwallel", "rcwall", "servic", "stfcd", "stltb", "stklen", "dtbeam", "dtcol", "scwb", "joint", "dtslab", "bbs",
  "foot", "footpress", "mat", "matsoil", "pilecap", "pilelat", "pilegrp", "foundmore", "wind", "wsmwall", "snow", "pattern", "llred", "cover", "boq", "auto", "inlim", "fixes", "units", "elements", "slabauto", "dxfmore", "perf", "aids", "beam1d", "framesup", "beamends", "cantslab", "efflen", "trussbear", "servlt", "stcomb", "punchmt", "audit"];
REG.byId = function (id) { var i = REG.IDS.indexOf(id); return i >= 0 ? { id: id, area: REG.CHECKS[i][0], t: REG.CHECKS[i][1], st: REG.CHECKS[i][2], ev: REG.CHECKS[i][3] } : null; };
REG.RANK = { "Not implemented": 0, Simplified: 1, Approximate: 1, Calculated: 2, Verified: 3 };
/* checks behind each kind of result; the weakest decides the result's verification state */
REG.KIND = { beam: ["frame", "rcbeam", "dtbeam", "servic"], column: ["frame", "rccol", "dtcol", "scwb", "joint"], slab: ["shell", "rcslab", "dtslab", "servic"],
  wall: ["shell", "rcwall", "rcwallel"], steel: ["frame", "stfcd", "stltb", "stcomb", "stklen"], footing: ["foot", "footpress", "foundmore"], mat: ["mat", "matsoil"], seismic: ["spectrum", "statbase", "modal", "rsa", "torsion", "irreg", "mmc"] };
REG.state = function (ids) { var w = null; ids.forEach(function (id) { var r = REG.byId(id); if (r && (!w || REG.RANK[r.st] < REG.RANK[w.st])) w = r; }); return w; };
REG.html = function (esc) {
  var col = { Verified: "okt", Calculated: "", Simplified: "warnt", "Not implemented": "not" };
  var h = '<h4>Standards register — engine ' + REG.ENGINE + '</h4><div class="tw"><table class="basis"><tr><th>Standard</th><th>Status</th><th>How it is used</th></tr>';
  REG.STANDARDS.forEach(function (s) { h += '<tr><td><b>' + esc(s[0]) + '</b><br><small>' + esc(s[1]) + '</small></td><td>' + esc(s[2]) + '</td><td>' + esc(s[3]) + '</td></tr>'; });
  h += '</table></div><h4>Verification status of each check</h4><div class="note">A PASS means the check that was made passed. <b>Verified</b>: agrees with an independent benchmark in the test suite · <b>Calculated</b>: implemented from the clauses, not independently benchmarked · <b>Simplified</b>: approximation stated · <b>Not implemented</b>: must be checked separately. Independent review by a qualified engineer is still required before construction.</div><div class="tw"><table class="basis"><tr><th>Area</th><th>Check</th><th>Status</th><th>Evidence / assumption</th></tr>';
  REG.CHECKS.forEach(function (c) { h += '<tr><td>' + esc(c[0]) + '</td><td>' + esc(c[1]) + '</td><td><span class="' + (col[c[2]] || "") + '">' + esc(c[2]) + '</span></td><td>' + esc(c[3]) + '</td></tr>'; });
  return h + '</table></div>';
};
if (typeof module !== "undefined") module.exports = REG;

/* design audit for the member design modules: which register checks stand behind each module, and the gaps the
   designer must cover (shown on every report and printed); a result is "for construction" only after a qualified
   engineer has checked it — the app never issues one by itself */
REG.MOD = { beam: ["beam1d", "beamends", "rcbeam", "servic"], slab: ["slabauto", "cantslab", "dtslab"], slab1: ["slabauto", "cantslab"], slab2: ["slabauto", "dtslab"], column: ["rccol", "efflen"],
  footing: ["foot", "footpress"], strip: ["foot", "footpress"], pile: ["pilecap", "pilelat", "pilegrp"], raft: ["mat", "matsoil"], stair: ["dtslab"], truss: ["frame", "stfcd", "trussbear", "wind"],
  purlin: ["stltb"], tension: [], comp: ["stfcd", "efflen"], sbeam: ["stltb", "efflen"], bolts: [], roof: ["wind", "snow"], seismic: ["statbase", "spectrum"] };
REG.GAPS = {
  beam: ["Long-term deflection is not calculated (IS 456 Annex C) — the span / effective depth rule of cl 23.2.1 is used, as the code allows", "Crack width uses the service moment taken as factored ÷ 1.5", "Loads are entered by the designer — confirm them against IS 875 and the layout"],
  slab: ["Crack width is not calculated — bar spacing limits of cl 26.3.3 control cracking", "Long-term deflection is not calculated — span / depth rule of cl 23.2.1 / 24.1"],
  column: ["Slenderness by the additional-moment method of cl 39.7 — no second-order frame analysis", "Loads and moments are entered by the designer"],
  footing: ["Settlement is not calculated (IS 8009) — confirm the safe bearing capacity and settlement from the soil report", "Soil pressure assumes a rigid footing in full contact"],
  strip: ["Settlement is not calculated (IS 8009)", "Soil pressure assumes a rigid footing"],
  pile: ["Pile capacity from the static formula must be confirmed by load tests (IS 2911 Part 4)", "Nq read approximately from IS 2911 Fig. 1"],
  raft: ["Consolidation settlement and piled-raft action are not modelled", "Winkler springs: settlements are indicative"],
  stair: ["Crack width and long-term deflection are not calculated"],
  slab1: ["Crack width is not calculated — bar spacing limits of cl 26.3.3 control cracking", "Long-term deflection is not calculated — span / depth rule of cl 23.2.1"],
  slab2: ["Crack width is not calculated — bar spacing limits of cl 26.3.3 control cracking", "Long-term deflection is not calculated — span / depth rule of cl 24.1"],
  truss: ["Connections other than the gusset check are not designed", "Wind pressure coefficients for the roof are taken from the generator inputs — confirm against IS 875-3 Tables 6, 7"],
  roof: ["Snow drift and unbalanced snow (IS 875-4) are not modelled"],
  seismic: ["Equivalent static method only — use dynamic analysis where IS 1893 cl 7.7.1 requires it"],
  tension: [], comp: [], sbeam: ["Web bearing and buckling under concentrated loads are not checked"], bolts: [], purlin: []
};
REG.audit = function (id) {
  var ids = REG.MOD[id] || [], rows = ids.map(REG.byId).filter(Boolean), w = REG.state(ids) || { st: "Calculated" }, gaps = (REG.GAPS[id] || []).slice();
  rows.forEach(function (r) { if (r.st === "Simplified" || r.st === "Not implemented" || r.st === "Approximate") gaps.push(r.t + " — " + r.st.toLowerCase() + (r.ev ? ": " + r.ev : "")); });
  return { st: w.st, rows: rows, gaps: gaps };
};
REG.auditHtml = function (id, esc) {
  var a = REG.audit(id), cls = { Verified: "v3", Calculated: "v2", Simplified: "v1", Approximate: "v1", "Not implemented": "v0" }[a.st] || "v2";
  return '<div class="audit"><div class="ah"><span class="vchip ' + cls + '">' + esc(a.st) + '</span><b>Design audit</b><small>' + (a.rows.length ? a.rows.length + ' engine check' + (a.rows.length > 1 ? 's' : '') + ' behind this result — the weakest decides the state' : 'calculated from the code equations') + '</small></div>' +
    (a.gaps.length ? '<div class="ag"><b>Not covered by this calculation — the designer must check:</b><ul>' + a.gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join("") + '</ul></div>' : '') +
    (a.rows.length ? '<details class="noprint"><summary>Evidence for each check</summary><div class="tw"><table><tr><th>Check</th><th>State</th><th>Evidence</th></tr>' + a.rows.map(function (r) { return '<tr><td>' + esc(r.t) + '</td><td>' + esc(r.st) + '</td><td>' + esc(r.ev) + '</td></tr>'; }).join("") + '</table></div></details>' : '') +
    '<div class="stamp">Calculation only — not for construction until checked and signed by a qualified structural engineer.</div></div>';
};
