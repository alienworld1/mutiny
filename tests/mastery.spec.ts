import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { ActionLog, Command, Setup } from "../app/src/game/types";
const refs = JSON.parse(
  readFileSync("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
) as { approach: string; log: ActionLog }[];
const setups = (
  JSON.parse(readFileSync("content/jobs.json", "utf8")) as { setups: Setup[] }
).setups;
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
}
async function playCommand(
  page: Page,
  command: Command,
  setup: Setup,
  log: ActionLog,
) {
  if (command.kind === "end_phase")
    await page.getByRole("button", { name: "End Phase", exact: true }).click();
  else if (command.kind === "skip_borrow")
    await page
      .getByRole("button", { name: "Skip Borrow", exact: true })
      .click();
  else {
    const names = setup.units.map((u) => u.name);
    names[log.config.placement === "escort" ? 1 : 4] = [
      "Rook",
      "Mallow",
      "Wisp",
    ][log.config.worker]!;
    if (log.config.placement === "escort" && log.config.worker === 1)
      names[2] = "Wisp";
    await page
      .getByRole("region", { name: "Crew actions" })
      .getByRole("button", { name: new RegExp(`^${names[command.unit]} `) })
      .click();
    if (command.path.length)
      await page.locator(`[data-cell="${command.path.at(-1)}"]`).click();
    const a = command.action;
    const labels = {
      guard: "Guard",
      push: "Push Cart",
      attack: "Attack",
      burn: "Burn Notice",
      certify: "Safety Certificate",
      relocate: "Staff Relocation",
      shove: "Shove",
      smoke: "Smoke Break",
      swap: "Desk Swap",
      clean_shot: "Clean Shot",
      borrow: "Borrow",
      blast: "Blast",
    };
    await page
      .getByRole("button", { name: labels[a.kind], exact: true })
      .click();
    if (a.kind !== "guard" && a.kind !== "push") {
      if (a.kind === "shove") {
        await page
          .getByRole("grid")
          .getByRole("button", { name: new RegExp(`\\. ${names[a.target]},`) })
          .click();
        await page.locator(`[data-cell="${a.cell}"]`).click();
      } else if ("cell" in a)
        await page.locator(`[data-cell="${a.cell}"]`).click();
      else if ("target" in a)
        await page
          .getByRole("grid")
          .getByRole("button", { name: new RegExp(`\\. ${names[a.target]},`) })
          .click();
    }
  }
  await confirm(page);
}
for (const reference of refs.filter((r) => r.approach === "delivery")) {
  const setup = setups.find((s) => s.id === reference.log.config.setup_id)!;
  test(`${setup.name}: ${setup.variant} complete free journey and Ledger`, async ({
    page,
  }) => {
    await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    await page.goto("/");
    await page
      .getByRole("button", { name: setup.variant, exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "House worker", exact: true })
      .selectOption(String(reference.log.config.worker));
    await page
      .getByRole("combobox", { name: "Fine print", exact: true })
      .selectOption(String(reference.log.config.package_option));
    await page.getByRole("button", { name: "Play", exact: true }).click();
    for (const command of reference.log.commands)
      await playCommand(page, command, setup, reference.log);
    await expect(
      page.getByRole("heading", { name: "Job Done", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Job Board", exact: true }).click();
    const ledger = page.getByRole("region", { name: "Captain's Ledger" });
    await expect(ledger).toContainText("1 attempts · 1 clears");
    await expect(ledger).toContainText("Fastest clear");
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Captain's Ledger" }),
    ).toContainText("1 attempts · 1 clears");
    await page.getByRole("button", { name: "Play Free", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Job Done", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Job Board", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Captain's Ledger" }),
    ).toContainText("1 attempts · 1 clears");
  });
}
test("Borrow preview, pending refresh, temporary command and recovery", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.getByRole("button", { name: "Burn Notice", exact: true }).click();
  await page.locator('[data-cell="25"]').click();
  await confirm(page);
  await page.getByRole("button", { name: "End Phase", exact: true }).click();
  await confirm(page);
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.locator('[data-cell="25"]').click();
  await page.getByRole("button", { name: "Borrow Dot", exact: true }).click();
  await expect(
    page.getByText("Borrowed Dot", {
      exact: true,
    }),
  ).toBeVisible();
  await confirm(page);
  await expect(page.locator('[data-cell="32"]')).toHaveAccessibleName(
    /Captain, player/,
  );
  await page.reload();
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Skip Borrow", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Dot / }).click();
  await page.locator('[data-cell="17"]').click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  await page.locator('[data-cell="24"]').click();
  await confirm(page);
  await expect(page.getByRole("status")).toContainText("Supervisor: 2 HP left");
  await page.getByRole("button", { name: "End Phase", exact: true }).click();
  await confirm(page);
  await expect(page.getByRole("status")).toContainText(
    "Dot returns to enemy orders",
  );
});
test("Infiltration is enemy controlled and crew setup survives refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toll Gate", exact: true }).click();
  await page
    .getByRole("combobox", { name: "House worker", exact: true })
    .selectOption("2");
  await page
    .getByRole("combobox", { name: "Placement", exact: true })
    .selectOption("infiltration");
  await expect(
    page.getByText("The enemy commands Wisp.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Crew actions" })
      .getByRole("button", { name: /^Wisp / }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bridge Audit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("grid").getByRole("button", { name: /Wisp, enemy, mage/ }),
  ).toBeVisible();
});
test("explicit friendly-fire self-refusal preview and commit", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "House worker", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: /^Wisp / }).click();
  await page.locator('[data-cell="45"]').click();
  await page.getByRole("button", { name: "Clean Shot", exact: true }).click();
  await page.locator('[data-cell="32"]').click();
  await expect(
    page.getByText(
      "This command will be refused. Confirm to spend the activation with no effect.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Wisp / })).not.toContainText(
    "✓",
  );
  await page.locator('[data-cell="32"]').click();
  await confirm(page);
  await expect(page.getByRole("status")).toContainText("refused the command");
  await expect(page.getByRole("button", { name: /^Wisp / })).toContainText("✓");
});
test("production offline refresh resumes and completes Free Play", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.MUTINY_PREVIEW !== "1",
    "Requires the production offline bundle",
  );
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  const ref = refs.find(
    (r) =>
      r.log.config.setup_id === "dock-fire-intro" && r.approach === "delivery",
  )!;
  const setup = setups[0]!;
  await playCommand(page, ref.log.commands[0]!, setup, ref.log);
  await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open("mutiny", 2);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        return new Promise<number>((resolve) => {
          const r = db
            .transaction("progress")
            .objectStore("progress")
            .get("local");
          r.onsuccess = () => {
            db.close();
            resolve(r.result.draft.log.commands.length);
          };
        });
      }),
    )
    .toBe(1);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
  for (const c of ref.log.commands.slice(1))
    await playCommand(page, c, setup, ref.log);
  await expect(
    page.getByRole("heading", { name: "Job Done", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Job Board", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Captain's Ledger" }),
  ).toContainText("1 attempts · 1 clears");
});
test.describe("unavailable services", () => {
  test.use({ serviceWorkers: "block" });
  test("engine loading failure retries and unavailable storage does not block play", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "indexedDB", {
        get() {
          throw new Error("Test-only unavailable storage");
        },
      }),
    );
    await page.route("**/*game_web_bg*.wasm", (route) => route.abort());
    await page.goto("/");
    await page.getByRole("button", { name: "Play Free", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "The game could not load",
    );
    await page.unroute("**/*game_web_bg*.wasm");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Dock Fire", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/This browser could not save your progress/),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Rook / }).click();
    await page.getByRole("button", { name: "Push Cart", exact: true }).click();
    await confirm(page);
    await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
  });
});
test("small home and battle layouts stay inside the viewport at 200 percent text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await page.getByRole("button", { name: /^Captain / }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Borrow explains range and becomes legal after clearing the captain's approach", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.getByRole("button", { name: "Burn Notice", exact: true }).click();
  await page.locator('[data-cell="25"]').click();
  await confirm(page);
  await page.getByRole("button", { name: /^Mallow / }).click();
  await page.getByRole("button", { name: "Desk Swap", exact: true }).click();
  await page.locator('[data-cell="32"]').click();
  await confirm(page);
  await page.getByRole("button", { name: "End Phase", exact: true }).click();
  await confirm(page);
  await page.getByRole("button", { name: /^Captain / }).click();
  await expect(
    page.getByText("Move within 2 tiles of a striker to Borrow.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Borrow", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Mallow / }).click();
  await page.locator('[data-cell="33"]').click();
  await page.getByRole("button", { name: "Guard", exact: true }).click();
  await confirm(page);
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.locator('[data-cell="32"]').click();
  await page.getByRole("button", { name: "Borrow", exact: true }).click();
  await page.locator('[data-cell="18"]').click();
  await confirm(page);
  await expect(
    page.getByRole("button", { name: "Skip Borrow", exact: true }),
  ).toBeVisible();
});
