"""Render the offline design aids (SP 16 style charts) from tools/aids_data.js output.
   node tools/aids_data.js > /tmp/aids.json && python3 tools/make_aids.py /tmp/aids.json"""
import json, sys, pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

root = pathlib.Path(__file__).resolve().parent.parent
outd = root / "www" / "aids"; outd.mkdir(exist_ok=True)
for f in outd.glob("*.png"): f.unlink()
A = json.load(open(sys.argv[1]))
ENGINE = "3.10"
INK, MUT, GRID, ACC, BLUE = "#13233f", "#5b6b82", "#d9e1ec", "#e8762b", "#1f4e99"
for ttf in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
    try: font_manager.fontManager.addfont(ttf)
    except Exception: pass
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10.5, "axes.edgecolor": MUT, "axes.labelcolor": INK, "xtick.color": MUT, "ytick.color": MUT,
                     "axes.titleweight": "bold", "axes.titlesize": 12.5, "axes.titlecolor": INK, "savefig.dpi": 170})
index = []

def fig(title, sub, xl, yl):
    f, ax = plt.subplots(figsize=(7.6, 5.7))
    f.subplots_adjust(left=0.1, right=0.97, top=0.86, bottom=0.12)
    f.text(0.1, 0.945, title, fontsize=13, fontweight="bold", color=INK)
    f.text(0.1, 0.905, sub, fontsize=9.5, color=MUT)
    ax.set_xlabel(xl); ax.set_ylabel(yl)
    ax.grid(True, which="major", color=GRID, lw=0.8); ax.grid(True, which="minor", color=GRID, lw=0.35, alpha=0.7); ax.minorticks_on()
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    return f, ax

def save(f, name, title, grp, note, foot=None):
    f.text(0.97, 0.015, "IS StructDesign engine " + ENGINE + " · " + (foot or "IS 456:2000 strain compatibility — check against SP 16 for final design"), fontsize=7.2, color=MUT, ha="right")
    p = outd / (name + ".png"); f.savefig(p, facecolor="white"); plt.close(f)
    from PIL import Image   # palette PNG: same look, a fraction of the size
    im = Image.open(p).convert("RGB").quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE); im.save(p, optimize=True)
    index.append({"id": name, "file": "aids/" + name + ".png", "title": title, "grp": grp, "note": note})

ARR = {"two": "equally on two opposite faces", "four": "equally on four faces"}
for ch in A["rect"]:
    t = "Rectangular column — bars %s" % ARR[ch["arr"]]
    s = "fy = %d N/mm², d'/D = %.2f · curves for p/fck · compression axial load with uniaxial bending" % (ch["fy"], ch["dD"])
    f, ax = fig(t, s, "Mu / (fck·b·D²)", "Pu / (fck·b·D)")
    for cv in ch["curves"]:
        xs = [p[0] for p in cv["pts"] if p[1] >= 0]; ys = [p[1] for p in cv["pts"] if p[1] >= 0]
        if not xs: continue
        bold = abs(cv["pf"] * 100 % 4) < 1e-6
        ax.plot(xs, ys, color=BLUE if cv["pf"] else INK, lw=1.5 if bold else 0.9, alpha=1 if bold else 0.8)
        i = max(range(len(xs)), key=lambda k: xs[k])
        ax.annotate("%.2f" % cv["pf"], (xs[i], ys[i]), xytext=(3, 0), textcoords="offset points", fontsize=7.5, color=ACC, va="center")
    ax.set_xlim(0, None); ax.set_ylim(0, None)
    ax.text(0.98, 0.97, "p/fck", transform=ax.transAxes, ha="right", va="top", color=ACC, fontsize=9, fontweight="bold")
    save(f, "col-%s-%d-%02d" % (ch["arr"], ch["fy"], round(ch["dD"] * 100)), "Column P–M, %s bars, Fe %d, d'/D %.2f" % (ch["arr"] == "two" and "2-face" or "4-face", ch["fy"], ch["dD"]), "Rectangular columns", t + "; " + s)
for ch in A["circ"]:
    t = "Circular column — bars uniformly around the perimeter"
    s = "fy = %d N/mm², d'/D = %.2f · curves for p/fck" % (ch["fy"], ch["dD"])
    f, ax = fig(t, s, "Mu / (fck·D³)", "Pu / (fck·D²)")
    for cv in ch["curves"]:
        xs = [p[0] for p in cv["pts"]]; ys = [p[1] for p in cv["pts"]]
        bold = abs(cv["pf"] * 100 % 4) < 1e-6
        ax.plot(xs, ys, color=BLUE if cv["pf"] else INK, lw=1.5 if bold else 0.9, alpha=1 if bold else 0.8)
        i = max(range(len(xs)), key=lambda k: xs[k])
        ax.annotate("%.2f" % cv["pf"], (xs[i], ys[i]), xytext=(3, 0), textcoords="offset points", fontsize=7.5, color=ACC, va="center")
    ax.set_xlim(0, None); ax.set_ylim(0, None)
    ax.text(0.98, 0.97, "p/fck", transform=ax.transAxes, ha="right", va="top", color=ACC, fontsize=9, fontweight="bold")
    save(f, "circ-%d-%02d" % (ch["fy"], round(ch["dD"] * 100)), "Circular column P–M, Fe %d, d'/D %.2f" % (ch["fy"], ch["dD"]), "Circular columns and piles", t + "; " + s)
COLS = ["#1f4e99", "#2f855a", "#b7791f", "#c05621", "#9b2c2c", "#553c9a"]
for ch in A["flex"]:
    f, ax = fig("Singly reinforced sections — Mu/bd² against pt", "fy = %d N/mm² · IS 456 Annex G-1.1(b) · each curve ends at pt,lim (xu = xu,max)" % ch["fy"], "pt = 100 Ast / (b d)  (%)", "Mu / (b d²)  (N/mm²)")
    for i, st in enumerate(ch["set"]):
        xs = [p[0] for p in st["pts"]]; ys = [p[1] for p in st["pts"]]
        ax.plot(xs, ys, color=COLS[i], lw=1.6, label="M%d  (pt,lim %.2f %%, Mu,lim/bd² %.2f)" % (st["fck"], st["ptl"], st["Rlim"]))
        ax.plot([xs[-1]], [ys[-1]], "o", color=COLS[i], ms=4)
    ax.legend(frameon=False, fontsize=8.5, loc="lower right"); ax.set_xlim(0, None); ax.set_ylim(0, None)
    save(f, "flex-%d" % ch["fy"], "Flexure Mu/bd² – pt, Fe %d" % ch["fy"], "Beams and slabs", "Annex G-1.1(b)", "IS 456:2000 Annex G-1.1(b)")
f, ax = fig("Design shear strength of concrete τc", "IS 456 Table 19 (as used by the app) · pt = 100 As/(b d)", "pt  (%)", "τc  (N/mm²)")
for i, st in enumerate(A["tauc"]):
    ax.plot([p[0] for p in st["pts"]], [p[1] for p in st["pts"]], color=COLS[i], lw=1.6, label="M%d" % st["fck"])
ax.legend(frameon=False, ncol=3, fontsize=9); ax.set_xlim(0, 3); ax.set_ylim(0, None)
save(f, "tauc", "Shear strength τc (Table 19)", "Beams and slabs", "Table 19", "IS 456:2000 Table 19")
f, ax = fig("Modification factor for tension reinforcement kt", "IS 456 Fig. 4 · fs = 0.58 fy × Ast,req / Ast,prov", "pt  (%)", "kt")
for i, st in enumerate(A["kt"]):
    ax.plot([p[0] for p in st["pts"]], [p[1] for p in st["pts"]], color=COLS[i], lw=1.6, label="fs = %d" % st["fs"])
ax.legend(frameon=False, fontsize=9); ax.set_xlim(0, 3); ax.set_ylim(0, 2.1)
save(f, "kt", "Deflection factor kt (Fig. 4)", "Beams and slabs", "Fig 4", "IS 456:2000 Fig 4")
f, ax = fig("Modification factor for compression reinforcement kc", "IS 456 Fig. 5 · kc = 1 + pc/(3 + pc) ≤ 1.5", "pc  (%)", "kc")
ax.plot([p[0] for p in A["kc"]], [p[1] for p in A["kc"]], color=BLUE, lw=1.8); ax.set_xlim(0, 3); ax.set_ylim(1, 1.55)
save(f, "kc", "Deflection factor kc (Fig. 5)", "Beams and slabs", "Fig 5", "IS 456:2000 Fig 5")
for ch in A["dbl"]:
    f, ax = fig("Doubly reinforced sections — pt and pc", "fck = %d, fy = %d N/mm² · Mu,lim/bd² = %.2f · solid pt, dashed pc · d'/d as labelled" % (ch["fck"], ch["fy"], ch["Rl"]), "Mu / (b d²)  (N/mm²)", "steel (%)")
    for i, ln in enumerate(ch["lines"]):
        xs = [p[0] for p in ln["pts"]]
        ax.plot(xs, [p[1] for p in ln["pts"]], color=COLS[i], lw=1.6, label="d'/d = %.2f" % ln["dd"])
        ax.plot(xs, [p[2] for p in ln["pts"]], color=COLS[i], lw=1.2, ls="--")
    ax.legend(frameon=False, fontsize=9, loc="upper left"); ax.set_ylim(0, None)
    save(f, "dbl-%d-%d" % (ch["fck"], ch["fy"]), "Doubly reinforced, M%d Fe %d" % (ch["fck"], ch["fy"]), "Beams and slabs", "Annex G-1.2", "IS 456:2000 Annex G-1.2")
for ch in A["slab"]:
    if ch.get("ss"):
        f, ax = fig("Slab moment coefficients — Table 27", "Simply supported on four sides, corners not held down (Rankine–Grashoff) · Mx = αx·w·lx², My = αy·w·lx²", "ly / lx", "α")
        ax.plot([p[0] for p in ch["pts"]], [p[1] for p in ch["pts"]], color=BLUE, lw=1.8, label="αx (short span)"); ax.plot([p[0] for p in ch["pts"]], [p[2] for p in ch["pts"]], color=ACC, lw=1.8, label="αy (long span)")
    else:
        f, ax = fig("Slab moment coefficients — Table 26, case %d" % ch["i"], ch["name"].split(". ", 1)[1] + " · Mx = αx·w·lx², My = αy·w·lx² (− support, + mid-span)", "ly / lx", "α")
        if ch["xn"]: ax.plot(ch["r"], ch["xn"], "-o", color=BLUE, lw=1.8, ms=3.5, label="αx  − (short span, support)")
        ax.plot(ch["r"], ch["xp"], "--o", color=BLUE, lw=1.5, ms=3.5, label="αx  + (short span, mid-span)")
        if ch["yn"]: ax.plot([1, 2], [ch["yn"]] * 2, "-", color=ACC, lw=1.8, label="αy  − (long span, support) = %.3f" % ch["yn"])
        ax.plot([1, 2], [ch["yp"]] * 2, "--", color=ACC, lw=1.5, label="αy  + (long span, mid-span) = %.3f" % ch["yp"])
    ax.set_xlim(1, 2); ax.set_ylim(0, None); ax.legend(frameon=False, fontsize=8.5, loc="upper left")
    save(f, "slab-%02d" % ch["i"], "Slab coefficients, case %d" % ch["i"], "Slabs", ch["name"], "IS 456:2000 Annex D, Tables 26 and 27")
for ch in A["fcd"]:
    f, ax = fig("Design compressive stress fcd — buckling curves a, b, c, d", "IS 800:2007 cl 7.1.2 · fy = %d N/mm², γm0 = 1.10, E = 200 000 N/mm²" % ch["fy"], "slenderness KL/r", "fcd  (N/mm²)")
    for i, cv in enumerate(["a", "b", "c", "d"]):
        ax.plot([p[0] for p in ch["cur"][cv]], [p[1] for p in ch["cur"][cv]], color=COLS[i], lw=1.7, label="curve " + cv + " (α = %s)" % {"a": "0.21", "b": "0.34", "c": "0.49", "d": "0.76"}[cv])
    ax.axvline(180, color=MUT, lw=0.8, ls=":"); ax.text(181, ch["fy"] / 1.1 * 0.92, "KL/r 180", fontsize=8, color=MUT)
    ax.set_xlim(0, 250); ax.set_ylim(0, None); ax.legend(frameon=False, fontsize=9)
    save(f, "fcd-%d" % ch["fy"], "Steel fcd vs KL/r, E%d" % ch["fy"], "Steel", "IS 800 cl 7.1.2", "IS 800:2007 cl 7.1.2, the routine used by the steel modules")
for ch in A["ltb"]:
    f, ax = fig("Lateral-torsional buckling — design bending stress fbd", "IS 800:2007 cl 8.2.2 · fy = %d N/mm² · fbd = χLT·fy/γm0" % ch["fy"], "λLT = √(βb·Zp·fy / Mcr)", "fbd  (N/mm²)")
    for i, a in enumerate(["0.21", "0.49"]):
        ax.plot([p[0] for p in ch["cur"][a]], [p[1] for p in ch["cur"][a]], color=COLS[i], lw=1.8, label="αLT = %s (%s)" % (a, "rolled" if a == "0.21" else "welded"))
    ax.set_xlim(0, 3); ax.set_ylim(0, None); ax.legend(frameon=False, fontsize=9)
    save(f, "ltb-%d" % ch["fy"], "Steel LTB fbd, E%d" % ch["fy"], "Steel", "IS 800 cl 8.2.2", "IS 800:2007 cl 8.2.2, the routine used by the steel beam module")
f, ax = fig("Design acceleration coefficient Sa/g", "IS 1893 (Part 1):2016 cl 6.4.2, Fig 2 · 5 % damping · equivalent static and response spectrum", "natural period T  (s)", "Sa / g")
for i, ch in enumerate(A["spec"]):
    ax.plot([p[0] for p in ch["pts"]], [p[1] for p in ch["pts"]], color=COLS[i], lw=1.8, label="soil type " + ch["soil"] + {"I": " (rock / hard)", "II": " (medium)", "III": " (soft)"}[ch["soil"]])
ax.set_xlim(0, 4); ax.set_ylim(0, 2.75); ax.legend(frameon=False, fontsize=9)
save(f, "spectrum", "Seismic Sa/g, IS 1893", "Loads", "IS 1893 Fig 2", "IS 1893 (Part 1):2016 cl 6.4.2, the spectrum used by the seismic analysis")
f, ax = fig("Wind — terrain and height multiplier k2", "IS 875 (Part 3):2015 Table 2 · Vz = Vb·k1·k2·k3·k4", "k2", "height above ground  (m)")
for i, ch in enumerate(A["k2"]):
    ax.plot(ch["k"], ch["h"], "-o", color=COLS[i], lw=1.7, ms=3.5, label="terrain category %d" % ch["tc"])
ax.set_xlim(0.75, 1.3); ax.set_ylim(0, 105); ax.legend(frameon=False, fontsize=9, loc="upper left")
save(f, "k2", "Wind k2 factor, IS 875-3", "Loads", "IS 875 Pt 3 Table 2", "IS 875 (Part 3):2015 Table 2 values used by the wind modules")
js = "/* Offline design aids (generated by tools/make_aids.py from the engine; do not edit) */\nvar AIDS = " + json.dumps(index, ensure_ascii=False) + ";\nif (typeof module !== \"undefined\") module.exports = AIDS;\n"
(root / "www" / "js" / "aids.js").write_text(js)
tot = sum(p.stat().st_size for p in outd.glob("*.png"))
print(len(index), "charts", round(tot / 1e6, 2), "MB")
