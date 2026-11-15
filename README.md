# IS StructDesign

Offline Android app for structural design to Indian Standards (limit state method).

| Area | Modules | Code |
|---|---|---|
| RCC | Beam, one-way slab, two-way slab (Table 26/27), column (strain compatibility + Bresler biaxial, slender), isolated footing, strip/wall footing, staircase | IS 456:2000 |
| Steel | Roof truss (Pratt/Howe/Fink geometry, stiffness analysis, 13 load combinations, member sizing), purlin, tension member, compression member, ISMB beam with LTB, bolts & welds | IS 800:2007 |
| Loads | Roof DL/LL/snow/wind, seismic base shear & storey forces | IS 875 Pt 1-4, IS 1893:2016 |

Every result lists the clause used and a PASS/FAIL for each check. Reports can be printed / saved as PDF and shared.

## Frame & FE analysis (v2)
Home → **Frame & FE analysis**.
- **Stiffness matrix (displacement) method** for 2D/3D frames: 6 DOF/node Euler–Bernoulli elements, end releases, member UDLs, pinned braces, RCM renumbering + skyline LDLᵀ solver.
- **FEA for slabs, plates and walls**: 4-node flat shell = QM6 incompatible-mode membrane + MITC4 Mindlin plate + drilling stiffness. Slab design by Wood–Armer moments; wall membrane stress checks.
- **Linear static**: DL, LL, IS 1893 equivalent static EQ (X/Y), IS 875-3 wind, IS 456/875-5 combinations; optional **P-Delta** (iterated geometric stiffness). Storey drift check.
- **Nonlinear static (pushover)**: event-to-event plastic hinges with P–M interaction (RCC strain compatibility, steel IS 800 cl 9.3), brace yield/buckling, P-Delta at every event; capacity curve, hinge sequence, IO/LS/CP states.
- **DXF input**: LINE, LWPOLYLINE, POLYLINE, 3DFACE, SOLID, POINT; layer → role mapping, section sizes in layer names, auto meshing, node merging, member splitting; 2D elevation or 3D. DXF export; Android "Open with" for .dxf.
- **Design**: IS 456 beams (flexure incl. doubly reinforced, shear, torsion), columns (biaxial Bresler, slenderness), IS 800 members (buckling, LTB, interaction).
- Verification: `node test/fem_verify.js` (16 closed-form checks: cantilever, fixed beam, portal sway, P-Delta amplification, SS & clamped plates, shear wall, truss), `node test/po_verify.js` (plastic collapse loads), `node test/model_test.js` (equilibrium, DXF round-trip).

## Excel output (v2.1)
- **Frame & FE analysis → "Excel: full analysis & design"** writes one .xlsx workbook, offline. It contains: Summary (live fail counts), Inputs (named cells p_fck, p_fy, p_Zz …), Nodes, Members (L, A, I as formulas), Shells, Loads (IS 1893 Ta, Sa/g, Ah, Vb and the storey distribution Qi as formulas; IS 875-3 wind as formulas), Combinations (load factors), Disp_Cases / Disp_Combos and Forces_Cases / Forces_Combos (combinations = SUMPRODUCT of factors × case results), Reactions (with an equilibrium check), Drift, Beam / Column / Steel / Slab / Wall Design (IS 456 / IS 800 equations as live formulas), Pushover (capacity curve chart, hinge sequence, ductility) and Method & Formulas.
- Every design module (beam, column, footing, truss …) also has an **Excel (.xlsx)** button that exports its step-by-step calculation.
- Checked in LibreOffice: 0 formula errors in 145,000+ formulas, and the recalculated values match the app.

## Design method (v2.4)
- **Limit state method** (default — used when nothing is selected) or **working stress method** (IS 456 Annex B, IS 800 Section 11).
- Frame & FE analysis: WSM uses unfactored combinations DL+LL, DL+LL±EL/WL, DL±EL/WL with permissible stresses +33⅓ % for EL/WL; beams (Mbal, Ast = M/σst·j·d, 1.5m compression steel, Table 23/24 shear), columns (B-4.2 uncracked transformed section, Cr for long columns), slabs/walls, steel (fac, fat, fbc, fv, cl 11.5 combined). Worked calculations, design basis and Excel sheets switch to WSM automatically.
- Modules with the method option: RCC beam, one-way slab, two-way slab, column. Enter working (service) loads for WSM.

## Get the APK
- **Download:** Releases → **latest-apk** → `IS-StructDesign.apk` (rebuilt automatically by GitHub Actions on every push to `main`). On the phone allow "Install unknown apps" for your browser/files app.
- **Web version:** GitHub Pages (Settings → Pages → Source: *GitHub Actions*) serves the app at `https://mirabidhussain.github.io/structural-analysis-and-design-app/` — installable as a PWA and works offline. `standalone.html` is the single-file version.
- **Build locally:** open `android/` in Android Studio → Build → Build APK(s).

## Project layout
- `www/` - the app (HTML/JS). `js/rcc.js`, `js/steel.js`, `js/truss.js`, `js/loads.js` hold the calculations; `js/data.js` holds code tables and section properties.
- `android/` - native wrapper (WebView). It packages `www/` as assets, adds Print/Save PDF and Share.
- `dist/index.html` - single-file version (open in any browser).
- `test/` - Node tests: `node test/verify.js` (20 checks against code tables and statics), `node test/smoke.js`.

## Earthquake analysis (v2.7) — IS 1893 (Part 1):2016
- **Modal analysis:** lumped masses from the seismic weight, subspace iteration on the factored stiffness; periods, frequencies, mass participation in X, Y and torsion, mode type; mode shapes in the 3D viewer.
- **Response spectrum (cl 7.7):** Ak = (Z/2)(Sa/g)/(R/I) per mode, CQC (5 % damping) or SRSS, scaling to the static base shear (forces; displacements per Amendment 2 cl 7.7.3.2 unless chosen), optional 100 % + 30 % orthogonal effects, ≥ 90 % mass-participation check. RS combinations (1.2(DL+LL±RS), 1.5(DL±RS), 0.9DL±1.5RS, or the WSM set) go into member design.
- **Accidental torsion (cl 7.8.2):** centre of mass and centre of rigidity of every floor; extra torques giving design eccentricities 1.5esi + 0.05bi and esi − 0.05bi, combined with EQX/EQY.
- **Irregularity indicators:** torsional (Table 5 (i), both the 2016 text and Amendment 2 thresholds), soft storey and mass irregularity (Table 6, 2016 definitions), first-two-modes-translational check.
- **Excel:** a Seismic sheet with live formulas for Sa/g, Ak, modal base shears, scale factor, eccentricities, torques and irregularity ratios.

## Professional platform (v3.0)
- **Projects** — an offline project database (IndexedDB on the device): name, job no., client, site, engineers, status (Concept → Design → For check → Checked → Issued), notes, inputs, imported DXF, rates, reviewer sign-offs, activity log. Create, open, copy, delete, search; **issue revisions** that freeze inputs, results summary, engine and code editions; export a project (`.isdp`), back up and restore everything.
- **Automatic design & detailing** — one button runs analysis → design → detailing repeatedly and enlarges the columns and beams of the storeys that fail (design, steel > 4 %, strong column–weak beam, joint shear, joint depth, drift) by 50 mm until every check passes; the sizes are written as editable section rules.
- **Engineering verification mode** — every result carries the weakest verification state of the checks behind it (Verified / Calculated / Simplified / Not implemented); a design summary with utilisation; a checking engineer's list (every non-benchmarked, simplified or missing check and every failure) to accept, query or mark N/A with name and date. A result becomes a *verified engineering result* only when it passes and every item is closed.
- **Calculation report** — print / PDF / HTML: cover, codes register, design basis (entered vs default), assumptions register, model, loads with equilibrium sums, modal / RSA / drift / irregularity, design summary, step-by-step traces of the governing members (or all), detailing and ductility checks, schedules, BOQ, verification status, signatures, revisions, limitations.
- **BOQ and reinforcement schedules** — IS 1200 style quantities from the model (excavation, PCC, RCC by element, formwork, reinforcement, structural steel, backfill), your rates, amounts; column, beam, wall, slab and footing schedules. In the app, the report, Excel (rates as inputs, amounts as formulas) and DXF.
- **CAD** — drawing set DXF: GA plan of every floor with grids, column / beam / wall / slab marks, foundation layout, schedules, all reinforcement details, title blocks. **STAAD.Pro input** of the same model for an independent cross-check.
- **Engineering assistant** — findings with clause references and quantified fixes (e.g. the missing column capacity at a joint), member lookup and code notes offline; in the web app it can also ask Claude, which reads the results through the app.

## Codes in use (v2.9)
IS 456:2000, IS 13920:2016, IS 1893 (Part 1):2016 with Amendments 1–2, IS 800:2007, IS 875 Parts 2, 3, 5 (Part 1 unit weights: only concrete 25 kN/m³ is built in; the 2026 revision has not yet been reviewed), SP 16, SP 34, IS 2502. IS 1893 (Part 1):2025 and (Part 5):2025 were published in November 2025 and withdrawn by BIS on 3 March 2026, so the 2016 edition applies. The app and the Excel workbook carry a **standards register** and a **verification status** for every check (Verified / Calculated / Simplified / Not implemented).

## Shear walls and joints (v2.9)
- **Shear walls** are designed as piers storey by storey (IS 13920 cl 10): section forces at every floor from the wall elements (nodal forces K·u; response-spectrum combinations by modal combination), flexure with axial load by strain compatibility with uniformly distributed vertical steel, shear (cl 10.2), minimum steel and spacing, two curtains, boundary elements where Pu/A + 6Mu/(tLw²) > 0.2fck (end columns checked as boundary elements), bar schedule and drawings.
- **Beam–column joints** (IS 13920 cl 9): Vj = 1.25fy(Ast,top + Ast,bot) − Vcol against 1.5/1.2/1.0·√fck·Aej by confinement, column depth ≥ 20 × beam bar φ.

## Reinforcement detailing & bar bending schedule (v2.8)
After the frame & FE design the app details every RCC member and groups identical ones:
- **Beam lines** (collinear beam elements chained between columns): continuous and extra top/bottom bars with curtailment (theoretical cut-off + max(d, 12φ), ≥ Ld, ≥ Lc/4), anchorage in end columns (Ld + 10φ with 90° bend in ductile frames), laps for 12 m stock bars outside joints and 2d of the faces, hoops with 135° hooks: 2d end zones at ≤ min(d/4, 6φ, 100) and capacity-design shear 1.2(DL+LL) + 1.4(Mu,h + Mu,s)/Lc (IS 13920 cl 6).
- **Column stacks:** bar arrangement with a bar at every hoop/crosstie leg (legs ≤ 300 mm apart), confining zones lo = max(D, Lc/6, 450) at ≤ min(B/4, 6φ, 100), Ash check, capacity shear, laps in the central half, starters into the footing, top anchorage (IS 13920 cl 7, 8).
- **Strong column – weak beam** at every joint: ΣMc ≥ 1.4 ΣMb with the bars provided (cl 7.2.1).
- **Slab panels:** bottom bars both ways, top bars 0.3L each side of continuous edges and 0.1L with a bend at discontinuous edges, distribution bars, corner torsion steel (IS 456 Annex D).
- **Isolated footings** at the supports: plan size from service reactions (DL+LL ≤ SBC; DL+LL±EQ ≤ SBC × 1.5 / 1.25 / 1.0 for soil I/II/III, IS 1893 Table 1), depth from bending, one-way and punching shear, bearing, bar mesh and anchorage (IS 456 cl 34). Overlapping footings are flagged.
- **Drawings** (elevations and sections) on screen and as a DXF (layers CONCRETE, REBAR, LINKS, DIMS, TEXT, GRID); **bar bending schedule** per IS 2502 / SP 34 with steel totals by diameter.
- **Excel:** BBS sheet (cutting length, total length and weight as live formulas, SUMIFS summary by diameter), Detailing Checks sheet (every rule with clause, SCWB ratio formula), Footings sheet (pressure formulas, editable sizes and SBC).

## Verification & testing (v2.6)
Run `npm test` (Node 18+) or let GitHub Actions run it on every push:
- `test/fem_verify.js` — 16 closed-form checks (cantilever, fixed beam, portal sway, P-Delta amplification, SS & clamped plates, shear wall, truss).
- `test/po_verify.js` — plastic collapse loads (portal 4Mp/h, propped cantilever 6Mp/L), P–M hinges, P-Delta equilibrium.
- `test/model_test.js` — equilibrium of a 3D building, DXF import/export round trip.
- `test/verify.js` — design-module checks against hand calculations.
- `test/acceptance.js` — 141 acceptance and independent-benchmark checks:
  - design modules with **expected pass**, **expected fail** (e.g. 150 mm stair waist fails deflection, 3 bolts for 150 kN fails) and boundary cases;
  - IS code reference values: SP 16 Mu,lim factors 0.138/0.133/0.149, IS 456 Tables 19–22, IS 800 Table 9(c) fcd 107 & 183 N/mm², IS 1893 Sa/g, IS 800 cl 9.2.2 high-shear reduction by hand calculation;
  - FE benchmarks: MacNeal–Harder membrane patch test with distorted elements (exact), continuous beams wL²/8 and 0.1wL² (three-moment equation), torsion TL/GJ, Cook's skewed membrane convergence, SS plate mesh convergence;
  - solver safety: P-Delta above the buckling load rejected, convergence iterations/residual reported, floating parts and zero-area shells rejected before solving;
  - storey drift at vertically stacked nodes and the Δmax/Δave torsion indicator;
  - seismic: 2-storey shear-frame periods vs the exact eigen-solution, single-storey RSA base shear = Ak·W and displacement Ak·g/ω², CQC correlation, scaling rules, CR = CM for a symmetric plan and CR shift towards one-sided walls, accidental-torsion torque, soft-storey and mass-irregularity detection;
  - detailing: hand-checked cutting lengths, unit weights, Ld and laps, provided ≥ required steel along beams and in columns, IS 13920 beam and column rules, capacity shear, Ash, SCWB sums, lap positions and hoops over laps, footing pressures and shear, slab panel steel, totals, DXF round trip;
  - platform: BOQ volumes by hand, automatic design convergence, project round trips and backups, verification states, report sections, DXF drawing set, STAAD file contents, assistant findings;
  - walls and joints: wall P–M against an independent stress-block computation, squash load, wall + column shears = base reaction, shear steel, boundary-element trigger, joint shear and capacity recomputed.
- `test/xlsx_ci.js` + `test/xlsx_check.py` — workbooks written without cached values; LibreOffice computes every formula (≈ 70 000) and the results must equal the app's values with no Excel errors (CI job).
- `test/ui_ci.js` — browser test (Playwright): every module with blank inputs, frame analysis, Excel download, WSM switch, no JavaScript errors.
- `test/smoke.js` — prints sample design reports (diagnostic).

## Limits
No time-history analysis or missing-mass correction; floors are not modelled as rigid diaphragms (slab shells give in-plane stiffness), IS 13920 ductile detailing (notes only), raft/pile/combined footings, retaining walls, plate girders or base plates.
Section properties are rounded SP 6(1) values. All designs must be checked by a qualified structural engineer.
