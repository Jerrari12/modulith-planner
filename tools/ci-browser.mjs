#!/usr/bin/env node
/* Which browser the CI suites will get (2026-10-25, the CI timing work). Every browser suite here launches the runner
   image's own Google Chrome first (Playwright's `channel: 'chrome'`) and Playwright's downloaded Chromium only if that
   launch fails. On the baseline run 40257169401 the image's Chrome launched (channel chrome 155.0.8059.39), so the
   `npx playwright install --with-deps chromium` before it - 4.78 min of that job - fetched a browser no suite opened.
   The workflow now runs this first and installs Playwright's Chromium only when it exits non-zero.
     usage: node tools/ci-browser.mjs [--any]   (--any: either browser will do, for the check after a fallback install)
   Prints one ::notice naming the browser and its version; exits 0 when the browser the suites try first launches. */
const { chromium } = await import('playwright');
const tries = process.argv.includes('--any') ? [{ channel: 'chrome' }, {}] : [{ channel: 'chrome' }];
for (const o of tries) {
  try {
    const b = await chromium.launch(o);
    console.log(`::notice title=browser::${o.channel ? 'the image\'s Chrome (channel chrome)' : 'Playwright\'s Chromium'} ${b.version()}`);
    await b.close();
    process.exit(0);
  } catch (e) {
    console.log(`::notice title=browser::${o.channel ? 'channel chrome' : 'Playwright\'s Chromium'} did not launch: ${String(e.message).split('\n')[0]}`);
  }
}
process.exit(1);
