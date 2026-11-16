/* Input units: SI (kN, m, mm), MKS (t, kgf/cm²) or FPS (kip, ft, in). Values are always stored and calculated in SI. */
var UN = (function () {
  var U = {};
  var g = 9.80665, T = 1 / g;
  /* SI unit → [label, factor] with user value = SI × factor */
  U.SYS = {
    si: { name: "SI — kN, m, mm", short: "SI", map: {} },
    mks: { name: "MKS — t, m, kgf/cm²", short: "MKS", map: { "kN": ["t", T], "kNm": ["t·m", T], "kN/m": ["t/m", T], "kN/m²": ["t/m²", T], "kN/m³": ["t/m³", T], "N/mm²": ["kgf/cm²", 10.19716] } },
    fps: { name: "FPS — kip, ft, in", short: "FPS", map: { "mm": ["in", 1 / 25.4], "m": ["ft", 1 / 0.3048], "kN": ["kip", 1 / 4.4482216], "kNm": ["kip·ft", 1 / 1.3558179], "kN/m": ["kip/ft", 1 / 14.593903], "kN/m²": ["psf", 1000 / 47.880259], "kN/m³": ["pcf", 1000 / 157.08746], "N/mm²": ["psi", 145.03774] } }
  };
  var cur = "si";
  try { cur = localStorage.getItem("isd_units") || "si"; } catch (e) {}
  if (!U.SYS[cur]) cur = "si";
  U.sys = function () { return cur; };
  U.set = function (s) { if (!U.SYS[s]) return; cur = s; try { localStorage.setItem("isd_units", s); } catch (e) {} };
  U.conv = function (unit, sys) { var m = U.SYS[sys || cur].map[unit]; return m ? { u: m[0], f: m[1] } : { u: unit, f: 1 }; };
  U.label = function (unit, sys) { return U.conv(unit, sys).u; };
  function nice(v) { if (!isFinite(v)) return ""; if (v === 0) return "0"; var a = Math.abs(v), p = a >= 1000 ? 6 : 5; return String(parseFloat(v.toPrecision(Math.max(p, Math.ceil(Math.log10(a)) + 3)))); }
  U.nice = nice;
  /* SI → user, as display text */
  U.show = function (si, unit, sys) { if (si === "" || si === undefined || si === null || !isFinite(+si)) return si === undefined || si === null ? "" : String(si); var c = U.conv(unit, sys); return c.f === 1 ? String(si) : nice(+si * c.f); };
  /* user → SI */
  U.toSI = function (v, unit, sys) { var c = U.conv(unit, sys); return c.f === 1 ? v : v / c.f; };
  U.active = function () { return cur !== "si"; };
  U.note = function () { return cur === "si" ? "" : "Inputs in " + U.SYS[cur].short + " units; the calculation is shown in SI (kN, m, mm) as in the IS codes." + (cur === "fps" ? " 1 in = 25.4 mm · 1 ft = 0.3048 m · 1 kip = 4.448 kN · 1 psi = 0.006895 N/mm²." : " 1 t = 9.807 kN · 1 kgf/cm² = 0.0981 N/mm²."); };
  return U;
})();
if (typeof module !== "undefined") module.exports = UN;
