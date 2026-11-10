import { expect, test, type Page } from "@playwright/test";

async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator('[data-cell="0"]')).toBeEnabled();
}
async function start(page: Page) {
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "First Shift guide" }),
  ).toBeVisible();
}

test("First Shift teaches a real strike and Borrow, survives reload, then leaves the delivery open", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await page.getByRole("button", { name: "End Phase", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("round")).toHaveText("1 / 5");
  await page.getByRole("button", { name: /^Rook \d/ }).click();
  await page.getByRole("button", { name: "Push Cart", exact: true }).click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Read the fine print", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Captain \d/ }).click();
  await page.getByRole("button", { name: "Burn Notice", exact: true }).click();
  await page.locator('[data-cell="25"]').press("Enter");
  await expect(page.getByText("ON STRIKE: Dot", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("round")).toHaveText("1 / 5");
  await page.locator('[data-cell="25"]').click();
  await confirm(page);
  await page.getByRole("button", { name: "End Phase", exact: true }).click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Borrow the striker", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Borrow the striker", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Captain \d/ }).click();
  await page.locator('[data-cell="25"]').click();
  await page.getByRole("button", { name: "Borrow", exact: true }).click();
  await page.locator('[data-cell="18"]').click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Give Dot an order", exact: true }),
  ).toBeVisible();
  await page.locator('[data-cell="17"]').click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  await page.locator('[data-cell="24"]').click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "The rest is yours" }),
  ).toBeVisible();
  for (const cell of [37, 30]) {
    await page.getByRole("button", { name: /^Rook \d/ }).click();
    await page.locator(`[data-cell="${cell}"]`).click();
    await page.getByRole("button", { name: "Push Cart", exact: true }).click();
    await confirm(page);
    if (cell === 37) {
      await page
        .getByRole("button", { name: "End Phase", exact: true })
        .click();
      await confirm(page);
    }
  }
  await expect(
    page.getByRole("heading", { name: "Job Done", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play Again", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "First Shift guide" }),
  ).toHaveCount(0);
});

test("guide can be skipped and replayed from the visual field guide", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await page.getByText("How to play", { exact: true }).click();
  await page
    .getByRole("button", { name: "Cause a strike", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: /Example battlefield/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("img", { name: /Fire at E4/ })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("img", { name: /striking/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Replay First Shift", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "First Shift guide" }),
  ).toBeVisible();
  await expect(page.getByTestId("pushes")).toHaveText("0 / 3");
});

test("guidance fits narrow screens with enlarged text and reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await start(page);
  await page.addStyleTag({ content: "html { font-size: 200% }" });
  await expect(page.getByRole("gridcell")).toHaveCount(49);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/mutiny-first-shift-mobile.png",
    fullPage: true,
  });
});
