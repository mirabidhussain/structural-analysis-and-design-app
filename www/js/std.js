/* STAAD.Pro input (.std) import: geometry, sections, materials, supports, releases, primary load cases (self weight, joint,
   member, element, floor, IS 1893 seismic and wind loads), repeat loads, combinations and concrete design parameters.
   STAAD's global Y is vertical unless SET Z UP; the app's Z is vertical, so (X, Y, Z)STAAD → (X, −Z, Y)app — a proper
   rotation, so member and moment senses are kept. Units are converted to kN and m.
   Also: STD.audit — checks of the STAAD file itself (cancelling wind, seismic weight, combinations, double-counted
   self weight, plates) — and STD.cases / STD.combos, which turn the file's loads into the app's load cases. */
var STD = (function () {
  var S = {};
  var LEN = { METER: 1, METERS: 1, METRE: 1, M: 1, MMS: 0.001, MM: 0.001, MILLIMETER: 0.001, CM: 0.01, CMS: 0.01, CENTIMETER: 0.01, DME: 0.1, DECIMETER: 0.1,
    KM: 1000, FEET: 0.3048, FOOT: 0.3048, FT: 0.3048, FEE: 0.3048, INCHES: 0.0254, INCH: 0.0254, IN: 0.0254, INC: 0.0254 };
  var FRC = { KN: 1, KNS: 1, KILONEWTON: 1, NEWTON: 0.001, NEWTONS: 0.001, N: 0.001, NEW: 0.001, MNS: 1000, MN: 1000, KIP: 4.4482216, KIPS: 4.4482216,
    POUND: 0.0044482216, LBS: 0.0044482216, LB: 0.0044482216, KG: 0.00980665, KGS: 0.00980665, KILOGRAM: 0.00980665, MTON: 9.80665, MTONS: 9.80665, DNS: 0.01, DEN: 0.01 };
  var MATDEF = { CONCRETE: { E: 2.17185e7, nu: 0.17, dens: 23.5616 }, STEEL: { E: 2.05e8, nu: 0.3, dens: 76.8195 }, ALUMINUM: { E: 6.89476e7, nu: 0.33, dens: 26.6018 } };
  function isNum(t) { return t !== undefined && /^[-+]?(\d+\.?\d*|\.\d+)(E[-+]?\d+)?$/i.test(t); }

  /* ---------- list "1 TO 30 BY 2 45 ALL" → numbers; returns {ids, i (next token)} ---------- */
  function readList(t, i, all) {
    var ids = [];
    if (t[i] === "ALL") return { ids: all ? all() : [], i: i + 1, all: true };
    if (/^(MEMB|MEMBER|JOINT|JOI|ELEM|ELEMENT|LIST|LIS)$/.test(t[i] || "")) i++;
    if (t[i] === "ALL") return { ids: all ? all() : [], i: i + 1, all: true };
    while (i < t.length && isNum(t[i]) && /^\d+$/.test(t[i])) {
      var a = +t[i]; i++;
      if (t[i] === "TO" && isNum(t[i + 1])) {
        var b = +t[i + 1], st = 1; i += 2;
        if (t[i] === "BY" && isNum(t[i + 1])) { st = Math.abs(+t[i + 1]) || 1; i += 2; }
        for (var k = a; k <= b; k += st) ids.push(k);
      } else ids.push(a);
    }
    return { ids: ids, i: i };
  }

  /* ---------- parse ---------- */
  S.parse = function (text) {
    var M = { type: "SPACE", zup: false, title: "", joints: {}, members: {}, elems: {}, thick: {}, surfs: {}, sthick: {}, props: {}, mats: {}, matOf: {}, E: {}, nu: {}, dens: {}, beta: {},
      sup: {}, spr: {}, rel: {}, truss: {}, offsets: [], loads: [], combos: [], def1893: null, wind: {}, design: { list: null, fc: null, fy: null, ran: false, minsec: null, cover: {} },
      warn: [], unknown: {}, loadList: null };
    var Lf = 1, Ff = 1, mode = "", cur = null, curWind = null, d93 = null, d93sub = "", jointOrder = [], lastJ = [], memOrder = [];
    function allMem() { return Object.keys(M.members).map(Number).concat(Object.keys(M.elems).map(Number)); }
    function allJ() { return Object.keys(M.joints).map(Number); }
    function W(msg) { if (M.warn.indexOf(msg) < 0 && M.warn.length < 60) M.warn.push(msg); }
    /* lines: comments, continuation "-", then ";" splits */
    var raw = String(text || "").replace(/\r/g, "").split("\n"), lines = [], buf = "";
    raw.forEach(function (ln) {
      var s = ln.replace(/\t/g, " ");
      if (/^\s*\*/.test(s)) { if (!M.title && /JOB NAME|^\s*\*\s*\S/.test(s)) {} return; }
      s = s.replace(/\s+$/, "");
      if (/\s-$/.test(s) || /^-$/.test(s.trim())) { buf += s.replace(/-$/, "") + " "; return; }
      buf += s; lines.push(buf); buf = "";
    });
    if (buf) lines.push(buf);
    var st = [];
    lines.forEach(function (ln) { ln.split(";").forEach(function (q) { q = q.trim(); if (q) st.push(q); }); });
    for (var si = 0; si < st.length; si++) {
      var line = st[si], U = line.toUpperCase(), t = U.split(/[\s,]+/).filter(Boolean), k0 = t[0] || "", k1 = t[1] || "";
      /* ---- global commands ---- */
      if (k0 === "STAAD") { M.type = k1 || "SPACE"; M.title = line.slice(6 + k1.length).trim(); mode = ""; continue; }
      if (k0 === "SET" && k1 === "Z" && t[2] === "UP") { M.zup = true; continue; }
      if (k0 === "SET") continue;
      if (k0 === "UNIT" || k0 === "UNI") { t.slice(1).forEach(function (w) { if (LEN[w] !== undefined) Lf = LEN[w]; else if (FRC[w] !== undefined) Ff = FRC[w]; }); continue; }
      if (k0 === "START" && k1 === "JOB") { mode = "job"; continue; }
      if (k0 === "END" && k1 === "JOB") { mode = ""; continue; }
      if (mode === "job") { if (k0 === "JOB" && k1 === "NAME") M.title = line.replace(/^\s*JOB\s+NAME\s*/i, ""); continue; }
      if (k0 === "FINISH") break;
      if (k0 === "INPUT" || k0 === "PAGE" || k0 === "PRINT") continue;
      if (k0 === "PERFORM" || k0 === "PDELTA" || k0 === "CHANGE") { mode = ""; cur = null; if (k0 === "PDELTA") W("PDELTA analysis in the file — run 'Linear + P-Delta' in the app to match"); continue; }
      if (k0 === "JOINT" && /^COOR/.test(k1)) { mode = "joint"; continue; }
      if (k0 === "MEMBER" && /^INCI/.test(k1)) { mode = "member"; continue; }
      if (k0 === "ELEMENT" && /^INCI/.test(k1)) { mode = "elem"; if (t[2] && t[2] !== "SHELL") W("ELEMENT INCIDENCES " + t[2] + " read as plates"); continue; }
      if (k0 === "ELEMENT" && /^PROP/.test(k1)) { mode = "eprop"; continue; }
      if (k0 === "SURFACE" && /^INCI/.test(k1)) { mode = "surf"; continue; }
      if (k0 === "SURFACE" && /^PROP/.test(k1)) { mode = "sprop"; continue; }
      if (k0 === "SURFACE" && /^CONS/.test(k1)) { mode = "skip"; continue; }
      if (k0 === "SET" && k1 === "DIVISION") continue;
      if (k0 === "MEMBER" && /^PROP/.test(k1)) { mode = "mprop"; continue; }
      if (k0 === "DEFINE" && /^MAT/.test(k1)) { mode = "defmat"; continue; }
      if (k0 === "END" && k1 === "DEFINE") { mode = ""; continue; }
      if (k0 === "CONSTANTS" || k0 === "CONSTANT") { mode = "const"; continue; }
      if (k0 === "SUPPORTS" || k0 === "SUPPORT") { mode = "sup"; continue; }
      if (k0 === "MEMBER" && /^REL/.test(k1)) { mode = "rel"; continue; }
      if (k0 === "MEMBER" && k1 === "TRUSS") { mode = "truss"; if (t.length > 2) { readList(t, 2, allMem).ids.forEach(function (m) { M.truss[m] = 1; }); } continue; }
      if (k0 === "MEMBER" && /^OFFS/.test(k1)) { mode = "offset"; continue; }
      if (k0 === "MEMBER" && /^(TENS|COMP|CABLE)/.test(k1)) { mode = "skip"; W("MEMBER " + k1 + " ignored — the app runs linear analysis (members act both ways)"); continue; }
      if (k0 === "DEFINE" && k1 === "1893") { mode = "d93"; d93 = M.def1893 = { zone: 0.1, rf: 5, I: 1, ss: 2, st: 1, dm: 0.05, px: 0, pz: 0, dt: 0, self: 0, joint: [], member: [], elem: [], floor: [] }; d93sub = "";
        readKV(t, 3); continue; }
      if (k0 === "DEFINE" && k1 === "WIND") { mode = "dwind"; curWind = null; continue; }
      if (k0 === "DEFINE" && /^(REF|PMEMBER|ENV|IMPERFECTION|TIME|SPECTRA|MOVING|SNOW|UBC|IBC|AISC)/.test(k1)) { mode = "skip"; W("DEFINE " + k1 + " not used by the app"); continue; }
      if (k0 === "DEFINE") { mode = "skip"; W("DEFINE " + k1 + " not used by the app"); continue; }
      if ((k0 === "LOAD" || k0 === "LOADING") && (k1 === "COMB" || k1 === "COMBINATION")) {
        cur = { id: +t[2], title: line.replace(/^\s*\S+\s+\S+\s+\S+\s*/, "").trim(), f: {}, srss: false }; if (t[3] === "SRSS" || t[3] === "ABS") { cur.srss = true; W("LOAD COMBINATION " + t[2] + " " + t[3] + " read as an algebraic sum"); }
        M.combos.push(cur); mode = "comb"; continue; }
      if (k0 === "LOAD" && k1 === "LIST") { M.loadList = t[2] === "ALL" ? null : readList(t, 2, null).ids; continue; }
      if ((k0 === "LOAD" || k0 === "LOADING") && isNum(k1)) {
        var lt = "", title = "", ix = 2;
        if (t[ix] === "LOADTYPE") { lt = (t[ix + 1] || "").toLowerCase(); ix += 2; if (t[ix] === "REDUCIBLE") ix++; }
        var mt = line.match(/TITLE\s+(.*)$/i); title = mt ? mt[1].trim() : t[ix] && t[ix] !== "TITLE" ? line.split(/\s+/).slice(ix).join(" ") : "";
        cur = { id: +k1, type: lt, title: title, self: [], joint: [], member: [], elem: [], floor: [], eq: [], wind: [], repeat: [], other: [] };
        M.loads.push(cur); mode = "load"; continue; }
      if (k0 === "START" && /^CONC/.test(k1)) { mode = "cdesign"; M.design.ran = true; continue; }
      if (k0 === "END" && /^CONC/.test(k1)) { mode = ""; continue; }
      if (k0 === "START" && /^STEEL/.test(k1)) { mode = "skip"; continue; }
      if (k0 === "PARAMETER" || k0 === "CODE" && mode !== "cdesign") { mode = "skip"; continue; }
      /* ---- block contents ---- */
      if (mode === "joint") {
        if (k0 === "REPEAT") {
          var allR = k1 === "ALL", ri = allR ? 2 : 1, nrep = +t[ri], incs = t.slice(ri + 1).map(Number), base = allR ? jointOrder.slice() : lastJ.slice(), jinc = Math.max.apply(null, allJ());
          var newIds = [];
          for (var r = 1; r <= nrep; r++) {
            var off = incs.length >= 3 * r ? [incs[3 * (r - 1)], incs[3 * (r - 1) + 1], incs[3 * (r - 1) + 2]] : [incs[0] * r, incs[1] * r, incs[2] * r];
            if (incs.length >= 3 * r && r > 1) { var prev = incs.slice(0, 3 * r); off = [0, 0, 0]; for (var q = 0; q < r; q++) { off[0] += prev[3 * q]; off[1] += prev[3 * q + 1]; off[2] += prev[3 * q + 2]; } }
            base.forEach(function (j) { var id = j + r * jinc, p0 = M.joints[j]; M.joints[id] = [p0[0] + (off[0] || 0) * Lf, p0[1] + (off[1] || 0) * Lf, p0[2] + (off[2] || 0) * Lf]; jointOrder.push(id); newIds.push(id); });
          }
          W("Joint REPEAT generation used — check the joint numbers against the STAAD file"); lastJ = newIds; continue;
        }
        var nums = t.map(Number);
        if (t.length >= 8 && nums.every(isFinite)) {
          var i1 = nums[0], p1 = nums.slice(1, 4), i2 = nums[4], p2 = nums.slice(5, 8), inc = nums[8] || 1, nseg = Math.round((i2 - i1) / inc);
          lastJ = [];
          for (var g = 0; g <= nseg; g++) { var id2 = i1 + g * inc, f = nseg ? g / nseg : 0; M.joints[id2] = [0, 1, 2].map(function (d) { return (p1[d] + (p2[d] - p1[d]) * f) * Lf; }); jointOrder.push(id2); lastJ.push(id2); }
        } else if (t.length >= 4 && nums.slice(0, 4).every(isFinite)) { M.joints[nums[0]] = [nums[1] * Lf, nums[2] * Lf, nums[3] * Lf]; jointOrder.push(nums[0]); lastJ = [nums[0]]; }
        else if (t.length === 3 && M.type === "PLANE" && nums.every(isFinite)) { M.joints[nums[0]] = [nums[1] * Lf, nums[2] * Lf, 0]; jointOrder.push(nums[0]); lastJ = [nums[0]]; }
        else W("Joint line not understood: " + line);
        continue;
      }
      if (mode === "member") {
        var nm = t.map(Number);
        if (k0 === "REPEAT") { W("MEMBER INCIDENCES REPEAT not supported — write the members out in STAAD (Edit → Input File) and import again"); continue; }
        if (nm.length >= 3 && nm.slice(0, 3).every(isFinite)) {
          if (nm.length >= 4 && isFinite(nm[3])) {
            var m2 = nm[3], minc = nm[4] || 1, jinc2 = nm[5] || 1;
            for (var mm = nm[0], kk = 0; mm <= m2; mm += minc, kk++) { M.members[mm] = [nm[1] + kk * jinc2, nm[2] + kk * jinc2]; memOrder.push(mm); }
          } else { M.members[nm[0]] = [nm[1], nm[2]]; memOrder.push(nm[0]); }
        } else W("Member line not understood: " + line);
        continue;
      }
      if (mode === "elem") {
        var ti = t.indexOf("TO"), en = (ti > 0 ? t.slice(0, ti) : t).map(Number);
        if (en.length >= 4 && en.every(isFinite)) {
          var nodes4 = en.slice(1, 5);
          if (ti > 0) { var e2 = +t[ti + 1], einc = +(t[ti + 2] || 1), jn = +(t[ti + 3] || 1); for (var ee = en[0], kq = 0; ee <= e2; ee += einc, kq++) M.elems[ee] = nodes4.map(function (v) { return v + kq * jn; }); }
          else M.elems[en[0]] = nodes4;
        } else W("Element line not understood: " + line);
        continue;
      }
      if (mode === "surf") {
        var isf = t.indexOf("SURFACE"), sj = (isf > 0 ? t.slice(0, isf) : t).map(Number);
        if (isf > 0 && sj.length >= 3 && sj.every(isFinite)) { M.surfs[+t[isf + 1]] = sj; if (sj.length > 4) W("Surface " + t[isf + 1] + " has " + sj.length + " corners — only 3- and 4-sided surfaces are imported"); }
        else W("Surface line not understood: " + line);
        continue;
      }
      if (mode === "sprop") {
        var lsp = readList(t, 0, function () { return Object.keys(M.surfs).map(Number); }), tks = t[lsp.i] || "";
        if (/^TH/.test(tks) && isNum(t[lsp.i + 1])) { var ths = +t[lsp.i + 1] * Lf; lsp.ids.forEach(function (e) { M.sthick[e] = ths; }); }
        continue;
      }
      if (mode === "eprop") {
        var lr = readList(t, 0, function () { return Object.keys(M.elems).map(Number); }), tk = t[lr.i] || "";
        if (/^TH/.test(tk) && isNum(t[lr.i + 1])) { var th = +t[lr.i + 1] * Lf; lr.ids.forEach(function (e) { M.thick[e] = th; }); }
        else W("Element property not understood: " + line);
        continue;
      }
      if (mode === "mprop") {
        if (/^(AMERICAN|INDIAN|BRITISH|EURO|AUSTRALIAN)$/.test(k0) && t.length === 1) continue;
        var lp = readList(t, 0, function () { return Object.keys(M.members).map(Number); }), rest = t.slice(lp.i), pr = null;
        if (/^PRI/.test(rest[0] || "")) {
          pr = { kind: "pris" }; for (var q2 = 1; q2 + 1 < rest.length; q2 += 2) { var key = rest[q2], v = +rest[q2 + 1]; if (!isFinite(v)) { q2--; continue; } pr[key] = v; }
          ["YD", "ZD", "YB", "ZB"].forEach(function (kq2) { if (pr[kq2]) pr[kq2] *= Lf; });
          if (pr.AX) pr.AX *= Lf * Lf; ["IX", "IY", "IZ"].forEach(function (kq3) { if (pr[kq3]) pr[kq3] *= Math.pow(Lf, 4); });
          if (pr.AY) pr.AY *= Lf * Lf; if (pr.AZ) pr.AZ *= Lf * Lf;
        } else if (rest[0] === "TABLE" || rest[0] === "TAB") pr = { kind: "table", name: rest.slice(2).join(" ") || rest[1] };
        else if (/^(ST|D|T|LD|SD|BA|TC|BC|TB)$/.test(rest[0] || "") && rest[1]) pr = { kind: "table", name: rest.slice(1).join(" ") };
        else if (/^(ISMB|ISMC|ISA|ISHB|ISJB|ISLB|ISWB|ISMC)/.test(rest[0] || "")) pr = { kind: "table", name: rest.join(" ") };
        if (!pr) { W("Member property not understood: " + line); continue; }
        lp.ids.forEach(function (m) { M.props[m] = pr; });
        continue;
      }
      if (mode === "defmat") {
        if (k0 === "ISOTROPIC" || k0 === "ISO") { cur = M.mats[k1] = Object.assign({ name: k1 }, MATDEF[k1] || MATDEF[(/CONC/.test(k1) ? "CONCRETE" : /STEEL/.test(k1) ? "STEEL" : "CONCRETE")]); continue; }
        if (cur && k0 === "E") cur.E = +k1 * Ff / (Lf * Lf); else if (cur && /^POI/.test(k0)) cur.nu = +k1; else if (cur && /^DEN/.test(k0)) cur.dens = +k1 * Ff / Math.pow(Lf, 3); else if (cur && k0 === "G") cur.G = +k1 * Ff / (Lf * Lf);
        continue;
      }
      if (mode === "const") {
        var cmd = k0;
        if (/^MATE/.test(cmd)) { var nmat = k1, lm = readList(t, 2, allMem); lm.ids.forEach(function (m) { M.matOf[m] = nmat; }); if (!M.mats[nmat]) M.mats[nmat] = Object.assign({ name: nmat }, MATDEF[nmat] || MATDEF[/STEEL/.test(nmat) ? "STEEL" : "CONCRETE"]); continue; }
        if (/^BETA/.test(cmd)) { var ang = +k1, lb = readList(t, 2, allMem); if (k1 === "ANGLE" || k1 === "RANGLE") { ang = k1 === "RANGLE" ? 90 : 0; lb = readList(t, 2, allMem); W("BETA " + k1 + " taken as " + ang + "°"); } lb.ids.forEach(function (m) { M.beta[m] = ang; }); continue; }
        if (cmd === "E" || /^POI/.test(cmd) || /^DEN/.test(cmd) || cmd === "G" || /^ALPHA|^DAMP|^CDAMP/.test(cmd)) {
          if (/^ALPHA|^DAMP|^CDAMP/.test(cmd)) continue;
          var val, lc2, nmv = k1;
          if (isNum(nmv)) { val = +nmv; lc2 = readList(t, 2, allMem); val = cmd === "E" || cmd === "G" ? val * Ff / (Lf * Lf) : /^DEN/.test(cmd) ? val * Ff / Math.pow(Lf, 3) : val; }
          else { var md = M.mats[nmv] || MATDEF[nmv] || MATDEF[/STEEL/.test(nmv) ? "STEEL" : "CONCRETE"]; val = cmd === "E" ? md.E : /^POI/.test(cmd) ? md.nu : cmd === "G" ? md.G : md.dens; lc2 = readList(t, 2, allMem); }
          var tgt = cmd === "E" ? M.E : /^POI/.test(cmd) ? M.nu : /^DEN/.test(cmd) ? M.dens : null;
          if (tgt) lc2.ids.forEach(function (m) { tgt[m] = val; });
          continue;
        }
        W("CONSTANTS line not used: " + line); continue;
      }
      if (mode === "sup") {
        var ls = readList(t, 0, allJ), kw = t.slice(ls.i), fx = [1, 1, 1, 1, 1, 1], ks = [0, 0, 0, 0, 0, 0], ok = true;
        if (kw[0] === "PINNED") fx = [1, 1, 1, 0, 0, 0];
        else if (kw[0] === "FIXED" && kw[1] === "BUT") {
          var DOF = { FX: 0, FY: 1, FZ: 2, MX: 3, MY: 4, MZ: 5 }, SK = { KFX: 0, KFY: 1, KFZ: 2, KMX: 3, KMY: 4, KMZ: 5 };
          for (var q4 = 2; q4 < kw.length; q4++) {
            if (DOF[kw[q4]] !== undefined) fx[DOF[kw[q4]]] = 0;
            else if (SK[kw[q4]] !== undefined && isNum(kw[q4 + 1])) { var di = SK[kw[q4]]; fx[di] = 0; ks[di] = +kw[q4 + 1] * Ff / (di < 3 ? Lf : 1) ; q4++; }
          }
        } else if (kw[0] === "FIXED") fx = [1, 1, 1, 1, 1, 1];
        else if (kw[0] === "ENFORCED") { fx = [1, 1, 1, 1, 1, 1]; W("ENFORCED supports read as fixed (no settlement loads)"); }
        else { ok = false; W("Support type not supported: " + line); }
        if (ok) ls.ids.forEach(function (j) { M.sup[j] = fx.slice(); if (ks.some(Boolean)) M.spr[j] = ks.slice(); });
        continue;
      }
      if (mode === "rel") {
        var lrl = readList(t, 0, allMem), end = t[lrl.i], dofs = t.slice(lrl.i + 1), map = { FX: 0, FY: 1, FZ: 2, MX: 3, MY: 4, MZ: 5 };
        lrl.ids.forEach(function (m) {
          var r0 = M.rel[m] = M.rel[m] || [];
          dofs.forEach(function (d) { if (map[d] === undefined) return; if (end === "START" || end === "BOTH") r0.push(map[d]); if (end === "END" || end === "BOTH") r0.push(6 + map[d]); });
        });
        if (dofs.some(function (d) { return /^K|^\d/.test(d); })) W("Partial / spring member releases read as full releases");
        continue;
      }
      if (mode === "truss") { readList(t, 0, allMem).ids.forEach(function (m) { M.truss[m] = 1; }); continue; }
      if (mode === "offset") { W("MEMBER OFFSET ignored — members run between joint centres"); continue; }
      if (mode === "d93") {
        if (k0 === "SELFWEIGHT") { d93.self = isNum(k1) ? +k1 : 1; continue; }
        if (k0 === "JOINT" && /^WEIG/.test(k1)) { d93sub = "joint"; continue; }
        if (k0 === "MEMBER" && /^WEIG/.test(k1)) { d93sub = "member"; continue; }
        if (k0 === "ELEMENT" && /^WEIG/.test(k1)) { d93sub = "elem"; continue; }
        if (k0 === "FLOOR" && /^WEIG/.test(k1)) { d93sub = "floor"; continue; }
        if (/^(ZONE|RF|I|SS|ST|DM|PX|PZ|PY|DT|GL|SA|IMPERFECTION)$/.test(k0)) { readKV(t, 0); continue; }
        if (d93sub === "joint") { var lj = readList(t, 0, allJ), iw = t.indexOf("WEIGHT"); if (iw > 0) d93.joint.push({ ids: lj.ids, w: +t[iw + 1] * Ff }); continue; }
        if (d93sub === "member") { var lm2 = readList(t, 0, allMem), iu = t.indexOf("UNI"); if (iu > 0) d93.member.push({ ids: lm2.ids, w: +t[iu + 1] * Ff / Lf, d1: t[iu + 2] !== undefined ? +t[iu + 2] * Lf : null, d2: t[iu + 3] !== undefined ? +t[iu + 3] * Lf : null }); else W("MEMBER WEIGHT line not understood: " + line); continue; }
        if (d93sub === "elem") { var le = readList(t, 0, allMem), ip = t.indexOf("PRESSURE") >= 0 ? t.indexOf("PRESSURE") : t.indexOf("PR"); if (ip > 0) d93.elem.push({ ids: le.ids, p: +t[ip + 1] * Ff / (Lf * Lf) }); continue; }
        if (d93sub === "floor") { var fw = floorSpec(t); if (fw) d93.floor.push(fw); continue; }
        W("DEFINE 1893 LOAD line not used: " + line); continue;
      }
      if (mode === "dwind") {
        if (k0 === "TYPE") { curWind = M.wind[+k1] = { type: +k1, p: [], h: [] }; continue; }
        if (k0 === "INT" || k0 === "INTENSITY") {
          if (!curWind) curWind = M.wind[1] = { type: 1, p: [], h: [] };
          var ih = t.indexOf("HEIG") >= 0 ? t.indexOf("HEIG") : t.indexOf("HEIGHT");
          var ps = t.slice(1, ih > 0 ? ih : t.length).map(Number).filter(isFinite), hs = ih > 0 ? t.slice(ih + 1).map(Number).filter(isFinite) : [];
          curWind.p = curWind.p.concat(ps.map(function (v) { return v * Ff / (Lf * Lf); })); curWind.h = curWind.h.concat(hs.map(function (v) { return v * Lf; })); continue;
        }
        if (k0 === "EXP" || k0 === "EXPOSURE") { W("Wind EXPOSURE factors ignored (taken as 1.0)"); continue; }
        W("DEFINE WIND LOAD line not used: " + line); continue;
      }
      if (mode === "load" && cur) {
        if (k0 === "SELFWEIGHT" || k0 === "SELF") {
          var dir = /^[XYZ]$/.test(k1) ? k1 : "Y", fac = isNum(t[2]) ? +t[2] : isNum(k1) ? +k1 : -1, il = t.indexOf("LIST");
          cur.self.push({ dir: dir, f: fac, ids: il > 0 ? readList(t, il + 1, allMem).ids : null }); continue;
        }
        if (k0 === "JOINT" && k1 === "LOAD") { cur.sub = "joint"; continue; }
        if (k0 === "MEMBER" && k1 === "LOAD") { cur.sub = "member"; continue; }
        if (k0 === "ELEMENT" && (k1 === "LOAD" || k1 === "PRESSURE")) { cur.sub = "elem"; continue; }
        if (k0 === "FLOOR" && k1 === "LOAD") { cur.sub = "floor"; continue; }
        if (k0 === "REPEAT" && k1 === "LOAD") { cur.sub = "repeat"; continue; }
        if (k0 === "1893" && k1 === "LOAD") { cur.eq.push({ dir: t[2], f: isNum(t[3]) ? +t[3] : 1, acc: t.indexOf("ACC") > 0 }); if (t.indexOf("ACC") > 0) W("1893 LOAD ACC (accidental torsion) not applied"); continue; }
        if (k0 === "WIND" && k1 === "LOAD") { var it2 = t.indexOf("TYPE"); cur.wind.push({ dir: t[2], f: isNum(t[3]) ? +t[3] : 1, type: it2 > 0 ? +t[it2 + 1] : 1, raw: line }); if (/XR|YR|ZR|LIST/.test(U)) W("WIND LOAD ranges / lists ignored — the whole windward face is loaded"); continue; }
        if (/^(TEMP|TEMPERATURE|STRAIN|SUPPORT|SPECTRUM|TIME|AREA|ONEWAY|SNOW|CHLOAD|PRESTRESS|POSTSTRESS|UBC|IBC|AISC)$/.test(k0) || (k0 === "SUPPORT" && /^DISP/.test(k1))) { cur.other.push(k0); W("Load '" + k0 + "' in load case " + cur.id + " is not supported and was ignored"); cur.sub = "skip"; continue; }
        if (cur.sub === "joint") {
          var lj2 = readList(t, 0, allJ), f6 = [0, 0, 0, 0, 0, 0], D6 = { FX: 0, FY: 1, FZ: 2, MX: 3, MY: 4, MZ: 5 };
          for (var q5 = lj2.i; q5 + 1 < t.length; q5 += 2) if (D6[t[q5]] !== undefined) f6[D6[t[q5]]] += +t[q5 + 1] * Ff * (D6[t[q5]] >= 3 ? Lf : 1);
          cur.joint.push({ ids: lj2.ids, f: f6 }); continue;
        }
        if (cur.sub === "member") {
          var lmm = readList(t, 0, allMem), ty = t[lmm.i], dd = t[lmm.i + 1], vals = t.slice(lmm.i + 2).filter(isNum).map(Number);
          if (!ty) { W("Member load not understood: " + line); continue; }
          if (/^(UMOM|CMOM)$/.test(ty)) { W("Member moment loads (" + ty + ") ignored in load case " + cur.id); continue; }
          if (!/^(UNI|CON|TRAP|LIN)$/.test(ty)) { W("Member load type " + ty + " ignored in load case " + cur.id); continue; }
          cur.member.push({ ids: lmm.ids, ty: ty, dir: dd, v: vals, Ff: Ff, Lf: Lf }); continue;
        }
        if (cur.sub === "elem") {
          var lel = readList(t, 0, function () { return Object.keys(M.elems).map(Number); }), ipr = lel.i;
          if (t[ipr] === "PR" || t[ipr] === "PRESSURE") {
            var d3 = t[ipr + 1], pv;
            if (/^G[XYZ]$/.test(d3)) pv = +t[ipr + 2]; else if (/^(LOCALX|LOCALY|LOCALZ|LOCAL)$/.test(d3)) { pv = +t[ipr + 2]; d3 = "LOCAL"; } else { pv = +d3; d3 = "LOCAL"; }
            if (t.slice(ipr).filter(isNum).length > 1) W("Partial element pressures (X1 Y1 X2 Y2) read as full-element pressures");
            cur.elem.push({ ids: lel.ids, dir: d3, p: pv * Ff / (Lf * Lf) });
          } else W("Element load not understood: " + line);
          continue;
        }
        if (cur.sub === "floor") { var fl = floorSpec(t); if (fl) cur.floor.push(fl); else W("Floor load not understood: " + line); continue; }
        if (cur.sub === "repeat") { for (var q6 = 0; q6 + 1 < t.length; q6 += 2) if (isNum(t[q6]) && isNum(t[q6 + 1])) cur.repeat.push([+t[q6], +t[q6 + 1]]); continue; }
        W("Line in load case " + cur.id + " not used: " + line); continue;
      }
      if (mode === "comb" && cur) { for (var q7 = 0; q7 + 1 < t.length; q7 += 2) if (isNum(t[q7]) && isNum(t[q7 + 1])) cur.f[+t[q7]] = (cur.f[+t[q7]] || 0) + +t[q7 + 1]; continue; }
      if (mode === "cdesign") {
        var str = Ff / (Lf * Lf) / 1000;   /* → N/mm² */
        if (k0 === "FC" && isNum(k1)) M.design.fc = Math.round(+k1 * str * 10) / 10;
        else if (k0 === "FYMAIN" && isNum(k1)) M.design.fy = Math.round(+k1 * str);
        else if (k0 === "MINSEC" && isNum(k1)) M.design.minsec = +k1 * Lf * 1000;
        else if (/^(CLEAR|CLB|CLT|CLS)$/.test(k0) && isNum(k1)) M.design.cover[k0] = +k1 * Lf * 1000;
        else if (k0 === "CODE") M.design.code = k1;
        else if (k0 === "DESIGN") M.design.list = M.loadList;
        continue;
      }
      if (mode === "skip") continue;
      M.unknown[k0] = (M.unknown[k0] || 0) + 1;
    }
    Object.keys(M.unknown).forEach(function (k) { if (!/^(DEFINE|END|START|LOAD|STEEL|CONCRETE|TRACK|DESIGN|CHECK|SELECT|FYLD|FU|RATIO|SAVE|BEAM|NSF|LZ|LY|KZ|KY|UNL|UNB|CB|MAIN|DMAX|DMIN|TRACK)$/.test(k)) W("Command '" + k + "' not used (" + M.unknown[k] + "×)"); });
    if (!Object.keys(M.joints).length) throw new Error("No JOINT COORDINATES found — is this a STAAD.Pro input file (.std)?");
    if (!Object.keys(M.members).length && !Object.keys(M.elems).length) throw new Error("No members or plates found in the STAAD file");
    return M;
    function readKV(tt, from) { for (var q8 = from; q8 + 1 < tt.length; q8++) { var kk2 = tt[q8], vv = +tt[q8 + 1]; if (!isFinite(vv)) continue; var key2 = { ZONE: "zone", RF: "rf", I: "I", SS: "ss", ST: "st", DM: "dm", PX: "px", PZ: "pz", PY: "py", DT: "dt" }[kk2]; if (key2) { d93[key2] = vv; q8++; } } }
    function floorSpec(tt) {
      var o = { y: null, x: null, z: null, p: null, dir: "GY" };
      for (var q9 = 0; q9 < tt.length; q9++) {
        var kw2 = tt[q9];
        if (/^(YRANGE|XRANGE|ZRANGE|YR|XR|ZR)$/.test(kw2)) { o[kw2.charAt(0).toLowerCase()] = [+tt[q9 + 1] * Lf, +tt[q9 + 2] * Lf]; q9 += 2; }
        else if (kw2 === "FLOAD" || kw2 === "FLO") { o.p = +tt[q9 + 1] * Ff / (Lf * Lf); q9++; }
        else if (/^G[XYZ]$/.test(kw2)) o.dir = kw2;
        else if (kw2 === "ONE" || kw2 === "ONEWAY") { o.one = true; }
        else if (kw2 === "GROUP" || kw2 === "INCLINED") { o.bad = true; }
      }
      if (o.bad) W("FLOOR LOAD by GROUP / INCLINED not supported — give Y/X/Z ranges");
      if (o.p === null || isNaN(o.p)) return null;
      return o;
    }
  };

  /* ---------- coordinates & directions (STAAD → app) ---------- */
  S.tr = function (M, v) { return M.zup ? [v[0], v[1], v[2]] : [v[0], -v[2], v[1]]; };
  function up(M) { return M.zup ? [0, 0, 1] : [0, 1, 0]; }
  function gdir(M, d) { var v = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[d.replace(/^G|^P/, "")]; return v ? S.tr(M, v) : null; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function crs(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function dotp(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  /* STAAD member local axes in STAAD coordinates (beta = 0, then rotated by beta) */
  S.localAxes = function (M, m) {
    var j = M.members[m], A = M.joints[j[0]], B = M.joints[j[1]], x = unit(sub(B, A)), U = up(M), z, y;
    if (Math.abs(dotp(x, U)) > 0.9999) z = M.zup ? [0, -1, 0] : [0, 0, 1];
    else z = unit(crs(x, U));
    y = crs(z, x);
    var b = (M.beta[m] || 0) * Math.PI / 180;
    if (b) { var c = Math.cos(b), s = Math.sin(b), y2 = [0, 1, 2].map(function (i) { return c * y[i] + s * z[i]; }), z2 = [0, 1, 2].map(function (i) { return -s * y[i] + c * z[i]; }); y = y2; z = z2; }
    return { x: x, y: y, z: z };
  };

  /* ---------- section for a member (called by MD.make with the design parameters) ---------- */
  S.section = function (q, p, role) {
    var s;
    if (q.kind === "rect") {
      /* STAAD models are uncracked unless the file says otherwise — cracked factors only when asked for (stdCrack) */
      s = Object.assign({}, MD.secRCC(q.b, q.D, Object.assign({}, p, { crack: false }), role));
      if (q.mat !== "steel") {
        var cr = p.stdCrack ? (role === "column" ? 0.7 : 0.35) : 1;
        s.Iz = cr * q.b * Math.pow(q.D, 3) / 12e12; s.Iy = cr * q.D * Math.pow(q.b, 3) / 12e12;
        s.J = (q.J || s.J) * (p.stdCrack ? 0.1 : 1);
      } else s.kind = "gen";
    } else if (q.kind === "table") {
      var nm = q.name.replace(/\s+/g, "");
      s = /^ISA/.test(nm) ? MD.secISA(nm.replace(/^ISA/, "ISA "), p) || MD.secISA(nm, p) : MD.secISMB(nm, p) || MD.secISMB(nm.replace(/^ISMB/, "ISMB "), p);
      if (!s) { s = { kind: "gen", name: q.name, A: 0.01, Iz: 1e-4, Iy: 1e-5, J: 1e-6, E: 2e8, G: 7.7e7, gamma: 78.5, missing: true }; }
      else s = Object.assign({}, s);
    } else {
      s = { kind: "gen", name: q.name || "PRIS", A: q.A, Iz: q.Iz, Iy: q.Iy, J: q.J || 1e-6, E: q.E || 2.17185e7, G: (q.E || 2.17185e7) / 2.34, gamma: q.dens || 23.5616 };
    }
    if (q.E) { s.E = q.E; s.G = q.E / (2 * (1 + (q.nu !== undefined ? q.nu : 0.17))); }
    if (q.dens !== undefined) s.gamma = q.dens;
    if (p.stdShear !== false) {
      if (q.Avy) { s.Avy = q.Avy; s.Avz = q.Avz; }
      else if (q.kind === "rect") { s.Avy = s.Avz = q.b * q.D / 1e6; }
      else if (s.kind === "steel" && s.row && s.shape === "I") { s.Avy = s.row.D * s.row.tw / 1e6; s.Avz = 2 * s.row.bf * s.row.tf * 5 / 6 / 1e6; }
    }
    s.std = true;
    return s;
  };

  /* ---------- model geometry ---------- */
  S.toGeo = function (M, opt) {
    opt = opt || {};
    var nodes = [], idx = {}, grid = {}, tol = 1e-4, warn = M.warn.slice();
    function key(a) { return Math.round(a[0] / tol) + "," + Math.round(a[1] / tol) + "," + Math.round(a[2] / tol); }
    function node(a) { var k = key(a); if (grid[k] !== undefined) return grid[k]; nodes.push({ x: a[0], y: a[1], z: a[2] }); return (grid[k] = nodes.length - 1); }
    var jids = Object.keys(M.joints).map(Number).sort(function (a, b) { return a - b; });
    jids.forEach(function (j) { var a = S.tr(M, M.joints[j]); idx[j] = nodes.length; nodes.push({ x: a[0], y: a[1], z: a[2], sid: j }); var k = key(a); if (grid[k] === undefined) grid[k] = idx[j]; else warn.push("Joints " + nodes[grid[k]].sid + " and " + j + " coincide — kept separate as in STAAD"); });
    var U = up(M), mids = Object.keys(M.members).map(Number).sort(function (a, b) { return a - b; }), eids = Object.keys(M.elems).map(Number).sort(function (a, b) { return a - b; });
    var bad = [];
    /* plates: as in the file, or subdivided to the mesh size */
    var shells = [], emap = {}, meshN = opt.mesh > 0 ? opt.mesh : 0, created = {};
    eids.forEach(function (e) {
      var js = M.elems[e].filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      if (js.some(function (j) { return idx[j] === undefined; })) { bad.push("Plate " + e + " uses an undefined joint"); return; }
      var P = js.map(function (j) { return S.tr(M, M.joints[j]); }), n3 = crs(sub(P[1], P[0]), sub(P[2], P[0])), horiz = Math.abs(n3[2]) > 0.7 * Math.hypot(n3[0], n3[1], n3[2]);
      var t = M.thick[e]; if (!t) { warn.push("Plate " + e + " has no thickness — 150 mm assumed"); t = 0.15; }
      var mat = matOf(e, "CONCRETE"); emap[e] = [];
      var quads = [];
      if (P.length === 3) { var c = avg(P), m01 = avg([P[0], P[1]]), m12 = avg([P[1], P[2]]), m20 = avg([P[2], P[0]]); quads.push([P[0], m01, c, m20], [P[1], m12, c, m01], [P[2], m20, c, m12]); }
      else quads.push(P);
      if (P.length === 3 && !meshN) { var ids3 = js.map(function (j) { return idx[j]; }); shells.push({ n: [ids3[0], ids3[1], ids3[2], ids3[2]], kind: horiz ? "slab" : "wall", layer: "STAAD plate " + e, t0: t, mat0: mat, sid: e, tri: true }); emap[e].push(shells.length - 1); return; }
      quads.forEach(function (q) {
        var na = meshN ? Math.max(1, Math.ceil(Math.max(dist(q[0], q[1]), dist(q[3], q[2])) / meshN - 1e-9)) : 1, nb = meshN ? Math.max(1, Math.ceil(Math.max(dist(q[1], q[2]), dist(q[0], q[3])) / meshN - 1e-9)) : 1, id = [];
        for (var jj = 0; jj <= nb; jj++) { id.push([]); for (var ii = 0; ii <= na; ii++) { var pt = bil(q, ii / na, jj / nb), k = key(pt), ex = grid[k]; var nid = ex !== undefined ? ex : node(pt); if (ex === undefined) created[nid] = 1; id[jj].push(nid); } }
        for (jj = 0; jj < nb; jj++) for (ii = 0; ii < na; ii++) shells.push({ n: [id[jj][ii], id[jj][ii + 1], id[jj + 1][ii + 1], id[jj + 1][ii]], kind: horiz ? "slab" : "wall", layer: "STAAD plate " + e, t0: t, mat0: mat, sid: e }), emap[e].push(shells.length - 1);
      });
    });
    /* STAAD surfaces: meshed (STAAD meshes them internally) at the plate mesh size, 1 m if none */
    var smap = {}, nsurf = 0;
    if (opt.surfaces !== false) Object.keys(M.surfs).map(Number).sort(function (a, b) { return a - b; }).forEach(function (sf) {
      var js = M.surfs[sf]; if (js.length > 4 || js.some(function (j) { return idx[j] === undefined; })) return;
      var P = js.map(function (j) { return S.tr(M, M.joints[j]); }), n3 = crs(sub(P[1], P[0]), sub(P[2], P[0])), horiz = Math.abs(n3[2]) > 0.7 * Math.hypot(n3[0], n3[1], n3[2]);
      var t = M.sthick[sf] || 0.15, mat = matOf(-1, "CONCRETE"), ms = meshN || 1, quads = [];
      if (P.length === 3) { var c = avg(P), m01 = avg([P[0], P[1]]), m12 = avg([P[1], P[2]]), m20 = avg([P[2], P[0]]); quads.push([P[0], m01, c, m20], [P[1], m12, c, m01], [P[2], m20, c, m12]); } else quads.push(P);
      smap[sf] = []; nsurf++;
      quads.forEach(function (q) {
        var na = Math.max(1, Math.ceil(Math.max(dist(q[0], q[1]), dist(q[3], q[2])) / ms - 1e-9)), nb = Math.max(1, Math.ceil(Math.max(dist(q[1], q[2]), dist(q[0], q[3])) / ms - 1e-9)), id = [];
        for (var jj = 0; jj <= nb; jj++) { id.push([]); for (var ii = 0; ii <= na; ii++) { var pt = bil(q, ii / na, jj / nb), k = key(pt), ex = grid[k]; var nid = ex !== undefined ? ex : node(pt); if (ex === undefined) created[nid] = 1; id[jj].push(nid); } }
        for (jj = 0; jj < nb; jj++) for (ii = 0; ii < na; ii++) { shells.push({ n: [id[jj][ii], id[jj][ii + 1], id[jj + 1][ii + 1], id[jj + 1][ii]], kind: horiz ? "slab" : "wall", layer: "STAAD surface " + sf, t0: t, mat0: mat, sid: "S" + sf }); smap[sf].push(shells.length - 1); }
      });
    });
    if (nsurf) warn.push(nsurf + " STAAD surface(s) meshed at " + (meshN || 1) + " m" + (opt.surfaces === false ? "" : ""));
    /* members, split at mesh nodes lying on them */
    var frames = [], fmap = {}, newIds = Object.keys(created).map(Number);
    mids.forEach(function (m) {
      var j = M.members[m]; if (idx[j[0]] === undefined || idx[j[1]] === undefined) { bad.push("Member " + m + " uses an undefined joint"); return; }
      var a = idx[j[0]], b = idx[j[1]], A = nodes[a], B = nodes[b], L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
      if (L < 1e-9) { bad.push("Member " + m + " has zero length"); return; }
      var on = [];
      newIds.forEach(function (i) { var N = nodes[i], tt = ((N.x - A.x) * (B.x - A.x) + (N.y - A.y) * (B.y - A.y) + (N.z - A.z) * (B.z - A.z)) / (L * L); if (tt <= 1e-6 || tt >= 1 - 1e-6) return; if (Math.hypot(A.x + tt * (B.x - A.x) - N.x, A.y + tt * (B.y - A.y) - N.y, A.z + tt * (B.z - A.z) - N.z) <= 1e-3) on.push([tt, i]); });
      on.sort(function (x, y) { return x[0] - y[0]; });
      var ch = [[0, a]].concat(on).concat([[1, b]]), dz = Math.abs(B.z - A.z), dh = Math.hypot(B.x - A.x, B.y - A.y);
      var role = M.truss[m] ? "brace" : dh < 1e-6 * (dz + 1) ? "column" : "beam";
      var pr = M.props[m], q = secSpec(m, pr, role);
      fmap[m] = [];
      for (var i = 0; i + 1 < ch.length; i++) {
        var rel = (M.rel[m] || []).filter(function (r) { return (r < 6 && i === 0) || (r >= 6 && i === ch.length - 2); });
        frames.push({ n1: ch[i][1], n2: ch[i + 1][1], role: role, layer: "STAAD member " + m, std: q, rel: rel.length ? rel : null, sid: m, t0: ch[i][0] * L, t1: ch[i + 1][0] * L, part: i, parts: ch.length - 1 });
        fmap[m].push(frames.length - 1);
      }
    });
    if (bad.length) throw new Error("The STAAD model has errors:\n• " + bad.slice(0, 8).join("\n• "));
    var sup = {}, spr = {};
    Object.keys(M.sup).forEach(function (j) {
      if (idx[j] === undefined) { warn.push("Support at undefined joint " + j + " ignored"); return; }
      var r = M.sup[j], k = M.spr[j], perm = M.zup ? [0, 1, 2] : [0, 2, 1], o = [r[perm[0]], r[perm[1]], r[perm[2]], r[3 + perm[0]], r[3 + perm[1]], r[3 + perm[2]]];
      sup[idx[j]] = o; if (k) spr[idx[j]] = [k[perm[0]], k[perm[1]], k[perm[2]], k[3 + perm[0]], k[3 + perm[1]], k[3 + perm[2]]];
    });
    if (!Object.keys(sup).length) warn.push("No SUPPORTS in the STAAD file — the model cannot be analysed until supports are added (Support rules)");
    var nPl = shells.length, nTri = shells.filter(function (s) { return s.tri; }).length;
    if (nTri) warn.push(nTri + " triangular plate(s) — set a plate mesh size so they are split into quadrilaterals");
    /* plain data only (sent to background workers) */
    var std = { M: M, idx: idx, fmap: fmap, emap: emap, smap: smap, opt: { mesh: meshN, surfaces: opt.surfaces !== false } };
    return { nodes: nodes, frames: frames, shells: shells, sup: sup, spr: Object.keys(spr).length ? spr : null, warn: warn, twoD: false, std: std, stdName: opt.name || "" };

    function matOf(id, def) {
      var nm = id >= 0 ? M.matOf[id] : Object.keys(M.mats)[0], md = nm ? (M.mats[nm] || MATDEF[nm]) : null, base = md || MATDEF[def];
      return { E: M.E[id] !== undefined ? M.E[id] : base.E, nu: M.nu[id] !== undefined ? M.nu[id] : base.nu, gamma: M.dens[id] !== undefined ? M.dens[id] : base.dens, name: nm || (md ? def : "") };
    }
    function secSpec(m, pr, role) {
      var mt = matOf(m, pr && pr.kind === "table" ? "STEEL" : "CONCRETE"), steel = /STEEL/.test(M.matOf[m] || "") || (pr && pr.kind === "table");
      var q = { E: mt.E, nu: mt.nu, dens: mt.gamma, mat: steel ? "steel" : "concrete" };
      if (!pr) { warn.push("Member " + m + " has no property — 300 × 450 assumed"); return Object.assign(q, { kind: "rect", b: 300, D: 450 }); }
      var bt = Math.round(((M.beta[m] || 0) % 360 + 360) % 360);
      if (bt % 90) warn.push("Member " + m + ": BETA " + bt + "° taken as the nearest multiple of 90°");
      var sw = Math.round(bt / 90) % 2 === 1;
      if (pr.kind === "pris" && pr.YD && pr.ZD && !pr.YB && !pr.ZB) {
        var D = pr.YD * 1000, b = pr.ZD * 1000; if (sw) { var t0 = D; D = b; b = t0; }
        return Object.assign(q, { kind: "rect", b: Math.round(b * 10) / 10, D: Math.round(D * 10) / 10, J: pr.IX || null, Avy: pr.AY || null, Avz: pr.AZ || null });
      }
      if (pr.kind === "pris" && pr.YD && !pr.ZD) { var dd = pr.YD, A = Math.PI * dd * dd / 4, I = Math.PI * Math.pow(dd, 4) / 64; warn.push("Member " + m + ": circular section Ø" + Math.round(dd * 1000) + " analysed but not designed"); return Object.assign(q, { kind: "gen", name: "Ø" + Math.round(dd * 1000), A: A, Iz: I, Iy: I, J: 2 * I }); }
      if (pr.kind === "pris" && pr.AX) { var Iz = sw ? pr.IY : pr.IZ, Iy = sw ? pr.IZ : pr.IY; return Object.assign(q, { kind: "gen", name: "PRIS AX", A: pr.AX, Iz: Iz || 1e-4, Iy: Iy || 1e-4, J: pr.IX || 1e-6, Avy: pr.AY || null, Avz: pr.AZ || null }); }
      if (pr.kind === "pris") { warn.push("Member " + m + ": tapered / T / trapezoidal PRIS section not supported — 300 × 450 assumed"); return Object.assign(q, { kind: "rect", b: 300, D: 450 }); }
      if (pr.kind === "table") {
        if (sw) warn.push("Member " + m + ": rotated steel section (BETA 90) analysed about the table axes");
        if (!MD.secISMB(pr.name.replace(/\s+/g, ""), { fys: 250 }) && !/^ISA/.test(pr.name.replace(/\s+/g, ""))) warn.push("Member " + m + ": steel section '" + pr.name + "' is not in the app's tables (ISMB, ISA) — not analysed correctly; assign it in Section overrides");
        return Object.assign(q, { kind: "table", name: pr.name, E: mt.E || 2.05e8 });
      }
      return Object.assign(q, { kind: "rect", b: 300, D: 450 });
    }
    function avg(a) { var o = [0, 0, 0]; a.forEach(function (p) { o[0] += p[0] / a.length; o[1] += p[1] / a.length; o[2] += p[2] / a.length; }); return o; }
    function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
    function bil(q, s, t) { var w = [(1 - s) * (1 - t), s * (1 - t), s * t, (1 - s) * t], o = [0, 0, 0]; q.forEach(function (p, i) { o[0] += w[i] * p[0]; o[1] += w[i] * p[1]; o[2] += w[i] * p[2]; }); return o; }
  };

  /* ---------- loads ---------- */
  /* floor panels: rectangular grid cells at a level fully bounded by members (STAAD coordinates) */
  function panels(M, spec) {
    var vi = M.zup ? 2 : 1, hi = M.zup ? [0, 1] : [0, 2], out = [];
    var lv = {}, mems = [];
    Object.keys(M.members).forEach(function (m) {
      var j = M.members[m], A = M.joints[j[0]], B = M.joints[j[1]]; if (!A || !B) return;
      if (Math.abs(A[vi] - B[vi]) > 1e-3) return;
      var y = A[vi], vr = M.zup ? spec.z : spec.y; if (vr && (y < Math.min(vr[0], vr[1]) - 1e-6 || y > Math.max(vr[0], vr[1]) + 1e-6)) return;
      var ax = Math.abs(A[hi[0]] - B[hi[0]]) < 1e-4 ? 1 : Math.abs(A[hi[1]] - B[hi[1]]) < 1e-4 ? 0 : -1; if (ax < 0) return;
      var yk = y.toFixed(3); (lv[yk] = lv[yk] || []).push({ m: +m, ax: ax, c: A[hi[1 - ax]], a: Math.min(A[hi[ax]], B[hi[ax]]), b: Math.max(A[hi[ax]], B[hi[ax]]), s: A[hi[ax]] <= B[hi[ax]] ? A[hi[ax]] : B[hi[ax]], rev: A[hi[ax]] > B[hi[ax]], L: Math.abs(B[hi[ax]] - A[hi[ax]]) });
    });
    Object.keys(lv).forEach(function (yk) {
      var ms = lv[yk], xs = [], zs = [];
      function addU(a, v) { if (!a.some(function (w) { return Math.abs(w - v) < 1e-3; })) a.push(v); }
      ms.forEach(function (q) { if (q.ax === 0) { addU(xs, q.a); addU(xs, q.b); addU(zs, q.c); } else { addU(zs, q.a); addU(zs, q.b); addU(xs, q.c); } });
      xs.sort(function (a, b) { return a - b; }); zs.sort(function (a, b) { return a - b; });
      function cover(ax, c, a, b) { return ms.filter(function (q) { return q.ax === ax && Math.abs(q.c - c) < 1e-3 && q.a <= a + 1e-3 && q.b >= b - 1e-3; })[0]; }
      for (var i = 0; i + 1 < xs.length; i++) for (var k = 0; k + 1 < zs.length; k++) {
        var x0 = xs[i], x1 = xs[i + 1], z0 = zs[k], z1 = zs[k + 1], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        var h2 = M.zup ? spec.y : spec.z;
        if (spec.x && (cx < Math.min(spec.x[0], spec.x[1]) || cx > Math.max(spec.x[0], spec.x[1]))) continue;
        if (h2 && (cz < Math.min(h2[0], h2[1]) || cz > Math.max(h2[0], h2[1]))) continue;
        var e1 = cover(0, z0, x0, x1), e2 = cover(0, z1, x0, x1), e3 = cover(1, x0, z0, z1), e4 = cover(1, x1, z0, z1);
        if (!e1 || !e2 || !e3 || !e4) continue;
        out.push({ y: +yk, x0: x0, x1: x1, z0: z0, z1: z1, edges: [[e1, x0, x1], [e2, x0, x1], [e3, z0, z1], [e4, z0, z1]] });
      }
    });
    return out;
  }
  /* distribute a floor pressure p (kN/m², acting along vector dir) to the panel edges (45° lines; ONE-way to the long edges) */
  function floorPieces(M, pnl, p, one) {
    var dx = pnl.x1 - pnl.x0, dz = pnl.z1 - pnl.z0, lx = Math.min(dx, dz), out = [];
    pnl.edges.forEach(function (ed, i) {
      var q = ed[0], a = ed[1], b = ed[2], len = b - a, alongX = i < 2, edgeShort = Math.abs(len - lx) < 1e-6 && (alongX ? dx <= dz : dz <= dx);
      var h = lx / 2, pts;
      if (one) { if ((alongX ? dx : dz) >= Math.max(dx, dz) - 1e-6 && dx !== dz) pts = [[0, p * (alongX ? dz : dx) / 2], [len, p * (alongX ? dz : dx) / 2]]; else return; }
      else if (Math.abs(dx - dz) < 1e-6 || edgeShort) pts = [[0, 0], [len / 2, p * Math.min(len / 2, h)], [len, 0]];
      else pts = [[0, 0], [h, p * h], [len - h, p * h], [len, 0]];
      /* positions measured along the member from its start joint */
      for (var s = 0; s + 1 < pts.length; s++) {
        var u0 = a + pts[s][0] - q.s, u1 = a + pts[s + 1][0] - q.s, w0 = pts[s][1], w1 = pts[s + 1][1];
        if (q.rev) { var L = q.L; var t0 = L - u1, t1 = L - u0; out.push({ m: q.m, a: t0, b: t1, w1: w1, w2: w0 }); }
        else out.push({ m: q.m, a: u0, b: u1, w1: w0, w2: w1 });
      }
    });
    return out;
  }
  /* split a load piece on member m (positions from its start, m) onto the app frames of that member */
  function onParts(geo, m, piece, push) {
    (geo.std.fmap[m] || []).forEach(function (k) {
      var f = geo.frames[k], a0 = f.t0, b0 = f.t1;
      if (piece.k === "p") { if (piece.a >= a0 - 1e-9 && (piece.a < b0 - 1e-9 || (b0 >= piece.L - 1e-9 && piece.a <= b0 + 1e-9))) push(k, { k: "p", P: piece.P, a: piece.a - a0 }); return; }
      var a = Math.max(a0, piece.a), b = Math.min(b0, piece.b); if (b - a <= 1e-9) return;
      function wt(x) { return piece.w1.map(function (v, d) { return v + (piece.w2[d] - v) * (x - piece.a) / Math.max(piece.b - piece.a, 1e-12); }); }
      if (piece.uni && a <= a0 + 1e-9 && b >= b0 - 1e-9) push(k, { k: "u", w: piece.w1 });
      else push(k, { k: "d", w1: wt(a), w2: wt(b), a: a - a0, b: b - a0 });
    });
  }
  S.memLen = function (M, m) { var j = M.members[m], A = M.joints[j[0]], B = M.joints[j[1]]; return Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]); };

  /* load cases of the STAAD file → app cases {name: {nodal, frameUDL, frameLoads, shellP}} */
  S.cases = function (m, geo, p) {
    var M = geo.std.M, idx = geo.std.idx, cases = {}, names = {}, notes = [], eqInfo = {}, windInfo = {}, titles = {};
    var built = {};
    function lcOf(L) {
      if (built[L.id]) return built[L.id];
      var lc = { nodal: [], frameUDL: [], frameLoads: [], shellP: [] };
      function pushF(k, o) { if (o.k === "u") lc.frameUDL.push({ e: k, w: o.w }); else if (o.k === "p") lc.frameLoads.push({ e: k, k: "p", P: o.P, a: o.a }); else lc.frameLoads.push({ e: k, k: "d", w1: o.w1, w2: o.w2, a: o.a, b: o.b }); }
      L.self.forEach(function (sw) {
        var v = gdir(M, sw.dir).map(function (x) { return x * sw.f; }), list = sw.ids ? sw.ids : null;
        m.frames.forEach(function (e, k) { var f = geo.frames[k]; if (list && list.indexOf(f.sid) < 0) return; var g = e.sec.gamma * e.sec.A; lc.frameUDL.push({ e: k, w: v.map(function (x) { return x * g; }) }); });
        m.shells.forEach(function (s, k) { var f = geo.shells[k]; if (list && list.indexOf(f.sid) < 0) return; var g = s.mat.gamma * s.t; lc.shellP.push({ e: k, q: v.map(function (x) { return x * g; }) }); });
      });
      L.joint.forEach(function (jl) {
        var f = S.tr(M, jl.f.slice(0, 3)), mo = S.tr(M, jl.f.slice(3, 6)), f6 = f.concat(mo);
        jl.ids.forEach(function (j) { if (idx[j] === undefined) return; lc.nodal.push({ n: idx[j], f: f6.slice() }); });
      });
      L.member.forEach(function (ml) {
        ml.ids.forEach(function (mm) {
          if (!M.members[mm]) return;
          var Lm = S.memLen(M, mm), dirv, d = ml.dir || "", proj = 1;
          if (/^G[XYZ]$/.test(d)) dirv = gdir(M, d);
          else if (/^P[XYZ]$/.test(d)) { dirv = gdir(M, d); var ax = S.localAxes(M, mm).x, gi = { X: 0, Y: 1, Z: 2 }[d.charAt(1)]; proj = Math.sqrt(Math.max(0, 1 - ax[gi] * ax[gi])); }
          else if (/^[XYZ]$/.test(d)) { var la = S.localAxes(M, mm); dirv = S.tr(M, la[d.toLowerCase()]); if (d !== "Y" && !/^[Y]$/.test(d) && Math.abs(la.x[M.zup ? 2 : 1]) > 0.9999 && M.zup) notes.push("Local-axis member load on vertical member " + mm + " with SET Z UP — check its direction"); }
          else { notes.push("Member load direction '" + d + "' not understood (member " + mm + ")"); return; }
          var v = ml.v, Lfx = ml.Lf, F = ml.Ff, piece;
          if (ml.ty === "UNI") {
            var w = v[0] * F / Lfx * proj, a = v.length > 1 ? v[1] * Lfx : 0, b = v.length > 2 ? v[2] * Lfx : Lm;
            if (v.length > 3 && v[3]) notes.push("UNI load offset d3 ignored (member " + mm + ")");
            if (v.length === 2) b = Lm;
            piece = { k: "d", w1: dirv.map(function (x) { return x * w; }), w2: dirv.map(function (x) { return x * w; }), a: a, b: b, uni: true };
          } else if (ml.ty === "CON") {
            var P = v[0] * F, aa = v.length > 1 ? v[1] * Lfx : Lm / 2; piece = { k: "p", P: dirv.map(function (x) { return x * P; }), a: aa, L: Lm };
          } else if (ml.ty === "TRAP") {
            var w1 = v[0] * F / Lfx * proj, w2 = (v.length > 1 ? v[1] : v[0]) * F / Lfx * proj, a2 = v.length > 2 ? v[2] * Lfx : 0, b2 = v.length > 3 ? v[3] * Lfx : Lm;
            piece = { k: "d", w1: dirv.map(function (x) { return x * w1; }), w2: dirv.map(function (x) { return x * w2; }), a: a2, b: b2 };
          } else if (ml.ty === "LIN") {
            if (v.length >= 3 && v[2]) { var w3 = v[2] * F / Lfx; onParts(geo, mm, { k: "d", w1: [0, 0, 0], w2: dirv.map(function (x) { return x * w3; }), a: 0, b: Lm / 2 }, pushF); piece = { k: "d", w1: dirv.map(function (x) { return x * w3; }), w2: [0, 0, 0], a: Lm / 2, b: Lm }; }
            else { var l1 = v[0] * F / Lfx, l2 = (v[1] || 0) * F / Lfx; piece = { k: "d", w1: dirv.map(function (x) { return x * l1; }), w2: dirv.map(function (x) { return x * l2; }), a: 0, b: Lm }; }
          }
          if (piece) onParts(geo, mm, piece, pushF);
        });
      });
      L.elem.forEach(function (el) {
        el.ids.forEach(function (e) {
          (geo.std.emap[e] || []).forEach(function (k) {
            var v;
            if (el.dir === "LOCAL") {   /* local z: right-hand rule on the joint order */
              var P = M.elems[e].map(function (j) { return M.joints[j]; }).filter(Boolean);
              v = S.tr(M, unit(P.length > 3 ? crs(sub(P[2], P[0]), sub(P[3], P[1])) : crs(sub(P[1], P[0]), sub(P[2], P[0]))));
            } else v = gdir(M, el.dir);
            lc.shellP.push({ e: k, q: v.map(function (x) { return x * el.p; }) });
          });
        });
      });
      L.floor.forEach(function (fl) {
        var dirv = gdir(M, fl.dir || "GY"), pn = panels(M, fl);
        if (!pn.length) { notes.push("Load case " + L.id + ": FLOOR LOAD " + fl.p.toFixed(2) + " kN/m² found no closed rectangular panels in the ranges given — not applied"); return; }
        pn.forEach(function (pl) {
          floorPieces(M, pl, Math.abs(fl.p), fl.one).forEach(function (q) {
            var sg = fl.p < 0 ? -1 : 1;
            onParts(geo, q.m, { k: "d", w1: dirv.map(function (x) { return sg * x * q.w1; }), w2: dirv.map(function (x) { return sg * x * q.w2; }), a: q.a, b: q.b }, pushF);
          });
        });
        L.floorPanels = (L.floorPanels || 0) + pn.length;
      });
      L.eq.forEach(function (q) {
        var r = S.eq1893(M, geo, m, q.dir); if (!r) { notes.push("Load case " + L.id + ": 1893 LOAD without DEFINE 1893 LOAD — not applied"); return; }
        r.nodal.forEach(function (nl) { lc.nodal.push({ n: nl.n, f: nl.f.map(function (x) { return x * q.f; }) }); });
        eqInfo["L" + L.id] = Object.assign({}, r.info, { f: q.f, dir: q.dir });
      });
      L.wind.forEach(function (q) {
        var r = S.windLoad(M, geo, m, q.dir, q.type, q.f < 0 ? -1 : 1); if (!r) { notes.push("Load case " + L.id + ": WIND LOAD TYPE " + q.type + " has no DEFINE WIND LOAD intensities — not applied"); return; }
        r.nodal.forEach(function (nl) { lc.nodal.push({ n: nl.n, f: nl.f.map(function (x) { return x * Math.abs(q.f); }) }); });
        (windInfo["L" + L.id] = windInfo["L" + L.id] || []).push({ dir: q.dir, f: q.f, F: r.F * q.f, type: q.type });
      });
      L.repeat.forEach(function (rp) {
        var src = M.loads.filter(function (x) { return x.id === rp[0]; })[0]; if (!src) { notes.push("REPEAT LOAD in case " + L.id + " refers to undefined case " + rp[0]); return; }
        var o = lcOf(src), s = rp[1];
        o.nodal.forEach(function (x) { lc.nodal.push({ n: x.n, f: x.f.map(function (v) { return v * s; }) }); });
        o.frameUDL.forEach(function (x) { lc.frameUDL.push({ e: x.e, w: x.w.map(function (v) { return v * s; }) }); });
        o.frameLoads.forEach(function (x) { lc.frameLoads.push(x.k === "p" ? { e: x.e, k: "p", P: x.P.map(function (v) { return v * s; }), a: x.a } : { e: x.e, k: "d", w1: x.w1.map(function (v) { return v * s; }), w2: x.w2.map(function (v) { return v * s; }), a: x.a, b: x.b }); });
        o.shellP.forEach(function (x) { lc.shellP.push({ e: x.e, q: x.q.map(function (v) { return v * s; }) }); });
      });
      built[L.id] = lc; return lc;
    }
    M.loads.forEach(function (L) { var nm = "L" + L.id; cases[nm] = lcOf(L); names[L.id] = nm; titles[nm] = (L.title || "") + (L.type ? " [" + L.type + "]" : ""); });
    /* aliases DL / LL for the app's serviceability and footing checks */
    function kindOf(L) { var t = (L.type + " " + L.title).toUpperCase(); return /DEAD|\bDL\b|SELF/.test(t) || (!L.type && L.self.length && !/LIVE|LL|IMPOSED/.test(t)) ? "D" : /LIVE|\bLL\b|IMPOSED|ROOF LIVE/.test(t) ? "L" : /SEISMIC|EARTH|\bEQ|\bEL\b/.test(t) || L.eq.length ? "E" : /WIND|\bWL\b/.test(t) || L.wind.length ? "W" : "O"; }
    var dead = M.loads.filter(function (L) { return kindOf(L) === "D"; }), live = M.loads.filter(function (L) { return kindOf(L) === "L"; });
    function merge(list) { var o = { nodal: [], frameUDL: [], frameLoads: [], shellP: [] }; list.forEach(function (L) { var c = cases["L" + L.id]; ["nodal", "frameUDL", "frameLoads", "shellP"].forEach(function (k) { o[k] = o[k].concat(c[k]); }); }); return o; }
    if (dead.length) { cases.DL = merge(dead); titles.DL = "Dead = " + dead.map(function (L) { return "L" + L.id; }).join(" + "); }
    if (live.length) { cases.LL = merge(live); titles.LL = "Live = " + live.map(function (L) { return "L" + L.id; }).join(" + "); }
    var kinds = {}; M.loads.forEach(function (L) { kinds["L" + L.id] = kindOf(L); });
    /* seismic weights for the report and checks: IS 1893 W from the dead and live cases */
    var info = FE.prepare(m), W = [], Wt = 0;
    if (cases.DL) {
      var fd = FE.loadVector(m, cases.DL, null).Ffull, fl = cases.LL ? FE.loadVector(m, cases.LL, null).Ffull : null, zmax = -Infinity, zmin = Infinity;
      m.nodes.forEach(function (n) { zmax = Math.max(zmax, n.z); zmin = Math.min(zmin, n.z); });
      var llq = 0.25; m.nodes.forEach(function (n, i) { var roof = n.z > zmax - 0.05, w = -fd[6 * i + 2] - (fl && !roof ? llq * fl[6 * i + 2] : 0); W.push(n.z - zmin > 0.01 ? w : 0); Wt += W[i]; });
    }
    return { cases: cases, eq: {}, stdEq: eqInfo, wind: {}, stdWind: windInfo, wtor: {}, W: W, Wt: Wt, notes: notes, tor: null, snow: 0, pattern: false, std: true, titles: titles, kinds: kinds, names: names };
  };
  /* combinations of the file (or the app's IS 456 set built on DL/LL/EQ/WL when the file has none) */
  S.combos = function (L, geo, p) {
    var M = geo.std.M, out = [];
    M.combos.forEach(function (c) {
      var f = {}, ok = true;
      Object.keys(c.f).forEach(function (id) { var nm = L.names[id]; if (!nm) { var cb2 = M.combos.filter(function (x) { return x.id === +id; })[0]; if (cb2) { Object.keys(cb2.f).forEach(function (j) { var n2 = L.names[j]; if (n2) f[n2] = (f[n2] || 0) + c.f[id] * cb2.f[j]; }); return; } ok = false; return; } f[nm] = (f[nm] || 0) + c.f[id]; });
      if (!ok) L.notes.push("Combination " + c.id + " refers to an undefined load case — skipped");
      else if (Object.keys(f).length) out.push({ name: "C" + c.id + (c.title ? " " + c.title : ""), f: f, std: c.id });
    });
    if (!out.length) {
      L.notes.push("The STAAD file has no LOAD COMBINATION — primary load cases designed as given (factor 1.0). Add combinations in STAAD or use the app's loads.");
      Object.keys(L.cases).forEach(function (nm) { if (/^L\d+$/.test(nm)) { var f = {}; f[nm] = 1; out.push({ name: nm + " " + (L.titles[nm] || ""), f: f }); } });
    }
    return out;
  };

  /* ---------- IS 1893 equivalent static load as STAAD generates it from DEFINE 1893 LOAD ---------- */
  S.weights = function (M, geo, m) {
    var d = M.def1893, idx = geo.std.idx, w = new Float64Array(m.nodes.length);
    if (!d) return null;
    if (d.self) {
      m.frames.forEach(function (e, k) { var g = d.self * e.sec.gamma * e.sec.A * Math.hypot(m.nodes[e.n2].x - m.nodes[e.n1].x, m.nodes[e.n2].y - m.nodes[e.n1].y, m.nodes[e.n2].z - m.nodes[e.n1].z) / 2; w[e.n1] += g; w[e.n2] += g; });
      m.shells.forEach(function (s, k) { var A = area(m, s), g = d.self * s.mat.gamma * s.t * A / 4; s.n.forEach(function (v) { w[v] += g; }); });
    }
    d.joint.forEach(function (q) { q.ids.forEach(function (j) { if (idx[j] !== undefined) w[idx[j]] += Math.abs(q.w); }); });
    d.member.forEach(function (q) { q.ids.forEach(function (mm) { if (!M.members[mm]) return; var Lm = S.memLen(M, mm), a = q.d1 !== null ? q.d1 : 0, b = q.d2 !== null ? q.d2 : Lm, W0 = Math.abs(q.w) * (b - a), j = M.members[mm]; w[idx[j[0]]] += W0 * (1 - (a + b) / 2 / Lm); w[idx[j[1]]] += W0 * (a + b) / 2 / Lm; }); });
    d.elem.forEach(function (q) { q.ids.forEach(function (e) { (geo.std.emap[e] || []).forEach(function (k) { var s = m.shells[k], g = Math.abs(q.p) * area(m, s) / 4; s.n.forEach(function (v) { w[v] += g; }); }); }); });
    d.floor.forEach(function (q) {
      panels(M, q).forEach(function (pl) {
        var g = Math.abs(q.p) * (pl.x1 - pl.x0) * (pl.z1 - pl.z0) / 4;
        [[pl.x0, pl.z0], [pl.x1, pl.z0], [pl.x1, pl.z1], [pl.x0, pl.z1]].forEach(function (c) { var P = M.zup ? [c[0], c[1], pl.y] : [c[0], pl.y, c[1]], a = S.tr(M, P), best = -1, bd = 1e-3; m.nodes.forEach(function (n, i) { var dd = Math.hypot(n.x - a[0], n.y - a[1], n.z - a[2]); if (dd < bd) { bd = dd; best = i; } }); if (best >= 0) w[best] += g; });
      });
    });
    return w;
  };
  function area(m, s) { var P = s.n.map(function (v) { return m.nodes[v]; }); var c1 = crs([P[2].x - P[0].x, P[2].y - P[0].y, P[2].z - P[0].z], [P[3].x - P[1].x, P[3].y - P[1].y, P[3].z - P[1].z]); return Math.hypot(c1[0], c1[1], c1[2]) / 2; }
  S.eq1893 = function (M, geo, m, dir) {
    var d = M.def1893; if (!d) return null;
    var w = S.weights(M, geo, m), sup = m.sup || geo.sup, zb = Infinity, zt = -Infinity;
    Object.keys(sup).forEach(function (v) { zb = Math.min(zb, m.nodes[v].z); }); if (!isFinite(zb)) zb = Math.min.apply(null, m.nodes.map(function (n) { return n.z; }));
    m.nodes.forEach(function (n) { zt = Math.max(zt, n.z); });
    var h = zt - zb, dv = S.tr(M, { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[dir] || [1, 0, 0]), ax = Math.abs(dv[0]) > 0.5 ? 0 : 1;
    var lo = Infinity, hi = -Infinity; m.nodes.forEach(function (n) { var v = ax ? n.y : n.x; lo = Math.min(lo, v); hi = Math.max(hi, v); });
    var dd = Math.max(hi - lo, 1), Tg = ax ? (M.zup ? d.py : d.pz) : d.px;
    var T = Tg > 0 ? Tg : d.st === 2 ? 0.085 * Math.pow(h, 0.75) : d.st === 3 || d.st === 4 ? 0.09 * h / Math.sqrt(d.dt > 0 ? d.dt : dd) : 0.075 * Math.pow(h, 0.75);
    var soil = { 1: "I", 2: "II", 3: "III" }[d.ss] || "II", Sa = LD.saG(T, soil), dmf = U.interp([0, 0.02, 0.05, 0.07, 0.1, 0.15, 0.2, 0.25, 0.3], [3.2, 1.4, 1, 0.9, 0.8, 0.7, 0.6, 0.55, 0.5], d.dm || 0.05);
    var Ah = d.zone / 2 * d.I / d.rf * Sa * dmf, rho = d.zone <= 0.1 ? 0.007 : d.zone <= 0.16 ? 0.011 : d.zone <= 0.24 ? 0.016 : 0.024, Ahd = Math.max(Ah, rho);
    var Wt = 0, lv = {}; m.nodes.forEach(function (n, i) { if (n.z - zb < 0.01 || !w[i]) return; Wt += w[i]; var k = n.z.toFixed(2); (lv[k] = lv[k] || []).push(i); });
    var Vb = Ahd * Wt, den = 0; Object.keys(lv).forEach(function (k) { var Wi = lv[k].reduce(function (s, i) { return s + w[i]; }, 0); den += Wi * Math.pow(+k - zb, 2); });
    var nodal = [];
    Object.keys(lv).forEach(function (k) { lv[k].forEach(function (i) { var Q = Vb * w[i] * Math.pow(+k - zb, 2) / den, f = [0, 0, 0, 0, 0, 0]; f[0] = Q * dv[0]; f[1] = Q * dv[1]; f[2] = Q * dv[2]; nodal.push({ n: i, f: f }); }); });
    return { nodal: nodal, info: { T: T, Sa: Sa, Ah: Ah, Ahd: Ahd, W: Wt, Vb: Vb, H: h, d: dd, Z: d.zone, R: d.rf, I: d.I, soil: soil } };
  };
  /* wind: STAAD applies the intensity at each height to the exposed area; here the windward face width × storey height per level */
  S.windLoad = function (M, geo, m, dir, type, sgn) {
    var wd = M.wind[type] || M.wind[1]; if (!wd || !wd.p.length) return null;
    var d0 = String(dir || "X").replace(/^-/, ""), dv = S.tr(M, { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[d0.charAt(0)] || [1, 0, 0]), sg = (sgn || 1) * (/^-/.test(dir) ? -1 : 1), ax = Math.abs(dv[0]) > 0.5 ? 0 : 1, s0 = sg * ((ax ? dv[1] : dv[0]) > 0 ? 1 : -1);   /* s0 > 0: wind towards +axis, windward face at the minimum */
    var lv = MD.floorLevels(m), zmin = Math.min.apply(null, m.nodes.map(function (n) { return n.z; })), nodal = [], Ftot = 0;
    var lo = Infinity, hi = -Infinity; m.nodes.forEach(function (n) { var v = ax ? n.x : n.y; lo = Math.min(lo, v); hi = Math.max(hi, v); }); var B = Math.max(hi - lo, 1);   /* face width across the wind */
    function pAt(z) { for (var i = 0; i < wd.h.length; i++) if (z <= wd.h[i] + 1e-6) return wd.p[i]; return wd.p[wd.p.length - 1]; }
    lv.forEach(function (z, i) {
      if (i === 0) return;
      var hb = (z - lv[i - 1]) / 2 + (i + 1 < lv.length ? (lv[i + 1] - z) / 2 : 0), F = pAt(z - zmin) * B * hb;
      var at = []; m.nodes.forEach(function (n, j) { if (Math.abs(n.z - z) < 0.01) at.push(j); });
      var ext = s0 > 0 ? Infinity : -Infinity; at.forEach(function (j) { var v = ax ? m.nodes[j].y : m.nodes[j].x; ext = s0 > 0 ? Math.min(ext, v) : Math.max(ext, v); });
      var face = at.filter(function (j) { return Math.abs((ax ? m.nodes[j].y : m.nodes[j].x) - ext) < 0.01; }); if (!face.length) return;
      face.forEach(function (j) { var f = [0, 0, 0, 0, 0, 0]; f[0] = sg * F / face.length * dv[0]; f[1] = sg * F / face.length * dv[1]; nodal.push({ n: j, f: f }); });
      Ftot += F;
    });
    return { nodal: nodal, F: Ftot };
  };

  /* ---------- checks of the STAAD file itself ---------- */
  S.audit = function (M, geo, m) {
    var out = [];
    function add(sev, t, d, ref) { out.push({ sev: sev, t: t, d: d, ref: ref || "" }); }
    var kinds = {}, ids = {};
    M.loads.forEach(function (L) { ids[L.id] = L; var t = (L.type + " " + L.title).toUpperCase(); kinds[L.id] = /DEAD|\bDL\b/.test(t) || (L.self.length && !/LIVE|LL/.test(t)) ? "D" : /LIVE|\bLL\b|IMPOSED/.test(t) ? "L" : L.eq.length || /SEISMIC|EARTH|\bEQ/.test(t) ? "E" : L.wind.length || /WIND/.test(t) ? "W" : "O"; });
    /* wind loads that cancel inside one case */
    M.loads.forEach(function (L) {
      var by = {}; L.wind.forEach(function (w) { var k = w.dir.replace(/^-/, "") + "|" + w.type; by[k] = (by[k] || 0) + (w.dir.charAt(0) === "-" ? -1 : 1) * w.f; });
      Object.keys(by).forEach(function (k) { var n = L.wind.filter(function (w) { return w.dir.replace(/^-/, "") + "|" + w.type === k; }).length; if (n > 1 && Math.abs(by[k]) < 1e-9) add("high", "Wind loads cancel in load case " + L.id + (L.title ? " (" + L.title + ")" : ""), "WIND LOAD " + k.split("|")[0] + " is applied with factors that sum to zero in the same case — the net wind force is zero. Put each direction (+ and −) in its own load case.", "IS 875-3"); });
      var ebys = {}; L.eq.forEach(function (q) { ebys[q.dir] = (ebys[q.dir] || 0) + q.f; }); Object.keys(ebys).forEach(function (k) { if (L.eq.filter(function (q) { return q.dir === k; }).length > 1 && Math.abs(ebys[k]) < 1e-9) add("high", "Seismic loads cancel in load case " + L.id, "1893 LOAD " + k + " factors sum to zero in the same case.", "IS 1893"); });
    });
    /* self weight counted twice: SELFWEIGHT plus a member UDL equal to the member's own weight */
    var selfCases = M.loads.filter(function (L) { return L.self.length; });
    if (m) selfCases.forEach(function (L) {
      var hits = 0, ex = null;
      L.member.forEach(function (ml) { if (ml.ty !== "UNI" || ml.v.length > 1 || !/Y$|Z$/.test(ml.dir)) return; var w = Math.abs(ml.v[0] * ml.Ff / ml.Lf); ml.ids.forEach(function (mm) { var ks = geo.std.fmap[mm]; if (!ks || !ks.length) return; var s = m.frames[ks[0]].sec, g = s.gamma * s.A, g25 = 25 * s.A; if (Math.abs(w - g) < 0.03 * g || Math.abs(w - g25) < 0.03 * g25) { hits++; ex = ex || { m: mm, w: w, g: g }; } }); });
      if (hits) add("high", "Self weight possibly counted twice in load case " + L.id, hits + " member(s) carry a uniform load equal to their own weight (e.g. member " + ex.m + ": " + ex.w.toFixed(2) + " kN/m vs γA = " + ex.g.toFixed(2) + " kN/m) in a case that also has SELFWEIGHT.", "IS 875-1");
    });
    if (M.def1893 && M.def1893.self && m) {
      var d = M.def1893, hits2 = 0; d.member.forEach(function (q) { q.ids.forEach(function (mm) { var ks = geo.std.fmap[mm]; if (!ks || !ks.length) return; var s = m.frames[ks[0]].sec, g = s.gamma * s.A, g25 = 25 * s.A, w = Math.abs(q.w); if (Math.abs(w - g) < 0.03 * g || Math.abs(w - g25) < 0.03 * g25) hits2++; }); });
      if (hits2) add("high", "Seismic weight counts member self weight twice", "DEFINE 1893 LOAD has SELFWEIGHT and MEMBER WEIGHT equal to the members' own weight on " + hits2 + " member(s).", "IS 1893 cl 7.4");
    }
    /* seismic weight vs dead + 25/50 % live */
    if (M.def1893 && m) {
      try {
        var w = S.weights(M, geo, m), zb = Infinity; Object.keys(m.sup || {}).forEach(function (v) { zb = Math.min(zb, m.nodes[v].z); }); if (!isFinite(zb)) zb = Math.min.apply(null, m.nodes.map(function (n) { return n.z; }));
        var Wst = 0; m.nodes.forEach(function (n, i) { if (n.z - zb > 0.01) Wst += w[i]; });
        var L0 = S.cases(m, geo, {}), Wis = L0.Wt;
        if (Wis > 0) {
          var r = Wst / Wis;
          if (r < 0.9 || r > 1.25) add(r < 0.9 ? "high" : "med", "Seismic weight " + (r < 1 ? "low" : "high") + ": " + Math.round(Wst) + " kN in DEFINE 1893 LOAD vs " + Math.round(Wis) + " kN from the dead and live cases", "IS 1893 cl 7.4 takes the full dead load and 25 % (≤ 3 kN/m²) or 50 % of the floor imposed load (roof imposed load excluded). The file's weights are " + Math.round(r * 100) + " % of that, so the base shear is about " + Math.round(Math.abs(1 - r) * 100) + " % " + (r < 1 ? "low" : "high") + ".", "IS 1893 cl 7.4.2");
          else add("ok", "Seismic weight " + Math.round(Wst) + " kN agrees with dead + 25 % live (" + Math.round(Wis) + " kN)", "", "IS 1893 cl 7.4");
        }
      } catch (e) {}
    }
    /* combinations */
    var cb = M.combos;
    function has(c, k, sgn) { return Object.keys(c.f).some(function (id) { return kinds[id] === k && (sgn === undefined || Math.sign(c.f[id]) === sgn); }); }
    function fac(c, k) { var v = 0; Object.keys(c.f).forEach(function (id) { if (kinds[id] === k) v = Math.max(v, Math.abs(c.f[id])); }); return v; }
    var hasE = M.loads.some(function (L) { return kinds[L.id] === "E"; }), hasW = M.loads.some(function (L) { return kinds[L.id] === "W"; }), hasL = M.loads.some(function (L) { return kinds[L.id] === "L"; });
    if (!cb.length) add("high", "No load combinations", "The members are designed for the unfactored primary load cases. IS 456 Table 18 requires factored combinations.", "IS 456 cl 36.4");
    else {
      if (!cb.some(function (c) { return has(c, "D") && fac(c, "D") >= 1.49 && (!hasL || fac(c, "L") >= 1.49) && !has(c, "E") && !has(c, "W"); })) add("high", "No 1.5(DL + LL) combination", "The gravity design case is missing; " + (cb.some(function (c) { return fac(c, "D") >= 1.19 && fac(c, "D") < 1.49; }) ? "only 1.2 factors are used." : "check the combinations."), "IS 456 Table 18");
      var both = cb.filter(function (c) { return has(c, "E") && has(c, "W"); }); if (both.length) add("med", "Earthquake and wind in the same combination (" + both.map(function (c) { return c.id; }).join(", ") + ")", "They need not be taken as acting together; this is over-conservative.", "IS 875-5 cl 8 / IS 1893 cl 6.3");
      ["E", "W"].forEach(function (k) {
        if (!(k === "E" ? hasE : hasW)) return;
        var cs = cb.filter(function (c) { return has(c, k); });
        if (cs.length && !cs.some(function (c) { return has(c, k, -1); })) {
          var dirs = {}; M.loads.forEach(function (L) {   /* net sign per direction in each case (cancelling + and − in one case count as neither) */
            if (kinds[L.id] !== k) return; var net = {};
            (k === "E" ? L.eq : L.wind).forEach(function (q) { var d0 = q.dir.replace(/^-/, ""); net[d0] = (net[d0] || 0) + (q.dir.charAt(0) === "-" ? -1 : 1) * q.f; });
            Object.keys(net).forEach(function (d0) { dirs[d0] = (dirs[d0] || 0) | (net[d0] > 1e-9 ? 1 : net[d0] < -1e-9 ? 2 : 0); });
          });
          if (Object.keys(dirs).some(function (d) { return dirs[d] !== 3; })) add("high", "No load reversal for " + (k === "E" ? "earthquake" : "wind"), "Combinations only add the " + (k === "E" ? "seismic" : "wind") + " cases with + factors; −EL / −WL cases are missing.", "IS 1893 cl 6.3.2.2");
        }
        if (cs.length && !cs.some(function (c) { var dv = 0; Object.keys(c.f).forEach(function (id) { if (kinds[id] === "D") dv = c.f[id]; }); return dv > 0.85 && dv < 0.95 && !has(c, "L"); })) add("med", "No 0.9 DL ± 1.5 " + (k === "E" ? "EL" : "WL") + " combination", "Uplift / reversal in columns and footings is not checked.", "IS 456 Table 18");
      });
    }
    if (M.design.ran && cb.length && (M.design.list === null || (M.design.list || []).some(function (id) { return ids[id]; })) && !M.loadList) add("high", "Design uses primary load cases", "No LOAD LIST before START CONCRETE DESIGN — STAAD designs for every case including the unfactored primary loads (e.g. EQ alone).", "STAAD");
    /* plates */
    var big = 0, bmax = 0;
    Object.keys(M.elems).forEach(function (e) { var js = M.elems[e], P = js.map(function (j) { return M.joints[j]; }).filter(Boolean), mx = 0; for (var i = 0; i < P.length; i++) { var A = P[i], B = P[(i + 1) % P.length]; mx = Math.max(mx, Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2])); } if (mx > 2.0) big++; bmax = Math.max(bmax, mx); });
    if (big) add(geo.std.opt.mesh ? "info" : "high", big + " plate(s) larger than 2 m (largest side " + bmax.toFixed(1) + " m)", geo.std.opt.mesh ? "Subdivided here to " + geo.std.opt.mesh + " m." : "A single plate per bay, joined to the frame only at its corners, gives meaningless slab results and uncertain joint restraint. Use a plate mesh size of about 0.5 m when importing.", "FE practice");
    var seen = {}, dup = 0; Object.keys(M.elems).forEach(function (e) { var k = M.elems[e].slice().sort(function (a, b) { return a - b; }).join(","); if (seen[k]) dup++; seen[k] = 1; });
    if (dup) add("high", dup + " duplicate plate(s) on the same joints", "Plates or surfaces defined twice double the slab stiffness and any element self weight.", "FE practice");
    var dupS = 0; Object.keys(M.surfs).forEach(function (sf) { var k = M.surfs[sf].slice().sort(function (a, b) { return a - b; }).join(","); if (seen[k]) dupS++; });
    if (dupS) add("high", dupS + " surface(s) on the same outline as a plate", "Each slab panel is modelled twice — as a plate element and as a STAAD surface — doubling its stiffness and self weight. Keep one of them." + (geo.std.opt.surfaces ? " (Import option: leave surfaces out.)" : " Surfaces were left out of this import."), "FE practice");
    var dupm = 0, sm = {}; Object.keys(M.members).forEach(function (mm) { var j = M.members[mm].slice().sort(function (a, b) { return a - b; }).join(","); if (sm[j]) dupm++; sm[j] = 1; }); if (dupm) add("high", dupm + " duplicate member(s) between the same joints", "Duplicate members double the stiffness and self weight.", "FE practice");
    if (M.design.minsec >= 12) add("info", "MINSEC " + M.design.minsec + " mm", "STAAD will not use stirrups smaller than " + M.design.minsec + " mm.", "STAAD");
    return out;
  };

  /* checks of any analysed model (imported or built here): columns in tension under gravity, unloaded beams, net loads */
  S.modelChecks = function (Sx) {
    var m = Sx.m, res = Sx.res, out = []; if (!m || !res) return out;
    function add(sev, t, d, ref) { out.push({ sev: sev, t: t, d: d, ref: ref || "" }); }
    var L = Sx.L || {}, cases = L.cases || {}, kinds = L.kinds || {};
    /* net horizontal force of each lateral case */
    Object.keys(res.cases).forEach(function (cn) {
      var F = res.cases[cn].lv.Ffull, t = [0, 0, 0]; for (var i = 0; i < F.length; i += 6) { t[0] += F[i]; t[1] += F[i + 1]; t[2] += F[i + 2]; }
      var lat = /^(EQ|WL|T)/.test(cn) || kinds[cn] === "E" || kinds[cn] === "W", c = cases[cn] || {}, has = (c.nodal || []).length + (c.frameUDL || []).length + (c.frameLoads || []).length + (c.shellP || []).length;
      if (lat && has && Math.hypot(t[0], t[1]) < 1e-6 * Math.max(1, Math.abs(t[2]) + has)) add("high", "Load case " + cn + (L.titles && L.titles[cn] ? " (" + L.titles[cn] + ")" : "") + " has zero net horizontal force", "The loads in this case cancel each other.", "");
    });
    /* gravity: column axial forces under the dead + live cases */
    var g = {}; if (res.cases.DL) g.DL = 1; if (res.cases.LL) g.LL = 1;
    if (Object.keys(g).length) {
      var ten = [], small = [], Ucomb = new Float64Array(6 * m.nodes.length);
      Object.keys(g).forEach(function (c) { var u = res.cases[c].U; for (var i = 0; i < u.length; i++) Ucomb[i] += u[i]; });
      var qmix = m.frames.map(function (e, k) { var q = null; Object.keys(g).forEach(function (c) { var qq = res.cases[c].lv.qeq[k]; if (!qq) return; q = q || { w: [0, 0, 0], p: [] }; for (var d = 0; d < 3; d++) q.w[d] += qq.w[d]; if (qq.p) q.p = q.p.concat(qq.p); }); return q; });
      var Ptot = 0; m.frames.forEach(function (e, k) {
        var ff = FE.frameForces(m, k, Ucomb, qmix[k], 0), N = -ff.f[0];   /* tension + */
        if (e.type === "column") { var A = m.nodes[e.n1], B = m.nodes[e.n2], lo = Math.min(A.z, B.z); if (N > 1) ten.push([k, N, lo]); }
        if (e.type === "beam") { var dg = FE.frameDiagram(ff, 8), mx = 0, vx = 0; dg.forEach(function (q) { mx = Math.max(mx, Math.abs(q.Mz)); vx = Math.max(vx, Math.abs(q.Vy)); }); if (mx < 0.05 && vx < 0.05) small.push(k); }
      });
      if (ten.length) { ten.sort(function (a, b) { return b[1] - a[1]; }); add("high", ten.length + " column(s) in tension under dead + live load", "Largest: member " + (ten[0][0] + 1) + (m.frames[ten[0][0]].layer ? " (" + m.frames[ten[0][0]].layer + ")" : "") + " pulls " + ten[0][1].toFixed(1) + " kN. Columns of a building are compressed by gravity — check for gravity loads given upward (+Y) or a wrong sign.", "IS 456"); }
      var nb = m.frames.filter(function (e) { return e.type === "beam"; }).length;
      if (small.length && small.length >= Math.max(1, 0.1 * nb)) add("high", small.length + " of " + nb + " beams carry no gravity load", "Moments and shears under dead + live load are below 0.05 kN·m / kN — loads (even self weight) are not reaching them. Example: member " + (small[0] + 1) + (m.frames[small[0]].layer ? " (" + m.frames[small[0]].layer + ")" : "") + ".", "");
      /* vertical equilibrium: reactions vs applied */
      var Fz = 0; Object.keys(g).forEach(function (c) { var F = res.cases[c].lv.Ffull; for (var i = 2; i < F.length; i += 6) Fz += F[i]; });
      if (Fz > 1e-6) add("high", "Net gravity load acts upward (" + Fz.toFixed(1) + " kN)", "The dead + live cases push the structure up — a load direction sign is wrong.", "");
    }
    return out;
  };

  return S;
})();
if (typeof module !== "undefined") module.exports = STD;
