/* ---------- pictures and Mermaid definitions to draw.io ----------
   Three kinds of drawing arrive in pages made elsewhere and can be made into diagrams for the diagram editor:
   - a sketch-style picture (Rough.js output: every shape is strokes; there are no rect, circle or marker elements);
   - a plain SVG picture drawn with rect, circle, ellipse, polygon, line and path elements, arrowheads as markers;
   - a Mermaid flowchart definition, left as text once the script that drew it has been removed.
   All give draw.io XML. Nothing in the page changes until Done is pressed in the diagram editor.

   Both kinds of picture are read into the same list of shapes, lines and text, then written out the same way: a line
   of text inside a shape becomes its label, a line end that meets a shape is attached to it, and positions are kept. */

/* Sketch pictures, read from how the generator draws:
     box, diamond   an outline of four sides, each stroked twice (8 sub-paths)
     ellipse        an outline of two closed many-segment strokes
     fill           a filled polygon, or a block of hatch strokes, drawn just before its outline
     line, curve    two open strokes; a curve has points along the way
     arrowhead      two short strokes that meet a line's end at an angle
   Left out: the tint and grid behind the drawing. The result is in the diagram editor's Sketch style. */
function readSketch(svg, D) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const at = (e, n) => e.getAttribute(n), none = v => !v || v === 'none', hex = c => none(c) ? 'none' : c.toUpperCase();
  const subs = d => d.split(/(?=M)/).filter(s => s.trim()).map(s => {   // a path as sub-paths, each a list of the points its segments end on
    const pts = []; let m; const re = /([MLC])([^MLC]*)/g;
    while ((m = re.exec(s))) { const n = (m[2].match(/-?\d+(\.\d+)?(e-?\d+)?/g) || []).map(Number); if (n.length >= 2) pts.push({ x: n[n.length - 2], y: n[n.length - 1] }); }
    return pts;
  }).filter(p => p.length);
  const box = e => { const b = e.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const over = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h || 1, b.w * b.h || 1) : 0; };
  let fill = null; const els = [...svg.children];
  for (let i = 0; i < els.length; i++) {
    const e = els[i], tag = e.tagName.toLowerCase();
    if (tag === 'title' || tag === 'desc' || tag === 'defs') continue;
    if (tag === 'rect' && i < 3) continue;                                             // the tint behind the drawing
    if (tag === 'line' && parseFloat(at(e, 'stroke-width')) < 1) continue;             // its grid
    if (tag === 'text') { const b = box(e); D.texts.push({ t: e.textContent.trim(), x: b.x, y: b.y, w: b.w, h: b.h, size: parseFloat(at(e, 'font-size')) || 14, color: hex(at(e, 'fill') || '#000000') }); continue; }
    if (tag !== 'path') { D.skipped++; continue; }
    const S = subs(at(e, 'd') || ''), b = box(e), stroke = at(e, 'stroke'), sw = parseFloat(at(e, 'stroke-width')) || 1;
    if (!S.length) continue;
    if (none(stroke) && !none(at(e, 'fill'))) { fill = { color: hex(at(e, 'fill')), style: 'solid', b }; continue; }
    if (S.length >= 12) { fill = { color: hex(stroke), style: 'hachure', b }; continue; }                // a block of hatch strokes
    const closed = S.length === 2 && S[0].length > 6 && dist(S[0][0], S[0][S[0].length - 1]) < 0.25 * Math.max(b.w, b.h);
    if (S.length === 8 || closed) {
      let r = b, kind = 'ellipse';
      if (!closed) {
        const c = [0, 2, 4, 6].map(k => mid(S[k][0], S[k + 1][0])), xs = c.map(p => p.x), ys = c.map(p => p.y);
        r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
        kind = c.every(p => corners.some(q => Math.hypot(p.x - q[0], p.y - q[1]) < 0.25 * Math.min(r.w, r.h))) ? 'rect' : 'rhombus';
      }
      const f = fill && over(fill.b, r) > 0.7 ? fill : null; fill = null;
      D.add({ kind, r, stroke: hex(stroke), sw, fill: f ? f.color : 'none', fillStyle: f ? f.style : '' }); continue;
    }
    if (S.length === 2) {
      const A = S[0], B = S[1], same = dist(A[0], B[0]) <= dist(A[0], B[B.length - 1]);
      const p = mid(A[0], same ? B[0] : B[B.length - 1]), q = mid(A[A.length - 1], same ? B[B.length - 1] : B[0]);
      const len = e.getTotalLength() / 2, ed = { p, q, via: A.slice(0, -1), stroke: hex(stroke), sw, heads: { p: 0, q: 0 }, curved: A.length > 2 };
      let j = i + 1;   // arrowhead strokes: the short strokes that follow, each meeting one end of the line at an angle
      for (; j < els.length && els[j].tagName.toLowerCase() === 'path'; j++) {
        const h = els[j], HS = subs(at(h, 'd') || ''); if (HS.length !== 2 || !none(at(h, 'fill')) || hex(at(h, 'stroke')) !== ed.stroke) break;
        const a = mid(HS[0][0], HS[1][0]), z = mid(HS[0][HS[0].length - 1], HS[1][HS[1].length - 1]), hl = dist(a, z); if (hl > 24 || hl > len * 0.6) break;
        let end = null, far = null;
        for (const k of ['p', 'q']) for (const [n, f2] of [[a, z], [z, a]]) if (dist(n, ed[k]) < 5) { end = k; far = f2; }
        if (!end) break;
        const back = end === 'q' ? (ed.via.length > 1 ? ed.via[ed.via.length - 1] : ed.p) : (ed.via.length > 1 ? ed.via[1] : ed.q);   // the way the line leaves this end
        const u = { x: back.x - ed[end].x, y: back.y - ed[end].y }, v = { x: far.x - ed[end].x, y: far.y - ed[end].y }, cos = (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) || 1) * (Math.hypot(v.x, v.y) || 1));
        if (cos < 0.5) break;                                                         // square to the line: a tick, not an arrowhead
        ed.heads[end]++;
      }
      i = j - 1; ed.via = ed.via.slice(1); D.add(ed); continue;
    }
    D.skipped++;
  }
}

/* Plain SVG pictures: rect, circle, ellipse and four-point polygons are shapes; line, polyline and open paths are lines,
   with arrowheads from their markers or from a small triangle at an end; colours, line widths, dashes and text sizes
   are read as the browser draws them, so styles set by class are kept. The result is in the Outline style. */
function readShapes(svg, D) {
  const inv = svg.getScreenCTM().inverse(), W = D.W, H = D.H;
  const map = (e, x, y) => { const m = inv.multiply(e.getScreenCTM()); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; };
  const box = e => { const b = e.getBBox(), a = map(e, b.x, b.y), z = map(e, b.x + b.width, b.y + b.height); return { x: Math.min(a.x, z.x), y: Math.min(a.y, z.y), w: Math.abs(z.x - a.x), h: Math.abs(z.y - a.y) }; };
  const col = c => { const h = rgbHex(c); return h; }, num = v => parseFloat(v) || 0;
  const heads = [], lines = [];
  const look = e => { const s = getComputedStyle(e); return { fill: col(s.fill), stroke: s.stroke === 'none' ? 'none' : col(s.stroke), sw: num(s.strokeWidth) || 1, dash: s.strokeDasharray && s.strokeDasharray !== 'none', op: num(s.opacity) * (s.visibility === 'hidden' || s.display === 'none' ? 0 : 1), fop: Math.round(100 * num(s.opacity) * (s.fillOpacity === '' ? 1 : num(s.fillOpacity))), mEnd: s.markerEnd && s.markerEnd !== 'none', mStart: s.markerStart && s.markerStart !== 'none' }; };
  const pathPts = d => {   // the corner points of each sub-path; curves are followed to where they end
    const out = []; let cur = null, x = 0, y = 0, sx = 0, sy = 0, m; const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g, per = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
    while ((m = re.exec(d))) {
      const c = m[1], C = c.toUpperCase(), rel = c !== C, n = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) || []).map(Number);
      if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; } continue; }
      for (let i = 0; i + per[C] <= n.length; i += per[C]) {
        const a = n.slice(i, i + per[C]);
        if (C === 'H') x = rel ? x + a[0] : a[0]; else if (C === 'V') y = rel ? y + a[0] : a[0]; else { const ex = a[a.length - 2], ey = a[a.length - 1]; x = rel ? x + ex : ex; y = rel ? y + ey : ey; }
        if (C === 'M' && i === 0) { cur = { pts: [], curved: false, closed: false }; out.push(cur); sx = x; sy = y; }
        if (!cur) { cur = { pts: [], curved: false, closed: false }; out.push(cur); }
        if ('CSQTA'.includes(C)) cur.curved = true;
        cur.pts.push({ x, y });
      }
    }
    return out;
  };
  const skipIn = 'defs, marker, clipPath, mask, pattern, symbol, linearGradient, radialGradient, filter';
  for (const e of svg.querySelectorAll('rect, circle, ellipse, polygon, line, polyline, path, text')) {
    if (e.closest(skipIn)) continue; const tag = e.tagName.toLowerCase();
    let b; try { b = box(e); } catch (x) { continue; }
    if (tag === 'text') { const s = getComputedStyle(e), t = e.textContent.replace(/\s+/g, ' ').trim(); if (t && s.display !== 'none') D.texts.push({ t, x: b.x, y: b.y, w: b.w, h: b.h, size: Math.round(num(s.fontSize)) || 14, color: col(s.fill) === 'none' ? '#000000' : col(s.fill), bold: num(s.fontWeight) >= 600, italic: s.fontStyle === 'italic', anchor: s.textAnchor }); continue; }
    const L = look(e); if (!L.op || (L.fill === 'none' && L.stroke === 'none')) continue;
    const shape = (kind, r, extra) => D.add(Object.assign({ kind, r, stroke: L.stroke, sw: L.stroke === 'none' ? 0 : L.sw, fill: L.fill, fillStyle: '', dash: L.dash, fop: L.fop }, extra));
    if (tag === 'rect') { if (b.w >= W * 0.97 && b.h >= H * 0.97) continue; if (b.w < 1 || b.h < 1) continue; shape('rect', b, { round: num(e.getAttribute('rx')) || num(e.getAttribute('ry')) }); continue; }
    if (tag === 'circle' || tag === 'ellipse') { shape('ellipse', b); continue; }
    let subsP;
    if (tag === 'line') subsP = [{ pts: [map(e, num(e.getAttribute('x1')), num(e.getAttribute('y1'))), map(e, num(e.getAttribute('x2')), num(e.getAttribute('y2')))], curved: false, closed: false }];
    else if (tag === 'path') subsP = pathPts(e.getAttribute('d') || '').map(s => ({ pts: s.pts.map(p => map(e, p.x, p.y)), curved: s.curved, closed: s.closed }));
    else { const n = (e.getAttribute('points') || '').match(/-?(?:\d+\.?\d*|\.\d+)/g) || [], pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push(map(e, +n[i], +n[i + 1])); subsP = [{ pts, curved: false, closed: tag === 'polygon' }]; }
    for (const s of subsP) {
      const P = s.pts.filter((p, i) => !i || Math.hypot(p.x - s.pts[i - 1].x, p.y - s.pts[i - 1].y) > 0.5); if (P.length > 2 && Math.hypot(P[0].x - P[P.length - 1].x, P[0].y - P[P.length - 1].y) < 0.5) { P.pop(); s.closed = true; }
      if (P.length < 2) continue;
      const xs = P.map(p => p.x), ys = P.map(p => p.y), r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      if (s.closed || (L.fill !== 'none' && L.stroke === 'none')) {
        if (P.length === 3 && Math.max(r.w, r.h) <= 18) { heads.push({ r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 }); continue; }           // a drawn arrowhead
        if (P.length === 4 && !s.curved) {
          const near = (p, q) => Math.hypot(p.x - q[0], p.y - q[1]) < 0.2 * Math.min(r.w, r.h) + 1;
          if (P.every(p => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].some(q => near(p, q)))) { shape('rect', r); continue; }
          if (P.every(p => [[r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2]].some(q => near(p, q)))) { shape('rhombus', r); continue; }
        }
        D.skipped++; continue;
      }
      if (L.stroke === 'none') continue;
      const ed = { p: P[0], q: P[P.length - 1], via: P.slice(1, -1), stroke: L.stroke, sw: L.sw, dash: L.dash, heads: { p: L.mStart ? 1 : 0, q: L.mEnd ? 1 : 0 }, curved: s.curved, block: true };
      if (s.curved && ed.via.length > 6) ed.via = ed.via.filter((p, i) => i % Math.ceil(ed.via.length / 6) === 0);
      lines.push(ed); D.add(ed);
    }
  }
  for (const h of heads) { let best = null; for (const l of lines) for (const k of ['p', 'q']) { const d = Math.hypot(l[k].x - h.cx, l[k].y - h.cy); if (d < 14 && (!best || d < best.d)) best = { d, l, k }; } if (best) best.l.heads[best.k] = 1; else D.skipped++; }
}

function svgToDrawio(svg, plain) {
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number), bb = svg.getBBox(), D = drawingModel(Math.round(vb[2] || bb.width || 800), Math.round(vb[3] || bb.height || 600));
  const sketch = !plain && !svg.querySelector('circle, ellipse, polygon, polyline, marker, g, rect ~ rect');
  (sketch ? readSketch : readShapes)(svg, D);
  return writeDrawio(D, { sketch, name: ((svg.querySelector('title') || {}).textContent || svg.getAttribute('aria-label') || 'Diagram').split(':')[0].trim().slice(0, 80) || 'Diagram' });
}
/* What a reader fills in: shapes and lines in the order they are drawn, and the lines of text. */
function drawingModel(W, H) {
  const D = { W, H, shapes: [], edges: [], order: [], texts: [], skipped: 0 };
  D.add = o => { if (o.r) { o.id = 's' + (D.shapes.length + 1); o.lines = []; D.shapes.push(o); } else { o.id = 'e' + (D.edges.length + 1); D.edges.push(o); } D.order.push(o); };
  return D;
}
/* o.sketch: the Sketch style and its font. o.wrap: labels wrap inside their shape, as text in a page does. */
function writeDrawio(D, o) {
  const FONT = 'fontFamily=Architects Daughter;fontSource=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DArchitects%2BDaughter;';
  const { W, H, shapes, edges, order } = D, sketch = !!o.sketch, WRAP = o.wrap ? 'whiteSpace=wrap;' : '';
  const SK = sketch ? 'sketch=1;curveFitting=1;jiggle=1.5;' : '', TF = sketch ? FONT : '', texts = D.texts;
  const report = { style: sketch ? 'sketch' : 'outline', boxes: shapes.filter(s => s.kind === 'rect').length, diamonds: shapes.filter(s => s.kind === 'rhombus').length, ellipses: shapes.filter(s => s.kind === 'ellipse').length, arrows: edges.filter(e => e.heads.p || e.heads.q).length, lines: edges.filter(e => !(e.heads.p || e.heads.q)).length, attached: 0, ends: edges.length * 2, labels: 0, freeText: 0, skipped: D.skipped };

  /* text: a line whose centre is inside a shape belongs to the smallest such shape */
  texts.forEach(t => { t.cx = t.x + t.w / 2; t.cy = t.y + t.h / 2; });
  const inside = (s, x, y) => s.kind === 'ellipse' ? ((x - s.r.x - s.r.w / 2) / (s.r.w / 2)) ** 2 + ((y - s.r.y - s.r.h / 2) / (s.r.h / 2)) ** 2 <= 1 : x >= s.r.x && x <= s.r.x + s.r.w && y >= s.r.y && y <= s.r.y + s.r.h;
  const free = [];
  for (const t of texts) { if (t.free) { free.push(t); continue; } const host = shapes.filter(s => inside(s, t.cx, t.cy)).sort((a, b) => a.r.w * a.r.h - b.r.w * b.r.h)[0]; if (host && t.w < host.r.w * 1.3) host.lines.push(t); else free.push(t); }
  const rich = lines => { const f = lines[0]; let out = '', prev = null; for (const l of lines) { if (prev) out += l.y - (prev.y + prev.h) > prev.h * 0.6 ? '<br><br>' : '<br>'; const plain = l.size === f.size && l.color === f.color && !!l.bold === !!f.bold; let s = xa(l.t); if (l.bold && !f.bold) s = '<b>' + s + '</b>'; out += plain ? s : '<font color="' + l.color + '" style="font-size:' + l.size + 'px' + (f.bold && !l.bold ? ';font-weight:normal' : '') + '">' + s + '</font>'; prev = l; } return out; };

  /* a box whose text is set out in rows and columns (a data model entity: key, name and type on each row) becomes a table
     label, so each row stays one row and each column keeps its side; null when the text is not like that (at least two
     rows with two or more pieces side by side), and the label is written line by line as before */
  const tabular = (L, r) => {
    if (L.length < 4) return null;
    const rows = []; for (const l of L.slice().sort((a, b) => a.y - b.y || a.x - b.x)) { const k = rows.find(w => Math.abs(w.y - l.y) < Math.max(3, l.h * 0.4)); if (k) k.p.push(l); else rows.push({ y: l.y, p: [l] }); }
    if (rows.filter(w => w.p.length > 1).length < 2) return null;
    rows.forEach(w => w.p.sort((a, b) => a.x - b.x));
    const side = l => l.anchor === 'end' ? 'right' : l.anchor === 'middle' ? 'center' : 'left', ax = l => side(l) === 'right' ? l.x + l.w : side(l) === 'center' ? l.x + l.w / 2 : l.x;
    // columns: where the pieces of the rows with several pieces line up
    const cols = [];
    for (const w of rows) if (w.p.length > 1) for (const l of w.p) { const a = ax(l), c = cols.find(c => c.side === side(l) && Math.abs(c.a - a) < 8); if (c) { c.n++; c.left = Math.min(c.left, l.x); c.right = Math.max(c.right, l.x + l.w); } else cols.push({ a, side: side(l), n: 1, left: l.x, right: l.x + l.w }); }
    cols.sort((a, b) => a.left - b.left);
    const at = l => cols.findIndex(c => c.side === side(l) && Math.abs(c.a - ax(l)) < 8);
    const all = rows.flatMap(w => w.p), freq = new Map(); all.forEach(l => { const k = l.size + '|' + l.color + '|' + !!l.bold; freq.set(k, (freq.get(k) || 0) + 1); });
    const [bs, bc, bb] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0].split('|'), base = { size: +bs, color: bc, bold: bb === 'true' };
    const piece = l => { let t = xa(l.t); if (l.italic) t = '<i>' + t + '</i>'; if (l.bold && !base.bold) t = '<b>' + t + '</b>';
      return l.size === base.size && l.color === base.color && !!l.bold === base.bold ? t : '<font color="' + l.color + '" style="font-size:' + l.size + 'px' + (base.bold && !l.bold ? ';font-weight:normal' : '') + '">' + t + '</font>'; };
    const padL = Math.max(0, Math.round(cols[0].left - r.x)), padR = Math.max(0, Math.round(r.x + r.w - Math.max(...cols.map(c => c.right)))), top = rows[0].y - r.y;
    const width = c => { const i = cols.indexOf(c), next = cols[i + 1]; return next ? Math.max(1, Math.round(next.left - c.left)) : 0; };
    let html = '<table style="width:100%;border-collapse:collapse" cellpadding="0" cellspacing="0">';
    rows.forEach((w, i) => {
      const h = Math.round(i + 1 < rows.length ? rows[i + 1].y - w.y : w.p[0].h * 1.2);
      html += '<tr style="height:' + h + 'px">';
      const slots = cols.map(() => []), loose = [];
      for (const l of w.p) { const k = at(l); if (k < 0) loose.push(l); else slots[k].push(l); }
      if (loose.length && w.p.length === loose.length) { const l = loose[0]; html += '<td colspan="' + cols.length + '"' + (side(l) === 'left' ? '' : ' align="' + side(l) + '"') + ' valign="baseline">' + w.p.map(piece).join(' ') + '</td>'; }
      else { loose.forEach(l => { const k = cols.reduce((m, c, j) => Math.abs(c.left - l.x) < Math.abs(cols[m].left - l.x) ? j : m, 0); slots[k].push(l); });
        cols.forEach((c, j) => { const wd = width(c); html += '<td' + (wd && i === 0 ? ' width="' + wd + '"' : '') + (c.side === 'left' ? '' : ' align="' + c.side + '"') + ' valign="baseline">' + slots[j].map(piece).join(' ') + '</td>'; }); }
      html += '</tr>';
    });
    html += '</table>';
    return { html, base, style: 'fontSize=' + base.size + ';fontColor=' + base.color + ';' + (base.bold ? 'fontStyle=1;' : '') + 'align=left;spacingLeft=' + padL + ';spacingRight=' + padR + ';verticalAlign=top;spacingTop=' + Math.max(0, Math.round(top - 2)) + ';spacing=0;' };
  };

  /* where a line end meets a shape: the attachment, as a fraction of the shape's width and height */
  const meet = pt => {
    let best = null;
    for (const s of shapes) {
      const { x, y, w, h } = s.r, tol = Math.max(6, Math.min(12, Math.min(w, h) * 0.5)); let d;
      if (s.kind === 'ellipse') { const k = Math.hypot((pt.x - x - w / 2) / (w / 2), (pt.y - y - h / 2) / (h / 2)); d = Math.abs(k - 1) * Math.min(w, h) / 2; }
      else if (s.kind === 'rhombus') { const k = Math.abs(pt.x - x - w / 2) / (w / 2) + Math.abs(pt.y - y - h / 2) / (h / 2); d = Math.abs(k - 1) * Math.min(w, h) / 2; }
      else { const dx = Math.max(x - pt.x, 0, pt.x - x - w), dy = Math.max(y - pt.y, 0, pt.y - y - h); d = dx || dy ? Math.hypot(dx, dy) : Math.min(pt.x - x, x + w - pt.x, pt.y - y, y + h - pt.y); }
      if (d <= tol && (!best || d < best.d || (d === best.d && w * h < best.a))) best = { d, a: w * h, id: s.id, fx: Math.min(1, Math.max(0, (pt.x - x) / w)), fy: Math.min(1, Math.max(0, (pt.y - y) / h)) };
    }
    return best;
  };

  const n = v => Math.round(v * 10) / 10, cells = [];
  const geo = r => '<mxGeometry x="' + n(r.x) + '" y="' + n(r.y) + '" width="' + n(r.w) + '" height="' + n(r.h) + '" as="geometry"/>';
  for (const o of order) {
    if (o.r) {
      const L = o.lines.sort((a, b) => a.y - b.y), f = L[0], top = f ? f.y - o.r.y : 0, block = f ? L[L.length - 1].y + L[L.length - 1].h - f.y : 0, centred = f && Math.abs(top + block / 2 - o.r.h / 2) < 5;
      const left = f && Math.abs(f.cx - (o.r.x + o.r.w / 2)) > Math.max(4, o.r.w * 0.04) && L.every(l => Math.abs(l.x - f.x) < 3);
      const tab = f ? tabular(L, o.r) : null;
      const style = (o.kind === 'rect' ? (o.round ? 'rounded=1;absoluteArcSize=1;arcSize=' + Math.round(o.round * 2) + ';' : 'rounded=0;') : o.kind + ';') + 'html=1;fillColor=' + o.fill + ';' + (o.fillStyle ? 'fillStyle=' + o.fillStyle + ';' + (o.fillStyle === 'hachure' ? 'hachureGap=5;fillWeight=1;' : '') : '') +
        'strokeColor=' + o.stroke + ';strokeWidth=' + n(o.sw) + ';' + (o.dash ? 'dashed=1;' : '') + (o.fop < 100 && o.fill !== 'none' ? 'fillOpacity=' + o.fop + ';' : '') + (tab ? tab.style : '') + (f && !tab ? 'fontSize=' + f.size + ';fontColor=' + f.color + ';' + (f.bold ? 'fontStyle=1;' : '') + (left ? 'align=left;spacingLeft=' + Math.max(0, Math.round(f.x - o.r.x)) + ';' + (o.pad ? 'spacingRight=' + Math.round(o.pad) + ';' : '') : 'align=center;' + (o.pad ? 'spacingLeft=' + Math.round(o.pad) + ';spacingRight=' + Math.round(o.pad) + ';' : '')) + WRAP + (centred ? 'verticalAlign=middle;' : 'verticalAlign=top;spacingTop=' + Math.max(0, Math.round(top - 2)) + ';') + 'spacing=0;' : '') + TF + SK;
      cells.push('<mxCell id="' + o.id + '" value="' + xa(tab ? tab.html : f ? rich(L) : '') + '" style="' + xa(style) + '" vertex="1" parent="1">' + geo(o.r) + '</mxCell>'); if (f) report.labels++;
    } else {
      const s = meet(o.p), t = meet(o.q), head = o.block ? 'block;endFill=1' : 'open', tail = o.block ? 'block;startFill=1' : 'open'; report.attached += (s ? 1 : 0) + (t ? 1 : 0);
      const style = 'edgeStyle=none;html=1;rounded=0;' + (o.curved && o.via.length ? 'curved=1;' : '') + 'startArrow=' + (o.heads.p ? tail : 'none') + ';endArrow=' + (o.heads.q ? head : 'none') + ';startSize=' + (o.block ? 6 : 10) + ';endSize=' + (o.block ? 6 : 10) + ';strokeColor=' + o.stroke + ';strokeWidth=' + n(o.sw) + ';' + (o.dash ? 'dashed=1;' : '') +
        (s ? 'exitX=' + s.fx.toFixed(3) + ';exitY=' + s.fy.toFixed(3) + ';exitDx=0;exitDy=0;' : '') + (t ? 'entryX=' + t.fx.toFixed(3) + ';entryY=' + t.fy.toFixed(3) + ';entryDx=0;entryDy=0;' : '') + SK;
      cells.push('<mxCell id="' + o.id + '" value="" style="' + xa(style) + '" edge="1" parent="1"' + (s ? ' source="' + s.id + '"' : '') + (t ? ' target="' + t.id + '"' : '') + '><mxGeometry relative="1" as="geometry"><mxPoint x="' + n(o.p.x) + '" y="' + n(o.p.y) + '" as="sourcePoint"/><mxPoint x="' + n(o.q.x) + '" y="' + n(o.q.y) + '" as="targetPoint"/>' +
        (o.via.length ? '<Array as="points">' + o.via.map(p => '<mxPoint x="' + n(p.x) + '" y="' + n(p.y) + '"/>').join('') + '</Array>' : '') + '</mxGeometry></mxCell>');
    }
  }
  /* text outside every shape: lines stacked under each other become one text block */
  free.sort((a, b) => a.y - b.y || a.x - b.x); const blocks = [];
  for (const t of free) { const b = blocks.find(k => Math.abs(k.cx - t.cx) < 3 && t.y - (k.last.y + k.last.h) < k.last.h * 0.5 && t.y >= k.last.y); if (b) { b.lines.push(t); b.last = t; } else blocks.push({ cx: t.cx, lines: [t], last: t }); }
  blocks.forEach((b, k) => {
    const f = b.lines[0], x = Math.min(...b.lines.map(l => l.x)), w = Math.max(...b.lines.map(l => l.x + l.w)) - x, h = b.last.y + b.last.h - f.y;
    cells.push('<mxCell id="t' + (k + 1) + '" value="' + xa(rich(b.lines)) + '" style="' + xa('text;html=1;' + WRAP + 'align=center;verticalAlign=middle;strokeColor=none;fillColor=none;spacing=0;fontSize=' + f.size + ';fontColor=' + f.color + ';' + (f.bold ? 'fontStyle=1;' : '') + TF) + '" vertex="1" parent="1">' + geo({ x: x - 4, y: f.y, w: w + 8, h }) + '</mxCell>'); report.freeText++;
  });
  const name = o.name || 'Diagram';
  return { name, report, xml: '<mxfile><diagram name="' + xa(name) + '" id="d1"><mxGraphModel dx="0" dy="0" grid="1" gridSize="8" page="0" pageWidth="' + W + '" pageHeight="' + H + '"><root><mxCell id="0"/><mxCell id="1" parent="0"/>' + cells.join('') + '</root></mxGraphModel></diagram></mxfile>' };
}

/* Mermaid flowcharts (flowchart or graph): nodes with their shapes and text, links with their text, line type and
   arrowheads, subgraphs as groups, and fill, stroke and text colours from style, classDef and class. A definition has no
   positions, so the diagram is laid out here: in ranks along the chart's direction, ordered to keep links short; a subgraph
   with a direction of its own is laid out that way when Mermaid would honour it.
   The result is in the Blueprint style. Other Mermaid diagram types are recognised but not converted. */
const MM_KIND = /^\s*(?:%%\{[\s\S]*?\}%%\s*)*(?:---[ \t]*\n[\s\S]*?\n---[ \t]*\n\s*)?(?:%%[^\n]*\n\s*)*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|xychart-beta|sankey-beta|block-beta)\b/;
function mmBlock(n) {
  if (!n || !n.closest) return null; let b = n.closest('pre, .mermaid'); if (!b || !doc.contains(b) || b.closest('.dg, .fig, .note')) return null;
  return MM_KIND.test(preText(b)) ? b : null;
}
function mermaidToDrawio(src) {
  const kind = (src.match(MM_KIND) || [])[1];
  if (!kind) return { error: 'This is not a Mermaid definition the editor recognises.' };
  if (kind !== 'flowchart' && kind !== 'graph') return { error: 'Only Mermaid flowcharts can be made into diagrams. This definition is a ' + kind.replace(/-.*$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() + ', so it stays as text.' };
  const title = (src.match(/^\s*---[ \t]*\n[\s\S]*?^title:[ \t]*(.+)$[\s\S]*?\n---/m) || [])[1];
  const text = src.replace(/%%\{[\s\S]*?\}%%/g, '').replace(/^\s*---[ \t]*\n[\s\S]*?\n---[ \t]*\n/, '');
  /* statements: one a line, or several on a line with ; between them (not inside text) */
  const stmts = [];
  for (let line of text.split(/\r?\n/)) {
    if (/^\s*%%/.test(line)) continue;
    let cur = '', q = false, depth = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q; else if (!q && '[({'.includes(c)) depth++; else if (!q && '])}'.includes(c)) depth = Math.max(0, depth - 1);
      if (c === ';' && !q && !depth && !/#\w+$/.test(cur)) { stmts.push(cur); cur = ''; } else cur += c;
    }
    stmts.push(cur);
  }
  const nodes = new Map(), edges = [], subs = [], stack = [], classes = {}, DIRS = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };
  let dir = 'TB', started = false;
  const css = t => { const o = {}; t.split(',').forEach(p => { const m = p.trim().match(/^([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/); if (m) o[m[1]] = m[2].length === 4 ? '#' + [...m[2].slice(1)].map(x => x + x).join('') : m[2].slice(0, 7); }); return o; };
  const label = t => {
    t = t.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/^`([\s\S]*)`$/, '$1').trim();
    t = t.replace(/#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/#quot;/g, '"').replace(/#amp;/g, '&').replace(/#lt;/g, '<').replace(/#gt;/g, '>').replace(/#nbsp;/g, ' ');
    return t.split(/<br\s*\/?>|\\n|\n/i).map(l => esc(l.trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')).join('<br>');
  };
  const node = id => { let n = nodes.get(id); if (!n) { n = { id, label: esc(id), shape: 'rect', sub: null, cls: [], style: {} }; nodes.set(id, n); } if (stack.length && !n.sub) n.sub = stack[stack.length - 1]; return n; };
  const SHAPES = [['(((', ')))', 'circle'], ['([', '])', 'stadium'], ['[[', ']]', 'rect'], ['[(', ')]', 'cylinder'], ['((', '))', 'circle'], ['{{', '}}', 'hexagon'], ['[/', '/]', 'para'], ['[\\', '\\]', 'para'], ['(', ')', 'round'], ['[', ']', 'rect'], ['{', '}', 'rhombus'], ['>', ']', 'rect']];
  const AT = { rect: 'rect', rectangle: 'rect', process: 'rect', rounded: 'round', event: 'round', stadium: 'stadium', pill: 'stadium', terminal: 'stadium', diam: 'rhombus', diamond: 'rhombus', decision: 'rhombus', question: 'rhombus', circle: 'circle', circ: 'circle', cyl: 'cylinder', cylinder: 'cylinder', database: 'cylinder', db: 'cylinder', hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon' };
  function statement(s) {
    let i = 0; const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const one = () => {
      ws(); const m = s.slice(i).match(/^[A-Za-z0-9_\u0080-￿]+(?:[.\-][A-Za-z0-9_\u0080-￿]+)*/); if (!m) return null;
      i += m[0].length; const n = node(m[0]);
      if (s.startsWith('@{', i)) { const e = s.indexOf('}', i); if (e > 0) { const body = s.slice(i + 2, e), l = body.match(/label:\s*"([^"]*)"/), sh = body.match(/shape:\s*([\w-]+)/); if (l) n.label = label(l[1]); if (sh && AT[sh[1]]) n.shape = AT[sh[1]]; i = e + 1; } }
      else for (const [open, close, shape] of SHAPES) {
        if (!s.startsWith(open, i)) continue;
        let a = i + open.length, e; const alt = open === '[/' ? '\\]' : open === '[\\' ? '/]' : null;
        while (a < s.length && s[a] === ' ') a++;
        if (s[a] === '"') { const qe = s.indexOf('"', a + 1); e = qe < 0 ? -1 : s.indexOf(close, qe + 1); if (e < 0 && alt && qe >= 0) e = s.indexOf(alt, qe + 1); }
        else { e = s.indexOf(close, a); if (alt) { const e2 = s.indexOf(alt, a); if (e2 >= 0 && (e < 0 || e2 < e)) e = e2; } }
        if (e < 0) break;
        n.label = label(s.slice(i + open.length, e)); n.shape = shape; i = e + close.length; break;
      }
      const c = s.slice(i).match(/^:::([\w-]+)/); if (c) { n.cls.push(c[1]); i += c[0].length; }
      return n;
    };
    const group = () => { const g = []; for (;;) { const n = one(); if (!n) break; g.push(n); ws(); if (s[i] === '&') i++; else break; } return g; };
    const link = () => {
      const r = s.slice(i); let m, o = null;
      if ((m = r.match(/^\s*([<ox]?)--\s+(.+?)\s+-{2,}([>ox]?)/))) o = { line: 'solid', tail: m[1], text: m[2], head: m[3] };
      else if ((m = r.match(/^\s*([<ox]?)==\s+(.+?)\s+={2,}([>ox]?)/))) o = { line: 'thick', tail: m[1], text: m[2], head: m[3] };
      else if ((m = r.match(/^\s*([<ox]?)-\.\s+(.+?)\s+\.+-([>ox]?)/))) o = { line: 'dotted', tail: m[1], text: m[2], head: m[3] };
      else if ((m = r.match(/^\s*([<ox]?)(-{2,}|={2,}|-\.+-)([>ox]?)\s*(?:\|([^|]*)\|)?/))) o = { line: m[2][0] === '=' ? 'thick' : m[2].includes('.') ? 'dotted' : 'solid', tail: m[1], head: m[3], text: m[4] || '' };
      if (!o) return null; i += m[0].length; return o;
    };
    let a = group(); if (!a.length) return;
    for (;;) { const l = link(); if (!l) break; const b = group(); if (!b.length) break; for (const x of a) for (const y of b) edges.push({ a: x.id, b: y.id, label: l.text ? label(l.text) : '', line: l.line, head: l.head === '>', tail: l.tail === '<' }); a = b; }
  }
  for (let s of stmts) {
    s = s.replace(/\s%%.*$/, '').trim(); if (!s) continue; let m;
    if (!started) { m = s.match(/^(flowchart|graph)\b\s*(\w+)?/); if (m) { started = true; dir = DIRS[(m[2] || '').toUpperCase()] || 'TB'; } continue; }
    if ((m = s.match(/^subgraph\s+(.*)$/))) { const r = m[1].trim(), k = r.match(/^([^\s\[]+)\s*\[(.+)\]$/); const sg = { id: k ? k[1] : r.replace(/^"(.*)"$/, '$1'), title: label(k ? k[2] : r), parent: stack[stack.length - 1] || null }; subs.push(sg); stack.push(sg); continue; }
    if (/^end$/.test(s)) { stack.pop(); continue; }
    if ((m = s.match(/^direction\s+(\w+)/))) { if (stack.length) stack[stack.length - 1].dir = m[1]; continue; }
    if (/^(linkStyle|click|accTitle|accDescr)\b/.test(s)) continue;
    if ((m = s.match(/^classDef\s+([\w,-]+)\s+(.*)$/))) { m[1].split(',').forEach(c => { classes[c] = css(m[2]); }); continue; }
    if ((m = s.match(/^class\s+([\w,.\-]+)\s+([\w-]+)$/))) { m[1].split(',').forEach(id => { if (nodes.has(id)) nodes.get(id).cls.push(m[2]); }); continue; }
    if ((m = s.match(/^style\s+([\w.\-]+)\s+(.*)$/))) { if (nodes.has(m[1])) Object.assign(nodes.get(m[1]).style, css(m[2])); continue; }
    statement(s);
  }
  for (const sg of subs) { const n = nodes.get(sg.id); if (n && n.label === esc(sg.id) && n.shape === 'rect') { nodes.delete(sg.id); } }   // a link to a subgraph, not a node of that name
  const N = [...nodes.values()]; if (!N.length) return { error: 'No shapes were found in this Mermaid definition, so it stays as text.' };
  const subOf = id => subs.find(x => x.id === id), links = edges.filter(e => (nodes.has(e.a) || subOf(e.a)) && (nodes.has(e.b) || subOf(e.b)));

  /* sizes from the text */
  const cv = document.createElement('canvas').getContext('2d'); cv.font = '17px "Architects Daughter", sans-serif';
  const g8 = v => Math.ceil(v / 8) * 8;
  for (const n of N) {
    const lines = n.label.split('<br>').map(l => l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')), tw = Math.max(...lines.map(l => cv.measureText(l).width)), th = lines.length * 24;
    n.w = g8(Math.max(112, tw + 40)); n.h = g8(Math.max(56, th + 28));
    if (n.shape === 'rhombus') { n.w = g8(tw * 1.5 + 56); n.h = g8(th + 64); } else if (n.shape === 'circle') { n.w = n.h = g8(Math.max(tw + 36, th + 36, 72)); } else if (n.shape === 'hexagon' || n.shape === 'para') n.w += 24; else if (n.shape === 'cylinder') n.h += 16;
  }
  /* One arrangement: ranks along its direction (links that close a loop do not push their target down), each rank
     ordered toward the average place of its neighbours, a subgraph's members kept together. */
  const arrange = (items, E, dir, stop) => {
    const horiz = dir === 'LR' || dir === 'RL', out = new Map(items.map(n => [n.id, []])), state = new Map(), flow = [];
    for (const e of E) if (e.a !== e.b) out.get(e.a).push(e);
    const visit = id => { state.set(id, 1); for (const e of out.get(id)) { const s = state.get(e.b); if (s === 1) continue; flow.push(e); if (!s) visit(e.b); } state.set(id, 2); };
    for (const n of items) if (!state.get(n.id)) visit(n.id);
    const rank = new Map(items.map(n => [n.id, 0]));
    for (let k = 0, moved = true; moved && k < items.length + 2; k++) { moved = false; for (const e of flow) if (rank.get(e.b) < rank.get(e.a) + 1) { rank.set(e.b, rank.get(e.a) + 1); moved = true; } }
    const rows = []; for (const n of items) (rows[rank.get(n.id)] = rows[rank.get(n.id)] || []).push(n);
    for (let r = 0; r < rows.length; r++) rows[r] = rows[r] || [];
    const pos = new Map(), place = () => rows.forEach(row => row.forEach((n, k) => pos.set(n.id, k)));
    const top = n => { let s = n.sub; if (!s || s === stop) return null; while (s.parent && s.parent !== stop) s = s.parent; return s; };
    const sweep = (r, from) => {
      const key = new Map(rows[r].map(n => { const nb = flow.filter(e => (from < 0 ? e.b === n.id && rank.get(e.a) < r : e.a === n.id && rank.get(e.b) > r)).map(e => pos.get(from < 0 ? e.a : e.b)); return [n.id, nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : pos.get(n.id)]; }));
      const gk = new Map();
      for (const n of rows[r]) { const t = top(n); if (t) { const g = gk.get(t) || { sum: 0, n: 0 }; g.sum += key.get(n.id); g.n++; gk.set(t, g); } }
      rows[r] = rows[r].map((n, k) => ({ n, k, t: top(n) })).sort((a, b) => { const ka = a.t ? gk.get(a.t).sum / gk.get(a.t).n : key.get(a.n.id), kb = b.t ? gk.get(b.t).sum / gk.get(b.t).n : key.get(b.n.id); return ka - kb || (a.t === b.t ? key.get(a.n.id) - key.get(b.n.id) : 0) || a.k - b.k; }).map(x => x.n);
      place();
    };
    place(); for (let k = 0; k < 4; k++) { for (let r = 1; r < rows.length; r++) sweep(r, -1); for (let r = rows.length - 2; r >= 0; r--) sweep(r, 1); }
    const along = n => horiz ? n.w : n.h, across = n => horiz ? n.h : n.w;
    let at = 0; const rowAt = [], rowSize = [], rowWide = [];
    rows.forEach((row, r) => {
      const labelled = r > 0 && flow.some(e => e.label && rank.get(e.a) < r && rank.get(e.b) >= r), nested = row.some(n => top(n) || n.own) || (r > 0 && rows[r - 1].some(n => top(n) || n.own));
      if (r > 0) at += (horiz ? 88 : 64) + (labelled ? (horiz ? 56 : 32) : 0) + (nested ? 32 : 0);
      rowAt[r] = at; rowSize[r] = Math.max(0, ...row.map(along)); at += rowSize[r];
      let x = 0; row.forEach((n, k) => { if (k) x += 40 + (top(row[k - 1]) !== top(n) || n.own || row[k - 1].own ? 40 : 0); n.c = x; x += across(n); }); rowWide[r] = x;
    });
    const wide = Math.max(0, ...rowWide);
    rows.forEach((row, r) => row.forEach(n => { const a = rowAt[r] + (rowSize[r] - along(n)) / 2, c = n.c + (wide - rowWide[r]) / 2; n.x = horiz ? a : c; n.y = horiz ? c : a; n.rk = r; n.arr = items; n.dir = dir; }));
    if (dir === 'BT') { const m = Math.max(...items.map(n => n.y + n.h)); items.forEach(n => { n.y = m - n.y - n.h; }); }
    if (dir === 'RL') { const m = Math.max(...items.map(n => n.x + n.w)); items.forEach(n => { n.x = m - n.x - n.w; }); }
  };
  /* A subgraph with a direction of its own is arranged on its own and then placed as one block, as Mermaid does:
     only when none of its members is linked to anything outside it. */
  const inSub = (n, sg) => { for (let s = n.sub; s; s = s.parent) if (s === sg) return true; return false; };
  for (const sg of subs) {
    const eff = sg.parent ? sg.parent.eff : dir, d = DIRS[(sg.dir || '').toUpperCase()];
    sg.own = !!d && d !== eff && N.some(n => inSub(n, sg)) && !links.some(e => nodes.has(e.a) && nodes.has(e.b) && inSub(nodes.get(e.a), sg) !== inSub(nodes.get(e.b), sg));
    sg.eff = sg.own ? d : eff;
  }
  const owner = s => { for (; s; s = s.parent) if (s.own) return s; return null; };
  const build = own => {
    const items = N.filter(n => owner(n.sub) === own), blocks = subs.filter(s => s.own && owner(s.parent) === own).map(s => build(s)); items.push(...blocks);
    const idOf = id => { if (nodes.has(id)) { const n = nodes.get(id); if (items.includes(n)) return id; const b = blocks.find(k => inSub(n, k.own)); return b ? b.id : null; } const b = blocks.find(k => k.own.id === id); return b ? b.id : null; };
    const E = links.map(e => ({ a: idOf(e.a), b: idOf(e.b), label: e.label })).filter(e => e.a && e.b);
    arrange(items, E, own ? own.eff : dir, own);
    if (!own) return { items };
    const x0 = Math.min(...items.map(n => n.x)), y0 = Math.min(...items.map(n => n.y));
    items.forEach(n => { n.x -= x0; n.y -= y0; });
    return { id: 'sub:' + own.id, own, sub: own.parent, items, w: Math.max(...items.map(n => n.x + n.w)) + 48, h: Math.max(...items.map(n => n.y + n.h)) + 68 };
  };
  const settle = items => items.forEach(b => { if (b.items) { b.items.forEach(n => { n.x += b.x + 24; n.y += b.y + 44; }); settle(b.items); } });
  settle(build(null).items);
  /* groups: the box round a subgraph's members and the subgraphs inside it */
  for (const sg of [...subs].reverse()) {
    const boxes = [...N.filter(n => inSub(n, sg)), ...subs.filter(k => k.parent === sg && k.r).map(k => k.r)]; if (!boxes.length) continue;
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y)), x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
    sg.r = { x: x0 - 24, y: y0 - 44, w: x1 - x0 + 48, h: y1 - y0 + 68 };
  }
  const all = [...N, ...subs.filter(s => s.r).map(s => s.r)], dx = 32 - Math.min(...all.map(b => b.x)), dy = 32 - Math.min(...all.map(b => b.y));
  all.forEach(b => { b.x = Math.round(b.x + dx); b.y = Math.round(b.y + dy); });
  const W = g8(Math.max(...all.map(b => b.x + b.w)) + 32), H = g8(Math.max(...all.map(b => b.y + b.h)) + 32);

  const B = BPX.font + 'deMode=blueprint;', cells = [], ids = new Map(); let k = 0;
  const geo = r => '<mxGeometry x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" as="geometry"/>';
  cells.push('<mxCell id="bg" value="" style="rounded=0;html=1;fillColor=#ffffff;strokeColor=none;deDots=1;" vertex="1" parent="1">' + geo({ x: 0, y: 0, w: W, h: H }) + '</mxCell>');
  for (const sg of subs) { if (!sg.r) continue; const id = 'g' + (++k); ids.set('sub:' + sg.id, id); cells.push('<mxCell id="' + id + '" value="' + xa(sg.title) + '" style="' + xa('rounded=1;absoluteArcSize=1;arcSize=6;html=1;fillColor=none;strokeColor=' + BPX.inkSoft + ';strokeWidth=1.5;dashed=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontSize=17;fontColor=' + BPX.inkSoft + ';' + B) + '" vertex="1" parent="1">' + geo(sg.r) + '</mxCell>'); }
  const FORM = { rect: 'rounded=1;absoluteArcSize=1;arcSize=6;', round: 'rounded=1;absoluteArcSize=1;arcSize=24;', stadium: 'rounded=1;arcSize=50;', rhombus: 'rhombus;', circle: 'ellipse;', cylinder: 'shape=cylinder3;boundedLbl=1;size=10;', hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;size=0.12;fixedSize=0;', para: 'shape=parallelogram;perimeter=parallelogramPerimeter;size=0.12;fixedSize=0;' };
  for (const n of N) {
    const st = Object.assign({}, ...n.cls.map(c => classes[c] || {}), n.style), id = 'n' + (++k); ids.set(n.id, id);
    cells.push('<mxCell id="' + id + '" value="' + xa(n.label) + '" style="' + xa(FORM[n.shape] + 'whiteSpace=wrap;html=1;fillColor=' + (st.fill || BPX.fill) + ';strokeColor=' + (st.stroke || BPX.ink) + ';fontColor=' + (st.color || BPX.ink) + ';strokeWidth=1.5;fontSize=17;' + BPX.shadow + B) + '" vertex="1" parent="1">' + geo(n) + '</mxCell>');
  }
  const SIDE = { TB: ['exitX=0.5;exitY=1;', 'entryX=0.5;entryY=0;'], BT: ['exitX=0.5;exitY=0;', 'entryX=0.5;entryY=1;'], LR: ['exitX=1;exitY=0.5;', 'entryX=0;entryY=0.5;'], RL: ['exitX=0;exitY=0.5;', 'entryX=1;entryY=0.5;'] };
  for (const e of links) {
    const s = ids.get(e.a) || ids.get('sub:' + e.a), t = ids.get(e.b) || ids.get('sub:' + e.b); if (!s || !t) continue;
    const A = nodes.get(e.a), Z = nodes.get(e.b), fwd = !!A && !!Z && A.arr === Z.arr && Z.rk > A.rk, S = SIDE[fwd ? A.dir : dir];
    cells.push('<mxCell id="l' + (++k) + '" value="' + xa(e.label) + '" style="' + xa('edgeStyle=orthogonalEdgeStyle;html=1;rounded=0;' + (e.tail ? 'startArrow=block;startFill=1;startSize=8;' : 'startArrow=none;') + (e.head ? 'endArrow=block;endFill=1;endSize=8;' : 'endArrow=none;') + 'strokeWidth=' + (e.line === 'thick' ? 4 : 2.5) + ';strokeColor=' + BPX.ink + ';' +
      (e.line === 'dotted' ? 'dashed=1;dashPattern=3.2 2.4;deLine=planned;' : e.head || e.tail ? '' : 'deLine=association;') + (fwd ? S[0] + 'exitDx=0;exitDy=0;' + S[1] + 'entryDx=0;entryDy=0;' : '') + 'fontSize=17;fontColor=' + BPX.inkSoft + ';labelBackgroundColor=#FFFFFF;' + B) + '" edge="1" parent="1" source="' + s + '" target="' + t + '"><mxGeometry relative="1" as="geometry"/></mxCell>');
  }
  const name = (title ? title.trim().replace(/^(['"])(.*)\1$/, '$2') : 'Flowchart').slice(0, 80);
  return { name, report: { shapes: N.length, links: links.length, groups: subs.filter(s => s.r).length }, xml: '<mxfile><diagram name="' + xa(name) + '" id="d1"><mxGraphModel dx="0" dy="0" grid="1" gridSize="8" page="0" pageWidth="' + W + '" pageHeight="' + H + '"><root><mxCell id="0"/><mxCell id="1" parent="0"/>' + cells.join('') + '</root></mxGraphModel></diagram></mxfile>' };
}

/* A picture or a Mermaid block in the page that can be offered for conversion, and the conversion itself. */
function pictureAt(n) {
  const s = n && n.closest ? n.closest('svg') : null; if (!s || !doc.contains(s) || s.closest('.dg, .fig, .note, .note-log, .link-card, .wb-board')) return null;
  const r = s.getBoundingClientRect(); return r.width >= 80 && r.height >= 60 ? s : null;
}
function drawingToDrawio(el) {
  try {
    if (el.matches('svg')) { let r = svgToDrawio(el), n = r.report; if (r.report.style === 'sketch' && !(n.boxes + n.diamonds + n.ellipses)) { r = svgToDrawio(el, true); n = r.report; } return n.boxes + n.diamonds + n.ellipses ? r : { error: 'No boxes, diamonds or ellipses were recognised in this picture, so it cannot be made into a diagram. It stays as a picture.' }; }
    return mermaidToDrawio(preText(el));
  } catch (e) { return { error: 'This could not be made into a diagram (' + e.message + '). It stays as it is.' }; }
}

/* ---------- diagrams drawn with HTML boxes ----------
   Layer and architecture pictures are often not pictures at all: they are div boxes with borders and backgrounds, set
   out by CSS grid and flexbox. Their look and their places come from the page's style sheet and the browser's layout,
   neither of which is carried into the editor, where only the words would be left. So they are read while the page is
   drawn off screen (see withPictures), where the browser says exactly where each box is:
     box        an element with a border or a background of its own; a fully rounded one is an ellipse
     rule       an element with a border on one side only becomes a line
     text       the words directly in a box become its label; words outside every box stay as text
   A diagram is the smallest block that holds a group of at least three such boxes, uses grid or flexbox, and has no
   running prose in it outside the boxes. A page can hold several; each becomes one diagram, in the Outline style.
   An arrow written as a character on its own becomes a connector when it has a shape behind it and a shape ahead of it. */
function boxDiagrams(d, w) {
  const SKIP = /^(html|body|script|style|svg|table|thead|tbody|tfoot|tr|td|th|pre|code|img|br|hr|input|button|select|textarea|iframe|video|audio|canvas|a)$/i;
  const alpha = c => { const m = String(c).match(/[\d.]+/g); return !m || m.length < 3 ? 0 : m.length > 3 ? +m[3] : 1; };
  const info = new Map();
  const boxOf = e => {
    if (info.has(e)) return info.get(e); let v = null;
    if (e.nodeType === 1 && !SKIP.test(e.tagName) && !e.closest('svg, table, pre')) {
      const s = w.getComputedStyle(e), r = e.getBoundingClientRect();
      if (s.display !== 'none' && s.display !== 'inline' && s.visibility !== 'hidden' && r.width >= 8 && r.height >= 8) {
        const sides = ['Top', 'Right', 'Bottom', 'Left'].map(k => ({ k, w: parseFloat(s['border' + k + 'Width']) || 0, on: s['border' + k + 'Style'] !== 'none' && alpha(s['border' + k + 'Color']) > 0, c: s['border' + k + 'Color'], dash: /dash|dot/.test(s['border' + k + 'Style']) })).filter(b => b.w > 0 && b.on);
        const bg = alpha(s.backgroundColor) > 0;
        if (sides.length === 1 && !bg) v = { rule: sides[0], s, r };
        else if (sides.length || bg) v = { sides, bg, s, r };
      }
    }
    info.set(e, v); return v;
  };
  const all = [...d.body.querySelectorAll('*')], isBox = e => { const b = boxOf(e); return !!b && !b.rule; };
  const inBox = (e, top) => { for (let p = e.parentElement; p && p !== top.parentElement; p = p.parentElement) if (isBox(p)) return true; return false; };
  const own = e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join(' ').replace(/\s+/g, ' ').trim();
  const count = new Map(); for (const e of all) if (isBox(e)) for (let p = e.parentElement; p; p = p.parentElement) count.set(p, (count.get(p) || 0) + 1);
  const ok = e => {
    if ((count.get(e) || 0) + (isBox(e) ? 1 : 0) < 3 || /^(html|head)$/i.test(e.tagName) || e.closest('svg, table, pre, .dg, .fig')) return false;
    const inner = [e, ...e.querySelectorAll('*')]; let laid = false, long = 0;
    for (const x of inner) {
      const s = w.getComputedStyle(x); if (/grid|flex/.test(s.display)) laid = true;
      const t = own(x), prose = /^(p|li|h1|h2|h3|h4|h5|h6|blockquote|td|th|dd|dt)$/i.test(x.tagName) ? t.length > 0 : t.length > 90;
      if (prose && x !== e && !isBox(x) && !inBox(x, e)) return false;        // running text beside the boxes: this is a page, not a diagram
      if (t.length > 200) long++;
    }
    return laid && long < 3;
  };
  let roots = all.concat([d.body]).filter(ok); roots = roots.filter(e => !roots.some(o => o !== e && o.contains(e)));
  roots = roots.map(e => { for (;;) { if (isBox(e)) return e; const c = [...e.children].find(k => (count.get(k) || 0) + (isBox(k) ? 1 : 0) === (count.get(e) || 0)); if (!c) return e; e = c; } });
  const out = [];
  for (const root of roots) {
    const R0 = root.getBoundingClientRect(), D = drawingModel(Math.ceil(root.scrollWidth || R0.width), Math.ceil(root.scrollHeight || R0.height));
    const rel = r => ({ x: r.left - R0.left, y: r.top - R0.top, w: r.width, h: r.height });
    for (const e of [root, ...root.querySelectorAll('*')]) {
      const b = boxOf(e); if (!b) continue; const r = rel(b.r);
      if (b.rule) { const k = b.rule.k, y = k === 'Bottom' ? r.y + r.h : r.y, x = k === 'Right' ? r.x + r.w : r.x; D.add(k === 'Top' || k === 'Bottom' ? { p: { x: r.x, y }, q: { x: r.x + r.w, y }, via: [], heads: { p: 0, q: 0 }, stroke: rgbHex(b.rule.c), sw: b.rule.w, dash: b.rule.dash } : { p: { x, y: r.y }, q: { x, y: r.y + r.h }, via: [], heads: { p: 0, q: 0 }, stroke: rgbHex(b.rule.c), sw: b.rule.w, dash: b.rule.dash }); continue; }
      if (e === root && !b.sides.length) continue;                              // the page tint behind the whole diagram
      const side = b.sides[0], rad = b.s.borderTopLeftRadius || '0', px = /%/.test(rad) ? parseFloat(rad) / 100 * Math.min(r.w, r.h) : parseFloat(rad) || 0, round = px >= Math.min(r.w, r.h) / 2 - 0.5;
      D.add({ kind: round && Math.abs(r.w - r.h) < Math.max(4, r.w * 0.2) ? 'ellipse' : 'rect', r, round: Math.min(px, Math.min(r.w, r.h) / 2), stroke: side ? rgbHex(side.c) : 'none', sw: side ? side.w : 0, dash: !!(side && side.dash), fill: b.bg ? rgbHex(b.s.backgroundColor) : 'none', fillStyle: '', fop: 100,
        pad: (parseFloat(b.s.paddingLeft) || 0) + (side ? side.w : 0) });
    }
    /* the words: each block of text, with where the browser put it and how it looks */
    const runs = new Map(), tw = d.createTreeWalker(root, 4);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.data.trim() || n.parentElement.closest('script, style, svg, noscript')) continue;
      let host = n.parentElement; while (host !== root && w.getComputedStyle(host).display === 'inline') host = host.parentElement;
      const cs = w.getComputedStyle(n.parentElement); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const rg = d.createRange(); rg.selectNodeContents(n); const rects = [...rg.getClientRects()].filter(q => q.width > 0 && q.height > 0); if (!rects.length) continue;
      const run = runs.get(host) || { t: '', x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, cs: w.getComputedStyle(host) }; runs.set(host, run);
      let t = n.data.replace(/\s+/g, ' '); const tt = cs.textTransform; if (tt === 'uppercase') t = t.toUpperCase(); else if (tt === 'lowercase') t = t.toLowerCase();
      run.t += t; for (const q of rects) { run.x0 = Math.min(run.x0, q.left); run.y0 = Math.min(run.y0, q.top); run.x1 = Math.max(run.x1, q.right); run.y1 = Math.max(run.y1, q.bottom); }
      if (n.parentElement !== host && !run.inner) run.inner = cs; else if (n.parentElement === host) run.direct = true;
    }
    /* only the words at the top of a box are its label: words that come after a box inside it (an arrow between two inner boxes, a caption under them) keep their own place */
    const boxes = [root, ...root.querySelectorAll('*')].filter(isBox);
    for (const [host, run] of runs) { let A = host; while (A !== root && !isBox(A)) A = A.parentElement; run.free = boxes.some(x => x !== A && A.contains(x) && !x.contains(host) && (x.compareDocumentPosition(host) & 4)); }
    for (const run of runs.values()) { const s = run.direct || !run.inner ? run.cs : run.inner, t = run.t.trim(); if (t) D.texts.push({ free: run.free, t, x: run.x0 - R0.left, y: run.y0 - R0.top, w: run.x1 - run.x0, h: run.y1 - run.y0, size: Math.round(parseFloat(s.fontSize)) || 13, color: rgbHex(s.color) === 'none' ? '#000000' : rgbHex(s.color), bold: (parseFloat(s.fontWeight) || 400) >= 600 }); }
    /* an arrow written as a character on its own, with a shape behind it and a shape ahead of it, becomes a connector between the two */
    const ARROW = { r: '→⟶⇒➔➜➝▶►▸', l: '←⟵⇐◀◄◂', u: '↑⇑▲▴', d: '↓⇓▼▾', h: '↔⟷⇔', v: '↕⇕' };
    D.texts = D.texts.filter(t => {
      const k = [...t.t].length === 1 ? Object.keys(ARROW).find(k => ARROW[k].includes(t.t)) : null; if (!k) return true;
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2, across = k === 'r' || k === 'l' || k === 'h', near = (sign) => {
        let best = null;
        for (const s of D.shapes) {
          const r = s.r; if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) continue;                              // a box the arrow sits in
          if (across ? !(cy >= r.y && cy <= r.y + r.h) : !(cx >= r.x && cx <= r.x + r.w)) continue;
          const gap = across ? (sign > 0 ? r.x - cx : cx - (r.x + r.w)) : (sign > 0 ? r.y - cy : cy - (r.y + r.h));
          if (gap >= 0 && gap <= 240 && (!best || gap < best.gap || (gap === best.gap && r.w * r.h < best.s.r.w * best.s.r.h))) best = { gap, s };
        }
        return best && best.s;
      };
      const ahead = near(k === 'l' || k === 'u' ? -1 : 1), behind = near(k === 'l' || k === 'u' ? 1 : -1); if (!ahead || !behind || ahead === behind) return true;
      const edge = (s, toward) => across ? { x: toward > 0 ? s.r.x + s.r.w : s.r.x, y: cy } : { x: cx, y: toward > 0 ? s.r.y + s.r.h : s.r.y }, fwd = k === 'l' || k === 'u' ? -1 : 1;
      D.add({ p: edge(behind, fwd), q: edge(ahead, -fwd), via: [], heads: { p: k === 'h' || k === 'v' ? 1 : 0, q: 1 }, stroke: t.color, sw: 1.5, block: true });
      return false;
    });
    let h = null; for (let p = root; p && !h; p = p.parentElement) for (let q = p.previousElementSibling; q && !h; q = q.previousElementSibling) if (/^h[1-6]$/i.test(q.tagName) && q.textContent.trim()) h = q.textContent.trim();
    const big = D.texts.slice().sort((a, b) => b.size - a.size)[0];
    out.push({ root, conv: writeDrawio(D, { wrap: true, name: (h || (big && big.size >= 20 ? big.t : '') || d.title || 'Diagram').slice(0, 80) }) });
  }
  return out;
}

/* A page saved as a bundle keeps its real content as text inside a script, to be unpacked by another script when the
   page is opened in a browser. Scripts never run in the editor, so the content is taken out here: the stored page,
   with its switches and placeholders set to the defaults the bundle carries. */
function unbundle(text) {
  if (!/<script type="__bundler\/template"/.test(text)) return text;
  try {
    const t = new DOMParser().parseFromString(text, 'text/html').querySelector('script[type="__bundler/template"]'), p = new DOMParser().parseFromString(JSON.parse(t.textContent), 'text/html'), props = {};
    const sc = p.querySelector('script[data-props]'); if (sc) { try { for (const [k, v] of Object.entries(JSON.parse(sc.getAttribute('data-props')))) props[k] = v && v.default; } catch (e) { } }
    const val = s => { const m = String(s || '').match(/^\s*\{\{\s*([\w.]+)\s*\}\}\s*$/); return !m ? s : m[1] === 'true' ? true : m[1] === 'false' ? false : props[m[1]]; };
    p.querySelectorAll('sc-if').forEach(e => { const v = val(e.getAttribute('value')); if (v === false || v === 'false' || v === 0 || v === '' || v === null) e.remove(); else e.replaceWith(...e.childNodes); });
    p.querySelectorAll('script, link').forEach(e => e.remove());
    const tw = p.createTreeWalker(p.body, 4); for (let n = tw.nextNode(); n; n = tw.nextNode()) n.data = n.data.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => props[k] !== undefined && props[k] !== null ? String(props[k]) : m);
    return '<!DOCTYPE html>\n' + p.documentElement.outerHTML;
  } catch (e) { return text; }
}

/* Before a page from elsewhere is opened it is drawn once, off screen and with its scripts switched off, because its
   style sheet is not carried into the editor:
   - each SVG element is given the look the page gave it as plain attributes (without this every shape would be black);
   - each diagram drawn with HTML boxes is made into a diagram for the diagram editor and put in its place.
   A bundled page is unpacked first. Pages made by the editor are left alone. prepNote says what was done. */
let prepNote = '';
function withPictures(text) {
  prepNote = '';
  if (/<meta name="generator" content="fine-line-editor( [^"]*)?">/.test(text.slice(0, 4000))) return Promise.resolve(text);
  text = unbundle(text);
  if (!/<svg[\s>]/i.test(text) && !/display\s*:\s*(inline-)?(grid|flex)/i.test(text)) return Promise.resolve(text);
  return new Promise(res => {
    const f = document.createElement('iframe'); let done = false;
    const finish = t => { if (done) return; done = true; f.remove(); res(t); };
    f.setAttribute('sandbox', 'allow-same-origin'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:800px;border:0;visibility:hidden';
    f.addEventListener('load', async () => {
      try {
        const d = f.contentDocument, w = f.contentWindow, PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'], TEXT = ['font-size', 'font-weight', 'font-style', 'font-family', 'text-anchor', 'dominant-baseline', 'letter-spacing'];
        for (const e of d.querySelectorAll('svg rect, svg circle, svg ellipse, svg polygon, svg polyline, svg line, svg path, svg text, svg tspan, svg use')) {
          const s = w.getComputedStyle(e), set = (k, v) => { if (v && v !== 'normal') e.setAttribute(k, v); };
          PAINT.forEach(k => set(k, s.getPropertyValue(k)));
          if (s.strokeDasharray && s.strokeDasharray !== 'none') set('stroke-dasharray', s.strokeDasharray);
          ['opacity', 'fill-opacity', 'stroke-opacity'].forEach(k => { const v = s.getPropertyValue(k); if (v && parseFloat(v) < 1) set(k, v); });
          if (s.display === 'none') set('display', 'none'); if (s.visibility === 'hidden') set('visibility', 'hidden');
          if (/^(text|tspan)$/i.test(e.tagName)) TEXT.forEach(k => set(k, s.getPropertyValue(k)));
        }
        let made = 0;
        if (/display\s*:\s*(inline-)?(grid|flex)/i.test(text)) for (const { root, conv } of boxDiagrams(d, w)) {
          const r = await deRender(conv.xml, conv.name); if (!r || !r.svg) continue;
          const g = d.createElement('div'); g.className = 'dg'; g.setAttribute('data-drawio', r.xml || conv.xml); g.innerHTML = r.svg;
          if (root === d.body) d.body.replaceChildren(g); else root.replaceWith(g); made++;
        }
        if (made) prepNote = (made === 1 ? 'A diagram drawn with HTML boxes was' : made + ' diagrams drawn with HTML boxes were') + ' made into ' + (made === 1 ? 'an editable diagram' : 'editable diagrams') + '. Double-click ' + (made === 1 ? 'it' : 'one') + ' to edit.';
        finish('<!DOCTYPE html>\n' + d.documentElement.outerHTML);
      } catch (e) { finish(text); }
    });
    setTimeout(() => finish(text), 60000);
    f.srcdoc = text; document.body.appendChild(f);
  });
}
