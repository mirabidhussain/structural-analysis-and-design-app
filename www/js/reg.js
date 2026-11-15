/* Standards register and verification status of every engineering check.
   Status: Verified = agrees with an independent benchmark in test/*.js; Calculated = implemented from the code clauses, checked
   for internal consistency but not against an independent benchmark; Simplified = stated approximation; Not implemented. */
var REG = {};
REG.ENGINE = "3.1";
REG.STANDARDS = [
  ["IS 456:2000", "Plain and reinforced concrete — code of practice (Fourth Revision), with amendments", "In use", "Limit state and working stress (Annex B) design, detailing rules"],
  ["IS 13920:2016", "Ductile design and detailing of RC structures subjected to seismic forces (First Revision)", "In use", "Applied in zones III–V: beams cl 6, columns cl 7–8, joints cl 9, walls cl 10"],
  ["IS 1893 (Part 1):2016", "Criteria for earthquake resistant design of structures (Sixth Revision), with Amendments 1 and 2", "In use (reinstated)", "IS 1893 (Part 1):2025 and (Part 5):2025 were published in Nov 2025 and withdrawn by BIS gazette notification of 3 March 2026; the 2016 edition is the applicable standard. Torsional irregularity reported to both the 2016 text and Amendment 2."],
  ["IS 800:2007", "General construction in steel (Third Revision)", "In use", "Limit state design of members; working stress cl 11"],
  ["IS 875 (Part 1)", "Dead loads — unit weights", "1987 values used; 2026 revision published", "Only concrete 25 kN/m³ is built in — finishes and wall loads are user inputs. Unit weights not yet reviewed against IS 875 (Part 1):2026."],
  ["IS 875 (Part 2):1987", "Imposed loads", "In use", "Imposed loads are user inputs; pattern loading (IS 456 cl 22.4.1) and reduction for floors carried (cl 3.2.1, footings) are options; seismic weight per IS 1893 Table 10"],
  ["IS 875 (Part 3):2015", "Wind loads", "In use", "Vz = Vb·k1·k2·k3·k4, pressure on the building frontal area (no building pressure-coefficient workflow)"],
  ["IS 875 (Part 4):2021", "Snow loads (Third Revision)", "In use", "Roof snow s = μ·s0 (flat roof μ = 0.8), designed for the more severe of snow and roof imposed load (cl 1); drift, unbalanced and the exposure/thermal effects are not modelled — enter an adjusted s0 where they matter"],
  ["IS 1200", "Method of measurement of building and civil engineering works", "In use", "Measurement rules of the bill of quantities"],
  ["JKSOR 2022", "Jammu & Kashmir Schedule of Rates 2022 (PW(R&B) Department)", "In use", "Default BOQ rates (exclusive of GST); project rates override them; apply the cost index / premium of your work"],
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
  ["Seismic", "Equivalent static base shear and storey distribution (cl 7.6, 7.7)", "Calculated", "Ah = (Z/2)(Sa/g)/(R/I), Qi ∝ Wi·hi² — formula sheet in Excel"],
  ["Seismic", "Modal analysis (subspace iteration)", "Verified", "2-storey shear frame vs exact eigen-solution; mass participation sums to 100 %"],
  ["Seismic", "Response spectrum, CQC/SRSS, scaling (cl 7.7.3)", "Verified", "Single storey Vb = Ak·W, displacement Ak·g/ω², CQC ρ closed form"],
  ["Seismic", "Accidental torsion, CM / CR (cl 7.8.2)", "Verified", "Symmetric plan CR = CM, CR shift towards walls, torque = Qi·(0.5esi + 0.05bi)"],
  ["Seismic", "Irregularities (Table 5, 6), storey drift (cl 7.11)", "Calculated", "Soft storey / mass flags tested on constructed cases; drift at stacked nodes"],
  ["Seismic", "Missing-mass correction, time-history analysis", "Not implemented", ""],
  ["RCC design", "Beam flexure, shear, torsion (IS 456 cl 38, 40, 41)", "Verified", "Mu,lim (SP 16 Table C), τc (Table 19), τc,max (Table 20) and expected pass/fail designs in acceptance.js A, B"],
  ["RCC design", "Column biaxial (strain compatibility + Bresler cl 39.6)", "Calculated", "Spot check at P = 0 against 0.87fy·Ast·(d − d′) (verify.js), expected pass/fail cases, bars-provided re-check"],
  ["RCC design", "Slab elements (Wood–Armer)", "Calculated", "Plate moments verified; Wood–Armer per Wood (1968) formulae"],
  ["RCC design", "Wall elements: σc ≤ 0.4fck and in-plane shear per element", "Simplified", "Kept as an element screen; walls are designed as piers below"],
  ["RCC design", "Shear walls as piers: P–M strain compatibility, shear, boundary elements (IS 13920 cl 10)", "Verified", "Section forces equal base reactions (equilibrium); P–M vs independent fibre computation; boundary-element trigger"],
  ["RCC design", "Deflection (span/depth) and crack width of frame beams and slabs", "Not implemented", "Use the standalone beam / slab modules for l/d checks"],
  ["Steel design", "Compression fcd (cl 7.1.2, Table 9) and high-shear moment reduction (cl 9.2.2)", "Verified", "Table 9 values and a hand calculation of Mdv in verify.js / acceptance.js"],
  ["Steel design", "LTB (cl 8.2.2) and combined forces cl 9.3.1.1, 9.3.2.2 with Cm (Table 18)", "Calculated", "Implemented from the clauses; no independent benchmark yet"],
  ["Steel design", "Effective length of frame columns", "Simplified", "Uniform K (input) instead of Annex D charts"],
  ["Detailing", "Beam bars, curtailment, anchorage, laps, hoops (IS 13920 cl 6)", "Verified", "acceptance.js F: provided ≥ required at every station, 2d hoop spacing, laps outside 2d, capacity shear"],
  ["Detailing", "Columns: confinement lo, s, Ash, legs, laps (cl 7, 8)", "Verified", "acceptance.js F: hand formulas for lo, s, Ash"],
  ["Detailing", "Strong column – weak beam (cl 7.2.1)", "Verified", "ΣMc and ΣMb recomputed independently in acceptance.js F"],
  ["Detailing", "Beam–column joint shear (cl 9)", "Verified", "Vj and capacity recomputed independently in acceptance.js F"],
  ["Detailing", "Slab panels (IS 456 Annex D, SP 34)", "Calculated", "Steel ≥ required of every element; top bars over panel edges from the panel maximum"],
  ["Detailing", "Bar bending schedule (IS 2502)", "Verified", "Cutting lengths and weights vs hand values; Excel formulas recalculate to the app values"],
  ["Foundations", "Isolated footings: pressure, shear, punching, bearing (IS 456 cl 34)", "Verified", "Pressures recomputed from reactions in acceptance.js F"],
  ["Foundations", "Footing soil pressure distribution", "Simplified", "Rigid footing, full contact (no partial-uplift redistribution), +10 % self weight"],
  ["Foundations", "Combined footings, rafts, piles, settlement, soil–structure interaction", "Not implemented", "Overlapping isolated footings are flagged"],
  ["Loads", "Wind on buildings (IS 875-3): pressure coefficients, internal pressure, torsion cases", "Simplified", "Frontal-area pressure with a single force coefficient"],
  ["Loads", "Working stress projects: walls designed by limit state with 1.5 × service forces", "Simplified", "Stated in the wall results"],
  ["Loads", "Snow on roofs (IS 875 Pt 4): s = μ·s0, the larger of snow and roof imposed load", "Simplified", "Uniform balanced snow only — no drift at parapets or steps; s0 is a user input (acceptance.js I)"],
  ["Loads", "Pattern imposed load — checkerboard alternate bays (IS 456 cl 22.4.1)", "Calculated", "The two patterns add up to the full imposed load (acceptance.js I); envelope with the full-load combination"],
  ["Loads", "Imposed-load reduction for floors carried (IS 875 Pt 2 cl 3.2.1)", "Calculated", "Table values checked in acceptance.js I; applied to footing sizing and design only, not to columns"],
  ["Detailing", "Nominal cover for exposure and fire (IS 456 Table 16, 16A, Fig. 1) and minimum grade (Table 5)", "Verified", "Table values and the effective depths that use them checked in acceptance.js I"],
  ["Quantities", "Bill of quantities of the whole building (IS 1200 style) priced with JKSOR 2022", "Calculated", "Concrete, masonry, plaster, floor and excavation quantities checked by hand in acceptance.js H; every default rate is traced to its JKSOR 2022 item"],
  ["Automation", "Automatic design (storey-wise enlargement until all checks pass)", "Calculated", "Converges on the test building in acceptance.js H; sizes are written as editable section rules"]
];
/* stable ids of REG.CHECKS rows, used by the verification mode */
REG.IDS = ["frame", "shell", "pdelta", "pushover", "modelchk", "spectrum", "statbase", "modal", "rsa", "torsion", "irreg", "timehist",
  "rcbeam", "rccol", "rcslab", "rcwallel", "rcwall", "servic", "stfcd", "stltb", "stklen", "dtbeam", "dtcol", "scwb", "joint", "dtslab", "bbs",
  "foot", "footpress", "foundmore", "wind", "wsmwall", "snow", "pattern", "llred", "cover", "boq", "auto"];
REG.byId = function (id) { var i = REG.IDS.indexOf(id); return i >= 0 ? { id: id, area: REG.CHECKS[i][0], t: REG.CHECKS[i][1], st: REG.CHECKS[i][2], ev: REG.CHECKS[i][3] } : null; };
REG.RANK = { "Not implemented": 0, Simplified: 1, Calculated: 2, Verified: 3 };
/* checks behind each kind of result; the weakest decides the result's verification state */
REG.KIND = { beam: ["frame", "rcbeam", "dtbeam", "servic"], column: ["frame", "rccol", "dtcol", "scwb", "joint"], slab: ["shell", "rcslab", "dtslab", "servic"],
  wall: ["shell", "rcwall", "rcwallel"], steel: ["frame", "stfcd", "stltb", "stklen"], footing: ["foot", "footpress", "foundmore"], seismic: ["spectrum", "statbase", "modal", "rsa", "torsion", "irreg"] };
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
