import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env.completion-e2e");
} catch {
  /* Requires isolated synthetic fixture. */
}
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
test.skip(
  !process.env.E2E_COMPLETION_EMAIL || !process.env.E2E_COMPLETION_PASSWORD,
  "Requires isolated completion fixture; see testing instructions.",
);
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.locator("#email").fill(process.env.E2E_COMPLETION_EMAIL!);
  await page.locator("#password").fill(process.env.E2E_COMPLETION_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  await expect(
    page.locator("#home-question,#setup-business-name").first(),
  ).toBeVisible();
}
async function menu(page: Page) {
  const details = page.locator(".account-menu");
  if (!(await details.evaluate((n) => (n as HTMLDetailsElement).open)))
    await page.getByTestId("account-menu").click();
}
async function reopenSetup(page: Page) {
  if (await page.locator("#home-question").count()) {
    await menu(page);
    await page
      .getByRole("button", { name: "Add a business", exact: true })
      .click();
  }
  await expect(
    page.locator("#setup-business-name, input[name=businessActivity]").first(),
  ).toBeVisible();
}
test("interrupted setup keeps answers; two parked drafts remain independent and bilingual", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await reopenSetup(page);
  const name = "Synthetic Quezon City recovery " + randomUUID().slice(0, 6);
  // A previous interrupted test can resume at a later question.
  if (!(await page.locator("#setup-business-name").count()))
    await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator("#setup-business-name").fill(name);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#setup-business-name")).toHaveValue(name);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .locator('input[name="businessActivity"][value="services"]')
    .check();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  if (await page.locator("#home-question").count()) {
    await menu(page);
    await page
      .getByRole("button", { name: "Add a business", exact: true })
      .click();
  }
  await expect(
    page.locator('input[name="businessActivity"][value="services"]'),
  ).toBeChecked();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Later", exact: true }).click();
  await expect(page.locator("#home-question")).toBeVisible();
  const businesses = (await (await page.request.get("/api/businesses")).json())
    .data.businesses;
  expect(
    businesses.filter((b: { name: string }) => b.name === name),
  ).toHaveLength(1);
  await page.getByTestId("record-sale").click();
  await page.locator("#amount").fill("12.");
  await expect(
    page.getByText("Draft saved on this device", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save for later", exact: true })
    .click();
  await expect(page.getByTestId("record-expense")).toBeEnabled();
  await page.getByTestId("record-expense").click();
  await page.locator("#amount").fill("350.25");
  await expect(
    page.getByText("Draft saved on this device", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save for later", exact: true })
    .click();
  await expect(page.locator(".resume-card")).toHaveCount(2);
  await page
    .locator(".resume-card")
    .filter({ hasText: "12." })
    .getByTestId("resume-draft")
    .click();
  await expect(page.locator("#amount")).toHaveValue("12.");
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#amount")).toHaveValue("12.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/root-phone-multiple-drafts.png",
    fullPage: true,
  });
});
test("confirmation-required UI and invalid recovery links give a bilingual recovery path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByRole("button", { name: "New here? Create an account", exact: true })
    .click();
  await page.route("**/api/auth/sign-up", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { user: null, confirmationRequired: true },
      }),
    }),
  );
  await page.locator("#email").fill("synthetic-confirmation@example.invalid");
  await page.locator("#password").fill("Synthetic-confirmation-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText(
      "Check your email to confirm your account, then return here to sign in.",
    ),
  ).toBeVisible();
  await page.goto(
    "/api/auth/callback?code=synthetic-invalid-code&flow=recovery",
  );
  await expect(page.getByText(/This link is invalid, expired/)).toBeVisible();
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.getByText(/Hindi wasto, paso na/)).toBeVisible();
  await page
    .locator("#recovery-value")
    .fill("synthetic-recovery@example.invalid");
  await page.route("**/api/auth/recovery", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { requested: true } }),
    }),
  );
  await page
    .getByRole("button", { name: "Ipadala ang recovery link", exact: true })
    .click();
  await expect(page.getByText(/Kung may account ang address/)).toBeVisible();
  await page.screenshot({
    path: "test-results/root-phone-recovery.png",
    fullPage: true,
  });
});
test("production public shell reopens offline and keeps a device draft without caching private responses", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.E2E_PRODUCTION,
    "Run against a production build with E2E_PRODUCTION=1.",
  );
  await page.setViewportSize({ width: 390, height: 700 });
  await login(page);
  const id = randomUUID(),
    name = "Synthetic offline Quezon City " + id.slice(0, 6);
  const result = await page.request.post("/api/businesses", {
    headers: { Origin: origin },
    data: { id, name, activity: "products" },
  });
  expect(result.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  await menu(page);
  await page.locator("#account-business").selectOption(id);
  await expect(page.locator("#home-question")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(
      () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      { timeout: 15000 },
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#home-question")).toBeVisible();
  await page.getByTestId("record-sale").click();
  await page.locator("#amount").fill("19.");
  await expect(
    page.getByText("Draft saved on this device", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save for later", exact: true })
    .click();
  await expect(page.locator(".resume-card")).toHaveCount(1);
  const urls = await page.evaluate(async () => {
    const results: string[] = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        results.push(new URL(request.url).pathname);
    return results;
  });
  expect(
    urls.some(
      (path) => path.startsWith("/api/") || path.startsWith("/recover"),
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/root-offline-phone.png",
    fullPage: true,
  });
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator("#home-question")).toBeVisible();
  await page.getByTestId("resume-draft").click();
  await expect(page.locator("#amount")).toHaveValue("19.");
});
