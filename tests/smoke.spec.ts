import { expect, test } from "@playwright/test";

test("opens the development app", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mutiny: The Fine Print" }),
  ).toBeVisible();
});
