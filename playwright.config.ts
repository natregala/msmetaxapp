import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env.e2e");
} catch {
  /* Test file explains missing fixture setup. */
}
try {
  loadEnvFile(".env.local");
} catch {
  /* HTTP tests may use their own configured server. */
}
try {
  loadEnvFile(".env.guided-e2e");
} catch {
  /* Fresh first-use fixture is optional. */
}
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    channel: process.env.E2E_BROWSER_CHANNEL,
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
