/* SETTLING TOWARD THE MOUNT (Joey, 2026-10-25, the Under-Table report from tech support, replacing "don't move anything
   automatically, just highlight the gap"): a hanging case physically cannot float - it is hooked to something above it or it
   is on the floor - so the planner works like gravity and pulls everything toward the mount after EVERY edit.

   The one consistent model:
   1. Settle after every edit (add, remove, move, resize, mount switch). Hanging and wall builds settle UP toward the rail;
      tabletop settles DOWN toward the base.
   2. Working from the mount outward, each unit slides straight toward the mount until its edge touches the mount or any
      unit above it (ANY overlap in width counts). Repeat until nothing moves. Units never move sideways.
   3. Drops are allowed anywhere that does not collide or leave the board; the settle decides the final position.
   4. One action = one undo (the caller's commit wraps the settle); the caller animates what moved.
   5. Hatched voids are a drag preview only; after settling no floating gap remains. What is left is structural (the
      both-ends support rule, sag, alignment), still counted on the issues badge.

   ⚠ NO HELD UNITS. The earlier settle (build.js, 2026-10-21) left alone every unit that was already over a gap before the
   edit and that the edit did not touch, so a mount switch's gaps stayed slots. That is what stranded the centre column in
   the report: a 2W under two 3Ws lost its right-hand support when the right 3W went, could not rise under the left 3W,
   and from then on was "already over a gap" - held forever, with everything under it. Every unit settles, every time; a
   gap that cannot close (half a wide case over nothing) stays a slot, as before.

   Pure: `s` is the build record (placed units with x, y, w, hh in half-rows), `Rs` its layout rules (canPlace reads the
   grid's bounds and the other units' cells). Returns Map<id, half-rows travelled>. */
export function settleToward(s, Rs) {
  const moved = new Map();
  const dir = s.mount === 'tabletop' ? 1 : -1;            // +y is down the board; the mount is at the bottom (tabletop) or the top
  for (let pass = 0; pass < 64; pass++) {
    let any = false;
    // nearest the mount first, so a unit lands on one that has already settled
    const order = s.placed.slice().sort((a, b) => dir === 1 ? (b.y + b.hh) - (a.y + a.hh) : a.y - b.y);
    for (const u of order) {
      let ny = u.y;
      while (Rs.canPlace(u.x, ny + dir, u.w, u.hh, u.id)) ny += dir;   // stops at the mount's edge or at any cell another unit holds
      if (ny !== u.y) { moved.set(u.id, (moved.get(u.id) || 0) + Math.abs(ny - u.y)); u.y = ny; any = true; }
    }
    if (!any) break;
  }
  return moved;
}

/** The direction word for a toast: hanging and wall builds settle up, tabletop down. */
export const settleWord = (s) => (s.mount === 'tabletop' ? 'dropped onto what is below' : 'moved up against what is above');
