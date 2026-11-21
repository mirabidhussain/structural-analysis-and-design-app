/* Hardware-aware background computing.
   HW  — what the device offers (CPU cores, memory, GPU) and the performance tier chosen from it.
   PAR — a pool of Web Workers running the app's own engine code, so long analyses never freeze the screen
         and independent jobs run on separate cores at the same time. Falls back to the main thread when
         workers are not available (old WebView, file access blocked) — results are identical either way. */
var HW = (function () {
  var H = {}, nav = typeof navigator !== "undefined" ? navigator : {};
  H.cores = Math.max(1, nav.hardwareConcurrency || 2);
  H.mem = nav.deviceMemory || 0;                     /* GB, Chrome / Android WebView only (rounded down) */
  H.gpu = { webgl: false, webgl2: false, renderer: "", vendor: "", maxTex: 0 };
  try {
    if (typeof document !== "undefined") {
      var c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
      if (gl) {
        H.gpu.webgl = true; H.gpu.webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
        var ext = gl.getExtension("WEBGL_debug_renderer_info");
        H.gpu.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        H.gpu.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        H.gpu.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        var lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
      }
    }
  } catch (e) {}
  H.soft = /SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(H.gpu.renderer);   /* software rasteriser: no real GPU */
  H.reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* tier: low = ≤ 4 cores or ≤ 2 GB; high = ≥ 8 cores and ≥ 6 GB (or memory unknown) with a hardware GPU */
  H.tier = H.cores <= 4 || (H.mem && H.mem <= 2) ? "low" : H.cores >= 8 && (!H.mem || H.mem >= 6) && H.gpu.webgl && !H.soft ? "high" : "mid";
  H.workers = Math.max(1, Math.min(H.cores - 1, H.mem && H.mem <= 2 ? 2 : H.tier === "high" ? 6 : 4));
  H.useGL = H.gpu.webgl && !H.soft;
  H.maxDpr = H.tier === "low" ? 1.5 : H.tier === "mid" ? 2.5 : 3;
  H.dpr = function () { return Math.min(typeof devicePixelRatio !== "undefined" ? devicePixelRatio || 1 : 1, H.maxDpr); };
  H.apply = function () {
    if (typeof document === "undefined") return;
    var r = document.documentElement; r.setAttribute("data-tier", H.tier); if (H.reduceMotion) r.setAttribute("data-rm", "1");
  };
  H.summary = function () {
    return H.cores + " CPU cores" + (H.mem ? ", ~" + H.mem + " GB memory" : "") + " · GPU: " + (H.gpu.webgl ? (H.gpu.renderer || "WebGL") + (H.soft ? " (software)" : "") : "not available") +
      " · tier " + H.tier + " · " + (typeof PAR !== "undefined" && PAR.ok() ? PAR.size() + " background worker(s)" : "analysis on the main thread");
  };
  return H;
})();

var PAR = (function () {
  var P = {}, src = null, srcP = null, url = null, pool = [], disabled = false, seq = 0, waiting = {};
  /* engine scripts: the same files the tests load (no screen code) */
  P.ENGINE = ["data", "core", "lim", "units", "rcc", "wsm", "steel", "loads", "truss", "fem", "pushover", "dxf", "model", "se", "dt", "mat", "fdn", "reg", "beam1d", "beamx", "pipe", "boq", "elem", "est", "auto"];
  var BOOT = [
    "var PDB = { current: function () { return self.__proj || null; } };",
    "function __strip(o, seen) { if (!o || typeof o !== 'object') return; if (seen.has(o)) return; seen.add(o); if (ArrayBuffer.isView(o)) return; var ks = Object.keys(o); for (var i = 0; i < ks.length; i++) { var v = o[ks[i]]; if (typeof v === 'function') delete o[ks[i]]; else if (v && typeof v === 'object') __strip(v, seen); } }",
    "function __pack(S) { var o = {}; Object.keys(S).forEach(function (k) { if (k !== 'm' && k !== 'geo' && k !== 'p') o[k] = S[k]; }); if (o.se && o.se.md) delete o.se.md._A; __strip(o, new Set()); return o; }",
    "function __get(path) { return path.split('.').reduce(function (a, k) { return a[k]; }, self); }",
    "var JOBS = {",
    " pipe: function (a, post) { self.__proj = a.proj; var S = { geo: a.geo, p: a.p }; MD._pm = {}; S.m = MD.make(a.geo, a.p); var st = PIPE.steps(S, a.p, a.pd), t0 = Date.now();",
    "   for (var i = 0; i < st.length; i++) { post({ prog: st[i][0], i: i, n: st.length }); if (i === st.length - 1) S.res.ms = Date.now() - t0; st[i][1](); } return __pack(S); },",
    " auto: function (a, post) { self.__proj = a.proj; MD._pm = {}; return AUTO.run(a.geo, a.p, { async: true, step: function (i, l) { post({ prog: 'auto', i: i, nf: Object.keys(l.fails.col).length + Object.keys(l.fails.beam).length }); } }).then(function (r) { var S = __pack(r.S); __strip(r.log, new Set()); return { S: S, p: r.p, rules: r.rules, log: r.log, ok: r.ok }; }); },",
    " call: function (a) { var f = __get(a.fn), r = f.apply(null, a.args || []); __strip(r, new Set()); return r; },",
    " fixes: function (a) { var run = __get(a.fn); return LIM.fixes(a.id, a.p, function (q) { return run(Object.assign({ __defaults: [] }, q)); }, a.opt); },",
    " ping: function () { return { ok: true, engine: typeof REG !== 'undefined' ? REG.ENGINE : '' }; }",
    "};",
    "self.onmessage = function (e) { var d = e.data, id = d.id; function post(x) { self.postMessage({ id: id, prog: x }); }",
    "  try { Promise.resolve(JOBS[d.job](d.a, post)).then(function (r) { self.postMessage({ id: id, ok: true, r: r }); }, function (er) { self.postMessage({ id: id, ok: false, err: String(er && er.message || er) }); }); }",
    "  catch (er) { self.postMessage({ id: id, ok: false, err: String(er && er.message || er) }); } };"
  ].join("\n");
  function loadSrc() {
    if (srcP) return srcP;
    srcP = new Promise(function (res, rej) {
      if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return rej(new Error("no workers"));
      var inl = document.getElementById("isd-engine");
      if (inl && inl.textContent.length > 1000) return res(inl.textContent);
      var parts = new Array(P.ENGINE.length), left = P.ENGINE.length, failed = false;
      P.ENGINE.forEach(function (f, i) {
        var x = new XMLHttpRequest(); x.open("GET", "js/" + f + ".js", true);
        x.onload = function () { if (failed) return; if (x.status && x.status !== 200 || !x.responseText) { failed = true; return rej(new Error("engine file " + f)); } parts[i] = "/* " + f + " */\n" + x.responseText.replace(/if \(typeof module[^\n]*\n?/g, ""); if (!--left) res(parts.join("\n;\n")); };
        x.onerror = function () { if (!failed) { failed = true; rej(new Error("engine file " + f)); } };
        try { x.send(); } catch (e) { failed = true; rej(e); }
      });
    }).then(function (s) { src = s; url = URL.createObjectURL(new Blob([s, "\n;\n", BOOT], { type: "text/javascript" })); return url; });
    return srcP;
  }
  function spawn() {
    var w = new Worker(url), slot = { w: w, busy: 0 };
    w.onmessage = function (e) { var d = e.data, h = waiting[d.id]; if (!h) return; if (d.prog) { if (h.prog) h.prog(d.prog); return; } delete waiting[d.id]; slot.busy--; h.slot = null; d.ok ? h.res(d.r) : h.rej(new Error(d.err)); pump(); };
    w.onerror = function (e) { e.preventDefault && e.preventDefault(); Object.keys(waiting).forEach(function (k) { var h = waiting[k]; if (h.slot === slot) { delete waiting[k]; h.rej(new Error(e.message || "worker error")); } }); slot.dead = true; pool = pool.filter(function (s) { return s !== slot; }); };
    pool.push(slot); return slot;
  }
  var queue = [];
  function pump() {
    while (queue.length) {
      var free = pool.filter(function (s) { return !s.busy && !s.dead; })[0];
      if (!free && pool.length < HW.workers) free = spawn();
      if (!free) return;
      var h = queue.shift(); free.busy++; h.slot = free; waiting[h.id] = h;
      free.w.postMessage({ id: h.id, job: h.job, a: h.a });
    }
  }
  P.ok = function () { return !!url && !disabled; };
  P.size = function () { return pool.length || (url ? 1 : 0); };
  /* warm up: load the engine and start one worker in the background so the first analysis starts at once */
  P.warm = function () { if (disabled) return; loadSrc().then(function () { if (!pool.length) spawn(); P.job("ping", {}).catch(function () {}); }, function () { disabled = true; }); };
  /* run a job in the pool; prog(x) receives progress messages; returns a Promise */
  P.job = function (job, a, prog) {
    if (disabled) return Promise.reject(new Error("workers unavailable"));
    return loadSrc().then(function () {
      return new Promise(function (res, rej) { var h = { id: ++seq, job: job, a: a, prog: prog, res: res, rej: rej }; queue.push(h); pump(); h.cancel = function () { cancel(h); }; P.last = h; });
    }, function (e) { disabled = true; throw e; });
  };
  function cancel(h) {
    queue = queue.filter(function (q) { return q !== h; });
    if (h.slot) { var s = h.slot; s.dead = true; try { s.w.terminate(); } catch (e) {} pool = pool.filter(function (x) { return x !== s; }); delete waiting[h.id]; }
    h.rej(new Error("cancelled"));
  }
  P.cancelAll = function () { Object.keys(waiting).forEach(function (k) { cancel(waiting[k]); }); queue.slice().forEach(cancel); };
  /* run the same function with several argument sets on separate cores; resolves to the results in order */
  P.map = function (fn, argSets) { return Promise.all(argSets.map(function (a) { return P.job("call", { fn: fn, args: a }); })); };
  P.disable = function () { disabled = true; };
  return P;
})();
if (typeof module !== "undefined") module.exports = { HW: HW, PAR: PAR };
