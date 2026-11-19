// An in-memory stand-in for the browser's folder handles, for the notebook tests: the real folder picker cannot be
// driven from a test. installMockFs runs in the page and defines window.MFS.
//   MFS.make({ 'a.html': 'text', Folder: { ... } }, 'Name', { noMove })  -> a root folder handle
//   MFS.age(root, 'a/b.html', ms) sets a file's date;  MFS.paths(root) -> every path, sorted;  MFS.text(root, 'a/b.html');  MFS.put(root, 'a/b.html', text);  MFS.drop(root, 'a/b.html')
export function installMockFs() {
  let last = 0; const tick = () => (last = Math.max(Date.now(), last + 1));   // file dates are real times, and never repeat
  const err = (m, n) => new DOMException(m, n);
  class F {
    constructor(name, text, parent, noMove) { this.kind = 'file'; this.name = name; this.text = text; this.parent = parent; this.mtime = tick(); if (!noMove) this.move = this._move; }
    async getFile() { return new File([this.text], this.name, { lastModified: this.mtime }); }
    async createWritable() { const f = this; let buf = ''; return { async write(d) { buf = typeof d === 'string' ? d : await d.text(); }, async close() { f.text = buf; f.mtime = tick(); } }; }
    async _move(a, b) { const dest = b === undefined ? this.parent : a, name = b === undefined ? a : b; this.parent.kids.delete(this.name); this.name = name; this.parent = dest; dest.kids.set(name, this); }
  }
  class D {
    constructor(name, parent, noMove) { this.kind = 'directory'; this.name = name; this.parent = parent; this.kids = new Map(); this.noMove = noMove; }
    async *values() { yield* [...this.kids.values()]; }
    async getFileHandle(n, o) { let k = this.kids.get(n); if (!k) { if (!(o && o.create)) throw err('not found', 'NotFoundError'); k = new F(n, '', this, this.noMove); this.kids.set(n, k); } if (k.kind !== 'file') throw err('not a file', 'TypeMismatchError'); return k; }
    async getDirectoryHandle(n, o) { let k = this.kids.get(n); if (!k) { if (!(o && o.create)) throw err('not found', 'NotFoundError'); k = new D(n, this, this.noMove); this.kids.set(n, k); } if (k.kind !== 'directory') throw err('not a folder', 'TypeMismatchError'); return k; }
    async removeEntry(n, o) { const k = this.kids.get(n); if (!k) throw err('not found', 'NotFoundError'); if (k.kind === 'directory' && k.kids.size && !(o && o.recursive)) throw err('not empty', 'InvalidModificationError'); this.kids.delete(n); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }
  const fill = (d, spec) => { for (const [n, v] of Object.entries(spec)) { if (typeof v === 'string') d.kids.set(n, new F(n, v, d, d.noMove)); else { const k = new D(n, d, d.noMove); d.kids.set(n, k); fill(k, v); } } return d; };
  const at = (root, path) => path.split('/').filter(Boolean).reduce((d, s) => d && d.kids && d.kids.get(s), root);
  const walk = (d, pre, out) => { for (const k of d.kids.values()) { out.push(pre + k.name + (k.kind === 'directory' ? '/' : '')); if (k.kind === 'directory') walk(k, pre + k.name + '/', out); } return out; };
  window.MFS = {
    make: (spec, name, o) => fill(new D(name || 'Notebook', null, !!(o && o.noMove)), spec),
    paths: root => walk(root, '', []).sort(),
    text: (root, path) => { const f = at(root, path); return f ? f.text : null; },
    age: (root, path, ms) => { at(root, path).mtime = ms; },
    put: (root, path, text) => { const p = path.split('/'), n = p.pop(); let d = root; for (const s of p) { if (!d.kids.get(s)) d.kids.set(s, new D(s, d, d.noMove)); d = d.kids.get(s); } const f = d.kids.get(n) || new F(n, '', d, d.noMove); f.text = text; f.mtime = tick(); d.kids.set(n, f); },
    drop: (root, path) => { const p = path.split('/'), n = p.pop(); at(root, p.join('/')).kids.delete(n); },
  };
}
