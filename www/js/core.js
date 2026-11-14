/* Shared helpers: interpolation, formatting and a report builder used by every module. */
var U = {};
U.interp = function (xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (var i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
};
U.f = function (v, n) {
  if (v === null || v === undefined || isNaN(v)) return "-";
  n = (n === undefined) ? 2 : n;
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: n, maximumFractionDigits: n });
};
U.ceilTo = function (v, step) { return Math.ceil(v / step - 1e-9) * step; };
U.floorTo = function (v, step) { return Math.floor(v / step + 1e-9) * step; };
U.gradeKey = function (tbl, fck) {
  var ks = Object.keys(tbl).map(Number).sort(function (a, b) { return a - b; });
  var k = ks[0];
  ks.forEach(function (g) { if (fck >= g) k = g; });
  return k;
};
/* pick bars for a required area: returns {n, dia, area, text} - lowest count >= 2 with sensible dia */
U.pickBars = function (Ast, dias, minN, maxN) {
  minN = minN || 2; maxN = maxN || 8;
  var best = null;
  dias.forEach(function (d) {
    var a = D.barArea(d), n = Math.max(minN, Math.ceil(Ast / a - 1e-9));
    if (n > maxN) return;
    var area = n * a, score = area + 15 * n;      /* prefer fewer, larger bars */
    if (!best || score < best.score) best = { n: n, dia: d, area: area, score: score };
  });
  if (!best) { var d = dias[dias.length - 1]; var n = Math.ceil(Ast / D.barArea(d)); best = { n: n, dia: d, area: n * D.barArea(d) }; }
  best.text = best.n + " nos " + best.dia + " mm φ (" + U.f(best.area, 0) + " mm²)";
  return best;
};
/* bar spacing for slabs: required Ast per metre -> spacing (mm), rounded down to 5 mm, within max */
U.spacing = function (Ast, dia, smax) {
  var s = 1000 * D.barArea(dia) / Ast;
  s = Math.min(s, smax);
  s = U.floorTo(s, 5);
  return { dia: dia, s: s, area: 1000 * D.barArea(dia) / s, text: dia + " mm φ @ " + s + " mm c/c (" + U.f(1000 * D.barArea(dia) / s, 0) + " mm²/m)" };
};

function Rep(title, code) {
  this.title = title; this.code = code || ""; this.items = []; this.checks = []; this.summary = []; this.svg = "";
}
Rep.prototype.h = function (t) { this.items.push({ k: "h", t: t }); return this; };
Rep.prototype.row = function (label, value, unit, ref) { this.items.push({ k: "r", l: label, v: value, u: unit || "", ref: ref || "" }); return this; };
Rep.prototype.eq = function (text, ref) { this.items.push({ k: "e", t: text, ref: ref || "" }); return this; };
Rep.prototype.note = function (t) { this.items.push({ k: "n", t: t }); return this; };
Rep.prototype.check = function (label, ok, detail, ref) {
  var c = { l: label, ok: !!ok, d: detail || "", ref: ref || "" };
  this.checks.push(c); this.items.push({ k: "c", c: c }); return this;
};
Rep.prototype.sum = function (label, value) { this.summary.push([label, value]); return this; };
Rep.prototype.table = function (head, rows) { this.items.push({ k: "t", head: head, rows: rows }); return this; };
Rep.prototype.ok = function () { return this.checks.every(function (c) { return c.ok; }); };
Rep.prototype.fail = function (msg) { this.items.push({ k: "x", t: msg }); this.checks.push({ l: msg, ok: false, d: "", ref: "" }); return this; };

if (typeof module !== "undefined") { module.exports = { U: U, Rep: Rep }; }
