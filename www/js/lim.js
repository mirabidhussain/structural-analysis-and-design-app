/* Code limits on inputs (IS 456, IS 13920, IS 2911, IS 800) and fix suggestions for failed designs. */
var LIM = (function () {
  var L = {};
  /* standard sizes — IS 1786 bars, IS 1364 bolts */
  L.BARS = { tie: [6, 8, 10, 12], slab: [8, 10, 12, 16, 20], main: [12, 16, 20, 25, 28, 32], col: [12, 16, 20, 25, 28, 32], ftg: [10, 12, 16, 20, 25], bolt: [12, 16, 20, 24, 27, 30, 36] };
  L.EXPO = { mild: [20, 20], moderate: [30, 25], severe: [45, 30], "very severe": [50, 35], extreme: [75, 40] };   /* IS 456 Table 16 nominal cover, Table 5 minimum grade */
  L.EXPO_OPTS = [["mild", "Mild — cover 20, ≥ M20"], ["moderate", "Moderate — cover 30, ≥ M25"], ["severe", "Severe — cover 45, ≥ M30"], ["very severe", "Very severe — cover 50, ≥ M35"], ["extreme", "Extreme — cover 75, ≥ M40"]];
  L.GRADES = [20, 25, 30, 35, 40];

  /* nominal cover required by IS 456 Table 16 with its notes 1 and 3 */
  L.nomCover = function (exp, dia, fck) {
    var e = L.EXPO[exp] || L.EXPO.moderate, c = e[0];
    if (exp === "mild" && dia <= 12) c -= 5;                                  /* note 1 */
    if ((exp === "severe" || exp === "very severe") && fck >= 35) c -= 5;     /* note 3 */
    return c;
  };
  function f0(v) { return Math.round(v * 10) / 10; }

  /* returns [{k, hard, msg, ref}] — hard = against the code, warn = advisory */
  L.check = function (id, p) {
    var out = [];
    function hard(k, cond, msg, ref) { if (cond) out.push({ k: k, hard: true, msg: msg, ref: ref }); }
    function warn(k, cond, msg, ref) { if (cond) out.push({ k: k, hard: false, msg: msg, ref: ref }); }
    function pos(keys) { keys.forEach(function (k) { if (p[k] !== undefined) hard(k, !(p[k] > 0), "must be greater than zero", ""); }); }
    function grade(min, why) { if (p.fck !== undefined) hard("fck", p.fck < min, "M" + p.fck + " is below the minimum M" + min + " " + why, "IS 456 Table 5"); }
    function rccGrade() { var e = L.EXPO[p.exp]; if (e) grade(e[1], "for " + p.exp + " exposure"); else grade(20, "for reinforced concrete"); }
    function slabDepth(span, d, basic, k) {
      if (!(span > 0 && d > 0)) return;
      var r = span * 1000 / d;
      hard(k, r > basic * 2, "span/d = " + f0(r) + " exceeds " + basic + " × 2.0 (largest modification factor) — the deflection limit cannot be met; minimum d ≈ " + Math.ceil(span * 1000 / (basic * 2)) + " mm", "IS 456 cl 23.2.1, Fig 4");
    }
    var basic = { ss: 20, cont: 26, cant: 7 };
    switch (id) {
      case "beam": {
        pos(["b", "D", "cover", "L"]);
        var nc = L.nomCover(p.exp, p.dia, p.fck);
        hard("cover", p.cover < nc, "clear cover " + p.cover + " mm is less than the nominal cover " + nc + " mm for " + p.exp + " exposure", "IS 456 cl 26.4.2, Table 16");
        hard("cover", p.cover < p.stir || p.cover + p.stir < p.dia, "cover must not be less than the bar diameter", "IS 456 cl 26.4.1");
        hard("D", p.D <= 2 * (p.cover + p.stir) + 2 * p.dia, "overall depth leaves no room for the bars", "");
        var d = p.D - p.cover - p.stir - p.dia / 2;
        if (p.L > 0 && d > 0) { var bs = basic[p.support] || 20, r = p.L * 1000 / d; hard("D", r > bs * 2 * 1.5, "span/d = " + f0(r) + " exceeds " + bs + " × 2.0 × 1.5 (largest factors of Fig 4 and 5) — minimum d ≈ " + Math.ceil(p.L * 1000 / (bs * 3)) + " mm", "IS 456 cl 23.2.1"); }
        warn("b", p.b < 200, "width below 200 mm is not permitted in seismic zones III–V", "IS 13920 cl 6.1.2");
        warn("b", p.b / p.D < 0.3, "b/D = " + f0(p.b / p.D * 100) / 100 + " < 0.3 (ductile detailing)", "IS 13920 cl 6.1.1");
        if (p.L > 0 && d > 0) { var lim = p.support === "cant" ? Math.min(25 * p.b, 100 * p.b * p.b / d) : Math.min(60 * p.b, 250 * p.b * p.b / d); warn("L", p.L * 1000 > lim, "check lateral stability: clear distance between restraints should not exceed " + f0(lim / 1000) + " m", "IS 456 cl 23.3"); }
        rccGrade(); break;
      }
      case "slab": {
        var tt = RCC.slabType(p), q = Object.assign({}, p, tt.type === "one" ? { L: tt.L, support: tt.support } : { lx: tt.lx, ly: tt.ly });
        out = L.check(tt.type === "one" ? "slab1" : "slab2", q).filter(function (x) { return x.k !== "ly"; }).map(function (x) { if (x.k === "L") x.k = "lx"; return x; });
        hard("lx", !(p.lx > 0) || !(p.ly > 0), "both spans must be greater than zero", "");
        break;
      }
      case "slab1": case "slab2": case "stair": {
        var t = id === "stair" ? p.t : p.D, tk = id === "stair" ? "t" : "D";
        pos([tk, "cover"]);
        var nc2 = L.nomCover(p.exp, p.dia, p.fck);
        hard("cover", p.cover < nc2, "clear cover " + p.cover + " mm is less than the nominal cover " + nc2 + " mm for " + p.exp + " exposure", "IS 456 cl 26.4.2, Table 16");
        hard("cover", p.cover < p.dia, "cover must not be less than the bar diameter", "IS 456 cl 26.4.1");
        hard("dia", p.dia > t / 8, "bar diameter " + p.dia + " mm exceeds 1/8 of the slab thickness (" + f0(t / 8) + " mm)", "IS 456 cl 26.5.2.2");
        var d2 = t - p.cover - p.dia / 2;
        hard(tk, d2 <= 0, "thickness leaves no effective depth", "");
        if (id === "slab1") slabDepth(p.L, d2, basic[p.support] || 20, tk);
        if (id === "slab2") { slabDepth(p.lx, d2, 26, tk); hard("ly", p.ly < p.lx, "long span must not be less than the short span", "IS 456 Annex D"); }
        if (id === "stair") {
          slabDepth(p.L, d2, p.support === "cont" ? 26 : 20, tk);
          warn("R", p.R > 190, "riser above 190 mm (residential maximum)", "NBC 2016 Part 3/4");
          warn("T", p.T < 250, "tread below 250 mm (residential minimum)", "NBC 2016 Part 3/4");
          warn("R", 2 * p.R + p.T < 550 || 2 * p.R + p.T > 700, "2R + T = " + (2 * p.R + p.T) + " mm, usual range 550–700", "IS 456 cl 33 practice");
        }
        rccGrade(); break;
      }
      case "column": {
        pos(["b", "D", "L", "lex", "ley", "cover"]);
        var small = Math.min(p.b, p.D) <= 200 && p.dia <= 12, need = small ? 25 : 40;
        hard("cover", p.cover + p.tie < Math.max(need, p.dia), "cover to the longitudinal bars " + (p.cover + p.tie) + " mm is less than " + Math.max(need, p.dia) + " mm", "IS 456 cl 26.4.2.1");
        var nc3 = (L.EXPO[p.exp] || L.EXPO.moderate)[0];
        hard("cover", p.cover < nc3, "clear cover to the ties " + p.cover + " mm is less than the nominal cover " + nc3 + " mm for " + p.exp + " exposure", "IS 456 Table 16");
        hard("tie", p.tie < Math.max(6, p.dia / 4), "tie diameter must be at least max(6, φ/4) = " + Math.max(6, p.dia / 4) + " mm", "IS 456 cl 26.5.3.2(c)");
        hard("dia", p.dia < 12, "longitudinal bars must be at least 12 mm", "IS 456 cl 26.5.3.1(d)");
        hard("pmax", p.pmax > 6, "maximum longitudinal steel is 6 % (4 % recommended)", "IS 456 cl 26.5.3.1(a)");
        hard("pmax", p.pmax < 0.8, "maximum steel cannot be below the 0.8 % minimum", "IS 456 cl 26.5.3.1(a)");
        if (p.b > 0 && p.D > 0) hard("L", p.L * 1000 > 60 * Math.min(p.b, p.D), "unsupported length exceeds 60 × least lateral dimension (" + f0(60 * Math.min(p.b, p.D) / 1000) + " m)", "IS 456 cl 25.3.1");
        warn("b", Math.min(p.b, p.D) < 300, "least dimension below 300 mm is not permitted in seismic zones III–V", "IS 13920 cl 7.1.2");
        warn("b", Math.min(p.b, p.D) / Math.max(p.b, p.D) < 0.4, "ratio of shortest to longest dimension below 0.4", "IS 13920 cl 7.1.1");
        rccGrade(); break;
      }
      case "footing": case "strip": {
        pos(["sbc", "cover"].concat(id === "footing" ? ["P", "cb", "cd"] : ["w", "tw"]));
        hard("cover", p.cover < 50, "minimum cover for footings is 50 mm", "IS 456 cl 26.4.2.2");
        hard("cover", p.cover < (L.EXPO[p.exp] || L.EXPO.moderate)[0], "cover is less than the nominal cover for " + p.exp + " exposure", "IS 456 Table 16");
        if (id === "strip") hard("Dmin", p.Dmin > 0 && p.Dmin < 150, "thickness at the edge of a footing on soil must be at least 150 mm", "IS 456 cl 34.1.2");
        rccGrade(); break;
      }
      case "pile": {
        pos(["Dp", "Lp", "cb", "cd", "fos", "sp"]);
        hard("pcov", p.pcov < 50, "cover to pile reinforcement must be at least 50 mm", "IS 2911 (Part 1/Sec 2)");
        hard("sp", p.sp < 2.5, "pile spacing must be at least 2.5 × D", "IS 2911 (Part 1/Sec 2)");
        warn("sp", p.sp < 3, "friction piles need at least 3 × D", "IS 2911 (Part 1/Sec 2)");
        hard("fos", !(p.Qg > 0) && p.fos < 2.5, "factor of safety on the static formula must be at least 2.5", "IS 2911 Annex B");
        hard("edge", p.edge < 100, "cap must project at least 100 mm beyond the outer piles", "IS 2911 (Part 1/Sec 2)");
        warn("edge", p.edge >= 100 && p.edge < 150, "150 mm projection is normal practice", "IS 2911 (Part 1/Sec 2)");
        grade(25, "for piles", "IS 2911"); break;
      }
      case "raft": {
        pos(["sbc", "cb", "cd", "matMesh"]);
        hard("matT", p.matT > 0 && p.matT < 150, "a raft thinner than 150 mm is below the footing edge minimum", "IS 456 cl 34.1.2");
        grade(25, "for moderate exposure (in contact with soil)"); break;
      }
      case "tension": {
        var d0 = p.db + (p.db <= 14 ? 1 : p.db <= 24 ? 2 : 3);
        if (p.conn === "bolt") {
          hard("pitch", p.pitch < 2.5 * p.db, "pitch must be at least 2.5 × bolt dia = " + 2.5 * p.db + " mm", "IS 800 cl 10.2.2");
          hard("e", p.e < 1.5 * d0, "end distance must be at least 1.5 × hole dia = " + f0(1.5 * d0) + " mm", "IS 800 cl 10.2.4.2");
        }
        hard("lmax", p.lmax > 400, "maximum L/r for tension members is 400", "IS 800 Table 3"); break;
      }
      case "comp": hard("lmax", p.lmax > 250, "maximum KL/r for compression members is 250 (180 for dead + imposed loads)", "IS 800 Table 3"); warn("lmax", p.lmax > 180 && p.lmax <= 250, "KL/r above 180 is allowed only for members resisting wind or earthquake forces", "IS 800 Table 3"); break;
      case "bolts": {
        var h0 = p.db + (p.db <= 14 ? 1 : p.db <= 24 ? 2 : 3), tt = p.tw_thk, smin = tt <= 10 ? 3 : tt <= 20 ? 5 : tt <= 32 ? 6 : 8;
        hard("pitch", p.pitch < 2.5 * p.db, "pitch must be at least 2.5 × bolt dia = " + 2.5 * p.db + " mm", "IS 800 cl 10.2.2");
        hard("e", p.e < 1.5 * h0, "end distance must be at least 1.5 × hole dia = " + f0(1.5 * h0) + " mm", "IS 800 cl 10.2.4.2");
        hard("s", p.s < smin, "minimum fillet weld size for a " + tt + " mm part is " + smin + " mm", "IS 800 Table 21");
        hard("Lw", p.Lw < 4 * p.s, "effective weld length must be at least 4 × weld size", "IS 800 cl 10.5.4.1");
        warn("s", p.s > p.t - 1.5, "weld size above (thinner part − 1.5 mm) on square edges", "IS 800 cl 10.5.8.2"); break;
      }
      case "sbeam": warn("dl", p.dl < 240, "deflection limit looser than span/240", "IS 800 Table 6"); break;
    }
    return out;
  };

  /* frame / building model inputs */
  L.frame = function (p) {
    var out = [], duct = String(p.zone) !== "II";
    function add(k, hard, msg, ref) { out.push({ k: k, hard: hard, msg: msg, ref: ref }); }
    function dims(t) { var m = /^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i.exec(String(t || "")); return m ? [+m[1], +m[2]] : null; }
    if (p.mat !== "steel") {
      var e = L.EXPO[p.exposure] || L.EXPO.moderate;
      if (+p.fck < e[1]) add("fck", true, "M" + p.fck + " is below the minimum M" + e[1] + " for " + (p.exposure || "moderate") + " exposure", "IS 456 Table 5");
      var c = dims(p.colSec), b = dims(p.beamSec);
      if (c && Math.min(c[0], c[1]) < 300) add("colSec", duct, "column " + p.colSec + ": least dimension below 300 mm" + (duct ? " in zone " + p.zone : " (needed in zones III–V)"), "IS 13920 cl 7.1.2");
      if (c && Math.min(c[0], c[1]) / Math.max(c[0], c[1]) < 0.4) add("colSec", false, "column " + p.colSec + ": shortest/longest side below 0.4", "IS 13920 cl 7.1.1");
      if (b && b[0] < 200) add("beamSec", duct, "beam " + p.beamSec + ": width below 200 mm" + (duct ? " in zone " + p.zone : " (needed in zones III–V)"), "IS 13920 cl 6.1.2");
      if (b && b[0] / b[1] < 0.3) add("beamSec", false, "beam " + p.beamSec + ": b/D below 0.3", "IS 13920 cl 6.1.1");
      if (p.walls && +p.tWall < 150) add("tWall", true, "shear wall thickness below 150 mm", "IS 13920 cl 10.1.2");
    }
    return out;
  };
  /* ---------- fix suggestions: smallest single change (then pairs) that makes every check pass ---------- */
  function up(v, step, max) { var a = []; for (var x = Math.ceil((v + 0.01) / step) * step; x <= max + 1e-9; x += step) a.push(Math.round(x * 1000) / 1000); return a; }
  function after(list, v) { return list.filter(function (x) { return x > v; }); }
  var GR = [20, 25, 30, 35, 40];
  function levers(id, p) {
    var Lv = [];
    function lv(k, label, unit, vals) { if (vals.length) Lv.push({ k: k, label: label, unit: unit, vals: vals }); }
    function gradeLv() { lv("fck", "Concrete grade", "", after(GR, p.fck)); }
    switch (id) {
      case "beam": lv("D", "Overall depth D", "mm", up(p.D, 25, Math.max(900, p.D * 2))); lv("b", "Width b", "mm", after([230, 250, 300, 350, 400, 450, 500, 600], p.b)); lv("dia", "Main bar dia", "mm", after(L.BARS.main, p.dia)); lv("stir", "Stirrup dia", "mm", after([8, 10, 12], p.stir)); gradeLv(); break;
      case "slab": case "slab1": case "slab2": lv("D", "Thickness D", "mm", up(p.D, 10, Math.max(300, p.D * 2))); lv("dia", "Bar dia", "mm", after(L.BARS.slab, p.dia)); gradeLv(); break;
      case "stair": lv("t", "Waist thickness", "mm", up(p.t, 10, Math.max(300, p.t * 2))); lv("dia", "Bar dia", "mm", after(L.BARS.slab, p.dia)); gradeLv(); break;
      case "column": lv("b", "Width b", "mm", up(p.b, 50, Math.max(900, p.b * 2))); lv("D", "Depth D", "mm", up(p.D, 50, Math.max(1200, p.D * 2))); lv("dia", "Main bar dia", "mm", after(L.BARS.col, p.dia)); gradeLv(); lv("pmax", "Max steel %", "%", after([4, 5, 6], p.pmax)); break;
      case "footing": lv("dia", "Bar dia", "mm", after(L.BARS.ftg, p.dia)); gradeLv(); break;
      case "strip": lv("Dmin", "Minimum depth", "mm", up(Math.max(p.Dmin, 150), 50, 900)); lv("dia", "Bar dia", "mm", after(L.BARS.ftg, p.dia)); gradeLv(); break;
      case "pile": lv("Dp", "Pile diameter", "mm", after([450, 500, 600, 750, 1000, 1200], p.Dp)); lv("Lp", "Pile length", "m", up(p.Lp, 1, p.Lp + 15)); if (p.capT > 0) lv("capT", "Cap thickness", "mm", [0]); gradeLv(); break;
      case "raft": if (p.matT > 0) lv("matT", "Raft thickness", "mm", [0].concat(up(p.matT, 100, p.matT + 600))); gradeLv(); break;
      case "tension": if (p.sec !== "auto") lv("sec", "Angle section", "", ["auto"]); if (+p.n === 1) lv("n", "Arrangement", "", [2]); lv("nb", "Bolts in line", "", up(p.nb, 1, p.nb + 6)); if (p.bgrade === "4.6") lv("bgrade", "Bolt grade", "", ["8.8"]); break;
      case "comp": if (p.sec !== "auto") lv("sec", "Section", "", ["auto"]); if (p.type === "sa") lv("type", "Member type", "", ["da"]); break;
      case "sbeam": if (p.sec !== "auto") lv("sec", "Section", "", ["auto"]); if (!p.lat) lv("lat", "Compression flange", "", [true]); if (!p.lat) lv("Lun", "Unbraced length", "m", [p.Lun / 2, p.Lun / 3]); break;
      case "bolts": lv("nb", "Number of bolts", "", up(p.nb, 1, p.nb + 8)); lv("grade", "Bolt grade", "", p.grade === "4.6" ? ["8.8", "10.9"] : p.grade === "8.8" ? ["10.9"] : []); lv("db", "Bolt dia", "mm", after(L.BARS.bolt, p.db)); lv("s", "Weld size", "mm", up(p.s, 1, Math.max(p.s, p.t - 1.5))); lv("Lw", "Weld length", "mm", up(p.Lw, 20, p.Lw * 3)); break;
      case "purlin": if (p.kind === "angle") lv("kind", "Section type", "", ["channel"]); if (!p.sag) lv("sag", "Sag rods", "", [true]); break;
      case "truss": if (+p.fy === 250) lv("fy", "Steel", "", [350]); lv("webMin", "Min web angle leg", "mm", after([50, 55, 60, 65, 70, 75, 80, 90, 100], p.webMin)); break;
    }
    return Lv;
  }
  function label(l, v) {
    if (l.k === "fck") return "Use M" + v + " concrete";
    if (l.k === "sec" && v === "auto") return "Let the app pick the lightest section that passes";
    if (l.k === "capT" || l.k === "matT") { if (v === 0) return "Let the app choose the " + (l.k === "capT" ? "cap" : "raft") + " thickness"; }
    if (l.k === "n") return "Use a double angle";
    if (l.k === "lat") return "Restrain the compression flange laterally";
    if (l.k === "sag") return "Add sag rods at mid-span";
    if (l.k === "kind") return "Use a channel (ISMC)";
    if (l.k === "type") return "Use a double angle";
    if (l.k === "fy") return "Use E350 steel";
    if (l.k === "grade" || l.k === "bgrade") return "Use grade " + v + " bolts";
    if (l.k === "dia") return "Use " + v + " mm " + (/Main/.test(l.label) ? "main bars" : "bars");
    if (l.k === "stir") return "Use " + v + " mm stirrups";
    if (l.k === "db") return "Use M" + v + " bolts";
    return "Increase " + l.label.charAt(0).toLowerCase() + l.label.slice(1) + " to " + v + (l.unit ? " " + l.unit : "");
  }
  /* run(p) → report; returns [{text, set: {k: v}, fails}] ranked by size of change */
  L.fixes = function (id, p, run, opt) {
    opt = opt || {};
    var budget = opt.budget || 120, n = 0, res = [];
    function test(q) {
      if (n >= budget) return null; n++;
      if (L.check(id, q).some(function (x) { return x.hard; })) return null;
      try { var r = run(q); return r && r.ok() ? r : null; } catch (e) { return null; }
    }
    var Lv = levers(id, p);
    Lv.forEach(function (l) {
      for (var i = 0; i < l.vals.length; i++) {
        var q = Object.assign({}, p); q[l.k] = l.vals[i];
        if (test(q)) { var s = {}; s[l.k] = l.vals[i]; res.push({ text: label(l, l.vals[i]), set: s, rank: i / l.vals.length }); break; }
      }
    });
    if (!res.length && Lv.length > 1) {      /* pairs of the first two levers, stepping both */
      var a = Lv[0], b = Lv[1];
      for (var i = 0; i < a.vals.length && !res.length; i++) for (var j = 0; j < b.vals.length; j++) {
        var q = Object.assign({}, p); q[a.k] = a.vals[i]; q[b.k] = b.vals[j];
        if (test(q)) { var s = {}; s[a.k] = a.vals[i]; s[b.k] = b.vals[j]; res.push({ text: label(a, a.vals[i]) + " and " + label(b, b.vals[j]).replace(/^(Use|Increase) /, function (m) { return m.toLowerCase(); }).replace(/^increase /, ""), set: s, rank: 1 }); break; }
        if (n >= budget) break;
      }
    }
    res.sort(function (x, y) { return x.rank - y.rank; });
    return { list: res.slice(0, opt.max || 4), tried: n };
  };
  return L;
})();
if (typeof module !== "undefined") module.exports = LIM;
