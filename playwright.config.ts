import { defineConfig } from "@playwright/test";

const preview = process.env.MUTINY_PREVIEW === "1";
const url = preview ? "http://127.0.0.1:4180" : "http://127.0.0.1:4173";
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: url },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "firefox",
      testMatch: "release.spec.ts",
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      testMatch: "release.spec.ts",
      use: { browserName: "webkit" },
    },
  ],
  webServer: {
    command: preview
      ? "pnpm --filter @mutiny/app preview --host 127.0.0.1 --port 4180"
      : "pnpm dev --host 127.0.0.1 --port 4173",
    url,
    reuseExistingServer: !process.env.CI,
  },
});
