import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await expect(page.locator('[data-poses="ready"]')).toBeVisible();
}

test("committed motion locks commands and reduced motion releases them safely", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: /^Rook / }).click();
  await page.getByRole("button", { name: "Push Cart", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "End Phase", exact: true }),
  ).toBeDisabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "End Phase", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await page.getByRole("button", { name: "Restart Job", exact: true }).click();
  await expect(page.getByTestId("pushes")).toHaveText("0 / 3");
  await expect(
    page.getByRole("button", { name: "End Phase", exact: true }),
  ).toBeEnabled();
});

test("sound uses real audio, mute suppresses effects, and music stops on navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    const record = {
      contexts: [] as AudioContext[],
      tones: 0,
      noises: 0,
      active: 0,
    };
    Object.assign(window, { soundCheck: record });
    window.AudioContext = class extends NativeAudio {
      constructor() {
        super();
        record.contexts.push(this);
        const oscillator = this.createOscillator.bind(this),
          buffer = this.createBufferSource.bind(this);
        this.createOscillator = () => {
          record.tones++;
          const node = oscillator();
          count(node);
          return node;
        };
        this.createBufferSource = () => {
          record.noises++;
          const node = buffer();
          count(node);
          return node;
        };
        function count(node: AudioScheduledSourceNode) {
          const start = node.start.bind(node);
          node.start = (when = 0) => {
            record.active++;
            start(when);
          };
          node.addEventListener(
            "ended",
            () => {
              record.active--;
            },
            { once: true },
          );
        }
      }
    };
  });
  await page.goto("/");
  expect(
    await page.evaluate(
      () =>
        (window as Window & { soundCheck: { contexts: unknown[] } }).soundCheck
          .contexts.length,
    ),
  ).toBe(0);
  await open(page);
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Music", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const counts = () =>
    page.evaluate(() => {
      const value = (
        window as Window & {
          soundCheck: {
            tones: number;
            noises: number;
            contexts: AudioContext[];
          };
        }
      ).soundCheck;
      return {
        tones: value.tones,
        noises: value.noises,
        contexts: value.contexts.length,
        running: value.contexts[0]?.state,
      };
    });
  expect((await counts()).tones).toBeGreaterThan(0);
  expect((await counts()).running).toBe("running");
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await page
    .getByRole("button", { name: "Sound effects", exact: true })
    .click();
  const muted = await counts();
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.getByRole("button", { name: "Guard", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await counts()).toEqual(muted);
  await page.getByRole("button", { name: "Guard", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator('[data-cell="0"]')).toBeEnabled();
  expect(await counts()).toEqual(muted);
  await page
    .getByRole("button", { name: "Sound effects", exact: true })
    .click();
  expect((await counts()).tones).toBeGreaterThan(muted.tones);
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await page.getByRole("button", { name: "Job Board", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { soundCheck: { active: number } }).soundCheck
            .active,
      ),
    )
    .toBe(0);
  const left = await counts();
  // A new music bar would otherwise be scheduled after 5.2 seconds.
  await page.waitForTimeout(5400);
  expect(await counts()).toEqual(left);
  expect(left.contexts).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Music", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("missing pose art and unavailable audio keep the free game playable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      configurable: true,
    });
  });
  await page.route("**/character-poses.webp", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(page.locator('[data-art="ready"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sound effects", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^Rook / }).click();
  await page.getByRole("button", { name: "Push Cart", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "End Phase", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
});

test("the command deck fits desktop and all battlefield columns fit narrow screens", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const tool = await page
    .getByRole("button", { name: "Safety Certificate", exact: true })
    .boundingBox();
  expect(tool).not.toBeNull();
  expect(tool!.y + tool!.height).toBeLessThanOrEqual(900);
  await page.screenshot({
    path: testInfo.outputPath("game-desktop.png"),
    fullPage: true,
  });
  for (const width of [390, 320, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("gridcell")).toHaveCount(49);
    await expect(
      page.getByRole("button", { name: "Safety Certificate", exact: true }),
    ).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: testInfo.outputPath("game-mobile.png"),
        fullPage: true,
      });
  }
});
