#!/usr/bin/env bash
# The Done scene's renders on node0. Launched by tools/done-scene/node0_render.py, which runs D:/MODULITH/scripts/
# render-on-node0.py's main() pointed at ~/render-assets/modulith-planner/done-scene (GPU lock, reviewer parked, run
# detached, exit code polled, outputs fetched). Reads:
#   JOBS      a job file, e.g. jobs/look1.txt - one Blender process per non-comment line (room.py's arguments)
#   BLENDER   node0's Blender
#   DONE_OUT  where the outputs go
# Exit code = the number of jobs that failed.
set -u
cd "$(dirname "$0")"
failed=0
while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"                       # job files are written on Windows
    case "$line" in ''|'#'*) continue ;; esac
    echo "=== $line"
    # shellcheck disable=SC2086 - the job line is a list of arguments, split on purpose
    "$BLENDER" -b --factory-startup --python-exit-code 1 --python room.py -- --out-dir "$DONE_OUT" $line 2>&1 \
        | grep -v '| INFO:'
    rc=${PIPESTATUS[0]}
    [ "$rc" -ne 0 ] && failed=$((failed + rc))
done < "$JOBS"
echo "done-scene batch finished, $failed failed"
exit "$failed"
