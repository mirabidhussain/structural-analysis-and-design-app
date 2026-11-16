/* offline cache for the installable web version */
var C = "isd-v14", FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "js/data.js", "js/icons.js", "fonts/inter-regular.woff", "fonts/inter-medium.woff", "fonts/inter-semibold.woff", "fonts/inter-bold.woff", "js/core.js", "js/lim.js", "js/rcc.js", "js/steel.js", "js/loads.js", "js/truss.js", "js/fem.js", "js/pushover.js", "js/dxf.js", "js/model.js", "js/se.js", "js/dt.js", "js/mat.js", "js/fdn.js", "js/reg.js", "js/pipe.js", "js/boq.js", "js/auto.js", "js/pdb.js", "js/cad.js", "js/rpt.js", "js/pro.js", "js/wsm.js", "js/calc.js", "js/xlsx.js", "js/report.js", "js/structui.js", "js/app.js"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== C; }).map(function (x) { return caches.delete(x); })); })); });
self.addEventListener("fetch", function (e) { e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); })); });
