/* Detailed estimate in the J&K R&B / PWD format: items of work in order, each with its measurement lines
   (No. × L × B × D/H = quantity), a total carried to Quantity × Rate = Amount; abstract and grand total.
   One model, two outputs: HTML (in the app) and an Excel sheet with live formulas. */
var EST = (function () {
  var E = {};
  E.CARRIAGE = { on: true, agg: [0.87, 279.04, "10 km"], sand: [0.46, 445.64, "20 km"] };   /* cum per cum of concrete, ₹/cum, lead — as in the reference estimate format */
  function sum(a, f) { return a.reduce(function (x, r) { return x + f(r); }, 0); }
  function itemQty(it) {
    var base = sum(it.rows.filter(function (r) { return r.pct === undefined && !r.sub; }), function (r) { return r.q || 0; });
    var add = sum(it.rows.filter(function (r) { return r.pct !== undefined; }), function (r) { return r.q || 0; });
    return base + add;
  }
  function finish(m) {
    m.items.forEach(function (it) { it.qty = itemQty(it); it.amt = it.qty * (it.rate || 0); });
    m.sub = sum(m.items, function (it) { return it.amt; });
    var a = m.abs || { cont: 3, cess: 1, gst: 18 }; m.abs = a;
    m.cont = m.sub * a.cont / 100; m.cess = m.sub * a.cess / 100; m.gst = m.sub * a.gst / 100; m.total = m.sub + m.cont + m.cess + m.gst;
    return m;
  }
  function carriage(m) {
    if (!E.CARRIAGE.on) return;
    var conc = m.items.filter(function (it) { return it.cat === "pcc" || it.cat === "rcc"; });
    if (!conc.length) return;
    var vol = sum(conc, function (it) { return itemQty(it); }), nos = conc.map(function (it) { return m.items.indexOf(it) + 1; }).join(", "), C = E.CARRIAGE;
    m.items.push({ cat: "carr", d: "Carriage of stone aggregate by mechanical transport, lead " + C.agg[2] + " (concrete items " + nos + ")", unit: "m³", sor: "carriage", rate: C.agg[1],
      rows: [{ d: "Concrete of items " + nos + " = " + vol.toFixed(2) + " m³ @ " + C.agg[0] + " m³ of aggregate per m³", n: 1, L: vol, H: C.agg[0], hU: "m³/m³", q: vol * C.agg[0], ref: conc }] });
    m.items.push({ cat: "carr", d: "Carriage of sand by mechanical transport, lead " + C.sand[2] + " (concrete items " + nos + ")", unit: "m³", sor: "carriage", rate: C.sand[1],
      rows: [{ d: "Concrete of items " + nos + " = " + vol.toFixed(2) + " m³ @ " + C.sand[0] + " m³ of sand per m³", n: 1, L: vol, H: C.sand[0], hU: "m³/m³", q: vol * C.sand[0], ref: conc }] });
  }
  var ORDER = { exc: 1, exl: 2, pcc: 3, rcc: 4, stl: 5, fw: 6, own: 7, carr: 9 };
  /* building BOQ (BOQ.run) → model */
  E.fromBoq = function (b, title) {
    var m = { title: title || "Detailed estimate", items: b.items.map(function (it) {
      var cat = /^rc/.test(it.id) ? "rcc" : it.id === "pcc" || it.id === "gfb" ? "pcc" : it.id === "stl" ? "stl" : it.id.slice(0, 2) === "fw" ? "fw" : "own";
      return { id: it.id, cat: cat, d: it.desc, unit: it.unit, sor: it.sor ? it.sor[0] : (it.src || ""), rate: it.rate || 0, rows: it.rows.map(function (r) { return Object.assign({}, r); }) };
    }), abs: { cont: b.inp.cont, cess: b.inp.cess, gst: b.inp.gst } };
    m.items.forEach(function (it) { if (/^car/.test(it.id)) { it.cat = "carr"; it.rows.forEach(function (r) { if (r.refIds) r.ref = m.items.filter(function (q) { return r.refIds.indexOf(q.id) >= 0; }); }); } });
    return finish(m);
  };
  /* designed elements [{mark, nos, title, take}] → model, items grouped by work */
  E.fromTakes = function (els, title) {
    var map = {}, list = [];
    els.forEach(function (e) {
      var n = e.nos || 1;
      e.take.items.forEach(function (q) {
        var key = q.cat + "|" + q.d.replace(/ — \d+ × .*$/, "") + "|" + q.sor + "|" + q.rate + "|" + q.u;
        var it = map[key]; if (!it) { it = map[key] = { cat: q.cat, d: q.d.replace(/ — \d+ × .*$/, ""), unit: q.u, sor: q.sor, rate: q.rate, rows: [], wastage: q.wastage }; list.push(it); }
        it.rows.push({ sub: e.mark + (n > 1 ? " (" + n + " nos)" : "") + " — " + e.title });
        (q.rows || []).forEach(function (r) {
          var o = Object.assign({}, r); o.d = r.d;
          if (r.n !== undefined) { o.n = r.n * n; o.q = r.q * n; } else { o.q = r.q * n; if (n > 1) o.d = r.d + " × " + n + " nos"; }
          it.rows.push(o);
        });
      });
    });
    list.forEach(function (it) { if (it.wastage) { var base = sum(it.rows.filter(function (r) { return !r.sub; }), function (r) { return r.q || 0; }); it.rows.push({ d: "Add " + it.wastage + " % for wastage, laps and chairs", pct: it.wastage, q: base * it.wastage / 100 }); } });
    list.sort(function (a, b) { return (ORDER[a.cat] || 8) - (ORDER[b.cat] || 8); });
    var m = { title: title || "Detailed estimate", items: list }; carriage(m); return finish(m);
  };
  function fx(v, d) { return v === undefined || v === null || v === "" ? "" : (+v).toFixed(d); }
  function inr(v) { return Math.round(v).toLocaleString("en-IN"); }
  /* HTML: S.No | Particulars | No. | L | B | D/H | Qty | Unit | Quantity | Rate | Amount */
  E.html = function (m, esc) {
    var h = '<div class="tw"><table class="est jk"><tr><th>S.No.</th><th>Particulars</th><th>No.</th><th>L (m)</th><th>B (m)</th><th>D/H (m)</th><th>Qty</th><th>Unit</th><th>Quantity</th><th>Rate (₹)</th><th>Amount (₹)</th></tr>';
    m.items.forEach(function (it, i) {
      var dq = it.unit === "kg" ? 1 : 2;
      h += '<tr class="ih"><td>' + (i + 1) + '</td><td colspan="10"><b>' + esc(it.d) + '</b>' + (it.sor ? ' <span class="sorc">' + (/^[\d.]/.test(it.sor) ? 'JKSOR ' : '') + esc(it.sor) + '</span>' : '') + '</td></tr>';
      it.rows.forEach(function (r) {
        if (r.sub) { h += '<tr class="sb"><td></td><td colspan="10">' + esc(r.sub) + '</td></tr>'; return; }
        var neg = r.q < 0, dims;
        if (r.pct !== undefined) dims = fx(r.pct, 1) + " % of the above";
        else if (r.n === undefined) dims = r.src || "";
        else dims = [fx(r.n, 0), r.L !== undefined ? fx(r.L, 3) : "", r.B !== undefined && r.B !== "" ? fx(r.B, 3) : "", r.H !== undefined && r.H !== "" ? fx(r.H, 3) + (r.hU ? " " + r.hU : "") : ""].filter(function (x) { return x !== ""; }).join(" × ");
        h += '<tr' + (neg ? ' class="ded"' : '') + '><td></td><td>' + esc(r.d) + '<span class="dims">' + esc(dims) + (dims ? " = " : "") + fx(r.q, dq) + '</span></td>' +
          (r.pct !== undefined ? '<td>' + fx(r.pct, 1) + ' %</td><td colspan="3">of the above</td>' : r.n === undefined ? '<td colspan="4">' + esc(r.src || "") + '</td>' :
            '<td>' + fx(r.n, 0) + '</td><td>' + (r.L !== undefined ? fx(r.L, 3) : "") + '</td><td>' + (r.B !== undefined && r.B !== "" ? fx(r.B, 3) : "") + '</td><td>' + (r.H !== undefined && r.H !== "" ? fx(r.H, 3) + (r.hU ? ' <small>' + esc(r.hU) + '</small>' : '') : "") + '</td>') +
          '<td>' + fx(r.q, dq) + '</td><td>' + esc(it.unit) + '</td><td></td><td></td><td></td></tr>';
      });
      h += '<tr class="it"><td></td><td>Total<span class="dims">' + fx(it.qty, dq) + ' ' + esc(it.unit) + ' @ ₹ ' + fx(it.rate, 2) + '</span></td><td></td><td></td><td></td><td></td><td>' + fx(it.qty, dq) + '</td><td>' + esc(it.unit) + '</td><td><b>' + fx(it.qty, dq) + '</b></td><td>' + fx(it.rate, 2) + '</td><td><b>' + inr(it.amt) + '</b></td></tr>';
    });
    var A = m.abs;
    [["Total", m.sub, true], ["Contingencies " + A.cont + " %", m.cont], ["Labour welfare cess " + A.cess + " %", m.cess], ["GST " + A.gst + " % (works contract)", m.gst], ["Grand total", m.total, true]].forEach(function (x) {
      h += '<tr class="gt' + (x[2] ? ' b' : '') + '"><td></td><td>' + x[0] + '<span class="dims">₹ ' + inr(x[1]) + '</span></td><td colspan="8"></td><td>' + (x[2] ? '<b>' + inr(x[1]) + '</b>' : inr(x[1])) + '</td></tr>';
    });
    return h + '</table></div>';
  };
  E.abstractHtml = function (m, esc) {
    var h = '<div class="tw"><table class="est jk ab"><tr><th>S.No.</th><th>Particulars</th><th>Quantity</th><th>Unit</th><th>Rate (₹)</th><th>Amount (₹)</th></tr>';
    m.items.forEach(function (it, i) { var dq = it.unit === "kg" ? 1 : 2; h += '<tr><td>' + (i + 1) + '</td><td>' + esc(it.d) + (it.sor ? ' <span class="sorc">' + (/^[\d.]/.test(it.sor) ? 'JKSOR ' : '') + esc(it.sor) + '</span>' : '') + '<span class="dims">' + fx(it.qty, dq) + ' ' + esc(it.unit) + ' @ ₹ ' + fx(it.rate, 2) + '</span></td><td>' + fx(it.qty, dq) + '</td><td>' + esc(it.unit) + '</td><td>' + fx(it.rate, 2) + '</td><td>' + inr(it.amt) + '</td></tr>'; });
    var A = m.abs;
    [["Total", m.sub, true], ["Contingencies " + A.cont + " %", m.cont], ["Labour welfare cess " + A.cess + " %", m.cess], ["GST " + A.gst + " % (works contract)", m.gst], ["Grand total", m.total, true]].forEach(function (x) { h += '<tr class="gt' + (x[2] ? ' b' : '') + '"><td></td><td>' + x[0] + '<span class="dims">₹ ' + inr(x[1]) + '</span></td><td></td><td></td><td></td><td>' + (x[2] ? '<b>' + inr(x[1]) + '</b>' : inr(x[1])) + '</td></tr>'; });
    return h + '</table></div>';
  };
  /* Excel sheet in the reference layout: A S.No · B Particulars · C No. · D x · E L · F x · G B · H x · I D/H · J = · K qty · L unit · M Quantity · N unit · O Rate · P Amount */
  E.sheet = function (wb, m, name, note) {
    var sh = wb.sheet(name || "Detailed Estimate", { cols: [6, 46, 7, 3, 10, 3, 10, 3, 10, 3, 12, 7, 12, 7, 12, 15], color: "E07A1F", freeze: "A4" }), tot = {}, totRows = [];
    var r1 = sh.row([m.title], "t"); sh.merge("A" + r1 + ":P" + r1);
    var r2 = sh.row(["S.No.", "Particulars", "", "", "", "", "", "", "", "", "", "", "Quantity", "", "Rate", "Amount"], "h"); sh.merge("B" + r2 + ":L" + r2);
    sh.row(["", "No. × L × B × D/H = quantity (m, kg/m)", "", "", "", "", "", "", "", "", "", "", "", "", "in Rs", "in Rs"], "note");
    m.items.forEach(function (it, i) {
      var rh = sh.row([{ v: i + 1, s: "b" }, { v: it.d + (it.sor ? "  [" + (/^[\d.]/.test(it.sor) ? "JKSOR " : "") + it.sor + "]" : ""), s: "desc" }]); sh.merge("B" + rh + ":L" + rh);
      var first = sh.next();
      it.rows.forEach(function (r) {
        var rn = sh.next();
        if (r.sub) { sh.row(["", { v: r.sub, s: "sub" }]); sh.merge("B" + rn + ":L" + rn); return; }
        var c = ["", r.d];
        if (r.pct !== undefined) { c.push({ v: r.pct, s: "n2" }, "%", "of the above", "", "", "", "", "=", { f: "=C" + rn + "/100*SUM(K" + first + ":K" + (rn - 1) + ")", v: r.q, s: "f2" }); }
        else if (r.n === undefined) { c.push(r.src || "", "", "", "", "", "", "", "=", { v: r.q, s: "n2" }); }
        else {
          var fs = ["C" + rn]; c.push({ v: r.n, s: "n0" });
          [["L", "E"], ["B", "G"], ["H", "I"]].forEach(function (k) { if (r[k[0]] === undefined || r[k[0]] === "") c.push("", ""); else { c.push("x", { v: parseFloat((+r[k[0]]).toPrecision(10)), s: "n3" }); fs.push(k[1] + rn); } });
          c.push("=", { f: "=" + fs.join("*"), v: r.q, s: "f2" });
        }
        c.push(r.hU === "kg/m" ? "kg" : it.unit); sh.row(c);
      });
      var tr = sh.next(); tot[it.id || i] = tr; totRows.push(tr);
      sh.row(["", "", "", "", "", "", "", "", "Total", "", { f: "=SUM(K" + first + ":K" + (tr - 1) + ")", v: it.qty, s: "f2" }, it.unit, { f: "=K" + tr, v: it.qty, s: "f2" }, it.unit, { v: it.rate || 0, s: "in" }, { f: "=M" + tr + "*O" + tr, v: it.amt, s: "f0" }], "b");
      it.rows.forEach(function (r, j) { if (r.ref) { /* carriage lines follow the concrete totals */ var rr = first + j, refs = r.ref.map(function (q) { return "M" + tot[q.id || m.items.indexOf(q)]; }).join("+"); sh.rows[rr - 1].c[4] = { f: "=" + refs, v: r.L, s: "f2" }; } });
    });
    var rs = sh.next(), A = m.abs;
    sh.row(["", "", "", "", "", "", "", "", "", "", "Total", "", "", "", "Rs.", { f: "=" + totRows.map(function (r) { return "P" + r; }).join("+"), v: m.sub, s: "f0" }], "b");
    var lines = [];
    [["Contingencies", A.cont, m.cont], ["Labour welfare cess", A.cess, m.cess], ["GST on works contract", A.gst, m.gst]].forEach(function (x) { var r = sh.next(); lines.push(r); sh.row(["", "", "", "", "", "", "", "", "", "", x[0], "", "", "", { v: x[1], s: "in" }, { f: "=P" + rs + "*O" + r + "/100", v: x[2], s: "f0" }]); });
    sh.row(["", "", "", "", "", "", "", "", "", "", "Grand total", "", "", "", "Rs.", { f: "=P" + rs + "+" + lines.map(function (r) { return "P" + r; }).join("+"), v: m.total, s: "f0" }], "b");
    if (note) { var rn2 = sh.row([note], "note"); sh.merge("A" + rn2 + ":P" + rn2); }
    return { sh: sh, tot: tot, sub: rs };
  };
  return E;
})();
if (typeof module !== "undefined") module.exports = EST;
