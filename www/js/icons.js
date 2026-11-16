/* Icon set and illustrations (inline SVG, stroke = currentColor) — drawn for this app. */
var IC = (function () {
  var P = {
    beam: '<path d="M2 8.5h20v6H2z"/><path d="M4.5 12.6h15" stroke-dasharray="1.6 1.4"/><path d="M5 14.5l-2.5 4h5zM19 14.5l-2.5 4h5z"/>',
    slab1: '<path d="M2.5 11l6-4.5h13l-6 4.5z"/><path d="M2.5 11v3h13v-3M15.5 14l6-4.5V6.5"/><path d="M5 18.5h10" stroke-dasharray="2 1.6"/>',
    slab2: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M12 3.5v17M3.5 12h17"/><path d="M6 6.5l3.5 3M14.5 14.5l3.5 3M18 6.5l-3.5 3M9.5 14.5L6 18" opacity=".6"/>',
    slab: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M12 3.5v17M3.5 12h17"/><path d="M6 6.5l3.5 3M14.5 14.5l3.5 3M18 6.5l-3.5 3M9.5 14.5L6 18" opacity=".6"/>',
    column: '<path d="M9 2.5h6v17H9z"/><path d="M9 6.5h6M9 10.5h6M9 14.5h6"/><path d="M4.5 21.5h15"/>',
    footing: '<path d="M10 2.5h4v9h-4z"/><path d="M3.5 11.5h17v4.5h-17z"/><path d="M5 14.4h14" stroke-dasharray="1.6 1.4"/><path d="M2.5 19.5h19" opacity=".6"/>',
    strip: '<path d="M8.5 3h7v9.5h-7z"/><path d="M8.5 6.2h7M8.5 9.4h7M12 3v3.2M10.2 6.2v3.2M13.8 6.2v3.2M12 9.4v3.1"/><path d="M4 12.5h16v4H4z"/><path d="M3 19.5h18" opacity=".6"/>',
    stair: '<path d="M2.5 20.5h4v-4h4v-4h4v-4h4v-4h3"/><path d="M2.5 20.5L21.5 4.5" opacity=".45" stroke-dasharray="2 2"/>',
    truss: '<path d="M2 18L12 6l10 12z"/><path d="M7 12l2.4 6M12 6v12M17 12l-2.4 6"/><circle cx="2" cy="18" r="1"/><circle cx="22" cy="18" r="1"/>',
    purlin: '<path d="M7.5 5.5h7v3M7.5 5.5v13h9v-3"/><path d="M2.5 9.5l19-6" opacity=".55"/>',
    tension: '<path d="M7 10h10v4H7z"/><path d="M1.5 12H7M17 12h5.5"/><path d="M4.5 9l-3 3 3 3M19.5 9l3 3-3 3"/>',
    comp: '<path d="M10 7h4v10h-4z"/><path d="M12 1.5V7M12 17v5.5"/><path d="M9 4.5l3 3 3-3M9 19.5l3-3 3 3"/>',
    sbeam: '<path d="M5 3.5h14v3.2h-5.3v10.6H19v3.2H5v-3.2h5.3V6.7H5z"/>',
    bolts: '<path d="M2.5 7.5h12v9h-12z"/><path d="M9.5 5.5h12v13h-12z" opacity=".8"/><circle cx="12" cy="9.5" r="1.4"/><circle cx="12" cy="14.5" r="1.4"/>',
    roof: '<path d="M2.5 12.5L12 5l9.5 7.5"/><path d="M5 11v8.5h14V11"/><path d="M12 1.5v2M10.8 2.2l2.4 1.4M13.2 2.2l-2.4 1.4" opacity=".7"/>',
    seismic: '<path d="M1.5 12h3l2-6 3 12 3-9 2 5 2-2h6"/><path d="M2 20.5h20" opacity=".5"/>',
    frame: '<path d="M4 20V8.5l8-4 8 4V20"/><path d="M4 14.3l8-4 8 4M12 4.5v11.7M4 20l8-3.8 8 3.8"/><circle cx="12" cy="16.2" r="1" />',
    projects: '<path d="M3 7.5A2 2 0 015 5.5h4l2 2h8a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M3 10h18"/>',
    tables: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>',
    about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.4v.2"/>',
    home: '<path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h5v-5.5h3V20h5V9.5"/>',
    report: '<path d="M6 2.5h8.5l4.5 4.5v14.5H6z"/><path d="M14.5 2.5V7H19M9 11.5h7M9 14.5h7M9 17.5h4.5"/>',
    excel: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/>',
    dxf: '<path d="M3.5 20.5l7-17 7 17"/><path d="M6.4 13.5h8.2M17.5 20.5h3"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/>',
    play: '<path d="M7 4.5l13 7.5-13 7.5z"/>',
    aids: '<path d="M4 20V4M4 20h16"/><path d="M5 17c4-1 7-4 9-11M5 13c3-1 5-3 6-7"/><circle cx="16" cy="9" r="1.2"/>',
    estimate: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7M8.5 11h7M8.5 14.5h3.5M14 14.5h1.5M8.5 18h3.5M14 18h1.5"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    analysis: '<path d="M4 20V9l8-5 8 5v11"/><path d="M4 9h16M4 14.5h16M12 4v16"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
    geometry: '<path d="M3.5 20.5V6.5l7-3 10 4v13z"/><path d="M10.5 3.5v14l10 3M3.5 20.5l7-3"/>',
    material: '<path d="M12 3l8.5 4.5L12 12 3.5 7.5z"/><path d="M3.5 12L12 16.5l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
    loads: '<path d="M6 3v9M12 3v9M18 3v9"/><path d="M3.5 9.5L6 12l2.5-2.5M9.5 9.5L12 12l2.5-2.5M15.5 9.5L18 12l2.5-2.5"/><path d="M2.5 15.5h19v3h-19z"/>',
    estimate: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 14.5h2M12 14.5h2M8 18h2M12 18h4"/>',
    analyse: '<path d="M3.5 20.5h17"/><path d="M5.5 17V11M10 17V6.5M14.5 17v-8M19 17V4"/>',
    pile: '<path d="M3.5 4.5h17v4h-17z"/><path d="M7 8.5v12M12 8.5v12M17 8.5v12"/><path d="M6 20.5l1 1.5 1-1.5M11 20.5l1 1.5 1-1.5M16 20.5l1 1.5 1-1.5" opacity=".7"/>',
    raft: '<path d="M2.5 14l6-3.5h13l-6 3.5z"/><path d="M2.5 14v2.5h13V14M15.5 16.5l6-3.5V10.5"/><path d="M8 11V4.5M14.5 11V4.5" opacity=".75"/>',
    mat: '<path d="M2.5 14l6-3.5h13l-6 3.5z"/><path d="M2.5 14v2.5h13V14M15.5 16.5l6-3.5V10.5"/><path d="M8 11V4.5M14.5 11V4.5" opacity=".75"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17v.2"/>',
    chev: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
    print: '<path d="M6.5 9V3.5h11V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M6.5 14.5h11v6h-11z"/>'
  };
  function svg(name, cls) { return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.about) + '</svg>'; }
  /* app mark: I-section in a rounded tile */
  function logo(s) { s = s || 28; return '<svg class="mark" width="' + s + '" height="' + s + '" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f29a3c"/><stop offset="1" stop-color="#d9631a"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#lg1)"/><path d="M8.5 8h15v3.4h-5.6v9.2h5.6V24h-15v-3.4h5.6v-9.2H8.5z" fill="#fff"/></svg>'; }
  /* hero illustration: isometric 3-storey frame on a mat, with load arrows and a spectrum curve */
  function hero() {
    var s = '<svg class="heroart" viewBox="0 0 300 170" aria-hidden="true"><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#ffffff" stop-opacity=".55"/></linearGradient></defs>';
    function iso(x, y, z) { return [150 + (x - y) * 0.87 * 13, 150 - (x + y) * 0.5 * 13 - z * 11]; }
    function L(a, b, w, c, o) { var p = iso.apply(null, a), q = iso.apply(null, b); s += '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '" stroke="' + (c || "#ffffff") + '" stroke-width="' + (w || 1.6) + '" stroke-linecap="round"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
    /* mat */
    var m = [[-0.6, -0.6], [6.6, -0.6], [6.6, 4.6], [-0.6, 4.6]], pts = m.map(function (q) { return iso(q[0], q[1], -0.35).join(","); }).join(" ");
    s += '<polygon points="' + pts + '" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".5" stroke-width="1"/>';
    var xs = [0, 3, 6], ys = [0, 4], zs = [0, 3.2, 6.4, 9.6];
    xs.forEach(function (x) { ys.forEach(function (y) { L([x, y, 0], [x, y, 9.6], 2.4, null, 0.95); }); });
    zs.slice(1).forEach(function (z, k) { xs.forEach(function (x) { L([x, 0, z], [x, 4, z], 1.6, null, 0.7); }); ys.forEach(function (y) { L([0, y, z], [6, y, z], 1.6, null, 0.7); }); });
    /* slab hint and one braced bay */
    L([0, 0, 0], [3, 0, 3.2], 1.1, "#f6a14a", 0.95); L([3, 0, 0], [0, 0, 3.2], 1.1, "#f6a14a", 0.95);
    /* gravity arrows on the roof */
    [[1.5, 2], [4.5, 2]].forEach(function (q) { var a = iso(q[0], q[1], 12.6), b = iso(q[0], q[1], 10.2); s += '<path d="M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1] + 'M' + (b[0] - 3.5) + ' ' + (b[1] - 5) + 'L' + b[0] + ' ' + b[1] + 'L' + (b[0] + 3.5) + ' ' + (b[1] - 5) + '" stroke="#f6a14a" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; });
    /* lateral (seismic) arrow */
    var e1 = iso(-2.4, 2, 8), e2 = iso(-0.4, 2, 8); s += '<path d="M' + e1[0] + ' ' + e1[1] + 'L' + e2[0] + ' ' + e2[1] + '" stroke="#9fd3ff" stroke-width="2" stroke-linecap="round"/><circle cx="' + e2[0] + '" cy="' + e2[1] + '" r="2.4" fill="#9fd3ff"/>';
    /* response spectrum card */
    s += '<g transform="translate(222 22)"><rect width="70" height="46" rx="7" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".35"/><path d="M8 36h56M8 36V9" stroke="#fff" stroke-opacity=".5" stroke-width="1"/><path d="M8 30l6-17h12c6 0 10 6 15 11s12 8 20 9" stroke="#f6a14a" stroke-width="1.8" fill="none" stroke-linecap="round"/><text x="10" y="44" fill="#fff" fill-opacity=".7" font-size="6.5">Sa/g · T</text></g>';
    /* bending moment card */
    s += '<g transform="translate(8 26)"><rect width="66" height="40" rx="7" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".35"/><path d="M8 16h50" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/><path d="M8 16c8 2 10 14 25 14s17-12 25-14" stroke="#9fd3ff" stroke-width="1.6" fill="#9fd3ff" fill-opacity=".18"/><text x="9" y="36" fill="#fff" fill-opacity=".7" font-size="6.5">M · V · δ</text></g>';
    return s + '</svg>';
  }
  return { svg: svg, logo: logo, hero: hero, names: Object.keys(P) };
})();
if (typeof module !== "undefined") module.exports = IC;
