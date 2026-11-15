/* Professional platform: projects, automatic design, engineering verification mode, BOQ & schedules,
   calculation report, CAD drawing set & STAAD export, engineering assistant. */
var PRO = (function () {
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f(x, d) { return x === null || x === undefined || isNaN(x) ? "-" : (+x).toFixed(d === undefined ? 2 : d); }
  function tbl(head, rows, cls) { return '<div class="tw"><table' + (cls ? ' class="' + cls + '"' : '') + '><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join("") + '</tr>' + rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + (x === undefined ? "" : x) + '</td>'; }).join("") + '</tr>'; }).join("") + '</table></div>'; }
  function tblL(head, rows) { return tbl(head, rows, "tl"); }
  function $(id) { return document.getElementById(id); }
  function proj() { return typeof PDB !== "undefined" ? PDB.current() : null; }
  function dstr(t) { return t ? new Date(t).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }
  function day(t) { return t ? new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : ""; }
  var STATUS = ["Concept", "Design", "For check", "Checked", "Issued", "On hold"];
  var VCOL = { Verified: "vchip v3", Calculated: "vchip v2", Simplified: "vchip v1", "Not implemented": "vchip v0" };
  function chip(st, txt) { return '<span class="' + (VCOL[st] || "vchip") + '">' + esc(txt || st) + '</span>'; }
  function tcmax(fck) { var t = [[15, 2.5], [20, 2.8], [25, 3.1], [30, 3.5], [35, 3.7], [40, 4.0]], v = 2.5; t.forEach(function (q) { if (fck >= q[0]) v = q[1]; }); return v; }

  /* ================================================================ PROJECTS */
  function projectsView(app, title, back, ctx) {
    title.textContent = "Projects"; back.hidden = false;
    var cur = PDB.current(), list = PDB.list(), q = (projectsView.q || "").toLowerCase();
    var h = '<div class="rep"><div class="rh"><div><h3>' + esc(cur.name) + '</h3><small>Current project · ' + esc(cur.status) + ' · engine ' + esc(cur.engine) + (cur.engine !== REG.ENGINE ? ' (now ' + REG.ENGINE + ' — re-run the analysis)' : '') + '</small></div><span class="badge ' + (cur.summary && !cur.summary.memberFails && !cur.summary.detailFails ? "pass" : "fail") + '">' + (cur.summary ? (cur.summary.memberFails + (cur.summary.detailFails || 0) ? (cur.summary.memberFails + (cur.summary.detailFails || 0)) + " FAIL" : "ALL OK") : "NOT RUN") + '</span></div>';
    h += '<div class="form" id="pform">' + [["name", "Project name"], ["jobNo", "Job / file no."], ["client", "Client"], ["site", "Site / location"], ["engineer", "Design engineer"], ["checker", "Checking engineer"]].map(function (k) { return '<label class="fld"><span>' + k[1] + '</span><input data-pk="' + k[0] + '" value="' + esc(cur[k[0]]) + '"></label>'; }).join("") +
      '<label class="fld"><span>Status</span><select data-pk="status">' + STATUS.map(function (s) { return '<option' + (s === cur.status ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select></label>' +
      '<label class="fld full"><span>Notes</span><textarea data-pk="notes" rows="2">' + esc(cur.notes) + '</textarea></label>' +
      '<div class="btns full"><button class="pri" id="pSave" type="button">Save details</button><a class="btnl" href="#model">Open model ›</a></div></div>';
    if (cur.summary) { var s = cur.summary; h += '<div class="sum"><div><span>Last analysis</span><b>' + dstr(s.date) + '</b></div><div><span>Members / failing</span><b>' + s.members + ' / ' + s.memberFails + (s.detailFails !== null ? ' · detailing ' + s.detailFails : '') + '</b></div><div><span>Concrete · steel</span><b>' + f(s.concrete_m3, 1) + ' m³ · ' + f(s.steel_t, 2) + ' t</b></div>' + (s.cost ? '<div><span>Cost from your rates</span><b>₹ ' + s.cost.toLocaleString("en-IN") + '</b></div>' : '') + '</div>'; }
    h += '<h4>Revisions</h4>' + ((cur.revs || []).length ? tbl(["Rev", "Date", "By", "Note", "Engine", "Result"], cur.revs.slice().reverse().map(function (r) { return ["<b>" + esc(r.rev) + "</b>", day(r.date), esc(r.by), esc(r.note), esc(r.engine), r.summary ? (r.summary.memberFails + (r.summary.detailFails || 0) ? '<span class="not">' + (r.summary.memberFails + (r.summary.detailFails || 0)) + ' fail</span>' : '<span class="okt">all OK</span>') + ' · ' + f(r.summary.steel_t, 2) + ' t' : "not run"]; })) : '<div class="note">No revision issued yet. Issuing a revision freezes the inputs, the result summary, the engine and the code editions.</div>');
    h += '<div class="btns"><input id="revNote" placeholder="Revision note (e.g. issued for checking)" style="flex:2"><button id="pIssue" type="button">Issue revision</button></div>';
    h += '<details><summary>Activity log (' + (cur.log || []).length + ')</summary>' + tbl(["When", "What"], (cur.log || []).slice(-30).reverse().map(function (l) { return [dstr(l.t), esc(l.a)]; })) + '</details></div>';
    h += '<div class="rep"><div class="rh"><div><h3>All projects</h3><small>Stored on this device (' + (PDB.mode() === "idb" ? "IndexedDB" : PDB.mode() === "ls" ? "local storage" : "memory") + ') — export or back up to keep a copy elsewhere</small></div></div>';
    h += '<div class="btns"><button class="pri" id="pNew" type="button">New project</button><button id="pImp" type="button">Import / restore…</button><button id="pBak" type="button">Back up all</button></div><input type="file" id="pFile" accept=".isdp,.json,application/json" hidden>';
    h += '<input id="pQ" placeholder="Search name, job no., client, site…" value="' + esc(projectsView.q || "") + '" style="margin:6px 0">';
    list.filter(function (p) { return !q || [p.name, p.jobNo, p.client, p.site, p.engineer].join(" ").toLowerCase().indexOf(q) >= 0; }).forEach(function (p) {
      var s = p.summary;
      h += '<div class="prow' + (p.id === cur.id ? " cur" : "") + '"><div><b>' + esc(p.name) + '</b> <span class="stchip st' + STATUS.indexOf(p.status) + '">' + esc(p.status) + '</span><br><small>' + esc([p.jobNo, p.client, p.site].filter(Boolean).join(" · ")) + (p.jobNo || p.client || p.site ? " · " : "") + 'modified ' + dstr(p.modified) + (s ? ' · ' + (s.memberFails + (s.detailFails || 0) ? (s.memberFails + (s.detailFails || 0)) + ' fail' : 'all OK') + ' · ' + f(s.steel_t, 2) + ' t steel' : '') + ((p.revs || []).length ? ' · ' + p.revs[p.revs.length - 1].rev : '') + '</small></div>' +
        '<div class="pbtn">' + (p.id === cur.id ? '<span class="okt">open</span>' : '<button data-po="' + p.id + '">Open</button>') + '<button data-pd="' + p.id + '">Copy</button><button data-pe="' + p.id + '">Export</button><button data-px="' + p.id + '" class="del">Delete</button></div></div>';
    });
    h += '</div>';
    app.innerHTML = h;
    function rerender() { projectsView(app, title, back, ctx); }
    $("pSave").onclick = function () { var o = {}; app.querySelectorAll("[data-pk]").forEach(function (el) { o[el.getAttribute("data-pk")] = el.value.trim(); });
      if (o.status === "Checked" || o.status === "Issued") { var v = verifyState(cur); if (v.open) ctx.toast("Note: " + v.open + " verification item(s) still open"); }
      PDB.update(cur.id, o); ctx.toast("Project saved"); rerender(); };
    $("pIssue").onclick = function () { PDB.issue($("revNote").value.trim(), cur.engineer); ctx.toast("Revision issued"); rerender(); };
    $("pNew").onclick = function () { var p = PDB.create("Project " + (PDB.list().length + 1)); ctx.opened(p); rerender(); };
    $("pBak").onclick = function () { ctx.download("isd-backup-" + new Date().toISOString().slice(0, 10) + ".json", PDB.exportAll()); };
    $("pImp").onclick = function () { $("pFile").click(); };
    $("pFile").onchange = function () { var fl = this.files[0]; if (!fl) return; var rd = new FileReader(); rd.onload = function () { try { var a = PDB.importText(rd.result); ctx.toast("Imported " + a.length + " project(s)"); rerender(); } catch (e) { ctx.toast(e.message); } }; rd.readAsText(fl); };
    $("pQ").oninput = function () { projectsView.q = this.value; var pos = this.selectionStart; rerender(); var el = $("pQ"); el.focus(); el.setSelectionRange(pos, pos); };
    app.querySelectorAll("[data-po]").forEach(function (b) { b.onclick = function () { var p = PDB.open(b.getAttribute("data-po")); ctx.opened(p); location.hash = "#model"; }; });
    app.querySelectorAll("[data-pd]").forEach(function (b) { b.onclick = function () { PDB.duplicate(b.getAttribute("data-pd")); ctx.toast("Copied"); rerender(); }; });
    app.querySelectorAll("[data-pe]").forEach(function (b) { b.onclick = function () { var p = PDB.get(b.getAttribute("data-pe")); ctx.download((p.name || "project").replace(/[^\w\- ]+/g, "_") + ".isdp", PDB.exportOne(p.id)); }; });
    app.querySelectorAll("[data-px]").forEach(function (b) { b.onclick = function () {
      if (b.getAttribute("data-arm") !== "1") { b.setAttribute("data-arm", "1"); b.textContent = "Tap again to delete"; setTimeout(function () { b.removeAttribute("data-arm"); b.textContent = "Delete"; }, 3000); return; }
      var id = b.getAttribute("data-px"), wasCur = id === PDB.current().id; PDB.remove(id); if (wasCur) ctx.opened(PDB.current()); ctx.toast("Deleted"); rerender(); }; });
  }

  /* ================================================================ DESIGN SUMMARY (member groups, utilisation) */
  function summary(S) {
    var d = S.des, dt = S.det && !S.det.err && S.det.gB ? S.det : null, rows = [], byK = {};
    if (!d) return rows;
    d.beams.forEach(function (r) { byK["b" + r.k] = r; }); d.cols.forEach(function (r) { byK["c" + r.k] = r; });
    var duct = dt ? dt.cf.duct : false;
    if (dt) {
      dt.gB.forEach(function (G) {
        var u = 0, ok = true, why = "";
        G.list.forEach(function (bl) { bl.seq.forEach(function (it) { var r = byK["b" + it.k]; if (!r) return; if (!r.ok) ok = false; var pmax = (duct ? 0.025 : 0.04) * r.b * r.d, uu = Math.max(Math.max(r.Ab, r.At) / pmax, r.tv / tcmax(r.fck)); if (uu > u) { u = uu; why = Math.max(r.Ab, r.At) / pmax > r.tv / tcmax(r.fck) ? "steel / ρmax" : "τv / τc,max"; } }); if (bl.checks.some(function (q) { return !q.ok; })) ok = false; });
        rows.push({ kind: "beam", id: G.id, mem: G.list.map(function (b) { return b.name; }).join(", "), res: G.rep.b + "×" + G.rep.D + " · top " + Math.max.apply(null, G.rep.sup.map(function (s) { return s.nt; })) + "-" + G.rep.dia + "φ, bottom " + Math.max.apply(null, G.rep.spans.map(function (s) { return s.nb; })) + "-" + G.rep.dia + "φ", u: u, why: why, ok: ok && u <= 1 + 1e-9 });
      });
      dt.gC.forEach(function (G) {
        var u = 0, ok = true, why = "";
        G.list.forEach(function (c) {
          c.st.forEach(function (s) { s.els.forEach(function (k) { var r = byK["c" + k]; if (!r) return; if (!r.ok) { ok = false; u = Math.max(u, 9.99); why = "design"; } else if (r.need && r.need.r > u) { u = r.need.r; why = "P–M interaction"; } }); });
          dt.scwb.filter(function (q) { return q.colRef === c; }).forEach(function (q) { if (1.4 / q.r > u) { u = 1.4 / q.r; why = "strong column–weak beam"; } if (!q.ok) ok = false; });
          dt.joints.filter(function (q) { return q.colRef === c; }).forEach(function (q) { if (q.r > u) { u = q.r; why = "joint shear"; } if (!q.ok || !q.anch) ok = false; });
          if (c.checks.some(function (q) { return !q.ok; })) ok = false;
        });
        var s0 = G.rep.st[0];
        rows.push({ kind: "column", id: G.id, mem: G.list.map(function (c) { return c.name; }).join(", "), res: s0.b + "×" + s0.D + " · " + G.rep.st.map(function (s) { return s.ar.n + "-" + s.ar.dia + "φ"; }).join(" / "), u: u, why: why, ok: ok && u <= 1 + 1e-9 });
      });
      (dt.gW || []).forEach(function (G) {
        var w = G.rep, u = 0, why = "";
        w.storeys.forEach(function (st) { if (st.worst > u) { u = st.worst; why = "P–M"; } if (st.tv / st.tcm > u) { u = st.tv / st.tcm; why = "τv / τc,max"; } if (st.be && st.Pbe / st.beCap > u) { u = st.Pbe / st.beCap; why = "boundary element"; } });
        rows.push({ kind: "wall", id: G.id, mem: G.list.map(function (x) { return x.name; }).join(", "), res: w.t + " × " + Math.round(w.Lw) + " · " + w.storeys[0].vb.dia + "φ@" + w.storeys[0].vb.s + " / " + w.storeys[0].hb.dia + "φ@" + w.storeys[0].hb.s, u: u, why: why, ok: !w.checks.some(function (q) { return !q.ok; }) && u <= 1 + 1e-9 });
      });
      dt.slabs.forEach(function (fl, i) {
        var u = 0; fl.panels.forEach(function (P) { u = Math.max(u, Math.max(P.req.bX, P.amin) / P.bot.X.As, Math.max(P.req.bY, P.amin) / P.bot.Y.As); });
        rows.push({ kind: "slab", id: "S" + (i + 1), mem: fl.name, res: "t " + fl.t + " · " + fl.panels.length + " panels", u: u, why: "Ast req / prov", ok: u <= 1 + 1e-9 && !fl.panels.some(function (P) { return P.msg.length; }) });
      });
      dt.gF.forEach(function (G) {
        var ft = G.rep, u = Math.max(ft.gov.u, ft.tv[0] / ft.tc[0], ft.tv[1] / ft.tc[1], ft.tp / ft.kp, ft.fact / ft.fbr), why = u === ft.gov.u ? "soil pressure" : u === ft.tp / ft.kp ? "punching" : "shear / bearing";
        rows.push({ kind: "footing", id: G.id, mem: G.list.map(function (c) { return c.name; }).join(", "), res: ft.Lx + "×" + ft.Ly + "×" + ft.D + " · " + ft.bx.dia + "φ@" + ft.bx.s + " / " + ft.by.dia + "φ@" + ft.by.s, u: u, why: why, ok: !ft.checks.some(function (q) { return !q.ok; }) });
      });
    }
    if (d.steel.length) { var ws = d.steel.slice().sort(function (a, b) { return b.ratio - a.ratio; }); rows.push({ kind: "steel", id: "ST", mem: d.steel.length + " steel members", res: "worst " + ws[0].name, u: ws[0].ratio, why: "IS 800 interaction", ok: d.steel.every(function (r) { return r.ok; }) }); }
    rows.forEach(function (r) { r.v = REG.state(REG.KIND[r.kind] || []); });
    return rows;
  }

  /* ================================================================ VERIFICATION MODE */
  /* items the checking engineer must close: every applicable check that is not independently verified, and every failure */
  function vItems(S) {
    var m = S.m, items = [], has = { wall: m.shells.some(function (s) { return s.kind === "wall"; }), slab: m.shells.some(function (s) { return s.kind === "slab"; }), steel: m.frames.some(function (e) { return e.sec.kind === "steel"; }), rcc: m.frames.some(function (e) { return e.sec.kind === "rcc"; }), eq: !!(S.p && S.p.eq), wsm: S.p && S.p.method === "wsm", wind: !!(S.p && S.p.wind) };
    var app = { pdelta: !!(S.res && S.res.pd), pushover: !!S.po, rcwall: has.wall, rcwallel: has.wall, rcslab: has.slab, dtslab: has.slab, stfcd: has.steel, stltb: has.steel, stklen: has.steel, rcbeam: has.rcc, rccol: has.rcc, dtbeam: has.rcc, dtcol: has.rcc, scwb: has.rcc && has.eq, joint: has.rcc && has.eq,
      spectrum: has.eq, statbase: has.eq, modal: has.eq && S.p.rsa, rsa: has.eq && S.p.rsa, torsion: has.eq, irreg: has.eq, timehist: has.eq, wind: has.wind, wsmwall: has.wsm && has.wall, foot: has.rcc, footpress: has.rcc, foundmore: has.rcc, servic: has.rcc, bbs: has.rcc, boq: !!S.boq, auto: !!S.autoRes };
    REG.IDS.forEach(function (id) {
      var r = REG.byId(id); if (!r) return;
      if (app[id] === false || (app[id] === undefined && ["frame", "shell", "modelchk"].indexOf(id) < 0)) return;
      if (id === "shell" && !m.shells.length) return;
      if (r.st === "Verified") return;
      items.push({ key: "chk:" + id, area: r.area, t: r.t, st: r.st, why: r.st === "Not implemented" ? "Not done by the app — check by hand or other software" : r.st === "Simplified" ? "Approximation — confirm it is acceptable for this project: " + r.ev : "Not independently benchmarked — spot-check by hand: " + r.ev });
    });
    summary(S).filter(function (r) { return !r.ok; }).forEach(function (r) { items.push({ key: "fail:" + r.kind + ":" + r.id, area: "Failing result", t: r.kind + " " + r.id + " (" + r.mem.slice(0, 60) + ")", st: "FAIL", why: "Governing: " + r.why + ", utilisation " + f(r.u, 2) + " — redesign, or record why it is acceptable" }); });
    if (S.det && !S.det.err) {
      var sw = S.det.scwb.filter(function (q) { return !q.ok; }).length, jj = S.det.joints.filter(function (q) { return !q.ok || !q.anch; }).length;
      if (sw) items.push({ key: "fail:scwb", area: "Failing result", t: sw + " strong column–weak beam joint checks", st: "FAIL", why: "IS 13920 cl 7.2.1 — enlarge columns (Automatic design does this)" });
      if (jj) items.push({ key: "fail:joint", area: "Failing result", t: jj + " beam–column joint checks", st: "FAIL", why: "IS 13920 cl 9 — enlarge columns or use higher concrete grade" });
      var ov = S.det.foot.filter(function (ft) { return ft.warn && ft.warn.length; }).length;
      if (ov) items.push({ key: "fail:overlap", area: "Failing result", t: ov + " overlapping isolated footings", st: "FAIL", why: "Design a combined footing or raft separately" });
    }
    (S.drift || []).filter(function (q) { return q.ok === false; }).slice(0, 1).forEach(function () { items.push({ key: "fail:drift", area: "Failing result", t: "Storey drift > 0.004h", st: "FAIL", why: "IS 1893 cl 7.11.1 — stiffen the structure" }); });
    var dfl = S.p && S.p.entered ? ["sbc", "fck", "fy", "zone", "soil", "ll", "I", "R"].filter(function (k) { return S.p.entered.indexOf(k) < 0; }) : [];
    if (dfl.length) items.push({ key: "inp:defaults", area: "Inputs", t: "Values taken as defaults: " + dfl.join(", "), st: "Calculated", why: "Confirm each against the soil report, architectural drawings and the client brief" });
    return items;
  }
  function verifyState(p, S) {
    var it = S ? vItems(S) : [], rv = (p && p.review) || {}, open = 0, query = 0, fails = 0;
    it.forEach(function (i) { var r = rv[i.key]; if (i.st === "FAIL") { if (!r || r.state !== "ok") fails++; } if (!r) open++; else if (r.state === "query") query++; });
    return { items: it, open: open, query: query, fails: fails, total: it.length };
  }
  function vClass(v) {
    if (v.fails) return ["vno", "Not acceptable", v.fails + " failing result(s) not resolved"];
    if (v.open || v.query) return ["vmid", "Calculated result", (v.open + v.query) + " of " + v.total + " verification item(s) open — not yet a verified engineering result"];
    return ["vok", "Verified engineering result", "All checks pass and every non-benchmarked, simplified or missing check has been reviewed and signed off"];
  }
  function vBlock(S) {
    var p = proj(), v = verifyState(p, S), c = vClass(v), rv = (p && p.review) || {}, h = '<div class="vbox ' + c[0] + '"><b>' + c[1] + '</b><br><small>' + esc(c[2]) + '</small></div>';
    var sm = summary(S);
    if (sm.length) h += '<h4>Design summary — result, utilisation and verification state</h4>' + tblL(["Group", "Members", "Result", "Utilisation", "Governing", "Status", "Verification"], sm.map(function (r) { return ["<b>" + r.id + "</b>", esc(r.mem.length > 46 ? r.mem.slice(0, 44) + "…" : r.mem), esc(r.res), '<span class="' + (r.u > 1 ? "not" : r.u > 0.9 ? "warnt" : "") + '">' + f(r.u, 2) + '</span>', esc(r.why), r.ok ? '<span class="okt">PASS</span>' : '<span class="not">FAIL</span>', r.v ? chip(r.v.st, r.v.st + (r.v.st !== "Verified" ? ": " + r.v.t.split(" (")[0].slice(0, 34) : "")) : ""]; })) +
      '<div class="note">Utilisation = governing ratio of demand to capacity (beams: max(steel/ρmax·bd, τv/τc,max); columns: P–M ratio, 1.4/(ΣMc/ΣMb), joint Vj/capacity; footings: pressure/SBC, shear, punching; walls: M/Mcap, τv/τc,max, boundary element; slabs: Ast required/provided). The verification state is the weakest of the checks behind the result.</div>';
    h += '<h4>Checking engineer\'s list — ' + (v.total - v.open) + ' of ' + v.total + ' reviewed</h4><div class="vprog"><i style="width:' + (v.total ? 100 * (v.total - v.open) / v.total : 100).toFixed(0) + '%"></i></div>';
    h += '<div class="btns"><input id="vBy" placeholder="Reviewer name" value="' + esc((p && (p.checker || p.engineer)) || "") + '" style="flex:1"></div>';
    h += v.items.map(function (i) {
      var r = rv[i.key];
      return '<div class="vitem' + (r ? " r-" + r.state : "") + '"><div><span class="' + (i.st === "FAIL" ? "vchip vf" : VCOL[i.st] || "vchip") + '">' + esc(i.st) + '</span> <b>' + esc(i.t) + '</b><br><small>' + esc(i.area) + ' · ' + esc(i.why) + '</small>' + (r ? '<br><small class="vsign">' + { ok: "✔ Accepted", query: "? Query", na: "– Not applicable" }[r.state] + ' by ' + esc(r.by || "—") + ', ' + day(r.date) + (r.note ? ' — ' + esc(r.note) : '') + '</small>' : '') + '</div>' +
        '<div class="vbtn"><button data-vk="' + esc(i.key) + '" data-vs="ok">Accept</button><button data-vk="' + esc(i.key) + '" data-vs="query">Query</button><button data-vk="' + esc(i.key) + '" data-vs="na">N/A</button>' + (r ? '<button data-vk="' + esc(i.key) + '" data-vs="">Clear</button>' : '') + '</div></div>';
    }).join("");
    return h;
  }
  /* small verification chips next to the result headings */
  function chips(h) {
    var map = [[/<h4>RCC beams/, "beam"], [/<h4>RCC columns/, "column"], [/<h4>Steel members/, "steel"], [/<h4>Slabs/, "slab"], [/<h4>Walls/, "wall"]];
    map.forEach(function (q) { var st = REG.state(REG.KIND[q[1]]); if (st) h = h.replace(q[0], function (s0) { return s0.replace("<h4>", "<h4>" + chip(st.st) + " "); }); });
    return h;
  }

  /* ================================================================ BOQ & SCHEDULES */
  function boqBlock(S) {
    var b = S.boq; if (!b) return "";
    var p = proj(), rates = (p && p.rates) || {}; BOQ.price(b, rates);
    var h = '<div class="sum"><div><span>Concrete</span><b>' + f(b.conc, 2) + ' m³</b></div><div><span>Reinforcement</span><b>' + f(b.steelKg / 1000, 3) + ' t · ' + f(b.ratio, 0) + ' kg/m³</b></div>' + (b.amount ? '<div><span>Amount at your rates</span><b>₹ ' + Math.round(b.amount).toLocaleString("en-IN") + '</b></div>' : '') + '</div>';
    h += tblL(["Item", "Description", "Unit", "Quantity", "Rate (₹)", "Amount (₹)"], b.items.map(function (it, i) { return [i + 1, esc(it.desc) + (it.grade ? " (" + it.grade + ")" : ""), it.unit, f(it.qty, it.unit === "kg" ? 0 : 2), '<input class="rate" data-ri="' + it.id + '" type="number" step="any" inputmode="decimal" value="' + (rates[it.id] || "") + '" placeholder="rate">', it.amt ? Math.round(it.amt).toLocaleString("en-IN") : ""]; }));
    h += '<div class="note">Enter rates from your schedule of rates (they are saved with the project and used in the report and Excel). Measurement: columns floor-to-floor less the slab, with necks from the footing to the plinth (founding depth ' + f(b.Df, 2) + ' m); beams below the slab between column faces; slabs over the panels; walls between end columns; PCC 100 mm with 100 mm offset; excavation with 300 mm working space; steel from the bar bending schedule (no wastage).</div>';
    h += tbl(["Bar φ", "kg"], Object.keys(b.byDia).map(Number).sort(function (a, c) { return a - c; }).map(function (k) { return [k + " mm", f(b.byDia[k], 0)]; }));
    var sc = b.schedules;
    [["cols", "Column schedule"], ["beams", "Beam schedule"], ["slabs", "Slab schedule"], ["walls", "Wall schedule"], ["foot", "Footing schedule"]].forEach(function (g) { if (sc[g[0]].length) h += '<h4>' + g[1] + '</h4>' + tblL(BOQ.HEAD[g[0]], sc[g[0]].map(function (r) { return r.map(esc); })); });
    return h;
  }

  /* ================================================================ ENGINEERING ASSISTANT */
  var KB = [
    [["scwb", "strong column", "weak beam", "7.2.1"], "Strong column – weak beam (IS 13920:2016 cl 7.2.1)", "At every joint the sum of the column moment capacities (at the least favourable axial load) must be at least 1.4 × the sum of the beam capacities in the same plane, so that plastic hinges form in beams and not in columns. Fix by enlarging the columns, raising the concrete grade or column steel, or reducing beam top steel that is not needed. Automatic design enlarges the columns storey by storey."],
    [["joint", "vj", "cl 9", "joint shear"], "Beam–column joint shear (IS 13920 cl 9)", "Vj = 1.25fy(Ast,top + Ast,bot) − Vcol must not exceed k√fck·Aej with k = 1.5 (beams ≥ ¾ column width on all four faces), 1.2 (three faces or two opposite) or 1.0. Aej = bj·hc. Larger columns, wider beams and higher fck all help. The column depth must also be ≥ 20 × the largest beam bar."],
    [["confin", "lo ", "special confining", "ash", "hoop"], "Column confinement (IS 13920 cl 8)", "Over lo = max(D, Lc/6, 450 mm) at each end and through the joint, hoops at s ≤ min(B/4, 6φ, 100) with Ash ≥ max(0.18 s h fck/fy (Ag/Ak − 1), 0.05 s h fck/fy); parallel hoop legs ≤ 300 mm apart (crossties)."],
    [["lap", "splice"], "Lap splices", "Beams: max(Ld, 30φ), not within joints or 2d from the faces, hoops at ≤ 150 mm over the lap (IS 13920 cl 6.2.6). Columns: only in the central half of the clear height (cl 7.2.1). The app staggers stock-length splices accordingly."],
    [["develop", "ld", "anchorage"], "Development length", "Ld = φ·σs/(4τbd) with τbd from IS 456 cl 26.2.1.1, +60 % for deformed bars. In ductile frames beam bars anchor Ld + 10φ beyond the inner column face with a 90° bend (IS 13920 cl 6.2.5)."],
    [["drift", "0.004"], "Storey drift (IS 1893 cl 7.11.1)", "Relative storey displacement under unfactored lateral load ≤ 0.004h. Increase column/wall stiffness if it is exceeded; drift is checked at vertically stacked nodes."],
    [["torsional", "irregular", "dmax", "Δmax"], "Torsional irregularity (Table 5)", "Δmax/Δave > 1.2 → torsionally irregular; > 1.4 → not permitted (Amendment 2). The 2016 text used Δmax/Δmin 1.5/2.0. Balance the stiffness in plan (walls on both sides)."],
    [["soft storey", "stiffness irregular"], "Soft storey (Table 6)", "Storey stiffness less than that of the storey above (2016 definition) — typical of open ground storeys. Stiffen the storey or design to cl 7.10."],
    [["cqc", "srss", "modal combin"], "Modal combination (cl 7.7.5.4)", "CQC with 5 % damping is used unless SRSS is chosen; closely spaced modes need CQC."],
    [["scal", "base shear", "7.7.3"], "Scaling of response spectrum results (cl 7.7.3)", "If the dynamic base shear is less than the static VB from the empirical period, forces are scaled up by VB/Vdyn. Amendment 2 does not require scaling of displacements; the app scales forces only unless you choose otherwise."],
    [["accidental", "eccentric", "7.8.2"], "Accidental torsion (cl 7.8.2)", "Design eccentricity edi = 1.5esi ± 0.05bi; the app adds torque cases TXa/TXb/TYa/TYb at the floors and combines them with EQX/EQY."],
    [["participat", "modes", "90"], "Modal mass participation (cl 7.7.5.2)", "Enough modes to capture ≥ 90 % of the seismic mass in each direction; increase the number of modes if a warning appears."],
    [["boundary", "wall"], "Shear walls (IS 13920 cl 10)", "Walls are designed as piers per storey: P–M by strain compatibility, shear with horizontal steel ≥ 0.25 %, two curtains when tw ≥ 200 or τv > 0.25√fck, boundary elements where Pu/A + 6Mu/(tLw²) > 0.2fck."],
    [["footing", "sbc", "bearing", "punch"], "Isolated footings (IS 456 cl 34)", "Sized for service loads (DL+LL ≤ SBC; with EQ ≤ 1.5/1.25/1.0 × SBC for soil I/II/III, IS 1893 Table 1); depth by bending, one-way shear at d and punching at d/2 (ks·0.25√fck). Confirm SBC from a soil investigation."],
    [["bbs", "cutting length", "bend", "2502"], "Bar bending schedule (IS 2502 / SP 34)", "Cutting length = straight + legs − 2φ per 90° bend; hoops 2(A+B) + 2 hooks − 12φ with hook allowance max(10φ, 75 mm); weight φ²/162 kg/m."],
    [["verif", "verified", "calculated", "simplified"], "Engineering verification mode", "Every check is Verified (independent benchmark), Calculated, Simplified or Not implemented; a result is a verified engineering result only when it passes and the checking engineer has accepted every non-verified item."],
    [["auto", "optimi", "resize"], "Automatic design", "Runs analysis → design → detailing repeatedly, enlarging columns (+50 mm) and beams (+50 mm depth) in the storeys that fail until every check passes; the sizes are written as section rules you can edit."],
    [["boq", "quantit", "estimate", "rate"], "Bill of quantities", "Quantities follow IS 1200 style measurement from the designed model; enter rates from your schedule of rates to get amounts."],
    [["1893", "2025", "zone vi", "new code"], "Seismic code edition", "IS 1893 (Part 1):2025 was published in Nov 2025 and withdrawn by BIS on 3 March 2026; IS 1893 (Part 1):2016 with Amendments 1 and 2 applies and is used by the app."],
    [["crack", "pc", "stiffness modifier", "cracked"], "Cracked-section stiffness", "Column and beam stiffness modifiers (IS 1893 cl 6.4.3.1: 0.7 Ig columns, 0.35 Ig beams) and slab/wall shell factors are applied when 'cracked sections' is on."],
    [["deflect", "span/d", "crack width", "servic"], "Serviceability", "Deflection (IS 456 cl 23.2) and crack width are not checked by the frame design — use the beam and slab modules (span/effective depth with modification factors) for the critical members."],
    [["pdelta", "p-delta", "second order"], "P-Delta", "Geometric stiffness iterations per combination; convergence is reported and non-convergence rejected. Use 'Linear + P-Delta' for slender or heavily loaded frames (stability coefficient > 0.1)."],
    [["pushover", "hinge", "nonlinear"], "Pushover", "Event-to-event plastic hinges from P–M interaction; gravity first, then the lateral pattern. Useful to see the collapse mechanism and reserve strength."]
  ];
  function kbFind(q) {
    var s = q.toLowerCase(), out = [];
    KB.forEach(function (k) { var sc = 0; k[0].forEach(function (w) { if (s.indexOf(w) >= 0) sc += w.length; }); if (sc) out.push([sc, k]); });
    return out.sort(function (a, b) { return b[0] - a[0]; }).slice(0, 3).map(function (x) { return x[1]; });
  }
  /* findings from the results: what is wrong, why, what to do */
  function advise(S) {
    var o = [], dt = S.det && !S.det.err && S.det.gB ? S.det : null, p = S.p || {};
    function add(sev, t, d, fix, cl) { o.push({ sev: sev, t: t, d: d, fix: fix, cl: cl }); }
    if (!S.des) return o;
    var bf = S.des.beams.filter(function (r) { return !r.ok; }), cf = S.des.cols.filter(function (r) { return !r.ok; });
    if (bf.length) add(3, bf.length + " beam elements fail design", "e.g. " + bf[0].name + ": " + (bf[0].msg || []).slice(0, 2).join("; "), "Increase beam depth (most effective) or width; check spans and loads.", "IS 456 cl 38–41");
    if (cf.length) add(3, cf.length + " column elements fail design", "e.g. " + cf[0].name + " with Pu " + f(cf[0].Pu, 0) + " kN", "Enlarge the columns or raise fck; check slenderness.", "IS 456 cl 39");
    if (dt) {
      var sw = dt.scwb.filter(function (q) { return !q.ok; });
      if (sw.length) { var w = sw.slice().sort(function (a, b) { return a.r - b.r; })[0], need = 1.4 * w.Mb - w.Mc;
        add(3, sw.length + " joints fail strong column–weak beam", "Worst " + w.col + " at +" + f(w.z, 2) + " m (" + w.dir + "): ΣMc/ΣMb = " + f(w.r, 2) + " < 1.4 — the columns need " + f(need, 0) + " kNm more capacity there.", "Run automatic design, or enlarge those columns (moment capacity grows roughly with D²) / add column steel; avoid excess beam top steel.", "IS 13920 cl 7.2.1"); }
      var jj = dt.joints.filter(function (q) { return !q.ok; });
      if (jj.length) { var j = jj.slice().sort(function (a, b) { return b.r - a.r; })[0], Aneed = j.Vj * 1000 / (j.k * Math.sqrt(j.fck)), side = Math.ceil(Math.sqrt(Aneed) / 25) * 25;
        add(3, jj.length + " beam–column joints overstressed in shear", "Worst " + j.col + " at +" + f(j.z, 2) + " m: Vj = " + f(j.Vj, 0) + " kN vs " + f(j.cap, 0) + " kN (k = " + j.k + ").", "A square column of about " + side + " mm would carry it at k = " + j.k + "; wider beams (≥ ¾ column width on all faces) raise k to 1.5.", "IS 13920 cl 9.1"); }
      var ja = dt.joints.filter(function (q) { return !q.anch; });
      if (ja.length) add(2, ja.length + " joints: column depth < 20 × beam bar φ", "e.g. " + ja[0].col + ": " + ja[0].hc + " mm < " + 20 * ja[0].dia + " mm", "Use smaller beam bars (φ ≤ hc/20) or deeper columns.", "IS 13920 cl 7.1.1");
      dt.cols.forEach(function (c) { c.st.forEach(function (s) { if (s.pct > 2.5 && s.pct <= 4) add(1, c.name + " storey " + (s.i + 1) + ": " + f(s.pct, 2) + " % steel", "High steel makes laps congested (laps double it).", "Consider a larger section to bring steel near 1–2.5 %.", "IS 456 cl 26.5.3.1"); }); });
      dt.beams.forEach(function (bl) { if (bl.msg.some(function (t) { return /second layer/.test(t); })) add(2, "Beam " + bl.name + " needs two layers of bars", "The effective depth is smaller than assumed.", "Deepen the beam or use larger bars.", "IS 456 cl 26.3"); });
      dt.foot.forEach(function (ft) { if (ft.warn && ft.warn.length) add(2, "Footing " + ft.name + " overlaps a neighbour", ft.warn[0], "Design a combined footing or raft.", "IS 456 cl 34"); });
      (dt.walls || []).forEach(function (w) { w.storeys.forEach(function (st) { if (st.be) add(1, w.name + " storey " + (st.i + 1) + " needs boundary elements", "σ = " + f(st.sMax, 2) + " N/mm² > 0.2fck. " + st.beText, "Detail the end zones as confined boundary elements.", "IS 13920 cl 10.4"); }); });
    }
    var dr = (S.drift || []).filter(function (q) { return q.ok === false; });
    if (dr.length) { var dm = dr.slice().sort(function (a, b) { return b.dr - a.dr; })[0]; add(3, "Storey drift exceeds 0.004h", dm.c + " storey " + f(dm.zb, 1) + "–" + f(dm.z, 1) + " m: " + f(dm.dr, 5), "Stiffen: larger columns, shear walls or bracing.", "IS 1893 cl 7.11.1"); }
    if (S.se && S.se.rs) [0, 1].forEach(function (d) { var r = S.se.rs[d]; if (r && r.cum < 0.9) add(2, "Mass participation " + f(100 * r.cum, 1) + " % in " + (d ? "Y" : "X"), "Fewer than 90 % of the mass is captured.", "Increase the number of modes.", "IS 1893 cl 7.7.5.2"); });
    if (S.se && S.se.tc) { var t2 = S.se.tc.filter(function (r) { return r.ave > 1.2; }); if (t2.length) add(2, "Torsional irregularity (Δmax/Δave up to " + f(Math.max.apply(null, t2.map(function (r) { return r.ave; })), 2) + ")", "Plan stiffness is unbalanced.", "Add stiffness on the flexible side or redistribute walls.", "IS 1893 Table 5 (i)"); }
    if (S.se && S.se.irr) { var sf = S.se.irr.filter(function (r) { return r.soft; }); if (sf.length) add(2, "Soft storey at storey " + (sf[0].i + 1), "Stiffness less than the storey above.", "Stiffen that storey or design to cl 7.10.", "IS 1893 Table 6"); }
    var dfl = p.entered ? ["sbc", "zone", "soil", "ll", "fck"].filter(function (k) { return p.entered.indexOf(k) < 0; }) : [];
    if (dfl.length) add(1, "Defaults used for " + dfl.join(", "), "These were not entered.", "Confirm them from the soil report, site seismic zone and architectural use.", "");
    add(0, "Serviceability not checked in the frame design", "Deflection and crack width of frame beams and slabs.", "Check the critical members in the beam / slab modules (span/d with modification factors).", "IS 456 cl 23.2, 35.3.2");
    return o.sort(function (a, b) { return b.sev - a.sev; });
  }
  function memberInfo(S, name) {
    var dt = S.det, n = String(name || "").trim().toUpperCase(), out = null;
    if (!dt || dt.err) return null;
    dt.cols.forEach(function (c) { if (c.name.toUpperCase() === n || (c.grp && c.grp.toUpperCase() === n)) out = { type: "column", name: c.name, group: c.grp, storeys: c.st.map(function (s) { return { storey: s.i + 1, size: s.b + "x" + s.D, bars: s.ar.n + "-" + s.ar.dia, steel_pct: +s.pct.toFixed(2), ties: s.tie.dia + "@" + s.tie.sc + "/" + s.tie.sm }; }), failing: c.checks.filter(function (q) { return !q.ok; }).map(function (q) { return q.t + ": " + q.v; }), scwb: dt.scwb.filter(function (q) { return q.colRef === c; }).map(function (q) { return { z: q.z, dir: q.dir, ratio: +q.r.toFixed(2), ok: q.ok }; }), joints: dt.joints.filter(function (q) { return q.colRef === c; }).map(function (q) { return { z: q.z, dir: q.dir, Vj: +q.Vj.toFixed(0), cap: +q.cap.toFixed(0), ok: q.ok, depth20phi: q.anch }; }) }; });
    dt.beams.forEach(function (b) { if (!out && (b.name.toUpperCase() === n || (b.grp && b.grp.toUpperCase() === n))) out = { type: "beam line", name: b.name, group: b.grp, size: b.b + "x" + b.D, bar: b.dia, spans: b.spans.map(function (sp, j) { return { span: j + 1, clear: Math.round(sp.Lc), top_left: b.sup[j].nt, bottom: sp.nb, top_right: b.sup[j + 1].nt, hoops: sp.sv.ph + "@" + sp.sv.sh + "/" + sp.sv.sm }; }), failing: b.checks.filter(function (q) { return !q.ok; }).map(function (q) { return q.t + ": " + q.v; }), notes: b.msg }; });
    dt.foot.forEach(function (ft) { if (!out && (ft.name.toUpperCase() === n)) out = { type: "footing", name: ft.name, size: ft.Lx + "x" + ft.Ly + "x" + ft.D, bars: ft.bx.dia + "@" + ft.bx.s + " / " + ft.by.dia + "@" + ft.by.s, governing: ft.gov.set.name, qmax: +ft.gov.pr.max.toFixed(1), failing: ft.checks.filter(function (q) { return !q.ok; }).map(function (q) { return q.t + ": " + q.v; }) }; });
    (dt.walls || []).forEach(function (w) { if (!out && (w.name.toUpperCase().indexOf(n) === 0)) out = { type: "wall", name: w.name, t: w.t, Lw: Math.round(w.Lw), storeys: w.storeys.map(function (st) { return { storey: st.i + 1, vertical: st.vb.dia + "@" + st.vb.s, horizontal: st.hb.dia + "@" + st.hb.s, boundary: st.be }; }), failing: w.checks.filter(function (q) { return !q.ok; }).map(function (q) { return q.t + ": " + q.v; }) }; });
    return out;
  }
  function context(S) {
    var p = S.p || {}, sm = summary(S), v = verifyState(proj(), S);
    return { project: proj() ? { name: proj().name, status: proj().status } : null, method: p.method, zone: p.zone, I: p.I, R: p.R, soil: p.soil, fck: p.fck, fy: p.fy, columns: p.colSec, beams: p.beamSec, rules: p.secOver || "",
      groups: sm.map(function (r) { return { kind: r.kind, id: r.id, members: r.mem.slice(0, 80), result: r.res, utilisation: +r.u.toFixed(2), governing: r.why, ok: r.ok, verification: r.v ? r.v.st : null }; }),
      verification: { open: v.open, failing: v.fails, total: v.total }, findings: advise(S).slice(0, 12).map(function (a) { return a.t + " — " + a.d + " Fix: " + a.fix + (a.cl ? " (" + a.cl + ")" : ""); }) };
  }
  var sampleFn = null, sampleTried = false;
  function aiInit(cb) {
    if (sampleTried) return cb(sampleFn);
    sampleTried = true;
    if (!(window.claude && window.claude.use)) return cb(null);
    Promise.resolve(window.claude.use("sample")).then(function (s) { sampleFn = s || null; cb(sampleFn); }, function () { cb(null); });
  }
  function offlineAnswer(S, q) {
    var h = "", mm = q.match(/\b([A-Z]{1,2}-[A-Z]{1,2}\d+|F\d+-[A-Z0-9]+\([XY]\)|[BCFW]\d+)\b/i), info = mm ? memberInfo(S, mm[1]) : null;
    if (info) h += '<div class="aans"><b>' + esc(info.type + " " + info.name) + '</b><pre>' + esc(JSON.stringify(info, null, 1)) + '</pre></div>';
    var kb = kbFind(q); kb.forEach(function (k) { h += '<div class="aans"><b>' + esc(k[1]) + '</b><br>' + esc(k[2]) + '</div>'; });
    var ad = advise(S).filter(function (a) { var s = q.toLowerCase(); return s.split(/\W+/).filter(function (w) { return w.length > 3; }).some(function (w) { return (a.t + a.d).toLowerCase().indexOf(w) >= 0; }); }).slice(0, 3);
    ad.forEach(function (a) { h += '<div class="aans"><b>' + esc(a.t) + '</b><br>' + esc(a.d) + '<br><i>' + esc(a.fix) + '</i>' + (a.cl ? ' <small>(' + esc(a.cl) + ')</small>' : '') + '</div>'; });
    return h || '<div class="aans">No match in the offline knowledge base. Try a member name (e.g. C-B2, B1, F-A1), or a topic such as joint shear, laps, drift, SCWB, footing, BOQ.</div>';
  }
  function asstBlock(S) {
    var ad = advise(S), sev = ["Note", "Advice", "Important", "Must fix"];
    var h = '<div class="note">Findings from this analysis, with the clause and a suggested fix. Ask about any member or topic below — works offline; in the web app it can also ask Claude, which reads the results through the app.</div>';
    h += ad.map(function (a) { return '<div class="afind s' + a.sev + '"><span class="asev">' + sev[a.sev] + '</span> <b>' + esc(a.t) + '</b><br><small>' + esc(a.d) + '</small><br><small><i>' + esc(a.fix) + '</i>' + (a.cl ? ' · ' + esc(a.cl) : '') + '</small></div>'; }).join("");
    h += '<div class="btns"><input id="aQ" placeholder="Ask: why does C-B2 fail? what is lo? how to fix joint shear?" style="flex:1"><button id="aGo" class="pri" type="button" style="flex:0">Ask</button></div><div id="aOut"></div>';
    return h;
  }
  function ask(S, q, out) {
    out.innerHTML = '<div class="aans">' + offlineAnswer(S, q) + '</div>';
    aiInit(function (sample) {
      if (!sample) return;
      var box = document.createElement("div"); box.className = "aans ai"; box.innerHTML = "<b>Claude</b><br><span>Thinking…</span>"; out.insertBefore(box, out.firstChild);
      var ctx = context(S), tools = [
        { name: "get_member", description: "Detailing and checks of one member or member group by name (e.g. C-B2, C1, F1-A(X), B2, F-A1, W1)", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }, execute: function (a) { return memberInfo(S, a.name) || { error: "not found" }; } },
        { name: "search_notes", description: "Look up the app's code notes (IS 13920, IS 1893, IS 456) on a topic", inputSchema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] }, execute: function (a) { return kbFind(a.topic).map(function (k) { return { title: k[1], text: k[2] }; }); } }
      ];
      var prompt = "You are the engineering assistant inside IS StructDesign, an Indian-Standards structural analysis and design app. Answer the engineer's question about THIS model using the results below and the tools; cite IS clauses; be concise (≤ 180 words); if a check fails say why and give concrete fixes with numbers; never claim the design is safe — remind that a qualified engineer must verify when relevant.\n\nModel results (JSON):\n" + JSON.stringify(ctx) + "\n\nQuestion: " + q;
      sample([{ role: "user", content: prompt }], { tools: tools, cache: false, onText: function (t) { box.querySelector("span").textContent = t.text; } }).then(function (r) { box.querySelector("span").textContent = r.text; }, function (e) { if (e && e.code === "not_granted") box.remove(); else box.querySelector("span").textContent = "Claude is not available right now (" + (e && (e.message || e.code) || "error") + ") — the offline answer is below."; });
    });
  }

  /* ================================================================ AUTOMATIC DESIGN (results of the last run) */
  function autoBlock(S) {
    var a = S.autoRes; if (!a) return "";
    var h = '<div class="vbox ' + (a.ok ? "vok" : "vmid") + '"><b>' + (a.ok ? "Automatic design converged — every check passes" : "Automatic design stopped with failures left") + '</b><br><small>' + a.log.length + ' iteration(s). Sizes below are now the section rules of this project (Materials & sections ▸ Section rules).</small></div>';
    h += tblL(["Iteration", "Column / beam sizes", "Storeys failing", "Steel t", "Concrete m³"], a.log.map(function (l) { return [l.it, '<small>' + esc(l.rules).replace(/\n/g, "<br>") + '</small>', esc(Object.keys(l.fails.col).map(function (i) { return "col " + i + ": " + l.fails.col[i].join(", "); }).concat(Object.keys(l.fails.beam).map(function (i) { return "beam " + i + ": " + l.fails.beam[i].join(", "); })).join("; ") || "none"), f(l.steel / 1000, 2), f(l.conc, 1)]; }));
    if (!a.ok) h += '<div class="note">Left: ' + esc(JSON.stringify(a.fails.col)) + ' ' + esc(JSON.stringify(a.fails.beam)) + (a.fails.walls ? ' · ' + a.fails.walls + ' wall checks' : '') + ' — sizes reached the limits or failures are not size-related; see the assistant below.</div>';
    return h;
  }

  /* ================================================================ RESULTS BLOCK */
  function block(S) {
    if (!S.des) return "";
    var p = proj(), vm = !!(p && p.vmode), h = '<div class="rep pro"><div class="rh"><div><h3>Professional outputs</h3><small>' + esc(p ? p.name : "") + ' · engine ' + REG.ENGINE + '</small></div></div>';
    h += autoBlock(S);
    h += '<div class="btns noprint"><button type="button" id="vMode" class="' + (vm ? "pri" : "") + '">Engineering verification mode: ' + (vm ? "ON" : "OFF") + '</button></div>';
    if (vm) h += '<section class="sub">' + vBlock(S) + '</section>';
    else { var v = verifyState(p, S), c = vClass(v); h += '<div class="vbox ' + c[0] + '"><b>' + c[1] + '</b><br><small>' + esc(c[2]) + ' — switch the mode on to review.</small></div>'; }
    h += '<details class="sub"' + (S.boq ? '' : '') + '><summary><b>Bill of quantities & reinforcement schedules</b></summary>' + boqBlock(S) + '</details>';
    h += '<details class="sub"><summary><b>Engineering assistant</b> (' + advise(S).filter(function (a) { return a.sev >= 2; }).length + ' important findings)</summary>' + asstBlock(S) + '</details>';
    h += '<h4>Reports & CAD</h4><div class="btns noprint"><a class="btnl pri" href="#report">Calculation report ›</a><button type="button" id="bGA">Drawing set DXF</button></div><div class="btns noprint"><button type="button" id="bStd">STAAD.Pro input (.std)</button><button type="button" id="bProj">Projects ›</button></div>';
    h += '<div class="note">Drawing set: general-arrangement plans with grids, column and beam marks, footing layout, column / beam / footing schedules and title blocks, plus all reinforcement details (layers for CAD). STAAD.Pro input: the same nodes, members, shells, sections, supports, load cases and combinations, for an independent cross-check.</div></div>';
    return h;
  }
  function bind(S, ctx) {
    if ($("vMode")) $("vMode").onclick = function () { var p = proj(); PDB.update(p.id, { vmode: !p.vmode }, "Verification mode " + (p.vmode ? "off" : "on")); ctx.rerender(); };
    document.querySelectorAll("[data-vk]").forEach(function (b) { b.onclick = function () {
      var k = b.getAttribute("data-vk"), st = b.getAttribute("data-vs"), by = ($("vBy") && $("vBy").value.trim()) || "";
      if (st && !by) { ctx.toast("Enter the reviewer's name first"); if ($("vBy")) $("vBy").focus(); return; }
      var note = st === "query" || st === "na" ? (window.prompt ? window.prompt(st === "query" ? "Query (what needs answering?)" : "Why is it not applicable?", "") || "" : "") : "";
      PDB.setReview(k, st ? { state: st, by: by, date: new Date().toISOString(), note: note } : null); ctx.rerender(); }; });
    document.querySelectorAll("input.rate").forEach(function (inp) { inp.onchange = function () { var p = proj(), r = Object.assign({}, p.rates || {}); var v = parseFloat(this.value); if (v > 0) r[this.getAttribute("data-ri")] = v; else delete r[this.getAttribute("data-ri")]; PDB.setRates(r); setTimeout(ctx.rerender, 0); }; });
    if ($("aGo")) { var go = function () { var q = $("aQ").value.trim(); if (q) ask(S, q, $("aOut")); }; $("aGo").onclick = go; $("aQ").onkeydown = function (e) { if (e.key === "Enter") go(); }; }
    if ($("bGA")) $("bGA").onclick = function () { try { ctx.download(fname("drawings") + ".dxf", CAD.drawingSet(S, proj())); } catch (e) { ctx.toast(e.message); } };
    if ($("bStd")) $("bStd").onclick = function () { ctx.download(fname("model") + ".std", CAD.staad(S, proj())); };
    if ($("bProj")) $("bProj").onclick = function () { location.hash = "#projects"; };
  }
  function fname(k) { var p = proj(); return ((p && p.name) || "project").replace(/[^\w\- ]+/g, "_").replace(/\s+/g, "-") + "-" + k; }

  return { projectsView: projectsView, summary: summary, vItems: vItems, verifyState: verifyState, vClass: vClass, chips: chips, block: block, bind: bind, advise: advise, memberInfo: memberInfo, context: context, kbFind: kbFind, offlineAnswer: offlineAnswer,
    _set: function (k, v) { this[k] = v; } };
})();
if (typeof module !== "undefined") module.exports = PRO;
