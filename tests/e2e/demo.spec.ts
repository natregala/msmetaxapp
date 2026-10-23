import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { DemoState } from "@/features/demo/demo-store";

test.skip(process.env.E2E_DEMO !== "1", "Requires the explicit demo build.");
test.use({ serviceWorkers: "block" });
test.setTimeout(90000);

const origin = process.env.E2E_BASE_URL ?? "http://localhost:3002";

async function blockRealDataRequests(context: BrowserContext) {
  const requests: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/") || /supabase/i.test(url.hostname)) {
      requests.push(url.origin + url.pathname);
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  return requests;
}

async function home(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("#home-question")).toBeVisible();
  await expect(
    page.getByRole("complementary", {
      name: "Demo · sample data",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#email")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
}

async function checkWidth(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function readDemoScope(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        userId: string;
        businessIds: string[];
        descriptions: (string | null)[];
      }>((resolve, reject) => {
        const opening = indexedDB.open("msme-public-demo-v1");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction("sessions", "readonly");
          const request = transaction.objectStore("sessions").get("current");
          transaction.oncomplete = () => database.close();
          transaction.onerror = () => reject(transaction.error);
          request.onsuccess = () => {
            const state = (request.result as { value: DemoState } | undefined)
              ?.value;
            if (!state)
              return reject(new Error("Missing persisted demo state"));
            resolve({
              userId: state.user.id,
              businessIds: state.businesses.map((business) => business.id),
              descriptions: Object.values(state.ledgers).flatMap((ledger) =>
                ledger.details.map((detail) => detail.record.description),
              ),
            });
          };
        };
      }),
  );
}

async function startSale(page: Page, amount: string, description: string) {
  await page.getByTestId("record-sale").click();
  await page.locator("#amount").fill(amount);
  await page
    .getByRole("button", { name: "Add a detail (optional)", exact: true })
    .click();
  await page.locator("#description").fill(description);
  return page.locator("#businessDate").inputValue();
}

async function savePaidSale(page: Page, description: string) {
  const date = await startSale(page, "123.45", description);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="payment"][value="paid"]').check();
  await page.locator("#paymentDate").fill(date);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save sale", exact: true }).click();
  await expect(
    page.getByText("Saved in this browser · demo", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to home", exact: true })
    .last()
    .click();
  await expect(page.locator("#home-question")).toBeVisible();
}

test("phone demo opens without login and preserves bilingual paid entry across reload", async ({
  page,
  context,
}, testInfo) => {
  const realRequests = await blockRealDataRequests(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  await page.getByTestId("account-menu").click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  await page.getByTestId("account-menu").click();
  const before = await readDemoScope(page);
  expect(before.descriptions).toHaveLength(4);
  await page.screenshot({
    path: testInfo.outputPath("demo-home-phone.png"),
    fullPage: true,
  });

  const description = "Sample bilingual browser-only sale";
  const date = await startSale(page, "123.45", description);
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#amount")).toHaveValue("123.45");
  await expect(page.locator("#description")).toHaveValue(description);
  await expect(
    page.getByRole("complementary", {
      name: "Demo · halimbawang datos",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Magpatuloy", exact: true }).click();
  await page.locator('input[name="payment"][value="paid"]').check();
  await page.locator("#paymentDate").fill(date);
  await page.getByRole("button", { name: "Magpatuloy", exact: true }).click();
  await page
    .getByRole("button", { name: "I-save ang benta", exact: true })
    .click();
  await expect(
    page.getByText("Naka-save sa browser na ito · demo", { exact: true }),
  ).toBeVisible();
  await checkWidth(page);
  await page.screenshot({
    path: testInfo.outputPath("demo-saved-phone.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Bumalik sa simula", exact: true })
    .last()
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Mga kamakailang tala" })
    .or(page.locator("summary").filter({ hasText: /^Recent records$/ }))
    .click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await page.reload();
  await page
    .locator("summary")
    .filter({ hasText: "Mga kamakailang tala" })
    .or(page.locator("summary").filter({ hasText: /^Recent records$/ }))
    .click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tagalog", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const after = await readDemoScope(page);
  expect(after.userId).toBe(before.userId);
  expect(after.descriptions).toHaveLength(5);
  expect(
    after.descriptions.filter((value) => value === description),
  ).toHaveLength(1);
  await checkWidth(page);
  expect(realRequests).toEqual([]);
});

test("demo partial payment, dated history, summary and CSV stay browser-only", async ({
  page,
  context,
}, testInfo) => {
  const realRequests = await blockRealDataRequests(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  const description = "Sample partial sale for demo report";
  const paymentDate = await startSale(page, "500.25", description);
  const businessDate = new Date(
    new Date(paymentDate + "T12:00:00Z").getTime() - 86400000,
  )
    .toISOString()
    .slice(0, 10);
  await page.locator("#businessDate").fill(businessDate);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="payment"][value="partial"]').check();
  await page.locator("#paymentAmount").fill("200.10");
  await page.locator("#paymentDate").fill(paymentDate);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save sale", exact: true }).click();
  await expect(
    page.getByText("Saved in this browser · demo", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to home", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Find records", exact: true }).click();
  await page.getByRole("button", { name: description, exact: true }).click();
  await expect(page.getByText("₱300.15", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Record a later payment", exact: true })
    .click();
  await page.getByLabel(/Amount received or paid/).fill("300.15");
  await page.getByLabel("Payment date", { exact: false }).fill(paymentDate);
  await page
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Correct or void a record" })
    .click();
  await expect(
    page.getByRole("button", { name: "Correct this record", exact: true }),
  ).toBeVisible();
  const payments = page
    .getByRole("heading", { name: "Linked payments", exact: true })
    .locator("..");
  await expect(payments.locator("li")).toHaveCount(2);
  await expect(payments.getByText("₱200.10", { exact: true })).toBeVisible();
  await expect(payments.getByText("₱300.15", { exact: true })).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Correction history$/ })
    .click();
  const firstRevision = page
    .getByRole("heading", { name: "Correction history", exact: true })
    .locator("..")
    .locator("ol")
    .first()
    .locator("li")
    .first();
  await expect(
    page
      .getByRole("heading", { name: "Correction history", exact: true })
      .locator("..")
      .locator("ol")
      .first()
      .locator("li"),
  ).toHaveCount(2);
  await expect(
    firstRevision.getByText(`Business date: ${businessDate}`, { exact: true }),
  ).toBeVisible();
  await expect(
    firstRevision.getByText(`Payment date: ${paymentDate}`, { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Understand a period", exact: true })
    .click();
  await page
    .getByLabel("From business date", { exact: true })
    .fill(businessDate);
  await page.getByLabel("To business date", { exact: true }).fill(paymentDate);
  await page
    .getByRole("button", { name: "Understand a period", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Recorded sales", { exact: true }).locator(".."),
  ).toContainText("₱1,850.25");
  await expect(
    page.getByText("Known money received", { exact: true }).locator(".."),
  ).toContainText("₱1,550.25");
  await expect(page.getByText(/Included active records: 5/)).toBeVisible();
  await page
    .getByRole("button", { name: "Save a reviewable report", exact: true })
    .click();
  await expect(page.getByTestId("saved-period-report")).toBeVisible();
  await expect(
    page
      .getByTestId("saved-period-report")
      .getByRole("heading", { name: /Demo period report · sample data/ }),
  ).toBeVisible();
  await page
    .getByTestId("saved-period-report")
    .locator("summary")
    .filter({ hasText: "Included records" })
    .click();
  await expect(
    page
      .getByTestId("saved-period-report")
      .getByRole("row", { name: new RegExp(description) })
      .getByRole("cell")
      .last(),
  ).toHaveText("2");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download demo record CSV", exact: true })
    .click();
  const download = await downloading;
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, "utf8");
  expect(csv).toMatch(/DEMO.*Synthetic browser-only records/);
  expect(csv).toContain(description);
  expect(csv).toContain("500.25");
  await checkWidth(page);
  await page.screenshot({
    path: testInfo.outputPath("demo-report-phone.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await checkWidth(page);
  await page.screenshot({
    path: testInfo.outputPath("demo-report-laptop.png"),
    fullPage: true,
  });
  expect(realRequests).toEqual([]);
});

test("demo reset rotates the synthetic owner and fresh browsers have independent data", async ({
  page,
  context,
  browser,
}) => {
  const realRequests = await blockRealDataRequests(context);
  await home(page);
  const description = "Sample record only in the first browser";
  await savePaidSale(page, description);
  const before = await readDemoScope(page);
  expect(before.descriptions).toHaveLength(5);

  const independentContext = await browser.newContext({
    baseURL: origin,
    serviceWorkers: "block",
  });
  try {
    const independentRequests = await blockRealDataRequests(independentContext);
    const otherPage = await independentContext.newPage();
    await home(otherPage);
    const other = await readDemoScope(otherPage);
    expect(other.userId).not.toBe(before.userId);
    expect(other.businessIds).not.toEqual(before.businessIds);
    expect(other.descriptions).toHaveLength(4);
    await expect(otherPage.getByText(description, { exact: true })).toHaveCount(
      0,
    );

    await startSale(page, "77.", "Sample unfinished reset draft");
    await page
      .getByRole("button", { name: "Save for later", exact: true })
      .click();
    await expect(page.getByTestId("resume-draft")).toHaveCount(1);
    await page
      .getByRole("complementary", { name: "Demo · sample data", exact: true })
      .locator("summary")
      .click();
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    await expect(page.getByTestId("resume-draft")).toHaveCount(1);
    expect((await readDemoScope(page)).userId).toBe(before.userId);

    page.once("dialog", (dialog) => void dialog.accept());
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Reset demo", exact: true }).click(),
    ]);
    await expect(page.locator("#home-question")).toBeVisible();
    await expect(page.getByTestId("record-sale")).toBeEnabled();
    await expect(page.getByTestId("resume-draft")).toHaveCount(0);
    await expect(page.getByText(description, { exact: true })).toHaveCount(0);
    const reset = await readDemoScope(page);
    expect(reset.userId).not.toBe(before.userId);
    expect(reset.businessIds).not.toEqual(before.businessIds);
    expect(reset.descriptions).toHaveLength(4);
    await otherPage.reload();
    await expect(otherPage.locator("#home-question")).toBeVisible();
    expect(await readDemoScope(otherPage)).toEqual(other);
    expect(independentRequests).toEqual([]);
  } finally {
    await independentContext.close();
  }
  expect(realRequests).toEqual([]);
});
