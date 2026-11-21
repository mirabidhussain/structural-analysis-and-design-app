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
      if (S.se.md) { var low = S.se.md.modes.length; ["X", "Y"].forEach(function (D0, d) { var rs = S.se.rs[d], ca = rs ? (rs.cumAll !== undefined ? rs.cumAll : rs.cum) : 1; if (rs && ca < 0.9) S.res.warn.push("Modal mass participation in " + D0 + " is " + (ca * 100).toFixed(1) + " % with " + low + " modes — IS 1893 cl 7.7.5.2 requires ≥ 90 %: increase the number of modes" + (rs.mmc ? " (the missing-mass correction adds the remaining " + (rs.mmc.pct * 100).toFixed(1) + " % statically meanwhile)." : ".")); }); }
    }],
    ["Designing and detailing members (IS 456 / IS 800 / IS 13920)…", function () {
      S.des = MD.design(S.m, S.res, p); S.det = null;
      try { S.det = DT.run(S.m, S, p); } catch (e) { S.det = { err: e.message }; }
      S.drift = MD.drift(S.m, S.res).concat(S.se && S.se.drift ? S.se.drift : []); S.po = null;
      if (typeof BOQ !== "undefined" && S.det && !S.det.err) { try { S.boq = BOQ.run(S.m, S, p); var pr = null; try { pr = typeof PDB !== "undefined" ? PDB.current() : null; } catch (e1) { pr = null; } BOQ.price(S.boq, (pr && pr.rates) || {}); } catch (e) { S.boq = null; } }
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
    concrete_m3: S.boq ? +S.boq.conc.toFixed(2) : null, cost: S.boq && S.boq.abs && S.boq.abs.total ? Math.round(S.boq.abs.total) : null, method: S.p ? S.p.method : null, zone: S.p ? S.p.zone : null };
};
if (typeof module !== "undefined") module.exports = PIPE;
/* design function of every single-member module, by module id — used by the screens, the background workers and the fix search */
var MODS = {
  beam: function (p) {
    if (!p.endL && p.support) return p.method === "wsm" ? WS.beam(p) : RCC.beam(p);   /* legacy inputs */
    var cs = RCC.beamCase(p.endL || "pinned", p.endR || "roller"), legacy = { ss: "ss", ff: "cont", cant: "cant" }[cs.id];
    if (p.method === "wsm" || p.mode === "direct") {
      if (!legacy) throw new Error((p.method === "wsm" ? "Working stress design" : "Direct Mu/Vu input") + " covers simply supported, fixed–fixed (continuous) and cantilever beams. For a " + cs.name.toLowerCase() + " use the limit state method with loads, which analyses the chosen supports.");
      var q = Object.assign({}, p, { support: legacy }); return q.method === "wsm" ? WS.beam(q) : RCC.beam(q);
    }
    return RCC.beamEnds(p);
  },
  slab: function (p) { return RCC.slabAuto(p, p.method === "wsm" ? WS.slab1 : RCC.slab1, p.method === "wsm" ? WS.slab2 : RCC.slab2); },
  slab1: function (p) { return p.method === "wsm" ? WS.slab1(p) : RCC.slab1(p); },
  slab2: function (p) { return p.method === "wsm" ? WS.slab2(p) : RCC.slab2(p); },
  column: function (p) {
    var notes = [], q = Object.assign({}, p);
    [["lecx", "lex", "x"], ["lecy", "ley", "y"]].forEach(function (k) {
      var c = p[k[0]]; if (!c || c === "manual") return;
      var e = c.split("|"), kf = B1.keff(e[0], e[1]); q[k[1]] = Math.round(kf.k * p.L * 1000) / 1000;
      notes.push("Effective length about " + k[2] + ": le" + k[2] + " = " + kf.k.toFixed(2) + " × " + p.L + " = " + q[k[1]] + " m — " + kf.why + " (IS 456 Table 28)");
    });
    var r = q.method === "wsm" ? WS.column(q) : RCC.column(q);
    notes.reverse().forEach(function (t) { r.items.unshift({ k: "n", t: t }); });
    return r;
  },
  footing: function (p) { return RCC.footing(p); }, pile: function (p) { return FD.pile(p); }, raft: function (p) { return FD.raft(p); },
  strip: function (p) { return RCC.strip(p); }, stair: function (p) { return RCC.stair(p); }, truss: function (p) { return TR.design(p); },
  purlin: function (p) { return ST.purlin(p); }, tension: function (p) { return ST.tension(p); }, comp: function (p) {
    var q = Object.assign({}, p), kf = null;
    if (p.Kc && p.Kc !== "manual") { var e = p.Kc.split("|"); if (e[1] === "partial") throw new Error("The 1.5 L sway case is from IS 456 only — pick another end condition or enter K"); kf = B1.keff(e[0], e[1]); q.K = kf.k; }
    var r = ST.compression(q);
    if (kf) r.items.unshift({ k: "n", t: "Effective length factor K = " + kf.k.toFixed(2) + " — " + kf.why + " (IS 800 Table 11)" });
    return r;
  },
  sbeam: function (p) {
    var r = ST.beam(p), t = p.ltb && p.ltb !== "manual" && B1.T15[p.ltb];
    if (t && !p.lat && p.support !== "cant") r.items.unshift({ k: "n", t: "Lateral-torsional buckling length LLT = " + t[p.destab ? 1 : 0].toFixed(2) + " L" + (t[2] ? " + 2D" : "") + " — " + t[3] + (p.destab ? ", destabilising load" : ", normal load") + " (IS 800 Table 15)" });
    else if (t && p.support === "cant") r.items.unshift({ k: "n", t: "IS 800 Table 15 applies to simply supported beams; for the cantilever the entered unbraced length is used (see IS 800 Table 16)." });
    return r;
  }, bolts: function (p) { return ST.bolts(p); }, roof: function (p) { return LD.roofReport(p); }, seismic: function (p) { return LD.seismic(p); }
};
