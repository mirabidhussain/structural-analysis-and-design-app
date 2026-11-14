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

## Limits
No response-spectrum or time-history dynamics, IS 13920 ductile detailing (notes only), raft/pile/combined footings, retaining walls, plate girders or base plates.
Section properties are rounded SP 6(1) values. All designs must be checked by a qualified structural engineer.
