import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import init, { replay } from "../app/src/game/wasm/game_web.js";

await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
const path = "crates/game-core/tests/fixtures/kingdom-logs.json";
const write = process.argv.includes("--write");
const setups = JSON.parse(await readFile("content/jobs.json", "utf8")).setups;
const original = JSON.parse(
  await readFile("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
);
let references = write
  ? original.map((r) => ({ ...r, log: { ...r.log, content_version: 3 } }))
  : JSON.parse(await readFile(path, "utf8"));
const fixtures = [];
for (const [index, setup] of setups.entries()) {
  const objective = [
    "routine",
    "express",
    "intact",
    "intact",
    "routine",
    "express",
    "routine",
    "intact",
    "express",
  ][index];
  for (const worker of [0, 1, 3, 4, 5, 6])
    for (const placement of ["escort", "infiltration"])
      for (const package_option of [0, 1]) {
        const config = {
          setup_id: setup.id,
          worker,
          placement,
          package_option,
        };
        const meets = (log) => {
          try {
            const s = JSON.parse(replay(JSON.stringify(log))).state;
            return (
              s.outcome === "delivered" &&
              (objective !== "intact" || s.cart_hp === 2) &&
              (objective !== "express" || s.round <= 4)
            );
          } catch {
            return false;
          }
        };
        let log = references
          .filter((r) => r.log.config.setup_id === setup.id)
          .map((r) => ({ ...r.log, config }))
          .find(meets);
        if (!log && write) {
          log = JSON.parse(
            execFileSync(
              "target/release/examples/solve",
              [
                setup.id,
                String(worker),
                String(package_option),
                placement,
                objective,
              ],
              { encoding: "utf8", timeout: 120_000 },
            ),
          );
          references.push({ approach: "specialist", log });
        }
        assert(
          log && meets(log),
          `Missing ${objective} reference: ${JSON.stringify(config)}`,
        );
        fixtures.push({ objective, log });
      }
  console.log(`${setup.id}: 24 proven ${objective} arrangements`);
}
if (write) await writeFile(path, JSON.stringify(fixtures, null, 2) + "\n");
console.log(
  `${fixtures.length} kingdom delivery references verified against browser Wasm.`,
);
