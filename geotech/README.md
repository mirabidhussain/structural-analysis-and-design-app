# IS GeoTech

A companion app to **IS StructDesign** for soil and shallow foundations. Version 1.0 is phase 1 of the geotechnical plan.

## What it does

- **Site**:
  - boreholes with soil layers and the water table;
  - SPT readings with overburden and dilatancy corrections (IS 2131 practice);
  - a borehole log drawing.
  - Missing φ, cu, Dr or E can be estimated from SPT N. Estimated values are marked:
    - φ from the Peck–Hanson–Thornburn curve (IS 6403 Fig. 1);
    - Dr after Meyerhof;
    - cu after Stroud;
    - E after Bowles.
- **Lab tests**: sieve analysis and Atterberg limits give the IS 1498 soil symbol and a grading curve.
- **Footing** (square, rectangle, circle or strip):
  - Net safe bearing capacity to IS 6403:
    - shape factors;
    - depth factors, used only when the backfill is compacted;
    - inclination factors;
    - water table factor W′;
    - eccentricity, using B − 2e;
    - local, general or interpolated shear, depending on relative density;
    - undrained capacity for clay.
  - Settlement to IS 8009 Part 1:
    - immediate settlement by the Steinbrenner layered method, × 0.8 for a rigid footing;
    - consolidation from Cc, Cr, e0 and σ′p (or mv) in 0.5 m sublayers;
    - time to 50 % and 90 % from cv.
  - **Allowable bearing pressure**: the smaller of the shear value (qnu/FS) and the pressure that gives the IS 1904:2021 Table 1 settlement limit.
  - When the footing fails, the smallest width that works.
  - **Which part can fail**:
    - how deep the shear wedge reaches;
    - water table effects;
    - weak layers checked by 2:1 load spread (punching through);
    - clay layers loaded past σ′p;
    - each layer's share of the settlement.
- **Pressure bulb**:
  - Boussinesq contours over the soil layers, with a width slider and the option to include all footings;
  - stress-with-depth plot (σ′v0, Δσz, their sum, σ′p).
- **Plate load test** (IS 1888):
  - log–log break for the ultimate pressure;
  - scaling to the footing size (Terzaghi and Peck for sand, B ratio for clay);
  - safe bearing pressure.
- **Report**: print or save as PDF or HTML. Project files are `.isg.json`.

## Tests

```
node geotech/test/core_test.js   # IS 6403 Table 1, Fadum/Boussinesq, Steinbrenner, consolidation, IS 1498, plate test
python3 geotech/build.py && node geotech/test/ui_test.js
```

The Android app is `geotech-android/` (package `com.mirabid.isgeotech`). Releases are tagged `geotech-v<version>`.
