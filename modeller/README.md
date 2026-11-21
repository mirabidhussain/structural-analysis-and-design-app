# IS StructModeller

A companion app to **IS StructDesign**. You model a building on grids and storeys, then export it as DXF.

## What it does

- **Setup**: set the grid spacings (for example `4, 2*4.5, 4`), the storey heights and names, the concrete and steel grades, and the default member sizes. *Generate full frame* puts a column at every grid point and a beam on every grid line, with a slab in every bay, on every storey.
- **Plan**: shows one storey at a time. Tools:
  - Column: tap a grid point.
  - Beam: tap point to point. Beams chain on, and *Finish* stops the chain.
  - Slab: tap inside a bay.
  - Wall and brace: tap the two ends.
  - Select and Delete.
  - Points snap to grid intersections, member ends and grid lines, otherwise to a 50 mm step.
  - Bulk actions: add all columns, beams or slabs on this storey; copy the storey to others; clear it.
  - Select a member to change its size. *Apply to all alike* resizes every member of the same size on that storey.
- **3D**: drag to rotate, pinch to zoom. Slabs and walls can be switched off.
- **Checks**: finds connectivity problems and lists them:
  - beam ends with no support;
  - columns standing on nothing, or floating on a beam;
  - slab edges with no beam or wall;
  - slabs that look thin;
  - members below the IS 13920 minimum sizes;
  - duplicates.
- **Quantities**: concrete volume by element, floor area, and an indicative steel quantity.
- **Export**:
  - **Analysis DXF (3D)**: for IS StructDesign.
  - **Framing plans DXF (2D)**: one sheet per floor, with grids, dimensions, member marks and a column schedule.
  - Project file (`.ism.json`). The model is also kept on the device.

## Importing into IS StructDesign

In IS StructDesign, go to **Frame & FE analysis → Model source → Import DXF drawing** and choose the `_model.dxf` file. Member sizes travel in the layer names:

| Layer | Entity | Meaning |
|---|---|---|
| `COL_<b>x<D>` | LINE | Column. D is along X. |
| `BEAM_<b>x<D>` | LINE | Beam |
| `BRACE_<section>` | LINE | Steel brace |
| `SLAB_<t>` | 3DFACE | Slab, thickness in mm |
| `WALL_<t>` | 3DFACE | Wall, thickness in mm |
| `SUPPORT_FIXED` / `SUPPORT_PIN` | POINT | Base supports |

Units are metres (`$INSUNITS 6`). Storey levels start at the plinth level set in the project.

## Build and test

```
python3 modeller/build.py          # single-file dist-modeller/index.html
node modeller/test/core_test.js    # engine + DXF read back by IS StructDesign's importer, analysed
node modeller/test/ui_test.js      # browser test (Playwright)
```

The Android app is in `modeller-android/` (package `com.mirabid.ismodeller`). It installs alongside IS StructDesign. CI publishes each version as the release `modeller-v<version>`, with the APK and the offline HTML.
