import { expect, test } from "@playwright/test";

test("recording shows restored stock, depleted funding, and reopened work", async ({
  page,
}) => {
  await page.goto("/?demo=economy");
  await expect(
    page.getByRole("heading", { name: "The docks need supplies", exact: true }),
  ).toBeVisible();
  await page.getByText("Town records", { exact: true }).click();
  const timeline = page.getByRole("slider", { name: "Recorded event" });
  await timeline.fill("6");
  await expect(
    page.getByRole("heading", {
      name: "The docks are restored. Their treasury is spent.",
    }),
  ).toBeVisible();
  await expect(page.locator("article").first()).toContainText("4/6 supplies");
  await expect(page.locator("article").first()).toContainText(
    "No funded work available",
  );
  await timeline.fill("8");
  await expect(page.locator("article").first()).toContainText("Restored");
  await expect(page.locator("article").first()).toContainText(
    "No funded work available",
  );
  await timeline.fill("9");
  await expect(page.locator("article").first()).toContainText(
    "Routine delivery:",
  );
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(timeline).toHaveValue("0");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(timeline).toHaveValue("1", { timeout: 6000 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("missing recording offers recovery", async ({ page }) => {
  await page.route("**/demo/economy.json", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/?demo=economy");
  await expect(page.getByRole("alert")).toContainText("Recording unavailable");
  await page.unroute("**/demo/economy.json");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("heading", { name: "The docks need supplies", exact: true }),
  ).toBeVisible();
});

test("graphs and event effects follow the recorded hire and delivery", async ({
  page,
}) => {
  await page.goto("/?demo=economy");
  const timeline = page.getByRole("slider", { name: "Recorded event" });
  await expect(
    page.getByRole("img", {
      name: /Deliveries rebuild supply, through event 1/,
    }),
  ).toBeVisible();
  await timeline.fill("1");
  await expect(page.getByLabel("This event’s effects")).toContainText(
    "Rook earns",
  );
  await expect(page.getByLabel("This event’s effects")).toContainText("95%");
  await timeline.fill("2");
  await expect(page.getByLabel("This event’s effects")).toContainText(
    "+1 supply",
  );
  await expect(
    page.getByRole("img", {
      name: /Deliveries rebuild supply, through event 3/,
    }),
  ).toHaveAttribute("aria-label", /Docks supply: 1 to 2/);
  await timeline.fill("8");
  await expect(page.getByLabel("This event’s effects")).toContainText(
    "3 supplies used",
  );
  await expect(
    page.getByRole("img", {
      name: /Hires raise the crew’s ask, through event 9/,
    }),
  ).toHaveAttribute("aria-label", /0.004 NEAR/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
