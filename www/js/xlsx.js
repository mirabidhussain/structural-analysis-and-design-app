/* Minimal offline .xlsx writer: worksheets with values, formulas (with cached values), styles, merged cells,
   frozen panes, column widths and XY-scatter charts. Output: Uint8Array (stored ZIP). */
var XL = (function () {
  var STY = {   /* index: [fontId, fillId, borderId, numFmtId, align] */
    "": 0, h: 1, t: 2, n0: 3, n2: 4, n3: 5, n4: 6, in: 7, ok: 8, no: 9, sub: 10, note: 11, in2: 12, f2: 13, f0: 14, f4: 15, b: 16, pct: 17, e: 18, e2: 19, desc: 20, link: 21, cd: 22, tb: 23, bt: 24
  };
  function col(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); }

  function Sheet(name, opt) {
    this.name = name.replace(/[\[\]\*\?\/\\:]/g, " ").slice(0, 31); this.rows = []; this.opt = opt || {}; this.merges = []; this.charts = [];
  }
  /* add a row; cells: number | string | null | {v, f, s} ; returns 1-based row number */
  Sheet.prototype.row = function (cells, style, ht) {
    this.rows.push({ c: cells || [], s: style, ht: ht }); return this.rows.length;
  };
  /* colour OK / FAIL text cells live (conditional formatting) */
  Sheet.prototype.status = function (ref) { this.cf = this.cf || []; this.cf.push(ref); };
  Sheet.prototype.next = function () { return this.rows.length + 1; };
  Sheet.prototype.merge = function (ref) { this.merges.push(ref); };
  Sheet.prototype.chart = function (c) { this.charts.push(c); };
  Sheet.prototype.xml = function () {
    var o = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    var nc = 0; this.rows.forEach(function (r) { nc = Math.max(nc, r.c.length); }); this._fit = nc <= 14;
    o.push('<sheetPr>' + (this.opt.color ? '<tabColor rgb="FF' + this.opt.color + '"/>' : '') + (this._fit ? '<pageSetUpPr fitToPage="1"/>' : '') + '</sheetPr>');
    if (this.opt.freeze) {
      var m = this.opt.freeze.match(/([A-Z]+)(\d+)/), cc = 0; for (var i = 0; i < m[1].length; i++) cc = cc * 26 + m[1].charCodeAt(i) - 64; cc--; var rr = +m[2] - 1;
      o.push('<sheetViews><sheetView workbookViewId="0"' + (this.opt.tab ? ' tabSelected="1"' : '') + '><pane' + (cc ? ' xSplit="' + cc + '"' : '') + (rr ? ' ySplit="' + rr + '"' : '') + ' topLeftCell="' + this.opt.freeze + '" activePane="' + (cc && rr ? "bottomRight" : rr ? "bottomLeft" : "topRight") + '" state="frozen"/></sheetView></sheetViews>');
    }
    o.push('<sheetFormatPr defaultRowHeight="15"/>');
    if (this.opt.cols) o.push('<cols>' + this.opt.cols.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + '</cols>');
    o.push('<sheetData>');
    this.rows.forEach(function (r, ri) {
      var rn = ri + 1, cs = [];
      r.c.forEach(function (c, ci) {
        if (c === null || c === undefined || c === "") return;
        var ref = col(ci) + rn, st = r.s || "", v = c, f = null;
        if (typeof c === "object") { st = c.s !== undefined ? c.s : st; f = c.f; v = c.v; }
        var sa = STY[st] ? ' s="' + STY[st] + '"' : "";
        if (f) {
          var fx = '<f>' + esc(f.replace(/^=/, "")) + '</f>';
          if (XL.NOCACHE) cs.push('<c r="' + ref + '"' + sa + '>' + fx + '</c>');
          else if (typeof v === "number" && isFinite(v)) cs.push('<c r="' + ref + '"' + sa + '>' + fx + '<v>' + v + '</v></c>');
          else if (typeof v === "string") cs.push('<c r="' + ref + '"' + sa + ' t="str">' + fx + '<v>' + esc(v) + '</v></c>');
          else cs.push('<c r="' + ref + '"' + sa + '>' + fx + '</c>');
        } else if (typeof v === "number") { if (isFinite(v)) cs.push('<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>'); }
        else if (typeof v === "boolean") cs.push('<c r="' + ref + '"' + sa + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>');
        else if (v !== undefined && v !== null) cs.push('<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
      });
      o.push('<row r="' + rn + '"' + (r.ht ? ' ht="' + r.ht + '" customHeight="1"' : '') + '>' + cs.join("") + '</row>');
    });
    o.push('</sheetData>');
    if (this.merges.length) o.push('<mergeCells count="' + this.merges.length + '">' + this.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + '</mergeCells>');
    var pri = 1;
    (this.cf || []).forEach(function (ref) {
      o.push('<conditionalFormatting sqref="' + ref + '"><cfRule type="cellIs" dxfId="0" priority="' + (pri++) + '" operator="equal"><formula>"OK"</formula></cfRule><cfRule type="cellIs" dxfId="1" priority="' + (pri++) + '" operator="equal"><formula>"FAIL"</formula></cfRule></conditionalFormatting>');
    });
    o.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape"' + (this._fit ? ' fitToWidth="1" fitToHeight="0"' : ' scale="80"') + '/>');
    if (this.charts.length) o.push('<drawing r:id="rId1"/>');
    o.push('</worksheet>');
    return o.join("");
  };

  function Book() { this.sheets = []; this.names = []; }
  Book.prototype.sheet = function (name, opt) { var s = new Sheet(name, opt); this.sheets.push(s); return s; };
  Book.prototype.define = function (name, ref, local) { this.names.push([name, ref, local]); };
  Book.prototype.files = function () {
    var F = {}, sh = this.sheets, nChart = 0;
    F["[Content_Types].xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      sh.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "@@CHARTS@@" + '</Types>';
    F["_rels/.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    F["docProps/core.xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Structural analysis and design</dc:title><dc:creator>IS StructDesign</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z/, "Z") + '</dcterms:created></cp:coreProperties>';
    F["xl/workbook.xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      sh.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + '</sheets>' +
      (this.names.length ? '<definedNames>' + this.names.map(function (n) { return '<definedName name="' + n[0] + '"' + (n[2] !== undefined ? ' localSheetId="' + n[2] + '"' : '') + '>' + esc(n[1]) + '</definedName>'; }).join("") + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    F["xl/_rels/workbook.xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sh.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
      '<Relationship Id="rId' + (sh.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    F["xl/styles.xml"] = styles();
    var ct = "";
    sh.forEach(function (s, i) {
      F["xl/worksheets/sheet" + (i + 1) + ".xml"] = s.xml();
      if (!s.charts.length) return;
      var dn = i + 1, anchors = [], rels = [];
      s.charts.forEach(function (c, k) {
        nChart++;
        F["xl/charts/chart" + nChart + ".xml"] = chartXml(c, s.name);
        ct += '<Override PartName="/xl/charts/chart' + nChart + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
        rels.push('<Relationship Id="rId' + (k + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + nChart + '.xml"/>');
        var a = c.at || [6, 1, 14, 22];
        anchors.push('<xdr:twoCellAnchor><xdr:from><xdr:col>' + a[0] + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + a[1] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>' + a[2] + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + a[3] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
          '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (k + 2) + '" name="Chart ' + (k + 1) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId' + (k + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>');
      });
      F["xl/drawings/drawing" + dn + ".xml"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + anchors.join("") + '</xdr:wsDr>';
      F["xl/drawings/_rels/drawing" + dn + ".xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join("") + '</Relationships>';
      F["xl/worksheets/_rels/sheet" + dn + ".xml.rels"] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + dn + '.xml"/></Relationships>';
      ct += '<Override PartName="/xl/drawings/drawing' + dn + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    });
    F["[Content_Types].xml"] = F["[Content_Types].xml"].replace("@@CHARTS@@", ct);
    return F;
  };
  Book.prototype.bytes = function () { var F = this.files(); return zip(Object.keys(F).map(function (n) { return { n: n, d: utf8(F[n]) }; })); };
  /* deflate-compressed when the platform has CompressionStream (Chrome 80+/Android WebView, Node 18+) */
  Book.prototype.bytesAsync = function () {
    var F = this.files(), ents = Object.keys(F).map(function (n) { return { n: n, d: utf8(F[n]) }; });
    if (typeof CompressionStream === "undefined" || typeof Response === "undefined") return Promise.resolve(zip(ents));
    return Promise.all(ents.map(function (e) {
      return new Response(new Blob([e.d]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer().then(function (b) { e.z = new Uint8Array(b); return e; });
    })).then(zip).catch(function () { ents.forEach(function (e) { delete e.z; }); return zip(ents); });
  };

  function styles() {
    var fonts = ['<font><sz val="10"/><name val="Arial"/></font>', '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>', '<font><b/><sz val="14"/><color rgb="FF1D3557"/><name val="Arial"/></font>',
      '<font><sz val="10"/><color rgb="FF0000FF"/><name val="Arial"/></font>', '<font><b/><sz val="10"/><color rgb="FF1E8E4A"/><name val="Arial"/></font>', '<font><b/><sz val="10"/><color rgb="FFC62828"/><name val="Arial"/></font>',
      '<font><b/><sz val="11"/><color rgb="FF1D3557"/><name val="Arial"/></font>', '<font><i/><sz val="9"/><color rgb="FF5D6B7B"/><name val="Arial"/></font>', '<font><b/><sz val="10"/><name val="Arial"/></font>', '<font><sz val="10"/><color rgb="FF1D3557"/><name val="Consolas"/></font>', '<font><u/><sz val="10"/><color rgb="FF0563C1"/><name val="Arial"/></font>', '<font><b/><sz val="12"/><color rgb="FF1D3557"/><name val="Arial"/></font>'];
    var fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FF1D3557"/></patternFill></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF9C4"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F6EE"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEC"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F4F8"/></patternFill></fill>'];
    var numFmts = '<numFmts count="5"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="0.0000"/><numFmt numFmtId="166" formatCode="0.00E+00"/><numFmt numFmtId="167" formatCode="#,##0.0"/><numFmt numFmtId="168" formatCode="0.00%"/></numFmts>';
    /* [font, fill, border, numFmt, wrap] in STY order */
    var X = [[0, 0, 0, 0], [1, 2, 1, 0, 1], [2, 0, 0, 0], [0, 0, 1, 1], [0, 0, 1, 2], [0, 0, 1, 164], [0, 0, 1, 165], [3, 3, 1, 0], [4, 4, 1, 0], [5, 5, 1, 0], [6, 0, 0, 0], [7, 0, 0, 0, 1], [3, 3, 1, 2], [0, 6, 1, 2], [0, 6, 1, 1], [0, 6, 1, 165], [8, 0, 1, 0], [0, 6, 1, 168], [0, 0, 1, 166], [9, 6, 0, 0, 1], [0, 0, 0, 0, 1], [10, 0, 0, 0], [7, 6, 1, 0, 1], [11, 0, 0, 0], [8, 0, 0, 0, 1]];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + numFmts +
      '<fonts count="' + fonts.length + '">' + fonts.join("") + '</fonts><fills count="' + fills.length + '">' + fills.join("") + '</fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D7DE"/></left><right style="thin"><color rgb="FFD0D7DE"/></right><top style="thin"><color rgb="FFD0D7DE"/></top><bottom style="thin"><color rgb="FFD0D7DE"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + X.length + '">' +
      X.map(function (x) { return '<xf numFmtId="' + x[3] + '" fontId="' + x[0] + '" fillId="' + x[1] + '" borderId="' + x[2] + '" xfId="0"' + (x[0] ? ' applyFont="1"' : '') + (x[1] ? ' applyFill="1"' : '') + (x[2] ? ' applyBorder="1"' : '') + (x[3] ? ' applyNumberFormat="1"' : '') + (x[4] ? ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' : '/>'); }).join("") +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '<dxfs count="2"><dxf><font><b/><color rgb="FF1E8E4A"/></font><fill><patternFill><bgColor rgb="FFE8F6EE"/></patternFill></fill></dxf><dxf><font><b/><color rgb="FFC62828"/></font><fill><patternFill><bgColor rgb="FFFDECEC"/></patternFill></fill></dxf></dxfs></styleSheet>';
  }
  /* c: {title, x:{title}, y:{title}, series:[{name, xref, yref}]} refs like "Pushover!$B$5:$B$40" */
  function chartXml(c) {
    function ax(id, cross, pos, title) {
      return '<c:valAx><c:axId val="' + id + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + pos + '"/><c:majorGridlines><c:spPr><a:ln w="3175"><a:solidFill><a:srgbClr val="E3E7EC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
        '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="900" b="0"/></a:pPr><a:r><a:rPr lang="en-US" sz="900" b="0"/><a:t>' + esc(title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>' +
        '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + cross + '"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>';
    }
    var cols = ["E07A1F", "C62828", "1D3557", "1E8E4A"];
    function cache(a) { if (!a) return ""; return '<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + a.length + '"/>' + a.map(function (v, i) { return '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>'; }).join("") + '</c:numCache>'; }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>' +
      '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>' + esc(c.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>' +
      c.series.map(function (s, i) {
        return '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/><c:tx><c:v>' + esc(s.name) + '</c:v></c:tx><c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="' + cols[i % 4] + '"/></a:solidFill>' + (s.dash ? '<a:prstDash val="dash"/>' : '') + '</a:ln></c:spPr>' +
          '<c:marker><c:symbol val="' + (s.dash ? "none" : "circle") + '"/><c:size val="4"/></c:marker><c:xVal><c:numRef><c:f>' + esc(s.xref) + '</c:f>' + cache(s.xv) + '</c:numRef></c:xVal><c:yVal><c:numRef><c:f>' + esc(s.yref) + '</c:f>' + cache(s.yv) + '</c:numRef></c:yVal><c:smooth val="0"/></c:ser>';
      }).join("") + '<c:axId val="5001"/><c:axId val="5002"/></c:scatterChart>' + ax(5001, 5002, "b", c.x) + ax(5002, 5001, "l", c.y) +
      '</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>';
  }

  /* ---- ZIP (store) ---- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s); var u = unescape(encodeURIComponent(s)), b = new Uint8Array(u.length); for (var i = 0; i < u.length; i++) b[i] = u.charCodeAt(i); return b; }
  function zip(ents) {
    var parts = [], cen = [], off = 0;
    ents.forEach(function (en) {
      var nb = utf8(en.n), d = en.d, c = crc32(d), z = en.z || d, meth = en.z ? 8 : 0, h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, meth, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, c, true); h.setUint32(18, z.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nb, z);
      var e = new DataView(new ArrayBuffer(46));
      e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint16(10, meth, true); e.setUint16(12, 0, true); e.setUint16(14, 0x21, true);
      e.setUint32(16, c, true); e.setUint32(20, z.length, true); e.setUint32(24, d.length, true); e.setUint16(28, nb.length, true); e.setUint32(42, off, true);
      cen.push(new Uint8Array(e.buffer), nb);
      off += 30 + nb.length + z.length;
    });
    var csz = cen.reduce(function (a, b) { return a + b.length; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, ents.length, true); end.setUint16(10, ents.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
    var all = parts.concat(cen, [new Uint8Array(end.buffer)]), tot = all.reduce(function (a, b) { return a + b.length; }, 0), out = new Uint8Array(tot), p = 0;
    all.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }
  return { book: function () { return new Book(); }, col: col, zip: zip, b64: function (u8) { var s = ""; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); } };
})();
if (typeof module !== "undefined") module.exports = XL;
