#!/usr/bin/env bash
# Run one npm script on the CI runner so that a failure NAMES ITSELF in the run's annotations, which the Actions API serves
# without signing in (2026-10-16: three runs failed and the log - sign-in only - could not be read): the failing tests,
# then their messages, with workflow-command escaping for % and carriage returns (Terra 01a146f2). Moved here unchanged
# from the deploy workflow's inline named() on 2026-10-25, so the split steps and the e2e shards share one copy, and it now
# also reports the script's slowest cases as one notice (tools/tap-durations.mjs).
#   usage: bash tools/ci-named.sh <npm script>
s="$1"
npm run "$s" 2>&1 | tee "/tmp/$s.log"; status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  # without a terminal node --test reports in TAP ("not ok N - name", "error: ..."), not the spec reporter's
  # "✖" (f10b245's run matched nothing); and anything else ends with the log's last lines
  { grep -E '^\s*(not ok|✖)' "/tmp/$s.log" | sort -u | head -5; grep -E "AssertionError|TimeoutError|Timeout [0-9]+ms|Error:|error: |within|expected|actual" "/tmp/$s.log" | head -5; } > "/tmp/$s.why"
  [ -s "/tmp/$s.why" ] || tail -n 8 "/tmp/$s.log" > "/tmp/$s.why"
  sed -e 's/%/%25/g' -e 's/\r/%0D/g' "/tmp/$s.why" | while IFS= read -r l; do echo "::error title=$s::$l"; done
fi
node tools/tap-durations.mjs "/tmp/$s.log" "$s" || true
exit "$status"
