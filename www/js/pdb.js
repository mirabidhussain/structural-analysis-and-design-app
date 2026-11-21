/* Offline project database: IndexedDB on the device (localStorage fallback, memory in tests). Every project keeps its inputs,
   imported DXF, revisions, reviewer sign-offs, BOQ rates and the engine / code editions it was made with.
   All records are held in memory after PDB.init(), writes go to storage in the background. */
var PDB = (function () {
  var DBN = "isd_projects", ST = "p", db = null, mem = {}, cur = null, ready = null, mode = "memory", timers = {};
  function now() { return new Date().toISOString(); }
  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function engine() { return typeof REG !== "undefined" ? REG.ENGINE : "?"; }
  function codes() { return typeof REG !== "undefined" ? REG.STANDARDS.map(function (s) { return s[0]; }) : []; }
  function blank(name) {
    var t = now();
    return { id: uid(), name: name || "New project", jobNo: "", client: "", site: "", engineer: "", checker: "", status: "Concept", notes: "",
      created: t, modified: t, engine: engine(), codes: codes(), inputs: {}, dxf: null, revs: [], review: {}, rates: {}, summary: null, log: [{ t: t, a: "Created" }] };
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function persist(p) {
    if (mode === "idb" && db) { try { db.transaction(ST, "readwrite").objectStore(ST).put(p); } catch (e) { mode = "ls"; } }
    if (mode === "ls") lsSet("isd_proj_" + p.id, JSON.stringify(p));
    lsSet("isd_cur", cur || "");
  }
  function drop(id) {
    if (mode === "idb" && db) { try { db.transaction(ST, "readwrite").objectStore(ST).delete(id); } catch (e) {} }
    try { localStorage.removeItem("isd_proj_" + id); } catch (e) {}
  }
  function migrate() {
    /* first run: the model that was on this device becomes project 1 */
    if (Object.keys(mem).length) return;
    var p = blank("Project 1"), old = lsGet("isd_model2");
    try { p.inputs = old ? JSON.parse(old) || {} : {}; } catch (e) { p.inputs = {}; }
    p.log.push({ t: now(), a: old ? "Imported the model saved on this device" : "Started" });
    mem[p.id] = p; cur = p.id; persist(p);
  }
  function init() {
    if (ready) return ready;
    ready = new Promise(function (res) {
      function done() { cur = lsGet("isd_cur") || cur; if (!mem[cur]) cur = Object.keys(mem)[0] || null; migrate(); res(); }
      var idb = typeof indexedDB !== "undefined" ? indexedDB : null;
      if (!idb) { loadLS(); return done(); }
      var rq;
      try { rq = idb.open(DBN, 1); } catch (e) { loadLS(); return done(); }
      rq.onupgradeneeded = function () { rq.result.createObjectStore(ST, { keyPath: "id" }); };
      rq.onerror = function () { loadLS(); done(); };
      rq.onsuccess = function () {
        db = rq.result; mode = "idb";
        try {
          var all = db.transaction(ST, "readonly").objectStore(ST).getAll();
          all.onsuccess = function () { (all.result || []).forEach(function (p) { mem[p.id] = p; }); done(); };
          all.onerror = function () { mode = "ls"; loadLS(); done(); };
        } catch (e) { mode = "ls"; loadLS(); done(); }
      };
    });
    return ready;
  }
  function loadLS() {
    mode = typeof localStorage !== "undefined" ? "ls" : "memory";
    if (mode !== "ls") return;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^isd_proj_/.test(k)) { var p = JSON.parse(localStorage.getItem(k)); if (p && p.id) mem[p.id] = p; } } } catch (e) {}
  }
  function touch(p, act) { p.modified = now(); if (act) { p.log = (p.log || []).concat([{ t: p.modified, a: act }]).slice(-200); } }
  function save(p, act, debounce) {
    touch(p, act); mem[p.id] = p;
    if (debounce && typeof setTimeout !== "undefined") { clearTimeout(timers[p.id]); timers[p.id] = setTimeout(function () { persist(p); }, 400); } else persist(p);
    return p;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* validate an imported file: a project or a backup of many */
  function sane(p) { return p && typeof p === "object" && typeof p.name === "string" && p.inputs && typeof p.inputs === "object"; }
  return {
    init: init, mode: function () { return mode; },
    list: function () { return Object.keys(mem).map(function (k) { return mem[k]; }).sort(function (a, b) { return a.modified < b.modified ? 1 : -1; }); },
    get: function (id) { return mem[id] || null; },
    current: function () { if (!mem[cur]) migrate(); return mem[cur]; },
    open: function (id) { if (mem[id]) { cur = id; lsSet("isd_cur", id); lsSet("isd_model2", JSON.stringify(mem[id].inputs || {})); } return mem[id]; },
    create: function (name, inputs) { var p = blank(name); if (inputs) p.inputs = clone(inputs); mem[p.id] = p; cur = p.id; persist(p); return p; },
    update: function (id, fields, act) { var p = mem[id]; if (!p) return null; Object.keys(fields).forEach(function (k) { p[k] = fields[k]; }); return save(p, act || "Details edited"); },
    setInputs: function (inputs) { var p = this.current(); p.inputs = clone(inputs); lsSet("isd_model2", JSON.stringify(inputs)); return save(p, null, true); },
    setStd: function (name, text) { var p = this.current(); p.std = text ? { name: name, text: text } : null; return save(p, text ? "STAAD file imported: " + name : "STAAD file removed"); },
    setDxf: function (name, text) { var p = this.current(); p.dxf = text ? { name: name, text: text } : null; return save(p, text ? "DXF imported: " + name : "DXF removed"); },
    setSummary: function (s) { var p = this.current(); p.summary = s; p.engineRun = engine(); return save(p, null, true); },
    setReview: function (key, val) { var p = this.current(); p.review = p.review || {}; if (val) p.review[key] = val; else delete p.review[key]; return save(p, val ? "Review: " + key + " → " + val.state : "Review cleared: " + key); },
    setRates: function (r) { var p = this.current(); p.rates = r; return save(p, "Rates edited", true); },
    duplicate: function (id) { var s = mem[id]; if (!s) return null; var p = clone(s); p.id = uid(); p.name = s.name + " (copy)"; p.created = p.modified = now(); p.revs = []; p.review = {}; p.status = "Concept"; p.log = [{ t: p.created, a: "Duplicated from " + s.name }]; mem[p.id] = p; persist(p); return p; },
    remove: function (id) { delete mem[id]; drop(id); if (cur === id) { cur = Object.keys(mem)[0] || null; if (!cur) migrate(); lsSet("isd_cur", cur); } },
    issue: function (note, by) {
      var p = this.current(), n = (p.revs || []).length, rev = { rev: "R" + n, date: now(), by: by || p.engineer || "", note: note || "", engine: engine(), codes: codes(), summary: p.summary ? clone(p.summary) : null, inputs: clone(p.inputs) };
      p.revs = (p.revs || []).concat([rev]); return save(p, "Issued revision " + rev.rev);
    },
    exportOne: function (id) { var p = mem[id]; return JSON.stringify({ format: "isd-project", version: 1, engine: engine(), project: p }, null, 1); },
    exportAll: function () { return JSON.stringify({ format: "isd-backup", version: 1, engine: engine(), date: now(), projects: this.list() }); },
    importText: function (text) {
      var o = JSON.parse(text), list = o && o.format === "isd-backup" ? o.projects : o && o.format === "isd-project" ? [o.project] : sane(o) ? [o] : null;
      if (!list || !list.length) throw new Error("Not an IS StructDesign project or backup file");
      var added = [];
      list.forEach(function (q) {
        if (!sane(q)) return;
        var p = Object.assign(blank(q.name), clone(q)); if (mem[p.id]) p.id = uid();
        p.log = (p.log || []).concat([{ t: now(), a: "Imported" + (q.engine && q.engine !== engine() ? " (made with engine " + q.engine + ")" : "") }]);
        mem[p.id] = p; persist(p); added.push(p);
      });
      if (!added.length) throw new Error("No valid projects in the file");
      return added;
    },
    _reset: function () { mem = {}; cur = null; ready = null; }
  };
})();
if (typeof module !== "undefined") module.exports = PDB;
