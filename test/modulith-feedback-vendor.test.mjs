// Feedback & support: js/vendor/modulith-feedback.js is the planner's js/modulith-feedback.js byte for byte (the
// planner owns it), so every MODULITH tool shows the same three kinds and the same email wording (Astra 2026-10-10).
// Re-vendor: copy the planner's file, update PIN. The deploy stamps its script tag (pages.yml); a missing sed line fails the
// module-graph guard there and this test here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PIN = 'c90fd913acbcb688f230addc8c61ff3a7142f34abcac2a69b80029ac0e4b2539';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('the vendored feedback dialog is the pinned copy', () => {
  assert.equal(sha(read('js/vendor/modulith-feedback.js')), PIN);
});

test("it is the planner checkout's file byte for byte (GEN2_PLANNER_ROOT)", { skip: !process.env.GEN2_PLANNER_ROOT && 'set GEN2_PLANNER_ROOT to compare' }, () => {
  const p = process.env.GEN2_PLANNER_ROOT + '/js/modulith-feedback.js';
  assert.ok(existsSync(p), p);
  assert.equal(sha(readFileSync(p)), sha(read('js/vendor/modulith-feedback.js')));
});

test('the standalone viewer offers it (topbar + the outro) and the deploy stamps its script tag', () => {
  const html = read('index.html').toString('utf8');
  assert.match(html, /<script src="js\/vendor\/modulith-feedback\.js"><\/script>/);
  assert.match(html, /<header id="topbar">[\s\S]*?<button id="btn-feedback"[^>]*>Feedback<\/button>[\s\S]*?<\/header>/);
  assert.match(html, /<a id="outro-feedback"[^>]*>Feedback &amp; support<\/a>/);
  const yml = read('.github/workflows/pages.yml').toString('utf8');
  assert.match(yml, /sed -i "s\|js\/vendor\/modulith-feedback\.js\|js\/vendor\/modulith-feedback\.js\?v=\\|" index\.html/);
  const main = read('js/main.js').toString('utf8');
  assert.match(main, /F\.open\(\{ tool: '3D Build Studio'/);
});

// the workspace shell (2026-10-22, the cutover parity check's I1): the top bar's button and the build menu's entry; the e2e
// case "Feedback & support: ..." drives both on a desktop and a phone
test('the workspace shell offers it (the top bar and the build menu, js/ui/topbar.js)', () => {
  const top = read('js/ui/topbar.js').toString('utf8');
  assert.match(top, /F\.open\(\{ tool: 'Planner'/);
  assert.match(top, /el\('button\.chip\.icon-btn\.feedback'/);
  assert.match(top, /role: 'menuitem', 'aria-haspopup': 'dialog', onclick: \(\) => \{ set\(false\); feedback\(btn\); \}/);
});
