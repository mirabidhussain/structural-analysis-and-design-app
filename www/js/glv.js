/* GPU (WebGL) renderer for the 3D model viewer.
   Geometry and colours are uploaded once per result state; rotating, zooming and panning only change uniforms,
   so the model moves smoothly even with thousands of members and slab elements.
   Projection identical to the 2D canvas renderer (same yaw / pitch / zoom / pan), so picking and overlays line up. */
var GLV = (function () {
  var G = {};
  var VS_TRI = "attribute vec3 p;attribute vec4 c;uniform vec4 rot;uniform vec4 pan;uniform float sc;uniform float span;varying vec4 vc;" +
    "vec4 prj(vec3 X){float a=X.x*rot.x+X.y*rot.y;float b=-X.x*rot.y+X.y*rot.x;float sy=X.z*rot.z-b*rot.w;float dep=X.z*rot.w+b*rot.z;" +
    "vec2 s=vec2(pan.z*0.5+pan.x+a*sc,pan.w*0.5+pan.y-sy*sc);return vec4(s.x/pan.z*2.0-1.0,1.0-s.y/pan.w*2.0,-dep/(span*4.0),1.0);}" +
    "void main(){gl_Position=prj(p);vc=c;}";
  var VS_LINE = "attribute vec3 a;attribute vec3 b;attribute vec2 sw;attribute vec4 c;uniform vec4 rot;uniform vec4 pan;uniform float sc;uniform float span;varying vec4 vc;" +
    "vec3 scr(vec3 X){float u=X.x*rot.x+X.y*rot.y;float v=-X.x*rot.y+X.y*rot.x;float sy=X.z*rot.z-v*rot.w;float dep=X.z*rot.w+v*rot.z;return vec3(pan.z*0.5+pan.x+u*sc,pan.w*0.5+pan.y-sy*sc,dep);}" +
    "void main(){vec3 A=scr(a),B=scr(b);vec2 d=B.xy-A.xy;float l=length(d);vec2 t=l>1e-6?d/l:vec2(1.0,0.0);vec2 n=vec2(-t.y,t.x);" +
    "vec3 P=sw.x>0.5?B:A;vec2 s=P.xy+n*sw.y*0.5;gl_Position=vec4(s.x/pan.z*2.0-1.0,1.0-s.y/pan.w*2.0,-P.z/(span*4.0),1.0);vc=c;}";
  var FS = "precision mediump float;varying vec4 vc;void main(){gl_FragColor=vc;}";
  function sh(gl, type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function prog(gl, vs, fs) { var p = gl.createProgram(); gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  G.init = function (canvas) {
    try {
      var gl = canvas.getContext("webgl", { antialias: true, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance", desynchronized: true });
      if (!gl) return null;
      var c = { gl: gl, tri: prog(gl, VS_TRI, FS), line: prog(gl, VS_LINE, FS), buf: {}, nTri: 0, nLine: 0 };
      ["tp", "tc", "la", "lb", "ls", "lc"].forEach(function (k) { c.buf[k] = gl.createBuffer(); });
      canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); c.lost = true; }, false);
      return c;
    } catch (e) { return null; }
  };
  /* scene: { tri: [{p:[[x,y,z]×3], c:[r,g,b,a]}], lines: [{a:[x,y,z], b:[x,y,z], c:[r,g,b,a], w: px}], c0:[x,y,z] } */
  G.upload = function (c, scene) {
    var gl = c.gl, c0 = scene.c0, T = scene.tri, L = scene.lines;
    var tp = new Float32Array(T.length * 9), tc = new Uint8Array(T.length * 12);
    T.forEach(function (t, i) { for (var v = 0; v < 3; v++) { for (var d = 0; d < 3; d++) tp[i * 9 + v * 3 + d] = t.p[v][d] - c0[d]; for (var k = 0; k < 4; k++) tc[i * 12 + v * 4 + k] = t.c[k]; } });
    var n = L.length * 6, la = new Float32Array(n * 3), lb = new Float32Array(n * 3), ls = new Float32Array(n * 2), lc = new Uint8Array(n * 4);
    var SIDES = [[0, -1], [0, 1], [1, 1], [0, -1], [1, 1], [1, -1]];
    L.forEach(function (q, i) {
      for (var v = 0; v < 6; v++) {
        var o = i * 6 + v;
        for (var d = 0; d < 3; d++) { la[o * 3 + d] = q.a[d] - c0[d]; lb[o * 3 + d] = q.b[d] - c0[d]; }
        ls[o * 2] = SIDES[v][0]; ls[o * 2 + 1] = SIDES[v][1] * q.w;
        for (var k = 0; k < 4; k++) lc[o * 4 + k] = q.c[k];
      }
    });
    function put(b, data) { gl.bindBuffer(gl.ARRAY_BUFFER, c.buf[b]); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); }
    put("tp", tp); put("tc", tc); put("la", la); put("lb", lb); put("ls", ls); put("lc", lc);
    c.nTri = T.length * 3; c.nLine = n;
  };
  function attr(gl, p, name, buf, size, type, norm) { var l = gl.getAttribLocation(p, name); if (l < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, type, !!norm, 0, 0); }
  function uni(gl, p, v) {
    gl.uniform4f(gl.getUniformLocation(p, "rot"), v.cy, v.sy, v.cp, v.sp);
    gl.uniform4f(gl.getUniformLocation(p, "pan"), v.px, v.py, v.W, v.H);
    gl.uniform1f(gl.getUniformLocation(p, "sc"), v.s); gl.uniform1f(gl.getUniformLocation(p, "span"), v.span);
  }
  /* v: {cy, sy, cp, sp, s, px, py, W, H, span, dpr, bg:[r,g,b]} */
  G.draw = function (c, v) {
    var gl = c.gl; if (c.lost) return false;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(v.bg[0], v.bg[1], v.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (c.nTri) { gl.useProgram(c.tri); uni(gl, c.tri, v); attr(gl, c.tri, "p", c.buf.tp, 3, gl.FLOAT); attr(gl, c.tri, "c", c.buf.tc, 4, gl.UNSIGNED_BYTE, true); gl.drawArrays(gl.TRIANGLES, 0, c.nTri); }
    if (c.nLine) { gl.useProgram(c.line); uni(gl, c.line, v); attr(gl, c.line, "a", c.buf.la, 3, gl.FLOAT); attr(gl, c.line, "b", c.buf.lb, 3, gl.FLOAT); attr(gl, c.line, "sw", c.buf.ls, 2, gl.FLOAT); attr(gl, c.line, "c", c.buf.lc, 4, gl.UNSIGNED_BYTE, true); gl.drawArrays(gl.TRIANGLES, 0, c.nLine); }
    return true;
  };
  /* "#rrggbb" or "rgba(r,g,b,a)" → [r,g,b,a 0-255] */
  G.rgba = function (s) {
    var m;
    if ((m = /^#([0-9a-f]{6})$/i.exec(s))) { var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 255]; }
    if ((m = /rgba?\(([^)]+)\)/.exec(s))) { var a = m[1].split(",").map(parseFloat); return [a[0], a[1], a[2], a.length > 3 ? Math.round(a[3] * 255) : 255]; }
    return [128, 128, 128, 255];
  };
  return G;
})();
