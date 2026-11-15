/* Analysis → seismic → design → detailing pipeline shared by the analysis screen, automatic design and the tests. */
var PIPE = {};
PIPE.steps = function (S, p, pd) {
  return [
    ["Solving load cases and combinations…", function () {
      S.L = MD.cases(S.m, p); S.cb = MD.combos(S.L.cases, p.method);
      S.res = FE.linear(S.m, S.L.cases, S.cb, { pdelta: pd, caseReac: true }); S.res.pd = pd; S.res.incMap = {}; S.cb.forEach(function (c) { S.res.incMap[c.name] = c.inc || 1; });
      S.se = null;
    }],
    [p.rsa ? "Modal analysis and response spectrum…" : "Seismic checks…", function () {
      if (!p.eq) return;
      S.se = SE.run(S.m, S, p);
      S.se.irr = SE.irregular(S.m, S, S.se); S.se.tc = SE.torsionCheck(S.m, S, S.se);
      if (S.se.md) { var low = S.se.md.modes.length; ["X", "Y"].forEach(function (D0, d) { var rs = S.se.rs[d]; if (rs && rs.cum < 0.9) S.res.warn.push("Modal mass participation in " + D0 + " is " + (rs.cum * 100).toFixed(1) + " % with " + low + " modes — IS 1893 cl 7.7.5.2 requires ≥ 90 %: increase the number of modes."); }); }
    }],
    ["Designing and detailing members (IS 456 / IS 800 / IS 13920)…", function () {
      S.des = MD.design(S.m, S.res, p); S.det = null;
      try { S.det = DT.run(S.m, S, p); } catch (e) { S.det = { err: e.message }; }
      S.drift = MD.drift(S.m, S.res).concat(S.se && S.se.drift ? S.se.drift : []); S.po = null;
      if (typeof BOQ !== "undefined" && S.det && !S.det.err) { try { S.boq = BOQ.run(S.m, S, p); } catch (e) { S.boq = null; } }
    }]];
};
PIPE.run = function (geo, p, pd) {
  var S = { geo: geo, p: p }; MD._pm = {};
  S.m = MD.make(geo, p);
  PIPE.steps(S, p, pd).forEach(function (s) { s[1](); });
  return S;
};
/* one-line summary of a run, stored with the project */
PIPE.summary = function (S) {
  var d = S.des || {}, nf = 0, n = 0;
  ["beams", "cols", "slabs", "walls", "steel"].forEach(function (k) { (d[k] || []).forEach(function (r) { n++; if (!r.ok) nf++; }); });
  var dt = S.det && !S.det.err ? S.det : null, dr = (S.drift || []).filter(function (q) { return q.ok === false; }).length;
  return { date: new Date().toISOString(), members: n, memberFails: nf, detailFails: dt ? dt.fails : null, driftFails: dr, steel_t: dt ? +(dt.total / 1000).toFixed(3) : null,
    concrete_m3: S.boq ? +S.boq.conc.toFixed(2) : null, cost: S.boq && S.boq.amount ? Math.round(S.boq.amount) : null, method: S.p ? S.p.method : null, zone: S.p ? S.p.zone : null };
};
if (typeof module !== "undefined") module.exports = PIPE;
