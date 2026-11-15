/* Automatic design & detailing of RCC frames: analyse → design → detail → enlarge the members that fail
   (column design / steel > 4 %, strong column–weak beam, joint shear, joint depth ≥ 20φ, storey drift; beam design and bar fit)
   storey by storey → repeat until every check passes or the size limits are reached. Sizes are written as section rules
   ("columns storey 2 = 450x450", "beams storey 2 = 300x500") so the user can see and edit them. */
var AUTO = {};
AUTO.STEP = 50; AUTO.MAXCOL = 900; AUTO.MAXBEAM = 900; AUTO.MAXIT = 8;
/* current sizes per storey (largest member of each kind) */
AUTO.sizes = function (m) {
  var lv = MD.floorLevels(m), c = {}, b = {};
  function st(e) { var z = Math.max(m.nodes[e.n1].z, m.nodes[e.n2].z), i = -1, best = 1e9; lv.forEach(function (l, j) { if (Math.abs(l - z) < best) { best = Math.abs(l - z); i = j; } }); return i; }
  m.frames.forEach(function (e) {
    if (e.sec.kind !== "rcc") return; var i = st(e), o = e.type === "column" ? c : e.type === "beam" ? b : null; if (!o) return;
    if (!o[i] || e.sec.b * e.sec.D > o[i].b * o[i].D) o[i] = { b: e.sec.b, D: e.sec.D };
  });
  return { col: c, beam: b, n: lv.length - 1 };
};
AUTO.rules = function (sz) {
  var out = [];
  Object.keys(sz.col).sort(function (a, b) { return a - b; }).forEach(function (i) { out.push("columns storey " + i + " = " + sz.col[i].b + "x" + sz.col[i].D); });
  Object.keys(sz.beam).sort(function (a, b) { return a - b; }).forEach(function (i) { out.push("beams storey " + i + " = " + sz.beam[i].b + "x" + sz.beam[i].D); });
  return out.join("\n");
};
/* what failed, by storey */
AUTO.failures = function (S) {
  var m = S.m, lv = MD.floorLevels(m), f = { col: {}, beam: {}, why: [], walls: 0, other: 0 };
  function lev(z) { var i = -1, best = 1e9; lv.forEach(function (l, j) { if (Math.abs(l - z) < best) { best = Math.abs(l - z); i = j; } }); return i; }
  function st(k) { var e = m.frames[k]; return lev(Math.max(m.nodes[e.n1].z, m.nodes[e.n2].z)); }
  function add(o, i, why) { if (i < 1) return; o[i] = o[i] || []; if (o[i].indexOf(why) < 0) o[i].push(why); }
  S.des.cols.forEach(function (r) { if (!r.ok) add(f.col, st(r.k), "column design"); });
  S.des.beams.forEach(function (r) { if (!r.ok) add(f.beam, st(r.k), "beam design"); });
  var dt = S.det && !S.det.err ? S.det : null;
  if (dt) {
    dt.cols.forEach(function (c) { c.st.forEach(function (s) { if (s.pct > 4 + 1e-6 || s.fail) add(f.col, lev(s.z1 / 1000), "steel > 4 %"); }); c.checks.forEach(function (q) { if (!q.ok && q.st !== undefined) add(f.col, lev(c.st[q.st].z1 / 1000), q.t.split(" ").slice(0, 3).join(" ")); }); });
    dt.beams.forEach(function (bl) { if (bl.msg.some(function (t) { return /second layer/.test(t); })) add(f.beam, lev(bl.z), "bars in two layers"); bl.checks.forEach(function (q) { if (!q.ok) add(f.beam, lev(bl.z), q.t.split(" ").slice(0, 3).join(" ")); }); });
    dt.scwb.forEach(function (q) { if (!q.ok) { var i = lev(q.z); add(f.col, i, "strong column–weak beam"); add(f.col, i + 1, "strong column–weak beam"); } });
    dt.joints.forEach(function (q) { var i = lev(q.z); if (!q.ok) { add(f.col, i, "joint shear"); if (i + 1 < lv.length) add(f.col, i + 1, "joint shear"); } if (!q.anch) add(f.col, i, "joint depth < 20φ"); });
    dt.walls.forEach(function (w) { w.checks.forEach(function (q) { if (!q.ok) f.walls++; }); });
    dt.foot.forEach(function (ft) { ft.checks.forEach(function (q) { if (!q.ok) f.other++; }); });
    if (dt.mat) dt.mat.checks.forEach(function (q) { if (!q.ok) f.other++; });
  }
  (S.drift || []).forEach(function (q) { if (q.ok === false) for (var i = 1; i < lv.length; i++) add(f.col, i, "storey drift"); });
  f.n = Object.keys(f.col).length + Object.keys(f.beam).length;
  return f;
};
/* grow the failing storeys; returns false when nothing could be enlarged */
AUTO.grow = function (sz, fl) {
  var any = false, s = AUTO.STEP;
  Object.keys(fl.col).forEach(function (i) { var c = sz.col[i]; if (!c) return; if (Math.max(c.b, c.D) + s <= AUTO.MAXCOL) { c.b += s; c.D += s; any = true; } });
  Object.keys(fl.beam).forEach(function (i) { var b = sz.beam[i]; if (!b) return; if (b.D + s <= AUTO.MAXBEAM) { b.D += s; if (b.b < 0.3 * b.D) b.b = Math.ceil(0.3 * b.D / 25) * 25; any = true; } });
  /* keep columns at least as large going down */
  var ks = Object.keys(sz.col).map(Number).sort(function (a, b) { return b - a; });
  for (var j = 1; j < ks.length; j++) { var up = sz.col[ks[j - 1]], lo = sz.col[ks[j]]; if (lo.b < up.b) { lo.b = up.b; any = true; } if (lo.D < up.D) { lo.D = up.D; any = true; } }
  return any;
};
/* run the loop; step(i, info) is called after every iteration; async when a scheduler is given */
AUTO.run = function (geo, p0, opt) {
  opt = opt || {};
  var p = Object.assign({}, p0), m0 = MD.make(geo, p);
  if (!m0.frames.some(function (e) { return e.sec.kind === "rcc"; })) throw new Error("Automatic design is for RCC frames");
  var sz = AUTO.sizes(m0), log = [], S = null, it = 0, keep = MD.rules(p0.secOver || "").filter(function (r) { return !r.err && !/stor(e)?y/i.test(r.sel); }).map(function (r) { return r.sel + " = " + r.val; });
  function once() {
    p.secOver = AUTO.rules(sz) + (keep.length ? "\n" + keep.join("\n") : "");
    S = PIPE.run(geo, p, opt.pdelta);
    var fl = AUTO.failures(S);
    log.push({ it: it + 1, rules: AUTO.rules(sz), fails: fl, steel: S.det && !S.det.err ? S.det.total : 0, conc: S.boq ? S.boq.conc : null });
    return fl;
  }
  function finish(fl) { return { S: S, log: log, rules: p.secOver, ok: fl.n === 0, fails: fl, p: p, kept: keep }; }
  if (!opt.async) {
    var fl;
    for (it = 0; it < AUTO.MAXIT; it++) { fl = once(); if (opt.step) opt.step(it, log[it]); if (!fl.n || !AUTO.grow(sz, fl)) break; }
    return finish(fl);
  }
  return new Promise(function (res, rej) {
    (function next() {
      setTimeout(function () {
        try {
          var fl2 = once(); if (opt.step) opt.step(it, log[it]);
          it++;
          if (!fl2.n || it >= AUTO.MAXIT || !AUTO.grow(sz, fl2)) return res(finish(fl2));
          next();
        } catch (e) { rej(e); }
      }, 30);
    })();
  });
};
if (typeof module !== "undefined") module.exports = AUTO;
