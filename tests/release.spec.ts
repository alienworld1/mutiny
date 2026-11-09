import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(page.locator('[data-art="ready"]')).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
}
async function push(page: Page, cell?: number, actor = "Rook") {
  await page
    .getByRole("button", { name: new RegExp(`^${actor} `) })
    .press("Enter");
  if (cell !== undefined)
    await page.locator(`[data-cell="${cell}"]`).press("Enter");
  await page
    .getByRole("button", { name: "Push Cart", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Confirm", exact: true })
    .press("Enter");
}
test("painted Free Play completes by keyboard without RPC or audio", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await expect(page.getByRole("gridcell")).toHaveCount(49);
  await expect(page.locator('[data-cell="16"]')).toHaveAccessibleName(
    /push 3 of 3, exit/,
  );
  await page.locator('[data-cell="0"]').press("Home");
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      await expect(
        page.locator(`[data-cell="${row * 7 + col}"]`),
      ).toBeFocused();
      if (col < 6) await page.keyboard.press("ArrowRight");
    }
    if (row < 6) {
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Home");
    }
  }
  await push(page, 38, "Captain");
  await page
    .getByRole("button", { name: "End Phase", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Confirm", exact: true })
    .press("Enter");
  await push(page, 31, "Captain");
  await page
    .getByRole("button", { name: "End Phase", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Confirm", exact: true })
    .press("Enter");
  await push(page, 30, "Captain");
  await expect(
    page.getByRole("heading", { name: "Job Done", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("pushes")).toHaveText("3 / 3");
  expect(errors).toEqual([]);
});
test("reduced motion, escaped previews and interrupted playback retain the real state", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator('[data-motion="reduced"]')).toBeVisible();
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.getByRole("button", { name: "Burn Notice", exact: true }).click();
  await page.locator('[data-cell="25"]').click();
  await expect(page.getByText("ON STRIKE: Dot", { exact: true })).toBeVisible();
  await page.locator('[data-cell="0"]').focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Confirm", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("round")).toHaveText("1 / 5");
  await expect(page.locator('[data-cell="18"]')).toHaveAccessibleName(
    /Dot.*normal/,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator('[data-motion="full"]')).toBeVisible();
  await push(page);
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await page.getByRole("button", { name: "Restart Job", exact: true }).click();
  await expect(page.getByTestId("pushes")).toHaveText("0 / 3");
  await expect(page.getByTestId("cart-hp")).toHaveText("2 / 2");
});
test("touch, enlarged content and high contrast preserve all seven columns", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await open(page);
  await page.getByRole("button", { name: /^Rook / }).tap();
  await page.getByRole("button", { name: "Push Cart", exact: true }).tap();
  await confirm(page);
  await page.addStyleTag({ content: "html{font-size:200%}" });
  expect(
    await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          "main, header, section, aside, button, div, dl",
        ),
      )
        .filter(
          (element) =>
            element.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          classes: element.className,
          text: element.textContent?.slice(0, 60),
        })),
    ),
  ).toEqual([]);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.locator('[data-cell="44"]')).toContainText("Rook");
  await expect(page.getByRole("gridcell")).toHaveCount(49);
  await page.getByRole("button", { name: "End Phase", exact: true }).tap();
  await confirm(page);
  await expect(page.getByTestId("round")).toHaveText("2 / 5");
  await context.close();
});

test("a job opened from the lower board starts at its heading", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Job Board", exact: true }).click();
  await page.getByRole("button", { name: "Toll Gate", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bridge Audit", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('[data-art="ready"]')).toBeVisible();
});

test("saving local progress keeps the action animation running", async ({
  page,
}) => {
  // Instrument the public animation boundary only in this browser test.
  await page.route(/\/src\/stage\/playback\.ts(?:\?.*)?$/, async (route) => {
    if (route.request().url().includes("motion-original"))
      return route.continue();
    await route.fulfill({
      contentType: "text/javascript",
      body: `
      export * from '/src/stage/playback.ts?motion-original';
      import {playEvents as original} from '/src/stage/playback.ts?motion-original';
      export function playEvents(...args) {
        const record={startedAt:performance.now(),stoppedAt:null};
        window.mutinyMotionCheck=record;
        const stop=original(...args);
        return ()=>{record.stoppedAt=performance.now();stop();};
      }
    `,
    });
  });
  await open(page);
  await push(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = (
          window as Window & { mutinyMotionCheck?: { startedAt: number } }
        ).mutinyMotionCheck;
        return value ? performance.now() - value.startedAt : 0;
      }),
    )
    .toBeGreaterThan(200);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { mutinyMotionCheck: { stoppedAt: number | null } })
          .mutinyMotionCheck.stoppedAt,
    ),
  ).toBeNull();
});
