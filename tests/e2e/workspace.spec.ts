import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

test.skip(
  !process.env.E2E_PASSWORD ||
    !process.env.E2E_EMAIL_A ||
    !process.env.E2E_EMAIL_B,
  "Requires isolated synthetic accounts; see README.",
);

async function signIn(page: Page, email = process.env.E2E_EMAIL_A!) {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
}
async function openMenu(page: Page) {
  const menu = page.locator(".account-menu");
  if (!(await menu.evaluate((node) => (node as HTMLDetailsElement).open)))
    await page.getByTestId("account-menu").click();
}
async function chooseBusiness(page: Page, id: string) {
  await openMenu(page);
  await page.locator("#account-business").selectOption(id);
  await expect(page.locator("#home-question")).toBeVisible();
}
async function newBusiness(
  page: Page,
  task: "sale" | "expense" | "home" = "sale",
) {
  const name = `Synthetic guided business ${randomUUID().slice(0, 6)}`;
  await expect(
    page.locator("#home-question, #setup-business-name").first(),
  ).toBeVisible();
  if (await page.locator("#home-question").count()) {
    await openMenu(page);
    await page
      .getByRole("button", { name: "Add a business", exact: true })
      .click();
  }
  await page.locator("#setup-business-name").fill(name);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .locator('input[name="businessActivity"][value="products"]')
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (task === "home")
    await page.getByRole("button", { name: "Later", exact: true }).click();
  else
    await page
      .getByTestId(task === "sale" ? "record-sale" : "record-expense")
      .click();
  await expect(
    page.locator(task === "home" ? "#home-question" : "#amount"),
  ).toBeVisible();
  const data = await (await page.request.get("/api/businesses")).json();
  const business = data.data.businesses.find(
    (item: { name: string }) => item.name === name,
  );
  expect(business).toMatchObject({
    activity: "products",
    setupCompleted: true,
  });
  return business as { id: string; name: string };
}
async function amount(page: Page, value = "1250.50", note?: string) {
  await page.locator("#amount").fill(value);
  await page.locator("#businessDate").fill("2026-10-23");
  if (note) {
    await page
      .getByRole("button", { name: "Add a detail (optional)", exact: true })
      .click();
    await page.locator("#description").fill(note);
  }
}
async function continueStep(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function payment(
  page: Page,
  answer: "paid" | "unpaid" | "unknown" | "partial",
) {
  await page.locator(`input[name="payment"][value="${answer}"]`).check();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await page.locator(".guided-progress").count())
      ? await page
          .locator(".guided-progress")
          .evaluate((node) => node.scrollWidth <= node.clientWidth)
      : true,
  ).toBe(true);
}

test("phone setup preserves language and back navigation, then returning owner skips setup", async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_GUIDED_EMAIL,
    "Requires fresh first-use fixture from prepare-guided-e2e.",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await signIn(page, process.env.E2E_GUIDED_EMAIL!);
  await expect(
    page.locator("#setup-business-name, #home-question").first(),
  ).toBeVisible();
  // A fresh fixture tests first sign-in. Reusing it still exercises the same
  // guided setup through Add a business without requiring destructive resets.
  if (await page.locator("#home-question").count()) {
    await openMenu(page);
    await page
      .getByRole("button", { name: "Add a business", exact: true })
      .click();
  }
  await expect(page.locator("#setup-business-name")).toBeVisible();
  await expect(page.locator("#home-question")).toHaveCount(0);
  await expect(page.locator(".record-list")).toHaveCount(0);
  await page.locator("#setup-business-name").fill("Synthetic Mila's services");
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#setup-business-name")).toHaveValue(
    "Synthetic Mila's services",
  );
  await page.getByRole("button", { name: "Magpatuloy", exact: true }).click();
  await page
    .locator('input[name="businessActivity"][value="services"]')
    .check();
  await page.getByRole("button", { name: "Bumalik", exact: true }).click();
  await expect(page.locator("#setup-business-name")).toHaveValue(
    "Synthetic Mila's services",
  );
  await page.getByRole("button", { name: "Magpatuloy", exact: true }).click();
  await expect(page.locator('input[value="services"]')).toBeChecked();
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/setup-phone-tagalog.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Magpatuloy", exact: true }).click();
  await page.getByRole("button", { name: "Mamaya na", exact: true }).click();
  await expect(page.locator("#home-question")).toHaveText(
    "Ano ang gusto mong gawin?",
  );
  await expect(page.getByTestId("record-sale")).toBeEnabled();
  await expect(page.getByTestId("record-expense")).toBeEnabled();
  await page.reload();
  await expect(page.locator("#home-question")).toHaveText(
    "Ano ang gusto mong gawin?",
  );
  await expect(page.locator("#setup-business-name")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ihanda ang mga tala", exact: true }),
  ).toBeVisible();
});

test("phone sale: translated validation, back navigation, automatic draft reopen, reviewed paid record", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  const business = await newBusiness(page);
  await continueStep(page);
  await expect(page.locator("#amount-error")).toHaveText(
    "Please fill in this field.",
  );
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#amount-error")).toHaveText(
    "Pakilagyan ang field na ito.",
  );
  await page.getByRole("button", { name: "English", exact: true }).click();
  await amount(page, "1250.50", "Synthetic daily sale");
  await expect(page.locator("#kind, #moneyMovement")).toHaveCount(0);
  await continueStep(page);
  await expect(page.locator("#entry-title")).toHaveText(
    "Has the customer paid?",
  );
  await payment(page, "paid");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator("#amount")).toHaveValue("1250.50");
  await continueStep(page);
  await expect(page.locator('input[value="paid"]')).toBeChecked();
  await expect(
    page.getByText("Draft saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await chooseBusiness(page, business.id);
  await page.getByTestId("resume-draft").click();
  await expect(page.locator("#entry-title")).toHaveText(
    "Has the customer paid?",
  );
  await expect(page.locator('input[value="paid"]')).toBeChecked();
  await page.screenshot({
    path: "test-results/sale-payment-phone.png",
    fullPage: true,
  });
  await continueStep(page);
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.locator("#entry-title")).toHaveText(
    "Tama ba ang mga detalye?",
  );
  await expect(page.locator(".review-amount")).toHaveText("₱1,250.50");
  await page
    .getByRole("button", { name: "I-save ang benta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Magdagdag ulit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bumalik sa simula", exact: true })
    .last()
    .click();
  await expect(page.locator(".record-item")).toHaveCount(1);
  await page.reload();
  await chooseBusiness(page, business.id);
  await expect(page.locator(".record-item")).toContainText("₱1,250.50");
  const records = (
    await (
      await page.request.get(`/api/transactions?businessId=${business.id}`)
    ).json()
  ).data.records;
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    kind: "sale",
    amountCentavos: "125050",
    moneyMovement: "in",
  });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("expense has its own questions and exact unpaid save; pristine entry returns home without a blocking draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const business = await newBusiness(page, "home");
  await page.getByTestId("record-sale").click();
  await expect(page.locator("#amount")).toBeVisible();
  await page
    .getByRole("button", { name: "Save for later", exact: true })
    .click();
  await expect(page.getByTestId("resume-draft")).toHaveCount(0);
  await expect(page.getByTestId("record-expense")).toBeEnabled();
  await page.getByTestId("record-expense").click();
  await expect(page.locator("#entry-title")).toHaveText(
    "How much was the expense?",
  );
  await amount(page, "0.10");
  await continueStep(page);
  await expect(page.locator("#entry-title")).toHaveText(
    "Have you paid for this?",
  );
  await payment(page, "unpaid");
  await continueStep(page);
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(
    page.getByText("Your expense is saved", { exact: true }),
  ).toBeVisible();
  const records = (
    await (
      await page.request.get(`/api/transactions?businessId=${business.id}`)
    ).json()
  ).data.records;
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    kind: "expense",
    amountCentavos: "10",
    moneyMovement: "none",
  });
});

test("narrow phone offline: incomplete partial payment is preserved and an explicit unknown remains unknown", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await signIn(page);
  const business = await newBusiness(page);
  await amount(page, "250.00");
  await continueStep(page);
  await context.setOffline(true);
  await payment(page, "partial");
  await page.locator("#paymentAmount").fill("25.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#entry-title")).toHaveText(
    "Has the customer paid?",
  );
  await expect(
    page.getByRole("button", { name: "Save sale", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Draft saved on this device", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/partial-draft-phone-tagalog.png",
    fullPage: true,
  });
  await context.setOffline(false);
  await page.reload();
  await chooseBusiness(page, business.id);
  await page.getByTestId("resume-draft").click();
  await expect(page.locator('input[value="partial"]')).toBeChecked();
  await expect(page.locator("#paymentAmount")).toHaveValue("25.");
  const records = (
    await (
      await page.request.get(`/api/transactions?businessId=${business.id}`)
    ).json()
  ).data.records;
  expect(records).toEqual([]);
  await payment(page, "unknown");
  await page.getByRole("button", { name: "Magpatuloy", exact: true }).click();
  await page
    .getByRole("button", { name: "I-save ang benta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Magdagdag ulit", exact: true }),
  ).toBeVisible();
  const saved = (
    await (
      await page.request.get(`/api/transactions?businessId=${business.id}`)
    ).json()
  ).data.records;
  expect(saved[0].moneyMovement).toBe("unknown");
});

test("laptop: lost acknowledgement reloads into home and retries exactly one sale", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  const business = await newBusiness(page);
  await amount(page, "125.25");
  await continueStep(page);
  await payment(page, "paid");
  await continueStep(page);
  let lost = false;
  const operationIds: string[] = [];
  await page.route("**/api/ledger", async (route) => {
    if (route.request().method() === "POST")
      operationIds.push(route.request().postDataJSON().operationId);
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save sale", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry account save", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change amount or date", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await chooseBusiness(page, business.id);
  // The reviewed immutable operation now reconciles automatically when Home resumes.
  await expect(page.getByTestId("resume-draft")).toHaveCount(0);
  await expect(page.locator(".record-item")).toHaveCount(1);
  expect(operationIds.length).toBeGreaterThanOrEqual(2);
  expect(new Set(operationIds).size).toBe(1);
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/sale-saved-laptop.png",
    fullPage: true,
  });
  expect(
    (
      await (
        await page.request.get(`/api/transactions?businessId=${business.id}`)
      ).json()
    ).data.records,
  ).toHaveLength(1);
});

test("account and cross-tab changes preserve raw drafts for the original owner", async ({
  page,
  context,
}) => {
  await signIn(page);
  const business = await newBusiness(page);
  await page.locator("#amount").fill("12.");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator("#home-question")).toBeVisible();
  await openMenu(other);
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("#email")).toBeVisible();
  await page.locator("#email").fill(process.env.E2E_EMAIL_B!);
  await page.locator("#password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#home-question")).toBeVisible();
  await openMenu(page);
  await expect(page.locator("#account-business")).not.toContainText(
    business.name,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.locator("#email").fill(process.env.E2E_EMAIL_A!);
  await page.locator("#password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await chooseBusiness(page, business.id);
  await page.getByTestId("resume-draft").click();
  await expect(page.locator("#amount")).toHaveValue("12.");
  await other.close();
});

test("legacy accepted pending contribution keeps original meaning and safe retry", async ({
  page,
}) => {
  await signIn(page);
  const business = await newBusiness(page, "home");
  const session = (await (await page.request.get("/api/session")).json()).data;
  const operationId = randomUUID();
  const command = {
    businessId: business.id,
    operationId,
    payload: {
      version: 1,
      businessDate: "2026-10-23",
      kind: "owner_contribution",
      amountCentavos: "50000",
      description: "Synthetic original contribution",
      moneyMovement: "in",
      reviewConfirmed: true,
      expectedRevision: 0,
    },
  };
  const response = await page.request.post("/api/transactions", {
    headers: { Origin: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
    data: command,
  });
  expect(response.status()).toBe(200);
  await page.evaluate(
    async ({ userId, businessId, operationId, command }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("msme-manual-drafts-v1");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("entries", "readwrite");
          tx.objectStore("entries").put({
            userId,
            businessId,
            operationId,
            draft: {
              amount: "500.00",
              businessDate: "2026-10-23",
              kind: "owner_contribution",
              description: "Synthetic original contribution",
              moneyMovement: "in",
            },
            step: "review",
            pendingCommand: command,
            savedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { userId: session.user.id, businessId: business.id, operationId, command },
  );
  await page.reload();
  await chooseBusiness(page, business.id);
  await expect(page.getByTestId("resume-draft")).toHaveCount(0);
  await expect(page.locator(".record-item")).toHaveCount(1);
  await expect(page.locator(".record-item")).toContainText(
    "Owner contribution",
  );
  const saved = (
    await (
      await page.request.get(`/api/transactions?businessId=${business.id}`)
    ).json()
  ).data.records;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    kind: "owner_contribution",
    amountCentavos: "50000",
    moneyMovement: "in",
  });
});

test("touch phone: reduced keyboard viewport, visible skip link, unsent discard, and rename", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await signIn(page);
    const business = await newBusiness(page);
    await page.locator(".skip-link").focus();
    await expect(page.locator(".skip-link")).toBeVisible();
    const skip = await page.locator(".skip-link").boundingBox();
    const header = await page.locator(".app-header").boundingBox();
    expect(skip!.y + skip!.height).toBeLessThanOrEqual(header!.y);
    await page.locator("#amount").focus();
    await page.setViewportSize({ width: 360, height: 390 });
    await page.locator("#amount").fill("22.25");
    expect(
      await page
        .locator("#amount")
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    const next = page.getByRole("button", { name: "Continue", exact: true });
    await next.scrollIntoViewIfNeeded();
    const box = await next.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(390);
    await next.click();
    await payment(page, "partial");
    await page
      .getByRole("button", { name: "Save for later", exact: true })
      .click();
    await expect(page.getByTestId("resume-draft")).toBeVisible();
    await page.locator(".discard-draft summary").click();
    await page.getByTestId("discard-draft").click();
    await expect(page.getByTestId("record-expense")).toBeEnabled();
    await expect(page.getByTestId("resume-draft")).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 740 });
    await openMenu(page);
    await page
      .getByRole("button", { name: "Change business name", exact: true })
      .click();
    await page.locator("#rename-business").fill("Synthetic owner-renamed shop");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(
      page.getByText("Business name updated.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to home", exact: true })
      .click();
    await expect(page.locator(".current-business")).toContainText(
      "Synthetic owner-renamed shop",
    );
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/home-touch-phone.png",
      fullPage: true,
    });
    const data = (await (await page.request.get("/api/businesses")).json())
      .data;
    expect(
      data.businesses.find((item: { id: string }) => item.id === business.id),
    ).toMatchObject({
      name: "Synthetic owner-renamed shop",
      profileRevision: 2,
    });
  } finally {
    await context.close();
  }
});
