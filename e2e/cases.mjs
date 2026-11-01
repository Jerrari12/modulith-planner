/* The cases of the e2e file as text, for tools/e2e-changed.mjs: which ones a change added or edited, and a name pattern that runs
   exactly those. A case starts at a line that begins with test( and runs to the next. Pure functions only. */
const START = /^[ \t]*test\((['"`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/gm;

const unescapeName = (s) => s.replace(/\\(['"`\\])/g, '$1');

/* [{ name, body }], in file order */
export function casesOf(src) {
  const found = [...src.matchAll(START)];
  return found.map((m, i) => ({ name: unescapeName(m[2]), body: src.slice(m.index, i + 1 < found.length ? found[i + 1].index : src.length) }));
}

/* the names of the cases `after` adds or edits against `before`. A name may repeat, so bodies are compared as a multiset */
export function changedCases(before, after) {
  const had = new Map();
  for (const c of casesOf(before)) had.set(c.body, (had.get(c.body) || 0) + 1);
  const out = [];
  for (const c of casesOf(after)) {
    const n = had.get(c.body) || 0;
    if (n) had.set(c.body, n - 1); else if (!out.includes(c.name)) out.push(c.name);
  }
  return out;
}

/* a regular expression for --test-name-pattern matching this name exactly; an interpolated ${...} matches anything */
export function namePattern(name) {
  const parts = name.split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  return `^${parts.join('.*')}$`;
}
