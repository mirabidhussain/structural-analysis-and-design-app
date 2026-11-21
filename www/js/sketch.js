/* Live input sketches for the design modules (redrawn as the inputs change). */
var SK = (function () {
  var S = {};
  function f(v, d) { return (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString(); }
  function svg(w, h, body) { return '<svg class="skv" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" role="img">' + body + '</svg>'; }
  function line(x1, y1, x2, y2, c, extra) { return '<line x1="' + f(x1, 1) + '" y1="' + f(y1, 1) + '" x2="' + f(x2, 1) + '" y2="' + f(y2, 1) + '" class="' + (c || "k") + '"' + (extra || "") + '/>'; }
  function rect(x, y, w, h, c, extra) { return '<rect x="' + f(x, 1) + '" y="' + f(y, 1) + '" width="' + f(w, 1) + '" height="' + f(h, 1) + '" class="' + (c || "k") + '"' + (extra || "") + '/>'; }
  function circ(x, y, r, c) { return '<circle cx="' + f(x, 1) + '" cy="' + f(y, 1) + '" r="' + f(r, 2) + '" class="' + (c || "bar") + '"/>'; }
  function text(x, y, t, c, a) { return '<text x="' + f(x, 1) + '" y="' + f(y, 1) + '" class="' + (c || "tx") + '"' + (a ? ' text-anchor="' + a + '"' : '') + '>' + String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</text>'; }
  function arrow(x1, y1, x2, y2, c) { var a = Math.atan2(y2 - y1, x2 - x1), s = 5; return line(x1, y1, x2, y2, c) + '<path class="' + (c || "k") + 'f" d="M' + f(x2, 1) + ' ' + f(y2, 1) + ' L' + f(x2 - s * Math.cos(a - 0.45), 1) + ' ' + f(y2 - s * Math.sin(a - 0.45), 1) + ' L' + f(x2 - s * Math.cos(a + 0.45), 1) + ' ' + f(y2 - s * Math.sin(a + 0.45), 1) + 'Z"/>'; }
  function dim(x1, y, x2, label) { return line(x1, y, x2, y, "dm") + line(x1, y - 4, x1, y + 4, "dm") + line(x2, y - 4, x2, y + 4, "dm") + text((x1 + x2) / 2, y - 4, label, "td", "middle"); }
  function vdim(x, y1, y2, label) { return line(x, y1, x, y2, "dm") + line(x - 4, y1, x + 4, y1, "dm") + line(x - 4, y2, x + 4, y2, "dm") + '<text class="td" text-anchor="middle" transform="translate(' + f(x - 5, 1) + ' ' + f((y1 + y2) / 2, 1) + ') rotate(-90)">' + label + '</text>'; }
  function hatch(x, y, w, h, dir) { var o = '<g class="ht">'; if (dir === "v") { for (var i = 0; i <= h; i += 6) o += line(x, y + i, x + w, y + i + 6, "ht"); } else { for (var j = 0; j <= w; j += 6) o += line(x + j, y, x + j + 6, y + h, "ht"); } return o + '</g>'; }
  function pin(x, y) { return '<path class="sup" d="M' + x + ' ' + y + ' l-7 11 h14 z"/>'; }
  function roller(x, y) { return pin(x, y) + circ(x - 4, y + 14, 2.5, "supc") + circ(x + 4, y + 14, 2.5, "supc"); }
  function section(cx, cy, b, D, cover, link, dia, H, opt) {
    var sc = H / Math.max(b, D), w = b * sc, h = D * sc, x = cx - w / 2, y = cy - h / 2, c = (cover + link) * sc, o = rect(x, y, w, h, "con");
    o += rect(x + cover * sc, y + cover * sc, w - 2 * cover * sc, h - 2 * cover * sc, "lnk");
    var r = Math.max(2.4, dia / 2 * sc);
    if (opt === "col4") { [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]].forEach(function (q) { o += circ(x + c + r + q[0] * (w - 2 * c - 2 * r), y + c + r + q[1] * (h - 2 * c - 2 * r), r); }); }
    else if (opt === "col2") { [0, 0.5, 1].forEach(function (t) { o += circ(x + c + r + t * (w - 2 * c - 2 * r), y + c + r, r) + circ(x + c + r + t * (w - 2 * c - 2 * r), y + h - c - r, r); }); }
    else { [0, 0.5, 1].forEach(function (t) { o += circ(x + c + r + t * (w - 2 * c - 2 * r), y + h - c - r, r); }); [0, 1].forEach(function (t) { o += circ(x + c + 2.2 + t * (w - 2 * c - 4.4), y + c + 2.2, 2.2); }); }
    return { s: o, x: x, y: y, w: w, h: h };
  }
  /* support symbol at (x, y) on a member of depth h; side −1 = left end, +1 = right end (fixed walls sit outside the member) */
  S.support = function (x, y, h, t, side) {
    side = side || -1;
    if (t === "fixed") return rect(side < 0 ? x - 12 : x, y - 26, 12, h + 52, "wall") + hatch(side < 0 ? x - 12 : x, y - 26, 12, h + 52, "v");
    if (t === "pinned") return pin(x, y + h) + line(x - 10, y + h + 11, x + 10, y + h + 11, "sup");
    if (t === "roller") return roller(x, y + h) + line(x - 10, y + h + 19, x + 10, y + h + 19, "sup");
    if (t === "spring") { var d = "M" + x + " " + (y + h); for (var i = 1; i <= 6; i++) d += " L" + (x + (i % 2 ? 5 : -5)) + " " + (y + h + i * 3.5); return '<path class="sup" d="' + d + " L" + x + " " + (y + h + 26) + '"/>' + line(x - 9, y + h + 26, x + 9, y + h + 26, "sup"); }
    if (t === "guided") return rect(side < 0 ? x - 6 : x + 2, y - 10, 4, h + 20, "sup") + line(side < 0 ? x - 10 : x + 10, y - 14, side < 0 ? x - 10 : x + 10, y + h + 14, "sup");
    return text(x + side * 4, y - 4, "free", "ts", side < 0 ? "end" : "start");
  };
  var D_ = {};
  D_.beam = function (p) {
    var o = "", x0 = 22, x1 = 222, y = 78, sup = p.support || "ss";
    o += rect(x0, y, x1 - x0, 14, "con");
    if (p.endL) { o += S.support(x0, y, 14, p.endL, -1) + S.support(x1, y, 14, p.endR, 1); var cs = RCC.beamCase(p.endL, p.endR); o += text((x0 + x1) / 2, y + 30, cs.name, "td", "middle");
      if (p.mode !== "direct") [[p.P1, p.a1], [p.P2, p.a2]].forEach(function (q) { if (+q[0] > 0) { var xx = x0 + (x1 - x0) * Math.min(Math.max(+q[1] || 0, 0), p.L) / p.L; o += arrow(xx, y - 44, xx, y - 2, "ld") + text(xx, y - 47, f(q[0], 1) + " kN", "td", "middle"); } }); }
    else if (sup === "cant") { o += rect(x0 - 12, y - 26, 12, 66, "wall") + hatch(x0 - 12, y - 26, 12, 66, "v"); }
    else if (sup === "cont") { o += line(x0 - 16, y + 7, x0, y + 7, "cnt") + line(x1, y + 7, x1 + 16, y + 7, "cnt") + pin(x0, y + 14) + pin(x1, y + 14) + text(x0 - 14, y - 4, "cont.", "ts") + text(x1 + 2, y - 4, "cont.", "ts"); }
    else o += pin(x0, y + 14) + roller(x1, y + 14);
    if (p.mode === "direct") o += text((x0 + x1) / 2, y - 26, "Mu = " + f(p.Mu, 1) + " kNm · Vu = " + f(p.Vu, 1) + " kN", "tl", "middle");
    else { for (var i = 0; i <= 10; i++) { var xx = x0 + (x1 - x0) * i / 10; o += arrow(xx, y - 22, xx, y - 2, "ld"); } o += line(x0, y - 22, x1, y - 22, "ld") + text((x0 + x1) / 2, y - 27, "w = " + f(p.wu, 2) + " kN/m", "tl", "middle"); }
    o += dim(x0, y + 44, x1, "L = " + f(p.L, 2) + " m");
    var sc = section(300, 82, p.b, p.D, p.cover, p.stir, p.dia, 96);
    o += sc.s + dim(sc.x, sc.y + sc.h + 14, sc.x + sc.w, "b " + f(p.b)) + vdim(sc.x - 10, sc.y, sc.y + sc.h, "D " + f(p.D));
    o += text(300, 22, "section", "ts", "middle");
    return svg(360, 150, o);
  };
  /* slab edges: T, B long edges · L, R short edges; cases of IS 456 Table 26 */
  var DISC = { 1: "", 2: "L", 3: "B", 4: "LB", 5: "LR", 6: "TB", 7: "LRB", 8: "TBL", 9: "TBLR", 10: "TBLR" };
  D_.slab = function (p) {
    var t = RCC.slabType(p), cs = +p.case_ || 4, cant = cs === 11, lx = cant ? +p.lx : Math.min(p.lx, p.ly), ly = cant ? +p.ly : Math.max(p.lx, p.ly);
    var W = 250, H = 110, sc = Math.min(W / ly, H / lx), w = ly * sc, h = lx * sc, x = 60 + (W - w) / 2, y = 22 + (H - h) / 2, o = rect(x, y, w, h, "con");
    var dsc = cant ? "TLR" : DISC[cs] || "", E = { T: [x, y, x + w, y], B: [x, y + h, x + w, y + h], L: [x, y, x, y + h], R: [x + w, y, x + w, y + h] };
    Object.keys(E).forEach(function (k) { var e = E[k], d = dsc.indexOf(k) >= 0; o += line(e[0], e[1], e[2], e[3], cant ? (d ? "free" : "cnt") : d ? "dis" : "cnt");
      if (!d) { if (k === "T") o += hatch(x, y - 7, w, 7); else if (k === "B") o += hatch(x, y + h, w, 7); else if (k === "L") o += hatch(x - 7, y, 7, h, "v"); else o += hatch(x + w, y, 7, h, "v"); } });
    var cx = x + w / 2, cy = y + h / 2;
    o += arrow(cx, cy, cx, y + 5, "sp") + arrow(cx, cy, cx, y + h - 5, "sp");
    if (t.type === "two") o += arrow(cx, cy, x + 6, cy, "sp") + arrow(cx, cy, x + w - 6, cy, "sp");
    o += text(x + w + 12, cy + 4, (cant ? "projection " : "lx ") + f(lx, 2) + " m", "td") + text(cx, y + h + 22, "ly " + f(ly, 2) + " m", "td", "middle");
    o += '<g class="badge"><rect x="6" y="6" width="' + (cant ? 140 : 150) + '" height="22" rx="11"/>' + text(14, 21, cant ? "CANTILEVER SLAB" : (t.type === "two" ? "TWO-WAY" : "ONE-WAY") + " · ly/lx " + f(t.ratio, 2), "tb") + '</g>';
    o += line(250, 160, 268, 160, "cnt") + text(272, 163, "continuous", "ts") + line(250, 172, 268, 172, cant ? "free" : "dis") + text(272, 175, cant ? "free edge" : "discontinuous", "ts");
    return svg(360, 182, o);
  };
  D_.slab1 = function (p) { return D_.slab(Object.assign({}, p, { lx: p.L, ly: Math.max(p.L * 2.5, 1), case_: p.support === "cant" ? 11 : p.support === "cont" ? 1 : 10 })); };
  D_.slab2 = function (p) { return D_.slab(p); };
  D_.column = function (p) {
    var sc = section(110, 82, p.b, p.D, p.cover, p.tie, p.dia, 112, p.arr === "two" ? "col2" : "col4"), o = sc.s;
    o += dim(sc.x, sc.y + sc.h + 14, sc.x + sc.w, "b " + f(p.b)) + vdim(sc.x - 10, sc.y, sc.y + sc.h, "D " + f(p.D));
    o += arrow(110, 82, 110 + sc.w / 2 + 26, 82, "ax") + text(110 + sc.w / 2 + 28, 86, "x", "ts") + arrow(110, 82, 110, 82 - sc.h / 2 - 22, "ax") + text(114, 82 - sc.h / 2 - 22, "y", "ts");
    o += text(220, 40, "Pu = " + f(p.Pu, 0) + " kN", "tl") + text(220, 62, "Mux = " + f(p.Mux, 1) + " kNm", "tl") + text(220, 84, "Muy = " + f(p.Muy, 1) + " kNm", "tl") + text(220, 106, "L = " + f(p.L, 2) + " m, lex/ley = " + f(p.lex, 2) + "/" + f(p.ley, 2), "ts") + text(220, 124, (p.arr === "two" ? "bars on two faces" : "bars on four faces") + ", φ" + p.dia, "ts");
    return svg(360, 150, o);
  };
  D_.footing = function (p) {
    var o = "", cw = 30, fx = 60, fw = 200, fy = 82, fh = 26;
    o += rect(fx + fw / 2 - cw / 2, 26, cw, fy - 26, "con") + rect(fx, fy, fw, fh, "con") + line(fx - 20, fy + fh, fx + fw + 20, fy + fh, "gnd");
    o += arrow(fx + fw / 2, 4, fx + fw / 2, 24, "ld") + text(fx + fw / 2 + 8, 14, "P = " + f(p.P, 0) + " kN" + (p.Mx ? ", M = " + f(p.Mx, 1) + " kNm" : ""), "tl");
    for (var i = 0; i <= 8; i++) { var xx = fx + fw * i / 8; o += arrow(xx, fy + fh + 26, xx, fy + fh + 3, "sp"); }
    o += text(fx + fw / 2, fy + fh + 42, "net SBC " + f(p.sbc, 0) + " kN/m² → size L × B from the load", "ts", "middle");
    o += text(fx + fw + 6, fy + 18, "column " + f(p.cb) + "×" + f(p.cd), "ts");
    return svg(360, 160, o);
  };
  D_.strip = function (p) {
    var o = "", tw = 40, fx = 80, fw = 180, fy = 80, fh = 22;
    o += rect(fx + fw / 2 - tw / 2, 18, tw, fy - 18, "wall") + hatch(fx + fw / 2 - tw / 2, 18, tw, fy - 18, "v") + rect(fx, fy, fw, fh, "con") + line(fx - 20, fy + fh, fx + fw + 20, fy + fh, "gnd");
    o += text(fx + fw / 2 + tw / 2 + 6, 34, "wall " + f(p.tw) + " mm, w = " + f(p.w, 0) + " kN/m", "tl");
    for (var i = 0; i <= 8; i++) { var xx = fx + fw * i / 8; o += arrow(xx, fy + fh + 26, xx, fy + fh + 3, "sp"); }
    o += text(fx + fw / 2, fy + fh + 42, "SBC " + f(p.sbc, 0) + " kN/m² → width B", "ts", "middle");
    return svg(360, 160, o);
  };
  D_.stair = function (p) {
    var n = Math.max(2, Math.min(12, Math.round(p.L * 1000 / p.T))), sx = 270 / (n * p.T), sy = Math.min(sx, 110 / (n * p.R)), x = 40, y = 140, o = "", pts = [];
    for (var i = 0; i < n; i++) { pts.push([x + i * p.T * sx, y - i * p.R * sy], [x + i * p.T * sx, y - (i + 1) * p.R * sy]); }
    pts.push([x + n * p.T * sx, y - n * p.R * sy]);
    var tt = p.t * sy, ang = Math.atan2(p.R, p.T), off = tt / Math.cos(ang);
    o += '<path class="con" d="M' + pts.map(function (q) { return f(q[0], 1) + ' ' + f(q[1], 1); }).join(' L') + ' L' + f(x + n * p.T * sx, 1) + ' ' + f(y - n * p.R * sy + off + p.R * sy, 1) + ' L' + f(x, 1) + ' ' + f(y + off, 1) + ' Z"/>';
    o += text(x + p.T * sx / 2, y - p.R * sy - 4, "T " + f(p.T), "ts", "middle") + text(x - 4, y - p.R * sy / 2, "R " + f(p.R), "ts", "end") + text(x + n * p.T * sx * 0.55, y - n * p.R * sy * 0.45 + off + 12, "waist t = " + f(p.t) + " mm", "ts");
    o += dim(x, 168, x + n * p.T * sx, "L = " + f(p.L, 2) + " m (horizontal)");
    return svg(360, 180, o);
  };
  S.has = function (id) { return !!D_[id]; };
  S.draw = function (id, p) { try { return D_[id] ? D_[id](p) : ""; } catch (e) { return ""; } };
  return S;
})();
if (typeof module !== "undefined") module.exports = SK;
