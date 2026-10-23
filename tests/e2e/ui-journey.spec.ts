import { test, expect, type Page } from "@playwright/test";

test.skip(process.env.E2E_DEMO !== "1", "Requires the isolated browser demo.");
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator("#home-question")).toBeVisible();
}
async function back(page: Page) {
  await page.locator(".task-navigation button").click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("phone Back, browser Back/Forward and language changes retain the latest sale answers", async ({ page }, info) => {
  await open(page);
  await page.screenshot({ path: info.outputPath("home-phone.png"), fullPage: true });
  await page.getByTestId("record-sale").click();
  await page.locator("#amount").fill("500.25");
  await page.getByRole("button", { name: "Add a detail (optional)", exact: true }).click();
  await page.locator("#description").fill("Synthetic back-navigation sale");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="payment"][value="partial"]').check();
  await page.locator("#paymentAmount").fill("200.10");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".balance-strip")).toContainText("₱300.15");
  await back(page);
  await expect(page.locator("#paymentAmount")).toHaveValue("200.10");
  await page.goBack();
  await expect(page.locator("#entry-title")).toHaveText("Are these details right?");
  await page.goBack();
  await expect(page.locator("#paymentAmount")).toHaveValue("200.10");
  await page.goBack();
  await expect(page.locator("#amount")).toHaveValue("500.25");
  await expect(page.locator("#description")).toHaveValue("Synthetic back-navigation sale");
  await page.goForward();
  await expect(page.locator("#paymentAmount")).toHaveValue("200.10");
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#paymentAmount")).toHaveValue("200.10");
  await page.getByRole("button", { name: "Magpatuloy", exact: true }).click();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("review-tagalog-phone.png"), fullPage: true });
  await page.getByRole("button", { name: "Itabi muna", exact: true }).click();
  await page.reload();
  await page.getByTestId("resume-draft").click();
  await expect(page.locator(".balance-strip")).toContainText("₱300.15");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Save sale", exact: true }).click();
  await expect(page.locator("#entry-title")).toHaveText("Sale saved");
  await page.getByRole("button", { name: "View record & payments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic back-navigation sale", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator("#home-question")).toBeVisible();
  await expect(page.getByTestId("resume-draft")).toHaveCount(0);
});

test("browser Back waits for draft preservation and stays on the page after a failed write", async ({ page }) => {
  await open(page);
  await page.getByTestId("record-sale").click();
  await page.locator("#amount").fill("73.");
  await expect(page.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, "restoreWrites", { value: () => { IDBObjectStore.prototype.put = original; } });
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "entries") throw new DOMException("Synthetic quota", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.locator("#amount").fill("74.");
  await page.goBack();
  await expect(page.locator("#amount")).toHaveValue("74.");
  await expect(page.locator(".alert.error")).toBeVisible();
  await page.evaluate(() => (window as typeof window & { restoreWrites: () => void }).restoreWrites());
  await page.getByRole("button", { name: "Try saving the draft again", exact: true }).click();
  await page.goBack();
  await expect(page.locator("#home-question")).toBeVisible();
  await page.getByTestId("resume-draft").click();
  await expect(page.locator("#amount")).toHaveValue("74.");
});

test("setup backtracking preserves business name and activity on a narrow phone", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await open(page);
  await page.getByTestId("account-menu").click();
  await page.getByRole("button", { name: "Add a business", exact: true }).click();
  await page.locator("#setup-business-name").fill("Synthetic QC Repair Shop");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[value="services"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await back(page);
  await expect(page.locator('input[value="services"]')).toBeChecked();
  await back(page);
  await expect(page.locator("#setup-business-name")).toHaveValue("Synthetic QC Repair Shop");
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#setup-business-name")).toHaveValue("Synthetic QC Repair Shop");
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("setup-320.png"), fullPage: true });
});

test("preparation retains optional answers on Back and prints the complete package", async ({ page }, info) => {
  await open(page);
  await page.getByRole("button", { name: "Prepare records", exact: true }).click();
  await page.locator('summary').filter({ hasText: "Registration & tax details" }).click();
  await page.getByLabel("Where can you find the supporting evidence?", { exact: false }).fill("Synthetic registration reference");
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.locator('summary').filter({ hasText: "Earlier figures & notes" }).click();
  await page.getByLabel("Earlier-period income figure (PHP)", { exact: true }).fill("12.");
  await page.locator(".journey-back-link").click();
  await page.locator('summary').filter({ hasText: "Registration & tax details" }).click();
  await expect(page.getByLabel("Where can you find the supporting evidence?", { exact: false })).toHaveValue("Synthetic registration reference");
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.locator('summary').filter({ hasText: "Earlier figures & notes" }).click();
  await expect(page.getByLabel("Earlier-period income figure (PHP)", { exact: true })).toHaveValue("12.00");
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("button", { name: "Generate record-preparation package", exact: true }).click();
  const report = page.getByTestId("saved-period-report");
  await expect(report).toBeVisible();
  await page.evaluate(() => dispatchEvent(new Event("beforeprint")));
  await expect(report.locator("table")).toBeVisible();
  await expect(report.locator("details:not([open])")).toHaveCount(0);
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await expect(report.locator("table")).not.toBeVisible();
  await noOverflow(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("preparation-laptop.png"), fullPage: true });
});
