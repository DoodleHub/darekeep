import { CURATED } from "../lib/game/levels";
import { costOf, counts, validate } from "../lib/game/dungeon";
import { GRID_W, GRID_H } from "../lib/game/constants";

let bad = 0;
for (const d of CURATED) {
  const issues = validate(d.layout);
  const c = counts(d.layout);
  const rowsOk = d.layout.objects.every((o) => o.x < GRID_W && o.y < GRID_H);
  console.log(`${d.id.padEnd(9)} ${d.title.padEnd(18)} cost ${String(costOf(d.layout)).padStart(3)}  enemies ${c.enemies} traps ${c.traps} levers ${c.levers} walls ${c.walls} ${rowsOk ? "" : "OUT OF BOUNDS"}`);
  for (const i of issues) {
    bad++;
    console.log(`   ✗ ${i.msg} ${JSON.stringify(i.cells ?? "")}`);
  }
}
process.exit(bad ? 1 : 0);
