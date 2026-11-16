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
- **BOQ and reinforcement schedules** — see v3.1 below; column, beam, wall, slab and footing schedules. In the app, the report, Excel (rates and percentages as inputs, amounts and abstract as formulas) and DXF.
- **CAD** — drawing set DXF: GA plan of every floor with grids, column / beam / wall / slab marks, foundation layout, schedules, all reinforcement details, title blocks. **STAAD.Pro input** of the same model for an independent cross-check.
- **Engineering assistant** — findings with clause references and quantified fixes (e.g. the missing column capacity at a joint), member lookup and code notes offline; in the web app it can also ask Claude, which reads the results through the app.

## Loads, durability and estimate (v3.1)
- **Snow (IS 875 Part 4:2021)** — roof snow s = μ·s0 (μ = 0.8 flat roofs); the roof is designed for the larger of snow and roof imposed load; an optional share of snow goes into the seismic weight. Drift and unbalanced snow are not modelled.
- **Pattern imposed load (IS 456 cl 22.4.1)** — checkerboard cases LP1/LP2 (alternate spans in 2D frames) added to the combinations automatically when LL > ¾ DL, or always/never by choice.
- **Imposed-load reduction (IS 875 Part 2 cl 3.2.1)** — optional reduction for the number of floors carried (0/10/20/30/40/50 %), applied to footing sizing and design.
- **Exposure and fire** — nominal covers from IS 456 Table 16 (mild 20 … extreme 75) and Table 16A for 0.5–4 h fire; effective depths of beams, slabs, columns and footings follow; minimum grade (Table 5) and minimum member sizes for the fire rating (Fig. 1) are checked and reported as failures.
- **Whole-building BOQ priced with JKSOR 2022** — excavation (with extra lift), PCC, RCC by element and grade (M20 nominal; M25 design mix + extras for M30/M35/M40), formwork incl. extra height, reinforcement + wastage, structural steel, backfill, plinth filling, ground-floor base, DPC, plinth and superstructure masonry (under every beam line, less openings, + parapet), internal/external/ceiling plaster, vitrified flooring, anti-termite. Every default rate is the Jammu & Kashmir Schedule of Rates 2022 item (exclusive of GST), shown with its item number; your own rates override them. The abstract adds contingencies, labour welfare cess and GST (18 % by default). Doors, windows, roofing, painting, services and external works are not included.

## Missing-mass correction (v3.4) — IS 1893 cl 7.7.5.2
- On by default (panel 4). Only modes below 33 Hz are combined (CQC/SRSS); the seismic mass not carried by them — truncated modes and rigid modes above 33 Hz — is loaded statically with the zero-period acceleration A0 = (Z/2)(Sa/g at T = 0)/(R/I), and that residual response is added by SRSS to every quantity (base shear, displacements, drifts, member and shell forces, reactions, wall and mat envelopes) before scaling to the static base shear (cl 7.7.3).
- Results, report and Excel show the modal and missing-mass base shears; Excel recomputes the missing mass, A0, Vr and the total with formulas. The 90 % participation warning still applies to the extracted modes.
- Tests: a rigid frame reproduces the static ZPA solution exactly, residual shear = missing mass × A0·g = Σ residual reactions, with a complete mode set the correction replaces exactly the modes above 33 Hz.

## Look and use (v3.3)
- New interface: Inter typeface (bundled, works offline), drawn icon set for every module, illustrated home screen with search and category filters, bottom tab bar (Home, Analysis, Projects, Report, About), light / dark theme switch, units shown inside the input fields, toggle switches, step-numbered analysis panels, sticky Calculate button, jump chips across long results, new app icon.
- **Detailed estimate** as an option to the BOQ (switch in the results or *Estimate format* in panel 5): measurement sheet with No. × L × B × D/H lines for every JKSOR item (members grouped by size and storey, deductions for openings, footings, PCC and necks as negative lines, wastage as a percentage line), item totals, then the abstract of cost with contingencies, labour cess and GST. Excel gets a *Detailed Estimate* sheet whose every quantity is a formula; the BOQ quantities link to its totals. The calculation report prints the chosen format.

## Mat (raft) foundation (v3.2) — IS 2950 (Part 1), IS 456, IS 1904
- **When:** Foundation type *Mat*, or *Auto* — a raft replaces the isolated footings when they would overlap or cover more than half of the plan.
- **Analysis:** flexible-plate method — the mat is meshed through every column and wall base into thick-plate (Mindlin) shell elements on **compression-only Winkler springs** (ks from the soil report, else 120 × SBC after Bowles); loaded by the base reactions of every load case, combination and response-spectrum envelope; springs that lift off are released and the plate re-solved. Net pressures (backfill over the mat balances the excavated soil). The **rigid method** (P/A ± M·y/I) and the IS 2950 rigidity criterion (spacing vs 1.75/λ) are reported alongside.
- **Checks:** net soil pressure (with the seismic increase), contact / lift-off, settlement and angular distortion (IS 1904 limits, editable — spring settlements are indicative), **punching at d/2 for every column** (perimeter clipped at the mat edges), **one-way shear on column strips** at d from the faces (τc from the steel provided, raised with extra bars before thickening), Wood–Armer flexure, sliding and overturning (IS 456 cl 20). Thickness: entered, or the smallest (50 mm steps) that passes punching, shear and flexure.
- **Reinforcement:** top and bottom base mesh (≥ 0.12 %, spacing ≤ min(3d, 300), covering 75 % of the area) bent at the edges, plus zones of extra bars between the mesh bars where needed (marks EB / ET), laps for 12 m stock, side-face bars when t > 750 mm. Plan and section drawings, pressure and steel colour maps, bar bending schedule, mat schedule, BOQ (raft concrete, edge formwork, PCC, excavation with extra lift, necks, backfill), Excel sheet with live formulas, report section, DXF sheet.
- **Not covered:** combined footings, piled rafts, moment transfer in punching (IS 456 cl 31.6.2.2 — check large edge-column moments by hand), consolidation settlement (IS 8009), chairs.

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
  - detailed estimate: item totals = Σ lines, every line = No. × L × B × D/H, percentage deductions, negative backfill deductions, BBS lines + wastage, Excel sheet order and links;
  - mat foundation: Hertz point load on a plate on springs and Hetényi's beam on an elastic foundation (< 1 %), a stiff mat equal to the rigid method, lift-off with equilibrium, Auto switching, plan size, punching / one-way shear / Annex G steel recomputed, minimum mesh, BOQ, Excel / report / drawings;
  - loads and estimate: snow vs roof imposed load, pattern cases summing to the full load (also in 2D), larger sagging moments with patterns, imposed-load reduction on footings, IS 456 Table 16/16A covers and the effective depths they give, durability and fire failures, masonry/plaster/flooring/excavation quantities by hand, JKSOR item numbers and rates, abstract with contingencies, cess and GST;
  - platform: BOQ volumes by hand, automatic design convergence, project round trips and backups, verification states, report sections, DXF drawing set, STAAD file contents, assistant findings;
  - walls and joints: wall P–M against an independent stress-block computation, squash load, wall + column shears = base reaction, shear steel, boundary-element trigger, joint shear and capacity recomputed.
- `test/xlsx_ci.js` + `test/xlsx_check.py` — workbooks written without cached values; LibreOffice computes every formula (≈ 70 000) and the results must equal the app's values with no Excel errors (CI job).
- `test/ui_ci.js` — browser test (Playwright): every module with blank inputs, frame analysis, Excel download, WSM switch, no JavaScript errors.
- `test/smoke.js` — prints sample design reports (diagnostic).

## Limits
No time-history analysis; floors are not modelled as rigid diaphragms (slab shells give in-plane stiffness), IS 13920 ductile detailing (notes only), pile/combined footings, retaining walls, plate girders or base plates.
Section properties are rounded SP 6(1) values. All designs must be checked by a qualified structural engineer.
