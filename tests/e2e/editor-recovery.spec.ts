import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
test.skip(
  !process.env.E2E_PASSWORD || !process.env.E2E_EMAIL_A,
  "Requires isolated synthetic account.",
);
async function failEditorWrites(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(globalThis, "__restoreEditorWrites", {
      configurable: true,
      value: () => {
        IDBObjectStore.prototype.put = original;
      },
    });
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "editors")
        throw new DOMException(
          "Synthetic editor storage quota",
          "QuotaExceededError",
        );
      return original.apply(this, args);
    };
  });
}
async function restoreEditorWrites(page: Page) {
  await page.evaluate(() => {
    (
      globalThis as typeof globalThis & { __restoreEditorWrites: () => void }
    ).__restoreEditorWrites();
  });
}
test("raw correction and preparation drafts survive storage quota failures and guarded navigation", async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.locator("#email").fill(process.env.E2E_EMAIL_A!);
  await page.locator("#password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  const businessId = randomUUID(),
    otherBusinessId = randomUUID();
  for (const id of [businessId, otherBusinessId]) {
    expect(
      (
        await page.request.post("/api/businesses", {
          headers: { Origin: origin },
          data: {
            id,
            name: "Synthetic quota recovery " + id.slice(0, 6),
            activity: "services",
          },
        })
      ).status(),
    ).toBe(200);
  }
  const created = await page.request.post("/api/ledger", {
    headers: { Origin: origin },
    data: {
      businessId,
      operationId: randomUUID(),
      action: "create",
      expectedRevision: 0,
      values: {
        businessDate: "2026-10-23",
        kind: "sale",
        amountCentavos: "10000",
        description: "Synthetic correction recovery",
        paymentStatus: "unpaid",
        paymentAmountCentavos: null,
        paymentDate: null,
      },
    },
  });
  expect(created.status()).toBe(200);
  await page.reload();
  await page.getByTestId("account-menu").click();
  await page.locator("#account-business").selectOption(businessId);
  await page.getByRole("button", { name: "Find records", exact: true }).click();
  await page
    .getByRole("button", { name: "Synthetic correction recovery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Correct this record", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review change", exact: true }),
  ).toBeEnabled();
  await failEditorWrites(page);
  await page.getByLabel("Amount", { exact: false }).first().fill("12.");
  await page
    .getByLabel(/Why are you changing this/)
    .fill("Synthetic unfinished quota correction");
  await expect(
    page.getByText(
      "This device could not preserve the reviewed change. Keep this page open and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.getByLabel("Amount", { exact: false }).first()).toHaveValue(
    "12.",
  );
  await expect(page.locator("#home-question")).toHaveCount(0);
  await page.getByTestId("account-menu").click();
  await page.locator("#account-business").selectOption(otherBusinessId);
  await expect(page.locator("#account-business")).toHaveValue(businessId);
  await expect(page.getByLabel(/Why are you changing this/)).toHaveValue(
    "Synthetic unfinished quota correction",
  );
  await page.getByTestId("account-menu").click();
  await page
    .getByRole("button", { name: "Prepare your records", exact: true })
    .click();
  await expect(page.getByLabel("Amount", { exact: false }).first()).toHaveValue(
    "12.",
  );
  await restoreEditorWrites(page);
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator("#home-question")).toBeVisible();
  await page.getByRole("button", { name: "Find records", exact: true }).click();
  await page
    .getByRole("button", { name: "Synthetic correction recovery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Correct this record", exact: true })
    .click();
  await expect(page.getByLabel("Amount", { exact: false }).first()).toHaveValue(
    "12.",
  );
  await expect(page.getByLabel(/Why are you changing this/)).toHaveValue(
    "Synthetic unfinished quota correction",
  );
  await page
    .getByRole("button", { name: "Prepare your records", exact: true })
    .click();
  const evidence = page.getByLabel(
    "Where can you find the supporting evidence?",
    { exact: false },
  );
  await expect(evidence).toBeEnabled();
  await failEditorWrites(page);
  await evidence.fill("Synthetic unsaved evidence reference");
  await expect(
    page.getByText(
      "This device could not save these answers. Keep the page open and save them to your account.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(evidence).toHaveValue("Synthetic unsaved evidence reference");
  await page.getByTestId("account-menu").click();
  await page.locator("#account-business").selectOption(otherBusinessId);
  await expect(page.locator("#account-business")).toHaveValue(businessId);
  await page.getByTestId("account-menu").click();
  await restoreEditorWrites(page);
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator("#home-question")).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare records", exact: true })
    .click();
  await expect(
    page.getByLabel("Where can you find the supporting evidence?", {
      exact: false,
    }),
  ).toHaveValue("Synthetic unsaved evidence reference");
});
