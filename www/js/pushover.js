/* Nonlinear static (pushover) analysis - event-to-event lumped plasticity.
   Material nonlinearity: elastic-perfectly-plastic flexural hinges at member ends (major & minor axis) with
   axial-moment interaction updated at every event; axial yield / buckling of braces.
   Geometric nonlinearity: P-Delta (geometric stiffness from current axial forces) - small-displacement theory. */
var PO = {};

/* hinge acceptance criteria (plastic rotation, rad) - indicative, after FEMA 356 / ASCE 41 */
PO.limits = function (e) {
  if (e.sec.kind === "steel") { var thy = e.sec.Mpz0 * e.L / (6 * e.sec.E * e.sec.Iz); return { IO: thy, LS: 6 * thy, CP: 8 * thy }; }
  return e.type === "column" ? { IO: 0.005, LS: 0.015, CP: 0.020 } : { IO: 0.010, LS: 0.020, CP: 0.025 };
};
PO.level = function (th, lim) { th = Math.abs(th); return th <= 1e-12 ? "Elastic" : th <= lim.IO ? "B-IO" : th <= lim.LS ? "IO-LS" : th <= lim.CP ? "LS-CP" : "> CP"; };

/* opt: {gravity: lc (load case object), pattern: [{n, f[6]}], ctrl: node, dir: 0|1, dmax (m), pdelta, maxEvents} */
PO.start = function (m, opt) {
  var info = FE.prepare(m), nF = m.frames.length;
  var baseRel = m.frames.map(function (e) { return (e.rel || []).slice(); });
  m.frames.forEach(function (e) { var A = m.nodes[e.n1], B = m.nodes[e.n2]; e.L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z); });
  var hinges = [], events = [], curve = [[0, 0]], warn = [];
  /* gravity (elastic) */
  var asm = FE.assemble(m, null);
  if (FE.factor(asm.A, m._maxa, m._neq) >= 0) throw new Error("Structure unstable under gravity");
  var lv = FE.loadVector(m, opt.gravity, null);
  var Utot = FE.expand(m, FE.backsub(asm.A, m._maxa, m._neq, Float64Array.from(lv.F)));
  var Ftot = m.frames.map(function (e, k) { return FE.frameForces(m, k, Utot, lv.qeq[k], 0).f; });
  var d0 = Utot[6 * opt.ctrl + opt.dir], dcur = 0, lam = 0;
  var Ppat = new Float64Array(6 * m.nodes.length), Vunit = 0;
  opt.pattern.forEach(function (p) { for (var t = 0; t < 6; t++) Ppat[6 * p.n + t] += p.f[t]; Vunit += p.f[opt.dir]; });
  var Pvec = new Float64Array(m._neq); for (var i = 0; i < Ppat.length; i++) if (m._eq[i] >= 0) Pvec[m._eq[i]] += Ppat[i];
  function axial(k) { return -Ftot[k][0]; }                 /* compression + */
  function cap(e, k, axis) {
    var N = axial(k);
    return axis === "z" ? e.sec.Mpz(N) : e.sec.Mpy(N);
  }
  var cand = [];
  m.frames.forEach(function (e, k) {
    if (e.type === "brace") { cand.push({ k: k, end: "i", axis: "a", dof: 0 }); return; }
    ["i", "j"].forEach(function (end) {
      cand.push({ k: k, end: end, axis: "z", dof: end === "i" ? 5 : 11 });
      if (!m.twoD) cand.push({ k: k, end: end, axis: "y", dof: end === "i" ? 4 : 10 });
    });
  });
  var formed = {};
  /* gravity overstress */
  cand.forEach(function (c) {
    var e = m.frames[c.k]; if (c.axis === "a") return;
    if (Math.abs(Ftot[c.k][c.dof]) > cap(e, c.k, c.axis) * 1.0001) warn.push("Member " + (c.k + 1) + " end " + c.end + " exceeds Mp under gravity alone");
  });
  var stop = "event limit", maxEv = opt.maxEvents || 60, ev = 0, done = false;
  function step() {
    if (done) return true;
    if (ev >= maxEv) { done = true; return true; }
    ev++;
    m.frames.forEach(function (e, k) {
      e.rel = baseRel[k].slice();
      hinges.forEach(function (h) { if (h.k === k && e.rel.indexOf(h.dof) < 0) e.rel.push(h.dof); });
      if (e.type === "brace" && formed[k + "a"]) e.rel = [0];
    });
    var Nfr = opt.pdelta ? m.frames.map(function (e, k) { return Ftot[k][6]; }) : null;   /* end-j axial = N (tension +) */
    var K = FE.assemble(m, Nfr);
    var bad = FE.factor(K.A, m._maxa, m._neq);
    if (bad >= 0) { stop = "mechanism / instability formed"; done = true; return true; }
    var dU = FE.expand(m, FE.backsub(K.A, m._maxa, m._neq, Float64Array.from(Pvec)));
    var dd = dU[6 * opt.ctrl + opt.dir];
    if (!(dd > 1e-12)) { stop = "negative stiffness (strength degradation / P-Delta)"; done = true; return true; }
    var dF = m.frames.map(function (e, k) { return FE.frameForces(m, k, dU, null, Nfr ? Nfr[k] : 0); });
    var s = (opt.dmax - dcur) / dd, who = null;
    cand.forEach(function (c) {
      if (formed[c.k + c.end + c.axis]) return;
      var e = m.frames[c.k], M = Ftot[c.k][c.dof], dM = dF[c.k].f[c.dof];
      if (Math.abs(dM) < 1e-12) return;
      var Mp;
      if (c.axis === "a") {
        var N = -Ftot[c.k][0], dN = -dM;
        Mp = dN > 0 ? e.sec.Pc : e.sec.Pt;                       /* compression buckling / tension yield */
        var si = (Math.sign(dN) * Mp - N) / dN;
        if (si >= 0 && si < s) { s = si; who = c; }
        return;
      }
      Mp = cap(e, c.k, c.axis);
      var sj = (Math.sign(dM) * Mp - M) / dM;
      if (sj < 0) sj = 0;
      if (sj < s) { s = sj; who = c; }
    });
    /* hinge rotation increments for existing hinges */
    hinges.forEach(function (h) {
      var d = dF[h.k].d, c = d.cond, ri = d.rel.indexOf(h.dof);
      if (!c.X || ri < 0) return;
      var ul = dF[h.k].ul, ur = 0; for (var j = 0; j < 12; j++) ur -= c.X[ri][j] * (d.rel.indexOf(j) >= 0 ? 0 : ul[j]);
      h.rot += s * (ul[h.dof] - ur);
    });
    for (i = 0; i < Utot.length; i++) Utot[i] += s * dU[i];
    Ftot.forEach(function (f, k) { for (var j = 0; j < 12; j++) f[j] += s * dF[k].f[j]; });
    lam += s; dcur += s * dd;
    curve.push([dcur, lam * Vunit]);
    if (!who) { stop = "target displacement reached"; done = true; return true; }
    formed[who.k + who.end + who.axis] = true;
    var h = { k: who.k, end: who.end, axis: who.axis, dof: who.dof, rot: 0, ev: ev, V: lam * Vunit, d: dcur };
    hinges.push(h);
    events.push(h);
    return false;
  }
  function finish() {
  m.frames.forEach(function (e, k) { e.rel = baseRel[k]; });
  hinges.forEach(function (h) { var e = m.frames[h.k]; if (h.axis !== "a") { h.lim = PO.limits(e); h.state = PO.level(h.rot, h.lim); } else h.state = "Axial yield/buckle"; });
  var Vmax = curve.reduce(function (a, p) { return Math.max(a, p[1]); }, 0);
  var first = events.length ? events[0] : null;
  return { curve: curve, events: events, hinges: hinges, stop: stop, warn: warn, U: Utot, F: Ftot, Vmax: Vmax,
    dy: first ? first.d : null, Vy: first ? first.V : null, du: dcur, mu: first && first.d > 0 ? dcur / first.d : null, d0: d0, info: info };
  }
  return { step: step, finish: finish, progress: function () { return { ev: ev, max: maxEv, d: dcur, V: lam * Vunit }; } };
};
PO.run = function (m, opt) { var s = PO.start(m, opt); while (!s.step()); return s.finish(); };

/* lateral load pattern from nodal seismic weights: IS 1893 parabolic (W h^2) or uniform (W) */
PO.pattern = function (m, weights, dir, kind) {
  var zmin = Infinity; m.nodes.forEach(function (n) { zmin = Math.min(zmin, n.z); });
  var out = [], tot = 0;
  weights.forEach(function (w, i) {
    if (!(w > 0)) return; var h = m.nodes[i].z - zmin; if (h <= 1e-6) return;
    var v = kind === "uniform" ? w : w * h * h; tot += v; out.push({ n: i, v: v });
  });
  return out.map(function (o) { var f = [0, 0, 0, 0, 0, 0]; f[dir] = o.v / tot; return { n: o.n, f: f }; });
};

if (typeof module !== "undefined") module.exports = PO;
