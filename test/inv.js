// Structural checks run inside the page on #doc (or any root). Returns a list of problems: [rule, outerHTML snippet].
window.INV = function (root) {
  const out = [], snip = e => (e.outerHTML || e.textContent).slice(0, 160), add = (r, e) => { if (out.length < 60) out.push([r, snip(e)]); };
  const INL = 'b,strong,i,em,a,code,sup,sub,s,del,strike,u,span,mark,kbd';
  const BLK = 'p,div,ul,ol,dl,table,h1,h2,h3,h4,h5,h6,pre,blockquote,hr,li,dt,dd';
  for (const e of root.querySelectorAll('*')) {
    if (e.closest('.dg,.fig,svg,.note-log')) continue;
    const t = e.tagName.toLowerCase();
    if ((t === 'ul' || t === 'ol') && [...e.children].some(c => c.tagName !== 'LI')) add('list holds a non-item', e);
    if (t === 'li' && !e.parentElement.matches('ul,ol')) add('item outside a list', e);
    if ((t === 'dt' || t === 'dd') && !e.parentElement.matches('dl')) add('Q&A item outside its list', e);
    if (t === 'dl' && [...e.children].some(c => !c.matches('dt,dd'))) add('Q&A list holds something else', e);
    if (/^(p|h[1-6])$/.test(t) && e.querySelector(BLK)) add(t + ' holds a block', e);
    if (t === 'li' && e.querySelector(':scope > :is(table,div.tw,pre,dl,div.box,hr,h1,h2,h3,h4)')) add('list item holds a table, code block, box or heading', e);
    if (e.matches(INL) && !e.matches('span.id, a.link-card') && e.querySelector(BLK)) add('inline ' + t + ' holds a block', e);
    if (t === 'a' && e.parentElement.closest('a')) add('link inside a link', e);
    if (t === 'code' && e.parentElement.closest('code')) add('code inside code', e);
    if (t === 'pre' && e.querySelector('*:not(br)')) add('code block holds markup', e);
    if (e.matches('b,strong') && e.parentElement.closest('b,strong')) add('bold inside bold', e);   // bold in headings, Q&A questions and header cells is allowed: 700 shows against 400 and 600
    if (e.matches('i,em') && e.parentElement.closest('i,em')) add('italic inside italic', e);
    if (e.matches('sup') && e.parentElement.closest('sup,sub')) add('sup/sub nested', e);
    if (e.matches('sub') && e.parentElement.closest('sup,sub')) add('sup/sub nested', e);
    if (e.matches('span') && !e.matches('span.id') && !e.closest('.box-h,.note,.wb-board,.link-card')) add('stray span', e);
    if (e.hasAttribute('style') && !e.closest('.tw,table,.dg,.fig,.wb-board') && !e.matches('col,table,th,td')) add('inline style', e);
    if (e.matches(INL) && !e.matches('a.link-card') && !e.textContent && !e.querySelector('img,br,svg')) add('empty ' + t, e);
    if (t === 'font') add('font tag', e);
    if (e.matches('span.id') && e.querySelector('span.id,a')) add('ID tag holds a tag or link', e);
  }
  for (const c of root.childNodes) if (c.nodeType === 3 && c.data.trim()) add('loose text at the top level', { outerHTML: c.data });
  return out;
};
