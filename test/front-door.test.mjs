/* THE MERGED PLANNER'S FRONT DOOR (cutover, 2026-10-17). planner.modulith.systems/ opens the workspace shell; every address
   that names something without ?ws= keeps the old viewer, which the site's part preview, the old planner's dock, the
   benchmarks, the smoke test and the golden screenshots open. And nothing in this app sends a visitor to the old planner
   any more: "Customize this build" and the kit gallery open this app's own workspaces. The browser half (the bare address
   boots Build, ?part= boots the viewer, Customize lands in Build) is the e2e case "the front door". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { shellWorkspace } from '../js/entry.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const H = '#build=eyJ4IjoxfQ==';   // any build hash

test('the bare address opens Build, and so do the riders that are not routes', () => {
  for (const [q, h] of [['', ''], ['?from=makerworld', ''], ['?ref=modulith-site', ''], ['?debug=1', ''], ['?theme=dark&tt=1', ''],
    ['', '#labels-add=eyJ4IjoxfQ=='], ['', '#labels-open'], ['', '#scheme=eyJ4IjoxfQ=='], ['?embed=1', ''], ['?ws=', ''],
    ['?part=185-case-2w-1h', ''], ['?bench=gpu', '']]) {
    assert.equal(shellWorkspace(q, h), 'build', `${q}${h}`);
  }
});

test('?ws= names the workspace, whatever else the address carries', () => {
  assert.equal(shellWorkspace('?ws=assemble&build=185-tabletop-2w2h', ''), 'assemble');
  assert.equal(shellWorkspace('?ws=labels', H + '&labels-add=eyJ4IjoxfQ=='), 'labels');
  assert.equal(shellWorkspace('?ws=parts&new=1', ''), 'parts');
  assert.equal(shellWorkspace('?ws=build&part=185-case-2w-1h&mode=preview', ''), 'build');
  assert.equal(shellWorkspace('?ws=nonsense', ''), 'nonsense', 'app.js opens Build for a name it does not know');
});

test('an address that names something without ?ws= keeps the old viewer', () => {
  for (const [q, h, why] of [
    ['?part=185-case-2w-1h&mode=preview', '', 'the site\'s part preview'],
    ['?part=185-case-2w-1h&mode=preview&plate=256x256&rid=r1', '', 'the part preview on a build plate'],
    ['?embed=1', H, 'the old planner\'s dock'],
    ['?bench=orbit', '', 'the orbit benchmark'],
    ['?bench=settle&tier=high', '', 'the settle benchmark'],
    ['?build=185-tabletop-2w2h', '', 'a kit by name: the smoke test and the golden screenshots'],
    ['?debug=1&build=185-tabletop-2w2h', '', 'the relief and profile checks'],
    ['?build=', '', 'an empty kit name, which must still fail visibly'],
    ['?kit=edgelabel-test', '', 'a static kit'],
    ['', H, 'a build by hash'],
  ]) assert.equal(shellWorkspace(q, h), null, why);
});

test('search sees one address: the page names the bare address as canonical, once, in its head', () => {
  // only a real tag counts, not one in a comment or a script's text, and a second one would make Google ignore both
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const end = html.indexOf('</head>');
  const tags = (s) => s.match(/<link\b[^>]*\brel=["']?canonical\b[^>]*>/gi) || [];
  assert.deepEqual(tags(html.slice(0, end)), ['<link rel="canonical" href="https://planner.modulith.systems/">']);
  assert.deepEqual(tags(html.slice(end)), [], 'none outside <head>, where a search engine would not read it');
});

test('the counter keeps every address: count.js would report the canonical\'s "/", so the page pins the arrival URL first', () => {
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const pin = html.indexOf('<script>window.goatcounter = { path: location.pathname + location.search };</script>');
  assert.ok(pin > -1, 'the path is pinned, as a string');
  assert.ok(pin < html.indexOf('<script data-goatcounter='), 'before count.js loads');
});

test('?ref= leaves the address once the visit has counted, and not before: a background tab counts when it is shown', () => {
  const src = /<script>\s*(addEventListener\('load'[\s\S]*?)<\/script>/.exec(read('index.html').replace(/<!--[\s\S]*?-->/g, ''));
  assert.ok(src, 'the script is on the page');
  const boot = (href, visibility) => {
    const loc = new URL(href), calls = [], on = { load: [], visibilitychange: [] };
    const doc = { visibilityState: visibility, addEventListener: (k, f) => on[k].push(f), removeEventListener: (k, f) => { on[k] = on[k].filter((x) => x !== f); } };
    const hist = { state: { keep: 1 }, replaceState: (s, _, u) => { calls.push([s, u]); loc.href = u; } };
    new Function('addEventListener', 'document', 'location', 'history', src[1])((k, f) => on[k].push(f), doc, loc, hist);
    return { doc, calls, fire: (k) => [...on[k]].forEach((f) => f()) };
  };
  const A = 'https://planner.modulith.systems/?ws=build&ref=Google&from=printables#build=AAA';
  const clean = 'https://planner.modulith.systems/?ws=build&from=printables#build=AAA';
  // nothing moves while the page parses: count.js reads location.search when it counts
  const seen = boot(A, 'visible');
  assert.deepEqual(seen.calls, [], 'before load');
  seen.fire('load');
  assert.deepEqual(seen.calls, [[{ keep: 1 }, clean]], 'at load, in a visible tab, keeping every other parameter, the hash and the history state');
  // a background tab: count.js waits for it to be shown, and its listener was added first, so this one runs after it
  const back = boot(A, 'hidden');
  back.fire('load');
  back.fire('visibilitychange');
  assert.deepEqual(back.calls, [], 'still hidden: not counted yet');
  back.doc.visibilityState = 'visible';
  back.fire('visibilitychange');
  assert.deepEqual(back.calls.map((c) => c[1]), [clean], 'when it is shown');
  back.fire('visibilitychange');
  assert.equal(back.calls.length, 1, 'once');
  // an address with no ref is left exactly alone
  const none = boot('https://planner.modulith.systems/?ws=build&from=printables', 'visible');
  none.fire('load');
  assert.deepEqual(none.calls, []);
});

test('app.js opens the shell by shellWorkspace, and the deploy stamps that import', () => {
  const app = read('js', 'app.js');
  assert.ok(/import \{ shellWorkspace \} from '\.\/entry\.js';/.test(app), 'app.js imports it');
  assert.ok(/const WS = shellWorkspace\(location\.search, location\.hash\);/.test(app), 'and decides by it');
  assert.ok(!/QS\.get\('ws'\)/.test(app), 'with no second reading of ?ws= that could disagree');
  const yml = read('.github', 'workflows', 'pages.yml');
  assert.ok(yml.includes(`sed -i "s|'./entry.js'|'./entry.js?v=$V'|" js/app.js`), 'pages.yml stamps app.js\'s import of entry.js');
});

test('nothing here sends a visitor to the old planner: Customize opens this app\'s Build', () => {
  const main = read('js', 'main.js');
  assert.ok(!/https?:\/\/gen2planner\.jerrari3d\.com/.test(main), 'main.js links no old planner address');
  assert.ok(/const plannerHandoffUrl = \(\) => location\.pathname \+ '\?ws=build&build=' \+ encodeURIComponent\(OFFICIAL\.id\) \+ '#build=' \+ btoa\(/.test(main),
    'Customize hands the current build to this page\'s Build workspace, with its kit');
});
