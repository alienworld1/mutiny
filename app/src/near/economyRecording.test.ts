import { expect, it } from "vitest";
import { parseRecording } from "./economyRecording";
import { readFileSync } from "node:fs";
import init, { project_stock, project_quote } from "../game/wasm/game_web";
await init({
  module_or_path: readFileSync(
    new URL("../game/wasm/game_web_bg.wasm", import.meta.url),
  ),
});
it("projects consumption at the exact boundary and preserves restoration", () => {
  const stock = JSON.stringify({ supplies: 4, updated_at: 100, deliveries: 3 });
  expect(JSON.parse(project_stock(stock, 1899n, false)).supplies).toBe(4);
  expect(JSON.parse(project_stock(stock, 1900n, false))).toEqual({
    supplies: 3,
    updated_at: 1900,
    deliveries: 3,
  });
  expect(JSON.parse(project_stock(stock, 1900n, true)).supplies).toBe(4);
});
it("decays pressure independently of idle blocks with exact amounts", () => {
  expect(
    project_quote(
      "10000000000000000000000",
      "4000000000000000000000",
      "30000000000000000000000",
      "2000000000000000000000",
      1,
      0n,
      0n,
      0n,
    ),
  ).toBe("12000000000000000000000");
  expect(
    project_quote(
      "10000000000000000000000",
      "4000000000000000000000",
      "30000000000000000000000",
      "2000000000000000000000",
      1,
      0n,
      1800n,
      4n,
    ),
  ).toBe("4000000000000000000000");
});
it("rejects missing, empty and incorrectly labelled recordings", () => {
  for (const r of [
    null,
    {},
    { version: 1, network: "testnet", frames: [] },
    {
      version: 1,
      network: "sandbox",
      registryHash: "x",
      workerHash: "x",
      frames: [{}],
    },
  ])
    expect(() => parseRecording(r)).toThrow();
});

it("loads the shipped contract recording and rejects broken funding", () => {
  const raw = JSON.parse(readFileSync("public/demo/economy.json", "utf8"));
  expect(parseRecording(raw).frames.length).toBeGreaterThan(1);
  raw.frames[0].economy.towns[0].paid = "1";
  expect(() => parseRecording(raw)).toThrow();
});
