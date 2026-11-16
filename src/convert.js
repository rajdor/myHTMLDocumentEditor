/* ---------- page diagrams to draw.io ----------
   Diagrams drawn directly on the page (div.fig > div.wb-board, made before the built-in diagram editor) are converted
   to draw.io XML in the Blueprint vocabulary of the diagram editor, so they open there. Positions and sizes are kept;
   arrows whose ends touch a box are attached to it, so they follow the box when it moves. */
const BPX = {
  ink: '#12355B', inkSoft: '#3D5A7A', redline: '#B23C0B', fill: '#EAF1F8', fillRed: '#FDF1EA', paper: '#FFFFFF',
  font: 'fontFamily=Architects Daughter;fontSource=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DArchitects%2BDaughter;',
  shadow: 'deShadow=1;deShadowColor=#12355B;deShadowOpacity=20;deShadowDx=2;deShadowDy=3;',
  states: {
    note: ['#1F5FA8', '#E6F0FB', 'info'], good: ['#1E6B45', '#E3F4EA', 'check-circle'], bad: ['#A1162B', '#FBE4E7', 'x-circle'],
    warning: ['#8A5300', '#FFF1D1', 'warning'], alert: ['#B54708', '#FEEBDD', 'bell-ringing'], critical: ['#8E1027', '#FBE4E7', 'warning-octagon'],
    new: ['#1E6B45', '#E3F4EA', 'plus-circle'], changed: ['#8A5300', '#FFF1D1', 'pencil-simple'], retire: ['#5F6B7A', '#F1F3F5', 'archive'],
    comment: ['#3A3A3A', '#FFFDF0', 'chat-circle-text'], neutral: ['#5F6B7A', '#F1F3F5', 'minus-circle']
  },
  text: { 'wb-title': [38, '#12355B'], 'wb-subtitle': [18, '#3D5A7A'], 'wb-arrow-label': [17, '#3D5A7A'], 'wb-note': [21, '#B23C0B', 'annotation'], 'wb-question': [21, '#B23C0B', 'question'], 'wb-legend': [17, '#12355B'] },
  lines: { 'is-planned': ['planned', '#12355B', '3.2 2.4'], 'is-async': ['async', '#12355B', '0.4 2.4'], 'is-retire': ['retire', '#5F6B7A', '3.2 2.4'], 'is-note': ['annotation', '#B23C0B', '2.4 2.4'] }
};
const xa = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
function labelOf(e) { const c = e.cloneNode(true); $$('svg,.wb-comment-pin', c).forEach(n => n.remove()); return c.innerHTML.replace(/\s+/g, ' ').trim(); }
function stateOfEl(e) { const m = [...e.classList].find(c => c.startsWith('is-')); return m ? m.slice(3) : ''; }
function boardToDrawio(board) {
  const W = Math.round(parseFloat(board.style.width) || 960), H = Math.round(parseFloat(board.style.height) || 600);
  const out = [], lines = [], texts = [], ids = new Map(), boxes = []; // painted in this order: shapes, lines, text
  let n = 0; const nid = () => 'c' + (++n);
  const geo = (x, y, w, h) => '<mxGeometry x="' + Math.round(x) + '" y="' + Math.round(y) + '" width="' + Math.round(w) + '" height="' + Math.round(h) + '" as="geometry"/>';
  const vertex = (el, style, value, r, into) => { const id = nid(); if (el) ids.set(el, id); (into || out).push('<mxCell id="' + id + '" value="' + xa(value || '') + '" style="' + xa(style) + '" vertex="1" parent="1">' + geo(r.x, r.y, r.w, r.h) + '</mxCell>'); return id; };
  const edge = (style, value, p, q, src, tgt) => { lines.push({ id: nid(), style, value, p, q, src, tgt }); };
  const edgeXml = (l) => '<mxCell id="' + l.id + '" value="' + xa(l.value || '') + '" style="' + xa(l.style) + '" edge="1" parent="1"' + (l.src ? ' source="' + l.src + '"' : '') + (l.tgt ? ' target="' + l.tgt + '"' : '') + '><mxGeometry relative="1" as="geometry">' +
    '<mxPoint x="' + Math.round(l.p.x) + '" y="' + Math.round(l.p.y) + '" as="sourcePoint"/><mxPoint x="' + Math.round(l.q.x) + '" y="' + Math.round(l.q.y) + '" as="targetPoint"/></mxGeometry></mxCell>';
  const verbs = []; // words centred on a line (entity-relationship verbs) become that line's label
  // the dot matrix, behind everything
  vertex(null, 'rounded=0;html=1;fillColor=#ffffff;strokeColor=none;deDots=1;', '', { x: 0, y: 0, w: W, h: H });
  const kids = [...board.children].filter(e => !e.classList.contains('ed-handle') && !(e.dataset && e.dataset.conn));
  const shapeStyle = (st, extra) => {
    const s = BPX.states[st];
    if (st === 'focus') return 'rounded=1;absoluteArcSize=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=' + BPX.fillRed + ';strokeColor=' + BPX.ink + ';fontColor=' + BPX.redline + ';strokeWidth=1.5;deState=focus;' + BPX.shadow + extra;
    if (st === 'external') return 'rounded=1;absoluteArcSize=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=' + BPX.paper + ';strokeColor=' + BPX.ink + ';fontColor=' + BPX.ink + ';strokeWidth=1.5;dashed=1;deState=external;' + BPX.shadow + extra;
    if (s) return 'rounded=1;absoluteArcSize=1;arcSize=' + (st === 'comment' ? 24 : 6) + ';whiteSpace=wrap;html=1;fillColor=' + s[1] + ';strokeColor=' + (st === 'comment' ? '#D9C66A' : s[0]) + ';fontColor=' + s[0] +
      ';strokeWidth=' + (st === 'alert' ? 2.5 : st === 'critical' ? 4 : 1.5) + ';' + (st === 'critical' ? 'deDouble=1;' : '') + (st === 'retire' ? 'dashed=1;' : BPX.shadow) + 'deState=' + st + ';deIcon=' + s[2] + ';' + extra;
    return 'rounded=1;absoluteArcSize=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=' + BPX.fill + ';strokeColor=' + BPX.ink + ';fontColor=' + BPX.ink + ';strokeWidth=1.5;' + BPX.shadow + extra;
  };
  for (const e of kids) {
    const r = R(e), cl = e.classList, B = BPX.font + 'deMode=blueprint;';
    if (cl.contains('wb-conn') || isSvg(e)) continue;
    if (cl.contains('wb-box') || cl.contains('wb-layer')) { const id = vertex(e, shapeStyle(stateOfEl(e), 'fontSize=22;fontStyle=1;' + B), labelOf(e), r); boxes.push({ id, r }); }
    else if (cl.contains('wb-group')) vertex(e, 'rounded=1;absoluteArcSize=1;arcSize=6;html=1;fillColor=none;strokeColor=' + BPX.inkSoft + ';strokeWidth=1.5;dashed=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontSize=17;fontColor=' + BPX.inkSoft + ';' + B, '', r);
    else if (cl.contains('wb-callout')) { const st = stateOfEl(e) || 'note', b = e.querySelector('b'), t = e.querySelector('span'); const body = t ? t.cloneNode(true) : null; if (body && body.querySelector('b')) body.querySelector('b').remove(); vertex(e, shapeStyle(st, 'align=left;verticalAlign=top;spacing=12;fontSize=17;' + B), (b ? '<b>' + b.innerHTML + '</b><br>' : '') + (body ? body.innerHTML.trim() : ''), r); }
    else if (cl.contains('wb-comment')) vertex(e, shapeStyle('comment', 'align=left;verticalAlign=top;spacing=12;spacingLeft=26;fontSize=17;' + B), labelOf(e), r);
    else if (cl.contains('wb-badge')) { const st = stateOfEl(e), s = BPX.states[st] || [BPX.ink, BPX.fill], solid = st === 'alert' || st === 'critical'; vertex(e, 'rounded=1;arcSize=50;html=1;whiteSpace=nowrap;fontSize=14;fontStyle=1;strokeWidth=1.5;fillColor=' + (solid ? s[0] : s[1]) + ';strokeColor=' + s[0] + ';fontColor=' + (solid ? '#FFFFFF' : s[0]) + ';' + (st === 'retire' ? 'dashed=1;' : '') + B, labelOf(e), r); }
    else if (cl.contains('wb-marker')) { const st = stateOfEl(e), s = BPX.states[st] || [BPX.ink, BPX.fill, 'info'], solid = st === 'alert' || st === 'critical'; vertex(e, 'ellipse;aspect=fixed;html=1;strokeWidth=1.5;fillColor=' + (solid ? s[0] : s[1]) + ';strokeColor=' + s[0] + ';fontColor=' + (solid ? '#FFFFFF' : s[0]) + ';deIcon=' + s[2] + ';' + B, '', r); }
    else if (cl.contains('wb-divider')) edge('endArrow=none;startArrow=none;html=1;strokeColor=#BBC5D0;strokeWidth=1.5;dashed=1;' + B, '', { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y });
    else if (cl.contains('wb-ball')) vertex(e, 'ellipse;aspect=fixed;html=1;fillColor=#ffffff;strokeColor=' + BPX.ink + ';strokeWidth=1.5;deHarvey=' + (parseFloat(e.style.getPropertyValue('--p')) || 0) + ';' + B, '', r);
    else if (cl.contains('wb-tile') || cl.contains('wb-swatch') || cl.contains('wb-meter')) { const bg = getComputedStyle(e).backgroundColor; vertex(e, (cl.contains('wb-swatch') ? 'ellipse;' : 'rounded=1;absoluteArcSize=1;arcSize=6;') + 'html=1;fillColor=' + rgbHex(bg) + ';strokeColor=' + BPX.ink + ';strokeWidth=1.5;fontSize=20;fontStyle=1;fontColor=' + rgbHex(getComputedStyle(e).color) + ';' + B, labelOf(e), r); }
    else if (cl.contains('er-verb')) verbs.push({ e, r });
    else {
      const k = Object.keys(BPX.text).find(c => cl.contains(c)), t = BPX.text[k] || [17, BPX.ink];
      const align = (e.style.textAlign || getComputedStyle(e).textAlign) === 'center' ? 'center' : 'left';
      const bg = rgbHex(getComputedStyle(e).backgroundColor); // verbs on lines sit on a paper-coloured patch
      const lh = parseFloat(getComputedStyle(e).lineHeight) || t[0] * 1.3, one = !/<br/i.test(e.innerHTML) && r.h <= lh * 1.5; // one line on the page stays one line
      vertex(e, 'text;html=1;whiteSpace=' + (one ? 'nowrap' : 'wrap') + ';align=' + align + ';verticalAlign=top;strokeColor=none;fillColor=none;' + (bg !== 'none' ? 'labelBackgroundColor=' + bg + ';' : '') + 'fontSize=' + (Math.round(parseFloat(getComputedStyle(e).fontSize)) || t[0]) + ';fontColor=' + (cl.contains('lg') ? BPX.inkSoft : t[1]) + ';' + (t[2] ? 'deNote=' + t[2] + ';' : '') + B, labelOf(e), { x: r.x - (align === 'center' ? (one ? 8 : 2) : 0), y: r.y, w: r.w + (one ? 16 : 4), h: r.h }, texts);
    }
  }
  // which box edge, if any, an arrow end touches: gives the attachment and its exact point on the box
  const touch = (p) => { for (const b of boxes) { const { x, y, w, h } = b.r, tol = 3; const inX = p.x >= x - tol && p.x <= x + w + tol, inY = p.y >= y - tol && p.y <= y + h + tol;
    if (inX && inY && (Math.abs(p.x - x) <= tol || Math.abs(p.x - x - w) <= tol || Math.abs(p.y - y) <= tol || Math.abs(p.y - y - h) <= tol))
      return { id: b.id, fx: Math.min(1, Math.max(0, (p.x - x) / w)), fy: Math.min(1, Math.max(0, (p.y - y) / h)) }; } return null; };
  for (const e of kids) {
    if (!isSvg(e) || !e.classList.contains('wb-arrow')) continue;
    const r = R(e), path = e.querySelector('path:not(marker path)'), d = path ? path.getAttribute('d') : '', m = d.match(/M\s*([\d.]+)\s+([\d.]+)\s*L\s*([\d.]+)\s+([\d.]+)/); if (!m) continue;
    const head = !!(path && path.getAttribute('marker-end')), horiz = r.h <= 8.5;
    let a, z; // a = tail, z = head end, in board coordinates
    if (horiz) { const right = +m[1] < +m[3]; a = { x: r.x + (right ? 0 : r.w), y: r.y + 4 }; z = { x: r.x + (right ? r.w : 0), y: r.y + 4 }; }
    else { const down = +m[2] < +m[4]; a = { x: r.x + 4, y: r.y + (down ? 0 : r.h) }; z = { x: r.x + 4, y: r.y + (down ? r.h : 0) }; }
    if (head) { if (horiz) z.x += z.x > a.x ? 1 : -1; else z.y += z.y > a.y ? 1 : -1; } // tips stop 1px short of the box
    const lt = Object.keys(BPX.lines).find(c => e.classList.contains(c)), L = BPX.lines[lt];
    const s = touch(a), t = touch(z);
    edge('edgeStyle=none;html=1;rounded=0;startArrow=none;' + (head ? 'endArrow=block;endFill=1;endSize=8;' : 'endArrow=none;') + 'strokeWidth=2.5;strokeColor=' + (L ? L[1] : BPX.ink) + ';' +
      (L ? 'dashed=1;dashPattern=' + L[2] + ';deLine=' + L[0] + ';' + (L[0] === 'annotation' ? 'deNote=annotation;' : '') : (head ? '' : 'deLine=association;')) +
      (s ? 'exitX=' + s.fx.toFixed(3) + ';exitY=' + s.fy.toFixed(3) + ';exitDx=0;exitDy=0;' : '') + (t ? 'entryX=' + t.fx.toFixed(3) + ';entryY=' + t.fy.toFixed(3) + ';entryDx=0;entryDy=0;' : '') +
      'fontSize=17;fontColor=' + BPX.inkSoft + ';labelBackgroundColor=none;' + BPX.font + 'deMode=blueprint;', '', a, z, s && s.id, t && t.id);
  }
  // connectors drawn with the page editor's Connect tool
  const side = { r: [1, 0.5], l: [0, 0.5], t: [0.5, 0], b: [0.5, 1] };
  for (const c of kids.filter(k => k.classList && k.classList.contains('wb-conn'))) {
    const A = board.querySelector('#' + c.dataset.from), Z = board.querySelector('#' + c.dataset.to); if (!A || !Z || !ids.has(A) || !ids.has(Z)) continue;
    const fs = side[c.dataset.fs] || side.r, ts = side[c.dataset.ts] || side.l, L = BPX.lines['is-' + (c.dataset.type === 'note' ? 'note' : c.dataset.type)];
    const ra = R(A), rz = R(Z);
    edge('edgeStyle=orthogonalEdgeStyle;html=1;rounded=0;startArrow=none;' + (c.dataset.head !== '0' ? 'endArrow=block;endFill=1;endSize=8;' : 'endArrow=none;') + 'strokeWidth=2.5;strokeColor=' + (L ? L[1] : BPX.ink) + ';' +
      (L ? 'dashed=1;dashPattern=' + L[2] + ';deLine=' + L[0] + ';' : '') + 'exitX=' + fs[0] + ';exitY=' + fs[1] + ';exitDx=0;exitDy=0;entryX=' + ts[0] + ';entryY=' + ts[1] + ';entryDx=0;entryDy=0;' +
      'fontSize=17;fontColor=' + BPX.inkSoft + ';' + BPX.font + 'deMode=blueprint;', c.dataset.label || '',
      { x: ra.x + ra.w * fs[0], y: ra.y + ra.h * fs[1] }, { x: rz.x + rz.w * ts[0], y: rz.y + rz.h * ts[1] }, ids.get(A), ids.get(Z));
  }
  for (const v of verbs) {
    const cx = v.r.x + v.r.w / 2, cy = v.r.y + v.r.h / 2;
    const on = lines.find(l => l.p.y === l.q.y ? Math.abs(cy - l.p.y) <= 8 && cx >= Math.min(l.p.x, l.q.x) && cx <= Math.max(l.p.x, l.q.x)
      : l.p.x === l.q.x && Math.abs(cx - l.p.x) <= 8 && cy >= Math.min(l.p.y, l.q.y) && cy <= Math.max(l.p.y, l.q.y));
    if (on && !on.label) {
      const len = Math.abs(on.q.x - on.p.x) + Math.abs(on.q.y - on.p.y) || 1, at = (Math.abs(cx - on.p.x) + Math.abs(cy - on.p.y)) / len;
      on.label = '<mxCell id="' + nid() + '" value="' + xa(labelOf(v.e)) + '" style="' + xa('edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];labelBackgroundColor=#FFFFFF;fontSize=17;fontColor=' + BPX.inkSoft + ';' + BPX.font + 'deMode=blueprint;') +
        '" vertex="1" connectable="0" parent="' + on.id + '"><mxGeometry x="' + (at * 2 - 1).toFixed(3) + '" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>';
    }
    else vertex(v.e, 'text;html=1;whiteSpace=nowrap;align=center;verticalAlign=top;strokeColor=none;fillColor=none;labelBackgroundColor=#FFFFFF;fontSize=17;fontColor=' + BPX.inkSoft + ';' + BPX.font + 'deMode=blueprint;', labelOf(v.e), { x: v.r.x - 8, y: v.r.y, w: v.r.w + 16, h: v.r.h }, texts);
  }
  const name = (board.getAttribute('aria-label') || 'Diagram').split(':')[0].slice(0, 80);
  return '<mxfile><diagram name="' + xa(name) + '" id="d1"><mxGraphModel dx="0" dy="0" grid="1" gridSize="8" page="0" pageWidth="' + W + '" pageHeight="' + H + '"><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
    out.join('') + lines.map(l => edgeXml(l) + (l.label || '')).join('') + texts.join('') + '</root></mxGraphModel></diagram></mxfile>';
}
function rgbHex(c) { const m = String(c).match(/\d+(\.\d+)?/g); if (!m || m.length < 3 || (m[3] !== undefined && +m[3] === 0)) return 'none'; return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('').toUpperCase(); }
