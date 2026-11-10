import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import init, { replay, canonical } from "../app/src/game/wasm/game_web.js";
const goldens = JSON.parse(
  execFileSync(
    "cargo",
    ["run", "--locked", "--quiet", "-p", "game-core", "--example", "goldens"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
await init({
  module_or_path: await readFile(
    new URL("../app/src/game/wasm/game_web_bg.wasm", import.meta.url),
  ),
});
for (const golden of goldens) {
  const log = JSON.stringify(golden.log);
  assert.deepEqual(JSON.parse(replay(log)), golden.transition);
  assert.deepEqual([...canonical(log)], golden.canonical);
}
console.log(
  `Native ↔ Wasm: ${goldens.length} complete state, event and canonical-log goldens passed.`,
);
