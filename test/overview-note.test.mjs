/* THE ASSEMBLE OVERVIEW'S SENTENCE (the UX plugins trial, 2026-11-17). generate.js glued the overview note from pieces:
   "43 prints · quantities on the right. and 6× 10×2 mm disc magnets …" - a fragment whenever a build had magnets and no handle
   screws (every official build), ".." with neither, "on the right" pointing at the old viewer's parts panel, which the planner
   hides, and "tap" said on a desktop too. Read across every official build's golden manifest: whole sentences, the magnets
   named as the Parts list names them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('./golden/', import.meta.url);

test('every official build’s Assemble overview reads as whole sentences, with no pointer to a hidden panel', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.manifest.json'));
  assert.ok(files.length >= 20, `the goldens are there (${files.length})`);
  let magnetsOnly = 0;
  for (const f of files) {
    const note = JSON.parse(readFileSync(new URL(f, dir), 'utf8')).steps?.[0]?.note || '';
    assert.ok(note.startsWith('Your custom build'), `${f}: the overview step (${note.slice(0, 60)})`);
    assert.doesNotMatch(note, /\. and |\.\.|on the right/, `${f}: ${note}`);
    assert.match(note, /click or tap any part/, `${f}: words for a mouse and a finger alike (${note})`);
    assert.match(note, /the Parts list has the quantities\./, `${f}: says where the quantities are (${note})`);
    if (/disc magnets/.test(note)) {
      assert.match(note, /You'll also need .*\d+ disc magnets \(10×2 mm or 6×2 mm\) for the optional magnet closures/, `${f}: the magnets as the Parts list names them (${note})`);
      if (!/M3 screws/.test(note)) magnetsOnly++;
    }
  }
  assert.ok(magnetsOnly > 0, 'the control: a build with magnets and no handle screws, the case that read ". and"');
});
