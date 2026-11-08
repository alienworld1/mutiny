import { expect, test, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dock Fire", exact: true }),
  ).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
}
async function end(page: Page) {
  await page.getByRole("button", { name: "End Phase", exact: true }).click();
  await confirm(page);
}
async function push(page: Page, cell?: number) {
  await page.getByRole("button", { name: /^Rook / }).click();
  if (cell !== undefined) await page.locator(`[data-cell="${cell}"]`).click();
  await page.getByRole("button", { name: "Push Cart", exact: true }).click();
  await confirm(page);
}
test("wallet-free delivery, preview cancel, persistence and retry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.getByRole("button", { name: "Guard", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Captain / }),
  ).not.toContainText("✓");
  await page.getByRole("button", { name: "Burn Notice", exact: true }).click();
  await page.locator('[data-cell="25"]').click();
  await expect(page.getByText("ON STRIKE: Dot", { exact: true })).toBeVisible();
  await confirm(page);
  await push(page);
  await end(page);
  await expect(page.getByRole("status")).toContainText("ON STRIKE");
  await page.reload();
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(page.getByTestId("round")).toHaveText("2 / 5");
  await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
  await push(page, 37);
  await end(page);
  await push(page, 30);
  await expect(
    page.getByRole("heading", { name: "Job Done", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("pushes")).toHaveText("3 / 3");
  await page.getByRole("button", { name: "Play Again", exact: true }).click();
  await expect(page.getByTestId("round")).toHaveText("1 / 5");
  await expect(page.getByTestId("pushes")).toHaveText("0 / 3");
  await expect(page.getByTestId("cart-hp")).toHaveText("2 / 2");
  await page.getByRole("button", { name: /^Captain / }).click();
  await expect(
    page.getByRole("button", { name: "Burn Notice", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
test("keyboard grid, ordinary block and defeat", async ({ page }) => {
  await open(page);
  const captain = page.locator('[data-cell="32"]');
  await captain.press("Enter");
  await expect(
    page.getByRole("button", { name: "Guard", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('[data-cell="25"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Move to E4, then choose an action.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guard", exact: true }).click();
  await confirm(page);
  await end(page);
  await expect(page.getByRole("status")).toContainText("Order blocked: Dot");
  await expect(page.getByRole("status")).not.toContainText("ON STRIKE");
  for (let i = 0; i < 4; i++) {
    if (
      await page.getByRole("button", { name: "End Phase", exact: true }).count()
    )
      await end(page);
  }
  await expect(page.getByRole("region", { name: "Job result" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Job Done", exact: true }),
  ).toHaveCount(0);
});
test("mobile touch and reduced motion keep controls in view", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await open(page);
  await page.getByRole("button", { name: /^Rook / }).tap();
  await page.getByRole("button", { name: "Push Cart", exact: true }).tap();
  await confirm(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dock-fire-mobile.png",
    fullPage: true,
  });
  await context.close();
});

test("development wallet probe rechecks a submitted transaction after reload", async ({
  page,
}) => {
  // Test-only RPC fixtures. Live compatibility is checked with an actual wallet separately.
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.route("https://test.rpc.fastnear.com", (route) => {
    const request = route.request().postDataJSON() as { method: string };
    return route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: "mutiny-probe",
        result:
          request.method === "tx"
            ? {
                final_execution_status: "FINAL",
                status: { SuccessValue: "Mg==" },
              }
            : { result: [50] },
      },
    });
  });
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "mutiny-probe",
      JSON.stringify({ hash: "test-only-fixture", signer: "fixture.testnet" }),
    ),
  );
  await page.goto("/wallet-smoke.html");
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed. Registry smoke calls: 2.",
  );
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed. Registry smoke calls: 2.",
  );
  await expect(
    page.getByRole("button", { name: "Call Smoke", exact: true }),
  ).toBeDisabled();
});
